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
  const sharedInventory={ id:"inventory_msnpt6ic", name:"Pump Rebuild", linkedTaskId:duplicate.id, qty:0, qtyNew:0, price:null, pn:"", folderId:null };
  const window = Object.assign({ tasksInterval:[canonical, duplicate], tasksAsReq:[], inventory:[{id:"first",name:"Other"},sharedInventory,{id:"last",name:"Other 2"}], deletedItems:[{ payload:{ name:"Pump Rebuild" }, linkedTaskId:duplicate.id }], maintenanceTasksV2:[], maintenanceCalendarInstancesV2:[], maintenanceOccurrencesV2:[] }, overrides);
  const state = ()=>structuredClone({ tasksInterval:window.tasksInterval, tasksAsReq:window.tasksAsReq, inventory:window.inventory, deletedItems:window.deletedItems, maintenanceTasksV2:window.maintenanceTasksV2, maintenanceCalendarInstancesV2:window.maintenanceCalendarInstancesV2, maintenanceOccurrencesV2:window.maintenanceOccurrencesV2 });
  window.__lastLoadedCloudState = state();
  const context = { window, structuredClone, JSON, Date, setTimeout, snapshotState:state, exportJsonDownload:()=>true, saveCloudNow:async()=>({ saved:true, stateWriteAttempted:true, stateWriteCompleted:true }) };
  vm.createContext(context); vm.runInContext(source, context);
  return { window, context, canonical, duplicate, sharedInventory, state };
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
    assert.deepEqual({...audit.inventoryRelinkPlan},{inventoryId:"inventory_msnpt6ic",fromTaskId:"pump_rebuild_msnpt6gs",toTaskId:"pump_rebuild_msnpt6hi"});
    const beforeTasks=structuredClone(h.window.tasksInterval); const beforeInventory=structuredClone(h.window.inventory); const beforeDeleted=structuredClone(h.window.deletedItems);
    const beforeHistory=structuredClone(h.canonical.manualHistory); const beforeV2=structuredClone([h.window.maintenanceTasksV2,h.window.maintenanceCalendarInstancesV2,h.window.maintenanceOccurrencesV2]);
    const result=await h.window.repairExactPumpRebuildTaskDuplication();
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
    const h=harness(); const first={id:"first-task",name:"Other",interval:100}; const last={id:"last-task",name:"Other 2",interval:200};
    h.window.tasksInterval.splice(0,0,first); h.window.tasksInterval.push(last); h.window.__lastLoadedCloudState=h.state();
    await h.window.repairExactPumpRebuildTaskDuplication();
    assert.deepEqual(h.window.tasksInterval.map(item=>item.id),["first-task","pump_rebuild_msnpt6hi","last-task"],"every retained task keeps its ordering");
  }
  { const h=harness(); h.duplicate.manualHistory.push({dateISO:"2020-01-01"}); h.window.__lastLoadedCloudState=h.state(); assert.match((await h.window.repairExactPumpRebuildTaskDuplication()).refusedReason,/preconditions/); }
  { const h=harness(); h.window.inventory.push({ id:"another", linkedTaskId:h.duplicate.id }); h.window.__lastLoadedCloudState=h.state(); const audit=h.window.auditPumpRebuildTaskDuplication(); assert.equal(audit.repairSafe,false); assert.match(audit.refusalReasons.join(" "),/additional live references/); }
  { const h=harness(); h.canonical.inventoryId="different"; h.window.__lastLoadedCloudState=h.state(); assert.equal(h.window.auditPumpRebuildTaskDuplication().repairSafe,false,"different inventory ID blocks repair"); }
  { const h=harness(); h.window.inventory.push(structuredClone(h.sharedInventory)); h.window.__lastLoadedCloudState=h.state(); assert.equal(h.window.auditPumpRebuildTaskDuplication().repairSafe,false,"multiple inventory records block repair"); }
  { const h=harness(); h.window.inventory[1].qty=1; h.window.__lastLoadedCloudState=h.state(); assert.match(h.window.auditPumpRebuildTaskDuplication().refusalReasons.join(" "),/authoritative configuration/); }
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
    assert.match(result.refusedReason,/authorization became stale/); assert.equal(result.saveAttempted,false,"authorization cannot be reused after state changes");
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
