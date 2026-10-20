# PROJ-01B-ACC04 — Failure tracking and financial display consistency

Updates open PR #517 from `9efc62a9377012e9645816be5ece6c11662c6bda`. No production records were accessed or modified. No shared financial formula, duration resolver, overlap detector, save operation, CAS/readback, or recovery code was changed.

## Changes and verified behavior

- Individual Cutting Job breakdowns and the historical Actions label inspect the stored `failurePercent`, using the same validity rules as Projects. Missing/invalid values say **Not recorded**; explicit numeric/string zero says **0%**. Undocumented failure makes the displayed individual net explicitly provisional; unsupported adjusted charge/reduction details say Unavailable. The shared helper still defaults missing failure to zero internally; no source field is written by rendering.
- Existing Projects reduction math was correct: the shared helper calculates modeled charge × failure percentage / 100. The unadjusted primary net intentionally does not change when failure changes. This formula and the verified save path were preserved.
- Projects now displays **Provisional Modeled Cut Net After Recorded Failure Deductions**: the unadjusted-net total minus known reductions from exactly those same financially eligible jobs. The displayed Known Failure-Related Reduction card uses that same population. The broader row-level reduction evidence remains available in the model; a financially ineligible row cannot change this provisional result.
- Positive expense magnitudes remain positive in computation, and deductions are presented with a minus sign/red styling in Projects and individual/popup financial details. An explicit known zero remains a genuine zero deduction. No reliable deduction data displays Unavailable; provisional net can equal the unadjusted net with an explicit explanation that no verified failure deduction is available and unknown failures remain unadjusted, not assumed successful.
- The provisional result reports eligible count and **Failure information recorded for X/Y jobs**, explicitly including recorded zeros. This is coverage, not the number of failed jobs. Partial coverage retains **Limited data** for project success. The separately labeled adjusted subset and original unadjusted metrics remain.

ACC02/ACC03 historical duration, repeated legitimate cuts, all distinct-ID 616/CUTPDF records, overlap notices, original source fields/relationships and navigation remain unchanged. No migration, backfill, inventory/purchase/maintenance allocation or persisted calculated totals were introduced.

## Disposable save/readback/reload evidence

The browser test provisions seven local completed jobs, one with recorded 0% and six undocumented. One undocumented job has 7 hours × $240/hr = **$1,680 modeled charge**. Through the actual Actions → Failed Cut dialog, it saves 10% using the existing revision-guarded operation and waits for verified completion. After Projects reload:

- Unadjusted net stays **$1,765** across all seven fixture jobs.
- Recorded reduction is **$168**, displayed as **−$168**.
- Provisional net falls from **$1,765 to $1,597**.
- Failure coverage changes from **1/7 to 2/7**, while project success stays Limited data.
- Individual job labels change from Not recorded/provisional to recorded 10%; the popup previews −$168 before submit.
- Server-shaped state matches the baseline exactly except the intentional target failure edit, its audit entry and sync revision metadata. Reload/navigation cause no additional changes.

These are deterministic fixture results, not production Mesquite totals. The local backend exercises the real UI/coordinator/readback adoption path, but it does not prove production Firebase permissions, latency or network behavior. Production Mesquite and physical-device/Safari/Firefox verification remain outstanding. Existing zero-submit no-op behavior was not changed; rendering never automatically records 0% for historical jobs.

## Exact verification

No `package.json` exists; no npm commands were used. All executed test groups passed; no unresolved failures.

PASS — focused financial/display group, **36/36**:

```powershell
node --test tests/projects-financial-basis.test.js tests/cjprofit03-ui.test.js tests/cjprofit02-failed-cut.test.js
```

PASS — final regression group, **132/132**:

```powershell
node --test tests/projects.test.js tests/projects-accuracy.test.js tests/projects-financial-basis.test.js tests/cutting-job-import.test.js tests/cjprofit01b-downstream.test.js tests/cjprofit02-failed-cut.test.js tests/cjprofit03-ui.test.js tests/cjpc01-project-category.test.js tests/cjcat01-category-edit.test.js tests/atomic-persistence.test.js tests/cjo04c-readback.test.js
```

PASS — **1/1** headless Edge integration test, disposable backend only and all non-local requests blocked. Includes actual verified failure edit/readback/reload, source preservation, historical costs, exact record links, 1440/768/375px layout checks and 150% CSS zoom. Desktop screenshot inspected.

```powershell
$env:OMAX_PLAYWRIGHT_PATH='C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:OMAX_SCREENSHOT_DIR='C:/CodexProjects/OMAX/artifacts/proj-01b-acc04'
node --test tests/projects.browser.cjs
```

PASS — syntax, whitespace and text-only checks:

```powershell
node --check js/projects.js
node --check js/views.js
node --check tests/projects-financial-basis.test.js
node --check tests/projects.browser.cjs
node --check tests/cjprofit03-ui.test.js
node --check tests/cjprofit02-failed-cut.test.js
git diff --check
& 'C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' scripts/check_binaries.py
```
