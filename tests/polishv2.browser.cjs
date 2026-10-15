"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
const root=path.resolve(__dirname,"..");
test("POLISHv2 isolated forms, verified RPM edits and shared job navigation",{timeout:120000},async t=>{
 const server=http.createServer(async(req,res)=>{const url=new URL(req.url,"http://localhost"),file=path.resolve(root,"."+url.pathname+(url.pathname.endsWith("/")?"index.html":""));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"})[path.extname(file)]||"text/plain"}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin="http://127.0.0.1:"+server.address().port,browser=await chromium.launch({headless:true,channel:"msedge"});t.after(()=>browser.close());
 async function fixture(){
  const context=await browser.newContext({timezoneId:"America/Chicago",viewport:{width:1280,height:800}});
  await context.route("**/*",r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));page.setDefaultTimeout(8000);await page.clock.setFixedTime(new Date("2026-10-15T17:00:00Z"));
  const load=async(hash="")=>{await page.goto(origin+"/?devsafe=1"+hash);await page.waitForFunction(()=>window.OMAXDevSafe?.active&&window.__initialAdoptComplete);assert.equal(await page.evaluate(()=>typeof firebase),"undefined");};
  await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await page.evaluate(async()=>{
   const ref=OMAXDevSafe.db.doc(FB.docRef.path),state=(await ref.get()).data();
   state.pumpEff={baselineRPM:1700,baselineDateISO:"2026-10-01",baselineTimeISO:"08:00",baselineHistory:[
    {id:"baseline-keep",effectiveDateISO:"2026-10-01",rpm:1700,createdAtISO:"2026-10-01T08:00:00Z",createdBy:"fixture",corrections:[]},
    {id:"baseline-later",effectiveDateISO:"2026-10-12",rpm:1800,createdAtISO:"2026-10-12T08:00:00Z",createdBy:"fixture",corrections:[]}],
    entries:[{id:"rpm-target",dateISO:"2026-10-10",rpm:1750,timeISO:"10:00",provenance:{keep:true}},{dateISO:"2026-10-11",rpm:1760.5,extra:"untouched"}],
    notes:[{dateISO:"2026-10-10",range:"all",text:" keep note ",updatedISO:"2026-10-10T08:00:00Z"}],extraPump:{keep:true}};
   state.jobFolders=[{id:"jobs_root",name:"All Jobs",parent:null,order:1},{id:"a",name:"1254 Blanco",projectNumber:"1254",parent:"jobs_root",order:2},{id:"b",name:"1242 Mesquite",projectNumber:"1242",parent:"jobs_root",order:3}];
   const base={name:"Identical job",estimateHours:1,startISO:"2026-10-14",dueISO:"2026-10-15",material:"Steel",materialCost:0,materialQty:1,chargeRate:200,costRate:45,priority:1,files:[],manualLogs:[],notes:""};
   state.cuttingJobs=[{...base,id:"job-active",cat:"a",projectNumber:"1254"}];
   state.completedCuttingJobs=[{...base,id:"job-past",cat:"a",projectNumber:"1254",completedAtISO:"2026-10-14"},{...base,id:"job-same-name",cat:"b",projectNumber:"1242",completedAtISO:"2026-10-14"}];
   await ref.set(state);
  });await load();
  const cloud=()=>page.evaluate(async()=>(await OMAXDevSafe.db.doc(FB.docRef.path).get()).data());
  const edit=async(date="2026-10-10")=>{await page.locator("#pumpEditAllBtn").click();await page.locator("[data-pump-saved-log]").filter({hasText:date}).locator("[data-pump-log-edit]").click();};
  const done=async()=>{assert.deepEqual(errors,[]);await context.close();};
  return{context,page,load,cloud,edit,done,errors};
 }
 await t.test("actual create, stable-ID edit, graph update, refresh, signed-out session reset and reopened page",async()=>{
  const h=await fixture(),p=h.page,before=await h.cloud();
  await p.locator("#pumpLogDate").fill("2026-10-14");await p.locator("#pumpLogRPM").fill("1825");await p.locator("#pumpLogTime").fill("11:00");await p.locator('#pumpLogForm [type="submit"]').click();
  await p.waitForFunction(()=>window.pumpEff.entries.some(e=>e.dateISO==="2026-10-14"));
  const created=(await h.cloud()).pumpEff.entries.find(e=>e.dateISO==="2026-10-14");assert.ok(created.id);
  await h.edit();await p.locator("#pumpEditDate").fill("2026-10-13");await p.locator("#pumpEditRPM").fill("1740");await p.locator("#pumpEditTime").fill("09:15");await p.locator(".pump-log-edit-save").click();
  await p.locator("[data-pump-log-status]").filter({hasText:"verified and saved"}).waitFor();
  const after=await h.cloud(),expected=structuredClone(before.pumpEff);Object.assign(expected.entries[0],{dateISO:"2026-10-13",rpm:1740,timeISO:"09:15"});expected.entries.push(created);assert.deepEqual(after.pumpEff,expected);
  assert.equal(after.pumpEff.entries.filter(e=>e.id==="rpm-target").length,1);assert.equal(after.pumpEff.entries.some(e=>e.dateISO==="2026-10-10"),false);
  const points=await p.evaluate(()=>document.querySelector("#pumpChart").__pumpChartTargets.map(e=>({date:e.dateISO,rpm:e.rpm,details:e.detailLines})));
  assert.ok(points.some(e=>e.date==="2026-10-13"&&e.rpm===1740&&e.details.join(" ").includes("1,800")));assert.equal(points.some(e=>e.date==="2026-10-10"),false);
  await h.load();assert.deepEqual((await h.cloud()).pumpEff,expected);assert.deepEqual(await p.evaluate(()=>window.pumpEff),expected);
  await p.evaluate(()=>{FB.user=null;FB.ready=false;renderSignedOut();});assert.equal(await p.evaluate(()=>FB.user),null);await h.load();assert.deepEqual(await p.evaluate(()=>window.pumpEff),expected);
  const reopened=await h.context.newPage();await reopened.goto(origin+"/?devsafe=1");await reopened.waitForFunction(()=>window.__initialAdoptComplete);assert.deepEqual(await reopened.evaluate(()=>window.pumpEff),expected);await reopened.close();await h.done();
 });
 await t.test("date-only legacy correction preserves fractional RPM and absence of an ID",async()=>{
  const h=await fixture(),p=h.page;await h.edit("2026-10-11");assert.equal(await p.locator("#pumpEditRPM").inputValue(),"1760.5");await p.locator("#pumpEditDate").fill("2026-10-09");await p.locator(".pump-log-edit-save").click();await p.locator("[data-pump-log-status]").filter({hasText:"verified and saved"}).waitFor();
  const entry=(await h.cloud()).pumpEff.entries.find(e=>e.extra==="untouched");assert.equal(entry.rpm,1760.5);assert.equal(entry.dateISO,"2026-10-09");assert.equal(Object.hasOwn(entry,"id"),false);await h.load();assert.deepEqual(await p.evaluate(()=>window.pumpEff.entries.find(e=>e.extra==="untouched")),entry);await h.done();
 });
 await t.test("saving waits for independent readback and ignores duplicate submit",async()=>{
  const h=await fixture(),p=h.page;await h.edit();await p.locator("#pumpEditRPM").fill("1780");
  await p.evaluate(()=>{window.__realRead=readInventoryMaterialAuthoritativeState;window.__reads=0;window.readInventoryMaterialAuthoritativeState=async()=>{const e=await window.__realRead();if(++window.__reads===2)await new Promise(resolve=>window.__releaseRPM=resolve);return e;};});
  await p.locator(".pump-log-edit-save").click();await p.waitForFunction(()=>!!window.__releaseRPM);await p.locator("[data-pump-log-edit-form]").dispatchEvent("submit");
  assert.match(await p.locator("[data-pump-log-status]").innerText(),/verifying/);assert.equal(await p.evaluate(()=>window.pumpEff.entries.find(e=>e.id==="rpm-target").rpm),1750);assert.equal(await p.locator(".pump-log-edit-save").isDisabled(),true);
  await p.evaluate(()=>window.__releaseRPM());await p.locator("[data-pump-log-status]").filter({hasText:"verified and saved"}).waitFor();assert.equal((await h.cloud()).pumpEff.entries.length,2);assert.equal(await p.evaluate(()=>window.__reads),2);await h.done();
 });
 await t.test("definite rejection keeps correction fields open, saved graph unchanged and no success",async()=>{
  const h=await fixture(),p=h.page,before=await h.cloud();await h.edit();await p.locator("#pumpEditRPM").fill("1790");
  await p.evaluate(()=>{window.__realAtomic=window.OMAXAtomicPersistence;window.OMAXAtomicPersistence={...window.__realAtomic,save:async()=>({saved:false,definiteFailure:true,stateWriteAttempted:false,error:"Fixture permission rejected"})};});
  await p.locator(".pump-log-edit-save").click();await p.locator("[data-pump-log-status]").filter({hasText:"Fixture permission rejected"}).waitFor();
  assert.equal(await p.locator("#pumpEditRPM").inputValue(),"1790");assert.deepEqual((await h.cloud()).pumpEff,before.pumpEff);assert.equal(await p.evaluate(()=>window.pumpEff.entries[0].rpm),1750);
  assert.equal(await p.locator(".pump-log-edit-save").isEnabled(),true);assert.doesNotMatch(await p.locator("[data-pump-log-status]").innerText(),/verified and saved/);await h.done();
 });
 await t.test("mismatched readback suspends retries without optimistic display",async()=>{
  const h=await fixture(),p=h.page;await h.edit();await p.locator("#pumpEditRPM").fill("1790");
  await p.evaluate(()=>{window.__realRead=readInventoryMaterialAuthoritativeState;window.__reads=0;window.readInventoryMaterialAuthoritativeState=async()=>{const e=await window.__realRead();if(++window.__reads===2)e.state.pumpEff.entries[0].rpm++;return e;};});
  await p.locator(".pump-log-edit-save").click();await p.locator("[data-pump-log-status]").filter({hasText:"Reload and verify"}).waitFor();assert.equal(await p.evaluate(()=>window.__autosaveDisabled),true);assert.equal(await p.evaluate(()=>window.pumpEff.entries[0].rpm),1750);assert.equal(await p.locator(".pump-log-edit-save").isDisabled(),true);await h.done();
 });
 await t.test("new category name/color stays selected through rerender; cancel and invalid ownership preserve data",async()=>{
  const h=await fixture(),p=h.page;await h.load("#/jobs");await p.locator('[aria-controls="jobAddPanel"]').click();await p.locator("#jobName").fill("Unsaved dimensions");await p.locator("#jobCategory").selectOption("__new__");
  await p.locator("[data-category-name]").fill("New project");await p.locator("[data-category-project]").fill("1432");await p.locator("[data-category-create-color]").fill("#b34567");await p.locator("[data-confirm-confirm]").click();await p.locator("[data-category-name]").waitFor({state:"hidden"}).catch(async error=>{console.log("CATEGORY DIAGNOSTIC",await p.evaluate(()=>({name:document.querySelector("[data-category-name]")?.value,project:document.querySelector("[data-category-project]")?.value,error:document.querySelector("[data-category-error]")?.textContent,folders:window.jobFolders})));throw error;});
  await p.waitForFunction(()=>window.jobFolders.some(f=>f.projectNumber==="1432"));const made=await p.evaluate(()=>window.jobFolders.find(f=>f.projectNumber==="1432"));assert.equal(made.color,"#B34567");await p.evaluate(()=>renderJobs());assert.equal(await p.locator("#jobCategory").inputValue(),made.id);assert.equal(await p.locator("#jobName").inputValue(),"Unsaved dimensions");
  await p.locator("#jobCategory").selectOption("a");await p.evaluate(()=>renderJobs());assert.equal(await p.locator("#jobCategory").inputValue(),"a");assert.equal(await p.locator("#jobProjectNumber").inputValue(),"1254");
  await p.locator("#jobCategory").selectOption(made.id);await p.evaluate(()=>renderJobs());assert.equal(await p.locator("#jobCategory").inputValue(),made.id);
  await p.locator("#jobCategory").selectOption("__new__");await p.locator("[data-confirm-cancel]").click();await p.evaluate(()=>renderJobs());assert.equal(await p.locator("#jobCategory").inputValue(),made.id);
  await p.locator("#jobCategory").selectOption("__new__");await p.locator("[data-category-name]").fill("Wrong owner");await p.locator("[data-category-project]").fill("1254");await p.locator("[data-confirm-confirm]").click();assert.equal(await p.locator("[data-category-name]").isVisible(),true);assert.ok(await p.locator("[data-category-error]").innerText());await p.locator("[data-confirm-cancel]").click();
  await h.load();await p.evaluate(()=>triggerDashboardAddPicker({}));await p.locator('[data-choice="job"]').click();await p.locator("#dashJobCategory").selectOption("__new__");
  await p.locator("[data-category-name]").fill("Dashboard project");await p.locator("[data-category-project]").fill("1433");await p.locator("[data-category-create-color]").fill("#226688");await p.locator("[data-confirm-confirm]").click();
  await p.locator("[data-category-name]").waitFor({state:"hidden"});const dash=await p.evaluate(()=>window.jobFolders.find(f=>f.projectNumber==="1433"));assert.equal(await p.locator("#dashJobCategory").inputValue(),dash.id);assert.equal(dash.color,"#226688");
  await h.done();
 });
 await t.test("Reset requires checkbox; Cancel/Escape preserve local tables; deliberate fixture reset clears only tolerance",async()=>{
  const h=await fixture(),p=h.page;await p.evaluate(()=>{localStorage.setItem("toleranceTables",JSON.stringify([{id:"fixture",title:"Fixture",rows:[{fit:"test",quality:"keep"}]}]));localStorage.setItem("toleranceThicknessTable","legacy");localStorage.setItem("unrelated-audit","keep");});await h.load("#/tolerance");
  const color=await p.locator("#toleranceReset").evaluate(el=>({color:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));assert.equal(color.color,"rgb(23, 43, 70)");
  await p.locator("#toleranceReset").click();assert.equal(await p.locator("[data-confirm-confirm]").isDisabled(),true);await p.keyboard.press("Escape");assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem("toleranceTables")).length),1);
  await p.locator("#toleranceReset").click();await p.locator("[data-tolerance-reset-confirm]").check();await p.locator("[data-confirm-cancel]").click();assert.equal(await p.evaluate(()=>localStorage.getItem("toleranceThicknessTable")),"legacy");
  await p.locator("#toleranceReset").click();assert.equal(await p.locator("[data-tolerance-reset-confirm]").isChecked(),false);await p.locator("[data-tolerance-reset-confirm]").check();await p.locator("[data-confirm-confirm]").click();assert.equal(await p.evaluate(()=>localStorage.getItem("toleranceTables")),null);assert.equal(await p.evaluate(()=>localStorage.getItem("toleranceThicknessTable")),null);assert.equal(await p.evaluate(()=>localStorage.getItem("unrelated-audit")),"keep");await h.done();
 });
 await t.test("Dashboard and Calendar reveal active/past identities through filters, fade and handle stale refs without writes",async()=>{
  const h=await fixture(),p=h.page,before=await h.cloud();
  for(const [entry,id]of [["dashboard","job-past"],["dashboard","job-active"],["calendar","job-past"],["calendar","job-active"]]){
   await p.evaluate(()=>{window.jobCategoryFilter="b";window.jobHistoryCategoryFilter="b";jobHistorySearchTerm="no-match";window.jobHistorySearchTerm=jobHistorySearchTerm;location.hash="#/";renderDashboard();});
   if(entry==="dashboard"){await p.locator("#dashboardGlobalSearch").fill("Identical job");await p.locator('[data-search-id="'+id+'"]').click();}else await p.locator('[data-cal-job="'+id+'"]').first().click();
   await p.waitForFunction(id=>document.querySelector('[data-job-row="'+id+'"],[data-history-row="'+id+'"]')?.classList.contains("job-row-link-highlight"),id);
   assert.equal(await p.evaluate(()=>location.hash),"#/jobs");assert.equal(await p.locator('[data-history-row="job-same-name"].job-row-link-highlight').count(),0);
  }
  await p.waitForFunction(()=>!document.querySelector('[data-job-row="job-active"]').classList.contains("job-row-link-highlight"));await p.waitForTimeout(300);
  await p.evaluate(()=>redirectToCuttingJobPage("missing-job"));assert.equal(await p.evaluate(()=>location.hash),"#/jobs");
  const after=await h.cloud();assert.deepEqual(after.cuttingJobs,before.cuttingJobs);assert.deepEqual(after.completedCuttingJobs,before.completedCuttingJobs);assert.equal(after.syncMeta.rev,before.syncMeta.rev);await h.done();
 });
});
