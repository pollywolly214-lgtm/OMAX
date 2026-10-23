"use strict";
// Representative records only. These are deliberately not production IDs.
function fixture(){
  const task=(id,inventoryId)=>({id,name:"Mixing Tube .042",mode:"interval",variant:"template",templateId:id,interval:100,inventoryId,price:42,downtimeHours:0.5,recurrence:{enabled:true,basis:"calendar_day",every:7},completedDates:["2026-10-01"],manualHistory:[{dateISO:"2026-10-01",status:"completed",calendarPrice:42,note:"preserve evidence"}],occurrenceHours:{"2026-10-01":0.5},occurrenceNotes:{"2026-10-01":"original note"},removedOccurrences:[],importProvenance:{source:"representative fixture"}});
  return {syncMeta:{rev:7},tasksInterval:[task("fixture-task-A","fixture-inventory-A"),task("fixture-task-B","fixture-inventory-B")],tasksAsReq:[],
    inventory:[{id:"fixture-inventory-A",linkedTaskId:"fixture-task-A",name:"Part A",qty:8},{id:"fixture-inventory-B",linkedTaskId:"fixture-task-B",name:"Part B",qty:4}],inventoryFolders:[],settingsFolders:[],
    maintenanceTasksV2:[{id:"fixture-v2-A",legacyTaskId:"fixture-task-A",name:"Mixing Tube .042",inventoryId:"fixture-inventory-A"}],
    maintenanceCalendarInstancesV2:[{id:"fixture-instance-A",taskId:"fixture-v2-A",legacyTaskId:"fixture-task-A",system:"v2",schemaVersion:2,instanceMode:"repeat",startDateISO:"2026-10-01",repeatRule:{enabled:true,basis:"calendar_day",every:7},status:"active"}],
    maintenanceOccurrencesV2:[{id:"fixture-event-A",taskId:"fixture-v2-A",instanceId:"fixture-instance-A",legacyTaskId:"fixture-task-A",system:"v2",schemaVersion:2,eventType:"completed",effectiveDateISO:"2026-10-01",recordedAtISO:"2026-10-01T12:00:00Z",rootOccurrenceId:"repeat:fixture-instance-A:2026-10-01",partsCostSnapshot:42,payload:{hours:0.5,note:"completion evidence"}},
      {id:"fixture-future-A",taskId:"fixture-v2-A",instanceId:"fixture-instance-A",legacyTaskId:"fixture-task-A",system:"v2",schemaVersion:2,eventType:"scheduled",effectiveDateISO:"2026-11-01",recordedAtISO:"2026-10-01T12:00:00Z",rootOccurrenceId:"repeat:fixture-instance-A:2026-11-01"}],
    totalHistory:[{dateISO:"2026-10-01",hours:500},{dateISO:"2026-10-02",hours:508}],orderRequests:[{id:"fixture-po",status:"approved",items:[{id:"fixture-line",taskId:"fixture-task-A",inventoryId:"fixture-inventory-A",qty:2,price:42}]}],
    receiptTrackerWeeks:[{key:"2026-W40",rows:[{taskId:"fixture-task-A",inventoryItemId:"fixture-inventory-A",cost:84}]}],weeklyCostReports:[{id:"fixture-report",maintenanceCost:42}],deletedItems:[],cuttingJobs:[],completedCuttingJobs:[],dailyCutHours:[],pumpEff:{entries:[]},appConfig:{keep:true}};
}
const trashFor=state=>({id:"fixture-trash-A",type:"task",payload:structuredClone(state.tasksInterval[0]),meta:{list:"interval",originalId:"fixture-task-A"},label:"Maintenance task: Mixing Tube .042",deletedAt:"2026-01-01T00:00:00Z"});
module.exports={fixture,trashFor};
