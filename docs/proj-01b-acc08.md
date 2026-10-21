# PROJ-01B-ACC08 — Prioritize failure-adjusted financial results

Updates existing open PR #517 from ACC07 commit `a725042c6ab918cb109ebf86474ace52ab8b3a1a`. At inspection the PR was open, mergeable and its Vercel checks were successful. This is a reporting/UI change with no production data access or edits. Do not merge automatically.

## Display and aggregation

The existing three financial cards are now **Modeled Cut Net**, **Average Net per Job** and **Average Net per Cutting Hour**. Their prominent amounts include current effective failure deductions. Each has a smaller, muted **No failures: $X** directly underneath, showing the existing unadjusted result. There are still four financial cards; Known Failure-Related Reduction stays negative and explicitly says its deduction is already included in adjusted net. Positive/negative primary amounts retain the established financial colors.

The existing aggregate `provisional.value` supplies adjusted net: unadjusted modeled net minus the authoritative helper's modeled failure revenue reductions. Two adjusted averages divide this value by the same eligible job count and applicable eligible cutting hours already used for hypothetical averages. Processing/material expenses and failure reductions are each deducted once. No shared financial formula or rounding policy changes.

Eligibility remains unchanged: a job must have supported duration, charge rate, processing rate, material cost and quantity to enter the financial result and either set of average denominators. Unsupported financial jobs leave both primary and hypothetical populations; the page notice and all three card notes explicitly mark the eligible subset as partial, not a complete project total. If any eligible job has an invalid failure/deduction, adjusted total and both adjusted averages remain unavailable rather than treating that deduction as zero. Hypothetical figures still show the pre-failure calculation for that same eligible population. Zero/overflowing hour denominators remain unavailable.

The table now labels **Failure-Adjusted Modeled Cut Net**, displays adjusted net in bold with loss/profit coloring, and puts the smaller muted no-failure amount below. Links, IDs, raw failure status and duration evidence remain unchanged. The redundant standalone adjusted total and standalone unadjusted completed/active subtotals are removed; completed/active scope remains explicit in the page and all-job summary. No new card, popup or hypothetical-financial section is added.

## Preserved behavior and safety

ACC07's Include Active Cutting Jobs toggle is unchanged: default ON includes completed plus active plans; OFF uses completed only. Both result sets, averages, reductions and tables respect that population. Project changes, URL state, refresh and live snapshot rerender retain the mode. Native toggle help, time-weighted failure statistics, current-value-only outcomes and missing/null/blank effective-zero reporting semantics remain intact. Invalid percentages never become zero.

ACC02's historical duration resolver, distinct 616/CUTPDF IDs and intentional repeated cuts are preserved. Current individual-job and Projects figures agree when using the same Hours Taken basis; historical imports still use Projects' previously documented recorded-duration resolver. The shared financial helper, editor, failure-save planner, audits, CAS/revision/readback/recovery controls, imports, source records, maintenance, Purchase History, inventory and Firebase structures are unchanged. Tests perform deliberate saves only to disposable local fixtures.

## Mesquite example: disposable fixture only

Six completed durations sum to 31.68 hours; one 2.8-hour job has current 39% failure. Artificial fixture inputs use $600/hour modeled charges, $450/hour processing, $60 material for the first five jobs and $59.31 for the sixth. These reproduce the supplied aggregate arithmetic, without claiming those are production rates or costs. The active fixture adds 18.5 planned hours with the same rates and $60 material.

| Completed-only metric | Primary adjusted | Smaller no-failure comparison |
| --- | ---: | ---: |
| Modeled Cut Net | $3,737.49 | $4,392.69 |
| Average Net per Job | $622.92 | $732.11 |
| Average Net per Cutting Hour | $117.98 | $138.66 |

The deduction is **−$655.20**, already included: $4,392.69 − $655.20 = $3,737.49. With active jobs ON, the seven-job/50.18-hour fixture shows adjusted $6,452.49 versus hypothetical $7,107.69, using the same $655.20 deduction. Weighted failure stays 2.18% ON / 3.45% OFF. The affected fixture job displays **−$295.20** as primary versus **$360.00** no-failure net. Amounts use the existing Intl currency formatter on unrounded calculations; no production figures are hardcoded.

## Exact verification and results

No `package.json` exists; no npm commands ran.

PASS — **185 tests, 0 failures**, including eight new ACC08 cases:

```powershell
node --test tests/projects.test.js tests/projects-accuracy.test.js tests/projects-financial-basis.test.js tests/projects-population.test.js tests/projects-adjusted.test.js tests/cutting-job-import.test.js tests/cjprofit01b-downstream.test.js tests/cjprofit02-failed-cut.test.js tests/cjprofit03-ui.test.js tests/cjpc01-project-category.test.js tests/cjcat01-category-edit.test.js tests/atomic-persistence.test.js tests/cjo04c-readback.test.js tests/cjo04a-dates.test.js
```

PASS — **1 headless Edge integration test, 0 failures**, local disposable backend only, all nonlocal requests blocked. Verifies primary/comparison values, no extra cards or duplicate result, both toggle populations and refresh/selection persistence, current-failure reset, negative job net, identical individual-job/Projects net on the same duration basis, exact source-state comparisons, native help with mouse/keyboard/Escape/touch, responsive widths 1440/768/375px and 150% CSS zoom. At each viewport, browser geometry/style checks confirm comparisons sit beneath the primary figure with a smaller font. Desktop/mobile screenshots inspected.

```powershell
$env:OMAX_PLAYWRIGHT_PATH='C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:OMAX_SCREENSHOT_DIR='C:/CodexProjects/OMAX/artifacts/proj-01b-acc08'
node --test tests/projects.browser.cjs
```

PASS — syntax, whitespace and tracked-text checks:

```powershell
node --check js/projects.js
node --check tests/projects-adjusted.test.js
node --check tests/projects-financial-basis.test.js
node --check tests/projects-population.test.js
node --check tests/projects.browser.cjs
git diff --check
git diff --cached --check
& 'C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' scripts/check_binaries.py
```

A development-only numeric assertion initially used `toFixed` instead of the UI's existing Intl currency formatting at a half-cent boundary; it was corrected to assert the rendered currency and unrounded quotient separately. No application rounding change was needed. Final verification has no unresolved failures.

Not verified: production Firebase data/network/save behavior, actual Mesquite financial inputs or balances, collected revenue, physical touch devices, Safari/Firefox or native browser zoom. Supplied production examples are reproduced as disposable fixtures only.
