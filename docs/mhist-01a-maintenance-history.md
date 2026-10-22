# MHIST-01A audit and implementation plan

Audit completed before implementation on 2026-10-21. Base: origin/main,
633e144. No production data was accessed. Findings below are proven from code;
the exact affected production task/event counts are unknown.

## Findings and data path

`core.js` loads the protected legacy arrays (`tasksInterval`, `tasksAsReq`) and
V2 arrays (`maintenanceTasksV2`, `maintenanceCalendarInstancesV2`,
`maintenanceOccurrencesV2`) from the workspace Firestore state into application
bindings and `window`. Snapshot/compaction, revision/CAS, verification, backups,
and Recovery Mode protect these same collections. There is no separate history
database. Remote state adoption includes maintenance fields for Settings.

`calendar.js:renderCalendar` builds `dueMap` directly from these arrays. Legacy
interval **instances** contribute completedDates and completed manualHistory;
As Required tasks contribute completedDates. Legacy active schedule projections
are deliberately suppressed by existing checkpoint behavior. Long legacy jobs
split into daily duration segments of one logical occurrence.

V2 definitions link to Settings by `legacyTaskId`; instances reference their V2
definition by `taskId` and also retain `legacyTaskId`. One-time `scheduled` roots
reference an instance; lifecycle records reference that root through
`rootOccurrenceId` / `supersedesEventId` plus matching task and instance IDs.
`resolveV2OneTimeOccurrenceState` delegates to the calendar integrity resolver.
Repeat roots use `repeat:<instance>:<date>` or `repeat:<instance>:slot:<index>`;
the compatibility resolver recognizes older date roots for count-based slots.
Movement changes the displayed business date while preserving the root.

`projectV2RepeatDates` dynamically calculates a bounded projection (not stored
individual events). Calendar repeats default to three upcoming slots, with a
90-day cap for never-ending rules and the existing 366-attempt bound. Machine
hour repeats use five rolling predictions / 90 days and a 120-attempt bound;
existing count/date endings apply. Persisted repeat lifecycle roots are also
rendered, including historical, moved, and stopped-chain evidence outside the
rolling projection. Calendar month navigation does not expand these rules.

Settings' `renderSettings` History click handler instead calls
`computeCostModel().maintenanceDataTable`, filters by exact Settings `taskId`,
adds only that legacy task's manualHistory/calendarDateISO, then collapses all
rows into a Set of dates. `computeCostModel` uses a completed-only compatibility
stream for V2. Its V2 rows retain V2 task IDs, even though their Settings links
use legacyTaskId. This proves both a foreign-key mismatch and a missing data
source: fixing the filter alone cannot include scheduled or virtual events.
The date Set also merges distinct same-day occurrences and assigns one status
and note to all of them. The predicted-next summary independently extrapolates
from legacy fields, rather than reflecting the actual calendar projection.

Task creation assigns stable IDs; edits/renames change fields, not IDs. Legacy
calendar instances reference `templateId`. New manually-created calendar-only
tasks have no Settings link and must not be attached by matching visible names.
Completion and editing append lifecycle events; reopening must resolve current
status rather than interpret every completion as permanently completed.

| Event | Calendar source / identity | Old popup | Discrepancy |
| --- | --- | --- | --- |
| One-time scheduled/manual | V2 scheduled root + instance/task IDs | Absent | Completed-only cost stream; no V2 schedule read |
| One-time completed | Root + resolved lifecycle | Usually absent | V2 task ID differs from Settings ID |
| Repeat projected | Instance + bounded virtual date/slot root | Absent | No persisted completed cost row exists |
| Repeat completed/moved/stopped history | Persisted repeat root + resolved lifecycle | Usually absent | Foreign-key filter; no shared resolver |
| As Required V2 | Same V2 instance/root relationships | Usually absent | Same read-path mismatch |
| Legacy completed instance | task/template + date-backed occurrence | Sometimes present | Cost model has its own filtering/deduplication |
| Legacy template/manual schedule | Legacy completed/manual/calendar fields | Present, sometimes mislabeled | Popup shows evidence deliberately hidden from calendar |
| Separate same-day events | Distinct root/instance IDs | Collapsed | Popup date-only Set |

An additional proven display issue: repeat calendar equivalence keys combine
task identity, visible name, date, and cadence, suppressing separate instances.
Slot/date compatibility can also emit the same logical root twice. Correcting
these read-only duplicate rules is necessary for the requested identity contract;
it does not change recurrence generation, IDs, storage, or scheduling.

## Implementation plan (recorded before first code edit)

1. Extract the existing calendar maintenance builder into
   `buildMaintenanceCalendarEvents` in `calendar.js`; both renderCalendar and
   Settings history call it fresh, independent of whether Dashboard was opened.
   Return the due map and one-time lookup instead of publishing caches from the
   builder. Normalize legacy copies because existing legacy helpers mutate their
   inputs. Preserve projection algorithms, bounds, dates, and suppression rules.
2. Deduplicate repeat display rows by canonical instance/root, using the existing
   compatibility resolver's matched root. Keep independent same-day roots.
3. Add a Settings history adapter that joins explicit legacy/template IDs to V2
   task/instance/event references; reject conflicting/ambiguous associations and
   never use names, categories, or dates to infer ownership. Collapse duration
   segments of one legacy occurrence; preserve independent V2 roots.
4. Retain explicit legacy history-only evidence previously useful in the popup
   (including template completions), with source labeling. Legacy storage is
   date-keyed per task; completedDates/manualHistory for that same task/date are
   two representations of one occurrence. Do not invent missing completions.
   Do not suppress an independent V2 root merely because its date matches legacy.
5. Keep the table and close/jump behavior; render per-event status, notes, hours,
   current Settings task information, ascending date/identity sort. Show movement
   as date detail while using supported scheduled/completed lifecycle statuses.
   Use local date helpers and actual resolved business dates only. Replace the
   fabricated predicted-next summary with the next actual scheduled row.
6. Add regression fixtures for each event category, identical names, renames,
   independent same-day events, removal/uncompletion, moved roots, slot/date
   compatibility, bounded recurrence, fresh/reloaded state, and frozen input.
   Compare extracted calendar output with the pre-change builder on ordinary
   fixtures; exercise real Settings/Calendar UI in disposable devsafe browser
   profiles with external requests blocked. Verify backend and protected state
   remain unchanged by history reads. No production browser mutation is needed.
7. Run node syntax checks, relevant maintenance/import/recovery/persistence tests,
   focused regression/browser tests, binary verification, and git diff --check.
   Review the complete diff, commit, push the named branch, and open one focused
   PR without merging. No package.json exists; do not run npm commands.

## Safety boundary

Only read/display reconciliation and tests/documentation change. No migration,
Firebase write, history deletion, ID rewrite, completion rule change, recurrence
math change, save verification change, Recovery Mode change, or unrelated
protected-data change is authorized or required. Existing legacy helper input
mutation is isolated on temporary copies. Invalid foreign-key evidence is not
repaired or guessed. Production-only malformed data cannot be verified without
a read-only production inspection; it is not assumed to exist.

## Implementation and final verification

Completed 2026-10-22. Modified production functions:

- `calendar.js:buildMaintenanceCalendarEvents`: extracted the existing due-map
  builder. Dashboard installs the returned one-time lookup for its existing
  interaction handlers. History reads never publish a calendar cache. Legacy
  normalizers receive disposable copies. Recurrence algorithms remain untouched.
- `calendar.js:buildMaintenanceTaskHistory`: joins Settings task/template IDs to
  explicit V2 legacy references. Rejects ambiguous IDs/conflicting ownership.
  Uses instance/root identity, canonical slot/date compatibility, and legacy
  task/date identity. Duration segments collapse to one history occurrence.
  Explicit legacy history outside calendar suppression stays labeled. Logged
  status remains logged; actual completions alone count as completed. Existing
  manual notes are retained. Malformed legacy arrays and impossible dates do
  not create rows or throw.
- `calendar.js:renderCalendar`: consumes the shared builder. The intentional
  read-only display corrections retain distinct repeat instances on the same
  date and suppress duplicate slot/date aliases. Existing records/IDs stay intact.
- `renderers.js:openMaintenanceTaskHistory` and Settings History handler: use
  per-event rows rather than the cost table/date Set. Preserve the 12-column
  popup, close/backdrop/jump actions, task metadata, links, and ascending order.
  Display resolved notes/hours (including zero), movement origin, and next actual
  scheduled event. Local calendar-day differences avoid DST/UTC drift. Date
  cells do not wrap on mobile; the existing card scrolls horizontally.
- Tests: new focused unit suite, disposable browser suite, shared fixtures; one
  existing MCF test harness now reads the returned lookup at its extraction seam.

Comparison rules: unit reconciliation covers all persisted calendar evidence
plus the exact bounded virtual projection as of 2026-10-21, without inventing
intervening historic recurrence dates. Browser DOM reconciliation is intersected
with the dates actually rendered by Calendar. Legacy duration chips compare by
their occurrence start; history-only legacy evidence is labeled and excluded
from that DOM equality check. July's persisted event remains in history even
when the displayed Calendar months do not include July.

Final results: **317/317 unit/integration checks**, including **18 focused audit
checks** (17 normal regressions plus the optional original-builder comparison).
The focused browser test passes; all three existing one-time browser scenarios
pass independently. Desktop and 390px mobile screenshots were visually reviewed.
History reads/open/close/jump/reload preserve the disposable backend exactly;
no new JavaScript or application-console errors were observed.

Exact final verification commands (PowerShell, worktree root):

```powershell
git show 633e144:js/calendar.js | Set-Content -LiteralPath 'C:\CodexProjects\OMAX\artifacts\mhist-01a-baseline-calendar.js' -Encoding utf8NoBOM
$env:OMAX_MHIST_BASELINE_CALENDAR='C:\CodexProjects\OMAX\artifacts\mhist-01a-baseline-calendar.js'
node --test tests/maintenance-history-reconciliation.test.js tests/mcf-01-maintenance-calendar.test.js tests/maintenance-new-one-time.test.js tests/maintenance-task-setup.test.js tests/maintenance-history-import.test.js tests/pump-rebuild-duplication.test.js tests/atomic-persistence.test.js tests/production-hardening.test.js tests/recovery-import.test.js tests/global-identity-repair.test.js tests/import-selective-rollback.test.js tests/historical-import-staging.test.js tests/cjcd01b-calendar.test.js

$taskJsFiles=@('js/calendar.js','js/renderers.js','tests/mcf-01-maintenance-calendar.test.js','tests/maintenance-history-reconciliation.test.js','tests/fixtures/maintenance-history.js','tests/maintenance-history-reconciliation.browser.cjs')
foreach($taskJsFile in $taskJsFiles){ node --check $taskJsFile; if($LASTEXITCODE -ne 0){exit $LASTEXITCODE} }

$env:NODE_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:OMAX_MHIST_SCREENSHOTS='C:\CodexProjects\OMAX\artifacts\mhist-01a'
node --test tests/maintenance-history-reconciliation.browser.cjs
node --test tests/maintenance-new-one-time.browser.cjs

& 'C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/check_binaries.py
git diff --check
```

All commands above PASS. Unit output was also captured in
`C:\CodexProjects\OMAX\artifacts\mhist-01a-unit-tests.log`. No package.json exists;
no npm command ran. No binary/asset changes are included.

Earlier attempts: the Windows sandbox prevented Edge startup; the same
localhost-only test passed outside the sandbox. Initial new-test failures
identified fixture navigation/category/viewport assumptions and were corrected
in the test. A combined browser run had one existing save-count assertion fail
(`1 !== 2` at maintenance-new-one-time.browser.cjs:196); the unchanged suite
subsequently passed all three scenarios in two independent standalone runs.
The cause of that transient combined-run failure is not proven. It is not hidden
by changing that suite or weakening a save check.

Not tested: authenticated production Firebase data, production-specific malformed
references/counts, every browser engine, and an exhaustive visual/device matrix.
No live production diagnosis was necessary to prove these read-path defects.
No F12 script or new diagnostic UI was added.

Final safety review: no production records modified, no destructive migration,
history deletion, task/occurrence ID change, completion-rule change, interval/due
calculation change, navigation change, Per Interval/As Required conversion
change, or save/recovery/protection change. The independent pre-change builder
comparison confirms ordinary legacy, one-time, calendar-repeat, and machine-hour
calendar output remains equal; the two intentional identity/dedup display fixes
have separate focused regressions. Assessment: **READY FOR REVIEW**.
