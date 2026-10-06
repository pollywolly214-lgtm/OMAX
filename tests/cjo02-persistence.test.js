"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const chronology=require("../js/cuttingJobChronology"),atomic=require("../js/atomicPersistence"),firewall=require("../js/cuttingFileContentFirewall");
const core=fs.readFileSync("js/core.js","utf8");
const clone=value=>structuredClone(value);
const base=()=>({
  schema:72,syncMeta:{rev:7,updatedAtISO:"2026-01-01T00:00:00.000Z"},
  cuttingJobs:[{id:"mon",cutDateISO:"2026-10-05",cutOrderWithinDay:1,cutNumber:"C001",files:[],manualLogs:[]}],
  completedCuttingJobs:[
    {id:"tue",cutDateISO:"2026-10-06",cutOrderWithinDay:1,cutNumber:"C002",cat:"project",projectNumber:"0000",costRate:45,chargeRate:200,actualHours:1,
      completedAtISO:"2026-10-07T01:00:00.000Z",import_event_id:"source",importProvenance:{import_event_id:"source",source_file:"history.csv",completed_date:"2026-10-06"},
      files:[{id:"file",source:"wj_cuts_reference",relativePath:"WJ Cuts/C012.dxf"}],
      manualLogs:[{dateISO:"2026-10-06",completedHours:1,import_event_id:"source"}]},
    {id:"wed",cutDateISO:"2026-10-07",cutOrderWithinDay:1,cutNumber:"C003",files:[],manualLogs:[]}
  ],
  inventory:[{id:"keep",qtyNew:4}],dailyCutHours:[{dateISO:"2026-10-05",hours:2}],
  totalHistory:[{dateISO:"2026-10-05",hours:100}],pumpEff:{entries:[]},
  jobFolders:[{id:"project",name:"Project"}],costHistory:[{id:"cost",jobId:"tue",amount:45}],
  cuttingJobDatabase:{legacy:"retain"},deletedItems:[],recoveryMetadata:{source:"retain"}
});
const correction=[{id:"tue",cutDateISO:"2026-10-04"}];
function backend(source,flags){
  let state=clone(source),version=0,commits=0,queues=0;
  const payloads=[];
  const db={async runTransaction(callback){
    for(let retry=0;retry<4;retry++){
      const seen=version;let pending;
      await callback({
        get:async()=>({exists:state!==null,data:()=>clone(state)}),
        set(ref,value){queues++;pending=JSON.parse(JSON.stringify(value));payloads.push(clone(pending));}
      });
      await Promise.resolve();
      if(seen!==version)continue;
      if(flags.writeError)throw flags.writeError;
      state=pending;version++;commits++;
      if(flags.afterCommitError)throw flags.afterCommitError;
      return;
    }
    throw Object.assign(Error("contention"),{code:"aborted"});
  }};
  return {db,docRef:{path:"workspaces/fixture/app/state"},get state(){return clone(state);},get commits(){return commits;},get queues(){return queues;},payloads,replace(value){state=clone(value);version++;}};
}
function harness(flags={}){
  const source=base(),before=clone(source),remote=backend(source,flags);
  const calls={reads:0,writes:0,adoptions:0,suspensions:0,preflights:0,merges:0};
  let localVersion=0,allowed=true,live=clone(source);
  const context=vm.createContext({
    window:{OMAXAtomicPersistence:atomic,CuttingFileContentFirewall:firewall,__lastLoadedCloudState:clone(source),__loadedCloudRevisionForSaveGuard:7},
    inventoryIdentityRepairAuthorizations:new Map(),FB:{ready:true,user:{uid:"fixture"},db:remote.db,docRef:remote.docRef},
    canWriteCloud:()=>allowed,getCloudSyncClientId:()=>"fixture",scanAuthoritativeCutFileContent:firewall.scanCuttingFileContent,
    validateProtectedSavePreflight:()=>{calls.preflights++;return{blocked:flags.preflightBlocked===true};},
    detectDangerousProtectedFieldReduction:()=>({blocked:false}),readLocalStateBackup:()=>null,
    buildWindowProtectedStateForCoverage:()=>clone(live),getSaveSchemaCoverageReport:()=>({}),
    mergeTotalHistoryForSave:value=>{calls.merges++;return flags.changeProtectedMerge?[...value,{dateISO:"2026-10-06",hours:200}]:value;},
    mergeDailyCutHoursForSave:value=>value,mergePumpEffForSave:value=>value,
    estimatePayloadBytes:value=>Buffer.byteLength(JSON.stringify(value)),FIRESTORE_BLOCK_BYTES:975000,
    enterMissingStateRecovery:()=>{allowed=false;},renderRecoveryDiagnosticsPanel:()=>{}
  });
  const start=core.indexOf("async function writeAuthoritativeStateSnapshot"),end=core.indexOf("// Foundation adapter only.",start);
  assert.ok(start>=0&&end>start);
  for(const name of ["validateCuttingJobDeletionSave","validateCuttingJobHistoryRestoreSave","cuttingJobDeletionSafetyBaseline","reportCloudSaveSecondaryError"]){const a=core.indexOf("function "+name+"("),b=core.indexOf("\n}",a);assert.ok(a>=0&&b>a,name);vm.runInContext(core.slice(a,b+2),context);}
  vm.runInContext(core.slice(start,end)+";this.write=writeAuthoritativeStateSnapshot",context);
  const env={
    canWrite:()=>allowed,localVersion:()=>({version:localVersion,jobs:live.cuttingJobs}),
    baselineMatches:cloud=>JSON.stringify(cloud)===JSON.stringify(before),
    readState:async()=>{
      calls.reads++;
      if(calls.reads===1&&flags.beforeRead)flags.beforeRead({remote,mutate:()=>localVersion++});
      if(calls.reads>1&&flags.readBackError)throw Error("read-back unavailable");
      if(calls.reads>1&&flags.readBackMismatch){const cloud=remote.state;cloud.completedCuttingJobs[0].cutNumber="C999";return cloud;}
      return remote.state;
    },
    writeState:async(next,revision,validate)=>{
      calls.writes++;
      if(flags.localDuringWrite){localVersion++;live.cuttingJobs[0].notes="concurrent edit";}
      if(flags.throwWrite)throw Error("unknown thrown write");
      if(flags.falseAcknowledgement)return flags.falseAcknowledgement;
      const result=await context.write(next,{merge:true},{expectedRevision:revision,validatePreparedState:validate});
      if(flags.localAfterWrite){live.cuttingJobs[0].notes="concurrent edit without a save";localVersion++;}
      return flags.loseAcknowledgement?undefined:result;
    },
    adoptVerifiedState:cloud=>{calls.adoptions++;live=clone(cloud);return true;},
    suspend:()=>{calls.suspensions++;allowed=false;if(flags.suspendError)throw Error("suspend UI failed");}
  };
  const api=chronology.createMutationApi(env);
  return {api,env,remote,source,before,calls,context,get live(){return clone(live);},setVersion(){localVersion++;},setAllowed(value){allowed=value;}};
}

test("J: a multi-job renumber commits one full state through the real protected wrapper/CAS writer",async()=>{
  const h=harness(),result=await h.api.save(correction,{expectedRevision:7});
  assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);assert.equal(result.indeterminate,false);
  assert.equal(h.calls.writes,1);assert.equal(h.remote.commits,1);assert.equal(h.remote.queues,1);
  assert.equal(h.calls.preflights,1);assert.equal(h.calls.merges,1);assert.equal(h.calls.adoptions,1);
  assert.deepEqual(h.remote.state.cuttingJobs.map(j=>[j.id,j.cutNumber]),[["mon","C002"]]);
  assert.deepEqual(h.remote.state.completedCuttingJobs.map(j=>[j.id,j.cutNumber]),[["tue","C001"],["wed","C003"]]);
  assert.equal(h.remote.state.completedCuttingJobs[0].cutDateISO,"2026-10-04");
  const expected=clone(h.before);expected.cuttingJobs[0].cutNumber="C002";
  expected.completedCuttingJobs[0].cutNumber="C001";expected.completedCuttingJobs[0].cutDateISO="2026-10-04";
  expected.syncMeta=h.remote.state.syncMeta;
  assert.deepEqual(h.remote.state,expected);
  assert.deepEqual(h.live,h.remote.state);
  assert.deepEqual(h.source,h.before);
  assert.deepEqual(result.renumbering.affectedRange,{from:1,to:2});
});
test("Firebase-shaped JSON round-trip retains explicit calendar day/order and every relationship",async()=>{
  const h=harness(),result=await h.api.save(correction,{expectedRevision:7});
  assert.equal(result.saved,true);
  const cloud=JSON.parse(JSON.stringify(h.remote.state)),job=cloud.completedCuttingJobs[0],original=h.before.completedCuttingJobs[0];
  assert.equal(job.cutDateISO,"2026-10-04");assert.equal(job.cutOrderWithinDay,1);assert.equal(job.id,original.id);
  for(const field of ["files","manualLogs","importProvenance","completedAtISO","costRate","chargeRate","cat","projectNumber","import_event_id"])
    assert.deepEqual(job[field],original[field]);
  assert.deepEqual(cloud.costHistory,h.before.costHistory);assert.deepEqual(cloud.recoveryMetadata,h.before.recoveryMetadata);
  assert.deepEqual(chronology.planRenumbering(cloud.cuttingJobs,cloud.completedCuttingJobs).changed,[]);
});
test("K: definite permission failure leaves server/live state exact and never adopts partial numbers",async()=>{
  const h=harness({writeError:Object.assign(Error("denied"),{code:"permission-denied"})}),result=await h.api.save(correction,{expectedRevision:7});
  assert.equal(result.saved,false);assert.equal(result.indeterminate,false);assert.equal(h.remote.commits,0);
  assert.deepEqual(h.remote.state,h.before);assert.deepEqual(h.live,h.before);assert.equal(h.calls.adoptions,0);assert.equal(h.calls.writes,1);
});
test("protected preflight rejects before queueing without weakening guards",async()=>{
  const h=harness({preflightBlocked:true}),result=await h.api.save(correction,{expectedRevision:7});
  assert.equal(result.saved,false);assert.equal(result.indeterminate,false);assert.equal(h.remote.queues,0);
  assert.deepEqual(h.remote.state,h.before);assert.deepEqual(h.live,h.before);
});
test("chronology adds an in-transaction exact-state restriction after protected merges",async()=>{
  const h=harness({changeProtectedMerge:true}),result=await h.api.save(correction,{expectedRevision:7});
  assert.equal(result.saved,false);assert.match(result.error,/Prepared chronology state changed/);
  assert.equal(h.remote.queues,0);assert.deepEqual(h.remote.state,h.before);assert.equal(h.calls.preflights,1);
});
test("stale source revision blocks the operation before any writer call",async()=>{
  const h=harness({beforeRead:({remote})=>{const next=remote.state;next.syncMeta.rev=8;remote.replace(next);}});
  const result=await h.api.save(correction,{expectedRevision:7});
  assert.equal(result.saved,false);assert.equal(result.blocked,true);assert.equal(h.calls.writes,0);assert.equal(h.remote.commits,0);
});
test("two clients and transaction retries permit one complete winner",async()=>{
  const h=harness(),other=chronology.createMutationApi(h.env);
  const results=await Promise.all([h.api.save(correction,{expectedRevision:7}),other.save([{id:"tue",cutDateISO:"2026-10-09"}],{expectedRevision:7})]);
  assert.equal(results.filter(r=>r.saved).length,1);assert.equal(h.remote.commits,1);
  const plan=chronology.planRenumbering(h.remote.state.cuttingJobs,h.remote.state.completedCuttingJobs);
  assert.deepEqual(plan.changed,[]);
});
test("unknown completion before commit suspends without retry or local staging",async()=>{
  const h=harness({writeError:Error("connection lost")}),result=await h.api.save(correction,{expectedRevision:7});
  assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.equal(result.requiresReload,true);
  assert.equal(h.calls.writes,1);assert.equal(h.calls.suspensions,1);assert.equal(h.calls.adoptions,0);
  assert.deepEqual(h.live,h.before);assert.deepEqual(h.remote.state,h.before);
});
test("unknown acknowledgement after complete commit retains evidence without rollback",async()=>{
  const h=harness({afterCommitError:Error("acknowledgement lost")}),result=await h.api.save(correction,{expectedRevision:7});
  assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.equal(h.remote.commits,1);
  assert.deepEqual(chronology.planRenumbering(h.remote.state.cuttingJobs,h.remote.state.completedCuttingJobs).changed,[]);
  assert.deepEqual(h.live,h.before);assert.equal(h.calls.adoptions,0);assert.equal(h.calls.writes,1);
});
for(const flags of [{loseAcknowledgement:true},{throwWrite:true},{falseAcknowledgement:{saved:true,stateWriteCompleted:false}}])
  test("missing/thrown/inconsistent acknowledgement cannot falsely confirm "+JSON.stringify(flags),async()=>{
    const h=harness(flags),result=await h.api.save(correction,{expectedRevision:7});
    assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.equal(h.calls.suspensions,1);
    assert.equal(h.calls.adoptions,0);assert.deepEqual(h.live,h.before);assert.equal(h.calls.writes,1);
  });
for(const flags of [{readBackError:true},{readBackMismatch:true}])
  test("committed write requires exact server verification "+JSON.stringify(flags),async()=>{
    const h=harness(flags),result=await h.api.save(correction,{expectedRevision:7});
    assert.equal(result.saved,false);assert.equal(result.authoritativeSaveCompleted,true);assert.equal(result.indeterminate,true);
    assert.equal(h.remote.commits,1);assert.equal(h.calls.adoptions,0);assert.equal(h.calls.suspensions,1);assert.equal(h.calls.writes,1);
  });
test("concurrent local edits invalidate the transaction before queueing",async()=>{
  const h=harness({localDuringWrite:true}),result=await h.api.save(correction,{expectedRevision:7});
  assert.equal(result.saved,false);assert.equal(h.remote.queues,0);assert.equal(h.live.cuttingJobs[0].notes,"concurrent edit");
  assert.deepEqual(h.remote.state,h.before);assert.equal(h.calls.adoptions,0);
});
test("concurrent local edits after commit are preserved and require review instead of adoption",async()=>{
  const h=harness({localAfterWrite:true}),result=await h.api.save(correction,{expectedRevision:7});
  assert.equal(result.saved,true);assert.equal(result.verified,true);assert.equal(result.requiresReload,true);
  assert.equal(h.remote.commits,1);assert.equal(h.calls.adoptions,0);assert.equal(h.calls.suspensions,1);
  assert.equal(h.live.cuttingJobs[0].notes,"concurrent edit without a save");
  assert.equal(h.live.cuttingJobs[0].cutNumber,"C001");
});
test("unresolved legacy fields prevent a writer call even with usable schedule/completion dates",async()=>{
  const h=harness();const legacy=base();delete legacy.cuttingJobs[0].cutDateISO;legacy.cuttingJobs[0].startISO="2026-10-05";
  const api=chronology.createMutationApi({...h.env,readState:async()=>clone(legacy),baselineMatches:()=>true});
  const result=await api.save(correction,{expectedRevision:7});
  assert.equal(result.blocked,true);assert.equal(result.saved,false);assert.equal(h.calls.writes,0);
  assert.deepEqual(h.remote.state,h.before);
});
test("already-canonical no-op performs no write or adoption",async()=>{
  const h=harness(),result=await h.api.save([],{expectedRevision:7});
  assert.equal(result.saved,true);assert.equal(result.noOp,true);assert.equal(result.stateWriteCompleted,false);
  assert.equal(h.calls.writes,0);assert.equal(h.calls.adoptions,0);
});
test("missing permission/revision and busy operation fail closed",async()=>{
  const h=harness();h.setAllowed(false);
  assert.equal((await h.api.save(correction,{expectedRevision:7})).blocked,true);assert.equal(h.calls.reads,0);
  h.setAllowed(true);assert.equal((await h.api.save(correction,{expectedRevision:NaN})).blocked,true);
  let release;const api=chronology.createMutationApi({...h.env,readState:()=>new Promise(resolve=>{release=resolve;})});
  const pending=api.save([],{expectedRevision:7});
  assert.equal((await api.save([],{expectedRevision:7})).blocked,true);
  release(clone(h.before));assert.equal((await pending).noOp,true);assert.equal(api.isBusy(),false);
});
test("even suspension UI failure cannot turn an unknown write into confirmation",async()=>{
  const h=harness({writeError:Error("lost"),suspendError:true}),result=await h.api.save(correction,{expectedRevision:7});
  assert.equal(result.saved,false);assert.equal(result.requiresReload,true);assert.match(result.suspensionError,/suspend UI failed/);
});
test("production adapter is used by explicit business operations, never by hydration",()=>{
  const index=fs.readFileSync("index.html","utf8");
  assert.ok(index.indexOf('src="js/cuttingJobChronology.js"')<index.indexOf('src="js/cuttingJobHistory.js"'));
  assert.match(core,/const cuttingJobChronologyMutationApi = window\.CuttingJobChronology\?\.createMutationApi/);
  assert.match(core,/writeState:\(next,expectedRevision,validatePreparedState,operation\)=>writeAuthoritativeStateSnapshot/);
  assert.match(core,/cuttingJobChronologyMutationApi\.save\(\[\], \{expectedRevision:window\.__loadedCloudRevisionForSaveGuard,businessOperation:operation\}\)/);
  assert.equal(fs.readFileSync("js/renderers.js","utf8").includes("cuttingJobChronologyMutationApi"),false);
});
test("caller corrections are frozen before awaiting the authoritative baseline",async()=>{
  const h=harness(),requested=clone(correction);let release;
  const api=chronology.createMutationApi({...h.env,readState:()=>h.calls.writes?Promise.resolve(h.remote.state):new Promise(resolve=>{release=resolve;})});
  const pending=api.save(requested,{expectedRevision:7});
  requested[0].cutDateISO="2026-10-09";
  release(clone(h.before));
  const result=await pending;
  assert.equal(result.saved,true,result.error);
  assert.equal(h.remote.state.completedCuttingJobs[0].cutDateISO,"2026-10-04");
});
test("production adapter checks the complete live baseline, including unsaved unrelated data",()=>{
  const source=base(),live=clone(source);
  const context=vm.createContext({
    window:{CuttingJobChronology:{createMutationApi:env=>env},__lastLoadedCloudState:clone(source),__loadedCloudRevisionForSaveGuard:7},
    FB:{user:{uid:"fixture"}},
    canWriteCloud:()=>true,hasPendingLocalChanges:false,isVercelPreviewRuntime:()=>false,lastLocalMutationAt:0,
    getInventoryIdentityRepairLocalState:()=>live,snapshotState:()=>live,compactStateForStorage:value=>value,stableStringify:JSON.stringify,
    readCurrentCloudStateReadOnly:async()=>clone(source),writeAuthoritativeStateSnapshot(){},
    adoptIdentityCheckedAuthoritativeState:()=>({recovery:false}),renderRecoveryDiagnosticsPanel(){}
  });
  const start=core.indexOf("const cuttingJobChronologyMutationApi"),end=core.indexOf("function getInventoryIdentityRepairLocalState",start);
  vm.runInContext(core.slice(start,end)+";this.adapter=cuttingJobChronologyMutationApi",context);
  assert.equal(context.adapter.baselineMatches(source),true);
  const version=JSON.stringify(context.adapter.localVersion());
  live.inventory[0].qtyNew=99;
  assert.equal(context.adapter.baselineMatches(source),false);
  assert.notEqual(JSON.stringify(context.adapter.localVersion()),version);
  context.adapter.suspend({error:"unknown"});
  assert.equal(context.window.__autosaveDisabled,true);
  assert.equal(context.window.__recoveryInspectMode,true);
});
test("real authoritative hydration round-trips new fields and never initializes legacy chronology",async()=>{
  const h=harness();assert.equal((await h.api.save(correction,{expectedRevision:7})).saved,true);
  const cloud=JSON.parse(JSON.stringify(h.remote.state));
  cloud.cuttingJobs.push({id:"legacy",cutNumber:"C099",startISO:"2026-10-01",completedAtISO:"2026-10-02"});
  const before=clone(cloud),context=vm.createContext({
    window:{localStorage:{setItem(){throw Error("Hydration must not write a cache");}}},
    cloneStructured:clone,syncRenderTotalsFromHistory(){},
    saveCloudNow(){throw Error("Hydration must not save");}
  });
  const start=core.indexOf("function adoptAuthoritativeRecoveryState"),end=core.indexOf("function renderInventoryIdentityRecoveryData",start);
  vm.runInContext(core.slice(start,end)+";this.adopt=adoptAuthoritativeRecoveryState",context);
  context.adopt(cloud);
  assert.deepEqual(context.window.cuttingJobs,cloud.cuttingJobs);
  assert.deepEqual(context.window.completedCuttingJobs,cloud.completedCuttingJobs);
  assert.deepEqual(cloud,before);
  assert.equal(context.window.completedCuttingJobs[0].cutDateISO,"2026-10-04");
  assert.equal(context.window.completedCuttingJobs[0].cutOrderWithinDay,1);
  const legacy=context.window.cuttingJobs[1];
  assert.equal(Object.hasOwn(legacy,"cutDateISO"),false);
  assert.equal(Object.hasOwn(legacy,"cutOrderWithinDay"),false);
  assert.equal(legacy.cutNumber,"C099");
});
test("baseline capture failure releases the operation without any write",async()=>{
  const h=harness();let broken=true;
  const api=chronology.createMutationApi({...h.env,localVersion:()=>{if(broken)throw Error("capture failed");return 1;}});
  const failed=await api.save(correction,{expectedRevision:7});
  assert.equal(failed.saved,false);assert.equal(failed.indeterminate,false);assert.match(failed.error,/capture failed/);
  assert.equal(api.isBusy(),false);assert.equal(h.calls.writes,0);
  broken=false;assert.equal((await api.save([],{expectedRevision:7})).noOp,true);
});

for(const [name,mutate] of [
  ["clears active jobs",snapshot=>{snapshot.cuttingJobs=[];}],
  ["clears protected inventory",snapshot=>{snapshot.inventory=[];}],
  ["changes nested protected data",snapshot=>{snapshot.inventory[0].qtyNew=999;}],
  ["mutates arrays and nested job attachments",snapshot=>{snapshot.completedCuttingJobs.splice(0,1);snapshot.cuttingJobs[0].files.push({id:"injected"});}],
  ["retains and later mutates its snapshot",snapshot=>{queueMicrotask(()=>{snapshot.cuttingJobs.length=0;snapshot.inventory[0].qtyNew=999;});}]
])test("CJO-02B validator isolation: "+name,async()=>{
  const h=harness(),input=clone(h.before),before=clone(input);
  const result=await h.context.write(input,{merge:true},{expectedRevision:7,validatePreparedState:snapshot=>{mutate(snapshot);return true;}});
  assert.equal(result.saved,true,result.error);assert.equal(h.remote.commits,1);
  const expected=clone(before);expected.syncMeta=h.remote.state.syncMeta;
  assert.deepEqual(h.remote.state,expected);assert.deepEqual(input,expected);
  assert.deepEqual(h.live,h.before);
});
for(const [name,validate] of [["returns false",()=>false],["throws",()=>{throw Error("validator rejected");}]]){
  test("CJO-02B validator "+name+" fails closed before transaction.set",async()=>{
    const h=harness();
    const result=await h.context.write(h.source,{merge:true},{expectedRevision:7,validatePreparedState:validate});
    assert.equal(result.saved,false);assert.equal(result.definiteFailure,true);
    assert.equal(result.errorCode,"chronology_state_changed");
    assert.equal(h.remote.queues,0);assert.equal(h.remote.commits,0);
    assert.deepEqual(h.remote.state,h.before);assert.deepEqual(h.live,h.before);
  });
}
test("CJO-02B no-validator protected writer remains compatible",async()=>{
  const h=harness(),result=await h.context.write(h.source,{merge:true},{expectedRevision:7});
  assert.equal(result.saved,true);assert.equal(h.remote.commits,1);
  assert.equal(h.calls.preflights,1);assert.equal(h.calls.merges,1);
  const expected=clone(h.before);expected.syncMeta=h.remote.state.syncMeta;
  assert.deepEqual(h.remote.state,expected);
});
test("CJO-02B direct history mutation is blocked; coordinator commits the same canonical domain",async()=>{
  const h=harness(),history=require("../js/cuttingJobHistory");
  const result=history.resequence(h.source.cuttingJobs,h.source.completedCuttingJobs);
  assert.equal(result.requiresCoordinator,true);assert.equal(result.blocked,true);
  assert.deepEqual(h.source,h.before);assert.equal(h.remote.commits,0);
  const saved=await h.api.save(correction,{expectedRevision:7});
  assert.equal(saved.saved,true,saved.error);assert.equal(saved.verified,true);
  assert.equal(h.calls.writes,1);assert.equal(h.remote.commits,1);
  assert.deepEqual(h.remote.state.completedCuttingJobs.map(job=>job.cutNumber),["C001","C003"]);
  assert.equal(h.remote.state.cuttingJobs[0].cutNumber,"C002");
});
