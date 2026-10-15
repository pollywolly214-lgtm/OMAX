# POLISH-01F — targeted corrections for PR #501

Continued on `codex/production-polish-small-bugs` from `7625ffd`. No new PR, merge, broad cleanup or reimplementation of completed features.

## Root causes and fixes

### Active copy

The complete path is the history Actions handler → `showMakeActiveCopyModal` callback → `createCuttingJob` → `saveCuttingJobBusinessOperation` → chronology `createMutationApi.save` → `CuttingJobDateEditing.prepareMutation` → `writeAuthoritativeStateSnapshot` → atomic transaction → exact server readback → authoritative adoption → active-filter reveal.

Preparation freezes the operation, ID and audit once and computes the expected business-state key. Inside the transaction, `mergeUnlessIdentical` retained unchanged evidence only for callers with **both** source and prepared validators. Chronology supplies a captured authoritative target and prepared validator, but not that material-specific source validator. It therefore unnecessarily called the pump merge on identical pending/remote pump state.

The captured reproduction shows **only `pumpEff` changed**: `mergePumpEffForSave` reconstructed its recognized fields and removed **`baselineTimeISO` and `baselineHistory`**. The expected state still contained them, so the prepared-state check correctly threw `Prepared chronology state changed; review again.` Dates, numbering, copy ID and audit were unchanged in that reproduction. Repeated mutation preparation or differing create inputs were not the cause.

The localized fix extends the existing retain-identical-evidence condition to captured-target chronology writes with prepared validation. It still requires exact equality with the transaction's remote field. Differing fields still use existing merges. Prepared-state validation, CAS/revision checks, target identity, preflight/protected-data validation, content/size checks, verified readback and adoption remain intact. No pump merge/calculation/tooltip implementation was changed.

The dialog's existing `toDateInputValue(new Date())` local-date default was already correct and remains unchanged. Tests now verify the UTC/local boundary, user-selected dates, a new local day when reopening, independent identity, exact historical/pump preservation, and survival after reload. Definite failure keeps inputs/dialog open without a phantom job. Indeterminate outcomes retain retry suspension. A deliberately tampered prepared job still fails before writing.

### Actions trigger

The Actions cell had no dedicated minimum width and the trigger consumed its full content width, without an inset for the right edge/caret. The local CSS now reserves 88px for that column and gives the trigger a 2px inset on either side, preserving border-box sizing, wrapping, appearance and focus behavior. No dropdown positioning or interaction code changed. Existing browser checks now verify content-box clearance and caret bounds as well as the full button, keyboard opening/Escape and popup position.

### Quick Sign-In

The shortcut only opened/focused the dialog; it never requested submission of populated fields. The form also lacked password-manager `name`/`autocomplete` hints. Firebase LOCAL session persistence already exists and remains unchanged; it restores authenticated sessions rather than exposing account passwords to the app.

The form now advertises username/current-password autofill. When signed out and both fields are populated, Ctrl/Cmd+S calls native `requestSubmit()`, retaining browser validation and the existing Firebase `signInWithEmailAndPassword` handler. Otherwise it opens the form and focuses missing email/password. The manual handler and shortcut share a pending lock; already-authenticated SDK/application state, repeat/modifier and editable-focus exclusions remain enforced. Normal errors remain visible; sign-out is unchanged. Full auth error objects are no longer logged.

The app cannot force a password manager to release saved credentials or fill a hidden form. If fields are empty or autofill requires user approval, use the normal form. The shortcut remains inactive while editing a field, even after autofill. No credential storage, password change, authentication bypass or auth-method change was introduced. Tests generate ephemeral synthetic field values in memory; no real or static account credentials are embedded.

## Exact files changed in POLISH-01F

- `js/core.js`: identical-evidence predicate; existing sign-in handler/shortcut only.
- `index.html`: existing auth form names/autocomplete only.
- `style.css`: existing Actions column/trigger only.
- `tests/polish01d.browser.cjs`: richer existing fixture, mismatch capture, guard/reload/date/caret assertions.
- `tests/polish01-hotkey.test.js`: normal-form/Firebase-path, filled/empty fields, duplicate/error/focus/session tests.
- `docs/polish-01f.md`: this report.
- `docs/polish-01.md`: pointer to this latest focused report.

No other product files changed. In particular `js/pump.js`, `js/views.js`, `js/renderers.js` and `js/cuttingJobDimensions.js` are unchanged from POLISH-01D. All three corrections are implemented; no new deferrals. Earlier deferrals 6 and 13 remain unchanged.

## Commands actually run

No `package.json` exists; no npm commands ran.

| Command | Result |
| --- | --- |
| `node --test tests/polish01d.browser.cjs` **before** the production fix, with retained pump baseline metadata | Expected reproduction failure: 4/7 reported failed including parent. Captured only `pumpEff` drift and the two removed fields. Copy, retry and Add Job hit the same writer guard; safety-rejection/menu cases passed. |
| `node --test tests/cjpc01-manual-paths.test.js tests/atomic-persistence.test.js tests/polish01-hotkey.test.js` | PASS: 34 targeted tests. |
| `node --test tests/polish01d.browser.cjs` after the fix, with `OMAX_PLAYWRIGHT_PATH` pointing to installed bundled Playwright | PASS: 8 tests including parent; actual coordinator/save/readback/reload success, prepared-content rejection, write-gate rejection, failure/indeterminate outcomes, duplicate prevention, UTC/local dates, preserved source/pump data, button/caret/menu checks, neighboring dimension save. |
| `node --check <file>` on changed JavaScript/tests and closely related copy/chronology/atomic scripts | PASS. |
| Targeted `rg` searches; `git diff --cached --check`; bundled Python running `scripts/check_binaries.py` | PASS. |

Browser checks used headless Edge, fresh disposable profiles, local devsafe state, America/Chicago timezone, external requests blocked, widths 1280/1024/800/390 and DPR 1/1.25/1.5. No browser JavaScript errors. Auth tests execute the actual existing handler with mocked Firebase; no authentication request was made. No remaining failed checks after the fix. No production Firebase access or destructive tests occurred.

## Manual verification still needed

- Active copy on the intended deployed PR revision: local-today default, editable date/category, verified visible copy and reload retention. Confirm genuine failure/indeterminate recovery feedback without blind retry.
- Actions trigger/caret at normal browser zoom and narrower windows, actual toolbar zoom and other supported browsers; menu actions and focus. Automated DPR/layout tests are not toolbar zoom tests.
- Browser password-manager autofill: empty/partial/populated fields, outside editable focus, successful sign-in, invalid-password feedback, no duplicate requests, manual submit/sign-out and LOCAL-session restoration. Real password-manager release and live Firebase auth/save/failure behavior were not tested.
- Confirm the previously completed POLISH-01 UI, including pump tooltips, remains correct. Pump files and dropdown positioning code were not edited.

PR #501 remains unmerged, awaiting the operator's manual browser verification. No production data/schema changes, migrations, credentials embedded, historical rewrites or account password changes.

## Separate account-level password-change procedure — not executed

In Firebase Console, open Authentication → Users, locate the account and use its password-reset email action. Complete the reset using the emailed link, then update the browser password manager. Alternatively, a legitimate signed-in password-change flow must use Firebase's password-update API with recent reauthentication. No reset email or password change was executed here. See [Firebase user-management instructions](https://firebase.google.com/docs/auth/web/manage-users#send_a_password_reset_email).
