"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");

// Actual OMAX scripts and guards; only Firebase transport and the served
// localhost write switch are substituted. Never contact production services.
async function openActiveBrowser(t){
  const root=path.resolve(__dirname,"../..");
  const mock=await fs.readFile(path.join(__dirname,"mcap-firebase-browser-write-mock.js"),"utf8");
  const server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname;
    const file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)||pathname.split("/").some(p=>p.startsWith("."))){res.writeHead(403).end();return;}
    try{
      const data=await fs.readFile(file);
      res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"})[path.extname(file)]||"text/plain","Cache-Control":"no-store"}).end(data);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin="http://127.0.0.1:"+server.address().port;
  const browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});
  t.after(()=>browser.close());
  const context=await browser.newContext({timezoneId:"America/Chicago",serviceWorkers:"block",viewport:{width:1440,height:1100}});
  await context.addInitScript(()=>{
    window.__mcapFixtureSeed=state=>{
      state.jobFolders.push({id:"mcap-project",name:"1241 Synthetic MCAP",projectNumber:"1241",parent:"jobs_root",order:2});
    };
  });
  await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await context.route(/^https:\/\/www\.gstatic\.com\/firebasejs\/8\.10\.1\/firebase-(app|auth|firestore|storage)\.js$/,route=>route.fulfill({status:200,contentType:"application/javascript",body:route.request().url().endsWith("/firebase-app.js")?mock:""}));
  const core=await fs.readFile(path.join(root,"js/core.js"),"utf8"),gate="const MCAP_SHARDED_WRITES_ACTIVE = false;";
  assert.equal(core.split(gate).length,2,"Production write gate must remain uniquely closed");
  await context.route(origin+"/js/core.js",route=>route.fulfill({status:200,contentType:"text/javascript",body:core.replace(gate,"const MCAP_SHARDED_WRITES_ACTIVE = true;")}));
  const page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("dialog",dialog=>dialog.dismiss());
  page.setDefaultTimeout(15000);
  async function ready(){
    await page.waitForFunction(()=>!!window.__mcapMockError||window.__mcapCallbackFinished===true,null,{timeout:25000});
    assert.deepEqual(await page.evaluate(()=>({error:window.__mcapMockError||null,adopted:window.__initialAdoptComplete,backend:window.__omaxActiveStateBackend,recovery:window.__recoveryInspectMode})),{error:null,adopted:true,backend:"sharded",recovery:false});
  }
  const state=()=>page.evaluate(async()=>(await OMAXAuthorityRouter.fromBrowser()).state);
  async function reload(expected){
    await page.evaluate(expected=>window.__mcapPersistSnapshot(expected),expected);
    await page.reload();await ready();
    assert.deepEqual(await state(),expected,"Exact independent Storage readback after refresh");
    assert.deepEqual(await page.evaluate(()=>window.__lastLoadedCloudState),expected,"Reload adopted complete state");
    assert.equal(await page.evaluate(()=>window.__mcapMockCounters().databaseWrites),0,"Refresh must not write");
  }
  await page.goto(origin+"/");await ready();
  // Establish the normal app's fully adopted/compacted baseline before a
  // specialized action; do not override its pending/local evidence guards.
  const saved=await page.evaluate(()=>saveCloudNow());
  assert.equal(saved.saved,true,JSON.stringify(saved));
  await reload(await state());
  return {page,state,reload,errors};
}
function assertOnlyFieldsChanged(before,after,fields){
  const allowed=new Set(["syncMeta",...fields]);
  for(const field of new Set([...Object.keys(before),...Object.keys(after)])){
    if(!allowed.has(field))assert.deepEqual(after[field],before[field],"Unrelated field: "+field);
  }
  assert.ok(after.syncMeta.rev>before.syncMeta.rev,`Revision advanced: ${before.syncMeta.rev} -> ${after.syncMeta.rev}`);
}
module.exports={openActiveBrowser,assertOnlyFieldsChanged};
