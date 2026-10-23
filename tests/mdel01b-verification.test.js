"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm");
const {harness}=require("./mdel01-harness.cjs");
for(const staleListener of [false,true])test("MDEL-01B acknowledged deletion adopts exact backend state with "+(staleListener?"stale server-get listener":"fresh listener"),async()=>{
  const h=harness({staleListener}),before=h.cloud,result=await h.api.remove("fixture-task-A");
  assert.equal(h.commits,1);assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);assert.equal(result.indeterminate,false);
  assert.equal(h.window.__recoveryInspectMode,false);assert.equal(h.window.__autosaveDisabled,false);assert.equal(h.window.__lastIndeterminateSave,undefined);assert.equal(h.diagnostics,0);
  assert.equal(h.readTransactions,2);assert.equal(h.writeTransactions,1);assert.equal(h.documentReads,0);assert.deepEqual(h.local,h.cloud);
  assert.equal(h.cloud.deletedItems.filter(entry=>entry.payload?.id==="fixture-task-A").length,1);assert.deepEqual(h.cloud.deletedItems[0].payload,before.tasksInterval[0]);assert.deepEqual(h.cloud.inventory,before.inventory);assert.deepEqual(h.cloud.tasksInterval,[before.tasksInterval[1]]);
  const listener=(await h.context.FB.docRef.get({source:"server"})).data();assert.equal(listener.syncMeta.rev,staleListener?before.syncMeta.rev:h.cloud.syncMeta.rev);
  const reloaded=harness({initial:h.cloud});assert.deepEqual(reloaded.local,h.local);assert.equal(reloaded.window.__recoveryInspectMode,false);assert.equal(reloaded.window.__autosaveDisabled,false);assert.equal(reloaded.commits,0);
});
for(const [name,options]of [["permission rejection",{reject:true}],["revision conflict",{conflict:true}]])test("MDEL-01B "+name+" does not adopt or retry",async()=>{
  const h=harness(options),before=h.local,result=await h.api.remove("fixture-task-A");assert.equal(result.saved,false);assert.equal(result.definiteFailure,true);assert.equal(h.commits,0);assert.equal(h.writeTransactions,1);assert.deepEqual(h.local,before);assert.equal(h.window.__lastIndeterminateSave,undefined);
});
for(const options of [{loseAck:true},{unknownWithoutCommit:true},{readFailure:true}])test("MDEL-01B uncertain write/readback remains suspended without retry "+JSON.stringify(options),async()=>{
  const h=harness(options),before=h.local,result=await h.api.remove("fixture-task-A");assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.equal(h.window.__recoveryInspectMode,true);assert.equal(h.window.__autosaveDisabled,true);assert.equal(h.writeTransactions,1);assert.deepEqual(h.local,before);await h.api.remove("fixture-task-A");assert.equal(h.writeTransactions,1);
});
for(const [name,options]of [
  ["local mutation after commit",{duringVerification:({context})=>vm.runInContext("lastLocalMutationAt++",context)}],
  ["loaded revision after commit",{duringVerification:({window})=>window.__loadedCloudRevisionForSaveGuard++}],
  ["local task data after commit",{duringVerification:({window})=>window.inventory[0].qty++}],
  ["workspace after commit",{duringVerification:({context})=>context.FB.app.options.projectId="different-project"}],
  ["newer remote commit",{readbackMutation:s=>s.syncMeta.rev++}],
  ["older remote revision",{readbackMutation:s=>s.syncMeta.rev=7}],
  ["different archived ID",{readbackMutation:s=>s.deletedItems[0].payload.id="other-task"}],
  ["unrelated inventory change",{readbackMutation:s=>s.inventory[1].qty++}],
  ["unrelated recovery blocker",{duringVerification:({window})=>window.__globalIdentityVerificationPending=true}],
  ["another uncertain save",{duringVerification:({window})=>window.__lastIndeterminateSave={error:"unrelated"}}],
  ["explicit read-only mode",{duringVerification:({window})=>{window.__recoveryInspectMode=true;window.__autosaveDisabled=true;}}],
  ["adoption initialization failure",{adoptionFailure:true}]
])test("MDEL-01B refuses "+name+" instead of mistaking it for expected deletion",async()=>{
  const h=harness(options),result=await h.api.remove("fixture-task-A");assert.equal(h.commits,1);assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.equal(h.window.__recoveryInspectMode,true);assert.equal(h.window.__autosaveDisabled,true);assert.equal(h.writeTransactions,1);assert.equal(h.cloud.deletedItems.length,1);
  if(name==="another uncertain save")assert.equal(h.window.__lastIndeterminateSave.error,"unrelated");
});
test("MDEL-01B independent backend reads cannot fall back to the server-get listener",async()=>{
  const h=harness();h.context.FB.db.runTransaction=null;
  const result=await h.api.remove("fixture-task-A");assert.equal(result.saved,false);assert.equal(result.indeterminate,false);assert.equal(h.documentReads,0);assert.equal(h.commits,0);assert.equal(h.writeTransactions,0);
});
