# MTS-01 — Reviewed Maintenance Recovery Task Setup

Added to open PR #487 on `recovery-import-staging-fix`, starting from its fetched head `d5e75227944c5889e01769e9917fff6c1f02991c`. This retains REC-02 staging/restoration safety. The initial `purchase-history-clarity` working tree and the recovery branch were both clean. No reset, force operation, history rewrite or production Firebase access was used.

## Native schema and definitions

Both Maintenance Settings as-required form handlers used `Object.assign(base, {mode:"asreq", condition, variant:"template", templateId:id})`. That unchanged constructor is now the shared `buildAsRequiredTask()` in `js/maintenanceRecoveryTaskSetup.js`; both normal form handlers and reviewed setup use it. Setup uses native `genId(name)`, empty manual/store links and notes, the native root category, `parentTask:null`, and orders after existing tasks/folders. The transient order counter is advanced by local apply to preserve subsequent native manual ordering. It is not a persisted task collection or a calendar/history record.

Saved tasks support part number directly as `pn`. No new schema or parallel task model was introduced. All six definitions are reusable `mode:"asreq"`, `variant:"template"`, self-referencing `templateId`, and condition “As required”:

| Exact name | pn | price | Labor minutes | downtimeHours |
| --- | --- | ---: | ---: | ---: |
| Refill Salt | empty | 10 | 15 | 0.25 |
| Nozzle Collet | 308641 | 33.50 | 10 | 10/60 |
| Nozzle Nut | 303453 | 57.50 | 10 | 10/60 |
| Main Pump 0.2 Micron | 204000 | 144 | 30 | 0.5 |
| Main Pump Filter 1.0 Micron | 202533 | 33.50 | 30 | 0.5 |
| Pump Garnet | empty | 0 | 60 | 1 |

The two unresolved definitions are immutable blocked entries: Transfer Tank Water Pump has unresolved part number, parts cost and labor; Empty Scrap Bin has price 0 but unresolved labor. They cannot be promoted to eligible by editing a preview or supplying caller definitions. The module rebuilds eligibility from its fixed definitions and authoritative tasks before staging.

## Explicit operator workflow

Maintenance Settings shows the tool next to Reviewed recovery workbook import. Rendering performs no setup preview, task creation or save. The operator clicks Preview task setup for a fresh read-only authoritative read. Eight rows show exact name, expected type, pn, price, labor, reusable exact-name match count, status and review notes. Native instances are excluded, following the existing maintenance import preflight; names are case-sensitive exact matches.

An existing exact reusable task is kept unchanged, even if its current defaults differ. Duplicate names or ambiguous saved identities block that definition. The checkbox and Download backup and create reviewed missing tasks button are enabled only after a preview containing eligible missing definitions. A further explicit confirmation starts the guarded submission. The shared API busy guard and UI controls prevent overlapping submissions.

After a verified write, the tool displays Created / Already Present / Blocked for Review / Duplicates and the server-backed exact-name preflight. Confirmation is cleared and requires a fresh preview for another attempt. A rerun shows the new tasks Already Exists and performs zero additional backups or saves. It does not automatically import maintenance history. The normal workbook preflight still requires all unresolved checklist entries to be separately reviewed and verified.

## Safety architecture

Setup is a separate `task_setup` operation in the existing recovery executor, using only the `tasksAsReq` destination. Historical maintenance import still supports only `existing_task` and `calendar_only`; it does not create reusable tasks.

Submission requires explicit confirmation, writable authoritative baseline, fresh server read, pinned loaded revision, exact cloud/local business agreement, exact reviewed preview, full-state content firewall, downloadable exact pre-change backup, unchanged local state/write gate/revision after backup, exact native staged plan and unchanged unrelated protected state. Native factory results are checked for exact reviewed schema and noncolliding identities. The existing awaited atomic `saveCloudNow({expectedRevision})` retains protected-state transaction guards and CAS.

After save, the executor re-reads authoritative server state and verifies exact destination equality, counts and each new task ID exactly once. Exact equality includes pre-existing tasks, name, pn, price and downtimeHours. Unrelated state must remain exact, covering inventory/transactions, interval tasks, maintenance descriptors/history/occurrences, repeats, purchases and pump data. The exact-name preflight must show each newly created name exactly once.

Before save, exact affected-destination restoration follows REC-02 and suspends only when restoration cannot be proven or unrelated protected state changed. A definite rejected save selectively removes unchanged setup-created tasks while preserving concurrent current state; edited/ambiguous tasks or concurrent references prevent removal and suspend. Ambiguous/thrown saves and failed committed read-back suspend without rollback or retry. Existing recovery guards were not weakened.

No default-task initialization was changed. No existing task names, recurrence or intervals were altered. No setup action was executed against real Firebase, no recovery history was imported, and no Firebase/Storage rules were edited or deployed.

## Files and validation

MTS-01 files: `index.html`, `js/core.js`, `js/historicalImport.js`, `js/historicalImportUi.js`, `js/renderers.js`, new `js/maintenanceRecoveryTaskSetup.js`, new `tests/maintenance-task-setup.test.js`, and this report. Existing REC-02 files remain in PR #487.

23 new tests cover six/five-task creation, zero-write rerun, exact existing-task preservation, duplicates/identities, unforgeable blocked definitions, exact prices/durations, no history/calendar/repeat/inventory effects, non-mutating authoritative preview, backup/revision/local drift, native-schema/ID checks, confirmation/preview equality, verified pre-save restoration, selective rejected-write rollback/concurrent references, ambiguity and committed verification failure. VM tests use actual core `genId`, environment registration, refresh, snapshot and compaction; an operator-UI harness exercises preview/confirmation and final server preflight. These are Node/VM tests, not a real browser, workbook or Firebase run.

Exact commands and results:

```powershell
git branch --show-current; git status; git log -5 --oneline; Test-Path package.json; rg --files -g AGENTS.md
```

Initial branch clean; package.json False; no AGENTS.md found (final `rg` exit 1 for no match). No npm commands were invented.

```text
git fetch origin
```

Passed through existing Git transport. GitHub metadata confirmed PR #487 open/unmerged and head `d5e7522...`.

```powershell
if (git status --porcelain=v1) { throw 'Working tree is not clean' }; git switch recovery-import-staging-fix; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; git merge --ff-only origin/recovery-import-staging-fix; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; git branch --show-current; git rev-parse HEAD origin/recovery-import-staging-fix; git status --short
```

Passed; HEAD equals origin/recovery-import-staging-fix and was clean before edits.

```powershell
node --check js/maintenanceRecoveryTaskSetup.js; node --check js/historicalImport.js; node --check js/historicalImportUi.js; git diff --check; git status --short
```

Passed. An initial multi-file patch had a context mismatch; verification confirmed it made no partial edits. The corrected patch applied successfully.

```text
node --test tests/maintenance-task-setup.test.js tests/historical-import-staging.test.js
node --test tests/maintenance-task-setup.test.js
```

First run passed 34/34 (21 initial MTS-01 plus 13 REC-02 regressions). Expanded MTS-01 suite passed 23/23 after adding real-core and UI coverage.

```powershell
$mtsCheckFiles = @('js/maintenanceRecoveryTaskSetup.js','js/historicalImport.js','js/historicalImportUi.js','js/core.js','js/renderers.js','js/maintenanceRecoveryImport.js','tests/maintenance-task-setup.test.js'); foreach ($mtsCheckFile in $mtsCheckFiles) { node --check $mtsCheckFile; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; Write-Output "PASS node --check $mtsCheckFile" }
```

All seven syntax checks passed.

```text
node --test tests/maintenance-task-setup.test.js tests/historical-import-staging.test.js tests/recovery-import.test.js tests/historical-import-readiness.test.js tests/import-selective-rollback.test.js tests/maintenance-history-import.test.js tests/atomic-persistence.test.js tests/pump-rebuild-duplication.test.js
node --test tests/*.test.js
git diff --check
```

103 focused and 216 full-suite tests passed; 0 failures/skips/cancellations. Diff check passed with no output. After simplifying the labor display to exact minutes, this final batch passed (23 tests, syntax/diff checks and scoped Git inspection):

```powershell
node --check js/historicalImportUi.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node --test tests/maintenance-task-setup.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; git diff --check; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; git status --short; git diff --stat; git diff --name-only
```

No production cloud audit was run by Codex. The user's supplied 7-present/8-missing audit informed these fixed reviewed definitions; the operator's authoritative preview determines current eligibility when used.
