# Occurrence-Based Maintenance Prediction — Updated Code-Reviewed Execution Plan

## Why this revision
This plan was revised after reviewing the current implementation so execution maps directly to existing files/functions and avoids regressions.

## Current-State Findings (Code Audit)

### 1) Prediction source already exists but uses a short lookback
- Occurrence prediction is currently derived through `nextDue(task)` in `js/computations.js`.
- `nextDue(task)` computes **one** due date object (`due`) and does not naturally return a 3-date list.
- The daily-hour input comes from `getConfiguredDailyHours()` (in `js/core.js`), which currently prefers `getAverageDailyCutHours()`.
- `getAverageDailyCutHours()` currently uses ~1 month behavior (`22` if weekends excluded, `30` otherwise), not a 2-month window.

### 2) Weekend handling is centralized and reusable
- Weekend policy is already centralized via `shouldExcludeWeekends()` and reused by both date stepping and working-day counting logic.
- This is the right anchor for the new 2-month average and prediction mode behavior.

### 3) Settings model does not yet include prediction mode
- `DEFAULT_APP_CONFIG` and `normalizeAppConfig()` currently store `excludeWeekends` and `dailyHours`, but not a selector for:
  - “Use average daily hours”, vs
  - “Use fixed daily hours”.

### 4) Save path is centralized but not preview-guarded
- Cloud persistence flows through `saveCloudDebounced()` → `saveCloudInternal()` (Firestore `.set`).
- A Vercel-preview write guard should be added in this single path (plus `saveCloudNow()` flow) to prevent preview writes.

### 5) Display placement spans multiple rendered sections
- Dashboard has an obvious “next due” block and settings UI anchors.
- Cutting-job and cost-analysis sections are rendered separately and should consume one shared “average/day” source to stay consistent.

---

## Non-Negotiable Constraints
1. Predict only the **next future occurrence** for occurrence-based tasks.
2. Compute “Average Hours Cut / Day” using a **2-month lookback**.
3. Respect the weekend toggle:
   - Ignore weekends ON → weekday-only denominator.
   - Ignore weekends OFF → all days denominator.
4. Add a settings option to choose prediction basis:
   - Average daily hours (computed), or
   - Fixed daily hours (manual).
5. Recompute predictions whenever:
   - Dashboard hours change,
   - Dashboard settings change,
   - Occurrence setting/interval changes.
6. **Do not allow Vercel preview environments to persist Firebase writes.**

---

## Detailed Implementation Plan

## Phase 0 — Safety + baseline instrumentation
1. Add a small diagnostics helper (dev-only) to log:
   - selected prediction mode,
   - effective hours/day used,
   - weekend inclusion flag,
   - computed next due.
2. Keep this non-persistent and removable after rollout validation.

**Risk:** Debug logging noise.
**Mitigation:** Guard behind `window.DEBUG_MODE`.

## Phase 1 — Extend config model for prediction mode
### Target file
- `js/core.js`

### Changes
1. Extend `DEFAULT_APP_CONFIG` with:
   - `predictionMode: "average" | "fixed"` (default: `"average"`).
2. Update `normalizeAppConfig(config)` to sanitize and clamp:
   - mode values,
   - fixed daily hours (`dailyHours`) with existing `clampDailyCutHours()`.
3. Add a helper:
   - `getPredictionDailyHoursSource()` returning `{ mode, fixedHours, averageHours, effectiveHours }`.

**Reasoning:** This allows one canonical source for UI display and computation.

## Phase 2 — Replace 1-month average with 2-month average calculator
### Target file
- `js/core.js`

### Changes
1. Update `getAverageDailyCutHours()`:
   - Use a 60-day lookback ending today (local normalized date).
   - Use `totalHistory` deltas (or daily logs if available by design choice), but keep one method only.
2. Denominator rules:
   - If ignore weekends ON: count only Mon–Fri days in the 60-day window.
   - If OFF: count all calendar days in window.
3. Fallback behavior:
   - If insufficient historical anchors, return `null` and let fixed-hours logic take over.

**Risk:** Denominator mismatch with sparse records.
**Mitigation:** Denominator based on eligible days in date window, not number of records.

## Phase 3 — Make prediction-hours selection explicit
### Target files
- `js/core.js`
- `js/computations.js`

### Changes
1. Update `getConfiguredDailyHours()` behavior:
   - If mode = `average` and computed average is valid → use average.
   - Else use fixed `dailyHours`.
   - Else fallback to default `8`.
2. Keep `nextDue(task)` in `js/computations.js` using `getConfiguredDailyHours()` so downstream consumers inherit mode logic automatically.

**Key verification:** `nextDue(task)` remains single-next-date only.

## Phase 4 — Ensure “single next occurrence only” across UI consumers
### Target files
- `js/views.js`
- `js/renderers.js`
- `js/calendar.js` (if any future-list assumptions exist)

### Changes
1. Audit all `nextDue(...)` consumers and remove any UI that implies multi-date forecasting.
2. Ensure labels/chips/cards show only one due target.
3. If any historical/multi occurrence data is shown, keep it as history only (not forecast list).

**Risk:** A component expects array-like forecast data.
**Mitigation:** Add adapter layer temporarily where needed, but render only `nextDueAt`.

## Phase 5 — Add dashboard settings UI for prediction mode
### Target files
- `index.html` (or rendered settings template)
- `js/renderers.js` / `js/views.js` (where dashboard settings are wired)

### Changes
1. Add settings control:
   - Radio/select: “Prediction basis: Average / Fixed”.
2. If fixed selected, show editable fixed hours/day input.
3. Preserve existing weekend toggle and wire all settings into `setAppConfig()`.

### Refresh triggers
After settings changes, force recompute/render of:
- dashboard due widgets,
- cutting job history header metric,
- cost analysis header metric.

## Phase 6 — Surface average/day on all required pages
### Target files
- `js/views.js`
- `js/renderers.js`

### Changes
1. Build one small reusable render helper:
   - `renderAverageHoursBanner(context)`.
2. Place at top of:
   - Dashboard page,
   - Cutting job history,
   - Cost analysis.
3. Display both:
   - Average Hours Cut / Day (computed), and
   - Prediction mode badge (Average or Fixed).

**Reasoning:** Prevent user confusion about which value drives due-date prediction.

## Phase 7 — Recompute hooks for required refresh events
### Target files
- `js/renderers.js`
- `js/core.js`
- `js/calendar.js` (task interval edits)

### Trigger requirements
Recompute predictions when:
1. Dashboard hours update (`totalHistory`/hours logging path),
2. Dashboard settings update (`setAppConfig` path),
3. Occurrence interval setting update (task edit/save path).

### Implementation pattern
- Call a single scheduling function (e.g., `schedulePredictionRefresh()`) from each trigger source.
- Debounce to avoid excessive rerenders.

## Phase 8 — Vercel preview no-write guard (Firebase safety)
### Target file
- `js/core.js`

### Changes
1. Add environment detector, e.g.:
   - `isPreviewRuntime = location.hostname.includes("-git-") || location.hostname.includes("vercel.app")` plus explicit allowlist/override.
2. In `saveCloudDebounced()` and `saveCloudNow()`:
   - short-circuit writes when preview mode is active.
3. Keep reading from Firebase intact.
4. Show a subtle UI notice (optional): “Preview mode: changes are local and won’t persist.”

**Critical:** No changes to production save behavior; only guard preview write calls.

## Phase 9 — Validation and rollout gates

### Automated checks (minimum)
1. Unit tests for:
   - 60-day average with weekends ON/OFF,
   - mode switching,
   - `nextDue(task)` single-date output.
2. Integration checks:
   - hours update triggers recompute,
   - settings change triggers recompute,
   - interval change triggers recompute.

### Manual QA script
1. Toggle weekend setting and confirm denominator change effect.
2. Toggle mode Average↔Fixed and confirm due date shifts accordingly.
3. Edit total hours on dashboard and confirm due date and banners refresh.
4. Confirm dashboard/history/cost show same average value.
5. In Vercel preview, attempt edits and verify refresh restores unchanged cloud state.

---

## Execution Order (Recommended)
1. Phase 1–3 (core computation correctness).
2. Phase 5–7 (UI wiring + refresh behavior).
3. Phase 6 (cross-page metric surfacing).
4. Phase 8 (preview write guard).
5. Phase 9 (tests + QA + rollout).

---

## Success Criteria (Done Definition)
- Every occurrence-based task shows exactly one predicted next due date.
- Average/day is computed from 60-day history and is weekend-policy aware.
- Prediction basis toggle (average/fixed) works and is respected globally.
- Dashboard, cutting history, and cost analysis show consistent average/day at top.
- Recompute triggers fire on all required changes.
- Vercel previews do not persist Firebase writes.
