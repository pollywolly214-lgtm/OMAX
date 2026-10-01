(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXInventoryIdentityRepair=api;
})(typeof window==="undefined"?null:window,function(){
  "use strict";
  const clone=value=>JSON.parse(JSON.stringify(value));
  const key=value=>value===undefined?"undefined":value===null||typeof value!=="object"?JSON.stringify(value):Array.isArray(value)?"["+value.map(key).join(",")+"]":"{"+Object.keys(value).sort().map(name=>JSON.stringify(name)+":"+key(value[name])).join(",")+"}";
  const business=state=>Object.fromEntries(Object.entries(state||{}).filter(([name])=>!["syncMeta","saveMeta","syncProcessLog"].includes(name)));
  // Fixed-width Unicode code points are injective and safe in identifiers. No
  // clock, visible name, row position or arbitrary winner influences this ID.
  const proposedId=taskId=>"inventory_task_"+Array.from(taskId).map(char=>char.codePointAt(0).toString(16).padStart(6,"0")).join("");
  const counts=state=>Object.fromEntries(Object.entries(state||{}).filter(([,value])=>Array.isArray(value)).map(([name,value])=>[name,value.length]));
  function preview(state){
    const plan={sourceRevision:state?.syncMeta?.rev??0,sourceSignature:key(state),duplicateGroups:[],affectedRows:[],v2Relinks:[],remainingReferences:[],blockers:[],beforeCounts:counts(state),expectedAfterCounts:counts(state),noop:false};
    const block=message=>plan.blockers.push(message);
    if(!state||!Array.isArray(state.inventory)||!Array.isArray(state.tasksInterval)||!Array.isArray(state.tasksAsReq)||!Array.isArray(state.maintenanceTasksV2)){block("An authoritative inventory/legacy/V2 baseline is required.");return plan;}
    if(!Number.isSafeInteger(plan.sourceRevision)||plan.sourceRevision<0)block("Authoritative revision is invalid.");
    const jsonSafe=value=>value===null||["string","boolean"].includes(typeof value)||(typeof value==="number"&&Number.isFinite(value))||(Array.isArray(value)&&value.every(jsonSafe))||(value&&typeof value==="object"&&value.constructor?.name==="Object"&&Object.values(value).every(jsonSafe));
    if(!jsonSafe(state))block("Non-JSON source values require separate evidence review; an ID-only repair cannot normalize them.");
    const folderIds=new Set();
    for(const folder of state.inventoryFolders||[]){if(!folder?.id||folderIds.has(String(folder.id)))block("Inventory folder identity issues are outside this repair scope.");folderIds.add(String(folder?.id));}
    const groups=new Map(),tasks=[...state.tasksInterval.map((task,index)=>({collection:"tasksInterval",index,task})),...state.tasksAsReq.map((task,index)=>({collection:"tasksAsReq",index,task}))];
    state.inventory.forEach((item,index)=>{
      if(typeof item?.id!=="string"||!item.id.trim()||item.id!==item.id.trim()){block(`Inventory index ${index} has an unsupported missing/noncanonical ID.`);return;}
      const group=groups.get(item.id)||[];group.push(index);groups.set(item.id,group);
    });
    for(const [id,indexes] of groups)if(indexes.length>1)plan.duplicateGroups.push({id,indexes});
    const duplicateIds=new Set(plan.duplicateGroups.map(group=>group.id)),allowed=new Set(),byLegacy=new Map(),usedIds=new Set(state.inventory.map(item=>item?.id));
    for(const group of plan.duplicateGroups)for(const index of group.indexes){
      const item=state.inventory[index],linked=item.linkedTaskId;
      const row={inventoryIndex:index,oldInventoryId:group.id,inventoryRow:clone(item),linkedTaskId:linked??null,legacyTask:null,proposedInventoryId:null,v2Tasks:[]};
      plan.affectedRows.push(row);allowed.add(`$.inventory[${index}].id`);
      if(typeof linked!=="string"||!linked.trim()||linked!==linked.trim()){block(`Inventory index ${index} lacks a canonical linkedTaskId.`);continue;}
      if(state.inventory.filter(other=>other?.linkedTaskId===linked).length!==1){block(`linkedTaskId ${linked} is not unique across inventory.`);continue;}
      const matches=tasks.filter(({task})=>task?.id===linked);
      if(matches.length!==1){block(`linkedTaskId ${linked} matches ${matches.length} legacy tasks; exactly one is required.`);continue;}
      const match=matches[0];row.legacyTask={collection:match.collection,index:match.index,id:match.task.id,name:match.task.name??""};
      if(match.task.inventoryId!==group.id){block(`Legacy task ${linked} does not reference ${group.id}.`);continue;}
      row.proposedInventoryId=proposedId(linked);
      if(usedIds.has(row.proposedInventoryId)){block(`Proposed inventory ID collides: ${row.proposedInventoryId}.`);continue;}
      usedIds.add(row.proposedInventoryId);byLegacy.set(linked,row);allowed.add(`$.${match.collection}[${match.index}].inventoryId`);
    }
    for(const {collection,index,task} of tasks)if(duplicateIds.has(task?.inventoryId)){
      const mapping=byLegacy.get(task.id);
      if(!mapping||mapping.oldInventoryId!==task.inventoryId||mapping.legacyTask.collection!==collection||mapping.legacyTask.index!==index)block(`Legacy reference ${collection}[${index}].inventoryId has no one-to-one mapping.`);
    }
    state.maintenanceTasksV2.forEach((task,index)=>{
      if(!duplicateIds.has(task?.inventoryId))return;
      const mapping=byLegacy.get(task.legacyTaskId);
      if(!mapping||mapping.oldInventoryId!==task.inventoryId){block(`V2 task index ${index} has no resolvable legacyTaskId for its duplicate inventory reference.`);return;}
      const relink={index,id:task.id??null,legacyTaskId:task.legacyTaskId,oldInventoryId:task.inventoryId,proposedInventoryId:mapping.proposedInventoryId};
      mapping.v2Tasks.push(relink);plan.v2Relinks.push(relink);allowed.add(`$.maintenanceTasksV2[${index}].inventoryId`);
    });
    // Include unknown fields, nested history, deleted records and object keys.
    // Embedded occurrences of the old ID are conservatively review-required.
    const walk=(value,path)=>{
      if(typeof value==="string")for(const id of duplicateIds)if(value.includes(id)){
        const supported=value===id&&allowed.has(path);plan.remainingReferences.push({path,oldInventoryId:id,supported});if(!supported)block(`Unknown duplicate-ID reference at ${path}.`);
      }
      if(value&&typeof value==="object")for(const [name,child] of Object.entries(value)){
        for(const id of duplicateIds)if(name.includes(id)){plan.remainingReferences.push({path:path+"["+JSON.stringify(name)+"] (key)",oldInventoryId:id,supported:false});block(`Unknown duplicate-ID object key at ${path}.`);}
        walk(child,Array.isArray(value)?`${path}[${name}]`:/^[A-Za-z_$][\w$]*$/.test(name)?`${path}.${name}`:`${path}[${JSON.stringify(name)}]`);
      }
    };
    walk(state,"$");plan.noop=plan.duplicateGroups.length===0&&plan.blockers.length===0;
    return plan;
  }
  function repairedState(source,plan){
    if(plan.blockers.length)throw Error("Repair preview has blockers.");
    const next=clone(source);
    for(const row of plan.affectedRows){next.inventory[row.inventoryIndex].id=row.proposedInventoryId;next[row.legacyTask.collection][row.legacyTask.index].inventoryId=row.proposedInventoryId;}
    for(const row of plan.v2Relinks)next.maintenanceTasksV2[row.index].inventoryId=row.proposedInventoryId;
    return next;
  }
  function verify(source,plan,expected,actual){
    if(!actual||key(actual)!==key(expected))throw Error("Server state differs from the exact authorized repair result.");
    if(key(counts(actual))!==key(plan.beforeCounts))throw Error("Protected collection counts changed.");
    if(new Set(actual.inventory.map(item=>item.id)).size!==actual.inventory.length)throw Error("Inventory IDs are not unique.");
    for(const row of plan.affectedRows){
      const item=actual.inventory[row.inventoryIndex],original=source.inventory[row.inventoryIndex];
      if(item.id!==row.proposedInventoryId||key({...item,id:original.id})!==key(original)||actual[row.legacyTask.collection][row.legacyTask.index].inventoryId!==item.id)throw Error("Inventory/legacy correspondence or preserved fields failed verification.");
    }
    for(const row of plan.v2Relinks)if(actual.maintenanceTasksV2[row.index].legacyTaskId!==row.legacyTaskId||actual.maintenanceTasksV2[row.index].inventoryId!==row.proposedInventoryId)throw Error("V2 correspondence failed verification.");
    const oldIds=new Set(plan.duplicateGroups.map(group=>group.id));
    if(actual.inventory.some(item=>oldIds.has(item.id))||[...actual.tasksInterval,...actual.tasksAsReq,...actual.maintenanceTasksV2].some(task=>oldIds.has(task.inventoryId)))throw Error("Old duplicate ID retains supported references.");
    if(preview(actual).remainingReferences.length||preview(actual).blockers.length)throw Error("Repaired inventory still has identity issues.");
    if(!Number.isSafeInteger(actual.syncMeta?.rev)||actual.syncMeta.rev<=plan.sourceRevision||actual.syncMeta.rev!==expected.syncMeta?.rev)throw Error("Authorized transaction revision was not verified.");
    return true;
  }
  function createApi(env,strategy={preview,repairedState,verify}){
    let busy=false;
    const currentPreview=source=>{
      const plan=strategy.preview(source);
      if(key(business(env.localState()))!==key(business(source)))plan.blockers.push("Local business state differs from authoritative cloud state.");
      if(env.loadedRevision()!==plan.sourceRevision)plan.blockers.push("The displayed authoritative revision differs from the current server revision.");
      plan.noop=plan.noop&&!plan.blockers.length;return plan;
    };
    return Object.freeze({async preview(){return currentPreview(await env.readCloud());},async apply(reviewedPreview,{confirmed=false}={}){
      const result={saved:false,verified:false,noop:false,backupCreated:false,indeterminate:false,manualVerificationRequired:false,error:""};
      if(busy||!confirmed||!env.canApply()){result.error="Explicit exact-plan confirmation and an authenticated authoritative baseline are required.";return result;}
      busy=true;let committed=false,writePending=false;
      try {
        const source=await env.readCloud(),plan=currentPreview(source);
        if(!reviewedPreview||key(plan)!==key(reviewedPreview))throw Error("Reviewed source/plan or revision changed; generate a fresh read-only preview.");
        if(plan.blockers.length)throw Error(plan.blockers.join(" "));
        if(plan.noop){result.noop=true;return result;}
        const next=strategy.repairedState(source,plan),pendingKey=key(next),localBefore=key(business(env.localState()));
        if(await env.backup(clone(source))!==true)throw Error("Exact authoritative pre-repair backup download is required.");
        result.backupCreated=true;
        if(key(business(env.localState()))!==localBefore)throw Error("Local state changed during backup; review a fresh preview.");
        writePending=true;
        const saved=await env.write(next,{source:clone(source),expectedRevision:plan.sourceRevision});
        writePending=false;
        committed=saved?.stateWriteCompleted===true;
        result.indeterminate=saved?.indeterminate===true||(!committed&&saved?.stateWriteAttempted===true&&saved?.definiteFailure!==true);
        if(result.indeterminate){result.manualVerificationRequired=true;result.error=saved?.error||"Repair write outcome is indeterminate; no retry or rollback.";env.suspend(result.error);return result;}
        if(!saved?.saved||!committed)throw Error(saved?.error||"Repair transaction was rejected.");
        result.saved=true;result.committedState=clone(saved.committedState);
        // Only sync metadata can differ from our proposed state.
        if(key({...saved.committedState,syncMeta:source.syncMeta})!==pendingKey)throw Error("Transaction changed fields outside the authorized ID repair.");
        const actual=await env.readCloud();strategy.verify(source,plan,saved.committedState,actual);
        if(key(business(env.localState()))!==localBefore)throw Error("Local business state changed while repair was in flight; preserve evidence and verify manually.");
        await env.adoptVerified(clone(actual));result.verified=true;result.beforeCounts=plan.beforeCounts;result.afterCounts=counts(actual);result.repairedRows=plan.affectedRows.length;return result;
      }catch(error){
        result.error=String(error?.message||error);
        if(committed||writePending){result.manualVerificationRequired=true;result.indeterminate=writePending;env.suspend(result.error);}
        return result;
      }finally{busy=false;}
    }});
  }
  return Object.freeze({key,business,counts,proposedId,preview,repairedState,verify,createApi});
});
