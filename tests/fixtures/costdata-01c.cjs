"use strict";
const initial = require("./costdata-01a.cjs");
function fixture(){
  const state = initial();
  const task = (id, extra = {}) => ({ id, name: "Retained maintenance", mode: "interval", variant: "template", price: null, downtimeHours: null, completedDates: [], manualHistory: [], ...extra });
  state.tasksInterval = [
    task("jan", { manualHistory: [{ id: "jan-event", dateISO: "2026-01-15", status: "completed", partsCostSnapshot: 10, hours: 1 }] }),
    task("old-template"),
    task("old-instance", { templateId: "old-template", variant: "instance", price: 12, downtimeHours: .5, completedDates: ["2026-01-20"] }),
    task("feb", { manualHistory: [{ date: "2026-02-15", status: "completed", partsCostSnapshot: 10, hours: 1 }, { doneDateISO: "2026-02-15", status: "completed", partsCostSnapshot: 20, hours: 2 }] }),
    task("apr", { completedDates: ["2026-04-15"], manualHistory: [{ import_event_id: "apr-import", dateISO: "2026-04-15", status: "completed", partsCostSnapshot: 25, hours: .5 }, { import_event_id: "apr-distinct", dateISO: "2026-04-15", status: "completed", partsCostSnapshot: 3, hours: .1 }] }),
    task("unknown", { completedDates: ["2026-01-25"] }),
    task("zero", { manualHistory: [{ id: "zero-event", dateISO: "2026-01-26", status: "completed", partsCostSnapshot: 0, hours: 0 }] }),
    task("scheduled", { price: 500, downtimeHours: 10, manualHistory: [{ dateISO: "2026-03-15", status: "scheduled" }] })
  ];
  state.tasksAsReq = [];
  state.maintenanceTasksV2 = [{ id: "jan-v2", legacyTaskId: "jan", system: "v2", name: "Independent reminder" }, { id: "apr-v2", legacyTaskId: "apr", system: "v2", name: "April snapshots", price: 999, downtimeHours: 9 }];
  state.maintenanceCalendarInstancesV2 = [
    { id: "jan-instance", taskId: "jan-v2", system: "v2", instanceMode: "one_time", startDateISO: "2026-01-15" },
    ...["apr-instance", "apr-instance-2"].map(id => ({ id, taskId: "apr-v2", system: "v2", instanceMode: "one_time", startDateISO: "2026-04-15" }))
  ];
  const event = (id, instanceId, eventType, extra = {}) => ({ id, instanceId, taskId: instanceId === "jan-instance" ? "jan-v2" : "apr-v2", system: "v2", eventType,
    effectiveDateISO: instanceId === "jan-instance" ? "2026-01-15" : "2026-04-15", recordedAtISO: "2026-10-21T12:00:00Z", ...extra });
  state.maintenanceOccurrencesV2 = [
    event("jan-plan", "jan-instance", "scheduled"),
    event("apr-root", "apr-instance", "scheduled"), event("apr-done", "apr-instance", "completed", { rootOccurrenceId: "apr-root", import_event_id: "apr-import", partsCostSnapshot: 25, loggedHours: .5 }),
    event("apr-root-2", "apr-instance-2", "scheduled"), event("apr-done-2", "apr-instance-2", "completed", { rootOccurrenceId: "apr-root-2", partsCostSnapshot: 5, loggedHours: 1 })
  ];
  state.receiptTrackerWeeks.unshift({ key: "2025-W51", year: 2025, week: 51, rows: [{ date: "2025-12-15", purchased: "Earlier purchase", cost: 5, qty: 1 }] });
  return state;
}
const expectedByDate = { "2026-01-15": 40, "2026-01-20": 27, "2026-01-26": 0, "2026-02-15": 120, "2026-04-15": 81 };
module.exports = { fixture, expectedByDate };
