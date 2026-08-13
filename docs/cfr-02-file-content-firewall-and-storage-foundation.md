# CFR-02 — Cutting-file content firewall and Storage foundation

**Status:** safety foundation only. Cloud Storage uploads, downloads, listing, deletion, migration, and cutting-job import remain disabled.

## Implementation

`index.html` loads Firebase Storage 8.10.1 and the standalone `js/cuttingFileContentFirewall.js` module. `initFirebase()` reuses the existing Firebase app and authenticated session and initializes only the Storage service for `gs://omax-maintenance.firebasestorage.app`. Initialization calls no Storage reference or object method. Failure is retained as diagnostic information and does not change Firestore state loading, adoption, or routing.

`snapshotState()` no longer silently removes attachment content before inspection. The pure scanner examines live values recursively before JSON serialization or state compaction. `saveCloudInternal()` scans that raw complete snapshot, retains all existing size, revision, schema, protected-state, and dangerous-reduction checks, and sends the final merged state through `writeAuthoritativeStateSnapshot()`. Initial seed, legacy workspace-root migration, and clear/reset state writes also use this shared final boundary. No direct `FB.docRef.set()` state write remains.

The shared writer returns this shape when blocked:

```js
{
  saved: false,
  blocked: true,
  error: "Embedded cutting-file content was blocked from authoritative state.",
  errorCode: "embedded_cutting_file_content_blocked",
  stateWriteAttempted: false,
  stateWriteCompleted: false,
  findings: [ /* paths and metadata only; never content */ ]
}
```

It does not mutate, strip, truncate, retry, save a partial state, or update the authoritative cloud baseline.

## Detection rules and thresholds

Every finding contains a deterministic `$`-based object path, reason/type, measurable approximate byte size, root collection, and `blocksAuthoritativeSave: true`. Object keys are traversed and findings are sorted lexically for stable results. Cycles are safely ignored after their first visit.

The scanner blocks:

- `File`, `Blob`, `ArrayBuffer`, `SharedArrayBuffer`, `DataView`, all typed-array views, and recognized binary-like browser objects;
- every `data:` or `blob:` URL;
- base64-like strings at **4,096 characters or greater**;
- known raw/content/payload fields at **512 characters or greater**, including content fields in cutting-file or preview context;
- DXF/ORD/OMX signatures at **256 characters or greater**;
- SVG, HTML, canvas, or image markup at **16,384 characters or greater**.

Tests cover the base64 lower boundary and markup threshold. Ordinary bounded filenames, extensions, MIME types, hashes, `gs://` object references, HTTPS references, local relative paths/root signatures, notes, dimensions, and parser metadata are allowed. Threshold matching is inclusive. These heuristics intentionally favor blocking and operator review over silent data loss; they do not prove a file format is valid.

## Read-only browser diagnostics

`auditCuttingFileContentExposure()` scans the current `snapshotState()`, active and completed job roots, `deletedItems`, the last loaded cloud baseline, `cutting_job_files_v1`, `cutting_job_onedrive_preview_cache_v1`, and `omax_local_state_backup_v1`. It groups path-only findings by source, reports inaccessible caches and local-only contamination, and performs no cleanup or save.

`getCloudCutFileStorageDiagnostics()` reports URL/hostname and Vercel-host detection, project/bucket/workspace/document routing, existing sign-in UID when available, Storage SDK/service status, production-project targeting, and a current firewall summary. It explicitly reports uploads/downloads disabled and Storage rules untested. It exposes no token, credential, complete user record, or embedded content.

## Known limitations

- Diagnostics are static client observations, not proof of Firebase Console configuration, deployed rules, bucket access, or cross-device behavior.
- Local cache inspection is best effort; unavailable or unparsable storage is reported without modification.
- The firewall detects content patterns and binary values; it is not a CAD parser, antivirus scanner, MIME validator, or strict metadata schema.
- Existing contaminated cloud state can still load and display. A later authoritative save remains blocked until a separately authorized remediation/migration is designed.
- Storage rules remain deny-all and were not exercised by this implementation.

## Manual Vercel-preview checks

Use this branch's PR preview without editing data:

1. Confirm Vercel uses Framework Preset **Other**, empty Build and Install commands, and output directory `.`.
2. Open the preview and run `getCloudCutFileStorageDiagnostics()`; confirm preview hostname detection, project `omax-maintenance`, bucket `omax-maintenance.firebasestorage.app`, workspace `github-prod`, state path `workspaces/github-prod/app/state`, and both transfer flags `false`.
3. Run `auditCuttingFileContentExposure()` and export only its metadata result for review; confirm no content appears in the result.
4. Confirm existing contaminated records, if any, still render without cleanup or migration.
5. In browser developer tools, confirm page load and both diagnostics make no Storage network request and no Firestore write.
6. If an isolated, operator-approved non-production mock can be used later, verify a contaminated save returns the structured firewall block and makes no state `set()` call. Do **not** test this by changing production state.
7. Do not claim Storage rules are tested; CFR-02 deliberately performs no Storage request.

## CFR-02 / CFR-03 boundary

CFR-02 provides initialization, prevention, and observation only. CFR-03 must separately design and authorize Storage security rules, bounded metadata schemas, upload/download/delete workflows, job documents and log subcollections, migration/backfill, imports, retry/idempotency, preview object validation, retention, and deployment isolation. None of those operations is enabled here, and public/test-mode Storage rules must not be used.
