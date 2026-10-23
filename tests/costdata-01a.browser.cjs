"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright"),fixture=require("./fixtures/costdata-01a.cjs");
for(const timezoneId of ["America/Chicago","Pacific/Kiritimati"])
test(`COSTDATA-01A historical source-to-display reconciliation (${timezoneId})`,{timeout:90000},async t=>{
  const root=path.resolve(__dirname,".."),server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname,file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"})[path.extname(file)]||"text/plain"}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});t.after(()=>browser.close());
  const context=await browser.newContext({timezoneId,viewport:{width:1440,height:1100}});
  await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));page.setDefaultTimeout(8000);
  await page.clock.setFixedTime(new Date(timezoneId==="America/Chicago"?"2026-10-21T17:00:00Z":"2026-10-21T00:00:00Z"));
  let loads=0;
  const load=async()=>{await page.goto(origin+"/?devsafe=1&costdata="+(++loads)+"#/costs");await page.waitForFunction(()=>window.__initialAdoptComplete&&window.OMAXDevSafe?.active);};
  await load();assert.equal(await page.evaluate(()=>typeof firebase),"undefined");assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await page.evaluate(async source=>{const ref=FB.docRef,state=(await ref.get()).data();Object.assign(state,source);await ref.set(state);},fixture());
  await load();
  const cloud=()=>page.evaluate(async()=>(await FB.docRef.get()).data());
  assert.equal(await page.locator("#costFinancialPeriod").count(),1,JSON.stringify(await page.evaluate(()=>({reason:window.__recoveryReason,issues:window.__globalIdentityIssues,body:document.body.innerText.slice(0,4000)})))+JSON.stringify(errors));
  const before=await cloud();
  await page.evaluate(()=>{
    window.__historyBaseline=JSON.stringify(getCuttingJobImporterState());window.__historyWrites=0;
    for(const name of ["saveCloudNow","saveCloudDebounced","markLocalMutation","persistLocalStateBackup"])
      window[name]=()=>{window.__historyWrites++;throw Error("Historical display must not save: "+name);};
  });
  for(const range of ["ytd","365d","all"]){
    await page.locator('#costFinancialPeriod').selectOption(range);
    const m=await page.evaluate(()=>computeCostModel());
    assert.equal(m.maintenanceDataTable.length,6,JSON.stringify(m.maintenanceDataTable));
    assert.equal(m.purchaseDataTable.length,6);
    assert.equal(m.financialReconciliation.maintenance.knownSubtotal,230);
    assert.equal(m.financialReconciliation.maintenance.incomplete,1);
    assert.equal(m.financialReconciliation.purchases.total,131);
    assert.equal(m.financialReconciliation.purchases.incomplete,1);
    assert.equal(m.maintenanceSeries[0].dateISO,"2026-01-15");assert.equal(m.totalSpendSeries[0].dateISO,"2026-01-15");
    assert.equal(m.maintenanceSeries.reduce((sum,row)=>sum-row.value,0),230);
    assert.equal(m.totalSpendSeries.reduce((sum,row)=>sum-row.value,0),131);
    assert.equal(m.jobSeries.length,2);assert.ok(m.jobSeries.every(row=>row.dateISO>="2026-07-15"));
    assert.equal(m.machineHourHistory.find(row=>row.dateISO==="2026-01-15").usageHours,10);
    assert.equal(m.machineHourHistory.find(row=>row.dateISO==="2026-01-16").usageHours,3);
    assert.equal(m.maintenanceDataTable.filter(row=>row.dateISO==="2026-04-15").length,2,"distinct same-day event IDs survive");
    assert.equal(m.maintenanceDataTable.filter(row=>row.dateISO==="2026-07-15").length,1,"legacy/V2 mirrored completion counts once");
    assert.equal(m.maintenanceDataTable.find(row=>row.dateISO==="2026-01-20").totalCostLabel,"Incomplete");
    assert.equal(m.purchaseDataTable.find(row=>row.purchased==="Unknown price").totalLabel,"Incomplete");
    assert.equal(await page.locator('[data-maintenance-date-iso="2026-01-15"][data-maintenance-row]').count(),1);
    assert.equal(await page.locator('[data-spend-row][data-spend-date-iso="2026-01-15"]').count(),1);
    const targets=await page.evaluate(()=>document.querySelector('#costChart').__costChartTargets.map(row=>row.rowRef));
    assert.ok(targets.some(row=>row.type==="maintenance"&&row.dateISO==="2026-01-15"));
    assert.ok(targets.some(row=>row.type==="spend"&&row.dateISO==="2026-01-15"));
  }
  await page.locator('[data-cost-range="1"]').click();assert.equal(await page.locator('#costFinancialPeriod').inputValue(),"30d");
  let m=await page.evaluate(()=>computeCostModel());
  assert.equal(m.maintenanceDataTable.length,1);assert.equal(m.purchaseDataTable.length,2);assert.equal(m.historyRows.length,1);
  assert.ok(m.machineHourHistory.every(row=>row.dateISO>="2026-09-22"));
  assert.equal(m.financialReconciliation.maintenance.knownSubtotal,70);assert.equal(m.financialReconciliation.purchases.total,36);
  assert.equal(m.totalSpendPerCutValue,18);assert.equal(m.financialReconciliation.totals.net,240);
  assert.equal(await page.locator('[data-spend-row][data-spend-date-iso="2026-01-15"]').count(),0,"dynamic receipt refresh retains period");
  await page.locator('[data-cost-range="ytd"]').click();assert.equal(await page.locator('#costFinancialPeriod').inputValue(),"ytd");
  assert.equal(await page.evaluate(()=>computeCostModel().allMaintenanceDataTable.length),6,"dashboard/task history keeps its complete audit population");
  assert.equal(await page.evaluate(()=>JSON.stringify(getCuttingJobImporterState())===window.__historyBaseline),true,"view calculation leaves all loaded business state unchanged");
  assert.equal(await page.evaluate(()=>window.__historyWrites),0);assert.deepEqual(await cloud(),before);
  // Independent early-year history remains useful when no Cutting Jobs exist.
  await page.evaluate(()=>{window.__savedCompleted=completedCuttingJobs.splice(0);renderCosts();});
  m=await page.evaluate(()=>computeCostModel());assert.equal(m.jobSeries.length,0);assert.equal(m.financialReconciliation.totals.revenue,0);
  assert.equal(m.financialReconciliation.netWaterjetImpact,null);assert.equal(m.totalSpendPerCutValue,null);
  assert.equal(m.maintenanceSeries[0].dateISO,"2026-01-15");assert.equal(m.totalSpendSeries[0].dateISO,"2026-01-15");
  assert.equal(await page.locator('[data-spend-cost-per-cut-label]').textContent(),"INSUFFICIENT DATA");
  // A dense YTD series previously lost January to the chart's 186-point cap.
  await page.evaluate(()=>{
    const rows=Array.from({length:294},(_,index)=>{const date=new Date("2026-01-01T00:00:00Z");date.setUTCDate(date.getUTCDate()+index);return {date:date.toISOString().slice(0,10),purchased:"Dense history "+index,cost:1,qty:1};});
    window.receiptTrackerWeeks.push({key:"dense-fixture",rows});renderCosts();
  });
  const dense=await page.evaluate(()=>({series:computeCostModel().totalSpendSeries.length,targets:document.querySelector('#costChart').__costChartTargets.map(row=>row.rowRef)}));
  assert.equal(dense.series,294);assert.ok(dense.targets.some(row=>row.type==="spend"&&row.dateISO==="2026-01-01"));
  await load();await page.locator('#costFinancialPeriod').selectOption('ytd');m=await page.evaluate(()=>computeCostModel());
  assert.equal(m.financialReconciliation.maintenance.knownSubtotal,230);assert.equal(m.financialReconciliation.purchases.total,131);assert.equal(m.jobSeries.length,2);
  assert.deepEqual(await cloud(),before);assert.deepEqual(errors,[]);
});
