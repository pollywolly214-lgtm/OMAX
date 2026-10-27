"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
test("MCALC configuration, new-job mode, completion and reports survive local backend reload without rewriting existing records",{timeout:90000},async t=>{
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
  const load=async(hash="#/jobs")=>{await page.goto(origin+"/?devsafe=1"+hash);await page.waitForFunction(()=>window.OMAXDevSafe?.active&&window.__initialAdoptComplete);};
  const cloud=()=>page.evaluate(async()=>(await FB.docRef.get()).data());
  await load();assert.equal(await page.evaluate(()=>typeof firebase),"undefined");
  assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await load();
  await page.evaluate(async()=>{
    const state=(await FB.docRef.get()).data();
    state.cuttingJobs=[];state.completedCuttingJobs=[{id:"historic",cutNumber:"C001",name:"Historic",estimateHours:2,chargeRate:200,costRate:45,materialCost:100,materialQty:1,failurePercent:0,cat:"project",projectNumber:"1254",completedAtISO:"2026-10-18",startISO:"2026-10-18",dueISO:"2026-10-18",files:[],manualLogs:[],priority:1,efficiency:{totalProfit:210,gainLoss:210}}];
    state.jobFolders=[{id:"jobs_root",name:"All Jobs",parent:null,order:1},{id:"project",name:"1254 Project",projectNumber:"1254",parent:"jobs_root",order:2}];
    state.appConfig={...state.appConfig,materialCostTreatment:"deduct"};
    await FB.docRef.set(state);
  });await load();
  const baseline=await cloud();
  const configure=async mode=>{
    await page.evaluate(()=>openConfigurationModal(document.getElementById("dashboardConfigLaunch")));
    await page.locator("#configMaterialCostTreatment").selectOption(mode);
    await page.locator("#configSave").click();
    await page.waitForFunction(()=>document.getElementById("configModal").hidden||!!document.getElementById("configSaveStatus").textContent.match(/blocked|unavailable|changed|differ|not saved|uncertain/i));
    assert.equal(await page.locator("#configModal").isVisible(),false,await page.locator("#configSaveStatus").textContent());
  };
  await configure("separate");
  const after=await cloud();assert.equal(after.appConfig.materialCostTreatment,"separate");
  for(const key of Object.keys(baseline).filter(key=>!["appConfig","syncMeta"].includes(key)))assert.deepEqual(after[key],baseline[key],key);
  await load();assert.equal(await page.evaluate(()=>window.appConfig.materialCostTreatment),"separate");
  await page.evaluate(()=>openConfigurationModal(document.getElementById("dashboardConfigLaunch")));
  assert.equal(await page.locator("#configMaterialCostTreatment").inputValue(),"separate");
  if(process.env.OMAX_MCALC_SCREENSHOT_DIR){await fs.mkdir(process.env.OMAX_MCALC_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.OMAX_MCALC_SCREENSHOT_DIR,"configuration.png")});}
  await page.locator("#configCancel").click();
  // Existing route/layout initialization may queue a normal save; honor that gate before job mutations.
  await page.evaluate(async()=>{if(hasPendingLocalChanges){const result=await saveCloudNow();if(!result.saved)throw Error(result.error);}});
  const created=await page.evaluate(()=>createCuttingJob({id:"separate-new",name:"New separate cut",estimateHours:2,chargeRate:200,costRate:45,materialCost:100,materialQty:1,failurePercent:0,cat:"project",projectNumber:"1254",startISO:"2026-10-20",dueISO:"2026-10-20",priority:1,files:[],manualLogs:[]}));
  assert.equal(created.saved,true,created.error+" "+JSON.stringify(await page.evaluate(()=>({revision:window.__loadedCloudRevisionForSaveGuard,ready:FB.ready,user:FB.user,pending:hasPendingLocalChanges,recovery:isRecoveryMode(),block:window.__lastCloudSaveBlock,indeterminate:window.__lastIndeterminateSave,canWrite:canWriteCloud('mcalc fixture')}))));assert.equal(created.verified,true);await load();
  assert.equal((await cloud()).cuttingJobs[0].materialCostTreatment,"separate");
  await page.evaluate(()=>{window.jobCategoryFilter="jobs_root";renderJobs();});
  const summary=page.locator('[data-job-net-id="separate-new"]');
  assert.match(await summary.innerText(),/cutting profit: \$310\.00/);assert.match(await summary.innerText(),/\$400\.00 \+ material \$100\.00 = \$500\.00/);
  if(process.env.OMAX_MCALC_SCREENSHOT_DIR)await summary.screenshot({path:path.join(process.env.OMAX_MCALC_SCREENSHOT_DIR,"separate-job.png")});
  await configure("deduct");
  assert.equal(await page.evaluate(()=>computeCuttingJobProfit(cuttingJobs.find(job=>job.id==="separate-new")).totalProfit),310);
  await page.evaluate(async()=>{if(hasPendingLocalChanges){const result=await saveCloudNow();if(!result.saved)throw Error(result.error);}});
  const completed=await page.evaluate(()=>completeCuttingJob("separate-new",{completedAtISO:"2026-10-20"}));assert.equal(completed.saved,true,completed.error);
  await load("#/costs");
  const totals=await page.evaluate(()=>OMAXFinancialReconciliation.selectJobs(completedCuttingJobs,{profit:computeCuttingJobProfit}).totals);
  assert.equal(totals.net,520);assert.equal(totals.materialExpense,200);assert.equal(totals.materialRecovery,100);assert.equal(totals.customerPrice,900);
  await page.locator('[data-open-financial-breakdown]').click();
  assert.equal(await page.locator('[data-financial-metric="net"]').textContent(),"$520.00");
  assert.equal(await page.locator('[data-financial-metric="materialRecovery"]').textContent(),"$100.00");
  assert.deepEqual((await cloud()).completedCuttingJobs.find(job=>job.id==="historic"),baseline.completedCuttingJobs[0]);
  assert.deepEqual(errors,[]);
});
