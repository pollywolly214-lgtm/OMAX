'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),api=require('../js/cutCostFeedback'),repair=require('../js/cutCostRepair'),fs=require('node:fs'),vm=require('node:vm');
const fixture=()=>({syncMeta:{rev:7},tasksInterval:[{id:'filter',price:20,downtimeHours:1,completedDates:['2026-10-18','2026-10-19'],manualHistory:[{id:'historic-entry',dateISO:'2026-10-18',status:'completed',partsCostSnapshot:10,untouched:true}]}],tasksAsReq:[],maintenanceTasksV2:[],maintenanceCalendarInstancesV2:[],maintenanceOccurrencesV2:[],dailyCutHours:[{dateISO:'2026-10-18',hours:0,source:'auto',provenance:{keep:true}}],completedCuttingJobs:[{id:'job',costRate:45}],receiptTrackerWeeks:[{rows:[{cost:715}]}]});
const row={taskId:'filter',dateISO:'2026-10-18',taskName:'Filter'};
const stamp={id:'correction',atISO:'2026-10-19T17:00:00Z',actor:'fixture'};
test('legacy correction resolves one task/date, appends evidence and preserves defaults/history/jobs',()=>{
 const state=fixture(),before=structuredClone(state),rows=api.maintenanceRows([row,{...row,dateISO:'2026-10-19'}],state),target=repair.describe(state,rows[0]);
 const result=repair.planMaintenance(state,target,{parts:0,duration:0},stamp),task=result.pending.tasksInterval[0];assert.deepEqual(state,before);assert.deepEqual(task.manualHistory[0],before.tasksInterval[0].manualHistory[0]);assert.equal(task.price,20);assert.equal(task.downtimeHours,1);assert.deepEqual(task.completedDates,before.tasksInterval[0].completedDates);assert.deepEqual(result.pending.completedCuttingJobs,before.completedCuttingJobs);assert.deepEqual(result.pending.receiptTrackerWeeks,before.receiptTrackerWeeks);
 const updated=api.maintenanceRows([row,{...row,dateISO:'2026-10-19'}],result.pending);assert.equal(updated[0].totalCost,0);assert.equal(updated[0].costIncomplete,false);assert.equal(updated[1].totalCost,50);assert.equal(updated[0].costFields.parts.source,'Occurrence-specific');
});
test('stale/ambiguous/archived legacy identities and invalid values reject without mutation',()=>{
 for(const mode of ['stale','ambiguous','archived','negative','missing']){const state=fixture(),target=repair.describe(state,row);if(mode==='stale')state.tasksInterval[0].price++;if(mode==='ambiguous')state.tasksInterval.push(structuredClone(state.tasksInterval[0]));if(mode==='archived')state.tasksInterval=[];const before=structuredClone(state);assert.throws(()=>repair.planMaintenance(state,target,{parts:mode==='negative'?-1:mode==='missing'?'':0,duration:0},stamp));assert.deepEqual(state,before);}
 const state=fixture();state.tasksInterval[0].manualHistory.push({...state.tasksInterval[0].manualHistory[0],id:'another'});assert.throws(()=>repair.describe(state,row),/Multiple historical/);
});
test('V2 correction is an append to the exact moved root; reopening makes the target stale',()=>{
 const state=fixture();state.maintenanceTasksV2=[{id:'v2',legacyTaskId:'filter'}];state.maintenanceCalendarInstancesV2=[{id:'instance',taskId:'v2'}];
 const base={system:'v2',taskId:'v2',instanceId:'instance',rootOccurrenceId:'root',effectiveDateISO:'2026-10-17'};
 state.maintenanceOccurrencesV2=[{...base,id:'move',eventType:'moved',recordedAtISO:'2026-10-19T11:00:00Z',payload:{toDateISO:'2026-10-18'}},{...base,id:'done',eventType:'completed',recordedAtISO:'2026-10-19T10:00:00Z',partsCostSnapshot:100}];
 const vrow={...row,sourceSystem:'v2',taskId:'v2',instanceId:'instance',rootOccurrenceId:'root'},target=repair.describe(state,vrow),before=structuredClone(state);
 const result=repair.planMaintenance(state,target,{parts:25,duration:.1},stamp);assert.deepEqual(result.pending.maintenanceOccurrencesV2.slice(1),before.maintenanceOccurrencesV2);assert.equal(result.pending.maintenanceOccurrencesV2[0].rootOccurrenceId,'root');assert.equal(result.pending.maintenanceOccurrencesV2[0].partsCostSnapshot,25);assert.deepEqual(result.pending.tasksInterval,before.tasksInterval);assert.deepEqual(state,before);
 state.maintenanceOccurrencesV2.unshift({...base,id:'reopen',eventType:'uncompleted',recordedAtISO:'2026-10-19T12:00:00Z'});assert.throws(()=>repair.planMaintenance(state,target,{parts:25,duration:.1},stamp),/no longer completed|changed/);
});
test('missing/defaulted maintenance and meter-issue lists match counts; zero is present',()=>{
 const state=fixture();state.tasksInterval[0].occurrenceHours={'2026-10-18':0};delete state.tasksInterval[0].price;delete state.tasksInterval[0].downtimeHours;
 const rows=api.maintenanceRows([row,{...row,dateISO:'2026-10-19'}],state);
 const result=api.calculate({state,rows,config:{...api.DEFAULTS,days:'custom',startDate:'2026-10-18',endDate:'2026-10-19'},today:'2026-10-19',resolve:()=>new Map()});
 assert.equal(result.review.missingMaintenance.length,result.dataCompleteness.incompleteEvents);assert.equal(result.review.defaultedMaintenance.length,result.dataCompleteness.estimatedEvents);assert.deepEqual(result.review.missingDates,[]);assert.ok(result.review.meterIssues.some(item=>item.code==='missing_start'));assert.equal(rows[0].costFields.duration.value,0);assert.equal(rows[0].costIncomplete,false);
});
test('daily repair accepts explicit zero, replaces auto source and preserves unrelated record provenance/order',()=>{
 const state=fixture(),before=structuredClone(state),out=repair.planHours(state,[['2026-10-18',0],['2026-10-19',0]],stamp.atISO);assert.deepEqual(state,before);assert.equal(out.pending.dailyCutHours[0].source,'manual');assert.deepEqual(out.pending.dailyCutHours[0].provenance,{keep:true});assert.deepEqual(out.pending.completedCuttingJobs,before.completedCuttingJobs);assert.equal(out.pending.dailyCutHours[1].hours,0);
 for(const value of ['',null,-1,25,NaN])assert.throws(()=>repair.planHours(state,[['2026-10-19',value]],stamp.atISO));
});
test('calendar normalizer preserves zero and fractional occurrence duration without mutating reads',()=>{
 const src=fs.readFileSync('js/calendar.js','utf8'),ctx=vm.createContext({normalizeDateKey:value=>value,window:{}});const section=(start,end)=>src.slice(src.indexOf(start),src.indexOf(end,src.indexOf(start)));
 vm.runInContext(section('function normalizeOccurrenceHours(','function normalizeRemovedOccurrences(')+section('function getOccurrenceHoursForTask(','function setOccurrenceNoteForTask('),ctx);const task={occurrenceHours:{'2026-10-18':0,'2026-10-19':1/12}},before=structuredClone(task);assert.equal(ctx.getOccurrenceHoursForTask(task,'2026-10-18'),0);assert.equal(ctx.getOccurrenceHoursForTask(task,'2026-10-19'),1/12);assert.deepEqual(task,before);
});
