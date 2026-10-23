"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const archive=require("../js/maintenanceTaskArchive"),identity=require("../js/globalIdentityRepair"),atomic=require("../js/atomicPersistence"),firewall=require("../js/cuttingFileContentFirewall");
const {fixture,trashFor}=require("./fixtures/mdel01-maintenance-task"),clone=structuredClone;
const core=fs.readFileSync("js/core.js","utf8"),calendar=fs.readFileSync("js/calendar.js","utf8"),renderer=fs.readFileSync("js/renderers.js","utf8");
function fn(source,name){const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,"m"));assert.ok(start>=0,name);return source.slice(start,source.indexOf("\n}",start)+2);}
function constant(name){const start=core.indexOf(`const ${name} =`);assert.ok(start>=0,name);return core.slice(start,core.indexOf(";",start)+1);}
const deleted=source=>archive.plan(source,"fixture-task-A",trashFor(source));
test("exact-ID deletion retains all relationships, duplicate names, history, costs and serialized identity",()=>{
  const before=fixture(),original=clone(before),next=deleted(before);
  assert.equal(identity.integrity(before).valid,true,identity.integrity(before).blockers.join("\n"));
  assert.deepEqual(before,original);assert.deepEqual(next.tasksInterval,[before.tasksInterval[1]]);
  assert.deepEqual(next.deletedItems[0].payload,before.tasksInterval[0]);
  for(const name of Object.keys(before).filter(name=>!["tasksInterval","deletedItems"].includes(name)))assert.deepEqual(next[name],before[name],name);
  const check=identity.integrity(next);assert.equal(check.valid,true,check.blockers.join("\n"));assert.deepEqual(check.plan.changes,[]);
  const link=check.plan.references.find(ref=>ref.path==="$.inventory[0].linkedTaskId");assert.equal(link.resolution,"archived_task");assert.equal(link.value,"fixture-task-A");
  assert.equal(archive.resolve(next,"fixture-task-A").status,"archived");assert.equal(archive.resolve(next,"fixture-task-B").status,"active");
  assert.equal(archive.historicalTasks(next,"interval").find(task=>task.id==="fixture-task-A").name,"Mixing Tube .042 — Deleted");
  assert.equal(identity.integrity(JSON.parse(JSON.stringify(next))).valid,true);
});
test("as-required deletion and surviving legacy child instances preserve their exact identities and schedules",()=>{
  const source=fixture(),target=source.tasksInterval.shift();target.mode="asreq";source.tasksAsReq.push(target);
  source.tasksInterval.push({id:"fixture-child",mode:"interval",variant:"instance",templateId:target.id,parentTask:target.id,calendarDateISO:"2026-12-01",manualHistory:[{dateISO:"2026-10-02",note:"original evidence"}]});
  const trash={...trashFor(fixture()),payload:clone(target),meta:{list:"asreq",originalId:target.id}};
  const next=archive.plan(source,target.id,trash);assert.equal(next.tasksAsReq.length,0);assert.deepEqual(next.tasksInterval,source.tasksInterval);assert.deepEqual(next.deletedItems[0].payload,target);
  assert.equal(identity.integrity(next).valid,true,identity.integrity(next).blockers.join("\n"));
});
for(const [name,mutate]of [
  ["genuine missing inventory task",s=>s.inventory[0].linkedTaskId="missing"],
  ["genuine missing purchase task",s=>s.receiptTrackerWeeks[0].rows[0].taskId="missing"],
  ["unrelated missing inventory FK",s=>s.orderRequests[0].items[0].inventoryId="missing"],
  ["wrong archive type",s=>s.deletedItems[0].type="inventory"],
  ["missing archive payload ID",s=>delete s.deletedItems[0].payload.id],
  ["wrong original ID",s=>s.deletedItems[0].meta.originalId="fixture-task-B"],
  ["invalid archive date",s=>s.deletedItems[0].deletedAt="invalid"],
  ["ambiguous archive identity",s=>s.deletedItems.push({...clone(s.deletedItems[0]),id:"other-trash"})],
  ["active and archived collision",s=>s.tasksInterval.push(clone(s.deletedItems[0].payload))],
  ["broken FK inside archive",s=>s.deletedItems[0].payload.inventoryId="missing"]
])test("integrity still rejects "+name,()=>{const state=deleted(fixture());mutate(state);const before=clone(state);assert.equal(identity.integrity(state).valid,false);assert.deepEqual(state,before);});

function guardHarness(){
  const window={OMAXMaintenanceTaskArchive:archive,__cloudLoadAttemptComplete:true,__initialAdoptComplete:true};
  const context=vm.createContext({window,console,TextEncoder,Blob,URLSearchParams,structuredClone,APP_SCHEMA:72,FB:{docRef:{path:"fixture"}},WORKSPACE_ID:"fixture",
    stateHasMeaningfulData:state=>!!state?.inventory?.length,readLocalStateBackup:()=>null,
    classifyMissingProtectedPathsForSave:()=>({blocking:[],warnings:[]}),getSaveSchemaCoverageReport:()=>({}),buildWindowProtectedStateForCoverage:()=>window,
    validatePumpBaselineRetention:()=>({valid:true}),isVercelPreviewRuntime:()=>false});
  const constants=["PROTECTED_STATE_FIELDS","REQUIRED_PROTECTED_DATA_PATHS","PROTECTED_FIELD_REGISTRY","DATA_SAFETY_PREFLIGHT_COUNT_DROP_RATIO","DATA_SAFETY_PREFLIGHT_MIN_BASELINE_COUNT","DATA_SAFETY_PREFLIGHT_TOTAL_DROP_RATIO","DATA_SAFETY_PREFLIGHT_SIZE_DROP_RATIO"];
  const functions=["estimatePayloadBytes","countObjectKeys","countTaskNestedMapEntries","countTaskNestedArrayEntries","countJobManualLogs","getValueAtPath","getDataSafetyShape","countCollectionValue","countNestedProtectedValues","stableStringifyForIntegrity","hashIntegrityString","fingerprintProtectedValue","countProtectedField","validateProtectedFieldShape","getProtectedFieldRegistryCoverage","buildProtectedFieldIntegritySummary","buildDataIntegritySummary","hasAnyProtectedData","hasAnyProtectedFieldPresence","isDangerousShapeChange","chooseProtectedSaveBaseline","detectDangerousIntegrityReduction","validateProtectedSavePreflight","buildProtectedFieldSummary","compareProtectedFieldSummaries","detectDangerousProtectedFieldReduction","isRecoveryMode"];
  vm.runInContext(constants.map(constant).join("\n")+"\n"+functions.map(name=>fn(core,name)).join("\n")+"\nthis.guard=detectDangerousProtectedFieldReduction;this.preflight=validateProtectedSavePreflight;",context);
  return context;
}
test("actual protected guards accept ONLY exact archive conservation, including final task and all nested history",()=>{
  const {guard,preflight}=guardHarness(),source=fixture();source.tasksInterval.pop();source.inventory.pop();
  const next=deleted(source),proof={id:"fixture-task-A",trash:next.deletedItems[0]};
  assert.equal(guard(source,next).blocked,true);
  const baseline=archive.safetyBaseline(source,next,proof);
  assert.equal(guard(baseline,next).blocked,false);
  const check=preflight({baselineState:baseline,latestRemoteState:baseline,pendingState:next,skipRuntimeGates:true});assert.equal(check.blocked,false,JSON.stringify(check.reasons));
  for(const change of [s=>s.inventory=[],s=>s.tasksInterval=[],s=>s.maintenanceOccurrencesV2=[],s=>s.deletedItems[0].payload.manualHistory=[],s=>s.orderRequests[0].items[0].price=0]){
    const altered=clone(next);change(altered);if(archive.key(altered)===archive.key(next))continue;
    assert.throws(()=>archive.safetyBaseline(source,altered,proof));
  }
});

function apiHarness(options={}){
  let cloud=fixture(),local=clone(cloud),suspends=0,commits=0,reads=0;
  if(options.corrupt)options.corrupt(cloud);local=clone(cloud);
  const env={canWrite:()=>!options.readonly,settle:async()=>{},captureTarget:()=>({path:"fixture"}),targetIsCurrent:()=>true,version:()=>({revision:local.syncMeta.rev}),matches:state=>archive.key(local)===archive.key(state),read:async()=>{reads++;if(options.readFailure&&reads===2)throw Error("read unavailable");return clone(cloud);},newId:()=>"fixture-trash-A",validate:state=>identity.integrity(state).valid,adopt:state=>{local=clone(state);return true;},suspend:()=>suspends++,write:async(next,rev,validateSourceState,validatePreparedState,proof)=>{
    const db={runTransaction:async callback=>{
      if(options.remoteDrift)cloud.syncMeta.rev++;
      let staged;await callback({get:async()=>({exists:true,data:()=>clone(cloud)}),set:(_ref,value)=>{staged=clone(value);}});
      if(options.definiteFailure)throw Object.assign(Error("permission denied"),{code:"permission-denied"});
      cloud=staged;commits++;if(options.loseAck)throw Error("acknowledgement lost");
    }};
    if(options.realWriter){
      const context=guardHarness(),window=context.window;
      Object.assign(window,{OMAXAtomicPersistence:atomic,CuttingFileContentFirewall:firewall,__lastLoadedCloudState:clone(local),__loadedCloudRevisionForSaveGuard:rev});
      Object.assign(context,{FB:{ready:true,user:{uid:"fixture"},db,docRef:{path:"fixture"}},
        cuttingJobSaveTargetIsCurrent:()=>true,getCloudSyncClientId:()=>"fixture",scanAuthoritativeCutFileContent:firewall.scanCuttingFileContent,
        stableStringify:archive.key,readLocalStateBackup:()=>clone(local),
        mergeTotalHistoryForSave:()=>{throw Error("Exact deletion must preserve totalHistory verbatim");},
        mergeDailyCutHoursForSave:()=>{throw Error("Exact deletion must preserve dailyCutHours verbatim");},
        mergePumpEffForSave:()=>{throw Error("Exact deletion must preserve pumpEff verbatim");},
        renderRecoveryDiagnosticsPanel(){},enterMissingStateRecovery(){},FIRESTORE_BLOCK_BYTES:950000});
      vm.runInContext("const inventoryIdentityRepairAuthorizations=new Map();\n"+
        ["canWriteCloud","blockCloudSave","validateCuttingJobDeletionSave","validateCuttingJobHistoryRestoreSave","cuttingJobDeletionSafetyBaseline","writeAuthoritativeStateSnapshot"].map(name=>fn(core,name)).join("\n"),context);
      return context.writeAuthoritativeStateSnapshot(next,{merge:true},{expectedRevision:rev,validateSourceState,validatePreparedState,maintenanceTaskDeletionProof:proof});
    }
    return atomic.save({db,docRef:{path:"fixture"},state:next,expectedRevision:rev,clientId:"fixture",scan:firewall.scanCuttingFileContent,prepare:(pending,remote)=>{
      if(!validateSourceState(remote))throw Object.assign(Error("source changed"),{definite:true});
      archive.safetyBaseline(remote,pending,proof);
      if(!validatePreparedState(pending)||!identity.integrity(pending).valid)throw Object.assign(Error("prepared changed"),{definite:true});
      return pending;
    }});
  }};
  return {api:archive.createApi(env),get cloud(){return clone(cloud);},get local(){return clone(local);},get commits(){return commits;},get suspends(){return suspends;}};
}
test("delete is acknowledged, server verified, adopted and reloadable without a false recovery",async()=>{
  const h=apiHarness(),before=h.cloud,result=await h.api.remove("fixture-task-A");assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);assert.equal(h.commits,1);assert.equal(h.suspends,0);
  assert.deepEqual(h.local,h.cloud);assert.deepEqual(h.cloud.tasksInterval,[before.tasksInterval[1]]);assert.equal(identity.integrity(JSON.parse(JSON.stringify(h.cloud))).valid,true);
  assert.equal((await h.api.remove("fixture-task-A")).saved,false);assert.equal(h.cloud.deletedItems.length,1);
});
test("real shared core writer and protected preflight commit an exact task archive without normalizing unrelated data",async()=>{
  const h=apiHarness({realWriter:true}),result=await h.api.remove("fixture-task-A");assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);assert.equal(h.commits,1);assert.equal(h.suspends,0);assert.deepEqual(h.local,h.cloud);
});
for(const [name,options]of [["revision conflict",{remoteDrift:true}],["read-only",{readonly:true}],["definite failure",{definiteFailure:true}],["pre-existing orphan",{corrupt:s=>s.inventory[1].linkedTaskId="missing"}]])test(name+" cannot save deletion",async()=>{
  const h=apiHarness(options),before=h.local,result=await h.api.remove("fixture-task-A");assert.equal(result.saved,false);assert.equal(h.commits,0);assert.deepEqual(h.local,before);assert.equal(h.suspends,0);
});
for(const options of [{loseAck:true},{readFailure:true}])test("uncertain write/readback retains evidence and suspends without retry",async()=>{
  const h=apiHarness(options),before=h.local,result=await h.api.remove("fixture-task-A");assert.equal(result.saved,false);assert.equal(h.commits,1);assert.equal(h.suspends,1);assert.deepEqual(h.local,before);assert.equal(h.cloud.deletedItems.length,1);
});
test("task archives never expire, cannot be permanently removed, and restore remains read-only",()=>{
  const state=deleted(fixture()),window={deletedItems:clone(state.deletedItems)},context=vm.createContext({window,structuredClone,console,genId:()=>"unexpected"});
  vm.runInContext(constant("TRASH_RETENTION_MS")+"\n"+["cloneStructured","computeTrashExpiresAt","buildTrashLabel","normalizeDeletedItem","normalizeDeletedItems","purgeExpiredDeletedItems","removeDeletedItem","applyRestoreByType"].map(name=>fn(core,name)).join("\n")+"\nlet deletedItems=window.deletedItems;",context);
  assert.ok(context.normalizeDeletedItem(state.deletedItems[0]));assert.equal(context.removeDeletedItem("fixture-trash-A"),false);
  assert.equal(context.applyRestoreByType(state.deletedItems[0],0).blocked,true);assert.deepEqual(window.deletedItems,state.deletedItems);
});
test("compatibility rows and calendar resolve archived names while stopping new repeat projection",()=>{
  const window={...deleted(fixture()),OMAXMaintenanceTaskArchive:archive};
  const context=vm.createContext({window,normalizeDateKey:value=>value,normalizeDateISO:value=>value,normalizeTaskRecurrence:()=>null,normalizeDateKeyForTask:value=>value});
  vm.runInContext(fn(calendar,"projectV2RepeatDates"),context);
  assert.deepEqual(clone(context.projectV2RepeatDates(window.maintenanceCalendarInstancesV2[0])),[]);
  assert.equal(archive.displayTask(window,window.maintenanceTasksV2[0]).name,"Mixing Tube .042 — Deleted");
  assert.equal(window.maintenanceOccurrencesV2.length,2);assert.equal(window.maintenanceOccurrencesV2[1].eventType,"scheduled");
  assert.match(core,/historicalTasks\(window,"interval"\)/);assert.match(renderer,/historicalTasks\(window,"interval"\)/);
  const handler=renderer.slice(renderer.indexOf("  async function deleteMaintenanceTaskMeta"),renderer.indexOf('  tree?.querySelectorAll',renderer.indexOf("  async function deleteMaintenanceTaskMeta")));
  assert.match(handler,/await window\.maintenanceTaskDeletionApi\?\.remove/);assert.doesNotMatch(handler,/deleteInventoryItem|parentTask = null|\.filter\(/);
});
function compatibility(state){
  const context=vm.createContext({window:{...clone(state),OMAXMaintenanceTaskArchive:archive},console,normalizeDateISO:value=>value||null});
  vm.runInContext(core.slice(core.indexOf("function detectMaintenanceRecordSystem"),core.indexOf("function runMaintenanceV2SafetyChecks")),context);
  return clone(context.buildMaintenanceCompatibilityStream());
}
test("real compatibility, Central Data Table and Cost Analysis retain historical values after deletion",()=>{
  const source=fixture(),before=compatibility(source),after=compatibility(deleted(source));
  const evidence=rows=>rows.map(({taskName,...row})=>row).sort((a,b)=>a.streamId.localeCompare(b.streamId));
  assert.deepEqual(evidence(after),evidence(before));
  assert.ok(after.filter(row=>["fixture-task-A","fixture-v2-A"].includes(row.taskId)).every(row=>row.taskName.endsWith(" — Deleted")));
  const row=after.find(row=>row.sourceSystem==="v2"&&row.isCompleted);assert.ok(row);assert.equal(row.partsCostSnapshot,42);assert.equal(row.loggedHours,0.5);
  const report=vm.createContext({window:{buildMaintenanceCompatibilityStream:()=>[row]},console,Date,maintenanceDataTableRows:[],MAINTENANCE_LABOR_RATE_PER_HOUR:30,toHistoryDateKey:v=>v||null,resolveCategoryPath:v=>v,parseDateLocal:v=>new Date(v+"T00:00:00Z")});
  const reportStart=renderer.indexOf('  const compatibilityRows = typeof window.buildMaintenanceCompatibilityStream');
  vm.runInContext(renderer.slice(reportStart,renderer.indexOf('  taskDateGroups.forEach',reportStart)),report);
  const centralStart=renderer.indexOf('  const centralMaintenanceRows = maintenanceDataTableRows');
  vm.runInContext(renderer.slice(centralStart,renderer.indexOf('  const centralTotals',centralStart))+";this.central=centralMaintenanceRows",report);
  const trendStart=renderer.indexOf('  const maintenanceTrendRows = maintenanceDataTableRows');
  vm.runInContext(renderer.slice(trendStart,renderer.indexOf('  const maintenanceCostByDate',trendStart))+";this.trends=maintenanceTrendRows",report);
  assert.equal(report.central.length,1);assert.equal(report.trends.length,1);assert.equal(report.central[0].totalCost,57);assert.match(report.central[0].taskName,/Deleted/);
});
test("real calendar repeat history keeps completed and already-created future events with archived names",()=>{
  const window={...deleted(fixture()),OMAXMaintenanceTaskArchive:archive};
  const context=vm.createContext({window,normalizeDateKey:v=>v,makeV2CalendarEquivalentKey:JSON.stringify,
    resolveV2RepeatOccurrenceStateByRoot:(root,date)=>({lifecycleStatus:root.endsWith("2026-10-01")?"completed":"scheduled",displayDateISO:date,note:"preserved",hours:0.5})});
  const start=calendar.indexOf("  const repeatEvents = Array.isArray(window.maintenanceOccurrencesV2)");
  vm.runInContext('const dueMap={},seenV2RepeatProjectionKeys=new Set(),v2TaskLookup=new Map(window.maintenanceTasksV2.map(task=>[task.id,window.OMAXMaintenanceTaskArchive.displayTask(window,task)]));\n'+calendar.slice(start,calendar.indexOf('window.__maintenanceCalendarProjectedRepeatRows=',start))+";this.rows=Object.values(dueMap).flat();",context);
  assert.equal(context.rows.length,2);assert.ok(context.rows.every(row=>row.name.endsWith(" — Deleted")));assert.ok(context.rows.some(row=>row.dateISO==="2026-11-01"));assert.ok(context.rows.some(row=>row.status==="completed"));
});
