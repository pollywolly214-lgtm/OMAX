# FIREBASE-2PC-01B — second-computer save baselines

Started from fetched `origin/main` **d8466a5fffad604a34812a92dcbf25c71109b31f** on `codex/firebase-2pc-01b` in `.worktrees/firebase-2pc-01b`.
The original checkout was on `codex/phv2-02a-purchase-orders` with modified `style.css` and untracked `.worktrees/` and `artifacts/`; those changes were left untouched. The fix worktree started clean.

## Reproduced cause and evidence

Initial loading (`loadFromCloud` → `adoptIdentityCheckedAuthoritativeState` → `adoptState` with `preserveAuthoritative:true` → `adoptAuthoritativeRecoveryState`, in `js/core.js`) preserves raw authoritative records and initializes the revision gates correctly. However, `snapshotState` subsequently applied UI/storage model normalizers to that preserved evidence. This was a real business-value mismatch, not an object-property ordering issue or merely different timestamps:

- `normalizeAppConfig` adds defaults and drops fields outside its recognized schema.
- `normalizeInventoryMaterials` reconstructs material types/sheets/rows, drops extension fields, and can insert standard thickness rows.
- `snapshotJobFolders` and `snapshotSettingsFolders` normalize and assign live bindings while supposedly just reading a baseline.
- The old snapshot's fixed envelope also drops unknown server fields and replaces the loaded schema with the running app's schema.

The new test uses real adoption, snapshotting, config/material normalizers, save coordinators, protected preflight and CAS writer against an in-memory Firebase interface. Before the fix, its snapshot comparison differs at config/material/folder fields and unknown evidence; cutting and maintenance operations produce the **exact two reported rejection messages** before any transaction.

The supplied live diagnostics contain revisions and gate flags, but no business payloads. They cannot identify the incident's exact differing field paths. This change fixes the reproduced implementation defect; it does not claim to have compared the production document with that browser's local records. Production Firebase was never accessed or modified.

## Exact warning conditions and paths

- `js/maintenanceCalendarIntegrity.js:createMutationRunner` emits **“Maintenance baseline changed. Reload before retrying.”** when the server state is missing, its revision differs from the loaded revision, writing is disallowed, normalized local/server business state differs, or local state changes during the server read. Both maintenance UI callers in `js/renderers.js` await `runMaintenanceCalendarMutation` before creating an action. This check intentionally includes unrelated business data; it is unchanged.
- `js/cuttingJobChronology.js:createMutationApi.save` emits **“Authoritative or local baseline changed; review again.”** if local version/target changes, the server state is missing, `expectedRevision` differs, or the production adapter's `baselineMatches` fails. The adapter in `js/core.js` compares the server against both `__lastLoadedCloudState` and `getCuttingJobChronologyLocalState`. The latter formerly read the normalizing snapshot. Its metadata already came from the loaded source, so a different local client ID was not itself the cause. All these comparisons remain intact.
- The **unverified cutting-job display** notice is rendered in both cutting views in `js/views.js`, controlled by `__cuttingJobDisplayUnconfirmed`. The chronology suspension callback sets it after an indeterminate write or failed readback; the early baseline rejection alone does not set it. Other isolated cutting/category saves can also suspend the display. Thus a previously failed verification can explain the banner, but the supplied flags cannot tie its history to these particular attempts. Failed verification remains a failure with Recovery Mode/write blocking; only verified cutting adoption clears the notice.

## Dashboard layout save trace

`persistDashboardLayout` (`js/renderers.js`) clones layout state into local storage, updates `cloudDashboardLayout`, and calls `saveCloudDebounced`. That marks a local mutation and queues `performCloudSave`. The save snapshots/compacts state, scans the content firewall, runs size/history/reduction/schema checks, reads the current remote baseline, checks revisions/protected state and performs the existing protected merges. `writeAuthoritativeStateSnapshot` invokes `OMAXAtomicPersistence.save`, whose transaction reads the current server revision and requires exact `expectedRevision`, reruns protected preflight and queues the write. The transaction stamps its committed revision and the current client ID. Only successful acknowledgement advances the loaded baseline; failures remain failures.

The general layout path does **not** invoke maintenance-specific validation. Its existing confirmation is the transaction acknowledgement. Maintenance and cutting coordinators additionally perform their existing authoritative readback and exact comparisons; the cutting coordinator requires server/no-pending-write proof, bounded stale read retries and exact committed-state verification before adoption. This PR does not remove or substitute any readback.

## Changes

Only production file changed: `js/core.js`.

1. After authoritative adoption, `snapshotState` clones the loaded envelope and overlays actual supported live records and current cloud layout bindings without running UI normalizers. It preserves unknown evidence and the loaded schema; it still produces pending save metadata. Missing empty optional collections stay missing, while actions can add populated collections. Snapshotting no longer rewrites folder bindings. The fallback path before authoritative adoption is unchanged.
2. `startWorkspaceStateListener` uses `adoptIdentityCheckedAuthoritativeState`, the same checked evidence-preserving adoption used for initial loading. The older realtime path called normalizing `adoptState` directly and could establish a revision whose live records no longer matched its saved baseline.
3. Added `tests/firebase-two-computer-baseline.test.js`; updated the existing realtime test's adoption mock to the shared checked entry point.

No baseline comparator, revision/CAS check, expectedRevision validation, protected-data preflight/reduction check, firewall, backup exclusion/recovery policy, transaction writer, readback verifier, Firebase rule, authorization setting or production business record was disabled or changed. No last-write-wins or forced-success path was introduced.

## Validation

No package.json exists in this checkout; no npm commands were used.

- `node --check js/core.js`
- `node --check tests/firebase-two-computer-baseline.test.js`
- `node --check tests/cjo04-review.test.js`
- `git diff --check`
- `node --test tests/firebase-two-computer-baseline.test.js` — **11/11 passed**. Covers exact post-load baselines without snapshot side effects; independent client IDs with the same UID; layout, maintenance and cutting saves; realtime revision adoption followed by saving; unchanged-revision local/server mismatches; stale expectedRevision; layout avoiding maintenance coordinator; failed verification/recovery; protected reduction; exact unrelated field retention.
- `node --test tests/firebase-two-computer-baseline.test.js tests/cjo04-review.test.js tests/weekly-cost-report-baseline.test.js tests/atomic-persistence.test.js tests/mcf-01-maintenance-calendar.test.js tests/cjo04c-readback.test.js` — **113/113 passed**.
- Before-fix reproduction: ran the new snapshot/cutting/maintenance scenarios with `OMAX_CORE_PATH` pointing to `git show origin/main:js/core.js`. **0/3 passed, 3 expected failures**: actual business snapshot difference and the two exact warning strings. No missing mocks in these three reproductions.
- `node --test tests/*.test.js` — **1,489 tests: 1,487 passed, 2 failed**. Both failures are the existing Jobs-form test-context errors described below; no new failures remain.

The full suite has two existing failures in `tests/cjo02b-safety.test.js` (canonical/mixed Jobs add handlers), both `ReferenceError: syncNewCuttingJobSaveControls is not defined` in the isolated test context. An untouched `git archive origin/main` reproduces both: **24/26 passed, 2 failed**. Neither this test file nor the renderer is changed by the fix.

Not exercised: physical Computer A/B sessions, Edge 155 storage/privacy behavior, production dashboard dragging/reloading, production network loss, or production Firebase writes. All new Firebase tests are isolated mocks.

## Secondary Firestore warning

`applyFirestoreSettings` spreads SDK `_settings` into another `settings` call when enabling `ignoreUndefinedProperties`; the spread can include the host, explaining the SDK host-override warning independently of baseline equality. Successful server reads and the reproduced offline baseline failures do not implicate that warning in the rejection. No settings/host change is included in this focused fix.
