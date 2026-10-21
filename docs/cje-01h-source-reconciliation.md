# CJE-01H source reconciliation (PR #518)

Read-only review dated October 21, 2026. No record decisions have been approved or applied. All totals below are hypothetical modeled job results, not realized accounting revenue/profit.

## Evidence and limits

- Production audit: `OMAX_CJE_01H_Production_Audit.json`; SHA-256 `224913e9965272fd005e6d1e22578f48d28142d69f5b4a961604975cd451604b`. It declares 172 completed jobs but exports only the 79 records participating in 38 candidate groups. All 79 stable IDs are distinct; all 79 reconstructed canonical net results agree with the exported candidate net values within $0.005. This is an offline read of the supplied export, not an authenticated production run.
- Supplied `616.pdf`: two pages, June 16–July 9; SHA-256 `e5a6f3f069ed8f1c5e9a18ef4af505ce8b14167a549f45f22b24b61f96376f1c`. Both rendered pages were visually inspected. Dates at page breaks and distinct physical cut entries were checked.
- Supplied `Cutting_Jobs_Import.xlsx`, Cutting Jobs sheet: 129 rows; SHA-256 `004734c3466ba37f7195231e0db68dd72d48dc330667392373ccd0989bfe948c`. Every row cites `616 (1).pdf`; IDs refer to eight source pages. Rows 2–25 map to the supplied 24-entry PDF excerpt. Later source pages are missing.
- Original `Cut tracker.pdf` bytes are unavailable. CUTPDF linkage below uses the actual production retained complete source text and original date/project/minutes against a unique physical entry in the supplied PDF. It does not assert binary identity or completeness of the two differently named files. Equal names/date/project/hours/material cost alone never establish a duplicate.
- Matching normalizes Unicode fractions, inch quote representation, case and whitespace. It preserves version numbers, dimensions, materials and other text. A match must be unique within the reviewed physical entries and agree with original date, project and cutting minutes. Conflicting current date/project, missing text/context, unrecognized file or multiple source matches withholds confirmation. Later entries remain unresolved, even when both retained texts look alike.

## Classification results

There are 43 possible cross-import edges: 37 one-to-one groups plus six edges in the three-versus-two June 29 group. The old bound of 39 describes maximum simultaneous pairings, not 39 verified duplicates.

| Classification | Edges |
|---|---:|
| Source-confirmed duplicate import (retained provenance to unique supplied entry) | 21 |
| Possible duplicate requiring review; later original source pages missing | 18 |
| Verified separate cuts; cross-pairing disproven | 4 |
| Insufficient retained source evidence | 0 |

The 21 confirmed edges span 19 one-to-one groups and two links in group 15. The other 18 groups remain unresolved. Source confirmation settles import identity only; material/rate correctness and the choice of record remain operator decisions. Ten groups have differing material inputs; four of those groups have confirmed source links (4, 5, 7, 15), and six are unresolved (21, 22, 29, 34, 35, 37).

### Pair-by-pair review

Stable job ID is `cji_` followed by the import ID below; original IDs are preserved. Source locators are physical cut-entry ordinals, not document text-line numbers. Workbook row numbers include the header.

| Group | CUTPDF import ID | 616-CUT import ID | Decision | Physical entry / missing evidence | Material expense difference, CUTPDF minus Excel |
|---:|---|---|---|---|---:|
| 1 | CUTPDF-20260616-001 | 616-CUT-P01-L002 | Source-confirmed duplicate import | PDF p1 cut 1 / p1 cut 1; workbook row 2 | $0.00 |
| 2 | CUTPDF-20260616-002 | 616-CUT-P01-L003 | Source-confirmed duplicate import | PDF p1 cut 2 / p1 cut 2; workbook row 3 | $0.00 |
| 3 | CUTPDF-20260616-003 | 616-CUT-P01-L004 | Source-confirmed duplicate import | PDF p1 cut 3 / p1 cut 3; workbook row 4 | $0.00 |
| 4 | CUTPDF-20260617-004 | 616-CUT-P01-L006 | Source-confirmed duplicate import | PDF p1 cut 4 / p1 cut 4; workbook row 5 | $26.79 |
| 5 | CUTPDF-20260618-005 | 616-CUT-P01-L009 | Source-confirmed duplicate import | PDF p1 cut 5 / p1 cut 5; workbook row 6 | $364.19 |
| 6 | CUTPDF-20260619-006 | 616-CUT-P01-L011 | Source-confirmed duplicate import | PDF p1 cut 6 / p1 cut 6; workbook row 7 | $0.00 |
| 7 | CUTPDF-20260622-007 | 616-CUT-P01-L013 | Source-confirmed duplicate import | PDF p1 cut 7 / p1 cut 7; workbook row 8 | $1.60 |
| 8 | CUTPDF-20260624-008 | 616-CUT-P01-L015 | Source-confirmed duplicate import | PDF p1 cut 8 / p1 cut 8; workbook row 9 | $0.00 |
| 9 | CUTPDF-20260625-009 | 616-CUT-P01-L017 | Source-confirmed duplicate import | PDF p1 cut 9 / p1 cut 9; workbook row 10 | $0.00 |
| 10 | CUTPDF-20260625-010 | 616-CUT-P01-L018 | Source-confirmed duplicate import | PDF p1 cut 10 / p1 cut 10; workbook row 11 | $0.00 |
| 11 | CUTPDF-20260626-011 | 616-CUT-P01-L020 | Source-confirmed duplicate import | PDF p1 cut 11 / p1 cut 11; workbook row 12 | $0.00 |
| 12 | CUTPDF-20260626-012 | 616-CUT-P01-L021 | Source-confirmed duplicate import | PDF p1 cut 12 / p1 cut 12; workbook row 13 | $0.00 |
| 13 | CUTPDF-20260626-013 | 616-CUT-P01-L022 | Source-confirmed duplicate import | PDF p1 cut 13 / p1 cut 13; workbook row 14 | $0.00 |
| 14 | CUTPDF-20260629-014 | 616-CUT-P01-L025 | Source-confirmed duplicate import | PDF p1 cut 14 / p1 cut 14; workbook row 15 | $0.00 |
| 15 | CUTPDF-20260629-015 | 616-CUT-P02-L001 | Source-confirmed duplicate import | PDF p2 cut 1 / p2 cut 1; workbook row 16 | $-180.60 |
| 15 | CUTPDF-20260629-015 | 616-CUT-P02-L002 | Verified separate cuts | PDF p2 cut 1 / p2 cut 2; workbook row 17 | $-361.20 |
| 15 | CUTPDF-20260629-016 | 616-CUT-P02-L001 | Verified separate cuts | PDF p2 cut 2 / p2 cut 1; workbook row 16 | $-180.60 |
| 15 | CUTPDF-20260629-016 | 616-CUT-P02-L002 | Source-confirmed duplicate import | PDF p2 cut 2 / p2 cut 2; workbook row 17 | $-361.20 |
| 15 | CUTPDF-20260629-017 | 616-CUT-P02-L001 | Verified separate cuts | PDF p2 cut 3 / p2 cut 1; workbook row 16 | $-180.60 |
| 15 | CUTPDF-20260629-017 | 616-CUT-P02-L002 | Verified separate cuts | PDF p2 cut 3 / p2 cut 2; workbook row 17 | $-361.20 |
| 16 | CUTPDF-20260701-019 | 616-CUT-P02-L007 | Source-confirmed duplicate import | PDF p2 cut 5 / p2 cut 5; workbook row 20 | $0.00 |
| 17 | CUTPDF-20260706-020 | 616-CUT-P02-L009 | Source-confirmed duplicate import | PDF p2 cut 6 / p2 cut 6; workbook row 21 | $0.00 |
| 18 | CUTPDF-20260706-021 | 616-CUT-P02-L010 | Source-confirmed duplicate import | PDF p2 cut 7 / p2 cut 7; workbook row 22 | $0.00 |
| 19 | CUTPDF-20260707-022 | 616-CUT-P02-L012 | Source-confirmed duplicate import | PDF p2 cut 8 / p2 cut 8; workbook row 23 | $0.00 |
| 20 | CUTPDF-20260708-023 | 616-CUT-P02-L014 | Source-confirmed duplicate import | PDF p2 cut 9 / p2 cut 9; workbook row 24 | $0.00 |
| 21 | CUTPDF-20260710-025 | 616-CUT-P02-L017 | Possible duplicate requiring review | Physical source entry not covered by supplied excerpt; later original pages required | $0.62 |
| 22 | CUTPDF-20260713-029 | 616-CUT-P02-L023 | Possible duplicate requiring review | Physical source entry not covered by supplied excerpt; later original pages required | $0.26 |
| 23 | CUTPDF-20260714-031 | 616-CUT-P02-L026 | Possible duplicate requiring review | Physical source entry not covered by supplied excerpt; later original pages required | $0.00 |
| 24 | CUTPDF-20260715-032 | 616-CUT-P03-L002 | Possible duplicate requiring review | Physical source entry not covered by supplied excerpt; later original pages required | $0.00 |
| 25 | CUTPDF-20260715-033 | 616-CUT-P03-L003 | Possible duplicate requiring review | Physical source entry not covered by supplied excerpt; later original pages required | $0.00 |
| 26 | CUTPDF-20260803-053 | 616-CUT-P04-L008 | Possible duplicate requiring review | Physical source entry not covered by supplied excerpt; later original pages required | $0.00 |
| 27 | CUTPDF-20260804-054 | 616-CUT-P04-L010 | Possible duplicate requiring review | Physical source entry not covered by supplied excerpt; later original pages required | $0.00 |
| 28 | CUTPDF-20260804-055 | 616-CUT-P04-L011 | Possible duplicate requiring review | Physical source entry not covered by supplied excerpt; later original pages required | $0.00 |
| 29 | CUTPDF-20260804-056 | 616-CUT-P04-L013 | Possible duplicate requiring review | Physical source entry not covered by supplied excerpt; later original pages required | $25.60 |
| 30 | CUTPDF-20260806-057 | 616-CUT-P04-L015 | Possible duplicate requiring review | Physical source entry not covered by supplied excerpt; later original pages required | $0.00 |
| 31 | CUTPDF-20260806-058 | 616-CUT-P04-L016 | Possible duplicate requiring review | Physical source entry not covered by supplied excerpt; later original pages required | $0.00 |
| 32 | CUTPDF-20260807-059 | 616-CUT-P04-L018 | Possible duplicate requiring review | Physical source entry not covered by supplied excerpt; later original pages required | $0.00 |
| 33 | CUTPDF-20260810-062 | 616-CUT-P04-L022 | Possible duplicate requiring review | Physical source entry not covered by supplied excerpt; later original pages required | $0.00 |
| 34 | CUTPDF-20260811-063 | 616-CUT-P04-L024 | Possible duplicate requiring review | Physical source entry not covered by supplied excerpt; later original pages required | $15.13 |
| 35 | CUTPDF-20260811-064 | 616-CUT-P04-L025 | Possible duplicate requiring review | Physical source entry not covered by supplied excerpt; later original pages required | $7.84 |
| 36 | CUTPDF-20260811-065 | 616-CUT-P04-L026 | Possible duplicate requiring review | Physical source entry not covered by supplied excerpt; later original pages required | $0.00 |
| 37 | CUTPDF-20260812-066 | 616-CUT-P05-L002 | Possible duplicate requiring review | Physical source entry not covered by supplied excerpt; later original pages required | $0.01 |
| 38 | CUTPDF-20260813-067 | 616-CUT-P05-L004 | Possible duplicate requiring review | Physical source entry not covered by supplied excerpt; later original pages required | $0.00 |

### June 29 and material discrepancies

PDF page 2 cut entries 1, 2 and 3 are ATM Person Door V1, V2 and V3, each 12 minutes. They are three distinct physical cuts. CUTPDF-20260629-015 links only to 616-CUT-P02-L001 (V1); CUTPDF-20260629-016 links only to 616-CUT-P02-L002 (V2). CUTPDF-20260629-017 is V3; neither of the two Excel candidates represents V3. Thus four of the six candidate edges are disproven. The workbook V3 row (18, 616-CUT-P02-L003) is not present among the exported candidate records. Its actual production presence or absence cannot be inferred from a candidate-only export. The June 30 V3 is a separate dated physical entry (page 2 cut 4), despite identical retained line text.

Workbook row 16 stores V1 thickness as 1.1875 inch and row 17 stores V2 as 2.1875 inch; the PDF shows 3/16 = 0.1875 inch for both. Rows 18 and 19 lack parsed thickness although the PDF shows 3/16. Production provenance for the two candidate Excel rows retains these discrepancies; the audit warns without recalculating their material costs. This warrants a separate material review and does not justify choosing either imported price. No thickness, material cost, quantity or source record was changed.

## Hypothetical net previews

The complete 172-job baseline is user-reported +$13,801.63. The export lacks the other 93 jobs, so the full baseline revenue/runtime/material subtotals cannot be independently recomputed from this file. The following net figures subtract exact selected candidate components from that rounded reported baseline. They are approximately correct to the shown cents; the in-app preview recomputes all components from all loaded jobs and uses its captured canonical All-Time-through-local-today boundary.

| Explicit hypothetical exclusions | Excluded jobs | Excluded modeled job value | Excluded runtime expense magnitude | Excluded material expense magnitude | Excluded modeled net | Remaining jobs | Approx. remaining modeled net |
|---|---:|---:|---:|---:|---:|---:|---:|
| Hypothetically exclude source-linked CUTPDF | 21 | $4,120.00 | $927.00 | $3,830.54 | $-637.54 | 151 | +$14,439.17 |
| Hypothetically exclude source-linked 616-CUT | 21 | $4,120.00 | $927.00 | $3,979.76 | $-786.76 | 151 | +$14,588.39 |

The two scenarios exclude one side of each of the 21 confirmed edges listed above. They do not remove V3 or any of the 18 unresolved pairs. Every job remains in the application and its canonical financial summaries. Neither scenario chooses the correct material cost. The earlier 37/39-exclusion simulations remain unapproved and include unresolved source identities; they must not be labeled source-adjusted totals. Recomputing their excluded net contributions agrees with the exported candidate values; reconstructing a rounded full baseline can differ by one cent from a full-precision live total.

## Rate evidence and presentation

All 129 workbook charge/cost rate cells are blank. All 79 exported candidate records likewise retain blank original rate cells and saved $200/hr charge / $45/hr runtime cost rates. `js/cuttingJobImporter.js` supplies those values for blank rates. These are modeled defaults, not independently verified historical actual costs, invoices, payments or accounting profit. No original rate cells or saved values were rewritten. No purchases, maintenance, or annual forecast are deducted again; complete Net Waterjet Financial Impact remains unavailable pending cost allocation and ledger evidence.

The existing read-only Cutting Jobs audit now displays retained source file/row/text/context, physical-entry match status/reasons, thickness warnings, saved/default rate evidence and per-pair material expense differences. It exposes explicit unchecked stable-ID exclusions and a clear/reset action; nothing is chosen automatically or persisted. The preview shows baseline/excluded/remaining counts, modeled job value, negative runtime/material contributions and modeled net. Only the captured canonical financial window and finite eligible results are used. Missing/repeated/unknown/noncandidate IDs block the preview; selecting an entire group warns. A change in loaded financial evidence or local date requires a fresh audit. Canonical financial cards and records are never adjusted by preview controls.

## Validation and remaining verification

No package.json or repository AGENTS.md was found. The CJE-01G targeted Node command in `docs/cje-01c-financial-reconciliation.md` was run with `tests/cje-source-reconciliation.test.js` added: **298 Node runner entries passed, 0 failed**, including 19 new focused source/preview tests. Legacy repair/import script entries also report their internal 15/26 passing cases. **3 isolated Edge browser workflows passed, 0 failed** using:

```powershell
$env:OMAX_PLAYWRIGHT_PATH='C:/Users/Ryder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
node --test tests/cje-completed-duration.browser.cjs tests/financial-reconciliation.browser.cjs
```

Browser coverage includes the synthetic 172-job/155-duration/38-group shape, a real-source-text synthetic June 29 group with two confirmed and four separate edges, material warning, unchecked preview controls, selection/reset totals, changed-day stale-preview blocking, cross-page canonical totals, financial midnight boundaries in Chicago/UTC+14, expense signs, independent calculator/utilization ranges and desktop/mobile scrolling. All external requests are blocked and Firebase is absent. Save/backup/mutation traps remained at zero; every loaded business collection and the disposable backend matched its baseline after the workflow. Desktop/mobile screenshots were inspected.

Ten changed JavaScript/test/fixture files passed `node --check`: `js/core.js`, `js/cuttingJobSourceEvidence.js`, `js/financialReconciliation.js`, `js/renderers.js`, `js/views.js`, `tests/cje-source-reconciliation.test.js`, `tests/cje-completed-duration.test.js`, `tests/cje-completed-duration.browser.cjs`, `tests/fixtures/cje-source-evidence.js`, `tests/fixtures/cje-completed-financial.js`. `git diff --check` passed. The offline supplied-export analysis reproduced 38 groups, pairing upper bound 39, all 43 edge classifications, and zero source-object mutations. Original PDF/workbook hashes remained unchanged. No production records, historical jobs, maintenance history, Firebase data, importer, schema, persistence/revision/CAS or recovery protections were modified.

PR #518 is ready for production verification and remains open/unmerged. Before merge: run the updated Audit button on the same loaded production population; check 21/18/4 source counts and material warnings; test explicit preview selections against all 172 loaded records and compare the same financial date across pages. Obtain the remaining original pages (and original Cut tracker.pdf if independent file-level corroboration is required), resolve material/default-rate evidence, and approve any record decisions separately. Full repository tests and authenticated production workflows were not run. No historical correction or approved duplicate-adjusted total is delivered in this phase.
