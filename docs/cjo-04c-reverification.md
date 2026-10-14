# CJO-04C: bounded server reverification and honest UI adoption

The supplied Vercel evidence establishes that committed revision
`1791985634074` was present on an independent server read, while the operation's
first read returned `1791324281902`. The old verifier correctly refused the older
snapshot but immediately suspended, so the normal authoritative adoption and UI
refresh never ran. Separately, completed History displayed Start → Due Date;
it now displays Start → Completion Date, retaining the stored Due Date.

The exact reason the first live read was older remains uncertain. Inspection
found no separate readback document: both paths used `FB.docRef`, initialized as
`workspaces/github-prod/app/state`, with `workspaceRef` aliased to that state
document in project `wj-tracker-v2`. `workspaceDocRef` is the parent workspace
document and is not the state reader. The earlier helper requested
`source:"server"` but discarded snapshot metadata and did not pin references
across the asynchronous operation. These are evidence/robustness gaps, not proof
that a target switch or cache caused the observed live response. No live
network/SDK trace was supplied and no production records were accessed.

Every normal cutting-job operation now captures an immutable tuple of the actual
Firestore instance, DocumentReference, path, project, backend kind and actor.
Reference/backend/actor continuity and state-document aliases are checked before
baseline read, at guarded write entry and in transaction preparation, during
reverification, and before adoption. The transaction uses the captured database
and reference. Reads use that same reference with `get({source:"server"})` and
check returned document path/Firestore identity when available. Cache and pending
write flags must both be explicitly false in the production reader. Firebase
defines these flags as cache origin and uncommitted local-write evidence:
[SnapshotMetadata](https://firebase.google.com/docs/reference/js/v8/firebase.firestore.SnapshotMetadata).

After confirmed successful commit, the actual `committedState` is frozen and
compared with fresh server snapshots through the existing strict durable
projection. Only an older, valid, server-proven revision qualifies for another
read. There are at most **three total verification reads**: immediately, then
after **250 ms** and **750 ms** waits. Each read has a **3,000 ms deadline**;
the post-commit window is therefore bounded to roughly ten seconds. A timeout,
missing/invalid snapshot, cached/pending result, wrong target, newer revision,
or matching revision with different durable content stops safely. No later
correct response is accepted after a real conflict or failed deadline.

There is one guarded writer call before the loop. No attempt writes, re-prepares
the business mutation, generates another audit entry, retries CAS, seeds defaults
or rolls back a committed result. Timed-out SDK reads may finish later, but their
promises cannot adopt. The coordinator remains busy during the waits; realtime
echo adoption remains suppressed. Existing local-change/auth/recovery guards
still prevent unsafe adoption, including edits or target changes during a wait.

A later exact match must have the **same committed revision** and **full durable
state equality**. The existing authoritative adoption function advances loaded
state/revision together, then existing lifecycle handlers render the confirmed
view. Global numbers/category order, identities, attachments, logs, costs,
provenance, audits and every protected collection remain part of verification.
No comparison field is excluded or relaxed by this revision.

On failure the existing recovery suspension retains original live state. Both
Jobs and History show an explicit unverified notice: displayed values may be
previously loaded data or unsaved edits, and must not be treated as confirmed.
This is applied to the current DOM without destroying draft inputs, and survives
route rerender. Successful full adoption hides it. No technical preview or new
operator dialog is introduced.

Bounded runtime evidence adds `verificationReadAttempts` (max 3),
`verificationReadHistory` (attempt/revision/cache/pending/server-proof/target-match),
`verificationDocumentPath`, `verificationProjectId`, and `verificationBackend`
alongside existing committed/readback revisions, phase and safe mismatch paths.
SDK objects and state payloads are not logged. Unknown snapshot flags are null;
they are not reported as proof of a server read.

`tests/cjo04c-readback.test.js` executes the actual production adapter/target
helpers/guarded writer with the atomic module, covering the exact reported
revisions, one-write/one-mutation/one-audit counts, stale exhaustion, strict
conflicts, cache/pending/target rejection, actor/local changes, read deadline and
late-resolution non-adoption. `scripts/cjo04c-browser.js` exercises the actual
History form for Oct 4/Oct 6 → Oct 1/Oct 2 and confirms visible dates, reload,
independent stored data and truthful recovery notices. Existing CJO-04B browser
scenarios cover Create, Edit, Complete and Make Active Copy after this change.

Remaining limitation: Vercel retest is required to establish the live transport/
SDK explanation and whether responses catch up within the bounded window. Reads
that remain older beyond that limit still preserve Recovery Mode intentionally.
