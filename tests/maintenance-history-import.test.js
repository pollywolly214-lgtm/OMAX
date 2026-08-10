"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const rendererSource = fs.readFileSync("js/renderers.js", "utf8");
const start = rendererSource.indexOf("function normalizeMaintenanceImportTaskName");
const end = rendererSource.indexOf("function cleanupMi02cTinyMaintenanceImportRows");
assert.ok(start >= 0 && end > start, "importer source section is available");

function createHarness(saveCloudNow){
  const window = {
    tasksInterval:[{ id:"filter", name:"RO Micron Filter", manualHistory:[{ dateISO:"2024-01-01", status:"completed", note:"keep" }], completedDates:["2024-01-01"] }],
    tasksAsReq:[], maintenanceTasksV2:[{ id:"v2-task" }],
    maintenanceCalendarInstancesV2:[{ id:"v2-instance" }],
    maintenanceOccurrencesV2:[], cuttingJobs:[{ id:"job" }], completedCuttingJobs:[],
    settingsFolders:[{ id:"folder" }], inventory:[{ id:"stock" }], inventoryFolders:[],
    inventoryMaterials:[], receiptTrackerWeeks:[], orderRequests:[], dailyCutHours:[], garnetCleanings:[]
  };
  const context = {
    window, console, Date, Set, Map, JSON, Object, Array, String, Number, RegExp,
    structuredClone, saveCloudNow,
    exportJsonDownload:()=>true,
    getCurrentAppStateForDiagnostics:()=>structuredClone(window)
  };
  vm.createContext(context);
  vm.runInContext(rendererSource.slice(start, end) + "\nthis.api={applyMaintenanceHistoryImportRows,buildMaintenanceHistoryImportPreview,countMaintenanceHistoryImportProtectedState,findMaintenanceHistoryImportDrops};", context);
  return { window, api:context.api };
}

function row(id="event-1", task="RO Micron Filter", date="2025-02-03"){
  return { import_event_id:id, scheduled_maintenance_date:date, exact_website_task:task };
}

async function run(){
  {
    const h = createHarness(async()=>({ saved:true, stateWriteCompleted:true, path:"workspaces/test/app/state" }));
    const beforeV2 = structuredClone([h.window.maintenanceTasksV2, h.window.maintenanceCalendarInstancesV2, h.window.maintenanceOccurrencesV2]);
    const beforeDates = structuredClone(h.window.tasksInterval[0].completedDates);
    const result = await h.api.applyMaintenanceHistoryImportRows(h.api.buildMaintenanceHistoryImportPreview([row()]));
    assert.equal(result.importCompleted, true);
    assert.equal(result.saveCompleted, true);
    assert.deepEqual(Array.from(result.importedImportEventIds), ["event-1"]);
    assert.deepEqual([h.window.maintenanceTasksV2, h.window.maintenanceCalendarInstancesV2, h.window.maintenanceOccurrencesV2], beforeV2, "V2 state is untouched");
    assert.deepEqual(h.window.tasksInterval[0].completedDates, beforeDates, "completedDates is untouched");
    assert.deepEqual(h.window.tasksInterval[0].manualHistory[0], { dateISO:"2024-01-01", status:"completed", note:"keep" }, "existing history remains byte-for-byte ordered");
    const reimport = await h.api.applyMaintenanceHistoryImportRows(h.api.buildMaintenanceHistoryImportPreview([row()]));
    assert.equal(reimport.stats.duplicate, 1);
    assert.equal(reimport.saveAttempted, false, "successful IDs become duplicate/no-op");
  }
  for (const save of [
    async()=>({ saved:false, stateWriteAttempted:false, stateWriteCompleted:false, error:"blocked" }),
    async()=>{ throw new Error("before write"); }
  ]){
    const h = createHarness(save);
    const original = structuredClone(h.window.tasksInterval[0].manualHistory);
    const result = await h.api.applyMaintenanceHistoryImportRows(h.api.buildMaintenanceHistoryImportPreview([row()]));
    assert.equal(result.saveCompleted, false);
    assert.equal(result.rolledBack, true);
    assert.deepEqual(h.window.tasksInterval[0].manualHistory, original, "failed save restores exact history");
  }
  {
    const h = createHarness(async()=>({ saved:true, stateWriteCompleted:true, warnings:["metadata failed"] }));
    const result = await h.api.applyMaintenanceHistoryImportRows(h.api.buildMaintenanceHistoryImportPreview([row()]));
    assert.equal(result.saveCompleted, true);
    assert.equal(result.rolledBack, false, "auxiliary warning does not roll back confirmed write");
    assert.deepEqual(Array.from(result.saveWarnings), ["metadata failed"]);
  }
  {
    const h = createHarness(async()=>({ saved:false, stateWriteAttempted:true, stateWriteCompleted:false, indeterminate:true, error:"unknown outcome" }));
    const result = await h.api.applyMaintenanceHistoryImportRows(h.api.buildMaintenanceHistoryImportPreview([row()]));
    assert.equal(result.saveIndeterminate, true);
    assert.equal(result.rolledBack, false, "indeterminate writes are not retried or rolled back");
  }
  {
    const h = createHarness(async()=>({ saved:true, stateWriteCompleted:true }));
    h.window.maintenanceOccurrencesV2.push({ import_event_id:"existing-v2" });
    const rows = [row("same"), row("same", "RO Micron Filter", "2025-02-04"), row("existing-v2")];
    const preview = h.api.buildMaintenanceHistoryImportPreview(rows);
    assert.deepEqual(Array.from(preview, item=>item.status), ["ready", "duplicate", "duplicate"]);
    const result = await h.api.applyMaintenanceHistoryImportRows(preview);
    assert.equal(result.stats.imported, 1);
    assert.equal(result.stats.duplicate, 2);
  }
  {
    const h = createHarness(async()=>({ saved:true, stateWriteCompleted:true }));
    h.window.tasksInterval.push({ id:"second", name:"RO Micron Filter", manualHistory:[] });
    const preview = h.api.buildMaintenanceHistoryImportPreview([
      row("ambiguous"), row("excluded", "Mixing Tube Rotation"), row("invalid", "RO Micron Filter", "2025-02-30"), row("unresolved", "Pump Rebuild")
    ]);
    assert.deepEqual(Array.from(preview, item=>item.status), ["ambiguous", "excluded", "invalid date", "unresolved"]);
    const result = await h.api.applyMaintenanceHistoryImportRows(preview);
    assert.equal(result.saveAttempted, false);
    assert.equal(result.stats.imported, 0);
  }
  {
    const h = createHarness(async()=>({ saved:true, stateWriteCompleted:true }));
    const before = h.api.countMaintenanceHistoryImportProtectedState();
    h.window.inventory.length = 0;
    const after = h.api.countMaintenanceHistoryImportProtectedState();
    assert.deepEqual(Array.from(h.api.findMaintenanceHistoryImportDrops(before, after)), ["inventory"], "protected collection reduction is detected");
  }
  const wireSection = rendererSource.slice(rendererSource.indexOf("function wireMaintenanceHistoryImportTool"), rendererSource.indexOf("function renderSettings"));
  assert.match(wireSection, /if \(importRunning\) return;/, "concurrent import attempts are ignored");
  assert.match(wireSection, /finally\s*{[\s\S]*setImportControlsLocked\(false\)/, "controls restore in finally");
  assert.match(wireSection, /if \(result\.saveCompleted === true\)[\s\S]*buildMaintenanceHistoryImportPreview/, "preview rebuild is success-only");
  console.log("maintenance history importer deterministic tests passed");
}

run().catch(error => { console.error(error); process.exitCode = 1; });
