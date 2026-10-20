# PROJ-01B-ACC02 — Projects financial accuracy correction

This supersedes the stopped ACC01 specification. PR #517 was open, so this correction updates its existing branch. Current main (`d1489aa3ebc4299e53687b2e11d859298269382b`, including CCR #514) was merged into that branch before implementation. No production data was read or written by this correction.

## Root cause

The original Projects aggregator used only `estimateHours` for duration and expenses. The reviewed Cutting Job importer keeps `estimate_hours + add_minutes / 60` separately from recorded `actual_cut_minutes / 60`: completed imports put the latter into `actualHours` and a `manualLogs[].completedHours` entry. Blank source minutes also generate an `actualHours: 0` placeholder. Therefore a zero historical estimate can suppress documented runtime and machine costs.

The supplied ATM diagnostics (66 distinct IDs, 65 zero estimates, 81.0617 raw actual hours, 28 log-bearing records and no recorded failure percentages) demonstrate the problem. Their figures are user-supplied production evidence, not totals reproduced from a production fetch. No expected production total was hardcoded.

## Reporting-only duration policy

`ProjectDashboard.duration(job, completed)` returns duration, field/basis and a limitation reason. Completion comes from lifecycle membership, not just the presence of a date.

1. Active records retain valid nonnegative `estimateHours` (current Hours Taken); progress is not substituted. Non-imported completed records with positive stored Hours Taken also retain that contract even if legacy progress differs.
2. For completed imports (identified by import event/provenance), prefer finite positive `actualHours`, including when the estimate is positive. A completed legacy record with zero/absent estimate can also use positive actual hours. Never add logs to actual hours.
3. A zero actual duration is supported only when provenance explicitly records `actual_cut_minutes = 0`; an importer-generated zero from blank source minutes is not reliable runtime.
4. Without a usable actual duration, the fallback is the latest valid cumulative `manualLogs[].completedHours` snapshot. Existing manual entry/edit code stores cumulative progress; values are never summed. Conflicting latest-date values, malformed/negative data, dates after completion and unrelated event references make this fallback unavailable. Identical copies of the same latest snapshot do not multiply hours. An explicit latest zero log is valid.
5. If no recorded duration is usable, a positive historical estimate may be used and is explicitly labeled **historical estimate**. Unknown/placeholder-zero completed duration remains unavailable. Active explicit zero Hours Taken retains existing behavior.

Rows expose the chosen field/basis and explanation; the hours card reports recorded/stored/estimated counts. Supported duration fields are alternative representations, never additive. No duration fields, source logs, or shared Cutting Jobs calculations are modified.

## Financial behavior

Projects passes the resolved duration into `computeCuttingJobProfit` on a new calculation-only object. The shared formula and stored rates remain unchanged. Corrected hours affect processing, modeled charge, failure reduction and net consistently. Material expense remains the helper's material cost × quantity; no purchases or additional maintenance expense are added.

Each aggregate retains its own coverage. Net/job uses only net-eligible jobs; net/hour uses the total net and total hours from that exact population. Missing failure percentage makes success, failure-adjusted net and failure reduction unavailable for that record. Hours, processing and material estimates remain visible where supported. All-unknown historical failure data never becomes a 100% success rate or zero failure reduction.

## 616 / CUTPDF evidence and non-exclusion

The importer builds stable job IDs from a permanent `import_event_id` and preserves submitted fields, source file/text and worksheet `sourceRowNumber` in `importProvenance`. It creates no attachments (`files: []`). Thus `CUTPDF` identifiers do not prove individual cutting PDFs were uploaded to OMAX. CJI chronology code interprets `CUTPDF-YYYYMMDD-NNN` ordinals, while synthetic recovery fixtures demonstrate `616-CUT-Pxx-Lxxx` page/line identities. Their independent order/row schemes provide no crosswalk establishing that a 616 operation and a CUTPDF operation are the same physical cut. Neither family is given authority over the other.

The small selected-project notice mirrors the supplied diagnostic's candidate criteria: consistent canonical 616/CUTPDF import-event groups, same valid completion date, same positive recorded duration and same available material expense. A repeated canonical event across different job IDs is also a review signal. ID prefix alone, same-family repeated cuts, historical estimates and names alone do not trigger this notice. This is a concern indicator, not proof or a comprehensive duplicate audit; legitimate separate operations across groups can match too. The notice expressly says all distinct records remain included and matching details do not prove one cut.

**There is no cross-ID suppression, even when event IDs match.** Every distinct eligible Cutting Job ID keeps its hours, expenses and navigation. Legitimate identical cuts remain separate. Existing same-ID lifecycle handling remains: exact copies count once; conflicting copies count once with unavailable metrics and no ambiguous navigation. Source association validation is unchanged.

The reported 15 production candidate pairs were not reproduced here, and no pair was confirmed as a duplicate. Cross-ID reconciliation requires a later human-approved process. Historical completeness outside available source records remains unknown; these totals do not establish complete project expenditure or unique physical-operation totals.

## Scope and verification

Correction files: `js/projects.js`, `tests/projects-accuracy.test.js`, `tests/projects.browser.cjs`, this document, and the updated original Projects documentation. No CSS, shared financial helper, importer, Firebase, CAS, recovery or source-state mutation code was changed by ACC02. The existing selector, six cards, financial section, collapsed table, responsive styling and stable-ID navigation are preserved. Notices apply only to the selected project's records.

No `package.json` exists, so no npm commands were run.

PASS — **118 tests, 118 passed, 0 failed**:

```powershell
node --test tests/projects.test.js tests/projects-accuracy.test.js tests/cutting-job-import.test.js tests/cjprofit01b-downstream.test.js tests/cjprofit02-failed-cut.test.js tests/cjprofit03-ui.test.js tests/cjpc01-project-category.test.js tests/cjcat01-category-edit.test.js tests/atomic-persistence.test.js tests/cjo04c-readback.test.js
```

PASS — **1 browser test, 1 passed, 0 failed**, headless Microsoft Edge, all non-local requests blocked, disposable backend only:

```powershell
$env:OMAX_PLAYWRIGHT_PATH='C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:OMAX_SCREENSHOT_DIR='C:/CodexProjects/OMAX/artifacts/proj-01b-acc02'
node --test tests/projects.browser.cjs
```

The browser fixture verifies historical zero estimates with actual hours/logs, corrected costs, unknown failures, both suspicious different-ID records retained and separately navigable, project-scoped warnings, refresh, original navigation/live updates, exact state preservation except the fixture's intentional source update, 1440/768/375px layouts and 150% CSS zoom. Mobile screenshot review was performed. Frozen unit fixtures preserve categories, jobs/logs, receipts, maintenance, inventory, RPM/hour history and layout state. Unit cases include the three supplied legitimate-repeat patterns as synthetic records, not a claim of production access.

PASS — syntax, whitespace and repository-required text-only scan:

```powershell
node --check js/projects.js
node --check tests/projects-accuracy.test.js
node --check tests/projects.browser.cjs
git diff --check
& 'C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' scripts/check_binaries.py
```

No unresolved test failures. Production Firebase was not exercised. After deployment, verify ATM's 66 distinct IDs remain, inspect selected duration bases/coverage and raw subtotals, verify missing failures keep adjusted metrics unavailable, and review candidate source rows without excluding them. The raw 81.0617-hour sum remains diagnostic evidence, not a verified unique-operation total. Physical-device, Safari/Firefox and native browser zoom testing also remain outstanding.
