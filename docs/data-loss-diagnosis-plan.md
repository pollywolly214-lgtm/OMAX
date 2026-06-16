# DATA-01 Data Loss Diagnosis and Recovery/Fix Plan

Date: 2026-06-16

## Findings

This investigation was read-only with respect to Firebase/Firestore and localStorage. No production data export, migration, cleanup, compaction, delete, reset, or restore operation was run.

1. Production app state is stored at Firestore path `workspaces/github-prod/app/state`.
2. The app writes a whole state snapshot with `set(..., { merge:true })`. Top-level omitted fields are not deleted, but any included field with an empty/default array replaces the prior array.
3. There is a `syncMeta.rev` and `updatedBy`, but the save path does not perform a Firestore transaction or compare the remote revision before writing. It reads the remote document only to merge `totalHistory`, `dailyCutHours`, and `pumpEff`.
4. Two devices can still overwrite each other for most business fields because `tasksInterval`, `tasksAsReq`, `cuttingJobs`, `completedCuttingJobs`, `orderRequests`, `receiptTrackerWeeks`, `maintenanceTasksV2`, `maintenanceCalendarInstancesV2`, and `maintenanceOccurrencesV2` are not field-merged against the remote state during save.
5. The load path can choose a local backup over cloud if the local backup has a higher revision and passes a maintenance-history heuristic. If chosen, the app immediately calls `saveCloudNow()`, which can push the local backup to cloud.
6. The load path can also load a local backup when cloud state is absent/not meaningful and immediately push it to cloud.
7. Autosave can fire from `visibilitychange` and `pagehide`, and other UI paths call `saveCloudDebounced()` during rendering/normalization. Those saves are blocked only by `__recoveryInspectMode`, `__autosaveDisabled`, preview-readonly URL conditions, payload-size limits, and data-reduction heuristics.
8. Existing payload protection blocks saves above 975,000 bytes and warns earlier. It also intentionally truncates `totalHistory` to 500 and `dailyCutHours` to 365 entries during compaction. It strips embedded/file-like strings. It does not intentionally drop the named maintenance/purchase/cutting protected arrays wholesale, but a state near the limit could block saves and leave only local backup as the latest complete copy.
9. RPM/pump logs are more likely to survive because save logic explicitly merges `pumpEff` with remote data before writing, whereas other history arrays are not similarly merged.
10. Current symptoms are consistent with actual Firestore fields being overwritten by empty/default arrays, but a display/read adapter issue is still possible until the live Firestore document and both browser backups are exported and compared.

## Likely Root Cause

Ranked by likelihood:

1. **Stale or partial whole-state overwrite from a second computer.** A second device with empty/default arrays for history fields can save a full snapshot and overwrite those arrays in Firestore, because most fields are written as whole arrays with no revision transaction.
2. **Local backup promoted to cloud.** A browser with a higher-revision but stale/blank `omax_local_state_backup_v1` can be selected during load and immediately pushed to Firestore.
3. **Startup/render-triggered autosave after adopting partial/default state.** Several code paths can call save soon after load/render. If the app adopted a state with missing histories or default arrays, that state can be persisted.
4. **Payload-size/localStorage fallback effects.** Save compaction truncates `totalHistory` and `dailyCutHours`; local backup fallback can reduce backup contents if localStorage quota is hit. This is less likely to selectively preserve settings and RPM while removing all listed histories, but it is a contributing risk.
5. **Render/read mismatch.** The calendar now reads both legacy task history and V2 maintenance arrays. If Firestore still contains data under different fields, the UI may be blank even though recoverable data remains.

## Evidence from Code

- Workspace selection is hard-coded to `github-prod`, and auth setup assigns `FB.workspaceDoc` to `workspaces/<WORKSPACE_ID>` and `FB.workspaceRef` to the `app/state` subdocument.
- `snapshotState()` creates a full application snapshot that includes task lists, cutting jobs, completed jobs, purchases/order data, maintenance V2 arrays, settings, layouts, `appConfig`, `pumpEff`, and `syncMeta.rev`.
- `adoptState()` treats missing arrays as empty/default values: `totalHistory`, `cuttingJobs`, `completedCuttingJobs`, `receiptTrackerWeeks`, and V2 maintenance arrays become empty arrays when not present; task lists fall back to default task templates if missing or empty.
- `saveCloudInternal()` compacts the full snapshot, checks size, persists local backup, fetches remote data, merges only `totalHistory`, `dailyCutHours`, and `pumpEff`, then writes the whole snapshot with `{ merge:true }`.
- `saveCloudDebounced()` and `saveCloudNow()` set local pending-change flags and call the debounced internal save without a remote revision compare-and-swap.
- `loadFromCloud()` may choose `localStorage` backup over cloud if backup revision is higher and then immediately call `saveCloudNow()`.
- `loadFromCloud()` may load backup-only state and immediately call `saveCloudNow()` if cloud has no meaningful data.
- The realtime listener avoids adopting incoming cloud state while local edits are pending, but this is not a write-conflict guard.
- `compactStateForStorage()` truncates `totalHistory` and `dailyCutHours` and strips heavy embedded content; it does not intentionally delete the protected business arrays.
- Save logs, if available, are written under `workspaces/github-prod/app/saveLogs/entries`.

## Fields At Risk

High risk under current save model:

- `tasksInterval`, including `completedDates`, `manualHistory`, `removedOccurrences`, `occurrenceNotes`, and `occurrenceHours` inside tasks.
- `tasksAsReq`, including manual/completion history fields.
- `cuttingJobs`, `completedCuttingJobs`, and job `manualLogs`.
- `maintenanceTasksV2`, `maintenanceCalendarInstancesV2`, `maintenanceOccurrencesV2`.
- `orderRequests` and `receiptTrackerWeeks`.
- `garnetCleanings`, `inventory`, `inventoryFolders`, `inventoryMaterials`, and settings/category folders.

Lower risk / better protected:

- `pumpEff`, because it is remote-merged before save.
- `totalHistory` and `dailyCutHours`, because they are remote-merged before save, though they are also truncated by compaction.

## Immediate User Safety Steps

1. Stop using the app on all computers until exports are captured.
2. Do not clear browser data, localStorage, cache, or cookies on either computer.
3. Do not click reset/clear/cleanup/restore buttons.
4. On both computers, keep the current browser profile intact and avoid hard refresh if possible.
5. Before reopening the app normally, open it with a proposed read-only/recovery mode flag or disable network/write access if possible.
6. Export the current Firestore document and both computers' `localStorage` backups before attempting any restoration.
7. Check both production and Vercel preview URLs. Confirm they use the intended Firebase project and `workspaces/github-prod/app/state` path.

## Recovery Plan

1. Export current Firestore state from `workspaces/github-prod/app/state` as JSON.
2. Export the legacy/root workspace document `workspaces/github-prod` to check whether useful pre-migration data remains.
3. Export save logs from `workspaces/github-prod/app/saveLogs/entries`, if readable, to identify when field counts dropped.
4. On each computer/browser profile, export `localStorage.getItem("omax_local_state_backup_v1")` without deleting or modifying it.
5. Also export local keys related to job file cache and layouts, especially `cutting_job_files_v1`, dashboard/cost/job layout keys, and any relevant app backup keys.
6. Compare cloud and local backups by top-level field presence, array lengths, nested history counts, byte sizes, and `syncMeta.rev`/`updatedAtISO`/`updatedBy`.
7. Identify the best source for each missing field. Do not assume one backup is globally best.
8. Prepare a restoration JSON that only patches missing protected fields after preserving current cloud state.
9. Restore only after a manual review of the diff and after saving an immutable pre-restore export.
10. After restore, keep autosave disabled until conflict guards and diagnostics are deployed.

## Code Fix Plan

1. Add read-only diagnostics first: display/export Firestore state, local backup state, field sizes, array counts, nested maintenance history counts, purchase/cutting history counts, and save-log summaries.
2. Add a startup `cloudLoadComplete` / `initialAdoptComplete` gate so no autosave can run before the authoritative cloud state is fully loaded and validated.
3. Replace blind save with a transaction or compare-and-swap guard using `syncMeta.rev` / `updatedAtISO` / `updatedBy`; stale clients should warn and require manual merge instead of overwriting.
4. Preserve protected fields on save if a pending snapshot omits them or suddenly reduces counts beyond a confirmed user action.
5. Merge protected arrays by ID/date where possible, not only `totalHistory`, `dailyCutHours`, and `pumpEff`.
6. Add explicit multi-device conflict UI: show remote changed since load, offer reload/merge/export choices.
7. Add pre-save emergency export/backup for dangerous reductions.
8. Add a read-only recovery mode that disables `saveCloudDebounced()`, `saveCloudNow()`, pagehide saves, migration writes, seed writes, and local-backup promotion.
9. Delay any data model migration to split large logs into separate documents/collections until data is recovered and protected by exports/tests.

## Test Plan

1. Static search for all Firebase, Firestore, localStorage, autosave, backup, compaction, migration, sanitizer, and protected-field code paths.
2. Syntax-check inspected JavaScript files with `node --check`.
3. Add unit/simulation tests before code fixes:
   - Two clients start from different revisions; older client attempts save after newer client writes.
   - Partial snapshot missing protected arrays cannot delete remote arrays.
   - Empty/default arrays cannot overwrite non-empty remote protected arrays without an explicit confirmed delete action.
   - Local backup with higher revision cannot auto-push to cloud during normal load.
   - Autosave before cloud-load-complete is blocked.
   - Payload-size block preserves local export and does not write partial state.
   - `pumpEff` merge behavior remains intact.
