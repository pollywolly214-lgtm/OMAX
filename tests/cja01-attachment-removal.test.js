"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const atomic = require("../js/atomicPersistence.js");
const firewall = require("../js/cuttingFileContentFirewall.js");
const identities = require("../js/globalIdentityRepair.js");
const views = fs.readFileSync("js/views.js", "utf8");
const renderers = fs.readFileSync("js/renderers.js", "utf8");
const core = fs.readFileSync("js/core.js", "utf8");
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
function extract(source, start, end){
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `source boundaries: ${start}`);
  return source.slice(from, to);
}
const helpers = extract(views, "function getCuttingJobUnlinkedCloudFileIds", "function renderAverageHoursBanner");
const removal = extract(renderers, "const pendingCuttingJobAttachmentRemovals", "async function refreshCfr05CloudPresentation");
const metadata = Object.freeze([
  Object.freeze({fileId:"cloud-a", originalName:"duplicate.dxf", extension:"dxf", sha256:"a", sizeBytes:10}),
  Object.freeze({fileId:"cloud-b", originalName:"duplicate.dxf", extension:"dxf", sha256:"b", sizeBytes:20}),
  Object.freeze({fileId:"cloud-c", originalName:"part.ord", extension:"ord", sha256:"c", sizeBytes:30})
]);
function harness({id="job", completed=false, saved, canWrite=true, confirm=true} = {}){
  const shared = Object.freeze({id:"legacy",name:"same.dxf",source:"onedrive",url:"https://example.test/source"});
  const job = {id,files:[shared,{id:"keep",name:"same.dxf"}],notes:"keep",manualLogs:[{completedHours:2}]};
  const other = {id:"other",files:[shared],notes:"unchanged"};
  const messages=[], dialogs=[], state={renders:0,saves:0,confirmations:0};
  const window = {cuttingJobs:completed?[other]:[job,other],completedCuttingJobs:completed?[job]:[],confirm:()=>{state.confirmations++;return confirm;}};
  const context = vm.createContext({window,console:{error(...args){state.error=args.map(String).join(" ");}},document:{querySelectorAll:()=>dialogs},
    cfr05CloudPresentation:{peek:()=>({files:metadata})},canWriteCloud:()=>canWrite,
    toast:value=>messages.push(value),renderJobs:()=>state.renders++,
    saveCloudNow:async()=>{state.saves++;return typeof saved === "function" ? saved(context) : (saved || {saved:true,stateWriteCompleted:true});}});
  vm.runInContext(helpers + removal, context);
  return {context,window,job,other,shared,messages,dialogs,state,remove:options=>context.removeCuttingJobAttachmentReference(String(id),options)};
}

for (const id of [123,"123",0,"job"]){
  test(`legacy unlink preserves other references and IDs (${typeof id} ${id})`, async()=>{
    const h=harness({id}), before=clone(h.other), logs=clone(h.job.manualLogs);
    const result=await h.remove({fileIndex:0});
    assert.equal(result.saved,true);assert.equal(h.job.id,id);
    assert.equal(h.job.files.length,1);assert.equal(h.job.files[0].id,"keep");
    assert.deepEqual(h.other,before);assert.equal(h.other.files[0],h.shared);
    assert.deepEqual(h.job.manualLogs,logs);assert.equal(h.job.notes,"keep");
    assert.equal(Object.hasOwn(h.job,"unlinkedCloudFileIds"),false);
    assert.equal(h.state.saves,1);assert.equal(h.state.renders,2);
    assert.deepEqual(h.messages,["Attachment removed from job."]);
  });
}
test("legacy final reference is removed without touching the source/cache",async()=>{
  const h=harness();h.job.files=[h.shared];await h.remove({fileIndex:0});
  assert.equal(h.job.files.length,0);assert.equal(h.other.files[0],h.shared);
});
for(const completed of [false,true]){
  test(`cloud unlink is file-ID-specific, job-specific and supports completed=${completed}`,async()=>{
    const h=harness({completed}),before=clone(h.other),legacy=clone(h.job.files);
    await h.remove({cloudFileId:"cloud-a"});
    assert.deepEqual(clone(h.job.unlinkedCloudFileIds),["cloud-a"]);
    assert.deepEqual(clone(h.context.filterAttachedCuttingJobCloudFiles("job",metadata)).map(f=>f.fileId),["cloud-b","cloud-c"]);
    assert.equal(h.context.filterAttachedCuttingJobCloudFiles("other",metadata).length,3);
    assert.deepEqual(h.other,before);assert.deepEqual(h.job.files,legacy);
    assert.equal(Object.hasOwn(h.other,"unlinkedCloudFileIds"),false);
    assert.equal(metadata.length,3);assert.equal(Object.isFrozen(metadata[0]),true);
  });
}
test("absent optional field is read-only and the final cloud attachment stays unlinked",async()=>{
  const h=harness(),before=clone(h.job);
  assert.equal(h.context.filterAttachedCuttingJobCloudFiles("job",metadata).length,3);
  assert.deepEqual(h.job,before);
  for(const file of metadata)await h.remove({cloudFileId:file.fileId});
  assert.equal(h.context.filterAttachedCuttingJobCloudFiles("job",metadata).length,0);
  const saves=h.state.saves;await h.remove({cloudFileId:"cloud-a"});assert.equal(h.state.saves,saves);
});
test("cancel, read-only gates, malformed unlink fields and invalid indices never mutate/save",async()=>{
  for(const options of [{confirm:false},{canWrite:false}]){
    const h=harness(options),before=clone(h.job);await h.remove({cloudFileId:"cloud-a"});
    assert.deepEqual(h.job,before);assert.equal(h.state.saves,0);
  }
  const h=harness();h.job.unlinkedCloudFileIds={unexpected:"preserve"};const before=clone(h.job);
  await h.remove({cloudFileId:"cloud-a"});
  for(const fileIndex of [-1,0.5,NaN,99])await h.remove({fileIndex});
  await h.remove({cloudFileId:"missing"});
  assert.deepEqual(h.job,before);assert.equal(h.state.saves,0);
});
test("ambiguous job identities fail without changing either record",async()=>{
  const h=harness();h.window.completedCuttingJobs.push({id:"job",files:[]});
  await h.remove({cloudFileId:"cloud-a"});assert.equal(h.state.saves,0);
  assert.equal(Object.hasOwn(h.job,"unlinkedCloudFileIds"),false);
});
for(const cloud of [false,true]){
  test(`definite failed save rolls back only the owned ${cloud?"cloud":"legacy"} mutation`,async()=>{
    const h=harness({saved:{saved:false,stateWriteAttempted:false,stateWriteCompleted:false,error:"denied"}}),before=clone(h.job);
    await h.remove(cloud?{cloudFileId:"cloud-a"}:{fileIndex:0});
    assert.deepEqual(h.job,before);assert.match(h.messages.at(-1),/not saved.*restored/);
    assert.equal(h.messages.includes("Attachment removed from job."),false);
  });
}
test("save conflicts restore preexisting unlink IDs and preserve concurrent job edits",async()=>{
  const h=harness({saved:()=>{h.job.notes="concurrent note";return{saved:false,definiteFailure:true,stateWriteAttempted:true};}});
  h.job.unlinkedCloudFileIds=["prior"];await h.remove({cloudFileId:"cloud-a"});
  assert.deepEqual(clone(h.job.unlinkedCloudFileIds),["prior"]);assert.equal(h.job.notes,"concurrent note");
});
test("a failed save cannot roll back concurrent attachment changes",async()=>{
  const h=harness({saved:()=>{h.job.files.push({id:"concurrent"});return{saved:false,stateWriteAttempted:false};}});
  await h.remove({fileIndex:0});assert.deepEqual(h.job.files.map(f=>f.id),["keep","concurrent"]);
  assert.match(h.messages.at(-1),/could not be confirmed/);
});
test("unknown/indeterminate writes keep evidence and never claim success or retry",async()=>{
  for(const saved of [{saved:false,indeterminate:true,stateWriteAttempted:true},()=>{throw Error("network");},()=>undefined]){
    const h=harness({saved});await h.remove({cloudFileId:"cloud-a"});
    assert.deepEqual(clone(h.job.unlinkedCloudFileIds),["cloud-a"]);assert.equal(h.state.saves,1);
    assert.match(h.messages.at(-1),/Reload and verify/);
  }
});
test("pending removal updates UI immediately, suppresses double clicks and waits for success",async()=>{
  let finish;const h=harness({saved:()=>new Promise(resolve=>{finish=resolve;})});
  const first=h.remove({cloudFileId:"cloud-a"});
  assert.equal(h.context.filterAttachedCuttingJobCloudFiles("job",metadata).length,2);
  assert.equal(h.messages.includes("Attachment removed from job."),false);
  await h.remove({cloudFileId:"cloud-b"});assert.equal(h.state.saves,1);
  finish({saved:true,stateWriteCompleted:true});await first;
  assert.equal(h.messages.at(-1),"Attachment removed from job.");
});
test("removal closes only dialogs belonging to its job",async()=>{
  const h=harness();const closed=[];
  for(const id of ["job","other"])h.dialogs.push({dataset:{cfr05JobId:id},close:()=>closed.push(id),remove(){}});
  await h.remove({cloudFileId:"cloud-a"});assert.deepEqual(closed,["job"]);
});

function installCloudMarkup(h){
  Object.assign(h.context,{esc:String});
  h.window.cfr05CloudPresentation=h.context.cfr05CloudPresentation;
  h.window.cfr05CloudPreviewSelection=new Map([["job","cloud-a"]]);
  vm.runInContext(extract(views,"  const cloudPresentationForJob =","  const buildFileCellMarkup =")+"this.cloudMarkup=buildCloudFileMarkup;",h.context);
}
test("regular/edit markup filters cached metadata, selects remaining DXF and exposes all edit Remove controls",async()=>{
  const h=harness();installCloudMarkup(h);
  const initial=h.context.cloudMarkup("job",{editing:true});
  for(const file of metadata)assert.ok(initial.includes(`data-unlink-cloud-file="${file.fileId}"`));
  assert.equal(h.context.cloudMarkup("job").includes("data-unlink-cloud-file"),false);
  await h.remove({cloudFileId:"cloud-a"});const html=h.context.cloudMarkup("job",{editing:true});
  assert.equal(html.includes('="cloud-a"'),false);assert.ok(html.includes('data-cfr05-download="cloud-b"'));
  assert.ok(html.includes('data-unlink-cloud-file="cloud-c"'));
  assert.ok(h.context.cloudMarkup("other",{editing:true}).includes('data-unlink-cloud-file="cloud-a"'));
  assert.equal(h.context.cfr05CloudPresentation.peek("job").files.length,3);
});
test("actual Edit event and view lookup support string and numeric stored job IDs",()=>{
  const event=renderers.match(/if \(ed\)\{[^\r\n]+/)[0];
  const lookup=views.match(/const editing = editingJobs\.has\([^;]+;/)[0];
  for(const id of [123,"123"]){
    const editingJobs=new Set(),context=vm.createContext({editingJobs,j:{id},ed:{getAttribute:()=>String(id)},closeFileMenu(){},closeActionMenu(){},renderJobs(){}});
    vm.runInContext(`(function(){${event}})();${lookup}this.editing=editing;`,context);
    assert.equal(context.editing,true);assert.equal(context.j.id,id);
  }
});
test("stale download/open/enlarge/hydration actions cannot reopen an unlinked file",async()=>{
  const h=harness();h.job.unlinkedCloudFileIds=["cloud-a"];
  h.window.openCfr05CloudFile=()=>{throw Error("must not fetch/open");};
  vm.runInContext(extract(renderers,"  const downloadVerifiedCloudFile =","  const showCloudFilesDialog =")+"this.download=downloadVerifiedCloudFile;this.open=openVerifiedCloudFile;",h.context);
  assert.equal(await h.context.download({},"job","cloud-a",{}),null);
  assert.equal(await h.context.open("job","cloud-a",{},{}),null);
  vm.runInContext(extract(renderers,"async function hydrateCfr05DxfPreview","window.getCfr05CloudPreviewDiagnostics"),h.context);
  assert.equal(await h.context.hydrateCfr05DxfPreview({dataset:{cfr05JobId:"job",cfr05FileId:"cloud-a",cfr05Sha256:"a"}}),null);
  vm.runInContext(extract(renderers,"  const handleCuttingJobFileActionClick =","  const handleRootFileActionClick =")+"this.action=handleCuttingJobFileActionClick;",h.context);
  const e={target:{closest:selector=>selector==="[data-cfr05-enlarge-preview]"?{dataset:{cfr05JobId:"job",cfr05EnlargePreview:"cloud-a",cfr05Sha256:"a"}}:null},preventDefault(){},stopPropagation(){}};
  assert.equal(await h.context.action(e),true);
});
test("Cloud Files dialog filters refreshed immutable metadata and counts only attached files",async()=>{
  const h=harness();h.job.unlinkedCloudFileIds=["cloud-a"];
  const loading={outerHTML:""},dialog={dataset:{},setAttribute(){},showModal(){},addEventListener(){},querySelector:()=>loading};
  h.context.document={createElement:()=>dialog,body:{appendChild(){}}};
  h.context.escapeHtml=String;h.context.refreshCfr05CloudPresentation=async()=>({files:metadata,cloudFileCount:3});
  vm.runInContext(extract(renderers,"  const showCloudFilesDialog =","  const handleCuttingJobFileActionClick =")+"this.dialog=showCloudFilesDialog;",h.context);
  await h.context.dialog("job",{dataset:{}});
  assert.equal(loading.outerHTML.includes('data-cfr05-action-open="cloud-a"'),false);
  assert.ok(loading.outerHTML.includes('data-cfr05-action-open="cloud-b"'));
  assert.ok(loading.outerHTML.includes("2 attached"));assert.equal(dialog.dataset.cfr05JobId,"job");
});
test("actual delegated cloud and legacy buttons invoke exactly one job-level save",async()=>{
  for(const cloud of [false,true]){
    const h=harness();let stopped=false;
    vm.runInContext(extract(renderers,"  const handleCuttingJobFileActionClick =","  const handleRootFileActionClick =")+"this.action=handleCuttingJobFileActionClick;",h.context);
    const selector=cloud?"[data-unlink-cloud-file]":"[data-remove-file]";
    const attrs=cloud?{"data-cfr05-job-id":"job","data-unlink-cloud-file":"cloud-a"}:{"data-remove-file":"job","data-file-index":"0"};
    const event={target:{closest:value=>value===selector?{getAttribute:key=>attrs[key]}:null},preventDefault(){},stopPropagation(){},stopImmediatePropagation(){stopped=true;}};
    assert.equal(await h.context.action(event),true);assert.equal(stopped,true);assert.equal(h.state.saves,1);
    assert.equal(cloud?h.job.unlinkedCloudFileIds[0]:h.job.files[0].id,cloud?"cloud-a":"keep");
  }
});
test("a download already in flight cannot open the file after it becomes unlinked",async()=>{
  const h=harness();let anchors=0;
  h.context.document={createElement:()=>{anchors++;return{};}};
  h.window.openCfr05CloudFile=async(_job,_file,callbacks)=>{
    h.job.unlinkedCloudFileIds=["cloud-a"];
    await callbacks.openObjectUrl("blob:fixture",{safeFileName:"part.dxf"});
    return{completed:true,opened:true};
  };
  h.context.reportCloudOpenResult=()=>{};
  vm.runInContext(extract(renderers,"  const downloadVerifiedCloudFile =","  const openVerifiedCloudFile =")+"this.download=downloadVerifiedCloudFile;",h.context);
  await h.context.download({dataset:{},textContent:"Download"},"job","cloud-a",{});
  assert.equal(anchors,0);
});

function installPersistenceComponents(h){
  const names=["totalHistory","tasksInterval","tasksAsReq","inventory","cuttingJobs","completedCuttingJobs","orderRequests","garnetCleanings","dailyCutHours","opportunityRollups","weeklyCostReports","receiptTrackerWeeks","maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2","deletedItems","appConfig","jobFolders","orderRequestTab"];
  Object.assign(h.context,{APP_SCHEMA:1,cloneStructured:clone,normalizeInventoryMaterials:value=>value||{},normalizeAppConfig:value=>value||{},
    snapshotSettingsFolders:()=>[],snapshotJobFolders:()=>[],cloneFolders:()=>[],getCloudSyncClientId:()=>"test",
    readJobFileCache:()=>({}),syncJobFileCacheFromJobs(){},writeJobFileCache(){},
    isLikelyEmbeddedFileContent:()=>false,isSafeMetadataString:()=>true,isProtectedBusinessDataKey:()=>true,
    defaultIntervalTasks:[],defaultAsReqTasks:[],normalizeInventoryItem:value=>value,ensureInventoryForAllMaintenanceTasks(){},
    normalizeOrderRequests:value=>value,normalizeDailyCutHours:value=>value,normalizeDeletedItems:value=>value,
    purgeExpiredDeletedItems(){},setSettingsFolders:value=>{h.window.settingsFolders=value||[];},setJobFolders:value=>{h.window.jobFolders=value||[];},
    ensureTaskCategories(){},ensureJobCategories(){},syncRenderTotalsFromHistory(){}});
  h.window.orderRequests=[{id:"draft",status:"draft"}];
  h.window.jobFolders=[];
  vm.runInContext(names.map(name=>`let ${name}=[];`).join("")+"let lastAppliedCloudRevision=7;"+
    extract(core,"function refreshGlobalCollections","if (!(window.editingJobs")+
    extract(core,"function snapshotState","function scanAuthoritativeCutFileContent")+
    extract(core,"function sanitizeValueForStorage","function estimateTopLevelFieldSizes")+
    extract(core,"function compactStateForStorage","function buildEmergencyBackup")+
    extract(core,"function adoptState(doc","const maintenanceV2RepairAuthorizations"),h.context);
}
test("real snapshot/compaction, atomic transaction and normal adoption preserve unlink state after reload",async()=>{
  const h=harness();installPersistenceComponents(h);let cloud={syncMeta:{rev:7}},commits=0;
  const db={runTransaction:async callback=>{let next;await callback({get:async()=>({exists:true,data:()=>clone(cloud)}),set:(_ref,value)=>{next=clone(value);}});cloud=next;commits++;}};
  h.context.saveCloudNow=()=>atomic.save({db,docRef:{path:"workspaces/fixture/app/state"},
    state:h.context.compactStateForStorage(h.context.snapshotState()),expectedRevision:7,scan:firewall.scanCuttingFileContent,clientId:"fixture",now:()=>10});
  const otherBefore=clone(h.other);await h.remove({cloudFileId:"cloud-a"});
  assert.equal(commits,1,h.state.error || h.messages.join(" "));assert.deepEqual(cloud.cuttingJobs[0].unlinkedCloudFileIds,["cloud-a"]);
  assert.deepEqual(cloud.cuttingJobs[1],otherBefore);assert.equal(Object.hasOwn(cloud.cuttingJobs[1],"unlinkedCloudFileIds"),false);
  assert.equal(identities.integrity(cloud).valid,true,"the optional unlink field must not trigger identity recovery");
  h.window.cuttingJobs=[];h.context.adoptState(clone(cloud));
  assert.deepEqual(clone(h.context.filterAttachedCuttingJobCloudFiles("job",metadata)).map(f=>f.fileId),["cloud-b","cloud-c"]);
  assert.equal(h.context.filterAttachedCuttingJobCloudFiles("other",metadata).length,3);
});
test("CJA removal uses only the existing state save; no Storage, Graph or secure metadata writes",()=>{
  assert.match(removal,/await saveCloudNow\(\)/);assert.match(removal,/files\.splice\(fileIndex, 1\)/);
  assert.doesNotMatch(removal.replace("pendingCuttingJobAttachmentRemovals.delete(id)",""),/\.storage|fileDocRef|\.delete\(|\.batch\(|\.doc\(|\.update\(|fetch\(|oneDriveGraph|localStorage/);
  const route=extract(renderers,"  const handleRootFileActionClick =","  const handleDocumentReferenceAttachClick =");
  assert.ok(route.includes("[data-unlink-cloud-file]"));
  assert.equal((views.match(/buildCloudFileMarkup\([^\n]+editing:true/g)||[]).length,2);
});
