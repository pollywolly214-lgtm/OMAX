"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
test("MCALC global mode updates existing/imported/new jobs, graphs and Projects after verified saves without changing business records",{timeout:90000},async t=>{
  const root=path.resolve(__dirname,".."),server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname,file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"})[path.extname(file)]||"text/plain"}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,channel:"msedge"});t.after(()=>browser.close());
  const context=await browser.newContext({timezoneId:"America/Chicago",viewport:{width:1440,height:1100},locale:"en-US"});
  await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));page.setDefaultTimeout(10000);
  let loads=0;
  const load=async(hash="#/jobs")=>{await page.goto(origin+"/?devsafe=1&mcalcLoad="+(++loads)+hash);await page.waitForFunction(()=>window.OMAXDevSafe?.active&&window.__initialAdoptComplete);};
  const cloud=()=>page.evaluate(async()=>(await FB.docRef.get()).data());
  await load();assert.equal(await page.evaluate(()=>typeof firebase),"undefined");
  assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await load();
  assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await page.evaluate(async()=>{
    const state=(await FB.docRef.get()).data();
    const base={estimateHours:2,chargeRate:200,costRate:45,materialCost:100,materialQty:1,failurePercent:0,cat:"project",projectNumber:"1254",files:[],manualLogs:[],priority:1};
    state.cuttingJobs=[{...base,id:"existing-active",name:"Existing untagged",cutNumber:"C002",startISO:"2026-10-19",dueISO:"2026-10-19",files:[{id:"fixture-file",name:"fixture.dxf",source:"wj_cuts_reference",relativePath:"WJ Cuts/fixture.dxf"}]}];
    state.completedCuttingJobs=[{...base,id:"historic",cutNumber:"C001",name:"Historic imported",estimateHours:0,actualHours:2,materialCostTreatment:"separate",import_event_id:"616-CUT-P01-L1",importProvenance:{actual_cut_minutes:120},completedAtISO:"2026-10-18",startISO:"2026-10-18",dueISO:"2026-10-18",efficiency:{totalProfit:210,gainLoss:210}}];
    state.jobFolders=[{id:"jobs_root",name:"All Jobs",parent:null,order:1},{id:"project",name:"1254 Project",projectNumber:"1254",parent:"jobs_root",order:2}];
    state.appConfig={...state.appConfig,materialCostTreatment:"deduct"};
    await FB.docRef.set(state);
    await loadFromCloud();renderJobs();
  });
  const stabilize=()=>page.evaluate(async()=>{if(hasPendingLocalChanges){const result=await saveCloudNow();if(!result.saved)throw Error(result.error);}});
  await stabilize();
  const baseline=await cloud();
  assert.equal(await page.locator('[data-job-net-id="historic"]').count(),1,JSON.stringify({errors,state:await page.evaluate(()=>({jobs:completedCuttingJobs,filter:window.jobHistoryCategoryFilter,category:window.jobCategoryFilter,recovery:isRecoveryMode(),body:document.body.innerText.slice(0,2500)}))}));
  const configure=async(mode,{delayed=false}={})=>{
    await stabilize();const source=await cloud();
    const launcher=page.locator('[data-material-treatment-launch]');
    if(await launcher.count())await launcher.click();else await page.evaluate(()=>openConfigurationModal(document.getElementById("dashboardConfigLaunch")));
    assert.match(await page.locator('#configMaterialCostHelp').textContent(),/Applies to all Cutting Jobs, including existing and completed jobs/);
    assert.match(await page.locator('#configForm').textContent(),/Before saving: changing modes changes existing displayed financial results and projections/);
    await page.evaluate(()=>{
      const original=resolveAttachmentPreview;window.__mcalcPreviewHydrationCalls=0;
      window.resolveAttachmentPreview=(...args)=>{window.__mcalcPreviewHydrationCalls++;return original(...args);};
    });
    if(delayed)await page.evaluate(()=>{
      const writer=writeAuthoritativeStateSnapshot;
      window.__mcalcOriginalWriter=writer;
      window.writeAuthoritativeStateSnapshot=async(...args)=>{
        const result=await writer(...args);
        if(result.saved)await new Promise(resolve=>window.__mcalcReleaseConfig=resolve);
        return result;
      };
    });
    await page.locator("#configMaterialCostTreatment").selectOption(mode);
    await page.locator("#configSave").click();
    if(delayed){
      await page.waitForFunction(()=>typeof window.__mcalcReleaseConfig==='function'||document.getElementById('configSaveStatus').textContent!=='Saving and verifying Firebase…');
      assert.equal(await page.evaluate(()=>typeof window.__mcalcReleaseConfig),'function',(await page.locator('#configSaveStatus').textContent())+' '+JSON.stringify(await page.evaluate(()=>({ready:FB.ready,user:FB.user,recovery:isRecoveryMode(),disabled:window.__autosaveDisabled,indeterminate:window.__lastIndeterminateSave,block:window.__lastCloudSaveBlock}))));
      assert.equal(await page.evaluate(()=>window.appConfig.materialCostTreatment),source.appConfig.materialCostTreatment);
      assert.equal(await page.locator('#configSave').isDisabled(),true);
      assert.match(await page.locator('[data-material-treatment-active]').textContent(),/Deduct/);
      assert.match(await page.locator('#configSaveStatus').textContent(),/Saving and verifying/);
      await page.evaluate(()=>{window.__mcalcReleaseConfig();window.writeAuthoritativeStateSnapshot=window.__mcalcOriginalWriter;});
    }
    await page.waitForFunction(()=>document.getElementById("configModal").hidden||!!document.getElementById("configSaveStatus").textContent.match(/blocked|unavailable|changed|differ|not saved|uncertain/i));
    assert.equal(await page.locator("#configModal").isVisible(),false,await page.locator("#configSaveStatus").textContent());
    const saved=await cloud(),expected=structuredClone(source);expected.appConfig.materialCostTreatment=mode;expected.syncMeta=saved.syncMeta;
    assert.deepEqual(saved,expected,'A mode-only save must persist only the global setting and sync metadata');
    assert.equal(await page.evaluate(()=>window.__mcalcPreviewHydrationCalls),0,'Financial refresh must not trigger attachment hydration');
    assert.deepEqual(await page.evaluate(()=>({cuttingJobs,completedCuttingJobs})),{cuttingJobs:saved.cuttingJobs,completedCuttingJobs:saved.completedCuttingJobs},'Local protected job records also remain identical to the verified backend');
  };
  assert.match(await page.locator('[data-job-net-id="historic"]').innerText(),/\$210\.00/);
  await configure("separate",{delayed:true});
  const after=await cloud();assert.equal(after.appConfig.materialCostTreatment,"separate");
  for(const key of Object.keys(baseline).filter(key=>!["appConfig","syncMeta"].includes(key)))assert.deepEqual(after[key],baseline[key],key);
  for(const id of ["historic","existing-active"])assert.match(await page.locator(`[data-job-net-id="${id}"]`).innerText(),/\$310\.00/);
  await load();assert.equal(await page.evaluate(()=>window.appConfig.materialCostTreatment),"separate");
  await page.evaluate(()=>openConfigurationModal(document.getElementById("dashboardConfigLaunch")));
  assert.equal(await page.locator("#configMaterialCostTreatment").inputValue(),"separate");
  if(process.env.OMAX_MCALC_SCREENSHOT_DIR){await fs.mkdir(process.env.OMAX_MCALC_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.OMAX_MCALC_SCREENSHOT_DIR,"configuration.png")});}
  await page.locator("#configCancel").click();
  // Existing route/layout initialization may queue a normal save; honor that gate before job mutations.
  await page.evaluate(async()=>{if(hasPendingLocalChanges){const result=await saveCloudNow();if(!result.saved)throw Error(result.error);}});
  const created=await page.evaluate(()=>createCuttingJob({id:"separate-new",name:"New separate cut",estimateHours:2,chargeRate:200,costRate:45,materialCost:100,materialQty:1,failurePercent:0,cat:"project",projectNumber:"1254",startISO:"2026-10-20",dueISO:"2026-10-20",priority:1,files:[],manualLogs:[]}));
  assert.equal(created.saved,true,created.error+" "+JSON.stringify(await page.evaluate(()=>({revision:window.__loadedCloudRevisionForSaveGuard,ready:FB.ready,user:FB.user,pending:hasPendingLocalChanges,recovery:isRecoveryMode(),block:window.__lastCloudSaveBlock,indeterminate:window.__lastIndeterminateSave,canWrite:canWriteCloud('mcalc fixture')}))));assert.equal(created.verified,true);await load();
  assert.equal(Object.hasOwn((await cloud()).cuttingJobs.find(job=>job.id==="separate-new"),"materialCostTreatment"),false);
  await page.evaluate(()=>{window.jobCategoryFilter="jobs_root";renderJobs();});
  const summary=page.locator('[data-job-net-id="separate-new"]');
  assert.match(await summary.innerText(),/cutting profit: \$310\.00/);assert.match(await summary.innerText(),/\$400\.00 \+ material \$100\.00 = \$500\.00/);
  if(process.env.OMAX_MCALC_SCREENSHOT_DIR)await summary.screenshot({path:path.join(process.env.OMAX_MCALC_SCREENSHOT_DIR,"separate-job.png")});
  await configure("deduct");
  assert.equal(await page.evaluate(()=>computeCuttingJobProfit(cuttingJobs.find(job=>job.id==="separate-new")).totalProfit),210);
  assert.match(await page.locator('[data-job-net-id="historic"]').innerText(),/\$210\.00/);
  await page.evaluate(async()=>{if(hasPendingLocalChanges){const result=await saveCloudNow();if(!result.saved)throw Error(result.error);}});
  const completed=await page.evaluate(()=>completeCuttingJob("separate-new",{completedAtISO:"2026-10-20"}));assert.equal(completed.saved,true,completed.error);
  await load("#/costs");
  const totals=await page.evaluate(()=>OMAXFinancialReconciliation.selectJobs(completedCuttingJobs,{profit:computeCuttingJobProfit}).totals);
  assert.equal(totals.net,420);assert.equal(totals.materialExpense,200);assert.equal(totals.materialRecovery,0);assert.equal(totals.customerPrice,800);
  await page.locator('[data-open-financial-breakdown]').click();
  assert.equal(await page.locator('[data-financial-metric="net"]').textContent(),"$420.00");
  assert.equal(await page.locator('[data-financial-metric="materialRecovery"]').textContent(),"$0.00");
  await page.locator('[data-close-financial-breakdown]').click();
  await configure("separate");
  assert.match(await page.locator('[data-card-key="cuttingJobs"] .cost-card-value').textContent(),/\+?\$620\.00/);
  const model=await page.evaluate(()=>{const m=computeCostModel();return {graph:m.jobSeries.reduce((sum,row)=>sum+row.value,0),rows:m.cuttingJobsDataTable.map(row=>row.totalProfitValue),snapshot:m.efficiencySnapshot.totalNetGainLabel,maintenance:m.maintenanceSeries,forecast:m.forecastBreakdown};});
  assert.equal(model.graph,620);assert.deepEqual(model.rows,[310,310]);assert.match(model.snapshot,/620/);
  if(process.env.OMAX_MCALC_SCREENSHOT_DIR)await page.locator('[data-cost-window="overview"]').screenshot({path:path.join(process.env.OMAX_MCALC_SCREENSHOT_DIR,"cost-overview-global.png")});
  await page.locator('[data-open-financial-breakdown]').click();
  assert.equal(await page.locator('[data-financial-metric="net"]').textContent(),"$620.00");
  assert.equal(await page.locator('[data-financial-metric="materialRecovery"]').textContent(),"$200.00");
  await page.locator('[data-financial-calculator]').click();
  assert.equal(await page.locator('[data-efficiency-calc-total]').textContent(),"$620.00");
  await page.locator('button[data-close-efficiency-snapshot]').click();
  await load("#/projects?project=project&active=1");
  assert.match(await page.locator('#projectSummary').innerText(),/global Material Cost Treatment/);
  const projectNet=()=>page.evaluate(()=>ProjectDashboard.build({jobFolders,cuttingJobs,completedCuttingJobs},CuttingJobHistory,computeCuttingJobProfit).projects[0].metrics.net.value);
  assert.equal(await projectNet(),930);assert.match(await page.locator('#projectSummary').innerText(),/930/);
  await configure("deduct");assert.equal(await projectNet(),630);assert.match(await page.locator('#projectSummary').innerText(),/630/);
  await load("#/costs");
  assert.match(await page.locator('[data-card-key="cuttingJobs"] .cost-card-value').textContent(),/\+?\$420\.00/);
  assert.equal(await page.evaluate(()=>computeCostModel().jobSeries.reduce((sum,row)=>sum+row.value,0)),420);
  assert.deepEqual(await page.evaluate(()=>({maintenance:computeCostModel().maintenanceSeries,forecast:computeCostModel().forecastBreakdown})),{maintenance:model.maintenance,forecast:model.forecast});
  await stabilize();const beforeDenied=await cloud();
  await page.locator('[data-material-treatment-launch]').click();await page.locator('#configMaterialCostTreatment').selectOption('separate');
  await page.evaluate(()=>{window.__mcalcOriginalWriter=writeAuthoritativeStateSnapshot;window.writeAuthoritativeStateSnapshot=async()=>({saved:false,definiteFailure:true,error:'permission-denied fixture'});});
  await page.locator('#configSave').click();await page.waitForFunction(()=>document.getElementById('configSaveStatus').textContent.includes('permission-denied'));
  assert.equal(await page.evaluate(()=>window.appConfig.materialCostTreatment),'deduct');assert.match(await page.locator('[data-material-treatment-active]').textContent(),/Deduct/);
  assert.match(await page.locator('[data-card-key="cuttingJobs"] .cost-card-value').textContent(),/\+?\$420\.00/);assert.deepEqual(await cloud(),beforeDenied);
  await page.evaluate(()=>window.writeAuthoritativeStateSnapshot=window.__mcalcOriginalWriter);await page.locator('#configCancel').click();
  await load();await page.setViewportSize({width:390,height:844});
  await page.locator('[data-material-treatment-launch]').click();
  const dialog=await page.locator('.config-dialog').boundingBox();assert.ok(dialog.x>=0&&dialog.x+dialog.width<=390&&dialog.height<=844);
  if(process.env.OMAX_MCALC_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.OMAX_MCALC_SCREENSHOT_DIR,"global-configuration-mobile.png")});
  await page.locator('#configCancel').click();
  assert.deepEqual((await cloud()).completedCuttingJobs.find(job=>job.id==="historic"),baseline.completedCuttingJobs[0]);
  assert.deepEqual(errors,[]);
});
