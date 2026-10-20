"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
test("PROJ-01B browser: navigation, selection, coverage, exact job links, reload and responsive layout",{timeout:120000},async t=>{
  const root=path.resolve(__dirname,".."),server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname,file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)||pathname.split("/").some(part=>part.startsWith("."))){res.writeHead(403).end();return;}
    try{res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"})[path.extname(file)]||"text/plain"}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});t.after(()=>browser.close());
  const context=await browser.newContext({timezoneId:"America/Chicago",viewport:{width:1440,height:1000}});t.after(()=>context.close());
  await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));page.setDefaultTimeout(12000);
  await page.clock.setSystemTime(new Date("2026-10-20T15:00:00Z"));
  const ready=()=>page.waitForFunction(()=>window.OMAXDevSafe?.active&&window.__initialAdoptComplete);
  const cloud=()=>page.evaluate(()=>readCurrentCloudStateReadOnly());
  await page.goto(origin+"/?devsafe=1");await ready();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await page.reload();await ready();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await page.evaluate(async()=>{
    if(!OMAXDevSafe.active||typeof firebase!=="undefined")throw Error("Disposable backend required");
    const ref=OMAXDevSafe.db.doc(FB.docRef.path),state=(await ref.get()).data();
    state.jobFolders=[{id:"jobs_root",name:"All Jobs",parent:null,order:1},{id:"blanco",name:"1254 Blanco",projectNumber:"1254",parent:"jobs_root",order:2},{id:"atm",name:"1251 ATM",projectNumber:"1251",parent:"jobs_root",order:3}];
    const job=(id,extra={})=>({id,name:"Same visible job name",cat:"blanco",projectNumber:"1254",estimateHours:2,chargeRate:150,costRate:-25,materialCost:5,materialQty:5,failurePercent:0,startISO:"2026-10-01",dueISO:"2026-10-01",files:[],manualLogs:[],notes:"",...extra});
    state.cuttingJobs=[job("active",{cutNumber:"C001"})];
    const historical=(id,event,cutNumber)=>job(id,{cat:"atm",projectNumber:"1251",cutNumber,estimateHours:0,actualHours:1,failurePercent:null,completedAtISO:"2026-10-03",import_event_id:event,
      importProvenance:{import_event_id:event,actual_cut_minutes:"60",source_file:"disposable workbook",sourceRowNumber:12},manualLogs:[{dateISO:"2026-10-03",completedHours:1,import_event_id:event}]});
    state.completedCuttingJobs=[job("past",{cutNumber:"C002",failurePercent:50,completedAtISO:"2026-10-01"}),job("unknown",{cutNumber:"C003",failurePercent:null,completedAtISO:"2026-10-02"}),
      historical("atm-job","616-CUT-P01-L001","C004"),historical("atm-other","CUTPDF-20261003-001","C005")];
    await ref.set(state);
  });
  await page.reload();await ready();const before=await cloud();
  await page.locator('#tab-projects').click();await page.locator('#projectSelector').waitFor();
  assert.equal(await page.locator('#tab-projects').getAttribute('class'),"active");
  assert.ok((await page.locator('#projectOptions option').evaluateAll(options=>options.map(option=>option.value))).includes("1254 — Blanco"),await page.locator('.projects-page').textContent());
  await page.locator('#projectSelector').fill("1254 — Blanco");
  await page.waitForURL(url=>url.hash==="#/projects?project=blanco");
  const values=()=>page.locator('.project-summary-grid .project-metric > strong').allTextContents();
  assert.deepEqual(await values(),["3","6 hr","50.0%","$150.00","$75.00","$225.00"]);
  assert.deepEqual(await page.locator('.project-finance-grid .project-metric > strong').allTextContents(),["$300.00","$150.00","$75.00","$150.00"]);
  assert.match(await page.locator('.project-finance-grid').textContent(),/2\/3 jobs with reliable data; partial coverage/);
  const details=page.locator('.project-jobs');assert.equal(await details.getAttribute('open'),null);await details.locator('summary').click();assert.notEqual(await details.getAttribute('open'),null);
  assert.equal(await page.locator('[data-project-job]').count(),3);assert.equal(await page.locator('[data-project-job="past"]').textContent(),"Same visible job name");
  await details.locator('summary').click();assert.equal(await details.getAttribute('open'),null);
  await page.reload();await ready();assert.equal(await page.locator('#projectSelector').inputValue(),"1254 — Blanco");assert.deepEqual(await values(),["3","6 hr","50.0%","$150.00","$75.00","$225.00"]);
  await details.locator('summary').click();await page.locator('[data-project-job="past"]').click();await page.waitForURL(url=>url.hash==="#/jobs");
  await page.locator('[data-history-row="past"]').waitFor({state:"visible"});assert.equal(await page.evaluate(()=>window.pendingJobRowHighlight?.id),"past");
  await page.locator('#tab-projects').click();await page.locator('#projectSelector').fill("1251 — ATM");assert.deepEqual(await values(),["2","2 hr","Unavailable","$50.00","$50.00","$100.00"]);
  assert.match(await page.locator('.project-coverage-notice').textContent(),/may overlap across imports.*All distinct records are currently included/);
  assert.match(await page.locator('.project-summary-grid').textContent(),/2 recorded/);
  assert.deepEqual(await page.locator('.project-finance-grid .project-metric > strong').allTextContents(),["Unavailable","Unavailable","Unavailable","Unavailable"]);
  await page.reload();await ready();assert.equal(await page.locator('#projectSelector').inputValue(),"1251 — ATM");assert.deepEqual(await values(),["2","2 hr","Unavailable","$50.00","$50.00","$100.00"]);
  await details.locator('summary').click();assert.equal(await page.locator('[data-project-job="atm-job"]').count(),1);assert.equal(await page.locator('[data-project-job="atm-other"]').count(),1);
  await page.locator('[data-project-job="atm-other"]').click();await page.waitForURL(url=>url.hash==="#/jobs");await page.locator('[data-history-row="atm-other"]').waitFor({state:"visible"});
  assert.equal(await page.evaluate(()=>window.pendingJobRowHighlight?.id),"atm-other");
  await page.locator('#tab-projects').click();
  await page.locator('#projectSelector').fill("1254 — Blanco");await details.locator('summary').click();await page.locator('[data-project-job="active"]').click();await page.waitForURL(url=>url.hash==="#/jobs");
  await page.locator('[data-job-row="active"]').waitFor({state:"visible"});assert.equal(await page.evaluate(()=>window.pendingJobRowHighlight?.id),"active");
  await page.goto(origin+"/?devsafe=1#/projects?project=blanco");await ready();
  assert.doesNotMatch(await page.locator('.projects-page').textContent(),/may overlap across imports/);
  // Snapshot data updates naturally rerender the selected project without saving totals.
  await page.evaluate(async()=>{const ref=OMAXDevSafe.db.doc(FB.docRef.path),state=(await ref.get()).data();state.cuttingJobs.find(j=>j.id==="active").estimateHours=3;state.syncMeta.rev+=1;await ref.set(state);});
  await page.waitForFunction(()=>document.querySelectorAll('.project-summary-grid .project-metric > strong')[1]?.textContent==="7 hr");
  for(const viewport of [{width:1440,height:1000},{width:768,height:1024},{width:375,height:812}]){
    await page.setViewportSize(viewport);await page.locator('.project-jobs summary').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
    if(process.env.OMAX_SCREENSHOT_DIR){await fs.mkdir(process.env.OMAX_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.OMAX_SCREENSHOT_DIR,`projects-${viewport.width}.png`),fullPage:true});}
    await page.locator('.project-jobs summary').click();
  }
  await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>{document.documentElement.style.zoom="1.5";});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
  const after=await cloud(),expected=structuredClone(before);expected.cuttingJobs.find(j=>j.id==="active").estimateHours=3;expected.syncMeta.rev+=1;
  assert.deepEqual(after,expected);assert.deepEqual(errors,[]);
});
