# OMAX
OMAX maintenance and log tracker

## Code structure

The frontend logic is organized into focused scripts under `js/` so each concern is
easy to locate:

| File | Responsibility |
| --- | --- |
| `js/core.js` | Constants, helpers, Firebase bootstrap, persisted state wiring. |
| `js/computations.js` | Derived data helpers for hours, jobs, and scheduling math. |
| `js/pump.js` | Pump efficiency storage, formatting, and chart rendering logic. |
| `js/calendar.js` | Calendar rendering plus hover bubble interactions. |
| `js/views.js` | HTML template builders for dashboard, settings, jobs, costs, and inventory. |
| `js/renderers.js` | DOM event handlers and screen-specific render routines. |
| `js/router.js` | Hash-based router and global event listeners. |

`index.html` loads these scripts in the order listed above so dependencies remain
available without a bundler. When adding new features, keep related logic grouped in
the appropriate module (or create a new one) and append the script tag near the end
of the document.

## Local development

Because this is a static site, you only need a lightweight HTTP server to preview
changes locally. Any of the following approaches will work:

1. **Python:** `python -m http.server 8000` (then browse to `http://localhost:8000`).
2. **Node.js:** `npx serve` (or any other static file server).
3. **VS Code Live Server:** install the extension and click “Go Live”.

After the server is running, open the site in your browser and edits to the files
under `js/`, `index.html`, or `style.css` will be reflected on refresh. No build
step is required.
