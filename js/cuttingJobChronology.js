(function(root, factory){
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CuttingJobChronology = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  "use strict";

  // cutDateISO is the actual performed calendar day, never a scheduled start,
  // completion instant, import date or browser-timezone conversion. Day order is
  // independent of the mutable display number. No hydration/backfill runs here.
  const FIELDS = Object.freeze(["cutDateISO", "cutOrderWithinDay"]);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const textCompare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const clone = value => structuredClone(value);
  function stateKey(value){
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(stateKey).join(",") + "]";
    return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stateKey(value[key])).join(",") + "}";
  }
  const businessKey = state => stateKey(Object.fromEntries(Object.entries(state).filter(([key]) => key !== "syncMeta")));
  // The atomic writer queues JSON-compatible state. Apply that exact durable
  // serialization to both committed payload and server readback: object
  // undefined properties are absent and array undefined positions are null.
  // No business field, save log, report or revision is excluded here.
  function durableStateProjection(value){
    if(value===null||typeof value!=="object")return value;
    if(value instanceof Date)return new Date(value.getTime());
    if(Array.isArray(value))return Array.from(value,item=>item===undefined?null:durableStateProjection(item));
    return Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined).map(([key,item])=>[key,durableStateProjection(item)]));
  }
  function durableStateKey(value){
    if(value===null)return "null";
    if(typeof value!=="object")return typeof value+":"+(typeof value==="number"?String(value):JSON.stringify(value));
    if(value instanceof Date)return "date:"+value.toISOString();
    if(Array.isArray(value))return "array:["+value.map(durableStateKey).join(",")+"]";
    return "object:{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+durableStateKey(value[key])).join(",")+"}";
  }
  const DIAGNOSTIC_FIELDS=new Set(("syncMeta rev updatedAtISO updatedBy saveMeta lastSavedAt lastSaveStatus lastSaveError lastSaveSizeBytes syncProcessLog cuttingJobs completedCuttingJobs id name startISO dueISO completedAtISO cutNumber cutDateISO cutOrderWithinDay cutChronologyHistory files fileId relativePath source url externalUrl downloadUrl manualLogs dateISO completedHours actualHours estimateHours efficiency material materialCost materialQty chargeRate costRate cat projectNumber priority notes importProvenance import_event_id inventory inventoryFolders inventoryMaterials inventoryTransactions maintenanceTasksV2 maintenanceCalendarInstancesV2 maintenanceOccurrencesV2 tasksInterval tasksAsReq totalHistory dailyCutHours pumpEff entries hours rpm weeklyCostReports receiptTrackerWeeks orderRequests jobFolders appConfig costHistory deletedItems schema length seconds nanoseconds").split(" "));
  function verificationDifferences(committed,readback){
    const paths=[],maxPaths=16,maxNodes=100000;let count=0,nodes=0,truncated=false;
    const record=path=>{count++;if(paths.length<maxPaths)paths.push(path.slice(0,200));else truncated=true;};
    const walk=(a,b,path,depth)=>{
      if(++nodes>maxNodes||depth>64){truncated=true;record(path);return;}
      if(Object.is(a,b))return;
      if(a instanceof Date||b instanceof Date){if(!(a instanceof Date&&b instanceof Date&&a.getTime()===b.getTime()))record(path);return;}
      if(a===null||b===null||typeof a!=="object"||typeof b!=="object"||Array.isArray(a)!==Array.isArray(b)){record(path);return;}
      if(Array.isArray(a)){
        if(a.length!==b.length)record(path+".length");
        for(let i=0;i<Math.max(a.length,b.length)&&nodes<=maxNodes;i++){if(i>=a.length||i>=b.length)record(path+"["+i+"]");else walk(a[i],b[i],path+"["+i+"]",depth+1);}
      }else{
        const keys=[...new Set([...Object.keys(a),...Object.keys(b)])].sort();
        for(let i=0;i<keys.length&&nodes<=maxNodes;i++){
          const key=keys[i],next=path+(DIAGNOSTIC_FIELDS.has(key)?"."+key:".[field#"+i+"]");
          if(!own(a,key)||!own(b,key))record(next);else walk(a[key],b[key],next,depth+1);
        }
      }
    };
    walk(committed,readback,"$",0);
    return {verificationMismatchPaths:paths,verificationMismatchCount:count,verificationMismatchTruncated:truncated};
  }
  function validCutDate(value){
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
  }
  const validDayOrder = value => Number.isSafeInteger(value) && value > 0;
  function visibleRank(value){
    if (typeof value !== "string" || !/^C\d+$/i.test(value)) return null;
    const rank = Number(value.slice(1));
    return validDayOrder(rank) ? rank : null;
  }
  // Rendering reads materialized labels only, including unresolved legacy jobs.
  // Missing/invalid labels stay neutral; no view may invent a chronology rank.
  function readCutLabel(job){
    return visibleRank(job?.cutNumber) === null ? "—" : job.cutNumber;
  }
  const hasExplicitChronology = (active = [], completed = []) => [...active, ...completed].some(job => job && FIELDS.some(field => own(job, field)));

  // Keys for a whole domain share one mode. Explicit: actual day, independent
  // day position, UTF-16 ID. Legacy read: preserved stored number, UTF-16
  // ID. Never mix mutable legacy number ranks with explicit/source day ranks.
  // UTF-16 code-unit comparison (not localeCompare) is identical across devices.
  function compareCuttingJobChronology(a, b){
    if (!["explicit", "legacy"].includes(a.mode) || a.mode !== b.mode) throw new Error("Chronology comparison requires a single resolved domain.");
    if (a.mode === "explicit") return textCompare(a.date, b.date) || a.order - b.order || textCompare(a.id, b.id);
    return a.rank - b.rank || textCompare(a.id, b.id);
  }
  function readChronology(active = [], completed = []){
    const issues = [], entries = [], ids = new Set();
    for (const [list, isCompleted] of [[active, false], [completed, true]]){
      if (!Array.isArray(list)){ issues.push({code:"invalid_job_array"}); continue; }
      for (const job of list){
        if (!job || typeof job !== "object" || Array.isArray(job) || typeof job.id !== "string" || !job.id.trim()){
          issues.push({code:"invalid_job_identity"}); continue;
        }
        if (ids.has(job.id)) issues.push({code:"duplicate_job_identity", id:job.id});
        ids.add(job.id);
        const explicit = validCutDate(job.cutDateISO) && validDayOrder(job.cutOrderWithinDay);
        if (!explicit) issues.push({code:"chronology_review_required", id:job.id, fields:FIELDS.filter(field => field === "cutDateISO" ? !validCutDate(job[field]) : !validDayOrder(job[field]))});
        entries.push({job, completed:isCompleted, id:job.id, explicit});
      }
    }
    const mode = issues.length ? "legacy" : "explicit";
    for (const entry of entries) Object.assign(entry, {
      mode, date:entry.explicit ? entry.job.cutDateISO : null,
      order:entry.explicit ? entry.job.cutOrderWithinDay : null,
      rank:visibleRank(entry.job.cutNumber) ?? Number.MAX_SAFE_INTEGER
    });
    entries.sort(compareCuttingJobChronology);
    return {mode, entries, issues, requiresReview:issues.length > 0};
  }
  function chronologyReadiness(active = [], completed = []){
    const read = readChronology(active, completed);
    const explicit = hasExplicitChronology(Array.isArray(active) ? active : [], Array.isArray(completed) ? completed : []);
    const status = !explicit ? "LEGACY_ONLY" : read.requiresReview ? "REVIEW_REQUIRED" : "CANONICAL_READY";
    return {status, eligible:status === "CANONICAL_READY", issues:read.issues};
  }
  function planRenumbering(active = [], completed = []){
    const read = readChronology(active, completed);
    if (read.requiresReview) return {
      ok:false, blocked:true, requiresReview:true, issues:read.issues,
      total:read.entries.length, changed:[], affectedRange:null,
      // Display compatibility only. Do not invent labels, dates, or timestamps.
      sequence:read.entries.map(({job, id}) => ({id, cutNumber:job.cutNumber ?? null}))
    };
    const sequence = read.entries.map(({job, id}, index) => ({id, from:job.cutNumber ?? null, cutNumber:`C${String(index + 1).padStart(3, "0")}`}));
    const changed = sequence.filter(item => item.from !== item.cutNumber).map(item => ({id:item.id, from:item.from, to:item.cutNumber}));
    const ranks = changed.flatMap(item => [visibleRank(item.from), visibleRank(item.to)]).filter(rank => rank !== null);
    return {ok:true, blocked:false, requiresReview:false, issues:[], total:sequence.length, changed,
      affectedRange:ranks.length ? {from:Math.min(...ranks), to:Math.max(...ranks)} : null,
      sequence:sequence.map(({id, cutNumber}) => ({id, cutNumber}))};
  }
  function prepareChronologyMutation(state, changes = [], {audit} = {}){
    const fail = (code, detail) => ({ok:false, blocked:true, issues:[{code, ...detail}]});
    if (!state || !Array.isArray(state.cuttingJobs) || !Array.isArray(state.completedCuttingJobs)) return fail("invalid_job_array");
    if (!Array.isArray(changes)) return fail("invalid_chronology_changes");
    const identities = readChronology(state.cuttingJobs, state.completedCuttingJobs).issues.filter(issue => issue.code !== "chronology_review_required");
    if (identities.length) return {ok:false, blocked:true, issues:identities};
    const nextState = clone(state), jobs = [...nextState.cuttingJobs, ...nextState.completedCuttingJobs];
    const byId = new Map(jobs.map(job => [job.id, job])), seen = new Set(), chronologyChanges = [];
    for (const change of changes){
      if (!change || typeof change !== "object" || Array.isArray(change) || Object.keys(change).some(key => !["id", ...FIELDS].includes(key))) return fail("invalid_chronology_change");
      const job = byId.get(change.id);
      if (!job || seen.has(change.id) || !FIELDS.some(field => own(change, field))) return fail("invalid_chronology_target", {id:change.id});
      seen.add(change.id);
      const fields = FIELDS.filter(field => own(change, field));
      if (fields.some(field => field === "cutDateISO" ? !validCutDate(change[field]) : !validDayOrder(change[field]))) return fail("invalid_explicit_chronology", {id:change.id});
      const before = Object.fromEntries(FIELDS.map(field => [field, job[field] ?? null]));
      for (const field of fields) job[field] = change[field];
      const after = Object.fromEntries(FIELDS.map(field => [field, job[field] ?? null]));
      if (stateKey(before) !== stateKey(after)) chronologyChanges.push({id:job.id, before, after});
    }
    const renumbering = planRenumbering(nextState.cuttingJobs, nextState.completedCuttingJobs);
    if (!renumbering.ok) return {...renumbering, chronologyChanges};
    for (const item of renumbering.changed) byId.get(item.id).cutNumber = item.to;
    if (audit && (chronologyChanges.length || renumbering.changed.length)){
      if (typeof audit.operationId !== "string" || !audit.operationId.trim() || typeof audit.actorUid !== "string" || !audit.actorUid.trim()
        || typeof audit.atISO !== "string" || !Number.isFinite(Date.parse(audit.atISO)) || new Date(audit.atISO).toISOString() !== audit.atISO) return fail("invalid_chronology_audit");
      const beforeById = new Map([...state.cuttingJobs, ...state.completedCuttingJobs].map(job => [job.id, job]));
      const edited = new Set(chronologyChanges.map(item => item.id));
      const affected = new Set([...edited, ...renumbering.changed.map(item => item.id)]);
      for (const id of affected){
        const job = byId.get(id), before = beforeById.get(id);
        if (job.cutChronologyHistory !== undefined && !Array.isArray(job.cutChronologyHistory)) return fail("invalid_chronology_history", {id});
        if ((job.cutChronologyHistory || []).some(entry => entry?.operationId === audit.operationId)) return fail("duplicate_chronology_operation", {id});
        const values = value => ({cutDateISO:value.cutDateISO ?? null, cutOrderWithinDay:value.cutOrderWithinDay ?? null, cutNumber:value.cutNumber ?? null});
        const initialized = !validCutDate(before.cutDateISO) || !validDayOrder(before.cutOrderWithinDay);
        job.cutChronologyHistory = [...(job.cutChronologyHistory || []), {
          operationId:audit.operationId, jobId:id, actorUid:audit.actorUid, atISO:audit.atISO,
          kind:initialized ? "operator_review_initialization" : edited.has(id) ? "correction" : "renumber",
          before:values(before), after:values(job), affectedRange:clone(renumbering.affectedRange), affectedCount:renumbering.changed.length
        }];
      }
    }
    return {ok:true, nextState, renumbering, chronologyChanges,
      hasChanges:chronologyChanges.length > 0 || renumbering.changed.length > 0};
  }

  // A model adapter only: the injected writer MUST be the application's existing
  // guarded authoritative CAS writer. This module never writes Firebase/cache or
  // stages changes into live arrays. Success requires exact server read-back.
  function createMutationApi(env){
    let busy = false;
    async function save(changes, {expectedRevision, expectedSourceKey, expectedPreparedKey, audit, businessOperation} = {}){
      const result = {saved:false, verified:false, stateWriteAttempted:false, stateWriteCompleted:false, indeterminate:false, error:"", verificationMismatchPaths:[], verificationMismatchCount:0, committedRevision:null, readbackRevision:null};
      if (busy) return {...result, blocked:true, error:"A chronology mutation is already in progress."};
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !env.canWrite()) return {...result, blocked:true, error:"Current authoritative revision and write permission are required."};
      busy = true;
      let writeInvoked = false;
      let localVersion;
      const current = () => env.canWrite() && stateKey(env.localVersion()) === localVersion;
      const suspend = () => {
        result.requiresReload = true;
        try { env.suspend(result); }
        catch (error) { result.suspensionError = String(error?.message || error); }
      };
      try {
        localVersion = stateKey(env.localVersion());
        // Freeze the caller's request before any asynchronous baseline read.
        const requestedChanges = clone(changes);
        const requestedOperation = businessOperation ? clone(businessOperation) : null;
        const requestedAudit = audit ? clone(audit) : env.audit ? clone(env.audit()) : undefined;
        const source = await env.readState();
        if (!current() || !source || source.syncMeta?.rev !== expectedRevision || !env.baselineMatches(source)) return {...result, blocked:true, error:"Authoritative or local baseline changed; review again."};
        if (expectedSourceKey !== undefined && stateKey(source) !== expectedSourceKey) return {...result, blocked:true, error:"Data changed after preview; reload and review again."};
        if(requestedOperation && !env.prepareBusinessMutation)return {...result,blocked:true,error:"Business-date saving is unavailable."};
        const prepared = requestedOperation && env.prepareBusinessMutation
          ? env.prepareBusinessMutation(source, requestedOperation, {audit:requestedAudit})
          : prepareChronologyMutation(source, requestedChanges, {audit:requestedAudit});
        if (!prepared.ok) return {...result, blocked:true, issues:prepared.issues, error:prepared.error || "Every included job needs verified cut date/order and unique stable identity."};
        if (expectedPreparedKey !== undefined && businessKey(prepared.nextState) !== expectedPreparedKey) return {...result, blocked:true, error:"Chronology preview changed; review again."};
        result.renumbering = prepared.renumbering;
        result.chronologyChanges = prepared.chronologyChanges;
        if (!prepared.hasChanges) return {...result, saved:true, verified:true, noOp:true};
        const expected = businessKey(prepared.nextState);
        // Validation is called INSIDE the existing transaction after its protected
        // merges, before queueing. It can only add restrictions, never relax guards.
        const validatePreparedState = pending => current() && businessKey(pending) === expected;
        if (!current()) return {...result, blocked:true, error:"Local state changed before saving."};
        writeInvoked = true;
        const saved = await env.writeState(prepared.nextState, expectedRevision, validatePreparedState, requestedOperation);
        result.stateWriteAttempted = saved?.stateWriteAttempted === true;
        result.stateWriteCompleted = saved?.stateWriteCompleted === true;
        if (saved?.saved !== true || !result.stateWriteCompleted){
          const definite = saved && saved.indeterminate !== true && !result.stateWriteCompleted
            && (saved.stateWriteAttempted === false || saved.definiteFailure === true || saved.blocked === true);
          result.indeterminate = !definite;
          result.error = saved?.error || "Authoritative chronology save could not be confirmed.";
          if (result.indeterminate) suspend();
          return result;
        }
        result.authoritativeSaveCompleted = true;
        // Freeze the actual queued payload before awaiting readback. Neither
        // the older intent snapshot nor a mutable writer result proves a save.
        result.verificationPhase="committed_projection";
        const committed = saved.committedState ? durableStateProjection(saved.committedState) : null;
        result.committedRevision = Number.isSafeInteger(committed?.syncMeta?.rev) ? committed.syncMeta.rev : null;
        result.verificationPhase="server_readback";
        const cloud = await env.readState();
        result.verificationPhase="readback_projection";
        const readback = cloud ? durableStateProjection(cloud) : null;
        result.readbackRevision = Number.isSafeInteger(readback?.syncMeta?.rev) ? readback.syncMeta.rev : null;
        const revisionsMatch = Number.isSafeInteger(result.committedRevision) && result.committedRevision > expectedRevision
          && result.readbackRevision === result.committedRevision;
        result.verificationPhase="durable_comparison";
        if (!committed || !readback || !revisionsMatch || durableStateKey(committed) !== durableStateKey(readback)){
          Object.assign(result,verificationDifferences(committed,readback));
          if(!revisionsMatch&&!result.verificationMismatchPaths.includes("$.syncMeta.rev")){
            result.verificationMismatchCount++;
            if(result.verificationMismatchPaths.length<16)result.verificationMismatchPaths.push("$.syncMeta.rev");
          }
          result.indeterminate = true;
          result.error = "Committed cutting-job save did not match server readback. Reload before trying again.";
          suspend(); return result;
        }
        result.verified = true;
        result.verificationPhase="adoption";
        if (!current()){
          result.saved = true;
          result.error = "Chronology committed, but concurrent local edits require reload/review.";
          suspend(); return result;
        }
        if (env.adoptVerifiedState(cloud) !== true){
          result.error = "Chronology committed and verified, but authoritative adoption requires review.";
          suspend(); return result;
        }
        result.saved = true;
        return result;
      } catch (error){
        result.error = String(error?.message || error);
        // Thrown writes/verification errors have unknown completion. Never retry,
        // overwrite live records, or roll back an already committed state.
        result.indeterminate = writeInvoked;
        if (writeInvoked) suspend();
        return result;
      } finally { busy = false; }
    }
    return Object.freeze({save, isBusy:() => busy});
  }
  return Object.freeze({FIELDS, validCutDate, validDayOrder, hasExplicitChronology, readCutLabel, chronologyReadiness, stateKey, businessKey, durableStateProjection, durableStateKey, verificationDifferences,
    compareCuttingJobChronology, readChronology, planRenumbering, prepareChronologyMutation, createMutationApi});
});
