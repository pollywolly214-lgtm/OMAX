"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const purchases=require("../js/purchaseFinancials"),financial=require("../js/financialReconciliation"),feedback=require("../js/cutCostFeedback"),fixture=require("./fixtures/costdata-01a.cjs");
const freeze=value=>{if(value&&typeof value==="object"){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};
test("historical purchase projection preserves distinct same-day items, allocated charges and provenance without writes",()=>{
  const state=freeze(fixture()),before=JSON.stringify(state),rows=purchases.normalizePurchaseHistory(state.receiptTrackerWeeks);
  assert.equal(rows.length,6);assert.equal(rows.filter(row=>row.costIncomplete).length,1);
  assert.equal(rows.filter(row=>!row.costIncomplete).reduce((sum,row)=>sum+row.financials.totalSpend,0),131);
  assert.equal(rows.filter(row=>row.row.orderId).reduce((sum,row)=>sum+row.financials.shipping+row.financials.tax,0),6);
  const r=financial.build({completedJobs:[],profit:()=>{},range:"ytd",today:"2026-10-21",purchaseWeeks:state.receiptTrackerWeeks,purchaseFinancials:purchases.getPurchaseFinancials});
  assert.equal(r.purchases.total,131);assert.equal(r.purchases.incomplete,1);assert.equal(r.totals.revenue,0);assert.equal(r.netWaterjetImpact,null);assert.equal(JSON.stringify(state),before);
});
test("only exact stable purchase identities deduplicate; distinct orders and untagged identical transactions survive",()=>{
  const row={date:"2026-01-15",purchased:"Part",cost:10,qty:2,shipping:1,tax:1};
  const weeks=freeze([{rows:[{...row,import_event_id:"same"},{...row,import_event_id:"same",cost:"10"},row,{...row},{...row,orderId:"one",lineId:"a"},{...row,orderId:"one",lineId:"a"},{...row,orderId:"one",lineId:"b"},{...row,orderId:"two",lineId:"a"}]}]);
  assert.equal(purchases.normalizePurchaseHistory(weeks).length,6);
  const r=financial.build({completedJobs:[],profit:()=>{},range:"365d",today:"2026-10-21",purchaseWeeks:weeks,purchaseFinancials:purchases.getPurchaseFinancials});
  assert.equal(r.purchases.total,132);assert.equal(r.purchases.count,6);
});
test("conflicting stable purchase identities stay visible and cannot produce a purported complete total",()=>{
  const rows=[{id:"same",date:"2026-01-15",purchased:"Part",cost:10,qty:1},{id:"same",date:"2026-01-15",purchased:"Part",cost:20,qty:1},{id:"same",date:"2026-01-15",purchased:"Part",cost:10,qty:1}];
  const projection=purchases.normalizePurchaseHistory([{rows}]);assert.equal(projection.length,2);assert.ok(projection.every(row=>row.identityConflict));
  const r=financial.build({completedJobs:[],profit:()=>{},range:"all",today:"2026-10-21",purchaseWeeks:[{rows}],purchaseFinancials:purchases.getPurchaseFinancials});assert.equal(r.purchases.count,0);assert.equal(r.purchases.incomplete,2);
});
test("YTD and 12-month periods include January; short periods and impossible dates are excluded",()=>{
  assert.equal(financial.period("ytd","2026-10-21").startISO,"2026-01-01");
  assert.equal(financial.period("30d","2026-10-21").startISO,"2026-09-22");
  for(const range of ["ytd","365d","30d"]){const r=financial.build({completedJobs:[],profit:()=>{},range,today:"2026-10-21",purchaseWeeks:fixture().receiptTrackerWeeks,purchaseFinancials:purchases.getPurchaseFinancials});assert.equal(r.purchases.total,range==="30d"?36:131);}
  assert.equal(financial.dateKey("2026-02-31"),null);
});
test("distinct same-day maintenance identities retain their own occurrence snapshots and duration",()=>{
  const state=freeze(fixture()),before=JSON.stringify(state);
  const rows=feedback.maintenanceRows(["apr-a","apr-b"].map(historyEventId=>({taskId:"apr",taskName:"Filter",dateISO:"2026-04-15",historyEventId})),state);
  assert.equal(rows.length,2);assert.deepEqual(rows.map(row=>row.totalCost),[50,45]);assert.ok(rows.every(row=>row.costEstimated===false));assert.equal(JSON.stringify(state),before);
});
test("a uniquely linked legacy/V2 mirror with a legacy history ID counts once; explicitly distinct import identities survive",()=>{
  const state=fixture();state.tasksInterval.find(row=>row.id==="july").manualHistory=[{id:"legacy-july",dateISO:"2026-07-15",status:"completed",partsCostSnapshot:25,hours:.5}];
  const rows=[{taskId:"july",dateISO:"2026-07-15",historyEventId:"legacy-july"},{taskId:"july-v2",dateISO:"2026-07-15",sourceSystem:"v2",rootOccurrenceId:"july-base"}];
  assert.equal(feedback.maintenanceRows(rows,state).length,1);
  state.maintenanceOccurrencesV2.at(-1).import_event_id="separate-physical-event";
  assert.equal(feedback.maintenanceRows(rows,state).length,2);
});
for(const timezone of ["America/Chicago","Pacific/Kiritimati"])
test(`canonical business dates survive repeated normalization in ${timezone}`,()=>{
  const old=process.env.TZ;process.env.TZ=timezone;
  try{const core=fs.readFileSync("js/core.js","utf8"),a=core.indexOf("function parseDateLocal("),b=core.indexOf("function normalizeDateISO("),end=core.indexOf("\nfunction ",b+1),c=vm.createContext({Date});vm.runInContext(core.slice(a,end),c);
    for(const date of ["2026-01-01","2026-01-15","2026-04-15","2026-07-15","2026-10-21"]){assert.equal(c.normalizeDateISO(date),date);assert.equal(c.normalizeDateISO(c.normalizeDateISO(date)),date);}
    assert.equal(c.normalizeDateISO("2026-02-31"),null);
  }finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
