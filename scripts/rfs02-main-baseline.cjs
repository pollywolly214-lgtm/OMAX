"use strict";
// Frozen main code and disposable in-memory data only; no Firebase SDK.
const assert=require("node:assert/strict"),cp=require("node:child_process"),vm=require("node:vm");
const {harness}=require("../tests/rfs02-normal-harness.cjs");
const fromGit=path=>cp.execFileSync("git",["show","0c11b0f:"+path],{encoding:"utf8"});
const fn=(source,name)=>{const a=source.indexOf("function "+name+"(");return source.slice(a,source.indexOf("\n}",a)+2);};
(async()=>{
  const h=harness(),core=fromGit("js/core.js"),start=core.indexOf("async function performCloudSave"),end=core.indexOf("\n}",start)+2;
  vm.runInContext(core.slice(start,end),h.context);
  const db=h.context.FB.db,run=db.runTransaction.bind(db);db.runTransaction=callback=>run(tx=>callback({...tx,get:async ref=>{if(h.commits)throw Error("Independent backend read unavailable");return tx.get(ref);}}));
  h.window.inventory[0].qtyNew=7;const result=await h.context.saveCloudNow();
  assert.equal(result.saved,true);assert.equal(h.commits,1);assert.equal(h.transactions,1);assert.equal(h.reads,1);assert.equal(result.verified,undefined);
  console.log("PASS reproduction: frozen main reports ordinary save success without attempting independent readback, even when that read is unavailable; one commit, zero verification reads.");
  const calendar=fromGit("js/calendar.js");
  for(const scope of ["single","future","all"]){
    const task={id:"legacy",mode:"interval",completedDates:["2026-10-01"],manualHistory:[{dateISO:"2026-10-01",status:"completed",note:"Retain completion"}],occurrenceNotes:{"2026-10-01":"Retain note"},occurrenceHours:{"2026-10-01":2},removedOccurrences:[]};
    const c=vm.createContext({window:{},normalizeDateKey:value=>value,toDayStart:value=>new Date(value),isInstanceTask:()=>false,projectIntervalDueDates:()=>[],applyIntervalBaseline(){},visitTaskFamily:(_task,callback)=>callback(task)});
    for(const name of ["normalizeRemovedOccurrences","markOccurrenceRemoved","removeSingleOccurrenceAcrossTaskFamily","removeCalendarTaskOccurrences"])vm.runInContext(fn(calendar,name),c);
    assert.equal(c.removeCalendarTaskOccurrences({task},"2026-10-01",scope),true);
    if(scope==="single")assert.equal(task.manualHistory[0].status,"removed");else{assert.equal(task.manualHistory.length,0);assert.equal(task.completedDates.length,0);assert.deepEqual(task.occurrenceNotes,{});}
  }
  console.log("PASS reproduction: legacy single cancellation overwrites completion status; future/all cancellation removes stored completion history and notes locally before persistence. Patched entry points preserve evidence and return unavailable.");
})().catch(error=>{console.error(error);process.exitCode=1;});
