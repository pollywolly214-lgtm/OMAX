"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const history=require("../js/cuttingJobHistory"),chronology=require("../js/cuttingJobChronology");
const c=vm.createContext({JOB_RATE_PER_HOUR:250,JOB_BASE_COST_PER_HOUR:30,CuttingJobChronology:chronology});
vm.runInContext(fs.readFileSync("js/computations.js","utf8"),c);vm.runInContext(fs.readFileSync("js/projects.js","utf8"),c);
const api=c.ProjectDashboard;
const job=(id,hours,extra={})=>({id,name:"Repeated cut",cat:"mesquite",projectNumber:"1242",estimateHours:hours,chargeRate:200,costRate:45,materialCost:10,materialQty:1,...extra});
const state=(completed,active=[])=>({jobFolders:[{id:"jobs_root",name:"All Jobs"},{id:"mesquite",name:"1242 Mesquite",projectNumber:"1242"}],completedCuttingJobs:completed,cuttingJobs:active,syncMeta:{rev:4}});
const build=(s,includeActive=true)=>api.build(s,history,c.computeCuttingJobProfit,{includeActive}).projects[0];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const freeze=o=>{if(o&&typeof o==="object"){Object.freeze(o);Object.values(o).forEach(freeze);}};

test("ACC07 Mesquite disposable fixture: both populations govern every metric and preserve source records",()=>{
  const completed=[2.8,5,6,7,8,2.88].map((h,i)=>job(`completed-${i}`,h,{completedAtISO:"2026-10-01",...(i===0?{failurePercent:39}:i===1?{failurePercent:0,cutChronologyHistory:[{kind:"failure",after:{failurePercent:80}}]}:i===2?{failurePercent:null}:i===3?{failurePercent:" "}:{})}));
  const s=state(completed,[job("active",18.5)]),before=structuredClone(s);freeze(s);
  for(const [includeActive,count,hours,processing,material,net,provisional,rate] of [[true,7,50.18,2258.1,70,7707.9,7489.5,2.18],[false,6,31.68,1425.6,60,4850.4,4632,3.45]]){
    const p=build(s,includeActive),m=p.metrics,html=api.summary(p);
    assert.equal(p.rows.length,count);near(m.hours.value,hours);near(m.processing.value,processing);near(m.material.value,material);near(m.totalCost.value,processing+material);
    near(m.unadjustedNet.value,net);near(m.net.value,provisional);near(p.provisional.value,provisional);near(m.reduction.value,218.4);near(p.provisional.deduction.value,218.4);
    near(p.averageJob,net/count);near(p.averageHour,net/hours);near(p.failure.hours,1.092);near(p.failure.totalHours,hours);near(p.failure.value,1.092/hours*100);
    assert.equal(p.failure.value.toFixed(2),rate.toFixed(2));assert.equal(p.failure.affected,1);assert.equal(p.failure.known,count);assert.equal(p.failure.total,count);
    for(const key of Object.keys(m))assert.equal(m[key].total,count,key);
    assert.equal((html.match(/data-project-job=/g)||[]).length,count);assert.match(html,new RegExp(`1 of ${count} currently failure-affected jobs`));
    assert.match(html,/1.092 hr failed cutting hours/);assert.equal(html.includes("data-project-financial-scope"),includeActive);assert.doesNotMatch(html,/Limited data|Cut Success Rate/);
    assert.deepEqual(s,before);
  }
  assert.equal(api.build(s,history,c.computeCuttingJobProfit).projects[0].rows.length,7); // Default ON.
});

test("ACC07 missing, null, blank and explicit zero use effective zero without backfilling",()=>{
  for(const extra of [{},{failurePercent:undefined},{failurePercent:null},{failurePercent:""},{failurePercent:"  "},{failurePercent:0},{failurePercent:"0"}]){
    const s=state([job("zero",2,extra)]),before=structuredClone(s);freeze(s);const p=build(s);
    assert.equal(p.rows[0].effectiveFailurePercent,0);assert.equal(p.failure.value,0);assert.equal(p.failure.affected,0);assert.equal(p.metrics.reduction.value,0);assert.equal(p.provisional.value,300);assert.deepEqual(s,before);
  }
});

test("ACC07 invalid percentages remain unavailable instead of silently reducing by zero",()=>{
  for(const failurePercent of [-1,101,NaN,Infinity,false,true,{},[],"bad"]){
    const p=build(state([job("invalid",2,{failurePercent}),job("valid",1)]));
    assert.equal(p.failure.value,null);assert.equal(p.failure.invalid,1);assert.equal(p.failure.known,1);assert.equal(p.rows.find(r=>r.id==="invalid").net,null);assert.equal(p.provisional.value,null);
    assert.equal(p.metrics.unadjustedNet.known,2);assert.match(api.summary(p),/not treated as zero/);assert.match(api.summary(p),/incomplete coverage/);
  }
});

test("ACC07 unequal durations use all hours, including failed time, rather than job counts or equal averages",()=>{
  const p=build(state([job("failed",1,{failurePercent:100}),job("zero",9)]));
  assert.equal(p.failure.hours,1);assert.equal(p.failure.totalHours,10);assert.equal(p.failure.value,10);assert.equal(p.failure.affected,1);
  const s=state([job("complete",1,{failurePercent:100})],[job("active",9,{failurePercent:20})]);
  near(build(s).failure.value,28);near(build(s,false).failure.value,100);near(build(s).failure.hours,2.8);
});

test("ACC07 unsupported durations, no hours and overflow never produce a reliable rate",()=>{
  for(const estimateHours of [undefined,null,"",-1,NaN,Infinity]){
    const p=build(state([job("missing",estimateHours,{failurePercent:39}),job("known",2)]));
    assert.equal(p.failure.value,null);assert.equal(p.failure.known,1);assert.equal(p.failure.affected,1);assert.match(api.summary(p),/incomplete coverage/);
  }
  const zero=build(state([],[job("zero",0,{failurePercent:39})]));assert.equal(zero.failure.value,null);assert.equal(zero.failure.totalHours,0);
  const empty=build(state([]));assert.equal(empty.failure.value,null);
  const overflow=build(state([job("a",1e308),job("b",1e308)]));assert.equal(overflow.failure.value,null);assert.doesNotMatch(api.summary(overflow),/NaN|Infinity/);
});

test("ACC07 current reset to zero removes reductions and affected count while retaining prior audit evidence",()=>{
  const prior=[{kind:"failure",before:{failurePercent:0},after:{failurePercent:39}}],s=state([job("reset",2.8,{failurePercent:0,cutChronologyHistory:prior})]),before=structuredClone(s);freeze(s);
  const p=build(s);assert.equal(p.failure.value,0);assert.equal(p.failure.affected,0);assert.equal(p.provisional.deduction.value,0);assert.equal(p.provisional.value,p.metrics.unadjustedNet.value);assert.deepEqual(s,before);
});

test("ACC07 distinct import IDs remain counted in both modes and same-ID lifecycle copies remain single",()=>{
  const a=job("616",2,{actualHours:2,import_event_id:"616-CUT-P01-L001",importProvenance:{actual_cut_minutes:"120"}}),b={...a,id:"pdf",import_event_id:"CUTPDF-20261001-001"};
  const s=state([a,b],[structuredClone(a),job("active",3)]),before=structuredClone(s);freeze(s);
  for(const [mode,count,hours] of [[true,3,7],[false,2,4]]){const p=build(s,mode);assert.equal(p.rows.length,count);assert.equal(p.metrics.hours.value,hours);assert.equal(p.rows.filter(r=>r.id==="616").length,1);assert.deepEqual(s,before);}
});

test("ACC07 completed-only mode still validates project ownership against all source records",()=>{
  const s=state([job("complete",2)],[job("conflict",3,{projectNumber:"9999"})]);
  assert.equal(api.build(s,history,c.computeCuttingJobProfit,{includeActive:false}).projects.length,0);
});
