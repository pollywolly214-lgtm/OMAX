"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const api=require("../js/financialReconciliation"),purchases=require("../js/purchaseFinancials");
const read=file=>fs.readFileSync(file,"utf8").replace(/\r\n/g,"\n");
const computations=read("js/computations.js"),views=read("js/views.js"),renderers=read("js/renderers.js");
const calcContext=vm.createContext({JOB_RATE_PER_HOUR:250,JOB_BASE_COST_PER_HOUR:30});
vm.runInContext(computations,calcContext);const profit=calcContext.computeCuttingJobProfit;
const base=extra=>({id:"A",name:"Cut",completedAtISO:"2026-10-20",estimateHours:2,chargeRate:150,costRate:-60,materialCost:5,materialQty:3,failurePercent:0,...extra});
const fixture=()=>[base(),base({id:"B",estimateHours:2.8,chargeRate:200,costRate:-45,materialQty:2}),base({id:"C",estimateHours:1,chargeRate:150,costRate:-25,materialQty:5,failurePercent:100})];
const select=(jobs,range="all")=>api.selectJobs(jobs,{profit,range,today:"2026-10-20"});
const build=(extra={})=>api.build({completedJobs:fixture(),profit,today:"2026-10-20",range:"all",purchaseFinancials:purchases.getPurchaseFinancials,...extra});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function section(src,start,end){const a=src.indexOf(start),b=src.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return src.slice(a,b);}
function freeze(value){if(value&&typeof value==="object"){Object.freeze(value);Object.values(value).forEach(freeze);}return value;}

test("canonical job results, sum, revenue/expense bridge and signed losses agree",()=>{
  const r=build();assert.deepEqual(r.rows.map(row=>row.profit.totalProfit).map(Math.round),[165,424,-50]);
  near(r.totals.net,539);near(r.totals.average,539/3);assert.equal(r.totals.grossRevenue,1010);
  assert.equal(r.totals.failureReduction,150);assert.equal(r.totals.runtimeExpense,271);assert.equal(r.totals.materialExpense,50);
  near(r.totals.net,r.totals.grossRevenue-r.totals.failureReduction-r.totals.runtimeExpense-r.totals.materialExpense);
  assert.equal(r.totals.positive,2);assert.equal(r.totals.negative,1);assert.equal(r.totals.zero,0);assert.equal(r.largestLosses[0].id,"C");
});

for(const [range,count] of [["7d",2],["30d",4],["90d",6],["182d",8],["365d",10],["all",11]])
  test(`${range} selects exactly its inclusive completion-date boundaries`,()=>{
    const jobs=[0,6,7,29,30,89,90,181,182,364,365].map((offset,index)=>{
      const d=new Date("2026-10-20T00:00:00Z");d.setUTCDate(d.getUTCDate()-offset);return base({id:String(index),completedAtISO:d.toISOString().slice(0,10)});
    });assert.equal(select(jobs,range).totals.count,count);
  });

test("business date is retained from timestamp; invalid, future, missing dates never borrow due/start/import dates",()=>{
  const r=select([base({completedAtISO:"2026-10-20T23:59:00-05:00"}),
    ...["2026-02-30","2026-10-20Tbad","2026-10-21",null].map((completedAtISO,index)=>base({id:String(index),completedAtISO,dueISO:"2026-10-20",startISO:"2026-10-20",importedAtISO:"2026-10-20"}))]);
  assert.equal(r.rows.length,1);assert.equal(r.rows[0].completionDate,"2026-10-20");assert.equal(r.excluded.length,4);
});

test("identical cuts with distinct IDs remain separate; repeated/missing IDs are retained and flagged",()=>{
  const r=select([base(),base({id:"B"}),base({id:"A"}),base({id:null})]);assert.equal(r.rows.length,4);near(r.totals.net,660);
  assert.equal(r.warnings.find(w=>w.code==="repeated_identity").count,2);assert.equal(r.warnings.find(w=>w.code==="missing_identity").count,1);
  assert.equal(r.populationChanges[0].change,"Added: no settings-link requirement");
});

test("missing/defaulted values, explicit zero, stored rates, import provenance and unknown failure are distinguished",()=>{
  const r=select([base({chargeRate:null,costRate:null,estimateHours:null,materialCost:null,materialQty:null,failurePercent:undefined,
    import_event_id:"import",importProvenance:{charge_rate_per_hr:"",cost_rate_per_hr:""}}),
    base({id:"zero",chargeRate:0,costRate:0}),base({id:"stored",chargeRate:"",costRate:"",efficiency:{chargeRate:200,costRate:-45,gainLoss:-999}})]);
  const codes=r.rows[0].issues.map(w=>w.code);for(const code of ["missing_hours","default_chargeRate","default_costRate","missing_material_cost","missing_material_qty","missing_failure","import_charge_rate_per_hr","import_cost_rate_per_hr","incomplete_import"])assert.ok(codes.includes(code),code);
  assert.equal(r.rows[0].profit.chargeRate,250);assert.equal(r.rows[0].profit.costRate,30);
  assert.ok(r.rows[1].issues.some(w=>w.code==="zero_charge"));assert.ok(!r.rows[1].issues.some(w=>w.code==="default_chargeRate"));
  assert.equal(r.rows[2].profit.chargeRate,200);assert.equal(r.rows[2].profit.costRate,45);assert.ok(r.rows[2].issues.some(w=>w.code==="stale_legacy"));
});

test("non-finite job results are excluded and aggregate overflow is unavailable rather than zero",()=>{
  const r=select([base({estimateHours:1e308,chargeRate:1e308})]);assert.equal(r.rows.length,0);assert.equal(r.excluded[0].reason,"Non-finite financial result");
  const huge=base({estimateHours:1,chargeRate:1e308,costRate:0,materialCost:0});const combined=select([huge,{...huge,id:"second"}]);
  assert.equal(combined.rows.length,2);assert.equal(combined.totals.net,null);assert.equal(combined.totals.average,null);
});

test("zero-profit jobs count, and losses remain negative",()=>{
  const r=select([base({chargeRate:60,materialCost:0}),base({id:"loss",chargeRate:0})]);
  assert.equal(r.totals.count,2);assert.equal(r.totals.zero,1);assert.equal(r.totals.negative,1);near(r.totals.net,-135);
});

test("recorded purchases, occurrence-input costs, estimates, incomplete events and forecasts remain distinct",()=>{
  const r=build({range:"7d",maintenanceRows:[
    {dateISO:"2026-10-20",totalCost:55,partCost:40,laborCost:15,costEstimated:false,costIncomplete:false},
    {dateISO:"2026-10-19",totalCost:100,partCost:40,laborCost:60,costEstimated:true},
    {dateISO:"2026-10-18",totalCost:999,costIncomplete:true},
    {dateISO:"2026-01-01",totalCost:300,costEstimated:false}],
    purchaseWeeks:[{rows:[{date:"2026-10-20",purchased:"Part",cost:15,qty:2,shipping:4,tax:2},
      {date:"2026-10-20",purchased:"Unknown",cost:"",qty:2},{date:"2026-01-01",purchased:"Old",cost:100,qty:1}]}],
    forecast:{annual:9000,remaining:2000,year:2026,sourceWindow:"YTD",method:"annualized_average"}});
  assert.equal(r.maintenance.recordedInputs,55);assert.equal(r.maintenance.estimated,100);assert.equal(r.maintenance.incomplete,1);
  assert.equal(r.maintenance.knownSubtotal,155);assert.equal(r.maintenance.modeledLabor,75);assert.equal(r.purchases.total,36);assert.equal(r.purchases.incomplete,1);
  assert.equal(r.forecast.annual,9000);near(r.totals.net,539);assert.equal(r.netWaterjetImpact,null);assert.match(r.coverageReason,/already include maintenance/);
});

test("frozen source records and protections are unchanged by repeated reports",()=>{
  const source=freeze({completedJobs:fixture(),maintenanceRows:[{dateISO:"2026-10-20",totalCost:55,partCost:40,laborCost:15,costEstimated:false}],purchaseWeeks:[]});
  const before=JSON.stringify(source);for(const range of api.ranges)build({...source,range:range.key});assert.equal(JSON.stringify(source),before);
});

test("current Cost Data Center rows and financial selector use exactly the same canonical job results",()=>{
  const jobs=[...fixture(),base({id:null}),base({id:"bad",completedAtISO:"not-a-date"})];
  const c=vm.createContext({window:{OMAXFinancialReconciliation:api},financialAnalysisDate:"2026-10-20",completedCuttingJobs:jobs,cuttingJobs:[],computeCuttingJobProfit:profit,
    computeJobEfficiency:()=>({}),resolveCategoryName:()=>"Category",formatterCurrency:n=>String(n),formatHoursValue:String,JOB_RATE_PER_HOUR:250,JOB_BASE_COST_PER_HOUR:30,ymd:()=>"2026-10-20"});
  vm.runInContext(section(renderers,"  const resolveCuttingJobHours =","  let maintenanceSeries =")+
    section(renderers,"  const completedJobsForDataCenter =","  const efficiencySnapshot =")+";this.data=cuttingJobsDataTable;this.summary=efficiencyTotals;",c);
  near(c.summary.profit,704);assert.equal(c.data.find(row=>row.id==="bad").financialIncluded,false);
  for(const row of c.data.filter(row=>row.financialIncluded))near(row.totalProfitValue,profit(jobs.find(job=>job.id===row.id)||jobs[3]).totalProfit);
});

test("actual final Cost cards use shared report and withhold combined result; native breakdown safely renders all components",()=>{
  const c=vm.createContext({window:{OMAXFinancialReconciliation:api,receiptTrackerWeeks:[]},completedCuttingJobs:fixture(),computeCuttingJobProfit:profit,
    getPurchaseFinancials:purchases.getPurchaseFinancials,cutCostFeedback:null,maintenanceDataTableRows:[],annualForecastFromCentral:9000,remainderProjection:2000,currentYear:2026,
    projectionMethod:"annualized_average",projectionWindowConfig:{label:"YTD"},financialAnalysisDate:"2026-10-20",summaryCards:[],jobSummary:{},ymd:()=>"2026-10-20",formatterCurrency:n=>String(n),renderAverageHoursBanner:()=>""});
  vm.runInContext(section(renderers,"  const financialReconciliation =","  return {\n    summaryCards,")+";this.report=financialReconciliation;",c);
  near(Number(c.summaryCards.find(card=>card.key==="cuttingJobs").value),539);assert.equal(c.summaryCards.find(card=>card.key==="combinedImpact").value,"Unavailable");
  vm.runInContext(section(views,"function renderFinancialPeriodControl(","function cuttingJobFinancialTone("),c);
  c.report.rows[0].name='<img src=x onerror=alert(1)>';
  c.report.rateAnalysis.rows[0].name=c.report.rows[0].name;
  const before=JSON.stringify(c.report);const html=c.renderFinancialBreakdown(c.report);
  assert.match(html,/Modeled Cutting Job Net Profit/);assert.match(html,/\$539\.00/);assert.match(html,/-\$50\.00/);assert.match(html,/Runtime cost rates can already include maintenance/);
  assert.ok(!html.includes('<img'));assert.match(html,/&lt;img/);assert.equal(JSON.stringify(c.report),before);
  const overview=c.viewCosts({financialReconciliation:c.report,summaryCards:c.summaryCards});
  assert.match(overview,/data-financial-period/);assert.match(overview,/data-open-financial-breakdown/);
  assert.ok(!overview.includes('data-financial-job-id'),'record-level breakdown is mounted outside the dashboard');
});

test("period control only changes a transient shared view preference, without saving",()=>{
  let handler,renders=0;const records=freeze(fixture());
  const c=vm.createContext({window:{OMAXFinancialReconciliation:api,completedCuttingJobs:records},saveCloudNow:()=>assert.fail("No saves"),markLocalMutation:()=>assert.fail("No mutation marker")});
  vm.runInContext(section(renderers,"function bindFinancialPeriodControls(","function renderCosts("),c);
  c.bindFinancialPeriodControls({querySelectorAll:()=>[{value:"7d",addEventListener:(name,fn)=>{assert.equal(name,"change");handler=fn;}}]},()=>renders++);
  const before=JSON.stringify(records);handler();assert.equal(c.window.__cuttingFinancialRange,"7d");assert.equal(renders,1);assert.equal(JSON.stringify(records),before);
});

test("loaded saved rates explain weighted runtime expense and largest losses without substituting the $45 what-if",()=>{
  // Controlled arithmetic matching the supplied summary, not production records.
  const jobs=freeze([base({id:"high",estimateHours:70,chargeRate:250,costRate:-475,materialCost:1361.81,materialQty:1}),
    base({id:"low",estimateHours:2,chargeRate:250,costRate:72.5,materialCost:0})]);
  const r=build({completedJobs:jobs});near(r.totals.runtimeExpense,33395);near(r.totals.net,-16756.81);
  assert.equal(r.rateAnalysis.hours,72);near(r.rateAnalysis.weightedCostRate,33395/72);
  assert.equal(r.rateAnalysis.groups[0].rate,475);assert.equal(r.largestLosses[0].id,"high");assert.equal(r.rateAnalysis.aboveCharge,1);
  near(r.rateAnalysis.comparison.runtimeExpense,3240);near(r.rateAnalysis.comparison.net,13398.19);
  near(r.totals.net,18000-33395-1361.81);assert.equal(jobs[0].costRate,-475);
});

test("snapshot total cost includes material and must never be presented as a runtime-only rate",()=>{
  const jobs=[base({estimateHours:72,costRate:45,materialCost:30155,materialQty:1})];
  const r=build({completedJobs:jobs});assert.equal(r.totals.runtimeExpense+r.totals.materialExpense,33395);
  assert.equal(r.rateAnalysis.weightedCostRate,45,"total expense / hours is not the runtime rate");
  const c=vm.createContext({window:{OMAXFinancialReconciliation:api},financialAnalysisDate:"2026-10-20",completedCuttingJobs:jobs,cuttingJobs:[],computeCuttingJobProfit:profit,
    computeJobEfficiency:()=>({}),resolveCategoryName:()=>"Category",formatterCurrency:String,formatHoursValue:String,JOB_RATE_PER_HOUR:250,JOB_BASE_COST_PER_HOUR:30});
  vm.runInContext(section(renderers,"  const resolveCuttingJobHours =","  let maintenanceSeries =")+
    section(renderers,"  const completedJobsForDataCenter =","  const taskById =")+";this.snapshot=efficiencySnapshot;",c);
  assert.equal(c.snapshot.totalExpenseLabel,"-33395");assert.equal(c.snapshot.runtimeExpenseLabel,"-3240");assert.equal(c.snapshot.materialExpenseLabel,"-30155");
  assert.equal(c.snapshot.calculatorDefaults.costRate,45);
  assert.ok(!views.includes('class="label">Total run cost'));assert.ok(!views.includes('class="label">Avg run cost'));
});

test("rate evidence distinguishes saved, imported blank defaults, legacy cache and canonical fallback",()=>{
  const r=build({completedJobs:[base({costRate:45,chargeRate:200,import_event_id:"x",importProvenance:{cost_rate_per_hr:"",charge_rate_per_hr:""}}),
    base({id:"legacy",costRate:"",chargeRate:null,efficiency:{costRate:-800,chargeRate:0}}),
    base({id:"fallback",costRate:null,chargeRate:-1})]});
  const [saved,legacy,fallback]=r.rateAnalysis.rows;
  assert.equal(saved.costEvidence.source,"Saved job rate");assert.equal(saved.costEvidence.importBlank,true);assert.equal(saved.profit.costRate,45);
  assert.equal(legacy.costEvidence.source,"Stored legacy efficiency rate");assert.equal(legacy.profit.costRate,800);assert.equal(legacy.profit.chargeRate,0);
  assert.equal(fallback.costEvidence.source,"Canonical fallback");assert.equal(fallback.profit.costRate,30);assert.equal(fallback.profit.chargeRate,250);
});

test("expense presentation is negative once, projections stay separate and a true job loss is never reversed",()=>{
  const c=vm.createContext({window:{OMAXFinancialReconciliation:api,receiptTrackerWeeks:[{rows:[{date:"2026-10-20",purchased:"Part",cost:15,qty:2}]}]},
    completedCuttingJobs:[base({chargeRate:0})],computeCuttingJobProfit:profit,getPurchaseFinancials:purchases.getPurchaseFinancials,cutCostFeedback:null,
    maintenanceDataTableRows:[{dateISO:"2026-10-20",totalCost:55,partCost:40,laborCost:15,costEstimated:false}],
    annualForecastFromCentral:9000,remainderProjection:2000,currentYear:2026,projectionMethod:"annualized_average",projectionWindowConfig:{label:"YTD"},
    financialAnalysisDate:"2026-10-20",summaryCards:[],jobSummary:{},formatterCurrency:String});
  vm.runInContext(section(renderers,"  const financialReconciliation =","  return {\n    summaryCards,")+";this.report=financialReconciliation;",c);
  const card=key=>c.summaryCards.find(card=>card.key===key);
  assert.equal(card("cuttingJobs").value,"-135");assert.equal(card("cuttingJobs").tone,"negative");
  assert.equal(card("recordedPurchases").value,"-30");assert.equal(card("maintenanceExpenses").value,"-55");assert.equal(card("maintenanceForecast").value,"-9000");
  assert.match(card("maintenanceForecast").hint,/projected expense -2000/);assert.equal(c.report.purchases.total,30);assert.equal(c.report.maintenance.knownSubtotal,55);
  near(c.report.totals.net,-135);assert.equal(c.report.netWaterjetImpact,null);assert.equal(c.report.coverage.interimNet,-135);
  assert.match(card("combinedImpact").hint,/Interim modeled Cutting Job Net Profit: -135/);
  vm.runInContext(section(views,"function renderFinancialPeriodControl(","function cuttingJobFinancialTone("),c);
  const html=c.renderFinancialBreakdown(c.report);assert.match(html,/-\$30\.00/);assert.match(html,/-\$55\.00/);assert.match(html,/-\$9,000\.00/);
  assert.match(html,/Interim modeled Cutting Job Net Profit: -\$135\.00/);assert.match(html,/No maintenance, purchase subtotal or annual forecast is subtracted again/);
  assert.match(html,/class="financial-profit job-finance-negative" data-financial-metric="net">-\$135\.00/);
  const empty=c.renderFinancialBreakdown(build({completedJobs:[]}));
  assert.match(empty,/data-financial-metric="runtime">\$0\.00/);assert.match(empty,/data-financial-metric="material">\$0\.00/);
});

test("combined coverage reports actual evidence and current CCR components without retroactively allocating costs",()=>{
  const currentRate=freeze({valid:true,startDate:"2026-07-23",endDate:"2026-10-20",measurementStartDate:"2026-07-22",measurementEndDate:"2026-10-19",
    actualCuttingHours:100,maintenanceCostPerHour:20,garnetCostPerHour:24,cutCostPerHour:44,warnings:["Consumption modeled"]});
  const r=build({currentRate,purchaseWeeks:[{rows:[{date:"2026-10-20",purchased:"Garnet",cost:500,qty:1}]}],
    maintenanceRows:[{dateISO:"2026-10-20",totalCost:55,partCost:40,laborCost:15,costEstimated:false}],forecast:{annual:9453.99}});
  assert.equal(r.coverage.currentCCR.total,44);assert.equal(r.coverage.currentCCR.hours,100);assert.equal(r.coverage.interimNet,539);
  assert.match(r.coverageReason,/3 job\(s\).*component\/allocation evidence/);assert.match(r.coverageReason,/Purchase spending is not allocated/);
  assert.match(r.coverageReason,/electricity, water, disposal/);assert.match(r.coverage.resolution,/effective dates/);
  assert.equal(r.netWaterjetImpact,null);near(r.totals.net,539);
  const empty=build({completedJobs:[]});assert.ok(!empty.coverageReason.includes("nonzero runtime"));assert.equal(empty.netWaterjetImpact,null);
});

test("maintenance forecast uses calendar days across Chicago DST rather than counting an extra remaining day",()=>{
  const previous=process.env.TZ;process.env.TZ="America/Chicago";
  try{
    class FixedDate extends Date{constructor(...args){super(...(args.length?args:[2026,9,20,12]));}}
    const c=vm.createContext({Date:FixedDate,window:{costForecastProjectionMethod:"run_rate",costForecastProjectionWindow:"ytd"},
      centralMaintenanceRows:[{occurredAt:new FixedDate(2026,9,1),totalCost:300}],JOB_DAY_MS:86400000});
    vm.runInContext(computations,c);
    vm.runInContext(section(renderers,"  const today = new Date();\n  today.setHours(0, 0, 0, 0);\n  const currentYear =","  const timeframeDefsCentral =")+
      ";this.result={elapsedDays,daysRemaining,projectionWindowDays,annualForecastFromCentral};",c);
    assert.equal(c.result.elapsedDays,293);assert.equal(c.result.daysRemaining,72);assert.equal(c.result.projectionWindowDays,293);
    near(c.result.annualForecastFromCentral,300/293*365);
  }finally{if(previous==null)delete process.env.TZ;else process.env.TZ=previous;}
});

test("previous card comparison matches the original mapper and date/name/settings-link filter",()=>{
  const jobs=[
    base(),base({id:"whitespace",name:" \t "}),base({id:"non-text",name:42}),
    base({id:"blank-name",name:""}),base({id:"missing-name",name:null}),base({id:"zero-name",name:0}),
    base({id:null}),base({id:""}),base({id:" "}),base({id:0}),
    base({id:"no-date",completedAtISO:" \t "}),base({id:"invalid-date",completedAtISO:"invalid text"}),
    base({id:"future",completedAtISO:"2027-01-01"}),
    base({id:"overflow",estimateHours:1e308,chargeRate:1e308}),
    // In the legacy reducer, a finite zero net still counts even when revenueLost overflows.
    base({id:"zero-net",estimateHours:1,chargeRate:1e308,costRate:0,materialCost:0,failurePercent:100})
  ];
  const before=JSON.stringify(jobs);
  // Disable the new API to execute the retained ORIGINAL mapper/filter/reducer.
  const c=vm.createContext({window:{},completedCuttingJobs:jobs,cuttingJobs:[],computeCuttingJobProfit:profit,computeJobEfficiency:()=>({}),
    resolveCategoryName:()=>"Category",formatterCurrency:String,formatHoursValue:String,JOB_RATE_PER_HOUR:250,JOB_BASE_COST_PER_HOUR:30});
  vm.runInContext(section(renderers,"  const resolveCuttingJobHours =","  let maintenanceSeries =")+
    section(renderers,"  const completedJobsForDataCenter =","  const efficiencySnapshot =")+
    ";this.legacy={rows:efficiencyRows,net:efficiencyTotals.profit};",c);
  const current=select(jobs);
  assert.equal(current.previousAllTime.count,c.legacy.rows.length);near(current.previousAllTime.net,c.legacy.net);
  assert.ok(!c.legacy.rows.some(row=>row.id==="whitespace"||row.id==="non-text"));
  for(const id of ["blank-name","missing-name","zero-name",""," ","0","invalid-date","future","overflow","zero-net"])
    assert.ok(c.legacy.rows.some(row=>row.id===id),id);
  assert.match(current.populationChanges.find(row=>row.id==="whitespace").change,/nonempty text name/);
  assert.match(current.populationChanges.find(row=>row.id===null).change,/settings-link/);
  assert.equal(JSON.stringify(jobs),before);
});

test("previous card preserves the original descending-date summation order",()=>{
  const jobs=[base({id:"old",completedAtISO:"2026-01-01",estimateHours:1,chargeRate:1e16,costRate:0,materialCost:0}),
    base({id:"new",completedAtISO:"2026-10-20",estimateHours:1,chargeRate:0,costRate:1e16,materialCost:0}),
    base({id:"middle",completedAtISO:"2026-09-01",estimateHours:1,chargeRate:1,costRate:0,materialCost:0})];
  assert.equal(select(jobs).previousAllTime.net,[-1e16,1,1e16].reduce((sum,value)=>sum+value,0));
});

test("expense/hour numerator and denominator both use financial-period series, preserving separate cuts",()=>{
  const c=vm.createContext({window:{OMAXFinancialReconciliation:api},financialJobSelection:{window:api.period("7d","2026-10-20")},
    maintenanceSeriesFromDataTable:[],maintenanceSeries:[],totalSpendSeries:[{dateISO:"2026-10-20",value:-36},{dateISO:"2025-01-01",value:-10000}],
    jobSeries:[{dateISO:"2026-10-20",jobId:"one",cutHours:2,value:165},{dateISO:"2026-10-20",jobId:"two",cutHours:2,value:165},
      {dateISO:"2025-01-01",jobId:"old",cutHours:1000,value:1}],ymd:()=>"2026-10-20"});
  vm.runInContext(section(renderers,"  const financialPeriod =","  // Read the loaded source records,")+
    ";this.result={totalCutHoursInFinancialPeriod,totalSpendInFinancialPeriod,totalSpendPerCutValue,selectedJobSeries};",c);
  assert.equal(c.result.totalCutHoursInFinancialPeriod,4);assert.equal(c.result.totalSpendInFinancialPeriod,36);
  assert.equal(c.result.totalSpendPerCutValue,9);assert.equal(c.result.selectedJobSeries.length,2);
});

for(const [timezone,instant,day] of [
  ["America/Chicago","2026-10-21T04:59:59Z","2026-10-20"],
  ["America/Chicago","2026-10-21T05:00:00Z","2026-10-21"],
  ["Pacific/Kiritimati","2026-10-20T10:00:00Z","2026-10-21"]
]) test(`financial local day at ${instant} in ${timezone}`,()=>{
  const previous=process.env.TZ;process.env.TZ=timezone;
  try{
    class FixedDate extends Date{constructor(...args){super(...(args.length?args:[instant]));}}
    const c=vm.createContext({window:{},Date:FixedDate});vm.runInContext(read("js/financialReconciliation.js"),c);
    assert.equal(c.window.OMAXFinancialReconciliation.localToday(),day);
    const selected=c.window.OMAXFinancialReconciliation.selectJobs([base({completedAtISO:day})],{profit,range:"7d"});
    assert.equal(selected.window.endISO,day);assert.equal(selected.totals.count,1);
  }finally{if(previous==null)delete process.env.TZ;else process.env.TZ=previous;}
});
