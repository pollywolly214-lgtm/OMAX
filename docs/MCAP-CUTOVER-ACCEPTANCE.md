# MCAP — Cutover acceptance and evidence gates

**Status: NOT READY TO CUT OVER.** This is the operator checklist for the OMAX full-state Firestore → immutable Cloud Storage migration, not permission to operate on production. PR #532 is Draft. No automatic migration or destructive data changes.

## Why this checklist exists

Our early tests validated the *components* before they validated the actual OMAX application. A good standalone sharded CAS test does not prove that OMAX's ordinary save, import, maintenance, inventory, financial/recovery UI, and realtime listeners all use that CAS correctly. Treat regression test count as supporting evidence, **not** the acceptance criterion. Prioritize real workflow coverage and fail closed.

## Proven evidence

- **2026-11-18, user-executed browser:** complete point-in-time Storage copy passed independent readback at Firestore revision `1794576947956`: **35 logical fields**, **36 Storage objects**, **188 maintenance occurrences**, **180 completed cutting jobs**, zero Firestore writes/deletes by the copy script. This does NOT prove current production state still has that revision, and does not itself include independent attachment/document namespaces.
- **2026-11-23, isolated code/CI:** sharded plan, full reconstruction, exact SHA-256 readback, CAS stale-client rejection, bounded collection splitting, real **disposable** Firestore Rules emulator and multi-client transactions, and a **legacy** OMAXDevSafe website save/reload have passed. The Storage service in emulator integration is an in-memory stand-in. These do NOT establish a full active-backend website cutover.
- **2026-11-23, critical source audit:** `core.js` once used the historical legacy document for recovery, diagnostics, and cutting-job repair after Storage activation; this has been routed via `readCurrentCloudStateReadOnly()` → `OMAXAuthorityRouter`. Production startup now fails closed if the authority module is missing. `omaxShardedActivation.js` now uses transaction reads to avoid stale Firebase v8 views.
- **2026-11-23, ordinary-save bug fixed:** Storage writes advance `syncMeta.rev`; comparing the independent readback to the pre-save snapshot would falsely classify a successful commit as unverified. `OMAXShardedAcknowledgement.confirm` instead verifies an exact match between the committed state and independent readback, then core adopts that verified committed revision. Original Firestore acknowledgement logic is left unchanged. Source-level write gate remains **`MCAP_SHARDED_WRITES_ACTIVE = false`**.

## Release gates — all mandatory

| Gate | Current verdict | Required evidence |
| --- | --- | --- |
| A. Full point-in-time copy | **PASS for historical revision only** | Fresh complete candidate matching *current* production source immediately before activation; independent full readback |
| B. Identity, checksum and immutable Storage rules | **Partially verified** | Full production-like Storage rules create/get and non-overwrite tests, including >512 KiB segmented collection round trips |
| C. Firestore rules block obsolete clients | **PASS in disposable emulator only** | Publish reviewed cutover rules safely; old browser transaction cannot commit after active index; denied unauthorized, malformed and stale pointers |
| D. Full **active Storage** OMAX browser load | **NOT PROVEN** | Controlled disposable browser loads actual app, active index, all protected fields, dashboards, jobs, inventory, maintenance, costs, reports; browser refresh preserves exact state |
| E. Ordinary save from active browser | **NOT PROVEN** | Actual `saveCloudNow` through sharded CAS; readback and loaded revision match; >975 KB whole state accepted if valid shards; no legacy Firestore write |
| F. Specialized business writes | **NOT PROVEN** | Cutting job create/edit/complete/restore/import, maintenance occurrences/calendar, inventory/material changes, pump/water checks, financial and reports; no unrelated data reduced |
| G. Realtime and concurrent clients | **Partially verified in emulator** | Two real browser sessions with active authority; stale and in-flight legacy writes rejected without losing newly committed history |
| H. Failure and recovery | **NOT PROVEN in browser** | Indeterminate post-CAS result, permission/network interruptions, missing Storage shard, identity changes, actor sign-out; no unsafe retry or unverified fallback |
| I. Backup, audit and restore | **NOT PROVEN end-to-end** | Current verified independent backup; recovery UI sees active Storage authority; all originals, trash and historical source evidence preserved; backward compatibility of old V1 manifest |
| J. Deployment and operator sign-off | **NOT STARTED** | Reviewed Firestore rules, reviewed deployed code, verified source/candidate revision, client lockout, explicit activation with audit; preserve legacy document; rollback allowed only before first sharded write |

**DO NOT** merge, publish the proposed Firestore cutover rules, enable the sharded write switch, activate `stateIndexV1`, remove the original Firestore state, or run the production staging script again merely to make a test green. No full reset, migration, compaction, or auto-repair.

## Next engineering priority

1. **Close D and E:** build a disposable, production-equivalent OMAX browser harness with an active sharded authority and exercised `loadFromCloud` / `saveCloudNow`, including full readback, fresh revision adoption and >975 KB assembled state. Do not bypass UI guards to fabricate a pass.
2. **Close F and H:** run representative specialized mutation workflows and failure/recovery cases in the same harness. Inspect remaining legacy-source paths and make narrow, non-destructive compatibility fixes.
3. **Close G and I:** real two-session browser convergence and full backup/recovery checks.
4. Only after passing these, prepare a separate, explicit operator runbook and fresh snapshot check for gate J. Preserve this checklist as durable repo handoff context across Codex agents.

**Verification rules:** report every actual command/test and pass/fail; never describe synthetic in-memory Storage as production Storage; never claim the live backend migrated from a historical copy. The user should not be asked for F12 until isolated tests are complete and a single focused production read-only verification is genuinely necessary.


## 2026-11-23 process reassessment and next acceptance test

The decisive acceptance gap is the **real OMAX active-sharded browser save**, not the number of unit tests. The completed verified snapshot and component tests are useful, but no live cutover can be approved on that basis. Avoid spending more iterations on isolated test counts unless they directly close a release gate.

**Active-browser save exercise added (not yet claimed as passed):** `tests/mcap-active-browser-save.browser.cjs` uses the real OMAX HTML, real sharding/readback/coordinator, and a strictly-local Firebase/Storage mock. Playwright blocks all external network requests. Only the served localhost copy of `js/core.js` has its source gate substituted for this test; the checked-in production `const MCAP_SHARDED_WRITES_ACTIVE = false;` remains unchanged. The harness tests the real `saveCloudNow()` path, exact index and revision adoption, and forbids any legacy state write. CI status must be checked before considering gate E even partially verified.

**Acceptance discipline:** A successful harness test is narrower than real Firebase multi-device browser acceptance. Any failed assertion must be classified as app logic, fixture normalizing behavior, or test harness fault using actual logs, without weakening protected-state comparisons. Keep PR #532 Draft, published Firestore rules unchanged and the source write gate closed. Next prioritize active-browser ordinary save and refresh with a >975 KB assembled source, then specialized business changes and failure/recovery.
