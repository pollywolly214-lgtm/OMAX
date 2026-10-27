"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const api=require("../js/financialReconciliation"),source=fs.readFileSync("js/renderers.js","utf8");
const start=source.indexOf("function buildIncompleteMaintenanceMarkers("),end=source.indexOf("let cachedActiveWJCutsRoot",start);
assert.ok(start>=0&&end>start);const context=vm.createContext({window:{OMAXFinancialReconciliation:api},Intl,Date});vm.runInContext(source.slice(start,end),context);
const build=context.buildIncompleteMaintenanceMarkers;
const row=(id,parts,hours,extra={})=>({sourceEventKey:id,taskId:"task",taskName:"Synthetic task",settingsLink:"#/settings?taskId=task",costIncomplete:true,dateISO:"2026-01-02",
  partCost:parts??0,maintenanceHrs:hours??0,totalCost:(parts??0)+(hours??0)*30,costFields:{parts:{value:parts,source:"Occurrence-specific"},duration:{value:hours,source:"Occurrence-specific"}},...extra});
const plain=value=>JSON.parse(JSON.stringify(value));
function canvas(){const texts=[],ctx=new Proxy({fillText:text=>texts.push(text)},{get:(target,key)=>target[key]||(()=>{})});return {width:780,height:240,texts,getContext:()=>ctx};}
const model=markers=>({incompleteMaintenanceMarkers:markers,maintenanceSeries:[],totalSpendSeries:[],jobSeries:[],chartColors:{maintenance:"blue",spend:"red",jobs:"green"}});

test("01F nullable cost evidence, not zero placeholders, determines partial versus unknown markers",()=>{
  const rows=[row("known",12,null),row("unknown",null,null),row("duration-only",null,1),row("zero",0,null)],before=JSON.stringify(rows),markers=plain(build(rows));
  assert.deepEqual(markers.map(pt=>pt.knownParts),[12,null,null,0]);assert.deepEqual(markers.map(pt=>pt.value),[-12,null,null,0]);
  assert.ok(markers.every(pt=>pt.fullCost===null));assert.match(markers[0].detail,/Known parts \$12.00.*recorded occurrence input/);
  assert.match(markers[1].detail,/Parts price unknown.*Missing labor duration/);assert.match(markers[2].detail,/Known labor duration 1 hr/);
  assert.match(markers[3].detail,/Known parts \$0.00/);assert.equal(JSON.stringify(rows),before);
});
test("01F configured estimates are distinct from recorded amounts and the missing full cost is explained",()=>{
  const input=row("configured",25,null);input.costFields.parts.source="Configured default";input.costExclusionReason="Missing labor duration";
  const pt=build([input])[0];assert.match(pt.detail,/configured estimate/);assert.match(pt.detail,/Full event cost unavailable: Missing labor duration/);assert.match(pt.detail,/Excluded from complete expense totals/);
});
test("01F identities survive same-day grouping and duplicate stable sources are not displayed twice",()=>{
  const rows=[row("one",8,null),row("two",8,null),row("three",19,null)];
  const markers=build([...rows,rows[0]]),c=canvas();context.drawCostChart(c,model(markers),{maintenance:true});
  assert.equal(markers.length,3);assert.equal(c.__costChartTargets.length,2);assert.equal(c.__costChartTargets.find(pt=>pt.knownParts===8).rowRefs.length,2);
  assert.deepEqual(plain(c.__costChartTargets.flatMap(pt=>pt.rowRefs.map(ref=>ref.sourceEventKey)).sort()),["one","three","two"]);
  assert.ok(c.__costChartTargets.every(pt=>pt.key==="maintenanceIncomplete"&&pt.fullCost===null));
});
test("01F unknown-only history produces dated event-lane targets without a zero-cost amount",()=>{
  const c=canvas();context.drawCostChart(c,model(build([row("unknown",null,null)])),{maintenance:true});
  assert.equal(c.__costChartTargets.length,1);const pt=c.__costChartTargets[0];assert.equal(pt.eventLane,true);assert.equal(pt.knownParts,null);
  assert.equal(pt.rowRef.dateISO,"2026-01-02");assert.match(pt.valueLabel,/Cost unknown/);assert.doesNotMatch(pt.valueLabel,/\$0/);assert.ok(c.texts.includes("Cost unknown"));
  assert.ok(c.texts.every(text=>!String(text).includes("$")),"unknown-only history has no monetary axis values");
});
test("01F complete rows, invalid dates and missing identities do not create incomplete glyphs",()=>{
  assert.equal(build([row("complete",12,1,{costIncomplete:false}),row("date",12,null,{dateISO:"2026-02-30"}),row("",12,null),row("link",12,null,{settingsLink:""})]).length,0);
  const c=canvas();context.drawCostChart(c,model(build([row("hidden",12,null)])),{maintenance:false});assert.equal(c.__costChartTargets.length,0);
});
test("01F dense same-day clusters keep every identity and bound tooltip content",()=>{
  const c=canvas();context.drawCostChart(c,model(build(Array.from({length:34},(_,i)=>row("dense-"+i,8,null)))),{maintenance:true});
  assert.equal(c.__costChartTargets.length,1);assert.equal(c.__costChartTargets[0].rowRefs.length,34);assert.match(c.__costChartTargets[0].detail,/31 more same-day events/);
});
