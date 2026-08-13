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
  const PROTECTED_KEYS = [
    "cuttingJobs", "completedCuttingJobs", "cuttingJobDatabase", "deletedItems",
    "tasksInterval", "tasksAsReq", "settingsFolders", "folders", "jobFolders",
    "inventory", "inventoryFolders", "inventoryMaterials", "inventoryTransactions",
    "receiptTrackerWeeks", "orderRequests", "weeklyCostReports", "dailyCutHours",
    "totalHistory", "pumpEff", "garnetCleanings", "appConfig", "dashboardLayout",
    "costLayout", "jobLayout", "maintenanceTasksV2", "maintenanceCalendarInstancesV2",
    "maintenanceOccurrencesV2"
  ];
  let lastResult = null;

  function stableValue(value, seen){
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    if (Array.isArray(value)) return value.map(item=>stableValue(item, seen));
    const result = {};
    Object.keys(value).sort().forEach(key=>{
      if (/^(generatedAtISO|diagnostics?|saveMeta|syncMeta|lastSavedAt|updatedAtISO)$/i.test(key)) return;
      result[key] = stableValue(value[key], seen);
    });
    return result;
  }

  function fingerprint(value){
    return JSON.stringify(stableValue(value, new WeakSet()));
  }

  function captureSafetyState(env){
    const protectedState = {};
    PROTECTED_KEYS.forEach(key=>{ protectedState[key] = env[key]; });
    let localBackup = null;
    let jobFileCache = null;
    try { localBackup = env.localStorage?.getItem("omax_local_state_backup_v1") ?? null; } catch (_err){ localBackup = "[inaccessible]"; }
    try { jobFileCache = env.localStorage?.getItem("cutting_job_files_v1") ?? null; } catch (_err){ jobFileCache = "[inaccessible]"; }
    return {
      protectedFingerprint:fingerprint({ protectedState, localBackup }),
      jobFileCacheFingerprint:fingerprint(jobFileCache)
    };
  }

  function newResult(now){
    return {
      generatedAtISO:now().toISOString(), confirmed:false, firebaseProjectId:"", bucket:"",
      workspaceId:"", uid:"", testId:"", objectPath:"", uploadAttempted:false,
      uploadCompleted:false, metadataVerified:false, downloadAttempted:false,
      downloadCompleted:false, contentVerified:false, deleteAttempted:false,
      deleteCompleted:false, absenceVerified:false, operationIndeterminate:false,
      failedStage:"", error:null, warnings:[], firestoreWriteAttempted:false,
      appStateMutationDetected:false, protectedStateMatched:false,
      localJobFileCacheMatched:false
    };
  }

  function safeSegment(value, pattern, label){
    const text = String(value || "");
    if (!pattern.test(text)) throw new Error(`${label} is not a safe bounded path segment.`);
    return text;
  }

  function randomTestId(cryptoApi){
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") throw new Error("Cryptographically secure browser randomness is unavailable.");
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, byte=>byte.toString(16).padStart(2, "0")).join("");
  }

  function errorText(error){
    return { code:String(error?.code || ""), message:String(error?.message || error || "Unknown error") };
  }

  function summarize(result){
    if (!result) return null;
    const keys = ["generatedAtISO", "confirmed", "firebaseProjectId", "bucket", "workspaceId", "uid", "testId", "objectPath", "uploadAttempted", "uploadCompleted", "metadataVerified", "downloadAttempted", "downloadCompleted", "contentVerified", "deleteAttempted", "deleteCompleted", "absenceVerified", "operationIndeterminate", "failedStage", "error", "warnings", "firestoreWriteAttempted", "appStateMutationDetected", "protectedStateMatched", "localJobFileCacheMatched"];
    return Object.fromEntries(keys.map(key=>[key, result[key]]));
  }

  function createApi(env, injected = {}){
    const now = injected.now || (()=>new Date());
    const cryptoApi = injected.crypto || env.crypto;
    const fetchFn = injected.fetch || (typeof env.fetch === "function" ? env.fetch.bind(env) : null);

    async function runCfr03StorageRoundTripTest(options = {}){
      const result = newResult(now);
      const before = captureSafetyState(env);
      const finish = ()=>{
        const after = captureSafetyState(env);
        result.protectedStateMatched = before.protectedFingerprint === after.protectedFingerprint;
        result.localJobFileCacheMatched = before.jobFileCacheFingerprint === after.jobFileCacheFingerprint;
        result.appStateMutationDetected = !result.protectedStateMatched;
        lastResult = summarize(result);
        return result;
      };
      if (options.confirmation !== CONFIRMATION){
        result.failedStage = "confirmation";
        result.error = { code:"cfr03/confirmation-required", message:`Exact confirmation text required: ${CONFIRMATION}` };
        return finish();
      }
      result.confirmed = true;

      let objectRef = null;
      try {
        const firebaseState = injected.firebaseState ? injected.firebaseState() : (function(){
          const app = env.firebase?.apps?.[0];
          return {
            user:typeof env.firebase?.auth === "function" ? env.firebase.auth().currentUser : null,
            projectId:String(app?.options?.projectId || env.FIREBASE_CONFIG?.projectId || ""),
            bucket:BUCKET,
            workspaceId:String(env.WORKSPACE_ID || ""),
            storage:typeof app?.storage === "function" ? app.storage(`gs://${BUCKET}`) : null
          };
        })();
        const user = firebaseState?.user;
        if (!user?.uid) throw Object.assign(new Error("A signed-in Firebase user is required."), { stage:"authentication" });
        result.uid = safeSegment(user.uid, /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/, "UID");
        result.firebaseProjectId = String(firebaseState.projectId || "");
        result.bucket = String(firebaseState.bucket || "").replace(/^gs:\/\//, "");
        result.workspaceId = safeSegment(firebaseState.workspaceId, /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, "Workspace ID");
        if (result.firebaseProjectId !== PROJECT_ID) throw Object.assign(new Error("Unexpected Firebase project."), { stage:"configuration" });
        if (result.bucket !== BUCKET) throw Object.assign(new Error("Unexpected Firebase Storage bucket."), { stage:"configuration" });
        if (result.workspaceId !== WORKSPACE_ID) throw Object.assign(new Error("Unexpected workspace."), { stage:"configuration" });
        if (!firebaseState.storage) throw Object.assign(new Error("Firebase Storage is unavailable."), { stage:"configuration" });
        if (!fetchFn) throw Object.assign(new Error("Browser fetch is unavailable."), { stage:"configuration" });

        result.testId = randomTestId(cryptoApi);
        result.objectPath = `workspaces/${result.workspaceId}/cfr03-tests/${result.uid}/${result.testId}/${FILE_NAME}`;
        const payload = JSON.stringify({ testId:result.testId, timestamp:result.generatedAtISO });
        const payloadBytes = new TextEncoder().encode(payload);
        objectRef = firebaseState.storage.ref(result.objectPath);

        result.uploadAttempted = true;
        let uploadSnapshot;
        try {
          uploadSnapshot = await objectRef.put(new Blob([payload], { type:CONTENT_TYPE }), {
            contentType:CONTENT_TYPE,
            customMetadata:{ uid:result.uid, workspaceId:result.workspaceId, testId:result.testId }
          });
          result.uploadCompleted = true;
        } catch (error){
          result.operationIndeterminate = true;
          throw Object.assign(error, { stage:"upload" });
        }
        if (uploadSnapshot?.ref?.fullPath && uploadSnapshot.ref.fullPath !== result.objectPath) throw Object.assign(new Error("Upload completed at an unexpected path."), { stage:"upload-verification" });

        let metadata;
        try { metadata = await objectRef.getMetadata(); }
        catch (error){ throw Object.assign(error, { stage:"metadata" }); }
        const metadataMatches = metadata?.fullPath === result.objectPath
          && Number(metadata?.size) === payloadBytes.byteLength
          && metadata?.contentType === CONTENT_TYPE
          && metadata?.customMetadata?.uid === result.uid
          && metadata?.customMetadata?.workspaceId === result.workspaceId
          && metadata?.customMetadata?.testId === result.testId;
        if (!metadataMatches) throw Object.assign(new Error("Uploaded object metadata did not match the exact CFR-03 object."), { stage:"metadata" });
        result.metadataVerified = true;

        result.downloadAttempted = true;
        const url = await objectRef.getDownloadURL();
        const response = await fetchFn(url, { cache:"no-store", credentials:"omit" });
        if (!response?.ok) throw Object.assign(new Error(`Test download failed with HTTP ${response?.status || "unknown"}.`), { stage:"download" });
        const downloaded = await response.text();
        result.downloadCompleted = true;
        if (downloaded !== payload) throw Object.assign(new Error("Downloaded test content did not match exactly."), { stage:"content" });
        result.contentVerified = true;

        result.deleteAttempted = true;
        try { await objectRef.delete(); result.deleteCompleted = true; }
        catch (error){ result.operationIndeterminate = true; throw Object.assign(error, { stage:"delete" }); }
        try {
          await objectRef.getMetadata();
          throw Object.assign(new Error("Deleted test object is still present."), { stage:"absence" });
        } catch (error){
          if (error?.code !== "storage/object-not-found") throw Object.assign(error, { stage:error?.stage || "absence" });
          result.absenceVerified = true;
        }
      } catch (error){
        result.failedStage = error?.stage || (result.confirmed ? "preflight" : "confirmation");
        result.error = errorText(error);
        if (result.uploadCompleted && !result.deleteCompleted) result.warnings.push("The exact test object may remain; no automatic retry or cleanup was attempted.");
      }
      return finish();
    }

    function getDiagnostics(){
      return {
        storageRulesExpectedVersion:"CFR-03-v1",
        productionUploadsEnabled:false,
        productionDownloadsEnabled:false,
        cfr03TestHelperAvailable:true,
        cfr03TestNamespace:NAMESPACE,
        workspaceMembershipMechanism:"none-authoritative-found",
        productionAuthorizationReady:false,
        productionAuthorizationBlockers:["No authoritative workspace membership record, role, or custom claim is available to Storage rules."],
        lastCfr03TestResult:lastResult
      };
    }
    return { runCfr03StorageRoundTripTest, getDiagnostics };
  }

  const api = createApi(root);
  api.createForTests = createApi;
  return api;
});
