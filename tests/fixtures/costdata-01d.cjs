"use strict";
// Synthetic counterparts of the reported relationships; no production IDs/data.
const {fixture:historical,expectedByDate}=require("./costdata-01c.cjs");
const {fixture:archiveState}=require("./mdel01-maintenance-task.js");
const TASK_ID="synthetic-mixing-tube-042",INVENTORY_ID="synthetic-mixing-stock",ARCHIVE_ID="synthetic-maintenance-archive";
function fixture(){
  const state={...archiveState(),...historical()};
  state.inventory=Array.from({length:38},(_,index)=>({id:"synthetic-stock-"+index,name:"Synthetic stock "+index,qtyNew:0,qtyOld:0}));
  state.inventory.push({id:INVENTORY_ID,name:"Mixing Tube .042",linkedTaskId:TASK_ID,qtyNew:8,qtyOld:0,price:42});
  const payload={id:TASK_ID,templateId:TASK_ID,name:"Mixing Tube .042",mode:"interval",variant:"template",inventoryId:INVENTORY_ID,
    interval:100,price:999,downtimeHours:9,recurrence:{enabled:true,basis:"calendar_day",every:7},
    completedDates:["2026-01-05","2026-02-05"],manualHistory:[
      {id:"synthetic-archived-jan",dateISO:"2026-01-05",status:"completed",partsCostSnapshot:42,hours:.5,note:"Retained January evidence"},
      {id:"synthetic-archived-feb",dateISO:"2026-02-05",status:"completed",partsCostSnapshot:43,hours:1,note:"Retained February evidence"}
    ],occurrenceNotes:{"2026-01-05":"Original retained note"},importProvenance:{source:"synthetic fixture"}};
  state.deletedItems=[{id:ARCHIVE_ID,type:"task",payload,meta:{list:"interval",originalId:TASK_ID},label:"Maintenance task: Mixing Tube .042",deletedAt:"2026-10-22T15:00:00Z"}];
  state.inventoryFolders=[];state.settingsFolders=[];
  return state;
}
const expected={...expectedByDate,"2026-01-05":57,"2026-02-05":73};
module.exports={fixture,TASK_ID,INVENTORY_ID,ARCHIVE_ID,expectedByDate:Object.fromEntries(Object.entries(expected).sort(([a],[b])=>a.localeCompare(b)))};
