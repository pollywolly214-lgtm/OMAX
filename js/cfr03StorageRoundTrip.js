(function(root, factory){
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory;
  else {
    const api = factory(root);
    root.runCfr03StorageRoundTripTest = api.runCfr03StorageRoundTripTest;
    root.getCfr03StorageRoundTripDiagnostics = api.getDiagnostics;
  }
})(typeof window !== "undefined" ? window : globalThis, function(root){
  "use strict";

  const CONFIRMATION = "CFR03 STORAGE TEST";
  const PROJECT_ID = "omax-maintenance";
  const BUCKET = "omax-maintenance.firebasestorage.app";
  const WORKSPACE_ID = "github-prod";
  const NAMESPACE = "workspaces/{workspaceId}/cfr03-tests/{uid}/{testId}/cfr03-test.json";
  const CONTENT_TYPE = "application/json";
  const FILE_NAME = "cfr03-test.json";
  const DOWNLOAD_TIMEOUT_MS = 10000;
  const TRANSIENT_KEYS = new Set(["saveMeta", "syncMeta", "diagnostics", "diagnostic", "cfr03Diagnostics", "lastCfr03TestResult"]);
  const PROTECTED_KEYS = [
    "cuttingJobs", "completedCuttingJobs", "cuttingJobDatabase", "deletedItems",
    "tasksInterval", "tasksAsReq", "settingsFolders", "folders", "jobFolders",
    "inventory", "inventoryFolders", "inventoryMaterials", "inventoryTransactions",
    "receiptTrackerWeeks", "orderRequests", "weeklyCostReports", "dailyCutHours",
    "totalHistory", "pumpEff", "garnetCleanings", "appConfig", "dashboardLayout",
    "costLayout", "jobLayout", "maintenanceTasksV2", "maintenanceCalendarInstancesV2",
    "maintenanceOccurrencesV2", "localStateBackup"
  ];
  let lastResult = null;

  function canonicalize(value, path, ancestors){
    if (value === undefined) return { $cfr03Type:"undefined" };
    if (typeof value === "number" && !Number.isFinite(value)) return { $cfr03Type:String(value) };
    if (typeof value === "bigint") return { $cfr03Type:"bigint", value:String(value) };
    if (typeof value === "function" || typeof value === "symbol") return { $cfr03Type:typeof value, value:String(value) };
    if (value === null || typeof value !== "object") return value;
    if (ancestors.has(value)) return { $cfr03Type:"circular", path:ancestors.get(value) };
    const next = new Map(ancestors); next.set(value, path);
    if (Array.isArray(value)) return value.map((item, index)=>canonicalize(item, `${path}[${index}]`, next));
    const result = {};
    Object.keys(value).sort().forEach(key=>{
      if (TRANSIENT_KEYS.has(key)) return;
      result[key] = canonicalize(value[key], `${path}.${key}`, next);
    });
    return result;
  }

  function canonical(value, path){ return canonicalize(value, path, new Map()); }
  function sameValue(left, right){ return JSON.stringify(left) === JSON.stringify(right); }

  function mismatchPaths(before, after, path){
    if (sameValue(before, after)) return [];
    const beforeArray = Array.isArray(before); const afterArray = Array.isArray(after);
    if (beforeArray || afterArray){
      if (!beforeArray || !afterArray) return [path];
      const differences = [];
      if (before.length !== after.length) differences.push(`${path}.length`);
      const length = Math.min(before.length, after.length);
      for (let index=0; index<length; index++) differences.push(...mismatchPaths(before[index], after[index], `${path}[${index}]`));
      return differences;
    }
    const beforeObject = before !== null && typeof before === "object";
    const afterObject = after !== null && typeof after === "object";
    if (!beforeObject || !afterObject) return [path];
    const differences = [];
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
    keys.forEach(key=>{
      const childPath = `${path}.${key}`;
      if (!Object.prototype.hasOwnProperty.call(before, key) || !Object.prototype.hasOwnProperty.call(after, key)) differences.push(childPath);
      else differences.push(...mismatchPaths(before[key], after[key], childPath));
    });
    return differences;
  }

  function readLocalStorage(env, key){
    try { return { available:true, value:env.localStorage?.getItem(key) ?? null }; }
    catch (error){ return { available:false, value:{ $cfr03Type:"inaccessible", errorName:String(error?.name || "Error") } }; }
  }

  function captureSafetyState(env){
    const roots = {};
    PROTECTED_KEYS.forEach(key=>{
      const value = key === "localStateBackup"
        ? readLocalStorage(env, "omax_local_state_backup_v1")
        : (Object.prototype.hasOwnProperty.call(env, key) ? env[key] : { $cfr03Type:"missing-property" });
      roots[key] = canonical(value, `$.${key}`);
    });
    return { roots, jobFileCache:canonical(readLocalStorage(env, "cutting_job_files_v1"), "$.cutting_job_files_v1") };
  }

  function compareSafetyState(before, after){
    const protectedStateRootResults = {};
    const protectedStateMismatchPaths = [];
    PROTECTED_KEYS.forEach(key=>{
      const paths = mismatchPaths(before.roots[key], after.roots[key], `$.${key}`);
      protectedStateRootResults[key] = { matched:paths.length === 0, mismatchPaths:paths };
      protectedStateMismatchPaths.push(...paths);
    });
    const localJobFileCacheMismatchPaths = mismatchPaths(before.jobFileCache, after.jobFileCache, "$.cutting_job_files_v1");
    return { protectedStateRootResults, protectedStateMismatchPaths, localJobFileCacheMismatchPaths };
  }

  function newResult(now){
    return {
      generatedAtISO:now().toISOString(), confirmed:false, firebaseProjectId:"", bucket:"", workspaceId:"", uid:"", testId:"", objectPath:"",
      uploadAttempted:false, uploadCompleted:false, metadataVerified:false, downloadAttempted:false, downloadUrlCreated:false,
      downloadMethod:"XMLHttpRequest", downloadCompleted:false, contentVerified:false, downloadErrorType:"", downloadHttpStatus:null,
      corsFailureSuspected:false, networkFailureSuspected:false, cleanupRequired:false, deleteAttempted:false, deleteCompleted:false,
      absenceVerified:false, cleanupAttempted:false, cleanupCompleted:false, cleanupAbsenceVerified:false, possibleOrphanPath:"",
      manualCleanupRequired:false, operationIndeterminate:false, failedStage:"", error:null, warnings:[], firestoreWriteAttempted:false,
      appStateMutationDetected:false, protectedStateMatched:false, protectedStateMismatchPaths:[], protectedStateRootResults:{},
      localJobFileCacheMatched:false, localJobFileCacheMismatchPaths:[]
    };
  }

  function safeSegment(value, pattern, label){
    const text = String(value || "");
    if (!pattern.test(text)) throw new Error(`${label} is not a safe bounded path segment.`);
    return text;
  }
  function randomTestId(cryptoApi){
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") throw new Error("Cryptographically secure browser randomness is unavailable.");
    const bytes = new Uint8Array(16); cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, byte=>byte.toString(16).padStart(2, "0")).join("");
  }
  function errorText(error){ return { code:String(error?.code || ""), message:String(error?.message || error || "Unknown error") }; }

  function xhrDownloadText(url, XMLHttpRequestCtor, timeoutMs){
    return new Promise((resolve, reject)=>{
      const xhr = new XMLHttpRequestCtor();
      xhr.open("GET", url, true); xhr.timeout = timeoutMs; xhr.responseType = "text"; xhr.withCredentials = false;
      xhr.onload = ()=>{
        const status = Number(xhr.status) || 0;
        if (status >= 200 && status < 300) resolve({ text:String(xhr.responseText ?? xhr.response ?? ""), status });
        else reject(Object.assign(new Error(`Test download failed with HTTP ${status}.`), { downloadErrorType:"http_status", httpStatus:status }));
      };
      xhr.onerror = ()=>reject(Object.assign(new Error("Test download failed at the browser network boundary."), { downloadErrorType:"network", corsFailureSuspected:true, networkFailureSuspected:true }));
      xhr.ontimeout = ()=>reject(Object.assign(new Error("Test download timed out."), { downloadErrorType:"timeout", networkFailureSuspected:true }));
      xhr.onabort = ()=>reject(Object.assign(new Error("Test download was aborted."), { downloadErrorType:"aborted" }));
      xhr.send();
    });
  }

  function summarize(result){
    if (!result) return null;
    const copy = { ...result }; delete copy.protectedStateRootResults;
    return copy;
  }

  function createApi(env, injected = {}){
    const now = injected.now || (()=>new Date());
    const cryptoApi = injected.crypto || env.crypto;
    const XMLHttpRequestCtor = injected.XMLHttpRequest || env.XMLHttpRequest;

    async function runCfr03StorageRoundTripTest(options = {}){
      const result = newResult(now); const before = captureSafetyState(env);
      const finish = ()=>{
        const comparison = compareSafetyState(before, captureSafetyState(env));
        Object.assign(result, comparison);
        result.protectedStateMatched = comparison.protectedStateMismatchPaths.length === 0;
        result.appStateMutationDetected = !result.protectedStateMatched;
        result.localJobFileCacheMatched = comparison.localJobFileCacheMismatchPaths.length === 0;
        lastResult = summarize(result); return result;
      };
      if (options.confirmation !== CONFIRMATION){
        result.failedStage = "validation"; result.error = { code:"cfr03/confirmation-required", message:`Exact confirmation text required: ${CONFIRMATION}` };
        return finish();
      }
      result.confirmed = true;
      let objectRef = null; let primaryError = null;
      try {
        const firebaseState = injected.firebaseState ? injected.firebaseState() : (function(){
          const app = env.firebase?.apps?.[0];
          return { user:typeof env.firebase?.auth === "function" ? env.firebase.auth().currentUser : null,
            projectId:String(app?.options?.projectId || env.FIREBASE_CONFIG?.projectId || ""), bucket:BUCKET,
            workspaceId:String(env.WORKSPACE_ID || ""), storage:typeof app?.storage === "function" ? app.storage(`gs://${BUCKET}`) : null };
        })();
        const user = firebaseState?.user;
        if (!user?.uid) throw new Error("A signed-in Firebase user is required.");
        result.uid = safeSegment(user.uid, /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/, "UID");
        result.firebaseProjectId = String(firebaseState.projectId || ""); result.bucket = String(firebaseState.bucket || "").replace(/^gs:\/\//, "");
        result.workspaceId = safeSegment(firebaseState.workspaceId, /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, "Workspace ID");
        if (result.firebaseProjectId !== PROJECT_ID) throw new Error("Unexpected Firebase project.");
        if (result.bucket !== BUCKET) throw new Error("Unexpected Firebase Storage bucket.");
        if (result.workspaceId !== WORKSPACE_ID) throw new Error("Unexpected workspace.");
        if (!firebaseState.storage) throw new Error("Firebase Storage is unavailable.");
        if (typeof XMLHttpRequestCtor !== "function") throw new Error("XMLHttpRequest is unavailable.");
        result.testId = randomTestId(cryptoApi); result.objectPath = `workspaces/${result.workspaceId}/cfr03-tests/${result.uid}/${result.testId}/${FILE_NAME}`;
        const payload = JSON.stringify({ testId:result.testId, timestamp:result.generatedAtISO });
        const payloadBytes = new TextEncoder().encode(payload); objectRef = firebaseState.storage.ref(result.objectPath);

        result.uploadAttempted = true;
        try { await objectRef.put(new Blob([payload], { type:CONTENT_TYPE }), { contentType:CONTENT_TYPE, customMetadata:{ uid:result.uid, workspaceId:result.workspaceId, testId:result.testId } }); result.uploadCompleted = true; }
        catch (error){ result.operationIndeterminate = true; result.failedStage = "upload"; throw error; }

        result.failedStage = "metadata";
        const metadata = await objectRef.getMetadata();
        if (!(metadata?.fullPath === result.objectPath && Number(metadata?.size) === payloadBytes.byteLength && metadata?.contentType === CONTENT_TYPE
          && metadata?.customMetadata?.uid === result.uid && metadata?.customMetadata?.workspaceId === result.workspaceId && metadata?.customMetadata?.testId === result.testId)) {
          throw new Error("Uploaded object metadata did not match the exact CFR-03 object.");
        }
        result.metadataVerified = true; result.downloadAttempted = true; result.failedStage = "download_url";
        const downloadUrl = await objectRef.getDownloadURL(); result.downloadUrlCreated = true; result.failedStage = "download_content";
        let downloaded;
        try { downloaded = await xhrDownloadText(downloadUrl, XMLHttpRequestCtor, DOWNLOAD_TIMEOUT_MS); result.downloadHttpStatus = downloaded.status; }
        catch (error){
          result.downloadErrorType = String(error.downloadErrorType || "unknown"); result.downloadHttpStatus = error.httpStatus ?? null;
          result.corsFailureSuspected = error.corsFailureSuspected === true; result.networkFailureSuspected = error.networkFailureSuspected === true; throw error;
        }
        result.downloadCompleted = true; result.failedStage = "content_verification";
        if (downloaded.text !== payload) throw new Error("Downloaded test content did not match exactly.");
        result.contentVerified = true;
      } catch (error){ primaryError = error; if (!result.failedStage) result.failedStage = "validation"; result.error = errorText(error); }

      if (result.uploadCompleted){
        result.cleanupRequired = true; result.cleanupAttempted = true; result.deleteAttempted = true;
        try {
          await objectRef.delete(); result.cleanupCompleted = true; result.deleteCompleted = true;
          try {
            await objectRef.getMetadata();
            const absenceError = new Error("Deleted test object is still present.");
            if (!primaryError){ primaryError = absenceError; result.error = errorText(absenceError); result.failedStage = "cleanup_absence_verification"; }
          }
          catch (error){
            if (error?.code === "storage/object-not-found") { result.cleanupAbsenceVerified = true; result.absenceVerified = true; }
            else {
              result.operationIndeterminate = true;
              if (!primaryError){ primaryError = error; result.error = errorText(error); result.failedStage = "cleanup_absence_verification"; }
            }
          }
        } catch (error){
          result.operationIndeterminate = true; result.manualCleanupRequired = true; result.possibleOrphanPath = result.objectPath;
          if (!primaryError){ primaryError = error; result.error = errorText(error); result.failedStage = "cleanup_delete"; }
        }
        if (!result.cleanupAbsenceVerified){ result.manualCleanupRequired = true; result.possibleOrphanPath = result.objectPath; }
      } else if (result.uploadAttempted && result.operationIndeterminate){
        result.manualCleanupRequired = true; result.possibleOrphanPath = result.objectPath;
      }
      if (!primaryError && result.cleanupAbsenceVerified) result.failedStage = "";
      if (result.manualCleanupRequired) result.warnings.push("The exact test object may remain; no automatic retry was attempted.");
      return finish();
    }

    function getDiagnostics(){ return {
      storageRulesExpectedVersion:"CFR-03A-deny-all-v1", productionUploadsEnabled:false, productionDownloadsEnabled:false,
      cfr03TestHelperAvailable:true, cfr03TestNamespace:NAMESPACE, workspaceMembershipMechanism:"none-authoritative-found",
      productionAuthorizationReady:false, productionAuthorizationBlockers:["No authoritative workspace membership record, role, or custom claim is available to Storage rules."],
      lastCfr03TestResult:lastResult
    }; }
    return { runCfr03StorageRoundTripTest, getDiagnostics };
  }
  const api = createApi(root); api.createForTests = createApi; return api;
});
