# CJI-01 — reviewed full-detail cutting-job importer

**Static implementation inspection:** 2026-08-13. The requested `omax_cut_tracker_recovery_review.xlsx` was not present anywhere under `/workspace`, so it was not opened and no claim is made about its actual rows. No browser, production import, Firebase operation, rules deployment, Storage operation, cache operation, or state mutation was performed.

## Pre-edit inspection and planned changes

Before editing, the repository was searched for `AGENTS.md` (none), `package.json` (absent), the recovery workbook (absent), spreadsheet parsers (none), job creation/completion/editing/manual-log paths, job folders, material pricing, full-state save/load/recovery code, and the reviewed maintenance importer/tests. The planned files were: local parser asset and license (`assets/vendor/cji-xlsx-parser.*`), pure importer (`js/cuttingJobImporter.js`), deterministic tests, this document, script/admin markup in `index.html`, and a narrowly scoped app adapter in `js/core.js`. Firebase/Storage rules, CFR transfer code, `vercel.json`, caches, backups, and business collections were excluded.

## Confirmed schemas and mappings

The authoritative arrays remain `window.cuttingJobs` and `window.completedCuttingJobs` inside `workspaces/github-prod/app/state`.

The Add Job form creates active jobs with `id`, `name`, `estimateHours`, `startISO`, `dueISO`, `projectNumber`, `material`, `materialCost`, `materialQty`, `materialWeight`, `chargeRate`, `costRate`, `priority`, `notes`, `manualLogs`, `files`, and `cat`. The form requires name, positive estimate, start/due dates, a digit-only project number (preserving a string such as `0000`), and an existing category; estimate minutes are added to estimate hours. Categories are `jobFolders` records (`id`, `name`, `parent`, `order`) and are resolved only by one exact ID/name match. Material definitions come from browser-local `job_material_pricing_v1` settings (`wasteFactor`, `materials[{name,density,pricePerLb}]`) and are resolved by exact ID/name without creating or changing definitions.

Completion normally copies the active identity/business fields and adds `completedAtISO`, `actualHours`, and efficiency data. Completed cutting time is represented by nested `manualLogs[{dateISO, completedHours}]`; therefore `actual_cut_minutes` maps only to `completedHours = minutes / 60`, dated with the completed date for completed rows. It is never substituted for estimate time. The importer preserves the complete submitted column set in bounded `importProvenance`, preserves `import_event_id` at job/log level, keeps project/category separate, leaves `files: []`, and adds no cloud metadata.

| Input | Authoritative job mapping |
|---|---|
| `import_event_id` | `import_event_id`, deterministic `id`, provenance, optional manual-log ID |
| `record_status` | target active/completed array |
| `job_name` | `name` |
| `project_number` | `projectNumber` string, independently of category |
| `estimate_hours` + `add_minutes` | `estimateHours` |
| `actual_cut_minutes` | confirmed `manualLogs[].completedHours` only |
| `priority`, charge/cost rates | `priority`, `chargeRate`, `costRate` |
| start/due/completed dates | `startISO`, `dueISO`, `completedAtISO` |
| category/material | exact existing `cat` ID / material name |
| material cost/weight | `materialCost`, `materialWeight`; `materialQty` remains form-compatible `1` |
| remaining supported fields | exact scalar values under `importProvenance`; review notes also become `notes` |

Blank optional values remain blank/null-equivalent and no missing shop values are invented. Rows are `ready`, `duplicate`, `unresolved`, `invalid`, or `excluded`; `needs_review` blocks. Existing event IDs are no-ops, repeated IDs within an operation are invalid, and identical cuts with different IDs remain distinct.

## Parsing and reviewed workflow

CSV uses a local RFC-style quoted parser and JSON accepts an array or `{rows:[]}`. XLSX uses the repository-local, dependency-free **CJI XLSX Parser 1.1.0**, licensed MIT. It reads OOXML ZIP worksheets in-browser and selects only `Cutting Jobs` or `Blank Import Template`; Pump Readings, Maintenance Notes, Cached Files, Recovery Summary, and every other sheet are ignored. No executable spreadsheet code loads from a CDN.

The temporary admin section previews every row with separate blocking reasons and nonblocking warnings. Final submission re-runs validation and requires the reviewed checkbox plus a final browser confirmation. Controls lock during parsing/saving and the API rejects concurrency.

## Persistence, rollback, and safety

The adapter requires Firebase Auth, `FB.ready`, the authoritative document reference, a last-loaded cloud baseline, and no local-backup-only mode. Before mutation it downloads `snapshotState({skipLocalFileCacheSync:true})`, clones both job arrays, captures protected collection values/counts, maps exact intended arrays, and rejects unrelated changes. It appends only reviewed active/completed jobs and confirmed manual logs, then calls only `await saveCloudNow()`.

Success requires both `saved === true` and `stateWriteCompleted === true`. A definite block/failure restores both arrays and verifies byte equivalence without retry. An indeterminate write is not retried or rolled back; the operator must refresh and read-verify. The structured result exposes all requested row counts, IDs, additions, backup/save/write/indeterminate/warning/error fields, rollback fields, protected mismatches, and before/after counts.

No purchase, inventory, receipt, order, daily hours, total history, pump, maintenance, layout, trash, local backup, or cutting-file cache is changed. No cached file is imported or linked. CFR transfers remain disabled, rules remain undeployed, and no individual cloud job/file document is created.

## Browser/Vercel boundary

Browser testing must validate a real copy of the absent workbook, XLSX deflate support, backup download UX, admin table usability, baseline gating, and a mocked/non-production save. A real production import requires a separately reviewed preview and operator action; this implementation did not execute one.

## CJI-01A real-workbook compatibility correction

The local parser is now version 1.1.0. It matches OOXML elements by namespace-independent local name, resolves arbitrary relationship IDs, normalizes absolute `/xl/...`, package-relative `xl/...`, and workbook-relative `worksheets/...` targets, and supports shared, inline, `t="str"`, numeric, blank, and entity-encoded cells. When both supported sheets exist it always chooses `Cutting Jobs`; `Blank Import Template` is fallback-only. It searches the first 25 non-empty rows for a header containing at least `import_event_id`, `record_status`, and `job_name`, retains the physical worksheet row number as `__sourceRowNumber`, and parses only following nonblank rows. Errors distinguish malformed ZIP/workbook, missing allowed sheet, unresolved relationship, and missing importer header.

The typed phrase was removed. The admin UI now uses the checkbox **“I reviewed the preview and want to import all ready rows.”** It enables import only after a successful preview has at least one ready row and no import is active. It is cleared on file selection, every preview attempt/failure, and import completion. The final browser dialog states total/active/completed append counts; cancel returns before mutation, backup, or save. This is an operator interlock only; all final revalidation and persistence safety checks remain authoritative.

The deterministic namespace-prefixed fixture mirrors the confirmed recovery workbook shape: six named sheets, arbitrary relationship IDs, absolute targets, empty shared strings, `t="str"` values, three presentation rows, row-4 headers, and data from row 5. The actual production workbook was still not executed or imported by this correction.

## CJI-01B normal Cutting Jobs entry point

The normal Cutting Jobs toolbar now includes **Import reviewed jobs** beside the Add Job controls. It opens the one existing importer as a viewport-bounded modal dialog labeled **Reviewed cutting-job import**; it does not create or reset a second importer. The visible Close button and Escape cancellation only close the dialog and return focus to the toolbar trigger. They do not parse, preview, back up, mutate, or save. Reopening retains the existing selected file/preview state and works through the same entry point without console or DOM commands. The dialog is attached to the document modal layer rather than the page's nested scroll content, so it opens immediately inside the visible viewport.

## CJI-01C Excel dates and optional historical details

Only the `start_date`, `due_date`, and `completed_date` worksheet columns convert numeric Excel serials. Conversion supports the 1900 system (including its conventional 1899-12-30 epoch) and the workbook `date1904` flag, discards time fractions, and uses `Date.UTC`/ISO output so browser timezone cannot shift the calendar day. Thus `46189.5` deterministically becomes `2026-06-16`. Text ISO dates remain unchanged; negative, excessive, or malformed serials remain raw and subsequently receive the normal exact invalid-date reason. Ordinary numeric columns are never date-converted.

Blank start/due dates are accepted because the current authoritative job records safely carry empty `startISO`/`dueISO`; no date is invented. Completed rows still require a real `completed_date`. Blank category/material values link nothing. A unique exact existing match links normally. A nonblank unmatched historical value now produces a visible nonblocking warning, leaves the operational `cat`/`material` blank, and remains preserved verbatim in `importProvenance`. Multiple exact matches remain unresolved, definitions are never created or substituted, and `review_status=needs_review` remains blocking.

## CJI-01D reviewed category and material definitions

Inspection confirmed that job categories are authoritative `jobFolders` entries shaped as `{id,name,parent,order}` (optional `color`), created by `addJobFolder()` with `genId`, root parent, and next order; jobs reference the folder ID in `cat`, and `snapshotState()`/`adoptState()` persist `jobFolders`. Material definitions are the existing New Cutting Job pricing settings in browser-local `job_material_pricing_v1`, shaped as `{wasteFactor,materials:[{name,density,pricePerLb}]}`; jobs reference the material display name. The normal UI's new-material constructor uses `density: 0.1` and `pricePerLb: 1`, so the importer reuses exactly those existing defaults rather than inventing a parallel schema. Material pricing definitions are not currently part of `app/state`; this task intentionally does not invent a second cloud material collection.

Preview remains non-mutating and now publishes a definition plan for ready rows only: normalized existing category/material links, unique missing definitions, and ambiguous blockers. Matching trims, collapses whitespace, and compares case-insensitively while preserving the first workbook spelling for creation and all original cells in provenance. Blank values stay blank. Final submission rebuilds the plan against current definitions, creates each missing definition once through the existing category/material shapes, verifies append-only definition changes, links jobs through `cat` and `material`, and reports created/reused IDs and before/after definition counts.

A nonblank project number is never replaced by category. Only a blank project with category exactly `ATM <digits>` derives those digits, emits a visible warning, and retains the original blank project/category cells in provenance. Definite failure restores jobs, categories, and material settings byte-for-byte (including removal of an originally absent local material-settings property); indeterminate save retains all potentially persisted/in-memory changes for refresh/read verification without retry.

## CJI-01E imported material calculations

The manual New Cutting Job inputs are `jobMaterial`, `jobMaterialThickness`, `jobMaterialLengthFt`, and `jobMaterialWidthFt`. Both that form and the importer now call the single pure `JobMaterialCalculator.calculate()` path. It applies the selected live definition's density and price per pound plus the live waste factor; UI persistence rounds the resulting weight and cost to the same two decimal places. Jobs retain `material`, `thickness`, `pathLength`, `pathWidth`, `materialWeight`, `materialCost`, and a `materialCostComplete` marker. Cost-incomplete imports are blocked rather than becoming a misleading zero.

Every preview reads `getLiveJobMaterialSettings()`, which reparses the current `job_material_pricing_v1` value (and the form's existing defaults when no saved override exists). Submission classifies the original rows again against the latest settings before backup or mutation. Material definitions are reuse-only: missing or ambiguous materials block and the importer never creates or overwrites one. The reviewed aliases are deliberately limited to A36 → A36 steel, Grade 50 → Grade 572-50 steel, 304/316 Stainless and Stainless → Stainless Steel, and Aluminum → Aluminum. RC50 has no alias and stays unresolved unless an exact live RC50 definition exists. Original material text remains unchanged in `importProvenance`.

`source_dimensions_raw` accepts two-dimensional feet/inch forms, decimals, and simple or mixed fractions. A unit on one side applies to the unitless other side; explicit `path_length_ft` or `path_width_ft` independently wins over its parsed counterpart. Unitless, malformed, one-dimensional, and out-of-bounds values receive deterministic blocking reasons. Preview displays raw/parsed dimensions, material resolution, density, price, waste, calculated weight/cost, completeness, and reasons without mutation. Project-number/category handling and all baseline, backup, confirmation, protected-state, awaited-save, rollback, and indeterminate-save safeguards remain unchanged.
