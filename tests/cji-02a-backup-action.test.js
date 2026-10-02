"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const download=require("../js/cuttingJobImportDownload"),importer=require("../js/cuttingJobImporter")();
const core=fs.readFileSync("js/core.js","utf8"),start=core.indexOf("(function installCuttingJobImporterAdmin(){"),installer=core.slice(start,core.indexOf("\n})();",start)+6);
const row={import_event_id:"cji02a",record_status:"active",job_name:"Fixture cut",project_number:"1242",category:"Mesquite",material:"Steel",thickness_inches:"0.25",path_length_ft:"4",path_width_ft:"2",review_status:"reviewed"};
const material={id:"steel",name:"Steel",density:.283,pricePerLb:.8};
function browserFixture(options={}){
  const trace=[],urls=new Set(),timers=[],browser={Blob,navigator:{userActivation:{isActive:true}},URL:{createObjectURL:blob=>{assert.ok(blob.size);trace.push("blob");urls.add("blob:fixture");return"blob:fixture";},revokeObjectURL:url=>{trace.push("revoke");urls.delete(url);}},document:{body:{appendChild:()=>trace.push("append")},createElement:()=>({click(){trace.push("download");assert.equal(browser.navigator.userActivation.isActive,true);if(options.fail)throw Error("browser blocked download");},remove:()=>trace.push("remove")})},setTimeout:fn=>{timers.push(fn);return timers.length;}};
  return{browser,trace,urls,timers};
}
class Element{
  constructor(){this.listeners={};this.dataset={};this.disabled=false;this.checked=false;this.open=false;this.textContent="";this.innerHTML="";}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  emit(name,event={isTrusted:true,preventDefault(){}}){return Promise.all((this.listeners[name]||[]).map(fn=>fn(event)));}
  showModal(){this.open=true;}close(){this.open=false;}focus(){}
}
async function harness(options={}){
  const fixture=browserFixture(options),ids=["Admin","Close","File","Preview","Reviewed","Run","Status","Rows","Confirm","ConfirmRun","ConfirmCancel","ConfirmMessage"],elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
  const state={cuttingJobs:[],completedCuttingJobs:[],inventory:[{id:"keep"}],maintenanceTasksV2:[{id:"safe"}],pumpEff:{entries:[{rpm:3000}]}},folders=[{id:"jobs_root",name:"All Jobs",parent:null,order:1}],receipts=new WeakMap(),calls=[],progress=[];
  let saves=0,baseline=JSON.stringify(state);
  const api=importer.createApi({xlsx:null,state:()=>state,categories:()=>folders,materials:()=>[material],materialSettings:()=>({materials:[material],wasteFactor:10}),authenticatedBaseline:()=>true,
    revalidateBaseline:async()=>{calls.push("read");fixture.browser.navigator.userActivation.isActive=false;if(options.readError)throw Error("cloud read rejected");return!options.stale;},
    backup:async({backupReceipt})=>{calls.push("backup");assert.equal(backupReceipt.triggerStarted,true);assert.ok(receipts.has(backupReceipt));return options.backup!==false;},
    createCategory:name=>{const folder={id:"mesquite",name,parent:"jobs_root",order:2};folders.push(folder);return folder;},removeCategories:ids=>{for(let i=folders.length-1;i>=0;i--)if(ids.includes(folders[i].id))folders.splice(i,1);},
    saveCloudNow:async args=>{saves++;assert.equal(args.expectedRevision,1);if(options.gate)await options.gate;return options.save||{saved:true,stateWriteAttempted:true,stateWriteCompleted:true};},verifyCloud:async()=>true,suspend:()=>calls.push("suspend")});
  const actualSubmit=api.submit,window={CuttingJobImporter:importer,CuttingJobImportDownload:download,cuttingJobImporter:api};
  if(options.submitError)window.cuttingJobImporter={...api,submit:async()=>{throw Error("unexpected submit rejection");}};
  const context=vm.createContext({window,document:{getElementById:id=>elements[id.replace("cuttingJobImport","")]||null,addEventListener(){}},requestAnimationFrame:fn=>fn(),cuttingJobImportBackupReceipts:receipts,
    prepareCuttingJobImportBackup:async()=>{if(options.prepareError)throw Error("backup Blob preparation failed");return{revision:1,validate(){if(JSON.stringify(state)!==baseline)throw Error("stale prepared backup");},download:download.prepare("backup.json",state,fixture.browser)};}});
  vm.runInContext(installer,context);
  elements.File.files=[{name:"jobs.json",text:async()=>JSON.stringify([row])}];
  // Record deterministic status assignments; no observer is necessary for progress.
  let status="";Object.defineProperty(elements.Status,"textContent",{get:()=>status,set:value=>{status=value;progress.push(value);}});
  await elements.Preview.emit("click");elements.Reviewed.checked=true;await elements.Reviewed.emit("change");await elements.Run.emit("click");
  return{elements,state,folders,calls,progress,fixture,get saves(){return saves;},click:()=>elements.ConfirmRun.emit("click"),actualSubmit};
}

test("backup is a valid JSON Blob with an object URL before the trusted final click",()=>{
  const f=browserFixture(),prepared=download.prepare("backup.json",{key:"0000"},f.browser);assert.deepEqual(f.trace,["blob"]);
  const receipt=prepared.trigger({isTrusted:true});assert.equal(receipt.triggerStarted,true);assert.match(receipt.acceptance,/not observable/);assert.ok(f.urls.size);assert.deepEqual(f.trace,["blob","append","download","remove"]);
  prepared.dispose();assert.ok(f.urls.size);f.timers[0]();assert.equal(f.urls.size,0);
});
test("unused preview backup is revoked immediately and cannot be reused",()=>{const f=browserFixture(),p=download.prepare("backup.json",{},f.browser);p.dispose();assert.equal(f.urls.size,0);assert.throws(()=>p.trigger({isTrusted:true}),/no longer ready/);});
test("untrusted clicks and expired activation cannot start a backup",()=>{
  for(const [trusted,active]of [[false,true],[true,false]]){const f=browserFixture();f.browser.navigator.userActivation.isActive=active;const p=download.prepare("backup.json",{},f.browser);assert.throws(()=>p.trigger({isTrusted:trusted}),/fresh confirmation/);assert.equal(f.trace.includes("download"),false);p.dispose();}
});
test("download exceptions propagate and schedule safe URL cleanup",()=>{const f=browserFixture({fail:true}),p=download.prepare("backup.json",{},f.browser);assert.throws(()=>p.trigger({isTrusted:true}),/blocked download/);assert.ok(f.trace.includes("remove"));f.timers[0]();assert.equal(f.urls.size,0);});
test("normal UI click with no watchers downloads before async cloud validation and saves once",async()=>{
  const h=await harness(),before=structuredClone({inventory:h.state.inventory,maintenance:h.state.maintenanceTasksV2,pump:h.state.pumpEff});
  assert.equal(h.elements.Run.disabled,false);assert.equal(h.elements.Confirm.open,true);await h.click();
  assert.equal(h.saves,1);assert.equal(h.state.cuttingJobs.length,1);assert.equal(h.state.cuttingJobs[0].cat,"mesquite");assert.equal(h.fixture.trace.filter(x=>x==="download").length,1);
  assert.match(h.elements.Status.textContent,/Import complete/);assert.deepEqual({inventory:h.state.inventory,maintenance:h.state.maintenanceTasksV2,pump:h.state.pumpEff},before);
  for(const stage of ["Preparing backup…","Downloading backup…","Validating current cloud revision…","Staging reviewed jobs…","Saving…","Verifying…"])assert.ok(h.progress.includes(stage),stage);
});
test("backup trigger failure visibly stops before any save and controls recover",async()=>{
  const h=await harness({fail:true});await h.click();assert.equal(h.saves,0);assert.deepEqual(h.calls,[]);assert.equal(h.state.cuttingJobs.length,0);assert.equal(h.folders.length,1);
  assert.match(h.elements.Status.textContent,/Import stopped.*Downloading backup.*blocked download/);assert.equal(h.elements.Preview.disabled,false);assert.equal(h.elements.Close.disabled,false);assert.equal(h.elements.Run.disabled,true);
});
test("backup preparation error is visible before confirmation can be enabled",async()=>{const h=await harness({prepareError:true});assert.match(h.elements.Status.textContent,/Import stopped.*preparing backup.*Blob preparation failed/);assert.equal(h.elements.Run.disabled,true);assert.equal(h.elements.Preview.disabled,false);assert.equal(h.saves,0);});
test("a rejected mandatory backup acknowledgement blocks staging and save",async()=>{const h=await harness({backup:false});await h.click();assert.match(h.elements.Status.textContent,/Import stopped.*Validating prepared backup.*Mandatory backup step failed/);assert.equal(h.saves,0);assert.equal(h.folders.length,1);assert.equal(h.state.cuttingJobs.length,0);});
test("two simultaneous final clicks cannot trigger two downloads or imports",async()=>{
  let release;const gate=new Promise(resolve=>release=resolve),h=await harness({gate});const pending=h.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.elements.Run.disabled,true);await h.click();assert.equal(h.saves,1);release();await pending;assert.equal(h.fixture.trace.filter(x=>x==="download").length,1);
});
test("thrown async baseline read is visible and permits a new preview",async()=>{const h=await harness({readError:true});await h.click();assert.match(h.elements.Status.textContent,/Import stopped.*Validating current cloud revision.*cloud read rejected/);assert.equal(h.saves,0);assert.equal(h.elements.Preview.disabled,false);});
test("unexpected submit rejection is visible and conservatively suspends",async()=>{const h=await harness({submitError:true});await h.click();assert.match(h.elements.Status.textContent,/Import suspended.*unexpected submit rejection/);assert.equal(h.elements.Run.disabled,true);assert.equal(h.elements.Preview.disabled,true);});
test("indeterminate write preserves evidence and disables retry",async()=>{
  const h=await harness({save:{saved:false,stateWriteAttempted:true,stateWriteCompleted:false,indeterminate:true}});await h.click();assert.equal(h.saves,1);assert.equal(h.state.cuttingJobs.length,1);assert.equal(h.folders.length,2);assert.ok(h.calls.includes("suspend"));assert.match(h.elements.Status.textContent,/Import suspended/);assert.equal(h.elements.Close.disabled,false);await h.click();assert.equal(h.saves,1);
});
test("stale cloud revision still stops before staging or save",async()=>{const h=await harness({stale:true});await h.click();assert.equal(h.saves,0);assert.equal(h.state.cuttingJobs.length,0);assert.match(h.elements.Status.textContent,/Import stopped.*baseline revalidation/);});
test("local review drift stops before the download",async()=>{const h=await harness();h.state.inventory.push({id:"concurrent"});await h.click();assert.equal(h.fixture.trace.includes("download"),false);assert.equal(h.saves,0);assert.match(h.elements.Status.textContent,/stale prepared backup/);});
test("receipt cannot be forged or reused in the production backup adapter",async()=>{
  const section=core.slice(core.indexOf("  backup:async({backupReceipt}"),core.indexOf("  verifyCloud:async",core.indexOf("window.cuttingJobImporter ="))),receipts=new WeakMap(),baseline={syncMeta:{rev:1}},context=vm.createContext({cuttingJobImportBackupReceipts:receipts,readCuttingJobImportCloudState:async()=>baseline,stableStringify:JSON.stringify,window:{__cjiAuthoritativeBaseline:baseline},localStorage:{getItem:()=>null}});
  vm.runInContext(`this.backup=({${section}}).backup`,context);await assert.rejects(context.backup({backupReceipt:{triggerStarted:true}}),/Mandatory backup/);
  const receipt={triggerStarted:true};receipts.set(receipt,{baselineSignature:JSON.stringify(baseline),materialSettingsRaw:null});assert.equal(await context.backup({backupReceipt:receipt}),true);await assert.rejects(context.backup({backupReceipt:receipt}),/Mandatory backup/);
});
test("bounded cloud read times out visibly without an external poller",async()=>{
  const section=core.slice(core.indexOf("async function readCuttingJobImportCloudState"),core.indexOf("async function prepareCuttingJobImportBackup"));let callback,cleared=false;
  const context=vm.createContext({readCurrentCloudStateReadOnly:()=>new Promise(()=>{}),setTimeout:fn=>{callback=fn;return 1;},clearTimeout:()=>{cleared=true;}});vm.runInContext(section+";this.read=readCuttingJobImportCloudState",context);const pending=context.read();callback();await assert.rejects(pending,/30 seconds/);assert.equal(cleared,true);
});
test("visible errors are bounded and do not expose URLs",()=>{assert.equal(download.boundedError(Error("https://secret.example/token "+"x".repeat(500))).length,240);assert.equal(download.boundedError(Error("https://secret.example/token")).includes("secret.example"),false);});
