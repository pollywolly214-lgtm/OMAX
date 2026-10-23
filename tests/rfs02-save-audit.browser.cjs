"use strict";
// Independent browser profiles share a fixture-only localhost CAS backend.
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
const bridge=`(()=>{
 if(!OMAXDevSafe.active)throw Error('Disposable backend required');const db=OMAXDevSafe.db;
 const request=async(path,body)=>{const r=await fetch(path,{method:body?'POST':'GET',headers:{'X-OMAX-Fixture':'1','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Object.assign(Error('Fixture CAS conflict'),{code:'aborted'});return r.json();};
 const read=async path=>{const value=await request('/__read?path='+encodeURIComponent(path));return{exists:value!==null,data:()=>structuredClone(value),ref:{path,firestore:db},metadata:{fromCache:false,hasPendingWrites:false}};};
 const doc=path=>({path,firestore:db,get:()=>read(path),collection:name=>({doc:id=>doc(path+'/'+name+'/'+id)}),set:async(value,options)=>db.runTransaction(async tx=>{await tx.get(doc(path));tx.set(doc(path),value,options);}),onSnapshot:()=>()=>{}});
 db.doc=doc;db.collection=name=>({doc:id=>doc(name+'/'+id)});
 db.runTransaction=async callback=>{const reads=[],writes=[];const result=await callback({get:async ref=>{if(window.__rfsDenyRead&&window.__rfsWrites)throw Error('Independent fixture read unavailable');const snap=await read(ref.path);reads.push({path:ref.path,value:snap.data()});return snap;},set:(ref,value,options)=>{writes.push({path:ref.path,value,options});}});if(writes.length){await request('/__tx',{reads,writes});window.__rfsWrites=(window.__rfsWrites||0)+writes.length;}return result;};
})();`;
const clone=structuredClone,merge=(old,next)=>{if(!next||typeof next!=="object"||Array.isArray(next)||!Object.keys(next).length)return clone(next);const out=old&&typeof old==="object"&&!Array.isArray(old)?clone(old):{};for(const [key,value]of Object.entries(next))out[key]=merge(out[key],value);return out;};
test("RFS-02 independent sessions verify ordinary field saves, stale listener immunity, conflicts and committed read failure",{timeout:90000},async t=>{
 const root=path.resolve(__dirname,".."),documents=new Map();let commits=0;
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");
  if(url.pathname.startsWith('/__')){
   if(req.headers['x-omax-fixture']!=='1'){res.writeHead(403).end();return;}res.setHeader('Content-Type','application/json');
   if(url.pathname==='/__read'){res.end(JSON.stringify(documents.get(url.searchParams.get('path'))??null));return;}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const {reads,writes}=JSON.parse(Buffer.concat(chunks));
   if(reads.some(row=>JSON.stringify(documents.get(row.path)??null)!==JSON.stringify(row.value))){res.writeHead(409).end('{}');return;}
   for(const row of writes){const prior=documents.get(row.path)||{};let next=row.value;if(row.options?.merge)next=merge(prior,next);else if(row.options?.mergeFields){next=clone(prior);for(const field of row.options.mergeFields)next[field]=clone(row.value[field]);}documents.set(row.path,next);if(row.path.endsWith('/app/state'))commits++;}res.end('{}');return;
  }
  const file=path.resolve(root,"."+url.pathname+(url.pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+path.sep)||url.pathname.split('/').some(part=>part.startsWith('.'))){res.writeHead(403).end();return;}
  try{res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'text/plain'}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>browser.close());
 const errors=[];let loads=0;
 const session=async shared=>{const context=await browser.newContext({timezoneId:'America/Chicago',serviceWorkers:'block'});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());if(shared)await context.route('**/js/devsafeMode.js',async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(root,'js/devsafeMode.js'),'utf8')+'\n'+bridge}));const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());page.setDefaultTimeout(12000);return{page,context};};
 const load=async page=>{await page.goto(origin+'/?devsafe=1&rfs02='+(++loads)+'#/');await page.waitForFunction(()=>window.__initialAdoptComplete&&OMAXDevSafe.active);assert.equal(await page.evaluate(()=>typeof firebase),'undefined');};
 const boot=await session(false);await load(boot.page);assert.equal((await boot.page.evaluate(()=>saveCloudNow())).saved,true);await load(boot.page);assert.equal((await boot.page.evaluate(()=>saveCloudNow())).saved,true);
 const seed=await boot.page.evaluate(async()=>({path:FB.docRef.path,state:(await FB.docRef.get()).data()}));documents.set(seed.path,seed.state);await boot.context.close();
 const a=await session(true),b=await session(true);await load(a.page);await load(b.page);
 const health=async page=>assert.deepEqual(await page.evaluate(()=>({recovery:isRecoveryMode(),disabled:window.__autosaveDisabled,pending:hasPendingLocalChanges})),{recovery:false,disabled:false,pending:false});
 const mutations=[['maintenance','tasksInterval'],['inventory','inventory'],['purchase','receiptTrackerWeeks'],['hours','dailyCutHours'],['job','cuttingJobs'],['pump','pumpEff'],['calendar','maintenanceTasksV2']];
 for(const [kind,field]of mutations){
  const before=clone(documents.get(seed.path)),count=commits;
  const result=await a.page.evaluate(async kind=>{
   if(kind==='maintenance')window.tasksInterval[0].interval=Number(window.tasksInterval[0].interval)+1;
   if(kind==='inventory')window.inventory[0].qtyNew=(Number(window.inventory[0].qtyNew)||0)+1;
   if(kind==='purchase')window.receiptTrackerWeeks.push({key:'2026-10-19',rows:[{id:'rfs02-receipt',date:'2026-10-23',purchased:'Synthetic purchase',qty:1,cost:2}]});
   if(kind==='hours')setDailyCutHoursEntry('2026-10-23',2);
   if(kind==='job')window.cuttingJobs.push({id:'rfs02-job',name:'Synthetic',files:[],manualLogs:[{dateISO:'2026-10-23',completedHours:1}],priority:1});
   if(kind==='pump')window.pumpEff.entries.push({id:'rfs02-rpm',dateISO:'2026-10-23',rpm:3500,timeISO:'08:00'});
   if(kind==='calendar')window.maintenanceTasksV2.push({id:'rfs02-v2',name:'Synthetic definition'});
   const ref=FB.docRef,get=ref.get.bind(ref),old=await get();ref.get=options=>options?.source==='server'?Promise.resolve(old):get(options);
   return saveCloudNow();
  },kind);
  assert.equal(result.saved,true,kind+': '+result.error);assert.equal(result.verified,true);assert.equal(commits,count+1);const after=clone(documents.get(seed.path));assert.ok(after.syncMeta.rev>before.syncMeta.rev);
  for(const name of Object.keys(before).filter(name=>![field,'syncMeta','saveMeta','syncProcessLog'].includes(name)))assert.deepEqual(after[name],before[name],kind+': '+name);
  await load(a.page);await load(b.page);for(const page of [a.page,b.page]){await health(page);assert.deepEqual(await page.evaluate(field=>window.__lastLoadedCloudState[field],field),after[field]);}
 }
 // The actual legacy Remove occurrence click is an explicit, zero-write block.
 const isolationBefore=clone(documents.get(seed.path)),isolationCount=commits;
 await a.page.evaluate(()=>showTaskBubble(window.tasksInterval[0].id,document.querySelector('#content'),{dateISO:'2026-10-23'}));
 await a.page.locator('[data-bbl-remove-single]').click();
 assert.equal(commits,isolationCount);assert.deepEqual(documents.get(seed.path),isolationBefore);
 assert.deepEqual(await a.page.evaluate(()=>getInventoryIdentityRepairLocalState().tasksInterval),isolationBefore.tasksInterval);
 await a.page.evaluate(()=>{hideBubble();window.stopV2RepeatTracking('synthetic-missing-repeat');});assert.equal(commits,isolationCount);
 const diagnostic=await a.page.evaluate(source=>eval(source),await fs.readFile(path.join(root,'docs/RFS-02-read-only-health.js'),'utf8'));
 assert.equal(diagnostic.health.status,'WARNING');assert.match(diagnostic.health.scope,/UNTESTED/);assert.equal(commits,isolationCount);assert.deepEqual(documents.get(seed.path),isolationBefore);
 // Stale second session cannot overwrite a newer independently verified save.
 const first=await a.page.evaluate(async()=>{window.inventory[0].qtyNew++;return saveCloudNow();});assert.equal(first.verified,true);
 const count=commits,conflict=await b.page.evaluate(async()=>{window.inventory[0].qtyNew+=3;return saveCloudNow();});assert.equal(conflict.saved,false);assert.equal(commits,count);
 await load(a.page);await load(b.page);await health(a.page);await health(b.page);
 // A committed operation with unavailable readback stays unconfirmed, once.
 const beforeFailure=clone(documents.get(seed.path));await a.page.evaluate(()=>{window.__rfsDenyRead=true;window.__rfsWrites=0;});
 const uncertain=await a.page.evaluate(async()=>{window.inventory[0].qtyNew++;return saveCloudNow();});assert.equal(uncertain.saved,false);assert.equal(uncertain.stateWriteCompleted,true);assert.equal(uncertain.indeterminate,true);assert.equal(commits,count+1);
 assert.equal(await a.page.evaluate(()=>window.__loadedCloudRevisionForSaveGuard),beforeFailure.syncMeta.rev);assert.equal((await a.page.evaluate(()=>saveCloudNow())).saved,false);assert.equal(commits,count+1);
 await load(a.page);await load(b.page);await health(a.page);await health(b.page);assert.deepEqual(errors,[]);
});
