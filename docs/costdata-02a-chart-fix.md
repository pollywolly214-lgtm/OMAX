# COSTDATA-02A: maintenance estimates and chart interaction

**Superseded behavior:** COSTDATA-02B now treats a blank price on a valid,
unambiguous linked task as estimated zero, and chart clicks navigate to exact
Central Data Table events instead of cycling tooltips. See
[COSTDATA-02B](costdata-02b-zero-cost-navigation.md) for current rules and tests.
The 02A results below describe the earlier implementation and integrations.

Current integrated main: `c28c18869562805ec5ae776d73d0f07b2c9b5efd` (including #529).
Initial implementation base: `7edc7ea5e986cb6ffaeb8203ece5755b168b00d3` (merged #519).
Branch: `codex/costdata-02a-chart-fix`. This is a new PR; #519 is unchanged.

## Findings and calculation precedence

The existing shared normalizer, `OMAXCutCostFeedback.maintenanceRows`, already
resolved valid configured task duration after occurrence duration. Its final
fallback was null, however, so known-parts history without any valid duration
remained incomplete and was excluded from complete expenses and the blue line.
01F drew partial diamonds/unknown triangles and explicitly expanded its entire
event list on click. Its tooltip transform/positioning could also escape the
chart, and canvas hit testing used unscaled pointer coordinates under CSS zoom.

The shared normalizer now resolves nonnegative finite duration as follows:

1. Valid occurrence evidence (`loggedHours`, `timeHours`, `hours` for legacy;
   resolved occurrence-stream `loggedHours` for V2). Legacy task/date
   `occurrenceHours` remains the recorded fallback when the exact event has no
   valid duration. Exact event evidence takes precedence over this shared date
   override so separately identified same-day events retain their own durations.
2. Valid `downtimeHours` from the matching source task, canonical/template task,
   or explicitly linked V2 task, in the existing identity resolution order.
3. Derived zero hours, classified internally as `Zero-hour fallback`.

Missing, blank, negative, nonfinite, boolean and invalid values fall through;
numeric/string zero remains valid. No task-name matching is introduced. Existing
legacy/template/V2 links and archived payloads supply settings; no IDs, links or
saved inputs are changed. The existing maintenance rate remains **$30/hour**,
and configured duration remains in **hours**, matching Maintenance Settings.

Parts resolution is unchanged: existing occurrence snapshots, configured values
and stream cost reference determine the parts amount. An explicit zero is valid;
unknown parts remain null in `costFields.parts.value`. Internal compatibility
placeholders are not evidence of a known price. The existing separate treatment
of garnet refill material is preserved to avoid double counting hourly garnet.

Example: known parts $170 + configured 0.5 hr × $30 = **$185 estimated**.
With no valid duration anywhere, that event instead costs **$170 estimated**.
With unknown parts it remains **Cost unavailable**, even if labor is calculable.

## Financial semantics

These are estimated maintenance expenses, not evidence of paid invoices or
actual historical labor. Occurrence and configured provenance remains available
in `costFields`, `costEstimated`, source identities and the reconciliation report.
Configured and zero-fallback points receive a concise Estimated designation.

The same normalized rows feed the central table, historical complete subtotal,
blue series, daily average, maintenance windows/breakdowns, forecasts and
maintenance cost per cutting hour. Therefore known-parts events previously
excluded only for missing labor now legitimately change these estimates.
Daily blue amounts remain the sum of that day's complete events; the existing
daily-average denominator and negative expense convention are preserved.

Unknown-price events contribute neither a partial parts amount nor partial labor
to the cost-feedback complete subtotal. The calculated per-hour rate still
remains unavailable if its measured window contains an unknown-price event.
The financial reconciliation and forecasts already exclude incomplete rows and
continue to do so. Cumulative-meter boundaries and requested financial windows
are unchanged. No changes are made to cutting-job revenue/contribution, purchase
history, material formulas or overlapping expense classification.

Synthetic examples exercised in the browser:

- Original 01F pattern: all 84 entries retained; 82 complete, 2 unknown-price
  indicators; 20 early events enter the blue line beginning January 2. Complete
  subtotal becomes $2,530, rather than the former $2,000. These are synthetic
  values, not production counts or a production reconciliation.
- Focused fixture: blue amounts and complete subtotal both $459; daily average
  is -$459/9; YTD annualized forecast is $459/299 × 365. A January measurement
  window uses the same $255 of resolved expense over 10 measured hours ($25.50/hr).

## Presentation and layout

- Ordinary filled blue maintenance points retain daily aggregation. Each day's
  point retains every `sourceEventKey` and task reference. Clicking cycles one
  short event tooltip at a time, with the daily total and an event counter.
- Unknown prices use small blue circular date indicators above the monetary
  plot. Their monetary value is null; their short tooltip gives task, date and
  Cost unavailable. Same-day indicators likewise retain every identity.
- Removed the partial diamonds, warning triangles, lengthy legend, expandable
  list and its auto-expansion behavior. The central history table remains.
- Tooltips are constrained to the intersection of canvas, dashboard panel and
  viewport, using logical coordinates for CSS zoom; no translated arrow or
  overflowing overlay can extend into unrelated widgets. Pointer hit testing
  accounts for scaled canvas bounds. Chart children do not shrink through each
  other in short custom windows; the existing panel scrolling handles overflow.
- Narrow canvases get additional vertical room for readable cost lines. No
  blank list area or saved layout changes are introduced. ResizeObserver and
  existing layout-resize behavior remain in use.

## Initial implementation regression testing

There is no package.json or package-script runner in this checkout. Tests use the
existing Node test runner and Playwright/Edge harness. Commands run from the new
worktree; all browser mutation cases use disposable localhost DevSafe backends,
with non-local network requests blocked and production Firebase absent.

```powershell
$costdataTests=@(rg --files tests -g '*.test.js')
node --test --test-concurrency=4 --test-reporter=tap $costdataTests > artifacts/costdata-02a-final-all-unit.tap

$costdataCritical=@(rg --files tests -g '*.test.js' | Where-Object {$_ -match '[\\/](costdata-|mdel|mhist|rfs|maintenance-|financial-reconciliation|cut-cost-|atomic-persistence|global-identity|inventory-identity|firebase-|recovery-import|purchase-financials)'})
node --test --test-concurrency=4 --test-reporter=tap $costdataCritical > artifacts/costdata-02a-critical-unit.tap

$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$costdataBrowsers=@(rg --files tests -g '*.browser.cjs')
node --test --test-concurrency=2 --test-reporter=tap $costdataBrowsers > artifacts/costdata-02a-final-all-browser.tap

node --test --test-concurrency=2 --test-reporter=tap tests/costdata-01a.browser.cjs tests/costdata-01b.browser.cjs tests/costdata-01c.browser.cjs tests/costdata-01d.browser.cjs tests/costdata-01f.browser.cjs tests/costdata-01g.browser.cjs tests/costdata-02a.browser.cjs tests/financial-reconciliation.browser.cjs > artifacts/costdata-02a-final-costdata-browser.tap
node --test --test-reporter=tap tests/costdata-02a.browser.cjs > artifacts/costdata-02a-final-focused-browser.tap
```

Results: critical unit/integration/safety **540 pass, 0 fail** across 32 files;
full unit suite **1,969 pass, 10 fail** (1,979 total, no skips).
Full repository browser suite: **130 pass, 4 baseline failures** (134 reported
tests, no skips); the exact same failed scenarios and parent reproduce on main.
Cost Analysis
browser selection **23 pass, 0 fail**; focused browser case rerun after the last
narrow-height/panel-containment adjustment **1 pass, 0 fail**. Browser coverage
includes 1440px/390px viewports and 100%, 125%, 200% CSS zoom, full tooltip-content
visibility, a shortened/resized panel, period changes, delayed reads/snapshots,
navigation/reload, exact same-day identities, archive/cancellation/restore,
unchanged cloud/settings/business snapshots, and zero chart-display save calls.
01F/01G expectations were deliberately updated for the new cost semantics;
their source-history, identity, persistence and safeguard assertions remain.

### Independent baseline comparison

```powershell
git archive --format=zip --output=artifacts/costdata-02a-main-baseline.zip 7edc7ea5e986cb6ffaeb8203ece5755b168b00d3
Expand-Archive -LiteralPath artifacts/costdata-02a-main-baseline.zip -DestinationPath artifacts/costdata-02a-main-baseline
# From that extracted main directory:
$costdataTests=@(rg --files tests -g '*.test.js')
node --test --test-concurrency=4 --test-reporter=tap $costdataTests > ../costdata-02a-main-unit.tap
node --test --test-reporter=tap tests/polishv2.browser.cjs > ../costdata-02a-main-polishv2-browser.tap
```

Untouched exact main gives **1,964 pass, the same 10 unit failures**, 1,974 total:

- canonical actual Jobs add handler stops before dependent mutation
- mixed actual Jobs add handler stops before dependent mutation
- actual repair UI disables a blocked audit and reports a late blocker without success
- active and history unrelated edits keep the exact legacy pair
- active and history category edits update both fields after validation
- active and history Save exclude the live edited job from conflicting ownership evidence
- active and history edits stay open until verification, including failed/indeterminate saves
- CJPROFIT-01: active/history save signed cost and fractional cut time without unrelated changes
- CJADD-01A: real draft capture retains all form values including minutes before file selection
- ACC02 historical recorded duration overrides zero and positive estimates in a calculation-only copy

These are existing Jobs harness/helper/repair expectations and the Projects
duration-copy expectation. No COSTDATA/MHIST/MDEL/RFS critical test fails.

POLISHv2 on untouched main gives **17 pass, 4 fail**: three failed scenarios
plus their parent. The scenarios are historical project reassignment to Mesquite
1242, historical category selection/save/reload, and new-category name/color
selection/cancel/ownership. Two compare an old derived efficiency cache with its
canonical saved values; one calls inputValue on a non-input project element.
They are unrelated baseline failures, not passes and not repaired here.

Additional static checks: `node --check` on every changed/new JS/CJS file,
`git diff --check`, and the bundled Python runtime running
`scripts/check_binaries.py` all pass. Local TAP logs, screenshots and baseline
archives stay under untracked artifacts and are not included in the PR.

## Remaining verification and risks

Production Firebase was not accessed or modified. No migrations or persistence
code changes were made; Recovery Mode, archive/identity validation, CAS/revision
checks and save guards remain unchanged and are exercised by existing tests.
No cutting jobs, purchases, source history, rates or layout preferences are
rewritten by this change.

CSS zoom and responsive viewport behavior are tested; native browser-toolbar
zoom, authenticated preview behavior, real configured durations, real archived
references and actual production totals still require live F12 verification.
Verify a known historical event's recorded/configured/zero precedence, $30/hr
estimate, concise tooltip, unknown-price indicator, selected-period totals,
short saved dashboard layouts and absence of view-triggered writes. Configured
duration is today's preserved task setting, not proof of historical labor; the
Estimated designation communicates this limitation. Do not merge until that
preview review is complete.


## Latest main integration — October 28, 2026

Integrated main `c28c18869562805ec5ae776d73d0f07b2c9b5efd`, which adds #529
(MDEL-01C inventory deletion and archive-aware inventory references). The merge
was clean: no conflicts or manual application changes were required. The core
writer, identity validator, inventory archive module, script registration and
shared maintenance harness match this main revision exactly. The COSTDATA labor
fallback, chart presentation and styling remain intact. No production state was
accessed or modified.

Tests were run on the combined worktree before committing the integration:

```powershell
$integrationTests=@(rg --files tests -g '*.test.js')
node --test --test-concurrency=4 --test-reporter=tap $integrationTests > artifacts/costdata-02a-main-update-all-unit.tap
$integrationCritical=@(rg --files tests -g '*.test.js' | Where-Object {$_ -match '[\\/](costdata-|mdel|mhist|rfs|maintenance-|financial-reconciliation|cut-cost-|atomic-persistence|global-identity|inventory-identity|firebase-|recovery-import|purchase-financials)'})
node --test --test-concurrency=4 --test-reporter=tap $integrationCritical > artifacts/costdata-02a-main-update-critical-unit.tap
# With the same Playwright runtime environment shown above:
node --test --test-concurrency=2 --test-reporter=tap tests/costdata-01a.browser.cjs tests/costdata-01b.browser.cjs tests/costdata-01c.browser.cjs tests/costdata-01d.browser.cjs tests/costdata-01f.browser.cjs tests/costdata-01g.browser.cjs tests/costdata-02a.browser.cjs tests/financial-reconciliation.browser.cjs tests/mdel01c-inventory-deletion.browser.cjs tests/mdel01-task-deletion.browser.cjs tests/mdel01c-restoration.browser.cjs tests/maintenance-history-reconciliation.browser.cjs tests/mhist01c-integration.browser.cjs tests/rfs01-save-reliability.browser.cjs tests/rfs02-save-audit.browser.cjs tests/rfs02b-cancellation.browser.cjs > artifacts/costdata-02a-main-update-browser.tap
```

Results: **573 critical unit/integration/safety tests passed**, **33 browser tests
passed**, with no failures or skips in either selection. The full unit suite has
**2,002 passed / 10 failed / 2,012 total**, with exactly the same ten previously
documented failures listed above. This integration did not rerun unrelated
POLISHv2 browser scenarios or create a new independent main baseline; the
previous baseline evidence remains historical. Syntax checks for incoming JS/CJS,
staged/unstaged whitespace checks and binary policy checks pass. Authenticated
preview/F12 verification remains outstanding. PR #528 stays draft and unmerged.
