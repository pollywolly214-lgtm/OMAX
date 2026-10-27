"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path"), http = require("node:http");
const {chromium} = require(process.env.OMAX_PLAYWRIGHT_PATH || "playwright");
const root = path.resolve(__dirname, "..");

test("DASHFIX Dashboard with disposable cloud and external requests blocked", {timeout:120000}, async t => {
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = path.resolve(root, "." + pathname + (pathname.endsWith("/") ? "index.html" : ""));
    if (!file.startsWith(root + path.sep) || pathname.split("/").some(part=>part.startsWith("."))){res.writeHead(403).end();return;}
    try {res.writeHead(200, {"Content-Type":({".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".svg":"image/svg+xml"})[path.extname(file)] || "text/plain"}).end(await fs.readFile(file));}
    catch {res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0, "127.0.0.1", resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({headless:true, ...(process.platform === "win32" ? {channel:"msedge"} : {})});
  t.after(()=>browser.close());
  const artifacts = process.env.OMAX_DASHFIX_ARTIFACT_DIR;
  if (artifacts) await fs.mkdir(artifacts, {recursive:true});

  async function fixture(width){
    const context = await browser.newContext({timezoneId:"America/Chicago", viewport:{width,height:900}});
    await context.route("**/*", route=>new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error=>errors.push(error.message));
    page.setDefaultTimeout(10000);
    await page.clock.setFixedTime(new Date("2026-10-26T17:00:00Z"));
    const load = async()=>{
      await page.goto(origin + "/?devsafe=1");
      await page.waitForFunction(()=>window.OMAXDevSafe?.active && window.__initialAdoptComplete);
      assert.equal(await page.evaluate(()=>typeof firebase), "undefined");
    };
    await load();
    assert.equal((await page.evaluate(()=>saveCloudNow())).saved, true);
    await load();
    assert.equal((await page.evaluate(()=>saveCloudNow())).saved, true);
    await page.evaluate(async()=>{
      const ref = OMAXDevSafe.db.doc(FB.docRef.path), state = (await ref.get()).data();
      state.totalHistory = Array.from({length:23}, (_,i)=>({
        dateISO:`2026-10-${String(i+1).padStart(2,"0")}`, hours:100+i,
        id:`dashfix-reading-${i}`, import_event_id:`dashfix-import-${i}`,
        importProvenance:{sourceRecord:{hours:100+i}, source:"disposable"}, note:`Retain ${i}`
      }));
      state.dailyCutHours = [{dateISO:"2026-10-22", hours:1.5, source:"manual"}];
      state.cuttingJobs = [{id:"dashfix-job", name:"Dashfix cutting fixture", cat:"jobs_root", cutNumber:"C001",
        estimateHours:1, startISO:"2026-10-26", dueISO:"2026-10-27", files:[], manualLogs:[]}];
      state.completedCuttingJobs = [{...state.cuttingJobs[0], id:"dashfix-past", name:"Dashfix past fixture", completedAtISO:"2026-10-20", cutNumber:"C002"}];
      // Use an existing task definition with a synthetic historical event.
      const task = state.tasksInterval[0];
      task.name = "Dashfix maintenance fixture";
      task.completedDates = ["2026-10-20"];
      task.manualHistory = [{dateISO:"2026-10-20", status:"completed", source:"history", recordedAtISO:"2026-10-20T12:00:00Z", hoursAtEntry:119}];
      await ref.set(state);
    });
    await load();
    const cloud = ()=>page.evaluate(()=>readCurrentCloudStateReadOnly());
    const label = ()=>page.locator(".total-hours-meta .hint").innerText();
    const open = async()=>{
      page.once("dialog", dialog=>dialog.accept("Matthew7:21"));
      await page.locator("#editLogHistoryBtn").click();
      await page.locator("[data-log-history-form]").waitFor();
    };
    return {context,page,errors,load,cloud,label,open};
  }

  for (const width of [1440,390]) await t.test(`${width}px: top blank rows, editing, identity, protected save and reload`, async()=>{
    const h = await fixture(width), {page} = h;
    try {
      const before = await h.cloud();
      assert.equal(await h.label(), "Last updated: 10/23/2026");
      await h.open();
      const rows = page.locator("[data-log-history-row]");
      await rows.first().evaluate(row=>{window.__originalLogRow=row;});
      await page.locator(".log-history-table-wrap").evaluate(wrap=>{wrap.scrollTop=wrap.scrollHeight;wrap.scrollLeft=wrap.scrollWidth;});
      await page.locator("[data-log-history-add]").click();
      assert.equal(await rows.count(), 24);
      assert.equal(await rows.first().locator("[data-log-history-date]").inputValue(), "");
      assert.equal(await rows.first().locator("[data-log-history-hours]").inputValue(), "");
      assert.equal(await rows.first().locator("[data-log-history-date]").evaluate(el=>el===document.activeElement), true);
      assert.equal(await page.locator(".log-history-table-wrap").evaluate(el=>el.scrollTop), 0);
      assert.equal(await page.locator(".log-history-table-wrap").evaluate(el=>el.scrollLeft), 0);
      if (artifacts) await page.screenshot({path:path.join(artifacts, `new-entry-${width}.png`)});
      assert.equal(await rows.nth(1).evaluate(el=>el===window.__originalLogRow), true);
      await rows.first().locator("[data-log-history-date]").fill("2026-10-24");
      await rows.first().locator("[data-log-history-hours]").fill("124");
      await rows.first().evaluate(row=>{window.__firstDraft=row;});
      await page.locator("[data-log-history-add]").click();
      assert.equal(await page.locator(".log-history-table-wrap").evaluate(el=>el.scrollLeft), 0);
      assert.equal(await rows.nth(1).evaluate(el=>el===window.__firstDraft), true);
      assert.equal(await rows.nth(1).locator("[data-log-history-hours]").inputValue(), "124");
      await rows.first().locator("[data-log-history-date]").fill("2026-10-25");
      await rows.first().locator("[data-log-history-hours]").fill("126");
      // A third draft can be removed without shifting either existing mapping.
      await page.locator("[data-log-history-add]").click();
      await rows.first().locator("[data-log-history-remove]").click();
      await rows.nth(2).locator("[data-log-history-hours]").fill("123");
      const dialogBox = await page.locator(".log-history-dialog").boundingBox();
      assert.ok(dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= width + 1);
      const saveBox = await page.locator("[type=submit].log-history-save").boundingBox();
      assert.ok(saveBox.x >= dialogBox.x && saveBox.x + saveBox.width <= dialogBox.x + dialogBox.width + 1);
      if (artifacts) await page.screenshot({path:path.join(artifacts, `hours-${width}.png`)});
      await page.evaluate(()=>{
        const save = saveCloudNow;
        window.saveCloudNow = (...args)=>(window.__dashfixSave = save(...args));
      });
      await page.locator(".log-history-save").click();
      const saved = await page.evaluate(()=>window.__dashfixSave);
      assert.equal(saved?.saved, true, JSON.stringify(saved));
      const after = await h.cloud();
      assert.deepEqual(after.totalHistory, [...before.totalHistory.slice(0,-1), {...before.totalHistory.at(-1), hours:123},
        {dateISO:"2026-10-24", hours:124}, {dateISO:"2026-10-25", hours:126}]);
      for (const key of ["cuttingJobs","completedCuttingJobs","inventory","inventoryMaterials","receiptTrackerWeeks","tasksInterval","tasksAsReq","maintenanceTasksV2","maintenanceOccurrencesV2","maintenanceCalendarInstancesV2","pumpEff"]){
        assert.deepEqual(after[key], before[key], key);
      }
      assert.equal(after.dailyCutHours.find(row=>row.dateISO === "2026-10-22").hours, 1.5, "manual daily history preserved");
      assert.equal(await h.label(), "Last updated: 10/25/2026");
      const average = await page.evaluate(()=>getAverageDailyCutHours());
      await h.load();
      assert.equal(await h.label(), "Last updated: 10/25/2026");
      assert.equal(await page.evaluate(()=>getAverageDailyCutHours()), average);
      assert.deepEqual((await h.cloud()).totalHistory, after.totalHistory);
      await h.open();
      assert.equal(await rows.first().locator("[data-log-history-date]").inputValue(), "2026-10-25");
      assert.equal(await rows.nth(2).locator("[data-log-history-hours]").inputValue(), "123");
      await page.locator(".log-history-cancel").click();
      assert.deepEqual(h.errors, []);
    } finally {await h.context.close();}
  });

  await t.test("empty editor, direct new Log Hours and same-day edits survive save/refresh", async()=>{
    const h = await fixture(1440), {page} = h;
    try {
      await page.evaluate(async()=>{
        const ref = OMAXDevSafe.db.doc(FB.docRef.path), state = (await ref.get()).data();
        state.totalHistory=[]; state.dailyCutHours=[]; await ref.set(state);
      });
      await h.load();
      assert.equal(await h.label(), "Last updated: —");
      await h.open();
      await page.locator("[data-log-history-add]").click();
      assert.equal(await page.locator(".log-history-empty").count(), 0);
      assert.equal(await page.locator("[data-log-history-hours]").inputValue(), "");
      await page.locator("[data-log-history-remove]").click();
      assert.equal(await page.locator(".log-history-empty").count(), 1);
      await page.locator(".log-history-cancel").click();
      for (const hours of [5,6]){
        await page.locator("#totalInput").fill(String(hours));
        await page.locator("#logBtn").click();
        assert.equal((await page.evaluate(()=>saveCloudNow())).saved, true);
        await h.load();
        assert.equal(await h.label(), "Last updated: 10/26/2026");
        assert.deepEqual((await h.cloud()).totalHistory, [{dateISO:"2026-10-26", hours}]);
      }
      assert.deepEqual(h.errors, []);
    } finally {await h.context.close();}
  });

  await t.test("cloud hydration: edited, imported, out-of-order and missing histories", async()=>{
    const h = await fixture(1440);
    try {
      for (const [history, expected] of [
        [[{dateISO:"2026-10-25", hours:20}, {dateISO:"2026-10-20", hours:19, updatedAtISO:"2026-10-26T17:00:00Z"}], "10/25/2026"],
        [[{dateISO:"2026-10-26", hours:21, import_event_id:"dashfix-new-import", importProvenance:{source:"disposable"}}, {dateISO:"2026-10-25", hours:20}], "10/26/2026"],
        [[], "—"]
      ]){
        await h.page.evaluate(async history=>{
          const ref = OMAXDevSafe.db.doc(FB.docRef.path), state = (await ref.get()).data();
          state.totalHistory=history; await ref.set(state);
        }, history);
        await h.load();
        assert.equal(await h.label(), `Last updated: ${expected}`);
        assert.deepEqual((await h.cloud()).totalHistory, history, "render/hydration does not rewrite history");
      }
      assert.deepEqual(h.errors, []);
    } finally {await h.context.close();}
  });

  for (const width of [1440,390]) await t.test(`${width}px: bubble hidden, suggestions, keyboard and click navigation`, async()=>{
    const h = await fixture(width), {page} = h;
    try {
      const before = await h.cloud();
      const input = page.locator("#dashboardGlobalSearch"), suggestions = page.locator("#dashboardGlobalSearchSuggestions");
      assert.equal(await suggestions.isVisible(), false);
      assert.equal(await suggestions.evaluate(el=>el.getBoundingClientRect().height), 0);
      await input.fill("nonexistent-dashfix-query");
      assert.equal(await suggestions.isVisible(), false);
      await input.fill("Dashfix");
      await suggestions.waitFor({state:"visible"});
      assert.equal(await suggestions.locator("button").count(), 3);
      const box = await suggestions.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
      const searchBox = await input.boundingBox();
      assert.ok(box.y - (searchBox.y + searchBox.height) <= 5, "no empty gap above results");
      if (artifacts) await page.screenshot({path:path.join(artifacts, `search-${width}.png`)});
      // Existing native keyboard controls: Tab through buttons, Enter/Space activate.
      await input.press("Tab");
      assert.equal(await suggestions.locator("button").first().evaluate(el=>el===document.activeElement), true);
      await page.keyboard.press("Enter");
      await page.waitForFunction(()=>location.hash === "#/jobs");
      await page.locator('[data-job-row="dashfix-job"]').waitFor({state:"visible"});
      await h.load();
      await input.fill("Dashfix maintenance");
      await input.press("Tab");
      await page.keyboard.press("Space");
      await page.waitForFunction(()=>location.hash.startsWith("#/settings?taskId="));
      await h.load();
      await input.fill("Dashfix past");
      await suggestions.locator("button").click();
      await page.waitForFunction(()=>location.hash === "#/jobs");
      await page.locator('[data-history-actions-toggle="dashfix-past"]').waitFor({state:"visible"});
      await h.load();
      await input.fill("Dashfix"); await input.fill("");
      assert.equal(await suggestions.isVisible(), false);
      assert.equal(await suggestions.evaluate(el=>el.getBoundingClientRect().height), 0);
      assert.deepEqual((await h.cloud()).totalHistory, before.totalHistory);
      assert.deepEqual(h.errors, []);
    } finally {await h.context.close();}
  });
});
