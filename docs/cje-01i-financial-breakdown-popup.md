# CJE-01I — Financial Breakdown popup

Presentation-only follow-up on PR #518. The supplied production checkpoint remains 172 jobs, 155 resolved durations, zero duration conflicts, 38 candidate groups, 21 confirmed duplicate-import links, 18 unresolved pairs, four disproven cross-pairings, and +$13,801.63 all-time modeled job profit. This phase does not re-audit or change those records, calculations, classifications or totals.

## Problem and focused changes

The inline Financial Breakdown was a child of the Cost Overview dashboard window. Saved layouts position these windows absolutely and scroll/clip their contents independently. Expanding a large financial report inside that window could place it behind other cards or inside competing scroll areas.

- `js/views.js`: replace the inline disclosure with **View Financial Breakdown**. Render the existing authoritative financial report into three levels: prominent saved-input profit/period/count/revenue/runtime/material summary; compact supporting figures; collapsed technical and record-level sections. Keep rate/default evidence, formulas, original-versus-current population, excluded rows, largest losses, warnings, purchases, maintenance, annual projections and coverage limitations. Expenses stay negative and genuine losses stay negative; zero expenses display as $0.00. No editable rate inputs are added.
- `js/renderers.js`: create one native `<dialog>` directly under `document.body`, outside dashboard/layout/scrolling containers. Native `showModal()` places it in the browser top layer and makes the background inert. Close/Escape returns focus to the current Overview control, including after rerenders. A single navigation listener closes the dialog when leaving Costs. Dialog listeners and the header's period control bind once; the recreated Overview button has one handler. The existing calculator is opened through its existing control, after closing this dialog.
- `style.css`: scope the responsive frame, fixed header, internal scroll area, focus indicators and summary grid to this popup. Wide record tables scroll within labeled, keyboard-focusable regions. The Overview summary grid/button do not shrink into each other in short saved windows. While the modal is open, contain background horizontal overflow and lock page scrolling; saved layout boxes/storage are untouched.

`renderCosts()` passes the exact `model.financialReconciliation` report already used by Cost Overview. The popup's period control uses the existing shared transient preference/rerender handler. There is no new financial calculation/source of truth. An open dialog refreshes in place on period changes or normal Cost rerenders; expanded sections are retained, and a changed period returns the report body to its summary. Header controls retain focus. Normal rerenders preserve scroll position when the period is unchanged.

The what-if link opens the existing temporary calculator. Its inputs/results remain separate from canonical saved-input results. Recorded purchases, maintenance event costs and annual forecasts remain separately labeled; none is deducted again. Net Waterjet Financial Impact remains unavailable pending the existing coverage evidence. Source reconciliation/exclusion preview remains in the unchanged Cutting Jobs audit, linked from advanced details.

## Verification

No `package.json`, package scripts or repository `AGENTS.md` were found. Commands run from the existing PR worktree:

```powershell
node --test tests/cje-source-reconciliation.test.js tests/cje-completed-duration.test.js tests/financial-reconciliation.test.js tests/cje-snapshot-average.test.js tests/ach-average-cut-hours.test.js tests/ach-edit-logged-hours-noop.test.js tests/cjprofit01-calculation.test.js tests/cjprofit01b-downstream.test.js tests/cjprofit02-failed-cut.test.js tests/cjprofit03-ui.test.js tests/cut-cost-feedback.test.js tests/cut-cost-cumulative-hours.test.js tests/purchase-financials.test.js tests/weekly-cost-report-baseline.test.js tests/cfr06-cutting-job-ui.test.js tests/completed-job-provenance.test.js tests/cjcd01b-calendar.test.js tests/cji02-history-repair.test.js tests/cutting-job-import.test.js tests/cji-02g-cutting-import-identities.test.js tests/atomic-persistence.test.js tests/recovery-import.test.js tests/import-selective-rollback.test.js
$env:OMAX_PLAYWRIGHT_PATH='C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
node --test tests/financial-reconciliation.browser.cjs tests/cje-completed-duration.browser.cjs
```

Final results: **298 targeted Node runner entries passed, zero failed; three isolated Edge browser workflows passed, zero failed.** Legacy import/repair runner entries also report their 26/15 internal cases. After strengthening the actual popup-to-audit navigation check, the duration/audit browser workflow was rerun separately: **one passed, zero failed**. This rerun is the same workflow, not a fourth distinct browser case.

After adding explicit assertions for a negative primary profit, zero expense signs and removal of record-level content from Overview, `node --test tests/financial-reconciliation.test.js` was rerun: **29 passed, zero failed** (a subset of the 298 entries above).

The five changed JavaScript/test files passed `node --check`: `js/renderers.js`, `js/views.js`, `tests/financial-reconciliation.test.js`, `tests/financial-reconciliation.browser.cjs`, `tests/cje-completed-duration.browser.cjs`. `git diff --check` passed.

Browser checks cover:

- Body mounting and native `:modal` top-layer state above actual absolutely positioned, clipped saved Cost windows.
- Opening, explicit close, reopening with Enter, Escape, focus return after rerenders, period-control focus, keyboard navigation and inert background controls. Native browser chrome remains keyboard-accessible.
- One dialog reused across all six financial ranges, live period changes inside the open dialog, normal rerenders, retained disclosure state, and no added navigation listeners across rerenders.
- Exact popup/Card profit agreement, included count, adjusted revenue, negative runtime/material contributions, negative job rows, separate purchases/maintenance/projections, unavailable combined impact, and Chicago/UTC+14 local-midnight boundaries.
- Calculator navigation and isolation: temporary charge/cost/range changes do not change canonical cards/rows or the independent utilization range.
- Desktop 1440×1100; narrow 320×568 and 390×844; smaller 720×550 viewport. Dialog/body/page have no horizontal overflow while open, summary values can be scrolled into view, the header stays visible during scrolling, and the last financial-table column is reachable inside its own scroller. Desktop/mobile screenshots were visually inspected.
- Actual advanced-details navigation to Cutting Jobs and the existing audit: synthetic 172/155/38 structure, unchanged source classifications (two confirmed/four separate edges in the source-text test group), material warnings, explicit hypothetical preview/reset and stale-preview protection.
- Zero save/backup/mutation calls during the protected read-only flows. Every loaded business collection exposed through the importer state, job folders, saved cost layout boxes, cloud layout, local layout-storage entries and the disposable backend compare exactly with their pre-interaction baselines. All external requests are blocked and production Firebase is absent.

Confirmed unchanged relative to CJE-01H: `js/computations.js`, `js/financialReconciliation.js`, `js/cuttingJobSourceEvidence.js`, `js/core.js`, `js/cuttingJobImporter.js`. No Firebase, historical job/maintenance, schema, business-record, saved-layout, persistence/CAS or recovery-protection edits were made.

The full repository suite, authenticated production workflows, Safari/Firefox, screen-reader sessions and physical mobile devices were not tested. Viewport tests are not a claim of physical-device or browser-zoom testing. Before merge, verify the popup on the signed-in production Cost page and its saved desktop/mobile layout: compare the same selected period and checkpoint totals, exercise close/Escape and period changes, and confirm the calculator/audit navigation. PR #518 remains open and unmerged, ready for that production UX verification.
