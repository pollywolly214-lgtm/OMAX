"use strict";
// Run with OMAX_PLAYWRIGHT_PATH pointing to an installed Playwright package.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path"), http = require("node:http");
const { chromium } = require(process.env.OMAX_PLAYWRIGHT_PATH || "playwright");
const root = process.env.OMAX_POLISH_ROOT || path.resolve(__dirname, "..");

test("POLISH-01 local forms, layout and menus with external network blocked", { timeout: 60000 }, async t => {
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = path.resolve(root, "." + pathname + (pathname.endsWith("/") ? "index.html" : ""));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const data = await fs.readFile(file), ext = path.extname(file);
      res.writeHead(200, { "Content-Type": ({ ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".svg":"image/svg+xml" })[ext] || "text/plain" }).end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless:true, ...(process.platform === "win32" ? { channel:"msedge" } : {}) });
  t.after(() => browser.close());
  const context = await browser.newContext({ timezoneId:"America/Chicago", viewport:{width:1280,height:800} });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(8000);
  await page.clock.setFixedTime(new Date("2026-10-15T02:30:00Z"));
  await page.goto(origin + "/?devsafe=1");
  await page.waitForFunction(() => window.OMAXDevSafe?.active && window.__initialAdoptComplete);
  assert.equal(await page.evaluate(() => typeof firebase), "undefined");

  await t.test("empty Next Due and average-hours widget share dashboard layout", async () => {
    await page.evaluate(() => { window.__polishIntervalTasks = tasksInterval; tasksInterval = []; window.tasksInterval = tasksInterval; renderDashboard(); });
    await assert.doesNotReject(() => page.getByText("Caught up!", {exact:true}).waitFor());
    assert.match(await page.locator("#nextDueBox").innerText(), /No new tasks are required/);
    assert.equal(await page.locator('#dashboardLayout [data-dashboard-window="averageHours"] .average-hours-banner').count(), 1);
    for (const width of [1280, 800, 390]) {
      await page.setViewportSize({width,height:800});
      const rect = await page.locator('[data-dashboard-window="averageHours"]').boundingBox();
      assert.ok(rect.width <= width && rect.x >= 0 && rect.x + rect.width <= width + 1);
    }
    await page.setViewportSize({width:1280,height:800});
    await page.evaluate(() => { tasksInterval = window.__polishIntervalTasks; window.tasksInterval = tasksInterval; });
  });

  await t.test("copy dates update immediately, and an intentionally earlier due date remains invalid", async () => {
    await page.evaluate(() => { window.__copyResult = null; showMakeActiveCopyModal({defaultEnd:"2026-09-02",categories:[{id:"test",name:"1254 Blanco"}],categoryId:"test",onConfirm:async()=>({saved:true,verified:true})}).then(result => window.__copyResult = result); });
    await page.locator("[data-active-copy-start]").fill("2026-10-15");
    assert.equal(await page.locator("[data-active-copy-due]").inputValue(), "2026-10-15");
    assert.equal(await page.locator("[data-active-copy-due]").evaluate(input => input.validity.valid), true);
    await page.locator("[data-active-copy-due]").fill("2026-10-14");
    assert.equal(await page.locator("[data-active-copy-due]").evaluate(input => input.validity.rangeUnderflow), true);
    await page.locator("[data-active-copy-due]").fill("2026-10-15");
    await page.locator("[data-active-copy-submit]").click();
    assert.deepEqual(await page.evaluate(() => window.__copyResult), {startISO:"2026-10-15",dueISO:"2026-10-15",cat:"test"});
  });

  await t.test("fraction dimensions preserve decimals and reject unsafe expressions", async () => {
    const cases = [["3/12",.25],[" .5 / 2 ",.25],["1.25",1.25],["2e-1",.2],["3/0",null],["1/2/3",null],["Math.random()",null],["1+2",null],["0x10",null],["",null]];
    for (const [input, expected] of cases) {
      const value = await page.evaluate(input => { const result = parseCuttingJobDimension(input); return Number.isFinite(result) ? result : null; }, input);
      assert.equal(value, expected, input);
    }
    await page.evaluate(() => { location.hash = "#/jobs"; });
    await page.locator('[aria-controls="jobAddPanel"]').click();
    await page.locator("#jobMaterialLengthFt").fill("3/12");
    await page.locator("#jobMaterialWidthFt").fill("4");
    assert.equal(await page.locator("#jobMaterialLengthFt").evaluate(input => input.validity.valid), true);
    await page.locator("#jobMaterialLengthFt").fill("3/0");
    assert.equal(await page.locator("#jobMaterialLengthFt").evaluate(input => input.validity.customError), true);
    await page.locator("#jobMaterialLengthFt").fill("0.25");
    assert.equal(await page.locator("#jobMaterialLengthFt").evaluate(input => input.validity.valid), true);
  });

  await t.test("active/history Actions remain visible at both viewport edges and still dispatch Edit", async () => {
    await page.evaluate(() => {
      const job = {id:"polish-active",name:"Fixture",estimateHours:1,startISO:"2026-10-14",dueISO:"2026-10-14",cat:"jobs_root",projectNumber:"",priority:1,files:[],notes:""};
      cuttingJobs = [job]; completedCuttingJobs = [{...job,id:"polish-past",completedAtISO:"2026-10-14"}];
      window.cuttingJobs = cuttingJobs; window.completedCuttingJobs = completedCuttingJobs; renderJobs();
    });
    for (const kind of ["job","history"]) {
      const id = kind === "job" ? "polish-active" : "polish-past";
      const trigger = page.locator(`[data-${kind}-actions-toggle="${id}"]`);
      for (const width of [1280,390]) {
        await page.setViewportSize({width,height:500});
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        const menu = page.locator(`[data-${kind}-actions-menu="${id}"]`), rect = await menu.boundingBox();
        assert.ok(rect && rect.x >= 7 && rect.y >= 7 && rect.x + rect.width <= width - 7 && rect.y + rect.height <= 493, JSON.stringify({kind,width,rect}));
        assert.equal(await menu.evaluate(el => el.matches(":popover-open")), true);
        await page.keyboard.press("Escape");
        assert.equal(await menu.isVisible(), false);
      }
      await page.setViewportSize({width:1280,height:800});
      await trigger.click();
      await page.locator(`[data-${kind}-actions-menu="${id}"] [data-${kind === "job" ? "edit-job" : "history-edit"}="${id}"]`).click();
      assert.equal(await page.locator(kind === "job" ? `[data-save-job="${id}"]` : `[data-history-save="${id}"]`).count(), 1);
      await page.locator(kind === "job" ? `[data-cancel-job="${id}"]` : `[data-history-cancel="${id}"]`).click();
    }
  });

  await t.test("readable RPM popup and main's nearest-point selection at DPR 1/2, resized and expanded", async () => {
    for(const dpr of [1,2]){
      const isolated=dpr===1?null:await browser.newContext({timezoneId:"America/Chicago",viewport:{width:1280,height:800},deviceScaleFactor:dpr});
      if(isolated)await isolated.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      const tab=isolated?await isolated.newPage():page;
      if(isolated){tab.on("pageerror",error=>errors.push(error.message));await tab.clock.setFixedTime(new Date("2026-10-15T02:30:00Z"));await tab.goto(origin+"/?devsafe=1");await tab.waitForFunction(()=>window.OMAXDevSafe?.active&&window.__initialAdoptComplete);}
      try{
        await tab.evaluate(()=>{
          if(!OMAXDevSafe.active||typeof firebase!=="undefined")throw Error("Disposable backend required");
          window.pumpEff={baselineRPM:1353,baselineDateISO:"2026-01-01",notes:[],entries:Array.from({length:141},(_,i)=>({dateISO:new Date(Date.UTC(2026,9,14-140+i)).toISOString().slice(0,10),rpm:1400+i,timeISO:"09:00"}))};
          window.pumpChartRange="1y";location.hash="#/dashboard";renderDashboard();
        });
        for(const mode of ["normal","resized","expanded"]){
          if(mode==="resized")await tab.setViewportSize({width:1000,height:850});
          if(mode==="expanded")await tab.locator(".pump-expand-btn").click();
          const canvas=tab.locator("#pumpChart");await canvas.evaluate(el=>el.scrollIntoView({block:"center"}));
          await tab.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          const points=await canvas.evaluate(canvas=>{
            const targets=canvas.__pumpChartTargets,box=canvas.getBoundingClientRect(),dpr=devicePixelRatio,pair=targets.slice(-3,-1);
            const distance=Math.hypot(pair[0].centerX-pair[1].centerX,pair[0].centerY-pair[1].centerY);
            return pair.map(target=>({key:target.key,dateISO:target.dateISO,rpm:target.rpm,distance,radius:target.hitRadius,
              x:box.left+target.centerX*dpr/canvas.width*box.width,y:box.top+target.centerY*dpr/canvas.height*box.height,
              alpha:canvas.getContext("2d").getImageData(Math.round(target.centerX*dpr),Math.round(target.centerY*dpr),1,1).data[3]}));
          });
          for(const point of points){
            assert.ok(point.distance>0&&point.distance<point.radius&&point.alpha>0,JSON.stringify({dpr,mode,point}));
            await tab.mouse.move(point.x,point.y);
            const tooltip=tab.locator(".pump-chart-tooltip[data-visible='true']");await tooltip.waitFor({state:"visible"});
            assert.equal(await canvas.evaluate(el=>el.__pumpChartHoveredKey),point.key,JSON.stringify({dpr,mode,point}));
            assert.equal(await tooltip.locator(".value").innerText(),point.rpm.toLocaleString("en-US")+" RPM");
            assert.equal(await tooltip.locator(".value").evaluate(el=>getComputedStyle(el).color),"rgb(255, 255, 255)");
            await tab.mouse.click(point.x,point.y);
            assert.equal(await tab.locator(".pump-point-rpm").innerText(),point.rpm.toLocaleString("en-US")+" RPM");
            assert.equal(await tab.locator(".pump-notes-header").evaluate(el=>getComputedStyle(el).color),"rgb(3, 19, 54)");
            assert.ok((await tab.locator(".pump-notes-subtitle").innerText()).includes("9:00"));
            await tab.locator("[data-pump-notes-close]").click();
          }
          await tab.mouse.move(0,0);assert.equal(await canvas.evaluate(el=>el.__pumpChartHoveredKey??null),null);
          if(mode==="expanded")await tab.locator(".pump-expand-btn").click();
        }
      }finally{if(isolated)await isolated.close();}
    }
    await page.setViewportSize({width:1280,height:800});
  });

  await t.test("maintenance import and range export use existing readable controls", async () => {
    await page.evaluate(() => { document.querySelectorAll(".pump-chart-wrap").forEach(el => { if(el.style.position === "fixed") el.remove(); }); location.hash = "#/settings"; });
    await page.locator("#explorer .history-import-admin").waitFor();
    assert.equal(await page.locator("#explorer .history-import-admin").evaluate(el => getComputedStyle(el).color), "rgb(3, 19, 54)");
    await page.evaluate(() => { location.hash = "#/costs"; });
    await page.locator("[data-cost-receipt-open]").click();
    assert.equal(await page.locator(".cost-receipt-summary-controls [data-receipt-export-range]").count(), 1);
    assert.equal(await page.locator(".cost-receipt-controls [data-receipt-export-range]").count(), 0);
    const nameLayout = await page.evaluate(() => {
      const row = document.createElement("tr");
      row.innerHTML = '<td>2026-10-14</td><td>' + 'LongName'.repeat(80) + '</td><td>PART-123</td>' + '<td>0</td>'.repeat(7);
      document.querySelector('[data-receipt-range-rows]').replaceChildren(row);
      const cell = row.cells[1], next = row.cells[2], range = document.createRange();
      range.selectNodeContents(cell);
      const textBox = range.getBoundingClientRect();
      return {cellWidth:cell.clientWidth,scrollWidth:cell.scrollWidth,textRight:textBox.right,nextLeft:next.getBoundingClientRect().left};
    });
    assert.ok(nameLayout.scrollWidth <= nameLayout.cellWidth + 1 && nameLayout.textRight <= nameLayout.nextLeft, JSON.stringify(nameLayout));
  });
  assert.deepEqual(errors, [], "browser JavaScript errors");
});
