# POLISH-01: small UI and interaction fixes

Started from fetched `origin/main` at `a279fbed298c53b8d7206ca02a582efed3e1cdfe` in an isolated checkout on `codex/production-polish-small-bugs`.

Each item was inspected before editing. Changes are limited to existing view markup, CSS, local form handling, menu positioning and the recovered authentication-dialog shortcut. Scheduling, calculations, import/export behavior and persistence architecture remain unchanged.

## Implemented

| Item | Files | Inspection and resulting behavior |
| --- | --- | --- |
| 1. Next Due empty state | `js/renderers.js` | Empty results previously invoked `buildNextDuePreview()`, which displayed demo maintenance tasks. Replace only that empty branch with a green existing `chip green-better` saying **Caught up!**, followed by **No new tasks are required.** Existing due-task selection is unchanged. |
| 2. Pump popup and tooltip | `js/pump.js`, `style.css` | Clicked points open the existing notes dialog. Override the inherited site-header colors locally, promote RPM to a large value, and retain date/time/range and notes. Hover positioning now uses a fixed 10px gap, accounts for the canvas position within its wrapper, and retains above/below flipping; remove transform animation that briefly used the previous point's offset. RPM data and calculations are unchanged. |
| 3. Average Cut Hours/Day sizing | `js/views.js`, `style.css` | The banner previously sat outside `dashboardLayout`. Wrap it in the existing dashboard-window system with `averageHours` identity, full width in the default grid, and existing responsive/custom resize behavior. Existing saved layouts add the missing widget through their current layout-entry helper. No calculation or data-source changes. |
| 4. Maintenance Settings import contrast | `js/renderers.js` | Use existing brand/card variables for the import section, instructional text, inputs, file-picker button, action buttons and readable disabled states. Import handlers remain unchanged. |
| 7. Export Range CSV placement | `js/views.js` | Move the existing button into `cost-receipt-summary-controls` beside Range. Keep its data attribute and existing export handler. |
| 8. Copied-job dates | `js/renderers.js` | The copy dialog retained past source dates. When Start Date advances beyond that stale due date, immediately advance the actual due input value to the new start day and update the existing minimum/duration. Normalize defaults through existing local date-only helpers. A due date explicitly chosen before start still fails the original validation; same-day dates remain allowed. No persistence changes. |
| 9. Actions menu visibility | `js/renderers.js`, `style.css` | Existing absolute menus were clipped by table/card overflow. Use native manual popovers in the original DOM, clamp to the viewport, flip upward when needed, and reposition on scroll/resize. Remove listeners through existing close/route cleanup. All original actions and delegated events remain intact. Browsers without native popovers retain their existing menu behavior. |
| 11. Fraction dimensions | `js/renderers.js`, `js/views.js` | Path length/width parsing was local to Add Job's material calculation and creation form. Accept decimal/scientific numbers or one numeric division, e.g. `3/12` becomes numeric `0.25` feet. Reject malformed expressions, zero denominators, nonfinite/nonpositive dimensions with form validation. No `eval`, inventory/import changes or new stored fields. |
| 12. Quick Sign-In hotkey | `js/core.js` | History commit `947b9d3` clearly identifies Ctrl/Cmd+S as opening the ordinary Firebase sign-in dialog and focusing/selecting email. Restore that behavior only when signed out; ignore repeats, extra modifiers, prevented events, inputs, textareas, selects, editable elements and textbox ancestors. No credentials are supplied, stored or exposed. |

## Already satisfied on current main; retained and verified

| Item | Evidence and scope decision |
| --- | --- |
| 5. Purchase Name overflow | Current Purchase History uses the week and range tables, rather than a separately named Past View. `style.css` already uses fixed layout and 220px name columns with normal whitespace, `overflow-wrap:anywhere` and clipping. The browser test inserts an unbroken 640-character name into the range table and confirms the text stays before the adjacent Part # column. No duplicate CSS added. Verify the reported production screen manually if it is a different view. |
| 10. Save and Close | Current job editing is inline, rather than a separate job-edit modal. Both active/history Save handlers await `saveCuttingJobEdit`, require `saved && verified && !requiresReload`, then clear editing state and rerender. Added regression coverage proves the edit remains open while pending and on failed/indeterminate outcomes, and closes after verified success. Existing recovery feedback is preserved. Verify any separately observed modal against the deployed revision. |

## Deferred

| Item | Why unchanged / subsystem / separate follow-up |
| --- | --- |
| 6. Purchase History Edit Inventory | No exact Edit Inventory button or Past View is present in current `main`'s Purchase History. Current code has a separate purchase-link repair dialog's **Inventory settings** navigation and a disabled **Edit inventory link** control in Maintenance Settings. Current source and case-sensitive/insensitive history searches did not establish the reported control's identity. This touches purchase-to-inventory navigation/linking; confirm the deployed revision and exact screen/action in a dedicated follow-up before removing controls or inventing inventory behavior. |
| 13. Firebase busy cursor | There is no wrapper/state encompassing all Firebase operations. Core authoritative saves/loads, isolated material and cutting-job writers, live listeners, membership metadata and cloud file upload/list/download use different paths. Covering them requires cross-system pending-operation ownership, overlap tracking and cleanup, beyond this small PR. A dedicated async/UI-status PR should own that work. |

## Files changed

- `js/core.js`, `js/pump.js`, `js/renderers.js`, `js/views.js`, `style.css`
- `tests/cjpc01-manual-paths.test.js` (load local parser in its existing VM harness; test verified edit exit)
- `tests/polish01-hotkey.test.js` (normal-dialog shortcut and editable-focus guards)
- `tests/polish01.browser.cjs` (disposable browser regression)
- `docs/polish-01.md` (this scope/testing record)

## Tests actually run

No `package.json` exists, so no npm, build, lint or type-check command was run.

| Command | Result |
| --- | --- |
| `node --check <file>` for every changed JavaScript/test file plus `js/router.js`, `js/computations.js`, `js/calendar.js`, `js/materialCalculator.js`, `js/cuttingJobDateEditing.js` | PASS |
| `node --test tests/cjpc01-manual-paths.test.js tests/cfr06-cutting-job-ui.test.js tests/cjd01-job-deletion.test.js tests/purchase-financials.test.js tests/polish01-hotkey.test.js` | PASS; 109 tests. Existing persistence/deletion tests use mocked in-memory state. |
| `node --test tests/polish01.browser.cjs` with `OMAX_PLAYWRIGHT_PATH` set to the bundled installed Playwright package | PASS; 7 tests, including six browser subchecks, in headless Edge with a fresh disposable profile, America/Chicago timezone, local `?devsafe=1` backend, and all external requests blocked. No browser JavaScript errors. |
| `rg -n` searches for modified handlers/selectors/functions and `git log --all -S` / `git show 947b9d3` shortcut/control inspection | PASS; expected wiring and history inspected. |
| `git diff --check` | PASS |
| `python scripts/check_binaries.py` using the bundled Python runtime | PASS |

Initial validation runs failed on test harness/setup issues (missing form context, missing valid project/category fixture values, hidden add form and Settings hydration after an empty fixture). Those were corrected before the passing runs above. The first sandboxed headless Edge launch also failed at profile initialization; the same isolated browser checks ran successfully with approved unsandboxed execution. Browser tooltip geometry checks prompted the final canvas-offset/animation correction. No remaining failing checks.

## Manual checks still required

- Dashboard: empty Next Due text and green appearance; real due tasks still visible; pump clicked-point contrast/RPM prominence; hover low/middle/high RPM points, expanded chart and zoom; average-hours widget at varied zoom/window sizes and an existing custom layout, including move/resize.
- Maintenance Settings: import labels, instructions, file selector, confirmation placeholder, buttons/disabled state and preview/status text readable. Do not execute an import against production for this check.
- Purchase History: long names in both week and range views at varied zoom; identify the separately reported Past View/Edit Inventory control; Range export beside Range and its existing download behavior.
- Cutting Jobs: copy a past job and move start to today without reselecting due; same-day allowed, earlier due rejected; active/history Actions at right and bottom edges, horizontal scrolling, resize, Escape and every preserved action; Save exits edit only on verified success and retains edits/error feedback on failure; `3/12` versus `.25` feet yields the same dimensions/material totals, decimals still work and malformed/zero-denominator input is rejected.
- Quick Sign-In: signed-out Ctrl/Cmd+S opens normal sign-in; entering text in input/textarea/select/contenteditable never triggers it; signed-in sessions ignore it. Actual authenticated sign-in was not exercised.
- Check browser console for new errors. Cross-browser testing and live Firebase save/failure behavior remain untested. Global Firebase cursor was deferred, so no cursor check is claimed.

## Data safety

No production data was changed. No Firebase schema changes, collection rewrites, data migrations, resets, historical record deletions or destructive operation were executed. No Clear All Data action was triggered. Browser testing used only a fresh disposable local backend; tests preserved existing protected-data/ID behavior and did not access production Firebase or user credentials. None of the expressly excluded larger items was implemented.
