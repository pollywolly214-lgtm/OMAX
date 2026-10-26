"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {harness}=require("./mhist-harness.cjs"),{rich,legacy}=require("./fixtures/rfs02b-maintenance"),cancellation=require("../js/maintenanceCalendarCancellation"),identity=require("../js/globalIdentityRepair");
const script=fs.readFileSync("docs/mhist-01c-read-only-diagnostic.js","utf8"),clone=structuredClone;
async function run(options={}){
  const source=cancellation.plan(rich(),legacy("all"),{id:"diagnostic-cancellation",actorUid:"fixture",atISO:"2026-10-21T17:00:00Z"}).state,h=harness(source),window=h.window;
  Object.assign(window,{__lastLoadedCloudState:clone(source),__loadedCloudRevisionForSaveGuard:source.syncMeta.rev,__recoveryInspectMode:false,__autosaveDisabled:false,__initialAdoptComplete:true,__cloudLoadAttemptComplete:true,
    OMAXGlobalIdentityRepair:identity,maintenanceCalendarCancellationApi:{run:()=>{throw Error("Diagnostic must not cancel");}},maintenanceTaskDeletionApi:{restore:()=>{throw Error("Diagnostic must not restore");}}});
  let reads=0,writes=0;const storage=Object.create(null);storage.backup="retain original backup";
  Object.defineProperties(storage,{getItem:{value:name=>storage[name]??null},setItem:{value:()=>{throw Error("No storage writes");}}});
  const authoritative=clone(source);options.server?.(authoritative);options.browser?.(window);
  const FB={ready:!options.noBackend,user:{uid:"fixture"},app:{options:{projectId:"fixture"}},docRef:{path:"fixture/app/state"}};
  FB.db={runTransaction:async callback=>callback({get:async()=>{reads++;return{exists:true,data:()=>authoritative,metadata:{fromCache:false,hasPendingWrites:false},ref:{path:FB.docRef.path,firestore:FB.db}};},set(){writes++;throw Error("No writes");},update(){writes++;throw Error("No updates");},delete(){writes++;throw Error("No deletes");}})};
  Object.assign(h.context,{FB,localStorage:storage,hasPendingLocalChanges:false,openMaintenanceTaskHistory:()=>{},readMaintenanceTaskAuthoritativeState:()=>{throw Error("Only the diagnostic's own get is allowed");},console:{table(){},log(){}}});
  if(options.duplicate)vm.runInContext("const originalHistory=buildMaintenanceTaskHistory;buildMaintenanceTaskHistory=(...args)=>{const rows=originalHistory(...args);return rows.length?[...rows,rows[0]]:rows;};",h.context);
  const before=JSON.stringify({source:window.__lastLoadedCloudState,inventory:window.inventory,storage}),report=await vm.runInContext(script,h.context);
  assert.equal(writes,0);assert.equal(JSON.stringify({source:window.__lastLoadedCloudState,inventory:window.inventory,storage}),before);
  return {report,reads};
}
test("F12 performs one read-only get, ignores property-key order and preserves browser evidence",async()=>{
  const reverse=value=>value&&typeof value==="object"?Array.isArray(value)?value.map(reverse):Object.fromEntries(Object.entries(value).reverse().map(([key,value])=>[key,reverse(value)])):value;
  const {report,reads}=await run({server:s=>Object.assign(s,reverse(s))});assert.equal(reads,1);assert.equal(report.overall,"PASS",JSON.stringify(report.checks));
  assert.equal(report.checks.find(row=>row.check==="Calendar/History reconciliation").status,"PASS");
});
test("F12 does not certify unavailable authoritative reads",async()=>{
  const {report,reads}=await run({noBackend:true});assert.equal(reads,0);assert.equal(report.overall,"WARNING");
  assert.equal(report.checks.find(row=>row.check==="Authoritative verification").status,"WARNING");assert.equal(report.checks.some(row=>row.check==="Server/loaded revision"&&row.status==="PASS"),false);
});
for(const [name,options]of [["revision drift",{browser:s=>s.__loadedCloudRevisionForSaveGuard++}],["array mismatch",{server:s=>s.inventory[0].qty++}],["genuine Recovery Mode",{browser:s=>s.__recoveryInspectMode=true}],["invalid ledger",{server:s=>s.tasksInterval[0].calendarCancellations[0].legacyTaskId="missing"}],["duplicate history identity",{duplicate:true}]])test("F12 reports FAIL for "+name,async()=>{assert.equal((await run(options)).report.overall,"FAIL");});
