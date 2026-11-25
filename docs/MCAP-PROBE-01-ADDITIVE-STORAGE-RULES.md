# MCAP-PROBE-01 — additive Storage Rules permission, not yet deployed

## Finding
User copied actual Firebase-published Storage Rules on Nov 18, 2026. They preserve CFR-05 cutting-job DXF/ORD/OMX create/get/conditional-delete behavior, plus final catchall deny; no `working/v1/probe` rule. A single live probe returned HTTP 403 `storage/unauthorized`. Read-only Firestore membership confirmed current user active `owner`, matching workspace `github-prod`, schemaVersion `1`. Current Firebase login/server state read was successful. The denial is consistent with the missing path authorization, not evidence of a full bucket or lost data.

## Safest immediate change
Add **only** the following new `validMcapProbe` function and `match` **inside** existing `match /b/{bucket}/o`, just BEFORE the existing final recursive deny. Do not replace or edit any cutting-job rules or Firestore rules. This new path allows the user to create a ≤8,192-byte, content-addressed, metadata-bound, role-limited immutable probe only; owner/admin can read it; no update/delete/list. The existing `OMAXWorkingStorage.probe('STAGE OMAX COPY ONLY')` caller uses the matching path and metadata schema. **Does not enable a full-state migration or permit full-state snapshots/shards.**

```rules
    // MCAP-PROBE-01: tiny working-folder access test only.
    function validMcapProbe(workspaceId, operationId, fileName, item) {
      return bucket == 'wj-tracker-v2.firebasestorage.app'
        && workspaceId == 'github-prod'
        && operationId.size() >= 1
        && operationId.size() <= 128
        && operationId.matches('[A-Za-z0-9][A-Za-z0-9_-]*')
        && fileName.matches('[a-f0-9]{64}\\\\.json')
        && item.size > 0
        && item.size <= 8192
        && item.contentType == 'application/json'
        && item.metadata.keys().hasOnly([
          'schemaVersion', 'workspaceId', 'phase', 'operationId',
          'sha256', 'sourceRevision', 'storagePath',
          'createdBy', 'createdAtISO'
        ])
        && item.metadata.keys().hasAll([
          'schemaVersion', 'workspaceId', 'phase', 'operationId',
          'sha256', 'sourceRevision', 'storagePath',
          'createdBy', 'createdAtISO'
        ])
        && item.metadata.schemaVersion == '1'
        && item.metadata.workspaceId == workspaceId
        && item.metadata.phase == 'probe'
        && item.metadata.operationId == operationId
        && item.metadata.sourceRevision == '0'
        && item.metadata.sha256.matches('[a-f0-9]{64}')
        && fileName == item.metadata.sha256 + '.json'
        && item.metadata.createdBy.size() >= 1
        && item.metadata.createdBy.size() <= 128
        && item.metadata.createdBy.matches('[A-Za-z0-9][A-Za-z0-9_-]*')
        && item.metadata.createdAtISO.size() <= 30
        && item.metadata.storagePath ==
          'workspaces/' + workspaceId + '/working/v1/probe/'
          + operationId + '/' + fileName;
    }

    match /workspaces/{workspaceId}/working/v1/probe/{operationId}/{fileName} {
      allow create: if resource == null
        && activeRole(workspaceId, ['owner', 'admin'])
        && validMcapProbe(workspaceId, operationId, fileName, request.resource)
        && request.resource.metadata.createdBy == request.auth.uid;

      allow get: if resource != null
        && activeRole(workspaceId, ['owner', 'admin'])
        && validMcapProbe(workspaceId, operationId, fileName, resource);

      allow update, delete, list: if false;
    }
```

### Acceptance and publishing gates
- Code was checked for balanced braces, correct path and prohibition of mutation, **but was not compiled by Firebase's official compiler and not run against Storage/Firestore emulators yet**.
- Before deploying, test both permitted owner create/get with actual metadata and denied unauthenticated, viewer, wrong bucket, bad metadata, update/delete/list, and matching legacy cutting file operations. The Firebase console Rules Playground can preflight; for complete confidence use Emulator Suite with membership fixture. Never weaken the existing rules or replace with an unvalidated broad ruleset.
- After the exact minimal rules are deployed by the operator, run ONE small probe using a fresh ID and review the SHA-256/download/metadata report. If it fails, inspect and stop; don't repeatedly write. Do not stage production state or attempt a live cutover.
