"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm");
const cancellation=require("../js/maintenanceCalendarCancellation"),identity=require("../js/globalIdentityRepair"),archive=require("../js/maintenanceTaskArchive");
const {harness}=require("./mdel01-harness.cjs"),{rich,legacy,repeat}=require("./fixtures/rfs02b-maintenance"),clone=structuredClone;
function client(options={}){const h=harness({initial:rich(),...options,windowModules:{OMAXMaintenanceCalendarCancellation:cancellation}});let sequence=0;h.context.genId=prefix=>prefix+"-"+(++sequence);return{...h,h,api:h.window.maintenanceCalendarCancellationApi,run:op=>h.window.maintenanceCalendarCancellationApi.run(h.window.maintenanceCalendarCancellationApi.review(op))};}
const execute=(h,op)=>h.api.run(h.api.review(op));
const stamp={id:"cancel-proof",actorUid:"actor",atISO:"2026-10-26T17:00:00Z"};
for(const op of [legacy("single","2026-09-01"),legacy("single"),legacy("future"),legacy("all"),repeat(),repeat("repeatStop")])test("12 historical occurrences remain exact through "+JSON.stringify(op),async()=>{
  const c=client(),h=c.h,before=h.cloud,result=await c.run(op);assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);assert.equal(h.commits,1);assert.equal(h.documentReads,0);assert.equal(h.readTransactions,2);assert.equal(h.window.__recoveryInspectMode,false);assert.equal(h.window.__autosaveDisabled,false);
  assert.ok(h.cloud.syncMeta.rev>before.syncMeta.rev);assert.deepEqual(h.local,h.cloud);assert.equal(identity.integrity(h.cloud).valid,true);assert.equal(cancellation.integrity(h.cloud).valid,true);
  cancellation.conserve(before,h.cloud,op,{...stamp,id:result.evidence.operationId,actorUid:"fixture",atISO:op.kind==="legacy"?h.cloud.tasksInterval[0].calendarCancellations.at(-1).recordedAtISO:h.cloud.maintenanceOccurrencesV2[0].recordedAtISO});
  assert.deepEqual(h.cloud.inventory,before.inventory);assert.deepEqual(h.cloud.tasksInterval[0].completedDates,before.tasksInterval[0].completedDates);assert.deepEqual(h.cloud.tasksInterval[0].manualHistory,before.tasksInterval[0].manualHistory);assert.deepEqual(h.cloud.tasksInterval[0].occurrenceNotes,before.tasksInterval[0].occurrenceNotes);assert.deepEqual(h.cloud.tasksInterval[0].occurrenceHours,before.tasksInterval[0].occurrenceHours);
  for(const event of before.maintenanceOccurrencesV2)assert.deepEqual(h.cloud.maintenanceOccurrencesV2.find(row=>row.id===event.id),event);
  assert.equal(h.cloud.maintenanceOccurrencesV2.filter(row=>row.eventType==="completed").length,12);
  const fresh=client({initial:h.cloud});assert.deepEqual(fresh.h.local,h.cloud);assert.equal(fresh.h.window.__recoveryInspectMode,false);
});
test("scope visibility distinguishes single hidden history, completed future, scheduled dates and same-name roots",()=>{
  const source=rich();for(const scope of ["single","future","all"]){const state=cancellation.plan(source,legacy(scope,"2026-11-01"),stamp).state;
    assert.equal(cancellation.hidden(state,{legacyTaskId:"fixture-task-A",dateISO:"2026-11-01",status:"completed"}),scope==="single");
    assert.equal(cancellation.hidden(state,{instanceId:"fixture-instance-A",dateISO:"2026-11-01",status:"completed"}),false);
    assert.equal(cancellation.hidden(state,{instanceId:"fixture-instance-A",dateISO:"2026-11-01",status:"scheduled"}),scope!=="single");
    assert.equal(cancellation.hidden(state,{instanceId:"fixture-instance-A",dateISO:"2026-10-28",status:"scheduled"}),scope==="all");
    assert.equal(cancellation.hidden(state,{instanceId:"other-instance",dateISO:"2026-11-01",status:"scheduled"}),false);
  }
});
test("selected legacy instance never cancels sibling definitions or deletes its identity",async()=>{
  const c=client(),result=await c.run(legacy("all","2026-11-01","fixture-child"));assert.equal(result.verified,true,result.error);assert.equal(c.h.cloud.tasksInterval.length,3);assert.equal(c.h.cloud.inventory.length,3);
  assert.equal(cancellation.hidden(c.h.cloud,{legacyTaskId:"fixture-child",dateISO:"2026-11-01",status:"due"}),true);assert.equal(cancellation.hidden(c.h.cloud,{legacyTaskId:"fixture-task-A",dateISO:"2026-11-01",status:"due"}),false);
});
test("as-required instance cancellation retains payload, notes, costs and exact inventory FK",async()=>{
  const source=rich(),task=source.tasksInterval.splice(2,1)[0];task.mode="asreq";source.tasksAsReq=[task];const c=client({initial:source}),result=await c.run(legacy("single","2026-11-01",task.id));assert.equal(result.verified,true,result.error);assert.equal(c.h.cloud.tasksAsReq[0].id,task.id);assert.deepEqual({...c.h.cloud.tasksAsReq[0],calendarCancellations:undefined},{...task,calendarCancellations:undefined});
});
test("consecutive removals and idempotent repeat calls leave subsequent independent changes available",async()=>{
  const c=client();for(const op of [legacy("single"),legacy("future"),repeat(),repeat("repeatStop")]){const r=await c.run(op);assert.equal(r.verified,true,r.error);const count=c.h.commits;const again=await c.run(op);assert.equal(again.noChange,true);assert.equal(c.h.commits,count);}
  assert.equal(c.h.commits,4);assert.equal(c.h.window.__recoveryInspectMode,false);assert.equal((await c.h.api.remove("fixture-task-B")).verified,true);
});
test("archive and exact-ID restoration retain the complete cancellation ledger and 12 histories",async()=>{
  const c=client();assert.equal((await c.run(legacy("future"))).verified,true);const original=clone(c.h.cloud.tasksInterval[0]);assert.equal((await c.h.api.remove(original.id)).verified,true);const entry=c.h.cloud.deletedItems.find(row=>row.payload?.id===original.id);assert.deepEqual(entry.payload,original);
  assert.equal((await c.h.api.restore(entry.id,archive.key(entry))).verified,true);assert.deepEqual(c.h.cloud.tasksInterval.find(row=>row.id===original.id),original);assert.equal(c.h.cloud.maintenanceOccurrencesV2.filter(row=>row.eventType==="completed").length,12);
});
for(const mutate of [s=>s.tasksInterval[0].manualHistory.pop(),s=>s.tasksInterval[0].completedDates.shift(),s=>delete s.tasksInterval[0].occurrenceNotes["2026-09-01"],s=>s.maintenanceOccurrencesV2.pop(),s=>s.inventory[0].qty++,s=>s.tasksInterval[1].name="wrong",s=>s.maintenanceOccurrencesV2[0].partsCostSnapshot=0])test("operation-specific proof rejects unexpected historical/unrelated loss before commit: "+mutate,async()=>{
  const c=client({pendingMutation:mutate}),before=c.h.cloud,r=await c.run(legacy("future"));assert.equal(r.saved,false);assert.equal(r.indeterminate,false);assert.equal(c.h.commits,0);assert.deepEqual(c.h.cloud,before);assert.deepEqual(c.h.local,before);assert.equal(c.h.window.__recoveryInspectMode,false);
});
for(const options of [{reject:true},{conflict:true},{backupFailure:true},{backupSilentFailure:true}])test("pre-commit rejection has no optimistic state or false Recovery Mode: "+JSON.stringify(options),async()=>{
  const c=client(options),before=c.h.local,r=await c.run(repeat("repeatStop"));assert.equal(r.saved,false);assert.equal(r.indeterminate,false);assert.equal(c.h.commits,0);assert.deepEqual(c.h.local,before);assert.equal(c.h.window.__recoveryInspectMode,false);
});
for(const options of [{loseAck:true},{unknownWithoutCommit:true},{readFailure:true},{readbackMutation:s=>s.maintenanceOccurrencesV2[0].payload.note="mismatch"},{duringVerification:({context})=>context.FB.user.uid="other"},{duringVerification:({window})=>{window.__lastIndeterminateSave={error:"separate blocker"};}}])test("uncertain outcomes preserve local evidence and block blind retries: "+JSON.stringify(options),async()=>{
  const c=client(options),before=c.h.local,r=await c.run(repeat());assert.equal(r.saved,false);assert.equal(r.indeterminate,true);assert.equal(c.h.window.__recoveryInspectMode,true);assert.equal(c.h.window.__autosaveDisabled,true);assert.deepEqual(c.h.local,before);const writes=c.h.writeTransactions;await c.run(repeat());assert.equal(c.h.writeTransactions,writes);
});
test("stale confirmation, malformed scopes/dates and crossed root identities never write",async()=>{
  const c=client(),reviewed=c.api.review(legacy());c.h.window.inventory[0].qty++;assert.equal((await c.api.run(reviewed)).saved,false);assert.equal(c.h.commits,0);
  for(const operation of [legacy("invalid"),legacy("single","2026-02-30"),{...repeat(),instanceId:"other-instance"},{...repeat(),rootOccurrenceId:"repeat:other-instance:2026-11-01"},{...repeat(),taskId:"other-v2"}]){const x=client();assert.equal((await x.run(operation)).saved,false);assert.equal(x.h.commits,0);assert.equal(x.h.window.__recoveryInspectMode,false);}
});
test("same-name two-client stale request is rejected without overwriting the winner",async()=>{
  const a=client(),stale=clone(a.h.cloud),reviewed=a.api.review(legacy("future"));assert.equal((await a.api.run(reviewed)).verified,true);const source=a.h.cloud;
  const b=client({initial:source});b.h.window.__lastLoadedCloudState=stale;b.h.window.__loadedCloudRevisionForSaveGuard=stale.syncMeta.rev;const r=await b.run(legacy("all"));assert.equal(r.saved,false);assert.equal(b.h.commits,0);assert.deepEqual(b.h.cloud,source);
});
test("virtual counted repeat roots preserve slot identity and never stop the remaining chain",async()=>{
  const source=rich();source.maintenanceCalendarInstancesV2[0].repeatRule.endType="after_count";source.maintenanceCalendarInstancesV2[0].repeatRule.endCount=3;
  const c=client({initial:source}),op={...repeat(),rootOccurrenceId:"repeat:fixture-instance-A:slot:2"},r=await c.run(op);assert.equal(r.verified,true,r.error);assert.equal(c.h.cloud.maintenanceOccurrencesV2[0].rootOccurrenceId,op.rootOccurrenceId);assert.deepEqual(c.h.cloud.maintenanceCalendarInstancesV2,source.maintenanceCalendarInstancesV2);assert.equal(c.h.cloud.maintenanceCalendarInstancesV2[0].status,"active");
});
test("new cancellation evidence is protected against unrelated deletion outside the coordinator",async()=>{
  const c=client();assert.equal((await c.run(legacy())).verified,true);const next=c.h.cloud;delete next.tasksInterval[0].calendarCancellations;
  const result=await c.h.context.writeAuthoritativeStateSnapshot(next,{merge:true},{expectedRevision:next.syncMeta.rev});assert.equal(result.saved,false);assert.equal(c.h.commits,1);assert.equal(c.h.cloud.tasksInterval[0].calendarCancellations.length,1);
});
test("post-commit local draft drift and adoption failure preserve evidence without broad rollback",async()=>{
  const c=client({duringVerification:({window})=>window.inventory[0].qty++}),r=await c.run(legacy("future"));assert.equal(r.indeterminate,true);assert.equal(r.stateWriteCompleted,true);assert.ok(r.evidence.operationId);assert.equal(c.h.commits,1);assert.equal(c.h.window.__recoveryInspectMode,true);assert.equal(c.h.local.inventory[0].qty,c.h.cloud.inventory[0].qty+1);
  const a=client({adoptionFailure:true}),out=await a.run(repeat("repeatStop"));assert.equal(out.indeterminate,true);assert.equal(a.h.commits,1);assert.equal(a.h.window.__autosaveDisabled,true);assert.equal(a.h.cloud.maintenanceOccurrencesV2.filter(row=>row.eventType==="completed").length,12);
});
test("true orphan and invalid ledger evidence remain read-only on authoritative load",()=>{
  const source=rich();source.inventory[0].linkedTaskId="missing";const c=client({initial:source,expectRecovery:true});assert.equal(c.h.window.__recoveryInspectMode,true);
  const state=cancellation.plan(rich(),legacy(),stamp).state;state.tasksInterval[0].calendarCancellations[0].legacyTaskId="wrong";assert.equal(cancellation.integrity(state).valid,false);const invalid=client({initial:state,expectRecovery:true});assert.equal(invalid.h.window.__autosaveDisabled,true);
});

test("real missing-path classification accepts exact ledger archive/restore, including task-only compact backup",async()=>{
  const c=client({realCoverage:true});assert.equal((await c.run(legacy("future"))).verified,true);
  const task=clone(c.h.cloud.tasksInterval[0]),result=await c.h.api.remove(task.id);assert.equal(result.verified,true,result.error);
  const entry=c.h.cloud.deletedItems.find(row=>row.payload?.id===task.id);assert.deepEqual(entry.payload,task);
  const restored=await c.h.api.restore(entry.id,archive.key(entry));assert.equal(restored.verified,true,restored.error);
  assert.deepEqual(c.h.cloud.tasksInterval.find(row=>row.id===task.id),task);
});

test("archive evidence projection cannot discard a different backup cancellation ledger",async()=>{
  const initial=cancellation.plan(rich(),legacy("future"),stamp).state,backup=clone(initial);
  backup.tasksInterval[0].calendarCancellations.push({...backup.tasksInterval[0].calendarCancellations[0],id:"only-in-backup",scope:"single"});
  const c=client({initial,backup,realCoverage:true}),before=c.h.cloud,result=await c.h.api.remove("fixture-task-A");
  assert.equal(result.saved,false);assert.equal(c.h.commits,0);assert.deepEqual(c.h.cloud,before);assert.equal(c.h.window.__recoveryInspectMode,false);
});

test("cancellation preflight sees backup-only history before any backup refresh",async()=>{
  const initial=rich(),backup=clone(initial),owner={...clone(initial.tasksInterval[1]),id:"backup-only-asreq",mode:"asreq"};
  owner.calendarCancellations=[{id:"backup-only-cancellation",schemaVersion:1,eventType:"calendar_cancelled",legacyTaskId:owner.id,scope:"single",dateISO:"2026-09-01",recordedAtISO:stamp.atISO,actorUid:stamp.actorUid}];backup.tasksAsReq=[owner];
  const c=client({initial,backup,realCoverage:true}),result=await c.run(legacy("future"));assert.equal(result.saved,false);assert.equal(result.indeterminate,false);assert.equal(c.h.commits,0);
  assert.deepEqual(c.h.cloud,initial);assert.deepEqual(c.h.context.readLocalStateBackup(),backup);assert.equal(c.h.window.__recoveryInspectMode,false);
});

test("normal, emergency and tiny backup builders preserve task archives, ledger and historical payloads",()=>{
  const fs=require("node:fs"),source=fs.readFileSync("js/core.js","utf8");
  const fn=name=>{const start=source.search(new RegExp("^function "+name+"\\(","m"));return source.slice(start,source.indexOf("\n}",start)+2);};
  const constants=["SAFE_FILE_METADATA_KEY_PATTERN","EMBEDDED_CONTENT_KEY_PATTERN"].map(name=>source.match(new RegExp("^const "+name+" = .*;$","m"))[0]).join("\n");
  const context=vm.createContext({window:{},APP_SCHEMA:72,console:{info(){}}});
  vm.runInContext(constants+"\n"+["isDataUrl","isLikelyEmbeddedFileContent","isSafeMetadataString","isProtectedBusinessDataKey","sanitizeValueForStorage","compactStateForStorage","buildEmergencyBackup","buildTinyCriticalBackup"].map(fn).join("\n"),context);
  const pending=cancellation.plan(rich(),legacy("all"),stamp).state,task=pending.tasksInterval[0];
  const archived=archive.plan(pending,task.id,{id:"backup-archive",type:"task",deletedAt:stamp.atISO,payload:clone(task),meta:{list:"interval",originalId:task.id}});
  for(const build of [state=>context.compactStateForStorage(state,{forBackup:true}),context.buildEmergencyBackup,state=>context.buildTinyCriticalBackup(state,{quiet:true})]){
    const backup=JSON.parse(JSON.stringify(build(archived))),payload=backup.deletedItems[0].payload;
    for(const field of ["id","manualHistory","completedDates","occurrenceHours","occurrenceNotes","calendarCancellations"])assert.deepEqual(payload[field],task[field],field);
    assert.deepEqual(backup.maintenanceOccurrencesV2,archived.maintenanceOccurrencesV2);assert.deepEqual(backup.inventory,archived.inventory);
  }
});
