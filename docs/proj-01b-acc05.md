# PROJ-01B-ACC05 — Zero-failure persistence and project reporting populations

Updates existing open PR #517 from `41a861d62558855e8295e296af00d55d28d3ba80`. Latest fetched main remains `d1489aa3ebc4299e53687b2e11d859298269382b`, already incorporated. No production records were read or modified; all save tests used disposable records. Do not merge automatically.

## Explicit zero persistence

The failure mutation's `target.failurePercent ?? 0` erased the distinction between an absent/null field and recorded numeric zero before checking for a no-op. It now compares the original stored value directly against the requested numeric percentage. Missing/null → 0 produces a normal audited mutation through the unchanged revision/CAS/readback coordinator. Numeric 0 → 0 remains a genuine no-op. Positive edits and positive → 0 resets use the same existing path.

New audit entries preserve the prior state: an absent field is represented by an empty `before` object; an explicit null remains `{failurePercent:null}`; existing numeric values retain their exact value. `after.failurePercent` records the explicitly requested number. Prior audit entries are preserved. There is no backfill, change of historical outcome, revision bypass or other source edit.

## Reporting populations and basis

- Cut Success Rate now uses distinct **completed** jobs only, based on lifecycle membership. Active jobs do not enter its documented, failed, successful or missing-outcome counts. Wording is **X of Y completed jobs with recorded outcomes**. Explicit zero means a recorded no-failure outcome; positive means failure-affected; absent means unknown. Partial completed coverage remains Limited data; active-only projects have no completed success percentage or missing-completed-outcome warning.
- The all-job unadjusted/provisional financial totals are preserved and explicitly labeled modeled/projected, including active plans. A compact breakdown shows completed-only unadjusted modeled net and the active projected contribution, each with its eligible population. They use the same resolved duration, financial helper and eligibility as the combined figure, not another formula. The fully eligible mixed fixture reconciles **$1,695 completed + $70 active = $1,765 combined**.
- The ACC02 resolver is unchanged. Hours/cost descriptions distinguish reported/planned all-job totals, documented recorded duration, stored Hours Taken, historical estimates and active plans. Stored/planned duration is not described as independently verified machine runtime. Charges remain modeled rather than necessarily realized revenue.
- Provisional net remains unadjusted net minus known deductions from the same financially eligible population. Deductions display negatively; recorded zero supports exactly $0 deduction; missing data remains undocumented. The adjusted subset is qualified as an all-job subset that may include active projections, not completed production performance.
- Project table dates render the stored business-date prefix as YYYY-MM-DD, without changing original timestamps or shifting them through another timezone. Missing/invalid dates remain a dash.

No other arithmetic discrepancy was demonstrated. The supplied Mesquite amounts are not independently reproduced production totals. Its confirmed zero-save bug and completed/active scope ambiguity are addressed without changing rates, shared financial formulas, imported durations, categories, inventory, Purchase History, maintenance, RPM/hour history or layouts. Different-ID 616/CUTPDF records and legitimate identical cuts remain included; same-ID lifecycle handling is unchanged.

## Disposable browser evidence

The real failure dialog/coordinator was exercised on six completed jobs plus one active job:

1. Missing → save 0 → verified persisted numeric 0, audit before `{}` / after `{failurePercent:0}`, retained through reload.
2. Save numeric 0 again → identical cloud state, revision and audit history (a genuine no-op).
3. Save 10% on a $1,680 modeled charge → $168 deduction, displayed as −$168; unadjusted $1,765 unchanged; provisional $1,597 after reload.
4. Reset 10% → 0 → third audited mutation, prior audit entries preserved; deduction returns to $0 and provisional net to $1,765 after reload.

Coverage after recording the target is **2 of 6 completed jobs**, not 2/7. Success remains Limited data. Completed/active subtotals remain separate and reconcile. A timestamp displays its date only while the full stored timestamp remains intact. Whole-state comparisons permit only the deliberately edited job field, its appended audits and normal sync metadata; other records, imported historical fixtures and protected state are preserved. Unit CAS fixtures additionally verify null → 0 with an existing audit chain.

## Exact verification commands and results

No `package.json` exists; no npm commands ran. All tests below passed with no unresolved failures.

PASS — focused group, **62/62**:

```powershell
node --test tests/cjprofit02-failed-cut.test.js tests/projects.test.js tests/projects-accuracy.test.js tests/projects-financial-basis.test.js
```

PASS — final targeted regression group, **169/169**:

```powershell
node --test tests/projects.test.js tests/projects-accuracy.test.js tests/projects-financial-basis.test.js tests/cutting-job-import.test.js tests/cjprofit01b-downstream.test.js tests/cjprofit02-failed-cut.test.js tests/cjprofit03-ui.test.js tests/cjpc01-project-category.test.js tests/cjcat01-category-edit.test.js tests/atomic-persistence.test.js tests/cjo04c-readback.test.js tests/cjo04a-dates.test.js
```

PASS — **1/1** headless Edge integration test, disposable backend only, all non-local requests blocked. Includes the save/reset sequence above, reload, exact navigation, preserved historical calculations, responsive layout and CSS zoom checks. Desktop screenshot inspected.

```powershell
$env:OMAX_PLAYWRIGHT_PATH='C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:OMAX_SCREENSHOT_DIR='C:/CodexProjects/OMAX/artifacts/proj-01b-acc05'
node --test tests/projects.browser.cjs
```

PASS — syntax, whitespace and text-only checks:

```powershell
node --check js/projects.js
node --check js/cuttingJobDateEditing.js
node --check tests/projects-financial-basis.test.js
node --check tests/projects.browser.cjs
node --check tests/projects.test.js
node --check tests/cjprofit02-failed-cut.test.js
git diff --check
& 'C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' scripts/check_binaries.py
```

Not verified: production Firebase/network behavior, production Mesquite totals/outcomes, physical devices, Safari/Firefox and native browser zoom. The existing distinction between recorded historical duration and stored/planned Hours Taken remains a disclosed source limitation, not a reason to rewrite source records.
