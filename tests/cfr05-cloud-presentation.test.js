"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");
const {createCache}=require("../js/cloudFilePresentation.js");

(async()=>{
  const cache=createCache();
  let reads=0,resolveRead;
  const loader=jobId=>{reads+=1;return new Promise(resolve=>{resolveRead=()=>resolve({jobId,files:[{fileId:"f1",originalName:"part.dxf",extension:"dxf",contentType:"application/dxf",sizeBytes:618496}],cloudFileCount:1,rejectedMetadataDocumentCount:0,blockers:[],error:null});});};
  const first=cache.load("job_1",loader),duplicate=cache.load("job_1",loader);
  assert.equal(first,duplicate,"in-flight reads are deduplicated");
  assert.equal(reads,0,"loader starts in a bounded microtask");
  await Promise.resolve();assert.equal(reads,1);
  resolveRead();const result=await first;
  assert.equal(result.files[0].originalName,"part.dxf");
  assert.equal(cache.peek("job_1").files.length,1);
  await cache.load("job_1",loader);assert.equal(reads,1,"cached render does not issue another query");
  let refreshes=0;await cache.load("job_1",async id=>{refreshes+=1;return{jobId:id,files:[],cloudFileCount:0};},{force:true});
  assert.equal(refreshes,1,"an exact-job forced refresh is supported");
  assert.deepEqual(cache.diagnostics(),{cachedJobCount:1,inFlightJobCount:0,persistent:false});
  let failedReads=0;const failed=await cache.load("job_failed",async()=>{failedReads+=1;throw Object.assign(Error("denied"),{code:"permission-denied"});});
  assert.equal(failed.error.code,"permission-denied");await cache.load("job_failed",async()=>{failedReads+=1;return{};});assert.equal(failedReads,1,"failed listing is cached to prevent a render-query loop");
  assert.equal(JSON.stringify(cache).includes("part.dxf"),false,"transient cache is not serializable into app state");

  const views=fs.readFileSync("js/views.js","utf8"),renderers=fs.readFileSync("js/renderers.js","utf8"),core=fs.readFileSync("js/core.js","utf8");
  assert.match(views,/Secure cloud · \$\{esc\(String\(file\.extension/);
  assert.match(views,/data-cfr05-presented-open/);
  assert.match(views,/cloudMarkup \|\| '<div class="job-file-preview-empty small muted">No files attached<\/div>'/);
  assert.match(views,/Reference folder/);assert.match(views,/OneDrive/);assert.match(views,/No local\/reference files attached/);
  assert.match(renderers,/hydrateVisibleCfr05CloudFiles/);
  assert.match(renderers,/!cfr05CloudPresentation\.has\(id\) && !cfr05CloudPresentation\.isLoading\(id\)/);
  assert.match(renderers,/refreshCfr05CloudPresentation\(jobId,\{force:true\}\)/,"successful existing-job upload refreshes only its exact job");
  assert.match(renderers,/refreshCfr05CloudPresentation\(newJob\.id,\{force:true\}\)/,"successful new-job uploads refresh only the new job");
  assert.doesNotMatch(core,/cloudFilesByJobId|cfr05CloudPresentation/,"transient presentation cache is absent from core persistence");
  for(const source of [views,renderers,core]) assert.doesNotMatch(source,/localStorage[^\n]*cfr05Cloud|snapshotState\([^\n]*cfr05Cloud/);
  assert.doesNotMatch(renderers,/job\.files\s*=\s*.*cloud|cuttingJobs.*cloudFile|completedCuttingJobs.*cloudFile/i);
  console.log("ok - CFR-05 transient cloud presentation is bounded, separate, and renderable");
})().catch(error=>{console.error(error);process.exitCode=1;});
