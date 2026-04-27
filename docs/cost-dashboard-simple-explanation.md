# Cost Dashboard Changes (Simple English)

This explains, in plain language, how the site behaves now compared with before these updates.

## What is different now

1. **You can click chart points to jump to the matching table row.**
   - Before: The chart was mostly visual.
   - Now: Clicking a maintenance point opens/focuses the matching maintenance row, and clicking a cutting point opens/focuses the matching cutting job row in the Data Center.

2. **Cutting totals are calculated in one consistent way.**
   - Before: Hours/material/net values could come from mixed logic in different places.
   - Now: Shared helper functions are used so cutting costs and totals are calculated the same way across chart and tables.

3. **Cutting trend shows per-job net result (profit/loss), not rolling average.**
   - Before: The plotted cutting value could be a rolling/averaged number.
   - Now: Each plotted cutting point reflects one job's net total.

4. **Average labels are shown for maintenance and cutting series.**
   - Before: You mainly saw points/lines.
   - Now: The UI also shows average values for each series.

5. **Maintenance chart data comes from the same central maintenance table used elsewhere.**
   - Before: The chart path could diverge from table data.
   - Now: Chart/table stay aligned because they share the same source table.

6. **Row matching is more reliable because table rows now include explicit IDs and date attributes.**
   - Maintenance rows include task/date attributes.
   - Cutting rows include job/date attributes.

## User impact

- Faster investigation: click a point and see the exact row.
- More trust in numbers: one consistent cost/net calculation path.
- Better summary context: visible average values.
- Better consistency between chart and Data Center tables.
