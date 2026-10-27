(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXMaintenanceTaskArchive=api;
})(typeof window==="undefined"?null:window,function(){
  "use strict";
  const collections=["tasksInterval","tasksAsReq"],clone=value=>JSON.parse(JSON.stringify(value));
  const key=value=>value===undefined?"undefined":value===null||typeof value!=="object"?JSON.stringify(value):Array.isArray(value)?"["+value.map(key).join(",")+"]":"{"+Object.keys(value).sort().map(name=>JSON.stringify(name)+":"+key(value[name])).join(",")+"}";
  const canonical=id=>typeof id==="string"&&id.length>0&&id===id.trim();
  const entries=state=>(Array.isArray(state?.deletedItems)?state.deletedItems:[]).filter(entry=>entry?.type==="task");
  const mode=entry=>entry?.meta?.list==="asreq"||entry?.payload?.mode==="asreq"?"asreq":"interval";
  function resolve(state,id){
    if(!canonical(id))return {status:"missing",task:null};
    const active=collections.flatMap(name=>(state?.[name]||[]).filter(task=>task?.id===id));
    const archived=entries(state).filter(entry=>entry.payload?.id===id);
    if(active.length+archived.length!==1)return {status:active.length+archived.length?"ambiguous":"missing",task:null};
    return active.length?{status:"active",task:active[0]}:{status:"archived",task:archived[0].payload,entry:archived[0]};
  }
  function historicalTasks(state,listMode){
    const collection=listMode==="asreq"?"tasksAsReq":"tasksInterval";
    return [...(state?.[collection]||[]),...entries(state).filter(entry=>mode(entry)===listMode&&resolve(state,entry.payload?.id).status==="archived")
      .map(entry=>({...clone(entry.payload),name:(entry.payload.name||"Maintenance task")+" — Deleted",archivedDefinition:true}))];
  }
  function deletedFor(state,task){
    return !!task&&(resolve(state,task.legacyTaskId||task.id).status==="archived"||task.archivedDefinition===true);
  }
  const displayTask=(state,task)=>deletedFor(state,task)?{...task,name:(task.name||"Maintenance task")+" — Deleted"}:task;
  function plan(source,id,trash){
    if(!collections.every(name=>Array.isArray(source?.[name]))||!Array.isArray(source?.deletedItems))throw Error("Authoritative task lists and Trash are required.");
    const found=resolve(source,id);
    if(found.status!=="active")throw Error("Select one unique active maintenance task ID.");
    if(!canonical(trash?.id)||source.deletedItems.some(entry=>entry?.id===trash.id)||trash.type!=="task"
      ||!Number.isFinite(Date.parse(trash.deletedAt))||key(trash.payload)!==key(found.task)
      ||trash.meta?.originalId!==id)throw Error("The exact original task must be preserved in a new archive entry.");
    const collection=collections.find(name=>source[name].some(task=>task?.id===id));
    if(trash.meta.list!==(collection==="tasksAsReq"?"asreq":"interval"))throw Error("Archive task list does not match its source.");
    return {...clone(source),[collection]:clone(source[collection].filter(task=>task?.id!==id)),deletedItems:[clone(trash),...clone(source.deletedItems)]};
  }
  function planRestore(source,archiveId){
    if(!collections.every(name=>Array.isArray(source?.[name]))||!Array.isArray(source?.deletedItems))throw Error("Authoritative task lists and Trash are required.");
    const matches=source.deletedItems.filter(entry=>entry?.id===archiveId),entry=matches[0],payload=entry?.payload,meta=entry?.meta;
    const list=meta?.list??payload?.mode;
    if(!canonical(archiveId)||matches.length!==1||entry?.type!=="task"||!payload||Array.isArray(payload)||!canonical(payload.id)
      ||typeof entry.deletedAt!=="string"||!Number.isFinite(Date.parse(entry.deletedAt))
      ||(meta!==undefined&&(!meta||typeof meta!=="object"||Array.isArray(meta)))
      ||(meta?.originalId!==undefined&&meta.originalId!==payload.id)
      ||!["interval","asreq"].includes(list)||(payload.mode!==undefined&&payload.mode!==list)
      ||resolve(source,payload.id).status!=="archived")throw Error("Restore requires one valid archive with an exact original ID and unambiguous original task list; active/archived conflicts must be reviewed.");
    const collection=list==="asreq"?"tasksAsReq":"tasksInterval";
    return {...clone(source),[collection]:[...clone(source[collection]),clone(payload)],deletedItems:clone(source.deletedItems.filter(entry=>entry.id!==archiveId))};
  }
  // This projection is available only to the isolated transaction after proving
  // the entire state is exactly one intact active/archive transfer.
  function safetyBaseline(source,pending,proof){
    if(!source||!proof)return source;
    const restoring=proof.operation==="restore";
    if(restoring&&(proof.id!==proof.trash?.payload?.id||key(source.deletedItems?.find(entry=>entry?.id===proof.trash?.id))!==key(proof.trash)))throw Error("The confirmed task archive changed before restoration.");
    const expected=restoring?planRestore(source,proof.trash.id):plan(source,proof.id,proof.trash);
    const withoutSync=state=>Object.fromEntries(Object.entries(state).filter(([name])=>name!=="syncMeta"));
    if(key(withoutSync(expected))!==key(withoutSync(pending)))throw Error("Task archive transfer changed history, archive evidence, or unrelated data.");
    return {...source,tasksInterval:pending.tasksInterval,tasksAsReq:pending.tasksAsReq,deletedItems:pending.deletedItems};
  }
  function createApi(env){
    let busy=false;
    async function transfer(id,confirmation){
      const restoring=confirmation!==undefined,action=restoring?"restoration":"deletion";
      if(restoring&&(typeof confirmation!=="string"||!confirmation))return {saved:false,error:"Confirm the exact archived task before restoration."};
      if(busy||!env.canWrite())return {saved:false,error:`Task ${action} is unavailable while changes are saving or Recovery Mode is active.`};
      busy=true;let attempted=false;
      const firebaseOperation = env.operations?.begin(restoring ? "updating" : "deleting");
      try{
        await env.settle();
        const target=env.captureTarget(),version=key(env.version());
        const source=await env.read(target);
        if(!env.canWrite()||version!==key(env.version())||!env.matches(source))throw Error(`Task ${action} baseline changed. Reload/review before retrying.`);
        if(!env.validate(source))throw Error("Existing integrity issues require review before moving a task.");
        let trash,next,proof;
        if(restoring){
          trash=source.deletedItems.find(entry=>entry?.id===id);
          if(key(trash)!==confirmation)throw Error("The confirmed task archive changed. Review it again before restoration.");
          next=planRestore(source,id);proof={operation:"restore",id:trash.payload.id,trash:clone(trash)};
        }else{
          const task=resolve(source,id).task,list=source.tasksAsReq.some(row=>row?.id===id)?"asreq":"interval";
          trash={id:env.newId(),type:"task",payload:clone(task),meta:{list,originalId:id},label:"Maintenance task: "+(task?.name||"(unnamed task)"),deletedAt:new Date().toISOString()};
          next=plan(source,id,trash);proof={id,trash};
        }
        if(!env.validate(next))throw Error("The task transfer does not pass integrity validation.");
        const unchanged=()=>version===key(env.version())&&env.matches(source)&&env.targetIsCurrent(target);
        if(!unchanged())throw Error("Local task evidence changed before saving.");
        attempted=true;
        const result=await env.write(clone(next),source.syncMeta.rev,remote=>env.canWrite()&&unchanged()&&key(remote)===key(source)&&env.validate(remote),prepared=>key(prepared)===key(next)&&env.validate(prepared),proof,target);
        attempted=result.stateWriteAttempted===true;
        if(!result.saved){if(result.indeterminate)env.suspend(result);return result;}
        const actual=await env.read(target);
        if(!unchanged()||!result.committedState||key(actual)!==key(result.committedState)
          ||key({...actual,syncMeta:source.syncMeta})!==key(next)||actual.syncMeta?.rev<=source.syncMeta.rev||!env.validate(actual))throw Error(`Task ${action} server verification failed; review before further saves.`);
        if(!env.canWrite())throw Error(`Task ${action} committed, but a separate write blocker prevents adoption; review before further saves.`);
        if(!env.adopt(actual,proof))throw Error(`Verified ${action} could not be adopted safely.`);
        return {...result,verified:true,operation:restoring?"restore":"delete",archiveEvidence:clone(trash)};
      }catch(error){
        const result={saved:false,error:String(error?.message||error),indeterminate:attempted,stateWriteAttempted:attempted};
        if(attempted)env.suspend(result);
        return result;
      }finally{busy=false;firebaseOperation?.release();}
    }
    return {isBusy:()=>busy,isAvailable:()=>!busy&&env.canWrite(),remove:id=>transfer(id),restore:(id,confirmedArchiveKey)=>transfer(id,confirmedArchiveKey??null)};
  }
  return Object.freeze({entries,mode,resolve,historicalTasks,deletedFor,displayTask,plan,planRestore,safetyBaseline,createApi,key});
});
