"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const historical=require("../js/historicalImport"),cutting=require("../js/cuttingJobImporter")(globalThis),firewall=require("../js/cuttingFileContentFirewall");
const clone=structuredClone;
const definite={saved:false,stateWriteAttempted:true,stateWriteCompleted:false,definiteFailure:true,error:"permission denied"};
function deferredSave(){let begin,finish,calls=0;const started=new Promise(resolve=>{begin=resolve;}),pending=new Promise(resolve=>{finish=resolve;});return{started,finish,get calls(){return calls;},async save(){calls++;begin();return pending;}};}
const purchase={import_event_id:"ph04-purchase",date:"2025-01-03",purchased:"Fixture filter",qty:2,cost:12};
const pump={import_event_id:"ph04-pump",date:"2026-02-03",rpm:3400,timeISO:"14:20"};
function historicalHarness(kind,source=kind==="purchase"?purchase:pump){
  const local={syncMeta:{rev:1},inventory:[{id:"part",qtyNew:5}],receiptTrackerWeeks:[{...historical.weekFor(purchase.date),rows:[{date:"2025-01-02",purchased:"Original",qty:1,cost:3}]}],pumpEff:{baselineRPM:3500,baselineDateISO:"2026-01-01",entries:[{dateISO:"2026-01-01",rpm:3500,timeISO:"12:00"}],notes:[{text:"keep"}]}};
  const cloud=clone(local),gate=deferredSave();let suspended=false;
  const api=historical.createApi({state:()=>clone(local),canWrite:()=>true,loadedRevision:()=>1,scan:firewall.scanCuttingFileContent,readCloud:async()=>clone(cloud),backup:async()=>true,apply:(key,value)=>{local[key]=value;},save:gate.save,suspend:()=>{suspended=true;}}),row=clone(source);
  return{local,gate,get suspended(){return suspended;},submit:()=>api.submit(kind,[row],{confirmed:true,reviewedPreview:api.preview(kind,[row])})};
}
const maintenanceSource=fs.readFileSync("js/renderers.js","utf8"),maintenanceSection=maintenanceSource.slice(maintenanceSource.indexOf("function normalizeMaintenanceImportTaskName"),maintenanceSource.indexOf("function cleanupMi02cTinyMaintenanceImportRows"));
function maintenanceHarness(){
  const window={syncMeta:{rev:1},__loadedCloudRevisionForSaveGuard:1,tasksInterval:[{id:"filter",name:"RO Micron Filter",manualHistory:[{dateISO:"2024-01-01",note:"keep"}],completedDates:[]}],tasksAsReq:[{id:"other",name:"Other",manualHistory:[]}],maintenanceOccurrencesV2:[]},gate=deferredSave();
  const state=()=>clone(Object.fromEntries(Object.entries(window).filter(([key])=>!key.startsWith("__")))),cloud=state(),context=vm.createContext({window,console,structuredClone,saveCloudNow:gate.save,exportJsonDownload:()=>true,getCurrentAppStateForDiagnostics:state,readCurrentCloudStateReadOnly:async()=>clone(cloud)});
  vm.runInContext(maintenanceSection+";this.api={buildMaintenanceHistoryImportPreview,applyMaintenanceHistoryImportRows}",context);
  const rows=[{import_event_id:"ph04-maintenance",scheduled_maintenance_date:"2025-02-03",exact_website_task:"RO Micron Filter"}];
  return{local:window,gate,get suspended(){return window.__autosaveDisabled===true&&window.__recoveryInspectMode===true;},submit:()=>context.api.applyMaintenanceHistoryImportRows(context.api.buildMaintenanceHistoryImportPreview(rows),{confirmed:true})};
}
const cutRow={import_event_id:"ph04-cut-active",record_status:"active",job_name:"Fixture cut",project_number:"0000",estimate_hours:"2",priority:"1",start_date:"2026-01-01",due_date:"2026-01-02",material:"Steel",thickness_inches:"0.25",path_length_ft:"4",path_width_ft:"2",review_status:"reviewed"};
function cuttingHarness(){
  const local={cuttingJobs:[{id:"old-active",name:"keep",cutNumber:"C010",cat:"existing",manualLogs:[]}],completedCuttingJobs:[{id:"old-completed",name:"keep",cutNumber:"C020",completedAtISO:"2025-01-01",manualLogs:[]}],deletedItems:[]},categories=[{id:"existing",name:"ATM 1251"}],materials=[{id:"steel",name:"Steel",density:.283,pricePerLb:.8}],gate=deferredSave();let suspended=false;
  const api=cutting.createApi({state:()=>local,categories:()=>categories,materials:()=>materials,materialSettings:()=>({materials,wasteFactor:10}),authenticatedBaseline:()=>true,revalidateBaseline:async()=>true,backup:async()=>true,createCategory:name=>{const made={id:"created",name,parent:"jobs_root",order:2};categories.push(made);return made;},removeCategories:ids=>{for(let i=categories.length-1;i>=0;i--)if(ids.includes(categories[i].id))categories.splice(i,1);},saveCloudNow:gate.save,suspend:()=>{suspended=true;}});
  const rows=[cutRow,{...cutRow,import_event_id:"ph04-cut-completed",record_status:"completed",completed_date:"2026-01-03",actual_cut_minutes:"30"}];
  return{local,categories,materials,gate,get suspended(){return suspended;},submit:()=>api.submit(rows,{confirmed:true,reviewedPreview:api.preview(rows)})};
}
test("purchase definite failure removes only imported rows and preserves concurrent row/week edits",{timeout:3000},async()=>{
  const h=historicalHarness("purchase"),pending=h.submit();await h.gate.started;
  h.local.receiptTrackerWeeks[0].rows[0].cost=99;
  h.local.receiptTrackerWeeks[0].rows.push({date:"2025-01-04",purchased:"Concurrent",qty:1,cost:7});
  h.local.receiptTrackerWeeks[0].note="Concurrent week note";
  h.local.receiptTrackerWeeks.push({...historical.weekFor("2025-03-03"),rows:[{purchased:"Another new week"}]});
  h.local.inventory[0].qtyNew=11;
  const expected=clone(h.local);expected.receiptTrackerWeeks[0].rows=expected.receiptTrackerWeeks[0].rows.filter(row=>row.import_event_id!==purchase.import_event_id);
  h.gate.finish(definite);const result=await pending;
  assert.equal(result.rollbackCompleted,true);assert.equal(h.suspended,false);assert.deepEqual(h.local,expected);assert.equal(h.gate.calls,1);
});
test("pump definite failure preserves concurrent entries, edits, notes and baseline",{timeout:3000},async()=>{
  const h=historicalHarness("pump"),pending=h.submit();await h.gate.started;
  h.local.pumpEff.entries[0].rpm=3600;h.local.pumpEff.entries.push({dateISO:"2026-03-04",rpm:3300,timeISO:"09:00"});
  h.local.pumpEff.notes[0].text="Edited during save";h.local.pumpEff.notes.push({text:"Concurrent note"});h.local.pumpEff.baselineRPM=3600;h.local.pumpEff.baselineDateISO="2026-01-02";
  const expected=clone(h.local);expected.pumpEff.entries=expected.pumpEff.entries.filter(entry=>entry.import_event_id!==pump.import_event_id);
  h.gate.finish(definite);const result=await pending;
  assert.equal(result.rollbackCompleted,true);assert.equal(h.suspended,false);assert.deepEqual(h.local,expected);
});
test("purchase rollback preserves concurrent edits/additions in an import-created week",{timeout:3000},async()=>{
  const h=historicalHarness("purchase",{...purchase,date:"2025-04-03"}),pending=h.submit();await h.gate.started;
  const week=h.local.receiptTrackerWeeks.find(item=>item.rows.some(row=>row.import_event_id));
  week.note="Concurrent note on new week";week.rows.push({purchased:"Concurrent row",qty:1,cost:5});
  const expected=clone(h.local);expected.receiptTrackerWeeks.find(item=>item.key===week.key).rows=week.rows.filter(row=>!row.import_event_id).map(row=>clone(row));
  h.gate.finish(definite);const result=await pending;assert.equal(result.rollbackCompleted,true);assert.deepEqual(h.local,expected);
});
test("maintenance definite failure preserves replacement task, edited history and concurrent additions",{timeout:3000},async()=>{
  const h=maintenanceHarness(),pending=h.submit();await h.gate.started;
  h.local.tasksInterval[0]=clone(h.local.tasksInterval[0]);h.local.tasksInterval[0].name="Edited name";
  h.local.tasksInterval[0].manualHistory[0].note="Edited during save";h.local.tasksInterval[0].manualHistory.push({dateISO:"2026-01-01",note:"Concurrent completion"});
  h.local.tasksAsReq[0].manualHistory.push({dateISO:"2026-01-02",note:"Other task completion"});h.local.tasksInterval.push({id:"new-task",name:"New task",manualHistory:[]});
  const expected=clone([h.local.tasksInterval,h.local.tasksAsReq]);expected[0][0].manualHistory=expected[0][0].manualHistory.filter(entry=>entry.import_event_id!=="ph04-maintenance");
  h.gate.finish(definite);const result=await pending;
  assert.equal(result.rolledBack,true);assert.equal(h.suspended,false);assert.deepEqual([h.local.tasksInterval,h.local.tasksAsReq],expected);
});
test("cutting definite failure selectively removes jobs/category and preserves edits, additions and materials",{timeout:3000},async()=>{
  const h=cuttingHarness(),pending=h.submit();await h.gate.started;
  h.local.cuttingJobs[0].name="Concurrent edit";h.local.cuttingJobs[0].cutNumber="C777";h.local.cuttingJobs[0].manualLogs.push({completedHours:2});
  h.local.completedCuttingJobs[0].name="Completed edit";h.local.completedCuttingJobs[0].manualLogs.push({completedHours:3});
  h.local.cuttingJobs.push({id:"concurrent-active",name:"New active",cutNumber:"C888",cat:"existing"});h.local.completedCuttingJobs.push({id:"concurrent-completed",name:"New completed",cutNumber:"C999"});
  h.categories[0].name="Edited category";h.categories.push({id:"concurrent-category",name:"New category"});h.materials[0].pricePerLb=9;
  const expected=clone(h.local);expected.cuttingJobs=expected.cuttingJobs.filter(job=>!job.import_event_id);expected.completedCuttingJobs=expected.completedCuttingJobs.filter(job=>!job.import_event_id);expected.completedCuttingJobs[0].cutNumber="C020";
  const expectedCategories=clone(h.categories.filter(category=>category.id!=="created")),expectedMaterials=clone(h.materials);
  h.gate.finish(definite);const result=await pending;
  assert.equal(result.rollbackVerified,true);assert.equal(h.suspended,false);assert.deepEqual(h.local,expected);assert.deepEqual(h.categories,expectedCategories);assert.deepEqual(h.materials,expectedMaterials);
});
test("cutting keeps changed or referenced import-created categories and reports recovery review",{timeout:3000},async()=>{
  for(const mode of ["edit","active","completed","deleted","child"]){
    const h=cuttingHarness(),pending=h.submit();await h.gate.started;
    if(mode==="edit")h.categories[1].name="Edited during save";
    if(mode==="active")h.local.cuttingJobs.push({id:"new",cat:"created"});
    if(mode==="completed")h.local.completedCuttingJobs.push({id:"new",cat:"created"});
    if(mode==="deleted")h.local.deletedItems.push({value:{id:"new",cat:"created"}});
    if(mode==="child")h.categories.push({id:"child",name:"New child",parent:"created"});
    const categoriesBefore=clone(h.categories);h.gate.finish(definite);const result=await pending;
    assert.equal(result.rollbackReviewRequired,true,mode);assert.equal(h.suspended,true,mode);assert.equal(result.rollbackCompleted,false,mode);assert.match(result.saveWarnings.join(" "),/Category created retained/);
    assert.deepEqual(h.categories,categoriesBefore,mode);assert.ok([...h.local.cuttingJobs,...h.local.completedCuttingJobs].every(job=>!job.import_event_id),mode);
  }
});
for(const kind of ["purchase","pump","maintenance","cutting"]){
  const harness=()=>kind==="maintenance"?maintenanceHarness():kind==="cutting"?cuttingHarness():historicalHarness(kind);
  const introduced=h=>kind==="purchase"?h.local.receiptTrackerWeeks[0].rows.find(row=>row.import_event_id):kind==="pump"?h.local.pumpEff.entries.find(row=>row.import_event_id):kind==="maintenance"?h.local.tasksInterval[0].manualHistory.find(row=>row.import_event_id):h.local.cuttingJobs.find(job=>job.import_event_id);
  test(`${kind}: edited imported record suspends rollback and preserves all local evidence`,{timeout:3000},async()=>{
    const h=harness(),pending=h.submit();await h.gate.started;introduced(h).note="Legitimate edit to staged record";
    const expected=clone(h.local),expectedCategories=kind==="cutting"?clone(h.categories):null;h.gate.finish(definite);const result=await pending;
    assert.equal(result.rollbackReviewRequired,true);assert.equal(h.suspended,true);assert.equal(result.rollbackCompleted||result.rolledBack||false,false);
    // Maintenance adds recovery flags; compare business state without those flags.
    const business=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!key.startsWith("__")));
    assert.deepEqual(clone(business(h.local)),business(expected));if(expectedCategories)assert.deepEqual(h.categories,expectedCategories);
  });
  test(`${kind}: indeterminate failure never rolls back or retries`,{timeout:3000},async()=>{
    const h=harness(),pending=h.submit();await h.gate.started;introduced(h).note="Concurrent edit";
    const expected=clone(h.local);h.gate.finish({saved:false,stateWriteAttempted:true,stateWriteCompleted:false,indeterminate:true,error:"unknown outcome"});const result=await pending;
    assert.equal(result.indeterminate||result.saveIndeterminate,true);assert.equal(h.suspended,true);assert.equal(h.gate.calls,1);
    const business=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!key.startsWith("__")));
    assert.deepEqual(clone(business(h.local)),business(expected));assert.equal(result.rollbackCompleted||result.rolledBack||false,false);
  });
}
test("duplicate import identities make purchase rollback uncertain without deleting either record",{timeout:3000},async()=>{
  const h=historicalHarness("purchase"),pending=h.submit();await h.gate.started;
  h.local.receiptTrackerWeeks[0].rows.push(clone(h.local.receiptTrackerWeeks[0].rows.find(row=>row.import_event_id)));
  const expected=clone(h.local);h.gate.finish(definite);const result=await pending;
  assert.equal(result.rollbackReviewRequired,true);assert.equal(h.suspended,true);assert.deepEqual(h.local,expected);
});
