# FBS-01A: global Firebase operation indicator

Historical implementation record: FBS-01B replaces the visible header spinner with the requested native global busy cursor. See [the current cursor implementation and validation report](fbs-01b-global-firebase-busy-cursor.md). The shared operation boundaries and save-safety behavior below are retained.

## Implementation and coverage

One in-memory token tracker feeds one polite status in the persistent header. Same-type operations retain their label; mixed types show `Working...`. Registration cleanup uses `finally`, including rejected promises, thrown preflight errors, blocked operations and settled indeterminate results. Observer errors cannot affect backend results. Status text changes only when the displayed label changes. The icon respects reduced-motion preferences.

The existing save queue and verified mutation coordinators remain the owners of business-operation completion. The tracker observes those lifecycles; it does not provide another save coordinator. Parent tokens are explicitly forwarded to nested queue saves so they keep one registration until the outer verification/adoption finishes. No global asynchronous-context heuristic suppresses concurrent operations.

| Files | Boundary / coverage |
| --- | --- |
| `js/firebaseOperations.js` | Shared token lifecycle, concurrent labels and DOM subscription; no persistence or business data access |
| `index.html`, `style.css` | Single header indicator outside routed content, script order, animation and responsive styling |
| `js/core.js` | Existing debounced save queue, including waiting behind earlier saves and `performCloudSave`'s independent readback; settings, dashboard/page layouts, machine hours, ordinary inventory/receipt/history mutations |
| `js/cuttingJobChronology.js` | Full create/edit/complete/chronology coordinator through server verification and adoption |
| `js/core.js` | Cutting-job delete/history restore, Water Quality checks, pump baseline/RPM edits, category updates; existing direct writer workflows stay tracked through their readback |
| `js/maintenanceCalendarIntegrity.js` | Maintenance create/calendar mutation, including its additional verification after the queue's verified save |
| `js/maintenanceTaskArchive.js`, `js/maintenanceCalendarCancellation.js` | Task archive/restore and calendar cancellation through independent readback |
| `js/inventoryMaterialMutations.js` | Material inventory updates and confirmed undo through independent readback |
| `js/purchaseOrders.js`, `js/renderers.js` | Existing purchase-order creation/edit coordinator through backend verification/adoption; this bypasses ordinary whole-app saves |
| `js/cutCostFeedbackUi.js` | Existing isolated Cut Cost settings/adjustment save through independent readback |
| `js/historicalImport.js`, `js/cuttingJobImporter.js`, `js/inventoryIdentityRepair.js` | Explicit import and identity-repair coordinators through backup, write, verification and existing failure handling; global identity repair reuses the identity-repair implementation |
| `js/core.js` | Initial/deliberate `loadFromCloud`, Recovery Inspect and debug cloud refresh |
| `js/core.js` | Secure Storage upload from membership lookup through upload, metadata commit, final verification/cleanup; explicit secure-file opening through download/preview completion |
| `tests/firebase-operations.test.js`, `tests/firebase-operations.browser.cjs` | Deferred lifecycle tests and isolated headless Edge integration |

Verified-save completion controls release, never the initial write acknowledgement. For workflows with an additional verification outside the ordinary save, the outer operation retains ownership. No success definition, result, exception, existing warning, retry policy, CAS/protected-field check, identity validation, backup safeguard or Recovery Mode gate was intentionally changed. No Firebase schemas, records, calculations, scheduling or mutation formulas were intentionally changed. Runtime tokens are passed only in call options, never into snapshots or persisted records.

## Deliberately untracked paths and limits

- Passive `onSnapshot` subscriptions and snapshot adoption, routine housekeeping and automatic save-log/metadata activity have no independent registration. Logs/metadata awaited by a deliberate save remain inside its existing span.
- Automatic secure-file enumeration/cache warming stays untracked. Content downloaded through the existing secure-file open boundary is tracked.
- Raw internal read helpers, standalone diagnostic exports/repair-preview reads, legacy read-only evidence helpers and the separately gated CFR03 diagnostic Storage round-trip retain no independent spinner. Low-level helpers remain uninstrumented to avoid counting reads inside tracked verified saves again. The normal cloud load, Recovery Inspect, debug refresh, repair apply and production upload paths are covered.
- The existing 1.8-second debounce delay has no registration until the queue callback runs. A queued backend save is then tracked through settlement. No new write timeout, automatic retry or artificial completion timer was added. A genuinely pending Firebase write remains pending; existing verification deadlines retain their existing outcomes.

## Validation commands and results

There is no `package.json` (`Test-Path package.json` returned `False`), so no npm build/lint/type-check script was available. Commands ran from the isolated feature worktree with Node v24.22.1.

1. PASS, 15/15 final deferred unit/integration cases:

   ```powershell
   node --test tests/firebase-operations.test.js
   ```

   Includes concurrent mixed outcomes/labels, explicit parent reuse, presentation failures, actual queue waiting/verification, actual cutting coordinator success/rejection/mismatch/indeterminate outcomes, maintenance's extra readback, cloud load/recovery/network failure, untracked listeners, upload membership/final-verification delays, blocked Recovery Mode and thrown preflight cleanup. Protected fixture data remains intact. The first version passed 13/13; adding the final two cases briefly exposed a test-file brace typo, which was fixed before the 15/15 run.

2. PASS, 173/173 existing persistence cases:

   ```powershell
   node --test tests/atomic-persistence.test.js tests/cjo04b-verification.test.js tests/inventory-material-persistence.test.js tests/maintenance-new-one-time.test.js tests/water-quality.test.js
   ```

   The last path does not exist and was not exercised by this invocation. Water Quality is covered by the separate existing persistence suite below and the new browser test; no result is attributed to the nonexistent path.

3. PASS, 612/612 focused regression cases at that run (including the original 13 spinner cases):

   ```powershell
   node --test tests/firebase-operations.test.js tests/water-quality-persistence.test.js tests/polishv2-pump-log.test.js tests/pump-baseline.test.js tests/purchase-orders.test.js tests/mcf-01-maintenance-calendar.test.js tests/mdel01-task-deletion.test.js tests/mdel01b-verification.test.js tests/mdel01c-restoration.test.js tests/cjd01-job-deletion.test.js tests/global-identity-repair.test.js tests/historical-import-staging.test.js tests/cutting-job-import.test.js tests/cfr05-cloud-cutting-files.test.js tests/cut-cost-feedback.test.js tests/cut-cost-cumulative-hours.test.js tests/cut-cost-repair.test.js > artifacts/fbs-regressions.tap 2>&1
   Get-Content artifacts/fbs-regressions.tap -Tail 14
   ```

4. PASS, 1/1 headless Edge scenario with controlled verification delays and a fresh disposable profile:

   ```powershell
   $env:OMAX_PLAYWRIGHT_PATH='C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
   node --test tests/firebase-operations.browser.cjs
   ```

   All non-local traffic was blocked and the test asserted Firebase SDKs were unloaded. The scenario ran ordinary verified saves, a Water Quality save with unrelated-state equality, Cutting Job creation, purchase-order creation, the actual new one-time Maintenance form, cloud loading, concurrent status types, failed readback and Recovery Mode. It checked the persistent header across routes, 1440px/390px layouts, enabled navigation and active status through verification. Route checks with an explicit token isolate empty-fixture routing behavior; the delayed real cloud-load check also navigates while pending. Local screenshots are saved under `artifacts/fbs-01a/` and visually inspected.

   Initial browser launch FAILED inside the Windows sandbox; the authorized unsandboxed run used the same blocked-network disposable profile. Intermediate browser iterations FAILED while correcting test fixtures: pausing the baseline rather than readback exposed the existing empty-job fixture's Recovery gate during routing; the cutting coordinator captures its verification reader; a purchase draft required order-level tax; and the maintenance form required its Task chooser step. Final checks retain the existing safety gates. No production code was changed to bypass these failures.

5. PASS, syntax checks on all changed and closely related JavaScript:

   ```powershell
   $files=@('js/firebaseOperations.js','js/core.js','js/cuttingJobChronology.js','js/cuttingJobImporter.js','js/historicalImport.js','js/inventoryIdentityRepair.js','js/inventoryMaterialMutations.js','js/maintenanceCalendarCancellation.js','js/maintenanceCalendarIntegrity.js','js/maintenanceTaskArchive.js','js/purchaseOrders.js','js/cutCostFeedbackUi.js','js/renderers.js','tests/firebase-operations.test.js','tests/firebase-operations.browser.cjs','js/atomicPersistence.js','js/router.js','js/views.js','js/cfr05CloudCuttingFiles.js')
   foreach($file in $files){node --check $file; if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}}
   ```

   Earlier individual checks `node --check js/core.js` and `node --check js/cuttingJobImporter.js` passed; both new test files were checked again after editing.

6. PASS: `git diff --check` (also repeated on the staged diff before commit). Integration audit used `rg -n 'firebaseOperations|firebaseOperation|operations:' js/core.js index.html` and searches for `runTransaction`, `writeAuthoritativeStateSnapshot`, `saveCloudNow`, `saveCloudDebounced`, `onSnapshot` and Storage upload calls across `js/`.

## Browser checks still required

Real authenticated Firebase/Storage network behavior, permission-denied SDK responses, offline/unsettled writes, actual production-data navigation during saves, assistive-technology announcement behavior and additional browsers/devices were not exercised. Storage lifecycle coverage is controlled Node testing plus the existing CFR05 tests, not a live upload. No production Firebase data was touched, no destructive tests ran, Clear All Data was never invoked, and no PR merge is authorized.
