"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const history=require("../js/historicalImport"),workbooks=require("../js/recoveryWorkbook"),xlsx=require("../assets/vendor/cji-xlsx-parser"),fixtures=require("./fixtures/recovery-workbooks"),firewall=require("../js/cuttingFileContentFirewall");
const clone=structuredClone,core=fs.readFileSync("js/core.js","utf8");
const purchase={import_event_id:"OMAX-PUR-2066325-01-302240",source_id:"order-2066325",source_record_id:"01-302240",date:"2025-01-03",purchased:"Nozzle nut",cost:3.1,qty:1,partnumber:"302240",shipping:.17,tax:.02};
async function workbookRows(){return workbooks.parseFile("purchase",fixtures.file("Purchase_History_Import.xlsx",[{name:"Purchases",headers:workbooks.contracts.purchase.required,rows:[purchase]}]),xlsx);}
function browserHarness(options={}){
  const window={OMAXHistoricalImport:history,APP_SCHEMA:1,__loadedCloudRevisionForSaveGuard:7,inventory:[{id:"keep",qtyNew:9}],receiptTrackerWeeks:[],totalHistory:[],tasksInterval:[],tasksAsReq:[],cuttingJobs:[],completedCuttingJobs:[],opportunityRollups:[],orderRequests:[],orderRequestTab:"open",garnetCleanings:[],dailyCutHours:[],maintenanceTasksV2:[],maintenanceCalendarInstancesV2:[],maintenanceOccurrencesV2:[],jobFolders:[],weeklyCostReports:[],deletedItems:[],appConfig:{keep:true},settingsFolders:[],pumpEff:{entries:[],notes:[]}};
  let cloud,saves=0,suspends=0,applies=0;
  const context=vm.createContext({window,console,APP_SCHEMA:1,lastAppliedCloudRevision:7,FB:{user:{uid:"fixture"}},structuredClone,cloneStructured:clone,normalizeSettingsFolders:clone,normalizeInventoryMaterials:()=>({}),normalizeAppConfig:clone,getCloudSyncClientId:()=>"fixture",snapshotJobFolders:()=>[],canWriteCloud:()=>!suspends,scanAuthoritativeCutFileContent:firewall.scanCuttingFileContent,buildDataIntegritySummary:()=>({}),exportJsonDownload:()=>true,renderRecoveryDiagnosticsPanel:()=>{suspends++;},readCurrentCloudStateReadOnly:async()=>clone(cloud),saveCloudNow:async saveOptions=>{saves++;assert.equal(saveOptions.expectedRevision,7);if(options.save)return options.save(window);cloud=clone(context.state());cloud.syncMeta.rev=8;window.__loadedCloudRevisionForSaveGuard=8;return{saved:true,stateWriteAttempted:true,stateWriteCompleted:true};}});
  const fields=["totalHistory","tasksInterval","tasksAsReq","inventory","cuttingJobs","completedCuttingJobs","opportunityRollups","orderRequests","orderRequestTab","garnetCleanings","dailyCutHours","maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2","jobFolders","weeklyCostReports","receiptTrackerWeeks","deletedItems","appConfig"];
  vm.runInContext(fields.map(key=>`let ${key}=window.${key};`).join("\n"),context);
  for(const [start,end]of [["const LARGE_CONTENT_KEY_PATTERN","function estimateTopLevelFieldSizes"],["function compactStateForStorage","function buildEmergencyBackup"],["function refreshGlobalCollections","/* ================ Jobs editing"],["function cloneFolders","function foldersEqual"],["function snapshotSettingsFolders","window.defaultAsReqTasks"],["function snapshotState(options","function scanAuthoritativeCutFileContent"]])vm.runInContext(core.slice(core.indexOf(start),core.indexOf(end,core.indexOf(start))),context);
  vm.runInContext("this.state=()=>compactStateForStorage(snapshotState({skipLocalFileCacheSync:true}));this.apply=(key,value)=>{window[key]=value;refreshGlobalCollections();};this.sanitize=sanitizeValueForStorage",context);
  cloud=clone(context.state());cloud.syncMeta.rev=7;
  if(options.apply){const original=context.apply;context.apply=(key,value)=>{original(key,value);options.apply(window,key,++applies);};}
  if(options.apply){
    // Use the real core environment with only its apply body fault-injected.
    const registration=core.slice(core.indexOf("window.historicalImport ="),core.indexOf("window.getWorkspaceAuthorizationDiagnostics"));
    vm.runInContext(registration.replace("window[key]=value;refreshGlobalCollections();","faultApply(key,value);"),Object.assign(context,{faultApply:context.apply}));
  }else vm.runInContext(core.slice(core.indexOf("window.historicalImport ="),core.indexOf("window.getWorkspaceAuthorizationDiagnostics")),context);
  return{window,context,api:window.historicalImport,get cloud(){return clone(cloud);},get saves(){return saves;},get suspends(){return suspends;},submit:(kind,rows)=>window.historicalImport.submit(kind,rows,{confirmed:true,reviewedPreview:window.historicalImport.preview(kind,rows)})};
}
test("actual browser purchase workbook apply/refresh/snapshot/compact preserves the exact approved plan",async()=>{
  const rows=await workbookRows(),h=browserHarness(),plan=h.api.preview("purchase",rows),next=history.append("purchase",h.context.state(),plan);
  assert.equal(plan[0].status,history.STATUS.missing);assert.equal(rows[0].__sourceRowNumber,2);assert.deepEqual(rows[0].__recoveryProblems,[]);
  h.context.apply("receiptTrackerWeeks",clone(next.receiptTrackerWeeks));
  assert.equal(history.canonical(h.context.state().receiptTrackerWeeks),history.canonical(next.receiptTrackerWeeks));
});
test("browser purchase submission retains all approved row fields and provenance through save/read-back",async()=>{
  const rows=await workbookRows(),h=browserHarness(),before=clone(h.window.inventory),result=await h.submit("purchase",rows);
  assert.equal(result.saved,true);assert.equal(h.saves,1);assert.equal(h.suspends,0);assert.deepEqual(h.window.inventory,before);
  const row=h.cloud.receiptTrackerWeeks[0].rows[0];for(const [key,value]of Object.entries({import_event_id:purchase.import_event_id,date:purchase.date,purchased:purchase.purchased,cost:purchase.cost,qty:purchase.qty,partNumber:purchase.partnumber,shipping:purchase.shipping,tax:purchase.tax,inventoryItemId:""}))assert.equal(row[key],value,key);
  assert.deepEqual(row.importProvenance.sourceRecord,rows[0]);assert.equal(h.api.preview("purchase",rows)[0].status,history.STATUS.present);
});
test("pre-save transformed staging restores exact destinations without suspension when restoration is proven",async()=>{
  const rows=await workbookRows(),h=browserHarness({apply:(window,key,count)=>{if(count===1)window[key][0].rows[0].cost=99;}}),before=clone(h.context.state()),result=await h.submit("purchase",rows);
  assert.equal(h.saves,0);assert.equal(result.rollbackCompleted,true);assert.equal(h.suspends,0);assert.deepEqual(clone(h.context.state().receiptTrackerWeeks),before.receiptTrackerWeeks);
  assert.equal(result.stagingMismatch.destination,"receiptTrackerWeeks");assert.match(result.stagingMismatch.path,/rows\[0\]\.cost$/);assert.equal(result.stagingMismatch.expected,"3.1");assert.equal(result.stagingMismatch.actual,"99");
  assert.equal((await h.submit("purchase",rows)).saved,true,"A fresh explicit operator submission is still writable after proven pre-save restoration");assert.equal(h.saves,1);
});
test("unprovable pre-save restoration suspends without saving",async()=>{
  const rows=await workbookRows(),h=browserHarness({apply:(window,key,count)=>{if(count===1)window[key][0].rows[0].cost=99;else window[key].push({key:"unexpected",rows:[]});}}),result=await h.submit("purchase",rows);
  assert.equal(h.saves,0);assert.equal(result.rollbackCompleted,false);assert.equal(result.rollbackReviewRequired,true);assert.equal(h.suspends,1);
});
test("pre-save unrelated protected changes are preserved and suspend writes even after destination restoration",async()=>{
  const rows=await workbookRows(),h=browserHarness({apply:(window,key,count)=>{if(count===1){window[key][0].rows[0].cost=99;window.inventory[0].qtyNew=11;}}}),result=await h.submit("purchase",rows);
  assert.equal(h.saves,0);assert.equal(h.window.receiptTrackerWeeks.length,0);assert.equal(h.window.inventory[0].qtyNew,11);assert.equal(h.suspends,1);assert.equal(result.rollbackReviewRequired,true);
});
for(const [kind,row]of [["pump",{import_event_id:"rpm",source_id:"rpm",source_record_id:"1",date:"2025-01-03",rpm:3400,timeiso:"12:00",time_source:"unknown_source_time_placeholder_noon"}],["pump_hours",{import_event_id:"hours",source_id:"hours",source_record_id:"1",date:"2025-01-03",hours:100}],["maintenance",{import_event_id:"maintenance",event_date:"2025-01-03",route:"calendar_only",event_name:"Inspect fixture",exact_existing_task:"",calendar_mode:"one_time",mark_completed:"true",labor_minutes:5,parts_cost_snapshot:3.1}]]){
  test(`${kind} workbook metadata survives the real browser staging lifecycle`,async()=>{const h=browserHarness(),rows=workbooks.adapt(kind,[{...row,__sourceRowNumber:2}]),result=await h.submit(kind,rows);assert.equal(result.saved,true);assert.equal(h.saves,1);assert.equal(h.suspends,0);});
}
test("storage preserves only bounded workbook markers in source provenance; runtime keys remain stripped",()=>{
  const h=browserHarness(),record={__sourceRowNumber:2,__recoveryProblems:[],__secret:"runtime",debug_notes:"runtime"},actual=h.context.sanitize({__sourceRowNumber:2,importProvenance:{sourceRecord:record},ordinary:{sourceRecord:record}});
  assert.equal(actual.__sourceRowNumber,undefined);assert.equal(actual.importProvenance.sourceRecord.__sourceRowNumber,2);assert.deepEqual(clone(actual.importProvenance.sourceRecord.__recoveryProblems),[]);assert.equal(actual.importProvenance.sourceRecord.__secret,undefined);assert.equal(actual.ordinary.sourceRecord.__sourceRowNumber,undefined);
  for(const invalid of [0,-1,1048577,"2",{nested:true}])assert.equal(h.context.sanitize({importProvenance:{sourceRecord:{__sourceRowNumber:invalid}}}).importProvenance.sourceRecord.__sourceRowNumber,undefined);
  assert.equal(h.context.sanitize({importProvenance:{sourceRecord:{__recoveryProblems:["needs review"]}}}).importProvenance.sourceRecord.__recoveryProblems,undefined);
});
test("staging diagnostic values are bounded and do not echo embedded content",async()=>{
  const rows=await workbookRows(),h=browserHarness({apply:(window,key,count)=>{if(count===1)window[key][0].rows[0].purchased="data:application/dxf;base64,"+"A".repeat(10000);}}),result=await h.submit("purchase",rows);
  assert.equal(h.saves,0);assert.equal(h.suspends,0);assert.ok(result.error.length<1400);assert.ok(!result.error.includes("base64,"));assert.ok(!JSON.stringify(result.stagingMismatch).includes("AAAA"));
});
test("throwing apply before save restores exact previous destinations and remains writable",async()=>{
  const rows=await workbookRows(),h=browserHarness({apply:(window,key,count)=>{if(count===1){window[key][0].rows[0].cost=99;throw Error("local apply failed");}}}),before=clone(h.context.state()),result=await h.submit("purchase",rows);
  assert.equal(result.saveAttempted,false);assert.equal(h.saves,0);assert.equal(result.rollbackCompleted,true);assert.equal(h.suspends,0);assert.deepEqual(clone(h.context.state().receiptTrackerWeeks),before.receiptTrackerWeeks);
});
test("partial multi-destination maintenance apply failure restores all pre-save destinations",async()=>{
  const h=browserHarness({apply:(window,key,count)=>{if(count===2)throw Error("second destination apply failed");}}),row={import_event_id:"one-time",event_date:"2025-01-03",route:"calendar_only",event_name:"Inspect fixture",exact_existing_task:"",calendar_mode:"one_time",mark_completed:true,labor_minutes:5},before=clone(h.context.state()),result=await h.submit("maintenance",[row]);
  assert.equal(h.saves,0);assert.equal(result.rollbackCompleted,true);assert.equal(h.suspends,0);for(const key of ["maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2"])assert.deepEqual(clone(h.context.state()[key]),before[key]);
});
test("protected isolation check still rejects unrelated drift even when the staged destination matches",async()=>{
  const rows=await workbookRows(),h=browserHarness({apply:(window,key,count)=>{if(count===1)window.inventory[0].qtyNew=11;}}),result=await h.submit("purchase",rows);
  assert.match(result.error,/Unrelated protected fields changed during staging/);assert.equal(result.stagingMismatch,undefined);assert.equal(h.saves,0);assert.equal(h.window.receiptTrackerWeeks.length,0);assert.equal(h.window.inventory[0].qtyNew,11);assert.equal(h.suspends,1);
});

const comparisonState=()=>({syncMeta:{rev:7},tasksAsReq:[{id:"salt",name:"Refill Salt",price:10}],tasksInterval:[],inventory:[{id:"stock",qtyNew:9}],maintenanceTasksV2:[],maintenanceCalendarInstancesV2:[],maintenanceOccurrencesV2:[]});
const comparisonCases=[
  ["cloud missing and local empty completedDates",state=>{state.tasksAsReq[0].completedDates=[];},true],
  ["cloud empty and local missing completedDates",(state,cloud)=>{cloud.tasksAsReq[0].completedDates=[];},true],
  ["explicit undefined completedDates",state=>{state.tasksAsReq[0].completedDates=undefined;},true],
  ["real completed date",state=>{state.tasksAsReq[0].completedDates=["2026-01-01"];},false],
  ["real completed date versus empty array",(state,cloud)=>{state.tasksAsReq[0].completedDates=["2026-01-01"];cloud.tasksAsReq[0].completedDates=[];},false],
  ...["occurrenceHours","occurrenceNotes"].flatMap(field=>[
    [`cloud missing and local empty ${field}`,state=>{state.tasksAsReq[0][field]={};},true],
    [`cloud empty and local missing ${field}`,(state,cloud)=>{cloud.tasksAsReq[0][field]={};},true],
    [`explicit undefined ${field}`,state=>{state.tasksAsReq[0][field]=undefined;},true],
    [`nonempty ${field}`,state=>{state.tasksAsReq[0][field]={"2026-01-01":field==="occurrenceHours"?1:"Changed pump"};},false],
    [`null versus empty ${field}`,(state,cloud)=>{state.tasksAsReq[0][field]=null;cloud.tasksAsReq[0][field]={};},false],
    [`${field} on interval task`,(state,cloud)=>{state.tasksInterval=[{id:"interval",[field]:{}}];cloud.tasksInterval=[{id:"interval"}];},false]
  ]),
  ["all three empty task history fields",state=>{Object.assign(state.tasksAsReq[0],{completedDates:[],occurrenceHours:{},occurrenceNotes:{}});},true],
  ["different task price",state=>{state.tasksAsReq[0].price++;},false],
  ["different task name",state=>{state.tasksAsReq[0].name="Changed";},false],
  ["extra task",state=>{state.tasksAsReq.push({id:"extra",name:"Extra"});},false],
  ["missing task",state=>{state.tasksAsReq=[];},false],
  ["unrelated protected difference",state=>{state.inventory[0].qtyNew++;},false],
  ["identical state",()=>{},true],
  ["null completedDates",state=>{state.tasksAsReq[0].completedDates=null;},false],
  ["completedDates on interval task",(state,cloud)=>{state.tasksInterval=[{id:"interval",completedDates:[]}];cloud.tasksInterval=[{id:"interval"}];},false]
];
for(const [name,change,equal]of comparisonCases)test(`pre-import business comparison: ${name}`,async()=>{
  const local=comparisonState(),cloud=comparisonState();change(local,cloud);const beforeLocal=clone(local),beforeCloud=clone(cloud);
  const normalizedLocal=history.normalizeBusinessForComparison(local),normalizedCloud=history.normalizeBusinessForComparison(cloud);
  assert.equal(history.canonical(normalizedLocal)===history.canonical(normalizedCloud),equal);
  assert.deepEqual(local,beforeLocal);assert.deepEqual(cloud,beforeCloud);
  let writes=0;
  const api=history.createApi({state:()=>clone(local),readCloud:async()=>clone(cloud),loadedRevision:()=>7,canWrite:()=>true,backup:async()=>{writes++;},apply:()=>{writes++;},save:async()=>{writes++;}});
  const result=await api.submit("maintenance",[],{confirmed:true,reviewedPreview:[]});
  assert.equal(result.error,equal?"":"Local business state differs from cloud. Save/reload and generate a fresh preview before importing.");assert.equal(writes,0);
});

for(const [name,change,equal]of comparisonCases)test(`post-backup business comparison: ${name}`,async()=>{
  const local=comparisonState(),duringBackup=clone(local);change(duringBackup,local);const cloud=clone(local),beforeLocal=clone(local),beforeCloud=clone(cloud);
  const rows=[{import_event_id:"comparison-fixture",event_date:"2025-01-03",route:"calendar_only",event_name:"Inspect fixture",exact_existing_task:"",calendar_mode:"one_time",mark_completed:true,labor_minutes:5}];
  let reads=0,backups=0,applies=0,saves=0;
  const api=history.createApi({state:()=>clone(++reads===2?duringBackup:local),readCloud:async()=>clone(cloud),loadedRevision:()=>7,canWrite:()=>true,scan:()=>({contaminated:false}),backup:async snapshot=>{assert.deepEqual(snapshot,cloud);backups++;return true;},apply:(key,value)=>{local[key]=clone(value);applies++;},save:async()=>{for(const key of ["maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2"])cloud[key]=clone(local[key]);saves++;return{saved:true,stateWriteCompleted:true,stateWriteAttempted:true};}});
  const plan=history.preview("maintenance",rows,cloud),result=await api.submit("maintenance",rows,{confirmed:true,reviewedPreview:plan});
  assert.equal(backups,1);assert.equal(result.saved,equal);assert.equal(result.error,equal?"":"Local state changed during backup; review a fresh preview.");assert.equal(saves,equal?1:0);assert.equal(applies,equal?3:0);
  assert.deepEqual(local.tasksAsReq,beforeLocal.tasksAsReq);assert.deepEqual(cloud.tasksAsReq,beforeCloud.tasksAsReq);
  if(!equal){assert.deepEqual(local,beforeLocal);assert.deepEqual(cloud,beforeCloud);}
});
