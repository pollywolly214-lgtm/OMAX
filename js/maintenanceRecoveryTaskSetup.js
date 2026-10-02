(function(root,factory){
  const api=factory(typeof module==="object"&&module.exports?require("./maintenanceRecoveryImport"):root.OMAXMaintenanceRecoveryImport);
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXMaintenanceRecoveryTaskSetup=api;
})(typeof window==="undefined"?null:window,function(maintenance){
  "use strict";
  const STATUS=Object.freeze({present:"Already Exists — exact one match",ready:"Missing — Ready to Create",duplicate:"Duplicate / Ambiguous — Review",blocked:"Missing — Needs Review"});
  const definitions=Object.freeze([
    {name:"Refill Salt",pn:"",price:10,minutes:15},
    {name:"Transfer Tank Water Pump",pn:"",price:70,minutes:60},
    {name:"Empty Scrap Bin",pn:"",price:0,minutes:30},
    {name:"Nozzle Collet",pn:"308641",price:33.5,minutes:10},
    {name:"Nozzle Nut",pn:"303453",price:57.5,minutes:10},
    {name:"Main Pump 0.2 Micron",pn:"204000",price:144,minutes:30},
    {name:"Main Pump Filter 1.0 Micron",pn:"202533",price:33.5,minutes:30},
    {name:"Pump Garnet",pn:"",price:0,minutes:60}
  ].map(row=>Object.freeze({...row,type:"as_required",downtimeHours:row.minutes==null?null:row.minutes/60})));
  const clone=value=>JSON.parse(JSON.stringify(value));
  const canonical=value=>value===undefined?"undefined":value===null||typeof value!=="object"?JSON.stringify(value):Array.isArray(value)?"["+value.map(canonical).join(",")+"]":"{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+canonical(value[key])).join(",")+"}";
  // Extracted unchanged from both native Maintenance Settings form handlers.
  function buildAsRequiredTask(base,condition="As required"){
    return Object.assign(base,{mode:"asreq",condition,variant:"template",templateId:base.id});
  }
  function preview(state){
    if(!Array.isArray(state?.tasksAsReq)||!Array.isArray(state?.tasksInterval))throw Error("Authoritative Maintenance Settings task collections are missing or malformed.");
    const tasks=maintenance.savedTasks(state);
    return definitions.map(raw=>{
      const matches=tasks.filter(task=>task.name===raw.name),matchCount=matches.length;
      const ambiguous=matchCount>1||(matchCount===1&&(!matches[0].id||tasks.filter(task=>String(task.id)===String(matches[0].id)).length!==1));
      const status=ambiguous?STATUS.duplicate:matchCount===1?STATUS.present:raw.reason?STATUS.blocked:STATUS.ready;
      return{raw:{...raw},matchCount,status,reason:raw.reason|| (ambiguous?"Resolve exact-name/identity ambiguity; existing tasks are never overwritten.":matchCount?"Existing task retained unchanged.":"Reviewed reusable as-required task; no history or calendar scheduling.")};
    });
  }
  function append(state,ready,createTask){
    if(typeof createTask!=="function")throw Error("Native Maintenance Settings task factory is unavailable.");
    const eligible=preview(state).filter(row=>row.status===STATUS.ready);
    if(canonical(ready)!==canonical(eligible))throw Error("Task definitions or eligibility changed; review a fresh setup preview.");
    const next=clone(state),all=[...state.tasksInterval,...state.tasksAsReq,...(state.settingsFolders||[])];
    let order=all.reduce((max,row)=>Math.max(max,Number(row?.order)||0),0);
    for(const item of eligible){
      const definition=definitions.find(row=>row.name===item.raw.name&&!row.reason);
      if(!definition)throw Error("Unresolved task cannot be created.");
      const task=createTask({...definition},++order);
      if(!task||typeof task.id!=="string"||!task.id||task.name!==definition.name||task.mode!=="asreq"||task.variant!=="template"||task.templateId!==task.id||task.price!==definition.price||task.downtimeHours!==definition.downtimeHours||task.pn!==definition.pn||task.parentTask!==null||task.order!==order||typeof task.cat!=="string"||!task.cat)throw Error("Native task factory did not preserve the reviewed definition.");
      const expected=buildAsRequiredTask({id:task.id,name:definition.name,manualLink:"",storeLink:"",pn:definition.pn,price:definition.price,note:"",cat:task.cat,parentTask:null,order,downtimeHours:definition.downtimeHours});
      if(canonical(task)!==canonical(expected)||next.tasksAsReq.some(row=>row.id===task.id)||state.tasksInterval.some(row=>row.id===task.id)||(state.maintenanceTasksV2||[]).some(row=>row.id===task.id))throw Error("Unexpected task fields or colliding native task identity; nothing can be staged.");
      next.tasksAsReq.unshift(task);
    }
    return next;
  }
  function rollback(current,staged,before){
    if(!Array.isArray(current.tasksAsReq))throw Error("Task collection shape changed; manual verification required.");
    const prior=new Set(before.tasksAsReq.map(task=>task.id)),added=staged.tasksAsReq.filter(task=>!prior.has(task.id)),ids=new Set(added.map(task=>task.id));
    for(const expected of added){const matches=current.tasksAsReq.filter(task=>task.id===expected.id);if(matches.length!==1||canonical(matches[0])!==canonical(expected))throw Error("Setup-created task changed or is ambiguous; manual verification required.");}
    const retained=current.tasksAsReq.filter(task=>!ids.has(task.id));
    const referenced=value=>typeof value==="string"?ids.has(value):value&&typeof value==="object"?Object.values(value).some(referenced):false;
    if(referenced({...current,tasksAsReq:retained}))throw Error("Concurrent data references setup-created tasks; manual verification required.");
    return{tasksAsReq:clone(retained)};
  }
  function summary(plan,created=0){return{created,alreadyPresent:plan.filter(row=>row.status===STATUS.present).length,blockedForReview:plan.filter(row=>row.raw.reason).length,duplicates:plan.filter(row=>row.status===STATUS.duplicate).length};}
  return Object.freeze({STATUS,definitions,buildAsRequiredTask,preview,append,rollback,summary});
});
