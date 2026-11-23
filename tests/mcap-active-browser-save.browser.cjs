"use strict";
// MCAP: actual OMAX page + synthetic active stateIndexV1 + real sharder,
// all against a localhost-only Firebase stand-in. NO live credentials/network.
// Enables writes only in the served localhost copy; production gate stays closed.
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");

test("actual OMAX browser performs verified Storage-backed save and reload in isolated localhost-only harness",
  {timeout:120000},async t=>{
  const root=path.resolve(__dirname,"..");
  const mockScript=await fs.readFile(path.join(__dirname,
    "fixtures/mcap-firebase-browser-write-mock.js"),"utf8");
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,"http://localhost"),pathname=url.pathname;
    const candidate=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!candidate.startsWith(root+path.sep)||pathname.split("/").some(x=>x.startsWith("."))){
      res.writeHead(403).end();return;
    }
    try{
      const contents=await fs.readFile(candidate);
      res.writeHead(200,{"Content-Type":({
        ".html":"text/html",".js":"text/javascript",".css":"text/css",
        ".svg":"image/svg+xml",".json":"application/json"
      })[path.extname(candidate)]||"text/plain","Cache-Control":"no-store"}).end(contents);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin="http://127.0.0.1:"+server.address().port;
  const browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});
  t.after(()=>browser.close());
  const context=await browser.newContext({serviceWorkers:"block"});
  await context.route("**/*",route=>{
    const uri=route.request().url();
    if(new URL(uri).origin===origin)return route.continue();
    // Default DENY for all Google/Firebase/OneDrive/external requests.
    return route.abort();
  });
  await context.route(/^https:\/\/www\.gstatic\.com\/firebasejs\/8\.10\.1\/firebase-(app|auth|firestore|storage)\.js$/,route=>{
    const target=route.request().url();
    return route.fulfill({status:200,contentType:"application/javascript",
      body:target.endsWith("/firebase-app.js")?mockScript:""});
  });
  // Test-runner-only substitution. Committed js/core.js stays hard-coded
  // MCAP_SHARDED_WRITES_ACTIVE=false and must never enable production writes.
  // Only localhost requests for core.js are modified, after all external
  // network requests were denied by the parent browser context.
  const actualCore=await fs.readFile(path.join(root,"js/core.js"),"utf8");
  const exactSwitch="const MCAP_SHARDED_WRITES_ACTIVE = false;";
  assert.equal(actualCore.split(exactSwitch).length,2,"Missing unique closed write gate");
  const isolatedCore=actualCore.replace(exactSwitch,
    "const MCAP_SHARDED_WRITES_ACTIVE = true;");
  assert.equal(isolatedCore.includes(exactSwitch),false);
  await context.route(origin+"/js/core.js",route=>
    route.fulfill({status:200,contentType:"text/javascript",body:isolatedCore})
  );
  const page=await context.newPage(),errors=[],consoleErrors=[];
  page.on("pageerror",err=>errors.push(err.message));
  page.on("console",message=>{
    if(message.type()==="error")consoleErrors.push(message.text());
  });
  page.on("dialog",dialog=>dialog.dismiss());
  page.setDefaultTimeout(15000);
  await page.goto(origin+"/");
  await page.waitForFunction(()=>
    !!window.__mcapMockError || window.__mcapCallbackFinished===true,
    null,{timeout:25000}
  );
  const initial=await page.evaluate(()=>({
    mockError:window.__mcapMockError||null,
    mockReady:window.__mcapMockCounters?.()||null,
    cloudLoadAttemptComplete:!!window.__cloudLoadAttemptComplete,
    initialAdoptComplete:!!window.__initialAdoptComplete,
    backend:window.__omaxActiveStateBackend||null,
    recoveryReason:window.__recoveryReason||null
  }));
  const details=JSON.stringify({...initial,consoleErrors,uncaughtErrors:errors});
  assert.equal(initial.mockError,null,details);
  assert.equal(initial.cloudLoadAttemptComplete,true,details);
  assert.equal(initial.initialAdoptComplete,true,details);
  const inspection=await page.evaluate(async()=>{
    if(window.__mcapMockError)throw Error(window.__mcapMockError);
    const original=window.__mcapExpectedState;
    const first=window.__lastLoadedCloudState;
    const before=window.__mcapMockCounters();
    const sameFirst=window.OMAXShardedState.canonical(first)===
      window.OMAXShardedState.canonical(original);
    const historical=window.__mcapMockLegacy();
    if(window.__recoveryInspectMode||window.__autosaveDisabled)
      throw Error("Unexpected read-only Recovery Mode in isolated writable fixture.");
    const result=await saveCloudNow();
    const after=window.__mcapMockCounters();
    const loaded=window.__lastLoadedCloudState;
    const current=await window.OMAXAuthorityRouter.fromBrowser();
    return {
      backend:window.__omaxActiveStateBackend,
      firstRevision:first.syncMeta.rev,
      before,
      after,
      firstExact:sameFirst,
      logicalBytes:new TextEncoder().encode(
        window.OMAXShardedState.canonical(original)).length,
      syntheticExtensionRetained:window.OMAXShardedState.canonical(
        current.state.mcapSyntheticLargeExtension)===
        window.OMAXShardedState.canonical(original.mcapSyntheticLargeExtension),
      stageEvidence:window.__mcapStageEvidence,
      saved:result?.saved===true,
      saveResult:result?.saved?null:{
        error:result?.error,errorCode:result?.errorCode,
        indeterminate:result?.indeterminate,
        blocked:result?.blocked
      },
      currentRevision:current.revision,
      loadedRevision:loaded?.syncMeta?.rev,
      guardRevision:window.__loadedCloudRevisionForSaveGuard,
      originalLegacyUnchanged:window.OMAXShardedState.canonical(historical)===
        window.OMAXShardedState.canonical(window.__mcapMockLegacy()),
      newBackendMode:current.mode,
      matchingCurrent:window.OMAXShardedState.canonical(current.state)===
        window.OMAXShardedState.canonical(loaded),
      recovery:window.__recoveryInspectMode,
      autosaveDisabled:window.__autosaveDisabled
    };
  });
  const proof=JSON.stringify({...inspection,consoleErrors,errors});
  assert.equal(inspection.backend,"sharded",proof);
  assert.equal(inspection.firstExact,true,proof);
  assert.ok(inspection.logicalBytes>975000,
    "Fixture must exceed the monolithic Firestore size limit: "+proof);
  assert.ok(inspection.stageEvidence.objects>inspection.stageEvidence.fields+1,
    "Oversized field must be split into at least two Storage shards: "+proof);
  assert.equal(inspection.syntheticExtensionRetained,true,proof);
  assert.equal(inspection.saved,true,proof);
  assert.equal(inspection.newBackendMode,"sharded",proof);
  assert.equal(inspection.matchingCurrent,true,proof);
  assert.equal(inspection.loadedRevision,inspection.currentRevision,proof);
  assert.equal(inspection.guardRevision,inspection.currentRevision,proof);
  assert.ok(inspection.currentRevision>inspection.firstRevision,proof);
  assert.equal(inspection.before.databaseWrites,0,proof);
  assert.equal(inspection.after.databaseWrites,1,proof);
  assert.ok(inspection.after.storageUploads>inspection.before.storageUploads,proof);
  assert.equal(inspection.originalLegacyUnchanged,true,proof);
  assert.equal(inspection.recovery,false,proof);
  assert.equal(inspection.autosaveDisabled,false,proof);
  const persisted=await page.evaluate(()=>
    window.__mcapPersistSnapshot(window.__lastLoadedCloudState));
  assert.equal(persisted.stateRevision,inspection.currentRevision);
  assert.equal(persisted.objectCount,inspection.after.storedObjects);
  await page.reload({waitUntil:"load"});
  await page.waitForFunction(()=>!!window.__mcapMockError||
    window.__mcapCallbackFinished===true,null,{timeout:25000});
  const restored=await page.evaluate(async()=>{
    const expected=window.__mcapExpectedState;
    const actual=window.__lastLoadedCloudState;
    const authority=await window.OMAXAuthorityRouter.fromBrowser();
    return {
      error:window.__mcapMockError||null,
      backend:window.__omaxActiveStateBackend,
      adopted:window.__initialAdoptComplete,
      savedRevision:actual?.syncMeta?.rev,
      expectedRevision:expected?.syncMeta?.rev,
      sameState:window.OMAXShardedState.canonical(actual)===
        window.OMAXShardedState.canonical(expected),
      independentlyVerified:window.OMAXShardedState.canonical(authority.state)===
        window.OMAXShardedState.canonical(expected),
      unchangedLegacy:window.__mcapMockLegacy()?.syncMeta?.rev===1,
      counters:window.__mcapMockCounters(),
      readOnly:window.__recoveryInspectMode,
      autosaveDisabled:window.__autosaveDisabled
    };
  });
  const refreshProof=JSON.stringify(restored);
  assert.equal(restored.error,null,refreshProof);
  assert.equal(restored.backend,"sharded",refreshProof);
  assert.equal(restored.adopted,true,refreshProof);
  assert.equal(restored.savedRevision,inspection.currentRevision,refreshProof);
  assert.equal(restored.expectedRevision,inspection.currentRevision,refreshProof);
  assert.equal(restored.sameState,true,refreshProof);
  assert.equal(restored.independentlyVerified,true,refreshProof);
  assert.equal(restored.unchangedLegacy,true,refreshProof);
  assert.equal(restored.readOnly,false,refreshProof);
  assert.equal(restored.autosaveDisabled,false,refreshProof);
  assert.equal(restored.counters.databaseWrites,0,
    "Reload must not write or reseed any data: "+refreshProof);
  // Exercise an actual application business-history setter, not just a
  // no-op save. Preserve everything else, including oversized opaque fields.
  const historyChange=await page.evaluate(async()=>{
    const before=window.__lastLoadedCloudState;
    const baseline=window.OMAXShardedState.canonical(
      before.mcapSyntheticLargeExtension);
    const changed=window.setDailyCutHoursEntry("2026-11-22",3.5,{
      source:"manual"
    });
    const saved=await saveCloudNow();
    const verified=await window.OMAXAuthorityRouter.fromBrowser();
    const day=verified.state.dailyCutHours.find(row=>
      row.dateISO==="2026-11-22");
    const result={
      changed,saved:saved?.saved===true,
      error:saved?.saved?null:saved,
      dateISO:day?.dateISO,hours:day?.hours,
      source:day?.source,
      revision:verified.revision,
      previousRevision:before.syncMeta.rev,
      retainedOpaque:window.OMAXShardedState.canonical(
        verified.state.mcapSyntheticLargeExtension)===baseline,
      retainedMaintenance:window.OMAXShardedState.canonical(
        verified.state.maintenanceOccurrencesV2)===
        window.OMAXShardedState.canonical(before.maintenanceOccurrencesV2),
      legacyRev:window.__mcapMockLegacy()?.syncMeta?.rev,
      matchingLoaded:window.OMAXShardedState.canonical(verified.state)===
        window.OMAXShardedState.canonical(window.__lastLoadedCloudState)
    };
    await window.__mcapPersistSnapshot(window.__lastLoadedCloudState);
    return result;
  });
  const historyProof=JSON.stringify(historyChange);
  assert.equal(historyChange.changed,true,historyProof);
  assert.equal(historyChange.saved,true,historyProof);
  assert.equal(historyChange.dateISO,"2026-11-22",historyProof);
  assert.equal(historyChange.hours,3.5,historyProof);
  assert.equal(historyChange.source,"manual",historyProof);
  assert.ok(historyChange.revision>historyChange.previousRevision,historyProof);
  assert.equal(historyChange.retainedOpaque,true,historyProof);
  assert.equal(historyChange.retainedMaintenance,true,historyProof);
  assert.equal(historyChange.legacyRev,1,historyProof);
  assert.equal(historyChange.matchingLoaded,true,historyProof);
  await page.reload({waitUntil:"load"});
  await page.waitForFunction(()=>!!window.__mcapMockError||
    window.__mcapCallbackFinished===true,null,{timeout:25000});
  const dayAfterReload=await page.evaluate(async()=>{
    const active=await window.OMAXAuthorityRouter.fromBrowser();
    return {
      error:window.__mcapMockError||null,
      revision:active.revision,
      adoptedRevision:window.__lastLoadedCloudState?.syncMeta?.rev,
      day:active.state.dailyCutHours.find(row=>row.dateISO==="2026-11-22"),
      exact:window.OMAXShardedState.canonical(active.state)===
        window.OMAXShardedState.canonical(window.__lastLoadedCloudState),
      writes:window.__mcapMockCounters().databaseWrites,
      legacyRev:window.__mcapMockLegacy()?.syncMeta?.rev
    };
  });
  const dayProof=JSON.stringify(dayAfterReload);
  assert.equal(dayAfterReload.error,null,dayProof);
  assert.equal(dayAfterReload.revision,historyChange.revision,dayProof);
  assert.equal(dayAfterReload.adoptedRevision,historyChange.revision,dayProof);
  assert.equal(dayAfterReload.day?.hours,3.5,dayProof);
  assert.equal(dayAfterReload.day?.source,"manual",dayProof);
  assert.equal(dayAfterReload.exact,true,dayProof);
  assert.equal(dayAfterReload.writes,0,dayProof);
  assert.equal(dayAfterReload.legacyRev,1,dayProof);
  assert.deepEqual(errors,[],"Uncaught browser errors");
});
