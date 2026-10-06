# CJO-04B: verified cutting-job lifecycle saves

Normal Create, Edit, Complete and History → Make Active Copy share the existing
business-date preparation and guarded authoritative coordinator. Active copies
use `createCuttingJob(newJob)`, never a live array push plus debounced save.
The date modal and intended copy fields are retained. Construction gives the
copy a new stable ID, active dates, material/rates/notes and existing file
references; it does not inherit completion date/status/actual hours/efficiency,
reviewed cut-date/order or completed import provenance. The historical source is
rechecked after the date modal await, and its business data remains unchanged.
Only global labels/audit may change through the existing automatic calculation.

The coordinator still validates the exact intended next state inside the guarded
transaction. That pre-queue check is separate from post-commit verification.
After acknowledgement, it freezes `saved.committedState`, reads from the server,
projects both through the same durable representation, requires the identical
committed/readback revision (greater than the source revision), and compares all
durable fields before authoritative adoption. A missing committed payload is
indeterminate; an earlier intent snapshot never substitutes for commit evidence.

The projection omits undefined object properties and preserves undefined array
positions as null, matching the atomic writer's JSON snapshot representation.
Object-key ordering is canonical. Numbers remain typed and exact, including
nonfinite versus null distinctions; actual values or records are never used in
diagnostics. No job field, protected collection, `saveMeta`, `syncProcessLog`,
report cache, or `syncMeta` field is excluded from the durable comparison.
Dates, numbers, attachments, logs, costs, categories/project, provenance,
inventory and maintenance still require equality. A genuinely different durable
readback or revision enters the existing recovery suspension without retry.

The earlier comparator instead used a business key calculated before the writer
completed preparation. A controlled disposable Edge reproduction using the exact
starting coordinator demonstrates the false-indeterminate flags when the
writer's queued `saveMeta.lastSavedAt` differs from that earlier key, even though
actual committed state and actual readback have zero differences. The fixed
coordinator verifies all six normal lifecycle operations with that writer-owned
metadata update and with the ordinary backend, including refresh after every
operation and correct loaded revision adoption. This reproduction proves the
comparator defect; it does not establish that the same field caused the user's
Vercel failures. The supplied runtime summary has no differing field paths or
committed/readback values, and no production records were inspected.

On failure, `window.__lastIndeterminateSave` now has bounded evidence:
`verificationMismatchPaths` (maximum 16, 200 characters each),
`verificationMismatchCount`, `verificationMismatchTruncated`,
`committedRevision`, `readbackRevision`, and `verificationPhase`.
Revisions are numbers/null. Unknown property keys are indexed/redacted instead
of printing arbitrary map keys. Comparison traversal is capped at 100,000 nodes
and 64 levels; truncated evidence never turns a mismatch into success. These
fields contain no records, file content or changed values.

Regression coverage: `tests/cjo04b-verification.test.js` executes the actual core
protected wrapper and atomic module for lifecycle/copy outcomes and deliberate
durable mismatches. `scripts/cjo04b-browser.js` exercises real normal UI on
disposable localhost fixtures, external requests blocked, and loads the prior
coordinator only for the controlled reproduction. Set
`OMAX_CJO04B_PRIOR_SOURCE` to an exported copy of
`5e269c8903cb0059a7033c9f90042507921180fc:js/cuttingJobChronology.js` when running
that fixture. Current normal-UI checks remain in `scripts/cjo04a-browser.js`.

The CJO-04A operator date policy, guarded baseline/revision checks, content
firewall, protected-data preflight, payload limits, CJD/CJA and recovery behavior
remain in place. Exact live Vercel field attribution requires the new bounded
diagnostics if a mismatch recurs during retest; it is not inferred from an
unrelated fixture's values.
