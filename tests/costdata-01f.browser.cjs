"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright"),{fixture,productionShape}=require("./fixtures/costdata-01f.cjs");
for(const timezoneId of ["America/Chicago","Pacific/Kiritimati"])
test(`01F incomplete history markers preserve complete costs, identities and state (${timezoneId})`,{timeout:90000},async t=>{
  const root=path.resolve(__dirname,".."),server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname,file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)||pathname.split("/").some(part=>part.startsWith("."))){res.writeHead(403).end();return;}
    try{res.writeHead(200,{"Content-Type":{".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"}[path.extname(file)]||"text/plain"}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});t.after(()=>browser.close());
  const context=await browser.newContext({timezoneId,viewport:{width:1440,height:1100}});await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const p=await context.newPage(),errors=[];p.on("pageerror",error=>errors.push(error.message));p.setDefaultTimeout(10000);
  await p.clock.setFixedTime(new Date(timezoneId==="America/Chicago"?"2026-10-26T17:00:00Z":"2026-10-26T00:00:00Z"));let loads=0;
  const load=async()=>{await p.goto(origin+"/?devsafe=1&costdata01f="+(++loads)+"#/costs");await p.waitForFunction(()=>window.__initialAdoptComplete&&window.OMAXDevSafe?.active);};
  await load();assert.equal(await p.evaluate(()=>typeof firebase),"undefined");assert.equal((await p.evaluate(()=>saveCloudNow())).saved,true);await load();assert.equal((await p.evaluate(()=>saveCloudNow())).saved,true);await load();
  const seed=async source=>p.evaluate(async source=>{if(!OMAXDevSafe.active||typeof firebase!=="undefined")throw Error("Disposable backend required");const state=(await FB.docRef.get()).data();await FB.docRef.set({...state,...source});},source);
  await seed(productionShape());await load();const patternBefore=await p.evaluate(async()=>(await FB.docRef.get()).data()),pattern=await p.evaluate(()=>computeCostModel());
  assert.equal(pattern.maintenanceDataTable.length,84);assert.equal(pattern.incompleteMaintenanceMarkers.length,34);assert.equal(pattern.maintenanceCostRows.filter(row=>!row.costIncomplete).length,50);
  assert.equal(pattern.incompleteMaintenanceMarkers.filter(pt=>pt.dateISO<"2026-06-18").length,22);assert.equal(pattern.incompleteMaintenanceMarkers.filter(pt=>pt.dateISO<"2026-06-18"&&pt.knownParts!==null&&pt.knownDuration===null).length,20);
  assert.equal(pattern.incompleteMaintenanceMarkers.filter(pt=>pt.knownParts===null&&pt.knownDuration===null).length,2);assert.equal(pattern.incompleteMaintenanceMarkers[0].dateISO,"2026-01-02");
  assert.equal(pattern.maintenanceSeries[0].dateISO,"2026-06-18");assert.equal(pattern.financialReconciliation.maintenance.knownSubtotal,2000);assert.deepEqual(await p.evaluate(async()=>(await FB.docRef.get()).data()),patternBefore);
  await seed(fixture());await load();
  assert.equal(await p.evaluate(()=>isRecoveryMode()),false);const baseline=await p.evaluate(async()=>(await FB.docRef.get()).data());
  await p.evaluate(()=>{window.__costdata01fWrites=0;window.__costdata01fBusiness=JSON.stringify(getCuttingJobImporterState());for(const name of ["saveCloudNow","saveCloudDebounced","markLocalMutation","persistLocalStateBackup"])window[name]=()=>{window.__costdata01fWrites++;throw Error("Marker display must not save: "+name);};});
  for(const range of ["all","ytd","365d","182d","90d","30d"]){
    await p.selectOption("#costFinancialPeriod",range);const m=await p.evaluate(()=>computeCostModel()),period=m.financialReconciliation.window;
    const eligible=date=>(!period.startISO||date>=period.startISO)&&date<=period.endISO;
    const expectedDates=["2026-01-02","2026-02-04","2026-03-10","2026-04-15","2026-04-15","2026-04-15","2026-05-12","2026-05-25","2026-10-10"].filter(eligible);
    assert.deepEqual(m.incompleteMaintenanceMarkers.map(pt=>pt.dateISO).sort(),expectedDates);
    assert.equal(new Set(m.incompleteMaintenanceMarkers.map(pt=>pt.sourceEventKey)).size,expectedDates.length);
    const complete=[["2026-06-18",-90],["2026-10-20",-45]].filter(([date])=>eligible(date));assert.deepEqual(m.maintenanceSeries.map(pt=>[pt.dateISO,pt.value]),complete);
    assert.equal(m.financialReconciliation.maintenance.knownSubtotal,-complete.reduce((sum,[,value])=>sum+value,0));
    const targets=await p.evaluate(()=>document.querySelector("#costChart").__costChartTargets),incomplete=targets.filter(pt=>pt.key==="maintenanceIncomplete");
    assert.equal(incomplete.flatMap(pt=>pt.rowRefs).length,expectedDates.length);
    assert.ok(incomplete.every(pt=>pt.fullCost===null));assert.equal(targets.filter(pt=>pt.key==="maintenance").length,complete.length);
    assert.equal(await p.locator("[data-incomplete-event-key]").count(),expectedDates.length);
    if(range==="all"){
      assert.equal(m.incompleteMaintenanceMarkers[0].dateISO,"2026-01-02");assert.equal(m.maintenanceSeries[0].dateISO,"2026-06-18");
      assert.equal(incomplete.find(pt=>pt.knownParts===8).rowRefs.length,2);assert.equal(incomplete.filter(pt=>pt.eventLane).length,2);
      assert.ok(incomplete.filter(pt=>pt.eventLane).every(pt=>!pt.valueLabel.includes("$0")));
      assert.match(m.incompleteMaintenanceMarkers.find(pt=>pt.knownParts===25).detail,/configured estimate/);
      assert.match(m.incompleteMaintenanceMarkers.find(pt=>pt.dateISO==="2026-01-02").detail,/recorded occurrence input.*Missing labor duration/);
      assert.ok(m.maintenanceCostReconciliation.some(row=>row.dateISO==="2026-01-02"&&row.incompleteMarkerIncluded&&!row.chartIncluded&&row.totalCost===null));
    }
  }
  await p.selectOption("#costFinancialPeriod","all");
  const unchanged=await p.evaluate(()=>{
    const snapshot=m=>({cards:m.summaryCards,totals:m.financialReconciliation.totals,maintenance:m.financialReconciliation.maintenance,forecast:m.financialReconciliation.forecast,
      maintenanceSeries:m.maintenanceSeries,purchases:m.totalSpendSeries,jobs:m.jobSeries,feedback:m.cutCostFeedback,average:m.maintenanceAverageValue});
    const withMarkers=snapshot(computeCostModel()),build=buildIncompleteMaintenanceMarkers;let withoutMarkers;
    try{buildIncompleteMaintenanceMarkers=()=>[];withoutMarkers=snapshot(computeCostModel());}finally{buildIncompleteMaintenanceMarkers=build;}
    return JSON.stringify(withMarkers)===JSON.stringify(withoutMarkers);
  });assert.equal(unchanged,true,"marker projection cannot affect calculations");
  const canvas=p.locator("#costChart");await canvas.scrollIntoViewIfNeeded();
  const hover=async predicate=>{const targets=await p.evaluate(()=>document.querySelector("#costChart").__costChartTargets),target=targets.find(predicate),box=await canvas.boundingBox(),size=await canvas.evaluate(el=>({width:el.width,height:el.height}));assert.ok(target);
    await p.mouse.move(box.x+(target.rect.x+target.rect.width/2)*box.width/size.width,box.y+(target.rect.y+target.rect.height/2)*box.height/size.height);return p.locator(".cost-chart-tooltip[data-visible='true']");};
  let tip=await hover(pt=>pt.key==="maintenanceIncomplete"&&pt.knownParts===12);assert.match(await tip.innerText(),/Synthetic recorded-parts.*2026-01-02.*Known parts \$12.00.*Missing labor duration/s);
  tip=await hover(pt=>pt.key==="maintenanceIncomplete"&&pt.rowRef.dateISO==="2026-03-10");assert.match(await tip.innerText(),/Cost unknown.*Parts price unknown.*Missing labor duration/s);assert.doesNotMatch(await tip.innerText(),/\$0\.00/);
  await p.locator("#toggleCostMaintenance").uncheck();assert.equal(await p.evaluate(()=>document.querySelector("#costChart").__costChartTargets.some(pt=>pt.key.startsWith("maintenance"))),false);await p.locator("#toggleCostMaintenance").check();
  await p.locator("[data-incomplete-maintenance-list] > summary").click();assert.equal(await p.locator("[data-incomplete-maintenance-list] li").count(),9);
  await p.setViewportSize({width:390,height:844});await canvas.scrollIntoViewIfNeeded();tip=await hover(pt=>pt.key==="maintenanceIncomplete"&&pt.knownParts===12);assert.match(await tip.innerText(),/Known parts \$12.00/);
  assert.equal(await p.evaluate(()=>document.querySelector(".cost-chart-canvas").scrollWidth<=document.querySelector(".cost-chart-canvas").clientWidth),true);
  assert.equal(await p.evaluate(()=>document.querySelector(".cost-chart-header").scrollWidth<=document.querySelector(".cost-chart-header").clientWidth),true);
  await p.waitForFunction(()=>getComputedStyle(document.querySelector(".cost-chart-tooltip")).opacity==="1");
  const tipBounds=await tip.boundingBox();assert.ok(tipBounds.x>=0&&tipBounds.x+tipBounds.width<=390);
  if(process.env.OMAX_COSTDATA_SCREENSHOT_DIR){await fs.mkdir(process.env.OMAX_COSTDATA_SCREENSHOT_DIR,{recursive:true});await p.screenshot({path:path.join(process.env.OMAX_COSTDATA_SCREENSHOT_DIR,`incomplete-${timezoneId.replaceAll("/","_")}.png`)});}
  assert.equal(await p.evaluate(()=>__costdata01fWrites),0);assert.equal(await p.evaluate(()=>JSON.stringify(getCuttingJobImporterState())===__costdata01fBusiness),true);assert.deepEqual(await p.evaluate(async()=>(await FB.docRef.get()).data()),baseline);
  await p.evaluate(()=>{location.hash="#/inventory";});await p.waitForFunction(()=>!document.querySelector("#costChart"));await p.evaluate(()=>{location.hash="#/costs";});await p.waitForSelector("#costChart");assert.equal(await p.evaluate(()=>computeCostModel().incompleteMaintenanceMarkers.length),9);
  await load();assert.equal(await p.evaluate(()=>computeCostModel().incompleteMaintenanceMarkers.length),9);assert.deepEqual(await p.evaluate(async()=>(await FB.docRef.get()).data()),baseline);assert.deepEqual(errors,[]);
});
