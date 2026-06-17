# SAFE-01 Data Safety Architecture Audit and Recovery System Plan

Date: 2026-06-17  
Scope: audit/planning only. No production data was restored, deleted, migrated, compacted, reset, sanitized, or restructured by this change.

## Executive Summary

OMAX currently stores business state mostly as one Firestore state document plus several local browser caches for backups, layouts, OneDrive/reference-folder settings, and legacy fallbacks. The highest-risk architecture pattern is that many UI handlers mutate global arrays/objects and then call a whole-state cloud save. Several recovery guards already exist, including protected-field reduction checks, revision metadata, recovery-mode save blocking, and a local backup attempt, but these guards are incomplete because local backup success is not a hard precondition for cloud writes, protected field coverage is partial, localStorage is still used for important backups/caches, and some seed/adoption/legacy hydration paths can synthesize defaults or partial state.

The recommended recovery system is a layered set of safety walls: a central protected field registry, count/checksum integrity summaries, backup-before-save enforcement, Firestore CAS/revision checks, daily restore points, weekly desktop exports, frontend/backend trash bins, mass-loss auto recovery mode, field-level restore tooling, and moving large state/caches out of localStorage.

## Files Inspected

- `index.html`: Firebase SDK and project config.
- `js/core.js`: Firebase initialization, state adoption, snapshot/save/load, recovery diagnostics, protected-field summary, dangerous save checks, local backup, clear-all path, legacy migration, deleted-item trash logic.
- `js/renderers.js`: UI render/mutation handlers for cutting jobs, cost/dashboard/job layouts, OneDrive/reference-folder storage, IndexedDB directory handles, legacy task hydration, inventory/order/receipt/history flows, deleted-items rendering.
- `js/calendar.js`: maintenance recurrence/task restoration helper paths.
- `js/pump.js`: pump efficiency/history mutation paths.
- `js/opportunity.js`: opportunity rollup cloud-save wrapper and appSetting localStorage paths.
- `js/onedrive/onedriveLibrary.js`: OneDrive library localStorage cache.
- `js/auth/msalClient.js`: MSAL cache in localStorage.
- `js/router.js`: render-cache localStorage cleanup.
- `style.css`: presence of deleted-items/inventory/cost UI classes only; no data-path logic.
- Existing docs under `docs/`, especially data-loss and maintenance audit docs, for context only.

## 1. Current Data Storage Map

### Firestore project/path assumptions

- Firebase SDKs are loaded from Google CDN in `index.html`.
- Firebase config identifies project `omax-maintenance`, auth domain `omax-maintenance.firebaseapp.com`, storage bucket `omax-maintenance.firebasestorage.app`, and related app IDs.
- The active application code initializes Firebase Auth and Firestore in `js/core.js`.
- `WORKSPACE_ID` is used to derive Firestore paths; current diagnostics format assumes `workspaces/{WORKSPACE_ID}/app/state`.

### Main state document path

- Active state document: `workspaces/{WORKSPACE_ID}/app/state` via `FB.docRef`.
- `FB.workspaceDoc` appears to reference `workspaces/{WORKSPACE_ID}` metadata/legacy document.
- `FB.workspaceRef`/`FB.docRef` are set during auth/workspace setup.

### Save logs path

- Save logs are written to `workspaces/{WORKSPACE_ID}/app/saveLogs/entries` through `FB.workspaceDoc.collection("app").doc("saveLogs").collection("entries").add(...)`.
- The log currently records save metadata such as timestamp, status, size, and workspace ID; it is not a full backup.

### Firestore subcollection/metadata paths

- `workspaces/{WORKSPACE_ID}`: workspace metadata/legacy document; migration reads meaningful old data and writes to `app/state`.
- `workspaces/{WORKSPACE_ID}/app/state`: main app state.
- `workspaces/{WORKSPACE_ID}/app/saveLogs/entries`: save-event log.
- No evidence in the audited code of protected business records being stored as dedicated field-level Firestore subcollections yet.

### localStorage keys

Known keys and purpose:

- `omax_local_state_backup_v1`: current local backup snapshot.
- `omax_local_state_backup_v0`: legacy backup/cache key removed during emergency backup retry.
- `cloud_sync_client_id_v1`: client identity used in sync metadata.
- `cutting_job_onedrive_config_v1`: OneDrive/reference-folder configuration.
- `cutting_job_onedrive_library_v1` or equivalent constant: OneDrive linked-file library.
- `cutting_job_onedrive_preview_cache_v1` or equivalent constant: preview cache, intentionally local.
- `cutting_job_current_profile_local`: selected local computer/profile ID.
- `job_onedrive_device_id` or equivalent constant: local device ID for reference-folder metadata.
- `dashboard_layout_windows_v1`: dashboard layout fallback/local cache.
- `cost_layout_windows_v1`: cost layout fallback/local cache.
- `job_layout_windows_v1`: job layout fallback/local cache.
- `omax_tasks_interval_v6`: legacy interval-task fallback.
- `omax_tasks_asreq_v6`: legacy as-required-task fallback.
- `omax_debug_cache`, `omax_sync_cache`, `omax_render_cache`, `_omax_last_render_cache`: debug/render/cache keys.
- `appSetting_{key}`: opportunity/settings wrapper cache.
- tolerance table keys in `js/renderers.js` storage helper.
- cost history suppression keys in `js/renderers.js` storage helper.
- MSAL auth cache uses `localStorage` through `js/auth/msalClient.js`.
- `omax_onedrive_library_cache` or equivalent `CACHE_KEY` in `js/onedrive/onedriveLibrary.js`.

Risk note: localStorage has a small browser quota and synchronous failure mode. It must not remain the only pre-save backup layer for large state.

### IndexedDB database/store names

- `JOB_ONEDRIVE_LOCAL_ROOT_DB`: stores File System Access API directory handles.
- `JOB_ONEDRIVE_LOCAL_ROOT_STORE`: object store for the root handle.
- Keys include the default root key and `profile:{profileId}` for profile-specific handles.
- Stored values are browser `FileSystemDirectoryHandle` objects, not business records.

### Browser file-system handles

- The WJ Cuts/reference-folder root is selected through File System Access API and persisted in IndexedDB.
- A `.wj-cuts-root.json` marker file is read/written inside the selected root folder to identify the reference folder.
- Job file references saved to Firestore are sanitized metadata only: name, type, size, relative path, root/device/profile IDs, and timestamps. Large file/base64 content should not be stored in state.

### OneDrive/reference-folder storage

- OneDrive job config and library are mirrored in localStorage and `window.oneDriveJobConfig` / `window.oneDriveJobLibrary`.
- OneDrive linked-file entries store metadata/URLs/eTags, not raw file contents.
- MSAL auth token cache is localStorage-based.

### GitHub/static-file assumptions

- This repo is a static site: HTML/CSS/JS with Firebase.
- No server-side API or build pipeline is required.
- `vercel.json` must remain exactly `{ "cleanUrls": true }`.

## 2. Protected Field Registry Draft

Validation rules should be implemented centrally as code, not scattered through renderers. `dangerous drop` means a save or restore would reduce counts by the thresholds below without an explicit recovery workflow and verified backup.

| Field | Type/shape | Created | Edited | Deleted | Rendered/read | Count/validate | Dangerous drop |
|---|---|---|---|---|---|---|---|
| `cuttingJobs` | array of active cutting job objects; may include `manualLogs`, material/cost/file metadata | job creation/edit UI in `js/renderers.js`; legacy `Reference for task 1` confirms shape | job board/table/edit forms, manual logs, file/reference actions | job completion/removal handlers | cutting jobs views, dashboard/cost widgets | array length; IDs; sum `manualLogs.length`; bytes; required job identity | non-empty to empty; >50% length drop; manual logs drop |
| `completedCuttingJobs` | array of completed job objects | completion action from cutting jobs | history edits, cost/report adapters | clear/delete/history actions | job history, cost reports | length; IDs; manual logs; completed dates | any unexplained decrease should be suspicious |
| `cuttingJobDatabase` | array/object historical database if present | job database/import/history code | job database UI | delete/database cleanup if any | job database/history views | count object keys/array length | missing after present; large key/length drop |
| `tasksInterval` | array of interval maintenance task templates/instances | defaults, Settings maintenance UI, legacy hydration | maintenance settings/calendar completion | task delete, inventory-linked task delete | settings, calendar, dashboard | length; IDs; nested `completedDates`, `manualHistory`, notes/hours/removals | non-empty to empty; >50% length/history drop |
| `tasksAsReq` | array of as-required maintenance tasks | defaults, Settings maintenance UI, legacy hydration | settings/calendar | task delete | settings, calendar | length; IDs; nested histories | non-empty to empty; >50% drop |
| `settingsFolders` | array of settings folder metadata | settings folder UI/defaults | rename/move | folder delete | settings navigation | length; IDs; parent graph | missing/non-empty to empty |
| `folders` | generic folder array | folder UI/import/adoption | rename/move | folder delete | settings/jobs where used | length; IDs | missing/non-empty to empty |
| `jobFolders` | array of job folder metadata | job settings/defaults | rename/move | folder delete | job views | length; IDs | missing/non-empty to empty |
| `inventory` | array of inventory items | inventory add/import/order link repair | quantity edits, order receipt, maintenance link | inventory delete | inventory, orders, maintenance | length; IDs; sum quantities; link counts | non-empty to empty; >50% drop |
| `inventoryFolders` | array folder metadata | inventory folder UI | rename/reparent | folder delete moves contained items to root | inventory tree | length; IDs; orphan count | missing/non-empty to empty |
| `inventoryMaterials` | material matrix/object/array | material settings UI | material grid edit mode | row/column delete | inventory material grid | material type/column counts | large row/column drop |
| `inventoryTransactions` | array of inventory/order transaction logs | order receipt/inventory adjustments | append-only adjustments | no normal delete expected | data center/order reports | length; monotonic append; IDs/timestamps | any decrease without recovery |
| `receiptTrackerWeeks` | array weekly receipt tracker objects | receipt modal/week save | receipt rows/status | week/row delete if present | receipt tracker/cost dashboard | week count; row counts | any unexplained decrease |
| `orderRequests` | array of purchase/order request objects with line items | order request UI | approval/status/item edits, inventory link repair | item/request delete | order UI, data center | request count; total line items; statuses | non-empty to empty; >50% request/line drop |
| `weeklyCostReports` | array/object weekly reports | cost dashboard/report generator | report edits/suppression | cleanup if present | cost dashboard/data center | report count; week keys | large week drop |
| `dailyCutHours` | array daily cut-hour entries | cutting hours UI/import | daily edit | clear/reset if present | dashboards/cost | day count; date uniqueness | drop of recent history or >50% |
| `totalHistory` | array machine-hour history `{dateISO,hours}` | hour log/reset current | hour entry edits | clear-all/reset | maintenance/dashboard | length; monotonic-ish date/hour sanity | non-empty to empty; truncation beyond retention policy |
| `pumpEff` | array/object pump efficiency logs/notes | pump UI | pump log/note edits | pump log/note delete | pump widget | entries/notes counts | non-empty to empty; note/history drop |
| `garnetCleanings` | array cleaning history | garnet/maintenance UI | append/edit | delete if present | dashboard/maintenance | length/date count | non-empty to empty |
| `appConfig` | object app configuration | defaults/settings | settings controls | reset/clear all | global app behavior | key count/schema/version | object key drop/missing |
| `dashboardLayout` | object/window layout | dashboard layout UI/localStorage/cloud | drag/resize/save | reset layout | dashboard | key/widget count | missing after customized |
| `costLayout` | object/window layout | cost layout UI/localStorage/cloud | drag/resize/save | reset layout | cost dashboard | key/widget count | missing after customized |
| `jobLayout` | object/window layout | job layout UI/localStorage/cloud | drag/resize/save | reset layout | jobs | key/widget count | missing after customized |
| `maintenanceTasksV2` | array V2 task records | V2 maintenance/calendar migration/UI | V2 maintenance UI | task delete | calendar/settings | length; IDs | non-empty to empty; >50% drop |
| `maintenanceCalendarInstancesV2` | array V2 instances | recurrence/calendar engine | calendar edits | occurrence delete/remove | calendar | instance count by date | any large date-window drop |
| `maintenanceOccurrencesV2` | array V2 occurrence history | completion/calendar actions | notes/hours/status | occurrence delete | calendar/history | occurrence count; completion count | any decrease without trash |
| `oneDriveJobConfig` | object config/profile/root settings | OneDrive/reference-folder settings | settings UI | reset/disconnect | job file UI/settings | key count; profile IDs | missing after configured |
| cutting job manual logs | nested arrays under active/completed jobs | job manual log UI | edit log entries | delete log | job detail/history | total manual log count | any unexplained decrease |
| maintenance `completedDates` | nested arrays under maintenance tasks | maintenance completion | completion edit | task delete/date delete | calendar/task views | total nested entries | any unexplained decrease |
| maintenance `manualHistory` | nested arrays under maintenance tasks | manual history UI | edit | task delete/history delete | maintenance history | total nested entries | any unexplained decrease |
| `occurrenceNotes` | nested maps/objects | calendar occurrence note UI | edit note | note delete/task delete | calendar occurrence UI | total note keys | any unexplained decrease |
| `occurrenceHours` | nested maps/objects | calendar occurrence hours UI | edit hours | delete/task delete | calendar occurrence UI | total hour keys | any unexplained decrease |
| `removedOccurrences` | nested arrays/maps | recurrence skip/remove occurrence | edit recurrence | restore/delete task | calendar recurrence adapter | total removed occurrence markers | any unexplained decrease |
| future user-entered business/history fields | unknown | any new feature | any new feature | any delete path | any renderer | registry must require owner/count/validator before release | missing registry entry blocks broad save |

## 3. Save Path Risk Map

| Save path | Trigger/event | Whole or partial | Remote revision check | Backup first | Startup/pagehide/adoption capable | Writes after failed local backup? | Risk |
|---|---|---|---|---|---|---|---|
| `saveCloudInternal` in `js/core.js` | debounced UI mutations, explicit `saveCloudNow` | whole-state `snapshotState()` then `FB.docRef.set(snap,{merge:true})` | yes, reads remote and compares `syncMeta.rev` to loaded rev | attempts `persistLocalStateBackup(snap)` before write | yes through pagehide/visibility handlers and many startup mutations | yes; local backup failure logs but does not hard block | High |
| `saveCloudDebounced` / `saveCloudNow` in `js/core.js` | common global save API | whole-state via internal save | delegated | delegated | yes | yes | High |
| `loadFromCloud` seeding path in `js/core.js` | cloud missing/no meaningful data | whole/merge seed write | sets loaded revision then writes seeded data | not clearly a backup-before-write path | startup/load/adoption | possible | Critical until guarded by explicit setup mode |
| `migrateLegacyWorkspaceDoc` in `js/core.js` | startup legacy migration | whole legacy state copied to `app/state` merge | no CAS-style transaction seen | no dedicated pre-migration backup | startup | possible | High |
| `clearAllAppData` path in `js/core.js` | user destructive reset | whole cleared `snapshotState()` set | only `canWriteCloud` guard | no durable pre-action restore point evident | manual UI | possible | Critical/destructive |
| `updateWorkspaceMetadata` in `js/core.js` | metadata updates/migration | partial metadata | not protected-state relevant | no | startup/migration | n/a | Medium because legacy doc may contain state confusion |
| `saveTasks` in renderers/calendar helpers | maintenance settings changes | usually mutates global arrays then cloud save | inherited from cloud save | inherited | user actions; legacy hydration may mutate | inherited | High |
| Inventory/order/receipt handlers in `js/renderers.js` | add/edit/delete inventory, orders, receipts | mutates global arrays then cloud save | inherited | inherited | user actions | inherited | High |
| Layout saves | drag/resize/reset layout | localStorage plus global/cloud state | inherited if cloud save called | inherited | user actions/startup local load | localStorage failures swallowed | Medium |
| OneDrive config/library saves | settings/reference-folder actions | localStorage metadata plus optional cloud state fields | no remote check for localStorage | no | user actions/startup | localStorage failures swallowed | Medium |
| Opportunity rollup `saveOpportunityRollups` | rollup generation | mutates rollup state then cloud save wrapper | inherited | inherited | computed job | inherited | Medium |
| Save logs write | after successful save | Firestore subcollection add | no | no | after save only | n/a | Low for data loss; useful diagnostics |

## 4. Delete/Reset/Migration Risk Map

| Path | Removes/changes | Confirmations | Trash bin | Pre-action backup | Risk |
|---|---|---|---|---|---|
| `deleteInventoryItem` in `js/renderers.js` | inventory item; optionally linked maintenance tasks; unlinks inventory IDs from tasks | modal confirmation; linked-task choice | records deleted inventory and linked tasks via `recordDeletedItem` when available | no durable restore point evident | High |
| Maintenance task delete paths in `js/renderers.js` | tasks, instances, nested completion history | confirmation paths present in UI code | deleted-items support for tasks exists | no durable restore point evident | High |
| Cutting job delete/complete/history paths | active/completed jobs and manual logs | UI confirmations vary by path | not fully verified for all job records | no durable restore point evident | High |
| Order request/item delete paths | purchase request lines/history | UI confirmation/logging varies | some `recordDeletedItem` calls for order items | no durable restore point evident | High |
| Inventory folder delete | removes folder records; moves contained items to root | confirmation expected | no folder trash verified | no durable restore point evident | Medium |
| Material grid row/column delete | material matrix rows/columns | edit-mode gates | no trash verified | undo stack limited to 20 local entries | Medium/High |
| Layout reset paths | dashboard/cost/job layouts | UI reset controls | no trash | localStorage/cloud may be overwritten | Medium |
| `clearAllAppData` in `js/core.js` | nearly all protected state reset to defaults/empty | likely manual but destructive | no comprehensive trash | no durable pre-action backup evident | Critical |
| `compactStateForStorage` / `sanitizeValueForStorage` | trims logs and can remove heavy strings; backup mode deletes `deletedItems`, `opportunityRollups`, `weeklyCostReports` | automatic | n/a | used as backup prep itself | High because protected registry currently omits some requested fields |
| `safeCleanupLoadedState` | deletes debug/sync snapshots; sanitizes cutting job fields | automatic on load path | n/a | none | Medium |
| `migrateLegacyWorkspaceDoc` | copies legacy workspace doc to state doc and updates metadata | automatic startup migration | no | no | High |
| Legacy task hydration in `js/renderers.js` | may fill empty task arrays from Firestore/localStorage/defaults | automatic startup | n/a | no | Medium because defaults can hide missing data |
| Seed/default state adoption in `loadFromCloud` | can adopt seeded defaults and write them to cloud | automatic startup when cloud missing/unmeaningful | no | no durable backup | Critical |

## 5. Partial/Default/Empty State Overwrite Findings

1. Whole-state saves are still the dominant pattern. If in-memory state is partial, `FB.docRef.set(snap,{merge:true})` can overwrite top-level fields with partial/empty arrays.
2. `adoptState` normalizes missing arrays to defaults/empty arrays. This is useful for rendering but dangerous if followed by a whole-state save without knowing whether the source was partial.
3. `loadFromCloud` has seed/default write branches. These must be blocked unless this is a confirmed first-run workspace.
4. Legacy task hydration in `js/renderers.js` can populate missing `tasksInterval`/`tasksAsReq` from old localStorage or defaults. If later saved as whole state, it can make a partial recovery look valid while other protected fields remain empty.
5. Render/read adapters often use `Array.isArray(x) ? x : []`, which can hide missing/malformed protected data and make the UI appear simply empty.
6. Backup compaction currently removes some histories/reports in backup mode. That is unacceptable for protected fields such as `weeklyCostReports` and any future business/history field.

## 6. localStorage Quota Failure Findings

- `persistLocalStateBackup` writes to localStorage, catches quota failures, then attempts emergency/tiny backups.
- The cloud save can continue after local backup failure because backup persistence does not return a required success/failure value.
- Several important caches/configs use localStorage and swallow write errors, including OneDrive config/library, layout state, preview caches, MSAL, app settings, and legacy task keys.
- localStorage cleanup during emergency backup removes cache keys, but this is reactive and not a durable backup strategy.
- Large preview/file caches should not compete with backups for localStorage quota. Move backup snapshots and large caches to IndexedDB or Origin Private File System where available.

## 7. Page/Component Mutation Map

| Area | Protected data mutated | Files/functions |
|---|---|---|
| Cutting Jobs / Job History | `cuttingJobs`, `completedCuttingJobs`, manual logs, job folders, file refs | `js/renderers.js` cutting/job sections; core snapshot/adoption |
| Maintenance Settings/Calendar | `tasksInterval`, `tasksAsReq`, V2 maintenance arrays, nested histories, occurrence notes/hours/removals | `js/renderers.js`, `js/calendar.js`, `js/core.js` |
| Inventory | `inventory`, `inventoryFolders`, `inventoryMaterials`, `inventoryTransactions` | `js/renderers.js` inventory functions |
| Purchase / Orders / Receipts | `orderRequests`, `receiptTrackerWeeks`, inventory links/transactions | `js/renderers.js` order/receipt sections |
| Cost Dashboard/Data Center | `weeklyCostReports`, layouts, suppressions/logs | `js/renderers.js` cost sections |
| Dashboard | `dashboardLayout`, rollups, daily/hour summaries | `js/renderers.js`, `js/opportunity.js` |
| Pump | `pumpEff` logs/notes | `js/pump.js` |
| Garnet / machine-hour history | `garnetCleanings`, `dailyCutHours`, `totalHistory` | `js/core.js`, `js/renderers.js`, related widgets |
| Settings / Recovery / Trash | `appConfig`, deleted items, diagnostics | `js/core.js`, `js/renderers.js` |
| OneDrive/reference folder | `oneDriveJobConfig`, file reference metadata; local handles | `js/renderers.js`, `js/onedrive/*`, `js/auth/*` |

## 8. Render/Read Adapters That Can Hide Existing Data

- Any `Array.isArray(field) ? field : []` adapter can mask malformed/missing data.
- `adoptState` and initialization helpers normalize absent fields to empty arrays/defaults, which is safe for rendering but unsafe for save eligibility.
- Legacy task hydration uses Firestore -> localStorage -> defaults. Defaults can make empty tasks look intentional.
- Inventory/material normalizers can generate IDs and normalized rows, which is useful but should be treated as mutation requiring save guards.
- Cost/job/dashboard layout readers fall back to localStorage/default layouts, which can mask missing cloud layout data.
- OneDrive config/library readers fall back to normalized empty values if localStorage is unavailable or parse fails.

## 9. Existing Recovery/Diagnostics/Guard Code

Current safety-related code includes:

- `PROTECTED_STATE_FIELDS` in `js/core.js`, but it is missing several required protected fields (`cuttingJobDatabase`, `jobFolders`, `inventoryTransactions`, `weeklyCostReports`, `folders`, `oneDriveJobConfig`, and explicit nested fields).
- `buildProtectedFieldSummary`, nested history counts, and `detectDangerousProtectedFieldReduction`.
- `detectRemoteRevisionConflict` using `syncMeta.rev` and loaded cloud revision.
- `persistLocalStateBackup`, emergency backup, and tiny critical backup paths.
- Recovery mode checks that block some saves/migrations.
- Recovery diagnostics panel/export functions.
- Save logs collection writes.
- Deleted-items/trash functions `recordDeletedItem`, `restoreDeletedItem`, and related UI.

These are a good start but should be converted into hard safety invariants instead of best-effort diagnostics.

## 10. Proposed Safety Walls

### Wall 1: Central protected field registry

Create a single `protectedFieldRegistry` with owner, path, type, counter, checksum, render locations, delete policy, trash policy, and minimum restore metadata for every protected top-level and nested field. New user-entered business/history fields must fail tests if not registered.

### Wall 2: Data integrity counts/checksums

For every snapshot, compute:

- top-level type, count/key count, byte size;
- stable ID set checksum;
- nested history counts/checksums;
- last-updated timestamp ranges where available.

Store integrity summaries in `syncMeta.integrity` and in restore points/save logs.

### Wall 3: Dangerous-save blocker

Block any save that would reduce protected counts beyond policy unless:

1. a verified pre-action backup exists,
2. the action carries an explicit destructive operation token,
3. the user confirmed the exact records/fields being removed,
4. the removed records are in frontend/backend trash or restore point.

### Wall 4: Remote revision/CAS guard

Replace read-then-set with a Firestore transaction or compare-and-set field update where possible:

- read current `syncMeta.rev`;
- verify it matches the loaded base revision;
- write rev+1 and integrity summary atomically;
- reject if remote changed.

### Wall 5: Backup-before-save snapshot

A cloud save must not proceed unless a durable pre-save snapshot succeeds. Prefer IndexedDB/OPFS for local pre-save snapshots. localStorage may be a last-resort metadata pointer only.

### Wall 6: Daily restore point

Create daily immutable restore points with full protected state and integrity summary, retained by policy. Store outside the main document, e.g. `workspaces/{id}/restorePoints/daily/{yyyy-mm-dd}` or export files.

### Wall 7: Weekly desktop export

Add guided weekly JSON export to a local file/desktop folder. The app should show last successful export date and warn if stale. Do not claim this exists until implemented.

### Wall 8: Pre-restore current-state backup

Before any restore, export/write a current-state backup so restore operations are reversible.

### Wall 9: Frontend trash bin

Expand `deletedItems` to cover all protected deletes, including folders, cutting jobs, order requests, material rows/columns, layouts, nested maintenance histories, occurrence notes/hours, and file reference metadata.

### Wall 10: Backend trash bin

Mirror deleted protected records to Firestore trash subcollections with integrity metadata before removing them from active state. Trash writes should be append-only and independent from the whole-state write.

### Wall 11: Mass-loss auto-detect recovery mode

On startup and before save, compare current/cloud/local summaries. If large loss is detected, enter read-only Recovery Mode automatically, block all cloud writes, and present restore/export instructions.

### Wall 12: Field-level restore instead of blind overwrite

Restore tooling should select fields/records and merge them into current state with conflict reporting. Avoid whole-document replacement except for an offline/admin-only last resort.

### Wall 13: localStorage quota prevention

Move large backups, preview caches, and restore points to IndexedDB/OPFS. Keep localStorage only for small settings/pointers/client IDs. Add quota diagnostics and warnings.

### Wall 14: Recovery tab under Settings gear

Create a Recovery tab with live diagnostics, exports, restore-point listing, trash views, and step-by-step instructions. Initial implementation should be read-only until backup/restore writes are fully guarded.

## 11. Implementation Sequence

### SAFE-02 — Registry and read-only diagnostics

- Add central protected-field registry module.
- Add counters/checksums for every protected field and nested history.
- Add tests for registry coverage.
- No save behavior changes except read-only diagnostics.

### SAFE-03 — Hard dangerous-save preflight

- Convert current dangerous-save checks to registry-driven validation.
- Include missing protected fields and nested histories.
- Block saves when pending snapshot is partial or integrity is unknown.
- Add explicit test fixtures for mass-loss scenarios.

### SAFE-04 — Durable backup-before-save

- Add IndexedDB/OPFS pre-save snapshot store.
- Make cloud save require verified backup success.
- Keep localStorage backup as optional fallback pointer only.
- Add quota diagnostics.

### SAFE-05 — Firestore CAS/revision transaction

- Replace whole-state read-then-set with transaction/CAS guard.
- Store rev+integrity atomically.
- Add conflict UI that blocks overwrite and links Recovery tab.

### SAFE-06 — Daily restore points and save logs v2

- Add immutable daily restore point path.
- Add integrity summary to save logs.
- Add retention policy but no deletion until explicitly reviewed.

### SAFE-07 — Frontend trash expansion

- Ensure every delete path records a restorable payload.
- Add trash coverage tests for inventory, maintenance, jobs, orders, folders, layouts, material rows/columns, and nested histories.

### SAFE-08 — Backend trash bin

- Write deleted protected records to Firestore trash subcollections before active-state mutation.
- Add backend trash restore metadata and tests.

### SAFE-09 — Recovery tab read-only UI

- Add Settings > Recovery tab with diagnostics, storage map, backup status, export buttons, and warnings.
- No destructive restore yet.

### SAFE-10 — Field-level restore tooling

- Implement restore from daily restore point/local export/backend trash by field/record.
- Always create pre-restore backup.
- Add conflict review UI.

### SAFE-11 — Weekly desktop backup guide/export

- Add weekly export workflow and status reminders.
- Add File System Access API support where available; fallback to JSON download.

### SAFE-12 — Move large local caches out of localStorage

- Migrate preview caches and large backup blobs to IndexedDB/OPFS.
- Leave localStorage compatibility readers but block new large writes.

### SAFE-13 — Seed/default/adoption hardening

- Separate render defaults from persisted state.
- Never seed/write defaults over a workspace with prior protected data unless setup wizard explicitly confirms a brand-new workspace.

### SAFE-14 — Manual recovery runbook validation

- Add manual test plan using copied/exported fixtures.
- Verify yesterday restore, deleted-record restore, mass-loss detection, local quota failure behavior, and revision conflict handling.

## 12. Recovery Tab Content Draft

### Current Storage Locations

- Cloud workspace: `workspaces/{WORKSPACE_ID}/app/state`.
- Save logs: `workspaces/{WORKSPACE_ID}/app/saveLogs/entries`.
- Local backup: browser durable backup store; legacy `omax_local_state_backup_v1` localStorage if present.
- File references: OneDrive/reference-folder metadata only; raw files remain in OneDrive/local WJ Cuts folder.
- Local folder handles: browser IndexedDB, device-specific.

### Backup Locations

- Current local pre-save snapshot store.
- Daily cloud restore points.
- Weekly desktop JSON exports.
- Backend trash subcollections.
- Frontend trash bin.

The UI must clearly label which backup systems are active versus planned/not configured.

### Daily Restore Points

- Show dates, protected counts, checksum, size, and created timestamp.
- Provide read-only preview first.
- Restore requires pre-restore backup and field selection.

### Weekly Desktop Backups

- Show last export date and file name.
- Button: `Export full protected data JSON`.
- Warning if older than 7 days.

### Trash Bin

- Tabs: Jobs, Maintenance, Inventory, Orders, Folders, Layouts, Other.
- Show deleted time, deleted by client/user, source path, record counts, and restore button.

### Auto Recovery

- Show whether mass-loss detection is active.
- Show current state vs cloud vs local counts.
- If mass loss is detected: block saves and show recovery choices.

### Manual Recovery Steps

1. Stop using the app on all other devices.
2. Do not refresh repeatedly or clear browser storage.
3. Export current cloud, current browser state, and local backup diagnostics.
4. Compare protected counts.
5. Restore individual fields/records from the best restore point.
6. Verify counts and render views before unlocking writes.

### How to restore yesterday

1. Open Settings > Recovery.
2. Select Daily Restore Points.
3. Preview yesterday's restore point.
4. Select affected fields/records only.
5. Create pre-restore backup.
6. Restore selected fields.
7. Verify dashboard/jobs/inventory/maintenance counts.
8. Unlock saves only after integrity checks pass.

### How to restore deleted records

1. Open Trash Bin.
2. Search by type/name/date.
3. Preview record payload and linked records.
4. Restore record and links.
5. Verify it appears in the relevant page.

### What to do if mass data loss is detected

- Stay in Recovery Mode.
- Do not click reset/clear/import unless instructed.
- Export diagnostics.
- Identify the newest backup with correct counts.
- Restore fields, not the whole document, unless instructed by an admin.

### What not to do during recovery

- Do not clear browser storage.
- Do not import unknown JSON over the whole app state.
- Do not force save from another device.
- Do not delete/compact/sanitize records.
- Do not reconnect a stale tab until recovery is complete.

## 13. Highest-Risk Findings

1. Whole-state cloud saves can persist partial in-memory state.
2. Backup-before-save is best-effort, not mandatory.
3. localStorage quota failure can still leave the app without a reliable pre-save backup.
4. Seed/default/adoption paths can create plausible empty/default state.
5. Some protected fields requested in SAFE-01 are missing from the current protected-field guard list.
6. Backup compaction currently drops fields that should be protected until the registry formally marks them safe.
7. Delete paths are not uniformly covered by frontend/backend trash and durable pre-action backups.
8. Render adapters can silently hide missing/malformed data.

## SAFE-02 status pointer

SAFE-02 implementation status is tracked in `docs/data-safety-implementation-status.md`. That status document records the central protected field registry, read-only integrity diagnostics, registry coverage, and remaining follow-up work.

## SAFE-03 status pointer

SAFE-03 hard dangerous-save preflight is tracked in `docs/data-safety-implementation-status.md`. The active save blocker now uses the protected field registry and integrity summaries before the main Firestore state write. The next planned step is SAFE-04 Durable Backup-Before-Save.

## 14. Non-Goals for SAFE-01

- No writes were unlocked.
- No production recovery was attempted.
- No app behavior was changed beyond adding this documentation.
- No fake claim is made that daily restore points, weekly exports, backend trash, or field-level restore are already implemented.
