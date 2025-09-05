// ====== Constants & Storage ======
const DAILY_HOURS = 8;
const LS_TOTAL_HISTORY = "omax_total_history_v1"; // [{dateISO, hours}]
const LS_TASK_BASELINES = "omax_task_since_baselines_v1"; // {nozzle: number, oil: number}

const intervals = { nozzle: 80, oil: 500 };

// ====== State ======
let totalHistory = [];     // array of {dateISO, hours}
let sinceBaselines = { nozzle: null, oil: null }; // manual "since last" baselines

// ====== Storage helpers ======
function loadState() {
  const th = localStorage.getItem(LS_TOTAL_HISTORY);
  totalHistory = th ? JSON.parse(th) : [];
  const sb = localStorage.getItem(LS_TASK_BASELINES);
  sinceBaselines = sb ? JSON.parse(sb) : { nozzle: null, oil: null };
}

function saveTotal(hours) {
  const entry = { dateISO: new Date().toISOString(), hours: parseFloat(hours) };
  totalHistory.push(entry);
  localStorage.setItem(LS_TOTAL_HISTORY, JSON.stringify(totalHistory));
}

function saveBaselines() {
  localStorage.setItem(LS_TASK_BASELINES, JSON.stringify(sinceBaselines));
}

// ====== Derived values ======
function currentTotal() {
  if (totalHistory.length === 0) return null;
  return totalHistory[totalHistory.length - 1].hours;
}
function previousTotal() {
  if (totalHistory.length < 2) return null;
  return totalHistory[totalHistory.length - 2].hours;
}
function deltaSinceLast() {
  const cur = currentTotal(), prev = previousTotal();
  if (cur == null || prev == null) return 0;
  return Math.max(0, cur - prev);
}

// Live "since" = manual baseline + delta (from total-hours change)
function liveSince(taskKey) {
  const base = sinceBaselines[taskKey];
  if (base == null) return null;
  return base + deltaSinceLast();
}

// Next due calc for a task (using liveSince)
function nextDue(taskKey) {
  const live = liveSince(taskKey);
  if (live == null) return null;
  const remain = Math.max(0, intervals[taskKey] - live);
  const days = Math.round(remain / DAILY_HOURS); // .5 up rule
  const due = new Date();
  due.setHours(0,0,0,0);
  due.setDate(due.getDate() + days);
  return { live, remain, days, due };
}

// ====== UI bind ======
function bind() {
  const hoursInput = document.getElementById('totalHoursInput');
  const logBtn = document.getElementById('logHoursBtn');
  const saveTasksBtn = document.getElementById('saveTasksBtn');

  // Prefill current total
  const curr = currentTotal();
  hoursInput.value = (curr != null) ? curr : '';

  logBtn.onclick = () => {
    const v = parseFloat(hoursInput.value);
    if (isNaN(v)) return;
    saveTotal(v);
    render();
  };

  // Prefill baselines
  document.getElementById('nozSinceSet').value = (sinceBaselines.nozzle ?? '');
  document.getElementById('oilSinceSet').value = (sinceBaselines.oil ?? '');

  saveTasksBtn.onclick = () => {
    const nz = parseFloat(document.getElementById('nozSinceSet').value);
    const ol = parseFloat(document.getElementById('oilSinceSet').value);
    if (!isNaN(nz)) sinceBaselines.nozzle = nz;
    if (!isNaN(ol)) sinceBaselines.oil = ol;
    saveBaselines();
    render();
  };
}

// ====== Calendar ======
function renderCalendar() {
  const container = document.getElementById('months');
  container.innerHTML = '';

  const today = new Date(); today.setHours(0,0,0,0);

  // Precompute due dates
  const dueMap = {};
  ['nozzle','oil'].forEach(k => {
    const nd = nextDue(k);
    if (!nd) return;
    const key = nd.due.getFullYear() + '-' + (nd.due.getMonth()+1) + '-' + nd.due.getDate();
    if (!dueMap[key]) dueMap[key] = [];
    dueMap[key].push({ key, name: (k==='nozzle'?'Nozzle Change':'Pump Oil') });
  });

  for (let m = 0; m < 3; m++) {
    const first = new Date(today.getFullYear(), today.getMonth()+m, 1);
    const last  = new Date(today.getFullYear(), today.getMonth()+m+1, 0);

    const monthDiv = document.createElement('div');
    monthDiv.className = 'month';

    const head = document.createElement('div');
    head.className = 'month-header';
    head.textContent = first.toLocaleDateString(undefined, { year:'numeric', month:'long' });
    monthDiv.appendChild(head);

    const weekdays = document.createElement('div');
    weekdays.className = 'weekdays';
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
      const el = document.createElement('div');
      el.textContent = d;
      weekdays.appendChild(el);
    });
    monthDiv.appendChild(weekdays);

    const grid = document.createElement('div');
    grid.className = 'week';

    // leading blanks
    for (let i=0; i<first.getDay(); i++) {
      const blank = document.createElement('div');
      blank.className = 'day other-month';
      grid.appendChild(blank);
    }

    for (let day=1; day<=last.getDate(); day++) {
      const date = new Date(first.getFullYear(), first.getMonth(), day);
      const cell = document.createElement('div');
      cell.className = 'day';
      if (date.getTime() === today.getTime()) cell.classList.add('today');
      cell.innerHTML = `<div class="date">${day}</div>`;

      const key = date.getFullYear() + '-' + (date.getMonth()+1) + '-' + date.getDate();
      if (dueMap[key]) {
        dueMap[key].forEach(ev => {
          const e = document.createElement('div');
          e.className = 'event ' + (ev.key==='nozzle'?'nozzle':'oil');
          e.textContent = ev.name + ' due';
          cell.appendChild(e);
        });
      }

      grid.appendChild(cell);
    }

    // trailing blanks
    const filled = first.getDay() + last.getDate();
    const rem = filled % 7;
    if (rem !== 0) {
      for (let i=0; i<7-rem; i++) {
        const blank = document.createElement('div');
        blank.className = 'day other-month';
        grid.appendChild(blank);
      }
    }

    monthDiv.appendChild(grid);
    container.appendChild(monthDiv);
  }
}

// ====== Other UI (history, dashboard, live since) ======
function renderMeta() {
  const last = currentTotal();
  const prev = previousTotal();
  document.getElementById('currentTotal').textContent = (last!=null? last : '—');
  document.getElementById('lastLogged').textContent = (last!=null? last : '—');
  document.getElementById('deltaSince').textContent = deltaSinceLast().toFixed(0);

  // live "since" displays
  const noz = nextDue('nozzle');
  const oil = nextDue('oil');
  document.getElementById('nozLive').textContent = (noz? `${noz.live.toFixed(0)} hrs since (remain ${noz.remain.toFixed(0)})` : '—');
  document.getElementById('oilLive').textContent = (oil? `${oil.live.toFixed(0)} hrs since (remain ${oil.remain.toFixed(0)})` : '—');

  // next task label
  let soonest = null;
  [['Nozzle Change', noz], ['Pump Oil', oil]].forEach(([name, nd]) => {
    if (!nd) return;
    if (!soonest || nd.due < soonest.due) soonest = { name, ...nd };
  });
  const nextTaskEl = document.getElementById('nextTask');
  if (soonest) nextTaskEl.textContent = `${soonest.name}: ${Math.max(0, soonest.remain.toFixed(0))} hrs → ${soonest.due.toDateString()} (in ${soonest.days} days)`;
  else nextTaskEl.textContent = '—';

  // history list (last 5)
  const ul = document.getElementById('hoursHistory');
  ul.innerHTML = '';
  const lastFive = totalHistory.slice(-5).reverse();
  lastFive.forEach(h => {
    const li = document.createElement('li');
    const d = new Date(h.dateISO);
    li.textContent = `${d.toLocaleString()} — ${h.hours} hrs`;
    ul.appendChild(li);
  });
}

// ====== Master render ======
function render() {
  bind();
  renderMeta();
  renderCalendar();
}

// ====== Boot ======
loadState();
render();