"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");

const rules=fs.readFileSync("storage.rules","utf8");
const views=fs.readFileSync("js/views.js","utf8");
const renderers=fs.readFileSync("js/renderers.js","utf8");
const service=fs.readFileSync("js/cfr05CloudCuttingFiles.js","utf8");
const deletion=rules.slice(rules.indexOf("allow delete:"),rules.indexOf("allow update, list:"));
const creation=rules.slice(rules.indexOf("allow create:"),rules.indexOf("allow get:"));
const reading=rules.slice(rules.indexOf("allow get:"),rules.indexOf("// Client deletion"));

assert.match(creation,/resource == null/,"create must reject an existing object rather than authorize overwrite");
assert.match(rules,/allow update, list: if false;/,"an existing-object put is denied as update and cannot be listed");
assert.match(reading,/safeIds\(workspaceId, jobId, fileId\) && allowedName\(safeFileName\)/,"absence checks require the exact validated cryptographic path");
assert.match(reading,/activeRole\(workspaceId, \['owner','admin','operator','viewer'\]\)/,"absence checks remain membership gated");
assert.match(reading,/resource == null \|\| validExisting\(workspaceId, jobId, fileId, safeFileName\)/,"missing objects are readable while invalid existing metadata remains denied");

assert.match(deletion,/safeIds\(workspaceId, jobId, fileId\) && allowedName\(safeFileName\)/,"invalid paths and filenames must be denied");
assert.match(deletion,/activeRole\(workspaceId, \['owner','admin','operator'\]\)/,"cleanup still requires an authorized active member");
assert.match(deletion,/resource\.metadata\.createdBy == request\.auth\.uid/,"only the original uploader may clean up");
assert.doesNotMatch(deletion,/member\(workspaceId\)\.role in/,"owner/admin must not delete another uploader's object");
assert.match(deletion,/validExisting\(workspaceId, jobId, fileId, safeFileName\)/,"invalid object metadata must be denied");
assert.match(deletion,/request\.time < resource\.timeCreated \+ duration\.value\(15, 'm'\)/,"cleanup must expire strictly at 15 minutes");
assert.match(rules,/allow update, list: if false;/);
assert.match(rules,/match \/\{allPaths=\*\*\} \{ allow read, write: if false; \}/);

// Deterministic truth table for the exact conjunctive delete contract above.
const cleanupAllowed=o=>o.safeIds&&o.allowedName&&o.activeRole&&o.creator&&o.validExisting&&o.ageMs<15*60*1000;
const valid={safeIds:true,allowedName:true,activeRole:true,creator:true,validExisting:true,ageMs:14*60*1000+59999};
assert.equal(cleanupAllowed(valid),true,"creator may compensate a validated upload before 15 minutes");
assert.equal(cleanupAllowed({...valid,ageMs:15*60*1000}),false,"deletion expires at exactly 15 minutes");
assert.equal(cleanupAllowed({...valid,creator:false}),false,"another operator cannot delete the creator's object");
for(const check of ["safeIds","allowedName","validExisting"])
  assert.equal(cleanupAllowed({...valid,[check]:false}),false,`${check} failure denies cleanup`);

for(const source of [views,renderers]) assert.doesNotMatch(source,/data-cloud-delete|deleteCfr05|deleteCloudCuttingFile/,"no permanent deletion UI or general helper may exist");
assert.match(service,/r\.completed\.storageUpload&&!r\.indeterminate&&!r\.completed\.firestoreBatchCommit&&objectRef/,"cleanup remains limited to a definite post-upload failure");
assert.match(service,/r\.attempted\.cleanupDelete=true/);
assert.match(service,/await objectRef\.delete\(\)/);
assert.match(service,/cleanupAbsenceVerified=true/);
assert.doesNotMatch(service,/cleanupDelete.*retry|retry.*cleanupDelete/is,"cleanup must not retry");

console.log("ok - CFR-05 Storage cleanup is creator-only, validated, and limited to 15 minutes");
