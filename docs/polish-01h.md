# POLISH-01H: final main reconciliation

Existing PR #501 / `codex/production-polish-small-bugs`; no new PR or automatic merge.

Merged fetched `origin/main` at `8f48067e8cc2506df3b36b667d19d4dbc2d2e821` into the existing PR branch. Merge base was `a279fbed298c53b8d7206ca02a582efed3e1cdfe`; previous PR head was `ba7e7624434713cfe10c0c39dd22160e5c858040`. A second fetch confirmed main had not advanced before committing.

## Resolution

Only `js/pump.js` had a textual conflict, in tooltip positioning. Resolved the function in favor of main, and removed the obsolete PR-only gap/clamping changes and corresponding placement/animation CSS. Main's logical-coordinate/DPR mapping, nearest-dot selection, tooltip offsets, drawing, baseline resolver and graph calculations are retained exactly. No blanket file-level ours/theirs resolution was used.

Compatible POLISH readability remains: prominent RPM in the clicked-point dialog and hover value, local dialog colors, date/time/range and notes. The only remaining pump JavaScript difference from main is moving the dialog RPM from its subtitle into the existing prominent RPM element.

`js/core.js` merged cleanly. Main's baseline audit/retention, write-ownership, independent verification and recovery protections remain. Relative to main, core differs only by the existing manual-only sign-in/submit guards and the previously reviewed exact-evidence predicate for captured-target chronology mutations. No new persistence behavior was invented during reconciliation. Main's completed-job calendar corrections and other incoming files are retained unchanged.

`js/renderers.js`, `js/views.js`, `index.html`, `js/cuttingJobDimensions.js` and manual-only shortcut tests are unchanged from the previous PR head. Next Due, responsive average-hours widget, import contrast, Export Range placement, local copied dates, verified independent copy, Actions and dimension entry remain intact. Automatic sign-in was not restored.

Resolution-specific files: `js/pump.js`, `style.css`, `tests/polish01.browser.cjs`, `tests/polish01d.browser.cjs`, this report and the pointer/current pump description in `docs/polish-01.md`. The merge also incorporates main's files as shown by the merge commit.

The existing pump browser test now exercises real painted chart points instead of the obsolete mock tooltip signature/fixed 10px gap. Adjacent points have overlapping hit areas and are each hovered/clicked at DPR 1/2, normal/resized/expanded. The copy browser fixture now uses a valid baseline-history record matching main's new retention contract; production records were never changed.

## Commands and results

No package.json exists (`Test-Path package.json` returned False); no npm commands ran.

| Command | Result |
| --- | --- |
| `git fetch origin main codex/production-polish-small-bugs`; `git merge-base HEAD origin/main`; `git merge --no-commit --no-ff origin/main` | Main fetched; merge base inspected; one pump conflict individually resolved. |
| `node --test tests/pump-baseline.test.js tests/atomic-persistence.test.js tests/cjcd01b-calendar.test.js tests/polish01-hotkey.test.js tests/polish01d-dimensions.test.js` | PASS, 80 targeted tests: pump calculations/retention, protected writer/CAS/recovery, main calendar dates, manual-only shortcut/Firebase path and dimensions. |
| `node --test tests/polish01.browser.cjs tests/polish01d.browser.cjs` | PASS, 15 tests including parents: dense pump hover/click and readable popup; Next Due/widget/import/export; date editing, actual guarded copy/readback/reload with historical/pump preservation; rejected/tampered/indeterminate saves; Actions bounds/keyboard/menu/Edit dispatch; dimension precision. No page errors. |
| `node --test --test-skip-pattern="empty Next Due\|copy dates update\|fraction dimensions\|active/history Actions\|maintenance import" tests/polish01.browser.cjs` | PASS, focused pump rerun (2 including parent), before the final full POLISH browser run. |
| `$changedJs=git diff --name-only HEAD -- '*.js' '*.cjs'; foreach ($sourcePath in $changedJs) { node --check $sourcePath; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }` | PASS for all 15 JavaScript/test files changed by this merge (listed below). |
| `rg -n '^(<<<<<<<\|=======\|>>>>>>>)( \|$)' js style.css tests docs scripts index.html`; `git ls-files -u` | No conflict markers or unmerged index entries. |
| `git diff --check`; `git diff --cached --check` | PASS. |
| Bundled Python running `scripts/check_binaries.py` | PASS, no binary tracked files. |
| `git diff origin/main -- js/core.js js/pump.js js/calendar.js` plus local byte comparisons of incoming/nonconflicting files and chart functions/CSS | Reviewed; only intended prior core/pump PR differences remain, calendar and other main-only files exact, main chart behavior/placement exact, unrelated POLISH product files unchanged. |
| `git fetch origin main`; `git merge-base --is-ancestor origin/main MERGE_HEAD` | PASS; fetched main remains `8f48067`. |

Syntax-checked files: js/calendar.js, js/core.js, js/pump.js, scripts/ph03-browser-matrix.js, tests/atomic-persistence.test.js, tests/cjcd01b-calendar.browser.cjs, tests/cjcd01b-calendar.test.js, tests/cjo04c-readback.test.js, tests/fixtures/cjcd-calendar.js, tests/fixtures/cjcd-shop-log.js, tests/global-identity-repair.test.js, tests/historical-import-readiness.test.js, tests/polish01.browser.cjs, tests/polish01d.browser.cjs, tests/pump-baseline.test.js.

Browser commands used `OMAX_PLAYWRIGHT_PATH=C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright`. Fresh headless Edge contexts used local devsafe storage, America/Chicago, fixed test time and blocked all external requests. Actions widths: 1920/1280/1024/800/390; DPR 1/1.25/1.5. Pump DPR 1/2 at normal/resized/expanded sizes.

Initial adapted pump assertions failed on test expectations (formatted RPM contains a comma; main deletes the cleared hover key). The fixture assertions were aligned with main; product code was not changed to satisfy them. Final runs above have no failing checks. A full system suite and the broad PH03 browser matrix were not run.

## Remaining verification and safety

Operator approval remains required before merge. Manually check the deployed PR revision in the operator's actual browser/zoom, pump low/middle/high points and notes, popup/menu actions and ordinary Firebase sign-in/session behavior. Automated checks did not use live Firebase, a real account or the operator's password manager. Cross-browser and toolbar zoom verification remain manual.

No production Firebase requests/data edits, migrations, schema rewrites, historical deletions, credential embedding or password changes. Baseline history, historical RPM logs and RPM business calculations follow main; revision/CAS, prepared-state validation, save verification and Recovery Mode protections remain enabled. PR #501 is left for manual approval and is not merged.
