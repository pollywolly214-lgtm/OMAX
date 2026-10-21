# PROJ-01B-ACC07 — Population toggle and time-weighted failure rate

Updates existing open PR #517 from ACC05 commit `1d922e3a89b078078e5dd19107580c66f341a4bb`. No ACC06 implementation was present. Do not merge automatically. This change touches Projects aggregation/rendering, scoped styles, targeted tests and documentation. No production records were accessed or modified.

## Behavior

**Include Active Cutting Jobs** defaults ON. ON includes completed work and active plans; OFF includes completed jobs only. Lifecycle identity validation occurs before filtering, and filtering occurs before all aggregation. Every count, duration, cost, unadjusted net, average, failure deduction, provisional net, coverage denominator and table row uses the selected population. Eligible financial subsets still exclude unsupported financial inputs from both their totals and denominators. Completed/active subtotals appear only in combined mode with active jobs; they are components of the primary figure, not added expenses.

Changing project preserves the checkbox. The page hash stores `project=<stable category ID>&active=1` or `active=0`; refresh and snapshot rerender preserve that mode. A URL without `active=0` defaults ON. Toggling preserves an expanded jobs table and changes no business data. No preference is stored in Firebase. The adjacent native popover supports click/tap, keyboard activation, Escape, a Close button and light dismissal.

**Cut Failure Rate** replaces Cut Success Rate:

`failed hours = sum(applicable duration × current effective failurePercent / 100)`

`failure rate = failed hours / sum(all included applicable duration) × 100`

Failed time remains in the denominator. Active planned hours enter both calculations in ON mode, and active jobs leave both in OFF mode. Job counts and equal-weight percentage averages do not determine this rate. The card displays failed/included hours, current failure-affected jobs/included jobs and modeled/completed-only scope. Missing/invalid duration or invalid failure values make the rate unavailable with incomplete input coverage; a zero/empty denominator is unavailable.

For **Projects only**, missing/null/blank failure percentages have effective zero under the requested shop reporting convention. Explicit zero remains zero. Valid current positives contribute failed hours and the affected-job count; invalid/out-of-range values remain unavailable. Audit history never contributes to current outcomes. Resetting current failure to zero removes current failed hours and deductions while retaining the audit chain. Raw fields are untouched. The table distinguishes an undocumented reporting default from recorded zero; the individual Cutting Job display still says **Not recorded** for an undocumented stored field.

Failure deductions remain modeled charge × effective failure percentage, supplied by the unchanged authoritative financial helper. Total Unadjusted Modeled Cut Net remains before deductions. Provisional Modeled Net After Failure Deductions uses exactly those financially eligible jobs; it is unavailable if a deduction is invalid for an eligible job. Deductions display negatively. Missing percentages support zero deduction under the disclosed convention, without claiming documented historical success or verified company profit.

ACC02 historical duration resolution is unchanged, including recorded historical hours, latest cumulative logs, explicit-zero provenance and labeled estimate fallback. ACC05's audited explicit-zero mutation, CAS/revision protection and verified readback are unchanged. Distinct 616/CUTPDF IDs and repeated identical cuts remain separately counted. Project ownership is still validated against all source records, even in completed-only mode. No import, financial helper, editor, Firebase structure, historical audit, maintenance, Purchase History or business record code changes.

## Disposable Mesquite example

This reproduces the **user-supplied arithmetic**, not independently verified production totals. Six completed fixture durations sum to 31.68 hours; the active fixture has 18.5 planned hours. A 2.8-hour completed job has current 39% failure, contributing 1.092 failed hours. The other current percentages are absent/null/blank/zero, including a zero record with a prior positive audit.

| Mode | Jobs | Included hours | Failed hours | Failure rate | Currently affected |
| --- | ---: | ---: | ---: | ---: | ---: |
| ON | 7 | 50.18 | 1.092 | 2.18% | 1 of 7 |
| OFF | 6 | 31.68 | 1.092 | 3.45% | 1 of 6 |

Using fixture-only rates of $200 charge/hour, $45 processing/hour and $10 material/job, ON/OFF unadjusted nets are $7,707.90/$4,850.40. Each mode deducts $218.40 for the same completed failure, yielding provisional $7,489.50/$4,632.00. These artificial financial inputs are not production Mesquite evidence or hardcoded application values.

## Verification commands and actual results

No `package.json` exists in this repository; no npm command ran. Final targeted regression: **177 passed, 0 failed**:

```powershell
node --test tests/projects.test.js tests/projects-accuracy.test.js tests/projects-financial-basis.test.js tests/projects-population.test.js tests/cutting-job-import.test.js tests/cjprofit01b-downstream.test.js tests/cjprofit02-failed-cut.test.js tests/cjprofit03-ui.test.js tests/cjpc01-project-category.test.js tests/cjcat01-category-edit.test.js tests/atomic-persistence.test.js tests/cjo04c-readback.test.js tests/cjo04a-dates.test.js
```

Focused ACC07 fixture run: **8 passed, 0 failed**:

```powershell
node --test tests/projects-population.test.js
```

Browser integration: **1 passed, 0 failed**, headless Edge, local disposable backend only; every nonlocal request blocked. Includes all six cards, every financial total/average, table population, selection/reload persistence, live snapshot rerender, mouse/keyboard/Escape/light dismissal, touch-capable 375px context, 1440/768/375px layouts and CSS 150% zoom. Whole-state comparisons confirm no business save from reporting interactions. The real editor's missing → 0, 0 → 0 no-op, 0 → 10 and 10 → 0 paths retain CAS/readback and audit behavior; $1,680 × 10% produces −$168, leaving $1,765 unadjusted and $1,597 provisional. Mobile screenshot inspected.

```powershell
$env:OMAX_PLAYWRIGHT_PATH='C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:OMAX_SCREENSHOT_DIR='C:/CodexProjects/OMAX/artifacts/proj-01b-acc07'
node --test tests/projects.browser.cjs
```

Syntax and whitespace checks passed:

```powershell
node --check js/projects.js
node --check tests/projects.test.js
node --check tests/projects-accuracy.test.js
node --check tests/projects-financial-basis.test.js
node --check tests/projects-population.test.js
node --check tests/projects.browser.cjs
git diff --check
```

Staged whitespace and tracked-text checks passed; no binary tracked files found:

```powershell
git diff --cached --check
& 'C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' scripts/check_binaries.py
```

During development, the new Node fixture initially omitted the helper's required global constants, and the browser fixture's expected hourly average was rounded incorrectly ($153.60 instead of $153.61). Those test setup/expectation errors and an obsolete wording assertion were corrected; final runs above have no unresolved failures.

Not verified: production Firebase saves/network behavior, actual production Mesquite records or totals, physical touch devices, Safari/Firefox or native browser zoom. No production data edits or migrations were attempted.
