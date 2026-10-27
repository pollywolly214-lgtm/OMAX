"use strict";
// Run explicitly; all non-local traffic is blocked and Firebase SDKs stay unloaded.
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
test("global busy cursor: real disposable save paths, verification, navigation, concurrency and recovery",{timeout:90000},async t=>{
  const root=path.resolve(__dirname,".."),server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname,file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)||pathname.split("/").some(part=>part.startsWith("."))){res.writeHead(403).end();return;}
    try{res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"})[path.extname(file)]||"text/plain"}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});t.after(()=>browser.close());
  const context=await browser.newContext({timezoneId:"America/Chicago",viewport:{width:1440,height:1000}});
  await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));page.setDefaultTimeout(7000);
  await page.clock.setFixedTime(new Date("2026-10-27T15:00:00Z"));
  const load=async()=>{await page.goto(origin+"/?devsafe=1");await page.waitForFunction(()=>window.OMAXDevSafe?.active&&window.__initialAdoptComplete);assert.equal(await page.evaluate(()=>typeof firebase),"undefined");};
  await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  const idle=async()=>{await page.waitForFunction(()=>OMAXFirebaseOperations.snapshot().pending===0);assert.equal(await page.evaluate(()=>document.documentElement.classList.contains("firebase-busy")),false);assert.notEqual(await page.locator("html").evaluate(node=>getComputedStyle(node).cursor),"progress");
    if(await page.locator("#cursorPointerProbe").count())assert.equal(await page.locator("#cursorPointerProbe").evaluate(node=>getComputedStyle(node).cursor),"pointer");
  };
  const active=async(label,pending=1)=>{
    const cursors=await page.evaluate(()=>{
      if(!document.getElementById("cursorProbes")){
        const probes=document.createElement("div");probes.id="cursorProbes";probes.style.cssText="position:absolute;left:-2000px;top:0";probes.setAttribute("aria-hidden","true");
        probes.innerHTML='<button id="cursorPointerProbe" style="cursor:pointer">Pointer</button><input style="cursor:text"><span class="dashboard-drag-handle">Drag</span><span class="dashboard-resize-ne">Resize</span><button disabled style="cursor:not-allowed">Disabled</button>';
        document.body.appendChild(probes);
      }
      return {busy:document.documentElement.classList.contains("firebase-busy"),cursors:[document.documentElement,document.body,...document.querySelectorAll("#cursorProbes > *, header button, header a, #calendarAddBtn")].map(node=>getComputedStyle(node).cursor),pseudo:getComputedStyle(document.querySelector("#cursorPointerProbe"),"::before").cursor};
    });
    assert.equal(cursors.busy,true);assert.ok(cursors.cursors.every(cursor=>cursor==="progress"),JSON.stringify(cursors));assert.equal(cursors.pseudo,"progress");
    assert.equal(await page.locator("#firebaseOperationLabel").textContent(),label);assert.equal(await page.evaluate(()=>OMAXFirebaseOperations.snapshot().pending),pending);
    assert.equal(await page.locator("header #firebaseOperationStatus, .firebase-operation-spinner").count(),0);
  };
  const hold=async(name,readNumber=2)=>page.evaluate(({name,readNumber})=>{
    const owner=name==="docRef.get"?FB.docRef:window,key=name==="docRef.get"?"get":name,original=owner[key];let calls=0;
    window.__restoreRead=()=>{owner[key]=original;};window.__held=false;window.__done=false;window.__result=null;
    owner[key]=async function(...args){if(++calls===readNumber){window.__held=true;await new Promise(resolve=>{window.__releaseRead=resolve;});}return original.apply(this,args);};
  },{name,readNumber});
  const finish=async()=>{await page.evaluate(()=>__releaseRead());await page.waitForFunction(()=>__done);const result=await page.evaluate(()=>__result);assert.equal(result.saved,true,JSON.stringify(result));await idle();await page.evaluate(()=>__restoreRead());};
  const awaitHeld=()=>page.waitForFunction(()=>__held||__done).then(async()=>assert.equal(await page.evaluate(()=>__held),true,JSON.stringify(await page.evaluate(()=>__result))));
  const holdWrite=()=>page.evaluate(()=>{
    const write=writeAuthoritativeStateSnapshot,transaction=FB.db.runTransaction.bind(FB.db);window.__writeHeld=false;window.__busyBackendSamples=[];
    window.__restoreWrite=()=>{window.writeAuthoritativeStateSnapshot=write;FB.db.runTransaction=transaction;};
    FB.db.runTransaction=(...args)=>{__busyBackendSamples.push({busy:document.documentElement.classList.contains("firebase-busy"),pending:OMAXFirebaseOperations.snapshot().pending});return transaction(...args);};
    window.writeAuthoritativeStateSnapshot=async(...args)=>{window.__writeHeld=true;await new Promise(resolve=>{window.__releaseWrite=resolve;});return write(...args);};
  });
  const verifyWriteAndReadback=async()=>{
    await page.waitForFunction(()=>__writeHeld||__done);assert.equal(await page.evaluate(()=>__writeHeld),true,JSON.stringify(await page.evaluate(()=>__result)));
    await active("Saving...");await page.evaluate(()=>__releaseWrite());await awaitHeld();await active("Saving...");
    const samples=await page.evaluate(()=>__busyBackendSamples);assert.ok(samples.length>=3);assert.ok(samples.every(sample=>sample.busy&&sample.pending===1),JSON.stringify(samples));
    await finish();await page.evaluate(()=>__restoreWrite());
  };
  // Exercise routing independently of the fixture's protected empty-job baseline.
  await page.evaluate(()=>{window.__navigation=OMAXFirebaseOperations.begin("saving");});await active("Saving...");
  const rootHandle=await page.locator("html").elementHandle();
  for(const hash of ["#/inventory","#/jobs","#/dashboard"]){await page.evaluate(hash=>{location.hash=hash;route();},hash);assert.equal(await page.locator("html").evaluate((node,original)=>node===original,rootHandle),true);await active("Saving...");}
  assert.equal(await page.locator("#tab-settings").isEnabled(),true);
  await page.setViewportSize({width:390,height:844});await active("Saving...");await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>__navigation.release());await idle();await load();
  // Ordinary queue includes layout, settings, hours, inventory and receipt saves.
  await hold("readMaintenanceTaskAuthoritativeState");
  await page.evaluate(()=>{window.__pending=saveCloudNow().then(result=>{__result=result;__done=true;});});
  await awaitHeld();await active("Saving...");await finish();
  // Water-quality uses its isolated writer and independent server reader.
  const protectedBefore=await page.evaluate(async()=>{const state=await readCurrentCloudStateReadOnly();delete state.waterQualityChecks;delete state.syncMeta;return state;});
  await hold("readInventoryMaterialAuthoritativeState");
  await page.evaluate(()=>{window.__pending=saveWaterQualityCheck({record:{id:"spinner-water",date:"2026-10-27",time:"10:00",ppm:125,softness:"Pass",initials:"RY",note:"Spinner fixture"}}).then(result=>{__result=result;__done=true;});});
  await awaitHeld();await active("Saving...");await finish();
  const protectedAfter=await page.evaluate(async()=>{const state=await readCurrentCloudStateReadOnly();delete state.waterQualityChecks;delete state.syncMeta;return state;});assert.deepEqual(protectedAfter,protectedBefore);
  // Seed only the disposable fixture's category, then use the real cutting coordinator.
  await page.evaluate(async()=>{if(!OMAXDevSafe.active||typeof firebase!=="undefined")throw Error("Disposable backend required");const source=(await FB.docRef.get()).data();source.jobFolders=[{id:"jobs_root",name:"All Jobs",parent:null,order:1},{id:"spinner-project",name:"1241 Lady Bird",parent:"jobs_root",order:2}];await FB.docRef.set(source);});
  await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await hold("docRef.get");
  await page.evaluate(()=>{window.__pending=createCuttingJob({id:"spinner-cut",name:"Spinner cut",cat:"spinner-project",projectNumber:"1241",startISO:"2026-10-27",dueISO:"2026-10-28",estimateHours:1,chargeRate:200,costRate:45,materialCost:0,materialQty:1,priority:1,manualLogs:[],files:[]}).then(result=>{__result=result;__done=true;});});
  await awaitHeld();await active("Saving...");await finish();
  // Real purchase coordinator also bypasses the ordinary save queue.
  await page.evaluate(()=>{location.hash="#/costs";route();});
  // Purchase APIs expose one backend read for baseline and one for verification.
  await page.evaluate(()=>{const original=FB.db.runTransaction.bind(FB.db);let wrote=false;window.__held=false;window.__done=false;window.__result=null;
    window.__restoreRead=()=>{FB.db.runTransaction=original;};
    FB.db.runTransaction=async callback=>{let thisWrite=false;const value=await original(tx=>callback({...tx,set(...args){thisWrite=true;return tx.set(...args);}}));if(thisWrite)wrote=true;else if(wrote){window.__held=true;await new Promise(resolve=>{window.__releaseRead=resolve;});}return value;};
    window.__pending=getPurchaseOrderApi().save({orderId:"spinner-order",date:"2026-10-27",shipping:"0",tax:"0",items:[{lineId:"spinner-line",purchased:"Spinner part",partNumber:"S1",cost:"10",qty:"1"}]}).then(result=>{__result=result;__done=true;});
  });
  await awaitHeld();await active("Saving...");await finish();
  // A real maintenance form performs an additional read after the queue's readback.
  await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await hold("readMaintenanceTaskAuthoritativeState",4);
  await holdWrite();
  await page.evaluate(()=>{const original=runMaintenanceCalendarMutation;window.__restoreRunner=()=>{window.runMaintenanceCalendarMutation=original;};window.runMaintenanceCalendarMutation=(...args)=>{const pending=original(...args);window.__pending=pending.then(result=>{__result=result;__done=true;});return pending;};});
  await page.locator("#calendarAddBtn").click();await page.locator('#dashboardAddModal [data-choice="task"]').click();await page.locator('[data-task-option="one-time"]').click();
  await page.locator("#dashOneTimeDate").fill("2026-10-27");await page.locator("#dashOneTimeName").fill("Spinner maintenance fixture");
  await page.locator('#dashOneTimeForm button[type="submit"]').click();
  await verifyWriteAndReadback();await page.waitForFunction(()=>!document.getElementById("dashboardAddModal").classList.contains("is-visible"));
  const occurrenceId=await page.evaluate(()=>__result.created.occurrence.id);
  const beforeRemove=await page.evaluate(()=>readCurrentCloudStateReadOnly());
  // Click the actual dashboard calendar item and its Remove action. No handler is replaced.
  await hold("readMaintenanceTaskAuthoritativeState",4);await holdWrite();
  await page.locator(`[data-cal-v2-one-time="${occurrenceId}"]`).first().click();
  page.once("dialog",dialog=>dialog.accept());await page.locator("[data-v2-panel-remove]").click();
  await verifyWriteAndReadback();await page.waitForFunction(()=>!document.getElementById("v2OneTimePanel"));
  assert.equal(await page.locator(`[data-cal-v2-one-time="${occurrenceId}"]`).count(),0);
  const afterRemove=await page.evaluate(()=>readCurrentCloudStateReadOnly());
  for(const field of Object.keys(beforeRemove).filter(field=>!["syncMeta","saveMeta","syncProcessLog","maintenanceOccurrencesV2"].includes(field)))assert.deepEqual(afterRemove[field],beforeRemove[field],field);
  assert.equal(afterRemove.saveMeta.lastSaveStatus,"saved");
  assert.deepEqual(afterRemove.maintenanceOccurrencesV2.filter(event=>beforeRemove.maintenanceOccurrencesV2.some(prior=>prior.id===event.id)),beforeRemove.maintenanceOccurrencesV2);
  await page.evaluate(()=>__restoreRunner());
  // Meaningful cloud load; a listener subscription never holds a registration.
  await page.evaluate(()=>{const original=FB.docRef.get.bind(FB.docRef);window.__done=false;window.__restoreRead=()=>{FB.docRef.get=original;};FB.docRef.get=async(...args)=>{window.__held=true;await new Promise(resolve=>{window.__releaseRead=resolve;});return original(...args);};window.__pending=loadFromCloud().then(result=>{__result=result;__done=true;});});
  await active("Loading...");
  for(const hash of ["#/inventory","#/dashboard"]){await page.evaluate(hash=>{location.hash=hash;route();},hash);await active("Loading...");}
  await page.evaluate(()=>__releaseRead());await page.waitForFunction(()=>__done);assert.equal(await page.evaluate(()=>__result.loaded),true);await page.evaluate(()=>__restoreRead());await idle();
  await page.evaluate(()=>startWorkspaceStateListener());await idle();
  await page.evaluate(()=>{window.__save=OMAXFirebaseOperations.begin("saving");window.__load=OMAXFirebaseOperations.begin("loading");});
  await active("Working...",2);await page.evaluate(()=>__save.release());await active("Loading...");await page.evaluate(()=>__load.release());await idle();
  // A real failed verification preserves Recovery Mode and releases its token.
  await page.evaluate(()=>{const original=readMaintenanceTaskAuthoritativeState;let reads=0;window.readMaintenanceTaskAuthoritativeState=async(...args)=>{if(++reads===2)throw Error("Fixture verification failure");return original(...args);};});
  const failed=await page.evaluate(()=>saveCloudNow());assert.equal(failed.indeterminate,true);assert.match(failed.error,/Fixture verification failure/);assert.equal(await page.evaluate(()=>__recoveryInspectMode),true);await idle();
  const blocked=await page.evaluate(()=>saveCloudNow());assert.equal(blocked.saved,false);await idle();
  assert.deepEqual(errors,[]);
});
