"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {harness}=require("./mdel01-harness.cjs"),{fixture}=require("./fixtures/mdel01-maintenance-task");
const identity=require("../js/globalIdentityRepair"),atomic=require("../js/atomicPersistence"),firewall=require("../js/cuttingFileContentFirewall"),integrity=require("../js/maintenanceCalendarIntegrity");
const clone=structuredClone,core=fs.readFileSync("js/core.js","utf8"),calendar=fs.readFileSync("js/calendar.js","utf8");
function fn(source,name){const start=source.search(new RegExp("^(?:async )?function "+name+"\\(","m"));assert.ok(start>=0,name);return source.slice(start,source.indexOf("\n}",start)+2);}
function listenerHarness(){
  let callback,recovery=0,adopts=0,loads=0;const window={location:{search:""},__recoveryInspectMode:false};
  const c=vm.createContext({window,FB:{ready:true,docRef:{onSnapshot:cb=>{callback=cb;return()=>{};}}},workspaceStateUnsubscribe:null,
    getCloudSyncClientId:()=>"fixture",isRecoveryMode:()=>window.__recoveryInspectMode,lastAppliedCloudRevision:10,lastLocalMutationAt:0,hasPendingLocalChanges:false,
    stateHasMeaningfulData:s=>!!s?.inventory?.length,checkAuthoritativeIdentityIntegrity:s=>identity.integrity(s),
    enterMissingStateRecovery:()=>{window.__recoveryInspectMode=true;recovery++;},loadFromCloud:async()=>{loads++;},
    adoptIdentityCheckedAuthoritativeState:()=>{adopts++;},console,setTimeout,clearTimeout});
  vm.runInContext(fn(core,"startWorkspaceStateListener"),c);c.startWorkspaceStateListener();
  return{c,window,emit:(state,metadata={fromCache:false,hasPendingWrites:false})=>callback({exists:state!==null,data:()=>clone(state),metadata}),get loads(){return loads;},get recovery(){return recovery;},get adopts(){return adopts;}};
}
test("obsolete invalid listener revision cannot suspend a newer valid loaded session",()=>{
  const h=listenerHarness(),old=fixture();old.syncMeta.rev=9;old.inventory[0].linkedTaskId="missing";h.emit(old);
  assert.equal(h.window.__recoveryInspectMode,false);assert.equal(h.loads,0);assert.equal(h.adopts,0);
});
for(const metadata of [{fromCache:true,hasPendingWrites:false},{fromCache:false,hasPendingWrites:true}])test("unconfirmed listener cannot turn cached absence or corruption into recovery "+JSON.stringify(metadata),()=>{
  const h=listenerHarness();h.emit(null,metadata);const bad=fixture();bad.syncMeta.rev=11;bad.inventory[0].linkedTaskId="missing";h.emit(bad,metadata);
  assert.equal(h.recovery,0);assert.equal(h.loads,0);assert.equal(h.adopts,0);assert.equal(h.window.__recoveryInspectMode,false);
});
test("new authoritative invalid references and missing state still suspend; valid newer state adopts",()=>{
  const h=listenerHarness(),bad=fixture();bad.syncMeta.rev=11;bad.inventory[0].linkedTaskId="missing";h.emit(bad);assert.equal(h.loads,1);assert.equal(h.window.__recoveryInspectMode,true);
  const missing=listenerHarness();missing.emit(null);assert.equal(missing.recovery,1);
  const valid=listenerHarness(),next=fixture();next.syncMeta.rev=11;valid.emit(next);assert.equal(valid.adopts,1);
});
test("equal revision invalid echo is ignored and separate recovery is never cleared",()=>{
  const h=listenerHarness(),state=fixture();state.syncMeta.rev=10;state.inventory[0].linkedTaskId="missing";h.emit(state);assert.equal(h.loads,0);
  h.window.__recoveryInspectMode=true;state.syncMeta.rev=11;state.inventory[0].linkedTaskId="fixture-task-A";h.emit(state);assert.equal(h.adopts,0);assert.equal(h.window.__recoveryInspectMode,true);
});
for(const rev of [-1,"9",9.5])test("invalid authoritative revision cannot masquerade as an obsolete snapshot: "+JSON.stringify(rev),()=>{
  const h=listenerHarness(),state=fixture();state.syncMeta.rev=rev;h.emit(state);assert.equal(h.loads,1);assert.equal(h.window.__recoveryInspectMode,true);
});

// Real production runner adapter, read-only backend helper and atomic writer.
// document.get deliberately retains the pre-commit listener view.
function calendarHarness(options={}){
  let cloud=fixture(),local=clone(cloud),listener=clone(cloud),commits=0,reads=0,gets=0,suspensions=[];
  const snapshot=state=>({exists:true,data:()=>clone(state)});
  const db={async runTransaction(callback){let queued;const result=await callback({get:async()=>{reads++;if(commits&&options.readFailure)throw Error("backend unavailable");const state=clone(cloud);if(commits)options.readback?.(state);return snapshot(state);},set:(_ref,state)=>{queued=clone(state);}});if(queued){if(options.reject)throw Object.assign(Error("denied"),{code:"permission-denied"});cloud=queued;commits++;if(options.loseAck)throw Error("ack lost");}return result;}};
  const ref={path:"workspaces/fixture/app/state",firestore:db,get:async()=>{gets++;return snapshot(listener);}};
  const window={OMAXMaintenanceCalendarIntegrity:integrity,__loadedCloudRevisionForSaveGuard:7};
  const c=vm.createContext({window,FB:{ready:true,user:{uid:"fixture"},app:{options:{projectId:"fixture"}},db,docRef:ref},
    snapshotState:()=>clone(local),compactStateForStorage:s=>s,readCurrentCloudStateReadOnly:async()=>(await ref.get({source:"server"})).data(),
    canWriteCloud:()=>!suspensions.length&&!window.separateBlocker,refreshGlobalCollections(){for(const field of ["maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2"])if(window[field])local[field]=clone(window[field]);},undoStack:[],redoStack:[],currentSnapshotJSON:"before",
    persistLocalStateBackup(){},renderRecoveryDiagnosticsPanel(){},saveCloudNow:async saveOptions=>{
      assert.equal(saveOptions.authoritativeTarget.docRef,ref,"The captured read target must reach the save queue");
      const result=await atomic.save({db,docRef:ref,state:clone(local),expectedRevision:saveOptions.expectedRevision,scan:firewall.scanCuttingFileContent,clientId:"fixture",now:()=>100+commits});
      if(result.saved){local=clone(result.committedState);window.__loadedCloudRevisionForSaveGuard=local.syncMeta.rev;}
      return result;
    }});
  vm.runInContext(["captureCuttingJobSaveTarget","cuttingJobSaveTargetIsCurrent","readMaintenanceTaskAuthoritativeState"].map(name=>fn(core,name)).join("\n"),c);
  const start=core.indexOf("window.runMaintenanceCalendarMutation =");vm.runInContext(core.slice(start,core.indexOf("window.inspectMaintenanceCalendarIntegrity",start)),c);
  const originalSuspend=c.window.runMaintenanceCalendarMutation;
  // Observe the adapter's actual suspension state, without replacing its runner.
  const run=async change=>{const result=await originalSuspend(change);if(window.__lastImportVerificationError)suspensions.push(window.__lastImportVerificationError);return result;};
  return{c,window,run,add:()=>run(()=>{local.maintenanceOccurrencesV2.unshift({...clone(local.maintenanceOccurrencesV2[1]),id:"removed-"+commits,eventType:"removed"});return true;}),get cloud(){return clone(cloud);},get commits(){return commits;},get reads(){return reads;},get gets(){return gets;},get suspended(){return !!window.__recoveryInspectMode;},get local(){return clone(local);}};
}
test("calendar cancellation uses independent backend readback despite stale v8 server-get, then saves again",async()=>{
  const h=calendarHarness(),before=h.cloud,r=await h.add();assert.equal(r.saved,true,r.error);assert.equal(h.suspended,false);assert.equal(h.commits,1);assert.equal(h.gets,0);assert.equal(h.reads,3);assert.ok(h.cloud.syncMeta.rev>before.syncMeta.rev);
  assert.deepEqual(h.cloud.maintenanceOccurrencesV2.slice(1),before.maintenanceOccurrencesV2);
  for(const key of Object.keys(before).filter(key=>!["syncMeta","maintenanceOccurrencesV2"].includes(key)))assert.deepEqual(h.cloud[key],before[key],key);
  assert.equal((await h.add()).saved,true);assert.equal(h.commits,2);assert.equal(identity.integrity(h.cloud).valid,true);
});
for(const [name,options]of [["old revision",{readback:s=>s.syncMeta.rev=7}],["newer unrelated commit",{readback:s=>s.syncMeta.rev++}],["backend read failure",{readFailure:true}],["lost acknowledgement",{loseAck:true}]])test("calendar "+name+" remains uncertain without duplicate writes",async()=>{
  const h=calendarHarness(options),r=await h.add();assert.equal(r.saved,false);assert.equal(r.indeterminate,true);assert.equal(h.suspended,true);assert.equal(h.commits,1);await h.add();assert.equal(h.commits,1);
});
test("calendar permission rejection remains an ordinary failure without writes",async()=>{
  const h=calendarHarness({reject:true}),before=h.local,r=await h.add();assert.equal(r.saved,false);assert.equal(h.commits,0);assert.equal(h.suspended,false);assert.deepEqual(h.local,before);
});
for(const name of ["actor","backend","separate recovery"])test("calendar preserves uncertainty and independent blockers when "+name+" changes during readback",async()=>{
  const h=calendarHarness({readback:()=>{if(name==="actor")h.c.FB.user.uid="other";else if(name==="backend")h.c.FB.app.options.projectId="other";else h.window.separateBlocker=true;}}),r=await h.add();
  assert.equal(r.saved,false);assert.equal(r.indeterminate,true);assert.equal(h.suspended,true);assert.equal(h.commits,1);
});
test("calendar does not replace its acknowledged revision with a newer listener revision during readback",async()=>{
  const h=calendarHarness({readback:state=>{state.syncMeta.rev++;h.window.__loadedCloudRevisionForSaveGuard=state.syncMeta.rev;}}),r=await h.add();
  assert.equal(r.saved,false);assert.equal(r.indeterminate,true);assert.equal(h.suspended,true);assert.equal(h.commits,1);
});

test("calendar popup display helpers cannot mutate history, recurrence or occurrence maps",()=>{
  const source=fixture(),task=source.tasksInterval[0],before=clone(source),bubble={querySelector:()=>null,addEventListener(){}};
  const c=vm.createContext({window:{...source,OMAXMaintenanceTaskArchive:require("../js/maintenanceTaskArchive")},findCalendarTaskMeta:()=>({task,mode:"interval"}),
    normalizeDateKey:value=>value,parseDateLocal:()=>null,escapeHtml:String,configuredTaskDurationDailyHours:()=>8,formatCalendarDayHours:String,
    ensureTaskManualHistory:value=>{value.manualHistory[0].estimatedDailyHours=8;return value.manualHistory;},
    getOccurrenceNoteForTask:value=>{value.occurrenceNotes={};return "";},getOccurrenceHoursForTask:()=>null,
    nextDue:value=>{value.recurrence.completionAnchorHours=0;return null;},getTaskRecurrence:value=>{value.recurrence.extra="display only";return value.recurrence;},makeBubble:()=>bubble});
  vm.runInContext(fn(calendar,"showTaskBubble"),c);c.showTaskBubble(task.id,null, {dateISO:"2026-10-01"});assert.deepEqual(source,before);
});
test("archiving selected template retains every legacy descendant, identity and inventory link",async()=>{
  const source=fixture(),parent=source.tasksInterval[0];for(let i=0;i<10;i++){
    const id="child-"+i;source.tasksInterval.push({...clone(parent),id,variant:"instance",templateId:parent.id,parentTask:parent.id,inventoryId:"stock-"+i});
    source.inventory.push({id:"stock-"+i,linkedTaskId:id,qty:1});
  }
  const h=harness({initial:source}),r=await h.api.remove(parent.id);assert.equal(r.verified,true,r.error);assert.equal(h.commits,1);
  assert.deepEqual(h.cloud.tasksInterval,source.tasksInterval.slice(1));assert.deepEqual(h.cloud.inventory,source.inventory);assert.equal(identity.integrity(h.cloud).valid,true);
});

test("F12 diagnostic uses only backend reads and leaves application/storage evidence unchanged",async()=>{
  const h=harness({staleListener:true}),source=h.cloud,before=clone(h.window.__lastLoadedCloudState),flags=JSON.stringify(Object.fromEntries(Object.entries(h.window).filter(([name])=>name.startsWith("__"))));let logs=0;
  h.context.location={href:"https://fixture.example/"};h.context.document={scripts:[{src:"https://fixture.example/js/core.js"}],querySelectorAll:()=>[]};h.context.console={log:()=>logs++};
  h.context.localStorage={setItem(){throw Error("Diagnostic must not write storage");},removeItem(){throw Error("Diagnostic must not remove storage");}};
  const result=await vm.runInContext(fs.readFileSync("docs/RFS-01-read-only-diagnostic.js","utf8"),h.context);
  assert.equal(result.authoritative.confirmed,true);assert.equal(result.authoritative.revision,7);assert.equal(result.identity.valid,true);assert.equal(h.documentReads,0);assert.equal(h.commits,0);assert.equal(h.writeTransactions,0);assert.equal(h.readTransactions,1);assert.equal(logs,1);
  assert.deepEqual(h.cloud,source);assert.deepEqual(h.window.__lastLoadedCloudState,before);assert.equal(JSON.stringify(Object.fromEntries(Object.entries(h.window).filter(([name])=>name.startsWith("__")))),flags);
});
test("normal save queue rejects a captured calendar actor change before snapshot preparation",async()=>{
  const h=harness(),before=h.cloud,target=h.context.captureCuttingJobSaveTarget();h.context.FB.user.uid="other-actor";
  vm.runInContext(fn(core,"cloudSaveNoWriteFailure")+"\n"+fn(core,"performCloudSave"),h.context);
  const result=await h.context.performCloudSave({authoritativeTarget:target});assert.equal(result.errorCode,"maintenance_target_changed");assert.equal(result.saved,false);assert.equal(h.commits,0);assert.deepEqual(h.cloud,before);
});

test("calendar Remove task archives the exact selected definition through real protected CAS/adoption",async()=>{
  const h=harness({staleListener:true}),before=h.cloud,messages=[];h.window.confirm=()=>true;h.context.toast=message=>messages.push(message);
  vm.runInContext(fn(calendar,"archiveCalendarTask"),h.context);
  const result=await h.context.archiveCalendarTask(before.tasksInterval[0]);assert.equal(result,true);assert.equal(h.commits,1);assert.equal(h.window.__recoveryInspectMode,false);
  assert.deepEqual(h.cloud.deletedItems[0].payload,before.tasksInterval[0]);assert.deepEqual(h.cloud.tasksInterval,[before.tasksInterval[1]]);assert.ok(messages.includes("Task archived"));
  for(const field of Object.keys(before).filter(name=>!["syncMeta","tasksInterval","deletedItems"].includes(name)))assert.deepEqual(h.cloud[field],before[field],field);
});
for(const options of [{cancel:true},{reject:true},{loseAck:true}])test("calendar archive does not acknowledge cancel/rejection/uncertainty "+JSON.stringify(options),async()=>{
  const h=harness(options),messages=[];h.window.confirm=()=>!options.cancel;h.context.toast=message=>messages.push(message);
  vm.runInContext(fn(calendar,"archiveCalendarTask"),h.context);assert.equal(await h.context.archiveCalendarTask(h.cloud.tasksInterval[0]),false);assert.ok(!messages.includes("Task archived"));assert.equal(h.commits,options.loseAck?1:0);
});
