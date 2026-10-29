'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),api=require('../js/cutCostFeedback');
const reading=(dateISO,hours)=>({dateISO,hours});
const weekly=()=>[reading('2026-07-19',100),reading('2026-07-26',110),reading('2026-10-18',160)];
const resolve=history=>api.actualHours({totalHistory:history},'2026-07-21','2026-10-19');
test('weekly readings use the previous baseline and last available ending reading',()=>{
 const out=resolve(weekly());assert.equal(out.complete,true);assert.equal(out.hours,60);assert.equal(out.measurementStartDate,'2026-07-19');assert.equal(out.measurementEndDate,'2026-10-18');assert.ok(out.warnings.includes('Hours measured through 2026-10-18.'));assert.deepEqual(out.missingDates,[]);
});
test('an exact starting reading takes priority; a later reading is never substituted',()=>{
 const rows=weekly();rows.push(reading('2026-07-21',105));assert.equal(resolve(rows).hours,55);assert.equal(resolve(rows.slice(1,3)).complete,false);assert.ok(resolve(rows.slice(1,3)).issues.some(item=>item.code==='missing_start'));
});
test('both costs and hours use (effective start, effective end], including expenses before requested start',()=>{
 const state={totalHistory:weekly()},config={...api.DEFAULTS,days:'custom',startDate:'2026-07-21',endDate:'2026-10-19'};
 const rows=['2026-07-18','2026-07-19','2026-07-20','2026-10-18','2026-10-19'].map(dateISO=>({dateISO,partCost:30,laborCost:0}));
 const before=structuredClone({state,rows}),result=api.calculate({state,rows,config,today:'2026-10-19'});
 assert.equal(result.eventCount,2);assert.equal(result.maintenanceCost,60);assert.equal(result.maintenanceCostPerHour,1);assert.equal(result.actualCuttingHours,60);assert.deepEqual({state,rows},before);
});
test('zero cumulative difference is insufficient; a lone baseline has no ending measurement',()=>{
 let result=resolve([reading('2026-07-19',0),reading('2026-10-18',0)]);assert.equal(result.hours,0);assert.equal(result.complete,false);assert.equal(result.issues[0].code,'zero_hours');result=resolve([reading('2026-07-19',0)]);assert.equal(result.hours,null);assert.ok(result.issues.some(item=>item.code==='missing_end'));
});
test('invalid numeric readings are ignored explicitly, never silently converted to zero',()=>{
 for(const value of [null,undefined,'',NaN,Infinity,-1,'bad',true,[],{}]){
  const rows=weekly();rows.push(reading('2026-10-19',value));const out=resolve(rows);assert.equal(out.hours,60);assert.equal(out.measurementEndDate,'2026-10-18');assert.ok(out.issues.some(item=>item.code==='invalid'));assert.equal(resolve([reading('2026-07-19',value),reading('2026-10-18',160)]).complete,false);
 }
 assert.equal(resolve([reading('2026-07-19','0'),reading('2026-10-18','60')]).hours,60);
});
test('identical duplicate readings deduplicate; conflicting same-day endpoints and intermediates block',()=>{
 const rows=weekly();rows.push({...rows[0]});assert.equal(resolve(rows).hours,60);
 for(const row of [reading('2026-07-19',101),reading('2026-07-26',111),reading('2026-10-18',161),reading('2026-10-19',170)]){
  const conflict=[...weekly(),row];if(row.dateISO==='2026-10-19')conflict.push(reading(row.dateISO,171));const out=resolve(conflict);assert.equal(out.hours,null);assert.ok(out.issues.some(item=>item.code==='duplicate'));
 }
});
test('decreasing readings block even when endpoint subtraction would be positive; corrections recalculate',()=>{
 const rows=[reading('2026-07-19',100),reading('2026-07-26',90),reading('2026-10-18',160)];assert.equal(resolve(rows).hours,null);assert.ok(resolve(rows).issues.some(item=>item.code==='reset'));rows[1].hours=110;assert.equal(resolve(rows).hours,60);rows[2].hours=99;assert.equal(resolve(rows).complete,false);assert.equal(resolve(rows).hours,null);
});
test('resets outside the effective measurement window do not invalidate a later stable interval',()=>{
 const rows=[reading('2026-07-01',1000),reading('2026-07-10',0),...weekly(),reading('2026-10-20',0)];assert.equal(resolve(rows).hours,60);
});
test('configured zero cost and duration are valid nonblocking estimates; occurrence values take priority',()=>{
 const state={totalHistory:weekly(),tasksInterval:[{id:'task',price:0,downtimeHours:0}]},row={taskId:'task',taskName:'Filter',dateISO:'2026-10-18'};
 const config={...api.DEFAULTS,days:'custom',startDate:'2026-07-21',endDate:'2026-10-19'};
 let rows=api.maintenanceRows([row],state),result=api.calculate({state,rows,config,today:'2026-10-19'});assert.equal(result.valid,true);assert.equal(result.maintenanceCost,0);assert.equal(result.dataCompleteness.estimatedEvents,1);
 state.tasksInterval[0].price=100;state.tasksInterval[0].downtimeHours=2;state.tasksInterval[0].manualHistory=[{dateISO:row.dateISO,partsCostSnapshot:0,loggedHours:0}];rows=api.maintenanceRows([row],state);assert.equal(rows[0].totalCost,0);assert.equal(rows[0].costEstimated,false);
 delete state.tasksInterval[0].manualHistory;state.tasksInterval[0].price=null;rows=api.maintenanceRows([row],state);assert.equal(rows[0].costIncomplete,false);assert.equal(rows[0].totalCost,60);assert.equal(rows[0].costFields.parts.source,"Blank setting assumed zero");assert.equal(api.calculate({state,rows,config,today:'2026-10-19'}).valid,true);
});
test('valid settings fields are considered individually without losing explicit zero',()=>{
 const state={tasksInterval:[{id:'task',price:'',cost:0,calendarPrice:100,downtimeHours:0}]};const rows=api.maintenanceRows([{taskId:'task',dateISO:'2026-10-18'}],state);assert.equal(rows[0].costIncomplete,false);assert.equal(rows[0].totalCost,0);
});
test('linked V2 settings supply missing legacy defaults, including zero duration',()=>{
 const state={tasksInterval:[{id:'legacy'}],maintenanceTasksV2:[{id:'v2',legacyTaskId:'legacy',price:25,downtimeHours:0}]};
 const rows=api.maintenanceRows([{taskId:'v2',sourceSystem:'v2',rootOccurrenceId:'root',dateISO:'2026-10-18'}],state);
 assert.equal(rows[0].partCost,25);assert.equal(rows[0].maintenanceHrs,0);assert.equal(rows[0].costIncomplete,false);assert.equal(rows[0].costEstimated,true);
});
