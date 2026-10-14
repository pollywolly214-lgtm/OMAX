# CJO-04A: normal job dates and verified completion

This revision supersedes the CJO-04 operator review workflow for normal creation,
Edit and Mark Complete. Actions → Edit is the single date editor. The old actual
cut-date review modules remain internal compatibility/test utilities and are not
loaded as an operator dialog.

Active jobs use `startISO`. Completed jobs use `completedAtISO`, using the stored
calendar-day prefix of a valid date/ISO timestamp. Completion records the existing
workflow's completion instant. Normal Edit exposes Start Date and Completion
Date; an unchanged completion instant is preserved. A corrected completion date
is stored directly in the existing field without converting it through browser
timezones. Absent legacy dates may remain absent when unchanged. Active
Completion Date is blank and is set by Mark Complete.

The read-only compatibility calculation never writes/backfills dates, internal
CJO fields, or numbers on page load. Explicit saves number dated jobs in business
date order. Dateless jobs with valid stored C-numbers reserve those numbered
slots, so dated jobs fill the other slots without inventing historical dates.
Dateless jobs lacking a valid number retain their stored label and deterministic
ID order at the end. Existing duplicate labels on dateless records remain unchanged; they do not
create a global review requirement for normal edits or completion.

Within a date, existing cut-number order is retained, followed by applicable
established sequence metadata and stable UTF-16 job ID. A complete, unique
imported-peer source sequence (worksheet row, source sequence, matching CUTPDF
ordinal, or legacy cut sequence) orders imported peers within their existing
slots. Source-row numbers are never compared directly with native global ranks.
This keeps same-day order stable across rerender, reversed storage arrays and
reload. No manual placement or separate chronology confirmation is required.

Category numbering is derived from this same order within the existing category
identity (`cat`), whose project ownership is validated by the existing
project/category implementation. No category counter field is introduced.
Jobs, History, flow cards and Data Center share the derived category sequence.
History sorts a copy by Completion Date, newest first; stored arrays retain
their identities and ordering.

Normal creation, Edit and completion use the existing chronology coordinator's
busy lock, frozen request, exact source/local version check, revision CAS,
protected whole-state writer, content firewall, payload limit, exact server
readback and authoritative adoption. The transaction contains the date edit,
status transfer, all affected C-numbers and append-only per-job audit evidence.
Live arrays are never optimistically completed or edited. Jobs and Calendar
await saved + verified before reporting success. Failure retains the prior UI;
unknown commit outcomes suspend writes and require reload without retry.

Completing the last active job legitimately empties `cuttingJobs`. Only the
explicit, exact prepared completion transfer can project the same intact stable
ID from active to completed in protected guard baselines. The writer first
validates uniqueness, one active removal/one history addition, applicable date,
preserved attachments/logs/project/provenance and the prepared-state binding.
All unrelated protected fields, job-to-trash checks, CAS, size and content checks
remain enforced. Deletion, attachment removal and recovery policies are unchanged.

Per-job audit records preserve previous entries and record operation/job/operator
identity, time, old/new business dates and old/new labels. Retention follows the
existing job/trash lifecycle and payload limit. The operator UI does not expose
technical preview or audit requirements.

Use `tests/cjo04a-dates.test.js` for focused persistence/date/category cases and
`scripts/cjo04a-browser.js` for the disposable normal-UI fixture. The earlier
`scripts/cjo04-browser.js` documents the retired review UI and is not the current
normal operator browser check. No production records are needed for validation.
