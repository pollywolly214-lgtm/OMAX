"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const importer=require("../js/cuttingJobImporter")(),core=fs.readFileSync("js/core.js","utf8");
const adapter=core.slice(core.indexOf("function createCuttingJobImportPreviewTrace(){"),core.indexOf("const cuttingJobRepairBackup="));
const fields=["generatedAtISO","weekKey","weekLabel","weekStartISO","weekEndISO"];
const previousWindow={generatedAtISO:"2026-10-02T20:40:59.094Z",weekKey:"2026-09-28",weekLabel:"Sep 27, 2026 - Oct 3, 2026",weekStartISO:"2026-09-28",weekEndISO:"2026-10-04"};
const currentWindow={generatedAtISO:"2026-10-05T14:09:31.745Z",weekKey:"2026-10-05",weekLabel:"Oct 4, 2026 - Oct 10, 2026",weekStartISO:"2026-10-05",weekEndISO:"2026-10-11"};
function fixture(){return{syncMeta:{rev:7},saveMeta:{status:"saved"},syncProcessLog:[],cuttingJobs:[],completedCuttingJobs:[],jobFolders:[{id:"jobs_root",name:"All Jobs",parent:null,order:1}],inventory:[{id:"keep",quantity:4}],maintenanceTasksV2:[{id:"maintenance",cost:10}],weeklyCostReports:Array.from({length:25},(_,i)=>i===0?{
  ...previousWindow,cutItems:[],maintenanceItems:[],totalCutCost:0,totalMaintenanceCost:0,totalCutHours:0,cutByCategory:{},totalCutCostLabel:"$0.00",totalMaintenanceLossLabel:"$0.00",totalCutHoursLabel:"0 hr"
}:{id:"report-"+i,weekKey:"historical-"+i,weekStartISO:"2026-09-21",weekEndISO:"2026-09-27",weekLabel:"Historical "+i,generatedAtISO:previousWindow.generatedAtISO,
  cutItems:[{id:"cut-"+i,jobId:"job-"+i,projectNumber:"1254",categoryId:"blanco",category:"Blanco",dateISO:"2026-09-22",cost:100+i,hours:2,windowMetadata:{...previousWindow}}],
  maintenanceItems:[{id:"maintenance-"+i,taskId:"task-"+i,dateISO:"2026-09-23",cost:8,category:{id:"maintenance",name:"Maintenance"}}],
  cutByCategory:{Blanco:{count:1,cost:100+i,hours:2}},totalCutCost:100+i,totalMaintenanceCost:8,totalCutHours:2,totalCutProfit:90+i,totalCutCostLabel:"$"+(100+i),totalMaintenanceLossLabel:"-$8",totalCutHoursLabel:"2 hr",futureFinancial:{profit:90+i}})};}
const normalized=value=>JSON.stringify(importer.normalizeComparisonState(value));
const row={import_event_id:"cji02e",record_status:"active",job_name:"Window fixture cut",project_number:"1242",category:"Mesquite",material:"Steel",thickness_inches:".25",path_length_ft:"4",path_width_ft:"2",review_status:"reviewed"};
function harness({rollover=true,onCreate,onSave}={}){
  let cloud=fixture();const local=structuredClone(cloud),payloads=[],writes=[];if(rollover)Object.assign(local.weeklyCostReports[0],currentWindow);
  const materials=[{id:"steel",name:"Steel",density:.283,pricePerLb:.8}],window={CuttingJobImporter:importer,jobFolders:local.jobFolders,__loadedCloudRevisionForSaveGuard:7,__lastLoadedCloudState:structuredClone(cloud),getLiveJobMaterialSettings:()=>({materials,wasteFactor:10}),CuttingJobImportDownload:{prepare:(_name,payload)=>{payloads.push(structuredClone(payload));return{trigger:()=>({triggerStarted:true}),dispose(){}};}}};
  const context=vm.createContext({window,FB:{ready:true,user:{uid:"fixture"},docRef:{}},structuredClone,cloneStructured:structuredClone,canWriteCloud:()=>!window.__autosaveDisabled,getCuttingJobImporterState:()=>local,readCurrentCloudStateReadOnly:async()=>structuredClone(cloud),snapshotState:()=>local,compactStateForStorage:value=>value,stableStringify:JSON.stringify,localStorage:{getItem:()=>null},setTimeout,clearTimeout,
    addJobFolder:name=>{const folder={id:"native-category",name,parent:"jobs_root",order:2};local.jobFolders.push(folder);onCreate?.({local,cloud});return folder;},saveCloudNow:async options=>{assert.equal(options.expectedRevision,7);writes.push("save");cloud=structuredClone(local);cloud.syncMeta.rev=8;onSave?.({local,cloud});return{saved:true,stateWriteAttempted:true,stateWriteCompleted:true};},renderRecoveryDiagnosticsPanel:()=>writes.push("suspend")});
  vm.runInContext(adapter+";this.prepare=prepareCuttingJobImportBackup;this.receipts=cuttingJobImportBackupReceipts",context);const api=window.cuttingJobImporter;
  return{local,window,context,payloads,writes,api,get cloud(){return cloud;},prepare:()=>context.prepare(),submit:async()=>{const reviewedPreview=api.preview([row]),prepared=await context.prepare();prepared.validate();const receipt=prepared.download.trigger();context.receipts.set(receipt,prepared);return api.submit([row],{confirmed:true,reviewedPreview,backupReceipt:receipt,expectedRevision:prepared.revision});}};
}
for(const field of fields)test("direct "+field+" difference alone compares equal",()=>{const a=fixture(),b=structuredClone(a);b.weeklyCostReports[0][field]=currentWindow[field];assert.equal(normalized(a),normalized(b));});
test("all five fields change across the supplied 25-report week rollover without content drift",()=>{const a=fixture(),b=structuredClone(a);Object.assign(b.weeklyCostReports[0],currentWindow);assert.equal(a.weeklyCostReports.length,25);assert.equal(normalized(a),normalized(b));});
test("missing versus present window properties compare equal",()=>{const a=fixture(),b=structuredClone(a);for(const field of fields)delete b.weeklyCostReports[0][field];assert.equal(normalized(a),normalized(b));});
test("generated window differences across multiple entries compare equal",()=>{const a=fixture(),b=structuredClone(a);for(const report of b.weeklyCostReports)Object.assign(report,currentWindow);assert.equal(normalized(a),normalized(b));});
test("frozen input, nested source metadata and shared references remain untouched",()=>{const original=fixture();original.inventory.push(original.weeklyCostReports[0]);const before=structuredClone(original),freeze=value=>{if(value&&typeof value==="object"&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};freeze(original);const comparison=importer.normalizeComparisonState(original);for(const field of fields){assert.equal(Object.hasOwn(comparison.weeklyCostReports[0],field),false);assert.equal(comparison.inventory[1][field],previousWindow[field]);assert.equal(comparison.weeklyCostReports[1].cutItems[0].windowMetadata[field],previousWindow[field]);}comparison.weeklyCostReports[1].cutItems[0].cost=999;assert.deepEqual(original,before);});
test("non-array weekly reports and metadata in other collections remain strict",()=>{for(const field of fields){const a={weeklyCostReports:{[field]:previousWindow[field]}},b={weeklyCostReports:{[field]:currentWindow[field]}};assert.notEqual(normalized(a),normalized(b));assert.notEqual(normalized({inventory:[a.weeklyCostReports]}),normalized({inventory:[b.weeklyCostReports]}));}assert.deepEqual(importer.normalizeComparisonState({weeklyCostReports:[null,4,"value",[currentWindow]]}),{weeklyCostReports:[null,4,"value",[currentWindow]]});});
test("production preparation, final review, receipt and post-save verification share window normalization",async()=>{const h=harness(),beforeLocal=structuredClone(h.local.weeklyCostReports),beforeCloud=structuredClone(h.cloud.weeklyCostReports),result=await h.submit();assert.equal(result.saveCompleted,true);assert.equal(result.protectedStateMatched,true);assert.equal(result.verificationCompleted,true);assert.deepEqual(h.writes,["save"]);assert.deepEqual(h.payloads[0].weeklyCostReports,beforeCloud);assert.deepEqual(h.local.weeklyCostReports,beforeLocal);assert.deepEqual(h.cloud.weeklyCostReports,beforeLocal);assert.equal(h.window.__recoveryInspectMode,undefined);});
test("prepared backup validation accepts subsequent generated window refresh",async()=>{const h=harness({rollover:false}),prepared=await h.prepare();Object.assign(h.local.weeklyCostReports[0],currentWindow);prepared.validate();assert.deepEqual(h.payloads[0].weeklyCostReports[0],fixture().weeklyCostReports[0]);});
test("receipt accepts regenerated cloud window after preparation, without modifying backup",async()=>{const h=harness({rollover:false}),prepared=await h.prepare(),originalPayload=structuredClone(h.payloads[0]);Object.assign(h.cloud.weeklyCostReports[0],currentWindow);const receipt=prepared.download.trigger();h.context.receipts.set(receipt,prepared);const result=await h.api.submit([row],{confirmed:true,reviewedPreview:h.api.preview([row]),backupReceipt:receipt,expectedRevision:7});assert.equal(result.saveCompleted,true);assert.deepEqual(h.payloads[0],originalPayload);});
test("protected-state staging permits only the explicit direct generated fields",async()=>{const h=harness({rollover:false,onCreate:({local})=>Object.assign(local.weeklyCostReports[0],currentWindow)}),r=await h.submit();assert.equal(r.saveCompleted,true);assert.equal(r.protectedStateMatched,true);assert.deepEqual(h.cloud.weeklyCostReports[0],{...fixture().weeklyCostReports[0],...currentWindow});});
test("post-save regenerated windows do not cause a false suspension",async()=>{const h=harness({onSave:({cloud})=>Object.assign(cloud.weeklyCostReports[0],{...currentWindow,weekKey:"2026-10-12",weekStartISO:"2026-10-12",weekEndISO:"2026-10-18",weekLabel:"Next generated week"})}),r=await h.submit();assert.equal(r.saveCompleted,true);assert.equal(r.verificationCompleted,true);assert.deepEqual(h.writes,["save"]);});
const drifts={
  "totalCutCost":s=>s.weeklyCostReports[0].totalCutCost++,
  "totalMaintenanceCost":s=>s.weeklyCostReports[0].totalMaintenanceCost++,
  "totalCutHours":s=>s.weeklyCostReports[0].totalCutHours++,
  "cutItems":s=>s.weeklyCostReports[0].cutItems.push({id:"new-cut",cost:10}),
  "maintenanceItems":s=>s.weeklyCostReports[0].maintenanceItems.push({id:"new-maintenance",cost:10}),
  "cutByCategory":s=>s.weeklyCostReports[0].cutByCategory.Blanco={count:1,cost:10,hours:2},
  "nested cost":s=>s.weeklyCostReports[1].cutItems[0].cost++,
  "nested job ID":s=>s.weeklyCostReports[1].cutItems[0].jobId="changed",
  "nested category ID":s=>s.weeklyCostReports[1].cutItems[0].categoryId="changed",
  "nested category name":s=>s.weeklyCostReports[1].cutItems[0].category="changed",
  "nested project number":s=>s.weeklyCostReports[1].cutItems[0].projectNumber="0000",
  "nested hours":s=>s.weeklyCostReports[1].cutItems[0].hours++,
  "nested source date":s=>s.weeklyCostReports[1].cutItems[0].dateISO="2026-10-05",
  "profit/loss":s=>s.weeklyCostReports[1].totalCutProfit++,
  "dollar label":s=>s.weeklyCostReports[0].totalCutCostLabel="$99",
  "loss label":s=>s.weeklyCostReports[0].totalMaintenanceLossLabel="-$99",
  "hour label":s=>s.weeklyCostReports[0].totalCutHoursLabel="99 hr",
  "unknown field":s=>s.weeklyCostReports[0].newBusinessField="changed",
  "future financial field":s=>s.weeklyCostReports[1].futureFinancial.profit++,
  "report ID":s=>s.weeklyCostReports[1].id="changed",
  "added report":s=>s.weeklyCostReports.push({cutItems:[],totalCutCost:0}),
  "removed report":s=>s.weeklyCostReports.pop(),
  "report order":s=>[s.weeklyCostReports[1],s.weeklyCostReports[2]]=[s.weeklyCostReports[2],s.weeklyCostReports[1]],
  "cuttingJobs":s=>s.cuttingJobs.push({id:"changed",projectNumber:"0000",cat:"jobs_root"}),
  "completedCuttingJobs":s=>s.completedCuttingJobs.push({id:"changed",import_event_id:"other"}),
  "jobFolders":s=>s.jobFolders[0].name="Changed",
  "protected inventory":s=>s.inventory[0].quantity++,
  "protected maintenance":s=>s.maintenanceTasksV2[0].cost++
};
for(const field of fields)drifts["nested "+field]=s=>s.weeklyCostReports[1].cutItems[0].windowMetadata[field]=currentWindow[field];
for(const [name,mutate]of Object.entries(drifts))test(name+" remains strict before and after save while windows differ",async()=>{
  const before=harness();mutate(before.local);assert.notEqual(normalized(before.local),normalized(before.cloud));await assert.rejects(before.prepare(),/Authoritative baseline changed/);const revalidated=await before.api.submit([row],{confirmed:true,reviewedPreview:before.api.preview([row])});assert.equal(revalidated.saveAttempted,false);assert.match(revalidated.saveError,/baseline revalidation failed/);assert.deepEqual(before.writes,[]);
  const after=harness({onSave:({cloud})=>mutate(cloud)}),saved=await after.submit();assert.equal(saved.saveCompleted,false);assert.equal(saved.saveIndeterminate,true);assert.equal(saved.verificationCompleted,false);assert.equal(saved.rollbackAttempted,false);assert.deepEqual(after.writes,["save","suspend"]);
});
test("meaningful financial change during bounded stabilization still reports its first path",async()=>{const local=fixture(),cloud=fixture();Object.assign(local.weeklyCostReports[0],currentWindow);let cycles=0;await assert.rejects(importer.stabilizePreviewBaseline({snapshot:()=>structuredClone(local),readCloud:async()=>structuredClone(cloud),loadedRevision:()=>7,settle:async()=>{if(++cycles===1)local.weeklyCostReports[0].totalCutCost++;}}),error=>{assert.equal(error.previewPreparation.blockingMismatchPath,"$.weeklyCostReports[0].totalCutCost");assert.equal(error.previewPreparation.comparisonAttempts,2);return true;});});
test("cloud revision mismatch remains exact with identical content and regenerated windows",async()=>{const h=harness();h.cloud.syncMeta.rev=8;await assert.rejects(h.prepare(),/cloud revision changed/);assert.equal(h.payloads.length,0);assert.deepEqual(h.writes,[]);});
