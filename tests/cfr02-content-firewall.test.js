"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { THRESHOLDS, scanCuttingFileContent, writeAuthoritativeState } = require("../js/cuttingFileContentFirewall.js");

const tests = [];
const test = (name, fn)=>tests.push({ name, fn });
const cleanMetadata = { cuttingJobs:[{ id:"job-1", name:"plate.dxf", type:"application/dxf", size:1200, checksum:"a".repeat(64), storagePath:"workspaces/github-prod/cutting-files/job-1/plate.dxf", downloadUrl:"https://example.test/plate.dxf", relativePath:"jobs/plate.dxf", localRootSignature:"root:abc", notes:"normal note" }], completedCuttingJobs:[], deletedItems:[] };

test("clean bounded cutting-job metadata and references pass", ()=>assert.equal(scanCuttingFileContent(cleanMetadata).contaminated, false));
test("File and Blob values are detected before serialization", ()=>{
  const fakeFile = { size:7, [Symbol.toStringTag]:"File" };
  const result = scanCuttingFileContent({ fakeFile, blob:new Blob(["abc"]) });
  assert.deepEqual(result.findings.map(x=>x.reason), ["browser_blob_object", "browser_file_object"]);
});
test("ArrayBuffer, DataView, and typed arrays are blocked", ()=>{
  const buffer = new ArrayBuffer(8);
  assert.deepEqual(scanCuttingFileContent({ buffer, dataView:new DataView(buffer), typed:new Uint8Array(buffer) }).findings.map(x=>x.reason), ["array_buffer", "data_view", "typed_array"]);
});
test("nested forbidden content has exact stable path", ()=>assert.equal(scanCuttingFileContent({ cuttingJobs:[{ files:[{ preview:{ content:"data:image/png;base64,AA==" } }] }] }).findings[0].path, "$.cuttingJobs[0].files[0].preview.content"));
test("data and blob URLs are blocked", ()=>assert.deepEqual(scanCuttingFileContent({ a:"data:text/plain,hi", b:"blob:https://example.test/id" }).findings.map(x=>x.reason), ["data_url", "blob_url"]));
test("large base64 boundary blocks and short metadata passes", ()=>{
  assert.equal(scanCuttingFileContent({ checksum:"A".repeat(64), payload:"A".repeat(THRESHOLDS.largeBase64Characters - 4) }).contaminated, false);
  assert.equal(scanCuttingFileContent({ payload:"A".repeat(THRESHOLDS.largeBase64Characters) }).findings[0].reason, "suspicious_large_base64");
});
for (const root of ["cuttingJobs", "completedCuttingJobs", "deletedItems"]){
  test(`embedded content in ${root} is blocked`, ()=>assert.equal(scanCuttingFileContent({ [root]:[{ dataUrl:"data:image/png;base64,AA==" }] }).findings[0].path, `$.${root}[0].dataUrl`));
}
test("known preview and raw content fields are blocked", ()=>{
  const result = scanCuttingFileContent({ previewContent:"x".repeat(THRESHOLDS.knownContentFieldCharacters), rawContent:"0\nSECTION\n2\nENTITIES\n" + "x".repeat(300) });
  assert.equal(result.blockingFindingCount, 2);
});
test("findings include root, size, and blocking metadata", ()=>{
  const finding = scanCuttingFileContent({ completedCuttingJobs:[{ previewUrl:"data:image/png;base64,AA==" }] }).findings[0];
  assert.equal(finding.parentRootCollection, "completedCuttingJobs");
  assert.equal(finding.blocksAuthoritativeSave, true);
  assert.equal(Number.isFinite(finding.approximateSize), true);
});
test("oversized markup boundary behavior is deterministic", ()=>{
  assert.equal(scanCuttingFileContent({ note:"<svg>" + "x".repeat(THRESHOLDS.oversizedMarkupCharacters) }).findings[0].reason, "oversized_preview_or_markup");
});
test("findings are sorted deterministically", ()=>{
  const input = { z:"blob:x", a:"data:text/plain,x" };
  assert.deepEqual(scanCuttingFileContent(input).findings.map(x=>x.path), ["$.a", "$.z"]);
  assert.deepEqual(scanCuttingFileContent(input), scanCuttingFileContent(input));
});
test("scanner does not mutate input", ()=>{
  const input = structuredClone(cleanMetadata); const before = JSON.stringify(input);
  scanCuttingFileContent(input); assert.equal(JSON.stringify(input), before);
});
test("blocked write never invokes set and reports flags", async ()=>{
  let calls = 0; const result = await writeAuthoritativeState({ set:async()=>{ calls++; } }, { cuttingJobs:[{ content:"x".repeat(600) }] });
  assert.equal(calls, 0); assert.equal(result.errorCode, "embedded_cutting_file_content_blocked");
  assert.equal(result.stateWriteAttempted, false); assert.equal(result.stateWriteCompleted, false);
});
test("clean write reaches Firestore mock", async ()=>{
  let calls = 0; const result = await writeAuthoritativeState({ set:async()=>{ calls++; } }, cleanMetadata, { merge:true });
  assert.equal(calls, 1); assert.equal(result.saved, true); assert.equal(result.stateWriteCompleted, true);
});
test("failed clean write reports an attempted but incomplete write", async ()=>{
  const result = await writeAuthoritativeState({ set:async()=>{ throw new Error("mock failure"); } }, cleanMetadata);
  assert.equal(result.stateWriteAttempted, true); assert.equal(result.stateWriteCompleted, false); assert.equal(result.indeterminate, true);
});
test("core keeps protected preflight before the shared writer", ()=>{
  const core = fs.readFileSync(path.join(__dirname, "../js/core.js"), "utf8");
  assert.ok(core.indexOf("validateProtectedSavePreflight({") < core.indexOf("writeAuthoritativeStateSnapshot(snap"));
});
test("Storage initialization contains no object operation", ()=>{
  const core = fs.readFileSync(path.join(__dirname, "../js/core.js"), "utf8");
  const init = core.slice(core.indexOf("async function initFirebase"), core.indexOf("// Persist login"));
  assert.match(init, /FB\.app\.storage\(`gs:\/\//);
  assert.doesNotMatch(init, /\.ref\(|\.put\(|\.getDownloadURL\(|\.list|\.delete\(/);
});
test("diagnostics are read-only and helpers are exposed", ()=>{
  const core = fs.readFileSync(path.join(__dirname, "../js/core.js"), "utf8");
  const audit = core.slice(core.indexOf("function auditCuttingFileContentExposure"), core.indexOf("window.getCloudCutFileStorageDiagnostics") + 50);
  assert.match(audit, /window\.auditCuttingFileContentExposure/);
  assert.match(audit, /skipLocalFileCacheSync:true/);
  assert.doesNotMatch(audit, /docRef\.set|writeAuthoritativeStateSnapshot|saveCloud/);
});
test("all state-document writes use shared firewall writer", ()=>{
  const core = fs.readFileSync(path.join(__dirname, "../js/core.js"), "utf8");
  assert.doesNotMatch(core, /FB\.docRef\.set\s*\(/);
  assert.equal((core.match(/writeAuthoritativeStateSnapshot\(/g) || []).length >= 5, true);
});

(async()=>{
  for (const { name, fn } of tests){ await fn(); process.stdout.write(`ok - ${name}\n`); }
  process.stdout.write(`1..${tests.length}\n`);
})().catch(err=>{ console.error(err); process.exitCode = 1; });
