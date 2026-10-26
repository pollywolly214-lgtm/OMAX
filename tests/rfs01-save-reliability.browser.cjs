"use strict";
// Disposable localhost IndexedDB only. No Firebase SDK or external network.
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright"),{fixture}=require("./fixtures/mdel01-maintenance-task");
test("calendar archive, stale-view lifecycle cancellation, Dashboard layout and repeated saves survive actual reload",{timeout:90000},async t=>{
  const root=path.resolve(__dirname,".."),server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,"http://localhost"),file=path.resolve(root,"."+url.pathname+(url.pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)||url.pathname.split("/").some(part=>part.startsWith("."))){res.writeHead(403).end();return;}
    try{res.writeHead(200,{"Content-Type":{".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"}[path.extname(file)]||"text/plain","Cache-Control":"no-store"}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin="http://127.0.0.1:"+server.address().port,browser=await chromium.launch({headless:true,channel:"msedge"});t.after(()=>browser.close());
  const context=await browser.newContext({timezoneId:"America/Chicago",serviceWorkers:"block",viewport:{width:1440,height:1100}});
  await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));page.on("dialog",dialog=>dialog.accept());page.setDefaultTimeout(15000);
  await page.clock.setFixedTime(new Date("2026-10-23T17:00:00Z"));
  let loads=0;const load=async()=>{await page.goto(origin+"/?devsafe=1&rfs="+(++loads)+"#/");await page.waitForFunction(()=>OMAXDevSafe.active&&window.__initialAdoptComplete);assert.equal(await page.evaluate(()=>typeof firebase),"undefined");};
  const state=()=>page.evaluate(async()=>(await FB.docRef.get()).data());
  const healthy=async()=>assert.deepEqual(await page.evaluate(()=>({recovery:isRecoveryMode(),autosave:window.__autosaveDisabled,pending:hasPendingLocalChanges,uncertain:!!window.__lastIndeterminateSave,importFailure:!!window.__lastImportVerificationError})),{recovery:false,autosave:false,pending:false,uncertain:false,importFailure:false});
  await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await page.evaluate(async source=>{
    const next={...window.__lastLoadedCloudState,...source};next.settingsFolders=[{id:"fixture-category",name:"Fixture",parent:null,order:1}];
    next.tasksInterval.forEach((task,index)=>Object.assign(task,{cat:"fixture-category",parentTask:null,order:index+1,pn:"",manualLink:"",storeLink:"",note:""}));
    next.syncMeta.rev++;await FB.docRef.set(next);
  },fixture());
  await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);await load();await healthy();
  const before=await state();
  await page.evaluate(()=>showTaskBubble("fixture-task-A",document.querySelector("#content"),{dateISO:"2026-10-01",status:"completed"}));
  assert.equal(await page.evaluate(()=>window.CuttingJobImporter.firstDifferencePath(window.__lastLoadedCloudState,getCuttingJobChronologyLocalState())),"","Opening the popup must preserve authoritative history exactly");
  await page.locator("[data-bbl-remove-task]").click();await page.waitForFunction(()=>!window.maintenanceTaskDeletionApi.isBusy()&&!window.tasksInterval.some(task=>task.id==="fixture-task-A")).catch(async error=>{console.error(await page.evaluate(()=>({toasts:[...document.querySelectorAll(".toast")].map(node=>node.textContent),recovery:window.__recoveryReason,pending:hasPendingLocalChanges,block:window.__lastCloudSaveBlock,issues:window.__globalIdentityIssues,difference:window.CuttingJobImporter?.firstDifferencePath(window.__lastLoadedCloudState,getCuttingJobChronologyLocalState())})));throw error;});
  const archived=await state();assert.deepEqual(archived.deletedItems[0].payload,before.tasksInterval[0]);assert.deepEqual(archived.tasksInterval,[before.tasksInterval[1]]);
  for(const field of Object.keys(before).filter(name=>!["syncMeta","tasksInterval","deletedItems"].includes(name)))assert.deepEqual(archived[field],before[field],field);
  await healthy();await load();await healthy();assert.equal(await page.evaluate(()=>OMAXMaintenanceTaskArchive.resolve(window,"fixture-task-A").status),"archived");
  // Exact restore is also covered by the existing actual Restore-button suite.
  assert.equal((await page.evaluate(async()=>{const entry=window.deletedItems.find(row=>row.payload?.id==="fixture-task-A");return maintenanceTaskDeletionApi.restore(entry.id,OMAXMaintenanceTaskArchive.key(entry));})).saved,true);
  await load();await healthy();
  const creation=await page.evaluate(()=>runMaintenanceCalendarMutation(()=>createMaintenanceV2FromTemplate(window.tasksInterval[1],{mode:"one_time",eventType:"completed",effectiveDateISO:"2026-10-23",hours:0.5})));
  assert.equal(creation.saved,true,creation.error);const rootId=creation.created.scheduled.id;await load();await healthy();
  const beforeCancel=await state();
  await page.evaluate(async()=>{
    const ref=FB.docRef,get=ref.get.bind(ref),snapshot=await get();
    ref.get=options=>options?.source==="server"?Promise.resolve(snapshot):get(options);
    const run=FB.db.runTransaction.bind(FB.db);window.__rfsWrites=0;
    FB.db.runTransaction=callback=>run(tx=>callback({...tx,set:(...args)=>{window.__rfsWrites++;return tx.set(...args);}}));
  });
  await page.evaluate(id=>openV2OneTimePanel(id),rootId);
  await page.locator("[data-v2-panel-remove]").click();
  await page.waitForFunction(()=>window.maintenanceOccurrencesV2.some(row=>row.eventType==="removed")&&!hasPendingLocalChanges);
  // Wait for the user-facing acknowledgement, which occurs after backend readback.
  await page.waitForFunction(()=>Array.from(document.querySelectorAll(".toast")).some(node=>node.textContent.includes("Removed from calendar")));
  await healthy();const canceled=await state();assert.equal(await page.evaluate(()=>window.__rfsWrites),1);assert.ok(canceled.syncMeta.rev>beforeCancel.syncMeta.rev);
  const removal=canceled.maintenanceOccurrencesV2.find(row=>row.eventType==="removed");assert.equal(removal.rootOccurrenceId,rootId);
  assert.deepEqual(canceled.maintenanceOccurrencesV2.filter(row=>row.id!==removal.id),beforeCancel.maintenanceOccurrencesV2);
  for(const field of Object.keys(beforeCancel).filter(name=>!["syncMeta","saveMeta","syncProcessLog","maintenanceOccurrencesV2"].includes(name)))assert.deepEqual(canceled[field],beforeCancel[field],field);
  assert.equal(await page.evaluate(async()=>(await FB.docRef.get({source:"server"})).data().syncMeta.rev),beforeCancel.syncMeta.rev);
  await load();await healthy();assert.equal(await page.evaluate(id=>getV2OneTimeOccurrenceView(id).status,rootId),"removed");
  // Exercise real layout persistence with one reordered rectangle then removal.
  for(const remove of [false,true]){
    const baseline=await state();const result=await page.evaluate(async remove=>{const layout=getDashboardLayoutState();if(remove)delete layout.layoutById.calendar;else layout.layoutById.calendar={x:20,y:40,width:600,height:400};persistDashboardLayout(layout);return saveCloudNow();},remove);assert.equal(result.saved,true,JSON.stringify(result));
    const after=await state();for(const field of Object.keys(baseline).filter(name=>!["syncMeta","saveMeta","syncProcessLog","dashboardLayout"].includes(name)))assert.deepEqual(after[field],baseline[field],field);
    await load();await healthy();
  }
  assert.deepEqual(errors,[]);
});
