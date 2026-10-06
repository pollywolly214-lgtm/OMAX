# CJO-02: chronological ordering foundation

This phase adds a model and a guarded persistence adapter. It does not provide
date/order editing controls, change number displays, or migrate production data.
The domain remains the union of active and completed business jobs in
`workspaces/github-prod/app/state`. The stable job `id` remains identity.

## Fields and ordering

- `cutDateISO`: explicitly established actual performed calendar date,
  strictly `YYYY-MM-DD`. Calendar validation uses Gregorian arithmetic without
  parsing a timestamp or applying a browser timezone.
- `cutOrderWithinDay`: explicitly established positive safe integer. This is
  independent of visible number, source row, creation time, and array position.
- `cutNumber`: mutable materialized global rank, retaining the existing
  `C001` format (minimum three digits).
- `id`: unchanged durable identity across active/completed states.

`CuttingJobChronology.readChronology(active, completed)` resolves the whole
domain before comparing keys. A fully established domain sorts by actual cut
date, same-day position, then exact UTF-16 code-unit string ordering of stable
IDs. It does not use locale-sensitive comparison. Equal positions are resolved
by ID; they are deterministic but do not establish true historical time.

## Read-only labels and readiness (CJO-03)

`CuttingJobChronology.readCutLabel(job)` reads the materialized `cutNumber` for
both canonical and unresolved legacy jobs. A string matching `C`/`c` followed by
digits with a positive safe-integer rank is returned exactly as stored, preserving
case and padding. Missing/invalid labels display the neutral `—`; readers never
invent a C-number or normalize the stored field.

Jobs/history titles, inline category labels, flow cards, dashboard search, and
Data Center visible cut labels share this reader. Category counters, scheduling
priority, financial ordering/calculations, and Data Center reverse-row ordering
retain their existing behavior. Displays perform no chronology migration,
renumbering, persistence, or coordinator operation.

`chronologyReadiness(active, completed)` returns a read-only status, `eligible`
flag, and validation issues:

- `LEGACY_ONLY`: no included job has explicit chronology fields; eligibility is
  false, including an empty domain. Legacy evidence is not promoted into fields.
- `CANONICAL_READY`: every included job has a valid actual date/day order and
  unique nonblank string identity; eligibility is true.
- `REVIEW_REQUIRED`: explicit chronology exists but at least one date, order,
  identity, or job array remains invalid/unresolved; eligibility is false.

Readiness does not require a currently valid visible label and never repairs
one. It describes chronology eligibility, while `readCutLabel` handles display.

## Legacy safeguard

If any included job lacks valid explicit date/order, canonical renumbering is
blocked. Read-only compatibility ordering preserves stored numeric cut labels,
then stable ID; it does not generate a label for a record that lacks one.
Schedule, completion, creation, import, source-row, and manual-log dates are
never promoted into actual chronology. No fallback is persisted during load.

A legacy job becomes eligible only when reviewed fields are explicitly supplied.
A global operation crossing unresolved legacy records returns review issues and
does not call the writer. This can require a later, separately reviewed
initialization plan for existing production history; no such plan runs here.

Existing all-legacy creation/import/repair workflows retain their existing policy
in `CuttingJobHistory`. Once a domain contains explicit chronology fields, its
pure planner delegates to the canonical planner. Direct mutation via
resequence refuses both canonical and mixed domains, requiring the coordinator;
legacy repair/import/add/restore/copy/completion callers stop before dependent
changes or saves when this guard blocks. If the canonical module fails to load, it fails closed rather
than reverting explicit jobs to schedule/completion-date ordering.
This compatibility boundary is not a certification or repair of the old legacy
same-day resequencer identified in CJO-01.

## Pure plan and mutation

`planRenumbering(active, completed)` returns a global sequence, changed stable
IDs with old/new labels, and the numeric affected range. It never changes
records, arrays, labels, or dates itself.

`prepareChronologyMutation(state, changes)` accepts corrections containing only
`id` and either/both explicit fields. It rejects missing/duplicate identities,
unknown fields/targets, duplicate targets, invalid dates/order and unresolved
domain members. It clones state, changes only requested chronology fields and
affected labels, and preserves array membership/position and every other field.
Its output includes chronology field deltas and the renumbering plan.

Source dates and import evidence remain original evidence. A correction does
not rename files, Storage objects, Firebase documents, or jobs.

## Existing persistence architecture

`createMutationApi(env).save(changes, {expectedRevision})` is the reusable
operation. The application-owned `cuttingJobChronologyMutationApi` in core is a
foundation hook with no UI, hydration, creation, or import call site.

1. Require ordinary write gates, no pending local mutation, a loaded matching
   server revision, and exact complete local/loaded/server baseline equality.
2. Freeze caller corrections before an asynchronous server read. Build the pure
   cloned mutation and complete global number projection.
3. Pass one whole snapshot through `writeAuthoritativeStateSnapshot` and
   `OMAXAtomicPersistence.save`. Existing transaction CAS, identity,
   protected-state, size and content-firewall guards remain authoritative.
4. A further exact-state validator runs inside that transaction after protected
   merges, before queueing, using an isolated deep-cloned JSON snapshot. Callback
   mutations cannot change the guarded pending write; false/throw fails closed.
   It rejects concurrent local edits and unexpected
   changes to any unrelated business field. It cannot relax existing guards.
5. Require acknowledgement and exact source-server read-back at a newer revision,
   including unchanged unrelated fields. Only then use existing authoritative
   adoption. A no-op writes nothing and is explicitly marked `noOp`.

No live arrays are staged before acknowledgement. Definite rejection therefore
needs no local rollback. Unknown/thrown writes, inconsistent acknowledgement or
read-back failure suspend writes for reload/review with no retry or rollback.
Concurrent local edits after a verified commit remain intact and require review;
the operation does not overwrite them while adopting server state.

No independent Firebase, cache, attachment, or per-job write system is introduced.

## Scope remaining

- Build the reviewed chronology correction workflow using the guarded
  coordinator and read-only readiness helper; final editing controls are not
  included in the reader phase.
- Review actual-cut evidence, the active/unperformed-job policy, same-day
  positions and business timezone for legacy history. No dates/timestamps should
  be invented to bypass eligibility.
- Design durable correction audit retention separately. Existing compacted
  debug logs and session undo are not a durable old/new chronology ledger.
- Exercise real browser hydration and fixture-backed save/reload later. Current
  automated coverage uses local Firestore mocks, not production writes.

## Validation

Focused coverage is in `tests/cjo02-chronology.test.js` and
`tests/cjo02-persistence.test.js`. It tests insert/move/order/round-trip behavior,
the audited mixed-order feedback case, real completion construction, exact
relationship preservation, legacy refusal, the real core protected writer with
the existing atomic module, CAS conflict/retry, protected merge rejection,
unknown completion, read verification and concurrent edits.

The repository has no package.json. Use the Node test runner and
`node --check` for changed JavaScript. Final executed command results/counts
are recorded in the CJO-02 result report.
