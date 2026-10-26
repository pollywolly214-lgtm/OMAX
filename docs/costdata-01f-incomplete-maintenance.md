# COSTDATA-01F: incomplete historical maintenance markers

Continues draft PR #519 on `codex/costdata-01a`, starting at
`881fd6eb7bb19c9492bf758282bd8ead9e21f77d`. No new PR, production migration or
automatic merge. The prior main integration and COSTDATA-01A–01E fixes remain.

## Finding and display plan

The supplied production findings at revision `1792792579790` describe present
historical records with incomplete cost inputs, rather than necessarily missing
Firebase history. The complete-cost filter deliberately excludes those rows from
the blue expense series. Existing normalization preserves nullable parts/duration
in `costFields`, even though internal numeric fields also contain zero placeholders.
Those placeholders must not be presented as known event costs.

Reviewed collection, nullable cost evidence, complete-series aggregation, shared
financial periods, forecasts, canvas drawing, hover/tap handling and responsive
layout before editing. Added an independent presentation layer, leaving the
complete blue series and financial calculations unchanged:

- Hollow amber diamonds plot known parts amounts as **partial costs only**, on
  the actual completion date. Configured amounts are labeled estimates; recorded
  occurrence inputs are labeled separately. A genuinely recorded zero parts
  amount remains distinct from unknown parts.
- Hollow amber triangles appear in a labeled **Cost unknown** event lane when
  parts are unavailable. They have no monetary y value or full cost; they are
  never plotted as zero-cost events. An unknown-only chart has no monetary-axis
  values. Known duration, when present, is disclosed.
- No lines connect incomplete markers. Dates extend the All-Time domain when
  needed. The existing Maintenance toggle controls both its line and markers;
  all shared period controls apply to the separate marker collection.
- Tooltips identify task/date, known parts/evidence, missing or known duration,
  and why full cost is unavailable. They state the exclusion from complete
  totals, averages and forecasts. Dense same-day tooltips show a bounded preview
  and direct users to the full event list.
- Same-date/same-parts glyphs cluster with a count; every normalized source event
  key is retained in cluster references and a chronological, keyboard-accessible
  event list. Tapping a marker opens that list. Distinct events are not merged
  into financial rows or summed into a new expense.
- Chart controls wrap at narrow widths. A stable tooltip width and explicit
  horizontal positioning prevent phone-width horizontal overflow. This is chart
  presentation only; layout preferences and saved cost settings are not changed.

The reconciliation evidence retains `chartIncluded` for complete monetary-series
inclusion and adds `incompleteMarkerIncluded` for the independent marker layer.
An event can therefore be visibly represented while its full cost stays unknown.

## Safety and financial invariance

`buildIncompleteMaintenanceMarkers` reads only normalized eligible incomplete
rows, their nullable fields and stable source identities. It never uses an
incomplete row's `totalCost`, `partCost` or `maintenanceHrs` zero placeholders to
infer known values. Partial marker `fullCost` is null; unknown marker `value` is
null. Deduplication applies only to repeated identical display source keys and
never edits source records.

Financial series, subtotals, averages, forecasts, CCR, modeled job contribution,
purchase spending and combined-impact calculations do not consume the new marker
array. Browser tests compare financial outputs with marker projection enabled
and disabled against the same loaded source state and assert exact equality.
`js/core.js`, `js/cutCostFeedback.js`, `js/financialReconciliation.js`,
`js/computations.js`, importers, identity validator and archive/write coordinator
are unchanged from the starting HEAD. CAS/revision, Recovery Mode and protected
data checks are preserved.

## Synthetic evidence and regression results

Six new unit checks cover nullable evidence versus zero placeholders, recorded
versus configured parts, same-day identities/clustering, unknown-only chart
rendering, invalid/complete/ineligible rows, toggling and dense 34-event clusters.

Two browser cases run in America/Chicago and Pacific/Kiritimati (UTC+14), using
the actual full application and synthetic disposable localhost backends. Every
external request is blocked. They verify:

- A synthetic counterpart of the supplied pattern: 84 normalized entries,
  50 complete events, 34 incomplete markers and 22 pre-June-18 incomplete events.
  Twenty early events have known parts/missing duration and two have neither.
  The earliest marker is January 2; the complete blue line still begins June 18.
  Complete subtotal is exactly the fixture's $2,000, without partial amounts.
- A separate fixture has nine selected incomplete events, including multiple
  independent same-task/same-day events and mirrors/duplicate-source coverage in
  unit checks, configured parts, recorded zero parts, unknown parts with known
  duration, a scheduled non-completion and a future event. Only eligible events
  display. Complete June/October costs remain $90/$45.
- All-Time, YTD, 365-, 182-, 90- and 30-day selection, actual canvas targets,
  hover tooltip contents, toggles, phone-width controls/tooltips, navigation and
  actual document reload. Every same-day identity remains available.
- Full financial outputs are identical with/without marker projection. Display
  makes zero save/mutation/backup calls. Loaded business data and disposable
  backend remain unchanged. Production-pattern display also preserves backend
  equality. Screenshots were inspected for mobile legibility.

These are synthetic reproductions of the reported relationship, not an
independent read or verification of that production revision.

## Exact commands

No `package.json` exists; no npm commands were selected. Commands ran from the
actual updated COSTDATA worktree. Logs and screenshots are untracked artifacts.

```powershell
node --test --test-reporter=tap tests/costdata-01f.test.js tests/costdata-01a.test.js tests/costdata-01c.test.js tests/costdata-01d.test.js tests/costdata-01e.test.js tests/financial-reconciliation.test.js tests/purchase-financials.test.js tests/purchase-orders.test.js tests/cut-cost-feedback.test.js tests/cut-cost-cumulative-hours.test.js tests/ach-average-cut-hours.test.js tests/maintenance-history-import.test.js tests/recovery-import.test.js tests/cjo04-review.test.js tests/firebase-two-computer-baseline.test.js tests/inventory-material-persistence.test.js tests/mdel01-task-deletion.test.js tests/mdel01b-verification.test.js tests/mdel01c-restoration.test.js tests/cje-source-reconciliation.test.js tests/cje-completed-duration.test.js tests/cutting-job-import.test.js tests/cji-02g-cutting-import-identities.test.js > artifacts/costdata-01f-combined-targeted-final.tap
```

**592 passed, zero failed/skipped.** Includes all prior targeted COSTDATA/MDEL,
maintenance-history, importer, financial and simulated Firebase safety checks.
The existing expense/hour extraction test was updated to load the real marker
helper and provide its empty source collection; its assertions are unchanged.

```powershell
node --test --test-reporter=tap tests/atomic-persistence.test.js tests/cjo06-archived-identity.test.js tests/firebase-storage-bucket-config.test.js tests/inventory-identity.test.js tests/inventory-identity-repair.test.js tests/global-identity-repair.test.js > artifacts/costdata-01f-safety.tap
```

**141 passed, zero failed/skipped.**

```powershell
$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node --test --test-concurrency=2 --test-reporter=tap tests/costdata-01f.browser.cjs tests/financial-reconciliation.browser.cjs tests/costdata-01a.browser.cjs tests/costdata-01b.browser.cjs tests/costdata-01c.browser.cjs tests/costdata-01d.browser.cjs tests/mdel01-task-deletion.browser.cjs tests/mdel01c-restoration.browser.cjs tests/cut-cost-feedback.browser.cjs > artifacts/costdata-01f-combined-browser-final.tap
```

**42 passed, zero failed/skipped** (26 top-level cases including nested tests).
Browser execution used approved headless Edge outside the sandbox. Final focused
checks also pass 35/35 unit and 2/2 browser cases. Responsive screenshots were
captured with `OMAX_COSTDATA_SCREENSHOT_DIR=artifacts/costdata-01f-screenshots`.

```powershell
$costdataFiles=@('js/renderers.js','js/views.js','tests/costdata-01f.test.js','tests/costdata-01f.browser.cjs','tests/fixtures/costdata-01f.cjs','tests/financial-reconciliation.test.js')
foreach ($costdataFile in $costdataFiles) { node --check $costdataFile }
git diff --check
git diff --cached --check
& 'C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/check_binaries.py
```

Syntax, whitespace and tracked-file binary checks pass. CSS behavior is verified
by actual browser layout/hover checks and screenshot review. The full repository
suite was not rerun; previously documented main-baseline extraction-harness
failures are not claimed as passes or repaired here.

## Changed paths and live verification

Application presentation: `js/renderers.js`, `js/views.js`, `style.css`.
Tests: `tests/costdata-01f.test.js`, `tests/costdata-01f.browser.cjs`,
`tests/fixtures/costdata-01f.cjs`, and the financial extraction-test context.
Documentation: this report.

Keep PR #519 draft and unmerged. On the deployed authenticated preview, confirm
the supplied production early events appear in the marker layer at their actual
dates, all same-day records are accessible, complete blue totals still agree with
the historical table's complete costs, and period/touch behavior works on the
intended devices. Production counts may change after the supplied revision.
No production data, historical rates, maintenance events or saved settings were
read from or written to Firebase during this change. Live network/device fault
workflows and actual production completeness were not independently verified.
