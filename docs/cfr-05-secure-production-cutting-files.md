# CFR-05 — secure production cutting-file workflow

**Implementation status:** The client workflow is implemented, and the reviewed Firestore and Storage rules in this repository mirror rules deployed manually to WJ TRACKER-V2. Rules were not deployed by this repository work. An operator subsequently reported a successful Vercel-preview upload and verified listing for one existing production job; this F04 code repair did not contact Firebase, upload/delete another object, mutate caches, or migrate production data. Preview/open fallback and cross-device behavior still require browser verification after this repair.

## Architecture and fail-closed gates

The legacy arrays in `workspaces/github-prod/app/state` remain authoritative. CFR-05 never calls `saveCloudNow` or `snapshotState` and never inserts cloud metadata or bytes into `cuttingJobs`, `completedCuttingJobs`, manual logs, deleted items, backups, or local storage. It creates only a compatibility job document and child file metadata after a successful immutable Storage create. Existing local references remain available and `cutting_job_files_v1`, including the 47 production-origin entries reported by the operator, is neither read nor changed.

Normal readiness is persistent and fail-closed. It requires initialized Firebase services, the exact `wj-tracker-v2` project, exact `wj-tracker-v2.firebasestorage.app` bucket, exact `github-prod` workspace, the production Firebase Auth UID `GntsaU7i2tXdDf05ds8cws5dfi63`, and a structurally valid active membership with the required role. Upload accepts owner/admin/operator; listing and download also accept viewer. `configureCfr05OperatorSession()` remains only as deprecated memory-only diagnostic compatibility and does not control readiness or use hostname as a security boundary.

## Authorization assumption that must be verified

Before changing or redeploying Storage rules, export and review the **currently deployed Firestore rules**, their deployment project/database, and any functions they call. Prove that `workspaces/{workspaceId}/members/{uid}` permits `get` only as intentionally required and denies ordinary web clients every `create`, `update`, `delete`, batch write, wildcard-parent write, and field-transform route. Prove no broader recursive match grants those writes; UID and document ID/workspace must agree; clients cannot change `active`, `role`, `uid`, or `workspaceId`; and only a trusted Admin SDK/operator path can bootstrap or promote membership. Emulator tests must demonstrate denial for self-enrollment, activation, role promotion, cross-UID, and cross-workspace writes while preserving the existing `app/state` policy. Any future rule change must repeat this review before deployment; this repair performs no deployment.

The exact bootstrap document, created only with Firebase Admin SDK or Console by a trusted project operator, is:

```json
{
  "schemaVersion": 1,
  "uid": "GntsaU7i2tXdDf05ds8cws5dfi63",
  "workspaceId": "github-prod",
  "role": "owner | admin | operator | viewer",
  "active": true,
  "createdAtISO": "<audited UTC ISO timestamp>",
  "updatedAtISO": "<same or later audited UTC ISO timestamp>",
  "email": "<optional informational email>"
}
```

Owner/admin/operator may upload; every active role may download/preview. No client membership editor exists.

## Paths, schemas, and state machines

Objects use `workspaces/{workspaceId}/cutting-jobs/{jobId}/files/{cryptographicFileId}/{safeFileName}`. IDs and filenames are bounded CFR-04 path segments. The single maximum is **52,428,800 bytes (50 MiB)** in both JavaScript and Storage rules. Only DXF, ORD, and OMX names and their documented MIME allowlist pass.

The create-only file document at `workspaces/{workspaceId}/cuttingJobs/{jobId}/files/{fileId}` contains exactly: `schemaVersion`, `workspaceId`, `jobId`, `fileId`, `originalName`, `safeFileName`, `extension`, `contentType`, `sizeBytes`, `storagePath`, `sha256`, `status`, `createdBy`, and `createdAtISO`. The compatibility document at `workspaces/{workspaceId}/cuttingJobs/{jobId}` contains only schema/workspace/job identity, the authoritative state path, exact creator UID, and creation time. Neither is a replacement for the full-state job.

Upload is a single awaited pass: preflight → membership validation → authoritative job validation → local File validation → SHA-256 → cryptographic ID/immutable path → direct create-only Storage upload → uploaded metadata verification → additive Firestore create → final read/validation → completed. It never retries. A definite failure after a confirmed upload but before file-reference creation triggers one exact-object delete and one absence check. An indeterminate Storage/Firestore outcome is never retried or deleted and reports its exact possible orphan path for manual review. Diagnostics omit content, tokens and URLs.

Download is: gates/membership → metadata read → strict metadata/path revalidation → exact Storage object → bounded in-memory Blob/ArrayBuffer → parser handoff or temporary object URL → unconditional URL revocation. Firebase v8's transient download URL may be used internally to fetch the Blob, but is never persisted or returned in diagnostics. Local safe references may still be preferred by the existing UI; cloud is the cross-device fallback.

The existing reference-folder, temporary local-upload, and OneDrive workflows remain available and coexist with secure cloud files; cloud metadata and bytes are not inserted into those legacy records or `cutting_job_files_v1`. The UI adds an explicit “Upload secure cloud file” action, accepts one selected DXF/ORD/OMX, disables the initiating control during the awaited operation, prevents concurrent uploads, and reports blocked, failed, indeterminate/orphan, or verified results. It does not add permanent deletion. A cloud success is announced only after final metadata verification; the legacy job object is deliberately not mutated.

## Reviewed rules, publication controls, rollback, and orphan handling

`storage.rules` mirrors the reviewed ruleset deployed manually; it is not deployed by this repository repair. It defaults all unrelated paths to deny, allows no list/update, scopes create/get/delete to the immutable path, validates authentication/membership/roles/path/custom metadata/type/50-MiB limit, and does not restore CFR-03. Delete exists solely for immediate definite failed-upload compensation: it requires the original uploader, every validated path/filename/metadata/membership check, and a request within 15 minutes of `resource.timeCreated`. After that strict window every client—including the creator, owner, admin, operator, and application code—is denied; another operator can never delete the creator's object.

Procedure for any future rule publication: (1) export/version the live Storage and Firestore rules; (2) complete the Firestore review/emulator denial matrix above; (3) bootstrap and independently validate the least-privilege member; (4) run Storage emulator tests; (5) deploy only the reviewed `storage.rules` to `wj-tracker-v2`; (6) verify the deployed rules hash/version; (7) verify persistent environment and membership diagnostics in an approved Vercel preview; (8) open the already verified Cloud Files listing after a refresh without uploading again, then verify download/preview through an operator-controlled process. Rollback immediately by redeploying the saved deny-all rules, clearing session gates, recording possible orphan paths, and avoiding retries/deletes until Firebase consoles/logs establish object and document state.

For an orphan, record only its path/stage/time/UID, inspect exact Storage object metadata and exact Firestore file document as a trusted operator, reconcile checksum and IDs, then either preserve the referenced object or delete the confirmed unreferenced object administratively. Never bulk-list/delete or guess after an indeterminate result.

## Vercel preview and later importer boundary

Use Framework Preset **Other**, empty Build and Install commands, and Output Directory `.`. Sign in with the provisioned test operator, inspect `getWorkspaceAuthorizationDiagnostics()` and `cfr05CloudCuttingFiles.diagnostics(...)`, refresh the page without F12 configuration, open Cloud Files for the existing verified attachment, and test phone download/preview without uploading it again. The first operator-run Vercel preview confirmed production readiness, one successful DXF upload, and a verified Firestore listing. Do not repeat that upload. This repair addresses the resulting presentation and Preview/Open defects without contacting Firebase; the repaired preview/fallback and cross-device flows still need verification in a subsequent preview.

A later cutting-job Excel importer is separate work. It must define backed-up, idempotent reconciliation and cutover rules; it must not infer that CFR-05 metadata documents are authoritative, upload existing caches, or restructure/migrate the full-state job arrays.

## CFR-05A persistent listing and Firebase v8 correction

Cloud metadata is not copied into either legacy job array. The normal Files column now hydrates each rendered job from its exact Firestore subcollection using a memory-only, in-flight-deduplicated cache; each presentation container carries its own job identity, so metadata discovery does not depend on Edit, Actions, or a Cloud Files button. Verified DXF bytes are fetched only when the selected preview target approaches the viewport, then metadata, size, and SHA-256 are verified before the limited renderer creates a session-only SVG data URL. The preview cache is keyed by job ID, file ID, and checksum and is never serialized. Unsupported DXFs show a truthful Download/Open fallback, while ORD/OMX remain Download/Open-only. The cloud-listing pipeline issues one exact-job query against `workspaces/{workspaceId}/cuttingJobs/{jobId}/files`, validates document ID plus every bounded field, displays only accepted records, and reports rejected record counts/reasons. This makes the listing reconstructible after navigation, refresh, or a new phone/shop session without local cache. Upload success re-runs that job query. No permanent-delete control exists.

Production download uses the Firebase v8 `Reference.getDownloadURL()` followed by a credential-less, abortable 60-second `fetch`. It checks HTTP status and declared and actual response size against 50 MiB. The transient token URL stays inside the request function and is never returned, logged, diagnosed, or persisted. Bytes remain in memory. Only DXF is offered to the existing limited browser preview renderer. ORD and OMX are truthfully labeled Download/Open-only because the repository has no proven native browser renderer for them. A preview is reported available only after its SVG is accepted by the controlled inline/dialog presentation pipeline. Temporary object URLs are always revoked.

Empty browser MIME is accepted for approved extensions and canonicalized to `application/dxf` for DXF or `application/octet-stream` for ORD/OMX. Conflicting non-empty types fail. JavaScript, Firestore metadata, Storage custom metadata, and reviewed rules enforce these canonical values.

Compatibility-job and file metadata creation is one non-retrying Firestore write batch after the compatibility job is read; the new cryptographic file document is never probed before create. Existing compatibility documents must contain only `schemaVersion`, `workspaceId`, `jobId`, `authoritativeStatePath`, `createdBy`, and `createdAtISO`, with exact identity/path agreement. The batch never overwrites an existing file. A definite batch failure leaves neither document from that batch and triggers the one-object compensation protocol; an indeterminate batch is never retried or cleaned automatically.

`configureCfr05OperatorSession()` is deprecated diagnostic compatibility only. Its values and hostname check do not participate in upload, listing, download, or effective-readiness blockers; Firestore and Storage rules are the security boundary. When publishing Storage rules that call `firestore.get()`, the operator must also confirm Firebase's required cross-service permissions/service-agent access for Storage Rules to read Firestore, and must roll back if those checks fail.

## CFR-05B reviewed Firestore rules and remaining live-test boundary

`firestore.rules` is wired alongside (not instead of) `storage.rules` in `firebase.json` and mirrors the reviewed rules deployed manually. No deployment occurred during this repair. It preserves the production-UID lock for `workspaces/github-prod/app/{document=**}` and the exact `workspaces/github-prod` metadata document, without reopening arbitrary workspace children. Membership is own-document get-only, client immutable, and validated before use. Compatibility job/file documents are exact-schema, create-only, immutable, non-deletable, and writer-created; exact-job file-subcollection listing is active-member-only, while every returned document is strictly validated and rejected client-side if invalid. File create uses `existsAfter`/`getAfter` to require the exact valid compatibility job after the same atomic batch. Logs and unmatched paths remain denied.

Before any live attachment test, operators must confirm the deployed rule versions, membership protection, individual metadata access, Storage Rules cross-service Firestore access, and a valid administratively created membership. This repair did not inspect authoritative production job counts. A live test must use an existing legitimate authoritative job and must never create a synthetic production job merely to hold files. The operator-reported upload/listing succeeded before this repair. The repaired normal-file-area presentation, DXF preview/fallback, navigation refresh, and cross-device behavior remain unverified by this code-only repair.

Before any preview/open, the client now validates Firestore metadata, reads Storage object metadata and compares the exact path, size, canonical MIME, and every required custom field, downloads with the bounded Firebase v8 path, recomputes SHA-256, and refuses every mismatch. URLs/tokens and preview payloads remain absent from returned diagnostics.
