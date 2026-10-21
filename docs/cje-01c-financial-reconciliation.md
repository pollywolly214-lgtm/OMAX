# CJE-01C — Financial reconciliation

Latest source-based findings, pair decisions, hypothetical totals and CJE-01H validation: [CJE-01H source reconciliation](cje-01h-source-reconciliation.md). Earlier sections below describe their respective implementation stages.

Cost Analysis now builds a read-only financial report from loaded `completedCuttingJobs`, corrected maintenance event cost rows already produced by CCR, and Purchase History's `receiptTrackerWeeks`. The Central Data Table is a presentation, not a new financial ledger. No records, defaults, schema, persistence guards or job-entry calculations are rewritten.

The existing `computeCuttingJobProfit()` remains unchanged. Both Cost Analysis and Past Cutting Jobs call the shared `OMAXFinancialReconciliation.selectJobs()` with the same session-only financial period. All-Time is the default; 1W/1M/3M/6M/1Y mean 7/30/90/182/365 inclusive calendar days through today. This is a separate control from the unchanged machine-hour efficiency snapshot and saved CCR calculation window. Job category/search filters are explicitly additional on Past Cutting Jobs.

Valid `completedAtISO` business dates are required, preserving the timestamp's supplied date rather than shifting it to UTC. Missing/invalid dates, future completions and non-finite financial calculations are excluded with reasons. No due/start/import fallback is used. Distinct actual cuts remain included regardless of matching name/project/date; even repeated stable IDs are retained and flagged rather than silently merged. Missing IDs no longer exclude an otherwise eligible job simply because a settings link cannot be generated. Excluded problem records remain available in Past Cutting Jobs under a separate review section with the existing editing controls.

Net profit remains `gross revenue - failed-cut revenue reduction - runtime expense - material expense`, summed without rounding until display. Canonical fallback rates, zero rates, absent Hours Taken/material inputs, unknown failure percentages, importer-default provenance, stale cached financial values and repeated/missing IDs are reported. Missing failure information is labeled unknown even when canonical reproduction uses 0%. Invalid individual results are excluded; aggregate overflow is unavailable, not zero.

The expandable Financial Breakdown shows included rows and exact per-job components, positive/negative/zero counts, net/average profit, the ten largest losses, field warnings, exclusions and a bridge to the old all-time card eligibility using the same currently loaded records. The bridge explains population changes; it does not claim to reproduce an earlier screenshot or fetch production data separately. Cost Data Center net labels, category profitability and chart series follow the financial period. Chart controls may narrow that period further. Weekly reports remain explicitly scoped to their own labeled weeks. The temporary calculator only changes its own what-if output; it cannot overwrite canonical table values or summary totals.

Purchases are shown as recorded Purchase History spending, with unit cost × quantity + shipping + tax from the existing purchase helper. They are not assumed to be maintenance-only or verified paid cash. Incomplete purchase rows are disclosed and excluded from the known subtotal. Maintenance costs distinguish occurrence-specific recorded inputs from configured/default estimates; labor remains modeled at $30/hr, and incomplete event totals are withheld. Existing annual and remaining-year maintenance forecasts remain separate from the selected historical period. Calendar-day counting fixes the DST-sensitive remaining-year projection.

CCR now calculates new-job runtime rates from maintenance plus garnet, but only the numeric rate is saved on a job. Neither historical/manual rate composition nor complete revenue/expense coverage is established. Therefore **Net Waterjet Financial Impact is Unavailable** with its coverage explanation. Maintenance, purchases and annual forecasts are not subtracted again. No opportunity cost from unused capacity is introduced.

## Verification

No root `package.json` exists; this repository uses Node's built-in test runner. Applicable commands:

```powershell
node --test tests/financial-reconciliation.test.js tests/cjprofit01-calculation.test.js tests/cjprofit01b-downstream.test.js tests/cjprofit02-failed-cut.test.js tests/cjprofit03-ui.test.js tests/cut-cost-feedback.test.js tests/cut-cost-cumulative-hours.test.js tests/purchase-financials.test.js tests/weekly-cost-report-baseline.test.js tests/cfr06-cutting-job-ui.test.js tests/completed-job-provenance.test.js tests/cjcd01b-calendar.test.js
node --test tests/financial-reconciliation.browser.cjs
node --check js/financialReconciliation.js
node --check js/renderers.js
node --check js/views.js
node --check tests/financial-reconciliation.test.js
node --check tests/financial-reconciliation.browser.cjs
git diff --check
```

The browser command uses an existing Playwright installation (`OMAX_PLAYWRIGHT_PATH` when needed) and Edge on Windows. It creates a fresh disposable profile, serves localhost fixtures, blocks every external request, traps save/backup/mutation calls, and verifies that loaded records and the disposable backend are unchanged while reviewing the report, changing periods, trying calculator overrides and navigating between pages. It checks desktop and mobile layouts, retained future-record editing access, matching category/card/row totals and separate duplicate cuts. Optional screenshots use `OMAX_CJE_SCREENSHOT_DIR`.

CJE-01C results on October 20, 2026: **122 targeted tests passed, 0 failed; 1 browser workflow passed, 0 failed; 5 syntax checks passed; `git diff --check` passed.** Browser screenshots were inspected locally. The original sandbox could not launch Edge; the passing test ran outside that sandbox using the same localhost-only fixture isolation.

Controlled financial cases retain the CJPROFIT values +165, +424 and −50, totaling +539. The browser fixture has two separate identical cuts and a loss in the 1W period, totaling +280; 1M totals +704. Production's approximate −16,757 / −26,211 and the original 172-job population cannot be verified without the loaded production records. No live production browser or Firebase verification was performed.

## Operator visual checks after deployment

- Select each financial period and compare exact boundaries, included jobs, components and totals with Past Cutting Jobs using All Jobs and no search filter.
- Open Financial Breakdown and review actual negative contributors and missing/defaulted fields in the loaded production population.
- Confirm occurrence-based costs, incomplete/estimated events, recorded purchases and annual forecasts have distinct labels.
- Confirm the combined result explains why it is unavailable, and calculator overrides leave canonical job/table totals unchanged.
- Check the collapsed/expanded section, horizontal table scrolling, review records and existing edit/cancel controls at desktop and narrow mobile widths.

## CJE-01D — Final consistency review of PR #518

- **Expense/hour period:** the denominator was already restricted by `completedJobsList` before constructing `jobSeries`; an all-time denominator mismatch was not confirmed. Both sides are now explicitly selected financial-period series, with names `totalSpendInFinancialPeriod` and `totalCutHoursInFinancialPeriod`. A regression with an old 1,000-hour job and a $10,000 old purchase proves neither can enter the selected-period ratio. The maintenance/CCR rate remains on its existing separately labeled saved window.
- **Previous-card population:** corrected the missing legacy nonempty-text-name check. The comparison reproduces the original mapped completion-date text, name fallback and generated settings-link predicate. Blank/null names receive the old fallback, while truthy whitespace or non-text names fail the old predicate. Empty/zero IDs still pass if the old link did; textual invalid/future dates remain included in the old comparison. The previous reducer counted non-finite jobs while omitting their net from its sum; this is reproduced separately from current stricter qualification. Previous totals use descending completion-date text order, and population-change explanations identify name-related additions. A regression executes the retained old mapper/filter/reducer with the new API disabled and compares its count and net directly.
- **Local midnight:** Cost previously used `ymd(new Date())`, whose shared date utility derives UTC parts, while Past Cutting Jobs used local calendar today. Cost now captures one local financial date and reuses it for initial selection, Data Center selection and the final report. Chart job date keys preserve the supplied completion business date, including in UTC+14. The shared date utilities and utilization snapshot are unchanged.
- **Preserved scope:** canonical CJPROFIT, production records, Firebase, persistence/recovery protections and expense-coverage policy are unchanged. Net Waterjet Financial Impact stays unavailable. There are no additional UI controls or layout changes.

Final CJE-01D validation: **128 targeted tests passed, 0 failed; 2 disposable browser workflows passed, 0 failed (America/Chicago and Pacific/Kiritimati); 4 changed JavaScript files passed syntax checks; `git diff --check` passed.** Commands use the same targeted test list above and the extended `financial-reconciliation.browser.cjs`. Browser checks compare row identities and canonical totals across all three views before/after local midnight, preserve separate duplicate cuts, simulate midnight crossing inside a single Cost render, and assert zero save calls or loaded/backend record changes.

PR #518 is ready for production verification; no live production totals or authenticated browser behavior have been independently verified, and this review does not authorize a merge.

## CJE-01F — Expense signs, loss evidence and selected-window usage average

Confirmed presentation errors:

- Cost Overview and the expense section of Financial Breakdown formatted positive internal expense magnitudes as positive contributions. Purchases, event costs and annual/remaining-year projected expenses now display negative signs. Profit keeps its canonical sign; negative profit is never reversed. Financial cards distinguish positive earnings from negative contributions. Internal expense values and the canonical profit calculation are unchanged, so nothing is subtracted twice.
- The efficiency modal's **Total run cost** actually read `efficiencyTotals.cost`, which sums runtime **plus material**. It is now labeled **Modeled expense (runtime + material)**, with separate runtime and material subtotals and matching eight-column job tables in the modal and Data Center. Consequently, if production's $33,395 came from this field, $33,395 / 72 ≈ $463.82 is total modeled expense per job hour, not evidence of a $463.82 runtime rate. The runtime-only weighted rate is runtime expense / the exact same jobs' Hours Taken.
- Average Usage/Day called the global Dashboard average, independent of the selected snapshot window. The displayed snapshot average now uses authoritative cumulative `totalHistory` endpoints selected by the existing CCR resolver. Dashboard Average Cut Hours/Day configuration/helper and average-goal mode remain unchanged.
- CCR's banner used a UTC-derived date in UTC+14 while financial reports used local today. The read-only CCR UI and breakdown now use the same captured local analysis date. Its saved window remains separate from the selected financial period.

The expanded Financial Breakdown reads the application's loaded records and shows effective charge/cost rates, raw rate values used, saved/legacy/fallback sources, retained original import cells, grouped runtime expense by effective rate/source, imported-job counts, rates exceeding adjusted charge rates, weighted runtime and charge rates, and the ten largest losses with their revenue/runtime/material/failure bridge. Runtime expense is hours × absolute effective cost rate; it excludes material, purchases, event subtotals and annual forecasts. A separate $45/hr comparison preserves each job's charge/failure/material inputs. The existing calculator can also override charge and narrow its own financial range; neither changes saved rates or canonical results.

The cutting-job importer materializes blank charge/cost cells as $200/$45 per hour. The canonical helper uses job fields, then legacy efficiency fields, then $250/$30 fallbacks. Those fallback cost rates alone cannot explain a true runtime-only weighted rate near $464/hr. High saved/legacy rates, material expense, failure reductions and revenue/default issues must be distinguished using the new row evidence. A blank original import rate does not prove the current saved rate was never edited.

**Production loss remains unverified.** Browser inventory exposed no authenticated production tab, and no production rows were fetched. The supplied 172 jobs, 72 hours, $33,395 and −$16,756.81 cannot establish whether source rates/costs are legitimate, incorrect or mixed populations. Controlled regressions prove both possibilities: a runtime-only $33,395 example produces the supplied loss without a sign bug, while a different 72-hour example totals $33,395 with a $45/hr runtime rate and $30,155 material expense. Both are synthetic arithmetic, not recovered production records. No historical values were corrected automatically.

### Snapshot denominator and deferred dependency

The average uses the latest valid cumulative reading on/before the requested start and the latest valid ending reading on/before the selected end or local today, whichever is earlier. Its denominator is **elapsed calendar days between those readings**, excluding the starting baseline date and including the ending date and weekends. Counter differences measure that interval; no missing daily logs are invented, no interpolation is applied, and multi-day deltas are not capped at 24 hours. A 30-day window with exact endpoint dates spans 29 elapsed days under this accepted baseline convention.

Sparse endpoints explicitly disclose an earlier baseline or stale ending reading and use the actual observed span's denominator. Selecting two windows with the same accepted endpoints can legitimately yield the same average; compressing those hours into the shorter requested window would be misleading. Missing/conflicting/decreasing endpoints withhold the average; valid zero movement displays zero. Dates use local calendar keys and UTC calendar arithmetic for elapsed days across DST.

The modal labels utilization dates independently of the financial what-if range. Actual Hours/target accumulation still uses existing daily-entry logic and can disagree with the cumulative average, especially for sparse/imported counters. Replacing that historical accumulation, its 24-hour clamp and any derived daily entries is deferred to a separate focused implementation. This PR does not rebuild or write daily history, alter target rules, or change Dashboard ACH configuration.

### Combined financial coverage

Current CCR is `(maintenance event parts + modeled labor) / measured machine hours + modeled garnet consumption at delivered price/lb`. Garnet refill material is excluded from event parts while refill labor remains included. The breakdown shows the current saved requested window, observed meter span, measured hours and maintenance/garnet/total rates, including incomplete/default warnings. Current CCR does not establish the composition of historical numeric rates saved on jobs.

Full Net Waterjet Financial Impact remains unavailable because loaded records do not establish per-job rate composition/effective dates, consumed-purchase allocation versus inventory/material/maintenance, overlap with event costs, complete other operating expenses, or reconciled invoice/payment revenue. Blockers reflect the selected loaded jobs, purchases and maintenance events. The card and breakdown explicitly display **interim modeled Cutting Job Net Profit** for the selected period. Resolving the blockers requires an expense/revenue reconciliation and component allocation, not another subtraction of purchases, maintenance or annual projections. No supported complete net figure was found in the present schema.

### CJE-01F validation and production verification

No `package.json` exists in this worktree. Final targeted command:

```powershell
node --test tests/financial-reconciliation.test.js tests/cje-snapshot-average.test.js tests/ach-average-cut-hours.test.js tests/ach-edit-logged-hours-noop.test.js tests/cjprofit01-calculation.test.js tests/cjprofit01b-downstream.test.js tests/cjprofit02-failed-cut.test.js tests/cjprofit03-ui.test.js tests/cut-cost-feedback.test.js tests/cut-cost-cumulative-hours.test.js tests/purchase-financials.test.js tests/weekly-cost-report-baseline.test.js tests/cfr06-cutting-job-ui.test.js tests/completed-job-provenance.test.js tests/cjcd01b-calendar.test.js
node --test tests/financial-reconciliation.browser.cjs
```

Results: **165 targeted tests passed, 0 failed; 2 isolated Edge browser workflows passed, 0 failed (Chicago and Kiritimati); 8 changed JavaScript/test files passed `node --check`; `git diff --check` passed.** Syntax files: `js/computations.js`, `js/financialReconciliation.js`, `js/renderers.js`, `js/views.js`, `js/cutCostFeedbackUi.js`, `tests/financial-reconciliation.test.js`, `tests/cje-snapshot-average.test.js`, `tests/financial-reconciliation.browser.cjs`.

Browser checks cover expense signs, interim subtotal, cost components, eight-column financial rows, independent utilization/calculator controls, 1M/3M averages from cumulative-only readings, Chicago/UTC+14 midnight boundaries, unchanged canonical totals across pages and separate duplicate cuts. Disposable localhost fixtures block every external request, verify Firebase is absent, trap save/backup/mutation functions and compare all loaded source records and the disposable backend before/after. No production records, maintenance history, Firebase schema or persistence/recovery protections were modified. Desktop and modal fixture screenshots were inspected; narrow-mobile width checks passed. The full repository suite and live authenticated production workflows were not run.

Before merge, verify the actual production cohort and period: compare runtime versus material totals, inspect the largest losses and saved/imported/fallback rates, compare the current CCR components, check 1M/3M accepted meter endpoints/denominators, and confirm signs/forecasts on desktop and mobile. The changes are ready for that production verification, not an assertion that the production losses are legitimate. Keep PR #518 open and unmerged.

## CJE-01G — Completed-job duration reconciliation and duplicate-import audit

### Root cause and scope

User-supplied read-only production diagnostics identify 172 completed jobs, including 155 with zero financial hours despite positive recorded actual time (88 `616-CUT`, 67 `CUTPDF`). C074, Blanco Shoes, July 28, has 12.3 recorded actual hours corroborated by source minutes but previously produced a material-only −$863.47 result. These are supplied production findings; no production export, Firebase document or authenticated production browser was fetched in this implementation.

The root cause is a calculation-source mismatch: `computeCuttingJobProfit()` used only `estimateHours`, while the importer intentionally preserves actual cutting minutes separately in `actualHours`, cumulative `manualLogs[].completedHours` and `importProvenance.actual_cut_minutes`. A zero estimate therefore generated no modeled revenue or runtime expense and deducted only material. The importer and original storage contract remain intact.

`js/computations.js` now resolves completed-job financial duration at read time. Revenue, failed-cut reductions, runtime rates, material quantities/costs and the business formula are unchanged. No source field, imported record, cached efficiency result or historical value is rewritten. The original −$16,756.81 cannot be treated as reliable overall historical profitability until duration mismatches and possible duplicates have been reviewed; this change does not invent an approved replacement production total.

### Conservative duration rule

- A valid completion date is required. Active-job calculations retain the original duration behavior.
- Positive original financial hours are preserved. Zero, missing or invalid financial hours may use a positive, finite recorded `actualHours` or the latest valid cumulative manual-log total; `actualHours` is not required when authoritative manual logs exist.
- Manual logs are sorted by their valid business dates through completion and are cumulative, never summed. Conflicting same-date totals, decreases, invalid values/dates, post-completion logs and mismatched import identities require review.
- All available actual, terminal manual-log and retained imported cutting-minute values must agree within 0.000001 hour. Explicit zero evidence is not silently discarded in favor of positive evidence. Invalid or contradictory evidence withholds the replacement and reports the reason.
- Imported minutes corroborate existing actual/log time; source minutes alone do not trigger substitution. Genuine zero or missing actual time preserves the original zero financial result.
- Priority/backlog and required-daily scheduling explicitly retain original estimate-based duration. The separate utilization snapshot, daily machine-hour accumulation and Dashboard ACH configuration are untouched.

The **155 reported production records are candidates**, not an unconditional migration count. The existing Audit button computes the actual resolved/withheld counts from the current loaded records and breaks them down by import family. A synthetic 172-record fixture with consistent evidence resolves all 155 (88 + 67), preserving all original `estimateHours` values; it is not an independent confirmation that every production record passes the rule. Any contradictory or invalid production durations remain for manual review. Positive estimate-versus-actual differences are preserved and listed for review rather than changed automatically.

### Existing audit and financial views

The existing reviewed-import dialog now labels its button **Audit Cutting Jobs (read-only)**. It retains the category/numbering audit and adds an independent financial panel, including when category repair is blocked. The existing repair action is labeled **Repair categories / numbering**; no financial repair, migration or new write action is added. The read-only diagnostic is also available as `auditCuttingJobHistoryRepair().financial`.

The panel reports original versus resolved hours, evidence and conflicts, import family/IDs, stable job IDs, cut numbers, supplied/source dates and names, project, material unit cost/quantity/expense, available provenance, original estimate-only net, updated modeled net and modeled change. Diagnostic totals include all loaded completed rows before financial date/period exclusions and are explicitly labeled as unapproved. Missing completion dates are reported and do not allow actual-time substitution.

Cross-import candidates require the same completion date/project and consistent positive recorded actual duration. Name-matching one-to-one candidates are distinguished from ambiguous groups. Same-import repeated cuts remain separate. Material unit costs, quantities and total expense differences are flagged even when two products happen to match. The ambiguous June 29 ATM Person Door example remains a five-record group (3 CUTPDF / 2 Excel), with six possible links and at most two simultaneous pairings; no pairing is chosen. The reported 38 production candidate groups/up to 39 pairs require source review; these numbers do not authorize deleting 39 records.

Every candidate remains in the modeled total. No duplicate-adjusted profit is inferred because candidates may be legitimate repeated cuts and differing material costs make a proposed retained record consequential. Duration conflicts and cross-import candidate warnings appear in Financial Breakdown and Cutting Jobs. Corrected hours flow through the shared helper into Cutting Jobs, Cost Analysis, Data Center, category totals and the breakdown. Past Jobs total/average summary values now preserve cents for exact comparison. C074's editor still opens with its original zero estimate and explains its separate resolved financial duration; edit/cancel cannot silently normalize it.

The previous-card comparison retains the original estimate-only calculation separately from current resolved financial results. Purchases, maintenance and forecasts remain separate; maintenance is not subtracted again. Full Net Waterjet Financial Impact still requires the cost-allocation/ledger evidence described in CJE-01F.

### CJE-01G verification

No `package.json` exists. Exact targeted command:

```powershell
node --test tests/cje-completed-duration.test.js tests/financial-reconciliation.test.js tests/cje-snapshot-average.test.js tests/ach-average-cut-hours.test.js tests/ach-edit-logged-hours-noop.test.js tests/cjprofit01-calculation.test.js tests/cjprofit01b-downstream.test.js tests/cjprofit02-failed-cut.test.js tests/cjprofit03-ui.test.js tests/cut-cost-feedback.test.js tests/cut-cost-cumulative-hours.test.js tests/purchase-financials.test.js tests/weekly-cost-report-baseline.test.js tests/cfr06-cutting-job-ui.test.js tests/completed-job-provenance.test.js tests/cjcd01b-calendar.test.js tests/cji02-history-repair.test.js tests/cutting-job-import.test.js tests/cji-02g-cutting-import-identities.test.js tests/atomic-persistence.test.js tests/recovery-import.test.js tests/import-selective-rollback.test.js
node --test tests/cje-completed-duration.browser.cjs tests/financial-reconciliation.browser.cjs
```

Final results: **279 Node runner entries passed, 0 failed; 3 isolated Edge browser workflows passed, 0 failed; 8 changed JavaScript/test/fixture files passed `node --check`; `git diff --check` passed.** The Node total includes the legacy repair/import script entries, which separately report 15 and 26 passing internal cases. The new duration/audit suite reports 17 passing cases. Syntax files: `js/computations.js`, `js/core.js`, `js/financialReconciliation.js`, `js/renderers.js`, `js/views.js`, `tests/cje-completed-duration.test.js`, `tests/cje-completed-duration.browser.cjs`, `tests/fixtures/cje-completed-financial.js`.

Cases include C074-shaped evidence, positive manual logs without actualHours, nested source minutes, contradictions, genuine zero, normal manual completion, active/scheduling preservation, repeated legitimate cuts, one-to-one and ambiguous cross-import candidates, differing material inputs, invalid/decreasing/post-completion time, missing completion dates, source immutability, escaping and the full synthetic 172/155/88/67/38/39 structure. Assumed fixture rates/material amounts are test inputs and must not be presented as recovered production values.

Browser checks run only against disposable localhost fixtures with every external request blocked and Firebase absent. They compare exact resolved hours/net across Cost/Past Jobs/Data Center, preserve all 172 rows, exercise the existing Audit button and ambiguous groups, check desktop/mobile scrolling, and open/cancel C074's editor with stored estimate 0. Save/backup/mutation traps, complete loaded business-collection comparisons (including non-enumerable importer-state getters) and disposable backend comparisons detect no writes or source changes. Earlier financial/period/midnight/expense-sign/calculator-isolation workflows still pass in Chicago and UTC+14. Screenshots of the audit were inspected. No production migration, import, deletion, Firebase write or business-data repair was performed; save/revision/CAS, backup and recovery paths remain unchanged and their targeted regressions pass.

Before an approved historical total: run the new audit on loaded production records; verify the actual supported-duration count and C074's source evidence; resolve all duration conflicts; establish which cross-import candidates are distinct cuts versus genuine duplicate imports; reconcile differing material/rate/failed-cut inputs against source evidence; then compare the same financial period across views. Any historical business-data correction needs a separate explicit reviewed action with the existing protections. Complete net waterjet impact additionally needs expense coverage/allocation and ledger reconciliation. The full repository suite and authenticated production workflows were not run. PR #518 remains open for production verification and must not be merged automatically.
