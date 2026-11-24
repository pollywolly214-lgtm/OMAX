"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {createCache,createPreviewCache}=require("../js/cloudFilePresentation.js");
const source=fs.readFileSync("js/renderers.js","utf8");
const metadata=source.slice(source.indexOf("function hydrateVisibleCfr05CloudFiles("),source.indexOf("async function hydrateCfr05DxfPreview("));
const preview=source.slice(source.indexOf("function setupCfr05InlinePreviewHydration("),source.indexOf("function wireCuttingJobNetBreakdowns("));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function harness(kind){
  let finish,rendered=0,requests=0,observe;
  const root={},target={dataset:{cfr05JobId:"job",cfr05FileId:"file",cfr05Sha256:"a".repeat(64)},getAttribute:()=>"job"};
  const content={firstElementChild:root,querySelectorAll:selector=>selector==="[data-cfr05-dxf-select]"?[]:[target],contains:node=>node===target};
  const cache=createCache(),previews=createPreviewCache(),read=()=>{requests++;return new Promise(resolve=>{finish=resolve;});};
  const context={document:{getElementById:()=>content},location:{hash:"#/jobs"},window:{listCfr05CloudFiles:()=>{}},
    cfr05CloudPresentation:cache,cfr05CloudPreviewCache:previews,
    refreshCfr05CloudPresentation:id=>cache.load(id,read),
    hydrateCfr05DxfPreview:node=>previews.load({jobId:node.dataset.cfr05JobId,fileId:node.dataset.cfr05FileId,sha256:node.dataset.cfr05Sha256},read),
    renderJobs:()=>rendered++};
  context.window.IntersectionObserver=context.IntersectionObserver=class{
    constructor(callback){observe=()=>callback([{isIntersecting:true,target}]);}observe(){}unobserve(){}disconnect(){}
  };
  vm.runInNewContext(kind==="metadata"?metadata:preview,context);
  const start=()=>{if(kind==="metadata")context.hydrateVisibleCfr05CloudFiles(content);else{context.setupCfr05InlinePreviewHydration(content);observe();}};
  start();await Promise.resolve();
  return{context,content,requests:()=>requests,renders:()=>rendered,finish:()=>finish({}),activate:()=>observe(),start};
}
for(const kind of ["metadata","preview"]){
  test(`delayed ${kind} refreshes the still-current Jobs view`,async()=>{
    const h=await harness(kind);assert.equal(h.requests(),1);h.finish();await flush();assert.equal(h.renders(),1);
  });
  test(`delayed ${kind} cannot replace Deleted History after navigation`,async()=>{
    const h=await harness(kind);h.context.location.hash="#/deleted";h.finish();await flush();assert.equal(h.renders(),0);
  });
  test(`delayed ${kind} cannot replace a newer rendering of the same route`,async()=>{
    const h=await harness(kind);h.content.firstElementChild={};h.finish();await flush();assert.equal(h.renders(),0);
  });
  test(`new Jobs view receives pending ${kind} with one shared backend read`,async()=>{
    const h=await harness(kind);h.content.firstElementChild={};h.start();await Promise.resolve();
    assert.equal(h.requests(),1,"new views share the in-flight request");
    h.finish();await flush();assert.equal(h.renders(),1,"only the current view refreshes after the shared read");
  });
}
test("queued preview observation after navigation starts no additional download",async()=>{
  const h=await harness("preview");h.finish();await flush();
  h.context.cfr05CloudPreviewCache.clear();h.context.location.hash="#/deleted";h.activate();await Promise.resolve();
  assert.equal(h.requests(),1);
});
