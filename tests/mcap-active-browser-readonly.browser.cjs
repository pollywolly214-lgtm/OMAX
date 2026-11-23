"use strict";
// MCAP: actual OMAX page + synthetic active stateIndexV1 + real sharder,
// all against a localhost-only Firebase stand-in. NO live credentials/network.
// Intentionally READ-ONLY: never bypass the source-controlled write gate.
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");

test("actual OMAX browser reads verified active Storage authority, keeps Recovery gate and never falls back",
  {timeout:120000},async t=>{
  const root=path.resolve(__dirname,"..");
  const mockScript=await fs.readFile(path.join(__dirname,
    "fixtures/mcap-firebase-browser-mock.js"),"utf8");
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
  const browser=await chromium.launch({headless:true});
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
    const expected=window.__mcapExpectedState;
    const loaded=window.__lastLoadedCloudState;
    const before=window.__mcapMockCounters();
    const same=window.OMAXShardedState.canonical(loaded)===
      window.OMAXShardedState.canonical(expected);
    const readOnly=await window.recoveryInspect();
    const sameRecovery=window.OMAXShardedState.canonical(readOnly.cloudState)===
      window.OMAXShardedState.canonical(expected);
    const attempt=await saveCloudNow();
    return {
      active:window.__omaxActiveStateBackend,
      recovery:window.__recoveryInspectMode,
      autosaveDisabled:window.__autosaveDisabled,
      loadedRevision:window.__loadedCloudRevisionForSaveGuard,
      expectedRevision:expected.syncMeta.rev,
      matchingState:same,
      matchingRecovery:sameRecovery,
      attemptSaved:attempt?.saved===true,
      stage:window.__mcapStageEvidence,
      before,
      after:window.__mcapMockCounters()
    };
  });
  assert.equal(inspection.active,"sharded");
  assert.equal(inspection.recovery,true);
  assert.equal(inspection.autosaveDisabled,true);
  assert.equal(inspection.loadedRevision,inspection.expectedRevision);
  assert.equal(inspection.matchingState,true,"Browser loaded incomplete/legacy state");
  assert.equal(inspection.matchingRecovery,true,"Recovery inspected stale legacy state");
  assert.equal(inspection.attemptSaved,false,"Writes must stay blocked");
  assert.ok(inspection.stage.fields>0);
  assert.equal(inspection.stage.objects,inspection.stage.fields+1);
  assert.equal(inspection.before.databaseWrites,0);
  assert.equal(inspection.after.databaseWrites,0);
  assert.deepEqual(errors,[],"Uncaught browser errors");
});
