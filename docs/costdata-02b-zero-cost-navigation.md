# COSTDATA-02B: calculated zero costs and exact event navigation

Updates existing draft PR #528 on `codex/costdata-02a-chart-fix`. Includes main
`c28c18869562805ec5ae776d73d0f07b2c9b5efd` and its archive-aware inventory safeguards.
No new PR, production migration, Firebase repair or automatic merge.

## Root causes

02A deliberately retained blank parts prices as unknown. Valid linked Settings
tasks therefore still produced nonmonetary circles above the graph, even when a
blank price should mean estimated zero under the revised business rule. 02A also
intercepted maintenance clicks to cycle tooltips and returned before invoking
`window.__focusCostDataCenterRow`.

The existing row focuser accepted task/date references but ignored stable source
keys and could fall back to another row. The Settings destination used the graph
task ID, including V2 IDs, rather than the exact linked editable legacy task.
Archived tasks consequently needed an explicit history destination. A missing V2
calendar chip could invoke an occurrence-removal repair during navigation; this
automatic repair call is removed, along with its fallback to another root of the
same instance. Explicit repair tools and their safeguards are unchanged.

## Current calculation rules

`OMAXCutCostFeedback.maintenanceRows` now resolves task identity through the
existing maintenance archive resolver. It verifies unique legacy/V2 definitions,
explicit legacy links, source-task family membership and template links. It never
matches names. Active/archive collisions, missing references and ambiguous
definitions stay incomplete and require review, even if a candidate has an
apparently usable price. The existing global validator still controls Recovery
Mode; no identity checks or save gates are relaxed.

For a valid matching task:

1. Parts use the first valid occurrence-specific amount, including explicit zero.
2. Otherwise use valid matching configured price/cost/calendar-price fields in
   their established order.
3. If those setting fields are absent, null, empty or whitespace, use derived $0.
   Invalid nonblank configured values remain review items, not assumed zeros.
4. Duration uses valid occurrence evidence, then the matching task setting, then
   derived zero hours, preserving explicit zero. The existing $30/hour rate and
   hour units remain unchanged.

Examples: blank parts + blank duration = **$0 estimated**; blank parts + 0.5 hours
= **$15 estimated**; $170 parts + blank duration = **$170 estimated**. No zero is
inserted into a source occurrence or saved setting. `costFields.parts.source`
distinguishes `Occurrence-specific`, `Configured default` and
`Blank setting assumed zero`. Duration retains recorded/configured/fallback
provenance. Derived blank values are estimates, not recorded historical payments.
The special hourly garnet-material exclusion remains intact.

Complete rows use ordinary blue daily totals, including real zero on the $0
baseline. Same-day aggregation and expense signs are unchanged; numeric zero is
canonical positive zero. Only unresolved/invalid evidence retains a compact
review indicator outside the monetary plot. Its tooltip asks for a task-link or
price review. It has no invented dollar value and cannot enter complete totals.

The shared rows feed the central table, daily series, historical subtotal,
average, rate numerator and forecasts. Purchases, cutting-job contribution,
material formulas and cumulative-meter boundaries are unchanged. Tests retain
the distinct purchase rule: a blank purchase price is still incomplete.

## Navigation and supported correction

Maintenance point clicks/taps pass all represented `sourceEventKey` references to
the existing Central Data Table popup, select Maintenance Tasks, reset stale
filters, reveal exactly those events, scroll the first into view and briefly
highlight every represented row. V2 root/instance references and exact legacy
task/date pairs are supported when a stable source key is absent. A stale supplied
key never falls back to a different event. A short selection count and Show all
maintenance action make group filtering explicit. Hover remains informational;
it no longer cycles events on click. Spending and cutting-job click paths remain.

The existing destination selector opens the exact linked Maintenance Settings
task. Its existing editor now accepts explicit zero duration and shows absent
duration as blank, rather than displaying an unsaved default of one hour. Native
Calendar-only definitions disable the unavailable Settings destination and retain
Calendar navigation. Archived destinations open their original read-only History
and explain that the existing Deleted History restore workflow is required before
editing. No replacement task is created.

Settings writes continue through the existing ordinary writer, CAS, independent
verification, audit, content and protected-state checks. Cost normalization uses
the existing last authoritative task snapshot while local Settings edits are
pending or denied. Therefore unsaved draft values do not masquerade as persisted
expenses. After a verified save, the snapshot and derived values refresh without
a hard reload. This adds no persistence system, exemption or rollback bypass.

## Automated verification

No package.json is present. Tests use the repository's existing Node/Playwright
infrastructure. Browser mutation tests are confined to disposable localhost
DevSafe backends, assert Firebase is absent and block all external requests.

New unit tests cover blank/invalid/recorded/configured values and explicit zeros,
archived/V2/source-family identity resolution, duplicate identities, missing links,
same-day deduplication, canonical rates, and read-only missing-chip navigation.
The desktop/mobile browser cases cover the reported Jewell task/date using
synthetic evidence, zero-baseline placement, exact selection/highlight/scroll,
stale-key rejection, same-day groups, unchanged spending/job navigation, native
V2 Calendar navigation, archived History, zero view/navigation writes, existing
Settings edits, pending costs, verified recalculation and denied-save retention.

The Settings test waits for each verified field save, advancing its synthetic
clock and using the existing `saveCloudNow` verification API to flush the duration
edit. It does not claim atomic two-field editing. An early fixture with an
incomplete empty pump object correctly tripped the existing pump protected-count
guard on subsequent saves. The new fixture uses a canonical empty baseline audit
array; no application guard or production pump data was changed to pass the test.

Existing 01A/01C/01F/01G/02A and cost-feedback expectations are updated only where
blank linked settings and click behavior were deliberately superseded. Their
history preservation, source identity, monetary reconciliation and no-write
assertions remain. The 84-event synthetic 01F pattern retains all 84 events, now
with 84 calculable costs; its complete subtotal remains $2,530. This is synthetic,
not a claim about current production totals.

```powershell
$costdataTests=@(rg --files tests -g '*.test.js')
node --test --test-concurrency=4 --test-reporter=tap $costdataTests > artifacts/costdata-02b-complete-unit.tap

$costdataCritical=@(rg --files tests -g '*.test.js' | Where-Object {$_ -match '[\\/](costdata-|mdel|mhist|rfs|maintenance-|financial-reconciliation|cut-cost-|atomic-persistence|global-identity|inventory-identity|firebase-|recovery-import|purchase-financials)'})
node --test --test-concurrency=4 --test-reporter=tap $costdataCritical > artifacts/costdata-02b-critical-unit.tap

$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$costdataBrowsers=@(rg --files tests -g '*.browser.cjs')
node --test --test-concurrency=2 --test-reporter=tap $costdataBrowsers > artifacts/costdata-02b-verified-browser.tap
```

Critical unit/integration/safety result: **585 passed, 0 failed**. Full unit result:
**2,014 passed, 10 failed, 2,024 total**, no skips. Failing names match the ten
previously documented Jobs/Projects baseline failures in the 02A report; they are
not reported as passes. Final full browser result: **133 passed, 4 failed, 137 total**, no skips.
The new 02B desktop/mobile cases both pass, including the existing verified and
denied Settings writer. The four failures match the previously independently
reproduced POLISHv2 baseline: historical project reassignment, historical category
selection/save, new-category name/color selection, and their failed parent suite.
No new COSTDATA browser failure remains. Earlier exploratory runs exposed fixture
and synchronization issues; the figures here describe the final corrected run.
Syntax, whitespace and binary-policy checks pass. Core persistence, archive,
identity, purchase and financial reconciliation modules are unchanged from main.
Local test artifacts are not committed.

## Changed files for 02B

- `js/cutCostFeedback.js`
- `js/renderers.js`
- `js/views.js`
- `tests/costdata-02b.test.js`
- `tests/costdata-02b.browser.cjs`
- `tests/costdata-01a.browser.cjs`
- `tests/costdata-01c.browser.cjs`
- `tests/costdata-01c.test.js`
- `tests/costdata-01f.browser.cjs`
- `tests/costdata-01f.test.js`
- `tests/costdata-01g.browser.cjs`
- `tests/costdata-01g.test.js`
- `tests/costdata-02a.browser.cjs`
- `tests/costdata-02a.test.js`
- `tests/cut-cost-cumulative-hours.test.js`
- `tests/cut-cost-feedback.browser.cjs`
- `tests/cut-cost-feedback.test.js`
- `tests/fixtures/costdata-01c.cjs` (expected zero-day map only)
- `docs/costdata-02a-chart-fix.md`
- `docs/costdata-02b-zero-cost-navigation.md`

## Remaining verification

Keep #528 draft and unmerged. Authenticated Vercel/F12 review must verify the real
Jewell July 15 event, actual task prices/durations, archived references, exact-row
and grouped navigation, production totals, saved layouts, native browser zoom and
absence of chart/navigation writes. CSS zoom and responsive tooltip containment
remain covered by the 02A browser case. No current production export was read or
reconciled for 02B; calculated zero and configured estimates are not proof of actual
payments or business profitability. The existing Settings editor and write gates
may reject edits when unrelated protected evidence requires review; this change
does not bypass those blocks.
