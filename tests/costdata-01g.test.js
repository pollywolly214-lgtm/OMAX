"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const cancel=require("../js/maintenanceCalendarCancellation"),archive=require("../js/maintenanceTaskArchive"),identity=require("../js/globalIdentityRepair"),costs=require("../js/cutCostFeedback"),financial=require("../js/financialReconciliation");
const {fixture}=require("./fixtures/costdata-01g.cjs"),{harness}=require("./mdel01-harness.cjs"),{harness:historyHarness}=require("./mhist-harness.cjs");
const renderers=fs.readFileSync("js/renderers.js","utf8"),start=renderers.indexOf("function maintenanceEventTooltip("),end=renderers.indexOf("function drawCostChart(",start),context=vm.createContext({window:{OMAXFinancialReconciliation:financial},Date});
vm.runInContext(renderers.slice(start,end),context);
function financialInputs(state){
  const tasks=[...state.tasksInterval,...state.tasksAsReq,...state.deletedItems.filter(row=>row.type==="task").map(row=>row.payload)];
  const candidates=tasks.flatMap(task=>(task.manualHistory||[]).flatMap((event,index)=>event.status!=="completed"?[]:[{taskId:task.id,taskName:task.name,dateISO:event.dateISO,
    settingsLink:"#/settings?taskId="+task.id,historySourceTaskId:task.id,historyField:"manualHistory",historyIndex:index,historyEventId:event.id,
    sourceEventKey:JSON.stringify(["legacy",task.id,"manualHistory",["id",event.id]])}]));
  const rows=costs.maintenanceRows(candidates,state);
  return {complete:rows.filter(row=>!row.costIncomplete).map(row=>[row.sourceEventKey,row.totalCost]).sort(),
    markers:JSON.parse(JSON.stringify(context.buildIncompleteMaintenanceMarkers(rows))).map(row=>[row.sourceEventKey,row.dateISO,row.knownParts,row.knownDuration,row.fullCost]).sort()};
}
function client(options={}){const h=harness({initial:fixture(),...options,windowModules:{OMAXMaintenanceCalendarCancellation:cancel}});let next=0;h.context.genId=prefix=>prefix+"-integration-"+(++next);return h;}
const operation={kind:"legacy",taskId:"recorded-parts",scope:"single",dateISO:"2026-01-02"};
test("01G actual CAS cancellation, archive and exact-ID restore conserve COSTDATA financial inputs and incomplete source identities",async()=>{
  const h=client(),before=h.cloud,inputs=financialInputs(before),api=h.window.maintenanceCalendarCancellationApi;
  assert.equal(identity.integrity(before).valid,true);assert.equal(inputs.complete.reduce((sum,[,value])=>sum+value,0),226);
  const result=await api.run(api.review(operation));assert.equal(result.verified,true,result.error);assert.equal(h.window.__recoveryInspectMode,false);
  assert.deepEqual(financialInputs(h.cloud),inputs);assert.deepEqual(h.cloud.tasksInterval[0].manualHistory,before.tasksInterval[0].manualHistory);
  assert.equal(h.cloud.tasksInterval[0].calendarCancellations.length,1);assert.equal(cancel.integrity(h.cloud).valid,true);
  const archived=await h.api.remove("recorded-parts");assert.equal(archived.verified,true,archived.error);assert.deepEqual(financialInputs(h.cloud),inputs);
  assert.equal(archive.resolve(h.cloud,"recorded-parts").status,"archived");assert.equal(identity.integrity(h.cloud).valid,true);
  const entry=h.cloud.deletedItems.find(row=>row.payload?.id==="recorded-parts"),payload=structuredClone(entry.payload);
  const restored=await h.api.restore(entry.id,archive.key(entry));assert.equal(restored.verified,true,restored.error);assert.deepEqual(financialInputs(h.cloud),inputs);
  assert.deepEqual(h.cloud.tasksInterval.find(row=>row.id==="recorded-parts"),payload);assert.equal(h.cloud.inventory[0].linkedTaskId,"recorded-parts");assert.equal(h.commits,3);
  assert.equal(h.window.__recoveryInspectMode,false);assert.equal(h.window.__autosaveDisabled,false);assert.deepEqual(before,fixture());
});
test("01G MHIST history retains cancelled incomplete January evidence regardless of COSTDATA's selected financial period",()=>{
  const source=fixture(),state=cancel.plan(source,operation,{id:"synthetic-cancellation",actorUid:"fixture",atISO:"2026-10-26T17:00:00Z"}).state;
  const h=historyHarness(state);h.window.__cuttingFinancialRange="30d";const rows=h.history("recorded-parts"),row=rows.find(row=>row.dateISO==="2026-01-02");
  assert.ok(row);assert.equal(row.status,"completed");assert.equal(row.activeCalendar,false);assert.match(row.calendarHiddenReason,/Authorized/);
  assert.deepEqual(financialInputs(state),financialInputs(source));assert.deepEqual(h.window.tasksInterval,state.tasksInterval);
});
for(const options of [{conflict:true},{readFailure:true}])test("01G failed/uncertain cancellation retains historical inputs and cannot continue writing: "+JSON.stringify(options),async()=>{
  const h=client(options),before=h.cloud,inputs=financialInputs(before),api=h.window.maintenanceCalendarCancellationApi;
  const result=await api.run(api.review(operation));assert.equal(result.saved,false);assert.deepEqual(financialInputs(h.cloud),inputs);
  if(options.readFailure){assert.equal(result.indeterminate,true);assert.equal(h.window.__recoveryInspectMode,true);assert.equal(h.window.__autosaveDisabled,true);}
  else assert.equal(h.commits,0);
  const commits=h.commits;await api.run(api.review(operation));assert.equal(h.commits,commits);
});
