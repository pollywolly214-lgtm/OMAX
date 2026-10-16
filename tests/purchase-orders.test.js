"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),crypto=require("node:crypto");
const orders=require("../js/purchaseOrders"),atomic=require("../js/atomicPersistence"),firewall=require("../js/cuttingFileContentFirewall"),identities=require("../js/globalIdentityRepair"),financials=require("../js/purchaseFinancials");
const core=fs.readFileSync("js/core.js","utf8"),renderers=fs.readFileSync("js/renderers.js","utf8"),clone=structuredClone;
const item=(id,cost,qty=1,tax=0)=>({lineId:id,purchased:`Item ${id}`,partNumber:id,cost:String(cost),qty:String(qty),tax:String(tax)});
const draft=(items=[item("a",10)],shipping=20,orderId="order-a")=>({orderId,date:"2026-10-15",shipping:String(shipping),tax:"0",items});
const allocations=value=>orders.plan(value).rows.map(row=>orders.cents(row.shipping));
test("one line receives all shipping",()=>assert.deepEqual(allocations(draft([item("a",10)],20)),[2000]));
test("10/50/40 merchandise allocates 100 shipping as 10/50/40",()=>assert.deepEqual(allocations(draft([item("a",10),item("b",50),item("c",40)],100)),[1000,5000,4000]));
test("quantity-extended 30/70 allocates 20 shipping as 6/14; tax is order-level",()=>{
  const plan=orders.plan({...draft([item("a",10,3),item("b",70)],20),tax:"5"});assert.deepEqual(plan.rows.map(row=>row.shipping),[6,14]);
  assert.deepEqual(plan.rows.map(row=>row.tax),[1.5,3.5]);
  assert.equal(plan.totalCents,12500);assert.equal(financials.getPurchaseFinancials(plan.rows[0]).totalSpend,37.5);
});
test("largest remainder uses stable IDs as ties regardless of input order",()=>{
  const a=orders.plan(draft([item("c",1),item("a",1),item("b",1)],0.02));const b=orders.plan(draft([item("b",1),item("c",1),item("a",1)],0.02));
  const byId=plan=>Object.fromEntries(plan.rows.slice().sort((a,b)=>a.lineId.localeCompare(b.lineId)).map(row=>[row.lineId,row.shipping]));
  assert.deepEqual(byId(a),{a:0.01,b:0.01,c:0});assert.deepEqual(byId(a),byId(b));
});
test("many uneven penny allocations reconcile exactly, including zero-cost lines",()=>{
  for(let count=1;count<25;count++)for(let shipping=0;shipping<70;shipping++){
    const lines=Array.from({length:count},(_,i)=>item(`line-${i}`,String(i/100),i+1));if(count===1)lines[0].cost="1";
    const tax=69-shipping,plan=orders.plan({...draft(lines,String(shipping/100)),tax:String(tax/100)});
    assert.equal(plan.rows.reduce((sum,row)=>sum+orders.cents(row.shipping),0),shipping);
    assert.equal(plan.rows.reduce((sum,row)=>sum+orders.cents(row.tax),0),tax);
  }
});
test("shipping and tax use independent stable remainder rankings and the requested 10/50/40 example",()=>{
  const example=orders.plan({...draft([item("a",10),item("b",50),item("c",40)],20),tax:"10"});
  assert.deepEqual(example.rows.map(row=>[row.shipping,row.tax]),[[2,1],[10,5],[8,4]]);assert.equal(example.totalCents,13000);
  const lines=[item("c",1),item("a",1),item("b",1)];
  const byId=items=>Object.fromEntries(orders.plan({...draft(items,".02"),tax:".01"}).rows.map(row=>[row.lineId,[row.shipping,row.tax]]));
  assert.deepEqual(byId(lines),{c:[0,0],a:[.01,.01],b:[.01,0]});assert.deepEqual(byId(lines.slice().reverse()),byId(lines));
});
for(const tax of ["-1","bad","0.001","Infinity","",undefined])test(`reject invalid order tax ${String(tax)}`,()=>assert.throws(()=>orders.plan({...draft(),tax})));
test("zero-cost orders reject either charge; old per-item tax cannot leak into new allocations",()=>{
  assert.throws(()=>orders.plan({...draft([item("a",0)],0),tax:".01"}),/merchandise total is \$0/);
  const value=orders.plan({...draft([item("a",10,1,99),item("b",10,1,99)],0),tax:"1"});
  assert.deepEqual(value.rows.map(row=>row.tax),[.5,.5]);assert.equal(value.totalCents,2100);
});
test("optional text PO preserves zeros/alphanumeric values on every line; blanks create no metadata",()=>{
  for(const poNumber of ["0001250","0012-AB","repeat reference"]){
    const value={...draft([item("a",1),item("b",2)],0),poNumber},before=JSON.stringify(value),plan=orders.plan(value);
    assert.deepEqual(plan.rows.map(row=>row.poNumber),[poNumber,poNumber]);assert.equal(JSON.stringify(value),before);
    assert.equal(orders.plan({...value,orderId:"another-order"}).rows[0].poNumber,poNumber);
  }
  for(const poNumber of [undefined,"","   "])assert.equal(Object.hasOwn(orders.plan({...draft(),poNumber}).rows[0],"poNumber"),false);
});
test("pre-refinement saved orders retain per-line tax, old metadata and IDs without recalculation",()=>{
  const old={...orders.plan(draft()).rows[0],tax:9.125,shipping:2.125,custom:{retain:true}};
  delete old.orderTaxCents;delete old.taxAllocationVersion;
  const source={receiptTrackerWeeks:[{key:"2026-W42",rows:[old]}]},before=JSON.stringify(source);
  const next=orders.append(source,orders.plan({...draft([item("new-line",3)],0,"new-order"),tax:"1",poNumber:"0012-A"}));
  assert.equal(JSON.stringify(source),before);assert.deepEqual(next.state.receiptTrackerWeeks[0].rows[0],old);
});
test("zero merchandise/zero shipping is valid; positive shipping is blocked",()=>{
  assert.deepEqual(allocations(draft([item("a",0),item("b",0)],0)),[0,0]);assert.throws(()=>orders.plan(draft([item("a",0)],1)),/merchandise total is \$0/);
});
for(const [name,change]of [
  ["empty",d=>d.items=[]],["missing description",d=>d.items[0].purchased=" "],["missing date",d=>d.date=""],["impossible date",d=>d.date="2026-02-30"],
  ["decimal qty",d=>d.items[0].qty="1.5"],["zero qty",d=>d.items[0].qty="0"],["negative qty",d=>d.items[0].qty="-1"],["blank qty",d=>d.items[0].qty=""],["unsafe qty",d=>d.items[0].qty="9007199254740992"],
  ["negative cost",d=>d.items[0].cost="-1"],["infinite cost",d=>d.items[0].cost="Infinity"],["blank cost",d=>d.items[0].cost=""],["third decimal",d=>d.items[0].cost="0.001"],
  ["negative shipping",d=>d.shipping="-1"],["invalid shipping",d=>d.shipping="bad"],["negative tax",d=>d.tax="-1"],["unsafe total",d=>d.items[0].qty=Number.MAX_SAFE_INTEGER],
  ["duplicate line ID",d=>d.items.push({...d.items[0]})],["missing order ID",d=>d.orderId=""]
])test(`reject ${name}`,()=>{const value=draft();change(value);assert.throws(()=>orders.plan(value));});
test("same-date orders have distinct stable IDs; planning never regenerates IDs or mutates drafts",()=>{
  const a=orders.newDraft("2026-10-15",crypto),b=orders.newDraft("2026-10-15",crypto);a.items[0].purchased="A";b.items[0].purchased="B";
  assert.notEqual(a.orderId,b.orderId);assert.notEqual(a.items[0].lineId,b.items[0].lineId);const before=JSON.stringify(a);
  assert.deepEqual(orders.plan(a),orders.plan(a));assert.equal(JSON.stringify(a),before);assert.equal(orders.plan(a).rows[0].orderId,a.orderId);
});
test("mixed legacy/order appends preserve exact historical records and deduplicate retries",()=>{
  const legacy={date:"2025-01-01",qty:"1.5",cost:"3.125",shipping:"2.125",id:"legacy",import_event_id:"source",custom:{retain:true}};
  const source={syncMeta:{rev:7},receiptTrackerWeeks:[{key:"2025-W01",rows:[legacy]}]},before=JSON.stringify(source),order=orders.plan(draft());
  const next=orders.append(source,order);assert.equal(JSON.stringify(source),before);assert.deepEqual(next.state.receiptTrackerWeeks[0].rows,[legacy]);
  assert.equal(orders.append(next.state,order).alreadySaved,true);const two=orders.append(next.state,orders.plan(draft([item("b",1)],1,"order-b")));
  assert.equal(two.state.receiptTrackerWeeks[1].rows.length,2);assert.notEqual(two.state.receiptTrackerWeeks[1].rows[0].orderId,two.state.receiptTrackerWeeks[1].rows[1].orderId);
  assert.throws(()=>orders.append(next.state,orders.plan(draft([item("a",12)]))),/already exists/);
  assert.throws(()=>orders.append(next.state,orders.plan(draft([item("a",10)],20,"other-order"))),/line ID/);
});

function base(){return {schema:72,syncMeta:{rev:7},saveMeta:{retain:"exact"},syncProcessLog:[{retain:true}],inventory:[{id:"inv",name:"Part",pn:"PN",price:10}],tasksInterval:[],tasksAsReq:[],
  cuttingJobs:[],completedCuttingJobs:[],totalHistory:[{dateISO:"2026-10-01",hours:100}],dailyCutHours:[{dateISO:"2026-10-01",hours:3}],pumpEff:{entries:[]},
  receiptTrackerWeeks:[{key:"2025-W01",year:2025,week:1,startISO:"2024-12-30",endISO:"2025-01-05",rows:[{date:"2025-01-03",purchased:"Legacy",cost:"3.125",qty:"1.5",shipping:"2.125",import_event_id:"legacy-source",custom:{retain:true}}]}],customEvidence:{retain:true}};}
function harness(flags={}){
  let server=clone(base()),live=clone(server),version=0,commits=0,reads=0,writes=0,adoptions=0,backups=0;
  let context,releaseRead;const callbacks={};
  const db={async runTransaction(callback){for(let retry=0;retry<3;retry++){
    const priorVersion=version;let pending;
    const result=await callback({get:async ref=>{
      reads++;flags.onRead?.(reads,{context,server,mutate:()=>{context.lastLocalMutationAt++;live.inventory[0].name="Concurrent";}});
      if(reads>=3&&flags.readFailure)throw Error("read failed");
      if(reads>=3&&flags.readTimeout)await new Promise(resolve=>{releaseRead=resolve;});
      return {exists:true,data:()=>clone(server),ref:{path:flags.wrongPath&&reads>=3?"wrong":ref.path,firestore:db},metadata:{fromCache:!!(flags.cached&&reads>=3),hasPendingWrites:false}};
    },set(ref,next){writes++;pending=JSON.parse(JSON.stringify(next));}});
    if(!pending)return result;
    if(flags.retryOnce&&retry===0){version++;continue;}
    if(priorVersion!==version)continue;
    if(flags.permission)throw Object.assign(Error("permission denied"),{code:"permission-denied"});
    if(flags.unknownBefore)throw Error("network outcome unknown");
    server={...server,...pending};version++;commits++;
    if(flags.localAfterCommit){context.lastLocalMutationAt++;live.inventory[0].name="Concurrent";}
    if(flags.wrongValue)server.receiptTrackerWeeks.at(-1).rows.at(-1).shipping=99;
    if(flags.unrelatedAfterCommit)server.inventory[0].name="Other server edit";
    if(flags.unknownAfter)throw Error("acknowledgement lost");
    return result;
  }throw Object.assign(Error("contention"),{code:"aborted"});}};
  const window={OMAXPurchaseOrders:orders,OMAXAtomicPersistence:atomic,CuttingFileContentFirewall:firewall,__lastLoadedCloudState:clone(server),__loadedCloudRevisionForSaveGuard:7,
    addEventListener:(event,callback)=>{callbacks[event]=callback;}};
  context=vm.createContext({window,FB:{ready:true,user:{uid:"fixture"},db,docRef:{path:"workspaces/fixture/app/state"},app:{options:{projectId:"fixture"}}},cloudSaveQueue:Promise.resolve(),hasPendingLocalChanges:!!flags.pending,lastLocalMutationAt:0,
    canWriteCloud:()=>!flags.readonly&&!window.__recoveryInspectMode&&!window.__autosaveDisabled,isVercelPreviewRuntime:()=>!!flags.preview,
    snapshotState:()=>clone(live),compactStateForStorage:value=>value,persistLocalStateBackup:()=>{backups++;},scanAuthoritativeCutFileContent:firewall.scanCuttingFileContent,
    cloudSaveNoWriteFailure:(code,error)=>({saved:false,stateWriteAttempted:false,definiteFailure:true,errorCode:code,error}),
    adoptIdentityCheckedAuthoritativeState:verified=>{adoptions++;if(flags.adoptionFailure)return{recovery:true};live=clone(verified);window.__lastLoadedCloudState=clone(verified);window.__loadedCloudRevisionForSaveGuard=verified.syncMeta.rev;return{recovery:false};},
    inventoryIdentityRepairAuthorizations:new Map(),getCloudSyncClientId:()=>"fixture",validateProtectedSavePreflight:()=>({blocked:!!flags.preflight}),
    detectDangerousProtectedFieldReduction:()=>({blocked:false}),readLocalStateBackup:()=>null,buildWindowProtectedStateForCoverage:()=>clone(live),getSaveSchemaCoverageReport:()=>({}),
    mergeTotalHistoryForSave:()=>assert.fail("Unchanged history must not be normalized"),mergeDailyCutHoursForSave:()=>assert.fail("Unchanged hours must not be normalized"),mergePumpEffForSave:()=>assert.fail("Unchanged pump must not be normalized"),
    estimatePayloadBytes:value=>Buffer.byteLength(JSON.stringify(value)),FIRESTORE_BLOCK_BYTES:975000,
    enterMissingStateRecovery(){},renderRecoveryDiagnosticsPanel(){},setTimeout:flags.readTimeout?(callback=>setTimeout(callback,5)):setTimeout,clearTimeout,console
  });
  function extractFunction(text,name){const a=text.search(new RegExp("^(?:async )?function "+name+"\\(","m")),b=text.indexOf("\n}",a);assert.ok(a>=0&&b>a,name);return text.slice(a,b+2);}
  for(const name of ["validateCuttingJobDeletionSave","validateCuttingJobHistoryRestoreSave","cuttingJobDeletionSafetyBaseline","reportCloudSaveSecondaryError","stableStringifyForIntegrity"])vm.runInContext(extractFunction(core,name),context);
  vm.runInContext(extractFunction(core,"writeAuthoritativeStateSnapshot"),context);
  if(flags.noAck){const original=context.writeAuthoritativeStateSnapshot;context.writeAuthoritativeStateSnapshot=async(...args)=>{await original(...args);return undefined;};}
  if(flags.incompleteAck){const original=context.writeAuthoritativeStateSnapshot;context.writeAuthoritativeStateSnapshot=async(...args)=>{await original(...args);return {saved:false};};}
  vm.runInContext(extractFunction(renderers,"getPurchaseOrderApi")+";this.api=getPurchaseOrderApi()",context);
  return {api:context.api,context,window,callbacks,releaseRead:()=>releaseRead?.(),get server(){return clone(server);},get live(){return clone(live);},get commits(){return commits;},get reads(){return reads;},get writes(){return writes;},get adoptions(){return adoptions;},get backups(){return backups;}};
}
test("real adapter + protected writer/CAS save every line once, read independently, adopt and reload metadata",async()=>{
  const h=harness(),before=h.server,source=draft([item("a",10,3),item("b",70)],20),result=await h.api.save(source);
  assert.equal(result.saved,true,result.error);assert.equal(result.verificationCompleted,true);assert.equal(h.commits,1);assert.equal(h.adoptions,1);assert.equal(h.reads,3);assert.equal(h.backups,2);
  assert.deepEqual(h.live,h.server);assert.deepEqual(h.server.receiptTrackerWeeks[0],before.receiptTrackerWeeks[0]);
  for(const name of Object.keys(before).filter(name=>!["receiptTrackerWeeks","syncMeta"].includes(name)))assert.deepEqual(h.server[name],before[name]);
  const rows=h.server.receiptTrackerWeeks[1].rows;assert.deepEqual(rows.map(row=>row.shipping),[6,14]);assert.deepEqual(rows.map(row=>row.lineId),["a","b"]);
  assert.equal(identities.integrity(h.server).valid,true);const commits=h.commits;const retry=await h.api.save(source);assert.equal(retry.saved,true);assert.equal(retry.alreadySaved,true);assert.equal(h.commits,commits);
});
for(const [name,flags]of [["permission",{permission:true}],["protected preflight",{preflight:true}],["pending edits",{pending:true}],["Recovery Mode",{readonly:true}],["preview",{preview:true}]])test(`${name} rejection never appends a local or partial order`,async()=>{
  const h=harness(flags),before=h.live,result=await h.api.save(draft([item("a",10),item("b",20)]));assert.equal(result.saved,false);assert.equal(h.commits,0);assert.equal(h.adoptions,0);assert.deepEqual(h.live,before);assert.equal(h.api.isUncertain(),false);
});
for(const [name,flags]of [["unknown before commit",{unknownBefore:true}],["lost acknowledgement",{unknownAfter:true}],["missing acknowledgement",{noAck:true}],["incomplete acknowledgement",{incompleteAck:true}],["readback error",{readFailure:true}],["wrong value",{wrongValue:true}],["unrelated server edit",{unrelatedAfterCommit:true}],["cached proof",{cached:true}],["wrong path",{wrongPath:true}],["local edit after commit",{localAfterCommit:true}],["failed adoption",{adoptionFailure:true}]])test(`${name} suspends safely and never blindly retries`,async()=>{
  const h=harness(flags),result=await h.api.save(draft());assert.equal(result.saved,false);assert.equal(result.indeterminate,true,result.error);assert.equal(h.window.__recoveryInspectMode,true);const writes=h.writes;
  await h.api.save(draft());assert.equal(h.writes,writes);assert.equal(h.api.isUncertain(),true);
});
test("a timed-out backend proof cannot adopt later or trigger another write",async()=>{
  const h=harness({readTimeout:true}),result=await h.api.save(draft());assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.equal(h.commits,1);assert.equal(h.adoptions,0);
  h.releaseRead();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(h.adoptions,0);assert.equal(h.commits,1);
});
test("CAS/source drift inside the transaction rejects without writes or adoption",async()=>{
  const h=harness({onRead:(count,{server})=>{if(count===2)server.syncMeta.rev++;}}),result=await h.api.save(draft());assert.equal(result.saved,false);assert.equal(h.commits,0);assert.equal(h.adoptions,0);
});
test("local edits during baseline read block before save",async()=>{
  const h=harness({onRead:(count,{mutate})=>{if(count===1)mutate();}}),result=await h.api.save(draft());assert.equal(result.saved,false);assert.equal(h.writes,0);assert.equal(h.live.inventory[0].name,"Concurrent");
});
test("double Save and SDK retries cannot duplicate order lines",async()=>{
  const h=harness({retryOnce:true}),value=draft([item("a",10),item("b",20)]);const [a,b]=await Promise.all([h.api.save(value),h.api.save(value)]);
  assert.equal(a.saved,true,a.error);assert.equal(b.saved,false);assert.equal(h.commits,1);assert.equal(h.server.receiptTrackerWeeks[1].rows.length,2);
});
test("invalid inventory reference blocks before the writer; valid link survives",async()=>{
  const h=harness(),value=draft();value.items[0].inventoryItemId="missing";assert.equal((await h.api.save(value)).saved,false);assert.equal(h.writes,0);
  value.items[0].inventoryItemId="inv";assert.equal((await h.api.save(value)).saved,true);assert.equal(h.server.receiptTrackerWeeks[1].rows[0].inventoryItemId,"inv");assert.equal(h.server.inventory[0].qtyNew,undefined);
});
test("order metadata survives the actual storage sanitizer",()=>{
  const context=vm.createContext({});const a=core.indexOf("const LARGE_CONTENT_KEY_PATTERN"),b=core.indexOf("function estimateTopLevelFieldSizes",a);
  vm.runInContext(core.slice(a,b)+";this.sanitize=sanitizeValueForStorage",context);const row=orders.plan({...draft(),tax:"1.25",poNumber:"0012-AB"}).rows[0];assert.deepEqual({...context.sanitize(row)},row);
});
test("verified save/reload retains PO and tax metadata and rejects corrupted readback",async()=>{
  const value={...draft([item("a",10),item("b",50)],20),tax:"10",poNumber:"0012-AB"},h=harness();
  assert.equal((await h.api.save(value)).saved,true);
  assert.deepEqual(h.server.receiptTrackerWeeks[1].rows,orders.plan(value).rows);assert.deepEqual(h.live,h.server);
  for(const field of ["poNumber","tax","orderTaxCents"]){
    const bad=harness({onRead:(count,{server})=>{if(count===3)server.receiptTrackerWeeks[1].rows[0][field]="corrupted";}});
    assert.equal((await bad.api.save(value)).indeterminate,true,field);assert.equal(bad.adoptions,0);assert.equal(bad.api.isUncertain(),true);
  }
});
test("Central Data Table and chart/average source include mixed lines exactly once without multiplying shipping",()=>{
  const newRows=orders.plan({...draft([item("a",10,3),item("b",70)],20),tax:"5",poNumber:"0012-AB"}).rows;
  const context=vm.createContext({...financials,window:{receiptTrackerWeeks:[{key:"2026-W42",rows:[{date:"2026-10-15",purchased:"Legacy",cost:2,qty:1,shipping:1},...newRows]}]},toHistoryDateKey:value=>value,parseDateLocal:value=>new Date(value+"T00:00:00")});
  const formatter=renderers.slice(renderers.indexOf("  const formatterCurrency ="),renderers.indexOf("  const formatHours",renderers.indexOf("  const formatterCurrency =")));
  const a=renderers.indexOf("  const purchaseDataTableRows ="),b=renderers.indexOf("  const maintenanceTrendRows",a);
  vm.runInContext(formatter+renderers.slice(a,b)+";this.table=purchaseDataTable;this.series=totalSpendSeries",context);
  assert.equal(context.table.length,3);assert.equal(context.series.length,1);assert.equal(context.series[0].value,-128);assert.equal(context.table[1].shippingLabel,"$6.00");
  assert.equal(context.table[0].poNumber,"");assert.equal(context.table[1].poNumber,"0012-AB");assert.equal(context.table[2].poNumber,"0012-AB");
});
