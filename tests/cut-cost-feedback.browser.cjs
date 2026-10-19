'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||'playwright');
test('CCR-02C browser workflows use only disposable local storage/backend',{timeout:120000},async t=>{
 const check=(name,fn)=>!process.env.OMAX_CCR_TEST_FILTER||new RegExp(process.env.OMAX_CCR_TEST_FILTER).test(name)?t.test(name,fn):Promise.resolve();
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
  const load=async(hash='#/costs')=>{await page.goto(origin+'/?devsafe=1&ccrLoad='+(++loads)+hash);await page.waitForFunction(()=>window.OMAXDevSafe?.active&&window.__initialAdoptComplete);if(await page.locator('[data-cut-cost-configure]').count())await page.locator('[data-cut-cost-configure]').click();};
  await load();assert.equal(await page.evaluate(()=>typeof firebase),'undefined');assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await page.evaluate(async()=>{
   const ref=FB.docRef,state=(await ref.get()).data();
   state.dailyCutHours=[];state.totalHistory=[{dateISO:'2026-07-21',hours:1000},{dateISO:'2026-09-18',hours:1059},{dateISO:'2026-10-18',hours:1089},{dateISO:'2026-10-19',hours:1090}];
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
 await check('compact light panel has readable text and dynamically grouped missing-data lists',async()=>{
  const h=await fixture(),p=h.page;await p.locator('[data-cut-cost-configure]').click();assert.equal(await p.locator('[data-cut-cost-config]').isVisible(),false);assert.ok((await p.locator('[data-cut-cost-calculator]').boundingBox()).height<180);
  const contrast=await p.locator('[data-cut-cost-calculator]').evaluate(panel=>{
   const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number),lum=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
   return [...panel.querySelectorAll('h3,strong,button,[data-cut-cost-summary-status]')].filter(el=>el.offsetParent).map(el=>{let bg=el;while(bg&&['rgba(0, 0, 0, 0)','transparent'].includes(getComputedStyle(bg).backgroundColor))bg=bg.parentElement;const fg=lum(rgb(getComputedStyle(el).color)),back=lum(rgb(getComputedStyle(bg).backgroundColor));return (Math.max(fg,back)+.05)/(Math.min(fg,back)+.05);});
  });assert.ok(contrast.every(value=>value>=4.5),String(contrast));
  await p.evaluate(async()=>{const state=(await FB.docRef.get()).data(),task=state.tasksInterval[0];delete task.price;delete task.downtimeHours;task.manualHistory=[{id:'stable-history',dateISO:'2026-10-18',status:'completed',custom:'keep'}];task.occurrenceHours={};state.totalHistory=[];await FB.docRef.set(state);await loadFromCloud();renderCosts();});
  await p.locator('[data-cut-cost-review-open]').click();const text=await p.locator('[data-cut-cost-review]').innerText();assert.match(text,/Missing maintenance information \(1\)/);assert.match(text,/Maintenance using configured defaults \(1\)/);assert.match(text,/Cumulative meter review \(2\)/);assert.match(text,/starting reading/);assert.match(text,/not automatically errors/);await h.done();
 });
 await check('exact legacy correction waits for verification and refreshes warnings without rewriting history',async()=>{
  const h=await fixture(),p=h.page;
  await p.evaluate(async()=>{const state=(await FB.docRef.get()).data(),task=state.tasksInterval[0];delete task.price;delete task.downtimeHours;task.manualHistory=[{id:'stable-history',dateISO:'2026-10-18',status:'completed',custom:'keep'}];task.occurrenceHours={};task.completedDates.push('2026-10-17');await FB.docRef.set(state);await loadFromCloud();renderCosts();});
  const before=await h.cloud();await p.locator('[data-cut-cost-review-open]').click();await p.locator('[data-cut-cost-review] tr').filter({hasText:'2026-10-18'}).first().locator('[data-cut-cost-edit]').click();
  await p.locator('[data-cut-cost-duration]').fill('0');await p.locator('[data-cut-cost-parts]').fill('0');
  await p.evaluate(()=>{const write=writeAuthoritativeStateSnapshot;window.writeAuthoritativeStateSnapshot=async(...args)=>{const result=await write(...args);if(result.saved)await new Promise(resolve=>window.__releaseCostRepair=resolve);return result;};});
  await p.locator('[data-cut-cost-repair-form] button').click();await p.waitForFunction(()=>window.__releaseCostRepair);assert.equal(await p.locator('[data-cut-cost-editor]').isVisible(),true);assert.match(await p.locator('[data-cut-cost-repair-status]').innerText(),/verifying/);assert.equal(await p.locator('[data-cut-cost-repair-form] button').isDisabled(),true);
  await p.evaluate(()=>window.__releaseCostRepair());await p.locator('[data-cut-cost-editor]').waitFor({state:'detached'});assert.match(await p.locator('[data-cut-cost-review]').innerText(),/Missing maintenance information \(1\)/);
  const after=await h.cloud();assert.deepEqual(after.tasksInterval[0].manualHistory[0],before.tasksInterval[0].manualHistory[0]);assert.equal(after.tasksInterval[0].manualHistory.length,2);assert.equal(after.tasksInterval[0].occurrenceHours['2026-10-18'],0);assert.deepEqual(after.completedCuttingJobs,before.completedCuttingJobs);assert.deepEqual(after.receiptTrackerWeeks,before.receiptTrackerWeeks);
  const result=await p.evaluate(()=>computeCostModel().maintenanceCostRows.find(row=>row.dateISO==='2026-10-18'));assert.equal(result.totalCost,0);assert.equal(result.costIncomplete,false);await h.load();assert.equal((await h.cloud()).tasksInterval[0].manualHistory.length,2);await h.done();
 });
 await check('V2 duration and parts correction appends only to the selected stable root and persists',async()=>{
  const h=await fixture(),p=h.page;
  await p.evaluate(async()=>{const state=(await FB.docRef.get()).data();state.maintenanceTasksV2=[{id:'v2filter',legacyTaskId:'filter',name:'Filter'}];state.maintenanceCalendarInstancesV2=[{id:'v2-cost-instance',taskId:'v2filter',instanceMode:'one_time',startDateISO:'2026-10-18',status:'active'}];const base={system:'v2',schemaVersion:2,taskId:'v2filter',instanceId:'v2-cost-instance',rootOccurrenceId:'v2-cost-root',effectiveDateISO:'2026-10-18'};state.maintenanceOccurrencesV2=[{...base,id:'done',eventType:'completed',recordedAtISO:'2026-10-18T11:00:00Z'},{...base,id:'v2-cost-root',eventType:'scheduled',recordedAtISO:'2026-10-18T10:00:00Z'}];delete state.maintenanceOccurrencesV2[1].rootOccurrenceId;await FB.docRef.set(state);await loadFromCloud();renderCosts();});
  assert.ok(await p.locator('[data-cut-cost-review-open]').count(),JSON.stringify({errors:h.errors,evidence:await p.evaluate(()=>({reason:window.__recoveryReason,issues:window.__globalIdentityIssues,body:document.getElementById('content').innerText.slice(0,800)}))}));
  const before=await h.cloud();await p.locator('[data-cut-cost-review-open]').click();await p.locator('[data-cut-cost-edit]').first().click();await p.locator('[data-cut-cost-duration]').fill('0.125');await p.locator('[data-cut-cost-parts]').fill('0');await p.locator('[data-cut-cost-repair-form] button').click();await p.locator('[data-cut-cost-editor]').waitFor({state:'detached'});
  const after=await h.cloud();assert.deepEqual(after.maintenanceOccurrencesV2.slice(1),before.maintenanceOccurrencesV2);assert.deepEqual(after.tasksInterval,before.tasksInterval);assert.deepEqual(after.maintenanceCalendarInstancesV2,before.maintenanceCalendarInstancesV2);assert.equal(after.maintenanceOccurrencesV2[0].rootOccurrenceId,'v2-cost-root');assert.equal(after.maintenanceOccurrencesV2[0].partsCostSnapshot,0);await h.load();const rows=await p.evaluate(()=>computeCostModel().maintenanceCostRows);assert.equal(rows.length,1);assert.equal(rows[0].maintenanceHrs,.125);assert.equal(rows[0].partCost,0);assert.equal(rows[0].costEstimated,false);await h.done();
 });
 await check('weekly cumulative readings work without daily entries, expose effective dates and preserve source records',async()=>{
  const h=await fixture(),p=h.page;await p.evaluate(async()=>{const state=(await FB.docRef.get()).data();state.dailyCutHours=[];state.totalHistory.pop();await FB.docRef.set(state);await loadFromCloud();renderCosts();});
  const before=await h.cloud(),result=await p.evaluate(()=>OMAXCutCostFeedbackUi.calculate());assert.equal(result.valid,true);assert.equal(result.actualCuttingHours,89);assert.equal(result.measurementStartDate,'2026-07-21');assert.equal(result.measurementEndDate,'2026-10-18');assert.match(await p.locator('[data-cut-cost-measurement-window]').innerText(),/2026-07-21 to 2026-10-18/);assert.equal(await p.locator('[data-cut-cost-measured-through]').innerText(),'Hours measured through 2026-10-18.');assert.deepEqual(await h.cloud(),before);await h.done();
 });
 await check('missing baseline review opens existing password-protected meter history without writes',async()=>{
  const h=await fixture(),p=h.page;await p.evaluate(async()=>{const state=(await FB.docRef.get()).data();state.totalHistory=[];await FB.docRef.set(state);await loadFromCloud();renderCosts();});const before=await h.cloud();await p.locator('[data-cut-cost-review-open]').click();let prompted=false;p.on('dialog',async dialog=>{prompted=/password/.test(dialog.message());await dialog.dismiss();});await p.locator('[data-cut-cost-meter-history]').click();await p.waitForURL(url=>url.hash==='#/');await p.locator('#editLogHistoryBtn').waitFor();assert.equal(prompted,true);assert.deepEqual(await h.cloud(),before);await h.done();
 });

 await check('real maintenance table/graph pipeline, live garnet edits, explicit config save and reload',async()=>{
  const h=await fixture(),p=h.page,before=await h.cloud();
  const initial=await p.evaluate(()=>OMAXCutCostFeedbackUi.calculate());assert.equal(initial.eventCount,1);assert.equal(initial.partsCost,40);assert.equal(initial.laborCost,15);assert.equal(initial.actualCuttingHours,90);assert.equal(initial.garnetCostPerHour,(715+494/3)/2200*60);
  assert.match(await p.locator('[data-cut-cost-result]').innerText(),/\$23\.99/);
  const rows=await p.evaluate(()=>computeCostModel().maintenanceCostRows);assert.equal(rows.length,1);assert.equal(rows[0].totalCost,55);
  await p.locator('[data-cost-range="1"]').click();assert.match(await p.locator('[data-maint-cost-per-cut-label]').getAttribute('title'),/Saved requested window/);assert.equal(await p.locator('[data-maint-cost-per-cut-label]').innerText(),'$'+initial.maintenanceCostPerHour.toFixed(2));
  await p.locator('[data-cut-cost-field="purchasePrice"]').fill('800');assert.match(await p.locator('[data-cut-cost-result]').innerText(),/\$26\.31/);assert.deepEqual((await h.cloud()).appConfig,before.appConfig);
  await p.locator('[data-cut-cost-save]').click();await p.locator('[data-cut-cost-status]').filter({hasText:'saved and verified'}).waitFor();
  const after=await h.cloud();assert.equal(after.appConfig.cutCostFeedback.purchasePrice,800);assert.equal(after.appConfig.cutCostFeedback.shippingCost,494/3);
  for(const key of Object.keys(before).filter(key=>!['appConfig','syncMeta'].includes(key)))assert.deepEqual(after[key],before[key],key);
  await h.load();assert.equal(await p.locator('[data-cut-cost-field="purchasePrice"]').inputValue(),'800');await h.done();
 });
 await check('custom dates, invalid inputs and insufficient hours cannot offer a calculated rate',async()=>{
  const h=await fixture(),p=h.page;await p.locator('[data-cut-cost-field="weightLb"]').fill('0');assert.equal(await p.locator('[data-cut-cost-save]').isDisabled(),true);assert.match(await p.locator('[data-cut-cost-result]').innerText(),/INSUFFICIENT DATA/);
  await p.locator('[data-cut-cost-field="weightLb"]').fill('2200');await p.locator('[data-cut-cost-field="days"]').selectOption('180');await p.locator('[data-cut-cost-field="days"]').dispatchEvent('input');assert.match(await p.locator('[data-cut-cost-result]').innerText(),/starting reading/);
  await p.locator('[data-cut-cost-field="days"]').selectOption('custom');await p.locator('[data-cut-cost-field="days"]').dispatchEvent('input');await p.locator('[data-cut-cost-field="startDate"]').fill('2026-10-18');await p.locator('[data-cut-cost-field="endDate"]').fill('2026-10-19');assert.match(await p.locator('[data-cut-cost-summary-window]').innerText(),/2026-10-18 to 2026-10-19/);await h.done();
 });
 await check('V2 completed/moved/reopened occurrence stays consistent through the central table and graph',async()=>{
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
 for(const dashboard of [false,true])await check((dashboard?'Dashboard':'Cutting Jobs')+' defaults to calculated numerical rate, exposes accessible details and preserves manual overrides/history',async()=>{
  const h=await fixture(),p=h.page,before=await h.cloud(),expected=(await p.evaluate(()=>OMAXCutCostFeedbackUi.calculate())).cutCostPerHour;
  await h.load(dashboard?'#/dashboard':'#/jobs');
  if(dashboard){await p.evaluate(()=>openDashboardAddPicker({step:'job'}));}
  else {if(!await p.locator('#jobName').isVisible())await p.locator('[data-job-add-toggle]').click();}
  await p.evaluate(()=>{window.__ccrToasts=[];const original=toast;window.toast=message=>{window.__ccrToasts.push(message);original(message);};});
  const form=dashboard?'#dashJobForm':'#addJobForm',name=dashboard?'#dashJobName':'#jobName',est=dashboard?'#dashJobEstimate':'#jobEst',category=dashboard?'#dashJobCategory':'#jobCategory',cost=dashboard?'#dashJobCostRate':'#jobCostRate';
  await p.locator(name).fill(dashboard?'Dashboard calculated':'Jobs calculated');await p.locator(est).fill('1');await p.locator(category).selectOption('project');assert.equal(await p.locator(cost).inputValue(),expected.toFixed(2));assert.equal(await p.locator('[data-cut-cost-source]').inputValue(),'calculated');
  const infoButton=p.locator('[data-cut-cost-info-open]');await infoButton.focus();await p.keyboard.press('Enter');await p.waitForFunction(()=>document.querySelector('[data-cut-cost-info]').matches(':popover-open'));const info=await p.locator('[data-cut-cost-info]').innerText();assert.match(info,/Maintenance Cost\/Hr/);assert.match(info,/Garnet Cost\/Hr/);assert.match(info,/2026-07-21 to 2026-10-19/);assert.match(info,/will not change afterward/);assert.equal(await p.locator('[data-cut-cost-preview]').innerText(),'');await p.keyboard.press('Escape');
  await p.locator(form).evaluate(el=>el.requestSubmit());try{await p.waitForFunction(()=>window.cuttingJobs.some(job=>job.name.endsWith('calculated')),{},{timeout:3000});}catch(error){assert.fail(JSON.stringify({pageErrors:h.errors,details:await p.evaluate(form=>({toasts:window.__ccrToasts,reason:window.__recoveryReason,pending:hasPendingLocalChanges,drift:Object.keys(window.__lastLoadedCloudState).filter(key=>stableStringify(window.__lastLoadedCloudState[key])!==stableStringify(getCuttingJobChronologyLocalState()[key])).map(key=>({key,before:window.__lastLoadedCloudState[key],after:getCuttingJobChronologyLocalState()[key]})),invalid:[...document.querySelector(form).elements].filter(el=>el.validity&&!el.validity.valid).map(el=>({id:el.id,value:el.value,message:el.validationMessage})),errors:window.__lastIndeterminateSave}),form)}));}
  const after=await h.cloud();assert.equal(after.cuttingJobs.find(job=>job.name.endsWith('calculated')).costRate,expected);assert.deepEqual(after.completedCuttingJobs,before.completedCuttingJobs);
  await h.load(dashboard?'#/dashboard':'#/jobs');
  if(dashboard){await p.evaluate(()=>openDashboardAddPicker({step:'job'}));}else if(!await p.locator(name).isVisible())await p.locator('[data-job-add-toggle]').click();
  await p.locator(name).fill('Manual override');await p.locator(est).fill('1');await p.locator(category).selectOption('project');await p.locator('[data-cut-cost-source]').selectOption('calculated');await p.locator(cost).fill('51');assert.equal(await p.locator('[data-cut-cost-source]').inputValue(),'manual');
  if(!dashboard){await p.evaluate(()=>renderJobs());assert.equal(await p.locator(cost).inputValue(),'51');assert.equal(await p.locator('[data-cut-cost-source]').inputValue(),'manual');}
  await p.locator(form).evaluate(el=>el.requestSubmit());await p.waitForFunction(()=>window.cuttingJobs.some(job=>job.name==='Manual override'));assert.equal((await h.cloud()).cuttingJobs.find(job=>job.name==='Manual override').costRate,51);assert.deepEqual((await h.cloud()).completedCuttingJobs,before.completedCuttingJobs);await h.done();
 });
 await check('saved calculation window drives the maintenance-only chart summary independently of graph controls',async()=>{
  const h=await fixture(),p=h.page;
  const initial=await p.evaluate(()=>OMAXCutCostFeedbackUi.calculate());for(const range of ['1','all']){await p.locator('[data-cost-range="'+range+'"]').click();assert.equal(await p.locator('[data-maint-cost-per-cut-label]').innerText(),'$'+initial.maintenanceCostPerHour.toFixed(2));}
  await p.locator('[data-cut-cost-field="days"]').selectOption('30');await p.locator('[data-cut-cost-field="days"]').dispatchEvent('input');const preview=await p.evaluate(()=>OMAXCutCostFeedbackUi.calculate({...OMAXCutCostFeedback.settings(),days:30}));assert.equal(await p.locator('[data-maint-cost-per-cut-label]').innerText(),'$'+initial.maintenanceCostPerHour.toFixed(2));
  await p.locator('[data-cut-cost-save]').click();await p.locator('[data-cut-cost-status]').filter({hasText:'saved and verified'}).waitFor();assert.equal(await p.locator('[data-maint-cost-per-cut-label]').innerText(),'$'+preview.maintenanceCostPerHour.toFixed(2));assert.notEqual(preview.maintenanceCostPerHour,preview.cutCostPerHour);
  await p.evaluate(async()=>{const state=(await FB.docRef.get()).data();state.totalHistory.at(-1).hours+=10;state.tasksInterval[0].manualHistory[0].partsCostSnapshot=80;await FB.docRef.set(state);await loadFromCloud();renderCosts();});const current=await p.evaluate(()=>OMAXCutCostFeedbackUi.calculate());assert.notEqual(current.maintenanceCostPerHour,preview.maintenanceCostPerHour);assert.equal(await p.locator('[data-maint-cost-per-cut-label]').innerText(),'$'+current.maintenanceCostPerHour.toFixed(2));assert.equal((await p.evaluate(()=>computeCostModel())).maintenanceCostPerCutValue,current.maintenanceCostPerHour);await h.done();
 });
 await check('calculator uses Edit Cost Layout drag/resize and cloud persistence, survives responsive zoom without duplication',async()=>{
  const h=await fixture(),p=h.page,before=await h.cloud();await p.locator('[data-cut-cost-configure]').click();const widget=p.locator('#costLayout > [data-cost-window="cutCostFeedback"]');assert.equal(await widget.count(),1);
  await p.locator('#dashboardSettingsToggle').click();await p.locator('#costEditToggle').click();const original=await p.evaluate(()=>({...getCostLayoutState().activeLayoutById.cutCostFeedback}));
  const drag=widget.locator(':scope > .dashboard-drag-handle');await drag.scrollIntoViewIfNeeded();let box=await drag.boundingBox();await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.mouse.move(box.x+box.width/2+40,box.y+box.height/2+50,{steps:5});await p.mouse.up();
  const resize=widget.locator(':scope > .dashboard-resize-se');await resize.scrollIntoViewIfNeeded();box=await resize.boundingBox();await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.mouse.move(box.x+box.width/2-80,box.y+box.height/2+60,{steps:5});await p.mouse.up();await p.locator('#costEditPopupButton').click();
  const changed=await p.evaluate(()=>({...getCostLayoutState().layoutById.cutCostFeedback}));assert.ok(changed.x>original.x);assert.ok(changed.y>original.y);assert.ok(changed.width<original.width);assert.ok(changed.height>original.height);
  await p.waitForFunction(async expected=>JSON.stringify((await FB.docRef.get()).data().costLayout.cutCostFeedback)===JSON.stringify(expected),changed);await p.waitForFunction(()=>!hasPendingLocalChanges);await p.evaluate(()=>cloudSaveQueue);await h.load();assert.deepEqual((await h.cloud()).costLayout.cutCostFeedback,changed,JSON.stringify(await p.evaluate(()=>({cloud:window.cloudCostLayout,reason:window.__recoveryReason,pending:hasPendingLocalChanges,save:window.__lastIndeterminateSave,layout:getCostLayoutState().layoutById}))));const restored=await widget.boundingBox();assert.ok(Math.abs(restored.width-changed.width)<2);assert.ok(Math.abs(restored.height-changed.height)<2);
  await p.evaluate(()=>{OMAXCutCostFeedbackUi.mountCosts(document.getElementById('content'),computeCostModel());document.body.style.zoom='1.25';});await p.setViewportSize({width:560,height:950});await p.waitForFunction(()=>{const widget=document.querySelector('[data-cost-window="cutCostFeedback"]'),root=document.getElementById('costLayout');return widget.getBoundingClientRect().right<=root.getBoundingClientRect().right+2;});assert.equal(await p.locator('[data-cut-cost-calculator]').count(),1);
  await p.locator('[data-cut-cost-field="days"]').selectOption('180');await p.locator('[data-cut-cost-field="days"]').dispatchEvent('input');await p.locator('[data-cut-cost-review-open]').click();assert.match(await p.locator('[data-cut-cost-review]').innerText(),/starting reading/);await p.locator('[data-cut-cost-review] [data-cut-cost-close]').click();assert.deepEqual((await h.cloud()).costLayout.cutCostFeedback,changed);
  const after=await h.cloud();for(const key of ['totalHistory','tasksInterval','completedCuttingJobs','receiptTrackerWeeks'])assert.deepEqual(after[key],before[key]);await h.done();
 });
 for(const dashboard of [false,true])await check((dashboard?'Dashboard':'Cutting Jobs')+' safely falls back when calculated hours are unavailable',async()=>{
  const h=await fixture(),p=h.page;await p.evaluate(async()=>{const state=(await FB.docRef.get()).data();state.totalHistory=[];await FB.docRef.set(state);});await h.load(dashboard?'#/dashboard':'#/jobs');if(dashboard)await p.evaluate(()=>openDashboardAddPicker({step:'job'}));else if(!await p.locator('#jobName').isVisible())await p.locator('[data-job-add-toggle]').click();const cost=dashboard?'#dashJobCostRate':'#jobCostRate';assert.equal(await p.locator(cost).inputValue(),'45');assert.equal(await p.locator('[data-cut-cost-source]').inputValue(),'manual');assert.match(await p.locator('[data-cut-cost-preview]').innerText(),/unavailable/);await p.locator('[data-cut-cost-info-open]').focus();await p.keyboard.press('Enter');assert.match(await p.locator('[data-cut-cost-info]').innerText(),/starting reading/);await h.done();
 });
 await check('zero calculated totals retain the manual default in both new-job forms',async()=>{
  const h=await fixture(),p=h.page;await p.evaluate(async()=>{const state=(await FB.docRef.get()).data();state.appConfig.cutCostFeedback={...OMAXCutCostFeedback.DEFAULTS,consumptionLbMin:0};state.tasksInterval[0].manualHistory[0].partsCostSnapshot=0;state.tasksInterval[0].occurrenceHours['2026-10-18']=0;await FB.docRef.set(state);});
  for(const dashboard of [false,true]){await h.load(dashboard?'#/dashboard':'#/jobs');if(dashboard)await p.evaluate(()=>openDashboardAddPicker({step:'job'}));else if(!await p.locator('#jobName').isVisible())await p.locator('[data-job-add-toggle]').click();assert.equal(await p.locator(dashboard?'#dashJobCostRate':'#jobCostRate').inputValue(),'45');assert.equal(await p.locator('[data-cut-cost-source]').inputValue(),'manual');await p.locator('[data-cut-cost-source]').selectOption('calculated');assert.equal(await p.locator('[data-cut-cost-source]').inputValue(),'manual');}await h.done();
 });
 await check('Recovery Mode disables saving; stale selected calculation cannot be silently adopted',async()=>{
  const h=await fixture(),p=h.page,before=await h.cloud();await p.evaluate(()=>{window.__recoveryInspectMode=true;});await p.locator('[data-cut-cost-field="purchasePrice"]').fill('999');assert.equal(await p.locator('[data-cut-cost-save]').isDisabled(),true);assert.equal((await p.evaluate(()=>OMAXCutCostFeedbackUi.saveConfig(OMAXCutCostFeedback.settings()))).saved,false);assert.deepEqual(await h.cloud(),before);await h.done();
 });
});
