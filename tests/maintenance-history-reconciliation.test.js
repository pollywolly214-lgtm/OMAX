"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const fixture = require("./fixtures/maintenance-history");
const integrity = require("../js/maintenanceCalendarIntegrity");
const calendar = fs.readFileSync("js/calendar.js", "utf8"), core = fs.readFileSync("js/core.js", "utf8"), renderer = fs.readFileSync("js/renderers.js", "utf8");
const plain = value => JSON.parse(JSON.stringify(value));
class FixedDate extends Date {
  constructor(...args){ super(...(args.length ? args : ["2026-10-21T17:00:00Z"])); }
  static now(){ return new Date("2026-10-21T17:00:00Z").getTime(); }
}
function freeze(value){ if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function harness(state){
  const window = structuredClone(state);
  window.OMAXMaintenanceCalendarIntegrity = integrity;
  const context = vm.createContext({ window, structuredClone, Date: FixedDate, console,
    getConfiguredDailyHours: () => 8, getCurrentMachineHours: () => 100, nextDue: () => null });
  vm.runInContext(core.slice(core.indexOf("function parseDateLocal("), core.indexOf("function isWeekendDate("))
    + core.slice(core.indexOf("function resolveTaskVariant("), core.indexOf("function ensureTaskVariant(")), context);
  vm.runInContext(calendar, context);
  vm.runInContext(renderer.slice(renderer.indexOf("function ensureTaskManualHistory("), renderer.indexOf("function collectTaskHistoryDates(")), context);
  return { window, context, projection: () => plain(context.buildMaintenanceCalendarEvents()), history: taskId => plain(context.buildMaintenanceTaskHistory(taskId)) };
}

test("one scheduled calendar root appears without a cost row or prior calendar render", () => {
  const state = fixture.initial(); fixture.oneTime(state, "one"); const h = harness(state);
  assert.equal(h.history("task-a").length, 1); assert.equal(h.history("task-a")[0].status, "scheduled");
  assert.equal(h.window.__calendarV2OneTimeLookup, undefined);
});
test("completed, scheduled, moved, recurring, legacy and same-day events reconcile by identity", () => {
  const h = harness(fixture.mixed()), rows = h.history("task-a"), projected = Object.values(h.projection().dueMap).flat();
  assert.equal(rows.length, 9); assert.equal(new Set(rows.map(row => row.key)).size, rows.length);
  assert.equal(rows.filter(row => row.dateISO === "2026-10-21").length, 3);
  assert.equal(rows.find(row => row.rootOccurrenceId === "done").hours, 0.25);
  assert.equal(rows.find(row => row.rootOccurrenceId === "scheduled").hours, 0);
  assert.deepEqual(rows.find(row => row.rootOccurrenceId === "moved").dateISO, "2026-10-22");
  assert.equal(rows.find(row => row.rootOccurrenceId === "moved").isMoved, true);
  const legacy = rows.filter(row => row.sourceSystem === "legacy"); assert.equal(legacy.length, 1); assert.equal(legacy[0].hours, 12);
  assert.equal(projected.filter(event => event.type === "task").length, 2); // Two duration chips, one history occurrence.
  // All projected roots explicitly owned by A, at all dates generated as of the fixed clock.
  const expected = projected.filter(event => event.type !== "task" && (event.taskId === "v2-a" || h.projection().oneTimeLookup[event.occurrenceId]?.taskId === "v2-a"))
    .map(event => event.occurrenceId || event.id).sort();
  assert.deepEqual(rows.filter(row => row.sourceSystem === "v2").map(row => row.rootOccurrenceId).sort(), expected);
});
test("multiple completions and reopening use current lifecycle, not completion existence", () => {
  const state = fixture.initial(); const one = fixture.oneTime(state, "one"), two = fixture.oneTime(state, "two");
  fixture.action(state, one, "completed"); fixture.action(state, two, "completed");
  assert.equal(harness(state).history("task-a").filter(row => row.status === "completed").length, 2);
  fixture.action(state, one, "uncompleted");
  assert.equal(harness(state).history("task-a").find(row => row.rootOccurrenceId === "one").status, "scheduled");
  fixture.action(state, one, "removed"); fixture.action(state, two, "skipped");
  assert.deepEqual(harness(state).history("task-a"), []);
});
test("renames, identical visible names and calendar-only tasks do not change ownership", () => {
  const state = fixture.mixed(), before = harness(state).history("task-a").map(row => row.key);
  state.tasksInterval[0].name = "Renamed"; state.maintenanceTasksV2[0].name = "Unrelated-looking name";
  const h = harness(state); assert.deepEqual(h.history("task-a").map(row => row.key), before);
  assert.deepEqual(h.history("task-b").map(row => row.rootOccurrenceId), ["b-root"]);
  assert.deepEqual(h.history("missing"), []);
});
test("same-name tasks of the same maintenance type remain separate", () => {
  const state = fixture.initial();
  state.tasksInterval.push({ ...state.tasksAsReq.pop(), mode: "interval", interval: 40 });
  fixture.oneTime(state, "a"); fixture.oneTime(state, "b", { taskId: "v2-b" });
  const h = harness(state);
  assert.deepEqual(h.history("task-a").map(row => row.rootOccurrenceId), ["a"]);
  assert.deepEqual(h.history("task-b").map(row => row.rootOccurrenceId), ["b"]);
});
test("conflicting/ambiguous foreign keys are excluded, never linked by name", () => {
  for (const corrupt of [
    state => { state.maintenanceOccurrencesV2[0].taskId = "v2-b"; },
    state => { state.maintenanceCalendarInstancesV2[0].legacyTaskId = "task-b"; },
    state => { state.maintenanceTasksV2.push({ ...state.maintenanceTasksV2[0] }); },
    state => { state.maintenanceCalendarInstancesV2.push({ ...state.maintenanceCalendarInstancesV2[0] }); },
    state => { state.tasksInterval.push({ ...state.tasksInterval[0] }); }
  ]) {
    const state = fixture.initial(); fixture.oneTime(state, "one"); corrupt(state);
    const h = harness(state); assert.deepEqual(h.history("task-a"), []); assert.deepEqual(h.history("task-b"), []);
  }
});
test("explicit instance/event legacy links still work when V2 task metadata is missing", () => {
  const state = fixture.initial(); fixture.oneTime(state, "one", { legacyTaskId: "task-a" }); state.maintenanceTasksV2 = [];
  assert.equal(harness(state).history("task-a").length, 1);
  delete state.maintenanceCalendarInstancesV2[0].legacyTaskId;
  assert.equal(harness(state).history("task-a").length, 0);
});
test("separate repeat instances on the same date stay separate, with bounded future projection", () => {
  const state = fixture.initial(); fixture.repeat(state, "repeat-1"); fixture.repeat(state, "repeat-2");
  const h = harness(state), rows = h.history("task-a");
  assert.equal(rows.length, 6); assert.equal(rows.filter(row => row.dateISO === "2026-10-21").length, 2);
  assert.ok(rows.every(row => row.dateISO <= "2027-01-19"));
  assert.equal(state.maintenanceOccurrencesV2.length, 0); // Virtual dates are not stored events.
});
test("count-based slot/date compatibility emits one canonical root per occurrence", () => {
  const state = fixture.initial(); fixture.repeat(state, "count", { endType: "after_count", endCount: 2 });
  fixture.action(state, { id: "repeat:count:2026-10-21", instanceId: "count", taskId: "v2-a", effectiveDateISO: "2026-10-21" }, "completed");
  const rows = harness(state).history("task-a"); assert.equal(rows.length, 2);
  assert.equal(rows[0].rootOccurrenceId, "repeat:count:2026-10-21"); assert.equal(rows[0].status, "completed");
});
test("moved repeat and stopped-chain completion retain original root and business date", () => {
  const state = fixture.initial(), instance = fixture.repeat(state, "stopped"); instance.status = "stopped";
  const root = { id: "repeat:stopped:2025-01-01", instanceId: instance.id, taskId: "v2-a", effectiveDateISO: "2025-01-01" };
  fixture.action(state, root, "moved", { toDateISO: "2025-02-01" }); fixture.action(state, root, "completed");
  const rows = harness(state).history("task-a"); assert.equal(rows.length, 1); assert.equal(rows[0].dateISO, "2025-02-01");
  assert.equal(rows[0].originalDateISO, "2025-01-01"); assert.equal(rows[0].status, "completed");
});
test("machine-hour prediction and recurrence ending retain calendar bounds", () => {
  const state = fixture.initial(); fixture.repeat(state, "hours", { basis: "machine_hours", intervalHours: 40 });
  const rows = harness(state).history("task-a"); assert.equal(rows.length, 5); assert.ok(rows.every(row => row.dateISO <= "2027-01-19"));
  const bounded = fixture.initial(); fixture.repeat(bounded, "until", { endType: "on_date", endDateISO: "2026-10-28" });
  assert.deepEqual(harness(bounded).history("task-a").map(row => row.dateISO), ["2026-10-21", "2026-10-28"]);
});
test("legacy template and As Required evidence is retained and labeled without inventing completion", () => {
  const state = fixture.initial(); state.tasksInterval[0].completedDates = ["2025-01-01"];
  state.tasksInterval[0].manualHistory = [{ dateISO: "2025-01-01", status: "completed" }, { dateISO: "2026-12-01", status: "scheduled" }, { dateISO: "2026-12-02", status: "removed" }];
  state.tasksAsReq[0].completedDates = ["2026-09-01"];
  const h = harness(state), rows = h.history("task-a");
  assert.equal(rows.length, 2); assert.equal(rows[0].source, "legacy history"); assert.equal(rows[0].status, "completed");
  assert.equal(rows[1].status, "scheduled"); assert.equal(h.history("task-b")[0].source, "calendar");
});
test("legacy logged status and manual notes are retained without inferring completion", () => {
  const state = fixture.initial(); state.tasksInterval[0].calendarDateISO = "2026-10-01";
  state.tasksInterval[0].manualHistory = [{ dateISO: "2026-10-01", status: "logged", note: "Recorded work" }];
  state.tasksAsReq[0].completedDates = ["2026-10-02"];
  state.tasksAsReq[0].manualHistory = [{ dateISO: "2026-10-02", status: "completed", note: "Manual note" }];
  const h = harness(state);
  assert.equal(h.history("task-a")[0].status, "logged"); assert.equal(h.history("task-a")[0].note, "Recorded work");
  assert.equal(h.history("task-b")[0].note, "Manual note");
});
test("malformed legacy history fields and impossible dates do not fabricate rows or crash history", () => {
  const state = fixture.initial(); state.tasksInterval[0].manualHistory = {}; state.tasksInterval[0].completedDates = "invalid";
  state.tasksInterval[0].calendarDateISO = "2026-02-30";
  const h = harness(state); assert.deepEqual(h.history("task-a"), []);
});
test("repeated reads are mutation-free, accept frozen records and survive serialized reload", () => {
  const h = harness(fixture.mixed()); for (const key of Object.keys(fixture.mixed())) freeze(h.window[key]);
  const before = plain(h.window), first = h.history("task-a");
  assert.deepEqual(h.history("task-a"), first); h.projection(); assert.deepEqual(plain(h.window), before);
  assert.deepEqual(harness(JSON.parse(JSON.stringify(before))).history("task-a"), first);
  assert.ok(first.every(row => !row.dateISO.includes("T")));
});
test("history renderer uses shared event rows, preserves popup controls and never calls persistence", () => {
  const source = renderer.slice(renderer.indexOf("function openMaintenanceTaskHistory("), renderer.indexOf("function renderSettings("));
  assert.match(source, /buildMaintenanceTaskHistory\(t.id\)/); assert.match(source, /data-close/); assert.match(source, /ev.target === modal/);
  assert.doesNotMatch(source, /computeCostModel|saveCloud|persist\(|localStorage|toISOString/);
});
test("popup keeps independent same-day statuses/notes and uses business dates across DST", () => {
  const state = fixture.initial();
  const done = fixture.oneTime(state, "done", { date: "2026-03-07" }); fixture.action(state, done, "completed");
  const later = fixture.oneTime(state, "later", { date: "2026-03-09" }); fixture.action(state, later, "completed");
  fixture.oneTime(state, "still-scheduled", { date: "2026-03-09" });
  const h = harness(state), created = [];
  h.context.document = { createElement: () => ({ setAttribute(){}, addEventListener(){} }), body: { appendChild: node => created.push(node) } };
  vm.runInContext(renderer.slice(renderer.indexOf("function openMaintenanceTaskHistory("), renderer.indexOf("function renderSettings(")), h.context);
  h.context.openMaintenanceTaskHistory(h.window.tasksInterval[0]);
  const html = created[0].innerHTML;
  assert.match(html, /Completion gap: 2 day\(s\)/);
  assert.equal((html.match(/<td>Completed<\/td>/g) || []).length, 2);
  assert.equal((html.match(/<td>Scheduled<\/td>/g) || []).length, 1);
  assert.match(html, /still-scheduled/); assert.match(html, /<td>2 day\(s\)<\/td>/);
  assert.doesNotMatch(html, /data-history-jump="2026-10-21"/); // recordedAt is never an event date.
});
// Optional audit against an exported pre-change calendar, without keeping a
// second production projection implementation in this repository.
if (process.env.OMAX_MHIST_BASELINE_CALENDAR) test("ordinary calendar output exactly matches the pre-change builder", () => {
  const baseline = fs.readFileSync(process.env.OMAX_MHIST_BASELINE_CALENDAR, "utf8");
  const body = baseline.slice(baseline.indexOf("  const splitTaskDuration =", baseline.indexOf("function renderCalendar(){")), baseline.indexOf("window.__maintenanceCalendarProjectedRepeatRows="));
  for (const state of [fixture.mixed(), (() => { const state = fixture.initial(); fixture.repeat(state, "hours", { basis: "machine_hours", intervalHours: 40 }); return state; })()]) {
    const current = harness(state), old = harness(state), before = current.projection();
    vm.runInContext("function oldProjection(){const dueMap={}; const hoursPerDay=configuredTaskDurationDailyHours();" + body + ";return {dueMap,oneTimeLookup};}", old.context);
    assert.deepEqual(before, plain(old.context.oldProjection()));
  }
});
