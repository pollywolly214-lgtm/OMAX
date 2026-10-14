"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),identity=require("../js/globalIdentityRepair");
const {liveState,archivedState}=require("./fixtures/cjo06-archived-job"),clone=structuredClone;
const rejected=state=>{const before=clone(state),check=identity.integrity(state);assert.equal(check.valid,false);assert.ok(check.blockers.length);assert.deepEqual(state,before);return check;};
for(const type of ["job","completed-job"])test("CJO-06 valid "+type+" resolves three exact archived self-references without rewriting",()=>{
  const state=archivedState(type),before=clone(state),owner=state.deletedItems[0].payload;
  assert.equal(owner.cutChronologyHistory.length,3);assert.ok(owner.cutChronologyHistory.every(entry=>entry.jobId===owner.id));
  assert.equal(owner.name,state.completedCuttingJobs[0].name);assert.notEqual(owner.id,state.completedCuttingJobs[0].id);
  const check=identity.integrity(state);assert.equal(check.valid,true,check.blockers.join("\n"));
  const refs=check.plan.references.filter(ref=>ref.resolution==="archived_job_self");
  assert.equal(refs.length,3);assert.deepEqual(refs.map(ref=>ref.path),[0,1,2].map(i=>`$.deletedItems[0].payload.cutChronologyHistory[${i}].jobId`));
  assert.ok(refs.every(ref=>ref.target==="$.deletedItems[0].payload"&&ref.value===owner.id&&ref.proposedId===owner.id));
  assert.deepEqual(check.plan.changes,[]);assert.deepEqual(identity.repairedState(state,check.plan),before);assert.deepEqual(state,before);
});
test("CJO-06 fresh serialized authoritative archive validates without migration",()=>{const source=archivedState(),json=JSON.stringify(source),reload=JSON.parse(json);assert.equal(identity.integrity(reload).valid,true);assert.equal(JSON.stringify(reload),json);});
test("CJO-06 original live history still resolves to exact live job",()=>{const check=identity.integrity(liveState());assert.equal(check.valid,true,check.blockers.join("\n"));assert.ok(check.plan.references.filter(r=>r.path.includes("cutChronologyHistory")).every(r=>r.target.startsWith("$.completedCuttingJobs[")));});
for(const [name,mutate]of [
  ["wrong dangling audit ID",s=>{s.deletedItems[0].payload.cutChronologyHistory[1].jobId="missing";}],
  ["wrong existing live audit ID",s=>{s.deletedItems[0].payload.cutChronologyHistory[1].jobId=s.completedCuttingJobs[0].id;}],
  ["wrong unrelated archived audit ID",s=>{s.deletedItems.push({id:"trash-other",type:"job",payload:{id:"other-archived"},deletedAt:"2026-10-14T00:00:00Z"});s.deletedItems[0].payload.cutChronologyHistory[0].jobId="other-archived";}],
  ["missing audit ID",s=>{delete s.deletedItems[0].payload.cutChronologyHistory[1].jobId;}],
  ["missing owning ID",s=>{delete s.deletedItems[0].payload.id;}],
  ["blank owning ID",s=>{s.deletedItems[0].payload.id="";}],
  ["noncanonical owning ID",s=>{s.deletedItems[0].payload.id=" archived-owner ";}],
  ["numeric owning ID",s=>{s.deletedItems[0].payload.id=123;}],
  ["null owning ID",s=>{s.deletedItems[0].payload.id=null;}],
  ["contradictory archive original ID",s=>{s.deletedItems[0].meta.originalId="different";}],
  ["missing Trash identity",s=>{delete s.deletedItems[0].id;}],
  ["duplicate Trash identity",s=>{s.deletedItems.push({...clone(s.deletedItems[0]),payload:{id:"distinct"}});}],
  ["duplicate archived owning ID",s=>{s.deletedItems.push({...clone(s.deletedItems[0]),id:"other-trash",type:"job"});}],
  ["owning ID also live",s=>{s.cuttingJobs.push(clone(s.deletedItems[0].payload));}],
  ["invalid Trash type",s=>{s.deletedItems[0].type="inventory";}],
  ["missing archive date",s=>{delete s.deletedItems[0].deletedAt;}],
  ["invalid archive date",s=>{s.deletedItems[0].deletedAt="not-a-date";}],
  ["invalid archive metadata",s=>{s.deletedItems[0].meta=[];}],
  ["malformed history container",s=>{s.deletedItems[0].payload.cutChronologyHistory={jobId:"archived-owner"};}],
  ["malformed history entry",s=>{s.deletedItems[0].payload.cutChronologyHistory[0]=null;}],
  ["unrelated dangling root jobId",s=>{s.unknownEvidence.jobId="missing";}],
  ["unrelated archived-job consumer",s=>{s.unknownEvidence.jobId="archived-owner";}],
  ["archived manual-log self-reference is outside exception",s=>{s.deletedItems[0].payload.manualLogs[0].jobId="archived-owner";}],
  ["different broken foreign key in same audit",s=>{s.deletedItems[0].payload.cutChronologyHistory[0].inventoryId="missing";}],
  ["different broken foreign key in payload",s=>{s.deletedItems[0].payload.requestId="missing";}],
  ["live chronology dangling foreign key",s=>{s.completedCuttingJobs[0].cutChronologyHistory=[{jobId:"missing"}];}],
  ["unrelated duplicate live jobs",s=>{s.cuttingJobs.push(clone(s.completedCuttingJobs[0]));}]
])test("CJO-06 rejects "+name,()=>{const state=archivedState();mutate(state);rejected(state);});
test("CJO-06 valid original-ID metadata remains accepted",()=>{const state=archivedState();state.deletedItems[0].meta.originalId=state.deletedItems[0].payload.id;assert.equal(identity.integrity(state).valid,true);});
test("CJO-06 ordinary archive without chronology keeps existing behavior",()=>{const state=archivedState();delete state.deletedItems[0].payload.cutChronologyHistory;assert.equal(identity.integrity(state).valid,true);});
