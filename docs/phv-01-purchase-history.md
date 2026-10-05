# PHV-01 — Purchase History financial clarity

Branch: `purchase-history-clarity`, created with a clean working tree from latest fetched `origin/main`, `7fb1109a397acffb7a6ee2e3aad3c615bbf55125` (REC-01R merge). REC-02 commit `d5e75227944c5889e01769e9917fff6c1f02991c` was not in merged main when this branch was created; it remains separate. No reset, rebase, force operation or history rewrite was used.

## Read paths and diagnosis

- `computeCostModel()` in `js/renderers.js` builds `purchaseDataTable` from `window.receiptTrackerWeeks`; `viewCosts(model)` in `js/views.js` renders Maintenance Data Center → Total Spend.
- `renderCosts()` → `setupWeeklyReportWindow()` registers the Purchase History modal, its editable `renderWeekRows()` and its read-only `renderRangeTable()`/`buildRangeRows()` summary. The Receipt Tracker weekly purchase interface is that same modal, not another purchase collection.
- `renderCentralSpendRows()` refreshes Data Center purchases after existing manual edits. Its duplicate formula was inside the weekly-report setup, while the initial model independently computed the same fields.
- `js/core.js` loads, adopts and snapshots `receiptTrackerWeeks`. Historical append writes unit `cost`, `qty`, allocated `shipping`/`tax`, identity and provenance to those same rows. PHV-01 does not change any persistence/import logic.
- Initial Data Center calculations converted cost, quantity, shipping and tax to nonnegative numeric values, then used `(cost * qty) + shipping + tax`. The live refresh/week/range used the same formula with numeric zero defaults. Valid nonnegative manual and recovered rows already calculated correctly. Initial Data Center totals above $1,000 were displayed without cents.
- The weekly table called unit cost “Cost”; the range summary omitted unit cost entirely. Neither showed the item subtotal. Footers called the sum of complete line totals “Subtotal.” This was presentation ambiguity rather than missing recovered costs.

## Result and semantics

Both Purchase History tables now show Date, Purchased Item, Part #, Qty, Unit Cost, Item Subtotal, Shipping, Tax and Total Spend, followed by their existing link/action controls. Week/Range Total Spend footers are explicit. Both exports use the same financial labels and include item subtotal. Data Center retains its Week context and displays the same financial columns, with cents always retained.

`js/purchaseFinancials.js` provides a small pure shared `getPurchaseFinancials(row)` helper. It follows the Data Center's existing nonnegative numeric display semantics, treats absent/invalid optional numbers as zero, and never writes to the row:

- Unit Cost: stored `cost` per item.
- Qty: stored `qty`.
- Item Subtotal: Unit Cost × Qty.
- Shipping and Tax: each stored line value, used once and never redistributed.
- Total Spend: Item Subtotal + Shipping + Tax.

The helper is used by initial and live Data Center rendering, week/range totals and exports. Numeric columns align right. The existing modal style is retained with horizontal scrolling and minimum table widths instead of squeezed columns.

The allocation note appears only when the displayed week/range contains an identifiable historical recovery row: a permanent identity matching the original source identity in `importProvenance.sourceRecord`, plus its purchase source fields. It says: “Historical shipping and tax may be allocated across items from the same original order.” An ordinary manual row does not trigger it. Identification does not affect calculation. IDs are compared as persisted values; no order numbers are parsed from them. `sourceId` is a generic source identity, not a documented original order-number field, so no order grouping was added.

Stored purchase data changed: **NO**. No recovered rows, allocated charges, identities, provenance, inventory quantities/transactions, Firebase data or Firebase/Storage rules were changed. Existing manual save/link/export handlers were retained; no such action was executed. Import safety and unrelated UI were not changed.

Files: `index.html`, `js/purchaseFinancials.js`, `js/renderers.js`, `js/views.js`, `style.css`, `tests/purchase-financials.test.js`, and this report.

## Tests and limits

Thirteen new tests cover all requested numeric examples, quantity multiplication, missing optional charges, historical/manual identification, deep-frozen nonmutation, actual week/range/live Data Center rendering, initial Data Center agreement, exact cents above $1,000 using the real currency formatter, editable subtotal/total recomputation, headers/footers/export labels, script loading and horizontal-scroll CSS.

The initial new-test run passed 9/13: four failed because the isolated VM harness omitted `computeRowTotal` and the unrelated average-hours banner dependency. Loading the actual total wrapper and stubbing that unrelated banner fixed the harness; 13/13 then passed. The tests were subsequently strengthened to use the real currency formatters. Final focused/full checks still passed.

These are Node calculation and VM rendering tests, plus source/CSS checks. No actual browser/manual layout test, real workbook import, production Firebase operation or preview interaction was performed. Those remain for operator preview verification.

## Exact verification commands and results

All successful commands exited 0 unless explicitly noted. Commands are shown exactly, including PowerShell batching where used.

```powershell
git branch --show-current; git status; git log -5 --oneline; Test-Path package.json; rg --files -g AGENTS.md -g '!assets/vendor/**'
```

Clean `recovery-import-staging-fix`; HEAD `d5e7522`; package.json False; no AGENTS.md found (the final `rg` returned 1 for no match).

```text
git fetch origin
```

Passed using existing HTTPS transport.

```powershell
git log -5 --oneline origin/main; git rev-parse origin/main; git merge-base --is-ancestor 7fb1109a397acffb7a6ee2e3aad3c615bbf55125 origin/main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; git merge-base --is-ancestor d5e75227944c5889e01769e9917fff6c1f02991c origin/main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; git branch --list purchase-history-clarity; rg -n 'receiptTrackerWeeks|Total Spend|Purchase History|shipping|tax|cost' js/views.js js/core.js js/renderers.js js/router.js index.html
```

Main `7fb1109...`; REC-01R ancestor check passed. REC-02 ancestry returned 1 (not merged), stopping that batch before the final two commands. This was a read-only finding, not a transport failure. Latest merged main was the requested base.

```powershell
if (git status --porcelain=v1) { throw 'Working tree is not clean' }; git switch main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; git merge --ff-only origin/main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; git switch -c purchase-history-clarity; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; git branch --show-current; git rev-parse HEAD origin/main; git status --short
```

Passed; both HEAD and origin/main `7fb1109...`; new branch clean before editing.

```powershell
$phvCheckFiles = @('js/purchaseFinancials.js','js/views.js','js/renderers.js','js/core.js','js/historicalImport.js','tests/purchase-financials.test.js'); foreach ($phvCheckFile in $phvCheckFiles) { node --check $phvCheckFile; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; Write-Output "PASS node --check $phvCheckFile" }
```

All six syntax checks passed.

```text
node --test tests/purchase-financials.test.js
```

Initial 9 passed / 4 harness failures; after harness correction 13 passed / 0 failed.

```text
node --test tests/purchase-financials.test.js tests/recovery-import.test.js tests/historical-import-readiness.test.js tests/import-selective-rollback.test.js tests/production-hardening.test.js
node --test tests/*.test.js
git diff --check
```

68 focused and 193 full-suite tests passed; 0 failed, cancelled or skipped. Diff check passed with no output. After strengthening formatter coverage, the exact final focused batch was:

```powershell
node --check tests/purchase-financials.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node --test tests/purchase-financials.test.js tests/recovery-import.test.js tests/historical-import-readiness.test.js tests/import-selective-rollback.test.js tests/production-hardening.test.js
```

Passed; full `node --test tests/*.test.js` repeated after this test change also passed 193/193. No npm scripts were invented.

Read-only inspection also used the following commands; all found the described source paths except the explicitly noted no-match/glob results:

```powershell
git branch --show-current; git status --short; git rev-parse HEAD; rg --files -g AGENTS.md -g package.json -g '*purchase*' -g '*receipt*' -g '*cost*' -g '*spend*'
rg -n 'receiptTrackerWeeks|Total Spend|Purchase History|shipping|tax|cost' js/views.js js/core.js js/renderers.js js/router.js index.html
rg -n 'Purchase History|Total Spend|computeRowTotal|purchaseHistory|receiptHistory|normalizeRows|purchaseTable|purchaseDataTable' js/views.js js/renderers.js js/core.js style.css tests; rg -n 'receiptTrackerWeeks' js/views.js js/renderers.js; rg -n 'sourceRecord|source_id|importProvenance' js/historicalImport.js js/recoveryWorkbook.js; Get-Content -LiteralPath index.html -Tail 100
$phvViews = Get-Content js/views.js; $phvViews[1935..2045]; $phvViews[2310..2355]; $phvRender = Get-Content js/renderers.js; $phvRender[14110..14305]; $phvRender[14470..14575]; $phvRender[19570..19665]; rg -n 'cost-receipt-table|cost-receipt-summary|cost-receipt-card|cost-data-table' style.css; rg --files tests
$phvRender = Get-Content js/renderers.js; $phvRender[14020..14112]; $phvRender[14305..14475]; $phvRender[14745..14868]; $phvRender[14920..15045]; $phvStyle = Get-Content style.css; $phvStyle[574..687]; rg -n '^function.*[Cc]ost|formatterCurrency|buildCost' js/renderers.js js/views.js; Get-Content tests/cfr05-cloud-presentation.test.js -Head 120; Get-Content js/computations.js -Head 70; Get-Content js/historicalImport.js -Head 80
$phvRender = Get-Content js/renderers.js; $phvRender[14630..14748]; $phvRender[14833..14867]; $phvRender[14988..15035]; rg -n '^function.*[Cc]ost|^function.*[Vv]iew' js/renderers.js js/views.js; rg -n 'receiptTrackerWeeks|computeRowTotal|cost.*qty.*shipping' js -g '*.js' -g '!core.js' -g '!renderers.js' -g '!views.js'
$phvStyle = Get-Content style.css; $phvStyle[574..681]; Get-Content js/views.js -Head 15; Get-Content js/renderers.js -Head 25; rg -n 'vm|viewsCosts|costsView|computeCost|buildCost' tests/production-hardening.test.js tests/*.test.js
$phvRender = Get-Content js/renderers.js; $phvRender[14595..14635]; $phvRender[15005..15032]; $phvViews = Get-Content js/views.js; $phvViews[1280..1335]; $phvRender[16600..16640]; rg -n 'receipt|purchase|spend' js/core.js -g '*.js' | Select-Object -Last 18; rg -n 'vm|computeCostModel|viewCosts' tests -g '*.test.js'
rg -n 'const financials|merchandiseSubtotal|AllocationNote|purchase-number' js/renderers.js js/views.js; git diff --stat
git diff --check; git status --short; git diff -- js/views.js js/renderers.js style.css index.html
rg -n -A 17 'const formatterCurrency =' js/renderers.js; rg -n 'cost-data-center-panel-content|cost-table.*text-align|cost-weekly-table-wrap' style.css; git diff --numstat; git diff --name-only; git status --short
```

The `rg` with a literal `tests/*.test.js` file argument returned a Windows glob error (batch exit 1); it was corrected to `tests -g '*.test.js'`, which passed. No test command failed for that reason. Inspection output confirmed the diff was restricted to purchase display/calculation, styling, tests and this report.
