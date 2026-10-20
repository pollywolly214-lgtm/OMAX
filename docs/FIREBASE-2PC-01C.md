# FIREBASE-2PC-01C — water-quality saves across computers

Base: fetched `origin/main` **ed6118cf3b2a1c8e13eb143d858543417e5d066d**. Branch: `codex/firebase-2pc-01c`, isolated in `.worktrees/firebase-2pc-01c`. The original checkout's modified `style.css` and untracked `.worktrees/` / `artifacts/` were left untouched.

## Confirmed cause

`js/renderers.js:renderWaterQualityTracker` originally used **only** `localStorage["omax.waterQualityChecks.v1"]`. Its `save` function validated input, read/parsing that key, generated a UUID, added or replaced a local array entry and called `localStorage.setItem`. There was no Firebase write, revision check, backend readback or shared state binding. Thus the previous multi-computer snapshot fix did not cover water quality at all.

The catch covered all of the following and labeled them all browser-storage failures: local read/JSON/record validation, UUID generation, missing edited records, local writes, row rendering and calendar rendering. Rendering could even fail *after* local persistence, making “No changes were saved” inaccurate. Successful localStorage reads, Firebase access and matching revisions could not make this path share records or guarantee its local writes would succeed.

A disposable headless Edge test against an untouched archive of this exact main SHA injected a real `QuotaExceededError` on writes to the legacy key. It reproduced the exact reported warning, preserved entered PPM, and confirmed that no backend data changed. The old catch discarded the original exception, so the supplied incident text cannot distinguish an actual quota/security failure from the other caught failures on Computer 2; this report does not claim its exact exception was observed. The confirmed defect is the mandatory local-only persistence path and its misleading error boundary.

## Correction and save flow

1. The form keeps its native required-input checks and validates date/time, finite PPM, Pass/Fail, initials and note using `js/waterQuality.js`. New identical submissions derive a stable ID from their six recorded values, independent of browser storage/client ID. Exact value comparison rejects conflicting reuse of an ID; retries across refresh/device changes are verified no-ops, not duplicated appends. Dates/times remain the operator's local calendar strings.
2. The legacy key is read-only evidence. On an explicit submission, readable browser-only records are appended to shared history by their existing IDs, with original source evidence retained. The key is never rewritten, removed or cleared. An unavailable/corrupt legacy key produces a separate warning and remains untouched; it cannot redirect new saves to local-only storage. A conflicting existing ID blocks the water-quality mutation. Unreadable old local records cannot be transferred until that browser can read them, but they are not deleted.
3. `js/core.js:saveWaterQualityCheck` waits for the existing save queue and requires an authenticated writable baseline. It captures the workspace/backend/user, independently reads the server using the existing read-only backend transaction reader, compares the loaded/local/source evidence, and checks central integrity.
4. The existing `writeAuthoritativeStateSnapshot` / `OMAXAtomicPersistence.save` transaction requires exact `expectedRevision`, performs the existing firewall/protected preflight and reruns source/prepared-state validation. The Firestore write mask contains **only `waterQualityChecks` and `syncMeta`**; unrelated business fields are physically untouched. No local history is staged into global state before verification.
5. A second independent backend transaction read must match the entire acknowledged committed state and revision exactly. Only then does checked authoritative adoption expose the saved history and the form report success/reset inputs. Realtime echoes cannot adopt an unverified water-quality write. Concurrent unrelated edits stay pending and prevent unsafe adoption.
6. Definite backend failures keep inputs and the same submission identity for retry. Unknown completion or wrong/unavailable readback reports failure and enters the existing Recovery Mode/write suspension; it never blindly retries. Display exceptions after verification report that the record **was saved**, with a refresh instruction.

Edited entries retain their IDs, all existing extension fields and an append-only `editHistory` of before/after date, time, PPM, result, initials and note, with authenticated actor UID and timestamp. Existing history outside the selected entry remains exact. New entries retain the authenticated creator UID and timestamp.

## Files changed

- `js/waterQuality.js`: validation, stable submission identity, legacy-history preservation, append/edit planning and audit retention.
- `js/core.js`: isolated guarded save coordinator; water-quality field registration in protected state, adoption, snapshots and backups; save/realtime interlocks. Optional local client-ID/backup reads and diagnostic client-ID lookup now catch storage-access exceptions instead of breaking otherwise valid backend validation. These changes do not alter Firebase authorization or protected comparisons.
- `js/renderers.js`: async verified submissions, shared/local history projection, retained inputs on errors, accurate separate storage/backend/display results; no writes to the legacy key.
- `js/views.js`: shared-history help text replacing the former browser-only persistence claim.
- `index.html`: loads the focused water-quality module before core.
- `tests/water-quality-persistence.test.js`: isolated backend regressions using real guarded writer, protected preflight, CAS, independent transaction reads and checked adoption.
- `tests/water-quality.browser.cjs`: replaces obsolete local-only expectations with real form/backend verification tests; retains native dashboard drag/resize, calendar, log and edit coverage.
- This report.

## Validation

No package.json exists; no npm commands were used. All automated data was disposable. External services were blocked in the browser tests; production Firebase was never accessed or modified.

- `node --test tests/water-quality-persistence.test.js` — **18 passed, 0 failed**. Normal save; independent client IDs with one UID; exact persisted fields/readback; fresh-client reload; storage getter/write/backup failures; malformed legacy storage; Firebase rejection; same-ID retry; cross-refresh/device duplicate prevention; stale baseline and CAS race; lost acknowledgement; readback failure/mismatch; legacy-history retention; auditable edits; conflicting IDs/stale previews; protected drift/preflight/recovery; concurrent unrelated edits before and after commit; invalid input preservation.
- `node --test tests/water-quality.browser.cjs` with `OMAX_PLAYWRIGHT_PATH` set to the bundled Playwright installation — **1 integration scenario passed, 0 failed**, in headless Microsoft Edge. Tests a real legacy-key write denial, authoritative persistence while that key rejects writes, delayed readback with no premature success or input clearing, all six fields retained on Firebase denial, retry without duplicates, reload, edits/audit, legacy read failure warning, display failure after verified commit, calendar projection, and native dashboard layout drag/resize with unrelated fields preserved. The disposable seed was first given a committed revision using the existing normal save path; all water-quality revision/protection checks remained enabled. Edge could not launch inside the execution sandbox, so this isolated test ran outside it with external requests still blocked.
- Additional focused run: `node --test tests/water-quality-persistence.test.js tests/firebase-two-computer-baseline.test.js tests/atomic-persistence.test.js tests/inventory-material-persistence.test.js tests/pump-baseline.test.js` — **209 passed, 0 failed** before the two final concurrent-edit regressions were added. Both additional regressions pass in the final 18-case run/full suite.
- Final `node --test tests/*.test.js` — **1,507 tests; 1,505 passed, 2 failed**. The two failures are the existing canonical/mixed Jobs-add test-context errors in `tests/cjo02b-safety.test.js`: `syncNewCuttingJobSaveControls is not defined`. An untouched archive of the fetched main reproduces exactly those two failures (**24 passed, 2 failed** in that file). No new failures remain.
- `node --check` passed for `js/core.js`, `js/waterQuality.js`, `js/renderers.js`, `js/views.js`, `tests/water-quality-persistence.test.js`, and `tests/water-quality.browser.cjs`.
- `git diff --check` passed.
- Original-warning reproduction: `node artifacts/firebase-2pc-01c/reproduce-main.cjs` — passed against untouched main with external services blocked; exact original error and absence of a backend write confirmed.

Not tested against production: physical Computer 1/2, the user's exact browser policy/storage quota, live network loss, or real Firebase writes. Independent clients sharing the authorized UID are covered by isolated backend tests, and the actual UI flow is covered with a disposable local backend.

## Safety and recommendation

Revision/CAS, expectedRevision, central protected-data validation, exact local/source checks, server readback, the content firewall, Recovery Mode and existing unrelated backup/recovery policies remain enabled. Water-quality history is additionally registered as protected data and retained in normal/emergency/critical backups. Firebase authentication and rules are unchanged. No unrelated records are migrated, normalized or overwritten. Legacy water-quality transfer happens only on an explicit water-quality save and leaves its original browser copy intact.

**SAFE TO MERGE**
