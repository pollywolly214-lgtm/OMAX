"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const history=require("../js/cuttingJobHistory");
const root={id:"jobs_root",name:"All Jobs",parent:null,order:1};
const blanco={id:"blanco",name:"1254 Blanco"},mesquite={id:"mesquite",name:"1242 Mesquite"};
const resolve=(folder,jobs=[])=>history.resolveCategoryProject(folder.id,[root,folder],jobs);
const core=fs.readFileSync("js/core.js","utf8");
function fn(name){const start=core.indexOf(`function ${name}(`);assert.ok(start>=0);return core.slice(start,core.indexOf("\n}",start)+2);}
function env(folders=[root,blanco,mesquite],active=[],completed=[]){
  const messages=[],window={CuttingJobHistory:history,jobFolders:structuredClone(folders),cuttingJobs:active,completedCuttingJobs:completed};
  const c=vm.createContext({window,toast:message=>messages.push(message),JOB_ROOT_FOLDER_ID:"jobs_root",genId:()=>"new-category",normalizeHexColor:()=>null,
    ensureJobFolderState:()=>window.jobFolders,setJobFolders:value=>{window.jobFolders=value;},ensureJobCategories:()=>{throw Error("Unexpected historical normalization");}});
  vm.runInContext(["validateManualJobProjectCategory","applyManualJobProjectCategory","addJobFolder"].map(fn).join("\n"),c);
  return{c,window,messages};
}

test("all confirmed categories invert canonical, bare and supported reversed names",()=>{
  for(const [project,canonical]of history.PROJECT_CATEGORIES){
    const bare=project==="ALAMO"?canonical:canonical.slice(project.length).trim();
    for(const name of new Set([canonical,bare,`${bare} ${project}`])){
      if(project==="ALAMO"&&name!==canonical)continue;
      const pair=resolve({id:"f",name});assert.equal(pair.ok,true,name);assert.equal(pair.projectNumber,project);
    }
  }
});
test("0000, XXXX, ALAMO and future leading-zero metadata remain strings",()=>{
  for(const [project,name]of [["0000","0000 Company Improvements"],["XXXX","XXXX Undisclosed Project"],["ALAMO","ALAMO"],["0012","0012 Future Project"]]){
    const folder={id:"f",name,projectNumber:project};const pair=resolve(folder);
    assert.equal(pair.projectNumber,project);assert.equal(typeof pair.projectNumber,"string");
  }
  assert.equal(resolve({id:"f",name:"Future Project",projectNumber:"0012"}).projectNumber,"0012");
});
test("mismatched, missing and manipulated project input cannot save",()=>{
  for(const project of ["1242","", "1254junk", "00001254"]){
    assert.equal(history.validateManualProjectCategory("blanco",project,[root,blanco,mesquite]).ok,false);
  }
  assert.equal(history.validateManualProjectCategory("blanco"," 1254 ",[root,blanco]).projectNumber,"1254");
});
test("unknown names never acquire ownership from supplied project input",()=>{
  const folders=[root,{id:"unknown",name:"Smith County"}];
  for(const project of ["1305","1306"]){const r=history.validateManualProjectCategory("unknown",project,folders);assert.equal(r.ok,false);assert.match(r.reason,/project-number review/);}
  for(const folder of [root,{id:"unknown",name:"Colin"},{id:"bad",name:"1254 ATM"},{id:"bad",name:"1111 Company Improvements"}])assert.equal(resolve(folder).ok,false);
});
test("mixed ownership, duplicate project folders, duplicate IDs and missing folders block",()=>{
  const cases=[
    [[root,blanco,{id:"other",name:"Blanco"}],[]],
    [[root,blanco,{...blanco,name:"Other"}],[]],
    [[root,{...blanco,projectNumber:"1242"}],[]],
    [[root,blanco],[{cat:"blanco",projectNumber:"1242"}]],
    [[root,blanco],[{cat:"blanco",projectNumber:"1254"},{cat:"blanco",projectNumber:"1242"}]],
    [[root],[]]
  ];
  for(const [folders,jobs]of cases)assert.equal(history.resolveCategoryProject("blanco",folders,jobs).ok,false);
});
test("linked jobs prove future ownership; obsolete names resolve without executing rename",()=>{
  assert.equal(resolve({id:"f",name:"Smith County"},[{cat:"f",projectNumber:"1305"}]).projectNumber,"1305");
  const folder={id:"f",name:"0000 Undisclosed Project",projectNumber:null,color:"#ABCDEF"},before=structuredClone(folder);
  assert.equal(resolve(folder,[{cat:"f",projectNumber:"0000"}]).projectNumber,"0000");assert.deepEqual(folder,before);
});
test("unchanged legacy pairs preserve types, whitespace, nulls and absent properties",()=>{
  for(const original of [{id:"j",projectNumber:"  xxxx ",cat:"missing"},{id:"j",projectNumber:0,cat:7},{id:"j",projectNumber:null,cat:null},{id:"j"},{id:"j",projectNumber:"1254",cat:"mesquite"}]){
    const before=structuredClone(original),h=env(undefined,[original]);
    const pair=h.c.validateManualJobProjectCategory(String(original.cat??""),String(original.projectNumber??""),original);
    assert.equal(pair.ok,true);assert.equal(pair.unchanged,true);h.c.applyManualJobProjectCategory(original,pair);assert.deepEqual(original,before);
  }
});
test("changing either side validates before mutation; edited job cannot veto its correction",()=>{
  const original={id:"j",projectNumber:"1242",cat:"blanco"},h=env(undefined,[original]),before=structuredClone(original);
  assert.equal(h.c.validateManualJobProjectCategory("blanco","1251",original).ok,false);assert.deepEqual(original,before);
  const pair=h.c.validateManualJobProjectCategory("blanco","1254",original);assert.equal(pair.ok,true);
  h.c.applyManualJobProjectCategory(original,pair);assert.deepEqual(original,{id:"j",projectNumber:"1254",cat:"blanco"});
  assert.equal(h.c.validateManualJobProjectCategory("jobs_root",undefined,original).ok,false);
});
test("a successful pair update preserves every unrelated field and other records",()=>{
  const original={id:"j",cat:"blanco",projectNumber:"1254",cutNumber:"C067",cutDateISO:"2026-01-02",cutOrderWithinDay:4,startISO:"2026-01-01",manualLogs:[{dateISO:"2026-01-02",completedHours:2}],files:[{fileId:"secure",storagePath:"keep/file"}],unlinkedCloudFileIds:["keep"],material:"Steel",materialCost:99,importProvenance:{sourceRowNumber:7},completedAtISO:"2026-01-02",custom:{keep:true}};
  const other={id:"other",cat:"missing",projectNumber:"legacy",cutNumber:"C068"},h=env(undefined,[],[original,other]),before=structuredClone(original),otherBefore=structuredClone(other),foldersBefore=structuredClone(h.window.jobFolders);
  const pair=h.c.validateManualJobProjectCategory("mesquite",undefined,original);assert.equal(pair.ok,true);h.c.applyManualJobProjectCategory(original,pair);
  assert.deepEqual(original,{...before,cat:"mesquite",projectNumber:"1242"});assert.deepEqual(other,otherBefore);assert.deepEqual(h.window.jobFolders,foldersBefore);
});
test("new manual categories validate before folder mutation and persist ownership metadata",()=>{
  const legacy={id:"old",cat:"missing",projectNumber:"Legacy"},h=env([root],[legacy]);
  const snapshot=()=>structuredClone({jobFolders:h.window.jobFolders,cuttingJobs:h.window.cuttingJobs});
  const before=snapshot();
  for(const [project,name]of [["1254","ATM"],["1111","Company Improvements"],["BAD","New"]]){
    assert.throws(()=>h.c.addJobFolder(name,"jobs_root",undefined,project));assert.deepEqual(snapshot(),before);
  }
  const folder=h.c.addJobFolder("Future Project","jobs_root",undefined,"0012");
  assert.equal(folder.name,"0012 Future Project");assert.equal(folder.projectNumber,"0012");assert.deepEqual(legacy,before.cuttingJobs[0]);
  assert.equal(history.resolveCategoryProject(folder.id,h.window.jobFolders).projectNumber,"0012");
  assert.throws(()=>h.c.addJobFolder("Future Project","jobs_root",undefined,"0012"));assert.equal(h.window.jobFolders.length,2);
});
