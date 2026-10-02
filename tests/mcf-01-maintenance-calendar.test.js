"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const integrity=require("../js/maintenanceCalendarIntegrity"),maintenance=require("../js/maintenanceRecoveryImport"),history=require("../js/historicalImport"),atomic=require("../js/atomicPersistence"),firewall=require("../js/cuttingFileContentFirewall");
const clone=value=>structuredClone(value),calendar=fs.readFileSync("js/calendar.js","utf8"),renderer=fs.readFileSync("js/renderers.js","utf8"),core=fs.readFileSync("js/core.js","utf8");
const date="2026-06-16",stamp="2026-10-02T00:00:00Z";
function initial(){return{syncMeta:{rev:7},tasksAsReq:[],tasksInterval:[{id:"mixing",name:"Mixing tube rotation",mode:"interval",price:10,downtimeHours:5/60,recurrence:{enabled:true,every:30},completedDates:["2026-01-01"],manualHistory:[{id:"keep"}]}],inventory:[{id:"stock",qtyNew:9}],receiptTrackerWeeks:[{key:"keep",rows:[{cost:80}]}],weeklyCostReports:[],totalHistory:[{hours:100}],pumpEff:{entries:[]},maintenanceTasksV2:[],maintenanceCalendarInstancesV2:[],maintenanceOccurrencesV2:[]};}
function recovery(){
  const state=initial(),source=[{import_event_id:"recovery-1",event_date:date,route:"existing_task",exact_existing_task:"Mixing tube rotation",event_name:"Mixing tube rotation",calendar_mode:"one_time",mark_completed:true,labor_minutes:5}];
  return history.append("maintenance",state,history.preview("maintenance",source,state));
}
function project(state){
  const window=clone(state),context=vm.createContext({window,normalizeDateKey:value=>value?String(value).slice(0,10):null,resolveV2OneTimeOccurrenceState:(root,event)=>integrity.resolveOneTime(window,root,event)});
  vm.runInContext("const dueMap={};"+calendar.slice(calendar.indexOf("  const v2TaskLookup = new Map();"),calendar.indexOf("  const repeatInstances ="))+";this.rows=dueMap;",context);
  return{window,rows:clone(context.rows)};
}
function chips(rows){
  const output=[],context=vm.createContext({dueMap:{[date]:rows},key:date,document:{createElement:()=>({dataset:{},addEventListener(){}})},cell:{appendChild:element=>output.push(element)},formatCalendarDayHours:String});
  vm.runInContext(calendar.slice(calendar.indexOf("      (dueMap[key]||[]).forEach(ev=>{"),calendar.indexOf("      (pumpMap[key]||[]).forEach(ev=>{")),context);
  return output;
}
test("recovery scheduled/completed pair projects one completed blue-class chip, retaining labor and identities",()=>{
  const state=recovery(),before=clone(state),view=project(state),rows=view.rows[date],root=state.maintenanceOccurrencesV2.find(row=>row.eventType==="scheduled"),completed=state.maintenanceOccurrencesV2.find(row=>row.eventType==="completed");
  assert.equal(rows.length,1);assert.equal(rows[0].status,"completed");assert.match(chips(rows)[0].className,/is-complete/);assert.equal(view.window.__calendarV2OneTimeLookup[root.id].hours,5/60);assert.equal(state.maintenanceCalendarInstancesV2[0].repeatRule,null);
  assert.equal(completed.import_event_id,"recovery-1");assert.equal(completed.recoveryImportId,"recovery-1");assert.deepEqual(state,before);
});
test("same task/date unrelated one-time root remains yellow and is not hidden by semantic deduplication",()=>{
  const state=recovery(),root=clone(state.maintenanceOccurrencesV2.find(row=>row.eventType==="scheduled")),instance=clone(state.maintenanceCalendarInstancesV2[0]);
  instance.id="other-instance";delete instance.recoveryImportId;state.maintenanceCalendarInstancesV2.push(instance);root.id="other-root";root.instanceId=instance.id;delete root.recoveryImportId;state.maintenanceOccurrencesV2.push(root);
  const rows=project(state).rows[date];assert.equal(rows.length,2);assert.deepEqual(rows.map(row=>row.status),["completed","manual"]);assert.equal(chips(rows).filter(chip=>chip.className.includes("is-complete")).length,1);
});
test("recurring schedule without its own linked completion stays yellow and its chain is unchanged",()=>{
  const state=recovery(),instance={id:"repeat",taskId:state.maintenanceTasksV2[0].id,instanceMode:"repeat",repeatRule:{basis:"calendar_day",every:30},startDateISO:date};state.maintenanceCalendarInstancesV2.push(instance);const before=clone(state);
  const row={id:`repeat:${instance.id}:${date}`,type:"v2repeat",instanceId:instance.id,taskId:instance.taskId,dateISO:date,name:"Mixing tube rotation",status:"manual",mode:"repeat_v2",repeatView:{rootOccurrenceId:`repeat:${instance.id}:${date}`,instanceId:instance.id,taskId:instance.taskId,repeatBasis:"calendar_day"}};
  assert.doesNotMatch(chips([row])[0].className,/is-complete/);const report=integrity.inspect(state,{dateISO:date,projectedRepeatRows:[row]});assert.equal(report.totals.recurringScheduled,1);assert.deepEqual(state,before);
});
test("completion for a different instance/task cannot complete an otherwise linked root",()=>{
  const state=recovery(),root=state.maintenanceOccurrencesV2.find(row=>row.eventType==="scheduled"),completed=state.maintenanceOccurrencesV2.find(row=>row.eventType==="completed");completed.instanceId="other";
  assert.equal(integrity.resolveOneTime(state,root.id,root).status,"scheduled");assert.equal(integrity.inspect(state,{dateISO:date}).totals.completedWithoutScheduledRoot,1);
});
test("latest equal-time native action wins and completion labor survives a later move",()=>{
  const state=recovery(),root=state.maintenanceOccurrencesV2.find(row=>row.eventType==="scheduled");
  for(const event of state.maintenanceOccurrencesV2)event.recordedAtISO="2026-10-01T00:00:00Z";
  state.maintenanceOccurrencesV2.unshift({...maintenance.lifecycleEvent(root,{eventId:"complete-new",eventType:"completed",recordedAtISO:stamp})},{...maintenance.lifecycleEvent(root,{eventId:"incomplete-old",eventType:"uncompleted",recordedAtISO:stamp})});
  assert.equal(integrity.resolveOneTime(state,root.id,root).status,"completed");
  state.maintenanceOccurrencesV2.unshift(maintenance.lifecycleEvent(root,{eventId:"incomplete-new",eventType:"uncompleted",recordedAtISO:stamp}));assert.equal(integrity.resolveOneTime(state,root.id,root).status,"scheduled");
  state.maintenanceOccurrencesV2.unshift(maintenance.lifecycleEvent(root,{eventId:"recomplete",eventType:"completed",recordedAtISO:stamp}));
  state.maintenanceOccurrencesV2.unshift(maintenance.lifecycleEvent(root,{eventId:"move",eventType:"moved",recordedAtISO:"2026-10-03T00:00:00Z",payload:{toDateISO:"2026-07-15"}}));
  const view=integrity.resolveOneTime(state,root.id,root);assert.equal(view.status,"completed");assert.equal(view.displayDateISO,"2026-07-15");assert.equal(view.hours,5/60);
  assert.equal(integrity.inspect(state,{dateISO:"2026-07-15"}).totals.completedWithScheduledRoot,3);
});
test("reporting callers with root/date stubs resolve stored identity; explicitly scoped orphan reporting stays intact",()=>{
  const state=recovery(),root=state.maintenanceOccurrencesV2.find(row=>row.eventType==="scheduled");assert.equal(integrity.resolveOneTime(state,root.id,{id:root.id,effectiveDateISO:date}).status,"completed");
  const completed=state.maintenanceOccurrencesV2.find(row=>row.eventType==="completed");state.maintenanceOccurrencesV2=state.maintenanceOccurrencesV2.filter(row=>row.eventType!=="scheduled");
  assert.equal(integrity.resolveOneTime(state,root.id,{id:root.id,effectiveDateISO:date,instanceId:completed.instanceId,taskId:completed.taskId}).status,"completed");assert.equal(project(state).rows[date],undefined);assert.equal(integrity.inspect(state).totals.completedWithoutScheduledRoot,1);
});
test("bounded read-only diagnostics surface orphan, duplicate completion and unreferenced instance without repair",()=>{
  const state=recovery(),completion=state.maintenanceOccurrencesV2.find(row=>row.eventType==="completed");state.maintenanceOccurrencesV2.push({...clone(completion),id:"duplicate"},{...clone(completion),id:"orphan",rootOccurrenceId:"absent",supersedesEventId:"absent",instanceId:"absent-instance"});state.maintenanceCalendarInstancesV2.push({id:"empty-instance",instanceMode:"one_time",startDateISO:date});const before=clone(state),report=integrity.inspect(state,{dateISO:date,limit:1});
  assert.equal(report.totals.duplicateCompleted,1);assert.equal(report.totals.completedWithoutScheduledRoot,1);assert.equal(report.totals.orphanedInstances,2);assert.equal(report.rows.length,1);assert.equal(report.truncated,true);assert.ok(report.warnings.length);assert.deepEqual(state,before);assert.ok(JSON.stringify(report).length<12000);
});
function harness(options={}){
  const window=clone(options.initial||initial()),messages=[];let cloud=clone(window),saves=0,commits=0,suspends=0,serial=0,checkpointRestores=0,undo=["before"],backup=clone(window);
  window.OMAXMaintenanceRecoveryImport=maintenance;window.OMAXMaintenanceCalendarIntegrity=integrity;
  const snapshot=()=>clone(Object.fromEntries(Object.entries(window).filter(([key])=>!key.startsWith("__")&&!key.startsWith("OMAX")&&typeof window[key]!=="function")));
  const context=vm.createContext({window,console,normalizeDateKey:value=>value?String(value).slice(0,10):null,ymd:value=>typeof value==="string"?value:date,genId:name=>`${name}_${++serial}`,recordMaintenanceV2MutationSource(){},renderCalendar:()=>{const view=project(snapshot());window.__calendarV2OneTimeLookup=view.window.__calendarV2OneTimeLookup;},toast:message=>messages.push(message)});
  vm.runInContext(renderer.slice(renderer.indexOf("function ensureMaintenanceV2Collections"),renderer.indexOf("if (window.DEBUG_MODE){",renderer.indexOf("window.createMaintenanceV2FromTemplate ="))),context);
  vm.runInContext(calendar.slice(calendar.indexOf("function getV2OneTimeOccurrenceView"),calendar.indexOf("function makeV2RepeatOccurrenceKey"))+calendar.slice(calendar.indexOf("async function appendV2OccurrenceEvent"),calendar.indexOf("function triggerDashboardAddPicker")),context);
  const db={runTransaction:async callback=>{let next;if(options.race)cloud.syncMeta.rev++;await callback({get:async()=>({exists:true,data:()=>clone(cloud)}),set:(_ref,state)=>{next=clone(state);}});if(options.failure)throw Object.assign(Error("denied"),{code:"permission-denied"});cloud=next;commits++;}};
  const env={state:snapshot,readCloud:async()=>{options.read?.(cloud,commits);return clone(cloud);},loadedRevision:()=>window.syncMeta.rev,canWrite:()=>!suspends,apply:(key,value)=>{window[key]=clone(value);},checkpoint:()=>({undo:clone(undo),backup:clone(backup)}),restoreCheckpoint:checkpoint=>{undo=checkpoint.undo;backup=snapshot();checkpointRestores++;},suspend:()=>{suspends++;},save:async saveOptions=>{saves++;undo.push("partial");backup=snapshot();if(options.throwSave)throw Error("unknown write");if(options.pause)await options.pause();const result=await atomic.save({db,docRef:{path:"fixture"},state:snapshot(),expectedRevision:saveOptions.expectedRevision,scan:firewall.scanCuttingFileContent,clientId:"fixture",now:()=>100+saves});if(result.saved)window.syncMeta=clone(result.committedState.syncMeta);return result;}};
  window.runMaintenanceCalendarMutation=integrity.createMutationRunner(env);
  return{window,context,env,run:window.runMaintenanceCalendarMutation,snapshot,get cloud(){return clone(cloud);},get saves(){return saves;},get commits(){return commits;},get suspends(){return suspends;},get checkpointRestores(){return checkpointRestores;},get backup(){return clone(backup);},get undo(){return clone(undo);},messages,add:opts=>window.runMaintenanceCalendarMutation(()=>window.createMaintenanceV2FromTemplate(window.tasksInterval[0],{mode:"one_time",eventType:"scheduled",effectiveDateISO:date,hours:5/60,...opts}))};
}
test("native one-time add/complete saves narrowly with CAS, labor and reload stable; repeated actions do not duplicate",async()=>{
  const h=harness(),before=h.snapshot(),added=await h.add();assert.equal(added.saved,true);const root=added.created.occurrence;
  const completed=await h.context.appendV2OccurrenceEvent(root.id,"completed",{},root.id);assert.equal(completed,true);assert.equal(h.commits,2);const after=h.cloud,view=project(after);assert.equal(view.rows[date][0].status,"completed");assert.equal(view.window.__calendarV2OneTimeLookup[root.id].hours,5/60);
  for(const key of Object.keys(before).filter(key=>!maintenance.keys.includes(key)&&key!=="syncMeta"))assert.deepEqual(after[key],before[key],key);
  await h.add();await h.context.appendV2OccurrenceEvent(root.id,"completed",{},root.id);assert.equal(h.commits,2);assert.equal(h.cloud.maintenanceCalendarInstancesV2.length,1);assert.equal(h.cloud.maintenanceOccurrencesV2.length,2);
});
test("native completed one-time creation has a scheduled root instead of a hidden standalone completion",async()=>{
  const h=harness(),result=await h.add({eventType:"completed"});assert.equal(result.saved,true);const state=h.cloud;assert.equal(state.maintenanceOccurrencesV2.length,2);assert.equal(state.maintenanceCalendarInstancesV2.length,1);assert.equal(project(state).rows[date][0].status,"completed");assert.equal(integrity.inspect(state).totals.completedWithoutScheduledRoot,0);
});
test("removed lifecycle and slug collisions get new IDs without changing existing records",async()=>{
  const h=harness(),first=await h.add(),root=first.created.occurrence;await h.context.appendV2OccurrenceEvent(root.id,"removed",{},root.id);const existing=clone(h.cloud.maintenanceOccurrencesV2),second=await h.add();assert.equal(second.saved,true);assert.notEqual(second.created.instance.id,first.created.instance.id);for(const row of existing)assert.deepEqual(h.cloud.maintenanceOccurrencesV2.find(event=>event.id===row.id),row);
});
test("distinct legacy IDs with the same stable slug cannot create duplicate instance IDs",async()=>{
  const data=initial();data.tasksInterval[0].id="a-b";data.tasksInterval.push({...clone(data.tasksInterval[0]),id:"a_b"});const h=harness({initial:data}),first=await h.add(),second=await h.run(()=>h.window.createMaintenanceV2FromTemplate(h.window.tasksInterval[1],{mode:"one_time",eventType:"scheduled",effectiveDateISO:date}));
  assert.equal(first.saved,true);assert.equal(second.saved,true);assert.notEqual(first.created.instance.id,second.created.instance.id);assert.equal(new Set(h.cloud.maintenanceCalendarInstancesV2.map(row=>row.id)).size,2);
});
test("a new manual one-time reminder does not reuse or overwrite a same-date recovery lifecycle",async()=>{
  const h=harness({initial:recovery()}),before=h.cloud,result=await h.add();assert.equal(result.saved,true);assert.equal(h.cloud.maintenanceCalendarInstancesV2.length,2);for(const key of maintenance.keys)for(const row of before[key])assert.deepEqual(h.cloud[key].find(value=>value.id===row.id),row);
});
test("labor edits persist and completing after uncompletion appends the new lifecycle action",async()=>{
  const h=harness(),added=await h.add(),root=added.created.occurrence;await h.context.appendV2OccurrenceEvent(root.id,"hours_set",{hours:0.25},root.id);await h.context.appendV2OccurrenceEvent(root.id,"hours_set",{hours:5/60},root.id);await h.context.appendV2OccurrenceEvent(root.id,"completed",{},root.id);await h.context.appendV2OccurrenceEvent(root.id,"uncompleted",{},root.id);await h.context.appendV2OccurrenceEvent(root.id,"completed",{},root.id);
  const view=project(h.cloud).window.__calendarV2OneTimeLookup[root.id];assert.equal(view.status,"completed");assert.equal(view.hours,5/60);
});
for(const [name,options]of [["stale CAS revision",{race:true}],["definite permission rejection",{failure:true}]])test(`${name} rolls back only local additions and restores undo/backup without resurrecting a partial lifecycle`,async()=>{
  const h=harness(options),before=h.snapshot(),result=await h.add();assert.equal(result.saved,false);assert.equal(result.rollbackCompleted,true);assert.equal(h.commits,0);assert.deepEqual(h.snapshot(),before);assert.deepEqual(h.backup,before);assert.deepEqual(h.undo,["before"]);assert.equal(h.checkpointRestores,1);assert.equal(h.suspends,0);
  const restored=h.backup;assert.equal(restored.maintenanceOccurrencesV2.length,0);assert.equal(project(restored).rows[date],undefined);
});
test("failed completion cannot silently announce success or leave an unsaved event",async()=>{
  const h=harness(),added=await h.add(),before=h.snapshot();h.env.save=async()=>({saved:false,stateWriteAttempted:false,error:"blocked"});const saved=await h.context.appendV2OccurrenceEvent(added.created.occurrence.id,"completed",{},added.created.occurrence.id);assert.equal(saved,false);assert.deepEqual(h.snapshot(),before);assert.ok(h.messages.includes("blocked"));assert.equal(project(h.cloud).rows[date][0].status,"manual");
});
test("thrown/ambiguous save preserves evidence and suspends without retry or rollback",async()=>{
  const h=harness({throwSave:true}),result=await h.add();assert.equal(result.indeterminate,true);assert.equal(h.suspends,1);assert.equal(h.saves,1);assert.equal(h.checkpointRestores,0);assert.equal(h.snapshot().maintenanceCalendarInstancesV2.length,1);
});
test("committed protected-field or maintenance readback drift suspends without deleting committed evidence",async()=>{
  for(const mutate of [state=>{state.inventory[0].qtyNew++;},state=>{state.maintenanceOccurrencesV2[0].payload.hours=9;}]){
    const h=harness({read:(state,commits)=>{if(commits)mutate(state);}}),result=await h.add();assert.equal(result.indeterminate,true);assert.equal(h.suspends,1);assert.equal(h.commits,1);assert.equal(h.checkpointRestores,0);
  }
});
test("unexpected reusable-task mutation fails closed and preserves evidence",async()=>{
  const h=harness(),result=await h.run(()=>{h.window.tasksInterval[0].recurrence.every=1;return true;});assert.equal(result.saved,false);assert.equal(h.saves,0);assert.equal(h.suspends,1);assert.equal(h.window.tasksInterval[0].recurrence.every,1);
});
test("concurrent manual submission cannot duplicate an occurrence while its save is pending",async()=>{
  let resume;const pause=new Promise(resolve=>{resume=resolve;}),h=harness({pause:()=>pause}),first=h.add();await new Promise(resolve=>setImmediate(resolve));const second=await h.add();assert.equal(second.saved,false);resume();assert.equal((await first).saved,true);assert.equal(h.commits,1);assert.equal(h.cloud.maintenanceCalendarInstancesV2.length,1);
});
test("production wiring awaits one-time coordinator and protects server/revision/restore integration",()=>{
  assert.match(core,/window\.runMaintenanceCalendarMutation = window\.OMAXMaintenanceCalendarIntegrity\.createMutationRunner/);assert.match(core,/save:options=>saveCloudNow\(options\)/);assert.match(core,/undoStack\.splice\(0,undoStack\.length,\.\.\.checkpoint\.undo\)/);assert.match(core,/persistLocalStateBackup\(snapshotState\(\{skipLocalFileCacheSync:true\}\)\)/);
  assert.equal((renderer.match(/await window\.runMaintenanceCalendarMutation\(/g)||[]).length,2);assert.match(renderer,/outcome\?\.saved!==true\|\|outcome\?\.stateWriteCompleted!==true/);assert.match(calendar,/if \(await appendV2OccurrenceEvent/);assert.ok(fs.readFileSync("index.html","utf8").indexOf('src="js/maintenanceCalendarIntegrity.js"')<fs.readFileSync("index.html","utf8").indexOf('src="js/core.js"'));
});
test("real core rollback checkpoint removes rejected action from undo and local backup",async()=>{
  const window={...initial(),__loadedCloudRevisionForSaveGuard:7,OMAXMaintenanceCalendarIntegrity:integrity};let backup=clone(initial());const cloud=clone(initial());
  const snapshot=()=>clone(Object.fromEntries(Object.entries(window).filter(([key])=>!key.startsWith("OMAX")&&!key.startsWith("__")&&typeof window[key]!=="function")));
  const context=vm.createContext({window,undoStack:["before"],redoStack:["redo"],currentSnapshotJSON:"before",compactStateForStorage:clone,snapshotState:snapshot,readCurrentCloudStateReadOnly:async()=>clone(cloud),canWriteCloud:()=>true,refreshGlobalCollections(){},persistLocalStateBackup:state=>{backup=clone(state);},renderRecoveryDiagnosticsPanel(){},saveCloudNow:async()=>{context.undoStack.push("partial");context.redoStack.length=0;context.currentSnapshotJSON="partial";backup=snapshot();return{saved:false,stateWriteAttempted:false,error:"blocked"};}});
  vm.runInContext(core.slice(core.indexOf("window.runMaintenanceCalendarMutation ="),core.indexOf("window.historicalImport =")),context);
  const result=await window.runMaintenanceCalendarMutation(()=>{window.maintenanceTasksV2.push({id:"new-task"});window.maintenanceCalendarInstancesV2.push({id:"new-instance",taskId:"new-task",instanceMode:"one_time",repeatRule:null});window.maintenanceOccurrencesV2.push({id:"new-root",taskId:"new-task",instanceId:"new-instance",eventType:"scheduled",effectiveDateISO:date});return true;});
  assert.equal(result.rollbackCompleted,true);assert.deepEqual(context.undoStack,["before"]);assert.deepEqual(context.redoStack,["redo"]);assert.equal(context.currentSnapshotJSON,"before");assert.deepEqual(backup,cloud);assert.deepEqual(snapshot(),cloud);
  const readOnly=window.inspectMaintenanceCalendarIntegrity({dateISO:date});assert.equal(readOnly.totals.scheduledOnly,0);assert.deepEqual(snapshot(),cloud);
});
test("explicit add-save wrapper cannot treat an existing remote ID as confirmation of a rejected save",async()=>{
  const window={...initial(),__loadedCloudRevisionForSaveGuard:7},created={taskRecord:{id:"task"},instance:{id:"instance"},occurrence:{id:"root",effectiveDateISO:date}};let remoteReads=0;
  const context=vm.createContext({window,FB:{ready:true,docRef:{get:async()=>{remoteReads++;return{exists:true,data:()=>({maintenanceCalendarInstancesV2:[created.instance],maintenanceOccurrencesV2:[created.occurrence]})};}}},saveCloudNow:async options=>{assert.equal(options.expectedRevision,7);return{saved:false,stateWriteCompleted:false,error:"revision conflict"};}});
  const start=renderer.indexOf("  async function persistExplicitMaintenanceAddSave"),end=renderer.indexOf("  if (window.DEBUG_MODE && typeof window.debugExplicitMaintenanceAddSaveTrace",start);
  vm.runInContext(renderer.slice(start,end)+";this.save=persistExplicitMaintenanceAddSave",context);const trace=await context.save("fixture",created);
  assert.equal(trace.remoteVerificationPassed,false);assert.equal(trace.saveThrewError,"revision conflict");assert.equal(remoteReads,0);assert.equal(window.__loadedCloudRevisionForSaveGuard,7);
});
