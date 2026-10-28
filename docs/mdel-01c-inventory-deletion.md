# MDEL-01C: maintenance-linked inventory deletion

## Root cause

The old `deleteInventoryItem` recorded a Trash entry, cleared only legacy
`tasksInterval`/`tasksAsReq.inventoryId`, spliced active Inventory, and scheduled
a debounced save. It left V2 definition references intact. Saves enforced CAS,
protected counts and content checks, but did not apply the global FK validator
to inventory changes. Reload did apply that validator, which recognized archived
maintenance tasks and a bounded archived-job self-reference, but only **active**
inventory identities. Thus `maintenanceTasksV2[11].inventoryId` and
`maintenanceTasksV2[21].inventoryId` became dangling even though their original
inventory payloads were in Trash. The old UI also offered a cascading task-delete
choice and reported success before Firebase acknowledgement.

## Deletion and history

`inventoryArchive.js` follows the existing task archive transfer pattern. It reads
the authoritative source, requires an exact local/cloud baseline, plans one intact
inventory-to-Trash transfer, and validates both source and result. It writes only
`inventory`, `deletedItems`, and `syncMeta` through the existing queued atomic
writer and expected revision. The transaction rechecks source, result, backend,
all unrelated business fields, protected data, content, size and FK integrity.
Only a verified independent backend read permits local adoption and UI success.
Rejected writes leave local stock and Trash untouched. Unknown outcomes retain
evidence and suspend writes without retries or blind rollback.

Task definitions, original legacy/V2 `inventoryId` values, schedules, completion
events, purchase records and costs remain byte-for-byte equivalent as JSON
business values. Inventory deletion never deletes a task. Existing task deletion
remains a separate operation. Explicit inventory Restore uses the same verified
transfer with the original ID; it neither generates replacement identities nor
restores linked tasks.

## Archive resolution and operational stock

The global validator adds only typed, dated inventory archive payloads with
canonical stable IDs to its inventory identity namespace. `meta.originalId`, if
present, must equal `payload.id`; metadata alone cannot supply a missing identity.
References report their exact `$.deletedItems[index].payload` target and
`resolution: archived_inventory`. Duplicate archives, active/archive collisions,
malformed archives, broken payload FKs and genuinely missing inventory IDs still
block validation. No reference or history is rewritten by this resolution.

Active stock and purchase/consumption selectors continue to use only `inventory`.
Settings identifies archived links as history-only, does not recreate their stock,
and avoids matching another item by name or part number for automatic task sync.
Manual Add to Inventory avoids reusing archived IDs. Inventory archives, like task
archives, are retained indefinitely, cannot be permanently deleted through Trash,
and survive compact, emergency and tiny backups. This prevents expiry from
invalidating historical references later.

## Validation and limits

The focused fixtures use the two reported V2 task IDs and original array paths,
with synthetic inventory payloads. Tests cover legitimate archives, corrupt and
ambiguous references, both sequential deletions including final stock removal,
unchanged business history, reload, stale listeners, CAS conflicts, permission
failures, altered pending/source evidence, unknown outcomes, backup retention,
Settings provisioning, explicit Restore and independent task deletion. A browser
regression uses only the disposable localhost backend, blocks external requests,
and exercises real Delete confirmation, reporting, Settings and reload.

No production data is read, repaired, migrated, restored or deleted by this change.
The October 28 recovery remains intact. Retained archives increase document size;
the existing payload-size limit still applies. Writes require a clean synchronized
baseline. Indeterminate network outcomes continue to require authoritative review.
