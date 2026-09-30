(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXHistoricalImport=api;
})(typeof window==="undefined"?null:window,function(){
  "use strict";
  const STATUS=Object.freeze({present:"Already Present",missing:"Missing — Import",match:"Possible Match — Review",problem:"Source Problem — Review"});
  const clone=value=>JSON.parse(JSON.stringify(value));
  const canonical=value=>value===undefined?"undefined":value===null||typeof value!=="object"?JSON.stringify(value):Array.isArray(value)?"["+value.map(canonical).join(",")+"]":"{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+canonical(value[key])).join(",")+"}";
  function validDate(value){if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+"T00:00:00Z");return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
  function identity(row){
    if(typeof row.import_event_id==="string"&&row.import_event_id.trim()===row.import_event_id&&row.import_event_id.length>0&&row.import_event_id.length<=240)return row.import_event_id;
    if(typeof row.source_id==="string"&&typeof row.source_record_id==="string"&&row.source_id.trim()&&row.source_record_id.trim())return JSON.stringify([row.source_id,row.source_record_id]);
    return "";
  }
  const records=(kind,state)=>kind==="purchase"?(state.receiptTrackerWeeks||[]).flatMap(week=>week.rows||[]):state.pumpEff?.entries||[];
  const count=(kind,state)=>records(kind,state).length;
  function preview(kind,rows,state){
    if(!["purchase","pump"].includes(kind)||!Array.isArray(rows))throw Error("Choose purchase or pump and supply a JSON array of reviewed source rows.");
    const existing=records(kind,state),identities=new Map();
    rows.forEach(row=>{if(!row||typeof row!=="object")return;const id=identity(row);const group=identities.get(id)||[];group.push(row);identities.set(id,group);});
    return rows.map((source,index)=>{
      const raw=source&&typeof source==="object"&&!Array.isArray(source)?clone(source):{},id=identity(raw);
      let status=STATUS.missing,reason="Stable source ID is absent from current history; eligible for reviewed append.";
      const bad=message=>{status=STATUS.problem;reason=message;};
      if(!id)bad("A permanent import_event_id or source_id + source_record_id is required.");
      else if(!validDate(raw.date))bad("date must be an unmodified real YYYY-MM-DD source date.");
      else if(kind==="purchase"&&(typeof raw.purchased!=="string"||!raw.purchased.trim()||typeof raw.qty!=="number"||!Number.isFinite(raw.qty)||raw.qty<=0||typeof raw.cost!=="number"||!Number.isFinite(raw.cost)||raw.cost<0))bad("Purchase requires description, numeric positive qty and nonnegative unit cost.");
      else if(kind==="pump"&&(!Number.isInteger(raw.rpm)||raw.rpm<=0||typeof raw.timeISO!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.timeISO)))bad("Pump requires a positive integer rpm and exact HH:MM time; suspicious values require review.");
      else if(["shipping","tax"].some(key=>raw[key]!=null&&(typeof raw[key]!=="number"||!Number.isFinite(raw[key])||raw[key]<0)))bad("Shipping/tax must be finite nonnegative numbers.");
      else if(identities.get(id).length>1)bad("Repeated source identity within this file requires review; no row with this ID will import.");
      else {
        const same=existing.filter(item=>item.import_event_id===id);
        if(same.length===1){status=STATUS.present;reason="Permanent source ID already exists; no-op.";if(same[0].importProvenance?.sourceRecord&&canonical(same[0].importProvenance.sourceRecord)!==canonical(raw)){status=STATUS.match;reason="This source ID has different original source content; review the discrepancy.";}}
        else if(same.length>1){status=STATUS.match;reason="Current state contains repeated permanent IDs; review required.";}
        else if(existing.some(item=>kind==="pump"?item.dateISO===raw.date:(item.date===raw.date&&String(item.purchased||"").toLowerCase()===raw.purchased.toLowerCase()))){status=STATUS.match;reason=kind==="pump"?"Current pump model stores one measurement per day; an existing day must be reviewed, never replaced.":"Similar dated description exists without this source identity; review before assigning identity.";}
        else if(kind==="pump"&&rows.some((other,i)=>i!==index&&other?.date===raw.date)){status=STATUS.match;reason="Multiple source measurements on one day exceed the current daily pump model; review required.";}
      }
      return{index,raw,import_event_id:id,status,reason};
    });
  }
  function weekFor(date){
    const day=new Date(date+"T00:00:00Z"),weekday=day.getUTCDay()||7,thursday=new Date(day);thursday.setUTCDate(day.getUTCDate()+4-weekday);
    const year=thursday.getUTCFullYear(),jan4=new Date(Date.UTC(year,0,4)),first=new Date(jan4);first.setUTCDate(jan4.getUTCDate()-(jan4.getUTCDay()||7)+1);
    const monday=new Date(day);monday.setUTCDate(day.getUTCDate()-weekday+1);const end=new Date(monday);end.setUTCDate(monday.getUTCDate()+6);
    const week=Math.round((monday-first)/604800000)+1;
    return{key:`${year}-W${String(week).padStart(2,"0")}`,year,week,startISO:monday.toISOString().slice(0,10),endISO:end.toISOString().slice(0,10),rows:[]};
  }
  function append(kind,state,candidates){
    const next=clone(state);
    for(const item of candidates){
      const raw=item.raw,provenance={sourceRecord:clone(raw),originalSourceDate:raw.date,sourceId:raw.source_id||"",sourceRecordId:raw.source_record_id||"",importedAtISO:new Date().toISOString()};
      if(kind==="purchase"){
        const meta=weekFor(raw.date);let week=next.receiptTrackerWeeks.find(week=>week.key===meta.key);
        if(!week){week=meta;next.receiptTrackerWeeks.push(week);}
        week.rows.push({date:raw.date,purchased:raw.purchased,cost:raw.cost,qty:raw.qty,partNumber:String(raw.partNumber||""),shipping:raw.shipping||0,tax:raw.tax||0,inventoryItemId:"",import_event_id:item.import_event_id,importProvenance:provenance});
      }else {
        const entry={dateISO:raw.date,rpm:raw.rpm,timeISO:raw.timeISO,import_event_id:item.import_event_id,importProvenance:provenance};
        const index=next.pumpEff.entries.findIndex(existing=>existing.dateISO>entry.dateISO);
        if(index<0)next.pumpEff.entries.push(entry);else next.pumpEff.entries.splice(index,0,entry);
      }
    }
    return next;
  }
  const target=kind=>kind==="purchase"?"receiptTrackerWeeks":"pumpEff";
  const business=state=>Object.fromEntries(Object.entries(state).filter(([key])=>!["syncMeta","saveMeta","syncProcessLog"].includes(key)));
  function selectiveRollback(kind,current,staged,before,ids){
    const destination=target(kind),planned=new Set(ids);
    if(kind==="purchase"?(!Array.isArray(current.receiptTrackerWeeks)||current.receiptTrackerWeeks.some(week=>!week||!Array.isArray(week.rows))):(!current.pumpEff||!Array.isArray(current.pumpEff.entries)))throw Error("Import destination shape changed; manual verification is required.");
    for(const id of ids){
      const expected=records(kind,staged).filter(row=>row?.import_event_id===id),actual=records(kind,current).filter(row=>row?.import_event_id===id);
      if(expected.length!==1||actual.length!==1||canonical(actual[0])!==canonical(expected[0]))throw Error(`Imported record ${id} changed or is not uniquely identifiable; manual verification is required.`);
    }
    const next=clone(current[destination]);
    if(kind==="pump")next.entries=next.entries.filter(row=>!planned.has(row?.import_event_id));
    else {
      next.forEach(week=>{week.rows=week.rows.filter(row=>!planned.has(row?.import_event_id));});
      // Remove only a pristine empty container created by this import.
      return next.filter(week=>{
        if(week.rows.length||before.receiptTrackerWeeks.some(old=>old.key===week.key)||current.receiptTrackerWeeks.filter(item=>item.key===week.key).length!==1)return true;
        const created=staged.receiptTrackerWeeks.filter(item=>item.key===week.key);
        return created.length!==1||canonical({...created[0],rows:[]})!==canonical(week);
      });
    }
    return next;
  }
  function createApi(env){
    let busy=false;
    return Object.freeze({preview:(kind,rows)=>preview(kind,rows,env.state()),isBusy:()=>busy,async submit(kind,rows,{confirmed=false,reviewedPreview}={}){
      const result={saved:false,saveCompleted:false,verificationCompleted:false,indeterminate:false,rollbackCompleted:false,backupCreated:false,beforeCount:0,afterCount:0,importedIds:[],error:""};
      if(busy||!confirmed||!env.canWrite()){result.error="Explicit reviewed confirmation and a writable authoritative baseline are required.";return result;}
      busy=true;let before=null,staged=null,plannedIds=[],applied=false,committed=false;
      try {
        const current=env.state(),cloud=await env.readCloud();
        if(!cloud||cloud.syncMeta?.rev!==env.loadedRevision())throw Error("Latest authoritative baseline changed or is missing; reload before previewing.");
        if(canonical(business(current))!==canonical(business(cloud)))throw Error("Local business state differs from cloud. Save/reload and generate a fresh preview before importing.");
        const plan=preview(kind,rows,cloud);
        if(!reviewedPreview||canonical(plan)!==canonical(reviewedPreview))throw Error("The reviewed preview changed. Review a fresh reconciliation preview before confirming.");
        const ready=plan.filter(item=>item.status===STATUS.missing);
        result.beforeCount=count(kind,cloud);result.afterCount=result.beforeCount;
        if(!ready.length)return result;
        if(!env.scan||env.scan(rows).contaminated)throw Error("Source includes embedded file content or the content firewall is unavailable.");
        if(await env.backup(cloud)!==true)throw Error("Downloadable exact cloud pre-import backup is required.");
        result.backupCreated=true;
        if(canonical(business(env.state()))!==canonical(business(current)))throw Error("Local state changed during backup; review a fresh preview.");
        before=clone(current);const next=append(kind,current,ready),destination=target(kind);
        staged=clone(next);plannedIds=ready.map(item=>item.import_event_id);
        env.apply(destination,clone(next[destination]));applied=true;
        const unrelated=value=>Object.fromEntries(Object.entries(business(value)).filter(([key])=>key!==destination));
        if(canonical(unrelated(before))!==canonical(unrelated(env.state())))throw Error("Unrelated protected fields changed during staging.");
        const saved=await env.save();committed=saved?.saved===true&&saved?.stateWriteCompleted===true;
        result.indeterminate=saved?.indeterminate===true||(!committed&&saved?.stateWriteAttempted===true&&saved?.definiteFailure!==true);
        if(result.indeterminate){result.error="Save outcome is indeterminate. Writes are suspended; read/verify before retrying.";env.suspend?.(result.error);return result;}
        if(!committed)throw Error(saved?.error||"Atomic save was rejected.");
        result.saveCompleted=true;
        // Read from the server, not from local pending-write cache.
        const verified=await env.readCloud();
        result.afterCount=count(kind,verified||{});
        const expectedIds=ready.map(item=>item.import_event_id);
        if(result.afterCount!==result.beforeCount+ready.length||canonical(verified?.[destination])!==canonical(next[destination])||canonical(unrelated(verified||{}))!==canonical(unrelated(cloud))||expectedIds.some(id=>records(kind,verified||{}).filter(item=>item.import_event_id===id).length!==1))throw Error("Committed save did not pass exact cloud IDs/counts/protected-field verification; review before retrying.");
        result.saved=true;result.verificationCompleted=true;result.importedIds=expectedIds;return result;
      }catch(error){
        result.error=String(error?.message||error);
        if(applied&&!committed&&!result.indeterminate){
          try {
            const destination=target(kind),rollback=selectiveRollback(kind,env.state(),staged,before,plannedIds);
            env.apply(destination,rollback);
            if(canonical(env.state()[destination])!==canonical(rollback))throw Error("Selective rollback could not be verified; manual verification is required.");
            result.rollbackCompleted=true;result.afterCount=count(kind,env.state());
          }catch(rollbackError){
            result.rollbackReviewRequired=true;result.rollbackError=String(rollbackError?.message||rollbackError);
            result.error+=` ${result.rollbackError} Writes are suspended.`;env.suspend?.(result.error);
          }
        }
        if(committed){result.indeterminate=true;env.suspend?.(result.error);}
        return result;
      }finally{busy=false;}
    }});
  }
  return Object.freeze({STATUS,identity,preview,append,weekFor,canonical,createApi});
});
