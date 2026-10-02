# MCF-01 maintenance calendar completion diagnosis

Base verified before edits: `recovery-import-staging-fix` and origin both at
`85a4a40226c5840fcebef8977d6d9ff87b2fd190`, clean working tree. Work is on
`maintenance-calendar-completion-fix`; PR base will be the recovery branch.
`package.json` is absent.

## Diagnosis recorded before implementation

The V2 model has reusable descriptors (`maintenanceTasksV2`), one-time or repeat
instances (`maintenanceCalendarInstancesV2`), and append-only lifecycle events
(`maintenanceOccurrencesV2`). A recovery import correctly adds a one-time instance
with `repeatRule:null`, a scheduled root and a completed event referring to that
root/instance. Completion does not complete a separate recurring occurrence with
the same task/date. Calendar chips receive `is-complete` only for completed status.

Code inspection confirms that `renderCalendar` in `js/calendar.js` iterates
scheduled one-time roots and calls `resolveV2OneTimeOccurrenceState`. A valid
scheduled/completed recovery pair is already folded into one completed chip.
The scheduled lifecycle record is not independently displayed as an outstanding
card. Legitimate repeating schedules are projected separately.

Confirmed defects in the manual paths:

- `appendV2OccurrenceEvent` starts `saveCloudNow()` without awaiting or examining
  its result, returns true, and its UI announces success even if the guarded save
  rejects. Local unsaved events remain present and can enter history/backup.
- `persistExplicitMaintenanceAddSave` in `js/renderers.js` discards the save
  result and treats existence of an ID on a subsequent read as save confirmation.
  Reusing an existing ID can therefore conceal a rejected write or lost edits.
- `createMaintenanceV2FromTemplate` can build a standalone completed record
  (no scheduled root), which the scheduled-root projection cannot display. Its
  deterministic instance IDs can collide when a different event type or a
  removed lifecycle exists for the same template/date/mode. It also updates an
  existing descriptor merely while scheduling an occurrence.
- One-time lifecycle resolution does not scope counterpart events by both
  instance/task identity and does not read a completed recovery event's explicit
  `loggedHours`/note. Equal-time action ordering depends on storage array order.

`snapshotState` refreshes lexical collections from window before serializing;
this is not a confirmed stale-array cause. `saveCloudNow` captures undo history,
then runs protected preflight, revision checks and the atomic CAS writer.
`saveCloudInternal` persists a local backup before the atomic write; a rejected
manual action needs verified local rollback plus removal of its partial undo/
backup representation. The save guards themselves must remain unchanged.

The operator's earlier audit reports 47 valid recovery lifecycles. No production
cloud/browser read or write has been performed here. Their current validity and
the exact origin of the June 16 / July 15 Mixing tube yellow cards cannot be
established from repository code alone. The new read-only date diagnostics will
distinguish recurring roots, manual one-time instances and recovery identities.
These code defects explain reproducible failure modes, not proof of which guard
rejected the operator's particular save.

## Proposed repair

1. Keep stored records intact. Tighten one-time projection to explicit linked
   lifecycle identity, preserve completion labor, and deterministically order
   tied append-only actions. Surface orphan/ambiguous lifecycles diagnostically.
2. Add bounded, pure maintenance calendar integrity diagnostics, callable for a
   date or all recovery records, without rendering, saving or mutating data.
3. Await a narrow manual one-time mutation coordinator using fresh authoritative
   reads and the existing `saveCloudNow({expectedRevision})`/CAS path. Verify
   maintenance destinations and protected fields after save. Roll back only
   proven unchanged additions after definite rejection; preserve evidence and
   suspend writes after ambiguous outcomes. Restore local undo/backup state on
   proven rollback so restore cannot resurrect a partially applied action.
4. Create future operator-initiated completed one-time work with a scheduled root
   and linked completion. Avoid newly generated ID collisions and stop updating
   existing descriptors while merely adding an occurrence. Do not migrate old IDs.

No production Firebase action, automatic repair/migration, bulk completion,
recurrence conversion, deletion of historical recovery events, rewrite of stored
maintenance collections, protected-data sanitation or change to save/revision
guards is authorized by this implementation. Existing orphan records will be
reported, not repaired. Ordinary repeating schedules remain incomplete until
their own explicitly linked completion exists.

## Validation

Implemented in `js/maintenanceCalendarIntegrity.js` (`resolveOneTime`, `inspect`,
`createMutationRunner`), with wiring in `js/core.js`, awaited one-time actions and
root-based chip identity in `js/calendar.js`, native creation/save handling and
reporting identity in `js/renderers.js`, and script loading in `index.html`.
Regression coverage is in `tests/mcf-01-maintenance-calendar.test.js`.

The resolver retains completed status when an occurrence is moved, preserves
completion labor, scopes events to the root/instance/task, and uses prepend order
for equally timestamped native actions. Independent roots remain separate chips.
New completed one-time creation appends a scheduled/completed pair. Scheduling
does not modify existing descriptors or reuse a recovery lifecycle. New IDs avoid
collisions without modifying any existing IDs.

The manual coordinator reads an authoritative server baseline, checks the loaded
revision and business equivalence, permits only maintenance additions with
unchanged existing records, and awaits the existing guarded save. A fresh server
read must verify the staged business state after commit. Definite rejection
selectively rolls back only unchanged additions and restores undo/redo and local
backup. Ambiguous outcomes or concurrent/protected drift preserve evidence and
suspend writes. The existing CAS, protected preflight, firewall and recovery gates
remain in force. Recurring completion handlers are unchanged.

### Read-only console diagnostics

```js
inspectMaintenanceCalendarIntegrity({ dateISO: "2026-06-16" });
inspectMaintenanceCalendarIntegrity({ dateISO: "2026-07-15" });
inspectMaintenanceCalendarIntegrity({ recoveryOnly: true });
await inspectMaintenanceCalendarCloud({ dateISO: "2026-06-16" });
await inspectMaintenanceCalendarCloud({ recoveryOnly: true });
```

The local helper includes the currently rendered repeating rows (bounded to 500)
and stored lifecycles. The cloud helper performs a server read and inspects stored
lifecycles; it does not generate virtual repeating schedules. Both return bounded
identity/status summaries (at most 200 output rows, 100 warnings and 160 characters
per text field), without changing state or invoking a save. Orphans are reported
for review; neither helper repairs them. These commands have not been executed
against the operator's production session here.

### Exact checks and results

```powershell
Test-Path package.json
# False; no npm commands run.

node --check js/maintenanceCalendarIntegrity.js
node --check js/calendar.js
node --check js/renderers.js
node --check js/core.js
node --check tests/mcf-01-maintenance-calendar.test.js
# Each passed: exit 0, no syntax errors.

node --test tests/mcf-01-maintenance-calendar.test.js
# Passed: 23 tests, 23 pass, 0 fail.

node --test tests/mcf-01-maintenance-calendar.test.js tests/atomic-persistence.test.js tests/historical-import-staging.test.js tests/maintenance-task-setup.test.js tests/maintenance-history-import.test.js tests/production-hardening.test.js
# Passed: 180 tests, 180 pass, 0 fail, 0 skipped.

rg -n 'runMaintenanceCalendarMutation|resolveV2OneTimeOccurrenceState|one_time_root|normalizeSourceRecordForComparison|expectedRevision:trace|outcome\?\.saved' js/calendar.js js/core.js js/renderers.js js/maintenanceCalendarIntegrity.js
# Passed: exit 0; targeted lifecycle/render/save wiring found.

git diff --check
# Passed: exit 0, no whitespace errors.
```

Tests execute actual projection/chip, native creation, calendar-action and core
checkpoint code in Node VM fixtures, with an in-memory backend using the real
atomic persistence/CAS implementation. They cover completion coloring, separate
yellow schedules, immutable recovery/recurrence identities, labor, reload,
collision avoidance, failed/stale saves, rollback/restore, duplicate prevention
and ambiguous-outcome suspension. This is not live-browser or Firebase testing.
No production Firebase reads or writes were performed.
