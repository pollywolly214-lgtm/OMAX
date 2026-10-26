"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const historicalImport = require("../js/historicalImport");
const core = fs.readFileSync("js/core.js", "utf8");
const views = fs.readFileSync("js/views.js", "utf8");
const dates = core.slice(core.indexOf("function parseDateLocal("), core.indexOf("function normalizeAppConfig("));
const label = views.slice(views.indexOf("function dashboardLastUpdatedLabel("), views.indexOf("function viewDashboard("));
process.env.TZ = "America/Chicago";
const ctx = vm.createContext({ Date, console });
vm.runInContext(dates + label, ctx);
const display = rows => ctx.dashboardLastUpdatedLabel(rows);
const expected = date => ctx.parseDateLocal(date).toLocaleDateString();

test("latest reading date is independent of array order, hours magnitude, and save/edit timestamps", () => {
  const rows = [
    {dateISO:"2026-10-24", hours:90, updatedAtISO:"2026-10-24T12:00:00Z"},
    {dateISO:"2026-10-20", hours:100, updatedAtISO:"2026-10-26T23:00:00Z"}
  ];
  const before = structuredClone(rows);
  assert.equal(display(rows), expected("2026-10-24"));
  assert.deepEqual(rows, before, "read path never sorts or rewrites source records");
  rows[1].hours = 110;
  assert.equal(display(rows), expected("2026-10-24"), "editing older hours is not a new log date");
  rows.push({dateISO:"2026-10-26", hours:115});
  assert.equal(display(rows), expected("2026-10-26"));
  rows[2].dateISO = "2026-10-22";
  assert.equal(display(rows), expected("2026-10-24"), "editing the latest date recomputes the maximum");
});

test("date-only readings display their calendar day across CST, CDT and DST boundaries", () => {
  for (const date of ["2026-01-15", "2026-03-08", "2026-10-26", "2026-11-01"]){
    assert.equal(display([{dateISO:date, hours:0}]), expected(date));
    assert.notEqual(display([{dateISO:date, hours:0}]), new Date(date).toLocaleDateString());
  }
});

test("missing and malformed histories show a placeholder without a sync-time fallback", () => {
  for (const rows of [undefined, null, {}, [], [null, {}, {dateISO:"invalid", hours:1},
    {dateISO:"2026-02-30", hours:2}, {dateISO:"2026-10-26", hours:null},
    {dateISO:"2026-10-26", hours:""}, {dateISO:"2026-10-26", hours:"bad"},
    {dateISO:"2026-10-26", hours:-1}]]) assert.equal(display(rows), "—");
  assert.equal(display([{dateISO:"2026-10-24", hours:"0"}, {dateISO:"invalid", hours:5}]), expected("2026-10-24"));
});

test("real reviewed Pump Hours imports use log dates, including older and newer imported records", () => {
  let state = {totalHistory:[{dateISO:"2026-10-24", hours:100}], dailyCutHours:[]};
  for (const [index, date, hours, last] of [[0,"2026-10-20",90,"2026-10-24"], [1,"2026-10-25",102,"2026-10-25"]]){
    const plan = historicalImport.preview("pump_hours", [{date, hours, import_event_id:`dashfix-${index}`,
      source_id:"dashfix-disposable", source_record_id:String(index), review_status:"reviewed"}], state);
    assert.equal(plan[0].status, historicalImport.STATUS.missing);
    state = historicalImport.append("pump_hours", state, plan);
    assert.equal(display(state.totalHistory), expected(last));
    const hydrated = JSON.parse(JSON.stringify(state));
    assert.equal(display(hydrated.totalHistory), expected(last));
    assert.deepEqual(state.dailyCutHours, []);
    assert.ok(state.totalHistory.find(row=>row.dateISO === date).importProvenance);
  }
});
