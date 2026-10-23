# COSTDATA-01B: intermittent historical display investigation

## Decision: FIX REQUIRED — narrow correction implemented

A real render synchronization defect reproduces without any missing source record. An accepted realtime snapshot can update the application state while the historical table and chart remain stale indefinitely because the financial-period dropdown retains keyboard focus. The correction allows that view-only selector to stop blocking the existing render refresh. No missing purchase/event ID is required to investigate, review, or test this issue.

Investigation baseline: current `origin/main` is `633e144c76c564e88419e4c0f3b1efe8027b132d`; COSTDATA-01A PR #519 starts at `ab8511ee1154a26b062b61eb80941adc2e57078b` and is not merged into main. The defect reproduces on both. Existing changes and artifacts in the primary checkout were preserved; the existing isolated `codex/costdata-01a` worktree/PR was reused.

## Findings before editing

- `computeCostModel()` reads the adopted application collections. Maintenance uses legacy task completion/manual history and the resolved V2 compatibility stream, then the shared cost-feedback normalizer. Purchases use receipt-week rows with allocated shipping/tax. COSTDATA-01A centralizes receipt projection and historical financial boundaries.
- Maintenance and purchase history are **not intended to appear as one chart point per record**. Complete qualifying event/purchase amounts are grouped by business date; multiple rows on one date produce one daily expense point. Maintenance costs use the existing modeled labor/default/snapshot rules. Incomplete costs remain visible in tables but cannot provide complete graph amounts. Cutting Job net profit is a separate series. This graph meaning and the cost formulas are unchanged.
- `renderCosts()` captures a model and its chart arrays for that rendered view. Chart resize redraws use that captured model. Fresh source adoption must reach `route()` / `renderCosts()` to rebuild both table and chart; a resize alone does not recalculate source collections.
- `startWorkspaceStateListener()` in `js/core.js` validates and adopts incoming state, then calls `refreshRouteSafely()`. Its `hasActiveBlockingOverlay()` treated every focused INPUT/TEXTAREA/SELECT as a business edit. This included `[data-financial-period]`, whose sole purpose is to set a transient view preference. Its 1.2-second retry timer kept deferring as long as that SELECT stayed focused.
- Initial loading awaits `loadFromCloud()` and then routes again. Navigation tears down chart resize observers and rebuilds the destination view. No persistent dataset cache defect was reproduced in these paths.

## Reproduced failure

1. Load synthetic January–October history and select the past-12-month financial period.
2. Leave the period SELECT focused, as naturally happens after changing it.
3. Deliver a valid higher-revision snapshot from another synthetic client, adding a January purchase and a January maintenance completion.
4. The current application model accepts the update: purchase total changes from **$131 to $148**. With COSTDATA-01A, maintenance changes from **$230 to $270**.
5. Before the correction, the new purchase is absent from the DOM and January 16 is absent from the rendered chart targets after 3.5 seconds, although the source model is current. On untouched main the diagnostic records `modelTotal:148`, `visibleDelayedRows:0`, `active:"costFinancialPeriod"`.
6. Blurring the selector releases the existing deferred refresh. The records appear without fetching them again or rewriting them. This reproduces an intermittent appearance/recovery mechanism.

The same failure was observed on the original COSTDATA-01A code. It does not establish that this exact focus/snapshot sequence occurred in the user's earlier live session. No live session trace was supplied or inspected. The prior chart-window/default/cap issues in COSTDATA-01A are separate deterministic findings, not proof of the live incident's cause.

## Correction

In `startWorkspaceStateListener()` -> `hasActiveBlockingOverlay()`, a focused `[data-financial-period]` no longer triggers the generic editable-target deferral. This changes one predicate plus its explanation.

Real business inputs still defer rendering, as do all existing blocking-overlay checks. Their drafts survive the later refresh. Snapshot identity validation, Recovery Mode, pending-write filters, pending-local-change guards, mutation/coordinator guards, revision ordering, recent-edit protections, CAS, protected fields and the authoritative adoption path were not modified. The correction does not fetch, save, invent, migrate or backfill history.

The current view preference remains transient: ordinary navigation preserves it in memory, and a full page reload uses the existing all-time default consistently. No new preference persistence was added.

## Testing and results

No package.json exists; no npm commands were used. Browser tests use headless Edge, the repository's disposable localhost backend, and blocked external requests. `tests/costdata-01b.browser.cjs` adds nine scenarios:

| Scenario | Result |
| --- | --- |
| Initial load; 30/90/182/365-day and YTD periods; rapid changes; navigate away/back; genuine document reload | Pass in America/Chicago and Pacific/Kiritimati |
| Delayed initial authoritative read, with fixture history already stored before reload | Pass: initial adoption remains incomplete while held; release produces populated table/chart |
| Delayed historical snapshot while period selector remains focused | Pass after correction: both purchase and maintenance model/table/chart update |
| Real business-input draft during snapshot adoption | Pass: render remains deferred, draft value survives blur/refresh, saved configuration is unchanged |
| Successive higher-revision snapshots | Pass: latest totals render without navigation; same-day receipts become one daily graph point |
| Authoritative read failure | Pass: failed result and Recovery Mode, writes blocked, backend unchanged |
| December/January boundary and future receipts | Pass in both timezones: YTD includes January 1 and excludes December 31/January 2 when local analysis date is January 1 |

Assertions compare adopted model expenses, table row counts, computed graph series and the amounts/dates in the **rendered canvas hit targets**. January/April/July/October fixtures are reused from COSTDATA-01A; its dense 294-day YTD coverage is also rerun. Navigation/reload checks compare exact disposable backend state to detect unintended writes.

Commands (from the repair worktree):

```powershell
$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'

# Expected failure on an untouched archive of origin/main; no source edits.
$env:OMAX_COSTDATA_ROOT=(Resolve-Path artifacts/origin-main-baseline).Path
node --test --test-name-pattern='delayed historical snapshot' --test-reporter=tap tests/costdata-01b.browser.cjs > artifacts/costdata-01b-main-before.tap
# The repair commands below ran in fresh PowerShell processes without that override.

node --test --test-reporter=tap tests/costdata-01b.browser.cjs tests/costdata-01a.browser.cjs tests/financial-reconciliation.browser.cjs tests/cut-cost-feedback.browser.cjs > artifacts/costdata-01b-browser-regression.tap

node --test --test-reporter=tap tests/costdata-01b.browser.cjs > artifacts/costdata-01b-final.tap

node --test --test-reporter=tap tests/costdata-01a.test.js tests/financial-reconciliation.test.js tests/purchase-financials.test.js tests/purchase-orders.test.js tests/cut-cost-feedback.test.js tests/cut-cost-cumulative-hours.test.js tests/ach-average-cut-hours.test.js tests/maintenance-history-import.test.js tests/recovery-import.test.js tests/cjo04-review.test.js tests/firebase-two-computer-baseline.test.js tests/inventory-material-persistence.test.js > artifacts/costdata-01b-targeted.tap

node --check js/core.js
node --check tests/costdata-01b.browser.cjs
git diff --check
```

Results: the main reproduction fails as expected, and recovers after blur. The combined browser regression run passes **30/30**, including the existing financial/CCR checks. The final investigation-only rerun passes **9/9**, including the additional explicit delayed-maintenance amount assertion. Targeted unit/integration/safety checks pass **378/378**. Syntax and whitespace checks pass. Early test attempts had fixture-bootstrap, same-document navigation and clock setup errors; those test harness errors were corrected, without further application changes. The final harness uses a changing URL query for true document reloads and timezone-specific instants for January 1.

The full repository unit suite was not rerun for this follow-up. COSTDATA-01A separately documented ten pre-existing broad-suite failures, reproduced on untouched main; this report does not claim they passed or were fixed.

## Scope and limits

Follow-up files: `js/core.js`, new `tests/costdata-01b.browser.cjs`, this report, and a status update in the earlier report. PR #519 is updated instead of creating a competing historical repair.

No production Firebase data, live browser session, real network latency/disconnection, or production permission failure was tested. Initial failed reads were tested synthetically; the realtime listener's error callback was inspected and currently logs a warning. Existing guards can deliberately suppress/defer adoption during writes or recent edits; those policies were retained, not generalized into a new retry system. No claim is made that every possible offline/concurrent-write timing is verified.

No production records or Firebase/security/storage rules were changed. No cost formula, historical eligibility/allocation rule, source classification, recovery/CAS protection, or persistence system was changed by COSTDATA-01B. The evidence supports this specific display correction and the tested scenarios; it does not fully verify the live website or identify the exact cause of the prior observation.
