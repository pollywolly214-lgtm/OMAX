(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXMaintenanceCalendarCancellation=api;
})(typeof window==="undefined"?null:window,function(){
  "use strict";
  const clone=value=>JSON.parse(JSON.stringify(value));
  const key=value=>value===undefined?"undefined":value===null||typeof value!=="object"?JSON.stringify(value):Array.isArray(value)?"["+value.map(key).join(",")+"]":"{"+Object.keys(value).sort().map(name=>JSON.stringify(name)+":"+key(value[name])).join(",")+"}";
  const id=value=>typeof value==="string"&&value.length>0&&value===value.trim();
  const date=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+"T00:00:00Z"))&&new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value;
  const lists=["tasksInterval","tasksAsReq"],scopes=["single","future","all"];
  const tasks=state=>[...lists.flatMap(name=>Array.isArray(state?.[name])?state[name]:[]),...(Array.isArray(state?.deletedItems)?state.deletedItems:[]).filter(row=>row?.type==="task").map(row=>row.payload)];
  const unique=(rows,value)=>{const matches=rows.filter(row=>row?.id===value);if(!id(value)||matches.length!==1)throw Error("An exact unique maintenance identity is required.");return matches[0];};
  function integrity(state){
    const blockers=[],owners=tasks(state),seen=new Set();
    for(const owner of owners){
      if(owner?.calendarCancellations===undefined)continue;
      if(!Array.isArray(owner.calendarCancellations)){blockers.push("Invalid calendar cancellation ledger for "+owner?.id);continue;}
      for(const entry of owner.calendarCancellations){
        if(!id(entry?.id)||seen.has(entry.id)||entry.schemaVersion!==1||entry.eventType!=="calendar_cancelled"||entry.legacyTaskId!==owner.id
          ||owners.filter(task=>task?.id===entry.legacyTaskId).length!==1||!scopes.includes(entry.scope)||!date(entry.dateISO)
          ||!id(entry.actorUid)||!Number.isFinite(Date.parse(entry.recordedAtISO||"")))blockers.push("Invalid or ambiguous calendar cancellation "+(entry?.id||"(missing ID)"));
        seen.add(entry?.id);
      }
    }
    return {valid:!blockers.length,blockers};
  }
  function legacyOwners(state,legacyTaskId){
    const all=tasks(state),selected=all.find(task=>task?.id===legacyTaskId);
    if(!selected)return[];
    return all.filter(owner=>owner?.id===selected.id||(selected.templateId&&selected.templateId!==selected.id&&owner?.id===selected.templateId));
  }
  function hidden(state,{legacyTaskId,instanceId,dateISO,status}){
    const instance=instanceId?(state?.maintenanceCalendarInstancesV2||[]).find(row=>row?.id===instanceId):null;
    const definition=instance?(state?.maintenanceTasksV2||[]).find(row=>row?.id===instance.taskId):null;
    const legacy=legacyTaskId||instance?.legacyTaskId||definition?.legacyTaskId;
    return legacyOwners(state,legacy).some(owner=>(Array.isArray(owner.calendarCancellations)?owner.calendarCancellations:[]).some(entry=>{
      if(!entry)return false;
      if(entry.scope==="single")return !instanceId&&entry.dateISO===dateISO;
      if(status==="completed")return false;
      return entry.scope==="all"||entry.scope==="future"&&dateISO>=entry.dateISO;
    }));
  }
  const singleDates=(state,legacyTaskId)=>legacyOwners(state,legacyTaskId).flatMap(owner=>Array.isArray(owner.calendarCancellations)?owner.calendarCancellations.filter(entry=>entry?.scope==="single").map(entry=>entry.dateISO):[]);
  function rootBelongs(instance,root,dateISO){
    const prefix="repeat:"+instance.id+":";
    if(typeof root!=="string"||!root.startsWith(prefix))return false;
    const suffix=root.slice(prefix.length);
    return suffix===dateISO||/^slot:[1-9]\d*$/.test(suffix);
  }
  function plan(source,operation,stamp){
    if(!integrity(source).valid)throw Error("Existing cancellation evidence requires review.");
    if(!id(stamp?.id)||!id(stamp.actorUid)||!Number.isFinite(Date.parse(stamp.atISO||"")))throw Error("Cancellation accountability evidence is required.");
    const next=clone(source),changes=[];
    if(operation?.kind==="legacy"){
      if(!scopes.includes(operation.scope)||!date(operation.dateISO))throw Error("Select a valid cancellation scope and business date.");
      const owner=unique(lists.flatMap(name=>source?.[name]||[]),operation.taskId);
      if(tasks(source).filter(row=>row?.id===owner.id).length!==1)throw Error("Archived/active maintenance ownership is ambiguous.");
      if((owner.calendarCancellations||[]).some(entry=>entry.scope===operation.scope&&(entry.scope==="all"||entry.dateISO===operation.dateISO)))return {state:next,changes,noChange:true};
      const collection=lists.find(name=>source[name]?.some(row=>row.id===owner.id)),index=source[collection].findIndex(row=>row.id===owner.id);
      const entry={id:stamp.id,schemaVersion:1,eventType:"calendar_cancelled",legacyTaskId:owner.id,scope:operation.scope,dateISO:operation.dateISO,recordedAtISO:stamp.atISO,actorUid:stamp.actorUid};
      next[collection][index].calendarCancellations=[...(owner.calendarCancellations||[]).map(clone),entry];
      changes.push({path:[collection,owner.id,"calendarCancellations"],append:clone(entry)});
    }else if(operation?.kind==="repeatRemove"||operation?.kind==="repeatStop"){
      const instance=unique(source.maintenanceCalendarInstancesV2||[],operation.instanceId),definition=unique(source.maintenanceTasksV2||[],instance.taskId);
      if(instance.instanceMode!=="repeat"||operation.taskId!==definition.id||!date(operation.dateISO)||!rootBelongs(instance,operation.rootOccurrenceId,operation.dateISO))throw Error("The requested repeat root does not belong to the exact task/instance.");
      const stopping=operation.kind==="repeatStop";
      if(stopping&&instance.status==="stopped")return {state:next,changes,noChange:true};
      if(!stopping&&(source.maintenanceOccurrencesV2||[]).some(row=>row?.instanceId===instance.id&&row.taskId===definition.id&&row.rootOccurrenceId===operation.rootOccurrenceId&&row.eventType==="removed"))return {state:next,changes,noChange:true};
      const event={id:stamp.id,system:"v2",schemaVersion:2,instanceId:instance.id,taskId:definition.id,eventType:stopping?"stopped":"removed",effectiveDateISO:operation.dateISO,recordedAtISO:stamp.atISO,rootOccurrenceId:operation.rootOccurrenceId,
        ...(instance.legacyTaskId||definition.legacyTaskId?{legacyTaskId:instance.legacyTaskId||definition.legacyTaskId}:{}),payload:{source:"verified_calendar_cancellation",actorUid:stamp.actorUid}};
      next.maintenanceOccurrencesV2=[event,...clone(source.maintenanceOccurrencesV2||[])];
      changes.push({path:["maintenanceOccurrencesV2"],append:clone(event)});
      if(stopping){
        const target=next.maintenanceCalendarInstancesV2.find(row=>row.id===instance.id);
        changes.push({path:["maintenanceCalendarInstancesV2",instance.id,"status"],beforePresent:Object.hasOwn(instance,"status"),before:instance.status,after:"stopped"},{path:["maintenanceCalendarInstancesV2",instance.id,"stoppedAtISO"],beforePresent:Object.hasOwn(instance,"stoppedAtISO"),before:instance.stoppedAtISO,after:stamp.atISO});
        target.status="stopped";target.stoppedAtISO=stamp.atISO;
      }
    }else throw Error("Unsupported maintenance cancellation operation.");
    if(!integrity(next).valid)throw Error("Cancellation identity validation failed.");
    return {state:next,changes,noChange:false};
  }
  const withoutSync=state=>Object.fromEntries(Object.entries(state||{}).filter(([name])=>name!=="syncMeta"));
  function conserve(source,pending,operation,stamp){
    const intended=plan(source,operation,stamp).state;
    if(key(withoutSync(intended))!==key(withoutSync(pending)))throw Error("Cancellation changed historical records, references or unrelated state.");
    return true;
  }
  function createApi(env){
    let busy=false;
    const authorization=(source,operation)=>key({source,operation});
    const review=operation=>({operation:clone(operation),confirmation:authorization(env.local(),operation)});
    async function run(reviewed){
      if(busy||!env.canWrite())return {saved:false,error:"Wait for other saves or recovery review before cancelling maintenance."};
      busy=true;let invoked=false,acknowledged=false,transactionEvidence=null;
      const firebaseOperation = env.operations?.begin("deleting");
      try{
        await env.settle();
        const operation=clone(reviewed?.operation),target=env.captureTarget(),version=key(env.version()),source=await env.read(target);
        const unchanged=()=>env.canWrite()&&env.targetIsCurrent(target)&&version===key(env.version())&&env.matches(source);
        if(!unchanged()||reviewed.confirmation!==authorization(source,operation)||!env.validate(source))throw Error("The confirmed maintenance source changed. Review it again; no write was attempted.");
        const stamp={id:env.newId(),actorUid:env.actor(),atISO:env.now()},prepared=plan(source,operation,stamp),next=prepared.state;
        if(!env.validate(next))throw Error("Cancellation would violate maintenance identity or protected-data rules.");
        if(prepared.noChange)return {saved:true,verified:true,noChange:true};
        transactionEvidence={version:1,operation:clone(operation),operationId:stamp.id,sourceRevision:source.syncMeta.rev,target:{path:target.path,projectId:target.projectId,backend:target.backend},changes:clone(prepared.changes)};
        invoked=true;
        const result=await env.write(clone(next),source.syncMeta.rev,
          remote=>unchanged()&&key(remote)===key(source)&&env.validate(remote),
          pending=>{
            if(!unchanged()||!conserve(source,pending,operation,stamp)||key(pending)!==key(next)||!env.validate(pending))return false;
            // Core runs this final proof after protected preflight. Preserve the
            // previous backup as evidence until that preflight has accepted it.
            env.backup(source);return true;
          },target);
        invoked=result.stateWriteAttempted===true;
        if(!result.saved){if(result.indeterminate){const uncertain={...result,evidence:transactionEvidence};env.suspend(uncertain);return uncertain;}return result;}
        acknowledged=result.stateWriteCompleted===true;
        const actual=await env.read(target);
        if(!unchanged()||!result.committedState||key(actual)!==key(result.committedState)||actual.syncMeta?.rev<=source.syncMeta.rev
          ||!conserve(source,actual,operation,stamp)||!env.validate(actual))throw Error("Cancellation committed but independent verification failed; preserve evidence and verify before retrying.");
        if(env.adopt(actual)!==true)throw Error("Verified cancellation could not be safely adopted.");
        const warnings=[];
        try{env.backup(actual);}catch(error){warnings.push("Cancellation verified; local backup refresh failed: "+String(error?.message||error));}
        return {...result,verified:true,warnings,evidence:{version:1,operation:clone(operation),operationId:stamp.id,sourceRevision:source.syncMeta.rev,committedRevision:actual.syncMeta.rev,
          target:{path:target.path,projectId:target.projectId,backend:target.backend},changes:clone(prepared.changes)}};
      }catch(error){
        const result={saved:false,indeterminate:invoked,stateWriteAttempted:invoked,stateWriteCompleted:acknowledged,evidence:transactionEvidence,error:String(error?.message||error)};
        if(invoked)env.suspend(result);return result;
      }finally{busy=false;firebaseOperation?.release();}
    }
    return Object.freeze({isBusy:()=>busy,isAvailable:()=>!busy&&env.canWrite(),review,run});
  }
  return Object.freeze({key,date,integrity,hidden,singleDates,plan,conserve,createApi});
});
