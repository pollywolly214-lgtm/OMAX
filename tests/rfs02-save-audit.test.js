"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs");
const {harness}=require("./rfs02-normal-harness.cjs"),identity=require("../js/globalIdentityRepair");
const core=fs.readFileSync("js/core.js","utf8"),calendar=fs.readFileSync("js/calendar.js","utf8"),clone=structuredClone;
const business=state=>Object.fromEntries(Object.entries(state).filter(([key])=>!["syncMeta","saveMeta","syncProcessLog"].includes(key)));
function wrap(h,options={}){
  const db=h.context.FB.db,run=db.runTransaction.bind(db);
  db.runTransaction=callback=>run(async tx=>callback({...tx,get:async ref=>{
    if(h.commits&&options.unavailable)throw Error("backend read unavailable after acknowledged commit");
    const snap=await tx.get(ref),state=snap.data();
    if(h.commits)options.readback?.(state,h);
    return {...snap,data:()=>state,...(h.commits&&options.metadata?{metadata:options.metadata}:{})};
  }}));
  const get=h.context.FB.docRef.get.bind(h.context.FB.docRef),initial=h.cloud;
  if(options.staleListener)h.context.FB.docRef.get=async()=>({exists:true,data:()=>clone(initial),metadata:{fromCache:false,hasPendingWrites:false}});
  return get;
}
const cases=[
  ["maintenance configuration","tasksInterval",w=>w.tasksInterval.push({id:"task-a",name:"Synthetic",interval:40,completedDates:[],manualHistory:[]}),w=>w.tasksInterval[0].interval=80],
  ["inventory stock","inventory",w=>w.inventory[0].qtyNew=5,w=>w.inventory[0].qtyNew=6],
  ["purchase history","receiptTrackerWeeks",w=>w.receiptTrackerWeeks.push({key:"2026-W43",rows:[{id:"row-a",dateISO:"2026-10-23",purchased:"Synthetic",qty:1,cost:5}]}),w=>w.receiptTrackerWeeks[0].rows[0].qty=2],
  ["daily hours","dailyCutHours",w=>w.dailyCutHours.push({dateISO:"2026-10-23",hours:2,source:"manual"}),w=>w.dailyCutHours[0].hours=3],
  ["job manual log","cuttingJobs",w=>w.cuttingJobs[0].manualLogs.push({id:"log-a",dateISO:"2026-10-23",completedHours:1}),w=>w.cuttingJobs[0].manualLogs[0].completedHours=2],
  ["pump/RPM history","pumpEff",w=>w.pumpEff={baselineRPM:3500,entries:[{id:"rpm-a",dateISO:"2026-10-23",rpm:3400,timeISO:"08:00"}]},w=>w.pumpEff.entries[0].rpm=3450],
  ["calendar V2 definition","maintenanceTasksV2",w=>w.maintenanceTasksV2.push({id:"v2-a",name:"Synthetic"}),w=>w.maintenanceTasksV2[0].name="Edited"],
];
for(const [name,field,create,edit]of cases)test(name+": real ordinary save independently verifies exact scoped delta and subsequent edit/reload",async()=>{
  const h=harness(),before=h.cloud;wrap(h,{staleListener:true});create(h.window);
  const expected=clone(h.window[field]),r=await h.context.saveCloudNow();assert.equal(r.saved,true,r.error);assert.equal(r.verified,true);assert.equal(h.commits,1);assert.equal(h.reads,0);assert.ok(h.cloud.syncMeta.rev>before.syncMeta.rev);
  assert.deepEqual(h.cloud[field],expected);for(const key of Object.keys(business(before)).filter(key=>key!==field))assert.deepEqual(h.cloud[key],before[key],key);
  h.reload();assert.deepEqual(clone(h.window[field]),expected);edit(h.window);const second=await h.context.saveCloudNow();assert.equal(second.verified,true,second.error);assert.equal(h.commits,2);h.reload();assert.deepEqual(clone(h.window[field]),h.cloud[field]);
  assert.equal(h.window.__recoveryInspectMode,undefined);assert.equal(h.window.__autosaveDisabled,undefined);
});
for(const [name,options]of [["failed read",{unavailable:true}],["cached evidence",{metadata:{fromCache:true,hasPendingWrites:false}}],["pending evidence",{metadata:{fromCache:false,hasPendingWrites:true}}],["wrong revision",{readback:s=>s.syncMeta.rev++}],["unrelated protected mismatch",{readback:s=>s.inventory[0].note="changed"}],["wrong actor",{readback:(_s,h)=>h.context.FB.user.uid="other"}],["separate blocker",{readback:(_s,h)=>{h.window.__recoveryInspectMode=true;h.window.__lastIndeterminateSave={error:"separate"};}}]])test("acknowledged ordinary "+name+" cannot become false success or retry",async()=>{
  const h=harness(),loaded=clone(h.window.__lastLoadedCloudState);wrap(h,options);h.window.inventory[0].qtyNew=5;
  const r=await h.context.saveCloudNow();assert.equal(r.saved,false);assert.equal(r.stateWriteCompleted,true);assert.equal(r.indeterminate,true);assert.equal(h.commits,1);assert.equal(h.window.__autosaveDisabled,true);assert.deepEqual(h.window.__lastLoadedCloudState,loaded);assert.equal((await h.context.saveCloudNow()).saved,false);assert.equal(h.commits,1);
  if(name==="separate blocker")assert.equal(h.window.__lastIndeterminateSave.error,"separate");
});
for(const [name,options]of [["permission denied",{writeError:Object.assign(Error("denied"),{code:"permission-denied"})}],["lost acknowledgement",{loseAcknowledgement:true}]])test("ordinary "+name+" retains exact classification and source evidence",async()=>{
  const h=harness(undefined,undefined,options),before=h.cloud;h.window.inventory[0].qtyNew=9;const r=await h.context.saveCloudNow();assert.equal(r.saved,false);
  if(name==="permission denied"){assert.equal(r.indeterminate,false);assert.deepEqual(h.cloud,before);assert.equal(h.commits,0);}else{assert.equal(r.indeterminate,true);assert.equal(h.commits,1);assert.equal(h.window.__autosaveDisabled,true);}
});
test("ordinary preflight reads are independent and captured actor changes cause zero writes",async()=>{
  const h=harness(),read=h.context.readMaintenanceTaskAuthoritativeState;h.context.readMaintenanceTaskAuthoritativeState=async target=>{const value=await read(target);h.context.FB.user.uid="other";return value;};
  h.window.inventory[0].qtyNew=6;const r=await h.context.saveCloudNow();assert.equal(r.saved,false);assert.equal(h.commits,0);assert.equal(h.reads,0);
});
test("late metadata bookkeeping cannot replace a newer independently adopted listener baseline",async()=>{
  const h=harness();h.context.FB.workspaceDoc={};h.context.lastSaveLogWriteAt=Date.now();h.context.SAVE_LOG_THROTTLE_MS=60000;
  h.context.updateWorkspaceMetadata=async()=>{
    h.alterCloud(state=>{state.syncMeta.rev++;state.inventory[0].note="newer remote evidence";});
    h.window.__lastLoadedCloudState=h.cloud;h.window.__loadedCloudRevisionForSaveGuard=h.cloud.syncMeta.rev;
  };
  h.window.inventory[0].qtyNew=5;const result=await h.context.saveCloudNow();assert.equal(result.verified,true,result.error);assert.deepEqual(h.window.__lastLoadedCloudState,h.cloud);assert.equal(h.window.__loadedCloudRevisionForSaveGuard,h.cloud.syncMeta.rev);
});

test("newer independently adopted state during readback retains its revision and permits the next save",async()=>{
  const h=harness();let advanced=false;
  wrap(h,{readback:(_state,current)=>{if(advanced)return;advanced=true;current.alterCloud(state=>{state.syncMeta.rev++;state.inventory[0].note="newer during readback";});current.reload();current.window.__lastLoadedCloudState=current.cloud;current.window.__loadedCloudRevisionForSaveGuard=current.cloud.syncMeta.rev;vm.runInContext("lastAppliedCloudRevision=window.__loadedCloudRevisionForSaveGuard",current.context);}});
  h.window.inventory[0].qtyNew=5;const result=await h.context.saveCloudNow();assert.equal(result.verified,true,result.error);
  assert.deepEqual(h.window.__lastLoadedCloudState,h.cloud);assert.equal(h.window.__loadedCloudRevisionForSaveGuard,h.cloud.syncMeta.rev);assert.equal(vm.runInContext("lastAppliedCloudRevision",h.context),h.cloud.syncMeta.rev);
  h.window.inventory[0].qtyNew=6;const next=await h.context.saveCloudNow();assert.equal(next.verified,true,next.error);assert.equal(h.commits,2);assert.equal(h.cloud.inventory[0].note,"newer during readback");
});
test("cancellation UI without a writable coordinator preserves source evidence",async()=>{
  const window={tasksInterval:[{id:"task",completedDates:["2026-10-23"],manualHistory:[{dateISO:"2026-10-23",status:"completed"}]}],maintenanceCalendarInstancesV2:[{id:"repeat",status:"active"}]},before=clone(window),messages=[];
  const c=vm.createContext({window,toast:message=>messages.push(message)}),start=calendar.indexOf("async function runVerifiedCalendarCancellation"),end=calendar.indexOf("function removeCalendarTaskEverywhere",start);
  vm.runInContext(calendar.slice(start,end),c);for(const scope of ["single","future","all"])assert.equal((await c.removeCalendarTaskOccurrences({task:window.tasksInterval[0]},"2026-10-23",scope)).saved,false);
  const stop=calendar.indexOf("\nwindow.stopV2RepeatTracking =")+1;vm.runInContext(calendar.slice(stop,calendar.indexOf("\n};",stop)+3),c);assert.equal((await window.stopV2RepeatTracking("repeat","task","2026-11-01","repeat:repeat:2026-11-01")).saved,false);delete window.stopV2RepeatTracking;
  assert.deepEqual(window,before);assert.equal(messages.length,4);assert.ok(messages.every(message=>/unavailable/.test(message)));
});
test("read-only health diagnostic reports scope without mutating gates or writing",async()=>{
  const h=harness(),c=h.context,before=h.cloud;h.window.OMAXGlobalIdentityRepair=identity;h.window.OMAXMaintenanceTaskArchive=require("../js/maintenanceTaskArchive");h.window.location={};
  c.location={href:"https://synthetic.invalid/"};c.document={scripts:[],querySelectorAll:()=>[]};c.console={log(){},error(){},warn(){},info(){}};
  const flags=JSON.stringify(Object.fromEntries(Object.entries(h.window).filter(([key])=>key.startsWith("__"))));
  const report=await vm.runInContext(fs.readFileSync("docs/RFS-02-read-only-health.js","utf8"),c);
  assert.equal(report.authoritative.confirmed,true);assert.match(report.health.scope,/mutation reliability remains UNTESTED/);assert.ok(["PASS","WARNING","FAIL"].includes(report.health.status));assert.equal(h.commits,0);assert.deepEqual(h.cloud,before);assert.equal(JSON.stringify(Object.fromEntries(Object.entries(h.window).filter(([key])=>key.startsWith("__")))),flags);
});
