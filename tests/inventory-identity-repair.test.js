"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const repair=require("../js/inventoryIdentityRepair"),atomic=require("../js/atomicPersistence"),firewall=require("../js/cuttingFileContentFirewall");
const cloudFiles=require("../js/cfr05CloudCuttingFiles")(globalThis),foundation=require("../js/cfr04WorkspaceMetadata");
const clone=structuredClone,oldId="inventory_mqgqwky1",core=fs.readFileSync("js/core.js","utf8");
function fixture(){
  const task=index=>({id:`legacy-${index}`,name:"Same visible name",inventoryId:index?oldId:"inventory_msnpt6ic",completedDates:["2025-01-01"],manualHistory:[{dateISO:"2025-01-01",note:"keep"}],schedule:{every:10}});
  return{syncMeta:{rev:1790781035355,updatedBy:"fixture",custom:"keep"},inventory:Array.from({length:28},(_,i)=>({id:i?oldId:"inventory_msnpt6ic",name:i?"Same visible name":"Pump Rebuild",linkedTaskId:`legacy-${i}`,qtyNew:i+1,qtyOld:2,note:"Evidence",custom:{keep:i}})),inventoryFolders:[{id:"folder",name:"Keep"}],tasksInterval:Array.from({length:15},(_,i)=>task(i)),tasksAsReq:Array.from({length:13},(_,i)=>task(i+15)),maintenanceTasksV2:[1,4,8,18,27].map(i=>({id:`v2-${i}`,name:"Unrelated visible name",legacyTaskId:`legacy-${i}`,inventoryId:oldId,history:[{note:"Keep"}]})),maintenanceCalendarInstancesV2:Array.from({length:80},(_,i)=>({id:`instance-${i}`})),maintenanceOccurrencesV2:Array.from({length:13},(_,i)=>({id:`occurrence-${i}`})),cuttingJobs:[{id:"job",projectNumber:"0000"}],completedCuttingJobs:Array.from({length:67},(_,i)=>({id:`job-${i}`,manualLogs:[{completedHours:2}]})),dailyCutHours:Array.from({length:80},(_,i)=>({dateISO:`fixture-${i}`,hours:3})),pumpEff:{baselineRPM:3500,entries:[{rpm:3400}],notes:[{text:"Keep"}]},receiptTrackerWeeks:[{key:"fixture",rows:[{purchased:"Keep",qty:2}]}],dashboardLayout:{keep:{x:1}},deletedItems:[],appConfig:{dailyHours:8},unknownPreserved:{nested:[1,2,3]}};
}
function harness(options={}){
  let cloud=fixture(),local=clone(cloud),commits=0,backups=0,suspended=0,adopts=0,reads=0;
  const window={__recoveryInspectMode:true,__autosaveDisabled:true,__cloudLoadAttemptComplete:true,__initialAdoptComplete:true,__loadedCloudRevisionForSaveGuard:cloud.syncMeta.rev,__lastLoadedCloudState:clone(cloud),OMAXAtomicPersistence:atomic,OMAXInventoryIdentityRepair:repair,CuttingFileContentFirewall:firewall};
  const db={async runTransaction(callback){let pending;await callback({get:async()=>({exists:cloud!==null,data:()=>clone(cloud)}),set:(ref,next)=>{pending=clone(next);}});if(options.writeError)throw options.writeError;cloud={...cloud,...pending};commits++;}};
  const context=vm.createContext({window,FB:{ready:true,user:{uid:"fixture"},docRef:{path:"fixture/app/state"},db},Map,Symbol,stableStringify:repair.key,canWriteCloud:()=>false,scanAuthoritativeCutFileContent:firewall.scanCuttingFileContent,getCloudSyncClientId:()=>"fixture-client",estimatePayloadBytes:value=>Buffer.byteLength(JSON.stringify(value)),FIRESTORE_BLOCK_BYTES:950000,renderRecoveryDiagnosticsPanel(){},enterMissingStateRecovery(){}});
  vm.runInContext(core.slice(core.indexOf("const inventoryIdentityRepairAuthorizations="),core.indexOf("function getInventoryIdentityRepairLocalState"))+";this.writeRepair=writeReviewedInventoryIdentityRepair;this.ordinaryWrite=writeAuthoritativeStateSnapshot",context);
  const env={localState:()=>clone(local),loadedRevision:()=>window.__loadedCloudRevisionForSaveGuard,canApply:()=>options.auth!==false,readCloud:async()=>{reads++;const value=clone(cloud);if(options.verifyReadFailure&&commits)throw Error("server read unavailable");if(options.verifyMismatch&&commits)value.inventory[3].qtyNew=999;return value;},backup:async value=>{backups++;assert.deepEqual(value,cloud);options.duringBackup?.(local,cloud);return options.backupFailure?false:true;},write:async(next,proof)=>{options.duringWrite?.(local,cloud);if(options.indeterminate)return{saved:false,stateWriteAttempted:true,stateWriteCompleted:false,indeterminate:true,error:"unknown"};if(options.throwWrite)throw Error("unknown transport outcome");return context.writeRepair(next,proof);},suspend:()=>{suspended++;},adoptVerified:value=>{adopts++;cloud=clone(value);local=clone(value);window.__lastLoadedCloudState=clone(value);window.__loadedCloudRevisionForSaveGuard=value.syncMeta.rev;}};
  const api=repair.createApi(env);
  return{api,context,window,get cloud(){return clone(cloud);},get local(){return clone(local);},get commits(){return commits;},get backups(){return backups;},get suspended(){return suspended;},get adopts(){return adopts;},get reads(){return reads;},alter(fn){fn(local,cloud);}};
}
test("read-only preview preserves supplied production-shaped evidence and resolves 27 deterministic mappings / five V2 links",async()=>{
  const h=harness(),before=h.local,plan=await h.api.preview();assert.deepEqual(h.local,before);assert.deepEqual(h.cloud,before);assert.equal(h.commits,0);assert.equal(h.backups,0);assert.deepEqual(plan.blockers,[]);
  assert.equal(plan.sourceRevision,1790781035355);assert.equal(plan.duplicateGroups.length,1);assert.deepEqual(plan.duplicateGroups[0].indexes,Array.from({length:27},(_,i)=>i+1));
  assert.equal(plan.affectedRows.length,27);assert.equal(plan.v2Relinks.length,5);assert.equal(new Set(plan.affectedRows.map(row=>row.proposedInventoryId)).size,27);
  assert.ok(plan.affectedRows.every(row=>row.inventoryRow.linkedTaskId===row.legacyTask.id&&row.proposedInventoryId===repair.proposedId(row.linkedTaskId)&&row.oldInventoryId!==row.proposedInventoryId));
  assert.ok(plan.v2Relinks.every(row=>row.proposedInventoryId===repair.proposedId(row.legacyTaskId)));assert.equal(plan.remainingReferences.length,59);assert.ok(plan.remainingReferences.every(ref=>ref.supported));
  assert.deepEqual(plan.beforeCounts,plan.expectedAfterCounts);assert.equal(plan.beforeCounts.inventory,28);assert.equal(plan.beforeCounts.tasksInterval,15);assert.equal(plan.beforeCounts.tasksAsReq,13);assert.equal(plan.beforeCounts.maintenanceTasksV2,5);
  assert.deepEqual(await h.api.preview(),plan);
});
test("confirmed repair changes only authorized ID fields, verifies exact server result and reruns as no-op",async()=>{
  const h=harness(),before=h.cloud,plan=await h.api.preview(),result=await h.api.apply(plan,{confirmed:true});assert.equal(result.verified,true,result.error);assert.equal(h.commits,1);assert.equal(h.backups,1);assert.equal(h.adopts,1);assert.equal(h.suspended,0);assert.equal(result.repairedRows,27);
  const actual=h.cloud;assert.equal(actual.inventory[0].id,"inventory_msnpt6ic");assert.ok(actual.inventory.slice(1).every(item=>item.id!==oldId));assert.equal(new Set(actual.inventory.map(item=>item.id)).size,28);assert.deepEqual(repair.counts(actual),repair.counts(before));
  const reverted=clone(actual);reverted.syncMeta=before.syncMeta;
  plan.affectedRows.forEach(row=>{assert.equal(actual[row.legacyTask.collection][row.legacyTask.index].inventoryId,actual.inventory[row.inventoryIndex].id);reverted.inventory[row.inventoryIndex].id=oldId;reverted[row.legacyTask.collection][row.legacyTask.index].inventoryId=oldId;});
  plan.v2Relinks.forEach(row=>{assert.equal(actual.maintenanceTasksV2[row.index].inventoryId,repair.proposedId(row.legacyTaskId));reverted.maintenanceTasksV2[row.index].inventoryId=oldId;});assert.deepEqual(reverted,before);
  assert.ok(actual.syncMeta.rev>before.syncMeta.rev);assert.equal(actual.syncMeta.rev,result.committedState.syncMeta.rev);assert.equal(h.window.__autosaveDisabled,true);assert.equal(h.window.__recoveryInspectMode,true);
  assert.equal((await h.context.ordinaryWrite(actual)).saved,false,"ordinary Recovery Mode writes stay blocked");
  const noopPlan=await h.api.preview();assert.equal(noopPlan.noop,true);assert.equal((await h.api.apply(noopPlan,{confirmed:true})).noop,true);assert.equal(h.commits,1);assert.equal(h.backups,1);
});
for(const [name,change,pattern] of [
  ["missing linkedTaskId",s=>{delete s.inventory[1].linkedTaskId;},/linkedTaskId/],
  ["duplicate linkedTaskId",s=>{s.inventory[2].linkedTaskId=s.inventory[1].linkedTaskId;},/not unique/],
  ["missing legacy task",s=>{s.tasksInterval[1].id="missing";},/matches 0/],
  ["multiple legacy task matches",s=>{s.tasksAsReq[0].id=s.tasksInterval[1].id;},/matches 2/],
  ["unmatched legacy reference",s=>{s.tasksInterval[1].inventoryId="different";},/does not reference/],
  ["unmapped extra legacy reference",s=>{s.tasksInterval[0].inventoryId=oldId;},/one-to-one/],
  ["V2 missing legacyTaskId",s=>{delete s.maintenanceTasksV2[0].legacyTaskId;},/resolvable legacyTaskId/],
  ["V2 unknown legacyTaskId",s=>{s.maintenanceTasksV2[0].legacyTaskId="missing";},/resolvable legacyTaskId/],
  ["unknown external reference",s=>{s.receiptTrackerWeeks[0].rows[0].inventoryItemId=oldId;},/Unknown duplicate-ID reference/],
  ["unknown nested reference",s=>{s.deletedItems.push({payload:{inventoryId:oldId}});},/Unknown duplicate-ID reference/],
  ["unknown object key",s=>{s.unknownPreserved[oldId]={};},/object key/],
  ["embedded ID in unknown string",s=>{s.unknownPreserved.url="fixture/"+oldId;},/Unknown duplicate-ID reference/],
  ["proposed ID collision",s=>{s.inventory[0].id=repair.proposedId("legacy-1");s.tasksInterval[0].inventoryId=s.inventory[0].id;},/collides/]
])test(`${name} blocks repair without backup or write`,async()=>{
  const h=harness();h.alter((local,cloud)=>{change(local);change(cloud);});const before=h.local,plan=await h.api.preview();assert.match(plan.blockers.join(" "),pattern);const result=await h.api.apply(plan,{confirmed:true});assert.equal(result.saved,false);assert.equal(h.commits,0);assert.equal(h.backups,0);assert.deepEqual(h.local,before);assert.deepEqual(h.cloud,before);
});
test("confirmation, authentication and exact unmodified plan are mandatory",async()=>{
  for(const mode of ["confirmation","auth","tamper"]){const h=harness({auth:mode!=="auth"}),plan=await h.api.preview();if(mode==="tamper")plan.affectedRows[0].proposedInventoryId="forged";const result=await h.api.apply(plan,{confirmed:mode!=="confirmation"});assert.equal(result.saved,false);assert.equal(h.commits,0);assert.equal(h.backups,0);}
});
test("stale revision, same-revision source drift and local drift block the reviewed plan",async()=>{
  for(const mode of ["revision","source","local"]){const h=harness(),plan=await h.api.preview();h.alter((local,cloud)=>{if(mode==="revision")cloud.syncMeta.rev++;if(mode==="source")cloud.inventory[1].qtyNew++;if(mode==="local")local.inventory[1].note="New local edit";});const before=h.local,result=await h.api.apply(plan,{confirmed:true});assert.equal(result.saved,false);assert.equal(h.commits,0);assert.equal(h.backups,0);assert.deepEqual(h.local,before);}
});
test("backup failure or concurrent local change during backup blocks before transaction",async()=>{
  for(const options of [{backupFailure:true},{duringBackup:local=>{local.inventory[1].note="Concurrent edit";}}]){const h=harness(options),plan=await h.api.preview(),result=await h.api.apply(plan,{confirmed:true});assert.equal(result.saved,false);assert.equal(h.commits,0);assert.equal(h.adopts,0);}
});
test("atomic callback checks exact source even when revision did not change",async()=>{
  const h=harness({duringWrite:(local,cloud)=>{cloud.inventory[1].qtyNew++;}}),plan=await h.api.preview(),before=h.local,result=await h.api.apply(plan,{confirmed:true});assert.equal(result.saved,false);assert.match(result.error,/source or exact authorized/);assert.equal(h.commits,0);assert.deepEqual(h.local,before);
});
test("ordinary writer stays blocked and forged out-of-scope repair cannot authorize quantity changes",async()=>{
  const h=harness(),source=h.cloud,plan=await h.api.preview(),next=repair.repairedState(source,plan);next.inventory[1].qtyNew++;
  await assert.rejects(h.context.writeRepair(next,{source,expectedRevision:source.syncMeta.rev}),/authorization/);assert.equal(h.commits,0);
  const ordinary=await h.context.ordinaryWrite(source,null,{expectedRevision:source.syncMeta.rev,inventoryIdentityRepairToken:Symbol("forged")});assert.equal(ordinary.saved,false);assert.equal(h.commits,0);
});
test("Recovery Mode blocks direct secure-file uploads before every Storage/Firestore operation",async()=>{
  const api=cloudFiles.createApi(globalThis,{foundation,environment:()=>({firebaseInitialized:true,readOnly:true,projectId:cloudFiles.EXPECTED_PROJECT,bucket:cloudFiles.EXPECTED_BUCKET,workspaceId:cloudFiles.EXPECTED_WORKSPACE,authenticated:true,uid:cloudFiles.EXPECTED_UID})});
  const result=await api.upload({workspaceId:cloudFiles.EXPECTED_WORKSPACE,membership:{valid:true,active:true,role:"owner"},storage:{ref:()=>{throw Error("must not access Storage");}},firestore:{doc:()=>{throw Error("must not access Firestore");}}});
  assert.equal(result.error.code,"recoveryReadOnly");assert.ok(Object.values(result.attempted).every(value=>value===false));
});
test("definite rejection leaves local evidence untouched, without snapshot rollback",async()=>{
  const h=harness({writeError:Object.assign(Error("denied"),{code:"permission-denied"})}),plan=await h.api.preview(),before=h.local,result=await h.api.apply(plan,{confirmed:true});assert.equal(result.saved,false);assert.equal(h.commits,0);assert.equal(h.adopts,0);assert.deepEqual(h.local,before);assert.equal(h.suspended,0);
});
test("indeterminate or thrown write suspends without rollback, retry or adoption",async()=>{
  for(const options of [{indeterminate:true},{throwWrite:true},{writeError:Error("unknown completion")}]){const h=harness(options),plan=await h.api.preview(),before=h.local,result=await h.api.apply(plan,{confirmed:true});assert.equal(result.indeterminate,true);assert.equal(h.suspended,1);assert.equal(h.commits,0);assert.equal(h.adopts,0);assert.deepEqual(h.local,before);}
});
test("committed mismatch/read failure and in-flight local edits suspend verification without overwriting evidence",async()=>{
  for(const options of [{verifyMismatch:true},{verifyReadFailure:true},{duringWrite:local=>{local.inventory[0].note="Concurrent edit";}}]){const h=harness(options),plan=await h.api.preview(),result=await h.api.apply(plan,{confirmed:true});assert.equal(result.saved,true);assert.equal(result.verified,false);assert.equal(result.manualVerificationRequired,true);assert.equal(h.suspended,1);assert.equal(h.commits,1);assert.equal(h.adopts,0);assert.equal(h.local.inventory[1].id,oldId);if(options.duringWrite)assert.equal(h.local.inventory[0].note,"Concurrent edit");}
});
test("real load adopts all authoritative evidence only after disabling writes, without defaults/normalization",async()=>{
  const data={...fixture(),__autosaveDisabled:false},before=clone(data),window={},events=[];
  const globals=["totalHistory","tasksInterval","tasksAsReq","inventory","cuttingJobs","completedCuttingJobs","orderRequests","garnetCleanings","dailyCutHours","opportunityRollups","weeklyCostReports","receiptTrackerWeeks","maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2","deletedItems","appConfig","jobFolders","orderRequestTab"].map(name=>`let ${name};`).join("");
  const context=vm.createContext({window,FB:{ready:true,docRef:{path:"fixture",get:async options=>{assert.equal(options.source,"server");return{exists:true,data:()=>data};}}},cloneStructured:clone,syncRenderTotalsFromHistory(){},setCloudLoadGate:value=>{window.__cloudLoadAttemptComplete=value.loadComplete;window.__initialAdoptComplete=value.adoptComplete;},blockCloudSave:()=>false,renderRecoveryDiagnosticsPanel:()=>events.push("diagnostics"),stateHasMeaningfulData:value=>!!value?.inventory?.length,console,normalizeInventoryItem:()=>{throw Error("must not normalize");},ensureInventoryForAllMaintenanceTasks:()=>{throw Error("must not seed");},readLocalStateBackup:()=>{throw Error("must not read/adopt backup");}});
  const extract=(start,end)=>core.slice(core.indexOf(start),core.indexOf(end,core.indexOf(start)));
  const raw=extract("function adoptAuthoritativeRecoveryState","function renderInventoryIdentityRecoveryData");
  const inspectStart=core.indexOf("function inspectInventoryIdentities"),inspect=core.slice(inspectStart,core.indexOf("\n}",inspectStart)+2);
  vm.runInContext(globals+"let lastAppliedCloudRevision=0;"+raw+inspect+extract("function isRecoveryMode","function enterMissingStateRecovery")+extract("function canWriteCloud","let CUTTING_BASELINE_WEEKLY_HOURS")+extract("async function loadFromCloud","async function migrateLegacyWorkspaceDoc")+`;function adoptState(value,options){if(!window.__autosaveDisabled||!window.__recoveryInspectMode)throw Error("writes were not blocked before adoption");if(!options.preserveAuthoritative)throw Error("must adopt raw evidence");adoptAuthoritativeRecoveryState(value);}this.load=loadFromCloud;this.canWrite=canWriteCloud;`,context);
  const result=await context.load();assert.equal(result.loaded,true);assert.equal(result.recovery,true);assert.equal(context.canWrite(),false);assert.equal(window.__initialAdoptComplete,true);assert.equal(window.__loadedCloudRevisionForSaveGuard,data.syncMeta.rev);
  assert.deepEqual(window.__lastLoadedCloudState,before);for(const name of ["inventory","tasksInterval","tasksAsReq","maintenanceTasksV2","cuttingJobs","completedCuttingJobs","dailyCutHours","maintenanceOccurrencesV2","maintenanceCalendarInstancesV2"])assert.deepEqual(window[name],before[name]);assert.deepEqual(data,before);assert.ok(events.length);
  assert.equal(window.__autosaveDisabled,true,"source metadata cannot overwrite runtime write gates");assert.deepEqual(window.__inventoryIdentityLocalEvidence.unknownPreserved,before.unknownPreserved);
  const node=tag=>({tag,dataset:{},style:{},children:[],appendChild(child){this.children.push(child);},append(...children){this.children.push(...children);},replaceChildren(){this.children=[];}}),content=node("main");context.document={getElementById:()=>content,createElement:node};
  vm.runInContext(extract("function renderInventoryIdentityRecoveryData","function adoptState")+";this.renderEvidence=renderInventoryIdentityRecoveryData",context);context.renderEvidence("#/inventory");const section=content.children.find(child=>child.dataset.recoveryCollection==="inventory");assert.equal(section.children.filter(child=>child.dataset.evidenceRow!==undefined).length,28);assert.deepEqual(data,before);assert.equal(content.children.some(child=>child.tag==="input"||child.tag==="button"),false);
});
