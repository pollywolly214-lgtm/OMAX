# DASHFIX-01A — Dashboard bug batch

Based on current `origin/main` at `907dc69` (PR #521). Branch: `dashfix-dashboard-polish`.

## Root causes and fixes

### A — Hour editor

Add entry copied the first row's date/hours and appended the copy at the bottom, outside the visible scroll area. It now prepends a genuinely blank row, resets the table's vertical and horizontal scroll, and focuses its date field. Additional drafts do not rebuild or renumber existing DOM rows. Reopening still shows newest dates first; submission still sorts readings chronologically before using the existing save pathway.

The submit handler also rebuilt every record as just `{dateISO, hours}`, discarding identity, import provenance, notes, and other metadata on a real edit. A modal-local Map now associates each existing DOM row with its original record; submission overlays only its edited date/hours. Drafts have no persisted identity fields added. Blank hour inputs cannot silently become zero. Existing no-op, duplicate-date, negative-hour, gap-confirmation, daily-hour recomputation, and protected save behavior remain in place.

### B — Last updated

The authoritative source is cumulative machine-reading history, `totalHistory`, not `dailyCutHours`, cutting jobs, pump RPM logs, or workspace save metadata.

Evidence for the existing semantics:

- The original `viewDashboard` read `totalHistory[totalHistory.length - 1].dateISO`; it did not read an edit/save timestamp.
- Dashboard Log Hours creates `{dateISO: todayISO, hours}` or edits today's reading. It does not create a per-reading edit timestamp.
- `historicalImport.append("pump_hours", ...)` imports readings into `totalHistory` with their historical `dateISO` and provenance. `dailyCutHours` is a separate daily-hours representation used by calculations.
- `core.js` adopts `totalHistory` from the authoritative Firebase state on initial load and realtime adoption. Workspace `syncMeta.updatedAtISO` covers saves across the entire workspace; it cannot establish when cutting hours were logged or edited.

Therefore Last updated means **latest logged reading date**, not latest edit/save time. The new read-only label takes the maximum valid reading date regardless of array order or reading magnitude. It formats that calendar day locally, avoiding the old UTC-midnight conversion that displayed the previous date in Chicago. The artificial midnight time is removed. A tooltip explains the meaning. Editing an older reading's hours does not advance the label; changing a log date recomputes the maximum. New or imported readings advance it only when their log date is newer. Missing/invalid history displays `—`, without falling back to unrelated save times. Zero is a valid reading.

No history is sorted or rewritten by this read path. No timestamp field, collection, or schema change is introduced.

### C — Search bubble

The unwanted bubble was the empty `#dashboardGlobalSearchSuggestions` element. Its author CSS `display:flex` overrode the browser's default handling of `hidden`, leaving its padding/border/shadow visible even when suggestions were empty. A narrowly scoped `[hidden]{display:none}` rule removes that empty visual and its box. The input, suggestions, result buttons, click handlers, navigation, native keyboard behavior, and status text remain intact. Existing keyboard navigation uses Tab and native button activation with Enter/Space; no arrow-key handler existed in this Dashboard search.

## Changed files

- `js/renderers.js`: blank row placement, scrolling/focus, original-record mapping, empty-hours form validation.
- `js/views.js`: latest logged-date display and explanatory tooltip.
- `style.css`: honor the search suggestions container's hidden state.
- `tests/ach-edit-logged-hours-noop.test.js`: return real row identities in the harness; test provenance mapping and blank-hour rejection.
- `tests/dashfix-dashboard.test.js`: log-date semantics, Chicago/DST dates, invalid/missing histories, actual reviewed Pump Hours imports.
- `tests/dashfix-dashboard.browser.cjs`: isolated local browser regression suite.
- `docs/dashfix-01a-dashboard.md`: this trace, verification record, and checklist.

## Actual verification

No `package.json` or npm scripts exist. No npm command was run.

**PASS — 49 Node tests, 0 failures:**

```powershell
node --test tests/dashfix-dashboard.test.js tests/ach-edit-logged-hours-noop.test.js tests/ach-average-cut-hours.test.js tests/atomic-persistence.test.js tests/production-hardening.test.js
```

Coverage includes actual importer append behavior, metadata after reordered/date-edited modal rows, unchanged-save no-ops, gap confirmation, invalid inputs, existing Average Cut Hours cases, manual overrides, imported cumulative readings, refresh/hydration, revision/CAS conflicts, protected preflight rejection, and fail-closed persistence. Date edits in the modal are tested in the Node harness; the cloud browser roundtrip tests hour edits and new rows.

**PASS — 6 browser scenarios (7 Node runner tests including the parent), 0 failures:**

```powershell
$env:OMAX_PLAYWRIGHT_PATH='<installed Playwright package path>'
node --test tests/dashfix-dashboard.browser.cjs
```

Headless Microsoft Edge, America/Chicago timezone, 1440px and 390px layouts. Each browser context is disposable; every request outside the localhost fixture server is blocked, and the suite asserts that Firebase SDK initialization is absent. Saves use the existing application save path against the local disposable backend, including awaited verified save results and fresh page/cloud loading.

- Both widths: top blank rows, immediate date focus, both scroll axes reset, multiple editable drafts, stable DOM identities, removal of a draft, chronological saves, edited value/provenance retention, reopening and refresh, manual daily-hour retention, unchanged protected business fields, stable average after reload, modal/save-button bounds.
- Empty history: add/remove a blank row, direct Log Hours, same-day hour update, verified saves and fresh reloads.
- Cloud hydration: out-of-order dates, a recently edited older reading, imported newer reading, and missing logs; rendering leaves source history unchanged.
- Both widths: hidden empty/no-match/cleared suggestions have zero height; real suggestions remain visible with no extra gap; native Tab/Enter/Space navigation reaches cutting-job and maintenance results; mouse navigation reaches archived cutting jobs. No browser page errors.
- Desktop/mobile screenshots inspected, including focused blank row and populated search results. The existing narrow hour table scrolls horizontally within its dialog.

**PASS — syntax and diff checks:** `node --check` on both changed application JS files and all three changed/added test files; `git diff --check`; targeted source searches for the timestamp readers/writers, importer, cloud adoption, search handlers, and protected-file scope.

Earlier browser attempts failed before the final passing run: Edge could not launch in the command sandbox; the test was rerun outside it. Initial harness attempts then used same-document fragment navigation instead of a reload, checked saves before their promises completed, and used a mismatched URL glob. Those test-harness issues were corrected; the final suite passes without bypassing application persistence safeguards.

## Untested workflows and safety

Production/authenticated Firebase, Firebase SDK/server/cache behavior, live multi-client Firebase sessions, real workbook upload/review UI, cloud-persisted log-date moves/removals, Firefox, Safari, physical touch devices, and assistive-technology operation were not exercised. Import append behavior is covered in Node; imported cloud hydration is covered with synthetic records in the browser. The existing date-keyed remote merge/retention behavior is unchanged.

No production records were read or modified. No stored-hour migration or automatic correction was added. No Cutting Jobs, Maintenance, Purchase History, Inventory, Firebase schema/collections, Recovery Mode, revision/CAS safeguards, or protected-data validation implementation was changed. Average Cut Hours and other hour formulas, recomputation rules, and Firebase persistence implementation are unchanged. Only intentional disposable fixture edits were saved during tests. **Clear All Data was never executed or tested.**

## Brief browser verification checklist

Use disposable data:

1. Open Edit past logs, scroll the table down/right, add two entries. Confirm blank rows appear at the top, with the date field visible/focused and prior edits intact.
2. Fill distinct dates/hours, edit one historical value, save, reopen, and refresh. Confirm values, provenance, historical readings, and ordering survive.
3. Confirm Last updated follows the latest log date, including older edits and imports, and shows `—` when history is absent. Compare Average Cut Hours before/after a no-op refresh.
4. At desktop and narrow widths, check empty/cleared search, matching results, Tab/Enter/Space, and mouse navigation to maintenance, active jobs, and history.

Do not merge as part of this task.
