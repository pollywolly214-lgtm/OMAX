"use strict";
// Operator workflow on disposable localhost state only; every external request
// is blocked. Counts begin after deliberate fixture initialization.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
const root=path.resolve(__dirname,".."),output=path.resolve(process.env.OMAX_CJO04A_OUTPUT||path.join(root,"artifacts/cjo04a"));
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".json":"application/json"};
const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname),file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));if(!file.startsWith(root+path.sep)||pathname.split("/").some(part=>part.startsWith("."))){res.writeHead(403);res.end();return;}fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{"Content-Type":types[path.extname(file)]||"application/octet-stream","Cache-Control":"no-store"});res.end(error?"Not found":data);});});
const results=[];
async function main(){
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,".gitignore"),"*\n");
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const port=server.address().port,browser=await chromium.launch({channel:"msedge",headless:true});
  async function scenario(name,mode,run){
    const context=await browser.newContext({serviceWorkers:"block"}),page=await context.newPage(),errors=[];page.setDefaultTimeout(20000);page.on("pageerror",error=>errors.push(error.message));
    page.on("console",message=>{if(message.type()==="error"&&/chronolog|readCutLabel|resequence/i.test(message.text()))errors.push(message.text());});
    await context.route("**/*",route=>{const url=new URL(route.request().url());return url.hostname==="127.0.0.1"&&url.port===String(port)?route.continue():route.abort();});
    const capture=()=>page.evaluate(async()=>({state:await readCurrentCloudStateReadOnly(),counts:window.__cjo04Counts,live:{active:window.cuttingJobs,completed:window.completedCuttingJobs}}));
    try{
      await page.goto(`http://127.0.0.1:${port}/?devsafe=1`);await page.waitForFunction(()=>window.__initialAdoptComplete===true);
      await page.evaluate(async mode=>{
        if(!window.OMAXDevSafe.active)throw Error("Disposable backend required");location.hash="#/jobs";route();
        const job=(id,name,number,date,order)=>({id,name,cutNumber:number,cutDateISO:date,cutOrderWithinDay:order,projectNumber:"1241",cat:"fixture-project",startISO:date,dueISO:"2026-10-06",estimateHours:2,chargeRate:200,costRate:45,material:"Steel",materialCost:10,materialQty:1,priority:1,manualLogs:[],files:[],relatedCostId:"keep-"+id});
        window.cuttingJobs=[job("mon","Monday","C001","2026-10-05",1),job("thu","Thursday","C004","2026-10-08",1)];
        window.completedCuttingJobs=[job("tue","Tuesday","C002","2026-10-06",1),job("wed","Wednesday","C003","2026-10-07",1)];
        window.completedCuttingJobs.forEach(item=>{item.completedAtISO=item.cutDateISO;item.import_event_id="source-"+item.id;item.importProvenance={completed_date:"1900-01-01",sourceRowNumber:9};});
        if(mode==="same-day"){[window.cuttingJobs[0],...window.completedCuttingJobs].forEach((item,index)=>{item.cutDateISO="2026-10-05";item.cutOrderWithinDay=index+1;});}
        window.completedCuttingJobs[0].cat="other-project";window.completedCuttingJobs[0].projectNumber="1254";
        if(mode==="legacy"){for(const item of [...window.cuttingJobs,...window.completedCuttingJobs]){delete item.cutDateISO;delete item.cutOrderWithinDay;}for(let i=0;i<156;i++)window.completedCuttingJobs.push({id:"legacy-"+i,name:"Historical "+i,cat:"fixture-project",projectNumber:"1241",cutNumber:"C"+String(i+6).padStart(3,"0"),files:[],manualLogs:[]});}
        if(mode==="last-active"){window.cuttingJobs=window.cuttingJobs.filter(j=>j.id==="thu");window.cuttingJobs[0].manualLogs=[{dateISO:"2026-10-05",completedHours:1}];}
        cuttingJobs=window.cuttingJobs;completedCuttingJobs=window.completedCuttingJobs;setJobFolders([{id:"jobs_root",name:"All Jobs",parent:null,order:1},{id:"fixture-project",name:"1241 Lady Bird",parent:"jobs_root",order:2},{id:"other-project",name:"1254 Blanco",parent:"jobs_root",order:3}]);
        const saved=await saveCloudNow();if(!saved.saved)throw Error("Fixture save failed: "+JSON.stringify(saved));renderJobs();
        window.jobHistoryExpanded=true;renderJobs();window.__cjo04Before=await readCurrentCloudStateReadOnly();
        window.__cjo04Counts={ordinary:0,debounce:0,authoritative:0,transactions:0};
        const save=saveCloudNow,debounce=saveCloudDebounced,write=writeAuthoritativeStateSnapshot,transaction=window.OMAXDevSafe.db.runTransaction;
        saveCloudNow=(...args)=>{window.__cjo04Counts.ordinary++;return save(...args);};saveCloudDebounced=(...args)=>{window.__cjo04Counts.debounce++;return debounce(...args);};
        writeAuthoritativeStateSnapshot=(...args)=>{window.__cjo04Counts.authoritative++;return write(...args);};window.OMAXDevSafe.db.runTransaction=(...args)=>{window.__cjo04Counts.transactions++;return transaction(...args);};
      },mode);
      const evidence=await run({page,capture});assert.deepEqual(errors,[]);
      const final=await capture();results.push({name,passed:true,counts:evidence?.counts||final.counts,checks:evidence?.checks||["real Actions entry","date/placement input","preview/confirmation/cancel as applicable","asserted save counts and persisted state"],jobs:[...final.state.cuttingJobs,...final.state.completedCuttingJobs].map(job=>({id:job.id,label:job.cutNumber,date:job.cutDateISO,order:job.cutOrderWithinDay,auditRecords:job.cutChronologyHistory?.length||0})),pageErrors:errors});console.log("PASS "+name);
    }catch(error){console.error("SCENARIO "+name);console.error(errors);console.error(await page.evaluate(async()=>{const cloud=await readCurrentCloudStateReadOnly(),local=getCuttingJobChronologyLocalState();return{difference:window.CuttingJobImporter.firstDifferencePath(cloud,local),fields:Object.keys(cloud).filter(key=>window.CuttingJobChronology.stateKey(cloud[key])!==window.CuttingJobChronology.stateKey(local[key])).map(key=>({key,cloud:JSON.stringify(cloud[key]).slice(0,450),local:JSON.stringify(local[key])?.slice(0,450)})),pending:hasPendingLocalChanges,canWrite:canWriteCloud("fixture"),loaded:window.__loadedCloudRevisionForSaveGuard,recovery:window.__recoveryReason,counts:window.__cjo04Counts};}));throw error;}
    finally{await context.close();}
  }
  try{
    await scenario("normal create/Edit/complete/reload/earlier/later/same-day with 156 dateless jobs","legacy",async({page,capture})=>{
      assert.equal(await page.locator('[data-edit-cut-chronology]').count(),0);
      assert.doesNotMatch(await page.locator('#content').innerText(),/jobs.*require.*review|Use reviewed date|Review Chronology/i);
      await page.locator('[data-job-add-toggle]').click();await page.locator('#jobName').fill('Test category cut');await page.locator('#jobEst').fill('2');await page.locator('#jobStart').fill('2026-10-08');await page.locator('#jobDue').fill('2026-10-09');await page.locator('#jobCategory').selectOption('fixture-project');await page.locator('#addJobForm button[type="submit"]').click();
      await page.waitForFunction(()=>window.cuttingJobs.some(job=>job.name==='Test category cut')&&!isCuttingJobChronologySaving());
      const id=await page.evaluate(()=>window.cuttingJobs.find(job=>job.name==='Test category cut').id);
      await normalEdit(page,id,false);assert.equal(await page.locator(`[data-j="startISO"][data-id="${id}"]`).inputValue(),'2026-10-08');await page.locator(`[data-j="startISO"][data-id="${id}"]`).fill('2026-10-04');
      await page.screenshot({path:path.join(output,'active-normal-edit.png')});await saveEdit(page,id,false);
      let saved=await capture();assert.equal(saved.state.cuttingJobs.find(job=>job.id===id).cutNumber,'C001');assert.equal(saved.counts.authoritative,2);assert.equal(saved.counts.transactions,2);
      await page.locator(`[data-job-actions-toggle="${id}"]`).click();await page.locator(`[data-complete-job="${id}"]`).click();await page.waitForFunction(id=>window.completedCuttingJobs.some(job=>job.id===id)&&!isCuttingJobChronologySaving(),id);
      saved=await capture();assert.equal(saved.counts.authoritative,3);assert.equal(saved.counts.transactions,3);assert.equal(saved.counts.ordinary,0);assert.equal(saved.counts.debounce,0);const completion=saved.state.completedCuttingJobs.find(job=>job.id===id).completedAtISO;assert.ok(completion);
      await page.reload();await page.waitForFunction(()=>window.__initialAdoptComplete===true);await page.evaluate(()=>{location.hash='#/jobs';window.jobHistoryExpanded=true;route();});
      await armCounts(page);assert.equal(await page.evaluate(id=>window.cuttingJobs.some(job=>job.id===id),id),false);assert.equal(await page.evaluate(id=>window.completedCuttingJobs.find(job=>job.id===id).completedAtISO,id),completion);
      await normalEdit(page,id,true);assert.equal(await page.locator(`[data-history-field="completedAtISO"][data-history-id="${id}"]`).inputValue(),completion.slice(0,10));assert.equal(await page.locator(`[data-history-field="startISO"][data-history-id="${id}"]`).inputValue(),'2026-10-04');
      await page.locator(`[data-history-field="completedAtISO"][data-history-id="${id}"]`).fill('2026-10-04');await page.screenshot({path:path.join(output,'completed-normal-edit.png')});await saveEdit(page,id,true);
      let earlier=await capture();assert.equal(earlier.state.completedCuttingJobs.find(job=>job.id===id).cutNumber,'C001');assert.equal(await categoryNumber(page,id),1);const earlierRows=await historyIds(page);assert.ok(earlierRows.indexOf(id)>earlierRows.indexOf('wed'));
      await normalEdit(page,id,true);await page.locator(`[data-history-field="completedAtISO"][data-history-id="${id}"]`).fill('2026-10-09');await saveEdit(page,id,true);
      let later=await capture();assert.equal(later.state.completedCuttingJobs.find(job=>job.id===id).cutNumber,'C005');assert.equal(await categoryNumber(page,id),4);assert.equal((await historyIds(page))[0],id);
      await normalEdit(page,id,true);await page.locator(`[data-history-field="completedAtISO"][data-history-id="${id}"]`).fill('2026-10-07');await saveEdit(page,id,true);const sameDayOrder=await page.evaluate(()=>CuttingJobDateEditing.orderedJobs(cuttingJobs,completedCuttingJobs).filter(e=>e.date==='2026-10-07').map(e=>e.job.id));assert.deepEqual(sameDayOrder,['wed',id]);
      const remainingCounts=(await capture()).counts;assert.deepEqual(remainingCounts,{ordinary:0,debounce:0,authoritative:3,transactions:3});await page.reload();await page.waitForFunction(()=>window.__initialAdoptComplete===true);assert.deepEqual(await page.evaluate(()=>CuttingJobDateEditing.orderedJobs(cuttingJobs,completedCuttingJobs).filter(e=>e.date==='2026-10-07').map(e=>e.job.id)),sameDayOrder);
      assert.equal(await page.locator('[data-edit-cut-chronology]').count(),0);const final=await capture();assert.equal(final.state.completedCuttingJobs.filter(job=>job.id.startsWith('legacy-')).length,156);assert.ok(final.state.completedCuttingJobs.filter(job=>job.id.startsWith('legacy-')).every(job=>!Object.hasOwn(job,'completedAtISO')&&!Object.hasOwn(job,'cutDateISO')));
      return{counts:{authoritative:6,transactions:6,ordinary:0,debounce:0},checks:['real Add Job in Lady Bird','normal Edit Start Date','verified Mark Complete','completion survives cold reload','normal Edit Completion Date earlier/later','global and category number changes','History automatic movement','same-day order survives reload','no separate action or legacy review requirement']};
    });
    await scenario('cancel active and completed normal Edit writes nothing','canonical',async({page,capture})=>{
      const before=await capture();await normalEdit(page,'thu',false);await page.locator('[data-j="startISO"][data-id="thu"]').fill('2026-09-30');await page.locator('[data-cancel-job="thu"]').click();await normalEdit(page,'wed',true);await page.locator('[data-history-field="completedAtISO"][data-history-id="wed"]').fill('2026-09-30');await page.locator('[data-history-cancel="wed"]').click();const after=await capture();assert.deepEqual(after.state,before.state);assert.equal(after.counts.authoritative,0);assert.equal(after.counts.transactions,0);
    });
    await scenario('last active completion retains protected data and survives refresh','last-active',async({page,capture})=>{
      await page.locator('[data-job-actions-toggle="thu"]').click();await page.locator('[data-complete-job="thu"]').click();await page.waitForFunction(()=>window.cuttingJobs.length===0&&!isCuttingJobChronologySaving());const saved=await capture();assert.equal(saved.counts.authoritative,1);assert.equal(saved.counts.transactions,1);assert.deepEqual(saved.state.completedCuttingJobs.find(j=>j.id==='thu').manualLogs,[{dateISO:'2026-10-05',completedHours:1}]);await page.reload();await page.waitForFunction(()=>window.__initialAdoptComplete===true);assert.equal(await page.evaluate(()=>window.cuttingJobs.length),0);assert.equal(await page.evaluate(()=>window.completedCuttingJobs.some(j=>j.id==='thu')),true);
    });
    for(const operation of ['edit','complete'])await scenario('definite rejection of '+operation+' has no false success or live mutation','canonical',async({page,capture})=>{
      const before=await capture();await page.evaluate(()=>{writeAuthoritativeStateSnapshot=async()=>{window.__cjo04Counts.authoritative++;return{saved:false,blocked:true,definiteFailure:true,stateWriteAttempted:false,stateWriteCompleted:false,error:'Fixture rejection'};};});
      if(operation==='edit'){await normalEdit(page,'thu',false);await page.locator('[data-j="startISO"][data-id="thu"]').fill('2026-09-30');await page.locator('[data-save-job="thu"]').click();}else{await page.locator('[data-job-actions-toggle="thu"]').click();await page.locator('[data-complete-job="thu"]').click();}
      await page.waitForFunction(()=>!isCuttingJobChronologySaving()&&window.__cjo04Counts.authoritative===1);assert.match(await page.locator('.toast').last().innerText(),/Fixture rejection/);const after=await capture();assert.deepEqual(after.state,before.state);assert.deepEqual(after.live,before.live);assert.equal(after.counts.transactions,0);
    });
    await scenario('lost completion acknowledgement suspends without misleading completed UI','canonical',async({page,capture})=>{
      const before=await capture();await page.evaluate(()=>{const write=writeAuthoritativeStateSnapshot;writeAuthoritativeStateSnapshot=async(...args)=>{await write(...args);throw Error('Fixture acknowledgement lost');};});await page.locator('[data-job-actions-toggle="thu"]').click();await page.locator('[data-complete-job="thu"]').click();await page.waitForFunction(()=>window.__lastIndeterminateSave);const after=await capture();assert.equal(after.counts.authoritative,1);assert.equal(after.counts.transactions,1);assert.deepEqual(after.live,before.live);assert.ok(after.state.completedCuttingJobs.some(j=>j.id==='thu'));assert.equal(await page.evaluate(()=>window.__autosaveDisabled&&window.__recoveryInspectMode),true);assert.doesNotMatch(await page.locator('.toast').last().innerText(),/Job marked complete/);
    });
  }finally{await browser.close();server.close();}
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:results.length,failed:0,results},null,2));
}
async function normalEdit(page,id,completed){await page.locator((completed?'[data-history-actions-toggle="':'[data-job-actions-toggle="')+id+'"]').click();await page.locator((completed?'[data-history-edit="':'[data-edit-job="')+id+'"]').click();}
async function saveEdit(page,id,completed){await page.locator((completed?'[data-history-save="':'[data-save-job="')+id+'"]').click();await page.waitForFunction(({id,completed})=>!isCuttingJobChronologySaving()&&!document.querySelector((completed?'[data-history-save="':'[data-save-job="')+id+'"]'),{id,completed});}
async function armCounts(page){await page.evaluate(()=>{
  window.__cjo04Counts={ordinary:0,debounce:0,authoritative:0,transactions:0};
  const save=saveCloudNow,debounce=saveCloudDebounced,write=writeAuthoritativeStateSnapshot,transaction=window.OMAXDevSafe.db.runTransaction;
  saveCloudNow=(...args)=>{window.__cjo04Counts.ordinary++;return save(...args);};saveCloudDebounced=(...args)=>{window.__cjo04Counts.debounce++;return debounce(...args);};
  writeAuthoritativeStateSnapshot=(...args)=>{window.__cjo04Counts.authoritative++;return write(...args);};window.OMAXDevSafe.db.runTransaction=(...args)=>{window.__cjo04Counts.transactions++;return transaction(...args);};
});}
const historyIds=page=>page.locator('[data-history-row]').evaluateAll(rows=>rows.map(row=>row.dataset.historyRow));
const categoryNumber=(page,id)=>page.evaluate(id=>CuttingJobDateEditing.categoryNumbers(cuttingJobs,completedCuttingJobs).get(id),id);
main().catch(error=>{server.close();console.error(error);process.exitCode=1;});
