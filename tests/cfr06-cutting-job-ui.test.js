"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");
const views=fs.readFileSync("js/views.js","utf8"),renderers=fs.readFileSync("js/renderers.js","utf8"),core=fs.readFileSync("js/core.js","utf8"),service=fs.readFileSync("js/cfr05CloudCuttingFiles.js","utf8");

for(const token of [
  "Attach from Reference Folder","Temporary local upload — not saved","Link OneDrive URL",
  "Add from this computer OneDrive folder","OneDrive setup","data-job-file-add","data-upload-job",
  "data-link-job-file","jobOneDriveLibraryAddBtn","data-job-onedrive-setup","data-open-local-file",
  "data-preview-path-btn","data-remove-file","data-edit-file-link"
]) assert.ok(views.includes(token),`current-main file workflow remains visible: ${token}`);
assert.match(views,/id="jobSecureCloudFilesBtn">Upload secure cloud file/);
assert.match(views,/data-cloud-files=/);assert.match(views,/data-cloud-file-upload=/);

for(const token of [
  "handleReferenceFolderAttachButtonClick","attachFromLocalOneDriveRoot","openLocalRootAttachment",
  "openOneDriveDxfPicker","data-wjcuts-grant-permission","jobOneDriveRootPickerBtn",
  "__cuttingJobReferenceAttachDocumentHandler"
]) assert.ok(renderers.includes(token),`current-main handler remains wired: ${token}`);
const routedActions=renderers.slice(renderers.indexOf("const handleRootFileActionClick"),renderers.indexOf("historyBody?.addEventListener",renderers.indexOf("const handleRootFileActionClick")));
for(const token of ["data-cloud-files","data-cloud-file-upload","data-job-file-add","data-open-local-file","data-preview-path-btn","data-remove-file","data-link-job-file","data-edit-file-link","data-upload-job"])
  assert.ok(routedActions.includes(token),`coexisting action remains routed: ${token}`);

const uploadHandler=renderers.slice(renderers.indexOf('const cloudUpload = e.target.closest("[data-cloud-file-upload]")'),renderers.indexOf('const fileMenuAdd = e.target.closest("[data-job-file-add]")'));
assert.match(uploadHandler,/document\.body\.appendChild\(input\)/);
assert.match(uploadHandler,/await window\.uploadCfr05CuttingFile/);
assert.match(uploadHandler,/await window\.listCfr05CloudFiles\(jobId\)/);
assert.match(uploadHandler,/cfr05LastUploadResult/);assert.match(uploadHandler,/cfr05LastListingResult/);
assert.match(uploadHandler,/Upload succeeded; Cloud Files refresh failed\. Do not upload the file again\./);
assert.equal((uploadHandler.match(/uploadCfr05CuttingFile/g)||[]).length,1,"listing refresh must never retry the upload");
assert.equal(uploadHandler.includes("saveCloudNow"),false,"existing-job cloud upload must not rewrite app/state");
assert.match(renderers,/pendingSecureCloudJobFiles/);
assert.match(renderers,/saved\?\.saved !== true \|\| saved\?\.stateWriteCompleted !== true/);
assert.match(renderers,/for \(const file of pendingCloudFiles\)/);
assert.match(renderers,/files:attachments/,"local/reference metadata remains in the authoritative job exactly as current main intended");
assert.doesNotMatch(renderers,/files:\s*pendingCloudFiles/,"cloud bytes and pending cloud wrappers must not enter app\/state");
assert.doesNotMatch(service,/cuttingJobs\.(push|splice)|completedCuttingJobs\.(push|splice)|cutting_job_files_v1/,"cloud metadata remains separate from authoritative arrays and the legacy cache");
for(const source of [views,renderers,core,service]) assert.doesNotMatch(source,/data-cloud-delete|deleteCfr05|deleteCloudCuttingFile/,"no permanent cloud deletion UI exists");
assert.match(renderers,/Cloud Files listing failed:/);assert.match(renderers,/role="alert"/);
assert.match(core,/firestore:FB\.db,onStage/);assert.match(service,/o\.onStage\?\.\(s,cleanResult\(r\)\)/);
console.log("ok - CFR-06 secure cloud and current-main file workflows coexist");
