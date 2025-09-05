// ====== Constants & Storage Keys ======
const DAILY_HOURS = 8;
const LS_BASE_HOURS = "omax_base_hours";      // number
const LS_BASE_DATE  = "omax_base_date";       // ISO string (date baseline when hours were set)
const LS_TASKS      = "omax_tasks_v1";        // array of {id,name,interval,lastDone}

// ====== Default Tasks (Two for testing) ======
const defaultTasks = [
  { id: "nozzle", name: "Nozzle Change", interval: 80,  lastDone: null },
  { id: "oil",    name: "Pump Oil",      interval: 500, lastDone: null }
];

// ====== State ======
let baseHours = null;  // manual hours
let baseDate  = null;  // date (at time of manual entry)
let tasks = [];

// ====== Init ======
function loadState() {
  const bh = localStorage.getItem(LS_BASE_HOURS);
  const bd = localStorage.getItem(LS_BASE_DATE);
  baseHours = bh ? parseFloat(bh) : null;
  baseDate  = bd ? new Date(bd) : null;

  const t = localStorage.getItem(LS_TASKS);
  tasks = t ? JSON.parse(t) : defaultTasks.slice();
}

function saveBase(hours) {
  baseHours = hours;
  baseDate  = new Date();
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

// Projected hours at a specific date (from the manual baseline + 8h/day)
function projectedHoursAt(date) {
  if (baseHours == null || baseDate == null) return null;
  const deltaDays = Math.max(0, daysBetween(baseDate, date));
  return baseHours + deltaDays * DAILY_HOURS;
}

// Compute next due date for a task from "today" using +8h/day
function nextDueFor(task) {
  if (baseHours == null || baseDate == null) return null;
  if (task.lastDone == null || isNaN(task.lastDone)) return null;

  const today = startOfDay(new Date());
  const currentHours = projectedHoursAt(today);
  const since = currentHours - task.lastDone;
  const remain = Math.max(0, task.interval - since);          // hours remaining to hit interval
  const daysNeeded = Math.ceil(remain / DAILY_HOURS);         // days to reach due
  const dueDate = addDays(today, daysNeeded);
  return { dueDate, remain };
}

// ====== UI: Dashboard & Inputs ======
function updateDashboard() {
  const currentHours = projectedHoursAt(new Date());
  document.getElementById("currentHours").textContent = (currentHours != null) ? currentHours.toFixed(0) : "—";
  document.getElementById("baselineDate").textContent = baseDate ? fmtDate(baseDate) : "—";

  // Find soonest due
  let soonest = null;
  tasks.forEach(t => {
    const nd = nextDueFor(t);
    if (nd && (!soonest || nd.dueDate < soonest.dueDate)) {
      soonest = { name: t.name, ...nd };
    }
  });

  const nextTaskEl = document.getElementById("nextTask");
  if (soonest) {
    nextTaskEl.textContent = `${soonest.name}: in ${Math.max(0, soonest.remain.toFixed(0))} hrs (due ${fmtDate(soonest.dueDate)})`;
  } else {
    nextTaskEl.textContent = "—";
  }
}

function bindControls() {
  // Pre-fill inputs
  const man = document.getElementById("manualHours");
  man.value = (baseHours != null) ? baseHours : "";

  const lastNozzle = document.getElementById("lastNozzle");
  const lastOil = document.getElementById("lastOil");
  const tNozzle = tasks.find(t => t.id === "nozzle");
  const tOil    = tasks.find(t => t.id === "oil");
  lastNozzle.value = (tNozzle && tNozzle.lastDone != null) ? tNozzle.lastDone : "";
  lastOil.value    = (tOil && tOil.lastDone != null) ? tOil.lastDone : "";

  document.getElementById("setHoursBtn").onclick = () => {
    const v = parseFloat(man.value);
    if (!isNaN(v)) {
      saveBase(v);
      renderAll();
    }
  };

  document.getElementById("saveTasksBtn").onclick = () => {
    const ln = parseFloat(lastNozzle.value);
    const lo = parseFloat(lastOil.value);
    if (tNozzle && !isNaN(ln)) tNozzle.lastDone = ln;
    if (tOil    && !isNaN(lo)) tOil.lastDone    = lo;
    saveTasks();
    renderAll();
  };
}

// ====== Calendar Rendering (3 months) ======
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

    // Build weeks
    const grid = document.createElement("div");
    grid.className = "week";

    // Leading blanks
    for (let i = 0; i < first.getDay(); i++) {
      const dayDiv = document.createElement("div");
      dayDiv.className = "day other-month";
      grid.appendChild(dayDiv);
    }

    // Precompute task due dates for performance
    const dueMap = {}; // key: yyyy-mm-dd -> array of {taskId, name}
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

    // Trailing blanks to complete the last week row
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
  updateDashboard();
  renderMonths();
}

// ====== Boot ======
loadState();
renderAll();
