"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const history=require("../js/cuttingJobHistory"),chronology=require("../js/cuttingJobChronology");
const c=vm.createContext({JOB_RATE_PER_HOUR:250,JOB_BASE_COST_PER_HOUR:30,CuttingJobChronology:chronology});
vm.runInContext(fs.readFileSync("js/computations.js","utf8"),c);vm.runInContext(fs.readFileSync("js/projects.js","utf8"),c);
const api=c.ProjectDashboard;
const row={id:"job",navigable:true,filesKnown:true,files:[]};
const clear=()=>{delete c.cfr05CloudPresentation;delete c.filterAttachedCuttingJobCloudFiles;};
const metadata=(value,loading=false)=>{c.cfr05CloudPresentation={peek:()=>value,isLoading:()=>loading};c.filterAttachedCuttingJobCloudFiles=(_id,files)=>files.filter(f=>f.fileId!=="unlinked");};

test("ACC09 projects sort numerically descending, preserving leading zeros and unusual identifiers",()=>{
  const folders=["9","1304","0000","1305","XXXX","1254","ALAMO"].map(number=>({id:number,name:history.canonicalCategoryName(number)||`${number} Project ${number}`,projectNumber:number}));
  const result=api.build({jobFolders:folders},history,c.computeCuttingJobProfit);
  assert.equal(result.projects.map(p=>p.number).join(","),"1305,1304,1254,9,0000,ALAMO,XXXX");assert.equal(result.projects.find(p=>p.id==="0000").number,"0000");
});

test("ACC09 equal numerical project values use stable label and ID ordering",()=>{
  const folders=[{id:"z",name:"same",projectNumber:"1"},{id:"b",name:"same",projectNumber:"1"},{id:"a",name:"Alpha",projectNumber:"1"}],resolver={ROOT_ID:"root",leadingProject:()=>"",resolveCategoryProject:()=>({ok:true,projectNumber:"1"})};
  assert.equal(api.build({jobFolders:folders},resolver,c.computeCuttingJobProfit).projects.map(p=>p.id).join(","),"a,b,z");
});

test("ACC09 unchecked, loading, blocked, rejected and unavailable cloud metadata never imply absence",()=>{
  clear();assert.match(api.filesMarkup(row),/Cloud files not checked/);assert.doesNotMatch(api.filesMarkup(row),/No files/);
  for(const value of [{error:{code:"permission-denied"},files:[]},{blockers:["authenticationRequired"],files:[]},{rejectedMetadataDocumentCount:1,files:[]}]){
    metadata(value);assert.match(api.filesMarkup(row),/unavailable or incomplete/);assert.doesNotMatch(api.filesMarkup(row),/No files/);
  }
  metadata(null,true);assert.match(api.filesMarkup(row),/Checking secure cloud files/);assert.match(api.filesMarkup(row),/disabled/);clear();
});

test("ACC09 only complete authoritative empty metadata plus known legacy array confirms no files",()=>{
  metadata({files:[],blockers:[],error:null});assert.match(api.filesMarkup(row),/No files/);
  assert.doesNotMatch(api.filesMarkup({...row,filesKnown:false}),/No files/);assert.match(api.filesMarkup({...row,filesKnown:false}),/legacy attachment metadata not recorded/);clear();
});

test("ACC09 metadata lists local and cloud names with existing unlink filtering and original-job access only",()=>{
  metadata({files:[{fileId:"cloud",originalName:"secure.dxf",storagePath:"SECRET_STORAGE",downloadUrl:"https://private.invalid/TOKEN"},{fileId:"unlinked",originalName:"removed.dxf"}]});
  const r={...row,files:[{name:"local.dxf",local:true},{name:'<img src=x onerror="bad">',local:false}]},before=structuredClone(r),html=api.filesMarkup(r);
  assert.match(html,/3 files/);assert.match(html,/local.dxf/);assert.match(html,/secure.dxf/);assert.match(html,/verified local root required/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/removed.dxf|SECRET_STORAGE|TOKEN|href=|<img|data-cloud-file-upload|data-remove-file/);assert.equal((html.match(/data-project-file-job="job"/g)||[]).length,3);assert.deepEqual(r,before);clear();
});

test("ACC09 duplicate identity rows expose no file action or cloud query",()=>{
  clear();assert.match(api.filesMarkup({...row,navigable:false}),/Identity review required/);assert.doesNotMatch(api.filesMarkup({...row,navigable:false}),/button|details/);
});

test("ACC09 attachment presentation copies lightweight names only and preserves complete protected state",()=>{
  clear();const record={id:"job",cat:"mesquite",projectNumber:"1242",estimateHours:2,chargeRate:200,costRate:45,materialCost:10,materialQty:1,files:[{name:"local.dxf",source:"wj_cuts_reference",rootId:"ROOT_SECRET",relativePath:"PRIVATE_PATH"},{name:"legacy.ord",url:"https://private.invalid/TOKEN",dataUrl:"HUGE_BYTES"}]};
  const s={jobFolders:[{id:"mesquite",name:"1242 Mesquite",color:"#ff0000"}],cuttingJobs:[record],completedCuttingJobs:[],inventory:[{id:"keep"}],syncMeta:{rev:7}},before=structuredClone(s);
  const freeze=o=>{if(o&&typeof o==="object"){Object.freeze(o);Object.values(o).forEach(freeze);}};freeze(s);
  const p=api.build(s,history,c.computeCuttingJobProfit).projects[0],html=api.summary(p);assert.equal(p.rows[0].files.length,2);assert.equal(p.rows[0].filesKnown,true);assert.equal(p.provisional.value,300);
  assert.doesNotMatch(JSON.stringify(p.rows[0].files),/ROOT_SECRET|PRIVATE_PATH|TOKEN|HUGE_BYTES/);assert.doesNotMatch(html,/ROOT_SECRET|PRIVATE_PATH|TOKEN|HUGE_BYTES/);assert.deepEqual(s,before);
});
