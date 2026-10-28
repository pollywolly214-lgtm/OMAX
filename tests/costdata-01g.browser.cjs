"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright"),{fixture}=require("./fixtures/costdata-01g.cjs");
test("01G integrated period-independent History and verified cancellation/archive/restore preserve actual costs, markers and settings",{timeout:90000},async t=>{
  const root=path.resolve(__dirname,".."),server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname,file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)||pathname.split("/").some(part=>part.startsWith("."))){res.writeHead(403).end();return;}
    try{res.writeHead(200,{"Content-Type":{".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"}[path.extname(file)]||"text/plain"}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});t.after(()=>browser.close());
  const context=await browser.newContext({timezoneId:"America/Chicago",viewport:{width:1440,height:1100},serviceWorkers:"block"});await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const p=await context.newPage(),errors=[];p.on("pageerror",error=>errors.push(error.message));p.setDefaultTimeout(10000);await p.clock.setFixedTime(new Date("2026-10-26T17:00:00Z"));let loads=0;
  const load=async(hash="#/costs")=>{await p.goto(origin+"/?devsafe=1&costdata01g="+(++loads)+hash);await p.waitForFunction(()=>window.__initialAdoptComplete&&OMAXDevSafe.active);assert.equal(await p.evaluate(()=>typeof firebase),"undefined");};
  await load();assert.equal((await p.evaluate(()=>saveCloudNow())).verified,true);await load();assert.equal((await p.evaluate(()=>saveCloudNow())).verified,true);await load();
  await p.evaluate(async source=>{if(!OMAXDevSafe.active||typeof firebase!=="undefined")throw Error("Disposable backend required");await FB.docRef.set({...window.__lastLoadedCloudState,...source,syncMeta:window.__lastLoadedCloudState.syncMeta});},fixture());await load();
  const cloud=()=>p.evaluate(async()=>(await FB.docRef.get()).data());const before=await cloud();
  const snapshot=()=>p.evaluate(()=>{const m=computeCostModel();return {series:m.maintenanceSeries.map(({events,...row})=>row),markers:m.incompleteMaintenanceMarkers.map(row=>[row.sourceEventKey,row.dateISO,row.knownParts,row.knownDuration,row.fullCost]),
    maintenance:m.financialReconciliation.maintenance,totals:m.financialReconciliation.totals,purchases:m.totalSpendSeries,jobs:m.jobSeries,forecast:m.financialReconciliation.forecast,
    layout:window.cloudCostLayout,config:window.appConfig.cutCostFeedback};});
  const baseline=await snapshot();assert.equal(baseline.maintenance.knownSubtotal,216);assert.equal(baseline.markers.length,2);
  await p.evaluate(()=>{window.__costdata01gWrites=0;window.__costdata01gFunctions={};for(const name of ["saveCloudNow","saveCloudDebounced","markLocalMutation","persistLocalStateBackup"]){window.__costdata01gFunctions[name]=window[name];window[name]=()=>{window.__costdata01gWrites++;throw Error("Display must not save: "+name);};}});
  await p.selectOption("#costFinancialPeriod","30d");assert.equal(await p.evaluate(()=>computeCostModel().incompleteMaintenanceMarkers.length),0);
  await p.evaluate(()=>{location.hash="#/settings";});await p.locator('details.task[data-task-id="recorded-parts"]').evaluate(node=>{for(let parent=node;parent;parent=parent.parentElement)if(parent.tagName==="DETAILS")parent.open=true;});
  await p.locator('[data-task-history="recorded-parts"]').click();const modal=p.locator('[data-maintenance-history="recorded-parts"]');
  assert.match(await modal.innerText(),/2026-01-02/);await modal.locator("[data-close]").click();assert.deepEqual(await cloud(),before);
  await p.evaluate(()=>{location.hash="#/costs";});await p.selectOption("#costFinancialPeriod","all");assert.deepEqual(await snapshot(),baseline);
  assert.equal(await p.evaluate(()=>__costdata01gWrites),0);await p.evaluate(()=>{for(const [name,fn]of Object.entries(__costdata01gFunctions))window[name]=fn;});
  const result=await p.evaluate(async()=>{const api=maintenanceCalendarCancellationApi;return api.run(api.review({kind:"legacy",taskId:"recorded-parts",scope:"single",dateISO:"2026-01-02"}));});
  assert.equal(result.verified,true,result.error);assert.equal(await p.evaluate(()=>isRecoveryMode()),false);assert.equal(await p.evaluate(()=>window.__autosaveDisabled),false);
  const cancelled=await cloud();assert.deepEqual(cancelled.tasksInterval[0].manualHistory,before.tasksInterval[0].manualHistory);assert.deepEqual(await snapshot(),baseline);
  assert.equal(await p.evaluate(()=>buildMaintenanceTaskHistory("recorded-parts").find(row=>row.dateISO==="2026-01-02").activeCalendar),false);
  const archived=await p.evaluate(()=>maintenanceTaskDeletionApi.remove("recorded-parts"));assert.equal(archived.verified,true,archived.error);assert.deepEqual(await snapshot(),baseline);
  assert.equal(await p.evaluate(()=>OMAXGlobalIdentityRepair.integrity(window.__lastLoadedCloudState).valid),true);const archivedState=await cloud(),entry=archivedState.deletedItems.find(row=>row.payload?.id==="recorded-parts");
  assert.equal(archivedState.inventory[0].linkedTaskId,entry.payload.id);
  await p.evaluate(()=>{location.hash="#/deleted";});await p.locator(`[data-trash-history="${entry.id}"]`).click();assert.match(await modal.innerText(),/Archived task/);assert.match(await modal.innerText(),/Authorized calendar cancellation/);await modal.locator("[data-close]").click();
  const restored=await p.evaluate(async id=>{const entry=window.deletedItems.find(row=>row.id===id);return maintenanceTaskDeletionApi.restore(id,OMAXMaintenanceTaskArchive.key(entry));},entry.id);
  assert.equal(restored.verified,true,restored.error);assert.deepEqual((await cloud()).tasksInterval.find(row=>row.id==="recorded-parts"),entry.payload);
  assert.equal(await p.evaluate(()=>isRecoveryMode()),false);await load();assert.deepEqual(await snapshot(),baseline);
  const final=await cloud();assert.deepEqual(final.inventory,before.inventory);assert.deepEqual(final.maintenanceOccurrencesV2,before.maintenanceOccurrencesV2);assert.deepEqual(final.receiptTrackerWeeks,before.receiptTrackerWeeks);
  assert.deepEqual(final.completedCuttingJobs,before.completedCuttingJobs);assert.deepEqual(final.appConfig,before.appConfig);
  assert.match(await p.locator('[data-card-key="cuttingJobs"]').innerText(),/Modeled Cutting Job Contribution/);assert.equal(await p.locator("[data-incomplete-event-key]").count(),0);assert.deepEqual(errors,[]);
});
