"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const atomic=require("../js/atomicPersistence"),firewall=require("../js/cuttingFileContentFirewall"),identity=require("../js/globalIdentityRepair");
const core=fs.readFileSync("js/core.js","utf8"),pump=fs.readFileSync("js/pump.js","utf8"),clone=value=>JSON.parse(JSON.stringify(value));
const section=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const model=section(pump,"/* PRB baseline model","/* End PRB baseline model. */");
const logModel=section(pump,"/* POLISHv2: one exact measurement", "/* End POLISHv2 measurement model. */");
const retention=section(core,"/* PRB nested retention","function mergePumpEffForSave");
const merging=section(core,"function mergePumpEffForSave","function getTrackedStateSignature");
const baseline=(id,date,rpm)=>({id,effectiveDateISO:date,rpm,rebuildRef:null,createdAtISO:"2026-06-01T12:00:00.000Z",createdBy:"fixture",corrections:[],unknown:{keep:true}});
const initial=()=>({schema:72,syncMeta:{rev:7,retained:"keep"},saveMeta:{keep:"exact"},
  pumpEff:{baselineRPM:3480,baselineDateISO:"2026-06-01",entries:[{dateISO:"2026-07-15",rpm:3600.4,timeISO:"09:23",id:"reading-keep",provenance:{keep:true}}],
    notes:[{dateISO:"2026-07-15",text:"  preserve spaces  ",range:"all",updatedISO:"2026-07-15T00:00:00Z",custom:"keep"}],unknownPump:{keep:true}},
  inventory:[{id:"inventory-keep",qtyNew:3}],tasksInterval:[{id:"rebuild-task",name:"Pump Rebuild",completedDates:["2026-06-01"],manualHistory:[{dateISO:"2026-06-01",import_event_id:"rebuild-import-keep"}]}],
  tasksAsReq:[],maintenanceTasksV2:[],maintenanceCalendarInstancesV2:[],maintenanceOccurrencesV2:[],dailyCutHours:[{dateISO:"2020-01-01",hours:2}],totalHistory:[],unknownBusiness:{keep:[1,2]}});
const create=(date="2026-09-20",rpm=3515)=>({kind:"create",rpm,effectiveDateISO:date});
function harness(options={}){
  let cloud=clone(options.initial||initial()),local=clone(cloud),commits=0,reads=0,preflights=0,ids=0,adoptions=0,diagnostics=0;
  const window={pumpEff:local.pumpEff,OMAXAtomicPersistence:atomic,CuttingFileContentFirewall:firewall,__cloudLoadAttemptComplete:true,__initialAdoptComplete:true,
    __loadedCloudRevisionForSaveGuard:cloud.syncMeta.rev,__lastLoadedCloudState:clone(cloud),addEventListener(){}};
  const docRef={path:"fixture/app/state"};
  const db={async runTransaction(callback){
    let pending,mask;
    const result=await callback({get:async()=>{
      if(options.stale&&commits===0&&reads===1)cloud.syncMeta.rev++;
      return {exists:true,data:()=>clone(cloud)};
    },set:(ref,next,setOptions)=>{pending=clone(next);mask=setOptions;}});
    if(pending){
      if(options.reject)throw Object.assign(Error("permission denied"),{code:"permission-denied"});
      if(options.indeterminate)throw Error("connection lost after queue");
      assert.deepEqual(clone(mask),{mergeFields:["pumpEff","syncMeta"]});
      cloud={...cloud,pumpEff:pending.pumpEff,syncMeta:pending.syncMeta};commits++;
    }else{
      reads++;
      if(reads===2&&options.readFailure)throw Error("backend read failed");
      if(reads===2&&options.afterRead)options.afterRead(result,local,cloud);
    }
    return result;
  }};
  const c=vm.createContext({window,Date,console,Map,Set,FB:{ready:true,user:{uid:"actor-fixture"},db,docRef},
    cloneStructured:clone,stableStringifyForIntegrity:identity.key,stableStringify:identity.key,normalizeDateISO:value=>value||null,
    getCloudSyncClientId:()=>"client-fixture",genId:prefix=>prefix+"_"+(++ids),blockCloudSave:()=>false,
    isRecoveryMode:()=>!!window.__recoveryInspectMode,isVercelPreviewRuntime:()=>!!options.preview,
    scanAuthoritativeCutFileContent:firewall.scanCuttingFileContent,estimatePayloadBytes:value=>Buffer.byteLength(JSON.stringify(value)),FIRESTORE_BLOCK_BYTES:975000,
    validateCuttingJobDeletionSave:()=>({valid:true}),validateCuttingJobHistoryRestoreSave:()=>({valid:true}),cuttingJobDeletionSafetyBaseline:value=>value,
    readLocalStateBackup:()=>null,buildWindowProtectedStateForCoverage:()=>local,getSaveSchemaCoverageReport:()=>({}),
    validateProtectedSavePreflight:()=>{preflights++;return {blocked:!!options.protectedFailure};},detectDangerousProtectedFieldReduction:()=>({blocked:false}),
    mergeTotalHistoryForSave:value=>value,mergeDailyCutHoursForSave:value=>value,
    checkAuthoritativeIdentityIntegrity:identity.integrity,getInventoryIdentityRepairLocalState:()=>clone(local),
    renderRecoveryDiagnosticsPanel:()=>diagnostics++,persistLocalStateBackup:()=>{},reportCloudSaveSecondaryError:(result)=>result,
    adoptIdentityCheckedAuthoritativeState:state=>{
      if(options.adoptionFailure)return {loaded:true,recovery:true};
      local=clone(state);window.pumpEff=local.pumpEff;window.__lastLoadedCloudState=clone(state);window.__loadedCloudRevisionForSaveGuard=state.syncMeta.rev;adoptions++;
      return {loaded:true,recovery:false};
    }});
  vm.runInContext("let cloudSaveQueue=Promise.resolve(),hasPendingLocalChanges=false,lastLocalMutationAt=0;const inventoryIdentityRepairAuthorizations=new Map();"+
    model+logModel+retention+merging+section(core,"function canWriteCloud","let CUTTING_BASELINE_WEEKLY_HOURS")+
    section(core,"async function writeAuthoritativeStateSnapshot","function getInventoryIdentityRepairLocalState")+
    section(core,"async function readInventoryMaterialAuthoritativeState","let inventoryMaterialOwnedSuspension")+
    section(core,"function cloudSaveNoWriteFailure","async function performCloudSave")+
    section(core,"/* PRB verified baseline action","/* End PRB verified baseline action. */")+
    section(core,"/* POLISHv2 verified measurement action", "/* End POLISHv2 verified measurement action. */")+
    "this.pending=value=>hasPendingLocalChanges=value;this.drift=()=>lastLocalMutationAt++;",c);
  if(options.writeResult){const writer=c.writeAuthoritativeStateSnapshot;c.writeAuthoritativeStateSnapshot=async(...args)=>{const result=await writer(...args);options.writeResult(result);return result;};}
  return {c,window,save:action=>c.savePumpLogChange(action),get cloud(){return clone(cloud);},get local(){return clone(local);},get commits(){return commits;},get reads(){return reads;},get adoptions(){return adoptions;},get diagnostics(){return diagnostics;},get preflights(){return preflights;},
    reload(){local=clone(cloud);window.pumpEff=local.pumpEff;window.__lastLoadedCloudState=clone(cloud);window.__loadedCloudRevisionForSaveGuard=cloud.syncMeta.rev;},alter:fn=>fn(local,cloud)};
}

const logEdit=(source,extra={})=>({kind:"edit",original:clone(source.pumpEff.entries[0]),dateISO:"2026-08-03",rpm:3721,timeISO:"10:24",...extra});
const logCreate=(extra={})=>({kind:"create",id:"new-log",dateISO:"2026-08-03",rpm:3721,timeISO:"10:24",...extra});
test("RPM/date correction preserves ID, metadata, every unrelated log, baseline history and all other state across reload",async()=>{
 const source=initial();source.pumpEff.baselineHistory=[baseline("baseline-keep","2026-06-01",3480)];source.pumpEff.entries.push({id:"other-log",dateISO:"2026-08-05",rpm:3800.6,custom:[1,2]});
 const h=harness({initial:source}),r=await h.save(logEdit(source));assert.equal(r.saved,true,JSON.stringify(r));assert.equal(r.verificationCompleted,true);assert.equal(h.commits,1);assert.equal(h.reads,2);
 const expected=clone(source);Object.assign(expected.pumpEff.entries[0],{dateISO:"2026-08-03",rpm:3721,timeISO:"10:24"});expected.syncMeta=h.cloud.syncMeta;
 assert.deepEqual(h.cloud,expected);assert.equal(h.cloud.pumpEff.entries.length,2);assert.equal(h.cloud.pumpEff.entries[0].id,"reading-keep");h.reload();assert.deepEqual(h.local,h.cloud);
 const updated=logEdit(h.local,{dateISO:"2026-08-07",rpm:3740});assert.equal((await h.save(updated)).saved,true);assert.equal(h.cloud.pumpEff.entries.length,2);assert.equal(h.cloud.pumpEff.entries.filter(e=>e.id==="reading-keep").length,1);
});
test("legacy id-less measurements are corrected in place without an identity migration",async()=>{
 const source=initial();delete source.pumpEff.entries[0].id;const h=harness({initial:source});const r=await h.save(logEdit(source));assert.equal(r.saved,true,JSON.stringify(r));assert.equal(h.cloud.pumpEff.entries.length,1);assert.equal(Object.hasOwn(h.cloud.pumpEff.entries[0],"id"),false);
});
test("create is independently verified and then edits keep its generated ID without duplicates",async()=>{
 const h=harness();assert.equal((await h.save(logCreate())).saved,true);h.reload();const created=h.local.pumpEff.entries.find(e=>e.id==="new-log");assert.ok(created);
 assert.equal((await h.save({kind:"edit",original:created,dateISO:"2026-08-04",rpm:3900,timeISO:"11:25"})).saved,true);assert.equal(h.cloud.pumpEff.entries.filter(e=>e.id==="new-log").length,1);
});
for(const [name,mutate]of [["invalid date",a=>a.dateISO="2026-02-30"],["nonfinite RPM",a=>a.rpm=Infinity],["zero RPM",a=>a.rpm=0],["invalid time",a=>a.timeISO="25:88"],["stale original",a=>a.original.rpm++],["missing identity",a=>a.original.id="missing"]])test(name+" rejects without a write or optimistic adoption",async()=>{
 const h=harness(),before=h.local,a=logEdit(before);mutate(a);assert.equal((await h.save(a)).saved,false);assert.equal(h.commits,0);assert.deepEqual(h.local,before);
});
test("moving onto an existing day and duplicate creation cannot overwrite another log",async()=>{
 const source=initial();source.pumpEff.entries.push({id:"other",dateISO:"2026-08-03",rpm:3800,timeISO:"12:00"});const h=harness({initial:source});assert.equal((await h.save(logEdit(source))).saved,false);assert.equal((await h.save(logCreate())).saved,false);assert.deepEqual(h.cloud,source);assert.equal(h.commits,0);
});
test("ambiguous legacy dates fail closed instead of editing either record",async()=>{
 const source=initial();delete source.pumpEff.entries[0].id;source.pumpEff.entries.push({...source.pumpEff.entries[0],rpm:3800});const h=harness({initial:source});assert.equal((await h.save(logEdit(source))).saved,false);assert.equal(h.commits,0);
});
for(const [name,options]of [["permission rejection",{reject:true}],["stale CAS",{stale:true}],["protected preflight",{protectedFailure:true}],["preview read-only",{preview:true}]])test(name+" leaves saved and displayed measurements intact",async()=>{
 const h=harness(options),before=h.local,r=await h.save(logEdit(before));assert.equal(r.saved,false);assert.equal(h.commits,0);assert.deepEqual(h.local,before);assert.equal(h.adoptions,0);
});
for(const [name,options]of [
 ["readback RPM mismatch",{afterRead:e=>e.state.pumpEff.entries[0].rpm++}],
 ["readback revision mismatch",{afterRead:e=>e.state.syncMeta.rev++}],
 ["unrelated readback mutation",{afterRead:e=>e.state.inventory[0].qtyNew++}],
 ["missing readback state",{afterRead:e=>delete e.state}],
 ["read failure",{readFailure:true}],
 ["local drift",{afterRead:(e,local)=>local.inventory[0].qtyNew++}],
 ["wrong acknowledgement",{writeResult:r=>r.committedState.pumpEff.entries[0].rpm++}],
 ["adoption rejection",{adoptionFailure:true}]
])test(name+" reports uncertainty, retains local measurements and blocks blind retry",async()=>{
 const h=harness(options),before=h.local,r=await h.save(logEdit(before));assert.equal(r.saved,false);assert.equal(r.indeterminate,true);assert.equal(h.commits,1);assert.equal(h.adoptions,0);assert.deepEqual(h.local.pumpEff,before.pumpEff);assert.ok(h.window.__lastPumpLogMutationEvidence);assert.equal((await h.save(logEdit(before))).saved,false);assert.equal(h.commits,1);
});
test("unknown transaction outcome never adopts or automatically retries",async()=>{const h=harness({indeterminate:true}),r=await h.save(logEdit(h.local));assert.equal(r.saved,false);assert.equal(r.indeterminate,true);assert.equal(h.commits,0);assert.equal(h.adoptions,0);});
test("overlapping log and baseline operations are blocked while readback owns adoption",async()=>{
 const h=harness(),a=logEdit(h.local),first=h.save(a);assert.equal((await h.save(a)).saved,false);assert.equal((await h.c.savePumpBaseline(create())).saved,false);assert.equal((await first).saved,true);assert.equal(h.commits,1);
});
test("prepared pump tampering is rejected by the scoped writer before commit",async()=>{
 const h=harness(),writer=h.c.writeAuthoritativeStateSnapshot;h.c.writeAuthoritativeStateSnapshot=(state,...args)=>{state.pumpEff.notes[0].text="tampered";return writer(state,...args);};
 assert.equal((await h.save(logEdit(h.local))).saved,false);assert.equal(h.commits,0);
});
test("render-time time fallback does not mutate legacy or unrelated measurement evidence",()=>{
 const entries=[{dateISO:"2026-01-01",rpm:3600},{dateISO:"2026-01-02",rpm:3700,time:"09:23",unknown:true}],before=clone(entries),c=vm.createContext({window:{pumpEff:{entries}},Date});
 vm.runInContext('const PUMP_DEFAULT_MEASUREMENT_TIME="12:00";'+section(pump,"function pumpNormalizeTimeValue","function pumpCompareEntriesDesc"),c);
 assert.equal(c.pumpGetEntryTimeISO(entries[0]),"12:00");assert.equal(c.pumpGetEntryTimeISO(entries[1]),"09:23");assert.deepEqual(entries,before);
});

test("date-only correction retains the selected reading's fractional precision",async()=>{
 const h=harness(),before=h.local,action=logEdit(before,{rpm:before.pumpEff.entries[0].rpm});assert.equal((await h.save(action)).saved,true);assert.equal(h.cloud.pumpEff.entries[0].rpm,3600.4);
});
