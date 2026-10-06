"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const model=require("../js/cuttingJobChronology"),review=require("../js/cuttingJobChronologyReview"),atomic=require("../js/atomicPersistence"),firewall=require("../js/cuttingFileContentFirewall");
const core=fs.readFileSync("js/core.js","utf8"),clone=value=>structuredClone(value);let auditSequence=0;
const canonical=()=>({syncMeta:{rev:7},cuttingJobs:[{id:"mon",name:"Monday",cutDateISO:"2026-10-05",cutOrderWithinDay:1,cutNumber:"C001",files:[],manualLogs:[]}],completedCuttingJobs:[
  {id:"tue",name:"Tuesday",cutDateISO:"2026-10-06",cutOrderWithinDay:1,cutNumber:"C002",cat:"project",projectNumber:"0000",costRate:45,chargeRate:200,actualHours:2,completedAtISO:"2026-10-12T12:00:00Z",import_event_id:"source",importProvenance:{sourceRowNumber:4,completed_date:"2000-01-01"},files:[{id:"file",source:"wj_cuts_reference",relativePath:"WJ Cuts/old.dxf"}],manualLogs:[{dateISO:"2026-10-06",completedHours:2}]},
  {id:"wed",name:"Wednesday",cutDateISO:"2026-10-07",cutOrderWithinDay:1,cutNumber:"C003",files:[],manualLogs:[]},
  {id:"thu",name:"Thursday",cutDateISO:"2026-10-08",cutOrderWithinDay:1,cutNumber:"C004",files:[],manualLogs:[]}
],inventory:[{id:"keep",qty:4}],dailyCutHours:[],totalHistory:[],pumpEff:{entries:[]},jobFolders:[{id:"project",name:"Project"}],costHistory:[{jobId:"tue",amount:90}],deletedItems:[]});
function harness(source=canonical(),flags={}){
  let live=clone(source),remote=clone(source),version=0,allowed=true,commits=0,queues=0,writes=0,suspensions=0;
  const db={async runTransaction(callback){let pending;await callback({get:async()=>({exists:true,data:()=>clone(remote)}),set(ref,value){queues++;pending=clone(value);}});if(flags.definiteError)throw Object.assign(Error("rejected"),{definite:true});remote=pending;commits++;if(flags.lostAck)throw Error("acknowledgement lost");}};
  const context=vm.createContext({window:{OMAXAtomicPersistence:atomic,CuttingFileContentFirewall:firewall,__lastLoadedCloudState:clone(source),__loadedCloudRevisionForSaveGuard:source.syncMeta.rev},inventoryIdentityRepairAuthorizations:new Map(),FB:{ready:true,user:{uid:"operator"},db,docRef:{path:"fixture/app/state"}},canWriteCloud:()=>allowed,getCloudSyncClientId:()=>"operator",scanAuthoritativeCutFileContent:firewall.scanCuttingFileContent,
    validateProtectedSavePreflight:()=>({blocked:false}),detectDangerousProtectedFieldReduction:()=>({blocked:false}),readLocalStateBackup:()=>null,buildWindowProtectedStateForCoverage:()=>clone(live),getSaveSchemaCoverageReport:()=>({}),mergeTotalHistoryForSave:value=>value,mergeDailyCutHoursForSave:value=>value,mergePumpEffForSave:value=>value,estimatePayloadBytes:value=>Buffer.byteLength(JSON.stringify(value)),FIRESTORE_BLOCK_BYTES:975000,enterMissingStateRecovery(){},renderRecoveryDiagnosticsPanel(){}});
  const start=core.indexOf("async function writeAuthoritativeStateSnapshot"),end=core.indexOf("// Foundation adapter only.",start);assert.ok(start>=0&&end>start);vm.runInContext(core.slice(start,end)+";this.write=writeAuthoritativeStateSnapshot;",context);
  const env={canWrite:()=>allowed,localVersion:()=>({version,state:live}),baselineMatches:cloud=>model.stateKey(cloud)===model.stateKey(live),readState:async()=>clone(remote),writeState:async(next,revision,validate)=>{writes++;if(flags.casConflict)remote.syncMeta.rev++;return context.write(next,{merge:true},{expectedRevision:revision,validatePreparedState:validate});},adoptVerifiedState:cloud=>{live=clone(cloud);return true;},suspend:()=>{suspensions++;allowed=false;}};
  const coordinator=model.createMutationApi(env),workflow=review.createWorkflow({state:()=>clone(live),version:()=>version,canWrite:()=>allowed,audit:()=>({operationId:"operation-"+(++auditSequence),atISO:"2026-10-06T12:00:00.000Z",actorUid:"operator"}),coordinator,suspend:env.suspend});
  return{workflow,coordinator,context,get live(){return clone(live);},get remote(){return clone(remote);},get counts(){return{commits,queues,writes,suspensions};},changeCloud:state=>{remote=clone(state);},changeLocal:fn=>{fn(live);version++;}};
}
const labels=state=>Object.fromEntries([...state.cuttingJobs,...state.completedCuttingJobs].map(job=>[job.id,job.cutNumber]));
function prepare(h,id,date,placement){const session=h.workflow.begin(id);assert.equal(session.ok,true,session.error);const applied=session.apply(id,date,placement);assert.equal(applied.ok,true,applied.error);const preview=h.workflow.preview(session);assert.equal(preview.ok,true,preview.error);return{session,preview};}
test("CJO-04 real coordinator previews Thursday before Wednesday and commits exactly once",async()=>{
  const h=harness(),before=h.live,{preview}=prepare(h,"thu","2026-10-07",{type:"before",id:"wed"});
  assert.deepEqual(h.counts,{commits:0,queues:0,writes:0,suspensions:0});assert.deepEqual(h.live,before);
  assert.equal(preview.target.before.label,"C004");assert.equal(preview.target.after.label,"C003");assert.deepEqual(preview.renumbering.affectedRange,{from:3,to:4});
  assert.equal((await h.workflow.confirm(preview.token)).ok,false);assert.equal(h.counts.writes,0);
  const saved=await h.workflow.confirm(preview.token,{confirmed:true});assert.equal(saved.saved,true,saved.error);assert.equal(saved.verified,true);assert.equal(h.counts.commits,1);
  assert.deepEqual(labels(h.live),{mon:"C001",tue:"C002",wed:"C004",thu:"C003"});assert.deepEqual(h.live,h.remote);
  assert.deepEqual(h.live.completedCuttingJobs[0],before.completedCuttingJobs[0]);assert.deepEqual(h.live.inventory,before.inventory);assert.deepEqual(h.live.costHistory,before.costHistory);
});
for(const [name,id,date,placement,expected] of [
  ["move earlier","thu","2026-10-05","first",{mon:"C002",tue:"C003",wed:"C004",thu:"C001"}],
  ["move later","mon","2026-10-09","first",{mon:"C004",tue:"C001",wed:"C002",thu:"C003"}]
])test("CJO-04 "+name+" preserves relationships and exact preview",async()=>{
  const h=harness(),before=h.live,{preview}=prepare(h,id,date,placement),result=await h.workflow.confirm(preview.token,{confirmed:true});assert.equal(result.saved,true,result.error);assert.deepEqual(labels(h.live),expected);
  for(const old of [...before.cuttingJobs,...before.completedCuttingJobs]){const after=[...h.live.cuttingJobs,...h.live.completedCuttingJobs].find(job=>job.id===old.id);const strip=job=>Object.fromEntries(Object.entries(job).filter(([key])=>!["cutDateISO","cutOrderWithinDay","cutNumber","cutChronologyHistory"].includes(key)));assert.deepEqual(strip(after),strip(old));}
});
for(const [placement,expected] of [["first",["thu","mon","tue","wed"]],[{type:"after",id:"tue"},["mon","tue","thu","wed"]],["last",["mon","tue","wed","thu"]]])test("CJO-04 same-day placement "+JSON.stringify(placement),async()=>{
  const source=canonical();[source.cuttingJobs[0],...source.completedCuttingJobs.slice(0,2)].forEach((job,index)=>{job.cutDateISO="2026-10-05";job.cutOrderWithinDay=index+1;});
  const h=harness(source),{preview}=prepare(h,"thu","2026-10-05",placement),result=await h.workflow.confirm(preview.token,{confirmed:true});assert.equal(result.saved,true,result.error);
  const ordered=model.readChronology(h.live.cuttingJobs,h.live.completedCuttingJobs).entries;assert.deepEqual(ordered.map(entry=>entry.id),expected);assert.deepEqual(ordered.map(entry=>entry.order),[1,2,3,4]);
});
test("CJO-04 missed historical job blocks until explicitly reviewed and shifts later cuts",async()=>{
  const source=canonical();source.completedCuttingJobs.push({id:"missed",name:"Missed cut",cutNumber:"C099",startISO:"1900-01-01",importProvenance:{completed_date:"1900-01-02"}});
  const h=harness(source),session=h.workflow.begin("missed");assert.equal(h.workflow.preview(session).remaining,1);assert.equal(session.jobs().find(job=>job.id==="missed").cutDateISO,undefined);
  assert.equal(session.apply("missed","2026-10-07",{type:"before",id:"wed"}).ok,true);const preview=h.workflow.preview(session);assert.equal(preview.ok,true);
  assert.equal((await h.workflow.confirm(preview.token,{confirmed:true})).saved,true);assert.deepEqual(labels(h.live),{mon:"C001",tue:"C002",wed:"C004",thu:"C005",missed:"C003"});
  const record=h.live.completedCuttingJobs.find(job=>job.id==="missed").cutChronologyHistory[0];assert.equal(record.kind,"operator_review_initialization");assert.equal(record.before.cutDateISO,null);assert.equal(record.after.cutDateISO,"2026-10-07");
});
test("CJO-04 legacy review remains local, incomplete review cannot commit, completed review saves one whole domain",async()=>{
  const source=canonical();for(const job of [...source.cuttingJobs,...source.completedCuttingJobs]){delete job.cutDateISO;delete job.cutOrderWithinDay;job.startISO="1900-01-01";}
  const h=harness(source),before=h.live,session=h.workflow.begin("tue");assert.equal(h.workflow.preview(session).remaining,4);
  session.apply("tue","2026-10-06","first");assert.equal(h.workflow.preview(session).remaining,3);assert.equal((await h.workflow.confirm(Object.freeze({}),{confirmed:true})).ok,false);assert.deepEqual(h.live,before);assert.equal(h.counts.writes,0);
  session.apply("mon","2026-10-05","first");session.apply("wed","2026-10-07","first");session.apply("thu","2026-10-08","first");
  const preview=h.workflow.preview(session);assert.equal(preview.ok,true);const result=await h.workflow.confirm(preview.token,{confirmed:true});assert.equal(result.saved,true,result.error);assert.equal(h.counts.commits,1);
  assert.equal(model.chronologyReadiness(h.live.cuttingJobs,h.live.completedCuttingJobs).status,"CANONICAL_READY");for(const job of [...h.live.cuttingJobs,...h.live.completedCuttingJobs])assert.equal(job.cutChronologyHistory[0].kind,"operator_review_initialization");
});
test("CJO-04 cancel discards review and invalidates confirmation without a write",async()=>{
  const h=harness(),before=h.live,{session,preview}=prepare(h,"thu","2026-10-05","first");h.workflow.cancel(session);
  assert.equal((await h.workflow.confirm(preview.token,{confirmed:true})).ok,false);assert.deepEqual(h.live,before);assert.equal(h.counts.commits,0);assert.equal(h.counts.writes,0);
});
for(const change of ["draft","local","cloud","CAS"])test("CJO-04 "+change+" change after preview fails safely",async()=>{
  const h=harness(canonical(),{casConflict:change==="CAS"}),before=h.live,{session,preview}=prepare(h,"thu","2026-10-05","first");
  if(change==="draft")session.apply("thu","2026-10-09","first");if(change==="local")h.changeLocal(state=>state.inventory[0].qty++);if(change==="cloud"){const cloud=h.remote;cloud.syncMeta.rev++;h.changeCloud(cloud);}
  const result=await h.workflow.confirm(preview.token,{confirmed:true});assert.notEqual(result.saved,true);assert.equal(h.counts.commits,0);assert.equal(h.counts.queues,0);
  assert.deepEqual(labels(h.live),labels(before));if(change!=="local")assert.deepEqual(h.live,before);
});
test("CJO-04 definite save failure never reports success or stages chronology",async()=>{
  const h=harness(canonical(),{definiteError:true}),before=h.live,{preview}=prepare(h,"thu","2026-10-05","first"),result=await h.workflow.confirm(preview.token,{confirmed:true});
  assert.equal(result.saved,false);assert.equal(result.indeterminate,false);assert.deepEqual(h.live,before);assert.equal(h.counts.commits,0);
});
test("CJO-04 unknown committed outcome suspends without rollback or automatic retry",async()=>{
  const h=harness(canonical(),{lostAck:true}),before=h.live,{preview}=prepare(h,"thu","2026-10-05","first"),result=await h.workflow.confirm(preview.token,{confirmed:true});
  assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.equal(h.counts.commits,1);assert.equal(h.counts.suspensions,1);assert.deepEqual(h.live,before);
  assert.notDeepEqual(labels(h.remote),labels(before));assert.equal((await h.workflow.confirm(preview.token,{confirmed:true})).ok,false);assert.equal(h.counts.commits,1);
});
for(const [date,placement] of [["2026-02-30","first"],["","first"],["2026-10-05",{type:"before",id:"missing"}],["2026-10-05",null]])test("CJO-04 rejects invalid date/placement "+JSON.stringify([date,placement]),()=>{const h=harness(),session=h.workflow.begin("thu");assert.equal(session.apply("thu",date,placement).ok,false);assert.equal(h.counts.writes,0);});
test("CJO-04 missing/ambiguous stable identities cannot enter review",()=>{
  const source=canonical();assert.equal(review.createSession(source,"missing").ok,false);source.completedCuttingJobs[0].id="mon";assert.equal(review.createSession(source,"mon").ok,false);delete source.completedCuttingJobs[0].id;assert.equal(review.createSession(source,"mon").ok,false);
});
test("CJO-04 audit appends exact before/after evidence and survives real hydration and backup sanitization",async()=>{
  const source=canonical();source.completedCuttingJobs[2].cutChronologyHistory=[{operationId:"prior",jobId:"thu",kind:"correction",before:{cutDateISO:"2026-10-09"},after:{cutDateISO:"2026-10-08"}}];
  const h=harness(source),{preview}=prepare(h,"thu","2026-10-05","first");assert.equal((await h.workflow.confirm(preview.token,{confirmed:true})).saved,true);
  const changed=h.remote.completedCuttingJobs.find(job=>job.id==="thu");assert.deepEqual(changed.cutChronologyHistory[0],source.completedCuttingJobs[2].cutChronologyHistory[0]);
  const record=changed.cutChronologyHistory[1];assert.equal(record.jobId,"thu");assert.equal(record.actorUid,"operator");assert.equal(record.atISO,"2026-10-06T12:00:00.000Z");assert.equal(record.before.cutNumber,"C004");assert.equal(record.after.cutNumber,"C001");assert.deepEqual(record.affectedRange,{from:1,to:4});assert.equal(record.affectedCount,4);
  const context=vm.createContext({window:{},cloneStructured:clone,syncRenderTotalsFromHistory(){},isLikelyEmbeddedFileContent:()=>false,isSafeMetadataString:()=>false});
  const a=core.indexOf("function adoptAuthoritativeRecoveryState"),b=core.indexOf("function renderInventoryIdentityRecoveryData",a);vm.runInContext(core.slice(a,b)+";this.adopt=adoptAuthoritativeRecoveryState;",context);context.adopt(h.remote);
  assert.deepEqual(context.window.completedCuttingJobs,h.remote.completedCuttingJobs);assert.deepEqual(labels(context.window),labels(h.remote));
  const s=core.indexOf("function isProtectedBusinessDataKey"),e=core.indexOf("function estimateTopLevelFieldSizes",s);vm.runInContext(core.slice(s,e)+";this.sanitize=sanitizeValueForStorage;",context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.sanitize(h.remote,{dropHeavyHistory:true}))).completedCuttingJobs.find(job=>job.id==="thu").cutChronologyHistory,changed.cutChronologyHistory);
});
test("CJO-04 corrupt audit history or altered exact preview cannot be committed",async()=>{
  const source=canonical();source.completedCuttingJobs[2].cutChronologyHistory={bad:true};const h=harness(source),session=h.workflow.begin("thu");session.apply("thu","2026-10-05","first");assert.equal(h.workflow.preview(session).ok,false);assert.equal(h.counts.writes,0);
  const clean=harness(),audit={operationId:"test",atISO:"2026-10-06T12:00:00.000Z",actorUid:"operator"};const result=await clean.coordinator.save([{id:"thu",cutDateISO:"2026-10-09"}],{expectedRevision:7,expectedSourceKey:model.stateKey(clean.live),expectedPreparedKey:"altered",audit});assert.equal(result.blocked,true);assert.equal(clean.counts.writes,0);
});
test("CJO-04 normal-adoption projection preserves loaded metadata and detects unrelated runtime edits",()=>{
  const source=canonical();source.appConfig={dailyHours:8};source.saveMeta={status:"saved"};source.syncProcessLog=[{eventType:"saved"}];source.extraEvidence={keep:true};
  const runtime=clone(source);delete runtime.syncMeta;delete runtime.extraEvidence;
  const c=vm.createContext({window:{__lastLoadedCloudState:source},snapshotState:options=>{assert.equal(options.skipLocalFileCacheSync,true);return runtime;},compactStateForStorage:value=>value});
  const start=core.indexOf("function getCuttingJobChronologyLocalState"),end=core.indexOf("function getInventoryIdentityRepairLocalState",start);vm.runInContext(core.slice(start,end)+";this.state=getCuttingJobChronologyLocalState;",c);
  assert.equal(model.stateKey(c.state()),model.stateKey(source));runtime.inventory[0].qty++;
  assert.notEqual(model.stateKey(c.state()),model.stateKey(source));assert.equal(source.inventory[0].qty,4);assert.deepEqual(c.state().extraEvidence,{keep:true});
});
test("CJO-04 exact source binding rejects a different baseline even when revision matches",async()=>{
  const h=harness(),before=h.live;h.changeLocal(state=>state.inventory[0].qty++);h.changeCloud(h.live);
  const result=await h.coordinator.save([{id:"thu",cutDateISO:"2026-10-09"}],{expectedRevision:7,expectedSourceKey:model.stateKey(before)});
  assert.equal(result.blocked,true);assert.match(result.error,/after preview/);assert.equal(h.counts.writes,0);
});
test("CJO-04 unexpected coordinator exceptions suspend and cannot become success",async()=>{
  const state=canonical();let suspended=0;
  const workflow=review.createWorkflow({state:()=>state,canWrite:()=>true,version:()=>1,audit:()=>({operationId:"throw",actorUid:"operator",atISO:"2026-10-06T12:00:00.000Z"}),coordinator:{save:async()=>{throw Error("unknown");}},suspend:()=>suspended++});
  const session=workflow.begin("thu");session.apply("thu","2026-10-09","first");const preview=workflow.preview(session),result=await workflow.confirm(preview.token,{confirmed:true});
  assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.equal(suspended,1);assert.equal(workflow.isBusy(),false);
});
test("CJO-04 realtime echo leaves adoption to the busy coordinator and otherwise retains listener behavior",()=>{
  let busy=true,callback,adoptions=0,routes=0;
  const c=vm.createContext({window:{isCuttingJobChronologySaving:()=>busy,scrollY:0},FB:{ready:true,docRef:{onSnapshot(fn){callback=fn;return()=>{};}}},workspaceStateUnsubscribe:null,getCloudSyncClientId:()=>"operator",isRecoveryMode:()=>false,stateHasMeaningfulData:()=>true,checkAuthoritativeIdentityIntegrity:()=>({valid:true}),hasPendingLocalChanges:false,lastLocalMutationAt:0,lastAppliedCloudRevision:7,
    adoptState:()=>adoptions++,cloneStructured:clone,resetHistoryToCurrent(){},route:()=>routes++,isEditableTarget:()=>false,location:{hash:"#/jobs"},document:{activeElement:null,body:{classList:{contains:()=>false}},querySelector:()=>null},console,clearTimeout(){},setTimeout(){}});
  const start=core.indexOf("function startWorkspaceStateListener"),end=core.indexOf("/* ===================== DATA / STATE",start);assert.ok(start>=0&&end>start);vm.runInContext(core.slice(start,end)+";startWorkspaceStateListener();",c);
  const incoming={syncMeta:{rev:8,updatedBy:"operator"},cuttingJobs:[],completedCuttingJobs:[]};callback({exists:true,metadata:{hasPendingWrites:false},data:()=>incoming});assert.equal(adoptions,0);assert.equal(routes,0);
  busy=false;callback({exists:true,metadata:{hasPendingWrites:false},data:()=>incoming});assert.equal(adoptions,1);assert.equal(routes,1);assert.equal(c.window.__loadedCloudRevisionForSaveGuard,8);
});
test("CJO-04 large previews always show the selected job before the concise affected list",()=>{
  const source=canonical();source.cuttingJobs=[];source.completedCuttingJobs=Array.from({length:20},(_,index)=>({id:"job-"+index,name:"Cut "+index,cutDateISO:"2026-10-05",cutOrderWithinDay:index+1,cutNumber:"C"+String(index+1).padStart(3,"0")}));
  const h=harness(source),{preview}=prepare(h,"job-0","2026-10-05","last");assert.equal(preview.details[0].id,"job-0");assert.equal(preview.renumbering.changed.length,20);assert.equal(h.counts.writes,0);
});
test("CJO-04 append-only audit remains attached through actual completion construction",()=>{
  const job=canonical().cuttingJobs[0];job.cutChronologyHistory=[{operationId:"record",jobId:job.id,kind:"correction"}];
  const c=vm.createContext({window:{},JOB_RATE_PER_HOUR:200,JOB_BASE_COST_PER_HOUR:45});const a=core.indexOf("function buildCompletedJob"),b=core.indexOf("function completeCuttingJob",a);vm.runInContext(core.slice(a,b)+";this.complete=buildCompletedJob;",c);assert.deepEqual(c.complete(job,"2026-10-09T12:00:00Z").cutChronologyHistory,job.cutChronologyHistory);
});
test("CJO-04 later corrections append evidence without replacing the verified earlier operation",async()=>{
  const first=harness(),one=prepare(first,"thu","2026-10-05","first");assert.equal((await first.workflow.confirm(one.preview.token,{confirmed:true})).saved,true);
  const earlier=first.remote.cuttingJobs.concat(first.remote.completedCuttingJobs).find(job=>job.id==="thu").cutChronologyHistory;
  const second=harness(first.remote),two=prepare(second,"thu","2026-10-09","first");assert.equal((await second.workflow.confirm(two.preview.token,{confirmed:true})).saved,true);
  const records=second.remote.cuttingJobs.concat(second.remote.completedCuttingJobs).find(job=>job.id==="thu").cutChronologyHistory;assert.deepEqual(records.slice(0,earlier.length),earlier);assert.equal(records.length,earlier.length+1);
});
test("CJO-04 cancelling incomplete legacy review writes no partial canonical fields",()=>{
  const state=canonical();for(const job of [...state.cuttingJobs,...state.completedCuttingJobs]){delete job.cutDateISO;delete job.cutOrderWithinDay;}
  const h=harness(state),before=h.live,session=h.workflow.begin("thu");session.apply("thu","2026-10-08","first");assert.equal(session.status().unresolvedCount,3);h.workflow.cancel(session);assert.deepEqual(h.live,before);assert.equal(h.counts.writes,0);
});
