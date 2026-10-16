# PHv2-02C — saved order editing and inventory workflow

## Scope and files

PR #506 was checked open/draft/unmerged at head `dd2b4832e3467cddfcc0aff622373cebe554775d`, based on `codex/phv2-01c-purchase-history` (#503). Fetched origin and continued the existing `codex/phv2-02a-purchase-orders` branch. No new PR and no automatic merge.

Follow-up files:

- `js/purchaseOrders.js`: saved-order inspection, snapshot comparison, whole-order replacement and edit support in the existing coordinator.
- `js/renderers.js`: Edit Order, confirmation, edit-mode population, session drafts, live suggestions, original Settings route, selection refresh and a local recovery before-image.
- `js/views.js`: mode heading and navigation/draft explanation.
- `style.css`: scoped Edit Order/Edit Inventory and suggestion styles only.
- `tests/purchase-orders.test.js`: saved-order identity/metadata, allocation, replacement, conflict, failure, removal, week move and recovery tests.
- `tests/purchase-orders.browser.cjs`: real local browser editing, live keyboard/mouse suggestions, Settings handoff/resume and failure/concurrency tests.
- `docs/phv2-02b.md`: link to this current report.
- `docs/phv2-02c.md`: this report.

Unrelated job-table CSS edits appeared in the shared workspace during implementation. They are preserved in the working tree and excluded from this commit using a scoped staged patch. Existing untracked `.worktrees/` and `artifacts/` are also preserved/excluded. No changes to `js/core.js`, `js/atomicPersistence.js`, `js/purchaseFinancials.js`, shared financial formulas, Inventory architecture or unrelated systems.

## Whole-order editing and safety

Each saved heading has Edit Order. The existing entry interface opens as Edit Purchase Order / Save Changes with date, PO, total shipping/tax, items and existing references. `orderId` stays fixed. Existing `lineId` values survive edits; only Add Item generates a new stable line ID. Generic row-level editing/removal remains locked.

`openSaved` requires one identifiable order in one unambiguous correct week, globally unique stable line IDs, consistent dates/PO, supported allocation versions, matching charge metadata and complete charge sums. Missing/inconsistent identity or metadata blocks editing with a message. Original 02A orders without order-level tax metadata can open using the exact sum of stored line tax; opening does not recalculate or mutate anything. Legacy standalone records cannot enter this editor.

The session captures an exact original order snapshot, including unknown metadata. Save validates the complete draft with the existing 02B allocator. Shipping and tax are independently recalculated by quantity-extended merchandise weights with deterministic integer-cent remainders. Before replacement, the authoritative order must still match the original snapshot. Stale edits are rejected with a conflict message, including when an unrelated pending save would otherwise block the operation; that diagnostic performs a read only and never flushes/bypasses pending writes.

Replacement changes only the selected order. Retained lines merge their unknown metadata/IDs with explicitly changed purchase fields. Clearing PO/inventory/task links removes only those optional fields. Other rows keep their values, order and metadata; interleaved unrelated rows remain in place for same-week edits. Date changes remove this order's old lines and append them to one correct existing/new ISO week in the same transaction. The original week container, even if empty, and all week metadata remain intact. No migrations or opening/navigation writes.

Previously saved item removal requires explicit confirmation. The exact confirmed removed line IDs are checked again at the operation boundary. At least one item is still required; this does not add a whole-order deletion workflow. The existing Trash `order-item` type belongs to Order Requests, not Purchase History, and has no compatible purchase-order restore handler, so it is not repurposed. The existing workspace backup runs before saving. Additionally, one exact order before-image is stored locally under `omax_purchase_order_edit_backup_v1`, with workspace path/project and confirmed removals, independently of the rolling workspace backup. If that recovery copy cannot be written, the edit is rejected before the transaction. The local copy is manual recovery evidence, not a Trash/Undo UI, and is replaced by the next attempted order edit in that browser profile.

The existing coordinator still keeps drafts outside live arrays, reserves pending intent, uses the guarded authoritative writer/queue, verifies full source/prepared state and revision/CAS, then independently reads the server and requires exact committed-state equality before adoption/success. Definitive failure preserves the draft and original order. Uncertain outcomes keep Recovery Mode and prohibit blind retry; the server may already have committed, so no unsafe local rollback is attempted. Permission, pending-edit, source drift, identity, reference and recovery gates remain.

The financial model remains `(unit cost × qty) + allocated shipping + allocated tax`. Order metadata adds no second charge. PO/N/A mapping, weekly totals, Central Data Table, graph popup, exports, grouping, PHv2-01C week/year/Week 53, standalone historical decimals and POLISH-01 protections remain.

## Live autocomplete

The previous New Order input reused one static native datalist across every row. Its input handler updated autofill/preview but never updated row-specific visible matches, focus state or selected suggestions. The old legacy editor rebuilt the shared options after input; New Order did not. The reported stale native-popup behavior could therefore persist after selecting an item or switching rows. Native popup internals are browser-owned; the code path and missing refresh were inspected rather than claiming an OS popup diagnostic.

New/Edit Order now uses a small local combobox/listbox per row, populated from the same existing task/inventory option names and exact-match autofill helper. Every input change filters the current text immediately, clears selection state and hides other rows' results. Empty text clears/hides results. Focus refreshes the current row. Mouse selection, Arrow Up/Down, Enter and Escape are supported. There is no native shared-popup cache in this workflow. The legacy single-item datalist is unchanged. Task PN/price precedence, correct inventory references and manual overrides remain. Selecting a suggestion never changes Inventory records or quantities.

## Edit Inventory integration and existing limits

The original Purchase History Edit action resolves an inventory item by name and opens `openSettingsAndReveal(linkedTaskId)` when linked, otherwise Settings. It does not expose a separate inventory modal or a built-in return callback. Both old and new controls now call the same localized route helper; New/Edit Order can resolve the selected inventory ID first so renamed items retain the correct reference.

Edit Inventory retains the complete draft, original edit snapshot and removal confirmations in memory, then opens that same Settings workflow. Returning through the existing Cost Analysis tab resumes New/Edit Order. The normal Settings editor/save path is reused without alteration; order saving waits for existing pending saves to finish. Suggestions and inventory selectors rebuild from live records. Target-row autofilled name/PN/price follow supported changes, while manual overrides and unrelated unsaved order fields remain. Changed task inventory links follow the proven selection mapping; missing/deleted references remain visible for review rather than silently clearing and saving.

Existing Settings behavior may create missing zero-quantity Inventory records for other unlinked maintenance tasks when Settings initializes. This is pre-existing behavior of the original route, not a new order-selection mutation. Browser checks compare the order save against the completed Settings state and verify existing item quantities stay unchanged. No Inventory architecture or Settings persistence changes were made.

Drafts survive in-tab route changes and dashboard rerenders, not page reload, tab close or application crash. The UI states this limitation. Inventory changes are saved by their existing workflow independently; cancelling an order draft does not undo explicit Settings edits.

## Commands and results

PowerShell, repository root `C:\CodexProjects\OMAX`. No package.json exists; no npm or dependency installation commands ran.

```powershell
git status --short
git branch --show-current
git fetch origin
git rev-parse HEAD origin/codex/phv2-02a-purchase-orders
Test-Path package.json
```

GitHub metadata was checked with the GitHub connector. Initial local/remote head matched; package check False.

```powershell
node --test tests/purchase-orders.test.js tests/purchase-history-navigation.test.js tests/purchase-financials.test.js | Select-Object -Last 10; exit $LASTEXITCODE
node --test tests/purchase-orders.test.js tests/purchase-history-navigation.test.js tests/purchase-financials.test.js tests/atomic-persistence.test.js tests/production-hardening.test.js tests/global-identity-repair.test.js tests/historical-import-readiness.test.js tests/historical-import-staging.test.js tests/weekly-cost-report-baseline.test.js tests/inventory-material-persistence.test.js tests/pump-baseline.test.js tests/polish01-hotkey.test.js tests/polish01d-dimensions.test.js tests/cjo02-persistence.test.js | Select-Object -Last 10; exit $LASTEXITCODE
```

Initial existing focused run: 99/99 pass. Extended focused run: 126/126 pass. First extended full regression run: 563/563 pass. Final validation includes the additional pending-conflict regression: **127/127 focused tests pass; 564/564 full regression tests pass**.

```powershell
$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node --test tests/purchase-orders.browser.cjs
```

Final completed browser run: **11 tests passed, 0 failed** (ten flows plus parent), headless Edge against the disposable localhost devsafe backend, with every external request blocked. Includes all earlier 02B flows plus saved-mode field population, quantity/price/charge/PO edits, existing/new IDs, dismissed/accepted saved-item removal, save/reload and cross-week replacement, totals/graph source correctness, Cancel, failed-save retry, stale concurrent order, live per-row keyboard/mouse selection and clearing, and actual Settings editing/resume in both modes. Unit tests additionally cover cross-year moves, inconsistent metadata, unsupported identities/versions, old 02A tax, source/destination metadata, reference clearing, backup failure and uncertain edit readback.

Intermediate browser runs exposed fixture timing assumptions: header navigation uses `#tab-costs`, task reveal is asynchronous, field changes must commit on blur, and freezing Date permanently can strand mutation timestamps ahead of save timestamps. Tests now use the real tab/reveal workflow and a normally advancing clock anchored to the same local calendar date. Settings provisioning is accounted for explicitly rather than hiding its existing behavior. Production save guards were not loosened to make fixtures pass.

```powershell
node --check js/purchaseOrders.js
node --check js/renderers.js
node --check js/views.js
node --check tests/purchase-orders.test.js
node --check tests/purchase-orders.browser.cjs
git diff --check
git diff -- js/core.js js/atomicPersistence.js js/purchaseFinancials.js
& 'C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/check_binaries.py
```

Syntax/whitespace and Python tracked text-only checks pass; shared-file diff is empty. The text-only scan includes the staged new report. Git may emit expected LF/CRLF conversion notices.

Known CJO failures were checked using this exact untouched-base comparison:

```powershell
@'
const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
const baseline=fs.mkdtempSync(path.join(os.tmpdir(),'omax-phv2-02c-base-'));
cp.execFileSync('tar',['-xf','-','-C',baseline],{input:cp.execFileSync('git',['archive','dd2b483'],{maxBuffer:30000000})});
const args=['--test','--test-reporter=tap','tests/cjo04b-verification.test.js','tests/cjo04c-readback.test.js'];
const results=[baseline,process.cwd()].map(cwd=>{const r=cp.spawnSync(process.execPath,args,{cwd,encoding:'utf8',maxBuffer:10000000});const lines=r.stdout.split(/\r?\n/);return{exit:r.status,failures:lines.filter(s=>s.startsWith('not ok ')),summary:lines.filter(s=>/^# (tests|pass|fail|cancelled) /.test(s))};});
assert.deepEqual(results[0],results[1]);console.log(JSON.stringify({base:results[0].summary,candidate:results[1].summary,identicalFailures:true}));
'@ | node
```

Both versions retain **24 passed / 27 failed**, with identical failure names/counts/status. Comparison passes. These existing fixture-helper failures are unrelated and were not changed.

## Remaining verification

No production data access, live Firebase test, deployed browser test or second-device synchronization test was performed. Use a dedicated Firebase test workspace for concurrent sessions, permissions, offline/uncertain outcomes, complete edit/readback/reload and second-device ID/metadata checks. Verify old allocations and legacy provenance remain unchanged unless their complete order was explicitly edited/saved.

Manually check operator browsers, zoom/narrow layouts, keyboard/screen-reader suggestions, saved removal confirmation and recovery-copy availability, original Settings link/edit/return behavior (including task-link changes/deletions and its existing provisioning), exports/Excel PO formatting and the graph popup. Older cached clients do not have these editing guards. Only one local before-image is retained; clearing browser storage removes it. No new Trash/Undo UI was introduced.
