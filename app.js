// ====== Constants & Storage Keys ======
const DAILY_HOURS = 8;
const LS_BASE_HOURS = "omax_base_hours";      // number: manual total hours baseline
const LS_BASE_DATE  = "omax_base_date";       // ISO date when baseline set
const LS_TASKS      = "omax_tasks_v3";        // array of tasks with lastDone total

// ====== Default Tasks ======
const defaultTasks = [
  { id: "nozzle", name: "Nozzle Change", interval: 80,  lastDone: null },
  { id: "oil",    name: "Pump Oil",      interval: 500, lastDone: null }
];

// ====== State ======
let baseHours = null;   // manual total hours baseline
let baseDate  = null;   // date baseline set
let tasks = [];

// ====== Init / Storage ======
function loadState() {
  const bh = localStorage.getItem(LS_BASE_HOURS);
  baseHours = (bh !== null) ? parseFloat(bh) : null;
  const bd = localStorage.getItem(LS_BASE_DATE);
  baseDate = bd ? new Date(bd) : null;

  const t = localStorage.getItem(LS_TASKS);
  tasks = t ? JSON.parse(t) : defaultTasks.slice();
}

function saveBase(hours) {
  baseHours = hours;
  baseDate  = new Date();        // baseline "today"
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

// Projected hours at target date using baseline + 8h/day
function projectedHoursAt(date) {
  if (baseHours == null || baseDate == null) return null;
  const diffDays = Math.max(0, daysBetween(baseDate, date));
  return baseHours + diffDays * DAILY_HOURS;
}

// Hours since last service as of today
function hoursSinceLast(task) {
  if (task.lastDone == null) return null;
  const today = startOfDay(new Date());
  const current = projectedHoursAt(today);
  if (current == null) return null;
  return Math.max(0, current - task.lastDone);
}

// Next due (round to nearest day; .5 rounds up)
function nextDueFor(task) {
  const since = hoursSinceLast(task);
  if (since == null) return null;
  const remain = Math.max(0, task.interval - since);     // hours remaining
  const days = Math.max(0, Math.round(remain / DAILY_HOURS)); // e.g., 65/8=8.125 -> 8 days; 20/8=2.5 -> 3 days
  const dueDate = addDays(startOfDay(new Date()), days);
  return { remain, days, dueDate, since };
}

// ====== UI Bindings ======
function bindControls() {
  const man = document.getElementById("manualHours");
  man.value = (baseHours != null) ? baseHours : "";

  const nozLastTotal = document.getElementById("nozLastTotal");
  const nozSince     = document.getElementById("nozSince");
  const oilLastTotal = document.getElementById("oilLastTotal");
  const oilSince     = document.getElementById("oilSince");

  const tNoz = tasks.find(t => t.id === "nozzle");
  const tOil = tasks.find(t => t.id === "oil");

  // Pre-fill from stored "lastDone"
  nozLastTotal.value = (tNoz.lastDone != null) ? tNoz.lastDone : "";
  oilLastTotal.value = (tOil.lastDone != null) ? tOil.lastDone : "";

  // Clear "since" inputs on load (they are alternative entry)
  nozSince.value = "";
  oilSince.value = "";

  document.getElementById("setHoursBtn").onclick = () => {
    const v = parseFloat(man.value);
    if (!isNaN(v)) {
      saveBase(v);
      renderAll();
    }
  };

  document.getElementById("saveTasksBtn").onclick = () => {
    const current = projectedHoursAt(new Date());
    if (current == null) {
      alert("Set Total Machine Hours first.");
      return;
    }
    // Resolve Nozzle
    const sinceNoz = parseFloat(nozSince.value);
    const lastNoz  = parseFloat(nozLastTotal.value);
    if (!isNaN(sinceNoz)) {
      // Convert "since" to lastDone using current projected hours
      tNoz.lastDone = current - sinceNoz;
    } else if (!isNaN(lastNoz)) {
      tNoz.lastDone = lastNoz;
    }
    // Resolve Oil
    const sinceOil = parseFloat(oilSince.value);
    const lastOil  = parseFloat(oilLastTotal.value);
    if (!isNaN(sinceOil)) {
      tOil.lastDone = current - sinceOil;
    } else if (!isNaN(lastOil)) {
      tOil.lastDone = lastOil;
    }

    saveTasks();
    renderAll();
  };
}

// ====== Dashboard & Status ======
function updateDashboardAndStatuses() {
  const current = projectedHoursAt(new Date());
  document.getElementById("currentHours").textContent = current != null ? current.toFixed(0) : "—";
  document.getElementById("baselineDate").textContent = baseDate ? fmtDate(baseDate) : "—";

  const tNoz = tasks.find(t => t.id === "nozzle");
  const tOil = tasks.find(t => t.id === "oil");
  const sNoz = document.getElementById("statusNozzle");
  const sOil = document.getElementById("statusOil");

  const ndNoz = nextDueFor(tNoz);
  const ndOil = nextDueFor(tOil);

  sNoz.textContent = ndNoz ? `${ndNoz.since.toFixed(0)} / ${tNoz.interval} hrs since last` : "—";
  sOil.textContent = ndOil ? `${ndOil.since.toFixed(0)} / ${tOil.interval} hrs since last` : "—";

  // Soonest due
  let soonest = null;
  [ndNoz, ndOil].forEach(x => {
    if (!x) return;
    if (!soonest || x.dueDate < soonest.dueDate) soonest = x;
  });
  const nextTaskEl = document.getElementById("nextTask");
  if (soonest === ndNoz) {
    nextTaskEl.textContent = `Nozzle Change: ${Math.max(0, ndNoz.remain.toFixed(0))} hrs → ${fmtDate(ndNoz.dueDate)} (in ${ndNoz.days} days)`;
  } else if (soonest === ndOil) {
    nextTaskEl.textContent = `Pump Oil: ${Math.max(0, ndOil.remain.toFixed(0))} hrs → ${fmtDate(ndOil.dueDate)} (in ${ndOil.days} days)`;
  } else {
    nextTaskEl.textContent = "—";
  }
}

// ====== Calendar (3 months, real grid) ======
function renderMonths() {
  const container = document.getElementById("months");
  container.innerHTML = "";

  const today = startOfDay(new Date());

  // Precompute one due-date per task
  const dueDates = {};
  tasks.forEach(t => {
    const nd = nextDueFor(t);
    if (nd) {
      const key = nd.dueDate.getFullYear() + "-" + (nd.dueDate.getMonth()+1) + "-" + nd.dueDate.getDate();
      if (!dueDates[key]) dueDates[key] = [];
      dueDates[key].push({ id: t.id, name: t.name });
    }
  });

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

    for (let day = 1; day <= last.getDate(); day++) {
      const date = new Date(first.getFullYear(), first.getMonth(), day);
      const dayDiv = document.createElement("div");
      dayDiv.className = "day";
      if (startOfDay(date).getTime() === today.getTime()) {
        dayDiv.classList.add("today");
      }
      dayDiv.innerHTML = `<div class="date">${day}</div>`;

      const key = date.getFullYear() + "-" + (date.getMonth()+1) + "-" + date.getDate();
      if (dueDates[key]) {
        dueDates[key].forEach(ev => {
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
