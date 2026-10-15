# POLISH-01: small UI and interaction fixes

Latest reconciliation: [POLISH-01H main reconciliation, exact commands and remaining manual checks](polish-01h.md). [POLISH-01F](polish-01f.md) and the results below are historical iteration records; POLISH-01G restored the manual-only sign-in shortcut.

Started from fetched `origin/main` at `a279fbed298c53b8d7206ca02a582efed3e1cdfe` in an isolated checkout on `codex/production-polish-small-bugs`.

Each item was inspected before editing. Changes are limited to existing view markup, CSS, local form handling, menu positioning and the recovered authentication-dialog shortcut. Scheduling, calculations, import/export behavior and persistence architecture remain unchanged.

## Implemented

| Item | Files | Inspection and resulting behavior |
| --- | --- | --- |
| 1. Next Due empty state | `js/renderers.js` | Empty results previously invoked `buildNextDuePreview()`, which displayed demo maintenance tasks. Replace only that empty branch with a green existing `chip green-better` saying **Caught up!**, followed by **No new tasks are required.** Existing due-task selection is unchanged. |
| 2. Pump popup and tooltip | `js/pump.js`, `style.css` | Clicked points open the existing notes dialog. Override the inherited site-header colors locally, promote RPM to a large value, and retain date/time/range and notes. POLISH-01H retains current main's point selection, DPR/resize mapping, tooltip positioning and animation styles; obsolete PR positioning is removed. Compatible readable popup/RPM styling remains. RPM business calculations and baseline/history handling follow current main. |
| 3. Average Cut Hours/Day sizing | `js/views.js`, `style.css` | The banner previously sat outside `dashboardLayout`. Wrap it in the existing dashboard-window system with `averageHours` identity, full width in the default grid, and existing responsive/custom resize behavior. Existing saved layouts add the missing widget through their current layout-entry helper. No calculation or data-source changes. |
| 4. Maintenance Settings import contrast | `js/renderers.js` | Use existing brand/card variables for the import section, instructional text, inputs, file-picker button, action buttons and readable disabled states. Import handlers remain unchanged. |
| 7. Export Range CSV placement | `js/views.js` | Move the existing button into `cost-receipt-summary-controls` beside Range. Keep its data attribute and existing export handler. |
| 8. Make Active Copy | `js/renderers.js` | Open with local today; keep the modal open while category validation, guarded creation and server verification run. Show errors inline, allow a valid existing category for a new copy, block duplicate pending/uncertain retries, reuse one ID on definite-failure retry, then reveal the verified copy through the active category filter. Original historical job is preserved. |
| 9. Actions trigger/menu | `js/renderers.js`, `style.css` | Preserve native popover flipping/clamping and scroll/resize cleanup. Constrain the trigger and its flex label to the cell with shrinkable widths, wrapping and local padding, retaining keyboard/focus behavior. Older browsers without native popovers retain existing menu behavior. |
| 11. Dynamic dimensions | `js/cuttingJobDimensions.js`, `index.html`, `js/renderers.js`, `js/views.js`, `style.css` | Local Add Job input accepts decimal/division feet, explicit inches and feet/inches. Live preview and blur normalization display nearest 1/16 inch while retaining full numeric-foot precision for draft, area, material calculations and storage. Safe explicit parser rejects malformed/nonfinite/negative input. No historical dimension rewrites. |
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

- `js/core.js`, `js/pump.js`, `js/renderers.js`, `js/views.js`, `style.css`, `index.html`, `js/cuttingJobDimensions.js`
- `tests/cjpc01-manual-paths.test.js` (load local parser in its existing VM harness; test verified edit exit)
- `tests/polish01-hotkey.test.js` (normal-dialog shortcut and editable-focus guards)
- `tests/polish01.browser.cjs` (disposable browser regression; updated modal confirmation contract)
- `tests/polish01d-dimensions.test.js`, `tests/polish01d.browser.cjs` (unit/display precision and full copy/visibility/failure/menu/storage regressions)
- `docs/polish-01.md` (this scope/testing record)

## Tests actually run

No `package.json` exists, so no npm, build, lint or type-check command was run.

| Command | Result |
| --- | --- |
| `node --check <file>` for every changed JavaScript/test file plus `js/router.js`, `js/computations.js`, `js/calendar.js`, `js/materialCalculator.js`, `js/cuttingJobDateEditing.js`, `js/cuttingJobChronology.js`, `js/cuttingJobHistory.js` | PASS |
| `node --test tests/cjpc01-manual-paths.test.js tests/cfr06-cutting-job-ui.test.js tests/cjd01-job-deletion.test.js tests/purchase-financials.test.js tests/polish01-hotkey.test.js tests/polish01d-dimensions.test.js` | PASS; 118 tests. Existing persistence/deletion tests use mocked in-memory state. |
| `node --test tests/polish01.browser.cjs tests/polish01d.browser.cjs` with `OMAX_PLAYWRIGHT_PATH` set to the bundled installed Playwright package | PASS; 14 tests, including twelve browser subchecks, in headless Edge with a fresh disposable profile, America/Chicago timezone, local `?devsafe=1` backend, and all external requests blocked. No browser JavaScript errors. |
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

## POLISH-01D root causes and correction limits

- **Copy:** confirmation resolved and hid the dialog *before* category validation and `createCuttingJob`. A rejected category, revision, dirty baseline or verification result therefore left only a toast after dismissal. The active table independently filters on `jobCategoryFilter`, which can differ from the history category, hiding a successfully saved copy. Historical start dates were also reused as defaults. Confirmation now awaits the existing save coordinator, preserves its guards and exact errors, closes only for `saved && verified && !requiresReload`, then selects/reveals the new copy category. Legacy history can choose an existing validated project category for the copy without changing the original. This fixes both failing-creation feedback and successful-but-hidden cases; production's particular safeguard rejection cannot be inferred without its data and was not bypassed.
- **Duplicate prevention:** one confirmation runs at a time; controls/cancel are locked during it, one generated ID survives definite-failure retries, and an uncertain/committed-but-unverified result keeps the modal open with retry disabled and reload/read-verification guidance. The existing coordinator still owns revision, protected-data and Firebase verification/suspension behavior. Successful local end-to-end tests use that real coordinator, including a readback and exact historical-source comparison. A real write-gate rejection is also exercised without changing disposable cloud state. Additional failure/indeterminate UI cases inject bounded save outcomes; they do not contact production Firebase.
- **Actions:** a 100%-wide flex trigger with an intrinsic non-wrapping label, gap and inherited card padding could outgrow a constrained table cell. Local minimum/maximum widths, shrinkable/wrapping label and padding now contain it. The tested popup positioning code is unchanged. Verified at widths 1280/1024/800/390 and DPR 1/1.25/1.5, including keyboard Enter/Escape. These are viewport/display-scale tests, not actual browser-toolbar zoom tests.
- **Dimensions:** the prior parser only knew decimal/division feet and provided no engineering display. The new local helper parses feet, inches and mixed fractions, formats rounded sixteenths with 12-inch rollover, and caches exact numeric feet behind blur display. Input edits clear that cache; every draft/calculation/save read uses it consistently. `0.5005` displays `0'-6"` yet saves `0.5005`, including after draft restoration. Existing material calculator formulas are untouched. Current active/history edit screens contain no dimension fields; no new historical-edit/persistence path was introduced.

All three requested corrections are implemented locally; no additional feature was deferred. Original deferrals 6 and 13 remain unchanged. Initial POLISH-01D browser runs failed due to same-document hash navigation preventing fixture re-adoption and a wrong fixture material label; both test setup issues were corrected. Final unit and browser runs above pass, with no browser JavaScript errors.

Additional manual checks: repeat Make Active Copy on the deployed revision, confirm failed/indeterminate Firebase feedback without bypassing recovery, and verify all three corrected interactions at actual browser toolbar zoom levels and in other supported browsers. No live Firebase behavior or real user data was tested. No destructive operation, production data change, migration or schema change occurred. PR #501 remains unmerged.
