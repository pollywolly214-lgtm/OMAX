"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright"),{rich,legacy,repeat}=require("./fixtures/rfs02b-maintenance");
const cancellation=require("../js/maintenanceCalendarCancellation"),archive=require("../js/maintenanceTaskArchive");
test("MHIST-01C actual archived/cancelled History, exact root jump, diagnostic and reload are read-only",{timeout:90000},async t=>{
  const root=path.resolve(__dirname,".."),server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname,file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)||pathname.split('/').some(part=>part.startsWith('.'))){res.writeHead(403).end();return;}
    try{res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'text/plain'}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});t.after(()=>browser.close());
  const context=await browser.newContext({timezoneId:'America/Chicago',viewport:{width:1440,height:1100},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);await page.clock.setFixedTime(new Date('2026-10-26T17:00:00Z'));
  let loads=0;const load=async(hash='#/settings')=>{await page.goto(origin+'/?devsafe=1&mhist01c='+(++loads)+hash);await page.waitForFunction(()=>window.__initialAdoptComplete&&OMAXDevSafe.active);assert.equal(await page.evaluate(()=>typeof firebase),'undefined');};
  await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  let source=rich();let n=0;for(const operation of [legacy('single','2026-09-01'),legacy('future','2026-10-28'),legacy('all'),repeat('repeatRemove','2026-09-02'),repeat('repeatStop','2026-09-03')])source=cancellation.plan(source,operation,{id:'history-cancel-'+(++n),actorUid:'fixture',atISO:'2026-10-26T17:00:00Z'}).state;
  const task=source.tasksInterval[0],entry={id:'history-archive',type:'task',payload:structuredClone(task),meta:{list:'interval',originalId:task.id},label:'Maintenance task: '+task.name,deletedAt:'2026-10-26T17:00:00Z'};
  source=archive.plan(source,task.id,entry);
  await page.evaluate(async fixture=>{
    const state={...window.__lastLoadedCloudState,...fixture};state.settingsFolders=[{id:'root',name:'All Tasks',parent:null,order:2},{id:'fixture-category',name:'Fixture',parent:'root',order:1}];
    for(const [i,task]of [...state.tasksInterval,...state.deletedItems.filter(row=>row.type==='task').map(row=>row.payload)].entries())Object.assign(task,{cat:'fixture-category',parentTask:null,order:i+1,pn:'',manualLink:'',storeLink:'',note:''});
    state.syncMeta.rev=Date.now()+1;await FB.docRef.set(state);
  },source);
  await load('#/deleted');assert.equal(await page.evaluate(()=>isRecoveryMode()),false);
  const cloud=()=>page.evaluate(async()=>(await FB.docRef.get()).data()),before=await cloud();
  await page.evaluate(()=>{
    window.__mhistWrites=0;for(const name of ['saveCloudNow','saveCloudDebounced','markLocalMutation','persistLocalStateBackup'])window[name]=()=>{window.__mhistWrites++;throw Error('History must not write: '+name);};
  });
  const snapshot=()=>page.evaluate(()=>({loaded:window.__lastLoadedCloudState,guard:window.__loadedCloudRevisionForSaveGuard,
    arrays:Object.fromEntries(['tasksInterval','tasksAsReq','maintenanceTasksV2','maintenanceCalendarInstancesV2','maintenanceOccurrencesV2','deletedItems','inventory'].map(name=>[name,window[name]])),
    evidence:[window.__lastIndeterminateSave,window.__lastCloudSaveBlock,window.__lastDangerousSaveBlock,window.__lastMaintenanceCancellationEvidence,window.__recoveryInspectMode,window.__autosaveDisabled],
    storage:Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)]))}));
  const baseline=await snapshot(),open=async()=>{await page.locator('[data-trash-history="history-archive"]').click();await page.locator('[data-maintenance-history="fixture-task-A"]').waitFor();};
  await open();const modal=page.locator('[data-maintenance-history="fixture-task-A"]');
  assert.match(await modal.innerText(),/Archived task/);assert.match(await modal.innerText(),/Authorized calendar cancellation/);assert.match(await modal.innerText(),/Repeat tracking stopped/);
  assert.match(await modal.innerText(),/Earlier completion record retained/);assert.match(await modal.innerText(),/Next scheduled: —/);
  const keys=await modal.locator('[data-history-event]').evaluateAll(nodes=>nodes.map(node=>node.dataset.historyEvent));assert.equal(new Set(keys).size,keys.length);
  const hidden=modal.locator('[data-history-event]').filter({hasText:'Authorized calendar cancellation'}).first();await hidden.locator('[data-history-jump]').click();
  assert.equal(await modal.isVisible(),true);assert.match(await modal.locator('[data-history-navigation-status]').innerText(),/History remains available/);
  await modal.locator('[data-close]').click();
  await page.locator('#deletedItemsSearch').fill('Mixing');await page.waitForTimeout(200);await open();assert.deepEqual(await modal.locator('[data-history-event]').evaluateAll(nodes=>nodes.map(node=>node.dataset.historyEvent)),keys);
  // Find the exact retained completion, not an arbitrary same-date record.
  const activeKey=JSON.stringify(['v2','fixture-instance-A','repeat:fixture-instance-A:2026-09-03']);
  const active=modal.locator('[data-history-event]').filter({has:page.locator('[data-history-jump="2026-09-03"]')}).filter({hasText:'Repeat tracking stopped'});
  await active.evaluateAll((nodes,key)=>nodes.forEach(node=>{if(node.dataset.historyEvent===key)node.setAttribute('data-test-exact-root','1');}),activeKey);
  await modal.locator('[data-test-exact-root="1"] [data-history-jump]').click();await page.locator('#v2OneTimePanel').waitFor({state:'visible'});assert.equal(await modal.count(),0);
  assert.match(await page.locator('#v2OneTimePanel').innerText(),/Completed/);
  assert.equal(await page.locator('[data-date-iso="2026-09-03"] [data-v2-root-occurrence-id="repeat:fixture-instance-A:2026-09-03"]').count(),1);
  await page.locator('[data-rpt-close]').click();assert.deepEqual(await snapshot(),baseline);assert.deepEqual(await cloud(),before);
  const diagnostic=await fs.readFile(path.join(root,'docs/mhist-01c-read-only-diagnostic.js'),'utf8'),report=await page.evaluate(source=>(0,eval)(source),diagnostic);
  assert.equal(report.overall,'WARNING',JSON.stringify(report.checks));assert.ok(report.checks.every(row=>row.status!=='FAIL'),JSON.stringify(report.checks));
  assert.equal(report.checks.find(row=>row.check==='Calendar/History reconciliation').status,'PASS');assert.equal(report.checks.find(row=>row.check==='Projection input preservation').status,'PASS');
  assert.deepEqual(await snapshot(),baseline);assert.equal(await page.evaluate(()=>__mhistWrites),0);assert.deepEqual(await cloud(),before);
  await load('#/deleted');await open();assert.deepEqual(await modal.locator('[data-history-event]').evaluateAll(nodes=>nodes.map(node=>node.dataset.historyEvent)),keys);
  assert.deepEqual(await cloud(),before);assert.deepEqual(errors,[]);
});
