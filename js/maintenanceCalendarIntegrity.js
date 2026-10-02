(function(root,factory){
  const api=factory(typeof module==="object"&&module.exports?require("./historicalImport"):root.OMAXHistoricalImport,typeof module==="object"&&module.exports?require("./maintenanceRecoveryImport"):root.OMAXMaintenanceRecoveryImport);
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXMaintenanceCalendarIntegrity=api;
})(typeof window==="undefined"?null:window,function(history,maintenance){
  "use strict";
  const clone=value=>JSON.parse(JSON.stringify(value));
  const keys=maintenance.keys;
  const list=(state,key)=>Array.isArray(state?.[key])?state[key]:[];
  const text=value=>String(value??"").slice(0,160);
  const hours=value=>value==null||value===""?null:Number.isFinite(Number(value))?Number(value):null;
  function resolveOneTime(state,rootId,scheduled){
    const events=list(state,"maintenanceOccurrencesV2"),root=String(rootId||"");
    const roots=events.filter(event=>event?.eventType==="scheduled"&&String(event.id)===root);
    if(roots.length===1){
      if((scheduled?.instanceId&&String(scheduled.instanceId)!==String(roots[0].instanceId))||(scheduled?.taskId&&String(scheduled.taskId)!==String(roots[0].taskId)))return{status:"scheduled",note:"",hours:null,displayDateISO:scheduled?.effectiveDateISO||null};
      scheduled={...roots[0],...scheduled};
    }
    let status="scheduled",note=String(scheduled?.payload?.note||""),logged=hours(scheduled?.payload?.hours),displayDateISO=scheduled?.effectiveDateISO||scheduled?.dateISO||null;
    const relevant=events.map((entry,index)=>({entry,index})).filter(({entry})=>entry&&entry.id!==root&&String(entry.instanceId||"")===String(scheduled?.instanceId||"")&&String(entry.taskId||"")===String(scheduled?.taskId||"")&&String(entry.rootOccurrenceId||entry.supersedesEventId||"")===root);
    relevant.sort((a,b)=>{
      const at=Date.parse(a.entry.recordedAtISO||""),bt=Date.parse(b.entry.recordedAtISO||"");
      if(Number.isFinite(at)&&Number.isFinite(bt)&&at!==bt)return at-bt;
      if(Number.isFinite(at)!==Number.isFinite(bt))return Number.isFinite(at)?1:-1;
      // Native actions prepend; equal-time newer actions have the smaller index.
      return b.index-a.index;
    });
    for(const {entry}of relevant){
      const type=String(entry.eventType||"");
      if(type==="completed"){
        status="completed";
        if(Object.hasOwn(entry,"loggedHours"))logged=hours(entry.loggedHours);
        else if(Object.hasOwn(entry.payload||{},"hours"))logged=hours(entry.payload.hours);
        if(Object.hasOwn(entry,"note"))note=String(entry.note||"");
      }
      if(type==="uncompleted")status="scheduled";
      if(type==="skipped"||type==="removed")status=type;
      if(type==="moved"&&entry.payload?.toDateISO)displayDateISO=entry.payload.toDateISO;
      if(type==="note_set"&&Object.hasOwn(entry.payload||{},"note"))note=String(entry.payload.note||"");
      if(type==="hours_set"&&Object.hasOwn(entry.payload||{},"hours"))logged=hours(entry.payload.hours);
    }
    return{status,note,hours:logged,displayDateISO};
  }
  function inspect(state,{dateISO=null,recoveryOnly=false,limit=100,projectedRepeatRows=[]}={}){
    const tasks=list(state,"maintenanceTasksV2"),instances=list(state,"maintenanceCalendarInstancesV2"),events=list(state,"maintenanceOccurrencesV2");
    const totals={scheduledOnly:0,completedWithScheduledRoot:0,completedWithoutScheduledRoot:0,duplicateCompleted:0,oneTimeRecoveryCompleted:0,recurringScheduled:0,orphanedInstances:0},rows=[],warnings=[];
    const cap=Math.max(1,Math.min(200,Number(limit)||100));
    const selected=event=>{
      const root=event.eventType==="scheduled"?event:rootFor(event);
      const display=root?resolveOneTime(state,root.id,root).displayDateISO:null;
      return(!dateISO||String(event.effectiveDateISO||event.dateISO||"")===dateISO||display===dateISO)&&(!recoveryOnly||event.recoveryImportId||event.import_event_id);
    };
    const warn=(code,id)=>{if(warnings.length<100)warnings.push({code,id:text(id)});};
    for(const [name,collection]of [["task",tasks],["instance",instances],["event",events]]){
      const seen=new Set();for(const row of collection){if(!row?.id)continue;if(seen.has(row.id))warn(`duplicate_${name}_id`,row.id);seen.add(row.id);}
    }
    const completions=events.filter(event=>event?.eventType==="completed");
    const rootFor=event=>events.find(root=>root?.eventType==="scheduled"&&String(root.id)===String(event.rootOccurrenceId||event.supersedesEventId||"")&&String(root.instanceId)===String(event.instanceId)&&String(root.taskId)===String(event.taskId));
    const add=(event,root=null)=>{
      const instance=instances.find(row=>String(row?.id)===String(event.instanceId)),task=tasks.find(row=>String(row?.id)===String(event.taskId));
      const completed=events.filter(row=>row?.eventType==="completed"&&rootFor(row)===root&&root),resolved=root&&instance?.instanceMode==="one_time"?resolveOneTime(state,root.id,root):null;
      const repeatRule=instance?.repeatRule==null?null:Object.fromEntries(["basis","every","intervalHours","endType","endDateISO","endCount"].filter(key=>Object.hasOwn(instance.repeatRule,key)).map(key=>{const value=instance.repeatRule[key];return[key,value==null||typeof value==="boolean"||typeof value==="number"?value:text(value)];}));
      const reopened=events.some(row=>row?.eventType==="uncompleted"&&String(row.rootOccurrenceId||row.supersedesEventId||"")===String(root?.id)&&row.instanceId===event.instanceId&&row.taskId===event.taskId);
      rows.push({taskName:text(event.taskName||task?.name),taskId:text(event.taskId),legacyTaskId:text(event.legacyTaskId||instance?.legacyTaskId||task?.legacyTaskId),instanceId:text(event.instanceId),instanceMode:text(instance?.instanceMode),repeatRule,scheduledEventId:text(root?.id),completedEventId:text(completed[0]?.id||(event.eventType==="completed"?event.id:"")),rootOccurrenceId:text(event.rootOccurrenceId||root?.id),supersedesEventId:text(completed[0]?.supersedesEventId||event.supersedesEventId),eventType:text(event.eventType),effectiveDate:text(resolved?.displayDateISO||event.effectiveDateISO||event.dateISO),import_event_id:text(completed[0]?.import_event_id||event.import_event_id),recoveryImportId:text(event.recoveryImportId),loggedHours:resolved?.hours??hours(event.loggedHours??event.payload?.hours),completedCounterpartExists:completed.length>0,rendererCompleted:resolved?.status==="completed",recurringScheduled:instance?.instanceMode==="repeat"&&event.eventType==="scheduled"&&!completed.length,warnings:!instance?["missing_instance"]:!task?["missing_task"]:completed.length>1&&!reopened?["duplicate_completed"]:[]});
    };
    for(const root of events.filter(event=>event?.eventType==="scheduled"&&selected(event))){
      const completed=completions.filter(event=>rootFor(event)===root),instance=instances.find(row=>row?.id===root.instanceId);
      if(!completed.length)totals.scheduledOnly++;
      else{totals.completedWithScheduledRoot+=completed.length;if(completed.length>1&&!events.some(event=>event?.eventType==="uncompleted"&&String(event.rootOccurrenceId||event.supersedesEventId||"")===String(root.id)&&event.instanceId===root.instanceId&&event.taskId===root.taskId)){totals.duplicateCompleted+=completed.length-1;warn("duplicate_completed",root.id);}}
      if(instance?.instanceMode==="one_time"&&instance.repeatRule==null&&completed.some(event=>event.import_event_id))totals.oneTimeRecoveryCompleted++;
      if(instance?.instanceMode==="repeat"&&!completed.length)totals.recurringScheduled++;
      add(root,root);
    }
    for(const completed of completions.filter(selected))if(!rootFor(completed)){totals.completedWithoutScheduledRoot++;warn("completed_without_scheduled_root",completed.id);add(completed);}
    const unknown=new Set(events.filter(event=>event?.instanceId&&!instances.some(instance=>instance?.id===event.instanceId)&&selected(event)).map(event=>event.instanceId));
    totals.orphanedInstances=unknown.size;for(const id of unknown)warn("missing_instance",id);
    for(const instance of instances)if(instance?.instanceMode==="one_time"&&!events.some(event=>event?.instanceId===instance.id)&&(!dateISO||instance.startDateISO===dateISO)&&(!recoveryOnly||instance.recoveryImportId)){totals.orphanedInstances++;warn("instance_without_events",instance.id);}
    if(!recoveryOnly)for(const view of projectedRepeatRows)if(view?.mode==="repeat_v2"&&(!dateISO||view.dateISO===dateISO)&&view.status!=="completed"&&!rows.some(row=>row.rootOccurrenceId===view.id)){
      totals.recurringScheduled++;const instance=instances.find(row=>row?.id===view.instanceId);add({id:view.id,taskId:view.taskId||instance?.taskId,instanceId:view.instanceId,eventType:"scheduled",effectiveDateISO:view.dateISO,taskName:view.name});
      rows[rows.length-1].rootOccurrenceId=text(view.id);rows[rows.length-1].recurringScheduled=true;
    }
    return{dateISO,recoveryOnly,totals,rows:rows.slice(0,cap),totalRows:rows.length,truncated:rows.length>cap,warnings};
  }
  const normalized=state=>{
    const result=history.normalizeBusinessForComparison(state);
    for(const key of keys)result[key]=history.normalizeDestinationForVerification("maintenance",result[key]);
    return result;
  };
  const key=value=>history.canonical(value);
  const unrelated=state=>Object.fromEntries(Object.entries(normalized(state)).filter(([name])=>!keys.includes(name)));
  function validateAppend(before,after){
    if(key(unrelated(before))!==key(unrelated(after)))throw Error("Unrelated business state changed during maintenance action.");
    for(const name of keys){
      if(!Array.isArray(after[name])||!Array.isArray(before[name]))throw Error("Maintenance collection is unavailable.");
      const ids=new Set();for(const row of after[name]){if(!row?.id||ids.has(row.id))throw Error("Maintenance identity is missing or duplicated.");ids.add(row.id);}
      const prior=new Set(before[name].map(row=>row.id));
      if(key(after[name].filter(row=>prior.has(row.id)))!==key(before[name]))throw Error("Existing maintenance records changed during append.");
    }
  }
  function createMutationRunner(env){
    let busy=false;
    return async function run(change){
      if(busy||!env.canWrite())return{saved:false,error:"A writable baseline and one maintenance action at a time are required."};
      busy=true;let before,staged,checkpoint,applied=false,committed=false;
      try{
        before=clone(env.state());const cloud=await env.readCloud();
        if(!cloud||cloud.syncMeta?.rev!==env.loadedRevision()||!env.canWrite()||key(normalized(before))!==key(normalized(cloud))||key(normalized(before))!==key(normalized(env.state())))throw Error("Maintenance baseline changed. Reload before retrying.");
        checkpoint=env.checkpoint?.();applied=true;const created=change();staged=clone(env.state());validateAppend(before,staged);
        if(key(normalized(before))===key(normalized(staged)))return{saved:true,noChange:true,created};
        let result;
        try{result=await env.save({expectedRevision:cloud.syncMeta.rev});}catch(error){env.suspend("Maintenance save threw with unknown outcome.");return{saved:false,indeterminate:true,error:String(error?.message||error)};}
        committed=result?.saved===true&&result?.stateWriteCompleted===true;
        if(!committed){
          if(result?.indeterminate||result?.stateWriteAttempted===true&&!result?.definiteFailure){env.suspend("Maintenance save outcome is unknown; verify before retrying.");return{saved:false,indeterminate:true,error:result?.error||"Maintenance save outcome is unknown."};}
          throw Error(result?.error||"Maintenance save was rejected.");
        }
        const verified=await env.readCloud();
        if(key(normalized(verified||{}))!==key(normalized(staged)))throw Error("Saved maintenance action failed exact server verification.");
        return{saved:true,created};
      }catch(error){
        const message=String(error?.message||error);
        if(committed){env.suspend(message);return{saved:false,indeterminate:true,error:message};}
        if(applied){
          try{
            const current=env.state();validateAppend(before,current);
            if(staged&&key(normalized(current))!==key(normalized(staged)))throw Error("Maintenance state changed while saving; preserve evidence.");
            const rollback=maintenance.rollback(current,staged||current,before);
            for(const name of keys)env.apply(name,rollback[name]);
            if(key(normalized(env.state()))!==key(normalized(before)))throw Error("Exact maintenance rollback could not be verified.");
            env.restoreCheckpoint?.(checkpoint);
            return{saved:false,rollbackCompleted:true,error:message};
          }catch(rollbackError){env.suspend(String(rollbackError?.message||rollbackError));return{saved:false,rollbackReviewRequired:true,error:message+" "+String(rollbackError?.message||rollbackError)};}
        }
        return{saved:false,error:message};
      }finally{busy=false;}
    };
  }
  return Object.freeze({resolveOneTime,inspect,createMutationRunner});
});
