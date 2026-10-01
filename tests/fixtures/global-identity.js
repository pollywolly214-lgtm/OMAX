"use strict";
const legacyIds=["pump_rebuild","jewel_nozzle_clean","mixing_tube_rotation","pump_tube_noz_filter",...Array.from({length:24},(_,i)=>`legacy-${i+4}`)];
const oldInventory="inventory_mqgqwky1",oldTask="maintenance_task_v2_mqgqwlx5";
const suffixes=["mrml3183","mqi23bhy","mqgqwlx5"];
function fixture(){
  const day=index=>new Date(Date.UTC(2026,0,1)+index*86400000).toISOString().slice(0,10);
  const legacy=i=>({id:legacyIds[i],name:"Same display name",inventoryId:i?oldInventory:"inventory_msnpt6ic",manualHistory:[{dateISO:"2025-01-01",note:"retain"}],completedDates:["2025-01-01"]});
  const tasks=[1,2,3,18,27].map((i,index)=>({id:index<3?oldTask:`task-unique-${i}`,legacyTaskId:legacyIds[i],name:"Same display name",inventoryId:oldInventory,categoryRef:"maintenance-root",createdAtISO:"2026-09-01T00:00:00.000Z"}));
  const instances=[],occurrences=[];
  for(let group=0;group<3;group++)for(let logical=0;logical<3;logical++){
    const startDateISO=`2026-09-0${group+1}`,task=tasks[logical],id=`maintenance_instance_v2_${suffixes[group]}`;
    instances.push({id,taskId:task.id,legacyTaskId:task.legacyTaskId,instanceMode:group===2?"repeat":"one_time",startDateISO,repeatRule:group===2?{enabled:true,basis:"calendar_week",every:1}:null,status:"active",createdAtISO:`${startDateISO}T00:00:00.000Z`});
    occurrences.push({id:`maintenance_occurrence_v2_${suffixes[group]}`,taskId:task.id,instanceId:id,legacyTaskId:task.legacyTaskId,eventType:"scheduled",effectiveDateISO:startDateISO,recordedAtISO:`${startDateISO}T00:00:00.000Z`,payload:{note:"preserve",hours:2}});
  }
  while(instances.length<80){const i=instances.length,task=tasks[i%5];instances.push({id:`instance-unique-${i}`,taskId:task.id,legacyTaskId:task.legacyTaskId,instanceMode:"one_time",startDateISO:`2026-08-${String(i%28+1).padStart(2,"0")}`,repeatRule:null,status:"active"});}
  for(let i=0;i<2;i++){const base=occurrences[i];occurrences.push({...base,id:`moved-${i}`,eventType:"moved",rootOccurrenceId:base.id,supersedesEventId:base.id,effectiveDateISO:"2026-09-12",recordedAtISO:`2026-09-05T0${i}:00:00.000Z`,payload:{note:"moved history",toDateISO:"2026-09-12"}});}
  occurrences.push({...occurrences[0],id:"completed-event",eventType:"completed",rootOccurrenceId:occurrences[0].id,supersedesEventId:"moved-0",effectiveDateISO:"2026-09-12",recordedAtISO:"2026-09-13T00:00:00.000Z"});
  occurrences.push({...occurrences[6],id:"repeat-completed",eventType:"completed",rootOccurrenceId:`repeat:${instances[6].id}:slot:2`,recordedAtISO:"2026-09-14T00:00:00.000Z"});
  return {schema:72,syncMeta:{rev:1790781035355,updatedBy:"synthetic"},inventory:legacyIds.map((id,i)=>({id:i?oldInventory:"inventory_msnpt6ic",linkedTaskId:id,name:i?"Same display name":"Pump Rebuild",qtyNew:i+1,qtyOld:2,note:"retain exactly",folderId:"inventory-root"})),inventoryFolders:[{id:"inventory-root",parent:null,name:"Inventory"}],tasksInterval:Array.from({length:15},(_,i)=>legacy(i)),tasksAsReq:Array.from({length:13},(_,i)=>legacy(i+15)),maintenanceTasksV2:tasks,maintenanceCalendarInstancesV2:instances,maintenanceOccurrencesV2:occurrences,settingsFolders:[{id:"maintenance-root",name:"Maintenance",parent:null}],jobFolders:[{id:"jobs_root",name:"Jobs",parent:null}],cuttingJobs:[{id:"active-job",name:"Keep",cat:"jobs_root",notes:"Keep"}],completedCuttingJobs:Array.from({length:67},(_,i)=>({id:`completed-job-${i}`,name:"Keep",cat:"jobs_root",manualLogs:[{hours:2}]})),dailyCutHours:Array.from({length:80},(_,i)=>({dateISO:day(i),hours:3})),totalHistory:Array.from({length:70},(_,i)=>({dateISO:day(i),hours:100+i})),receiptTrackerWeeks:[{key:"2026-W01",rows:[{date:"2026-01-01",purchased:"keep",qty:3,inventoryItemId:""}]}],pumpEff:{baselineRPM:3500,entries:[{rpm:3400,dateISO:"2026-01-01"}],notes:[{text:"Keep"}]},orderRequests:[],garnetCleanings:[],inventoryMaterials:[],inventoryTransactions:[],deletedItems:[],appConfig:{dailyHours:8},dashboardLayout:{x:1},costLayout:{x:2},jobLayout:{x:3},unknownEvidence:{note:"Same display name",custom:[1,2,3]}};
}
module.exports={fixture,legacyIds,oldInventory,oldTask,suffixes};
