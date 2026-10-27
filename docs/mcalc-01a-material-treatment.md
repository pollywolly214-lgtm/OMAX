# MCALC-01A — configurable material cost treatment

Status: READY FOR MCALC-01B REVIEW. Prospective configuration; no historical migration or production data writes were performed during implementation/testing.

## Starting point and isolation

- Original checkout: `codex/phv2-02a-purchase-orders`, HEAD `b2e7fb8f11855c2ee895044e74c1b9a32e8a6e5b`.
- Starting status: modified `style.css`; untracked `.worktrees/` and `artifacts/`. All retained untouched in that checkout.
- Fetched `origin/main`: `4ae92af9faa91f485b47c5b514d819ac8c5db30e`.
- Implementation branch: `codex/mcalc-01a-material-treatment`, created directly from that main commit in `.worktrees/mcalc-01a`; initially clean.
- Commit and PR identifiers are supplied in the PR and final delivery. No merge is requested or performed.

## Audit: original architecture and field meanings

`computeCuttingJobProfit` in `js/computations.js` is the canonical financial helper. `computeJobEfficiency`, Cutting Jobs active/history totals, calendar bubbles, Cost Analysis, financial reconciliation, and Projects consume it. View-local `computeJobNetTotal` and renderer-local `resolveCuttingJobNetTotal` are adapters, not independent financial formulas. The what-if calculator constructs temporary helper inputs; it must carry the saved mode with those inputs.

| Field | Units and original source/meaning |
| --- | --- |
| Charge Rate | USD/hour of modeled cutting revenue. First finite nonnegative `job.chargeRate`, then `job.efficiency.chargeRate`, then $250/hour. Ordinary new-job/import defaults may be $200/hour. This is a revenue rate, not a profit rate. |
| Cut Cost Rate | USD/hour of operating expense. First finite `job.costRate`, then `job.efficiency.costRate`, then $30/hour, taking the absolute value. Ordinary forms/imports commonly use $45/hour; current calculated CCR can supply a new job's saved rate. Negative stored rates represent expense magnitude, not refunds. Material is deducted separately by the canonical helper. |
| Hours Taken | Hours from `resolveCuttingJobFinancialDuration`. Positive `estimateHours` remains the financial duration for active and completed jobs, despite the legacy field name. Active jobs do not substitute progress or machine time. Completed zero/missing financial durations can use supported positive `actualHours` or the latest cumulative manual log, with corroborating imported minutes where available. Conflicting, decreasing, post-completion or wrong-import evidence is flagged rather than chosen. Imported minutes alone do not establish authoritative runtime. |
| Cutting Revenue | `hours × chargeRate`, USD total, before failures. |
| Operating/Cutting Cost | `hours × abs(costRate)`, USD total. Full runtime cost remains after failures. |
| Material Cost | `materialCost`, USD per stored quantity unit. `materialQty` is the count/multiplier, not automatically pounds. Negative/invalid values fall back to zero as before. |
| Material Expense | `materialCost × materialQty`, USD total. New Jobs' material calculator computes dimensions × density × waste factor × price/lb into an already extended `materialCost`, stores weight separately as `materialWeight`, and sets `materialQty = 1`. Historical/manual quantity values are still honored exactly once. No material-price/inventory calculator changes are made. |
| Failure / success | Stored `failurePercent`, clamped to 0–100 for calculation; effective success fraction is `1 − failurePercent/100`. Missing failure uses 0% internally, while individual-job UI retains its existing provisional/unknown labels. There is no separate success-rate input or additional physical scrap multiplication in this helper. |
| Revenue Lost | `cuttingRevenue × failurePercent/100`, USD total. |
| Adjusted Revenue | `cuttingRevenue × (1 − failurePercent/100)`, USD total. |
| Net Profit/Hr | Existing `netRate = chargeRate − abs(costRate)`, USD/hour before material and failure adjustments. It is an operating margin rate, not `Net Total / hours`. Preserved to avoid changing another established metric; job details explain this distinction. |
| Original Net Profit | `cuttingRevenue − cuttingCost − materialExpense`, USD total before failures. “Original” means before failure, not a preserved accounting snapshot. |
| Net Total / Total Job Profit | `adjustedRevenue − cuttingCost − materialExpense`, USD total. These two labels share one calculation. |
| Bid / Customer Price | No canonical stored invoice/bid price is consumed by this financial path. This change adds explicitly modeled customer prices from charge revenue, rather than inventing an invoice amount from profit. |

`buildCompletedJob` stores an `efficiency` summary (including `gainLoss` and `totalProfit`), but current readers recompute from job inputs. Cached derived totals do not override the helper. Legacy stored efficiency rates remain fallback inputs. Reconciliation reports differences between caches and modeled values without repairing them. Projects has its own disclosed duration/eligibility rules and then invokes the same financial helper; this change preserves those rules.

## Formulas implemented

Let `H` = resolved financial hours, `C` = charge USD/hour, `O` = absolute cost USD/hour, `M` = material unit cost × quantity, and `f` = failure percentage / 100.

Common values in both modes:

```text
cuttingCharge / revenue = H × C
cuttingCost             = H × O
adjustedRevenue         = H × C × (1 − f)
cuttingProfit           = adjustedRevenue − cuttingCost
revenueLost             = H × C × f
netRate                 = C − O  (before material/failures; existing contract)
```

| Result | Deduct material from profit | Charge material separately |
| --- | --- | --- |
| `materialCharge` | 0 | M |
| `materialProfitDeduction` | M | 0 |
| `originalNetProfit` | H × C − H × O − M | H × C − H × O |
| `totalProfit` / Net Total | adjustedRevenue − H × O − M | adjustedRevenue − H × O |
| `customerPrice` / bid before failures | H × C | H × C + M |
| `adjustedCustomerPrice` / modeled amount after failures | adjustedRevenue | adjustedRevenue + M |

Both modes conserve `totalProfit = adjustedCustomerPrice − cuttingCost − materialExpense`. In separate mode material revenue and material expense offset; material has no markup. Runtime and full material expense remain when cuts fail. Separate material recovery is not discounted by the cutting failure percentage. No extra material quantity or guessed scrap factor is applied.

For H=2, C=$200/hour, O=$45/hour, M=$100:

| Failure | Deduct profit | Separate cutting profit | Material expense | Deduct bid / adjusted customer amount | Separate bid / adjusted customer amount |
| --- | --- | --- | --- | --- | --- |
| 0% | $210 | $310 | $100 | $400 / $400 | $500 / $500 |
| 50% | $10 | $110 | $100 | $400 / $200 | $500 / $300 |
| 100% | −$190 | −$90 | $100 | $400 / $0 | $500 / $100 |

The bid is gross cutting charge plus any separate material charge. Adding profit to material would omit operating cost ($310 + $100 = $410); this implementation correctly yields $500. The modeled after-failure amount explains existing failure accounting and is not an invoice, revised contractual bid, or evidence of payment.

## Configuration, persistence and historical protection

- One control in the existing Workspace configuration modal: **Material Cost Treatment** with `deduct` and `separate` enum values. Default remains `deduct`.
- Authoritative setting: Firestore `workspaces/github-prod/app/state`, field `appConfig.materialCostTreatment`. Existing cloud adoption/normalization and backup architecture retain it. Browser backup is not a competing configuration authority.
- The form uses the existing verified configuration writer in `cutCostFeedbackUi.js`. It reads backend state, checks identity/revision/pending-write protections, commits only `appConfig` and `syncMeta`, reads back the exact committed state, and adopts only a verified result. Unknown/unrelated backend settings are preserved. The form waits for verification and displays failure rather than optimistically applying a local-only mode.
- The shared `createCuttingJob` boundary captures the current verified mode as `job.materialCostTreatment`, covering ordinary Jobs, dashboard creation, and new copies of completed jobs. Existing explicit captured values are preserved on retries. The existing guarded job writer persists the new field. A copied job is a new job and uses current configuration.
- Existing untagged active AND completed jobs resolve to `deduct`, regardless of the global selection. Newly created tagged jobs retain their mode during edits, completion, reload and later global changes. There is no “apply to existing jobs” action. Historical import records remain untagged and retain legacy semantics.
- A configuration change does not migrate/tag existing jobs, rewrite Net Totals/efficiency snapshots, edit quantities, update material prices, touch inventory/Purchase History, or change unrelated job fields. Configuration tests compare exact non-config state before/after. No production backend was written during this task.
- This prospective policy is deliberate: applying the global toggle dynamically to untagged completed jobs would silently increase reported historical profit by their material expense, even without writing their records. That shortcut is not used. Changing existing accounting interpretation requires a separate reviewed decision/task.
- Existing reports remain dynamically modeled from saved inputs (and fallback rates/duration evidence); this change does not convert them into immutable or verified accounting snapshots. Any historical snapshot/cache fields already stored are retained exactly when the setting changes.

## Dependencies and scope

Cost Analysis cards, graphs, completed-job tables, calendar totals, and Projects obtain profit from the same helper. Full material expense remains an expense metric in both modes. Financial Breakdown and exclusion previews now show separate material recovery so the bridge reconciles:

```text
Net = adjusted cutting revenue + separate material recovery − runtime expense − full material expense
```

Cutting-only revenue/charge/hour metrics retain their meaning. Full runtime-plus-material expense metrics retain their meaning. Material recovery, customer bid and modeled after-failure customer amount are separately labeled. The temporary what-if calculator carries each row's saved mode instead of reverting to deduct. Existing cost-rate comparisons, date/population selection, projections, purchase/maintenance overlap protections, and net-waterjet coverage limits remain unchanged. Project reporting copy now explains the inherited per-job treatment; its calculation/eligibility implementation is unchanged. No unrelated dashboard, inventory, maintenance, Purchase History or Cost Analysis redesign is included.

## Files changed

| File | Purpose |
| --- | --- |
| `js/computations.js` | Extend canonical calculation with mode, cutting profit, recovery and modeled customer prices. |
| `js/core.js` | Default/normalize configuration and capture mode at new-job creation. |
| `index.html` | Add the single configuration control, historical-scope explanation and save status. |
| `js/cutCostFeedbackUi.js` | Reuse existing verified, field-scoped configuration persistence for the workspace form. |
| `js/renderers.js` | Await verified configuration saving, retain mode through Cost Data Center/what-if adapters, and explain failure treatment. |
| `js/views.js` | Show mode, distinct material/cutting/customer figures, reconciled recovery bridges and prospective new-job policy. |
| `js/projects.js` | Update two explanations to reflect the shared helper's saved treatment. |
| `tests/mcalc-material-treatment.test.js` | Accounting, history protection, completion, downstream calculations and atomic configuration fixtures. |
| `tests/mcalc-material-treatment.browser.cjs` | Isolated localhost browser configuration/reload/new-job/completion/report regression. |
| This document | Audit, design, evidence and remaining checks. |

## Validation and remaining checks

No `package.json` exists. No npm commands, build, or package lint/type scripts were run.

- `node --check` on every modified JavaScript file and both new test files: PASS.
- Focused existing suite: `node --test tests/cjprofit01-calculation.test.js tests/cjprofit01b-downstream.test.js tests/cjprofit02-failed-cut.test.js tests/cjprofit03-ui.test.js tests/financial-reconciliation.test.js tests/cut-cost-feedback.test.js tests/cje-completed-duration.test.js tests/cje-source-reconciliation.test.js tests/projects-financial-basis.test.js`: 145 PASS.
- `node --test tests/mcalc-material-treatment.test.js`: 12 PASS. Includes quantities, zero material, signed cost rates, fractional hours, failure cases, supported historical duration, immutable legacy records, completion mode retention, mixed-mode financial bridges, calendar/data center/what-if consumers, atomic config save/readback/reload, stale/pending/recovery/indeterminate gates, and form error handling.
- Full `tests/*.test.js` suite: 1,911 PASS / 10 FAIL (1,921 total). Untouched fetched main baseline: 1,899 PASS / the same 10 FAIL (1,909 total). Failure names and counts were compared; no MCALC regression. Existing failures are 3 in `cjo02b-safety.test.js` (two missing `syncNewCuttingJobSaveControls` fixture bindings and a repair-UI expectation), 6 in `cjpc01-manual-paths.test.js` (missing duration-helper/DOM fixture bindings and dependent release assertion), and 1 in `projects-accuracy.test.js` (old zero-duration expectation). They are outside MCALC scope and remain unchanged.
- `node --test tests/mcalc-material-treatment.browser.cjs` using bundled Playwright/Edge and `OMAX_PLAYWRIGHT_PATH`: PASS. Entire external network blocked; uses only `?devsafe=1` disposable local backend. Exercises real configuration UI, exact non-config preservation, reload, new job creation, retained mode after toggling, completion, financial cards and recovery bridge. The test honors existing pending route/layout-save gates before job operations. Browser screenshots were visually inspected; detailed pricing explanation is kept inside expansion to preserve compact tables.
- Existing `tests/financial-reconciliation.browser.cjs`: 2 PASS, covering Chicago and UTC+14 local-day/financial-period reconciliation with a disposable localhost backend.
- `git diff --check`: PASS. `scripts/check_binaries.py` with bundled Python: PASS (no binary tracked files).

Browser launch initially failed inside the Windows process sandbox; the same isolated test ran successfully outside that process sandbox. Early browser fixture failures were resolved by initializing a baseline revision and honoring existing pending-save gates; no production safety gate was bypassed.

Still manual: authenticate against an authorized staging Firebase workspace, save/reload both settings, log out/in, open a second device/session, and verify permission-denied/offline behavior against actual Firebase. Live Firebase, real logout/login and device-switch persistence were not exercised. Local backend/atomic fixtures validate the code path, not deployed service permissions.

Accounting limits: rates are saved modeled inputs, not proof of historical operating-cost composition; legacy rates may contain unverified allocations. Separate mode assumes full at-cost material recovery even with failed cuts. Invoice collection, tax, shipping, markup, additional physical scrap, and contractual failure pricing require additional inputs/business rules and are not inferred. No invoice/Purchase History price is overwritten. These limitations do not prevent reviewing the implemented prospective MCALC behavior.
