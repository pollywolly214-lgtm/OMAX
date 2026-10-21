"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const history=require("../js/cuttingJobHistory"),chronology=require("../js/cuttingJobChronology");
const c=vm.createContext({JOB_RATE_PER_HOUR:250,JOB_BASE_COST_PER_HOUR:30,CuttingJobChronology:chronology});
vm.runInContext(fs.readFileSync("js/computations.js","utf8"),c);vm.runInContext(fs.readFileSync("js/projects.js","utf8"),c);
const api=c.ProjectDashboard,profit=c.computeCuttingJobProfit;
const job=(id,extra={})=>({id,name:"Cut",cat:"atm",projectNumber:"1251",estimateHours:0,actualHours:2,chargeRate:100,costRate:-20,materialCost:10,materialQty:2,
  completedAtISO:"2026-06-26",import_event_id:`616-CUT-P01-L${id}`,importProvenance:{actual_cut_minutes:"120"},...extra});
const state=(completed=[],active=[])=>({jobFolders:[{id:"jobs_root",name:"All Jobs"},{id:"atm",name:"1251 ATM",projectNumber:"1251"}],completedCuttingJobs:completed,cuttingJobs:active,inventory:[{id:"keep"}],syncMeta:{rev:12}});
const project=s=>api.build(s,history,profit).projects[0];
const views=fs.readFileSync("js/views.js","utf8");c.window={};
vm.runInContext(views.slice(views.indexOf("function cuttingJobFinancialTone("),views.indexOf("function viewJobs(){")),c);
test("ACC03 historical missing failure produces originalNetProfit without inventing success or reduction",()=>{
  const record=job("a"),p=project(state([record])),row=p.rows[0];assert.equal(row.unadjustedNet,140);assert.equal(row.net,null);assert.equal(row.reduction,null);assert.equal(row.failurePercent,null);
  assert.equal(p.metrics.unadjustedNet.known,1);assert.equal(p.averageJob,140);assert.equal(p.averageHour,70);assert.equal(p.success.value,null);
  assert.match(api.summary(p),/does not account for unknown failed cuts/);assert.match(api.summary(p),/Known failure-adjusted modeled net: Unavailable/);
});
test("ACC03 failures change only the independently adjusted results",()=>{
  for(const [failurePercent,net,reduction] of [[0,140,0],[50,40,100],[100,-60,200]]){
    const record=job(String(failurePercent),{failurePercent}),row=project(state([record])).rows[0],reference=profit({...record,estimateHours:2});
    assert.equal(row.unadjustedNet,140);assert.equal(row.unadjustedNet,reference.originalNetProfit);assert.equal(row.net,net);assert.equal(row.net,reference.totalProfit);assert.equal(row.reduction,reduction);
  }
});
test("ACC03 historical and modern eligibility is independent of age and unknown failures",()=>{
  const historical=job("old",{completedAtISO:"2025-01-01"}),modern=job("new",{estimateHours:1,actualHours:99,import_event_id:undefined,importProvenance:undefined,completedAtISO:"2026-10-20",failurePercent:50});
  const active=job("active",{estimateHours:3,completedAtISO:undefined,import_event_id:undefined,importProvenance:undefined});
  const p=project(state([historical,modern],[active]));assert.equal(p.metrics.unadjustedNet.known,3);assert.equal(p.metrics.unadjustedNet.value,420);assert.equal(p.metrics.net.known,1);assert.equal(p.metrics.net.value,10);assert.equal(p.averageJob,140);assert.equal(p.averageHour,70);
});
test("ACC03 averages exclude missing financial inputs and their hours from both denominators",()=>{
  const p=project(state([job("a"),job("b",{actualHours:1,chargeRate:200,failurePercent:100}),job("missing",{actualHours:50,materialCost:undefined})]));
  assert.equal(p.metrics.unadjustedNet.value,300);assert.equal(p.metrics.unadjustedNet.known,2);assert.equal(p.averageJob,150);assert.equal(p.averageHour,100);assert.equal(p.applicableHours,3);assert.equal(p.metrics.hours.value,53);
  assert.match(api.summary(p),/2\/3 jobs eligible for unadjusted net/);assert.match(api.summary(p),/3 hr across 2\/3 eligible jobs/);
});
test("ACC03 missing and invalid financial inputs stay unavailable; no new rates are inferred",()=>{
  for(const key of ["actualHours","chargeRate","costRate","materialCost","materialQty"]){
    for(const value of [undefined,null,"",NaN,Infinity,"bad",false]){
      const record=job("missing",{[key]:value});if(key==="actualHours")record.importProvenance={actual_cut_minutes:""};
      assert.equal(project(state([record])).rows[0].unadjustedNet,null,`${key}: ${value}`);
    }
  }
  const p=project(state([job("zero",{chargeRate:0,costRate:0,materialCost:0})]));assert.equal(p.metrics.unadjustedNet.value,0);assert.equal(p.metrics.unadjustedNet.known,1);
});
test("ACC03 one successful tracked job out of seven never presents a project-wide 100% success value",()=>{
  const p=project(state(Array.from({length:7},(_,i)=>job(String(i),i===0?{failurePercent:0}:{}))));
  assert.equal(p.success.value,null);assert.equal(p.success.observedValue,100);assert.equal(p.success.known,1);assert.equal(p.metrics.unadjustedNet.known,7);
  const html=api.summary(p);assert.match(html,/>Limited data<\/strong>/);assert.match(html,/Observed completed subset: 100.0%/);assert.doesNotMatch(html,/>100.0%<\/strong>/);
  const known=project(state([job("a",{failurePercent:0}),job("b",{failurePercent:50})]));assert.equal(known.success.value,50);assert.match(api.summary(known),/>50.0%<\/strong>/);
});
test("ACC03 no failure coverage, including an empty project, never displays zero known reduction",()=>{
  for(const s of [state([job("a")]),state()]){
    const html=api.summary(project(s));assert.match(html,/Known Failure-Related Reduction<\/h3><strong class="">Unavailable<\/strong>/);
  }
  const known=project(state([job("a",{failurePercent:0})]));assert.equal(known.metrics.reduction.known,1);assert.equal(known.metrics.reduction.value,0);
});
test("ACC03 import source blanks and stored efficiency fallbacks receive scoped provenance notices",()=>{
  const record=job("a",{chargeRate:200,costRate:45,importProvenance:{actual_cut_minutes:"120",charge_rate_per_hr:"",cost_rate_per_hr:""}}),p=project(state([record]));
  assert.equal(p.rows[0].unadjustedNet,290);assert.match(api.summary(p),/1 jobs have blank or invalid original import rate fields/);assert.match(api.summary(p),/importer defaults or later edits/);
  const fallback=project(state([job("fallback",{chargeRate:undefined,costRate:undefined,efficiency:{chargeRate:100,costRate:20}})]));assert.equal(fallback.rows[0].unadjustedNet,140);assert.match(api.summary(fallback),/stored efficiency rates/);
  assert.doesNotMatch(api.summary(project(state([job("plain")]))),/blank or invalid original import rate fields/);
});
test("ACC03 different-ID 616/CUTPDF matches retain unadjusted net and all original source contents",()=>{
  const s=state([job("a"),job("b",{import_event_id:"CUTPDF-20260626-001"})]),before=structuredClone(s);
  const freeze=v=>{if(v&&typeof v==="object"){Object.freeze(v);Object.values(v).forEach(freeze);}};freeze(s);
  const p=project(s);assert.equal(p.rows.length,2);assert.equal(p.metrics.hours.value,4);assert.equal(p.metrics.unadjustedNet.value,280);assert.equal(p.potentialOverlap,true);api.summary(p);assert.deepEqual(s,before);
});
test("ACC03 zero-hour averages and overflowing unadjusted totals are safe",()=>{
  const zero=project(state([job("zero",{actualHours:0,importProvenance:{actual_cut_minutes:"0"}})]));assert.equal(zero.averageJob,-20);assert.equal(zero.averageHour,null);
  const huge=project(state([job("huge",{actualHours:1e308,chargeRate:1e308})]));assert.equal(huge.rows[0].unadjustedNet,null);assert.doesNotMatch(api.summary(huge),/Infinity|NaN/);
});

test("ACC04 individual displays distinguish undocumented failures from recorded zero without changing helper defaults",()=>{
  for(const failurePercent of [undefined,null,""," ",NaN,Infinity,false,-1,101]){
    const record=job("missing",{failurePercent}),before=structuredClone(record),html=c.renderCuttingJobNetBreakdown(record);
    assert.match(html,/Failure: Not recorded/);assert.match(html,/Net Total \(provisional, failure not recorded\)/);assert.doesNotMatch(html,/Failure: 0%/);assert.equal(c.cuttingJobFailureLabel(record),"Not recorded");assert.equal(project(state([record])).success.known,0);assert.deepEqual(record,before);
  }
  for(const failurePercent of [0,"0"]){const record=job("zero",{failurePercent});assert.match(c.renderCuttingJobNetBreakdown(record),/Failure: 0%/);assert.equal(c.cuttingJobFailureLabel(record),"0%");assert.equal(project(state([record])).success.known,1);}
  const p=profit(job("missing"));assert.equal(p.failurePercent,0); // Shared helper contract is unchanged.
});
test("ACC04 10% of a $1680 charge deducts $168, leaving unadjusted net unchanged and 2/7 as coverage",()=>{
  const records=Array.from({length:7},(_,i)=>job(String(i),{actualHours:i===1?7:1,chargeRate:i===1?240:100,costRate:i===1?45:20,materialCost:i===1?20:10,materialQty:1,...(i===0?{failurePercent:0}:{})}));
  const before=structuredClone(records),initial=project(state(records));assert.equal(initial.metrics.unadjustedNet.value,1765);assert.equal(initial.provisional.value,1765);assert.equal(initial.success.known,1);
  const changed=records.map((r,i)=>i===1?{...r,failurePercent:10}:r),p=project(state(changed));assert.equal(p.metrics.reduction.value,168);assert.equal(p.provisional.deduction.value,168);assert.equal(p.provisional.value,1597);assert.equal(p.metrics.unadjustedNet.value,1765);assert.equal(p.success.known,2);assert.equal(p.success.value,null);
  const html=api.summary(p);assert.match(html,/2 of 7 completed jobs with recorded outcomes/);assert.match(html,/job-finance-negative">-\$168.00/);assert.match(html,/>Limited data<\/strong>/);assert.match(html,/coverage, not a failed-job count/);assert.deepEqual(records,before);
  assert.equal(c.formatCuttingJobFinancialValue(profit({...changed[1],estimateHours:7}),"revenueLost"),"-$168.00");
});
test("ACC04 provisional deductions use the same financially eligible jobs as unadjusted net",()=>{
  const p=project(state([job("eligible",{actualHours:7,chargeRate:240,costRate:45,materialCost:20,materialQty:1,failurePercent:10}),job("missing-cost",{actualHours:7,chargeRate:240,failurePercent:20,materialCost:undefined})]));
  assert.equal(p.metrics.reduction.value,504);assert.equal(p.provisional.deduction.value,168);assert.equal(p.provisional.deduction.total,1);assert.equal(p.provisional.value,1177);assert.equal(p.metrics.unadjustedNet.value,1345);
  assert.match(api.summary(p),/Only known deductions from the same 1 financially eligible jobs are subtracted/);
});
test("ACC04 absent failures leave provisional net unadjusted with an explicit no-deduction explanation",()=>{
  const p=project(state([job("unknown")]));assert.equal(p.provisional.value,140);assert.equal(p.provisional.deduction.known,0);assert.match(api.summary(p),/No verified failure deduction is available/);assert.equal(p.success.value,null);
  const missing=project(state([job("missing",{chargeRate:undefined})]));assert.equal(missing.provisional.value,null);
});
test("ACC05 success uses completed outcomes only; active projections remain financially included",()=>{
  const completed=Array.from({length:6},(_,i)=>job(String(i),i<2?{failurePercent:0}:{}));
  for(const failurePercent of [undefined,0,100]){
    const active=job("active",{estimateHours:3,completedAtISO:undefined,failurePercent}),p=project(state(completed,[active]));
    assert.equal(p.rows.length,7);assert.equal(p.success.total,6);assert.equal(p.success.known,2);assert.equal(p.success.value,null);assert.equal(p.success.observedValue,100);
    assert.equal(p.financialScope.completed.value,840);assert.equal(p.financialScope.active.value,220);assert.equal(p.metrics.unadjustedNet.value,1060);assert.equal(p.financialScope.completed.value+p.financialScope.active.value,p.metrics.unadjustedNet.value);
    const html=api.summary(p);assert.match(html,/2 of 6 completed jobs with recorded outcomes/);assert.match(html,/>Limited data<\/strong>/);assert.match(html,/active plans; they are not completed production performance/);assert.match(html,/Completed-only unadjusted modeled net: <strong>\$840.00/);assert.match(html,/Active-job projected unadjusted net: <strong>\$220.00/);
  }
});
test("ACC05 active-only jobs never have completed-cut success or missing-outcome warnings",()=>{
  const p=project(state([],[job("active",{estimateHours:2,failurePercent:100})]));assert.equal(p.success.total,0);assert.equal(p.success.known,0);assert.equal(p.success.value,null);assert.equal(p.metrics.unadjustedNet.value,140);
  assert.doesNotMatch(api.summary(p),/Completed-cut failure information is incomplete/);assert.match(api.summary(p),/0 of 0 completed jobs with recorded outcomes/);
});
test("ACC05 display dates normalize timestamps without changing source timestamps or duration basis",()=>{
  const s=state([job("recorded",{completedAtISO:"2026-06-26T23:10:00.000Z"})],[job("plan",{estimateHours:3,completedAtISO:undefined,startISO:"2026-06-25T11:00:00.000Z"})]),before=structuredClone(s),p=project(s),html=api.summary(p);
  assert.match(html,/<td>2026-06-26<\/td>/);assert.match(html,/<td>2026-06-25<\/td>/);assert.doesNotMatch(html,/<td>[^<]*T\d/);assert.match(html,/estimateHours \(active plan\)/);assert.match(html,/not independently verified machine runtime/);assert.deepEqual(s,before);assert.equal(p.rows.find(row=>row.id==="recorded").hours,2);
});
