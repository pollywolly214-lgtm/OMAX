'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),api=require('../js/cutCostFeedback'),financial=require('../js/financialReconciliation');
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
test('02B missing Calendar chip cannot invoke a removal repair or select another root of the same instance',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync('js/renderers.js','utf8');
  const start=source.indexOf('  function focusCalendarAtOccurrence('),end=source.indexOf('  function focusCalendarForCuttingJob(',start);
  let repairs=0,clicks=0;class Element{click(){clicks++;}}
  const cell={scrollIntoView(){},querySelector:selector=>selector.includes('data-v2-instance-id')?new Element():null};
  const context=vm.createContext({window:{repairV2OrphanCompletedRow(){repairs++;}},Date,HTMLElement:Element,location:{},document:{getElementById:()=>({querySelector:()=>cell})},renderCalendarPreservingScroll(){},setTimeout(){},toast(){}});
  vm.runInContext(source.slice(start,end),context);context.focusCalendarAtOccurrence('native','2026-07-15',{sourceSystem:'v2',rootOccurrenceId:'missing-root',instanceId:'shared-instance'});
  assert.equal(repairs,0);assert.equal(clicks,0);
});
const candidate={taskId:'task',dateISO:'2026-07-15',historyEventId:'event',historySourceTaskId:'task',sourceEventKey:'event-key'};
function state(settings={},event={}){return {tasksInterval:[{id:'task',name:'Jewell cleaning',price:null,downtimeHours:null,manualHistory:[{id:'event',dateISO:'2026-07-15',status:'completed',...event}],...settings}],tasksAsReq:[],deletedItems:[]};}
function row(source,ref=candidate,streams=[]){freeze(source);const before=JSON.stringify(source),out=api.maintenanceRows([ref],source,streams);assert.equal(JSON.stringify(source),before);return out[0];}
test('02B blank linked prices become estimated zero without fabricating source values',()=>{
  for(const price of [undefined,null,'','  ']){const result=row(state({price}));assert.equal(result.totalCost,0);assert.equal(result.costIncomplete,false);assert.equal(result.costEstimated,true);assert.equal(result.costFields.parts.source,'Blank setting assumed zero');assert.equal(result.costFields.duration.source,'Zero-hour fallback');}
});
test('02B matching configured parts/labor and blank parts with configured labor reconcile',()=>{
  assert.equal(row(state({downtimeHours:.5})).totalCost,15);assert.equal(row(state({price:170})).totalCost,170);assert.equal(row(state({price:170,downtimeHours:.5})).totalCost,185);
});
test('02B occurrence-specific values and explicit zero override matching Settings',()=>{
  for(const [event,total] of [[{partsCostSnapshot:0,hours:0},0],[{partsCostSnapshot:12,hours:.25},19.5],[{partsCostSnapshot:0},15]]){const result=row(state({price:170,downtimeHours:.5},event));assert.equal(result.totalCost,total);assert.equal(result.costFields.parts.source,'Occurrence-specific');}
});
test('02B invalid occurrence fields fall through to valid occurrence fields, then Settings; invalid Settings are reviewed',()=>{
  assert.equal(row(state({price:170},{partsCostSnapshot:'bad',partsCost:12,hours:0})).totalCost,12);
  const invalid=row(state({price:-1}));assert.equal(invalid.costIncomplete,true);assert.equal(invalid.costFields.parts.value,null);assert.match(invalid.costExclusionReason,/Review invalid/);
});
test('02B archived original IDs and V2 links use the exact original blank setting, never a same-name task',()=>{
  const source=state();source.deletedItems=[{type:'task',payload:source.tasksInterval.shift()}];source.tasksInterval=[{id:'other',name:'Jewell cleaning',price:999,downtimeHours:9}];
  assert.equal(row(structuredClone(source)).totalCost,0);
  source.maintenanceTasksV2=[{id:'v2',legacyTaskId:'task'}];const result=row(source,{taskId:'v2',sourceSystem:'v2',rootOccurrenceId:'root',dateISO:'2026-07-15'},[{sourceSystem:'v2',rootOccurrenceId:'root'}]);
  assert.equal(result.totalCost,0);assert.equal(result.settingsTaskId,'task');assert.equal(result.settingsArchived,true);
});
for(const kind of ['missing','duplicate','active/archive collision','wrong source','missing V2 legacy link'])test('02B '+kind+' cannot produce arbitrary zero or nonzero costs',()=>{
  const source=state({price:170,downtimeHours:.5},{partsCostSnapshot:20,hours:1});let ref=candidate;
  if(kind==='missing')source.tasksInterval=[];
  if(kind==='duplicate')source.tasksInterval.push({...source.tasksInterval[0]});
  if(kind==='active/archive collision')source.deletedItems=[{type:'task',payload:{...source.tasksInterval[0]}}];
  if(kind==='wrong source'){source.tasksInterval.push({id:'other',price:999});ref={...candidate,historySourceTaskId:'other'};}
  if(kind==='missing V2 legacy link'){source.maintenanceTasksV2=[{id:'v2',legacyTaskId:'missing'}];ref={taskId:'v2',sourceSystem:'v2',rootOccurrenceId:'root',dateISO:candidate.dateISO};}
  const result=row(source,ref);assert.equal(result.costIncomplete,true);assert.equal(result.costFields.parts.value,null);assert.match(result.costExclusionReason,/identity/);
  assert.equal(financial.expenses(financial.period('all','2026-10-28'),[result]).maintenance.knownSubtotal,0);
});
test('02B zero and labor-only events retain same-day identities and feed one canonical rate and subtotal',()=>{
  const source=state({downtimeHours:.5});source.totalHistory=[{dateISO:'2026-07-14',hours:100},{dateISO:'2026-07-16',hours:110}];
  const refs=[{...candidate,historyEventId:'one',sourceEventKey:'one'},{...candidate,historyEventId:'two',sourceEventKey:'two'}];
  source.tasksInterval[0].manualHistory=[{id:'one',dateISO:candidate.dateISO,hours:0},{id:'two',dateISO:candidate.dateISO}];freeze(source);
  const rows=api.maintenanceRows([...refs,refs[0]],source),cost=api.calculate({state:source,rows,config:{...api.DEFAULTS,days:'custom',startDate:'2026-07-14',endDate:'2026-07-16'},today:'2026-07-16'});
  assert.equal(rows.length,2);assert.deepEqual(rows.map(row=>row.totalCost),[0,15]);assert.equal(cost.maintenanceCostPerHour,1.5);assert.equal(cost.dataCompleteness.incompleteEvents,0);
});
