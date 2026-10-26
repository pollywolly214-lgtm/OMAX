# RFS-02B — authorized cancellation with preserved history

Pre-edit plan, October 26, 2026. Continue existing PR #523 on
`recovery-firebase-save-audit-rfs02`, starting at `8964a43`. Main remains
`0c11b0f`; #523 is open and unmerged. No new PR, production writes or merge.

## Semantics and exact planned paths

- **Legacy single:** hide the selected legacy definition/date (and explicit
  template-instance mirrors when selecting that template). Preserve the complete
  source record, completion/date/history/note/cost payloads. Do not infer ownership
  of distinct same-day V2 roots from a date/name. A completed selected entry may
  be hidden from the active Calendar; its history is still present.
- **Legacy future:** cancel scheduled/uncompleted occurrences on/after the
  selected displayed business date for that definition and its explicit linked
  schedules. Completed history stays visible and exact, including future-dated
  completions. No finite-date enumeration or recurrence-anchor rewrite.
- **All scheduled:** same policy at every date; completed records remain. It is
  not permission to erase all past occurrences.
- **Repeat single:** append the existing `removed` lifecycle event bound to one
  exact instance/task/root, including virtual slot roots. Other roots survive.
- **Stop repeat:** change only the exact repeat instance's tracking status/time
  and append an existing `stopped` lifecycle event. Stop virtual projection;
  retain stored scheduled/completed events and their notes/costs. Do not combine
  removal and stop because a projection window happens to show one slot.
- **Archive/restore:** retain existing verified single-definition transfers and
  exact original ID restoration. Restore does not reverse an independent prior
  cancellation. No task-family deletion or inventory unlink.

Plan: new `js/maintenanceCalendarCancellation.js` supplies isolated pure planners,
exact operation-specific conservation proof, strict ledger/root validation,
read-only visibility queries, verified mutation coordinator and bounded receipts.
Legacy definitions need a small append-only `calendarCancellations` ledger:
existing `removedOccurrences` has no durable future/all scope and writing
`manualHistory.status=removed` would alter historical completion semantics. The
new nested ledger records intent only; no history migration is performed. V2
single/stop use the existing occurrence stream and exact IDs.

`js/core.js`: wire the coordinator to existing captured backend/actor, queue,
guarded CAS writer, backup and independent backend read/adoption; add its lock to
save/listener/archive guards, validate ledgers during adoption and protect nested
ledger counts. Only a verified append/status delta is allowed; no protected-data
baseline exemption is planned. `index.html`: load the module before core.

`js/calendar.js`: await replacements in `removeCalendarTaskOccurrences`, repeat
Remove and Stop handlers, replace the last-visible automatic remove+stop policy,
and filter active Calendar display using cancellation intent while leaving source
history untouched. Add the existing missing all-scheduled UI scope explicitly.
Read helpers get copies where they previously normalized protected definitions.

Tests: rich disposable fixture with 12 stable legacy/V2 historical occurrences,
linked inventory, distinct roots, notes, hours, costs and future scheduling; every
scope, exact conservation, malicious history loss before commit, CAS/two-client
conflicts, failed/unknown writes, readback/local/actor drift, repeated saves and
reloads. Actual browser clicks exercise the same coordinator and guards. Update
RFS-02 tests/docs to remove superseded expectations of unavailable operations.

## Undo architecture boundary

Existing undoStack/redoStack store whole JSON snapshots and applyHistorySnapshot
runs the protected writer with special job-only transfer proofs. Ctrl/Cmd+Z calls
that existing mechanism. Backups are recovery evidence, not permission to replace
newer Firebase data. Cancellation must not be added as an old-snapshot replay.

The coordinator may return verified receipts containing target identity,
source/committed revisions, operation ID and only owned deltas. A future inverse
must freshly read the backend, verify those owned postconditions, preserve every
other current field, plan a scoped inverse, use current CAS and independently
verify/adopt. Unknown outcomes require independent investigation, never automatic
retry or an old-state overwrite. No new site-wide key handler is planned.
Exact-ID archive restoration is the already implemented first verified inverse
case: it consumes one exact archive with original identity under current CAS.

### Browser finding before the associated renderer edit

The first rich-browser cancellation correctly rejected before writing because
`renderNextDueWidget` in `js/renderers.js` passed the live legacy instance into
`nextDue`/history normalizers. The exact mismatch was
`tasksInterval[2].recurrence.completionAnchorHours`. Add this function to scope:
use disposable view copies, exclude recorded single cancellations when selecting
the next date, and suppress cancelled future/all scheduled dates in this view.
This is read-model work; no recurrence anchors or historical records are saved.
An unrelated incomplete pump fixture was given its normal empty notes array
during synthetic provisioning; no production pump logic is changed.

### Archive coverage finding before the associated guard edit

The real browser exposed two active-only coverage sources after a proven task
transfer: window coverage was not projected into the archive, and backup
compaction filtered task archives but then its generic `deletedItems` trimming
removed that filtered collection anyway. Preserve task-only archives during
backup sanitization. Compare backup task lists and task archives against the
remote evidence (other Trash types are intentionally absent from backups), then
project only those exact matching task fields after the whole-state archive
proof succeeds. Apply the same exact-match requirement to window coverage.
Unmatched backup/window evidence and every unrelated protected guard remain.

The same browser also found `renderSettings` recurrence display normalization
changing `completionAnchorHours` from null to zero, which invalidated the next
Restore request. Add its three read-only paths to scope: normalize a view copy
inside task HTML and field relevance rendering; do not normalize live recurrence
in `ensureTaskDefaults`. Explicit user-edit normalization remains in edit handlers.

### Existing PR review evidence inspected before the associated revision edit

PR #523's existing review identified an ordinary-save race before publishing
readback proof: a newer independently adopted listener revision can be replaced
by the older verified save revision. This differs from the already tested late
metadata race. Add a real save regression that adopts a newer state during
readback and then saves another change. Preserve that newer adopted baseline and
the maximum applied revision; never adopt an old readback over current bindings.

## Delivered behavior and conservation

| User action | Authorized delta | Preserved evidence |
|---|---|---|
| Legacy Remove one | Append one definition/date cancellation | Entire original definition/instance; completion dates, manual history, notes, hours, downtime/costs, inventory links |
| Legacy Remove future | Append cutoff intent; hide scheduled dates on/after it | Every completed occurrence and every stored future event; unrelated definitions/roots |
| Legacy Remove all scheduled | Append all-scheduled intent | Completed history at every date; original scheduled records remain recoverable |
| Repeat Remove | Append `removed` for one exact root | Prior root events, all other roots, instance tracking status |
| Stop repeat tracking | Exact instance status/time plus `stopped` event | Stored scheduled/completed events, notes/costs; no deletion or recurrence rewrite |
| Calendar/Settings Remove task | Existing exact active-to-archive transfer | Complete payload and original ID, ledger, linked inventory, V2 identities/history |
| Trash Restore | Existing exact archive-to-active transfer | Original ID and complete payload; all independent cancellation intent remains |

Cancellation is intentional display/lifecycle state. Archived/retired records
remain valid historical identities. Preserved history can be hidden from the
active Calendar without being erased from source records. Actual prohibited
destruction includes dropping/replacing a historical event ID, completion,
notes/hours/cost payload, inventory reference, unrelated task or archive. The
new coordinator recomputes the authorized plan and compares the entire proposed
state, including order and every unrelated field. It does not approve a change
merely because counts look plausible. Only transaction `syncMeta` may differ
after commit. Single legacy/date cancellation does not infer ownership of a
separate V2 root by matching its name/date; explicit FK links govern future/all.

Both the public scope function and the formerly unused destructive singular
helper now route through the coordinator. Settings removal continues to use
`maintenanceTaskDeletionApi`; it never splices a task out without an archive.
V2 one-time removal retains its existing verified RFS-01 lifecycle path.

Transaction sequence:

1. Capture exact local source/operation before confirmation. Settle the queue;
   require a clean local state, writable gates and the same actor/backend/target.
2. Independently transaction-read the source, compare local/loaded/confirmed
   evidence, validate archive-aware identities and ledger references, and plan
   the exact permitted append/status delta.
3. Run the existing atomic CAS/revision writer and protected preflight. Validate
   exact source and prepared state inside its transaction. Keep the old local
   backup available to preflight, then store and verify the source backup before
   queuing the state write; swallowed storage failures cannot authorize a write.
   Use a mergeFields
   mask for changed top-level maintenance arrays plus syncMeta. No histories
   are pruned, no old full snapshot is used as a rollback, no blind retry occurs.
4. Independently read the captured backend after acknowledgement, compare the
   complete committed document, prove conservation and advancing revision,
   recheck actor/local/gates, then adopt and acknowledge success. Refresh the
   local backup from the verified result; a later backup warning cannot turn an
   already verified commit into a retryable failure.

Before commit, rejection leaves original local business state untouched, so no
snapshot rollback or false Recovery Mode is required. Genuine source corruption
still enters read-only recovery on load. After uncertain acknowledgement or
failed post-commit verification/adoption, writes stay suspended and source/local
evidence remains; no corrective write or automatic unlock is attempted. A fresh
second browser can independently inspect the committed outcome without clearing
the originating browser's blocker.

Receipts contain an operation ID, target identity, source/committed revisions and
only owned append/status deltas. Uncertain receipts are retained separately in
`__lastMaintenanceCancellationEvidence` and diagnostic exports so an existing
first save blocker is never replaced. Existing guards, independent reads,
backups, revision/CAS and archive-aware FK validation remain enabled. The archive
coverage projection requires its original whole-state transfer proof plus exact
matching task evidence; a different backup-only ledger remains a blocker.

## Final disposable validation

No package.json exists; no npm commands were used. All browser requests were
restricted to localhost; the Firebase SDK and external requests were blocked.
Tests use the real core writer, atomic coordinator, identity validation and
protected registry. Browser tests also use the real missing-path classifier and
model top-level mergeFields replacement. No production state was accessed.

PowerShell commands executed from the worktree:

```powershell
node --test --test-reporter=tap tests/rfs02b-cancellation.test.js tests/rfs02-save-audit.test.js tests/mdel01c-restoration.test.js tests/mdel01b-verification.test.js tests/mdel01-task-deletion.test.js
# 158 PASS / 0 FAIL; includes 38 new RFS-02B cancellation/backup/fault cases

$rfsTests = Get-ChildItem tests -Filter '*.test.js' | ForEach-Object FullName
node --test --test-concurrency=4 --test-reporter=tap $rfsTests
# 1,860 PASS / 10 FAIL / 1,870 total

$env:OMAX_PLAYWRIGHT_PATH = 'C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node --test --test-concurrency=1 --test-reporter=tap tests/rfs02b-cancellation.browser.cjs tests/rfs02-save-audit.browser.cjs tests/rfs01-save-reliability.browser.cjs tests/mdel01-task-deletion.browser.cjs tests/mdel01c-restoration.browser.cjs tests/water-quality.browser.cjs tests/purchase-orders.browser.cjs tests/maintenance-new-one-time.browser.cjs tests/cj-notes-persistence.browser.cjs tests/cje-completed-duration.browser.cjs
# 34 PASS / 0 FAIL

node --test --test-concurrency=1 --test-reporter=tap tests/rfs02-save-audit.browser.cjs tests/rfs02b-cancellation.browser.cjs
# 2 PASS / 0 FAIL after the final ordinary-save revision correction

node --check js/maintenanceCalendarCancellation.js
node --check js/core.js
node --check js/calendar.js
node --check js/renderers.js
node --check docs/RFS-02-read-only-health.js
git diff --check
& 'C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/check_binaries.py
# All PASS
```

Rich browser evidence: source revision `8`, final revision `1793034000008`, nine
state commits (revision generation uses the existing timestamp/CAS scheme),
12/12 original V2 completions exact, 12/12 legacy completed/manual histories
exact, all original event payloads and inventory links retained. It clicks
single/future/all, repeat Remove, Stop, archive and actual Restore confirmation;
reloads repeatedly, rejects a stale second profile and a permission-denied
write, performs a subsequent ordinary inventory save, then commits with lost
acknowledgement. The first profile blocks another save; the fresh second profile
independently loads the exact committed result with no correction/retry.

Conservation fault tests remove historical dates/events/notes, change snapshots
or unrelated inventory/tasks, cross task/root IDs, and provide invalid/orphan
ledger evidence. They fail before commit or remain read-only as appropriate.
Other tests cover counted virtual roots, as-required definitions, duplicate
requests, backup failure including silent failure, cached/stale evidence,
readback failure/mismatch, actor/local drift and failed adoption. Backup builder
tests verify normal/emergency/tiny task archive retention and a different
backup-only ledger that must not be projected away.

The ten full-suite failures have the same names as the prior frozen-main
comparison: three CJO-02B extractions, six CJPC/manual-log/form extractions and
one projects recorded-duration assertion. See the original RFS-02 report's exact
failure list. They are not repaired by changing financial/historical values.
The prior extended POLISH browser's three failing leaves plus parent remain
previous evidence, not a newly passing certification.

One concurrent browser run returned 32 PASS / 2 FAIL (purchase-order Settings
part-number assertion plus its parent). The identical suite passed 12/12 in
isolation on frozen main, original PR head and current code, and passed within
the final serial 34/34 matrix. This concurrency sensitivity is disclosed; no
unrelated purchase logic was changed to conceal it. Local raw logs are retained
under ignored `artifacts/rfs-02b/`.

The existing P1 listener-during-readback case fails against frozen `8964a43`
using the new focused regression; it passes after retaining newer adopted
revision evidence, including a subsequent successful save. This does not weaken
the exact committed-state readback requirement or clear recovery gates.

## Undo readiness, limitations and merge decision

Exact-ID maintenance restoration is the first verified inverse case. It reads
current authoritative state, requires the exact selected archive, retains its
payload/identity, proves the whole inverse transfer, applies current CAS and
independently verifies/adopts. It cannot overwrite newer unrelated work by
replaying the older whole application state. It does not undo prior cancellation
or restart an explicitly stopped V2 instance.

Future Undo must persist an appropriately bounded verified receipt, load current
protected evidence, prove the owned postconditions still hold, derive an inverse
against current state, confirm its scope and run the same source/prepared/CAS/
readback checks. Ledger cancellation reversal needs a separate append-only
reinstatement event with an exact cancellation-ID reference and conflict policy;
removing the original ledger entry is prohibited. Stop reversal likewise needs
an explicit valid status-event policy. Unknown receipts must first be resolved
against independent backend evidence. Neither backup possession nor a keypress
authorizes an inverse. No site-wide Ctrl+Z handler or durable global undo journal
was added; the existing snapshot handler is additionally locked while a verified
maintenance operation is pending. Successful API receipts are returned evidence,
not an implemented undo UI, and uncertain in-memory evidence should be exported
before closing the originating page.

Remaining limitations/blockers for unconditional merge readiness:

- No authenticated Firebase/emulator/v8 transport, production, preview deployment,
  cross-engine or physical-device checks. Local CAS/mask tests do not certify
  Firestore security rules, offline transaction behavior or network latency.
- Existing ten unit failures and prior extended POLISH failures require explicit
  reviewer disposition; the concurrent purchase browser sensitivity remains.
- Legacy cancellation ledgers grow append-only within the existing document size
  limit. The existing size guard blocks oversize writes. No migration/compaction
  or generalized un-cancel/restart workflow is included. No historical data is
  retroactively recovered from records erased before this patch.
- Existing unrelated completion/reversal/edit paths retain the separate gaps in
  the RFS-02 system-wide audit. Old deployed clients do not understand the new
  cancellation display semantics; deployed-version coordination remains needed.

The requested removal workflows are implemented and pass the scoped disposable
acceptance tests; they are no longer disabled as the final solution. Ready for
review of these corrections on existing PR #523. Do not represent the whole
application or production Firebase as certified, and do not merge automatically.
