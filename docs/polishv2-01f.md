# POLISHv2-01F: existing-job project/category edits

## Diagnosis and correction

The reported "Category needs project-number review. Project ownership is missing or conflicting" text originates in `CuttingJobHistory.resolveCategoryProject()`, before the Firebase writer is called. A failed resolution clears the read-only Project # draft and correctly prevents Save; the previous explanation did not identify the ownership evidence or corrective action. This is distinct from a Firebase acknowledgement/readback failure.

Two editor defects were reproduced and corrected:

- Both Save handlers passed a structured clone as the original job to ownership validation. That validator excludes the edited job by object identity, so the live record's own stale project assignment could veto its correction. Save now validates with the live original, matching the form and authoritative coordinator. A regression failed before the correction (zero saves instead of one) and passes afterward for both editors. Other jobs' conflicting ownership remains blocking.
- The Active editor rebuilt its category draft from saved data and restored it on a later animation frame. It now retains the form in place, as the Historical editor does. Explicit category selection/reselection refreshes the Project # draft from verified ownership; merely opening an unchanged legacy record preserves its existing project/category pair. No record is mutated by selection alone.

Existing-job validation messages now show the selected category, stored category Project # and linked-job project claims. They direct the user to choose a category with verified ownership or have the category label/project metadata and conflicting linked assignments reviewed first. A mismatched read-only Project # directs the user to reselect the category and Save again. Edits remain open and unsaved on validation or persistence failure.

Valid user-directed project changes update only the edited job's category/Project # through the existing transaction, source/prepared-state safeguards and independent authoritative readback. Success and editor closing still require `saved && verified && !requiresReload`. The authoritative adapter, ownership resolver, recovery system and schema are unchanged.

Files changed: `js/renderers.js`, `tests/cjpc01-manual-paths.test.js`, `tests/polishv2.browser.cjs`, and this report. Category creation, redirects, Tolerance Reset, RPM JavaScript/styles and pump baselines were not modified.

## Tests

Checked for package.json first; none exists. Commands ran from `C:/CodexProjects/OMAX/.worktrees/polishv2-small-fixes`.

```powershell
node --test --test-reporter=tap tests/cjpc01-manual-paths.test.js tests/cjpc01-project-category.test.js tests/cjo02-chronology.test.js tests/cjo04c-readback.test.js
```

PASS: 86/86 tests; zero failed, skipped or cancelled. Output: `C:/CodexProjects/OMAX/artifacts/POLISHv2-01F-tests.tap`.

```powershell
$env:OMAX_PLAYWRIGHT_PATH='C:\Users\Ryder\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node --test --test-reporter=spec tests/polishv2.browser.cjs
```

PASS: 21/21 tests, including the parent test; zero failed, skipped or cancelled. Output: `C:/CodexProjects/OMAX/artifacts/POLISHv2-01F-browser.log`.

The browser tests use headless Edge, fresh disposable devsafe IndexedDB/local storage, America/Chicago and blocked external requests. Firebase SDK absence is asserted. The application's real forms and guarded save/readback coordinator run against this isolated local backend; no production data is read or changed for testing.

Both Active and Historical flows cover:

- User reassignment to `Mesquite 1242` / Project # `1242`, including a legacy category without explicit project metadata.
- Synchronous category retention, correct Project #, delayed readback with no premature success/local adoption, editor closing after verification, displayed category and refresh retention.
- Stable ID/count, existing attachments/history/notes/rates and unrelated jobs, categories and pump data. Category selection alone leaves saved records untouched.
- Explicit reassignment of a job whose own stale project would otherwise conflict, and a source job missing Project #. Unchanged legacy pairs remain exact in unit coverage.
- Missing or conflicting ownership: explanatory inline status/toast, zero writer calls, unchanged backend and preserved draft fields. Selecting a separate verified project clears the ownership error.
- Definite rejection and mismatched readback: retained edits, no success/adoption, and unchanged existing recovery suspension behavior.

Existing POLISHv2 tests in the same browser file also pass for category creation, Dashboard/Calendar redirects, Reset protection, RPM save/readback/graph and contrast. Only relevant category/chronology/readback Node files and this existing browser file were run; the broader prior suite was not rerun.

Fixture development required a full reload after seeding (hash-only navigation retains live state), a valid existing source category for the missing-project case, and an independently owned fallback category when a conflict also claims the original project's number. An intermittent existing Dashboard category-dialog test passed in isolation; its input automation now waits for the dialog's existing deferred initial focus before typing. Category-creation application code was not changed. These fixture corrections preceded the final passing run above.

```powershell
node --check js/renderers.js
node --check tests/cjpc01-manual-paths.test.js
node --check tests/polishv2.browser.cjs
git diff --check
```

PASS: all three syntax checks and whitespace check. Current main remains `79d6b04859db6d4026851f82f0a027a22fa570ee`, an ancestor of this branch; no incoming changes/conflicts were found.

## Remaining manual checks

1. In a designated nonproduction Firebase workspace, reassign an Active and Historical job to Mesquite / 1242, immediately Save, confirm editor closing, category/Project #, stable ID and attachment references, then refresh and perform actual logout/login.
2. Exercise real Firebase permission/network failure and verify retained edits, no success, and existing recovery instructions for uncertain outcomes.
3. If the actual Mesquite category still has conflicting metadata or linked-job ownership, use the new evidence message to review that data. The authenticated affected page was not available to inspect, and this patch does not rewrite its records or bypass legitimate conflicts.

No migrations, production-data changes or PR merge were performed.
