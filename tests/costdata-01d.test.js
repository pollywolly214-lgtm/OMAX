"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const identity=require("../js/globalIdentityRepair"),archive=require("../js/maintenanceTaskArchive"),costs=require("../js/cutCostFeedback");
const {harness}=require("./mdel01-harness.cjs"),{fixture,TASK_ID,ARCHIVE_ID}=require("./fixtures/costdata-01d.cjs");
const clone=structuredClone;
function candidates(state){return state.deletedItems[0].payload.manualHistory.map((event,index)=>({taskId:TASK_ID,taskName:"Mixing Tube .042",dateISO:event.dateISO,
  historySourceTaskId:TASK_ID,historyField:"manualHistory",historyIndex:index,historyEventId:event.id,sourceEventKey:"synthetic-archive:"+event.id}));}
test("01D actual integrated validator resolves inventory[38] to one exact archived task without repairs",()=>{
  const state=fixture(),before=clone(state),result=identity.integrity(state);
  assert.equal(state.tasksInterval.filter(task=>task.id===TASK_ID).length,0);assert.equal(state.deletedItems.filter(entry=>entry.payload.id===TASK_ID).length,1);
  assert.equal(result.valid,true,result.blockers.join("\n"));assert.deepEqual(result.plan.changes,[]);
  const ref=result.plan.references.find(row=>row.path==="$.inventory[38].linkedTaskId");
  assert.equal(ref.resolution,"archived_task");assert.equal(ref.target,"$.deletedItems[0].payload");assert.equal(ref.value,TASK_ID);
  assert.equal(archive.resolve(state,TASK_ID).status,"archived");assert.deepEqual(state,before);
  const h=harness({initial:state});assert.equal(h.window.__recoveryInspectMode,false);assert.deepEqual(h.local,state);assert.deepEqual(h.cloud,state);assert.equal(h.commits,0);
});
for(const [name,mutate]of [
  ["missing target",state=>state.inventory[38].linkedTaskId="missing-synthetic-task"],
  ["wrong archive type",state=>state.deletedItems[0].type="inventory"],
  ["missing payload ID",state=>delete state.deletedItems[0].payload.id],
  ["wrong original ID",state=>state.deletedItems[0].meta.originalId="different-task"],
  ["wrong original list",state=>state.deletedItems[0].meta.list="asreq"],
  ["invalid archive date",state=>state.deletedItems[0].deletedAt="invalid"],
  ["ambiguous archive",state=>state.deletedItems.push({...clone(state.deletedItems[0]),id:"second-synthetic-archive"})],
  ["active/archive collision",state=>state.tasksInterval.push(clone(state.deletedItems[0].payload))],
  ["broken archived inventory FK",state=>state.deletedItems[0].payload.inventoryId="missing-synthetic-inventory"]
])test("01D "+name+" still fails actual identity adoption and remains in Recovery Mode",()=>{
  const state=fixture();mutate(state);const before=clone(state),result=identity.integrity(state);assert.equal(result.valid,false);assert.ok(result.blockers.length);
  const h=harness({initial:state,expectRecovery:true});assert.equal(h.window.__recoveryInspectMode,true);assert.equal(h.window.__autosaveDisabled,true);
  assert.equal(h.api.isAvailable(),false);assert.equal(h.commits,0);assert.deepEqual(state,before);assert.deepEqual(h.cloud,before);
});
test("01D archive payload costs retain occurrence snapshots and duplicate candidates count once",()=>{
  const state=fixture(),before=clone(state),rows=candidates(state),result=costs.maintenanceRows([...rows,...rows],state);
  assert.deepEqual(result.map(row=>row.totalCost),[57,73]);assert.ok(result.every(row=>!row.costIncomplete&&!row.costEstimated));assert.deepEqual(state,before);
});
test("01D integrated independent-read/CAS restoration retains exact IDs, links, history and financial inputs",async()=>{
  const source=fixture(),h=harness({initial:source,forbidNewId:true,staleListener:true}),entry=source.deletedItems[0];
  const result=await h.api.restore(ARCHIVE_ID,archive.key(entry));assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);
  assert.equal(h.commits,1);assert.equal(h.writeTransactions,1);assert.equal(h.window.__recoveryInspectMode,false);
  const after=h.cloud,expected=archive.planRestore(source,ARCHIVE_ID);delete expected.syncMeta;const business=clone(after);delete business.syncMeta;
  assert.deepEqual(business,expected);assert.deepEqual(after.tasksInterval.find(task=>task.id===TASK_ID),entry.payload);
  assert.equal(after.inventory[38].linkedTaskId,TASK_ID);assert.equal(identity.integrity(after).valid,true);
  assert.deepEqual(costs.maintenanceRows(candidates(source),after).map(row=>row.totalCost),[57,73]);assert.deepEqual(source,fixture());
});
