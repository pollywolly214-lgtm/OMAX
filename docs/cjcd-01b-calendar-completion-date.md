# CJCD-01B — completed cutting jobs on their authoritative completion date

Conclusion: **SAFE TO MERGE** for the code fix. Live October production quantities
have not been verified; the acceptance reconciliation below uses synthetic records
modeled exactly on the supplied shop log. No production data was written.

## Demonstrated cause and complete path

`renderCalendar()` in `js/calendar.js` fed completed jobs through the active-job
`resolveJobRange()` helper. Its start came from `startISO` and its end preferred
`dueISO` over `completedAtISO`. It then emitted one completed bar on **every date
in that range**, inclusive, including weekends. With no due date, it could expand
from start to completion instead. It also inferred dates for undated history.

In the synthetic reproduction, 16 stable records with October 2 start dates and
October 5 due dates emitted **64 bars on October 2–5**, ignoring completion-date
corrections to October 1, 6, 7, 8 and 14. All seven new projection tests failed
against the unchanged production code and passed after the fix.

This demonstrates a projection error; it does not establish which stored records
are present in the user's production account or prove when the symptom began.

The current CJO save/read path on main is:

1. History's `histSave` handler in `js/renderers.js` stages a cloned job, validates
   the date-only input and calls `saveCuttingJobEdit()`.
2. `saveCuttingJobBusinessOperation()` in `js/core.js` invokes the existing CJO
   coordinator. `CuttingJobDateEditing.prepareMutation()` prepares the correction
   with its existing chronology, numbering and append-only audit rules.
3. The coordinator reads the pinned authoritative document, validates the baseline
   and revision, and calls `writeAuthoritativeStateSnapshot()` with the guarded
   prepared-state comparison. Firebase CAS, protected-data checks and the cutting
   file firewall remain in place.
4. Exact server readback of the committed revision is required before adoption.
   Cached/pending/mismatched evidence enters the existing recovery flow. A stale
   server read can be re-read within the existing bounded window; no write retry.
5. History reads `CuttingJobDateEditing.historyJobs()` and its `businessDate()`.
   The calendar now uses that **same** `businessDate(job, true)` for one completed
   event. Stable `job.id`, category, label, styling, hover and click paths remain.
6. `renderCalendar()` creates a fresh `jobsMap` and clears `#months` on each render.
   No persisted calendar-entry collection or completed-event cache is involved.
   Refresh and authoritative adoption replace the shared completed-job array.

The calendar reads `cuttingJobs` once for active schedule ranges and
`completedCuttingJobs` once for completed events. Neither import provenance,
`cuttingJobDatabase`, retired `cutDateISO`, manual logs nor chronology audit entries
are additional completed-job event sources. The shown multiplication requires
neither duplicate backend IDs nor a second source adapter. `actualHours` does not
drive this loop: long durations alone must not expand a completed cut.

## Fix and compatibility

Only `js/calendar.js:renderCalendar()` changes application behavior: completed
records use the validated authoritative completion day once, without consulting
old scheduling dates. The active-job range rules remain intact. The shared CJO
date helper preserves the recorded calendar-day prefix of stored ISO instants,
matching History without timezone conversion. An absent or invalid completion
date stays undated in History and produces no guessed calendar entry.

There is no text deduplication or ID migration. Two matching descriptions with
different stable IDs render independently. Genuine duplicate source identities,
if present, require separate evidence and review; this patch does not clean them.

Changed files:

- `js/calendar.js` — completed-event projection.
- `tests/cjcd01b-calendar.test.js` — A/B/C/D/F, active ranges, pure repeated reads.
- `tests/fixtures/cjcd-shop-log.js` — 16 synthetic cuts; October 14 is project 1242.
- `tests/fixtures/cjcd-calendar.js` — executes actual projection/date helpers and
  chip-rendering source, without a copied projection implementation.
- `tests/cjo04c-readback.test.js` — E, all 16 corrections through the existing real
  guarded writer/production CJO adapter with a mocked Firestore backend; verified
  adoption/reload, stale verification recovery, identity/relationship preservation.
- `tests/cjcd01b-calendar.browser.cjs` — full application UI and disposable backend
  in Chicago and UTC+14; History edit, existing-DOM date movement, repeated render,
  refresh and new-tab backend load.
- This report.

## October 1–14 reconciliation

**These are synthetic acceptance results, not an observation of production.**
The fixture assumes one job per recorded cut and quantity 1 per job. If production
stores several cuts in one job or additional legitimate work, its counts require
a separate identity/quantity reconciliation, without forcing them to equal 16.

| October date | Project | Material | Shop cuts | Synthetic calendar jobs | Production actual |
|---|---|---|---:|---:|---|
| 1 | 1241 | 1/2 inch A36 | 1 | 1 | Not read |
| 1 | 1242 | 1.25 inch RC50 | 2 | 2 | Not read |
| 6 | 1241 | 1/4 inch A36 | 1 | 1 | Not read |
| 6 | 1241 | 1/2 inch A36 | 2 | 2 | Not read |
| 6 | 1251 | 1/16 inch Aluminum | 2 | 2 | Not read |
| 7 | 1242 | 3/8 inch RC50 | 3 | 3 | Not read |
| 7 | 1247 | 3/8 inch RC50 | 2 | 2 | Not read |
| 7 | 1247 | 1.25 inch RC50 | 1 | 1 | Not read |
| 8 | 1247 | 1.25 inch RC50 | 1 | 1 | Not read |
| 14 | **1242** | 0.375 inch RC50 | 1 | 1 | Not read |
| **Total** | | | **16** | **16** | **Not read** |

Date totals: **October 1: 3; October 6: 5; October 7: 6; October 8: 1;
October 14: 1.** October 2–5 and 9–13: zero completed fixture jobs. Both aluminum
cuts and both small backing plates remain distinct. Material spellings are
preserved, including the supplied `0.375` spelling on October 14; there is no
production material normalization.

The browser inventory had no open production session. The only local cutting
backup found is dated September 30, before the acceptance period, so it cannot
substantiate October production quantities. Live Firebase persistence and real
logout/login were not exercised. Automated tests use synthetic/mock/disposable
backends and actual application code, including full refresh and a new tab.

## Regression results and exact commands

From the PR checkout, no package.json/build step exists; these use the existing
Node test runner conventions and repository binary check.

```powershell
node --test tests/cjcd01b-calendar.test.js tests/cjo04c-readback.test.js
# 31 passed; 0 failed; 0 skipped (includes nine CJCD tests).

node --test tests/*.test.js
# 1189 passed; 0 failed; 0 skipped.

$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node --test tests/cjcd01b-calendar.browser.cjs
# 2 passed; 0 failed; 0 skipped. Disposable localhost backend, external requests blocked.

node --check js/calendar.js
node --check tests/cjcd01b-calendar.browser.cjs
git diff --check
& 'C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/check_binaries.py
# All passed; no binary tracked files.
```

The first browser launch inside the Windows sandbox failed for both cases before
page execution because Edge could not initialize its disposable profile. The same
tests ran successfully outside that sandbox; no application workaround was needed.
The seven deliberate pre-fix failures are reproduction evidence, not unresolved
regression failures.

## Data safety

No production Firestore/Storage writes, deletes, cleanup, imports, migrations or
deployment were performed. Existing cutting history, IDs, dates, attachments,
provenance, categories and costs were not modified. The patch changes neither the
CJO coordinator/chronology rules nor revision/CAS, Recovery Mode or authoritative
save verification. The existing numbering behavior runs only when an operator
explicitly saves a job through the established CJO path; rendering never renumbers.
