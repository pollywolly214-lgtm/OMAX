"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const costs=require('../js/cutCostFeedback'),financial=require('../js/financialReconciliation');
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function resolve(event={},settings={},extra={}){
  const state=freeze({tasksInterval:[{id:'task',name:'Filter',price:170,downtimeHours:.5,manualHistory:[{id:'event',dateISO:'2026-01-02',status:'completed',...event}],...settings}],...extra});
  const before=JSON.stringify(state),rows=costs.maintenanceRows([{taskId:'task',taskName:'Filter',dateISO:'2026-01-02',historySourceTaskId:'task',historyField:'manualHistory',historyIndex:0,historyEventId:'event'}],state);
  assert.equal(JSON.stringify(state),before);return {state,row:rows[0]};
}
test('02A recorded labor, including explicit zero, overrides matching Settings',()=>{
  for(const [hours,total] of [[1,200],[0,170],['0',170]]){const {row}=resolve({hours});assert.equal(row.totalCost,total);assert.equal(row.costFields.duration.source,'Occurrence-specific');}
});
test('02A absent or invalid occurrence duration uses valid configured hours: $170 + .5 × $30 = $185',()=>{
  for(const hours of [undefined,null,'','invalid',-1,Infinity,false]){const {row}=resolve({hours});assert.equal(row.totalCost,185);assert.equal(row.costIncomplete,false);assert.equal(row.costEstimated,true);assert.equal(row.costFields.duration.source,'Configured default');}
});
test('02A missing and invalid durations everywhere use derived zero; recorded and configured zero remain distinct',()=>{
  for(const downtimeHours of [undefined,null,'','invalid',-1]){const {row}=resolve({}, {downtimeHours});assert.equal(row.maintenanceHrs,0);assert.equal(row.totalCost,170);assert.equal(row.costFields.duration.source,'Zero-hour fallback');}
  const {row}=resolve({}, {downtimeHours:0});assert.equal(row.totalCost,170);assert.equal(row.costFields.duration.source,'Configured default');
});
test('02A unknown parts remain unknown and cannot contribute a partial monetary total or rate',()=>{
  const {row}=resolve({}, {price:-1});assert.equal(row.costIncomplete,true);assert.equal(row.costFields.parts.value,null);assert.equal(row.costFields.duration.value,.5);
  const state={totalHistory:[{dateISO:'2026-01-01',hours:100},{dateISO:'2026-01-03',hours:110}]};
  const output=costs.calculate({state,rows:[row],today:'2026-01-03',config:{...costs.DEFAULTS,days:'custom',startDate:'2026-01-01',endDate:'2026-01-03'}});
  assert.equal(output.partsCost,0);assert.equal(output.laborCost,0);assert.equal(output.maintenanceCost,0);assert.equal(output.maintenanceCostPerHour,null);
  assert.equal(output.review.missingMaintenance.length,1);
});
test('02A explicit parts zero remains valid, including archived task configuration',()=>{
  assert.equal(resolve({partsCostSnapshot:0,hours:0}).row.totalCost,0);
  const archived={id:'archived',name:'Filter',price:0,downtimeHours:.5};
  const state=freeze({tasksInterval:[{id:'other',name:'Filter',price:999,downtimeHours:99}],deletedItems:[{type:'task',payload:archived}]});
  const row=costs.maintenanceRows([{taskId:'archived',dateISO:'2026-01-02'}],state)[0];assert.equal(row.totalCost,15);assert.equal(row.costIncomplete,false);
});
test('02A explicit V2 legacy link uses matching archived settings and occurrence zero wins',()=>{
  const state=freeze({tasksInterval:[{id:'other',price:999,downtimeHours:99}],deletedItems:[{type:'task',payload:{id:'old',price:170,downtimeHours:.5}}],maintenanceTasksV2:[{id:'v2',legacyTaskId:'old'}]});
  const candidate={sourceSystem:'v2',taskId:'v2',rootOccurrenceId:'root',dateISO:'2026-01-02'};
  for(const [loggedHours,total] of [[null,185],[0,170],[1,200]]){const row=costs.maintenanceRows([candidate],state,[{sourceSystem:'v2',rootOccurrenceId:'root',loggedHours}])[0];assert.equal(row.totalCost,total);}
});
test('02A same-day events resolve their own recorded labor before a shared date override, with no duplicate expenses',()=>{
  const task={id:'task',price:170,downtimeHours:2,occurrenceHours:{'2026-01-02':9},manualHistory:[{id:'one',dateISO:'2026-01-02',hours:0},{id:'two',dateISO:'2026-01-02',hours:.5}]};
  const state=freeze({tasksInterval:[task]}),rows=costs.maintenanceRows(['one','two','one'].map(id=>({taskId:'task',dateISO:'2026-01-02',historyEventId:id,historySourceTaskId:'task'})),state);
  assert.deepEqual(rows.map(row=>row.totalCost),[170,185]);assert.equal(new Set(rows.map(row=>row.sourceEventKey)).size,2);
  const expenses=financial.expenses(financial.period('all','2026-10-28'),rows);assert.equal(expenses.maintenance.knownSubtotal,355);assert.equal(expenses.maintenance.modeledLabor,15);
});
