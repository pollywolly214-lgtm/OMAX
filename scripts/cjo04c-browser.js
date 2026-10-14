"use strict";
// Operator workflow on disposable localhost state only; every external request
// is blocked. Counts begin after deliberate fixture initialization.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
const root=path.resolve(__dirname,".."),output=path.resolve(process.env.OMAX_CJO04C_OUTPUT||path.join(root,"artifacts/cjo04c"));
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".json":"application/json"};
const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname),file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));if(!file.startsWith(root+path.sep)||pathname.split("/").some(part=>part.startsWith("."))){res.writeHead(403);res.end();return;}fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{"Content-Type":types[path.extname(file)]||"application/octet-stream","Cache-Control":"no-store"});res.end(error?"Not found":data);});});
const results=[];
async function main(){
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,".gitignore"),"*\n");
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const port=server.address().port,browser=await chromium.launch({channel:"msedge",headless:true});
  async function scenario(name,mode,run){
    const context=await browser.newContext({serviceWorkers:"block",timezoneId:"America/Chicago"}),page=await context.newPage(),errors=[];page.setDefaultTimeout(20000);page.on("pageerror",error=>errors.push(error.message));
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
        const reported=window.completedCuttingJobs.find(job=>job.id==="wed");Object.assign(reported,{name:"Testing category cut file.",startISO:"2026-10-04",dueISO:"2026-10-06",completedAtISO:"2026-10-06",cutDateISO:"2026-10-06",files:[{id:'fixture_file',fileId:"reference-file",relativePath:"WJ Cuts/fixture.dxf",source:"wj_cuts_reference"}],manualLogs:[{dateISO:"2026-10-04",completedHours:1}]});
        if(mode==="same-day"){[window.cuttingJobs[0],...window.completedCuttingJobs].forEach((item,index)=>{item.cutDateISO="2026-10-05";item.cutOrderWithinDay=index+1;});}
        window.completedCuttingJobs[0].cat="other-project";window.completedCuttingJobs[0].projectNumber="1254";
        if(mode==="legacy"){for(const item of [...window.cuttingJobs,...window.completedCuttingJobs]){delete item.cutDateISO;delete item.cutOrderWithinDay;}for(let i=0;i<156;i++)window.completedCuttingJobs.push({id:"legacy-"+i,name:"Historical "+i,cat:"fixture-project",projectNumber:"1241",cutNumber:"C"+String(i+6).padStart(3,"0"),files:[],manualLogs:[]});}
        if(mode==="last-active"){window.cuttingJobs=window.cuttingJobs.filter(j=>j.id==="thu");window.cuttingJobs[0].manualLogs=[{dateISO:"2026-10-05",completedHours:1}];}
        cuttingJobs=window.cuttingJobs;completedCuttingJobs=window.completedCuttingJobs;setJobFolders([{id:"jobs_root",name:"All Jobs",parent:null,order:1},{id:"fixture-project",name:"1241 Lady Bird",parent:"jobs_root",order:2},{id:"other-project",name:"1254 Blanco",parent:"jobs_root",order:3}]);
        const saved=await saveCloudNow();if(!saved.saved)throw Error("Fixture save failed: "+JSON.stringify(saved));renderJobs();
        window.jobHistoryExpanded=true;renderJobs();window.__cjo04Before=await readCurrentCloudStateReadOnly();
      },mode);
      await armCounts(page,mode);
      const evidence=await run({page,capture});assert.deepEqual(errors,[]);
      const final=await capture();results.push({name,passed:true,counts:evidence?.counts||final.counts,diagnostics:evidence?.diagnostics,checks:evidence?.checks||["real Actions entry","date/placement input","preview/confirmation/cancel as applicable","asserted save counts and persisted state"],jobs:[...final.state.cuttingJobs,...final.state.completedCuttingJobs].map(job=>({id:job.id,label:job.cutNumber,date:job.cutDateISO,order:job.cutOrderWithinDay,auditRecords:job.cutChronologyHistory?.length||0})),pageErrors:errors});console.log("PASS "+name);
    }catch(error){console.error("SCENARIO "+name);console.error(errors);console.error(await page.evaluate(async()=>{const cloud=await readCurrentCloudStateReadOnly(),local=getCuttingJobChronologyLocalState();return{toasts:Array.from(document.querySelectorAll(".toast")).map(node=>node.textContent),active:window.cuttingJobs.map(job=>({id:job.id,name:job.name})),createForm:document.querySelector("#addJobForm")?.checkValidity(),difference:window.CuttingJobImporter.firstDifferencePath(cloud,local),fields:Object.keys(cloud).filter(key=>window.CuttingJobChronology.stateKey(cloud[key])!==window.CuttingJobChronology.stateKey(local[key])).map(key=>({key,cloud:JSON.stringify(cloud[key]).slice(0,450),local:JSON.stringify(local[key])?.slice(0,450)})),pending:hasPendingLocalChanges,canWrite:canWriteCloud("fixture"),loaded:window.__loadedCloudRevisionForSaveGuard,recovery:window.__recoveryReason,counts:window.__cjo04Counts};}));throw error;}
    finally{await context.close();}
  }
  try{
    for(const mode of ['stale-once','stale-always','newer','different','cache'])await scenario('reported completed date correction: '+mode,mode,async({page,capture})=>{
      const before=await capture();assert.match(await page.locator('[data-history-row="wed"] .job-main-dates').innerText(),/Oct 04.*Oct 06/);
      await page.evaluate(mode=>{
        const ref=FB.docRef,get=ref.get.bind(ref),prior=structuredClone(window.__lastLoadedCloudState);let readIndex=0;
        window.__cjo04cIndependentRead=()=>get({source:'server'});
        ref.get=async options=>{
          const snapshot=await get(options);
          if(options?.source!=='server'||!window.__cjo04Counts.transactions)return snapshot;
          readIndex++;let data=snapshot.data(),metadata={...snapshot.metadata};
          if(mode==='stale-always'||(mode==='stale-once'&&readIndex===1))data=structuredClone(prior);
          if(mode==='newer')data.syncMeta.rev++;
          if(mode==='different')data.completedCuttingJobs.find(j=>j.id==='wed').files=[];
          if(mode==='cache')metadata.fromCache=true;
          return {...snapshot,data:()=>data,metadata};
        };
        const edit=saveCuttingJobEdit;saveCuttingJobEdit=async(...args)=>{const result=await edit(...args);window.__cjo04cOutcome=result;return result;};
      },mode);
      await normalEdit(page,'wed',true);await page.locator('[data-history-field="startISO"][data-history-id="wed"]').fill('2026-10-01');await page.locator('[data-history-field="completedAtISO"][data-history-id="wed"]').fill('2026-10-02');await page.locator('[data-history-save="wed"]').click();
      await page.waitForFunction(()=>window.__cjo04cOutcome&&!isCuttingJobChronologySaving());const result=await page.evaluate(()=>window.__cjo04cOutcome),counts=await page.evaluate(()=>window.__cjo04Counts);
      assert.deepEqual(counts,{ordinary:0,debounce:0,authoritative:1,transactions:1});
      const independent=await page.evaluate(async()=>{const snap=await window.__cjo04cIndependentRead();const state=snap.data(),job=state.completedCuttingJobs.find(j=>j.id==='wed');return{revision:state.syncMeta.rev,fromCache:snap.metadata.fromCache,startISO:job.startISO,completedAtISO:job.completedAtISO,audit:job.cutChronologyHistory?.length,files:job.files,manualLogs:job.manualLogs};});
      assert.equal(independent.revision,result.committedRevision);assert.equal(independent.fromCache,false);assert.equal(independent.startISO,'2026-10-01');assert.equal(independent.completedAtISO,'2026-10-02');assert.equal(independent.audit,1);assert.deepEqual(independent.files,before.state.completedCuttingJobs.find(j=>j.id==='wed').files);assert.deepEqual(independent.manualLogs,before.state.completedCuttingJobs.find(j=>j.id==='wed').manualLogs);
      if(mode==='stale-once'){
        assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);assert.equal(result.indeterminate,false);assert.notEqual(result.requiresReload,true);assert.equal(result.verificationReadAttempts,2);assert.equal(result.verificationReadHistory[0].revision,before.state.syncMeta.rev);assert.equal(result.verificationReadHistory[1].revision,result.committedRevision);assert.ok(result.verificationReadHistory.every(read=>read.serverProof&&read.documentMatches));assert.equal(result.verificationBackend,'disposable');
        assert.equal(await page.evaluate(()=>window.__recoveryInspectMode||window.__autosaveDisabled),false);assert.equal(await page.evaluate(()=>window.__loadedCloudRevisionForSaveGuard),independent.revision);
        const dates=await page.locator('[data-history-row="wed"] .job-main-dates').innerText();assert.match(dates,/Oct 01.*Oct 02/);assert.doesNotMatch(dates,/Oct 06/);assert.deepEqual(await page.locator('[data-cutting-job-verification-notice]').evaluateAll(nodes=>nodes.map(node=>node.hidden)),[true,true]);await page.screenshot({path:path.join(output,'verified-history-dates.png')});
        await page.reload();await page.waitForFunction(()=>window.__initialAdoptComplete===true);await page.evaluate(()=>{location.hash='#/jobs';window.jobHistoryExpanded=true;route();});assert.match(await page.locator('[data-history-row="wed"] .job-main-dates').innerText(),/Oct 01.*Oct 02/);assert.equal(await page.evaluate(()=>window.__recoveryInspectMode),false);
        await normalEdit(page,'wed',true);assert.equal(await page.locator('[data-history-field="startISO"][data-history-id="wed"]').inputValue(),'2026-10-01');assert.equal(await page.locator('[data-history-field="completedAtISO"][data-history-id="wed"]').inputValue(),'2026-10-02');
      }else{
        assert.equal(result.verified,false);assert.equal(result.indeterminate,true);assert.equal(result.requiresReload,true);assert.equal(result.verificationReadAttempts,mode==='stale-always'?3:1);assert.equal(await page.evaluate(()=>window.__recoveryInspectMode&&window.__autosaveDisabled),true);
        assert.equal(await page.evaluate(()=>window.completedCuttingJobs.find(j=>j.id==='wed').startISO),'2026-10-04');assert.equal(await page.evaluate(()=>window.completedCuttingJobs.find(j=>j.id==='wed').completedAtISO),'2026-10-06');assert.deepEqual(await page.locator('[data-cutting-job-verification-notice]').evaluateAll(nodes=>nodes.map(node=>node.hidden)),[false,false]);
        await page.locator('[data-history-cancel="wed"]').click();assert.match(await page.locator('[data-history-row="wed"] .job-main-dates').innerText(),/Oct 04.*Oct 06/);assert.equal(await page.evaluate(()=>window.__recoveryInspectMode),true);assert.match(await page.locator('[data-cutting-job-verification-notice]').first().innerText(),/Unverified.*previously loaded.*not.*confirmed/);if(mode==='stale-always')await page.screenshot({path:path.join(output,'unverified-history-dates.png')});
        assert.equal((await page.evaluate(()=>window.__cjo04Counts)).transactions,1);
      }
      return{counts,checks:['real normal History Edit, both dates','one guarded write/one audit, no mutation replay','same pinned document and backend','independent server read confirms committed dates','bounded read-only verification','strict failure or correct adoption and UI/reload'],diagnostics:{committedRevision:result.committedRevision,readbackRevision:result.readbackRevision,attempts:result.verificationReadAttempts,reads:result.verificationReadHistory,verified:result.verified,requiresReload:result.requiresReload||false,mismatchPaths:result.verificationMismatchPaths}};
    });
  }finally{await browser.close();server.close();}
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:results.length,failed:0,results},null,2));
}
async function normalEdit(page,id,completed){await page.locator((completed?'[data-history-actions-toggle="':'[data-job-actions-toggle="')+id+'"]').click();await page.locator((completed?'[data-history-edit="':'[data-edit-job="')+id+'"]').click();}
async function armCounts(page){await page.evaluate(()=>{
  window.__cjo04Counts={ordinary:0,debounce:0,authoritative:0,transactions:0};
  const save=saveCloudNow,debounce=saveCloudDebounced,write=writeAuthoritativeStateSnapshot,transaction=window.OMAXDevSafe.db.runTransaction;
  saveCloudNow=(...args)=>{window.__cjo04Counts.ordinary++;return save(...args);};saveCloudDebounced=(...args)=>{window.__cjo04Counts.debounce++;return debounce(...args);};writeAuthoritativeStateSnapshot=(...args)=>{window.__cjo04Counts.authoritative++;return write(...args);};window.OMAXDevSafe.db.runTransaction=(...args)=>{window.__cjo04Counts.transactions++;return transaction(...args);};
});}
main().catch(error=>{server.close();console.error(error);process.exitCode=1;});
