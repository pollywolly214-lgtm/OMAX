"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const history=require("../js/cuttingJobHistory"),repair=require("../js/cuttingJobRepair"),importer=require("../js/cuttingJobImporter")(globalThis);
const read=file=>fs.readFileSync("js/"+file,"utf8").replace(/\r\n/g,"\n");
const core=read("core.js"),renderers=read("renderers.js"),calendar=read("calendar.js");
function slice(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return source.slice(a,b);}
const canonical=(id,date)=>({id,name:id,projectNumber:"0000",cat:"project",cutDateISO:date,cutOrderWithinDay:1,cutNumber:"C099",manualLogs:[],files:[]});
const domain=mixed=>({cuttingJobs:[canonical("active","2026-10-06")],completedCuttingJobs:[mixed?{id:"legacy",projectNumber:"0000",cutNumber:"C007",completedAtISO:"2020-01-01",cat:"project"}:canonical("done","2026-10-05")],inventory:[{id:"protected",qty:3}],deletedItems:[]});
const folders=()=>[{id:"jobs_root",name:"All Jobs"},{id:"project",name:"0000 Company Improvements",parent:"jobs_root"}];
const clone=value=>structuredClone(value);
function context(state,extra={}){
  const effects=[],toastMessages=[],stop=name=>()=>{effects.push(name);throw Error("Unexpected "+name);};
  const c=vm.createContext({window:{...state,CuttingJobHistory:history},cuttingJobs:state.cuttingJobs,completedCuttingJobs:state.completedCuttingJobs,deletedItems:state.deletedItems,
    cloneStructured:clone,console,JOB_RATE_PER_HOUR:200,JOB_BASE_COST_PER_HOUR:45,
    refreshGlobalCollections(){},purgeExpiredDeletedItems:stop("purge"),genId:stop("new ID"),
    saveCloudNow:stop("cloud save"),saveCloudDebounced:stop("debounced save"),persistJobChanges:stop("persist"),
    promptCreateCategory:stop("category"),reorderPriorities:stop("priority"),normalizeAllPriorities:stop("normalize"),
    renderJobs:stop("render"),renderCalendarPreservingScroll:stop("calendar"),toast:message=>toastMessages.push(message),
    pendingNewJobFiles:[{id:"pending"}],pendingSecureCloudJobFiles:[{file:{name:"pending"}}],...extra});
  return {c,effects,toastMessages};
}
for(const mixed of [false,true]){
  const label=mixed?"mixed":"canonical";
  test(label+" direct resequence is blocked; pure planning never mutates",()=>{
    const state=domain(mixed),before=clone(state),result=history.resequence(state.cuttingJobs,state.completedCuttingJobs);
    assert.equal(result.blocked,true);assert.equal(result.requiresCoordinator,true);
    assert.equal(result.requiresReview,mixed);assert.deepEqual(state,before);
    assert.equal(history.planResequence(state.cuttingJobs,state.completedCuttingJobs).blocked,mixed);
    assert.deepEqual(state,before);
    const audit=history.audit(state,folders());assert.equal(audit.numberingBlocked,true);assert.ok(audit.numbering.every(item=>item.expected===null));
  });
  test(label+" actual repair plan and execution stop before categories, backup or save",async()=>{
    const state=domain(mixed),categories=folders(),before=clone({state,categories}),effects=[];
    const env={state:()=>state,categories:()=>categories,baseline:()=>state,setCategories:()=>effects.push("categories"),revalidateBaseline:async()=>{effects.push("revalidate");return true;},backup:async()=>effects.push("backup"),saveCloudNow:async()=>effects.push("save")};
    const proposal=repair.plan(state,categories),audit=repair.audit(state,categories,{baseline:state}),result=await repair.repair(env,{confirmed:true});
    assert.equal(proposal.ok,false);assert.equal(audit.repairPlan,null);assert.match(audit.blockingError,/chronology|Chronology/);
    assert.equal(result.blocked,true);assert.equal(result.saveAttempted,false);assert.equal(result.saveCompleted,false);assert.deepEqual(effects,[]);assert.deepEqual({state,categories},before);
  });
  test(label+" completion without the guarded date adapter leaves lifecycle, priorities and logs untouched",async()=>{
    const state=domain(mixed),before=clone(state),h=context(state);
    vm.runInContext(slice(core,"function normalizeJobPriorityOrder(","function refreshGlobalCollections("),h.c);
    const result=await h.c.completeCuttingJob("active",{normalizePriorities:()=>h.effects.push("normalize")});
    assert.equal(result.blocked,true);assert.deepEqual(state,before);assert.equal(h.c.window.syncProcessLog,undefined);assert.deepEqual(h.effects,[]);
  });
  for(const type of ["job","completed-job"])test(label+" actual "+type+" restore retains trash and never saves",()=>{
    const state=domain(mixed);state.deletedItems.push({id:"trash",type,payload:{id:"restore",name:"restore",cutNumber:"C010"}});
    const before=clone(state),h=context(state);
    vm.runInContext(slice(core,"function applyRestoreByType(","function snapshotWorkspaceForTrash("),h.c);
    const direct=h.c.applyRestoreByType(state.deletedItems[0],0);assert.equal(direct.blocked,true);
    const result=h.c.restoreDeletedItem("trash");assert.equal(result.ok,false);assert.equal(result.blocked,true);
    assert.deepEqual(state,before);assert.deepEqual(h.effects,[]);
  });
  for(const [name,marker] of [["dashboard add",'jobForm?.addEventListener("submit"'],["Jobs add",'document.getElementById("addJobForm")?.addEventListener("submit"']])test(label+" actual "+name+" handler stops before dependent mutation",async()=>{
    const state=domain(mixed),before=clone(state);let handler;
    const form={addEventListener(event,fn){assert.equal(event,"submit");handler=fn;}},h=context(state,{jobForm:form,document:{getElementById(id){assert.equal(id,"addJobForm");return form;}}});
    const a=renderers.indexOf(marker),b=renderers.indexOf("\n  });",a);assert.ok(a>=0&&b>a);
    vm.runInContext(renderers.slice(a,b+6),h.c);
    const pending=JSON.stringify([h.c.pendingNewJobFiles,h.c.pendingSecureCloudJobFiles]),result=await handler({preventDefault(){}});
    assert.equal(result.blocked,true);assert.deepEqual(state,before);assert.deepEqual(h.effects,[]);
    assert.equal(JSON.stringify([h.c.pendingNewJobFiles,h.c.pendingSecureCloudJobFiles]),pending);
    assert.equal(h.toastMessages.length,1);assert.match(h.toastMessages[0],/saving is unavailable/);
  });
  test(label+" actual Make active copy branch returns a blocker before opening the date modal",async()=>{
    const state=domain(mixed),before=clone(state),h=context(state,{histActivate:{getAttribute:()=>state.completedCuttingJobs[0].id},closeHistoryActionMenu(){},closeFileMenu(){},showMakeActiveCopyModal:()=>{h.effects.push("modal");throw Error("Unexpected modal");}});
    vm.runInContext("this.activate=async function(){"+slice(renderers,"    if (histActivate){","    if (histEdit){")+"}",h.c);
    const result=await h.c.activate();assert.equal(result.blocked,true);assert.deepEqual(h.effects,[]);assert.deepEqual(state,before);
  });
}
test("reviewed payload cannot enter direct restore into an otherwise legacy domain",()=>{
  const state={cuttingJobs:[],completedCuttingJobs:[],deletedItems:[{id:"trash",type:"job",payload:canonical("restored","2026-10-05")}]},before=clone(state),h=context(state);
  vm.runInContext(slice(core,"function applyRestoreByType(","function snapshotWorkspaceForTrash("),h.c);
  assert.equal(h.c.restoreDeletedItem("trash").requiresCoordinator,true);assert.deepEqual(state,before);assert.deepEqual(h.effects,[]);
});
for(const [name,source,start,end,extra] of [
  ["Jobs",renderers,"    if (complete){","    // Save (from edit row)",{complete:{getAttribute:()=>"active"},closeFileMenu(){},closeActionMenu(){},closeHistoryActionMenu(){},todayISO:"2026-10-06",parseJobDate:()=>new Date("2026-10-06T12:00:00Z")}],
  ["Calendar",calendar,'    b.querySelector("[data-bbl-complete-job]")','    b.querySelector("[data-bbl-remove-job]")',{}]
])test(name+" actual completion UI cannot report success or save a blocked result",async()=>{
  const state=domain(true),h=context(state,{...extra,completeCuttingJob:()=>({blocked:true,error:"Chronology review required"})});let handler;
  if(name==="Calendar"){h.c.j={id:"active"};h.c.b={querySelector:()=>({addEventListener(event,fn){handler=fn;}})};}
  const body=slice(source,start,end);
  if(name==="Jobs"){vm.runInContext("this.run=async function(){"+body+"}",h.c);handler=h.c.run;}else vm.runInContext(body,h.c);
  const result=await handler();assert.equal(result.blocked,true);assert.deepEqual(h.effects,[]);assert.deepEqual(h.toastMessages,["Chronology review required"]);
});
test("actual repair UI disables a blocked audit and reports a late blocker without success",async()=>{
  const state=domain(true),categories=folders(),callbacks={},repairRun={disabled:false,addEventListener:(_,fn)=>callbacks.run=fn},repairAudit={addEventListener:(_,fn)=>callbacks.audit=fn};
  const h=context(state,{repairRun,repairAudit,lastRepairAudit:null,status:{textContent:""},rows:{dataset:{}}});
  h.c.window.auditCuttingJobHistoryRepair=()=>repair.audit(state,categories,{baseline:state});
  h.c.window.runCuttingJobHistoryRepair=()=>repair.repair({state:()=>state,categories:()=>categories},{confirmed:true});h.c.window.confirm=()=>true;
  vm.runInContext(slice(core,'  repairAudit?.addEventListener("click"','  window.openReviewedCuttingJobImporter='),h.c);
  callbacks.audit();assert.equal(repairRun.disabled,true);assert.match(h.c.status.textContent,/Audit blocked:.*Chronology/);
  h.c.lastRepairAudit={blockingError:""};await callbacks.run();assert.match(h.c.status.textContent,/Repair not completed:.*Chronology/);
  const result=JSON.parse(h.c.rows.dataset.lastRepairResult);assert.equal(result.blocked,true);assert.equal(result.saveCompleted,false);assert.deepEqual(h.effects,[]);
});
const importRow={import_event_id:"new-import",record_status:"active",job_name:"Part",project_number:"0000",estimate_hours:"2",add_minutes:"30",priority:"1",charge_rate_per_hr:"200",cost_rate_per_hr:"45",start_date:"2026-01-01",due_date:"2026-01-02",category:"Company Improvements",material:"Steel",thickness_inches:"0.25",path_length_ft:"4",path_width_ft:"2",material_cost:"20",material_weight_lb:"10",review_status:"reviewed",source_file:"fixture"};
function importEnv(state,backup){const categories=folders(),materials=[{id:"steel",name:"Steel",density:.283,pricePerLb:.8}],effects=[];
  const api=importer.createApi({state:()=>state,categories:()=>categories,materials:()=>materials,materialSettings:()=>({wasteFactor:10,materials}),authenticatedBaseline:()=>true,revalidateBaseline:async()=>true,backup:async()=>{effects.push("backup");backup?.();},createCategory:()=>{effects.push("category");throw Error("Unexpected category");},saveCloudNow:async()=>{effects.push("save");return {saved:true,stateWriteCompleted:true};}});
  return {api,categories,materials,effects};
}
for(const mixed of [false,true])test((mixed?"mixed":"canonical")+" actual importer refuses before backup, category changes, staging or save",async()=>{
  const state=domain(mixed),h=importEnv(state),before=clone({state,categories:h.categories,materials:h.materials}),preview=h.api.preview([importRow]);assert.equal(preview[0].status,"ready",preview[0].reasons.join(" "));
  const result=await h.api.submit([importRow],{confirmed:true,reviewedPreview:preview});
  assert.equal(result.blocked,true);assert.equal(result.saveAttempted,false);assert.equal(result.saveCompleted,false);assert.deepEqual(h.effects,[]);assert.deepEqual({state,categories:h.categories,materials:h.materials},before);assert.equal(h.api.isBusy(),false);
});
test("import rechecks chronology after backup await and preserves a newly reviewed job",async()=>{
  const state={cuttingJobs:[{id:"existing",projectNumber:"0000",cat:"project",cutNumber:"C099"}],completedCuttingJobs:[]};let afterBackup;
  const h=importEnv(state,()=>{Object.assign(state.cuttingJobs[0],{cutDateISO:"2026-10-05",cutOrderWithinDay:1});afterBackup=clone(state);});
  const result=await h.api.submit([importRow],{confirmed:true,reviewedPreview:h.api.preview([importRow])});
  assert.equal(result.blocked,true);assert.equal(result.saveAttempted,false);assert.equal(result.rollbackAttempted,false);assert.deepEqual(state,afterBackup);assert.deepEqual(h.effects,["backup"]);
});
test("repair rechecks chronology after backup await without rolling back a concurrent review",async()=>{
  const state={cuttingJobs:[{id:"existing",projectNumber:"0000",cat:"project",cutNumber:"C099"}],completedCuttingJobs:[]},categories=folders(),effects=[];let afterBackup;
  const result=await repair.repair({state:()=>state,categories:()=>categories,revalidateBaseline:async()=>true,backup:async()=>{Object.assign(state.cuttingJobs[0],{cutDateISO:"2026-10-05",cutOrderWithinDay:1});afterBackup=clone(state);},setCategories:()=>effects.push("category"),saveCloudNow:async()=>effects.push("save")},{confirmed:true});
  assert.equal(result.blocked,true);assert.equal(result.saveAttempted,false);assert.equal(result.rollbackAttempted,false);assert.deepEqual(state,afterBackup);assert.deepEqual(effects,[]);
});
test("all-legacy direct resequence remains compatible and does not initialize actual chronology",()=>{
  const active=[{id:"later",startISO:"2026-10-06",cutNumber:"C001"}],completed=[{id:"older",completedAtISO:"2026-10-05",cutNumber:"C002"}];
  assert.equal(history.isResequenceBlocked(history.resequence(active,completed)),false);assert.equal(active[0].cutNumber,"C002");assert.equal(completed[0].cutNumber,"C001");
  for(const job of [...active,...completed]){assert.equal(Object.hasOwn(job,"cutDateISO"),false);assert.equal(Object.hasOwn(job,"cutOrderWithinDay"),false);}
});
test("direct mutation guards recognize all fail-closed result forms",()=>{
  for(const result of [null,undefined,{blocked:true},{requiresReview:true},{requiresCoordinator:true},{ok:false},{invalid:true},{unavailable:true}])assert.equal(history.isResequenceBlocked(result),true);
  assert.equal(history.isResequenceBlocked({sequence:[],changed:[]}),false);
});
