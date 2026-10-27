# COSTDATA-01G: final main integration and merge-readiness evidence

Repository: `pollywolly214-lgtm/OMAX`. Existing PR #519 and branch
`codex/costdata-01a`; no new PR or automatic production merge.

## Main integration

Starting feature HEAD: `806d4c24a7582785a841003e2221834681557b9f`.
Previous integrated main: `7285ac1e78d8387bb6beed3a64c1b843da8107db`.
Latest fetched main: **907dc69e450e274fa38d3ee001fdd8ca3772a8c2**.
Both main and feature refs were fetched again after testing and had not advanced.
The final feature HEAD and head-matched hosting/check status are recorded in the
updated PR description and delivery report, after this integration is committed.

Nine main commits were incorporated:

| Merged PR | Feature commits | Main merge |
| --- | --- | --- |
| #522, RFS-01 | `ba5f11f` | `0c11b0f` |
| #523, RFS-02/02B | `8964a43`, `471982b` | `039688f` |
| #521, MHIST-01A–01C | `7d0d60c`, `b145455`, `927394e` | `907dc69` |

Inspected incoming changes in core persistence, authoritative snapshot adoption,
maintenance calendar/history, identity, cancellation, protected-state coverage,
archive verification, renderers and relevant test harnesses before merging.
Used `git merge --no-ff --no-commit origin/main`, not a rebase or replacement PR.

There was **one textual conflict block in `js/renderers.js`**, the Settings
History action. COSTDATA's older action read `allMaintenanceDataTable` to avoid
the selected financial period. Main replaces that modal with
`openMaintenanceTaskHistory(meta.task)`, backed by exact authoritative calendar
and retained history identities. Retained the newer viewer and its safe
navigation/archived-history behavior; verified that January history remains
available while Cost Analysis is on 30 days. The original all-time financial
collection remains available to other consumers. No entire file was accepted
wholesale from either branch.

Core auto-merged. Relative to main, core retains only the two established
COSTDATA canonical date-only and focused financial-period render-deferral fixes.
Calendar, calendar-integrity/cancellation modules, global identity validation and
archive module match main exactly. COSTDATA's cost normalizer, financial
reconciliation, computations, purchase helper, views and CSS match the starting
feature HEAD exactly. The only application resolution made for 01G was the
reviewed History action; no additional application defect required correction.

## Preserved behavior and semantic interactions

| Phase / protection | Integrated evidence |
| --- | --- |
| 01A historical collection | Original source identities/snapshots, complete-cost reconciliation, receipt projection, date handling and daily aggregation tests pass. |
| 01B period/refresh consistency | All-Time/YTD/30/90/182/365-day changes, rapid controls, delayed reads/snapshots, focused selector, preserved drafts, navigation/reload pass. |
| 01C maintenance provenance | Distinct same-day events, retained instance defaults, supported legacy/V2 mirrors and scheduled-only reminders remain correct; unknown inputs stay unknown. |
| 01D archive FK | One exact archived inventory target is accepted; malformed/ambiguous references remain blocked. Exact-ID restoration retains source history and inventory links. |
| 01E financial evidence | Canonical contribution formulas, Modeled Cutting Job Contribution labels, defaults/missing-input disclosures and separate duplicate hypotheses remain; no source rate is corrected. |
| 01F incomplete markers | Dated partial parts/unknown-event glyphs and all identities remain accessible; markers never enter complete totals/averages/forecasts. Responsive tooltips/list and configured settings remain intact. |
| RFS-01 | Calendar completion/date changes verify captured target and independent acknowledged revision; failed/uncertain outcomes remain protected. |
| RFS-02/02B | Ordinary writes independently verify committed state; cancellation appends exact accountability evidence while preserving history. Stale requests, lost acknowledgements, bad readback and unrelated source changes remain blocked. |
| MHIST | Active, cancelled, moved, removed/skipped and archived evidence remains distinct; history navigation targets exact roots and keeps the viewer open when no active chip can be reached. |
| MDEL | Archive/restore conserve full payloads, original IDs, references and cancellation evidence; valid operations do not falsely trigger Recovery Mode. |

Four new combined unit/integration cases exercise actual core/CAS cancellation,
archive and exact-ID restoration against COSTDATA cost normalization and marker
projection; period-independent MHIST history; and conflict/indeterminate-save
protection. A new full-browser case uses the actual application for the same
sequence, compares costs/markers/settings before and after, verifies inventory
and provenance retention, and reloads the restored state.

The initial combined-browser fixture omitted inventory links for some synthetic
tasks. Entering Settings invoked its pre-existing inventory-seeding path. Filled
those synthetic links before seeding, then verified zero display saves and exact
source/backend equality. This was a fixture correction; no inventory seeding,
production data or integrity gate was bypassed or changed. Closed Settings
disclosures were opened before the real History button was clicked.

## Required and broad tests

No `package.json`, repository AGENTS.md or checked-in GitHub Actions workflow
directory exists. Commands ran from the actual integrated worktree unless a
baseline directory is explicitly named. Browser tests used headless Edge,
synthetic disposable localhost backends and blocked external requests. No
production Firebase read/write, reset, migration or browser-storage clearing was
performed. Live user data/exports and generated private reports are not committed.

### Required unit/integration/safety selection: 879 pass, zero fail/skip

```powershell
node --test --test-concurrency=4 --test-reporter=tap tests/costdata-01a.test.js tests/costdata-01c.test.js tests/costdata-01d.test.js tests/costdata-01e.test.js tests/costdata-01f.test.js tests/costdata-01g.test.js tests/financial-reconciliation.test.js tests/purchase-financials.test.js tests/purchase-orders.test.js tests/cut-cost-feedback.test.js tests/cut-cost-cumulative-hours.test.js tests/ach-average-cut-hours.test.js tests/maintenance-history-import.test.js tests/recovery-import.test.js tests/cjo04-review.test.js tests/firebase-two-computer-baseline.test.js tests/inventory-material-persistence.test.js tests/mdel01-task-deletion.test.js tests/mdel01b-verification.test.js tests/mdel01c-restoration.test.js tests/cje-source-reconciliation.test.js tests/cje-completed-duration.test.js tests/cutting-job-import.test.js tests/cji-02g-cutting-import-identities.test.js tests/rfs01-save-reliability.test.js tests/rfs02-save-audit.test.js tests/rfs02b-cancellation.test.js tests/maintenance-history-reconciliation.test.js tests/mhist01c-integration.test.js tests/mhist01c-diagnostic.test.js tests/mcf-01-maintenance-calendar.test.js tests/atomic-persistence.test.js tests/cjo06-archived-identity.test.js tests/firebase-storage-bucket-config.test.js tests/inventory-identity.test.js tests/inventory-identity-repair.test.js tests/global-identity-repair.test.js > artifacts/costdata-01g-required-targeted.tap
```

The final standalone rerun of `tests/costdata-01g.test.js` also passes **4/4**
after completing the synthetic inventory links.

### Required browser coverage: 51 pass, zero fail/skip

```powershell
$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node --test --test-concurrency=2 --test-reporter=tap tests/costdata-01a.browser.cjs tests/costdata-01b.browser.cjs tests/costdata-01c.browser.cjs tests/costdata-01d.browser.cjs tests/costdata-01f.browser.cjs tests/financial-reconciliation.browser.cjs tests/cut-cost-feedback.browser.cjs tests/rfs01-save-reliability.browser.cjs tests/rfs02-save-audit.browser.cjs tests/rfs02b-cancellation.browser.cjs tests/mhist01c-integration.browser.cjs tests/maintenance-history-reconciliation.browser.cjs tests/mdel01-task-deletion.browser.cjs tests/mdel01c-restoration.browser.cjs tests/maintenance-new-one-time.browser.cjs > artifacts/costdata-01g-required-browser.tap
node --test --test-reporter=tap tests/costdata-01g.browser.cjs > artifacts/costdata-01g-new-browser.tap
```

The combined run passes **50/50**, and the new integration case passes **1/1**.
Includes desktop/mobile viewport and resize behavior, chart timeline/financial
period controls, legends/hover/tap/event list, saved layout/config preservation,
navigation, document reload and no new JavaScript errors. There is no separate
chart-zoom control beyond the existing timeline controls; native browser zoom
was not independently exercised.

### Entire repository unit suite and fresh main baseline

```powershell
$costdataAllTests=@(rg --files tests -g '*.test.js')
node --test --test-concurrency=4 --test-reporter=tap $costdataAllTests > artifacts/costdata-01g-broad-integrated-final.tap
git archive --format=zip --output=artifacts/costdata-01g-main-baseline.zip 907dc69e450e274fa38d3ee001fdd8ca3772a8c2
Expand-Archive -LiteralPath artifacts/costdata-01g-main-baseline.zip -DestinationPath artifacts/costdata-01g-main-baseline
```

Integrated final tree: **1,942 pass / 10 fail / 1,952 total**. From the fresh
baseline directory, the same test-discovery and `node --test --test-concurrency=4`
command gives **1,893 pass / 10 fail / 1,903 total**, logged to
`../costdata-01g-broad-main.tap`. No tests were skipped. Automated comparison
confirms identical failing names; inspected errors have the same causes:

- Three `cjo02b-safety` extraction failures: two missing
  `syncNewCuttingJobSaveControls`, one repair-UI disabled-state expectation.
- Six `cjpc01-manual-paths` extraction/harness expectations for Jobs add/edit,
  category ownership, fractional finance values and draft minute capture.
- One `projects-accuracy` historical-duration calculation-copy expectation.

These failures are not introduced by 01G, are not repaired here, and are not
reported as passes. No critical COSTDATA/RFS/MHIST/MDEL test is among them.

### All remaining repository browser files

```powershell
node --test --test-concurrency=2 --test-reporter=tap tests/cjcat01c.browser.cjs tests/cj-notes-persistence.browser.cjs tests/cjcd01b-calendar.browser.cjs tests/cje-completed-duration.browser.cjs tests/polish01.browser.cjs tests/polishv2.browser.cjs tests/polish01d.browser.cjs tests/projects.browser.cjs tests/purchase-orders.browser.cjs tests/water-quality.browser.cjs > artifacts/costdata-01g-additional-browser.tap
```

**68 pass / 4 fail / 72 total**, including a failed parent for three POLISHv2
scenarios. All 26 browser test files in the final repository were exercised
across these runs: **119 pass / 4 fail / 123 reported tests**.

Fresh untouched main baseline, run from its directory:

```powershell
node --test --test-reporter=tap tests/polishv2.browser.cjs > ../costdata-01g-polishv2-main.tap
```

Main reproduces **17 pass / 4 fail / 21 total**, the same three scenario names
and parent. Two assert that historical category edits preserve the old derived
`efficiency` cache, while the saved canonical cache has `gainLoss:155`, financial
hours and totalProfit instead of the fixture's stale zero gainLoss. The third
calls `inputValue` on the non-input `#jobProjectNumber` element. These are
independently reproduced baseline assertion failures, not a newly attributed
integration failure. Other category, notes, calendar, contribution-duration,
project, purchase-order, RPM, water-quality and responsive browser cases pass.

### Static/data-safety checks

```powershell
$costdataJs=@(git diff --cached --name-only | Where-Object { $_ -match '\.(js|cjs)$' })
foreach ($costdataFile in $costdataJs) { node --check $costdataFile }
git diff --check
git diff --cached --check
& 'C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/check_binaries.py
```

Syntax, whitespace and tracked-file binary-policy checks pass. Reviewed staged
paths contain only main integration, this report and the synthetic 01G tests;
no private exports, generated reports, credentials or test artifacts are staged.

## Hosting checks, remaining limits and decision boundary

GitHub/Vercel checks must be read against the **final pushed HEAD**, not the old
01F commit. Their observed results and final HEAD are recorded in the PR's 01G
status section after push. This repository has no checked-in Actions workflow;
local regression results are separate evidence from Vercel deployment status.

The user's authenticated October 26 verification of revision `1792792579790`
is a historical reference for 01F, not a fixed expected population or amount.
No production records or formulas were manipulated to reproduce those numbers.
The latest production population and authenticated final integration preview
were not independently read in this task. A brief final authenticated preview
smoke check of healthy Recovery/autosave state, costs/markers, History and normal
calendar interactions remains advisable before the user merges. Do not create
or remove production events merely to test this.

No known blocking integration regression or unresolved data-integrity failure
was reproduced. The known unrelated main-baseline test debt remains visible
above. Local validation does not prove actual invoices, complete business
profitability, production network/device fault behavior or current data counts.
The final merge recommendation is conditional on the head-matched hosting/check
results recorded at delivery; no PR merge is performed by this task.
