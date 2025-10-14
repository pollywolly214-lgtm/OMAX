# Daily cutting hours & downtime upgrades

## What changed
- **Daily cutting logs now track run vs. idle time.** Entries are normalized into `{ dateISO, runHours, idleHours, source, updatedAtISO }`, with older `hours` values automatically treated as `runHours`. This keeps manual edits intact while letting the app record idle time separately. 【F:js/core.js†L1540-L1653】
- **Time-efficiency math now focuses on run time and exposes utilization.** Dashboards call `computeTimeEfficiency`, which now reads the normalized run/idle hours, totals idle time, and returns run and idle utilization percentages alongside existing goal tracking fields. 【F:js/computations.js†L13-L149】
- **Downtime events are stored as rich records.** The loose `downTimes` array was replaced with normalized helpers that manage `{ id, dateISO, durationHours, reason, notes, costImpact }`, keep browser state in sync, and update the dashboard down-time list UI. 【F:js/core.js†L1655-L1786】【F:js/renderers.js†L2826-L2888】【F:js/views.js†L255-L313】

## How to test it in the browser
1. **Run the site.** Serve the repo root with any static server (for example `npx serve .`) and open `http://localhost:3000` (or whatever port your server uses).
2. **Confirm daily hours editing still works.**
   - On the Dashboard calendar, press the **Edit Hours** button above the grid to enter a run-hour value for a day.
   - Save the change and refresh; the calendar cell should retain the updated hours highlight because the run hours persisted.
3. **Verify run vs. idle data is stored.**
   - With the page open, press <kbd>F12</kbd> to open DevTools and run `setDailyCutHoursEntry('2024-01-05', { runHours: 6, idleHours: 2 })` in the console.
   - Run `computeTimeEfficiency(7)` and confirm the returned object includes `runHours`, `idleHours`, `runUtilizationPercent`, and `idleUtilizationPercent` with the numbers you expect.
4. **Check the dashboard down-time workflow.**
   - Click the **Add** button on the Dashboard, choose **Down time**, pick a date, and save.
   - The "Down time" list in the modal should show the new entry with duration/reason/cost placeholders, and the same date should turn red on the calendar grid.
   - Use the "Remove" button in the list to delete it; the calendar should clear the downtime highlight.
5. **Smoke-test persistence.**
   - Refresh the browser. Call `window.downtimeEvents` and `window.dailyCutHours` in the console to make sure the structured objects (with run/idle hours and downtime metadata) load from storage without errors.

If each step behaves as described, the usability upgrades are working end to end.
