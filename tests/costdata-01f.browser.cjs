"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright"),{fixture,productionShape}=require("./fixtures/costdata-01f.cjs");
for(const timezoneId of ["America/Chicago","Pacific/Kiritimati"])
test(`02A supersedes 01F partial glyphs while preserving all histories, identities and state (${timezoneId})`,{timeout:90000},async t=>{
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
  assert.equal(pattern.maintenanceDataTable.length,84);assert.equal(pattern.incompleteMaintenanceMarkers.length,2);
  assert.equal(pattern.maintenanceCostRows.filter(row=>!row.costIncomplete).length,82);
  assert.equal(pattern.maintenanceCostRows.filter(row=>row.dateISO<"2026-06-18"&&!row.costIncomplete).length,20);
  assert.equal(pattern.maintenanceSeries[0].dateISO,"2026-01-02");assert.equal(pattern.financialReconciliation.maintenance.knownSubtotal,2530);
  assert.deepEqual(await p.evaluate(async()=>(await FB.docRef.get()).data()),patternBefore);
  await seed(fixture());await load();assert.equal(await p.evaluate(()=>isRecoveryMode()),false);
  const baseline=await p.evaluate(async()=>(await FB.docRef.get()).data());
  await p.evaluate(()=>{window.__costdata01fWrites=0;window.__costdata01fBusiness=JSON.stringify(getCuttingJobImporterState());for(const name of ["saveCloudNow","saveCloudDebounced","markLocalMutation","persistLocalStateBackup"])window[name]=()=>{window.__costdata01fWrites++;throw Error("Chart display must not save: "+name);};});
  for(const range of ["all","ytd","365d","182d","90d","30d"]){
    await p.selectOption("#costFinancialPeriod",range);const m=await p.evaluate(()=>computeCostModel()),period=m.financialReconciliation.window;
    const eligible=date=>(!period.startISO||date>=period.startISO)&&date<=period.endISO;
    const unknown=["2026-03-10","2026-05-25"].filter(eligible);
    assert.deepEqual(m.incompleteMaintenanceMarkers.map(pt=>pt.dateISO).sort(),unknown);
    const complete=[["2026-01-02",-12],["2026-02-04",-25],["2026-04-15",-35],["2026-05-12",0],["2026-06-18",-90],["2026-10-10",-9],["2026-10-20",-45]].filter(([date])=>eligible(date));
    assert.deepEqual(m.maintenanceSeries.map(pt=>[pt.dateISO,pt.value||0]),complete);
    assert.equal(m.financialReconciliation.maintenance.knownSubtotal,-complete.reduce((sum,[,value])=>sum+value,0));
    const targets=await p.evaluate(()=>document.querySelector("#costChart").__costChartTargets);
    assert.equal(targets.filter(pt=>pt.key==="maintenanceIncomplete").flatMap(pt=>pt.rowRefs).length,unknown.length);
    assert.ok(targets.filter(pt=>pt.key==="maintenanceIncomplete").every(pt=>pt.fullCost===null&&pt.knownParts===null));
    assert.equal(targets.filter(pt=>pt.key==="maintenance").length,complete.length);
    if(range==="all"){
      assert.equal(targets.find(pt=>pt.key==="maintenance"&&pt.rowRef.dateISO==="2026-04-15").rowRefs.length,3);
      assert.ok(m.maintenanceCostReconciliation.some(row=>row.dateISO==="2026-01-02"&&row.chartIncluded&&row.totalCost===12));
    }
    assert.equal(await p.locator("[data-incomplete-maintenance-list],[data-incomplete-maintenance-legend]").count(),0);
  }
  await p.selectOption("#costFinancialPeriod","all");
  const unchanged=await p.evaluate(()=>{
    const snapshot=m=>({cards:m.summaryCards,totals:m.financialReconciliation.totals,maintenance:m.financialReconciliation.maintenance,forecast:m.financialReconciliation.forecast,series:m.maintenanceSeries,feedback:m.cutCostFeedback});
    const withMarkers=snapshot(computeCostModel()),build=buildIncompleteMaintenanceMarkers;let withoutMarkers;
    try{buildIncompleteMaintenanceMarkers=()=>[];withoutMarkers=snapshot(computeCostModel());}finally{buildIncompleteMaintenanceMarkers=build;}
    return JSON.stringify(withMarkers)===JSON.stringify(withoutMarkers);
  });assert.equal(unchanged,true,"unknown-price indicators cannot affect financial calculations");
  assert.equal(await p.evaluate(()=>__costdata01fWrites),0);assert.equal(await p.evaluate(()=>JSON.stringify(getCuttingJobImporterState())===__costdata01fBusiness),true);
  assert.deepEqual(await p.evaluate(async()=>(await FB.docRef.get()).data()),baseline);
  await p.evaluate(()=>{location.hash="#/inventory";});await p.waitForFunction(()=>!document.querySelector("#costChart"));await p.evaluate(()=>{location.hash="#/costs";});await p.waitForSelector("#costChart");
  assert.equal(await p.evaluate(()=>computeCostModel().incompleteMaintenanceMarkers.length),2);
  await load();assert.equal(await p.evaluate(()=>computeCostModel().incompleteMaintenanceMarkers.length),2);
  assert.deepEqual(await p.evaluate(async()=>(await FB.docRef.get()).data()),baseline);assert.deepEqual(errors,[]);
});
