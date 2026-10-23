"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const archive=require("../js/maintenanceTaskArchive"),identity=require("../js/globalIdentityRepair"),costs=require("../js/cutCostFeedback");
const {fixture,trashFor}=require("./fixtures/mdel01-maintenance-task"),{harness}=require("./mdel01-harness.cjs"),clone=structuredClone;
const core=fs.readFileSync("js/core.js","utf8"),calendar=fs.readFileSync("js/calendar.js","utf8");
const deleted=source=>archive.plan(source,"fixture-task-A",trashFor(source));
const confirm=state=>archive.key(state.deletedItems.find(entry=>entry.id==="fixture-trash-A"));
const restore=h=>h.api.restore("fixture-trash-A",confirm(h.local));
function rich(){
  const source=fixture(),task=source.tasksInterval[0];
  task.completedDates.push("2026-10-02","2026-10-03");task.notes="Entire archived configuration and notes";
  task.manualHistory=[{id:"legacy-one",dateISO:"2026-10-02",status:"completed",partsCostSnapshot:15,hours:1,note:"First independent event"},
    {id:"legacy-two",dateISO:"2026-10-02",status:"completed",partsCostSnapshot:25,hours:2,note:"Second independent event"}];
  const first=source.maintenanceOccurrencesV2[0];
  source.maintenanceOccurrencesV2.push({...clone(first),id:"fixture-event-other-root",rootOccurrenceId:"repeat:fixture-instance-A:slot:2",partsCostSnapshot:25,payload:{hours:1,note:"Independent same-day root"}});
  return source;
}
function compatibility(state){
  const context=vm.createContext({window:{...clone(state),OMAXMaintenanceTaskArchive:archive},console,normalizeDateISO:value=>value||null});
  vm.runInContext(core.slice(core.indexOf("function detectMaintenanceRecordSystem"),core.indexOf("function runMaintenanceV2SafetyChecks")),context);
  return clone(context.buildMaintenanceCompatibilityStream());
}
for(const [name,make]of [["no completion history",()=>{const s=fixture();s.tasksInterval[0].completedDates=[];s.tasksInterval[0].manualHistory=[];s.maintenanceTasksV2=[];s.maintenanceCalendarInstancesV2=[];s.maintenanceOccurrencesV2=[];return s;}],
  ["multiple dates, notes, same-day manual/V2 history and linked inventory",rich]]){
  test("delete/restore "+name+" is one exact transfer each, without generating a task ID",async()=>{
    const source=make(),deletion=harness({initial:source}),removed=await deletion.api.remove("fixture-task-A");
    assert.equal(removed.saved,true,removed.error);assert.equal(removed.verified,true);assert.equal(deletion.window.__recoveryInspectMode,false);
    const archived=deletion.cloud,entry=archived.deletedItems[0],h=harness({initial:archived,forbidNewId:true,staleListener:true}),before=clone(h.cloud);
    const result=await restore(h),actual=h.cloud,expected=archive.planRestore(before,entry.id);
    assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);assert.equal(result.operation,"restore");assert.deepEqual(result.archiveEvidence,entry);
    assert.equal(h.commits,1);assert.equal(h.writeTransactions,1);assert.equal(h.readTransactions,2);assert.equal(h.documentReads,0);
    assert.deepEqual({...actual,syncMeta:before.syncMeta},expected);assert.deepEqual(h.local,actual);
    assert.deepEqual(actual.tasksInterval.find(task=>task.id==="fixture-task-A"),source.tasksInterval[0]);assert.deepEqual(archived.deletedItems[0].payload,source.tasksInterval[0]);
    assert.equal(archive.resolve(actual,"fixture-task-A").status,"active");assert.equal(actual.deletedItems.length,0);assert.equal(actual.tasksInterval.filter(task=>task.id==="fixture-task-A").length,1);
    for(const field of Object.keys(source).filter(field=>!["syncMeta","tasksInterval","deletedItems"].includes(field)))assert.deepEqual(actual[field],source[field],field);
    assert.equal(h.window.__recoveryInspectMode,false);assert.equal(h.window.__autosaveDisabled,false);assert.equal(identity.integrity(actual).valid,true);
    assert.deepEqual(harness({initial:actual}).local,actual);
  });
}
test("as-required original list and complete older archive payload survive without originalId metadata",async()=>{
  const source=rich(),task=source.tasksInterval.shift();task.mode="asreq";source.tasksAsReq.push(task);
  const entry={...trashFor(fixture()),payload:clone(task),meta:{list:"asreq"},deletedAt:"2020-01-01T00:00:00Z"};
  const archived=archive.plan(source,task.id,{...entry,meta:{...entry.meta,originalId:task.id}});archived.deletedItems[0]=entry;
  const h=harness({initial:archived,forbidNewId:true}),result=await restore(h);assert.equal(result.saved,true,result.error);
  assert.deepEqual(h.cloud.tasksAsReq,[task]);assert.deepEqual(h.cloud.tasksInterval,archived.tasksInterval);assert.equal(h.cloud.deletedItems.length,0);
});
test("payload mode alone is valid original-list evidence; no list evidence is rejected",()=>{
  const s=deleted(fixture());delete s.deletedItems[0].meta;assert.equal(archive.planRestore(s,"fixture-trash-A").tasksInterval.length,2);
  delete s.deletedItems[0].payload.mode;assert.throws(()=>archive.planRestore(s,"fixture-trash-A"),/unambiguous/);
});
test("compatibility evidence, independent same-day roots, parts/hours/costs are identical in all three states",()=>{
  const source=rich(),archived=deleted(source),restored=archive.planRestore(archived,"fixture-trash-A");
  const evidence=state=>compatibility(state).map(({taskName,...row})=>row).sort((a,b)=>a.streamId.localeCompare(b.streamId));
  assert.deepEqual(evidence(archived),evidence(source));assert.deepEqual(evidence(restored),evidence(source));
  const expenses=state=>{const streams=compatibility(state).filter(row=>row.sourceSystem==="v2"&&row.isCompleted);return costs.maintenanceRows(streams,state,streams).map(row=>[row.rootOccurrenceId,row.partCost,row.maintenanceHrs,row.totalCost]);};
  assert.deepEqual(expenses(archived),expenses(source));assert.deepEqual(expenses(restored),expenses(source));assert.equal(expenses(source).length,2);
});
test("existing repeat projections resume unchanged; no rule, anchor or stored event is invented",()=>{
  const source=rich(),archived=deleted(source),restored=archive.planRestore(archived,"fixture-trash-A");
  const start=calendar.indexOf("function projectV2RepeatDates("),body=calendar.slice(start,calendar.indexOf("\n}",start)+2);
  const project=state=>{const context=vm.createContext({Date,window:{...state,OMAXMaintenanceTaskArchive:archive},normalizeDateKey:v=>v,parseDateLocal:v=>new Date(v+"T00:00:00"),ymd:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")});vm.runInContext(body,context);return clone(context.projectV2RepeatDates(state.maintenanceCalendarInstancesV2[0]));};
  assert.ok(project(source).length>0);assert.deepEqual(project(archived),[]);assert.deepEqual(project(restored),project(source));
  assert.deepEqual(restored.maintenanceCalendarInstancesV2,source.maintenanceCalendarInstancesV2);assert.deepEqual(restored.maintenanceOccurrencesV2,source.maintenanceOccurrencesV2);
});
for(const [name,mutate]of [
  ["conflicting active ID",s=>s.tasksAsReq.push(clone(s.deletedItems[0].payload))],
  ["duplicate archive payload ID",s=>s.deletedItems.push({...clone(s.deletedItems[0]),id:"another-trash"})],
  ["duplicate archive entry ID",s=>s.deletedItems.push({...clone(s.deletedItems[0]),payload:{...s.deletedItems[0].payload,id:"different-task"}})],
  ["wrong original ID",s=>s.deletedItems[0].meta.originalId="fixture-task-B"],
  ["contradictory original list",s=>s.deletedItems[0].meta.list="asreq"],
  ["invalid archive list",s=>s.deletedItems[0].meta.list="other"],
  ["missing list evidence",s=>{delete s.deletedItems[0].meta.list;delete s.deletedItems[0].payload.mode;}],
  ["malformed metadata",s=>s.deletedItems[0].meta=[]],
  ["invalid archive date",s=>s.deletedItems[0].deletedAt="invalid"],
  ["noncanonical payload ID",s=>s.deletedItems[0].payload.id=" bad "],
  ["wrong archive type",s=>s.deletedItems[0].type="inventory"]
])test("pure restore rejects "+name+" without touching evidence",()=>{const state=deleted(rich());mutate(state);const before=clone(state);assert.throws(()=>archive.planRestore(state,"fixture-trash-A"));assert.deepEqual(state,before);});
test("the reported synthetic orphan resolves only to its exact archive; unrelated FK corruption still blocks",()=>{
  const state=deleted(fixture());
  assert.equal(identity.integrity(state).valid,true);state.inventory[1].linkedTaskId="actual-orphan";assert.equal(identity.integrity(state).valid,false);
});
for(const [name,mutate]of [["missing inventory target",s=>s.inventory[1].linkedTaskId="missing"],["broken archived inventory link",s=>s.deletedItems[0].payload.inventoryId="missing"],["invalid protected shape",s=>s.dailyCutHours={}],["embedded file content",s=>s.cuttingJobs.push({id:"bad-file",files:[{id:"bad",dataUrl:"data:application/octet-stream;base64,AAAA"}]})]])test("unrelated "+name+" blocks restoration and leaves recovery evidence",async()=>{
  const initial=deleted(fixture());mutate(initial);const h=harness({initial,expectRecovery:true}),before=h.local,result=await restore(h);
  assert.equal(result.saved,false);assert.equal(h.commits,0);assert.equal(h.writeTransactions,0);assert.deepEqual(h.local,before);assert.equal(h.window.__recoveryInspectMode,true);
});
for(const flag of ["__recoveryInspectMode","__autosaveDisabled","__globalIdentityVerificationPending","__lastImportVerificationError","__lastInventoryIdentityRepairError","__lastIndeterminateSave","__localBackupOnlyMode","__inventoryMaterialMutationPending","__pumpBaselineMutationPending","__pumpLogMutationPending","__waterQualityMutationPending"])
test("existing blocker "+flag+" prevents any restore write and is not cleared",async()=>{
  const h=harness({initial:deleted(fixture())}),evidence=flag==="__recoveryInspectMode"?true:{reason:"Unrelated blocker"};h.window[flag]=evidence;
  assert.equal(h.api.isAvailable(),false);const result=await restore(h);assert.equal(result.saved,false);assert.equal(h.writeTransactions,0);assert.equal(h.window[flag],evidence);
});
test("unconfirmed or stale archive confirmation cannot restore",async()=>{
  const h=harness({initial:deleted(fixture())});assert.equal((await h.api.restore("fixture-trash-A")).saved,false);
  assert.equal((await h.api.restore("fixture-trash-A","outdated archive evidence")).saved,false);assert.equal(h.commits,0);assert.equal(h.writeTransactions,0);
});
test("concurrent Restore/Delete calls share one lock and cannot duplicate the identity",async()=>{
  const h=harness({initial:deleted(rich())}),[first,second,removal]=await Promise.all([restore(h),restore(h),h.api.remove("fixture-task-B")]);
  assert.equal(first.saved,true,first.error);assert.equal(second.saved,false);assert.equal(removal.saved,false);assert.equal(h.commits,1);assert.equal(h.writeTransactions,1);
  assert.equal(h.cloud.tasksInterval.filter(task=>task.id==="fixture-task-A").length,1);assert.equal(h.cloud.deletedItems.length,0);
});
test("matching backup permits only the proved archive transfer; unrelated backup evidence remains intact",async()=>{
  const initial=deleted(rich()),backup=clone(initial),before=clone(backup),h=harness({initial,backup});
  const result=await restore(h);assert.equal(result.saved,true,result.error);assert.deepEqual(backup,before);
});
for(const [name,options]of [["remote revision conflict",{conflict:true}],["permission failure",{reject:true}],["local mutation before transaction",{beforeWrite:({context})=>vm.runInContext("lastLocalMutationAt++",context)}],["unrelated remote change before transaction",{beforeWrite:({cloud})=>cloud.inventory[1].qty++}],["modified prepared inventory",{pendingMutation:s=>s.inventory[1].qty++}],["modified restored history",{pendingMutation:s=>s.tasksInterval.at(-1).manualHistory=[]}]])test(name+" cannot commit or adopt restoration",async()=>{
  const h=harness({initial:deleted(rich()),...options}),before=h.local,result=await restore(h);assert.equal(result.saved,false);assert.equal(result.indeterminate,false);assert.equal(h.commits,0);assert.deepEqual(h.local,before);
});
for(const [name,options]of [["unknown acknowledgement without commit",{unknownWithoutCommit:true}],["acknowledgement lost after commit",{loseAck:true}],["failed independent readback",{readFailure:true}],
  ["different committed task",{readbackMutation:s=>s.tasksInterval.at(-1).id="different"}],
  ["different committed history",{readbackMutation:s=>s.tasksInterval.at(-1).manualHistory=[]}],
  ["newer remote commit",{readbackMutation:s=>s.syncMeta.rev++}],
  ["intervening recovery blocker",{duringVerification:({window})=>window.__globalIdentityVerificationPending=true}],
  ["intervening read-only mode",{duringVerification:({window})=>window.__recoveryInspectMode=true}],
  ["intervening logout",{duringVerification:({context})=>context.FB.user=null}],
  ["workspace switch",{duringVerification:({context})=>context.FB.app.options.projectId="other"}],
  ["adoption failure",{adoptionFailure:true}]
])test("uncertain restoration: "+name+" reports failure, suspends and does not retry",async()=>{
  const h=harness({initial:deleted(rich()),...options}),result=await restore(h);assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.equal(h.window.__recoveryInspectMode,true);assert.equal(h.window.__autosaveDisabled,true);assert.equal(h.writeTransactions,1);
  assert.equal((await restore(h)).saved,false);assert.equal(h.writeTransactions,1);
});
test("the exact transfer proof rejects every unrelated field/history change",()=>{
  const source=deleted(rich()),next=archive.planRestore(source,"fixture-trash-A"),proof={operation:"restore",id:"fixture-task-A",trash:source.deletedItems[0]};
  archive.safetyBaseline(source,next,proof);
  for(const mutate of [s=>s.inventory[0].linkedTaskId="fixture-task-B",s=>s.maintenanceOccurrencesV2.pop(),s=>s.tasksInterval.at(-1).completedDates.pop(),s=>s.tasksInterval.at(-1).id="replacement",s=>s.deletedItems.push(source.deletedItems[0]),s=>s.appConfig.keep=false]){
    const changed=clone(next);mutate(changed);assert.throws(()=>archive.safetyBaseline(source,changed,proof));
  }
});
