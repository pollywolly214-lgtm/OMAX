"use strict";
// Run with OMAX_PLAYWRIGHT_PATH pointing to an installed Playwright package.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path"), http = require("node:http");
const { chromium } = require(process.env.OMAX_PLAYWRIGHT_PATH || "playwright");
const root = process.env.OMAX_CJCAT_ROOT || path.resolve(__dirname, "..");

test("CJCAT category manager and edit dialog with external network blocked", { timeout: 60000 }, async t => {
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

  page.on("dialog", dialog => { errors.push("Unexpected native dialog: " + dialog.message()); dialog.dismiss(); });
  const seed = async () => {
    await page.evaluate(() => {
      window.jobCategoryManagerOpen = false;
      jobFolders = [{id:"jobs_root",name:"All Jobs",parent:null}, {id:"blanco",name:"1254 Blanco",projectNumber:"1254",parent:"jobs_root",color:"#336699"}, {id:"other",name:"1242 Mesquite",projectNumber:"1242",parent:"blanco"}];
      cuttingJobs = Array.from({length:5}, (_,i) => ({id:"active-"+i,cat:"blanco",projectNumber:"1254",name:"Individual plate "+i,estimateHours:1,files:[]}));
      completedCuttingJobs = Array.from({length:9}, (_,i) => ({id:"past-"+i,cat:"blanco",projectNumber:"1254",name:"Historical plate "+i,cutNumber:i+1,completedAtISO:"2026-10-12",files:[]}));
      window.jobFolders=jobFolders; window.cuttingJobs=cuttingJobs; window.completedCuttingJobs=completedCuttingJobs;
      renderJobs();
    });
    await page.locator('[data-job-category-open]').click();
  };
  await page.evaluate(() => { location.hash = "#/jobs"; });
  await page.locator('[data-job-category-open]').waitFor();
  const editor = page.locator('#jobCategoryEditor'), form = page.locator('#jobCategoryEditForm');
  const edit = async () => page.locator('[data-job-folder-rename="blanco"]').click();
  const status = form.locator('[role="status"]');
  await t.test("manager appearance, hierarchy, selection, scrolling and responsive dialog", async () => {
    await seed();
    assert.equal(await page.locator('[data-job-folder="blanco"] [data-job-folder="other"]').count(),1);
    const selected = page.locator('[data-job-folder-select="blanco"]');
    const color = await selected.evaluate(el => getComputedStyle(el).color);
    assert.notEqual(color,"rgb(20, 36, 61)");
    assert.equal(await page.locator('[data-job-folder="blanco"]').evaluate(el => getComputedStyle(el).boxShadow),"none");
    assert.equal(await page.locator('[data-job-folder="blanco"]').evaluate(el => getComputedStyle(el).backgroundImage),"none");
    assert.equal(await selected.evaluate(el => getComputedStyle(el).backgroundImage),"none");
    assert.equal(await page.locator('[data-job-folder="blanco"] > .job-folder-row').evaluate(el => getComputedStyle(el).backgroundImage),"none");
    await selected.click();
    assert.equal(await page.locator('#jobCategoryManager').isVisible(),true);
    const wasOpen=await page.locator('[data-job-folder-jobs="blanco"]').evaluate(el=>el.open);
    await page.locator('[data-job-folder-jobs="blanco"] summary').click();
    assert.equal(await page.locator('[data-job-folder-jobs="blanco"]').evaluate(el=>el.open),!wasOpen);
    await page.locator('[data-job-folder-jobs="blanco"] summary').click();
    await edit();
    assert.equal(await form.locator('[data-job-category-current-project]').innerText(),"1254");
    assert.equal(await form.locator('[data-job-category-current-name]').innerText(),"Blanco");
    for (const viewport of [{width:1280,height:800},{width:640,height:400},{width:390,height:700},{width:320,height:400}]) {
      await page.setViewportSize(viewport);
      const rect = await editor.boundingBox();
      assert.ok(rect.x>=0 && rect.x+rect.width<=viewport.width+1 && rect.height<=viewport.height,JSON.stringify(rect));
      assert.equal(await editor.evaluate(el => el.scrollWidth<=el.clientWidth+1),true);
      await form.locator('input[name="categoryName"]').focus();
      for(let i=0;i<6;i++)await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.querySelector('#jobCategoryEditor').contains(document.activeElement)),true);
    }
    await page.setViewportSize({width:1280,height:800});
    await fs.mkdir(path.join(root,'artifacts','cjcat01c'),{recursive:true});
    await page.screenshot({path:path.join(root,'artifacts','cjcat01c','edit-desktop.png')});
    await page.keyboard.press('Escape');
    assert.equal(await editor.isVisible(),false);
    assert.equal(await page.locator('[data-job-folder-rename="blanco"]').evaluate(el=>el===document.activeElement),true);
    await page.locator('.job-category-tree').evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:path.join(root,'artifacts','cjcat01c','manager-desktop.png')});
    await page.setViewportSize({width:390,height:700});
    assert.equal(await page.locator('.job-category-modal-card').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    await page.screenshot({path:path.join(root,'artifacts','cjcat01c','manager-mobile.png')});
    await edit();
    await page.screenshot({path:path.join(root,'artifacts','cjcat01c','edit-mobile.png')});
    await form.locator('[data-job-category-edit-cancel]').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#jobCategoryManager').isVisible(),false);
    assert.equal(await page.locator('[data-job-category-open]').evaluate(el=>el===document.activeElement),true);
    await page.locator('[data-job-category-open]').click();
    await page.locator('.job-category-modal-heading [data-job-category-close]').click();
    assert.equal(await page.locator('#jobCategoryManager').isVisible(),false);
    await page.setViewportSize({width:1280,height:800});
  });
  await t.test("current/new values, live impact, duplicate rejection and cancellation", async () => {
    await seed(); await edit();
    await form.locator('[name="projectNumber"]').fill('1261');
    await form.locator('[name="categoryName"]').fill('Forming');
    assert.match(await form.locator('.job-category-edit-impact').innerText(),/Changing category 1254 Blanco to 1261 Forming.*14 associated Cutting Jobs \(5 Active, 9 Historical\)/);
    await form.locator('[name="projectNumber"]').fill('1242');
    await form.locator('[data-job-category-edit-save]').click();
    assert.match(await status.innerText(),/already claimed/);
    await form.locator('[data-job-category-edit-cancel]').click(); await edit();
    assert.equal(await form.locator('[name="projectNumber"]').inputValue(),'1254');
    assert.equal(await form.locator('[name="categoryName"]').inputValue(),'Blanco');
    await form.locator('[data-job-category-edit-cancel]').click();
  });
  await t.test('color changes and Auto Color remain usable after rerendering',async()=>{
    await seed();
    const picker=page.locator('[data-job-folder-color-input="blanco"]');
    assert.equal(await page.locator('[data-job-folder-color-reset="blanco"]').evaluate(el=>getComputedStyle(el).backgroundImage),'none');
    await picker.evaluate(el=>{el.value='#884422';el.dispatchEvent(new Event('change',{bubbles:true}));});
    assert.equal(await page.evaluate(()=>window.jobFolders.find(row=>row.id==='blanco').color),'#884422');
    await page.locator('[data-job-folder-color-reset="blanco"]').click();
    assert.ok(!await page.evaluate(()=>window.jobFolders.find(row=>row.id==='blanco').color));
    await edit();assert.equal(await editor.isVisible(),true);
    await form.locator('[data-job-category-edit-cancel]').click();
  });
  await t.test('changed job counts require review before saving',async()=>{
    await seed(); await edit();
    await form.locator('[name="categoryName"]').fill('Forming');
    await page.evaluate(()=>{
      window.__categorySaveCalls=0;
      window.saveCuttingJobCategoryChange=async()=>{window.__categorySaveCalls++;return {saved:true,verified:true};};
      window.cuttingJobs.push({id:'new-linked',cat:'blanco',projectNumber:'1254',name:'New plate'});
    });
    await form.locator('[data-job-category-edit-save]').click();
    assert.equal(await page.evaluate(()=>window.__categorySaveCalls),0);
    assert.match(await status.innerText(),/Associated jobs changed/);
    assert.match(await form.locator('.job-category-edit-impact').innerText(),/15 associated Cutting Jobs \(6 Active, 9 Historical\)/);
    await form.locator('[data-job-category-edit-save]').click();
    await editor.waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.__categorySaveCalls),1);
  });
  for (const fields of [{name:'Blanco Updated'},{projectNumber:'1261'},{name:'Forming',projectNumber:'1261'}]) {
    await t.test('save request and pending dismissal guard: '+JSON.stringify(fields),async()=>{
      await seed(); await edit();
      await page.evaluate(() => {
        window.__categoryRequest=null;
        window.saveCuttingJobCategoryChange=request=>{window.__categoryRequest=request;return new Promise(resolve=>window.__resolveCategorySave=resolve);};
      });
      if(fields.name)await form.locator('[name="categoryName"]').fill(fields.name);
      if(fields.projectNumber)await form.locator('[name="projectNumber"]').fill(fields.projectNumber);
      await form.locator('[data-job-category-edit-save]').click();
      assert.match(await status.innerText(),/Saving and verifying/);
      assert.equal(await form.locator('[data-job-category-edit-cancel]').isDisabled(),true);
      await page.keyboard.press('Escape'); assert.equal(await editor.isVisible(),true);
      const request=await page.evaluate(()=>window.__categoryRequest);
      assert.equal(request.expectedActiveCount,5);assert.equal(request.expectedCompletedCount,9);
      assert.equal(request.categoryId,'blanco');
      assert.equal(request.name,fields.name||'Blanco');assert.equal(request.projectNumber,fields.projectNumber||'1254');
      await page.evaluate(()=>window.__resolveCategorySave({saved:false,error:'Permission denied'}));
      await page.waitForFunction(()=>!document.querySelector('[data-job-category-edit-save]').disabled);
      assert.match(await status.innerText(),/Permission denied/);
      assert.equal(await form.locator('[name="categoryName"]').inputValue(),fields.name||'Blanco');
      await page.evaluate(()=>{window.saveCuttingJobCategoryChange=async()=>({saved:true,verified:true});});
      await form.locator('[data-job-category-edit-save]').click();
      await editor.waitFor({state:'hidden'});
      assert.equal(await page.locator('#jobCategoryManager').isVisible(),true);
    });
  }
  await t.test('unverified and indeterminate responses retain edits and prohibit retry',async()=>{
    await seed(); await edit();
    await form.locator('[name="categoryName"]').fill('Forming');
    await page.evaluate(()=>{window.saveCuttingJobCategoryChange=async()=>({saved:true,verified:false,error:'Readback unavailable'});});
    await form.locator('[data-job-category-edit-save]').click();
    assert.equal(await editor.isVisible(),true);assert.match(await status.innerText(),/Readback unavailable/);
    await page.evaluate(()=>{window.saveCuttingJobCategoryChange=async()=>({saved:false,indeterminate:true,error:'Acknowledgement lost'});});
    await form.locator('[data-job-category-edit-save]').click();
    await page.waitForFunction(()=>document.querySelector('#jobCategoryEditForm').dataset.indeterminate==='true');
    assert.match(await status.innerText(),/Do not retry/);
    assert.equal(await form.locator('[name="categoryName"]').inputValue(),'Forming');
    assert.equal(await form.locator('[data-job-category-edit-save]').isDisabled(),true);
    await form.locator('[name="categoryName"]').fill('Forming Revised');
    assert.match(await status.innerText(),/Do not retry/);
    await form.locator('[data-job-category-edit-cancel]').click();
  });
  assert.deepEqual(errors,[]);
});
