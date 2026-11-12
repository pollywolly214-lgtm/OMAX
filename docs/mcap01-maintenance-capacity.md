# MCAP-01 — Maintenance cancellation blocked by workspace document capacity

## Production evidence (November 12, 2026)
The operator clicked **Remove from calendar** on the **November 13 Mixing Tube Rotation machine-hour repeat**, with root `repeat:maintenance_instance_v2_mixing_tube_rotation_2026_11_13_repeat:slot:1`. The existing repeat schedule and `repeat_started` event were present in Firestore. No `removed` event was committed and the revision did not advance.

A read-only, isolated `OMAXMaintenanceCalendarCancellation.plan(...)` from the authoritative server snapshot produced one `removed` event and preserved 188 prior maintenance occurrence records (189 afterward). The source passed the global identity, calendar cancellation, and central integrity validators. The proposed state passed the global identity and calendar cancellation validators, but failed the central check with exactly:

> Protected authoritative payload exceeds the save limit.

The current central guard rejects a serialized state estimated at or above `FIRESTORE_BLOCK_BYTES = 975000` bytes. This protects against running into Firestore's document size limit, and **must not be raised or bypassed to enable removal**.

## Scope of this safety patch
This PR **does not solve the underlying storage-capacity limit** and is **not approval to merge as a complete repair**. It changes only the rejection explanation for this one, unambiguous condition, while leaving all existing validators and write/size/transaction guards untouched. It adds no-write tests.

## Required durable repair (separate implementation and verification)
The existing monolithic `workspaces/github-prod/app/state` document cannot grow indefinitely with append-only maintenance history. A durable fix requires a verified archival/sharding design with all of the following:
1. Read-only per-field and nested size accounting against the production backend; no assumption that any field is safe to remove.
2. Precisely identify which append-only records must be moved and what stable IDs, historical provenance, links and order must survive. Include all historical, incomplete, completed, removed, imported and migrated maintenance occurrences.
3. Security-rule review for any new Firestore path and its workspace/actor authorization before deployment; no broad rule expansion.
4. Dual-source compatibility for existing readers, repeat projection, dashboard, calendars, costs, import/export, backups, recovery and identity checks. Never silently ignore a shard on failed reads.
5. Revision/CAS-checked, resumable and idempotent migration; preserve the old copy until an independently verified new copy exists. Do not silently delete historical source data.
6. Atomic or explicitly recoverable multi-document save protocol, independent backend readback, detection of partial/unknown commits, and retained protected-data/recovery safeguards.
7. Synthetic fixture tests at and above the 975000-byte threshold, real disposable-backend integration, two-client conflicts, permission errors, offline/cache reads, reload and real Remove action. The no-data-loss invariant is stronger than convenience.
8. Only after these checks pass, test the precise production Remove action and verify the original completion, notes, costs, and other repeat roots remain accessible.

## Operator troubleshooting — read only
Do not edit cloud state, clear caches, bypass validators, or manually remove old history to gain space. The current save is intentionally blocked before any write. Existing Firebase data remains intact. A pure read-only size table can be collected with:

```js
(async () => {
  const state = await FB.db.runTransaction(async tx => {
    const snap = await tx.get(FB.docRef);
    return snap.exists ? snap.data() : null;
  });
  const size = value => new TextEncoder().encode(JSON.stringify(value ?? null)).length;
  console.log("Workspace byte size:", size(state), "safe app limit:", 975000);
  console.table(Object.entries(state || {})
    .map(([field, value]) => ({field, bytes:size(value), count:Array.isArray(value)?value.length:""}))
    .sort((a,b)=>b.bytes-a.bytes));
})();
```
