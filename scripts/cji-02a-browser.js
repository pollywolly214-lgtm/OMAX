"use strict";
// Real Edge, actual page handlers and downloads, disposable localhost devsafe
// backend only. Every external request is blocked, including SDK/CDN requests.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
const output=path.resolve(__dirname,"../artifacts/cji-02a");fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,".gitignore"),"*\n");
const row={import_event_id:"browser-cji02a",record_status:"active",job_name:"Browser fixture cut",project_number:"1242",category:"Mesquite",material:"Steel",thickness_inches:"0.25",path_length_ft:"4",path_width_ft:"2",review_status:"reviewed"};
const checks=[];
async function main(){
  const browser=await chromium.launch({channel:"msedge",headless:true});
  async function scenario(name,mode,verify,{legacy=false,rows=[row],weeklyTimestampDrift=false}={}){
    const context=await browser.newContext({acceptDownloads:true,serviceWorkers:"block"}),page=await context.newPage(),errors=[];
    page.setDefaultTimeout(30000);page.on("pageerror",error=>errors.push(error.message));
    await context.route("**/*",route=>new URL(route.request().url()).hostname==="localhost"?route.continue():route.abort());
    try{
      await page.goto("http://localhost:8000/?devsafe=1");await page.waitForFunction(()=>window.__initialAdoptComplete===true);
      await page.evaluate(async({legacy,weeklyTimestampDrift})=>{
        if(!window.OMAXDevSafe.active)throw Error("Disposable backend required");
        location.hash="#/jobs";route();
        localStorage.setItem("job_material_pricing_v1",JSON.stringify({wasteFactor:10,materials:[{id:"steel",name:"Steel",density:.283,pricePerLb:.8}]}));
        if(legacy){
          setJobFolders([{id:"jobs_root",name:"All Jobs",parent:null,order:1},{id:"job_project_0000",name:"0000 Undisclosed Project",projectNumber:null,parent:"jobs_root",order:17,color:"#ABCDEF",custom:{owner:"shop",flags:[1,2]}}]);
          window.cuttingJobs=Array.from({length:11},(_,i)=>({id:"old-"+i,name:"Original cut "+i,projectNumber:"0000",cat:"job_project_0000",cutNumber:"C"+String(i+1).padStart(3,"0"),startISO:"2020-01-01",files:[]}));
          cuttingJobs=window.cuttingJobs;
        }
        if(weeklyTimestampDrift){
          window.weeklyCostReports=[{id:"browser-week",weekKey:"2026-09-28",weekStartISO:"2026-09-28",weekEndISO:"2026-10-04",totalCutCost:123.45,totalMaintenanceCost:12,cutByCategory:{Blanco:{cost:123.45}},generatedAtISO:"2026-10-02T19:52:35.090Z"}];
          weeklyCostReports=window.weeklyCostReports;
        }
        const saved=await saveCloudNow();if(!saved.saved)throw Error(JSON.stringify(saved));
        window.__cjiBefore=await readCurrentCloudStateReadOnly();window.__cjiTrace=[];window.__cjiSaves=0;
        if(weeklyTimestampDrift)window.weeklyCostReports[0].generatedAtISO="2026-10-02T20:20:07.475Z";
        window.__cjiDone=new Promise(resolve=>window.__cjiResolveDone=resolve);
        window.__cjiSaveStarted=new Promise(resolve=>window.__cjiResolveSaveStarted=resolve);
        const api=window.cuttingJobImporter;
        window.cuttingJobImporter={...api,submit:(...args)=>{
          window.__cjiSubmissionStarted=true;
          return api.submit(...args).finally(()=>window.__cjiResolveDone());
        }};
        const anchorClick=HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click=function(){
          if(this.download.startsWith("omax-cutting-job-import-backup")){
            window.__cjiTrace.push({stage:"download",active:navigator.userActivation.isActive,href:this.href});
            if(window.__cjiFailDownload)throw Error("Fixture browser rejected backup trigger");
          }
          return anchorClick.call(this);
        };
        const read=readCurrentCloudStateReadOnly;
        readCurrentCloudStateReadOnly=async()=>{
          window.__cjiTrace.push({stage:"read",active:navigator.userActivation.isActive});
          if(window.__cjiReadError)throw Error("Fixture cloud read rejection");
          if(window.__cjiDelayRead)await new Promise(resolve=>setTimeout(resolve,window.__cjiDelayRead));
          const result=await read();if(window.__cjiServerDrift)result.syncMeta.rev++;
          if(window.__cjiSaves&&window.__cjiPostSaveWeeklyValueDrift)result.weeklyCostReports[0].totalCutCost++;
          return result;
        };
        const save=saveCloudNow;
        saveCloudNow=async options=>{
          window.__cjiSaves++;window.__cjiTrace.push({stage:"save",revision:options?.expectedRevision});
          if(window.__cjiSaveGate)await new Promise(resolve=>{window.__cjiReleaseSave=resolve;window.__cjiResolveSaveStarted();});
          if(window.__cjiIndeterminate)return{saved:false,stateWriteAttempted:true,stateWriteCompleted:false,indeterminate:true};
          if(window.__cjiDefiniteFailure)return{saved:false,stateWriteAttempted:true,definiteFailure:true,error:"Fixture CAS rejection"};
          return save(options);
        };
      },{legacy,weeklyTimestampDrift});
      if(mode==="poller")await page.evaluate(()=>{window.__unrelatedPoll=setInterval(()=>{document.getElementById("cuttingJobImportStatus").textContent;},10);});
      if(mode==="observer")await page.evaluate(()=>{window.__unrelatedObserver=new MutationObserver(()=>{document.getElementById("cuttingJobImportStatus").textContent;});window.__unrelatedObserver.observe(document.getElementById("cuttingJobImportStatus"),{childList:true,subtree:true});});
      await page.evaluate(()=>openReviewedCuttingJobImporter());
      await page.locator("#cuttingJobImportFile").setInputFiles({name:"fixture.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(rows))});
      await page.locator("#cuttingJobImportPreview").click();await page.waitForFunction(()=>!document.getElementById("cuttingJobImportPreview").disabled);
      assert.equal(await page.locator("#cuttingJobImportStatus").textContent().then(text=>text.startsWith("Import stopped")),false,await page.locator("#cuttingJobImportStatus").textContent());
      await page.locator("#cuttingJobImportReviewed").check();assert.equal(await page.locator("#cuttingJobImportRun").isEnabled(),true);
      await page.locator("#cuttingJobImportRun").click();await verify(page);
      assert.deepEqual(errors,[]);checks.push({name,passed:true});console.log("PASS",name);
    }catch(error){checks.push({name,passed:false,error:String(error.stack||error)});console.error("FAIL",name,error.message);}
    finally{await context.close();}
  }
  // Await the business promise, then read status once. No driver status poller,
  // animation-frame loop, or observer runs during the normal import scenarios.
  const final=page=>page.evaluate(async()=>{if(window.__cjiSubmissionStarted)await window.__cjiDone;});
  const successful=async(page,filename)=>{
    await page.evaluate(()=>{window.__cjiTrace=[];});
    const pending=page.waitForEvent("download");await page.locator("#cuttingJobImportConfirmRun").click();const download=await pending;
    await download.saveAs(path.join(output,filename));assert.equal(await download.failure(),null);const backup=JSON.parse(fs.readFileSync(path.join(output,filename),"utf8"));assert.ok(backup.cjiLocalMaterialSettings);assert.equal(backup.cuttingJobs.length,0);
    await final(page);assert.match(await page.locator("#cuttingJobImportStatus").textContent(),/^Import complete/);
    const result=await page.evaluate(async()=>({cloud:await readCurrentCloudStateReadOnly(),before:window.__cjiBefore,trace:window.__cjiTrace,saves:window.__cjiSaves,result:JSON.parse(document.getElementById("cuttingJobImportRows").dataset.lastImportResult)}));
    assert.equal(result.saves,1);assert.equal(result.trace[0].stage,"download");assert.equal(result.trace[0].active,true);assert.ok(result.trace[0].href.startsWith("blob:"));assert.equal(result.result.saveCompleted,true);
    assert.equal(result.cloud.cuttingJobs.length,1);const job=result.cloud.cuttingJobs[0],folder=result.cloud.jobFolders.find(f=>f.id===job.cat);assert.equal(job.projectNumber,"1242");assert.equal(folder.name,"1242 Mesquite");
    const unrelated=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!["cuttingJobs","completedCuttingJobs","jobFolders","syncMeta","saveMeta","syncProcessLog"].includes(key)));
    assert.deepEqual(unrelated(result.cloud),unrelated(result.before));return result;
  };
  try{
    for(const outcome of ["timestamp only","meaningful post-save drift"]){
      await scenario("weekly generated timestamp baseline: "+outcome,"none",async page=>{
        assert.match(await page.locator("#cuttingJobImportStatus").textContent(),/Ready:/);
        await page.evaluate(outcome=>{window.__cjiTrace=[];window.__cjiPostSaveWeeklyValueDrift=outcome==="meaningful post-save drift";},outcome);
        const pending=page.waitForEvent("download");await page.locator("#cuttingJobImportConfirmRun").click();const download=await pending;
        const filename=path.join(output,"weekly-generated-"+outcome.replaceAll(" ","-")+"-backup.json");await download.saveAs(filename);assert.equal(await download.failure(),null);
        const backup=JSON.parse(fs.readFileSync(filename,"utf8"));assert.equal(backup.weeklyCostReports[0].generatedAtISO,"2026-10-02T19:52:35.090Z");assert.equal(backup.weeklyCostReports[0].totalCutCost,123.45);
        await final(page);
        const result=await page.evaluate(async()=>({cloud:await readCurrentCloudStateReadOnly(),before:window.__cjiBefore,local:window.weeklyCostReports,trace:window.__cjiTrace,saves:window.__cjiSaves,recovery:window.__recoveryInspectMode,autosaveDisabled:window.__autosaveDisabled,result:JSON.parse(document.getElementById("cuttingJobImportRows").dataset.lastImportResult)}));
        assert.equal(result.saves,1);assert.equal(result.trace[0].stage,"download");assert.equal(result.trace[0].active,true);
        assert.equal(result.local[0].generatedAtISO,"2026-10-02T20:20:07.475Z");assert.equal(result.cloud.weeklyCostReports[0].generatedAtISO,"2026-10-02T20:20:07.475Z");
        if(outcome==="timestamp only"){
          assert.match(await page.locator("#cuttingJobImportStatus").textContent(),/^Import complete/);assert.equal(result.result.saveCompleted,true);assert.equal(result.result.verificationCompleted,true);assert.equal(Boolean(result.recovery),false);assert.equal(Boolean(result.autosaveDisabled),false);
          assert.deepEqual(result.cloud.weeklyCostReports,[{...result.before.weeklyCostReports[0],generatedAtISO:"2026-10-02T20:20:07.475Z"}]);assert.equal(result.cloud.cuttingJobs.length,1);
        }else{
          assert.match(await page.locator("#cuttingJobImportStatus").textContent(),/^Import suspended/);assert.equal(result.result.saveIndeterminate,true);assert.equal(result.result.rollbackAttempted,false);assert.equal(result.recovery,true);assert.equal(result.autosaveDisabled,true);assert.equal(await page.locator("#cuttingJobImportPreview").isDisabled(),true);
        }
      },{weeklyTimestampDrift:true});
    }
    const legacyRows=[{...row,project_number:"0000",category:"Company Improvements"}];
    for(const outcome of ["success","definite failure","indeterminate"]){
      await scenario("legacy 0000 name-only adoption: "+outcome,"none",async page=>{
        assert.match(await page.locator("#cuttingJobImportRows").textContent(),/Rename existing/);
        assert.match(await page.locator("#cuttingJobImportConfirmMessage").textContent(),/job_project_0000/);
        const audit=await page.evaluate(()=>auditCuttingJobHistoryRepair());
        assert.equal(audit.blockingError,"");assert.deepEqual(audit.repairPlan.renamed,[{id:"job_project_0000",from:"0000 Undisclosed Project",to:"0000 Company Improvements"}]);
        assert.ok(audit.repairPlan.assignments.every(a=>a.from===a.to));
        await page.evaluate(outcome=>{window.__cjiDefiniteFailure=outcome==="definite failure";window.__cjiIndeterminate=outcome==="indeterminate";window.__cjiTrace=[];},outcome);
        const pending=page.waitForEvent("download");await page.locator("#cuttingJobImportConfirmRun").click();const download=await pending;
        const filename=path.join(output,"legacy-0000-"+outcome.replaceAll(" ","-")+"-backup.json");await download.saveAs(filename);assert.equal(await download.failure(),null);
        const backup=JSON.parse(fs.readFileSync(filename,"utf8"));assert.equal(backup.jobFolders.find(f=>f.id==="job_project_0000").name,"0000 Undisclosed Project");assert.equal(backup.cuttingJobs.length,11);
        await final(page);
        const result=await page.evaluate(async()=>({cloud:await readCurrentCloudStateReadOnly(),before:window.__cjiBefore,folders:window.jobFolders,jobs:window.cuttingJobs,trace:window.__cjiTrace,saves:window.__cjiSaves,result:JSON.parse(document.getElementById("cuttingJobImportRows").dataset.lastImportResult)}));
        assert.equal(result.saves,1);assert.equal(result.trace[0].stage,"download");assert.equal(result.trace[0].active,true);
        const beforeFolder=result.before.jobFolders.find(f=>f.id==="job_project_0000"),folder=result.folders.find(f=>f.id===beforeFolder.id);
        assert.equal(result.folders.filter(f=>f.id==="job_project_0000").length,1);
        assert.deepEqual(result.jobs.slice(0,11),result.before.cuttingJobs);
        if(outcome==="definite failure"){
          assert.equal(result.result.rollbackVerified,true);assert.deepEqual(folder,beforeFolder);assert.deepEqual(result.cloud.jobFolders,result.before.jobFolders);assert.equal(result.jobs.length,11);
        }else{
          assert.deepEqual(folder,{...beforeFolder,name:"0000 Company Improvements"});assert.equal(result.jobs.length,12);assert.equal(result.jobs[11].cat,beforeFolder.id);
          if(outcome==="success"){
            assert.equal(result.result.saveCompleted,true);assert.deepEqual(result.cloud.jobFolders,result.folders);
            const plan=await page.evaluate(rows=>CuttingJobImporter.definitionPlan(cuttingJobImporter.preview(rows)),[{...legacyRows[0],import_event_id:"rerun-next"}]);assert.equal(plan.renamedCategories.length,0);assert.equal(plan.newCategories.length,0);
          }else{assert.equal(result.result.saveIndeterminate,true);assert.equal(result.result.rollbackAttempted,false);assert.equal(await page.locator("#cuttingJobImportPreview").isDisabled(),true);}
        }
      },{legacy:true,rows:legacyRows});
    }
    await scenario("explicit XXXX Undisclosed Project creates independently of legacy 0000","none",async page=>{
      const pending=page.waitForEvent("download");await page.locator("#cuttingJobImportConfirmRun").click();await pending;await final(page);
      const result=await page.evaluate(async()=>({cloud:await readCurrentCloudStateReadOnly(),result:JSON.parse(document.getElementById("cuttingJobImportRows").dataset.lastImportResult)}));
      assert.equal(result.result.saveCompleted,true);const job=result.cloud.cuttingJobs[11];assert.equal(job.projectNumber,"XXXX");assert.equal(result.cloud.jobFolders.find(f=>f.id===job.cat).name,"XXXX Undisclosed Project");assert.equal(result.cloud.jobFolders.find(f=>f.id==="job_project_0000").name,"0000 Undisclosed Project");
    },{legacy:true,rows:[{...row,project_number:"XXXX",category:"Undisclosed Project"}]});
    for(const mode of ["none","poller","observer"])await scenario(`real download and guarded import with ${mode}`,mode,page=>successful(page,`${mode}-backup.json`));
    await scenario("download remains in trusted click before a slow asynchronous cloud read","none",async page=>{await page.evaluate(()=>{window.__cjiDelayRead=5500;});await successful(page,"slow-backup.json");});
    await scenario("trigger exception visibly stops with zero saves and recovers preview controls","none",async page=>{
      await page.evaluate(()=>{window.__cjiFailDownload=true;});await page.locator("#cuttingJobImportConfirmRun").click();await final(page);
      assert.match(await page.locator("#cuttingJobImportStatus").textContent(),/Import stopped.*Downloading backup.*rejected backup trigger/);assert.equal(await page.evaluate(()=>window.__cjiSaves),0);assert.equal(await page.locator("#cuttingJobImportPreview").isEnabled(),true);assert.equal(await page.evaluate(()=>cuttingJobs.length),0);
    });
    await scenario("async read rejection is visible and re-enables preview","none",async page=>{
      await page.evaluate(()=>{window.__cjiReadError=true;});const pending=page.waitForEvent("download");await page.locator("#cuttingJobImportConfirmRun").click();await pending;await final(page);assert.match(await page.locator("#cuttingJobImportStatus").textContent(),/Import stopped.*Validating current cloud revision.*read rejection/);assert.equal(await page.evaluate(()=>window.__cjiSaves),0);assert.equal(await page.locator("#cuttingJobImportPreview").isEnabled(),true);
    });
    await scenario("double final click starts one download and one save","none",async page=>{
      await page.evaluate(()=>{window.__cjiSaveGate=true;});const pending=page.waitForEvent("download");await page.locator("#cuttingJobImportConfirmRun").click({clickCount:2});await pending;await page.evaluate(()=>window.__cjiSaveStarted);assert.equal(await page.locator("#cuttingJobImportRun").isDisabled(),true);await page.evaluate(()=>window.__cjiReleaseSave());await final(page);assert.match(await page.locator("#cuttingJobImportStatus").textContent(),/^Import complete/);assert.equal(await page.evaluate(()=>window.__cjiSaves),1);assert.equal(await page.evaluate(()=>window.__cjiTrace.filter(item=>item.stage==="download").length),1);
    });
    await scenario("indeterminate write suspends once and retains jobs/folders","none",async page=>{
      await page.evaluate(()=>{window.__cjiIndeterminate=true;});const pending=page.waitForEvent("download");await page.locator("#cuttingJobImportConfirmRun").click();await pending;await final(page);assert.match(await page.locator("#cuttingJobImportStatus").textContent(),/^Import suspended/);assert.equal(await page.evaluate(()=>window.__cjiSaves),1);assert.equal(await page.evaluate(()=>window.cuttingJobs.length),1);assert.equal(await page.evaluate(()=>window.jobFolders.filter(f=>f.name==="1242 Mesquite").length),1);assert.equal(await page.locator("#cuttingJobImportPreview").isDisabled(),true);assert.equal(await page.locator("#cuttingJobImportClose").isEnabled(),true);
    });
    await scenario("local preview drift stops before download or write","none",async page=>{
      await page.evaluate(()=>{window.__loadedCloudRevisionForSaveGuard++;});await page.locator("#cuttingJobImportConfirmRun").click();await final(page);assert.match(await page.locator("#cuttingJobImportStatus").textContent(),/Import stopped.*stale/);assert.equal(await page.evaluate(()=>window.__cjiSaves),0);assert.equal(await page.evaluate(()=>window.__cjiTrace.filter(item=>item.stage==="download").length),0);
    });
    await scenario("server revision drift after prepared backup still blocks staging","none",async page=>{
      await page.evaluate(()=>{window.__cjiServerDrift=true;});const pending=page.waitForEvent("download");await page.locator("#cuttingJobImportConfirmRun").click();await pending;await final(page);assert.match(await page.locator("#cuttingJobImportStatus").textContent(),/Import stopped.*baseline revalidation/);assert.equal(await page.evaluate(()=>window.__cjiSaves),0);assert.equal(await page.evaluate(()=>cuttingJobs.length),0);
    });
  }finally{
    fs.writeFileSync(path.join(output,"browser-results.json"),JSON.stringify({engine:"installed Edge via bundled Playwright",url:"http://localhost:8000/?devsafe=1",externalRequests:"blocked",passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,checks},null,2));await browser.close();
  }
  if(checks.some(c=>!c.passed))process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
