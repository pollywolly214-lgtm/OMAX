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
  let live=clone(source),remote=clone(source),version=0,allowed=true,commits=0,queues=0,writes=0,suspensions=0;
  const db={async runTransaction(callback){let pending;await callback({get:async()=>({exists:true,data:()=>clone(remote)}),set(ref,value){queues++;pending=clone(value);}});if(flags.definiteError)throw Object.assign(Error("rejected"),{definite:true});remote=pending;commits++;if(flags.lostAck)throw Error("acknowledgement lost");}};
  const context=vm.createContext({window:{CuttingJobDateEditing:dates,OMAXAtomicPersistence:atomic,CuttingFileContentFirewall:firewall,__lastLoadedCloudState:clone(source),__loadedCloudRevisionForSaveGuard:source.syncMeta.rev},stableStringify:model.stateKey,inventoryIdentityRepairAuthorizations:new Map(),FB:{ready:true,user:{uid:"operator"},db,docRef:{path:"fixture/app/state"}},canWriteCloud:()=>allowed,getCloudSyncClientId:()=>"operator",scanAuthoritativeCutFileContent:firewall.scanCuttingFileContent,
    validateProtectedSavePreflight:()=>({blocked:false}),detectDangerousProtectedFieldReduction:()=>({blocked:false}),readLocalStateBackup:()=>null,buildWindowProtectedStateForCoverage:()=>clone(live),getSaveSchemaCoverageReport:()=>({}),mergeTotalHistoryForSave:value=>value,mergeDailyCutHoursForSave:value=>value,mergePumpEffForSave:value=>value,estimatePayloadBytes:value=>Buffer.byteLength(JSON.stringify(value)),FIRESTORE_BLOCK_BYTES:975000,enterMissingStateRecovery(){},renderRecoveryDiagnosticsPanel(){}});
  const start=core.indexOf("async function writeAuthoritativeStateSnapshot"),end=core.indexOf("// Foundation adapter only.",start);assert.ok(start>=0&&end>start);
  for(const name of ["validateCuttingJobDeletionSave","validateCuttingJobHistoryRestoreSave","cuttingJobDeletionSafetyBaseline","reportCloudSaveSecondaryError"]){const a=core.indexOf("function "+name+"("),b=core.indexOf("\n}",a);assert.ok(a>=0&&b>a,name);vm.runInContext(core.slice(a,b+2),context);}
  vm.runInContext(core.slice(start,end)+";this.write=writeAuthoritativeStateSnapshot;",context);
  const a=core.indexOf("function buildCompletedJob"),b=core.indexOf("\nwindow.completeCuttingJob =",a);
  context.window.CuttingJobDateEditing=dates;context.JOB_RATE_PER_HOUR=200;context.JOB_BASE_COST_PER_HOUR=45;
  vm.runInContext(core.slice(a,b),context);
  const env={prepareBusinessMutation:(state,operation,options)=>dates.prepareMutation(state,operation,{...options,buildCompletedJob:context.buildCompletedJob}),audit:()=>({operationId:"business-"+(++auditSequence),atISO:"2026-10-06T12:00:00.000Z",actorUid:"operator"}),canWrite:()=>allowed,localVersion:()=>({version,state:live}),baselineMatches:cloud=>model.stateKey(cloud)===model.stateKey(live),readState:async()=>clone(remote),writeState:async(next,revision,validate,operation)=>{writes++;if(flags.casConflict)remote.syncMeta.rev++;return context.write(next,{merge:true},{expectedRevision:revision,validatePreparedState:validate,cuttingJobCompletionId:operation?.type==="complete"?operation.id:null});},adoptVerifiedState:cloud=>{live=clone(cloud);context.window.__loadedCloudRevisionForSaveGuard=cloud.syncMeta.rev;context.window.__lastLoadedCloudState=clone(cloud);return true;},suspend:()=>{suspensions++;allowed=false;}};
  const coordinator=model.createMutationApi(env);context.cuttingJobChronologyMutationApi=coordinator;context.window.__loadedCloudRevisionForSaveGuard=source.syncMeta.rev;const workflow=review.createWorkflow({state:()=>clone(live),version:()=>version,canWrite:()=>allowed,audit:()=>({operationId:"operation-"+(++auditSequence),atISO:"2026-10-06T12:00:00.000Z",actorUid:"operator"}),coordinator,suspend:env.suspend});
  return{workflow,coordinator,context,get live(){return clone(live);},get remote(){return clone(remote);},get counts(){return{commits,queues,writes,suspensions};},changeCloud:state=>{remote=clone(state);},changeLocal:fn=>{fn(live);version++;}};
}
const state=()=>({syncMeta:{rev:7},cuttingJobs:[],completedCuttingJobs:[
  {id:"one",name:"One",startISO:"2026-10-01",completedAtISO:"2026-10-01",cutNumber:"C001",cat:"lady",projectNumber:"1241",files:[{id:"file",relativePath:"WJ Cuts/one.dxf",source:"wj_cuts_reference"}],manualLogs:[{dateISO:"2026-10-01",completedHours:2}],importProvenance:{sourceRowNumber:1},estimateHours:2,costRate:45,chargeRate:200},
  {id:"two",name:"Two",startISO:"2026-10-02",completedAtISO:"2026-10-02",cutNumber:"C002",cat:"other",projectNumber:"1254",files:[],manualLogs:[]},
  {id:"three",name:"Three",startISO:"2026-10-03",completedAtISO:"2026-10-03",cutNumber:"C003",cat:"lady",projectNumber:"1241",files:[],manualLogs:[]},
  {id:"four",name:"Four",startISO:"2026-10-04",completedAtISO:"2026-10-04",cutNumber:"C004",cat:"lady",projectNumber:"1241",files:[],manualLogs:[]}
],inventory:[{id:"keep",qty:4}],dailyCutHours:[],totalHistory:[],pumpEff:{entries:[]},jobFolders:[{id:"lady",name:"1241 Lady Bird"},{id:"other",name:"1254 Blanco"}],costHistory:[{jobId:"one",amount:90}],deletedItems:[]});
const op=(id,date)=>({type:"edit",id,updates:{completedAtISO:date}});
function save(h,operation){return h.coordinator.save([],{expectedRevision:h.live.syncMeta.rev,businessOperation:operation});}
const byId=s=>new Map([...s.cuttingJobs,...s.completedCuttingJobs].map(job=>[job.id,job]));
test("CJO-04A exact Lady Bird create/complete/reload preserves completed identity among 156 legacy records",async()=>{
  const source=state();for(let i=0;i<156;i++)source.completedCuttingJobs.push({id:"legacy-"+i,name:"Old "+i,cutNumber:"C"+String(i+5).padStart(3,"0"),cat:"lady",projectNumber:"1241"});
  const h=harness(source),job={id:"test-category-cut",name:"Test category cut",startISO:"2026-10-05",dueISO:"2026-10-06",estimateHours:2,cat:"lady",projectNumber:"1241",files:[],manualLogs:[]};
  assert.equal((await save(h,{type:"create",job})).saved,true);
  const result=await h.context.completeCuttingJob(job.id,{completedAtISO:"2026-10-06T12:00:00.000Z"});assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);assert.equal(h.counts.commits,2);assert.equal(h.counts.writes,2);
  assert.equal(h.live.cuttingJobs.length,0);assert.equal(h.remote.completedCuttingJobs.find(item=>item.id===job.id).completedAtISO,"2026-10-06T12:00:00.000Z");
  const reloaded=harness(h.remote);assert.equal(reloaded.live.cuttingJobs.length,0);assert.equal(reloaded.live.completedCuttingJobs.find(item=>item.id===job.id).name,job.name);
  for(const old of source.completedCuttingJobs.filter(item=>item.id.startsWith("legacy-")))assert.deepEqual(byId(h.live).get(old.id),old);
});
for(const [name,id,date,expected,history,category] of [
  ["earlier","four","2026-10-02",["one","two","four","three"],["three","four","two","one"],2],
  ["later","one","2026-10-05",["two","three","four","one"],["one","four","three","two"],3]
])test("CJO-04A completed date "+name+" updates global/category/history and exact saved dates",async()=>{
  const h=harness(state()),before=h.live;const result=await save(h,op(id,date));assert.equal(result.saved,true,result.error);
  assert.deepEqual(dates.orderedJobs(h.live.cuttingJobs,h.live.completedCuttingJobs).map(e=>e.job.id),expected);assert.deepEqual(expected.map(key=>byId(h.live).get(key).cutNumber),["C001","C002","C003","C004"]);
  assert.deepEqual(dates.historyJobs(h.live.completedCuttingJobs).map(j=>j.id),history);assert.equal(dates.categoryNumbers(h.live.cuttingJobs,h.live.completedCuttingJobs).get(id),category);
  assert.equal(byId(h.remote).get(id).completedAtISO,date);assert.deepEqual(h.live,h.remote);assert.deepEqual(h.live.completedCuttingJobs.map(j=>j.id),before.completedCuttingJobs.map(j=>j.id));
});
test("CJO-04A active Start Date edit uses start, ignoring due and retired cut-date fields",async()=>{
  const source=state(),job=source.completedCuttingJobs.pop();delete job.completedAtISO;job.startISO="2026-10-04";job.cutDateISO="1900-01-01";job.cutOrderWithinDay=9;source.cuttingJobs.push(job);
  const h=harness(source),result=await save(h,{type:"edit",id:"four",updates:{startISO:"2026-09-30"}});assert.equal(result.saved,true,result.error);assert.equal(h.live.cuttingJobs[0].cutNumber,"C001");assert.equal(h.live.cuttingJobs[0].cutDateISO,"2026-09-30");assert.equal(h.live.cuttingJobs[0].cutOrderWithinDay,1);
});
test("CJO-04A global movement across another category only counts peers within each category",async()=>{
  const h=harness(state());assert.equal((await save(h,op("four","2026-09-30"))).saved,true);
  const numbers=dates.categoryNumbers(h.live.cuttingJobs,h.live.completedCuttingJobs);assert.equal(numbers.get("four"),1);assert.equal(numbers.get("one"),2);assert.equal(numbers.get("three"),3);assert.equal(numbers.get("two"),1);assert.equal(byId(h.live).get("two").cutNumber,"C003");
});
test("CJO-04A same-day stored order survives repeated calculation, reversed arrays and reload",async()=>{
  const source=state();for(const j of source.completedCuttingJobs){j.completedAtISO="2026-10-01";delete j.importProvenance;}
  const h=harness(source);assert.equal((await save(h,{type:"edit",id:"four",updates:{notes:"explicit edit"}})).saved,true);
  const order=dates.orderedJobs([],h.remote.completedCuttingJobs).map(e=>e.job.id);assert.deepEqual(order,["one","two","three","four"]);assert.deepEqual(dates.orderedJobs([],h.remote.completedCuttingJobs.reverse()).map(e=>e.job.id),order);
});
test("CJO-04A same-day complete source sequence overrides conflicting labels and remains stable",async()=>{
  const source=state();source.completedCuttingJobs=source.completedCuttingJobs.slice(0,2);for(const [i,j]of source.completedCuttingJobs.entries()){j.completedAtISO="2026-10-01";j.import_event_id="source-"+i;j.importProvenance={sourceRowNumber:2-i};}
  const h=harness(source);assert.equal((await save(h,op("one","2026-10-01"))).saved,true);assert.equal(byId(h.live).get("two").cutNumber,"C001");assert.deepEqual(dates.orderedJobs([],h.live.completedCuttingJobs.reverse()).map(e=>e.job.id),["two","one"]);
});
test("CJO-04A stable ID is the final same-day fallback, independent of storage order",()=>{
  const jobs=[{id:"z",completedAtISO:"2026-10-01"},{id:"a",completedAtISO:"2026-10-01"}];assert.deepEqual(dates.orderedJobs([],jobs).map(e=>e.job.id),["a","z"]);assert.deepEqual(dates.orderedJobs([],jobs.reverse()).map(e=>e.job.id),["a","z"]);
});
test("CJO-04A dateless slot stays fixed while dated jobs move around it without backfill",async()=>{
  const source=state();delete source.completedCuttingJobs[1].completedAtISO;source.completedCuttingJobs[1].createdAt="1900-01-01";source.completedCuttingJobs[1].dueISO="1900-01-02";
  const h=harness(source);assert.equal((await save(h,op("four","2026-09-30"))).saved,true);assert.deepEqual(byId(h.live).get("two"),source.completedCuttingJobs[1]);assert.equal(byId(h.live).get("four").cutNumber,"C001");assert.equal(byId(h.live).get("one").cutNumber,"C003");
});
test("CJO-04A reads never migrate fields, renumber stored labels or mutate frozen arrays",()=>{
  const source=state(),before=clone(source);for(const job of source.completedCuttingJobs)Object.freeze(job);Object.freeze(source.completedCuttingJobs);dates.historyJobs(source.completedCuttingJobs);dates.categoryNumbers([],source.completedCuttingJobs);dates.orderedJobs([],source.completedCuttingJobs);assert.deepEqual(source,before);
});
for(const [type,operation]of [["date edit",op("four","2026-09-30")],["completion",{type:"complete",id:"four",completedAtISO:"2026-10-05"}]])test("CJO-04A "+type+" definite failure leaves live status/dates/numbers unchanged",async()=>{
  const source=state();if(type==="completion"){const job=source.completedCuttingJobs.pop();delete job.completedAtISO;source.cuttingJobs.push(job);}
  const h=harness(source,{definiteError:true}),before=h.live,result=await save(h,operation);assert.equal(result.saved,false);assert.equal(result.indeterminate,false);assert.equal(h.counts.commits,0);assert.deepEqual(h.live,before);assert.deepEqual(h.remote,before);
});
for(const flag of ["casConflict","lostAck"])test("CJO-04A "+flag+" completion cannot claim success or automatically retry",async()=>{
  const source=state(),job=source.completedCuttingJobs.pop();delete job.completedAtISO;source.cuttingJobs.push(job);const h=harness(source,{[flag]:true}),before=h.live;
  const result=await save(h,{type:"complete",id:"four",completedAtISO:"2026-10-05"});assert.equal(result.saved,false);assert.deepEqual(h.live,before);assert.equal(h.counts.commits,flag==="lostAck"?1:0);assert.equal(h.counts.writes,1);if(flag==="lostAck"){assert.equal(result.requiresReload,true);assert.equal(h.remote.cuttingJobs.length,0);}
});
test("CJO-04A edit retains attachments, costs, manual logs, category, provenance and append-only audit",async()=>{
  const source=state();source.completedCuttingJobs[0].cutChronologyHistory=[{operationId:"prior",jobId:"one"}];const h=harness(source);assert.equal((await save(h,op("one","2026-10-05"))).saved,true);
  const before=source.completedCuttingJobs[0],after=byId(h.remote).get("one");for(const key of ["id","files","manualLogs","cat","projectNumber","importProvenance","costRate","chargeRate"])assert.deepEqual(after[key],before[key]);assert.deepEqual(h.live.costHistory,source.costHistory);assert.deepEqual(after.cutChronologyHistory[0],before.cutChronologyHistory[0]);assert.equal(after.cutChronologyHistory[1].before.date,"2026-10-01");assert.equal(after.cutChronologyHistory[1].after.date,"2026-10-05");assert.equal(after.cutChronologyHistory[1].before.cutNumber,"C001");assert.equal(after.cutChronologyHistory[1].after.cutNumber,"C004");
});
for(const updates of [{startISO:"2026-02-30"},{completedAtISO:""},{completedAtISO:"bad"},{id:"replace"},{cutNumber:"C999"},{files:[]}])test("CJO-04A rejects invalid or identity/relationship edit "+JSON.stringify(updates),async()=>{
  const h=harness(state()),before=h.live,result=await save(h,{type:"edit",id:"one",updates});assert.equal(result.saved,false);assert.equal(h.counts.writes,0);assert.deepEqual(h.live,before);
});
test("CJO-04A input/cancel without save makes zero writes",()=>{
  const h=harness(state()),draft=clone(h.live);draft.completedCuttingJobs[0].completedAtISO="2026-09-30";assert.equal(h.counts.writes,0);assert.deepEqual(h.live,state());
});
test("CJO-04A duplicate identity stops a logical date operation before persistence",async()=>{
  const source=state();source.cuttingJobs.push(clone(source.completedCuttingJobs[0]));const h=harness(source),result=await save(h,op("one","2026-10-05"));assert.equal(result.saved,false);assert.equal(h.counts.writes,0);
});
test("CJO-04A normal UI is the sole date workflow and binds the protected coordinator",()=>{
  const views=fs.readFileSync("js/views.js","utf8"),index=fs.readFileSync("index.html","utf8"),renderers=fs.readFileSync("js/renderers.js","utf8");assert.doesNotMatch(views,/data-edit-cut-chronology/);assert.doesNotMatch(index,/src="js\/cuttingJobChronologyUi.js"/);assert.match(views,/Start Date/);assert.match(views,/Completion Date/);assert.match(renderers,/await completeCuttingJob/);assert.match(core,/businessOperation:operation/);
});

test("CJO-04A mixed imported/native same-day evidence stays in comparable slots",()=>{
  const jobs=[{id:"native",cutNumber:"C002",completedAtISO:"2026-10-01"},{id:"import",cutNumber:"C001",completedAtISO:"2026-10-01",import_event_id:"event",importProvenance:{sourceRowNumber:156}}];
  assert.deepEqual(dates.orderedJobs([],jobs).map(e=>e.job.id),["import","native"]);
});
test("CJO-04A a completed record without Start Date accepts explicit Completion Date without invented start",async()=>{
  const source=state();delete source.completedCuttingJobs[0].startISO;const h=harness(source),result=await save(h,op("one","2026-10-05"));assert.equal(result.saved,true,result.error);assert.equal(Object.hasOwn(byId(h.remote).get("one"),"startISO"),false);
});
test("CJO-04A dateless legacy unrelated edit preserves absent dates and its stored label",async()=>{
  const source=state();delete source.completedCuttingJobs[0].completedAtISO;delete source.completedCuttingJobs[0].startISO;const h=harness(source),result=await save(h,{type:"edit",id:"one",updates:{notes:"reviewed note"}});assert.equal(result.saved,true,result.error);const job=byId(h.remote).get("one");assert.equal(job.cutNumber,"C001");assert.equal(Object.hasOwn(job,"startISO"),false);assert.equal(Object.hasOwn(job,"completedAtISO"),false);
});
for(const corruption of ["attachment loss","log loss","missing binding","another job loss"])test("CJO-04A completion transfer rejects "+corruption+" before queuing state",async()=>{
  const source=state(),job=source.completedCuttingJobs.shift();delete job.completedAtISO;source.cuttingJobs.push(job);
  const h=harness(source),audit={operationId:"proof-test",actorUid:"operator",atISO:"2026-10-06T12:00:00.000Z"};
  const prepared=dates.prepareMutation(source,{type:"complete",id:"one",completedAtISO:"2026-10-06"},{audit,buildCompletedJob:h.context.buildCompletedJob});assert.equal(prepared.ok,true);
  const next=prepared.nextState,target=next.completedCuttingJobs.find(j=>j.id==="one");if(corruption==="attachment loss")target.files=[];if(corruption==="log loss")target.manualLogs=[];if(corruption==="another job loss")next.completedCuttingJobs=next.completedCuttingJobs.filter(j=>j.id!=="two");
  const result=await h.context.write(next,{merge:true},{expectedRevision:7,cuttingJobCompletionId:"one",validatePreparedState:corruption==="missing binding"?undefined:()=>true});assert.equal(result.saved,false);assert.equal(h.counts.queues,0);assert.equal(h.counts.commits,0);assert.deepEqual(h.remote,source);
});
test("CJO-04A exact guarded preparation cannot accept an altered numbering or unrelated field",async()=>{
  const h=harness(state()),operation=op("one","2026-10-05"),originalWrite=h.context.write;
  h.context.write=async(next,options,guards)=>{next.inventory=[];return originalWrite(next,options,guards);};
  const result=await save(h,operation);assert.equal(result.saved,false);assert.equal(h.counts.queues,0);assert.equal(h.counts.commits,0);assert.equal(h.live.inventory.length,1);
});

test("CJO-04A duplicate stored legacy labels without dates cannot block ordinary completion",async()=>{
  const source=state(),active=source.completedCuttingJobs.pop();delete active.completedAtISO;source.cuttingJobs.push(active);
  source.completedCuttingJobs.push({id:"old-a",cutNumber:"C099"},{id:"old-b",cutNumber:"C099"});const h=harness(source);
  const result=await save(h,{type:"complete",id:"four",completedAtISO:"2026-10-05"});assert.equal(result.saved,true,result.error);
  assert.deepEqual(byId(h.remote).get("old-a"),source.completedCuttingJobs.at(-2));assert.deepEqual(byId(h.remote).get("old-b"),source.completedCuttingJobs.at(-1));
});
