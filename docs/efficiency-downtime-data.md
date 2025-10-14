# Efficiency and Downtime Data Sources

This document summarizes how the application now records cutting efficiency, downtime, and the way charts consume the expanded datasets. It also outlines migration behavior so existing operators know what to expect when legacy data is loaded.

## Run/Idle Logging

Daily cutting utilization is tracked through the `dailyCutHours` collection. Normalization merges duplicate inputs, clamps impossible values, and records the source of each entry (manual operator note vs. automatic machine total). Each normalized row stores a `dateISO`, `hours`, `source`, and `updatedAtISO` timestamp so the app can reason about provenance and recency.【F:js/core.js†L1512-L1551】

Consumers pull the normalized map via `getDailyCutHoursMap`, which feeds the time-efficiency calculations. Those calculations evaluate actual hours against the configurable baseline, compute coverage, and surface the gap-to-goal metrics shown in the dashboard summary cards and inline widgets.【F:js/computations.js†L12-L89】

When new machine totals arrive (for example from the total-hours log), `syncDailyHoursFromTotals` backfills the daily map while respecting manual overrides. The helper ensures the delta between successive totals becomes the day's run hours and only overwrites automated entries when appropriate.【F:js/computations.js†L91-L121】

## Structured Downtime Schema

Scheduled downtime lives in `window.downTimes`. The renderer normalizes any legacy string entries into `{ dateISO }` objects and prunes malformed rows so downstream features can assume a consistent shape.【F:js/renderers.js†L2809-L2840】

The calendar consumes this collection to highlight down days. It builds a set of ISO keys for rendering and allows operators to remove downtime directly from the month view while keeping the normalized shape intact.【F:js/calendar.js†L1309-L1456】

## Chart Consumption

`computeCostModel` blends machine usage history, maintenance pricing, downtime suppressions, and job efficiency to drive the cost overview chart. It parses normalized hour history, rolls up maintenance spend, and assembles the maintenance and cutting job series that power the combined impact visuals.【F:js/renderers.js†L7357-L8400】

The same model generates timeframe summaries and rolling averages that appear in the efficiency snapshot cards. Because those summaries pull directly from the normalized daily hours and job gain/loss computations, operators always see metrics derived from the reconciled run/idle dataset.【F:js/renderers.js†L7580-L8043】

## Migration Guidance

* **Daily cutting hours:** `normalizeDailyCutHours` gracefully upgrades legacy records that used alternate keys (`date`/`dateIso`) or lacked metadata. Manual entries win over automated imports so historical edits remain intact.【F:js/core.js†L1512-L1551】
* **Downtime entries:** Older installs that stored raw date strings or null objects are converted during `ensureDownTimeArray`, ensuring the calendar and summary panels continue to work without manual cleanup.【F:js/renderers.js†L2809-L2840】
* **Charts and summaries:** Cost and efficiency charts automatically recompute using the normalized datasets on load, so no one-off migrations are required. Operators only need to confirm that baseline hour settings still reflect their targets before reviewing the refreshed summaries.【F:js/renderers.js†L7357-L8043】
