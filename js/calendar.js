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

const DAY_ADD_DELAY_SECONDS = 0.4;
const DAY_ADD_DELAY_MS      = DAY_ADD_DELAY_SECONDS * 1000;
let dayAddHoverTimer   = null;
let dayAddPendingDay   = null;
let dayAddActiveDay    = null;
let dayAddBubbleButton = null;

function clearDayAddTimer(){
  if (dayAddHoverTimer){
    clearTimeout(dayAddHoverTimer);
    dayAddHoverTimer = null;
  }
}

function destroyDayAddBubble(){
  if (dayAddBubbleButton){
    const host = dayAddBubbleButton.parentElement;
    dayAddBubbleButton.remove();
    dayAddBubbleButton = null;
    if (host) host.classList.remove("showing-add-bubble");
  }
  if (dayAddActiveDay){
    dayAddActiveDay.classList.remove("showing-add-bubble");
    dayAddActiveDay = null;
  }
}

function hideDayAddBubble(){
  destroyDayAddBubble();
  clearDayAddTimer();
  dayAddPendingDay = null;
}

function resetDayAddUI(){
  clearDayAddTimer();
  dayAddPendingDay = null;
  destroyDayAddBubble();
}

function showDayAddBubble(dayEl){
  if (!dayEl || dayEl.classList.contains("other-month")) return;
  const iso = dayEl.dataset.dateIso;
  if (!iso) return;
  clearDayAddTimer();
  dayAddPendingDay = null;
  if (dayAddActiveDay === dayEl && dayAddBubbleButton) return;
  destroyDayAddBubble();

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "day-add-bubble";
  btn.textContent = "+";
  btn.dataset.dateIso = iso;
  btn.addEventListener("click", (evt)=>{
    evt.stopPropagation();
    const open = window.openDashboardAddPicker;
    if (typeof open === "function"){
      open({ dateISO: iso });
    }
    hideDayAddBubble();
  });
  btn.addEventListener("mouseenter", ()=> clearDayAddTimer());
  btn.addEventListener("mouseleave", (evt)=>{
    const toDay = evt.relatedTarget && evt.relatedTarget.closest && evt.relatedTarget.closest(".day");
    if (toDay === dayEl) return;
    hideDayAddBubble();
  });

  dayEl.appendChild(btn);
  dayEl.classList.add("showing-add-bubble");
  requestAnimationFrame(()=> btn.classList.add("is-visible"));

  dayAddBubbleButton = btn;
  dayAddActiveDay    = dayEl;
}

function scheduleDayAddBubble(dayEl){
  if (!dayEl || dayEl.classList.contains("other-month")) return;
  if (!dayEl.dataset.dateIso) return;
  if (dayAddActiveDay === dayEl) return;
  if (dayAddPendingDay === dayEl) return;
  clearDayAddTimer();
  dayAddPendingDay = dayEl;
  dayAddHoverTimer = setTimeout(()=>{
    if (dayAddPendingDay === dayEl) showDayAddBubble(dayEl);
  }, DAY_ADD_DELAY_MS);
}

function handleDayMouseOver(e){
  const day = e.target.closest && e.target.closest(".day");
  if (!day) return;
  if (day.classList.contains("other-month")) return;
  if (!day.dataset.dateIso) return;
  scheduleDayAddBubble(day);
}

function handleDayMouseOut(e){
  const from = e.target.closest && e.target.closest(".day");
  if (!from) return;
  const toDay = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".day");
  if (toDay === from) return;
  if (dayAddPendingDay === from){
    dayAddPendingDay = null;
    clearDayAddTimer();
  }
  const enteringBubble = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".day-add-bubble");
  if (enteringBubble && from === dayAddActiveDay) return;
  if (dayAddActiveDay === from){
    hideDayAddBubble();
  }
}

function handleMonthsMouseLeave(){
  resetDayAddUI();
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

function showDownBubble(dateISO, anchor){
  hideDayAddBubble();
  const b = makeBubble(anchor);
  const parsed = dateISO ? new Date(`${dateISO}T00:00:00`) : null;
  const label = parsed && !isNaN(parsed.getTime()) ? parsed.toLocaleDateString() : (dateISO || "—");
  b.innerHTML = `
    <div class="bubble-title">Down time</div>
    <div class="bubble-kv"><span>Date:</span><span>${label}</span></div>
    <div class="bubble-actions">
      <button type="button" class="danger" data-bbl-remove-down="${dateISO}">Remove</button>
    </div>`;

  b.querySelector("[data-bbl-remove-down]")?.addEventListener("click", ()=>{
    const iso = dateISO;
    let handled = false;
    if (typeof window.dashboardRemoveDownTime === "function"){
      window.dashboardRemoveDownTime(iso);
      handled = true;
    }else if (Array.isArray(window.downTimes)){
      const arr = window.downTimes;
      const idx = arr.findIndex(dt => {
        if (!dt) return false;
        if (typeof dt === "string") return dt === iso;
        return dt.dateISO === iso;
      });
      if (idx >= 0){
        arr.splice(idx,1);
        if (typeof saveCloudDebounced === "function") saveCloudDebounced();
        if (typeof toast === "function") toast("Down time removed");
        if (typeof renderCalendar === "function") renderCalendar();
        handled = true;
      }
    }
    if (!handled && typeof toast === "function"){
      toast("Unable to remove down time");
    }
    hideBubble();
  });
}

function wireCalendarBubbles(){
  const months = $("#months"); if (!months) return;
  if (months.dataset.bubblesWired === "1") return;
  months.dataset.bubblesWired = "1";
  let hoverTarget = null;
  months.addEventListener("mouseover", (e)=>{
    handleDayMouseOver(e);
    const el = e.target.closest("[data-cal-job], [data-cal-task]");
    if (!el || el === hoverTarget) return;
    hoverTarget = el;
    if (el.dataset.calJob)  showJobBubble(el.dataset.calJob, el);
    if (el.dataset.calTask) showTaskBubble(el.dataset.calTask, el);
  });
  months.addEventListener("mouseout", (e)=>{
    handleDayMouseOut(e);
    const from = e.target.closest("[data-cal-job], [data-cal-task]");
    const to   = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest("[data-cal-job], [data-cal-task]");
    if (from && !to) { hoverTarget = null; hideBubbleSoon(); }
  });
  months.addEventListener("mouseleave", handleMonthsMouseLeave);
  months.addEventListener("click", (e)=>{
    const el = e.target.closest("[data-cal-job], [data-cal-task], [data-cal-down]");
    if (!el) return;
    if (el.dataset.calJob)  showJobBubble(el.dataset.calJob, el);
    if (el.dataset.calTask) showTaskBubble(el.dataset.calTask, el);
    if (el.dataset.calDown) showDownBubble(el.dataset.calDown, el);
  });
}

function renderCalendar(){
  const container = $("#months");
  if (!container) return;
  resetDayAddUI();
  hideBubble();
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

  const downTimeSet = new Set(
    Array.isArray(window.downTimes)
      ? window.downTimes.map(dt => {
          if (!dt) return null;
          if (typeof dt === "string") return dt;
          if (typeof dt.dateISO === "string") return dt.dateISO;
          return null;
        }).filter(Boolean)
      : []
  );

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
      const cell = document.createElement("div");
      cell.className = "day";
      if (date.getTime()===today.getTime()) cell.classList.add("today");
      const key = ymd(date);
      cell.dataset.dateIso = key;
      cell.innerHTML = `<div class="date">${day}</div>`;
      if (downTimeSet.has(key)){
        cell.classList.add("downtime");
        cell.dataset.calDown = key;
      }
      (dueMap[key]||[]).forEach(ev=>{
        const chip = document.createElement("div"); chip.className="event generic cal-task"; chip.dataset.calTask = ev.id; chip.textContent = `${ev.name} (due)`; cell.appendChild(chip);
      });
      (jobsMap[key]||[]).forEach(ev=>{
        const bar = document.createElement("div"); bar.className="job-bar cal-job"; bar.dataset.calJob = ev.id; bar.textContent = ev.name; cell.appendChild(bar);
      });
      if (downTimeSet.has(key)){
        const tag = document.createElement("div");
        tag.className = "event downtime";
        tag.textContent = "Down time";
        tag.dataset.calDown = key;
        cell.appendChild(tag);
      }
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

