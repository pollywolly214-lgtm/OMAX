# COSTDATA-01C maintenance source reconciliation

Follow-up: [COSTDATA-01D main integration](costdata-01d-main-integration.md)
brings main's archive-aware identity validation and MDEL protections into this
branch and verifies the combined paths. The findings below describe the 01C
baseline; the follow-up records current integration results and live limits.

Investigation baseline: PR #519, `codex/costdata-01a`, commit `bbf7e4e`.
Read-only investigation completed before implementation, 2026-10-22.
No authenticated production tab or Firebase data source is available. The
reported December/June chart dates are user observations, not inspected records.

## Proven read-path findings

The existing 01A/01B fixes collect all legacy task histories and fix the shared
financial period/realtime refresh. `computeCostModel` builds candidate maintenance
rows independently of Cutting Jobs and meter history, joins completed V2 rows
from `buildMaintenanceCompatibilityStream`, then calls
`OMAXCutCostFeedback.maintenanceRows`. Central Data Table and maintenance trends
both consume that normalization. Trends exclude incomplete costs, missing task
identity/link (except V2), invalid dates and invalid amounts, aggregate costs per
business date, and finally apply the shared financial period. Chart drawing uses
that selected series without fabricating earlier points.

Three additional defects are reproduced on this PR's current code:

1. A January legacy completion with recorded $10 parts/one hour labor is removed
   by an unrelated same-task/date V2 **scheduled-only** record. The shadow set
   includes all V2 events, without requiring a completed/reopened lifecycle.
2. Two distinct anonymous February manual rows with recorded $10/one hour and
   $20/two hours become a single $80 row. Collection distinguishes them by array
   source/index, but normalization discards that provenance, selects the last
   date-matching snapshot, then deduplicates by canonical task/date.
3. A January legacy instance with its own $12 parts/half-hour configuration is
   marked incomplete when its template has missing configuration. Collection
   converts its task ID to template ID; normalization no longer knows which
   instance supplied the event or its cost defaults.

These are synthetic demonstrations of real code paths; none establishes which
records explain the production June cutoff. Original 01A fixtures do not cover
these combinations. Incomplete cost data is also a legitimate exclusion and
must not be converted to zero merely to extend the blue line.

Green independently uses completedCuttingJobs, canonical completion dates and
the existing profit helper/financial-period selector. There is no purchase,
maintenance or machine-hour prerequisite that can create earlier green points.
Its actual earliest production completion still needs read-only confirmation.

## Implementation plan

- Retain legacy source task, history field/index and explicit event/import IDs
  from collection through cost normalization. Use that source to select the
  event's own snapshot and configured fallback. Preserve explicit zero.
- Keep distinct source occurrences; suppress only supported mirrors. Ignore
  scheduled-only V2 roots when matching legacy history. Retain reopened/moved
  lifecycle handling, explicit import matching and unambiguous legacy day-root
  compatibility, without treating names as identity.
- Preserve original financial formulas, per-day aggregation and shared period.
  Incomplete rows stay visible with the actual missing-field explanation.
- Expose a read-only render reconciliation snapshot with source, status, cost
  components/classification and stage/exclusion decisions. Supply one F12
  script that reads it and loaded source/DOM evidence without recalculating the
  cost model, writing app state/localStorage or contacting Firebase.
- Add January/February/April, distinct same-day, mirrored, incomplete/zero,
  December purchases/later jobs fixtures. Verify model, table, chart, all period
  boundaries, navigation/reload and backend equality in a disposable browser.
- Update this existing draft PR, never create a competing PR or merge it.

No production rewrite, migration, deletion, backfill, scheduling change,
financial-configuration change or protection/recovery change is required.

## Implemented read-path correction

`js/renderers.js` now retains the actual source task, history field/index and
event/import identity when collecting candidates, including retained deleted
task payloads. `js/cutCostFeedback.js` uses that provenance to select each
occurrence's inputs and the source instance's configured fallback. Anonymous
same-day entries keep separate transient source keys; no stored ID is rewritten.
Removed sibling tasks/records no longer suppress an independent completion.

Legacy/V2 shadow matching now requires a completed/reopened root lifecycle with
consistent task/instance identity. Explicit import mirrors still collapse;
distinct import identities survive. The historical task/day fallback only
collapses an unambiguous legacy candidate and V2 root. A scheduled-only reminder
cannot shadow a completed legacy expense. Existing moved/reopened lifecycle
behavior remains covered by the maintenance cost regressions.

The existing parts plus hours times $30 formula, garnet handling, daily
aggregation and financial-period boundaries are unchanged. Recorded parts and
hours mean recorded **inputs**, not verified cash spending: labor is modeled.
Configured fallback remains classified as estimated/default. An explicit zero
is graphable; unknown inputs remain incomplete, with a missing-field explanation
in the historical table. The internal incomplete amount placeholder is never
treated as a complete chart cost; the reconciliation reports its total as null.

The renderer exposes its stage decisions on the chart DOM canvas, including
normalization, historical table, selected table and selected chart inclusion.
This is ephemeral render evidence, never a Firebase/localStorage record.

## Date-by-date synthetic reconciliation

The fixture is `tests/fixtures/costdata-01c.cjs`; these are synthetic records,
**not an inventory of production history**. Table/chart columns below use
All-Time. All listed source completions have status completed; exceptions are
explicitly labeled. Costs are positive expense magnitudes; chart values use the
existing negative sign.

| Date | Task / source identity | Source and cost inputs | Classification | Table | Chart | Amount / exclusion |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-01-15 | jan / jan-event | Legacy manual; $10 parts, 1h | Recorded inputs; modeled labor | Yes | Yes | $40 |
| 2026-01-15 | jan-v2 / jan-plan | V2 scheduled-only reminder | Not a completed expense | No | No | No completed compatibility row; does not suppress jan-event |
| 2026-01-20 | old-template / old-instance | Legacy completedDates; instance $12, 0.5h | Estimated/default | Yes | Yes | $27; template has no defaults |
| 2026-01-25 | unknown / completedDates[0] | Legacy; parts and duration absent | Incomplete | Yes | No | Missing parts price and labor duration; total unknown |
| 2026-01-26 | zero / zero-event | Legacy manual; explicit $0, 0h | Recorded zero inputs | Yes | Yes | $0 |
| 2026-02-15 | feb / manualHistory[0] | Legacy manual; $10, 1h | Recorded inputs; modeled labor | Yes | Yes | $40 |
| 2026-02-15 | feb / manualHistory[1] | Legacy manual; $20, 2h | Recorded inputs; modeled labor | Yes | Yes | $80; separate event, same day |
| 2026-03-15 | scheduled / manualHistory[0] | Legacy scheduled; configured $500, 10h | Not costed | No | No | Not an eligible completion: scheduled |
| 2026-04-15 | apr / completedDates[0] | Legacy date mirror | Not costed separately | No | No | completedDates mirrors manualHistory for this source task/date |
| 2026-04-15 | apr / apr-import | Legacy manual; $25, 0.5h | Import mirror | No | No | Same explicit import identity as apr-root; counted through V2 |
| 2026-04-15 | apr / apr-distinct | Legacy manual; $3, 0.1h | Recorded inputs; modeled labor | Yes | Yes | $6; distinct import survives |
| 2026-04-15 | apr-v2 / apr-root | V2 completed; $25, 0.5h snapshot | Recorded inputs; modeled labor | Yes | Yes | $40 |
| 2026-04-15 | apr-v2 / apr-root-2 | V2 completed; $5, 1h snapshot | Recorded inputs; modeled labor | Yes | Yes | $35; separate root survives |

The normalized table contains nine rows, including one incomplete row. Eight
complete expenses aggregate into five blue dates: January 15 $40, January 20
$27, January 26 $0, February 15 $120 and April 15 $81; known total **$268**.
No synthetic maintenance event needs a cutting job or meter reading to qualify.

Purchase projection remains unchanged: earliest red date December 15, 2025,
All-Time total $136. Green independently contains only actual fixture jobs on
July 15 and October 15, 2026; its earliest point is July 15. All-Time, YTD,
365/182/90/30-day windows recalculate all series through the same period bounds.
These checks prove green's read path is independent; they cannot establish the
earliest completed job in production.

## Validation

Run from the repository root with Node and the existing Playwright installation:

```powershell
node --test --test-reporter=tap tests/costdata-01c.test.js tests/costdata-01a.test.js tests/financial-reconciliation.test.js tests/purchase-financials.test.js tests/purchase-orders.test.js tests/cut-cost-feedback.test.js tests/cut-cost-cumulative-hours.test.js tests/ach-average-cut-hours.test.js tests/maintenance-history-import.test.js tests/recovery-import.test.js tests/cjo04-review.test.js tests/firebase-two-computer-baseline.test.js tests/inventory-material-persistence.test.js

$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node --test --test-reporter=tap tests/costdata-01c.browser.cjs tests/costdata-01b.browser.cjs tests/costdata-01a.browser.cjs tests/financial-reconciliation.browser.cjs tests/cut-cost-feedback.browser.cjs
```

- 386/386 targeted unit/integration/safety checks pass, including eight new
  source/cost/identity regressions. The existing reopened-root fixture now names
  its actual root and instance; the financial extraction harness supplies the
  new empty audit array. Financial assertions remain unchanged.
- 32/32 combined browser checks pass. The final two 01C browser checks were also
  rerun after the diagnostic's scheduled-only explanation was refined: 2/2 pass.
- New browser coverage uses Chicago and UTC+14, actual table/plot targets,
  per-day amounts, all supported financial periods, navigation and real document
  reload. Source business state and disposable backend remain equal, with zero
  display-triggered save calls. The diagnostic also preserves business state and
  localStorage. External requests are blocked; Firebase is absent.
- Local generated reports live in untracked `artifacts/costdata-01c-*.tap` and
  `artifacts/costdata-01c-reconciliation-*.json`; fixture/tests above reproduce
  them. They contain no production data.
- Syntax, whitespace and repository binary-policy checks pass. No package.json;
  no npm commands. The full repository unit suite was not rerun for 01C; 01A
  recorded ten existing failures independently reproduced on untouched main.

## Remaining production verification and read-only diagnostic

**The exact live June cutoff is unresolved until loaded source evidence is
compared.** The three code defects above are fixed and covered, but synthetic
tests do not prove that all earlier production events have graphable costs or
that one of those defects caused the screenshot. Keep PR #519 draft and unmerged
until that discrepancy is resolved or earlier exclusions are substantiated.

On the already-loaded live Cost Analysis page, select All-Time and enable all
three series. Paste the entire IIFE from
[`costdata-01c-read-only-diagnostic.js`](costdata-01c-read-only-diagnostic.js)
into F12 Console. It prints a date-sorted maintenance table and returns the full
report: loaded legacy/V2 sources, identity/status, available parts/hours,
classification, table/chart decisions, exact reasons where available, chart
dates and earliest loaded/plotted completed job. It reads only: no model
recalculation, application-state/localStorage writes, save or network call.

The corrected build exposes exact stage decisions. On an older deployed build,
the script still reports loaded sources, DOM matches and plotted dates, but
labels exact provenance/stage reasons as unavailable; a same-date point cannot
prove that every event was included. Recorded/default inputs must not be
reinterpreted as verified cash cost. No manual missing-event-ID search is needed
before running this focused comparison.
