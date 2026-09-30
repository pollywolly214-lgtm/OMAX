# PH-03 historical import and reconciliation readiness

Date: 2026-09-30. Starting merged main: `bcf6322a900c20fb9c98100e0c25e375dbf90e7a` (PR #484). Branch: `production-readiness-import-prep`.

**Historical production recovery: BLOCKED.** The application has a tested reconciliation foundation. The authenticated disposable Firebase integration and the actual source/current-production reconciliation gates below must be completed before production imports. No production access, historical production import, backup restoration, configuration/rules change, or recovery-evidence deletion occurred in PH-03.

## Architecture and importer inventory

Current authoritative business state is `workspaces/github-prod/app/state`. Importers compare current state with reviewed source records and add missing records. They do not restore a whole historical snapshot. New-workspace provisioning is not part of the production missing-document load path.

| Area | Available source and entry point | Destination | Permanent identity / review policy |
| --- | --- | --- | --- |
| Purchase History | New JSON-array reconciliation in Maintenance Settings; `historicalImport.preview/submit("purchase", ...)` | ISO-week `receiptTrackerWeeks[].rows` | Exact `import_event_id`, or the collision-free JSON tuple `[source_id, source_record_id]`. Similar untagged date/description needs review. Inventory quantities and transaction history are untouched. |
| Maintenance | Existing JSON/CSV tool in Maintenance Settings; `buildMaintenanceHistoryImportPreview`, `applyMaintenanceHistoryImportRows` | Existing exact-matched `tasksInterval` / `tasksAsReq` task `manualHistory` only | Required permanent `import_event_id`; duplicate identities in the source are all held. Match the exact website task; multiple matches or untagged existing completion on that date require review. No automatic V2 occurrence or completedDates conversion. |
| Pump / RPM | New JSON-array reconciliation in Maintenance Settings; `historicalImport.preview/submit("pump", ...)` | Add records to `pumpEff.entries`; preserve baseline and notes | Same permanent source IDs as purchase. Current model stores one measurement per day. Any surviving measurement on the proposed day, or multiple new measurements on that day, needs review. No replacement. |
| Cutting jobs / completed cuts | Existing reviewed CSV or XLSX tool in Cutting Jobs; XLSX reads the Cutting Jobs sheet only | `cuttingJobs` / `completedCuttingJobs`, including reviewed manual time | Required permanent `import_event_id`, deterministic job ID. Distinct source identities can represent identical-looking cuts. Repeated source IDs and generated job-ID collisions are held. Untagged similar name/project/completion date needs review. |
| Cutting files | Existing CFR-05/CFR-06 upload, listing, digest-verified download and DXF preview | Storage binary plus separate workspace/job/file Firestore metadata | Attach after the job exists. File migration is not an app/state historical importer. No binary, base64, SVG, Blob, or download token is stored in authoritative state. |

Existing repair/category reclassification, purchase-link repair, deleted-item restore, and backup inspection are separate operator tools. They are not a historical reconciliation pipeline and must not be used as shortcuts to replace production history. Whole-workspace reset and legacy tiny-fixture cleanup are disabled outside devsafe.

## Candidate classifications

Purchase/pump previews use the four operator labels directly. Existing maintenance/cutting tools retain their established detailed statuses; interpret them as follows:

| Reconciliation classification | Existing detailed status |
| --- | --- |
| Already Present | `duplicate`: stable identity exists; no append/write for that row |
| Missing — Import | `ready`: valid, reviewed source row with an unambiguous destination |
| Possible Match — Review | `ambiguous`, or a matching/unresolved destination or material |
| Source Problem — Review | Invalid/missing identity, malformed date/number, repeated source identity, excluded evidence, unsupported source/units, or unresolved source mapping |

Only Missing — Import rows can append. A candidate cannot become importable by silently normalizing a suspicious number/date or guessing a task/material. Matching by visible content is a review signal, not an identity-based deletion/no-op rule. IDs must be permanent in the reviewed source manifest, never newly generated on each run. Existing source IDs are not permission to overwrite a record. Purchase/pump provenance discrepancies under the same ID are held for review; maintenance/cutting existing IDs are immutable no-ops and source corrections require a separate reviewed process.

## Source contracts

Purchase JSON example (fixture only):

```json
[{"import_event_id":"fixture-purchase-001","source_id":"reviewed-source","source_record_id":"row-001","date":"2026-08-04","purchased":"Replacement filter","qty":2,"cost":15,"partNumber":"0000","shipping":0,"tax":0}]
```

`date` must be a real exact YYYY-MM-DD value. `qty` must be a finite positive JSON number; `cost`, optional shipping and tax must be finite nonnegative JSON numbers. Date and original raw source object are retained in `importProvenance`. ISO week 53 and dates across year boundaries are supported. Historical reconstruction leaves `inventoryItemId` blank; it does not replay inventory receipts.

Pump JSON example (fixture only):

```json
[{"import_event_id":"fixture-rpm-001","source_id":"reviewed-source","source_record_id":"row-002","date":"2026-08-05","rpm":3420,"timeISO":"13:25"}]
```

RPM must be a positive integer JSON number and time must be exact HH:MM. Multiple daily measurements cannot be resolved by this importer. Review the source and surviving history; do not pick a winner automatically. New entries are inserted in date order without editing existing entries; source IDs/provenance survive the ordinary save merge.

Maintenance rows require `import_event_id`, `scheduled_maintenance_date`, and `exact_website_task`. `source_kind` is `purchase_evidence` (the legacy default) or `shop_log`. Purchase evidence remains restricted to reviewed replacement rules; purchasing something never automatically proves cleaning, rotation, draining, lubrication, purging, or inspection. Shop logs can describe those actions only through an explicit reviewed exact task match. Original source row/date and source-stream provenance are retained. Identical legitimate events with different permanent IDs are allowed; untagged current events remain review-required.

Cutting CSV/XLSX uses the fields exported by `CuttingJobImporter.FIELDS`: identity, record status, name, string project number, actual cut minutes, estimate/additional minutes, priority/rates, dates, category/material/dimensions/cost, source sequence, review fields and source file/text. Project `0000` stays a string; manual minutes remain actual manual values. Exact live materials and reviewed aliases are reused. Existing approved blank-material A36 behavior remains visible in the preview; unknown RC50 and ambiguous material/unit cases are held. Category creation/resequencing is an explicitly displayed definition plan. Material settings are revalidated and captured separately in the backup. Normal UI completion now preserves project number and import provenance.

## Protected baseline and write contract

Protected fields include jobs and their manual logs; tasks and histories; settings/inventory folders; inventory/materials; purchases/receipt weeks; orders; daily/cumulative hours; weekly cost reports; pump history; garnet; appConfig; dashboard/cost/job layouts; all three V2 maintenance collections; and deleted items. See the existing protected-field registry in `js/core.js`.

1. Parse/preview is non-mutating. Confirm the exact reviewed plan and exclude review-required rows.
2. Read the latest authoritative server state; require authentication, a completed authoritative load, a matching loaded revision, and matching local/cloud business state. Recovery Mode, pending local drift, missing state, and changed previews block submission.
3. Download the pre-import authoritative snapshot, including revision/sync metadata and protected counts. Cutting backups also include local material settings. A failed backup stops before mutation. The browser can confirm a download was initiated; the operator must retain and verify the downloaded file.
4. Capture exact destination and protected-field baselines, stage only the approved append, and verify unrelated state is unchanged. Maintenance retains existing history order and appends only manualHistory. Cutting additionally preserves/reviews its category plan.
5. Await the shared cloud save. All authoritative writes use `OMAXAtomicPersistence.save`: read/check/set inside a Firestore transaction, with an immutable expected revision even on SDK callback retry. Repeat protected-field checks, required history merges, content firewall, and size checks inside the transaction. Local saves are serialized; an edit made during a save remains pending.
6. Read from the server after completion. Purchase/pump compare exact destination, imported IDs, counts and unrelated fields. Maintenance compares exact task/history arrays, every planned ID once, and unrelated fields. Cutting compares exact active/completed arrays and every planned ID once, plus unrelated authoritative baseline fields. Return success only after verification.

## Failure and recovery behavior

- PH-04: Definite rejection before a commit (including stale revision, permission denial, payload/preflight rejection) performs selective rollback against the latest local state, never restores a whole destination snapshot. Capture immutable copies of the introduced records at staging; require each permanent import ID (and cutting deterministic job ID) to identify exactly one unchanged staged record before removing any imported record. Concurrent unrelated additions/edits survive.
- Purchase removes only introduced rows. An import-created week is removed only when uniquely identifiable, pristine and empty after removal; concurrent rows/week edits survive. Pump removes only introduced entries, preserving concurrent entries, notes and baseline changes. Maintenance removes only introduced manualHistory entries on the original uniquely identified task; task replacement with the same identity and unrelated history edits/additions survive.
- Cutting removes only introduced jobs from the latest active/completed arrays. Import resequencing changes on existing jobs are reverted field-by-field only if the current cutNumber still equals the import-assigned value; newer number edits survive. Materials are never restored. Newly created categories are removed only if their IDs were absent before the import, their definitions are still unchanged/unique, and no surviving job, deleted record, protected state or child category references them. Changed/referenced categories are retained and reported for recovery review.
- Changed, missing or ambiguous imported records block record rollback before deletion. Preserve local evidence, suspend writes, enter recovery review and require manual verification; never fall back to whole-array restoration. Retained/uncertain categories also suspend writes and report the retained definitions. An unchanged imported record can be removed while a referenced category is retained.
- An indeterminate completion suspends writes and enters recovery/read verification. No blind retry and no rollback that could conceal an already committed append.
- A confirmed commit followed by a failed server read, ID/count mismatch, or unrelated-field mismatch is treated as needing verification. Preserve the staged evidence, suspend writes, and compare cloud/export/source IDs before deciding the next action.
- Missing/empty/config-only authoritative state, or duplicate/missing inventory identities, blocks normal adoption/writes and exposes diagnostics/exports. No production defaults or legacy migration writes occur. There is no retained production provisioning shortcut.
- Local backup quota failure preserves the previous backup; diagnostics report keys/approximate bytes without deleting caches or recovery evidence. Production reset and legacy fixture cleanup cannot delete that evidence.

Read-only recovery URL adds `&recovery=1` to devsafe during tests. Recovery exports include current cloud JSON (when present), existing local backup, protected-field counts, sync metadata, missing/indeterminate diagnostics, and browser storage size estimates. Do not restore an old snapshot to reconcile historical rows.

## Safe local verification

Use **http://localhost:8000/?devsafe=1** exclusively for mutation testing. Start `node scripts/devsafe-server.js` in this project. The server binds loopback and denies dot-path access. Devsafe initializes fixture defaults only on first disposable provisioning, namespaces all browser storage, uses a separate IndexedDB document store and Web Locks for committed cross-tab reads, uses in-memory fixture files, blocks Firebase/Graph/OneDrive business requests, and disables real local-file root access. Missing fixture state after provisioning stays missing across reload. No Firebase SDK app is initialized.

Run `scripts/ph03-browser-matrix.js` with `OMAX_PLAYWRIGHT_PATH` pointing to an available Playwright installation; it uses installed Edge in a fresh profile. This repo has no package.json, so no npm command was run. Generated fixture downloads/screenshots stay ignored under `artifacts/ph03`; the durable sanitized result is `docs/ph03-browser-results.json`.

The matrix exercises major routes twice, real task/job/inventory/order/garnet controls, completion/manual time, purchase reconciliation/editor, pump append/reload, reviewed cutting CSV import, maintenance shop-log append/no-op, secure DXF/ORD/OMX services and visible DXF presentation, layout edit/save/reload, all protected fixture roundtrips, fresh context with copied fixture storage, desktop 1440px/narrow 390px overflow, in-flight edits, same-revision two-tab race, injected quota exceptions, and missing-document recovery/exports/reload. Node tests additionally cover actual Firestore-style callback retry, malformed sources, ambiguity, rollback and indeterminate verification failures. This is a local backend simulation, not real Firebase rule/CORS/auth certification or exhaustive human usability testing of every business variant.

## Exact gates before historical production recovery

PH-04 verification (2026-09-30): `node --check` passed for all six changed JavaScript files. `node --test tests/import-selective-rollback.test.js tests/historical-import-readiness.test.js tests/maintenance-history-import.test.js tests/cutting-job-import.test.js` passed 31 Node runner tests with zero failures/skips, including 15 new selective-rollback regressions. `node --test tests/*.test.js` passed 73 with zero failures/skips. `git diff --check` passed. The legacy cutting/maintenance test files include additional internal assertions; the totals above use Node runner counts. No additional browser audit or production access was performed for this narrow change.

1. **Integration validation:** Run the transaction race, rejected permission/error paths, authenticated load, and DXF/ORD/OMX upload/list/digest-download/preview against an explicitly disposable authenticated Firebase project or emulator with equivalent rules. Current local mocks and deterministic rule tests do not establish deployed permissions, SDK transport/offline behavior, Storage CORS, or billing/network readiness. Do not run destructive tests against github-prod. No rule change was identified as necessary or made here.
2. **Reviewed source manifest:** Supply permanent IDs, retained originals, source-stream attribution, actual dates/units and approved task/material/category mappings. Resolve possible matches against a fresh read-only production export. Raw scanned invoices, OCR shop logs, PDFs and arbitrary purchase/pump spreadsheets still need a reviewed extraction/adapter into the supported contracts; no OCR or speculative matching importer was built.
3. **Authoritative recovery evidence:** Obtain and retain a current cloud export and local recovery backup with counts/revision; compare surviving histories and approve only the missing-ID plan. No production baseline was accessed during PH-03, so its actual completeness, identity collisions and ambiguous records remain unverified.
4. **Model conflicts:** Hold multiple pump measurements per day, duplicated current/source IDs, untagged same-day maintenance/cuts/purchases, unknown materials/units, and legacy inventory identity collisions for operator review. These are case-specific review gates, not permission for a destructive migration. If such cases must be imported, resolve their identity/model policy first.

No additional core importer is missing for reviewed purchase, maintenance, single-daily pump and cutting records. Historical file migration remains deliberately separate and has not been executed. Repairs/restores and bulk legacy normalization require their own reviewed scope.
