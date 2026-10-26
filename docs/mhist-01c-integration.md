# MHIST-01C integration audit and plan

Recorded before conflict resolution/read-model edits, 2026-10-26.
Existing PR #521 / branch maintenance-history-reconciliation at b145455.
Fetched origin/main: 039688f62935f3abdf2f47601f3259f1193716f0.
Confirmed merged ancestors: #520 (7285ac1), #522 (0c11b0f), #523 (039688f).
No package.json or repository AGENTS.md exists. No production state is accessed.

## Merge findings and plan

The requested non-rebased merge has three conflicts, all in calendar.js:
interval source arrays, as-required source arrays, and repeat projection
deduplication versus cancellation filtering. Retain archive-aware historicalTasks
and defensive copies in both legacy arrays. Retain RFS-02B cancellation filtering
and MHIST canonical instance/root deduplication together for repeat projection.
Keep the automatically merged core/save/identity/cancellation architecture intact.

The previous History adapter starts from active Calendar projection and omits
archived identities, removed/skipped V2 roots and cancellation-hidden completions.
Its legacy fallback can show cancelled schedules as if active, suppress removed
evidence and collapse separate manual occurrences on a shared date. Adapt only
read models: shared Calendar builder will retain separately labeled hidden
evidence while leaving active dueMap filtering intact. History will join active
and archived legacy owners by exact ID, retain supported lifecycle/source
evidence and independent occurrence IDs, and label hidden/history-only rows.
Next scheduled and navigation will use active exact event chips only. Existing
projection bounds, recurrence calculations, saved dates and lifecycle semantics
remain unchanged. Provide a read-only History action for archived task payloads
in Deleted History so preserved evidence is accessible before restoration.

Add focused synthetic cancellation/archive/moved/repeat/identity tests and actual
browser History/navigation/reload checks. Compare all protected arrays, loaded
revision, save evidence, backup/storage and disposable backend before/after.
Run MHIST, archive/restore, RFS-01/RFS-02B and related regressions; never weaken
validators or add mutations for display.

Supply a docs F12 IIFE using one independent read-only backend transaction and
pure validation/projection only. Capture backend/actor and browser evidence;
compare key-order-independent protected maintenance state; report missing checks
as WARNING, integrity/state mismatches as FAIL, and disclose local backend
limitations. Do not invoke save/adopt/repair/snapshot or change any runtime gate.

Finally review diff against fetched main, commit the integration and push the
existing branch, update PR #521, and leave it unmerged for independent preview
F12 verification. No other PR will be created or merged into main.

## Exact conflict resolutions

`git merge --no-commit --no-ff origin/main` reported one conflicted file and three
individual conflict blocks in js/calendar.js. No file was replaced by ours/theirs:

1. **Interval arrays:** retained main's archive-aware historicalTasks and
   archivedDefinition inclusion, combined with MHIST defensive structuredClone
   copies before legacy normalization. Archived templates retain their actual
   source identity and cannot trigger new legacy projections.
2. **As-required arrays:** retained the same archive-aware source with defensive
   copies. Legacy history and main's recurrence suppression remain present.
3. **Repeat projection:** retained RFS-02B hidden/cancellation semantics together
   with MHIST canonical instance/root keys and slot/date compatibility. Name/date/
   cadence equivalence was not restored as an identity rule. Cancelled rows go
   only to hidden evidence; no cancelled chip is inserted into active dueMap.

renderers.js and the MCF extraction test auto-merged; they were inspected and
adapted where the shared builder's new boundary affects test extraction.

## Read-only behavior added since MHIST-01B

- `buildMaintenanceCalendarEvents` still supplies active dueMap/oneTimeLookup,
  and now supplies hiddenEvents separately for authorized cancellation and
  removed/skipped lifecycle evidence. Main's cancellation predicate and Stop
  handling remain intact. History reads never publish interaction caches.
- `buildMaintenanceTaskHistory` joins active and typed archived payloads by exact
  task/template/instance/root IDs. It labels activeCalendar, reason, archive and
  stopped-tracking state; retains original completion/lifecycle snapshots;
  preserves manual IDs/import IDs and anonymous source indexes for independent
  same-day records. completedDates/manual mirrors of one represented occurrence
  still collapse. Removed source evidence is retained instead of erased from the
  popup. Older repeat completion notes/hours are read from retained snapshots
  when no later explicit note_set/hours_set exists; empty/null overrides survive.
- The rich archive fixture exposed main's template/date display dedup overwriting
  a child's 0.5h with its archived parent's 0.1h. Dedup now also requires the same
  original task ID; separate parent/child source identities remain separate.
  This is a read-model correction, with no stored task/event change.
- The popup distinguishes Active Calendar from source-only history, explains
  cancellations/removal/archival, and keeps hidden/unreachable rows open with
  feedback. Its next scheduled summary uses only actual active scheduled rows.
  Exact root navigation and the existing -12/+23 reachable-month boundaries
  remain covered. Repeat panel navigation receives the resolved status/notes/hours
  rather than presenting a completion as Scheduled.
- Deleted History has a read-only View history action for archived tasks. Restore
  and Delete forever availability/handlers remain main's verified implementation.
  Opening History is possible without restoring the task or creating any record.

Calendar/History agreement compares exact active identities (legacy duration
segments collapse to their source start). Hidden lifecycle/ledger evidence,
explicit legacy records outside the active projection and dates outside the
rendered viewport are intentionally separate. Archived/stopped virtual repeats
are not reconstructed as historical events; only stored evidence survives.
Restoration resumes only projections permitted by main's existing rules, and
does not undo a cancellation ledger or restart a stopped instance.

## Firebase and data-safety boundary

The following production files are byte-for-byte identical to fetched main:
js/core.js, js/maintenanceCalendarCancellation.js, js/globalIdentityRepair.js,
js/maintenanceTaskArchive.js, js/atomicPersistence.js and
js/maintenanceCalendarIntegrity.js. No CAS, prepared-state proof, independent
readback, verified adopter, backup/coverage/conservation check, identity/ledger
validator or Recovery Mode trigger is loosened. No mutation coordinator or
schema is added for History.

Frozen-input tests and the disposable browser compare entire maintenance arrays,
inventory/archive references, loaded document/revision, save/recovery evidence,
localStorage and independent backend state before/after projection, popup,
close/search, navigation and F12. Save/mutation/backup entry points throw if called
by History in the new browser test; call count remains zero. The existing RFS
fault tests still reject unexpected historical deletion and uncertain writes.

## Executed tests and exact commands

Run in the MHIST worktree. No package.json exists; no npm commands were run.

```powershell
git show origin/main:js/calendar.js | Set-Content artifacts/mhist-01c-main-calendar.js -Encoding utf8NoBOM
$env:OMAX_MHIST_MAIN_CALENDAR=(Join-Path (Get-Location) 'artifacts/mhist-01c-main-calendar.js')

node --test --test-concurrency=4 --test-reporter=tap tests/mhist01c-integration.test.js tests/mhist01c-diagnostic.test.js tests/maintenance-history-reconciliation.test.js tests/mcf-01-maintenance-calendar.test.js tests/maintenance-new-one-time.test.js tests/maintenance-task-setup.test.js tests/maintenance-history-import.test.js tests/rfs01-save-reliability.test.js tests/rfs02-save-audit.test.js tests/rfs02b-cancellation.test.js tests/mdel01-task-deletion.test.js tests/mdel01b-verification.test.js tests/mdel01c-restoration.test.js tests/atomic-persistence.test.js tests/production-hardening.test.js tests/recovery-import.test.js tests/global-identity-repair.test.js tests/inventory-identity.test.js tests/inventory-identity-repair.test.js tests/inventory-material-persistence.test.js tests/purchase-orders.test.js tests/purchase-history-navigation.test.js tests/import-selective-rollback.test.js tests/historical-import-staging.test.js
# PASS: final 774/774, zero failures.

$mhistAllTests=rg --files tests -g '*.test.js'
node --test --test-concurrency=4 --test-reporter=tap $mhistAllTests
# 1,894 PASS / 10 FAIL / 1,904 total; same ten failures on fresh main below.

$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node --test --test-concurrency=1 --test-reporter=tap tests/mhist01c-integration.browser.cjs tests/maintenance-history-reconciliation.browser.cjs tests/rfs02b-cancellation.browser.cjs tests/rfs02-save-audit.browser.cjs tests/rfs01-save-reliability.browser.cjs tests/mdel01-task-deletion.browser.cjs tests/mdel01c-restoration.browser.cjs tests/maintenance-new-one-time.browser.cjs
# PASS: 12/12 workflows, serial localhost-only Edge matrix.

git archive --format=zip -o artifacts/mhist-01c-main-baseline.zip origin/main
Expand-Archive -LiteralPath artifacts/mhist-01c-main-baseline.zip -DestinationPath artifacts/mhist-01c-main-baseline
Push-Location artifacts/mhist-01c-main-baseline
node --test --test-reporter=tap tests/cjo02b-safety.test.js tests/cjpc01-manual-paths.test.js tests/projects-accuracy.test.js
# 67 PASS / 10 FAIL / 77 total on unmodified 039688f; identical failing names.
Pop-Location

$files=@('js/calendar.js','js/renderers.js','docs/mhist-01c-read-only-diagnostic.js','tests/mhist-harness.cjs','tests/mhist01c-integration.test.js','tests/mhist01c-diagnostic.test.js','tests/mhist01c-integration.browser.cjs','tests/maintenance-history-reconciliation.test.js','tests/maintenance-history-reconciliation.browser.cjs','tests/mcf-01-maintenance-calendar.test.js','tests/mdel01-task-deletion.test.js')
foreach($file in $files){node --check $file;if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}}
git diff --check
git diff --cached --check
& 'C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/check_binaries.py
# PASS syntax, whitespace and binary-policy checks.
```

The baseline directory must be new; do not overwrite another extraction. Local
TAP logs, baseline export/extraction and browser logs are untracked artifacts.
The full-suite and browser matrix preceded the final explicit-empty legacy-note
refinement; the final 774-check run includes it. No source/write logic changed.

Existing failures reproduced independently on latest main:

- CJO-02B: canonical and mixed actual Jobs-add handlers; late repair blocker UI.
- CJPC: active/history unrelated edits, category edits, live-job ownership,
  verification-open behavior, signed-cost/fractional-time save, and CJADD draft
  minute capture (six extraction/harness failures).
- Projects: ACC02 recorded-duration expectation.

No unrelated job/financial behavior or test assertion was changed to hide these.
Initial integration failures consisted of expected old “removed rows absent”
expectations, two extraction seams after moving the shared builder, one new
harness parenthesis typo and the new browser's incorrect separate-repeat-panel
selector. Those were corrected with assertions for retained hidden evidence and
the existing shared panel. No RFS safety assertion was removed or softened.
The archive fixture also initially compared virtual projections while archived;
it now checks stored history while archived and complete projection equality
again after restoration, matching main's explicit archive semantics.

## Independent preview F12 verification

Copy the entire IIFE from
[`mhist-01c-read-only-diagnostic.js`](mhist-01c-read-only-diagnostic.js) into F12
after the new MHIST preview has loaded and the user is signed in. It prints a
PASS/WARNING/FAIL table and returns an overall assessment plus exact discrepancies.

It checks feature presence, Recovery Mode, independent backend/loaded/guard
revision equality, protected maintenance/inventory/archive arrays ignoring object
property order, full identity references, cancellation ledger integrity,
per-task History key uniqueness, active/hidden reconciliation, synchronous
projection purity, asynchronous evidence stability and storage preservation.
Unavailable reads/features never receive a false PASS. A local disposable backend
explicitly produces WARNING rather than a live-Firebase certification. Seven
diagnostic tests include unavailable backend, revision/array drift, real Recovery
Mode, invalid ledger and duplicate History identity. The actual browser executes
the script and confirms zero writes and unchanged storage/state.

The script calls only an independent transaction.get and pure validators/read
builders. It never calls save, snapshot/adopt, cancellation/restore, repair,
retry/unblock or a localStorage setter. It does not modify revision or recovery
flags. Source-only rows are not reconciliation errors merely for lacking a chip.

## Review status and remaining limits

The three conflicts are resolved and all original MHIST behavior remains covered.
Reconciliation passes under the documented source/cancellation/viewport rules.
Review diff against 039688f contains only MHIST read models/UI, tests, fixtures
and documentation; main's persistence/validator implementations are intact.

**Ready for final independent preview F12 verification, not automatic merge.**
Production Firebase, authenticated preview deployment, Firestore v8 transport,
other engines/devices and a complete device matrix were not exercised. No live
records were read, created, cancelled, deleted or restored. Disposable tests do
not certify the production deployment or resolve the ten unrelated baseline
failures. Legacy data without stable occurrence IDs is labeled by its retained
source path/index; no production identity is generated or repaired. No earlier
records erased before these changes can be reconstructed by this display fix.
