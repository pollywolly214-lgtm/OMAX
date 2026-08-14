"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");
const rules=fs.readFileSync("firestore.rules","utf8"),storage=fs.readFileSync("storage.rules","utf8"),firebase=JSON.parse(fs.readFileSync("firebase.json","utf8"));
const checks=[
  ["firebase config retains both rule files",()=>{assert.equal(firebase.firestore.rules,"firestore.rules");assert.equal(firebase.storage.rules,"storage.rules");}],
  ["authoritative app access remains authenticated and scoped",()=>assert.ok(rules.includes("match /workspaces/{workspaceId}/app/{document=**} {\n      allow read, write: if signedIn();"))],
  ["membership is own-get only and client immutable",()=>{assert.ok(rules.includes("request.auth.uid == uid"));assert.ok(rules.includes("allow list, create, update, delete: if false;"));}],
  ["membership validates exact bounded identity role and active state",()=>{for(const text of ["validMemberData","data.uid == uid","data.workspaceId == workspaceId","data.active == true","['owner','admin','operator','viewer']","hasOnly"])assert.ok(rules.includes(text));}],
  ["job and file metadata are create-only exact schemas",()=>{assert.ok(rules.includes("function validJob"));assert.ok(rules.includes("function validFile"));assert.ok(rules.includes("allow update, delete: if false;"));assert.ok(rules.includes("request.resource.data.createdBy == request.auth.uid"));}],
  ["atomic file create requires after-state compatibility job",()=>{assert.ok(rules.includes("existsAfter("));assert.ok(rules.includes("getAfter("));assert.ok(rules.includes("validJob(getAfter"));}],
  ["missing compatibility job is readable but list remains denied",()=>{assert.ok(rules.includes("activeMember(workspaceId) && (resource == null || validJob(resource.data, workspaceId, jobId))"));assert.ok(rules.includes("allow list: if false;"));}],
  ["existing cryptographic file document cannot be overwritten",()=>{const files=rules.slice(rules.indexOf("match /files/{fileId}"),rules.indexOf("match /logs/{logId}"));assert.ok(files.includes("allow create:"));assert.ok(files.includes("allow update, delete: if false;"));}],
  ["viewer listing is membership-gated while job list and logs are denied",()=>{assert.ok(rules.includes("allow get, list: if activeMember(workspaceId) && validFile"));assert.ok(rules.includes("allow list: if false;"));assert.ok(rules.includes("match /logs/{logId} { allow read, write: if false; }"));}],
  ["default deny catches every unmatched path",()=>assert.ok(rules.includes("match /{document=**} { allow read, write: if false; }"))],
  ["canonical contract and exact identifiers are enforced",()=>{for(const text of ["application/dxf","application/octet-stream","data.fileId == fileId","data.jobId == jobId","data.workspaceId == workspaceId","data.sha256.matches","data.storagePath =="])assert.ok(rules.includes(text));}],
  ["Storage proposal uses canonical types and complete metadata",()=>{assert.equal(storage.includes("text/plain"),false);assert.equal(storage.includes("application/x-dxf"),false);for(const text of ["application/dxf","application/octet-stream","storagePath","status","createdAtISO","firestore.exists","allow update, list: if false"])assert.ok(storage.includes(text));}]
];
for(const[name,fn]of checks){fn();console.log(`ok - ${name}`);}console.log(`1..${checks.length}`);
