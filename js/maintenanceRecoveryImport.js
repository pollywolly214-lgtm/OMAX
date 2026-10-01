(function(root,factory){
  const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXMaintenanceRecoveryImport=api;
})(typeof window==="undefined"?null:window,function(){
  "use strict";
  const keys=["maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2"];
  const clone=v=>JSON.parse(JSON.stringify(v));
  const canonical=v=>v===undefined?"undefined":v===null||typeof v!=="object"?JSON.stringify(v):Array.isArray(v)?"["+v.map(canonical).join(",")+"]":"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";
  const id=(kind,value)=>"recovery_"+kind+"_"+Array.from(value).map(c=>c.codePointAt(0).toString(16).padStart(6,"0")).join("");
  const numeric=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
  const blank=v=>v==null||v==="";
  const validDate=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+"T00:00:00Z"))&&new Date(v+"T00:00:00Z").toISOString().slice(0,10)===v;
  function todayISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
  function savedTasks(state){return[...(state.tasksInterval||[]),...(state.tasksAsReq||[])].filter(task=>{
    if(!task)return false;
    const variant=String(task.variant||"").toLowerCase();
    if(variant==="template")return true;
    if(variant==="instance")return false;
    return task.templateId==null||String(task.templateId)===String(task.id);
  });}
  function resolve(name,state){return savedTasks(state).filter(task=>task.name===name);}
  function checklistPreview(rows,state){
    return(rows||[]).map(row=>{
      const matches=resolve(row.task_name,state);let status=matches.length===1?"Found exactly once":matches.length?"Ambiguous / duplicate":"Missing";
      if(!row.task_setup_id||rows.filter(other=>other.task_setup_id===row.task_setup_id).length!==1||String(row.setup_status).toLowerCase()==="needs_review"||!["true","1","yes"].includes(String(row.verified_in_site).toLowerCase()))status="Checklist row still needs review";
      return{task_setup_id:row.task_setup_id||"",task_name:row.task_name||"",status,matchCount:matches.length};
    });
  }
  // Shared with the native one-time calendar helper. Pure construction allows
  // recovery to stage the same lifecycle without triggering per-event saves.
  function lifecycleEvent(base,{eventId,eventType,payload={},recordedAtISO=new Date().toISOString(),supersedesEventId=base.id}){
    return{id:eventId,system:"v2",schemaVersion:2,instanceId:base.instanceId,taskId:base.taskId,eventType,effectiveDateISO:base.dateISO||base.effectiveDateISO,recordedAtISO,supersedesEventId,rootOccurrenceId:String(base.id),payload:{...payload}};
  }
  function preview(input,state,STATUS){
    const events=Array.isArray(input)?input:input?.events;
    if(!Array.isArray(events))throw Error("Maintenance source must contain reviewed events.");
    const checklist=checklistPreview(input?.checklist||[],state),checklistBlocked=checklist.some(row=>row.status!=="Found exactly once");
    return events.map((source,index)=>{
      const raw=clone(source||{}),eventId=raw.import_event_id;let reason="Historical completed one-time event; zero repeat chains or future projections.",status=STATUS.missing,task=null,v2Task=null,hours=null;
      const bad=message=>{status=STATUS.problem;reason=message;};
      if(typeof eventId!=="string"||!eventId||eventId.trim()!==eventId||eventId.length>240)bad("Permanent import_event_id required.");
      else if(raw.__recoveryProblems?.length)bad(raw.__recoveryProblems.join(" "));
      else if(!validDate(raw.event_date))bad("event_date must be an exact real YYYY-MM-DD date.");
      else if(raw.event_date>todayISO())bad("Recovery maintenance must describe historical work, not a future event.");
      else if(!["existing_task","calendar_only"].includes(raw.route))bad("Only existing_task and calendar_only routes are supported; task creation is separate.");
      else if(raw.calendar_mode!=="one_time"||raw.mark_completed!==true)bad("Every recovery event must be one_time and mark_completed=true.");
      else if(raw.review_status==="needs_review")bad("Source row still needs review.");
      else if(!raw.event_name||typeof raw.event_name!=="string"||!raw.event_name.trim())bad("An event_name is required.");
      else if(events.filter(row=>row?.import_event_id===eventId).length!==1)bad("Repeated source identity requires review for every affected row.");
      else if(checklistBlocked)bad("Finish separate task setup and verify every checklist row before importing maintenance history.");
      else if(!blank(raw.labor_minutes)&&!numeric(raw.labor_minutes))bad("labor_minutes must be a finite nonnegative number, without rounding.");
      else if(!blank(raw.parts_cost_snapshot)&&!numeric(raw.parts_cost_snapshot))bad("parts_cost_snapshot must be a finite nonnegative number.");
      else if(raw.route==="calendar_only"&&!blank(raw.exact_existing_task))bad("calendar_only must not reference a saved task.");
      else {
        if(raw.route==="existing_task"){
          const matches=resolve(raw.exact_existing_task,state);
          if(matches.length!==1)bad(matches.length?"Ambiguous / duplicate exact saved task name.":"Missing exact saved Maintenance Settings task.");
          else{
            task=matches[0];const bridges=(state.maintenanceTasksV2||[]).filter(record=>record.legacyTaskId===String(task.id));
            if(!task.id||savedTasks(state).filter(other=>String(other.id)===String(task.id)).length!==1||bridges.length>1)bad("Saved task identity or V2 descriptor is ambiguous.");
            else v2Task=bridges[0]||null;
          }
        }
        if(status===STATUS.missing){
          if(!blank(raw.labor_minutes))hours=raw.labor_minutes/60;
          else if(task&&!blank(task.downtimeHours)&&numeric(task.downtimeHours))hours=task.downtimeHours;
          else bad("No reliable labor duration: supply reviewed labor_minutes or configure the saved task default.");
        }
        if(status===STATUS.missing){
          const existing=(state.maintenanceOccurrencesV2||[]).filter(record=>record.import_event_id===eventId);
          const ownedInstances=(state.maintenanceCalendarInstancesV2||[]).filter(record=>record.recoveryImportId===eventId);
          const ownedEvents=(state.maintenanceOccurrencesV2||[]).filter(record=>record.recoveryImportId===eventId);
          const legacy=[...(state.tasksInterval||[]),...(state.tasksAsReq||[])].flatMap(record=>record.manualHistory||[]).filter(record=>record.import_event_id===eventId);
          if(existing.length||ownedInstances.length||ownedEvents.length||legacy.length){
            if(existing.length===1&&existing[0].eventType==="completed"&&ownedInstances.length===1&&ownedInstances[0].instanceMode==="one_time"&&ownedInstances[0].repeatRule===null&&ownedEvents.length===2&&ownedEvents.some(e=>e.id===existing[0].rootOccurrenceId&&e.eventType==="scheduled")&&existing[0].instanceId===ownedInstances[0].id&&canonical(existing[0].importProvenance?.sourceRecord)===canonical(raw)){
              status=STATUS.present;reason="Permanent historical identity already exists exactly once; no-op.";
            }else{status=STATUS.match;reason="Existing identity has different evidence or an incomplete/ambiguous V2 lifecycle; review required.";}
          }else{
            const descriptorId=v2Task?.id||id("task",task?"saved:"+String(task.id):"calendar:"+eventId);
            const instanceId=id("instance",eventId),baseId=id("scheduled",eventId),completedId=id("completed",eventId);
            if((!v2Task&&(state.maintenanceTasksV2||[]).some(r=>r.id===descriptorId))||(state.maintenanceCalendarInstancesV2||[]).some(r=>r.id===instanceId)||(state.maintenanceOccurrencesV2||[]).some(r=>r.id===baseId||r.id===completedId))bad("Recovery record ID collision requires review.");
            else if((task&&((task.completedDates||[]).includes(raw.event_date)||(task.manualHistory||[]).some(e=>e.dateISO===raw.event_date&&!e.import_event_id)))||(state.maintenanceOccurrencesV2||[]).some(e=>e.eventType==="scheduled"&&e.effectiveDateISO===raw.event_date&&(task?e.legacyTaskId===String(task.id)||e.taskId===v2Task?.id:e.taskName===raw.event_name))){status=STATUS.match;reason="Possible existing same-date maintenance work; review before appending.";}
          }
        }
      }
      return{index,raw,import_event_id:eventId||"",status,reason,taskId:task?String(task.id):null,v2TaskId:v2Task?.id||null,hours,checklist};
    });
  }
  function append(state,candidates){
    const next=clone(state),now=new Date().toISOString();keys.forEach(key=>{if(!Array.isArray(next[key]))throw Error("Maintenance V2 collections are unavailable; reload authoritative state.");});
    for(const item of candidates){
      const raw=item.raw,eventId=item.import_event_id,task=item.taskId?savedTasks(next).find(task=>String(task.id)===item.taskId):null;
      let descriptor=item.v2TaskId?next.maintenanceTasksV2.find(record=>record.id===item.v2TaskId):task?next.maintenanceTasksV2.find(record=>record.legacyTaskId===item.taskId):null;
      if(!descriptor){
        descriptor={id:id("task",task?"saved:"+item.taskId:"calendar:"+eventId),system:"v2",schemaVersion:2,name:task?.name||raw.event_name,categoryRef:task?.cat??null,price:task?.price??null,createdAtISO:now,updatedAtISO:now,recoveryDescriptor:true};
        if(task)descriptor.legacyTaskId=item.taskId;
        else Object.assign(descriptor,{reusable:false,variant:"instance",recoveryImportId:eventId});
        next.maintenanceTasksV2.push(descriptor);
      }
      const common={system:"v2",schemaVersion:2,taskId:descriptor.id,recoveryImportId:eventId};
      if(task)common.legacyTaskId=item.taskId;
      const instance={...common,id:id("instance",eventId),instanceMode:"one_time",repeatRule:null,startDateISO:raw.event_date,status:"active",createdAtISO:now,updatedAtISO:now};
      const base={...common,id:id("scheduled",eventId),instanceId:instance.id,taskName:raw.event_name,eventType:"scheduled",effectiveDateISO:raw.event_date,recordedAtISO:now,payload:{note:raw.review_notes||"",hours:item.hours}};
      const completed={...lifecycleEvent(base,{eventId:id("completed",eventId),eventType:"completed",recordedAtISO:now}),...common,taskName:raw.event_name,import_event_id:eventId,loggedHours:item.hours,note:raw.review_notes||"",importProvenance:{sourceRecord:clone(raw),originalSourceDate:raw.event_date,route:raw.route,importedAtISO:now}};
      const parts=blank(raw.parts_cost_snapshot)?task?.price:raw.parts_cost_snapshot;
      if(!blank(parts)&&numeric(parts))completed.partsCostSnapshot=parts;
      if(!blank(raw.part_number_snapshot))completed.partNumberSnapshot=raw.part_number_snapshot;
      next.maintenanceCalendarInstancesV2.push(instance);
      next.maintenanceOccurrencesV2.push(base,completed);
    }
    return next;
  }
  function rollback(current,staged,before){
    const additions=Object.fromEntries(keys.map(key=>[key,staged[key].filter(row=>!before[key].some(old=>old.id===row.id))]));
    // Validate every record before deleting any. Descriptors referenced by a
    // concurrent event cannot be removed: retain all evidence and suspend.
    for(const key of keys){
      if(!Array.isArray(current[key]))throw Error("Maintenance destination shape changed; manual verification required.");
      for(const expected of additions[key]){
        const matches=current[key].filter(row=>row.id===expected.id);
        if(matches.length!==1||canonical(matches[0])!==canonical(expected))throw Error("Imported maintenance record changed or became ambiguous; manual verification required.");
      }
    }
    const next=clone(current);
    keys.forEach(key=>{const added=new Set(additions[key].map(row=>row.id));next[key]=next[key].filter(row=>!added.has(row.id));});
    const removedTasks=new Set(additions.maintenanceTasksV2.map(row=>row.id)),removedInstances=new Set(additions.maintenanceCalendarInstancesV2.map(row=>row.id)),removedEvents=new Set(additions.maintenanceOccurrencesV2.map(row=>row.id));
    if(next.maintenanceCalendarInstancesV2.some(row=>removedTasks.has(row.taskId))||next.maintenanceOccurrencesV2.some(row=>removedTasks.has(row.taskId)||removedInstances.has(row.instanceId)||removedEvents.has(row.rootOccurrenceId)||removedEvents.has(row.supersedesEventId)))throw Error("Concurrent maintenance lifecycle references import-created records; manual verification required.");
    return next;
  }
  return Object.freeze({keys,savedTasks,checklistPreview,lifecycleEvent,preview,append,rollback});
});
