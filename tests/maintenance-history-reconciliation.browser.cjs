"use strict";
// node --test tests/maintenance-history-reconciliation.browser.cjs
// Uses bundled Playwright, a fresh disposable profile and localhost-only network.
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs/promises"), path = require("node:path"), http = require("node:http");
const { chromium } = require(process.env.OMAX_PLAYWRIGHT_PATH || "playwright");
const fixture = require("./fixtures/maintenance-history");
const root = path.resolve(__dirname, "..");
test("actual Settings history reconciles calendar, opens/closes/jumps, reloads and leaves disposable storage unchanged", { timeout: 60000 }, async t => {
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = path.resolve(root, "." + pathname + (pathname.endsWith("/") ? "index.html" : ""));
    if (!file.startsWith(root + path.sep) || pathname.split("/").some(part => part.startsWith("."))) { res.writeHead(403).end(); return; }
    try { res.writeHead(200, { "Content-Type": { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" }[path.extname(file)] || "text/plain", "Cache-Control": "no-store" }).end(await fs.readFile(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) }); t.after(() => browser.close());
  const context = await browser.newContext({ timezoneId: "America/Chicago", locale: "en-US", viewport: { width: 1440, height: 1000 } });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), pageErrors = [], consoleErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && !message.text().includes("Failed to load resource")) consoleErrors.push(message.text()); });
  await page.clock.setFixedTime(new Date("2026-10-21T17:00:00Z")); page.setDefaultTimeout(8000);
  const load = async (hash = "#/") => {
    const sameDocument = page.url().split("#")[0] === origin + "/?devsafe=1";
    await page.goto(origin + "/?devsafe=1" + hash, { waitUntil: "load" });
    // A hash-only goto is not a reload. Exercise an actual fresh document.
    if (sameDocument) await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.OMAXDevSafe?.active && window.__initialAdoptComplete);
    assert.equal(await page.evaluate(() => typeof window.firebase), "undefined");
  };
  await load(); assert.equal((await page.evaluate(() => saveCloudNow())).saved, true);
  await load(); assert.equal((await page.evaluate(() => saveCloudNow())).saved, true);
  await page.evaluate(async state => {
    if (!OMAXDevSafe.active || typeof firebase !== "undefined") throw Error("Disposable backend required");
    const ref = OMAXDevSafe.db.doc(FB.docRef.path), source = (await ref.get()).data();
    await ref.set({ ...source, ...state, settingsFolders: [] });
  }, fixture.mixed());
  // Open directly into Settings to prove no Dashboard cache dependency.
  await load("#/settings");
  const cloud = () => page.evaluate(() => readCurrentCloudStateReadOnly());
  const before = await cloud();
  const stateSnapshot = () => page.evaluate(() => Object.fromEntries(["tasksInterval", "tasksAsReq", "maintenanceTasksV2", "maintenanceCalendarInstancesV2", "maintenanceOccurrencesV2"].map(key => [key, window[key]])));
  const beforeState = await stateSnapshot();
  assert.equal(await page.locator('details.task[data-task-id="task-a"]').count(), 1,
    JSON.stringify({ errors: pageErrors, consoleErrors, state: await page.evaluate(async () => ({ text: document.body.innerText.slice(-2000), taskIds: window.tasksInterval?.map(task => task.id), cloudIds: (await readCurrentCloudStateReadOnly()).tasksInterval?.map(task => task.id), hash: location.hash, reason: window.__recoveryReason, adoption: window.__lastSaveBlock, path: FB.docRef?.path })) }));
  const open = async id => {
    await page.locator(`details.task[data-task-id="${id}"]`).evaluate(node => {
      for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) if (ancestor.tagName === "DETAILS") ancestor.open = true;
    });
    await page.locator(`[data-task-history="${id}"]`).click();
    await page.locator(`[data-maintenance-history="${id}"]`).waitFor({ state: "visible" });
  };
  const modal = page.locator('[data-maintenance-history="task-a"]');
  const keys = () => modal.locator("[data-history-event]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-history-event")));
  await open("task-a"); const first = await keys(); assert.equal(first.length, 9); assert.equal(new Set(first).size, 9);
  assert.equal(await modal.locator('[data-history-jump="2026-10-21"]').count(), 3);
  assert.match(await modal.innerText(), /Rescheduled from 2026-10-20/); assert.match(await modal.innerText(), /Legacy note/);
  assert.match(await modal.innerText(), /0.25 hr/); assert.match(await modal.innerText(), /0 hr/);
  assert.equal(await modal.locator("thead th").count(), 12);
  if (process.env.OMAX_MHIST_SCREENSHOTS){
    await fs.mkdir(process.env.OMAX_MHIST_SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: path.join(process.env.OMAX_MHIST_SCREENSHOTS, "desktop.png") });
  }
  assert.deepEqual(await stateSnapshot(), beforeState); assert.deepEqual(await cloud(), before);
  await modal.locator("[data-close]").click(); assert.equal(await modal.count(), 0);
  await open("task-a"); await modal.click({ position: { x: 2, y: 2 } }); assert.equal(await modal.count(), 0);
  await open("task-b"); const other = page.locator('[data-maintenance-history="task-b"]');
  assert.equal(await other.locator("[data-history-event]").count(), 1); assert.match(await other.innerText(), /b-root/);
  await other.locator("[data-close]").click();
  // Real Dashboard DOM identities must reconcile, including duration segmentation.
  await page.evaluate(() => { location.hash = "#/"; }); await page.locator("#months .day").first().waitFor();
  const chips = () => page.locator("#months .cal-task").evaluateAll(nodes => nodes.map(node => ({
    root: node.dataset.v2RootOccurrenceId || "", instance: node.dataset.v2InstanceId || "", task: node.dataset.calTask || "",
    date: node.dataset.calDate, start: node.dataset.calStart || "", status: node.dataset.calStatus, text: node.textContent
  })));
  const calendarBefore = await chips();
  const v2A = calendarBefore.filter(chip => ["done", "scheduled", "same-date", "moved"].includes(chip.root) || chip.instance === "repeat-a");
  // DOM comparison is limited to the dates in the rendered calendar months;
  // the popup also retains persisted events outside that viewport (e.g. July).
  const visibleHistoryKeys = await page.evaluate(() => {
    const dates = new Set([...document.querySelectorAll("#months .day[data-date-iso]")].map(node => node.dataset.dateIso));
    return buildMaintenanceTaskHistory("task-a").filter(row => row.sourceSystem === "v2" && dates.has(row.dateISO)).map(row => row.key).sort();
  });
  assert.ok(v2A.length >= 4);
  assert.deepEqual(v2A.map(chip => JSON.stringify(["v2", chip.instance, chip.root])).sort(), visibleHistoryKeys);
  assert.equal(calendarBefore.filter(chip => chip.task === "legacy-instance").length, 2);
  await page.evaluate(() => { location.hash = "#/settings"; }); await open("task-a");
  await modal.locator('[data-history-jump="2026-10-22"]').click();
  await page.locator("#v2OneTimePanel").waitFor({ state: "visible" });
  assert.match(await page.locator("#v2OneTimePanel").innerText(), /moved|2026-10-22/);
  await page.locator("[data-v2-panel-close]").click(); assert.deepEqual(await chips(), calendarBefore);
  assert.deepEqual(await cloud(), before);
  await load("#/settings"); await open("task-a"); assert.deepEqual(await keys(), first); assert.deepEqual(await cloud(), before);
  // Responsive popup retains a reachable close control and horizontally scrollable table.
  await page.setViewportSize({ width: 390, height: 844 });
  const card = modal.locator(".modal-card"), box = await card.boundingBox(); assert.ok(box.width <= 390);
  if (process.env.OMAX_MHIST_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.OMAX_MHIST_SCREENSHOTS, "mobile.png") });
  await modal.locator("[data-close]").click(); assert.equal(await modal.count(), 0);
  // MHIST-01B: verify actual navigation boundaries, including expanded months.
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Retain the already-rendered native fixture schema rather than reintroducing
  // missing legacy fields that Settings' existing bootstrap would normalize.
  const navigationState = await page.evaluate(() => compactStateForStorage(snapshotState({ skipLocalFileCacheSync: true })));
  for (const [id, date] of [["too-old", "2025-09-15"], ["oldest", "2025-10-15"], ["plus12", "2027-10-15"],
    ["plus13", "2027-11-15"], ["plus15", "2028-01-15"], ["plus23", "2028-09-15"], ["too-far", "2028-10-15"]]) {
    fixture.oneTime(navigationState, id, { date });
  }
  navigationState.tasksInterval[0].manualHistory = [{ dateISO: "2026-09-15", status: "logged" }];
  await page.evaluate(async state => {
    if (!OMAXDevSafe.active || typeof firebase !== "undefined") throw Error("Disposable backend required");
    const ref = OMAXDevSafe.db.doc(FB.docRef.path), source = (await ref.get()).data();
    await ref.set({ ...source, ...state });
  }, navigationState);
  await load("#/settings");
  const navigationBefore = await cloud();
  await open("task-a");
  const rangeBefore = await page.evaluate(() => ({ offset: window.__calendarMonthOffset, expanded: window.__calendarShowAllMonths, hash: location.hash }));
  for (const date of ["2025-09-15", "2028-10-15"]){
    await modal.locator(`[data-history-jump="${date}"]`).click();
    assert.equal(await modal.isVisible(), true);
    assert.match(await modal.locator("[data-history-navigation-status]").innerText(), /outside the calendar's navigation range/);
    assert.deepEqual(await page.evaluate(() => ({ offset: window.__calendarMonthOffset, expanded: window.__calendarShowAllMonths, hash: location.hash })), rangeBefore);
  }
  await modal.locator('[data-history-jump="2026-09-15"]').click();
  assert.match(await modal.locator("[data-history-navigation-status]").innerText(), /outside active Calendar projection/);
  for (const [id, date] of [["oldest", "2025-10-15"], ["plus12", "2027-10-15"], ["plus13", "2027-11-15"],
    ["plus15", "2028-01-15"], ["plus23", "2028-09-15"]]){
    if (!await modal.count()){ await page.evaluate(() => { location.hash = "#/settings"; }); await open("task-a"); }
    await modal.locator(`[data-history-jump="${date}"]`).click();
    await page.locator("#v2OneTimePanel").waitFor({ state: "visible" });
    assert.equal(await modal.count(), 0);
    assert.match(await page.locator("#v2OneTimePanel").innerText(), new RegExp(id));
    assert.equal(await page.locator(`#months [data-date-iso="${date}"] [data-v2-root-occurrence-id="${id}"]`).count(), 1);
    await page.locator("[data-v2-panel-close]").click();
  }
  // A reachable date alone is insufficient: retain history if its root is absent.
  await page.evaluate(() => { location.hash = "#/settings"; }); await open("task-a");
  await page.evaluate(() => {
    window.__mhistOriginalCalendar = renderCalendar;
    window.renderCalendar = () => { __mhistOriginalCalendar(); document.querySelectorAll('[data-v2-root-occurrence-id="scheduled"]').forEach(node => node.remove()); };
  });
  await modal.locator('[data-history-jump="2026-10-21"]').nth(1).click();
  await page.waitForFunction(() => document.querySelector('[data-history-navigation-status]')?.textContent.includes("could not be reached"));
  assert.equal(await modal.isVisible(), true); assert.equal(await page.locator("#v2OneTimePanel").count(), 0);
  await page.evaluate(() => { window.renderCalendar = window.__mhistOriginalCalendar; delete window.__mhistOriginalCalendar; });
  await modal.locator("[data-close]").click();
  assert.deepEqual(await cloud(), navigationBefore);
  assert.deepEqual(pageErrors, []); assert.deepEqual(consoleErrors, []);
});
