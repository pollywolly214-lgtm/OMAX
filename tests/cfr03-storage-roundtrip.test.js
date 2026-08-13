"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const factory = require("../js/cfr03StorageRoundTrip.js");
const tests=[]; const test=(name,fn)=>tests.push({name,fn});
const CONFIRMATION="CFR03 STORAGE TEST"; const now=()=>new Date("2026-08-13T12:00:00.000Z");
const cryptoMock={getRandomValues(bytes){bytes.fill(10);return bytes;}};

function harness(options={}){
  const calls=[]; const testId="0a".repeat(16); const path=`workspaces/github-prod/cfr03-tests/user_1/${testId}/cfr03-test.json`;
  const payload=JSON.stringify({testId,timestamp:now().toISOString()}); let deleted=false;
  const ref={
    async put(){calls.push("put");if(options.uploadError)throw options.uploadError;},
    async getMetadata(){calls.push("metadata");if(deleted && options.absenceError)throw options.absenceError;if(deleted)throw Object.assign(new Error("not found"),{code:"storage/object-not-found"});if(options.metadataError)throw options.metadataError;return {fullPath:path,size:new TextEncoder().encode(payload).byteLength,contentType:"application/json",customMetadata:{uid:"user_1",workspaceId:"github-prod",testId}};},
    async getDownloadURL(){calls.push("download_url");if(options.urlError)throw options.urlError;return "https://secret-token.invalid/object?token=SECRET";},
    async delete(){calls.push("delete");if(options.deleteError)throw options.deleteError;deleted=true;}
  };
  const state={user:{uid:"user_1"},projectId:"omax-maintenance",bucket:"omax-maintenance.firebasestorage.app",workspaceId:"github-prod",storage:{ref(requested){calls.push("ref");assert.equal(requested,path);return ref;}},...(options.state||{})};
  const cache="47-local-data-urls-byte-equivalent"; let backup="protected-backup";
  const env={cuttingJobs:[{id:"job",config:{b:2,a:1}}],completedCuttingJobs:[],deletedItems:[],inventory:[{id:"part"}],maintenanceOccurrencesV2:[{id:"occurrence"}],localStorage:{getItem:key=>key==="cutting_job_files_v1"?cache:key==="omax_local_state_backup_v1"?backup:null}};
  class XHR {
    open(method,url){calls.push("xhr_open");this.url=url;assert.equal(method,"GET");}
    send(){
      calls.push("xhr_send"); if(options.mutateDuringDownload)options.mutateDuringDownload(env); if(options.localBackupDrift)backup=options.localBackupDrift;
      queueMicrotask(()=>{
        if(options.xhr==="network")return this.onerror(); if(options.xhr==="timeout")return this.ontimeout(); if(options.xhr==="abort")return this.onabort();
        this.status=options.httpStatus ?? 200; this.responseText=options.content ?? payload; this.onload();
      });
    }
  }
  const api=factory(env).createForTests(env,{now,crypto:cryptoMock,XMLHttpRequest:XHR,firebaseState:()=>state});
  return {api,calls,env,path,cache};
}
const run=h=>h.api.runCfr03StorageRoundTripTest({confirmation:CONFIRMATION});

test("committed rules are exact deny-all",()=>assert.equal(fs.readFileSync("storage.rules","utf8"),`rules_version = '2';\n\nservice firebase.storage {\n  match /b/{bucket}/o {\n    match /{allPaths=**} {\n      allow read, write: if false;\n    }\n  }\n}\n`));
test("missing and incorrect confirmation perform zero Storage operations",async()=>{for(const confirmation of [undefined,"wrong"]){const h=harness();await h.api.runCfr03StorageRoundTripTest({confirmation});assert.deepEqual(h.calls,[]);}});
test("unsigned and unexpected configurations stop at validation",async()=>{for(const state of [{user:null},{projectId:"other"},{bucket:"other"},{workspaceId:"other"}]){const h=harness({state});const r=await run(h);assert.equal(r.failedStage,"validation");assert.deepEqual(h.calls,[]);}});
test("post-upload network failure has correct stage and exactly one successful cleanup",async()=>{const h=harness({xhr:"network"});const r=await run(h);assert.equal(r.failedStage,"download_content");assert.equal(r.downloadUrlCreated,true);assert.equal(r.downloadErrorType,"network");assert.equal(r.cleanupAttempted,true);assert.equal(r.cleanupCompleted,true);assert.equal(r.cleanupAbsenceVerified,true);assert.equal(h.calls.filter(x=>x==="delete").length,1);});
test("download URL failure is staged and cleaned",async()=>{const h=harness({urlError:new Error("url failed")});const r=await run(h);assert.equal(r.failedStage,"download_url");assert.equal(r.downloadUrlCreated,false);assert.equal(r.cleanupAbsenceVerified,true);});
test("failed cleanup is never retried and reports exact possible orphan",async()=>{const h=harness({xhr:"network",deleteError:new Error("unknown delete outcome")});const r=await run(h);assert.equal(h.calls.filter(x=>x==="delete").length,1);assert.equal(r.operationIndeterminate,true);assert.equal(r.manualCleanupRequired,true);assert.equal(r.possibleOrphanPath,h.path);});
test("indeterminate absence verification is never retried",async()=>{const h=harness({absenceError:new Error("unknown metadata outcome")});const r=await run(h);assert.equal(h.calls.filter(x=>x==="delete").length,1);assert.equal(h.calls.filter(x=>x==="metadata").length,2);assert.equal(r.operationIndeterminate,true);assert.equal(r.manualCleanupRequired,true);assert.equal(r.possibleOrphanPath,h.path);});
test("indeterminate upload is not automatically deleted",async()=>{const h=harness({uploadError:new Error("unknown upload outcome")});const r=await run(h);assert.equal(r.failedStage,"upload");assert.equal(r.cleanupAttempted,false);assert.equal(h.calls.includes("delete"),false);assert.equal(r.possibleOrphanPath,h.path);});
test("returned result never contains URL or token",async()=>{const h=harness({xhr:"network"});const r=await run(h);const serialized=JSON.stringify(r);assert.doesNotMatch(serialized,/https:|SECRET|token=/);assert.equal(r.downloadMethod,"XMLHttpRequest");});
test("HTTP status failure is classified and status retained",async()=>{const r=await run(harness({httpStatus:403}));assert.equal(r.failedStage,"download_content");assert.equal(r.downloadErrorType,"http_status");assert.equal(r.downloadHttpStatus,403);assert.equal(r.corsFailureSuspected,false);});
test("timeout is classified without claiming CORS",async()=>{const r=await run(harness({xhr:"timeout"}));assert.equal(r.downloadErrorType,"timeout");assert.equal(r.networkFailureSuspected,true);assert.equal(r.corsFailureSuspected,false);});
test("opaque browser network error honestly suspects CORS and network",async()=>{const r=await run(harness({xhr:"network"}));assert.equal(r.corsFailureSuspected,true);assert.equal(r.networkFailureSuspected,true);});
test("successful download verifies exact content and cleanup",async()=>{const r=await run(harness());assert.equal(r.downloadCompleted,true);assert.equal(r.contentVerified,true);assert.equal(r.failedStage,"");assert.equal(r.cleanupAbsenceVerified,true);});
test("content mismatch has exact stage and is cleaned",async()=>{const r=await run(harness({content:"different"}));assert.equal(r.failedStage,"content_verification");assert.equal(r.contentVerified,false);assert.equal(r.cleanupAbsenceVerified,true);});
test("canonical object-key ordering does not cause mismatch",async()=>{const h=harness({mutateDuringDownload(env){env.cuttingJobs[0].config={a:1,b:2};}});const r=await run(h);assert.equal(r.protectedStateMatched,true);assert.deepEqual(r.protectedStateMismatchPaths,[]);});
test("value changes report exact paths",async()=>{const r=await run(harness({mutateDuringDownload(env){env.inventory[0].id="changed";}}));assert.equal(r.appStateMutationDetected,true);assert.deepEqual(r.protectedStateMismatchPaths,["$.inventory[0].id"]);assert.equal(r.protectedStateRootResults.inventory.matched,false);});
test("property presence changes report exact paths",async()=>{const r=await run(harness({mutateDuringDownload(env){env.cuttingJobs[0].optional=undefined;}}));assert.deepEqual(r.protectedStateMismatchPaths,["$.cuttingJobs[0].optional"]);});
test("array order changes report exact paths",async()=>{const h=harness({mutateDuringDownload(env){env.completedCuttingJobs.push({id:"b"},{id:"a"});env.completedCuttingJobs.reverse();}});const r=await run(h);assert.ok(r.protectedStateMismatchPaths.some(path=>path.startsWith("$.completedCuttingJobs")));});
test("diagnostic session fields are excluded",async()=>{const h=harness({mutateDuringDownload(env){env.inventory[0].diagnostic={generatedAtISO:"later"};env.lastCfr03TestResult={anything:true};}});const r=await run(h);assert.equal(r.protectedStateMatched,true);});
test("independent local-backup drift is reported without a false business-state mutation",async()=>{const h=harness({localBackupDrift:"independently-refreshed-backup"});h.env.saveCloudNow=()=>{throw new Error("must not run")};h.env.saveCloudDebounced=h.env.saveCloudNow;h.env.snapshotState=h.env.saveCloudNow;const r=await run(h);assert.equal(r.uploadCompleted,true);assert.equal(r.downloadCompleted,true);assert.equal(r.contentVerified,true);assert.equal(r.cleanupAbsenceVerified,true);assert.equal(r.firestoreWriteAttempted,false);assert.equal(r.protectedStateMatched,true);assert.equal(r.appStateMutationDetected,false);assert.deepEqual(r.protectedStateMismatchPaths,[]);assert.equal(r.localStateBackupMatched,false);assert.equal(r.localStateBackupDriftObserved,true);assert.deepEqual(r.localStateBackupMismatchPaths,["$.localStateBackup.value"]);assert.equal(r.localJobFileCacheMatched,true);assert.deepEqual(r.localJobFileCacheMismatchPaths,[]);});
test("job file cache remains byte-equivalent and separate",async()=>{const h=harness();const r=await run(h);assert.equal(r.localJobFileCacheMatched,true);assert.deepEqual(r.localJobFileCacheMismatchPaths,[]);assert.equal(h.env.localStorage.getItem("cutting_job_files_v1"),h.cache);});
test("no Firestore save occurs and production flags remain false",async()=>{const h=harness();h.env.saveCloudNow=()=>{throw new Error("called")};h.env.saveCloudDebounced=h.env.saveCloudNow;const r=await run(h);assert.equal(r.firestoreWriteAttempted,false);const d=h.api.getDiagnostics();assert.equal(d.productionUploadsEnabled,false);assert.equal(d.productionDownloadsEnabled,false);assert.equal(d.storageRulesExpectedVersion,"CFR-03A-deny-all-v1");});

(async()=>{for(const {name,fn} of tests){await fn();process.stdout.write(`ok - ${name}\n`);}process.stdout.write(`1..${tests.length}\n`);})().catch(error=>{console.error(error);process.exitCode=1;});
