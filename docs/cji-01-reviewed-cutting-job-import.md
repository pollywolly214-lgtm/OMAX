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

The temporary admin section previews every row and exact reasons. Final submission re-runs validation and requires the reviewed checkbox plus a final browser confirmation. Controls lock during parsing/saving and the API rejects concurrency.

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
