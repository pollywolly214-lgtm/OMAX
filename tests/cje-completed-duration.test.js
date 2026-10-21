"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const api=require("../js/financialReconciliation"),purchases=require("../js/purchaseFinancials"),{imported,productionShape}=require("./fixtures/cje-completed-financial");
const read=file=>fs.readFileSync(file,"utf8").replace(/\r\n/g,"\n"),computations=read("js/computations.js"),views=read("js/views.js"),renderers=read("js/renderers.js");
const ctx=vm.createContext({JOB_RATE_PER_HOUR:250,JOB_BASE_COST_PER_HOUR:30});vm.runInContext(computations,ctx);
const profit=ctx.computeCuttingJobProfit,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const audit=jobs=>api.audit(jobs,{profit}),select=jobs=>api.selectJobs(jobs,{profit,today:"2026-10-21"});
const freeze=value=>{if(value&&typeof value==="object"){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function section(src,start,end){const a=src.indexOf(start),b=src.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return src.slice(a,b);}

test("C074 preserves estimateHours=0 while 12.3 matching actual/log/source hours drive the unchanged formula",()=>{
  const job=freeze(imported("616-CUT",74,{cutNumber:"C074",name:"Blanco Shoes",actualHours:12.3,materialCost:863.47})),before=JSON.stringify(job),r=profit(job);
  assert.equal(r.hours,12.3);assert.equal(r.duration.usedRecorded,true);assert.equal(r.duration.source,"actualHours");assert.equal(r.duration.issues.length,0);
  near(r.totalProfit,12.3*(200-45)-863.47);near(profit(job,{durationMode:"estimate"}).totalProfit,-863.47);
  assert.equal(job.estimateHours,0);assert.equal(JSON.stringify(job),before);
  near(select([job]).previousAllTime.net,-863.47);near(select([job]).totals.net,r.totalProfit);
});
test("positive authoritative manual logs work without actualHours and are cumulative, not summed",()=>{
  const job=imported("CUTPDF",1,{actualHours:3});delete job.actualHours;
  job.manualLogs.unshift({dateISO:"2026-07-27",completedHours:1});
  const r=profit(freeze(job));assert.equal(r.hours,3);assert.equal(r.duration.source,"Latest cumulative manual log");assert.equal(r.duration.issues.length,0);
});
test("manual-only completed actual time does not require an imported source or actualHours",()=>{
  const job={id:"manual",estimateHours:0,completedAtISO:"2026-07-28",manualLogs:[{dateISO:"2026-07-27",completedHours:1},{dateISO:"2026-07-28",completedHours:2.5}]};
  assert.equal(profit(job).hours,2.5);assert.equal(profit(job).duration.usedRecorded,true);
});
test("conflicting actual/log/source cutting time is flagged without choosing a replacement",()=>{
  for(const modify of [job=>job.manualLogs[0].completedHours=3,job=>job.importProvenance.actual_cut_minutes="300",job=>job.actualHours=0]){
    const job=imported("CUTPDF",1,{actualHours:2});modify(job);const before=JSON.stringify(job),r=profit(job);
    assert.equal(r.hours,0);assert.equal(r.duration.usedRecorded,false);assert.ok(r.duration.issues.some(issue=>issue.includes("contradict")));
    assert.equal(audit([job]).unresolvedZero,1);assert.equal(JSON.stringify(job),before);
  }
});
test("genuine zero, missing actual time and imported minutes alone stay unchanged",()=>{
  for(const job of [imported("CUTPDF",1,{actualHours:0}),{id:"empty",estimateHours:0,completedAtISO:"2026-07-28"}]){
    const r=profit(job);assert.equal(r.hours,0);assert.equal(r.duration.usedRecorded,false);assert.equal(r.duration.issues.length,0);
  }
  const job=imported("CUTPDF",1);delete job.actualHours;job.manualLogs=[];
  assert.equal(profit(job).hours,0);assert.match(profit(job).duration.issues.join(" "),/minutes alone/);
});
test("normal manually completed positive financial durations and active/scheduling behavior stay unchanged",()=>{
  const completed={id:"normal",estimateHours:2,actualHours:3,completedAtISO:"2026-07-28",manualLogs:[{dateISO:"2026-07-28",completedHours:3}],chargeRate:200,costRate:45};
  assert.equal(profit(completed).hours,2);assert.equal(profit(completed).duration.usedRecorded,false);
  const active={...imported("CUTPDF",1),completedAtISO:undefined};assert.equal(profit(active).hours,0);
  const c=vm.createContext({JOB_RATE_PER_HOUR:250,JOB_BASE_COST_PER_HOUR:30,parseDateLocal:value=>new Date(value),inclusiveDayCount:()=>1});vm.runInContext(computations,c);
  const corrected=imported("CUTPDF",1);assert.equal(c.computeRequiredDaily(corrected).jobRemainingHours,0);
  assert.equal(c.computePrioritySchedule([corrected,{...completed,id:"next",priority:2}]).backlog.get("next"),0);
});
test("malformed, conflicting same-date, decreasing, post-completion and wrong-identity logs require review",()=>{
  for(const logs of [null,[{dateISO:"bad",completedHours:1}],[{dateISO:"2026-07-29",completedHours:1}],
    [{dateISO:"2026-07-28",completedHours:""}],[{dateISO:"2026-07-28",completedHours:-1}],
    [{dateISO:"2026-07-27",completedHours:3},{dateISO:"2026-07-28",completedHours:2}],
    [{dateISO:"2026-07-28",completedHours:1},{dateISO:"2026-07-28",completedHours:2}],
    [{dateISO:"2026-07-28",completedHours:1,import_event_id:"wrong"}]]){
    const job=imported("CUTPDF",1,{manualLogs:logs===null?"invalid":logs});assert.equal(profit(job).hours,0);assert.ok(profit(job).duration.issues.length);
  }
});
test("finite numeric evidence, missing estimates and identical log representations are handled conservatively",()=>{
  for(const estimateHours of [undefined,null,"",-1,"invalid"]){const job=imported("CUTPDF",1,{estimateHours});assert.equal(profit(job).hours,1);}
  const job=imported("CUTPDF",1,{actualHours:"1"});job.manualLogs.push({...job.manualLogs[0]});assert.equal(profit(job).hours,1);
  for(const actualHours of [true,"invalid",Infinity,-1]){job.actualHours=actualHours;assert.equal(profit(job).hours,0);assert.ok(profit(job).duration.issues.length);}
});
test("two legitimate cuts with identical names/dates are retained, never inferred as same-import duplicates",()=>{
  const a=imported("CUTPDF",1,{name:"Repeated cut"}),b=imported("CUTPDF",2,{name:"Repeated cut"});
  assert.equal(audit([a,b]).duplicateGroups.length,0);assert.equal(select([a,b]).totals.count,2);near(select([a,b]).totals.net,profit(a).totalProfit+profit(b).totalProfit);
});
test("one-to-one cross-import candidates retain both rows and flag distinct material inputs",()=>{
  const a=imported("CUTPDF",1,{name:"Same cut",materialCost:5,materialQty:2}),b=imported("616-CUT",1,{name:"Same cut",materialCost:10,materialQty:1});
  const r=audit(freeze([a,b])),group=r.duplicateGroups[0];assert.equal(group.oneToOne,true);assert.equal(group.differentMaterial,true);assert.equal(group.pairingUpperBound,1);
  assert.equal(select([a,b]).totals.count,2);assert.ok(select([a,b]).warnings.some(issue=>issue.code==="possible_cross_import_duplicate"));
});
test("June 29 ATM Person Door 3 CUTPDF vs 2 Excel records remain one ambiguous group with no guessed pairing",()=>{
  const jobs=productionShape().filter(job=>job.name==="ATM Person Door"),r=audit(freeze(jobs)),g=r.duplicateGroups[0];
  assert.equal(r.duplicateGroups.length,1);assert.equal(g.cutpdf,3);assert.equal(g.excel,2);assert.equal(g.oneToOne,false);
  assert.equal(g.possiblePairs.length,6);assert.equal(g.pairingUpperBound,2);assert.equal(select(jobs).totals.count,5);
});
test("candidate matching requires supported time/date/project; a name mismatch prevents strong one-to-one classification",()=>{
  const first=imported("CUTPDF",1,{name:"Door"});
  assert.equal(audit([first,imported("616-CUT",1,{name:"Different name"})]).duplicateGroups[0].oneToOne,false);
  for(const extra of [{actualHours:2},{projectNumber:"1251"},{completedAtISO:"2026-07-29"},
    {manualLogs:[{dateISO:"2026-07-28",completedHours:2}]}])assert.equal(audit([first,imported("616-CUT",1,extra)]).duplicateGroups.length,0);
});
test("missing completion dates stay unresolved but the completed-record audit still exposes available actual time",()=>{
  const job=imported("CUTPDF",1,{completedAtISO:"invalid"}),r=audit([job]);
  assert.equal(profit(job).hours,0);assert.equal(r.zeroWithActual,1);assert.equal(r.unresolvedZero,1);assert.equal(r.durationConflicts,1);
  assert.match(r.rows[0].duration.issues.join(" "),/completion date/);assert.equal(select([job]).totals.count,0);
});
test("nested retained source minutes corroborate manual time without requiring actualHours",()=>{
  const job=imported("CUTPDF",1,{actualHours:2.5});job.importProvenance={sourceRecord:job.importProvenance};delete job.actualHours;
  assert.equal(profit(job).hours,2.5);assert.equal(profit(job).duration.usedRecorded,true);
  job.importProvenance.sourceRecord.actual_cut_minutes="300";assert.equal(profit(job).hours,0);
});
test("172-record synthetic shape covers 155 supported zero durations, 88/67 imports and 38 candidate groups without writes",()=>{
  const jobs=freeze(productionShape()),before=JSON.stringify(jobs),r=audit(jobs);
  assert.equal(r.count,172);assert.equal(r.zeroWithActual,155);assert.equal(r.resolved,155);assert.equal(r.unresolvedZero,0);
  assert.equal(r.byImport["616-CUT"].resolved,88);assert.equal(r.byImport.CUTPDF.resolved,67);
  assert.equal(r.duplicateGroups.length,38);assert.equal(r.duplicateGroups.filter(group=>group.oneToOne).length,37);assert.equal(r.pairingUpperBound,39);
  near(r.modeledNet,jobs.reduce((sum,job)=>sum+profit(job).totalProfit,0));near(r.netChange,r.modeledNet-r.originalNet);
  assert.equal(select(jobs).totals.count,172);assert.equal(JSON.stringify(jobs),before);
});
test("Cutting Jobs, Cost Data Center and Financial Breakdown use exactly the same resolved duration and net",()=>{
  const jobs=freeze([imported("CUTPDF",1,{actualHours:12.3,materialCost:863.47})]);
  const c=vm.createContext({JOB_RATE_PER_HOUR:250,JOB_BASE_COST_PER_HOUR:30,window:{OMAXFinancialReconciliation:api},completedCuttingJobs:jobs,cuttingJobs:[],
    financialAnalysisDate:"2026-10-21",formatterCurrency:String,formatHoursValue:String,resolveCategoryName:()=>"Category"});
  vm.runInContext(computations,c);
  c.computeJobEfficiency=()=>({});
  vm.runInContext(section(renderers,"  const resolveCuttingJobHours =","  let maintenanceSeries =")+
    section(renderers,"  const completedJobsForDataCenter =","  const taskById =")+";this.snapshot=efficiencySnapshot;this.data=cuttingJobsDataTable;",c);
  assert.equal(c.data[0].hoursValue,12.3);near(c.data[0].totalProfitValue,profit(jobs[0]).totalProfit);assert.equal(c.snapshot.totalHoursLabel,"12.3");
  vm.runInContext(section(views,"function renderFinancialPeriodControl(","function cuttingJobFinancialTone(")+section(views,"function cuttingJobFinancialTone(","function viewJobs("),c);
  const report=api.build({completedJobs:jobs,profit,today:"2026-10-21",purchaseFinancials:purchases.getPurchaseFinancials});
  near(report.totals.net,Number(c.snapshot.totalNetGainLabel));assert.match(c.renderCuttingJobNetBreakdown(jobs[0]),/12\.3 hr from actualHours/);
  assert.match(c.renderFinancialBreakdown(report),/1 supported zero\/missing durations resolved/);assert.equal(jobs[0].estimateHours,0);
});
test("audit safely displays IDs, dates, cut numbers, source evidence, modeling effect and material differences",()=>{
  const c=vm.createContext({window:{OMAXFinancialReconciliation:api}});vm.runInContext(section(views,"function renderCuttingJobFinancialAudit(","function renderFinancialBreakdown("),c);
  const jobs=[imported("CUTPDF",1,{name:'<img src=x onerror=alert(1)>',cutNumber:"C074"}),imported("616-CUT",1,{name:'<img src=x onerror=alert(1)>',materialCost:99})];
  const r=audit(freeze(jobs)),before=JSON.stringify(r),html=c.renderCuttingJobFinancialAudit(r);
  for(const text of ["C074","CUTPDF-","616-CUT-","One-to-one candidate","DIFFERENT MATERIAL COSTS","actual_cut_minutes","modeled change","Available import provenance"])assert.ok(html.includes(text),text);
  assert.ok(!html.includes("<img"));assert.ok(html.includes("&lt;img"));assert.equal(JSON.stringify(r),before);
});
