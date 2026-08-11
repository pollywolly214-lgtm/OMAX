"use strict";

// MI-02K: task folders are intentionally not normalized here.  Older tasks can
// have mode=interval/asreq while cat=root because mode controls scheduling and
// cat controls only the independently editable settings-tree placement.
(function maintenanceDuplicationSafety(global){
  const CANONICAL_ID = "pump_rebuild_msnpt6hi";
  const DUPLICATE_ID = "pump_rebuild_msnpt6gs";
  const IMPORT_IDS = ["OMAX-2067268-302701-01", "OMAX-2070032-302701-01"];

  const clone = value => typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  const key = value => JSON.stringify(value);
  const normalizeName = value => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizeMode = task => String(task?.mode || "interval").trim().toLowerCase();
  const taskIdentity = task => normalizeName(task?.name);
  const taskConfiguration = task => `${normalizeMode(task)}|${Number(task?.interval) || 0}`;
  const equivalentKey = task => `${taskIdentity(task)}|${taskConfiguration(task)}`;
  const isPumpRebuild = task => taskIdentity(task) === "pump rebuild";
  const isEquivalentPump = task => isPumpRebuild(task) && normalizeMode(task) === "interval" && Number(task?.interval) === 500;
  const historyIds = task => (Array.isArray(task?.manualHistory) ? task.manualHistory : []).map(entry => String(entry?.import_event_id || entry?.importEventId || entry?.provenance?.import_event_id || entry?.provenance?.importEventId || "")).filter(Boolean);
  const count = value => Array.isArray(value) ? value.length : 0;

  function normalizeMaintenanceTaskIdentity(task){
    return { identity:taskIdentity(task), mode:normalizeMode(task), interval:Number(task?.interval) || 0, configuration:taskConfiguration(task), equivalentKey:equivalentKey(task) };
  }

  let creationLock = null;
  function createMaintenanceTaskOnce(actionToken, spec, create){
    const token = String(actionToken || "");
    const signature = equivalentKey(spec || {});
    if (creationLock && creationLock.token === token) return { created:false, task:creationLock.task, reason:"same-action" };
    const list = normalizeMode(spec) === "asreq" ? global.tasksAsReq : global.tasksInterval;
    const sameOperationEquivalent = Array.isArray(list) && list.find(task => task && task.__creationActionToken === token && equivalentKey(task) === signature);
    if (token && sameOperationEquivalent) return { created:false, task:sameOperationEquivalent, reason:"same-action-equivalent" };
    creationLock = { token, task:null };
    try {
      const task = create();
      if (task && token) Object.defineProperty(task, "__creationActionToken", { value:token, configurable:true, enumerable:false });
      creationLock.task = task || null;
      return { created:Boolean(task), task:task || null, reason:task ? "" : "not-created" };
    } finally {
      // Keep the action identity briefly after the synchronous handler returns;
      // browsers may dispatch a second submit/click from the same double click.
      setTimeout(()=> { if (creationLock?.token === token) creationLock = null; }, 1000);
    }
  }

  function findReferences(value, wanted, path = "", found = []){
    if (!value || typeof value !== "object") return found;
    if (Array.isArray(value)) value.forEach((item, index)=>findReferences(item, wanted, `${path}[${index}]`, found));
    else Object.entries(value).forEach(([field, child])=>{
      const childPath = path ? `${path}.${field}` : field;
      if (String(child) === wanted) found.push({ path:childPath, field, value:child });
      else findReferences(child, wanted, childPath, found);
    });
    return found;
  }

  function auditPumpRebuildTaskDuplication(){
    const tasks = (Array.isArray(global.tasksInterval) ? global.tasksInterval : []).filter(isPumpRebuild);
    const inventory = Array.isArray(global.inventory) ? global.inventory : [];
    const deleted = Array.isArray(global.deletedItems) ? global.deletedItems : [];
    const records = tasks.map((task, index)=>({
      collection:"tasksInterval", index, id:String(task.id || ""), name:String(task.name || ""),
      normalized:normalizeMaintenanceTaskIdentity(task), manualHistory:count(task.manualHistory), completedDates:count(task.completedDates),
      importedEventIds:historyIds(task), liveInventoryLinks:findReferences(inventory, String(task.id || ""), "inventory"),
      deletedItemsLinks:findReferences(deleted, String(task.id || ""), "deletedItems")
    }));
    const groups = {};
    records.forEach(record => { (groups[record.normalized.equivalentKey] ||= []).push(record.id); });
    const canonical = tasks.find(task => String(task.id) === CANONICAL_ID);
    const duplicate = tasks.find(task => String(task.id) === DUPLICATE_ID);
    const liveCollections = ["inventory", "maintenanceCalendarInstancesV2", "maintenanceOccurrencesV2", "maintenanceTasksV2", "tasksAsReq"];
    const unexpectedLiveReferences = liveCollections.flatMap(name => findReferences(global[name], DUPLICATE_ID, name));
    (Array.isArray(global.tasksInterval) ? global.tasksInterval : []).forEach((task, index)=>{
      if (String(task?.id || "") === DUPLICATE_ID) return;
      findReferences(task, DUPLICATE_ID, `tasksInterval[${index}]`, unexpectedLiveReferences);
    });
    const removableCandidateIds = canonical && duplicate && isEquivalentPump(canonical) && isEquivalentPump(duplicate)
      && count(duplicate.manualHistory) === 0 && count(duplicate.completedDates) === 0 && !unexpectedLiveReferences.length ? [DUPLICATE_ID] : [];
    return { records, equivalentGroups:Object.entries(groups).map(([configuration, ids])=>({ configuration, ids })), removableCandidateIds,
      liveReferences:unexpectedLiveReferences, deletedItemsLinks:findReferences(deleted, DUPLICATE_ID, "deletedItems"),
      repairSafe:removableCandidateIds.length === 1 };
  }

  function stateForRepair(){
    if (typeof snapshotState === "function") return snapshotState();
    if (typeof getCurrentAppStateForDiagnostics === "function") return getCurrentAppStateForDiagnostics();
    return null;
  }

  function setIntervalTasks(list){
    global.tasksInterval = list;
    if (typeof tasksInterval !== "undefined") tasksInterval = list;
  }

  async function repairExactPumpRebuildTaskDuplication(){
    const result = { repaired:false, saveAttempted:false, saveMethod:"saveCloudNow", stateWriteAttempted:false, stateWriteCompleted:false,
      saveCompleted:false, saveIndeterminate:false, saveError:"", saveWarnings:[], backupCreated:false, canonicalTaskId:CANONICAL_ID,
      removedTaskId:DUPLICATE_ID, beforeCounts:null, afterCounts:null, preservedImportEventIds:[], refusedReason:"" };
    const refuse = reason => { result.refusedReason = reason; return result; };
    const current = stateForRepair();
    const baseline = global.__lastLoadedCloudState;
    if (!current || !baseline) return refuse("Current state or last authoritative Firestore baseline is unavailable.");
    const comparisonCurrent = clone(current);
    const comparisonBaseline = clone(baseline);
    delete comparisonCurrent.saveMeta; delete comparisonBaseline.saveMeta;
    const baselineMatches = typeof getTrackedStateSignature === "function"
      ? getTrackedStateSignature(comparisonCurrent) === getTrackedStateSignature(comparisonBaseline)
      : key(comparisonCurrent) === key(comparisonBaseline);
    if (!baselineMatches) return refuse("Current state does not match the last authoritative Firestore baseline.");
    const audit = auditPumpRebuildTaskDuplication();
    if (!audit.repairSafe || key(audit.removableCandidateIds) !== key([DUPLICATE_ID])) return refuse("Exact duplicate preconditions or live-reference audit failed.");
    const tasks = global.tasksInterval;
    const canonical = tasks.find(task => String(task?.id) === CANONICAL_ID);
    const duplicate = tasks.find(task => String(task?.id) === DUPLICATE_ID);
    if (!canonical || !duplicate) return refuse("Both exact Pump Rebuild task IDs are required.");
    if (key(historyIds(canonical)) !== key(IMPORT_IDS)) return refuse("Canonical imported Pump Rebuild history IDs are not exact.");
    const canonicalHistory = clone(canonical.manualHistory);
    const protectedBefore = clone(current);
    try {
      if (typeof exportJsonDownload !== "function" || !exportJsonDownload(`omax-pump-rebuild-duplicate-backup-${Date.now()}.json`, clone(current))) return refuse("Full-state backup download did not start.");
      result.backupCreated = true;
    } catch (error){ return refuse(`Full-state backup failed: ${String(error?.message || error)}`); }
    result.beforeCounts = { tasksInterval:tasks.length, manualHistory:count(canonical.manualHistory) + count(duplicate.manualHistory), completedDates:count(canonical.completedDates) + count(duplicate.completedDates) };
    setIntervalTasks(tasks.filter(task => String(task?.id) !== DUPLICATE_ID));
    const afterState = stateForRepair();
    const expected = clone(protectedBefore);
    expected.tasksInterval = expected.tasksInterval.filter(task => String(task?.id) !== DUPLICATE_ID);
    if (key(afterState) !== key(expected) || key(canonical.manualHistory) !== key(canonicalHistory)){
      setIntervalTasks(tasks);
      return refuse("Intended-only verification failed before save.");
    }
    result.afterCounts = { tasksInterval:global.tasksInterval.length, manualHistory:count(canonical.manualHistory), completedDates:count(canonical.completedDates) };
    result.preservedImportEventIds = historyIds(canonical);
    if (typeof saveCloudNow !== "function"){ setIntervalTasks(tasks); return refuse("Authoritative full-state save is unavailable."); }
    result.saveAttempted = true;
    try {
      const saved = await saveCloudNow();
      result.stateWriteAttempted = saved?.stateWriteAttempted === true;
      result.stateWriteCompleted = saved?.stateWriteCompleted === true;
      result.saveWarnings = Array.isArray(saved?.warnings) ? saved.warnings.slice() : [];
      result.saveError = String(saved?.error || "");
      result.saveIndeterminate = saved?.indeterminate === true;
      result.saveCompleted = saved?.saved === true && result.stateWriteCompleted;
      result.repaired = result.saveCompleted;
      if (!result.saveCompleted && !result.saveIndeterminate) setIntervalTasks(tasks);
    } catch (error){ result.saveError = String(error?.message || error); setIntervalTasks(tasks); }
    return result;
  }

  Object.assign(global, { normalizeMaintenanceTaskIdentity, createMaintenanceTaskOnce, auditPumpRebuildTaskDuplication, repairExactPumpRebuildTaskDuplication });
})(window);
