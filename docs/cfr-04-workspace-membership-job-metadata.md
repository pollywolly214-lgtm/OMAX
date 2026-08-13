# CFR-04 — authoritative membership and cutting-job metadata foundation

**Inspection date:** 2026-08-13. **Scope:** static repository work only. No browser, Firebase session, production read/write, rule deployment, Storage operation, cache mutation, or migration was performed.

## Pre-edit inspection and planned files

Before editing, the repository was inspected for `AGENTS.md` (none exists), package configuration (`package.json` is absent), Git state, Firebase configuration, Storage rules, Vercel configuration, authentication/workspace code, all cutting-job/file/log/cache references, and CFR-01 through CFR-03 code, tests, and documents. The exact planned change set was: add `js/cfr04WorkspaceMetadata.js`, add `tests/cfr04-workspace-metadata.test.js`, add this document, load the module from `index.html`, and expose its read-only diagnostic from `js/core.js`. `storage.rules` and `vercel.json` were explicitly excluded from modification.

## Confirmed architecture

The static site loads Firebase 8.10.1 namespaced/compat SDKs. `initFirebase` initializes the configured app, Auth, Firestore and an explicitly selected `gs://omax-maintenance.firebasestorage.app` Storage service. Auth uses local persistence and `onAuthStateChanged`; `FB.user.uid` is the identity. The existing sign-in UI still creates a Firebase Auth account after `auth/user-not-found`. That creates only an Auth identity—it does **not** create membership and grants no CFR-04 authorization.

`WORKSPACE_ID` is the validated constant `github-prod`. Signed-in state continues to point `FB.docRef` at the authoritative `workspaces/github-prod/app/state` document. CFR-04 does not change its reads, writes, schema, or authority. The new membership diagnostic reads only the exact current user's membership document.

The repository has no `firestore.rules` and `firebase.json` configures only `storage.rules`; therefore the deployed Firestore policy cannot be established from this repository. CFR-04 neither invents nor deploys rules. A future reviewed Firestore proposal must preserve existing `app/state` access while making membership client-read-only and operator/server-write-only; it must not weaken existing access.

`storage.rules` remains byte-for-byte deny-all. Production upload/download flags remain false. The confirmed bucket CORS configuration is external and unchanged.

## Existing cutting-job and file structures

* Active `window.cuttingJobs` and `window.completedCuttingJobs` are embedded in the full-state document. Jobs contain business fields, `manualLogs: [{dateISO, completedHours}]`, and `files` attachment entries. Completion retains the ID and shallow-copies logs/files. Deletion may clone jobs into `deletedItems.payload`; `cuttingJobDatabase` and state/undo/import flows can also carry job-shaped data.
* Existing attachments include legacy `{name,dataUrl,type,size,addedAt}` and local WJ Cuts references (IDs/names/types/sizes, relative paths, root IDs/signatures, timestamps). OneDrive entries can carry drive/item/eTag references and generated `preview.content`. Browser preview code uses `ArrayBuffer`, decoded DXF/ORD/OMX-like text, SVG data URLs, transient Blob URLs, and local/OneDrive sources.
* `cutting_job_files_v1` retains local attachment `dataUrl` values and is reapplied during state adoption. `cutting_job_onedrive_preview_cache_v1` stores generated SVG data URLs. `omax_local_state_backup_v1` stores a compact full-state backup. CFR-04 does not read, clear, migrate, rewrite, reorder, or normalize any of them.
* CFR-01 documented the full architecture/threat model. CFR-02 added the recursive content firewall and deterministic tests. CFR-03 added an explicitly confirmed isolated test round trip and diagnostics. CFR-04 does not call CFR-03 and performs zero Storage operations.

## Authoritative membership schema

Path: `workspaces/{workspaceId}/members/{uid}`.

The bounded schema is exactly `schemaVersion: 1`, `uid`, `workspaceId`, `role`, `active`, `createdAtISO`, `updatedAtISO`, plus optional informational `email`. Allowed roles are `owner`, `admin`, `operator`, and `viewer`. UID must match the document ID; workspace must match the parent path; timestamps are UTC ISO strings. Email is never authorization. Unknown fields, inactive records, mismatches, malformed IDs, and unknown roles fail closed.

Ordinary client code has no membership create/update/promote method and never self-enrolls. A missing record is reported as `membership_document_missing`. `getWorkspaceAuthorizationDiagnostics()` reports signed-in state/UID, workspace, expected path, existence, structural validity, role, active status, readiness and stable blocker codes. It returns no token, credential, URL, or file content.

### Future trusted bootstrap (not performed)

After reviewed Firestore rules exist, a trusted operator must use the Firebase Admin SDK or Firebase Console while authenticated as an authorized project administrator—not this web client—to create `workspaces/github-prod/members/{exactFirebaseAuthUid}` with all schema fields. The operator must copy the UID from Firebase Authentication, set the same UID and `github-prod` in the record, choose one allowed least-privilege role, set `active: true`, use server/audited current UTC ISO creation/update times, optionally add email only for display, then independently read and validate the exact document. No production membership document was created here.

## Additive metadata and path map

| Kind | Path |
|---|---|
| Authoritative legacy state (unchanged) | `workspaces/{workspaceId}/app/state` |
| Membership | `workspaces/{workspaceId}/members/{uid}` |
| Future job metadata | `workspaces/{workspaceId}/cuttingJobs/{jobId}` |
| Future manual-log metadata | `workspaces/{workspaceId}/cuttingJobs/{jobId}/logs/{logId}` |
| Future file metadata | `workspaces/{workspaceId}/cuttingJobs/{jobId}/files/{fileId}` |
| Future immutable object | `workspaces/{workspaceId}/cutting-jobs/{jobId}/files/{fileId}/{safeFileName}` |

All IDs are bounded path segments (`[A-Za-z0-9][A-Za-z0-9_-]{0,127}`, workspace maximum 64 characters). Builders reject slashes, traversal, controls, empty segments, and overlong IDs. Safe names are NFKC-normalized, basename-only ASCII, maximum 120 characters, and restricted to DXF/ORD/OMX.

Job metadata is bounded to identity, workspace, name (200 characters), `active|completed`, creator UID and timestamps. Log metadata is bounded to identity/workspace/job, date, 0–24 finite completed hours, creator and timestamp. The canonical production file schema is exactly `schemaVersion`, `workspaceId`, `jobId`, `fileId`, `originalName`, `safeFileName`, `extension`, `contentType`, `sizeBytes`, `storagePath`, `sha256`, `status`, `createdBy`, and `createdAtISO`; it uses canonical MIME values, a 50 MiB maximum, an exact immutable object path, a 64-character lowercase SHA-256, and `status: ready`. Validators reject unknown fields and all File/Blob, ArrayBuffer/view, base64, data/blob URL, raw CAD text, preview markup, and other embedded content representations.

These collections are definitions only. No job/log/file document is read, written, mirrored, or made authoritative in CFR-04.

## Blockers and CFR-05 boundary

Production file authorization is blocked until (1) a trusted operator creates a valid active membership, (2) reviewed Firestore access permits the necessary membership read without permitting client enrollment/promotion, and (3) CFR-05 reviews and deploys production Storage rules. Current deny-all Storage rules independently block every transfer.

CFR-05—not CFR-04—will create/review production Storage rules and connect upload, download, and preview behavior only after authoritative membership exists. It must preserve the full-state authority until a separately reviewed migration, retain local caches, and validate immutable object metadata. CFR-04 performs no production mutation and does not alter CORS.
