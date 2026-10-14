"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const model=require("../js/cuttingJobChronology"),review=require("../js/cuttingJobChronologyReview"),atomic=require("../js/atomicPersistence"),firewall=require("../js/cuttingFileContentFirewall");
const dates=require("../js/cuttingJobDateEditing");
const core=fs.readFileSync("js/core.js","utf8"),clone=value=>structuredClone(value);let auditSequence=0;
const canonical=()=>({syncMeta:{rev:7},cuttingJobs:[{id:"mon",name:"Monday",cutDateISO:"2026-10-05",cutOrderWithinDay:1,cutNumber:"C001",files:[],manualLogs:[]}],completedCuttingJobs:[
  {id:"tue",name:"Tuesday",cutDateISO:"2026-10-06",cutOrderWithinDay:1,cutNumber:"C002",cat:"project",projectNumber:"0000",costRate:45,chargeRate:200,actualHours:2,completedAtISO:"2026-10-12T12:00:00Z",import_event_id:"source",importProvenance:{sourceRowNumber:4,completed_date:"2000-01-01"},files:[{id:"file",source:"wj_cuts_reference",relativePath:"WJ Cuts/old.dxf"}],manualLogs:[{dateISO:"2026-10-06",completedHours:2}]},
  {id:"wed",name:"Wednesday",cutDateISO:"2026-10-07",cutOrderWithinDay:1,cutNumber:"C003",files:[],manualLogs:[]},
  {id:"thu",name:"Thursday",cutDateISO:"2026-10-08",cutOrderWithinDay:1,cutNumber:"C004",files:[],manualLogs:[]}
],inventory:[{id:"keep",qty:4}],dailyCutHours:[],totalHistory:[],pumpEff:{entries:[]},jobFolders:[{id:"project",name:"Project"}],costHistory:[{jobId:"tue",amount:90}],deletedItems:[]});
function harness(source=canonical(),flags={}){
  let preparations=0,adoptions=0,verificationReads=0,lateResolve;const waits=[],serverReads=[],transactionRefs=[];
  let live=clone(source),remote=clone(source),version=0,allowed=true,commits=0,queues=0,writes=0,suspensions=0;
  const db={async runTransaction(callback){let pending;await callback({get:async ref=>{transactionRefs.push(ref);return{exists:true,data:()=>clone(remote)};},set(ref,value){transactionRefs.push(ref);queues++;pending=JSON.parse(JSON.stringify(value));}});if(flags.definiteError)throw Object.assign(Error("rejected"),{definite:true});remote=pending;commits++;if(flags.lostAck)throw Error("acknowledgement lost");}};
  const context=vm.createContext({window:{CuttingJobDateEditing:dates,OMAXAtomicPersistence:atomic,CuttingFileContentFirewall:firewall,__lastLoadedCloudState:clone(source),__loadedCloudRevisionForSaveGuard:source.syncMeta.rev},stableStringify:model.stateKey,inventoryIdentityRepairAuthorizations:new Map(),FB:{ready:true,user:{uid:"operator"},db,docRef:{path:"fixture/app/state"}},canWriteCloud:()=>allowed,getCloudSyncClientId:()=>"operator",scanAuthoritativeCutFileContent:firewall.scanCuttingFileContent,
    validateProtectedSavePreflight:()=>({blocked:false}),detectDangerousProtectedFieldReduction:()=>({blocked:false}),readLocalStateBackup:()=>null,buildWindowProtectedStateForCoverage:()=>clone(live),getSaveSchemaCoverageReport:()=>({}),mergeTotalHistoryForSave:value=>value,mergeDailyCutHoursForSave:value=>value,mergePumpEffForSave:value=>value,estimatePayloadBytes:value=>Buffer.byteLength(JSON.stringify(value)),FIRESTORE_BLOCK_BYTES:975000,enterMissingStateRecovery(){},renderRecoveryDiagnosticsPanel(){}});
  const start=core.indexOf("async function writeAuthoritativeStateSnapshot"),end=core.indexOf("// Foundation adapter only.",start);assert.ok(start>=0&&end>start);
  for(const name of ["validateCuttingJobDeletionSave","validateCuttingJobHistoryRestoreSave","cuttingJobDeletionSafetyBaseline","reportCloudSaveSecondaryError"]){const a=core.indexOf("function "+name+"("),b=core.indexOf("\n}",a);assert.ok(a>=0&&b>a,name);vm.runInContext(core.slice(a,b+2),context);}
  vm.runInContext(core.slice(start,end)+";this.write=writeAuthoritativeStateSnapshot;",context);
  const a=core.indexOf("function buildCompletedJob"),b=core.indexOf("\nwindow.completeCuttingJob =",a);
  context.window.CuttingJobDateEditing=dates;context.JOB_RATE_PER_HOUR=200;context.JOB_BASE_COST_PER_HOUR=45;
  vm.runInContext(core.slice(a,b),context);
  const env={prepareBusinessMutation:(state,operation,options)=>dates.prepareMutation(state,operation,{...options,buildCompletedJob:context.buildCompletedJob}),audit:()=>({operationId:"business-"+(++auditSequence),atISO:"2026-10-06T12:00:00.000Z",actorUid:"operator"}),canWrite:()=>allowed,localVersion:()=>({version,state:live}),baselineMatches:cloud=>model.stateKey(cloud)===model.stateKey(live),readState:async()=>{const cloud=clone(remote);if(writes&&flags.readbackChange)flags.readbackChange(cloud);return cloud;},writeState:async(next,revision,validate,operation)=>{writes++;if(flags.casConflict)remote.syncMeta.rev++;const result=await context.write(next,{merge:true},{expectedRevision:revision,validatePreparedState:validate,cuttingJobCompletionId:operation?.type==="complete"?operation.id:null});
    if(result.saved&&flags.writerMetadata){remote.saveMeta={...remote.saveMeta,lastSaveStatus:"saved",lastSavedAt:"2026-10-06T12:00:00.000Z"};result.committedState=clone(remote);}
    if(flags.missingCommitted)delete result.committedState;
    return result;},adoptVerifiedState:cloud=>{live=clone(cloud);context.window.cuttingJobs=live.cuttingJobs;context.window.completedCuttingJobs=live.completedCuttingJobs;context.window.__loadedCloudRevisionForSaveGuard=cloud.syncMeta.rev;context.window.__lastLoadedCloudState=clone(cloud);return true;},suspend:()=>{suspensions++;allowed=false;}};
  let coordinator=model.createMutationApi(env);context.cuttingJobChronologyMutationApi=coordinator;context.window.__loadedCloudRevisionForSaveGuard=source.syncMeta.rev;const workflow=review.createWorkflow({state:()=>clone(live),version:()=>version,canWrite:()=>allowed,audit:()=>({operationId:"operation-"+(++auditSequence),atISO:"2026-10-06T12:00:00.000Z",actorUid:"operator"}),coordinator,suspend:env.suspend});
  context.window.CuttingJobChronology={...model,createMutationApi:environment=>model.createMutationApi({...environment,waitForReadback:async ms=>{
    waits.push(ms);
    if(flags.duringWait==="document")context.FB.docRef={path:"other/app/state"};
    if(flags.duringWait==="backend")context.FB.db={};
    if(flags.duringWait==="actor")context.FB.user.uid="another-actor";
    if(flags.duringWait==="local-edit")live.completedCuttingJobs[0].notes="unsaved concurrent change";
  }})};
  context.window.CuttingJobDateEditing={...dates,prepareMutation:(...args)=>{preparations++;return dates.prepareMutation(...args);}};
  context.window.CuttingJobHistory=require("../js/cuttingJobHistory");
  context.FB.app={options:{projectId:"fixture-project"}};context.FB.docRef.firestore=db;context.FB.workspaceRef=context.FB.docRef;context.window.workspaceRef=context.FB.docRef;
  context.FB.docRef.get=async options=>{
    const ref=context.FB.docRef;serverReads.push({ref,source:options?.source});
    let state=clone(remote),fromCache=false,hasPendingWrites=false,path=ref.path,firestore=db;
    if(commits){
      const mode=flags.readbacks?.[verificationReads++]||"exact";
      if(mode==="stale")state=clone(source);
      if(mode==="newer")state.syncMeta.rev++;
      if(mode==="different")state.completedCuttingJobs[0].files=[];
      if(mode==="cache")fromCache=true;
      if(mode==="pending")hasPendingWrites=true;
      if(mode==="wrong-path")path="wrong/app/state";
      if(mode==="wrong-backend")firestore={};
      if(mode==="missing")state=null;
      if(mode==="invalid-revision")state.syncMeta.rev="invalid";
      if(mode==="never")await new Promise(resolve=>{lateResolve=resolve;});
    }
    return{exists:state!==null,data:()=>state,ref:{path,firestore},metadata:{fromCache,hasPendingWrites}};
  };
  context.window.OMAXAtomicPersistence={...atomic,save:options=>atomic.save({...options,now:()=>1791985634074})};
  context.lastGeneratedIdTime=0;
  const idStart=core.indexOf("function genId("),idEnd=core.indexOf("\n}",idStart)+2;vm.runInContext(core.slice(idStart,idEnd),context);
  context.hasPendingLocalChanges=false;context.lastLocalMutationAt=0;context.isVercelPreviewRuntime=()=>false;context.getCuttingJobChronologyLocalState=()=>clone(live);
  context.adoptIdentityCheckedAuthoritativeState=cloud=>{adoptions++;live=clone(cloud);context.window.cuttingJobs=live.cuttingJobs;context.window.completedCuttingJobs=live.completedCuttingJobs;context.window.__lastLoadedCloudState=clone(cloud);context.window.__loadedCloudRevisionForSaveGuard=cloud.syncMeta.rev;return{recovery:false};};
  context.renderRecoveryDiagnosticsPanel=()=>{suspensions++;allowed=false;};
  const writer=context.write;context.writeAuthoritativeStateSnapshot=async(...args)=>{writes++;if(flags.changeBeforeWrite)context.FB.docRef={path:"other/app/state"};return writer(...args);};
  const normalizeStart=core.indexOf("function normalizeJobPriorityOrder"),normalizeEnd=core.indexOf("function buildCompletedJob",normalizeStart);vm.runInContext(core.slice(normalizeStart,normalizeEnd),context);
  const adapterStart=core.indexOf("const cuttingJobChronologyMutationApi"),adapterEnd=core.indexOf("window.isCuttingJobChronologySaving",adapterStart);vm.runInContext(core.slice(adapterStart,adapterEnd)+";this.productionCoordinator=cuttingJobChronologyMutationApi;",context);coordinator=context.productionCoordinator;
  return{workflow,coordinator,context,get live(){return clone(live);},get remote(){return clone(remote);},get counts(){return{commits,queues,writes,suspensions,verificationReads,preparations,adoptions,waits};},serverReads,transactionRefs,resolveLate:()=>lateResolve?.(),changeCloud:state=>{remote=clone(state);},changeLocal:fn=>{fn(live);version++;}};
}
const oldRevision=1791324281902,committedRevision=1791985634074;
const fixture=()=>({schema:72,syncMeta:{rev:oldRevision},cuttingJobs:[],completedCuttingJobs:[{id:"tested",name:"Testing category cut file.",startISO:"2026-10-04",dueISO:"2026-10-06",completedAtISO:"2026-10-06",cutNumber:"C001",cat:"lady",projectNumber:"1241",estimateHours:2,actualHours:1,chargeRate:200,costRate:45,materialCost:10,materialQty:1,files:[{fileId:"file",relativePath:"WJ Cuts/test.dxf",source:"wj_cuts_reference"}],manualLogs:[{dateISO:"2026-10-04",completedHours:1}],importProvenance:{sourceRowNumber:1},cutChronologyHistory:[{operationId:"old-audit",jobId:"tested"}]}],jobFolders:[{id:"lady",name:"1241 Lady Bird"}],inventory:[{id:"keep",qty:4}],costHistory:[{jobId:"tested",amount:45}],totalHistory:[],dailyCutHours:[],pumpEff:{entries:[]},deletedItems:[]});
const operation={type:"edit",id:"tested",updates:{startISO:"2026-10-01",completedAtISO:"2026-10-02"}};
const save=h=>h.coordinator.save([],{expectedRevision:oldRevision,businessOperation:operation});
test("CJO-04C exact reported stale revision then exact committed read adopts dates without recovery",async()=>{
  const h=harness(fixture(),{readbacks:["stale","exact"]}),result=await save(h);assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);assert.equal(result.indeterminate,false);assert.notEqual(result.requiresReload,true);
  assert.equal(result.committedRevision,committedRevision);assert.equal(result.readbackRevision,committedRevision);assert.equal(result.verificationReadAttempts,2);assert.deepEqual(result.verificationReadHistory.map(r=>r.revision),[oldRevision,committedRevision]);
  assert.equal(h.counts.writes,1);assert.equal(h.counts.commits,1);assert.equal(h.counts.queues,1);assert.equal(h.counts.preparations,1);assert.equal(h.counts.adoptions,1);assert.deepEqual(h.counts.waits,[250]);assert.equal(h.counts.suspensions,0);
  const job=h.live.completedCuttingJobs[0];assert.equal(job.startISO,"2026-10-01");assert.equal(job.completedAtISO,"2026-10-02");assert.equal(job.cutChronologyHistory.length,2);assert.equal(h.context.window.__loadedCloudRevisionForSaveGuard,committedRevision);assert.deepEqual(h.live,h.remote);assert.deepEqual(harness(h.remote).live,h.live);
});
test("CJO-04C two stale reads then exact third read use bounded waits and one mutation",async()=>{
  const h=harness(fixture(),{readbacks:["stale","stale","exact"]}),result=await save(h);assert.equal(result.verified,true,result.error);assert.equal(result.verificationReadAttempts,3);assert.deepEqual(h.counts.waits,[250,750]);assert.equal(h.counts.writes,1);assert.equal(h.counts.preparations,1);assert.equal(h.counts.adoptions,1);
});
test("CJO-04C persistent older reads exhaust three attempts, preserve live state and recover",async()=>{
  const h=harness(fixture(),{readbacks:["stale","stale","stale","exact"]}),before=h.live,result=await save(h);assert.equal(result.saved,false);assert.equal(result.verified,false);assert.equal(result.indeterminate,true);assert.equal(result.requiresReload,true);assert.equal(result.verificationReadAttempts,3);assert.equal(h.counts.verificationReads,3);assert.equal(h.counts.writes,1);assert.equal(h.counts.commits,1);assert.equal(h.counts.preparations,1);assert.equal(h.counts.adoptions,0);assert.equal(h.counts.suspensions,1);assert.deepEqual(h.live,before);assert.equal(h.remote.completedCuttingJobs[0].completedAtISO,"2026-10-02");assert.equal(h.context.window.__cuttingJobDisplayUnconfirmed,true);
  await save(h);assert.equal(h.counts.writes,1,"recovery cannot retry the mutation");
});
for(const sequence of [["newer","exact"],["stale","newer","exact"],["different","exact"],["stale","different","exact"]])test("CJO-04C newer revision/different protected data terminates immediately: "+sequence,async()=>{
  const h=harness(fixture(),{readbacks:sequence}),before=h.live,result=await save(h);assert.equal(result.verified,false);assert.equal(result.requiresReload,true);assert.equal(result.indeterminate,true);assert.equal(result.verificationReadAttempts,sequence[0]==="stale"?2:1);assert.equal(h.counts.writes,1);assert.equal(h.counts.adoptions,0);assert.deepEqual(h.live,before);assert.equal(h.counts.suspensions,1);
});
for(const invalid of ["cache","pending","wrong-path","wrong-backend","missing","invalid-revision"])test("CJO-04C invalid verification proof is never retried or adopted: "+invalid,async()=>{
  const h=harness(fixture(),{readbacks:[invalid,"exact"]}),result=await save(h);assert.equal(result.verified,false);assert.equal(result.requiresReload,true);assert.equal(result.verificationReadAttempts,1);assert.equal(h.counts.writes,1);assert.equal(h.counts.adoptions,0);assert.equal(h.counts.suspensions,1);
});
test("CJO-04C production adapter pins one document/backend for transaction and all server reads",async()=>{
  const h=harness(fixture(),{readbacks:["stale","exact"]}),target=h.context.FB.docRef,result=await save(h);assert.equal(result.verified,true,result.error);assert.ok(h.serverReads.every(read=>read.ref===target&&read.source==="server"));assert.ok(h.transactionRefs.every(ref=>ref===target));assert.equal(result.verificationDocumentPath,target.path);assert.equal(result.verificationProjectId,"fixture-project");assert.equal(result.verificationBackend,"firestore");assert.equal(h.context.window.workspaceRef,target);
});
for(const changed of ["document","backend","actor","local-edit"])test("CJO-04C target or local changes during the wait prohibit adoption: "+changed,async()=>{
  const h=harness(fixture(),{readbacks:["stale","exact"],duringWait:changed}),before=h.live,result=await save(h);assert.equal(result.requiresReload,true);assert.equal(result.verified,false);assert.equal(h.counts.verificationReads,1);assert.equal(h.counts.writes,1);assert.equal(h.counts.adoptions,0);if(changed!=="local-edit")assert.deepEqual(h.live,before);else assert.equal(h.live.completedCuttingJobs[0].notes,"unsaved concurrent change");
});
test("CJO-04C changing target after baseline causes no queued write to either backend",async()=>{
  const h=harness(fixture(),{changeBeforeWrite:true}),before=h.remote,result=await save(h);assert.equal(result.saved,false);assert.equal(result.indeterminate,false);assert.equal(h.counts.queues,0);assert.equal(h.counts.commits,0);assert.deepEqual(h.remote,before);
});
test("CJO-04C server read deadline is bounded, never writes again, and late reads cannot adopt",async()=>{
  const h=harness(fixture(),{readbacks:["never"]}),result=await save(h);assert.equal(result.verified,false);assert.equal(result.requiresReload,true);assert.equal(result.verificationReadAttempts,1);assert.equal(h.counts.writes,1);assert.match(result.error,/timed out/);h.resolveLate();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(h.counts.adoptions,0);assert.equal(h.counts.writes,1);
});
test("CJO-04C recovery notices explicitly mark both existing views unverified",async()=>{
  const h=harness(fixture(),{readbacks:["stale","stale","stale"]}),nodes=[{hidden:true},{hidden:true}];h.context.document={querySelectorAll:selector=>{assert.equal(selector,"[data-cutting-job-verification-notice]");return nodes;}};await save(h);assert.deepEqual(nodes.map(node=>node.hidden),[false,false]);
  const views=fs.readFileSync("js/views.js","utf8");assert.equal((views.match(/data-cutting-job-verification-notice/g)||[]).length,2);assert.match(views,/Start Date → Completion Date/);assert.match(views,/\$\{startTxt\} → \$\{completedTxt\}/);
});
test("CJO-04C verified full adoption clears display notices and preserves every relationship",async()=>{
  const h=harness(fixture(),{readbacks:["stale","exact"]}),before=h.live,nodes=[{hidden:false},{hidden:false}];h.context.window.__cuttingJobDisplayUnconfirmed=true;h.context.document={querySelectorAll:()=>nodes};const result=await save(h);assert.equal(result.verified,true,result.error);assert.deepEqual(nodes.map(node=>node.hidden),[true,true]);const after=h.live.completedCuttingJobs[0],old=before.completedCuttingJobs[0];for(const key of ["id","files","manualLogs","costRate","chargeRate","cat","projectNumber","importProvenance"])assert.deepEqual(after[key],old[key]);assert.deepEqual(h.live.costHistory,before.costHistory);assert.deepEqual(after.cutChronologyHistory[0],old.cutChronologyHistory[0]);
});
