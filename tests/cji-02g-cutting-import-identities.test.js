"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const repair=require("../js/globalIdentityRepair"),importer=require("../js/cuttingJobImporter")();
const {baseline,rows,postImport,material}=require("./fixtures/cutting-import-identities");
const single=(collection="completedCuttingJobs",extra={})=>({syncMeta:{rev:1},cuttingJobs:[],completedCuttingJobs:[],[collection]:[{id:"cji_event",import_event_id:"event",...extra}]});
const eventCount=plan=>plan.auditedCollections.find(row=>row.collection==="cuttingImportEvents")?.count||0;
for(const collection of ["cuttingJobs","completedCuttingJobs"])for(const [name,extra,count]of [
  ["manual log",{manualLogs:[{completedHours:1,import_event_id:"event"}]},1],
  ["workbook provenance",{importProvenance:{import_event_id:"event",source_text:"preserve"}},1],
  ["both copies",{manualLogs:[{import_event_id:"event"}],importProvenance:{import_event_id:"event"}},2]
])test(`${collection}: matching ${name} is provenance for one canonical identity`,()=>{
  const state=single(collection,extra),before=structuredClone(state),check=repair.integrity(state);
  assert.equal(check.valid,true,check.blockers.join(" "));assert.equal(eventCount(check.plan),1);
  assert.equal(check.plan.references.length,count);assert.ok(check.plan.references.every(ref=>ref.target===`$.${collection}[0]`));
  assert.deepEqual(check.plan.changes,[]);assert.deepEqual(check.plan.unknownReferences,[]);assert.deepEqual(state,before);
});
test("exact 1 active + 155 completed / 15 folders contains 88 canonical 616-CUT identities",()=>{
  const state=postImport(),before=structuredClone(state),check=repair.integrity(state);
  assert.equal(state.cuttingJobs.length,1);assert.equal(state.completedCuttingJobs.length,155);assert.equal(state.jobFolders.length,15);
  const imported=state.completedCuttingJobs.filter(job=>job.import_event_id?.startsWith("616-CUT-"));
  assert.equal(imported.length,88);assert.equal(new Set(imported.map(job=>job.import_event_id)).size,88);
  assert.equal(imported[0].import_event_id,"616-CUT-P01-L002");assert.equal(check.valid,true,check.blockers.join(" "));
  assert.equal(eventCount(check.plan),88);assert.equal(check.plan.references.filter(ref=>ref.path.endsWith(".import_event_id")).length,176);
  assert.deepEqual(check.plan.duplicateGroups,[]);assert.deepEqual(check.plan.unknownReferences,[]);assert.deepEqual(check.plan.changes,[]);assert.deepEqual(state,before);
  assert.equal(state.jobFolders.find(f=>f.id==="job_project_0000").name,"0000 Company Improvements");
  assert.equal(state.jobFolders.find(f=>f.id==="job_project_1111").name,"1111 Company Improvements");
});
for(const second of ["cuttingJobs","completedCuttingJobs"])test(`true cross-job canonical duplicate in ${second} still blocks`,()=>{
  const state=single("cuttingJobs",{manualLogs:[{import_event_id:"event"}],importProvenance:{import_event_id:"event"}});
  state[second].push({id:"other-job",import_event_id:"event",manualLogs:[{import_event_id:"event"}],importProvenance:{import_event_id:"event"}});
  const check=repair.integrity(state);assert.equal(check.valid,false);assert.equal(eventCount(check.plan),2);
  assert.equal(check.plan.duplicateGroups.find(group=>group.collection==="cuttingImportEvents").records.length,2);
  assert.match(check.blockers.join(" "),/Duplicate ID event in cuttingImportEvents/);assert.equal(check.plan.changes.length,0);
});
test("duplicate deterministic job IDs with different canonical events still block",()=>{
  const state=single();state.cuttingJobs.push({id:"cji_event",import_event_id:"other-event"});
  const check=repair.integrity(state);assert.equal(check.valid,false);assert.ok(check.plan.duplicateGroups.some(group=>group.collection==="jobs"));
});
test("two completed job owners with the same canonical event still block",()=>{
  const state=single();state.completedCuttingJobs.push({id:"other-completed-job",import_event_id:"event"});
  const check=repair.integrity(state);assert.equal(check.valid,false);assert.equal(eventCount(check.plan),2);
  assert.equal(check.plan.duplicateGroups.find(group=>group.collection==="cuttingImportEvents").records.length,2);
});
test("every manual log copy is checked without multiplying canonical identities",()=>{
  const state=single("completedCuttingJobs",{manualLogs:[{import_event_id:"event"},{import_event_id:"event"}]});
  const check=repair.integrity(state);assert.equal(check.valid,true);assert.equal(eventCount(check.plan),1);assert.equal(check.plan.references.length,2);
  state.completedCuttingJobs[0].manualLogs[1].import_event_id="wrong-event";
  assert.match(repair.integrity(state).blockers.join(" "),/manualLogs\[1\].import_event_id.*contradicts/);
});
for(const collection of ["cuttingJobs","completedCuttingJobs"])for(const field of ["manualLogs","importProvenance"])for(const value of ["wrong-event","",null,12])test(`${collection}: contradictory ${field} value ${JSON.stringify(value)} blocks`,()=>{
  const extra=field==="manualLogs"?{manualLogs:[{import_event_id:value}]}:{importProvenance:{import_event_id:value}};
  const check=repair.integrity(single(collection,extra));assert.equal(check.valid,false);assert.match(check.blockers.join(" "),/Cutting import provenance.*contradicts owning-job/);
  assert.equal(eventCount(check.plan),1);assert.equal(check.plan.changes.length,0);
});
test("log pointing to another real imported job still contradicts its owner",()=>{
  const state=single("completedCuttingJobs",{manualLogs:[{import_event_id:"other-event"}]});
  state.completedCuttingJobs.push({id:"other",import_event_id:"other-event"});
  const check=repair.integrity(state);assert.equal(check.valid,false);assert.match(check.blockers.join(" "),/contradicts owning-job/);assert.deepEqual(check.plan.duplicateGroups,[]);
});
for(const canonical of [undefined,"",null,12])test(`nested-only evidence never synthesizes canonical identity (${canonical})`,()=>{
  const state=single("completedCuttingJobs",{manualLogs:[{import_event_id:"event"}],importProvenance:{import_event_id:"event"}});
  if(canonical===undefined)delete state.completedCuttingJobs[0].import_event_id;else state.completedCuttingJobs[0].import_event_id=canonical;
  const check=repair.integrity(state);assert.equal(check.valid,false);assert.match(check.blockers.join(" "),/no unique canonical owning-job/);
  assert.equal(eventCount(check.plan),canonical===undefined?0:1);assert.equal(check.plan.changes.length,0);
});
test("all nested import_event_id objects/arrays are owning-job references, while their own IDs remain strict",()=>{
  const state=single("completedCuttingJobs",{evidence:[{id:"evidence",import_event_id:"event",deep:{import_event_id:"event"}}]});
  assert.equal(repair.integrity(state).valid,true);assert.equal(eventCount(repair.preview(state)),1);
  state.completedCuttingJobs[0].evidence.push({id:"evidence",import_event_id:"event"});assert.equal(repair.integrity(state).valid,false);
});
test("absent nested IDs and old jobs without import identities remain valid",()=>{
  const state=single("cuttingJobs",{manualLogs:[{completedHours:1}],importProvenance:{source_text:"historical"}});delete state.cuttingJobs[0].import_event_id;
  assert.equal(repair.integrity(state).valid,true);assert.equal(eventCount(repair.preview(state)),0);
});
for(const [name,change,pattern]of [
  ["unrelated durable duplicate",s=>{s.orderRequests=[{id:"request"},{id:"request"}];},/Duplicate ID request/],
  ["purchase import duplicate",s=>{s.receiptTrackerWeeks=[{key:"week",rows:[{import_event_id:"purchase"},{import_event_id:"purchase"}]}];},/purchaseImportEvents/],
  ["inventory corruption",s=>{s.inventory[1].id=s.inventory[0].id;},/inventory|one-to-one/],
  ["maintenance identity collision",s=>{s.maintenanceTasksV2[1].id=s.maintenanceTasksV2[0].id;delete s.maintenanceTasksV2[1].legacyTaskId;},/Ambiguous|unique legacy/],
  ["unknown duplicate consumer",s=>{s.cuttingJobs[0].import_event_id=s.completedCuttingJobs[67].import_event_id;s.unknownEvidence.copy=s.cuttingJobs[0].import_event_id;},/Unknown duplicate-ID reference/]
])test(`${name} remains blocked alongside valid cutting provenance`,()=>{
  const state=postImport();change(state);const check=repair.integrity(state);assert.equal(check.valid,false);assert.match(check.blockers.join(" "),pattern);
});
test("full 88-row successful import verifies exact saved jobs/folders and passes identity integrity",async()=>{
  const state=baseline(),before=structuredClone(state),materials=[material];let cloud=structuredClone(state),saves=0,backups=0,suspensions=0;
  const api=importer.createApi({state:()=>state,categories:()=>state.jobFolders,materials:()=>materials,materialSettings:()=>({materials,wasteFactor:10}),authenticatedBaseline:()=>true,revalidateBaseline:async()=>true,backup:async()=>{backups++;return true;},
    setCategories:folders=>{state.jobFolders=folders;},
    saveCloudNow:async()=>{saves++;cloud=structuredClone(state);cloud.syncMeta.rev++;return{saved:true,stateWriteAttempted:true,stateWriteCompleted:true};},
    verifyCloud:async({expectedState,expectedCategories})=>{assert.deepEqual(cloud.cuttingJobs,expectedState.cuttingJobs);assert.deepEqual(cloud.completedCuttingJobs,expectedState.completedCuttingJobs);assert.deepEqual(cloud.jobFolders,expectedCategories);return repair.integrity(cloud).valid;},suspend:()=>suspensions++});
  const source=rows(),result=await api.submit(source,{confirmed:true,reviewedPreview:api.preview(source)});
  assert.equal(result.readyRows,88);assert.equal(result.completedJobsAdded,88);assert.equal(result.completedTimeRecordsAdded,88);
  assert.equal(result.stateWriteCompleted,true);assert.equal(result.saveCompleted,true,result.saveError);assert.equal(result.verificationCompleted,true);assert.equal(result.saveIndeterminate,false);
  assert.equal(saves,1);assert.equal(backups,1);assert.equal(suspensions,0);assert.equal(repair.integrity(cloud).valid,true);
  assert.equal(eventCount(repair.preview(cloud)),88);assert.equal(cloud.completedCuttingJobs.length,155);assert.equal(cloud.jobFolders.length,15);
  assert.deepEqual(cloud.completedCuttingJobs.slice(0,67).map(j=>({...j,cutNumber:undefined})),before.completedCuttingJobs.map(j=>({...j,cutNumber:undefined})));
  assert.deepEqual(cloud.jobFolders.find(f=>f.id==="job_project_1111"),before.jobFolders.find(f=>f.id==="job_project_1111"));
  assert.ok(api.preview(source).every(item=>item.status==="duplicate"));
});
