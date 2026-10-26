# MDEL-01C: exact-ID maintenance task restoration

## Read-only audit and implementation plan (before code changes)

Baseline: PR #520, `codex/mdel-01a-safe-task-deletion`, commit
`464339e86c851e34785c473ab534802fed3f85e8`. No package.json or AGENTS.md is
present. The existing main checkout's unrelated style.css edit is untouched.
The reported revision 1792676332802, archived “Mixing Tube .042” and surviving
inventory reference are user-supplied production evidence. No production data
was accessed; its lack of history cannot establish preservation of rich history.

The existing deletion coordinator already reads an independent captured-backend
transaction, checks local/source evidence, validates global identities/content,
and uses the shared atomic CAS writer with exact prepared-state validation.
After commit it independently reads and compares the whole server document,
checks revision/identity and write eligibility, then adopts. Uncertainty stops
writes without retry. Protected-count projection is restricted to one intact
active-to-archive transfer. The writer itself owns syncMeta revision/time/actor.

Typed, dated task archives participate in the exact legacy-task identity
namespace. Inventory linkedTaskId and V2 legacyTaskId can target one unique
archive. Wrong owners, active/archive collisions and unrelated FK corruption
remain blockers. Archives retain complete task payloads and do not expire.

`applyRestoreByType` deliberately blocks task restoration. `restoreDeletedItem`
otherwise mutates local collections and schedules an ordinary save; that is not
appropriate for exact restoration. The pre-PR task branch regenerated IDs on
collision, normalized fields and searched for/relinked inventory. Linked-entry
restoration also calls that synchronous generic helper. None of those paths may
implicitly restore a maintenance task. Deleted History currently disables both
task action buttons, so no usable safe restoration exists.

Legacy history is inside archived completedDates/manualHistory/notes/config.
V2 definitions, instances and occurrences remain in their original collections;
inventory/purchase/history foreign keys remain unchanged. Historical readers use
archive payloads. `projectV2RepeatDates` suppresses new projections while the
legacy definition is archived. Exact restoration removes that suppression:
existing enabled rules resume projections with the same anchors/algorithm.
Explicitly stored future events and every stored recurrence field must remain
identical. Confirmation must disclose that existing repeat projections resume;
restoration must not persist invented dates, catch-up events or recurrence edits.

Existing accountability is the archive's deletion evidence, existing sync/process
logs and writer-owned syncMeta actor/time/revision. There is no maintenance
restore ledger. Preserve all unrelated audit evidence and return the consumed
archive in verified operation evidence; do not keep a second owning archive or
invent a new persistent audit schema under the exact-transfer authorization.

Implementation sequence:

1. Add a pure restore planner that requires one exact dated task archive,
   canonical IDs, consistent original-ID/list ownership and no active collision.
   Older entries may omit originalId when payload ID and an original list are
   unambiguous. Reject archives with no reliable original-list evidence.
2. Extend the existing coordinator's shared busy lock with restoration. Bind
   confirmation to the exact archive evidence; reverse only that transfer through
   the same independent reads, CAS, whole-state proof and prepared-state/global
   validation. Keep failure/uncertainty evidence and never retry or clear gates.
3. Keep generic synchronous task restoration blocked. Route explicit confirmed
   task restoration from Deleted History to the isolated coordinator and await
   verification before displaying success/removing the row. Keep permanent
   deletion disabled. Expose recovery/write blockers in button availability.
4. Exercise deletion/restoration with no history and rich legacy/V2 history,
   duplicate names/same-day occurrences, inventory and old archives; compare all
   business data. Test malformed ownership/collisions, CAS/concurrency, failed
   writes/readback, unrelated corruption/blockers and non-normalizing adoption.
5. Exercise actual Restore confirmation/cancellation, reload, simulated logout/
   login and a second disposable browser session against an isolated backend.
   Block all external requests; never use production Firebase.
6. Review overlap with PR #521 and #519 without merging their work. Run existing
   MDEL/related regressions, syntax/whitespace/binary checks, commit/push and
   update existing PR #520 only. Do not merge.

## Implemented functions and transaction contract

- `js/maintenanceTaskArchive.js`: `planRestore` verifies the exact archive ID,
  payload ID, dated task type, metadata ownership, original list and absence of
  active/archive collisions. It appends the entire unchanged payload to its
  original list and removes only that owning Trash entry. `safetyBaseline`
  independently reconstructs the authorized result and compares the entire
  document except writer-owned syncMeta before allowing protected-count
  projection. `createApi` now shares one busy lock for remove/restore, binds
  confirmation to the full archive, and returns consumed archive evidence only
  after independent committed-state verification and safe adoption.
- `js/core.js`: `restoreDeletedItem` routes tasks to the awaited coordinator and
  reports ok only for saved-and-verified results. `applyRestoreByType` continues
  blocking implicit/synchronous task restoration, including linked-entry calls.
  The existing `maintenanceTaskDeletionApi` adapter serves both transfers, so
  its existing listener/write lock remains in effect. Availability additionally
  respects pending changes, identity/import/material/chronology verification and
  other mutation blockers. Validation now uses the complete authoritative
  identity/content/shape/size/protected-preflight check, at source, proposed,
  prepared and committed-readback stages. The shared atomic writer is unchanged.
- `js/renderers.js`: `renderDeletedItems` enables Restore only for a valid plan
  and available writer. It confirms the exact task, explains repeat resumption,
  awaits verification and then removes the deleted row. Recovery/invalid archives
  disable restoration. Delete forever remains disabled. Settings deletion copy
  now points to the safe Restore action. Archived Settings activation remains
  read-only until explicit restoration from Deleted History.
- `tests/mdel01-harness.cjs` extracts the existing real-core/atomic-writer test
  harness for reuse, with fault hooks. `tests/mdel01b-verification.test.js` keeps
  all twenty existing assertions/scenarios. New restoration unit and browser
  files exercise the expanded contract. No test imports a different PR's code.
- `scripts/mdel01c-archived-fk-baseline.cjs` is an explicit, read-only comparison
  against this PR's main-base validator. It is outside automatic test discovery
  so ordinary unit runs also work in shallow Git checkouts.
- This report and the 01A report link document the current scope.

The isolated write uses the existing captured backend/document/user and fixed
expected revision. Before transaction.set, source and prepared validators must
accept the same complete document, and the original protected/size/content/CAS
checks must pass. The prepared state cannot alter any unrelated field, archive,
task history, link or V2 record. The writer then changes syncMeta revision,
updatedAtISO and updatedBy using its existing rules. Readback uses a separate
read-only transaction, never the potentially stale Firebase v8 server-get view.
It must equal the acknowledged committedState and the planned transfer after
substituting the original syncMeta. Local revision/evidence, captured target,
complete integrity and write eligibility are rechecked before adoption.

Conflicts, invalid sources and definite failures do not adopt or retry. Lost
acknowledgement, unavailable/different readback, actor/backend switches and
post-commit adoption uncertainty suspend further writes and preserve unrelated
blockers. No recovery flag is forced off. The existing authoritative adopter can
unlock only after its complete validation; it is never called for a successful
restore while another write/recovery blocker is present.

Accountability uses existing mechanisms: writer-owned syncMeta identifies the
committing client/time/revision, the verified result contains the exact consumed
archive/deletion evidence, and a successful adoption adds task/archive IDs to
the existing local Data Flow log. This log is local display evidence with its
existing retention policy, not a new durable maintenance audit ledger. The
transaction leaves all server process logs unchanged and performs no second
save. It does not retain a second owning archived identity.

## Preservation and recovery evidence

| Coverage | Executed evidence |
| --- | --- |
| A: no history | Delete/restore through real core writer; complete payload and whole unrelated state equal |
| B/C: multiple dates, manualHistory and notes | Three completed dates, independent same-day manual records, notes/config/provenance compare identically active → archived → restored |
| D/G/P: V2, distinct same-day occurrences, history/costs | Complete V2 collections/IDs and compatibility evidence unchanged; separate roots, snapshots/hours and normalized cost rows compare across all three states |
| E/F: inventory and duplicate names | Same-name tasks have distinct IDs; only selected task moves, exact inventory linkedTaskId and every other link survive |
| H/I/R: invalid ownership and duplicates | Wrong originalId/list/type/date/metadata, missing list evidence, noncanonical IDs, duplicate archive entry/payload IDs and active collisions reject without mutation |
| J: concurrency | Fixed-revision CAS, changed local/remote evidence, two simultaneous Restore calls plus Delete; at most one transfer commits |
| K: failures/uncertainty | Permission denial, unknown acknowledgement with/without commit, readback failure/mismatch, later commit, logout/backend switch and adoption failure; no success or retry, uncertainty remains suspended |
| L: genuine corruption | Missing inventory/task targets, broken archived links, invalid protected shapes and embedded file content still block |
| M: persistence | Real Restore click and cancellation; reload, simulated signed-out/in initialization, second isolated browser context reading the same localhost backend |
| N: old Trash | 2020 archive with no originalId but exact payload ID and original list; no expiry, renaming or replacement ID |
| O: full protected data | Whole planned/committed document equality except syncMeta; all unrelated collections/unknown configuration unchanged; matching backup unchanged |
| Q: recurrence | Archived projection is empty; restored projection equals original at the same test clock. Instance rules/anchors and all stored historical/future events remain identical |
| Recovery regression | Main-base validator reproduces the reported synthetic inventory orphan; PR validator resolves the unique archive. Deletion/restoration remain outside Recovery Mode; unrelated recovery/repair flags block and survive |

In the browser tests, rich-history and older no-history workflows each provision
fresh disposable data. Two independent browser contexts have separate local
storage/profiles and share an in-memory localhost backend with exact-source
transaction checks. The actual app core, atomic writer, validators, adopter,
Settings deletion and Deleted History Restore run against that adapter. Browser
Firebase is undefined, all external requests are blocked, and test writes are
only to local fixtures. Logout/login is a simulated auth boundary and workspace
reinitialization; no live auth SDK or production account is used. Native pointer
clicks exercise Restore/confirmation/cancellation. Settings context-menu deletion
still uses dispatchEvent because of the pre-existing header overlap.

## Commands and actual results

All commands run from the PR worktree. No package.json exists and no npm script
was invoked.

```powershell
node scripts/mdel01c-archived-fk-baseline.cjs
# PASS: actual main-base validator rejects synthetic archived inventory FK;
# current validator accepts only the exact archive, source unchanged.

node --test --test-reporter=tap tests/mdel01c-restoration.test.js tests/mdel01b-verification.test.js tests/mdel01-task-deletion.test.js tests/atomic-persistence.test.js tests/inventory-material-persistence.test.js tests/inventory-identity.test.js tests/inventory-identity-repair.test.js tests/global-identity-repair.test.js tests/production-hardening.test.js tests/maintenance-task-setup.test.js tests/maintenance-history-import.test.js tests/maintenance-new-one-time.test.js tests/mcf-01-maintenance-calendar.test.js tests/recovery-import.test.js tests/cjo06-archived-identity.test.js tests/purchase-orders.test.js tests/purchase-financials.test.js tests/purchase-history-navigation.test.js tests/cut-cost-feedback.test.js tests/cut-cost-cumulative-hours.test.js
# PASS: 602/602, zero failures.

node --test --test-reporter=tap tests/mdel01c-restoration.test.js
# PASS: 54/54 final restoration checks after moving the historical Git-object
# experiment to its explicit script; no production-code change in that move.

node --test tests/mdel01c-restoration.test.js tests/mdel01b-verification.test.js tests/mdel01-task-deletion.test.js
# PASS: 99/99 final MDEL checks after making common transfer errors apply to
# restoration as well as deletion; only user-facing error text changed.

$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node --test --test-reporter=tap tests/mdel01c-restoration.browser.cjs tests/mdel01-task-deletion.browser.cjs
# PASS: 4/4 disposable Edge workflows, including both existing deletion tests.

$files=@('js/maintenanceTaskArchive.js','js/core.js','js/renderers.js','js/globalIdentityRepair.js','js/calendar.js','js/atomicPersistence.js','tests/mdel01-harness.cjs','tests/mdel01b-verification.test.js','tests/mdel01c-restoration.test.js','tests/mdel01c-restoration.browser.cjs','scripts/mdel01c-archived-fk-baseline.cjs')
foreach ($file in $files) { node --check $file; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
& 'C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/check_binaries.py
git diff --check
# PASS.
```

Initial implementation checks passed the existing 45 MDEL tests. One new test
initially used an object as the strictly boolean Recovery Mode flag; correcting
that test input produced the passing restoration suite without weakening the
runtime check. The full repository suite was not rerun for 01C. The earlier 01A
full run and ten independently reproduced main-baseline failures remain recorded
in the linked 01A report; the 602 checks above are the current targeted claim.
Generated TAP and read-only merge-preview reports remain untracked in artifacts/.

## PR #521 / #519 integration review

Review uses main base `633e144c76c564e88419e4c0f3b1efe8027b132d`, MHIST head
`b145455cbf6e1e2055374db078e145fe7c545010` and COSTDATA head
`549dade387b506d59148e2daacc9c221fba307da`. Read-only three-tree comparisons
do not merge, change the checkout or incorporate their code.

- **MHIST #521:** two textual conflicts in js/calendar.js where it clones active
  interval/as-required arrays for the shared event builder and MDEL includes
  historical archive definitions. A future integration must preserve both
  archive-aware historicalTasks (including archived interval definitions) and
  defensive copies in the shared builder. Keep MDEL repeat suppression and V2
  deleted-name projection. Both PRs touch renderers.js, but current changes there
  merge textually: shared history controls versus archive/restore UI. History
  reader behavior must still be retested on the eventual combined branch.
- **COSTDATA #519:** current three-tree comparison has no textual conflict.
  It touches core.js read/refresh behavior and renderers.js history collection.
  Semantic integration review is still necessary: MDEL feeds archived copies via
  historicalTasks while COSTDATA also explicitly captures deleted payloads and
  preserves source occurrence keys. A future combined test must prove one copy
  per stable event, correct deleted display/link behavior and restored costs
  before/after restoration. Textual auto-merge is not evidence of correctness.
  Preserve the complete metadata-bearing source task and exact archive ID;
  names must not determine history ownership.

Neither PR was merged, cherry-picked or incorporated here. Global archived-task
identity validation is unchanged in 01C; restoration changes its unique owner
from typed Trash payload to active list, with all original references intact.

## Limits and assessment

The provided production evidence is not independently re-read. No live deletion,
restoration, Firebase inspection, migration or backfill was performed. Authenticated
Firestore permissions/transport and real logout/login were not exercised; only
the real writer/coordinator with fault-injected and disposable local adapters
was tested. Other browser engines/devices and the eventual combined #519/#521
branch remain unverified. Archives lacking reliable original-list evidence are
deliberately blocked for review rather than guessed. There is no new permanent
maintenance audit ledger or automatic recurrence backfill.

Assessment: **READY TO MERGE for the standalone PR #520 exact-ID workflow**, with
the explicit limitations above. This does not authorize a live restoration or
merge. Future integration of #521 needs the documented calendar conflict
resolution and combined regression checks. The PR is left unmerged.
