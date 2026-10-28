"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const archive=require("../js/inventoryArchive"),identity=require("../js/globalIdentityRepair");
const {harness}=require("./mdel01-harness.cjs"),{fixture,archivedState,definitions}=require("./fixtures/mdel01c-inventory");
const clone=structuredClone,core=fs.readFileSync("js/core.js","utf8"),renderer=fs.readFileSync("js/renderers.js","utf8");
function fn(source,name){const start=source.search(new RegExp("^(?:async )?function "+name+"\\(","m"));assert.ok(start>=0,name);return source.slice(start,source.indexOf("\n}",start)+2);}
function setup(options={}){const h=harness({initial:fixture(),...options});let id=0;h.context.genId=()=>"fixture-new-inventory-trash-"+(++id);return {...h,inventoryApi:h.window.inventoryDeletionApi,h};}

test("incident paths [11]/[21] resolve exact existing inventory archives without migration or history edits",()=>{
  const state=archivedState(),before=clone(state),check=identity.integrity(state);
  assert.equal(check.valid,true,check.blockers.join("\n"));assert.deepEqual(check.plan.changes,[]);assert.deepEqual(state,before);
  for(const definition of definitions){
    const ref=check.plan.references.find(ref=>ref.path===`$.maintenanceTasksV2[${definition.index}].inventoryId`);
    assert.equal(state.maintenanceTasksV2[definition.index].id,definition.id);assert.equal(ref.resolution,"archived_inventory");
    assert.equal(ref.target,`$.deletedItems[${definitions.indexOf(definition)}].payload`);
  }
  const missing=clone(state);missing.deletedItems=missing.deletedItems.filter(entry=>entry.type!=="inventory");
  const bad=identity.integrity(missing);assert.equal(bad.valid,false);
  for(const {index}of definitions)assert.ok(bad.blockers.some(message=>message.includes(`$.maintenanceTasksV2[${index}].inventoryId`)));
});

for(const [name,mutate]of [
  ["nonexistent inventory FK",s=>s.maintenanceTasksV2[11].inventoryId="never-existed"],
  ["metadata alone",s=>delete s.deletedItems[0].payload.id],
  ["wrong archive type",s=>s.deletedItems[0].type="unknown"],
  ["invalid archive date",s=>s.deletedItems[0].deletedAt="invalid"],
  ["absent archive date",s=>delete s.deletedItems[0].deletedAt],
  ["wrong original ID",s=>s.deletedItems[0].meta.originalId="different"],
  ["malformed metadata",s=>s.deletedItems[0].meta=[]],
  ["noncanonical payload ID",s=>s.deletedItems[0].payload.id=" bad "],
  ["duplicate archive identity",s=>s.deletedItems.push({...clone(s.deletedItems[0]),id:"other-trash"})],
  ["duplicate Trash ID",s=>s.deletedItems[1].id=s.deletedItems[0].id],
  ["active/archive collision",s=>s.inventory.push(clone(s.deletedItems[0].payload))],
  ["unrelated missing purchase FK",s=>s.orderRequests[0].items[0].inventoryId="missing"],
  ["broken archive task link",s=>s.deletedItems[0].payload.linkedTaskId="missing"],
  ["broken archive folder link",s=>s.deletedItems[0].payload.folderId="missing"]
])test("archive model rejects "+name,()=>{const state=archivedState();mutate(state);const before=clone(state);assert.equal(identity.integrity(state).valid,false);assert.deepEqual(state,before);});

test("real guarded transaction removes both linked stock entries, preserves every other business field and reloads cleanly",async()=>{
  const {h,inventoryApi}=setup({staleListener:true,realCoverage:true}),before=h.cloud;
  for(const item of before.inventory){
    const result=await inventoryApi.remove(item.id);assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);
    assert.equal(h.local.inventory.some(row=>row.id===item.id),false);
    assert.equal(archive.resolve(h.cloud,item.id).status,"archived");
    assert.deepEqual(archive.resolve(h.cloud,item.id).item,item);
  }
  assert.equal(h.commits,2);assert.equal(h.writeTransactions,2);assert.equal(h.readTransactions,4);assert.equal(h.documentReads,0);
  assert.deepEqual(h.cloud.inventory,[]);assert.deepEqual(h.cloud.deletedItems.slice(2),before.deletedItems);
  for(const key of Object.keys(before).filter(key=>!["syncMeta","inventory","deletedItems"].includes(key)))assert.deepEqual(h.cloud[key],before[key],key);
  assert.deepEqual(h.local,h.cloud);assert.equal(h.window.__recoveryInspectMode,false);assert.equal(h.window.__autosaveDisabled,false);assert.equal(h.diagnostics,0);
  const reload=harness({initial:JSON.parse(JSON.stringify(h.cloud))});assert.deepEqual(reload.local,h.cloud);assert.equal(reload.window.__recoveryInspectMode,false);assert.equal(reload.commits,0);
});

for(const [name,options]of [
  ["revision conflict",{conflict:true}], ["permission rejection",{reject:true}],
  ["same revision remote change",{beforeWrite:({cloud})=>cloud.inventory[0].note="concurrent"}],
  ["local drift before transaction",{beforeWrite:({context})=>vm.runInContext("lastLocalMutationAt++",context)}],
  ["altered archive payload",{pendingMutation:s=>s.deletedItems[0].payload.name="altered"}],
  ["lost archive evidence",{pendingMutation:s=>s.deletedItems.shift()}],
  ["unrelated history change",{pendingMutation:s=>s.maintenanceOccurrencesV2[0].partsCostSnapshot=0}]
])test(name+" cannot partially remove inventory or adopt a failed deletion",async()=>{
  const {h,inventoryApi}=setup(options),before=h.local,result=await inventoryApi.remove(before.inventory[0].id);
  assert.equal(result.saved,false);assert.equal(h.commits,0);assert.deepEqual(h.local,before);assert.equal(h.window.__lastIndeterminateSave,undefined);
  assert.equal(h.cloud.inventory.length,2);assert.deepEqual(h.cloud.deletedItems,before.deletedItems);
});
for(const options of [{loseAck:true},{readFailure:true},{readbackMutation:s=>s.inventory[0].name="changed"}])test("uncertain write/readback keeps original local evidence, suspends and never retries "+JSON.stringify(options),async()=>{
  const {h,inventoryApi}=setup(options),before=h.local,result=await inventoryApi.remove(before.inventory[0].id);
  assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.equal(h.commits,1);assert.deepEqual(h.local,before);
  assert.equal(h.window.__recoveryInspectMode,true);assert.equal(h.window.__autosaveDisabled,true);
  await inventoryApi.remove(before.inventory[0].id);assert.equal(h.writeTransactions,1);
});

test("archived stock is not reseeded by Settings, matched by part/name, expired, or permanently removed",()=>{
  const state=archivedState(),window={...clone(state),OMAXInventoryArchive:archive};
  const context=vm.createContext({window,console,structuredClone,genId:()=>{throw Error("No inventory may be recreated");}});
  vm.runInContext('const TRASH_RETENTION_MS=30*24*60*60*1000;let inventory=window.inventory,tasksInterval=window.tasksInterval,tasksAsReq=window.tasksAsReq,deletedItems=window.deletedItems;\n'+
    ["cloneStructured","buildTrashLabel","normalizeDeletedItem","normalizeDeletedItems","purgeExpiredDeletedItems","removeDeletedItem","ensureInventoryForAllMaintenanceTasks"].map(name=>fn(core,name)).join("\n"),context);
  assert.equal(context.ensureInventoryForAllMaintenanceTasks(),false);assert.deepEqual(window.inventory,[]);
  for(const entry of state.deletedItems.filter(entry=>entry.type==="inventory")){
    assert.ok(context.normalizeDeletedItem(entry));assert.equal(context.removeDeletedItem(entry.id),false);
  }
  const start=renderer.indexOf("  function findInventoryMatchesForTask(task){"),end=renderer.indexOf("\n  function ",start+10);
  vm.runInContext(renderer.slice(start,end)+"\nthis.matches=findInventoryMatchesForTask;",context);
  assert.deepEqual(clone(context.matches(window.tasksInterval[0])),[]);
});

test("inventory deletion UI cannot cascade task deletion and only reports verified success",async()=>{
  const state=fixture(),before=clone(state);let called=0;
  const window={inventoryDeletionApi:{remove:async id=>{called++;assert.equal(id,state.inventory[0].id);return {saved:true,verified:true};}}};
  const context=vm.createContext({window,inventory:state.inventory,showConfirmModal:async()=>true,toast(){},location:{hash:"#/inventory"}});
  vm.runInContext(fn(renderer,"deleteInventoryItem"),context);
  assert.equal(await context.deleteInventoryItem(state.inventory[0].id,{removeLinkedTasks:true}),true);assert.equal(called,1);assert.deepEqual(state,before);
  window.inventoryDeletionApi.remove=async()=>({saved:false,error:"conflict"});assert.equal(await context.deleteInventoryItem(state.inventory[0].id),false);
});

test("user requested Restore uses the exact inventory identity and leaves all tasks/history intact",async()=>{
  const {h,inventoryApi}=setup(),id=h.cloud.inventory[0].id,before=h.cloud;
  assert.equal((await inventoryApi.remove(id)).saved,true);const restored=await inventoryApi.restore(id);
  assert.equal(restored.saved,true,restored.error);assert.equal(restored.verified,true);assert.equal(h.commits,2);
  assert.deepEqual(h.cloud.inventory.find(item=>item.id===id),before.inventory[0]);assert.deepEqual(h.cloud.deletedItems,before.deletedItems);
  for(const field of ["tasksInterval","maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2","receiptTrackerWeeks","orderRequests"])assert.deepEqual(h.cloud[field],before[field]);
});

test("removing a task after inventory deletion stays a separate operation and preserves inventory archives",async()=>{
  const {h,inventoryApi}=setup(),id=h.cloud.inventory[0].id;
  assert.equal((await inventoryApi.remove(id)).saved,true);
  const result=await h.api.remove(definitions[0].legacy);assert.equal(result.saved,true,result.error);
  assert.equal(archive.resolve(h.cloud,id).status,"archived");assert.equal(identity.integrity(h.cloud).valid,true);
});

test("ordinary authoritative inventory edits cannot commit genuinely dangling inventory FKs",async()=>{
  const {h}=setup(),next=clone(h.cloud);next.inventory[0].qty++;next.maintenanceTasksV2[11].inventoryId="genuinely-missing";
  const result=await h.context.writeAuthoritativeStateSnapshot(next,{merge:true},{expectedRevision:next.syncMeta.rev,validateSourceState:()=>true,validatePreparedState:()=>true});
  assert.equal(result.saved,false);assert.equal(result.errorCode,"inventory_identity_rejected");assert.equal(h.commits,0);
});

test("existing corruption keeps Recovery Mode closed to inventory deletion",async()=>{
  const initial=fixture();initial.maintenanceTasksV2[21].inventoryId="genuinely-missing";
  const {h,inventoryApi}=setup({initial,expectRecovery:true}),before=h.local;
  assert.equal((await inventoryApi.remove(initial.inventory[0].id)).saved,false);assert.equal(h.commits,0);assert.deepEqual(h.local,before);
  assert.equal(h.window.__recoveryInspectMode,true);assert.equal(h.window.__autosaveDisabled,true);
});

test("all backup sizes retain exact inventory archive identities and payloads",()=>{
  const source=archivedState(),context=vm.createContext({console,window:{},APP_SCHEMA:72});
  const constants=["LARGE_CONTENT_KEY_PATTERN","SAFE_FILE_METADATA_KEY_PATTERN","EMBEDDED_CONTENT_KEY_PATTERN"].map(name=>{const start=core.indexOf("const "+name+" =");return core.slice(start,core.indexOf(";",start)+1);});
  vm.runInContext(constants.join("\n")+"\n"+["isDataUrl","isLikelyEmbeddedFileContent","isSafeMetadataString","isProtectedBusinessDataKey","sanitizeValueForStorage","compactStateForStorage","buildEmergencyBackup","buildTinyCriticalBackup"].map(name=>fn(core,name)).join("\n"),context);
  const expected=source.deletedItems.filter(entry=>entry.type==="inventory");
  for(const backup of [context.compactStateForStorage(source,{forBackup:true}),context.buildEmergencyBackup(source),context.buildTinyCriticalBackup(source,{quiet:true})])assert.deepEqual(clone(backup.deletedItems),expected);
});
