"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("js/cuttingJobChronology.js","utf8"),clone=value=>JSON.parse(JSON.stringify(value));
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
async function harness(backend,delay,corrupt=false){
  let clock=0,sequence=0,writes=0,adoptions=0,suspensions=0,outcome;const timers=new Map();
  const context=vm.createContext({structuredClone,module:{exports:{}},setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,at:clock+ms});return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(source,context);const api=context.module.exports;
  const baseline={syncMeta:{rev:7},cuttingJobs:[{id:"job",name:"Synthetic job",cutDateISO:"2026-11-21",cutOrderWithinDay:1,cutNumber:"C001",manualLogs:[],files:[]}],completedCuttingJobs:[],inventory:[{id:"retain",qty:3}]};
  const target={backend,path:backend==="sharded"?"workspaces/github-prod/app/stateIndexV1":"workspaces/github-prod/app/state"};
  let remote=clone(baseline),adopted=null;
  const coordinator=api.createMutationApi({canWrite:()=>true,localVersion:()=>0,captureTarget:()=>target,targetIsCurrent:()=>true,baselineMatches:state=>JSON.stringify(state)===JSON.stringify(baseline),readState:async()=>clone(remote),
    writeState:async(next,revision,validate)=>{assert.equal(revision,7);assert.equal(validate(next),true);writes++;remote={...clone(next),syncMeta:{rev:8}};return {saved:true,stateWriteAttempted:true,stateWriteCompleted:true,path:target.path,committedState:clone(remote)};},
    readVerificationState:()=>new Promise(resolve=>context.setTimeout(()=>{const state=clone(remote);if(corrupt)state.inventory[0].qty=99;resolve({state,path:target.path,fromCache:false,hasPendingWrites:false,backendMatches:true});},delay)),
    adoptVerifiedState:state=>{adoptions++;adopted=clone(state);return true;},suspend:()=>suspensions++});
  const promise=coordinator.save([{id:"job",cutDateISO:"2026-11-22"}],{expectedRevision:7,audit:{operationId:"deadline_case",actorUid:"synthetic_owner",atISO:"2026-11-23T12:00:00.000Z"}}).then(result=>{outcome=clone(result);return outcome;});
  await flush();
  return {promise,get outcome(){return outcome;},get counts(){return {writes,adoptions,suspensions};},get adopted(){return adopted;},get remote(){return remote;},
    advance:async ms=>{const end=clock+ms;for(;;){const due=[...timers].filter(([,timer])=>timer.at<=end).sort((one,two)=>one[1].at-two[1].at)[0];if(!due)break;clock=due[1].at;timers.delete(due[0]);due[1].fn();await flush();}clock=end;await flush();}};
}
test("sharded chronology accepts exact reconstruction slower than a legacy document read",async()=>{
  const h=await harness("sharded",4000);await h.advance(3001);assert.equal(h.outcome,undefined);
  await h.advance(1000);const result=await h.promise;assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);
  assert.deepEqual(h.counts,{writes:1,adoptions:1,suspensions:0});assert.deepEqual(h.adopted,h.remote);
});
test("legacy chronology keeps its three-second deadline and cannot adopt a late result",async()=>{
  const h=await harness("firestore",4000);await h.advance(3000);const result=await h.promise;
  assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.match(result.error,/timed out/);
  await h.advance(1001);assert.deepEqual(h.counts,{writes:1,adoptions:0,suspensions:1});
});
test("sharded chronology remains bounded at sixty seconds with no replay or late adoption",async()=>{
  const h=await harness("sharded",65000);await h.advance(59999);assert.equal(h.outcome,undefined);
  await h.advance(1);const result=await h.promise;assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.match(result.error,/timed out/);
  await h.advance(5001);assert.deepEqual(h.counts,{writes:1,adoptions:0,suspensions:1});
});
test("a longer Storage deadline never accepts changed data at the committed revision",async()=>{
  const h=await harness("sharded",4000,true);await h.advance(4001);const result=await h.promise;
  assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.ok(result.verificationMismatchCount>0);assert.ok(result.verificationMismatchPaths.some(path=>path.startsWith("$.inventory")));
  assert.deepEqual(h.counts,{writes:1,adoptions:0,suspensions:1});
});
