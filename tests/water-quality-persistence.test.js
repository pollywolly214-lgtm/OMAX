"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const atomic=require("../js/atomicPersistence"),firewall=require("../js/cuttingFileContentFirewall"),identity=require("../js/globalIdentityRepair"),water=require("../js/waterQuality");
const core=fs.readFileSync("js/core.js","utf8"),clone=structuredClone;
function fn(name){const start=core.search(new RegExp(`^(?:async )?function ${name}\\(`,"m"));assert.ok(start>=0,name);return core.slice(start,core.indexOf("\n}",start)+2);}
function constant(name){const start=core.indexOf(`const ${name} =`);assert.ok(start>=0,name);return core.slice(start,core.indexOf(";",start)+1);}
const record=(id="new-check")=>({id,date:"2026-10-20",time:"08:15",ppm:125.5,softness:"Pass",initials:"RY",note:"Retain this note"});
function fixture(){return{schema:72,syncMeta:{rev:7,updatedBy:"computer-a"},waterQualityChecks:[{...record("historical"),date:"2026-10-19",custom:{keep:true}}],inventory:[{id:"stock",qtyNew:8}],tasksInterval:[],tasksAsReq:[],cuttingJobs:[],completedCuttingJobs:[],maintenanceTasksV2:[],maintenanceCalendarInstancesV2:[],maintenanceOccurrencesV2:[],totalHistory:[],dailyCutHours:[],deletedItems:[],appConfig:{dailyHours:8},jobFolders:[],pumpEff:{entries:[]},unknownBusiness:{keep:[1,2,3]}};}
function backend(options={}){
 let state=clone(options.initial||fixture()),commits=0,reads=0;const masks=[];
 const db={async runTransaction(callback){let pending,mask;
  const isWrite=reads>0&&options.writeExpected;
  if(isWrite)options.beforeTransaction?.(state);
  const result=await callback({get:async()=>({exists:true,data:()=>clone(state)}),set:(_ref,next,setOptions)=>{pending=clone(next);mask=clone(setOptions);}});
  if(pending){
   if(options.reject)throw Object.assign(Error("Firebase permission denied"),{code:"permission-denied"});
   for(const field of mask.mergeFields)state[field]=clone(pending[field]);commits++;masks.push(mask);
   if(options.lostAck)throw Error("Firebase acknowledgement lost");
  }else{reads++;if(commits&&options.readFailure)throw Error("Firebase backend read unavailable");if(commits)options.readback?.(result);options.afterRead?.(result,reads);}
  return result;
 }};
 return{db,options,get state(){return clone(state);},set state(next){state=clone(next);},get commits(){return commits;},get reads(){return reads;},masks};
}
const bindings=["totalHistory","tasksInterval","tasksAsReq","inventory","cuttingJobs","completedCuttingJobs","orderRequests","garnetCleanings","dailyCutHours","opportunityRollups","weeklyCostReports","receiptTrackerWeeks","maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2","deletedItems","appConfig","jobFolders","orderRequestTab"];
function client(b,id="computer-b",flags={}){
 const storage={getItem:key=>key==="cloud_sync_client_id_v1"?id:null,setItem(){if(flags.storageWriteFailure)throw Error("QuotaExceededError");}};
 const window={OMAXWaterQuality:water,OMAXGlobalIdentityRepair:identity,OMAXAtomicPersistence:atomic,CuttingFileContentFirewall:firewall,location:{hostname:"localhost",search:""},addEventListener(){},localStorage:storage};
 if(flags.storageGetterFailure)Object.defineProperty(window,"localStorage",{get(){throw Error("SecurityError");}});
 if(flags.storageWriteFailure)storage.getItem=()=>null;
 for(const name of bindings)window[name]=[];
 const c=vm.createContext({window,Date,TextEncoder,Blob,structuredClone,URLSearchParams,console:{warn(){},error(){},info(){}},FB:{ready:true,user:{uid:"same-authorized-uid"},db:b.db,docRef:{path:"workspaces/fixture/app/state"}},
  WORKSPACE_ID:"fixture",FIRESTORE_BLOCK_BYTES:975000,FIRESTORE_WARN_BYTES:800000,FIRESTORE_STRONG_WARN_BYTES:900000,
  isVercelPreviewRuntime:()=>false,renderRecoveryDiagnosticsPanel(){},showLocalBackupConflictWarning(){},syncRenderTotalsFromHistory(){},resetHistoryToCurrent(){},
  setCloudLoadGate:v=>{window.__cloudLoadAttemptComplete=v.loadComplete;window.__initialAdoptComplete=v.adoptComplete;},
  getSaveSchemaCoverageReport:()=>({cloudExcludedProtectedPaths:[]}),classifyMissingProtectedPathsForSave:()=>({blocking:[],warnings:[]}),
  mergeTotalHistoryForSave:()=>assert.fail("An unchanged unrelated field must not be normalized"),mergeDailyCutHoursForSave:()=>assert.fail("No unrelated daily-hours merge"),mergePumpEffForSave:()=>assert.fail("No unrelated pump merge"),
  persistLocalStateBackup:()=>{if(flags.backupFailure)throw Error("Local backup unavailable");},document:{getElementById:()=>null}});
 const names=["cloneStructured","estimatePayloadBytes","countObjectKeys","countTaskNestedMapEntries","countTaskNestedArrayEntries","countJobManualLogs","getValueAtPath","getDataSafetyShape","countCollectionValue","countNestedProtectedValues","stableStringifyForIntegrity","hashIntegrityString","fingerprintProtectedValue","countProtectedField","validateProtectedFieldShape","getProtectedFieldRegistryCoverage","buildProtectedFieldIntegritySummary","buildDataIntegritySummary","hasAnyProtectedData","hasAnyProtectedFieldPresence","isDangerousShapeChange","chooseProtectedSaveBaseline","detectDangerousIntegrityReduction","validateProtectedSavePreflight","buildProtectedFieldSummary","compareProtectedFieldSummaries","detectDangerousProtectedFieldReduction","isRecoveryMode","canWriteCloud","blockCloudSave","scanAuthoritativeCutFileContent","reportCloudSaveSecondaryError","validateCuttingJobDeletionSave","validateCuttingJobHistoryRestoreSave","cuttingJobDeletionSafetyBaseline","writeAuthoritativeStateSnapshot","getInventoryIdentityRepairLocalState","buildWindowProtectedStateForCoverage","inspectInventoryIdentities","adoptAuthoritativeRecoveryState","checkAuthoritativeIdentityIntegrity","adoptIdentityCheckedAuthoritativeState","stateHasMeaningfulData","readInventoryMaterialAuthoritativeState","captureCuttingJobSaveTarget","cuttingJobSaveTargetIsCurrent","getCloudSyncClientId","readLocalStateBackup","saveWaterQualityCheck","stableStringify","cloudSaveNoWriteFailure","saveCloudDebounced","saveCloudNow"];
 const constants=["PROTECTED_STATE_FIELDS","REQUIRED_PROTECTED_DATA_PATHS","PROTECTED_FIELD_REGISTRY","DATA_SAFETY_PREFLIGHT_COUNT_DROP_RATIO","DATA_SAFETY_PREFLIGHT_MIN_BASELINE_COUNT","DATA_SAFETY_PREFLIGHT_TOTAL_DROP_RATIO","DATA_SAFETY_PREFLIGHT_SIZE_DROP_RATIO","CLOUD_SYNC_CLIENT_KEY","LOCAL_STATE_BACKUP_KEY"];
 vm.runInContext(bindings.map(name=>`let ${name}=window.${name};`).join("\n")+"\nlet lastAppliedCloudRevision=0,lastLocalMutationAt=0,hasPendingLocalChanges=false,cloudSaveQueue=Promise.resolve();const inventoryIdentityRepairAuthorizations=new Map();\n"+constants.map(constant).join("\n")+"\n"+names.map(fn).join("\n"),c);
 c.adoptState=(value,options)=>{assert.equal(options.preserveAuthoritative,true);c.adoptAuthoritativeRecoveryState(value);};
 const adopt=()=>{const result=c.adoptIdentityCheckedAuthoritativeState(b.state);assert.equal(result.recovery,false,JSON.stringify(result));return result;};adopt();
 return{c,window,adopt,save:async request=>{b.options.writeExpected=true;try{return await c.saveWaterQualityCheck(request||{record:record()});}finally{b.options.writeExpected=false;}}};
}

test("normal water-quality save uses the guarded backend transaction, exact readback, and reload",async()=>{
 const b=backend(),h=client(b),before=b.state,r=await h.save();assert.equal(r.saved,true,r.error);assert.equal(r.verified,true);assert.equal(b.commits,1);assert.equal(b.reads,2);assert.deepEqual(b.masks,[{mergeFields:["waterQualityChecks","syncMeta"]}]);
 const saved=b.state.waterQualityChecks[0];for(const name of water.fields)assert.equal(saved[name],record()[name]);assert.equal(saved.createdBy,"same-authorized-uid");assert.equal(b.state.syncMeta.updatedBy,"computer-b");
 assert.deepEqual(b.state.waterQualityChecks.slice(1),before.waterQualityChecks);
 for(const name of Object.keys(before).filter(name=>!["waterQualityChecks","syncMeta"].includes(name)))assert.deepEqual(b.state[name],before[name],name);
 assert.deepEqual(clone(client(b,"fresh-device").window.waterQualityChecks),b.state.waterQualityChecks);
});
test("independent second-client IDs can append after adopting the other's verified revision",async()=>{
 const b=backend(),a=client(b,"computer-a"),h=client(b,"computer-b");assert.equal((await a.save({record:record("a")})).verified,true);h.adopt();assert.equal((await h.save({record:record("b")})).verified,true);assert.equal(b.commits,2);assert.equal(b.state.waterQualityChecks.length,3);assert.equal(b.state.syncMeta.updatedBy,"computer-b");
});
test("an identical submission after refresh or from another device retains its ID and cannot duplicate history",async()=>{
 const b=backend(),values=record(),request={record:{...values,id:water.submissionId(values)}};
 assert.equal((await client(b).save(request)).verified,true);
 const retry={record:{...values,id:water.submissionId({...values,id:"another-session"})}};
 assert.equal((await client(b,"new-browser").save(retry)).noOp,true);assert.equal(b.commits,1);assert.equal(b.state.waterQualityChecks.length,2);
});
for(const flags of [{storageWriteFailure:true},{storageGetterFailure:true},{backupFailure:true}])test("genuine optional browser-storage failure does not replace or invalidate backend persistence: "+JSON.stringify(flags),async()=>{
 const b=backend(),h=client(b,"computer-b",flags),r=await h.save();assert.equal(r.saved,true,r.error);assert.equal(r.verified,true);assert.equal(b.commits,1);
});
test("legacy storage read/parse failures preserve evidence and return an accurate separate warning",()=>{
 for(const read of [()=>{throw Error("SecurityError");},()=>"not JSON",()=>"{}"]){const result=water.readLegacy(read);assert.deepEqual(result.records,[]);assert.match(result.warning,/Browser-only.*left untouched/);}
});
test("Firebase rejection reports backend failure, changes no history, and retry keeps one record",async()=>{
 const options={reject:true},b=backend(options),h=client(b),before=b.state,request={record:record()};const r=await h.save(request);assert.equal(r.saved,false);assert.match(r.error,/Firebase permission denied/);assert.equal(r.indeterminate,undefined);assert.equal(b.commits,0);assert.deepEqual(b.state,before);
 options.reject=false;assert.equal((await h.save(request)).verified,true);assert.equal((await h.save(request)).noOp,true);assert.equal(b.commits,1);assert.equal(b.state.waterQualityChecks.filter(row=>row.id===request.record.id).length,1);
});
test("stale loaded revision and a revision race inside CAS both remain blocked",async()=>{
 for(const race of [false,true]){const options={},b=backend(options),h=client(b),before=b.state;if(race)options.beforeTransaction=state=>{state.syncMeta.rev++;};else{const next=b.state;next.syncMeta.rev++;b.state=next;}const r=await h.save();assert.equal(r.saved,false);assert.match(r.error,/baseline changed|Revision conflict/);assert.equal(b.commits,0);assert.deepEqual(b.state.waterQualityChecks,before.waterQualityChecks);}
});
for(const mode of ["lostAck","readFailure","readback"])test("uncertain/failed verification is never success or blindly retried: "+mode,async()=>{
 const options=mode==="readback"?{readback:state=>{state.waterQualityChecks[0].ppm++;}}:{[mode]:true};const b=backend(options),h=client(b),before=clone(h.window.waterQualityChecks),request={record:record()};const r=await h.save(request);assert.equal(r.saved,false);assert.equal(r.verified,false);assert.equal(r.indeterminate,true);assert.equal(h.window.__recoveryInspectMode,true);assert.deepEqual(clone(h.window.waterQualityChecks),before);assert.equal((await h.save(request)).saved,false);assert.equal(b.commits,1);
});
test("readable legacy history is appended only on explicit save, retains IDs and survives edits/retries",async()=>{
 const b=backend(),h=client(b),legacy=[record("old-local")],before=clone(legacy);assert.equal(b.state.waterQualityChecks.length,1);
 assert.equal((await h.save({record:record(),legacy})).verified,true);const promoted=b.state.waterQualityChecks.find(row=>row.id==="old-local");assert.deepEqual(promoted.legacySource,legacy[0]);
 const changed={...record("old-local"),ppm:50,softness:"Fail",initials:"AB"};assert.equal((await h.save({record:changed,expected:legacy[0],legacy})).verified,true);
 const edited=b.state.waterQualityChecks.find(row=>row.id==="old-local");assert.equal(edited.editHistory[0].before.ppm,125.5);assert.equal(edited.editHistory[0].actorUid,"same-authorized-uid");assert.equal(edited.initials,"AB");
 assert.equal((await h.save({record:record(),legacy})).noOp,true);assert.equal(b.state.waterQualityChecks.length,3);assert.deepEqual(legacy,before);
});
test("conflicting legacy IDs and stale editing previews cannot overwrite historical records",async()=>{
 const b=backend(),h=client(b),before=b.state;for(const request of [{record:record(),legacy:[{...record("historical"),ppm:1}]},{record:{...record("historical"),ppm:1},expected:{...record("historical"),ppm:2}}]){assert.equal((await h.save(request)).saved,false);assert.equal(b.commits,0);assert.deepEqual(b.state,before);}
});
test("real local protected-data drift, closed recovery gate, and protected preflight rejection remain blocked",async()=>{
 for(const mode of ["drift","recovery","preflight"]){const b=backend(),h=client(b),before=b.state;if(mode==="drift")h.window.inventory[0].qtyNew++;if(mode==="recovery")h.window.__recoveryInspectMode=true;if(mode==="preflight")h.c.validateProtectedSavePreflight=()=>({blocked:true});assert.equal((await h.save()).saved,false);assert.equal(b.commits,0);assert.deepEqual(b.state,before);}
});
for(const phase of [1,2])test("concurrent unrelated edits remain pending and cannot be overwritten during water-quality read "+phase,async()=>{
 const options={},b=backend(options),h=client(b),before=clone(h.window.waterQualityChecks);
 options.afterRead=(_state,read)=>{if(read===phase)h.c.saveCloudDebounced();};
 const r=await h.save();assert.equal(r.saved,false);assert.equal(b.commits,phase===1?0:1);assert.equal(vm.runInContext("hasPendingLocalChanges",h.c),true);assert.deepEqual(clone(h.window.waterQualityChecks),before);
 if(phase===2)assert.equal(r.indeterminate,true);
});
test("invalid input cannot save or change the caller's entered values",async()=>{
 for(const change of [{date:"2026-02-30"},{time:"25:00"},{ppm:NaN},{softness:""},{initials:" "}]){const b=backend(),h=client(b),request={record:{...record(),...change}},before=clone(request);assert.equal((await h.save(request)).saved,false);assert.deepEqual(request,before);assert.equal(b.commits,0);}
});
