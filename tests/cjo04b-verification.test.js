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
  const db={async runTransaction(callback){let pending;await callback({get:async()=>({exists:true,data:()=>clone(remote)}),set(ref,value){queues++;pending=JSON.parse(JSON.stringify(value));}});if(flags.definiteError)throw Object.assign(Error("rejected"),{definite:true});remote=pending;commits++;if(flags.lostAck)throw Error("acknowledgement lost");}};
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
  const coordinator=model.createMutationApi(env);context.cuttingJobChronologyMutationApi=coordinator;context.window.__loadedCloudRevisionForSaveGuard=source.syncMeta.rev;const workflow=review.createWorkflow({state:()=>clone(live),version:()=>version,canWrite:()=>allowed,audit:()=>({operationId:"operation-"+(++auditSequence),atISO:"2026-10-06T12:00:00.000Z",actorUid:"operator"}),coordinator,suspend:env.suspend});
  return{workflow,coordinator,context,get live(){return clone(live);},get remote(){return clone(remote);},get counts(){return{commits,queues,writes,suspensions};},changeCloud:state=>{remote=clone(state);},changeLocal:fn=>{fn(live);version++;}};
}
function run(h,operation){return h.coordinator.save([],{expectedRevision:h.live.syncMeta.rev,businessOperation:operation});}
const fixture=()=>({syncMeta:{rev:7},schema:72,cuttingJobs:[{id:"active",name:"Active",startISO:"2026-10-03",dueISO:"2026-10-04",cutNumber:"C003",cat:"lady",projectNumber:"1241",estimateHours:2,chargeRate:200,costRate:45,materialCost:10,materialQty:1,files:[{fileId:"file",relativePath:"WJ Cuts/test.dxf",source:"wj_cuts_reference"}],manualLogs:[{dateISO:"2026-10-03",completedHours:1}],priority:1}],completedCuttingJobs:[
 {id:"one",name:"Completed One",startISO:"2026-10-01",dueISO:"2026-10-02",completedAtISO:"2026-10-01",cutNumber:"C001",cat:"lady",projectNumber:"1241",estimateHours:2,material:"Steel",materialCost:10,materialQty:1,chargeRate:210,costRate:47,notes:"Keep notes",files:[{fileId:"past-file",relativePath:"WJ Cuts/past.dxf",source:"wj_cuts_reference"}],manualLogs:[{dateISO:"2026-10-01",completedHours:1}],import_event_id:"event",importProvenance:{sourceRowNumber:1},actualHours:1,efficiency:{actualHours:1},cutDateISO:"2026-10-01",cutOrderWithinDay:1,completed:true,status:"completed"},
 {id:"two",name:"Completed Two",startISO:"2026-10-02",completedAtISO:"2026-10-02",cutNumber:"C002",cat:"lady",projectNumber:"1241",files:[],manualLogs:[]}
],jobFolders:[{id:"lady",name:"1241 Lady Bird"}],inventory:[{id:"protected",qty:4}],maintenanceOccurrencesV2:[{id:"maintenance",status:"complete"}],costHistory:[{jobId:"one",amount:47}],totalHistory:[],dailyCutHours:[],pumpEff:{entries:[]},deletedItems:[],saveMeta:{lastSaveStatus:"pending"},syncProcessLog:[{id:"log",message:"kept"}]});
const completedDate=(id,date)=>({type:"edit",id,updates:{completedAtISO:date}});
test("CJO-04B completed/edit/create shared saves verify actual committed revision and reload without recovery",async()=>{
  const h=harness(fixture());
  const operations=[{type:"create",job:{id:"created",name:"Created",startISO:"2026-10-04",cat:"lady",projectNumber:"1241",files:[],manualLogs:[]}}, {type:"edit",id:"active",updates:{startISO:"2026-09-30"}}, {type:"complete",id:"active",completedAtISO:"2026-10-05"},completedDate("one","2026-09-29"),completedDate("one","2026-10-06")];
  let revision=7;
  for(const operation of operations){const result=await run(h,operation);assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);assert.equal(result.indeterminate,false);assert.notEqual(result.requiresReload,true);assert.ok(result.committedRevision>revision);assert.equal(result.readbackRevision,result.committedRevision);assert.equal(h.context.window.__loadedCloudRevisionForSaveGuard,result.readbackRevision);revision=result.readbackRevision;assert.deepEqual(h.live,h.remote);assert.deepEqual(harness(h.remote).live,h.live);}
  assert.equal(h.counts.commits,5);assert.equal(h.counts.writes,5);assert.equal(h.counts.suspensions,0);assert.ok(h.live.completedCuttingJobs.some(j=>j.id==="active"));assert.equal(h.live.cuttingJobs.find(j=>j.id==="created").name,"Created");
});
test("CJO-04B final writer-owned saveMeta differs from pre-writer intent but verified commit succeeds",async()=>{
  const h=harness(fixture(),{writerMetadata:true});const result=await run(h,completedDate("one","2026-10-06"));assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);assert.equal(result.indeterminate,false);assert.notEqual(result.requiresReload,true);assert.equal(h.live.saveMeta.lastSaveStatus,"saved");assert.equal(h.counts.commits,1);assert.equal(h.counts.suspensions,0);
});
test("CJO-04B JSON serialization uses identical undefined/absent projection without excluding business fields",()=>{
  const committed={cuttingJobs:[{id:"kept",files:[{fileId:"file",optional:undefined}],manualLogs:[]}],completedCuttingJobs:[],saveMeta:{optional:undefined,status:"saved"},syncMeta:{rev:8}};
  const cloud=JSON.parse(JSON.stringify(committed));assert.notEqual(model.stateKey(committed),model.stateKey(cloud));assert.equal(model.stateKey(model.durableStateProjection(committed)),model.stateKey(model.durableStateProjection(cloud)));
  assert.equal(model.durableStateProjection(committed).cuttingJobs[0].files[0].fileId,"file");assert.equal(model.durableStateProjection(committed).saveMeta.status,"saved");
});
for(const [name,change,path] of [
 ["missing completed",s=>s.completedCuttingJobs.splice(s.completedCuttingJobs.findIndex(j=>j.id==="active"),1),"$.completedCuttingJobs.length"],
 ["altered stable ID",s=>s.completedCuttingJobs[0].id="altered","$.completedCuttingJobs[0].id"],
 ["altered cut number",s=>s.completedCuttingJobs[0].cutNumber="C999","$.completedCuttingJobs[0].cutNumber"],
 ["lost attachment",s=>s.completedCuttingJobs[0].files=[],"$.completedCuttingJobs[0].files.length"],
 ["lost manual log",s=>s.completedCuttingJobs[0].manualLogs=[],"$.completedCuttingJobs[0].manualLogs.length"],
 ["inventory changed",s=>s.inventory[0].qty=0,"$.inventory[0].[field#1]"],
 ["maintenance loss",s=>s.maintenanceOccurrencesV2=[],"$.maintenanceOccurrencesV2.length"],
 ["cost loss",s=>s.costHistory=[],"$.costHistory.length"],
 ["category changed",s=>s.completedCuttingJobs[0].cat="other","$.completedCuttingJobs[0].cat"],
 ["start date changed",s=>s.completedCuttingJobs[0].startISO="2020-01-01","$.completedCuttingJobs[0].startISO"],
 ["completion date changed",s=>s.completedCuttingJobs[0].completedAtISO="2020-01-01","$.completedCuttingJobs[0].completedAtISO"],
 ["provenance changed",s=>s.completedCuttingJobs[0].importProvenance={},"$.completedCuttingJobs[0].importProvenance.[field#0]"],
 ["saveMeta changed",s=>s.saveMeta.lastSaveStatus="other","$.saveMeta.lastSaveStatus"],
 ["log evidence lost",s=>s.syncProcessLog=[],"$.syncProcessLog.length"],
 ["same business newer revision",s=>s.syncMeta.rev++,"$.syncMeta.rev"]
])test("CJO-04B real durable readback mismatch: "+name,async()=>{
  const h=harness(fixture(),{readbackChange:change}),before=h.live,result=await run(h,{type:"complete",id:"active",completedAtISO:"2026-10-05"});assert.equal(result.saved,false);assert.equal(result.verified,false);assert.equal(result.indeterminate,true);assert.equal(result.requiresReload,true);assert.equal(result.authoritativeSaveCompleted,true);assert.equal(h.counts.commits,1);assert.equal(h.counts.suspensions,1);assert.deepEqual(h.live,before);assert.ok(result.verificationMismatchPaths.includes(path),JSON.stringify(result.verificationMismatchPaths));assert.ok(result.verificationMismatchCount>0);assert.ok(result.committedRevision>7);
});
test("CJO-04B missing committed payload cannot use earlier intent as proof of a successful save",async()=>{
  const h=harness(fixture(),{missingCommitted:true}),result=await run(h,completedDate("one","2026-10-06"));assert.equal(result.verified,false);assert.equal(result.requiresReload,true);assert.equal(result.indeterminate,true);assert.equal(result.committedRevision,null);assert.equal(h.counts.suspensions,1);
});
test("CJO-04B bounded mismatch evidence contains paths/revisions, no records or arbitrary map keys",()=>{
  const secret="private-file-contents-DO-NOT-LOG",a={completedCuttingJobs:Array.from({length:40},(_,i)=>({id:"id"+i,notes:secret,files:[]})),metadata:{[secret]:1}},b=clone(a);for(const job of b.completedCuttingJobs)job.notes="different";b.metadata[secret]=2;
  const result=model.verificationDifferences(a,b);assert.equal(result.verificationMismatchPaths.length,16);assert.ok(result.verificationMismatchCount>=41);assert.equal(result.verificationMismatchTruncated,true);assert.equal(JSON.stringify(result).includes(secret),false);
});
function copyUi(h,{cancel=false,changed=false}={}){
  const c=h.context,renderers=fs.readFileSync("js/renderers.js","utf8"),a=renderers.indexOf("    if (histActivate){"),b=renderers.indexOf("    if (histEdit){",a);const messages=[];
  Object.assign(c,{histActivate:{getAttribute:()=>"one"},completedCuttingJobs:h.live.completedCuttingJobs,cuttingJobs:h.live.cuttingJobs,closeHistoryActionMenu(){},closeFileMenu(){},getSchedulingDailyHours:()=>8,todayISO:"2026-10-06",parseJobDate:value=>new Date(value),toDateInputValue:date=>date.toISOString().slice(0,10),JOB_DAY_MS:86400000,genId:()=>"active-copy",validateManualJobProjectCategory:()=>({ok:true,cat:"lady",projectNumber:"1241"}),showMakeActiveCopyModal:async()=>{if(changed)c.completedCuttingJobs[0].notes="changed";return cancel?null:{startISO:"2026-10-07",dueISO:"2026-10-08"};},toast:message=>messages.push(message),renderCalendarPreservingScroll(){},renderJobs(){}});
  c.window.CuttingJobChronology=model;c.window.cuttingJobs=c.cuttingJobs;c.window.completedCuttingJobs=c.completedCuttingJobs;
  return {promise:vm.runInContext("(async()=>{"+renderers.slice(a,b)+"})()",c),messages};
}
test("CJO-04B actual History Make Active Copy uses one guarded creation; original + copy survive hydration",async()=>{
  const h=harness(fixture()),original=clone(h.live.completedCuttingJobs[0]);const action=copyUi(h);await action.promise;assert.equal(h.counts.commits,1);assert.equal(h.counts.writes,1);assert.equal(h.counts.suspensions,0);assert.ok(action.messages.includes("Active cutting job created"));
  const copy=h.live.cuttingJobs.find(j=>j.id==="active-copy"),past=h.live.completedCuttingJobs.find(j=>j.id==="one");assert.ok(copy);assert.notEqual(copy.id,past.id);assert.equal(copy.startISO,"2026-10-07");assert.equal(copy.costRate,47);for(const field of ["completedAtISO","completed","status","actualHours","efficiency","cutDateISO","cutOrderWithinDay","import_event_id","importProvenance"])assert.equal(Object.hasOwn(copy,field),false,field);for(const key of ["id","name","completedAtISO","files","manualLogs","importProvenance","notes","cat","projectNumber"])assert.deepEqual(past[key],original[key]);assert.deepEqual(harness(h.remote).live,h.live);
});
test("CJO-04B Make Active Copy Cancel performs zero writes",async()=>{const h=harness(fixture()),before=h.live,action=copyUi(h,{cancel:true});await action.promise;assert.equal(h.counts.writes,0);assert.deepEqual(h.live,before);});
test("CJO-04B Make Active Copy definite save failure creates no live phantom",async()=>{const h=harness(fixture(),{definiteError:true}),before=h.live,action=copyUi(h);await action.promise;assert.equal(h.counts.commits,0);assert.deepEqual(h.live,before);assert.equal(action.messages.includes("Active cutting job created"),false);});
test("CJO-04B missing active copy in server readback enters recovery and adopts no phantom",async()=>{
  const h=harness(fixture(),{readbackChange:s=>{s.cuttingJobs=s.cuttingJobs.filter(j=>j.id!=="active-copy");}}),before=h.live,action=copyUi(h);await action.promise;assert.equal(h.counts.commits,1);assert.equal(h.counts.suspensions,1);assert.deepEqual(h.live,before);assert.equal(action.messages.includes("Active cutting job created"),false);
});

test("CJO-04B nonfinite/null cost mismatch remains strict rather than JSON-normalized away",async()=>{
  const h=harness(fixture(),{readbackChange:s=>{s.completedCuttingJobs[0].actualHours=Number.NaN;}}),result=await run(h,completedDate("one","2026-10-06"));assert.equal(result.verified,false);assert.equal(result.indeterminate,true);assert.ok(result.verificationMismatchPaths.includes("$.completedCuttingJobs[0].actualHours"));
  assert.notEqual(model.durableStateKey(model.durableStateProjection({cost:null})),model.durableStateKey(model.durableStateProjection({cost:NaN})));
});
test("CJO-04B source changes during copy date selection stop before creation",async()=>{
  const h=harness(fixture()),action=copyUi(h,{changed:true});await action.promise;assert.equal(h.counts.writes,0);assert.equal(h.live.cuttingJobs.some(job=>job.id==="active-copy"),false);assert.ok(action.messages.some(message=>message.includes("completed job changed")));
});
