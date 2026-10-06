"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const history=require("../js/cuttingJobHistory");
const renderers=fs.readFileSync("js/renderers.js","utf8").replace(/\r\n/g,"\n"),core=fs.readFileSync("js/core.js","utf8"),views=fs.readFileSync("js/views.js","utf8");
const folders=[{id:"jobs_root",name:"All Jobs"},{id:"blanco",name:"1254 Blanco"},{id:"mesquite",name:"1242 Mesquite"},{id:"unknown",name:"Smith County"}];
function fn(source,name){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,name);return source.slice(start,source.indexOf("\n}",start)+2);}
function between(startToken,endToken){const start=renderers.indexOf(startToken),end=renderers.indexOf(endToken,start);assert.ok(start>=0&&end>start,startToken);return renderers.slice(start,end);}
class Select{
  constructor(value){this.value=value;this.dataset={};this.options=[{value}];}
  getAttribute(name){return this.attrs?.[name]??null;}
  hasAttribute(name){return this.getAttribute(name)!=null;}
  appendChild(option){this.options.push(option);}
}
function harness(active=[],completed=[]){
  const calls={save:0,upload:0,resequence:0},messages=[],elements={},fields={};
  const window={CuttingJobHistory:{...history,resequence:(active,completed)=>{calls.resequence++;return history.planDirectResequence(active,completed);}},cuttingJobs:active,completedCuttingJobs:completed,jobFolders:structuredClone(folders)};
  const noop=()=>{},content={dataset:{},querySelector:selector=>fields[/data-(?:j|history-field)="([^"]+)"/.exec(selector)?.[1]]||null,querySelectorAll:()=>[],addEventListener:(_,handler)=>{c.handler=handler;}};
  const c=vm.createContext({window,Date,console,content,document:{getElementById:id=>elements[id]||null,createElement:()=>({})},HTMLSelectElement:Select,
    cuttingJobs:active,completedCuttingJobs:completed,toast:message=>messages.push(message),genId:()=>"new-job",editingJobs:new Set(["j"]),editingCompletedJobsSet:()=>new Set(["j"]),
    saveCloudDebounced:()=>calls.save++,saveCloudNow:async()=>{calls.save++;return{saved:true,stateWriteCompleted:true};},persistJobChanges:()=>calls.save++,
    reorderPriorities:noop,closeModal:noop,closeHistoryActionMenu:noop,closeFileMenu:noop,closeActionMenu:noop,renderDashboard:noop,renderJobs:noop,renderCalendarPreservingScroll:noop,
    updateDashJobCategoryHint:noop,ensureJobCategoryFolderOpen:noop,rerenderPreservingState:noop,readOpenFolderSet:()=>new Set(),writeOpenFolderSet:noop,currentCategoryFilter:()=>"jobs_root",
    mergeJobFileReferences:(before,after)=>after||before,JOB_RATE_PER_HOUR:200,JOB_BASE_COST_PER_HOUR:45,JOB_DAY_MS:86400000,todayISO:"2026-10-06",
    parseJobDate:value=>value?new Date(value):null,toDateInputValue:date=>date?.toISOString().slice(0,10)||"",showMakeActiveCopyModal:async()=>({startISO:"2026-10-06",dueISO:"2026-10-07"}),
    materialSettings:{materials:[]},pendingNewJobFiles:[],pendingSecureCloudJobFiles:[],recalcMaterialTotals:noop,applyMinutesToHours:noop,fractionToNumber:()=>.25,
    refreshCfr05CloudPresentation:async()=>{},JOB_ROOT_FOLDER_ID:"jobs_root",ensureJobFolderState:()=>window.jobFolders,setJobFolders:value=>{window.jobFolders=value;},normalizeHexColor:()=>null,
    ensureJobCategories:()=>{throw Error("Manual flow must not normalize historical jobs");}});
  for(const name of ["validateManualJobProjectCategory","applyManualJobProjectCategory","addJobFolder"])vm.runInContext(fn(core,name),c);
  for(const name of ["promptCreateCategory","selectManualJobCategory","syncManualJobProjectControl","syncManualJobProjectControls"])vm.runInContext(fn(renderers,name),c);
  window.uploadCfr05CuttingFile=async()=>{calls.upload++;return{stage:"completed"};};
  function dashboard(cat="blanco",project="1254"){
    const defaults={jobNameInput:"Part",jobEstimateInput:"2",jobChargeInput:"200",jobCostRateInput:"45",jobMaterialInput:"Steel",jobMaterialCostInput:"9",jobMaterialQtyInput:"1",jobStartInput:"2026-10-06",jobDueInput:"2026-10-07",jobProjectInput:project};
    Object.assign(c,Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,{value}])));
    c.jobCategoryInput=new Select(cat);c.dashRootCategoryId="jobs_root";c.applyDashMinutesToHours=noop;
    c.jobForm={addEventListener:(_,handler)=>{c.handler=handler;}};
    vm.runInContext(between('  jobForm?.addEventListener("submit"','\n  if (jobCategoryInput){'),c);
    return c.handler({preventDefault:noop});
  }
  function add(cat="blanco",project="1254",secure=false){
    const defaults={jobName:"Part",jobEst:"2",jobMaterial:"Steel",jobCharge:"200",jobCostRate:"45",jobMaterialCost:"9",jobMaterialQty:"1",jobStart:"2026-10-06",jobDue:"2026-10-07",jobProjectNumber:project,jobPriority:"1",jobMaterialLengthFt:"2",jobMaterialWidthFt:"2"};
    Object.assign(elements,Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,{value,textContent:value}])));
    elements.jobCategory=new Select(cat);elements.addJobForm={addEventListener:(_,handler)=>{c.handler=handler;}};
    c.addJobEstHoursInput=elements.jobEst;c.addJobEstBreakdown=null;c.jobRootCategoryId="jobs_root";
    if(secure)c.pendingSecureCloudJobFiles.push({file:{name:"part.dxf",arrayBuffer:async()=>new ArrayBuffer(0)}});
    vm.runInContext(between('  document.getElementById("addJobForm")?.addEventListener("submit"','\n  // 5) Inline material'),c);
    return c.handler({preventDefault:noop});
  }
  function edit(historyEdit=false,values={}){
    Object.assign(fields,Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value}])));
    const token=historyEdit?"histSave":"sv";c[token]={getAttribute:()=>"j"};
    const code=historyEdit?between("    if (histSave){","\n  });\n\n  // 6) Edit"):between("    if (sv){","\n    // Cancel edit");
    return vm.runInContext(`(async()=>{${code}})()`,c);
  }
  function copy(){c.histActivate={getAttribute:()=>"j"};return vm.runInContext(`(async()=>{${between("    if (histActivate){","\n    if (histEdit){")}})()`,c);}
  function inline(cat){const select=new Select(cat);select.attrs={"data-job-category-inline":"j"};vm.runInContext(between('  if (!content.dataset.jobCategorySelectEvents){','\n  // 2) Small, scoped helpers'),c);c.handler({target:{closest:()=>select}});return select;}
  return{c,window,calls,messages,elements,fields,dashboard,add,edit,copy,inline};
}
const job=(extra={})=>({id:"j",name:"Original",cat:"blanco",projectNumber:"1254",estimateHours:2,materialCost:9,materialQty:1,files:[{fileId:"secure"}],manualLogs:[{completedHours:1}],cutDateISO:"2026-01-02",cutOrderWithinDay:2,cutNumber:"C042",importProvenance:{sourceRowNumber:3},...extra});
const legacyJob=extra=>{const value=job(extra);delete value.cutDateISO;delete value.cutOrderWithinDay;return value;};

test("Dashboard creates a project-bearing job and blocks manipulated/unmapped pairs",()=>{
  const h=harness();h.dashboard();assert.equal(h.window.cuttingJobs[0].projectNumber,"1254");assert.equal(h.calls.save,1);
  for(const [cat,project]of [["mesquite","1254"],["unknown","1305"],["jobs_root",""]]){const bad=harness();bad.dashboard(cat,project);assert.equal(bad.window.cuttingJobs.length,0);assert.equal(bad.calls.save,0);assert.equal(bad.calls.resequence,0);assert.ok(bad.messages.length);}
});
test("Add Job validates before push, persistence, numbering or secure upload",async()=>{
  for(const secure of [false,true]){
    const h=harness();await h.add("blanco","1254",secure);assert.equal(h.window.cuttingJobs[0].projectNumber,"1254");assert.equal(h.calls.save,1);assert.equal(h.calls.upload,secure?1:0);
    const bad=harness();await bad.add("mesquite","1254",secure);assert.equal(bad.window.cuttingJobs.length,0);assert.equal(bad.calls.save,0);assert.equal(bad.calls.upload,0);assert.equal(bad.calls.resequence,0);
  }
});
test("active and history Save reject a changed mismatched pair before any live edits",async()=>{
  for(const past of [false,true]){
    const original=job(),before=structuredClone(original),h=harness(past?[]:[original],past?[original]:[]);
    await h.edit(past,{cat:"mesquite",projectNumber:"1254",name:"Must not change",completedAtISO:"2030-01-01"});
    assert.deepEqual(original,before);assert.equal(h.calls.save,0);assert.equal(h.calls.resequence,0);
  }
});
test("active and history unrelated edits keep the exact legacy pair",async()=>{
  for(const past of [false,true]){
    const original=job({cat:"missing",projectNumber:"  legacy  "}),h=harness(past?[]:[original],past?[original]:[]);
    await h.edit(past,{cat:"missing",projectNumber:"  legacy  ",name:"Edited",materialCost:"9",materialQty:"1"});
    assert.equal(original.name,"Edited");assert.equal(original.cat,"missing");assert.equal(original.projectNumber,"  legacy  ");assert.equal(h.calls.save,1);
    assert.equal(original.cutNumber,"C042");assert.equal(original.cutDateISO,"2026-01-02");assert.deepEqual(original.files,[{fileId:"secure"}]);assert.deepEqual(original.importProvenance,{sourceRowNumber:3});
  }
});
test("active and history category edits update both fields after validation",async()=>{
  for(const past of [false,true]){
    const original=job(),h=harness(past?[]:[original],past?[original]:[]);
    await h.edit(past,{cat:"mesquite",projectNumber:"1242",materialCost:"9",materialQty:"1"});assert.equal(original.cat,"mesquite");assert.equal(original.projectNumber,"1242");assert.equal(h.calls.save,1);
  }
});
test("inline Category updates both fields and rolls the control back when blocked",()=>{
  const original=job(),h=harness([original]);h.inline("mesquite");assert.equal(original.projectNumber,"1242");assert.equal(original.cat,"mesquite");assert.equal(h.calls.save,1);
  const badOriginal=job(),before=structuredClone(badOriginal),bad=harness([badOriginal]),select=bad.inline("unknown");assert.deepEqual(badOriginal,before);assert.equal(bad.calls.save,0);assert.equal(select.value,"blanco");
});
test("legacy active copy receives projectNumber without altering its historical source",async()=>{
  const original=legacyJob({completedAtISO:"2026-01-02"}),before=structuredClone(original),h=harness([],[original]);await h.copy();
  assert.equal(h.window.cuttingJobs[0].projectNumber,"1254");assert.equal(h.window.cuttingJobs[0].cat,"blanco");assert.deepEqual(original,before);
  const bad=harness([],[legacyJob({cat:"unknown",projectNumber:""})]);await bad.copy();assert.equal(bad.window.cuttingJobs.length,0);assert.equal(bad.calls.save,0);
});
test("canonical active copy requires the coordinator and preserves project/category data",async()=>{const original=job(),before=structuredClone(original),h=harness([],[original]);await h.copy();assert.equal(h.window.cuttingJobs.length,0);assert.equal(h.calls.save,0);assert.deepEqual(original,before);assert.match(h.messages.join(" "),/coordinator/);});
test("active copy revalidates category ownership after the awaited dialog",async()=>{
  const h=harness([],[legacyJob()]);h.c.showMakeActiveCopyModal=async()=>{h.window.jobFolders.push({id:"duplicate",name:"Blanco"});return{};};await h.copy();assert.equal(h.window.cuttingJobs.length,0);assert.equal(h.calls.save,0);
});
test("project control follows Category, while unchanged legacy displays remain exact",()=>{
  const original=job({projectNumber:" legacy "}),h=harness([original]),select=new Select("blanco"),input={parentElement:{querySelector:()=>null}};
  h.c.syncManualJobProjectControl(select,input,original);assert.equal(input.value," legacy ");assert.equal(input.readOnly,true);
  select.value="mesquite";h.c.syncManualJobProjectControl(select,input,original);assert.equal(input.value,"1242");
  select.value="unknown";h.c.syncManualJobProjectControl(select,input,original);assert.equal(input.value,"");assert.match(input.title,/project-number review/);
});
test("Dashboard and Jobs share one category creator with validated metadata",()=>{
  const h=harness(),answers=["Future Project","0012"];h.window.prompt=()=>answers.shift();const made=h.c.promptCreateCategory("jobs_root");
  assert.equal(made.projectNumber,"0012");assert.equal(made.name,"0012 Future Project");assert.equal(h.calls.save,1);
  assert.equal((renderers.match(/function promptCreateCategory\(/g)||[]).length,1);assert.equal(renderers.includes("const promptCreateCategory ="),false);
  const select=new Select("__new__");h.c.selectManualJobCategory(select,made);assert.equal(select.value,made.id);assert.ok(select.options.some(option=>option.value===made.id));
});
test("Dashboard and Add Job can create a category and its project-bearing job",async()=>{
  for(const dashboard of [false,true]){
    const h=harness(),answers=["Future Project","0012"];let serial=0;
    h.window.prompt=()=>answers.shift();h.c.genId=()=>`native-${++serial}`;
    if(dashboard)h.dashboard("__new__","");else await h.add("__new__","");
    const made=h.window.jobFolders.find(folder=>folder.projectNumber==="0012");
    assert.ok(made);assert.equal(h.window.cuttingJobs[0].projectNumber,"0012");assert.equal(h.window.cuttingJobs[0].cat,made.id);assert.equal(h.calls.save,2);
  }
});
test("invalid new category ownership leaves folders and jobs unchanged",async()=>{
  for(const dashboard of [false,true]){
    const h=harness(),before=structuredClone(h.window.jobFolders),answers=["ATM","1254"];h.window.prompt=()=>answers.shift();
    if(dashboard)h.dashboard("__new__","");else await h.add("__new__","");
    assert.deepEqual(h.window.jobFolders,before);assert.equal(h.window.cuttingJobs.length,0);assert.equal(h.calls.save,0);
  }
});
test("views lock project controls and retain unknown legacy category selections",()=>{
  for(const token of ['id="dashJobProjectNumber"','data-history-field="projectNumber"','data-j="projectNumber"','id="jobProjectNumber"']){
    const pos=views.indexOf(token);assert.ok(pos>=0);assert.match(views.slice(pos,views.indexOf(">",pos)),/readonly/);
  }
  assert.match(views,/Stored category \(needs project-number review\)/);
  assert.equal(renderers.slice(renderers.indexOf("function renderJobs(){"),renderers.indexOf("function renderJobs(){")+1000).includes("ensureJobCategories"),false);
  assert.match(renderers,/openJobsEditor\(jobId\)/);
});
