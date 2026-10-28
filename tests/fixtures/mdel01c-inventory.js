"use strict";
const {fixture:base}=require("./mdel01-maintenance-task");
const definitions=[
  {index:11,id:"maintenance_task_v2_d1c0ce0a5b5f4d5c90c0fef2b88c17fe_mviblikm",legacy:"clean_rails",name:"Clean X-rails & Y-bridge rails"},
  {index:21,id:"maintenance_task_v2_mrm8uvmn",legacy:"inspect_abrasive_tube",name:"Abrasive tubing inspection"}
];
function fixture(){
  // Task IDs/array paths reproduce the incident. Inventory IDs and payloads
  // are synthetic: the request supplied no production stock payloads.
  const state=base(),oldTasks=state.tasksInterval.map(task=>task.id),oldStock=state.inventory.map(item=>item.id);
  let json=JSON.stringify(state);
  definitions.forEach((task,i)=>{json=json.replaceAll(oldTasks[i],task.legacy).replaceAll(oldStock[i],"fixture-stock-"+task.legacy);});
  const source=JSON.parse(json);
  definitions.forEach((task,i)=>{source.tasksInterval[i].name=task.name;source.inventory[i].name=task.name;source.inventory[i].qty=0;});
  source.maintenanceTasksV2=Array.from({length:22},(_,i)=>({id:"fixture-v2-unrelated-"+i,name:"Unrelated definition "+i}));
  definitions.forEach((task,i)=>{source.maintenanceTasksV2[task.index]={id:task.id,name:task.name,legacyTaskId:task.legacy,inventoryId:source.inventory[i].id};});
  source.maintenanceCalendarInstancesV2[0].taskId=definitions[0].id;
  source.maintenanceOccurrencesV2.forEach(event=>{event.taskId=definitions[0].id;event.inventoryId=source.inventory[0].id;});
  source.maintenanceCalendarInstancesV2.push({...structuredClone(source.maintenanceCalendarInstancesV2[0]),id:"fixture-instance-B",taskId:definitions[1].id,legacyTaskId:definitions[1].legacy});
  source.maintenanceOccurrencesV2.push({...structuredClone(source.maintenanceOccurrencesV2[0]),id:"fixture-event-B",taskId:definitions[1].id,legacyTaskId:definitions[1].legacy,instanceId:"fixture-instance-B",rootOccurrenceId:"repeat:fixture-instance-B:2026-10-01",inventoryId:source.inventory[1].id});
  source.deletedItems=[{id:"fixture-existing-trash",type:"unknown",payload:{id:"fixture-old-evidence",note:"keep verbatim"},meta:{},deletedAt:"2026-10-01T00:00:00Z"}];
  return source;
}
function archivedState(){
  const state=fixture();
  state.deletedItems.unshift(...state.inventory.map((item,i)=>({id:"fixture-stock-trash-"+i,type:"inventory",payload:structuredClone(item),meta:{originalId:item.id,linkedTaskId:item.linkedTaskId},deletedAt:"2026-01-01T00:00:00Z"})));
  state.inventory=[];
  // The old deletion flow cleared only these legacy operational links.
  state.tasksInterval.forEach(task=>{task.inventoryId=null;});
  return state;
}
module.exports={fixture,archivedState,definitions};
