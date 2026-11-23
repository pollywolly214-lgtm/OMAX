# MCAP real Firebase browser acceptance

This suite runs the actual static OMAX application and its Firebase **8.10.1** SDK against disposable Auth, Firestore and Storage emulators. All data, accounts, tokens and object contents are synthetic. It requires no production login, exported business data, Firebase rule publication or F12 action.

## Run

Use Node 22, Java 21 and an isolated dependency directory. For example, in PowerShell from this worktree:

```powershell
$mcapTools = Join-Path $env:TEMP 'omax-mcap-browser-tools'
npm install --prefix $mcapTools --no-save --no-audit --no-fund firebase-tools@15.32.1 firebase@8.10.1 playwright@1.56.1
$env:NODE_PATH = Join-Path $mcapTools 'node_modules'
& (Join-Path $mcapTools 'node_modules/.bin/playwright.cmd') install chromium
node scripts/mcap-emulator-browser.cjs
```

On Linux, use the same packages and expose the dependency directory through `NODE_PATH`; provision Chromium using that directory's `node_modules/.bin/playwright install chromium`. The dedicated `real-firebase-browser` job in `.github/workflows/mcap-storage-test.yml` runs the full procedure automatically. Windows tests use installed headless Edge; Linux CI uses Chromium.

The runner starts only `demo-mcap-browser` on loopback: Auth `9097`, Firestore `8188`, Storage `9197`, hub `4447`, logging `4597`. Firebase also opens its Firestore UI websocket port `9150`. The suite refuses to run directly unless the runner supplied the exact emulator environment. The Firebase CLI shuts the services down after the test exits. Logs are `firebase-debug.log`, `firestore-debug.log` and, when provided by the CLI, `storage-debug.log`; CI retains them on failure.

For a focused local diagnosis, set `MCAP_EMULATOR_ONLY` to `native calendar` or `lost real commit`. This still creates a fresh full authority and runs ordinary-save acceptance before the selected case. Clear the variable for full acceptance. The filter is rejected in CI, and a filtered run is never evidence that the whole suite passed.

## Test-only configuration boundaries

The real SDK browser bundles come from the installed Firebase package and are served locally. Requests are allowed only to the test HTTP server and those three emulator origins. No Firebase request is fulfilled by a transport mock.

`tests/fixtures/mcap-emulator-identity.cjs` rebinds the source's pinned production project, bucket and allowed UID to a demo project, demo bucket and synthetic owner in the **served copy** of JavaScript and the **temporary copy** of the rules. All role, revision, metadata, checksum, immutable-object and deny rules remain intact. The served `core.js` copy enables the source write switch. The served `omaxShardedReadback.js` copy permits downloads only from the exact loopback Storage origin because emulator download URLs use HTTP. The checked-in application keeps its production identity checks, HTTPS requirement and `MCAP_SHARDED_WRITES_ACTIVE = false`.

Only fixture preparation uses local emulator administrative REST endpoints: seed the synthetic member and historical state, adjust synthetic membership for a denial test, and remove a test manifest for corruption recovery. Ordinary saves, index creation, stale-writer attempts, subscriptions, Storage uploads/downloads and rule-denial assertions use the actual browser SDK. No rule-disabled context is used for those operations.

The active test authority includes an opaque segmented extension that makes the logical state larger than 975,000 bytes. Its historical legacy document stays smaller and is checked exactly after active saves and rejected old-client writes. This fixture provisioning is not a test or invocation of the production operator activation tool.

## Acceptance scope

The suite checks ordinary saves, exact full-state refresh, two-session realtime convergence, specialized water/pump/material/cutting-job operations, native calendar scheduling/completion, stale-client rejection, Storage-rule denials, membership denial, a dropped response after a real committed index write, and missing-manifest recovery. Exact business preservation and revision/readback checks remain required even when the UI has already displayed an optimistic result.

Passing emulator acceptance does not establish production IAM, deployed-rule identity, current source/candidate equality, production CORS, independent latest backups or operator approval. Those remaining release gates are tracked in `MCAP-CUTOVER-ACCEPTANCE.md`.

Firebase references: [emulator project/Firestore setup](https://firebase.google.com/docs/emulator-suite/connect_firestore), [Storage emulator and cross-service rules](https://firebase.google.com/docs/emulator-suite/connect_storage), [Auth emulator custom-token behavior](https://firebase.google.com/docs/emulator-suite/connect_auth), and [v8 settings merge semantics](https://firebase.google.com/docs/reference/js/v8/firebase.firestore.Settings).
