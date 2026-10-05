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

Conflicting metadata or existing job ownership still blocks a related row, as do crossed source pairs and ambiguous names. An explicit project prefix identifies its folder: a disagreeing canonical display name alone cannot make it an unrelated canonical project's claimant (CJI-02F). That folder remains separately diagnosed for review. Multiple actual candidate folders or duplicate folder IDs block rather than picking one. For example, `1254 / ATM` and `1242 / Blanco` source pairs block. A legacy folder already used by another project cannot be silently reused.

All workbook rows participate in source conflict detection, including blocked, duplicate, and excluded rows. Different names for one project block all affected rows; one name claimed by different project keys also blocks all affected rows. Final revalidation compares the entire reviewed preview, preserving this evidence rather than reclassifying only the ready subset.

Known keys can infer their confirmed name when the category is blank. Unknown keys require a nonblank name. Future projects such as `1305 / Smith County` are accepted when consistent and free of conflicts.

## Creation, preview, and idempotency

Preview shows Project, Category, and Existing / Will create / Rename existing / Conflict or Review status. Preview never creates a folder. Only ready rows contribute to the creation plan; a project mentioned solely by rows with `needs_review`, RC50, thickness, dimensions, or other blockers creates nothing.

After the existing reviewed final confirmation and successful backup, missing categories use the existing `addJobFolder` adapter: native `genId`, `jobs_root` parent, next native order, and native optional color behavior. New names are `<project_number> <category name>` using confirmed spelling for known keys; an already supplied number is stripped before composing the name. ALAMO stays `ALAMO`. No parallel category model is introduced.

Creation is deduplicated by project key. Thirty or forty ready rows for one missing project create one folder and all jobs reference its ID. Subsequent new rows reuse that folder. Replaying the same source IDs creates no jobs or folders and performs no save.

## Safety and rollback

The authenticated fresh authoritative baseline, full backup, reviewed confirmation, atomic revision/CAS save guard, and protected-state checks remain in place. The complete preview is checked again after authoritative revalidation and after backup. Every ready job's normalized project/category pair is resolved and checked against its assigned folder ID before append/save.

Folders and both job arrays are staged in the same import/save. Immutable copies of staged folders and jobs are passed to cloud read-back verification; folders, jobs, and unique source IDs remain exact. Unrelated business data uses the shared comparison helper with only the five generated weekly-window metadata exceptions documented in CJI-02E below.

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

## CJI-02C: comparison-only generated report timestamps

Continued on the existing branch and PR #490 from the required `f999bed5efdbf5fe4df58577c4ebf9015cdce53f`, after verifying branch, exact HEAD, and clean status. The user reported that the real Vercel preview stopped at “Import stopped — preparing backup: Authoritative baseline changed while preparing backup; refresh and preview again.” The supplied read-only diagnostics had matching loaded/cloud revision `1790970759830`, matching collection counts, recovery mode false, and autosave enabled. The single recursive difference was `$.weeklyCostReports[0].generatedAtISO`: local `2026-10-02T20:20:07.475Z` versus cloud `2026-10-02T19:52:35.090Z`. These production diagnostics were supplied by the user; no production state was fetched or imported during this task.

Code inspection before editing confirmed the assumption: `computeCostModel()` in `js/renderers.js` creates each weekly bucket using `weekKey`, `weekStartISO`, and `weekEndISO`, writes `generatedAtISO: new Date().toISOString()`, derives financial totals from cut/maintenance items, sorts by weekStartISO, then refreshes `window.weeklyCostReports`. The report timestamp is generation metadata, with no use as report identity, financial value, or revision/CAS identity. `snapshotState()` copies the live report entries; the save guard uses `syncMeta.rev` and expectedRevision. Other generatedAtISO properties elsewhere in the application have not been generalized into this exception.

`CuttingJobImporter.normalizeComparisonState()` is the single narrow helper. It clones input data and creates comparison-only report entries without their direct generatedAtISO property, **only when weeklyCostReports is an array**. Null/primitive/array entries and non-array weeklyCostReports retain their original shape. Nested generatedAtISO properties, top-level timestamps and timestamps in other collections remain exact. Shared references are isolated so ignoring a weekly entry's timestamp cannot ignore that property in another collection. Frozen input tests confirm there is no mutation.

The same helper is used at all reviewed Cutting Job import comparison sites:

- `prepareCuttingJobImportBackup()`: current compact snapshot versus fresh cloud business state, and prepared baseline/business signatures.
- The prepared backup's `validate()`: local state versus the reviewed signature immediately before the trusted synchronous download.
- The import adapter's `revalidateBaseline()`: fresh authoritative state before staging.
- The backup receipt adapter: cloud re-read versus both the fresh authoritative baseline and prepared signature.
- Importer's `protectedSnapshot()` / `compareProtected()`: comparison of unrelated protected fields during staging.
- The import adapter's `verifyCloud()`: post-save unrelated protected data versus the authoritative baseline. Jobs, completed jobs, folders, and unique import_event_id checks remain exact and are not passed through a broader exception.

All weekly business content remains strict: array length/order, IDs, week keys/dates/periods, totals, dollar values, categories, cut items, amounts, and arbitrary other fields. All other protected data, project/category relationships, materials, reviewed-preview identity, backup receipt ownership, revision/CAS, double-click prevention, rollback, and indeterminate suspension remain enforced. A meaningful post-save drift fails verification and suspends writes without retry or rollback of committed evidence.

The helper never writes to window.weeklyCostReports, snapshot data, backup payloads, cloud state, or the Firebase save payload. Backups still contain the cloud's original timestamp. Ordinary application save behavior still preserves the live generated timestamp; it is neither deleted nor replaced by the comparison helper. The actual Edge fixture verifies the downloaded timestamp A and saved/live timestamp B are both present, with every other report field unchanged.

Verification on October 5, 2026 (all PASS, zero failures; no package.json, no npm):

```powershell
node --check js/core.js
node --check js/cuttingJobImporter.js
node --check tests/cji-02-project-category-import.test.js
node --check tests/cji-02a-backup-action.test.js
node --check tests/cji-02c-comparison-state.test.js
node --check scripts/cji-02a-browser.js
node --test tests/cji-02-project-category-import.test.js tests/cji-02a-backup-action.test.js tests/cji-02b-legacy-category-adoption.test.js tests/cji-02c-comparison-state.test.js tests/cutting-job-import.test.js tests/cji02-history-repair.test.js tests/import-selective-rollback.test.js tests/atomic-persistence.test.js tests/recovery-import.test.js
node scripts/devsafe-server.js
# In a second terminal:
$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node scripts/cji-02a-browser.js
git diff --check
git diff --cached --check
```

Node/DOM: **205 cases passed** (the prior 170 plus 35 focused CJI-02C cases). Node's aggregate reports 168 entries because the older cutting-import and repair script suites each count as one entry rather than their internal 24 and 15 cases. The focused matrix exercises production adapter code and verifies timestamp-only/multiple/missing timestamp equality, non-mutating frozen/shared data, strict meaningful drift before and after save, unchanged backup payloads, receipt checks, staging protection, and revision mismatch. All CJI-02A/B cases still pass, including legacy 0000 ID-preserving rename, independent XXXX, and historical 1111 handling.

Actual Edge: **16/16 scenarios passed** using the disposable full localhost app with external requests blocked. Two new no-watcher scenarios use cloud timestamp A and local timestamp B: preview prepares the backup, the trusted final click starts a real inspected download, fresh baseline and receipt checks pass, and timestamp-only post-save verification completes with no recovery/autosave suspension. A second scenario injects a meaningful dollar drift in the post-save server read and correctly suspends after exactly one save, with staged evidence retained. The previous 14 backup/action/legacy/XXXX scenarios pass unchanged. No DevTools, console/status polling during normal submission, production Firebase import, new branch/PR, or merge was performed. Results and downloaded fixture backups are retained in ignored `artifacts/cji-02a/`. Actual shop Vercel acceptance of this fix remains untested.

## CJI-02D: bounded Preview preparation stability

Continued on the existing branch and PR #490 after confirming `cutting-import-project-categories`, expected HEAD `40d15beb05e2b2f9d5c20735526e717a20743052`, and clean status. No package.json or AGENTS.md exists in this checkout; no npm commands were used.

The user supplied a further Vercel symptom: the Preview click intermittently failed the backup equality guard, although later normalized comparison and direct `prepareCuttingJobImportBackup()` succeeded. Loaded revision before/after the diagnostic read and cloud revision were all `1790973695350`; normalized local/cloud signatures both had length `595914` and compared equal. This is evidence of timing, not evidence that another business property should be excluded.

Phase inspection covered opening/focus, parsing, classification, table rendering, definition planning, snapshot/global refresh, job/cost render callbacks, report regeneration, autosave, and state adoption. The importer handler has no direct business-state write. Runtime snapshots refresh bindings and normalize existing folder/config state; the app also has queued frame work (dashboard follow-up, layout notifications, chart rendering) and asynchronous cloud adoption. A specific production operation or transient field could not be identified from the supplied post-failure diagnostics. No production state was fetched.

An actual Edge probe of the unchanged starting code recorded normalized signatures at start, parsed, classified, rendered, definition-plan, and prepare-entry boundaries. Ordinary fixture signatures stayed unchanged at every phase. A controlled pending snapshot projection at **`$.jobLayout.fixtureRenderPhase`** reproduced the exact symptom: the old Preview click stopped with “Authoritative baseline changed while preparing backup,” a queued animation frame cleared that projection, and direct preparation then succeeded at the same revision. The injected field exists only in the test fixture; it is not claimed to be the shop's actual field. The old-code evidence is retained locally in ignored `artifacts/cji-02a/preview-race-probe.json`.

The sequencing fix keeps equality strict and prepares no Blob until a stable point is proven:

1. Capture normalized local A and read fresh cloud state at the Preview-start revision R.
2. Cross queued microtasks, two rendering frames, and the next task, then capture local B.
3. If A differs from B or B still differs from cloud, allow one additional such render cycle.
4. Perform a second fresh cloud read at R, then capture local C.
5. Proceed only if B equals C, C equals the final authoritative business state, both cloud reads have the same normalized business state, and the loaded revision and recorded local business-edit version have remained unchanged throughout.

This is a fixed A/B/C verification sequence: **at most three stabilization samples, two cloud reads, and two render-cycle waits**. Each render-cycle wait has a one-second deadline with callback cancellation; each cloud read retains the existing 30-second timeout. No loop, polling interval, recurring watcher, renderer invocation, autosave flush, or cloud adoption is installed. Delayed work that cannot settle within these bounds stops visibly. Fingerprints are diagnostic labels only; equality uses complete stableStringify signatures.

Persistent local differences in jobs, completed jobs, folders, report financial content, inventory, maintenance, or any other business field block. Cloud business differences between the two reads block even if the revision incorrectly stays unchanged and local state matches the later cloud value. Revision changes and recorded business edits block immediately. The fix neither rolls local state back to cloud nor writes anything during preparation. CJI-02C still ignores only direct weekly report generatedAtISO in comparison copies; stored report/backup data remain intact.

The Preview handler now marks itself busy through parsing and preparation, preventing competing Preview clicks and dialog cancellation during that action. It preserves full reviewed-preview revalidation, prepared-backup ownership, synchronous trusted final download, exact expected-revision CAS, 0000 rename/reuse, XXXX semantics, selective rollback, and strict post-save verification. Successful preparation creates exactly one authoritative pre-import backup.

Bounded diagnostics are stored in `#cuttingJobImportRows.dataset.lastPreviewPreparation`: loaded/current/cloud revision, comparison count, whether local signatures changed, first mismatch and blocking mismatch paths, phase/status, and up to ten phase samples with signature length/fingerprint and first changed path. No full signatures or protected values are exposed. Failure messages distinguish loaded/cloud revision changes, cloud business drift, local mismatch, non-stabilizing snapshots, recorded edits, and a stalled rendering cycle. Controls recover for a fresh user review; there is no automatic retry.

Exact verification commands (all PASS):

```powershell
node --check js/core.js
node --check js/cuttingJobImporter.js
node --check scripts/cji-02a-browser.js
node --check tests/cji-02d-preview-stability.test.js
node --check tests/cji-02a-backup-action.test.js
node --check tests/cji-02c-comparison-state.test.js
node --test tests/cji-02-project-category-import.test.js tests/cji-02a-backup-action.test.js tests/cji-02b-legacy-category-adoption.test.js tests/cji-02c-comparison-state.test.js tests/cji-02d-preview-stability.test.js tests/cutting-job-import.test.js tests/cji02-history-repair.test.js tests/import-selective-rollback.test.js tests/atomic-persistence.test.js tests/recovery-import.test.js
node scripts/devsafe-server.js
# In a second terminal:
$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node scripts/cji-02a-browser.js
git diff --check
git diff --cached --check
```

Node/DOM: **233 cases passed, zero failures** (the prior 205 plus 28 focused stability cases). The aggregate Node runner reports 196 entries because the older importer/repair scripts each count as one entry instead of their internal 24 and 15 cases. The new tests exercise the actual Preview handler and preparation adapter, transient convergence, persistent local drift, same-revision cloud drift, revision/edit-version changes, bounded nonconvergence, callback deadlines/cleanup, double Preview/cancel protection, one authoritative backup, trusted download and CAS, 0000/XXXX, and post-save suspension. All CJI-02A/B/C, rollback, persistence and recovery suites pass.

Actual Edge: **21/21 scenarios passed, zero failures**. Five new full-page scenarios verify a single Preview click succeeds after an injected projection settles, and visibly blocks persistent local business drift, cloud business drift, revision drift, and never-stable snapshots with zero backup Blobs/downloads/saves. The previous 16 scenarios pass, including trusted downloads without a watcher, report timestamp normalization, strict post-save drift suspension, legacy 0000 adoption, and XXXX. Every external request is blocked; only the disposable localhost devsafe backend is used. The normal import driver awaits the business promise and reads status afterward, without DevTools or status polling during submission. Artifacts remain in ignored `artifacts/cji-02a/`. No production Firebase import, new branch/PR, or merge was performed. The exact shop transient writer/path and actual Vercel acceptance remain unverified.

## CJI-02E: generated weekly-window rollover metadata

Continued on the existing branch and PR #490 after confirming `cutting-import-project-categories`, expected HEAD `bf82a65d6c60a2470b2dd0256d98f15b62991222`, and clean status. No package.json or AGENTS.md exists; no npm commands were used.

The shop supplied the missing production comparison evidence: D's blocker was `$.weeklyCostReports[0].weekEndISO`. Loaded and cloud revisions both equaled `1791208959184`, and both arrays contained 25 reports. The current empty local report covered Oct 5–11 (`weekKey/weekStartISO: 2026-10-05`, `weekEndISO: 2026-10-11`, `weekLabel: Oct 4, 2026 - Oct 10, 2026`, generatedAtISO `2026-10-05T14:09:31.745Z`). Cloud still held the previous empty Sep 28–Oct 4 window (`2026-09-28`, `2026-10-04`, `Sep 27, 2026 - Oct 3, 2026`, generatedAtISO `2026-10-02T20:40:59.094Z`). Both had empty cut/maintenance item arrays, zero costs/hours, and empty cutByCategory. The supplied full-state comparison was equal after removing only the five direct window properties. These diagnostics came from the user; no production state was fetched or imported.

Mandatory code inspection before editing confirmed that weeklyCostReports is a persisted generated reporting cache, not an independently edited financial ledger:

- `computeCostModel()` in `js/renderers.js` creates a fresh weeklyMap on each build. Its `startOfWeekMonday()` / `formatWeekKey()` and `ensureWeek()` generate weekKey and weekStartISO, calculate weekEndISO as six days later, and assign generatedAtISO from the clock.
- Completed job records and maintenance occurrence/history records populate cutItems, maintenanceItems, totals, hours, and category aggregates. Their original IDs, dates, costs, and relationships remain in source records and report items.
- `ensureWeek(startOfWeekMonday(new Date()))` adds the current reporting week, including an empty current bucket. A week rollover can therefore replace a previous empty generated bucket without changing report count or business content.
- The builder sorts buckets by generated weekStartISO, formats weekLabel from the generated endpoints, and replaces `window.weeklyCostReports` with the result. The cost UI selects/displays/exports these generated buckets; it does not edit stored weekly-report ledger rows. weekKey identifies a generated bucket, not a manually persisted source transaction.
- `snapshotState()` copies the live cache into ordinary save/backup data, and adoption restores it. Searches found no independent weekly-report editor/writer besides the builder and normal persistence/adoption.

The existing `CuttingJobImporter.normalizeComparisonState()` now removes exactly these direct properties from each object entry in an array, **in the comparison copy only**:

```text
generatedAtISO
weekKey
weekLabel
weekStartISO
weekEndISO
```

This expands C's original timestamp-only exception; it supersedes the earlier C/D statements that direct generated window dates must always be strict. Source dates, nested fields with the same five names, report IDs, and every other business value remain exact. The helper clones input and isolates shared entries, preserving frozen/live objects, snapshot output, backup JSON, cloud data, save payloads, and dashboard/export display. It neither modifies the report builder nor strips fields from application storage. Ordinary saves still preserve the live generated metadata as before.

No additional ignore implementation was added. The same helper already serves Preview/stability signatures, prepared-backup validation, fresh baseline checks, backup receipt verification, protected-state staging comparison, and post-save unrelated-state verification. D's A/B/C checks, bounds, first-path diagnostics, and revision/edit-version guards remain unchanged.

Report array count and content order remain strict; no sorting or removal of reports is introduced. Exact comparisons still cover cutItems, maintenanceItems, cutByCategory, totalCutCost, totalMaintenanceCost, totalCutHours, profit/loss, dollar/hour labels, job/category/project identities, nested costs/dates/hours, unknown fields, and future financial fields. Jobs, completed jobs, folders, inventory, maintenance, revision/CAS, and all other protected business data remain strict. The C negative date fixture now mutates a source item's dateISO instead of a direct generated weekStartISO, preserving the meaningful-date regression under the new explicit exception.

Exact verification commands (all PASS on October 5, 2026):

```powershell
node --check js/cuttingJobImporter.js
node --check tests/cji-02c-comparison-state.test.js
node --check tests/cji-02e-weekly-window.test.js
node --check scripts/cji-02a-browser.js
node --test tests/cji-02-project-category-import.test.js tests/cji-02a-backup-action.test.js tests/cji-02b-legacy-category-adoption.test.js tests/cji-02c-comparison-state.test.js tests/cji-02d-preview-stability.test.js tests/cji-02e-weekly-window.test.js tests/cutting-job-import.test.js tests/cji02-history-repair.test.js tests/import-selective-rollback.test.js tests/atomic-persistence.test.js tests/recovery-import.test.js
node scripts/devsafe-server.js
# In a second terminal:
$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node scripts/cji-02a-browser.js
git diff --check
git diff --cached --check
```

Node/DOM: **283 cases passed, zero failures** (the prior 233 plus 50 focused E cases). Node's aggregate runner reports 246 entries because the older importer/repair scripts each count as one entry rather than their internal 24 and 15 cases. E covers each generated property separately, all-five and missing/multiple-entry variants, 25-report rollover, frozen/shared/non-array behavior, all six production comparison sites, preservation of original payloads, strict pre-save and post-save drift across 33 financial/content/identity/count/order/protected variants, diagnostics, and revision mismatch. All A/B/C/D, import, repair/audit, selective rollback, atomic persistence, and recovery suites pass, including 0000 folder rename/reuse, XXXX, trusted downloads, never-stable preparation, and post-save suspension.

Actual Edge: **23/23 scenarios passed, zero failures**. Two new full-page no-watcher cases use 25 cloud reports with Sep 28–Oct 4 metadata and otherwise identical live reports with Oct 5–11 metadata. Positive: one Preview prepares one authoritative backup, normal trusted confirmation triggers a real download, one CAS save succeeds, and post-save verification completes without recovery. The inspected backup retains all original cloud fields; live/saved reports retain the new generated window, with every other report property unchanged. Negative: changing totalCutCost while the windows differ blocks Preview at `$.weeklyCostReports[0].totalCutCost`, with zero backup Blobs/downloads/saves. The previous 21 scenarios still pass. Tests use only disposable localhost devsafe state with external requests blocked; no DevTools or manual retry is required. Artifacts remain in ignored `artifacts/cji-02a/`. No production Firebase import, new branch/PR, or merge was performed. Actual shop Vercel acceptance remains untested.

## CJI-02F: unused legacy 1111 does not claim canonical 0000

Continued on the existing branch and PR #490 after confirming `cutting-import-project-categories`, expected HEAD `656d8c7e82802115bd4129b3607dcce9971826e5`, and clean status. No package.json or AGENTS.md exists; no npm commands were used.

The user supplied two authoritative-folder descriptions: `job_project_0000` named `0000 Undisclosed Project`, null project metadata, and 11 linked jobs all carrying projectNumber `"0000"`; plus `job_project_1111` named `1111 Company Improvements`, null metadata and zero linked jobs. The 11 jobs prove the first folder's 0000 ownership. The second folder supplies no actual evidence for 0000. These facts were reproduced with deterministic fixtures; no production state was fetched or imported.

The resolver's root cause was combining strong prefix `1111` with weak canonical-name inference “Company Improvements means 0000.” The resulting claims `{1111,0000}` falsely blocked the real 0000 category. The focused fix suppresses that unrelated canonical-name claim when the folder has an explicit different prefix and no metadata or referencing job naming the requested canonical project. A mismatched display name remains a review issue for its own folder. Actual requested-project evidence is never suppressed: metadata 0000 or a linked 0000 job on the prefix-1111 folder still makes it a real conflict. Crossed source pairs, contradictory metadata on related folders, duplicate genuine claimants/IDs, and unknown future-name ambiguity remain strict. A bare canonical name with contradicting metadata remains ambiguous and blocked.

The current pair `0000 / Company Improvements` now resolves **Rename existing** through `job_project_0000`, to `0000 Company Improvements`. Import and repair audit agree on that name-only plan. No second 0000 folder is created. All 11 original IDs, project numbers and cat links remain unchanged, and folder metadata is preserved. Rerun resolves Existing with zero new or renamed 0000 categories.

`categoryOwnershipDiagnostics()` is read-only and shared by Preview and audit. The empty/null-metadata legacy folder is reported as **“Unused legacy 1111 Company Improvements folder”** with its ID and zero linked-job count. Row warnings, a deduplicated category-plan review list, the Preview summary/dataset, and the Audit status/dataset expose the diagnosis. Nonempty 1111 history remains preserved and diagnosed for review; mixed/contradicting strong evidence is classified as an ownership conflict and blocks the projects actually referenced. No 1111 job is converted to 0000 or XXXX.

**Optional 1111-to-XXXX cleanup is not implemented.** The selected behavior is the request's option B: preserve the legacy folder and clearly diagnose it. The existing import rename mechanism handles display correction for proven same-project ownership; it does not prove safe cross-project repurposing, including every other reference. No name, ID, metadata, child folder, or external reference on the 1111 folder is changed. “Unused” refers to zero linked jobs, not proof that no other references exist. The diagnostic explicitly reports cleanupPlanned false.

Any future optional cleanup would require its own reviewed plan proving all six conditions: exact ID `job_project_1111`, exact old name, blank/null metadata, no referencing jobs, no other project/category references, and no existing XXXX claimant. It would also require the same guarded staging/rollback/verification protections. This task does not make that change. Existing XXXX folders are reused; when XXXX is missing and ready workbook rows request it, normal native creation creates one separate canonical folder, with later rows reusing it. The legacy 1111 folder remains unchanged in either case.

A–E protections remain intact: trusted synchronous prepared-backup download, full reviewed-preview identity and fresh baseline/CAS, selective rollback, indeterminate no-retry suspension, bounded D stabilization/diagnostics, and the comparison-only five-field weekly-window exception. Definite rejection restores the reviewed 0000 name change while the 1111 folder stays untouched. A fresh job link or metadata change invalidates the reviewed plan instead of relying on the earlier empty-folder diagnosis.

Exact verification commands (all PASS on October 5, 2026):

```powershell
node --check js/core.js
node --check js/cuttingJobHistory.js
node --check js/cuttingJobImporter.js
node --check scripts/cji-02a-browser.js
node --check tests/cji-02f-legacy-1111.test.js
node --test tests/cji-02-project-category-import.test.js tests/cji-02a-backup-action.test.js tests/cji-02b-legacy-category-adoption.test.js tests/cji-02c-comparison-state.test.js tests/cji-02d-preview-stability.test.js tests/cji-02e-weekly-window.test.js tests/cji-02f-legacy-1111.test.js tests/cutting-job-import.test.js tests/cji02-history-repair.test.js tests/import-selective-rollback.test.js tests/atomic-persistence.test.js tests/recovery-import.test.js
node scripts/devsafe-server.js
# In a second terminal:
$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node scripts/cji-02a-browser.js
git diff --check
git diff --cached --check
```

Node/DOM: **313 cases passed, zero failures** (the prior 283 plus 30 focused F cases). The aggregate Node runner reports 276 entries because the older importer/repair scripts count as one entry each rather than their internal 24 and 15 cases. F covers the exact two-folder state, read-only diagnosis, ready Preview/plan, 11-link and metadata preservation, repair audit, nonempty 1111 history, genuine metadata/linked/duplicate/ambiguous ownership conflicts, generic prefix precedence, XXXX reuse/separate creation, reference preservation without cleanup, rerun, Mesquite/future creation, backup failure, rollback, indeterminate single-save behavior, and post-preview ownership drift. All A–E/import/repair/rollback/persistence/recovery suites pass.

Actual Edge: **25/25 scenarios passed, zero failures**. The new full-page positive scenario seeds the exact 0000 folder with 11 matching jobs plus the empty 1111 folder. Preview shows Rename existing and the unused-legacy warning, the actual Audit button reports the same read-only diagnosis/0000 plan, a real trusted confirmation downloads the authoritative old names, and one save completes with the same folder count/IDs, unchanged 1111 metadata, and all 11 original job links. Rerun proposes zero new/renamed categories. A second scenario adds actual 1111 and 0000 jobs referencing the 1111 folder and correctly shows Conflict / Review with zero backup Blobs/downloads/saves. The previous 23 scenarios pass, including weekly rollover and financial negatives, never-stable preparation, CAS, rollback and indeterminate suspension. Every external request is blocked; only disposable localhost devsafe state is used. No production Firebase import, optional XXXX cleanup, new branch/PR, or merge was performed. Results/backups remain in ignored `artifacts/cji-02a/`; actual shop Vercel acceptance remains untested.

## CJI-02G: canonical cutting import identities and owning-job provenance

Continued on `cutting-import-project-categories` / PR #490 after confirming expected HEAD `b92e7b0029da4f1bfb002a90ae533b5921515d8c` and clean status before editing.

The user confirmed the production import **already succeeded**: 88 ready rows, 88 completed jobs and 88 completed time records added, stateWriteCompleted/saveCompleted/verificationCompleted true, saveIndeterminate false. Their authoritative read-back contains 1 active + 155 completed jobs (68 preexisting + 88 imported), 15 folders, and 88 distinct canonical `616-CUT` IDs with no duplicate IDs. The `job_project_0000` rename to `0000 Company Improvements` also committed; `job_project_1111` remains `1111 Company Improvements`. These are user-supplied production facts, reproduced structurally with synthetic fixtures, not a production fetch or second import.

The false Recovery Mode came from `globalIdentityRepair.preview()` discovery: every array row with import_event_id beneath either job collection was registered in cuttingImportEvents. The actual importer intentionally writes the same source identity into a top-level job, its manual log, and raw importProvenance. The log became a second independent identity, creating a false duplicate group; the provenance object then appeared to the unknown-collision scanner as an unsupported duplicate-ID reference.

Independent cuttingImportEvents identities now come **only** from import_event_id on direct members of `$.cuttingJobs[index]` or `$.completedCuttingJobs[index]`. The namespace remains shared across active and completed jobs. Nested import_event_id fields in any object/array beneath one of those jobs are validated as provenance references, including every manualLogs row and importProvenance. A present nested field must equal its owning job's valid top-level identity, that canonical identity must resolve to exactly one job, and its target path must be the owner. Matching references are reported in the audit reference list and recognized by the unknown-reference scan. They never enter independent identity grouping or produce identity patches. Wrong, blank, non-string, absent-canonical, or otherwise unresolvable evidence blocks with its exact field path. A nested-only identity never synthesizes a canonical job identity. Historical jobs/logs without import_event_id remain supported.

Two distinct job owners sharing a canonical event still block, including two completed jobs or active/completed collisions. Duplicate deterministic job IDs, IDs on nested records, unrelated durable/import-event identities, unknown duplicate consumers, inventory and maintenance protections remain strict. This changes only auditor interpretation: no source ID, job, manual log, provenance, cut number, category, folder, backup or saved payload is rewritten, and no migration or automatic repair is introduced. Existing load/adoption gates now accept matching provenance without triggering recovery; real corruption still adopts exact evidence read-only and disables saves.

The synthetic post-import fixture retains the other global collections and seeds exactly 68 preexisting jobs + 88 mapped completed imports / 15 folders. The auditor passes with **88 canonical cuttingImportEvents, 176 validated nested source-ID references, zero duplicate groups, zero unknown references and zero changes**, without mutating the fixture. A full 88-row submit separately exercises legacy 0000 rename, one backup/save, exact immutable saved jobs/folder verification, preservation of unused 1111 and imported provenance, and duplicate/idempotency detection. Real core load tests prove the already-committed fixture exits recovery after exact authoritative adoption without a repair/import retry, while a genuine active/completed event collision stays read-only.

Verification commands (all PASS on October 5, 2026):

```powershell
node --check js/globalIdentityRepair.js
node --check tests/fixtures/cutting-import-identities.js
node --check tests/cji-02g-cutting-import-identities.test.js
node --check tests/global-identity-repair.test.js
node --check scripts/cji-02a-browser.js
node --test tests/global-identity-repair.test.js tests/cji-02g-cutting-import-identities.test.js tests/cji-02-project-category-import.test.js tests/cji-02a-backup-action.test.js tests/cji-02b-legacy-category-adoption.test.js tests/cji-02c-comparison-state.test.js tests/cji-02d-preview-stability.test.js tests/cji-02e-weekly-window.test.js tests/cji-02f-legacy-1111.test.js tests/cutting-job-import.test.js tests/cji02-history-repair.test.js tests/import-selective-rollback.test.js tests/atomic-persistence.test.js tests/recovery-import.test.js tests/inventory-identity.test.js tests/inventory-identity-repair.test.js tests/maintenance-history-import.test.js
node scripts/devsafe-server.js
# In a second terminal:
$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node scripts/cji-02a-browser.js
git diff --check
git diff --cached --check
```

Node reports **407/407 aggregate entries passed, zero failures**: 41 focused G tests, 61 global identity tests (including two new real adoption tests), plus all A–F/import/repair/recovery/atomic/selective rollback suites and inventory/maintenance regressions. The older importer, history-repair and maintenance-import scripts each appear as one aggregate entry; importer/history-repair also report their internal 24/15 cases passing.

Actual Edge: **27/27 scenarios passed, zero failures**. The new positive case imports four completed jobs through the actual page handlers, with matching top-level/log/provenance identities, one trusted real backup download, one CAS save and successful exact post-save verification. Global integrity passes, recovery stays false, autosave stays enabled, and a page reload reads/adopts the identical committed jobs normally. The negative case first succeeds, then directly seeds two canonical owners with the same ID in the disposable backend; reload enters recovery, reports a two-record cuttingImportEvents collision, preserves exact evidence, and blocks saveCloudNow with zero transaction attempts and unchanged cloud state. The initial negative harness assertion expected an optional stateWriteAttempted field on the early-blocked response; it was corrected to assert the actual error and zero transactions. All 25 A–F Edge scenarios still pass. External requests are blocked, contexts use only localhost devsafe fixtures, and results/backups remain in ignored `artifacts/cji-02a/`.

No production data was rewritten and no second production import was run. No new branch/PR or merge was performed. Once the fix is deployed, the operator should hard-refresh the current PR preview to read/adopt the already-correct cloud state; no import retry is needed. Actual production hard-refresh acceptance remains untested here.
