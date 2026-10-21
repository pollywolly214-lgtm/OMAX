# PROJ-01B-ACC09 — Projects layout, colors, attachments and table polish

Updates existing open PR #517 from ACC08 commit `d577ffca8f5533afa674176ff15f81d9857278ca`. At inspection the PR was open/mergeable with successful Vercel checks. Do not merge automatically. No production records were accessed or modified.

## Presentation changes

- Projects has no independent background, rounded outer container, centered margins, extra outer padding or 1440px width cap. It fills its existing main content area, retaining the site's normal responsive main padding. A Projects-only `#content:has(> .projects-page)` neutral background keeps explanatory text readable without an outer card. Metric cards and the Cutting Jobs table panel remain. Header, navigation, footer and other-page CSS are unchanged; the browser verifies Jobs retains its original transparent main background.
- A small Projects-only searchable combobox replaces the native datalist. It reuses `getJobCategoryColorData().accentHex`, including the established ID-derived fallback. Color dots identify each option and the selected project; text remains dark on a neutral surface. Stored colors/categories/IDs are never changed. Options sort numerically descending, retaining leading-zero identifiers; nonnumeric identifiers follow, with stable label/ID tie-breakers. Ownership validation is unchanged.
- The selector supports number/name filtering, mouse/touch selection, ArrowUp/ArrowDown, Enter, Escape, Tab, a labeled toggle button and empty-result feedback. It has an explicit label, combobox/listbox roles, expanded/active-descendant/selected states and stable option IDs. An empty result popup does not move controls beneath it. Project and active-mode URL selection/refresh behavior remain intact.
- The table uses white header text on solid OMAX blue `#0959a6`, measured contrast **7.02:1** (WCAG AA normal-text threshold is 4.5:1). Column proportions reserve 5% for Failure %, with broader names, modeled net and files. Long labels wrap. Missing failure displays `0%*` with a title and a visible note below the table; invalid values display a dash with an explanatory title. This changes no effective percentages or calculations. A 1200px minimum table width and its existing horizontal scroller preserve readable columns on narrow screens.

## Read-only attachments

Each row copies only legacy/local attachment names and the local-reference indicator from the original job's `files` metadata. It never copies file bytes, URLs, local root IDs/paths or Storage paths into Projects markup. Missing legacy metadata remains distinct from a confirmed empty array. Ambiguous same-ID lifecycle rows expose no attachment access.

A compact expandable Files column lists legacy/local names and available verified cloud names. **Check/Refresh secure cloud files** calls the existing `refreshCfr05CloudPresentation(jobId, {force:true})` path, which uses the existing exact-job authorized listing and transient presentation cache. Existing `filterAttachedCuttingJobCloudFiles` excludes unlinked cloud files. No query or DXF download is initiated merely to aggregate or render the Projects table. Metadata reads occur on explicit request; local and cloud file names appear together without exposing public URLs.

Unchecked, loading, blocked/error, rejected/incomplete and confirmed-empty states are distinct. **No files** appears only when the original legacy array is known empty and the authorized cloud listing is complete and empty. A failed listing never proves absence. Partial/blocked metadata is labeled unavailable/incomplete.

File-name buttons reveal the **original Cutting Job** through the existing exact-ID navigator. Preview/download is then performed through that job's existing file workflow, rather than introducing a second file viewer. Secure cloud membership/environment/metadata/checksum checks and local WJ Cuts root verification remain in those established handlers. This is deliberately metadata discovery plus access to the existing workflow; Projects does not create download URLs, automatically upload/edit/unlink files, or bypass local-folder verification. The actual attachment security modules and handlers were not modified.

## Preserved calculations and data

All ACC08 modeled adjusted/hypothetical values, population eligibility, denominators and deductions remain unchanged. ACC07's default-ON active-job toggle, URL persistence, time-weighted failure rates and current-value/missing-effective-zero rules remain unchanged. ACC02 duration resolution and all different-ID 616/CUTPDF/repeated cuts remain intact. No business saves, migrations, recovery actions, category mutations, file mutations, historical rewrites or changes to inventory/maintenance/Purchase History/RPM were added.

## Exact verification and results

No `package.json` exists; no npm commands ran.

PASS — **220 Node runner tests, 0 failures**, including seven new ACC09 cases and existing secure-cloud/presentation/attachment-removal suites:

```powershell
node --test tests/projects.test.js tests/projects-accuracy.test.js tests/projects-financial-basis.test.js tests/projects-population.test.js tests/projects-adjusted.test.js tests/projects-polish.test.js tests/cutting-job-import.test.js tests/cjprofit01b-downstream.test.js tests/cjprofit02-failed-cut.test.js tests/cjprofit03-ui.test.js tests/cjpc01-project-category.test.js tests/cjcat01-category-edit.test.js tests/atomic-persistence.test.js tests/cjo04c-readback.test.js tests/cjo04a-dates.test.js tests/cfr05-cloud-cutting-files.test.js tests/cfr05-cloud-presentation.test.js tests/cfr06-cutting-job-ui.test.js tests/cja01-attachment-removal.test.js
```

PASS — **1 headless Edge integration test, 0 failures**, all nonlocal requests blocked. Fixtures verify descending numerical options, explicit/fallback colors, selection accent, filtering/no results, keyboard up/down/Enter/Escape, mouse and actual touch selection, refresh and active-mode persistence, file metadata states/multiple names/exact-job navigation, absence of unsafe URLs/mutation controls, unchanged cloud business state, full-width geometry, no outer panel, other-page background isolation, header colors/contrast and compact Failure %. Existing ACC07/08 financial fixtures and audited zero/positive/reset save tests remain in the same run.

Widths **1920/1440/768/375px** and CSS **150% zoom** pass without unintended viewport overflow; the wide table scrolls. Browser checks retain primary/secondary financial font and placement verification. Desktop and mobile screenshots inspected.

```powershell
$env:OMAX_PLAYWRIGHT_PATH='C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:OMAX_SCREENSHOT_DIR='C:/CodexProjects/OMAX/artifacts/proj-01b-acc09'
node --test tests/projects.browser.cjs
```

PASS — syntax, whitespace and tracked-text checks:

```powershell
node --check js/projects.js
node --check tests/projects-polish.test.js
node --check tests/projects.browser.cjs
git diff --check
git diff --cached --check
& 'C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' scripts/check_binaries.py
```

Development runs initially rejected attachment fixtures without stable file IDs through the existing startup integrity guard. The fixtures were corrected, not the guard. The mobile context also needed normal disposable-backend initialization before adding its project. An empty-results layout shift and first ArrowUp navigation were corrected during browser testing. Final runs have no unresolved failures.

Not verified: production Firebase metadata, live cloud preview/download, physical local WJ Cuts roots/files/permissions, physical touch devices, Safari/Firefox, screen readers or native browser zoom. Browser metadata responses are deterministic stubs at the existing authorized-listing boundary; Node security tests exercise its established authorization/verification behavior. No production/device access is claimed.
