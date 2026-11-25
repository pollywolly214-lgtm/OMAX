# MCAP production release evidence packet

Status: **preparation only; production cutover is not authorized**. PR #532 remains Draft and `MCAP_SHARDED_WRITES_ACTIVE` remains false. Use [MCAP-CUTOVER-ACCEPTANCE.md](MCAP-CUTOVER-ACCEPTANCE.md) for verified checkpoint results and [mcap-real-firebase-browser-tests.md](mcap-real-firebase-browser-tests.md) to reproduce engineering acceptance. This document defines the concrete evidence and sequence an operator must review; it performs no deployment or migration.

## Verified preparation checkpoint — November 25, 2026

Read-only production evidence and independent backup verification have advanced since the application-source checkpoint at `6ac823f04049b867a6d33123a04ad519a93d7746`. The complete legacy source matched the existing immutable Storage candidate. The separate logical JSON reconstructed exactly offline; the actual managed Firestore export and captured live Storage objects restored into isolated local emulators. Native SDK reads verified restored attachment access and complete state equality. No new candidate was staged and no authority index was created.

The user supplied authenticated configuration captures without reported API gaps. Released Firestore and Storage policies match the reviewed proposal and supplied Storage baseline token-for-token. Account records, returned password hashes/salts and SCRYPT configuration, sign-in/provider settings and Firestore index/field/TTL configuration are retained privately. Local account import preserved identity, flags, provider identity, claims and credential bytes, and emulator-only custom-token sign-in verified owner membership and exact restored state access.

**Credential-verification limit:** production SCRYPT password sign-in was not replayed. The pinned Auth emulator uses a synthetic password hash implementation. The local result proves account-record and credential-byte preservation, not production password authentication. Original account/session metadata remains retained; local import intentionally advances session cutoff and password-update time. The service captures also occurred at different times and are not a single stopped-writer snapshot. These limits remain inputs to the final cutover decision.

Original backups, raw configuration, private identities, digests and restore reports remain outside the disposable worktree and excluded from Git. The repository contains only this sanitized checkpoint. Backup checks and browser-console probes prepared locally did not change application source and did not themselves create Vercel deployments.

The user confirmed GitHub Pages as the intended live site. Read-only deployment checks found that it still serves the existing `main` baseline and does not load MCAP authority modules; Pages publishes the repository root from `main`. A fresh Vercel preview is requested for testing before any merge. Record its actual deployment URL, commit, creation time and successful CI result rather than treating the prior preview as a new deployment. This documentation refresh does not enable sharded writes, change Firebase configuration, authorize production deployment or relax the release gates below.

## 1. Freeze the reviewed release

Record the exact PR head, all seven CI job conclusions, preview URL/deployment SHA, and SHA-256 of the reviewed app/rule artifacts. All four actual-SDK suites (core, receipts, recovery, backup) must run unfiltered. A previous green revision does not approve a changed head. Preserve the legacy/DevSafe test results with the active-backend results.

Inspect the deployed application, Firebase project/bucket identity and HTTPS download/CORS configuration read-only. Compare deployed Firestore and Storage rules to the reviewed artifacts, including their existing unrelated namespace permissions. Record membership/allowed-owner identity and operator permissions without copying credentials to Git or PR descriptions. Verify the approved maintenance window and how all write-capable clients will be stopped. The test namespace substitutions and loopback URL exception must never enter the release artifacts.

## 2. Verify independent current backups

Create a production backup plan using the organization's approved administrative tools and destination before approving any backup creation or restore. Capture this inventory as one consistent maintenance-window evidence set:

| Scope | Required retained evidence | Restore target/check |
| --- | --- | --- |
| Complete logical authority | Current independently read source revision, canonical complete-state checksum, every unknown field and protected business collection | Isolated application reconstructs exactly; original V1/legacy path loads its retained pre-cutover data |
| Firestore | All collections/subcollections, membership, attachment/compatibility records, source/index and audit namespaces; export operation completion and typed-value inventory | Empty isolated database; compare document paths and typed values, including descendants of missing parents |
| Storage | Every object in business/attachment/shard namespaces, bytes, checksums, content types, custom metadata and object-generation inventory | Isolated bucket; exact byte and metadata comparison plus native attachment open |
| Auth | All users, provider identities, claims, disabled/verified flags and the approved password-hash export configuration | Isolated Auth environment; review import/revocation semantics, prove representative credential/claim/role behavior |
| Deployment configuration | Rules, indexes, IAM, provider/tenant configuration, bucket CORS/lifecycle/versioning and deployed-code identity | Compare reviewed configuration; emulator data exports do not contain these controls |

Keep backup artifacts in an access-controlled independent location. Record UTC capture times, scope, counts, per-component digests, destination, retention and the isolated restore result. A successful download or historical state-shard copy is insufficient. Do not import production backups into a live database or public CI, and do not overwrite a tested snapshot. The automated demo restore proves the engineering procedure, not that any production backup exists or can be restored.

## 3. Read-only current source/candidate decision

After stopping writers and resolving pending local drafts, read the actual index and complete legacy source independently. If an active index already exists, stop this initial-cutover procedure and inspect its authority rather than staging or activating again. Locate the previously verified candidate from the retained audit record; do not rerun the historical production staging script.

`OMAXShardedActivation.verify({candidate, ...dependencies})` is the read-only preflight in `js/omaxShardedActivation.js`. Review the explicit candidate identity before supplying it: source revision, operation/actor, manifest path/hash and creation time. The implementation requires an absent index, reads the current source, reconstructs every immutable shard, compares complete canonical content and rereads the source to reject concurrent changes. Retain its zero-write proof and independently verified counts/checksums.

If the historical candidate is stale or missing, record **NO GO**. Prepare a separately reviewed fresh-candidate action and backup evidence; do not silently reuse old revision evidence or create another production copy under this checklist. Neither a matching revision alone nor a matching sample of business rows establishes complete equality.

## 4. Explicit operator decision and controlled activation

Before any production mutation, present the exact head/artifact digests, current source/candidate proof, independent backup/restore evidence, deployed-environment comparisons, client-stop plan and rollback boundary for approval. No item may say pending. The approval must identify the specific rule/code deployment and activation actions. Routine continuation of engineering work is not that approval.

After that separate approval, the operator publishes the reviewed lockout rules and verifies their deployed identity. Preserve every unrelated permission. Verify the no-index legacy path remains functional before activation. Prepare the reviewed compatible client with sharded writes held off until its approved enablement step. The inactive operator activation module must not be added to normal production startup.

The approved activation uses `OMAXShardedActivation.activate`: it repeats complete preflight and atomically compares the original source/index before creating the pointer. Its explicit approval phrase and `rulesEnforced:true` are required inputs, not evidence by themselves that deployed rules were checked. Verify the committed index and unchanged legacy source independently. Confirm obsolete clients cannot write using the approved lockout check. Never use a legacy business write as an unreviewed probe.

Before the first sharded save, verify complete read-only load and independent readback from two approved clients, full refresh, attachment access and original-source retention. If any result is uncertain, stop writes and inspect server authority. Do not retry activation blindly. Enable the reviewed write-capable release only under its approved action, then execute one reviewed business change with exact prepared/committed/readback evidence, peer convergence and full reload. Capture audit evidence and recheck unrelated records.

## 5. Stop and recovery boundary

Before the first sharded write, `rollbackBeforeFirstWrite` may remove only the initial index under separately approved rollback rules and its explicit approval phrase. It requires `previousRevision === 0`, unchanged original revision/content, exact reconstructed equality and transactional comparison. Verify legacy authority and retained objects afterward. An uncertain activation or rollback must be inspected independently before any further action.

After **any** sharded save advances the index, the historical Firestore document is obsolete. Do not delete the active index, restore that historical document over current history, or downgrade clients to legacy authority. Suspend further writes, retain the active index and all immutable objects, export current evidence, and prepare a separately reviewed recovery from the current authority. Full database restoration requires its own isolated validation and approved incident plan. No compaction, automatic repair or object cleanup is part of this release.

## Evidence record to complete

| Decision input | Value |
| --- | --- |
| Exact reviewed head / seven-job CI run | Pending final engineering head |
| Preview and proposed production artifact digests | Pending review |
| Deployed environment/rule/config comparison | Pending production read-only verification |
| Current source revision and complete checksum | Pending production read-only verification |
| Existing candidate identity and complete equality proof | Pending production read-only verification |
| Independent all-namespace backups and isolated restore | Pending production evidence |
| Maintenance window, stopped clients and operator | Pending operator decision |
| Specific deployment/activation/first-write approval | Not granted |

These remaining inputs are release gates, not a prediction of additional code defects. Continue engineering only when a failed required check or review finding identifies concrete work.
