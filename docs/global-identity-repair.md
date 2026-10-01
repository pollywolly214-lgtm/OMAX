# PH-06: global identity review and Recovery Mode exit

2026-10-01 · `production-readiness-import-prep` · PR #485.

Development uses production-shaped **synthetic** records and disposable devsafe browser storage. No production document was accessed or repaired. User-provided revision 1790781035355 and count dimensions are fixture inputs, not hardcoded requirements or a certification of the live document. Review the real read-only preview before considering repair execution.

## Read-only preview

```js
await window.previewGlobalIdentityRepair()
```

The API reads the authoritative SERVER document anew. It makes no business mutations, writes, backups, retries, or repairs. It reports the complete canonical source signature and revision, audited collections/identity fields, duplicate groups with full record evidence/indexes, missing IDs, exact resolved references, deterministic proposed IDs, every proposed changed field, unknown references, blockers, and before/expected collection counts. It also requires the displayed revision and actual live business evidence to match the server; a stale display or local edit blocks apply.

The audit covers required top-level ID collections (inventory/folders, legacy tasks, all three V2 collections, active/completed jobs, job/settings/general folders, orders, inventory transactions, garnet history and deleted records), receipt week keys, machine/daily history date keys, material type IDs and keyed material references, order item IDs, file IDs, and other ID-bearing arrays/objects. Permanent import identities are checked across receipt weeks, across maintenance tasks, across pump entries, and across active/completed jobs within their respective import namespaces. Ordinary repeated names, dates in unrelated collections, prices, notes and other values do not define collisions. Active/completed jobs share a namespace; interval/as-required tasks share a namespace. Nested independent record collections retain their own scopes.

Known exact foreign keys are checked, including inventory links, legacy task/template links, categories/folder parents, task/instance/event chains, job/request references, receipt inventory references and material keys. Unknown copied IDs, embedded strings, object keys, deleted/cached evidence or other consumers of an ambiguous old ID block repair; they are not rewritten speculatively.

## Single deterministic plan

Only inventory and safely provable V2 collision mappings are repairable in this pass. Missing IDs, other collection collisions, dangling references, inconsistent provenance, ambiguous targets, invalid recurrence identity evidence and proposed-ID collisions block the entire combined plan.

| Collection | Stable mapping evidence |
| --- | --- |
| Inventory | PH-05's unique linkedTaskId ↔ exact legacy task ↔ matching inventoryId relationship. Permanent ID remains `inventory_task_` plus six-digit Unicode code points of linkedTaskId. |
| V2 tasks | A unique, existing legacyTaskId for every member of a duplicate group. Names/indexes never distinguish tasks. |
| V2 instances | Resolved logical task, startDateISO, instanceMode and canonical repeatRule. Equal semantic tuples or unresolved references block. |
| V2 occurrences | Exact resolved instance tuple, eventType, effectiveDateISO, recordedAtISO and existing root/supersedes provenance. Equal evidence tuples or ambiguous incoming edges block. |

V2 permanent IDs use `ph06_<kind>_` plus six-digit Unicode code points of the **entire canonical semantic tuple**. This injective encoding has no clock, index, display-name inference or hash collision assumption. Record ordering affects the reviewed source signature, but not the permanent identity. All members of a repaired duplicate group receive distinct IDs; no arbitrary winner retains an ambiguous old ID.

Explicit legacy provenance and exact task/instance/root/supersedes edges propagate logical task constraints. Only one exact compatible target is accepted. A base one-time event's original effective date may distinguish multiple one-time instances; moved events never choose an instance using their moved date. One-time roots resolve to a base event in the same logical instance. Supersedes edges must remain in that root chain and be acyclic. Derived repeat roots preserve the date/slot suffix while replacing only the exactly resolved instance component. Unknown or legacy-free ambiguous chains require manual review.

The changed-field allowlist is:

- affected inventory `id` and exact legacy/V2 `inventoryId` links;
- affected V2 task/instance/occurrence `id`;
- exact V2 `taskId`, `instanceId`, `rootOccurrenceId` and `supersedesEventId` references, including the instance component of a derived repeat root.

Everything else is preserved canonically: names, quantities, prices, dates, provenance, notes, histories, statuses, schedules/recurrence rules, machine/pump/RPM data, purchases, jobs, layouts, attachments and unknown fields. Array ordering/counts are unchanged. The full `changes` list binds every authorized field to its exact old/new value. PH-05 inventory-only browser apply is superseded; it cannot perform an independent repair while V2 corruption remains.

## Separate apply architecture; execution is not requested

The global apply API is separate from preview/load and requires explicit confirmation of the exact reviewed plan. A fresh SERVER read must reproduce the revision, full source signature and complete reviewed plan, with no blockers, unknown references, local business drift or unresolved write outcome. It downloads an exact authoritative pre-repair JSON backup including counts/revision before allowing a write. A failed download initiation or backup-time edit stops before the transaction. Download initiation cannot prove that an operator retained the file; retain and verify it before any eventual authorized repair.

Only an isolated cloned document receives the exact patches. Live UI arrays are never staged and ordinary autosave is never temporarily enabled. A short-lived internal authorization binds source, pending state and immutable expected revision to the existing Firestore transaction/CAS writer. The transaction rechecks exact full source equality even if revision is unchanged, exact pending equality, firewall and payload limits. It does not perform ordinary merge/compaction/normalization on the ID-only patch.

Definite rejection leaves the document and local evidence unchanged. An indeterminate/thrown outcome has no rollback, no retry and no automatic adoption. A committed write requires a fresh SERVER result exactly equal to the committed document; every collection count, authorized FK, unique repaired identity, unrelated business field and advanced transaction revision must verify. In-flight local edits prevent adoption. Mismatch/read failure suspends recovery and preserves evidence for manual verification.

## Central recovery gate

Load, realtime screening and verified post-repair adoption use the same global identity integrity check. An inventory-only correction cannot clear V2 or other identity blockers. Read-only evidence is adopted without seeding, normalization, deletions or business cache writes before any gate can reopen.

Recovery clears only after meaningful authoritative state exists, global IDs/required references are valid, no unresolved global blocker or indeterminate/import-repair verification failure exists, local-backup-only mode is absent, and the document passes protected registry shapes, content firewall, payload limits and existing protected-save registry/coverage/compaction preflight. That preflight assesses the authoritative document as its full baseline, not a local cache as a restore source. Actual adopted bindings must then equal the entire server document and pass existing protected reduction checks. Initial adoption must complete successfully. Explicit `recovery`, `readonly`, `diagnostics` or preview-read-only URLs stay read-only.

On success the normal UI returns, recovery/autosave flags clear, ordinary saves and secure uploads use their usual gates, and recovery banners disappear. Undo history is initialized from exact authoritative evidence rather than a normalizing snapshot. Opportunity calculations are marked ready for subsequent edits without rewriting rollups during adoption. There is no console override to bypass integrity. Remaining blockers are displayed alongside authoritative records.

## Synthetic audit and checks

The baseline contains 28 inventory rows, 15 interval/13 as-required tasks, 5 V2 tasks, 80 instances, 13 occurrences, 1 active/67 completed jobs, 80 daily-hour records and 70 total-history records. It includes moved/superseded and derived-repeat chains. The known three-way task collision is separated using jewel_nozzle_clean, mixing_tube_rotation and pump_tube_noz_filter.

Eight synthetic groups are detected:

- inventory_mqgqwky1: 27 records;
- maintenance_task_v2_mqgqwlx5: 3 records;
- maintenance_instance_v2_mrml3183, maintenance_instance_v2_mqi23bhy, maintenance_instance_v2_mqgqwlx5: 3 records each;
- maintenance_occurrence_v2_mrml3183, maintenance_occurrence_v2_mqi23bhy, maintenance_occurrence_v2_mqgqwlx5: 3 records each.

The base synthetic plan has zero blockers/unknown references. Adversarial fixtures deliberately block ambiguous/unknown cases. This does not establish that the real production plan has no blockers.

That synthetic plan explicitly lists 163 identity/reference field changes: 48 record-ID replacements and 115 exact foreign-key relinks. Its 27 inventory replacements/five V2 inventory links retain the PH-05 mapping.

`tests/global-identity-repair.test.js` covers the required PH-06 scenarios plus additional schema, provenance, copied-ID, root-chain, scoped-authorization and explicit-read-only regressions. `scripts/ph06-recovery-smoke.js` uses installed Edge with a new disposable profile at **http://localhost:8000/?devsafe=1**, blocks production business requests, verifies read-only routes/reload and an externally modeled clean fixture result, then confirms normal UI and an ordinary save resume. It never calls the production repair API. No giant PH-03 matrix was rerun.

Validation: syntax checks pass for all nine changed JavaScript files. Targeted global/inventory/atomic tests pass 90 Node runner tests (52 PH-06 cases), with zero failures/skips. The full `node --test tests/*.test.js` suite passes 150, with zero failures/skips. `git diff --check` passes. The focused Edge smoke passes with zero page errors and zero production business requests; it confirms corrupt evidence remains read-only, clean SERVER fixture reload restores normal UI, and `saveCloudNow` succeeds afterward.
