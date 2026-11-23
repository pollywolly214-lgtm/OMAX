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

test("repair and recovery tools must never read historical legacy state after activation",()=>{
  const authoritativeRead=functionSection("async function readCurrentCloudStateReadOnly(","async function buildDiagnosticSummary");
  assert.match(authoritativeRead,/OMAXAuthorityRouter\?\.fromBrowser/);
  assert.match(authoritativeRead,/const routed = await window\.OMAXAuthorityRouter\.fromBrowser\(\)/);
  assert.match(authoritativeRead,/throw Error\("Verified OMAX authority reader unavailable/);
  assert.match(authoritativeRead,/window\.OMAXDevSafe\?\.active/);
  const inspect=functionSection("async function runRecoveryInspect(","if (typeof window !== \"undefined\") window.recoveryInspect");
  assert.match(inspect,/cloudState = await readCurrentCloudStateReadOnly\(\)/);
  assert.doesNotMatch(inspect,/FB\.docRef\.get\(/);
  const repair=functionSection("const cuttingJobRepairEnv=","const runReadOnlyCuttingJobRepairAudit=");
  assert.match(repair,/const state=await readCurrentCloudStateReadOnly\(\)/);
  assert.doesNotMatch(repair,/FB\.docRef\.get\(/);
});

test("startup refuses silent legacy fallback when production router is absent",()=>{
  const load=functionSection("async function loadFromCloud()","async function migrateLegacyWorkspaceDoc()");
  assert.match(load,/if \(!window\.OMAXDevSafe\?\.active\)/);
  assert.match(load,/typeof window\.OMAXAuthorityRouter\?\.fromBrowser !== "function"/);
  assert.match(load,/throw Error\("OMAX authoritative source router unavailable/);
  assert.match(load,/await window\.OMAXAuthorityRouter\.fromBrowser\(\)/);
  assert.match(load,/!\["legacy","sharded"\]\.includes\(routed\.mode\)/);
  assert.match(load,/window\.__autosaveDisabled = true;/);
});

test("ordinary Storage save acknowledges the exact committed state and revision",()=>{
  const ordinary=functionSection("async function performCloudSave(","function recordDataFlowEvent(");
  assert.match(ordinary,/const confirm = window\.OMAXShardedAcknowledgement\?\.confirm/);
  assert.match(ordinary,/committedState:writeResult\.committedState/);
  assert.match(ordinary,/verifiedState:verified/);
  assert.match(ordinary,/canonical:window\.OMAXShardedState\?\.canonical/);
  assert.match(ordinary,/writeRev = verified\.syncMeta\.rev/);
  assert.match(ordinary,/window\.__loadedCloudRevisionForSaveGuard = authoritativeBackendMode === "sharded"/);
  assert.match(ordinary,/\? verified\.syncMeta\.rev : Number\(snap\?\.syncMeta\?\.rev \|\| 0\)/);
  assert.match(ordinary,/Legacy Firestore verification must remain unchanged/);
  assert.match(ordinary,/stableStringifyForIntegrity\(verified\) !== stableStringifyForIntegrity\(expectedState\)/);
  assert.match(ordinary,/path:authoritativeBackendMode === "sharded"/);
});
