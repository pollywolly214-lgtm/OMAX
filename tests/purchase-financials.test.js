"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const api = require("../js/purchaseFinancials"), history = require("../js/historicalImport");
const renderer = fs.readFileSync("js/renderers.js", "utf8"), views = fs.readFileSync("js/views.js", "utf8");
const usd = value => new Intl.NumberFormat("en-US", { style:"currency", currency:"USD" }).format(value);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
function extract(start, end){ const offset = renderer.indexOf(start); assert.ok(offset >= 0); const finish = renderer.indexOf(end, offset); assert.ok(finish > offset); return renderer.slice(offset, finish); }
function recovered(){
  const source = { import_event_id:"purchase-fixture", source_id:"original-source", source_record_id:"line-1", date:"2025-01-03", purchased:"Fixture part", cost:600, qty:1, shipping:27.41, tax:51.75, partNumber:"part-1" };
  const state = { receiptTrackerWeeks:[] };
  return history.append("purchase", state, history.preview("purchase", [source], state)).receiptTrackerWeeks[0].rows[0];
}
function freeze(value){ if (value && typeof value === "object") { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }
function renderPurchase(row){
  class Element { constructor(){ this.innerHTML=""; this.hidden=true; } }
  const rangeRowsBody = new Element(), weekRowsBody = new Element(), spendBody = new Element();
  const rangeAllocationNote = new Element(), weekAllocationNote = new Element(), weekSubtotal = new Element();
  const week = {key:"2025-W01",week:1,startISO:"2024-12-30",endISO:"2025-01-05",rows:[row]};
  const context = vm.createContext({ ...api, HTMLElement:Element, document:{ querySelector:()=>spendBody }, window:{receiptTrackerWeeks:[week]}, escapeHtml, formatUsd:usd, toIsoDate:value=>String(value || "").slice(0,10), normalizeRows:rows=>rows || [], getWeekEntry:()=>week, activeWeekKey:week.key, getRangeWindow:()=>({start:null,end:null}), buildRangeRows:()=>[{...row,total:api.getPurchaseFinancials(row).totalSpend}], activeRange:"all", rangeRowsBody, weekRowsBody, rangeAllocationNote, weekAllocationNote, weekSubtotal, rangeSubtotal:{}, weekRangeLabel:{}, rangeLabel:{}, formatDateRangeLabel:()=>"All time", findInventoryByPartNumber:()=>null, purchasedDatalistId:"fixture", appendEmptyRow:()=>{}, recomputeWeekTotals:()=>{} });
  vm.runInContext(extract("    const formatUsd", "    const toIsoDate") + extract("    const computeRowTotal", "    const escWorkbookHtml") + extract("    const renderCentralSpendRows", "    const getWeekEntry") + extract("      const renderWeekRows", "      const findInventoryByPartNumber") + extract("      const renderRangeTable", "      const bindRowEvents") + ";renderWeekRows();renderRangeTable();renderCentralSpendRows();", context);
  return { range:rangeRowsBody.innerHTML, week:weekRowsBody.innerHTML, spend:spendBody.innerHTML, rangeAllocationNote, weekAllocationNote };
}
for (const [name,row,subtotal,total] of [
  ["unit cost",{cost:600,qty:1},600,600],
  ["quantity subtotal",{cost:15,qty:2},30,30],
  ["total spend",{cost:15,qty:2,shipping:4,tax:2},30,36],
  ["recovered 600-dollar line",{cost:600,qty:1,shipping:27.41,tax:51.75},600,679.16],
  ["recovered 73.50-dollar line",{cost:73.50,qty:1,shipping:3.36,tax:6.34},73.50,83.20],
  ["multiply before charges",{cost:15,qty:3,shipping:4,tax:2},45,51]
]) test(name,()=>{const result=api.getPurchaseFinancials(freeze(row));assert.equal(usd(result.unitCost),usd(row.cost));assert.equal(usd(result.merchandiseSubtotal),usd(subtotal));assert.equal(usd(result.totalSpend),usd(total));});
test("legacy missing values and invalid numeric values are safe",()=>{
  assert.deepEqual(api.getPurchaseFinancials({cost:"15",qty:"2"}),{unitCost:15,qty:2,merchandiseSubtotal:30,shipping:0,tax:0,totalSpend:30});
  for (const row of [null,{}, {cost:Infinity,qty:NaN,shipping:"bad",tax:-1}]) assert.equal(api.getPurchaseFinancials(row).totalSpend,0);
});
test("actual recovered provenance identifies historical rows without parsing IDs or changing calculations",()=>{
  const row=freeze(recovered()), before=JSON.stringify(row);
  assert.equal(api.isHistoricalPurchase(row),true);assert.equal(api.isHistoricalPurchase({...row,import_event_id:"different"}),false);
  for(const manual of [{cost:600,qty:1}, {...row,importProvenance:undefined}, {...row,import_event_id:undefined}, {...row,importProvenance:{sourceRecord:[]}}])assert.equal(api.isHistoricalPurchase(manual),false);
  assert.deepEqual(api.getPurchaseFinancials(row),api.getPurchaseFinancials({...row,import_event_id:undefined,importProvenance:undefined}));assert.equal(JSON.stringify(row),before);
});
test("week, range and live Data Center render exact financial values and contextual allocation notes",()=>{
  const row=freeze(recovered()),before=JSON.stringify(row),rendered=renderPurchase(row);
  for(const html of [rendered.range,rendered.spend])for(const amount of ["$600.00","$27.41","$51.75","$679.16"])assert.ok(html.includes(amount),amount);
  assert.match(rendered.week,/data-col="merchandiseSubtotal">\$600.00/);assert.match(rendered.week,/data-col="total">\$679.16/);
  assert.equal(rendered.rangeAllocationNote.hidden,false);assert.equal(rendered.weekAllocationNote.hidden,false);assert.equal(JSON.stringify(row),before);
});
test("manual rows render the same amounts with zero optional charges and no allocation claim",()=>{
  const row=freeze({date:"2025-01-03",purchased:"Manual & item",cost:15,qty:2}),rendered=renderPurchase(row);
  for(const html of [rendered.range,rendered.week,rendered.spend]){assert.ok(html.includes("$30.00"));assert.ok(html.includes("Manual &amp; item"));assert.ok(!html.includes("undefined"));}
  assert.equal(rendered.rangeAllocationNote.hidden,true);assert.equal(rendered.weekAllocationNote.hidden,true);
});
test("initial Data Center model and Purchase History agree and preserve cents for totals over 1000",()=>{
  const row=freeze({...recovered(),cost:600,qty:2}),before=JSON.stringify(row);
  const context=vm.createContext({...api,window:{receiptTrackerWeeks:[{key:"2025-W01",rows:[row]}]},toHistoryDateKey:value=>value});
  vm.runInContext(extract("  const formatterCurrency =", "  const formatHours")+extract("  const purchaseDataTableRows =", "  const spendByDate")+";this.rows=purchaseDataTable;",context);
  const initial=context.rows[0],rendered=renderPurchase(row),expected=api.getPurchaseFinancials(row);
  assert.equal(initial.costLabel,usd(expected.unitCost));assert.equal(initial.merchandiseSubtotalLabel,usd(expected.merchandiseSubtotal));assert.equal(initial.totalLabel,usd(expected.totalSpend));
  assert.ok(rendered.range.includes(initial.totalLabel));assert.ok(rendered.spend.includes(initial.totalLabel));assert.equal(JSON.stringify(row),before);
});
test("editable week recomputes item subtotal and total spend using the shared helper",()=>{
  class Element {}
  const cells={merchandiseSubtotal:{},total:{}},inputs={cost:{value:"15"},qty:{value:"2"},shipping:{value:"4"},tax:{value:"2"}};
  const tr={querySelector:selector=>{const key=selector.match(/data-col=["']?([^"'\]]+)/)[1];return cells[key] || inputs[key];}};
  const weekRowsBody=new Element();weekRowsBody.querySelectorAll=()=>[tr];const weekSubtotal={};
  const context=vm.createContext({...api,HTMLElement:Element,weekRowsBody,weekSubtotal,formatUsd:usd});
  vm.runInContext(extract("      const recomputeWeekTotals", "      const renderWeekRows")+";recomputeWeekTotals();",context);
  assert.equal(cells.merchandiseSubtotal.textContent,"$30.00");assert.equal(cells.total.textContent,"$36.00");assert.equal(weekSubtotal.textContent,"$36.00");
});
test("table headers, footers, exports, script order and scrolling match the financial presentation",()=>{
  const context=vm.createContext({window:{},renderAverageHoursBanner:()=>""});vm.runInContext(views.slice(views.indexOf("function viewCosts("),views.indexOf("function viewJobs("))+";this.html=viewCosts({});",context);
  const modal=context.html.slice(context.html.indexOf('id="costReceiptModal"'),context.html.indexOf('id="costLayout"'));
  for(const heading of ["Unit Cost","Item Subtotal","Total Spend"])assert.equal((modal.match(new RegExp(`>${heading}<`,"g")) || []).length,2);
  assert.ok(modal.includes("Week Total Spend"));assert.ok(modal.includes("Range Total Spend"));assert.match(modal,/data-receipt-range-allocation-note hidden/);
  const index=fs.readFileSync("index.html","utf8"),css=fs.readFileSync("style.css","utf8");assert.ok(index.indexOf('src="js/purchaseFinancials.js"')<index.indexOf('src="js/views.js"'));
  assert.match(css,/#costReceiptModal \.cost-weekly-table-wrap\{[^}]*overflow-x:auto/);assert.match(css,/min-width:1280px/);assert.match(css,/purchase-number\{ text-align:right/);
  assert.equal((renderer.match(/headerRows: \[\["Date", "Purchased Item", "Part #", "Qty", "Unit Cost", "Item Subtotal", "Shipping", "Tax", "Total Spend"\]\]/g)||[]).length,2);
});
