# FBS-01B: native global Firebase busy cursor

## Root cause confirmed before editing

FBS-01A's tracker updated only a hidden/visible header indicator. It never attached a busy class or set `cursor: progress` on the document or any element. Existing button/link rules (`pointer`), inputs (`text`), and dashboard handles (`grab`/resize) therefore retained their normal cursors. The earlier tests asserted the header indicator, so they could not detect the missing native cursor.

Source tracing confirmed the dashboard paths already entered the tracker before backend work and retained ownership through existing verification:

- Dashboard one-time task form: `oneTimeForm` submit in `js/renderers.js` -> `runMaintenanceCalendarMutation` -> `OMAXMaintenanceCalendarIntegrity.createMutationRunner` -> `saveCloudNow` -> shared queue/`performCloudSave` -> guarded transaction and independent queue readback -> additional maintenance readback -> coordinator `finally`.
- Dashboard one-time task removal: calendar item's click -> `openV2OneTimePanel` -> `[data-v2-panel-remove]` confirmation -> `removeV2OneTimeOccurrence` -> `appendV2OccurrenceEvent` -> the same verified maintenance coordinator. The original scheduled event is retained and a removal lifecycle event is saved.
- Dashboard cutting-job form: `createCuttingJob` -> `saveCuttingJobBusinessOperation` -> `CuttingJobChronology.createMutationApi().save`; dashboard calendar Remove -> `deleteCuttingJob` -> `saveCloudNow`. Both boundaries retain registrations through required readback.

The controlled browser test now clicks the actual dashboard task add and remove controls. Backend-request observations confirm the root class is already set and the tracker has exactly one registration on every transaction request. It separately pauses immediately before the authoritative write and at the maintenance coordinator's final readback, after the ordinary save's own verification. No missing hook was found on these traced paths; adding per-button hooks would double-count them. This does not establish which exact control/build was used in the earlier manual Vercel session.

## Focused changes

| File | Change |
| --- | --- |
| `js/firebaseOperations.js` | Bind the existing tracker to `document.documentElement.classList.toggle('firebase-busy', pending > 0)`. Mount before `core.js` starts operations. Cursor binding works even if accessible status markup is missing. |
| `style.css` | Apply `cursor: progress !important` to `html.firebase-busy`, every descendant, and root/descendant `::before`/`::after` pseudo-elements. Remove the old spinner animation/styles. |
| `index.html` | Remove the visible header spinner. Retain one quiet screen-reader-only live status outside routed content using the existing `sr-only` convention. |
| `tests/firebase-operations.test.js` | Assert root-class attachment/removal, overlapping operations, rejected/indeterminate cleanup, mounting during pending work, and no dependence on status markup. Retain verified coordinator, queue, loading, background and Storage coverage. |
| `tests/firebase-operations.browser.cjs` | Assert computed `progress` on root/body, dashboard/header buttons and links, pointer/text/drag/resize/disabled controls and pseudo-elements; actual dashboard add/remove with delayed writes/readback; normal cursor restoration; navigation, concurrency and Recovery Mode. |
| `docs/fbs-01a-global-firebase-spinner.md` | Mark the original header-spinner report as historical and link here. |
| This report | Record root cause, call paths, coverage, commands and remaining manual checks. |

No business-operation coordinator or mutation logic changed in FBS-01B. Existing in-memory tokens, explicit parent ownership, `try/finally` cleanup and deterministic status labels are reused. The cursor remains active until the last token settles. Failures and indeterminate results remove their registration while preserving the original outcome and Recovery Mode feedback. There is no pointer-event suppression, overlay, click lock, new timeout, retry or custom cursor asset. Removing the class restores each element's existing cursor rules without saving/restoring inline styles. A genuinely pending backend write remains busy.

## Shared boundaries retained and audited

| Workflow | Tracked boundary |
| --- | --- |
| Dashboard task additions/one-time moves/removals/updates | `runMaintenanceCalendarMutation` through its final independent readback; nested ordinary saves receive the parent's token |
| Existing/legacy and repeat calendar changes | Existing `saveCloudNow`/shared queue; verified `maintenanceCalendarCancellationApi.run` for cancellations/stopping repeats |
| Task definition archive/restore | `maintenanceTaskDeletionApi` (`OMAXMaintenanceTaskArchive.transfer`) through independent readback/adoption |
| Cutting Job create/edit/complete/date changes | `CuttingJobChronology.createMutationApi().save` through committed-state verification/adoption |
| Cutting Job delete/history restore | `deleteCuttingJob` / `restoreCuttingJobHistory`, passing parent tokens into the shared queue |
| Machine-hour entries, ordinary inventory/receipt/Purchase History edits, layouts and settings | `saveCloudNow` / executed `saveCloudInternal` debounce callback through queue waiting, `performCloudSave`, CAS write and independent server readback |
| RPM entries/pump baseline, Water Quality and category changes | `savePumpLogChange`, `savePumpBaseline`, `saveWaterQualityCheck`, `saveCuttingJobCategoryChange`, each covering its isolated writer and readback |
| Material Inventory updates/undo; purchase-order create/edit | `inventoryMaterialMutationApi.run`; `purchaseOrderApi.save`, through their existing independent verification |
| Cut Cost configuration; explicit imports/identity repair | Existing `saveChange`, historical/cutting-job import submit and identity-repair apply coordinators through their complete verification/rollback/recovery paths |
| Firebase cloud-data loading | `loadFromCloud`, `runRecoveryInspect`, `refreshDebugCloud` |
| Secure production Storage upload/open | `uploadCfr05CuttingFile` through membership, upload, metadata commit and final verification/cleanup; `openCfr05CloudFile` through download/preview completion |

Verified-save completion still controls release, never initial write acknowledgement. No schemas, protected records, calculations, revision/CAS checks, verification requirements, backup safeguards, save-success definitions, mutation behavior or Recovery Mode gates were changed. Cursor state exists only in memory and the root DOM class; it is never written to Firebase, local storage or business snapshots.

## Tests actually run

`Test-Path package.json` returned `False`. No npm commands were run. All commands below used the existing feature worktree.

1. PASS: `node --test tests/firebase-operations.test.js` — **16 passed, 0 failed**.

2. PASS: the following focused suite — **250 passed, 0 failed** (includes the 16 cursor tests):

   ```powershell
   node --test tests/firebase-operations.test.js tests/mcf-01-maintenance-calendar.test.js tests/maintenance-new-one-time.test.js tests/cjd01-job-deletion.test.js tests/mdel01-task-deletion.test.js tests/mdel01b-verification.test.js tests/mdel01c-restoration.test.js tests/cjo04b-verification.test.js
   ```

3. PASS: **1 browser integration scenario passed, 0 failed**, with controlled asynchronous gates:

   ```powershell
   $env:OMAX_PLAYWRIGHT_PATH='C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
   node --test tests/firebase-operations.browser.cjs
   ```

   Headless Edge used a fresh disposable browser profile and the localhost IndexedDB fixture backend. Every external request was blocked, and Firebase SDKs were asserted unloaded. The test checks CSS computed styles, not a screenshot of the native mouse cursor animation. It runs actual dashboard task add/remove clicks, ordinary verified saves, Cutting Job creation, Water Quality and purchase-order saves, cloud loading, overlapping tokens, real navigation during a delayed cloud load, background-listener idleness, failed verification/indeterminate Recovery Mode and subsequent blocked saves. For dashboard add/remove it verifies one registration both before the write and during the final readback; normal pointer styling returns after success. Unrelated business fields and previous maintenance events remain identical after fixture removal.

   The first browser run FAILED on the test's unrelated-state assertion because a normal save updates `saveMeta.lastSaveSizeBytes` when a removal event is appended. The comparison now excludes writer-owned sync/save/log metadata, still compares every other business field, and asserts saved status. No production behavior was changed to satisfy the test. The corrected run passed.

4. PASS: syntax checks on all changed and closely related JavaScript:

   ```powershell
   $files=@('js/firebaseOperations.js','js/core.js','js/router.js','js/calendar.js','js/renderers.js','js/maintenanceCalendarIntegrity.js','js/maintenanceCalendarCancellation.js','js/maintenanceTaskArchive.js','tests/firebase-operations.test.js','tests/firebase-operations.browser.cjs')
   foreach($file in $files){node --check $file; if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}}
   ```

5. PASS: `git diff --check`; repeated with `git diff --cached --check` before committing. `rg` audited dashboard form handlers, calendar removal/move helpers, queue calls, coordinator registrations and existing inline/stylesheet cursor declarations.

## Limits and known untracked work

- Passive Firebase listeners/snapshot adoption, housekeeping, automatic file enumeration/cache warming, standalone raw diagnostic/export/repair-preview reads, legacy evidence reads and the separately gated CFR03 diagnostic round-trip still have no independent registration. The normal user-facing load/save/upload boundaries above are covered. No additional untracked ordinary dashboard add/remove path was found in this audit.
- The existing 1.8-second debounce interval precedes backend queue execution and is not marked busy; the operation becomes busy when the shared save callback executes, before its first backend request. Existing behavior was retained.
- Still required: a headed check on the updated Vercel preview with the user's OS/browser to confirm native `progress` appearance/animation and repeat dashboard add/remove against authorized real Firebase. Native animations vary by OS and are not proved by computed CSS. Live permission/offline/unsettled-write behavior, real Storage uploads, assistive technology and other browser/device combinations were not tested here.
- No live production data or destructive production operation was invoked, and Clear All Data was never used. This updates the same branch/PR; do not merge automatically.
