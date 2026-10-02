# CJI-02: project/category binding in reviewed Cutting Jobs imports

## Baseline and scope

Started from `main` / `origin/main` at `7fb1109a397acffb7a6ee2e3aad3c615bbf55125` on the new `cutting-import-project-categories` branch in an isolated checkout. The existing maintenance checkout and its uncommitted work were left untouched. No production Firebase import was run.

The root cause was a project-only resolver using a closed category registry, ignoring the reviewed workbook category cell. The registry also mislabeled `0000`, assigned Company Improvements to `1111`, and omitted `1242`.

## One project identity

`project_number` is the canonical project key, kept as a string. `category` is its human-readable name; `job.projectNumber` and the folder referenced by `job.cat` must agree. Trimmed, case-insensitive names with collapsed whitespace are compared without fuzzy matching. Original project/category cells, including their original whitespace and any Excel zero, are retained in `importProvenance`.

| Project key | Confirmed name |
| --- | --- |
| 0000 | Company Improvements |
| XXXX | Undisclosed Project |
| 1178 | Comal |
| 1208 | Collin |
| 1237 | Kicaster |
| 1241 | Lady Bird |
| 1242 | Mesquite |
| 1247 | Brazos |
| 1248 | Kaufman |
| 1249 | AT&T |
| 1251 | ATM |
| 1254 | Blanco |
| 1261 | Fredericksburg Barricades |

ALAMO remains supported as `ALAMO`, without a numeric substitute. `1111` has no confirmed mapping. It may use a consistent independent legacy name, but cannot claim Company Improvements. Historical 1111 jobs and folders appear in read-only audit diagnostics for review and are never silently converted to XXXX. Reviewed imports can now rename uniquely owned obsolete folder names, preserving existing jobs' project/category fields. Existing chronological resequencing behavior is preserved.

`0000` stays exactly `"0000"`. Only `"0"` with unambiguous Company Improvements source evidence (plain name, `0000 Company Improvements`, or `Company Improvements 0000`) becomes `"0000"`, with a visible preview warning. Other numbers are never padded.

## Resolution and conflicts

The focused resolver validates the source pair and inspects existing folder evidence: optional `projectNumber`, a leading project key, confirmed canonical/legacy names, supported reversed names such as `ATM 1251`, and existing jobs referencing that folder. A unique compatible name is reusable. A uniquely owned obsolete name is a reviewed name-only rename candidate. Native normalization retains arbitrary folder metadata, including null projectNumber; non-null projectNumber remains a string. Metadata is not added to every old folder or required on every folder.

Conflicting metadata, prefix, known name, or existing job ownership blocks the row. Multiple candidate folders or duplicate folder IDs block rather than picking one. For example, `1254 / ATM` and `1242 / Blanco` block. A legacy folder already used by another project cannot be silently reused.

All workbook rows participate in source conflict detection, including blocked, duplicate, and excluded rows. Different names for one project block all affected rows; one name claimed by different project keys also blocks all affected rows. Final revalidation compares the entire reviewed preview, preserving this evidence rather than reclassifying only the ready subset.

Known keys can infer their confirmed name when the category is blank. Unknown keys require a nonblank name. Future projects such as `1305 / Smith County` are accepted when consistent and free of conflicts.

## Creation, preview, and idempotency

Preview shows Project, Category, and Existing / Will create / Rename existing / Conflict or Review status. Preview never creates a folder. Only ready rows contribute to the creation plan; a project mentioned solely by rows with `needs_review`, RC50, thickness, dimensions, or other blockers creates nothing.

After the existing reviewed final confirmation and successful backup, missing categories use the existing `addJobFolder` adapter: native `genId`, `jobs_root` parent, next native order, and native optional color behavior. New names are `<project_number> <category name>` using confirmed spelling for known keys; an already supplied number is stripped before composing the name. ALAMO stays `ALAMO`. No parallel category model is introduced.

Creation is deduplicated by project key. Thirty or forty ready rows for one missing project create one folder and all jobs reference its ID. Subsequent new rows reuse that folder. Replaying the same source IDs creates no jobs or folders and performs no save.

## Safety and rollback

The authenticated fresh authoritative baseline, full backup, reviewed confirmation, atomic revision/CAS save guard, and protected-state checks remain in place. The complete preview is checked again after authoritative revalidation and after backup. Every ready job's normalized project/category pair is resolved and checked against its assigned folder ID before append/save.

Folders and both job arrays are staged in the same import/save. Immutable copies of the staged folders and jobs are passed to cloud read-back verification; folders are now verified exactly alongside jobs, unique source IDs, and every unrelated cloud field.

On a definite rejection, selective rollback removes owned staged jobs, restores owned sequence changes, restores the original name on an owned renamed folder, and removes unchanged, unreferenced import-created folders. Concurrent folder metadata edits survive the name-only rollback; a changed name or project ownership retains evidence and suspends writes. Without concurrent edits this restores the intended arrays exactly. Concurrent edits/additions are preserved; changed or referenced import evidence suspends writes for review. Indeterminate or thrown saves and failed committed read-back verification retain all evidence, suspend writes, and never retry automatically. Refresh and read verification are required before proceeding.

Material validation/calculation and existing review blockers were not changed. Maintenance, purchases, inventory, receipt history, orders, pump data, machine hours, layouts, cutting-file attachments/cache, Firebase rules, and Storage rules were not changed. No material definitions are created.

## Regression verification

There is no `package.json`; no npm commands are used. Run from the task checkout:

```powershell
node --check js/cuttingJobHistory.js
node --check js/cuttingJobImporter.js
node --check js/core.js
node --check js/cuttingJobRepair.js
node --check tests/cji-02-project-category-import.test.js
node --check tests/cutting-job-import.test.js
node --check tests/cji02-history-repair.test.js
node --check tests/recovery-import.test.js
node tests/cutting-job-import.test.js
node tests/cji02-history-repair.test.js
node --test tests/cji-02-project-category-import.test.js
node --test tests/import-selective-rollback.test.js tests/recovery-import.test.js tests/atomic-persistence.test.js
git diff --check
rg -n --max-columns 180 --max-columns-preview 'projectNumber|project_number|categoryResolution|resolveProjectCategory|jobFolders|createCategory|expectedCategories' js/cuttingJobHistory.js js/cuttingJobImporter.js js/core.js tests/cji-02-project-category-import.test.js
```

The project/category suite covers all confirmed mappings, ALAMO, legacy 1111 preservation, narrow zero recovery, future projects, conflicts, 30-row creation/rerun idempotency, provenance, ready-only planning, material/review blockers, rollback, indeterminate/thrown saves, protected fields, preview drift, native metadata normalization, preview labels, and production cloud folder verification. The actual 129-row reviewed workbook was not supplied in this checkout; acceptance is tested with deterministic source rows and existing XLSX parsing fixtures.

Verified October 2, 2026: all eight syntax commands PASS; cutting importer 24/24 PASS; history compatibility 15/15 PASS; project/category resolver/import 34/34 PASS; selective rollback/recovery/atomic persistence 51/51 PASS. Total: 124 tests, zero failures. `git diff --check` PASS; targeted `rg` inspection PASS. No npm, production import, or PR merge was performed.

## CJI-02A: normal-click backup/import action

Continued on the same branch and PR #490 from the expected `fb70ccb6f6167e78ac071346e28b126d59380364`. The confirmed code defects were: the backup anchor was created/clicked only after two awaited cloud reads; the final UI handler had no catch for unexpected rejections; and it showed one generic status through validation, backup, staging, save, and verification. Those defects can leave the operator with no useful explanation and put the download outside transient user activation. No missing registration, DOM replacement, unawaited submission, or watcher dependency was found in this path.

An actual Edge probe served the original core/importer from that commit, with a 5.5-second delay per cloud read. At the old backup trigger `navigator.userActivation.isActive` was **false**, proving activation was lost. Edge still accepted the download and completed the fixture import without a watcher. Thus activation loss is a confirmed timing defect, but this local test did **not** reproduce or establish the sole cause of the operator's intermittent production failure. Evidence is saved locally in `artifacts/cji-02a/legacy-activation-probe.json`.

Before: trusted Run click → native blocking confirmation → await authoritative validation → await backup cloud read → serialize Blob/create URL/click anchor → stage → save → verify. A long confirmation/read could expire activation; unexpected errors could escape the UI handler.

After: Preview → read/validate authoritative baseline → prepare immutable backup JSON Blob/object URL → enable review/import controls. Run opens a small explicit confirmation dialog showing the reviewed plan. Its **Download backup and import** button supplies a fresh trusted click, even if the operator spent a long time reading the confirmation. That click checks local/preview identity and invokes the already-prepared download **synchronously, before any await**. A single-use receipt is then passed to the guarded async importer. Fresh cloud reads must match both the current authoritative baseline and the exact prepared backup/material settings before any folder/job staging. The prepared revision is also passed explicitly to the existing CAS save guard. A missing/forged/reused receipt or rejected backup stops before mutation/save.

Progress is deterministic: Preparing backup → Downloading backup → Validating current cloud revision → Validating prepared backup → Staging reviewed jobs → Saving → Verifying → Import complete. The current stage and bounded result are kept in the preview element's dataset. Errors show the failing stage and at most 240 characters with URLs redacted. Cloud reads have a 30-second deadline, with timer cleanup. There is no import-progress polling, interval, or MutationObserver in the implementation. The one-shot timers serve read deadlines and safe object-URL disposal only.

The page validates the JSON Blob and object URL, requires a trusted click and available activation, invokes the anchor synchronously, and propagates trigger exceptions. Unused URLs are revoked immediately; triggered URLs remain available for 60 seconds before revocation. It reports **download started**, never claims the file finished downloading. Browser acceptance/completion is not observable by ordinary page code; the confirmation and success text direct the operator to browser Downloads. A trigger exception cannot issue a receipt and cannot save.

The action locks before triggering and prevents concurrent clicks. Definite pre-write failures restore controls for a new preview/review. Indeterminate save/verification outcomes preserve staged evidence, disable import/review actions, and require refresh/read verification; the Close control remains available for diagnostics. All project/category consistency, duplicate identity, material/review blockers, protected-state comparison, exact staged verification, and selective rollback behavior remain intact. Shared export/recovery/repair downloads were not changed.

Node/DOM verification uses the actual installed UI handler and importer in a deterministic DOM fixture, plus the production receipt adapter and download helper. Real-browser verification uses installed Edge through the existing bundled Playwright approach, the full localhost app, real file input/button events, accepted downloads whose JSON contents are inspected, and the disposable `?devsafe=1` backend. Every external request is blocked. The browser matrix checks normal operation with no watcher, an unrelated interval, and a MutationObserver/status reader; slow async reads; trigger/read failures; double click; indeterminate save; and local/server revision drift. In the no-watcher case the test driver awaits the business completion promise and reads status once afterward; it does not poll the status DOM during import. DevTools and console polling are never opened or required. Browser fixture injection and failure simulation do not constitute production Firebase operations.

Run from this checkout (no `package.json`, no npm):

```powershell
node --check js/core.js
node --check js/cuttingJobImporter.js
node --check js/cuttingJobImportDownload.js
node --check tests/cji-02-project-category-import.test.js
node --check tests/cji-02a-backup-action.test.js
node --check scripts/cji-02a-browser.js
node tests/cutting-job-import.test.js
node tests/cji02-history-repair.test.js
node --test tests/cji-02a-backup-action.test.js tests/cji-02-project-category-import.test.js tests/import-selective-rollback.test.js tests/atomic-persistence.test.js
node --test tests/recovery-import.test.js
node scripts/devsafe-server.js
# In a second terminal:
$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node scripts/cji-02a-browser.js
git diff --check
rg -n --max-columns 180 --max-columns-preview 'cuttingJobImportConfirm|prepareCuttingJobImportBackup|readCuttingJobImportCloudState|backupReceipt|onProgress|createObjectURL|trigger\(event\)' index.html js/core.js js/cuttingJobImporter.js js/cuttingJobImportDownload.js tests/cji-02a-backup-action.test.js
```

Operator Vercel verification remains necessary in the shop's actual browser/download-policy environment: preview the workbook, review the plan, make one final confirmation click with DevTools closed, verify the backup appears in Downloads, and inspect the visible completion/error state. Do not bypass a stale baseline or a suspended/indeterminate state. No production Firebase import was performed during this task.

CJI-02A verification on October 2, 2026: six syntax commands PASS; cutting importer 24/24 PASS; history compatibility 15/15 PASS; combined backup/project/category/selective-rollback/atomic suite 79/79 PASS (including 17 backup/action cases); recovery suite 23/23 PASS. Total Node/DOM: 141 tests, zero failures. Actual Edge: 10/10 scenarios PASS, zero failures. Diff checks and targeted handler/download searches PASS. Browser result JSON and downloaded fixture backups are retained under the ignored local `artifacts/cji-02a/` directory.

## CJI-02B: legacy folder adoption and special projects

Continued on the same branch and PR #490. Before editing, verified branch `cutting-import-project-categories`, HEAD `ca8c6bd7a7808b1aabfa339f8934bb8b09abfdb2`, and a clean working tree. No package.json or AGENTS.md exists in this checkout.

The reported blocker came from treating a display-name mismatch as a project-identity conflict. The repair planner also used a separate exact/reversed-name lookup. Both paths now use the shared ownership resolver. `0000` is Company Improvements; `XXXX` is Undisclosed Project; `1111` has no Company Improvements mapping and no automatic conversion. Validation accepts only 1–8 digits, ALAMO, and XXXX. Add/edit inputs, job labels, cost displays and flow-chart project labels preserve explicit special keys rather than stripping them to digits. Default folders contain only the All Jobs root; no obsolete semantic seed remains.

The supplied cloud evidence was not fetched from production: one `job_project_0000` folder named `0000 Undisclosed Project`, null project metadata, and 11 referencing jobs whose projectNumber is `"0000"`. Deterministic fixtures reproduce this shape. The reviewed plan proposes **Rename existing**, from `0000 Undisclosed Project` to `0000 Company Improvements`, reusing `job_project_0000`. Staging changes only the name, preserving parent, order, color, null projectNumber and arbitrary nested metadata. No second 0000 category is created. Existing job IDs, projectNumber and cat fields remain unchanged; existing chronological resequencing behavior is retained.

Rename requires a unique folder with project ownership proven by matching explicit metadata, an embedded project code, or matching referencing jobs. Every linked job must have the matching nonblank project key. Contradicting metadata, crossed known names, conflicting or missing linked project identity, duplicate folder IDs, and multiple project claimants block. The exact obsolete spelling `0000 Undisclosed Project` overrides only weak display-name inference of XXXX; it never overrides explicit or linked ownership. It cannot be adopted as XXXX. An unrelated folder with no evidence of the requested project is not a rename candidate. The audit exposes historical 1111 folder/job IDs and a visible review warning, without changing them.

The category plan deduplicates ready rows into existing, new, and renamed categories. Preview warnings and final confirmation include the old/new name and preserved folder ID. Repair audit proposes the same rename and keeps all 11 assignments on their original folder ID. After success, another preview shows Existing with zero renames and zero new categories.

The prepared backup, synchronous trusted final download, fresh authoritative baseline, full reviewed-preview identity, expected-revision CAS, protected-state comparison, exact cloud folder/job verification, and selective rollback remain enforced. Rename and job append are staged and verified together. Definite rejection restores the original folder name and removes the owned imported jobs; concurrent metadata survives. Indeterminate or thrown saves and committed verification mismatches retain evidence, suspend writes, and never retry automatically.

Exact verification commands (all PASS on October 2, 2026):

```powershell
node --check js/core.js
node --check js/cuttingJobHistory.js
node --check js/cuttingJobImporter.js
node --check js/cuttingJobRepair.js
node --check js/renderers.js
node --check js/views.js
node --check scripts/cji-02a-browser.js
node --check tests/cji-02b-legacy-category-adoption.test.js
node --test tests/cji-02-project-category-import.test.js tests/cji-02a-backup-action.test.js tests/cji-02b-legacy-category-adoption.test.js tests/cutting-job-import.test.js tests/cji02-history-repair.test.js tests/import-selective-rollback.test.js tests/atomic-persistence.test.js tests/recovery-import.test.js
node scripts/devsafe-server.js
# In a second terminal:
$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node scripts/cji-02a-browser.js
git diff --check
rg -n '0000|1111|Undisclosed Project|Company Improvements|PROJECT_CATEGORIES|normalizeProjectPair|resolveProjectCategory|job_project_0000' js tests docs/cji-02-project-category-import.md
```

Node/DOM suites: project/category 34/34, backup/download 17/17, legacy adoption 29/29, cutting importer 24/24, repair/audit 15/15, selective rollback 15/15, atomic persistence 13/13, recovery 23/23: **170 cases, zero failures**. Node's aggregate runner reports 133 entries because two older script suites appear as one entry each; their internal 24 and 15 cases also pass.

Actual Edge: **14/14 scenarios, zero failures**. The original ten CJI-02A scenarios still pass. Four additional scenarios verify successful legacy name-only adoption, definite CAS rejection with exact rollback, indeterminate retention/suspension, and independent XXXX creation while the legacy 0000 folder exists. Real downloads contain the original legacy folder name and 11 original jobs. Accepted downloads start in active trusted user activation; success verifies saved folder metadata and rerun idempotency. Runs use the full localhost app with disposable devsafe state and all external requests blocked, without DevTools. Results and backups remain in ignored `artifacts/cji-02a/`. No production Firebase import, npm command, new branch/PR, or merge was performed. Shop production/browser-policy acceptance remains untested.
