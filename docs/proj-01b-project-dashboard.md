# PROJ-01B — Project cutting performance

Updated by **PROJ-01B-ACC04**: see [failure display consistency](proj-01b-acc04.md) for provisional net after recorded deductions and individual-job failure status. [ACC03](proj-01b-acc03.md) documents the unadjusted/adjusted basis and [ACC02](proj-01b-acc02.md) the unchanged duration and cross-ID retention rules. The original assumption that every historical duration lived in `estimateHours` was incorrect.

Base: `origin/main` at `14b467d6a8b017915a9f5f1c60aec6aa08b5918b` (fetched October 20, 2026).
The initial checkout contained unrelated style/artifact changes. Implementation began in a clean isolated worktree on `codex/proj-01b-project-dashboard`; those original changes were preserved.

## Behavior and reused authorities

Projects is a main-navigation page with a searchable native suggestion dropdown, six summary cards, four cutting financial metrics, and one initially collapsed Cutting Job table. The selected stable category ID lives in the URL, so reload and shareable links retain the selection. Existing workspace snapshot adoption rerenders the page after revisioned source updates. No calculated totals are saved.

- `CuttingJobHistory.resolveCategoryProject` and `normalizeProjectKey` reuse CJPC/CJI ownership validation. A unique category ID determines membership; visible job/category names are not join keys. Supported leading-zero project numbers remain strings.
- `computeCuttingJobProfit` supplies processing cost, material expense, modeled net and failure-related charge reduction. Projects resolves historical recorded duration separately and passes it as `estimateHours` on a calculation-only copy. Current jobs retain the shared Hours Taken behavior; stored records and the shared helper are unchanged. Material expense is `materialCost × materialQty`. Either sign of the stored machine rate is an expense magnitude. Failed cuts retain the full machine/material expenses.
- A completeness check rejects missing, invalid or overflowing inputs before presenting reliable figures. Stored efficiency rates remain an allowed fallback; absent stored rates do not silently become global defaults. Explicit zero failure is known; absent failure is unknown. Each aggregate shows coverage; partial totals and averages use only applicable records. Net/hour is applicable total net / applicable total hours.
- `CuttingJobChronology.readCutLabel` supplies Cut Numbers; `redirectToCuttingJobPage` reveals/highlights the exact existing active/history record by stable job ID.

Identical lifecycle copies count once. Conflicting copies count once only when their project membership agrees, with unavailable metrics. Duplicate IDs have no record link because the existing navigator deliberately requires a unique record. Conflicting associations, missing IDs/categories, duplicate category identities and unsupported ownership are reported without guessing or editing history. Supported historical `1111` ownership remains a distinct `1111` project; it is never remapped by a display name. Production business data was not accessed or audited for this feature; limitations are reported from the currently loaded workspace.

CJCAT #509, CJPROFIT #505/#507/#508 and CJPC #495 are merged into main. Open #514 overlaps cost-rate work; this page calls the shared helper without changing that model. Older project/flow-chart PRs #322/#323/#326 remain open. The legacy Flow Chart is unchanged.

## Scope and persistence

Changed files: `index.html`, `js/router.js`, `js/projects.js`, `style.css`, `tests/projects.test.js`, `tests/projects.browser.cjs`, and this document.

The optional Waterjet Cost Target is deferred. The existing verified category mutation planner supports name/project/color changes, not a target-only operation. Implementing that field would require extending its protected mutation plan and CAS/readback proofs and related tests. The dashboard adds no competing storage mechanism or save path. Firebase, recovery, original jobs/categories, chronology, inventory, purchases, maintenance, RPM, attachments and layout persistence code are unchanged.

## Verification

No `package.json` exists; no npm commands were run.

PASS — 102/102 targeted tests, 0 failures:

```powershell
node --test tests/projects.test.js tests/cjprofit01b-downstream.test.js tests/cjprofit02-failed-cut.test.js tests/cjprofit03-ui.test.js tests/cjpc01-project-category.test.js tests/cjcat01-category-edit.test.js tests/atomic-persistence.test.js tests/cjo04c-readback.test.js
```

PASS — 1/1 browser integration test, 0 page errors:

```powershell
$env:OMAX_PLAYWRIGHT_PATH='C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:OMAX_SCREENSHOT_DIR='C:/CodexProjects/OMAX/artifacts/proj-01b'
node --test tests/projects.browser.cjs
```

Headless Microsoft Edge used a fresh browser context with every non-local request blocked and the existing `?devsafe=1` disposable backend. Tested real navigation, selector changes, six-card and financial values, partial coverage, expansion/collapse, duplicate visible names, active/history record links, reload, revisioned live updates, and exact preservation of cloud state except the test's intentional source-hours/revision edit. Layout checks cover 1440px, 768px and 375px viewports plus 150% CSS zoom. Desktop/mobile screenshots were visually inspected; a mobile table width issue and text contrast were corrected and the browser test rerun successfully.

PASS — syntax and whitespace:

```powershell
node --check js/projects.js
node --check js/router.js
node --check tests/projects.test.js
node --check tests/projects.browser.cjs
git diff --check
```

PASS — repository-required text-only scan:

```powershell
& 'C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' scripts/check_binaries.py
```

During development, the first unit run exposed an incorrect test assumption that historical `1111` must be unavailable; the test now verifies that it stays distinct. The sandbox initially prevented Edge from launching; the browser test then ran outside that restriction. Browser-test URL/revision fixtures were corrected before the final passing run. There are no unresolved test failures.

Still unverified: production Firebase end-to-end behavior, native browser zoom controls, Safari/Firefox native datalist behavior, and physical mobile devices. No production data was changed by testing.
