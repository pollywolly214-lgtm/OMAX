"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const history=require("../js/cuttingJobHistory"),chronology=require("../js/cuttingJobChronology");
const c=vm.createContext({JOB_RATE_PER_HOUR:250,JOB_BASE_COST_PER_HOUR:30,CuttingJobChronology:chronology});
vm.runInContext(fs.readFileSync("js/computations.js","utf8"),c);vm.runInContext(fs.readFileSync("js/projects.js","utf8"),c);
const api=c.ProjectDashboard,profit=c.computeCuttingJobProfit;
const job=(id,extra={})=>({id,name:"Repeated physical cut",cat:"atm",projectNumber:"1251",estimateHours:0,actualHours:3.5,
  chargeRate:200,costRate:-45,materialCost:10,materialQty:2,failurePercent:0,completedAtISO:"2026-06-26",...extra});
const imported=(id,event,extra={})=>job(id,{import_event_id:event,importProvenance:{import_event_id:event,record_status:"completed",actual_cut_minutes:"210",source_file:"reviewed workbook",sourceRowNumber:12,source_text:"Source operation"},...extra});
const state=(completed=[],active=[])=>({jobFolders:[{id:"jobs_root",name:"All Jobs"},{id:"atm",name:"1251 ATM",projectNumber:"1251"},{id:"blanco",name:"1254 Blanco",projectNumber:"1254"}],
  completedCuttingJobs:completed,cuttingJobs:active,inventory:[{id:"keep"}],receiptTrackerWeeks:[{rows:[{id:"receipt"}]}],maintenanceOccurrencesV2:[{id:"maintenance"}],
  totalHistory:[{dateISO:"2026-01-01",hours:100}],pumpEff:{entries:[{id:"rpm"}]},dashboardLayout:{x:1},syncMeta:{rev:123}});
const build=s=>api.build(s,history,profit),project=s=>build(s).projects.find(p=>p.id==="atm");
test("ACC02 historical recorded duration overrides zero and positive estimates in a calculation-only copy",()=>{
  for(const estimateHours of [0,2]){
    const record=imported("historical","616-CUT-P01-L001",{estimateHours}),before=structuredClone(record),seen=[];
    const result=api.financials(record,copy=>{seen.push(copy);return profit(copy);},false,true);
    assert.equal(result.hours,3.5);assert.equal(result.hoursSource,"actualHours");assert.equal(result.processing,157.5);assert.equal(result.material,20);assert.equal(result.totalCost,177.5);assert.equal(result.net,522.5);
    assert.equal(seen[0].estimateHours,3.5);assert.notEqual(seen[0],record);assert.deepEqual(record,before);assert.equal(profit(record).hours,estimateHours);
  }
});
test("ACC02 active and current completed jobs retain stored Hours Taken despite stale progress hours",()=>{
  for(const completed of [false,true]){
    const row=api.financials(job("current",{estimateHours:2,actualHours:9,manualLogs:[{dateISO:"2026-06-26",completedHours:8}]}),profit,false,completed);
    assert.equal(row.hours,2);assert.equal(row.hoursSource,"estimateHours");assert.equal(row.processing,90);
  }
  const activeImported=api.financials(imported("active","616-CUT-P01-L001",{estimateHours:2}),profit,false,false);assert.equal(activeImported.hours,2);
  assert.equal(api.duration(job("legacy-unmarked"),true).hours,3.5);
});
test("ACC02 actual hours and cumulative logs are alternative representations, never added or summed",()=>{
  const logs=[{dateISO:"2026-06-24",completedHours:1},{dateISO:"2026-06-26",completedHours:3.5}];
  const actual=project(state([imported("one","616-CUT-P01-L001",{manualLogs:logs})]));assert.equal(actual.metrics.hours.value,3.5);
  const manual=project(state([imported("one","616-CUT-P01-L001",{actualHours:null,manualLogs:logs})]));assert.equal(manual.metrics.hours.value,3.5);assert.equal(manual.rows[0].hoursSource,"manualLogs (latest cumulative)");
  logs.push({...logs[1]});assert.equal(api.duration(job("manual",{actualHours:null,manualLogs:logs}),true).hours,3.5);
});
test("ACC02 placeholder zero, missing or invalid completed durations never become false runtime",()=>{
  for(const actualHours of [undefined,null,"",0,-1,NaN,Infinity,"bad",false]){
    const record=imported("one","616-CUT-P01-L001",{actualHours,importProvenance:{actual_cut_minutes:""}}),p=project(state([record]));
    assert.equal(p.metrics.hours.known,0);assert.equal(p.rows[0].hours,null);assert.equal(p.rows[0].processing,null);assert.equal(p.rows[0].material,20);assert.equal(p.rows[0].net,null);
    assert.match(api.summary(p),/cutting durations are missing or unreliable/);
  }
  assert.equal(api.duration(job("unmarked-zero",{actualHours:0}),true).hours,null);
  assert.equal(api.duration(job("active-zero",{actualHours:0}),false).hours,0);
});
test("ACC02 explicit source zero and latest zero log are supported without guessing missing data",()=>{
  const explicit=imported("one","616-CUT-P01-L001",{actualHours:0,importProvenance:{actual_cut_minutes:"0"}});
  assert.equal(api.duration(explicit,true).hours,0);assert.equal(project(state([explicit])).metrics.processing.known,1);
  assert.equal(api.duration(job("manual-zero",{actualHours:0,manualLogs:[{dateISO:"2026-06-26",completedHours:0}]}),true).hours,0);
});
test("ACC02 conflicting latest logs, invalid values, future dates and unrelated event references are unavailable",()=>{
  for(const logs of [
    [{dateISO:"2026-06-26",completedHours:1},{dateISO:"2026-06-26",completedHours:2}],
    [{dateISO:"bad",completedHours:1}], [{dateISO:"2026-06-26",completedHours:-1}],
    [{dateISO:"2026-06-27",completedHours:2}], [{dateISO:"2026-06-26",completedHours:2,import_event_id:"other-operation"}]
  ])assert.equal(api.duration(imported("one","616-CUT-P01-L001",{actualHours:null,manualLogs:logs}),true).hours,null);
});
test("ACC02 usable historical estimate fallback stays explicitly estimated",()=>{
  const p=project(state([imported("one","616-CUT-P01-L001",{actualHours:0,estimateHours:2,importProvenance:{actual_cut_minutes:""}})]));
  assert.equal(p.rows[0].hours,2);assert.equal(p.rows[0].hoursBasis,"estimated");assert.equal(p.rows[0].processing,90);assert.match(api.summary(p),/historical estimate/i);
});
test("ACC02 missing failure leaves adjusted net unavailable while historical hours and expenses stay visible",()=>{
  const p=project(state([imported("one","616-CUT-P01-L001",{failurePercent:undefined}),imported("two","616-CUT-P01-L002",{failurePercent:null})]));
  assert.equal(p.rows.length,2);assert.equal(p.metrics.hours.value,7);assert.equal(p.metrics.processing.value,315);assert.equal(p.metrics.material.value,40);assert.equal(p.metrics.totalCost.value,355);
  assert.equal(p.success.known,0);assert.equal(p.success.value,null);assert.equal(p.metrics.net.known,0);assert.equal(p.metrics.reduction.known,0);assert.equal(p.metrics.unadjustedNet.known,2);assert.equal(p.averageHour,1045/7);
  const html=api.summary(p);assert.match(html,/0\/2 jobs with reliable data; partial coverage/);assert.match(html,/failure-adjusted net.*unavailable/i);
});
test("ACC02 failures preserve expenses; ACC03 primary averages use exactly the unadjusted-net population",()=>{
  const p=project(state([imported("a","616-CUT-P01-L001",{actualHours:1,failurePercent:50}),imported("b","616-CUT-P01-L002",{actualHours:3,failurePercent:100}),imported("c","616-CUT-P01-L003",{actualHours:8,failurePercent:null})]));
  assert.equal(p.metrics.net.value,-120);assert.equal(p.metrics.net.known,2);assert.equal(p.metrics.reduction.value,700);assert.equal(p.metrics.unadjustedNet.value,1800);assert.equal(p.averageJob,600);assert.equal(p.averageHour,150);assert.equal(p.applicableHours,12);
  assert.equal(p.metrics.hours.value,12);assert.equal(p.metrics.processing.value,540);assert.equal(p.metrics.material.value,60);
});
for(const [date,minutes,count] of [["2026-07-20",29,2],["2026-09-04",25,4],["2026-10-06",4,2]])test(`ACC02 ${count} legitimate identical cuts on ${date} remain separate`,()=>{
  const records=Array.from({length:count},(_,i)=>imported(`id-${i}`,`616-CUT-P01-L00${i+1}`,{completedAtISO:date,actualHours:minutes/60}));
  const p=project(state(records));assert.equal(p.rows.length,count);assert.equal(p.metrics.hours.value,count*minutes/60);assert.equal(p.metrics.material.value,count*20);assert.equal(p.potentialOverlap,false);
  assert.equal(new Set(p.rows.map(row=>row.id)).size,count);
});
test("ACC02 suspicious 616/CUTPDF matches retain BOTH IDs, time and expenses with a selected-project-only notice",()=>{
  const records=[imported("cji_616-CUT-P01-L001","616-CUT-P01-L001"),imported("cji_CUTPDF-20260626-001","CUTPDF-20260626-001")],s=state(records),result=build(s),p=result.projects.find(p=>p.id==="atm");
  assert.equal(p.rows.length,2);assert.equal(p.metrics.hours.value,7);assert.equal(p.metrics.processing.value,315);assert.equal(p.metrics.material.value,40);assert.equal(p.metrics.net.value,1045);assert.equal(p.potentialOverlap,true);
  assert.match(api.summary(p),/All distinct records are currently included/);assert.doesNotMatch(api.summary(result.projects.find(p=>p.id==="blanco")),/may overlap across imports/);
  // Even explicit repeated source event IDs cannot authorize cross-ID suppression.
  records[1].import_event_id=records[0].import_event_id;records[1].importProvenance=records[0].importProvenance;
  assert.equal(project(state(records)).rows.length,2);assert.equal(project(state(records)).metrics.hours.value,7);
});
test("ACC02 prefix alone, same-family repeats, unrelated dates and unknown durations do not create overlap warnings",()=>{
  for(const extra of [{completedAtISO:"2026-06-25"},{actualHours:2},{materialCost:11},{actualHours:null,estimateHours:0}]){
    assert.equal(project(state([imported("a","616-CUT-P01-L001"),imported("b","CUTPDF-20260626-001",extra)])).potentialOverlap,false);
  }
  assert.equal(project(state([job("cji_616-CUT-one"),job("cji_CUTPDF-two")])).potentialOverlap,false);
});
test("ACC02 same-ID lifecycle handling and every protected source field remain unchanged",()=>{
  const record=imported("one","616-CUT-P01-L001"),s=state([record],[structuredClone(record)]),before=structuredClone(s);
  const freeze=value=>{if(value&&typeof value==="object"){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};freeze(s);
  const p=project(s);assert.equal(p.rows.length,1);assert.equal(p.metrics.hours.value,3.5);assert.equal(p.metrics.material.value,20);assert.equal(p.rows[0].navigable,false);api.summary(p);assert.deepEqual(s,before);
  const conflict=project(state([record],[{...record,actualHours:9}]));assert.equal(conflict.rows.length,1);assert.equal(conflict.metrics.hours.known,0);
});
