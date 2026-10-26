"use strict";
// Isolated localhost backend shared by independent browser contexts. It contains
// fixtures only; external requests and all Firebase SDK access are blocked.
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright"),{fixture}=require("./fixtures/mdel01-maintenance-task");
const archive=require("../js/maintenanceTaskArchive");
const bridge=`
(() => {
  if(!OMAXDevSafe.active || !['localhost','127.0.0.1'].includes(location.hostname))throw Error('Disposable bridge only');
  const db=OMAXDevSafe.db;
  const request=async(endpoint,body)=>{
    const result=await fetch(endpoint,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-OMAX-Disposable':'1'},body:body?JSON.stringify(body):undefined});
    if(!result.ok)throw Object.assign(Error('Disposable backend transaction rejected'),{code:'aborted'});
    return result.json();
  };
  const snapshot=(path,value)=>({exists:value!==null,data:()=>structuredClone(value),metadata:{fromCache:false,hasPendingWrites:false},ref:{path,firestore:db}});
  const read=async path=>snapshot(path,await request('/__fixture_read?path='+encodeURIComponent(path)));
  const doc=path=>({path,firestore:db,collection:name=>({doc:id=>doc(path+'/'+name+'/'+id)}),get:()=>read(path),
    async set(value,options){await db.runTransaction(async tx=>{await tx.get(doc(path));tx.set(doc(path),value,options);});},
    onSnapshot(callback){let stopped=false,last='';const poll=async()=>{try{const snap=await read(path),key=JSON.stringify(snap.data());if(!stopped&&last!==key){last=key;callback(snap);}}catch{}};poll();const timer=setInterval(poll,300);return()=>{stopped=true;clearInterval(timer);};}
  });
  db.doc=doc;db.collection=name=>({doc:id=>doc(name+'/'+id)});
  db.runTransaction=async callback=>{
    const reads=[],writes=[];
    const result=await callback({get:async ref=>{const snap=await read(ref.path);reads.push({path:ref.path,value:snap.data()});return snap;},set:(ref,value,options)=>writes.push({path:ref.path,value:structuredClone(value),options})});
    if(writes.length)await request('/__fixture_tx',{reads,writes});
    return result;
  };
})();`;
for(const olderArchive of [false,true])test("actual Restore confirmation, history and two independent browser sessions"+(olderArchive?" with older no-history archive":" with rich legacy/V2 history"),{timeout:90000},async t=>{
  const root=path.resolve(__dirname,".."),documents=new Map();let commits=0;
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,"http://localhost");
    if(url.pathname.startsWith('/__fixture_')){
      if(req.headers['x-omax-disposable']!=='1'){res.writeHead(403).end();return;}
      res.setHeader('Content-Type','application/json');
      if(url.pathname==='/__fixture_read'){res.end(JSON.stringify(documents.get(url.searchParams.get('path'))??null));return;}
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const {reads,writes}=JSON.parse(Buffer.concat(chunks));
      if(reads.some(row=>JSON.stringify(documents.get(row.path)??null)!==JSON.stringify(row.value))){res.writeHead(409).end('{}');return;}
      for(const row of writes){documents.set(row.path,row.options?.merge?{...documents.get(row.path),...row.value}:row.value);commits++;}
      res.end('{}');return;
    }
    const file=path.resolve(root,"."+url.pathname+(url.pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)||url.pathname.split('/').some(part=>part.startsWith('.'))){res.writeHead(403).end();return;}
    try{res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'text/plain'}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});t.after(()=>browser.close());
  const newSession=async shared=>{
    const context=await browser.newContext({timezoneId:'America/Chicago',serviceWorkers:'block',viewport:{width:1440,height:1100}});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    if(shared)await context.route('**/js/devsafeMode.js',async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(root,'js/devsafeMode.js'),'utf8')+'\n'+bridge}));
    const page=await context.newPage(),errors=[],dialogs=[];page.setDefaultTimeout(12000);
    page.on('pageerror',error=>errors.push(error.message));page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept();});
    await page.clock.setFixedTime(new Date('2026-10-23T17:00:00Z'));
    return {context,page,errors,dialogs};
  };
  let loads=0;const load=async(page,hash='#/settings')=>{await page.goto(origin+'/?devsafe=1&mdel01c='+(++loads)+hash);await page.waitForFunction(()=>OMAXDevSafe.active&&window.__initialAdoptComplete);assert.equal(await page.evaluate(()=>typeof firebase),'undefined');};
  // Provision a complete app-shaped fixture in the original disposable backend.
  const bootstrap=await newSession(false);await load(bootstrap.page);assert.equal((await bootstrap.page.evaluate(()=>saveCloudNow())).saved,true);
  await load(bootstrap.page);assert.equal((await bootstrap.page.evaluate(()=>saveCloudNow())).saved,true);
  await bootstrap.page.evaluate(async source=>{
    const state={...window.__lastLoadedCloudState,...source};state.settingsFolders=[{id:'fixture-category',name:'Fixture Maintenance',parent:null,order:1}];
    state.tasksInterval.forEach((task,index)=>Object.assign(task,{cat:'fixture-category',parentTask:null,order:index+1,pn:'',manualLink:'',storeLink:'',note:'Preserve task notes'}));
    state.tasksInterval[0].completedDates.push('2026-10-02','2026-10-03');
    state.tasksInterval[0].manualHistory.push({id:'fixture-independent-same-day',dateISO:'2026-10-01',status:'completed',partsCostSnapshot:25,hours:1,note:'Independent cost and note'});
    const event=structuredClone(state.maintenanceOccurrencesV2[0]);Object.assign(event,{id:'fixture-second-completion',rootOccurrenceId:'repeat:fixture-instance-A:slot:2',partsCostSnapshot:25,payload:{hours:1,note:'Independent V2 root'}});state.maintenanceOccurrencesV2.push(event);
    await FB.docRef.set(state);
  },fixture());
  await load(bootstrap.page);assert.equal((await bootstrap.page.evaluate(()=>saveCloudNow())).saved,true);await load(bootstrap.page);
  let initial=await bootstrap.page.evaluate(async()=>(await FB.docRef.get()).data()),docPath=await bootstrap.page.evaluate(()=>FB.docRef.path);
  await bootstrap.context.close();
  if(olderArchive){
    initial.tasksInterval[0].completedDates=[];initial.tasksInterval[0].manualHistory=[];initial.maintenanceTasksV2=[];initial.maintenanceCalendarInstancesV2=[];initial.maintenanceOccurrencesV2=[];
    const entry={id:'fixture-old-trash',type:'task',payload:structuredClone(initial.tasksInterval[0]),meta:{list:'interval'},deletedAt:'2020-01-01T00:00:00Z',label:'Maintenance task: Mixing Tube .042'};
    initial={...initial,tasksInterval:initial.tasksInterval.slice(1),deletedItems:[entry]};
  }
  documents.set(docPath,structuredClone(initial));
  const first=await newSession(true),second=await newSession(true);await load(first.page,olderArchive?'#/deleted':'#/settings');await load(second.page);
  const business=state=>({...state,syncMeta:initial.syncMeta});
  const reporting=page=>page.evaluate(()=>({stream:buildMaintenanceCompatibilityStream().map(({taskName,...row})=>row).sort((a,b)=>a.streamId.localeCompare(b.streamId)),
    costs:computeCostModel().maintenanceCostRows.map(row=>[row.taskId,row.dateISO,row.rootOccurrenceId||'',row.totalCost,row.costIncomplete]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
    projected:window.maintenanceCalendarInstancesV2.flatMap(instance=>projectV2RepeatDates(instance))}));
  const beforeViews=await reporting(first.page);
  if(!olderArchive){
    const card=first.page.locator('details[data-task-id="fixture-task-A"]');
    await card.evaluate(element=>{for(let parent=element.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;});
    await card.locator(':scope > summary').click({button:'right'});
    await first.page.locator('#maintenanceContextMenu [data-action="delete"]').dispatchEvent('click');
    await first.page.locator('[data-confirm-confirm]').click();await first.page.waitForFunction(()=>!maintenanceTaskDeletionApi.isBusy()&&window.deletedItems.some(entry=>entry.payload?.id==='fixture-task-A'));
    assert.equal(commits,1);assert.equal(await first.page.evaluate(()=>isRecoveryMode()),false);
    const archived=documents.get(docPath);assert.deepEqual(archived.deletedItems[0].payload,initial.tasksInterval[0]);
    for(const field of Object.keys(initial).filter(name=>!['syncMeta','tasksInterval','deletedItems'].includes(name)))assert.deepEqual(archived[field],initial[field],field);
    const archivedViews=await reporting(first.page);assert.deepEqual(archivedViews.stream,beforeViews.stream);assert.deepEqual(archivedViews.costs,beforeViews.costs);assert.deepEqual(archivedViews.projected,[]);
    await first.page.evaluate(()=>{location.hash='#/deleted';});
  }
  await first.page.locator('[data-trash-restore]').first().waitFor();
  const archived=structuredClone(documents.get(docPath)),entry=archived.deletedItems.find(row=>row.payload?.id==='fixture-task-A'),restore=first.page.locator('[data-trash-restore="'+entry.id+'"]');
  assert.equal(await restore.isEnabled(),true);assert.equal(await first.page.locator('[data-trash-delete="'+entry.id+'"]').isDisabled(),true);
  const commitsBeforeRestore=commits;
  await restore.click();assert.match(await first.page.locator('[data-confirm-message]').innerText(),/original ID.*repeat schedules will resume.*Stored event dates/s);
  await first.page.locator('[data-confirm-cancel]').click();assert.equal(commits,commitsBeforeRestore);assert.deepEqual(documents.get(docPath),archived);
  // Real Recovery Mode and repair blockers disable the actual button, not just API calls.
  for(const flag of ['__recoveryInspectMode','__globalIdentityVerificationPending']){
    await first.page.evaluate(flag=>{window[flag]=true;renderDeletedItems();},flag);assert.equal(await restore.isDisabled(),true);
    await first.page.evaluate(flag=>{window[flag]=false;renderDeletedItems();},flag);
  }
  await restore.click();await first.page.locator('[data-confirm-confirm]').click();
  await first.page.waitForFunction(()=>!maintenanceTaskDeletionApi.isBusy()&&!window.deletedItems.some(entry=>entry.payload?.id==='fixture-task-A'));
  assert.deepEqual(first.dialogs,[]);assert.equal(commits,commitsBeforeRestore+1);
  const after=structuredClone(documents.get(docPath)),expected=archive.planRestore(archived,entry.id);assert.deepEqual({...after,syncMeta:archived.syncMeta},expected);
  assert.deepEqual(after.tasksInterval.find(task=>task.id==='fixture-task-A'),entry.payload);assert.equal(after.deletedItems.some(row=>row.payload?.id==='fixture-task-A'),false);
  assert.equal(await first.page.locator('[data-trash-restore="'+entry.id+'"]').count(),0);assert.equal(await first.page.evaluate(()=>isRecoveryMode()),false);
  assert.ok(await first.page.evaluate(({id,archiveId})=>window.syncProcessLog.some(row=>row.sourceArea?.includes('maintenance task restore: '+id)&&row.sourceArea.includes(archiveId)),{id:entry.payload.id,archiveId:entry.id}));
  await load(first.page);assert.equal(await first.page.locator('details[data-task-id="fixture-task-A"]').count(),1);assert.equal(await first.page.locator('details[data-task-id="fixture-task-B"]').count(),1);
  if(!olderArchive){const finalViews=await reporting(first.page);assert.deepEqual(finalViews,beforeViews);}
  // Simulate the app's auth boundary without a live auth SDK. No writes while signed out.
  await first.page.evaluate(()=>{FB.user=null;FB.ready=false;renderSignedOut();});
  assert.equal((await first.page.evaluate(()=>maintenanceTaskDeletionApi.restore('missing','confirmed'))).saved,false);
  await first.page.evaluate(async()=>{await initLocalDisposableWorkspace();});assert.equal(await first.page.evaluate(()=>isRecoveryMode()),false);
  await load(second.page);assert.equal(await second.page.locator('details[data-task-id="fixture-task-A"]').count(),1);
  assert.equal(await second.page.evaluate(()=>isRecoveryMode()),false);
  assert.deepEqual(await second.page.evaluate(()=>window.__lastLoadedCloudState),after);
  assert.deepEqual(await first.page.evaluate(()=>window.__lastLoadedCloudState),after);assert.equal(commits,commitsBeforeRestore+1);
  assert.deepEqual(business(documents.get(docPath)),business(after));assert.deepEqual(first.errors,[]);assert.deepEqual(second.errors,[]);
  await first.context.close();await second.context.close();
});
