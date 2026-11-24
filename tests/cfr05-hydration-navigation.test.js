"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("js/renderers.js","utf8");
const metadata=source.slice(source.indexOf("function hydrateVisibleCfr05CloudFiles("),source.indexOf("async function hydrateCfr05DxfPreview("));
const preview=source.slice(source.indexOf("function setupCfr05InlinePreviewHydration("),source.indexOf("function wireCuttingJobNetBreakdowns("));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(kind){
  let finish,rendered=0,requests=0,observe;
  const root={},target={dataset:{cfr05JobId:"job",cfr05FileId:"file",cfr05Sha256:"a".repeat(64)},getAttribute:()=>"job"};
  const content={firstElementChild:root,querySelectorAll:selector=>selector==="[data-cfr05-dxf-select]"?[]:[target],contains:node=>node===target&&content.firstElementChild===root};
  const context={document:{getElementById:()=>content},location:{hash:"#/jobs"},window:{listCfr05CloudFiles:()=>{}},
    cfr05CloudPresentation:{has:()=>false,isLoading:()=>false},cfr05CloudPreviewCache:{has:()=>false,isLoading:()=>false},
    refreshCfr05CloudPresentation:()=>{requests++;return new Promise(resolve=>{finish=resolve;});},
    hydrateCfr05DxfPreview:()=>{requests++;return new Promise(resolve=>{finish=resolve;});},
    renderJobs:()=>rendered++};
  context.window.IntersectionObserver=context.IntersectionObserver=class{
    constructor(callback){observe=()=>callback([{isIntersecting:true,target}]);}observe(){}unobserve(){}disconnect(){}
  };
  vm.runInNewContext(kind==="metadata"?metadata:preview,context);
  if(kind==="metadata")context.hydrateVisibleCfr05CloudFiles(content);
  else{context.setupCfr05InlinePreviewHydration(content);observe();}
  return{context,content,requests:()=>requests,renders:()=>rendered,finish:()=>finish({}),activate:()=>observe()};
}
for(const kind of ["metadata","preview"]){
  test(`delayed ${kind} refreshes the still-current Jobs view`,async()=>{
    const h=harness(kind);assert.equal(h.requests(),1);h.finish();await flush();assert.equal(h.renders(),1);
  });
  test(`delayed ${kind} cannot replace Deleted History after navigation`,async()=>{
    const h=harness(kind);h.context.location.hash="#/deleted";h.finish();await flush();assert.equal(h.renders(),0);
  });
  test(`delayed ${kind} cannot replace a newer rendering of the same route`,async()=>{
    const h=harness(kind);h.content.firstElementChild={};h.finish();await flush();assert.equal(h.renders(),0);
  });
}
