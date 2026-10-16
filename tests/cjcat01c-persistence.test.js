"use strict";
const test=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs"), vm=require("node:vm");
const planner=require("../js/cuttingJobCategoryEdit"), materials=require("../js/inventoryMaterialMutations"), atomic=require("../js/atomicPersistence"), firewall=require("../js/cuttingFileContentFirewall");
const identities=require("../js/globalIdentityRepair"), {fixture}=require("./fixtures/global-identity");
const core=fs.readFileSync("js/core.js","utf8"), renderers=fs.readFileSync("js/renderers.js","utf8"), views=fs.readFileSync("js/views.js","utf8"), clone=structuredClone;
function fn(source,name){const start=source.search(new RegExp("^(?:async )?function "+name+"\\(","m"));assert.ok(start>=0,name);return source.slice(start,source.indexOf("\n}",start)+2);}
function constant(name){const start=core.indexOf("const "+name+" =");assert.ok(start>=0,name);return core.slice(start,core.indexOf(";",start)+1);}
const bindings=["totalHistory","tasksInterval","tasksAsReq","inventory","cuttingJobs","completedCuttingJobs","orderRequests","garnetCleanings","dailyCutHours","opportunityRollups","weeklyCostReports","receiptTrackerWeeks","maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2","deletedItems","appConfig","jobFolders","orderRequestTab"];
function model(){return {activeType:"steel",customMaterialEvidence:{retain:"exact"},types:[{id:"steel",name:"Steel",custom:"retain"},{id:"aluminum",name:"Aluminum"}],sheets:Object.fromEntries(["steel","aluminum"].map(id=>[id,{columns:["QTY 4x8","QTY 4x10"],custom:"retain",rows:[{thickness:"0.0625",values:["2","3"]},{thickness:"0.09375",values:["4","5"],custom:"row evidence"},{thickness:"0.125",values:["6","7"]}]}]))};}
function harness(options={}){
  let cloud=identities.repairedState(fixture(),identities.preview(fixture()));
  cloud.inventoryMaterials=model();cloud.syncMeta={rev:7,updatedBy:"fixture-client"};cloud.inventoryTransactions=[{id:"transaction",qty:4}];
  if(options.baselineSyncMeta)cloud.syncMeta=clone(options.baselineSyncMeta);
  cloud.unknownFutureState={retain:[{id:"future-record",payload:"exact"}]};
  cloud.jobFolders=[{id:"jobs_root",name:"All Jobs",parent:null},{id:"blanco",name:"1254 Blanco",projectNumber:"1254",parent:"jobs_root",color:"#336699"},{id:"mesquite",name:"1242 Mesquite",projectNumber:"1242",parent:"jobs_root"}];
  const job=(id)=>({id,cat:"blanco",projectNumber:"1254",name:"Individual description "+id,cutNumber:id,files:[{id:"attachment-"+id,name:"part.dxf",fileId:"file-"+id,relativePath:"test/part.dxf",source:"wj_cuts_reference"}],materialCost:25,manualLogs:[{dateISO:"2026-10-12",completedHours:2}],cutChronologyHistory:[{jobId:id,operationId:"old-"+id}],startISO:"2026-10-10",completedAtISO:"2026-10-12"});
  cloud.cuttingJobs=[job("active-a"),job("active-b")];cloud.completedCuttingJobs=[job("history-a"),job("history-b"),{...job("unrelated"),cat:"mesquite",projectNumber:"1242"}];
  options.initialStateMutation?.(cloud);
  const listenerState=clone(cloud);
  let reads=0,transactions=0,readTransactions=0,commits=0,diagnostics=0, queued, writeOptions,writing=false;
  const events={};const window={...clone(cloud),CuttingJobCategoryEdit:planner,CuttingJobHistory:require("../js/cuttingJobHistory"),OMAXInventoryMaterialMutations:materials,OMAXAtomicPersistence:atomic,OMAXGlobalIdentityRepair:identities,CuttingFileContentFirewall:firewall,
    __cloudLoadAttemptComplete:true,__initialAdoptComplete:true,__loadedCloudRevisionForSaveGuard:cloud.syncMeta.rev,addEventListener:(name,handler)=>{events[name]=handler;},location:{hostname:"localhost",search:""}};
  const serverSnapshot=async(fromListener)=>{
    reads++;await options.duringRead?.(reads,window,cloud);
    if(commits>0&&options.readFailure)throw Error("Server unavailable");
    const data=clone(fromListener&&options.staleListenerView ? listenerState : cloud);
    
    if(commits>0)options.readbackMutation?.(data);
    return{exists:true,data:()=>data};
  };
  const db={async runTransaction(callback){
    if(!writing){
      readTransactions++;
      return callback({get:()=>serverSnapshot(false),set:()=>{throw Error("A verification read must not write state");},update:()=>{throw Error("A verification read must not update state");},delete:()=>{throw Error("A verification read must not delete state");}});
    }
    transactions++;await options.beforeTransaction?.(window,cloud);const transaction={get:async()=>({exists:true,data:()=>clone(cloud)}),set:(_ref,value,setOptions)=>{writeOptions=clone(setOptions);queued=clone(value);}};
    const result=await callback(transaction);if(options.retry)await callback(transaction);
    await options.afterQueue?.(window,cloud);
    if(options.reject)throw Object.assign(Error("Permission denied"),{code:"permission-denied"});
    if(options.unknownWithoutCommit)throw Error("Acknowledgement lost");
    if(writeOptions.mergeFields){for(const field of writeOptions.mergeFields)cloud[field]=clone(queued[field]);}
    else if(writeOptions.merge){
      const merge=(before,next)=>{const result={...before};for(const [name,value]of Object.entries(next))result[name]=value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).length?merge(before?.[name]||{},value):clone(value);return result;};
      cloud=merge(cloud,queued);
    }else cloud=clone(queued);
    commits++;if(options.loseAck)throw Error("Acknowledgement lost after commit");return result;
  }};
  const c=vm.createContext({window,URLSearchParams,TextEncoder,structuredClone,Blob,Map,WeakSet,setTimeout,clearTimeout,
    console:{warn(){},error(){},info(){}},document:{getElementById:()=>null,querySelectorAll:()=>[]},WORKSPACE_ID:"fixture",
    FB:{ready:true,user:{uid:"fixture"},db,docRef:{path:"fixture/app/state",get:async readOptions=>{assert.equal(readOptions.source,"server");return serverSnapshot(true);}}},
    FIRESTORE_BLOCK_BYTES:950000,getCloudSyncClientId:()=>"fixture-client",readLocalStateBackup:()=>null,
    getSaveSchemaCoverageReport:()=>({cloudExcludedProtectedPaths:[]}),classifyMissingProtectedPathsForSave:()=>({blocking:[],warnings:[]}),
    renderRecoveryDiagnosticsPanel:()=>diagnostics++,showLocalBackupConflictWarning(){},syncRenderTotalsFromHistory(){},resetHistoryToCurrent(){},
    setCloudLoadGate:value=>{window.__cloudLoadAttemptComplete=value.loadComplete;window.__initialAdoptComplete=value.adoptComplete;},
    mergeTotalHistoryForSave:()=>{throw Error("Unchanged history must be preserved verbatim");},mergeDailyCutHoursForSave:()=>{throw Error("Unchanged daily data must be preserved verbatim");},mergePumpEffForSave:()=>{throw Error("Unchanged pump data must be preserved verbatim");},
    persistLocalStateBackup:()=>{},isVercelPreviewRuntime:()=>Boolean(options.preview),toast(){}});
  const constants=["PROTECTED_STATE_FIELDS","REQUIRED_PROTECTED_DATA_PATHS","PROTECTED_FIELD_REGISTRY","DATA_SAFETY_PREFLIGHT_COUNT_DROP_RATIO","DATA_SAFETY_PREFLIGHT_MIN_BASELINE_COUNT","DATA_SAFETY_PREFLIGHT_TOTAL_DROP_RATIO","DATA_SAFETY_PREFLIGHT_SIZE_DROP_RATIO"];
  const functions=["cloneStructured","stateHasMeaningfulData","stableStringify","estimatePayloadBytes","countObjectKeys","countTaskNestedMapEntries","countTaskNestedArrayEntries","countJobManualLogs","getValueAtPath","getDataSafetyShape","countCollectionValue","countNestedProtectedValues","stableStringifyForIntegrity","hashIntegrityString","fingerprintProtectedValue","countProtectedField","validateProtectedFieldShape","getProtectedFieldRegistryCoverage","buildProtectedFieldIntegritySummary","buildDataIntegritySummary","hasAnyProtectedData","hasAnyProtectedFieldPresence","isDangerousShapeChange","chooseProtectedSaveBaseline","detectDangerousIntegrityReduction","validateProtectedSavePreflight","buildProtectedFieldSummary","compareProtectedFieldSummaries","detectDangerousProtectedFieldReduction","isRecoveryMode","canWriteCloud","blockCloudSave","scanAuthoritativeCutFileContent","reportCloudSaveSecondaryError","validateCuttingJobHistoryRestoreSave","validateCuttingJobDeletionSave","cuttingJobDeletionSafetyBaseline","writeAuthoritativeStateSnapshot","readCurrentCloudStateReadOnly","getInventoryIdentityRepairLocalState","buildWindowProtectedStateForCoverage","inspectInventoryIdentities","adoptAuthoritativeRecoveryState","adoptState","checkAuthoritativeIdentityIntegrity","adoptIdentityCheckedAuthoritativeState","loadFromCloud","cloudSaveNoWriteFailure","saveCloudDebounced","saveCloudNow"];
  functions.push("readInventoryMaterialAuthoritativeState","captureCuttingJobSaveTarget","cuttingJobSaveTargetIsCurrent","saveCuttingJobCategoryChange","refreshCuttingJobVerificationNotice");
  vm.runInContext(bindings.map(name=>"let "+name+"=window."+name+";").join("\n")+"\nlet lastAppliedCloudRevision=7,lastLocalMutationAt=0,hasPendingLocalChanges=false,cloudSaveQueue=Promise.resolve();const inventoryIdentityRepairAuthorizations=new Map(),cuttingJobDeletionProofs=new WeakSet(),cuttingJobDeletionTransactions=new WeakSet(),cuttingJobHistoryRestoreProofs=new WeakSet(),cuttingJobHistoryRestoreTransactions=new WeakSet();\n"+constants.map(constant).join("\n")+"\n"+functions.map(name=>fn(core,name)).join("\n"),c);
  const adoption=c.adoptIdentityCheckedAuthoritativeState(clone(cloud));assert.equal(adoption.recovery,Boolean(options.preview),JSON.stringify({adoption,reason:window.__recoveryReason,issues:window.__globalIdentityIssues}));
  const guardedWriter=c.writeAuthoritativeStateSnapshot;
  c.writeAuthoritativeStateSnapshot=async(...args)=>{writing=true;try{return await guardedWriter(...args);}finally{writing=false;}};
  const realRead=c.readInventoryMaterialAuthoritativeState,readbacks=[];
  c.readInventoryMaterialAuthoritativeState=async()=>{const readback=await realRead();readbacks.push(clone(readback));return options.readContract ? options.readContract(readback,readbacks.length) : readback;};
  if(options.blockProtected)c.validateProtectedSavePreflight=()=>({blocked:true});
  if(options.recovery)window.__recoveryInspectMode=true;
  if(options.autosaveDisabled)window.__autosaveDisabled=true;
  if(options.pending)vm.runInContext("hasPendingLocalChanges=true",c);
  if(options.loadedRevision!==undefined)window.__loadedCloudRevisionForSaveGuard=options.loadedRevision;
  return {api:c.saveCuttingJobCategoryChange,window,c,events,get readTransactions(){return readTransactions;},get readbacks(){return clone(readbacks);},get writeOptions(){return clone(writeOptions);},get cloud(){return clone(cloud);},get local(){return clone(c.getInventoryIdentityRepairLocalState());},get commits(){return commits;},get transactions(){return transactions;},get reads(){return reads;},get diagnostics(){return diagnostics;},editCloud:change=>change(cloud),reload:()=>c.loadFromCloud(),bump:()=>vm.runInContext("lastLocalMutationAt++",c)};
}
// The Firebase interface below is disposable and in memory. The coordinator,
// guarded writer, CAS, authoritative transaction reader and adoption are production code.
const request=(changes={})=>({categoryId:"blanco",projectNumber:"1261",name:"Forming",expectedOldName:"1254 Blanco",expectedOldProjectNumber:"1254",expectedActiveCount:2,expectedCompletedCount:2,...changes});
for(const changes of [{projectNumber:"1254",name:"New Blanco"},{projectNumber:"1261",name:"Blanco"},{projectNumber:"1261",name:"Forming"}])test("verified category mutation, exact field retention and authoritative reload: "+JSON.stringify(changes),async()=>{
 const h=harness(),before=h.local,result=await h.api(request(changes));
 assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);assert.equal(h.commits,1);assert.equal(h.transactions,1);
 assert.deepEqual(h.writeOptions.mergeFields,["jobFolders","cuttingJobs","completedCuttingJobs","syncMeta"]);
 for(const field of ["cuttingJobs","completedCuttingJobs"]){
   for(const old of before[field]){
     const updated=h.cloud[field].find(job=>job.id===old.id);
     assert.deepEqual(updated,old.cat==="blanco"?{...old,projectNumber:changes.projectNumber}:old);
   }
 }
 const category=h.cloud.jobFolders.find(row=>row.id==="blanco");
 assert.deepEqual(category,{...before.jobFolders.find(row=>row.id==="blanco"),name:changes.projectNumber+" "+changes.name,projectNumber:changes.projectNumber});
 for(const field of Object.keys(before).filter(field=>!["jobFolders","cuttingJobs","completedCuttingJobs","syncMeta"].includes(field)))assert.deepEqual(h.cloud[field],before[field],field);
 assert.deepEqual(h.local,h.cloud);
 await h.reload();assert.deepEqual(h.local,h.cloud);assert.equal(h.readTransactions,2);assert.ok(h.reads>=3);
});
test("duplicate ownership, changed preview counts and changed category baseline never write",async()=>{
 for(const changes of [{projectNumber:"1242"},{expectedActiveCount:14},{expectedCompletedCount:0},{expectedOldName:"Stale"},{expectedOldProjectNumber:"9999"}]){
   const h=harness(),before=h.cloud,result=await h.api(request(changes));
   assert.equal(result.saved,false);assert.equal(h.transactions,0);assert.deepEqual(h.cloud,before);
 }
});
test("definite rejection preserves local data and permits a corrected retry",async()=>{
 const options={reject:true},h=harness(options),before=h.local,result=await h.api(request());
 assert.equal(result.saved,false);assert.notEqual(result.indeterminate,true);assert.deepEqual(h.local,before);assert.deepEqual(h.cloud,before);
 assert.equal(h.window.__categoryMutationPending,false);options.reject=false;
 assert.equal((await h.api(request())).verified,true);assert.equal(h.commits,1);
});
for(const options of [{loseAck:true},{unknownWithoutCommit:true},{readFailure:true},{readbackMutation:state=>{state.cuttingJobs[0].name="Unexpected server change";}}])test("uncertain commit or readback suspends saves and prohibits blind retry: "+Object.keys(options),async()=>{
 const h=harness(options),before=h.local,result=await h.api(request());
 assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.deepEqual(h.local,before);
 assert.equal(h.window.__autosaveDisabled,true);assert.equal(h.window.__recoveryInspectMode,true);assert.equal(h.window.__cuttingJobDisplayUnconfirmed,true);
 const writes=h.transactions;assert.equal((await h.api(request())).saved,false);assert.equal(h.transactions,writes);
 assert.equal(h.window.__categoryMutationPending,false);
});
test("revision/CAS and local evidence changes reject mutation without overwrite",async()=>{
 const h=harness({beforeTransaction:(_window,cloud)=>{cloud.syncMeta.rev++;}}),before=h.local,result=await h.api(request());
 assert.equal(result.saved,false);assert.equal(h.commits,0);assert.deepEqual(h.local,before);
 const dirty=harness({pending:true});assert.equal((await dirty.api(request())).saved,false);assert.equal(dirty.transactions,0);
});
