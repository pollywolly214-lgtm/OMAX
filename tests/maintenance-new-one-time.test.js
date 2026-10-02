"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const integrity = require("../js/maintenanceCalendarIntegrity");
const identities = require("../js/globalIdentityRepair");
const maintenance = require("../js/maintenanceRecoveryImport");
const atomic = require("../js/atomicPersistence");
const firewall = require("../js/cuttingFileContentFirewall");
const renderer = fs.readFileSync("js/renderers.js", "utf8");
const calendar = fs.readFileSync("js/calendar.js", "utf8");
const core = fs.readFileSync("js/core.js", "utf8");
const clone = value => JSON.parse(JSON.stringify(value));
const date = "2026-06-16";
function section(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, start);
  return source.slice(from, to);
}
function baseline() {
  return {
    syncMeta: { rev: 7 },
    tasksInterval: [{ id: "saved-task", name: "Mixing tube rotation", mode: "interval", cat: "settings-root", recurrence: { enabled: true, every: 30 }, completedDates: ["2026-01-01"], manualHistory: [{ id: "manual-old", hours: 0.5 }] }],
    tasksAsReq: [{ id: "saved-asreq", name: "Existing as-required", completedDates: [] }],
    settingsFolders: [{ id: "settings-root", name: "All Tasks", parent: null }],
    inventory: [{ id: "stock", qtyNew: 9 }], inventoryFolders: [], inventoryMaterials: [],
    cuttingJobs: [{ id: "cut-job", name: "Keep job", history: [{ id: "cut-history", value: 12 }] }],
    completedCuttingJobs: [{ id: "finished-job", name: "Keep finished job" }],
    receiptTrackerWeeks: [{ key: "week", rows: [{ cost: 80 }] }],
    orderRequests: [{ id: "request", items: [{ id: "request-item", qty: 2 }] }],
    dailyCutHours: [{ dateISO: "2026-01-01", hours: 4 }],
    totalHistory: [{ dateISO: "2026-01-01", hours: 100 }],
    pumpEff: { entries: [{ dateISO: "2026-01-01", rpm: 1200 }] },
    garnetCleanings: [{ id: "garnet", dateISO: "2026-01-01", completed: true }],
    appConfig: { dailyHours: 8, custom: "preserve" },
    dashboardLayout: { custom: 1 }, costLayout: { custom: 2 }, jobLayout: { custom: 3 },
    maintenanceTasksV2: [{ id: "saved-v2", legacyTaskId: "saved-task", name: "Mixing tube rotation", custom: "preserve" }],
    maintenanceCalendarInstancesV2: [], maintenanceOccurrencesV2: []
  };
}
function element() {
  const classes = new Set(), attributes = new Map();
  return { hidden: false, value: "", dataset: {}, scrollTop: 0, focus() {},
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
    setAttribute: (name, value) => attributes.set(name, value), removeAttribute: name => attributes.delete(name), getAttribute: name => attributes.get(name) };
}
function harness({ initial = baseline(), pause } = {}) {
  const window = clone(initial), businessKeys = Object.keys(initial), messages = [], alerts = [];
  let cloud = clone(initial), commits = 0, reads = 0, submit;
  window._maintOrderCounter = 0;
  window.OMAXMaintenanceCalendarIntegrity = integrity;
  window.OMAXMaintenanceRecoveryImport = maintenance;
  const snapshot = () => clone(Object.fromEntries(businessKeys.map(key => [key, window[key]])));
  const modal = element(), main = element(), card = element(), results = element();
  card.setAttribute("data-task-card", "one-time");
  const name = element(), dateInput = element(), note = element();
  const form = { addEventListener: (type, handler) => { assert.equal(type, "submit"); submit = handler; }, reset: () => { name.value = ""; dateInput.value = ""; note.value = ""; } };
  const context = vm.createContext({ window, console, URLSearchParams,
    document: { body: element() }, location: { hash: "#/calendar" },
    modal, modalCardMain: main, taskCards: [card], taskOptionStage: element(), stepSections: [],
    oneTimeForm: form, oneTimeNameInput: name, oneTimeDateInput: dateInput, oneTimeNoteInput: note,
    existingTaskResults: results, taskExistingSearchInput: null, taskNameInput: null,
    downForm: null, jobForm: null, downDateInput: null, garnetDateInput: null, editingGarnetId: null,
    populateCategoryOptions() {}, resetTaskForm() {}, resetGarnetForm() {}, resetExistingTaskForm() {},
    syncTaskDateInput() {}, syncTaskRepeatMode() {}, refreshDownTimeList() {}, prepareGarnetStep() {},
    ensureDownTimeArray() {}, recordMaintenanceV2MutationSource() {},
    alert: message => alerts.push(message), toast: message => messages.push(message), renderCosts() {},
    renderCalendarPreservingScroll: () => {},
    renderCalendar: () => {
      window.__calendarV2OneTimeLookup = {};
      for (const root of window.maintenanceOccurrencesV2.filter(row => row.eventType === "scheduled")) {
        window.__calendarV2OneTimeLookup[root.id] = context.getV2OneTimeOccurrenceView(root.id);
      }
    }
  });
  vm.runInContext("let addContextDateISO=null,pendingGarnetEditId=null,activeTaskVariant=null;" +
    section(core, "let lastGeneratedIdTime", "function inspectInventoryIdentities") +
    section(core, "function parseDateLocal", "function normalizePredictionAverageWindow") +
    section(calendar, "function normalizeDateKey", "function toDayStart") +
    section(renderer, "function ensureMaintenanceV2Collections", "window.createMaintenanceV2FromTemplate = createMaintenanceV2FromTemplate;") +
    "window.createMaintenanceV2FromTemplate=createMaintenanceV2FromTemplate;" +
    section(renderer, "  function setTaskOptionPage", "  function refreshExistingTaskOptions") +
    section(renderer, "  function resetOneTimeTaskForm", "  function syncTaskDateInput") +
    section(renderer, "  function syncOneTimeDateInput", "  function ensureDownTimeArray") +
    section(renderer, "  function showStep", "  window.openDashboardAddPicker") +
    section(renderer, '  oneTimeForm?.addEventListener("submit"', '  taskExistingForm?.addEventListener("submit"') +
    section(calendar, "function getV2OneTimeOccurrenceView", "function makeV2RepeatOccurrenceKey") +
    section(calendar, "async function appendV2OccurrenceEvent", "function triggerDashboardAddPicker"), context);
  const db = { runTransaction: async callback => {
    let next;
    await callback({ get: async () => ({ exists: true, data: () => clone(cloud) }), set: (_ref, value) => { next = clone(value); } });
    cloud = next; commits++;
  } };
  window.runMaintenanceCalendarMutation = integrity.createMutationRunner({
    state: snapshot, readCloud: async () => { reads++; return clone(cloud); }, loadedRevision: () => window.syncMeta.rev,
    canWrite: () => true, suspend: reason => assert.fail(reason), apply: (key, value) => { window[key] = value; },
    save: async options => {
      if (pause) await pause;
      const result = await atomic.save({ db, docRef: { path: "in-memory-fixture" }, state: snapshot(), expectedRevision: options.expectedRevision, scan: firewall.scanCuttingFileContent, clientId: "fixture", now: () => 100 + commits });
      if (result.saved) window.syncMeta = clone(result.committedState.syncMeta);
      return result;
    }
  });
  return { window, context, snapshot, modal, card, results, name, dateInput, note, messages, alerts,
    open: () => { context.openModal("task", { dateISO: date }); context.activateTaskVariant("one-time"); },
    submit: () => submit({ preventDefault() {} }), get cloud() { return clone(cloud); }, get commits() { return commits; }, get reads() { return reads; } };
}
function unchanged(before, after) {
  for (const key of Object.keys(before).filter(key => !maintenance.keys.includes(key) && key !== "syncMeta")) assert.deepEqual(after[key], before[key], key);
  for (const key of maintenance.keys) for (const row of before[key]) assert.deepEqual(after[key].find(record => record.id === row.id), row);
}
test("new one-time form opens, saves standalone V2 records, closes and survives identity-checked reload", async () => {
  const h = harness(), before = h.cloud;
  assert.equal(identities.integrity(before).valid, true);
  h.open(); assert.equal(h.card.hidden, false); assert.equal(h.dateInput.value, date);
  h.name.value = "  test new one-time task  "; h.note.value = "  operator note  ";
  await h.submit();
  assert.equal(h.commits, 1); assert.equal(h.reads, 2); assert.equal(h.modal.classList.contains("is-visible"), false);
  assert.equal(h.results.hidden, true); assert.equal(h.name.value, "");
  const saved = h.cloud, task = saved.maintenanceTasksV2.find(row => row.name === "test new one-time task"), instance = saved.maintenanceCalendarInstancesV2[0], event = saved.maintenanceOccurrencesV2[0];
  assert.ok(task); assert.equal(task.legacyTaskId, null); assert.equal(instance.legacyTaskId, null); assert.equal(event.legacyTaskId, null);
  assert.equal(instance.taskId, task.id); assert.equal(event.taskId, task.id); assert.equal(event.instanceId, instance.id);
  assert.equal(instance.instanceMode, "one_time"); assert.equal(instance.repeatRule, null); assert.equal(event.eventType, "scheduled");
  assert.equal(event.effectiveDateISO, date); assert.equal(event.payload.note, "operator note");
  assert.equal(identities.integrity(saved).valid, true); unchanged(before, saved);
  const reloaded = harness({ initial: saved }); reloaded.context.renderCalendar();
  assert.equal(reloaded.window.__calendarV2OneTimeLookup[event.id].name, task.name);
  assert.equal(reloaded.window.__calendarV2OneTimeLookup[event.id].status, "scheduled");
  const retry = await h.window.runMaintenanceCalendarMutation(() => h.window.createMaintenanceV2FromTemplate({ id: task.id, name: task.name }, { mode: "one_time", calendarOnly: true, effectiveDateISO: date }));
  assert.equal(retry.noChange, true); assert.equal(h.commits, 1); assert.deepEqual(h.cloud, saved);
});
test("canceling the new one-time modal completes cleanup without staging or saving", () => {
  const h = harness(), before = h.snapshot(); h.open(); h.name.value = "test canceled";
  assert.doesNotThrow(() => h.context.closeModal());
  assert.equal(h.results.hidden, true); assert.equal(h.name.value, ""); assert.equal(h.commits, 0); assert.deepEqual(h.snapshot(), before);
});
test("blank name and impossible date are rejected before V2 creation", async () => {
  const h = harness(), before = h.cloud; h.open(); h.name.value = "   "; await h.submit();
  assert.equal(h.alerts.at(-1), "Task name is required.");
  h.name.value = "test invalid date"; h.dateInput.value = "2026-02-31"; await h.submit();
  assert.equal(h.alerts.at(-1), "Select a valid calendar date."); assert.equal(h.commits, 0); assert.equal(h.reads, 0); assert.deepEqual(h.snapshot(), before);
});
test("rapid duplicate new-task submits create exactly one task, instance and scheduled event", async () => {
  let release; const pause = new Promise(resolve => { release = resolve; });
  const h = harness({ pause }); h.open(); h.name.value = "test double click";
  const first = h.submit(); await new Promise(resolve => setImmediate(resolve)); await h.submit(); release(); await first;
  assert.equal(h.commits, 1); assert.equal(h.cloud.maintenanceTasksV2.length, 2); assert.equal(h.cloud.maintenanceCalendarInstancesV2.length, 1); assert.equal(h.cloud.maintenanceOccurrencesV2.length, 1);
  assert.equal(identities.integrity(h.cloud).valid, true);
});
test("distinct new calendar-only tasks on the same date retain separate identities and can be completed", async () => {
  const h = harness(), before = h.cloud;
  for (const name of ["test first task", "test second task"]) {
    h.open(); h.name.value = name; await h.submit();
  }
  assert.equal(h.commits, 2); assert.equal(h.cloud.maintenanceTasksV2.length, 3);
  assert.equal(h.cloud.maintenanceCalendarInstancesV2.length, 2); assert.equal(h.cloud.maintenanceOccurrencesV2.length, 2);
  for (const key of maintenance.keys) assert.equal(new Set(h.cloud[key].map(row => row.id)).size, h.cloud[key].length);
  h.context.renderCalendar(); const root = h.cloud.maintenanceOccurrencesV2[0];
  await h.window.completeV2OneTimeOccurrence(root.id);
  assert.equal(identities.integrity(h.cloud).valid, true); unchanged(before, h.cloud);
  const reloaded = harness({ initial: h.cloud }); reloaded.context.renderCalendar();
  assert.equal(reloaded.window.__calendarV2OneTimeLookup[root.id].status, "completed");
});
test("existing maintenance completion still saves once and survives reload with protected data intact", async () => {
  const h = harness(), before = h.cloud;
  const added = await h.window.runMaintenanceCalendarMutation(() => h.window.createMaintenanceV2FromTemplate(h.window.tasksInterval[0], { mode: "one_time", effectiveDateISO: date, hours: 5 / 60 }));
  assert.equal(added.saved, true); h.context.renderCalendar(); const root = added.created.occurrence;
  await h.window.completeV2OneTimeOccurrence(root.id); await h.window.completeV2OneTimeOccurrence(root.id);
  assert.equal(h.commits, 2); assert.equal(h.cloud.maintenanceOccurrencesV2.length, 2); assert.equal(identities.integrity(h.cloud).valid, true); unchanged(before, h.cloud);
  const reloaded = harness({ initial: h.cloud }); reloaded.context.renderCalendar();
  assert.equal(reloaded.window.__calendarV2OneTimeLookup[root.id].status, "completed"); assert.equal(reloaded.window.__calendarV2OneTimeLookup[root.id].hours, 5 / 60);
});
