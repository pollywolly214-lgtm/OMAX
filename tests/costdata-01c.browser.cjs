"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs/promises"), path = require("node:path"), http = require("node:http");
const { chromium } = require(process.env.OMAX_PLAYWRIGHT_PATH || "playwright");
const { fixture, expectedByDate } = require("./fixtures/costdata-01c.cjs");
for (const timezoneId of ["America/Chicago", "Pacific/Kiritimati"]) test(`COSTDATA-01C original sources to table/chart without fabricated expenses (${timezoneId})`, { timeout: 90000 }, async t => {
  const root = path.resolve(__dirname, ".."), server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname, file = path.resolve(root, "." + pathname + (pathname.endsWith("/") ? "index.html" : ""));
    if (!file.startsWith(root + path.sep) || pathname.split("/").some(part => part.startsWith("."))) { res.writeHead(403).end(); return; }
    try { res.writeHead(200, { "Content-Type": { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" }[path.extname(file)] || "text/plain" }).end(await fs.readFile(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`, browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) }); t.after(() => browser.close());
  const context = await browser.newContext({ timezoneId, viewport: { width: 1440, height: 1100 } });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message)); page.setDefaultTimeout(8000);
  await page.clock.setFixedTime(new Date(timezoneId === "America/Chicago" ? "2026-10-21T17:00:00Z" : "2026-10-21T00:00:00Z"));
  let loads = 0;
  const load = async () => { await page.goto(origin + "/?devsafe=1&costdata01c=" + (++loads) + "#/costs"); await page.waitForFunction(() => window.__initialAdoptComplete && window.OMAXDevSafe?.active); };
  await load(); assert.equal(await page.evaluate(() => typeof firebase), "undefined"); assert.equal((await page.evaluate(() => saveCloudNow())).saved, true);
  await load(); assert.equal((await page.evaluate(() => saveCloudNow())).saved, true);
  await page.evaluate(async source => { if (!OMAXDevSafe.active || typeof firebase !== "undefined") throw Error("Disposable backend required"); const ref = FB.docRef, state = (await ref.get()).data(); await ref.set({ ...state, ...source }); }, fixture());
  await load();
  assert.equal(await page.locator("#costFinancialPeriod").count(), 1, JSON.stringify(await page.evaluate(() => ({ reason: window.__recoveryReason, issues: window.__globalIdentityIssues }))) + JSON.stringify(errors));
  const cloud = () => page.evaluate(async () => (await FB.docRef.get()).data()), before = await cloud();
  await page.evaluate(() => {
    window.__costdata01cBaseline = JSON.stringify(getCuttingJobImporterState()); window.__costdata01cWrites = 0;
    for (const name of ["saveCloudNow", "saveCloudDebounced", "markLocalMutation", "persistLocalStateBackup"]) window[name] = () => { window.__costdata01cWrites++; throw Error("Historical display must not save: " + name); };
  });
  for (const range of ["all", "ytd", "365d", "182d", "90d", "30d"]){
    await page.locator("#costFinancialPeriod").selectOption(range);
    const model = await page.evaluate(() => computeCostModel()), period = model.financialReconciliation.window;
    const expected = Object.entries(expectedByDate).filter(([date]) => (!period.startISO || date >= period.startISO) && date <= period.endISO);
    assert.deepEqual(model.maintenanceSeries.map(row => [row.dateISO, Math.abs(row.value)]), expected);
    assert.equal(model.financialReconciliation.maintenance.knownSubtotal, expected.reduce((sum, [, cost]) => sum + cost, 0));
    const targets = await page.evaluate(() => document.querySelector("#costChart").__costChartTargets.map(target => target.rowRef));
    assert.deepEqual(targets.filter(row => row.type === "maintenance").map(row => row.dateISO).sort(), expected.map(([date]) => date));
    assert.deepEqual(model.jobSeries.map(row => row.dateISO), ["2026-07-15", "2026-10-15"].filter(date => !period.startISO || date >= period.startISO));
    const purchaseTotal = model.totalSpendSeries.reduce((sum, row) => sum + Math.abs(row.value), 0);
    assert.equal(purchaseTotal, model.financialReconciliation.purchases.total);
    if (range === "all"){
      assert.equal(model.maintenanceSeries[0].dateISO, "2026-01-15"); assert.equal(model.totalSpendSeries[0].dateISO, "2025-12-15"); assert.equal(purchaseTotal, 136);
      assert.equal(model.maintenanceDataTable.length, 9); assert.equal(model.financialReconciliation.maintenance.incomplete, 0);
      assert.equal(model.maintenanceCostRows.filter(row => row.dateISO === "2026-02-15").length, 2);
      assert.equal(model.maintenanceCostRows.filter(row => row.dateISO === "2026-04-15").length, 3);
      assert.equal(model.maintenanceCostRows.find(row => row.historySourceTaskId === "old-instance").totalCost, 27);
      const unknown = model.maintenanceDataTable.find(row => row.taskId === "unknown"), zero = model.maintenanceDataTable.find(row => row.taskId === "zero");
      assert.equal(unknown.totalCostLabel, "$0.00"); assert.equal(unknown.costExclusionReason, ""); assert.equal(zero.costIncomplete, false);
      assert.match(await page.locator('[data-maintenance-row][data-task-id="unknown"]').innerText(), /Estimated\/default inputs/);
      const report = await page.evaluate(() => document.querySelector("#costChart").__maintenanceCostReconciliation);
      assert.ok(report.some(row => row.historySourceTaskId === "unknown" && row.centralTableIncluded && row.chartIncluded && row.totalCost === 0));
      assert.ok(report.some(row => row.historySourceTaskId === "zero" && row.chartIncluded && row.totalCost === 0));
      assert.ok(report.some(row => row.historySourceTaskId === "apr" && !row.normalizationIncluded && /Mirrored/.test(row.exclusionReason)));
      assert.ok(report.some(row => row.historySourceTaskId === "scheduled" && !row.centralTableIncluded && /eligible completion/.test(row.exclusionReason)));
      await fs.mkdir(path.join(root, "artifacts"), { recursive: true });
      await fs.writeFile(path.join(root, "artifacts", `costdata-01c-reconciliation-${timezoneId.replaceAll("/", "_")}.json`), JSON.stringify(report, null, 2));
    }
  }
  await page.locator("#costFinancialPeriod").selectOption("all");
  const diagnosticSource = await fs.readFile(path.join(root, "docs", "costdata-01c-read-only-diagnostic.js"), "utf8");
  const diagnosticBefore = await page.evaluate(() => ({ business: JSON.stringify(getCuttingJobImporterState()), storage: JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]))) }));
  const diagnostic = await page.evaluate(source => (0, eval)(source), diagnosticSource);
  assert.equal(diagnostic.jobs.earliestIncluded, "2026-07-15"); assert.equal(diagnostic.purchases.earliestPlotted, "2025-12-15");
  assert.ok(diagnostic.maintenance.some(row => row.taskId === "jan" && row.chartIncluded && row.totalCost === 40));
  assert.ok(diagnostic.maintenance.some(row => row.rootOccurrenceId === "jan-plan" && /Not a current completed expense: scheduled/.test(row.exclusionReason)));
  assert.deepEqual(await page.evaluate(() => ({ business: JSON.stringify(getCuttingJobImporterState()), storage: JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]))) })), diagnosticBefore);
  await page.evaluate(() => { location.hash = "#/tolerance"; }); await page.waitForFunction(() => location.hash === "#/tolerance");
  await page.evaluate(() => { location.hash = "#/costs"; }); await page.locator("#costFinancialPeriod").waitFor();
  assert.equal(await page.evaluate(() => computeCostModel().maintenanceSeries[0].dateISO), "2026-01-15");
  assert.equal(await page.evaluate(() => JSON.stringify(getCuttingJobImporterState()) === window.__costdata01cBaseline), true); assert.equal(await page.evaluate(() => __costdata01cWrites), 0); assert.deepEqual(await cloud(), before);
  await load(); await page.locator("#costFinancialPeriod").selectOption("all");
  assert.equal(await page.evaluate(() => computeCostModel().financialReconciliation.maintenance.knownSubtotal), 268); assert.deepEqual(await cloud(), before); assert.deepEqual(errors, []);
});
