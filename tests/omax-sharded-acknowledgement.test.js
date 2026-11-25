"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const State=require("../js/omaxShardedState");
const Ack=require("../js/omaxShardedAcknowledgement");
const original=()=>({
  schema:72,syncMeta:{rev:1794576947956},
  cuttingJobs:[{id:"active"}],completedCuttingJobs:[{id:"historical"}],
  maintenanceOccurrencesV2:[{id:"event001"}],inventory:[{id:"m01"}],
  unknownProtectedData:{evidence:[1,2,3]}
});
test("successful sharded save verifies its actual committed revision, not stale local snapshot",()=>{
  const before=original();
  const committed=structuredClone(before);
  committed.syncMeta={rev:before.syncMeta.rev+1,updatedAtISO:"2026-11-23T10:00:00.000Z",updatedBy:"test-client"};
  committed.inventory.push({id:"m02"});
  assert.notDeepEqual(committed,before);
  const proof=Ack.confirm({committedState:committed,verifiedState:structuredClone(committed),
    expectedRevision:before.syncMeta.rev,canonical:State.canonical});
  assert.deepEqual(proof,{verified:true,revision:before.syncMeta.rev+1});
});
test("rejects loss or mutation of any business, history, unknown or metadata field",()=>{
  const before=original();
  const committed={...before,syncMeta:{rev:before.syncMeta.rev+1}};
  const options={committedState:committed,expectedRevision:before.syncMeta.rev,canonical:State.canonical};
  for(const change of [
    {...committed,maintenanceOccurrencesV2:[]},
    {...committed,completedCuttingJobs:[]},
    {...committed,inventory:[]},
    {...committed,unknownProtectedData:{evidence:[1,2]}},
    {...committed,syncMeta:{rev:committed.syncMeta.rev+1}},
    {...committed,schema:73},
  ]){
    assert.throws(()=>Ack.confirm({...options,verifiedState:change}),
      {code:"sharded_readback_unverified"});
  }
});
test("rejects absent, stale, unverified or malformed revision evidence",()=>{
  const before=original();
  const same={...before,syncMeta:{rev:before.syncMeta.rev}};
  const expect=before.syncMeta.rev;
  assert.throws(()=>Ack.confirm({committedState:same,verifiedState:same,
    expectedRevision:expect,canonical:State.canonical}),{code:"sharded_readback_unverified"});
  const updated={...before,syncMeta:{rev:expect+1}};
  for(const input of [
    {committedState:updated,verifiedState:null,expectedRevision:expect},
    {committedState:null,verifiedState:updated,expectedRevision:expect},
    {committedState:updated,verifiedState:updated,expectedRevision:-1},
    {committedState:updated,verifiedState:updated,expectedRevision:expect,canonical:null}
  ]){
    assert.throws(()=>Ack.confirm({canonical:State.canonical,...input}),
      {code:"sharded_readback_unverified"});
  }
});
