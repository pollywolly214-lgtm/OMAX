// Paste the whole IIFE into F12 on the signed-in MHIST preview after loading it.
// Reads only: one independent backend transaction.get, pure validators/builders.
// No save, adoption, retry, repair, localStorage write or recovery-flag change.
(async()=>{
  const checks=[],evidence={prompt:"MHIST-01C"};
  const add=(check,status,detail)=>checks.push({check,status,detail});
  const copy=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const key=value=>value===undefined?"undefined":value===null||typeof value!=="object"?JSON.stringify(value):Array.isArray(value)?"["+value.map(key).join(",")+"]":"{"+Object.keys(value).sort().map(name=>JSON.stringify(name)+":"+key(value[name])).join(",")+"}";
  const fields=["tasksInterval","tasksAsReq","maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2","deletedItems","inventory"];
  const list=value=>Array.isArray(value)?value:[];
  const live=()=>Object.fromEntries(fields.map(name=>[name,copy(window[name])]));
  const gates=()=>Object.fromEntries(["__recoveryInspectMode","__autosaveDisabled","__loadedCloudRevisionForSaveGuard","__lastLoadedCloudState","__lastIndeterminateSave","__lastCloudSaveBlock","__lastDangerousSaveBlock","__lastMaintenanceCancellationEvidence","__globalIdentityVerificationPending","__lastImportVerificationError","__lastInventoryIdentityRepairError"].map(name=>[name,copy(window[name])]));
  const storage=()=>Object.fromEntries(Object.keys(localStorage).sort().map(name=>[name,localStorage.getItem(name)]));
  const starting={live:live(),gates:gates()};let storageBefore;
  try{storageBefore=key(storage());}catch(error){add("Storage preservation","WARNING","Storage cannot be read: "+error.message);}
  const mhist=typeof buildMaintenanceCalendarEvents==="function"&&typeof buildMaintenanceTaskHistory==="function"&&typeof openMaintenanceTaskHistory==="function";
  const cancellation=window.OMAXMaintenanceCalendarCancellation,archive=window.OMAXMaintenanceTaskArchive;
  add("MHIST functions",mhist?"PASS":"FAIL",mhist?"Shared Calendar, History and popup functions present":"Required MHIST function missing");
  const rfs=typeof cancellation?.integrity==="function"&&typeof cancellation?.conserve==="function"&&typeof window.maintenanceCalendarCancellationApi?.run==="function"&&typeof window.maintenanceTaskDeletionApi?.restore==="function"&&typeof readMaintenanceTaskAuthoritativeState==="function";
  add("RFS-02B features",rfs?"PASS":"FAIL",rfs?"Cancellation integrity/conservation, verified coordinator, archive restore and independent reader present":"Required cancellation/archive protection missing");
  add("Recovery Mode",window.__recoveryInspectMode===false&&window.__autosaveDisabled===false?"PASS":window.__recoveryInspectMode===undefined||window.__autosaveDisabled===undefined?"WARNING":"FAIL","recovery="+window.__recoveryInspectMode+", autosaveDisabled="+window.__autosaveDisabled);
  const blockers=["__lastIndeterminateSave","__globalIdentityVerificationPending","__lastImportVerificationError","__lastInventoryIdentityRepairError"].filter(name=>window[name]);
  add("Load/write evidence",window.__initialAdoptComplete!==true||window.__cloudLoadAttemptComplete!==true||blockers.length||typeof hasPendingLocalChanges==="undefined"||hasPendingLocalChanges?"WARNING":"PASS",blockers.length?blockers.join(", "):"Load complete="+window.__initialAdoptComplete+"; pending local="+(typeof hasPendingLocalChanges==="undefined"?"unknown":hasPendingLocalChanges));
  let authoritative;
  try{
    if(typeof FB==="undefined"||!FB.ready||!FB.user||!FB.docRef||typeof FB.db?.runTransaction!=="function")throw Error("Signed-in authoritative backend unavailable");
    const db=FB.db,ref=FB.docRef,uid=FB.user.uid,project=FB.app?.options?.projectId,path=ref.path;
    const current=()=>FB.db===db&&FB.docRef===ref&&FB.user?.uid===uid&&FB.app?.options?.projectId===project&&ref.path===path;
    authoritative=await db.runTransaction(async tx=>{
      if(!current())throw Error("Backend/actor changed");const snap=await tx.get(ref);
      if(!snap?.exists)throw Error("Authoritative state is missing");
      if(snap.metadata?.fromCache||snap.metadata?.hasPendingWrites||snap.ref?.path&&snap.ref.path!==path||snap.ref?.firestore&&snap.ref.firestore!==db)throw Error("Unconfirmed or different backend snapshot");
      return copy(snap.data());
    });
    if(!current())throw Error("Backend/actor changed after read");
    evidence.backend={path,project,disposable:window.OMAXDevSafe?.active===true};
    add("Independent backend read",evidence.backend.disposable?"WARNING":"PASS",evidence.backend.disposable?"Disposable local transaction only; live Firebase not verified":"Captured backend read-only transaction.get completed");
    const rev=authoritative.syncMeta?.rev,loaded=window.__lastLoadedCloudState;
    evidence.revisions={server:rev,loaded:loaded?.syncMeta?.rev,guard:window.__loadedCloudRevisionForSaveGuard};
    add("Server/loaded revision",!Number.isSafeInteger(rev)?"WARNING":rev===loaded?.syncMeta?.rev&&rev===window.__loadedCloudRevisionForSaveGuard?"PASS":"FAIL",JSON.stringify(evidence.revisions));
    for(const name of fields){
      const available=Array.isArray(authoritative[name])&&Array.isArray(window[name])&&Array.isArray(loaded?.[name]);
      add("Protected "+name,!available?"WARNING":key(authoritative[name])===key(window[name])&&key(authoritative[name])===key(loaded[name])?"PASS":"FAIL",!available?"Expected array missing/malformed; equality not certified":"Authoritative/live/loaded comparison ignores object property order");
    }
    const identity=window.OMAXGlobalIdentityRepair?.integrity(copy(authoritative));
    add("Task/archive references",identity?.valid===true?"PASS":identity?.valid===false?"FAIL":"WARNING",identity?.valid?"Complete global identity/FK validation passed":(identity?.blockers||["Validator unavailable"]).join("; "));
    const ledger=cancellation?.integrity(copy(authoritative));
    add("Cancellation ledger",ledger?.valid===true?"PASS":ledger?.valid===false?"FAIL":"WARNING",ledger?.valid?"Append-only cancellation owners and entry identities valid":(ledger?.blockers||["Validator unavailable"]).join("; "));
  }catch(error){add("Authoritative verification","WARNING",String(error.message||error));}
  if(mhist){
    const before=key({live:live(),gates:gates()});
    try{
      const projection=buildMaintenanceCalendarEvents(),active=Object.values(projection.dueMap).flat(),hidden=list(projection.hiddenEvents);
      const owners=[...list(window.tasksInterval),...list(window.tasksAsReq),...list(window.deletedItems).filter(row=>row?.type==="task").map(row=>row.payload)].filter(Boolean);
      const exact=(rows,id)=>{const matches=rows.filter(row=>String(row?.id)===String(id));return matches.length===1?matches[0]:null;};
      const family=id=>{const owner=exact(owners,id);return owner?String(owner.templateId||owner.id):null;};
      const eventOwner=event=>event.type==="task"?event.taskId:exact(list(window.maintenanceTasksV2),event.taskId||projection.oneTimeLookup[event.occurrenceId]?.taskId||event.historyView?.taskId)?.legacyTaskId
        ||exact(list(window.maintenanceCalendarInstancesV2),event.instanceId)?.legacyTaskId;
      const eventKey=event=>event.type==="task"?JSON.stringify(["legacy",String(event.taskId),event.taskStartsOn||event.dateISO]):JSON.stringify(["v2",String(event.instanceId),String(event.occurrenceId||event.repeatView?.rootOccurrenceId||event.id)]);
      const discrepancies=[],duplicates=[],summary=[];
      for(const owner of owners){
        if(!exact(owners,owner.id)){duplicates.push("Ambiguous owner "+owner.id);continue;}
        const rows=buildMaintenanceTaskHistory(owner.id,projection),keys=rows.map(row=>row.key),expected=new Set(active.filter(event=>family(eventOwner(event))===family(owner.id)).map(eventKey));
        const actual=new Set(rows.filter(row=>row.activeCalendar).map(row=>row.key));
        if(new Set(keys).size!==keys.length)duplicates.push(owner.id);
        for(const item of expected)if(!actual.has(item))discrepancies.push({taskId:owner.id,key:item,reason:"Active Calendar event absent from History"});
        for(const item of actual)if(!expected.has(item))discrepancies.push({taskId:owner.id,key:item,reason:"History incorrectly marks an event active"});
        for(const event of hidden.filter(event=>family(eventOwner(event))===family(owner.id)))if(!keys.includes(eventKey(event)))discrepancies.push({taskId:owner.id,key:eventKey(event),reason:"Hidden source evidence missing"});
        for(const row of rows)if(!row.activeCalendar&&(!row.calendarHiddenReason||row.calendarEvent))discrepancies.push({taskId:owner.id,key:row.key,reason:"Hidden/source-only row lacks safe visibility labeling"});
        summary.push({taskId:owner.id,rows:rows.length,active:actual.size,historical:rows.length-actual.size});
      }
      evidence.history={summary,duplicates,discrepancies};
      add("History identities",duplicates.length?"FAIL":"PASS",duplicates.length?duplicates.join("; "):"No duplicate per-task event identity");
      add("Calendar/History reconciliation",discrepancies.length?"FAIL":"PASS",discrepancies.length?discrepancies.length+" discrepancies; inspect report.history":"Active identities agree; hidden evidence is retained and explicitly separated");
    }catch(error){add("History projection","FAIL",String(error.message||error));}
    add("Projection input preservation",before===key({live:live(),gates:gates()})?"PASS":"FAIL","Synchronous before/after protected arrays, loaded state, revision and save/recovery evidence");
  }else add("History reconciliation","WARNING","Not performed: required MHIST functions missing");
  add("Browser evidence stability",key(starting)===key({live:live(),gates:gates()})?"PASS":"WARNING","Evidence must stay stable during the asynchronous read; a concurrent refresh requires a new check");
  if(storageBefore!==undefined){try{add("Storage preservation",storageBefore===key(storage())?"PASS":"FAIL","Read-only storage before/after comparison");}catch(error){add("Storage preservation","WARNING",error.message);}}
  const overall=checks.some(row=>row.status==="FAIL")?"FAIL":checks.some(row=>row.status==="WARNING")?"WARNING":"PASS";
  const report={overall,checks,...evidence,note:"Read-only state/projection verification only. No Firebase write, cancellation, restoration or mutation reliability is certified. No save/unblock/retry was attempted."};
  console.table(checks.map(({check,status,detail})=>({status,check,detail})));console.log("MHIST-01C overall: "+overall,report);return report;
})();
