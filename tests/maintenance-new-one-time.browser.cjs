"use strict";
// Explicit browser regression: node --test tests/maintenance-new-one-time.browser.cjs
// Set OMAX_PLAYWRIGHT_PATH to an existing Playwright installation if needed.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require(process.env.OMAX_PLAYWRIGHT_PATH || "playwright");
const identities = require("../js/globalIdentityRepair");
const history = require("../js/historicalImport");
const root = path.resolve(__dirname, "..");
const maintenanceKeys = ["maintenanceTasksV2", "maintenanceCalendarInstancesV2", "maintenanceOccurrencesV2"];

function protectedBusiness(state) {
  const result = history.normalizeBusinessForComparison(state);
  for (const key of [...maintenanceKeys, "syncMeta", "saveMeta", "syncProcessLog"]) delete result[key];
  return result;
}

const storedReports = [{
  weekKey: "2026-09-28", weekStartISO: "2026-09-28", weekEndISO: "2026-10-04",
  totalCutCost: 125, totalMaintenanceCost: -70, totalCutHours: 2,
  cutItems: [{ id: "retained-cut", dateISO: "2026-09-29", name: "Retained historical report item", cost: 125, hours: 2 }],
  maintenanceItems: [{ id: "retained-maintenance", dateISO: "2026-09-30", cost: -70 }],
  cutByCategory: { Archived: { count: 1, cost: 125, hours: 2 } },
  generatedAtISO: "2026-10-02T00:00:00Z", weekLabel: "Sep 27, 2026 - Oct 3, 2026",
  operatorNote: "Preserve authoritative report details"
}, {
  weekKey: "2026-08-31", weekStartISO: "2026-08-31", weekEndISO: "2026-09-06",
  totalCutCost: 50, totalMaintenanceCost: -10, totalCutHours: 1,
  cutItems: [], maintenanceItems: [], cutByCategory: {},
  generatedAtISO: "2026-09-07T00:00:00Z", reviewed: true, customTotals: { approvedCost: 40 }
}];

for (const scenario of [
  { name: "original empty report baseline", reports: null },
  { name: "prior-week four-field rollover", rollover: true },
  { name: "authoritative historical reports", reports: storedReports }
])
test(`real dashboard click saves, reloads and completes without a diagnostic hook: ${scenario.name}`, { timeout: 45000 }, async t => {
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = path.resolve(root, "." + pathname + (pathname.endsWith("/") ? "index.html" : ""));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const content = await fs.readFile(file);
      const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[path.extname(file)] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }).end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
  t.after(() => browser.close());
  const context = await browser.newContext({ timezoneId: "America/Chicago", locale: "en-US" }); // Fresh disposable profile; no user caches or credentials.
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [];
  await page.clock.setFixedTime(new Date("2026-10-05T17:00:00Z"));
  page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(8000);
  const load = async () => {
    await page.goto(origin + "/?devsafe=1", { waitUntil: "load" });
    await page.waitForFunction(() => window.OMAXDevSafe?.active && window.__initialAdoptComplete);
    assert.equal(await page.evaluate(() => typeof window.firebase), "undefined");
  };
  const cloud = () => page.evaluate(() => readCurrentCloudStateReadOnly());
  await load();
  // Establish the disposable authoritative baseline via the real save coordinator.
  assert.equal((await page.evaluate(() => saveCloudNow())).saved, true);
  // Fresh built-in seed recurrence anchors settle from null to 0 on adoption.
  // Finish fixture bootstrap before taking the baseline; do not change that
  // unrelated load behavior or bypass the maintenance equality/revision guard.
  await load();
  assert.equal((await page.evaluate(() => saveCloudNow())).saved, true);
  const scenarioReports = scenario.rollover ? await page.evaluate(() => [{
    ...computeCostModel().weeklyReports.find(report => report.weekKey === "2026-10-05"),
    weekKey: "2026-09-28", weekStartISO: "2026-09-28", weekEndISO: "2026-10-04",
    weekLabel: "Sep 27, 2026 - Oct 3, 2026"
  }]) : scenario.reports;
  if (scenarioReports) {
    // Provision only this fresh profile's disposable authoritative backend.
    // Do not save the renderer's runtime representation over these reports.
    await page.evaluate(async reports => {
      if (!OMAXDevSafe.active || typeof firebase !== "undefined") throw Error("Disposable backend required");
      const ref = OMAXDevSafe.db.doc(FB.docRef.path), source = (await ref.get()).data();
      await ref.set({ ...source, weeklyCostReports: reports });
    }, scenarioReports);
    await load();
  }
  const before = await cloud();
  if (scenarioReports) assert.deepEqual(before.weeklyCostReports, scenarioReports);
  const reportSnapshot = () => page.evaluate(() => compactStateForStorage(snapshotState({ skipLocalFileCacheSync: true })).weeklyCostReports);
  assert.deepEqual(await reportSnapshot(), before.weeklyCostReports);
  const baselineSnapshot = await page.evaluate(() => compactStateForStorage(snapshotState({ skipLocalFileCacheSync: true })));
  assert.deepEqual(history.normalizeBusinessForComparison(baselineSnapshot), history.normalizeBusinessForComparison(before));
  // Both renderers consume a freshly calculated display model; neither may
  // publish it into the protected stored collection, even on repeated renders.
  const displayedReports = await page.evaluate(() => computeCostModel().weeklyReports);
  const displayWeeks = displayedReports.map(report => report.weekKey);
  assert.equal(displayedReports.find(report => report.weekKey === "2026-10-05").weekLabel, "Oct 5, 2026 - Oct 11, 2026");
  if (scenarioReports) assert.notDeepEqual(displayWeeks, scenarioReports.map(report => report.weekKey));
  await page.evaluate(() => { renderDashboard(); renderDashboard(); });
  assert.deepEqual(await reportSnapshot(), before.weeklyCostReports);
  assert.deepEqual(await cloud(), before);
  assert.equal(await page.evaluate(() => typeof window.recordMaintenanceV2MutationSource), "undefined");
  await page.evaluate(() => {
    window.__mcfStages = [];
    document.addEventListener("click", event => {
      if (event.target.closest('#dashOneTimeForm button[type="submit"]')) __mcfStages.push("button-click");
    }, true);
    document.addEventListener("submit", event => {
      if (event.target.id === "dashOneTimeForm") __mcfStages.push("form-submit");
    }, true);
    for (const name of ["createMaintenanceV2FromTemplate", "runMaintenanceCalendarMutation", "saveCloudNow", "readCurrentCloudStateReadOnly"]) {
      const actual = window[name];
      window[name] = function (...args) {
        __mcfStages.push(name);
        return actual.apply(this, args); // Observe real functions; do not replace save/auth/constructor behavior.
      };
    }
  });
  await page.locator("#calendarAddBtn").click();
  await page.locator('#dashboardAddModal [data-choice="task"]').click();
  await page.locator('[data-task-option="one-time"]').click();
  assert.deepEqual(await page.locator("#dashOneTimeForm").evaluate(form => ({
    count: document.querySelectorAll("#dashOneTimeForm").length,
    associated: form.querySelector('button[type="submit"]').form === form,
    connected: form.isConnected
  })), { count: 1, associated: true, connected: true });
  const date = await page.evaluate(() => ymd(new Date()));
  await page.locator("#dashOneTimeDate").fill(date);
  await page.locator('#dashOneTimeForm button[type="submit"]').click();
  // Native required-field validation must prevent submission, not stage any records.
  assert.deepEqual(await page.evaluate(() => __mcfStages), ["button-click"]);
  assert.deepEqual(await cloud(), before);
  await page.locator("#dashOneTimeName").fill("MCF01B browser fixture");
  await page.locator("#dashOneTimeNote").fill("isolated one-time regression");
  await page.locator('#dashOneTimeForm button[type="submit"]').click();
  await page.waitForFunction(() => !document.getElementById("dashboardAddModal").classList.contains("is-visible"));
  const stages = await page.evaluate(() => __mcfStages);
  for (const stage of ["form-submit", "runMaintenanceCalendarMutation", "createMaintenanceV2FromTemplate", "saveCloudNow"]) assert.equal(stages.filter(value => value === stage).length, 1, stage);
  assert.ok(stages.indexOf("form-submit") < stages.indexOf("createMaintenanceV2FromTemplate"));
  assert.ok(stages.indexOf("createMaintenanceV2FromTemplate") < stages.indexOf("saveCloudNow"));
  assert.ok(stages.filter(value => value === "readCurrentCloudStateReadOnly").length >= 3); // Baseline, guarded read-back, explicit test read.
  const saved = await cloud();
  assert.deepEqual(saved.weeklyCostReports, before.weeklyCostReports);
  for (const key of maintenanceKeys) {
    assert.equal(saved[key].length, before[key].length + 1, key);
    for (const record of before[key]) assert.deepEqual(saved[key].find(row => row.id === record.id), record);
  }
  assert.deepEqual(protectedBusiness(saved), protectedBusiness(before));
  assert.equal(identities.integrity(saved).valid, true);
  const task = saved.maintenanceTasksV2.find(row => row.name === "MCF01B browser fixture");
  const instance = saved.maintenanceCalendarInstancesV2.find(row => row.taskId === task.id);
  const scheduled = saved.maintenanceOccurrencesV2.find(row => row.instanceId === instance.id);
  for (const record of [task, instance, scheduled]) assert.equal(record.legacyTaskId, null);
  assert.equal(instance.instanceMode, "one_time"); assert.equal(instance.repeatRule, null);
  assert.equal(scheduled.eventType, "scheduled"); assert.equal(scheduled.taskId, task.id);
  assert.equal(scheduled.effectiveDateISO, date);
  assert.equal(scheduled.payload.note, "isolated one-time regression");
  assert.ok(saved.syncMeta.rev > before.syncMeta.rev);

  await load(); // Full bootstrap/read/adoption, not an artificial copy of the saved arrays.
  assert.deepEqual(await cloud(), saved);
  assert.deepEqual(await reportSnapshot(), before.weeklyCostReports);
  assert.equal(await page.evaluate(id => getV2OneTimeOccurrenceView(id).status, scheduled.id), "scheduled");
  await page.evaluate(() => {
    window.__mcfCompletion = [];
    document.addEventListener("click", e => { if (e.target.closest("[data-v2-panel-complete]")) __mcfCompletion.push("click"); }, true);
    for (const name of ["completeV2OneTimeOccurrence", "runMaintenanceCalendarMutation", "saveCloudNow"]) {
      const actual = window[name];
      window[name] = async function (...args) { __mcfCompletion.push(name); const result = await actual.apply(this, args); __mcfCompletion.push({ name, result }); return result; };
    }
  });
  const chip = page.locator(`[data-cal-v2-one-time="${scheduled.id}"]`).first();
  await chip.click();
  await page.locator("#v2OneTimePanel [data-v2-panel-complete]").click();
  try {
    await page.waitForFunction(id => getV2OneTimeOccurrenceView(id)?.status === "completed", scheduled.id);
  } catch (error) {
    assert.fail(JSON.stringify(await page.evaluate(() => ({
      toasts: [...document.querySelectorAll(".toast")].map(node => node.textContent),
      saveBlock: window.__lastCloudSaveBlock, disabled: window.__autosaveDisabled,
      recovery: window.__recoveryInspectMode, stages: window.__mcfCompletion
    }))) + " " + error.message);
  }
  await page.waitForFunction(async id => {
    const state = await readCurrentCloudStateReadOnly();
    return state.maintenanceOccurrencesV2.some(row => row.rootOccurrenceId === id && row.eventType === "completed");
  }, scheduled.id);
  const completed = await cloud();
  assert.equal(completed.maintenanceTasksV2.length, saved.maintenanceTasksV2.length);
  assert.equal(completed.maintenanceCalendarInstancesV2.length, saved.maintenanceCalendarInstancesV2.length);
  assert.equal(completed.maintenanceOccurrencesV2.length, saved.maintenanceOccurrencesV2.length + 1);
  assert.equal(completed.maintenanceOccurrencesV2.filter(row => row.rootOccurrenceId === scheduled.id && row.eventType === "completed").length, 1);
  assert.deepEqual(protectedBusiness(completed), protectedBusiness(before));
  for (const key of maintenanceKeys) for (const record of saved[key]) assert.deepEqual(completed[key].find(row => row.id === record.id), record);
  assert.equal(identities.integrity(completed).valid, true);
  await load();
  assert.deepEqual(await cloud(), completed);
  assert.deepEqual(await reportSnapshot(), before.weeklyCostReports);
  assert.equal(await page.evaluate(id => getV2OneTimeOccurrenceView(id).status, scheduled.id), "completed");
  await page.locator(`[data-cal-v2-one-time="${scheduled.id}"]`).first().click();
  assert.equal(await page.locator("#v2OneTimePanel [data-v2-panel-complete]").isDisabled(), true);
  assert.deepEqual(await cloud(), completed); // Reopening completed task remains a no-op.
  await page.locator("#v2OneTimePanel [data-v2-panel-close]").click();
  await page.evaluate(() => { location.hash = "#/costs"; route(); });
  await page.waitForFunction(() => document.getElementById("costDataCenterModal"));
  assert.deepEqual(await reportSnapshot(), before.weeklyCostReports);
  assert.deepEqual(await cloud(), completed);
  assert.deepEqual(errors, []);
});
