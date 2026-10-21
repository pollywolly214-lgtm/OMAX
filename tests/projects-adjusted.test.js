"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const history=require("../js/cuttingJobHistory"),chronology=require("../js/cuttingJobChronology");
const c=vm.createContext({JOB_RATE_PER_HOUR:250,JOB_BASE_COST_PER_HOUR:30,CuttingJobChronology:chronology});
vm.runInContext(fs.readFileSync("js/computations.js","utf8"),c);vm.runInContext(fs.readFileSync("js/projects.js","utf8"),c);
const api=c.ProjectDashboard;
const job=(id,hours=2,extra={})=>({id,name:"Cut",cat:"mesquite",projectNumber:"1242",estimateHours:hours,chargeRate:200,costRate:45,materialCost:10,materialQty:1,...extra});
const state=(completed=[],active=[])=>({jobFolders:[{id:"jobs_root",name:"All Jobs"},{id:"mesquite",name:"1242 Mesquite",projectNumber:"1242"}],completedCuttingJobs:completed,cuttingJobs:active,inventory:[{id:"keep"}],syncMeta:{rev:14}});
const build=(s,includeActive=true)=>api.build(s,history,c.computeCuttingJobProfit,{includeActive}).projects[0];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const freeze=o=>{if(o&&typeof o==="object"){Object.freeze(o);Object.values(o).forEach(freeze);}};
const financialCards=p=>api.summary(p).split('<div class="project-finance-grid">')[1].split('</div>')[0];

test("ACC08 adjusted net is primary; three smaller no-failure comparisons and no duplicate total",()=>{
  const p=build(state([job("failed",2,{failurePercent:50})])),html=financialCards(p);
  assert.equal(p.provisional.value,100);assert.equal(p.adjustedAverageJob,100);assert.equal(p.adjustedAverageHour,50);assert.equal(p.averageJob,300);assert.equal(p.averageHour,150);
  assert.match(html,/Modeled Cut Net<\/h3><strong class="job-finance-positive">\$100.00<\/strong><span class="project-no-failures small muted">No failures: \$300.00/);
  assert.match(html,/Average Net per Job<\/h3><strong[^>]*>\$100.00<\/strong><span[^>]*>No failures: \$300.00/);
  assert.match(html,/Average Net per Cutting Hour<\/h3><strong[^>]*>\$50.00<\/strong><span[^>]*>No failures: \$150.00/);
  assert.match(html,/Known Failure-Related Reduction<\/h3><strong class="job-finance-negative">-\$200.00/);
  assert.equal((html.match(/<article/g)||[]).length,4);assert.equal((html.match(/No failures:/g)||[]).length,3);assert.doesNotMatch(api.summary(p),/data-project-provisional-net|data-project-financial-scope/);
  assert.match(api.summary(p),/Failure-Adjusted Modeled Cut Net<\/th>/);assert.match(api.summary(p),/<td><strong class="job-finance-positive">\$100.00<\/strong><br><span class="small muted">No failures: \$300.00/);
});

test("ACC08 effective zero matches hypothetical; positives reduce primary exactly once",()=>{
  const base=state([job("one",7,{chargeRate:240,materialCost:20})]);
  for(const failurePercent of [undefined,null,""," ",0,10,100]){
    const s=structuredClone(base);s.completedCuttingJobs[0].failurePercent=failurePercent;const p=build(s),deduction=(Number(failurePercent)||0)/100*1680;
    near(p.metrics.unadjustedNet.value,1345);near(p.provisional.value,1345-deduction);near(p.provisional.value+p.provisional.deduction.value,1345);
    near(p.adjustedAverageJob,1345-deduction);near(p.adjustedAverageHour,(1345-deduction)/7);near(p.averageJob,1345);near(p.averageHour,1345/7);
  }
});

test("ACC08 Mesquite supplied arithmetic is reproduced by artificial fixture inputs in both modes",()=>{
  const completed=[2.8,5,6,7,8,2.88].map((h,i)=>job(`cut-${i}`,h,{chargeRate:600,costRate:450,materialCost:i===5?59.31:60,...(i===0?{failurePercent:39}:{})}));
  const s=state(completed,[job("active",18.5,{chargeRate:600,costRate:450,materialCost:60})]),before=structuredClone(s);freeze(s);
  const off=build(s,false);near(off.metrics.hours.value,31.68);assert.equal(off.rows.length,6);near(off.metrics.unadjustedNet.value,4392.69);near(off.provisional.deduction.value,655.2);near(off.provisional.value,3737.49);
  near(off.adjustedAverageJob,3737.49/6);near(off.adjustedAverageHour,3737.49/31.68);near(off.averageJob,4392.69/6);near(off.averageHour,4392.69/31.68);
  const html=financialCards(off);assert.match(html,/>\$3,737.49<\/strong>/);assert.match(html,/No failures: \$4,392.69/);assert.match(html,/>-\$655.20<\/strong>/);
  assert.match(html,/>\$622.92<\/strong>/);assert.match(html,/>\$117.98<\/strong>/);assert.match(html,/No failures: \$732.11/);assert.match(html,/No failures: \$138.66/);
  const on=build(s);assert.equal(on.rows.length,7);near(on.metrics.hours.value,50.18);near(on.metrics.unadjustedNet.value,7107.69);near(on.provisional.value,6452.49);near(on.provisional.deduction.value,655.2);
  near(on.adjustedAverageJob,6452.49/7);near(on.adjustedAverageHour,6452.49/50.18);near(on.averageJob,7107.69/7);near(on.averageHour,7107.69/50.18);assert.deepEqual(s,before);
});

test("ACC08 financial eligibility matches for both numerators and average denominators; partial results disclosed",()=>{
  const s=state([job("short",1,{failurePercent:50}),job("long",3),job("missing-material",50,{materialCost:undefined,failurePercent:100})]),p=build(s);
  assert.equal(p.metrics.hours.value,54);assert.equal(p.metrics.unadjustedNet.known,2);assert.equal(p.applicableHours,4);near(p.metrics.unadjustedNet.value,600);near(p.provisional.value,500);
  assert.equal(p.provisional.deduction.value,100);assert.equal(p.adjustedAverageJob,250);assert.equal(p.adjustedAverageHour,125);assert.equal(p.averageJob,300);assert.equal(p.averageHour,150);
  assert.match(api.summary(p),/Financial coverage is incomplete: 2\/3/);assert.match(financialCards(p),/partial result, not the complete project total/);
});

test("ACC08 invalid failures leave primary and averages unavailable without inventing zero deductions",()=>{
  for(const failurePercent of [-1,101,NaN,Infinity,false,"bad"]){
    const p=build(state([job("valid"),job("invalid",2,{failurePercent})]));
    assert.equal(p.provisional.value,null);assert.equal(p.adjustedAverageJob,null);assert.equal(p.adjustedAverageHour,null);assert.equal(p.metrics.unadjustedNet.value,600);
    assert.match(financialCards(p),/Modeled Cut Net<\/h3><strong class="">Unavailable<\/strong><span[^>]*>No failures: \$600.00/);assert.match(api.summary(p),/Invalid values keep adjusted results unavailable/);
  }
});

test("ACC08 invalid financial inputs, no eligible jobs and zero-hour averages remain honest",()=>{
  for(const field of ["estimateHours","chargeRate","costRate","materialCost","materialQty"]){
    const p=build(state([job("invalid",2,{[field]:null})]));assert.equal(p.provisional.value,null);assert.equal(p.adjustedAverageJob,null);assert.equal(p.adjustedAverageHour,null);assert.match(api.summary(p),/Financial coverage is incomplete: 0\/1/);assert.match(financialCards(p),/No failures: Unavailable/);
  }
  const zero=build(state([],[job("zero",0)]));assert.equal(zero.provisional.value,-10);assert.equal(zero.adjustedAverageJob,-10);assert.equal(zero.adjustedAverageHour,null);
  const empty=build(state());assert.equal(empty.adjustedAverageJob,null);assert.equal(empty.adjustedAverageHour,null);
});

test("ACC08 loss is prominent, hypothetical stays secondary, and helper agrees with Projects resolved duration",()=>{
  const s=state([job("import",0,{actualHours:2,import_event_id:"616-CUT-P01-L001",importProvenance:{actual_cut_minutes:"120"},failurePercent:100})]),p=build(s),row=p.rows[0];
  const reference=c.computeCuttingJobProfit({...s.completedCuttingJobs[0],estimateHours:2});
  assert.equal(row.net,reference.totalProfit);assert.equal(row.unadjustedNet,reference.originalNetProfit);assert.equal(row.reduction,reference.revenueLost);assert.equal(p.provisional.value,-100);
  assert.match(financialCards(p),/Modeled Cut Net<\/h3><strong class="job-finance-negative">-\$100.00<\/strong><span class="project-no-failures small muted">No failures: \$300.00/);
});

test("ACC08 reporting preserves all protected source data and uses current failure rather than audits",()=>{
  const s=state([job("616",2,{failurePercent:0,import_event_id:"616-CUT-P01-L001",cutChronologyHistory:[{kind:"failure",after:{failurePercent:100}}]}),job("CUTPDF",2,{import_event_id:"CUTPDF-20261001-001"})],[job("active",3)]),before=structuredClone(s);freeze(s);
  for(const mode of [true,false]){const p=build(s,mode);api.summary(p);assert.equal(p.provisional.value,p.metrics.unadjustedNet.value);assert.equal(p.failure.affected,0);assert.deepEqual(s,before);}
});
