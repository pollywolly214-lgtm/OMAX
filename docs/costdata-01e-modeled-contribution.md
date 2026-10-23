# COSTDATA-01E: modeled contribution and evidence

Continues draft PR #519 on `codex/costdata-01a`, starting at
`19e36c6b90410e0718b4f4064d6efccd9355eaf5` (the 01D integration of main
`7285ac1e78d8387bb6beed3a64c1b843da8107db`). Do not merge automatically.

## Finding and correction

The canonical helper's selected-job sum and component bridge reconcile the
supplied complete export at cent precision. No arithmetic defect was reproduced.
The plain **Cutting Job Net Profit** label nevertheless implies financial
evidence that the application does not have. It uses financial hours and saved
hourly charge rates, not a reconciled invoice/payment ledger. Its runtime rates
have no verified historical expense allocation; material costs can be calculated
snapshots. Missing inputs and duplicate representations can affect the result.

Changed Cost Analysis labels to **Modeled Cutting Job Contribution**, including
related tables, categories, calculator descriptions and chart explanations.
The financial breakdown now explicitly discloses:

- Rate-based value does not establish verified sales, cash profit or total
  business profitability, or classify work as sold, internal or capacity value.
- Missing failure percentages and missing material cost/quantity use existing
  zero calculation defaults; missing evidence does not establish a known zero.
- Positive financial hours remain preserved even when recorded actual-hour
  candidates differ. No duration policy is changed.
- Runtime, material, maintenance, purchases, garnet, machine costs and overhead
  can overlap or be unallocated. No expense is subtracted again.
- The top five contributions and remainder partition selected jobs; imported,
  blank-source-rate, possible-duplicate and other evidence subsets overlap.
  No evidence subset is an exclusion or a corrected total.

Added a pure `modelEvidence` projection to the existing reconciliation module.
All totals, selection rules, canonical financial formulas and duration resolution
are unchanged. `js/computations.js`, `js/cuttingJobImporter.js`, `js/core.js`,
identity validation and maintenance archive/write-coordinator code are unchanged
from the 01D HEAD. No new persistence fields or systems were introduced.

## Calculation and source audit

Per job: `h * chargeRate * (1 - failurePercent / 100) - h * abs(costRate)
- materialCost * materialQty`. The helper sums unrounded numbers; displayed
rounded components can differ by a cent. Its positive original financial hours
are retained; supported actual time can replace zero/missing completed-job
financial duration under the existing policy.

The importer supplies $200/hr charge and $45/hr runtime cost when source cells
are blank and preserves those cells in provenance. These become saved values,
distinct from canonical $250/$30 legacy fallbacks. Import material cost comes
from the resolved material/dimensions/density/price/waste calculation, rounded
to cents with quantity 1; it is not necessarily the original material_cost cell.
Blank material can assume A36 with retained assumption metadata. Neither a
calculated material value nor a saved hourly rate verifies an invoice.

Duplicate candidates match cross-import project/date/recorded duration. Source
confirmation additionally uses the existing reviewed physical-log-entry catalog
and retained source text/context, not field similarity alone. The catalog covers
only its reviewed two-page excerpt and does not establish rate/material accuracy
or invoice revenue. Verified separate entries remain separate. No duplicate
candidate is automatically removed or excluded.

Added `scripts/costdata-01e-audit.cjs` for offline, read-only reconciliation. It
accepts state exports, job arrays or diagnostic envelopes, labels partial
populations, reports exact rows/pairs and signed alternative sensitivity scenarios,
and checks that its input was not mutated. Confirmed and uncertain hypotheses
are separate; their ID sets are unique and no scenario changes source records.
The optional F12 export in `docs/costdata-01e-read-only-export.js` reads already
loaded jobs only, with no Firebase call, save, clipboard change or state write.

Private production-derived JSON, the full 174-row CSV, all-pair CSV and detailed
business report are retained only as untracked local artifacts. They are not
included in this PR. The supplied export was read offline and its SHA-256 was
unchanged after analysis. The review is not an independent live Firebase read.

## Tests on the actual updated COSTDATA tree

No `package.json` exists; no npm commands were selected.

```powershell
node --test --test-reporter=tap tests/costdata-01e.test.js tests/costdata-01a.test.js tests/costdata-01c.test.js tests/costdata-01d.test.js tests/financial-reconciliation.test.js tests/purchase-financials.test.js tests/purchase-orders.test.js tests/cut-cost-feedback.test.js tests/cut-cost-cumulative-hours.test.js tests/ach-average-cut-hours.test.js tests/maintenance-history-import.test.js tests/recovery-import.test.js tests/cjo04-review.test.js tests/firebase-two-computer-baseline.test.js tests/inventory-material-persistence.test.js tests/mdel01-task-deletion.test.js tests/mdel01b-verification.test.js tests/mdel01c-restoration.test.js tests/cje-source-reconciliation.test.js tests/cje-completed-duration.test.js tests/cutting-job-import.test.js tests/cji-02g-cutting-import-identities.test.js > artifacts/costdata-01e-combined-targeted.tap
```

**586 passed, zero failed/skipped.** Includes 11 new focused regressions for
contribution partitions, overlapping evidence, importer defaults/provenance,
missing versus zero inputs, unchanged duration policy, excluded future records,
confirmed/separate/unresolved source pairs, signed sensitivity and partial exports.

```powershell
$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node --test --test-concurrency=2 --test-reporter=tap tests/financial-reconciliation.browser.cjs tests/costdata-01a.browser.cjs tests/costdata-01b.browser.cjs tests/costdata-01c.browser.cjs tests/costdata-01d.browser.cjs tests/mdel01-task-deletion.browser.cjs tests/mdel01c-restoration.browser.cjs tests/cut-cost-feedback.browser.cjs > artifacts/costdata-01e-combined-browser.tap
```

**40 passed, zero failed/skipped.** Headless Edge, synthetic localhost backends,
non-local requests blocked. Financial browser assertions now cover the visible
label, primary disclosure, overlapping-subset warning, unchanged financial hours
despite differing actual candidates, unchanged totals and zero display saves.
The existing browser suite continues to exercise delayed loads, period changes,
navigation/reload, actual chart targets, archived FK validation, exact-ID
restoration, Recovery Mode and guarded persistence in Chicago and UTC+14.

After final cent-precision formatting, focused rechecks:

```powershell
node --test --test-reporter=tap tests/costdata-01e.test.js tests/financial-reconciliation.test.js > artifacts/costdata-01e-final-focused.tap
node --test --test-reporter=tap tests/financial-reconciliation.browser.cjs > artifacts/costdata-01e-final-financial-browser.tap
```

**40/40 focused checks and 2/2 browser cases pass.** Browser execution required
approval outside the sandbox. Syntax and whitespace checks and the repository's
tracked-file binary policy pass:

```powershell
$costdataFiles=@('js/financialReconciliation.js','js/renderers.js','js/views.js','scripts/costdata-01e-audit.cjs','docs/costdata-01e-read-only-export.js','tests/costdata-01e.test.js','tests/financial-reconciliation.test.js','tests/financial-reconciliation.browser.cjs')
foreach ($costdataFile in $costdataFiles) { node --check $costdataFile }
git diff --check
git diff --cached --check
& 'C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/check_binaries.py
```

The complete repository suite was not rerun. The three independently reproduced
main-baseline extraction-harness failures documented by 01D are not claimed as
passes or repaired by this work.

## Changed files and remaining verification

Application: `js/financialReconciliation.js`, `js/renderers.js`, `js/views.js`.
Audit/reporting: `scripts/costdata-01e-audit.cjs`, this report and the read-only
F12 exporter. Tests: `tests/costdata-01e.test.js`, plus updated financial unit and
browser assertions. No saved financial records, IDs, imports or provenance were
rewritten, deleted, deduplicated, migrated or altered.

Verify labels and responsive disclosure layout on the authenticated deployed
preview. Business review still needs invoice/bid/internal-work evidence, financial
versus actual durations, material zeros/thickness/cost inputs, runtime allocation
and later source pages for unresolved candidates. No live Firebase writes,
production deletion/restoration, device/network fault exercise or actual invoice
verification was performed for 01E. PR #519 stays draft and unmerged.
