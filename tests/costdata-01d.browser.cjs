"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright"),archive=require("../js/maintenanceTaskArchive");
const {fixture,TASK_ID,ARCHIVE_ID,expectedByDate}=require("./fixtures/costdata-01d.cjs");
async function harness(t,timezoneId="America/Chicago"){
  const root=path.resolve(__dirname,".."),server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname,file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)||pathname.split("/").some(part=>part.startsWith("."))){res.writeHead(403).end();return;}
    try{res.writeHead(200,{"Content-Type":{".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"}[path.extname(file)]||"text/plain"}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});t.after(()=>browser.close());
  const context=await browser.newContext({timezoneId,viewport:{width:1440,height:1100}});
  await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));page.setDefaultTimeout(10000);
  await page.clock.setFixedTime(new Date(timezoneId==="America/Chicago"?"2026-10-23T17:00:00Z":"2026-10-23T00:00:00Z"));
  let loads=0;
  const load=async(hash="#/costs")=>{await page.goto(origin+"/?devsafe=1&costdata01d="+(++loads)+hash);await page.waitForFunction(()=>window.__initialAdoptComplete&&window.OMAXDevSafe?.active);assert.equal(await page.evaluate(()=>typeof firebase),"undefined");};
  const cloud=()=>page.evaluate(async()=>(await FB.docRef.get()).data());
  await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);await load();
  const seed=async source=>page.evaluate(async source=>{if(!OMAXDevSafe.active||typeof firebase!=="undefined")throw Error("Disposable backend required");const ref=FB.docRef,state=(await ref.get()).data();await ref.set({...state,...source,syncMeta:state.syncMeta});},source);
  return {page,load,cloud,seed,errors};
}
for(const timezoneId of ["America/Chicago","Pacific/Kiritimati"])
test(`01D actual integrated loading, archived history, chart, and original-ID restoration (${timezoneId})`,{timeout:90000},async t=>{
  const h=await harness(t,timezoneId),p=h.page;await h.seed(fixture());const before=await h.cloud();await h.load();
  assert.equal(await p.evaluate(()=>isRecoveryMode()),false,JSON.stringify(await p.evaluate(()=>window.__globalIdentityIssues)));
  assert.equal(await p.evaluate(()=>canWriteCloud("synthetic archive load check")),true);assert.deepEqual(await h.cloud(),before);
  assert.equal(await p.evaluate(()=>stableStringify(getInventoryIdentityRepairLocalState())===stableStringify(window.__lastLoadedCloudState)),true);
  await p.evaluate(()=>{
    window.__costdata01dBaseline=JSON.stringify(getCuttingJobImporterState());window.__costdata01dWrites=0;window.__costdata01dFunctions={};
    for(const name of ["saveCloudNow","saveCloudDebounced","markLocalMutation","persistLocalStateBackup"]){window.__costdata01dFunctions[name]=window[name];window[name]=()=>{window.__costdata01dWrites++;throw Error("Archive history display must not save: "+name);};}
  });
  for(const range of ["all","ytd","365d","182d","90d","30d"]){
    await p.selectOption("#costFinancialPeriod",range);
    const m=await p.evaluate(()=>computeCostModel()),period=m.financialReconciliation.window;
    const expected=Object.entries(expectedByDate).filter(([date])=>(!period.startISO||date>=period.startISO)&&date<=period.endISO);
    assert.deepEqual(m.maintenanceSeries.map(row=>[row.dateISO,Math.abs(row.value)]),expected);
    assert.equal(m.financialReconciliation.maintenance.knownSubtotal,expected.reduce((sum,[,cost])=>sum+cost,0));
    const targets=await p.evaluate(()=>document.querySelector("#costChart").__costChartTargets);
    assert.deepEqual(targets.filter(row=>row.key==="maintenance").map(row=>row.rowRef.dateISO),expected.map(([date])=>date));
    assert.equal(targets.filter(row=>row.key==="maintenance").reduce((sum,row)=>sum+Math.abs(Number(row.valueLabel.replace(/[^0-9.-]/g,""))),0),expected.reduce((sum,[,cost])=>sum+cost,0));
    assert.equal(m.totalSpendSeries.reduce((sum,row)=>sum-row.value,0),m.financialReconciliation.purchases.total);
    assert.deepEqual(m.jobSeries.map(row=>row.dateISO),["2026-07-15","2026-10-15"].filter(date=>!period.startISO||date>=period.startISO));
    if(range==="all"){
      assert.equal(m.financialReconciliation.maintenance.knownSubtotal,398);assert.equal(m.financialReconciliation.purchases.total,136);
      assert.equal(m.maintenanceCostRows.filter(row=>row.historySourceTaskId===TASK_ID).length,2,"archive collection paths cannot double-count expense");
      assert.deepEqual(m.maintenanceCostRows.filter(row=>row.historySourceTaskId===TASK_ID).map(row=>row.totalCost).sort((a,b)=>a-b),[57,73]);
      assert.equal(m.maintenanceSeries[0].dateISO,"2026-01-05");assert.equal(m.totalSpendSeries[0].dateISO,"2025-12-15");
    }
  }
  assert.equal(await p.evaluate(()=>JSON.stringify(getCuttingJobImporterState())===window.__costdata01dBaseline),true);
  assert.equal(await p.evaluate(()=>__costdata01dWrites),0);assert.deepEqual(await h.cloud(),before);
  await h.load();assert.equal(await p.evaluate(()=>isRecoveryMode()),false);assert.deepEqual(await h.cloud(),before);
  assert.equal(await p.evaluate(()=>computeCostModel().financialReconciliation.maintenance.knownSubtotal),398);
  // Explicit restoration is intentional only in this disposable backend.
  await p.evaluate(()=>{location.hash="#/deleted";});const restore=p.locator(`[data-trash-restore="${ARCHIVE_ID}"]`);await restore.waitFor();assert.equal(await restore.isEnabled(),true);
  await restore.click();await p.locator("[data-confirm-cancel]").click();assert.deepEqual(await h.cloud(),before);
  await restore.click();await p.locator("[data-confirm-confirm]").click();await p.waitForFunction(id=>!maintenanceTaskDeletionApi.isBusy()&&window.tasksInterval.some(task=>task.id===id),TASK_ID);
  const after=await h.cloud(),expected=archive.planRestore(before,ARCHIVE_ID);assert.deepEqual({...after,syncMeta:before.syncMeta},expected);
  assert.equal(after.inventory[38].linkedTaskId,TASK_ID);assert.deepEqual(after.tasksInterval.find(task=>task.id===TASK_ID),before.deletedItems[0].payload);
  assert.equal(await p.evaluate(()=>isRecoveryMode()),false);await h.load();assert.deepEqual(await h.cloud(),after);
  const restored=await p.evaluate(()=>computeCostModel());assert.equal(restored.financialReconciliation.maintenance.knownSubtotal,398);
  assert.equal(restored.maintenanceCostRows.filter(row=>row.historySourceTaskId===TASK_ID).length,2);assert.equal(restored.financialReconciliation.purchases.total,136);assert.deepEqual(h.errors,[]);
});
for(const kind of ["ambiguous","invalid owner"])
test("01D actual integrated browser rejects "+kind+" archive without rewriting evidence",{timeout:30000},async t=>{
  const h=await harness(t),state=fixture();
  if(kind==="ambiguous")state.deletedItems.push({...structuredClone(state.deletedItems[0]),id:"synthetic-second-archive"});else state.deletedItems[0].meta.originalId="different-synthetic-id";
  await h.seed(state);const before=await h.cloud();await h.load();
  assert.equal(await h.page.evaluate(()=>isRecoveryMode()),true);assert.equal(await h.page.evaluate(()=>window.__autosaveDisabled),true);
  assert.equal((await h.page.evaluate(()=>saveCloudNow())).saved,false);assert.deepEqual(await h.cloud(),before);assert.deepEqual(h.errors,[]);
});
