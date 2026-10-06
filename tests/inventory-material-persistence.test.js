"use strict";
const test=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs"), vm=require("node:vm");
const materials=require("../js/inventoryMaterialMutations"), atomic=require("../js/atomicPersistence"), firewall=require("../js/cuttingFileContentFirewall");
const identities=require("../js/globalIdentityRepair"), {fixture}=require("./fixtures/global-identity");
const core=fs.readFileSync("js/core.js","utf8"), renderers=fs.readFileSync("js/renderers.js","utf8"), views=fs.readFileSync("js/views.js","utf8"), clone=structuredClone;
function fn(source,name){const start=source.search(new RegExp("^(?:async )?function "+name+"\\(","m"));assert.ok(start>=0,name);return source.slice(start,source.indexOf("\n}",start)+2);}
function constant(name){const start=core.indexOf("const "+name+" =");assert.ok(start>=0,name);return core.slice(start,core.indexOf(";",start)+1);}
const bindings=["totalHistory","tasksInterval","tasksAsReq","inventory","cuttingJobs","completedCuttingJobs","orderRequests","garnetCleanings","dailyCutHours","opportunityRollups","weeklyCostReports","receiptTrackerWeeks","maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2","deletedItems","appConfig","jobFolders","orderRequestTab"];
function model(){return {activeType:"steel",customMaterialEvidence:{retain:"exact"},types:[{id:"steel",name:"Steel",custom:"retain"},{id:"aluminum",name:"Aluminum"}],sheets:Object.fromEntries(["steel","aluminum"].map(id=>[id,{columns:["QTY 4x8","QTY 4x10"],custom:"retain",rows:[{thickness:"0.0625",values:["2","3"]},{thickness:"0.09375",values:["4","5"],custom:"row evidence"},{thickness:"0.125",values:["6","7"]}]}]))};}
function harness(options={}){
  let cloud=identities.repairedState(fixture(),identities.preview(fixture()));
  cloud.inventoryMaterials=model();cloud.syncMeta={rev:7,updatedBy:"fixture-client"};cloud.inventoryTransactions=[{id:"transaction",qty:4}];
  if(options.blankAluminum){cloud.inventoryMaterials.activeType="aluminum";cloud.inventoryMaterials.sheets.aluminum.rows[0].values[0]="";}
  if(options.baselineSyncMeta)cloud.syncMeta=clone(options.baselineSyncMeta);
  cloud.unknownFutureState={retain:[{id:"future-record",payload:"exact"}]};
  let reads=0,transactions=0,commits=0,diagnostics=0, queued, writeOptions;
  const events={};const window={...clone(cloud),OMAXInventoryMaterialMutations:materials,OMAXAtomicPersistence:atomic,OMAXGlobalIdentityRepair:identities,CuttingFileContentFirewall:firewall,
    __cloudLoadAttemptComplete:true,__initialAdoptComplete:true,__loadedCloudRevisionForSaveGuard:cloud.syncMeta.rev,addEventListener:(name,handler)=>{events[name]=handler;},location:{hostname:"localhost",search:""}};
  const db={async runTransaction(callback){transactions++;await options.beforeTransaction?.(window,cloud);const transaction={get:async()=>({exists:true,data:()=>clone(cloud)}),set:(_ref,value,setOptions)=>{writeOptions=clone(setOptions);queued=clone(value);}};
    await callback(transaction);if(options.retry)await callback(transaction);
    await options.afterQueue?.(window,cloud);
    if(options.reject)throw Object.assign(Error("Permission denied"),{code:"permission-denied"});
    if(options.unknownWithoutCommit)throw Error("Acknowledgement lost");
    if(writeOptions.mergeFields){for(const field of writeOptions.mergeFields)cloud[field]=clone(queued[field]);}
    else if(writeOptions.merge){
      const merge=(before,next)=>{const result={...before};for(const [name,value]of Object.entries(next))result[name]=value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).length?merge(before?.[name]||{},value):clone(value);return result;};
      cloud=merge(cloud,queued);
    }else cloud=clone(queued);
    commits++;if(options.loseAck)throw Error("Acknowledgement lost after commit");
  }};
  const c=vm.createContext({window,URLSearchParams,TextEncoder,structuredClone,Blob,Map,WeakSet,setTimeout,clearTimeout,
    console:{warn(){},error(){},info(){}},document:{getElementById:()=>null},WORKSPACE_ID:"fixture",
    FB:{ready:true,user:{uid:"fixture"},db,docRef:{path:"fixture/app/state",get:async readOptions=>{assert.equal(readOptions.source,"server");reads++;await options.duringRead?.(reads,window,cloud);if(reads>1&&options.readFailure)throw Error("Server unavailable");const data=clone(cloud);if(reads>1&&options.mismatch)data.inventory[0].qtyNew++;if(reads>1)options.readbackMutation?.(data);return{exists:true,data:()=>data};}}},
    FIRESTORE_BLOCK_BYTES:950000,getCloudSyncClientId:()=>options.rotateClientIdAfterCommit&&commits ? "fresh-storage-client" : "fixture-client",readLocalStateBackup:()=>null,
    getSaveSchemaCoverageReport:()=>({cloudExcludedProtectedPaths:[]}),classifyMissingProtectedPathsForSave:()=>({blocking:[],warnings:[]}),
    renderRecoveryDiagnosticsPanel:()=>diagnostics++,showLocalBackupConflictWarning(){},syncRenderTotalsFromHistory(){},resetHistoryToCurrent(){},
    setCloudLoadGate:value=>{window.__cloudLoadAttemptComplete=value.loadComplete;window.__initialAdoptComplete=value.adoptComplete;},
    mergeTotalHistoryForSave:()=>{throw Error("Unchanged history must be preserved verbatim");},mergeDailyCutHoursForSave:()=>{throw Error("Unchanged daily data must be preserved verbatim");},mergePumpEffForSave:()=>{throw Error("Unchanged pump data must be preserved verbatim");},
    isVercelPreviewRuntime:()=>Boolean(options.preview),toast(){}});
  const constants=["PROTECTED_STATE_FIELDS","REQUIRED_PROTECTED_DATA_PATHS","PROTECTED_FIELD_REGISTRY","DATA_SAFETY_PREFLIGHT_COUNT_DROP_RATIO","DATA_SAFETY_PREFLIGHT_MIN_BASELINE_COUNT","DATA_SAFETY_PREFLIGHT_TOTAL_DROP_RATIO","DATA_SAFETY_PREFLIGHT_SIZE_DROP_RATIO"];
  const functions=["cloneStructured","stateHasMeaningfulData","stableStringify","estimatePayloadBytes","countObjectKeys","countTaskNestedMapEntries","countTaskNestedArrayEntries","countJobManualLogs","getValueAtPath","getDataSafetyShape","countCollectionValue","countNestedProtectedValues","stableStringifyForIntegrity","hashIntegrityString","fingerprintProtectedValue","countProtectedField","validateProtectedFieldShape","getProtectedFieldRegistryCoverage","buildProtectedFieldIntegritySummary","buildDataIntegritySummary","hasAnyProtectedData","hasAnyProtectedFieldPresence","isDangerousShapeChange","chooseProtectedSaveBaseline","detectDangerousIntegrityReduction","validateProtectedSavePreflight","buildProtectedFieldSummary","compareProtectedFieldSummaries","detectDangerousProtectedFieldReduction","isRecoveryMode","canWriteCloud","blockCloudSave","scanAuthoritativeCutFileContent","reportCloudSaveSecondaryError","validateCuttingJobHistoryRestoreSave","validateCuttingJobDeletionSave","cuttingJobDeletionSafetyBaseline","writeAuthoritativeStateSnapshot","readCurrentCloudStateReadOnly","getInventoryIdentityRepairLocalState","buildWindowProtectedStateForCoverage","inspectInventoryIdentities","adoptAuthoritativeRecoveryState","adoptState","checkAuthoritativeIdentityIntegrity","adoptIdentityCheckedAuthoritativeState","loadFromCloud","cloudSaveNoWriteFailure","saveCloudDebounced","saveCloudNow"];
  vm.runInContext(bindings.map(name=>"let "+name+"=window."+name+";").join("\n")+"\nlet lastAppliedCloudRevision=7,lastLocalMutationAt=0,hasPendingLocalChanges=false,cloudSaveQueue=Promise.resolve();const inventoryIdentityRepairAuthorizations=new Map(),cuttingJobDeletionProofs=new WeakSet(),cuttingJobDeletionTransactions=new WeakSet(),cuttingJobHistoryRestoreProofs=new WeakSet(),cuttingJobHistoryRestoreTransactions=new WeakSet();\n"+constants.map(constant).join("\n")+"\n"+functions.map(name=>fn(core,name)).join("\n"),c);
  assert.equal(c.adoptIdentityCheckedAuthoritativeState(clone(cloud)).recovery,Boolean(options.preview));
  if(options.quotaClientId){
    let sequence=0;c.CLOUD_SYNC_CLIENT_KEY="fixture-client-key";c.Math=Object.create(Math);c.Math.random=()=>++sequence/1000;
    window.localStorage={getItem:()=>"",setItem:()=>{throw Error("QuotaExceededError");}};
    vm.runInContext(fn(core,"getCloudSyncClientId"),c);
  }
  vm.runInContext(core.slice(core.indexOf("let inventoryMaterialOwnedSuspension"),core.indexOf("const inventoryIdentityRepairApi=")),c);
  if(options.blockProtected)c.validateProtectedSavePreflight=()=>({blocked:true});
  if(options.recovery)window.__recoveryInspectMode=true;
  if(options.autosaveDisabled)window.__autosaveDisabled=true;
  if(options.pending)vm.runInContext("hasPendingLocalChanges=true",c);
  if(options.loadedRevision!==undefined)window.__loadedCloudRevisionForSaveGuard=options.loadedRevision;
  return {api:window.inventoryMaterialMutationApi,window,c,events,get writeOptions(){return clone(writeOptions);},get cloud(){return clone(cloud);},get local(){return clone(c.getInventoryIdentityRepairLocalState());},get commits(){return commits;},get transactions(){return transactions;},get reads(){return reads;},get diagnostics(){return diagnostics;},editCloud:change=>change(cloud),reload:()=>c.loadFromCloud(),bump:()=>vm.runInContext("lastLocalMutationAt++",c)};
}
const action=(kind,other={})=>({kind,typeId:"steel",rowIndex:1,colIndex:0,...other});
const unrelated=state=>Object.fromEntries(Object.entries(state).filter(([name])=>!["inventoryMaterials","syncMeta"].includes(name)));
for(const [name,request,verify] of [
  ["quantity",action("cell",{value:"19"}),m=>assert.equal(m.sheets.steel.rows[1].values[0],"19")],
  ["rename",action("material-name",{value:"Tool Steel"}),m=>assert.equal(m.types[0].name,"Tool Steel")],
  ["exact thickness",action("thickness",{value:"7/64"}),m=>assert.equal(m.sheets.steel.rows[1].thickness,"0.109375")],
  ["shared heading",action("column",{value:"5x12"}),m=>m.types.forEach(t=>assert.equal(m.sheets[t.id].columns[0],"QTY 5x12"))],
  ["add type",{kind:"add-type",value:"Titanium"},m=>{assert.equal(m.types.at(-1).name,"Titanium");assert.deepEqual(m.sheets.titanium.columns,m.sheets.steel.columns);}],
  ["add row",action("add-row"),m=>assert.equal(m.sheets.steel.rows.length,4)],
  ["insert row",action("insert-row",{rowIndex:0}),m=>assert.equal(m.sheets.steel.rows[1].thickness,"0.078125")],
  ["delete row",action("delete-row"),m=>assert.equal(m.sheets.steel.rows.length,2)],
  ["add column",action("add-column"),m=>m.types.forEach(t=>assert.equal(m.sheets[t.id].columns.length,3))],
  ["insert column",action("insert-column"),m=>assert.deepEqual(m.sheets.steel.rows[1].values,["4","","5"])],
  ["delete column",action("delete-column"),m=>assert.deepEqual(m.sheets.steel.rows[1].values,["5"])],
  ["all selector",{kind:"select",value:"__all"},m=>assert.equal(m.activeType,"__all")]
])test(name+": real guarded transaction, exact readback, adoption and reload preserve all unrelated data",async()=>{
  const h=harness(),before=h.cloud,result=await h.api.run({...request,baselineMaterials:before.inventoryMaterials});assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);assert.equal(h.commits,1);assert.equal(h.reads,2);verify(h.cloud.inventoryMaterials);
  assert.deepEqual(unrelated(h.cloud),unrelated(before));assert.deepEqual(h.local.inventoryMaterials,h.cloud.inventoryMaterials);
  assert.equal((await h.reload()).recovery,false);assert.deepEqual(h.local,h.cloud);assert.equal(h.api.undoCount(),1);
});
test("unchanged high precision is a no-op with no rounding, write or undo capture",async()=>{const h=harness(),before=h.cloud,r=await h.api.run(action("thickness",{value:"0.09375"}));assert.equal(r.noOp,true);assert.equal(h.commits,0);assert.equal(h.api.undoCount(),0);assert.deepEqual(h.cloud,before);});
test("changing the mandatory thickness explicitly retains a blank required row and original values",async()=>{const h=harness(),r=await h.api.run(action("thickness",{rowIndex:0,value:"1/32"}));assert.equal(r.saved,true,r.error);const rows=h.cloud.inventoryMaterials.sheets.steel.rows;assert.equal(rows[0].thickness,"0.03125");assert.deepEqual(rows[0].values,["2","3"]);assert.deepEqual(rows[1],{thickness:"0.0625",values:["",""]});});
test("mandatory row cannot be deleted and no save/undo occurs",async()=>{const h=harness(),before=h.cloud,r=await h.api.run(action("delete-row",{rowIndex:0}));assert.match(r.error,/required/);assert.equal(h.transactions,0);assert.equal(h.api.undoCount(),0);assert.deepEqual(h.local,before);});
for(const kind of ["add-column","insert-column"])test(kind+": 25th shared column is rejected before persistence",async()=>{const h=harness();h.editCloud(c=>{for(const s of Object.values(c.inventoryMaterials.sheets)){s.columns=Array.from({length:24},(_,i)=>"QTY "+i);s.rows.forEach(r=>{r.values=Array(24).fill("");});}});await h.reload();const before=h.cloud,r=await h.api.run(action(kind));assert.match(r.error,/24/);assert.equal(h.transactions,0);assert.deepEqual(h.local,before);});
test("undo persists only the inverse of a confirmed action and survives reload",async()=>{const h=harness(),before=h.cloud;assert.equal((await h.api.run(action("cell",{value:"42"}))).saved,true);assert.equal((await h.api.run({kind:"undo"})).saved,true);assert.equal(h.api.undoCount(),0);assert.equal(h.commits,2);await h.reload();assert.deepEqual(h.cloud.inventoryMaterials,before.inventoryMaterials);assert.deepEqual(unrelated(h.cloud),unrelated(before));});
test("Undo of Add Type removes only its owned new sheet under Firestore field-mask semantics",async()=>{const h=harness(),before=h.cloud;assert.equal((await h.api.run({kind:"add-type",value:"Titanium"})).saved,true);assert.deepEqual(h.writeOptions,{mergeFields:["inventoryMaterials","syncMeta"]});assert.equal((await h.api.run({kind:"undo"})).saved,true);assert.equal(Object.hasOwn(h.cloud.inventoryMaterials.sheets,"titanium"),false);await h.reload();assert.deepEqual(h.cloud.inventoryMaterials,before.inventoryMaterials);assert.deepEqual(unrelated(h.cloud),unrelated(before));});
test("rejected undo retains confirmed history",async()=>{let fail=false;const h=harness({afterQueue:()=>{if(fail)throw Object.assign(Error("denied"),{code:"permission-denied"});}});await h.api.run(action("cell",{value:"42"}));fail=true;const before=h.local,r=await h.api.run({kind:"undo"});assert.equal(r.saved,false);assert.equal(h.api.undoCount(),1);assert.deepEqual(h.local,before);});
for(const [name,options]of [["Recovery Mode",{recovery:true}],["autosave disabled",{autosaveDisabled:true}],["preview read-only",{preview:true}],["pending normal save",{pending:true}],["stale loaded revision",{loadedRevision:6}],["protected rejection",{blockProtected:true}],["permission denied",{reject:true}]])test(name+": leaves no false-success local state or undo",async()=>{const h=harness(options),before=h.local,r=await h.api.run(action("cell",{value:"42"}));assert.equal(r.saved,false);assert.equal(r.indeterminate,false);assert.equal(h.commits,0);assert.equal(h.api.undoCount(),0);assert.deepEqual(h.local,before);});
test("transaction CAS conflict preserves the newer remote unrelated change",async()=>{const h=harness({beforeTransaction:(_w,c)=>{c.syncMeta.rev++;c.inventory[0].note="newer";}}),before=h.local,r=await h.api.run(action("cell",{value:"42"}));assert.equal(r.saved,false);assert.equal(r.errorCode,"revision_conflict");assert.equal(h.commits,0);assert.deepEqual(h.local,before);assert.equal(h.cloud.inventory[0].note,"newer");});
test("same-revision unrelated source drift is rejected inside the transaction",async()=>{const h=harness({beforeTransaction:(_w,c)=>{c.unknownFutureState.retain[0].payload="remote edit";}}),r=await h.api.run(action("cell",{value:"42"}));assert.equal(r.errorCode,"mutation_source_changed");assert.equal(h.commits,0);assert.equal(h.cloud.unknownFutureState.retain[0].payload,"remote edit");});
test("transaction callback retries retain the frozen action and commit once",async()=>{const h=harness({retry:true}),r=await h.api.run(action("cell",{value:"42"}));assert.equal(r.saved,true,r.error);assert.equal(h.commits,1);});
test("lost acknowledgement after commit is reconciled by exact server proof without retry",async()=>{const h=harness({loseAck:true}),r=await h.api.run(action("cell",{value:"42"}));assert.equal(r.saved,true,r.error);assert.equal(r.reconciledAfterUncertainWrite,true);assert.equal(h.transactions,1);assert.equal(h.commits,1);assert.equal(h.window.__recoveryInspectMode,false);assert.equal(h.window.__lastIndeterminateSave,null);assert.equal(h.api.undoCount(),1);});
test("unknown outcome without commit is unconfirmed, suspended, retains evidence, never retries",async()=>{const h=harness({unknownWithoutCommit:true}),before=h.local,r=await h.api.run(action("cell",{value:"42"}));assert.equal(r.saved,false);assert.equal(r.indeterminate,true);assert.equal(h.reads,2);assert.equal(h.transactions,1);assert.deepEqual(h.local,before);assert.equal(h.window.__autosaveDisabled,true);assert.equal(h.api.undoCount(),0);assert.equal(r.evidence.intended.inventoryMaterials.sheets.steel.rows[1].values[0],"42");});
for(const option of ["mismatch","readFailure"])test(option+": acknowledged write stays unconfirmed until exact SERVER proof",async()=>{const h=harness({[option]:true}),before=h.local,r=await h.api.run(action("cell",{value:"42"}));assert.equal(h.commits,1);assert.equal(r.saved,false);assert.equal(r.indeterminate,true);assert.equal(h.api.undoCount(),0);assert.deepEqual(h.local,before);assert.equal(h.window.__recoveryInspectMode,true);});
test("concurrent local unrelated edit before queue rejects without undo or broad rollback",async()=>{const h=harness({beforeTransaction:w=>{w.inventory[0].note="local concurrent";}}),r=await h.api.run(action("cell",{value:"42"}));assert.equal(r.saved,false);assert.equal(h.commits,0);assert.equal(h.window.inventory[0].note,"local concurrent");assert.equal(h.window.inventoryMaterials.sheets.steel.rows[1].values[0],"4");});
test("concurrent local edit after commit blocks adoption and preserves both sources of evidence",async()=>{const h=harness({duringRead:(n,w)=>{if(n===2)w.inventory[0].note="local concurrent";}}),r=await h.api.run(action("cell",{value:"42"}));assert.equal(h.commits,1);assert.equal(r.saved,false);assert.equal(h.window.inventory[0].note,"local concurrent");assert.equal(h.window.inventoryMaterials.sheets.steel.rows[1].values[0],"4");assert.equal(h.cloud.inventoryMaterials.sheets.steel.rows[1].values[0],"42");});
test("stale inline grid evidence cannot retarget a changed row",async()=>{const h=harness(),expectedMaterials=h.cloud.inventoryMaterials;h.editCloud(c=>{c.inventoryMaterials.sheets.steel.rows[1].values[0]="newer";c.syncMeta.rev++;});await h.reload();const r=await h.api.run({...action("cell",{value:"42"}),expectedMaterials});assert.equal(r.saved,false);assert.match(r.error,/grid changed/);assert.equal(h.commits,0);});
test("one material action at a time; ordinary saves cannot queue the old live model",async()=>{let release;const blocked=new Promise(r=>{release=r;});const h=harness({duringRead:async n=>{if(n===1)await blocked;}});const saving=h.api.run(action("cell",{value:"42"}));await new Promise(r=>setImmediate(r));assert.equal(h.window.__inventoryMaterialMutationPending,true);assert.equal((await h.api.run(action("cell",{value:"43"}))).saved,false);assert.equal((await h.c.saveCloudNow()).errorCode,"material_verification_pending");release();assert.equal((await saving).saved,false);assert.equal(h.commits,0);});
test("beforeunload protects only a material action still awaiting confirmation",async()=>{let prevented=0,release;const blocked=new Promise(r=>{release=r;}),h=harness({duringRead:async n=>{if(n===1)await blocked;}});h.events.beforeunload({preventDefault:()=>prevented++});assert.equal(prevented,0);const saving=h.api.run(action("cell",{value:"42"}));h.events.beforeunload({preventDefault:()=>prevented++});assert.equal(prevented,1);release();assert.equal((await saving).saved,true);h.events.beforeunload({preventDefault:()=>prevented++});assert.equal(prevented,1);});
test("Enter/blur commit only once; Escape/blur cancels without committing",async()=>{let commits=0,cancels=0;const editor=materials.createInlineSettlement(async()=>{commits++;},()=>cancels++);await editor.commit();await editor.commit();editor.cancel();assert.equal(commits,1);assert.equal(cancels,0);const escaped=materials.createInlineSettlement(()=>commits++,()=>cancels++);escaped.cancel();escaped.commit();assert.equal(commits,1);assert.equal(cancels,1);});
test("actual thickness markup carries exact raw evidence alongside rounded display",()=>{const c=vm.createContext({window:{inventoryMaterialEditMode:true,OMAXInventoryMaterialMutations:materials},formatThicknessSixteenths:n=>n===2?"1/8":"1/16"});vm.runInContext(fn(views,"formatMaterialThicknessDisplay")+fn(views,"materialSheetTableHTML"),c);const html=c.materialSheetTableHTML(model(),"steel");assert.match(html,/data-material-value="0\.09375">1\/8/);assert.match(html,/The 1\/16 row is required" disabled/);assert.match(html,/Columns are shared/);});
test("actual material handlers use only confirmed coordinator; raw editor values and confirmed Undo",()=>{const handlers=renderers.slice(renderers.indexOf("  const persistInventoryMaterials =",renderers.indexOf("function renderInventory(){")),renderers.indexOf("\n  if (searchInput){",renderers.indexOf("function renderInventory(){")));const material=handlers.slice(handlers.indexOf("  window.inventoryMaterialEditMode"));assert.doesNotMatch(material,/saveCloudDebounced|saveCloudNow|window\.inventoryMaterials\s*=/);assert.match(material,/kind:"undo"/);assert.match(material,/data-material-value/);assert.match(material,/createInlineSettlement/);assert.match(handlers,/await saving/);});
test("incompatible legacy shape fails without seeding, truncating, changing IDs or normalizing data",async()=>{const h=harness();h.editCloud(c=>{c.inventoryMaterials.sheets.steel.columns.push("unshared");});await h.reload();const before=h.cloud,r=await h.api.run(action("cell",{value:"42"}));assert.equal(r.saved,false);assert.equal(h.commits,0);assert.deepEqual(h.cloud,before);});

function ui(h){
  const calls=[],editors=[],controls={};let saving;
  const node=()=>({listeners:{},addEventListener(name,handler){this.listeners[name]=handler;},removeEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],appendChild(){},focus(){},select(){}});
  const content=node();
  for(const name of ["materialEditModeBtn","materialTypeSelect","materialAddTypeBtn"])controls[name]=node();
  content.querySelector=selector=>controls[selector.replace(/^#/,"")] || null;
  const actual=h.api;h.window.inventoryMaterialMutationApi={...actual,run:request=>{calls.push(request);saving=actual.run(request);return saving;}};
  Object.assign(h.c,{setAppSettingsContext(){},wireDashboardSettingsMenu(){},viewInventory:()=>"fixture",normalizeInventoryMaterials:value=>clone(value),
    document:{getElementById:id=>id==="content"?content:null,createElement:()=>{const input=node();input.value="";editors.push(input);return input;}},
    HTMLInputElement:class{},HTMLTextAreaElement:class{},location:{hash:"#/inventory"}});
  h.window.inventorySection="material";h.window.inventoryMaterialEditMode=true;
  vm.runInContext(fn(renderers,"renderInventory"),h.c);h.c.renderInventory();
  const click=(attribute,index=1)=>content.listeners.click({target:{closest:selector=>selector==="["+attribute+"]"?{getAttribute:name=>name===attribute?"steel":name==="data-row-index"||name==="data-col-index"?String(index):null}:null},preventDefault(){},stopPropagation(){}});
  const edit=(kind,raw,{typeId="steel",rowIndex=1,colIndex=0}={})=>{
    const cell=node();cell.getAttribute=name=>({"data-edit-kind":kind,"data-type-id":typeId,"data-row-index":String(rowIndex),"data-col-index":String(colIndex),"data-material-value":raw})[name]??null;
    content.listeners.dblclick({target:{closest:()=>cell}});return editors.at(-1);
  };
  return {calls,content,controls,click,edit,finish:async()=>{const result=saving?await saving:null;await new Promise(r=>setImmediate(r));return result;}};
}
for(const [attribute,kind]of [["data-material-row-add","add-row"],["data-material-row-add-after","insert-row"],["data-material-row-delete","delete-row"],["data-material-col-add","add-column"],["data-material-col-add-after","insert-column"],["data-material-col-delete-index","delete-column"]])test("actual "+attribute+" callback persists once and renders the confirmed result",async()=>{
  const h=harness(),u=ui(h);u.click(attribute,1);assert.equal(u.calls[0].kind,kind);assert.equal(h.api.isBusy(),true);assert.equal(h.window.inventoryMaterials.sheets.steel.rows[1].values[0],"4");await u.finish();assert.equal(h.commits,1);assert.deepEqual(h.local.inventoryMaterials,h.cloud.inventoryMaterials);
});
for(const [kind,initial,value]of [["cell","4","42"],["material-name","Steel","Tool Steel"],["column","QTY 4x8","5x12"],["thickness","0.09375","7/64"]])test("actual "+kind+" editor Enter plus blur performs one confirmed save",async()=>{
  const h=harness(),u=ui(h),input=u.edit(kind,initial);input.value=value;input.listeners.keydown({key:"Enter",preventDefault(){}});input.listeners.blur();assert.equal(u.calls.length,1);await u.finish();assert.equal(h.commits,1);assert.equal(h.api.undoCount(),1);
});
test("actual unchanged precision editor and Escape never dispatch a mutation on blur",async()=>{const h=harness(),u=ui(h),unchanged=u.edit("thickness","0.09375");assert.equal(unchanged.value,"0.09375");unchanged.listeners.keydown({key:"Enter",preventDefault(){}});unchanged.listeners.blur();const cancelled=u.edit("thickness","0.09375");cancelled.value="1/8";cancelled.listeners.keydown({key:"Escape",preventDefault(){}});cancelled.listeners.blur();assert.equal(u.calls.length,0);assert.equal(h.commits,0);assert.equal(h.cloud.inventoryMaterials.sheets.steel.rows[1].thickness,"0.09375");});
test("actual selector, add type and Ctrl+Z callbacks use verified persistence",async()=>{const h=harness(),u=ui(h);u.controls.materialTypeSelect.value="__all";u.controls.materialTypeSelect.listeners.change();await u.finish();assert.equal(h.cloud.inventoryMaterials.activeType,"__all");h.window.prompt=()=>"Titanium";u.controls.materialAddTypeBtn.listeners.click();await u.finish();assert.equal(h.cloud.inventoryMaterials.types.at(-1).name,"Titanium");u.content.listeners.keydown({ctrlKey:true,key:"z",target:{},preventDefault(){},stopPropagation(){}});await u.finish();assert.equal(h.commits,3);assert.equal(h.cloud.inventoryMaterials.types.length,2);assert.equal(h.api.undoCount(),1);});
test("normalization round trip does not undo supported confirmed changes",async()=>{const h=harness();vm.runInContext(core.slice(core.indexOf("function gcd("),core.indexOf("function normalizeInventoryItem(")),h.c);await h.api.run(action("insert-row",{rowIndex:0}));await h.api.run(action("column",{value:"5x12"}));const once=h.c.normalizeInventoryMaterials(h.cloud.inventoryMaterials),twice=h.c.normalizeInventoryMaterials(once);assert.deepEqual(clone(once),clone(twice));assert.equal(once.sheets.steel.rows[1].thickness,"0.078125");assert.equal(once.sheets.aluminum.columns[0],"QTY 5x12");assert.equal(h.cloud.inventoryMaterials.customMaterialEvidence.retain,"exact");});
test("actual realtime listener defers material adoption until coordinator verification",async()=>{
  const h=harness();let listener;Object.assign(h.c,{workspaceStateUnsubscribe:null,localClientId:"fixture-client",setTimeout,clearTimeout});h.c.FB.docRef.onSnapshot=callback=>{listener=callback;return()=>{};};
  vm.runInContext(fn(core,"startWorkspaceStateListener"),h.c);h.c.startWorkspaceStateListener();
  const before=h.local,incoming=h.cloud;incoming.syncMeta.rev++;incoming.inventoryMaterials.activeType="__all";
  h.window.inventoryMaterialMutationApi={isBusy:()=>true};listener({exists:true,data:()=>incoming,metadata:{hasPendingWrites:false}});assert.deepEqual(h.local,before);
});
test("body-focus Ctrl+Z uses confirmed material Undo and never whole-app history",async()=>{
  const h=harness(),u=ui(h);await h.api.run(action("cell",{value:"42"}));
  h.c.undoLastChange=()=>{throw Error("Must not use whole-app undo");};h.c.redoLastUndo=()=>{throw Error("Must not use whole-app redo");};
  vm.runInContext(fn(core,"isEditableTarget"),h.c);
  const start=core.indexOf('window.addEventListener("keydown", (e)=>{');vm.runInContext(core.slice(start,core.indexOf("\n});",start)+4),h.c);
  const event={ctrlKey:true,key:"z",target:{},preventDefault(){this.defaultPrevented=true;}};
  h.events.keydown(event);await u.finish();assert.equal(h.commits,2);assert.equal(h.cloud.inventoryMaterials.sheets.steel.rows[1].values[0],"4");
  h.events.keydown(event);await u.finish();assert.equal(h.commits,2,"already handled event must not dispatch a second Undo");
  h.events.keydown({...event,defaultPrevented:false,key:"y"});assert.equal(h.commits,2,"material view never dispatches whole-app Redo");
});
test("actual rejected inline save rerenders unchanged business evidence and reports failure",async()=>{const h=harness({reject:true}),u=ui(h),messages=[];h.c.toast=message=>messages.push(message);const input=u.edit("cell","4");input.value="42";input.listeners.blur();await u.finish();assert.equal(h.commits,0);assert.equal(h.window.inventoryMaterials.sheets.steel.rows[1].values[0],"4");assert.equal(h.api.undoCount(),0);assert.match(messages.join(" "),/Permission denied/);});
test("writer validators inspect isolated copies and cannot modify the committed state",async()=>{
  const h=harness(),before=h.cloud,next=clone(before);next.inventoryMaterials.sheets.steel.rows[1].values[0]="42";
  const result=await h.c.writeAuthoritativeStateSnapshot(next,{merge:true},{expectedRevision:7,validateSourceState:remote=>{remote.inventory[0].qtyNew=999;return true;},validatePreparedState:pending=>{pending.inventory[0].qtyNew=888;return true;}});
  assert.equal(result.saved,true,result.error);assert.deepEqual(h.cloud.inventory,before.inventory);assert.equal(h.cloud.inventoryMaterials.sheets.steel.rows[1].values[0],"42");
});
for(const change of [state=>{state.syncMeta.rev++;},state=>{state.syncMeta.updatedBy="other-client";}])test("server revision/actor must match the acknowledged material transaction",async()=>{const h=harness({duringRead:(n,_w,c)=>{if(n===2)change(c);}}),r=await h.api.run(action("cell",{value:"42"}));assert.equal(r.saved,false);assert.equal(r.indeterminate,true);assert.equal(h.transactions,1);assert.equal(h.api.undoCount(),0);});

const browserBaselineMeta={rev:1791313066981,updatedAtISO:"2026-10-06T16:17:46.981Z",updatedBy:"previous-client",retainedEvidence:"exact"};
for(const rotateClientIdAfterCommit of [false,true])test("INV-01C blank Aluminum 1/16 -> 10 -> Enter -> save -> SERVER readback"+(rotateClientIdAfterCommit?" with changing client lookup":""),async()=>{
  const h=harness({blankAluminum:true,baselineSyncMeta:browserBaselineMeta,rotateClientIdAfterCommit}),before=h.cloud,u=ui(h),writes=[];
  const writer=h.c.writeAuthoritativeStateSnapshot;
  h.c.writeAuthoritativeStateSnapshot=async(...args)=>{assert.equal(args[0].inventoryMaterials.sheets.aluminum.rows[0].values[0],"10");const result=await writer(...args);writes.push(clone(result));return result;};
  const input=u.edit("cell","",{typeId:"aluminum",rowIndex:0,colIndex:0});input.value="10";
  input.listeners.keydown({key:"Enter",preventDefault(){}});input.listeners.blur();
  const result=await u.finish();
  assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);assert.equal(result.indeterminate,false);
  assert.equal(writes.length,1);assert.equal(writes[0].saved,true);assert.equal(writes[0].stateWriteCompleted,true);assert.equal(writes[0].indeterminate,false);
  assert.equal(u.calls[0].baselineMaterials.sheets.aluminum.rows[0].values[0],"","grid baseline remains a pre-write guard only");
  assert.equal(Object.hasOwn(u.calls[0],"expectedMaterials"),false);
  assert.equal(h.cloud.inventoryMaterials.sheets.aluminum.rows[0].values[0],"10");assert.equal(h.local.inventoryMaterials.sheets.aluminum.rows[0].values[0],"10");
  assert.ok(h.cloud.syncMeta.rev>before.syncMeta.rev);assert.notEqual(h.cloud.syncMeta.updatedAtISO,before.syncMeta.updatedAtISO);assert.equal(h.cloud.syncMeta.updatedBy,"fixture-client");assert.equal(h.cloud.syncMeta.retainedEvidence,"exact");
  assert.deepEqual(unrelated(h.cloud),unrelated(before));assert.equal(h.window.__recoveryInspectMode,false);assert.equal(h.window.__autosaveDisabled,false);assert.equal(h.diagnostics,0);assert.equal(h.transactions,1);
  assert.equal((await h.reload()).recovery,false);assert.equal(h.local.inventoryMaterials.sheets.aluminum.rows[0].values[0],"10");assert.equal(h.transactions,1,"verified adoption and reload must not save again");
});
for(const value of ["","20"])test("INV-01C old/wrong authoritative material value "+JSON.stringify(value)+" still suspends verification",async()=>{
  const h=harness({blankAluminum:true,readbackMutation:state=>{state.inventoryMaterials.sheets.aluminum.rows[0].values[0]=value;}}),result=await h.api.run({kind:"cell",typeId:"aluminum",rowIndex:0,colIndex:0,value:"10",baselineMaterials:h.cloud.inventoryMaterials});
  assert.equal(h.commits,1);assert.equal(result.saved,false);assert.equal(result.verified,false);assert.equal(result.indeterminate,true);assert.equal(h.window.__recoveryInspectMode,true);assert.equal(h.transactions,1);assert.equal(h.api.undoCount(),0);
  assert.equal(result.evidence.source.inventoryMaterials.sheets.aluminum.rows[0].values[0],"");
  assert.equal(result.evidence.intended.inventoryMaterials.sheets.aluminum.rows[0].values[0],"10");
  assert.equal(result.evidence.serverReadback.inventoryMaterials.sheets.aluminum.rows[0].values[0],value);
  assert.equal(Object.hasOwn(result.evidence.action,"expectedMaterials"),false);
  assert.equal(Object.hasOwn(result.evidence.action,"baselineMaterials"),false);
});
for(const [name,change] of [
  ["unrelated protected business",state=>{state.inventory[0].qtyNew++;}],
  ["saveMeta (not written by the isolated material writer)",state=>{state.saveMeta={lastSaveStatus:"unexpected"};}],
  ["unknown sync metadata",state=>{state.syncMeta.retainedEvidence="changed";}],
  ["invalid writer timestamp",state=>{state.syncMeta.updatedAtISO="invalid";}]
])test("INV-01C "+name+" mismatch is never exempted",async()=>{
  const h=harness({blankAluminum:true,baselineSyncMeta:browserBaselineMeta,readbackMutation:change}),result=await h.api.run({kind:"cell",typeId:"aluminum",rowIndex:0,colIndex:0,value:"10",baselineMaterials:h.cloud.inventoryMaterials});
  assert.equal(result.saved,false);assert.equal(result.verified,false);assert.equal(result.indeterminate,true);assert.equal(h.transactions,1);assert.equal(h.window.__recoveryInspectMode,true);
});
test("INV-01C real client-ID helper with localStorage quota failure still verifies an acknowledged save",async()=>{
  const h=harness({blankAluminum:true,baselineSyncMeta:browserBaselineMeta,quotaClientId:true}),u=ui(h),input=u.edit("cell","",{typeId:"aluminum",rowIndex:0});
  input.value="10";input.listeners.keydown({key:"Enter",preventDefault(){}});input.listeners.blur();const result=await u.finish();
  assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);assert.equal(h.window.__recoveryInspectMode,false);assert.equal(h.transactions,1);assert.equal(h.diagnostics,0);
  assert.notEqual(h.c.getCloudSyncClientId(),h.cloud.syncMeta.updatedBy,"a fresh lookup is not the acknowledged writing client");
  assert.equal(h.local.inventoryMaterials.sheets.aluminum.rows[0].values[0],"10");assert.equal((await h.reload()).recovery,false);assert.equal(h.transactions,1);
});
