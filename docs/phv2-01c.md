# PHv2-01C: Purchase History navigation, quantity and save safety

Base: refreshed `origin/main` at `79d6b04859db6d4026851f82f0a027a22fa570ee`, the merge of POLISH-01 / PR #501.
Branch: `codex/phv2-01c-purchase-history`. No automatic merge.

## Changes and root causes

- Replace the fixed UTC-calendar-year / 52-option dropdown with local-calendar ISO week selection, chronological year selection, 52/53-week generation and a visible Current week marker. Ordinary opening selects today; explicit Central Data Table targets select their original week/year.
- Week lookup now returns an ephemeral empty view rather than inserting an empty persisted week. Week/year/range navigation does not serialize purchases or request a save.
- Retain detached input rows while navigating so incomplete or invalid edits can be resumed. Explicit save/close validates all visited drafts before staging any pending draft changes. Closing is blocked when validation or save confirmation fails.
- Set both quantity inputs to step 1. New or modified quantities must be finite nonnegative safe integers; zero remains allowed to preserve the existing minimum. Blank/incomplete new lines are not saved until their quantity is valid. Unchanged legacy decimal quantities remain readable and retain their original representation.
- Retain each DOM row's source record using a WeakMap, updating only changed editable fields. Repeated saves after deletion no longer depend on stale array indexes. Existing IDs, optional fields, imports/provenance, inventory references, untouched dates, shipping, tax and numeric representations are retained. No new purchase IDs or order fields are introduced.
- Inspect the immediate save result: require saved=true, stateWriteCompleted=true, no blocked flag and no indeterminate flag. An unavailable, thrown, blocked or uncertain save cannot display confirmed success, close the modal or refresh away its inputs. Do not schedule a redundant debounced save after acknowledgement.
- Keep newer edits when a save is in flight or when a dashboard refresh is already scheduled.
- Keep clear/undo snapshots lossless and their success messages conditional on the save result; clear detached drafts when the user explicitly invokes those existing actions.

## Scope and preservation

Product changes are confined to Purchase History functions in `js/renderers.js` and the year control in `js/views.js`. `tests/purchase-history-navigation.test.js` exercises actual Purchase History handlers in an isolated DOM/VM harness. The existing financial rendering harness receives its new local dependencies; financial assertions are unchanged.

`js/core.js`, `js/atomicPersistence.js`, `js/purchaseFinancials.js`, cutting-job calculations, inventory, pump and calendar product code are unchanged. Existing CAS, transaction/source/prepared-state checks, captured-target chronology, mergeUnlessIdentical, material/pump evidence and Recovery Mode protections are retained. POLISH-01's Export Range button remains beside the range selector; its generated workbook is tested.

No migration, historical recalculation, order-level shipping, production Firebase operation or dependency installation occurred. Untouched historical lines are reused verbatim, including missing fields and legacy decimals. All writes continue through the existing persistence architecture. Transaction acknowledgement is checked; this phase does not add an independent Purchase History server-readback architecture.

## Commands and results

`Test-Path package.json` returned False; no npm commands ran. `git ls-tree --name-only origin/main package.json` previously confirmed main has no package.json.

Repository preparation:

```powershell
git fetch origin main
git switch -c codex/phv2-01c-purchase-history origin/main
git log origin/main -3 --oneline
```

The initial sandboxed fetch/switch could not write `.git/FETCH_HEAD` / `.git/index.lock`. Both commands succeeded with the required Git write permission; no files were overwritten to bypass that restriction. Existing untracked `.worktrees/` and `artifacts/` were left untouched.

Focused regression command:

```powershell
node --test tests/purchase-history-navigation.test.js tests/purchase-financials.test.js
```

The first financial-only run failed three VM-harness cases because the newly introduced draft map was not supplied by that isolated harness. The harness was updated, preserving its financial assertions; subsequent runs passed. Additional navigation tests cover multi-week drafts and edits arriving during/after a save.

Final relevant regression command (PowerShell filters the displayed output only):

```powershell
node --test tests/purchase-history-navigation.test.js tests/purchase-financials.test.js tests/atomic-persistence.test.js tests/production-hardening.test.js tests/global-identity-repair.test.js tests/historical-import-readiness.test.js tests/historical-import-staging.test.js tests/weekly-cost-report-baseline.test.js tests/inventory-material-persistence.test.js tests/pump-baseline.test.js tests/polish01-hotkey.test.js tests/polish01d-dimensions.test.js tests/cjo02-persistence.test.js | Select-Object -Last 9; exit $LASTEXITCODE
```

Result: **470 tests passed, zero failures**. These include Purchase History financials/navigation, exact historical preservation, shared atomic saves/CAS/recovery, imports, material persistence/evidence, pump baselines, chronology persistence and POLISH-01 shortcut/dimension behavior.

An exploratory broader run also included these existing tests:

```powershell
node --test tests/cjo04b-verification.test.js tests/cjo04c-readback.test.js
```

Those two files have **51 tests: 24 pass, 27 fail**. A temporary snapshot created with `git archive 79d6b04` was extracted outside the working tree, and the exact same two-file command was executed on both main and this branch with `--test-reporter=tap`. An assertion compared all failing test names and summary counts: **identical failure sets**. Baseline errors include missing `ensureJobCategoryFolderOpen` in the active-copy fixture and missing `stableStringifyForIntegrity` in the readback fixture, followed by dependent assertions. Neither those fixtures nor their unrelated product code were changed. The first attempt to reuse a prior temporary directory failed because that process-local sandbox directory was unavailable; recreating and comparing both snapshots in one invocation passed.

Syntax and scope checks:

```powershell
node --check js/renderers.js
node --check js/views.js
node --check tests/purchase-history-navigation.test.js
node --check tests/purchase-financials.test.js
git diff --check
git diff --name-only
git diff origin/main -- js/core.js js/atomicPersistence.js js/purchaseFinancials.js
git status --short
```

Syntax/whitespace checks passed. The shared persistence/financial file diff is empty. Source inspection also used `Get-Content`, `rg`, and Git diffs. One `rg` call with the literal Windows path glob `docs/polish-01*.md` failed; the relevant report was read directly instead. No product behavior depends on that inspection error.

## Required manual verification / limitations

- In a browser, open Purchase History and confirm today's local ISO week/year, visible Current week label, year changes, Week 53 and Central Data Table deep links.
- Browse empty and historical weeks without editing; verify no Firebase writes or new week records.
- Type a decimal quantity, navigate away and back, and verify the input survives. Check integer spinner increments, validation messages, successful correction, and an untouched historical decimal while editing another field.
- Delete a line, edit/save repeatedly, reload and verify the surviving line's complete metadata, dates, shipping and import provenance.
- Confirm Export Range placement/download and financial columns; verify horizontal layout with the added year control on narrow screens.
- Exercise permission/CAS failures, offline or indeterminate outcomes, existing Recovery Mode and simultaneous material/pump verification. Confirm there is no success/close/refresh on an unconfirmed save.
- Verify successful saves and subsequent reloads against a dedicated test Firebase workspace. Automated tests use fixtures, not live Firebase.

No live Firebase or manual/real-browser test was performed. Draft preservation is local to the open Purchase History UI; it is not crash/reload recovery. The pre-existing CJO fixture failures remain outside this PR.
