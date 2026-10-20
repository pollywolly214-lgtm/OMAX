# PROJ-01B-ACC03 — Restore historical financial reporting

[ACC04](proj-01b-acc04.md) adds provisional net after known deductions, aligns the displayed deduction with the unadjusted eligible population, and fixes individual-job missing-failure labels. The ACC03 unadjusted financial basis and limited success coverage remain intact.

PR #517 was open at implementation, with ACC02 commit `e7fbf6896e220a520efafc7482a60664821f74b6` as its head. Current main remains `d1489aa3ebc4299e53687b2e11d859298269382b` and is already incorporated. This correction changes only Projects reporting, tests and documentation.

## Cause and independent financial bases

ACC02 correctly selected historical duration, but `financials()` required reliable `failurePercent` for `reduction`, and required that reduction for `net`. The primary net total and both averages then used only the adjusted-net population. This excluded otherwise usable historical financial records, despite the shared helper exposing an independent `originalNetProfit`.

Projects now calls the unchanged `computeCuttingJobProfit` on the same calculation-only duration copy, and keeps three independently covered results:

- `unadjustedNet`: `originalNetProfit`, requiring valid duration, available direct/stored-efficiency charge and cost rates, material unit cost and quantity, and finite expenses/net. It does **not** require or subtract a failure percentage.
- `net`: `totalProfit`, requiring eligible financial inputs **and** reliable failure information. Existing adjusted results remain separately available; unknown failures are not changed into zero failures.
- `reduction`: `revenueLost`, requiring valid duration, charge rate and reliable failure information. It is independently covered and does not require material data because the helper's charge reduction does not depend on that expense.

The primary cards are **Total Unadjusted Modeled Cut Net**, **Average Unadjusted Net per Job**, **Average Unadjusted Net per Hour**, and **Known Failure-Related Reduction**. Each displays its own eligible-record count. The first three use exactly the same unadjusted-net population; hourly average divides its total unadjusted net by that population's total duration. Zero or non-finite denominators are unavailable. Missing financial inputs never become fabricated rates/expenses.

Known failure-adjusted modeled net appears separately with its subset count and an explicit partial-project qualification where necessary. The existing job table shows unadjusted net as its primary amount and a labeled adjusted amount secondarily. No cards, tabs, charts or editing interfaces were added.

When no failure reduction is supported, the card displays **Unavailable**, including for an empty project. Explicit known zero failure can support a genuine zero reduction. Unadjusted values remain before **all** failure adjustments, including known ones; an explanatory notice states they do not account for unknown failed cuts.

## Success coverage

The primary success percentage now requires complete reliable coverage of the project's job population. Partial coverage shows **Limited data** with the observed subset's percentage secondarily; zero coverage shows **Insufficient coverage**. An empty project shows Unavailable. A project with one known successful job out of seven cannot display a project-wide 100% success figure. Partial failures still count as failure-affected.

## Historical rates and modeled expenses

The inspected CJI importer preserves submitted rate cells in `importProvenance`; mapping materializes charge/cost defaults of 200/45 when those cells are blank. Stored values can subsequently be edited. Therefore blank original cells plus numeric stored rates are not proof of actual historical billing, nor proof that a specific rate is still the original default. The page gives a selected-project notice for blank/invalid original rate cells, saying available stored rates may be defaults or later edits. Available stored-efficiency rate fallbacks receive their own scoped explanation. Missing rates with no supported stored fallback remain unavailable; Projects introduces no defaults.

General financial wording distinguishes modeled charges from actual sales/company profit and material estimates from verified inventory consumption or Purchase History expenditure. The importer, rate defaults, shared financial helper and material model are unchanged. No Purchase History or additional maintenance expenses are introduced.

## ACC02 and protected data

ACC02 duration resolution and selected-project overlap detection remain unchanged. Every different-ID eligible Cutting Job remains included, including matching 616/CUTPDF records and legitimate repeated cuts. Existing same-ID lifecycle handling and stable record navigation remain. This is a read-only derived calculation: no source records, IDs, category associations, imports, logs, attachments, inventory, maintenance, RPM/hour history, settings or layouts are changed. Firebase/CAS/readback/recovery paths are untouched; no calculated totals are persisted.

The supplied ATM/Mesquite screenshots and financial totals are user-provided production evidence. They were not reproduced from production records in this work, and no expected production financial total was hardcoded. After deployment, verify those projects' eligible unadjusted counts/totals and that ATM's absent failure coverage leaves its known reduction unavailable, while Mesquite's partial coverage shows Limited data. Production Firebase, physical mobile devices, Safari/Firefox and native browser zoom remain unverified.

## Verification

`package.json` does not exist; no npm commands were used.

PASS — **128 tests passed, 0 failed**:

```powershell
node --test tests/projects.test.js tests/projects-accuracy.test.js tests/projects-financial-basis.test.js tests/cutting-job-import.test.js tests/cjprofit01b-downstream.test.js tests/cjprofit02-failed-cut.test.js tests/cjprofit03-ui.test.js tests/cjpc01-project-category.test.js tests/cjcat01-category-edit.test.js tests/atomic-persistence.test.js tests/cjo04c-readback.test.js
```

Ten new ACC03 cases cover historical missing failures, independent original/adjusted helper results, modern/historical eligibility, identical numerator/denominator populations, missing rates/expenses, one-of-seven success coverage, no false zero reductions, rate provenance, both import IDs retained with frozen inputs, and zero/overflow safety. Existing ACC02, importer, shared financial and persistence/recovery cases continue to pass. An initial stale case-sensitive wording assertion failed and was corrected; no unresolved failures remain.

PASS — **1/1 browser integration test**, headless Edge, disposable local backend, all non-local requests blocked:

```powershell
$env:OMAX_PLAYWRIGHT_PATH='C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:OMAX_SCREENSHOT_DIR='C:/CodexProjects/OMAX/artifacts/proj-01b-acc03'
node --test tests/projects.browser.cjs
```

Checks include the four exact primary labels/values, separate known-adjusted subtotal, incomplete success status, all-missing historical failures with useful unadjusted net, unchanged hours/costs, selected-project overlap warning, both exact record links, refresh/live updates and source-state preservation. Layout checks cover 1440/768/375px viewports and 150% CSS zoom. Desktop/mobile screenshots were visually inspected.

PASS — exact syntax, whitespace and text-only checks:

```powershell
node --check js/projects.js
node --check tests/projects.test.js
node --check tests/projects-accuracy.test.js
node --check tests/projects-financial-basis.test.js
node --check tests/projects.browser.cjs
git diff --check
& 'C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' scripts/check_binaries.py
```
