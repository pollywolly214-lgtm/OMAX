"use strict";
const {fixture}=require("./mdel01-maintenance-task");
function rich(){
  const state=fixture(),task=state.tasksInterval[0];task.completedDates=[];task.manualHistory=[];task.occurrenceNotes={};task.occurrenceHours={};state.maintenanceOccurrencesV2=[];
  for(let i=1;i<=12;i++){
    const day="2026-09-"+String(i).padStart(2,"0");task.completedDates.push(day);task.manualHistory.push({id:"legacy-history-"+i,dateISO:day,status:"completed",note:"Original note "+i,calendarPrice:40+i,hours:i/10});task.occurrenceNotes[day]="Retain note "+i;task.occurrenceHours[day]=i/10;
    state.maintenanceOccurrencesV2.push({id:"history-"+i,system:"v2",schemaVersion:2,taskId:"fixture-v2-A",instanceId:"fixture-instance-A",legacyTaskId:task.id,eventType:"completed",effectiveDateISO:day,rootOccurrenceId:"repeat:fixture-instance-A:"+day,recordedAtISO:day+"T12:00:00Z",partsCostSnapshot:40+i,payload:{note:"Original V2 note "+i,hours:i/10}});
  }
  task.calendarDateISO="2026-11-01";
  const child={...structuredClone(task),id:"fixture-child",variant:"instance",templateId:task.id,completedDates:["2026-09-01"],manualHistory:[],occurrenceNotes:{"2026-09-01":"Child history note"},occurrenceHours:{"2026-09-01":0.5},inventoryId:"fixture-child-inventory"};state.tasksInterval.push(child);state.inventory.push({id:child.inventoryId,linkedTaskId:child.id,qty:3});
  for(const day of ["2026-10-28","2026-11-01","2026-12-01"])state.maintenanceOccurrencesV2.push({id:"future-"+day,system:"v2",schemaVersion:2,taskId:"fixture-v2-A",instanceId:"fixture-instance-A",legacyTaskId:task.id,eventType:"scheduled",effectiveDateISO:day,rootOccurrenceId:"repeat:fixture-instance-A:"+day,recordedAtISO:"2026-10-01T12:00:00Z",payload:{note:"Stored future schedule",hours:0.5}});
  state.maintenanceTasksV2.push({id:"other-v2",legacyTaskId:"fixture-task-B",name:task.name});state.maintenanceCalendarInstancesV2.push({id:"other-instance",taskId:"other-v2",legacyTaskId:"fixture-task-B",system:"v2",schemaVersion:2,instanceMode:"repeat",startDateISO:"2026-11-01",repeatRule:{enabled:true,basis:"calendar_day",every:7},status:"active"});
  state.maintenanceOccurrencesV2.push({id:"other-event",system:"v2",schemaVersion:2,taskId:"other-v2",instanceId:"other-instance",eventType:"scheduled",effectiveDateISO:"2026-11-01",rootOccurrenceId:"repeat:other-instance:2026-11-01",recordedAtISO:"2026-10-01T12:00:00Z",payload:{note:"Independent same-name schedule"}});
  state.garnetCleanings=[{id:"garnet-keep",dateISO:"2026-09-01",completed:true,cost:90}];state.dailyCutHours=[{dateISO:"2026-09-01",hours:8}];state.pumpEff.notes=[];return state;
}
const legacy=(scope="single",dateISO="2026-11-01",taskId="fixture-task-A")=>({kind:"legacy",taskId,scope,dateISO});
const repeat=(kind="repeatRemove",dateISO="2026-11-01")=>({kind,instanceId:"fixture-instance-A",taskId:"fixture-v2-A",rootOccurrenceId:"repeat:fixture-instance-A:"+dateISO,dateISO});
module.exports={rich,legacy,repeat};
