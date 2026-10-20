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
  const html=api.summary(p);assert.match(html,/>Limited data<\/strong>/);assert.match(html,/Observed subset: 100.0%/);assert.doesNotMatch(html,/>100.0%<\/strong>/);
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
