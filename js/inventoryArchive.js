(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXInventoryArchive=api;
})(typeof window==="undefined"?null:window,function(){
  "use strict";
  const clone=value=>JSON.parse(JSON.stringify(value));
  const key=value=>value===undefined?"undefined":value===null||typeof value!=="object"?JSON.stringify(value):Array.isArray(value)?"["+value.map(key).join(",")+"]":"{"+Object.keys(value).sort().map(name=>JSON.stringify(name)+":"+key(value[name])).join(",")+"}";
  const canonical=id=>typeof id==="string"&&id.length>0&&id===id.trim();
  const entries=state=>(Array.isArray(state?.deletedItems)?state.deletedItems:[]).filter(entry=>entry?.type==="inventory");
  function validEntry(entry){
    const payload=entry?.payload,meta=entry?.meta;
    return entry?.type==="inventory"&&canonical(entry.id)&&payload&&typeof payload==="object"&&!Array.isArray(payload)&&canonical(payload.id)
      &&typeof entry.deletedAt==="string"&&Number.isFinite(Date.parse(entry.deletedAt))
      &&(meta===undefined||(meta&&typeof meta==="object"&&!Array.isArray(meta)))
      &&(meta?.originalId===undefined||meta.originalId===payload.id);
  }
  function resolve(state,id){
    if(!canonical(id))return {status:"missing",item:null};
    const active=(Array.isArray(state?.inventory)?state.inventory:[]).filter(item=>item?.id===id);
    const archived=entries(state).filter(entry=>entry.payload?.id===id);
    if(active.length+archived.length!==1)return {status:active.length+archived.length?"ambiguous":"missing",item:null};
    if(active.length)return {status:"active",item:active[0]};
    const entry=archived[0];
    if(!validEntry(entry)||(state.deletedItems||[]).filter(other=>other?.id===entry.id).length!==1)return {status:"invalid",item:null};
    return {status:"archived",item:entry.payload,entry};
  }
  // A retained ID is historical evidence only. Stock consumers still read the
  // active inventory array; a Settings render must not provision it again.
  function archivedForTask(state,task){
    if(task?.inventoryId)return resolve(state,task.inventoryId).status==="archived";
    return entries(state).some(entry=>entry.payload?.linkedTaskId===task?.id&&resolve(state,entry.payload.id).status==="archived");
  }
  function plan(source,id,trash,restoring=false){
    if(!Array.isArray(source?.inventory)||!Array.isArray(source?.deletedItems))throw Error("Authoritative Inventory and Trash are required.");
    const found=resolve(source,id);
    if(restoring){
      if(found.status!=="archived"||key(found.entry)!==key(trash))throw Error("Restore requires the exact unique inventory archive and original ID.");
      return {...clone(source),inventory:[...clone(source.inventory),clone(found.item)],deletedItems:clone(source.deletedItems.filter(entry=>entry.id!==trash.id))};
    }
    if(found.status!=="active"||!validEntry(trash)||trash.meta?.originalId!==id||key(trash.payload)!==key(found.item)
      ||source.deletedItems.some(entry=>entry?.id===trash.id))throw Error("Exactly one active inventory item must move intact into a new archive.");
    return {...clone(source),inventory:clone(source.inventory.filter(item=>item?.id!==id)),deletedItems:[clone(trash),...clone(source.deletedItems)]};
  }
  function safetyBaseline(source,pending,proof){
    if(!source||!proof)return source;
    const expected=plan(source,proof.id,proof.trash,proof.operation==="restore");
    const business=state=>Object.fromEntries(Object.entries(state).filter(([name])=>name!=="syncMeta"));
    if(key(business(expected))!==key(business(pending)))throw Error("Inventory transfer changed history, archive evidence, or unrelated data.");
    return {...source,inventory:pending.inventory,deletedItems:pending.deletedItems};
  }
  function createApi(env){
    let busy=false;
    async function transfer(id,restoring=false){
      if(busy||!env.canWrite())return {saved:false,error:"Inventory transfer is unavailable while changes are saving or Recovery Mode is active."};
      busy=true;let attempted=false;
      const operation=env.operations?.begin(restoring?"updating":"deleting");
      try{
        await env.settle();
        const target=env.captureTarget(),version=key(env.version()),source=await env.read(target);
        if(!env.canWrite()||version!==key(env.version())||!env.matches(source)||!env.validate(source))throw Error("Inventory baseline changed or has integrity issues; reload/review before retrying.");
        const found=resolve(source,id);
        if(found.status!==(restoring?"archived":"active"))throw Error("Select one unique inventory identity.");
        const trash=restoring?clone(found.entry):{id:env.newId(),type:"inventory",payload:clone(found.item),meta:{originalId:id,linkedTaskId:found.item.linkedTaskId??null},label:"Inventory: "+(found.item.name||"(unnamed item)"),deletedAt:new Date().toISOString()};
        const proof={id,trash,operation:restoring?"restore":"delete"},next=plan(source,id,trash,restoring);
        if(!env.validate(next))throw Error("Inventory transfer does not pass identity validation.");
        const unchanged=()=>version===key(env.version())&&env.matches(source)&&env.targetIsCurrent(target);
        if(!unchanged())throw Error("Inventory evidence changed before saving.");
        attempted=true;
        const result=await env.write(clone(next),source.syncMeta.rev,remote=>env.canWrite()&&unchanged()&&key(remote)===key(source)&&env.validate(remote),prepared=>key(prepared)===key(next)&&env.validate(prepared),proof,target);
        attempted=result.stateWriteAttempted===true;
        if(!result.saved){if(result.indeterminate)env.suspend(result);return result;}
        const actual=await env.read(target);
        if(!unchanged()||!result.committedState||key(actual)!==key(result.committedState)
          ||key({...actual,syncMeta:source.syncMeta})!==key(next)||actual.syncMeta?.rev<=source.syncMeta.rev||!env.validate(actual))throw Error("Inventory server verification failed; review before further saves.");
        if(!env.canWrite()||!env.adopt(actual))throw Error("Verified inventory transfer could not be adopted safely.");
        return {...result,verified:true};
      }catch(error){
        const result={saved:false,error:String(error?.message||error),indeterminate:attempted,stateWriteAttempted:attempted};
        if(attempted)env.suspend(result);
        return result;
      }finally{busy=false;operation?.release();}
    }
    return {isBusy:()=>busy,isAvailable:()=>!busy&&env.canWrite(),remove:id=>transfer(id),restore:id=>transfer(id,true)};
  }
  return Object.freeze({key,entries,validEntry,resolve,archivedForTask,plan,safetyBaseline,createApi});
});
