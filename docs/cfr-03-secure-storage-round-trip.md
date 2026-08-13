# CFR-03 — Secure Storage rules and isolated round-trip test

**Status:** reviewed rules and a manually triggered test helper only. Production cutting-file uploads and downloads remain disabled. No live Storage or Firestore operation was performed during implementation.

## Authorization model and production blocker

The browser uses Firebase v8 email/password authentication. A missing account may be created by the sign-in flow. After authentication, client code assigns every user the constant workspace `github-prod` and routes Firestore to `workspaces/github-prod/app/state`. This proves identity and client routing only; it does not prove workspace membership.

The repository has no authoritative workspace-membership record, role, custom claim check, or checked-in Firestore rule that Storage rules can use. Client workspace IDs, metadata, email addresses, filenames, and UI state are not authorization. Production workspace authorization is therefore **not ready**. CFR-04 must define and administratively provision an authoritative membership mechanism before any production cutting-file rule can be considered.

## Rules boundary

`firebase.json` identifies `storage.rules`; it adds no Hosting behavior. The rules are default deny and expose only:

```text
workspaces/{workspaceId}/cfr03-tests/{uid}/{testId}/cfr03-test.json
```

The workspace is a safe 1–64 character segment, the UID is a safe 1–128 character segment and must exactly equal `request.auth.uid`, and the test ID is exactly 32 lowercase hexadecimal characters. Creates require a previously absent object, non-empty content no larger than **2,048 bytes**, and exact `application/json` content type. Only that UID may get or delete the exact object. There is no update/overwrite or list permission. JSON cannot be served as arbitrary HTML or executable content under these rules.

The final catch-all denies all other reads and writes. This includes, without relying on name-specific exceptions:

- `workspaces/{workspaceId}/cutting-jobs/**`
- `cutting-jobs/**`
- `completed-cutting-jobs/**`
- `previews/**`
- `uploads/**`
- `originals/**`

The CFR-03 namespace does not establish workspace membership. It is deliberately useful only as a same-UID capability probe; production paths remain denied.

## Manual helper and state machine

The page exposes only `runCfr03StorageRoundTripTest(options)`. It does nothing to Storage unless `options.confirmation` exactly equals `CFR03 STORAGE TEST`. It then performs one non-retrying pass:

1. Validate signed-in UID, exact project `omax-maintenance`, bucket `omax-maintenance.firebasestorage.app`, existing workspace `github-prod`, Storage availability, and safe segments.
2. Generate a 128-bit test ID with `crypto.getRandomValues`. There is no insecure randomness fallback.
3. Build in memory a compact JSON object containing only `testId` and `timestamp`.
4. Upload once to the exact test path. Rules enforce create-only behavior; a collision fails rather than overwrites.
5. Await completion, then verify metadata path, byte size, content type, UID, workspace, and test ID.
6. Obtain the exact object's download URL, read it with a no-store fetch, and compare the returned text byte-for-text with the generated JSON.
7. Delete the same reference once, await it, and confirm `getMetadata()` returns `storage/object-not-found`.

No upload, delete, or indeterminate operation is automatically retried. A failure after a completed upload returns a warning that the exact object may remain. The helper does not list objects or expose a general-purpose upload API.

## Structured result and state protection

Every return includes `generatedAtISO`, confirmation/configuration/identity fields, the test path and ID, attempted/completed/verified flags for upload, metadata, download, content, deletion, and absence, plus `operationIndeterminate`, `failedStage`, a bounded error, and warnings. `firestoreWriteAttempted` is always false.

Before any validation, the helper fingerprints all protected application roots named by CFR-03 plus the raw local backup. It separately fingerprints the raw `cutting_job_files_v1` value. Canonical comparison ignores only transient diagnostic/save/sync timestamps; it does not call `snapshotState()`, write localStorage, or hydrate/normalize state. After the operation it reports `protectedStateMatched`, `localJobFileCacheMatched`, and `appStateMutationDetected`. It never calls a Firestore reference, `saveCloudNow()`, `saveCloudDebounced()`, or a cutting-job/cache helper.

Diagnostics retain the CFR-02 fields and add the expected rule version, disabled production flags, helper/namespace information, the absent membership mechanism and blocker, and a bounded summary of the last result in the current page session. Diagnostics do not claim repository rules are deployed. A successful authenticated round trip proves only that the tested operations behaved as observed; operator review must still confirm the published ruleset.

## Publication procedure (operator action only)

Do not publish from an unreviewed development environment. After review, use one of these operator-controlled methods:

1. **Firebase Console:** open project `omax-maintenance` → Storage → Rules; compare the complete console editor content with repository `storage.rules`; publish it; record the rules release/version and reviewer.
2. **Existing configured Firebase CLI:** from the reviewed commit, first verify the selected project is exactly `omax-maintenance` (`firebase use`), review `firebase.json` and `storage.rules`, then run `firebase deploy --only storage --project omax-maintenance`. Do not install CLI tooling solely for CFR-03.

Rollback means republishing a reviewed deny-all Storage ruleset. Rules rollback cannot remove an object left by an interrupted/indeterminate test. Such an object must not be guessed, bulk-listed, or automatically cleaned up: preserve the returned exact `objectPath`, investigate the operation, and perform a separate explicitly authorized exact-path cleanup. The payload contains no business data.

## Manual Vercel test procedure

Use this CFR-03 PR's preview throughout corrections. Vercel must use Framework Preset **Other**, empty Build and Install commands, output directory `.`, and the repository's clean-URLs-only configuration.

1. Publish the reviewed Storage rules through an operator-controlled procedure above.
2. Open the PR preview, sign in with the intended Firebase Auth test user, and run `getCloudCutFileStorageDiagnostics()`. Confirm project, bucket, workspace, initialized Storage, disabled production flags, blocker, and namespace. Do not interpret this read-only output as deployed-rules proof.
3. Capture read-only application and browser-local cache audit results. Do not edit or clear the 47 local data URLs.
4. Manually run `await runCfr03StorageRoundTripTest({ confirmation: "CFR03 STORAGE TEST" })` once.
5. Require `uploadCompleted`, `metadataVerified`, `downloadCompleted`, `contentVerified`, `deleteCompleted`, `absenceVerified`, `protectedStateMatched`, and `localJobFileCacheMatched` to be true; require `firestoreWriteAttempted` and `appStateMutationDetected` to be false.
6. If `operationIndeterminate` is true or a warning says an object may remain, do not rerun. Preserve the exact result for operator investigation.
7. In browser network tools, confirm there was no Firestore write and no request to a production cutting-file path.

Implementation tests use mocks only. No authenticated write, emulator rules test, production round trip, import, repair, migration, cleanup, or deletion was run while developing CFR-03.

## CFR-04 boundary

CFR-04 may design authoritative workspace membership and, only after review and provisioning, production cutting-file authorization. CFR-03 does not implement production uploads/downloads, previews, per-job Firestore documents, cutting-job or pump-log imports, migrations, or local-cache cleanup.
