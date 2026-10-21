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
  // This projection is available only to the isolated transaction after proving
  // the entire state is exactly one intact definition-to-Trash transfer.
  function safetyBaseline(source,pending,proof){
    if(!source||!proof)return source;
    const expected=plan(source,proof.id,proof.trash);
    const withoutSync=state=>Object.fromEntries(Object.entries(state).filter(([name])=>name!=="syncMeta"));
    if(key(withoutSync(expected))!==key(withoutSync(pending)))throw Error("Task deletion changed history, archive evidence, or unrelated data.");
    return {...source,tasksInterval:pending.tasksInterval,tasksAsReq:pending.tasksAsReq,deletedItems:pending.deletedItems};
  }
  function createApi(env){
    let busy=false;
    return {isBusy:()=>busy,async remove(id){
      if(busy||!env.canWrite())return {saved:false,error:"Task deletion is unavailable while changes are saving or Recovery Mode is active."};
      busy=true;let attempted=false;
      try{
        await env.settle();
        const target=env.captureTarget(),version=key(env.version());
        const source=await env.read(target);
        if(!env.canWrite()||version!==key(env.version())||!env.matches(source))throw Error("Task deletion baseline changed. Reload/review before retrying.");
        if(!env.validate(source))throw Error("Existing integrity issues require review before deleting a task.");
        const task=resolve(source,id).task;
        const list=source.tasksAsReq.some(row=>row?.id===id)?"asreq":"interval";
        const trash={id:env.newId(),type:"task",payload:clone(task),meta:{list,originalId:id},label:"Maintenance task: "+(task?.name||"(unnamed task)"),deletedAt:new Date().toISOString()};
        const next=plan(source,id,trash),proof={id,trash};
        if(!env.validate(next))throw Error("The archived task does not pass integrity validation.");
        const unchanged=()=>version===key(env.version())&&env.matches(source)&&env.targetIsCurrent(target);
        if(!unchanged())throw Error("Local task evidence changed before saving.");
        attempted=true;
        const result=await env.write(clone(next),source.syncMeta.rev,remote=>unchanged()&&key(remote)===key(source),prepared=>key(prepared)===key(next),proof,target);
        attempted=result.stateWriteAttempted===true;
        if(!result.saved){if(result.indeterminate)env.suspend(result);return result;}
        const actual=await env.read(target);
        if(!unchanged()||!result.committedState||key(actual)!==key(result.committedState)
          ||key({...actual,syncMeta:source.syncMeta})!==key(next)||actual.syncMeta?.rev<=source.syncMeta.rev||!env.validate(actual))throw Error("Task deletion server verification failed; review before further saves.");
        if(!env.adopt(actual))throw Error("Verified deletion could not be adopted safely.");
        return {...result,verified:true};
      }catch(error){
        const result={saved:false,error:String(error?.message||error),indeterminate:attempted,stateWriteAttempted:attempted};
        if(attempted)env.suspend(result);
        return result;
      }finally{busy=false;}
    }};
  }
  return Object.freeze({entries,mode,resolve,historicalTasks,deletedFor,displayTask,plan,safetyBaseline,createApi,key});
});
