"use strict";
// Disposable localhost IndexedDB only; all external requests are blocked.
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright"),{fixture,definitions}=require("./fixtures/mdel01c-inventory");
test("real inventory Delete confirmation preserves task/calendar/cost history across Settings and reload",{timeout:60000},async t=>{
  const root=path.resolve(__dirname,".."),server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname,file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"})[path.extname(file)]||"text/plain"}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin="http://127.0.0.1:"+server.address().port,browser=await chromium.launch({headless:true,channel:"msedge"});t.after(()=>browser.close());
  const context=await browser.newContext({timezoneId:"America/Chicago",serviceWorkers:"block",viewport:{width:1440,height:1100}});
  await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));page.setDefaultTimeout(12000);
  page.on("dialog",dialog=>dialog.accept());
  let loads=0;
  const load=async(hash="#/inventory")=>{await page.goto(origin+"/?devsafe=1&inventoryDelete="+(++loads)+hash);await page.waitForFunction(()=>OMAXDevSafe.active&&window.__initialAdoptComplete);};
  const save=async()=>{const result=await page.evaluate(()=>saveCloudNow());assert.equal(result.saved,true,JSON.stringify({result,diagnostics:await page.evaluate(()=>({reason:window.__recoveryReason,issues:window.__globalIdentityIssues,block:window.__lastCloudSaveBlock,errors:window.__inventoryIdentityIssues}))}));};
  await load("#/settings");assert.equal(await page.evaluate(()=>typeof firebase),"undefined");
  await save();
  await load("#/settings");await save();
  await page.evaluate(async fixture=>{
    if(!OMAXDevSafe.active)throw Error("Disposable backend required");
    const state={...window.__lastLoadedCloudState,...fixture};
    state.settingsFolders=[{id:"fixture-category",name:"Maintenance",parent:null,order:1}];
    state.tasksInterval.forEach((task,index)=>Object.assign(task,{cat:"fixture-category",parentTask:null,order:index+1,pn:"",manualLink:"",storeLink:"",note:""}));
    state.syncMeta.rev++;await FB.docRef.set(state);
  },fixture());
  await load();await save();await load();
  const before=await page.evaluate(async()=>(await FB.docRef.get()).data());
  const reporting=()=>page.evaluate(()=>({costs:computeCostModel().maintenanceCostRows,stream:buildMaintenanceCompatibilityStream(),projections:window.maintenanceCalendarInstancesV2.flatMap(instance=>projectV2RepeatDates(instance))}));
  const beforeViews=await reporting();
  for(const item of before.inventory){
    await page.locator('[data-inventory-delete="'+item.id+'"]').click();
    await page.locator("[data-confirm-confirm]").click();
    await page.waitForFunction(id=>!window.inventoryDeletionApi.isBusy()&&!window.inventory.some(item=>item.id===id),item.id);
    assert.equal(await page.evaluate(()=>isRecoveryMode()),false);
  }
  const after=await page.evaluate(async()=>(await FB.docRef.get()).data());assert.deepEqual(after.inventory,[]);
  for(const field of Object.keys(before).filter(field=>!["syncMeta","inventory","deletedItems"].includes(field)))assert.deepEqual(after[field],before[field],field);
  for(const item of before.inventory)assert.deepEqual(after.deletedItems.find(entry=>entry.type==="inventory"&&entry.payload.id===item.id).payload,item);
  assert.deepEqual(after.deletedItems.slice(2),before.deletedItems);assert.deepEqual(await reporting(),beforeViews);
  await load("#/settings");assert.equal(await page.evaluate(()=>isRecoveryMode()),false);
  assert.deepEqual(await page.evaluate(()=>window.inventory),[]);
  for(const definition of definitions){
    assert.equal(await page.locator('details[data-task-id="'+definition.legacy+'"]').count(),1);
    assert.match(await page.locator('[data-inventory-link-label="'+definition.legacy+'"]').textContent(),/Deleted inventory:/);
  }
  assert.deepEqual(await reporting(),beforeViews);
  await load("#/deleted");
  for(const item of before.inventory){const entry=after.deletedItems.find(entry=>entry.payload?.id===item.id);assert.equal(await page.locator('[data-trash-delete="'+entry.id+'"]').isDisabled(),true);}
  await load();assert.deepEqual(await page.evaluate(()=>window.inventory),[]);
  assert.equal(await page.evaluate(()=>OMAXGlobalIdentityRepair.integrity(window.__lastLoadedCloudState).valid),true);
  assert.equal(await page.evaluate(()=>isRecoveryMode()),false);assert.deepEqual(errors,[]);
});
