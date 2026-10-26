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
    const result = await callback(transaction);
    if (options.retryCallback) await callback(transaction);
    if (next === undefined) return result; // Independent backend read; no commit.
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
  const functions = ["cloneStructured","estimatePayloadBytes","countObjectKeys","countTaskNestedMapEntries","countTaskNestedArrayEntries","countJobManualLogs","getValueAtPath","getDataSafetyShape","countCollectionValue","countNestedProtectedValues","stableStringifyForIntegrity","hashIntegrityString","fingerprintProtectedValue","countProtectedField","validateProtectedFieldShape","getProtectedFieldRegistryCoverage","buildProtectedFieldIntegritySummary","buildDataIntegritySummary","hasAnyProtectedData","hasAnyProtectedFieldPresence","isDangerousShapeChange","chooseProtectedSaveBaseline","detectDangerousIntegrityReduction","validateProtectedSavePreflight","buildProtectedFieldSummary","compareProtectedFieldSummaries","detectDangerousProtectedFieldReduction","isRecoveryMode","canWriteCloud","blockCloudSave","buildTrashLabel","refreshGlobalCollections","snapshotState","isDataUrl","isLikelyEmbeddedFileContent","isSafeMetadataString","isProtectedBusinessDataKey","sanitizeValueForStorage","compactStateForStorage","scanAuthoritativeCutFileContent","captureCuttingJobSaveTarget","cuttingJobSaveTargetIsCurrent","readMaintenanceTaskAuthoritativeState","performCloudSave","saveCloudNow","saveCloudDebounced","adoptAuthoritativeRecoveryState","debounce","resetHistoryToCurrent","captureHistorySnapshot","captureHistoryState","applyHistorySnapshot","undoLastChange","redoLastUndo"];
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


module.exports={harness,job,fn,constant};
