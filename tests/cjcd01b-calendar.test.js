"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const dates = require("../js/cuttingJobDateEditing");
const {jobs} = require("./fixtures/cjcd-shop-log");
const {project, identities, chips} = require("./fixtures/cjcd-calendar");
const state = completedCuttingJobs => ({cuttingJobs:[], completedCuttingJobs});
test("CJCD A: batch completion-date corrections replace old dates for all 16 stable identities",()=>{
  const expected = jobs(), batch = expected.map(job=>({...job, completedAtISO:"2026-10-15"}));
  const source = state(batch), before = structuredClone(source);
  assert.equal((project(source)["2026-10-15"]||[]).length,16);
  expected.forEach(job=>{batch.find(row=>row.id===job.id).completedAtISO=job.completedAtISO;});
  const corrected = project(source);
  assert.deepEqual(Object.fromEntries(Object.entries(corrected).map(([date,rows])=>[date,rows.length])),{
    "2026-10-01":3,"2026-10-06":5,"2026-10-07":6,"2026-10-08":1,"2026-10-14":1
  });
  assert.equal(corrected["2026-10-15"],undefined);
  assert.equal(identities(corrected).length,16);
  assert.deepEqual(batch.map(job=>({...job,completedAtISO:"2026-10-15"})),before.completedCuttingJobs);
});
test("CJCD B: identical aluminum and backing-plate cuts keep separate IDs and visible chips",()=>{
  const source = state(jobs()), map = project(source);
  for(const [date,name] of [["2026-10-06",'25" x 39"'],["2026-10-07",'Backing Plate, 19" x 3"']]){
    const rows = map[date].filter(row=>row.name===name), rendered = chips(rows);
    assert.equal(rows.length,2);assert.equal(new Set(rendered.map(chip=>chip.dataset.calJob)).size,2);
    assert.ok(rendered.every(chip=>chip.className.includes("is-complete")));
  }
});
test("CJCD C: 22 and 25.2 hours never expand completed jobs over extra days",()=>{
  for(const job of jobs().filter(job=>job.actualHours>=22)){
    assert.deepEqual(identities(project(state([job]))),[[job.id,job.completedAtISO,"completed"]]);
  }
});
test("CJCD D: dashboard identities/dates match History business dates; repeated reads are pure",()=>{
  const source = state(jobs()), before = structuredClone(source);
  const expected = dates.historyJobs(source.completedCuttingJobs).map(job=>[job.id,dates.businessDate(job,true),"completed"]).sort((a,b)=>a.join().localeCompare(b.join()));
  assert.deepEqual(identities(project(source)),expected);
  assert.deepEqual(identities(project(source)),expected);
  assert.deepEqual(source,before);
});
test("CJCD F: imported dates override retired chronology, due dates and provenance without migrating history",()=>{
  const job = {...jobs()[0],cutDateISO:"2000-01-01",cutOrderWithinDay:8,
    completedAtISO:"2026-10-01T00:30:00+14:00",importProvenance:{completed_date:"1999-01-01"}};
  const source = state([job]), before = structuredClone(source);
  assert.deepEqual(identities(project(source)),[[job.id,"2026-10-01","completed"]]);
  assert.deepEqual(source,before);
});
test("CJCD F: undated/invalid historical completions remain in History without inventing calendar dates",()=>{
  const completed = [undefined,"","bad","2026-02-30"].map((completedAtISO,i)=>({...jobs()[i],completedAtISO}));
  const source = state(completed), before = structuredClone(source);
  assert.equal(dates.historyJobs(completed).length,4);assert.deepEqual(project(source),{});assert.deepEqual(source,before);
});
test("CJCD: active range scheduling and legacy object-shaped sources remain supported",()=>{
  const active = {...jobs()[0],id:"active",startISO:"2026-10-09",dueISO:"2026-10-11"};delete active.completedAtISO;
  const source = {cuttingJobs:{active},completedCuttingJobs:{done:jobs()[15]}},before=structuredClone(source);
  assert.deepEqual(identities(project(source)),[
    ["active","2026-10-09","active"],["active","2026-10-10","active"],["active","2026-10-11","active"],
    ["synthetic-cjcd-16","2026-10-14","completed"]
  ]);assert.deepEqual(source,before);
});
