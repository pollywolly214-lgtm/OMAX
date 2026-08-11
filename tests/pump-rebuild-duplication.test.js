"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("js/maintenance-duplication.js", "utf8");
function task(id, history=[]){ return { id, name:"Pump Rebuild", mode:"interval", cat:"root", interval:500, manualHistory:history, completedDates:[] }; }
function harness(overrides={}){
  const imported = id => ({ dateISO:"2025-01-01", import_event_id:id, payload:{ exact:id } });
  const canonical = task("pump_rebuild_msnpt6hi", [imported("OMAX-2067268-302701-01"), imported("OMAX-2070032-302701-01")]);
  const duplicate = task("pump_rebuild_msnpt6gs");
  const window = Object.assign({ tasksInterval:[canonical, duplicate], tasksAsReq:[], inventory:[], deletedItems:[{ payload:{ name:"Pump Rebuild" }, linkedTaskId:duplicate.id }], maintenanceTasksV2:[], maintenanceCalendarInstancesV2:[], maintenanceOccurrencesV2:[] }, overrides);
  const state = ()=>structuredClone({ tasksInterval:window.tasksInterval, tasksAsReq:window.tasksAsReq, inventory:window.inventory, deletedItems:window.deletedItems, maintenanceTasksV2:window.maintenanceTasksV2, maintenanceCalendarInstancesV2:window.maintenanceCalendarInstancesV2, maintenanceOccurrencesV2:window.maintenanceOccurrencesV2 });
  window.__lastLoadedCloudState = state();
  const context = { window, structuredClone, JSON, Date, setTimeout, snapshotState:state, exportJsonDownload:()=>true, saveCloudNow:async()=>({ saved:true, stateWriteAttempted:true, stateWriteCompleted:true }) };
  vm.createContext(context); vm.runInContext(source, context);
  return { window, context, canonical, duplicate, state };
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
    const beforeHistory=structuredClone(h.canonical.manualHistory); const beforeV2=structuredClone([h.window.maintenanceTasksV2,h.window.maintenanceCalendarInstancesV2,h.window.maintenanceOccurrencesV2]);
    const result=await h.window.repairExactPumpRebuildTaskDuplication();
    assert.equal(result.repaired,true); assert.deepEqual(h.window.tasksInterval.map(x=>x.id),["pump_rebuild_msnpt6hi"]);
    assert.deepEqual(h.canonical.manualHistory,beforeHistory,"both imported events stay byte-for-byte");
    assert.deepEqual([h.window.maintenanceTasksV2,h.window.maintenanceCalendarInstancesV2,h.window.maintenanceOccurrencesV2],beforeV2);
    assert.deepEqual(h.window.deletedItems,[{ payload:{ name:"Pump Rebuild" }, linkedTaskId:"pump_rebuild_msnpt6gs" }],"trash lifecycle entry is not rewritten");
  }
  { const h=harness(); h.duplicate.manualHistory.push({dateISO:"2020-01-01"}); h.window.__lastLoadedCloudState=h.state(); assert.match((await h.window.repairExactPumpRebuildTaskDuplication()).refusedReason,/preconditions/); }
  { const h=harness(); h.window.inventory.push({ linkedTaskId:h.duplicate.id }); h.window.__lastLoadedCloudState=h.state(); assert.match((await h.window.repairExactPumpRebuildTaskDuplication()).refusedReason,/live-reference/); }
  { const h=harness(); h.window.inventory.push({id:"changed"}); assert.match((await h.window.repairExactPumpRebuildTaskDuplication()).refusedReason,/baseline/); }

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
