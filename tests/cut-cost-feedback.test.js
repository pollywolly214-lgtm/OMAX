'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const api=require('../js/cutCostFeedback'),atomic=require('../js/atomicPersistence');
const core=fs.readFileSync('js/core.js','utf8'),ui=fs.readFileSync('js/cutCostFeedbackUi.js','utf8');
const section=(start,end)=>core.slice(core.indexOf(start),core.indexOf(end,core.indexOf(start)));
function hoursHarness(){
 const ctx=vm.createContext({Date,window:{OMAXCutCostFeedback:api},DEFAULT_APP_CONFIG:{},PREDICTION_AVERAGE_WINDOWS:[{value:90}],DEFAULT_PREDICTION_AVERAGE_WINDOW:90});
 vm.runInContext(section('function parseDateLocal(', 'function normalizeAppConfig(')+section('function normalizeAppConfig(', 'function getMaintenanceCalendarNewRecordsSystem(')+section('function normalizeDailyCutHours(', 'function getDailyCutHoursEntry(')+section('function resolveEffectiveDailyCutHours(', 'function getAverageDailyCutHours('),ctx);return ctx;
}
const resolver=hoursHarness().resolveEffectiveDailyCutHours;
const row=(overrides={})=>({taskId:'task',taskName:'Filter',dateISO:'2026-10-18',...overrides});
const state=()=>({tasksInterval:[{id:'task',price:100,downtimeHours:2,completedDates:['2026-10-18'],manualHistory:[]}],tasksAsReq:[],maintenanceTasksV2:[],maintenanceOccurrencesV2:[],dailyCutHours:[{dateISO:'2026-10-18',hours:5,source:'manual'},{dateISO:'2026-10-19',hours:0,source:'manual'}],totalHistory:[{dateISO:"2026-10-17",hours:100},{dateISO:"2026-10-19",hours:105}]});
const config={...api.DEFAULTS,days:'custom',startDate:'2026-10-18',endDate:'2026-10-19'};
function calc(s=state(),rows=[row()],cfg=config){return api.calculate({state:s,rows:api.maintenanceRows(rows,s),config:cfg,today:'2026-10-19',resolve:resolver});}
test('maintenance parts + duration × $30; shared combined calculation',()=>{const out=calc();assert.equal(out.partsCost,100);assert.equal(out.laborCost,60);assert.equal(out.maintenanceCostPerHour,32);assert.equal(out.cutCostPerHour,32+api.garnet(config).costPerHour);assert.equal(out.dataCompleteness.estimatedEvents,1);});
test('occurrence-specific duration and snapshot override only their occurrence; zero is explicit',()=>{const s=state();s.tasksInterval[0].occurrenceHours={'2026-10-18':0};s.tasksInterval[0].manualHistory=[{dateISO:'2026-10-18',partsCostSnapshot:25}];const rows=api.maintenanceRows([row(),row({dateISO:'2026-10-19'})],s);assert.equal(rows[0].laborCost,0);assert.equal(rows[0].partCost,25);assert.equal(rows[1].laborCost,60);assert.equal(rows[1].partCost,100);assert.equal(s.tasksInterval[0].price,100);});
test('legacy completedDates/manual history duplicate, instance override, and removed/corrected events',()=>{const s=state();s.tasksInterval.push({id:'instance',templateId:'task',occurrenceHours:{'2026-10-18':.5}});let rows=api.maintenanceRows([row(),row()],s);assert.equal(rows.length,1);assert.equal(rows[0].laborCost,15);s.tasksInterval[0].manualHistory=[{dateISO:'2026-10-18',status:'uncompleted'}];assert.equal(api.maintenanceRows([row()],s).length,0);});
test('V2 root duplicates collapse; legacy shadow is removed even after uncomplete/move',()=>{const s=state();s.maintenanceTasksV2=[{id:'v2',legacyTaskId:'task'}];s.maintenanceOccurrencesV2=[{id:'reopen',rootOccurrenceId:'root',instanceId:'instance',taskId:'v2',effectiveDateISO:'2026-10-18',eventType:'uncompleted'}];assert.equal(api.maintenanceRows([row()],s).length,0);const vrow=row({sourceSystem:'v2',taskId:'v2',rootOccurrenceId:'root',dateISO:'2026-10-19'}),stream={sourceSystem:'v2',rootOccurrenceId:'root',partsCostSnapshot:20,loggedHours:.25};const result=api.maintenanceRows([row(),vrow,vrow],s,[stream]);assert.equal(result.length,1);assert.equal(result[0].dateISO,'2026-10-19');assert.equal(result[0].totalCost,27.5);});
test('garnet exact user inputs, full precision and invalid inputs',()=>{const g=api.garnet();assert.equal(g.costPerHour,(715+494/3)/2200*60);assert.equal(g.costPerHour.toFixed(2),'23.99');assert.equal(api.settings(undefined).shippingCost,494/3);for(const [key,value] of [['weightLb',0],['purchasePrice',-1],['consumptionLbMin',''],['shippingCost',null],['weightLb','bad']])assert.equal(api.garnet({...api.DEFAULTS,[key]:value}).valid,false);assert.equal(api.garnet({...api.DEFAULTS,consumptionLbMin:0}).costPerHour,0);});
test('garnet refill material counted once; labor retained; other parts unchanged',()=>{const s=state();let rows=api.maintenanceRows([row({taskName:'Garnet refill'})],s);assert.equal(rows[0].partCost,0);assert.equal(rows[0].laborCost,60);rows=api.maintenanceRows([row({taskName:'Garnet removal tank liner replacement'})],s);assert.equal(rows[0].partCost,100);rows=api.maintenanceRows([row({taskName:'Garnet fill valve replacement'})],s);assert.equal(rows[0].partCost,100);});
for(const days of [30,60,90,180])test(`${days}-day inclusive window and cost filtering`,()=>{const range=api.windowRange({...config,days},'2026-10-19');assert.equal((Date.parse(range.endDate)-Date.parse(range.startDate))/86400000+1,days);const s=state();s.dailyCutHours=[];s.totalHistory=[{dateISO:new Date(Date.parse(range.startDate)-86400000).toISOString().slice(0,10),hours:100},{dateISO:range.endDate,hours:100+days}];const result=calc(s,[row({dateISO:range.startDate}),row({dateISO:range.endDate}),row({dateISO:'2000-01-01'})],{...config,days});assert.equal(result.actualCuttingHours,days);assert.equal(result.eventCount,2);});
test('custom invalid/future dates cannot produce a rate',()=>{for(const changes of [{startDate:'2026-10-20'},{endDate:'2027-01-01'},{startDate:'2026-02-31'}])assert.equal(calc(state(),[],{...config,...changes}).valid,false);});
test('sparse cumulative readings need no daily entries and do not double count manual hours',()=>{const s=state();s.dailyCutHours=[];assert.equal(calc(s).actualCuttingHours,5);s.dailyCutHours=[{dateISO:'2026-10-18',hours:24,source:'manual'}];assert.equal(calc(s).actualCuttingHours,5);});
test('zero hours, missing baseline and genuinely missing maintenance prices block calculated rate',()=>{const s=state();s.totalHistory[1].hours=100;assert.equal(calc(s).valid,false);s.totalHistory=[];assert.equal(calc(s).valid,false);s.totalHistory=state().totalHistory;s.tasksInterval[0].price=-1;assert.equal(calc(s).dataCompleteness.incompleteEvents,1);assert.equal(calc(s).cutCostPerHour,null);});
test('configuration normalization and reload preserve exact inputs and do not alter historic rates',()=>{const ctx=hoursHarness(),source={cutCostFeedback:config},normalized=ctx.normalizeAppConfig(source);assert.deepEqual(JSON.parse(JSON.stringify(normalized.cutCostFeedback)),config);assert.equal(Object.hasOwn(ctx.normalizeAppConfig({}),'cutCostFeedback'),false,'Viewing the feature cannot append unsaved defaults to an existing workspace baseline');assert.equal(api.settings(ctx.normalizeAppConfig({}).cutCostFeedback).shippingCost,494/3);const s=state();s.completedCuttingJobs=[{id:'old',costRate:45}];const before=structuredClone(s);calc(s);assert.deepEqual(s,before);assert.match(core,/const JOB_BASE_COST_PER_HOUR = 30;/);});
function saveHarness(mode,extra={}){
 let server={syncMeta:{rev:7},appConfig:{dailyHours:8,unknown:'preserve'},completedCuttingJobs:[{id:'old',costRate:45}],inventory:[{id:'keep'}],receiptTrackerWeeks:[],...structuredClone(extra)},writes=0;
 const clone=value=>structuredClone(value);
 const db={async runTransaction(callback){let next;const result=await callback({get:async()=>({exists:true,data:()=>clone(server)}),set(ref,value,options){assert.ok(options.mergeFields.includes('syncMeta'));next=clone(value);}});if(next){server=next;writes++;}return result;}};
 const window={OMAXCutCostFeedback:api,appConfig:clone(server.appConfig),__loadedCloudRevisionForSaveGuard:7};
 const ctx=vm.createContext({window,console,Date,setTimeout,clearTimeout,ymd:()=> '2026-10-19',canWriteCloud:()=>!window.__recoveryInspectMode,FB:{ready:true,user:{uid:'fixture'},app:{options:{projectId:'local'}},db,docRef:{path:'fixture'}},isVercelPreviewRuntime:()=>false,cloudSaveQueue:Promise.resolve(),hasPendingLocalChanges:false,lastLocalMutationAt:1,stableStringify:value=>JSON.stringify(value),cloneStructured:clone,persistLocalStateBackup(){},cloudSaveNoWriteFailure:code=>({saved:false,definiteFailure:true,error:code}),renderRecoveryDiagnosticsPanel(){},adoptIdentityCheckedAuthoritativeState(verified){window.appConfig=clone(verified.appConfig);window.__loadedCloudRevisionForSaveGuard=verified.syncMeta.rev;return {loaded:true,recovery:false};}});
 ctx.writeAuthoritativeStateSnapshot=async(pending,options,guards)=>{
  if(mode==='unknown')return{saved:false,indeterminate:true,stateWriteAttempted:true};
  const result=await atomic.save({db,docRef:ctx.FB.docRef,state:pending,expectedRevision:guards.expectedRevision,setOptions:options,scan:()=>({contaminated:false}),clientId:'fixture',prepare:(next,remote)=>{assert.equal(guards.validateSourceState(remote),true);assert.equal(guards.validatePreparedState(next),true);return next;}});
  if(mode==='mismatch')server.appConfig.cutCostFeedback.purchasePrice++;
  return result;
 };
 vm.runInContext(ui,ctx);
 return {ctx,window,get server(){return clone(server);},get writes(){return writes;},conflict(){server.syncMeta.rev++;}};
}
test('explicit settings save uses real atomic writer and verified reload, preserving all other data',async()=>{const h=saveHarness(),before=h.server,result=await h.window.OMAXCutCostFeedbackUi.saveConfig(config);assert.equal(result.saved,true);assert.equal(h.writes,1);assert.deepEqual(h.server.completedCuttingJobs,before.completedCuttingJobs);assert.deepEqual(h.server.inventory,before.inventory);assert.equal(h.server.appConfig.unknown,'preserve');assert.deepEqual(h.server.appConfig.cutCostFeedback,config);assert.deepEqual(h.window.appConfig.cutCostFeedback,config);});
test('CAS/recovery/pending edits reject without writes; invalid settings cannot be saved',async()=>{for(const mode of ['conflict','recovery','pending','invalid']){const h=saveHarness();if(mode==='conflict')h.conflict();if(mode==='recovery')h.window.__recoveryInspectMode=true;if(mode==='pending')h.ctx.hasPendingLocalChanges=true;const result=await h.window.OMAXCutCostFeedbackUi.saveConfig(mode==='invalid'?{...config,weightLb:0}:config);assert.equal(result.saved,false,mode);assert.equal(h.writes,0,mode);}});
test('unknown or mismatched config save enters Recovery Mode and prevents repeat writes',async()=>{for(const mode of ['unknown','mismatch']){const h=saveHarness(mode),result=await h.window.OMAXCutCostFeedbackUi.saveConfig(config);assert.equal(result.indeterminate,true);assert.equal(h.window.__recoveryInspectMode,true);const count=h.writes;assert.equal((await h.window.OMAXCutCostFeedbackUi.saveConfig(config)).saved,false);assert.equal(h.writes,count);}});

test('actual compatibility reducer honors repeats, reopens, moves, snapshots and cleared duration at equal timestamps',()=>{
 const ctx=hoursHarness(),s=state();Object.assign(ctx.window,s);ctx.detectMaintenanceRecordSystem=entry=>entry.system==='v2'?'v2':'legacy';
 ctx.window.maintenanceTasksV2=[{id:'v2',legacyTaskId:'task',name:'Filter',price:999,downtimeHours:8}];ctx.window.maintenanceCalendarInstancesV2=[{id:'instance',taskId:'v2',instanceMode:'repeat',repeatRule:{basis:'calendar',every:1}}];
 const base={system:'v2',taskId:'v2',instanceId:'instance',rootOccurrenceId:'repeat:instance:2026-10-18',effectiveDateISO:'2026-10-18',recordedAtISO:'2026-10-19T10:00:00Z'};
 ctx.window.maintenanceOccurrencesV2=[{...base,id:'done',eventType:'completed',loggedHours:.5,partsCostSnapshot:12},{...base,id:'scheduled',eventType:'scheduled'}];
 vm.runInContext(section('function createMaintenanceCompatibilityRow(', 'window.detectMaintenanceRecordSystem ='),ctx);
 const streams=()=>ctx.buildMaintenanceCompatibilityStream().filter(row=>row.sourceSystem==='v2');
 assert.equal(streams().length,1);assert.equal(streams()[0].loggedHours,.5);assert.equal(streams()[0].partsCostSnapshot,12);
 ctx.window.maintenanceOccurrencesV2.unshift({...base,id:'clear',eventType:'hours_set',payload:{hours:null}});assert.equal(streams()[0].loggedHours,null);
 ctx.window.maintenanceOccurrencesV2.unshift({...base,id:'reopen',eventType:'uncompleted'});assert.equal(streams().length,0);
 ctx.window.maintenanceOccurrencesV2.unshift({...base,id:'redone',eventType:'completed',loggedHours:0});assert.equal(streams().length,1);assert.equal(streams()[0].loggedHours,0);
 ctx.window.maintenanceOccurrencesV2.unshift({...base,id:'move',eventType:'moved',payload:{toDateISO:'2026-10-19'}});assert.equal(streams()[0].dateISO,'2026-10-19');assert.equal(streams()[0].partsCostSnapshot,12);
 ctx.window.maintenanceOccurrencesV2.unshift({...base,id:'cancel',eventType:'cancelled'});assert.equal(streams().length,0);
 ctx.window.maintenanceOccurrencesV2.unshift({...base,id:'remove',eventType:'removed'});assert.equal(streams().length,0);
});

test('new-job rate checks freshly resolved data and never silently accepts a stale/invalid selection',()=>{
 const h=saveHarness();Object.assign(h.window,state());h.window.appConfig.cutCostFeedback=config;
 h.ctx.computeCostModel=()=>({maintenanceCostRows:api.maintenanceRows([row()],h.window)});h.ctx.resolveEffectiveDailyCutHours=resolver;let message='';h.ctx.toast=value=>message=value;
 const ui=h.window.OMAXCutCostFeedbackUi,rate=ui.calculate().cutCostPerHour,input={value:rate.toFixed(2),dataset:{calculatedCutCost:String(rate)}};
 assert.equal(ui.jobRate(input),rate);h.window.totalHistory[1].hours=110;assert.equal(Number.isNaN(ui.jobRate(input)),true);assert.match(message,/changed or is incomplete/);
 delete input.dataset.calculatedCutCost;input.value='51';assert.equal(ui.jobRate(input),51);
});

test('retained deleted-task history uses its preserved task configuration',()=>{const s=state();s.deletedItems=[{type:'task',payload:s.tasksInterval[0]}];s.tasksInterval=[];const result=api.maintenanceRows([row()],s);assert.equal(result[0].totalCost,160);assert.equal(result[0].costIncomplete,false);});

test('occurrence and hour repairs use the same verified isolated writer; CAS and Recovery Mode stay enforced',async()=>{
 const repair=require('../js/cutCostRepair'),extra=state();extra.dailyCutHours.push({dateISO:'2026-10-17',hours:0,source:'auto',custom:{keep:true}});
 for(const mode of [undefined,'unknown','conflict','recovery']){
  const h=saveHarness(mode,extra);Object.assign(h.window,structuredClone(extra));h.window.OMAXCutCostRepair=repair;h.ctx.genId=()=> 'repair-fixture';
  const target=repair.describe(h.server,row()),before=h.server;if(mode==='conflict')h.conflict();if(mode==='recovery')h.window.__recoveryInspectMode=true;
  const result=await h.window.OMAXCutCostFeedbackUi.saveRepair(target,{parts:0,duration:0});
  if(mode===undefined){assert.equal(result.verificationCompleted,true);assert.deepEqual(h.server.tasksInterval[0].manualHistory.slice(0,-1),before.tasksInterval[0].manualHistory);assert.deepEqual(h.server.completedCuttingJobs,before.completedCuttingJobs);}
  else{assert.equal(result.saved,false);assert.equal(h.writes,0);if(mode==='unknown')assert.equal(h.window.__recoveryInspectMode,true);}
 }
 const h=saveHarness(undefined,extra);h.window.OMAXCutCostRepair=repair;const result=await h.window.OMAXCutCostFeedbackUi.saveHours([['2026-10-17',0]]);assert.equal(result.verificationCompleted,true);assert.deepEqual(h.server.dailyCutHours.find(row=>row.dateISO==='2026-10-17').custom,{keep:true});assert.deepEqual(h.server.tasksInterval,extra.tasksInterval);
});
