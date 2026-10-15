"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const atomic=require("../js/atomicPersistence"),firewall=require("../js/cuttingFileContentFirewall"),identity=require("../js/globalIdentityRepair");
const core=fs.readFileSync("js/core.js","utf8"),pump=fs.readFileSync("js/pump.js","utf8"),clone=value=>JSON.parse(JSON.stringify(value));
const section=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const model=section(pump,"/* PRB baseline model","/* End PRB baseline model. */");
const retention=section(core,"/* PRB nested retention","function mergePumpEffForSave");
const merging=section(core,"function mergePumpEffForSave","function getTrackedStateSignature");
const baseline=(id,date,rpm)=>({id,effectiveDateISO:date,rpm,rebuildRef:null,createdAtISO:"2026-06-01T12:00:00.000Z",createdBy:"fixture",corrections:[],unknown:{keep:true}});
const initial=()=>({schema:72,syncMeta:{rev:7,retained:"keep"},saveMeta:{keep:"exact"},
  pumpEff:{baselineRPM:3480,baselineDateISO:"2026-06-01",entries:[{dateISO:"2026-07-15",rpm:3600.4,timeISO:"09:23",id:"reading-keep",provenance:{keep:true}}],
    notes:[{dateISO:"2026-07-15",text:"  preserve spaces  ",range:"all",updatedISO:"2026-07-15T00:00:00Z",custom:"keep"}],unknownPump:{keep:true}},
  inventory:[{id:"inventory-keep",qtyNew:3}],tasksInterval:[{id:"rebuild-task",name:"Pump Rebuild",completedDates:["2026-06-01"],manualHistory:[{dateISO:"2026-06-01",import_event_id:"rebuild-import-keep"}]}],
  tasksAsReq:[],maintenanceTasksV2:[],maintenanceCalendarInstancesV2:[],maintenanceOccurrencesV2:[],dailyCutHours:[{dateISO:"2020-01-01",hours:2}],totalHistory:[],unknownBusiness:{keep:[1,2]}});
const create=(date="2026-09-20",rpm=3515)=>({kind:"create",rpm,effectiveDateISO:date});
const edit=(id,rpm,date)=>({kind:"edit",id,rpm,effectiveDateISO:date,reason:"Correct transcription"});
function pure(value=initial().pumpEff){
  const window={pumpEff:clone(value)},c=vm.createContext({window,Date,console,stableStringifyForIntegrity:identity.key,normalizeDateISO:value=>value||null});
  vm.runInContext(model+section(pump,"function pumpPercentChange","const PUMP_DELTA_CLASS_COLORS")+retention+merging,c);
  return c;
}
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
    model+retention+merging+section(core,"function canWriteCloud","let CUTTING_BASELINE_WEEKLY_HOURS")+
    section(core,"async function writeAuthoritativeStateSnapshot","function getInventoryIdentityRepairLocalState")+
    section(core,"async function readInventoryMaterialAuthoritativeState","let inventoryMaterialOwnedSuspension")+
    section(core,"function cloudSaveNoWriteFailure","async function performCloudSave")+
    section(core,"/* PRB verified baseline action","/* End PRB verified baseline action. */")+
    "this.pending=value=>hasPendingLocalChanges=value;this.drift=()=>lastLocalMutationAt++;",c);
  if(options.writeResult){const writer=c.writeAuthoritativeStateSnapshot;c.writeAuthoritativeStateSnapshot=async(...args)=>{const result=await writer(...args);options.writeResult(result);return result;};}
  return {c,window,save:action=>c.savePumpBaseline(action),get cloud(){return clone(cloud);},get local(){return clone(local);},get commits(){return commits;},get reads(){return reads;},get adoptions(){return adoptions;},get diagnostics(){return diagnostics;},get preflights(){return preflights;},
    reload(){local=clone(cloud);window.pumpEff=local.pumpEff;window.__lastLoadedCloudState=clone(cloud);window.__loadedCloudRevisionForSaveGuard=cloud.syncMeta.rev;},alter:fn=>fn(local,cloud)};
}

test("create persists RPM/date and incorporates the dated legacy pair exactly once",async()=>{
  const h=harness(),before=h.cloud,r=await h.save(create());assert.equal(r.saved,true,JSON.stringify(r));assert.equal(r.verificationCompleted,true);assert.equal(h.commits,1);assert.equal(h.reads,2);assert.ok(h.preflights>0);
  assert.deepEqual(h.cloud.pumpEff.baselineHistory.map(x=>[x.effectiveDateISO,x.rpm]),[["2026-06-01",3480],["2026-09-20",3515]]);
  assert.equal(h.cloud.pumpEff.baselineRPM,before.pumpEff.baselineRPM);assert.equal(h.cloud.pumpEff.baselineDateISO,before.pumpEff.baselineDateISO);
  h.reload();assert.deepEqual(h.local.pumpEff,h.cloud.pumpEff);assert.equal((await h.save(create("2026-10-01",3520))).saved,true);
  assert.equal(h.cloud.pumpEff.baselineHistory.filter(x=>x.legacy).length,1);
});
test("specific RPM/date edits retain stable ID, before/after audit and unknown evidence across reload",async()=>{
  const source=initial();source.pumpEff.baselineHistory=[baseline("baseline-a","2026-06-01",3480),baseline("baseline-b","2026-09-20",3515)];
  const h=harness({initial:source});assert.equal((await h.save(edit("baseline-a",3490,"2026-06-01"))).saved,true);h.reload();
  assert.equal(h.local.pumpEff.baselineHistory[0].rpm,3490);
  assert.equal((await h.save(edit("baseline-a",3490,"2026-05-30"))).saved,true);h.reload();const a=h.local.pumpEff.baselineHistory[0];
  assert.equal(a.id,"baseline-a");assert.equal(a.effectiveDateISO,"2026-05-30");assert.equal(a.corrections.length,2);assert.deepEqual(a.unknown,{keep:true});
  assert.deepEqual(a.corrections[0].before,{rpm:3480,effectiveDateISO:"2026-06-01"});assert.deepEqual(a.corrections[1].after,{rpm:3490,effectiveDateISO:"2026-05-30"});
  assert.equal(a.corrections[0].recordedBy,"actor-fixture");assert.ok(a.corrections[0].recordedAtISO);assert.notEqual(a.corrections[0].id,a.corrections[1].id);
  assert.deepEqual(h.cloud.pumpEff.baselineHistory[1],source.pumpEff.baselineHistory[1]);
});
test("baseline changes leave measurements, notes, legacy scalars, rebuilds and every unrelated field exact",async()=>{
  const h=harness(),before=h.cloud;assert.equal((await h.save(create())).saved,true);const after=h.cloud;
  for(const key of Object.keys(before).filter(key=>!["pumpEff","syncMeta"].includes(key)))assert.deepEqual(after[key],before[key],key);
  for(const key of Object.keys(before.pumpEff))assert.deepEqual(after.pumpEff[key],before.pumpEff[key],key);
  assert.equal(after.syncMeta.retained,"keep");
});
test("a normal save's compacted diagnostic-log cache does not block a baseline action or erase the server log",async()=>{
  const source=initial();source.syncProcessLog=[{eventType:"old-operational-log",message:"retain exact server evidence"}];const h=harness({initial:source});
  delete h.window.__lastLoadedCloudState.syncProcessLog;assert.equal((await h.save(create())).saved,true);assert.deepEqual(h.cloud.syncProcessLog,source.syncProcessLog);
});
for(const [name,action] of [["same-date create",create("2026-06-01")],["invalid date",create("2026-02-30")],["missing date",create("")],["nonfinite RPM",create("2026-09-20",Infinity)],["zero RPM",create("2026-09-20",0)]])test(name+" is rejected before writing",async()=>{
  const h=harness(),before=h.cloud;const r=await h.save(action);assert.equal(r.saved,false);assert.equal(h.commits,0);assert.deepEqual(h.local,before);
});
test("editing into another effective date is rejected; editing the virtual legacy record keeps its ID",async()=>{
  const h=harness();await h.save(create());const id=h.cloud.pumpEff.baselineHistory[1].id;
  assert.equal((await h.save(edit(id,3500,"2026-06-01"))).saved,false);assert.equal(h.commits,1);
  const legacy=harness(),legacyId=pure().pumpLegacyBaseline(initial().pumpEff).id;
  assert.equal((await legacy.save(edit(legacyId,3470,"2026-06-02"))).saved,true);assert.equal(legacy.cloud.pumpEff.baselineHistory[0].id,legacyId);
});
test("date resolver uses latest applicable baseline and exact boundary without changing July after September",()=>{
  const c=pure();const july=c.pumpPercentChange(3600,"2026-07-15");
  c.window.pumpEff.baselineHistory=[baseline("b","2026-09-20",3515),baseline("a","2026-06-01",3480)];
  assert.equal(c.pumpPercentChange(3600,"2026-07-15"),july);assert.equal(c.resolvePumpBaselineForDate("2026-09-20").id,"b");
  assert.equal(c.resolvePumpBaselineForDate("2026-09-19").id,"a");assert.equal(c.resolvePumpBaselineForDate("2026-05-31"),null);
  for(const date of [undefined,"","2026-02-30"])assert.equal(c.resolvePumpBaselineForDate(date),null);
});
test("undated legacy evidence never becomes dated chronology; valid history supersedes scalar fallback",async()=>{
  const source=initial();source.pumpEff.baselineDateISO=null;const c=pure(source.pumpEff);assert.equal(c.resolvePumpBaselineForDate("2026-07-15"),null);
  const h=harness({initial:source});assert.equal((await h.save(create())).saved,true);assert.equal(h.cloud.pumpEff.baselineDateISO,null);assert.equal(h.cloud.pumpEff.baselineHistory.length,1);
  c.window.pumpEff={...initial().pumpEff,baselineHistory:[baseline("future","2027-01-01",3550)]};assert.equal(c.resolvePumpBaselineForDate("2026-07-15"),null);
});
test("ambiguous same-date history is unavailable and cannot be mutated silently",async()=>{
  const source=initial();source.pumpEff.baselineHistory=[baseline("a","2026-06-01",3480),baseline("b","2026-06-01",3515)];
  assert.equal(pure(source.pumpEff).resolvePumpBaselineForDate("2026-07-15"),null);const h=harness({initial:source});assert.equal((await h.save(create())).saved,false);assert.equal(h.commits,0);
});
test("malformed history cannot reactivate legacy scalars or be silently replaced",async()=>{
  const source=initial();source.pumpEff.baselineHistory={invalid:"preserve"};assert.equal(pure(source.pumpEff).resolvePumpBaselineForDate("2026-07-15"),null);
  const h=harness({initial:source});assert.equal((await h.save(create())).saved,false);assert.deepEqual(h.cloud,source);assert.equal(h.commits,0);
});
for(const [name,options] of [["permission rejection",{reject:true}],["stale CAS",{stale:true}],["protected preflight",{protectedFailure:true}],["preview read-only",{preview:true}]])test(name+" produces no success or phantom committed baseline",async()=>{
  const h=harness(options),before=h.local,r=await h.save(create());assert.equal(r.saved,false);assert.equal(h.commits,0);assert.deepEqual(h.local,before);assert.equal(h.adoptions,0);
});
for(const [name,options] of [
  ["readback RPM mismatch",{afterRead:envelope=>envelope.state.pumpEff.baselineHistory[1].rpm++}],
  ["readback revision mismatch",{afterRead:envelope=>envelope.state.syncMeta.rev++}],
  ["unrelated server mutation",{afterRead:envelope=>envelope.state.inventory[0].qtyNew++}],
  ["incomplete server envelope",{afterRead:envelope=>delete envelope.state}],
  ["read failure",{readFailure:true}],
  ["local drift",{afterRead:(envelope,local)=>local.inventory[0].qtyNew++}],
  ["bad acknowledgement",{writeResult:result=>result.committedState.pumpEff.baselineHistory[1].rpm++}],
  ["adoption blocked",{adoptionFailure:true}]
])test(name+" suspends writes without success, retry or unverified adoption",async()=>{
  const h=harness(options),r=await h.save(create());assert.equal(r.saved,false);assert.equal(r.indeterminate,true);assert.equal(h.commits,1);assert.equal(h.adoptions,0);
  assert.equal(h.window.__autosaveDisabled,true);assert.ok(h.window.__lastPumpBaselineMutationEvidence);assert.equal((await h.save(create("2026-10-01"))).saved,false);assert.equal(h.commits,1);
});
test("indeterminate transaction is never retried or adopted",async()=>{const h=harness({indeterminate:true});const r=await h.save(create());assert.equal(r.saved,false);assert.equal(r.indeterminate,true);assert.equal(h.commits,0);assert.equal(h.reads,1);assert.equal(h.adoptions,0);});
test("overlapping baseline action is blocked while independent verification owns adoption",async()=>{
  const h=harness(),first=h.save(create()),second=await h.save(create("2026-10-01"));assert.equal(second.saved,false);assert.equal((await first).saved,true);assert.equal(h.commits,1);
});
test("other pending edits and Recovery Mode block baseline writes",async()=>{
  for(const mode of ["pending","recovery","material"]){const h=harness();if(mode==="pending")h.c.pending(true);if(mode==="recovery")h.window.__recoveryInspectMode=true;if(mode==="material")h.window.__inventoryMaterialMutationPending=true;
    assert.equal((await h.save(create())).saved,false);assert.equal(h.commits,0);}
});
test("ordinary pump merges retain baseline IDs, context, unknown fields and corrections",()=>{
  const c=pure(),remote=initial().pumpEff;remote.baselineHistory=[baseline("a","2026-06-01",3480)];const local=clone(remote);local.entries.push({dateISO:"2026-10-01",rpm:3600,timeISO:"12:00"});
  const result=c.mergePumpEffForSave(local,remote);assert.deepEqual(clone(result.baselineHistory),remote.baselineHistory);assert.deepEqual(clone(result.unknownPump),remote.unknownPump);
  const partial=c.mergePumpEffForSave({entries:[]},remote);assert.deepEqual(clone(partial.baselineHistory),remote.baselineHistory);
});
test("nested retention rejects removed records, lost audit, unaudited changes and rewritten context",()=>{
  const c=pure(),before={baselineHistory:[baseline("a","2026-06-01",3480)]};
  for(const mutate of [after=>after.baselineHistory=[],after=>after.baselineHistory[0].rpm++,after=>delete after.baselineHistory[0].unknown,after=>after.baselineHistory[0].createdBy="changed"]){const after=clone(before);mutate(after);assert.equal(c.validatePumpBaselineRetention(before,after).valid,false);}
  const action=edit("a",3490,"2026-06-02"),after=c.preparePumpBaselineChange(before,action,{correctionId:"c",actor:"fixture",atISO:"2026-10-14T12:00:00Z"});
  assert.equal(c.validatePumpBaselineRetention(before,after).valid,true);const lost=clone(after);lost.baselineHistory[0].corrections=[];assert.equal(c.validatePumpBaselineRetention(after,lost).valid,false);
});
test("ordinary authoritative writer rejects nested baseline/audit loss before merge or transaction.set",async()=>{
  const source=initial();source.pumpEff.baselineHistory=[baseline("a","2026-06-01",3480)];
  for(const mutate of [next=>delete next.pumpEff.baselineHistory,next=>next.pumpEff.baselineHistory[0].rpm++,next=>delete next.pumpEff.baselineHistory[0].unknown]){
    const h=harness({initial:source}),next=clone(source);mutate(next);
    const result=await h.c.writeAuthoritativeStateSnapshot(next,{merge:true},{expectedRevision:7});
    assert.equal(result.saved,false);assert.equal(result.errorCode,"pump_baseline_retention");assert.equal(h.commits,0);assert.deepEqual(h.cloud,source);
  }
});
test("ordinary adoption replaces the complete pump object including nulls and unknown fields",()=>{
  const c=pure(),data={pumpEff:{...initial().pumpEff,baselineRPM:null,baselineDateISO:null,baselineHistory:[baseline("a","2026-06-01",3480)]}};
  c.data=data;c.cloneStructured=clone;vm.runInContext(section(core,"  // Pump efficiency (guard", "  ensureTaskCategories();"),c);
  assert.deepEqual(clone(c.window.pumpEff),data.pumpEff);assert.notEqual(c.window.pumpEff,data.pumpEff);
});
test("popup submit awaits verification, retains rejected input and never reports optimistic success",async()=>{
  const globals={pumpEff:initial().pumpEff,Date,console};globals.window=globals;const c=vm.createContext(globals);vm.runInContext(pump,c);
  let finish,action;const messages=[],status={textContent:"",setAttribute(){}},controls=[{disabled:false}];
  const fields={"#pumpBaselineRPM":{value:"3515"},"#pumpBaselineDate":{value:"2026-09-20"},"#pumpBaselineNote":{value:"  Rebuild\n49 ksi  "}};
  const form={querySelector:id=>fields[id],querySelectorAll:()=>[],setAttribute(){}};
  c.dialog={querySelector:id=>id==="#pumpBaselineForm"?form:status,querySelectorAll:()=>controls};
  c.toast=value=>messages.push(value);c.renderPumpWidget=()=>{};c.pumpRenderBaselineModal=()=>{};
  c.savePumpBaseline=value=>{action=value;return new Promise(resolve=>finish=resolve);};
  vm.runInContext("pumpBaselineModalDialog=dialog;",c);
  const running=c.pumpSubmitBaselineForm({preventDefault(){}});assert.deepEqual(messages,[]);assert.equal(controls[0].disabled,true);
  assert.equal(action.note,fields["#pumpBaselineNote"].value);finish({saved:false,error:"CAS rejected"});await running;
  assert.deepEqual(messages,[]);assert.equal(status.textContent,"CAS rejected");assert.equal(fields["#pumpBaselineNote"].value,"  Rebuild\n49 ksi  ");assert.equal(controls[0].disabled,false);
  const accepted=c.pumpSubmitBaselineForm({preventDefault(){}});assert.equal(messages.length,0);finish({saved:true});await accepted;assert.equal(messages.at(-1),"Baseline verified and saved");
});

test("blank correction reason shows an inline error and focuses the field without saving or clearing edits",async()=>{
  for(const value of ["","   "]){
    const globals={pumpEff:initial().pumpEff,Date,console};globals.window=globals;const c=vm.createContext(globals);vm.runInContext(pump,c);
    let saves=0,focused=false;const attributes={},status={textContent:"",setAttribute:(key,value)=>attributes[key]=value};
    const reason={value,setAttribute:(key,value)=>attributes[key]=value,focus:()=>focused=true};
    const fields={"#pumpBaselineRPM":{value:"1450"},"#pumpBaselineDate":{value:"2026-10-11"},"#pumpBaselineNote":{value:"Note B"},"#pumpBaselineReason":reason};
    const form={querySelector:key=>fields[key],querySelectorAll:()=>[]};c.dialog={querySelector:key=>key==="#pumpBaselineForm"?form:status};
    c.savePumpBaseline=()=>saves++;vm.runInContext('pumpBaselineEditingId="saved-id";pumpBaselineModalDialog=dialog;',c);
    await c.pumpSubmitBaselineForm({preventDefault(){}});
    assert.equal(saves,0);assert.equal(focused,true);assert.equal(attributes["aria-invalid"],"true");assert.equal(attributes["data-error"],"true");
    assert.equal(status.textContent,"Enter a reason for the baseline correction.");assert.equal(fields["#pumpBaselineRPM"].value,"1450");assert.equal(fields["#pumpBaselineNote"].value,"Note B");
  }
});

test("create and edit durably retain note text and audited RPM/date/note under one stable identity",async()=>{
  const h=harness(),before=h.cloud,note="  Major pump rebuild\nChecked at 49 ksi.  ";
  assert.equal((await h.save({...create(),note})).saved,true);h.reload();let record=h.local.pumpEff.baselineHistory[1];const id=record.id;
  assert.equal(record.note,note);assert.deepEqual(h.cloud.pumpEff.notes,before.pumpEff.notes);
  assert.equal((await h.save({...edit(id,3520,"2026-09-21"),note:"Nozzle body change\nCorrected date"})).saved,true);h.reload();
  record=h.local.pumpEff.baselineHistory.find(row=>row.id===id);assert.equal(record.id,id);assert.equal(record.rpm,3520);assert.equal(record.effectiveDateISO,"2026-09-21");
  assert.deepEqual(record.corrections[0].before,{rpm:3515,effectiveDateISO:"2026-09-20",note});
  assert.deepEqual(record.corrections[0].after,{rpm:3520,effectiveDateISO:"2026-09-21",note:"Nozzle body change\nCorrected date"});
  assert.equal((await h.save({...edit(id,3520,"2026-09-21"),note:"Explanation only"})).saved,true);h.reload();
  assert.equal(h.local.pumpEff.baselineHistory.find(row=>row.id===id).corrections.length,2);
  for(const field of ["entries","notes"])assert.deepEqual(h.cloud.pumpEff[field],before.pumpEff[field]);
});
test("note-less PRB-01B records/corrections remain valid and retain original absence without migration",async()=>{
  const source=initial(),record=baseline("old","2026-06-02",3490),oldCorrection={id:"old-correction",recordedAtISO:"2026-06-02T12:00:00Z",recordedBy:"fixture",reason:"Correct date",
    before:{rpm:3480,effectiveDateISO:"2026-06-01"},after:{rpm:3490,effectiveDateISO:"2026-06-02"}};
  record.corrections=[oldCorrection];source.pumpEff.baselineHistory=[record];const h=harness({initial:source});
  assert.equal((await h.save({...edit("old",3490,"2026-06-02"),note:"Recorded explanation"})).saved,true);h.reload();const edited=h.local.pumpEff.baselineHistory[0];
  assert.deepEqual(edited.corrections[0],oldCorrection);assert.equal(Object.hasOwn(edited.corrections[1].before,"note"),false);assert.equal(edited.corrections[1].after.note,"Recorded explanation");
  assert.equal(edited.createdAtISO,record.createdAtISO);assert.deepEqual(edited.unknown,record.unknown);
});
test("note changes cannot bypass append-only retention or silently disappear during merge/adoption",async()=>{
  const source=initial();source.pumpEff.baselineHistory=[{...baseline("a","2026-06-01",3480),note:"Rebuild"}];const c=pure(source.pumpEff);
  for(const mutate of [after=>after.baselineHistory[0].note="Unaudited",after=>delete after.baselineHistory[0].note]){
    const after=clone(source.pumpEff);mutate(after);assert.equal(c.validatePumpBaselineRetention(source.pumpEff,after).valid,false);
    assert.throws(()=>c.mergePumpEffForSave(after,source.pumpEff),/correction|baseline/i);
  }
  const h=harness({initial:source});await h.save({...edit("a",3490,"2026-06-02"),note:"Corrected explanation"});
  const confirmed=h.cloud.pumpEff;assert.equal(c.validatePumpBaselineRetention(confirmed,confirmed).valid,true);
  const merged=c.mergePumpEffForSave(confirmed,confirmed);assert.deepEqual(clone(merged),confirmed);
  c.data={pumpEff:confirmed};c.cloneStructured=clone;vm.runInContext(section(core,"  // Pump efficiency (guard", "  ensureTaskCategories();"),c);
  assert.deepEqual(clone(c.window.pumpEff),confirmed);
});
test("main widget is static and keeps Change Baseline, Daily Log and Edit Logs outside the management popup",()=>{
  const globals={pumpEff:initial().pumpEff,Date,console};globals.window=globals;const c=vm.createContext(globals);vm.runInContext(pump,c);
  const html=c.viewPumpLogWidget();assert.match(html,/<section class="pump-card"/);assert.match(html,/pump-card-header/);assert.doesNotMatch(html,/<details|<summary/);
  for(const text of ["Change Baseline","Daily log","Edit logs"])assert.ok(html.includes(text));
  assert.doesNotMatch(html,/pumpBaselineForm|pumpBaselineRPM|pumpBaselineDate|Baseline history/);
});
test("popup shows newest-first history, editable fields and safely escaped baseline notes",()=>{
  const value=initial().pumpEff;value.baselineHistory=[{...baseline("old","2026-06-01",3480),note:"<script>unsafe</script>"},baseline("new","2026-09-20",3515)];
  const globals={pumpEff:value,Date,console};globals.window=globals;const c=vm.createContext(globals);vm.runInContext(pump,c);const html=c.viewPumpBaselineModal();
  for(const text of ["Change Baseline","Baseline RPM","Effective / rebuild date","Note / reason","Baseline history (2)","Describe why the baseline changed"])assert.ok(html.includes(text));
  assert.ok(html.indexOf('data-pump-baseline-row="new"')<html.indexOf('data-pump-baseline-row="old"'));
  assert.ok(html.includes("&lt;script&gt;unsafe&lt;/script&gt;"));assert.doesNotMatch(html,/<script>/);assert.equal(Object.hasOwn(value.baselineHistory[1],"note"),false);
});
test("badge, historical chart points, tooltip/header and reference use the shared dated resolver",()=>{
  assert.match(pump,/pumpPercentChange\(latest\.rpm, latest\.dateISO\)/);assert.match(pump,/pumpPercentChange\(entry\.rpm, entry\.dateISO\)/);
  assert.match(pump,/pumpPercentChange\(latest\?\.rpm, latest\?\.dateISO\)/);assert.match(pump,/Number\(entryBaseline\.rpm\)/);
  assert.match(pump,/resolvePumpBaselineForDate\(data\[data\.length - 1\]\?\.dateISO\)/);
  const chart=section(pump,"function drawPumpChart", "canvas.__pumpChartTooltipMeta");assert.doesNotMatch(chart,/pumpEff\.baselineRPM/);
  const listener=section(core,"function startWorkspaceStateListener","/* ===================== DATA");assert.match(listener,/__pumpBaselineMutationPending/);
});

test("rendered badge, canvas header, point colors and historical tooltips agree on dated percentages",()=>{
  const state={...initial().pumpEff,notes:[],entries:[{dateISO:"2026-07-15",rpm:3600,timeISO:"12:00"},{dateISO:"2026-09-30",rpm:4400,timeISO:"12:00"}],
    baselineHistory:[baseline("a","2026-06-01",3480),baseline("b","2026-09-20",3515)]};
  const globals={pumpEff:state,DAY_MS:86400000,Date,console,devicePixelRatio:1};globals.window=globals;const c=vm.createContext(globals);vm.runInContext(pump,c);
  const labels=[],points=[];let arc=null;
  const ctx=new Proxy({measureText:text=>({width:String(text).length*7}),beginPath(){arc=null;},arc(...args){arc=args;},fill(){if(arc)points.push(this.fillStyle);},fillText(text){labels.push({text:String(text),color:this.fillStyle});}},
    {get:(target,key)=>key in target?target[key]:()=>{},set:(target,key,value)=>{target[key]=value;return true;}});
  const canvas={width:1000,height:650,getContext:()=>ctx,closest:()=>null};c.drawPumpChart(canvas,"1y");
  const july=c.pumpPercentChange(3600,"2026-07-15").toFixed(1),september=c.pumpPercentChange(4400,"2026-09-30").toFixed(1);
  assert.match(c.viewPumpLogWidget(),new RegExp(september.replace(".","\\.")+"%"));
  assert.ok(labels.some(label=>label.text===september+"%"&&label.color==="#c62828"));assert.ok(points.includes("#2e7d32"));assert.ok(points.includes("#c62828"));
  assert.match(canvas.__pumpChartTargets[0].detailLines.join(" "),new RegExp("\\+"+july.replace(".","\\.")+"%.*3,480 RPM"));
  assert.match(canvas.__pumpChartTargets[1].detailLines.join(" "),/3,515 RPM/);assert.equal(canvas.__pumpChartTooltipMeta.baselineRPM,3515);
});
