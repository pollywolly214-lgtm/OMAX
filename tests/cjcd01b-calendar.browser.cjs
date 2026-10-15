"use strict";
// Explicit browser regression: OMAX_PLAYWRIGHT_PATH may point to an existing install.
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
const {jobs}=require("./fixtures/cjcd-shop-log");
const root=path.resolve(__dirname,"..");
for(const timezoneId of ["America/Chicago","Pacific/Kiritimati"])
test(`CJCD full dashboard rerender, History edit, verified saves and backend reload: ${timezoneId}`,{timeout:60000},async t=>{
  const server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname;
    const file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{res.writeHead(200,{"Content-Type":{".html":"text/html",".js":"text/javascript",".css":"text/css"}[path.extname(file)]||"application/octet-stream","Cache-Control":"no-store"}).end(await fs.readFile(file));}
    catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});
  t.after(()=>browser.close());
  const context=await browser.newContext({timezoneId,locale:"en-US"});
  // Fresh disposable profile and localhost-only requests; no production access.
  await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-10-15T17:00:00Z"));page.setDefaultTimeout(8000);
  const load=async()=>{
    await page.goto(origin+"/?devsafe=1",{waitUntil:"load"});
    await page.waitForFunction(()=>window.OMAXDevSafe?.active&&window.__initialAdoptComplete);
    assert.equal(await page.evaluate(()=>typeof window.firebase),"undefined");
  };
  await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  const expected=jobs();
  await page.evaluate(async rows=>{
    if(!OMAXDevSafe.active||typeof firebase!=="undefined")throw Error("Disposable backend required");
    const ref=OMAXDevSafe.db.doc(FB.docRef.path),source=(await ref.get()).data();
    source.cuttingJobs=[];source.completedCuttingJobs=rows.map(job=>({...job,completedAtISO:"2026-10-15",files:[]}));
    source.jobFolders=[{id:"jobs_root",name:"All Jobs",parent:null,order:1},
      ...[["1241","Lady Bird"],["1242","Mesquite"],["1247","Brazos"],["1251","ATM"]].map(([number,name],i)=>({id:`project-${number}`,name:`${number} ${name}`,projectNumber:number,parent:"jobs_root",order:i+2}))];
    await ref.set(source);
  },expected);
  await load();
  const cloud=()=>page.evaluate(()=>readCurrentCloudStateReadOnly());
  const baseline=await cloud();
  const visible=()=>page.locator("#months [data-cal-job]").evaluateAll(nodes=>nodes.map(node=>[node.dataset.calJob,node.closest("[data-date-iso]").dataset.dateIso]).sort((a,b)=>a.join().localeCompare(b.join())));
  assert.equal((await visible()).filter(([,date])=>date==="2026-10-15").length,16);
  // Correct a record while the original calendar DOM is still mounted.
  const moved=expected.at(-1),move=await page.evaluate(job=>saveCuttingJobEdit(job.id,{completedAtISO:job.completedAtISO}),moved);
  assert.equal(move.verified,true,move.error);
  await page.evaluate(()=>{renderCalendar();renderCalendar();});
  assert.deepEqual((await visible()).filter(([id])=>id===moved.id),[[moved.id,moved.completedAtISO]]);
  assert.equal((await visible()).filter(([,date])=>date==="2026-10-15").length,15);
  // Exercise the normal History edit UI for the first correction.
  await page.goto(origin+"/?devsafe=1#/jobs",{waitUntil:"load"});
  await page.waitForFunction(()=>window.__initialAdoptComplete);
  const first=expected[0];
  await page.locator(`[data-history-actions-toggle="${first.id}"]`).click();
  await page.locator(`[data-history-edit="${first.id}"]`).click();
  await page.locator(`[data-history-field="completedAtISO"][data-history-id="${first.id}"]`).fill(first.completedAtISO);
  await page.locator(`[data-history-save="${first.id}"]`).click();
  await page.waitForFunction(id=>window.completedCuttingJobs.find(job=>job.id===id)?.completedAtISO==="2026-10-01",first.id);
  for(const job of expected.slice(1)){
    const result=await page.evaluate(job=>saveCuttingJobEdit(job.id,{completedAtISO:job.completedAtISO}),job);
    assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);assert.notEqual(result.requiresReload,true);
  }
  const saved=await cloud();
  const correct=expected.map(job=>[job.id,job.completedAtISO]).sort((a,b)=>a.join().localeCompare(b.join()));
  await page.evaluate(()=>{location.hash="#/dashboard";});
  await page.waitForSelector("#months [data-cal-job]");
  assert.deepEqual(await visible(),correct);
  // Repeated renders replace the DOM and cannot append obsolete chips.
  await page.evaluate(()=>{renderCalendar();renderCalendar();});assert.deepEqual(await visible(),correct);
  await load();assert.deepEqual(await visible(),correct);assert.deepEqual(await cloud(),saved);
  await page.close();const nextPage=await context.newPage();
  await nextPage.clock.setFixedTime(new Date("2026-10-15T17:00:00Z"));
  await nextPage.goto(origin+"/?devsafe=1",{waitUntil:"load"});
  await nextPage.waitForFunction(()=>window.__initialAdoptComplete);
  assert.deepEqual(await nextPage.locator("#months [data-cal-job]").evaluateAll(nodes=>nodes.map(node=>[node.dataset.calJob,node.closest("[data-date-iso]").dataset.dateIso]).sort((a,b)=>a.join().localeCompare(b.join()))),correct);
  for(const key of ["inventory","totalHistory","dailyCutHours","pumpEff","weeklyCostReports","receiptTrackerWeeks","deletedItems"])assert.deepEqual(saved[key],baseline[key],key);
  for(const job of saved.completedCuttingJobs){const old=baseline.completedCuttingJobs.find(row=>row.id===job.id);for(const key of ["id","projectNumber","material","materialQty","importProvenance","manualLogs","startISO","dueISO"])assert.deepEqual(job[key],old[key]);}
  assert.deepEqual(errors,[]);
});
