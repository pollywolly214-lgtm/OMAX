# CFR-01 — Cloud cutting-file storage audit and implementation design

**Status:** design only; no application, Firebase, Storage-rule, Firestore, import, or migration change is part of CFR-01.
**Audit basis:** static inspection of this repository on 2026-08-13. No production data, browser, Firebase console, Firestore, bucket, upload, or cross-device operation was exercised.

## 1. Scope, facts supplied by the operator, and terminology

Operator-confirmed infrastructure (not independently tested by this audit): Firebase project **OMAX-Maintenance** (`omax-maintenance`); authoritative Firestore database `(default)` in `us-south1`; authoritative state document `workspaces/{workspaceId}/app/state`, currently `workspaces/github-prod/app/state`; empty Standard-class bucket `gs://omax-maintenance.firebasestorage.app` in `US-EAST1`; Storage currently denies access until intentional authenticated rules are deployed; Blaze/free-trial billing is finite. The checked-in Firebase config instead spells the bucket as `omax-maintenance.appspot.com`; CFR-01 does not change config. CFR-02 must have the operator/Firebase console resolve the canonical bucket name before initialization.

In this document **confirmed** means demonstrated by checked-in code (or explicitly supplied infrastructure facts). **Hypothesis/risk** is not a diagnosis of the previous incident. “File metadata” always means bounded scalar metadata—not a `File`, `Blob`, buffer, content string, object URL, directory handle, or generated artifact.

## 2. Confirmed current architecture

### 2.1 Firebase integration and authorization

| Concern | Confirmed implementation |
|---|---|
| SDKs | `index.html:18-20` loads Firebase App, Auth, and Firestore **8.10.1** CDN scripts. There is no Storage SDK script. |
| API style | Firebase v8 compat/namespaced API: `firebase.initializeApp`, `firebase.auth()`, `firebase.firestore()`, collection/document chains. It is not the v9+ modular API. |
| Configuration | `index.html:26-34` defines `window.FIREBASE_CONFIG`; `js/core.js:initFirebase` initializes/reuses the first app and applies Firestore settings. |
| Authentication | Email/password in `initFirebase`; persistence is `firebase.auth.Auth.Persistence.LOCAL`; `onAuthStateChanged` gates setup/load. The sign-in helper can create an Auth user when `auth/user-not-found` occurs. |
| Firestore | `FB.db = firebase.firestore()`. After sign-in, `FB.workspaceDoc` is `workspaces/github-prod` and `FB.docRef`/`FB.workspaceRef` is its `app/state` document. A realtime document listener is then installed. |
| Storage | Not imported, initialized, referenced, or used by application JavaScript. The Python preview prototype uses only local filesystem paths and is not Firebase Storage integration. |
| Workspace ID | `js/core.js:18-26` returns the constant `github-prod` for browser and non-browser contexts despite the comment mentioning hostname selection. It is neither an auth claim nor user choice. |
| Workspace authorization | No custom-claim, membership-document, or user-record workspace authorization check was found. Any current restriction beyond “signed in” must therefore live in external rules not represented here. A constant client workspace ID is not authorization. |

**Security consequence:** Storage rules cannot safely claim an existing membership model exists. Before writes are enabled, the operator must choose and provision an auditable authorization source. The least invented interim rule is a specific UID allowlist supplied by the operator; the durable recommendation is a Firestore membership document created administratively, not by the client being authorized.

### 2.2 Authoritative full-state save/load

| Function/state | Confirmed behavior |
|---|---|
| `snapshotState()` (`js/core.js:4010`) | Builds one large state object containing protected collections, active/completed jobs, their logs and files metadata, `cuttingJobDatabase`, trash, layouts, configuration, and revision metadata. Before returning it, it copies any attachment `dataUrl` into localStorage cache `cutting_job_files_v1`, then strips strings considered embedded from only each active/completed job's `files` entries. Trash payloads and `cuttingJobDatabase` are cloned without the same job-file-specific stripping. |
| `compactStateForStorage()` and sanitizers (`js/core.js:760-835`) | Recursively trim/omit some large or file-like string values and impose history bounds. This is automatic sanitization, so it is not the required deterministic “fail, report paths, do not alter” firewall. |
| `saveCloudDebounced()` (`js/core.js:6169`) | Applies cloud gates, marks pending changes, normalizes settings/captures undo history, and invokes debounced `saveCloudInternal`. |
| `saveCloudNow()` (`js/core.js:6190`) | Same gates/preparation, then uses the debouncer's `now`/flush route and returns its result where possible. |
| `saveCloudInternal` (`js/core.js:5708`) | Takes and compacts the full snapshot; checks maintenance/core reductions and estimated bytes (warn 850,000; strong warning 900,000; block 975,000); reads latest remote and local backup; runs revision and protected-state preflight; merges only `totalHistory`, `dailyCutHours`, and `pumpEff`; attempts a local backup; writes the whole state with `FB.docRef.set(snap,{merge:true})`; updates baselines and bounded save logs. Local-backup failure is not a hard prerequisite. |
| Protected preflight | Registry/coverage machinery checks required paths, shapes, counts/fingerprints, baseline/remote/local comparisons, schema coverage, and dangerous reductions. It does **not** recursively reject browser binary types and exact content indicators throughout every job-bearing root. |
| Schema coverage | `REQUIRED_PROTECTED_DATA_PATHS`, `PROTECTED_FIELD_REGISTRY`, `getSaveSchemaCoverageReport`, and `validateProtectedSavePreflight` cover named protected collections and nested logs. This guards omission/reduction, not a strict metadata schema for attachments. |
| Revision behavior | `syncMeta.rev` is time-based/monotonic per client; the remote revision is read and compared to `window.__loadedCloudRevisionForSaveGuard`. A newer conflicting remote blocks. The subsequent write is a normal `set`, not a Firestore transaction/precondition; another client can write between read and set (TOCTOU), so this is not true atomic CAS. |
| `__lastLoadedCloudState` | Baseline assigned on cloud load, accepted listener updates, seed, and successful saves; used for preservation, metrics, preflight, and conflict checks. Some successful explicit traces delay/reassign it. It is memory-only but its contents can be cloned into snapshots (for example `cuttingJobDatabase`). |
| `adoptState(doc)` (`js/core.js:5301`) | Normalizes and installs the loaded state; absent active/completed arrays become empty arrays, clears pending new-job files, restores OneDrive configuration to localStorage, and applies cached attachment data URLs back onto in-memory jobs. Thus an adopted cloud record can acquire browser-cached content in memory. |
| `loadFromCloud()` (`js/core.js:6274`) | Reads `app/state`; can migrate a meaningful legacy workspace-root document; prefers cloud when meaningful and only warns on a newer local backup; otherwise adopts backup in blocked local-only mode; otherwise seeds defaults and writes them (outside recovery mode). Recovery mode suppresses migration/seed writes. |
| Listener | Ignores own pending writes, defers around local changes, revision-orders incoming state, adopts it, and rerenders. |
| Backup/recovery | `persistLocalStateBackup` uses localStorage key `omax_local_state_backup_v1` with emergency/tiny fallback logic; undo history stores JSON snapshots in memory; recovery mode blocks normal writes; deleted items provide frontend trash; save logs contain diagnostics rather than full backups. Legacy migration and first-run seeding remain distinct write paths. |

### 2.3 Cutting-job records, logs, lifecycle, and IDs

Active jobs are `window.cuttingJobs`; completed jobs are `window.completedCuttingJobs`. A new record constructed in `js/renderers.js:22615-22620` has `id: genId(name)`, name, estimate/start/due/project/material/cost/rate/priority/category, `manualLogs: []`, and cloned pending `files`. `genId` normalizes a name and appends only `Date.now().toString(36)`; it is usually stable after creation but is not collision-proof and legacy/import IDs may have other forms. Paths must treat existing IDs as opaque and encode/validate them, never regenerate them from names.

Manual logs are embedded arrays of `{dateISO, completedHours}`, mutated and sorted in `js/renderers.js:23560-23595`. Completion uses `completeCuttingJob`/`buildCompletedJob` (`js/core.js:3548-3683`): it preserves the same job ID, shallow-copies manual logs and file entries, removes the active row, appends a completed row and efficiency summary, then requests debounced and immediate saves. Deleting active or completed jobs calls `recordDeletedItem` before removal; trash entries clone the entire payload. Restore can put that payload back. Consequently attachment content present in a job can also enter `deletedItems`.

`findJobRecord` was not found. Equivalent lookups are repeated `cuttingJobs.find`, `completedCuttingJobs.find`, and `addWJCutsReferenceToJob`, which searches active first then completed. A future shared `resolveCuttingJob(workspaceId, jobId)` must reject absent/ambiguous IDs and return lifecycle state without changing the ID.

### 2.4 File inputs, references, and local storage

The attachment surface allows `.dxf`, `.ord`, and `.omx` references. Local WJ Cuts attachment is the operative durable route: `showDirectoryPicker({mode:"readwrite"})` selects a root, `showOpenFilePicker` selects a file, `rootHandle.resolve(fileHandle)` computes the relative path, and only a sanitized reference is placed in a job. `filesToAttachments` currently warns that local uploads are temporary and returns `[]`; it does not attach or upload selected bytes.

Bounded-looking WJ reference fields are `id`, `name`, MIME `type`, `size`, source, root label/path start, `relativePath`, attach time, `localRootSignature`, local device/profile/root IDs, note, and location hint. The sanitizer bounds types but **not string lengths**, so it is not yet a bounded schema.

Local-reference persistence:

* IndexedDB database `wj_cuts_local_root_db`, object store `handles`, keys `root` and `profile:{profileId}` store `FileSystemDirectoryHandle` structured clones. No other IndexedDB state cache was found.
* Browser-local IDs/profile selection use localStorage (`cutting_job_onedrive_device_id_v1`, `cutting_job_current_profile_local`). Shared reference-folder configuration is also in the Firestore snapshot and mirrored to `cutting_job_onedrive_config_v1` localStorage.
* Root marker `.wj-cuts-root.json` contains a generated `rootId`, created timestamp and label. A separate signature hashes the root name and at most 200 sorted immediate entries; it can change as files change and is weaker than the stable marker ID.
* Saved handles require `queryPermission`/user-triggered `requestPermission`; handles are origin/browser/profile/computer local. Phones and other computers must not be assumed to possess or be allowed to use them.
* Pending attach target is closure state `{mode:"job",jobId}` or `{mode:"new"}`; new-job references live in nonpersistent `pendingNewJobFiles`. Existing lookups cover active and completed arrays.
* Local open/preview resolves the relative path under an authorized handle. Current status checks root ID, but one resolver can use a legacy path without first proving the per-file signature; the new design must require exact marker/root signature plus relative path before preferring local.

LocalStorage content exposure is confirmed:

* `cutting_job_files_v1` stores attachment `dataUrl` strings copied from active/completed jobs, and `adoptState` rehydrates them.
* `cutting_job_onedrive_preview_cache_v1` stores generated SVG **data URLs** keyed by OneDrive drive/item/eTag.
* `omax_local_state_backup_v1` stores a compacted full-state JSON backup and can therefore contain anything that survives compaction, including cloned trash or unexpected job-bearing roots.
* OneDrive configuration/library and ordinary layout/config keys store metadata. No File System handle is intentionally written to localStorage.

### 2.5 Content and preview handling map

| Location/function | Confirmed content operation and exposure |
|---|---|
| `js/renderers.js:2023-2199` | Parses text-like CAD, generates an SVG data URL, uses `file.text()` for DXF/ORD/OMX, and uses `FileReader.readAsDataURL` for images. `filesToAttachments` currently discards local selections. |
| `js/preview/dxfPreview.js` | Decodes an `ArrayBuffer` with `TextDecoder` and generates SVG data URLs. Despite its name, parsing is a limited text/DXF-like entity parser, not proof of full ORD/OMX support. |
| `js/onedrive/graph.js` and `js/renderers.js:2226-2270` | Downloads OneDrive content as `ArrayBuffer`, decodes it, generates a data-URL preview, assigns `file.preview.content`, and stores it in localStorage preview cache. This mutates an attachment object in an active/completed job. |
| `resolveAttachmentPreview` | Accepts `previewUrl` data/HTTP URLs, existing in-memory `preview.content`, local references, OneDrive, and legacy `dataUrl`/`url`; it can therefore introduce preview content into job objects. |
| `triggerFileDownload` | Wraps a locally resolved `File` in a `Blob`, creates an object URL, clicks a download, and revokes it after five seconds. JSON/CSV exporters use similar temporary Blob/object URLs. These should remain transient and outside records. |
| `preview_omx.py` | Local Python parser for `[0]` OMX text point records and bulge arcs. It is a prototype, not wired into the static web app. |
| `render_dxf.py` | Local `ezdxf` renderer for selected DXF entities, writing SVG and optionally PNG/metadata. |
| `omax_preview/converters.py` | ORD/OMX high-quality conversion requires configured OMAX Layout executable/script or Windows UI/AutoHotkey automation; text fallback is approximate. |
| `omax_preview/job_pipeline.py` | Local-filesystem prototype with a 200 MiB input maximum and local preview job JSON. It neither authenticates nor uses Firebase and is not a production service. |

**Capability conclusion:** browser DXF previews exist but are partial and emitted as data URLs. Browser ORD/OMX are merely attempted through the same limited text parser; reliable native format support is not confirmed. The prototype confirms high-quality ORD/OMX conversion depends on external OMAX/Windows tooling, while OMX/ORD text fallback is approximate. Therefore the cloud design must support an operator-supplied bounded PNG or PDF preview (PNG preferred for inline phone viewing; PDF explicitly opened) and a clear `preview unavailable` status. Generated SVG can be uploaded only as a separately validated bounded Storage object, never embedded.

## 3. Confirmed embedded-content exposure paths

1. A legacy/current attachment with `dataUrl`, `previewUrl`, `preview.content`, `content`, or similar fields can reside inside `cuttingJobs`; completion shallow-copies it to `completedCuttingJobs`.
2. OneDrive/local preview resolution mutates the attachment with `preview: {mode, content}` where content may be a full SVG data URL.
3. Deletion clones the entire job into `deletedItems.payload`; workspace trash snapshots can clone broader state.
4. `snapshotState` strips detected strings only inside `cuttingJobs[*].files[*]` and `completedCuttingJobs[*].files[*]`. It does not reject values; it silently omits them. Nested objects such as `file.preview.content`, typed values, `deletedItems`, `cuttingJobDatabase`, or a future job-bearing root are not comprehensively covered by that routine.
5. Compaction may strip other obvious strings, but this is heuristic sanitization rather than an impossibility boundary. Anything missed can reach `FB.docRef.set`, hence `workspaces/github-prod/app/state`, local full-state backup, and any exported/state diagnostic snapshot.
6. `cutting_job_files_v1` deliberately retains active/completed `dataUrl` values, while the OneDrive preview cache retains SVG data URLs; adopt can reinsert the first into job records.
7. IndexedDB was found to store directory handles only, not a state/file cache. In-memory undo JSON uses `snapshotState`, so it receives the stripped/compacted behavior applicable at capture time, not the proposed firewall.

## 4. Unproven risks (not incident findings)

There is **no evidence in this static audit proving** that embedded CAD or preview content caused the previous production loss. Plausible risks include: a near/over-1-MiB state blocked from saving; localStorage quota causing incomplete backup; a stale/partial whole-state writer; read-then-write revision race; silent sanitizer omission; seed/migration/adoption behavior; or embedded content amplifying any of these. Determining causation requires preserved production exports and logs, which CFR-01 intentionally did not access.

It is also unproven that every existing production job ID is unique, every legacy `files` shape is known, the checked-in and console bucket names resolve identically, current Firestore rules enforce workspace membership, or the Python conversion prototypes can safely process real production CAD. These require read-only/operator-approved validation before implementation.

## 5. Scaling assessment and job-document recommendation

Firestore's 1 MiB document maximum makes unlimited import of jobs plus histories into `app/state` unsustainable. Today both job arrays, nested logs/files metadata, trash, maintenance histories, inventory/orders, layouts, and diagnostics participate in array-based whole-document writes. Each edit rewrites the arrays and contends on one revision; the 975,000-byte client block is close to the platform ceiling and JSON estimation is not an exact Firestore encoded-size measurement. Growth is monotonic enough (completed jobs, logs, deleted payloads, other histories) that “currently fits” cannot be a capacity plan.

| Design | Assessment |
|---|---|
| **A. Arrays in `app/state`** | Lowest immediate change, highest size/contention/data-loss blast radius; unsafe for bulk historical import. |
| **B. One document per job** | Removes job growth from state and narrows writes, but an unbounded job document can still hit 1 MiB via logs/metadata. |
| **C. Job documents + bounded embedded logs** | Safe only with a hard log count/byte cap and archival strategy; good read cost for normal UI but truncation/overflow semantics add risk. |
| **D. Job documents + log subcollections** | Safest unbounded history model: narrow transactional job updates, independent pagination, no job-level history ceiling. More reads/writes/indexes and lifecycle queries must be designed for Blaze cost control. |

**Recommendation: D**, introduced additively and without rewriting existing production state. Proposed documents:

```text
workspaces/{workspaceId}/cuttingJobs/{jobId}
workspaces/{workspaceId}/cuttingJobs/{jobId}/logs/{logId}
```

The job document holds lifecycle (`active|completed|deleted`), bounded job fields, bounded file-version metadata or references to a file metadata subcollection if versions grow, summary hours/counts, and revision. Logs are immutable/stable-ID documents. Query with pagination and explicit limits. To control operations, batch reads, avoid listeners over all history, cache only bounded metadata, and define retention only by operator policy—never silently truncate protected logs.

Migration safety: CFR-02 first adds firewall and read-only diagnostics to the legacy state. A later release dual-reads new documents only when an explicit schema/feature marker says they are authoritative. Backfill is a separate, backed-up, idempotent migration; until operator reconciliation, legacy arrays remain untouched and authoritative. Do not dual-write blindly: use an outbox/migration ledger and explicit cutover because Firestore cannot atomically transact `app/state`, arbitrary job/log documents, and Storage objects as one unit.

## 6. Recommended final separation and schemas

### 6.1 Immutable Storage paths

Treat existing workspace/job IDs as opaque IDs after validating they match a conservative path-segment policy (recommended `[A-Za-z0-9_-]{1,128}`); legacy IDs that fail receive a deterministic SHA-256-derived path key stored in metadata, not a changed business ID. Use a random/ULID version plus checksum prefix, never a mutable integer alone:

```text
workspaces/{workspaceId}/cutting-jobs/{jobPathKey}/originals/{fileVersion}/{safeFilename}
workspaces/{workspaceId}/cutting-jobs/{jobPathKey}/previews/{fileVersion}/{previewFilename}
```

`safeFilename` is basename-only, Unicode-normalized, strips control/path characters, uses an allowlisted character set, preserves a lower-case allowlisted extension, and is length-bounded (recommend 120 UTF-8 bytes). `fileVersion` is immutable and unique (for example `01H...-<12 checksum chars>`). Replacement creates another version; never overwrite. Do not list bucket roots for normal UI: retrieve by recorded path. Do not persist public or tokenized download URLs; request an authenticated download URL/reference only when needed and do not treat it as identity.

### 6.2 Bounded Firestore file metadata

Store this in the job document (with a maximum number of current/recent entries) or a file metadata subcollection when version history is unbounded:

```json
{
  "id": "stable attachment id",
  "role": "original",
  "originalName": "customer part.dxf",
  "safeName": "customer_part.dxf",
  "extension": ".dxf",
  "contentType": "application/dxf",
  "sizeBytes": 12345,
  "checksumSha256": "64 lower-case hex characters",
  "storagePath": "workspaces/github-prod/cutting-jobs/<key>/originals/<version>/customer_part.dxf",
  "previewStoragePath": "workspaces/github-prod/cutting-jobs/<key>/previews/<version>/preview.png",
  "previewContentType": "image/png",
  "previewSizeBytes": 4567,
  "uploadedAtISO": "2026-08-13T00:00:00.000Z",
  "uploadedByUid": "firebase uid",
  "version": "immutable version token",
  "localRelativePath": "project/customer_part.dxf",
  "rootSignature": "wj root marker/root identity",
  "status": "ready"
}
```

Justification: existing records use stable attachment ID/name/type/size, attach time, relative path, root signature/root ID; cloud adds checksum, immutable version, authenticated owner audit, object paths and preview facts. Bound every string (names 255 bytes, paths 1,024 bytes, IDs/version 128, content type 100, local path 1,024), numeric ranges, metadata entry count, and allowed enums. Store `null`/omit unknown facts—never invent them. `role` should be `original`; preview fields describe a derivative of the same version. `status` is a bounded enum such as `unverified|ready|failed|orphaned|superseded`, not arbitrary logs. Object custom metadata should contain only server/known values (`workspaceId`, `jobId`, `fileId`, `version`, checksum, uploader UID) and be cross-checked; it is not authorization by itself.

Firestore contains records/logs/metadata/paths/checksums only. Storage contains original DXF/ORD/OMX and preview PNG/PDF/bounded SVG. IndexedDB contains optional local handles only. None of `File`, `Blob`, `ArrayBuffer`, typed arrays, base64, data/blob URLs, raw CAD/binary strings, full SVG/PNG/PDF, handles, or object URLs is allowed in authoritative state, job documents, logs, trash, backups, or import payloads.

## 7. Upload transaction/state machine

State is explicit and observable; a UI state is not authoritative file metadata until commit.

```text
local-selected -> validating -> uploading-original -> original-confirmed
  -> creating-preview -> uploading-preview -> preview-confirmed
  -> committing-metadata -> ready

Any state -> failed (nothing uploaded, or a known/retryable validation/upload failure)
uploading-original or later -> orphaned (an object may/exactly does exist but metadata did not commit)
```

`creating-preview` may transition directly to `committing-metadata` with an explicit `previewUnavailableReason` code (not content) when preview is optional. `uploading-preview` must reach `preview-confirmed` before metadata claims a preview.

Required algorithm:

1. Require `FB.user` and a fresh authenticated session; fail closed.
2. Resolve exact workspace and stable job from authoritative job storage; reject missing, duplicate, deleted, or mismatched lifecycle records.
3. Validate basename, extension (`.dxf`, `.ord`, `.omx` only for originals), MIME as advisory plus signature/text checks where feasible, size, and configured quotas. Initial operator decision should choose conservative maxima; never inherit the prototype's 200 MiB without approval.
4. Stream/compute SHA-256 client-side with bounded memory where supported; checksum the exact upload bytes.
5. Generate immutable version and deterministic safe filename/path. Check metadata for an already committed same checksum as idempotency optimization, but do not overwrite.
6. Upload original with exact content type and trusted bounded custom metadata. Use resumable upload for approved larger files and display byte progress.
7. Fetch Storage object metadata and verify full path, generation, size, checksum/custom checksum, content type, and final state. Only now mark `original-confirmed`.
8. Generate a bounded preview without placing it on the job/state object, or accept a separately selected PNG/PDF fallback. Enforce dimensions/page/byte/type limits and strip unsafe SVG features if SVG is retained at all.
9. Upload preview to its version path and fetch/verify object metadata. If unavailable, record a bounded reason code; never claim success for a missing preview.
10. In a Firestore transaction, re-read job authorization/revision and commit only the bounded metadata. For legacy `app/state`, CFR-02 must not use `snapshotState` for this commit; use the new job document model or a narrowly scoped, reviewed metadata operation only during an explicitly defined compatibility stage.
11. Original/preview byte values never become fields on `cuttingJobs`, `completedCuttingJobs`, `deletedItems`, `window.__lastLoadedCloudState`, undo snapshots, or imports.
12. If any object uploaded but Firestore commit definitively fails, mark local operation `orphaned`, retain paths/generations/checksums in a bounded local recovery/outbox record, visibly report partial completion, and enqueue/admin-report cleanup. If outcome is indeterminate, read back metadata by stable operation ID before any retry; never duplicate or delete speculatively.
13. Return a structured result (`ready`, `failed`, or `orphaned`) including confirmed stages. UI success requires `ready`; preview success requires `preview-confirmed`.

Cleanup must be idempotent and generation-specific. A scheduled/admin reconciler compares pending upload operation IDs with committed metadata, respects a grace period, and reports before delete. Blaze budgets require quotas, lifecycle monitoring, pagination, retry backoff, and alerts; do not assume unlimited objects, egress, reads, writes, or conversions.

## 8. Phone and shop-computer behavior

**Phone/mobile:** authenticate, authorize workspace, fetch bounded job/file metadata, then request authenticated preview access by path. Show `Preview unavailable` plus reason when absent. Never prompt for WJ Cuts or infer local access. Fetch original only after a distinct “Download cloud original” action, size warning, and confirmation; do not prefetch CAD.

**Shop computer:** for “Open local,” require a granted directory handle, exact root marker/root identity (and the metadata's expected signature policy), normalized relative path contained beneath root, exact filename/size and preferably checksum match. A failed/missing/stale local check falls back only by offering “Download cloud original”; it never relabels the local path as cloud content. UI exposes three unambiguous actions: **Open local**, **Download cloud original**, **View preview**. Cloud retrieval is authenticated and uses `storagePath`; local retrieval uses only handle + validated `localRelativePath`. Cache provenance (`local` vs `cloud`, version/checksum) and never substitute silently.

## 9. Proposed Storage security-rule model (do not deploy in CFR-01)

### 9.1 Authorization decision required first

The app currently proves only Firebase authentication and hard-codes `github-prod`; it does not prove workspace membership. Therefore a production Storage rule that merely checks `request.auth != null` plus the path would grant every Firebase Auth account access to production. Before CFR-03 deployment, choose one:

1. **Preferred:** administratively managed `workspaces/{workspaceId}/members/{uid}` with `active: true` and bounded role. Storage rules may use `firestore.get(...)`; verify supported syntax/billing and mirror equivalent Firestore rules. Clients cannot create/elevate their own membership.
2. **Alternative:** administratively issued custom claims listing workspace/role, with a token-refresh/revocation runbook.
3. **Temporary small-team option:** operator-supplied UID allowlist in rules, documented and rotated. This is deployable with current Auth but operationally brittle.

Do not infer membership from object metadata, email strings, `WORKSPACE_ID`, or client-writable workspace documents.

### 9.2 Rule invariants and illustrative skeleton

The deployed rule must default deny and match only the two exact versioned shapes. Illustrative—not deploy-ready until authorization and limits are decided:

```rules
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function signedIn() { return request.auth != null; }
    function workspaceMember(ws) {
      // CHOOSE ONE operator-provisioned source; placeholder intentionally false.
      return false;
    }
    function immutableCreate() {
      return resource == null; // create only; no update/overwrite
    }

    match /workspaces/{ws}/cutting-jobs/{job}/originals/{version}/{name} {
      allow read: if signedIn() && workspaceMember(ws);
      allow create: if signedIn() && workspaceMember(ws) && immutableCreate()
        && name.matches('^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\\.(dxf|ord|omx)$')
        && request.resource.size > 0 && request.resource.size <= ORIGINAL_MAX_BYTES
        && request.resource.metadata.workspaceId == ws
        && request.resource.metadata.jobId == job
        && request.resource.metadata.version == version
        && request.resource.metadata.uploadedByUid == request.auth.uid;
      allow update: if false;
      allow delete: if false;
    }

    match /workspaces/{ws}/cutting-jobs/{job}/previews/{version}/{name} {
      allow read: if signedIn() && workspaceMember(ws);
      allow create: if signedIn() && workspaceMember(ws) && immutableCreate()
        && name.matches('^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\\.(png|pdf|svg)$')
        && request.resource.size > 0 && request.resource.size <= PREVIEW_MAX_BYTES
        && request.resource.contentType.matches('^(image/png|application/pdf|image/svg\\+xml)$')
        && request.resource.metadata.workspaceId == ws
        && request.resource.metadata.jobId == job
        && request.resource.metadata.version == version
        && request.resource.metadata.uploadedByUid == request.auth.uid;
      allow update: if false;
      allow delete: if false;
    }
  }
}
```

Production rules must additionally validate path segment lengths/patterns, original content-type allowlist (recognizing CAD MIME inconsistency), exact allowed metadata keys/values as far as rules permit, checksum format, file/version IDs, and optionally existence/status of the job document. Avoid expensive repeated Firestore lookups. Root-level and all unmatched access remains denied. Metadata matching prevents misleading values but does not establish trust independently.

**Deletion policy:** ordinary clients cannot delete immutable versions. An admin/backend cleanup identity may delete (a) confirmed orphan generations after grace/reconciliation, or (b) objects covered by an operator-approved retention/deletion event. Job deletion normally tombstones metadata and retains versions under the chosen retention period. No permanent public access, public ACL, or durable download token is part of the model.

## 10. Required file-content firewall

CFR-02 must implement one pure, recursive, deterministic validator, run on the **raw** snapshot before compaction/sanitization and again on the exact write payload. It never deletes, truncates, converts, or mutates. It returns all exact JSONPath-like offending paths (for example `$.deletedItems[4].payload.files[0].preview.content`) with reason/type/observed length, then blocks before any Firestore write.

Protected traversal roots include at minimum `cuttingJobs`, `completedCuttingJobs`, `cuttingJobDatabase`, `deletedItems`, any import staging/job-bearing root, and job payloads nested in sync/trash/history structures. Maintain this set alongside schema coverage; unknown top-level keys that contain job/file shapes are scanned too. Traverse own enumerable properties in sorted-key order and array indexes in order; use a `WeakSet` for cycles and report cycles as non-serializable.

Reject without serialization:

* native `File`, `Blob`, `ArrayBuffer`, `SharedArrayBuffer` where available, `DataView`, every `ArrayBuffer.isView` typed array, File System handles, streams, and non-plain host objects;
* strings beginning (case/whitespace-normalized) `data:` or `blob:`;
* suspicious base64 only when multiple signals agree: minimum length (recommend 1 KiB), base64 alphabet/padding, high decoded ratio, and either a content-like key or known magic prefix—so normal short IDs/checksums are allowed;
* raw CAD signatures/content (`SECTION`/`ENTITIES` DXF structure, OMAX record patterns, NUL/binary density) above a conservative threshold;
* full markup under preview/image/svg/content-like keys, with a small metadata-safe threshold and a separately operator-chosen maximum; any `<svg` content in authoritative state should be rejected regardless of size because the schema stores only a path;
* unexpected keys matching `dataUrl`, `previewData`, `fileData`, `fileContent`, `raw`, `content`, `bytes`, `buffer`, `binary`, `base64`, `blob`, `arrayBuffer`, `dxfContent`, `ordContent`, `omxContent`, or equivalents when their value is nonempty; and any attachment key not in the bounded metadata allowlist;
* oversized strings/objects in preview/attachment locations even if their key is novel.

Allow normal short metadata only through an explicit attachment schema with per-field type/length/enum/pattern/range checks. URLs are not generally content, but `blob:`/`data:` always fail and permanent download URLs are disallowed fields. HTTPS OneDrive legacy references may be reported for migration review rather than mistaken for bytes.

Integration boundary: call the same validator inside `snapshotState` eligibility (without changing returned data), at the beginning of `saveCloudInternal` before `compactStateForStorage`, after remote merges on the final payload, and from immediate, debounced, seed, legacy migration, clear/reset, restore, repair, and every importer write route. Since `saveCloudNow` and `saveCloudDebounced` converge on internal save, internal enforcement is mandatory; direct `FB.docRef.set` paths must call it explicitly or be eliminated. A violation keeps pending changes, records a bounded diagnostic with paths (not content), shows failure, and never writes/sanitizes. Unit tests need every forbidden type/root, nested trash, false-positive short metadata, deterministic ordering, cycles, getters/nonplain objects, and bypass paths.

This fail-closed validator—not the current heuristic stripping—is what makes embedded content impossible through the authoritative full-state save path.

## 11. Later cutting-job importer boundary

The later importer must:

* parse job rows and cut logs as one import unit; never invent absent values;
* preserve bounded source-row provenance (source file checksum/name, sheet/table, row number, raw-value hashes or bounded original scalar values) without CAD bytes;
* preview and classify every row before mutation, including accepted/rejected/unmatched reason;
* derive stable import-event, job, and log IDs from source checksum + stable row identity, with collision review;
* detect duplicates against current active/completed/new job documents and within the file before write;
* never parse/import CAD contents into state. File references are bounded metadata only and remain `unverified` until checksum/path matches a confirmed Storage object or authorized local file;
* take and verify a backup before mutation; preserve every protected collection and baseline/revision field;
* await confirmed persistence and expose per-unit outcome. Roll back only definite pre-write failures. For an indeterminate write, do **not** retry or roll back; read/reconcile by stable import event ID first;
* use bounded batches/transactions, operation budgets and resumable checkpoints; never append all missing history to `app/state`;
* pass the same content firewall and schema validation on previewed plan and exact writes.

## 12. Staged implementation boundaries

### CFR-02 — Firewall, schemas, and read-only readiness

Implement/test the raw and final-payload content firewall across every authoritative write route; bounded metadata/path builders and validators; stable job resolver; read-only state size/job-ID/file-shape diagnostics; orphan outbox data model; feature flags default off. Confirm bucket canonical name, auth model, sizes/types, preview policy and costs. **No uploads, Storage initialization in production, rules deployment, job migration, importer, or production data rewrite.**

### CFR-03 — Storage/authenticated upload slice

After operator decisions, add v8 Storage SDK/init, deploy reviewed default-deny/member-scoped rules, implement original + optional manual preview upload state machine, verification, orphan reporting/reconciler, authenticated phone/desktop actions, emulator/rules tests and cost telemetry. Roll out to a nonproduction workspace/bucket first. Metadata commits use additive job documents; legacy state remains untouched/readable. No historical migration/import.

### CFR-04 — Job-document cutover and controlled backfill/import

Create per-job/log model, paginated reads, additive idempotent backfill with backups/reconciliation, explicit authority marker/cutover/rollback plan, and only then the importer meeting section 11. Preserve legacy arrays until operator acceptance; do not delete originals or old state in the same release. Storage version retention and admin cleanup begin only after reconciliation.

## 13. Unresolved operator decisions

1. Confirm canonical bucket name (`firebasestorage.app` supplied vs `appspot.com` checked in) and whether either alias has rule/runtime implications.
2. Choose workspace authorization source (admin membership documents, claims, or temporary UID allowlist), roles, membership administrators, and revocation response.
3. Supply Firestore rules for audit and decide whether Storage read/write roles differ.
4. Set maximum original bytes per extension, preview bytes/dimensions/pages, per-job versions, workspace quota, monthly operation/egress budget, alerts, and upload concurrency.
5. Decide whether `.omx` originals are supported at launch and approve MIME/signature behavior for all three CAD types.
6. Select preview formats: recommend PNG default, optional PDF manual fallback; decide whether SVG is allowed after sanitization. Define who/where runs Windows OMAX conversion and how untrusted CAD is sandboxed.
7. Define retention/legal policy for superseded versions, deleted jobs, originals, previews and orphan grace; name cleanup approvers.
8. Define canonical job/log collection names, legacy ID collision handling, bounded job metadata, lifecycle/tombstone rules, and cutover acceptance criteria.
9. Decide whether stable `.wj-cuts-root.json` `rootId` replaces the mutable directory-content signature as canonical `rootSignature`, and whether cloud checksum must match before local open.
10. Decide how legacy OneDrive references and existing `dataUrl`/preview caches are handled. CFR-01 explicitly does not delete or sanitize them.
11. Approve read-only production exports/measurements needed to quantify current document bytes, job/log growth, legacy shapes, duplicate IDs, and incident evidence.

## 14. Exact file/function map

| File | Relevant lines/symbols |
|---|---|
| `index.html` | Firebase CDN/config at 18-35; script order at 200-213. |
| `js/core.js` | workspace/gates 18-71; Firebase globals/size limits/protected registry 594-720; current content heuristics/compaction 734-835; integrity/schema/preflight 1000-2050; revision conflict 2164; backups 2369; `initFirebase` 2481 and auth/load/listener; trash 2830-3335; job lifecycle 3510-3683; file cache and `snapshotState` 3941-4088; `adoptState` 5301; `saveCloudInternal` 5708; public save routes 6169/6190; `loadFromCloud` 6274; migration 6391; destructive direct state write near 6686. |
| `js/renderers.js` | CAD/local constants and IndexedDB/root helpers 1420-1750; OneDrive references 1800-1940; CAD preview/readers/caches/resolvers 1952-2330; root/attach pending-target workflow 21253-21870; new job 22580-22630; manual logs/deletes 23000-23600. |
| `js/views.js` | new-job pending file and attachment presentation around 3043-3200. |
| `js/preview/dxfPreview.js` | buffer-to-text, limited CAD parsing, SVG data URL generation. |
| `js/onedrive/graph.js` | Graph metadata/content retrieval returning `ArrayBuffer`. |
| `js/onedrive/onedriveLibrary.js` | OneDrive picker/reference metadata and supported extension handling. |
| `preview_omx.py` | local approximate OMX point/bulge parser. |
| `render_dxf.py` | local `ezdxf` to SVG/optional PNG renderer. |
| `omax_preview/converters.py` | Windows OMAX script/UI converters and approximate text fallback. |
| `omax_preview/job_pipeline.py` | local prototype upload/preview job filesystem and 200-MiB prototype cap. |
| `docs/data-safety-recovery-plan.md`, `docs/data-safety-implementation-status.md`, `docs/data-loss-diagnosis-plan.md` | prior architectural risk, protected-state, recovery, and incident hypotheses; not proof of a file-content cause. |

## 15. CFR-01 verification limits

Static searches covered Firebase initialization, state save/load/adoption/baselines, protected registry/preflight/revision/backup, all CAD extension tokens, browser content APIs, preview generation, attachment/job lifecycle/trash, IndexedDB/handles/permissions/markers, and localStorage caches. JavaScript syntax checks are appropriate because documentation is the only change; no runtime behavior was changed. No claim is made about browser rendering, live authentication, Firestore/Storage access, uploads, rules, production data, conversion fidelity, or cross-device behavior.
