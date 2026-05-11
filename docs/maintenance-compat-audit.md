# Maintenance Calendar Evolution Design (No Migration, Legacy Safe)

## Fixed Constraints (must remain true)
1. Existing Firebase records in `tasksInterval` and `tasksAsReq` are **legacy source-of-truth** for existing tasks.
2. Legacy records must keep current mutation/write paths for completion, uncompletion, remove/skip, notes, hours, reporting, and Data Center rows.
3. No bulk migration, no silent conversion, no rename/replace of legacy structures.
4. New model applies only to newly created maintenance calendar records unless a user explicitly upgrades a specific legacy item.

## Plain-English Domain Model
- **Maintenance Settings Task** = reusable definition (“what this task is”).
- **Calendar Instance** = user’s scheduling intent (“how this task behaves on calendar this time”).
- **Occurrence/Event Record** = actual action or outcome on a date (“what happened”).

## Option Comparison

### Option 1: Versioned payload on each new maintenance task/calendar item
**Shape:** Add `modelVersion: 2` and nested `calendarInstances` / `occurrences` directly under task records.

**Pros**
- Fewer top-level collections.
- Easy task-centric reads.

**Cons/Risks**
- High collision risk with current task mutation functions that assume legacy fields on task object.
- Harder to guarantee old/new write-path isolation.
- Increased chance of accidental writes from legacy handlers.

### Option 2: Sibling collections in state (recommended base)
**Shape:** Keep legacy lists untouched; add separate top-level arrays/maps for new system.

**Pros**
- Strong blast-radius isolation from legacy code.
- Clean separation of write paths.
- Easier phased rollout and feature flagging.

**Cons**
- Requires adapter to join data at read time.
- More moving parts initially.

### Option 3: Hybrid (recommended overall)
**Shape:**
- New task definitions in their own collection.
- New calendar instances + occurrence log in sibling collections.
- Optional lightweight marker on related UI objects only (not mutating legacy records).

**Pros**
- Best balance of isolation and future extensibility.
- Supports event-sourcing style history without touching legacy fields.
- Clean path to unified reporting adapter.

**Cons**
- Slightly more conceptual complexity than Option 2 alone.

## Recommended Conceptual Data Model (New Records Only)

### A) `maintenanceTasksV2` (home base definitions)
Each entry represents a reusable maintenance task definition.
- `id`
- `system`: `"v2"`
- `name`
- `taskType`: `"per_interval" | "as_required" | "downtime" | ...`
- `intervalHours` (optional metadata, not forced behavior)
- `defaultDurationHours` (optional)
- `price`, `pn`, links, category, etc.
- `createdAtISO`, `updatedAtISO`, `archivedAtISO?`

### B) `maintenanceCalendarInstancesV2` (scheduling intent)
Each entry represents one calendar usage of a task.
- `id`
- `system`: `"v2"`
- `taskId` (FK to `maintenanceTasksV2.id`)
- `instanceMode`: `"one_time" | "repeat" | "past_log"`
- `startDateISO`
- `timezone` (optional but recommended)
- `repeatRule` (nullable)
  - e.g. basis: `"calendar" | "machine_hours"`
  - cadence details (daily/weekly/monthly or interval-hours tracker semantics)
- `status`: `"active" | "stopped" | "archived"`
- `stoppedAtISO?`, `stopReason?`
- `createdAtISO`, `updatedAtISO`

### C) `maintenanceOccurrencesV2` (what happened)
Append-oriented history records tied to one calendar instance.
- `id`
- `system`: `"v2"`
- `instanceId` (FK to `maintenanceCalendarInstancesV2.id`)
- `taskId` (denormalized for reporting speed)
- `eventType`: `"scheduled" | "completed" | "uncompleted" | "skipped" | "moved" | "removed" | "note_set" | "hours_set" | "past_logged"`
- `effectiveDateISO` (date occurrence applies to)
- `recordedAtISO` (when event was recorded)
- `payload` (event-specific details)
  - moved: from/to date
  - note_set: note text (or cleared flag)
  - hours_set: value (or cleared flag)
  - completed/uncompleted: hours snapshot metadata, source
- `supersedesEventId?` (optional linkage for corrections)
- `actor?` / source metadata

## Relationship Rules
1. One task definition (`maintenanceTasksV2`) can have many calendar instances.
2. One calendar instance can have many occurrence/event records.
3. Calendar display state is derived from instance + ordered event log.
4. Reporting rolls up from occurrence facts (plus task metadata), not from mutating task definitions.

## Behavior Mapping

### One-time reminder
- Create instance with `instanceMode = one_time`, no repeat rule.
- Occurrences can include scheduled/completed/skipped/moved/note/hours.
- Once completed/removed/stopped, no future projections.

### Repeat-tracking reminder
- Create instance with `instanceMode = repeat` and `repeatRule`.
- Interval metadata on task is advisory; instance decides repeat behavior.
- Future reminders are projections from instance + event history.

### Past completion record
- Create instance with `instanceMode = past_log` (or one_time with past date).
- Write `past_logged` and/or `completed` event with backdated `effectiveDateISO`.
- Must appear in reporting/Data Center as historical completion.

## Linking Lifecycle Actions
- **Completed**: add `completed` event.
- **Uncompleted**: add `uncompleted` event referencing prior completion date/event.
- **Skipped**: add `skipped` event for date.
- **Moved**: add `moved` event with `fromDateISO` + `toDateISO`.
- **Stopped**: set instance status `stopped` (+ optional stop event).
- **Removed**: append `removed` event; do not hard-delete history.

This preserves auditability and avoids destructive rewrites.

## Legacy + New Coexistence Strategy
- Keep reading legacy `tasksInterval/tasksAsReq` exactly as now.
- New items are created only in V2 collections.
- No shared mutation functions at first.
- Read adapter merges outputs from:
  1) legacy task-derived occurrences
  2) v2 instance/event-derived occurrences

## Legacy vs New Marker
- Use explicit discriminator field `system`:
  - legacy items: implicit (no `system` or treated as `legacy`)
  - new items: `system: "v2"`
- Optional additional marker: `schemaVersion: 2` on V2 records.

## Read Adapter (future integration contract)
Output unified records in one stream with stable fields used by calendar/reporting:
- `streamId` (unique)
- `sourceSystem`: `"legacy" | "v2"`
- `taskId`, `taskName`
- `instanceId?`
- `dateISO`
- `status`: due/manual/completed/skipped/removed/etc.
- `note`, `hours`, `price`, `categoryId`, links
- `provenance` (pointer to original record ids)

Calendar renderer and reporting/Data Center consume only this normalized stream.

## Edge Cases to Resolve Before Coding
1. Duplicate same-day events (complete then uncomplete then complete).
2. Timezone/day-boundary drift for date-only records.
3. Move + complete on same date ordering.
4. Repeating instance stopped, then reactivated.
5. Note/hours clears vs overwrites (audit trail).
6. Deleting a task definition with active instances.
7. Reporting dedupe when both projected and completed facts exist.
8. Idempotency for retrying writes offline.
9. Conflict resolution when multiple clients update same instance.
10. Explicit user-triggered upgrade path for a single legacy task (future scope, opt-in only).

## Recommendation
Adopt **Hybrid (Option 3)**:
- Sibling V2 collections for strict safety.
- Event-style occurrence log for robust history/audit.
- Adapter-driven unified read model for calendar/reporting.

Why this is safest now:
- Minimizes risk to legacy behavior.
- Preserves existing Firebase contracts.
- Enables gradual rollout by surface area (create → display → mutate → report) without migration.
