"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const history=require("../js/cuttingJobHistory"),chronology=require("../js/cuttingJobChronology");
const c=vm.createContext({JOB_RATE_PER_HOUR:200,JOB_BASE_COST_PER_HOUR:45,CuttingJobChronology:chronology});
vm.runInContext(fs.readFileSync("js/computations.js","utf8"),c);
vm.runInContext(fs.readFileSync("js/projects.js","utf8"),c);
const api=c.ProjectDashboard,profit=c.computeCuttingJobProfit;
const job=(id,extra={})=>({id,name:"Identical visible name",cat:"blanco",projectNumber:"1254",estimateHours:2,chargeRate:150,costRate:-25,materialCost:5,materialQty:5,failurePercent:0,cutNumber:"C041",startISO:"2026-10-01",...extra});
const state=(jobs=[],completed=[])=>({jobFolders:[{id:"jobs_root",name:"All Jobs"},{id:"blanco",name:"1254 Blanco",projectNumber:"1254"},{id:"atm",name:"1251 ATM",projectNumber:"1251"}],cuttingJobs:jobs,completedCuttingJobs:completed,inventory:[{id:"preserve"}],syncMeta:{rev:123},cutChronologyHistory:[{keep:true}]});
const build=s=>api.build(s,history,profit),project=s=>build(s).projects.find(p=>p.id==="blanco");
test("stable category ownership, leading zeros and ambiguous history are resolved by CJPC/CJI",()=>{
  const s=state([job("one")]);s.jobFolders.push({id:"zero",name:"0000 Company Improvements"},{id:"unowned",name:"Bare unknown name"});
  s.cuttingJobs.push(job("orphan",{cat:"missing"}),job("zero-job",{cat:"zero",projectNumber:"0000"}));
  const result=build(s);assert.equal(result.projects.find(p=>p.id==="zero").number,"0000");assert.equal(result.projects.find(p=>p.id==="blanco").rows.length,1);
  assert.ok(result.issues.some(x=>x.includes("orphan")));assert.ok(!result.projects.some(p=>p.id==="unowned"));
  s.jobFolders.push({id:"blanco-copy",name:"1254 Blanco"});assert.ok(!build(s).projects.some(p=>p.number==="1254"));
});
test("same visible names retain separate job IDs; active and completed jobs both contribute",()=>{
  const p=project(state([job("active")],[job("past")]));assert.equal(p.rows.length,2);assert.equal(new Set(p.rows.map(r=>r.id)).size,2);assert.equal(p.metrics.hours.value,4);assert.equal(p.rows.filter(r=>r.completed).length,1);
});
test("project totals agree with CJPROFIT for zero, partial and complete failures and both rate signs",()=>{
  for(const sign of [-1,1]){
    const jobs=[0,50,100].map((failurePercent,i)=>job(String(i),{failurePercent,costRate:25*sign}));const p=project(state(jobs));
    const calculations=jobs.map(j=>profit(j));assert.equal(p.metrics.processing.value,150);assert.equal(p.metrics.material.value,75);assert.equal(p.metrics.totalCost.value,225);
    assert.equal(p.metrics.net.value,calculations.reduce((n,x)=>n+x.totalProfit,0));assert.equal(p.metrics.reduction.value,450);assert.equal(p.success.value,100/3);
  }
});
test("weighted average net/hour uses applicable total hours and net/job uses applicable count",()=>{
  const p=project(state([job("short",{estimateHours:1,chargeRate:100}),job("long",{estimateHours:3,chargeRate:200})]));
  assert.equal(p.metrics.net.value,550);assert.equal(p.averageJob,275);assert.equal(p.averageHour,137.5);assert.notEqual(p.averageHour,(50+500/3)/2);
});
test("missing failure data never becomes success or a reliable net; processing remains available",()=>{
  const unknown=job("unknown");delete unknown.failurePercent;
  const p=project(state([unknown,job("known")]));assert.equal(p.success.known,1);assert.equal(p.success.value,100);assert.equal(p.metrics.net.known,1);assert.equal(p.averageJob,225);assert.equal(p.averageHour,112.5);assert.equal(p.metrics.processing.known,2);
  const html=api.summary(p);assert.match(html,/1\/2 jobs with reliable data; partial coverage/);assert.match(html,/Missing failure data is not treated as success/);
});
test("absent and invalid costs do not fall back to false zero totals or global default rates",()=>{
  for(const key of ["estimateHours","chargeRate","costRate","materialCost","materialQty","failurePercent"]){
    for(const value of [undefined,null,"",NaN,Infinity,"   ",true,{},"bad"]){
      const record=job("j",{[key]:value}),row=project(state([record])).rows[0];assert.equal(row.net,null,`${key}: ${value}`);
    }
  }
  for(const failurePercent of [-1,101])assert.equal(project(state([job("j",{failurePercent})])).rows[0].net,null);
  for(const key of ["estimateHours","chargeRate","materialCost","materialQty"])assert.equal(project(state([job("j",{[key]:-1})])).rows[0].net,null);
});
test("stored efficiency rates reuse helper fallback without confusing whitespace with zero",()=>{
  const record=job("j",{chargeRate:" ",costRate:null,efficiency:{chargeRate:120,costRate:20}}),row=project(state([record])).rows[0];
  assert.equal(row.processing,40);assert.equal(row.net,175);
});
test("zero hours and empty projects have safe denominators; explicit zero costs and failures are known",()=>{
  const p=project(state([job("j",{estimateHours:0,materialCost:0,materialQty:0,costRate:0,chargeRate:0})]));assert.equal(p.metrics.net.value,0);assert.equal(p.success.value,100);assert.equal(p.averageJob,0);assert.equal(p.averageHour,null);
  const empty=project(state());assert.equal(empty.metrics.net.value,0);assert.equal(empty.averageJob,null);assert.equal(empty.success.value,null);
});
test("identical lifecycle copies count once and conflicting copies never invent metrics or navigation",()=>{
  const record=job("one"),p=project(state([record],[structuredClone(record)]));assert.equal(p.rows.length,1);assert.equal(p.metrics.net.value,225);assert.equal(p.rows[0].navigable,false);
  const conflicting=project(state([record],[job("one",{estimateHours:9})]));assert.equal(conflicting.rows.length,1);assert.equal(conflicting.metrics.hours.known,0);assert.equal(conflicting.metrics.net.known,0);
  const crossed=build(state([record],[job("one",{cat:"atm",projectNumber:"1251"})]));assert.ok(crossed.projects.every(p=>p.rows.length===0));
});
test("ambiguous category ownership, absent stable IDs and unsupported historical associations are reported",()=>{
  const s=state([job("one"),job("conflict",{projectNumber:"1251"}),job("",{cat:"atm",projectNumber:"1251"})]);
  const result=build(s);assert.ok(!result.projects.some(p=>p.id==="blanco"));assert.ok(result.issues.length>=3);
  const legacy=state([job("legacy",{cat:"old",projectNumber:"1111"})]);legacy.jobFolders.push({id:"old",name:"1111 Unknown"});
  const oldProject=build(legacy).projects.find(p=>p.number==="1111");assert.equal(oldProject.rows[0].id,"legacy");assert.equal(project(legacy).rows.length,0); // Keep 1111 distinct; never remap it to a known name.
});
test("overflow never reaches displayed financial values or averages",()=>{
  const p=project(state([job("huge",{estimateHours:1e308,chargeRate:1e308,costRate:1e308,materialCost:1e308,materialQty:1e308})]));assert.equal(p.rows[0].net,null);assert.equal(p.metrics.net.known,0);assert.doesNotMatch(api.summary(p),/Infinity|NaN/);
  const aggregate=project(state([job("a",{estimateHours:1e308,chargeRate:1,costRate:0,materialCost:0,materialQty:0}),job("b",{estimateHours:1e308,chargeRate:1,costRate:0,materialCost:0,materialQty:0})]));assert.equal(aggregate.metrics.hours.value,null);assert.equal(aggregate.averageHour,null);assert.equal(aggregate.averageJob,null);
});
test("rendering escapes names and IDs, starts collapsed, and all source records remain unchanged",()=>{
  const s=state([job('id"<script>',{name:'<img onerror="bad">'})]),before=structuredClone(s);const html=api.summary(project(s));
  assert.ok(html.includes("&lt;img"));assert.ok(html.includes("id&quot;&lt;script&gt;"));assert.doesNotMatch(html,/<details[^>]*\bopen\b/);assert.deepEqual(s,before);
});
