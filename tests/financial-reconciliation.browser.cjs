"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
for(const timezoneId of ["America/Chicago","Pacific/Kiritimati"])
test(`CJE: financial UI reconciles periods without writes using only a disposable localhost backend (${timezoneId})`,{timeout:90000},async t=>{
  const root=path.resolve(__dirname,".."),server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname,file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"})[path.extname(file)]||"text/plain"}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});
  t.after(()=>browser.close());const context=await browser.newContext({timezoneId,viewport:{width:1440,height:1100},locale:"en-US"});
  await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));page.setDefaultTimeout(8000);
  const out=process.env.OMAX_CJE_SCREENSHOT_DIR;
  if(out)await fs.mkdir(out,{recursive:true});
  await page.clock.setFixedTime(new Date(timezoneId==="America/Chicago"?"2026-10-20T17:00:00Z":"2026-10-19T22:00:00Z"));
  let loads=0;
  const load=async()=>{await page.goto(origin+"/?devsafe=1&cjeLoad="+(++loads)+"#/costs",{waitUntil:"load"});await page.waitForFunction(()=>window.__initialAdoptComplete&&window.OMAXDevSafe?.active);};
  await load();assert.equal(await page.evaluate(()=>typeof firebase),"undefined");assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await page.evaluate(async()=>{
    const ref=FB.docRef,state=(await ref.get()).data();
    const base=(id,extra={})=>({id,cutNumber:`C${String(id).padStart(3,"0")}`,name:"Same project and cut",estimateHours:2,chargeRate:150,costRate:-60,
      materialCost:5,materialQty:3,failurePercent:0,cat:"project",projectNumber:"1254",completedAtISO:"2026-10-20",startISO:"2026-01-01",dueISO:"2026-10-20",priority:1,files:[],manualLogs:[],...extra});
    state.cuttingJobs=[];state.completedCuttingJobs=[base("1"),base("2",{completedAtISO:"2026-10-01",estimateHours:2.8,chargeRate:200,costRate:-45,materialQty:2}),
      base("3",{completedAtISO:"2026-10-19",estimateHours:1,costRate:-25,materialQty:5,failurePercent:100}),base("4"),base("5",{completedAtISO:"2025-01-01",estimateHours:1000}),
      base("6",{completedAtISO:"2026-09-01",estimateHours:null,chargeRate:null,costRate:null,failurePercent:undefined}),base("7",{completedAtISO:"2026-10-21"})];
    state.jobFolders=[{id:"jobs_root",name:"All Jobs",parent:null,order:1},{id:"project",name:"1254 Project",projectNumber:"1254",parent:"jobs_root",order:2}];
    state.dailyCutHours=[];state.totalHistory=[{dateISO:"2026-01-01",hours:100},{dateISO:"2026-07-23",hours:190},{dateISO:"2026-09-21",hours:279},{dateISO:"2026-10-20",hours:361}];
    state.tasksInterval=[{id:"filter",name:"Filter",mode:"interval",interval:100,price:100,downtimeHours:2,completedDates:["2026-10-19"],manualHistory:[{dateISO:"2026-10-19",status:"completed",partsCostSnapshot:40}],occurrenceHours:{"2026-10-19":.5}}];
    state.tasksAsReq=[];state.maintenanceTasksV2=[];state.maintenanceCalendarInstancesV2=[];state.maintenanceOccurrencesV2=[];
    state.receiptTrackerWeeks=[{key:"2026-W43",week:43,startISO:"2026-10-19",endISO:"2026-10-25",rows:[{date:"2026-10-20",purchased:"Recorded part",cost:15,qty:2,shipping:4,tax:2},
      {date:"2025-01-01",purchased:"Old purchase",cost:10000,qty:1}]}];
    state.costLayout=Object.fromEntries(Array.from(document.querySelectorAll('[data-cost-window]'),(el,i)=>[el.dataset.costWindow,{x:(i%2)*520,y:Math.floor(i/2)*380,width:500,height:360}]));
    await ref.set(state);
  });
  await load();
  await page.waitForFunction(()=>completedCuttingJobs.length===7);
  const cloud=()=>page.evaluate(async()=>(await FB.docRef.get()).data());
  const loadedSource=()=>page.evaluate(()=>{const state=getCuttingJobImporterState();return JSON.stringify({
    ...Object.fromEntries(Object.getOwnPropertyNames(state).map(key=>[key,state[key]])),jobFolders:window.jobFolders,
    savedCostLayout:window.costLayoutState.layoutById,cloudCostLayout:window.cloudCostLayout,
    layoutStorage:Object.fromEntries(Object.keys(localStorage).filter(key=>/layout/i.test(key)).sort().map(key=>[key,localStorage.getItem(key)]))});});
  const baseline=await cloud(),source=await loadedSource();
  assert.equal(await page.evaluate(()=>completedCuttingJobs.length),7,JSON.stringify(await page.evaluate(()=>({reason:window.__recoveryReason,issues:window.__globalIdentityIssues,body:document.body.innerText.slice(0,2000)}))));
  await page.evaluate(()=>{
    window.__financialSaveCalls=0;
    for(const name of ["saveCloudNow","saveCloudDebounced","markLocalMutation","persistLocalStateBackup"])
      window[name]=()=>{window.__financialSaveCalls++;throw Error("Reconciliation must not save: "+name);};
    window.__financialDialogReference=document.getElementById('financialBreakdownModal');
    window.__financialHashListeners=0;const add=window.addEventListener.bind(window);
    window.addEventListener=(name,...args)=>{if(name==='hashchange')window.__financialHashListeners++;return add(name,...args);};
  });
  const card=key=>page.locator(`[data-card-key="${key}"] .cost-card-value`);
  const popup=page.locator('#financialBreakdownModal'),close=page.locator('[data-close-financial-breakdown]');
  assert.equal(await page.locator('#costLayout.has-custom-layout').count(),1);
  assert.equal(await page.locator('[data-cost-window="overview"]').evaluate(el=>getComputedStyle(el).position),'absolute');
  assert.equal(await popup.evaluate(el=>el.parentElement===document.body&&!el.closest('.dashboard-layout')),true);
  assert.equal(await page.locator('#costLayout [data-financial-breakdown]').count(),0);
  assert.equal(await card("combinedImpact").textContent(),"Unavailable");
  for(const range of ["7d","30d","90d","182d","365d","all"]){
    await page.locator("#costFinancialPeriod").selectOption(range);
    const expected=await page.evaluate(()=>OMAXFinancialReconciliation.selectJobs(completedCuttingJobs,{profit:computeCuttingJobProfit,range:window.__cuttingFinancialRange,today:"2026-10-20"}).totals);
    const formatted=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(expected.net);
    assert.equal((await card("cuttingJobs").textContent()).replace(/^\+/,""),formatted);
    await page.locator("[data-open-financial-breakdown]").click();
    assert.equal(await popup.evaluate(el=>el.matches(':modal')),true,'native top layer is above all cards');
    assert.equal(await popup.locator('[data-financial-metric="net"]').textContent(),formatted);
    assert.equal(await popup.locator('[data-financial-metric="count"]').textContent(),String(expected.count));
    assert.equal(await page.locator('#financialBreakdownPeriod').inputValue(),range);
    assert.equal(await page.locator('[data-close-financial-breakdown]:focus').count(),1);
    assert.match(await page.locator("[data-financial-breakdown]").textContent(),/Net Waterjet Financial Impact: Unavailable/);
    const included=await page.locator("[data-financial-job-id]").count();assert.equal(included,expected.count);
    const model=await page.evaluate(()=>computeCostModel());assert.equal(model.financialReconciliation.totals.count,expected.count);
    assert.equal(model.jobCategoryAnalytics.selected.metrics.jobCount,expected.count);
    assert.ok(Math.abs(model.jobCategoryAnalytics.selected.metrics.totalCost-expected.net)<1e-9);
    assert.ok(Math.abs(model.efficiencySnapshot.rows.reduce((sum,row)=>sum+row.totalProfitValue,0)-expected.net)<1e-9);
    assert.equal(await card("combinedImpact").textContent(),"Unavailable");
    await page.locator('[data-close-financial-breakdown]').click();
    await page.waitForFunction(()=>document.activeElement?.matches('[data-open-financial-breakdown]'));
  }
  assert.match(await page.locator("[data-financial-breakdown]").textContent(),/Hours Taken missing\/invalid/);
  assert.match(await page.locator("[data-financial-breakdown]").textContent(),/Failed-cut percentage unknown/);
  await page.locator("#costFinancialPeriod").selectOption("7d");
  await page.locator("[data-open-financial-breakdown]").click();
  // Reuse one dialog across live period changes and normal Cost rerenders.
  for(const range of ['30d','all','7d']){
    await page.locator('#financialBreakdownPeriod').focus();
    await page.locator('#financialBreakdownPeriod').selectOption(range);
    assert.equal(await page.locator('#costFinancialPeriod').inputValue(),range);
    assert.equal(await popup.evaluate(el=>el.open&&el===window.__financialDialogReference),true);
    assert.equal(await page.locator('#financialBreakdownPeriod:focus').count(),1,await page.evaluate(()=>document.activeElement?.outerHTML));
    assert.equal(await popup.locator('[data-financial-metric="net"]').textContent(),(await card('cuttingJobs').textContent()).replace(/^\+/,''));
  }
  await popup.locator('.financial-secondary > summary').click();
  await page.evaluate(()=>renderCosts());
  assert.equal(await popup.locator('.financial-secondary').evaluate(el=>el.open),true);
  assert.equal(await popup.evaluate(el=>el.open&&el===window.__financialDialogReference),true);
  assert.equal(await popup.locator('input').count(),0,'saved report has no editable rate inputs');
  await close.focus();
  for(let i=0;i<16;i++){
    await page.keyboard.press(i<12?'Tab':'Shift+Tab');
    assert.equal(await popup.evaluate(el=>el.contains(document.activeElement)||(document.activeElement===document.body&&!document.hasFocus())),true,'native modal keeps background controls inert; browser chrome remains accessible');
  }
  await close.focus();await page.evaluate(()=>document.querySelector('[data-open-financial-breakdown]').focus());
  assert.equal(await page.locator('[data-close-financial-breakdown]:focus').count(),1,'background controls cannot take focus');
  await popup.locator('.financial-secondary > summary').click();
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('financialBreakdownModal').open&&document.activeElement?.matches('[data-open-financial-breakdown]'));
  assert.equal(await page.locator('[data-open-financial-breakdown]:focus').count(),1);
  await page.locator('[data-open-financial-breakdown]').press('Enter');
  assert.equal(await popup.evaluate(el=>el.matches(':modal')),true);
  assert.equal(await page.locator("[data-financial-job-id]").count(),3); // two distinct identical cuts plus the loss
  assert.equal((await card("cuttingJobs").textContent()).replace(/^\+/,""),"$280.00");
  assert.equal(await card("recordedPurchases").textContent(),"-$36.00");
  assert.equal(await card("maintenanceExpenses").textContent(),"-$55.00");
  assert.match(await card("maintenanceForecast").textContent(),/^-\$/);
  assert.match(await card("cuttingJobs").getAttribute("class"),/financial-tone-positive/);
  assert.match(await card("recordedPurchases").getAttribute("class"),/financial-tone-negative/);
  const breakdown=await page.locator("[data-financial-breakdown]").textContent();
  assert.equal(await popup.locator('[data-financial-metric="revenue"]').textContent(),'$600.00');
  assert.equal(await popup.locator('[data-financial-metric="runtime"]').textContent(),'-$265.00');
  assert.equal(await popup.locator('[data-financial-metric="material"]').textContent(),'-$55.00');
  assert.match(breakdown,/Weighted runtime expense \/ job hour/);assert.match(breakdown,/Interim modeled Cutting Job Net Profit: \$280\.00/);
  assert.match(breakdown,/Original import cells and current saved values can differ/);assert.match(breakdown,/Purchase spending is not allocated/);
  const rate=await page.evaluate(()=>computeCostModel().cutCostFeedback);
  assert.equal(rate.valid,true);assert.equal(rate.actualCuttingHours,171);assert.ok(Math.abs(rate.cutCostPerHour-rate.maintenanceCostPerHour-rate.garnetCostPerHour)<1e-9);
  const bannerRate=await page.evaluate(()=>OMAXCutCostFeedbackUi.calculate());
  assert.equal(bannerRate.endDate,rate.endDate);assert.equal(bannerRate.cutCostPerHour,rate.cutCostPerHour);assert.equal(bannerRate.actualCuttingHours,171);
  assert.match(await page.locator('[data-financial-ccr]').textContent(),/modeled operating-cost estimate/);
  assert.equal(await page.evaluate(()=>computeCostModel().totalSpendPerCutValue),36/5);
  const beforeCalculator=await page.locator('[data-dc-panel="efficiency"]').textContent();
  if(out)await page.screenshot({path:path.join(out,"financial-breakdown-desktop.png")});
  await page.locator("[data-financial-calculator]").click();
  assert.equal(await popup.evaluate(el=>el.open),false);
  assert.equal(await page.locator('#efficiencySnapshotModal').isVisible(),true);
  assert.equal(await page.locator('[data-efficiency-summary-cost]').textContent(),"-$320.00");
  assert.equal(await page.locator('[data-efficiency-summary-runtime]').textContent(),"-$265.00");
  assert.equal(await page.locator('[data-efficiency-summary-material]').textContent(),"-$55.00");
  const table=page.locator('#efficiencySnapshotModal table');assert.equal(await table.locator('thead th').count(),8);
  assert.equal(await table.locator('tbody tr').first().locator('td').count(),8);
  const usage=page.locator('#costTimeEfficiency [data-efficiency-average]');
  await page.locator('#costTimeEfficiency [data-efficiency-range="90"]').click();assert.equal(await usage.textContent(),"1.9 hr");
  assert.match(await page.locator('#costTimeEfficiency [data-efficiency-average-note]').textContent(),/171 meter hours ÷ 89 elapsed calendar days/);
  const calculatorRange=await page.locator('[data-efficiency-calc-range-select]').inputValue();
  await page.locator('#costTimeEfficiency [data-efficiency-range="30"]').click();assert.equal(await usage.textContent(),"2.8 hr");
  assert.match(await page.locator('#costTimeEfficiency [data-efficiency-average-note]').textContent(),/82 meter hours ÷ 29 elapsed calendar days/);
  assert.equal(await page.locator('[data-efficiency-calc-range-select]').inputValue(),calculatorRange);
  await page.locator('[data-efficiency-calc-range-select]').selectOption('1m');assert.equal(await usage.textContent(),"2.8 hr");
  assert.match(await page.locator('#costTimeEfficiency [data-efficiency-window-label]').textContent(),/2026-09-21 to 2026-10-20/);
  if(out)await page.screenshot({path:path.join(out,"utilization-snapshot.png")});
  await page.locator("[data-efficiency-calc-charge]").fill("0");
  assert.equal(await page.locator('[data-dc-panel="efficiency"]').textContent(),beforeCalculator);
  assert.equal((await card("cuttingJobs").textContent()).replace(/^\+/,""),"$280.00");
  await page.keyboard.press("Escape");
  await page.evaluate(()=>{location.hash="#/jobs";});await page.waitForSelector("#jobsFinancialPeriod");
  assert.equal(await page.locator("#jobsFinancialPeriod").inputValue(),"7d");
  assert.match(await page.locator(".past-jobs-summary").textContent(),/280\.00/);
  assert.equal(await page.locator(".past-jobs-summary-wrap + table > tbody > tr[data-history-row]").count(),3);
  await page.locator("#pastJobs > details.financial-breakdown > summary").click();
  await page.locator('[data-history-actions-toggle="7"]').click();
  await page.locator('[data-history-edit="7"]').click();
  assert.equal(await page.locator('[data-history-field="completedAtISO"][data-history-id="7"]').inputValue(),"2026-10-21");
  await page.locator('[data-history-cancel="7"]').click();
  await page.locator("#jobsFinancialPeriod").selectOption("30d");
  assert.match(await page.locator(".past-jobs-summary").textContent(),/704\.00/);
  await page.evaluate(()=>{location.hash="#/costs";});await page.waitForSelector("#costFinancialPeriod");
  assert.equal(await page.locator("#costFinancialPeriod").inputValue(),"30d");
  assert.equal((await card("cuttingJobs").textContent()).replace(/^\+/,""),"$704.00");
  await page.setViewportSize({width:390,height:844});await page.locator("[data-open-financial-breakdown]").click();
  for(const viewport of [{width:320,height:568},{width:720,height:550},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    const bounds=await popup.evaluate(el=>{const box=el.getBoundingClientRect(),body=el.querySelector('.financial-breakdown-body');
      return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:innerWidth,height:innerHeight,overflow:el.scrollWidth>el.clientWidth,bodyOverflow:body.scrollWidth>body.clientWidth,pageOverflow:document.documentElement.scrollWidth>innerWidth};});
    assert.ok(bounds.left>=0&&bounds.right<=bounds.width&&bounds.top>=0&&bounds.bottom<=bounds.height,JSON.stringify(bounds));
    assert.equal(bounds.overflow,false,JSON.stringify(bounds));assert.equal(bounds.bodyOverflow,false,JSON.stringify(bounds));assert.equal(bounds.pageOverflow,false,JSON.stringify(bounds));
    for(const metric of ['net','period','count','revenue','runtime','material']){
      const value=popup.locator(`[data-financial-metric="${metric}"]`);await value.scrollIntoViewIfNeeded();assert.equal(await value.isVisible(),true);
    }
    const header=popup.locator('.financial-breakdown-header'),before=(await header.boundingBox()).y;
    await popup.locator('.financial-breakdown-body').evaluate(el=>{el.scrollTop=el.scrollHeight;});
    assert.equal((await header.boundingBox()).y,before);assert.equal(await close.isVisible(),true);
  }
  const included=popup.locator('details').filter({has:page.locator('summary').filter({hasText:/^Included completed jobs/})});
  await included.locator('summary').click();
  const lastValue=included.locator('tbody tr').last().locator('td').last();await lastValue.scrollIntoViewIfNeeded();
  const tableBounds=await lastValue.evaluate(el=>{const box=el.getBoundingClientRect(),container=el.closest('.financial-table-scroll').getBoundingClientRect();return {left:box.left,right:box.right,min:container.left,max:container.right};});
  assert.ok(tableBounds.left>=tableBounds.min-1&&tableBounds.right<=tableBounds.max+1,JSON.stringify(tableBounds));
  await included.locator('summary').click();await popup.locator('.financial-breakdown-body').evaluate(el=>{el.scrollTop=0;});
  if(out)await page.screenshot({path:path.join(out,"financial-breakdown-mobile.png")});
  const panelOverflow=await page.locator("#financialBreakdownModal").evaluate(el=>({width:el.getBoundingClientRect().width,viewport:innerWidth}));
  assert.ok(panelOverflow.width<=panelOverflow.viewport,JSON.stringify(panelOverflow));
  await page.keyboard.press('Escape');
  // Exercise actual period changes near local midnight, including UTC+14.
  const midnightCases=timezoneId==="America/Chicago" ? [
    ["2026-10-21T04:59:59Z","2026-10-20"],["2026-10-21T05:00:00Z","2026-10-21"]
  ] : [["2026-10-20T09:59:59Z","2026-10-20"],["2026-10-20T10:00:00Z","2026-10-21"]];
  for(const [instant,localDay] of midnightCases){
    await page.clock.setFixedTime(new Date(instant));
    await page.locator("#costFinancialPeriod").selectOption("7d");
    const result=await page.evaluate(()=>{
      const model=computeCostModel(),r=model.financialReconciliation;
      return {end:r.window.endISO,description:r.window.description,net:r.totals.net,ids:r.rows.map(row=>String(row.id)).sort(),
        dataCenterNet:model.efficiencySnapshot.rows.reduce((sum,row)=>sum+row.totalProfitValue,0),
        dataCenterIds:model.efficiencySnapshot.rows.map(row=>row.id).sort(),seriesIds:model.jobSeries.map(point=>point.jobId).sort(),
        seriesDates:model.jobSeries.map(point=>[point.dateISO,completedCuttingJobs.find(job=>String(job.id)===point.jobId).completedAtISO.slice(0,10)])};
    });
    assert.equal(result.end,localDay);assert.deepEqual(result.dataCenterIds,result.ids);assert.deepEqual(result.seriesIds,result.ids);assert.equal(result.dataCenterNet,result.net);
    assert.equal(await page.evaluate(()=>OMAXCutCostFeedbackUi.calculate().endDate),localDay);
    for(const [pointDay,completionDay] of result.seriesDates)assert.equal(pointDay,completionDay);
    const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(result.net);
    assert.equal((await card("cuttingJobs").textContent()).replace(/^\+/,""),money);
    await page.evaluate(()=>{location.hash="#/jobs";});await page.waitForSelector("#jobsFinancialPeriod");
    assert.match(await page.locator("#pastJobs .financial-period").textContent(),new RegExp(localDay));
    assert.ok((await page.locator(".past-jobs-summary").textContent()).includes(money));
    assert.deepEqual((await page.locator(".past-jobs-summary-wrap + table > tbody > tr[data-history-row]").evaluateAll(rows=>rows.map(row=>row.dataset.historyRow))).sort(),result.ids);
    await page.evaluate(()=>{location.hash="#/costs";});await page.waitForSelector("#costFinancialPeriod");
  }
  const anchored=await page.evaluate(()=>{
    const original=window.OMAXFinancialReconciliation;let calls=0;
    window.OMAXFinancialReconciliation={...original,localToday:()=>++calls===1?"2026-10-20":"2026-10-21"};
    try{const model=computeCostModel();return {calls,end:model.financialReconciliation.window.endISO,
      ids:model.financialReconciliation.rows.map(row=>String(row.id)).sort(),dataCenterIds:model.efficiencySnapshot.rows.map(row=>row.id).sort()};}
    finally{window.OMAXFinancialReconciliation=original;}
  });
  assert.equal(anchored.calls,1);assert.equal(anchored.end,"2026-10-20");assert.deepEqual(anchored.ids,["1","3","4"]);
  assert.deepEqual(anchored.dataCenterIds,anchored.ids);
  assert.equal(await page.evaluate(()=>window.__financialSaveCalls),0);
  assert.equal(await loadedSource(),source);
  assert.equal(await popup.count(),1);assert.equal(await page.evaluate(()=>window.__financialHashListeners),0,'rerenders add no navigation listeners');
  assert.deepEqual(await cloud(),baseline);assert.deepEqual(errors,[]);
});
