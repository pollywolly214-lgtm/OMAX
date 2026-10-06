"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const atomic = require("../js/atomicPersistence");
const firewall = require("../js/cuttingFileContentFirewall");
const source = fs.readFileSync("js/core.js", "utf8");
const clone = structuredClone;
function fn(name){
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf("\n}", start) + 2);
}
function constant(name){
  const start = source.indexOf(`const ${name} =`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf(";", start) + 1);
}
const job = (id, priority = 1) => ({ id, name:`Job ${id}`, priority, estimateHours:3,
  manualLogs:[], files:[{ name:"fixture.dxf", fileId:"metadata-only" }], notes:"preserve", unlinkedCloudFileIds:["unlinked-fixture"] });
function harness(active = [job("a"), job("b", 2)], completed = [], options = {}){
  let cloud, commits = 0, reads = 0, transactions = 0, diagnostics = 0, confirmations = 0, sequence = 0, backup;
  const bindings = ["totalHistory","tasksInterval","tasksAsReq","inventory","cuttingJobs","completedCuttingJobs","orderRequests","garnetCleanings","dailyCutHours","opportunityRollups","weeklyCostReports","receiptTrackerWeeks","maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2","deletedItems","appConfig","jobFolders","orderRequestTab"];
  const window = Object.fromEntries(bindings.map(name => [name, []]));
  Object.assign(window, { cuttingJobs:clone(active), completedCuttingJobs:clone(completed),
    deletedItems:[{ id:"old-trash", type:"job", payload:job("old"), meta:{keep:true}, label:"Old", deletedAt:new Date().toISOString() }],
    appConfig:{dailyHours:8}, orderRequests:[{id:"draft",status:"draft"}], inventory:[{id:"inventory-keep",note:"keep"}],
    inventoryFolders:[], inventoryMaterials:{}, inventoryTransactions:[], settingsFolders:[], oneDriveJobConfig:null, cuttingJobDatabase:{},
    __cloudLoadAttemptComplete:true, __initialAdoptComplete:true, __loadedCloudRevisionForSaveGuard:7,
    OMAXAtomicPersistence:atomic, CuttingFileContentFirewall:firewall,
    confirm:message => { confirmations++; assert.match(message, /Trash/); return options.confirm !== false; } });
  const db = { async runTransaction(callback){
    transactions++;
    if (options.beforeTransaction) await options.beforeTransaction(window, cloud);
    let next;
    const transaction = { get:async()=>({exists:!options.missingState,data:()=>clone(cloud)}), set:(_ref, value)=>{ next = clone(value); } };
    await callback(transaction);
    if (options.retryCallback) await callback(transaction);
    if (options.writeError) throw options.writeError;
    cloud = next; commits++;
    if (options.loseAcknowledgement) throw Error("Connection lost after commit");
  } };
  const context = vm.createContext({ window, TextEncoder, Blob, structuredClone, URLSearchParams,
    console:{error(){},warn(){},info(){},table(){}}, setTimeout, clearTimeout, document:{getElementById:()=>null},
    APP_SCHEMA:72, WORKSPACE_ID:"fixture", FB:{ready:true,user:{uid:"fixture"},db,docRef:{path:"workspaces/fixture/app/state",get:async()=>{reads++;return{exists:true,data:()=>clone(cloud)};}}},
    normalizeInventoryMaterials:value=>value || {}, normalizeAppConfig:value=>value || {},
    snapshotSettingsFolders:()=>clone(window.settingsFolders), snapshotJobFolders:()=>clone(window.jobFolders), cloneFolders:clone,
    readJobFileCache:()=>({}), syncJobFileCacheFromJobs(){}, writeJobFileCache(){}, getCloudSyncClientId:()=>"fixture-client",
    stateHasMeaningfulData:value=>!!value?.inventory?.length, classifyMissingProtectedPathsForSave:()=>({blocking:[],warnings:[]}),
    getSaveSchemaCoverageReport:()=>({cloudExcludedProtectedPaths:[]}), buildWindowProtectedStateForCoverage:()=>window,
    detectRemoteRevisionConflict:remote=>({blocked:remote.syncMeta.rev !== window.__loadedCloudRevisionForSaveGuard}),
    readLocalStateBackup:()=>backup || null, persistLocalStateBackup:value=>{backup=clone(value);},
    renderRecoveryDiagnosticsPanel:()=>diagnostics++, rememberDangerousSaveBlock(){}, writeBlockedSaveLog:async()=>{},
    recordDataFlowEvent(){}, consumeMaintenanceV2RepairAuthorization:()=>({authorized:false}),
    mergeTotalHistoryForSave:value=>value, mergeDailyCutHoursForSave:value=>value, mergePumpEffForSave:value=>value,
    logMaintenanceHistoryDiagnostics:()=>({completedDatesCount:0,manualHistoryCount:0,maintenanceOccurrencesV2Count:0}),
    collectMaintenanceHistoryMetrics:()=>({completedDatesCount:0,manualHistoryCount:0,maintenanceOccurrencesV2Count:0}),
    logCoreBusinessDiagnostics:()=>({inventoryCount:1,orderRequestsCount:1,orderLineItemCount:0,settingsFoldersCount:0,toleranceFieldCount:0,layoutPresent:false}),
    collectCoreBusinessMetrics:()=>({inventoryCount:1,orderRequestsCount:1,orderLineItemCount:0,settingsFoldersCount:0,toleranceFieldCount:0,layoutPresent:false}),
    isVercelPreviewRuntime:()=>false, genId:prefix=>`${prefix}_${++sequence}`,
    setSettingsFolders(){}, syncRenderTotalsFromHistory(){}, toast(){}, enterMissingStateRecovery(){},
    FIRESTORE_WARN_BYTES:800000,FIRESTORE_STRONG_WARN_BYTES:900000,FIRESTORE_BLOCK_BYTES:950000 });
  const constants = ["PROTECTED_STATE_FIELDS","REQUIRED_PROTECTED_DATA_PATHS","PROTECTED_FIELD_REGISTRY","DATA_SAFETY_PREFLIGHT_COUNT_DROP_RATIO","DATA_SAFETY_PREFLIGHT_MIN_BASELINE_COUNT","DATA_SAFETY_PREFLIGHT_TOTAL_DROP_RATIO","DATA_SAFETY_PREFLIGHT_SIZE_DROP_RATIO","LARGE_CONTENT_KEY_PATTERN","SAFE_FILE_METADATA_KEY_PATTERN","EMBEDDED_CONTENT_KEY_PATTERN"];
  const functions = ["cloneStructured","estimatePayloadBytes","countObjectKeys","countTaskNestedMapEntries","countTaskNestedArrayEntries","countJobManualLogs","getValueAtPath","getDataSafetyShape","countCollectionValue","countNestedProtectedValues","stableStringifyForIntegrity","hashIntegrityString","fingerprintProtectedValue","countProtectedField","validateProtectedFieldShape","getProtectedFieldRegistryCoverage","buildProtectedFieldIntegritySummary","buildDataIntegritySummary","hasAnyProtectedData","hasAnyProtectedFieldPresence","isDangerousShapeChange","chooseProtectedSaveBaseline","detectDangerousIntegrityReduction","validateProtectedSavePreflight","buildProtectedFieldSummary","compareProtectedFieldSummaries","detectDangerousProtectedFieldReduction","isRecoveryMode","canWriteCloud","blockCloudSave","buildTrashLabel","refreshGlobalCollections","snapshotState","isDataUrl","isLikelyEmbeddedFileContent","isSafeMetadataString","isProtectedBusinessDataKey","sanitizeValueForStorage","compactStateForStorage","scanAuthoritativeCutFileContent","performCloudSave","saveCloudNow","saveCloudDebounced","adoptAuthoritativeRecoveryState","debounce","resetHistoryToCurrent","captureHistorySnapshot","captureHistoryState","applyHistorySnapshot","undoLastChange","redoLastUndo"];
  const deletion = source.slice(source.indexOf("// CJD authorizes"), source.indexOf("async function writeReviewedGlobalIdentityRepair"));
  vm.runInContext(bindings.map(name=>`let ${name}=window.${name};`).join("\n") +
    "\nlet lastAppliedCloudRevision=7,lastLocalMutationAt=0,hasPendingLocalChanges=false;let cloudSaveQueue=Promise.resolve();" +
    "\nconst HISTORY_LIMIT=50,undoStack=[],redoStack=[];let currentSnapshotJSON=null,suppressHistory=false,skipNextHistoryCapture=false,historyApplicationInProgress=false;" +
    "\nconst inventoryIdentityRepairAuthorizations=new Map();\n" + constants.map(constant).join("\n") + "\n" + functions.map(fn).join("\n") +
    "\n" + deletion + "\n" + fn("cloudSaveNoWriteFailure") + "\n" + fn("writeAuthoritativeStateSnapshot") +
    "\nconst saveCloudInternal=debounce((options={})=>{const p=cloudSaveQueue.then(()=>performCloudSave(options));cloudSaveQueue=p.catch(()=>{});return p;},1800);" +
    "\nthis.api={authorizeCuttingJobDeletion,consumeCuttingJobDeletionAuthorization,validateCuttingJobDeletionSave,writeAuthoritativeStateSnapshot,performCloudSave,snapshotState,compactStateForStorage,cuttingJobDeletionArray,buildTrashLabel,adoptAuthoritativeRecoveryState,validateProtectedSavePreflight,detectDangerousProtectedFieldReduction,applyHistorySnapshot,undoLastChange,redoLastUndo,captureHistorySnapshot,flush:()=>saveCloudInternal.flushResult(),cancel:()=>saveCloudInternal.cancel(),history:()=>({current:JSON.parse(currentSnapshotJSON),undo:undoStack.map(JSON.parse),redo:redoStack.map(JSON.parse)})};", context);
  cloud = clone(context.api.compactStateForStorage(context.api.snapshotState())); cloud.syncMeta.rev=7;
  window.__lastLoadedCloudState=clone(cloud);
  context.adoptState=data=>context.api.adoptAuthoritativeRecoveryState(data);
  context.resetHistoryToCurrent();
  return { window, context, api:context.api, delete:(collection,id)=>context.deleteCuttingJob(collection,id),
    get cloud(){return clone(cloud);}, get commits(){return commits;}, get diagnostics(){return diagnostics;}, get confirmations(){return confirmations;}, get reads(){return reads;},
    get backup(){return clone(backup);}, get transactions(){return transactions;}, get historyCaptures(){return context.api.history().undo.length;},
    alterCloud:mutate=>mutate(cloud), reload(){context.api.adoptAuthoritativeRecoveryState(clone(cloud));},
    staged(collection="cuttingJobs",id="a"){
      const before=clone(cloud), payload=before[collection].find(entry=>String(entry.id)===id);
      const trash={id:`new-trash-${++sequence}`,type:collection==="cuttingJobs"?"job":"completed-job",payload:clone(payload),meta:{},label:"Fixture",deletedAt:new Date().toISOString()};
      const next={...clone(before),[collection]:context.api.cuttingJobDeletionArray(before[collection],collection,id),deletedItems:[trash,...clone(before.deletedItems)]};
      return {before,next,trash,collection,id};
    }, authorize(plan){return context.api.authorizeCuttingJobDeletion(plan.before,plan.next,plan.collection,plan.id,plan.trash,plan.before.syncMeta.rev);} };
}

for (const [label,collection,active,completed,id] of [
  ["one of several active","cuttingJobs",[job("a"),job("b",2),job("c",3)],[],"b"],
  ["final active","cuttingJobs",[job("a")],[],"a"],
  ["one completed","completedCuttingJobs",[job("keep")],[job("a"),job("b",2)],"a"],
  ["final completed","completedCuttingJobs",[],[job("a")],"a"]
]) test(`${label}: real save guards and transaction preserve exact cloud trash after reload`,async()=>{
  const h=harness(active,completed),before=h.cloud,payload=before[collection].find(entry=>entry.id===id);
  const r=await h.delete(collection,id);
  assert.equal(r.saved,true,r.error);assert.equal(r.stateWriteCompleted,true);assert.equal(h.commits,1);
  assert.equal(h.cloud[collection].some(entry=>entry.id===id),false);
  assert.deepEqual(h.cloud.deletedItems[0].payload,payload);assert.deepEqual(h.cloud.deletedItems.slice(1),before.deletedItems);
  for(const key of ["inventory","completedCuttingJobs","cuttingJobs"]){if(key!==collection)assert.deepEqual(h.cloud[key],before[key]);}
  h.reload();assert.equal(h.window[collection].some(entry=>entry.id===id),false);assert.deepEqual(h.window.deletedItems[0].payload,payload);
});

test("full manual logs, numeric stable ID and attachment unlink state are preserved",async()=>{
  const target=job(123);target.manualLogs=[{dateISO:"2026-01-01",completedHours:2,note:"keep"}];
  const h=harness([target]),r=await h.delete("cuttingJobs","123");assert.equal(r.saved,true,r.error);
  assert.deepEqual(h.cloud.deletedItems[0].payload,target);assert.equal(typeof h.cloud.deletedItems[0].payload.id,"number");
});
test("active priority normalization changes only deterministic priorities and order",async()=>{
  const h=harness([job("a",9),job("b",4),job("c",7)]),before=h.cloud;
  assert.equal((await h.delete("cuttingJobs","b")).saved,true);
  assert.deepEqual(h.cloud.cuttingJobs,[{...before.cuttingJobs[2],priority:1},{...before.cuttingJobs[0],priority:2}]);
});
test("all three UI handlers await the shared operation before success and never mutate arrays",()=>{
  const renderers=fs.readFileSync("js/renderers.js","utf8"),calendar=fs.readFileSync("js/calendar.js","utf8");
  const active=renderers.slice(renderers.indexOf("    if (rm){",renderers.indexOf('// 6) Edit/Remove')),renderers.indexOf("    if (complete){",renderers.indexOf('// 6) Edit/Remove')));
  const history=renderers.slice(renderers.indexOf("    if (histDelete){"),renderers.indexOf("    if (histSave){"));
  const bubble=calendar.slice(calendar.indexOf('b.querySelector("[data-bbl-remove-job]")'),calendar.indexOf('b.querySelector("[data-bbl-edit-job]")'));
  for(const text of [active,history,bubble]){assert.match(text,/await deleteCuttingJob\(/);assert.doesNotMatch(text,/\.splice\(|\.filter\(|saveCloudDebounced|saveCloudNow|recordDeletedItem/);assert.ok(text.indexOf("await deleteCuttingJob")<text.indexOf("toast("));}
});
for(const [label,mutate] of [
  ["missing trash",p=>{p.next.deletedItems.shift();}],
  ["altered trash payload",p=>{p.next.deletedItems[0].payload.notes="altered";}],
  ["wrong trash type",p=>{p.next.deletedItems[0].type="completed-job";}],
  ["wrong job ID",p=>{p.id="missing";}],
  ["multiple job removal",p=>{p.next.cuttingJobs=[];}],
  ["different job removal",p=>{p.next.cuttingJobs=[clone(p.before.cuttingJobs[0])];}],
  ["unrelated protected change",p=>{p.next.inventory[0].note="altered";}],
  ["arbitrary priority change",p=>{p.next.cuttingJobs[0].priority=999;}],
  ["altered existing trash",p=>{p.next.deletedItems[1].label="altered";}],
  ["altered source payload",p=>{p.trash.payload.notes="altered";}]
]) test(`${label}: authorization rejected`,()=>{
  const h=harness(),p=h.staged();mutate(p);assert.equal(h.authorize(p).authorized,false);assert.equal(h.commits,0);
});
test("ambiguous numeric/string IDs in either collection and missing targets reject without mutation",async()=>{
  for(const [active,completed,id] of [[[job(123),job("123")],[],"123"],[[job("a")],[job("a")],"a"],[[job("a")],[],"missing"]]){
    const h=harness(active,completed),before=h.cloud,r=await h.delete("cuttingJobs",id);assert.equal(r.saved,false);assert.deepEqual(h.cloud,before);assert.equal(h.commits,0);assert.equal(h.confirmations,0);
  }
});
test("cancelled confirmation does not mutate or save",async()=>{
  const h=harness(undefined,undefined,{confirm:false}),before=h.cloud;assert.equal((await h.delete("cuttingJobs","a")).cancelled,true);assert.equal(h.commits,0);assert.deepEqual(h.cloud,before);
});
test("authorization token is one-use and rejects altered resulting state",()=>{
  const h=harness(),p=h.staged(),a=h.authorize(p);assert.equal(a.authorized,true);
  assert.equal(h.api.consumeCuttingJobDeletionAuthorization(a.token,p.next,7).authorized,true);
  assert.equal(h.api.consumeCuttingJobDeletionAuthorization(a.token,p.next,7).authorized,false);
  const b=h.authorize(p);p.next.deletedItems.shift();assert.equal(h.api.consumeCuttingJobDeletionAuthorization(b.token,p.next,7).authorized,false);
});
test("stale revision and expired proof reject",()=>{
  const h=harness(),p=h.staged(),a=h.authorize(p),claimed=h.api.consumeCuttingJobDeletionAuthorization(a.token,p.next,7);
  p.before.syncMeta.rev=8;assert.equal(h.api.validateCuttingJobDeletionSave(p.before,p.next,claimed.proof).valid,false);
  h.context.Date={now:()=>Date.now()+61000};p.before.syncMeta.rev=7;
  assert.equal(h.api.validateCuttingJobDeletionSave(p.before,p.next,claimed.proof).valid,false);
});
for(const [label,mutate] of [["revision CAS conflict",(_w,c)=>{c.syncMeta.rev=8;}],["same-revision source edit",(_w,c)=>{c.cuttingJobs[0].notes="remote edit";}],["same-revision unrelated edit",(_w,c)=>{c.inventory[0].note="remote edit";}]]) test(`${label}: transaction rejects before write and rolls deletion back`,async()=>{
  const h=harness(undefined,undefined,{beforeTransaction:mutate}),r=await h.delete("cuttingJobs","a");
  assert.equal(r.saved,false);assert.equal(r.rolledBack,true);assert.equal(h.commits,0);assert.equal(h.window.cuttingJobs.some(j=>j.id==="a"),true);assert.equal(h.window.deletedItems.length,1);
});
test("transaction checks trash again after outer approval and rejects proof reuse",async()=>{
  const h=harness(),p=h.staged(),a=h.authorize(p),claimed=h.api.consumeCuttingJobDeletionAuthorization(a.token,p.next,7);
  p.next.deletedItems[0].payload.notes="changed";
  const r=await h.api.writeAuthoritativeStateSnapshot(p.next,{merge:true},{expectedRevision:7,cuttingJobDeletionProof:claimed.proof});
  assert.equal(r.definiteFailure,true);assert.equal(h.commits,0);
  assert.equal((await h.api.writeAuthoritativeStateSnapshot(p.next,{merge:true},{expectedRevision:7,cuttingJobDeletionProof:claimed.proof})).saved,false);
});
test("Firestore callback retries revalidate the same proof and commit only once",async()=>{
  const h=harness(undefined,undefined,{retryCallback:true}),r=await h.delete("cuttingJobs","a");assert.equal(r.saved,true,r.error);assert.equal(h.commits,1);assert.equal(h.cloud.deletedItems.length,2);
});
test("definite failure restores only owned deletion, preserving concurrent changes and trash",async()=>{
  const h=harness([job("a",1),job("b",4),job("c",7)],[],{writeError:Object.assign(Error("denied"),{code:"permission-denied"}),beforeTransaction:w=>{
    w.cuttingJobs.find(j=>j.id==="b").notes="concurrent note";w.cuttingJobs.find(j=>j.id==="c").priority=99;w.inventory[0].note="concurrent inventory";
    w.deletedItems.push({id:"concurrent-trash",type:"job",payload:job("concurrent")});
  }}),r=await h.delete("cuttingJobs","a");
  assert.equal(r.saved,false);assert.equal(r.rolledBack,true);assert.equal(h.commits,0);
  assert.deepEqual(h.window.cuttingJobs.map(j=>j.id),["a","b","c"]);assert.equal(h.window.cuttingJobs[1].notes,"concurrent note");assert.equal(h.window.cuttingJobs[1].priority,4);assert.equal(h.window.cuttingJobs[2].priority,99);
  assert.equal(h.window.inventory[0].note,"concurrent inventory");assert.deepEqual(h.window.deletedItems.map(e=>e.id),["old-trash","concurrent-trash"]);
  assert.equal(h.backup.cuttingJobs.some(j=>j.id==="a"),true);assert.equal(h.backup.inventory[0].note,"concurrent inventory");assert.equal(h.api.history().current.cuttingJobs.some(j=>j.id==="a"),true);
});
test("changed rollback ownership preserves replacement state and enters recovery",async()=>{
  const h=harness(undefined,undefined,{writeError:Object.assign(Error("denied"),{code:"permission-denied"}),beforeTransaction:w=>{w.cuttingJobs=[job("replacement")];}}),r=await h.delete("cuttingJobs","a");
  assert.equal(r.rolledBack,false);assert.deepEqual(h.window.cuttingJobs.map(j=>j.id),["replacement"]);assert.equal(h.window.__autosaveDisabled,true);assert.ok(h.diagnostics);
});
test("indeterminate acknowledgement after committed write never blindly rolls back",async()=>{
  const h=harness([job("a")],[],{loseAcknowledgement:true}),r=await h.delete("cuttingJobs","a");
  assert.equal(r.stateWriteAttempted,true);assert.equal(r.stateWriteCompleted,false);assert.equal(r.definiteFailure,false);
  assert.equal(h.transactions,1);assert.equal(h.reads,1);
  assert.equal(r.indeterminate,true);assert.equal(h.commits,1);assert.equal(h.window.cuttingJobs.length,0);assert.equal(h.cloud.cuttingJobs.length,0);assert.equal(h.window.deletedItems.length,2);assert.equal(h.window.__recoveryInspectMode,true);
  h.reload();assert.equal(h.window.cuttingJobs.length,0);assert.equal(h.window.deletedItems[0].payload.id,"a");
});
for(const collection of ["cuttingJobs","completedCuttingJobs"]) test(`${collection}: ordinary unauthorized small/final shrink remains blocked in both save layers`,async()=>{
  for(const size of [1,3]){
    const jobs=Array.from({length:size},(_,i)=>job(String(i),i+1));const h=harness(collection==="cuttingJobs"?jobs:[],collection==="completedCuttingJobs"?jobs:[]);
    h.window[collection].shift();const result=await h.api.performCloudSave();assert.equal(result.saved,false);assert.equal(h.commits,0);
    const next=h.api.compactStateForStorage(h.api.snapshotState());const inner=await h.api.writeAuthoritativeStateSnapshot(next,{merge:true},{expectedRevision:7});assert.equal(inner.saved,false);assert.equal(inner.definiteFailure,true);assert.equal(h.commits,0);
  }
});
test("original registry and legacy last-record blockers remain effective without projection",()=>{
  const h=harness([job("a")],[job("done")]),before=h.cloud,next=clone(before);next.cuttingJobs=[];next.completedCuttingJobs=[];
  const preflight=h.api.validateProtectedSavePreflight({baselineState:before,latestRemoteState:before,pendingState:next,skipRuntimeGates:true});
  assert.ok(preflight.reasons.some(r=>r.type==="protected_count_zeroed"&&r.path==="cuttingJobs"));
  assert.ok(h.api.detectDangerousProtectedFieldReduction(before,next).legacyIssues.some(r=>r.type==="array_would_be_emptied"));
});

for(const entry of ["active","history","calendar"]) test(`${entry} actual callback waits for confirmed persistence and suppresses concurrent deletion`,async()=>{
  let begin,finish;const started=new Promise(resolve=>{begin=resolve;}),gate=new Promise(resolve=>{finish=resolve;});
  const collection=entry==="history"?"completedCuttingJobs":"cuttingJobs";
  const h=harness(collection==="cuttingJobs"?[job("a")]:[],collection==="completedCuttingJobs"?[job("a")]:[],{beforeTransaction:async()=>{begin();await gate;}});
  const messages=[];Object.assign(h.context,{toast:value=>messages.push(value),closeFileMenu(){},closeActionMenu(){},closeHistoryActionMenu(){},renderJobs(){},renderCalendarPreservingScroll(){},hideBubble(){},route(){},editingCompletedJobsSet:()=>new Set()});
  if(entry==="calendar"){
    const calendar=fs.readFileSync("js/calendar.js","utf8"),text=calendar.slice(calendar.indexOf('b.querySelector("[data-bbl-remove-job]")'),calendar.indexOf('b.querySelector("[data-bbl-edit-job]")'));
    h.context.j=h.window.cuttingJobs[0];h.context.b={querySelector:()=>({addEventListener:(_type,callback)=>{h.context.click=callback;}})};vm.runInContext(text,h.context);
  }else{
    const renderers=fs.readFileSync("js/renderers.js","utf8");let text;
    if(entry==="active"){
      h.context.rm={getAttribute:()=>"a"};text=renderers.slice(renderers.indexOf("    if (rm){",renderers.indexOf('// 6) Edit/Remove')),renderers.indexOf("    if (complete){",renderers.indexOf('// 6) Edit/Remove')));
    }else{
      h.context.histDelete={getAttribute:()=>"a"};text=renderers.slice(renderers.indexOf("    if (histDelete){"),renderers.indexOf("    if (histSave){"));
    }
    vm.runInContext(`this.click=async()=>{${text}}`,h.context);
  }
  const pending=h.context.click();await started;assert.equal(h.commits,0);assert.deepEqual(messages,[]);
  assert.equal((await h.delete(collection,"a")).saved,false);assert.equal(h.confirmations,1);
  finish();await pending;assert.equal(h.commits,1);assert.equal(h.cloud[collection].length,0);assert.deepEqual(messages,[entry==="history"?"History entry deleted":"Removed"]);assert.equal(h.historyCaptures,1);
});

test("ordinary save cannot reuse the in-flight deletion and normal completion IDs remain retained",()=>{
  const h=harness(),p=h.staged();assert.equal(h.api.validateCuttingJobDeletionSave(p.before,p.next).valid,false);
  const completion=clone(p.before);completion.completedCuttingJobs.push(completion.cuttingJobs.shift());
  assert.equal(h.api.validateCuttingJobDeletionSave(p.before,completion).valid,true);
});

test("committed indeterminate deletion retains classification and evidence when recovery rendering and logging throw",async()=>{
  const h=harness([job("a")],[],{loseAcknowledgement:true}),messages=[];
  h.context.renderRecoveryDiagnosticsPanel=()=>{throw Error("diagnostics renderer failed");};
  h.context.console.warn=()=>{throw Error("secondary logger failed");};
  const result=await h.delete("cuttingJobs","a");
  assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.equal(result.stateWriteAttempted,true);
  assert.equal(result.rolledBack,undefined);assert.doesNotMatch(result.error,/Job was not deleted/);
  assert.ok(result.warnings.some(message=>message.includes("diagnostics renderer failed")));
  assert.equal(h.commits,1);assert.equal(h.cloud.cuttingJobs.length,0);assert.equal(h.window.cuttingJobs.length,0);
  assert.equal(h.window.deletedItems[0].payload.id,"a");assert.equal(h.window.__autosaveDisabled,true);assert.equal(h.window.__recoveryInspectMode,true);
  // Execute the production active-table callback against the same failure.
  const ui=harness([job("a")],[],{loseAcknowledgement:true});ui.context.renderRecoveryDiagnosticsPanel=h.context.renderRecoveryDiagnosticsPanel;
  Object.assign(ui.context,{rm:{getAttribute:()=>"a"},toast:value=>messages.push(value),closeFileMenu(){},closeActionMenu(){},closeHistoryActionMenu(){},renderCalendarPreservingScroll(){},renderJobs(){}});
  const renderers=fs.readFileSync("js/renderers.js","utf8"),start=renderers.indexOf("    if (rm){",renderers.indexOf('// 6) Edit/Remove')),end=renderers.indexOf("    if (complete){",start);
  vm.runInContext(`this.click=async()=>{${renderers.slice(start,end)}}`,ui.context);await ui.context.click();
  assert.match(messages[0],/uncertain/);assert.doesNotMatch(messages[0],/Job was not deleted|Removed/);
});

test("diagnostic exception after a known pre-write failure stays definite and rolls back",async()=>{
  const h=harness([job("a")],[],{missingState:true});
  h.context.enterMissingStateRecovery=()=>{throw Error("missing-state diagnostic failed");};
  const result=await h.delete("cuttingJobs","a");
  assert.equal(result.saved,false);assert.equal(result.indeterminate,false);assert.equal(result.definiteFailure,true);
  assert.equal(result.stateWriteAttempted,false);assert.equal(result.rolledBack,true);assert.equal(h.commits,0);
  assert.equal(h.window.cuttingJobs[0].id,"a");assert.equal(h.window.deletedItems.length,1);
});

test("reporting error after confirmed success cannot downgrade success or roll back",async()=>{
  const h=harness([job("a")]);h.context.captureHistoryState=()=>{throw Error("history reporting failed");};
  const result=await h.delete("cuttingJobs","a");
  assert.equal(result.saved,true);assert.equal(result.stateWriteCompleted,true);assert.equal(h.commits,1);
  assert.equal(h.window.cuttingJobs.length,0);assert.equal(h.cloud.cuttingJobs.length,0);assert.equal(h.window.deletedItems[0].payload.id,"a");
  assert.ok(result.warnings.some(message=>message.includes("history reporting failed")));
});

for(const collection of ["cuttingJobs","completedCuttingJobs"]) test(`${collection}: delete, Undo, Redo, reload and Undo again preserve exact job/trash`,async()=>{
  const target=job(123,5);target.manualLogs=[{dateISO:"2026-01-01",completedHours:2,note:"keep"}];
  const h=harness(collection==="cuttingJobs"?[target,job("keep",9)]:[job("keep")],collection==="completedCuttingJobs"?[target]:[]),original=h.cloud;
  assert.equal((await h.delete(collection,"123")).saved,true);const archive=clone(h.cloud.deletedItems[0]);
  assert.equal(h.api.history().undo.length,1);
  assert.equal(await h.api.undoLastChange(),true);assert.deepEqual(h.cloud[collection],original[collection]);assert.deepEqual(h.cloud.deletedItems,original.deletedItems);
  assert.equal(h.api.history().redo.length,1);
  assert.equal(await h.api.redoLastUndo(),true);assert.equal(h.cloud[collection].some(j=>String(j.id)==="123"),false);
  assert.deepEqual(h.cloud.deletedItems[0],archive);assert.equal(h.cloud.deletedItems.length,original.deletedItems.length+1);
  h.reload();assert.equal(h.window[collection].some(j=>String(j.id)==="123"),false);assert.deepEqual(h.window.deletedItems[0],archive);
  assert.equal(await h.api.undoLastChange(),true);assert.deepEqual(h.cloud[collection],original[collection]);assert.deepEqual(h.cloud.deletedItems,original.deletedItems);
  assert.equal(await h.api.redoLastUndo(),true);assert.deepEqual(h.cloud.deletedItems[0],archive);assert.equal(h.cloud.deletedItems.length,original.deletedItems.length+1);
  assert.equal(typeof h.cloud.deletedItems[0].payload.id,"number");assert.equal(h.confirmations,1);
});

for(const [label,mutate] of [
  ["multiple removals",p=>{p.next.cuttingJobs=[];}],
  ["missing matching trash",p=>{p.next.deletedItems.shift();}],
  ["altered matching trash",p=>{p.next.deletedItems[0].payload.notes="altered";}],
  ["unrelated protected reduction",p=>{p.next.inventory=[];}],
  ["unrelated protected edit",p=>{p.next.inventory[0].note="altered";}],
  ["expired trash",p=>{p.next.deletedItems[0].deletedAt="2000-01-01T00:00:00Z";}]
]) test(`unsafe history deletion with ${label} rejects before local adoption`,async()=>{
  const h=harness(),p=h.staged(),before=h.cloud,history=h.api.history();mutate(p);
  assert.equal(await h.api.applyHistorySnapshot(JSON.stringify(p.next)),false);
  assert.deepEqual(h.cloud,before);assert.deepEqual(h.window.cuttingJobs,before.cuttingJobs);assert.deepEqual(h.window.deletedItems,before.deletedItems);
  assert.equal(h.commits,0);assert.deepEqual(h.api.history(),history);
});

test("redo waits for persistence, rejects stale CAS with bounded rollback and retains redo target",async()=>{
  let pause=false,begin,finish;const started=new Promise(resolve=>{begin=resolve;}),gate=new Promise(resolve=>{finish=resolve;});
  const h=harness([job("a")],[],{beforeTransaction:async()=>{if(pause){begin();await gate;}}});
  assert.equal((await h.delete("cuttingJobs","a")).saved,true);assert.equal(await h.api.undoLastChange(),true);
  const commits=h.commits;pause=true;const redo=h.api.redoLastUndo();await started;
  assert.equal(h.commits,commits);assert.equal(h.api.history().redo.length,1);
  assert.equal(await h.api.redoLastUndo(),false);h.alterCloud(cloud=>{cloud.syncMeta.rev++;});finish();
  assert.equal(await redo,false);assert.equal(h.commits,commits);assert.equal(h.window.cuttingJobs[0].id,"a");
  assert.equal(h.api.history().redo.length,1);assert.equal(h.api.history().current.cuttingJobs[0].id,"a");
});

test("failed history restoration rolls back only owned fields and preserves newer local edits",async()=>{
  let fail=false;const h=harness([job("a"),job("b",4)],[],{beforeTransaction:()=>{
    if(fail){h.window.cuttingJobs.find(j=>j.id==="b").notes="concurrent edit";throw Object.assign(Error("denied"),{code:"permission-denied"});}
  }});
  assert.equal((await h.delete("cuttingJobs","a")).saved,true);const archive=h.cloud.deletedItems[0];fail=true;
  assert.equal(await h.api.undoLastChange(),false);assert.deepEqual(clone(h.window.cuttingJobs.map(j=>j.id)),["b"]);
  assert.equal(h.window.cuttingJobs[0].notes,"concurrent edit");assert.deepEqual(clone(h.window.deletedItems[0]),archive);
  assert.deepEqual(clone(h.api.history().current.cuttingJobs.map(j=>j.id)),["b"]);
});

test("indeterminate history restoration with diagnostic failure preserves restored evidence without accepting Undo",async()=>{
  const behavior={loseAcknowledgement:false},h=harness([job("a")],[],behavior);
  assert.equal((await h.delete("cuttingJobs","a")).saved,true);
  behavior.loseAcknowledgement=true;
  h.context.renderRecoveryDiagnosticsPanel=()=>{throw Error("diagnostics failed");};
  assert.equal(await h.api.undoLastChange(),false);assert.equal(h.window.cuttingJobs[0].id,"a");assert.equal(h.window.deletedItems.length,1);
  assert.equal(h.window.__lastIndeterminateSave.indeterminate,true);assert.equal(h.api.history().undo.length,1);
  assert.equal(h.cloud.cuttingJobs[0].id,"a");assert.equal(h.cloud.deletedItems.length,1);
});

for(const collection of ["cuttingJobs","completedCuttingJobs"]) test(`${collection}: rejected deletion reconciles concurrent real history captures without erasing prior history`,async()=>{
  let concurrentSave,once=false;
  const h=harness(collection==="cuttingJobs"?[job("a"),job("b",4)]:[job("keep")],collection==="completedCuttingJobs"?[job("a"),job("b",4)]:[],{
    writeError:Object.assign(Error("denied"),{code:"permission-denied"}),beforeTransaction:()=>{
      if(once)return;once=true;
      h.window[collection].find(j=>j.id==="b").notes="first concurrent edit";h.context.saveCloudDebounced();
      h.window.inventory[0].note="second concurrent edit";concurrentSave=h.context.saveCloudNow();
    }
  });
  h.window.appConfig.dailyHours=9;h.api.captureHistorySnapshot();h.window.appConfig.dailyHours=8;h.api.captureHistorySnapshot();
  const previous=h.api.history().undo;
  const result=await h.delete(collection,"a");await concurrentSave;h.api.cancel();
  assert.equal(result.rolledBack,true);assert.deepEqual(h.window[collection].map(j=>j.id),["a","b"]);
  const history=h.api.history();assert.deepEqual(history.undo.slice(0,previous.length),previous);
  assert.equal(history.current[collection].some(j=>j.id==="a"),true);assert.equal(history.current[collection].find(j=>j.id==="b").notes,"first concurrent edit");
  assert.equal(history.current.inventory[0].note,"second concurrent edit");assert.equal(history.current.deletedItems.length,1);
  for(const frame of [...history.undo,history.current]){assert.equal(frame[collection].some(j=>j.id==="a"),true);assert.equal(frame.deletedItems.length,1);}
  assert.ok(history.undo.some(frame=>frame[collection].find(j=>j.id==="b")?.notes==="first concurrent edit"));
});

test("history with only unrelated protected reduction rejects before adoption",async()=>{
  const h=harness(),target=h.cloud,before=h.cloud;target.inventory=[];
  assert.equal(await h.api.applyHistorySnapshot(JSON.stringify(target)),false);assert.deepEqual(h.cloud,before);
  assert.deepEqual(h.window.inventory,before.inventory);assert.equal(h.commits,0);
});

test("history restoration checks the newest archive payload even without a revision change",async()=>{
  let drift=false;const h=harness([job("a")],[],{beforeTransaction:(_w,cloud)=>{if(drift)cloud.deletedItems[0].payload.notes="remote archive edit";}});
  assert.equal((await h.delete("cuttingJobs","a")).saved,true);const commits=h.commits;drift=true;
  assert.equal(await h.api.undoLastChange(),false);assert.equal(h.commits,commits);assert.equal(h.window.cuttingJobs.length,0);
  assert.equal(h.cloud.deletedItems[0].payload.notes,"remote archive edit");assert.equal(h.api.history().undo.length,1);
});

test("failed deletion history reconciliation preserves concurrent job order and priority edits",async()=>{
  let concurrentSave,once=false;
  const h=harness([job("a"),job("b",2),job("c",3)],[],{
    writeError:Object.assign(Error("denied"),{code:"permission-denied"}),beforeTransaction:()=>{
      if(once)return;once=true;
      h.window.cuttingJobs.reverse();h.window.cuttingJobs.find(j=>j.id==="b").priority=44;
      h.api.captureHistorySnapshot();h.window.cuttingJobs.find(j=>j.id==="b").notes="newer note";
      concurrentSave=h.context.saveCloudNow();
    }
  });
  assert.equal((await h.delete("cuttingJobs","a")).rolledBack,true);await concurrentSave;
  assert.deepEqual(h.window.cuttingJobs.map(j=>j.id),["a","c","b"]);
  const history=clone(h.api.history());
  assert.deepEqual(history.current.cuttingJobs.map(j=>j.id),["a","c","b"]);
  const priorConcurrentFrame=history.undo[history.undo.length-1];
  assert.deepEqual(priorConcurrentFrame.cuttingJobs.map(j=>j.id),["a","c","b"]);
  assert.equal(priorConcurrentFrame.cuttingJobs.find(j=>j.id==="b").priority,44);
  assert.equal(history.current.cuttingJobs.find(j=>j.id==="b").notes,"newer note");
});

function installNormalHistoryAdoption(h){
  Object.assign(h.context,{defaultIntervalTasks:[],defaultAsReqTasks:[],normalizeInventoryItem:value=>value,
    ensureInventoryForAllMaintenanceTasks(){},normalizeOrderRequests:value=>value,normalizeDailyCutHours:value=>value,
    normalizeDeletedItems:value=>value,purgeExpiredDeletedItems(){},setJobFolders:value=>{h.window.jobFolders=value||[];},
    ensureTaskCategories(){},ensureJobCategories(){}});
  h.window.pumpEff={baselineRPM:null,baselineDateISO:null,entries:[],notes:[]};
  h.alterCloud(cloud=>{cloud.pumpEff=clone(h.window.pumpEff);});
  h.window.__lastLoadedCloudState=h.cloud;
  h.context.resetHistoryToCurrent();
  vm.runInContext(fn("adoptState"),h.context);
}

for(const collection of ["cuttingJobs","completedCuttingJobs"]) for(const pendingEdit of [false,true])
test(`${collection}: pending history flush preserves both Undo actions and ordered Redo (edit pending=${pendingEdit})`,async()=>{
  const h=harness(collection==="cuttingJobs"?[job("a"),job("b",2)]:[],collection==="completedCuttingJobs"?[job("a"),job("b",2)]:[]);
  installNormalHistoryAdoption(h);
  const original=h.cloud;
  assert.equal((await h.delete(collection,"a")).saved,true);
  const archive=h.cloud.deletedItems[0];
  h.window[collection].find(job=>job.id==="b").notes="edited B";
  if(pendingEdit) h.context.saveCloudDebounced();
  else assert.equal((await h.context.saveCloudNow()).saved,true);
  assert.equal(h.api.history().undo.length,2,"normal saves must still capture the edit");
  for(let cycle=0;cycle<2;cycle++){
    assert.equal(await h.api.undoLastChange(),true);
    assert.equal(h.window[collection].find(job=>job.id==="b").notes,"preserve");
    assert.equal(h.api.history().redo.length,1);
    const beforeFlush=h.commits;
    assert.equal(await h.api.undoLastChange(),true);
    assert.equal(h.commits,beforeFlush+2,"pending ordinary save and exact restoration both persist");
    assert.deepEqual(h.cloud[collection],original[collection]);
    assert.deepEqual(h.cloud.deletedItems,original.deletedItems);
    assert.equal(h.api.history().undo.length,0,"the flush must not introduce a metadata frame");
    assert.equal(h.api.history().redo.length,2);
    assert.equal(await h.api.redoLastUndo(),true);
    assert.equal(h.cloud[collection].some(job=>job.id==="a"),false);
    assert.equal(h.cloud[collection].find(job=>job.id==="b").notes,"preserve");
    assert.deepEqual(h.cloud.deletedItems[0],archive);
    assert.equal(h.api.history().undo.length,1);assert.equal(h.api.history().redo.length,1);
    assert.equal(await h.api.redoLastUndo(),true);
    assert.equal((await h.api.flush()).saved,true);
    assert.equal(h.cloud[collection].find(job=>job.id==="b").notes,"edited B");
    assert.equal(h.api.history().undo.length,2);assert.equal(h.api.history().redo.length,0);
    assert.equal(h.cloud.deletedItems.length,original.deletedItems.length+1);
  }
  h.api.cancel();
});

for(const collection of ["cuttingJobs","completedCuttingJobs"])
test(`${collection}: Redo safely flushes pending persistence without replacing its history target`,async()=>{
  const h=harness(collection==="cuttingJobs"?[job("a")]:[],collection==="completedCuttingJobs"?[job("a")]:[]);
  assert.equal((await h.delete(collection,"a")).saved,true);const archive=h.cloud.deletedItems[0];
  assert.equal(await h.api.undoLastChange(),true);
  const before=h.commits;
  const pending=h.context.saveCloudNowForHistory();
  assert.equal(h.api.history().undo.length,0);assert.equal(h.api.history().redo.length,1);
  const redo=h.api.redoLastUndo();assert.equal((await pending).saved,true);assert.equal(await redo,true);
  assert.equal(h.commits,before+3,"queued save, required flush and authorized Redo persist");
  assert.equal(h.api.history().undo.length,1);assert.equal(h.api.history().redo.length,0);
  assert.equal(h.cloud[collection].length,0);assert.deepEqual(h.cloud.deletedItems[0],archive);
  assert.equal(await h.api.undoLastChange(),true);assert.equal(h.cloud[collection][0].id,"a");h.api.cancel();
});

test("history-neutral flushing restores capture immediately while concurrent edits are saved",async()=>{
  let pendingEdit,once=false;
  const h=harness(undefined,undefined,{beforeTransaction:()=>{
    if(once)return;once=true;h.window.cuttingJobs[1].notes="concurrent B";
    pendingEdit=h.context.saveCloudNow();
  }});
  const original=h.api.history();
  assert.equal((await h.context.saveCloudNowForHistory()).saved,true);
  assert.equal((await pendingEdit).saved,true);
  assert.equal(h.api.history().undo.length,original.undo.length+1);
  assert.equal(h.api.history().current.cuttingJobs[1].notes,"concurrent B");
  assert.equal(h.cloud.cuttingJobs[1].notes,"concurrent B");h.api.cancel();
});

const preWriteGates=[
  ["write gate closed","cloud_write_gate_closed",h=>{h.window.__autosaveDisabled=true;}],
  ["Firebase not ready","firebase_not_ready",h=>{h.context.FB.ready=false;}],
  ["missing document reference","authoritative_doc_ref_unavailable",h=>{h.context.FB.docRef=null;}],
  ["preview read-only","preview_readonly",h=>{h.context.isVercelPreviewRuntime=()=>true;}]
];
function assertDefiniteNoWrite(result,code){
  assert.equal(result.saved,false);assert.equal(result.definiteFailure,true);assert.equal(result.indeterminate,false);
  assert.equal(result.stateWriteAttempted,false);assert.equal(result.stateWriteCompleted,false);assert.equal(result.errorCode,code);
}
for(const [label,code,closeGate]of preWriteGates){
  test(`${label}: production save gate returns definite no-write without a read or transaction`,async()=>{
    const h=harness();closeGate(h);assertDefiniteNoWrite(await h.api.performCloudSave(),code);
    assert.equal(h.reads,0);assert.equal(h.transactions,0);assert.equal(h.commits,0);
    assert.equal(h.window.__lastIndeterminateSave,undefined);assert.equal(h.diagnostics,0);h.api.cancel();
  });
  for(const collection of ["cuttingJobs","completedCuttingJobs"])
  test(`${collection}: ${label} after staging rolls back only the owned deletion`,async()=>{
    const h=harness(collection==="cuttingJobs"?[job("a")]:[],collection==="completedCuttingJobs"?[job("a")]:[]),before=h.cloud;
    const saving=h.delete(collection,"a");
    queueMicrotask(()=>{assert.equal(h.window[collection].length,0,"gate closes after local staging");closeGate(h);});
    const result=await saving;assertDefiniteNoWrite(result,code);assert.equal(result.rolledBack,true);
    assert.equal(h.reads,0);assert.equal(h.transactions,0);assert.equal(h.commits,0);
    assert.deepEqual(h.window[collection],before[collection]);assert.deepEqual(h.window.deletedItems,before.deletedItems);
    assert.deepEqual(clone(h.api.history().current[collection]),before[collection]);
    assert.equal(h.window.__lastIndeterminateSave,undefined);assert.equal(h.window.__recoveryInspectMode,undefined);assert.equal(h.diagnostics,0);
    assert.equal(Boolean(h.window.__autosaveDisabled),label==="write gate closed","only the preexisting gate remains disabled");
    h.api.cancel();
  });
}

test("immediate and debounced disabled saves return the same definite no-write contract",async()=>{
  for(const [label,code,closeGate]of preWriteGates.filter(([label])=>label==="write gate closed"||label==="preview read-only")){
    const h=harness();closeGate(h);assertDefiniteNoWrite(await h.context.saveCloudNow(),code);
    assertDefiniteNoWrite(h.context.saveCloudDebounced(),code);assert.equal(h.transactions,0);assert.equal(h.reads,0);h.api.cancel();
  }
});
