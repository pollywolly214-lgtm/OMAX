"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("js/opportunity.js","utf8"),instant="2026-11-24T15:00:00.000Z";
class FixedDate extends Date{constructor(...args){super(...(args.length?args:[instant]));}static now(){return Date.parse(instant);}}
function harness(backend,{disposable=false,ready=true}={}){
  let saves=0;const events=[],errors=[],timers=[],listeners=new Map();
  const retained=Object.freeze([Object.freeze({period:"Reviewed source",totalCost:42.125,extension:Object.freeze({retain:"unknown evidence"})})]);
  class CustomEvent{constructor(type,options){this.type=type;this.detail=options.detail;}}
  const window={__omaxActiveStateBackend:backend,__opportunityStateReady:ready,OMAXDevSafe:{active:disposable},opportunityRollups:retained,
    dailyCutHours:[{dateISO:"2026-11-23",hours:2.5}],tasksInterval:[],tasksAsReq:[],
    localStorage:{getItem:()=>null,setItem(){}},saveCloudDebounced:()=>{saves++;},CustomEvent,
    addEventListener:(type,listener)=>listeners.set(type,listener),dispatchEvent:event=>events.push(event)};
  vm.runInNewContext(source,{window,Date:FixedDate,CustomEvent,setTimeout:callback=>timers.push(callback),console:{warn:(...args)=>errors.push(args),error:(...args)=>errors.push(args)}});
  return{window,retained,events,errors,timers,listeners,saves:()=>saves};
}
test("Storage opportunity calculations publish display rows without replacing reviewed authority or saving",async()=>{
  const h=harness("sharded");await h.window.recomputeOpportunityCost();
  assert.equal(h.window.opportunityRollups,h.retained);assert.equal(h.saves(),0);assert.equal(h.window.__opportunityDisplayRollups.length,4);
  assert.equal(h.window.__opportunityDisplayRollups[0].pumpRunHours,2.5);assert.equal(h.events[0].type,"opportunity:updated");assert.equal(h.events[0].detail.rollups.length,4);assert.deepEqual(h.errors,[]);
});
for(const [backend,disposable]of [["legacy",false],[null,true]])test(`opportunity calculations retain existing ${disposable?"DevSafe":"legacy"} save behavior`,async()=>{
  const h=harness(backend,{disposable});await h.window.recomputeOpportunityCost();assert.equal(h.saves(),1);assert.equal(h.window.opportunityRollups.length,4);assert.equal(h.window.opportunityRollups[0].pumpRunHours,2.5);assert.deepEqual(h.errors,[]);
});
for(const [before,after]of [["sharded","legacy"],["legacy","sharded"]])test(`opportunity calculation crossing ${before} to ${after} cannot replace authority`,async()=>{
  const h=harness(before),pending=h.window.recomputeOpportunityCost();h.window.__omaxActiveStateBackend=after;await pending;
  assert.equal(h.window.opportunityRollups,h.retained);assert.equal(h.saves(),0);assert.equal(h.events[0].detail.rollups.length,4);assert.deepEqual(h.errors,[]);
});
test("unresolved authority can calculate display evidence without mutating the source",async()=>{
  const h=harness(null);await h.window.recomputeOpportunityCost();assert.equal(h.window.opportunityRollups,h.retained);assert.equal(h.saves(),0);assert.equal(h.window.__opportunityDisplayRollups.length,4);assert.deepEqual(h.errors,[]);
});
test("clean authoritative adoption does not trigger deferred opportunity writes",()=>{
  const h=harness("sharded",{ready:false});h.listeners.get("opportunity:data-ready")({detail:{preserveAuthoritative:true}});
  assert.equal(h.window.opportunityRollups,h.retained);assert.equal(h.saves(),0);assert.equal(h.timers.length,0);assert.equal(h.events.length,0);assert.deepEqual(h.errors,[]);
});
