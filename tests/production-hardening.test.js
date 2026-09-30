const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const coreSource = fs.readFileSync("js/core.js", "utf8");

function loadDateHelpers() {
  const start = coreSource.indexOf("function parseDateLocal");
  const end = coreSource.indexOf("function normalizePredictionAverageWindow", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const context = vm.createContext({ console });
  vm.runInContext(`${coreSource.slice(start, end)};this.api={parseDateLocal,normalizeDateISO};`, context);
  return context.api;
}

test("calendar normalization rejects impossible ISO dates instead of rolling them forward", () => {
  const { parseDateLocal, normalizeDateISO } = loadDateHelpers();
  assert.equal(parseDateLocal("2026-02-29"), null);
  assert.equal(normalizeDateISO("2026-02-31"), null);
  assert.equal(normalizeDateISO("2024-02-29"), "2024-02-29");
  assert.equal(normalizeDateISO("2026-09-29"), "2026-09-29");
});

test("backup fallback never deletes the last valid backup or unrelated browser keys", () => {
  const start = coreSource.indexOf("function persistLocalStateBackup");
  const end = coreSource.indexOf("function readLocalStateBackup", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const implementation = coreSource.slice(start, end);
  assert.doesNotMatch(implementation, /localStorage\.removeItem/);
  assert.doesNotMatch(implementation, /omax_debug_cache|omax_sync_cache|omax_render_cache|omax_local_state_backup_v0/);
  assert.match(implementation, /buildEmergencyBackup/);
  assert.match(implementation, /buildTinyCriticalBackup/);
});

test("calendar error and missing-record details are escaped before HTML rendering", () => {
  const calendarSource = fs.readFileSync("js/calendar.js", "utf8");
  assert.match(calendarSource, /Job not found \(id: \$\{escapeHtml\(jobId\)\}\)/);
  assert.match(calendarSource, /<span>\$\{escapeHtml\(err\?\.message \|\| err\)\}<\/span>/);
});
