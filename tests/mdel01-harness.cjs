"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const archive=require("../js/maintenanceTaskArchive"),identity=require("../js/globalIdentityRepair"),atomic=require("../js/atomicPersistence"),firewall=require("../js/cuttingFileContentFirewall");
const {fixture}=require("./fixtures/mdel01-maintenance-task"),clone=structuredClone,core=fs.readFileSync("js/core.js","utf8");
function fn(name){const start=core.search(new RegExp("^(?:async )?function "+name+"\\(","m"));assert.ok(start>=0,name);return core.slice(start,core.indexOf("\n}",start)+2);}
function constant(name){const start=core.indexOf("const "+name+" =");assert.ok(start>=0,name);return core.slice(start,core.indexOf(";",start)+1);}
const bindings=["totalHistory","tasksInterval","tasksAsReq","inventory","cuttingJobs","completedCuttingJobs","orderRequests","garnetCleanings","dailyCutHours","opportunityRollups","weeklyCostReports","receiptTrackerWeeks","maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2","deletedItems","appConfig","jobFolders","orderRequestTab"];
function harness(options={}){
  let cloud=clone(options.initial||fixture()),listener=clone(cloud),writing=false,commits=0,writeTransactions=0,readTransactions=0,documentReads=0,diagnostics=0,storedBackup=options.backup||null;
  const window={...clone(cloud),OMAXMaintenanceTaskArchive:archive,OMAXGlobalIdentityRepair:identity,OMAXAtomicPersistence:atomic,CuttingFileContentFirewall:firewall,
    __cloudLoadAttemptComplete:true,__initialAdoptComplete:true,__loadedCloudRevisionForSaveGuard:cloud.syncMeta.rev,location:{search:"",hostname:"localhost"},...(options.windowModules||{})};
  let context;
  const snapshot=state=>({exists:!!state,data:()=>clone(state),metadata:{fromCache:false,hasPendingWrites:false}});
  async function readState(fromDocument){
    if(commits){await options.duringVerification?.({window,context,cloud});if(options.readFailure)throw Error("Independent backend read unavailable");}
    let state=clone(fromDocument&&options.staleListener ? listener : cloud);
    if(commits)options.readbackMutation?.(state);
    return snapshot(state);
  }
  const db={async runTransaction(callback){
    if(!writing){readTransactions++;return callback({get:async ref=>{assert.equal(ref,context.FB.docRef);return readState(false);},set(){throw Error("Read-only verification must never write");},update(){throw Error("Read-only verification must never update");},delete(){throw Error("Read-only verification must never delete");}});}
    writeTransactions++;if(options.conflict)cloud.syncMeta.rev++;
    await options.beforeWrite?.({window,context,cloud});
    let queued;const result=await callback({get:async()=>snapshot(cloud),set:(_ref,state)=>{queued=clone(state);}});
    if(options.reject)throw Object.assign(Error("Permission denied"),{code:"permission-denied"});
    if(options.unknownWithoutCommit)throw Error("Uncertain write acknowledgement");
    cloud=queued;commits++;if(options.loseAck)throw Error("Acknowledgement lost after commit");return result;
  }};
  context=vm.createContext({window,URLSearchParams,TextEncoder,structuredClone,Blob,Map,WeakSet,setTimeout,clearTimeout,
    console:{warn(){},error(){},info(){}},document:{getElementById:()=>null},WORKSPACE_ID:"fixture",APP_SCHEMA:72,
    FB:{ready:true,user:{uid:"fixture"},db,app:{options:{projectId:"fixture-project"}},docRef:{path:"fixture/app/state",get:async readOptions=>{assert.equal(readOptions.source,"server");documentReads++;return readState(true);}}},
    FIRESTORE_BLOCK_BYTES:950000,getCloudSyncClientId:()=>"fixture-client",genId:()=>{if(options.forbidNewId)throw Error("Restoration must not generate IDs");return "fixture-trash-A";},readLocalStateBackup:()=>storedBackup,compactStateForStorage:clone,
    getSaveSchemaCoverageReport:()=>({cloudExcludedProtectedPaths:[]}),classifyMissingProtectedPathsForSave:()=>({blocking:[],warnings:[]}),
    persistLocalStateBackup:state=>{if(options.backupFailure)throw Error("Backup unavailable");if(!options.backupSilentFailure)storedBackup=clone(state);options.onBackup?.(clone(state));},
    renderRecoveryDiagnosticsPanel:()=>diagnostics++,showLocalBackupConflictWarning(){},syncRenderTotalsFromHistory(){},resetHistoryToCurrent(){if(commits&&options.adoptionFailure)throw Error("History initialization failed");},
    setCloudLoadGate:value=>{window.__cloudLoadAttemptComplete=value.loadComplete;window.__initialAdoptComplete=value.adoptComplete;},
    mergeTotalHistoryForSave:()=>{throw Error("Deletion must preserve history verbatim");},mergeDailyCutHoursForSave:()=>{throw Error("Deletion must preserve daily data verbatim");},mergePumpEffForSave:()=>{throw Error("Deletion must preserve pump data verbatim");},
    isVercelPreviewRuntime:()=>false,toast(){}});
  const constants=["PROTECTED_STATE_FIELDS","REQUIRED_PROTECTED_DATA_PATHS","PROTECTED_FIELD_REGISTRY","DATA_SAFETY_PREFLIGHT_COUNT_DROP_RATIO","DATA_SAFETY_PREFLIGHT_MIN_BASELINE_COUNT","DATA_SAFETY_PREFLIGHT_TOTAL_DROP_RATIO","DATA_SAFETY_PREFLIGHT_SIZE_DROP_RATIO"];
  const functions=["cloneStructured","stateHasMeaningfulData","stableStringify","estimatePayloadBytes","countObjectKeys","countTaskNestedMapEntries","countTaskNestedArrayEntries","countJobManualLogs","getValueAtPath","getDataSafetyShape","countCollectionValue","countNestedProtectedValues","stableStringifyForIntegrity","hashIntegrityString","fingerprintProtectedValue","countProtectedField","validateProtectedFieldShape","getProtectedFieldRegistryCoverage","buildProtectedFieldIntegritySummary","buildDataIntegritySummary","hasAnyProtectedData","hasAnyProtectedFieldPresence","isDangerousShapeChange","chooseProtectedSaveBaseline","detectDangerousIntegrityReduction","validateProtectedSavePreflight","buildProtectedFieldSummary","compareProtectedFieldSummaries","detectDangerousProtectedFieldReduction","isRecoveryMode","canWriteCloud","blockCloudSave","scanAuthoritativeCutFileContent","reportCloudSaveSecondaryError","validateCuttingJobHistoryRestoreSave","validateCuttingJobDeletionSave","cuttingJobDeletionSafetyBaseline","writeAuthoritativeStateSnapshot","getInventoryIdentityRepairLocalState","buildWindowProtectedStateForCoverage","inspectInventoryIdentities","adoptAuthoritativeRecoveryState","adoptState","checkAuthoritativeIdentityIntegrity","adoptIdentityCheckedAuthoritativeState","loadFromCloud","captureCuttingJobSaveTarget","cuttingJobSaveTargetIsCurrent","readCuttingJobAuthoritativeSnapshot","readMaintenanceTaskAuthoritativeState"];
  vm.runInContext(bindings.map(name=>"let "+name+"=window."+name+";").join("\n")+"\nlet lastAppliedCloudRevision=7,lastLocalMutationAt=0,hasPendingLocalChanges=false,cloudSaveQueue=Promise.resolve();const inventoryIdentityRepairAuthorizations=new Map(),cuttingJobDeletionProofs=new WeakSet(),cuttingJobDeletionTransactions=new WeakSet(),cuttingJobHistoryRestoreProofs=new WeakSet(),cuttingJobHistoryRestoreTransactions=new WeakSet();\n"+constants.map(constant).join("\n")+"\n"+functions.map(fn).join("\n"),context);
  if(options.realCoverage){
    vm.runInContext(fn("getSaveSchemaCoveragePathInfo")+"\n"+fn("classifyMissingProtectedPathsForSave"),context);
    context.getSaveSchemaCoverageReport=({pendingSnapshot})=>({missingProtectedPaths:["tasksInterval.calendarCancellations","tasksAsReq.calendarCancellations"].filter(path=>!context.getSaveSchemaCoveragePathInfo(pendingSnapshot,path).present),cloudExcludedProtectedPaths:[]});
  }
  context.getCuttingJobChronologyLocalState=()=>context.getInventoryIdentityRepairLocalState();
  assert.equal(context.adoptIdentityCheckedAuthoritativeState(clone(cloud)).recovery,options.expectRecovery===true);
  const guardedWriter=context.writeAuthoritativeStateSnapshot;
  context.writeAuthoritativeStateSnapshot=async(...args)=>{writing=true;try{options.pendingMutation?.(args[0]);return await guardedWriter(...args);}finally{writing=false;}};
  const start=core.indexOf("window.maintenanceTaskDeletionApi=");
  vm.runInContext(core.slice(start,core.indexOf("let inventoryMaterialOwnedSuspension",start)),context);
  return {api:window.maintenanceTaskDeletionApi,window,context,get cloud(){return clone(cloud);},get local(){return clone(context.getInventoryIdentityRepairLocalState());},get commits(){return commits;},get readTransactions(){return readTransactions;},get writeTransactions(){return writeTransactions;},get documentReads(){return documentReads;},get diagnostics(){return diagnostics;}};
}

module.exports={harness};
