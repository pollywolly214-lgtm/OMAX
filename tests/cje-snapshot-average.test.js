"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const meter=require("../js/cutCostFeedback");
const source=fs.readFileSync("js/computations.js","utf8"),core=fs.readFileSync("js/core.js","utf8");
const section=(start,end)=>core.slice(core.indexOf(start),core.indexOf(end,core.indexOf(start)));
const reading=(dateISO,hours)=>({dateISO,hours});
function harness(totalHistory,excludeWeekends=false){
  class FixedDate extends Date{constructor(...args){super(...(args.length?args:[2026,9,20,12]));}}
  const ctx=vm.createContext({Date:FixedDate,window:{OMAXCutCostFeedback:meter,appConfig:{}},totalHistory,
    dailyCutHours:[{dateISO:"2026-10-20",hours:24}],TIME_EFFICIENCY_WINDOWS:[],CUTTING_BASELINE_DAILY_HOURS:8,
    normalizeDateISO:String,clampDailyCutHours:value=>Math.min(24,Math.max(0,Number(value)||0)),
    getAverageDailyCutHours:()=>3.4,getFixedDailyHours:()=>8,shouldExcludeWeekends:()=>excludeWeekends,isWeekendDate:d=>[0,6].includes(d.getDay())});
  vm.runInContext(section("function parseDateLocal(","function normalizeAppConfig(")+source,ctx);return ctx;
}
test("1M and 3M averages use selected cumulative endpoints, independent of global ACH and daily logs",()=>{
  const rows=[reading("2026-07-23",100),reading("2026-09-21",189),reading("2026-10-20",271)];
  const before=JSON.stringify(rows),ctx=harness(rows);
  let result=ctx.computeTimeEfficiency(90,{goalMode:"average"});
  assert.equal(result.usageAverage.hours,171);assert.equal(result.usageAverage.days,89);assert.equal(result.averageDailyHours,171/89);
  assert.equal(result.goalDailyHours,3.4,"existing Dashboard average still controls average goal mode");
  result=ctx.computeTimeEfficiency(30);assert.equal(result.usageAverage.hours,82);assert.equal(result.usageAverage.days,29);assert.equal(result.averageDailyHours,82/29);
  assert.equal(result.actualHours,24,"the separate historical daily accumulation is unchanged");assert.equal(JSON.stringify(rows),before);
  ctx.dailyCutHours=[];assert.equal(ctx.computeTimeEfficiency(30).averageDailyHours,82/29);
});
test("sparse accepted boundaries use their real elapsed span, never compress old hours into the requested window",()=>{
  const ctx=harness([reading("2026-07-19",100),reading("2026-10-18",160)]);
  const result=ctx.computeTimeEfficiency(30).usageAverage;
  assert.equal(result.hours,60);assert.equal(result.days,91);assert.equal(result.average,60/91);
  assert.match(result.description,/observed span, not an interpolated selected-period total/);
  assert.match(result.description,/2026-07-19 baseline excluded, through 2026-10-18 inclusive/);
});
test("calendar denominator includes weekends and ignores working-day target configuration",()=>{
  const ctx=harness([reading("2026-10-19",100),reading("2026-10-20",106)],true);
  const result=ctx.computeTimeEfficiency(7);assert.equal(result.startISO,"2026-10-19");assert.equal(result.endISO,"2026-10-25");
  assert.equal(result.averageDailyHours,6);assert.equal(result.usageAverage.days,1);assert.match(result.usageAverage.description,/weekends included/);
  assert.equal(result.targetDaysElapsed,2);assert.equal(result.baselineHours,40);
});
test("future readings and future selected periods never enter an average",()=>{
  const ctx=harness([reading("2026-10-19",100),reading("2026-10-20",106),reading("2026-10-25",999)]);
  assert.equal(ctx.computeTimeEfficiency(7).averageDailyHours,6);
  assert.equal(ctx.computeTimeEfficiency(30,{startDate:"2026-11-01"}).averageDailyHours,null);
});
test("missing endpoints, conflicting duplicates and resets withhold the meter average",()=>{
  for(const rows of [[],[reading("2026-10-20",100)],
    [reading("2026-09-21",100),reading("2026-10-20",110),reading("2026-10-20",111)],
    [reading("2026-09-21",100),reading("2026-10-01",90),reading("2026-10-20",110)]]){
    const result=harness(rows).computeTimeEfficiency(30);assert.equal(result.averageDailyHours,null);assert.match(result.usageAverage.description,/unavailable/);
  }
});
test("zero cumulative usage is displayed as zero; identical duplicates do not double-count",()=>{
  const rows=[reading("2026-09-21",100),reading("2026-10-20",100),reading("2026-10-20",100)];
  assert.equal(harness(rows).computeTimeEfficiency(30).averageDailyHours,0);
});
for(const timezone of ["America/Chicago","Pacific/Kiritimati"])test(`local keys and elapsed calendar days stay stable across DST and UTC+14 (${timezone})`,()=>{
  const previous=process.env.TZ;process.env.TZ=timezone;
  try{
    const ctx=harness([reading("2026-09-21",100),reading("2026-10-20",182)]),result=ctx.computeTimeEfficiency(30);
    assert.equal(result.startISO,"2026-09-21");assert.equal(result.endISO,"2026-10-20");assert.equal(result.averageDailyHours,82/29);
    assert.equal(ctx.computeSnapshotUsageAverage("2026-10-31","2026-11-02","2026-11-02").average,null);
    ctx.totalHistory=[reading("2026-10-31",100),reading("2026-11-02",112)];
    assert.equal(ctx.computeSnapshotUsageAverage("2026-10-31","2026-11-02","2026-11-02").days,2);
    assert.equal(ctx.computeSnapshotUsageAverage("2026-10-31","2026-11-02","2026-11-02").average,6);
  }finally{if(previous==null)delete process.env.TZ;else process.env.TZ=previous;}
});
