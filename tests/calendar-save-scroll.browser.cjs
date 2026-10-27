"use strict";
// Run with node --test tests/calendar-save-scroll.browser.cjs.
// OMAX_PLAYWRIGHT_PATH can point to an existing Playwright installation.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require(process.env.OMAX_PLAYWRIGHT_PATH || "playwright");
const root = path.resolve(__dirname, "..");

for (const customLayout of [false, true])
test(`calendar saves keep page and calendar-window positions with ${customLayout ? "a saved" : "the default"} dashboard layout`, { timeout: 60000 }, async t => {
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
  const context = await browser.newContext({ timezoneId: "America/Chicago", viewport: { width: 1280, height: 720 } });
  // Real UI and save coordinator, isolated from production in a fresh profile.
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(8000);
  await page.clock.setFixedTime(new Date("2026-10-26T17:00:00Z"));
  const load = async () => {
    await page.goto(origin + "/?devsafe=1", { waitUntil: "load" });
    await page.waitForFunction(() => window.OMAXDevSafe?.active && window.__initialAdoptComplete);
    assert.equal(await page.evaluate(() => typeof window.firebase), "undefined");
  };
  await load();
  assert.equal((await page.evaluate(() => saveCloudNow())).saved, true);
  await page.evaluate(async () => {
    const ref = OMAXDevSafe.db.doc(FB.docRef.path), state = (await ref.get()).data();
    state.jobFolders.push({ id: "scroll-project", name: "1234 Scroll fixture", projectNumber: "1234", parent: "jobs_root", order: 2 });
    await ref.set(state);
  });
  await load();
  assert.equal((await page.evaluate(() => saveCloudNow())).saved, true);
  if (customLayout) {
    // A tall saved layout makes the calendar lower than the temporary page
    // height during replacement, reproducing the reported jump to zero.
    assert.equal(await page.evaluate(async () => {
      const state = getDashboardLayoutState();
      state.layoutById.waterQuality.y = 4000;
      persistDashboardLayout(state);
      applyDashboardLayout(state);
      return (await saveCloudNow()).saved;
    }), true);
    await load();
  }

  const addButton = page.locator('#months [data-date-iso="2026-12-15"] .day-add-bubble');
  await addButton.scrollIntoViewIfNeeded();
  const calendarPosition = () => page.locator("#months").evaluate(el => ({ top: el.scrollTop, left: el.scrollLeft }));
  const beforeRefresh = await calendarPosition();
  assert.ok(beforeRefresh.top > 200);
  await page.evaluate(() => {
    renderCalendar();
    renderCalendarPreservingScroll();
    rerenderCalendarKeepScroll();
  });
  assert.deepEqual(await calendarPosition(), beforeRefresh, "Calendar-only refreshes reset the calendar window");
  await page.evaluate(() => { renderDashboard(); renderDashboard(); });
  assert.deepEqual(await calendarPosition(), beforeRefresh, "Full dashboard refreshes reset the calendar window");
  const open = async (choice, variant) => {
    await addButton.scrollIntoViewIfNeeded();
    await addButton.hover();
    await addButton.click();
    await page.locator(`#dashboardAddModal [data-choice="${choice}"]`).click();
    if (variant) await page.locator(`[data-task-option="${variant}"]`).click();
  };
  const save = async (form, description) => {
    const before = await page.evaluate(() => window.scrollY);
    const calendarBefore = await calendarPosition();
    assert.ok(before > 200, `Expected a scrolled page, got ${before}`);
    assert.ok(calendarBefore.top > 200, `Expected a scrolled calendar, got ${calendarBefore.top}`);
    assert.deepEqual(await page.locator(form).evaluate(form => [...form.elements].filter(field => field.willValidate && !field.validity.valid).map(field => ({ id: field.id, error: field.validationMessage }))), []);
    await page.locator(`${form} button[type="submit"]`).click();
    await page.waitForFunction(() => !document.getElementById("dashboardAddModal").classList.contains("is-visible"));
    // Include the deferred workspace refresh after save/read-back.
    await page.waitForTimeout(1600);
    const after = await page.evaluate(() => window.scrollY);
    assert.ok(Math.abs(after - before) <= 2, `${description} moved the page from ${before} to ${after}`);
    const calendarAfter = await calendarPosition();
    assert.deepEqual(calendarAfter, calendarBefore, `${description} moved the calendar window`);
  };
  await open("task", "one-time");
  await page.locator("#dashOneTimeName").fill("Scroll regression task");
  await page.locator("#dashOneTimeDate").fill("2026-10-26");
  await save("#dashOneTimeForm", "One-time task save");

  await open("job");
  await page.locator("#dashJobName").fill("Scroll regression cutting job");
  await page.locator("#dashJobEstimate").fill("1");
  await page.locator("#dashJobCategory").selectOption("scroll-project");
  await save("#dashJobForm", "Cutting job save");

  const saved = await page.evaluate(() => readCurrentCloudStateReadOnly());
  assert.ok(saved.maintenanceTasksV2.some(task => task.name === "Scroll regression task"));
  assert.ok(saved.cuttingJobs.some(job => job.name === "Scroll regression cutting job"));
  // Closing without saving also leaves the page at the current position.
  await open("task", "one-time");
  const beforeCancel = await page.evaluate(() => window.scrollY);
  const calendarBeforeCancel = await calendarPosition();
  await page.locator('[data-task-card="one-time"] [data-close-modal]').click();
  assert.equal(await page.evaluate(() => window.scrollY), beforeCancel);
  assert.deepEqual(await calendarPosition(), calendarBeforeCancel);
  await load();
  assert.ok((await page.evaluate(() => readCurrentCloudStateReadOnly())).cuttingJobs.some(job => job.name === "Scroll regression cutting job"));
  assert.deepEqual(errors, []);
});
