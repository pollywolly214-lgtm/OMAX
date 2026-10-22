"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const archive=require("../js/maintenanceTaskArchive"),identity=require("../js/globalIdentityRepair"),atomic=require("../js/atomicPersistence"),firewall=require("../js/cuttingFileContentFirewall");
const {fixture}=require("./fixtures/mdel01-maintenance-task"),clone=structuredClone,core=fs.readFileSync("js/core.js","utf8");
function fn(name){const start=core.search(new RegExp("^(?:async )?function "+name+"\\(","m"));assert.ok(start>=0,name);return core.slice(start,core.indexOf("\n}",start)+2);}
function constant(name){const start=core.indexOf("const "+name+" =");assert.ok(start>=0,name);return core.slice(start,core.indexOf(";",start)+1);}
const bindings=["totalHistory","tasksInterval","tasksAsReq","inventory","cuttingJobs","completedCuttingJobs","orderRequests","garnetCleanings","dailyCutHours","opportunityRollups","weeklyCostReports","receiptTrackerWeeks","maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2","deletedItems","appConfig","jobFolders","orderRequestTab"];
function harness(options={}){
  let cloud=clone(options.initial||fixture()),listener=clone(cloud),writing=false,commits=0,writeTransactions=0,readTransactions=0,documentReads=0,diagnostics=0;
  const window={...clone(cloud),OMAXMaintenanceTaskArchive:archive,OMAXGlobalIdentityRepair:identity,OMAXAtomicPersistence:atomic,CuttingFileContentFirewall:firewall,
    __cloudLoadAttemptComplete:true,__initialAdoptComplete:true,__loadedCloudRevisionForSaveGuard:cloud.syncMeta.rev,location:{search:"",hostname:"localhost"}};
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
    let queued;const result=await callback({get:async()=>snapshot(cloud),set:(_ref,state)=>{queued=clone(state);}});
    if(options.reject)throw Object.assign(Error("Permission denied"),{code:"permission-denied"});
    if(options.unknownWithoutCommit)throw Error("Uncertain write acknowledgement");
    cloud=queued;commits++;if(options.loseAck)throw Error("Acknowledgement lost after commit");return result;
  }};
  context=vm.createContext({window,URLSearchParams,TextEncoder,structuredClone,Blob,Map,WeakSet,setTimeout,clearTimeout,
    console:{warn(){},error(){},info(){}},document:{getElementById:()=>null},WORKSPACE_ID:"fixture",APP_SCHEMA:72,
    FB:{ready:true,user:{uid:"fixture"},db,app:{options:{projectId:"fixture-project"}},docRef:{path:"fixture/app/state",get:async readOptions=>{assert.equal(readOptions.source,"server");documentReads++;return readState(true);}}},
    FIRESTORE_BLOCK_BYTES:950000,getCloudSyncClientId:()=>"fixture-client",genId:()=>"fixture-trash-A",readLocalStateBackup:()=>null,
    getSaveSchemaCoverageReport:()=>({cloudExcludedProtectedPaths:[]}),classifyMissingProtectedPathsForSave:()=>({blocking:[],warnings:[]}),
    renderRecoveryDiagnosticsPanel:()=>diagnostics++,showLocalBackupConflictWarning(){},syncRenderTotalsFromHistory(){},resetHistoryToCurrent(){if(commits&&options.adoptionFailure)throw Error("History initialization failed");},
    setCloudLoadGate:value=>{window.__cloudLoadAttemptComplete=value.loadComplete;window.__initialAdoptComplete=value.adoptComplete;},
    mergeTotalHistoryForSave:()=>{throw Error("Deletion must preserve history verbatim");},mergeDailyCutHoursForSave:()=>{throw Error("Deletion must preserve daily data verbatim");},mergePumpEffForSave:()=>{throw Error("Deletion must preserve pump data verbatim");},
    isVercelPreviewRuntime:()=>false,toast(){}});
  const constants=["PROTECTED_STATE_FIELDS","REQUIRED_PROTECTED_DATA_PATHS","PROTECTED_FIELD_REGISTRY","DATA_SAFETY_PREFLIGHT_COUNT_DROP_RATIO","DATA_SAFETY_PREFLIGHT_MIN_BASELINE_COUNT","DATA_SAFETY_PREFLIGHT_TOTAL_DROP_RATIO","DATA_SAFETY_PREFLIGHT_SIZE_DROP_RATIO"];
  const functions=["cloneStructured","stateHasMeaningfulData","stableStringify","estimatePayloadBytes","countObjectKeys","countTaskNestedMapEntries","countTaskNestedArrayEntries","countJobManualLogs","getValueAtPath","getDataSafetyShape","countCollectionValue","countNestedProtectedValues","stableStringifyForIntegrity","hashIntegrityString","fingerprintProtectedValue","countProtectedField","validateProtectedFieldShape","getProtectedFieldRegistryCoverage","buildProtectedFieldIntegritySummary","buildDataIntegritySummary","hasAnyProtectedData","hasAnyProtectedFieldPresence","isDangerousShapeChange","chooseProtectedSaveBaseline","detectDangerousIntegrityReduction","validateProtectedSavePreflight","buildProtectedFieldSummary","compareProtectedFieldSummaries","detectDangerousProtectedFieldReduction","isRecoveryMode","canWriteCloud","blockCloudSave","scanAuthoritativeCutFileContent","reportCloudSaveSecondaryError","validateCuttingJobHistoryRestoreSave","validateCuttingJobDeletionSave","cuttingJobDeletionSafetyBaseline","writeAuthoritativeStateSnapshot","getInventoryIdentityRepairLocalState","buildWindowProtectedStateForCoverage","inspectInventoryIdentities","adoptAuthoritativeRecoveryState","adoptState","checkAuthoritativeIdentityIntegrity","adoptIdentityCheckedAuthoritativeState","loadFromCloud","captureCuttingJobSaveTarget","cuttingJobSaveTargetIsCurrent","readCuttingJobAuthoritativeSnapshot","readMaintenanceTaskAuthoritativeState"];
  vm.runInContext(bindings.map(name=>"let "+name+"=window."+name+";").join("\n")+"\nlet lastAppliedCloudRevision=7,lastLocalMutationAt=0,hasPendingLocalChanges=false,cloudSaveQueue=Promise.resolve();const inventoryIdentityRepairAuthorizations=new Map(),cuttingJobDeletionProofs=new WeakSet(),cuttingJobDeletionTransactions=new WeakSet(),cuttingJobHistoryRestoreProofs=new WeakSet(),cuttingJobHistoryRestoreTransactions=new WeakSet();\n"+constants.map(constant).join("\n")+"\n"+functions.map(fn).join("\n"),context);
  context.getCuttingJobChronologyLocalState=()=>context.getInventoryIdentityRepairLocalState();
  assert.equal(context.adoptIdentityCheckedAuthoritativeState(clone(cloud)).recovery,false);
  const guardedWriter=context.writeAuthoritativeStateSnapshot;
  context.writeAuthoritativeStateSnapshot=async(...args)=>{writing=true;try{return await guardedWriter(...args);}finally{writing=false;}};
  const start=core.indexOf("window.maintenanceTaskDeletionApi=");
  vm.runInContext(core.slice(start,core.indexOf("let inventoryMaterialOwnedSuspension",start)),context);
  return {api:window.maintenanceTaskDeletionApi,window,context,get cloud(){return clone(cloud);},get local(){return clone(context.getInventoryIdentityRepairLocalState());},get commits(){return commits;},get readTransactions(){return readTransactions;},get writeTransactions(){return writeTransactions;},get documentReads(){return documentReads;},get diagnostics(){return diagnostics;}};
}
for(const staleListener of [false,true])test("MDEL-01B acknowledged deletion adopts exact backend state with "+(staleListener?"stale server-get listener":"fresh listener"),async()=>{
  const h=harness({staleListener}),before=h.cloud,result=await h.api.remove("fixture-task-A");
  assert.equal(h.commits,1);assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);assert.equal(result.indeterminate,false);
  assert.equal(h.window.__recoveryInspectMode,false);assert.equal(h.window.__autosaveDisabled,false);assert.equal(h.window.__lastIndeterminateSave,undefined);assert.equal(h.diagnostics,0);
  assert.equal(h.readTransactions,2);assert.equal(h.writeTransactions,1);assert.equal(h.documentReads,0);assert.deepEqual(h.local,h.cloud);
  assert.equal(h.cloud.deletedItems.filter(entry=>entry.payload?.id==="fixture-task-A").length,1);assert.deepEqual(h.cloud.deletedItems[0].payload,before.tasksInterval[0]);assert.deepEqual(h.cloud.inventory,before.inventory);assert.deepEqual(h.cloud.tasksInterval,[before.tasksInterval[1]]);
  const listener=(await h.context.FB.docRef.get({source:"server"})).data();assert.equal(listener.syncMeta.rev,staleListener?before.syncMeta.rev:h.cloud.syncMeta.rev);
  const reloaded=harness({initial:h.cloud});assert.deepEqual(reloaded.local,h.local);assert.equal(reloaded.window.__recoveryInspectMode,false);assert.equal(reloaded.window.__autosaveDisabled,false);assert.equal(reloaded.commits,0);
});
for(const [name,options]of [["permission rejection",{reject:true}],["revision conflict",{conflict:true}]])test("MDEL-01B "+name+" does not adopt or retry",async()=>{
  const h=harness(options),before=h.local,result=await h.api.remove("fixture-task-A");assert.equal(result.saved,false);assert.equal(result.definiteFailure,true);assert.equal(h.commits,0);assert.equal(h.writeTransactions,1);assert.deepEqual(h.local,before);assert.equal(h.window.__lastIndeterminateSave,undefined);
});
for(const options of [{loseAck:true},{unknownWithoutCommit:true},{readFailure:true}])test("MDEL-01B uncertain write/readback remains suspended without retry "+JSON.stringify(options),async()=>{
  const h=harness(options),before=h.local,result=await h.api.remove("fixture-task-A");assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.equal(h.window.__recoveryInspectMode,true);assert.equal(h.window.__autosaveDisabled,true);assert.equal(h.writeTransactions,1);assert.deepEqual(h.local,before);await h.api.remove("fixture-task-A");assert.equal(h.writeTransactions,1);
});
for(const [name,options]of [
  ["local mutation after commit",{duringVerification:({context})=>vm.runInContext("lastLocalMutationAt++",context)}],
  ["loaded revision after commit",{duringVerification:({window})=>window.__loadedCloudRevisionForSaveGuard++}],
  ["local task data after commit",{duringVerification:({window})=>window.inventory[0].qty++}],
  ["workspace after commit",{duringVerification:({context})=>context.FB.app.options.projectId="different-project"}],
  ["newer remote commit",{readbackMutation:s=>s.syncMeta.rev++}],
  ["older remote revision",{readbackMutation:s=>s.syncMeta.rev=7}],
  ["different archived ID",{readbackMutation:s=>s.deletedItems[0].payload.id="other-task"}],
  ["unrelated inventory change",{readbackMutation:s=>s.inventory[1].qty++}],
  ["unrelated recovery blocker",{duringVerification:({window})=>window.__globalIdentityVerificationPending=true}],
  ["another uncertain save",{duringVerification:({window})=>window.__lastIndeterminateSave={error:"unrelated"}}],
  ["explicit read-only mode",{duringVerification:({window})=>{window.__recoveryInspectMode=true;window.__autosaveDisabled=true;}}],
  ["adoption initialization failure",{adoptionFailure:true}]
])test("MDEL-01B refuses "+name+" instead of mistaking it for expected deletion",async()=>{
  const h=harness(options),result=await h.api.remove("fixture-task-A");assert.equal(h.commits,1);assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.equal(h.window.__recoveryInspectMode,true);assert.equal(h.window.__autosaveDisabled,true);assert.equal(h.writeTransactions,1);assert.equal(h.cloud.deletedItems.length,1);
  if(name==="another uncertain save")assert.equal(h.window.__lastIndeterminateSave.error,"unrelated");
});
test("MDEL-01B independent backend reads cannot fall back to the server-get listener",async()=>{
  const h=harness();h.context.FB.db.runTransaction=null;
  const result=await h.api.remove("fixture-task-A");assert.equal(result.saved,false);assert.equal(result.indeterminate,false);assert.equal(h.documentReads,0);assert.equal(h.commits,0);assert.equal(h.writeTransactions,0);
});
