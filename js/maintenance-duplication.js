"use strict";

// MI-02K: task folders are intentionally not normalized here.  Older tasks can
// have mode=interval/asreq while cat=root because mode controls scheduling and
// cat controls only the independently editable settings-tree placement.
(function maintenanceDuplicationSafety(global){
  const CANONICAL_ID = "pump_rebuild_msnpt6hi";
  const DUPLICATE_ID = "pump_rebuild_msnpt6gs";
  const INVENTORY_ID = "inventory_msnpt6ic";
  const IMPORT_IDS = ["OMAX-2067268-302701-01", "OMAX-2070032-302701-01"];
  const AUTHORITATIVE_INVENTORY = { id:INVENTORY_ID, name:"Pump Rebuild", linkedTaskId:DUPLICATE_ID, qty:0, qtyNew:0, price:null, pn:"", folderId:null };

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
    const intervalTasks = Array.isArray(global.tasksInterval) ? global.tasksInterval : [];
    const tasks = intervalTasks.filter(isPumpRebuild);
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
    const allLiveTasks = intervalTasks.concat(Array.isArray(global.tasksAsReq) ? global.tasksAsReq : []);
    const canonicalMatches = allLiveTasks.filter(task => String(task?.id || "") === CANONICAL_ID);
    const duplicateMatches = allLiveTasks.filter(task => String(task?.id || "") === DUPLICATE_ID);
    const canonical = canonicalMatches[0];
    const duplicate = duplicateMatches[0];
    const matchingInventory = inventory.filter(item => String(item?.id || "") === INVENTORY_ID);
    const inventoryRecord = matchingInventory[0];
    const liveCollections = ["inventory", "maintenanceCalendarInstancesV2", "maintenanceOccurrencesV2", "maintenanceTasksV2", "tasksAsReq"];
    const allLiveReferences = liveCollections.flatMap(name => findReferences(global[name], DUPLICATE_ID, name));
    intervalTasks.forEach((task, index)=>{
      if (String(task?.id || "") === DUPLICATE_ID) return;
      findReferences(task, DUPLICATE_ID, `tasksInterval[${index}]`, allLiveReferences);
    });
    const intendedReferencePath = matchingInventory.length === 1 ? `inventory[${inventory.indexOf(inventoryRecord)}].linkedTaskId` : "";
    const unexpectedLiveReferences = allLiveReferences.filter(reference => reference.path !== intendedReferencePath);
    const current = stateForRepair();
    const baseline = global.__lastLoadedCloudState;
    const currentComparison = current ? clone(current) : null;
    const baselineComparison = baseline ? clone(baseline) : null;
    if (currentComparison) delete currentComparison.saveMeta;
    if (baselineComparison) delete baselineComparison.saveMeta;
    const baselineMatches = Boolean(currentComparison && baselineComparison && key(currentComparison) === key(baselineComparison));
    const refusalReasons = [];
    if (canonicalMatches.length !== 1 || duplicateMatches.length !== 1) refusalReasons.push("Both exact task IDs must exist exactly once.");
    if (!canonical || !duplicate || !isEquivalentPump(canonical) || !isEquivalentPump(duplicate)) refusalReasons.push("Both exact tasks must be equivalent 500-hour interval Pump Rebuild tasks.");
    if (String(canonical?.inventoryId || "") !== INVENTORY_ID || String(duplicate?.inventoryId || "") !== INVENTORY_ID) refusalReasons.push("Both tasks must point to the exact shared inventory ID.");
    if (count(canonical?.manualHistory) !== 2 || count(canonical?.completedDates) !== 0 || key(historyIds(canonical)) !== key(IMPORT_IDS)) refusalReasons.push("Canonical task history does not contain exactly the two protected imports.");
    if (count(duplicate?.manualHistory) !== 0 || count(duplicate?.completedDates) !== 0) refusalReasons.push("Duplicate task is not empty.");
    if (matchingInventory.length !== 1) refusalReasons.push("Exactly one matching live inventory record is required.");
    if (!inventoryRecord || key(inventoryRecord) !== key(AUTHORITATIVE_INVENTORY)) refusalReasons.push("Shared inventory record differs from the authoritative configuration.");
    if (unexpectedLiveReferences.length) refusalReasons.push("Unexpected additional live references target the duplicate task.");
    if (!baselineMatches) refusalReasons.push("Current state does not match the latest authoritative Firestore-loaded baseline.");
    const inventoryRelinkRequired = Boolean(inventoryRecord && inventoryRecord.linkedTaskId === DUPLICATE_ID);
    const inventoryRelinkSafe = inventoryRelinkRequired && matchingInventory.length === 1 && !unexpectedLiveReferences.length && key(inventoryRecord) === key(AUTHORITATIVE_INVENTORY);
    const inventoryRelinkPlan = inventoryRelinkSafe ? { inventoryId:INVENTORY_ID, fromTaskId:DUPLICATE_ID, toTaskId:CANONICAL_ID } : null;
    const removableCandidateIds = refusalReasons.length === 0 ? [DUPLICATE_ID] : [];
    return { records, equivalentGroups:Object.entries(groups).map(([configuration, ids])=>({ configuration, ids })), removableCandidateIds,
      inventoryRelinkRequired, inventoryRelinkSafe, inventoryRelinkPlan, refusalReasons,
      liveReferences:allLiveReferences, unexpectedLiveReferences, deletedItemsLinks:findReferences(deleted, DUPLICATE_ID, "deletedItems"),
      repairSafe:removableCandidateIds.length === 1 && inventoryRelinkSafe };
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

  function setInventory(list){
    global.inventory = list;
    if (typeof inventory !== "undefined") inventory = list;
  }

  async function repairExactPumpRebuildTaskDuplication(){
    const result = { repaired:false, saveAttempted:false, saveMethod:"saveCloudNow", stateWriteAttempted:false, stateWriteCompleted:false,
      saveCompleted:false, saveIndeterminate:false, saveError:"", saveWarnings:[], backupCreated:false, canonicalTaskId:CANONICAL_ID,
      removedTaskId:DUPLICATE_ID, beforeCounts:null, afterCounts:null, preservedImportEventIds:[], refusedReason:"",
      inventoryRelinkRequired:false, inventoryRelinkCompleted:false, relinkedInventoryIds:[], beforeInventoryLink:null, afterInventoryLink:null };
    const refuse = reason => { result.refusedReason = reason; return result; };
    const current = stateForRepair();
    const baseline = global.__lastLoadedCloudState;
    if (!current || !baseline) return refuse("Current state or last authoritative Firestore baseline is unavailable.");
    const audit = auditPumpRebuildTaskDuplication();
    if (!audit.repairSafe || key(audit.removableCandidateIds) !== key([DUPLICATE_ID])) return refuse("Exact duplicate preconditions or live-reference audit failed.");
    const authorization = { used:false, state:key(current), plan:key(audit.inventoryRelinkPlan) };
    result.inventoryRelinkRequired = audit.inventoryRelinkRequired;
    const tasks = global.tasksInterval;
    const inventoryBefore = global.inventory;
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
    const revalidation = auditPumpRebuildTaskDuplication();
    const revalidatedState = stateForRepair();
    if (authorization.used || !revalidation.repairSafe || key(revalidation.inventoryRelinkPlan) !== authorization.plan || key(revalidatedState) !== authorization.state) return refuse("Exact repair authorization became stale before mutation.");
    authorization.used = true;
    result.beforeCounts = { tasksInterval:tasks.length, manualHistory:count(canonical.manualHistory) + count(duplicate.manualHistory), completedDates:count(canonical.completedDates) + count(duplicate.completedDates) };
    const inventoryIndex = inventoryBefore.findIndex(item => String(item?.id || "") === INVENTORY_ID);
    const originalInventoryRecord = inventoryBefore[inventoryIndex];
    const relinkedInventoryRecord = { ...originalInventoryRecord, linkedTaskId:CANONICAL_ID };
    const inventoryAfter = inventoryBefore.slice();
    inventoryAfter[inventoryIndex] = relinkedInventoryRecord;
    result.beforeInventoryLink = originalInventoryRecord.linkedTaskId;
    result.afterInventoryLink = relinkedInventoryRecord.linkedTaskId;
    setIntervalTasks(tasks.filter(task => String(task?.id) !== DUPLICATE_ID));
    setInventory(inventoryAfter);
    const afterState = stateForRepair();
    const expected = clone(protectedBefore);
    expected.tasksInterval = expected.tasksInterval.filter(task => String(task?.id) !== DUPLICATE_ID);
    expected.inventory[inventoryIndex] = { ...expected.inventory[inventoryIndex], linkedTaskId:CANONICAL_ID };
    if (key(afterState) !== key(expected) || key(canonical.manualHistory) !== key(canonicalHistory)){
      setIntervalTasks(tasks);
      setInventory(inventoryBefore);
      return refuse("Intended-only verification failed before save.");
    }
    result.afterCounts = { tasksInterval:global.tasksInterval.length, manualHistory:count(canonical.manualHistory), completedDates:count(canonical.completedDates) };
    result.preservedImportEventIds = historyIds(canonical);
    result.inventoryRelinkCompleted = true;
    result.relinkedInventoryIds = [INVENTORY_ID];
    if (typeof saveCloudNow !== "function"){ setIntervalTasks(tasks); setInventory(inventoryBefore); result.inventoryRelinkCompleted=false; result.relinkedInventoryIds=[]; return refuse("Authoritative full-state save is unavailable."); }
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
      if (!result.saveCompleted && !result.saveIndeterminate && !result.stateWriteAttempted){ setIntervalTasks(tasks); setInventory(inventoryBefore); result.inventoryRelinkCompleted=false; result.relinkedInventoryIds=[]; }
    } catch (error){
      result.saveError = String(error?.message || error);
      result.saveIndeterminate = error?.indeterminate === true;
      result.stateWriteAttempted = error?.stateWriteAttempted === true;
      if (!result.saveIndeterminate && !result.stateWriteAttempted){ setIntervalTasks(tasks); setInventory(inventoryBefore); result.inventoryRelinkCompleted=false; result.relinkedInventoryIds=[]; }
    }
    return result;
  }

  Object.assign(global, { normalizeMaintenanceTaskIdentity, createMaintenanceTaskOnce, auditPumpRebuildTaskDuplication, repairExactPumpRebuildTaskDuplication });
})(window);
