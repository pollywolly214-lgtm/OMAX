"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const read=file=>fs.readFileSync("js/"+file,"utf8").replace(/\r\n/g,"\n");
const computations=read("computations.js"),core=read("core.js"),calendar=read("calendar.js"),renderers=read("renderers.js"),views=read("views.js");
function section(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return source.slice(a,b);}
function fn(source,name){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,name);return source.slice(start,source.indexOf("\n}",start)+2);}
const job=(costRate=-45)=>({id:"job",name:"Profit fixture",estimateHours:2.8,actualHours:0,chargeRate:200,costRate,
  startISO:"2026-10-01",dueISO:"2026-10-02",materialCost:5,materialQty:2,cat:"category",projectNumber:"1254",cutNumber:"C041",
  manualLogs:[{dateISO:"2026-10-01",completedHours:99}],files:[{fileId:"retained"}],importProvenance:{sourceRowNumber:7},
  efficiency:{chargeRate:999,costRate:999,netRate:999,totalProfit:999,actualHours:99}});
function harness(){
  const bubble={innerHTML:"",querySelector:()=>null};
  const c=vm.createContext({window:{},Date,console,MS_PER_DAY:86400000,JOB_RATE_PER_HOUR:200,JOB_BASE_COST_PER_HOUR:45,
    RENDER_TOTAL:null,totalHistory:[],currentTotal:()=>0,DAILY_HOURS:8,configuredDailyHours:()=>8,
    parseDateLocal:value=>value?new Date(String(value).slice(0,10)+"T00:00:00"):null,
    makeBubble:()=>bubble,escapeHtml:String,normalizeJobList:value=>value||[],
    resolveCategoryName:()=>"Category",formatterCurrency:value=>`$${Number(value).toFixed(2)}`,formatHoursValue:value=>`${value} hr`});
  vm.runInContext(computations,c);
  vm.runInContext(fn(core,"buildCompletedJob"),c);
  vm.runInContext(fn(calendar,"showJobBubble"),c);
  vm.runInContext(section(renderers,"  const resolveCuttingJobHours =","  let maintenanceSeries =")+
    ";this.resolveNet=resolveCuttingJobNetTotal;this.resolveHours=resolveCuttingJobHours;",c);
  return{c,bubble};
}
function costRows(c,jobs){
  c.cuttingJobs=[];c.completedCuttingJobs=jobs;c.window.completedCuttingJobs=jobs;
  vm.runInContext(section(renderers,"  const completedJobsForDataCenter =","  const efficiencyTotals =")+
    ";this.dataRows=cuttingJobsDataTable;this.financialRows=efficiencyRows;",c);
  return c.dataRows;
}
for(const costRate of [-45,45])test(`completion, calendar and financial display agree for cost ${costRate}`,()=>{
  const{c,bubble}=harness(),active=job(costRate),before=structuredClone(active);
  const eff=c.computeJobEfficiency(active);
  assert.equal(eff.costRate,45,"shared efficiency retains its positive expense contract");
  assert.ok(Math.abs(eff.gainLoss-424)<1e-9);assert.equal(eff.netRate,155);assert.equal(eff.hoursTaken,2.8);assert.ok(Math.abs(eff.totalProfit-424)<1e-9);
  const completed=c.buildCompletedJob(active,"2026-10-02T12:00:00Z");
  assert.equal(completed.efficiency.costRate,45);assert.equal(completed.efficiency.netRate,155);
  assert.ok(Math.abs(completed.efficiency.gainLoss-424)<1e-9);assert.equal(completed.efficiency.hoursTaken,2.8);assert.ok(Math.abs(completed.efficiency.totalProfit-424)<1e-9);
  for(const key of ["id","estimateHours","actualHours","manualLogs","files","cat","projectNumber","cutNumber","importProvenance"])
    assert.deepEqual(JSON.parse(JSON.stringify(completed[key])),before[key],key);
  for(const historical of [false,true]){
    c.cuttingJobs=historical?[]:[active];c.window.completedCuttingJobs=historical?[completed]:[];
    c.showJobBubble("job",{});
    assert.match(bubble.innerHTML,/Hours Taken:/);assert.match(bubble.innerHTML,/2\.8 hr/);
    assert.match(bubble.innerHTML,/\+\$424\.00/);assert.match(bubble.innerHTML,/\+\$155\.00\/hr/);
    assert.match(bubble.innerHTML,/-\$45\.00\/hr/);assert.doesNotMatch(bubble.innerHTML,/Estimate:|Actual hours:|Error/);
  }
  const rows=costRows(c,[completed]);assert.equal(rows[0].hoursValue,2.8);assert.equal(rows[0].costRateValue,45);
  assert.ok(Math.abs(rows[0].totalProfitValue-424)<1e-9);assert.equal(c.financialRows[0].totalProfitLabel,"$424.00");
  assert.ok(Math.abs(c.resolveNet(completed).total-424)<1e-9);
  assert.deepEqual(active,before,"all reads leave source records intact");
});
test("calendar and cost analysis ignore stale historical efficiency totals after a duration edit",()=>{
  const{c,bubble}=harness(),completed={...job(),completedAtISO:"2026-10-02",estimateHours:3};
  c.cuttingJobs=[];c.window.completedCuttingJobs=[completed];c.showJobBubble("job",{});
  assert.match(bubble.innerHTML,/\+\$455\.00/);
  assert.equal(costRows(c,[completed])[0].totalProfitValue,455);
});
test("shared expense fallbacks normalize either sign with full material expense",()=>{
  const{c}=harness();
  for(const costRate of [-45,45]){
    const legacy={...job(),costRate:null,efficiency:{chargeRate:200,costRate}};
    assert.equal(c.computeJobEfficiency(legacy).costRate,45);
    assert.ok(Math.abs(c.resolveNet(legacy).total-424)<1e-9);
  }
  const missing={...job(),costRate:null,efficiency:null};
  assert.equal(c.computeJobEfficiency(missing).costRate,45);
});
test("priority and required-duration summaries use Hours Taken instead of legacy progress",()=>{
  const{c}=harness(),first={...job(),priority:1},second={...job(),id:"second",priority:2};
  assert.equal(c.computePrioritySchedule([first,second]).backlog.get("second"),2.8);
  assert.equal(c.computeRequiredDaily(first).jobRemainingHours,2.8);
});
test("temporary cost calculator uses the same profit including material expense",()=>{
  for(const costRate of [-45,45]){
    const{c}=harness();costRows(c,[{...job(costRate),completedAtISO:"2026-10-02"}]);
    class Element{} class Input extends Element{constructor(value){super();this.value=String(value);}} class Select extends Element{}
    const total={textContent:""},avg={textContent:""},profitCell={textContent:""};
    Object.assign(c,{HTMLElement:Element,HTMLInputElement:Input,HTMLSelectElement:Select,chargeInput:new Input(200),costInput:new Input(costRate),
      rows:c.financialRows,defaults:{chargeRate:200,costRate:45},rangeSelect:null,rangeLabelEl:null,totalEl:total,avgEl:avg,
      document:{querySelector:()=>null,querySelectorAll:()=>[{getAttribute:name=>name==="data-efficiency-id"?"job":name==="data-efficiency-hours"?"2.8":"10",querySelector:selector=>selector==="[data-efficiency-profit-cell]"?profitCell:null}]}});
    vm.runInContext(section(renderers.slice(renderers.indexOf("  function setupEfficiencyCalculator(")),"    const formatUsd =","    const recalcWithOverride =")+
      ';activeRange="all";recalc();',c);
    assert.equal(total.textContent,"$424.00");assert.equal(avg.textContent,"$424.00");assert.equal(profitCell.textContent,"$424.00");
    c.rows[0].failurePercentValue=50;vm.runInContext("recalc();",c);assert.equal(total.textContent,"$144.00");assert.equal(profitCell.textContent,"$144.00");c.rows[0].failurePercentValue=0;
    c.rows.push({...c.rows[0],id:"second",hoursValue:1,chargeRateValue:300,costRateValue:75});
    vm.runInContext("recalc();",c);assert.equal(total.textContent,"$639.00");assert.equal(profitCell.textContent,"$424.00");
    vm.runInContext('overrideRates=true;costInput.value="-45";recalc();',c);assert.equal(total.textContent,"$569.00");
  }
});
test("job forms retain estimateHours and present only Hours Taken",()=>{
  const page=section(views,"function viewJobs(){","function filterInventoryItems(");
  assert.match(page,/data-history-field="estimateHours"/);assert.match(page,/data-j="estimateHours"/);
  assert.match(page,/Hours Taken \(hrs\)/);assert.match(page,/<th>Hours Taken<\/th>/);
  assert.doesNotMatch(page,/data-history-field="actualHours"|Actual \(hrs\)|Actual \$\{|Finished on estimate|<th>Hours remaining|data-log-job=/);
  const historySave=section(renderers,"    if (histSave){","  // 6) Edit/Remove/Save/Cancel");
  assert.doesNotMatch(historySave,/entry\.actualHours\s*=|field\("actualHours"\)|"actualHours"/);
});

for(const [failurePercent,total]of [[0,424],[50,144],[100,-136]])test(`CJPROFIT-02: history, calendar and graph profit agree at ${failurePercent}%`,()=>{
  const{c,bubble}=harness(),record={...job(),completedAtISO:"2026-10-02",failurePercent};c.cuttingJobs=[];c.window.completedCuttingJobs=[record];c.showJobBubble("job",{});assert.ok(bubble.innerHTML.includes(Math.abs(total).toFixed(2)));
  vm.runInContext(section(views,"  const resolveJobHours =","  const pendingFiles =")+";this.historyTotal=computeJobNetTotal;",c);assert.ok(Math.abs(c.historyTotal(record)-total)<1e-9);assert.ok(Math.abs(c.resolveNet(record).total-total)<1e-9);const rows=costRows(c,[record]);assert.ok(Math.abs(rows[0].totalProfitValue-total)<1e-9);assert.equal(c.financialRows[0].failurePercentValue,failurePercent);
});
