"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const chronology = require("../js/cuttingJobChronology");
const history = require("../js/cuttingJobHistory");
const identities = require("../js/globalIdentityRepair");
const job = (id, date, order = 1, extra = {}) => ({id, cutDateISO:date, cutOrderWithinDay:order, ...extra});
const state = jobs => ({syncMeta:{rev:7}, cuttingJobs:jobs, completedCuttingJobs:[], inventory:[{id:"inventory", qtyNew:4}]});
const labels = proposal => proposal.sequence.map(item => [item.id, item.cutNumber]);
const day = n => "2026-10-" + String(n).padStart(2, "0");
const freeze = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)){
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};

test("A: basic chronology spans active/completed and leaves frozen inputs unchanged", () => {
  const active = freeze([job("wed", day(7)), job("mon", day(5))]), completed = freeze([job("tue", day(6))]);
  assert.deepEqual(labels(chronology.planRenumbering(active, completed)), [["mon","C001"],["tue","C002"],["wed","C003"]]);
  assert.equal(Object.hasOwn(active[0], "cutNumber"), false);
});
test("B: earlier insertion shifts only the affected numbers and reports their range", () => {
  const source = state([job("mon",day(5),1,{cutNumber:"C001"}), job("wed",day(7),1,{cutNumber:"C002"}), job("thu",day(8),1,{cutNumber:"C003"})]);
  source.completedCuttingJobs.push(job("tue",day(6)));
  const result = chronology.prepareChronologyMutation(freeze(source));
  assert.equal(result.ok, true);
  assert.deepEqual(labels(result.renumbering), [["mon","C001"],["tue","C002"],["wed","C003"],["thu","C004"]]);
  assert.deepEqual(result.renumbering.changed, [{id:"tue",from:null,to:"C002"},{id:"wed",from:"C002",to:"C003"},{id:"thu",from:"C003",to:"C004"}]);
  assert.deepEqual(result.renumbering.affectedRange, {from:2,to:4});
  assert.deepEqual(result.nextState.cuttingJobs.map(j=>j.id), ["mon","wed","thu"]);
});
test("C: move Thursday into Monday's explicitly ordered day", () => {
  const source = state([5,6,7,8].map((n,i)=>job(String(n),day(n),1,{cutNumber:"C00"+(i+1)})));
  const result = chronology.prepareChronologyMutation(source, [{id:"8",cutDateISO:day(5),cutOrderWithinDay:2}]);
  assert.deepEqual(labels(result.renumbering), [["5","C001"],["8","C002"],["6","C003"],["7","C004"]]);
  assert.deepEqual(result.chronologyChanges, [{id:"8",before:{cutDateISO:day(8),cutOrderWithinDay:1},after:{cutDateISO:day(5),cutOrderWithinDay:2}}]);
  assert.equal(source.cuttingJobs[3].cutDateISO, day(8));
});
test("D: move Monday later without changing identities", () => {
  const source = state([5,6,7,8].map((n,i)=>job(String(n),day(n),1,{cutNumber:"C00"+(i+1)})));
  const result = chronology.prepareChronologyMutation(source, [{id:"5",cutDateISO:day(9)}]);
  assert.deepEqual(labels(result.renumbering), [["6","C001"],["7","C002"],["8","C003"],["5","C004"]]);
});
test("E: three same-day jobs remain ordered across serialization, array reversal and repeated plans", () => {
  let source = state([job("third",day(5),3),job("first",day(5),1),job("second",day(5),2)]);
  for (let cycle=0; cycle<8; cycle++){
    const result = chronology.prepareChronologyMutation(source);
    assert.deepEqual(labels(result.renumbering), [["first","C001"],["second","C002"],["third","C003"]]);
    if (cycle) assert.deepEqual(result.renumbering.changed, []);
    source = JSON.parse(JSON.stringify(result.nextState));
    source.cuttingJobs.reverse();
  }
});
test("equal explicit day positions have a locale-independent stable ID tie-break", () => {
  const input = [job("é",day(5)),job("a",day(5)),job("A",day(5))];
  assert.deepEqual(chronology.planRenumbering(input).sequence.map(j=>j.id), ["A","a","é"]);
});
test("audited imported/native feedback cannot recur with explicit order", () => {
  const imported = job("imported",day(5),1,{import_event_id:"source",importProvenance:{sourceRowNumber:10},cutNumber:"C001"});
  const native = job("native",day(5),2,{cutNumber:"C050"});
  const source = state([native]); source.completedCuttingJobs.push(imported);
  const once = chronology.prepareChronologyMutation(source);
  const twice = chronology.prepareChronologyMutation(JSON.parse(JSON.stringify(once.nextState)));
  assert.deepEqual(labels(twice.renumbering), [["imported","C001"],["native","C002"]]);
  assert.deepEqual(twice.renumbering.changed, []);
});
test("F/G/H: only chronology fields/numbers change; every durable relationship survives", () => {
  const linked = job("linked",day(8),1,{
    cutNumber:"C002",name:"Part",startISO:day(1),dueISO:day(10),completedAtISO:"2026-10-06T01:00:00.000Z",
    chargeRate:200,costRate:45,materialCost:20,actualHours:2,efficiency:{gainLoss:10},
    cat:"project",projectNumber:"0000",import_event_id:"event",
    importProvenance:{import_event_id:"event",source_file:"source.csv",completed_date:day(8),cut_sequence:"17"},
    manualLogs:[{dateISO:day(8),completedHours:2,import_event_id:"event"}],
    files:[{id:"legacy",relativePath:"WJ Cuts/C012.dxf"},{id:"cloud-reference",jobId:"linked",fileId:"cloud",storagePath:"workspaces/test/cutting-jobs/linked/files/cloud/C012.dxf"}],
    unlinkedCloudFileIds:["unlinked"]
  });
  const source = state([job("other",day(5),1,{cutNumber:"C001"})]);
  source.completedCuttingJobs.push(linked);
  source.jobFolders=[{id:"project",name:"Project"}];
  source.costHistory=[{id:"cost",jobId:"linked",amount:20}];
  source.deletedItems=[{id:"trash",payload:{id:"old",cutNumber:"C010"}}];
  source.cuttingJobDatabase={retained:{jobId:"linked",originalCut:"C012"}};
  const before = structuredClone(source);
  const result = chronology.prepareChronologyMutation(freeze(source),[{id:"linked",cutDateISO:day(4)}]);
  assert.equal(result.ok,true);
  const expected = structuredClone(before);
  expected.completedCuttingJobs[0].cutDateISO=day(4);
  expected.completedCuttingJobs[0].cutNumber="C001";
  expected.cuttingJobs[0].cutNumber="C002";
  assert.deepEqual(result.nextState,expected);
  assert.deepEqual(source,before);
  assert.equal(identities.integrity(result.nextState).valid,true);
});
test("I: legacy read preserves stored labels and adds no date/order/timestamp", () => {
  const legacy = freeze([
    {id:"late-id",cutNumber:"C001",startISO:day(9),completedAtISO:day(10),createdAt:"2026-01-01",importProvenance:{sourceRowNumber:9}},
    {id:"early-id",cutNumber:"C002",startISO:day(1),manualLogs:[{dateISO:day(1),completedHours:1}]},
    {id:"unknown"}
  ]);
  const before=JSON.stringify(legacy);
  const read=chronology.readChronology(legacy);
  assert.equal(read.mode,"legacy");
  assert.deepEqual(read.entries.map(e=>[e.id,e.date,e.order]), [["late-id",null,null],["early-id",null,null],["unknown",null,null]]);
  const plan=chronology.planRenumbering(legacy);
  assert.equal(plan.blocked,true);
  assert.deepEqual(plan.sequence,[{id:"late-id",cutNumber:"C001"},{id:"early-id",cutNumber:"C002"},{id:"unknown",cutNumber:null}]);
  assert.deepEqual(plan.changed,[]);
  assert.equal(JSON.stringify(legacy),before);
  assert.deepEqual(chronology.readChronology(legacy.slice().reverse()).entries.map(e=>e.id),read.entries.map(e=>e.id));
});
test("a correction crossing unresolved legacy records blocks without staging into source", () => {
  const source=state([job("explicit",day(5),1,{cutNumber:"C001"}),{id:"legacy",cutNumber:"C002",startISO:day(6)}]);
  const before=structuredClone(source),result=chronology.prepareChronologyMutation(source,[{id:"explicit",cutDateISO:day(7)}]);
  assert.equal(result.ok,false);
  assert.ok(result.issues.some(issue=>issue.id==="legacy"));
  assert.deepEqual(source,before);
  assert.equal(Object.hasOwn(result,"nextState"),false);
});
test("explicitly reviewed legacy targets may enter; unrelated fields/provenance remain untouched", () => {
  const source=state([{id:"legacy",cutNumber:"C009",startISO:day(8),importProvenance:{source_date:day(8)}}]);
  const result=chronology.prepareChronologyMutation(source,[{id:"legacy",cutDateISO:day(5),cutOrderWithinDay:1}]);
  assert.equal(result.ok,true);
  assert.equal(result.nextState.cuttingJobs[0].startISO,day(8));
  assert.deepEqual(result.nextState.cuttingJobs[0].importProvenance,source.cuttingJobs[0].importProvenance);
  assert.equal(Object.hasOwn(source.cuttingJobs[0],"cutDateISO"),false);
});
test("real completion builder preserves explicit actual date/order despite a later completion", () => {
  const core=fs.readFileSync("js/core.js","utf8");
  const context=vm.createContext({JOB_RATE_PER_HOUR:250,JOB_BASE_COST_PER_HOUR:30,window:{},computeJobEfficiency:()=>({actualHours:1})});
  vm.runInContext(core.slice(core.indexOf("function buildCompletedJob"),core.indexOf("function completeCuttingJob"))+";this.build=buildCompletedJob",context);
  const active=job("same-id",day(5),3,{cutNumber:"C001",manualLogs:[],files:[]});
  const completed=context.build(active,"2026-10-09T12:00:00.000Z");
  assert.equal(completed.id,active.id);
  assert.equal(completed.cutDateISO,day(5));
  assert.equal(completed.cutOrderWithinDay,3);
  assert.deepEqual(labels(chronology.planRenumbering([], [completed])),labels(chronology.planRenumbering([active], [])));
});
test("direct resequence requires the coordinator for canonical and mixed domains", () => {
  const explicit=[job("later",day(8),1,{cutNumber:"C001"}),job("earlier",day(5),1,{cutNumber:"C002"})];
  const original=JSON.stringify(explicit);
  assert.equal(history.planResequence(explicit,[]).ok,true);
  assert.equal(history.resequence(explicit,[]).requiresCoordinator,true);
  assert.equal(JSON.stringify(explicit),original);
  const mixed=[...explicit,{id:"unreviewed",cutNumber:"C003",startISO:day(1)}],before=JSON.stringify(mixed);
  assert.equal(history.resequence(mixed,[]).blocked,true);
  assert.equal(JSON.stringify(mixed),before);
});
for (const value of ["2026-02-29","2026-02-31","2026-13-01","0000-01-01","2026-10-05T23:00:00-05:00","2026-1-01",null,17])
  test("reject invalid/non-date-only actual cut date "+JSON.stringify(value),()=>assert.equal(chronology.validCutDate(value),false));
test("date validation accepts Gregorian leap days and performs no timezone conversion", () => {
  for (const value of ["2024-02-29","2000-02-29","0001-01-01",day(5)]) assert.equal(chronology.validCutDate(value),true);
  assert.equal(chronology.validCutDate("1900-02-29"),false);
  const context=vm.createContext({Date:class {constructor(){throw Error("Date conversions forbidden");}},module:{exports:{}},structuredClone});
  vm.runInContext(fs.readFileSync("js/cuttingJobChronology.js","utf8"),context);
  assert.equal(context.module.exports.validCutDate(day(5)),true);
  assert.equal(context.module.exports.planRenumbering([job("id",day(5))]).ok,true);
});
for (const order of [0,-1,1.5,"1",Number.MAX_SAFE_INTEGER+1,null])
  test("reject unsafe/noninteger explicit day order "+JSON.stringify(order),()=>assert.equal(chronology.planRenumbering([job("id",day(5),order)]).blocked,true));
test("duplicate active/completed IDs block before a Map can collapse owners", () => {
  const source=state([job("duplicate",day(5))]);source.completedCuttingJobs.push(job("duplicate",day(6)));
  const result=chronology.prepareChronologyMutation(source);
  assert.equal(result.ok,false);
  assert.equal(result.issues[0].code,"duplicate_job_identity");
});
test("unknown targets, duplicate corrections and relationship mutations are rejected", () => {
  const source=state([job("id",day(5))]);
  for (const changes of [[{id:"missing",cutDateISO:day(6)}],[{id:"id",cutNumber:"C099"}],[{id:"id",files:[],cutDateISO:day(6)}],[{id:"id",cutDateISO:day(6)},{id:"id",cutDateISO:day(7)}]])
    assert.equal(chronology.prepareChronologyMutation(source,changes).ok,false);
});
test("invalid array/record identities fail closed without generating replacement IDs", () => {
  for (const source of [{cuttingJobs:null,completedCuttingJobs:[]},state([{cutDateISO:day(5),cutOrderWithinDay:1}]),state([{id:17,cutDateISO:day(5),cutOrderWithinDay:1}])])
    assert.equal(chronology.prepareChronologyMutation(source).ok,false);
});
test("missing canonical module cannot fall back to schedule-date resequencing of explicit jobs", () => {
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync("js/cuttingJobHistory.js","utf8"),context);
  const jobs=[job("late",day(8),1,{cutNumber:"C002",startISO:day(1)}),job("early",day(5),1,{cutNumber:"C001",startISO:day(9)})];
  const before=JSON.stringify(jobs),result=context.CuttingJobHistory.resequence(jobs,[]);
  assert.equal(result.blocked,true);assert.equal(result.issues[0].code,"chronology_unavailable");
  assert.equal(JSON.stringify(jobs),before);
});
test("a comparator cannot mix explicit chronology with legacy number keys", () => {
  assert.throws(()=>chronology.compareCuttingJobChronology({mode:"explicit",id:"a"},{mode:"legacy",id:"b"}),/single resolved domain/);
  assert.throws(()=>chronology.compareCuttingJobChronology({id:"a"},{id:"b"}),/single resolved domain/);
});
