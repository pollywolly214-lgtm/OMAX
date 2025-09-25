# Water Jet Cost Analysis Strategy Proposal

## 1. Objectives
- Provide an auditable, decision-ready view of operating cost vs. revenue for the water jet.
- Capture direct production time, consumables, maintenance, downtime, and overhead in one projection model.
- Surface actionable trends through dashboards, summary cards, and tables already scaffolded by `computeCostModel()` and `viewCosts()`.

## 2. Current Implementation Review
The existing cost view (`viewCosts` + `computeCostModel`) already renders:
- **Interval maintenance forecast** using interval tasks priced per hour.
- **Job efficiency** via cumulative gain/loss from `jobsInfo` entries.
- **Usage-derived projections** using logged `totalHistory` machine hours.
- **History tables and chart toggles** for maintenance vs. jobs series.

Gaps identified:
- No representation of **material/consumable costs** per job.
- **Downtime** (planned vs. unplanned) is not tracked; maintenance only covers scheduled intervals.
- **Labor and utilities** overhead are excluded.
- **Revenue recognition** is limited to job gain/loss, without standardizing quoting assumptions.
- Lack of **scenario planning** (e.g., forecast next quarter with updated utilization) or **sensitivity** toggles.

## 3. Data Model Enhancements
| Area | Proposed Fields | Source | Notes |
| --- | --- | --- | --- |
| Machine Utilization | `hourLogs[{ dateISO, hours, reason }]` | Operator log UI | Extend `totalHistory` with reason codes (Production, Maintenance, Idle). |
| Maintenance Tasks | `tasksInterval[{ name, intervalHours, costUSD, type }]` | Existing maintenance form | Normalize cost per interval and tag `type` (Preventive, Calibration). |
| As-Required Tasks | `tasksAsRequired[{ name, avgCostUSD, frequencyPerYear }]` | Maintenance history | Convert to expected annualized cost. |
| Consumables | `consumables[{ material, unitCostUSD, consumptionRatePerHr, scrapRate }]` | Job setup sheet | Links cutting operations to material usage. |
| Labor | `laborRates[{ role, hourlyRateUSD, utilizationPct }]` | HR/Finance | Allows blended cost per production hour. |
| Utilities | `utilityRates[{ name, costPerKWh, kWhPerHr }]` | Facility data | Adds electricity/water usage cost per hour. |
| Downtime | `downtimeEvents[{ startISO, endISO, category, costUSD }]` | Maintenance log | Captures lost production value. |
| Jobs | `jobsInfo[{ id, name, dateISO, quoteUSD, actualUSD, materialCostUSD, laborHours, machineHours, status }]` | Jobs module | Expands revenue & cost breakdown per job. |

## 4. Calculation Framework
1. **Baseline Cost Per Machine Hour**
   - `maintenanceHourly = sum(intervalTasks.costUSD / intervalTasks.intervalHours)` (existing logic).
   - `consumableHourly = Σ(unitCostUSD × consumptionRatePerHr × (1 + scrapRate))`.
   - `laborHourly = Σ(hourlyRateUSD × utilizationPct)`.
   - `utilityHourly = Σ(costPerKWh × kWhPerHr)`.
   - `downtimeHourly = (Σ downtimeEvents.costUSD) / totalDowntimeHours` to establish average impact.
   - `totalHourlyCost = maintenanceHourly + consumableHourly + laborHourly + utilityHourly + downtimeHourly`.

2. **Job-Level Profitability**
   - `jobCost = (machineHours × totalHourlyCost) + materialCostUSD + subcontract/outsourced charges`.
   - `jobMargin = quoteUSD - jobCost` with variance breakdown (material vs. time vs. overhead).
   - Persist margin history to feed job efficiency cards and the chart.

3. **Downtime Impact Projection**
   - Track planned vs. unplanned events; compute `productionCapacityLoss = downtimeHours × blendedContributionMarginPerHr`.
   - Display as a separate card ("Lost revenue from downtime") and optionally overlay on charts.

4. **Maintenance Projection**
   - Keep current interval projection; add annualized cost from as-required tasks.
   - Provide scenario toggle: baseline hours, target hours (+10%), stretch hours (+25%).

5. **Revenue Projection**
   - Build pipeline from scheduled jobs: `scheduledRevenue = Σ job.quoteUSD` filtered by status (Scheduled, In Progress).
   - Forecast revenue per hour using historical average sell rate (`Σ job.actualUSD / Σ job.machineHours`).

## 5. Dashboard & Reporting Plan
- **Summary Cards** (top row):
  1. Total projected annual cost (maintenance + consumables + labor + utilities + downtime).
  2. Scheduled revenue (next 90 days) vs. breakeven requirement.
  3. Net projected margin (Revenue − Total Cost).
  4. Downtime impact YTD.
- **Cost Composition Chart**: stacked area showing cost components per month.
- **Scenario Toggle**: Buttons for utilization scenarios (e.g., 70%, 85%, 95%). Drives projections.
- **Job Profitability Table**: Columns for quote, actual cost, margin %, material %, labor %, rework flag.
- **Maintenance & Downtime Timeline**: Combined chart with planned maintenance, unplanned downtime, and associated cost.
- **Consumables Tracker**: Table of actual vs. forecast usage per material with reorder hints.

## 6. Implementation Phases
1. **Data Foundation**
   - Extend existing data arrays (`totalHistory`, `tasksInterval`, `jobsInfo`) to include new fields.
   - Create input forms/logging UI for consumables, labor, utilities, and downtime events.
   - Normalize currency/units centrally (`formatterCurrency`).

2. **Computation Updates**
   - Refactor `computeCostModel()` to assemble the new cost components and scenarios.
   - Add helper modules (e.g., `cost-model.js`) for reusable cost calculations.
   - Ensure projections remain performant (memoize aggregated values).

3. **UI Enhancements**
   - Update `viewCosts()` to render new cards, charts, and tables.
   - Reuse existing layout customization and toggles for new components.
   - Provide inline editing or drill-down modals for job and downtime entries.

4. **Validation & Governance**
   - Add unit tests for cost computations (e.g., verifying hourly rollups).
   - Implement audit logs for manual overrides (maintenance costs, downtime estimates).
   - Document assumptions and allow export (CSV/PDF) for leadership review.

## 7. Accuracy & Realism Considerations
- Align consumable usage rates with machine manufacturer data and adjust quarterly.
- Validate labor utilization using time-tracking or payroll data.
- Cross-check downtime cost with scheduling backlog (lost job hours × average sell rate).
- Maintain conservative assumptions (e.g., include scrap) to avoid underestimating costs.
- Schedule monthly review of projections vs. actuals and adjust inputs accordingly.

## 8. Deliverables
- Revised data schema and UI inputs.
- Enhanced cost dashboard reflecting full cost stack and revenue forecasts.
- Exportable summary (PDF/CSV) with annualized projections and YTD performance.
- SOP for data updates (hour logs, downtime events, consumables adjustments).

## 9. Next Steps
1. Confirm data availability for consumables, labor, utilities, and downtime.
2. Prioritize UI work for logging consumables and downtime events.
3. Prototype updated `computeCostModel()` calculations and validate with historical jobs.
4. Iterate on dashboard design with stakeholders before full build-out.
