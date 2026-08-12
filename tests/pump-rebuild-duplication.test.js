"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("js/maintenance-duplication.js", "utf8");
function task(id, history=[]){ return { id, name:"Pump Rebuild", mode:"interval", cat:"root", inventoryId:"inventory_msnpt6ic", interval:500, manualHistory:history, completedDates:[] }; }
function harness(overrides={}){
  const imported = id => ({ dateISO:"2025-01-01", import_event_id:id, payload:{ exact:id } });
  const canonical = task("pump_rebuild_msnpt6hi", [imported("OMAX-2067268-302701-01"), imported("OMAX-2070032-302701-01")]);
  const duplicate = task("pump_rebuild_msnpt6gs");
  const sharedInventory={ folderId:null, id:"inventory_msnpt6ic", link:"", linkedTaskId:duplicate.id, name:"Pump Rebuild", note:"", pn:"", price:null, qty:0, qtyNew:0, qtyOld:0, unit:"pcs" };
  const window = Object.assign({ tasksInterval:[canonical, duplicate], tasksAsReq:[], inventory:[{id:"first",name:"Other"},sharedInventory,{id:"last",name:"Other 2"}], deletedItems:[{ payload:{ name:"Pump Rebuild" }, linkedTaskId:duplicate.id }], maintenanceTasksV2:[], maintenanceCalendarInstancesV2:[], maintenanceOccurrencesV2:[] }, overrides);
  let snapshots=0; let backups=0;
  const state = ()=>structuredClone({ tasksInterval:window.tasksInterval, tasksAsReq:window.tasksAsReq, inventory:window.inventory, deletedItems:window.deletedItems, maintenanceTasksV2:window.maintenanceTasksV2, maintenanceCalendarInstancesV2:window.maintenanceCalendarInstancesV2, maintenanceOccurrencesV2:window.maintenanceOccurrencesV2,
    saveMeta:{lastSavedAt:`generated-${++snapshots}`,lastSaveStatus:"pending"}, syncMeta:{rev:snapshots,updatedAtISO:`generated-${snapshots}`}, diagnostic:{auditTimestamp:snapshots} });
  window.__lastLoadedCloudState = state();
  const context = { window, structuredClone, JSON, Date, setTimeout, snapshotState:state, exportJsonDownload:()=>{ backups++; return true; }, saveCloudNow:async()=>({ saved:true, stateWriteAttempted:true, stateWriteCompleted:true }) };
  vm.createContext(context); vm.runInContext(source, context);
  return { window, context, canonical, duplicate, sharedInventory, state, backupCount:()=>backups };
}
(async()=>{
  {
    const h=harness({ tasksInterval:[] }); let calls=0;
    const spec={ name:"Pump Rebuild", mode:"interval", interval:500 };
    const add=()=>{ calls++; const made=task(`id${calls}`); h.window.tasksInterval.push(made); return made; };
    const first=h.window.createMaintenanceTaskOnce("action-1", spec, add);
    const second=h.window.createMaintenanceTaskOnce("action-1", spec, add);
    assert.equal(first.created,true); assert.equal(second.created,false); assert.equal(calls,1); assert.equal(h.window.tasksInterval.length,1);
    h.window.createMaintenanceTaskOnce("action-2", { ...spec, interval:750 }, add);
    assert.equal(h.window.tasksInterval.length,2,"separately configured same-name task remains legitimate");
  }
  {
    const h=harness(); const audit=h.window.auditPumpRebuildTaskDuplication();
    assert.deepEqual(Array.from(audit.removableCandidateIds),["pump_rebuild_msnpt6gs"]); assert.equal(audit.repairSafe,true);
    assert.equal(audit.inventoryRelinkRequired,true); assert.equal(audit.inventoryRelinkSafe,true);
    assert.equal(audit.authoritativeBaselineMatched,true); assert.equal(audit.tasksIntervalBaselineMatched,true); assert.equal(audit.inventoryBaselineMatched,true);
    assert.deepEqual(Array.from(audit.baselineMismatchPaths),[]); assert.deepEqual(Array.from(audit.inventoryConfigurationMismatchPaths),[]);
    assert.deepEqual({...audit.inventoryRelinkPlan},{inventoryId:"inventory_msnpt6ic",fromTaskId:"pump_rebuild_msnpt6gs",toTaskId:"pump_rebuild_msnpt6hi"});
    const beforeTasks=structuredClone(h.window.tasksInterval); const beforeInventory=structuredClone(h.window.inventory); const beforeDeleted=structuredClone(h.window.deletedItems);
    const beforeHistory=structuredClone(h.canonical.manualHistory); const beforeV2=structuredClone([h.window.maintenanceTasksV2,h.window.maintenanceCalendarInstancesV2,h.window.maintenanceOccurrencesV2]);
    const result=await h.window.repairExactPumpRebuildTaskDuplication();
    assert.equal(h.backupCount(),1,"full-state backup precedes repair");
    assert.equal(result.backupCreated,true); assert.equal(result.authorizationCreated,true); assert.equal(result.authorizationValidated,true); assert.equal(result.authorizationConsumed,true);
    assert.equal(result.authorizationFailureStage,""); assert.deepEqual(Array.from(result.authorizationMismatchPaths),[]);
    assert.equal(result.repaired,true); assert.deepEqual(h.window.tasksInterval.map(x=>x.id),["pump_rebuild_msnpt6hi"]);
    assert.deepEqual(h.window.tasksInterval[0],beforeTasks[0],"canonical task remains byte-equivalent");
    assert.deepEqual(h.canonical.manualHistory,beforeHistory,"both imported events stay byte-for-byte");
    assert.deepEqual(Array.from(result.preservedImportEventIds),["OMAX-2067268-302701-01","OMAX-2070032-302701-01"]);
    assert.equal(result.inventoryRelinkRequired,true); assert.equal(result.inventoryRelinkCompleted,true);
    assert.deepEqual(Array.from(result.relinkedInventoryIds),["inventory_msnpt6ic"]); assert.equal(result.beforeInventoryLink,"pump_rebuild_msnpt6gs"); assert.equal(result.afterInventoryLink,"pump_rebuild_msnpt6hi");
    assert.equal(h.window.inventory.length,beforeInventory.length); assert.deepEqual(h.window.inventory.map(x=>x.id),beforeInventory.map(x=>x.id),"inventory order is unchanged");
    assert.deepEqual(h.window.inventory[0],beforeInventory[0]); assert.deepEqual(h.window.inventory[2],beforeInventory[2]);
    assert.equal(JSON.stringify(h.window.inventory[1]),JSON.stringify({...beforeInventory[1],linkedTaskId:"pump_rebuild_msnpt6hi"}),"only inventory link changes");
    assert.deepEqual([h.window.maintenanceTasksV2,h.window.maintenanceCalendarInstancesV2,h.window.maintenanceOccurrencesV2],beforeV2);
    assert.deepEqual(h.window.deletedItems,beforeDeleted,"trash lifecycle entry is not rewritten");
  }
  {
    const h=harness(); const audit=h.window.auditPumpRebuildTaskDuplication(); const token=h.window.createPumpRebuildRepairAuthorization(h.state(),audit.inventoryRelinkPlan);
    const first=h.window.validatePumpRebuildRepairAuthorization(token,h.state(),audit.inventoryRelinkPlan);
    const second=h.window.validatePumpRebuildRepairAuthorization(token,h.state(),audit.inventoryRelinkPlan);
    assert.equal(first.valid,true,"generated snapshot timestamps and diagnostics are excluded"); assert.equal(second.valid,true,"validation does not consume authorization");
    assert.equal(h.window.consumePumpRebuildRepairAuthorization(token,h.state(),audit.inventoryRelinkPlan).valid,true);
    const reused=h.window.consumePumpRebuildRepairAuthorization(token,h.state(),audit.inventoryRelinkPlan);
    assert.equal(reused.valid,false); assert.equal(reused.reason,"used","mutation token is single use");
  }
  {
    const mutations=[
      h=>{ h.canonical.cat="changed"; },
      h=>{ h.window.inventory[1].note="changed"; },
      h=>{ h.canonical.manualHistory[0].payload.exact="changed"; },
      h=>{ h.window.deletedItems[0].payload.name="changed"; }
    ];
    for (const mutate of mutations){ const h=harness(); const audit=h.window.auditPumpRebuildTaskDuplication(); const token=h.window.createPumpRebuildRepairAuthorization(h.state(),audit.inventoryRelinkPlan); mutate(h); const validation=h.window.validatePumpRebuildRepairAuthorization(token,h.state(),audit.inventoryRelinkPlan); assert.equal(validation.valid,false); assert.ok(validation.mismatchPaths.length,"business-data changes report exact mismatch paths"); }
  }
  {
    const h=harness(); const audit=h.window.auditPumpRebuildTaskDuplication(); const token=h.window.createPumpRebuildRepairAuthorization(h.state(),audit.inventoryRelinkPlan,0);
    await new Promise(resolve=>setTimeout(resolve,2));
    const expired=h.window.validatePumpRebuildRepairAuthorization(token,h.state(),audit.inventoryRelinkPlan); assert.equal(expired.valid,false); assert.equal(expired.reason,"expired");
  }
  {
    const h=harness(); const first={id:"first-task",name:"Other",interval:100}; const last={id:"last-task",name:"Other 2",interval:200};
    h.window.tasksInterval.splice(0,0,first); h.window.tasksInterval.push(last); h.window.__lastLoadedCloudState=h.state();
    await h.window.repairExactPumpRebuildTaskDuplication();
    assert.deepEqual(h.window.tasksInterval.map(item=>item.id),["first-task","pump_rebuild_msnpt6hi","last-task"],"every retained task keeps its ordering");
  }
  { const h=harness(); h.duplicate.manualHistory.push({dateISO:"2020-01-01"}); h.window.__lastLoadedCloudState=h.state(); assert.match((await h.window.repairExactPumpRebuildTaskDuplication()).refusedReason,/preconditions/); }
  { const h=harness(); h.window.inventory.push({ id:"another", linkedTaskId:h.duplicate.id }); h.window.__lastLoadedCloudState=h.state(); const audit=h.window.auditPumpRebuildTaskDuplication(); assert.equal(audit.repairSafe,false); assert.match(audit.refusalReasons.join(" "),/additional live references/); }
  { const h=harness(); h.canonical.inventoryId="different"; h.window.__lastLoadedCloudState=h.state(); assert.equal(h.window.auditPumpRebuildTaskDuplication().repairSafe,false,"different inventory ID blocks repair"); }
  { const h=harness(); h.window.inventory.push(structuredClone(h.sharedInventory)); h.window.__lastLoadedCloudState=h.state(); assert.equal(h.window.auditPumpRebuildTaskDuplication().repairSafe,false,"multiple inventory records block repair"); }
  { const h=harness(); h.window.inventory[1].qty=1; h.window.__lastLoadedCloudState=h.state(); const audit=h.window.auditPumpRebuildTaskDuplication(); assert.match(audit.refusalReasons.join(" "),/authoritative configuration/); assert.deepEqual(Array.from(audit.inventoryConfigurationMismatchPaths),["inventory.qty"]); }
  {
    const criticalFields={id:"wrong",name:"Wrong",linkedTaskId:"wrong",qty:1,qtyNew:1,qtyOld:1,price:1,pn:"x",folderId:"x",unit:"ea",link:"x",note:"x"};
    for (const [field,value] of Object.entries(criticalFields)){ const h=harness(); h.window.inventory[1][field]=value; h.window.__lastLoadedCloudState=h.state(); assert.ok(h.window.auditPumpRebuildTaskDuplication().inventoryConfigurationMismatchPaths.includes(`inventory.${field}`),`${field} is diagnosed`); }
  }
  { const h=harness(); h.window.inventory[1].extraLegitimateField="cloud-value"; h.window.__lastLoadedCloudState=h.state(); assert.equal(h.window.auditPumpRebuildTaskDuplication().repairSafe,true,"cloud-matched extra fields are retained and accepted"); }
  { const h=harness(); h.window.__lastLoadedCloudState.inventory[1]=Object.fromEntries(Object.entries(h.window.__lastLoadedCloudState.inventory[1]).reverse()); const audit=h.window.auditPumpRebuildTaskDuplication(); assert.equal(audit.inventoryBaselineMatched,true,"object insertion order is not a data mismatch"); assert.equal(audit.repairSafe,true); }
  { const h=harness(); h.window.inventory[1].note="changed"; const audit=h.window.auditPumpRebuildTaskDuplication(); assert.equal(audit.inventoryBaselineMatched,false); assert.ok(audit.baselineMismatchPaths.includes("inventory[1].note")); }
  { const h=harness(); h.window.inventory[1].nonTarget="changed"; const audit=h.window.auditPumpRebuildTaskDuplication(); assert.equal(audit.authoritativeBaselineMatched,false); assert.ok(audit.baselineMismatchPaths.includes("inventory[1].nonTarget")); }
  { const h=harness(); h.window.tasksInterval[0].cat="changed"; const audit=h.window.auditPumpRebuildTaskDuplication(); assert.equal(audit.tasksIntervalBaselineMatched,false); assert.ok(audit.baselineMismatchPaths.includes("tasksInterval[0].cat")); }
  { const h=harness(); h.window.inventory.push({id:"changed"}); assert.match((await h.window.repairExactPumpRebuildTaskDuplication()).refusedReason,/preconditions/); }
  {
    const h=harness(); const beforeTasks=h.state().tasksInterval; const beforeInventory=h.state().inventory;
    h.context.saveCloudNow=async()=>({saved:false,stateWriteAttempted:false,stateWriteCompleted:false,error:"pre-write"});
    const result=await h.window.repairExactPumpRebuildTaskDuplication();
    assert.equal(result.repaired,false); assert.deepEqual(h.window.tasksInterval,beforeTasks); assert.deepEqual(h.window.inventory,beforeInventory,"definite pre-write failure restores inventory");
  }
  {
    const h=harness(); let saves=0; h.context.saveCloudNow=async()=>{ saves++; return {saved:false,stateWriteAttempted:true,stateWriteCompleted:false,indeterminate:true}; };
    const result=await h.window.repairExactPumpRebuildTaskDuplication();
    assert.equal(saves,1,"indeterminate write is never retried"); assert.equal(result.saveIndeterminate,true);
    assert.equal(h.window.tasksInterval.length,1,"indeterminate write is not rolled back"); assert.equal(h.window.inventory[1].linkedTaskId,"pump_rebuild_msnpt6hi");
  }
  {
    const h=harness(); h.context.exportJsonDownload=()=>{ h.window.inventory[1].qty=9; return true; };
    const result=await h.window.repairExactPumpRebuildTaskDuplication();
    assert.match(result.refusedReason,/authorization became stale/); assert.equal(result.saveAttempted,false,"pre-mutation refusal never saves");
    assert.equal(result.authorizationConsumed,false,"failed validation does not consume"); assert.ok(result.authorizationFailureStage); assert.equal(h.window.tasksInterval.length,2,"failed validation does not mutate tasks"); assert.equal(h.window.inventory[1].linkedTaskId,h.duplicate.id,"failed validation does not mutate inventory");
  }

  const calendar=fs.readFileSync("js/calendar.js","utf8");
  const restore=calendar.slice(calendar.indexOf("function restoreCriticalIntervalTasks"),calendar.indexOf("function renderCalendar"));
  const ctask=task("pump_rebuild_msnpt6hi"); let restored=0;
  const ctx={ window:{tasksInterval:[ctask],deletedItems:[{id:"trash",type:"task",payload:task("pump_rebuild_msnpt6gs")}],normalizeMaintenanceTaskIdentity:t=>({equivalentKey:`pump rebuild|${t.mode}|${t.interval}`})}, Set, String, Number, Array, isInstanceTask:()=>false,isTemplateTask:()=>false,restoreDeletedItem:()=>{restored++;return {ok:true};} };
  vm.createContext(ctx); vm.runInContext(restore+"\nthis.restoreCriticalIntervalTasks=restoreCriticalIntervalTasks",ctx);
  assert.equal(ctx.restoreCriticalIntervalTasks(),false); assert.equal(ctx.restoreCriticalIntervalTasks(),false); assert.equal(restored,0,"active equivalent prevents deleted-ID resurrection");
  const renderHead=calendar.slice(calendar.indexOf("function renderCalendar"),calendar.indexOf("const container",calendar.indexOf("function renderCalendar")));
  assert.doesNotMatch(renderHead,/restoreCriticalIntervalTasks|saveCloudDebounced/,"repeated rendering cannot mutate/restore/save tasks");
  const renderer=fs.readFileSync("js/renderers.js","utf8");
  assert.match(renderer,/const intervalTasks = dedupeEquivalentTasks\(intervalTasksAll\.filter\(isTaskActive\)\)/,"cost analysis collapses equivalent task identities");
  console.log("pump rebuild duplication deterministic tests passed");
})().catch(e=>{console.error(e);process.exitCode=1;});
