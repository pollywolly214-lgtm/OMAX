"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const api=require("../js/financialReconciliation"),source=fs.readFileSync("js/renderers.js","utf8");
const start=source.indexOf("function maintenanceEventTooltip("),end=source.indexOf("let cachedActiveWJCutsRoot",start);
assert.ok(start>=0&&end>start);const context=vm.createContext({window:{OMAXFinancialReconciliation:api},Intl,Date});vm.runInContext(source.slice(start,end),context);
const build=context.buildIncompleteMaintenanceMarkers;
const row=(id,parts,hours,extra={})=>({sourceEventKey:id,taskId:"task",taskName:"Synthetic task",settingsLink:"#/settings?taskId=task",costIncomplete:true,dateISO:"2026-01-02",
  partCost:parts??0,maintenanceHrs:hours??0,totalCost:(parts??0)+(hours??0)*30,costFields:{parts:{value:parts,source:"Occurrence-specific"},duration:{value:hours,source:"Occurrence-specific"}},...extra});
const plain=value=>JSON.parse(JSON.stringify(value));
function canvas(){const texts=[],ctx=new Proxy({fillText:text=>texts.push(text)},{get:(target,key)=>target[key]||(()=>{})});return {width:780,height:240,texts,getContext:()=>ctx};}
const model=markers=>({incompleteMaintenanceMarkers:markers,maintenanceSeries:[],totalSpendSeries:[],jobSeries:[],chartColors:{maintenance:"blue",spend:"red",jobs:"green"}});

test("02A supersedes 01F glyphs with compact unknown-price circles and preserves nullable evidence",()=>{
  const rows=[row("unknown",null,0),row("duration-only",null,1)],before=JSON.stringify(rows),markers=plain(build(rows));
  assert.deepEqual(markers.map(pt=>pt.knownParts),[null,null]);assert.ok(markers.every(pt=>pt.fullCost===null&&pt.value===null));
  assert.equal(markers[0].detail,"2026-01-02\nCost unavailable");assert.equal(JSON.stringify(rows),before);
});
test("02A same-day unknown prices retain all identities without duplicate source markers or invented dollars",()=>{
  const rows=[row("one",null,0),row("two",null,1),row("three",null,0)],markers=build([...rows,rows[0]]),c=canvas();
  context.drawCostChart(c,model(markers),{maintenance:true});assert.equal(markers.length,3);assert.equal(c.__costChartTargets.length,1);
  const target=c.__costChartTargets[0];assert.equal(target.rowRefs.length,3);assert.equal(target.events.length,3);assert.equal(target.eventLane,true);
  assert.deepEqual(plain(target.rowRefs.map(ref=>ref.sourceEventKey).sort()),["one","three","two"]);
  assert.ok(c.texts.every(text=>!String(text).includes("$")),"unknown-only history has no monetary axis");
  assert.ok(target.events.every(event=>!event.detail.includes("$")));
});
test("02A complete rows, invalid dates and missing identities cannot create unknown-price indicators",()=>{
  assert.equal(build([row("complete",12,1,{costIncomplete:false}),row("date",null,0,{dateISO:"2026-02-30"}),row("",null,0),row("link",null,0,{settingsLink:""})]).length,0);
  const c=canvas();context.drawCostChart(c,model(build([row("hidden",null,0)])),{maintenance:false});assert.equal(c.__costChartTargets.length,0);
});
test("02A dense clusters retain every identity with bounded ordinary tooltip content",()=>{
  const c=canvas();context.drawCostChart(c,model(build(Array.from({length:34},(_,i)=>row("dense-"+i,null,0)))),{maintenance:true});
  assert.equal(c.__costChartTargets.length,1);assert.equal(c.__costChartTargets[0].rowRefs.length,34);
  assert.ok(c.__costChartTargets[0].detail.length<100);assert.equal(c.__costChartTargets[0].events.length,34);
});
