# RFS-02 — comprehensive save reliability audit

**RFS-02B acceptance correction (October 26):** disabled Calendar removal was
temporary containment and is superseded by verified history-preserving
cancellation. See [RFS-02B implementation, evidence and Undo architecture](RFS-02B-authorized-removal.md)
for the current removal contract and final results. The pre-edit sections and
original run counts below remain historical audit evidence.

## Pre-edit architecture and plan

Recorded before application edits. Base `0c11b0f` is latest fetched main and
contains merged #520/#522. Dedicated branch `recovery-firebase-save-audit-rfs02`.
#519 remains open/draft at `881fd6e`; #521 open at `b145455`. Neither is merged
into this branch. No package.json or applicable AGENTS.md was found.

All eight systems use `workspaces/github-prod/app/state`, except the cutting-file
Storage/compatibility-document subsystem and explicitly browser-only drafts.
`saveCloudNow`/debounced saves serialize `performCloudSave` through cloudSaveQueue.
The ordinary path snapshots local bindings, checks content/size/protected state,
reads remote state with document.get, checks revision, then calls the real shared
CAS writer. Its transaction checks fixed revision and protected preflight again.
It presently reports saved and advances loaded evidence immediately after writer
acknowledgement, **without independent committed-state readback**. Bookkeeping
exceptions after acknowledgement return saved:true. Thus purchase-history edits,
job deletion/undo, layouts, hours and many legacy handlers inherit an unverified
success contract. Several UI handlers additionally toast before awaiting it.

Specialized coordinators have stronger contracts: archive/restore and materials
read independently via transaction.get and compare full source/intended/committed
states before adoption. Water-quality, pump baseline and RPM edits independently
verify full state and maintain locks; purchase orders reserve intent, validate
exact identities/whole-order replacement and independently read/adopt. Job
chronology captures backend/actor and verifies exact state, but its v8 server-get
adapter can still reuse listener state; bounded read-only polling exists. RFS-01
one-time calendar lifecycle now captures target and independently verifies its
acknowledged revision. These corrections must remain intact.

Legacy calendar single removal overwrites a completion's manual-history status
with removed and can re-enable a disabled schedule; as-required instances are
spliced out. Future/all removal prunes completedDates/manualHistory/notes/hours.
Repeat-stop writes status before an unawaited event save; last-visible removal
first appends a removal. These semantics do not safely distinguish cancellation
from historical erasure. They must be isolated if preservation cannot be proved.

Planned exact application paths, subject to reproductions:

- `js/core.js:performCloudSave`: capture document/db/project/actor for the whole
  operation; independent read-only transaction baseline and post-commit proof;
  verify complete acknowledged state before advancing loaded evidence/reporting
  success. Keep genuine post-verification bookkeeping warnings distinct from
  uncertain readback. Preserve all existing preflight/CAS gates, no retries.
- `js/calendar.js:removeCalendarTaskOccurrences`, repeat-remove/stop handlers:
  isolate unverified legacy historical deletion/stop paths before any mutation,
  using actionable feedback. Keep verified V2 one-time lifecycle and exact archive
  paths available; no speculative cancellation schema or mass history rewrite.
- `docs/RFS-02-read-only-health.js`: derive RFS-01 diagnostic with explicit
  PASS/WARNING/FAIL and unknown verification scope, no state writes.
- New RFS-02 persistence/fault/browser regressions using real core/CAS/validators;
  adapt existing ordinary-save test fixtures to model read-only transactions.
  This report and operation matrix record all remaining gaps independently.

Integration review: #521 changes calendar shared event/history projection and
Settings History navigation; its changes overlap calendar.js/renderers.js, not
authorization to alter persistence. #519 changes archived history collection,
purchase financial projection, financial evidence/labels and delayed refresh;
core's eight changed lines retain canonical date-only strings and allow a
focused financial-period selector to refresh; they do not change this save contract.
Future integration must retain RFS-01 popup view copies, independent calendar
readback, archive ID resolution and exact cost provenance. No financial formula,
task/event migration or production record change is planned.

## Operation matrix prepared before edits

S = synthetic backend, B = disposable browser, F = authenticated Firebase.
Every row starts **UNTESTED** for F. PARTIAL means code/related coverage only,
not an assertion of verified operation persistence. Final evidence is added below.

| ID/system/action | Source handler; authoritative fields | Path / intended delta; retained evidence | Existing test source | Initial S / B; defect or gap |
|---|---|---|---|---|
| CAL01 create one-time | createMaintenanceV2FromTemplate; maintenance*V2 | RFS-01 runner/CAS; append definition/instance/root | mcf-01, maintenance-new-one-time | PARTIAL/PARTIAL; rerun |
| CAL02 complete/reverse | appendV2OccurrenceEvent | Runner; append lifecycle, retain scheduled/completed evidence | mcf-01, rfs01 | PARTIAL/PARTIAL |
| CAL03 note/hours/move | appendV2OccurrenceEvent | Runner; append event with stable root | mcf-01 | PARTIAL/UNTESTED |
| CAL04 one-time remove | removeV2OneTimeOccurrence | Runner; append removed, retain history | rfs01 browser/unit | PARTIAL/PARTIAL |
| CAL05 legacy single remove | removeCalendarTaskOccurrences | Ordinary unawaited save; rewrites manual status/splices instance | calendar source audit | FAIL/UNTESTED; preservation ambiguous |
| CAL06 legacy future/all | same | Prunes historical arrays/maps | calendar source audit | FAIL/UNTESTED; history erasure risk |
| CAL07 repeat create/edit | createMaintenanceV2FromTemplate, repeat panel | Ordinary save; append/modify V2 | mcf-01, maintenance-new-one-time | PARTIAL/PARTIAL |
| CAL08 repeat removal/stop | appendV2RepeatEventByRoot, stopV2RepeatTracking | Unawaited ordinary save/instance rewrite | mcf-01 | PARTIAL/UNTESTED; premature confirmation |
| CAL09 archive/restore | archiveCalendarTask, maintenanceTaskDeletionApi | Exact selected transfer; retain history/inventory/original ID | mdel01*, rfs01 | PARTIAL/PARTIAL |
| CAL10 legacy complete/reverse | markCalendarTaskComplete/unmarkCalendarTaskComplete | Local mutation + ordinary save; prior completion evidence at risk | calendar source audit | PARTIAL/UNTESTED |
| MNT01 create task | Settings creation helpers | Ordinary save; new stable definition, inventory linkage | maintenance-task-setup | PARTIAL/UNTESTED |
| MNT02 edit interval/config | Settings delegated change handlers | Debounced save; only selected config expected | maintenance-task-setup | PARTIAL/UNTESTED; early local normalization |
| MNT03 history update | edit logged hours / manual history | Ordinary save; retain original event identities | maintenance-history-import | PARTIAL/UNTESTED |
| MNT04 complete/uncomplete | completion handlers | Ordinary/legacy/V2 differs by source | mcf-01, recovery-import | PARTIAL/UNTESTED |
| MNT05 archive/restore | deleteMaintenanceTaskMeta / archive API | Isolated transaction, exact ID/payload, history stays | mdel01 deletion/restoration | PARTIAL/PARTIAL |
| MNT06 inventory-linked task | archive API / inventory link editor | Archive retains FK; editing uses ordinary save | global-identity, mdel01 | PARTIAL/PARTIAL archive; edit UNTESTED |
| MNT07 Settings/Calendar history agreement | buildMaintenanceCompatibilityStream / history popup | Read-only projection; zero writes required | mcf-01; #521 separate | PARTIAL/UNTESTED; #521 reconciliation outstanding |
| DSH01 daily hours create | logging handlers/setDailyCutHoursEntry | Debounced; dailyCutHours, totalHistory/task baselines | ach*, firebase-two-computer | PARTIAL/UNTESTED; early toast |
| DSH02 historical hours edit | logged-hours editor | Ordinary; correct selected date, preserve unrelated days | ach-edit-logged-hours-noop | PARTIAL/UNTESTED |
| DSH03 statistics/tracking | refreshDerivedDailyHours / computations | Derived views versus persisted histories distinct | ach-average-cut-hours, cut-cost-* | PARTIAL/UNTESTED persistence |
| DSH04 layout move/resize | persistDashboardLayout | Debounced; dashboardLayout only | rfs01 browser | PARTIAL/PARTIAL |
| DSH05 widget hide/removal | layout metadata/UI visibility | Some DOM/window state only; persisted layout key removal differs | rfs01 scoped rectangle test | PARTIAL/PARTIAL; no universal widget-delete path |
| DSH06 water-quality record | saveWaterQualityCheck | Isolated map/CAS/read/adopt; retain old checks | water-quality-persistence/browser | PARTIAL/PARTIAL |
| DSH07 downtime/garnet | removeDownTime/removeGarnetEntry | Ordinary; downtime/cleanings/history; early toasts | calendar/renderers audit | PARTIAL/UNTESTED |
| JOB01 create/edit | createCuttingJob/saveCuttingJobEdit | Chronology coordinator/CAS/exact verification; retain IDs/files/manual logs | cjo04c, cfr06 | PARTIAL/PARTIAL |
| JOB02 active->completed | completeCuttingJob | Proven transfer, chronological audit | cjo04c, cjo06 | PARTIAL/PARTIAL |
| JOB03 manual hours add/edit | job log editor | Ordinary/debounced; manualLogs and linked totals | cjo02, cje-completed-duration | PARTIAL/UNTESTED; early toast |
| JOB04 chronology edit | cuttingJobChronologyMutationApi | Captured exact state; bounded server-get readback | cjo04c/cjcd01b | PARTIAL/PARTIAL; stale view surface |
| JOB05 attachment references | removeCuttingJobAttachmentReference | Proof + shared writer/verify | cja01 | PARTIAL/PARTIAL |
| JOB06 cloud file attach/list | cfr05CloudCuttingFiles | Separate Storage and Firestore compatibility docs; immutable file IDs | cfr05/cfr06 | PARTIAL/UNTESTED transport |
| JOB07 active/past delete | deleteCuttingJob | Scoped Trash transfer via ordinary save; manual history retained | cjd01/cjo06 | PARTIAL/PARTIAL; no generic readback |
| JOB08 restore/undo/redo/copy | history handlers | Existing authorization, stable originals/copy new ID | cjd01/cjo06 | PARTIAL/PARTIAL |
| PUMP01 add/edit baseline | savePumpBaseline | Isolated scoped write; baselineHistory/corrections retained | pump-baseline | PARTIAL/PARTIAL |
| PUMP02 pump rebuild | rebuild maintenance projections | Baseline/service/legacy completion links distinct | pump-rebuild-duplication | PARTIAL/UNTESTED |
| PUMP03 notes remove/edit | pumpApplyEntryUpdates | Ordinary save; notes retained except selected edit | pump source | PARTIAL/UNTESTED; unawaited acknowledgement |
| RPM01 create reading | savePumpLogChange | Isolated exact write/read/adopt | polishv2-pump-log | PARTIAL/PARTIAL |
| RPM02 edit value/time/date | same | Stable ID/original evidence, no date collision | polishv2-pump-log/browser | PARTIAL/PARTIAL |
| RPM03 delete reading | pumpRemoveEntry | Legacy local filter + ordinary save | pump source | PARTIAL/UNTESTED; early success risk |
| RPM04 graph refresh | pump render/compute helpers | Derived display, zero write expected | pump-baseline/polishv2 | PARTIAL/PARTIAL; not mutation proof |
| INV01 add/edit/quantity | inventory delegated handlers | Ordinary save; inventory/FK quantities | inventory-identity | PARTIAL/UNTESTED |
| INV02 task link/archive link | inventory link and archived namespace | Ordinary edit/exact archive; no name-based remap | global-identity/mdel01 | PARTIAL/PARTIAL archive only |
| INV03 materials cells/types/undo | inventoryMaterialMutationApi | Map-scoped isolated/CAS/full-state read/adopt | inventory-material-persistence | PARTIAL/PARTIAL |
| INV04 delete/folders | inventory remove/category handlers | Ordinary; links/purchases must survive | inventory-identity/repair | PARTIAL/UNTESTED destructive UI |
| INV05 concurrent quantities | normal CAS pipeline | Fixed expected revision; loser must not overwrite | firebase-two-computer | PARTIAL/UNTESTED UI |
| PUR01 create order | purchaseOrderApi.save | Exact append receiptTrackerWeeks, line/order IDs/dates | purchase-orders unit/browser | PARTIAL/PARTIAL |
| PUR02 edit order/remove line | purchaseOrderApi.edit | Whole-order replacement, confirmed line IDs | purchase-orders | PARTIAL/PARTIAL |
| PUR03 legacy receipt edit | savePurchaseHistoryWeek | Ordinary awaited save; rows/year dates retained | purchase-history-navigation | PARTIAL/UNTESTED; no independent readback |
| PUR04 inventory linkage | receipt link handlers | Ordinary; selected row/inventory ID | purchase-history-navigation | PARTIAL/UNTESTED |
| PUR05 display/export/year | purchaseFinancials/costs views | Read-only projection, no finance changes | purchase-financials | PARTIAL/UNTESTED backend comparison |
| PUR06 concurrent/reload | purchaseOrderApi | Captured source/CAS/read/adopt, no duplicate retry | purchase-orders browser | PARTIAL/PARTIAL |

Initial FAIL labels for CAL05/06 are code-observed hazards; executable
reproductions and final per-layer classifications follow before delivery.

## Executive assessment and reproduced defects

**Ready for review as a bounded P0 guard improvement, not a clean bill of health
for OMAX.** All eight systems were traced and received relevant regression
coverage, but no system's entire CRUD/fault/device matrix is certified. Real
authenticated Firebase verification is UNTESTED for every row. No production
records were read, edited, deleted or migrated. No deployment or financial
formula change was performed.

1. **Ordinary acknowledgement was reported as verified persistence.**
   `scripts/rfs02-main-baseline.cjs` executes frozen main `0c11b0f`'s real
   `performCloudSave` with the real writer/preflight on a disposable backend.
   Independent reads are made unavailable after commit; main returns saved:true
   without attempting that read. New tests instead return saved:false,
   stateWriteCompleted:true, indeterminate:true and retain the old loaded
   revision/evidence. No second write occurs. Revision/protected mismatch,
   changed actor, cached/pending proof and separate recovery blockers do the same.
2. **Ordinary preflight used the listener/cache-capable document.get path.**
   The new suite pins document.get to the old snapshot, then performs consecutive
   legitimate field saves. The captured read-only transaction baseline and
   readback are fresh, revisions advance, both independent browser profiles
   reload the result and later saves work. CAS conflicts still reject without
   overwriting a newer session. No read is treated as write verification.
3. **Late bookkeeping could regress loaded authoritative evidence.**
   A test pauses in metadata bookkeeping and models a newer independently adopted
   listener revision. The old final assignment overwrites that newer baseline
   with the earlier saved document. This test failed before the correction.
   Loaded evidence is now published once, immediately after independent proof;
   late metadata completion cannot overwrite it. This is not an unlock or retry.
4. **Legacy occurrence removal has destructive historical semantics.**
   Frozen-main executable reproduction shows single removal changes a completed
   manual-history status to removed; future/all removal clears matching
   completedDates, manual history and notes before persistence. As-required
   instances could be spliced out. These are not proven equivalent to cancelling
   a future reminder. RFS-02 initially disabled these paths. RFS-02B replaces that
   containment: single/future/all append scoped cancellation intent; repeat Remove
   and Stop use exact root/status lifecycle transactions. Source history remains
   exact. All of these actions now pass real guarded-save and browser checks;
   no removal is classified as successful merely because it is blocked.

## Exact implementation and conservation contract

`core.js:performCloudSave` captures one existing backend/document/project/actor,
uses `readMaintenanceTaskAuthoritativeState` for both baseline and readback, and
passes that same target to the existing guarded writer. The reader rejects
cache/pending metadata and changed targets. A successful result requires the
entire independently read document to equal the acknowledged document with an
advancing safe-integer revision. The sole existing ordinary compaction omission,
syncProcessLog, is retained exactly from the independent source and compared;
it is not ignored. No protected collection is exempted from comparison.

Loaded revision/cache and success logging follow proof. Commit acknowledgement
with failed proof suspends writes and preserves existing indeterminate evidence.
Definite pre-write/permission/CAS failure remains an ordinary failure. Errors
after successful proof remain secondary bookkeeping warnings. Existing
save-queue order, CAS callback retry rules, preflight, content/size limits and
specialized coordinators are retained. RFS-01's reader/listener/archive/view-copy
fixes are retained. Recent ordinary errors are diagnostic evidence only.

No general authoritative normalization/adoption is added: ordinary handlers
already stage their live edits. The verified server snapshot establishes the
loaded baseline, while newer local edits stay pending using lastLocalMutationAt.
Each specialized coordinator retains its stronger exact live-adoption contract.
Consequently a green ordinary pipeline test is not proof that a legacy UI handler
changed only the intended business fields before calling it.

The CJD fixture was extracted into `tests/rfs02-normal-harness.cjs` for shared use;
it now models read-only transactions as zero commits. CJD rollback/history
assertions remain intact; its concurrent-trash injector is idempotent across
the additional reads. The two-computer extraction harness now includes the
existing independent-reader dependency omitted after RFS-01. The one-time
browser instrumentation asserts four real independent reads rather than the
obsolete server-get calls. No failure expectation was converted into a success.

## Final per-operation classifications

For this table, PASS is confined to the named scenario/test, not every requested
failure vector. **F = UNTESTED for all entries**, including every PASS below.
Browser pipeline tests that directly stage fields are PARTIAL for the user action.
`rfs02-save-audit` tests real ordinary preflight/writer/readback; its browser test
uses separate profiles, a shared fixture CAS backend, full reloads and Firestore
recursive merge semantics. Existing feature suites provide the UI-level evidence.

| IDs | Final synthetic S | Final disposable browser B | Repair/evidence and limitation |
|---|---|---|---|
| CAL01 | PASS selected creation/lifecycle fixtures | PASS actual dashboard Add, three report baselines | mcf-01/maintenance-new-one-time; ordinary verification strengthened |
| CAL02 | PASS append/reverse scenarios | PARTIAL completed creation/removal workflows | mcf-01 lifecycle unit; not every reversal UI/fault pair |
| CAL03 | PASS selected note/hours/move lifecycle cases | UNTESTED full edit UI | mcf-01; no calendar-wide edit certification |
| CAL04 | PASS stable root/history/readback | PASS actual Remove and reload | RFS-01 browser rerun, preserved |
| CAL05/CAL06 | PASS exact single/future/all cancellation conservation | PASS all scopes, reload, stale second browser, rejection/uncertainty | RFS-02B append-only ledger; completed history and inventory retained |
| CAL07 | PARTIAL repeat create/edit | PARTIAL | Remaining legacy repeat actions still acknowledge early |
| CAL08 | PASS exact-root Remove and exact-instance Stop conservation | PASS both actions, reload and preserved completed roots | RFS-02B verified lifecycle events; no last-visible automatic Stop |
| CAL09 | PASS real exact archive/restore CAS/adoption | PASS actual archive/Restore, reload and independent profiles | MDEL and RFS-01 suites rerun |
| CAL10 | PARTIAL | UNTESTED | Legacy completion/reversal history policy requires review |
| MNT01 | PARTIAL raw creation + task-setup tests | PARTIAL pipeline only | Actual Settings create form not independently exercised here |
| MNT02 | PASS scoped interval pipeline, PARTIAL other config fields | PARTIAL interval field pipeline/reload in two profiles | No universal delegated-handler verification |
| MNT03/MNT04 | PARTIAL | UNTESTED Settings edit/completion UI | Import/lifecycle tests do not certify every legacy editor |
| MNT05 | PASS rich/no-history/linked archive and exact-ID restore | PASS actual UI, reload, second independent profile | Entire unrelated source fields/history compare exactly |
| MNT06 | PASS archived FK scenarios; PARTIAL link editor | PASS archive-linked fixture; link editor UNTESTED | No active-only identity regression |
| MNT07 | PARTIAL | PARTIAL preserved archive/history display only | #521 reconciliation not incorporated; agreement not certified |
| DSH01/DSH02 | PASS selected ordinary day records; PARTIAL real log handlers | PARTIAL direct setDailyCutHoursEntry + reload/second profile | Early handler toasts/debounce navigation remain risks |
| DSH03 | PARTIAL | PARTIAL read-only financial/tracking views | One unchanged main projects-accuracy failure remains |
| DSH04 | PASS selected rectangle saves; PARTIAL map-removal semantics | PASS RFS-01 scoped layout workflow; PARTIAL recursive-map deletion | Map omission needs emulator/SDK-specific review before broad certification |
| DSH05 | PARTIAL | PARTIAL layout persistence/visibility | No claim that DOM-only hiding persists as a business deletion |
| DSH06 | PASS guarded create/edit/failures | PASS actual water-quality forms, reload, layout/calendar relationships | Existing isolated coordinator retained |
| DSH07 | PARTIAL | UNTESTED removal UI | Ordinary readback improved; early toasts and historical intent not repaired |
| JOB01 | PARTIAL; existing category/draft extraction failures remain | PASS notes workflow; FAIL existing historical-category preservation checks | Main-baseline comparison below; not a complete Create/Edit certification |
| JOB02 | PASS existing chronology/completion fixtures | PARTIAL | CJO unit coverage; no exhaustive new completion UI matrix |
| JOB03 | PASS ordinary scoped manual-log pipeline; PARTIAL actual editor | UNTESTED complete hours editor path | Early acknowledgement remains separate from strengthened save contract |
| JOB04 | PASS existing captured chronology/CAS/fault fixtures | PARTIAL | v8 server-get adapter still a bounded-read surface; not changed speculatively |
| JOB05 | PASS existing attachment-removal fixtures | UNTESTED full attachment UI/network | Stable file/job references preserved by tests; no live Storage |
| JOB06 | PASS isolated file/metadata model tests | UNTESTED authenticated Storage/Firestore transport | Separate compatibility-doc system audited, not rewritten |
| JOB07/JOB08 | PASS real deletion/Trash/undo/redo/history/CAS | PARTIAL prior workflows | CJD tests now use ordinary independent proof; no new exhaustive restore UI |
| PUMP01 | PASS existing baseline/correction/history fixtures | UNTESTED complete baseline form | Strong isolated coordinator unchanged |
| PUMP02 | PARTIAL rebuild/duplication fixtures | UNTESTED | No baseline/service migration or history rewrite |
| PUMP03 | PARTIAL | UNTESTED | Unawaited note confirmations still require UI repair |
| RPM01/RPM02 | PASS existing exact log/identity/date/fault fixtures | PASS selected RPM edit/create cases in POLISH suite; suite overall fails elsewhere | Does not certify deletion or every physical-device scenario |
| RPM03 | PARTIAL | UNTESTED | Legacy delete/early success remains RFS-03 |
| RPM04 | PASS selected model-only cases | PARTIAL graph refresh | Display refresh alone is not persistence proof |
| INV01 | PASS scoped quantity/additional ordinary fields; PARTIAL inventory UI | PARTIAL stock pipeline with two profiles | No complete Add/Edit form matrix |
| INV02 | PASS exact archived FK and orphan blocking fixtures | PASS archive-linked fixture; edit UI UNTESTED | Stable IDs and malformed/ambiguous reference rejection retained |
| INV03 | PASS existing material/coordinator/concurrency fixtures | UNTESTED full material grid UI here | Real exact map writer/readback tested synthetically |
| INV04 | PARTIAL | UNTESTED | Inventory delete/folder workflows not certified or relaxed |
| INV05 | PASS fixed-revision winner/loser scenarios | PASS raw quantity change in separate profiles, stale loser/reload | Not proof of every quantity-control handler |
| PUR01/PUR02 | PASS whole-order append/edit/confirmed-line fixtures | PASS actual create/edit/removal confirmation/cancel/reload/export | purchase-orders browser suite retained, no formula changes |
| PUR03 | PASS scoped ordinary receipt field pipeline; PARTIAL receipt editor | PARTIAL direct receipt change/reload in both profiles | Awaited legacy editor now receives verified save result; UI not fully tested |
| PUR04 | PARTIAL | UNTESTED linkage UI | Source/FK tests are not full link-editor certification |
| PUR05 | PASS selected finance/date/export model checks | PARTIAL actual order export | #519 historical collection and modeled-contribution work excluded |
| PUR06 | PASS order CAS/no-duplicate/uncertainty cases | PASS order reload; PARTIAL cross-profile order UI | Shared ordinary browser conflict test uses inventory, not a second order editor |

## Data-conservation and failure evidence

- Seven ordinary field scenarios (maintenance interval/config, inventory stock,
  receipt history, daily hours, cutting-job manual log, pump/RPM entries and V2
  definition) run real core preflight + atomic writer + independent verification.
  Each compares every unrelated business root exactly, checks advancing revision,
  reloads and performs a second edit. These are pipeline tests, not invented UI
  handler coverage. Existing pump/RPM feature tests supply separate model paths.
- The new browser uses recursive Firestore merge semantics, no Firebase SDK and
  blocks all external traffic. Two independent browser profiles see the same
  backend after actual reloads; one authoritative write occurs per accepted
  operation. Existing workspace metadata writes are counted separately. The
  stale profile's save rejects without changing backend records. An acknowledged
  write with unavailable independent read remains unconfirmed, retains the old
  loaded revision, blocks a second write and is visible after fresh reload.
- Calendar blocked operations are checked against complete before/after source
  objects with historical completions and zero write paths; the actual Remove
  occurrence browser click leaves authoritative and live task arrays unchanged.
- Existing MDEL, materials, pump, orders, water and identity suites continue to
  exercise protected relationships, exact IDs, invalid/orphan/ambiguous blockers,
  permission rejection, revision conflicts, local/remote drift and uncertainty.
- Read-only health script tests preserve application gate evidence and backend
  bytes, report zero writes and explicitly label mutation reliability UNTESTED.
  A current-state PASS never certifies a Firebase write.

Firestore map merge behavior matters: merge:true can retain omitted nested
fields, while empty maps and explicit field masks have different semantics.
The [official Firestore guidance](https://firebase.google.com/docs/firestore/manage-data/add-data)
and [SDK SetOptions contract](https://github.com/firebase/firebase-js-sdk/blob/main/packages/firestore/src/lite-api/reference.ts)
informed the recursive fixture model. An exact readback mismatch is kept blocked,
not normalized away. This work does not grant general permission to delete map
fields or replace protected records merely to satisfy a comparison.

## Commands and actual results

All commands ran in this branch's checkout unless the frozen-main directory is
specified. No package.json exists and no npm command was run. Raw logs and the
frozen export are local ignored artifacts under `artifacts/rfs-02/`.

```powershell
# Frozen, untouched main export for an independent baseline:
git archive --format=zip -o artifacts/rfs-02/baseline.zip 0c11b0f
& 'C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -c 'import zipfile; zipfile.ZipFile("artifacts/rfs-02/baseline.zip").extractall("artifacts/rfs-02/main-baseline")'
$rfsBase='C:\CodexProjects\OMAX\.worktrees\rfs-02\artifacts\rfs-02\main-baseline'
$rfsTests=Get-ChildItem (Join-Path $rfsBase tests) -Filter '*.test.js' | ForEach-Object {$_.FullName}
Push-Location -LiteralPath $rfsBase
node --test --test-concurrency=4 --test-reporter=tap $rfsTests > ../main-baseline-final.tap
Pop-Location
# Actual FAIL baseline: 1,798 PASS / 13 FAIL / 1,811 total, no skips.

node scripts/rfs02-main-baseline.cjs
# PASS: frozen-main missing-readback and destructive legacy-history reproductions.

$rfsTests=Get-ChildItem tests -Filter '*.test.js' | ForEach-Object {$_.FullName}
node --test --test-concurrency=4 --test-reporter=tap $rfsTests > artifacts/rfs-02/all-final.tap
# Actual FAIL full suite: 1,821 PASS / 10 FAIL / 1,831 total, no skips.
# The ten failures are the same named failures on frozen main; zero new failures.

node --test --test-reporter=tap tests/rfs02-save-audit.test.js tests/cjd01-job-deletion.test.js tests/firebase-two-computer-baseline.test.js tests/rfs01-save-reliability.test.js > artifacts/rfs-02/targeted-final.tap
# PASS: 135/135, no skips. Includes 20 RFS-02 operation/fault/diagnostic checks.

$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node --test --test-concurrency=2 --test-reporter=tap tests/rfs02-save-audit.browser.cjs tests/rfs01-save-reliability.browser.cjs tests/mdel01-task-deletion.browser.cjs tests/mdel01c-restoration.browser.cjs tests/water-quality.browser.cjs tests/purchase-orders.browser.cjs tests/maintenance-new-one-time.browser.cjs tests/cj-notes-persistence.browser.cjs tests/cje-completed-duration.browser.cjs > artifacts/rfs-02/browser-final.tap
# PASS: 33/33 including nested cases, 13 top-level workflows, no skips.

# Extended existing browser suite, run on both branch and frozen main:
node --test --test-reporter=tap tests/polishv2.browser.cjs
# Both actual FAIL: 17 PASS / 4 FAIL / 21 total.
# Three failing leaf cases plus their failed parent test, detailed below.

$rfsFiles=@('js/core.js','js/calendar.js','tests/cjd01-job-deletion.test.js','tests/firebase-two-computer-baseline.test.js','tests/maintenance-new-one-time.browser.cjs','tests/rfs02-normal-harness.cjs','tests/rfs02-save-audit.test.js','tests/rfs02-save-audit.browser.cjs','scripts/rfs02-main-baseline.cjs','docs/RFS-02-read-only-health.js')
foreach($rfsFile in $rfsFiles){node --check $rfsFile;if($LASTEXITCODE){throw $rfsFile}}
git diff --check
& 'C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/check_binaries.py
```

The full-suite remaining failures, unchanged on main:

- `cjo02b-safety.test.js`: canonical and mixed actual Jobs add handler dependency
  extraction, and blocked repair UI extraction (three failures).
- `cjpc01-manual-paths.test.js`: unrelated/category/history ownership edits,
  verification wait, financial-duration save and new-job draft capture (six
  failures). Several lack `resolveCuttingJobFinancialDuration` in their extraction
  context; the draft assertion targets a changed form field.
- `projects-accuracy.test.js`: ACC02 historical-duration calculation-only copy
  expectation (one failure). Financial calculations were not changed to satisfy it.

The three additional frozen-main failures in `firebase-two-computer-baseline`
were missing independent-reader extraction after RFS-01; they now pass with the
actual dependency supplied. This is fixture repair, not evidence that three
additional production defects were fixed.

Extended POLISH browser failing leaf cases, all reproduced on frozen main:

- Historical project reassignment preservation and historical category reload
  preservation both differ in saved efficiency snapshots (`gainLoss`,
  `hoursTaken`, `totalProfit`). These need separate business/fixture review; no
  financial values or formulas were rewritten in this PR.
- New category/project UI test calls inputValue on a non-input project-number
  element. Its assertion/UI contract needs separate review.

Intermediate runs included a transaction-count fixture correction (workspace
metadata is distinct from authoritative state writes), missing extracted helpers,
and obsolete read instrumentation. The new late-bookkeeping test was run before
its fix and failed with a regressed loaded snapshot. Final affected checks above
passed after those corrections. The full-suite and extended-browser failures
remain explicitly reported rather than being hidden by the targeted pass counts.

## Diagnostic, unknowns and RFS-03 priorities

Paste the entire [RFS-02 read-only health script](RFS-02-read-only-health.js) into
F12 on the signed-in deployed page. It performs a read-only backend transaction,
checks captured backend/actor, prints available feature/schema/script evidence,
authoritative/loaded revisions, gates, identities/archive links, protected
summaries and recent ordinary/uncertain errors. It summarizes current evidence as
PASS/WARNING/FAIL, with explicit unknown mutation coverage. It never saves,
retries, restores, repairs or changes application/localStorage evidence. Exact
deployed Git SHA is unknown unless the deployment exposes it. The script was
verified synthetically only; **no real authenticated Firebase check occurred**.

The audit distinguishes persisted records from temporary presentation state:
editor drafts, modal/hover/focus state, generated file previews and chart controls
are not proofs of committed business records. Layout caches and the local
material-settings/profile preferences do not authorize overwriting authoritative
inventory, jobs or history. Legacy browser-only water-quality evidence retains
its existing explicit reconciliation behavior; Firebase remains authoritative.

Recommended RFS-03 work, in priority order:

1. RFS-02B delivered history-preserving legacy cancellation and repeat-stop
   with scoped confirmation, exact source/prepared-state proof and verified
   adoption. Remaining follow-up: authenticated SDK/emulator and deployed checks;
   inverse cancellation UI remains a separate explicitly scoped operation.
2. Move early-success legacy hours, completion/reversal, repeat-event, pump-note,
   RPM-delete, garnet and inventory handlers onto awaited verified acknowledgements
   with bounded rollback or preserved drafts. Strengthening ordinary persistence
   does not repair a toast emitted before its promise completes.
3. Resolve the existing historical-job efficiency preservation evidence and
   stale test extraction/UI contracts without silently changing financial data.
4. Validate every merge-sensitive map deletion with a disposable Firestore
   emulator/actual v8 SDK. A shallow fixture passing layout removal does not prove
   recursive Firestore map omission behavior. Current exact mismatches block.
5. Replace or independently verify remaining server-get consumers, notably job
   chronology/import/repair and explicit legacy add wrappers. Their current
   bounded verification protections were retained, not generalized speculatively.
6. Exercise actual Settings/inventory CRUD/folder/link editors, all historical
   purchase editors, baseline forms, attachments/Storage, debounced navigation
   loss and every operation's complete permission/CAS/offline/readback matrix.
7. Run authenticated emulator/preview checks, network interruption and pending
   writes, multiple physical devices, other engines and the Vercel/GitHub Pages
   deployment/version matrix. New ordinary saves add two read-only transactions;
   network latency/read cost and SDK transaction behavior require live validation.
8. Integrate #519/#521 only through their own reviewed merge process, retaining
   archive identity and RFS readback guards and rerunning combined history/cost
   tests. Their unmerged fixes are not asserted to exist on this branch.

Recommendation: **ready for review of this bounded P0 patch and truthful audit;
further work is required before claiming comprehensive reliability.** Existing
failing suites and uncovered operations must remain visible during the merge
decision. Do not merge automatically.
