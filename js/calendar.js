/* ================== CALENDAR & BUBBLES ===================== */
let bubbleTimer = null;
const CALENDAR_DAY_MS = 24 * 60 * 60 * 1000;

function hideBubble(){
  if (bubbleTimer){
    clearTimeout(bubbleTimer);
    bubbleTimer = null;
  }
  const b = document.getElementById("bubble");
  if (b) b.remove();
}
function hideBubbleSoon(){ clearTimeout(bubbleTimer); bubbleTimer = setTimeout(hideBubble, 180); }
function triggerDashboardAddPicker(opts){
  const detail = (opts && typeof opts === "object") ? { ...opts } : {};
  if (typeof window.openDashboardAddPicker === "function"){
    window.openDashboardAddPicker(detail);
    return;
  }
  if (!Array.isArray(window.__pendingDashboardAddRequests)){
    window.__pendingDashboardAddRequests = [];
  }
  window.__pendingDashboardAddRequests.push(detail);
}

function escapeHtml(str){
  return String(str || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c] || c);
}

function findCalendarTaskMeta(taskId){
  const tid = String(taskId);
  const intervalList = Array.isArray(window.tasksInterval) ? window.tasksInterval : [];
  let index = intervalList.findIndex(t => t && String(t.id) === tid);
  if (index >= 0){
    return { task: intervalList[index], mode: "interval", list: intervalList, index };
  }
  const asReqList = Array.isArray(window.tasksAsReq) ? window.tasksAsReq : [];
  index = asReqList.findIndex(t => t && String(t.id) === tid);
  if (index >= 0){
    return { task: asReqList[index], mode: "asreq", list: asReqList, index };
  }
  return null;
}

function normalizeDateKey(value){
  if (!value) return null;
  if (value instanceof Date) return ymd(value);
  if (typeof value === "string"){
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = parseDateLocal(value);
    if (parsed instanceof Date && !Number.isNaN(parsed.getTime())){
      parsed.setHours(0,0,0,0);
      return ymd(parsed);
    }
  }
  return null;
}

function markCalendarTaskComplete(meta, dateISO){
  if (!meta || !meta.task) return false;
  const key = normalizeDateKey(dateISO || new Date());
  if (!key) return false;
  const task = meta.task;
  const mode = meta.mode === "asreq" || task.mode === "asreq" ? "asreq" : "interval";
  let changed = false;

  if (mode === "interval"){
    const currentHoursRaw = typeof getCurrentMachineHours === "function" ? getCurrentMachineHours() : null;
    const currentHours = currentHoursRaw != null && Number.isFinite(Number(currentHoursRaw)) ? Number(currentHoursRaw) : null;
    if (currentHours != null){
      task.anchorTotal = currentHours;
    }
    task.sinceBase = 0;

    if (!Array.isArray(task.completedDates)) task.completedDates = [];
    if (!task.completedDates.includes(key)){
      task.completedDates.push(key);
      task.completedDates.sort();
      changed = true;
    }

    const history = typeof ensureTaskManualHistory === "function"
      ? ensureTaskManualHistory(task)
      : (Array.isArray(task.manualHistory) ? task.manualHistory : []);
    const defaultDaily = (typeof DAILY_HOURS === "number" && Number.isFinite(DAILY_HOURS) && DAILY_HOURS > 0)
      ? Number(DAILY_HOURS)
      : 8;
    let entry = history.find(item => item && normalizeDateKey(item.dateISO) === key);
    if (!entry){
      entry = {
        dateISO: key,
        hoursAtEntry: null,
        recordedAtISO: new Date().toISOString(),
        status: "completed",
        source: "estimate",
        estimatedDailyHours: defaultDaily
      };
      history.push(entry);
      changed = true;
    }else{
      if (entry.status !== "completed"){ entry.status = "completed"; changed = true; }
      entry.recordedAtISO = new Date().toISOString();
      if (entry.estimatedDailyHours == null) entry.estimatedDailyHours = defaultDaily;
    }

    const snapshotHours = typeof hoursSnapshotOnOrBefore === "function" ? hoursSnapshotOnOrBefore(key) : null;
    if (snapshotHours != null && Number.isFinite(Number(snapshotHours))){
      entry.hoursAtEntry = Number(snapshotHours);
      entry.source = "machine";
    }else if (entry.hoursAtEntry != null && !Number.isFinite(Number(entry.hoursAtEntry))){
      entry.hoursAtEntry = null;
    }

    history.sort((a,b)=> String(a?.dateISO || "").localeCompare(String(b?.dateISO || "")));
    task.manualHistory = history;

    if (!task.calendarDateISO || normalizeDateKey(task.calendarDateISO) === key){
      task.calendarDateISO = key;
    }
    changed = true;
  }else{
    if (!Array.isArray(task.completedDates)) task.completedDates = [];
    if (!task.completedDates.includes(key)){
      task.completedDates.push(key);
      task.completedDates.sort();
      changed = true;
    }
    if (normalizeDateKey(task.calendarDateISO) !== key){
      task.calendarDateISO = key;
      changed = true;
    }
  }

  return changed;
}

function unmarkCalendarTaskComplete(meta, dateISO){
  if (!meta || !meta.task) return false;
  const key = normalizeDateKey(dateISO);
  if (!key) return false;
  const task = meta.task;
  const mode = meta.mode === "asreq" || task.mode === "asreq" ? "asreq" : "interval";
  let changed = false;

  if (Array.isArray(task.completedDates)){
    const idx = task.completedDates.indexOf(key);
    if (idx >= 0){
      task.completedDates.splice(idx,1);
      changed = true;
    }
  }

  if (mode === "interval"){
    const defaultDaily = (typeof DAILY_HOURS === "number" && Number.isFinite(DAILY_HOURS) && DAILY_HOURS > 0)
      ? Number(DAILY_HOURS)
      : 8;
    const history = typeof ensureTaskManualHistory === "function"
      ? ensureTaskManualHistory(task)
      : (Array.isArray(task.manualHistory) ? task.manualHistory : []);
    let entry = history.find(item => item && normalizeDateKey(item.dateISO) === key);
    const nowIso = new Date().toISOString();
    if (!entry){
      entry = {
        dateISO: key,
        hoursAtEntry: null,
        recordedAtISO: nowIso,
        status: "scheduled",
        source: "estimate",
        estimatedDailyHours: defaultDaily
      };
      history.push(entry);
      changed = true;
    }else{
      if (entry.status !== "scheduled"){
        entry.status = "scheduled";
        changed = true;
      }
      if (entry.estimatedDailyHours == null && defaultDaily != null){
        entry.estimatedDailyHours = defaultDaily;
        changed = true;
      }
      entry.recordedAtISO = nowIso;
    }
    history.sort((a,b)=> String(a?.dateISO || "").localeCompare(String(b?.dateISO || "")));
    task.manualHistory = history;
    applyIntervalBaseline(task, { baselineHours: null, currentHours: typeof getCurrentMachineHours === "function" ? getCurrentMachineHours() : undefined });
  }

  return changed;
}

function removeCalendarTaskOccurrence(meta, dateISO){
  if (!meta || !meta.task) return false;
  const key = normalizeDateKey(dateISO);
  if (!key) return false;
  const task = meta.task;
  const mode = meta.mode === "asreq" || task.mode === "asreq" ? "asreq" : "interval";
  let changed = false;

  if (mode === "interval"){
    const history = typeof ensureTaskManualHistory === "function"
      ? ensureTaskManualHistory(task)
      : (Array.isArray(task.manualHistory) ? task.manualHistory : []);
    for (let i = history.length - 1; i >= 0; i--){
      const entry = history[i];
      if (entry && normalizeDateKey(entry.dateISO) === key){
        history.splice(i,1);
        changed = true;
      }
    }
    if (changed){
      task.manualHistory = history;
    }
    if (Array.isArray(task.completedDates)){
      const idx = task.completedDates.indexOf(key);
      if (idx >= 0){
        task.completedDates.splice(idx,1);
        changed = true;
      }
    }
    if (normalizeDateKey(task.calendarDateISO) === key){
      task.calendarDateISO = null;
      changed = true;
    }
    if (changed){
      applyIntervalBaseline(task, { baselineHours: null, currentHours: typeof getCurrentMachineHours === "function" ? getCurrentMachineHours() : undefined });
    }
  }else{
    if (normalizeDateKey(task.calendarDateISO) === key){
      task.calendarDateISO = null;
      changed = true;
    }
    if (Array.isArray(task.completedDates)){
      const idx = task.completedDates.indexOf(key);
      if (idx >= 0){
        task.completedDates.splice(idx,1);
        changed = true;
      }
    }
  }

  return changed;
}

function removeCalendarTaskEverywhere(meta){
  if (!meta || !meta.list || typeof meta.index !== "number" || meta.index < 0) return false;
  const list = meta.list;
  list.splice(meta.index, 1);
  if (meta.mode === "asreq"){
    window.tasksAsReq = list;
  }else{
    window.tasksInterval = list;
  }
  return true;
}

function getGarnetEntries(){
  if (!Array.isArray(window.garnetCleanings)) window.garnetCleanings = [];
  return window.garnetCleanings;
}

function formatGarnetTime(value){
  const normalized = normalizeTimeString(value);
  if (!normalized) return "—";
  const [hhStr, mmStr] = normalized.split(":");
  const hh = Number(hhStr);
  const suffix = hh >= 12 ? "PM" : "AM";
  const hour12 = ((hh + 11) % 12) + 1;
  return `${hour12}:${mmStr} ${suffix}`;
}

function formatGarnetRange(start, end){
  const startTxt = formatGarnetTime(start);
  const endTxt = formatGarnetTime(end);
  return `${startTxt} – ${endTxt}`;
}
function makeBubble(anchor){
  clearTimeout(bubbleTimer);
  bubbleTimer = null;
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
  const meta = findCalendarTaskMeta(taskId);
  if (!meta) return;
  const todayKey = normalizeDateKey(new Date());
  if (!todayKey) return;
  const changed = markCalendarTaskComplete(meta, todayKey);
  if (changed){
    saveCloudDebounced();
    toast("Task completed");
    route();
  }
}

function showTaskBubble(taskId, anchor, options = {}){
  const statusHint = options.status || anchor?.getAttribute("data-cal-status") || null;
  const modeHint = options.mode || anchor?.getAttribute("data-cal-mode") || null;
  const dateHint = options.dateISO || anchor?.getAttribute("data-cal-date") || anchor?.closest(".day")?.dataset.dateIso || null;
  const meta = findCalendarTaskMeta(taskId);
  if (!meta || !meta.task) return;
  const task = meta.task;
  const mode = modeHint === "asreq" || meta.mode === "asreq" || task.mode === "asreq" ? "asreq" : "interval";
  const dateKey = normalizeDateKey(dateHint);
  const displayDate = dateKey ? (()=>{
    const parsed = parseDateLocal(dateKey);
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed.toDateString() : dateKey;
  })() : null;

  const completedSet = new Set(Array.isArray(task.completedDates) ? task.completedDates.map(normalizeDateKey).filter(Boolean) : []);
  const normalizedStatus = statusHint || (completedSet.has(dateKey || "") ? "completed" : (mode === "asreq" && dateKey ? "manual" : "due"));
  const isCompleted = !!(dateKey && completedSet.has(dateKey)) || normalizedStatus === "completed";
  const history = typeof ensureTaskManualHistory === "function"
    ? ensureTaskManualHistory(task)
    : (Array.isArray(task.manualHistory) ? task.manualHistory : []);
  const hasHistoryEntry = !!(dateKey && history.some(entry => entry && normalizeDateKey(entry.dateISO) === dateKey));
  const manualDateMatches = dateKey && normalizeDateKey(task.calendarDateISO) === dateKey;
  const canRemoveOccurrence = !!dateKey && (manualDateMatches || isCompleted || hasHistoryEntry);
  const canMarkComplete = !!dateKey && !isCompleted;
  const canUnmarkComplete = !!dateKey && isCompleted;

  const statusLabel = isCompleted
    ? "Completed"
    : (normalizedStatus === "manual" ? "Scheduled" : normalizedStatus === "due" ? "Projected" : "Scheduled");

  const infoParts = [];
  infoParts.push(`<div class="bubble-title">${escapeHtml(task.name || "Task")}</div>`);
  if (displayDate){
    infoParts.push(`<div class="bubble-kv"><span>Date:</span><span>${escapeHtml(displayDate)}</span></div>`);
  }
  if (mode === "interval"){
    infoParts.push(`<div class="bubble-kv"><span>Interval:</span><span>${task.interval != null ? escapeHtml(`${task.interval} hrs`) : "—"}</span></div>`);
    const nd = typeof nextDue === "function" ? nextDue(task) : null;
    infoParts.push(`<div class="bubble-kv"><span>Status:</span><span>${escapeHtml(statusLabel)}</span></div>`);
    infoParts.push(`<div class="bubble-kv"><span>Last serviced:</span><span>${nd ? escapeHtml(`${nd.since.toFixed(0)} hrs ago`) : "—"}</span></div>`);
    infoParts.push(`<div class="bubble-kv"><span>Remain:</span><span>${nd ? escapeHtml(`${nd.remain.toFixed(0)} hrs`) : "—"}</span></div>`);
    infoParts.push(`<div class="bubble-kv"><span>Cost:</span><span>${task.price != null ? escapeHtml(`$${task.price}`) : "—"}</span></div>`);
  }else{
    infoParts.push(`<div class="bubble-kv"><span>Status:</span><span>${escapeHtml(statusLabel)}</span></div>`);
    infoParts.push(`<div class="bubble-kv"><span>Condition:</span><span>${escapeHtml(task.condition || "As required")}</span></div>`);
  }

  if (task.manualLink || task.storeLink){
    const links = [];
    if (task.manualLink) links.push(`<a href="${task.manualLink}" target="_blank" rel="noopener">Manual</a>`);
    if (task.storeLink) links.push(`<a href="${task.storeLink}" target="_blank" rel="noopener">Store</a>`);
    infoParts.push(`<div class="bubble-kv"><span>Links:</span><span>${links.join(" · ")}</span></div>`);
  }

  const actions = [];
  if (canMarkComplete){
    actions.push(`<button data-bbl-complete>Mark complete</button>`);
  }
  if (canUnmarkComplete){
    actions.push(`<button data-bbl-uncomplete>Unmark complete</button>`);
  }
  if (canRemoveOccurrence){
    actions.push(`<button class="secondary" data-bbl-remove-occurrence>Remove occurrence</button>`);
  }
  actions.push(`<button data-bbl-edit>Edit settings</button>`);
  actions.push(`<button class="danger" data-bbl-remove-task>Remove task</button>`);

  const b  = makeBubble(anchor);
  b.innerHTML = `${infoParts.join("")}<div class="bubble-actions">${actions.join("")}</div>`;

  const targetKey = dateKey || normalizeDateKey(new Date());

  b.querySelector("[data-bbl-complete]")?.addEventListener("click", ()=>{
    const changed = markCalendarTaskComplete(meta, targetKey);
    if (changed){
      saveCloudDebounced();
      toast("Task marked complete");
      hideBubble();
      route();
    }
  });

  b.querySelector("[data-bbl-uncomplete]")?.addEventListener("click", ()=>{
    const changed = unmarkCalendarTaskComplete(meta, targetKey);
    if (changed){
      saveCloudDebounced();
      toast("Completion removed");
      hideBubble();
      route();
    }
  });

  b.querySelector("[data-bbl-remove-occurrence]")?.addEventListener("click", ()=>{
    const shouldRemove = window.confirm ? window.confirm("Remove this occurrence from the calendar?") : true;
    if (!shouldRemove) return;
    const changed = removeCalendarTaskOccurrence(meta, targetKey);
    if (changed){
      saveCloudDebounced();
      toast("Removed from calendar");
      hideBubble();
      route();
    }
  });

  b.querySelector("[data-bbl-remove-task]")?.addEventListener("click", ()=>{
    try {
      if (typeof recordDeletedItem === "function"){
        recordDeletedItem("task", task, { list: mode, cat: task?.cat ?? null, parentTask: task?.parentTask ?? null });
      }
    } catch (err) {
      console.warn("Failed to record deleted task from calendar", err);
    }
    if (removeCalendarTaskEverywhere(meta)){
      saveCloudDebounced();
      toast("Task removed");
      hideBubble();
      route();
    }
  });

  b.querySelector("[data-bbl-edit]")?.addEventListener("click", ()=>{
    hideBubble();
    openSettingsAndReveal(taskId);
  });

  b.addEventListener("click", (e)=>{
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
    const active = cuttingJobs.find(x => String(x.id) === String(jobId));
    const completedJobs = Array.isArray(window.completedCuttingJobs) ? window.completedCuttingJobs : [];
    const completed = completedJobs.find(x => String(x?.id) === String(jobId));
    if (!active && !completed){
      b.innerHTML = `<div class="bubble-title">Job</div><div class="bubble-kv"><span>Info:</span><span>Job not found (id: ${jobId})</span></div>`;
      return;
    }
    if (!active && completed){
      const finishedDate = completed.completedAtISO ? parseDateLocal(completed.completedAtISO) : null;
      const finishedText = finishedDate ? finishedDate.toDateString() : "—";
      const estimateVal = Number(completed.estimateHours);
      const actualVal = Number(completed.actualHours);
      const estimateText = Number.isFinite(estimateVal) ? `${estimateVal.toFixed(1)} hr` : "—";
      const actualText = Number.isFinite(actualVal) ? `${actualVal.toFixed(1)} hr` : "—";
      const materialText = completed.material ? escapeHtml(completed.material) : "—";
      const dueText = completed.dueISO ? (parseDateLocal(completed.dueISO)?.toDateString() || "—") : "—";
      const startText = completed.startISO ? (parseDateLocal(completed.startISO)?.toDateString() || "—") : "—";
      const gainLossRaw = completed.efficiency && completed.efficiency.gainLoss != null ? Number(completed.efficiency.gainLoss) : null;
      const gainLossText = Number.isFinite(gainLossRaw)
        ? `${gainLossRaw >= 0 ? "+" : "−"}$${Math.abs(gainLossRaw).toFixed(2)}`
        : "—";
      const rateValRaw = completed && completed.efficiency ? completed.efficiency.rate : null;
      const rateVal = Number(rateValRaw);
      const rateText = Number.isFinite(rateVal) ? `$${rateVal.toFixed(2)}/hr` : "—";
      const notesHtml = completed.notes ? `<div class="bubble-kv"><span>Notes:</span><span>${escapeHtml(completed.notes)}</span></div>` : "";
      const gainLossHtml = Number.isFinite(gainLossRaw)
        ? `${escapeHtml(gainLossText)}${rateText !== "—" ? ` <span class="muted">@ ${escapeHtml(rateText)}</span>` : ""}`
        : "—";
      b.innerHTML = `
        <div class="bubble-title">${escapeHtml(completed.name || "Completed job")}</div>
        <div class="bubble-kv"><span>Status:</span><span>Completed</span></div>
        <div class="bubble-kv"><span>Finished:</span><span>${escapeHtml(finishedText)}</span></div>
        <div class="bubble-kv"><span>Schedule:</span><span>${escapeHtml(startText)} → ${escapeHtml(dueText)}</span></div>
        <div class="bubble-kv"><span>Estimate:</span><span>${escapeHtml(estimateText)}</span></div>
        <div class="bubble-kv"><span>Actual hours:</span><span>${escapeHtml(actualText)}</span></div>
        <div class="bubble-kv"><span>Material:</span><span>${materialText}</span></div>
        <div class="bubble-kv"><span>Gain / loss:</span><span>${gainLossHtml}</span></div>
        ${notesHtml}`;
      return;
    }
    const j = active;
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
      : `${req.requiredPerDay.toFixed(2)} hr/day needed to meet goal <span class="muted">(rem ${req.remainingHours.toFixed(1)} hr over ${req.remainingDays} day${req.remainingDays===1?"":"s"})</span>`;
    const noteAuto = eff.usedAutoFromManual
      ? `<div class="small"><strong>Auto from last manual</strong>: continuing at ${DAILY_HOURS} hr/day.</div>`
      : (eff.usedFromStartAuto ? `<div class="small"><strong>Auto</strong>: assuming ${DAILY_HOURS} hr/day from start.</div>` : ``);
    const startDate = parseDateLocal(j.startISO);
    const dueDate   = parseDateLocal(j.dueISO);
    const startTxt  = startDate ? startDate.toDateString() : "—";
    const dueTxt    = dueDate   ? dueDate.toDateString()   : "—";
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
      try {
        if (typeof recordDeletedItem === "function"){
          recordDeletedItem("job", j, {});
        }
      } catch (err) {
        console.warn("Failed to record deleted job from calendar", err);
      }
      cuttingJobs = cuttingJobs.filter(x=>String(x.id)!==String(j.id)); saveCloudDebounced(); toast("Removed"); hideBubble(); route();
    });
    b.querySelector("[data-bbl-edit-job]")?.addEventListener("click", ()=>{ hideBubble(); openJobsEditor(j.id); });
  }catch(err){
    console.error(err);
    b.innerHTML = `<div class="bubble-title">Error</div><div class="bubble-kv"><span>Details:</span><span>${err.message||err}</span></div>`;
  }
}

function toggleGarnetComplete(id){
  const entries = getGarnetEntries();
  const entry = entries.find(item => String(item.id) === String(id));
  if (!entry) return;
  entry.completed = !entry.completed;
  saveCloudDebounced();
  toast(entry.completed ? "Garnet cleaning completed" : "Marked as scheduled");
  renderCalendar();
  if (typeof window.__dashRefreshGarnetList === "function") window.__dashRefreshGarnetList();
}

function removeGarnetEntry(id){
  const entries = getGarnetEntries();
  const idx = entries.findIndex(item => String(item.id) === String(id));
  if (idx < 0) return;
  try {
    if (typeof recordDeletedItem === "function"){ recordDeletedItem("garnet", entries[idx], {}); }
  } catch (err) {
    console.warn("Failed to record deleted garnet entry", err);
  }
  entries.splice(idx,1);
  saveCloudDebounced();
  toast("Garnet cleaning removed");
  renderCalendar();
  if (typeof window.__dashRefreshGarnetList === "function") window.__dashRefreshGarnetList();
}

function showGarnetBubble(garnetId, anchor){
  const entries = getGarnetEntries();
  const entry = entries.find(item => String(item.id) === String(garnetId));
  if (!entry) return;
  const b = makeBubble(anchor);
  const date = parseDateLocal(entry.dateISO);
  const dateText = date ? date.toDateString() : (entry.dateISO || "—");
  const rangeText = formatGarnetRange(entry.startTime, entry.endTime);
  const statusText = entry.completed ? "Complete" : "Scheduled";
  const completeLabel = entry.completed ? "Mark as incomplete" : "Mark as complete";
  b.innerHTML = `
    <div class="bubble-title">Garnet Cleaning</div>
    <div class="bubble-kv"><span>Date:</span><span>${escapeHtml(dateText)}</span></div>
    <div class="bubble-kv"><span>Time:</span><span>${escapeHtml(rangeText)}</span></div>
    <div class="bubble-kv"><span>Status:</span><span>${escapeHtml(statusText)}</span></div>
    ${entry.note ? `<div class="bubble-kv"><span>Note:</span><span>${escapeHtml(entry.note)}</span></div>` : ""}
    <div class="bubble-actions">
      <button data-garnet-complete="${escapeHtml(String(entry.id))}">${escapeHtml(completeLabel)}</button>
      <button data-garnet-edit="${escapeHtml(String(entry.id))}">Edit</button>
      <button class="danger" data-garnet-remove="${escapeHtml(String(entry.id))}">Remove</button>
    </div>`;

  b.querySelector("[data-garnet-complete]")?.addEventListener("click", ()=>{
    toggleGarnetComplete(entry.id);
    hideBubble();
  });
  b.querySelector("[data-garnet-remove]")?.addEventListener("click", ()=>{
    removeGarnetEntry(entry.id);
    hideBubble();
  });
  b.querySelector("[data-garnet-edit]")?.addEventListener("click", ()=>{
    hideBubble();
    triggerDashboardAddPicker({ step:"garnet", garnetId: entry.id, dateISO: entry.dateISO });
  });
  b.addEventListener("click", (e)=>{
    if (e.target.closest(".bubble-actions")) return;
    if (e.target.closest("button")) return;
    if (e.target.closest("a")) return;
    hideBubble();
    triggerDashboardAddPicker({ step:"garnet", garnetId: entry.id, dateISO: entry.dateISO });
  });
}

function wireCalendarBubbles(){
  const months = $("#months"); if (!months) return;
  let hoverTarget = null;
  const extractTaskOptions = (el)=>{
    if (!el) return {};
    return {
      status: el.getAttribute("data-cal-status") || null,
      mode: el.getAttribute("data-cal-mode") || null,
      dateISO: el.getAttribute("data-cal-date") || el.closest(".day")?.dataset.dateIso || null
    };
  };

  months.addEventListener("mouseover", (e)=>{
    const el = e.target.closest("[data-cal-job], [data-cal-task], [data-cal-garnet]");
    if (!el || el === hoverTarget) return;
    hoverTarget = el;
    if (el.dataset.calJob)  showJobBubble(el.dataset.calJob, el);
    if (el.dataset.calTask) showTaskBubble(el.dataset.calTask, el, extractTaskOptions(el));
    if (el.dataset.calGarnet) showGarnetBubble(el.dataset.calGarnet, el);
  });
  months.addEventListener("mouseout", (e)=>{
    const from = e.target.closest("[data-cal-job], [data-cal-task], [data-cal-garnet]");
    const to   = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest("[data-cal-job], [data-cal-task], [data-cal-garnet]");
    if (from && !to) { hoverTarget = null; hideBubbleSoon(); }
  });
  months.addEventListener("click", (e)=>{
    const el = e.target.closest("[data-cal-job], [data-cal-task], [data-cal-garnet]");
    if (!el) return;
    if (el.dataset.calJob)  showJobBubble(el.dataset.calJob, el);
    if (el.dataset.calTask) showTaskBubble(el.dataset.calTask, el, extractTaskOptions(el));
    if (el.dataset.calGarnet) showGarnetBubble(el.dataset.calGarnet, el);
  });
}

function estimateIntervalDailyHours(task, baselineEntry, today){
  const defaultHours = (typeof DAILY_HOURS === "number" && Number.isFinite(DAILY_HOURS) && DAILY_HOURS > 0)
    ? Number(DAILY_HOURS)
    : 8;
  if (!baselineEntry) return defaultHours;
  const baseDate = baselineEntry.dateISO ? parseDateLocal(baselineEntry.dateISO) : null;
  const baseHours = baselineEntry.hoursAtEntry != null ? Number(baselineEntry.hoursAtEntry) : null;
  const currentHours = typeof getCurrentMachineHours === "function" ? getCurrentMachineHours() : null;
  if (baseDate instanceof Date && !Number.isNaN(baseDate.getTime())){
    baseDate.setHours(0,0,0,0);
    const diffMs = today.getTime() - baseDate.getTime();
    if (diffMs > 0 && Number.isFinite(baseHours) && currentHours != null && Number.isFinite(currentHours)){
      const diffDays = diffMs / CALENDAR_DAY_MS;
      if (diffDays > 0){
        const diffHours = Math.max(0, Number(currentHours) - baseHours);
        const rate = diffHours / diffDays;
        if (Number.isFinite(rate) && rate > 0){
          return rate;
        }
      }
    }
  }
  if (baselineEntry.estimatedDailyHours != null){
    const est = Number(baselineEntry.estimatedDailyHours);
    if (Number.isFinite(est) && est > 0) return est;
  }
  return defaultHours;
}

function projectIntervalDueDates(task, options = {}){
  if (!task || task.mode !== "interval") return [];
  const interval = Number(task.interval);
  if (!Number.isFinite(interval) || interval <= 0) return [];

  const today = new Date(); today.setHours(0,0,0,0);

  let manualHistory = [];
  if (typeof ensureTaskManualHistory === "function"){
    try {
      manualHistory = ensureTaskManualHistory(task).slice();
    } catch (err){
      console.warn("Failed to normalize manual history for schedule projection", err);
      manualHistory = Array.isArray(task.manualHistory) ? task.manualHistory.slice() : [];
    }
  }else{
    manualHistory = Array.isArray(task.manualHistory) ? task.manualHistory.slice() : [];
  }

  manualHistory.sort((a,b)=> String(a?.dateISO || "").localeCompare(String(b?.dateISO || "")));

  let baselineEntry = null;
  for (let i = manualHistory.length - 1; i >= 0; i--){
    const entry = manualHistory[i];
    if (!entry || typeof entry.dateISO !== "string") continue;
    baselineEntry = entry;
    break;
  }

  const hasBaseline = baselineEntry
    || (typeof task.calendarDateISO === "string" && task.calendarDateISO)
    || (Array.isArray(task.completedDates) && task.completedDates.length > 0);
  if (!hasBaseline) return [];

  let baseDate = baselineEntry?.dateISO ? parseDateLocal(baselineEntry.dateISO) : null;
  if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())){
    baseDate = task.calendarDateISO ? parseDateLocal(task.calendarDateISO) : null;
  }
  if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())){
    const completed = Array.isArray(task.completedDates) ? task.completedDates.slice().sort() : [];
    const lastCompleted = completed.length ? completed[completed.length - 1] : null;
    baseDate = lastCompleted ? parseDateLocal(lastCompleted) : null;
  }
  if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())){
    baseDate = new Date(today);
  }
  baseDate.setHours(0,0,0,0);

  const hoursPerDay = estimateIntervalDailyHours(task, baselineEntry, today);
  const intervalDays = interval / hoursPerDay;
  if (!Number.isFinite(intervalDays) || intervalDays <= 0) return [];

  const baseTime = baseDate.getTime();
  const intervalMs = intervalDays * CALENDAR_DAY_MS;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return [];

  const monthsAheadRaw = Number(options.monthsAhead);
  const monthsAhead = Number.isFinite(monthsAheadRaw) && monthsAheadRaw > 0 ? monthsAheadRaw : 3;
  const horizon = new Date(today); horizon.setMonth(horizon.getMonth() + monthsAhead);

  const events = [];
  const seen = new Set();
  const maxIterations = 240;

  for (let idx = 1; idx <= maxIterations; idx++){
    const dueTime = baseTime + (idx * intervalMs);
    if (!Number.isFinite(dueTime)) break;
    const dueDate = new Date(dueTime);
    dueDate.setHours(0,0,0,0);
    const key = ymd(dueDate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    events.push({ dateISO: key, dueDate });
    if (dueDate > horizon && dueDate > today){
      break;
    }
  }

  if (!events.length){
    const fallbackDue = new Date(baseTime + intervalMs);
    fallbackDue.setHours(0,0,0,0);
    const key = ymd(fallbackDue);
    if (key) events.push({ dateISO: key, dueDate: fallbackDue });
  }

  events.sort((a,b)=> a.dateISO.localeCompare(b.dateISO));
  return events;
}

function renderCalendar(){
  const container = $("#months");
  if (!container) return;
  container.innerHTML = "";

  const dueMap = {};
  function pushTaskEvent(task, iso, status){
    if (!task || !iso) return;
    const key = ymd(iso);
    if (!key) return;
    const events = dueMap[key] ||= [];
    const id = String(task.id);
    const statusKey = status || "due";
    const statusPriority = { completed: 3, manual: 2, due: 1 };
    const mode = task && task.mode === "asreq" ? "asreq" : "interval";
    const existing = events.find(ev => ev.type === "task" && ev.id === id);
    if (existing){
      existing.name = task.name;
      const existingStatus = existing.status || "due";
      const existingPriority = statusPriority[existingStatus] || 1;
      const nextPriority = statusPriority[statusKey] || 1;
      if (nextPriority >= existingPriority){
        existing.status = statusKey;
      }
      existing.mode = mode;
      existing.dateISO = key;
      return;
    }
    events.push({ type:"task", id, name:task.name, status: statusKey, mode, dateISO: key });
  }

  const intervalTasks = Array.isArray(window.tasksInterval) ? window.tasksInterval : [];
  const completedByTask = new Map();
  intervalTasks.forEach(t => {
    if (!t) return;
    const rawDates = Array.isArray(t.completedDates) ? t.completedDates : [];
    const set = new Set();
    rawDates.forEach(dateISO => {
      const key = normalizeDateKey(dateISO);
      if (key) set.add(key);
    });
    completedByTask.set(String(t.id), set);
  });
  intervalTasks.forEach(t => {
    if (!t) return;
    const taskKey = String(t.id);
    let completedKeys = completedByTask.get(taskKey);
    if (!(completedKeys instanceof Set)){
      completedKeys = new Set();
      completedByTask.set(taskKey, completedKeys);
    }
    completedKeys.forEach(dateKey => {
      if (!dateKey) return;
      pushTaskEvent(t, dateKey, "completed");
    });

    const manualHistory = typeof ensureTaskManualHistory === "function"
      ? ensureTaskManualHistory(t)
      : (Array.isArray(t.manualHistory) ? t.manualHistory : []);
    const manualDates = new Set();
    manualHistory.forEach(entry => {
      if (!entry) return;
      const entryKey = normalizeDateKey(entry.dateISO);
      if (!entryKey) return;
      const status = entry.status || "logged";
      if (status === "completed"){
        if (!completedKeys.has(entryKey)){
          completedKeys.add(entryKey);
          pushTaskEvent(t, entryKey, "completed");
        }
        return;
      }
      manualDates.add(entryKey);
    });

    const manualKey = normalizeDateKey(t.calendarDateISO);
    if (manualKey) manualDates.add(manualKey);

    manualDates.forEach(dateKey => {
      if (!dateKey) return;
      if (completedKeys.has(dateKey)) return;
      pushTaskEvent(t, dateKey, "manual");
    });

    const projections = projectIntervalDueDates(t, { monthsAhead: 3 });
    if (projections.length){
      projections.forEach(pred => {
        const dueKey = normalizeDateKey(pred?.dateISO);
        if (!dueKey) return;
        if (completedKeys.has(dueKey)) return;
        if (manualKey && manualKey === dueKey && !completedKeys.has(dueKey)){
          return;
        }
        pushTaskEvent(t, dueKey, "due");
      });
      return;
    }

    const nd = nextDue(t);
    if (!nd) return;
    const dueKey = normalizeDateKey(nd.due);
    if (!dueKey) return;
    if (completedKeys.has(dueKey)) return;
    if (!manualKey || manualKey !== dueKey){
      pushTaskEvent(t, dueKey, "due");
    }
  });

  const asReqTasks = Array.isArray(window.tasksAsReq) ? window.tasksAsReq : [];
  asReqTasks.forEach(t => {
    if (!t) return;
    const completedDates = new Set(Array.isArray(t.completedDates) ? t.completedDates.map(normalizeDateKey).filter(Boolean) : []);
    completedDates.forEach(dateKey => {
      if (dateKey) pushTaskEvent(t, dateKey, "completed");
    });
    const manualKey = normalizeDateKey(t.calendarDateISO);
    if (manualKey){
      pushTaskEvent(t, manualKey, completedDates.has(manualKey) ? "completed" : "manual");
    }
  });

  const jobsMap = {};
  cuttingJobs.forEach(j => {
    const start = parseDateLocal(j.startISO);
    const end   = parseDateLocal(j.dueISO);
    if (!start || !end) return;
    start.setHours(0,0,0,0); end.setHours(0,0,0,0);
    const cur = new Date(start.getTime());
    while (cur <= end){
      const key = ymd(cur);
      (jobsMap[key] ||= []).push({ type:"job", id:String(j.id), name:j.name, status:"active" });
      cur.setDate(cur.getDate()+1);
    }
  });

  const completedJobs = Array.isArray(window.completedCuttingJobs) ? window.completedCuttingJobs : [];
  completedJobs.forEach(job => {
    if (!job) return;
    const completionKey = job.completedAtISO ? ymd(job.completedAtISO) : (job.dueISO ? ymd(job.dueISO) : null);
    if (!completionKey) return;
    (jobsMap[completionKey] ||= []).push({ type:"job", id:String(job.id), name:job.name, status:"completed" });
  });

  const garnetMap = {};
  if (Array.isArray(window.garnetCleanings)){
    window.garnetCleanings.forEach(entry => {
      if (!entry || typeof entry.dateISO !== "string") return;
      const date = parseDateLocal(entry.dateISO);
      if (!date) return;
      const key = ymd(date);
      const id = entry.id != null ? String(entry.id) : null;
      if (!id) return;
      (garnetMap[key] ||= []).push({
        id,
        startTime: normalizeTimeString(entry.startTime),
        endTime: normalizeTimeString(entry.endTime),
        completed: Boolean(entry.completed),
        note: entry.note || ""
      });
    });
    Object.keys(garnetMap).forEach(key => {
      garnetMap[key].sort((a,b)=>{
        const startA = timeStringToMinutes(a.startTime) ?? 0;
        const startB = timeStringToMinutes(b.startTime) ?? 0;
        return (startA - startB) || String(a.id).localeCompare(String(b.id));
      });
    });
  }

  const downSet = new Set();
  if (Array.isArray(window.downTimes)){
    window.downTimes.forEach(entry => {
      if (!entry) return;
      const iso = typeof entry === "string" ? entry : entry.dateISO;
      if (iso) downSet.add(String(iso));
    });
  }

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
      cell.dataset.dateIso = key;
      if (downSet.has(key)){
        cell.classList.add("downtime");
        cell.dataset.calDown = key;
        cell.addEventListener("click", (event)=>{
          if (!cell.classList.contains("downtime")) return;
          if (event.target.closest(".day-add-bubble")) return;
          if (event.target.closest("[data-cal-task]")) return;
          if (event.target.closest("[data-cal-job]")) return;
          if (event.target.closest("[data-cal-garnet]")) return;
          const iso = cell.dataset.dateIso;
          if (!iso) return;
          const removeFn = typeof window.dashboardRemoveDownTime === "function"
            ? window.dashboardRemoveDownTime
            : null;
          if (!removeFn) return;
          const parsed = new Date(`${iso}T00:00:00`);
          const label = isNaN(parsed.getTime())
            ? iso
            : parsed.toLocaleDateString();
          const shouldRemove = window.confirm
            ? window.confirm(`Remove down time scheduled for ${label}?`)
            : true;
          if (!shouldRemove) return;
          removeFn(iso);
        });
      }
      (dueMap[key]||[]).forEach(ev=>{
        const chip = document.createElement("div");
        let cls = "event generic cal-task";
        if (ev.status === "completed") cls += " is-complete";
        chip.className = cls;
        chip.dataset.calTask = ev.id;
        chip.dataset.calStatus = ev.status || "due";
        if (ev.mode) chip.dataset.calMode = ev.mode;
        chip.dataset.calDate = ev.dateISO || key;
        let label = ev.name;
        if (ev.status === "completed") label += " (completed)";
        else if (ev.status === "manual") label += " (scheduled)";
        else label += " (due)";
        chip.textContent = label;
        cell.appendChild(chip);
      });
      (garnetMap[key]||[]).forEach(ev=>{
        const chip = document.createElement("div");
        let cls = "event garnet cal-garnet";
        if (ev.completed) cls += " is-complete";
        chip.className = cls;
        chip.dataset.calGarnet = ev.id;
        chip.textContent = `Garnet Cleaning (${formatGarnetRange(ev.startTime, ev.endTime)})`;
        cell.appendChild(chip);
      });
      (jobsMap[key]||[]).forEach(ev=>{
        const bar = document.createElement("div");
        let cls = "job-bar cal-job";
        if (ev.status === "completed") cls += " is-complete";
        bar.className = cls;
        bar.dataset.calJob = ev.id;
        bar.textContent = ev.status === "completed" ? `${ev.name} (completed)` : ev.name;
        cell.appendChild(bar);
      });
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "day-add-bubble";
      addBtn.textContent = "+";
      addBtn.setAttribute("aria-label", `Add item on ${date.toDateString()}`);
      addBtn.addEventListener("click", (ev)=>{
        ev.stopPropagation();
        triggerDashboardAddPicker({ dateISO: key });
      });
      addBtn.addEventListener("focus", ()=> addBtn.classList.add("is-visible"));
      addBtn.addEventListener("blur", ()=> addBtn.classList.remove("is-visible"));
      cell.appendChild(addBtn);
      cell.addEventListener("mouseenter", ()=> addBtn.classList.add("is-visible"));
      cell.addEventListener("mouseleave", ()=> addBtn.classList.remove("is-visible"));
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

