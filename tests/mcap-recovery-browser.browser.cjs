"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {openActiveBrowser,assertOnlyFieldsChanged}=require("./fixtures/mcap-active-browser.cjs");
const action={kind:"create",id:"mcap-fault-pump",dateISO:"2026-11-22",rpm:500,timeISO:"10:30"};

test("active Storage browser keeps a denied water check draft and retries exactly once",{timeout:60000},async t=>{
  const {page,state,reload,errors}=await openActiveBrowser(t),before=await state();
  const form=page.locator("#waterQualityForm");
  for(const [name,value]of Object.entries({date:"2026-11-22",time:"09:15",ppm:"222",initials:"MC",note:"Keep this synthetic draft"}))await form.locator(`[name="${name}"]`).fill(value);
  await form.locator('[name="softness"]').selectOption("Pass");
  await page.evaluate(()=>window.__mcapFailNext("upload_denied"));
  await form.getByRole("button",{name:"Submit",exact:true}).click();
  await page.waitForFunction(()=>document.getElementById("waterQualityStatus").textContent.includes("upload denied"));
  assert.equal(await form.locator('[name="ppm"]').inputValue(),"222");
  assert.equal(await form.locator('[name="note"]').inputValue(),"Keep this synthetic draft");
  assert.deepEqual(await state(),before);
  assert.equal(await page.evaluate(()=>window.__mcapMockCounters().databaseWrites),0);
  assert.equal(await page.evaluate(()=>isRecoveryMode()),false);
  await form.getByRole("button",{name:"Submit",exact:true}).click();
  await page.waitForFunction(()=>document.getElementById("waterQualityStatus").textContent.includes("saved and verified"));
  const after=await state();assertOnlyFieldsChanged(before,after,["waterQualityChecks"]);
  assert.equal(after.waterQualityChecks.length,before.waterQualityChecks.length+1);
  assert.equal(await page.evaluate(()=>window.__mcapMockCounters().databaseWrites),1);
  await reload(after);assert.deepEqual(errors,[]);
});

test("active Storage browser suspends after lost CAS acknowledgement and reloads the single committed record",{timeout:60000},async t=>{
  const {page,state,reload,errors}=await openActiveBrowser(t),before=await state();
  await page.evaluate(()=>window.__mcapFailNext("lost_ack"));
  const result=await page.evaluate(action=>savePumpLogChange(action),action);
  assert.equal(result.saved,false);assert.equal(result.indeterminate,true);
  assert.equal(await page.evaluate(()=>isRecoveryMode()&&window.__autosaveDisabled),true);
  assert.ok(await page.evaluate(()=>window.__lastPumpLogMutationEvidence?.action?.id==="mcap-fault-pump"));
  const after=await state();assertOnlyFieldsChanged(before,after,["pumpEff"]);
  assert.equal(after.pumpEff.entries.filter(row=>row.id===action.id).length,1);
  // Neither realtime echo nor a second explicit request may acknowledge/adopt
  // or retry an uncertain save. The original loaded baseline stays available.
  assert.deepEqual(await page.evaluate(()=>window.__lastLoadedCloudState),before);
  assert.equal((await page.evaluate(action=>savePumpLogChange(action),action)).saved,false);
  assert.equal((await page.evaluate(()=>saveCloudNow())).saved,false);
  assert.equal(await page.evaluate(()=>window.__mcapMockCounters().databaseWrites),1);
  assert.deepEqual(await state(),after);
  await reload(after);assert.deepEqual(errors,[]);
});

test("active Storage browser refuses a missing manifest without legacy fallback or writes",{timeout:60000},async t=>{
  const {page,state,errors}=await openActiveBrowser(t),before=await state();
  await page.evaluate(async expected=>{
    if(!window.__mcapRemoveActiveManifest())throw Error("Fixture manifest was not removed");
    await window.__mcapPersistSnapshot(expected);
  },before);
  await page.reload();
  await page.waitForFunction(()=>window.__cloudLoadAttemptComplete&&window.__recoveryInspectMode,null,{timeout:25000});
  const evidence=await page.evaluate(()=>({recovery:isRecoveryMode(),disabled:window.__autosaveDisabled,adopted:window.__initialAdoptComplete,writes:window.__mcapMockCounters().databaseWrites,legacy:window.__mcapMockLegacy().syncMeta.rev}));
  assert.equal(evidence.recovery,true,JSON.stringify(evidence));
  assert.equal(evidence.disabled,true);
  assert.equal(evidence.adopted,false);
  assert.equal(evidence.writes,0);
  assert.equal(evidence.legacy,1);
  assert.equal((await page.evaluate(()=>saveCloudNow())).saved,false);
  assert.deepEqual(errors,[]);
});
