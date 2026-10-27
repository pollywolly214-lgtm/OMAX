"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {createTracker,bindIndicator}=require("../js/firebaseOperations");
const chronology=require("../js/cuttingJobChronology"),calendar=require("../js/maintenanceCalendarIntegrity");
const core=fs.readFileSync("js/core.js","utf8");
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function cursorDocument(label={textContent:""}){
  const classes=new Set(),documentElement={classList:{toggle(name,active){if(active)classes.add(name);else classes.delete(name);}}};
  return {documentElement,getElementById:()=>label,isBusy:()=>classes.has("firebase-busy")};
}

test("one pending operation attaches the busy class to html and clears on completion",async()=>{
  const tracker=createTracker(),gate=deferred(),label={textContent:""},document=cursorDocument(label);
  const unbind=bindIndicator(tracker,document);
  const result={saved:true},pending=tracker.run("saving",()=>gate.promise);
  assert.equal(document.isBusy(),true);assert.equal(label.textContent,"Saving...");
  gate.resolve(result);assert.equal(await pending,result);assert.equal(document.isBusy(),false);assert.equal(label.textContent,"");unbind();
});
test("overlap keeps the remaining type visible regardless of completion order",async()=>{
  for(const first of ["save","load"]){
    const tracker=createTracker(),save=deferred(),load=deferred();
    const document=cursorDocument();bindIndicator(tracker,document);
    const saving=tracker.run("saving",()=>save.promise),loading=tracker.run("loading",()=>load.promise);
    assert.deepEqual(tracker.snapshot(),{pending:2,label:"Working..."});
    (first==="save"?save:load).resolve();await (first==="save"?saving:loading);
    assert.deepEqual(tracker.snapshot(),{pending:1,label:first==="save"?"Loading...":"Saving..."});
    assert.equal(document.isBusy(),true);
    (first==="save"?load:save).resolve();await Promise.all([saving,loading]);assert.equal(tracker.snapshot().pending,0);
    assert.equal(document.isBusy(),false);
  }
});
test("rejection, synchronous throws, indeterminate results and presentation errors cannot leak tokens",async()=>{
  const tracker=createTracker(),document=cursorDocument();bindIndicator(tracker,document);tracker.subscribe(()=>{throw Error("broken view");});
  const error=Error("permission denied");
  await assert.rejects(tracker.run("saving",()=>{throw error;}),e=>e===error);
  const gate=deferred(),pending=tracker.run("updating",()=>gate.promise);gate.reject(error);await assert.rejects(pending,e=>e===error);
  const uncertain={saved:false,indeterminate:true,error:"Reload before retrying",requiresReload:true};
  assert.equal(await tracker.run("deleting",()=>uncertain),uncertain);assert.equal(tracker.snapshot().pending,0);assert.equal(document.isBusy(),false);
});
test("nested queue work reuses its explicit parent token until the parent settles",async()=>{
  const tracker=createTracker(),write=deferred(),readback=deferred();
  const pending=tracker.run("deleting",async token=>{
    await tracker.run("saving",()=>write.promise,token);
    await readback.promise;
  });
  assert.deepEqual(tracker.snapshot(),{pending:1,label:"Deleting..."});write.resolve();await tick();
  assert.deepEqual(tracker.snapshot(),{pending:1,label:"Deleting..."});readback.resolve();await pending;
  const registration=tracker.begin("loading");registration.release();registration.release();
  assert.equal(tracker.snapshot().pending,0);
});
test("repeated same-label transitions do not repeatedly rewrite the live status",async()=>{
  let writes=0,text="";const tracker=createTracker();
  bindIndicator(tracker,cursorDocument({get textContent(){return text;},set textContent(value){writes++;text=value;}}));
  const first=tracker.begin("saving"),second=tracker.begin("saving");first.release();assert.equal(writes,1);second.release();assert.equal(writes,2);
});
test("the real shared queue tracks waiting, verification, failures and parent ownership",async()=>{
  const operations=createTracker(),queueGate=deferred(),verification=deferred(),started=deferred();
  const c=vm.createContext({window:{OMAXFirebaseOperations:operations},debounce:fn=>fn,performCloudSave:async()=>{started.resolve();return verification.promise;}});
  const start=core.indexOf("const saveCloudInternal = debounce("),end=core.indexOf("\nfunction cloudSaveNoWriteFailure",start);
  vm.runInContext("let cloudSaveQueue=Promise.resolve();"+core.slice(start,end)+";this.save=saveCloudInternal;this.block=gate=>{cloudSaveQueue=gate;};",c);
  c.block(queueGate.promise);const pending=c.save();assert.equal(operations.snapshot().pending,1);
  queueGate.resolve();await started.promise;assert.equal(operations.snapshot().pending,1);
  verification.resolve({saved:true,verified:true});assert.equal((await pending).verified,true);assert.equal(operations.snapshot().pending,0);
  c.performCloudSave=()=>Promise.reject(Error("network"));await assert.rejects(c.save(),/network/);assert.equal(operations.snapshot().pending,0);
  c.performCloudSave=async()=>({saved:false,indeterminate:true,error:"Recovery review"});
  await operations.run("deleting",async token=>{const result=await c.save({firebaseOperationToken:token});assert.equal(result.error,"Recovery review");assert.deepEqual(operations.snapshot(),{pending:1,label:"Deleting..."});});
  assert.equal(operations.snapshot().pending,0);
});
for(const outcome of ["success","mismatch","rejected","indeterminate"]){
  test(`cutting-job coordinator retains status through actual verification: ${outcome}`,async()=>{
    const operations=createTracker(),gate=deferred(),verificationStarted=deferred();let remote={syncMeta:{rev:7},cuttingJobs:[{id:"a",cutDateISO:"2026-10-01",cutOrderWithinDay:1,cutNumber:"C001",files:[],manualLogs:[]}],completedCuttingJobs:[],inventory:[{id:"keep",qty:4}]};
    const protectedBefore=structuredClone(remote.inventory);let reads=0,suspension;
    const api=chronology.createMutationApi({operations,canWrite:()=>true,localVersion:()=>1,baselineMatches:()=>true,
      readState:async()=>{if(++reads>1){verificationStarted.resolve();await gate.promise;}return structuredClone(remote);},
      writeState:async next=>{
        if(outcome==="rejected")return {saved:false,definiteFailure:true,stateWriteAttempted:false,error:"Permission denied"};
        if(outcome==="indeterminate")return {saved:false,indeterminate:true,stateWriteAttempted:true,error:"Unknown commit; reload"};
        remote={...structuredClone(next),syncMeta:{rev:8}};const committedState=structuredClone(remote);
        if(outcome==="mismatch")remote.cuttingJobs[0].cutDateISO="2026-10-09";
        return {saved:true,stateWriteAttempted:true,stateWriteCompleted:true,committedState};
      },adoptVerifiedState:()=>true,suspend:result=>{suspension=result;}});
    const pending=api.save([{id:"a",cutDateISO:"2026-10-02",cutOrderWithinDay:1}],{expectedRevision:7});
    if(["success","mismatch"].includes(outcome)){await verificationStarted.promise;assert.equal(operations.snapshot().pending,1);gate.resolve();}
    const result=await pending;assert.equal(result.saved,outcome==="success",result.error);assert.equal(operations.snapshot().pending,0);
    assert.deepEqual(remote.inventory,protectedBefore);
    if(["mismatch","indeterminate"].includes(outcome)){assert.equal(suspension,result);assert.equal(result.requiresReload,true);}
  });
}
test("maintenance runner retains its parent registration through its extra server readback",async()=>{
  const operations=createTracker(),gate=deferred(),verifying=deferred();let revision=7,reads=0;
  const state={syncMeta:{rev:7},tasksInterval:[],tasksAsReq:[],maintenanceTasksV2:[],maintenanceCalendarInstancesV2:[],maintenanceOccurrencesV2:[],inventory:[{id:"keep",qty:9}]};
  const runner=calendar.createMutationRunner({operations,state:()=>structuredClone(state),canWrite:()=>true,loadedRevision:()=>revision,
    readCloud:async()=>{if(++reads===2){verifying.resolve();await gate.promise;}return structuredClone(state);},
    save:async options=>operations.run("saving",async()=>{assert.equal(operations.snapshot().pending,1);revision=8;state.syncMeta.rev=8;return {saved:true,stateWriteCompleted:true};},options.firebaseOperationToken),
    apply:(name,value)=>{state[name]=value;},suspend:reason=>assert.fail(reason)});
  const pending=runner(()=>{state.maintenanceTasksV2.push({id:"new-task",name:"Inspect"});return "created";});
  await verifying.promise;assert.equal(operations.snapshot().pending,1);gate.resolve();assert.equal((await pending).saved,true);assert.equal(operations.snapshot().pending,0);assert.deepEqual(state.inventory,[{id:"keep",qty:9}]);
});
test("cloud loading releases on authoritative adoption, Recovery Mode and network failure",async()=>{
  const start=core.indexOf("async function loadFromCloud("),end=core.indexOf("\nasync function migrateLegacyWorkspaceDoc",start);
  for(const mode of ["loaded","missing","network"]){
    const operations=createTracker(),gate=deferred(),window={OMAXFirebaseOperations:operations};let diagnostics=0;
    const c=vm.createContext({window,FB:{ready:true,docRef:{get:()=>gate.promise}},setCloudLoadGate(){},stateHasMeaningfulData:()=>true,adoptIdentityCheckedAuthoritativeState:()=>({loaded:true}),enterMissingStateRecovery(){diagnostics++;},renderRecoveryDiagnosticsPanel(){diagnostics++;},console:{error(){}}});
    vm.runInContext(core.slice(start,end),c);const pending=c.loadFromCloud();assert.equal(operations.snapshot().label,"Loading...");
    if(mode==="network")gate.reject(Error("offline"));else gate.resolve({exists:mode==="loaded",data:()=>({id:"evidence"})});
    await pending;assert.equal(operations.snapshot().pending,0);assert.equal(diagnostics,mode==="loaded"?0:1);
    if(mode==="network")assert.equal(window.__recoveryInspectMode,true);
  }
});
test("passive listeners, cache reads and housekeeping do not own registrations",()=>{
  const start=core.indexOf("function startWorkspaceStateListener("),end=core.indexOf("\nfunction ",start+10);
  assert.ok(start>=0&&end>start);assert.doesNotMatch(core.slice(start,end),/OMAXFirebaseOperations|firebaseOperation/);
  assert.doesNotMatch(fs.readFileSync("js/cloudFilePresentation.js","utf8"),/OMAXFirebaseOperations/);
  const html=fs.readFileSync("index.html","utf8");assert.equal((html.match(/id="firebaseOperationStatus"/g)||[]).length,1);
  assert.ok(html.indexOf('id="firebaseOperationStatus"')<html.indexOf('<main id="content"'));
  assert.ok(html.indexOf('id="firebaseOperationStatus"')>html.indexOf('</header>'));
  assert.doesNotMatch(html,/firebase-operation-spinner/);
  assert.ok(html.indexOf('src="js/firebaseOperations.js"')<html.indexOf('src="js/core.js"'));
});
test("cursor binding works without status markup and projects already pending work",async()=>{
  const tracker=createTracker(),registration=tracker.begin("saving"),document=cursorDocument(null);
  bindIndicator(tracker,document);assert.equal(document.isBusy(),true);registration.release();assert.equal(document.isBusy(),false);
});
test("Storage upload boundary covers membership and final metadata verification, including failures",async()=>{
  for(const failed of [false,true]){
    const operations=createTracker(),membership=deferred(),upload=deferred(),started=deferred();
    const window={OMAXFirebaseOperations:operations,Cfr04WorkspaceMetadata:{membershipPath:()=>"fixture/member",validateWorkspaceMembershipRecord:()=>({valid:true})},cfr05CloudCuttingFiles:{upload:()=>{started.resolve();return upload.promise;}}};
    const c=vm.createContext({window,canWriteCloud:()=>true,WORKSPACE_ID:"fixture",FB:{user:{uid:"operator"},db:{doc:()=>({get:()=>membership.promise})}}});
    const start=core.indexOf("window.uploadCfr05CuttingFile = async function("),end=core.indexOf("\n};",start);
    vm.runInContext(core.slice(start,end+3),c);const pending=window.uploadCfr05CuttingFile("job",{});
    assert.equal(operations.snapshot().pending,1);membership.resolve({exists:true,data:()=>({active:true,role:"owner"})});await started.promise;
    assert.equal(operations.snapshot().pending,1);
    if(failed){upload.reject(Error("metadata verification failed"));await assert.rejects(pending,/metadata verification failed/);}
    else{const result={completed:{storageUpload:true,finalVerification:true}};upload.resolve(result);assert.equal(await pending,result);}
    assert.equal(operations.snapshot().pending,0);
  }
});
test("a blocked Recovery Mode entry and a thrown preflight both release direct save registrations",async()=>{
  const start=core.indexOf("async function saveWaterQualityCheck("),end=core.indexOf("\nwindow.saveWaterQualityCheck=",start),operations=createTracker();
  const c=vm.createContext({window:{OMAXFirebaseOperations:operations},FB:{ready:false}});vm.runInContext(core.slice(start,end),c);
  const blocked=await c.saveWaterQualityCheck({});assert.equal(blocked.saved,false);assert.match(blocked.error,/recovery review/);assert.equal(operations.snapshot().pending,0);
  c.FB.ready=true;c.FB.user={uid:"operator"};c.isVercelPreviewRuntime=()=>false;c.canWriteCloud=()=>true;c.cloneStructured=()=>{throw Error("preflight threw");};
  await assert.rejects(c.saveWaterQualityCheck({}),/preflight threw/);assert.equal(operations.snapshot().pending,0);
});
