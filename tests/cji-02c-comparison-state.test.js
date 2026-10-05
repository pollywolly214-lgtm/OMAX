"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const importer=require("../js/cuttingJobImporter")();
const core=fs.readFileSync("js/core.js","utf8");
const adapter=core.slice(core.indexOf("function createCuttingJobImportPreviewTrace(){"),core.indexOf("const cuttingJobRepairBackup="));
const timestampA="2026-10-02T19:52:35.090Z",timestampB="2026-10-02T20:20:07.475Z";
const fixture=()=>({syncMeta:{rev:7},saveMeta:{status:"saved"},syncProcessLog:[],weeklyCostReports:[
  {id:"week-1",weekStartISO:"2026-09-28",weekEndISO:"2026-10-04",totalCutCost:123.45,totalMaintenanceCost:12,totalCutHours:4,cutByCategory:{Blanco:{count:1,cost:123.45,hours:4}},cutItems:[{id:"item",cost:123.45,generatedAtISO:"nested-business-evidence"}],generatedAtISO:timestampA},
  {id:"week-2",weekStartISO:"2026-09-21",totalCutCost:80,generatedAtISO:timestampA}
],cuttingJobs:[],completedCuttingJobs:[],jobFolders:[{id:"jobs_root",name:"All Jobs",parent:null,order:1}],inventory:[{id:"keep",quantity:4}]});
const row={import_event_id:"cji02c",record_status:"active",job_name:"Fixture cut",project_number:"1242",category:"Mesquite",material:"Steel",thickness_inches:".25",path_length_ft:"4",path_width_ft:"2",review_status:"reviewed"};
function harness({timestampDrift=false,onCreate,onSave}={}){
  let cloud=fixture();const local=structuredClone(cloud),downloads=[],writes=[];
  if(timestampDrift)local.weeklyCostReports.forEach(report=>report.generatedAtISO=timestampB);
  const materials=[{id:"steel",name:"Steel",density:.283,pricePerLb:.8}];
  const window={CuttingJobImporter:importer,jobFolders:local.jobFolders,__loadedCloudRevisionForSaveGuard:7,__lastLoadedCloudState:structuredClone(cloud),getLiveJobMaterialSettings:()=>({materials,wasteFactor:10}),CuttingJobImportDownload:{prepare:(_name,data)=>{downloads.push(structuredClone(data));return{trigger:()=>({triggerStarted:true}),dispose(){}};}}};
  const context=vm.createContext({window,FB:{ready:true,user:{uid:"fixture"},docRef:{}},structuredClone,cloneStructured:structuredClone,canWriteCloud:()=>!window.__autosaveDisabled,getCuttingJobImporterState:()=>local,
    readCurrentCloudStateReadOnly:async()=>structuredClone(cloud),snapshotState:()=>local,compactStateForStorage:value=>value,stableStringify:JSON.stringify,localStorage:{getItem:()=>null},setTimeout,clearTimeout,
    addJobFolder:name=>{const folder={id:"native-category",name,parent:"jobs_root",order:2};local.jobFolders.push(folder);onCreate?.({local,cloud});return folder;},
    saveCloudNow:async options=>{assert.equal(options.expectedRevision,7);writes.push("save");cloud=structuredClone(local);cloud.syncMeta.rev=8;onSave?.({local,cloud});return{saved:true,stateWriteAttempted:true,stateWriteCompleted:true};},renderRecoveryDiagnosticsPanel:()=>writes.push("suspend")});
  // Exercise the actual production preparation, receipt, baseline and verifier
  // adapters, not replicas of their equality expressions.
  vm.runInContext(adapter+";this.prepare=prepareCuttingJobImportBackup;this.receipts=cuttingJobImportBackupReceipts",context);
  const api=window.cuttingJobImporter;
  return{local,window,context,downloads,writes,api,get cloud(){return cloud;},prepare:()=>context.prepare(),submit:async()=>{
    const reviewedPreview=api.preview([row]),prepared=await context.prepare();prepared.validate();const receipt=prepared.download.trigger();context.receipts.set(receipt,prepared);
    return api.submit([row],{confirmed:true,reviewedPreview,backupReceipt:receipt,expectedRevision:prepared.revision});
  }};
}
const normalized=value=>JSON.stringify(importer.normalizeComparisonState(value));
test("shared report references do not normalize timestamps in other collections",()=>{const report={id:"shared",generatedAtISO:timestampA},state={weeklyCostReports:[report],inventory:[report]},comparison=importer.normalizeComparisonState(state);assert.equal(Object.hasOwn(comparison.weeklyCostReports[0],"generatedAtISO"),false);assert.equal(comparison.inventory[0].generatedAtISO,timestampA);assert.equal(report.generatedAtISO,timestampA);});
test("only generated report timestamps differ: actual preview preparation and final validation pass",async()=>{const h=harness({timestampDrift:true}),before=structuredClone(h.local),cloudBefore=structuredClone(h.cloud),prepared=await h.prepare();prepared.validate();assert.equal(prepared.revision,7);assert.deepEqual(h.local,before);assert.deepEqual(h.cloud,cloudBefore);assert.deepEqual(h.downloads[0].weeklyCostReports,cloudBefore.weeklyCostReports);});
test("different timestamps across multiple reports compare equal",()=>{const a=fixture(),b=structuredClone(a);b.weeklyCostReports[0].generatedAtISO=timestampB;b.weeklyCostReports[1].generatedAtISO="2026-10-05T12:00:00Z";assert.equal(normalized(a),normalized(b));});
test("missing timestamp versus present compares equal",async()=>{const h=harness();delete h.local.weeklyCostReports[0].generatedAtISO;delete h.local.weeklyCostReports[1].generatedAtISO;(await h.prepare()).validate();assert.equal(normalized(h.local),normalized(h.cloud));});
test("normalizer clones frozen inputs and preserves all actual data",()=>{const state=fixture(),before=structuredClone(state),freeze=value=>{if(value&&typeof value==="object"){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};freeze(state);const comparison=importer.normalizeComparisonState(state);assert.equal(Object.hasOwn(comparison.weeklyCostReports[0],"generatedAtISO"),false);assert.equal(comparison.weeklyCostReports[0].cutItems[0].generatedAtISO,"nested-business-evidence");comparison.weeklyCostReports[0].cutByCategory.Blanco.cost=999;assert.deepEqual(state,before);});
test("non-array weekly reports, other collections and nested timestamps stay exact",()=>{for(const [a,b]of [[{weeklyCostReports:{generatedAtISO:timestampA}},{weeklyCostReports:{generatedAtISO:timestampB}}],[{inventory:[{generatedAtISO:timestampA}]},{inventory:[{generatedAtISO:timestampB}]}],[{generatedAtISO:timestampA},{generatedAtISO:timestampB}]])assert.notEqual(normalized(a),normalized(b));const a=fixture(),b=structuredClone(a);b.weeklyCostReports[0].cutItems[0].generatedAtISO=timestampB;assert.notEqual(normalized(a),normalized(b));assert.deepEqual(importer.normalizeComparisonState({weeklyCostReports:[null,4,"value",[timestampA]]}),{weeklyCostReports:[null,4,"value",[timestampA]]});});
const drifts={
  "weekly dollar total":state=>state.weeklyCostReports[0].totalCutCost++,
  "weekly ID":state=>state.weeklyCostReports[0].id="changed",
  "added weekly report":state=>state.weeklyCostReports.push({id:"new"}),
  "removed weekly report":state=>state.weeklyCostReports.pop(),
  "weekly category":state=>state.weeklyCostReports[0].cutByCategory.Blanco.cost++,
  "weekly source-item date":state=>state.weeklyCostReports[0].cutItems[0].dateISO="2026-09-29",
  "weekly arbitrary field":state=>state.weeklyCostReports[0].notes="concurrent",
  "cuttingJobs":state=>state.cuttingJobs.push({id:"changed",projectNumber:"0000",cat:"jobs_root"}),
  "completedCuttingJobs":state=>state.completedCuttingJobs.push({id:"changed",import_event_id:"other"}),
  "jobFolders":state=>state.jobFolders[0].name="Changed root",
  "protected inventory":state=>state.inventory[0].quantity++
};
for(const [name,mutate]of Object.entries(drifts))test(name+" remains strict at preview and fresh baseline",async()=>{const h=harness({timestampDrift:true});mutate(h.local);await assert.rejects(h.prepare(),/Authoritative baseline changed/);const reviewed=h.api.preview([row]),result=await h.api.submit([row],{confirmed:true,reviewedPreview:reviewed});assert.match(result.saveError,/baseline revalidation failed/);assert.equal(result.saveAttempted,false);assert.deepEqual(h.writes,[]);});
test("revision mismatch still blocks timestamp-only states",async()=>{const h=harness({timestampDrift:true});h.cloud.syncMeta.rev++;await assert.rejects(h.prepare(),/Authoritative baseline changed/);const result=await h.api.submit([row],{confirmed:true,reviewedPreview:h.api.preview([row])});assert.match(result.saveError,/baseline revalidation failed/);assert.equal(result.saveAttempted,false);});
test("prepared review accepts timestamp refresh but rejects meaningful local drift",async()=>{const h=harness(),p=await h.prepare();h.local.weeklyCostReports[0].generatedAtISO=timestampB;p.validate();h.local.weeklyCostReports[0].totalMaintenanceCost++;assert.throws(p.validate,/stale/);});
test("receipt validation accepts timestamp refresh across cloud reads",async()=>{const h=harness(),p=await h.prepare();h.cloud.weeklyCostReports[0].generatedAtISO=timestampB;h.window.__cjiAuthoritativeBaseline=structuredClone(h.cloud);const receipt=p.download.trigger();h.context.receipts.set(receipt,p);const result=await h.api.submit([row],{confirmed:true,reviewedPreview:h.api.preview([row]),backupReceipt:receipt,expectedRevision:7});assert.equal(result.saveCompleted,true);assert.deepEqual(h.downloads[0].weeklyCostReports,fixture().weeklyCostReports);});
test("receipt still rejects cloud business drift after review",async()=>{const h=harness(),p=await h.prepare(),receipt=p.download.trigger();h.context.receipts.set(receipt,p);h.cloud.weeklyCostReports[0].id="changed";h.local.weeklyCostReports[0].id="changed";const result=await h.api.submit([row],{confirmed:true,reviewedPreview:h.api.preview([row]),backupReceipt:receipt,expectedRevision:7});assert.match(result.saveError,/baseline or backup changed/);assert.equal(result.saveAttempted,false);});
test("local protected-state staging ignores only the generated timestamp",async()=>{const h=harness({onCreate:({local})=>local.weeklyCostReports[0].generatedAtISO=timestampB}),r=await h.submit();assert.equal(r.protectedStateMatched,true);assert.equal(r.saveCompleted,true);assert.equal(h.local.weeklyCostReports[0].generatedAtISO,timestampB);assert.equal(h.cloud.weeklyCostReports[0].generatedAtISO,timestampB);});
test("meaningful weekly staging mutation is rejected before save",async()=>{const h=harness({onCreate:({local})=>local.weeklyCostReports[0].totalCutCost++}),r=await h.submit();assert.equal(r.saveAttempted,false);assert.deepEqual(r.protectedStateMismatchPaths,["$.weeklyCostReports"]);assert.match(r.saveError,/Protected state mutation rejected/);});
test("post-save timestamp-only drift completes without recovery suspension",async()=>{const h=harness({timestampDrift:true,onSave:({cloud})=>cloud.weeklyCostReports.forEach(report=>report.generatedAtISO="2026-10-05T20:00:00Z")}),r=await h.submit();assert.equal(r.saveCompleted,true);assert.equal(r.verificationCompleted,true);assert.deepEqual(h.writes,["save"]);assert.equal(h.window.__autosaveDisabled,undefined);assert.equal(h.downloads[0].weeklyCostReports[0].generatedAtISO,timestampA);});
for(const [name,mutate]of Object.entries(drifts))test("post-save "+name+" drift fails and suspends without retry",async()=>{const h=harness({onSave:({cloud})=>mutate(cloud)}),r=await h.submit();assert.equal(r.saveCompleted,false);assert.equal(r.saveIndeterminate,true);assert.equal(r.verificationCompleted,false);assert.equal(r.rollbackAttempted,false);assert.deepEqual(h.writes,["save","suspend"]);assert.equal(h.window.__recoveryInspectMode,true);});
