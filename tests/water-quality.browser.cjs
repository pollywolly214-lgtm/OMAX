"use strict";
// OMAX_PLAYWRIGHT_PATH may point to the bundled Playwright installation.
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
test("water quality: guarded backend persistence, verified UI, legacy storage failure and retry",{timeout:60000},async t=>{
 const root=path.resolve(__dirname,".."),server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,"http://localhost").pathname,file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
  if(!file.startsWith(root+path.sep)||pathname.split("/").some(part=>part.startsWith("."))){res.writeHead(403).end();return;}
  try{const content=await fs.readFile(file);res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"})[path.extname(file)]||"text/plain"}).end(content);}catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});t.after(()=>browser.close());
 const context=await browser.newContext({timezoneId:"America/Chicago",viewport:{width:1280,height:900}});
 // Disposable profile and local fixture backend only; all external requests blocked.
 await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.fulfill({status:200,contentType:"text/javascript",body:""}));
 const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));page.setDefaultTimeout(8000);
 await page.clock.setFixedTime(new Date("2026-10-20T14:15:00Z"));
 const ready=async()=>{await page.waitForFunction(()=>window.OMAXDevSafe?.active&&window.__initialAdoptComplete);assert.equal(await page.evaluate(()=>typeof firebase),"undefined");};
 await page.goto(origin+"/?devsafe=1");await ready();
 // The disposable seed has no revision; establish the same committed baseline as production.
 assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);await page.reload();await ready();
 assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
 const form=page.locator("#waterQualityForm"),modal=page.locator("#waterQualityModal"),editor=page.locator("#waterQualityEditForm"),status=page.locator("#waterQualityStatus");
 const fill=async(values={},target=form)=>{for(const [name,value]of Object.entries({date:"2026-10-20",time:"09:15",ppm:"125.5",softness:"Pass",initials:"RY",note:"Retain this note",...values})){const input=target.locator(`[name="${name}"]`);if(name==="softness")await input.selectOption(value);else await input.fill(value);}};
 const submit=()=>form.getByRole("button",{name:"Submit",exact:true}).click();
 const cloud=()=>page.evaluate(()=>readCurrentCloudStateReadOnly());
 const before=await cloud(),legacy=[{id:"old-local",date:"2026-10-19",time:"08:15",ppm:50,softness:"Pass",initials:"AB",note:"Existing browser history"}];
 await page.evaluate(legacy=>{
  localStorage.setItem("omax.waterQualityChecks.v1",JSON.stringify(legacy));
  window.__legacyWrites=0;const set=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){if(key==="omax.waterQualityChecks.v1"){window.__legacyWrites++;throw new DOMException("Legacy key write blocked","QuotaExceededError");}return set.call(this,key,value);};
 },legacy);
 // The legacy failure is real: writes throw. The new path must never write it.
 assert.equal(await page.evaluate(()=>{try{localStorage.setItem("omax.waterQualityChecks.v1","[]");return false;}catch{return true;}}),true);
 await page.evaluate(()=>window.__legacyWrites=0);
 for(const invalid of [{date:""},{time:""},{ppm:""},{softness:""},{initials:"   "}]){await fill(invalid);await submit();assert.equal(await form.evaluate(node=>node.checkValidity()),false);}
 assert.deepEqual(await cloud(),before);
 // Hold the backend readback: neither the success message nor input reset may happen early.
 await page.evaluate(()=>{const read=readInventoryMaterialAuthoritativeState;let reads=0;window.readInventoryMaterialAuthoritativeState=async()=>{if(++reads===2)await new Promise(resolve=>{window.__releaseWaterReadback=resolve;});const value=await read();window.__waterEnvelope=value;return value;};});
 await fill();await submit();await page.waitForFunction(()=>typeof window.__releaseWaterReadback==="function").catch(async error=>{throw Error(error.message+" "+JSON.stringify(await page.evaluate(()=>({status:document.getElementById("waterQualityStatus").textContent,recovery:window.__recoveryReason,block:window.__lastCloudSaveBlock,pending:window.__waterQualityMutationPending,dirty:hasPendingLocalChanges,envelope:window.__waterEnvelope&&{revision:window.__waterEnvelope.revision,path:window.__waterEnvelope.path,source:window.__waterEnvelope.readSource,sync:window.__waterEnvelope.state?.syncMeta},target:captureCuttingJobSaveTarget().path,loadedRev:window.__loadedCloudRevisionForSaveGuard,differences:Object.keys(window.__waterEnvelope?.state||{}).filter(name=>!["syncMeta","saveMeta","syncProcessLog"].includes(name)&&OMAXWaterQuality.key(window.__waterEnvelope.state[name])!==OMAXWaterQuality.key(getInventoryIdentityRepairLocalState()[name])),issues:checkAuthoritativeIdentityIntegrity(window.__waterEnvelope?.state).blockers}))));});
 assert.equal(await form.locator('[name="ppm"]').inputValue(),"125.5");assert.equal(await form.locator('[name="ppm"]').isDisabled(),true);assert.doesNotMatch(await status.textContent(),/Check saved and verified/);
 await page.evaluate(()=>window.__releaseWaterReadback());await page.waitForFunction(()=>document.getElementById("waterQualityStatus").textContent.includes("saved and verified"));
 assert.equal(await form.locator('[name="ppm"]').inputValue(),"");assert.equal(await page.evaluate(()=>window.__legacyWrites),0);
 const saved=await cloud();assert.equal(saved.waterQualityChecks.length,2);assert.deepEqual(saved.waterQualityChecks.find(row=>row.id==="old-local").legacySource,legacy[0]);
 for(const key of Object.keys(before).filter(key=>!["waterQualityChecks","syncMeta"].includes(key)))assert.deepEqual(saved[key],before[key],key);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem("omax.waterQualityChecks.v1"))),legacy);
 await page.reload();await ready();
 assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);assert.deepEqual((await cloud()).waterQualityChecks,saved.waterQualityChecks);
 await page.getByRole("button",{name:"View Water Quality Log",exact:true}).click();assert.equal(await page.locator("#waterQualityRows tr").count(),2);
 await page.locator("#waterQualityRows tr").first().getByRole("button",{name:"Edit",exact:true}).click();
 await fill({ppm:"60",softness:"Fail",initials:"CD",note:"Corrected after retest"},editor);await editor.getByRole("button",{name:"Save",exact:true}).click();await editor.waitFor({state:"hidden"});
 const edited=(await cloud()).waterQualityChecks[0];assert.equal(edited.ppm,60);assert.equal(edited.softness,"Fail");assert.equal(edited.initials,"CD");assert.equal(edited.editHistory[0].before.ppm,125.5);assert.equal(edited.editHistory[0].actorUid,await page.evaluate(()=>FB.user.uid));
 await page.getByRole("button",{name:"Close Water Quality Log",exact:true}).click();assert.equal(await modal.isHidden(),true);
 // A genuine backend denial must preserve all six fields and produce a backend error.
 await page.evaluate(()=>{
  const run=FB.db.runTransaction.bind(FB.db);window.__denyWaterWrite=true;
  FB.db.runTransaction=callback=>run(transaction=>callback({...transaction,set(...args){if(window.__denyWaterWrite)throw Object.assign(Error("Firebase test permission denied"),{code:"permission-denied"});return transaction.set(...args);}}));
 });
 const beforeFailure=await cloud();await fill({ppm:"222",initials:"EF",note:"Keep entered values"});await submit();await page.waitForFunction(()=>document.getElementById("waterQualityStatus").textContent.includes("Firebase test permission denied"));
 for(const [name,value]of Object.entries({date:"2026-10-20",time:"09:15",ppm:"222",softness:"Pass",initials:"EF",note:"Keep entered values"}))assert.equal(await form.locator(`[name="${name}"]`).inputValue(),value);
 assert.deepEqual(await cloud(),beforeFailure);const retryId=await page.evaluate(()=>window.__waterQualityDrafts.get("new"));
 await page.evaluate(()=>window.__denyWaterWrite=false);await submit();await page.waitForFunction(()=>document.getElementById("waterQualityStatus").textContent.includes("saved and verified"));
 assert.equal((await cloud()).waterQualityChecks.filter(row=>row.id===retryId).length,1);
 // A legacy read failure is a distinct warning; it cannot redirect saves to local storage.
 await page.evaluate(()=>{const get=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key==="omax.waterQualityChecks.v1")throw new DOMException("Legacy read blocked","SecurityError");return get.call(this,key);};});
 await fill({ppm:"333",note:"No legacy dependency"});await submit();await page.waitForFunction(()=>document.getElementById("waterQualityStatus").textContent.includes("Browser-only water-quality history could not be read"));
 assert.match(await status.textContent(),/saved and verified/);assert.equal((await cloud()).waterQualityChecks.length,4);
 // A post-commit render exception must never turn verified success into a retryable failure.
 await page.evaluate(()=>{window.renderWaterQualityCalendarEvents=()=>{throw Error("fixture display failure");};});
 await fill({ppm:"444"});await submit();await page.waitForFunction(()=>document.getElementById("waterQualityStatus").textContent.includes("Reload to refresh the display"));
 assert.match(await status.textContent(),/saved and verified/);assert.equal(await form.locator('[name="ppm"]').inputValue(),"");assert.equal((await cloud()).waterQualityChecks.length,5);
 {
  // Seed a previously saved layout without Water Quality in this disposable profile.
  const layoutPage = await context.newPage();
  layoutPage.on("pageerror", error => errors.push(error.message));
  layoutPage.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  layoutPage.setDefaultTimeout(8000);
  await layoutPage.clock.setFixedTime(new Date("2026-10-20T02:30:00Z"));
  const loadLayout = async () => {
    await layoutPage.goto(origin + "/?devsafe=1");
    await layoutPage.waitForFunction(() => window.OMAXDevSafe?.active && window.__initialAdoptComplete);
  };
  await loadLayout();
  // Settle built-in seed anchors before taking the protected-data baseline.
  assert.equal((await layoutPage.evaluate(() => saveCloudNow())).saved, true);
  await loadLayout();
  assert.equal((await layoutPage.evaluate(() => saveCloudNow())).saved, true);
  // The existing native layout saver also refreshes derived opportunity rollups.
  // Initialize those fixture values before asserting all protected fields stay equal.
  await layoutPage.evaluate(() => saveCloudDebounced());
  await layoutPage.waitForFunction(() => window.opportunityRollups?.length === 4);
  assert.equal((await layoutPage.evaluate(() => saveCloudNow())).saved, true);
  const legacy = {
    averageHours:{ x:0, y:0, width:1000, height:160 },
    totalHours:{ x:0, y:180, width:400, height:250 },
    nextDue:{ x:420, y:180, width:500, height:250 },
    pumpLog:{ x:0, y:450, width:1000, height:480 },
    pumpChart:{ x:0, y:950, width:1000, height:400 },
    timeEfficiency:{ x:0, y:1370, width:1000, height:420 }
  };
  await layoutPage.evaluate(async legacy => {
    if (!OMAXDevSafe.active || typeof firebase !== "undefined") throw Error("Disposable backend required");
    const ref = OMAXDevSafe.db.doc(FB.docRef.path), state = (await ref.get()).data();
    // Include the existing derived display baseline so native layout saves have no fixture drift.
    await ref.set({ ...state, opportunityRollups:window.opportunityRollups, dashboardLayout:legacy });
  }, legacy);
  await loadLayout();
  const layoutState = () => layoutPage.evaluate(() => JSON.parse(JSON.stringify(getDashboardLayoutState().layoutById)));
  const added = await layoutState();
  for (const [id, box] of Object.entries(legacy)) assert.deepEqual(added[id], box, `preserve legacy ${id}`);
  assert.ok(added.waterQuality.y >= 1814, "new window appended below saved windows");
  const protectedCloud = () => layoutPage.evaluate(async () => {
    const data = await readCurrentCloudStateReadOnly();
    for (const key of ["dashboardLayout", "syncMeta", "saveMeta", "syncProcessLog"]) delete data[key];
    return data;
  });
  const layoutBefore = await protectedCloud();
  const windowBox = layoutPage.locator('[data-dashboard-window="waterQuality"]');
  const viewStyle = () => windowBox.evaluate(element => ({ x:parseFloat(element.style.left), y:parseFloat(element.style.top), width:parseFloat(element.style.width), height:parseFloat(element.style.height) }));
  const originalBox = await viewStyle();
  await layoutPage.locator("#dashboardSettingsToggle").click();
  await layoutPage.locator("#dashboardEditToggle").click();
  assert.equal(await layoutPage.locator("#dashboardLayout").evaluate(element => element.classList.contains("is-editing")), true);
  assert.equal(await layoutPage.locator(".calendar-block .dashboard-drag-handle, .calendar-block .dashboard-resize-handle").count(), 0);
  const drag = windowBox.locator(":scope > .dashboard-drag-handle");
  await drag.scrollIntoViewIfNeeded();
  const dragRect = await drag.boundingBox();
  await layoutPage.mouse.move(dragRect.x + dragRect.width / 2, dragRect.y + dragRect.height / 2);
  await layoutPage.mouse.down(); await layoutPage.mouse.move(dragRect.x + dragRect.width / 2, dragRect.y + dragRect.height / 2 + 70, { steps:5 }); await layoutPage.mouse.up();
  assert.ok((await viewStyle()).y > originalBox.y, "native drag moves the window");
  const resize = windowBox.locator(":scope > .dashboard-resize-se");
  await resize.scrollIntoViewIfNeeded();
  const resizeRect = await resize.boundingBox(), beforeResize = await viewStyle();
  await layoutPage.mouse.move(resizeRect.x + resizeRect.width / 2, resizeRect.y + resizeRect.height / 2);
  await layoutPage.mouse.down(); await layoutPage.mouse.move(resizeRect.x + resizeRect.width / 2 - 80, resizeRect.y + resizeRect.height / 2 + 60, { steps:5 }); await layoutPage.mouse.up();
  const resized = await viewStyle();
  assert.ok(resized.width < beforeResize.width, "native resize changes width");
  assert.ok(resized.height > beforeResize.height, "native resize changes height");
  await layoutPage.locator("#dashboardEditPopupButton").click();
  const savedLayout = await layoutState();
  for (const [id, box] of Object.entries(legacy)) assert.deepEqual(savedLayout[id], box);
  assert.equal((await layoutPage.evaluate(() => saveCloudNow())).saved, true);
  assert.deepEqual(await protectedCloud(), layoutBefore, "only layout configuration changed");
  await loadLayout();
  assert.deepEqual(await layoutState(), savedLayout);
  assert.deepEqual(await viewStyle(), resized);
  assert.equal(await windowBox.locator("#waterQualityForm").isVisible(), true);
  const initialCalendarChecks = await layoutPage.locator("#months [data-cal-water-quality]").count();
  const movedForm = windowBox.locator("#waterQualityForm");
  await movedForm.locator('[name="ppm"]').fill("55");
  await movedForm.locator('[name="softness"]').selectOption("Fail");
  await movedForm.locator('[name="initials"]').fill("EF");
  await movedForm.getByRole("button", { name:"Submit", exact:true }).click();
  await layoutPage.waitForFunction(count => document.querySelectorAll("#months [data-cal-water-quality]").length === count, initialCalendarChecks + 1);
  await windowBox.locator("#waterQualityViewLog").click();
  await layoutPage.locator("#waterQualityRows tr").first().getByRole("button", { name:"Edit", exact:true }).click();
  await layoutPage.locator('#waterQualityEditForm [name="note"]').fill("After layout refresh");
  await layoutPage.locator("#waterQualityEditForm").getByRole("button", { name:"Save", exact:true }).click();
  await layoutPage.locator("#waterQualityEditForm").waitFor({ state:"hidden" });
  await layoutPage.locator("#waterQualityCloseLog").click();
  await loadLayout();
  assert.deepEqual(await layoutState(), savedLayout);
  await layoutPage.waitForFunction(count => document.querySelectorAll("#months [data-cal-water-quality]").length === count, initialCalendarChecks + 1);
  assert.equal(await layoutPage.evaluate(async () => (await readCurrentCloudStateReadOnly()).waterQualityChecks[0].note), "After layout refresh");
  const afterWaterCheck = await protectedCloud();
  delete afterWaterCheck.waterQualityChecks; delete layoutBefore.waterQualityChecks;
  assert.deepEqual(afterWaterCheck, layoutBefore);
  await layoutPage.close();
 }
 assert.deepEqual(errors,[]);
});
