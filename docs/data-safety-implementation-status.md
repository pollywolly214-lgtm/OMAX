# Data Safety Implementation Status

Date: 2026-06-17

## SAFE-03 — Hard Dangerous-Save Preflight Using Protected Field Registry

Status: implemented as the active dangerous-save blocker.

SAFE-03 upgrades the SAFE-02 registry and read-only integrity summaries into a hard save preflight before the main Firestore state write. It does not restore, delete, migrate, compact, reset, sanitize, restructure, or rewrite production data. It does not change Firestore paths, unlock writes, implement restore points, expand trash behavior, add backend trash, move local caches, or implement field-level restore.

## Files changed

- `js/core.js`
  - Added registry-driven dangerous-save preflight functions.
  - Wired the preflight into `saveCloudInternal` after the latest remote read and before `FB.docRef.set(snap, { merge:true })`.
  - Preserved the existing remote revision conflict guard and legacy compatibility diagnostics.
  - Added blocked-save diagnostics in `window.__lastDangerousSaveBlock`.
  - Added best-effort blocked-save metadata writes to the existing `saveLogs` subcollection; failed log writes do not bypass or break the blocker.
  - Added `window.runDataSafetyPreflightSelfCheck()` for in-memory developer self-checks.
  - Extended Recovery Mode diagnostics with last dangerous-save block details.
- `docs/data-safety-implementation-status.md`
  - Updated this status document for SAFE-03.
- `docs/data-safety-recovery-plan.md`
  - Added a SAFE-03 status pointer.

## Enforcement functions added or upgraded

- `detectDangerousIntegrityReduction(baseSummary, pendingSummary, options)`
  - Registry-driven comparison of protected field presence, shape, counts, nested counts, total protected counts, payload size, and registry coverage.
- `validateProtectedSavePreflight({ baselineState, pendingState, latestRemoteState, localBackupState, reason, revisionConflict, allowFirstRun })`
  - Builds pending and baseline integrity summaries, chooses the strongest available baseline, applies runtime gate checks, includes revision conflict status, and returns structured allow/block output.
- `chooseProtectedSaveBaseline({ baselineState, latestRemoteState, localBackupState, allowFirstRun })`
  - Baseline priority: latest remote state, loaded cloud state, local backup state, explicit first-run workspace.
- `rememberDangerousSaveBlock(preflight, context)`
  - Records `window.__lastDangerousSaveBlock`, logs diagnostics, shows a toast if available, and refreshes Recovery diagnostics.
- `writeBlockedSaveLog(preflight, context)`
  - Best-effort, non-blocking save-log metadata write for blocked saves only.
- `runDataSafetyPreflightSelfCheck()`
  - In-memory fixture checks only; no Firebase/localStorage writes.

## Protected save-blocker coverage

SAFE-03 blocker uses `PROTECTED_FIELD_REGISTRY` and covers all SAFE-02 required top-level protected fields:

- `cuttingJobs`
- `completedCuttingJobs`
- `cuttingJobDatabase`
- `tasksInterval`
- `tasksAsReq`
- `settingsFolders`
- `folders`
- `jobFolders`
- `inventory`
- `inventoryFolders`
- `inventoryMaterials`
- `inventoryTransactions`
- `receiptTrackerWeeks`
- `orderRequests`
- `weeklyCostReports`
- `dailyCutHours`
- `totalHistory`
- `pumpEff`
- `garnetCleanings`
- `appConfig`
- `dashboardLayout`
- `costLayout`
- `jobLayout`
- `maintenanceTasksV2`
- `maintenanceCalendarInstancesV2`
- `maintenanceOccurrencesV2`
- `oneDriveJobConfig`

SAFE-03 blocker also covers all SAFE-02 required nested protected histories:

- `cuttingJobs.manualLogs`
- `completedCuttingJobs.manualLogs`
- `tasksInterval.completedDates`
- `tasksInterval.manualHistory`
- `tasksInterval.occurrenceNotes`
- `tasksInterval.occurrenceHours`
- `tasksInterval.removedOccurrences`
- `tasksAsReq.completedDates`
- `tasksAsReq.manualHistory`
- `tasksAsReq.occurrenceNotes`
- `tasksAsReq.occurrenceHours`
- `tasksAsReq.removedOccurrences`

## Blocking thresholds and rules

The preflight blocks the main Firestore state write when any of these are detected:

- registry coverage is incomplete;
- pending integrity summary cannot be built;
- no trusted baseline exists while protected fields/data are present;
- Recovery Mode is active;
- local-backup-only mode is active;
- initial cloud load/adoption is incomplete;
- remote revision conflict is present;
- a protected field present in baseline is missing in pending;
- dangerous shape change from array/object to null/string/undefined/other primitive;
- protected count or nested-history count drops from nonzero to zero;
- protected count or nested-history count drops by 50% or more when baseline count is at least 3;
- total protected count drops by 50% or more when baseline total is at least 3;
- total payload size drops by 50% or more while baseline protected count is nonzero.

Allowed normal saves include count increases, same counts, and small changes below thresholds when a trusted baseline is available. Brand-new workspace saves are allowed only when the latest remote document is absent and no loaded cloud/local backup baseline has meaningful data.

## Developer self-checks

`window.runDataSafetyPreflightSelfCheck()` runs these in-memory checks:

- same baseline/pending state allows;
- nonzero `completedCuttingJobs` to zero blocks;
- `tasksInterval.completedDates` to zero blocks;
- `cuttingJobs.manualLogs` to zero blocks;
- `inventory` to zero blocks;
- missing protected field after present blocks;
- protected array shape changed to string blocks;
- registry coverage is complete;
- synthetic missing registry coverage blocks.

## Still not implemented

- SAFE-04 durable backup-before-save.
- Firestore transaction/CAS save path.
- Daily restore points.
- Weekly desktop backup workflow.
- Frontend trash expansion.
- Backend trash bin.
- Field-level restore tooling.
- Migration of large backup/preview data out of localStorage.
- Browser/manual recovery workflow validation.

## Behavior confirmation

SAFE-03 changes save behavior only by blocking dangerous protected-data reductions before the main Firestore state write. It does not add destructive override UI and does not provide a save-anyway bypass. Existing revision guards remain in place and are also included in the registry preflight result.

## Previous SAFE-02 foundation retained

SAFE-02 added:

- `REQUIRED_PROTECTED_DATA_PATHS`
- `PROTECTED_FIELD_REGISTRY`
- `buildProtectedFieldIntegritySummary(state)`
- `buildDataIntegritySummary(state)`
- `compareIntegritySummaries(baseSummary, nextSummary)`
- registry coverage diagnostics and Recovery Mode read-only summaries.

## Next recommended step

SAFE-04 — Durable Backup-Before-Save.

Make cloud saves require a verified durable pre-save snapshot in IndexedDB/OPFS or equivalent before any main Firestore state write can proceed. Keep the SAFE-03 hard blocker in place.
