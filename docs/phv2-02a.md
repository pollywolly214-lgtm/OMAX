# PHv2-02A — create-only purchase orders

PHv2-02B refines this implementation on the same PR #506. The current order-level tax, inventory autofill, grouping and PO-number behavior is documented in [phv2-02b.md](phv2-02b.md). The descriptions below record the original 02A implementation.

## Branch and scope

PR #503 (PHv2-01C) was checked through GitHub and is still open. This branch, `codex/phv2-02a-purchase-orders`, starts at its current head `8a9e43f604115a0dcec2b185a441812d33bb71f3`. The PR targets `codex/phv2-01c-purchase-history`, not main. The base branch itself is unchanged. Main had advanced to `b189e15` / POLISHv2 #504; its unrelated changes are not copied over or reverted by this stacked diff. Reconcile and retarget after #503 merges. Do not merge automatically.

The PHv2-01A findings were reviewed: authoritative purchases remain `workspaces/github-prod/app/state.receiptTrackerWeeks[].rows`; shipping/tax are whole-line amounts, and the shared formula is `(cost × qty) + shipping + tax`. No consumer needs an order-header record or a new backend collection.

Files changed:

- `js/purchaseOrders.js`: order draft/IDs, validation, exact allocation, append/idempotency checks and the coordinated save workflow.
- `js/renderers.js`: Purchase History order form, create-only guards, lightweight order labels, and an adapter to existing persistence/readback/adoption functions.
- `js/views.js`: New Order button and compact entry section.
- `index.html`: load the order helper before views/renderers.
- `style.css`: styles scoped to the order editor, containing its inventory selector and fitting its distinct columns.
- `tests/purchase-orders.test.js`: allocator, real adapter/shared writer/CAS, fault, retry, metadata and reporting tests.
- `tests/purchase-orders.browser.cjs`: headless Edge tests against the disposable localhost backend, with all external requests blocked.
- `tests/purchase-history-navigation.test.js`: saved-order edit/removal guards; retain the existing legacy metadata test using a standalone line rather than an order fixture.
- This report.

No changes to `js/core.js`, `js/atomicPersistence.js`, `js/purchaseFinancials.js`, or downstream financial/reporting functions. PHv2-01C navigation, current ISO week/year, Week 53, integer quantity validation, draft/metadata preservation and save-result handling remain. POLISH-01 Export Range placement and shared transaction/evidence protections remain.

## Workflow and schema

Open Purchase History → New Order. Enter date and shipping once, then descriptions, optional part numbers/inventory links, unit costs, positive integer quantities and per-line taxes. Add/remove unsaved items. The preview shows allocated shipping, merchandise and final spend before Save Order. Cancel discards only the draft. Existing valid Purchase History edits are saved before opening the order editor; invalid edits prevent opening and remain available.

Drafts stay outside live persisted state. New cryptographically generated UUIDs identify the order and each line; changing fields or retrying a definite failure does not regenerate them. Multiple orders on one date receive distinct IDs. An optional inventory selection copies current name/part/price into the draft and retains its inventory ID, without changing stock. Exact task-name matches can retain a supported task link.

Each saved item is one compatible purchase row:

```js
{
  date, purchased, partNumber, cost, qty, shipping, tax,
  // Optional supported references:
  inventoryItemId, taskId,
  // New additive metadata:
  lineId, orderId, orderDateISO,
  orderShippingCents, shippingAllocationVersion: 1
}
```

`cost` remains the merchandise unit price; `shipping` remains the entire line allocation; tax remains per line. Repeated order shipping metadata is display/validation information, not another charge. No financial header row is saved. Week/range labels identify the order without inserting more rows. Existing exports keep their original columns and financial meaning.

Existing rows are cloned without assigning IDs, regrouping, normalizing, rounding or rewriting their values. Untouched dates, decimal quantities, shipping, absent fields, identifiers and import/custom evidence remain exact. Tests exercise mixed legacy/new rows through serializer, actual browser save/reload and the unchanged Central Data Table/chart source. Each line contributes once; inventory quantities and cutting/pump/maintenance formulas are unchanged.

## Money and validation

Decimal monetary inputs are parsed into integer cents; unsupported precision, negative/invalid amounts and unsafe magnitudes are rejected. Intermediate multiplication/division uses BigInt but no BigInt is serialized.

For line weight `w = unit cost cents × quantity` and merchandise total `W`, calculate `shipping cents × w / W`. Save the floor shares, then distribute leftover pennies by descending remainder, breaking equal remainders by stable line ID. Allocation is independent of item ordering and reconciles exactly in cents. Numeric dollar fields must round-trip to the original cents.

- $10/$50/$40 merchandise with $100 shipping → $10/$50/$40.
- $10 × 3 / $70 × 1 with $20 shipping → $6/$14.
- Equal weights with two shipping pennies → one penny each for the first two stable IDs.

Reject empty orders, missing descriptions/date, impossible dates, zero/negative/decimal/unsafe quantities, negative shipping/prices/tax, invalid monetary text and more than two monetary decimal places. Zero merchandise with positive shipping is blocked with a clear explanation. Zero merchandise and zero shipping are permitted with positive whole quantities and required descriptions; per-line tax remains valid.

## Editing and persistence safety

Saved order rows are view-only in the generic editor. Inputs are read-only and edit/remove actions disabled. The save boundary also rejects changed or missing order lines, independently of DOM disabled attributes. Existing link-group helpers skip order rows. Clear All is blocked when saved orders exist, so it cannot remove orders through a generic history action. Whole-order editing/deletion is intentionally deferred to PHv2-02B.

The order adapter uses the existing save queue and `writeAuthoritativeStateSnapshot()` / `OMAXAtomicPersistence.save()` transaction, including exact revision/CAS, content, payload, protected-state, pump retention and source/prepared-state protections. It never replaces these functions or weakens their checks.

Before writing, wait for queued saves, require no pending unrelated edits, capture the document/backend/account/revision/local mutation version, and independently read the server with a read-only transaction. Compare current business state to that source; validate optional references. Append the entire order to a cloned authoritative state, preserving every unrelated field. An identical order ID/payload already present is verified as a no-op; conflicting IDs, incomplete orders or reused line IDs are rejected.

While the operation owns verification, the existing pending-intent flag prevents realtime adoption of an unverified echo. No draft lines enter live state or generic autosave snapshots. The queued writer rechecks both local evidence and exact remote/prepared state. Ordinary edits arriving during the operation fail those checks or prevent adoption rather than being overwritten.

Require an acknowledged completed write and its committed payload. A second independent backend read must equal that full payload, including revision and every unrelated field, with the same backend/account/local evidence. Only then adopt through the existing verified-adoption helper, update the local backup and display success. This follows the existing verified adoption/history initialization behavior; generic undo is not whole-order editing.

Definite no-write/permission/CAS/preflight failures keep the draft and IDs available. Unknown/missing/incomplete acknowledgements, timeouts, mismatched readback, or local changes after commit retain evidence and activate existing Recovery Mode/autosave suspension. The coordinator blocks further attempts and never blindly retries or rolls back a possibly committed order. Late timed-out reads cannot adopt. Backend reads are bounded to 15 seconds. Double Save is guarded both in the UI and coordinator; SDK retries operate on one frozen intent.

## Commands and results

`Test-Path package.json` returned False. No npm commands or dependencies installed.

```powershell
git fetch origin main codex/phv2-01c-purchase-history
git switch -c codex/phv2-02a-purchase-orders origin/codex/phv2-01c-purchase-history
node --test tests/purchase-orders.test.js tests/purchase-history-navigation.test.js tests/purchase-financials.test.js
```

The final focused run passed 86 tests. An initial PHv2-01C fixture expected an `orderId` line to remain editable; that fixture was changed to a standalone `lineId` record, and explicit order-lock tests were added. This is an intended create-only behavior change, not a relaxed guard.

```powershell
node --test tests/purchase-orders.test.js tests/purchase-history-navigation.test.js tests/purchase-financials.test.js tests/atomic-persistence.test.js tests/production-hardening.test.js tests/global-identity-repair.test.js tests/historical-import-readiness.test.js tests/historical-import-staging.test.js tests/weekly-cost-report-baseline.test.js tests/inventory-material-persistence.test.js tests/pump-baseline.test.js tests/polish01-hotkey.test.js tests/polish01d-dimensions.test.js tests/cjo02-persistence.test.js | Select-Object -Last 10; exit $LASTEXITCODE
```

**PASS: 523 tests, zero failures.** Includes 1,680 uneven allocation scenarios, immutable drafts, duplicate/collision checks, unchanged history/evidence, serializer preservation, real shared writer/CAS, SDK retries, permission/preflight failures, incomplete/lost acknowledgements, backend timeout/cache/path/value/unrelated-change failures, preserved local edits and reporting totals.

```powershell
$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'; node --test tests/purchase-orders.browser.cjs
```

**PASS: 5 tests including the parent (four browser flows).** Headless Edge, America/Chicago, fresh contexts, local disposable IndexedDB backend, external requests aborted, Firebase SDK absent. Covers allocation preview, one complete verified append, same-date orders, view-only history rows, full reload, Central Data Table line counts, Export Range download, Cancel, Add/Remove Item, integer/zero-cost validation, definite-failure retry with identical IDs, and uncertain-outcome recovery with no second writer call. A column-containment assertion protects the inventory selector layout.

Initial sandbox launch failed before test execution; the same test succeeded with browser launch permission. Initial fixture runs reused a same-document URL containing a hash and therefore retained old loaded state after seeding; the production comparator correctly rejected it. The fixture now performs a true reload. No production baseline checks were relaxed. Visual inspection found an oversized inventory selector; the scoped table styles corrected it. The final successful browser command also set `OMAX_PH_SCREENSHOT` to a new path under the existing untracked `artifacts/` folder; screenshots were visually inspected and are not committed.

```powershell
node --check js/purchaseOrders.js
node --check js/renderers.js
node --check js/views.js
node --check tests/purchase-orders.test.js
node --check tests/purchase-orders.browser.cjs
node --check tests/purchase-history-navigation.test.js
git diff --check
git diff origin/codex/phv2-01c-purchase-history -- js/core.js js/atomicPersistence.js js/purchaseFinancials.js
git status --short
```

Syntax/whitespace checks passed; shared-file diff is empty. Inspection used Git diffs, `Get-Content`, `rg` and read-only file/runtime checks.

The pre-existing CJO-04B/CJO-04C suites were also compared against a temporary `git archive 8a9e43f` snapshot of the exact stacked base using:

```powershell
node --test --test-reporter=tap tests/cjo04b-verification.test.js tests/cjo04c-readback.test.js
```

Both base and candidate: **51 tests, 24 pass, 27 fail; identical failing test names and counts**, asserted by an isolated Node comparison. Existing fixture errors include missing `ensureJobCategoryFolderOpen` / `stableStringifyForIntegrity`. These unrelated fixtures and product code were not changed.

## Remaining verification and risks

- No live Firebase, deployed security-rule, actual-account or production-record testing was performed. Verify one complete order save/reload in a dedicated Firebase test workspace before production use, including interrupted/concurrent sessions and existing recovery controls.
- Check the deployed UI at operator zoom, narrow widths, keyboard input and other browsers. The table scrolls horizontally on narrow screens. Check optional inventory/task links against real supported records.
- This is create-only. Orders cannot be edited/deleted as partial lines; whole-order correction needs PHv2-02B. Clear All is unavailable once orders exist. Older cached clients do not have these new UI guards; use the updated deployed app before entering orders.
- Drafts/IDs are session-local. After uncertain completion or a reload, inspect server evidence by the retained order ID before entering a replacement; never assume an unconfirmed order failed. Multiple intentionally separate orders on one date are valid.
- Large state remains subject to existing Firestore payload/protected-data limits. Monetary inputs require cent precision. Historical prices/decimal quantities are preserved without conversion.
- Reconcile the stacked PR with main after PHv2-01C merges; do not modify or merge #503 automatically.
