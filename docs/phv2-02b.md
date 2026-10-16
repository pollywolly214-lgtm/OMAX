# PHv2-02B — purchase order refinements

## Branch and compatibility

Checked GitHub PR #506: open, draft, unmerged, head `d2badbe6fab60c9203247c90ac484ff22d9071d2`. Ran `git fetch origin`; the local and remote order branch matched. Continued `codex/phv2-02a-purchase-orders` and updated the existing PR, without creating or merging another PR. Its stacked base remains `codex/phv2-01c-purchase-history` (#503).

Purchase History remains one flat authoritative `receiptTrackerWeeks[].rows` array per week. The formula remains `(cost × qty) + shipping + tax`. No migrations, historical rewrites, old-order recalculations, inventory mutations, ID changes or additional reporting charges. `js/core.js`, `js/atomicPersistence.js` and `js/purchaseFinancials.js` have no follow-up changes. The order adapter, guarded write queue, CAS/revision checks, independent exact-state verification and Recovery Mode are unchanged.

## Behavior

New Order has date, optional text PO Num., total shipping and total tax. Items retain descriptions, parts, positive integer quantities, unit costs and optional inventory links. Per-item tax entry is replaced by an allocated tax preview. Both charges allocate independently using extended merchandise cost, BigInt intermediates, integer-cent floor shares and largest remainders with stable line IDs breaking ties. Each sum reconciles to its charge. Zero merchandise permits only zero charges; blank, negative, nonfinite, overly precise or unsupported monetary values block saving.

For merchandise $10/$50/$40, shipping $20 allocates $2/$10/$8; tax $10 allocates $1/$5/$4. Quantities affect weights. Stored numeric `shipping` and `tax` remain line charges. New lines additionally receive `orderTaxCents` and `taxAllocationVersion:1`; the shipping algorithm/version stays unchanged. These metadata fields are informational and never added to reporting totals. Old 02A orders retain their original per-item taxes and metadata.

The legacy name-selection lookup is now shared with New Order: case-insensitive exact task name, task `inventoryId` lookup, then exact inventory name fallback. Task PN/price take precedence over inventory PN/price, matching the original handler. New Order fills only the selected row's fields and inventory selector immediately. Manual edits remain possible, and inventory/task references are saved and verified. No new inventory field mappings or quantity changes.

Weekly presentation groups saved rows by stable `orderId` in first-seen order, with each order's date, PO, stored-line shipping/tax/total summary and its own table. Same-date orders stay separate. Standalone rows remain in Other / Legacy Purchases. All existing source rows and IDs stay flat and retain their original array order, including interleaved order rows. Detached input nodes survive week/year navigation and regrouping. Generic order editing/removal remains blocked both in the UI and serializer. Weekly totals and exports include each line exactly once.

No equivalent PO field was found in the existing JavaScript purchase model. Optional `poNumber` is trimmed text, copied to every newly created line, preserves leading zeros/alphanumeric references, need not be unique and never replaces `orderId`. Blank values add no PO metadata. Missing/blank values display N/A only in presentation. Week/order tables, range tables, initial cost-model mapping, live Central Data Table rows, purchase search and weekly/range workbook exports carry the PO. Export PO cells use Excel text formatting to retain zeros; financial columns/formulas are unchanged. Existing export filenames remain `.xls` although the existing buttons say CSV.

The Cost Trends click route is `drawCostChart` spend hit target → `{type:"spend", dateISO}` → `window.__focusCostDataCenterRow` → the Central Data Table spend panel. That panel is the individual-purchase graph popup; it uses the same PO mapping. No cutting-job, project or part field is repurposed. Existing graph aggregation/averages remain unchanged.

Export Range remains beside the range selector, as introduced by POLISH-01. Existing current local ISO week/year, Week 53, integer-quantity validation, historical decimal preservation, explicit Central Data Table navigation and save/recovery protections remain covered.

## Exact files changed by this follow-up

- `js/purchaseOrders.js`: order-level tax allocator/validation and optional PO metadata.
- `js/renderers.js`: shared selection lookup, entry/preview, presentation grouping, source-order preservation, PO display/mapping and export.
- `js/views.js`: top-level inputs, PO columns and grouped-week container.
- `style.css`: scoped column widths, grouping spacing and existing horizontal scroll compatibility.
- `tests/purchase-orders.test.js`: independent tax/shipping rounding, invalid charges, PO/serialization/readback and historical compatibility.
- `tests/purchase-history-navigation.test.js`: grouped DOM/source ordering, metadata/drafts and PO exports.
- `tests/purchase-financials.test.js`: week/range/live popup PO rendering and initial mapping compatibility.
- `tests/purchase-orders.browser.cjs`: local end-to-end entry/autofill/grouping/PO/graph/export/reload/save-failure coverage.
- `docs/phv2-02a.md`: link to this refinement report.
- `docs/phv2-02b.md`: this report.

## Commands and results

Commands ran from `C:\CodexProjects\OMAX` in PowerShell. No package.json exists; no npm commands or dependency installation ran.

```powershell
git status --short
git branch --show-current
git fetch origin
git rev-parse HEAD origin/codex/phv2-02a-purchase-orders
Test-Path package.json
```

Pass: branch/head matched the open PR; package check returned False. Existing untracked `.worktrees/` and `artifacts/` were preserved and excluded from the commit. GitHub metadata was checked using the GitHub connector.

```powershell
node --test tests/purchase-orders.test.js tests/purchase-history-navigation.test.js tests/purchase-financials.test.js
node --test tests/purchase-orders.test.js tests/purchase-history-navigation.test.js tests/purchase-financials.test.js | Select-Object -Last 10; exit $LASTEXITCODE
```

Final focused result: **99 passed, 0 failed**. The initial run before extending tests passed 86. During test development, assertions were corrected for cross-VM array prototypes and the simplified saved-row label; final tests pass.

```powershell
node --test tests/purchase-orders.test.js tests/purchase-history-navigation.test.js tests/purchase-financials.test.js tests/atomic-persistence.test.js tests/production-hardening.test.js tests/global-identity-repair.test.js tests/historical-import-readiness.test.js tests/historical-import-staging.test.js tests/weekly-cost-report-baseline.test.js tests/inventory-material-persistence.test.js tests/pump-baseline.test.js tests/polish01-hotkey.test.js tests/polish01d-dimensions.test.js tests/cjo02-persistence.test.js | Select-Object -Last 10; exit $LASTEXITCODE
```

Pass: **536 passed, 0 failed**. Subsequent export-text formatting and saved-row label changes were checked by the final 99-test focused run.

```powershell
$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node --test tests/purchase-orders.browser.cjs
```

Pass: **6 tests, 6 passed** (five flows plus parent), actual headless Edge, localhost disposable devsafe backend, every external network request blocked. Covers independently reconciled preview/saving, no per-item tax input, leading-zero/alphanumeric PO, row-specific inventory and task precedence, manual overrides, persisted IDs/values, unchanged inventory/tasks/legacy values, same-date order groups, navigation without writes, missing-PO display, weekly totals, reload, actual graph hit-target click into the purchase popup, popup-to-order navigation, range download contents, Add/Remove/Cancel, rejected-save retry IDs and uncertain-save Recovery Mode. Browser test setup was corrected to use the Cost Trends canvas (`costChart`) and account for reload closing Purchase History; final runs pass.

Screenshots were captured with the same command, adding these environment variables on separate runs:

```powershell
$env:OMAX_PH_SCREENSHOT='C:\CodexProjects\OMAX\artifacts\phv2-02b-preview-20261016.png'
$env:OMAX_PH_GROUP_SCREENSHOT='C:\CodexProjects\OMAX\artifacts\phv2-02b-grouping-20261016.png'
# Final corrected grouping layout:
$env:OMAX_PH_GROUP_SCREENSHOT='C:\CodexProjects\OMAX\artifacts\phv2-02b-grouping-final-20261016.png'
```

Preview and grouped tables were visually inspected; final layout keeps dates/parts readable with horizontal scrolling. A 740px viewport checks horizontal overflow behavior. Screenshots are untracked local artifacts, not repository assets.

```powershell
node --check js/purchaseOrders.js
node --check js/renderers.js
node --check js/views.js
node --check tests/purchase-orders.test.js
node --check tests/purchase-history-navigation.test.js
node --check tests/purchase-financials.test.js
node --check tests/purchase-orders.browser.cjs
git diff --check
git diff -- js/core.js js/atomicPersistence.js js/purchaseFinancials.js
& 'C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/check_binaries.py
```

Pass: syntax, whitespace and tracked text-only scan. Shared-file diff is empty. Git emits expected LF/CRLF conversion notices.

The known CJO fixture failures were independently checked on both the untouched 02A commit and candidate, using this exact comparison:

```powershell
@'
const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
const baseline=fs.mkdtempSync(path.join(os.tmpdir(),'omax-phv2-02b-base-'));
cp.execFileSync('tar',['-xf','-','-C',baseline],{input:cp.execFileSync('git',['archive','d2badbe6'],{maxBuffer:30000000})});
const args=['--test','--test-reporter=tap','tests/cjo04b-verification.test.js','tests/cjo04c-readback.test.js'];
const results=[baseline,process.cwd()].map(cwd=>{const r=cp.spawnSync(process.execPath,args,{cwd,encoding:'utf8',maxBuffer:10000000});const lines=r.stdout.split(/\r?\n/);return{exit:r.status,failures:lines.filter(s=>s.startsWith('not ok ')),summary:lines.filter(s=>/^# (tests|pass|fail|cancelled) /.test(s))};});
assert.deepEqual(results[0],results[1]);console.log(JSON.stringify({base:results[0],candidate:results[1],identical:true},null,2));
'@ | node
```

Both suites remain **24 passed / 27 failed**, identical failure names/status on baseline and candidate; comparison passes. These pre-existing fixtures omit helpers such as `ensureJobCategoryFolderOpen` and `stableStringifyForIntegrity`. No unrelated fixes were made.

## Remaining manual checks and limits

No production reads/writes, deployed-browser test or live Firebase test was performed. Local mock save/reload and exact-state verification pass; another-device propagation and actual Firebase permissions/network behavior remain untested.

Before release, use a dedicated Firebase test workspace to create multi-item orders with fractional-cent shipping/tax shares; verify totals, IDs, PO and inventory/task references after reload and another device. Check permissions, concurrent writes, offline/uncertain outcomes and Recovery Mode without blindly re-entering an unverified order. Confirm old 02A tax allocations and legacy decimals/provenance stay unchanged.

Manually check operator browsers at normal/large zoom and narrow widths, native datalist selection, horizontal scrolling, multiple same-day order headings, PO/N/A across week/range/Central Data Table/graph popup, both exports, and Excel's handling of text PO references. The downloaded workbook content and text formatting are tested; desktop Excel was not exercised. Retain PHv2-01C week/year/Week 53 and POLISH-01 Export Range behavior.

Saved orders remain create-only/view-only; whole-order editing/deletion is still deferred. Drafts remain session-local. Older cached clients lack the new editing guards. Reconcile the stacked PR base after #503 merges; do not auto-merge.
