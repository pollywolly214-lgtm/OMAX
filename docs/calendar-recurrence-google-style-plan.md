# Dashboard Calendar Recurrence & Completion Behavior Plan (Google-Style)

## Scope of request
- Fix bug: marking an interval task complete on the dashboard calendar (e.g., **Mixing tube rotation**) is causing a new copy to appear on the next day.
- Move calendar behavior toward a Google Calendar-like recurrence model:
  - When adding/scheduling events/tasks, explicitly choose whether it repeats.
  - If repeating, choose the recurrence frequency.
- Update Maintenance Settings so recurrence controls are aligned with calendar behavior.
- Preserve existing interval/per-hour maintenance logic and avoid breaking forecasting/cost logic.

---

## Code reading summary (pass 1)

### 1) Where the duplicate-next-day behavior comes from
The current completion path for interval template tasks creates a new **instance** and then completes it immediately:
1. `completeTask(taskId)` in `js/calendar.js` checks if the selected item is an interval template.
2. If it is, it calls `scheduleExistingIntervalTask(template, { dateISO: today })`, which can create a new instance and assign today as `calendarDateISO`.
3. Then `markCalendarTaskComplete(...)` marks completion and records `completedDates`/`manualHistory`.

This instance/template split, plus projection logic and manual-history merge logic, can produce “extra copy” behavior depending on what dates are already in manual/completed/projection sets. The symptom aligns with this flow.

### 2) Recurrence/event scheduling touchpoints
- Calendar rendering and event composition:
  - `renderCalendar()`, `projectIntervalDueDates()`, `pushTaskEvent(...)` in `js/calendar.js`.
- Completion/uncompletion/removal behavior:
  - `markCalendarTaskComplete`, `unmarkCalendarTaskComplete`, `removeCalendarTaskOccurrences` in `js/calendar.js`.
- Task scheduling/instancing:
  - `scheduleExistingIntervalTask`, `scheduleExistingAsReqTask`, `createIntervalTaskInstance` in `js/renderers.js`.
- Add-task modal UI and submit handlers:
  - Dashboard picker/forms in `js/views.js` + handler wiring in `js/renderers.js`.
- Baseline/per-interval math:
  - `nextDue`, `liveSince` in `js/computations.js`.
  - `applyIntervalBaseline`, `ensureTaskManualHistory` in `js/renderers.js`.

### 3) Current model mismatch with requested UX
Current model is maintenance-centric (interval + as-required + optional scheduling) and stores recurrence implicitly through interval math and projections. Requested behavior requires explicit scheduling recurrence settings per added calendar event (none/daily/weekly/monthly/custom) similar to Google Calendar.

---

## Initial implementation plan (draft)

1. **Define recurrence schema (non-breaking).**
   - Add optional recurrence fields to scheduled task instances (and one-time tasks where needed):
     - `scheduleMode`: `"none" | "recurring"`
     - `recurrenceType`: `"daily" | "weekly" | "monthly" | "hours_interval"`
     - `recurrenceInterval`: number (e.g., every 2 days/weeks/months)
     - `recurrenceDaysOfWeek`: optional array for weekly rules
     - `recurrenceEnd`: `"never" | "on_date" | "after_count"`
     - `recurrenceEndDate` / `recurrenceCount`
   - Keep legacy fields (`interval`, `manualHistory`, `completedDates`, etc.) untouched for compatibility.

2. **Add recurrence controls to Add Task flow (dashboard modal).**
   - In “existing task” and “new task” forms, add UI:
     - Repeat: No / Yes
     - Frequency selector (daily/weekly/monthly/hour-interval)
     - Frequency value input
     - End condition (never/end date/after count)
   - Ensure defaults preserve old behavior (for interval templates default to recurring by interval-hours when appropriate).

3. **Add recurrence controls to Maintenance Settings cards.**
   - Add editable recurrence fields alongside existing interval/condition fields.
   - Hook into `data-k` input persistence path in `renderers.js` without breaking current edit-mode gating.

4. **Introduce a unified occurrence generator layer.**
   - New helper(s) that produce occurrences from either:
     - explicit recurrence schema, or
     - legacy interval projection fallback.
   - Calendar renderer should consume this unified occurrence list so both old and new tasks behave consistently.

5. **Fix completion behavior for interval templates.**
   - Refactor `completeTask(...)` so “mark complete” updates the right task occurrence without creating an accidental additional near-term occurrence.
   - Ensure the next due/recurrence computation excludes the completed occurrence in a deterministic way.

6. **Preserve cost and analytics compatibility.**
   - Ensure `computeCostModel()` and history extraction still rely on completed/manual history dates.
   - If recurrence fields are added, they should be optional metadata and not replace existing completion records used by cost calculations.

7. **Migration + normalization.**
   - Add normalization so older saved tasks without recurrence fields behave exactly as before.
   - Add guardrails for invalid recurrence values.

8. **Validation matrix.**
   - Interval template completion (today/past/future).
   - As-required scheduled once vs repeated.
   - One-time tasks remain one-time by default.
   - Remove single/future/all occurrence behavior still works.
   - Forecast/cost widgets still render and derive values correctly.

---

## Code reading summary (pass 2 review + adjustments)

After re-reading the scheduling/completion/render paths, I am adjusting the plan to reduce risk in this complex codebase:

### Key findings from second pass
1. **Instances are heavily integrated** in settings organization, cost history, and calendar rendering. Fully replacing instance behavior now is risky.
2. `renderCalendar()` currently expects interval *instances* for projected/due rendering (`isInstanceTask` filters). Any immediate model replacement could break visibility.
3. Cost model and history logic pull from `manualHistory`, `completedDates`, and task activity checks; these must remain the source of truth.
4. The bug is likely solvable quickly by tightening completion flow and projection exclusion, independent of full recurrence redesign.

### Revised plan (safer phased rollout)

#### Phase 1 — Stabilization + bug fix
1. **Patch completion logic first** (minimal invasive):
   - Update `completeTask(...)` path so marking an interval task complete does not create an unintended extra calendar occurrence.
   - Add explicit de-duplication guard around “today + next projected date” collision.
2. **Add deterministic event dedupe in calendar assembly**:
   - Normalize composite keys (`templateId/taskId + date + status precedence`) before pushing chips.
   - Keep completed > manual > due priority, but prevent duplicate semantic occurrences.
3. **Regression pass for removal/uncomplete operations** using existing scope logic (`single/future/all`).

#### Phase 2 — Google-style recurrence controls (additive)
4. **Add recurrence metadata fields** (optional, backward-compatible) for newly scheduled tasks/events.
5. **Extend Add Task / Existing Task scheduling UI** with repeat controls.
6. **Extend Maintenance Settings UI** with same repeat controls so users can edit recurrence after creation.

#### Phase 3 — Unified recurrence engine behind feature-compat facade
7. Build a unified occurrence generator that first checks explicit recurrence metadata; if absent, falls back to current interval projection logic.
8. Keep existing `manualHistory` + `completedDates` writes intact so cost/forecast code stays stable.

#### Phase 4 — Hardening + migration
9. Add normalization migration for recurrence defaults on load.
10. Add test checklist + manual validation scripts for all recurrence/completion modes and cost widgets.

---

## Implementation notes / guardrails
- **Do not break existing task schema consumers** (`computeCostModel`, history cards, next-due widget).
- **Completion semantics remain event-based**: completing an occurrence writes completion history for that date.
- **Recurrence semantics are generation-only**: they generate candidate dates but do not auto-mark completion.
- **As-required defaults to non-repeating** unless user enables recurrence explicitly.
- **Interval maintenance can default to repeating** but user must be able to set “does not repeat” when adding from calendar.

---

## Deliverables for implementation phase
1. Completion bug fix in calendar logic.
2. New recurrence UI controls in dashboard add modal and maintenance settings cards.
3. Recurrence metadata persistence + normalization.
4. Unified occurrence generation with legacy fallback.
5. Validation checklist run and documented.
