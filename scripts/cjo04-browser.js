"use strict";
// Operator workflow on disposable localhost state only; every external request
// is blocked. Counts begin after deliberate fixture initialization.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
const root=path.resolve(__dirname,".."),output=path.resolve(process.env.OMAX_CJO04_OUTPUT||path.join(root,"artifacts/cjo04"));
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
    const dialog=()=>page.locator("[data-cjo-dialog]");
    async function open(id,completed=false){await page.locator((completed?'[data-history-actions-toggle="':'[data-job-actions-toggle="')+id+'"]').click();await page.locator('[data-edit-cut-chronology="'+id+'"]').click();await dialog().waitFor({state:"visible"});}
    async function preview(id,date,placement){await dialog().locator("[data-cjo-job]").selectOption(id);await dialog().locator("[data-cjo-date]").fill(date);if(placement)await dialog().locator("[data-cjo-placement]").selectOption(placement);await dialog().locator("[data-cjo-preview-button]").click();}
    async function confirm(){await dialog().locator("[data-cjo-confirm]").click();await page.waitForFunction(()=>Boolean(document.querySelector("[data-cjo-dialog]")?.dataset.cjoResult));return JSON.parse(await dialog().getAttribute("data-cjo-result"));}
    const capture=()=>page.evaluate(async()=>({state:await readCurrentCloudStateReadOnly(),counts:window.__cjo04Counts,live:{active:window.cuttingJobs,completed:window.completedCuttingJobs}}));
    try{
      await page.goto(`http://127.0.0.1:${port}/?devsafe=1`);await page.waitForFunction(()=>window.__initialAdoptComplete===true);
      await page.evaluate(async mode=>{
        if(!window.OMAXDevSafe.active)throw Error("Disposable backend required");location.hash="#/jobs";route();
        const job=(id,name,number,date,order)=>({id,name,cutNumber:number,cutDateISO:date,cutOrderWithinDay:order,projectNumber:"0000",cat:"fixture-project",startISO:"2026-10-05",dueISO:"2026-10-06",estimateHours:2,chargeRate:200,costRate:45,material:"Steel",materialCost:10,materialQty:1,priority:1,manualLogs:[],files:[],relatedCostId:"keep-"+id});
        window.cuttingJobs=[job("mon","Monday","C001","2026-10-05",1),job("thu","Thursday","C004","2026-10-08",1)];
        window.completedCuttingJobs=[job("tue","Tuesday","C002","2026-10-06",1),job("wed","Wednesday","C003","2026-10-07",1)];
        window.completedCuttingJobs.forEach(item=>{item.completedAtISO="2026-10-12T12:00:00Z";item.import_event_id="source-"+item.id;item.importProvenance={completed_date:"1900-01-01",sourceRowNumber:9};});
        if(mode==="same-day"){[window.cuttingJobs[0],...window.completedCuttingJobs].forEach((item,index)=>{item.cutDateISO="2026-10-05";item.cutOrderWithinDay=index+1;});}
        if(mode==="legacy"){for(const item of [...window.cuttingJobs,...window.completedCuttingJobs]){delete item.cutDateISO;delete item.cutOrderWithinDay;}}
        cuttingJobs=window.cuttingJobs;completedCuttingJobs=window.completedCuttingJobs;setJobFolders([{id:"jobs_root",name:"All Jobs",parent:null,order:1},{id:"fixture-project",name:"0000 Company Improvements",parent:"jobs_root",order:2}]);
        const saved=await saveCloudNow();if(!saved.saved)throw Error("Fixture save failed: "+JSON.stringify(saved));renderJobs();
        window.jobHistoryExpanded=true;renderJobs();window.__cjo04Before=await readCurrentCloudStateReadOnly();
        window.__cjo04Counts={ordinary:0,debounce:0,authoritative:0,transactions:0};
        const save=saveCloudNow,debounce=saveCloudDebounced,write=writeAuthoritativeStateSnapshot,transaction=window.OMAXDevSafe.db.runTransaction;
        saveCloudNow=(...args)=>{window.__cjo04Counts.ordinary++;return save(...args);};saveCloudDebounced=(...args)=>{window.__cjo04Counts.debounce++;return debounce(...args);};
        writeAuthoritativeStateSnapshot=(...args)=>{window.__cjo04Counts.authoritative++;return write(...args);};window.OMAXDevSafe.db.runTransaction=(...args)=>{window.__cjo04Counts.transactions++;return transaction(...args);};
      },mode);
      const evidence=await run({page,dialog,open,preview,confirm,capture});assert.deepEqual(errors,[]);
      const final=await capture();results.push({name,passed:true,counts:evidence?.counts||final.counts,checks:evidence?.checks||["real Actions entry","date/placement input","preview/confirmation/cancel as applicable","asserted save counts and persisted state"],jobs:[...final.state.cuttingJobs,...final.state.completedCuttingJobs].map(job=>({id:job.id,label:job.cutNumber,date:job.cutDateISO,order:job.cutOrderWithinDay,auditRecords:job.cutChronologyHistory?.length||0})),pageErrors:errors});console.log("PASS "+name);
    }catch(error){console.error("SCENARIO "+name);console.error(errors);console.error(await page.evaluate(async()=>{const cloud=await readCurrentCloudStateReadOnly(),local=getCuttingJobChronologyLocalState();return{difference:window.CuttingJobImporter.firstDifferencePath(cloud,local),fields:Object.keys(cloud).filter(key=>window.CuttingJobChronology.stateKey(cloud[key])!==window.CuttingJobChronology.stateKey(local[key])).map(key=>({key,cloud:JSON.stringify(cloud[key]).slice(0,450),local:JSON.stringify(local[key])?.slice(0,450)})),pending:hasPendingLocalChanges,canWrite:canWriteCloud("fixture"),loaded:window.__loadedCloudRevisionForSaveGuard,recovery:window.__recoveryReason,counts:window.__cjo04Counts};}));throw error;}
    finally{await context.close();}
  }
  try{
    await scenario("canonical active correction, navigation and reload","canonical",async({page,dialog,open,preview,confirm,capture})=>{
      await open("thu");await preview("thu","2026-10-07",JSON.stringify({type:"before",id:"wed"}));assert.match(await dialog().locator("[data-cjo-preview]").innerText(),/C004 → C003/);
      await page.screenshot({path:path.join(output,"canonical-preview.png")});
      assert.equal((await capture()).counts.authoritative,0);const result=await confirm();assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);
      assert.match(await dialog().locator("[data-cjo-status]").innerText(),/Chronology updated/);await dialog().locator("[data-cjo-cancel]").click();
      const saved=await capture();assert.deepEqual(saved.counts,{ordinary:0,debounce:0,authoritative:1,transactions:1});assert.equal(saved.state.cuttingJobs.find(job=>job.id==="thu").cutNumber,"C003");assert.equal(saved.state.completedCuttingJobs.find(job=>job.id==="wed").cutNumber,"C004");
      assert.equal(saved.state.cuttingJobs.find(job=>job.id==="thu").cutChronologyHistory[0].kind,"correction");
      await page.locator("[data-job-flow-open]").click();assert.ok((await page.locator("#jobFlowChart").innerText()).includes("Wednesday · C004"));await page.locator("button[data-job-flow-close]").click();
      await page.evaluate(()=>{location.hash="#/";route();});await page.locator("#dashboardGlobalSearch").fill("Wednesday");assert.ok((await page.locator("#dashboardGlobalSearchSuggestions").innerText()).includes("Wednesday · C004"));
      await page.evaluate(()=>{location.hash="#/costs";route();});await page.locator("[data-open-data-center]").click();await page.locator('[data-dc-tab="cutting"]').click();assert.equal(await page.locator('[data-cutting-row][data-job-id="wed"]').locator("td").nth(1).innerText(),"C004");await page.locator("button[data-close-data-center]").click();
      await page.evaluate(()=>{location.hash="#/jobs";route();});assert.ok((await page.locator("#content").innerText()).includes("Thursday · C003"));assert.deepEqual((await capture()).counts,saved.counts);
      await page.reload();await page.waitForFunction(()=>window.__initialAdoptComplete===true);await page.evaluate(()=>{location.hash="#/jobs";route();});assert.ok((await page.locator("#content").innerText()).includes("Thursday · C003"));
      assert.equal(await page.evaluate(()=>window.cuttingJobs.find(job=>job.id==="thu").cutChronologyHistory[0].after.cutNumber),"C003");
      return{counts:saved.counts,checks:["active action","preview without save","one atomic confirm","Jobs/history/flow/dashboard/Data Center labels","navigation without another write","cold reload with audit"]};
    });
    for(const [placement,order] of [["first",["thu","mon","tue","wed"]],[JSON.stringify({type:"after",id:"tue"}),["mon","tue","thu","wed"]],["last",["mon","tue","wed","thu"]]])await scenario("same-day "+placement,"same-day",async({page,open,preview,confirm,capture})=>{
      await open("thu");await preview("thu","2026-10-05",placement);assert.equal((await confirm()).saved,true);const saved=await capture();const actual=await page.evaluate(()=>window.CuttingJobChronology.readChronology(window.cuttingJobs,window.completedCuttingJobs).entries.map(item=>item.id));assert.deepEqual(actual,order);assert.equal(saved.counts.authoritative,1);assert.equal(saved.counts.transactions,1);
    });
    await scenario("completed job correction and cancel","canonical",async({open,preview,dialog,capture})=>{
      const before=await capture();await open("tue",true);await preview("tue","2026-10-09");assert.match(await dialog().locator("[data-cjo-preview]").innerText(),/Tuesday/);await dialog().locator("[data-cjo-cancel]").click();const after=await capture();assert.deepEqual(after.state,before.state);assert.equal(after.counts.authoritative,0);
    });
    await scenario("legacy incomplete review, explicit batch initialization","legacy",async({open,dialog,page,confirm,capture})=>{
      await open("thu");assert.equal(await dialog().locator("[data-cjo-date]").inputValue(),"");await dialog().locator("[data-cjo-preview-button]").click();assert.match(await dialog().locator("[data-cjo-status]").innerText(),/4 cutting jobs still require/);assert.equal((await capture()).counts.authoritative,0);
      await page.screenshot({path:path.join(output,"legacy-review.png")});
      for(const [id,date] of [["mon","2026-10-05"],["tue","2026-10-06"],["wed","2026-10-07"],["thu","2026-10-08"]]){await dialog().locator("[data-cjo-job]").selectOption(id);assert.equal(await dialog().locator("[data-cjo-date]").inputValue(),"");await dialog().locator("[data-cjo-date]").fill(date);await dialog().locator("[data-cjo-apply]").click();}
      assert.equal((await capture()).counts.authoritative,0);await dialog().locator("[data-cjo-preview-button]").click();assert.equal((await confirm()).saved,true);const saved=await capture();assert.equal(saved.counts.authoritative,1);assert.equal(saved.counts.transactions,1);
      assert.equal(await page.evaluate(()=>window.CuttingJobChronology.chronologyReadiness(window.cuttingJobs,window.completedCuttingJobs).status),"CANONICAL_READY");for(const job of [...saved.state.cuttingJobs,...saved.state.completedCuttingJobs])assert.equal(job.cutChronologyHistory[0].kind,"operator_review_initialization");
    });
    await scenario("cancel prepared legacy review without partial fields","legacy",async({open,dialog,capture})=>{
      const before=await capture();await open("thu");await dialog().locator("[data-cjo-date]").fill("2026-10-08");await dialog().locator("[data-cjo-apply]").click();assert.match(await dialog().locator("[data-cjo-progress]").innerText(),/3 jobs still require/);await dialog().locator("[data-cjo-cancel]").click();const after=await capture();assert.deepEqual(after.state,before.state);assert.equal(after.counts.authoritative,0);
    });
    await scenario("input change invalidates an already rendered preview","canonical",async({open,preview,dialog,capture})=>{
      const before=await capture();await open("thu");await preview("thu","2026-10-09");assert.equal(await dialog().locator("[data-cjo-confirm]").isEnabled(),true);await dialog().locator("[data-cjo-date]").fill("2026-10-10");assert.equal(await dialog().locator("[data-cjo-confirm]").isEnabled(),false);await dialog().locator("[data-cjo-cancel]").click();const after=await capture();assert.deepEqual(after.state,before.state);assert.equal(after.counts.authoritative,0);
    });
    await scenario("server revision changes after preview","canonical",async({page,open,preview,confirm,capture,dialog})=>{
      await open("thu");await preview("thu","2026-10-09");await page.evaluate(async()=>{const state=await readCurrentCloudStateReadOnly();state.syncMeta.rev++;await FB.docRef.set(state);});const result=await confirm();assert.notEqual(result.saved,true);assert.match(await dialog().locator("[data-cjo-status]").innerText(),/not saved/);assert.equal((await capture()).counts.authoritative,0);
    });
    await scenario("definite rejection does not report success","canonical",async({page,open,preview,confirm,dialog,capture})=>{
      const before=await capture();await open("thu");await preview("thu","2026-10-09");await page.evaluate(()=>{writeAuthoritativeStateSnapshot=async()=>{window.__cjo04Counts.authoritative++;return{saved:false,blocked:true,definiteFailure:true,stateWriteAttempted:false,stateWriteCompleted:false,error:"Fixture rejection"};};});const result=await confirm();assert.equal(result.saved,false);assert.match(await dialog().locator("[data-cjo-status]").innerText(),/not saved/);const after=await capture();assert.deepEqual(after.state,before.state);assert.equal(after.counts.transactions,0);
    });
    await scenario("lost acknowledgement enters recovery without retry","canonical",async({page,open,preview,confirm,dialog,capture})=>{
      const before=await capture();await open("thu");await preview("thu","2026-10-09");await page.evaluate(()=>{const write=writeAuthoritativeStateSnapshot;writeAuthoritativeStateSnapshot=async(...args)=>{await write(...args);throw Error("Fixture acknowledgement lost");};});
      const result=await confirm();assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.match(await dialog().locator("[data-cjo-status]").innerText(),/Do not retry/);
      const after=await capture();assert.equal(after.counts.authoritative,1);assert.equal(after.counts.transactions,1);assert.equal(after.state.cuttingJobs.find(job=>job.id==="thu").cutDateISO,"2026-10-09");assert.equal(after.live.active.find(job=>job.id==="thu").cutDateISO,before.live.active.find(job=>job.id==="thu").cutDateISO);assert.equal(await page.evaluate(()=>window.__autosaveDisabled&&window.__recoveryInspectMode),true);
    });
  }finally{await browser.close();server.close();}
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,".gitignore"),"*\n");fs.writeFileSync(path.join(output,"result.json"),JSON.stringify({passed:results.length,failed:0,results},null,2));
}
main().catch(error=>{server.close();console.error(error);process.exitCode=1;});
