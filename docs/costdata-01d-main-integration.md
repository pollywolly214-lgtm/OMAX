# COSTDATA-01D: main integration and archived maintenance references

## Integration and decision

Integrated `origin/main` at **7285ac1e78d8387bb6beed3a64c1b843da8107db**
(MDEL #520) into existing PR #519, branch `codex/costdata-01a`.
The starting COSTDATA HEAD was **549dade387b506d59148e2daacc9c221fba307da**.
Both remote refs were fetched again after testing and remained at these SHAs.
The merge and all tests ran in `.worktrees/costdata-01a`; the unrelated primary
checkout and its local changes were not altered. No `package.json` exists in
this checkout, so no npm commands were selected.

**FIX REQUIRED: integrating main supplies the existing archive-aware identity
correction.** No additional application-code correction was necessary beyond
the merge. PR #519 remains draft and unmerged pending live preview verification.
No production Firebase reads or writes were performed by this investigation.

The user supplied authoritative revision `1792676332802` and the finding that
inventory slot 38 references zero active tasks and exactly one matching archived
interval task. We did not independently retrieve that revision. The older
validator's inability to resolve an archived maintenance target explains the
reported Recovery Mode; it does not independently establish every previously
reported chart cutoff. No missing record ID is required for this investigation.

## Merge review and conflicts

Before merging, reviewed main's global identity validator, maintenance archive
module, independent-read/CAS coordinator, exact-ID restoration, protected-state
checks and historical task projections against COSTDATA's collector and financial
normalizer. A read-only three-tree preview showed no conflict markers. Ran:

```powershell
git fetch origin main codex/costdata-01a
$costdataBase = git merge-base HEAD origin/main
git merge-tree $costdataBase HEAD origin/main > artifacts/costdata-01d-merge-preview.txt
git merge --no-ff --no-commit origin/main
```

There were **zero textual conflicts**. `core.js` and `renderers.js` auto-merged.
The resulting behavior was checked rather than choosing either file wholesale:

- `js/globalIdentityRepair.js` and `js/maintenanceTaskArchive.js` match integrated
  main exactly. Typed, dated archived task identities are accepted only when
  their IDs, ownership metadata and references pass validation. Invalid or
  ambiguous references continue to block adoption and writes.
- Relative to main, `js/core.js` retains only COSTDATA's canonical date-only
  handling and exemption of the view-only financial-period selector from render
  deferral. Main's deletion/restoration, Recovery Mode, protected-state and
  CAS/revision checks are retained.
- Main's `historicalTasks` projection and COSTDATA's archived payload collection
  both remain. Stable source event identity prevents the same archived history
  from becoming two expenses. The integrated browser tests assert two archived
  expenses, not four, with the original occurrence snapshots.
- `js/cutCostFeedback.js` is unchanged from the starting COSTDATA HEAD. The
  01A/01B/01C collection, per-event provenance, deduplication, shared financial
  windows, delayed-snapshot refresh and incomplete-cost handling remain covered.
- Restoration uses the MDEL exact-ID transaction and post-write verification.
  Generic restoration cannot replace it or generate a new task ID. The archive,
  inventory link, retained history and unrelated data are compared exactly.

Maintenance events and purchases contribute to daily aggregates; the graph is
not one point per source record. Incomplete costs remain excluded from chart
amounts with an explanation in the historical table. Cutting Job values still
come from actual completed jobs. No business formulas or chart meaning changed.

## New synthetic regressions

Added `tests/fixtures/costdata-01d.cjs`, `tests/costdata-01d.test.js` and
`tests/costdata-01d.browser.cjs`. The fixture represents the reported relationship
using synthetic IDs: inventory slot 38, zero active matches, one archived
interval task, matching original ID and payload ID, and an October 22 archive
date. It combines MDEL's protected-state fixture with COSTDATA-01C's history.

**12/12 new unit/integration tests and 4/4 new browser tests pass.** They verify:

- The actual integrated validator resolves `$.inventory[38].linkedTaskId` to
  `$.deletedItems[0].payload`, reports `archived_task`, proposes no repairs,
  adopts without Recovery Mode and performs no writes.
- Missing targets, wrong archive type, absent payload ID, mismatched original
  ID, wrong list, invalid archive date, duplicate archives, an active/archive
  collision and a broken archived inventory FK all fail actual adoption.
  Recovery Mode and disabled autosave remain in force; evidence is not rewritten.
- Archived January 5 and February 5 expenses retain their recorded parts/hours
  snapshots: $57 and $73, despite different current configured defaults. The
  `completedDates`/manual-history mirrors and duplicate collection paths count
  once. The combined maintenance total is $398; the earliest blue point is
  January 5, 2026. The underlying 01C fixture's $268 remains intact.
- All-Time, YTD, 365-, 182-, 90- and 30-day windows have the expected per-date
  maintenance series, selected financial totals and actual canvas plot targets.
  Purchase spending retains $136 All-Time and December 15, 2025 as its earliest
  fixture date. Cutting Job dates remain July 15 and October 15, 2026.
- Full reload retains the archived relationship without a silent source rewrite.
  Display operations make zero save/mutation/backup calls. Actual Deleted
  History UI cancellation changes nothing; confirmed restoration preserves the
  original task payload, ID, inventory reference, history and $398 total after
  another reload. The unit integration also exercises stale-listener handling,
  independent reads, one CAS transaction and verified adoption without new IDs.
- Actual browser loading of ambiguous/mismatched archives enters Recovery Mode,
  rejects saving and leaves the disposable backend unchanged.

Browser tests use headless Edge and disposable localhost devsafe backends only.
All non-local requests are blocked. These tests use the merged application's
actual scripts, renderer, DOM, chart and persistence safeguards; they do not test
separate standalone MDEL/COSTDATA trees. Timezones are America/Chicago and
Pacific/Kiritimati (UTC+14).

## Exact final test commands and results

Commands ran from the integrated COSTDATA checkout, after the merge and after
the new regression files were finalized. Logs are untracked local artifacts.

```powershell
node --test --test-reporter=tap tests/costdata-01a.test.js tests/costdata-01c.test.js tests/costdata-01d.test.js tests/financial-reconciliation.test.js tests/purchase-financials.test.js tests/purchase-orders.test.js tests/cut-cost-feedback.test.js tests/cut-cost-cumulative-hours.test.js tests/ach-average-cut-hours.test.js tests/maintenance-history-import.test.js tests/recovery-import.test.js tests/cjo04-review.test.js tests/firebase-two-computer-baseline.test.js tests/inventory-material-persistence.test.js tests/mdel01-task-deletion.test.js tests/mdel01b-verification.test.js tests/mdel01c-restoration.test.js > artifacts/costdata-01d-combined-targeted.tap
```

**497 passed, zero failed/skipped.** Includes financial history, exact-ID
restoration, deletion protections, protected-state persistence, recovery/import
and two-computer Firebase/CAS simulations.

```powershell
$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node --test --test-concurrency=2 --test-reporter=tap tests/costdata-01a.browser.cjs tests/costdata-01b.browser.cjs tests/costdata-01c.browser.cjs tests/costdata-01d.browser.cjs tests/mdel01-task-deletion.browser.cjs tests/mdel01c-restoration.browser.cjs tests/financial-reconciliation.browser.cjs tests/cut-cost-feedback.browser.cjs > artifacts/costdata-01d-combined-browser.tap
```

**40 passed, zero failed/skipped** (24 top-level tests, including nested cases).
Also covers initial and delayed reads, successive higher-revision snapshots,
failed-read Recovery Mode, focused-selector refresh, preserved business drafts,
rapid period changes, navigation, actual document reload, year boundaries and
CCR configuration. Browser execution required approval outside the sandbox.

```powershell
node --test --test-reporter=tap tests/atomic-persistence.test.js tests/cjo06-archived-identity.test.js tests/cjo02b-safety.test.js tests/firebase-storage-bucket-config.test.js tests/inventory-identity.test.js tests/inventory-identity-repair.test.js tests/global-identity-repair.test.js > artifacts/costdata-01d-additional-safety.tap
```

**164 passed, three failed** in the existing `cjo02b-safety.test.js` extraction
harness. The failures were independently reproduced on untouched latest main:

```powershell
git archive --format=zip --output=artifacts/costdata-01d-main-baseline.zip 7285ac1e78d8387bb6beed3a64c1b843da8107db
Expand-Archive -LiteralPath artifacts/costdata-01d-main-baseline.zip -DestinationPath artifacts/costdata-01d-main-baseline
node --test --test-reporter=tap artifacts/costdata-01d-main-baseline/tests/cjo02b-safety.test.js > artifacts/costdata-01d-main-baseline-cjo02b.tap
```

Untouched main: **23 passed, the same three failed**. Automated comparison of
the failing names confirmed equality:

- `canonical actual Jobs add handler stops before dependent mutation`
- `mixed actual Jobs add handler stops before dependent mutation`
- `actual repair UI disables a blocked audit and reports a late blocker without success`

The first two lack `syncNewCuttingJobSaveControls` in the extracted context;
the third fails its expected disabled-state assertion and produces asynchronous
`document is not defined` activity on both trees. They were not changed or
reported as passes. The complete repository suite was not rerun for 01D; no
claim of universal verification is made.

```powershell
node scripts/mdel01c-archived-fk-baseline.cjs
$costdataFiles=@('js/calendar.js','js/core.js','js/globalIdentityRepair.js','js/maintenanceTaskArchive.js','js/opportunity.js','js/renderers.js','scripts/mdel01c-archived-fk-baseline.cjs','tests/costdata-01d.test.js','tests/costdata-01d.browser.cjs','tests/fixtures/costdata-01d.cjs')
foreach ($costdataFile in $costdataFiles) { node --check $costdataFile }
git diff --check
git diff --cached --check
& 'C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/check_binaries.py
```

The baseline experiment passes: the old main-base validator rejects the valid
synthetic archived FK and the actual integrated validator accepts it without
mutating source data. Syntax, whitespace and tracked-file binary-policy checks
pass. No recovery bypass, new persistence system or production-data migration was
introduced. Only main integration, synthetic regressions and this report were
added for 01D; the earlier report gains a link to this integration evidence.

## Remaining live verification

- Open the deployed preview for the updated PR HEAD against its intended
  authenticated workspace. Confirm the reported archived reference loads
  normally with the archive-aware validator and no unexpected Recovery Mode.
- Read the already-loaded All-Time source/table/chart evidence to confirm the
  actual earliest qualifying blue records and the actual purchase/cutting-job
  coverage. Synthetic January coverage cannot prove production completeness.
  The 01C read-only diagnostic remains available; no missing-ID prerequisite is
  imposed.
- Real Firebase rules, network interruptions, multiple authenticated devices,
  deployed caching/service-worker behavior and production deletion/restoration
  were not exercised. Local browser and transaction simulations cover the
  relevant safeguards but do not replace those live workflows. Do not modify
  production records merely to perform verification.

No task IDs, inventory links, `deletedItems`, maintenance histories or other
production records were edited, repaired, backfilled or migrated. The new tests
intentionally restore only synthetic tasks in disposable backends. PR #519 is
updated on its existing branch and must not be merged automatically.
