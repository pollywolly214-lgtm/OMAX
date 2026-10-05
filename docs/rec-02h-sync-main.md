# REC-02H — Sync existing PR #487 with current main

Verified October 5, 2026. Existing branch: `recovery-import-staging-fix`; base: `main`. No new branch/PR, reset, rebase, force-push, PR merge, Firebase access, or production-data changes.

## Branch and merge evidence

| Item | Value |
| --- | --- |
| Initial checkout | `ui-production-polish`, `398cc33ee999752efb5b672ace94fb3eea09db72` |
| Initial working tree | No tracked edits; existing untracked `.worktrees/` retained |
| Initial local recovery branch | `85a4a40226c5840fcebef8977d6d9ff87b2fd190` |
| Old PR branch head after fetching/fast-forwarding | `35f6fbbaf2eead6512c93b0ada3e5d5ea1da3156` |
| Current origin/main merged | `40d6817ac3f805a1b0845c309ec49376f1dc0cb6` |
| Merge base | `7fb1109a397acffb7a6ee2e3aad3c615bbf55125` |
| Before merge | PR branch 14 ahead / 13 behind current main |
| Merge strategy | Normal two-parent merge, stopped before commit for validation |
| Conflicts / conflict files / resolutions | None / none / none; `index.html`, `js/core.js`, `js/renderers.js` auto-merged |
| Existing remote/PR ref | `refs/pull/487/head` and remote branch both matched old PR head |
| Resulting head | The merge commit containing this document; inspect with `git log -1 --format='%H %P'` |

The remote PR branch had already incorporated PR #489's MCF-01 maintenance-calendar work. Its six commits were fast-forwarded into the stale local recovery checkout before merging main. Those existing changes were preserved. Main's newer CJI-02 and PHV-01 work is inherited through the merge and does not appear as PR-specific changes against current main.

## False-recovery diagnosis and preserved safety

Current main contains CJI-02G (`3dea15c`), which corrects the global identity auditor. The old branch treats nested cutting-job `import_event_id` copies as separate identities, even though the importer intentionally preserves the same source ID in the owning job, its manual logs, and provenance. This creates false duplicate groups and unsupported-reference findings.

Main counts only direct active/completed job members as canonical cutting import identities. Nested copies must resolve uniquely to their owning job and exactly match its canonical identity. Missing or contradictory evidence, real canonical duplicates, nested record-ID duplicates, unrelated identity corruption, and protected-data failures remain blockers. No stored evidence is changed.

A read-only comparison used the same synthetic post-import fixture with 1 active job, 155 completed jobs, 15 folders, and 88 canonical imported identities. The old auditor rejects it with 88 false cutting-import duplicate groups. The merged auditor accepts it with 88 canonical identities, 176 owning-job references, zero duplicate groups, zero unknown references, and zero changes. The fixture is unchanged. A genuine active/completed canonical collision still fails. This reproduces the stale-auditor mechanism; it is not production Firebase or browser verification.

Compared with the exact main SHA, the global auditor, inventory auditor, atomic persistence, content firewall, cutting importer/history/repair/download modules, purchase financials, views, styles, CJI-02G tests, global identity tests, and post-import fixture are unchanged. A separate source comparison confirms the core runtime prefix, protected-data code, startup/adoption, recovery gates, persistence/CAS, and cutting import integration are exact main outside the existing REC-02 provenance handling and task/calendar registration points. Explicit read-only URL flags remain respected.

REC-02 remains strict on exact staged equality, exact affected-destination restoration before save, protected drift, unprovable restoration, ambiguous writes, revision/CAS, backups, and committed server read-back. Focused tests exercise each failure path; no save gate is weakened.

The user's REC-02H request requires Transfer Tank Water Pump and Empty Scrap Bin to remain blocked. The current remote branch's MTS-01B commit had made them eligible, contrary to the current request, PR description, and visible UI text. This merge restores their original unresolved definitions and six-eligible/two-blocked test expectations. Forged eligibility is tested for both names, and successful setup explicitly creates neither blocked task. Exact existing tasks remain unchanged; duplicates/ambiguity block; setup requires fresh read-only preview, reviewed confirmation, backup, CAS and read-back; reruns create zero duplicates. Setup stages only `tasksAsReq` and does not create maintenance history, calendar events, recurrence chains, occurrences, or inventory changes.

## Validation commands and results

Commands ran from `C:\CodexProjects\OMAX`. Node version: `v24.19.0`; no package.json/npm suite exists. Local output is under `artifacts/rec-02h/`.

| Command/check | Result |
| --- | --- |
| `git fetch origin` | PASS; fetched latest remote PR head and inspected current main |
| `git branch --show-current`, `git status --short`, `git rev-parse HEAD`, `git worktree list`, `git remote -v` | PASS; initial checkout and untracked worktrees recorded above |
| `git rev-parse origin/main origin/recovery-import-staging-fix`, `git branch --list recovery-import-staging-fix`, `git merge-base origin/recovery-import-staging-fix origin/main` | PASS |
| `git rev-list --left-right --count origin/recovery-import-staging-fix...origin/main` | PASS; `14 13` |
| `git log --oneline origin/recovery-import-staging-fix..origin/main`, inverse range, and file histories | PASS; inspected both histories and MTS-01B definition changes |
| `git diff --stat 7fb1109 origin/main`, `git diff 7fb1109 origin/main -- <shared files>` | PASS; inspected main's identity/provenance, import, core, rendering, and index changes |
| `git diff origin/main...origin/recovery-import-staging-fix -- <REC-02/MTS-01 files>`, `git show <ref>:<docs/tests/modules>` | PASS; inspected intended PR behavior before editing |
| `rg --files -g AGENTS.md` and ancestor AGENTS.md checks | PASS inspection; no applicable AGENTS.md found (`rg` no-match exit 1) |
| `gh pr view 487 --json title,headRefName,baseRefName,state,url,headRefOid`, `gh --version` | FAIL environment; `gh` unavailable; Git refs and GitHub connector used instead |
| `git ls-remote origin refs/pull/487/head refs/heads/recovery-import-staging-fix refs/heads/main` | Initial sandbox attempts FAIL remote-helper access; approved retry PASS; exact refs confirmed |
| `git switch recovery-import-staging-fix` | Initial sandbox attempt FAIL `.git/index.lock` permission; approved retry PASS |
| `git merge --ff-only origin/recovery-import-staging-fix` | PASS; preserved six existing calendar commits |
| `git status --short`, `git rev-parse HEAD origin/main`, `git rev-list --left-right --count HEAD...origin/main` | PASS before merge; no tracked edits, recorded heads, `14 13` |
| `git merge --no-commit origin/main` | PASS; no conflicts, normal merge pending validation |
| `git diff --name-only --diff-filter=U`, `git rev-parse MERGE_HEAD` | PASS; no unmerged paths; exact main SHA |
| `node --test tests/maintenance-task-setup.test.js tests/historical-import-staging.test.js` | PASS: 140/140, zero failures/skips/cancellations |
| Affected suite command below | Initial FAIL: 459/460; recovery test fixture omitted the existing calendar-integrity dependency. Added `OMAXMaintenanceCalendarIntegrity` to its VM window. Rerun PASS: 460/460, zero failures/skips/cancellations |
| `node --test tests/*.test.js` | PASS: 637/637, zero failures/skips/cancellations |
| `node --check <file>` for all changed/closely related JavaScript | PASS: 39 files; exact file list in local `syntax-checks.txt`; syntax checks for both edited tests repeated after fixture correction |
| `git diff --exit-code origin/main -- <main safety/import/identity files>` | PASS; selected files remain exact main |
| `node artifacts/rec-02h/verify-main-preserved.cjs` | Initial sandbox FAIL `spawnSync git EPERM`; approved read-only retry PASS source comparisons and synthetic positive/negative audits |
| `git diff origin/main --stat`, `--numstat`, `--name-only`, shared core/renderers/index diffs | PASS; main changes are absent from PR-specific diff; inherited PR #489 work retained |
| `git diff --check`, `git diff --cached --check` | PASS |
| `git ls-files` followed by `rg -n '^(<<<<<<< \|=======$\|>>>>>>> )' -- <each tracked file>` | PASS; zero conflict markers; `rg` no-match exit 1 is expected |
| `git check-ignore artifacts/rec-02h/syntax-checks.txt` | PASS inspection; exit 1 confirms logs are untracked, not ignored; they are excluded from staging |
| GitHub `get_pr_info`, PR #487 | PASS; verified open/unmerged, existing head branch, base main |

The affected suite was run with this exact command (both initial failure and corrected pass):

```powershell
node --test tests/recovery-import.test.js tests/historical-import-readiness.test.js tests/import-selective-rollback.test.js tests/maintenance-history-import.test.js tests/atomic-persistence.test.js tests/pump-rebuild-duplication.test.js tests/global-identity-repair.test.js tests/inventory-identity.test.js tests/inventory-identity-repair.test.js tests/cji-02g-cutting-import-identities.test.js tests/cji-02-project-category-import.test.js tests/cji-02a-backup-action.test.js tests/cji-02b-legacy-category-adoption.test.js tests/cji-02c-comparison-state.test.js tests/cji-02d-preview-stability.test.js tests/cji-02e-weekly-window.test.js tests/cji-02f-legacy-1111.test.js tests/cutting-job-import.test.js tests/cji02-history-repair.test.js tests/mcf-01-maintenance-calendar.test.js tests/maintenance-new-one-time.test.js tests/weekly-cost-report-baseline.test.js
```

## Remaining operator acceptance

No browser or production Firebase verification is claimed. After Vercel deploys this PR head, hard-refresh the existing PR #487 preview and verify the same legitimate server state loads normally, without retrying an already-completed import. Compare loaded revision, protected counts, exact provenance, and recovery diagnostics with main. Explicit read-only URL flags intentionally retain read-only mode. Verify real duplicate identities, contradictory provenance, malformed protected shapes, failed exact adoption, and unresolved/indeterminate writes still block in a disposable environment. Review MTS-01 without saving: existing tasks retained, ambiguous names blocked, and the two unresolved definitions blocked. Exercise creation, backup, CAS/read-back and rerun only in a disposable workspace or through separately authorized operator acceptance. Confirm REC-02 restoration and suspension failure paths there. Keep PR #487 unmerged.
