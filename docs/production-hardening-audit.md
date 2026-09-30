# PH-01 production-hardening audit

**Audit date:** 2026-09-29  
**Starting main-equivalent commit:** `2f3be26e074e4a64ccf525a7e535adb0c45d67b7`  
**Working branch:** `production-hardening`  
**Safety boundary:** No production mutation, restore, import, deletion, reset, migration, Firebase configuration/rules change, or business-data rewrite was performed.

## Finding summary

| Severity | Open | Fixed | Total |
| --- | ---: | ---: | ---: |
| P0 | 1 | 0 | 1 |
| P1 | 1 | 2 | 3 |
| P2 | 0 | 1 | 1 |
| P3 | 2 | 0 | 2 |

**Historical recovery gate:** **BLOCKED pending review of PH-001 and PH-002.** The existing save preflight is strong, but it is not an atomic compare-and-swap, and the empty-state bootstrap can authoritatively write defaults. Recovery/import work should not start until the concurrency and missing-document policies are explicitly accepted or hardened.

## Scope and method

The audit traced the static application bootstrap and script order; Firebase Auth, Firestore, and Storage initialization; workspace subscription; `snapshotState`, `adoptState`, cloud load/save, local backup, revision checks, protected-field registry, recovery diagnostics, router/render lifecycle, maintenance/calendar, cutting jobs/history/importer/repair, inventory/orders/receipts/costs, pump history, deleted items, layouts, OneDrive compatibility paths, and CFR-02–CFR-06 secure cutting-file code. Searches covered TODO/FIXME/legacy/fallback, exceptions, timers, browser storage, serialization, writes, deletion, mutation, reset, migrations, seeding, defaults, compaction, and sanitization.

The repository has no `package.json`; no npm command was run. The baseline deterministic suite was `node --test tests/*.test.js`: **24 tests, 24 passed, 0 failed, 0 skipped**. Browser automation (Chromium/Chrome) was not installed, authenticated production access was not available in this environment, and therefore production was not opened and no production request was made.

## Findings

### PH-001 — read/check/write revision guard is not atomic

- **Severity:** P0
- **Category:** persistence / race condition / data-loss risk
- **Status:** OPEN — **REQUIRES REVIEW**
- **Reproduction steps:** Have two authenticated clients load revision N, edit different records, and initiate saves closely enough that both Firestore reads complete before either write. Both clients can pass `detectRemoteRevisionConflict`; the later whole-state merge write can overwrite the earlier client's collections.
- **Expected behavior:** Exactly one client commits against revision N; the other receives a deterministic conflict before writing.
- **Actual behavior:** Revision validation and authoritative `set(..., {merge:true})` are separate operations.
- **Root cause:** Firestore read/check/write is not enclosed in a transaction or another server-enforced compare-and-swap.
- **Affected files/functions:** `js/core.js`: `saveCloudInternal`, `detectRemoteRevisionConflict`, `writeAuthoritativeStateSnapshot`.
- **Data-risk level:** Critical; realistic cross-client lost-update risk across protected business collections.
- **Fix performed or recommended:** No automatic architectural change. Use a Firestore transaction with a revision precondition while retaining content firewall and protected-field preflight; define indeterminate transaction handling first.
- **Tests added/run:** Existing protected preflight, importer, and secure-file suites; static trace of save path.
- **Browser verification result:** Not run; requires two disposable authenticated clients and must not be reproduced against production business data.

### PH-002 — missing authoritative document triggers a default write

- **Severity:** P1
- **Category:** bootstrap / persistence / recovery safety
- **Status:** OPEN — **REQUIRES REVIEW**
- **Reproduction steps:** In a disposable workspace, make `workspaces/<workspace>/app/state` absent while authenticated and load normally outside recovery mode.
- **Expected behavior:** Missing authoritative state is treated as an exceptional/unknown condition until an explicit new-workspace action confirms initialization.
- **Actual behavior:** `loadFromCloud` constructs defaults and calls `writeAuthoritativeStateSnapshot(..., {merge:true})` after legacy migration yields no meaningful state.
- **Root cause:** New-workspace initialization and missing/corrupt/deleted production-state recovery share the same absence branch.
- **Affected files/functions:** `js/core.js`: `loadFromCloud`, `migrateLegacyWorkspaceDoc`.
- **Data-risk level:** High; an unexpectedly absent state document can be replaced with defaults, obscuring the incident and creating an authoritative empty baseline.
- **Fix performed or recommended:** No automatic change because intended workspace provisioning is uncertain. Require explicit, authenticated new-workspace initialization or a trusted provisioning marker; otherwise enter read-only Recovery Mode.
- **Tests added/run:** Static control-flow audit; existing state-safety tests.
- **Browser verification result:** Not run because reproduction requires backend mutation.

### PH-003 — backup quota fallback deleted the last backup and unrelated keys

- **Severity:** P1
- **Category:** local backup / cache / recovery
- **Status:** FIXED
- **Reproduction steps:** Fill localStorage near quota, retain a valid `omax_local_state_backup_v1`, and trigger a new backup large enough for the primary write to fail.
- **Expected behavior:** Failed replacement preserves the previous valid backup; fallback attempts do not delete unrelated user keys.
- **Actual behavior:** The fallback removed the existing backup before attempting emergency/tiny writes and also removed four cache/legacy keys. If all retries failed, no backup remained.
- **Root cause:** Space-reclamation logic used destructive `removeItem` calls before knowing a replacement could be committed.
- **Affected files/functions:** `js/core.js`: `persistLocalStateBackup`.
- **Data-risk level:** High locally; recovery evidence could disappear immediately before/around a cloud save.
- **Fix performed or recommended:** Removed all fallback deletions. Web Storage `setItem` now attempts progressively smaller replacements while the old value remains intact if a quota exception occurs.
- **Tests added/run:** `tests/production-hardening.test.js` asserts the fallback contains no deletion and retains emergency/tiny attempts; full deterministic suite.
- **Browser verification result:** Programmatically verified; real-browser quota behavior remains a manual check.

### PH-004 — impossible ISO dates silently rolled into another day

- **Severity:** P2
- **Category:** validation / date correctness
- **Status:** FIXED
- **Reproduction steps:** Call `normalizeDateISO("2026-02-31")` or pass that value through a date-backed save flow.
- **Expected behavior:** The impossible date is rejected.
- **Actual behavior:** The canonical-looking string was returned unchanged, while `parseDateLocal` rolled it into March via the JavaScript `Date` constructor.
- **Root cause:** Shape validation (`YYYY-MM-DD`) was mistaken for calendar validation.
- **Affected files/functions:** `js/core.js`: `parseDateLocal`, `normalizeDateISO`; downstream history, maintenance, pump, and scheduling consumers.
- **Data-risk level:** Medium correctness risk; records could be grouped or merged under an unintended date.
- **Fix performed or recommended:** Validate reconstructed year/month/day components and return `null` for impossible dates.
- **Tests added/run:** Leap-year and impossible-date behavior in `tests/production-hardening.test.js`; full deterministic suite.
- **Browser verification result:** Deterministic helper verification passed; form-level browser check remains manual.

### PH-005 — calendar error details allowed HTML injection

- **Severity:** P1
- **Category:** client security / runtime UI
- **Status:** FIXED
- **Reproduction steps:** In disposable state, invoke the calendar job bubble with a missing job ID containing HTML, or cause an error whose message contains HTML.
- **Expected behavior:** IDs and error details render as text.
- **Actual behavior:** Both values were interpolated directly into `innerHTML`.
- **Root cause:** Two exceptional calendar render branches bypassed the module's existing `escapeHtml` helper.
- **Affected files/functions:** `js/calendar.js`: cutting-job bubble error/missing-job branches.
- **Data-risk level:** High if an attacker-controlled or malformed stored identifier/error reaches the branch; DOM script/content injection is possible.
- **Fix performed or recommended:** Escape both dynamic values before HTML insertion.
- **Tests added/run:** Static regression assertions in `tests/production-hardening.test.js`; syntax and full deterministic suite.
- **Browser verification result:** Programmatically verified; interactive malicious-fixture rendering remains manual.

### PH-006 — localStorage contains several potentially large duplicate caches

- **Severity:** P3
- **Category:** performance / browser storage
- **Status:** OPEN — **REQUIRES REVIEW**
- **Reproduction steps:** Use layouts, OneDrive library/previews, material settings, and legacy maintenance on a long-lived browser profile, then inspect localStorage usage.
- **Expected behavior:** Bounded caches have ownership, size limits, and visible quota diagnostics; authoritative cloud state remains dominant.
- **Actual behavior:** Multiple independent JSON values share localStorage quota, including preview/library caches and a compact full-state backup. Several writers swallow quota failures.
- **Root cause:** Browser persistence evolved by feature without a central quota/budget policy.
- **Affected files/functions:** `js/core.js`, `js/renderers.js`, `js/opportunity.js`, `js/onedrive/onedriveLibrary.js`, `naming-widget.js`.
- **Data-risk level:** Low direct cloud risk, medium recovery/UX risk due failed backup or layout/cache writes.
- **Fix performed or recommended:** Do not delete existing keys automatically. Add read-only storage diagnostics and per-cache bounds after product review; keep CFR-05 verified DXF preview bytes memory-only.
- **Tests added/run:** Static browser-storage inventory and CFR suites.
- **Browser verification result:** Not available without an instrumented browser profile.

### PH-007 — full interactive and authenticated runtime matrix remains unverified

- **Severity:** P3
- **Category:** verification coverage
- **Status:** OPEN — **REQUIRES REVIEW**
- **Reproduction steps:** Run an authenticated disposable workspace in Chromium with console/network capture and traverse every major view at desktop and mobile sizes.
- **Expected behavior:** No uncaught errors, failed requests, duplicate handlers, overflow, stale renders, or save/reload mismatches.
- **Actual behavior:** The current environment has no supported browser binary or authenticated disposable workspace, so static/local HTTP checks cannot establish those facts.
- **Root cause:** Environment limitation, not a confirmed application defect.
- **Affected files/functions:** Entire static application runtime.
- **Data-risk level:** Unknown residual risk.
- **Fix performed or recommended:** Complete the manual matrix below before recovery.
- **Tests added/run:** Deterministic Node tests, syntax checks, static server HTTP checks.
- **Browser verification result:** Blocked by environment.

## Browser-storage inventory

| Key / store | Classification | Notes / precedence |
| --- | --- | --- |
| `omax_local_state_backup_v1` | backup | Compact business-state recovery copy; never automatically authoritative over meaningful cloud state. |
| `cloud_sync_client_id_v1` | configuration | Per-browser revision-writer identity. |
| `cutting_job_files_v1` | legacy/cache | Legacy job-file cache; embedded content is blocked from authoritative state by CFR-02. Quota risk. |
| `dashboard_layout_windows_v1`, `cost_layout_windows_v1`, `job_layout_windows_v1` | layout/cache | Cloud-loaded layout should win; local copy supports UI persistence. |
| `cost_history_suppressed_v1` | configuration | User suppression preferences. |
| `job_material_pricing_v1` | configuration/business input | Material calculator definitions used by importer; separately backed up by importer flow. |
| `omax_tasks_interval_v6`, `omax_tasks_asreq_v6` | legacy | Fallback hydration only; risk if cloud state is absent/partial. Do not delete during this effort. |
| `cutting_job_onedrive_config_v1` | configuration | OneDrive/reference-folder configuration. |
| `cutting_job_onedrive_library_v1` | cache | Potentially growing reference library metadata. |
| `cutting_job_onedrive_preview_cache_v1` | cache | Potentially large preview cache; separate from CFR-05 cloud DXF memory-only cache. |
| `cutting_job_onedrive_device_id_v1`, `cutting_job_current_profile_local` | configuration | Device/profile identity. |
| `cutting_job_onedrive_shared_library_cache_v1` | cache | OneDrive shared-library cache. |
| `appSetting_*` | configuration | Opportunity settings, JSON encoded. |
| `friendlyFileNamerV4` | configuration/history | Standalone naming-widget preferences/history. |
| MSAL localStorage entries | auth | Controlled by MSAL configured with `cacheLocation: "localStorage"`. |
| IndexedDB `wj_cuts_local_root_db`, record `root` | configuration/permission handle | File System Access root handle; local to the browser/device. |

## Save/load and data-loss conclusions

- `snapshotState` includes the protected registry's principal business collections, nested job/manual maintenance histories, layouts, configuration, deleted items, and pump efficiency history.
- CFR-02 blocks embedded cutting-file bytes/data URLs before authoritative writes. CFR-05 keeps secure cloud files as Storage binary plus Firestore compatibility metadata and hydrates verified bytes transiently.
- The protected preflight blocks missing fields, shape collapse, zeroing, large count/size drops, and stale revisions against available baselines. It is an important fail-closed layer but does not solve PH-001's atomicity gap.
- Saves merge remote `totalHistory`, `dailyCutHours`, and `pumpEff` immediately before write. Other collections remain whole-client-state last-writer candidates if concurrent checks race.
- Importer preview is non-mutating; submission revalidates the baseline/material settings, requires a downloaded backup, checks protected collections, awaits the save, rolls back definite failures, and does not blindly retry or roll back indeterminate writes.
- Recovery diagnostics are read-only on view and expose cloud/local exports. Recovery Mode blocks autosave, seed writes, migrations, and metadata writes.
- No historical import or production restore was executed.

## Firebase/network observations

No authenticated production browser session or network mutation was used. Therefore no production Firebase permission, Storage, CORS, or network error was observed or ruled out. Static inspection confirmed the production Firebase client config is visible as expected for a Firebase web client; authorization must remain enforced by rules. Rules were inspected by the existing deterministic suite and were not changed.

## Manual browser verification matrix still required

Use a disposable authenticated workspace with DevTools preserving console/network logs. For each Dashboard, Maintenance Settings, Maintenance Calendar, Cutting Jobs, Completed History, Inventory/folders/materials, Order Requests, Purchase History, Receipt Tracker, Cost/Data Center, pump/RPM/efficiency, Settings/Recovery, Deleted Items, and secure cloud-file view:

1. Navigate in/out and switch views repeatedly; check console, rejected promises, 404s, permission errors, duplicate requests/listeners, and stale DOM.
2. At desktop and narrow mobile widths, inspect tables, menus, dialogs, keyboard/focus behavior, loading/error states, and overflow.
3. With fixtures only: edit → save → rerender → navigate away/back → hard reload → fresh session, verifying Firestore and UI values after each stage.
4. Exercise DXF/ORD/OMX validation and verified download in a disposable workspace; confirm no bytes, base64, SVG preview, Blob, ArrayBuffer, or download token enters authoritative app state/local backup.
5. Simulate localStorage quota exhaustion and confirm PH-003 retains the prior backup.
6. Run a two-client concurrency fixture to decide and validate the PH-001 resolution.
7. Confirm an absent state document enters an approved initialization/recovery flow before resolving PH-002.

## Files changed and commit record

- `js/core.js` — strict date validation and non-destructive backup fallback.
- `js/calendar.js` — escaped exceptional calendar rendering.
- `tests/production-hardening.test.js` — focused regressions.
- `docs/production-hardening-audit.md` — durable audit record.
- `vercel.json` was inspected and already contains exactly `{ "cleanUrls": true }`; it was not modified.

Commit SHAs and final branch HEAD are recorded in the final pull-request/report because they are produced after this document is staged.
