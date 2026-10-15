# POLISHv2-01C/01D — RPM log editing, small fixes and final review

Implemented locally on codex/polishv2-small-fixes, based on merged main 79d6b04859db6d4026851f82f0a027a22fa570ee (PR #501). Checkout: C:/CodexProjects/OMAX/.worktrees/polishv2-small-fixes.

## POLISHv2-01D final review

Fetched origin/main and confirmed it remains 79d6b04859db6d4026851f82f0a027a22fa570ee, identical to this branch's base. No incoming changes or conflicts. Reviewed all 11 files: five application files, five tests and this report.

One essential review correction: Add Job category cancellation could retain the temporary __new__ selection in the draft and revert to All Jobs after rerender. The existing draft synchronizer now runs after the category handler resolves. The browser regression first reproduced this failure, then passed with the correction; ordinary category selection, project-number synchronization, cancellation and rerender retention are covered.

Final rerun: 413/413 automated tests and 24/24 browser tests, zero failed/skipped/cancelled. Nine syntax checks, scripts/check_binaries.py and git diff --check pass. The original savePumpBaseline() function and pure PRB baseline model still match origin/main exactly. No unresolved code-review blocker was found; live Firebase authentication/session retention, real network errors, cross-browser behavior and operator zoom remain manual checks below.

Exact commands are the same full Node selection and three-suite browser command under Validation. Final review logs are C:/CodexProjects/OMAX/artifacts/POLISHv2-01D-tests.tap and C:/CodexProjects/OMAX/artifacts/POLISHv2-01D-browser.log. The preliminary category-only reproduction failed as expected (two tests including parent); after the correction that targeted run passed 2/2, followed by the full passing browser run. Production data and Firebase protections were preserved. This branch is prepared for a PR targeting main and must not be merged automatically.

## Result

- RPM log list now has an Edit action per record. Date, time and RPM corrections save through the existing guarded Firebase transaction writer and independent backend readback. The list, calendar and efficiency graph update after exact verification and authoritative adoption.
- IDs, unknown record metadata, other measurements, notes, baseline scalars/history and unrelated state are retained. Legacy logs without IDs remain without IDs; they are selected by their original unique date plus exact original record evidence. Ambiguous or changed originals fail closed. Newly created measurements receive an ID.
- Date correction replaces the selected record in place, so the original day is not resurrected by the old date-keyed merge. Moving onto another saved log's date is rejected. Fractional RPM readings survive date-only correction without rounding.
- Save feedback waits for both completed write and independent verification. Definite failure leaves the form and saved graph unchanged. Uncertain acknowledgement/readback preserves recovery evidence, blocks blind retries and does not show success. Duplicate submits are blocked.
- Tolerance Reset has readable contrast and an explicit confirmation with an initially unchecked required checkbox. Cancel, Escape and unchecked confirmation preserve data.
- Category creation has one shared name/project/color dialog using existing category ownership checks and storage fields. New selection is synchronized into the Add Job draft, surviving rerenders. Both Dashboard and Jobs use it. Dialog initial focus is explicitly assigned to its name field.
- Dashboard and Calendar use the same stable-ID job redirect. It resolves Active/Past membership, reveals the correct category and clears blocking history search before rendering, then reuses scrolling/highlight/fade. Dashboard search includes active jobs as well as history. Missing/deleted/ambiguous references produce feedback without modifying records.

Purchase History year navigation, the unidentified Edit Inventory behavior and Edit Hours authentication remain deferred per the audit. No separate Retired section was found or invented. Existing December/January calendar date handling is retained.

## Why RPM needed a local persistence adaptation

The old single editor upserted by the new date, leaving the old record available for date-keyed cloud merge. The old bulk editor reconstructed records using only date/time/RPM, dropping IDs and other metadata, and reported success before awaiting persistence.

The replacement prepares exactly one log create/edit against an independently read source. The shared writer retains this exact pump field only after recomputing the permitted single-record operation from its transaction's remote state and checking equality. Other callers continue using the existing merge. Protected preflight, baseline retention, content firewall, size limits, identity checks, expected revision/CAS, source/prepared validators and post-write verification remain enabled. The write mask is only pumpEff and syncMeta.

A pump-log-specific pending flag prevents its realtime echo or another autosave from adopting stale evidence while the operation verifies. Concurrent local changes invalidate adoption rather than being overwritten. The original baseline mutation function and pure baseline model were compared with HEAD and are unchanged. No baseline UI/logic, schema, Firebase rules, migration or global persistence redesign was introduced.

## Files

- js/pump.js: exact log preparation, per-entry editor, verified form feedback, nonmutating time display, chronological read-only graph/latest ordering.
- js/core.js: scoped measurement save, existing writer integration and pending-action isolation.
- js/renderers.js: Reset confirmation, shared category dialog/draft retention, ID-based job reveal, dialog focus/disabled cleanup.
- js/calendar.js: job-click delegation; non-job branches and hours-editing guard retained.
- style.css: local Reset text contrast.
- tests/polishv2-pump-log.test.js: 28 isolated model/transaction/verification regressions.
- tests/polishv2.browser.cjs: eight browser scenarios plus parent.
- tests/cjpc01-manual-paths.test.js: async category-dialog fixture adaptation.
- tests/cjo04b-verification.test.js and tests/cjo04c-readback.test.js: existing stale fixture dependency/modal-callback corrections only.

## Validation

No package.json exists (Test-Path returned False); no npm commands ran.

From the implementation checkout:
~~~powershell
node --test --test-reporter=tap tests/polishv2-pump-log.test.js tests/pump-baseline.test.js tests/atomic-persistence.test.js tests/cjcd01b-calendar.test.js tests/polish01-hotkey.test.js tests/polish01d-dimensions.test.js tests/cjpc01-manual-paths.test.js tests/purchase-financials.test.js tests/mcf-01-maintenance-calendar.test.js tests/cjo04b-verification.test.js tests/cjo04c-readback.test.js tests/inventory-material-persistence.test.js tests/cjd01-job-deletion.test.js
~~~
PASS: 413/413; zero failed/skipped/cancelled. Saved output: C:/CodexProjects/OMAX/artifacts/POLISHv2-tests.tap.

Following the final category-focus change:
~~~powershell
node --test --test-reporter=tap tests/cjpc01-manual-paths.test.js tests/polishv2-pump-log.test.js | Select-Object -Last 9
~~~
PASS: 43/43.

Browser commands:
~~~powershell
$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node --test --test-reporter=spec tests/polishv2.browser.cjs tests/polish01.browser.cjs tests/polish01d.browser.cjs
node --test --test-reporter=spec tests/polishv2.browser.cjs
~~~
Existing POLISH suites passed 15/15. Final POLISHv2 suite passed 9/9, including its parent: 24 tests across the three suites. The earlier combined run had 23 tests before the fractional legacy browser scenario was added. Final POLISHv2 output: C:/CodexProjects/OMAX/artifacts/POLISHv2-browser.log.

All browser runs used headless Edge, America/Chicago, fresh disposable devsafe data and blocked external page requests. Actual forms exercised create/edit, date move without duplication, fractional legacy correction, independent readback delay, duplicate submit, rejection, uncertain readback, exact list/calendar/graph adoption, refresh and a reopened page. A synthetic signed-out state followed by fresh devsafe initialization tested saved-data retention across a local session reset. It did not invoke real Firebase sign-out or login.

Category scenarios cover both Dashboard and Jobs, name/color, persistent selection, invalid ownership and cancel. Reset was executed only against synthetic isolated tolerance storage; both keys and unrelated local storage were checked. Navigation covered both entry points and Active/Past jobs, duplicate names, restrictive filters, highlight/fade, missing references and unchanged saved records/revision.

Additional checks:
~~~powershell
$sources=@('js/core.js','js/pump.js','js/calendar.js','js/renderers.js','tests/cjpc01-manual-paths.test.js','tests/cjo04b-verification.test.js','tests/cjo04c-readback.test.js','tests/polishv2-pump-log.test.js','tests/polishv2.browser.cjs')
foreach($source in $sources){node --check $source;if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}}
& 'C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/check_binaries.py
git diff --check
~~~
PASS: nine syntax checks, no tracked binaries, no whitespace errors. Read-only source-section comparisons confirmed savePumpBaseline() and the PRB baseline model match HEAD exactly.

Initial failures and corrections:
- The first async category unit run exposed the old fixture extractor dropping the async keyword; the fixture now retains it and exercises the new dialog's actual onConfirm contract.
- An early browser selector matched existing category-color wrappers; the new field received its own data-category-create-color attribute.
- An intermittent category browser timeout exposed competing initial focus callbacks in the shared dialog. Category creation now supplies one initial focus selector.
- Broader regression tests exposed pre-existing fixture gaps on unchanged main: CJO-04C lacked stableStringifyForIntegrity (23 failures), and CJO-04B's copy-modal stub omitted the current callback and UI helpers (4 failures). Both were reproduced on the original POLISH-01/main-equivalent snapshot before repairing only those fixtures. Final selected checks pass.
- Intermediate construction/syntax errors were corrected before the reported final checks. No production evidence or behavior was changed to satisfy test fixtures.

## Remaining manual browser verification

1. After deployment, correct a designated nonproduction Firebase RPM log, verify its ID/count and graph, then refresh, perform actual logout/login, close/reopen the site and confirm persistence.
2. Check real network/permission failure feedback and recovery handling without editing production records for testing.
3. Verify the RPM list/editor, category dialog and Reset contrast/keyboard interaction at the operator's normal browser zoom and narrower viewports; cross-browser checks remain manual.
4. Check job navigation from both entry points with actual layout preferences, and confirm maintenance/garnet/pump calendar interactions remain normal.

No production records, credentials, migrations, schema/rules or historical baselines were changed. This work has not been deployed or merged.
