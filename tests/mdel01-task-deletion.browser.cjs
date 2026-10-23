"use strict";
// All non-local requests are blocked. Only the disposable IndexedDB backend is used.
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright"),{fixture}=require("./fixtures/mdel01-maintenance-task");
for(const staleServerGet of [false,true])test("Settings deletion preserves same-name task, archived history and inventory after browser reload"+(staleServerGet?" with stale Firebase server-get view":""),{timeout:60000},async t=>{
  const root=path.resolve(__dirname,".."),server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname,file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"})[path.extname(file)]||"text/plain"}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin="http://127.0.0.1:"+server.address().port,browser=await chromium.launch({headless:true,channel:"msedge"});t.after(()=>browser.close());
  const context=await browser.newContext({timezoneId:"America/Chicago",serviceWorkers:"block",viewport:{width:1440,height:1100}});
  await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[],dialogs=[];page.on("pageerror",error=>errors.push(error.message));page.on("dialog",async dialog=>{dialogs.push(dialog.message());await dialog.accept();});page.setDefaultTimeout(12000);
  let loads=0;
  const load=async()=>{await page.goto(origin+"/?devsafe=1&mdelLoad="+(++loads)+"#/settings");await page.waitForFunction(()=>window.OMAXDevSafe?.active&&window.__initialAdoptComplete);};
  await load();assert.equal(await page.evaluate(()=>typeof firebase),"undefined");
  assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await page.evaluate(async fixture=>{
    if(!OMAXDevSafe.active)throw Error("Disposable backend required");
    const state={...window.__lastLoadedCloudState,...fixture};
    // Give the representative definitions the normal category fields used by Settings.
    state.settingsFolders=[{id:"fixture-category",name:"Fixture Maintenance",parent:null,order:1}];
    state.tasksInterval.forEach((task,index)=>Object.assign(task,{cat:"fixture-category",parentTask:null,order:index+1,pn:"",manualLink:"",storeLink:"",note:""}));
    state.syncMeta.rev++;await OMAXDevSafe.db.doc(FB.docRef.path).set(state);
  },fixture());
  await load();
  assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await load();
  const before=await page.evaluate(async()=>(await FB.docRef.get()).data());
  if(staleServerGet)await page.evaluate(async()=>{
    const ref=FB.docRef,get=ref.get.bind(ref),snapshot=await get(),state=snapshot.data();
    // Devsafe transaction.get calls ref.get() without options, so backend reads
    // stay fresh while the v8 server-get listener retains its pre-commit view.
    ref.get=options=>options?.source==="server" ? Promise.resolve({...snapshot,data:()=>structuredClone(state)}) : get(options);
  });
  assert.equal(await page.evaluate(()=>isRecoveryMode()),false);
  const card=page.locator('details[data-task-id="fixture-task-A"]');
  assert.ok(await card.count(),JSON.stringify(await page.evaluate(()=>({hash:location.hash,text:document.getElementById("content")?.innerText.slice(0,300),tasks:window.tasksInterval.map(t=>t.id),loaded:window.__lastLoadedCloudState?.tasksInterval.map(t=>t.id),errors:window.__globalIdentityIssues}))));
  await card.evaluate(element=>{for(let parent=element.parentElement;parent;parent=parent.parentElement)if(parent.tagName==="DETAILS")parent.open=true;});
  await card.locator(':scope > summary').click({button:"right"});
  await page.locator('#maintenanceContextMenu [data-action="delete"]').dispatchEvent("click");
  await page.locator("[data-confirm-confirm]").click();
  await page.waitForFunction(()=>!window.maintenanceTaskDeletionApi.isBusy());
  assert.deepEqual(dialogs,[]);
  const after=await page.evaluate(async()=>(await FB.docRef.get()).data());
  assert.equal(after.tasksInterval.some(task=>task.id==="fixture-task-A"),false);assert.deepEqual(after.tasksInterval,before.tasksInterval.filter(task=>task.id!=="fixture-task-A"));
  assert.deepEqual(after.deletedItems[0].payload,before.tasksInterval[0]);
  for(const field of Object.keys(before).filter(name=>!["syncMeta","tasksInterval","deletedItems"].includes(name)))assert.deepEqual(after[field],before[field],field);
  assert.equal(await page.evaluate(()=>isRecoveryMode()),false);assert.deepEqual(dialogs,[]);
  assert.deepEqual(await page.evaluate(()=>({autosaveDisabled:window.__autosaveDisabled,pending:!!window.__lastIndeterminateSave,revision:window.__loadedCloudRevisionForSaveGuard})),{autosaveDisabled:false,pending:false,revision:after.syncMeta.rev});
  if(staleServerGet)assert.equal(await page.evaluate(async()=>(await FB.docRef.get({source:"server"})).data().syncMeta.rev),before.syncMeta.rev);
  await load();assert.equal(await page.locator('details[data-task-id="fixture-task-A"]').count(),0);assert.equal(await page.locator('details[data-task-id="fixture-task-B"]').count(),1);
  assert.equal(await page.evaluate(()=>isRecoveryMode()),false);
  const views=await page.evaluate(()=>{
    const stream=buildMaintenanceCompatibilityStream(),cost=computeCostModel();
    return {valid:OMAXGlobalIdentityRepair.integrity(window.__lastLoadedCloudState).valid,archived:stream.filter(row=>row.taskId==="fixture-task-A"),costRows:cost.maintenanceCostRows};
  });
  assert.equal(views.valid,true);assert.ok(views.archived.length);assert.ok(views.archived.every(row=>row.taskName.endsWith(" — Deleted")));
  await page.evaluate(()=>openSettingsAndReveal("fixture-task-A"));assert.match(dialogs.at(-1),/read-only/);
  assert.deepEqual(errors,[]);
});
