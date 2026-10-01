# REC-01R — reviewed recovery workbook contracts

Implemented locally on 2026-10-01. This extends the existing guarded reconciliation architecture. Recovery maintenance uses a new V2 path; the older JSON/CSV purchase-evidence tool is labeled as a legacy tool.

## Files and implementation

| File | Responsibility |
| --- | --- |
| `assets/vendor/cji-xlsx-parser.js` | Parameterized sheet headers/date/time columns; formula/error/duplicate-header rejection; existing cutting defaults retained |
| `js/recoveryWorkbook.js` (new) | Shared local XLSX adapters for the supplied recovery sheets |
| `js/maintenanceRecoveryImport.js` (new) | Exact task/checklist preflight, native completed one-time lifecycle staging, selective rollback, shared pure lifecycle constructor |
| `js/historicalImport.js` | Reused purchase/RPM reconciliation, new pump-hour destination, maintenance integration, existing backup/CAS/read-back protections |
| `js/historicalImportUi.js` | Workbook selection, per-row classification, separate task preflight, Import Gate display, operator confirmation and result IDs/counts |
| `js/core.js` | Occurrence cost snapshots in compatibility reporting; preserve pump-hour identity/provenance in normal save merge; remove 500-row total-history trim |
| `js/calendar.js` | Shared native lifecycle constructor; distinct imported identities remain distinct calendar events |
| `js/renderers.js` | Calendar-only events participate in actual-cost totals/trends without Settings links; fix undeclared native V2 reuse flags; label legacy tool |
| `index.html` | Load new local modules before their consumers |
| `tests/fixtures/recovery-workbooks.js` (new), `tests/recovery-import.test.js` (new) | Compressed OOXML contract fixtures and recovery safety/reporting tests |
| `docs/historical-import-readiness.md`, this document | Updated contracts and validation record |

No cutting-job business logic, Firebase configuration or rules were changed.

## Operator workflow and safety

1. Create reusable tasks separately through normal Maintenance Settings. Verify each checklist task name exists exactly once and check its type, part, cost, labor default and category.
2. In Settings, use **Reviewed recovery workbook import** for purchase, maintenance, RPM or pump hours. Use the existing **Cutting Jobs** importer for cutting history. Import the two pump sheets separately against fresh previews.
3. Preview every row without mutation. Only **Missing — Import** rows may append. Review/problem rows are excluded; existing permanent identities are no-ops. Maintenance checklist failures block all maintenance events. Explicitly review the displayed Import Gate reference.
4. Confirm the reviewed plan. Submission re-reads the authoritative server baseline, checks revision and exact local/cloud business state, initiates an exact downloadable backup, rechecks local state, stages approved additions, awaits the shared atomic CAS save and reads the server again.
5. Retain the downloaded backup and result IDs/counts. Success requires exact destination arrays, every intended identity once and unchanged unrelated protected fields.

The browser confirms download initiation; the operator must retain the actual file. Definite rejection selectively removes only uniquely identifiable unchanged records introduced by this operation from the latest local state. Unrelated concurrent edits survive. Changed/ambiguous records or later references to introduced maintenance records prevent deletion and suspend writes. Indeterminate results, thrown saves without a definite outcome and committed read-back failures suspend writes without retry or rollback. Existing transaction/CAS, payload-size, content-firewall, identity/FK and protected-state guards remain authoritative.

## Local XLSX infrastructure

The pinned dependency-free parser is local; no CDN/package dependency was added. Exact worksheet names and required headers are checked. Headers are case-insensitive and may follow a title within the first 25 nonempty rows. Additional columns and physical row numbers remain in source provenance. Plain numeric cells adapt without rounding; currency/unit text and malformed values remain review problems. Real Excel date serials map to YYYY-MM-DD; exact time fractions can map to HH:MM without rounding seconds. Duplicate headers, formulas and spreadsheet error cells block parsing: provide a reviewed values-only copy. JSON compatibility remains available with numeric JSON values.

The actual workbooks were described but not supplied. Tests generate compressed OOXML fixtures with the supplied sheet names/columns; actual-file compatibility still requires operator validation.

## Purchase_History_Import.xlsx

Sheet **Purchases** requires `import_event_id`, `source_id`, `source_record_id`, `date`, `purchased`, `qty`, `cost`, `partNumber`, `shipping`, `tax`.

Kind `purchase` reuses existing purchase reconciliation into ISO-week `receiptTrackerWeeks[].rows`. Quantity must be positive; unit cost, shipping and tax must be nonnegative finite numbers. Existing allocated line shipping/tax pass through exactly. Purchases restore history only; inventory quantities and transactions are protected and never replayed. Similar dated descriptions require review. Repeated permanent IDs or source tuples block every affected source row. `needs_review` blocks. Permanent IDs cannot overwrite existing records; discrepancies in original content remain review-required.

## Maintenance_Import_v2.xlsx

All three sheets are required by the adapter:

- **Task Creation Checklist**: `task_setup_id`, `task_name`, `task_type`, `part_number`, `parts_cost`, `default_labor_minutes`, `category`, `setup_status`, `setup_notes`, `verified_in_site`.
- **Maintenance Events**: `import_event_id`, `event_date`, `route`, `event_name`, `exact_existing_task`, `calendar_mode`, `mark_completed`, `labor_minutes`, `parts_cost_snapshot`, `part_number_snapshot`, `source_kind`, `source_page`, `source_line`, `source_text`, `review_status`, `review_notes`.
- **Import Gate**: its column schema was not supplied. Rows are displayed for operator review, never treated as automatic authorization. Its first nonempty row is interpreted as a header. Confirm its conditions manually.

Checklist preflight reports **Found exactly once**, **Missing**, **Ambiguous / duplicate**, or **Checklist row still needs review**. It matches exact saved Settings names, excluding calendar instances using native variant/template-reference semantics. Setup IDs must be unique and nonempty, `setup_status` cannot be `needs_review`, and `verified_in_site` must be true/1/yes (case-insensitive). This verifies existence and operator verification; configuration values must be checked separately in Settings. No checklist row writes state or creates a task.

Only `existing_task` and `calendar_only` routes exist. Every event requires a real non-future date, name, unique permanent identity, `calendar_mode=one_time`, `mark_completed=true` and no `needs_review`. XLSX true/1 values map to boolean true; JSON must already contain boolean true.

| Route | Native representation |
| --- | --- |
| `existing_task` | Exactly one saved Settings task by unchanged name. Reuse its V2 descriptor or add one internal bridge linked by `legacyTaskId`. Multiple historical events reuse one bridge. Saved task recurrence, interval and defaults are unchanged. |
| `calendar_only` | No saved-task reference. Create a native calendar descriptor marked `reusable:false`, `variant:"instance"`, with no legacy task. It never appears in Maintenance Settings. |

Internal descriptors live in `maintenanceTasksV2` because the native identity/FK gate requires instances/events to reference a V2 task. They are distinct from reusable Settings definitions in `tasksInterval`/`tasksAsReq`. Calendar-only costs never require fake reusable Settings tasks. Existing descriptors are immutable during recovery.

Each event adds exactly one `maintenanceCalendarInstancesV2` record with `instanceMode:"one_time"`, `repeatRule:null`, plus scheduled and completed `maintenanceOccurrencesV2` records. The completed event links to its scheduled base through `rootOccurrenceId` and `supersedesEventId`. Its permanent `import_event_id` occurs exactly once on the completed event; related records use `recoveryImportId` for ownership. The pure lifecycle constructor is shared with native `appendV2OccurrenceEvent`, permitting staged recovery without per-event autosaves. Native resolution displays completed work rather than overdue reminders. Distinct identities remain distinct calendar events even when linked to the same task/date.

No repeat rules, intervals, anchors, repeat chains or future projected occurrences are created. No bulk legacy migration runs. Read-back compares all three V2 arrays exactly and unchanged Settings/unrelated protected state. Results report internal descriptors, instances and scheduled/completed events added, with zero reusable Settings tasks, repeat chains and future projections added.

Supplied labor minutes are authoritative, including exact 5/10-minute values and zero; hours equal minutes/60 without quarter-hour rounding. A blank existing-task duration uses a reliable finite nonnegative numeric saved `downtimeHours`. Missing/unreliable defaults or calendar-only blank duration block for review. Labor dollars use normal reporting logic, currently $30/hour. Parts costs are separate: completed occurrence `partsCostSnapshot` takes precedence over descriptor cost, including zero. Blank existing-task parts may use saved numeric price; blank calendar-only parts remain absent and report zero. Part-number snapshots and the complete source row survive. Calendar-only costs participate in central actual totals and date trends without Settings links.

The normal Dashboard V2 helper's two undeclared reuse flags were fixed and tested, so creating a new one-time reminder no longer throws after partially staging records.

## Cutting_Jobs_Import.xlsx

Sheet **Cutting Jobs** retains the existing `CuttingJobImporter.FIELDS` contract:

`import_event_id`, `record_status`, `job_name`, `project_number`, `actual_cut_minutes`, `estimate_hours`, `add_minutes`, `priority`, `charge_rate_per_hr`, `cost_rate_per_hr`, `start_date`, `due_date`, `completed_date`, `category`, `material`, `thickness_raw`, `thickness_inches`, `path_length_ft`, `path_width_ft`, `material_cost`, `material_weight_lb`, `source_dimensions_raw`, `cut_sequence`, `review_status`, `review_notes`, `source_file`, `source_text`.

Completed rows go to `completedCuttingJobs`; actual minutes become `actualHours` and completed `manualLogs`, separate from `estimateHours`. Existing material/category/dimension reconciliation, IDs, protected checks, backup/CAS, rollback and verification remain. `needs_review` blocks and no attachments are created. The compatibility fixture exercises all supplied columns using the existing parser/preview/mapper.

## Pump_History_Import.xlsx

**RPM History** requires `import_event_id`, `source_id`, `source_record_id`, `date`, `rpm`, `timeISO`, `time_source`. Source/review columns are retained. Kind `pump` reuses `pumpEff.entries` reconciliation without changing baseline or notes. Every same-day collision needs review; one-reading-per-day behavior remains. `needs_review` blocks. `unknown_source_time_placeholder_noon` requires 12:00 and preserves `timeSource` plus `sourceTimeKnown:false` in provenance. Preview identifies noon as a storage placeholder, never an observed source time.

**Pump Hours** requires `import_event_id`, `source_id`, `source_record_id`, `date`, `hours`. Kind `pump_hours` appends `dateISO`/`hours` to `totalHistory` with identity/provenance and chronological sorting. Hours must be finite and nonnegative. Existing same-date totals (same or different values) and competing same-date source totals need review. Repeated source tuples block even when event IDs differ. No records are replaced. Identity and source evidence survive normal save merging. The former 500-row trim was removed to preserve append-only history; existing size gates still block oversized saves.

## Verification and remaining operator work

`Test-Path package.json` returned False. No npm/build/lint/type-check commands were invented. Exact executed validation commands and outcomes follow in the final validation record.

The first new-test run had one assertion failure referring to nonexistent `job.hours`; the actual field is `job.estimateHours`. The initial broad suite had the same failure. Correcting that assertion did not change cutting import behavior.

Browser/manual workflows, actual workbook files and authenticated Firebase/Storage integration were not tested. Operators must finish separate task setup, confirm checklist configuration and Import Gate conditions, resolve held source rows/current-state matches, retain backups and perform a local devsafe browser workflow before real recovery.

No production Firebase data was read or written. Firebase/Storage rules were neither edited nor deployed. No production import, backup restoration or bulk maintenance migration occurred.

## Final executed validation commands

All final commands exited 0. Syntax checks were executed with this exact PowerShell command:

```powershell
$recCheckFiles = @('assets/vendor/cji-xlsx-parser.js','js/recoveryWorkbook.js','js/maintenanceRecoveryImport.js','js/historicalImport.js','js/historicalImportUi.js','js/core.js','js/calendar.js','js/renderers.js','js/cuttingJobImporter.js','tests/fixtures/recovery-workbooks.js','tests/recovery-import.test.js'); foreach ($recCheckFile in $recCheckFiles) { node --check $recCheckFile; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; Write-Output "PASS node --check $recCheckFile" }
```

Result: all 11 JavaScript syntax checks passed. `js/cuttingJobImporter.js` was checked as a related unchanged implementation.

```text
node --test tests/recovery-import.test.js tests/historical-import-readiness.test.js tests/import-selective-rollback.test.js tests/cutting-job-import.test.js tests/maintenance-history-import.test.js
```

Result: **54 passed, 0 failed, 0 skipped**. Includes 23 new recovery tests. The older cutting and maintenance files also execute internal assertions, so Node runner totals do not enumerate every assertion.

```text
node --test tests/*.test.js
```

Result: **180 passed, 0 failed, 0 skipped**.

```text
git diff --check
```

Result: passed; Git reported only existing Windows LF-to-CRLF conversion notices.

Earlier executed validation runs:

- `node --check js/historicalImport.js`, `node --check js/maintenanceRecoveryImport.js`, `node --check js/recoveryWorkbook.js`, `node --check assets/vendor/cji-xlsx-parser.js`, `node --check js/historicalImportUi.js`: each passed before the final syntax sweep.
- `node --test tests/historical-import-readiness.test.js tests/import-selective-rollback.test.js tests/cutting-job-import.test.js tests/maintenance-history-import.test.js`: 31 passed, 0 failed/skipped.
- `node --test tests/recovery-import.test.js`: first run 18 passed / 1 failed (wrong test field); corrected run 19 passed; expanded runs 21 passed and then 22 passed, with no failures/skips.
- `node --test tests/*.test.js`: initial run 175 passed / 1 failed (same wrong test field); final run above passed all 180 after the assertion correction and added coverage.
