# PH-05: legacy inventory evidence and reviewed identity repair

Date: 2026-09-30. Branch: production-readiness-import-prep. No production data was read or repaired during development. The shape below is user-provided evidence reproduced with synthetic fixture records.

## Evidence remains visible

Meaningful authoritative state with duplicate/missing inventory identities first disables ordinary writes/autosave and enters Recovery Mode. Load retains an independent exact cloud snapshot and its revision, then adopts a cloned, unnormalized display state. It does not seed inventory, assign IDs, rewrite task links, purge history or replace recovery caches. Navigation displays read-only authoritative records, including duplicate inventory rows, with diagnostic exports available. This evidence view bypasses the normal editable renderers and their normalization/seeding. Secure-file uploads are blocked as well as ordinary app/state and workspace metadata writes.

Missing/empty/config-only authoritative state still fails closed without adopting defaults. A realtime identity issue likewise stops writes before reloading authoritative evidence.

## Read-only review now

In F12 on the Vercel PR preview, run only:

```js
await window.previewInventoryIdentityRepair()
```

This performs a server read and returns a plan; it does not download a backup, edit local business records or write to Firebase. Review the plan before considering any repair. No repair execution is requested by this document.

The report includes the authoritative revision, exact canonical source signature, all duplicate groups/row indexes, each original affected row, linkedTaskId, matched legacy collection/index/id/name, deterministic proposed ID, every V2 relink, every old-ID reference (including unknown fields/object keys), blockers, and before/expected counts. The full canonical signature binds every source field, not just counts.

## Exact algorithm and permitted fields

For every duplicate group, replace **all** affected inventory IDs. Never retain the ambiguous ID for an arbitrary winner. Require a canonical nonempty linkedTaskId unique across inventory, exactly one legacy task with that exact id across tasksInterval/tasksAsReq, and a matching current duplicate inventoryId. Every legacy task referencing the duplicate must have exactly one mapped inventory row. V2 records referencing it require an exact resolvable legacyTaskId; names never determine mapping.

The permanent ID is `inventory_task_` followed by the linkedTaskId's Unicode code points, each encoded as six hexadecimal digits. This injective encoding depends only on stable identity, never time, name or array index. Proposed IDs are checked against existing IDs and each other; collisions block rather than choosing another ID. A successfully repaired source has no duplicate group and reruns as a no-op.

The only authorized business changes are:

- affected `inventory[index].id`;
- mapped `tasksInterval[index].inventoryId`;
- mapped `tasksAsReq[index].inventoryId`;
- mapped `maintenanceTasksV2[index].inventoryId` through legacyTaskId.

Inventory's old id values are recognized as affected identities. All other occurrences outside these explicit paths, including nested history/purchase/deleted-record fields, embedded strings and object keys, block repair. Inventory folder identity problems and non-JSON source values are outside this repair scope. Quantities, linkedTaskId, all names/notes/history/schedules, jobs, purchases, pump history, layouts and unknown fields remain exact.

## Apply architecture (separate review required)

`window.applyInventoryIdentityRepair` is a separate developer API. It requires explicit confirmation and the complete exact reviewed preview; neither load nor preview invokes it. It re-reads the server, checks revision/source/plan and actual local business state, downloads the exact authoritative pre-repair snapshot, then rechecks local drift before writing. Failed backup stops before mutation.

No repair is staged into live arrays. An isolated source copy receives only the permitted ID changes. A one-operation internal authorization binds its exact source, proposed state and expected revision to the existing authoritative transaction helper. Recovery Mode and ordinary save gates never get temporarily enabled. Inside the transaction, revision CAS and full source equality are rechecked; the content firewall and payload limit remain enforced. The narrowly authorized exact patch bypasses ordinary ID-drop/merge normalization checks which would reject the intentional old-ID replacement; ordinary writes retain their existing preflight.

After a committed write, a fresh server read must exactly match the committed result, including the transaction-produced advanced revision. Counts, unique IDs, unchanged inventory fields, linked legacy/V2 correspondence and zero surviving old supported references are verified. Only then can the verified state replace the read-only display. Ordinary writes remain disabled for review.

Definite rejection preserves live evidence without snapshot rollback because no live staging occurred. Indeterminate/thrown write outcomes have no rollback or retry and suspend writes. Post-commit mismatch/read failure, or an in-flight local business edit, suspends verification and preserves local evidence; no automatic adoption overwrites that edit.

## Fixture and verification

The test baseline matches the reported dimensions: 28 inventory rows (one unique Pump Rebuild, 27 with inventory_mqgqwky1), distinct linkedTaskId values, 15 interval tasks with 14 duplicate references, 13 as-required tasks with 13 references, five V2 references mapped through legacyTaskId, one active/67 completed jobs, 80 daily-hour records, five V2 tasks/80 instances/13 occurrences. Observed source revision 1790781035355 is fixture input, never a hardcoded repair revision.

Tests cover non-mutating/deterministic preview, all mappings/counts, exact unrelated-field preservation, no-op rerun, missing/duplicate links, absent/multiple task matches, unmapped legacy/V2 references, unknown nested/key/string references, ID collisions, plan tampering, stale revision/source/local drift, backup failure, exact transaction-source checks, scoped authorization, ordinary/upload write blocking, definite/indeterminate outcomes, post-write mismatch/read failure, concurrent local edits and raw recovery adoption/display. The focused installed-Edge check uses only http://localhost:8000/?devsafe=1 in a fresh profile; it checks read-only navigation/reload and preview with zero production business requests. It does not rerun the PH-03 matrix or certify deployed Firebase rules.

Final validation: `node --check` passed for all six changed JavaScript files. `node --test tests/inventory-identity-repair.test.js tests/atomic-persistence.test.js tests/inventory-identity.test.js` passed 41 Node runner tests, zero failed/skipped. `node --test tests/*.test.js` passed 98, zero failed/skipped. `git diff --check` passed; conflict-marker search returned zero matches. The focused Edge smoke passed with zero page errors, all supplied fixture counts preserved, 27 proposed replacements/five V2 links, cloud unchanged and reload successful.
