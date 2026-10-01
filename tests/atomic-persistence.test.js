"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const atomic=require("../js/atomicPersistence"),firewall=require("../js/cuttingFileContentFirewall");
const clone=value=>structuredClone(value);
function backend(initial={syncMeta:{rev:7},inventory:[{id:"keep",qtyNew:4}]}){
  let state=clone(initial),version=0,commits=0,afterQueue=null;
  const db={async runTransaction(callback){for(let retry=0;retry<4;retry++){
    const seen=version;let queued;
    await callback({get:async()=>({exists:state!==null,data:()=>clone(state)}),set(ref,value){queued=clone(value);}});
    await Promise.resolve();
    if(seen!==version)continue;
    if(afterQueue)throw afterQueue;
    state={...state,...queued};version++;commits++;return;
  }throw Object.assign(Error("contention"),{code:"aborted"});}};
  return{db,docRef:{path:"workspaces/fixture/app/state"},get state(){return clone(state);},get commits(){return commits;},error(error){afterQueue=error;}};
}
const save=(b,options={})=>atomic.save({db:b.db,docRef:b.docRef,state:{syncMeta:{rev:8},inventory:[{id:"keep",qtyNew:5}]},expectedRevision:7,scan:firewall.scanCuttingFileContent,clientId:"fixture",now:()=>100,...options});
test("expected-revision save commits once and increments revision atomically",async()=>{const b=backend(),r=await save(b);assert.equal(r.saved,true);assert.equal(b.commits,1);assert.equal(b.state.syncMeta.rev,100);assert.equal(b.state.inventory[0].qtyNew,5);});
test("stale revision rejects without any protected data change",async()=>{const b=backend(),before=b.state,r=await save(b,{expectedRevision:6});assert.equal(r.errorCode,"revision_conflict");assert.equal(r.indeterminate,false);assert.equal(b.commits,0);assert.deepEqual(b.state,before);});
test("two clients and SDK callback retries allow exactly one whole-state winner",async()=>{const b=backend();const results=await Promise.all([save(b,{clientId:"a"}),save(b,{clientId:"b",state:{syncMeta:{rev:8},inventory:[{id:"keep",qtyNew:6}]}})]);assert.equal(results.filter(r=>r.saved).length,1);assert.equal(results.filter(r=>r.errorCode==="revision_conflict").length,1);assert.equal(b.commits,1);assert.equal(b.state.inventory.length,1);});
test("missing authoritative state never seeds defaults",async()=>{const b=backend(null),r=await save(b);assert.equal(r.errorCode,"authoritative_state_missing");assert.equal(b.state,null);assert.equal(b.commits,0);});
test("protected preflight rejection leaves exact original state",async()=>{const b=backend(),before=b.state,r=await save(b,{prepare(){throw Object.assign(Error("protected drop"),{definite:true});}});assert.equal(r.saved,false);assert.equal(r.indeterminate,false);assert.deepEqual(b.state,before);});
test("firewall rejects bytes before serialization and rejects merged contamination",async()=>{const b=backend();assert.equal((await save(b,{state:{files:[new Uint8Array([1,2])]}})).errorCode,"embedded_cutting_file_content_blocked");assert.equal((await save(b,{prepare:s=>({...s,files:[{dataUrl:"data:application/dxf;base64,YQ=="}]})})).saved,false);assert.equal(b.commits,0);});
test("unknown completion after queue is indeterminate without retry",async()=>{const b=backend();b.error(Error("connection lost"));const r=await save(b);assert.equal(r.indeterminate,true);assert.equal(r.stateWriteCompleted,false);assert.equal(b.commits,0);});
test("permission failure is definite and permits safe local rollback",async()=>{const b=backend();b.error(Object.assign(Error("denied"),{code:"permission-denied"}));const r=await save(b);assert.equal(r.indeterminate,false);assert.equal(r.definiteFailure,true);});
test("invalid revisions and unavailable transactions fail closed",async()=>{const b=backend();assert.equal((await save(b,{expectedRevision:NaN})).saved,false);assert.equal((await save(b,{db:{}})).errorCode,"transaction_unavailable");});
function loadHarness(data){
  const source=fs.readFileSync("js/core.js","utf8");let writes=0,diagnostics=0,adopts=0;
  const context=vm.createContext({window:{OMAXGlobalIdentityRepair:require("../js/globalIdentityRepair")},URLSearchParams,isVercelPreviewRuntime:()=>false,PROTECTED_FIELD_REGISTRY:[],scanAuthoritativeCutFileContent:firewall.scanCuttingFileContent,estimatePayloadBytes:value=>Buffer.byteLength(JSON.stringify(value)),FIRESTORE_BLOCK_BYTES:950000,validateProtectedSavePreflight:()=>({blocked:false}),getSaveSchemaCoverageReport:()=>({}),stableStringify:require("../js/globalIdentityRepair").key,getInventoryIdentityRepairLocalState:()=>context.window.__lastLoadedCloudState,detectDangerousProtectedFieldReduction:()=>({blocked:false}),document:{getElementById:()=>null},FB:{ready:true,docRef:{path:"fixture",get:async()=>({exists:data!==null,data:()=>data})}},setCloudLoadGate:value=>{context.window.gate=value;context.window.__cloudLoadAttemptComplete=value.loadComplete;context.window.__initialAdoptComplete=value.adoptComplete;},blockCloudSave:()=>false,renderRecoveryDiagnosticsPanel:()=>diagnostics++,stateHasMeaningfulData:value=>!!value?.inventory?.length,readLocalStateBackup:()=>({inventory:[{id:"local-evidence"}]}),cloneStructured:clone,adoptState:()=>adopts++,safeCleanupLoadedState:value=>value,showLocalBackupConflictWarning(){},logMaintenanceHistoryDiagnostics(){},logCoreBusinessDiagnostics(){},console:{error(){},warn(){}},lastAppliedCloudRevision:0,writeAuthoritativeStateSnapshot:()=>writes++});
  const recovery=source.slice(source.indexOf("function enterMissingStateRecovery"),source.indexOf("function inspectBrowserStorageReadOnly"));
  const loader=source.slice(source.indexOf("function checkAuthoritativeIdentityIntegrity"),source.indexOf("async function migrateLegacyWorkspaceDoc"));
  const gate=source.slice(source.indexOf("function isRecoveryMode"),source.indexOf("function enterMissingStateRecovery"));
  const writerGate=source.slice(source.indexOf("function canWriteCloud"),source.indexOf("let CUTTING_BASELINE_WEEKLY_HOURS"));
  const identityStart=source.indexOf("function inspectInventoryIdentities"),identityEnd=source.indexOf("\n}",identityStart)+2;
  vm.runInContext(source.slice(identityStart,identityEnd)+recovery+loader+gate+writerGate+";this.load=loadFromCloud;this.canWrite=canWriteCloud",context);
  return{context,get writes(){return writes;},get diagnostics(){return diagnostics;},get adopts(){return adopts;}};
}
test("real load path with missing/empty state blocks autosave, renders diagnostics and preserves local evidence",async()=>{for(const data of [null,{}]){const h=loadHarness(data);await h.context.load();assert.equal(h.writes,0);assert.equal(h.adopts,0);assert.equal(h.context.canWrite(),false);assert.equal(h.context.window.__autosaveDisabled,true);assert.equal(h.context.window.gate.adoptComplete,false);assert.ok(h.diagnostics>0);}});
test("meaningful authoritative load enables the adoption gate",async()=>{const h=loadHarness({inventory:[{id:"cloud"}],syncMeta:{rev:7}});await h.context.load();assert.equal(h.adopts,1);assert.equal(h.context.window.__loadedCloudRevisionForSaveGuard,7);assert.equal(h.context.canWrite(),true);});

test("legacy inventory identity collisions load read-only without repairing or seeding",async()=>{const data={inventory:[{id:"same",qtyNew:2},{id:"same",qtyNew:4}],syncMeta:{rev:7}},before=JSON.stringify(data),h=loadHarness(data);await h.context.load();assert.equal(h.context.canWrite(),false);assert.equal(h.adopts,1);assert.equal(h.context.window.gate.adoptComplete,true);assert.equal(h.context.window.__loadedCloudRevisionForSaveGuard,7);assert.equal(h.writes,0);assert.equal(JSON.stringify(data),before);assert.equal(h.context.window.__inventoryIdentityIssues.length,1);assert.ok(h.diagnostics);});

test("empty/config-only documents are recovery evidence, not initialized business baselines",()=>{const source=fs.readFileSync("js/core.js","utf8"),start=source.indexOf("function stateHasMeaningfulData"),end=source.indexOf("const JOB_FILE_CACHE_KEY",start),context=vm.createContext({});vm.runInContext(source.slice(start,end)+";this.meaningful=stateHasMeaningfulData",context);for(const state of [{},{schema:72},{inventory:[],tasksInterval:[],pumpEff:{entries:[],notes:[]}},{appConfig:{dailyHours:8}}])assert.equal(context.meaningful(state),false);assert.equal(context.meaningful({pumpEff:{entries:[{dateISO:"2026-01-01",rpm:3500}]}}),true);});
