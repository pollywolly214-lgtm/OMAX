# Cutting Job Not Visible Across Computers (OneDrive + OMAX)

Use this checklist when a cutting job is active on **Computer A** but does not appear on **Computer B**.

## 1) Confirm both apps point to the same OneDrive root

1. On both computers, open the app settings and locate the configured **OneDrive root folder**.
2. Verify the full path is identical in logical location (same tenant/account and same project folder).
3. If your app stores a symlink/shortcut path, resolve it to the real target path and compare targets.

### Typical mismatch patterns

- Computer A uses `C:\Users\<user>\OneDrive - Company\OMAX` while Computer B uses personal OneDrive.
- One machine points to a subfolder (`...\OMAX\Jobs`) and the other points to parent/root.
- Old local path remains after moving OneDrive location to another drive.

## 2) Verify OneDrive account and tenant

- Ensure both computers are signed in to the **same Microsoft account / org tenant**.
- In OneDrive settings, confirm the exact account email.
- If users have both personal and work OneDrive, verify the monitored folder is under the intended one.

## 3) Ensure the active job file was actually written and synced

On Computer A:

- Confirm the expected active-job state file exists in the shared folder.
- Check OneDrive icon/status for that file (synced vs pending/error).
- Force a sync cycle (pause/resume sync) if needed.

On Computer B:

- Confirm the same file appears in Explorer and has latest timestamp.
- If using Files On-Demand, ensure the file is downloaded locally.

## 4) Check app polling/cache behavior

- Restart the app on Computer B to force state refresh.
- If app keeps an in-memory cache, clear cache or use manual refresh command.
- Confirm clock/timezone are correct on both machines (stale file detection can fail when clocks drift).

## 5) Validate file-lock and write-permission edge cases

- Make sure Computer B has read permission to the shared folder.
- If app writes lock files, verify stale locks are not blocking reads.
- Check antivirus/EDR quarantine rules that may block temporary job files.

## 6) Network/offline and conflict-file cases

- Ensure both computers are online and OneDrive is not in offline mode.
- Look for conflicted copies, for example `filename (ComputerA's conflicted copy).json`.
- If conflict files exist, app may read the wrong copy; reconcile and keep one canonical file.

## 7) Path-link (symlink/junction) specific checks

If root-folder link functionality is used:

- Verify the symlink/junction still exists and target path is valid.
- Confirm app normalizes paths consistently (case, slash direction, trailing slash).
- Avoid mapping one machine to UNC (`\\server\share`) and another to drive letter without normalization.

## 8) Recovery steps (safe order)

1. Close app on both computers.
2. Confirm OneDrive sync healthy on both.
3. Verify root path/tenant/account match.
4. Reopen app on Computer A, start/confirm active job.
5. Reopen app on Computer B and force refresh.
6. If still missing, capture logs for file watch events and sync status and compare.

## 9) Minimal diagnostics to capture

- Configured root path on A/B.
- OneDrive account email on A/B.
- Full path and timestamp of active-job file on A/B.
- OneDrive sync status and any error codes.
- App logs around file watcher, refresh, and parse/load operations.

