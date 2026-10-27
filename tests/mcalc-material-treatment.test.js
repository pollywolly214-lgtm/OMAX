"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const report=require("../js/financialReconciliation"),dates=require("../js/cuttingJobDateEditing"),chronology=require("../js/cuttingJobChronology");
const read=file=>fs.readFileSync(file,"utf8").replace(/\r\n/g,"\n");
const core=read("js/core.js"),computations=read("js/computations.js"),views=read("js/views.js"),renderers=read("js/renderers.js");
const section=(source,start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return source.slice(a,b);};
const fn=(source,name)=>{const a=source.indexOf(`function ${name}(`);assert.ok(a>=0,name);return source.slice(a,source.indexOf("\n}",a)+2);};
const plain=value=>JSON.parse(JSON.stringify(value));
const base=extra=>({id:"new",name:"Material fixture",estimateHours:2,chargeRate:200,costRate:45,materialCost:100,materialQty:1,failurePercent:0,...extra});
function calc(){const ctx=vm.createContext({window:{appConfig:{materialCostTreatment:"separate"}},JOB_RATE_PER_HOUR:250,JOB_BASE_COST_PER_HOUR:30});vm.runInContext(computations,ctx);return ctx;}
const profit=calc().computeCuttingJobProfit;

test("default deduct gives $210, separate gives $310 profit and a $500 bid recovering $90 runtime and $100 material",()=>{
  for(const materialCostTreatment of [undefined,"deduct","separate","invalid"]){
    const job=Object.freeze(base({materialCostTreatment})),p=profit(job),separate=materialCostTreatment==="separate";
    assert.equal(p.revenue,400);assert.equal(p.cuttingCost,90);assert.equal(p.materialExpense,100);assert.equal(p.cuttingProfit,310);
    assert.equal(p.totalProfit,separate?310:210);assert.equal(p.materialCharge,separate?100:0);assert.equal(p.customerPrice,separate?500:400);
    assert.equal(p.totalProfit,p.adjustedCustomerPrice-p.cuttingCost-p.materialExpense);
    assert.equal(p.netRate,155,"existing pre-material, pre-failure hourly margin stays unchanged");
  }
});
test("zero material, non-unit quantity, negative expense rates, and fractional hours conserve price and profit",()=>{
  for(const materialCost of [0,12.5])for(const materialQty of [0,1,4])for(const costRate of [-45,45])for(const hours of [0,.5,2]){
    const expense=materialCost*materialQty,deduct=profit(base({materialCost,materialQty,costRate,estimateHours:hours}));
    const separate=profit(base({materialCost,materialQty,costRate,estimateHours:hours,materialCostTreatment:"separate"}));
    assert.equal(separate.materialExpense,expense);assert.equal(separate.materialCharge,expense);
    assert.equal(separate.totalProfit-deduct.totalProfit,expense);
    assert.equal(separate.customerPrice,200*hours+expense);
    assert.equal(separate.totalProfit,separate.adjustedCustomerPrice-separate.cuttingCost-expense);
  }
});
test("failed cuts reduce cutting revenue only; runtime and full material recovery remain at 0, 50 and 100 percent",()=>{
  for(const materialCostTreatment of ["deduct","separate"])for(const failurePercent of [0,50,100]){
    const p=profit(base({materialCostTreatment,failurePercent}));
    assert.equal(p.adjustedRevenue,400*(1-failurePercent/100));assert.equal(p.cuttingCost,90);assert.equal(p.materialExpense,100);
    assert.equal(p.materialCharge,materialCostTreatment==="separate"?100:0);
    assert.equal(p.originalNetProfit,materialCostTreatment==="separate"?310:210);
    assert.equal(p.totalProfit,p.adjustedCustomerPrice-90-100);
  }
});
test("existing active/completed jobs and cached financial evidence are unaffected by repeated global toggles",()=>{
  const c=calc();
  for(const completed of [false,true]){
    const job=base({...completed?{completedAtISO:"2026-10-20"}:{},efficiency:{gainLoss:210,totalProfit:210,netRate:155},netTotal:210}),before=structuredClone(job);
    for(const materialCostTreatment of ["deduct","separate","deduct"]){c.window.appConfig={materialCostTreatment};assert.equal(c.computeCuttingJobProfit(job).totalProfit,210);}
    assert.deepEqual(job,before);
  }
});
test("creation captures mode, readback and completion preserve it independently of later settings",async()=>{
  const c=calc();vm.runInContext(fn(core,"createCuttingJob")+fn(core,"buildCompletedJob"),c);
  let operation;c.saveCuttingJobBusinessOperation=op=>{operation=plain(op);return {saved:true};};
  const supplied=base({startISO:"2026-10-20",dueISO:"2026-10-20",files:[],manualLogs:[]}),before=structuredClone(supplied);
  await c.createCuttingJob(supplied);assert.equal(operation.job.materialCostTreatment,"separate");assert.deepEqual(supplied,before);
  const prepared=dates.prepareMutation({cuttingJobs:[],completedCuttingJobs:[]},operation,{audit:{operationId:"create",actorUid:"fixture",atISO:"2026-10-20"}});
  assert.equal(prepared.ok,true,prepared.error);const saved=plain(prepared.nextState.cuttingJobs[0]);
  c.window.appConfig.materialCostTreatment="deduct";assert.equal(profit(saved).totalProfit,310);
  c.parseDateLocal=value=>value?new Date(String(value).slice(0,10)+"T00:00:00"):null;
  Object.assign(c,{MS_PER_DAY:86400000,DAILY_HOURS:8,RENDER_TOTAL:null,totalHistory:[],currentTotal:()=>0});
  const completed=plain(c.buildCompletedJob(saved,"2026-10-20"));
  assert.equal(completed.materialCostTreatment,"separate");assert.equal(completed.efficiency.totalProfit,310);assert.equal(profit(completed).totalProfit,310);
  await c.createCuttingJob(base({materialCostTreatment:"separate"}));assert.equal(operation.job.materialCostTreatment,"separate","explicit captured mode survives retries");
  await c.createCuttingJob(base());assert.equal(operation.job.materialCostTreatment,"deduct");
});
test("completed supported-duration fallback and legacy rate fallbacks retain their accounting rules",()=>{
  for(const materialCostTreatment of ["deduct","separate"]){
    const p=profit(base({estimateHours:0,actualHours:2,completedAtISO:"2026-10-20",materialCostTreatment}));
    assert.equal(p.hours,2);assert.equal(p.duration.usedRecorded,true);assert.equal(p.totalProfit,materialCostTreatment==="separate"?310:210);
    const fallback=profit(base({chargeRate:null,costRate:null,efficiency:{chargeRate:200,costRate:-45},materialCostTreatment}));
    assert.equal(fallback.totalProfit,p.totalProfit);
  }
});
test("mixed-mode Cost Analysis totals bridge through separate recovery without hiding full material expense",()=>{
  const jobs=[base({id:"deduct",completedAtISO:"2026-10-20"}),base({id:"separate",completedAtISO:"2026-10-20",materialCostTreatment:"separate"})],before=structuredClone(jobs);
  const r=report.build({completedJobs:jobs,profit,today:"2026-10-20"}),t=r.totals;
  assert.equal(t.net,520);assert.equal(t.materialExpense,200);assert.equal(t.materialRecovery,100);assert.equal(t.customerPrice,900);
  assert.equal(t.adjustedCustomerPrice,900);assert.equal(t.net,t.revenue+t.materialRecovery-t.runtimeExpense-t.materialExpense);
  assert.equal(r.rateAnalysis.comparison.net,520);assert.deepEqual(jobs,before);
  const preview=report.previewExclusions(r.audit,[]);assert.equal(preview.baseline.materialRecovery,100);assert.equal(preview.baseline.net,520);
});
test("inline breakdown distinguishes cutting profit, expense, recovery and before/after-failure customer pricing",()=>{
  const c=calc();vm.runInContext(section(views,"function cuttingJobFinancialTone(","function viewJobs(){"),c);
  for(const failurePercent of [0,50,100]){
    const job=base({materialCostTreatment:"separate",failurePercent}),before=structuredClone(job),html=c.renderCuttingJobNetBreakdown(job);
    assert.ok(html.includes("Net Total — cutting profit:"));assert.ok(html.includes("cutting charge $400.00 + material $100.00 = $500.00"));
    assert.ok(html.includes("Material Expense: -$100.00 — recovered separately at cost"));
    assert.ok(html.includes("modeled customer amount after failure adjustment: $"+(500-4*failurePercent).toFixed(2)));assert.deepEqual(job,before);
  }
});
test("calendar, Cost Data Center and what-if calculator retain the saved separate mode",()=>{
  const source=read("tests/cjprofit01b-downstream.test.js"),ctx=vm.createContext({require,console,structuredClone,Date});
  vm.runInContext(source.slice(0,source.indexOf("for(const costRate of"))+";this.make=harness;this.rowsFor=costRows;",ctx);
  const {c,bubble}=ctx.make(),job=base({id:"job",materialCostTreatment:"separate",completedAtISO:"2026-10-20"});
  c.cuttingJobs=[];c.window.completedCuttingJobs=[job];c.showJobBubble("job",{});assert.match(bubble.innerHTML,/\+\$310\.00/);
  const rows=ctx.rowsFor(c,[job]);assert.equal(rows[0].totalProfitValue,310);assert.equal(c.financialRows[0].materialCostTreatment,"separate");
  class Element{}class Input extends Element{constructor(value){super();this.value=String(value);}}class Select extends Element{}
  const total={textContent:""};
  Object.assign(c,{HTMLElement:Element,HTMLInputElement:Input,HTMLSelectElement:Select,chargeInput:new Input(200),costInput:new Input(45),
    rows:c.financialRows,defaults:{chargeRate:200,costRate:45},rangeSelect:null,rangeLabelEl:null,totalEl:total,avgEl:null});
  vm.runInContext(section(renderers.slice(renderers.indexOf("  function setupEfficiencyCalculator(")),"    const formatUsd =","    const recalcWithOverride =")+';activeRange="all";recalc();',c);
  assert.equal(total.textContent,"$310.00");c.rows[0].failurePercentValue=50;vm.runInContext("recalc();",c);assert.equal(total.textContent,"$110.00");
  vm.runInContext('overrideRates=true;costInput.value="60";recalc();',c);assert.equal(total.textContent,"$80.00");
});

// Reuse the repository's real atomic persistence fixture, with its in-memory Firestore-shaped backend.
// No Firebase account, network, browser, or production record is involved.
const feedbackTest=read("tests/cut-cost-feedback.test.js");
const fixtureContext=vm.createContext({require,console,structuredClone,Date,setTimeout,clearTimeout,vm,assert,
  api:require("../js/cutCostFeedback"),atomic:require("../js/atomicPersistence"),ui:read("js/cutCostFeedbackUi.js")});
vm.runInContext(section(feedbackTest,"function saveHarness(","test('explicit settings save")+";this.fixture=saveHarness;",fixtureContext);
function configFixture(mode){
  const h=fixtureContext.fixture(mode,{appConfig:{dailyHours:8,unknown:{preserve:true},timeEfficiencyGoalMode:"average",materialCostTreatment:"deduct"},
    cuttingJobs:[base({id:"active"})],completedCuttingJobs:[base({id:"old",netTotal:210,efficiency:{totalProfit:210}})],
    inventoryMaterials:[{id:"material",price:3}],purchases:[{id:"purchase",price:5}]});
  const defaults=section(core,"const DEFAULT_APP_CONFIG =", "let appConfig =");
  vm.runInContext("const DEFAULT_DAILY_HOURS=8,DEFAULT_PREDICTION_AVERAGE_WINDOW=60;"+defaults,h.ctx);
  h.ctx.normalizePredictionAverageWindow=value=>Number(value)||60;h.ctx.clampDailyCutHours=Number;
  vm.runInContext(fn(core,"normalizeAppConfig"),h.ctx);
  const writer=h.ctx.writeAuthoritativeStateSnapshot;
  h.ctx.writeAuthoritativeStateSnapshot=(pending,options,guards)=>{
    assert.deepEqual(plain(options.mergeFields),["appConfig","syncMeta"]);
    const expected=h.server;expected.appConfig=pending.appConfig;
    assert.deepEqual(plain(pending),plain(expected),"only appConfig may change before the atomic revision update");
    return writer(pending,options,guards);
  };
  return h;
}
test("Firebase-shaped config save/readback survives fresh-session normalization and never rewrites job/inventory/purchase fields",async()=>{
  const h=configFixture(),before=h.server;
  for(const materialCostTreatment of ["separate","deduct","separate"]){
    const result=await h.window.OMAXCutCostFeedbackUi.saveWorkspaceConfig({materialCostTreatment});
    assert.equal(result.saved,true,result.error);assert.equal(result.verificationCompleted,true);
    assert.equal(h.server.appConfig.materialCostTreatment,materialCostTreatment);assert.equal(h.window.appConfig.materialCostTreatment,materialCostTreatment);
    const fresh=configFixture();assert.equal(fresh.ctx.normalizeAppConfig(plain(h.server.appConfig)).materialCostTreatment,materialCostTreatment);
    for(const key of ["cuttingJobs","completedCuttingJobs","inventory","inventoryMaterials","purchases","receiptTrackerWeeks"])assert.deepEqual(h.server[key],before[key],key);
    assert.deepEqual(h.server.appConfig.unknown,before.appConfig.unknown);assert.equal(h.server.appConfig.timeEfficiencyGoalMode,"average");
  }
  assert.equal(h.writes,3);
});
test("config revision conflicts, pending changes, and Recovery Mode block without writes; uncertain readback suspends",async()=>{
  for(const scenario of ["conflict","pending","recovery","unknown"]){
    const h=configFixture(scenario),before=h.server;
    if(scenario==="conflict")h.conflict();if(scenario==="pending")h.ctx.hasPendingLocalChanges=true;if(scenario==="recovery")h.window.__recoveryInspectMode=true;
    const r=await h.window.OMAXCutCostFeedbackUi.saveWorkspaceConfig({materialCostTreatment:"separate"});
    assert.equal(r.saved,false);assert.equal(h.writes,0);assert.equal(h.window.appConfig.materialCostTreatment,"deduct");
    if(scenario==="unknown")assert.equal(h.window.__recoveryInspectMode,true);
    assert.deepEqual(h.server.completedCuttingJobs,before.completedCuttingJobs);
  }
});
test("settings form awaits verified persistence and retains failed selections for retry",async()=>{
  const c=calc();vm.runInContext("async "+fn(renderers,"applyConfigurationForm"),c);
  c.getConfigurationElements=()=>({hoursInput:{value:8},predictionMode:{value:"fixed"},averageWindow:{value:60},materialCostTreatment:{value:"separate"}});
  c.window.OMAXCutCostFeedbackUi={saveWorkspaceConfig:async patch=>{assert.equal(patch.materialCostTreatment,"separate");return {saved:false,error:"permission denied"};}};
  await assert.rejects(c.applyConfigurationForm(),/permission denied/);
  const form=section(renderers,'if (form && form.dataset.boundConfig', 'if (cancel && cancel.dataset.boundConfig');
  assert.match(form,/await applyConfigurationForm\(\); closeConfigurationModal\(\)/);assert.doesNotMatch(fn(renderers,"applyConfigurationForm"),/saveCloudDebounced|setAppConfig\(/);
});
