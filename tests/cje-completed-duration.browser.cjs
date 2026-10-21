"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright"),{productionShape}=require("./fixtures/cje-completed-financial");
const {june29}=require('./fixtures/cje-source-evidence');
test("CJE-01G: existing audit and all financial views agree on 172 synthetic records with zero source/backend writes",{timeout:90000},async t=>{
  const root=path.resolve(__dirname,".."),server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname,file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"})[path.extname(file)]||"text/plain"}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});
  t.after(()=>browser.close());const context=await browser.newContext({timezoneId:"America/Chicago",viewport:{width:1440,height:1100},locale:"en-US"});
  await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));page.setDefaultTimeout(10000);
  await page.clock.setFixedTime(new Date("2026-10-21T17:00:00Z"));let loads=0;
  const load=async()=>{await page.goto(origin+"/?devsafe=1&cjeg="+(++loads)+"#/costs",{waitUntil:"load"});await page.waitForFunction(()=>window.__initialAdoptComplete&&window.OMAXDevSafe?.active);};
  await load();assert.equal(await page.evaluate(()=>typeof firebase),"undefined");assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  const jobs=productionShape(),ambiguousIndexes=jobs.map((job,index)=>job.name==='ATM Person Door' ? index : -1).filter(index=>index>=0),sourceCuts=june29();
  ambiguousIndexes.forEach((index,i)=>{jobs[index]={...sourceCuts[i],cat:'project',files:[]};});
  jobs[ambiguousIndexes[3]].importProvenance.thickness_inches='1.1875';
  await page.evaluate(async jobs=>{
    const state=(await FB.docRef.get()).data();state.cuttingJobs=[];state.completedCuttingJobs=jobs;
    state.jobFolders=[{id:"jobs_root",name:"All Jobs",parent:null,order:1},{id:"project",name:"1254 Blanco",projectNumber:"1254",parent:"jobs_root",order:2}];
    await FB.docRef.set(state);
  },jobs);
  await load();await page.waitForFunction(()=>completedCuttingJobs.length===172);
  const cloud=()=>page.evaluate(async()=>(await FB.docRef.get()).data());
  const loadedSource=()=>page.evaluate(()=>{const state=getCuttingJobImporterState();return JSON.stringify({jobFolders:window.jobFolders,...Object.fromEntries(Object.getOwnPropertyNames(state).map(key=>[key,state[key]]))});});
  const baseline=await cloud(),source=await loadedSource();
  await page.evaluate(()=>{window.__cjegWrites=0;for(const name of ["saveCloudNow","saveCloudDebounced","markLocalMutation","persistLocalStateBackup","cuttingJobRepairBackup"])
    window[name]=()=>{window.__cjegWrites++;throw Error("Read-only audit cannot write: "+name);};});
  const expected=await page.evaluate(()=>{
    const model=computeCostModel(),r=model.financialReconciliation;
    return {count:r.totals.count,hours:r.rateAnalysis.hours,net:r.totals.net,audit:{resolved:r.audit.resolved,conflicts:r.audit.durationConflicts,groups:r.audit.duplicateGroups.length,pairs:r.audit.pairingUpperBound},
      dataCount:model.efficiencySnapshot.rows.length,dataHours:model.efficiencySnapshot.rows.reduce((n,row)=>n+row.hoursValue,0),dataNet:model.efficiencySnapshot.rows.reduce((n,row)=>n+row.totalProfitValue,0),
      c074:r.rows.find(row=>row.job.cutNumber==="C074").profit};
  });
  assert.equal(expected.count,172);assert.equal(expected.dataCount,172);assert.ok(Math.abs(expected.net-expected.dataNet)<1e-8);assert.ok(Math.abs(expected.hours-expected.dataHours)<1e-8);
  assert.deepEqual(expected.audit,{resolved:155,conflicts:0,groups:38,pairs:39});assert.equal(expected.c074.hours,12.3);
  const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(expected.net);
  assert.equal((await page.locator('[data-card-key="cuttingJobs"] .cost-card-value').textContent()).replace(/^\+/,""),money);
  await page.locator('[data-financial-breakdown] > summary').click();assert.match(await page.locator('[data-financial-breakdown]').textContent(),/38 possible CUTPDF \/ 616-CUT duplicate groups/);
  assert.match(await page.locator('[data-financial-breakdown]').textContent(),/155 supported zero\/missing durations resolved/);
  assert.equal(await page.locator('[data-financial-job-id]').count(),172);
  await page.evaluate(()=>{location.hash="#/jobs";});await page.waitForSelector("#jobsFinancialPeriod");
  assert.equal(await page.locator('.past-jobs-summary-wrap + table > tbody > tr[data-history-row]').count(),172);
  assert.ok((await page.locator('.past-jobs-summary').textContent()).includes(money));
  const c074=await page.evaluate(()=>completedCuttingJobs.find(job=>job.cutNumber==="C074").id);
  assert.match(await page.locator('[data-history-row]').filter({has:page.locator(`[data-job-net-id="${c074}"]`)}).textContent(),/Financial duration: 12\.3 hr from actualHours; stored estimateHours 0 hr preserved/);
  await page.locator(`[data-history-actions-toggle="${c074}"]`).click();await page.locator(`[data-history-edit="${c074}"]`).click();
  assert.equal(await page.locator(`[data-history-field="estimateHours"][data-history-id="${c074}"]`).inputValue(),"0");
  assert.match(await page.locator('[aria-label="Completed job summary"]').textContent(),/Financial reporting uses 12\.3 hr from actualHours/);
  await page.locator(`[data-history-cancel="${c074}"]`).click();
  await page.evaluate(()=>openReviewedCuttingJobImporter());await page.locator('#cuttingJobRepairAudit').click();
  await page.waitForSelector('#cuttingJobFinancialAudit[data-source-ready="true"]');
  const report=await page.locator('#cuttingJobImportRows').evaluate(el=>JSON.parse(el.dataset.lastRepairAudit));
  assert.equal(report.financial.resolved,155);assert.equal(report.financial.duplicateGroups.length,38);assert.equal(report.readOnly,true);assert.equal(report.stateMutationDetected,false);
  const panel=page.locator('#cuttingJobFinancialAudit');assert.equal(await panel.isVisible(),true);
  assert.match(await panel.textContent(),/88 candidates \/ 88 resolved/);assert.match(await panel.textContent(),/67 candidates \/ 67 resolved/);
  assert.match(await panel.textContent(),/DIFFERENT MATERIAL COSTS/);assert.match(await panel.textContent(),/Ambiguous group — manual review/);
  const ambiguous=panel.locator('[data-financial-duplicate-group]').filter({hasText:"3 CUTPDF / 2 616-CUT"});await ambiguous.locator('summary').first().click();
  assert.match(await ambiguous.textContent(),/ATM Person Door/);assert.match(await ambiguous.textContent(),/6 possible cross-import matches, at most 2 simultaneous pairings/);
  assert.equal(await panel.locator('[data-financial-preview-id]:checked').count(),0);
  const sourceCounts=await panel.locator('[data-source-review-counts]').textContent();
  assert.match(sourceCounts,/Source-confirmed duplicate import: 2/);assert.match(sourceCounts,/Verified separate cuts: 4/);assert.match(sourceCounts,/Insufficient source evidence: 37/);
  assert.equal(await ambiguous.locator('[data-source-pair-status="confirmed"]').count(),2);assert.equal(await ambiguous.locator('[data-source-pair-status="separate"]').count(),4);
  assert.match(await ambiguous.textContent(),/1.1875 differs.*0.1875/);assert.match(await ambiguous.textContent(),/Blank source charge cell/);
  const preview=panel.locator('[data-financial-preview-output]'),first=ambiguous.locator('[data-financial-preview-id]').first();
  const selected=await first.getAttribute('data-financial-preview-id');
  const selectedNet=await page.evaluate(id=>computeCuttingJobProfit(completedCuttingJobs.find(job=>job.id===id)).totalProfit,selected);
  await first.check();
  const remaining=preview.locator('tbody tr').nth(2);
  assert.equal(await remaining.locator('td').first().textContent(),'171');
  assert.equal(await remaining.locator('td').last().textContent(),new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(expected.net-selectedNet));
  assert.match(await preview.textContent(),/Hypothetical modeled totals/);
  await panel.locator('[data-financial-preview-clear]').click();assert.equal(await panel.locator('[data-financial-preview-id]:checked').count(),0);
  assert.equal(await remaining.locator('td').first().textContent(),'172');
  // Simulate a changing read snapshot without altering a loaded business record.
  await page.evaluate(()=>{window.__cjeAudit=OMAXFinancialReconciliation.audit;OMAXFinancialReconciliation={...OMAXFinancialReconciliation,audit:(...args)=>{const result=__cjeAudit(...args);return {...result,previewWindow:{...result.previewWindow,endISO:'2026-10-22'}};}};});
  await first.check();assert.match(await preview.textContent(),/local financial date changed/);
  await page.evaluate(()=>{OMAXFinancialReconciliation={...OMAXFinancialReconciliation,audit:__cjeAudit};});
  await panel.locator('[data-financial-preview-clear]').click();
  const out=process.env.OMAX_CJE_SCREENSHOT_DIR;if(out){await fs.mkdir(out,{recursive:true});await page.screenshot({path:path.join(out,"completed-financial-audit.png")});}
  await page.setViewportSize({width:390,height:844});
  const bounds=await panel.evaluate(el=>({width:el.getBoundingClientRect().width,viewport:innerWidth,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight}));
  assert.ok(bounds.width<=bounds.viewport);assert.ok(bounds.scrollHeight>bounds.clientHeight,"Audit scrolls within its panel");
  if(out)await page.screenshot({path:path.join(out,"completed-financial-audit-mobile.png")});
  await page.locator('#cuttingJobImportClose').click();
  assert.equal(await page.evaluate(()=>window.__cjegWrites),0);assert.equal(await loadedSource(),source);
  assert.deepEqual(await cloud(),baseline);assert.deepEqual(errors,[]);
});
