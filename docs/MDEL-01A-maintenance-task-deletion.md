# MDEL-01A: Safe maintenance task deletion

Maintenance Settings now moves exactly one task definition into the existing
`deletedItems` collection while retaining its original ID and complete payload.
Archived definitions are read-only in this version. Firebase remains authoritative.

## Starting state

- Original branch: `codex/phv2-02a-purchase-orders`.
- Original HEAD: `b2e7fb8f11855c2ee895044e74c1b9a32e8a6e5b`.
- Fetched `origin/main`: `633e144c76c564e88419e4c0f3b1efe8027b132d`.
- Original checkout had modified `style.css` and untracked `.worktrees/` and
  `artifacts/`. These were preserved without stashing or resetting.
- Implementation branch: `codex/mdel-01a-safe-task-deletion`, in a separate
  worktree created directly from the fetched main commit.
- No `package.json` or repository `AGENTS.md` was present.

## Root cause and investigation

Active Settings definitions live in `tasksInterval` and `tasksAsReq`, identified
by stable `id` values. Calendar V2 also stores `maintenanceTasksV2` definitions
with `legacyTaskId`, instances, and occurrence events.

The former Settings deletion handler recorded a task payload in Trash, removed
the active definition and its legacy instances, cleared child parent references,
and optionally deleted inventory. The global validator resolved
`inventory.linkedTaskId` and V2 `legacyTaskId` only against active definitions.
Consequently, a legitimate surviving inventory link became an apparent orphan
and triggered Recovery Mode on authoritative adoption. Trash already contained
the complete task payload, but was not a recognized task identity source.

Additional hazards were 30-day archive expiry, ID-regenerating task restoration,
render-time restoration by task name, and refill of authoritative empty Settings
lists from local caches/defaults. These paths now preserve deliberate removal.

## Identity and persistence rules

- Active and typed task archives participate in the same legacy identity
  namespace. Resolution requires one exact stable ID. Names never disambiguate
  identities. Active/archive collisions, duplicate archives, invalid owning IDs,
  invalid dates, contradictory original-ID metadata, and genuine FK orphans block.
- Live inventory `linkedTaskId`, V2 legacy references, purchase task references,
  archive inventory/category/parent/template references, and nested historical
  references remain validated. No link is cleared or transferred.
- The isolated deletion coordinator reads the server, checks the loaded/local
  baseline, and invokes the existing atomic writer with exact source/result
  validators and a captured backend. Only one intact task-to-Trash transfer is
  allowed. The protected-count baseline projection applies only after proving
  that exact transfer across the entire state; unrelated fields remain guarded.
- CAS, runtime recovery gates, content firewall, size limits, protected-field
  checks, exact server readback, and authoritative adoption remain operational.
  Failed or uncertain writes never produce a success notification or an automatic
  retry; uncertain outcomes preserve evidence and suspend further writes.
- Archives do not expire and cannot be permanently removed through Trash.
  Lightweight/emergency backups also retain maintenance task archives.

## Reference consumers and behavior

Inventory, Purchase History, receipt rows, costs, notes, completion evidence,
calendar instances, occurrence events, surviving legacy instances, and stored
reports are preserved. The delete operation changes only the selected active
task list, Trash, and writer-owned sync metadata.

Read projections include archive payloads for the maintenance compatibility
stream, Central Data Table, Cost Analysis, Dashboard opportunity history, and
legacy calendar history. Deleted names receive ` — Deleted` in display copies;
the stored names and evidence remain unchanged. Reporting task deduplication uses
IDs rather than a name/configuration equivalence key.

V2 definitions linked to an archived legacy definition retain their identity for
existing events. New repeat projections stop. Explicitly stored future events
remain visible, along with historical completions. Deleting an individual
calendar occurrence continues to use its separate lifecycle handlers.

Archived task definitions cannot be edited or restored through the old unsafe
restore path. Settings/history activation explains the read-only state. Trash
buttons are disabled for these archives. Exact-ID Restore-to-Edit is deferred;
no replacement task ID or automatic inventory relinking is introduced.

Purchase-order validation accepts exact archived task identities. Inventory-led
purchase selection uses its exact linked ID before considering name-based input;
ambiguous name input does not choose an arbitrary active task.

## The two production “Mixing Tube .042” records

The repository and available connection do not provide the actual production
records. Their exact IDs, inventory links, recurrence, creation/import provenance,
calendar events, completions, purchases, costs, and existing Trash relationships
could not be established. No production IDs were invented and no production data
was read or written. The fixture uses explicitly synthetic A/B IDs with identical
names, separate inventory, and retained history to exercise this regression.

## Files

- `js/maintenanceTaskArchive.js`: exact-ID resolution, read projections, deletion
  plan, conservation proof, and verified mutation coordinator.
- `js/globalIdentityRepair.js`: archived identity ownership and task FK validation.
- `js/core.js`: atomic-writer integration, read-only restoration, retention,
  backups, realtime coordination, and compatibility stream.
- `js/renderers.js`: Settings deletion, historical read/display behavior, purchase
  link resolution, and Trash controls.
- `js/calendar.js`: archive history/display and repeat projection behavior.
- `js/opportunity.js`: Dashboard historical maintenance inputs.
- `index.html`: load the archive helper before its consumers.
- `tests/fixtures/mdel01-maintenance-task.js`,
  `tests/mdel01-task-deletion.test.js`, and
  `tests/mdel01-task-deletion.browser.cjs`: isolated regression fixtures/tests.

## Verification

All commands run from the feature worktree unless otherwise stated.

- `node --test tests/mdel01-task-deletion.test.js`: **PASS**, 25 tests. Includes
  interval/as-required deletion, same-name IDs, surviving legacy instances,
  archived/missing/ambiguous identities, unrelated FK corruption, actual shared
  writer/protected guards, CAS/failures/uncertainty, retention, reload, calendar,
  Central Data Table, and Cost Analysis evidence.
- The focused 16-file regression command below: **PASS**, 392 tests before the
  additional as-required/legacy-child test was added (that test passes in the
  final 25-test file).
- `node --test (rg --files tests -g '*.test.js')`: **FAIL**, 1,701 pass / 10 fail
  (1,711 total). All ten failures reproduce unchanged on the fetched main commit
  in the three files named below. No new regression failures were observed.
- Baseline check in a clean `git archive origin/main` extraction:
  `node --test tests/cjo02b-safety.test.js tests/cjpc01-manual-paths.test.js tests/projects-accuracy.test.js`:
  **FAIL**, 67 pass / 10 fail. These concern older job-add/edit test harnesses,
  repair UI mocks, and the project duration expectation; they are outside this fix.
- Browser command below: **PASS**, one disposable Edge test. Every non-localhost
  request is blocked and Firebase SDK access is unavailable. Tests the Settings
  context-menu handler, confirmation, exact preservation, reload, integrity,
  reporting evaluation, and read-only definition activation. The menu click is
  dispatched because an existing header overlaps it in the test viewport; native
  pointer positioning of that menu is not verified.
- `node --check` on every changed JavaScript file, the closely related
  `js/atomicPersistence.js`, and the new browser test: **PASS**.
- `git diff --check`: **PASS**.
- `rg` inspection covered deletion, archive retention, identity resolution, task
  references, reporting readers, and duplicate-name evidence. No package scripts
  exist for build, lint, or type-check.

```powershell
node --test tests/mdel01-task-deletion.test.js tests/global-identity-repair.test.js tests/cjo06-archived-identity.test.js tests/inventory-identity.test.js tests/inventory-identity-repair.test.js tests/maintenance-task-setup.test.js tests/maintenance-history-import.test.js tests/maintenance-new-one-time.test.js tests/mcf-01-maintenance-calendar.test.js tests/recovery-import.test.js tests/cut-cost-feedback.test.js tests/purchase-orders.test.js tests/purchase-financials.test.js tests/purchase-history-navigation.test.js tests/production-hardening.test.js tests/atomic-persistence.test.js

$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node --test tests/mdel01-task-deletion.browser.cjs

node --check js/maintenanceTaskArchive.js
node --check js/core.js
node --check js/globalIdentityRepair.js
node --check js/renderers.js
node --check js/calendar.js
node --check js/opportunity.js
node --check js/atomicPersistence.js
node --check tests/mdel01-task-deletion.browser.cjs
git diff --check
```

## Limits and recommendation

Production-specific duplicate relationships and authenticated Firebase behavior
were not tested. The browser test uses the existing disposable backend, not a
Firebase emulator or production Firestore. Unsettled local changes block deletion
for review rather than overwriting them. Indefinite archive retention consumes
document space, so the existing payload-size limit still applies. A verified
exact-ID restoration workflow remains future work.

Recommendation: **SAFE TO MERGE** for the requested read-only archive version.
The ten independently reproduced baseline test failures remain separate issues.
