# RFS-01 — Recovery and save reliability

## Read-only audit recorded before application edits

Base: fetched origin/main `7285ac1e78d8387bb6beed3a64c1b843da8107db`.
Branch: `recovery-firebase-save-stabilization`. No package.json or applicable
AGENTS.md was found. The original checkout and unrelated open branches are untouched.
GitHub metadata checked October 23, 2026: #520 merged; #519 open/draft
(`19e36c6`); #521 open/conflicting (`b145455`). No unmerged work is incorporated.
#521 overlaps calendar event projections; #519 overlaps core/renderers and cost
history. Retain their behavior in future integration and rerun combined tests.

### Lifecycle and proposed scope

Settings `deleteMaintenanceTaskMeta` confirms before calling
`maintenanceTaskDeletionApi.remove`. `maintenanceTaskArchive.createApi` locks,
settles the save queue, captures db/document/project/actor/backend, independently
reads via a read-only Firestore transaction, compares loaded and live evidence,
validates exact identities, and plans a single intact active/archive transfer.
`writeAuthoritativeStateSnapshot` invokes `OMAXAtomicPersistence.save` with a
fixed expected revision. Its prepare callback runs protected preflight, archive
conservation proof, content/size checks and exact prepared-state restrictions.
The transaction checks remote revision before one write. Independent backend
readback must equal the committed and intended documents; only then does
`adoptIdentityCheckedAuthoritativeState` establish live/loaded revision and
history evidence. UI acknowledgement follows verified adoption. Restore uses the
same path and original ID. Inventory materials use their own isolated coordinator,
map-scoped writes, independent transaction reads and exact full-state verification.

Calendar one-time lifecycle events use `appendV2OccurrenceEvent` ->
`runMaintenanceCalendarMutation` -> `createMutationRunner` -> `saveCloudNow` ->
serialized `performCloudSave` -> shared CAS writer. The runner stages append-only
V2 events, checks baseline and preserves rollback evidence. Its current
`readCloud` adapter calls `readCurrentCloudStateReadOnly`, whose v8 server-get
can reuse a stale listener view even after the writer acknowledged a commit.
The runner then classifies the old business state as a verification failure.
The existing archive/material adapters already explain and avoid this problem.

Legacy calendar `showTaskBubble` Remove task instead records one archive and
calls `removeCalendarTaskFamily` directly, then starts an unawaited ordinary save
and immediately reports success. Family removal can remove unarchived descendants
and history; it has no exact archive proof for protected preflight. It bypasses
the protections now used by Settings. Occurrence cancellation, completion reversal
and definition archiving have different meanings and must remain distinct.

Realtime `startWorkspaceStateListener` validates identity before inspecting the
incoming revision; an old invalid snapshot can therefore suspend a currently
valid session. Cache/pending missing snapshots are also checked too early. Latest
invalid authoritative evidence must still suspend writes. Existing in-progress
coordinators own adoption, and must continue to do so.

Planned application files/functions (before edits):

- `js/core.js`: `startWorkspaceStateListener` ordering/cache exclusion;
  `runMaintenanceCalendarMutation.readCloud` use the existing captured-target,
  independent read-only backend transaction adapter.
- `js/calendar.js`: legacy Remove task click in `showTaskBubble`; a small shared
  `archiveCalendarTask` UI helper reuses the existing exact single-task coordinator.
  Confirmation will describe the selected definition, preserved history and stored
  events, rather than promise deletion of an entire family.
- `js/maintenanceCalendarIntegrity.js`: `createMutationRunner` require advancing,
  loaded-agreeing verification revision and an open independent write gate before
  acknowledging an already committed lifecycle event.
- New `tests/rfs01-save-reliability.test.js`, disposable browser regression,
  read-only F12 diagnostic and this report. Existing MDEL fixtures/harnesses reused.

`atomicPersistence.js`, `globalIdentityRepair.js`, `maintenanceTaskArchive.js`,
inventory/material coordinators, recurrence calculations and financial formulas
are inspected dependencies; no changes are planned to their guards or semantics.

### Recovery/save-gate inventory

`isRecoveryMode` reads `__recoveryInspectMode`; `canWriteCloud` additionally
checks `__autosaveDisabled`, initial load/adoption, local-backup-only state and
isolated mutation locks. URL recovery/readonly/diagnostics and preview flags
start read-only. Missing authoritative state, invalid global/inventory identities,
content/shape/size/protected checks, failed exact adoption/history initialization,
uncertain atomic writes, import/repair verification failures and isolated
coordinator readback failures suspend writes. `blockCloudSave` records
`__lastCloudSaveBlock` and does not itself force Recovery Mode. CAS and definite
permission/preflight failures return ordinary failed results before adoption.
The full source search used `RecoveryMode|__recoveryInspectMode\s*=\s*true|__autosaveDisabled\s*=\s*true|blockCloudSave\(` across `js/`.

`__lastIndeterminateSave`, `__globalIdentityVerificationPending`,
`__lastImportVerificationError` and `__lastInventoryIdentityRepairError` prevent
clean authoritative adoption. `__globalIdentityIssues` / `__recoveryReason` hold
validation evidence. `__loadedCloudRevisionForSaveGuard`,
`__lastLoadedCloudState` and `lastAppliedCloudRevision` track adopted evidence;
`hasPendingLocalChanges` / `lastLocalMutationAt` protect live drafts. The normal
save queue serializes transactions; isolated coordinators additionally compare
captured actor/backend and exact local versions. No new retry or unlock is planned.

### Dashboard/Settings operation matrix

| Action/page | Handler; fields | Save path / intended delta | Records and relationships retained | Triggers / coverage / assessment |
|---|---|---|---|---|
| Settings task delete | deleteMaintenanceTaskMeta; tasksInterval/tasksAsReq, deletedItems | Existing isolated archive + CAS; one selected definition moves intact | Original ID, inventory FK, task parent/template, history, all V2 and purchase records | MDEL deletion/verification/browser tests; already fixed by #520 |
| Deleted History restore | maintenanceTaskDeletionApi.restore | Same coordinator, confirmation bound to exact archive | Original ID/payload; inventory and history unchanged; repeat projection resumes | MDEL restoration/browser tests; no new correction |
| Calendar Remove task | showTaskBubble; legacy family arrays + one Trash payload | Currently unawaited normal save; proposed exact selected archive | Must retain descendants and their original payloads, all history and FKs | Missing family archive/protected reduction, premature success; targeted new regression |
| Calendar one-time remove/cancel/completion/reversal/note/hours | appendV2OccurrenceEvent; maintenanceOccurrencesV2 | Append lifecycle event through runner + normal CAS save | Scheduled root, completion evidence, task/instance/root links | MCF tests; reproduce stale post-commit readback, correct adapter/revision checks |
| Calendar repeat removal/stop | appendV2RepeatEventByRoot, stopV2RepeatTracking | Legacy ordinary save; append event and/or stop instance | Existing events/root and cost snapshots must remain | MCF coverage partial; stop mutates instance before save; separate follow-up |
| Legacy single/future/all occurrence removal | removeCalendarTaskOccurrences / removeSingleOccurrenceAcrossTaskFamily | Local mutation then unawaited normal save | Cancellation must not erase completedDates/manual history/notes/hours | Source shows pruning and instance splice; safety guards can reject. Separate planner/coordinator work needed; do not grant broad deletion exemption |
| Legacy completion reversal / edits | unmarkCalendarTaskComplete, setFamilyOccurrenceNote/Hours | Ordinary save after local mutation | Preserve historical evidence and IDs | MCF/maintenance coverage partial; not made equivalent to cancellation |
| Dashboard widget hide/reorder/layout | persistDashboardLayout, setCloudLayout; dashboardLayout | Debounced normal save; only presentation metadata intended | All business collections, jobs, history and FKs unchanged | Layout regression needed; protected preflight remains active |
| Cutting-job Delete/retire | deleteCuttingJob; cuttingJobs/completedCuttingJobs/deletedItems | Confirmed scoped proof through normal CAS writer | Whole job/manual logs/chronology in typed archive | CJD/CJO tests; independent server-get adapter remains separate potential stale-read surface |
| Job history restore / Undo/Redo | restoreCuttingJobHistory, applyHistorySnapshot | Existing proof/guarded save | Original IDs and chronology; unrelated data guarded | CJD/CJO/history tests; no speculative changes |
| Inventory/material removal/undo | inventoryMaterialMutationApi | Isolated map write + independent full-state readback | All unrelated fields and retained sync evidence exact | inventory-material-persistence tests; no correction planned |
| Garnet/log deletion or correction | removeGarnetEntry; pump savePumpLogChange | Garnet local Trash + ordinary save; pump isolated exact mutation | Whole record/history and unrelated collections | Pump tests; calendar garnet immediate-success path remains follow-up |
| Clear all / permanent task archive removal | clearAllAppData / Trash guards | Existing destructive authorization; maintenance permanent removal disabled | Recovery evidence and protected archives | No new authorization or data cleanup in this work |

This matrix records inspected code paths, not an assertion that every flow was
reproduced or repaired. Production Firebase/deployment evidence is not yet read.

### Additional browser finding, before its correction

The first new Edge archive workflow failed before any write. Opening
`showTaskBubble` invoked `ensureTaskManualHistory(task)`, which added
`tasksInterval[0].manualHistory[0].estimatedDailyHours` to the live source. The
existing archive coordinator correctly rejected that unsaved baseline drift.
Its recovery gates stayed off; no archive committed. The display only needs
date membership, so the planned correction in the already scoped
`js/calendar.js:showTaskBubble` reads the existing history array directly.
History normalization remains available to intentional mutation handlers.
The popup also normalizes recurrence through `nextDue`/`getTaskRecurrence` and
notes through `getOccurrenceNoteForTask`; these display calls now receive an
isolated JSON view copy. Their action handlers retain the original definition.

The calendar runner captures its target once for baseline and verification.
The planned `core.js:performCloudSave` follow-through additionally passes that
same optional target into the existing guarded atomic writer and rejects a
changed target before preparing state. This prevents queue/actor/backend drift
from silently redirecting the scoped operation. Normal callers remain unchanged.

## Implemented changes and why they are safe

1. **Stale/unconfirmed listener evidence:** reject cache/pending snapshots before
   interpreting missing data; reject only positive safe-integer obsolete/equal
   revisions before identity validation. Negative, string and fractional revision
   values still reach integrity validation and suspend. Latest genuine missing
   documents and orphan references still suspend. No existing blocker is cleared.
2. **Calendar post-commit readback:** the one-time lifecycle runner now uses the
   existing read-only transaction helper on one captured backend/document/actor.
   Its optional captured target travels through `performCloudSave` to the shared
   atomic writer; stale targets reject before preparation and in its transaction.
   Verification requires advancing revision equal to the acknowledged loaded
   revision, existing business-state comparison, unchanged target and open gates.
   There is no fallback to document.get, cache or retry.
3. **Legacy definition removal:** Calendar Remove task calls the same exact
   single-definition archive API as Settings. Confirmation explicitly says that
   history, inventory, stored calendar entries and other definitions survive.
   Success waits for server verification and authoritative adoption. The old
   family-removal helpers are no longer called by this UI entry point. They are
   not granted a protected-data exemption.
4. **Popup mutation:** `showTaskBubble` reads manual history directly and passes
   an isolated view copy to legacy normalizing note/time/recurrence/due helpers.
   Original definitions remain available to intentional action handlers. No
   history/default/recurrence changes are written by opening the popup.

Only three application files changed. The existing MCF extraction harness gained
the new explicit target/read dependencies; assertions and rollback checks remain.
The new tests, baseline reproduction script, diagnostic and this report complete
the change. Global identity/archive rules, protected field registry, CAS writer,
Firestore rules, deployments and financial formulas are unchanged.

## Before/after evidence

| Reproduction stage | Main/before correction | Patched result |
|---|---|---|
| Listener validates obsolete invalid revision | Current clean session enters read-only recovery before comparing revision | Obsolete snapshot ignored; newer authoritative orphan still blocks |
| Cached or locally pending missing listener snapshot | Missing-state Recovery Mode before metadata check | No authoritative conclusion/adoption from cache or pending data |
| One-time cancellation after successful transaction, old v8 server-get view | Backend commit acknowledged, runner sees prior business state and suspends | Independent backend read matches intended event and acknowledged revision; success, reload and next save work |
| Main Calendar family removal with template + 10 dependent instances | Baseline script executes original handler: 11 local definitions removed, only one archived, immediate success toast, real protected preflight rejects, zero backend commits | One exact selected definition archived; all 10 descendants, original payloads and inventory links remain valid |
| Opening popup before archive | Actual Edge run observed `manualHistory[0].estimatedDailyHours` and then `recurrence.completionAnchorHours` drift; archive safely rejected before write | Complete live/loaded comparison remains exact; actual Remove task click succeeds |
| Same business data but stale/newer verification revision | Prior comparison excluded syncMeta | Reject as uncertain; retain evidence and prevent next write |
| Definite rejection, lost acknowledgement or failed independent read | Must not report success | Permission/CAS failures remain ordinary; uncertain outcomes suspend once without retry |

### Synthetic revision and conservation evidence

- Archive unit/integration uses the real `writeAuthoritativeStateSnapshot`, real
  protected registry/preflight, real atomic writer and real identity/adoption code.
  Each confirmed transfer has one write transaction, two read-only transactions,
  zero server-get reads; revision advances from fixture revision 7 and loaded/live
  state equals backend state. Every unrelated top-level field compares exactly.
- Rich MDEL regressions cover multiple completed dates, manual notes/configuration,
  same-day independent V2 cost roots, inventory/purchases and exact-ID restoration;
  valid archived references survive reload, malformed/ambiguous/orphan references
  continue to block. No-dependency/no-history variants are included.
- New calendar runner test observes three transaction reads (baseline, writer CAS,
  readback), zero document.get calls and one commit. Consecutive lifecycle changes
  advance revisions independently; existing scheduled/completed events are exact.
- Edge uses an actual completed one-time lifecycle, clicks Remove from calendar,
  observes one transaction set, advancing revision, preserved scheduled/completed
  history and all unrelated business fields, then actually reloads. Its deliberately
  stale server-get still exposes the prior revision while the operation succeeds.
- Dashboard layout test reorders one rectangle and removes that rectangle while
  retaining other layout entries. Both normal saves and actual reloads preserve
  business data. An early test that replaced the entire existing layout correctly
  hit protected reduction; the test was corrected to model the scoped action.
- Existing Restore browser suite uses two independent browser contexts sharing a
  synthetic localhost backend, plus cancellation and simulated logout/login. It
  verifies original identity/history and conflict handling without production data.

## Final commands and actual results

No package.json exists; no npm command was run. Commands below ran from this
branch's checkout. Final outputs are retained locally under `artifacts/rfs-01/`
(ignored, not part of the PR).

```powershell
node scripts/rfs01-main-baseline.cjs
# PASS: original-main false-success/protected-rejection reproduction, zero backend commits.

node --test --test-reporter=tap tests/rfs01-save-reliability.test.js tests/mdel01c-restoration.test.js tests/mdel01b-verification.test.js tests/mdel01-task-deletion.test.js tests/atomic-persistence.test.js tests/inventory-material-persistence.test.js tests/inventory-identity.test.js tests/inventory-identity-repair.test.js tests/global-identity-repair.test.js tests/production-hardening.test.js tests/maintenance-task-setup.test.js tests/maintenance-history-import.test.js tests/maintenance-new-one-time.test.js tests/mcf-01-maintenance-calendar.test.js tests/recovery-import.test.js tests/cjo06-archived-identity.test.js tests/purchase-orders.test.js tests/purchase-financials.test.js tests/purchase-history-navigation.test.js tests/cjd01-job-deletion.test.js > artifacts/rfs-01/targeted-final.tap
# PASS: 674/674, zero failures/skips.

$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node --test --test-reporter=tap tests/rfs01-save-reliability.browser.cjs tests/mdel01-task-deletion.browser.cjs tests/mdel01c-restoration.browser.cjs > artifacts/rfs-01/browser-final.tap
# PASS: 5/5 in headless Edge, zero failures/skips, all external requests blocked.

$files=@('js/core.js','js/calendar.js','js/maintenanceCalendarIntegrity.js','tests/mcf-01-maintenance-calendar.test.js','tests/rfs01-save-reliability.test.js','tests/rfs01-save-reliability.browser.cjs','scripts/rfs01-main-baseline.cjs','docs/RFS-01-read-only-diagnostic.js')
foreach($file in $files){node --check $file;if($LASTEXITCODE){throw $file}}
git diff --check
& 'C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/check_binaries.py
```

Initial sandboxed Edge launch failed to create its temporary profile. The same
localhost-only tests ran successfully outside the sandbox. Intermediate failures
included test selectors/root selection and a test sentinel mismatch, corrected
without relaxing application checks; the popup baseline failures discovered real
application mutations and led to the explicit view-copy correction. The final
suite is the result claimed above. The entire repository suite was not run.

## Production diagnostic and remaining work

Paste the entire [read-only F12 diagnostic](RFS-01-read-only-diagnostic.js) into
the deployed signed-in page. It independently reads the current Firestore
document with a transaction containing only get, binds the observed backend and
actor, and prints loaded/authoritative revisions, URL/build feature evidence,
recovery gates, identity paths, archive/inventory resolutions, protected-state
comparison and retained uncertain-save evidence. Feature evidence does not prove
the exact deployed Git SHA. Its synthetic regression asserts zero writes and no
change to application/storage evidence.

Browser inventory exposed no connected deployed/authenticated session. Therefore
the diagnostic was validated on synthetic data only, and **no authoritative live
revision or deployed production repair is claimed**. No production records were
read or modified, and no deployment was performed. Operator diagnostic output
and authenticated Firestore transport/rules behavior remain to be verified.

Separate RFS-02 follow-ups: legacy single/future/all removal still prunes history
and can splice instances; repeat-stop mutates its instance and has an independent
ordinary-save flow; garnet removal and legacy completion/note edits acknowledge
early; cutting-job server-get verification is another potential stale-view
surface. These have differing semantics and require separate synthetic
reproductions and scoped mutation plans. No speculative fix or exemption is
included. Calendar task-family deletion is intentionally replaced with a
confirmed single-definition archive; it does not mass-delete stored events.
Dashboard wholesale layout reset, real offline/pending-write transport, browser
engines other than Edge, multiple physical authenticated devices, production
Vercel versus GitHub Pages caching and combined #519/#521 integration are not
certified by these tests.

Recommendation: review and merge this bounded reliability patch after normal CI
and preview verification; do not represent it as closure of every audited path.
Do not merge automatically. Stop after PR creation as requested.
