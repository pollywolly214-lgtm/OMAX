"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const factory = require("../js/cfr03StorageRoundTrip.js");

const tests = [];
const test = (name, fn)=>tests.push({ name, fn });
const CONFIRMATION = "CFR03 STORAGE TEST";
const fixedNow = ()=>new Date("2026-08-13T12:00:00.000Z");
const cryptoMock = { getRandomValues(bytes){ bytes.fill(10); return bytes; } };

function harness(overrides = {}){
  const calls = [];
  const path = "workspaces/github-prod/cfr03-tests/user_1/0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a/cfr03-test.json";
  const payload = JSON.stringify({ testId:"0a".repeat(16), timestamp:fixedNow().toISOString() });
  let deleted = false;
  let putResolve;
  const putGate = overrides.putGate || Promise.resolve();
  const ref = {
    fullPath:path,
    async put(blob, metadata){
      calls.push(["put", metadata]);
      if (overrides.putError) throw overrides.putError;
      await putGate;
      putResolve = true;
      return { ref:{ fullPath:path } };
    },
    async getMetadata(){
      calls.push(["getMetadata"]);
      if (deleted) throw Object.assign(new Error("not found"), { code:"storage/object-not-found" });
      return overrides.metadata || { fullPath:path, size:new TextEncoder().encode(payload).byteLength, contentType:"application/json", customMetadata:{ uid:"user_1", workspaceId:"github-prod", testId:"0a".repeat(16) } };
    },
    async getDownloadURL(){ calls.push(["getDownloadURL"]); return "https://storage.test/object"; },
    async delete(){ calls.push(["delete"]); if (overrides.deleteError) throw overrides.deleteError; deleted = true; }
  };
  const storage = { ref(requestedPath){ calls.push(["ref", requestedPath]); assert.equal(requestedPath, path); return ref; } };
  const state = {
    user:{ uid:"user_1" }, projectId:"omax-maintenance", bucket:"omax-maintenance.firebasestorage.app",
    workspaceId:"github-prod", storage, ...(overrides.state || {})
  };
  const local = new Map([["cutting_job_files_v1", "47-local-data-urls"], ["omax_local_state_backup_v1", "protected-backup"]]);
  const env = {
    cuttingJobs:[{ id:"job-1" }], completedCuttingJobs:[], inventory:[{ id:"part-1" }],
    localStorage:{ getItem:key=>local.get(key) ?? null }
  };
  const fetchMock = async()=>{
    calls.push(["fetch"]);
    return { ok:true, status:200, text:async()=>overrides.downloadContent ?? payload };
  };
  const api = factory(env).createForTests(env, { now:fixedNow, crypto:cryptoMock, fetch:fetchMock, firebaseState:()=>state });
  return { api, calls, env, local, state, wasPutResolved:()=>putResolve === true };
}

test("missing confirmation performs zero Storage operations", async()=>{
  const h = harness(); const result = await h.api.runCfr03StorageRoundTripTest();
  assert.equal(result.confirmed, false); assert.deepEqual(h.calls, []);
});
test("incorrect confirmation performs zero Storage operations", async()=>{
  const h = harness(); await h.api.runCfr03StorageRoundTripTest({ confirmation:"yes" }); assert.deepEqual(h.calls, []);
});
test("unsigned users are rejected before a Storage reference", async()=>{
  const h = harness({ state:{ user:null } }); const result = await h.api.runCfr03StorageRoundTripTest({ confirmation:CONFIRMATION });
  assert.equal(result.failedStage, "authentication"); assert.deepEqual(h.calls, []);
});
for (const [name, state] of [
  ["project", { projectId:"other" }], ["bucket", { bucket:"other.invalid" }], ["workspace", { workspaceId:"preview" }]
]) test(`unexpected ${name} is rejected`, async()=>{
  const h = harness({ state }); const result = await h.api.runCfr03StorageRoundTripTest({ confirmation:CONFIRMATION });
  assert.equal(result.failedStage, "configuration"); assert.deepEqual(h.calls, []);
});
test("generated path is isolated and owned by the exact UID", async()=>{
  const h = harness(); const result = await h.api.runCfr03StorageRoundTripTest({ confirmation:CONFIRMATION });
  assert.equal(result.objectPath, `workspaces/github-prod/cfr03-tests/${result.uid}/${result.testId}/cfr03-test.json`);
  assert.equal(result.uid, "user_1"); assert.match(result.testId, /^[a-f0-9]{32}$/);
});
test("unsafe UID path ownership is rejected before Storage", async()=>{
  const h = harness({ state:{ user:{ uid:"../other" } } }); const result = await h.api.runCfr03StorageRoundTripTest({ confirmation:CONFIRMATION });
  assert.equal(result.failedStage, "preflight"); assert.deepEqual(h.calls, []);
});
test("upload completion is awaited before metadata", async()=>{
  let release; const gate = new Promise(resolve=>{ release=resolve; }); const h = harness({ putGate:gate });
  const pending = h.api.runCfr03StorageRoundTripTest({ confirmation:CONFIRMATION });
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(h.calls.map(call=>call[0]), ["ref", "put"]); release(); await pending;
  assert.equal(h.wasPutResolved(), true); assert.ok(h.calls.findIndex(x=>x[0] === "getMetadata") > h.calls.findIndex(x=>x[0] === "put"));
});
test("upload failure prevents download and delete assumptions and is not retried", async()=>{
  const h = harness({ putError:Object.assign(new Error("network"), { code:"storage/retry-limit-exceeded" }) });
  const result = await h.api.runCfr03StorageRoundTripTest({ confirmation:CONFIRMATION });
  assert.equal(result.uploadAttempted, true); assert.equal(result.uploadCompleted, false); assert.equal(result.operationIndeterminate, true);
  assert.deepEqual(h.calls.map(x=>x[0]), ["ref", "put"]);
});
test("metadata must match every exact object attribute", async()=>{
  const h = harness({ metadata:{ fullPath:"wrong", size:1, contentType:"text/html", customMetadata:{} } });
  const result = await h.api.runCfr03StorageRoundTripTest({ confirmation:CONFIRMATION });
  assert.equal(result.metadataVerified, false); assert.equal(result.failedStage, "metadata"); assert.equal(result.downloadAttempted, false);
});
test("downloaded contents must match exactly", async()=>{
  const h = harness({ downloadContent:"different" }); const result = await h.api.runCfr03StorageRoundTripTest({ confirmation:CONFIRMATION });
  assert.equal(result.downloadCompleted, true); assert.equal(result.contentVerified, false); assert.equal(result.deleteAttempted, false);
});
test("exact deletion is awaited and absence is verified", async()=>{
  const h = harness(); const result = await h.api.runCfr03StorageRoundTripTest({ confirmation:CONFIRMATION });
  assert.equal(result.deleteCompleted, true); assert.equal(result.absenceVerified, true);
  assert.deepEqual(h.calls.map(x=>x[0]), ["ref", "put", "getMetadata", "getDownloadURL", "fetch", "delete", "getMetadata"]);
});
test("indeterminate deletion is not retried", async()=>{
  const h = harness({ deleteError:new Error("network") }); const result = await h.api.runCfr03StorageRoundTripTest({ confirmation:CONFIRMATION });
  assert.equal(result.operationIndeterminate, true); assert.equal(h.calls.filter(x=>x[0] === "delete").length, 1); assert.equal(result.absenceVerified, false);
});
test("helper does not expose or call Firestore saves", async()=>{
  const h = harness(); h.env.saveCloudNow=()=>{ throw new Error("must not run"); }; h.env.saveCloudDebounced=h.env.saveCloudNow;
  const result = await h.api.runCfr03StorageRoundTripTest({ confirmation:CONFIRMATION });
  assert.equal(result.firestoreWriteAttempted, false); assert.equal(result.absenceVerified, true);
  assert.deepEqual(Object.keys(h.api).sort(), ["getDiagnostics", "runCfr03StorageRoundTripTest"]);
});
test("protected app state and jobFileCache remain unchanged", async()=>{
  const h = harness(); const beforeJobs=JSON.stringify(h.env.cuttingJobs); const beforeCache=h.local.get("cutting_job_files_v1");
  const result = await h.api.runCfr03StorageRoundTripTest({ confirmation:CONFIRMATION });
  assert.equal(result.protectedStateMatched, true); assert.equal(result.appStateMutationDetected, false);
  assert.equal(result.localJobFileCacheMatched, true); assert.equal(JSON.stringify(h.env.cuttingJobs), beforeJobs); assert.equal(h.local.get("cutting_job_files_v1"), beforeCache);
});
test("production transfers stay disabled and diagnostics are read-only", ()=>{
  const h = harness(); const before=JSON.stringify(h.env); const diagnostics=h.api.getDiagnostics();
  assert.equal(diagnostics.productionUploadsEnabled, false); assert.equal(diagnostics.productionDownloadsEnabled, false);
  assert.equal(diagnostics.productionAuthorizationReady, false); assert.equal(JSON.stringify(h.env), before); assert.deepEqual(h.calls, []);
});
test("rules are default deny and allow only bounded CFR-03 create/get/delete", ()=>{
  const rules = fs.readFileSync("storage.rules", "utf8");
  assert.match(rules, /match \/workspaces\/\{workspaceId\}\/cfr03-tests\/\{uid\}\/\{testId\}\/\{fileName\}/);
  assert.match(rules, /request\.auth\.uid == uid/); assert.match(rules, /request\.resource\.size <= 2048/);
  assert.match(rules, /request\.resource\.contentType == 'application\/json'/); assert.match(rules, /allow create:/);
  assert.match(rules, /metadata\.keys\(\)\.hasOnly/);
  assert.doesNotMatch(rules, /allow update:/); assert.match(rules, /allow read, write: if false/);
});
test("core diagnostics extension contains no write path", ()=>{
  const core=fs.readFileSync("js/core.js", "utf8");
  const section=core.slice(core.indexOf("function getCloudCutFileStorageDiagnostics"), core.indexOf("/* ======================== HISTORY"));
  assert.doesNotMatch(section, /saveCloud|docRef\.set|\.put\(|\.delete\(/);
});

(async()=>{
  for (const { name, fn } of tests){ await fn(); process.stdout.write(`ok - ${name}\n`); }
  process.stdout.write(`1..${tests.length}\n`);
})().catch(error=>{ console.error(error); process.exitCode=1; });
