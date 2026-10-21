# COSTDATA-01A: historical Cost Analysis reconciliation

## Status and baseline

**Status superseded by COSTDATA-01B.** A confirmed missing purchase/event ID is not required. The follow-up reproduced a focused-period-selector/realtime-render defect on main and this branch, implemented a narrow correction, and added loading/window/navigation/reload regressions. See [the COSTDATA-01B investigation](costdata-01b-intermittent-display.md). The historical source mappings and COSTDATA-01A test record below remain applicable; the previous missing-ID merge gate is withdrawn.

Fetched baseline: `origin/main` / initial repair HEAD `633e144c76c564e88419e4c0f3b1efe8027b132d`. Repair branch: `codex/costdata-01a`; clean initial worktree at `C:/CodexProjects/OMAX/.worktrees/costdata-01a`.

The original checkout was `codex/phv2-02a-purchase-orders` at `b2e7fb8f11855c2ee895044e74c1b9a32e8a6e5b`, with modified `style.css` and untracked `.worktrees/` and `artifacts/`. It was not reset, switched, stashed or overwritten. A temporary clean app-managed worktree was archived; implementation uses the separate checkout inside the authorized workspace.

## Reproduced causes

1. **Maintenance omissions:** `computeCostModel()` deduplicated tasks by `normalizeMaintenanceTaskIdentity(task).equivalentKey` before `captureTaskHistory()`. Equivalent configuration/name does not imply identical historical events: later task records could contain the only January/April history. The collector also required `manualHistory.dateISO` and explicit completion metadata, while the existing compatibility stream accepted legacy `date`/`doneDateISO` fields and status-less manual records. The recent-events list separately truncated to six records. History now comes from all retained task records; rate/configuration deduplication remains unchanged. Completed-date/manual mirrors collapse, identified same-day events retain their own snapshots, V2 root lifecycle resolution and linked legacy shadows remain enforced.
2. **Purchase discrepancies:** the initial Central Data Table, live receipt-driven table refresh, chart and financial report read the same `receiptTrackerWeeks[].rows` through separate projection paths. The refresh ran `normalizeRows(...).filter(...)` before assigning the navigation index, so empty rows could shift the source row target. Initial table/chart financial helpers converted missing amounts to zero while the financial report excluded incomplete inputs. A shared read-only projection now retains original week/index references, detects incomplete inputs, and deduplicates only supported stable identities. Receipt/order lines are counted once, without adding order-request approvals as another purchase ledger. This resolves reproduced calculation/refresh inconsistencies; a production-specific missing-table-row cause remains unverified as stated above.
3. **Missing early Estimated Cost Trends:** `renderCosts()` defaulted its additional chart window to six months, independently of the financial period. `filterChartSeriesByRange()` anchored each series to its own latest point and capped YTD at 186 points (`(Number('ytd') || 6) * 31`). Dense YTD data therefore lost January even when its model series contained it. Chart buttons now select the same inclusive financial period used by tables/cards, all in-range real points survive, and artificial fallback points are removed. A 294-day YTD browser fixture verifies the January chart target survives.
4. **Timezone loss:** `normalizeDateISO('YYYY-MM-DD')` validated into local midnight and passed that Date through `ymd()`'s UTC-parts path again. UTC+14 shifted the business date backward. The validated canonical string is now returned directly. The arithmetic/rules for calculating daily/cumulative hours were not changed.
5. **Missing job history:** maintenance and purchases already have independent authoritative collections. Historical machine-hour evidence was absent from the Cost Analysis audit display, and purchase spending per completed-job hour returned zero without job hours. The Data Center now exposes daily/meter evidence using the existing hour-precedence resolver; unavailable denominators display `INSUFFICIENT DATA`. No revenue, profit or jobs are inferred from this evidence.

## Source-to-display map

| Metric/display | Authoritative source and date | Functions/files |
| --- | --- | --- |
| Loaded state | Firebase state adoption into application bindings and `window` collections; import provenance stays on source records | `adoptState()` / authoritative adoption paths in `js/core.js` |
| Legacy maintenance events | `tasksInterval`, `tasksAsReq`, retained deleted task payloads; `completedDates`, `manualHistory.dateISO/date/doneDateISO`; removed/uncompleted/cancelled lifecycle excluded | `computeCostModel()`, `captureTaskHistory()`, `shouldIncludeManualHistoryEntry()` in `js/renderers.js` |
| V2 events | `maintenanceTasksV2`, `maintenanceCalendarInstancesV2`, `maintenanceOccurrencesV2`; completed roots at resolved `displayDateISO` / effective date, not event-recording timestamp | `buildMaintenanceCompatibilityStream()` in `js/core.js`; existing `resolveV2OneTimeOccurrenceState()` / repeat resolver in `js/calendar.js`; V2 table projection in `computeCostModel()` |
| Maintenance costs | Occurrence `partsCostSnapshot/partsCost/calendarPrice`, occurrence hours, configured fallback price/downtime; V2 stream snapshots; modeled labor at existing $30/hr | `OMAXCutCostFeedback.maintenanceRows()` in `js/cutCostFeedback.js`; `costFields`, `costEstimated`, `costIncomplete` retained |
| Recorded purchases | `receiptTrackerWeeks[].rows`: transaction `date`, `purchased`, `cost`, `qty`, per-line `shipping` and `tax`; PHv2 `orderId/lineId`, imports and original provenance | `normalizePurchaseHistory()` / `getPurchaseFinancials()` in `js/purchaseFinancials.js`; initial `purchaseDataTableRows`, live `renderCentralSpendRows()` in `js/renderers.js`; `expenses()` in `js/financialReconciliation.js` |
| Purchase amount | `cost * qty + shipping + tax`; allocated PHv2 charges are already per-line | Existing `getPurchaseFinancials()`; no reallocation, write or second order total |
| Approved maintenance orders | Non-draft `orderRequests`; existing approved-item, maintenance/category/tag/part-number eligibility; resolved/updated/created timestamp | Existing maintenance-order estimate helpers in `computeCostModel()`; not added to recorded-purchase totals |
| Machine/cut-hour evidence | `totalHistory[].dateISO/hours` cumulative readings and `dailyCutHours[].dateISO/hours/source`; imported/restored rows use these same collections | New `buildCostMachineHourHistory()` in `js/renderers.js` calls unchanged `resolveEffectiveDailyCutHours()` in `js/core.js`; manual precedence and automatic-delta compatibility retained |
| Job revenue/profit | Only `completedCuttingJobs`, canonical `completedAtISO`; estimate/actual financial hours resolved by existing job helper; no machine-hour substitution | `computeCuttingJobProfit()` in `js/computations.js`; `selectJobs()` / `build()` in `js/financialReconciliation.js` |
| Central Data Table | Corrected maintenance rows, receipt rows, canonical completed jobs; current selected financial period | `computeCostModel()` -> `viewCosts()` in `js/views.js`; unfiltered `allMaintenanceDataTable` remains available to dashboard search/task-history consumers |
| Estimated Cost Trends | Completed maintenance event costs and recorded receipt spending grouped by business date; canonical completed-job profit remains separate | `maintenanceTrendRows`, `maintenanceSeriesFromDataTable`, `totalSpendSeries`, `inFinancialPeriod()` in `computeCostModel()`; chart drawing in `drawCostChart()` |
| Historical selected period | `window.__cuttingFinancialRange`; one captured local analysis day; inclusive `startISO/endISO`, 30/90/182/365-day periods plus YTD and all time | `period()` / `dateKey()` / `localToday()` in `js/financialReconciliation.js`; `bindFinancialPeriodControls()` and chart controls in `renderCosts()` |

Purchase deduplication uses `(orderId,lineId)`, import event ID, source-ID/record-ID tuple, or a retained row ID, in that priority order. Untagged identical purchases and distinct line/order IDs survive. Conflicting values for one stable purchase identity remain visible as incomplete and are excluded from purported complete amounts. Maintenance never merges merely by task name; exact root/import links and unambiguous legacy/V2 shadows are used. Distinct supported same-day event IDs survive.

Incomplete maintenance/purchase costs remain visible as `Incomplete` (missing maintenance fields also show `Unknown`) and are excluded from chart amounts/known expense subtotals. Configured defaults remain estimates, zero is accepted when actually supplied, and modeled labor is not described as a verified cash payment.

## Deliberate window/metric distinctions

- The historical financial selector, chart buttons, historical table rows, recent event list and financial subtotals use the same effective date boundaries. Source collections are not truncated or rewritten.
- The receipt editor retains its explicitly labeled editable week/range; it is an editor for source transactions, not the financial-period total. Its live Central Data Table refresh honors the shared financial period and preserves original row indexes.
- CCR retains its explicitly saved configuration and requested window, including the existing `(starting reading, ending reading]` measurement boundary. Graph controls do not silently rewrite that saved estimate. Open configuration and unsaved draft inputs survive period changes.
- Annual forecasts retain the current projection year, method and explicitly selected forecast source window. Maintenance Cost Windows retain their individually labeled comparison windows. Incomplete event costs are excluded and partial forecast coverage is stated.
- Weekly reports retain their own labeled weeks and existing calculation model. Time-efficiency widgets retain their labeled comparison windows. Neither becomes evidence of historical job revenue.
- Purchase spending per completed-job hour retains its existing job-hour denominator; independent machine-hour evidence is shown separately. Sparse meter intervals are partial coverage, not proof of daily cutting jobs or complete daily coverage.
- Maintenance expense, recorded purchases and runtime costs can overlap; no combined realized profit is fabricated and costs are not deducted twice from job profit. Garnet-material exclusion and existing purchase/order eligibility rules remain intact.

## Validation

No `package.json` exists; no npm commands were run. Commands below ran from the repair worktree unless noted.

```powershell
node --test --test-reporter=tap tests/costdata-01a.test.js tests/financial-reconciliation.test.js tests/purchase-financials.test.js tests/purchase-orders.test.js tests/cut-cost-feedback.test.js tests/cut-cost-cumulative-hours.test.js tests/ach-average-cut-hours.test.js tests/maintenance-history-import.test.js tests/recovery-import.test.js > artifacts/costdata-targeted.tap
```

**213 passed, zero failed.** Fixtures in `tests/fixtures/costdata-01a.cjs` cover January, April, July and October 2026, with jobs only in July/October. Tests cover stable purchase deduplication/conflicts, distinct same-day maintenance events/snapshots, legacy/V2 mirroring, YTD/12-month/short-window totals, valid canonical dates across two timezones, explicit zeros versus missing costs, and non-mutation.

```powershell
$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node --test --test-reporter=tap tests/costdata-01a.browser.cjs tests/financial-reconciliation.browser.cjs tests/cut-cost-feedback.browser.cjs > artifacts/costdata-browser.tap
```

**21 passed, zero failed.** Headless Edge used only disposable localhost devsafe backends, with every external request blocked. Includes Chicago and UTC+14, actual model/DOM/chart reconciliation, 294-day YTD history, changing both kinds of period control, CCR configuration preservation, no jobs, no invented revenue, incomplete data, exact source-state comparisons, zero display-triggered saves, and fresh reload. The initial sandbox Edge launch failed; approved execution outside the sandbox passed. Invalid early fixture identities triggered existing Recovery Mode until the synthetic fixture was corrected; protections were not bypassed.

```powershell
$testFiles = @(rg --files tests -g '*.test.js')
node --test --test-reporter=tap $testFiles > artifacts/costdata-unit.tap
```

The final broad run reported **1,694 tests: 1,684 passed, ten failed**. An untouched archive of baseline `633e144` independently reported **1,686 tests: 1,676 passed, the same ten failed**, using that same command from `artifacts/origin-main-baseline` (output `artifacts/origin-main-baseline-unit.tap`). These pre-existing failures concern Jobs add/edit extraction harnesses, the repair UI harness, and a Projects historical-duration expectation. They are not claimed as passes or repaired here. Automated comparison confirmed the same ten failing test names and no additional broad-suite failures.

Baseline failing test names:

- canonical actual Jobs add handler stops before dependent mutation
- mixed actual Jobs add handler stops before dependent mutation
- actual repair UI disables a blocked audit and reports a late blocker without success
- active and history unrelated edits keep the exact legacy pair
- active and history category edits update both fields after validation
- active and history Save exclude the live edited job from conflicting ownership evidence
- active and history edits stay open until verification, including failed/indeterminate saves
- CJPROFIT-01: active/history save signed cost and fractional cut time without unrelated changes
- CJADD-01A: real draft capture retains all form values including minutes before file selection
- ACC02 historical recorded duration overrides zero and positive estimates in a calculation-only copy

`node --check` ran on changed JavaScript and new JS/CJS fixtures/tests; `git diff --check` passed. Earlier focused runs exposed outdated source-extraction contexts, which were updated to supply the actual shared helper and complete-row projection; full application browser tests verify the integrated paths.

## Changed files and safety

Implementation: `js/core.js`, `js/cutCostFeedback.js`, `js/financialReconciliation.js`, `js/purchaseFinancials.js`, `js/renderers.js`, `js/views.js`.

Tests: `tests/costdata-01a.test.js`, `tests/costdata-01a.browser.cjs`, `tests/fixtures/costdata-01a.cjs`, and extraction-context updates in `tests/financial-reconciliation.test.js`, `tests/purchase-financials.test.js`, `tests/purchase-orders.test.js`. This report is the only documentation addition.

No production Firebase connection, browser session or production-data validation was used. No production record was deleted, reset, rewritten, migrated, backfilled or duplicated. No new historical database or persistence field was introduced. Import provenance, stable IDs, CAS/revision checks, recovery mode, protected fields, Firebase/security/storage rules, existing saved cost settings, and historical purchase/maintenance/job/meter collections are unchanged by this operation. The browser fixtures assert unchanged backend and loaded business-state snapshots after display operations. Existing job financial formulas, hourly garnet rules, purchase allocation, and ACH/CCR cut-hour rules were preserved. A read-only correction cannot recover records absent from authoritative state or prove complete historical cost/revenue coverage.
