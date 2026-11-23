"use strict";
// Static integration regression for the INACTIVE MCAP authority switch.
// This deliberately does not enable writes, reach Firebase, or touch production.
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const core=fs.readFileSync(path.join(__dirname,"../js/core.js"),"utf8");
function functionSection(start,end){
  const a=core.indexOf(start),b=core.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,"Expected core section boundary missing");
  return core.slice(a,b);
}
test("MCAP Storage writes stay source-code disabled until reviewed full cutover",()=>{
  assert.match(core,/const MCAP_SHARDED_WRITES_ACTIVE = false;/);
  const save=functionSection("function canWriteCloud(","let CUTTING_BASELINE_WEEKLY_HOURS");
  assert.match(save,/authoritativeBackendMode === "sharded" && !MCAP_SHARDED_WRITES_ACTIVE/);
  const write=functionSection("async function writeAuthoritativeStateSnapshot(","function captureCuttingJobSaveTarget(");
  assert.match(write,/shardedBackend && !MCAP_SHARDED_WRITES_ACTIVE/);
  assert.match(write,/shardedBackend \? window\.OMAXShardedCommit\?\.save : window\.OMAXAtomicPersistence\?\.save/);
});
test("size ceiling remains mandatory for legacy and never rejects a Storage shard by monolith size",()=>{
  assert.match(core,/const FIRESTORE_BLOCK_BYTES = 975000;/);
  const write=functionSection("async function writeAuthoritativeStateSnapshot(","function captureCuttingJobSaveTarget(");
  assert.match(write,/!shardedBackend && estimatePayloadBytes\(pending\)\s*>=\s*FIRESTORE_BLOCK_BYTES/);
  const ordinary=functionSection("async function performCloudSave(","function recordDataFlowEvent(");
  assert.match(ordinary,/authoritativeBackendMode !== "sharded" && sizeBytes >= FIRESTORE_BLOCK_BYTES/);
  assert.match(ordinary,/authoritativeBackendMode !== "sharded" && sizeBytes >= FIRESTORE_WARN_BYTES/);
  assert.doesNotMatch(ordinary,/(?<!sharded" && )if \(sizeBytes >= FIRESTORE_BLOCK_BYTES\)/);
  assert.match(core,/routed\?\.mode === "sharded" && !MCAP_SHARDED_WRITES_ACTIVE/);
});
