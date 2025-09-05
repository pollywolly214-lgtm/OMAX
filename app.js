// LocalStorage keys
const LS_MANUAL = "manualHours";
const LS_EST = "estimation";
const LS_LASTDATE = "lastDate";
const LS_TASKS = "tasks";

// Maintenance tasks (example)
let tasks = [
  { name: "Nozzle Change", interval: 80, lastDone: 1450 },
  { name: "Pump Oil", interval: 500, lastDone: 1000 }
];

// Load saved tasks if exist
if (localStorage.getItem(LS_TASKS)) {
  tasks = JSON.parse(localStorage.getItem(LS_TASKS));
}

let manualHours = parseInt(localStorage.getItem(LS_MANUAL)) || null;
let estHours = parseInt(localStorage.getItem(LS_EST)) || 1500; // start at 1500 default
let lastDate = localStorage.getItem(LS_LASTDATE) || new Date().toDateString();

function daysBetween(d1, d2) {
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

function updateEstimation() {
  let today = new Date().toDateString();
  if (today !== lastDate) {
    // increment based on days passed
    let oldDate = new Date(lastDate);
    let nowDate = new Date(today);
    let diff = daysBetween(oldDate, nowDate);
    estHours += diff * 8;
    lastDate = today;
    localStorage.setItem(LS_EST, estHours);
    localStorage.setItem(LS_LASTDATE, lastDate);
  }
}

function setManualHours() {
  let val = parseInt(document.getElementById("manualHours").value);
  if (!isNaN(val)) {
    manualHours = val;
    estHours = val;
    localStorage.setItem(LS_MANUAL, manualHours);
    localStorage.setItem(LS_EST, estHours);
    lastDate = new Date().toDateString();
    localStorage.setItem(LS_LASTDATE, lastDate);
    render();
  }
}

function setDailyHours() {
  let val = parseInt(document.getElementById("dailyHours").value);
  if (!isNaN(val)) {
    estHours = val;
    localStorage.setItem(LS_EST, estHours);
    lastDate = new Date().toDateString();
    localStorage.setItem(LS_LASTDATE, lastDate);
    render();
  }
}

function getCurrentHours() {
  return manualHours || estHours;
}

function calcNextDue(task) {
  let current = getCurrentHours();
  let diff = current - task.lastDone;
  let remain = task.interval - diff;
  if (remain < 0) remain = 0;
  return remain;
}

function renderDashboard() {
  document.getElementById("estHours").textContent = estHours;
  document.getElementById("manHours").textContent = manualHours || "None";
  // Find next due
  let soonest = null;
  tasks.forEach(task => {
    let remain = calcNextDue(task);
    if (!soonest || remain < soonest.remain) {
      soonest = { name: task.name, remain };
    }
  });
  if (soonest) {
    let days = Math.ceil(soonest.remain / 8);
    let dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + days);
    document.getElementById("nextTask").textContent = 
      soonest.name + " in " + soonest.remain + " hrs (due " + dueDate.toDateString() + ")";
  } else {
    document.getElementById("nextTask").textContent = "None";
  }
}

function renderCalendar() {
  const cal = document.getElementById("calendar");
  cal.innerHTML = "";
  let today = new Date();
  let start = new Date(today.getFullYear(), today.getMonth(), 1);
  let end = new Date(today.getFullYear(), today.getMonth() + 3, 0); // 3 months

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    let div = document.createElement("div");
    div.className = "day";
    div.innerHTML = "<div class='date'>" + (d.getMonth()+1) + "/" + d.getDate() + "</div>";
    // check tasks due this day
    tasks.forEach(task => {
      let remain = calcNextDue(task);
      let days = Math.ceil(remain / 8);
      let dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + days);
      if (d.toDateString() === dueDate.toDateString()) {
        let ev = document.createElement("div");
        ev.className = "event";
        ev.textContent = task.name + " due";
        div.appendChild(ev);
      }
    });
    cal.appendChild(div);
  }
}

function render() {
  updateEstimation();
  renderDashboard();
  renderCalendar();
}

render();