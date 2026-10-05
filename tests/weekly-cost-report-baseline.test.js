"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const integrity = require("../js/maintenanceCalendarIntegrity");
const clone = value => structuredClone(value);

const authoritative = () => ({
  syncMeta: { rev: 7 }, maintenanceTasksV2: [], maintenanceCalendarInstancesV2: [], maintenanceOccurrencesV2: [],
  inventory: [{ id: "retained-stock", qtyNew: 9 }],
  weeklyCostReports: [{ weekKey: "2026-09-28", weekStartISO: "2026-09-28", weekEndISO: "2026-10-04",
    totalCutCost: 125, cutItems: [{ id: "retained-cut", cost: 125 }], operatorNote: "Preserve this report" }]
});
const differences = [
  ["report total", state => { state.weeklyCostReports[0].totalCutCost++; }],
  ["report item", state => { state.weeklyCostReports[0].cutItems[0].cost++; }],
  ["week key", state => { state.weeklyCostReports[0].weekKey = "2026-10-05"; }],
  ["week date", state => { state.weeklyCostReports[0].weekStartISO = "2026-10-05"; }],
  ["report note", state => { state.weeklyCostReports[0].operatorNote = "Unsaved operator edit"; }],
  ["missing report", state => { state.weeklyCostReports = []; }],
  ["extra report", state => { state.weeklyCostReports.push(clone(state.weeklyCostReports[0])); }],
  ["unrelated inventory", state => { state.inventory[0].qtyNew++; }]
];
for (const [name, change] of differences) test(`maintenance baseline still rejects meaningful drift: ${name}`, async () => {
  const cloud = authoritative(), local = clone(cloud);
  change(local);
  const before = clone(local);
  const run = integrity.createMutationRunner({
    state: () => clone(local), readCloud: async () => clone(cloud), loadedRevision: () => 7,
    canWrite: () => true, save: () => assert.fail("Must not save over unexplained drift"),
    apply: () => assert.fail("Must not alter existing records"), suspend: () => assert.fail("No mutation occurred")
  });
  const result = await run(() => assert.fail("Must reject before constructing maintenance records"));
  assert.equal(result.saved, false);
  assert.equal(result.error, "Maintenance baseline changed. Reload before retrying.");
  assert.deepEqual(local, before);
  assert.deepEqual(cloud, authoritative());
});
