"use strict";
const initial=require("./costdata-01a.cjs");
function fixture(){
  const state=initial(),task=(id,manualHistory,extra={})=>({id,name:"Synthetic "+id,mode:"interval",variant:"template",price:null,downtimeHours:null,completedDates:[],manualHistory,...extra});
  const event=(id,dateISO,partsCostSnapshot,hours)=>({id,dateISO,status:"completed",...(partsCostSnapshot===null?{}:{partsCostSnapshot}),...(hours===null?{}:{hours})});
  state.tasksInterval=[
    task("recorded-parts",[event("jan-recorded","2026-01-02",12,null)]),
    task("configured-parts",[event("feb-configured","2026-02-04",null,null)],{price:25}),
    task("unknown",[event("mar-unknown","2026-03-10",null,null)]),
    task("same-day",[event("apr-one","2026-04-15",8,null),event("apr-two","2026-04-15",8,null),event("apr-three","2026-04-15",19,null)]),
    task("zero-parts",[event("may-zero","2026-05-12",0,null)]),
    task("unknown-parts",[event("may-hours","2026-05-25",null,1)]),
    task("later-partial",[event("oct-partial","2026-10-10",9,null)]),
    task("complete",[event("jun-complete","2026-06-18",60,1),event("oct-complete","2026-10-20",30,.5)]),
    task("not-completed",[{...event("scheduled","2026-05-30",42,null),status:"scheduled"}]),
    task("future",[event("future-event","2026-10-27",10,null)])
  ];
  state.tasksAsReq=[];state.deletedItems=[];state.maintenanceTasksV2=[];state.maintenanceCalendarInstancesV2=[];state.maintenanceOccurrencesV2=[];
  return state;
}
function productionShape(){
  const state=fixture(),day=(start,offset)=>{const d=new Date(start+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
  const entries=[
    ...Array.from({length:22},(_,i)=>({id:"synthetic-early-"+i,dateISO:day("2026-01-02",i*7),status:"completed",...(i<20?{partsCostSnapshot:5+i}:{})})),
    ...Array.from({length:12},(_,i)=>({id:"synthetic-late-incomplete-"+i,dateISO:day("2026-10-01",i),status:"completed",partsCostSnapshot:20})),
    ...Array.from({length:50},(_,i)=>({id:"synthetic-complete-"+i,dateISO:day("2026-06-18",i*2),status:"completed",partsCostSnapshot:10,hours:1}))
  ];
  state.tasksInterval=[{id:"synthetic-production-shape",name:"Synthetic historical event pattern",mode:"interval",variant:"template",price:null,downtimeHours:null,completedDates:[],manualHistory:entries}];
  return state;
}
module.exports={fixture,productionShape};
