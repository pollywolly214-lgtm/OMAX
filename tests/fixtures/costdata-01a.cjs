"use strict";
const orders=require("../../js/purchaseOrders");
module.exports=()=>{
  const task=(id,extra={})=>({id,name:"Filter",mode:"interval",variant:"template",interval:100,price:99,downtimeHours:2,completedDates:[],manualHistory:[],...extra});
  const order=orders.plan({orderId:"oct-order",date:"2026-10-15",shipping:"4",tax:"2",poNumber:"0010",items:[{lineId:"oct-a",purchased:"October part",cost:"10",qty:"2"},{lineId:"oct-b",purchased:"October consumable",cost:"10",qty:"1"}]}).rows;
  return {
    tasksInterval:[
      task("jan",{manualHistory:[{date:"2026-01-15",partsCostSnapshot:10,hours:.5}]}),
      task("apr",{completedDates:["2026-04-15"],manualHistory:[{id:"apr-a",dateISO:"2026-04-15",status:"completed",partsCostSnapshot:20,hours:1},{id:"apr-b",dateISO:"2026-04-15",status:"completed",partsCostSnapshot:30,hours:.5}]}),
      task("july",{completedDates:["2026-07-15"]}),
      task("oct",{completedDates:["2026-10-15"],manualHistory:[{dateISO:"2026-10-15",status:"completed",partsCostSnapshot:40,hours:1}]}),
      task("incomplete",{name:"Missing price/duration",price:null,downtimeHours:null,completedDates:["2026-01-20"]})
    ],tasksAsReq:[],
    maintenanceTasksV2:[{id:"july-v2",legacyTaskId:"july",system:"v2",name:"Filter",price:999,downtimeHours:9}],
    maintenanceCalendarInstancesV2:[{id:"july-instance",taskId:"july-v2",system:"v2",instanceMode:"one_time",startDateISO:"2026-07-15",status:"active"}],
    maintenanceOccurrencesV2:[{id:"july-base",system:"v2",taskId:"july-v2",instanceId:"july-instance",eventType:"scheduled",effectiveDateISO:"2026-07-15",recordedAtISO:"2026-07-14T12:00:00Z"},{id:"july-done",system:"v2",taskId:"july-v2",instanceId:"july-instance",rootOccurrenceId:"july-base",eventType:"completed",originalDateISO:"2026-07-15",effectiveDateISO:"2026-07-15",loggedHours:.5,partsCostSnapshot:25,recordedAtISO:"2026-07-16T12:00:00Z"}],
    totalHistory:[{dateISO:"2025-12-31",hours:100},{dateISO:"2026-01-15",hours:110,import_event_id:"meter-jan"},{dateISO:"2026-04-15",hours:140},{dateISO:"2026-07-15",hours:170},{dateISO:"2026-10-15",hours:200}],
    dailyCutHours:[{dateISO:"2026-01-16",hours:3,source:"manual"}],
    receiptTrackerWeeks:[
      {key:"2026-W03",year:2026,week:3,rows:[{date:"2026-01-15",purchased:"January restored purchase",cost:10,qty:2,shipping:3,tax:2,import_event_id:"jan-purchase",importProvenance:{sourceRecord:{import_event_id:"jan-purchase",date:"2026-01-15",purchased:"January restored purchase",cost:10,qty:2}}},{date:"2026-01-20",purchased:"Unknown price",cost:null,qty:1}]},
      {key:"2026-W16",year:2026,week:16,rows:[{date:"2026-04-15",purchased:"April part",cost:30,qty:1}]},
      {key:"2026-W29",year:2026,week:29,rows:[{date:"2026-07-15",purchased:"July part",cost:40,qty:1}]},
      {key:"2026-W42",year:2026,week:42,rows:order}
    ],
    orderRequests:[{id:"approved-request",status:"approved",resolvedAt:"2026-01-15",items:[{id:"request-line",name:"January restored purchase",status:"approved",maintenance:true,price:10,qty:2}]}],
    cuttingJobs:[],completedCuttingJobs:["2026-07-15","2026-10-15"].map((date,index)=>({id:"cut-"+index,cutNumber:"C00"+(index+1),name:"Later cut",completedAtISO:date,startISO:date,dueISO:date,estimateHours:2,chargeRate:150,costRate:30,materialCost:0,materialQty:1,failurePercent:0,files:[],manualLogs:[],priority:1})),
    deletedItems:[]
  };
};
