"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("js/core.js","utf8");
const start=source.indexOf("let lastGeneratedIdTime"),end=source.indexOf("\n}",source.indexOf("function inspectInventoryIdentities"))+2;
const context=vm.createContext({Date:{now:()=>1234},Math,Set,globalThis:{}});
vm.runInContext(source.slice(start,end)+";this.gen=genId;this.inspect=inspectInventoryIdentities",context);
test("same-millisecond bulk creation retains unique IDs and timestamp ordering",()=>{
  const ids=Array.from({length:10000},()=>context.gen("inventory"));
  assert.equal(new Set(ids).size,ids.length);
  const times=ids.map(id=>parseInt(id.slice(id.lastIndexOf("_")+1),36));
  assert.ok(times.every((time,i)=>i===0||time>times[i-1]));
});
test("legacy duplicate identity diagnostics preserve exact evidence",()=>{
  const items=[{id:"same",qtyNew:2},{id:"same",qtyNew:4},{name:"missing"}],folders=[{id:"folder"},{id:"folder"}];
  const before=JSON.stringify({items,folders}),issues=context.inspect(items,folders);
  assert.equal(issues.length,3);assert.equal(JSON.stringify({items,folders}),before);
  const renderer=fs.readFileSync("js/renderers.js","utf8").split("function renderInventory(){")[1].split("function syncLinkedTasksFromInventory")[0];
  assert.match(renderer,/inspectInventoryIdentities/);assert.doesNotMatch(renderer,/inventory\s*=\s*inventory\.filter/);
});
test("production reset returns before local mutation or evidence deletion",()=>{
  const reset=source.slice(source.indexOf("async function clearAllAppData"));
  assert.ok(reset.indexOf("!window.OMAXDevSafe?.active")<reset.indexOf("recordDeletedItem("));
});
