"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const costs = require("../js/cutCostFeedback");
const initial = () => ({ tasksInterval: [{ id: "t", price: null, downtimeHours: null, manualHistory: [] }], tasksAsReq: [], maintenanceTasksV2: [], maintenanceOccurrencesV2: [] });
const candidate = (index, extra = {}) => ({ taskId: "t", dateISO: "2026-02-15", historySourceTaskId: "t", historyField: "manualHistory", historyIndex: index, sourceEventKey: `manual:t:${index}`, ...extra });
test("a scheduled-only V2 root cannot erase a legacy expense", () => {
  const state = initial(); state.tasksInterval[0].manualHistory = [{ dateISO: "2026-02-15", status: "completed", partsCostSnapshot: 10, hours: 1 }];
  state.maintenanceTasksV2 = [{ id: "v", legacyTaskId: "t" }]; state.maintenanceOccurrencesV2 = [{ id: "scheduled", taskId: "v", eventType: "scheduled", effectiveDateISO: "2026-02-15" }];
  const result = costs.maintenanceRows([candidate(0)], state); assert.equal(result.length, 1); assert.equal(result[0].totalCost, 40);
});
test("anonymous same-day events keep their own source snapshots and each expense", () => {
  const state = initial(); state.tasksInterval[0].manualHistory = [{ dateISO: "2026-02-15", partsCostSnapshot: 10, hours: 1 }, { dateISO: "2026-02-15", partsCostSnapshot: 20, hours: 2 }];
  const result = costs.maintenanceRows([candidate(0), candidate(1)], state); assert.deepEqual(result.map(row => row.totalCost), [40, 80]);
});
test("legacy instance defaults survive template association and stay classified as estimated", () => {
  const state = initial(); state.tasksInterval.push({ id: "instance", templateId: "t", price: 12, downtimeHours: .5, completedDates: ["2026-02-15"] });
  const result = costs.maintenanceRows([candidate(0, { historySourceTaskId: "instance", historyField: "completedDates" })], state);
  assert.equal(result[0].totalCost, 27); assert.equal(result[0].costIncomplete, false); assert.equal(result[0].costEstimated, true);
});
test("two source tasks with the same template/date keep separate identified costs and hours overrides", () => {
  const state = initial();
  state.tasksInterval.push({ id: "a", templateId: "t", price: 10, occurrenceHours: { "2026-02-15": 1 } }, { id: "b", templateId: "t", price: 20, occurrenceHours: { "2026-02-15": 2 } });
  const result = costs.maintenanceRows([candidate(0, { historySourceTaskId: "a", sourceEventKey: "a", historyField: "completedDates" }), candidate(0, { historySourceTaskId: "b", sourceEventKey: "b", historyField: "completedDates" })], state);
  assert.deepEqual(result.map(row => row.totalCost), [40, 80]);
});
test("explicit import mirrors collapse; separate same-day imports and V2 roots survive", () => {
  const state = initial(); state.tasksInterval[0].manualHistory = [{ dateISO: "2026-02-15", import_event_id: "same", partsCostSnapshot: 10, hours: 1 }, { dateISO: "2026-02-15", import_event_id: "different", partsCostSnapshot: 20, hours: 2 }];
  state.maintenanceTasksV2 = [{ id: "v", legacyTaskId: "t" }];
  state.maintenanceOccurrencesV2 = [{ id: "done", rootOccurrenceId: "root", taskId: "v", instanceId: "i", eventType: "completed", import_event_id: "same", effectiveDateISO: "2026-02-15" }];
  const vrow = { taskId: "v", instanceId: "i", sourceSystem: "v2", rootOccurrenceId: "root", dateISO: "2026-02-15" };
  const streams = [{ ...vrow, partsCostSnapshot: 10, loggedHours: 1 }];
  const audit = [], result = costs.maintenanceRows([candidate(0, { historyEventId: "same", historyImportEventId: "same" }), candidate(1, { historyEventId: "different", historyImportEventId: "different" }), vrow, vrow], state, streams, audit);
  assert.deepEqual(result.map(row => row.totalCost), [80, 40]);
  assert.equal(audit.filter(row => !row.normalizationIncluded).length, 2); assert.match(audit[0].exclusionReason, /Mirrored/); assert.match(audit.at(-1).exclusionReason, /Duplicate/);
});
test("incomplete and explicit zero costs retain different classifications and no fabricated full amount", () => {
  const state = initial(); state.tasksInterval[0].manualHistory = [{ dateISO: "2026-02-15" }, { dateISO: "2026-02-15", partsCostSnapshot: 0, hours: 0 }];
  const audit = [], before = structuredClone(state), result = costs.maintenanceRows([candidate(0), candidate(1)], state, [], audit);
  assert.equal(result[0].costIncomplete, false); assert.equal(result[0].costFields.parts.source, "Blank setting assumed zero"); assert.equal(audit[0].totalCost, 0);
  assert.equal(result[1].costIncomplete, false); assert.equal(result[1].totalCost, 0); assert.equal(audit[1].totalCost, 0); assert.deepEqual(state, before);
});
test("a removed sibling instance cannot suppress another source task's completion", () => {
  const state = initial(); state.tasksInterval[0].manualHistory = [{ dateISO: "2026-02-15", partsCostSnapshot: 10, hours: 1 }];
  state.tasksInterval.push({ id: "other", templateId: "t", removedOccurrences: ["2026-02-15"] });
  assert.equal(costs.maintenanceRows([candidate(0)], state).length, 1);
});
test("a separately identified removed same-day record cannot erase a completed event", () => {
  const state = initial(); state.tasksInterval[0].manualHistory = [
    { id: "keep", dateISO: "2026-02-15", status: "completed", partsCostSnapshot: 10, hours: 1 },
    { id: "removed", dateISO: "2026-02-15", status: "removed" }
  ];
  const result = costs.maintenanceRows([candidate(0, { historyEventId: "keep" })], state);
  assert.equal(result.length, 1); assert.equal(result[0].totalCost, 40);
});
