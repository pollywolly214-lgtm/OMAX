"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const history=require("../js/historicalImport"),maintenance=require("../js/maintenanceRecoveryImport"),workbooks=require("../js/recoveryWorkbook"),xlsx=require("../assets/vendor/cji-xlsx-parser"),fixtures=require("./fixtures/recovery-workbooks"),firewall=require("../js/cuttingFileContentFirewall"),identity=require("../js/globalIdentityRepair");
const clone=structuredClone,S=history.STATUS;
const initial=()=>({syncMeta:{rev:1},inventory:[],receiptTrackerWeeks:[],totalHistory:[{dateISO:"2026-01-01",hours:100,note:"keep"}],pumpEff:{entries:[],baselineRPM:3500,notes:[]},tasksInterval:[{id:"nozzle",name:"Nozzle Nut",downtimeHours:0.75,price:3.1,interval:100,recurrenceEvery:100,manualHistory:[],completedDates:[]}],tasksAsReq:[],maintenanceTasksV2:[],maintenanceCalendarInstancesV2:[],maintenanceOccurrencesV2:[],appConfig:{keep:true},cuttingJobs:[],completedCuttingJobs:[]});
const purchase={import_event_id:"purchase-1",source_id:"purchase",source_record_id:"line-1",date:"2025-01-03",purchased:"Filter",qty:2,cost:12.5,partnumber:"0010",shipping:2.31,tax:0.17,review_status:"reviewed",source_text:"paper line"};
const rpm={import_event_id:"rpm-1",source_id:"rpm",source_record_id:"line-1",date:"2025-01-03",rpm:3400,timeiso:"12:00",time_source:"unknown_source_time_placeholder_noon",source_page:"1",source_line:"2",source_text:"3400",review_status:"reviewed",review_notes:"time unknown"};
const hours={import_event_id:"hours-1",source_id:"hours",source_record_id:"line-1",date:"2025-01-03",hours:90,source_page:"1",source_line:"2",source_text:"90",review_status:"reviewed",review_notes:""};
const event=(id="event-1",extra={})=>({import_event_id:id,event_date:"2025-01-03",route:"existing_task",event_name:"Nozzle Nut",exact_existing_task:"Nozzle Nut",calendar_mode:"one_time",mark_completed:true,labor_minutes:5,parts_cost_snapshot:3.1,part_number_snapshot:"0001",source_kind:"shop_log",source_page:"1",source_line:"2",source_text:"replaced nozzle nut",review_status:"reviewed",review_notes:"",...extra});
const checklistHeaders=["task_setup_id","task_name","task_type","part_number","parts_cost","default_labor_minutes","category","setup_status","setup_notes","verified_in_site"];
const checklist={task_setup_id:"setup-1",task_name:"Nozzle Nut",task_type:"interval",part_number:"0001",parts_cost:3.1,default_labor_minutes:45,category:"Pump",setup_status:"reviewed",setup_notes:"verified",verified_in_site:"true"};
const sheet=(kind,rows)=>({name:workbooks.contracts[kind].sheet,headers:[...workbooks.contracts[kind].required,...new Set(rows.flatMap(row=>Object.keys(row)).filter(key=>!workbooks.contracts[kind].required.includes(key)))],rows});
function harness(options={}){
  const local=initial();let cloud=clone(local),rev=1,saves=0,backups=0,reads=0,suspended=false;
  const env={state:()=>clone(local),canWrite:()=>!suspended,loadedRevision:()=>rev,scan:firewall.scanCuttingFileContent,readCloud:async()=>{reads++;if(options.readFailure&&reads>1)throw Error("read failed");return clone(cloud);},backup:async snapshot=>{backups++;assert.deepEqual(snapshot,cloud);return options.backup!==false;},apply:(key,value)=>{local[key]=value;},save:async()=>{saves++;if(options.save)return options.save(local);cloud=clone(local);cloud.syncMeta.rev++;rev=cloud.syncMeta.rev;local.syncMeta=clone(cloud.syncMeta);if(options.tamper)options.tamper(cloud);return{saved:true,stateWriteAttempted:true,stateWriteCompleted:true};},suspend:()=>{suspended=true;}};
  const api=history.createApi(env);
  return{api,local,get cloud(){return cloud;},get saves(){return saves;},get backups(){return backups;},get suspended(){return suspended;},alter(fn){fn(local,cloud);},submit:(kind,rows)=>api.submit(kind,rows,{confirmed:true,reviewedPreview:api.preview(kind,rows)})};
}
test("purchase compressed XLSX uses reconciliation, exact allocations/provenance and no inventory replay",async()=>{
  const rows=await workbooks.parseFile("purchase",fixtures.file("Purchase_History_Import.xlsx",[sheet("purchase",[purchase])]),xlsx),h=harness(),before=clone(h.local.inventory);
  assert.equal(rows[0].partNumber,"0010");assert.equal(rows[0].qty,2);assert.equal(h.api.preview("purchase",rows)[0].status,S.missing);
  assert.equal(history.preview("purchase",[{...purchase,partNumber:"0010"}],h.local)[0].status,S.missing);
  assert.equal((await h.submit("purchase",rows)).saved,true);const saved=h.cloud.receiptTrackerWeeks[0].rows[0];
  assert.equal(saved.shipping,2.31);assert.equal(saved.tax,.17);assert.equal(saved.importProvenance.sourceRecord.source_text,"paper line");assert.deepEqual(h.cloud.inventory,before);
  assert.equal(h.api.preview("purchase",rows)[0].status,S.present);await h.submit("purchase",rows);assert.equal(h.saves,1);
  assert.equal(h.api.preview("purchase",[{...rows[0],import_event_id:"new",review_status:"needs_review"}])[0].status,S.problem);
});
test("RPM workbook retains unknown time, accepts exact Excel noon and reviews same-day collisions",async()=>{
  const rows=await workbooks.parseFile("pump",fixtures.file("Pump_History_Import.xlsx",[sheet("pump",[{...rpm,timeiso:.5}]),sheet("pump_hours",[hours])]),xlsx),h=harness();
  assert.equal(rows[0].timeISO,"12:00");assert.equal((await h.submit("pump",rows)).saved,true);
  const saved=h.cloud.pumpEff.entries[0];assert.equal(saved.importProvenance.sourceTimeKnown,false);assert.equal(saved.importProvenance.timeSource,rpm.time_source);assert.equal(saved.importProvenance.sourceRecord.time_source,rpm.time_source);
  assert.equal(h.api.preview("pump",[{...rows[0],import_event_id:"collision",source_record_id:"other"}])[0].status,S.match);
  assert.equal(h.api.preview("pump",[{...rows[0],review_status:"needs_review"}])[0].status,S.problem);
});
test("pump hours workbook appends in order, reviews same-date totals and repeated source tuples, reruns without writes",async()=>{
  const rows=await workbooks.parseFile("pump_hours",fixtures.file("Pump_History_Import.xlsx",[sheet("pump",[rpm]),sheet("pump_hours",[hours])]),xlsx),h=harness();
  assert.equal((await h.submit("pump_hours",rows)).saved,true);assert.deepEqual(h.cloud.totalHistory.map(r=>r.dateISO),["2025-01-03","2026-01-01"]);assert.equal(h.cloud.totalHistory[0].import_event_id,hours.import_event_id);assert.equal(h.cloud.totalHistory[1].note,"keep");
  assert.equal(h.api.preview("pump_hours",rows)[0].status,S.present);await h.submit("pump_hours",rows);assert.equal(h.saves,1);
  for(const value of [100,101])assert.equal(h.api.preview("pump_hours",[{...hours,import_event_id:"new",date:"2026-01-01",hours:value}])[0].status,S.match);
  const repeated=[hours,{...hours,import_event_id:"different",date:"2025-02-03"}];assert.ok(h.api.preview("pump_hours",repeated).every(row=>row.status===S.problem));
  assert.equal(h.api.preview("pump_hours",[{...hours,review_status:"needs_review"}])[0].status,S.problem);
});
test("maintenance three-sheet workbook previews separate checklist and rejects unsupported routes/review/lifecycle",async()=>{
  const payload=await workbooks.parseFile("maintenance",fixtures.file("Maintenance_Import_v2.xlsx",[sheet("maintenance",[{...event(),mark_completed:"true"}]),{name:"Task Creation Checklist",headers:checklistHeaders,rows:[checklist]},{name:"Import Gate",headers:["check","status"],rows:[{check:"Task setup",status:"reviewed"}]}]),xlsx),h=harness(),before=clone(h.local);
  const plan=h.api.preview("maintenance",payload);assert.equal(plan[0].status,S.missing);assert.equal(plan[0].checklist[0].status,"Found exactly once");assert.deepEqual(h.local,before);assert.equal(payload.gate[0].check,"Task setup");assert.equal((await h.submit("maintenance",payload)).saved,true);
  for(const extra of [{route:"new_saved_task"},{calendar_mode:"repeat"},{mark_completed:false},{review_status:"needs_review"},{labor_minutes:"5 minutes"},{event_date:"9999-01-01"}])assert.equal(history.preview("maintenance",[event("bad",extra)],initial())[0].status,S.problem);
  for(const extra of [{verified_in_site:"false"},{setup_status:"needs_review"},{task_name:"Missing"}])assert.equal(history.preview("maintenance",{events:[event()],checklist:[{...checklist,...extra}]},initial())[0].status,S.problem);
});
test("maintenance exact saved task lookup blocks missing, duplicate and fuzzy names",()=>{
  for(const name of ["nozzle nut","Nozzle Nut ","Missing"])assert.equal(history.preview("maintenance",[event("x",{exact_existing_task:name})],initial())[0].status,S.problem);
  const state=initial();state.tasksAsReq.push({...clone(state.tasksInterval[0]),id:"other"});assert.equal(history.preview("maintenance",[event()],state)[0].status,S.problem);
  const instances=initial();instances.tasksAsReq.push({id:"calendar-instance",name:"Nozzle Nut",templateId:"nozzle"});assert.equal(history.preview("maintenance",[event()],instances)[0].status,S.missing,"Calendar instances are not saved Settings tasks");
  assert.ok(history.preview("maintenance",[event(),event()],initial()).every(row=>row.status===S.problem));
});
test("multiple maintenance events reuse one Settings task, exact 5/10-minute labor, calendar-only parts and zero recurrence",async()=>{
  const h=harness(),tasks=clone(h.local.tasksInterval),events=[event(),event("event-2",{event_date:"2025-02-03",labor_minutes:10}),event("switch",{route:"calendar_only",event_name:"Replace charge pump switch",exact_existing_task:"",labor_minutes:45,parts_cost_snapshot:250}),event("seal",{route:"calendar_only",event_name:"Replace inlet body nozzle seal",exact_existing_task:"",labor_minutes:10,parts_cost_snapshot:3.1})];
  const result=await h.submit("maintenance",events);assert.equal(result.saved,true);assert.deepEqual(h.cloud.tasksInterval,tasks);assert.equal(h.cloud.tasksAsReq.length,0);assert.equal(h.cloud.maintenanceTasksV2.filter(r=>r.legacyTaskId==="nozzle").length,1);assert.equal(h.cloud.maintenanceTasksV2.filter(r=>r.reusable===false).length,2);
  assert.ok(h.cloud.maintenanceCalendarInstancesV2.every(r=>r.instanceMode==="one_time"&&r.repeatRule===null));assert.equal(h.cloud.maintenanceOccurrencesV2.length,8);assert.equal(result.maintenanceCounts.repeatChainsAdded,0);assert.equal(result.maintenanceCounts.futureProjectionsAdded,0);
  assert.deepEqual(h.cloud.maintenanceOccurrencesV2.filter(r=>r.eventType==="completed").map(r=>r.loggedHours*60),[5,10,45,10]);assert.equal(h.cloud.maintenanceOccurrencesV2.find(r=>r.import_event_id==="switch").partsCostSnapshot,250);
  assert.ok(h.api.preview("maintenance",events).every(r=>r.status===S.present));await h.submit("maintenance",events);assert.equal(h.saves,1);
  assert.deepEqual(identity.preview(h.cloud).blockers,[],"Native global identity/FK gate accepts all recovery records");
});
test("maintenance reliable saved duration is used only when blank; absent duration blocks",()=>{
  const row=event("default",{labor_minutes:""});assert.equal(history.preview("maintenance",[row],initial())[0].hours,.75);
  const state=initial();delete state.tasksInterval[0].downtimeHours;assert.equal(history.preview("maintenance",[row],state)[0].status,S.problem);
  assert.equal(history.preview("maintenance",[event("calendar",{route:"calendar_only",exact_existing_task:"",labor_minutes:""})],initial())[0].status,S.problem);
});
test("recovery uses real native one-time resolver and cost compatibility stream",async()=>{
  const h=harness();await h.submit("maintenance",[event("seal",{route:"calendar_only",exact_existing_task:"",event_name:"Replace seal",labor_minutes:10,parts_cost_snapshot:3.1})]);
  const core=fs.readFileSync("js/core.js","utf8"),calendar=fs.readFileSync("js/calendar.js","utf8"),context=vm.createContext({window:{...clone(h.cloud),OMAXMaintenanceCalendarIntegrity:require("../js/maintenanceCalendarIntegrity")},console,normalizeDateISO:v=>v||null,normalizeDateKey:v=>v||null});
  vm.runInContext(core.slice(core.indexOf("function detectMaintenanceRecordSystem"),core.indexOf("function runMaintenanceV2SafetyChecks"))+";this.stream=buildMaintenanceCompatibilityStream",context);
  const start=calendar.indexOf("function resolveV2OneTimeOccurrenceState(");vm.runInContext(calendar.slice(start,calendar.indexOf("window.completeV2OneTimeOccurrence",start))+";this.resolve=resolveV2OneTimeOccurrenceState",context);
  const base=h.cloud.maintenanceOccurrencesV2.find(r=>r.eventType==="scheduled");assert.equal(context.resolve(base.id,base).status,"completed");assert.equal(context.resolve(base.id,base).hours,10/60);
  const row=context.stream().find(r=>r.sourceSystem==="v2");assert.equal(row.isCompleted,true);assert.equal(row.loggedHours,10/60);assert.equal(row.costRef,3.1);assert.equal(row.calendarOnly,true);assert.equal(row.loggedHours*30+row.costRef,8.1);
  const renderer=fs.readFileSync("js/renderers.js","utf8"),report=vm.createContext({window:{buildMaintenanceCompatibilityStream:()=>[row],resolveV2OneTimeOccurrenceState:context.resolve},console,Date,maintenanceDataTableRows:[],MAINTENANCE_LABOR_RATE_PER_HOUR:30,toHistoryDateKey:v=>v||null,resolveCategoryPath:v=>v,parseDateLocal:v=>new Date(v+"T00:00:00Z")});
  const reportStart=renderer.indexOf('  const compatibilityRows = typeof window.buildMaintenanceCompatibilityStream');
  vm.runInContext(renderer.slice(reportStart,renderer.indexOf('  taskDateGroups.forEach',reportStart)),report);
  const centralStart=renderer.indexOf('  const centralMaintenanceRows = maintenanceDataTableRows');vm.runInContext(renderer.slice(centralStart,renderer.indexOf('  const centralTotals',centralStart))+";this.central=centralMaintenanceRows",report);
  const trendStart=renderer.indexOf('  const maintenanceTrendRows = maintenanceDataTableRows');vm.runInContext(renderer.slice(trendStart,renderer.indexOf('  const maintenanceCostByDate',trendStart))+";this.trends=maintenanceTrendRows",report);
  assert.equal(report.central.length,1);assert.equal(report.trends.length,1);assert.equal(report.central[0].totalCost,8.1);assert.equal(report.central[0].settingsLink,"");
});
test("real totalHistory save merge preserves identity/provenance and compact storage keeps over 500 rows",()=>{
  const source=fs.readFileSync("js/core.js","utf8"),context=vm.createContext({normalizeDateISO:v=>v||null,sanitizeValueForStorage:v=>v});
  vm.runInContext(source.slice(source.indexOf("function mergeTotalHistoryForSave"),source.indexOf("function mergeDailyCutHoursForSave"))+";this.merge=mergeTotalHistoryForSave",context);
  const entry={dateISO:"2025-01-03",hours:90,import_event_id:"permanent",importProvenance:{sourceRecord:{source_text:"paper"}}};assert.deepEqual(clone(context.merge([entry],[])),[entry]);
  vm.runInContext(source.slice(source.indexOf("function compactStateForStorage"),source.indexOf("function compactStateForStorage")+source.slice(source.indexOf("function compactStateForStorage")).indexOf("\nfunction ",1))+";this.compact=compactStateForStorage",context);
  assert.equal(context.compact({totalHistory:Array.from({length:501},()=>entry)}).totalHistory.length,501);
});
for(const kind of ["maintenance","pump_hours"]){
  const rows=kind==="maintenance"?[event()]:[hours];
  test(`${kind} rollback preserves unrelated concurrent edits and removes only introduced records`,async()=>{
    const h=harness({save:async state=>{state.appConfig.keep="edited";state.totalHistory.find(r=>r.dateISO==="2026-01-01").note="edited";state.maintenanceOccurrencesV2.push({id:"concurrent",note:"keep"});state.tasksInterval[0].name="Edited task";return{saved:false,stateWriteAttempted:true,stateWriteCompleted:false,definiteFailure:true,error:"rejected"};}});
    const result=await h.submit(kind,rows);assert.equal(result.rollbackCompleted,true);assert.equal(h.local.appConfig.keep,"edited");assert.equal(h.local.totalHistory.length,1);assert.equal(h.local.totalHistory[0].note,"edited");assert.equal(h.local.tasksInterval[0].name,"Edited task");assert.deepEqual(h.local.maintenanceOccurrencesV2,[{id:"concurrent",note:"keep"}]);assert.equal(h.local.maintenanceTasksV2.length,0);assert.equal(h.local.maintenanceCalendarInstancesV2.length,0);
  });
  test(`${kind} indeterminate result or thrown save suspends writes without retry/rollback`,async()=>{
    for(const save of [async()=>({saved:false,stateWriteAttempted:true,indeterminate:true}),async()=>{throw Error("unknown transport outcome");}]){
      const h=harness({save}),result=await h.submit(kind,rows);assert.equal(result.indeterminate,true);assert.equal(h.suspended,true);assert.equal(result.rollbackCompleted,false);assert.equal(h.saves,1);await h.submit(kind,rows);assert.equal(h.saves,1);
    }
  });
  test(`${kind} committed read-back mismatch suspends and retains evidence`,async()=>{
    const h=harness({tamper:cloud=>{cloud.appConfig.keep="changed";}}),result=await h.submit(kind,rows);assert.equal(result.saveCompleted,true);assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.equal(h.suspended,true);assert.equal(result.rollbackCompleted,false);
  });
}
test("changed recovery event or concurrently referenced descriptor prevents all rollback deletion",async()=>{
  for(const mode of ["edit","reference"]){
    const h=harness({save:async state=>{if(mode==="edit")state.maintenanceOccurrencesV2[0].note="edited";else state.maintenanceCalendarInstancesV2.push({id:"concurrent",taskId:state.maintenanceTasksV2[0].id});return{saved:false,definiteFailure:true,error:"rejected"};}}),result=await h.submit("maintenance",[event()]);
    assert.equal(result.rollbackReviewRequired,true);assert.equal(h.suspended,true);assert.equal(h.local.maintenanceOccurrencesV2.length,2);assert.equal(h.local.maintenanceTasksV2.length,1);
  }
});
test("backup failure, changed reviewed preview or cloud revision blocks before recovery staging",async()=>{
  const h=harness({backup:false});assert.equal((await h.submit("maintenance",[event()])).backupCreated,false);assert.equal(h.local.maintenanceOccurrencesV2.length,0);assert.equal(h.saves,0);
  const changed=harness(),rows=[event()],plan=changed.api.preview("maintenance",rows);rows[0].labor_minutes=10;const result=await changed.api.submit("maintenance",rows,{confirmed:true,reviewedPreview:plan});assert.match(result.error,/preview/);assert.equal(changed.saves,0);
  const stale=harness();stale.alter((local,cloud)=>cloud.syncMeta.rev++);assert.match((await stale.submit("pump_hours",[hours])).error,/baseline/);assert.equal(stale.saves,0);
});
test("cutting recovery columns retain actual manual minutes separate from estimates and reviewed evidence",async()=>{
  const cutting=require("../js/cuttingJobImporter")(globalThis),row={import_event_id:"cut-1",record_status:"completed",job_name:"Fixture job",project_number:"0000",actual_cut_minutes:10,estimate_hours:2,add_minutes:0,priority:1,charge_rate_per_hr:100,cost_rate_per_hr:40,start_date:"2025-01-01",due_date:"2025-01-02",completed_date:"2025-01-03",category:"Company Improvements",material:"Steel",thickness_raw:"1/4",thickness_inches:.25,path_length_ft:4,path_width_ft:2,material_cost:10,material_weight_lb:2,source_dimensions_raw:"4ft x 2ft",cut_sequence:1,review_status:"reviewed",review_notes:"",source_file:"recovery",source_text:"paper cutting log"};
  assert.deepEqual(Object.keys(row),cutting.FIELDS);const parsed=await cutting.parseFile(fixtures.file("Cutting_Jobs_Import.xlsx",[{name:"Cutting Jobs",headers:cutting.FIELDS,rows:[row]}]),xlsx),context={state:{cuttingJobs:[],completedCuttingJobs:[]},categories:[{id:"cat",name:"ATM 1251"}],materialSettings:{wasteFactor:10,materials:[{id:"steel",name:"Steel",density:.283,pricePerLb:.8}]}};
  const plan=cutting.preview(parsed,context);assert.equal(plan[0].status,"ready");const job=cutting.map(plan[0]);assert.equal(job.manualLogs[0].completedHours,10/60);assert.equal(job.estimateHours,2);assert.equal(job.importProvenance.source_text,"paper cutting log");assert.ok(!job.files?.length);assert.notEqual(cutting.preview([{...parsed[0],review_status:"needs_review"}],context)[0].status,"ready");
});
test("missing required recovery sheets/columns, blank identities and malformed numeric values require review",async()=>{
  await assert.rejects(workbooks.parseFile("purchase",fixtures.file("bad.xlsx",[sheet("pump",[rpm])]),xlsx),/Purchases/);
  await assert.rejects(workbooks.parseFile("pump_hours",fixtures.file("bad.xlsx",[{name:"Pump Hours",headers:["date","hours"],rows:[hours]}]),xlsx),/header/);
  const rows=await workbooks.parseFile("purchase",fixtures.file("bad.xlsx",[sheet("purchase",[{...purchase,import_event_id:"",shipping:"$2.31"}])]),xlsx);assert.equal(history.preview("purchase",rows,initial())[0].status,S.problem);
});
test("OOXML date cells and exact times convert without guessing text; formulas/errors/duplicate headers block",async()=>{
  const parsed=await workbooks.parseFile("pump",fixtures.file("dates.xlsx",[sheet("pump",[{...rpm,date:45660,timeiso:.5}])]),xlsx);assert.equal(parsed[0].date,"2025-01-03");assert.equal(parsed[0].timeISO,"12:00");
  const packageFiles={"xl/workbook.xml":'<workbook xmlns:r="urn:r"><sheets><sheet name="Purchases" r:id="r1"/></sheets></workbook>',"xl/_rels/workbook.xml.rels":'<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>'};
  for(const cell of ['<c r="A2"><f>1+1</f><v>2</v></c>','<c r="A2" t="e"><v>#VALUE!</v></c>']){
    await assert.rejects(xlsx.parse(fixtures.zip({...packageFiles,"xl/worksheets/sheet1.xml":`<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>import_event_id</t></is></c></row><row r="2">${cell}</row></sheetData></worksheet>`}),["Purchases"],{requiredHeaders:["import_event_id"]}),/review/);
  }
  await assert.rejects(xlsx.parse(fixtures.workbook([{name:"Purchases",headers:["import_event_id","import_event_id"],rows:[{import_event_id:"x"}]}]),["Purchases"],{requiredHeaders:["import_event_id"]}),/Duplicate worksheet headers/);
});
test("maintenance read-back verifies exact instances, lifecycle roots, descriptors and permanent identity counts",async()=>{
  for(const tamper of [cloud=>cloud.maintenanceCalendarInstancesV2[0].instanceMode="repeat",cloud=>cloud.maintenanceOccurrencesV2[1].rootOccurrenceId="missing",cloud=>cloud.maintenanceTasksV2.push(clone(cloud.maintenanceTasksV2[0])),cloud=>cloud.maintenanceOccurrencesV2.push(clone(cloud.maintenanceOccurrencesV2[1]))]){
    const h=harness({tamper}),result=await h.submit("maintenance",[event()]);assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.equal(h.suspended,true);assert.equal(result.rollbackCompleted,false);
  }
});
test("normal Dashboard one-time helper creates and reuses a complete reminder lifecycle without partial ReferenceError",()=>{
  const source=fs.readFileSync("js/renderers.js","utf8"),start=source.indexOf("function ensureMaintenanceV2Collections"),end=source.indexOf("window.createMaintenanceV2FromTemplate =",start),window={maintenanceTasksV2:[],maintenanceCalendarInstancesV2:[],maintenanceOccurrencesV2:[]};let serial=0;
  const context=vm.createContext({window,console,normalizeDateKey:v=>v,genId:()=>`native-${++serial}`,ymd:()=>"2025-01-03",recordMaintenanceV2MutationSource:()=>{}});
  vm.runInContext(source.slice(start,end)+";this.create=createMaintenanceV2FromTemplate",context);
  const task=initial().tasksInterval[0],options={mode:"one_time",eventType:"scheduled",effectiveDateISO:"2025-01-03"},first=context.create(task,options),second=context.create(task,options);
  assert.equal(first.instance.instanceMode,"one_time");assert.equal(first.occurrence.eventType,"scheduled");assert.equal(first.occurrence.id,second.occurrence.id);assert.equal(window.maintenanceTasksV2.length,1);assert.equal(window.maintenanceCalendarInstancesV2.length,1);assert.equal(window.maintenanceOccurrencesV2.length,1);
});
test("backup-time revision changes block staging and imports pass an immutable previewed revision to saves",async()=>{
  for(const drift of [false,true]){
    const local=initial();let rev=1,saves=0;
    const api=history.createApi({state:()=>clone(local),canWrite:()=>true,loadedRevision:()=>rev,scan:firewall.scanCuttingFileContent,readCloud:async()=>clone(initial()),backup:async()=>{if(drift)rev=2;return true;},apply:(key,value)=>local[key]=value,save:async options=>{saves++;assert.equal(options.expectedRevision,1);return{saved:false,definiteFailure:true,error:"fixture rejection"};}});
    const result=await api.submit("maintenance",[event()],{confirmed:true,reviewedPreview:api.preview("maintenance",[event()])});assert.equal(saves,drift?0:1);assert.equal(local.maintenanceOccurrencesV2.length,0);if(drift)assert.match(result.error,/revision/);else assert.equal(result.rollbackCompleted,true);
  }
});
