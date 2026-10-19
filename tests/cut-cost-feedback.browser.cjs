'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||'playwright');
test('CCR-02C browser workflows use only disposable local storage/backend',{timeout:120000},async t=>{
 const root=path.resolve(__dirname,'..'),server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'text/plain'}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>browser.close());
 async function fixture(){
  const context=await browser.newContext({timezoneId:'America/Chicago',viewport:{width:1280,height:1000}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
  await page.clock.setFixedTime(new Date('2026-10-19T17:00:00Z'));
  let loads=0;
  const load=async(hash='#/costs')=>{await page.goto(origin+'/?devsafe=1&ccrLoad='+(++loads)+hash);await page.waitForFunction(()=>window.OMAXDevSafe?.active&&window.__initialAdoptComplete);};
  await load();assert.equal(await page.evaluate(()=>typeof firebase),'undefined');assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await page.evaluate(async()=>{
   const ref=FB.docRef,state=(await ref.get()).data();
   state.dailyCutHours=[];state.totalHistory=[];
   for(let day=0;day<90;day++){const d=new Date('2026-10-19T00:00:00Z');d.setUTCDate(d.getUTCDate()-day);state.dailyCutHours.push({dateISO:d.toISOString().slice(0,10),hours:1,source:'manual'});}
   state.tasksInterval=[{id:'filter',name:'Filter',mode:'interval',price:100,downtimeHours:2,completedDates:['2026-10-18'],manualHistory:[{dateISO:'2026-10-18',status:'completed',partsCostSnapshot:40}],occurrenceHours:{'2026-10-18':.5}}];
   state.tasksAsReq=[];state.maintenanceTasksV2=[];state.maintenanceCalendarInstancesV2=[];state.maintenanceOccurrencesV2=[];
   state.jobFolders=[{id:'jobs_root',name:'All Jobs',parent:null,order:1},{id:'project',name:'1254 Project',projectNumber:'1254',parent:'jobs_root',order:2}];
   state.cuttingJobs=[];state.completedCuttingJobs=[{id:'historic',cutNumber:'C001',name:'Historic',estimateHours:1,chargeRate:200,costRate:45,materialCost:0,materialQty:1,cat:'project',projectNumber:'1254',completedAtISO:'2026-10-18',startISO:'2026-10-18',dueISO:'2026-10-18',files:[],manualLogs:[],priority:1}];
   state.receiptTrackerWeeks=[];await ref.set(state);
  });await load();await page.evaluate(()=>{window.__ccrToasts=[];const original=toast;window.toast=message=>{window.__ccrToasts.push(message);original(message);};});
  const cloud=()=>page.evaluate(async()=>(await FB.docRef.get()).data());
  return{context,page,load,cloud,errors,async done(){assert.deepEqual(errors,[]);await context.close();}};
 }
 await t.test('real maintenance table/graph pipeline, live garnet edits, explicit config save and reload',async()=>{
  const h=await fixture(),p=h.page,before=await h.cloud();
  const initial=await p.evaluate(()=>OMAXCutCostFeedbackUi.calculate());assert.equal(initial.eventCount,1);assert.equal(initial.partsCost,40);assert.equal(initial.laborCost,15);assert.equal(initial.actualCuttingHours,90);assert.equal(initial.garnetCostPerHour,(715+494/3)/2200*60);
  assert.match(await p.locator('[data-cut-cost-result]').innerText(),/\$23\.99/);
  const rows=await p.evaluate(()=>computeCostModel().maintenanceCostRows);assert.equal(rows.length,1);assert.equal(rows[0].totalCost,55);
  await p.locator('[data-cost-range="1"]').click();assert.match(await p.locator('[data-maint-cost-per-cut-label]').getAttribute('title'),/31\.0 actual cut hr/);assert.equal(await p.locator('[data-maint-cost-per-cut-label]').innerText(),'$1.77');
  await p.locator('[data-cut-cost-field="purchasePrice"]').fill('800');assert.match(await p.locator('[data-cut-cost-result]').innerText(),/\$26\.31/);assert.deepEqual((await h.cloud()).appConfig,before.appConfig);
  await p.locator('[data-cut-cost-save]').click();await p.locator('[data-cut-cost-status]').filter({hasText:'saved and verified'}).waitFor();
  const after=await h.cloud();assert.equal(after.appConfig.cutCostFeedback.purchasePrice,800);assert.equal(after.appConfig.cutCostFeedback.shippingCost,494/3);
  for(const key of Object.keys(before).filter(key=>!['appConfig','syncMeta'].includes(key)))assert.deepEqual(after[key],before[key],key);
  await h.load();assert.equal(await p.locator('[data-cut-cost-field="purchasePrice"]').inputValue(),'800');await h.done();
 });
 await t.test('custom dates, invalid inputs and insufficient hours cannot offer a calculated rate',async()=>{
  const h=await fixture(),p=h.page;await p.locator('[data-cut-cost-field="weightLb"]').fill('0');assert.equal(await p.locator('[data-cut-cost-save]').isDisabled(),true);assert.match(await p.locator('[data-cut-cost-result]').innerText(),/INSUFFICIENT DATA/);
  await p.locator('[data-cut-cost-field="weightLb"]').fill('2200');await p.locator('[data-cut-cost-field="days"]').selectOption('180');await p.locator('[data-cut-cost-field="days"]').dispatchEvent('input');assert.match(await p.locator('[data-cut-cost-result]').innerText(),/lack trustworthy actual hours/);
  await p.locator('[data-cut-cost-field="days"]').selectOption('custom');await p.locator('[data-cut-cost-field="days"]').dispatchEvent('input');await p.locator('[data-cut-cost-field="startDate"]').fill('2026-10-18');await p.locator('[data-cut-cost-field="endDate"]').fill('2026-10-19');assert.match(await p.locator('[data-cut-cost-result]').innerText(),/2026-10-18 to 2026-10-19/);await h.done();
 });
 await t.test('V2 completed/moved/reopened occurrence stays consistent through the central table and graph',async()=>{
  const h=await fixture(),p=h.page;
  await p.evaluate(async()=>{
   const ref=FB.docRef,state=(await ref.get()).data();
   state.maintenanceTasksV2=[{id:'v2filter',legacyTaskId:'filter',name:'Filter',price:999}];
   state.maintenanceCalendarInstancesV2=[{id:'v2instance',taskId:'v2filter',instanceMode:'one_time',startDateISO:'2026-10-17',status:'active'}];
   const base={system:'v2',schemaVersion:2,taskId:'v2filter',instanceId:'v2instance',rootOccurrenceId:'v2root',effectiveDateISO:'2026-10-17'};
   state.maintenanceOccurrencesV2=[{...base,id:'moved',eventType:'moved',recordedAtISO:'2026-10-19T11:00:00Z',payload:{toDateISO:'2026-10-18'}},{...base,id:'completed',eventType:'completed',recordedAtISO:'2026-10-19T10:00:00Z',loggedHours:.25,partsCostSnapshot:12},{...base,id:'v2root',eventType:'scheduled',recordedAtISO:'2026-10-19T09:00:00Z'}];
   await ref.set(state);await loadFromCloud();renderCosts();
  });
  let rows=await p.evaluate(()=>computeCostModel().maintenanceCostRows);assert.equal(rows.length,1);assert.equal(rows[0].dateISO,'2026-10-18');assert.equal(rows[0].partCost,12);assert.equal(rows[0].laborCost,7.5);
  await p.evaluate(async()=>{const state=(await FB.docRef.get()).data();state.maintenanceOccurrencesV2.unshift({...state.maintenanceOccurrencesV2[0],id:'reopened',eventType:'uncompleted',recordedAtISO:'2026-10-19T12:00:00Z'});await FB.docRef.set(state);await loadFromCloud();renderCosts();});
  rows=await p.evaluate(()=>computeCostModel().maintenanceCostRows);assert.equal(rows.length,0);await h.done();
 });
 for(const dashboard of [false,true])await t.test((dashboard?'Dashboard':'Cutting Jobs')+' saves selected numerical rate and manual override without changing history',async()=>{
  const h=await fixture(),p=h.page,before=await h.cloud(),expected=(await p.evaluate(()=>OMAXCutCostFeedbackUi.calculate())).cutCostPerHour;
  await h.load(dashboard?'#/dashboard':'#/jobs');
  if(dashboard){await p.evaluate(()=>{document.getElementById('dashboardAddModal').hidden=false;document.getElementById('dashboardAddModal').style.display='flex';document.querySelector('[data-step="job"]').hidden=false;});}
  else {if(!await p.locator('#jobName').isVisible())await p.locator('[data-job-add-toggle]').click();}
  await p.evaluate(()=>{window.__ccrToasts=[];const original=toast;window.toast=message=>{window.__ccrToasts.push(message);original(message);};});
  const form=dashboard?'#dashJobForm':'#addJobForm',name=dashboard?'#dashJobName':'#jobName',est=dashboard?'#dashJobEstimate':'#jobEst',category=dashboard?'#dashJobCategory':'#jobCategory',cost=dashboard?'#dashJobCostRate':'#jobCostRate';
  await p.locator(name).fill(dashboard?'Dashboard calculated':'Jobs calculated');await p.locator(est).fill('1');await p.locator(category).selectOption('project');assert.equal(await p.locator(cost).inputValue(),'45');
  await p.locator('[data-cut-cost-source]').selectOption('calculated');assert.equal(await p.locator(cost).inputValue(),expected.toFixed(2));
  await p.locator(form).evaluate(el=>el.requestSubmit());try{await p.waitForFunction(()=>window.cuttingJobs.some(job=>job.name.endsWith('calculated')),{},{timeout:3000});}catch(error){assert.fail(JSON.stringify({pageErrors:h.errors,details:await p.evaluate(form=>({toasts:window.__ccrToasts,reason:window.__recoveryReason,pending:hasPendingLocalChanges,drift:Object.keys(window.__lastLoadedCloudState).filter(key=>stableStringify(window.__lastLoadedCloudState[key])!==stableStringify(getCuttingJobChronologyLocalState()[key])).map(key=>({key,before:window.__lastLoadedCloudState[key],after:getCuttingJobChronologyLocalState()[key]})),invalid:[...document.querySelector(form).elements].filter(el=>el.validity&&!el.validity.valid).map(el=>({id:el.id,value:el.value,message:el.validationMessage})),errors:window.__lastIndeterminateSave}),form)}));}
  const after=await h.cloud();assert.equal(after.cuttingJobs.find(job=>job.name.endsWith('calculated')).costRate,expected);assert.deepEqual(after.completedCuttingJobs,before.completedCuttingJobs);
  await h.load(dashboard?'#/dashboard':'#/jobs');
  if(dashboard){await p.evaluate(()=>{document.getElementById('dashboardAddModal').hidden=false;document.getElementById('dashboardAddModal').style.display='flex';document.querySelector('[data-step="job"]').hidden=false;});}else if(!await p.locator(name).isVisible())await p.locator('[data-job-add-toggle]').click();
  await p.locator(name).fill('Manual override');await p.locator(est).fill('1');await p.locator(category).selectOption('project');await p.locator('[data-cut-cost-source]').selectOption('calculated');await p.locator(cost).fill('51');assert.equal(await p.locator('[data-cut-cost-source]').inputValue(),'manual');
  await p.locator(form).evaluate(el=>el.requestSubmit());await p.waitForFunction(()=>window.cuttingJobs.some(job=>job.name==='Manual override'));assert.equal((await h.cloud()).cuttingJobs.find(job=>job.name==='Manual override').costRate,51);assert.deepEqual((await h.cloud()).completedCuttingJobs,before.completedCuttingJobs);await h.done();
 });
 await t.test('Recovery Mode disables saving; stale selected calculation cannot be silently adopted',async()=>{
  const h=await fixture(),p=h.page,before=await h.cloud();await p.evaluate(()=>{window.__recoveryInspectMode=true;});await p.locator('[data-cut-cost-field="purchasePrice"]').fill('999');assert.equal(await p.locator('[data-cut-cost-save]').isDisabled(),true);assert.equal((await p.evaluate(()=>OMAXCutCostFeedbackUi.saveConfig(OMAXCutCostFeedback.settings()))).saved,false);assert.deepEqual(await h.cloud(),before);await h.done();
 });
});
