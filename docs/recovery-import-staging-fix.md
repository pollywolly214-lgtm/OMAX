# REC-02 — recovery import pre-save staging fix

Branch: `recovery-import-staging-fix`, created from current `origin/main` at `7fb1109a397acffb7a6ee2e3aad3c615bbf55125` (REC-01R merge). The working tree was clean before switching and creating the branch. `git fetch origin` succeeded through the existing Git transport; no reset, rebase, force push or history rewrite was used.

## Proven cause

Workbook parsing supplies `__sourceRowNumber` and `__recoveryProblems`. The reconciliation append plan stores the complete reviewed row, including those fields, under `importProvenance.sourceRecord`. The real browser environment applies the destination to `window`, calls `refreshGlobalCollections()`, and reads `compactStateForStorage(snapshotState({skipLocalFileCacheSync:true}))`. The storage sanitizer recursively removed every key beginning with `__`, so its state no longer equaled the approved plan.

The purchase fields and identity were unchanged; the provenance object differed. Receipt display normalization retains row metadata through object spreading and is not invoked by this apply path. The receipt snapshot reads `window.receiptTrackerWeeks`, so its separate legacy binding was not the cause. The existing selective rollback compared the transformed local row to the original staged row, refused deletion, and suspended writes even though save had not been called.

A regression using a generated XLSX and the actual core environment registration, refresh, snapshot, folder snapshot, storage compaction and sanitizer functions reproduced this mismatch before source changes. Its failed canonical comparison showed only the two missing parser markers. These are Node VM lifecycle tests, not a real browser or Firebase run.

## Fix and safety

- `js/core.js`: preserve only validated workbook parser markers directly under `importProvenance.sourceRecord`: a null or integer row number from 1 through Excel's 1,048,576-row limit, and an empty recovery-problems array. Other runtime/cache/debug fields remain stripped. Existing content filtering and the import/persistence firewalls are unchanged.
- `js/historicalImport.js`: track whether save has actually been called. Before that call, restore only affected destinations to exact before snapshots, verify their equality, and verify that unrelated protected state neither changed during staging nor during restoration. Preserve unrelated current state and suspend if either proof fails. A proven pre-save restoration permits a later fresh explicitly confirmed submission; there is no automatic retry.
- Once save has been called, the existing selective rollback, permanent-identity guards, concurrent-edit preservation, indeterminate-write suspension and server read-back verification remain in place. A thrown save still suspends without rollback because its outcome can be ambiguous.
- Staged destination equality remains mandatory. Mismatches now return `stagingMismatch` with destination, first differing path, expected value and actual value. Paths are capped at 320 characters; scalar representations are capped at 180 characters. Objects/arrays use bounded summaries; embedded content and sensitive/source-text values are redacted.
- Fresh server baseline, exact local/cloud business equality, exact reviewed preview, required backup, content firewall, pinned revision/CAS, protected-state isolation, awaited atomic save, exact destination/ID/count verification and unchanged unrelated server state remain mandatory. Recovery Mode is not globally disabled or bypassed.

Files changed: `js/core.js`, `js/historicalImport.js`, new `tests/historical-import-staging.test.js`, `docs/recovery-import-contracts.md`, and this document.

## Regression coverage

The new lifecycle tests cover XLSX purchase preview/append/apply/refresh/snapshot/compact equality; exact identity, source provenance and all purchase fields; proven pre-save restoration with zero save calls; failed restoration suspension; unrelated protected drift suspension/preservation; throwing apply; partial multi-destination maintenance restoration; pump/RPM, pump-hours and maintenance source-metadata round trips; narrowly scoped bounded marker preservation; and safe bounded diagnostic values. Existing selective rollback, post-save verification, CAS and indeterminate-write tests continue to run.

## Executed checks

`Test-Path package.json` returned False. No npm/build/lint/type-check commands were invented.

Initial `node --test tests/historical-import-staging.test.js` failed because the new VM harness lacked `cloneFolders`; the harness was corrected to load that actual function. Then:

```text
node --test --test-name-pattern="actual browser purchase workbook" tests/historical-import-staging.test.js
```

Before the fix: failed as expected, proving the missing provenance markers in the real lifecycle. After the fix, the first full new-test run passed 9/10; its remaining assertion expected dot-style diagnostic paths while implementation emitted bracket notation. Path rendering was made readable without changing equality checks. The expanded initial focused/full runs passed 66/192 tests, respectively. Final checks are recorded below.

Final commands and results (all exit 0):

```powershell
$rec02CheckFiles = @('js/core.js','js/historicalImport.js','js/recoveryWorkbook.js','js/maintenanceRecoveryImport.js','tests/historical-import-staging.test.js'); foreach ($rec02CheckFile in $rec02CheckFiles) { node --check $rec02CheckFile; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; Write-Output "PASS node --check $rec02CheckFile" }
```

All five syntax checks passed.

```text
node --test tests/historical-import-staging.test.js tests/recovery-import.test.js tests/historical-import-readiness.test.js tests/import-selective-rollback.test.js tests/maintenance-history-import.test.js tests/cutting-job-import.test.js
```

67 passed; 0 failed; 0 skipped.

```text
node --test tests/*.test.js
```

193 passed; 0 failed; 0 skipped.

```text
git diff --check
```

Passed with no output.

No production Firebase was accessed or changed, no real recovery import was run, and no Firebase/Storage rules were edited or deployed. Actual workbook and real browser/Firebase verification are reserved for the operator's Vercel preview test.
