"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const setup=require("../js/maintenanceRecoveryTaskSetup"),history=require("../js/historicalImport"),firewall=require("../js/cuttingFileContentFirewall");
const clone=structuredClone;
const base=()=>({syncMeta:{rev:7},tasksAsReq:[],tasksInterval:[{id:"keep",name:"Existing interval",mode:"interval",variant:"template",templateId:"keep",interval:400,price:90,downtimeHours:2,manualHistory:[{dateISO:"2025-01-01"}],recurrence:{enabled:true}}],inventory:[{id:"stock",qtyNew:10}],maintenanceTasksV2:[],maintenanceCalendarInstancesV2:[],maintenanceOccurrencesV2:[],receiptTrackerWeeks:[{key:"purchase",rows:[{cost:60}]}],totalHistory:[{dateISO:"2025-01-01",hours:500}],pumpEff:{entries:[],notes:["keep"]},settingsFolders:[{id:"root",name:"Root",order:20}],deletedItems:[],inventoryTransactions:[{id:"keep-transaction"}],appConfig:{keep:true}});
function nativeFactory(definition,order,id){return setup.buildAsRequiredTask({id,name:definition.name,manualLink:"",storeLink:"",pn:definition.pn,price:definition.price,note:"",cat:"root",parentTask:null,order,downtimeHours:definition.downtimeHours});}
function harness(options={}){
  let state=clone(options.initial||base()),cloud=clone(state),revision=7,saves=0,backups=0,suspends=0,reads=0,serial=0,applies=0,writable=true;
  const baseline=clone(cloud),env={state:()=>clone(state),canWrite:()=>writable,readCloud:async()=>{reads++;if(options.read)return options.read({state,cloud,reads});return clone(cloud);},loadedRevision:()=>revision,scan:firewall.scanCuttingFileContent,backup:async source=>{backups++;assert.deepEqual(source,cloud);if(options.backup)return options.backup({state,cloud,setRevision:value=>revision=value});return true;},createTask:(definition,order)=>options.factory?options.factory(definition,order):nativeFactory(definition,order,`fixture-${++serial}`),apply:(key,value)=>{assert.equal(key,"tasksAsReq");state[key]=clone(value);applies++;options.apply?.(state,applies);},save:async saveOptions=>{saves++;assert.equal(saveOptions.expectedRevision,revision);if(options.save)return options.save({state,cloud,saves,commit:()=>{cloud=clone(state);cloud.syncMeta.rev=++revision;}});cloud=clone(state);cloud.syncMeta.rev=++revision;state.syncMeta.rev=revision;return{saved:true,stateWriteCompleted:true,stateWriteAttempted:true};},suspend:()=>{suspends++;writable=false;}};
  const api=history.createApi(env);
  return{api,env,baseline,get state(){return state;},get cloud(){return cloud;},get saves(){return saves;},get backups(){return backups;},get suspends(){return suspends;},get reads(){return reads;},submit:async(reviewedPreview)=>api.submit("task_setup",null,{confirmed:true,reviewedPreview:reviewedPreview||await api.previewAuthoritativeTaskSetup()})};
}
test("authoritative setup preview is non-mutating and classifies six ready and two unresolved",async()=>{
  const h=harness(),before=clone(h.state),plan=await h.api.previewAuthoritativeTaskSetup();
  assert.deepEqual(h.state,before);assert.deepEqual(h.cloud,before);assert.equal(h.reads,1);assert.equal(h.saves,0);assert.equal(h.backups,0);assert.equal(plan.filter(row=>row.status===setup.STATUS.ready).length,6);assert.equal(plan.filter(row=>row.status===setup.STATUS.blocked).length,2);
  assert.match(plan.find(row=>row.raw.name==="Transfer Tank Water Pump").reason,/Part number, parts cost and labor unresolved/);assert.match(plan.find(row=>row.raw.name==="Empty Scrap Bin").reason,/Labor duration unresolved/);
});
test("all six missing creates six exact native reusable definitions, backup, CAS and server preflight",async()=>{
  const h=harness(),result=await h.submit();assert.equal(result.saved,true);assert.equal(h.saves,1);assert.equal(h.backups,1);assert.equal(h.suspends,0);assert.equal(result.importedIds.length,6);
  assert.deepEqual({...result.taskSetup,preflight:undefined},{created:6,alreadyPresent:0,blockedForReview:2,duplicates:0,preflight:undefined});
  for(const definition of setup.definitions.filter(row=>!row.reason)){
    const tasks=h.cloud.tasksAsReq.filter(task=>task.name===definition.name);assert.equal(tasks.length,1);const task=tasks[0];assert.equal(task.price,definition.price);assert.equal(task.downtimeHours,definition.minutes/60);assert.equal(task.pn,definition.pn);assert.equal(task.mode,"asreq");assert.equal(task.variant,"template");assert.equal(task.templateId,task.id);assert.equal(task.cat,"root");assert.equal(task.parentTask,null);assert.ok(task.order>20);
    for(const forbidden of ["recurrence","repeatRule","calendarDateISO","manualHistory","completedDates","import_event_id","inventoryId"])assert.equal(Object.hasOwn(task,forbidden),false,forbidden);
    assert.equal(result.taskSetup.preflight.find(row=>row.raw.name===definition.name).matchCount,1);
  }
  for(const [key,value]of Object.entries(h.baseline))if(!["syncMeta","tasksAsReq"].includes(key))assert.deepEqual(h.cloud[key],value,key);
  for(const name of ["Transfer Tank Water Pump","Empty Scrap Bin"])assert.equal(h.cloud.tasksAsReq.some(task=>task.name===name),false);
});
test("second setup creates zero additional records and performs zero further backups/saves",async()=>{
  const h=harness();await h.submit();const before=clone(h.cloud),result=await h.submit();assert.equal(result.saved,false);assert.equal(result.taskSetup.created,0);assert.equal(result.taskSetup.alreadyPresent,6);assert.equal(h.saves,1);assert.equal(h.backups,1);assert.deepEqual(h.cloud,before);
});
test("existing exact task is retained byte-for-byte and only five missing tasks are created",async()=>{
  const initial=base(),existing={id:"existing-salt",name:"Refill Salt",mode:"asreq",price:777,downtimeHours:3,pn:"different",manualHistory:[{dateISO:"2025-01-01"}],recurrence:{enabled:false}};initial.tasksAsReq=[existing];
  const h=harness({initial}),result=await h.submit();assert.equal(result.taskSetup.created,5);assert.equal(result.taskSetup.alreadyPresent,1);assert.deepEqual(h.cloud.tasksAsReq.find(task=>task.id===existing.id),existing);
});
test("duplicate exact names are individually blocked while other eligible tasks may be created",async()=>{
  const initial=base();initial.tasksAsReq=[{id:"one",name:"Nozzle Nut",mode:"asreq"},{id:"two",name:"Nozzle Nut",mode:"asreq"}];const h=harness({initial}),plan=await h.api.previewAuthoritativeTaskSetup();assert.equal(plan.find(row=>row.raw.name==="Nozzle Nut").status,setup.STATUS.duplicate);
  const result=await h.submit(plan);assert.equal(result.taskSetup.created,5);assert.equal(result.taskSetup.duplicates,1);assert.equal(h.cloud.tasksAsReq.filter(task=>task.name==="Nozzle Nut").length,2);
});
test("unresolved definitions cannot be forged into an eligible plan or appended",()=>{
  const state=base(),plan=setup.preview(state),ready=plan.filter(row=>row.status===setup.STATUS.ready);
  for(const name of ["Transfer Tank Water Pump","Empty Scrap Bin"]){
    const forged=clone(ready),blocked=clone(plan.find(row=>row.raw.name===name));
    blocked.status=setup.STATUS.ready;Object.assign(blocked.raw,{pn:"reviewed",price:0,minutes:30,downtimeHours:0.5});delete blocked.raw.reason;forged.push(blocked);
    assert.throws(()=>setup.append(state,forged,(definition,order)=>nativeFactory(definition,order,"forged")),/eligibility changed/);assert.equal(state.tasksAsReq.length,0);
  }
});
test("preview ignores instances, uses exact names, and blocks ambiguous saved task identity",()=>{
  const state=base();state.tasksAsReq=[{id:"i",name:"Nozzle Nut",variant:"instance",templateId:"template"},{id:"lower",name:"refill salt",variant:"template"}];assert.equal(setup.preview(state).find(row=>row.raw.name==="Nozzle Nut").status,setup.STATUS.ready);assert.equal(setup.preview(state).find(row=>row.raw.name==="Refill Salt").status,setup.STATUS.ready);
  state.tasksAsReq.push({id:"same",name:"Nozzle Nut"},{id:"same",name:"Other name"});assert.equal(setup.preview(state).find(row=>row.raw.name==="Nozzle Nut").status,setup.STATUS.duplicate);
});
for(const [name,options] of [
  ["backup failure",{backup:()=>false}],
  ["backup-time local drift",{backup:({state})=>{state.inventory[0].qtyNew++;return true;}}],
  ["backup-time revision drift",{backup:({setRevision})=>{setRevision(8);return true;}}],
  ["invalid native schema",{factory:(definition,order)=>({...nativeFactory(definition,order,"fixture"),repeatRule:{enabled:true}})}],
  ["colliding native IDs",{factory:(definition,order)=>nativeFactory(definition,order,"same-id")}]
])test(`${name} blocks before staging/saving`,async()=>{const h=harness(options),result=await h.submit();assert.equal(result.saved,false);assert.equal(h.saves,0);assert.equal(h.state.tasksAsReq.length,0);assert.equal(h.suspends,0);});
test("explicit confirmation, exact preview and cloud/local business agreement are required",async()=>{
  const h=harness(),plan=await h.api.previewAuthoritativeTaskSetup();assert.equal((await h.api.submit("task_setup",null,{confirmed:false,reviewedPreview:plan})).saved,false);
  const changed=clone(plan);changed[0].raw.price=1;assert.match((await h.submit(changed)).error,/preview changed/);
  h.state.inventory[0].qtyNew++;assert.match((await h.submit(plan)).error,/differs from cloud/);assert.equal(h.saves,0);assert.equal(h.backups,0);
});
test("pre-save staged mismatch restores exactly with zero saves and no suspension",async()=>{
  const h=harness({apply:(state,count)=>{if(count===1)state.tasksAsReq[0].price=99;}}),result=await h.submit();assert.equal(h.saves,0);assert.equal(result.rollbackCompleted,true);assert.equal(h.suspends,0);assert.deepEqual(h.state.tasksAsReq,h.baseline.tasksAsReq);
});
test("unprovable pre-save restoration suspends and preserves evidence",async()=>{
  const h=harness({apply:(state,count)=>{if(count===1)state.tasksAsReq[0].price=99;else state.tasksAsReq.push({id:"unexpected"});}}),result=await h.submit();assert.equal(result.rollbackReviewRequired,true);assert.equal(h.saves,0);assert.equal(h.suspends,1);
});
test("definite failed save selectively removes unchanged setup tasks and preserves concurrent tasks",async()=>{
  const h=harness({save:({state})=>{state.tasksAsReq.push({id:"concurrent",name:"Concurrent task"});return{saved:false,definiteFailure:true,stateWriteAttempted:true};}}),result=await h.submit();assert.equal(result.rollbackCompleted,true);assert.deepEqual(h.state.tasksAsReq,[{id:"concurrent",name:"Concurrent task"}]);assert.equal(h.suspends,0);
});
test("changed/referenced setup task on definite failure suspends without deleting evidence",async()=>{
  for(const mutate of [state=>state.tasksAsReq[0].price++,state=>state.inventory[0].linkedTaskId=state.tasksAsReq[0].id]){
    const h=harness({save:({state})=>{mutate(state);return{saved:false,definiteFailure:true,stateWriteAttempted:true};}}),result=await h.submit();assert.equal(result.rollbackReviewRequired,true);assert.equal(h.state.tasksAsReq.length,6);assert.equal(h.suspends,1);
  }
});
test("ambiguous or thrown save suspends without rollback/retry",async()=>{
  for(const save of [()=>({saved:false,stateWriteAttempted:true,indeterminate:true}),()=>{throw Error("unknown outcome");}]){const h=harness({save}),result=await h.submit();assert.equal(result.indeterminate,true);assert.equal(h.saves,1);assert.equal(h.suspends,1);assert.equal(h.state.tasksAsReq.length,6);}
});
test("post-save altered definition, duplicate, unresolved addition or unrelated mutation suspends",async()=>{
  for(const mutate of [cloud=>cloud.tasksAsReq[0].downtimeHours++,cloud=>cloud.tasksAsReq.push(clone(cloud.tasksAsReq[0])),cloud=>cloud.tasksAsReq.push({id:"bad",name:"Empty Scrap Bin"}),cloud=>cloud.inventory[0].qtyNew++]){
    const h=harness({save:({cloud,commit})=>{commit();return{saved:true,stateWriteCompleted:true,stateWriteAttempted:true};},read:({cloud,reads})=>{if(reads===3)mutate(cloud);return clone(cloud);}}),result=await h.submit();assert.equal(result.saved,false);assert.equal(result.saveCompleted,true);assert.equal(h.suspends,1);assert.equal(h.state.tasksAsReq.length,6);
  }
});
test("missing authoritative state or malformed task collections cannot preview/create",async()=>{
  for(const cloud of [null,{}, {...base(),tasksAsReq:{}}]){const h=harness({read:()=>cloud});await assert.rejects(h.api.previewAuthoritativeTaskSetup);assert.equal(h.saves,0);assert.equal(h.backups,0);}
});
test("native form handlers share the exact constructor; setup is explicit and outside defaults",()=>{
  const renderer=fs.readFileSync("js/renderers.js","utf8"),core=fs.readFileSync("js/core.js","utf8"),ui=fs.readFileSync("js/historicalImportUi.js","utf8"),index=fs.readFileSync("index.html","utf8");
  assert.equal((renderer.match(/OMAXMaintenanceRecoveryTaskSetup\.buildAsRequiredTask\(base, condition\)/g)||[]).length,2);assert.match(core,/id:genId\(definition.name\)/);assert.match(core,/save:options=>saveCloudNow\(options\)/);
  assert.ok(index.indexOf('src="js/maintenanceRecoveryTaskSetup.js"')<index.indexOf('src="js/historicalImport.js"'));
  const tool=ui.slice(ui.indexOf("function renderMaintenanceRecoveryTaskSetupTool"));assert.match(tool,/previewAuthoritativeTaskSetup/);assert.match(tool,/data-task-setup-confirm disabled/);assert.match(tool,/submit\("task_setup",null/);assert.doesNotMatch(tool,/submit\("maintenance"|saveCloudNow|tasksAsReq\.push|tasksAsReq\.unshift/);
  assert.doesNotMatch(core.slice(core.indexOf("const defaultAsReqTasks"),core.indexOf("function resolveTaskVariant")),/Refill Salt|Nozzle Collet|Main Pump Filter 1.0 Micron/);
});

test("real core environment constructs native IDs and stages exact tasks through refresh/snapshot/compaction",async()=>{
  const core=fs.readFileSync("js/core.js","utf8");
  const window={...base(),OMAXHistoricalImport:history,OMAXMaintenanceRecoveryTaskSetup:setup,APP_SCHEMA:1,__loadedCloudRevisionForSaveGuard:7,cuttingJobs:[],completedCuttingJobs:[],opportunityRollups:[],orderRequests:[],orderRequestTab:"open",garnetCleanings:[],dailyCutHours:[],jobFolders:[],weeklyCostReports:[]};
  let cloud,saves=0,suspends=0;
  const context=vm.createContext({window,console,APP_SCHEMA:1,lastAppliedCloudRevision:7,FB:{user:{uid:"fixture"}},structuredClone,cloneStructured:clone,normalizeSettingsFolders:clone,normalizeInventoryMaterials:()=>({}),normalizeAppConfig:clone,getCloudSyncClientId:()=>"fixture",snapshotJobFolders:()=>[],canWriteCloud:()=>true,scanAuthoritativeCutFileContent:firewall.scanCuttingFileContent,buildDataIntegritySummary:()=>({}),exportJsonDownload:()=>true,renderRecoveryDiagnosticsPanel:()=>{suspends++;},readCurrentCloudStateReadOnly:async()=>clone(cloud),saveCloudNow:async options=>{assert.equal(options.expectedRevision,7);saves++;cloud=clone(context.state());cloud.syncMeta.rev=8;window.__loadedCloudRevisionForSaveGuard=8;return{saved:true,stateWriteAttempted:true,stateWriteCompleted:true};}});
  const fields=["totalHistory","tasksInterval","tasksAsReq","inventory","cuttingJobs","completedCuttingJobs","opportunityRollups","orderRequests","orderRequestTab","garnetCleanings","dailyCutHours","maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2","jobFolders","weeklyCostReports","receiptTrackerWeeks","deletedItems","appConfig"];
  vm.runInContext(fields.map(key=>`let ${key}=window.${key};`).join("\n")+"let lastGeneratedIdTime=0;",context);
  for(const [start,end]of [["function genId(name)","\n}"]]){const offset=core.indexOf(start);vm.runInContext(core.slice(offset,core.indexOf(end,offset)+2),context);}
  for(const [start,end]of [["const LARGE_CONTENT_KEY_PATTERN","function estimateTopLevelFieldSizes"],["function compactStateForStorage","function buildEmergencyBackup"],["function refreshGlobalCollections","/* ================ Jobs editing"],["function cloneFolders","function foldersEqual"],["function snapshotSettingsFolders","window.defaultAsReqTasks"],["function snapshotState(options","function scanAuthoritativeCutFileContent"]])vm.runInContext(core.slice(core.indexOf(start),core.indexOf(end,core.indexOf(start))),context);
  vm.runInContext("this.state=()=>compactStateForStorage(snapshotState({skipLocalFileCacheSync:true}));",context);cloud=clone(context.state());cloud.syncMeta.rev=7;const before=clone(cloud);
  vm.runInContext(core.slice(core.indexOf("window.historicalImport ="),core.indexOf("window.getWorkspaceAuthorizationDiagnostics")),context);
  const plan=await window.historicalImport.previewAuthoritativeTaskSetup(),result=await window.historicalImport.submit("task_setup",null,{confirmed:true,reviewedPreview:plan});
  assert.equal(result.saved,true);assert.equal(saves,1);assert.equal(suspends,0);assert.equal(cloud.tasksAsReq.length,6);assert.equal(window._maintOrderCounter,26);assert.equal(new Set(cloud.tasksAsReq.map(task=>task.id)).size,6);
  assert.ok(cloud.tasksAsReq.every(task=>task.id.startsWith(task.name.toLowerCase().replace(/[^a-z0-9]+/g,"_")+"_")));
  for(const [key,value]of Object.entries(before))if(!["syncMeta","saveMeta","syncProcessLog","tasksAsReq"].includes(key))assert.equal(history.canonical(cloud[key]),history.canonical(value),key);
});

test("operator UI does nothing on render, previews without writes and requires confirmation before setup",async()=>{
  class Element{
    constructor(){this.children=[];this.events={};this.controls=new Map();this.dataset={};this.checked=false;this.disabled=false;}
    appendChild(child){this.children.push(child);return child;}
    replaceChildren(){this.children=[];}
    querySelector(selector){if(!this.controls.has(selector))this.controls.set(selector,new Element());return this.controls.get(selector);}
    addEventListener(event,callback){this.events[event]=callback;}
  }
  const root=new Element(),h=harness(),kinds=[];
  const window={OMAXMaintenanceRecoveryTaskSetup:setup,confirm:()=>true,historicalImport:{previewAuthoritativeTaskSetup:()=>h.api.previewAuthoritativeTaskSetup(),submit:async(kind,...args)=>{kinds.push(kind);return h.api.submit(kind,...args);}}};
  const context=vm.createContext({window,document:{createElement:()=>new Element()}}),ui=fs.readFileSync("js/historicalImportUi.js","utf8");vm.runInContext(ui.slice(ui.indexOf("function renderMaintenanceRecoveryTaskSetupTool"))+";this.render=renderMaintenanceRecoveryTaskSetupTool;",context);context.render(root);
  const section=root.children[0],preview=section.querySelector("[data-task-setup-preview]"),review=section.querySelector("[data-task-setup-confirm]"),create=section.querySelector("[data-task-setup-create]"),status=section.querySelector("[data-task-setup-status]");
  assert.equal(h.reads,0);assert.equal(h.saves,0);await create.events.click();assert.equal(kinds.length,0);
  await preview.events.click();assert.equal(h.reads,1);assert.equal(h.saves,0);assert.equal(create.disabled,true);await create.events.click();assert.equal(kinds.length,0);
  review.checked=true;review.events.change();assert.equal(create.disabled,false);await create.events.click();assert.deepEqual(kinds,["task_setup"]);assert.equal(h.saves,1);assert.match(status.textContent,/Created: 6; Already Present: 0; Blocked for Review: 2; Duplicates: 0/);assert.equal(create.disabled,true);assert.equal(review.checked,false);
  const preflight=section.querySelector("[data-task-setup-rows]").children;assert.equal(preflight.length,8);assert.equal(preflight.filter(tr=>tr.children[6].textContent===setup.STATUS.present).length,6);assert.equal(preflight.filter(tr=>tr.children[6].textContent===setup.STATUS.blocked).length,2);
});
