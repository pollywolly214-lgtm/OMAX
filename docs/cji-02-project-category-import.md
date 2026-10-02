# CJI-02: project/category binding in reviewed Cutting Jobs imports

## Baseline and scope

Started from `main` / `origin/main` at `7fb1109a397acffb7a6ee2e3aad3c615bbf55125` on the new `cutting-import-project-categories` branch in an isolated checkout. The existing maintenance checkout and its uncommitted work were left untouched. No production Firebase import was run.

The root cause was a project-only resolver using a closed category registry, ignoring the reviewed workbook category cell. The registry also mislabeled `0000`, assigned Company Improvements to `1111`, and omitted `1242`.

## One project identity

`project_number` is the canonical project key, kept as a string. `category` is its human-readable name; `job.projectNumber` and the folder referenced by `job.cat` must agree. Trimmed, case-insensitive names with collapsed whitespace are compared without fuzzy matching. Original project/category cells, including their original whitespace and any Excel zero, are retained in `importProvenance`.

| Project key | Confirmed name |
| --- | --- |
| 0000 | Company Improvements |
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

ALAMO remains supported as `ALAMO`, without a numeric substitute. `1111` has no confirmed mapping. It may use a consistent independent legacy name, but cannot claim Company Improvements. Import does not rename or migrate historical folders or change existing jobs' project/category fields. Existing chronological resequencing behavior is preserved.

`0000` stays exactly `"0000"`. Only `"0"` with unambiguous Company Improvements source evidence (plain name, `0000 Company Improvements`, or `Company Improvements 0000`) becomes `"0000"`, with a visible preview warning. Other numbers are never padded.

## Resolution and conflicts

The focused resolver validates the source pair and inspects existing folder evidence: optional `projectNumber`, a leading project key, confirmed canonical/legacy names, supported reversed names such as `ATM 1251`, and existing jobs referencing that folder. A unique compatible legacy name is reusable without migration. Existing optional metadata survives native folder normalization as a string; it is not added to every old folder or required on any folder.

Conflicting metadata, prefix, known name, or existing job ownership blocks the row. Multiple candidate folders or duplicate folder IDs block rather than picking one. For example, `1254 / ATM` and `1242 / Blanco` block. A legacy folder already used by another project cannot be silently reused.

All workbook rows participate in source conflict detection, including blocked, duplicate, and excluded rows. Different names for one project block all affected rows; one name claimed by different project keys also blocks all affected rows. Final revalidation compares the entire reviewed preview, preserving this evidence rather than reclassifying only the ready subset.

Known keys can infer their confirmed name when the category is blank. Unknown keys require a nonblank name. Future projects such as `1305 / Smith County` are accepted when consistent and free of conflicts.

## Creation, preview, and idempotency

Preview shows Project, Category, and Existing / Will create / Conflict or Review status. Preview never creates a folder. Only ready rows contribute to the creation plan; a project mentioned solely by rows with `needs_review`, RC50, thickness, dimensions, or other blockers creates nothing.

After the existing reviewed final confirmation and successful backup, missing categories use the existing `addJobFolder` adapter: native `genId`, `jobs_root` parent, next native order, and native optional color behavior. New names are `<project_number> <category name>` using confirmed spelling for known keys; an already supplied number is stripped before composing the name. ALAMO stays `ALAMO`. No parallel category model is introduced.

Creation is deduplicated by project key. Thirty or forty ready rows for one missing project create one folder and all jobs reference its ID. Subsequent new rows reuse that folder. Replaying the same source IDs creates no jobs or folders and performs no save.

## Safety and rollback

The authenticated fresh authoritative baseline, full backup, reviewed confirmation, atomic revision/CAS save guard, and protected-state checks remain in place. The complete preview is checked again after authoritative revalidation and after backup. Every ready job's normalized project/category pair is resolved and checked against its assigned folder ID before append/save.

Folders and both job arrays are staged in the same import/save. Immutable copies of the staged folders and jobs are passed to cloud read-back verification; folders are now verified exactly alongside jobs, unique source IDs, and every unrelated cloud field.

On a definite rejection, selective rollback removes owned staged jobs, restores owned sequence changes, and removes unchanged, unreferenced import-created folders. Without concurrent edits this restores the intended arrays exactly. Concurrent edits/additions are preserved; changed or referenced import evidence suspends writes for review. Indeterminate or thrown saves and failed committed read-back verification retain all evidence, suspend writes, and never retry automatically. Refresh and read verification are required before proceeding.

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
