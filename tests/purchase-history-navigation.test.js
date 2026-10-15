"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const financials = require("../js/purchaseFinancials");
const source = fs.readFileSync("js/renderers.js", "utf8");
const start = source.indexOf("    const formatUsd =", source.indexOf("function setupWeeklyReportWindow"));
const end = source.indexOf('    const canvas = panel.querySelector("#weeklyCostChart")', start);
assert.ok(start >= 0 && end > start);
const implementation = source.slice(start, end);
const esc = value=> String(value ?? "").replace(/[&<>"']/g, ch=> ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const unesc = value=> value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
class Element {
  constructor(){ this.dataset={}; this.style={}; this.listeners={}; this.hidden=true; this.children=[]; this.attributes={}; this.classList={add(){},remove(){},toggle(){}}; }
  setAttribute(key,value){ this.attributes[key]=value; if(key.startsWith("data-"))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,ch)=>ch.toUpperCase())]=value; }
  getAttribute(key){ return this.attributes[key] ?? null; }
  addEventListener(name,callback){ (this.listeners[name] ||= []).push(callback); }
  async fire(name,extra={}){ for(const callback of this.listeners[name] || [])await callback({target:this,preventDefault(){},...extra}); }
  appendChild(child){ child.parentElement=this;this.children.push(child); }
  replaceChildren(...children){ this.children=[];children.forEach(child=>this.appendChild(child)); }
  remove(){ if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this); }
  querySelector(){ return null; }
  querySelectorAll(){ return []; }
  focus(){} scrollIntoView(){}
}
class Input extends Element {
  constructor(){ super(); this.value=""; this.error=""; }
  setCustomValidity(message){ this.error=message; }
  reportValidity(){ this.reported=true; return !this.error; }
  closest(){ return this.parentElement; }
}
class Row extends Element {
  set innerHTML(html){
    this.html=html; this.cells={};
    for(const match of html.matchAll(/<input\b([^>]+)>/g)){
      const input=new Input();
      for(const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/g))input.setAttribute(attr[1],unesc(attr[2]));
      input.value=input.getAttribute("value") || "";input.parentElement=this;this.cells[input.dataset.col]=input;
    }
    for(const col of ["total","merchandiseSubtotal"]){if(!this.cells[col])this.cells[col]=new Element();}
  }
  querySelector(selector){ return this.cells[selector.match(/data-col=["']?([^"'\]]+)/)?.[1]] || null; }
}
class Body extends Element {
  set innerHTML(html){
    this.html=html; this.children=[];
    for(const match of html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)){
      const row=new Row();row.innerHTML=match[2];
      for(const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/g))row.setAttribute(attr[1],attr[2]);
      this.appendChild(row);
    }
  }
  querySelectorAll(){ return this.children; }
  querySelector(selector){ return this.children.find(row=>String(row.dataset.receiptRowIndex)===selector.match(/data-receipt-row-index="(\d+)"/)?.[1]) || null; }
}
class Select extends Element { constructor(){super();this.value="";} }
class Button extends Element {}
class DataList extends Element {}
function harness({date="2026-10-15T12:00:00",weeks=[],save,remembered}={}){
  let clock=date, saves=0, autosaves=0, refreshes=0;
  class Clock extends Date { constructor(...args){super(...(args.length ? args : [clock]));} }
  const body=new Body(), chip=new Element(), modal=new Element(), close=new Button(), open=new Button(), exports=[];
  const controls=new Map();
  for(const key of ["week-select","year-select","range-select"])controls.set(`[data-receipt-${key}]`,new Select());
  for(const key of ["save-week","clear-all","undo-clear","export-week","export-range"])controls.set(`[data-receipt-${key}]`,new Button());
  for(const key of ["week-range","week-allocation-note","week-subtotal","range-rows","range-subtotal","range-label","range-allocation-note"])controls.set(`[data-receipt-${key}]`,new Element());
  controls.set("[data-receipt-week-rows]",body);controls.set("#receiptPurchasedSuggestions",new DataList());
  modal.querySelector=selector=>controls.get(selector) || null;modal.querySelectorAll=()=>[close];
  controls.get("[data-receipt-save-week]").parentElement={querySelector:()=>chip};
  const spend=new Element(), document={getElementById:id=>id==="costReceiptModal"?modal:null,querySelector:()=>spend,body:new Element(),createElement:tag=>tag==="tr"?new Row():Object.assign(new Element(),{click(){exports.push({name:this.download,url:this.href});}})};
  const window={receiptTrackerWeeks:weeks,receiptTrackerWeekSelected:remembered,inventory:[],tasksInterval:[],tasksAsReq:[]};
  const messages=[], blobs=new Map();
  const context=vm.createContext({...financials,Date:Clock,Intl,HTMLElement:Element,HTMLInputElement:Input,HTMLSelectElement:Select,HTMLButtonElement:Button,HTMLDataListElement:DataList,
    window,document,panel:{querySelector:()=>open},inventory:[],escapeHtml:esc,Blob,
    URL:{createObjectURL:blob=>{const key=`blob:${blobs.size}`;blobs.set(key,blob);return key;},revokeObjectURL(){}},
    setTimeout:callback=>{callback();return 1;},clearTimeout(){},requestAnimationFrame:callback=>callback(),
    saveCloudDebounced:()=>{autosaves++;},saveCloudNow:async()=>{saves++;return save ? save() : {saved:true,stateWriteCompleted:true};},
    renderCosts:()=>{refreshes++;},toast:message=>messages.push(message),console:{warn(){},error(){}}
  });
  vm.runInContext(implementation,context);
  const control=key=>controls.get(`[data-receipt-${key}]`);
  return {window,body,modal,chip,messages,exports,blobs,context,control,close,open,
    get saves(){return saves;},get autosaves(){return autosaves;},get refreshes(){return refreshes;},
    clock:value=>{clock=value;},input:(row,col)=>body.children[row].querySelector(`[data-col="${col}"]`),
    async edit(row,col,value,type="input"){const input=this.input(row,col);input.value=value;await body.fire(type,{target:input});},
    async week(key){control("week-select").value=key;await control("week-select").fire("change");},
    async year(year){control("year-select").value=String(year);await control("year-select").fire("change");},
    async remove(index){const row=body.children[index],button=new Element();button.setAttribute("data-col","removeRow");button.closest=()=>row;await body.fire("click",{target:button});}
  };
}
const row = extra=>({date:"2026-10-15",purchased:"Original",cost:15,qty:2,shipping:4,tax:2,...extra});
const week = (rows,key="2026-W42")=>({key,year:Number(key.slice(0,4)),week:Number(key.slice(-2)),startISO:"2026-10-12",endISO:"2026-10-18",rows});

test("ordinary opening selects local current ISO week/year and highlights it",async()=>{
  const h=harness({remembered:"2025-W01"});await h.open.fire("click");
  assert.equal(h.control("week-select").value,"2026-W42");assert.equal(h.control("year-select").value,"2026");
  assert.match(h.control("week-select").innerHTML,/value="2026-W42" data-current-week="true"[^>]*>Week 42 — Current week/);
  assert.equal(h.saves+h.autosaves,0);assert.deepEqual(h.window.receiptTrackerWeeks,[]);
});
test("year filtering includes historical years, 53/52 weeks, without changing records or writing",async()=>{
  const weeks=[week([row({qty:1.5,custom:{keep:true}})],"2017-W42")],before=JSON.stringify(weeks),h=harness({weeks});
  await h.year(2026);assert.equal((h.control("week-select").innerHTML.match(/<option /g)||[]).length,53);
  await h.week("2026-W53");await h.year(2027);assert.equal(h.control("week-select").value,"2027-W52");
  assert.equal((h.control("week-select").innerHTML.match(/<option /g)||[]).length,52);assert.doesNotMatch(h.control("week-select").innerHTML,/Current week/);
  assert.match(h.control("year-select").innerHTML,/value="2017"/);await h.year(2017);await h.week("2017-W42");
  assert.equal(JSON.stringify(weeks),before);assert.equal(h.autosaves+h.saves,0);
});
test("ISO year transition and reopening after midnight use the local date",async()=>{
  const h=harness({date:"2027-01-01T12:00:00"});assert.equal(h.control("week-select").value,"2026-W53");
  h.clock("2027-01-04T00:01:00");await h.open.fire("click");assert.equal(h.control("week-select").value,"2027-W01");
});
test("Central Data Table target selects its historical year and survives subsequent ordinary opening",async()=>{
  const h=harness({weeks:[week([row()],"2020-W53")]});h.window.__openPurchaseHistoryModalAtEntry({weekKey:"2020-W53",rowIndex:0});
  assert.equal(h.control("year-select").value,"2020");assert.equal(h.control("week-select").value,"2020-W53");
  await h.open.fire("click");assert.equal(h.control("week-select").value,"2026-W42");assert.equal(h.autosaves+h.saves,0);
});
test("invalid unsaved input survives week/year navigation and blocks explicit save across drafts",async()=>{
  const h=harness();await h.edit(0,"purchased","Draft");await h.edit(0,"qty","1.5");const input=h.input(0,"qty");
  const before=h.autosaves;await h.year(2025);await h.week("2025-W01");assert.equal(h.autosaves,before);
  await h.control("save-week").fire("click");assert.equal(h.saves,0);assert.equal(h.input(0,"qty"),input);assert.equal(input.value,"1.5");assert.equal(input.reported,true);
  assert.deepEqual(h.window.receiptTrackerWeeks,[]);await h.close.fire("click");assert.equal(h.modal.hidden,true); // not opened yet
  await h.open.fire("click");await h.close.fire("click");assert.equal(h.modal.hidden,false);
});
test("new quantities reject decimals on input/change/Enter and accept whole numbers with step 1",async()=>{
  const h=harness();assert.equal(h.input(0,"qty").getAttribute("step"),"1");
  await h.edit(0,"purchased","New");
  for(const value of ["1.5","2.25","0.7","-1","Infinity","9007199254740992"]){await h.edit(0,"qty",value,"change");await h.body.fire("keydown",{key:"Enter",target:h.input(0,"qty")});assert.equal(h.window.receiptTrackerWeeks.length,0);}
  await h.edit(0,"qty","5");assert.equal(h.window.receiptTrackerWeeks[0].rows[0].qty,5);assert.ok(h.autosaves>0);
});
test("staged edits in multiple weeks are retained and explicit save serializes every draft once",async()=>{
  const h=harness();await h.edit(0,"qty","2");const first=h.body.children[0];h.input(0,"purchased").value="Uncommitted edit";
  const writes=h.autosaves;await h.week("2026-W43");assert.equal(h.autosaves,writes);await h.edit(0,"qty","3");await h.week("2026-W42");
  assert.equal(h.body.children[0],first);assert.equal(h.input(0,"purchased").value,"Uncommitted edit");
  await h.control("save-week").fire("click");assert.equal(h.saves,1);assert.equal(h.window.receiptTrackerWeeks.length,2);
  assert.equal(h.window.receiptTrackerWeeks.find(item=>item.key==="2026-W42").rows[0].purchased,"Uncommitted edit");
  assert.equal(h.window.receiptTrackerWeeks.find(item=>item.key==="2026-W43").rows[0].qty,3);
});
test("removing the only saved line does not create extra weeks or leave a stale cached line",async()=>{
  const weeks=[week([row({import_event_id:"original"})])],h=harness({weeks});await h.remove(0);await h.week("2026-W43");await h.week("2026-W42");await h.control("save-week").fire("click");
  assert.equal(weeks.length,1);assert.equal(weeks[0].rows.length,0);assert.equal(h.body.children.length,1);
});
test("untouched historical values and metadata remain exact, including decimal quantity and date outside container",async()=>{
  const original=Object.freeze(row({date:"2025-01-01T12:34:56Z",qty:"1.5",shipping:"3.125",taskId:"task-original",inventoryItemId:"inventory-original",import_event_id:"permanent",importProvenance:{sourceRecord:{qty:1.5}},custom:{keep:true}}));
  const weeks=[week([original])],h=harness({weeks}),before=JSON.stringify(weeks);await h.control("save-week").fire("click");
  assert.equal(JSON.stringify(weeks),before);assert.equal(weeks[0].rows[0],original);assert.equal(h.autosaves,0);
  await h.edit(0,"cost","20");const edited=weeks[0].rows[0];assert.equal(edited.qty,"1.5");assert.equal(edited.date,original.date);assert.equal(edited.shipping,"3.125");assert.equal(edited.taskId,"task-original");assert.equal(edited.custom,original.custom);
  await h.edit(0,"qty","2.25");assert.equal(weeks[0].rows[0].qty,"1.5");await h.edit(0,"qty","3");assert.equal(weeks[0].rows[0].qty,3);
});
test("deletion followed by repeated saves preserves the surviving row's complete identity/provenance",async()=>{
  const survivor=row({id:"existing-id",orderId:"optional-order",import_event_id:"source-b",importProvenance:{sourceRecord:{keep:true}},inventoryItemId:"linked",custom:[1,2]});
  const weeks=[week([row(),survivor])],h=harness({weeks});await h.remove(0);await h.edit(0,"cost","18");await h.edit(0,"cost","19");
  await h.control("save-week").fire("click");await h.control("save-week").fire("click");
  assert.equal(weeks[0].rows.length,1);assert.deepEqual({...weeks[0].rows[0]},{...survivor,cost:19});
});
for(const [name,result] of [["blocked CAS",{saved:false,blocked:true,error:"revision conflict"}],["contradictory blocked acknowledgement",{saved:true,stateWriteCompleted:true,blocked:true}],["indeterminate",{saved:false,indeterminate:true}],["unacknowledged",{saved:true,stateWriteCompleted:false}],["unavailable",undefined]])test(`${name} saves never confirm success, close, or refresh`,async()=>{
  const h=harness({save:()=>result});await h.open.fire("click");await h.edit(0,"purchased","Draft");await h.edit(0,"qty","2");
  await h.control("save-week").fire("click");assert.match(h.chip.textContent,/not confirmed/);assert.equal(h.refreshes,0);
  await h.close.fire("click");assert.equal(h.modal.hidden,false);assert.equal(h.messages.includes("Saved"),false);
});
test("thrown save failures keep inputs and never report confirmed success",async()=>{
  const h=harness({save:()=>{throw Error("network");}});await h.edit(0,"qty","2");await h.control("save-week").fire("click");assert.match(h.chip.textContent,/Save failed/);assert.equal(h.input(0,"qty").value,"2");assert.equal(h.refreshes,0);
});
test("in-flight newer edits are retained without refresh or a misleading all-saved state",async()=>{
  let finish;const h=harness({save:()=>new Promise(resolve=>{finish=resolve;})});await h.edit(0,"qty","2");
  const saving=h.control("save-week").fire("click");await h.edit(0,"qty","3");finish({saved:true,stateWriteCompleted:true});await saving;
  assert.equal(h.refreshes,0);assert.match(h.chip.textContent,/newer edits pending/);assert.equal(h.input(0,"qty").value,"3");
});
test("an edit arriving before a scheduled dashboard refresh cancels that refresh",async()=>{
  const h=harness(),callbacks=[];h.context.setTimeout=(callback,delay)=>{if(delay===0)callbacks.push(callback);return 1;};
  await h.edit(0,"qty","2");await h.control("save-week").fire("click");assert.equal(callbacks.length,1);
  await h.edit(0,"qty","3");callbacks[0]();assert.equal(h.refreshes,0);assert.equal(h.input(0,"qty").value,"3");
});
test("Export Range keeps POLISH-01 placement, generates financial output, and range navigation never saves",async()=>{
  const views=fs.readFileSync("js/views.js","utf8"),a=views.indexOf('id="costReceiptModal"'),b=views.indexOf('data-receipt-export-range',a);
  assert.ok(b>views.indexOf('class="cost-receipt-summary-controls"',a));assert.ok(b>views.indexOf('data-receipt-range-select',a));
  const h=harness({weeks:[week([row()])]});h.control("range-select").value="all";await h.control("range-select").fire("change");await h.control("export-range").fire("click");
  assert.equal(h.exports[0].name,"receipt-range-all.xls");const html=await h.blobs.get(h.exports[0].url).text();assert.match(html,/Original/);assert.match(html,/36\.00/);assert.equal(h.saves+h.autosaves,0);
});
test("Chicago UTC-boundary dates and range labels stay on their local calendar day",()=>{
  const cp=require("node:child_process");const code=`const fs=require('node:fs'),vm=require('node:vm');const s=fs.readFileSync('js/renderers.js','utf8');class Clock extends Date{constructor(...a){super(...(a.length?a:['2027-01-04T00:30:00Z']));}}const c=vm.createContext({Date:Clock});vm.runInContext(s.slice(s.indexOf('    const weekStartFromIndex'),s.indexOf('    if (!Array.isArray(window.receiptTrackerWeeks))'))+s.slice(s.indexOf('    const formatDateRangeLabel'),s.indexOf('    const buildRangeRows'))+';this.key=currentReceiptWeek().key;this.label=formatDateRangeLabel(null,new Date(2026,9,15,23,59,59));',c);console.log(JSON.stringify({key:c.key,label:c.label}));`;
  const actual=JSON.parse(cp.execFileSync(process.execPath,["-e",code],{encoding:"utf8",env:{...process.env,TZ:"America/Chicago"}}));
  assert.equal(actual.key,"2026-W53");assert.equal(actual.label,"Range: All time through 2026-10-15");
});
