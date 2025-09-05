// ===== Constants & Storage =====
const DAILY_HOURS = 8;
const LS_TOTAL_HISTORY = "omax_total_history_v2"; // [{dateISO, hours}]
const LS_TASKS = "omax_tasks_v5"; // [{id,name,interval,sinceBase,cost,link}]

// ===== Default tasks (numeric-hour intervals only) =====
const defaultTasks = [
  { id: "nozzle",        name: "Nozzle (mixing tube)",                         interval: 80,   sinceBase: null, cost: "", link: "" },
  { id: "nozzle_final",  name: "Nozzle Final Filter (i/A-Jet)",                interval: 80,   sinceBase: null, cost: "", link: "" },
  { id: "nozzle_body",   name: "Nozzle housing (on/off valve cartridge)",      interval: 500,  sinceBase: null, cost: "", link: "" }, // 400–600 → 500 default
  { id: "pump_oil",      name: "Pump oil (crankcase)",                         interval: 500,  sinceBase: null, cost: "", link: "" }, // ignore initial 50 for simplicity
  { id: "pump_minor",    name: "Pump minor rebuild (HP seals + checks)",       interval: 600,  sinceBase: null, cost: "", link: "" }, // 500–750 → 600 default
  { id: "pump_major",    name: "Pump major rebuild (wet end + dump + dia)",    interval: 1500, sinceBase: null, cost: "", link: "" }, // 1500–2000
  { id: "dump_valve",    name: "Bleed-down / dump valve",                      interval: 1500, sinceBase: null, cost: "", link: "" },
  { id: "accumulator",   name: "Accumulator / attenuator diaphragm",           interval: 1500, sinceBase: null, cost: "", link: "" },
  { id: "cone_ferrule",  name: "HP cone / ferrule sets",                       interval: 5000, sinceBase: null, cost: "", link: "" },
  { id: "charge_pump",   name: "Charge pump",                                  interval: 4000, sinceBase: null, cost: "", link: "" }, // 4000–6000 → 4000 default
  { id: "final_filter",  name: "Pump Final Filter (1–5 μm before pump)",       interval: 100,  sinceBase: null, cost: "", link: "" }, // 100–150 → 100 default
  { id: "prefilter_20",  name: "Pump Prefilter (20 μm)",                       interval: 100,  sinceBase: null, cost: "", link: "" }
];

// ===== State =====
let totalHistory = [];
let tasks = [];

// ===== Storage helpers =====
function loadState() {
  const th = localStorage.getItem(LS_TOTAL_HISTORY);
  totalHistory = th ? JSON.parse(th) : [];
  const t = localStorage.getItem(LS_TASKS);
  tasks = t ? JSON.parse(t) : defaultTasks.slice();
}

function saveTotal(hours) {
  totalHistory.push({ dateISO: new Date().toISOString(), hours: parseFloat(hours) });
  localStorage.setItem(LS_TOTAL_HISTORY, JSON.stringify(totalHistory));
}

function saveTasks() {
  localStorage.setItem(LS_TASKS, JSON.stringify(tasks));
}

// ===== Derived values =====
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

// liveSince = baseline since + delta
function liveSince(task) {
  if (task.sinceBase == null) return null;
  return task.sinceBase + deltaSinceLast();
}

function nextDue(task) {
  const since = liveSince(task);
  if (since == null) return null;
  const remain = Math.max(0, task.interval - since);
  const days = Math.round(remain / DAILY_HOURS); // .5 up
  const due = new Date(); due.setHours(0,0,0,0); due.setDate(due.getDate() + days);
  const lastServicedAt = (currentTotal() != null && since != null) ? Math.max(0, currentTotal() - since) : null;
  return { since, remain, days, due, lastServicedAt };
}

// ===== Views =====
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
  </div>

  <div class="container">
    <div class="block" style="grid-column: 1 / -1">
      <h3>Calendar (Current + Next 2 Months)</h3>
      <div id="months"></div>
    </div>
  </div>
  `;
}

function taskDetails(task) {
  const nd = nextDue(task);
  const sinceTxt = nd ? `${nd.since.toFixed(0)} / ${task.interval} hrs` : "—";
  const daysTxt = nd ? `${nd.days} day(s) → ${nd.due.toDateString()}` : "—";
  const lastServ = nd && nd.lastServicedAt!=null ? `${nd.lastServicedAt.toFixed(0)} hrs` : "—";

  return `
  <details>
    <summary>${task.name} — <span class="small">since: ${sinceTxt} | due: ${daysTxt}</span></summary>
    <div class="row"><label>Service:</label><div>${task.name}</div></div>
    <div class="row"><label>Interval (hrs):</label><div><input type="number" data-k="interval" data-id="${task.id}" value="${task.interval}" /></div></div>
    <div class="row"><label>When last serviced (hrs):</label><div>${lastServ}</div></div>
    <div class="row"><label>Baseline “since last” (hrs):</label><div><input type="number" data-k="sinceBase" data-id="${task.id}" value="${task.sinceBase!=null?task.sinceBase:""}" placeholder="e.g., 50" /></div></div>
    <div class="row"><label>Cost placeholder:</label><div><input type="text" data-k="cost" data-id="${task.id}" value="${task.cost}" placeholder="$____" /></div></div>
    <div class="row"><label>Link:</label><div><input type="url" data-k="link" data-id="${task.id}" value="${task.link}" placeholder="https://store…" /></div></div>
  </details>
  `;
}

function viewSchedule() {
  return `
  <div class="container">
    <div class="block" style="grid-column: 1 / -1">
      <h3>Maintenance Settings</h3>
      <p class="small">Use the dropdowns to configure each task. “When last serviced” is computed from your total hours and the baseline “since last.”</p>
      ${tasks.map(taskDetails).join("")}
      <div style="margin-top:10px;"><button id="saveTasksBtn">Save All</button></div>
    </div>
  </div>`;
}

function viewCosts() {
  return `
  <div class="container">
    <div class="block" style="grid-column: 1 / -1">
      <h3>Cost Analysis (placeholders)</h3>
      <table>
        <thead><tr><th>Task</th><th>Interval (hrs)</th><th>Cost</th><th>Link</th></tr></thead>
        <tbody>
          ${tasks.map(t => `
            <tr>
              <td>${t.name}</td>
              <td>${t.interval}</td>
              <td>${t.cost || "$____"}</td>
              <td>${t.link ? `<a href="${t.link}" target="_blank">link</a>` : "link"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  </div>`;
}

// ===== Calendar rendering =====
function renderCalendar() {
  const container = document.getElementById("months");
  if (!container) return;
  container.innerHTML = "";

  // Gather one due per task
  const dueMap = {};
  tasks.forEach(t => {
    const nd = nextDue(t);
    if (!nd) return;
    const key = `${nd.due.getFullYear()}-${nd.due.getMonth()+1}-${nd.due.getDate()}`;
    if (!dueMap[key]) dueMap[key] = [];
    dueMap[key].push({ name: t.name, id: t.id });
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
          const e = document.createElement("div");
          let cls = "generic";
          if (ev.id.includes("nozzle")) cls = "nozzle";
          else if (ev.id.includes("oil")) cls = "oil";
          e.className = "event " + cls;
          e.textContent = ev.name + " due";
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

// ===== Page controller =====
function renderDashboard() {
  const root = document.getElementById("content");
  root.innerHTML = viewDashboard();

  // bind
  document.getElementById("logBtn").onclick = () => {
    const v = parseFloat(document.getElementById("totalInput").value);
    if (!isNaN(v)) { saveTotal(v); route(); }
  };

  // compute next due
  const nds = tasks.map(t => ({ t, nd: nextDue(t) })).filter(x => x.nd);
  nds.sort((a,b) => a.nd.due - b.nd.due);
  const box = document.getElementById("nextDueBox");
  if (nds.length) {
    const a = nds[0];
    box.textContent = `${a.t.name}: ${Math.max(0, a.nd.remain.toFixed(0))} hrs → ${a.nd.due.toDateString()} (in ${a.nd.days} days)`;
  } else {
    box.textContent = "—";
  }

  renderCalendar();
}

function renderSchedule() {
  const root = document.getElementById("content");
  root.innerHTML = viewSchedule();

  // Hook inputs
  document.querySelectorAll("[data-id]").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const id = inp.getAttribute("data-id");
      const key = inp.getAttribute("data-k");
      const t = tasks.find(x => x.id === id);
      if (!t) return;
      let val = inp.value;
      if (key === "interval" || key === "sinceBase") val = val === "" ? null : parseFloat(val);
      t[key] = val;
    });
  });
  document.getElementById("saveTasksBtn").onclick = () => { saveTasks(); route(); };
}

function renderCosts() {
  const root = document.getElementById("content");
  root.innerHTML = viewCosts();
}

function setActive(tab) {
  ["dashboard","schedule","costs"].forEach(id => {
    const el = document.getElementById("tab-"+id);
    if (el) el.classList.toggle("active", id===tab);
  });
}

function route() {
  const hash = (location.hash || "#dashboard").replace("#","");
  setActive(hash);
  if (hash === "schedule") renderSchedule();
  else if (hash === "costs") renderCosts();
  else renderDashboard();
}

// ===== Boot =====
loadState();
window.addEventListener("hashchange", route);
route();
