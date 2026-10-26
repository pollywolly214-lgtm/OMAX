"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {harness,plain,freeze}=require("./mhist-harness.cjs"),{rich,legacy,repeat}=require("./fixtures/rfs02b-maintenance");
const archive=require("../js/maintenanceTaskArchive"),cancel=require("../js/maintenanceCalendarCancellation"),identity=require("../js/globalIdentityRepair");
const stamp=n=>({id:"mhist-cancel-"+n,actorUid:"fixture",atISO:"2026-10-21T18:00:00Z"});
const events=h=>Object.values(h.projection().dueMap).flat();
const record=(state,operation,n=1)=>cancel.plan(state,operation,stamp(n)).state;
test("single cancellation hides the exact legacy Calendar occurrence while retaining completed evidence and independent V2 roots",()=>{
  const source=rich(),state=record(source,legacy("single","2026-09-01")),h=harness(state),rows=h.history("fixture-task-A");
  const completed=rows.find(row=>row.taskId==="fixture-child"&&row.dateISO==="2026-09-01");
  assert.equal(completed.status,"completed");assert.equal(completed.activeCalendar,false);assert.match(completed.calendarHiddenReason,/Authorized/);assert.equal(completed.note,"Child history note");
  assert.equal(events(h).some(row=>row.type==="task"&&row.taskStartsOn==="2026-09-01"),false);
  assert.ok(rows.some(row=>row.rootOccurrenceId==="repeat:fixture-instance-A:2026-09-01"&&row.activeCalendar&&row.status==="completed"));
  assert.deepEqual(state.tasksInterval[0].completedDates,source.tasksInterval[0].completedDates);assert.deepEqual(state.maintenanceOccurrencesV2,source.maintenanceOccurrencesV2);
});
for(const scope of ["future","all"])test(scope+" cancellation hides schedules, preserves completed history and does not affect same-name independent owners",()=>{
  const source=rich(),state=record(source,legacy(scope,"2026-10-28")),h=harness(state),rows=h.history("fixture-task-A");
  assert.equal(cancel.integrity(state).valid,true);assert.equal(identity.integrity(state).valid,true);
  assert.ok(rows.filter(row=>row.rootOccurrenceId&&row.status==="completed").length>=12);
  for(const date of ["2026-10-28","2026-11-01","2026-12-01"]){
    const row=rows.find(row=>row.rootOccurrenceId==="repeat:fixture-instance-A:"+date);assert.ok(row);assert.equal(row.activeCalendar,false);assert.equal(row.status,"scheduled");assert.match(row.calendarHiddenReason,/Authorized/);
    assert.equal(events(h).some(event=>event.id===row.rootOccurrenceId),false);
  }
  assert.ok(h.history("fixture-task-B").some(row=>row.rootOccurrenceId==="repeat:other-instance:2026-11-01"&&row.activeCalendar));
  assert.ok(rows.filter(row=>row.activeCalendar).every(row=>row.status==="completed"||scope==="future"&&row.dateISO<"2026-10-28"));
});
test("repeat Remove retains the original completed lifecycle payload and Stop never masks completion or invents historical slots",()=>{
  const source=rich(),removed=record(source,repeat("repeatRemove","2026-09-01")),stopped=record(removed,repeat("repeatStop","2026-09-02"),2),h=harness(stopped),rows=h.history("fixture-task-A");
  const row=rows.find(row=>row.rootOccurrenceId==="repeat:fixture-instance-A:2026-09-01");
  assert.equal(row.status,"removed");assert.equal(row.activeCalendar,false);assert.equal(row.trackingStopped,true);assert.deepEqual(row.completionEvidence,[source.maintenanceOccurrencesV2.find(event=>event.id==="history-1")]);
  assert.equal(row.note,"Original V2 note 1");assert.equal(row.hours,.1);
  assert.equal(rows.find(row=>row.rootOccurrenceId==="repeat:fixture-instance-A:2026-09-02").status,"completed");
  assert.equal(events(h).some(event=>event.id===row.rootOccurrenceId),false);
  const stored=new Set(stopped.maintenanceOccurrencesV2.map(event=>event.rootOccurrenceId));
  assert.ok(rows.filter(row=>row.instanceId==="fixture-instance-A").every(row=>stored.has(row.rootOccurrenceId)));
  for(const original of source.maintenanceOccurrencesV2)assert.deepEqual(stopped.maintenanceOccurrencesV2.find(event=>event.id===original.id),original);
});
test("explicit empty note/null hours override retained completion snapshots",()=>{
  const source=rich(),first=source.maintenanceOccurrencesV2.find(event=>event.id==="history-1");
  source.maintenanceOccurrencesV2.unshift({...first,id:"clear-note",eventType:"note_set",payload:{note:""},recordedAtISO:"2026-10-21T17:00:00Z"},
    {...first,id:"clear-hours",eventType:"hours_set",payload:{hours:null},recordedAtISO:"2026-10-21T17:00:00Z"});
  const row=harness(source).history("fixture-task-A").find(row=>row.rootOccurrenceId===first.rootOccurrenceId);
  assert.equal(row.note,"");assert.equal(row.hours,null);assert.ok(row.completionEvidence.length);
  source.tasksInterval[0].occurrenceNotes["2026-09-01"]="";
  assert.equal(harness(source).history("fixture-task-A").find(row=>row.taskId==="fixture-task-A"&&row.dateISO==="2026-09-01").note,"");
});
test("archive/restore preserves cancellation ledger, historical identities and source payloads, and history resolves archived owners",()=>{
  const source=record(rich(),legacy("single","2026-09-01")),task=source.tasksInterval[0];
  const entry={id:"mhist-archive",type:"task",payload:structuredClone(task),meta:{list:"interval",originalId:task.id},deletedAt:"2026-10-21T18:00:00Z"};
  const archived=archive.plan(source,task.id,entry),restored=archive.planRestore(archived,entry.id);
  const history=state=>harness(state).history(task.id),keys=rows=>rows.map(row=>[row.key,row.dateISO,row.status,row.note,row.hours]).sort((a,b)=>a[0].localeCompare(b[0]));
  const storedRoots=new Set(source.maintenanceOccurrencesV2.map(event=>event.rootOccurrenceId));
  assert.deepEqual(keys(history(archived)),keys(history(source).filter(row=>row.sourceSystem==="legacy"||storedRoots.has(row.rootOccurrenceId))));
  assert.deepEqual(keys(history(restored)),keys(history(source)));
  assert.ok(history(archived).every(row=>row.archived));assert.ok(history(restored).every(row=>!row.archived));
  assert.deepEqual(archived.deletedItems[0].payload,task);assert.deepEqual(restored.tasksInterval.find(row=>row.id===task.id),task);
  assert.equal(identity.integrity(archived).valid,true);assert.equal(cancel.integrity(archived).valid,true);
});
test("same-day legacy records with separate stable IDs or anonymous source indexes remain distinguishable",()=>{
  const state=rich(),task=state.tasksInterval[0];task.manualHistory.push({id:"second-completion",dateISO:"2026-09-01",status:"completed",hours:2,note:"Independent recorded work"},
    {dateISO:"2026-09-01",status:"logged",hours:3,note:"Anonymous one"},{dateISO:"2026-09-01",status:"logged",hours:4,note:"Anonymous two"});
  const rows=harness(state).history(task.id).filter(row=>row.taskId===task.id&&row.dateISO==="2026-09-01");
  assert.equal(rows.length,4);assert.equal(new Set(rows.map(row=>row.key)).size,4);assert.ok(rows.some(row=>row.note==="Independent recorded work"&&row.hours===2));
  assert.deepEqual(rows.filter(row=>row.status==="logged").map(row=>row.hours),[3,4]);
});
test("cancelled/archived history reads accept frozen inputs and preserve all source and runtime evidence",()=>{
  const state=record(rich(),legacy("all")),h=harness(state);Object.keys(state).forEach(key=>freeze(h.window[key]));
  const before=plain(Object.fromEntries(Object.keys(state).map(key=>[key,h.window[key]])));
  const first=h.history("fixture-task-A");h.projection();assert.deepEqual(h.history("fixture-task-A"),first);
  assert.deepEqual(plain(Object.fromEntries(Object.keys(state).map(key=>[key,h.window[key]]))),before);
  assert.equal(h.window.__calendarV2OneTimeLookup,undefined);assert.deepEqual(harness(JSON.parse(JSON.stringify(state))).history("fixture-task-A"),first);
});
test("invalid archive ownership and genuine ledger/FK corruption stay invalid",()=>{
  for(const mutate of [state=>state.inventory[0].linkedTaskId="missing",state=>state.tasksInterval[0].calendarCancellations[0].legacyTaskId="missing"]){
    const state=record(rich(),legacy("all"));mutate(state);assert.equal(identity.integrity(state).valid&&cancel.integrity(state).valid,false);
  }
});
if(process.env.OMAX_MHIST_MAIN_CALENDAR)test("active Calendar output matches latest-main builder across cancellation and stop fixtures",()=>{
  const source=fs.readFileSync(process.env.OMAX_MHIST_MAIN_CALENDAR,"utf8"),start=source.indexOf("  const splitTaskDuration =",source.indexOf("function renderCalendar(){")),end=source.indexOf("window.__maintenanceCalendarProjectedRepeatRows=",start);
  assert.ok(start>=0&&end>start);const body=source.slice(start,end);
  for(const state of [rich(),record(rich(),legacy("single","2026-09-01")),record(rich(),legacy("future")),record(rich(),legacy("all")),record(rich(),repeat("repeatStop","2026-09-01"))]){
    const current=harness(state),main=harness(state);vm.runInContext("function mainProjection(){const dueMap={}; const hoursPerDay=configuredTaskDurationDailyHours();"+body+";return {dueMap,oneTimeLookup};}",main.context);
    const actual=current.projection();assert.deepEqual({dueMap:actual.dueMap,oneTimeLookup:actual.oneTimeLookup},plain(main.context.mainProjection()));
  }
});
