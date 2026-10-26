"use strict";
const v2 = { system: "v2", schemaVersion: 2 };
const stamp = "2026-10-21T17:00:00Z";
function initial(){
  return {
    tasksInterval: [{ id: "task-a", templateId: "task-a", variant: "template", mode: "interval", name: "Shared name", interval: 40, downtimeHours: 1 }],
    tasksAsReq: [{ id: "task-b", templateId: "task-b", variant: "template", mode: "asreq", name: "Shared name", downtimeHours: 1 }],
    maintenanceTasksV2: [
      { ...v2, id: "v2-a", legacyTaskId: "task-a", name: "Old name" },
      { ...v2, id: "v2-b", legacyTaskId: "task-b", name: "Shared name" },
      { ...v2, id: "calendar-only", name: "Shared name" }
    ],
    maintenanceCalendarInstancesV2: [], maintenanceOccurrencesV2: [],
    inventory: [{ id: "protected", qtyNew: 7 }], appConfig: { dailyHours: 8 }
  };
}
function oneTime(state, name, { taskId = "v2-a", date = "2026-10-21", legacyTaskId } = {}){
  const instance = { ...v2, id: "instance-" + name, taskId, instanceMode: "one_time", startDateISO: date, repeatRule: null };
  if (legacyTaskId) instance.legacyTaskId = legacyTaskId;
  const root = { ...v2, id: name, taskId, instanceId: instance.id, eventType: "scheduled", effectiveDateISO: date, recordedAtISO: stamp, payload: { note: name, hours: 0 } };
  state.maintenanceCalendarInstancesV2.push(instance);
  state.maintenanceOccurrencesV2.push(root);
  return root;
}
function action(state, root, eventType, payload = {}, options = {}){
  const event = { ...v2, id: `${root.id || root.rootOccurrenceId}-${eventType}-${state.maintenanceOccurrencesV2.length}`,
    taskId: root.taskId, instanceId: root.instanceId, rootOccurrenceId: root.id || root.rootOccurrenceId,
    eventType, effectiveDateISO: root.effectiveDateISO, recordedAtISO: stamp, payload, ...options };
  state.maintenanceOccurrencesV2.unshift(event);
  return event;
}
function repeat(state, name, rule = {}, { taskId = "v2-a", date = "2026-10-21" } = {}){
  const instance = { ...v2, id: name, taskId, instanceMode: "repeat", status: "active", startDateISO: date,
    repeatRule: { enabled: true, basis: "calendar_day", every: 7, endType: "never", ...rule } };
  state.maintenanceCalendarInstancesV2.push(instance);
  return instance;
}
function mixed(){
  const state = initial();
  const done = oneTime(state, "done", { date: "2026-10-01" }); action(state, done, "completed", { hours: 0.25 });
  oneTime(state, "scheduled");
  const moved = oneTime(state, "moved", { date: "2026-10-20" }); action(state, moved, "moved", { toDateISO: "2026-10-22" });
  oneTime(state, "same-date");
  oneTime(state, "b-root", { taskId: "v2-b" });
  oneTime(state, "unlinked", { taskId: "calendar-only" });
  repeat(state, "repeat-a");
  const past = { id: "repeat:repeat-a:2026-07-01", instanceId: "repeat-a", taskId: "v2-a", effectiveDateISO: "2026-07-01" };
  action(state, past, "completed");
  state.tasksInterval.push({ id: "legacy-instance", templateId: "task-a", variant: "instance", mode: "interval", name: "Old name", downtimeHours: 12,
    recurrence: { enabled: false }, completedDates: ["2026-10-02"], manualHistory: [{ dateISO: "2026-10-02", status: "completed" }], occurrenceNotes: { "2026-10-02": "Legacy note" } });
  return state;
}
module.exports = { initial, oneTime, action, repeat, mixed };
