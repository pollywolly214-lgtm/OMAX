"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const chronology=require("../js/cuttingJobChronology");
const history=require("../js/cuttingJobHistory");
const renderers=fs.readFileSync("js/renderers.js","utf8").replace(/\r\n/g,"\n"),core=fs.readFileSync("js/core.js","utf8"),views=fs.readFileSync("js/views.js","utf8");
const folders=[{id:"jobs_root",name:"All Jobs"},{id:"blanco",name:"1254 Blanco"},{id:"mesquite",name:"1242 Mesquite"},{id:"unknown",name:"Smith County"}];
function fn(source,name){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,name);return source.slice(source.slice(start-6,start)==="async "?start-6:start,source.indexOf("\n}",start)+2);}
function between(startToken,endToken){const start=renderers.indexOf(startToken),end=renderers.indexOf(endToken,start);assert.ok(start>=0&&end>start,startToken);return renderers.slice(start,end);}
class Select{
  constructor(value){this.value=value;this.dataset={};this.options=[{value}];}
  getAttribute(name){return this.attrs?.[name]??null;}
  hasAttribute(name){return this.getAttribute(name)!=null;}
  appendChild(option){this.options.push(option);}
}
function harness(active=[],completed=[]){
  const calls={save:0,upload:0,resequence:0},messages=[],elements={},fields={};
  const window={CuttingJobChronology:chronology,CuttingJobDimensions:require("../js/cuttingJobDimensions"),CuttingJobHistory:{...history,resequence:(active,completed)=>{calls.resequence++;return history.planDirectResequence(active,completed);}},cuttingJobs:active,completedCuttingJobs:completed,jobFolders:structuredClone(folders)};
  const noop=()=>{},content={dataset:{},querySelector:selector=>fields[/data-(?:j|history-field)="([^"]+)"/.exec(selector)?.[1]]||null,querySelectorAll:()=>[],addEventListener:(_,handler)=>{c.handler=handler;}};
  const c=vm.createContext({window,Date,console,content,document:{getElementById:id=>elements[id]||null,querySelector:()=>null,createElement:()=>({})},HTMLSelectElement:Select,
    cuttingJobs:active,completedCuttingJobs:completed,toast:message=>messages.push(message),genId:()=>"new-job",editingJobs:new Set(["j"]),editingCompletedJobsSet:()=>new Set(["j"]),
    saveCloudDebounced:()=>calls.save++,saveCloudNow:async()=>{calls.save++;return{saved:true,stateWriteCompleted:true};},persistJobChanges:()=>calls.save++,
    reorderPriorities:noop,closeModal:noop,closeHistoryActionMenu:noop,closeFileMenu:noop,closeActionMenu:noop,renderDashboard:noop,renderJobs:noop,renderCalendarPreservingScroll:noop,
    updateDashJobCategoryHint:noop,ensureJobCategoryFolderOpen:noop,rerenderPreservingState:noop,readOpenFolderSet:()=>new Set(),writeOpenFolderSet:noop,currentCategoryFilter:()=>"jobs_root",
    mergeJobFileReferences:(before,after)=>after||before,JOB_RATE_PER_HOUR:200,JOB_BASE_COST_PER_HOUR:45,JOB_DAY_MS:86400000,todayISO:"2026-10-06",
    parseJobDate:value=>value?new Date(value):null,toDateInputValue:date=>date?.toISOString().slice(0,10)||"",showMakeActiveCopyModal:async options=>{const selection={startISO:"2026-10-06",dueISO:"2026-10-07"};const result=await options.onConfirm(selection);return result?.saved&&result.verified&&!result.requiresReload?selection:null;},
    materialSettings:{materials:[]},pendingNewJobFiles:[],pendingSecureCloudJobFiles:[],recalcMaterialTotals:noop,syncAddJobDraftFromForm:noop,applyMinutesToHours:noop,fractionToNumber:()=>.25,
    refreshCfr05CloudPresentation:async()=>{},JOB_ROOT_FOLDER_ID:"jobs_root",ensureJobFolderState:()=>window.jobFolders,setJobFolders:value=>{window.jobFolders=value;},normalizeHexColor:()=>null,
    ensureJobCategories:()=>{throw Error("Manual flow must not normalize historical jobs");}});
  vm.runInContext(fn(fs.readFileSync("js/computations.js","utf8"),"computeCuttingJobProfit"),c);
  c.structuredClone=structuredClone;
  c.showConfirmModal=async options=>{
    const values={"[data-category-name]":{value:window.prompt("name")},"[data-category-project]":{value:window.prompt("project")},"[data-category-create-color]":{value:"#2563eb"},"[data-category-error]":{textContent:""}};
    return options.onConfirm({root:{querySelector:key=>values[key]}});
  };
  c.createCuttingJob=async job=>{calls.save++;window.cuttingJobs.push(job);return{saved:true,verified:true};};
  c.saveCuttingJobEdit=async(id,updates)=>{calls.save++;Object.assign([...window.cuttingJobs,...window.completedCuttingJobs].find(job=>job.id===id),updates);return{saved:true,verified:true};};
  for(const name of ["validateManualJobProjectCategory","applyManualJobProjectCategory","addJobFolder"])vm.runInContext(fn(core,name),c);
  for(const name of ["parseCuttingJobDimension","promptCreateCategory","selectManualJobCategory","existingJobCategoryEditMessage","validateExistingJobCategoryEdit","syncManualJobProjectControl","syncManualJobProjectControls","persistNewCuttingJobWithAttachments","syncNewCuttingJobSaveControls"])vm.runInContext(fn(renderers,name),c);
  window.uploadCfr05CuttingFile=async()=>{calls.upload++;return{stage:"completed"};};
  function dashboard(cat="blanco",project="1254",costRate="45"){
    const defaults={jobNameInput:"Part",jobEstimateInput:"2",jobChargeInput:"200",jobCostRateInput:costRate,jobMaterialInput:"Steel",jobMaterialCostInput:"9",jobMaterialQtyInput:"1",jobStartInput:"2026-10-06",jobDueInput:"2026-10-07",jobProjectInput:project};
    Object.assign(c,Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,{value}])));
    c.jobCategoryInput=new Select(cat);c.dashRootCategoryId="jobs_root";c.applyDashMinutesToHours=noop;
    c.jobForm={addEventListener:(_,handler)=>{c.handler=handler;}};
    vm.runInContext(between('  jobForm?.addEventListener("submit"','\n  if (jobCategoryInput){'),c);
    return c.handler({preventDefault:noop});
  }
  function add(cat="blanco",project="1254",secure=false,costRate="45"){
    const defaults={jobName:"Part",jobEst:"2",jobMaterial:"Steel",jobCharge:"200",jobCostRate:costRate,jobMaterialCost:"9",jobMaterialQty:"1",jobStart:"2026-10-06",jobDue:"2026-10-07",jobProjectNumber:project,jobPriority:"1",jobMaterialLengthFt:"2",jobMaterialWidthFt:"2"};
    Object.assign(elements,Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,{value,textContent:value}])));
    elements.jobCategory=new Select(cat);elements.addJobForm={querySelectorAll:()=>[],addEventListener:(_,handler)=>{c.handler=handler;}};
    c.addJobEstHoursInput=elements.jobEst;c.addJobEstBreakdown=null;c.jobRootCategoryId="jobs_root";
    if(secure)c.pendingSecureCloudJobFiles.push({file:{name:"part.dxf",arrayBuffer:async()=>new ArrayBuffer(0)}});
    vm.runInContext(between('  document.getElementById("addJobForm")?.addEventListener("submit"','\n  // 5) Inline material'),c);
    return c.handler({preventDefault:noop});
  }
  function edit(historyEdit=false,values={}){
    values={startISO:"2026-10-06",completedAtISO:"2026-10-07",...values};
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

test("Dashboard creates a project-bearing job and blocks manipulated/unmapped pairs",async()=>{
  const h=harness();await h.dashboard();assert.equal(h.window.cuttingJobs[0].projectNumber,"1254");assert.equal(h.calls.save,1);
  for(const [cat,project]of [["mesquite","1254"],["unknown","1305"],["jobs_root",""]]){const bad=harness();await bad.dashboard(cat,project);assert.equal(bad.window.cuttingJobs.length,0);assert.equal(bad.calls.save,0);assert.equal(bad.calls.resequence,0);assert.ok(bad.messages.length);}
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

test("active and history Save exclude the live edited job from conflicting ownership evidence",async()=>{
  for(const past of [false,true]){
    const original=job({projectNumber:"1242"}),h=harness(past?[]:[original],past?[original]:[]);
    await h.edit(past,{cat:"blanco",projectNumber:"1254",materialCost:"9",materialQty:"1"});
    assert.equal(h.calls.save,1);assert.equal(original.projectNumber,"1254");assert.equal(original.cat,"blanco");
  }
});

test("existing-job edits explain missing/conflicting ownership and preserve all drafts and records",async()=>{
  for(const past of [false,true])for(const missing of [false,true]){
    const original=job(),h=harness(past?[]:[original],past?[original]:[]),before=structuredClone(original);
    const cat=missing?"unknown":"mesquite";
    if(!missing)h.window.jobFolders.find(folder=>folder.id===cat).projectNumber="1254";
    const foldersBefore=structuredClone(h.window.jobFolders);
    await h.edit(past,{cat,projectNumber:"",name:"Keep this draft",materialCost:"9",materialQty:"1"});
    assert.equal(h.calls.save,0);assert.deepEqual(original,before);assert.deepEqual(h.window.jobFolders,foldersBefore);
    assert.match(h.messages.at(-1),/Choose a category with verified project ownership/);assert.match(h.messages.at(-1),/reviewed and corrected first/);assert.match(h.messages.at(-1),/nothing was saved/);assert.equal(h.fields.name.value,"Keep this draft");
  }
});

test("excluding the edited job never hides another job's conflicting project claim",async()=>{
  for(const past of [false,true]){
    const original=job({projectNumber:"1242"}),other=job({id:"other",projectNumber:"1251"});
    const h=harness(past?[other]:[original,other],past?[original]:[]),before=structuredClone([original,other]);
    await h.edit(past,{cat:"blanco",projectNumber:"1254",materialCost:"9",materialQty:"1"});
    assert.equal(h.calls.save,0);assert.deepEqual([original,other],before);assert.match(h.messages.at(-1),/1251/);
  }
});

test("explicit category reselection loads verified project ownership without mutating the stored pair",()=>{
  const original=job({projectNumber:"1242"}),h=harness([original]),before=structuredClone(original),select=new Select("blanco"),input={value:"1242",parentElement:{querySelector:()=>null}};
  h.c.syncManualJobProjectControl(select,input,original);assert.equal(input.value,"1242");
  h.c.syncManualJobProjectControl(select,input,original,true);assert.equal(input.value,"1254");
  h.c.syncManualJobProjectControl(select,input,original);assert.equal(input.value,"1254");assert.deepEqual(original,before);
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
test("canonical active copy uses guarded creation and preserves original project/category data",async()=>{const original=job(),before=structuredClone(original),h=harness([],[original]);await h.copy();assert.equal(h.window.cuttingJobs.length,1);assert.equal(h.calls.save,1);assert.deepEqual(original,before);assert.equal(h.window.cuttingJobs[0].cat,"blanco");assert.equal(h.window.cuttingJobs[0].projectNumber,"1254");});
test("active copy revalidates category ownership after the awaited dialog",async()=>{
  const h=harness([],[legacyJob()]);h.c.showMakeActiveCopyModal=async()=>{h.window.jobFolders.push({id:"duplicate",name:"Blanco"});return{};};await h.copy();assert.equal(h.window.cuttingJobs.length,0);assert.equal(h.calls.save,0);
});
test("project control follows Category, while unchanged legacy displays remain exact",()=>{
  const original=job({projectNumber:" legacy "}),h=harness([original]),select=new Select("blanco"),input={parentElement:{querySelector:()=>null}};
  h.c.syncManualJobProjectControl(select,input,original);assert.equal(input.value," legacy ");assert.equal(input.readOnly,true);
  select.value="mesquite";h.c.syncManualJobProjectControl(select,input,original);assert.equal(input.value,"1242");
  select.value="unknown";h.c.syncManualJobProjectControl(select,input,original);assert.equal(input.value,"");assert.match(input.title,/project-number review/);
});
test("Dashboard and Jobs share one category creator with validated metadata",async()=>{
  const h=harness(),answers=["Future Project","0012"];h.window.prompt=()=>answers.shift();const made=await h.c.promptCreateCategory("jobs_root");
  assert.equal(made.projectNumber,"0012");assert.equal(made.name,"0012 Future Project");assert.equal(h.calls.save,1);
  assert.equal((renderers.match(/function promptCreateCategory\(/g)||[]).length,1);assert.equal(renderers.includes("const promptCreateCategory ="),false);
  const select=new Select("__new__");h.c.selectManualJobCategory(select,made);assert.equal(select.value,made.id);assert.ok(select.options.some(option=>option.value===made.id));
});
test("Dashboard and Add Job can create a category and its project-bearing job",async()=>{
  for(const dashboard of [false,true]){
    const h=harness(),answers=["Future Project","0012"];let serial=0;
    h.window.prompt=()=>answers.shift();h.c.genId=()=>`native-${++serial}`;
    if(dashboard)await h.dashboard("__new__","");else await h.add("__new__","");
    const made=h.window.jobFolders.find(folder=>folder.projectNumber==="0012");
    assert.ok(made);assert.equal(h.window.cuttingJobs[0].projectNumber,"0012");assert.equal(h.window.cuttingJobs[0].cat,made.id);assert.equal(h.calls.save,2);
  }
});
test("invalid new category ownership leaves folders and jobs unchanged",async()=>{
  for(const dashboard of [false,true]){
    const h=harness(),before=structuredClone(h.window.jobFolders),answers=["ATM","1254"];h.window.prompt=()=>answers.shift();
    if(dashboard)await h.dashboard("__new__","");else await h.add("__new__","");
    assert.deepEqual(h.window.jobFolders,before);assert.equal(h.window.cuttingJobs.length,0);assert.equal(h.calls.save,0);
  }
});
test("views lock project controls and retain unknown legacy category selections",()=>{
  for(const token of ['id="dashJobProjectNumber"','data-history-field="projectNumber"','data-j="projectNumber"']){
    const pos=views.indexOf(token);assert.ok(pos>=0);assert.match(views.slice(pos,views.indexOf(">",pos)),/readonly/);
  }
  assert.match(views,/<output id="jobProjectNumber"[^>]*for="jobCategory"[^>]*aria-live="polite"/);
  assert.doesNotMatch(views,/<input[^>]*id="jobProjectNumber"/);
  assert.match(views,/Stored category \(needs project-number review\)/);
  assert.equal(renderers.slice(renderers.indexOf("function renderJobs(){"),renderers.indexOf("function renderJobs(){")+1000).includes("ensureJobCategories"),false);
  assert.match(renderers,/openJobsEditor\(jobId\)/);
});

// POLISH-01: existing edit exit must follow verified persistence, never optimism.
test("active and history edits stay open until verification, including failed/indeterminate saves",async()=>{
  for(const historyEdit of [false,true]){
    for(const result of [
      {saved:false,verified:false,error:"fixture failure"},
      {saved:true,verified:false,requiresReload:true,error:"fixture indeterminate"},
      {saved:true,verified:true,requiresReload:true},
      {saved:true,verified:true}
    ]){
      const h=harness(historyEdit?[]:[job()],historyEdit?[job({completedAtISO:"2026-10-07"})]:[]);
      const editing=new Set(["j"]);let renders=0,release;
      if(historyEdit)h.c.editingCompletedJobsSet=()=>editing;else h.c.editingJobs=editing;
      h.c.renderJobs=()=>renders++;
      h.c.saveCuttingJobEdit=()=>new Promise(resolve=>{release=resolve;});
      const pending=h.edit(historyEdit,{name:"Updated",cat:"blanco",projectNumber:"1254",materialCost:"9",materialQty:"1"});
      assert.equal(editing.has("j"),true,"keep edit open while save is pending");
      assert.equal(renders,0);
      release(result);await pending;
      const confirmed=result.saved&&result.verified&&!result.requiresReload;
      assert.equal(editing.has("j"),!confirmed);
      assert.equal(renders,confirmed?1:0);
    }
  }
});

test("CJPROFIT-01: manual creation accepts signed costs through both forms",async()=>{
  const dash=harness();await dash.dashboard("blanco","1254","-60");assert.equal(dash.window.cuttingJobs[0].costRate,-60);
  const add=harness();await add.add("blanco","1254",false,"-60");assert.equal(add.window.cuttingJobs[0].costRate,-60);
});
test("CJPROFIT-01: active/history save signed cost and fractional cut time without unrelated changes",async()=>{
  for(const past of [false,true]){
    const original=job({costRate:60,chargeRate:150,actualHours:0}),before=structuredClone(original),h=harness(past?[]:[original],past?[original]:[]);
    await h.edit(past,{cat:"blanco",projectNumber:"1254",costRate:"-80",chargeRate:"200",estimateHours:"0.5",actualHours:"0.5",materialCost:"9",materialQty:"1"});
    assert.equal(original.costRate,-80);assert.equal(original.chargeRate,200);assert.equal(original.estimateHours,.5);
    if(past){assert.equal(original.actualHours,0);assert.equal(original.efficiency.netRate,120);assert.equal(original.efficiency.costRate,80);assert.equal(original.efficiency.totalProfit,51);}
    assert.equal(h.calls.save,1);
    for(const key of ["id","cat","projectNumber","cutNumber","cutDateISO","cutOrderWithinDay","files","importProvenance","actualHours","manualLogs"])
      assert.deepEqual(original[key],before[key],key);
  }
});

// CJADD-01A: exercise the actual form handlers with isolated persistence doubles.
test("CJADD-01A: category change immediately updates read-only output and blocks conflicts",async()=>{
  const h=harness(),listeners={},select=new Select("blanco"),status={textContent:""};
  select.addEventListener=(event,handler)=>{listeners[event]=handler;};
  h.elements.jobCategory=select;
  h.elements.jobProjectNumber={tagName:"OUTPUT",value:"",parentElement:{querySelector:()=>status}};
  vm.runInContext(between('  const jobCategorySelect = document.getElementById("jobCategory");','\n  const jobCategoryFilterSelect'),h.c);
  for(const [category,expected] of [["blanco","1254"],["mesquite","1242"],["unknown",""]]){
    select.value=category;
    await listeners.change({target:select,stopPropagation(){}});
    assert.equal(h.elements.jobProjectNumber.value,expected);
  }
  h.window.cuttingJobs.push({id:"conflict",cat:"blanco",projectNumber:"9999"});
  select.value="blanco";await listeners.change({target:select,stopPropagation(){}});
  assert.equal(h.elements.jobProjectNumber.value,"");assert.ok(status.textContent);
  assert.equal(h.calls.save,0);
});

test("CJADD-01A: Attach File retains drafts, appends selections, deduplicates and ignores cancellation",()=>{
  const h=harness();let change,renders=0,drafts=0;
  h.c.syncAddJobDraftFromForm=()=>{drafts++;h.window.jobAddDraft={name:"Pending part",category:"blanco",materialThickness:"1/4"};};
  h.c.renderJobs=()=>renders++;
  const file={name:"part.dxf",size:12,lastModified:123};
  const input={files:[file],value:"chosen",addEventListener:(event,handler)=>{change=handler;}};
  h.elements.jobSecureCloudFiles=input;
  vm.runInContext(between('  const addFormToggle = content.querySelector("[data-job-add-toggle]");','\n  const oneDriveSetupBtn'),h.c);
  h.window.cfr05CloudCuttingFiles={validateLocalFile:()=>({valid:true})};
  change();assert.equal(h.c.pendingSecureCloudJobFiles[0].file,file);
  input.files=[file,{name:"other.ord",size:9,lastModified:124}];change();
  assert.equal(h.c.pendingSecureCloudJobFiles.length,2);assert.equal(drafts,2);
  input.files=[];change();assert.equal(h.c.pendingSecureCloudJobFiles.length,2);assert.equal(renders,2);
  assert.equal(h.window.jobAddDraft.materialThickness,"1/4");assert.equal(h.calls.upload,0);
});

test("CJADD-01A: failed or unverified creation preserves draft/files and never uploads",async()=>{
  for(const outcome of [{saved:false,error:"conflict"},{saved:true,verified:false,requiresReload:true}]){
    const h=harness();h.window.jobAddDraft={name:"Part",materialThickness:"1/4"};
    h.c.createCuttingJob=async()=>{h.calls.save++;return outcome;};
    await h.add("blanco","1254",true);
    assert.equal(h.calls.upload,0);assert.equal(h.c.pendingSecureCloudJobFiles.length,1);
    assert.equal(h.window.jobAddDraft.name,"Part");assert.equal(h.elements.jobName.value,"Part");
    assert.equal(h.messages.some(message=>message.includes("job added")||message.includes("cloud file verified")),false);
    if(outcome.requiresReload){await h.c.handler({preventDefault(){}});assert.equal(h.calls.save,1);}
    else{await h.c.handler({preventDefault(){}});assert.equal(h.calls.save,2);}
  }
});

test("CJADD-01A: partial failure retries only remaining safe uploads on the original job ID",async()=>{
  const original=job(),before=structuredClone(original),h=harness([original]);
  h.window.jobAddDraft={name:"Part"};
  const files=["first.dxf","second.ord"].map(name=>({file:{name,arrayBuffer:async()=>new ArrayBuffer(0)},name}));
  h.c.pendingSecureCloudJobFiles.push(...files);const uploads=[];let fail=true;
  h.window.uploadCfr05CuttingFile=async(id,file)=>{
    assert.equal(h.window.cuttingJobs.some(job=>job.id===id),true);
    uploads.push([id,file.name]);
    return file.name==="second.ord"&&fail?{stage:"membership_validation",error:{message:"denied"}}:{stage:"completed"};
  };
  await h.add();assert.equal(h.calls.save,1);assert.equal(h.window.cuttingJobs.length,2);
  assert.equal(h.window.jobAddDraft.name,"Part");assert.equal(h.c.pendingSecureCloudJobFiles.length,2);
  fail=false;await h.c.handler({preventDefault(){}});
  assert.equal(h.calls.save,1);assert.equal(uploads.length,3);
  assert.deepEqual(uploads,[["new-job","first.dxf"],["new-job","second.ord"],["new-job","second.ord"]]);
  assert.equal(h.c.pendingSecureCloudJobFiles.length,0);assert.equal(h.window.pendingNewJobSave,null);
  assert.deepEqual(original,before);
});

test("CJADD-01A: uncertain or uncleaned uploads cannot be duplicated by resubmission",async()=>{
  for(const outcome of [
    {stage:"storage_upload",indeterminate:true},
    {stage:"firestore_metadata_creation",manualReviewRequired:true,possibleOrphanPath:"private-path"},
    {stage:"final_verification",completed:{firestoreBatchCommit:true}},
    {stage:"uploaded_metadata_verification",attempted:{storageUpload:true},completed:{storageUpload:true}}
  ]){
    const h=harness();let uploads=0;
    h.window.uploadCfr05CuttingFile=async()=>{uploads++;return outcome;};
    await h.add("blanco","1254",true);await h.c.handler({preventDefault(){}});
    assert.equal(h.calls.save,1);assert.equal(uploads,1);assert.equal(h.c.pendingSecureCloudJobFiles.length,1);
    assert.ok(h.messages.some(message=>message.includes("Manual inspection required")));
  }
});

test("CJADD-01A: double submission and listing failure never repeat job creation or upload",async()=>{
  const h=harness();let releaseSave,releaseListing,uploads=0;
  h.c.createCuttingJob=job=>{h.calls.save++;return new Promise(resolve=>{releaseSave=()=>{h.window.cuttingJobs.push(job);resolve({saved:true,verified:true});};});};
  h.window.uploadCfr05CuttingFile=async()=>{uploads++;return{stage:"completed"};};
  h.c.refreshCfr05CloudPresentation=()=>new Promise(resolve=>{releaseListing=()=>resolve({error:{message:"offline"}});});
  const saving=h.add("blanco","1254",true);await h.c.handler({preventDefault(){}});
  assert.equal(h.calls.save,1);assert.equal(uploads,0);
  releaseSave();while(!releaseListing)await new Promise(resolve=>setImmediate(resolve));
  await h.c.handler({preventDefault(){}});assert.equal(h.calls.save,1);assert.equal(uploads,1);
  releaseListing();await saving;
  assert.equal(h.window.pendingNewJobSave,null);assert.equal(h.c.pendingSecureCloudJobFiles.length,0);
  assert.ok(h.messages.includes("Upload succeeded; Cloud Files refresh failed. Do not upload the file again."));
});


test("CJADD-01A: real draft capture retains all form values including minutes before file selection",()=>{
  const h=harness(),values={jobName:"Draft",jobEst:"2",jobEstMinutes:"45",jobPriority:"3",jobCharge:"190",jobCostRate:"-2",jobMaterial:"Steel",jobMaterialThickness:"1/4",jobMaterialLengthFt:"2.5",jobMaterialWidthFt:"1.25",jobMaterialCost:"12",jobMaterialQty:"6",jobStart:"2026-10-16",jobDue:"2026-10-17",jobProjectNumber:"1254",jobCategory:"blanco"};
  for(const [id,value] of Object.entries(values))h.elements[id]={value};
  h.elements.addJobForm={};
  vm.runInContext(between('  const syncAddJobDraftFromForm = ()=>{','\n  const MATERIAL_SETTINGS_KEY')+';syncAddJobDraftFromForm();',h.c);
  assert.equal(h.window.jobAddDraft.estimateMinutes,"45");assert.equal(h.window.jobAddDraft.name,"Draft");
  assert.equal(h.window.jobAddDraft.materialThickness,"1/4");assert.equal(h.window.jobAddDraft.materialLengthFt,"2.5");
  assert.equal(h.window.jobAddDraft.category,"blanco");assert.equal(h.window.jobAddDraft.due,"2026-10-17");
  assert.match(views,/id="jobEstMinutes"[^>]*value="\$\{esc\(addJobDraftField\("estimateMinutes"\)\)\}"/);
});

test("CJADD-01A: verified cleanup permits safe retry; thrown uploads retain evidence",async()=>{
  const h=harness();let uploads=0;
  h.window.uploadCfr05CuttingFile=async()=>++uploads===1?{stage:"firestore_metadata_creation",attempted:{storageUpload:true},completed:{storageUpload:true,cleanupAbsenceVerified:true}}:{stage:"completed"};
  await h.add("blanco","1254",true);await h.c.handler({preventDefault(){}});
  assert.equal(uploads,2);assert.equal(h.calls.save,1);assert.equal(h.c.pendingSecureCloudJobFiles.length,0);
  const bad=harness();uploads=0;bad.window.uploadCfr05CuttingFile=async()=>{uploads++;throw Error("network failure");};
  await bad.add("blanco","1254",true);await bad.c.handler({preventDefault(){}});
  assert.equal(uploads,1);assert.equal(bad.calls.save,1);assert.equal(bad.c.pendingSecureCloudJobFiles.length,1);
});

test("CJADD-01A: save controls lock pending job fields and allow only safe attachment retry",()=>{
  const h=harness(),input={type:"text"},submit={type:"submit"},attach={type:"button"};
  h.elements.addJobForm={querySelectorAll:()=>[input,submit,attach]};
  h.window.pendingNewJobSave={verified:true,busy:true,files:[{}]};h.c.syncNewCuttingJobSaveControls();
  assert.equal(input.disabled,true);assert.equal(submit.disabled,true);assert.equal(attach.disabled,true);
  h.window.pendingNewJobSave.busy=false;h.c.syncNewCuttingJobSaveControls();
  assert.equal(submit.disabled,false);assert.equal(submit.textContent,"Retry pending attachments");assert.equal(input.disabled,true);
  h.window.pendingNewJobSave.files[0].manualReviewRequired=true;h.c.syncNewCuttingJobSaveControls();assert.equal(submit.disabled,true);
  h.window.pendingNewJobSave=null;h.c.syncNewCuttingJobSaveControls();assert.equal(input.disabled,false);assert.equal(submit.disabled,false);
});
