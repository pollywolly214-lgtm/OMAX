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
| D. Full **active Storage** OMAX browser load | **PASS in isolated browser; live Firebase pending** | Controlled disposable browser loads actual app, active index, all protected fields, dashboards, jobs, inventory, maintenance, costs, reports; browser refresh preserves exact state |
| E. Ordinary save from active browser | **PASS in isolated browser; live Firebase pending** | Actual `saveCloudNow` through sharded CAS; readback and loaded revision match; >975 KB whole state accepted if valid shards; no legacy Firestore write |
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


## 2026-11-23 active browser load/save/refresh verified

**GitHub Actions run 45221285186: all jobs PASS — 64 Node migration regression tests, 9 real Firestore Rules emulator tests, and 3 Playwright browser smoke tests (76 total).** Verified after source and fixture changes in PR #532. Vercel preview deployment should be checked separately.

**What the new browser test demonstrates:** real OMAX HTML and `saveCloudNow()` execute against an authenticated synthetic active-index source, using unmodified sharding/readback/commit libraries with in-memory Firebase/Storage stand-ins on localhost. Browser routes deny all non-local traffic. Only the served localhost `core.js` copy has its guarded `const MCAP_SHARDED_WRITES_ACTIVE = false;` replaced to enable the exercise; the committed production code remains closed. The test starts with a complete state greater than **975,000 bytes**, verifies the oversize collection is split across immutable shards, saves through normal OMAX logic, checks exact independently reconstructed state/revisions and opaque field retention, verifies no legacy document writes, persists synthetic index/immutable objects in localhost session storage, then **reloads the whole page** and re-verifies the exact state with no reload writes. No production Firebase, billing, Storage or data touched.

**Release interpretation:** This justifies progressing gates D and E to **isolated browser PASS**, NOT fully proven on genuine authenticated Firebase clients or live multi-device sessions. Do not claim that specialized business workflows, real Cloud Storage rules, post-CAS failures, concurrent browser sessions, or recovery/rollback have passed. The production write switch and recovery safeguard remain unchanged.

**Next highest-value tests:** representative specialized cutting-job, inventory/material, maintenance/calendar, daily water-quality, and pump-history operations using that active-browser harness; enforce full-state invariant comparisons before/after; test post-CAS interruption and readback failure handling with frozen/saved local evidence. Only then consider a disposable Firebase browser with actual emulator Storage/Firestore rules and a reviewed explicit production operator plan.


## 2026-11-23 full browser refresh and machine-hours history change

**Evidence:** GitHub Actions run `45222278029` completed successfully, with **64 Node regression tests, 9 actual Firestore emulator/security tests, and 3 Playwright browser tests (76/76 total PASS)**. The active-browser test exercises the **real OMAX page**, active synthetic Storage authority, a complete reconstructed state larger than 975 KB (including a segmented opaque field), ordinary save and revision adoption, browser refresh from persisted immutable shards and manifest, and an actual `setDailyCutHoursEntry("2026-11-22",3.5,{source:"manual"})` business-history modification. Following another guarded `saveCloudNow()`, independent manifest readback and a **second full browser refresh** verify the same daily-cut-hours entry, exact reconstructed state/revision, retained maintenance history and opaque fields, with zero legacy state writes. The 3.5-hour entry is **synthetic test data only**, not an actual shop figure.

For browser refresh the disposable Firebase/Storage stand-in persists **only its synthetic test objects** in IndexedDB on localhost. This replaced an earlier test-fixture sessionStorage method that failed the browser's quota when saving a second historical snapshot. The production website's IndexedDB/Firebase data model was not altered. The test runner swaps the source-controlled write gate only in the isolated, locally served copy of `core.js`; the repository remains `MCAP_SHARDED_WRITES_ACTIVE = false`.

**Project/process verdict:** Durable acceptance now exists for *isolated* active-browser load, save, oversize roundtrip, full reload, and one real daily cut-hours setter. This is a genuine step toward cutover, but it is NOT real-browser Firebase/Cloud Storage integration and does not prove all specialized mutation operations. Focus remaining development on scoped cutting jobs, inventory/material revisions, maintenance scheduling/completions, water quality, pump logs, recovery and two-browser live Firebase-emulator tests. Do not raise the write gate, publish proposed Firestore rules or merge PR on a test-count threshold.
