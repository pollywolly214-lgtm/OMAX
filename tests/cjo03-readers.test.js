"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const dates=require("../js/cuttingJobDateEditing");
const chronology=require("../js/cuttingJobChronology"),history=require("../js/cuttingJobHistory");
const read=file=>fs.readFileSync("js/"+file,"utf8").replace(/\r\n/g,"\n"),views=read("views.js"),renderers=read("renderers.js");
function slice(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return source.slice(a,b);}
function freeze(value){if(value&&typeof value==="object"&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const fixture=()=>({cuttingJobs:[{id:"native_z",name:"Active",cutNumber:"C041",cat:"project",projectNumber:"0000",priority:3,startISO:"2020-01-01",dueISO:"2020-01-02",files:[]}],completedCuttingJobs:[
  {id:"imported_a",name:"Imported",cutNumber:"C007",cat:"project",projectNumber:"0000",completedAtISO:"2030-01-01",import_event_id:"evt",importProvenance:{sourceRowNumber:1},files:[]},
  {id:"reviewed_b",name:"Reviewed",cutNumber:"C012",cat:"project",projectNumber:"0000",cutDateISO:"2026-10-05",cutOrderWithinDay:1,completedAtISO:"2026-10-06",files:[]},
  {id:"missing_c",name:"Missing",cat:"project",projectNumber:"0000",files:[]}
]});
function readers(state){
  const before=JSON.stringify(state),effects=[],stop=name=>()=>{effects.push(name);throw Error("Rendering invoked "+name);};
  const folders=[{id:"jobs_root",name:"All Jobs"},{id:"project",name:"0000 Company Improvements",parent:"jobs_root"}];
  freeze(state);freeze(folders);
  const c=vm.createContext({window:{...state,CuttingJobDateEditing:dates,jobFolders:folders,JOB_ROOT_FOLDER_ID:"jobs_root",CuttingJobChronology:{...chronology,createMutationApi:stop("coordinator"),planRenumbering:stop("renumber")},CuttingJobHistory:{...history,resequence:stop("resequence")}},cuttingJobs:state.cuttingJobs,completedCuttingJobs:state.completedCuttingJobs,completedJobs:state.completedCuttingJobs,
    completedSorted:dates.historyJobs(state.completedCuttingJobs),JOB_RATE_PER_HOUR:200,JOB_BASE_COST_PER_HOUR:45,saveCloudNow:stop("save"),saveCloudDebounced:stop("debounce"),persistJobChanges:stop("persist"),
    formatterCurrency:value=>"$"+value,resolveCategoryName:()=>"Company Improvements",computeJobEfficiency:()=>null,resolveCuttingJobNetTotal:()=>({hours:2,chargeRate:200,cutCostRate:45,materialCost:10}),
    maintenanceRows:[{taskId:"maint",taskName:"Maintenance"}],normalizeProjectNumber:value=>String(value||""),categoryProjectNumber:()=>"0000",escapeHtml:String,categoryStyleAttr:()=>"",readFlowCollapsedCategories:()=>new Set(),previewCardMarkup:()=>"",
    flowChart:{innerHTML:"",classList:{toggle(){}}},flowFilterInput:{value:""},flowGroupingSelect:{value:"job"},flowHidePreviews:{checked:true}
  });
  vm.runInContext(slice(views,"  const allJobsForCutNumbers =","  const historySearchRaw =")+";this.jobLabel=jobCutLabel;this.jobTitle=jobNameWithCut;this.historyIds=completedSorted.map(job=>job.id);this.categoryLabel=jobCategoryCutLabel;",c);
  vm.runInContext(slice(renderers,"  const completedJobsForDataCenter =","  const efficiencyRows =")+";this.dataRows=cuttingJobsDataTable;",c);
  c.cuttingRows=c.dataRows.map(row=>({...row,cutNumber:"C999",cutLabel:"C888",jobCut:"C777"}));
  vm.runInContext(slice(renderers,"  const allCutJobsForLabels =","  const renderDashboardSuggestions =")+";this.searchItems=getDashboardSearchItems();",c);
  const flowLine=renderers.split("\n").find(line=>line.startsWith("  const renderFlowChart ="));assert.ok(flowLine);
  vm.runInContext(flowLine+";this.renderFlow=renderFlowChart;",c);c.renderFlow();
  assert.equal(JSON.stringify(state),before);assert.deepEqual(effects,[]);
  return {c,before,effects};
}
test("actual Jobs/history, model, dashboard and flow readers agree on stored labels",()=>{
  const state=fixture(),h=readers(state),all=[...state.cuttingJobs,...state.completedCuttingJobs];
  for(const job of all){const expected=job.cutNumber||"—";assert.equal(h.c.jobLabel(job),expected);assert.ok(h.c.jobTitle(job).includes(" · "+expected+" · "));assert.ok(h.c.flowChart.innerHTML.includes(job.name+" · "+expected+" · "));
    const row=h.c.dataRows.find(row=>row.id===job.id);if(row){assert.equal(row.cumulativeCutNumberLabel,expected);assert.equal(h.c.searchItems.find(item=>item.id===job.id).label,job.name+" · "+expected);}}
  assert.equal(h.c.searchItems.find(item=>item.id==="maint").count,1);
});
test("reordering active/completed arrays never changes visible stored labels",()=>{
  const a=fixture(),b=structuredClone(a);b.cuttingJobs.reverse();b.completedCuttingJobs.reverse();
  const left=readers(a),right=readers(b);
  for(const job of [...a.cuttingJobs,...a.completedCuttingJobs]){
    assert.equal(left.c.jobLabel(job),right.c.jobLabel(job));
    const l=left.c.dataRows.find(row=>row.id===job.id),r=right.c.dataRows.find(row=>row.id===job.id);if(l)assert.equal(l.cumulativeCutNumberLabel,r.cumulativeCutNumberLabel);
    assert.ok(right.c.flowChart.innerHTML.includes(job.name+" · "+(job.cutNumber||"—")+" · "));
  }
});
test("Data Center uses Completion Date and shared category sequence while financial calculations remain unchanged",()=>{
  const h=readers(fixture());assert.deepEqual(Array.from(h.c.dataRows,row=>row.id),["imported_a","reviewed_b","missing_c"]);
  assert.deepEqual(Array.from(h.c.dataRows,row=>row.categoryCutNumberLabel),["#3","#2","#4"]);
  for(const row of h.c.dataRows){assert.equal(row.hoursValue,2);assert.equal(row.laborCostValue,90);assert.equal(row.totalCostValue,100);assert.equal(row.totalProfitValue,300);}
  assert.equal(h.c.categoryLabel(h.c.window.cuttingJobs[0]),1);assert.equal(h.c.jobTitle(h.c.window.cuttingJobs[0]),"Active · C041 · 1");
  assert.equal(h.c.window.cuttingJobs[0].priority,3);
});
test("history sorts by Completion Date while flow grouping remains alphabetical",()=>{
  const h=readers(fixture());assert.deepEqual(Array.from(h.c.historyIds),["imported_a","reviewed_b","missing_c"]);
  const markup=h.c.flowChart.innerHTML;assert.ok(markup.indexOf("Job Active")<markup.indexOf("Job Imported"));assert.ok(markup.indexOf("Job Imported")<markup.indexOf("Job Reviewed"));
});
test("all production readers preserve canonical labels in a ready domain",()=>{
  const state=fixture();for(const [index,job] of [...state.cuttingJobs,...state.completedCuttingJobs].entries()){job.cutDateISO="2026-10-05";job.cutOrderWithinDay=index+1;job.cutNumber=["C041","C007","C012","C003"][index];}
  const h=readers(state);assert.equal(chronology.chronologyReadiness(state.cuttingJobs,state.completedCuttingJobs).status,"CANONICAL_READY");
  for(const job of [...state.cuttingJobs,...state.completedCuttingJobs])assert.equal(h.c.jobLabel(job),job.cutNumber);
});
test("active-to-completed construction preserves visible label, identity and reviewed chronology",()=>{
  const source=read("core.js"),c=vm.createContext({window:{},JOB_RATE_PER_HOUR:200,JOB_BASE_COST_PER_HOUR:45});
  vm.runInContext(slice(source,"function buildCompletedJob(","function completeCuttingJob(")+";this.build=buildCompletedJob;",c);
  for(const explicit of [false,true]){
    const job={id:"same",name:"Same",cutNumber:"C041",files:[],manualLogs:[],...(explicit?{cutDateISO:"2026-10-05",cutOrderWithinDay:2}:{})},before=JSON.stringify(job),completed=c.build(job,"2026-12-01T12:00:00Z");
    assert.equal(chronology.readCutLabel(completed),chronology.readCutLabel(job));assert.equal(completed.id,job.id);assert.equal(JSON.stringify(job),before);assert.equal(completed.cutDateISO,job.cutDateISO);assert.equal(completed.cutOrderWithinDay,job.cutOrderWithinDay);
  }
});
for(const label of ["C001","C1","c0007","C1234"])test("display preserves exact valid stored label "+label,()=>assert.equal(chronology.readCutLabel(freeze({cutNumber:label})),label));
for(const label of [undefined,null,"","C000","C-1","C1.5","bad"," C001 ",1,"C9007199254740992"])test("invalid/missing label is neutral: "+JSON.stringify(label),()=>assert.equal(chronology.readCutLabel(freeze({cutNumber:label})),"—"));
test("mixed readiness requires review and retains every label and field",()=>{
  const state=freeze(fixture()),before=JSON.stringify(state),result=chronology.chronologyReadiness(state.cuttingJobs,state.completedCuttingJobs);
  assert.equal(result.status,"REVIEW_REQUIRED");assert.equal(result.eligible,false);assert.ok(result.issues.some(issue=>issue.id==="imported_a"));assert.equal(chronology.readCutLabel(state.completedCuttingJobs[0]),"C007");assert.equal(JSON.stringify(state),before);
});
test("empty and unresolved legacy domains are LEGACY_ONLY without inferred dates/order",()=>{
  for(const state of [{cuttingJobs:[],completedCuttingJobs:[]},{cuttingJobs:[{id:"old",cutNumber:"C099",startISO:"2026-01-01",dueISO:"2026-01-02",completedAtISO:"2026-01-03",createdAt:"2026-01-04",importProvenance:{sourceRowNumber:1}}],completedCuttingJobs:[]}]){
    freeze(state);const before=JSON.stringify(state),result=chronology.chronologyReadiness(state.cuttingJobs,state.completedCuttingJobs);assert.equal(result.status,"LEGACY_ONLY");assert.equal(result.eligible,false);assert.equal(JSON.stringify(state),before);
  }
});
for(const [name,active,completed] of [
  ["missing identity",[{cutDateISO:"2026-10-05",cutOrderWithinDay:1}],[]],
  ["duplicate identity",[{id:"same",cutDateISO:"2026-10-05",cutOrderWithinDay:1}],[{id:"same",cutDateISO:"2026-10-06",cutOrderWithinDay:1}]],
  ["invalid date",[{id:"bad",cutDateISO:"2026-02-30",cutOrderWithinDay:1}],[]],
  ["invalid order",[{id:"bad",cutDateISO:"2026-10-05",cutOrderWithinDay:0}],[]],
  ["partial explicit",[{id:"bad",cutDateISO:"2026-10-05"}],[]],
  ["invalid job array",[{id:"job",cutDateISO:"2026-10-05",cutOrderWithinDay:1}],null]
])test("readiness rejects "+name,()=>{freeze(active);freeze(completed);const result=chronology.chronologyReadiness(active,completed);assert.equal(result.status,"REVIEW_REQUIRED");assert.equal(result.eligible,false);assert.ok(result.issues.length);});
test("views fail neutrally if chronology module is unavailable, without reintroducing formulas",()=>{
  const c=vm.createContext({window:{}}),line=views.split("\n").find(line=>line.includes("const jobCutLabel ="));vm.runInContext(line+";this.label=jobCutLabel;",c);assert.equal(c.label({id:"job",cutNumber:"C099"}),"—");
  assert.equal(views.includes("jobCutMap"),false);assert.equal(renderers.includes("jobCutMap"),false);assert.equal(renderers.includes("cutNumberMap"),false);
});
