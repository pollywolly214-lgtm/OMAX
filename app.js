/* =========================
   OMAX 1530 Maintenance Tracker — v6
   ========================= */

const DAILY_HOURS = 8;

// localStorage keys
const LS_TOTAL_HISTORY = "omax_total_history_v2";   // [{dateISO, hours}]
const LS_TASKS_INTERVAL = "omax_tasks_interval_v6"; // array
const LS_TASKS_ASREQ   = "omax_tasks_asreq_v6";     // array
const LS_INVENTORY     = "omax_inventory_v1";       // array

/* ---------- Defaults from your latest lists (intervals already in hours) ---------- */
const defaultIntervalTasks = [
  { id:"noz_filter_or", name:"Nozzle filter & inlet O-ring", interval:40,  sinceBase:null, anchorTotal:null, cost:"", link:"", pn:"307525", price:283 },
  { id:"pump_tube_noz_filter", name:"Pump tube & nozzle filter life", interval:80, sinceBase:null, anchorTotal:null, cost:"", link:"", pn:"307561-02", price:170 },
  { id:"orifice_assembly", name:"Orifice assembly (jewel)", interval:500, sinceBase:null, anchorTotal:null, cost:"", link:"", pn:"305322-14", price:700 },
  { id:"nozzle_body_life", name:"Nozzle body life", interval:500, sinceBase:null, anchorTotal:null, cost:"", link:"", pn:"303295", price:349 },

  { id:"drain_hopper_reg_bowl", name:"Drain hopper regulator water bowl", interval:240, sinceBase:null, anchorTotal:null, cost:"", link:"" },
  { id:"check_pinch_reg_conn",  name:"Check hopper pinch valve & air regulator connection", interval:240, sinceBase:null, anchorTotal:null, cost:"", link:"" },
  { id:"inspect_relief_90psi",  name:"Inspect pressure relief valve (≤90 psi)", interval:240, sinceBase:null, anchorTotal:null, cost:"", link:"" },

  { id:"buy_garnet_pallets_x4", name:"Buy Garnet Pallets x4", interval:160, sinceBase:null, anchorTotal:null, cost:"", link:"" },

  { id:"ro_softener_daily_chk", name:"RO / Softener feed pressure & water quality — daily", interval:8, sinceBase:null, anchorTotal:null, cost:"", link:"" },
  { id:"mixing_tube_rotation",  name:"Mixing tube rotation", interval:8, sinceBase:null, anchorTotal:null, cost:"", link:"" },
  { id:"jewel_nozzle_clean",    name:"Jewell orifice & nozzle body cleaning (weekly)", interval:56, sinceBase:null, anchorTotal:null, cost:"", link:"" },

  { id:"check_bonding_strap",   name:"Check hopper bonding strap (annually)", interval:2920, sinceBase:null, anchorTotal:null, cost:"", link:"" },
  { id:"lube_z_axis",           name:"Lubricate Z-axis rail shafts & lead screw (annually)", interval:2920, sinceBase:null, anchorTotal:null, cost:"", link:"" },

  { id:"filter_housing_or_2y",  name:"Filter housing O-ring (2 years / if leaking)", interval:5840, sinceBase:null, anchorTotal:null, cost:"", link:"", pn:"208665", price:4.85 }
];

const defaultAsReqTasks = [
  { id:"purge_hopper_pressure_pot", name:"Purge hopper pressure pot", condition:"As required", cost:"", link:"" },
  { id:"replace_pot_sensors",       name:"Replace pressure pot sensors", condition:"When failed", cost:"", link:"" },
  { id:"empty_hopper_abrasive",     name:"Empty hopper abrasive material", condition:"If debris/contamination", cost:"", link:"" },

  { id:"replace_pinch_valve", name:"Replace hopper pinch valve", condition:"When damaged", cost:"", link:"", pn:"204160", price:292 },
  { id:"replace_feed_hose",   name:"Replace abrasive feed hose", condition:"When damaged", cost:"", link:"", pn:"302240", price:121 },
  { id:"ro_filter_housing",   name:"RO Filter Housing",          condition:"As needed",   cost:"", link:"", pn:"208663", price:137 },
  { id:"ro_micron_filter",    name:"RO Micron filter",           condition:"Per water quality/pressure", cost:"", link:"", pn:"209260-01", price:35.5 },
  { id:"ro_carbon_filter",    name:"RO Carbon filter",           condition:"Per chlorine breakthrough",  cost:"", link:"", pn:"204365", price:25 },
  { id:"ro_calcite_filter",   name:"RO Calcite filter",          condition:"Per water quality / pH",     cost:"", link:"", pn:"204876", price:72 },

  { id:"inspect_abrasive_tube", name:"Abrasive tubing inspection", condition:"Before each use", cost:"", link:"" },
  { id:"clean_xy_strips",       name:"Clean X– & Y–axis magnetic encoder strips", condition:"If errors occur", cost:"", link:"" },
  { id:"clean_lube_ballscrews", name:"Clean & lubricate ball screws", condition:"If debris occurs", cost:"", link:"" },
  { id:"clean_rails",           name:"Clean X-rails & Y-bridge rails", condition:"If debris occurs", cost:"", link:"" }
];

// Seed inventory from tasks
function seedInventoryFromTasks() {
  return [
    ...defaultIntervalTasks.map(t => ({ id:`inv_${t.id}`, name:t.name, qty:0, unit:"pcs", note:"", pn:t.pn||"", link:t.link||"" })),
    ...defaultAsReqTasks.map(t => ({ id:`inv_${t.id}`, name:t.name, qty:0, unit:"pcs", note:"", pn:t.pn||"", link:t.link||"" }))
  ];
}

/* ---------- State ---------- */
let totalHistory = []; // [{dateISO,hours}]
let tasksInterval = [];
let tasksAsReq   = [];
let inventory    = [];

/* ---------- Storage ---------- */
function loadState() {
  totalHistory = JSON.parse(localStorage.getItem(LS_TOTAL_HISTORY) || "[]");
  tasksInterval = JSON.parse(localStorage.getItem(LS_TASKS_INTERVAL) || "null") || defaultIntervalTasks.slice();
  tasksAsReq   = JSON.parse(localStorage.getItem(LS_TASKS_ASREQ)   || "null") || defaultAsReqTasks.slice();
  inventory    = JSON.parse(localStorage.getItem(LS_INVENTORY)     || "null") || seedInventoryFromTasks();
}
function saveTotal(hours) {
  totalHistory.push({ dateISO: new Date().toISOString(), hours: parseFloat(hours) });
  localStorage.setItem(LS_TOTAL_HISTORY, JSON.stringify(totalHistory));
}
function saveTasks() {
  localStorage.setItem(LS_TASKS_INTERVAL, JSON.stringify(tasksInterval));
  localStorage.setItem(LS_TASKS_ASREQ, JSON.stringify(tasksAsReq));
}
function saveInventory() {
  localStorage.setItem(LS_INVENTORY, JSON.stringify(inventory));
}

/* ---------- Derived totals / Δ ---------- */
function currentTotal() {
  return totalHistory.length ? totalHistory[totalHistory.length - 1].hours : null;
}
function previousTotal() {
  return totalHistory.length > 1 ? totalHistory[totalHistory.length - 2].hours : null;
}
function deltaSinceLast() {
  const cur = currentTotal(), prev = previousTotal();
  if (cur == null || prev == null) return 0;
  return Math.max(0, cur - prev);
}

/* ---------- Hours since logic (supports completion anchor) ---------- */
function liveSince(task) {
  const cur = currentTotal();
  if (task.anchorTotal != null && cur != null) {
    // If task was "completed" at a certain total, count from that anchor
    return Math.max(0, cur - task.anchorTotal);
  }
  if (task.sinceBase == null) return null;
  return task.sinceBase + deltaSinceLast();
}
function nextDue(task) {
  const since = liveSince(task);
  if (since == null) return null;
  const remain = Math.max(0, task.interval - since);
  const days = Math.round(remain / DAILY_HOURS);
  const due = new Date(); due.setHours(0,0,0,0); due.setDate(due.getDate() + days);
  const lastServicedAt = (currentTotal() != null && since != null) ? Math.max(0, currentTotal() - since) : null;
  return { since, remain, days, due, lastServicedAt };
}

/* ======================= Views ======================= */
function viewDashboard() {
  const cur = currentTotal();
  const prev = previousTotal();
  const delta = deltaSinceLast();

  return `
  <div class="container">
    <div class="block">
      <h3>Total Hours</h3>
      <label>Enter total hours now: <input type="number" id="totalInput" value="${cur!=null?cur:""}" /></label>
      <button id="logBtn">Log Hours</button>
      <div class="hint">Last updated: ${cur!=null? new Date(totalHistory[totalHistory.length-1].dateISO).toLocaleString(): "—"}</div>
      <div class="small">Δ since last: <b>${delta.toFixed(0)} hrs</b>${prev!=null? " (prev "+prev+")":""}</div>
    </div>

    <div class="block">
      <h3>Next Due</h3>
      <div id="nextDueBox">Calculating…</div>
    </div>

    <div class="block" style="grid-column: 1 / -1">
      <h3>Calendar (Current + Next 2 Months)</h3>

      <div class="calendar-toolbar">
        <form id="quickAddForm">
          <strong>Quick add task:</strong>
          <input type="text" id="qa_name" placeholder="Task name" required>
          <input type="number" id="qa_interval" placeholder="Interval (hrs, blank = As Required)">
          <input type="text" id="qa_condition" placeholder="Condition (for As Required)">
          <button type="submit">Add</button>
        </form>
      </div>

      <div id="months"></div>
      <div class="small">Tip: Click a due item to mark it <b>Completed</b>. Completion resets “hours since last” to 0.</div>
    </div>
  </div>`;
}

function taskDetailsInterval(task) {
  const nd = nextDue(task);
  const sinceTxt = nd ? `${nd.since.toFixed(0)} / ${task.interval} hrs` : "—";
  const daysTxt = nd ? `${nd.days} day(s) → ${nd.due.toDateString()}` : "—";
  const lastServ = nd && nd.lastServicedAt!=null ? `${nd.lastServicedAt.toFixed(0)} hrs` : "—";

  return `
  <details data-task-id="${task.id}">
    <summary>${task.name} — <span class="small">since: ${sinceTxt} | due: ${daysTxt}</span></summary>
    <div class="row"><label>Name:</label><div><input type="text" data-k="name" data-id="${task.id}" data-list="interval" value="${task.name}" /></div></div>
    <div class="row"><label>Interval (hrs):</label><div><input type="number" data-k="interval" data-id="${task.id}" data-list="interval" value="${task.interval}" /></div></div>
    <div class="row"><label>Baseline “since last” (hrs):</label><div><input type="number" data-k="sinceBase" data-id="${task.id}" data-list="interval" value="${task.sinceBase!=null?task.sinceBase:""}" placeholder="e.g., 50" /></div></div>
    <div class="row"><label>When last serviced (hrs):</label><div>${lastServ}</div></div>
    <div class="row"><label>Cost placeholder:</label><div><input type="text" data-k="cost" data-id="${task.id}" data-list="interval" value="${task.cost||""}" placeholder="$____" /></div></div>
    <div class="row"><label>Link:</label><div><input type="url" data-k="link" data-id="${task.id}" data-list="interval" value="${task.link||""}" placeholder="https://store…" /></div></div>
    <div class="row"><label>Part #:</label><div><input type="text" data-k="pn" data-id="${task.id}" data-list="interval" value="${task.pn||""}" /></div></div>
    <div class="row"><label>Price:</label><div><input type="number" step="0.01" data-k="price" data-id="${task.id}" data-list="interval" value="${task.price!=null?task.price:""}" /></div></div>
    <div class="row"><label>Actions:</label>
      <div>
        <button class="btn-complete" data-complete="${task.id}">Mark Completed Now</button>
        <button class="danger" data-remove="${task.id}" data-from="interval">Remove</button>
      </div>
    </div>
  </details>`;
}
function taskDetailsAsReq(task) {
  return `
  <details data-task-id="${task.id}">
    <summary>${task.name} — <span class="small">${task.condition||"As required"}</span></summary>
    <div class="row"><label>Name:</label><div><input type="text" data-k="name" data-id="${task.id}" data-list="asreq" value="${task.name}" /></div></div>
    <div class="row"><label>Condition:</label><div><input type="text" data-k="condition" data-id="${task.id}" data-list="asreq" value="${task.condition||""}" /></div></div>
    <div class="row"><label>Cost placeholder:</label><div><input type="text" data-k="cost" data-id="${task.id}" data-list="asreq" value="${task.cost||""}" placeholder="$____" /></div></div>
    <div class="row"><label>Link:</label><div><input type="url" data-k="link" data-id="${task.id}" data-list="asreq" value="${task.link||""}" placeholder="https://store…" /></div></div>
    <div class="row"><label>Part #:</label><div><input type="text" data-k="pn" data-id="${task.id}" data-list="asreq" value="${task.pn||""}" /></div></div>
    <div class="row"><label>Price:</label><div><input type="number" step="0.01" data-k="price" data-id="${task.id}" data-list="asreq" value="${task.price!=null?task.price:""}" /></div></div>
    <div class="row"><label>Actions:</label>
      <div><button class="danger" data-remove="${task.id}" data-from="asreq">Remove</button></div>
    </div>
  </details>`;
}

function viewSettings() {
  return `
  <div class="container">
    <div class="block" style="grid-column: 1 / -1">
      <h3>Maintenance Settings</h3>
      <p class="small">Two categories: <b>By Interval (hrs)</b> and <b>As Required</b>. Edits here affect the Dashboard, Calendar, and Cost Analysis.</p>

      <div class="add-forms">
        <form id="addIntervalForm" class="mini-form">
          <strong>Add Interval Task:</strong>
          <input type="text" id="ai_name" placeholder="Name" required>
          <input type="number" id="ai_interval" placeholder="Interval (hrs)" required>
          <button type="submit">Add</button>
        </form>
        <form id="addAsReqForm" class="mini-form">
          <strong>Add As-Required Task:</strong>
          <input type="text" id="ar_name" placeholder="Name" required>
          <input type="text" id="ar_condition" placeholder="Condition (e.g., When damaged)">
          <button type="submit">Add</button>
        </form>
      </div>

      <h4>By Interval (hrs)</h4>
      <div id="intervalList">
        ${tasksInterval.map(taskDetailsInterval).join("")}
      </div>

      <h4 style="margin-top:16px;">As Required</h4>
      <div id="asreqList">
        ${tasksAsReq.map(taskDetailsAsReq).join("")}
      </div>

      <div style="margin-top:10px;"><button id="saveTasksBtn">Save All</button></div>
    </div>
  </div>`;
}

function viewCosts() {
  return `
  <div class="container">
    <div class="block" style="grid-column: 1 / -1">
      <h3>Cost Analysis</h3>
      <div class="mini-form">
        <label for="costFilter"><strong>Show:</strong></label>
        <select id="costFilter">
          <option value="interval">Per Interval</option>
          <option value="asreq">As Required</option>
          <option value="all">All</option>
        </select>
      </div>
      <table id="costTable">
        <thead><tr><th>Task</th><th>Category</th><th>Interval (hrs)</th><th>Cost</th><th>Link</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>`;
}

/* ---------- Inventory ---------- */
function viewInventory() {
  const rows = inventory.map((it, i) => `
    <tr>
      <td><input type="text" data-inv="name" data-i="${i}" value="${it.name}"></td>
      <td><input type="text" data-inv="pn" data-i="${i}" value="${it.pn||""}"></td>
      <td><input type="url"  data-inv="link" data-i="${i}" value="${it.link||""}"></td>
      <td><input type="number" step="1" min="0" data-inv="qty" data-i="${i}" value="${it.qty||0}"></td>
      <td><input type="text" data-inv="unit" data-i="${i}" value="${it.unit||"pcs"}"></td>
      <td><input type="text" data-inv="note" data-i="${i}" value="${it.note||""}"></td>
      <td><button class="danger" data-inv="remove" data-i="${i}">−</button></td>
    </tr>`).join("");

  return `
  <div class="container">
    <div class="block" style="grid-column: 1 / -1">
      <h3>Inventory (Old & New)</h3>
      <p class="small">Adjust quantities, add or remove items. Saves in your browser.</p>
      <div class="inv-toolbar">
        <button id="addInvRow">+ Add Item</button>
        <button id="saveInv">Save Inventory</button>
      </div>
      <table>
        <thead>
          <tr><th>Item</th><th>Part #</th><th>Link</th><th>Qty</th><th>Unit</th><th>Notes</th><th>Actions</th></tr>
        </thead>
        <tbody id="invBody">${rows}</tbody>
      </table>
    </div>
  </div>`;
}

/* ---------- Calendar rendering + interactions ---------- */
function renderCalendar() {
  const container = document.getElementById("months");
  if (!container) return;
  container.innerHTML = "";

  // Build due map for interval tasks
  const dueMap = {}; // key = Y-M-D -> [{ name,id }]
  tasksInterval.forEach(t => {
    const nd = nextDue(t);
    if (!nd) return;
    const key = `${nd.due.getFullYear()}-${nd.due.getMonth()+1}-${nd.due.getDate()}`;
    (dueMap[key] ||= []).push({ name: t.name, id: t.id });
  });

  const today = new Date(); today.setHours(0,0,0,0);
  for (let m=0; m<3; m++) {
    const first = new Date(today.getFullYear(), today.getMonth()+m, 1);
    const last  = new Date(today.getFullYear(), today.getMonth()+m+1, 0);

    const monthDiv = document.createElement("div");
    monthDiv.className = "month";

    const head = document.createElement("div");
    head.className = "month-header";
    head.textContent = first.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
    monthDiv.appendChild(head);

    const weekdays = document.createElement("div");
    weekdays.className = "weekdays";
    ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d => {
      const el = document.createElement("div"); el.textContent = d; weekdays.appendChild(el);
    });
    monthDiv.appendChild(weekdays);

    const grid = document.createElement("div");
    grid.className = "week";

    for (let i=0; i<first.getDay(); i++) {
      const blank = document.createElement("div"); blank.className = "day other-month"; grid.appendChild(blank);
    }

    for (let day=1; day<=last.getDate(); day++) {
      const date = new Date(first.getFullYear(), first.getMonth(), day);
      const cell = document.createElement("div"); cell.className = "day";
      if (date.getTime() === today.getTime()) cell.classList.add("today");
      cell.innerHTML = `<div class="date">${day}</div>`;

      const key = `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;
      if (dueMap[key]) {
        dueMap[key].forEach(ev => {
          const e = document.createElement("button");
          e.type = "button";
          e.className = "event generic";
          e.title = "Click to mark completed";
          e.textContent = ev.name + " (due)";
          e.dataset.completeId = ev.id;
          e.addEventListener("click", () => completeTask(ev.id));
          cell.appendChild(e);
        });
      }
      grid.appendChild(cell);
    }

    const filled = first.getDay() + last.getDate();
    const rem = filled % 7;
    if (rem !== 0) for (let i=0; i<7-rem; i++) {
      const blank = document.createElement("div"); blank.className = "day other-month"; grid.appendChild(blank);
    }

    monthDiv.appendChild(grid);
    container.appendChild(monthDiv);
  }
}

/* ---------- Completion & Quick Add ---------- */
function completeTask(taskId) {
  const t = tasksInterval.find(x => x.id === taskId);
  if (!t) return;
  const cur = currentTotal();
  // Anchor to current total to reset since=0 immediately
  t.anchorTotal = cur != null ? cur : 0;
  t.sinceBase = 0; // keep explicit for Settings clarity
  saveTasks();
  route(); // rerender everywhere
}

function quickAddFromCalendar({ name, interval, condition }) {
  const id = (name.toLowerCase().replace(/[^a-z0-9]+/g,"_") + "_" + Date.now());
  if (interval && interval > 0) {
    tasksInterval.push({ id, name, interval:parseFloat(interval), sinceBase:null, anchorTotal:null, cost:"", link:"" });
  } else {
    tasksAsReq.push({ id, name, condition:condition||"As required", cost:"", link:"" });
  }
  // also seed inventory if not present
  inventory.push({ id:"inv_"+id, name, qty:0, unit:"pcs", note:"", pn:"", link:"" });
  saveTasks(); saveInventory();
  route();
}

/* ======================= Controllers ======================= */
function renderDashboard() {
  const root = document.getElementById("content");
  root.innerHTML = viewDashboard();

  // log hours
  document.getElementById("logBtn").onclick = () => {
    const v = parseFloat(document.getElementById("totalInput").value);
    if (!isNaN(v)) { saveTotal(v); route(); }
  };

  // Quick Add
  document.getElementById("quickAddForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("qa_name").value.trim();
    const interval = parseFloat(document.getElementById("qa_interval").value);
    const condition = document.getElementById("qa_condition").value.trim();
    if (!name) return;
    quickAddFromCalendar({ name, interval: isNaN(interval)?null:interval, condition });
  });

  // next due box
  const nds = tasksInterval.map(t => ({ t, nd: nextDue(t) })).filter(x => x.nd);
  nds.sort((a,b) => a.nd.due - b.nd.due);
  const box = document.getElementById("nextDueBox");
  box.textContent = nds.length
    ? `${nds[0].t.name}: ${Math.max(0, nds[0].nd.remain.toFixed(0))} hrs → ${nds[0].nd.due.toDateString()} (in ${nds[0].nd.days} days)`
    : "—";

  renderCalendar();
}

function renderSettings() {
  const root = document.getElementById("content");
  root.innerHTML = viewSettings();

  // Input bindings (both lists)
  root.querySelectorAll("[data-id]").forEach(inp => {
    inp.addEventListener("input", () => {
      const id   = inp.getAttribute("data-id");
      const key  = inp.getAttribute("data-k");
      const list = inp.getAttribute("data-list");
      const arr  = list === "interval" ? tasksInterval : tasksAsReq;
      const t = arr.find(x => x.id === id); if (!t) return;
      let val = inp.value;
      if (["interval","sinceBase","price"].includes(key)) val = (val === "" ? null : parseFloat(val));
      t[key] = val;
    });
  });

  // Remove buttons
  root.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove");
      const from = btn.getAttribute("data-from");
      if (from === "interval") tasksInterval = tasksInterval.filter(t => t.id !== id);
      else tasksAsReq = tasksAsReq.filter(t => t.id !== id);
      saveTasks(); route();
    });
  });

  // Mark completed (from settings)
  root.querySelectorAll(".btn-complete").forEach(btn => {
    btn.addEventListener("click", () => completeTask(btn.getAttribute("data-complete")));
  });

  // Add forms
  document.getElementById("addIntervalForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("ai_name").value.trim();
    const interval = parseFloat(document.getElementById("ai_interval").value);
    if (!name || isNaN(interval) || interval<=0) return;
    const id = (name.toLowerCase().replace(/[^a-z0-9]+/g,"_") + "_" + Date.now());
    tasksInterval.push({ id, name, interval, sinceBase:null, anchorTotal:null, cost:"", link:"" });
    inventory.push({ id:"inv_"+id, name, qty:0, unit:"pcs", note:"", pn:"", link:"" });
    saveTasks(); saveInventory(); route();
  });

  document.getElementById("addAsReqForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("ar_name").value.trim();
    const condition = document.getElementById("ar_condition").value.trim() || "As required";
    if (!name) return;
    const id = (name.toLowerCase().replace(/[^a-z0-9]+/g,"_") + "_" + Date.now());
    tasksAsReq.push({ id, name, condition, cost:"", link:"" });
    inventory.push({ id:"inv_"+id, name, qty:0, unit:"pcs", note:"", pn:"", link:"" });
    saveTasks(); saveInventory(); route();
  });

  document.getElementById("saveTasksBtn").onclick = () => { saveTasks(); route(); };
}

function renderCosts() {
  const root = document.getElementById("content");
  root.innerHTML = viewCosts();

  const tbody = document.querySelector("#costTable tbody");
  const filter = document.getElementById("costFilter");

  function draw() {
    const val = filter.value; // "interval" | "asreq" | "all"
    const rows = [];
    if (val === "interval" || val === "all") {
      tasksInterval.forEach(t => {
        rows.push(`<tr>
          <td>${t.name}</td><td>Per Interval</td><td>${t.interval}</td>
          <td>${t.cost || (t.price!=null?("$"+t.price):"$____")}</td>
          <td>${t.link ? `<a href="${t.link}" target="_blank">link</a>` : "link"}</td>
        </tr>`);
      });
    }
    if (val === "asreq" || val === "all") {
      tasksAsReq.forEach(t => {
        rows.push(`<tr>
          <td>${t.name}</td><td>As Required</td><td>—</td>
          <td>${t.cost || (t.price!=null?("$"+t.price):"$____")}</td>
          <td>${t.link ? `<a href="${t.link}" target="_blank">link</a>` : "link"}</td>
        </tr>`);
      });
    }
    tbody.innerHTML = rows.join("");
  }
  filter.addEventListener("change", draw);
  draw();
}

function renderInventory() {
  const root = document.getElementById("content");
  root.innerHTML = viewInventory();

  root.querySelectorAll("[data-inv]").forEach(el => {
    el.addEventListener("input", () => {
      const i = parseInt(el.getAttribute("data-i"), 10);
      const k = el.getAttribute("data-inv");
      if (k === "remove") return;
      inventory[i][k] = (k === "qty") ? parseFloat(el.value||0) : el.value;
    });
  });
  root.querySelectorAll("[data-inv='remove']").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = parseInt(btn.getAttribute("data-i"), 10);
      inventory.splice(i,1);
      saveInventory();
      renderInventory();
    });
  });
  document.getElementById("addInvRow").onclick = () => {
    inventory.push({ id:"inv_custom_"+Date.now(), name:"New Item", qty:0, unit:"pcs", note:"", pn:"", link:"" });
    renderInventory();
  };
  document.getElementById("saveInv").onclick = () => { saveInventory(); route(); };
}

/* ---------- Tabs ---------- */
function setActive(tab) {
  ["dashboard","settings","costs","inventory"].forEach(id => {
    const el = document.getElementById("tab-"+id);
    if (el) el.classList.toggle("active", id===tab);
  });
}
function route() {
  const hash = (location.hash || "#dashboard").replace("#","");
  setActive(hash);
  if (hash === "settings") renderSettings();
  else if (hash === "costs") renderCosts();
  else if (hash === "inventory") renderInventory();
  else renderDashboard();
}

/* ---------- Boot ---------- */
loadState();
window.addEventListener("hashchange", route);
route();
