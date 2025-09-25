# Cost Analysis Strategy Proposal

## 1. Current state recap
- **Maintenance projections** already derive an estimated cost-per-hour by summing interval task prices divided by their service intervals, then extrapolate usage windows and an annualized forecast from hour logs.【F:js/renderers.js†L3601-L3671】
- **Maintenance history** converts every logged machine-hours delta into a cost entry, which powers the recent-history list and the maintenance trend line on the chart.【F:js/renderers.js†L3674-L3691】【F:js/views.js†L904-L918】
- **Cutting job efficiency** compares planned hours to actual progress (manual logs, machine totals, or an 8 hr/day baseline) and assigns a gain/loss at $250/hr, feeding the efficiency summary, breakdown table, and chart line.【F:js/computations.js†L29-L145】【F:js/renderers.js†L3693-L3838】【F:js/views.js†L929-L953】
- **Order request spend** totals approved vs. requested amounts for consumables/parts but does not yet connect those dollars to maintenance intervals or consumable burn rates.【F:js/renderers.js†L3856-L3895】【F:js/views.js†L856-L879】

## 2. Objectives for the revision
1. Produce realistic, decision-ready visibility into *total hourly cost* of operating the waterjet and the *profitability of its output*.
2. Tie projected spend directly to tracked drivers: machine hours, maintenance tasks, consumables, downtime, and cutting jobs.
3. Surface a clear comparison of **actual vs. projected** cost streams, along with variance explanations.
4. Provide a concise dashboard (cards + table/chart) suitable for weekly reviews, while keeping detail drill-downs available for audits.

## 3. Data inputs to capture
| Category | Source today | Needed additions |
| --- | --- | --- |
| Machine hours | `totalHistory` logs | Enforce daily/shift logging discipline so gaps do not distort rates. |
| Maintenance tasks | Interval & as-required tasks with optional `price` | Require `price` for high-impact items, add "expected labor hours" and "parts replaced" fields to support labor + parts costing. |
| Consumables & utilities | Order requests | Configure per-hour burn rates (abrasive, water, electricity) and map approved orders to categories to derive real $/unit. |
| Cutting jobs | Jobs module | Record quoted revenue, actual invoiced revenue, material cost, and labor cost overrides per job to move from gain/loss proxy to realized gross margin. |
| Downtime | Calendar downtime events | Add downtime reason, duration, and attach an hourly opportunity cost (e.g., average contribution margin) or recovery cost (overtime). |
| Maintenance labor | Not tracked | Global labor rate + per-task labor hours or per-event overrides. |
| Overhead | Not tracked | Configurable monthly fixed overhead (rent, software, insurance) to allocate per machine-hour. |

## 4. Proposed data model updates
1. **Global configuration panel** (settings screen) to store:
   - Consumable burn rates: abrasive lbs/hr, water gal/hr, electricity kWh/hr, labor $/hr, overhead $/month.
   - Default revenue rate per cutting hour and default opportunity cost per downtime hour.
   - Default spare-part markups if resale vs. internal cost matters.
2. **Maintenance tasks**: extend task schema to include `laborHours`, `partsCost`, and optional `downtimeHours` for each service. When completing a task, prompt for actuals to compare against defaults.
3. **As-required events**: log actual spend (parts + labor) and tie to a category so they land in the correct cost bucket.
4. **Cutting jobs**: add `quotedRevenue`, `actualRevenue`, `laborHours`, and `otherCosts` fields. Keep `manualLogs` for hours but also allow capturing consumable overrides per job when known.
5. **Downtime records**: store `durationHours`, `reason`, `directCost` (repair expense), and `opportunityCost` (auto-computed = duration × configured rate, editable).
6. **Order items**: tag each item with a cost driver (consumable type, maintenance part, tooling, miscellaneous) so approved spend can be allocated to either per-hour rates or one-off maintenance actuals.

## 5. Calculation pipeline
1. **Maintenance cost per hour**
   - Keep existing price/interval logic but split into *parts cost per hour* and *labor cost per hour* using task defaults.【F:js/renderers.js†L3601-L3615】
   - When a maintenance event is marked complete, record actual parts + labor spend and reconcile variance vs. projection; push actuals into the history timeline.
2. **Consumable and utility spend**
   - Derive dynamic $/hr from approved orders tagged as abrasive, water, electricity, and calibrate by dividing dollars by logged consumption (lbs/gal/kWh) or by total machine hours since last calibration.
   - Maintain a running weighted average rate; allow manual overrides if consumption counters are available.
3. **Downtime impact**
   - Convert downtime events into dollar impact = opportunity cost rate × duration + direct repair spend. Log in a downtime ledger so the summary chart can show maintenance vs. downtime vs. consumables.
4. **Cutting job profitability**
   - Replace the fixed $250/hr assumption with `(actualRevenue - (laborHours × labor rate) - materialCost - allocated consumables)`; fall back to defaults when actuals are missing but flag estimates.【F:js/computations.js†L29-L145】
   - Track variance between quoted and actual revenue as part of the job breakdown table.【F:js/views.js†L929-L953】
5. **Overhead allocation**
   - Convert monthly overhead into $/hr using rolling 90-day average machine hours. Add this to the total cost-per-hour figure used in summaries.
6. **Profitability rollups**
   - Aggregate costs into buckets (maintenance, consumables/utilities, downtime, labor, overhead) and compute:
     - Actual vs. projected per bucket (rolling windows reuse existing timeframe logic).【F:js/renderers.js†L3655-L3685】
     - Total cost per machine hour and per cutting job.
     - Net contribution = job revenue − allocated cost.

## 6. Reporting & UI plan
1. **Summary cards** (top of Costs page) to display:
   - Total cost per machine hour (actual last 30 days) vs. projected.
   - Monthly operating profit (revenue − total cost) with trend direction.
   - Year-to-date maintenance spend vs. budget.
   These extend the existing card pattern.【F:js/views.js†L821-L838】
2. **Stacked trend chart**
   - Reuse the canvas renderer to plot multiple cost streams (maintenance, consumables, downtime) as stacked areas or separate lines with toggles.【F:js/renderers.js†L3917-L4005】
   - Overlay job revenue to visualize margin trends.
3. **Cost table**
   - Expand the “Maintenance Cost Windows” table into a pivot that lists each bucket, actual, projected, and variance for 30d/90d/YTD, plus cost-per-hour figures.【F:js/views.js†L882-L901】
4. **Downtime ledger**
   - Add a new window showing downtime events with reason, hours lost, and dollar impact to highlight chronic issues.
5. **Job profitability grid**
   - Extend the existing job snapshot to include quoted vs. actual revenue, cost allocation, and resulting margin %, sorted by largest variance.【F:js/views.js†L929-L953】
6. **Drill-down modals**
   - From each table row, open a modal showing the underlying order requests, maintenance logs, or downtime details for auditability.

## 7. Implementation roadmap
1. **Schema & settings groundwork**
   - Add settings UI for global rates and extend task/job/downtime schemas with new fields. Provide migration defaults so existing data remains valid.
2. **Data capture enhancements**
   - Update forms (maintenance completion, job logs, downtime modal, order tagging) to require/encourage the new inputs. Validate entries and persist to Firestore alongside existing structures.
3. **Computation layer**
   - Introduce helper functions that calculate bucketed costs, cost-per-hour, and job profitability using the enriched data, building on current maintenance/job computations.【F:js/computations.js†L29-L145】【F:js/renderers.js†L3601-L3913】
4. **Visualization updates**
   - Feed new metrics into the cost renderer: refresh summary cards, augment tables, and update the chart drawing routine to handle multiple datasets and stacked values.【F:js/views.js†L821-L955】【F:js/renderers.js†L3917-L4005】
5. **Variance tracking & alerts**
   - Implement thresholds (e.g., >15% variance) that raise alerts or badges within the cards/tables to prompt corrective action.
6. **Validation & reporting**
   - Reconcile computed totals against actual approved order spend monthly to ensure accuracy, and export summaries as CSV/PDF for leadership reviews.

This plan grounds projections in real machine usage, aligns maintenance and consumable spend with their drivers, and produces actionable profitability insights for the waterjet operation.
