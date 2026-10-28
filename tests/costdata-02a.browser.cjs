"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright"),{fixture}=require("./fixtures/costdata-01g.cjs");
function chartFixture(){const state=fixture(),task=state.tasksInterval[0];task.downtimeHours=.5;task.manualHistory[0].partsCostSnapshot=170;task.manualHistory.push({id:"explicit-zero",dateISO:"2026-01-03",status:"completed",partsCostSnapshot:20,hours:0},{id:"recorded-duration",dateISO:"2026-01-04",status:"completed",partsCostSnapshot:20,hours:1});return state;}

test("02A concise blue maintenance tooltips, same-day identities, zoom, resize and read-only navigation",{timeout:90000},async t=>{
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
  await p.evaluate(async source=>{if(!OMAXDevSafe.active||typeof firebase!=="undefined")throw Error("Disposable backend required");await FB.docRef.set({...window.__lastLoadedCloudState,...source,syncMeta:window.__lastLoadedCloudState.syncMeta});},chartFixture());await load();
  const baseline=await p.evaluate(async()=>(await FB.docRef.get()).data());
  await p.evaluate(()=>{window.__displayWrites=0;window.__displaySource=JSON.stringify(getCuttingJobImporterState());for(const name of ["saveCloudNow","saveCloudDebounced","markLocalMutation","persistLocalStateBackup"])window[name]=()=>{window.__displayWrites++;throw Error("Chart view must not save: "+name);};});
  const model=await p.evaluate(()=>computeCostModel());assert.equal(model.financialReconciliation.maintenance.knownSubtotal,459);
  assert.equal(-model.maintenanceSeries.reduce((sum,pt)=>sum+pt.value,0),459);
  assert.equal(model.maintenanceAverageValue,-459/9,"Daily aggregate average retains its original basis");
  assert.ok(Math.abs(model.financialReconciliation.forecast.annual-459/299*365)<1e-9,"YTD forecast uses the same resolved complete costs");
  const rate=await p.evaluate(()=>OMAXCutCostFeedback.calculate({state:window,rows:computeCostModel().maintenanceCostRows,today:"2026-10-26",config:{...OMAXCutCostFeedback.DEFAULTS,days:"custom",startDate:"2026-01-01",endDate:"2026-01-15"}}));
  assert.equal(rate.maintenanceCost,255);assert.equal(rate.maintenanceCostPerHour,25.5,"Resolved Jan costs share the cumulative meter's 10-hour denominator");
  assert.equal(model.incompleteMaintenanceMarkers.length,2);assert.equal(model.maintenanceCostRows.find(row=>row.dateISO==="2026-01-02").totalCost,185);
  const canvas=p.locator("#costChart");
  const point=async(date,key="maintenance")=>{
    await canvas.scrollIntoViewIfNeeded();
    const target=await canvas.evaluate((el,{date,key})=>el.__costChartTargets.find(pt=>pt.key===key&&pt.rowRef.dateISO===date),{date,key});assert.ok(target);
    const box=await canvas.boundingBox(),size=await canvas.evaluate(el=>({width:el.width,height:el.height}));
    return {x:box.x+(target.rect.x+target.rect.width/2)*box.width/size.width,y:box.y+(target.rect.y+target.rect.height/2)*box.height/size.height};
  };
  const tip=p.locator(".cost-chart-tooltip[data-visible='true']");
  for(const width of [1440,390])for(const zoom of [1,1.25,2]){
    await p.setViewportSize({width,height:1000});await p.evaluate(zoom=>{document.documentElement.style.zoom=String(zoom);},zoom);
    await p.evaluate(()=>window.dispatchEvent(new Event("resize")));await p.waitForTimeout(100);
    await p.mouse.move(...Object.values(await point("2026-01-02")));await tip.waitFor({state:"visible"});
    assert.match(await tip.innerText(),/Synthetic recorded-parts.*Estimated.*2026-01-02.*Parts: \$170.00.*Labor: 0.5 hr · \$15.00.*Total: \$185.00/s);
    const geometry=await p.evaluate(()=>{const tip=document.querySelector(".cost-chart-tooltip").getBoundingClientRect(),canvas=document.querySelector("#costChart").getBoundingClientRect();return {tip:{x:tip.x,y:tip.y,right:tip.right,bottom:tip.bottom},canvas:{x:canvas.x,y:canvas.y,right:canvas.right,bottom:canvas.bottom},width:innerWidth,height:innerHeight};});
    assert.ok(geometry.tip.x>=geometry.canvas.x-1&&geometry.tip.right<=geometry.canvas.right+1,JSON.stringify(geometry));
    assert.ok(geometry.tip.y>=geometry.canvas.y-1&&geometry.tip.bottom<=geometry.canvas.bottom+1,JSON.stringify(geometry));
    assert.ok(geometry.tip.x>=0&&geometry.tip.right<=geometry.width+1&&geometry.tip.y>=0&&geometry.tip.bottom<=geometry.height+1,JSON.stringify(geometry));
    assert.equal(await tip.evaluate(el=>el.scrollHeight<=el.clientHeight+1),true,"All cost lines must remain visible at this zoom");
    if(process.env.OMAX_COSTDATA_SCREENSHOT_DIR){await fs.mkdir(process.env.OMAX_COSTDATA_SCREENSHOT_DIR,{recursive:true});await p.waitForFunction(()=>getComputedStyle(document.querySelector(".cost-chart-tooltip")).opacity==="1");await p.screenshot({path:path.join(process.env.OMAX_COSTDATA_SCREENSHOT_DIR,`costdata-02a-${width}-${zoom}.png`)});}
    assert.ok((await tip.innerText()).length<220);await p.mouse.click(...Object.values(await point("2026-01-02")));
    assert.equal(await p.locator("[data-incomplete-maintenance-list],[data-incomplete-maintenance-legend]").count(),0);
  }
  await p.evaluate(()=>{document.documentElement.style.zoom="1";});await p.setViewportSize({width:1440,height:1100});await p.waitForTimeout(100);
  const sameDay=await point("2026-04-15");await p.mouse.move(sameDay.x,sameDay.y);const details=new Set([await tip.innerText()]);
  for(let i=0;i<3;i++){await p.mouse.click(sameDay.x,sameDay.y);details.add(await tip.innerText());}
  assert.equal(details.size,3);assert.ok([...details].every(text=>text.length<220));
  const unknown=await point("2026-03-10","maintenanceIncomplete");await p.mouse.click(unknown.x,unknown.y);
  assert.match(await tip.innerText(),/Synthetic unknown.*2026-03-10.*Cost unavailable/s);assert.doesNotMatch(await tip.innerText(),/\$|duration|excluded|forecast/i);
  await p.locator("#toggleCostMaintenance").uncheck();assert.equal(await canvas.evaluate(el=>el.__costChartTargets.some(pt=>pt.key.startsWith("maintenance"))),false);await p.locator("#toggleCostMaintenance").check();
  // Rapid financial controls and timeline buttons stay synchronized.
  for(const range of ["30d","90d","182d","365d","ytd","all"]){await p.selectOption("#costFinancialPeriod",range);const m=await p.evaluate(()=>computeCostModel());assert.equal(m.financialReconciliation.maintenance.knownSubtotal,-m.maintenanceSeries.reduce((sum,pt)=>sum+pt.value,0));}
  await p.locator('[data-cost-range="1"]').click();assert.equal(await p.locator("#costFinancialPeriod").inputValue(),"30d");
  await p.locator('[data-cost-range="all"]').click();
  // Resize only the chart's DOM, without altering saved window preferences.
  const previous=await canvas.evaluate(el=>el.width);await p.locator('[data-cost-window="chart"]').evaluate(el=>{el.style.width="620px";});
  await p.waitForFunction(previous=>document.querySelector("#costChart").width!==previous,previous);
  await p.locator('[data-cost-window="chart"]').evaluate(el=>{el.style.height="300px";});
  const small=await point("2026-01-02");await p.mouse.move(small.x,small.y);
  assert.equal(await tip.evaluate(el=>el.scrollHeight<=el.clientHeight+1),true,"A short saved-size panel scrolls without shrinking/clipping the tooltip");
  const contained=await tip.evaluate(el=>{const tip=el.getBoundingClientRect(),panel=el.closest('.cost-chart-block').getBoundingClientRect();return tip.top>=panel.top&&tip.bottom<=panel.bottom;});assert.equal(contained,true);
  await p.evaluate(()=>{location.hash="#/inventory";});await p.waitForFunction(()=>!document.querySelector("#costChart"));await p.evaluate(()=>{location.hash="#/costs";});await p.waitForSelector("#costChart");
  assert.equal(await p.evaluate(()=>__displayWrites),0);assert.equal(await p.evaluate(()=>JSON.stringify(getCuttingJobImporterState())===__displaySource),true);
  assert.deepEqual(await p.evaluate(async()=>(await FB.docRef.get()).data()),baseline);
  if(process.env.OMAX_COSTDATA_SCREENSHOT_DIR){await fs.mkdir(process.env.OMAX_COSTDATA_SCREENSHOT_DIR,{recursive:true});const pos=await point("2026-01-02");await p.mouse.move(pos.x,pos.y);await p.waitForFunction(()=>getComputedStyle(document.querySelector(".cost-chart-tooltip")).opacity==="1");await p.screenshot({path:path.join(process.env.OMAX_COSTDATA_SCREENSHOT_DIR,"costdata-02a-desktop.png")});}
  await load();assert.equal(await p.evaluate(()=>computeCostModel().financialReconciliation.maintenance.knownSubtotal),459);
  assert.deepEqual(await p.evaluate(async()=>(await FB.docRef.get()).data()),baseline);assert.deepEqual(errors,[]);
});
