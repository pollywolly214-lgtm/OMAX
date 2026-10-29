"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright"),{fixture}=require("./fixtures/costdata-01g.cjs");
function chartFixture(){const source=fixture();source.pumpEff={entries:[],notes:[],baselineHistory:[]};const task=source.tasksInterval.find(task=>task.id==="unknown");task.name="Jewell orifice & nozzle body cleaning (weekly)";task.manualHistory[0].dateISO="2026-07-15";
source.maintenanceTasksV2=[{id:"native-v2",system:"v2",name:"Calendar zero",price:null,downtimeHours:null}];
source.maintenanceCalendarInstancesV2=[{id:"native-instance",taskId:"native-v2",system:"v2",instanceMode:"one_time",startDateISO:"2026-06-01",status:"active"}];
source.maintenanceOccurrencesV2=[{id:"native-root",system:"v2",taskId:"native-v2",instanceId:"native-instance",eventType:"scheduled",effectiveDateISO:"2026-06-01",recordedAtISO:"2026-05-31T12:00:00Z"},{id:"native-done",system:"v2",taskId:"native-v2",instanceId:"native-instance",rootOccurrenceId:"native-root",eventType:"completed",effectiveDateISO:"2026-06-01",originalDateISO:"2026-06-01",recordedAtISO:"2026-06-01T12:00:00Z",loggedHours:0,partsCostSnapshot:0}];return source;}
for(const width of [1440,390])

test(`02B zero cost, exact chart navigation, archived Settings, verified edit and failed save (${width}px)`,{timeout:90000},async t=>{
  const root=path.resolve(__dirname,".."),server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname,file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)||pathname.split("/").some(part=>part.startsWith("."))){res.writeHead(403).end();return;}
    try{res.writeHead(200,{"Content-Type":{".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"}[path.extname(file)]||"text/plain"}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});t.after(()=>browser.close());
  const context=await browser.newContext({timezoneId:"America/Chicago",viewport:{width,height:1100},hasTouch:true,serviceWorkers:"block"});await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const p=await context.newPage(),errors=[];p.on("pageerror",error=>errors.push(error.message));p.setDefaultTimeout(10000);await p.clock.setFixedTime(new Date("2026-10-26T17:00:00Z"));let loads=0;
  const load=async(hash="#/costs")=>{await p.goto(origin+"/?devsafe=1&costdata01g="+(++loads)+hash);await p.waitForFunction(()=>window.__initialAdoptComplete&&OMAXDevSafe.active);assert.equal(await p.evaluate(()=>typeof firebase),"undefined");};
  await load();assert.equal((await p.evaluate(()=>saveCloudNow())).verified,true);await load();assert.equal((await p.evaluate(()=>saveCloudNow())).verified,true);await load();
  await p.evaluate(async source=>{if(!OMAXDevSafe.active||typeof firebase!=="undefined")throw Error("Disposable backend required");await FB.docRef.set({...window.__lastLoadedCloudState,...source,syncMeta:window.__lastLoadedCloudState.syncMeta});},chartFixture());await load();
  const archived=await p.evaluate(()=>maintenanceTaskDeletionApi.remove("configured-parts"));assert.equal(archived.verified,true,archived.error);
  const cloud=()=>p.evaluate(async()=>(await FB.docRef.get()).data()),baseline=await cloud();
  await p.evaluate(()=>{window.__costViewWrites=0;window.__costOriginals={};window.__sourceBefore=JSON.stringify(getCuttingJobImporterState());for(const name of ["saveCloudNow","saveCloudDebounced","markLocalMutation","persistLocalStateBackup"]){__costOriginals[name]=window[name];window[name]=()=>{__costViewWrites++;throw Error("Navigation cannot save: "+name);};}window.__scrolledKeys=[];const scroll=HTMLElement.prototype.scrollIntoView;HTMLElement.prototype.scrollIntoView=function(...args){if(this.matches("[data-maintenance-row]"))__scrolledKeys.push(this.dataset.sourceEventKey);return scroll.apply(this,args);};});
  const model=await p.evaluate(()=>computeCostModel());assert.equal(model.incompleteMaintenanceMarkers.length,0);assert.equal(model.financialReconciliation.maintenance.knownSubtotal,246);
  const zero=model.maintenanceSeries.find(pt=>pt.dateISO==="2026-07-15");assert.equal(zero.value,0);assert.equal(zero.rowRefs.length,1);
  const point=async(date,key="maintenance")=>{const canvas=p.locator("#costChart");await canvas.scrollIntoViewIfNeeded();const target=await canvas.evaluate((el,{date,key})=>el.__costChartTargets.find(pt=>pt.key===key&&pt.rowRef.dateISO===date),{date,key});assert.ok(target);const box=await canvas.boundingBox(),size=await canvas.evaluate(el=>({width:el.width,height:el.height}));return {x:box.x+(target.rect.x+target.rect.width/2)*box.width/size.width,y:box.y+(target.rect.y+target.rect.height/2)*box.height/size.height,target};};
  const click=async(date,key="maintenance")=>{const pt=await point(date,key);if(width===390)await p.touchscreen.tap(pt.x,pt.y);else await p.mouse.click(pt.x,pt.y);return pt;};
  const modal=p.locator("#costDataCenterModal"),close=()=>modal.locator("button[data-close-data-center]").click();
  const z=await point("2026-07-15");assert.equal(z.target.eventLane,undefined);assert.ok(z.target.rect.y>46,"Zero costs belong inside the monetary plot, never the top review lane");
  await p.mouse.move(z.x,z.y);const tip=p.locator(".cost-chart-tooltip[data-visible='true']");assert.match(await tip.innerText(),/Jewell.*Estimated.*2026-07-15.*Parts: \$0.00.*Labor: 0 hr.*Total: \$0.00/s);
  await click("2026-07-15");assert.equal(await modal.getAttribute("aria-hidden"),"false");assert.equal(await modal.locator('[data-dc-tab="maintenance"]').getAttribute("aria-selected"),"true");
  const selected=modal.locator("[data-maintenance-row]:visible");assert.equal(await selected.count(),1);assert.equal(await selected.getAttribute("data-source-event-key"),zero.rowRefs[0].sourceEventKey);
  assert.equal(await selected.getAttribute("data-maintenance-row-link-highlight"),"1");assert.ok((await p.evaluate(()=>__scrolledKeys)).includes(zero.rowRefs[0].sourceEventKey));
  // A stale key must never fall back to another event or a similarly named task.
  assert.equal(await p.evaluate(()=>__focusCostDataCenterRow({type:"maintenance",sourceEventKey:"missing-key",taskId:"unknown",dateISO:"2026-07-15"})),false);assert.equal(await modal.locator("[data-maintenance-row]:visible").count(),0);await close();
  await click("2026-04-15");const grouped=await modal.locator("[data-maintenance-row]:visible").evaluateAll(rows=>rows.map(row=>row.dataset.sourceEventKey).sort());
  assert.deepEqual(grouped,model.maintenanceSeries.find(pt=>pt.dateISO==="2026-04-15").rowRefs.map(ref=>ref.sourceEventKey).sort());assert.equal(grouped.length,3);
  assert.equal(await modal.locator("[data-maintenance-row-link-highlight]:visible").count(),3);await modal.locator("[data-maintenance-chart-show-all]").click();assert.equal(await modal.locator("[data-maintenance-row]:visible").count(),12);await close();
  for(const [key,tab]of [["jobs","cutting"],["spend","spend"]]){await click("2026-07-15",key);assert.equal(await modal.locator(`[data-dc-tab="${tab}"]`).getAttribute("aria-selected"),"true");await close();}
  await click("2026-06-01");let nativeRow=modal.locator("[data-maintenance-row]:visible");assert.equal(await nativeRow.getAttribute("data-source-event-key"),"v2:native-root");
  assert.equal(await nativeRow.locator('[data-maintenance-link-mode] option[value="settings"]').isDisabled(),true);
  await nativeRow.locator("[data-maintenance-open-task]").click();await p.waitForFunction(()=>location.hash==="#/");
  await p.waitForSelector('[data-v2-root-occurrence-id="native-root"]');assert.deepEqual(await cloud(),baseline);await p.locator("[data-v2-panel-close]").click();
  await p.evaluate(()=>{location.hash="#/costs";});await p.waitForSelector("#costChart");
  await click("2026-02-04");let row=modal.locator("[data-maintenance-row]:visible");await row.locator("[data-maintenance-link-mode]").selectOption("settings");await row.locator("[data-maintenance-open-task]").click();
  const history=p.locator('[data-maintenance-history="configured-parts"]');assert.match(await history.innerText(),/Archived task/);await history.locator("[data-close]").click();
  assert.equal(await p.evaluate(()=>window.tasksInterval.some(task=>task.id==="configured-parts")),false);
  await click("2026-07-15");row=modal.locator("[data-maintenance-row]:visible");await row.locator("[data-maintenance-link-mode]").selectOption("settings");await row.locator("[data-maintenance-open-task]").click();
  await p.waitForFunction(()=>location.hash.includes("settings?taskId=unknown"));const task=p.locator('details.task[data-task-id="unknown"]');await p.waitForFunction(()=>document.querySelector('details.task[data-task-id="unknown"]')?.open);assert.equal(await task.getAttribute("open"),"");
  assert.equal(await p.evaluate(()=>__costViewWrites),0);assert.equal(await p.evaluate(()=>JSON.stringify(getCuttingJobImporterState())===__sourceBefore),true);assert.deepEqual(await cloud(),baseline);
  await p.evaluate(()=>{for(const[name,fn]of Object.entries(__costOriginals))window[name]=fn;window.__holdCostSave=true;const gate=new Promise(resolve=>window.__releaseCostSave=resolve);const tx=FB.db.runTransaction;window.__originalCostTransaction=tx;FB.db.runTransaction=async(...args)=>{if(__holdCostSave)await gate;return tx.apply(FB.db,args);};});
  await task.locator("[data-edit-task]").click();await task.locator('[data-k="price"]').fill("170");await task.locator('[data-k="price"]').blur();await p.clock.setFixedTime(new Date("2026-10-26T17:00:10Z"));
  assert.equal(await p.evaluate(()=>computeCostModel().maintenanceCostRows.find(row=>row.taskId==="unknown").totalCost),0,"Pending edit cannot masquerade as verified expense");
  await p.waitForFunction(()=>typeof window.__releaseCostSave==="function");await p.evaluate(()=>{__holdCostSave=false;__releaseCostSave();});
  await p.waitForFunction(()=>window.__lastLoadedCloudState.tasksInterval.find(task=>task.id==="unknown")?.price===170);
  await p.waitForFunction(()=>!hasPendingLocalChanges);await p.evaluate(()=>cloudSaveQueue);
  await task.locator('[data-k="downtimeHours"]').fill("0.5");await task.locator('[data-k="downtimeHours"]').blur();await p.clock.setFixedTime(new Date("2026-10-26T17:00:20Z"));
  const durationSaved=await p.evaluate(()=>saveCloudNow());assert.equal(durationSaved.verified,true,JSON.stringify({durationSaved,preflight:await p.evaluate(()=>window.__lastDangerousSaveBlock?.preflight?.reasons)}));
  await p.waitForFunction(()=>window.__lastLoadedCloudState.tasksInterval.find(task=>task.id==="unknown")?.downtimeHours===.5);
  await p.evaluate(()=>{location.hash="#/costs";});await p.waitForSelector("#costChart");assert.equal(await p.evaluate(()=>computeCostModel().financialReconciliation.maintenance.knownSubtotal),431);
  assert.equal(await p.evaluate(()=>computeCostModel().maintenanceSeries.find(pt=>pt.dateISO==="2026-07-15").value),-185);const saved=await cloud();assert.deepEqual(saved.tasksInterval.find(task=>task.id==="unknown").manualHistory,baseline.tasksInterval.find(task=>task.id==="unknown").manualHistory);
  // Reuse the real Settings editor again, rejecting only the disposable backend transaction.
  await click("2026-07-15");row=modal.locator("[data-maintenance-row]:visible");await row.locator("[data-maintenance-link-mode]").selectOption("settings");await row.locator("[data-maintenance-open-task]").click();await task.locator("[data-edit-task]").click();
  await p.evaluate(()=>{FB.db.runTransaction=async()=>{throw Object.assign(Error("Synthetic denied Settings save"),{code:"permission-denied"});};});
  await task.locator('[data-k="price"]').fill("999");await task.locator('[data-k="downtimeHours"]').fill("0");
  const failed=await p.evaluate(()=>saveCloudNow());assert.equal(failed.saved,false);assert.equal(await task.locator('[data-k="downtimeHours"]').inputValue(),"0");
  assert.equal(await p.evaluate(()=>computeCostModel().maintenanceCostRows.find(row=>row.taskId==="unknown").totalCost),185);assert.deepEqual(await cloud(),saved);
  assert.deepEqual(errors,[]);await load();assert.equal(await p.evaluate(()=>computeCostModel().financialReconciliation.maintenance.knownSubtotal),431);assert.deepEqual(await cloud(),saved);
});
