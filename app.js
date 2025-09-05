// ====== Constants & Storage Keys ======
const DAILY_HOURS = 8;
const LS_BASE_HOURS = "omax_base_hours";      // number
const LS_BASE_DATE  = "omax_base_date";       // ISO string
const LS_TASKS      = "omax_tasks_v2";        // {id,name,interval,lastDone}

// ====== Default Tasks ======
const defaultTasks = [
  { id: "nozzle", name: "Nozzle Change", interval: 80,  lastDone: null },
  { id: "oil",    name: "Pump Oil",      interval: 500, lastDone: null }
];

// ====== State ======
let baseHours = null;
let baseDate  = null;
let tasks = [];

// ====== Init/Storage ======
function loadState() {
  baseHours = localStorage.getItem(LS_BASE_HOURS);
  baseHours = baseHours !== null ? parseFloat(baseHours) : null;
  const bd = localStorage.getItem(LS_BASE_DATE);
  baseDate  = bd ? new Date(bd) : null;

  const t = localStorage.getItem(LS_TASKS);
  tasks = t ? JSON.parse(t) : defaultTasks.slice();
}

function saveBase(hours) {
  baseHours = hours;
  baseDate  = new Date(); // set baseline timestamp
  localStorage.setItem(LS_BASE_HOURS, String(baseHours));
  localStorage.setItem(LS_BASE_DATE, baseDate.toISOString());
}

function saveTasks() {
  localStorage.setItem(LS_TASKS, JSON.stringify(tasks));
}

// ====== Helpers ======
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0,0,0,0);
  return x;
}

function daysBetween(a, b) {
  const A = startOfDay(a).getTime();
  const B = startOfDay(b).getTime();
  return Math.round((B - A) / (1000*60*60*24));
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function fmtDate(d) {
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Project current hours at a date using baseline + 8h/day
function projectedHoursAt(date) {
  if (baseHours == null || baseDate == null) return null;
  const diffDays = Math.max(0, daysBetween(baseDate, date));
  return baseHours + diffDays * DAILY_HOURS;
}

// Compute hours since last service for a task as of "today"
function hoursSinceLast(task) {
  if (task.lastDone == null) return null;
  const today = startOfDay(new Date());
  const current = projectedHoursAt(today);
  if (current == null) return null;
  return Math.max(0, current - task.lastDone);
}

// Compute next due for a task using rounding DOWN on days (floor)
function nextDueFor(task) {
  const since = hoursSinceLast(task);
  if (since == null) return null;
  const remain = Math.max(0, task.interval - since);
  const days = Math.max(0, Math.floor(remain / DAILY_HOURS)); // floor per your rule
  const dueDate = addDays(startOfDay(new Date()), days);
  return { remain, days, dueDate };
}

// ====== UI: Dashboard & Inputs ======
function updateDashboardAndStatuses() {
  const current = projectedHoursAt(new Date());
  document.getElementById("currentHours").textContent = current != null ? current.toFixed(0) : "—";
  document.getElementById("baselineDate").textContent = baseDate ? fmtDate(baseDate) : "—";

  // Update status labels for tasks: "X hrs since last"
  const tNozzle = tasks.find(t => t.id === "nozzle");
  const tOil    = tasks.find(t => t.id === "oil");
  const sNoz = document.getElementById("statusNozzle");
  const sOil = document.getElementById("statusOil");

  const hsNoz = hoursSinceLast(tNozzle);
  const hsOil = hoursSinceLast(tOil);
  sNoz.textContent = (hsNoz != null) ? `${hsNoz.toFixed(0)} hrs since last` : "—";
  sOil.textContent = (hsOil != null) ? `${hsOil.toFixed(0)} hrs since last` : "—";

  // Find soonest due by date
  let soonest = null;
  [tNozzle, tOil].forEach(t => {
    const nd = nextDueFor(t);
    if (nd && (!soonest || nd.dueDate < soonest.dueDate)) {
      soonest = { name: t.name, ...nd };
    }
  });

  const nextTaskEl = document.getElementById("nextTask");
  if (soonest) {
    nextTaskEl.textContent = `${soonest.name}: ${Math.max(0, soonest.remain.toFixed(0))} hrs remaining → due ${fmtDate(soonest.dueDate)} (in ${soonest.days} days)`;
  } else {
    nextTaskEl.textContent = "—";
  }
}

function bindControls() {
  // Prefill inputs
  const man = document.getElementById("manualHours");
  man.value = (baseHours != null) ? baseHours : "";

  const lastNozInput = document.getElementById("lastNozzle");
  const lastOilInput = document.getElementById("lastOil");

  const tNozzle = tasks.find(t => t.id === "nozzle");
  const tOil    = tasks.find(t => t.id === "oil");
  lastNozInput.value = (tNozzle && tNozzle.lastDone != null) ? tNozzle.lastDone : "";
  lastOilInput.value = (tOil && tOil.lastDone != null) ? tOil.lastDone : "";

  document.getElementById("setHoursBtn").onclick = () => {
    const v = parseFloat(man.value);
    if (!isNaN(v)) {
      saveBase(v);
      renderAll();
    }
  };

  document.getElementById("saveTasksBtn").onclick = () => {
    const ln = parseFloat(lastNozInput.value);
    const lo = parseFloat(lastOilInput.value);
    if (tNozzle && !isNaN(ln)) tNozzle.lastDone = ln;
    if (tOil    && !isNaN(lo)) tOil.lastDone    = lo;
    saveTasks();
    renderAll();
  };
}

// ====== Calendar Rendering (3 months, proper grid) ======
function renderMonths() {
  const container = document.getElementById("months");
  container.innerHTML = "";

  const today = startOfDay(new Date());
  for (let mOffset = 0; mOffset < 3; mOffset++) {
    const first = new Date(today.getFullYear(), today.getMonth() + mOffset, 1);
    const last  = new Date(today.getFullYear(), today.getMonth() + mOffset + 1, 0);

    const monthDiv = document.createElement("div");
    monthDiv.className = "month";

    const head = document.createElement("div");
    head.className = "month-header";
    head.textContent = first.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
    monthDiv.appendChild(head);

    const weekdays = document.createElement("div");
    weekdays.className = "weekdays";
    ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d => {
      const el = document.createElement("div");
      el.textContent = d;
      weekdays.appendChild(el);
    });
    monthDiv.appendChild(weekdays);

    const grid = document.createElement("div");
    grid.className = "week";

    // Leading blanks
    for (let i = 0; i < first.getDay(); i++) {
      const dayDiv = document.createElement("div");
      dayDiv.className = "day other-month";
      grid.appendChild(dayDiv);
    }

    // Precompute due dates for tasks (only one future instance based on baseline)
    const dueMap = {};
    tasks.forEach(t => {
      const nd = nextDueFor(t);
      if (!nd) return;
      const d = nd.dueDate;
      const key = d.getFullYear() + "-" + (d.getMonth()+1) + "-" + d.getDate();
      if (!dueMap[key]) dueMap[key] = [];
      dueMap[key].push({ id: t.id, name: t.name });
    });

    // Real days
    for (let day = 1; day <= last.getDate(); day++) {
      const date = new Date(first.getFullYear(), first.getMonth(), day);
      const dayDiv = document.createElement("div");
      dayDiv.className = "day";
      if (startOfDay(date).getTime() === today.getTime()) {
        dayDiv.classList.add("today");
      }
      dayDiv.innerHTML = `<div class="date">${day}</div>`;

      const key = date.getFullYear() + "-" + (date.getMonth()+1) + "-" + date.getDate();
      if (dueMap[key]) {
        dueMap[key].forEach(ev => {
          const e = document.createElement("div");
          e.className = "event " + (ev.id === "nozzle" ? "nozzle" : ev.id === "oil" ? "oil" : "");
          e.textContent = ev.name + " due";
          dayDiv.appendChild(e);
        });
      }

      grid.appendChild(dayDiv);
    }

    // Trailing blanks
    const filled = first.getDay() + last.getDate();
    const remainder = filled % 7;
    if (remainder !== 0) {
      for (let i = 0; i < (7 - remainder); i++) {
        const dayDiv = document.createElement("div");
        dayDiv.className = "day other-month";
        grid.appendChild(dayDiv);
      }
    }

    monthDiv.appendChild(grid);
    container.appendChild(monthDiv);
  }
}

// ====== Master Render ======
function renderAll() {
  bindControls();
  updateDashboardAndStatuses();
  renderMonths();
}

// ====== Boot ======
loadState();
renderAll();
