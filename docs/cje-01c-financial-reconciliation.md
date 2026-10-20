# CJE-01C — Financial reconciliation

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
