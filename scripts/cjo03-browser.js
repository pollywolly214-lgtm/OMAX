"use strict";
// Real production views on a fresh localhost devsafe backend. No external
// requests, production credentials, chronology edits, or lifecycle mutations.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
const root=path.resolve(__dirname,".."),output=path.resolve(process.env.OMAX_CJO03_OUTPUT||path.join(root,"artifacts/cjo03"));
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".json":"application/json"};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname),file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
  if(!file.startsWith(root+path.sep)||pathname.split("/").some(part=>part.startsWith("."))){res.writeHead(403);res.end();return;}
  fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{"Content-Type":types[path.extname(file)]||"application/octet-stream","Cache-Control":"no-store"});res.end(error?"Not found":data);});
});
const results=[];
async function main(){
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port,browser=await chromium.launch({channel:"msedge",headless:true});
  try{
    for(const mode of ["legacy","canonical","mixed"]){
      const context=await browser.newContext({serviceWorkers:"block"}),page=await context.newPage(),errors=[];
      page.on("pageerror",error=>errors.push(error.message));page.on("console",message=>{if(message.type()==="error"&&/chronolog|readCutLabel|resequence/i.test(message.text()))errors.push(message.text());});page.setDefaultTimeout(20000);
      await context.route("**/*",route=>{const url=new URL(route.request().url());return url.hostname==="127.0.0.1"&&url.port===String(port)?route.continue():route.abort();});
      try{
        await page.goto(`http://127.0.0.1:${port}/?devsafe=1`);await page.waitForFunction(()=>window.__initialAdoptComplete===true);
        await page.evaluate(async mode=>{
          if(!window.OMAXDevSafe?.active)throw Error("Disposable backend required");
          const job=(id,name,cutNumber,extra={})=>({id,name,cutNumber,projectNumber:"0000",cat:"fixture-project",startISO:"2026-10-05",dueISO:"2026-10-06",estimateHours:2,priority:1,chargeRate:200,costRate:45,material:"Steel",materialCost:10,materialQty:1,manualLogs:[],files:[],...extra});
          const actual=(order)=>({cutDateISO:"2026-10-05",cutOrderWithinDay:order});
          window.cuttingJobs=[job("fixture_active_z","Fixture Active","C041",mode==="canonical"?actual(1):{})];
          window.completedCuttingJobs=[job("fixture_imported_a","Fixture Imported","C007",{completedAtISO:"2026-10-06T12:00:00Z",import_event_id:"fixture-import",importProvenance:{sourceRowNumber:1},...(mode==="canonical"?actual(2):{})}),job("fixture_reviewed_b","Fixture Reviewed","C012",{completedAtISO:"2026-10-07T12:00:00Z",...(mode!=="legacy"?actual(3):{})}),job("fixture_missing_c","Fixture Missing",null,{completedAtISO:"2026-10-08T12:00:00Z",...(mode==="canonical"?actual(4):{})})];
          cuttingJobs=window.cuttingJobs;completedCuttingJobs=window.completedCuttingJobs;
          setJobFolders([{id:"jobs_root",name:"All Jobs",parent:null,order:1},{id:"fixture-project",name:"0000 Company Improvements",parent:"jobs_root",order:2}]);
          const saved=await saveCloudNow();if(!saved.saved)throw Error("Fixture seed save failed: "+JSON.stringify(saved));
          window.__cjoBefore=JSON.stringify({active:window.cuttingJobs,completed:window.completedCuttingJobs});
          window.__cjoEffects={save:0,debounce:0,transactions:0,resequence:0,coordinator:0};
          const save=saveCloudNow,debounce=saveCloudDebounced,transaction=window.OMAXDevSafe.db.runTransaction;
          saveCloudNow=(...args)=>{window.__cjoEffects.save++;return save(...args);};
          saveCloudDebounced=(...args)=>{window.__cjoEffects.debounce++;return debounce(...args);};
          window.OMAXDevSafe.db.runTransaction=(...args)=>{window.__cjoEffects.transactions++;return transaction(...args);};
          window.CuttingJobHistory={...window.CuttingJobHistory,resequence(){window.__cjoEffects.resequence++;throw Error("Render resequenced");}};
          const model=window.CuttingJobChronology;window.CuttingJobChronology={...model,createMutationApi(){window.__cjoEffects.coordinator++;throw Error("Render created coordinator");},prepareChronologyMutation(){window.__cjoEffects.coordinator++;throw Error("Render prepared mutation");}};
          window.jobCategoryFilter="jobs_root";window.jobHistoryExpanded=true;
        },mode);
        await page.evaluate(()=>{location.hash="#/jobs";route();});
        const jobs=await page.locator("#content").innerText();
        for(const label of ["Fixture Active · C041","Fixture Imported · C007","Fixture Reviewed · C012","Fixture Missing · —"])assert.ok(jobs.includes(label),mode+" Jobs/history missing "+label);
        await page.locator("[data-job-flow-open]").click();
        const flow=await page.locator("#jobFlowChart").innerText();
        for(const label of ["Fixture Active · C041","Fixture Imported · C007","Fixture Reviewed · C012","Fixture Missing · —"])assert.ok(flow.includes(label),mode+" flow missing "+label);
        await page.locator("button[data-job-flow-close]").click();
        await page.evaluate(()=>{location.hash="#/";route();});
        await page.locator("#dashboardGlobalSearch").fill("Fixture");
        const suggestions=await page.locator("#dashboardGlobalSearchSuggestions").innerText();
        for(const label of ["Fixture Imported · C007","Fixture Reviewed · C012","Fixture Missing · —"])assert.ok(suggestions.includes(label),mode+" dashboard missing "+label);
        await page.evaluate(()=>{location.hash="#/costs";route();});
        await page.locator("[data-open-data-center]").click();await page.locator('[data-dc-tab="cutting"]').click();
        const data=await page.evaluate(()=>computeCostModel().cuttingJobsDataTable);
        for(const [id,label] of [["fixture_imported_a","C007"],["fixture_reviewed_b","C012"],["fixture_missing_c","—"]]){
          assert.equal(data.find(row=>row.id===id).cumulativeCutNumberLabel,label);
          assert.equal(await page.locator('[data-cutting-row][data-job-id="'+id+'"]').locator("td").nth(1).innerText(),label);
        }
        await page.locator("button[data-close-data-center]").click();
        await page.evaluate(()=>{location.hash="#/jobs";route();window.cuttingJobs.reverse();window.completedCuttingJobs.reverse();renderJobs();});
        const reordered=await page.locator("#content").innerText();for(const label of ["Fixture Active · C041","Fixture Imported · C007","Fixture Reviewed · C012"])assert.ok(reordered.includes(label));
        const state=await page.evaluate(()=>({effects:window.__cjoEffects,readiness:window.CuttingJobChronology.chronologyReadiness(window.cuttingJobs,window.completedCuttingJobs).status,before:JSON.parse(window.__cjoBefore),after:{active:window.cuttingJobs,completed:window.completedCuttingJobs}}));
        // Array reversal is a deliberate fixture action; compare records by ID.
        const byId=lists=>Object.fromEntries([...lists.active,...lists.completed].map(job=>[job.id,job]));
        assert.deepEqual(byId(state.after),byId(state.before));assert.equal(state.readiness,{legacy:"LEGACY_ONLY",canonical:"CANONICAL_READY",mixed:"REVIEW_REQUIRED"}[mode]);
        assert.deepEqual(state.effects,{save:0,debounce:0,transactions:0,resequence:0,coordinator:0});assert.deepEqual(errors,[]);
        results.push({mode,passed:true,views:["Jobs","History","flow chart","dashboard search","Data Center model and rendered rows","array reversal"],readiness:state.readiness,effects:state.effects,pageErrors:errors});
        console.log("PASS "+mode);
      }finally{await context.close();}
    }
  }finally{await browser.close();server.close();}
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,".gitignore"),"*\n");fs.writeFileSync(path.join(output,"result.json"),JSON.stringify({passed:results.length,failed:0,results},null,2));
}
main().catch(error=>{server.close();console.error(error);process.exitCode=1;});
