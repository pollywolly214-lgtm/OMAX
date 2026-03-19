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

1. Extend config model for prediction mode.
2. Replace 1-month average with 60-day average calculator.
3. Make prediction-hours selection explicit.
4. Ensure single next-occurrence display across UI consumers.
5. Add dashboard settings UI for prediction mode.
6. Surface average/day on dashboard, jobs, and cost pages.
7. Add recompute hooks for required refresh events.
8. Add Vercel preview no-write guard.
9. Validate with tests and manual QA.

---

## Success Criteria
- Every occurrence-based task shows exactly one predicted next due date.
- Average/day is computed from 60-day history and is weekend-policy aware.
- Prediction basis toggle (average/fixed) works and is respected globally.
- Dashboard, cutting history, and cost analysis show consistent average/day at top.
- Recompute triggers fire on required changes.
- Vercel previews do not persist Firebase writes.
