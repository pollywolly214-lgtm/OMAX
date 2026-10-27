# MCALC-01B — global material cost treatment correction

Status: READY FOR MCALC-01C TESTING. Updates existing PR #527; do not merge.

## Branch and scope

- Branch: `codex/mcalc-01a-material-treatment`, existing worktree `.worktrees/mcalc-01a`.
- Starting commit: `bc748f6bec60fdc6441f1eda9dd0c62ba3623f4a` (01A); initially clean.
- Existing PR base: `4ae92af9faa91f485b47c5b514d819ac8c5db30e`. Fetch during 01B observed newer main `7edc7ea5e986cb6ffaeb8203ece5755b168b00d3`; unrelated main changes were not mixed into this correction.
- Latest correction commit is reported in the PR and final delivery. The original root checkout's modified `style.css` and untracked worktree/artifact folders remain preserved.

01B corrects the prospective/per-job policy in 01A. Displayed results for all existing, completed and imported jobs now change with the global setting. Stored job records, financial snapshots and historical source values do not change from toggling.

## Global authority and formulas

The sole calculation authority is the verified/adopted `window.appConfig.materialCostTreatment`, persisted in Firestore `workspaces/github-prod/app/state`, field `appConfig.materialCostTreatment`. `computeCuttingJobProfit` reads this setting on every invocation. Exactly `separate` enables separate recovery; absent, invalid or `deduct` settings resolve to `deduct`.

The helper never reads `job.materialCostTreatment`, never accepts a per-job/options mode override, and never takes cached Net Totals as a financial result. Existing per-job properties remain untouched as metadata. `createCuttingJob` no longer captures a mode. The what-if calculator no longer copies a mode from its rows.

With H = resolved financial hours, C = charge USD/hour, O = absolute operating cost USD/hour, M = material unit cost × quantity, and f = failure percentage / 100:

```text
Gross cutting revenue       R = H × C
Adjusted cutting revenue    A = R × (1 − f)
Cutting operating cost      K = H × O
Cutting profit                = A − K
Separate material recovery  S = 0 in deduct; M in separate
Net Total / job profit        = A + S − K − M
Modeled customer bid          = R + S
Adjusted modeled amount       = A + S
Before-failure net profit     = R + S − K − M
```

Thus deduct gives `A − K − M`, separate gives `A − K`. Material recovery is at cost and contributes no profit. The 2-hour/$200-hour/$45-hour/$100-material/0%-failure fixture yields $210 net/$400 bid in deduct, and $310 cutting profit/$100 separate recovery/$500 bid in separate. Material quantity is multiplied once. Full operating/material costs remain after failures, and separate material recovery is not discounted by cutting failure percentage. No extra physical scrap multiplier is inferred.

Duration, numeric fallback and unit rules are unchanged from the original audit in `mcalc-01a-material-treatment.md`. In particular, positive stored `estimateHours` stays the financial duration; completed zero/missing financial hours can use supported recorded evidence. Net Profit/Hr retains its established `C − O` operating-margin meaning before material/failure; it is not silently changed to Net Total / hours. Operating rates, revenue rates, material expense, cost/hour metrics and raw source fields keep their meaning.

## Consumer audit

| Consumer | Calculation/read path | 01B action |
| --- | --- | --- |
| Active Cutting Jobs, Net Total, summary/details, search tokens | `views.js` adapters → `computeCuttingJobProfit` | Global helper changes all affected totals; per-job/default labels replaced by global labels. |
| Completed/historical/imported jobs, averages and totals | Same helper plus `OMAXFinancialReconciliation.selectJobs`; existing date/category/population filters | Global recalculation includes untagged and contradictory-tagged history, preserving duration/source rules. |
| Net Profit/Hr and operating rates | Helper `netRate = chargeRate − abs(costRate)` and view rate adapters | Audited; unaffected operating-margin metric preserved. |
| Failure preview/detail dialog | `showFailedCutDialog` → shared helper with only failure override | Global mode label corrected; adjustments/costs unchanged. |
| Active/completed calendar bubbles | `calendar.js` → shared helper | No consumer formula edit needed; current global totals are calculated on open. Existing visible bubble is closed after a verified config change. |
| Dashboard financial dependencies | `renderDashboard` obtains `computeCostModel`; calendar/jobs derive shared values | Current route rebuilt after verification; no independent per-job profit formula found. Utilization, machine-hour averages, water quality and opportunity rollups are not material-treatment metrics and are not recomputed/persisted by a mode-only toggle. |
| Cost Analysis cards, job totals, graphs | `computeCostModel` → canonical helper/financial reconciliation; `jobSeries` from canonical per-job totals | Global helper drives cards/graph values; normal visible-page render rebuilds models and charts. |
| Cost Analysis projections and category metrics | Active job profit uses shared helper; maintenance forecasts and category full-cost metrics use operating/material expenses | Affected profit projections recalculate. Full expenses, maintenance projections, purchase spending and current CCR inputs remain unchanged. Do not reinterpret legacy cost fields named `gainLoss` as profit where they actually carry full expense. |
| Financial Breakdown, rate comparisons, reconciliation and audit/exclusion previews | `financialReconciliation.js` invokes injected canonical helper; expenses/recovery remain separate | All reports use global mode. Explanation and stored-snapshot diagnostic wording updated. No audit repairs or exclusions are persisted. |
| Cost Data Center | `resolveCuttingJobNetTotal` → shared helper; table/efficiency row adapters | Remove unnecessary row-level mode fields; totals reflect the global configuration. |
| What-if calculator | Temporary rates/material totals/failure inputs → shared helper | Remove copied per-row treatment. Global policy applies even with temporary rates. |
| Projects profitability/tables/averages/aggregates/active projections | `ProjectDashboard.financials` calls canonical helper on its existing duration/eligibility projection | No independent mode formula needed. Global mode controls net, before-failure net, averages, provisional net and completed/active profit scopes. Copy corrected; full processing/material/total-cost metrics preserved. |
| Completion/edit snapshots | `buildCompletedJob` and explicit job-edit flows | Creation stamping removed. Existing derived snapshot readers are not financial authorities. Explicit user completion/edit behavior remains; a configuration toggle never invokes these operations. |
| Exports/reports/backups | Full-state/recovery JSON exports preserve raw job records and appConfig; weekly XLS reports use machine cutting/maintenance expense; purchase CSV/XLS use purchase financials | No separate cutting-profit exporter found. Historical/source/snapshot exports remain exact; expense-only exports do not change. Runtime report and audit models use the shared global helper. |

A runtime source search confirms no `job.materialCostTreatment`, `job?.materialCostTreatment`, or row-level treatment read remains in the calculation paths. `profit.materialCostTreatment` in views is the helper's resolved global result. Stored `efficiency.gainLoss` is only compared for reconciliation warnings, not used as net; stored efficiency rates remain legitimate fallback input rates.

## Verified saving and immediate refresh

The existing `saveWorkspaceConfig`/`saveChange` writer remains the only writer. The form submits only fields that actually differ from the current normalized configuration. A mode-only toggle therefore prepares exactly one appConfig value change without adding unrelated scheduling defaults. The writer builds from the authoritative backend source, retains unknown settings, uses existing revision/CAS, identity, protected-state/content checks and backup safeguards, commits `appConfig` plus required `syncMeta`, then verifies backend readback before adopting configuration.

The form does not optimistically set appConfig. While verification is pending, the old mode and old visible financial results remain active. Failed saves retain the old adopted mode and visible results, with an explicit status error; indeterminate/mismatched writes retain Recovery Mode safeguards. No-op submissions say Configuration unchanged and do not write.

After verified adoption, the current route is rebuilt once with scroll preservation. This refreshes Jobs/Costs/Projects immediately and rebuilds any report/chart model for that page. Other pages calculate from current config on navigation. A mode-only change does not call unrelated utilization/opportunity recomputation. Its routing option skips Jobs' ordinary attachment-preview hydration, which could otherwise mutate file metadata and queue an unrelated job save. The implementation does not render all other pages as a side effect of saving.

## Toggle locations and messaging

- Cutting Jobs: visible Material Cost Treatment panel directly below the average-hours banner, above the job lists and financial summaries. Button: **Change material treatment** (`jobsMaterialCostTreatmentLaunch`).
- Cost Analysis: same compact panel in **Cost Overview**, above the financial period/cards. Button: **Change material treatment** (`costsMaterialCostTreatmentLaunch`).
- Existing header settings → **Configuration** remains available on every page.
- Both new buttons open the same `configModal` and focus the same `configMaterialCostTreatment` select. There is no second setting or alternate persistence path.
- Each panel shows the currently adopted global mode and the requested explanation: “Applies to all Cutting Jobs, including existing and completed jobs. Changing this setting recalculates displayed financial results across the website without modifying saved job records.”
- Before Save, the configuration form explicitly warns that existing displayed financial results and projections will change, while invoices, transactions and saved snapshots remain unchanged. Responsive wrapping and a viewport-bounded, scrollable modal support narrow screens.

## Exact files changed in 01B

| File | Reason |
| --- | --- |
| `js/computations.js` | Resolve treatment exclusively from the global authoritative config. |
| `js/core.js` | Remove mode stamping at job creation; preserve caller/source records. |
| `js/renderers.js` | Submit changed configuration fields only, refresh the current route after verification, bind shared launchers, remove per-row mode adapters, and correct failure/what-if explanations. |
| `js/router.js` | Carry the mode-only financial refresh option to Jobs so attachment hydration cannot mutate/save job data as a side effect. |
| `js/views.js` | Add shared visible launcher markup and current-mode labels; replace prospective/per-job messaging and update fallback formula descriptions. |
| `js/projects.js` | Correct global treatment and dynamic-result explanations; calculation/eligibility rules unchanged. |
| `js/financialReconciliation.js` | Explain that a stored snapshot may differ from the current global model while remaining preserved. |
| `index.html` | Global scope and pre-save impact explanation in the existing configuration form. |
| `style.css` | Compact responsive launcher and bounded configuration modal/title readability. Only this isolated worktree's stylesheet was edited. |
| `tests/mcalc-material-treatment.test.js` | Replace prospective tests with global authority, overrides, record preservation, cross-consumer, writer/error and refresh tests. |
| `tests/mcalc-material-treatment.browser.cjs` | Exercise visible launchers, delayed verification, global history recalculation, newly created jobs, completion, graphs, Cost Data Center/what-if, Projects, failed saves and mobile layout on disposable data. |
| `docs/mcalc-01a-material-treatment.md` | Clearly mark the original per-job policy as superseded. |
| `docs/mcalc-01b-global-material-treatment.md` | Current delivery/audit/testing and safe Firebase verification instructions. |

## Data protection and validation

No production configuration was toggled and no production jobs were created. All write tests used in-memory Firestore-shaped fixtures or localhost `?devsafe=1`. The browser test asserts `firebase` is absent and blocks every request outside its temporary localhost origin. Normal Vercel PR previews were not used for writes.

The browser test compares the entire backend document before and after every successful mode-only toggle, permitting only `appConfig.materialCostTreatment` and `syncMeta` to differ. It also compares the local job arrays against the verified backend, includes a supported attachment reference, and asserts that a financial refresh never invokes attachment hydration. It checks exact unchanged records after failed saves and preserves the imported job's metadata/cached financial snapshot across toggles. Unit fixtures compare protected job/inventory/purchase data, unrelated configuration, recovery and historical evidence. Existing CAS, revision, pending-edit, permission, readback and indeterminate-save safeguards remain enforced; test fixture setup/adoption uses the existing save/load paths.

Checks (no package.json; no npm/build commands):

- 14 MCALC unit/atomic-fixture tests pass, including global default, contradictory legacy metadata, existing/completed/imported/new jobs, mode roundtrip, zero material, single quantity multiplication, failure cases, duration/rate fallbacks, calendar/data center/what-if/Projects, backend reload, protected data, and verified-only refresh.
- Full `tests/*.test.js`: 1,913 pass / 10 fail (1,923 total). The same ten unrelated failures were present in the 01A full run and the untouched original main baseline: three `cjo02b-safety`, six `cjpc01-manual-paths`, one `projects-accuracy`. No new failures; those unrelated fixtures/expectations remain unchanged.
- MCALC localhost browser regression passes, including graph data/visible totals, Projects displayed summaries and aggregates, backend verification waiting, failed-save UI, exact full-document preservation, reload and responsive modal geometry.
- Existing financial reconciliation browser regressions pass for America/Chicago and Pacific/Kiritimati.
- Syntax checks on modified JavaScript/test files, `git diff --check`, and `scripts/check_binaries.py`: pass.

The browser test creates/finishes synthetic jobs only in the disposable local backend. Screenshots and full test logs are local review artifacts outside the tracked repository. Live Firebase permissions, real authentication/logout/login, multi-device propagation and actual network-outage behavior were not exercised; local fixtures do not prove deployed service behavior.

## Safe manual Firebase verification

1. Use a **different Firebase project or Firebase Emulator Suite**, with disposable test users/data. Do not use the normal Vercel PR preview: it references the production `github-prod` workspace. Read-only preview flags are not isolation for write testing.
2. In a dedicated staging checkout/deployment, point Firebase initialization to that isolated project/emulator. Before enabling writes, inspect `FB.app.options.projectId`, the document reference's backing project/host and `FB.docRef.path`. The application may still use the workspace name `github-prod`; the backing Firebase project/host must be separate from production. Do not override or bypass `canWriteCloud`, revision/CAS, Recovery Mode, identity or data-integrity guards.
3. Populate only synthetic fixtures in the isolated project, including active, completed, imported and contradictory-tagged jobs plus preserved snapshots. Capture a backend export/baseline, then change modes exclusively through the UI and wait for server-verified success.
4. Compare the full backend document against the baseline: only `appConfig.materialCostTreatment` and required sync metadata may differ. Check Jobs, calendar, Cost Analysis graphs/cards/reports/calculators and Projects; switch back and confirm original results return. Confirm rates/full expenses and protected records/snapshots are identical.
5. Reload, log out/in using the staging account, then open a separate profile/device and verify the same backend setting and results. Test a read-only staging user and staging network loss; the UI must not adopt an unverified new mode, and unknown outcomes must preserve Recovery Mode restrictions until authoritative reload/review.

Separate mode continues to model full at-cost material recovery even when cutting fails. Tax, markup, shipping, collected payment and contractual invoicing policy are not inferred. Historical displayed profitability is intentionally dynamic; stored invoices/accounting transactions are not retroactively rewritten.
