"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {openActiveBrowser,assertOnlyFieldsChanged}=require("./fixtures/mcap-active-browser.cjs");

test("active Storage website: water checks, pump logs, materials and cutting jobs preserve complete state",{timeout:120000},async t=>{
  const {page,state,reload,errors}=await openActiveBrowser(t);
  const verified=async(before,fields,result)=>{
    assert.equal(result.saved,true,JSON.stringify(result));
    const after=await state();
    assertOnlyFieldsChanged(before,after,fields);
    assert.deepEqual(await page.evaluate(()=>window.__lastLoadedCloudState),after);
    assert.equal(await page.evaluate(()=>window.__mcapMockLegacy().syncMeta.rev),1);
    assert.equal(await page.evaluate(()=>isRecoveryMode()),false);
    await reload(after);
    return after;
  };
  await t.test("water-quality native form saves and edits through verified Storage authority",async()=>{
    const before=await state(),form=page.locator("#waterQualityForm");
    for(const [name,value]of Object.entries({date:"2026-11-22",time:"09:15",ppm:"125.5",initials:"MC",note:"Synthetic MCAP check"}))await form.locator(`[name="${name}"]`).fill(value);
    await form.locator('[name="softness"]').selectOption("Pass");
    await form.getByRole("button",{name:"Submit",exact:true}).click();
    await page.waitForFunction(()=>!window.__waterQualityMutationPending&&/saved and verified|requires|unavailable|backend|baseline|verification/i.test(document.getElementById("waterQualityStatus").textContent));
    assert.match(await page.locator("#waterQualityStatus").textContent(),/saved and verified/);
    const after=await state();assertOnlyFieldsChanged(before,after,["waterQualityChecks"]);
    assert.equal(after.waterQualityChecks.length,before.waterQualityChecks.length+1);
    assert.equal(after.waterQualityChecks[0].ppm,125.5);
    await reload(after);
    const original=after.waterQualityChecks[0];
    const result=await page.evaluate(original=>saveWaterQualityCheck({record:{...original,ppm:60,note:"Synthetic correction"},expected:original,legacy:[]}),original);
    const edited=await verified(after,["waterQualityChecks"],result);
    assert.equal(edited.waterQualityChecks[0].ppm,60);
    assert.equal(edited.waterQualityChecks[0].editHistory[0].before.ppm,125.5);
  });
  await t.test("pump create and date correction keep original identity and unrelated history",async()=>{
    const before=await state();
    let result=await page.evaluate(()=>savePumpLogChange({kind:"create",id:"mcap-pump",dateISO:"2026-11-22",rpm:500,timeISO:"10:30"}));
    const created=await verified(before,["pumpEff"],result),original=created.pumpEff.entries.find(row=>row.id==="mcap-pump");
    assert.equal(original.rpm,500);
    result=await page.evaluate(original=>savePumpLogChange({kind:"edit",original,dateISO:"2026-11-21",rpm:510,timeISO:"11:00"}),original);
    const edited=await verified(created,["pumpEff"],result);
    assert.equal(edited.pumpEff.entries.filter(row=>row.id==="mcap-pump").length,1);
    assert.equal(edited.pumpEff.entries.find(row=>row.id==="mcap-pump").dateISO,"2026-11-21");
    assert.deepEqual(edited.pumpEff.entries.filter(row=>row.id!=="mcap-pump"),before.pumpEff.entries);
  });
  await t.test("material quantity uses the specialized exact-state coordinator",async()=>{
    const before=await state();
    const result=await page.evaluate(()=>{
      const model=window.__lastLoadedCloudState.inventoryMaterials;
      return inventoryMaterialMutationApi.run({kind:"cell",typeId:model.types[0].id,rowIndex:0,colIndex:0,value:"17"});
    });
    const after=await verified(before,["inventoryMaterials"],result);
    const expected=structuredClone(before.inventoryMaterials);
    expected.sheets[expected.types[0].id].rows[0].values[0]="17";
    assert.deepEqual(after.inventoryMaterials,expected);
  });
  await t.test("cutting-job create, edit and complete retain audit and stable identity",async()=>{
    const before=await state();
    let result=await page.evaluate(()=>createCuttingJob({id:"mcap-job",name:"Synthetic MCAP cut",cat:"mcap-project",projectNumber:"1241",startISO:"2026-11-21",dueISO:"2026-11-22",estimateHours:2,chargeRate:200,costRate:45,material:"Steel",materialCost:10,materialQty:1,priority:1,manualLogs:[],files:[],notes:""}));
    const created=await verified(before,["cuttingJobs","completedCuttingJobs"],result);
    result=await page.evaluate(()=>saveCuttingJobEdit("mcap-job",{notes:"Synthetic reviewed note"}));
    const edited=await verified(created,["cuttingJobs","completedCuttingJobs"],result);
    assert.equal(edited.cuttingJobs.find(row=>row.id==="mcap-job").notes,"Synthetic reviewed note");
    result=await page.evaluate(()=>completeCuttingJob("mcap-job",{completedAtISO:"2026-11-22"}));
    const completed=await verified(edited,["cuttingJobs","completedCuttingJobs"],result);
    assert.equal(completed.cuttingJobs.some(row=>row.id==="mcap-job"),false);
    const job=completed.completedCuttingJobs.find(row=>row.id==="mcap-job");
    assert.equal(job.notes,"Synthetic reviewed note");
    assert.deepEqual(job.cutChronologyHistory.slice(0,-1),edited.cuttingJobs.find(row=>row.id==="mcap-job").cutChronologyHistory);
  });
  await t.test("maintenance native calendar schedules and completes an occurrence",async()=>{
    // Calendar mutations use the ordinary full save, which also stamps its
    // save-status metadata. Every business field outside maintenance stays exact.
    const before=await state(),fields=["maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2","saveMeta"];
    await page.locator("#calendarAddBtn").click();
    await page.locator('#dashboardAddModal [data-choice="task"]').click();
    await page.locator('[data-task-option="one-time"]').click();
    await page.locator("#dashOneTimeDate").fill("2026-11-22");
    await page.locator("#dashOneTimeName").fill("Synthetic MCAP maintenance");
    await page.locator("#dashOneTimeNote").fill("Retained calendar evidence");
    await page.locator('#dashOneTimeForm button[type="submit"]').click();
    await page.waitForFunction(()=>!document.getElementById("dashboardAddModal").classList.contains("is-visible"));
    const scheduled=await state();assertOnlyFieldsChanged(before,scheduled,fields);
    const task=scheduled.maintenanceTasksV2.find(row=>row.name==="Synthetic MCAP maintenance");
    assert.ok(task);
    const occurrence=scheduled.maintenanceOccurrencesV2.find(row=>row.taskId===task.id);
    assert.equal(occurrence.eventType,"scheduled");
    await reload(scheduled);
    await page.locator(`[data-cal-v2-one-time="${occurrence.id}"]`).first().click();
    await page.locator("#v2OneTimePanel [data-v2-panel-complete]").click();
    await page.waitForFunction(id=>getV2OneTimeOccurrenceView(id)?.status==="completed",occurrence.id);
    // The local view can become completed before its guarded save settles.
    // Require the durable completion and the mutation's verification to finish.
    await page.waitForFunction(()=>window.__mcapMockCounters().databaseWrites>0
      &&OMAXFirebaseOperations.snapshot().pending===0);
    const completed=await state();
    assertOnlyFieldsChanged(scheduled,completed,["maintenanceOccurrencesV2","saveMeta"]);
    assert.equal(completed.maintenanceOccurrencesV2.filter(row=>row.rootOccurrenceId===occurrence.id&&row.eventType==="completed").length,1);
    for(const row of scheduled.maintenanceOccurrencesV2)assert.deepEqual(completed.maintenanceOccurrencesV2.find(saved=>saved.id===row.id),row);
    await reload(completed);
  });
  assert.deepEqual(errors,[]);
});
