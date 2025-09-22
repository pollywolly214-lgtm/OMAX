/* ================== CALENDAR & BUBBLES ===================== */
let bubbleTimer = null;
function hideBubble(){ const b = document.getElementById("bubble"); if (b) b.remove(); }
function hideBubbleSoon(){ clearTimeout(bubbleTimer); bubbleTimer = setTimeout(hideBubble, 180); }
function makeBubble(anchor){
  hideBubble();
  const b = document.createElement("div"); b.id = "bubble"; b.className = "bubble"; document.body.appendChild(b);
  const rect = anchor.getBoundingClientRect();
  b.style.left = `${rect.left + window.scrollX}px`;
  b.style.top  = `${rect.bottom + window.scrollY}px`;
  b.addEventListener("mouseenter", ()=>clearTimeout(bubbleTimer));
  b.addEventListener("mouseleave", hideBubbleSoon);
  return b;
}

function completeTask(taskId){
  const t = tasksInterval.find(x => String(x.id) === String(taskId));
  if (!t) return;
  const cur = RENDER_TOTAL ?? currentTotal();
  t.anchorTotal = cur != null ? cur : 0;
  t.sinceBase   = 0;
  saveCloudDebounced();
  toast("Task completed");
  route();
}

function showTaskBubble(taskId, anchor){
  const t = tasksInterval.find(x => x.id === taskId);
  if (!t) return;
  const nd = nextDue(t);
  const b  = makeBubble(anchor);
  b.innerHTML = `
    <div class="bubble-title">${t.name}</div>
    <div class="bubble-kv"><span>Interval:</span><span>${t.interval} hrs</span></div>
    <div class="bubble-kv"><span>Last serviced:</span><span>${nd ? nd.since.toFixed(0) : "—"} hrs ago</span></div>
    <div class="bubble-kv"><span>Remain:</span><span>${nd ? nd.remain.toFixed(0) : "—"} hrs</span></div>
    <div class="bubble-kv"><span>Cost:</span><span>${t.price != null ? ("$" + t.price) : "—"}</span></div>
    ${(t.manualLink || t.storeLink) ?
      `<div class="bubble-kv"><span>Links:</span><span>
        ${t.manualLink ? `<a href="${t.manualLink}" target="_blank" rel="noopener">Manual</a>` : ``}
        ${t.manualLink && t.storeLink ? ` · ` : ``}
        ${t.storeLink ? `<a href="${t.storeLink}" target="_blank" rel="noopener">Store</a>` : ``}
      </span></div>` : ``}
    <div class="bubble-actions">
      <button data-bbl-complete="${t.id}">Complete</button>
      <button class="danger" data-bbl-remove="${t.id}">Remove</button>
      <button data-bbl-edit="${t.id}">Edit settings</button>
    </div>`;

  // Action buttons
  b.querySelector("[data-bbl-complete]")?.addEventListener("click", ()=>{
    completeTask(taskId); hideBubble();
  });
  b.querySelector("[data-bbl-remove]")?.addEventListener("click", ()=>{
    tasksInterval = tasksInterval.filter(x => x.id !== taskId);
    saveCloudDebounced(); toast("Removed"); hideBubble(); route();
  });
  b.querySelector("[data-bbl-edit]")?.addEventListener("click", ()=>{
    hideBubble(); openSettingsAndReveal(taskId);
  });

  // NEW: click anywhere on the bubble (except buttons/links) → open Settings for this item
  b.addEventListener("click", (e)=>{
    // Ignore clicks on controls inside the bubble
    if (e.target.closest(".bubble-actions")) return;
    if (e.target.closest("button")) return;
    if (e.target.closest("a")) return;
    hideBubble();
    openSettingsAndReveal(taskId);
  });
}

function showJobBubble(jobId, anchor){
  const b = makeBubble(anchor);
  try{
    const j = cuttingJobs.find(x => String(x.id) === String(jobId));
    if (!j){
      b.innerHTML = `<div class="bubble-title">Job</div><div class="bubble-kv"><span>Info:</span><span>Job not found (id: ${jobId})</span></div>`;
      return;
    }
    const eff = computeJobEfficiency(j);
    const req = computeRequiredDaily(j);
    const baselineRemain = eff.expectedRemaining != null
      ? eff.expectedRemaining
      : Math.max(0, (Number(j.estimateHours)||0) - (eff.expectedHours||0));
    const actualRemain = eff.actualRemaining != null
      ? eff.actualRemaining
      : Math.max(0, (Number(j.estimateHours)||0) - (eff.actualHours||0));
    const deltaRemain = baselineRemain - actualRemain;
    const EPS = 0.05;
    const ahead = deltaRemain > EPS;
    const behind = deltaRemain < -EPS;
    const deltaSummary = ahead ? "Ahead" : (behind ? "Behind" : "On pace");
    const deltaDetail = (ahead || behind)
      ? `${deltaRemain > 0 ? "+" : "−"}${Math.abs(deltaRemain).toFixed(1)} hr`
      : "";
    const showMoney = (ahead || behind) ? eff.gainLoss : 0;
    const sign  = showMoney > 0 ? "+" : (showMoney < 0 ? "−" : "");
    const money = Math.abs(showMoney).toFixed(2);
    const reqCell = (req.requiredPerDay === Infinity)
      ? `<span class="danger">Past due / no days remaining</span>`
      : `${req.requiredPerDay.toFixed(2)} hr/day <span class="muted">(rem ${req.remainingHours.toFixed(1)} hr over ${req.remainingDays} day${req.remainingDays===1?"":"s"})</span>`;
    const noteAuto = eff.usedAutoFromManual
      ? `<div class="small"><strong>Auto from last manual</strong>: continuing at ${DAILY_HOURS} hr/day.</div>`
      : (eff.usedFromStartAuto ? `<div class="small"><strong>Auto</strong>: assuming ${DAILY_HOURS} hr/day from start.</div>` : ``);
    const startTxt = j.startISO ? new Date(j.startISO).toDateString() : "—";
    const dueTxt   = j.dueISO   ? new Date(j.dueISO).toDateString()   : "—";
    b.innerHTML = `
      <div class="bubble-title">${j.name}</div>
      <div class="bubble-kv"><span>Estimate:</span><span>${j.estimateHours} hrs</span></div>
      <div class="bubble-kv"><span>Material:</span><span>${j.material || "—"}</span></div>
      <div class="bubble-kv"><span>Schedule:</span><span>${startTxt} → ${dueTxt}</span></div>
      <div class="bubble-kv"><span>Remaining:</span><span>${actualRemain.toFixed(1)} hr (baseline ${baselineRemain.toFixed(1)} hr)</span></div>
      <div class="bubble-kv"><span>Cost impact:</span><span>${deltaSummary}${deltaDetail ? ` ${deltaDetail}` : ""} → ${sign}$${money} @ $${eff.rate}/hr</span></div>
      <div class="bubble-kv"><span>Required/day:</span><span>${reqCell}</span></div>
      <div class="bubble-kv"><span>Notes:</span><span>${j.notes || "—"}</span></div>
      ${noteAuto}
      <div class="bubble-actions">
        <button type="button" data-bbl-edit-job="${j.id}">Edit</button>
        <button type="button" class="danger" data-bbl-remove-job="${j.id}">Remove</button>
      </div>`;
    b.querySelector("[data-bbl-remove-job]")?.addEventListener("click", ()=>{
      cuttingJobs = cuttingJobs.filter(x=>String(x.id)!==String(j.id)); saveCloudDebounced(); toast("Removed"); hideBubble(); route();
    });
    b.querySelector("[data-bbl-edit-job]")?.addEventListener("click", ()=>{ hideBubble(); openJobsEditor(j.id); });
  }catch(err){
    console.error(err);
    b.innerHTML = `<div class="bubble-title">Error</div><div class="bubble-kv"><span>Details:</span><span>${err.message||err}</span></div>`;
  }
}

function wireCalendarBubbles(){
  const months = $("#months"); if (!months) return;
  let hoverTarget = null;
  months.addEventListener("mouseover", (e)=>{
    const el = e.target.closest("[data-cal-job], [data-cal-task]");
    if (!el || el === hoverTarget) return;
    hoverTarget = el;
    if (el.dataset.calJob)  showJobBubble(el.dataset.calJob, el);
    if (el.dataset.calTask) showTaskBubble(el.dataset.calTask, el);
  });
  months.addEventListener("mouseout", (e)=>{
    const from = e.target.closest("[data-cal-job], [data-cal-task]");
    const to   = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest("[data-cal-job], [data-cal-task]");
    if (from && !to) { hoverTarget = null; hideBubbleSoon(); }
  });
  months.addEventListener("click", (e)=>{
    const el = e.target.closest("[data-cal-job], [data-cal-task]");
    if (!el) return;
    if (el.dataset.calJob)  showJobBubble(el.dataset.calJob, el);
    if (el.dataset.calTask) showTaskBubble(el.dataset.calTask, el);
  });
}

function renderCalendar(){
  const container = $("#months");
  if (!container) return;
  container.innerHTML = "";

  const dueMap = {};
  tasksInterval.forEach(t => {
    const nd = nextDue(t);
    if (!nd) return;
    const key = ymd(nd.due);
    (dueMap[key] ||= []).push({ type:"task", id:String(t.id), name:t.name });
  });

  const jobsMap = {};
  cuttingJobs.forEach(j => {
    if (!j.startISO || !j.dueISO) return;
    const start = new Date(j.startISO), end = new Date(j.dueISO);
    start.setHours(0,0,0,0); end.setHours(0,0,0,0);
    const cur = new Date(start);
    while (cur <= end){
      const key = ymd(cur);
      (jobsMap[key] ||= []).push({ type:"job", id:String(j.id), name:j.name });
      cur.setDate(cur.getDate()+1);
    }
  });

  const today = new Date(); today.setHours(0,0,0,0);
  for (let m=0; m<3; m++){
    const first = new Date(today.getFullYear(), today.getMonth()+m, 1);
    const last  = new Date(today.getFullYear(), today.getMonth()+m+1, 0);

    const monthDiv = document.createElement("div");
    monthDiv.className = "month";

    const head = document.createElement("div");
    head.className = "month-header";
    head.textContent = first.toLocaleDateString(undefined, { year:'numeric', month:'long' });
    monthDiv.appendChild(head);

    const weekdays = document.createElement("div");
    weekdays.className = "weekdays";
    ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d => {
      const el = document.createElement("div"); el.textContent = d; weekdays.appendChild(el);
    });
    monthDiv.appendChild(weekdays);

    const grid = document.createElement("div"); grid.className = "week";

    for (let i=0; i<first.getDay(); i++) grid.appendChild(Object.assign(document.createElement("div"),{className:"day other-month"}));

    for (let day=1; day<=last.getDate(); day++){
      const date = new Date(first.getFullYear(), first.getMonth(), day); date.setHours(0,0,0,0);
      const cell = document.createElement("div"); cell.className = "day"; if (date.getTime()===today.getTime()) cell.classList.add("today");
      cell.innerHTML = `<div class="date">${day}</div>`;
      const key = ymd(date);
      (dueMap[key]||[]).forEach(ev=>{
        const chip = document.createElement("div"); chip.className="event generic cal-task"; chip.dataset.calTask = ev.id; chip.textContent = `${ev.name} (due)`; cell.appendChild(chip);
      });
      (jobsMap[key]||[]).forEach(ev=>{
        const bar = document.createElement("div"); bar.className="job-bar cal-job"; bar.dataset.calJob = ev.id; bar.textContent = ev.name; cell.appendChild(bar);
      });
      grid.appendChild(cell);
    }

    const filled = first.getDay() + last.getDate();
    const rem = filled % 7;
    if (rem !== 0){
      for (let i=0; i<7-rem; i++) grid.appendChild(Object.assign(document.createElement("div"),{className:"day other-month"}));
    }

    monthDiv.appendChild(grid);
    container.appendChild(monthDiv);
  }
  wireCalendarBubbles();
}

