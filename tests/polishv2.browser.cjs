"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
const root=path.resolve(__dirname,"..");
// File previews are generated locally on render; durable attachment fields are
// checked separately against the fixture backend without this normalization.
const withoutPreview=value=>{const copy=structuredClone(value);for(const job of [copy].flat())for(const file of job.files||[])delete file.preview;return copy;};
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
   state.cuttingJobs=[{...base,id:"job-active",cat:"a",projectNumber:"1254",cutNumber:"C001"}];
   state.completedCuttingJobs=[{...base,id:"job-past",cat:"a",projectNumber:"1254",cutNumber:"C002",completedAtISO:"2026-10-14T15:00:00Z",actualHours:1,notes:"Preserve historical notes",files:[{id:"fixture-file",name:"reference.dxf",source:"wj_cuts_reference",relativePath:"fixture/reference.dxf"}],manualLogs:[{dateISO:"2026-10-14",hours:1}],customHistory:{keep:true},efficiency:{rate:155,chargeRate:200,costRate:45,netRate:155,expectedHours:1,actualHours:1,expectedRemaining:0,actualRemaining:0,deltaHours:0,gainLoss:0}},{...base,id:"job-same-name",cat:"b",projectNumber:"1242",cutNumber:"C003",completedAtISO:"2026-10-14"}];
   await ref.set(state);
  });await load();
  const cloud=()=>page.evaluate(async()=>(await OMAXDevSafe.db.doc(FB.docRef.path).get()).data());
  const edit=async(date="2026-10-10")=>{await page.locator("#pumpEditAllBtn").click();await page.locator("[data-pump-saved-log]").filter({hasText:date}).locator("[data-pump-log-edit]").click();};
  const done=async()=>{assert.deepEqual(errors,[]);await context.close();};
  const editHistory=async()=>{await load("#/jobs");if(!await page.locator('[data-history-save="job-past"]').count()){await page.locator('[data-history-actions-toggle="job-past"]').click();await page.locator('[data-history-edit="job-past"]').click();}};
  const editExisting=async past=>{await load("#/jobs");if(past){if(!await page.locator('[data-history-save="job-past"]').count()){await page.locator('[data-history-actions-toggle="job-past"]').click();await page.locator('[data-history-edit="job-past"]').click();}}else if(!await page.locator('[data-save-job="job-active"]').count()){await page.locator('[data-job-actions-toggle="job-active"]').click();await page.locator('[data-edit-job="job-active"]').click();}};
  return{context,page,load,cloud,edit,editHistory,editExisting,done,errors};
 }
 for(const past of [false,true]){
  const label=past?"Historical":"Active",id=past?"job-past":"job-active",collection=past?"completedCuttingJobs":"cuttingJobs";
  const field=key=>past?`[data-history-field="${key}"][data-history-id="${id}"]`:`[data-j="${key}"][data-id="${id}"]`;
  const save=past?`[data-history-save="${id}"]`:`[data-save-job="${id}"]`;
  const row=past?`[data-history-row="${id}"]`:`[data-job-row="${id}"]`;
  const success=past?"History updated":"saved";
  const seed=async(h,mode)=>{await h.page.evaluate(async({collection,id,mode})=>{const ref=FB.docRef,state=(await ref.get()).data(),folder=state.jobFolders.find(f=>f.id==="b");folder.name="Mesquite 1242";folder.projectNumber=null;if(mode==="conflict")folder.projectNumber="1254";if(mode==="missing"){folder.name="Future Project";for(const job of [...state.cuttingJobs,...state.completedCuttingJobs].filter(j=>j.cat==="b"))delete job.projectNumber;}if(mode==="self")state[collection].find(j=>j.id===id).projectNumber="1242";if(mode==="legacy")delete state[collection].find(j=>j.id===id).projectNumber;if(["missing","conflict"].includes(mode))state.jobFolders.push({id:"safe",name:"1251 ATM",projectNumber:"1251",parent:"jobs_root",order:4});await ref.set(state);},{collection,id,mode});await h.page.reload();await h.page.waitForFunction(()=>window.__initialAdoptComplete);};
  await t.test(`${label} project reassignment to Mesquite 1242 waits for verification, closes and survives refresh`,async()=>{
   const h=await fixture(),p=h.page;await seed(h,"valid");const before=await h.cloud();await h.editExisting(past);
   await p.evaluate(({collection,id})=>{window.__editToasts=[];const original=toast;window.toast=msg=>{window.__editToasts.push(msg);original(msg);};const ref=FB.docRef,read=ref.get.bind(ref);ref.get=async(...args)=>{const snapshot=await read(...args);if(snapshot.data()[collection].find(j=>j.id===id).cat==="b")await new Promise(resolve=>window.__releaseCategory=resolve);return snapshot;};},{collection,id});
   const immediate=await p.locator(field("cat")).evaluate(select=>{select.value="b";select.dispatchEvent(new Event("change",{bubbles:true}));return select.isConnected&&select.value;});assert.equal(immediate,"b");assert.equal(await p.locator(field("projectNumber")).inputValue(),"1242");
   await p.locator(save).click();await p.waitForFunction(()=>!!window.__releaseCategory);assert.equal(await p.locator(save).isDisabled(),true);assert.equal(await p.evaluate(({collection,id})=>window[collection].find(j=>j.id===id).cat,{collection,id}),"a");assert.equal(await p.evaluate(success=>window.__editToasts.includes(success),success),false);
   await p.evaluate(()=>window.__releaseCategory());await p.waitForFunction(success=>window.__editToasts.includes(success),success);assert.equal(await p.locator(save).count(),0);assert.match(await p.locator(row).innerText(),/Mesquite 1242/);
   const after=await h.cloud(),job=after[collection].find(j=>j.id===id),old=before[collection].find(j=>j.id===id);assert.equal(job.cat,"b");assert.equal(job.projectNumber,"1242");for(const key of Object.keys(old).filter(k=>!["cat","projectNumber","cutChronologyHistory"].includes(k)))assert.deepEqual(job[key],old[key],key);
   for(const key of ["cuttingJobs","completedCuttingJobs"])assert.deepEqual(after[key].filter(j=>j.id!==id),before[key].filter(j=>j.id!==id));assert.deepEqual(after.jobFolders,before.jobFolders);assert.deepEqual(after.pumpEff,before.pumpEff);assert.equal(after[collection].filter(j=>j.id===id).length,1);
   await h.load("#/jobs");assert.deepEqual(withoutPreview(await p.evaluate(({collection,id})=>window[collection].find(j=>j.id===id),{collection,id})),job);assert.equal(await p.locator(save).count(),0);assert.match(await p.locator(row).innerText(),/Mesquite 1242/);await h.done();
  });
  await t.test(`${label} explicit reselection corrects only its own stale project; legacy missing projects can move`,async()=>{
   for(const mode of ["self","legacy"]){const h=await fixture(),p=h.page;await seed(h,mode);const before=await h.cloud();await h.editExisting(past);
    if(mode==="self"){assert.equal(await p.locator(field("projectNumber")).inputValue(),"1242");await p.locator(field("cat")).selectOption("b");await p.locator(field("cat")).selectOption("a");}else await p.locator(field("cat")).selectOption("b");
    const cat=mode==="self"?"a":"b",project=mode==="self"?"1254":"1242";assert.equal(await p.locator(field("projectNumber")).inputValue(),project);assert.deepEqual((await h.cloud())[collection],before[collection]);await p.locator(save).click();await p.locator(save).waitFor({state:"detached"});
    const after=await h.cloud();assert.equal(after[collection].find(j=>j.id===id).cat,cat);assert.equal(after[collection].find(j=>j.id===id).projectNumber,project);assert.deepEqual(after.jobFolders,before.jobFolders);for(const key of ["cuttingJobs","completedCuttingJobs"])assert.deepEqual(after[key].filter(j=>j.id!==id),before[key].filter(j=>j.id!==id));await h.load("#/jobs");assert.equal(await p.evaluate(({collection,id})=>window[collection].find(j=>j.id===id).projectNumber,{collection,id}),project);await h.done();}
  });
  await t.test(`${label} missing/conflicting category ownership gives corrective action without saving or discarding edits`,async()=>{
   for(const mode of ["missing","conflict"]){const h=await fixture(),p=h.page;await seed(h,mode);const before=await h.cloud();await h.editExisting(past);
    await p.evaluate(()=>{window.__editToasts=[];window.__categoryWrites=0;const original=toast;window.toast=msg=>{window.__editToasts.push(msg);original(msg);};const api=OMAXAtomicPersistence;window.OMAXAtomicPersistence={...api,save:async(...args)=>{window.__categoryWrites++;return api.save(...args);}};});
    await p.locator(field("name")).fill("Keep my unsaved edit");await p.locator(field("cat")).selectOption("b");assert.equal(await p.locator(field("projectNumber")).inputValue(),"");const status=p.locator(field("projectNumber")).locator("..").locator("[data-project-category-status]");assert.match(await status.innerText(),/Choose a category with verified project ownership/i);assert.match(await status.innerText(),/reviewed and corrected first/i);assert.match(await status.innerText(),mode==="missing"?/not set/i:/1254/);
    await p.locator(save).click();assert.equal(await p.locator(save).isEnabled(),true);assert.equal(await p.locator(field("cat")).inputValue(),"b");assert.equal(await p.locator(field("name")).inputValue(),"Keep my unsaved edit");assert.equal(await p.evaluate(()=>window.__categoryWrites),0);assert.equal(await p.evaluate(success=>window.__editToasts.includes(success),success),false);assert.match(await p.evaluate(()=>window.__editToasts.at(-1)),/nothing was saved/);const after=await h.cloud();assert.deepEqual(after,before);
    await p.locator(field("cat")).selectOption("safe");assert.equal(await p.locator(field("projectNumber")).inputValue(),"1251");assert.match(await status.innerText(),/Project Number follows Category/i);await h.done();}
  });
  await t.test(`${label} rejected and unverified saves retain edits without success`,async()=>{
   for(const mode of ["reject","mismatch"]){const h=await fixture(),p=h.page,before=await h.cloud();await h.editExisting(past);
    await p.evaluate(({collection,id,mode})=>{window.__editToasts=[];const original=toast;window.toast=msg=>{window.__editToasts.push(msg);original(msg);};if(mode==="reject"){window.OMAXAtomicPersistence={...window.OMAXAtomicPersistence,save:async()=>({saved:false,definiteFailure:true,stateWriteAttempted:false,error:"Fixture project save rejected"})};}else{const ref=FB.docRef,read=ref.get.bind(ref);ref.get=async(...args)=>{const snapshot=await read(...args),state=snapshot.data(),job=state[collection].find(j=>j.id===id);if(job.cat==="b"){job.cat="a";job.projectNumber="1254";return{...snapshot,data:()=>state};}return snapshot;};}},{collection,id,mode});
    await p.locator(field("cat")).selectOption("b");await p.locator(field("name")).fill("Keep failed project draft");await p.locator(save).click();await p.waitForFunction(()=>window.__editToasts.length>0);assert.equal(await p.locator(save).count(),1);assert.equal(await p.locator(field("cat")).inputValue(),"b");assert.equal(await p.locator(field("name")).inputValue(),"Keep failed project draft");assert.equal(await p.evaluate(success=>window.__editToasts.includes(success),success),false);assert.equal(await p.evaluate(({collection,id})=>window[collection].find(j=>j.id===id).cat,{collection,id}),"a");
    if(mode==="reject"){assert.deepEqual((await h.cloud())[collection],before[collection]);assert.equal(await p.locator(save).isEnabled(),true);}else{assert.equal(await p.evaluate(()=>window.__autosaveDisabled),true);assert.equal(await p.evaluate(()=>window.__cuttingJobDisplayUnconfirmed),true);}await h.done();}
  });
 }
 await t.test("historical category selection reaches verified save and survives reload",async()=>{
  const h=await fixture(),p=h.page,before=await h.cloud();await h.editHistory();
  await p.evaluate(()=>{window.__historyToasts=[];const original=toast;window.toast=msg=>{window.__historyToasts.push(msg);original(msg);};const ref=FB.docRef,read=ref.get.bind(ref);ref.get=async(...args)=>{const snapshot=await read(...args);if(snapshot.data().completedCuttingJobs.find(j=>j.id==="job-past").cat==="b")await new Promise(resolve=>window.__releaseHistory=resolve);return snapshot;};});
  const category=p.locator('[data-history-field="cat"][data-history-id="job-past"]');
  const immediate=await category.evaluate(select=>{select.value="b";select.dispatchEvent(new Event("change",{bubbles:true}));return document.querySelector('[data-history-field="cat"][data-history-id="job-past"]').value;});
  assert.equal(immediate,"b","category must not revert while waiting for the next animation frame");
  assert.equal(await category.inputValue(),"b");assert.equal(await p.locator('[data-history-field="projectNumber"][data-history-id="job-past"]').inputValue(),"1242");
  await p.locator('[data-history-save="job-past"]').click();await p.waitForFunction(()=>!!window.__releaseHistory);
  assert.equal(await p.locator('[data-history-save="job-past"]').isDisabled(),true);assert.equal(await p.evaluate(()=>window.completedCuttingJobs.find(j=>j.id==="job-past").cat),"a");assert.equal(await p.evaluate(()=>window.__historyToasts.includes("History updated")),false);
  await p.evaluate(()=>window.__releaseHistory());await p.waitForFunction(()=>window.__historyToasts.includes("History updated"));
  const job=(await h.cloud()).completedCuttingJobs.find(j=>j.id==="job-past");assert.equal(job.cat,"b");assert.equal(job.projectNumber,"1242");
  const old=before.completedCuttingJobs.find(j=>j.id==="job-past");for(const key of Object.keys(old).filter(key=>!["cat","projectNumber","cutChronologyHistory"].includes(key)))assert.deepEqual(job[key],old[key],key);
  const after=await h.cloud();assert.deepEqual(after.cuttingJobs,before.cuttingJobs);assert.deepEqual(after.completedCuttingJobs.filter(j=>j.id!=="job-past"),before.completedCuttingJobs.filter(j=>j.id!=="job-past"));assert.deepEqual(after.jobFolders,before.jobFolders);assert.deepEqual(after.pumpEff,before.pumpEff);assert.equal(after.completedCuttingJobs.filter(j=>j.id==="job-past").length,1);
  await h.load("#/jobs");assert.deepEqual(withoutPreview(await p.evaluate(()=>window.completedCuttingJobs.find(j=>j.id==="job-past"))),job);assert.match(await p.locator('[data-history-row="job-past"]').innerText(),/1242/);
  await p.evaluate(()=>{FB.user=null;FB.ready=false;renderSignedOut();});await h.load("#/jobs");assert.deepEqual(withoutPreview(await p.evaluate(()=>window.completedCuttingJobs.find(j=>j.id==="job-past"))),job);
  const reopened=await h.context.newPage();await reopened.goto(origin+"/?devsafe=1#/jobs");await reopened.waitForFunction(()=>window.__initialAdoptComplete);assert.deepEqual(withoutPreview(await reopened.evaluate(()=>window.completedCuttingJobs.find(j=>j.id==="job-past"))),job);await reopened.close();await h.done();
 });
 await t.test("history category rejects failed saves and invalid ownership without success or record changes",async()=>{
  const h=await fixture(),p=h.page,before=await h.cloud();await h.editHistory();
  await p.evaluate(()=>{window.__historyToasts=[];const original=toast;window.toast=msg=>{window.__historyToasts.push(msg);original(msg);};window.OMAXAtomicPersistence={...window.OMAXAtomicPersistence,save:async()=>({saved:false,definiteFailure:true,stateWriteAttempted:false,error:"Fixture history save rejected"})};});
  await p.locator('[data-history-field="cat"]').selectOption("b");await p.locator('[data-history-save="job-past"]').click();await p.waitForFunction(()=>window.__historyToasts.includes("Fixture history save rejected"));
  assert.equal(await p.locator('[data-history-field="cat"]').inputValue(),"b");assert.equal(await p.locator('[data-history-save="job-past"]').isEnabled(),true);assert.equal(await p.evaluate(()=>window.__historyToasts.includes("History updated")),false);assert.deepEqual((await h.cloud()).completedCuttingJobs,before.completedCuttingJobs);assert.deepEqual(withoutPreview(await p.evaluate(()=>window.completedCuttingJobs)),before.completedCuttingJobs);
  await h.editHistory();await p.evaluate(()=>{window.__historyToasts=[];const original=toast;window.toast=msg=>{window.__historyToasts.push(msg);original(msg);};});await p.locator('[data-history-field="cat"]').selectOption("b");await p.locator('[data-history-field="projectNumber"]').evaluate(el=>{el.value="1254";});await p.locator('[data-history-save="job-past"]').click();await p.waitForFunction(()=>window.__historyToasts.some(msg=>msg.includes("must agree")));assert.deepEqual((await h.cloud()).completedCuttingJobs,before.completedCuttingJobs);assert.equal(await p.locator('[data-history-save="job-past"]').count(),1);await h.load("#/jobs");assert.deepEqual(withoutPreview(await p.evaluate(()=>window.completedCuttingJobs)),before.completedCuttingJobs);await h.done();
 });
 await t.test("history category mismatched readback keeps recovery protections and never reports success",async()=>{
  const h=await fixture(),p=h.page;await h.editHistory();
  await p.evaluate(()=>{window.__historyToasts=[];const original=toast;window.toast=msg=>{window.__historyToasts.push(msg);original(msg);};const ref=FB.docRef,read=ref.get.bind(ref);ref.get=async(...args)=>{const snapshot=await read(...args),state=snapshot.data(),job=state.completedCuttingJobs.find(j=>j.id==="job-past");if(job.cat==="b"){job.cat="a";job.projectNumber="1254";return{...snapshot,data:()=>state};}return snapshot;};});
  await p.locator('[data-history-field="cat"]').selectOption("b");await p.locator('[data-history-save="job-past"]').click();await p.waitForFunction(()=>window.__autosaveDisabled===true&&window.__historyToasts.length>0);assert.equal(await p.evaluate(()=>window.__historyToasts.includes("History updated")),false);assert.equal(await p.evaluate(()=>window.__cuttingJobDisplayUnconfirmed),true);assert.equal(await p.evaluate(()=>window.completedCuttingJobs.find(j=>j.id==="job-past").cat),"a");await h.done();
 });
 await t.test("RPM table, header, inputs, focus and text selection remain readable in light and dark preferences",async()=>{
  const h=await fixture(),p=h.page;
  const contrast=async(selector,pseudo=null)=>p.locator(selector).first().evaluate((el,pseudo)=>{const style=getComputedStyle(el,pseudo);let background=style.backgroundColor;for(let parent=el.parentElement;parent&&background==="rgba(0, 0, 0, 0)";parent=parent.parentElement)background=getComputedStyle(parent).backgroundColor;const luminance=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};const a=luminance(style.color),b=luminance(background);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);},pseudo);
  for(const colorScheme of ["light","dark"]){
   await p.emulateMedia({colorScheme});await p.locator("#pumpEditAllBtn").click();
   for(const selector of [".pump-log-table td",".pump-log-table th",".pump-log-edit-header h3",".pump-log-edit-close"])assert.ok(await contrast(selector)>=4.5,`${colorScheme}: ${selector}`);
   await p.locator(".pump-log-table tbody tr").first().hover();assert.ok(await contrast(".pump-log-table td")>=4.5);assert.ok(await contrast(".pump-log-table td","::selection")>=4.5);
   if(process.env.OMAX_POLISH_SCREENSHOTS)await p.locator(".pump-log-dialog").screenshot({path:path.join(process.env.OMAX_POLISH_SCREENSHOTS,`POLISHv2-01E-table-${colorScheme}.png`)});
   await p.locator("[data-pump-log-edit]").first().click();
   for(const selector of [".pump-log-edit-subtitle",".pump-log-edit-label","#pumpEditRPM","#pumpEditDate","#pumpEditTime"])assert.ok(await contrast(selector)>=4.5,`${colorScheme}: ${selector}`);
   await p.locator("#pumpEditRPM").focus();assert.equal(await p.locator("#pumpEditRPM").evaluate(el=>getComputedStyle(el).outlineStyle),"solid");assert.ok(await contrast("#pumpEditRPM","::selection")>=4.5);
   if(process.env.OMAX_POLISH_SCREENSHOTS)await p.locator(".pump-log-dialog").screenshot({path:path.join(process.env.OMAX_POLISH_SCREENSHOTS,`POLISHv2-01E-inputs-${colorScheme}.png`)});
   await p.locator(".pump-log-edit-close").click();
  }await h.done();
 });
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
  await p.waitForFunction(()=>document.activeElement===document.querySelector("[data-category-name]"));await p.locator("[data-category-name]").fill("New project");await p.locator("[data-category-project]").fill("1432");await p.locator("[data-category-create-color]").fill("#b34567");await p.locator("[data-confirm-confirm]").click();await p.locator("[data-category-name]").waitFor({state:"hidden"}).catch(async error=>{console.log("CATEGORY DIAGNOSTIC",await p.evaluate(()=>({name:document.querySelector("[data-category-name]")?.value,project:document.querySelector("[data-category-project]")?.value,error:document.querySelector("[data-category-error]")?.textContent,folders:window.jobFolders})));throw error;});
  await p.waitForFunction(()=>window.jobFolders.some(f=>f.projectNumber==="1432"));const made=await p.evaluate(()=>window.jobFolders.find(f=>f.projectNumber==="1432"));assert.equal(made.color,"#B34567");await p.waitForFunction(()=>document.querySelector("#jobName")?.value==="Unsaved dimensions");await p.evaluate(()=>renderJobs());assert.equal(await p.locator("#jobCategory").inputValue(),made.id);assert.equal(await p.locator("#jobName").inputValue(),"Unsaved dimensions");
  await p.locator("#jobCategory").selectOption("a");await p.evaluate(()=>renderJobs());assert.equal(await p.locator("#jobCategory").inputValue(),"a");assert.equal(await p.locator("#jobProjectNumber").inputValue(),"1254");
  await p.locator("#jobCategory").selectOption(made.id);await p.evaluate(()=>renderJobs());assert.equal(await p.locator("#jobCategory").inputValue(),made.id);
  await p.locator("#jobCategory").selectOption("__new__");await p.locator("[data-confirm-cancel]").click();await p.evaluate(()=>renderJobs());assert.equal(await p.locator("#jobCategory").inputValue(),made.id);
  await p.locator("#jobCategory").selectOption("__new__");await p.waitForFunction(()=>document.activeElement===document.querySelector("[data-category-name]"));await p.locator("[data-category-name]").fill("Wrong owner");await p.locator("[data-category-project]").fill("1254");await p.locator("[data-confirm-confirm]").click();assert.equal(await p.locator("[data-category-name]").isVisible(),true);assert.ok(await p.locator("[data-category-error]").innerText());await p.locator("[data-confirm-cancel]").click();
  await h.load();await p.evaluate(()=>triggerDashboardAddPicker({}));await p.locator('[data-choice="job"]').click();await p.locator("#dashJobCategory").selectOption("__new__");
  await p.waitForFunction(()=>document.activeElement===document.querySelector("[data-category-name]"));await p.locator("[data-category-name]").fill("Dashboard project");await p.locator("[data-category-project]").fill("1433");await p.locator("[data-category-create-color]").fill("#226688");await p.locator("[data-confirm-confirm]").click();
  await p.locator("[data-category-name]").waitFor({state:"hidden"}).catch(async error=>{console.log("DASH CATEGORY DIAGNOSTIC",await p.evaluate(()=>({name:document.querySelector("[data-category-name]")?.value,project:document.querySelector("[data-category-project]")?.value,error:document.querySelector("[data-category-error]")?.textContent,folders:window.jobFolders})));throw error;});const dash=await p.evaluate(()=>window.jobFolders.find(f=>f.projectNumber==="1433"));assert.equal(await p.locator("#dashJobCategory").inputValue(),dash.id);assert.equal(dash.color,"#226688");
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
