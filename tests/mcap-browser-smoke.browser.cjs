"use strict";
// MCAP browser regression: localhost + OMAXDevSafe disposable backend ONLY.
// External network requests are blocked, Firebase SDK must remain unloaded.
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
const {fixture}=require("./fixtures/mdel01-maintenance-task");

test("MCAP migration scripts preserve real legacy UI load, protected saves and reload",{timeout:120000},async t=>{
  const root=path.resolve(__dirname,"..");
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,"http://localhost");
    const pathname=url.pathname,rel="."+pathname+(pathname.endsWith("/")?"index.html":"");
    const file=path.resolve(root,rel);
    if(!file.startsWith(root+path.sep)||pathname.split("/").some(part=>part.startsWith("."))){
      res.writeHead(403).end();return;
    }
    try{
      const body=await fs.readFile(file);
      res.writeHead(200,{"Content-Type":({
        ".html":"text/html",".js":"text/javascript",".css":"text/css",
        ".svg":"image/svg+xml",".json":"application/json"
      })[path.extname(file)]||"text/plain","Cache-Control":"no-store"}).end(body);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin="http://127.0.0.1:"+server.address().port;
  const browser=await chromium.launch({headless:true});
  t.after(()=>browser.close());
  const context=await browser.newContext({
    timezoneId:"America/Chicago",serviceWorkers:"block",
    viewport:{width:1360,height:960}
  });
  await context.route("**/*",route=>
    new URL(route.request().url()).origin===origin?route.continue():route.abort()
  );
  const page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("dialog",dialog=>dialog.accept());
  page.setDefaultTimeout(15000);
  let iteration=0;
  const load=async(hash="#/")=>{
    await page.goto(origin+"/?devsafe=1&mcapSmoke="+(++iteration)+hash);
    await page.waitForFunction(()=>
      window.OMAXDevSafe?.active && window.__initialAdoptComplete === true
    );
    assert.equal(await page.evaluate(()=>typeof firebase),"undefined",
      "A test that loads Firebase is unsafe and must abort.");
    assert.deepEqual(await page.evaluate(()=>({
      backend:window.__omaxActiveStateBackend,
      path:FB.docRef?.path,routerLoaded:!!window.OMAXAuthorityRouter,
      activeShardedIndex:window.OMAXDevSafe?.active===false
    })),{
      backend:"legacy",path:"workspaces/github-prod/app/state",
      routerLoaded:true,activeShardedIndex:false
    });
  };
  const save=async()=>{
    const result=await page.evaluate(()=>saveCloudNow());
    assert.equal(result.saved,true,JSON.stringify(result));
    assert.equal(result.indeterminate===true,false);
  };
  const read=()=>page.evaluate(async()=>(await FB.docRef.get()).data());
  await load();
  await save();
  await load();
  const original=await read();
  // Same stable, nontrivial protected fixture used by the established
  // maintenance persistence browser suite. Never passed to real Firebase.
  await page.evaluate(async source=>{
    if(!window.OMAXDevSafe?.active||typeof firebase!=="undefined")
      throw Error("Disposable fixture gate failed.");
    const next={...window.__lastLoadedCloudState,...source};
    next.settingsFolders=[
      {id:"fixture-category",name:"Fixture",parent:"root",order:1},
      {id:"root",name:"All Tasks",parent:null,order:3},
      {id:"interval",name:"Per Interval",parent:"root",order:2},
      {id:"asreq",name:"As Required",parent:"root",order:1}
    ];
    // Representative fixture originally used pumpEff:{entries:[]}, while
    // the canonical existing app model includes these empty baseline fields.
    // Align ONLY this disposable fixture, then compare the complete saved
    // pumpEff object byte-for-byte like every other protected field.
    next.pumpEff={...next.pumpEff,
      notes:Array.isArray(next.pumpEff?.notes)?next.pumpEff.notes:[],
      baselineRPM:next.pumpEff?.baselineRPM??null,
      baselineDateISO:next.pumpEff?.baselineDateISO??null};
    next.tasksInterval.forEach((task,index)=>Object.assign(task,{
      cat:"fixture-category",parentTask:null,order:index+1,
      pn:"",manualLink:"",storeLink:"",note:""
    }));
    next.syncMeta.rev++;
    await FB.docRef.set(next);
  },fixture());
  await load();
  const seeded=await read();
  assert.ok(seeded.tasksInterval.length>0);
  await save();
  const afterSave=await read();
  for(const field of Object.keys(seeded).filter(name=>name!=="syncMeta"&&name!=="saveMeta"))
    assert.deepEqual(afterSave[field],seeded[field],field+" changed during legacy save");
  await load("#/inventory");
  const afterReload=await read();
  for(const field of Object.keys(afterSave).filter(name=>name!=="syncMeta"&&name!=="saveMeta"))
    assert.deepEqual(afterReload[field],afterSave[field],field+" lost after reload");
  for(const route of ["#/jobs","#/dashboard","#/costs","#/settings"]){
    await page.evaluate(route=>{location.hash=route;window.route();},route);
    assert.ok(await page.locator("#content").count());
  }
  assert.equal(await page.evaluate(()=>window.__recoveryInspectMode),false);
  assert.equal(await page.evaluate(()=>window.__autosaveDisabled),false);
  assert.deepEqual(errors,[],"Browser console has uncaught errors.");
  assert.deepEqual(original.inventory,[],"Initial test workspace must be empty.");
});
