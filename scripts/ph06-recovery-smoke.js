"use strict";
// Disposable browser profile and devsafe fixture backend only. No production
// document reads, repair execution, credentials, or persistent browser profile.
const assert=require("node:assert/strict"),{chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH);
const repair=require("../js/globalIdentityRepair"),{fixture}=require("../tests/fixtures/global-identity");
(async()=>{
  const browser=await chromium.launch({channel:"msedge",headless:true});let businessRequests=0;const errors=[];
  try{
    const context=await browser.newContext({serviceWorkers:"block"});
    await context.route("**/*",route=>{const url=new URL(route.request().url());if(/firestore\.googleapis|firebaseio|firebasestorage\.googleapis|graph\.microsoft/.test(url.hostname)){businessRequests++;return route.abort();}return route.continue();});
    const page=await context.newPage();page.on("pageerror",error=>errors.push(error.message));
    await page.goto("http://localhost:8000/?devsafe=1");await page.waitForFunction(()=>window.__initialAdoptComplete===true);
    assert.equal(await page.evaluate(()=>window.OMAXDevSafe.active),true);
    const source=fixture();await page.evaluate(async state=>{await FB.docRef.set(state);await loadFromCloud();route();},source);
    await page.waitForSelector('[data-recovery-collection="inventory"]');
    const before=await page.evaluate(async()=>({cloud:await readCurrentCloudStateReadOnly(),writes:canWriteCloud(),recovery:isRecoveryMode(),plan:await window.previewGlobalIdentityRepair(),save:await saveCloudNow()}));
    assert.deepEqual(before.cloud,source);assert.equal(before.writes,false);assert.equal(before.recovery,true);assert.equal(before.save.saved,false);assert.equal(before.plan.duplicateGroups.length,8);assert.deepEqual(before.plan.blockers,[]);
    for(const [hash,field,count]of [["#/inventory","inventory",28],["#/settings","maintenanceCalendarInstancesV2",80],["#/jobs","completedCuttingJobs",67],["#/costs","totalHistory",70]]){
      await page.evaluate(hash=>{location.hash=hash;route();},hash);assert.equal(await page.locator(`[data-recovery-collection="${field}"] [data-evidence-row]`).count(),count);
      assert.equal(await page.evaluate(()=>Array.from(document.querySelectorAll("#content input,#content button,#content textarea")).filter(node=>!node.closest("#recoveryDiagnosticsPanel")).length),0);
    }
    await page.reload();await page.waitForFunction(()=>window.__inventoryIdentityRecoveryDisplay===true);
    assert.equal((await page.evaluate(()=>window.previewGlobalIdentityRepair())).duplicateGroups.length,8);
    // Model an externally verified repaired SERVER result in the disposable
    // backend. The browser's production repair API is never invoked here.
    const clean=repair.repairedState(source,repair.preview(source));clean.syncMeta.rev++;
    const loaded=await page.evaluate(async state=>{await FB.docRef.set(state);return await loadFromCloud();},clean);
    assert.equal(loaded.recovery,false,JSON.stringify(loaded));
    const after=await page.evaluate(async()=>({recovery:isRecoveryMode(),writes:canWriteCloud(),disabled:window.__autosaveDisabled,banner:!!document.getElementById("recoveryModeBanner"),cloud:await readCurrentCloudStateReadOnly(),plan:await window.previewGlobalIdentityRepair()}));
    assert.equal(after.recovery,false);assert.equal(after.writes,true);assert.equal(after.disabled,false);assert.equal(after.banner,false);assert.deepEqual(after.cloud,clean);assert.equal(after.plan.noop,true,after.plan.blockers.join(" "));
    const saved=await page.evaluate(async()=>{inventory[0].note="Disposable ordinary edit";return await saveCloudNow();});
    assert.equal(saved.saved,true,JSON.stringify(saved));
    await page.evaluate(()=>{location.hash="#/inventory";route();});assert.equal(await page.locator("[data-recovery-collection]").count(),0);
    await page.reload();await page.waitForFunction(()=>window.__initialAdoptComplete===true);assert.equal(await page.evaluate(()=>canWriteCloud()),true);
    assert.equal(businessRequests,0);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,syntheticCollisionGroups:8,corruptLoadReadOnly:true,authoritativeEvidenceVisible:true,cleanServerReloadExitsRecovery:true,ordinarySaveResumed:true,normalUiRestored:true,pageErrors:errors,businessRequests},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
