# CFR-03A — Secure Storage round-trip correction and deny-all lock

**Status:** repository and deployed Cloud Storage rules are deny-all. Production uploads and downloads remain disabled. This correction performed no live Storage operation, rules deployment, CORS change, Firestore write, migration, repair, or cleanup.

## Authorization model and blocker

The browser uses Firebase v8 email/password authentication and routes authenticated sessions to the client constant `github-prod` and Firestore document `workspaces/github-prod/app/state`. Authentication and client routing do not prove workspace membership. The repository contains no authoritative membership document, role, or custom claim that Storage rules can verify. Production workspace authorization is not ready; authentication alone must never authorize production files.

`firebase.json` points to the repository's `storage.rules` and adds no Hosting configuration. The committed rules are permanently locked to the following default-deny policy:

```text
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

Thus the CFR-03 namespace and all production-like paths—including `workspaces/{workspaceId}/cutting-jobs/**`, `cutting-jobs/**`, `completed-cutting-jobs/**`, `previews/**`, `uploads/**`, and `originals/**`—are denied.

## Controlled-test finding and cleanup confirmation

One controlled Vercel test previously confirmed upload and metadata verification for an 84-byte test object, then failed while downloading: `downloadAttempted` was true, `downloadCompleted` was false, and the browser reported `Failed to fetch`. The old helper first obtained a Firebase v8 download URL and then used browser `fetch()`. Its Fetch rejection carried no internal stage tag, so the outer fallback incorrectly returned `failedStage: "preflight"` even though upload and metadata had succeeded.

The old result also reported a combined protected-state fingerprint mismatch but did not retain root-level comparisons or paths. It is therefore impossible to identify the historical differing root honestly. `cutting_job_files_v1` was separately measured and matched. The exact uploaded object was manually deleted, Firebase Storage was confirmed empty, and deployed rules were restored to deny-all.

## Corrected state machine

`runCfr03StorageRoundTripTest(options)` remains manually gated by exact confirmation `CFR03 STORAGE TEST`. With deny-all rules deployed it will fail at upload; it does not provide production file capability. Internally it now tracks these explicit stages:

1. `validation`
2. `upload`
3. `metadata`
4. `download_url`
5. `download_content`
6. `content_verification`
7. `cleanup_delete`
8. `cleanup_absence_verification`

The generated payload still contains only a random 128-bit test ID and timestamp. The helper never exposes a general-purpose upload/download API, returns a download URL, logs a token, writes Firestore, calls a cloud-save function, or mutates local storage.

After `getDownloadURL()`, the small object is read with an internal Firebase-v8-compatible `XMLHttpRequest`: GET only, no credentials, a 10-second timeout, exact 2xx status handling, exact text comparison, and no retry. Results report URL creation, method, error type, HTTP status when present, and honest CORS/network suspicion without returning the URL.

### Cleanup behavior

Once upload completion is confirmed, success or any later determinate failure triggers exactly one deletion of the known object reference, followed by exactly one metadata absence check. Cleanup results are reported independently. If upload is indeterminate, no deletion is attempted because object existence is unknown. If deletion or absence verification is indeterminate, it is not retried; `possibleOrphanPath` contains only the exact generated path and `manualCleanupRequired` is true.

## Protected-state comparison

Before and after the asynchronous test, the helper captures the same protected roots without calling `snapshotState()`, save/sync code, or a localStorage writer. Canonicalization preserves array order, sorts object keys recursively, represents explicit `undefined`, distinguishes missing properties, and represents ancestor cycles deterministically. Only the named transient containers `saveMeta`, `syncMeta`, `diagnostic`, `diagnostics`, `cfr03Diagnostics`, and `lastCfr03TestResult` are excluded.

Results contain exact `protectedStateMismatchPaths`, per-root `protectedStateRootResults`, and separate `localJobFileCacheMismatchPaths`. `appStateMutationDetected` is based only on protected-root differences; `cutting_job_files_v1` remains a separate byte-equivalence comparison. The local backup is a protected root and is read without mutation.

## CORS limitation

A browser network error has no HTTP response visible to JavaScript and can be caused by CORS or another network boundary, so `corsFailureSuspected` and `networkFailureSuspected` are suspicions, not diagnoses. Code alone cannot configure bucket CORS, and CORS is not authorization; Storage rules remain the authorization boundary.

If an operator authorizes another controlled test, the minimal bucket CORS policy should permit only `GET` from each **explicit trusted origin** used for that test (for example the exact production origin and exact selected Vercel preview origin), expose only the needed `Content-Type` response header, and use a short cache duration such as 300 seconds. Never use `*`. Bucket CORS must be reviewed and applied separately by an operator, then removed or retained only under an approved infrastructure policy; this repository does not change it.

## Next operator-only Vercel test

Do not run this procedure until a separate operator approval exists. Reuse the existing CFR-03 PR and preview; Vercel remains Framework Preset **Other**, empty Build and Install commands, output directory `.`, and clean URLs only.

1. Record the exact trusted preview origin and verify project `omax-maintenance`, bucket `omax-maintenance.firebasestorage.app`, and workspace `github-prod`.
2. Separately review an **operator-only temporary** test ruleset. It must use a placeholder replaced at deployment time with the one intended test UID (never committed), fix the workspace to `github-prod`, target the exact bucket, permit only a short-expiring isolated CFR-03 path, require that exact UID, create-only JSON, a maximum of 2,048 bytes, exact metadata, owner-only get/delete, and default-deny everything else. Authentication alone is insufficient for production workspace authorization.
3. If required, separately apply the minimal explicit-origin GET CORS policy described above. Do not use a wildcard origin.
4. Publish the temporary rules only for the scheduled test window. Run read-only diagnostics and confirm production flags remain false.
5. Run the helper once with exact confirmation. Require verified upload, metadata, download/content, cleanup deletion/absence, protected roots, and local cache; require no Firestore write or app-state mutation.
6. On any indeterminate result, do not retry. Preserve the exact structured result and investigate only `possibleOrphanPath` under a separate cleanup authorization.
7. Immediately restore the exact committed deny-all rules, confirm the rules release, and remove temporary CORS if it was approved only for the test.

## CFR-04 boundary

CFR-04 may design an authoritative workspace-membership mechanism and only then consider production cutting-file rules. CFR-03A does not implement production uploads/downloads, previews, per-job Firestore documents, imports, migrations, or local-cache cleanup.
