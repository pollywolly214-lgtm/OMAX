# MCAP-STORAGE-ARCHITECTURE

Status: **BLOCKED — archive preparation plus isolated Storage transport, not an integrated capacity fix** (2026-11-13).
Branch: `feature/mcap-storage-01a-foundation`.

## Observed failure

The existing authoritative workspace state is stored in `workspaces/github-prod/app/state`. The November 12 read-only diagnostic supplied in the project brief measured an estimated 974,723 JSON UTF-8 bytes against the app's 975,000-byte safety gate. Appending the Mixing Tube Rotation `removed` event produces an estimated 975,349-byte payload, so `checkAuthoritativeIdentityIntegrity` blocks it. These are diagnostic JSON estimates, not measured Firestore serialized bytes. The event has not been durably saved.

## Verified current architecture

- `index.html` loads Firebase v8 Auth, Firestore, and Storage SDKs; configured bucket is `wj-tracker-v2.firebasestorage.app`. Live quota and billing **not verified**.
- `js/core.js` keeps `maintenanceOccurrencesV2` in the authoritative Firestore document, runtime/window state, snapshots, and backup paths.
- `writeAuthoritativeStateSnapshot` uses `OMAXAtomicPersistence.save`, revision/CAS, protected-data preflight, and a payload size limit.
- `checkAuthoritativeIdentityIntegrity` and `OMAXGlobalIdentityRepair.integrity` currently validate the inline whole state.
- `js/maintenanceCalendarCancellation.js` appends cancellation lifecycle records; `js/calendar.js` resolves event history.
- `js/cutCostFeedback.js`, `js/historicalImport.js`, `js/maintenanceRecoveryImport.js`, `js/maintenanceCalendarIntegrity.js`, and other consumers read `maintenanceOccurrencesV2`; the set of consumers must be exhaustively audited before integration.
- `storage.rules` permits scoped cutting-file objects only and denies other paths. Production rules must not be modified without approval.

## Proposed target

Firestore retains a bounded **active suffix** of maintenance events, workspace revision, and a small versioned manifest. Immutable, versioned archive segments reside in Cloud Storage under `workspaces/{workspaceId}/maintenance-history/v1/{operationId}/{sha256}.json`. Manifests reference archive paths, cryptographic digests, record count, identity boundary, and source revision. A logical read-through layer validates and merges segments in canonical order before giving any consumer or writer a complete view.

**Do not store an unbounded list of archived record IDs in the Firestore manifest.** Store a digest of the ordered IDs. Never replace failed or missing archive reads with an empty history.

## Implemented on this branch

`js/maintenanceArchive.js` supplies a **non-integrated**, dependency-injected, pure preparation/validation foundation:
1. Selects an exact prefix at a valid authoritative source revision. It never edits the original state.
2. Serializes a versioned envelope with sorted object keys and record arrays in original order.
3. Computes SHA-256 of the exact UTF-8 bytes and a separate digest of the ordered IDs.
4. Produces an immutable content-addressed Storage path and bounded descriptor.
5. Rejects noncanonical JSON, tampered bytes, altered metadata, invalid/duplicate IDs, wrong record counts, ID sequence mismatches, and incorrect object paths.
6. Provides an explicit in-memory cutover **proposal** only after supplied verified records match the original prefix at the same revision.
7. Reconstructs a logical array from already verified archive segments and an active suffix, rejecting missing segments and duplicate identities.

`tests/mcap-storage-foundation.test.js` adds Node built-in test cases. These are source-level tests; they do **not** prove Firebase interaction, upload readback, CAS commitment, complete production record preservation, or end-to-end maintenance removal.

**Important:** The proposal function does not commit anything; passing arbitrary records to it is not independent Storage verification. The caller must independently fetch and run `verify` on the downloaded bytes first. Likewise `reconstruct` must only be called with segments already checked by `verify`. There is no operator migration control or integrated maintenance save/load architecture. Existing production code does not load `maintenanceArchive.js` or `maintenanceArchiveStorage.js`.

## Protected invariants / missing integration

- Do not remove Firestore history until Storage upload **and independent readback** are verified, a revision-checked manifest and bounded state transaction commits, and the resulting complete logical state is independently reloaded/validated.
- Prevent retries from creating duplicate segments. Use operation IDs, content-addressed uploads, idempotent manifest commits, and explicit states for interrupted uploads and ambiguous transaction results.
- Read all manifest segments before any dependent write. On missing/unauthorized/corrupt Storage objects, suspend writes and preserve Recovery Mode.
- Whole-state save paths must write only bounded inline state while integrity checks compare the **full logical authoritative history**. Currently they do not.
- Reconcile identity validation, protected registry counts, backup safety checks, normal adoption, local and cloud comparison, import/export, recovery, and cost read paths. They currently assume all events are inline.
- Establish a bounded append strategy and archive-rotation protocol for new event history without rewriting existing immutable segments.
- Add dedicated authenticated workspace Storage rules with create-only semantics and tested metadata, size, content-type, and path requirements. Do not weaken existing cutting-file rules.
- Retain old Firestore state or verified backups as recoverable evidence until explicit post-migration verification and rollback criteria are established.
- Validate the Firebase Storage bucket, quota/billing, and real deployment configuration. Source rules files alone do not establish deployed rules.

## Remaining test / deployment gates

1. Execute Node tests, run `node --check` for changed scripts, and run the repository's relevant existing tests. No `package.json` was found at the repository root in the inspected tree.
2. Design and implement upload/readback, manifest CAS, read-through, continuing bounded write strategy, and recovery in a disposable backend.
3. Add failure injection for failed upload, denied download, digest mismatch, stale source revision, ambiguous commit, concurrent user, duplicate replay, and interrupted adoption.
4. Exercise a high-capacity synthetic fixture with the exact Mixing Tube Rotation repeat removal via existing UI, then verify `removed` via a fresh backend read and reload.
5. Independently reconcile completed maintenance history, calculated costs, and nonmaintenance protected records before/after.
6. Review and deploy new rules separately with explicit permission, and perform a separate opt-in, backed-up production migration only after approval.

## Verdict and next action

**BLOCKED / NOT READY FOR MERGE.** The code is a safe, isolated foundation, not a working Firebase Cloud Storage history implementation. No production migration, live document mutation, or rules deployment has been performed. Complete the integration and disposable end-to-end acceptance work before the branch can become a capacity-fix PR.


## Additional isolated transport work (2026-11-13)

- `js/maintenanceArchiveStorage.js` targets only `wj-tracker-v2` and `wj-tracker-v2.firebasestorage.app`. It offers an explicitly invoked, non-wired upload with readback/metadata/content SHA-256 verification and a read-only archive download. It does **not** alter Firestore.
- `storage.rules` has a proposed create-only/get-only maintenance-history path, scoped to the production workspace and existing authenticated membership roles. The existing cutting-file rule remains unchanged. These rule edits are **not deployed or emulator-verified**.
- `tests/mcap-storage-transport.test.js` adds mock Storage round-trip, cross-project, corruption, missing access, immutability, and no-Firestore-mutation tests. Tests were authored but **not run** in this session.
- **Transport cannot authorize a migration.** A successful Storage upload is not an atomic Firestore commit. Complete the CAS manifest transaction, independently verified logical reload, guarded active-suffix save path, and end-to-end disposable browser tests before enabling this from the main application.
- **Confirmed from operator screenshots:** On 2026-11-13, WJ TRACKER-V2 visibly showed Blaze pay-as-you-go, $300 remaining promotional credit, and approximately 4.11 MB / 36 objects in Cloud Storage. This confirms the account plan and Storage service are available, but does not imply the historical data is already archived. Historical records continue to fill `workspaces/github-prod/app/state`.

## Working-folder verified copy milestone (2026-11-17)

The user provided `OMAX_FULL_BACKUP_2026-11-17T21-27-25-664Z_rev1794576947956.json`, a SHA-256-verified, **main Firestore document** backup. The document has 35 top-level fields, 188 maintenance occurrence events, 164 calendar instances, 180 completed cutting jobs, 34 inventory rows, 25 receipt-tracker weeks, and 33 weekly cost reports. Its `syncMeta.rev` is `1794576947956` (last server update 2026-11-13), so it is **not** evidence of any subsequent live edits. Keep the user's original desktop copy separate; this GitHub branch contains no copy of those business records.

### Implemented, not yet deployed

- `js/omaxWorkingStorage.js`: an explicit, inactive, single-pass `probe` and `snapshot` staging adapter targeting **only** `wj-tracker-v2` / `wj-tracker-v2.firebasestorage.app` / `workspaces/github-prod`. It never calls Firestore writes or deletes. Before an immutable snapshot upload it independently reads and compares the complete current Firestore source twice. After upload it independently downloads, verifies byte length, SHA-256, original serialized bytes, exact metadata/path, then rereads the current source and refuses to claim migration readiness if a concurrent edit occurred. Failed/ambiguous attempts are preserved for manual investigation; no automatic retries or deletes.
- `index.html`: loads the staging adapter as a module, but never invokes it.
- `storage.rules`: **undelployed proposal** for create/get-only access under `workspaces/github-prod/working/v1/{probe|snapshot}/{operationId}/{sha256}.json`, with size, metadata, ownership and membership checks; no client update/delete/list.
- `tests/omax-working-storage.test.js`: synthetic tests for benign probe, entire-state byte equality, rejected wrong project/confirmation, missing fields, denied Storage read, corrupted download, concurrent edit after upload, immutable source; **tests not executed by the connector**.

**Important distinction:** successful staging verifies a recoverable immutable **copy** of the whole state, not a live data migration or an app capacity fix. The existing Firestore state remains authoritative and unmodified, so ordinary OMAX operations still face the 975 KB write gate.

### Next engineering integration required for full functionality

1. Build a versioned immutable **field/collection-sharded store**, not an ever-growing copy of the entire state on each save. Preserve all original row IDs and nested history, including deleted/trash and rarely touched fields.
2. Establish a small Firestore CAS-controlled manifest/commit envelope with a safe read-through cache that validates every referenced shard and reconstructs the **entire** old logical state before adoption. Validate logical state against the original complete backup and current production revision; missing/corrupt/unreadable shards must stop adoption and writes.
3. Centralize normal, specialized, and background writes: compare the exact source revision and changed business paths, upload/verify changed shards, commit the new manifest through guarded Firestore transaction, independently reread the manifest and its content, and only then announce success. Keep old immutable shards for rollback and avoid orphan cleanup until explicitly reviewed.
4. Update every `FB.docRef.onSnapshot` listener, `loadFromCloud`, backend transaction read, protected-data integrity check, local backup/restore, audit, import/export, cutting-job actions, maintenance-calendar actions, material/pump/water-quality writers, and history/cost calculation to consume the same verified logical state. The existing 975,000-byte gate must remain for inline Firestore payloads. A logically large reconstructed state cannot be sent back inline.
5. Test with actual source-equivalent synthetic 35-field state and failures: stale revision, write conflict, offline upload, denied access, corrupt shard, ambiguous commit, mutation during upload, two concurrent sessions, restore after cache clearing, browser refresh, purchase edit, inventory edit, maintenance repeat removal, full cutting-job lifecycle, historical reports and totals.
6. **Only after successful disposable tests**, capture a fresh production backup and independent second copy, verify main-state revision/counters and auxiliary Firestore metadata/Storage file references, get operator approval for rules deployment and cutover, and stage the original state without deleting it. Keep rollback until user independently verifies all features.

### Operator console calls (ONLY after approved rules are deployed)

On the exact PR preview, while signed in and with the staging module loaded:
`await OMAXWorkingStorage.probe("STAGE OMAX COPY ONLY")`
then, after the probe has verified and a fresh backup has been retained:
`await OMAXWorkingStorage.snapshot("STAGE OMAX COPY ONLY")`

Each produces a readback-verified, content-addressed Storage object **only**. No Firestore data is removed, no manifest is activated and the app continues using its original state. This is not permission to deploy untested rules or perform the full migration.

### Lossless per-collection sharded copy (development milestone)

- `js/omaxShardedState.js` provides a **pure** field-level archive planner using versioned SHA-256 content-addressed JSON, metadata and strict byte limits. A missing, tampered, duplicate, or wrong-revision shard blocks reconstruction. It refuses to silently omit unknown top-level fields. The uploaded 2026-11-17 backup's largest top-level business field is `completedCuttingJobs` (~363 KB compact JSON); all 35 current fields fit under the provisional 512 KiB per-shard limit. This proves sizing feasibility **for that snapshot**, not for future growth.
- `js/omaxWorkingShards.js` provides an explicit `stageFromBrowser("STAGE OMAX SHARDS ONLY")` operation: independently read current Firestore twice, upload one immutable object for every top-level field, independently verify each Storage object's metadata, size, SHA-256 and bytes, reconstruct the complete state, then upload and verify a manifest **last**. It reads current Firestore twice again to reject a changed source. Zero writes/deletes to Firestore. No automatic invocation.
- `storage.rules` has an un-deployed create/get-only `workspaces/github-prod/state-shards/v1/{field}/{operationId}/{sha256}.json` path, including a `_manifest` shard. Production rule deployment **must not** proceed before explicit verification/approval.
- `tests/omax-sharded-state.test.js` and `tests/omax-working-shards.test.js` are authored but not executed in Node. A synthetic in-memory smoke test executed the happy path with 16 fields/17 mock Storage objects and zero Firestore writes; it used a fake digest and is **not** a Firebase/SHA integration test.

**This copy workflow is not enabled as the site's authoritative store.** The site still reads/writes the original Firestore document; therefore this PR does NOT yet prevent the original 975 KB error. Transitioning the site onto sharded state requires complete load/save/listener/readback/Recovery/rollback integration and disposable-backend acceptance tests. Do not replace or delete the live state on the strength of a staged copy alone.

For later engineering, current 512 KiB per-field design must also support bounded splitting of individual collections as they grow; a single field must never become a new hard stop.

### Actual Nov 17 backup: local-only lossless sharding validation

The user-provided backup was analyzed **locally only** (not committed or uploaded to Firebase). Its exact input SHA-256 is `7798364efc0412f39696c3e8625fdc889ca03329dae062d333665ada7c7f7b38`, 1,349,307 source-file bytes, 35 top-level fields, source rev `1794576947956`. A separate Python offline-audit format split all 35 original top-level values into 35 immutable JSON shards, individually hashed them, checked all were smaller than 512 KiB, and rebuilt the complete parsed state. The rebuilt state exactly matched the original parsed backup, including unknown top-level fields. It produced a separate `OMAX_Offline_Sharded_Backup_Verified_2026-11-17.zip`, available as a user conversation attachment, **not** as a production-ready import or JS-format archive.

This demonstrates current-data partition feasibility only. The Python audit shard serializer and current JavaScript shard serializer are separate formats; they have not been shown to be cross-compatible. It does not establish deployed Storage permission, authoritative Firestore cutover, lossless continued writes, multi-client behavior, or full UI functionality.

### Current blocking deployment checkpoints (2026-11-18)

**Verified:** A live Firebase Storage **probe only** created a 353-byte immutable object under `workspaces/github-prod/working/v1/probe`; browser script independently verified SHA-256, with no Firestore writes/deletes. The Firebase published rule visible in screenshots is the 283-line probe-only ruleset. Project `wj-tracker-v2`, bucket `wj-tracker-v2.firebasestorage.app`, active owner membership, authoritative revision `1794576947956` and 188 occurrence events were confirmed in a fresh server read.

**Prepared for controlled approval, not published:** The conversation artifact `OMAX_Storage_Rules_Probe_And_Shards_2026-11-18.rules` is 334 lines. It contains exactly the original 283-line published-probe source plus one 51-line restricted create/get-only `state-shards/v1` matcher. Removal of the insertion reproduces the prior rule file byte-for-byte, SHA-256 `ddfee42c49622d5bdb7acf565f2f032e1bbbbea37fc555a79ec9c37e50ac3f8c`. Proposed file SHA-256 `dcad95ebbff7ce2f33d3f0db5881574f460f5630582812e682f93e2964032795`. It remains unvalidated by Firebase's official compiler/emulator, so do not describe it as deployed or proven.

**Available F12 stage script:** `OMAX_F12_Verified_Full_Shards_Stage.js` (71 lines, Node syntax check passed) verifies current live revision, creates one immutable Storage field shard per top-level field and one manifest, independently reloads every object, and compares the reconstructed whole state to source reads before and after. **It makes Storage create requests and must not be run until the scoped shard rules are published and reviewed.** It performs zero Firestore writes, no cutover, no legacy data deletion. Stop on any failure/indeterminate outcome.

**Inactive engineered modules:** `omaxWorkingShards.js`, `omaxShardedReadback.js`, `omaxShardedCommit.js` and `omaxShardedState.js`. A synthetic V8 in-memory test demonstrated Stage->Readback->CAS Index Write->Independent Readback, including an exact state comparison, with mocked Firestore and Storage and a fake digest. The code has NOT been integrated into core normal/specialized save/load paths and is NOT deployed as a working capacity fix.

**Before any active cutover:** Freeze/deny legacy writers at rules layer; implement fully centralized logical state read/write/realtime and specialized operations; support field segments that exceed 512 KiB; test corrupted, missing, partial, concurrent, and ambiguous writes, and error recovery; verify complete current production data and independent backups; approve a separately reversible cutover. The app remains nearly at its 975 KB Firestore gate until all these items are done.


### 2026-11-18 MCAP router, bounded segmentation, and rollback checkpoint (NO CUTOVER)

**Live source preserved:** Browser full-copy report PASS, source revision `1794576947956`, 35 fields, 36 immutable Storage objects, 188 occurrences and 180 completed jobs, with zero Firestore writes/deletions. This is a historical snapshot, not an updating backend.

**New draft PR code:** `js/omaxAuthorityRouter.js` selects verified legacy or active-index Storage source, reads all shards and rechecks index consistency. `js/core.js` detects authority changes in open sessions, routes independent maintenance/inventory/cutting-job verification reads, and displays sharded authority read-only. Private core `authoritativeBackendMode` prevents mutable window diagnostics from choosing a backend. Central transaction preparation is shared with the inactive `OMAXShardedCommit` coordinator. **`MCAP_SHARDED_WRITES_ACTIVE = false`**, runtime cloud-write gates and read-only Recovery Mode all remain closed.

`omaxShardedState.js` V1 now supports segmenting growing large arrays and objects while preserving old unsegmented V1 archives, entry order, arbitrary unknown fields, SHA-256 metadata, and 512 KiB per object limits. It rejects any item too large to split and missing/corrupt/duplicate segments. `omaxWorkingShards.js` now reports logical field count separately from physical shard count. `omaxShardedActivation.js` includes a read-only verified exact-state preflight, exclusive index transaction and *pre-first-sharded-write-only* rollback. Proposed Firestore rules for legacy writer lockout and restricted rollback remain untested and undeployed.

**Tests:** One real GitHub Actions run #44348402802 ran Node syntax successfully and found 43/44 unit tests passing; the single failure was strict deep-equality on null-prototype reconstructed objects. Fixed to produce plain objects with safe `Object.defineProperty`. New Node tests added for segment reconstruction, router authority selection and rollback conflicts. GitHub Actions reruns later failed at startup with zero jobs, so **latest complete Node test pass is not yet established**. V8 mock integration exercises passed legacy/sharded reads, growing-array segmented save CAS/readback, index race rejection and pre-write rollback. Those are not live Firebase emulator tests.

**Do not merge or cut over:** The complete site save/load integration remains unproven. Next verify current Node tests and emulator rules, audit all other write paths and compaction, validate legacy-client lockout against an active index, test concurrency and indeterminate states, and only then approve operator-controlled cutover. Never delete or rewrite historical Firestore data as a migration shortcut.


### 2026-11-23 MCAP write certainty and actor-stability checkpoint

- **Verified production snapshot remains immutable, not authoritative:** the Nov 18 user-run readback proved 35 complete fields and 36 Storage objects for Firestore revision `1794576947956`; no source Firestore writes/deletes.
- **Safety correction:** `js/omaxShardedCommit.js` now marks **every failure after index write queued** as `indeterminate:true`, including a later `permission-denied`. Such failures may have committed, so never tell users an automatic retry is safe. A permission denial before the index-write attempt remains a definite failure. Regression tests added for both.
- **Actor stability:** `js/omaxAuthorityRouter.js` pins the signed-in actor throughout the long Storage readback or legacy state lookup; a sign-out/account change fails closed with `actor_changed`. Regression tests cover both branches.
- **GitHub Actions green:** workflow `MCAP Storage migration safety`, run `45195437976` on PR #532 at commit `adc05ef5fd982bc240f20aa2b5e46f635285c989`: Node syntax validation succeeded, **55 tests passed, 0 failed**, and Vercel status was successful at this checkpoint. This covers isolated mocked migration modules, not the real Firebase Rules emulator or full live UI.
- **Still blocked:** Firestore cutover proposal not deployed/tested in emulator; sharded writes remain disabled by private core gate `MCAP_SHARDED_WRITES_ACTIVE=false` plus runtime read-only guards; complete specialized-save, legacy session lockout, full UI browser tests, multi-client CAS and indeterminate recovery verification remain necessary. Do not merge PR or activate index.


### 2026-11-23 independent backend-index verification checkpoint

- **Read-side freshness fix:** Both `js/omaxAuthorityRouter.js` and `js/omaxShardedCommit.js` now read the Firestore authority index using a **read-only Firestore transaction** rather than relying on Firebase v8 `get({source:"server"})`, which can reuse an active listener's stale state after a commit. The resolver uses the same backend transaction for the old state document. Existing calls check exact document identity and reject cache/pending evidence where metadata is available. These independent backend reads reduce the risk of confirming the wrong CAS revision.
- **Regression harness:** Both router and sharded-commit mocks now exercise transaction-bound reads. No Firestore write is attempted by the router; the commit test still counts only CAS writes, preserving pre/post-commit certainty tests.
- **Verified CI:** `MCAP Storage migration safety` run `45195928171`, commit `59babf01e04aec61697f78f9dfc5124faa8a51e5`: Syntax validation PASS and **55/55 Node tests PASS**. Vercel status SUCCESS at check time.
- **Critical remaining production gates unchanged:** Test proposed Firestore writer-lockout/index security rules with Firebase emulator; test full browser saves and legacy-client conflict behavior with disposable fixtures, including Recovery Mode and indeterminate retries. The active sharded write switch remains hard-coded OFF. No automatic migration, no old document deletions, no live cutover.


### 2026-11-23 Firestore emulator cutover rules verification

The proposed `docs/firestore-sharded-cutover-PROPOSAL.rules` has now been **compiled and exercised against the real Firebase Firestore emulator**, in the GitHub Actions PR workflow, exclusively under project `demo-mcap-security`. The production `firebase.json`, `firestore.rules`, published Firestore/Storage rules, and authoritative state were NOT modified.

New isolated test assets: `mcap-firestore-emulator.json`, `tests/mcap-firestore-cutover.emulator.cjs`, and the `cutover-rules` CI job in `.github/workflows/mcap-storage-test.yml`. CI installs emulator test dependencies in runner temporary storage; repo has no package.json and no application dependency installation is required.

**Verified in real emulator** (GitHub Actions run `45197543628`, 2026-11-23): **7/7 Firestore rules tests PASS**, covering pre-index writes, unauthorized actor rejection, valid index creation tied to latest legacy revision, malformed/stale pointer rejection, post-index blocks for all legacy writes/merges/deletes, CAS revision progression and stale writer rejection, rollback allowed only before first sharded commit, preservation of unrelated workspace metadata/log permissions, and an *in-flight old-client transaction* that begins before cutover but attempts to finish after index creation (denied; historical state unchanged). Independent migration Node test job also PASS (55/55 tests), combined **62/62 automated tests PASS**.

**Do not deploy the proposal or enable sharded writes yet.** Emulator rules tests are an important milestone but not equivalent to browser integration or a safe operational cutover. Remaining gates: run complete disposable browser save and reload workflows for each business subsystem and simulated multi-client changes; inspect all legacy writes and data-limit/compaction paths; independently verify latest source revision immediately before activation; secure manual production cutover procedure and safe Recovery Mode for ambiguous outcomes. The immutable 35-field Storage snapshot at revision `1794576947956` remains a historical verified copy, NOT guaranteed current.
