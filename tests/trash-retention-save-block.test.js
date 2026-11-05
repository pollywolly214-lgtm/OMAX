"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const core = fs.readFileSync("js/core.js", "utf8");

function fn(name){
  const start = core.search(new RegExp("^function " + name + "\\(", "m"));
  assert.ok(start >= 0, name);
  return core.slice(start, core.indexOf("\n}", start) + 2);
}

function harness(entries){
  const window = { deletedItems: structuredClone(entries) };
  const context = vm.createContext({
    window,
    console,
    structuredClone,
    genId: value => "generated_" + value
  });
  vm.runInContext(
    "const TRASH_RETENTION_MS=30*24*60*60*1000;let deletedItems=window.deletedItems;\n" +
    [
      "cloneStructured",
      "computeTrashExpiresAt",
      "buildTrashLabel",
      "normalizeDeletedItem",
      "normalizeDeletedItems",
      "purgeExpiredDeletedItems",
      "listDeletedItems"
    ].map(fn).join("\n") +
    "\nthis.state=()=>({deletedItems,windowDeletedItems:window.deletedItems,visible:listDeletedItems()});",
    context
  );
  return context;
}

test("expired non-maintenance Trash is hidden from the Deleted Items list without being removed from authoritative live state", () => {
  const now = new Date().toISOString();
  const old = "2020-01-01T00:00:00.000Z";
  const entries = [
    { id:"old-job", type:"job", payload:{id:"job-a",name:"Old job"}, meta:{}, label:"Active job: Old job", deletedAt:old },
    { id:"old-folder", type:"job-folder", payload:{id:"folder-a",name:"Old folder"}, meta:{}, label:"Deleted job-folder", deletedAt:old },
    { id:"old-task", type:"task", payload:{id:"task-a",name:"Old task"}, meta:{}, label:"Maintenance task: Old task", deletedAt:old },
    { id:"old-inventory", type:"inventory", payload:{id:"inventory-a",name:"Old inventory"}, meta:{}, label:"Inventory item: Old inventory", deletedAt:old },
    { id:"recent-job", type:"job", payload:{id:"job-b",name:"Recent job"}, meta:{}, label:"Active job: Recent job", deletedAt:now }
  ];

  const h = harness(entries);
  const normalized = h.normalizeDeletedItems(structuredClone(entries));
  assert.equal(normalized.length, entries.length, "normalization must not delete expired authoritative Trash evidence");

  h.deletedItems = normalized;
  h.window.deletedItems = normalized;
  assert.equal(h.purgeExpiredDeletedItems(), false, "retention cleanup must not shrink authoritative Trash");

  const state = h.state();
  assert.equal(state.deletedItems.length, entries.length);
  assert.equal(state.windowDeletedItems.length, entries.length);

  const visibleIds = state.visible.map(entry => entry.id);
  assert.deepEqual(visibleIds.sort(), ["old-inventory","old-task","recent-job"].sort());
  assert.equal(visibleIds.includes("old-job"), false);
  assert.equal(visibleIds.includes("old-folder"), false);
});

test("normalizing an already-expired job archive preserves exact stable identity and payload", () => {
  const entry = {
    id:"trash_job_exact",
    type:"job",
    payload:{id:"job_exact",name:"Exact historical job",manualLogs:[{dateISO:"2026-01-01",completedHours:2}]},
    meta:{source:"fixture"},
    label:"Active job: Exact historical job",
    deletedAt:"2020-01-01T00:00:00.000Z"
  };
  const h = harness([entry]);
  const result = h.normalizeDeletedItem(structuredClone(entry));
  assert.ok(result);
  assert.equal(result.id, entry.id);
  assert.equal(result.type, entry.type);
  assert.deepEqual(structuredClone(result.payload), entry.payload);
  assert.deepEqual(structuredClone(result.meta), entry.meta);
  assert.equal(result.deletedAt, entry.deletedAt);
});
