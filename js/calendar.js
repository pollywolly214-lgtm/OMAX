/* ================== CALENDAR & BUBBLES ===================== */
let bubbleTimer = null;
const CALENDAR_DAY_MS = 24 * 60 * 60 * 1000;
let calendarHoursEditing = false;
let calendarHoursPending = new Map();
function rerenderCalendarKeepScroll(){
  if (typeof renderCalendar !== "function") return;
  const scrollX = typeof window !== "undefined" ? window.scrollX : 0;
  const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
  renderCalendar();
  if (typeof window !== "undefined" && typeof window.scrollTo === "function"){
    window.scrollTo(scrollX, scrollY);
  }
}

function normalizeJobList(source){
  if (Array.isArray(source)) return source.filter(Boolean);
  if (source && typeof source === "object") return Object.values(source).filter(Boolean);
  return [];
}

if (typeof window !== "undefined"){
  if (typeof window.__calendarShowAllMonths !== "boolean"){
    window.__calendarShowAllMonths = true;
  }
  if (typeof window.__calendarAvailableMonths !== "number"){
    window.__calendarAvailableMonths = 3;
  }
  if (typeof window.__calendarMonthOffset !== "number"){
    window.__calendarMonthOffset = 0;
  }
}

function isCalendarHoursEditing(){
  return calendarHoursEditing;
}

function formatCalendarDayHours(value){
  const num = Number(value);
  if (!Number.isFinite(num)) return "0 hr";
  const abs = Math.abs(num);
  const decimals = abs >= 10 ? 0 : (Math.abs(num - Math.round(num)) < 0.05 ? 0 : 1);
  return `${num.toFixed(decimals)} hr`;
}

function configuredDailyHours(){
  if (typeof getSchedulingDailyHours === "function"){
    const scheduled = Number(getSchedulingDailyHours());
    if (Number.isFinite(scheduled) && scheduled > 0) return scheduled;
  }
  if (typeof getConfiguredDailyHours === "function") return getConfiguredDailyHours();
  if (typeof DAILY_HOURS === "number" && Number.isFinite(DAILY_HOURS) && DAILY_HOURS > 0) return Number(DAILY_HOURS);
  if (typeof DEFAULT_DAILY_HOURS === "number" && Number.isFinite(DEFAULT_DAILY_HOURS) && DEFAULT_DAILY_HOURS > 0){
    return Number(DEFAULT_DAILY_HOURS);
  }
  return 8;
}

function configuredTaskDurationDailyHours(){
  if (typeof getFixedDailyHours === "function"){
    const fixed = Number(getFixedDailyHours());
    if (Number.isFinite(fixed) && fixed > 0) return fixed;
  }
  return configuredDailyHours();
}

function getMachineHourProjectionAveragePerDay(){
  const uiVisibleSelectedAverage = typeof getConfiguredDailyHours === "function" ? Number(getConfiguredDailyHours()) : null;
  const schedulingDailyHours = typeof getSchedulingDailyHours === "function" ? Number(getSchedulingDailyHours()) : null;
  const configuredFnDailyHours = typeof configuredDailyHours === "function" ? Number(configuredDailyHours()) : null;
  const cfgDailyHours = Number(window?.appConfig?.dailyHours);
  const summary = typeof getPredictionHoursSummary === "function" ? getPredictionHoursSummary() : null;
  const averageDerived = Number(summary?.averageHours);
  const predictionSummaryAverage = Number(summary?.averageHours);
  const fallbackFixed = Number(summary?.fixedHours);
  const finalAverage = Number.isFinite(uiVisibleSelectedAverage) && uiVisibleSelectedAverage > 0
    ? uiVisibleSelectedAverage
    : (Number.isFinite(predictionSummaryAverage) && predictionSummaryAverage > 0
      ? predictionSummaryAverage
      : (Number.isFinite(configuredFnDailyHours) && configuredFnDailyHours > 0
        ? configuredFnDailyHours
        : (Number.isFinite(cfgDailyHours) && cfgDailyHours > 0
          ? cfgDailyHours
          : (Number.isFinite(schedulingDailyHours) && schedulingDailyHours > 0
            ? schedulingDailyHours
            : (Number.isFinite(fallbackFixed) && fallbackFixed > 0 ? fallbackFixed : 8)))));
  if (window.DEBUG_MODE){
    console.info("[maintenance-v2] machine-hour average source", {
      uiVisibleSelectedAverage,
      getSchedulingDailyHoursResult: schedulingDailyHours,
      getConfiguredDailyHoursResult: uiVisibleSelectedAverage,
      configuredDailyHoursResult: configuredFnDailyHours,
      appConfigDailyHours: cfgDailyHours,
      predictionSummaryAverage,
      dailyCutHoursDerivedAverage: averageDerived,
      fixedDailyHoursFallback: fallbackFixed,
      finalAverageHoursPerDay: finalAverage
    });
  }
  return finalAverage;
}

function getCalendarPendingHours(dateISO){
  if (!(calendarHoursPending instanceof Map)) return undefined;
  const key = normalizeDateKey(dateISO);
  if (!key) return undefined;
  return calendarHoursPending.get(key);
}

function setCalendarPendingHours(dateISO, hours){
  const key = normalizeDateKey(dateISO);
  if (!key) return false;
  const value = clampDailyCutHours(hours);
  if (!(calendarHoursPending instanceof Map)) calendarHoursPending = new Map();
  const entry = typeof getDailyCutHoursEntry === "function" ? getDailyCutHoursEntry(key) : null;
  const matchesExisting = entry && Math.abs(Number(entry.hours) - value) < 0.001;
  if (matchesExisting){
    if (calendarHoursPending.has(key)){
      calendarHoursPending.delete(key);
      return true;
    }
    return false;
  }
  const existing = calendarHoursPending.get(key);
  if (existing != null && Math.abs(existing - value) < 0.001) return false;
  calendarHoursPending.set(key, value);
  return true;
}

function startCalendarHoursEditing(){
  if (calendarHoursEditing) return false;
  calendarHoursEditing = true;
  calendarHoursPending = new Map();
  rerenderCalendarKeepScroll();
  if (typeof updateCalendarHoursControls === "function") updateCalendarHoursControls();
  return true;
}

function cancelCalendarHoursEditing(){
  if (!calendarHoursEditing) return false;
  calendarHoursEditing = false;
  calendarHoursPending = new Map();
  rerenderCalendarKeepScroll();
  if (typeof updateCalendarHoursControls === "function") updateCalendarHoursControls();
  return true;
}

function commitCalendarHoursEditing(){
  if (!calendarHoursEditing){
    toast("Not editing hours");
    return false;
  }
  let changed = false;
  if (calendarHoursPending instanceof Map){
    calendarHoursPending.forEach((value, key)=>{
      if (typeof setDailyCutHoursEntry === "function"){
        const updated = setDailyCutHoursEntry(key, value, { source: "manual" });
        if (updated) changed = true;
      }
    });
  }
  calendarHoursPending = new Map();
  calendarHoursEditing = false;
  if (changed && typeof saveCloudDebounced === "function") saveCloudDebounced();
  rerenderCalendarKeepScroll();
  if (typeof updateCalendarHoursControls === "function") updateCalendarHoursControls();
  if (changed){
    if (typeof refreshDerivedDailyHours === "function") refreshDerivedDailyHours();
    if (typeof refreshTimeEfficiencyWidgets === "function") refreshTimeEfficiencyWidgets();
    if (typeof refreshDashboardWidgets === "function") refreshDashboardWidgets({ full: true });
    if (typeof route === "function"){
      try { route(); } catch (_err){}
    }
    toast("Daily hours updated");
  }else{
    toast("No changes to save.");
  }
  return changed;
}

function promptCalendarDayHours(dateISO){
  const key = normalizeDateKey(dateISO);
  if (!key) return false;
  const entry = typeof getDailyCutHoursEntry === "function" ? getDailyCutHoursEntry(key) : null;
  const pending = getCalendarPendingHours(key);
  const current = pending != null ? pending : (entry && entry.hours != null ? Number(entry.hours) : 0);
  const displayDate = (()=>{
    try{
      const parsed = parseDateLocal(key);
      if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString();
    }catch(_err){}
    return key;
  })();
  const input = window.prompt(`Enter cutting hours for ${displayDate} (0-24):`, current != null ? String(current) : "");
  if (input === null) return false;
  const trimmed = input.trim();
  const next = trimmed === "" ? 0 : Number(trimmed);
  if (!Number.isFinite(next) || next < 0 || next > 24){
    toast("Enter a value between 0 and 24 hours.");
    return false;
  }
  const updated = setCalendarPendingHours(key, next);
  if (updated){
    rerenderCalendarKeepScroll();
  }
  return updated;
}

if (typeof window !== "undefined"){
  window.isCalendarHoursEditing = isCalendarHoursEditing;
  window.startCalendarHoursEditing = startCalendarHoursEditing;
  window.cancelCalendarHoursEditing = cancelCalendarHoursEditing;
  window.commitCalendarHoursEditing = commitCalendarHoursEditing;
}
function hideBubble(){
  if (bubbleTimer){
    clearTimeout(bubbleTimer);
    bubbleTimer = null;
  }
  const b = document.getElementById("bubble");
  if (b) b.remove();
}
function hideBubbleSoon(){
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(()=>{
    const b = document.getElementById("bubble");
    if (!b){
      hideBubble();
      return;
    }
    const activeEl = document.activeElement;
    if (b.matches(":hover") || (activeEl && b.contains(activeEl))){
      hideBubbleSoon();
      return;
    }
    hideBubble();
  }, 180);
}

function showV2OneTimeBubble(occurrenceId, anchorEl){
  const lookup = (typeof window !== "undefined" && window.__calendarV2OneTimeLookup && typeof window.__calendarV2OneTimeLookup === "object")
    ? window.__calendarV2OneTimeLookup
    : {};
  let ev = lookup && occurrenceId != null ? lookup[String(occurrenceId)] : null;
  if (!ev && occurrenceId != null){
    const rebuilt = getV2OneTimeOccurrenceView(String(occurrenceId));
    if (rebuilt){
      ev = rebuilt;
      window.__calendarV2OneTimeLookup = window.__calendarV2OneTimeLookup || {};
      window.__calendarV2OneTimeLookup[String(occurrenceId)] = rebuilt;
      if (window.DEBUG_MODE) console.info("[maintenance-v2] rebuilt one-time lookup on demand", occurrenceId, rebuilt);
    }
  }
  if (!ev){
    if (window.DEBUG_MODE) console.warn("[maintenance-v2] bubble lookup miss", occurrenceId, lookup);
    toast("V2 reminder details unavailable");
    return;
  }
  ensureBubble();
  clearTimeout(bubbleTimer);
  const b = document.getElementById("bubble");
  if (!b) return;
  const dateText = parseDateLocal(ev.dateISO)?.toDateString() || ev.dateISO || "—";
  const statusText = ev.status === "completed" ? "Completed" : "Scheduled";
  b.innerHTML = `
    <div class="bubble-title">${escapeHtml(ev.name || "Maintenance reminder")}</div>
    <div class="bubble-kv"><span>Date:</span><span>${escapeHtml(dateText)}</span></div>
    <div class="bubble-kv"><span>Mode:</span><span>One-time (V2)</span></div>
    <div class="bubble-kv"><span>Status:</span><span>${escapeHtml(statusText)}</span></div>
    <div class="bubble-kv"><span>Note:</span><span>${escapeHtml(ev.note || "—")}</span></div>
    <div class="bubble-kv"><span>Logged hours:</span><span>${ev.hours != null ? escapeHtml(String(ev.hours)) : "—"}</span></div>
    <div class="bubble-kv"><span>Info:</span><span>V2 one-time reminder actions are active.</span></div>
    <div class="bubble-actions">
      <button type="button" data-v2-complete ${ev.status === "completed" ? "disabled" : ""}>${ev.status === "completed" ? "Completed" : "Mark complete"}</button>
      <button type="button" data-v2-uncomplete>Mark incomplete</button>
      <button type="button" data-v2-note>Set note</button>
      <button type="button" data-v2-hours>Set hours</button>
      <button type="button" data-bubble-close>Close</button>
    </div>
  `;
  const closeBtn = b.querySelector("[data-bubble-close]");
  closeBtn?.addEventListener("click", ()=> hideBubbleSoon());
  b.querySelector("[data-v2-complete]")?.addEventListener("click", ()=>{
    if (typeof window.completeV2OneTimeOccurrence === "function") window.completeV2OneTimeOccurrence(String(occurrenceId));
  });
  b.querySelector("[data-v2-uncomplete]")?.addEventListener("click", ()=>{
    if (typeof window.uncompleteV2OneTimeOccurrence === "function") window.uncompleteV2OneTimeOccurrence(String(occurrenceId));
  });
  b.querySelector("[data-v2-note]")?.addEventListener("click", ()=>{
    if (typeof window.setV2OneTimeOccurrenceNote === "function") window.setV2OneTimeOccurrenceNote(String(occurrenceId));
  });
  b.querySelector("[data-v2-hours]")?.addEventListener("click", ()=>{
    if (typeof window.setV2OneTimeOccurrenceHours === "function") window.setV2OneTimeOccurrenceHours(String(occurrenceId));
  });
  const rect = anchorEl.getBoundingClientRect();
  b.style.top  = `${window.scrollY + rect.bottom + 8}px`;
  b.style.left = `${window.scrollX + rect.left}px`;
  b.classList.add("show");
}

function closeV2OneTimePanel(){
  const existing = document.getElementById("v2OneTimePanel");
  if (existing) existing.remove();
}

function openV2OneTimePanel(occurrenceId){
  const ev = getV2OneTimeOccurrenceView(String(occurrenceId));
  if (!ev){ toast("V2 reminder details unavailable"); return; }
  closeV2OneTimePanel();
  const overlay = document.createElement("div");
  overlay.id = "v2OneTimePanel";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,.35)";
  overlay.style.display = "grid";
  overlay.style.placeItems = "center";
  overlay.style.zIndex = "9999";
  const card = document.createElement("div");
  card.style.width = "min(92vw, 460px)";
  card.style.background = "#fff";
  card.style.borderRadius = "12px";
  card.style.padding = "14px";
  card.style.boxShadow = "0 14px 35px rgba(0,0,0,.25)";
  const dateText = parseDateLocal(ev.dateISO)?.toDateString() || ev.dateISO || "—";
  const statusText = ev.status === "completed" ? "Completed" : "Scheduled";
  card.innerHTML = `
    <div class="bubble-title">${escapeHtml(ev.name || "Maintenance reminder")}</div>
    <div class="bubble-kv"><span>Date:</span><span>${escapeHtml(dateText)}</span></div>
    <div class="bubble-kv"><span>Status:</span><span>${escapeHtml(statusText)}</span></div>
    <div class="bubble-kv"><span>Note:</span><span>${escapeHtml(ev.note || "—")}</span></div>
    <div class="bubble-kv"><span>Logged hours:</span><span>${ev.hours != null ? escapeHtml(String(ev.hours)) : "—"}</span></div>
    <div class="bubble-actions">
      <button type="button" data-v2-panel-complete ${ev.status === "completed" ? "disabled" : ""}>${ev.status === "completed" ? "Completed" : "Mark complete"}</button>
      <button type="button" data-v2-panel-uncomplete>Mark incomplete</button>
      <button type="button" data-v2-panel-note>Set note</button>
      <button type="button" data-v2-panel-hours>Set logged hours</button>
      <button type="button" class="danger" data-v2-panel-remove>Remove from calendar</button>
      <button type="button" data-v2-panel-close>Close</button>
    </div>
    <div class="small muted" style="margin-top:8px;">These hours are saved on this occurrence only.</div>
  `;
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  const close = ()=> closeV2OneTimePanel();
  overlay.addEventListener("click", (event)=>{ if (event.target === overlay) close(); });
  card.querySelector("[data-v2-panel-close]")?.addEventListener("click", close);
  card.querySelector("[data-v2-panel-complete]")?.addEventListener("click", ()=>{ window.completeV2OneTimeOccurrence?.(String(occurrenceId)); openV2OneTimePanel(occurrenceId); });
  card.querySelector("[data-v2-panel-uncomplete]")?.addEventListener("click", ()=>{ window.uncompleteV2OneTimeOccurrence?.(String(occurrenceId)); openV2OneTimePanel(occurrenceId); });
  card.querySelector("[data-v2-panel-note]")?.addEventListener("click", ()=>{ window.setV2OneTimeOccurrenceNote?.(String(occurrenceId)); openV2OneTimePanel(occurrenceId); });
  card.querySelector("[data-v2-panel-hours]")?.addEventListener("click", ()=>{ window.setV2OneTimeOccurrenceHours?.(String(occurrenceId)); openV2OneTimePanel(occurrenceId); });
  card.querySelector("[data-v2-panel-remove]")?.addEventListener("click", ()=>{
    const ok = window.confirm ? window.confirm("Remove this V2 one-time reminder from the calendar?") : true;
    if (!ok) return;
    window.removeV2OneTimeOccurrence?.(String(occurrenceId));
    close();
  });
}

function getV2OneTimeOccurrenceView(occurrenceId){
  const occId = String(occurrenceId || "");
  if (!occId) return null;
  const events = Array.isArray(window.maintenanceOccurrencesV2) ? window.maintenanceOccurrencesV2 : [];
  const scheduled = events.find(entry => entry && String(entry.id || "") === occId && String(entry.eventType || "") === "scheduled");
  if (!scheduled) return null;
  const instanceId = scheduled.instanceId != null ? String(scheduled.instanceId) : "";
  const instance = (Array.isArray(window.maintenanceCalendarInstancesV2) ? window.maintenanceCalendarInstancesV2 : []).find(entry => entry && String(entry.id || "") === instanceId) || null;
  if (!instance || String(instance.instanceMode || "") !== "one_time") return null;
  const taskId = String(instance.taskId || scheduled.taskId || "");
  const task = (Array.isArray(window.maintenanceTasksV2) ? window.maintenanceTasksV2 : []).find(entry => entry && String(entry.id || "") === taskId) || null;
  const dateISO = normalizeDateKey(scheduled.effectiveDateISO || scheduled.dateISO || instance.startDateISO || null);
  if (!dateISO) return null;
  const state = resolveV2OneTimeOccurrenceState(occId, scheduled);
  return {
    occurrenceId: occId,
    eventType: "scheduled",
    instanceId,
    taskId,
    dateISO,
    name: String(scheduled.taskName || (task && task.name) || "Maintenance reminder"),
    note: state.note,
    hours: state.hours,
    status: state.status
  };
}

function makeV2RepeatOccurrenceKey(instanceId, dateISO){
  return `repeat:${String(instanceId || "")}:${String(dateISO || "")}`;
}

function projectV2RepeatDates(instance, maxCount = 3){
  const rule = instance && instance.repeatRule && typeof instance.repeatRule === "object" ? instance.repeatRule : null;
  if (!rule || !rule.enabled) return [];
  const basis = String(rule.basis || "").toLowerCase();
  if (!["calendar_day", "calendar_week", "calendar_month", "machine_hours"].includes(basis)) return [];
  if (window.DEBUG_MODE){
    console.info("[maintenance-v2] projection routing", {
      instanceId: instance && instance.id != null ? String(instance.id) : null,
      repeatRuleBasis: basis,
      projectionBranch: basis
    });
  }
  const endType = String(rule.endType || "never").toLowerCase();
  const endCount = endType === "after_count" ? Math.max(1, Math.floor(Number(rule.endCount) || 1)) : null;
  const endDateISO = endType === "on_date" ? normalizeDateKey(rule.endDateISO || null) : null;
  const instanceId = instance && instance.id != null ? String(instance.id) : "";
  const eventsForInstance = (Array.isArray(window.maintenanceOccurrencesV2) ? window.maintenanceOccurrencesV2 : [])
    .filter(entry => entry && String(entry.instanceId || "") === instanceId)
    .sort((a,b)=> String(a.recordedAtISO || "").localeCompare(String(b.recordedAtISO || "")));
  const latestByRoot = new Map();
  eventsForInstance.forEach(entry => {
    const root = String(entry.rootOccurrenceId || "");
    if (!root) return;
    latestByRoot.set(root, entry);
  });
  const completedCountForInstance = Array.from(latestByRoot.values())
    .filter(entry => String(entry?.eventType || "") === "completed")
    .length;
  if (basis === "machine_hours"){
    const startDateISO = normalizeDateKey(instance.startDateISO || rule.startISO || null);
    const startDate = startDateISO ? parseDateLocal(startDateISO) : null;
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) return [];
    startDate.setHours(0,0,0,0);
    const intervalHours = Number(rule.intervalHours != null ? rule.intervalHours : rule.every);
    if (!Number.isFinite(intervalHours) || intervalHours <= 0) return [];
    const currentTotalHours = typeof getCurrentMachineHours === "function" ? Number(getCurrentMachineHours()) : null;
    const anchorRaw = Number(instance.machineHourAnchorTotal);
    const anchorTotalHours = Number.isFinite(anchorRaw) ? anchorRaw : (Number.isFinite(currentTotalHours) ? currentTotalHours : 0);
    const safeCurrent = Number.isFinite(currentTotalHours) ? currentTotalHours : anchorTotalHours;
    const averageHoursPerDay = Number(getMachineHourProjectionAveragePerDay());
    const hoursUsedSinceAnchor = Math.max(0, safeCurrent - anchorTotalHours);
    const daysPerInterval = Math.max(1, Math.ceil(intervalHours / averageHoursPerDay));
    const endDate = endType === "on_date" && endDateISO ? parseDateLocal(endDateISO) : null;
    if (endDate instanceof Date && !Number.isNaN(endDate.getTime())) endDate.setHours(0,0,0,0);
    const rollingCount = 3;
    const blockedByCountLimit = endCount != null && completedCountForInstance >= endCount;
    const requestedCount = endCount != null ? endCount : rollingCount;
    const out = [];
    if (!blockedByCountLimit){
      const today = new Date();
      today.setHours(0,0,0,0);
      let firstProjectedTime = null;
      for (let n = 1; n <= requestedCount; n++){
        const targetHoursFromAnchor = intervalHours * n;
        const remainingHoursForThisProjection = targetHoursFromAnchor - hoursUsedSinceAnchor;
        const daysOut = remainingHoursForThisProjection <= 0 ? 0 : Math.ceil(remainingHoursForThisProjection / averageHoursPerDay);
        const predicted = new Date(today.getTime());
        predicted.setDate(today.getDate() + daysOut);
        const predictedBeforeGuardISO = normalizeDateKey(ymd(predicted));
        if (n === 1){
          if (startDate.getTime() >= today.getTime()){
            predicted.setTime(startDate.getTime());
          }else{
            predicted.setTime(Math.max(startDate.getTime(), predicted.getTime()));
          }
          firstProjectedTime = predicted.getTime();
        }else if (firstProjectedTime != null){
          predicted.setTime(firstProjectedTime + ((n - 1) * daysPerInterval * 24 * 60 * 60 * 1000));
        }
        if (endDate instanceof Date && predicted.getTime() > endDate.getTime()) break;
        const finalPredictedDateISO = normalizeDateKey(ymd(predicted));
        if (finalPredictedDateISO) out.push(finalPredictedDateISO);
        if (window.DEBUG_MODE){
          console.info("[maintenance-v2] machine-hour projection occurrence", {
            instanceId,
            startDateISO,
            intervalHours,
            endType,
            endCount,
            completedCountForInstance,
            averageHoursPerDay,
            daysPerInterval,
            currentTotalHours: safeCurrent,
            anchorTotalHours,
            projectionNumber: n,
            targetHoursFromAnchor,
            remainingHoursForThisProjection,
            daysOut,
            predictedDateBeforeStartGuardISO: predictedBeforeGuardISO,
            finalPredictedDateISO
          });
        }
      }
    }
    if (window.DEBUG_MODE){
      console.info("[maintenance-v2] machine-hour projection", {
        instanceId,
        startDateISO,
        intervalHours,
        endType,
        endCount,
        completedCountForInstance,
        averageHoursPerDay,
        daysPerInterval,
        currentTotalHours: safeCurrent,
        anchorTotalHours,
        blockedByCountLimit,
        projectedCount: out.length
      });
    }
    return out;
  }
  const every = Math.max(1, Number(rule.every) || 1);
  const targetCount = endCount != null ? Math.max(0, endCount - completedCountForInstance) : maxCount;
  if (targetCount <= 0) return [];
  const startISO = normalizeDateKey(instance.startDateISO || rule.startISO || null);
  const start = startISO ? parseDateLocal(startISO) : null;
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return [];
  start.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  const out = [];
  const endDate = endDateISO ? parseDateLocal(endDateISO) : null;
  if (endDate instanceof Date && !Number.isNaN(endDate.getTime())) endDate.setHours(0,0,0,0);
  for (let i = 0; i < 366 && out.length < targetCount; i++){
    const d = new Date(start.getTime());
    if (basis === "calendar_day") d.setDate(d.getDate() + (i * every));
    if (basis === "calendar_week") d.setDate(d.getDate() + (i * every * 7));
    if (basis === "calendar_month") d.setMonth(d.getMonth() + (i * every));
    d.setHours(0,0,0,0);
    if (endDate instanceof Date && d.getTime() > endDate.getTime()) break;
    if (d.getTime() < today.getTime()) continue;
    const iso = ymd(d);
    if (iso) out.push(iso);
  }
  return out;
}

function resolveV2RepeatOccurrenceState(instanceId, dateISO){
  const key = makeV2RepeatOccurrenceKey(instanceId, dateISO);
  const events = Array.isArray(window.maintenanceOccurrencesV2) ? window.maintenanceOccurrencesV2 : [];
  const related = events
    .filter(entry => entry && typeof entry === "object" && String(entry.rootOccurrenceId || "") === key)
    .sort((a,b)=> String(a.recordedAtISO || "").localeCompare(String(b.recordedAtISO || "")));
  let status = "scheduled";
  let note = "";
  let hours = null;
  related.forEach(entry => {
    const t = String(entry.eventType || "");
    if (t === "completed") status = "completed";
    if (t === "uncompleted") status = "scheduled";
    if (t === "removed") status = "removed";
    if (t === "note_set" && entry.payload && Object.prototype.hasOwnProperty.call(entry.payload, "note")) note = String(entry.payload.note || "");
    if (t === "hours_set" && entry.payload && Object.prototype.hasOwnProperty.call(entry.payload, "hours")){
      const raw = entry.payload.hours;
      hours = raw == null || raw === "" ? null : (Number.isFinite(Number(raw)) ? Number(raw) : hours);
    }
  });
  return { key, status, note, hours };
}

function appendV2RepeatEvent(instanceId, taskId, dateISO, eventType, payload = {}){
  const key = makeV2RepeatOccurrenceKey(instanceId, dateISO);
  const list = Array.isArray(window.maintenanceOccurrencesV2) ? window.maintenanceOccurrencesV2 : (window.maintenanceOccurrencesV2 = []);
  list.unshift({
    id: genId(`v2_repeat_${eventType}`),
    system: "v2",
    schemaVersion: 2,
    instanceId: String(instanceId || ""),
    taskId: String(taskId || ""),
    eventType,
    effectiveDateISO: normalizeDateKey(dateISO),
    recordedAtISO: new Date().toISOString(),
    rootOccurrenceId: key,
    payload: { ...(payload || {}) }
  });
  let anchorBefore = null;
  let anchorAfter = null;
  let anchorAdvanced = false;
  if (eventType === "completed"){
    const inst = (Array.isArray(window.maintenanceCalendarInstancesV2) ? window.maintenanceCalendarInstancesV2 : []).find(entry => entry && String(entry.id || "") === String(instanceId));
    if (inst && inst.repeatRule && String(inst.repeatRule.basis || "") === "machine_hours"){
      anchorBefore = Number(inst.machineHourAnchorTotal);
      const current = typeof getCurrentMachineHours === "function" ? Number(getCurrentMachineHours()) : null;
      if (Number.isFinite(current)){
        inst.machineHourAnchorTotal = current;
        inst.machineHourAnchorDateISO = normalizeDateKey(ymd(new Date()));
        anchorAfter = Number(inst.machineHourAnchorTotal);
        anchorAdvanced = true;
      }
    }
  }
  if (window.DEBUG_MODE && ["completed","uncompleted","removed"].includes(eventType)){
    console.info("[maintenance-v2] machine-hour occurrence action", {
      instanceId: String(instanceId || ""),
      actionType: eventType,
      clickedDateISO: normalizeDateKey(dateISO),
      rootOccurrenceId: key,
      anchorAdvanced,
      machineHourAnchorTotalBefore: anchorBefore,
      machineHourAnchorTotalAfter: anchorAfter
    });
  }
  if (typeof saveCloudNow === "function") saveCloudNow();
  else saveCloudDebounced();
  renderCalendar();
}

function openV2RepeatPanel(view){
  if (!view) return;
  const instance = (Array.isArray(window.maintenanceCalendarInstancesV2) ? window.maintenanceCalendarInstancesV2 : [])
    .find(entry => entry && String(entry.id || "") === String(view.instanceId || ""));
  const instanceMode = String(instance?.instanceMode || "");
  const instanceStatus = String(instance?.status || "active");
  const canStopRepeat = !!(instance
    && instanceMode === "repeat"
    && !["stopped", "archived"].includes(instanceStatus));
  const statusText = view.status === "completed" ? "Completed" : "Scheduled";
  const dateText = parseDateLocal(view.dateISO)?.toDateString() || view.dateISO;
  closeV2OneTimePanel();
  const overlay = document.createElement("div");
  overlay.id = "v2OneTimePanel";
  overlay.style.position = "fixed"; overlay.style.inset = "0"; overlay.style.background = "rgba(0,0,0,.35)";
  overlay.style.display = "grid"; overlay.style.placeItems = "center"; overlay.style.zIndex = "9999";
  const card = document.createElement("div");
  card.style.width = "min(92vw, 460px)"; card.style.background = "#fff"; card.style.borderRadius = "12px"; card.style.padding = "14px";
  card.innerHTML = `<div class="bubble-title">${escapeHtml(view.name || "Maintenance repeat")}</div>
  <div class="bubble-kv"><span>Date:</span><span>${escapeHtml(dateText)}</span></div>
  <div class="bubble-kv"><span>Status:</span><span>${escapeHtml(statusText)}</span></div>
  <div class="bubble-kv"><span>Note:</span><span>${escapeHtml(view.note || "—")}</span></div>
  <div class="bubble-kv"><span>Logged hours:</span><span>${view.hours != null ? escapeHtml(String(view.hours)) : "—"}</span></div>
  <div class="bubble-kv"><span>Repeat type:</span><span>${escapeHtml(view.repeatType || "Calendar repeat")}</span></div>
  ${view.repeatType === "Machine-hour predicted repeat" ? `<div class="small muted">This due date is predicted from machine-hour usage and may move as hours change.</div>` : ""}
  <div class="bubble-actions">
    <button type="button" data-rpt-complete ${view.status==="completed"?"disabled":""}>${view.status==="completed"?"Completed":"Mark complete"}</button>
    <button type="button" data-rpt-uncomplete>Mark incomplete</button>
    <button type="button" data-rpt-note>Set note</button>
    <button type="button" data-rpt-hours>Set logged hours</button>
    <button type="button" class="danger" data-rpt-remove>Remove from calendar</button>
    ${canStopRepeat ? `<button type="button" class="danger" data-rpt-stop>Stop repeat tracking</button>` : ""}
    <button type="button" data-rpt-close>Close</button>
  </div>`;
  overlay.appendChild(card); document.body.appendChild(overlay);
  overlay.addEventListener("click", (event)=>{ if (event.target === overlay) closeV2OneTimePanel(); });
  const reopen = ()=> openV2RepeatPanel({ ...view, ...resolveV2RepeatOccurrenceState(view.instanceId, view.dateISO) });
  card.querySelector("[data-rpt-close]")?.addEventListener("click", ()=> closeV2OneTimePanel());
  card.querySelector("[data-rpt-complete]")?.addEventListener("click", ()=>{ if (view.status!=="completed") appendV2RepeatEvent(view.instanceId, view.taskId, view.dateISO, "completed"); reopen(); });
  card.querySelector("[data-rpt-uncomplete]")?.addEventListener("click", ()=>{ if (view.status==="completed") appendV2RepeatEvent(view.instanceId, view.taskId, view.dateISO, "uncompleted"); reopen(); });
  card.querySelector("[data-rpt-note]")?.addEventListener("click", ()=>{ const v=window.prompt("Set note for this repeat occurrence:", view.note||""); if(v!==null) appendV2RepeatEvent(view.instanceId, view.taskId, view.dateISO, "note_set", { note:v }); reopen(); });
  card.querySelector("[data-rpt-hours]")?.addEventListener("click", ()=>{ const v=window.prompt("Enter hours to record for this maintenance occurrence. Leave blank to clear.", view.hours!=null?String(view.hours):""); if(v!==null){ const t=String(v).trim(); const h=t===""?null:Number(t); if(t!=="" && (!Number.isFinite(h)||h<0)){ toast("Enter a valid non-negative number."); return; } appendV2RepeatEvent(view.instanceId, view.taskId, view.dateISO, "hours_set", { hours:h }); reopen(); } });
  card.querySelector("[data-rpt-remove]")?.addEventListener("click", ()=>{ const ok=window.confirm?window.confirm("Remove this repeat occurrence from calendar?"):true; if(!ok) return; appendV2RepeatEvent(view.instanceId, view.taskId, view.dateISO, "removed", { source:"repeat_panel" }); closeV2OneTimePanel(); });
  card.querySelector("[data-rpt-stop]")?.addEventListener("click", ()=>{
    const ok = window.confirm ? window.confirm("Stop repeat tracking for this chain?") : true;
    if (!ok) return;
    if (typeof window.stopV2RepeatTracking === "function") window.stopV2RepeatTracking(String(view.instanceId), String(view.taskId), String(view.dateISO));
    closeV2OneTimePanel();
  });
}

window.stopV2RepeatTracking = (instanceId, taskId, dateISO)=>{
  const instances = Array.isArray(window.maintenanceCalendarInstancesV2) ? window.maintenanceCalendarInstancesV2 : [];
  const inst = instances.find(entry => entry && String(entry.id || "") === String(instanceId));
  if (!inst) return;
  if (String(inst.status || "") === "stopped"){ toast("Repeat tracking already stopped"); return; }
  inst.status = "stopped";
  inst.stoppedAtISO = new Date().toISOString();
  appendV2RepeatEvent(instanceId, taskId, dateISO, "stopped", { source: "repeat_panel" });
  toast("Repeat tracking stopped");
};

function appendV2OccurrenceEvent(baseOccurrenceId, eventType, payload = {}, supersedesEventId = null){
  const list = Array.isArray(window.maintenanceOccurrencesV2) ? window.maintenanceOccurrencesV2 : (window.maintenanceOccurrencesV2 = []);
  const lookup = window.__calendarV2OneTimeLookup && typeof window.__calendarV2OneTimeLookup === "object" ? window.__calendarV2OneTimeLookup : {};
  const base = lookup[String(baseOccurrenceId)];
  if (!base) return false;
  const next = {
    id: genId(`v2_${eventType}`),
    system: "v2",
    schemaVersion: 2,
    instanceId: base.instanceId,
    taskId: base.taskId,
    eventType,
    effectiveDateISO: base.dateISO,
    recordedAtISO: new Date().toISOString(),
    supersedesEventId: supersedesEventId || null,
    rootOccurrenceId: String(baseOccurrenceId),
    payload: { ...(payload || {}) }
  };
  list.unshift(next);
  if (typeof saveCloudNow === "function") saveCloudNow();
  else saveCloudDebounced();
  renderCalendar();
  return true;
}

function resolveV2OneTimeOccurrenceState(rootOccurrenceId, scheduledEvent){
  const rootId = String(rootOccurrenceId || "");
  const events = Array.isArray(window.maintenanceOccurrencesV2) ? window.maintenanceOccurrencesV2 : [];
  const relevant = events
    .map((entry, index)=>({ entry, index }))
    .filter(({ entry })=>{
      if (!entry || typeof entry !== "object") return false;
      const id = entry.id != null ? String(entry.id) : "";
      if (id === rootId) return true;
      if (entry.rootOccurrenceId != null && String(entry.rootOccurrenceId) === rootId) return true;
      if (entry.supersedesEventId != null && String(entry.supersedesEventId) === rootId) return true;
      return false;
    })
    .sort((a,b)=>{
      const aTime = Date.parse(String(a.entry.recordedAtISO || ""));
      const bTime = Date.parse(String(b.entry.recordedAtISO || ""));
      const aValid = Number.isFinite(aTime);
      const bValid = Number.isFinite(bTime);
      if (aValid && bValid && aTime !== bTime) return aTime - bTime;
      if (aValid && !bValid) return 1;
      if (!aValid && bValid) return -1;
      return a.index - b.index;
    });
  let status = "scheduled";
  let note = scheduledEvent?.payload && Object.prototype.hasOwnProperty.call(scheduledEvent.payload, "note")
    ? (scheduledEvent.payload.note == null ? "" : String(scheduledEvent.payload.note))
    : "";
  let hours = scheduledEvent?.payload && Object.prototype.hasOwnProperty.call(scheduledEvent.payload, "hours")
    ? (scheduledEvent.payload.hours == null || scheduledEvent.payload.hours === "" ? null : Number(scheduledEvent.payload.hours))
    : null;
  relevant.forEach(({ entry })=>{
    const type = String(entry.eventType || "");
    if (type === "completed") status = "completed";
    if (type === "uncompleted") status = "scheduled";
    if (type === "removed") status = "removed";
    if (type === "note_set" && entry.payload && Object.prototype.hasOwnProperty.call(entry.payload, "note")){
      note = entry.payload.note == null ? "" : String(entry.payload.note);
    }
    if (type === "hours_set" && entry.payload && Object.prototype.hasOwnProperty.call(entry.payload, "hours")){
      const raw = entry.payload.hours;
      hours = raw == null || raw === "" ? null : (Number.isFinite(Number(raw)) ? Number(raw) : hours);
    }
  });
  return { status, note, hours };
}

window.completeV2OneTimeOccurrence = (occurrenceId)=>{
  const lookup = window.__calendarV2OneTimeLookup && typeof window.__calendarV2OneTimeLookup === "object" ? window.__calendarV2OneTimeLookup : {};
  const base = lookup[String(occurrenceId)];
  if (!base) return;
  if (base.status === "completed"){ toast("Already completed"); return; }
  if (appendV2OccurrenceEvent(occurrenceId, "completed", {}, String(occurrenceId))) toast("Marked complete");
};
window.uncompleteV2OneTimeOccurrence = (occurrenceId)=>{
  const lookup = window.__calendarV2OneTimeLookup && typeof window.__calendarV2OneTimeLookup === "object" ? window.__calendarV2OneTimeLookup : {};
  const base = lookup[String(occurrenceId)];
  if (!base) return;
  if (base.status !== "completed"){ toast("Already incomplete"); return; }
  if (appendV2OccurrenceEvent(occurrenceId, "uncompleted", {}, String(occurrenceId))) toast("Marked incomplete");
};
window.setV2OneTimeOccurrenceNote = (occurrenceId)=>{
  const lookup = window.__calendarV2OneTimeLookup && typeof window.__calendarV2OneTimeLookup === "object" ? window.__calendarV2OneTimeLookup : {};
  const base = lookup[String(occurrenceId)];
  if (!base) return;
  const input = window.prompt("Set note for this V2 reminder:", base.note || "");
  if (input === null) return;
  if (appendV2OccurrenceEvent(occurrenceId, "note_set", { note: String(input) }, String(occurrenceId))) toast("Note saved");
};
window.setV2OneTimeOccurrenceHours = (occurrenceId)=>{
  const lookup = window.__calendarV2OneTimeLookup && typeof window.__calendarV2OneTimeLookup === "object" ? window.__calendarV2OneTimeLookup : {};
  const base = lookup[String(occurrenceId)];
  if (!base) return;
  const input = window.prompt("Enter hours to record for this maintenance occurrence. Leave blank to clear.", base.hours != null ? String(base.hours) : "");
  if (input === null) return;
  const trimmed = String(input).trim();
  const hours = trimmed === "" ? null : Number(trimmed);
  if (trimmed !== "" && (!Number.isFinite(hours) || hours < 0)){ toast("Enter a valid non-negative number."); return; }
  if (appendV2OccurrenceEvent(occurrenceId, "hours_set", { hours }, String(occurrenceId))) toast("Hours saved");
};
window.removeV2OneTimeOccurrence = (occurrenceId)=>{
  const lookup = window.__calendarV2OneTimeLookup && typeof window.__calendarV2OneTimeLookup === "object" ? window.__calendarV2OneTimeLookup : {};
  const base = lookup[String(occurrenceId)] || getV2OneTimeOccurrenceView(String(occurrenceId));
  if (!base) return;
  if (base.status === "removed"){ toast("Already removed"); return; }
  if (appendV2OccurrenceEvent(occurrenceId, "removed", { source: "calendar_panel" }, String(occurrenceId))){
    toast("Removed from calendar");
  }
};
function triggerDashboardAddPicker(opts){
  const detail = (opts && typeof opts === "object") ? { ...opts } : {};
  const enqueueRequest = ()=>{
    if (!Array.isArray(window.__pendingDashboardAddRequests)){
      window.__pendingDashboardAddRequests = [];
    }
    window.__pendingDashboardAddRequests.push(detail);
  };

  if (typeof window.openDashboardAddPicker === "function"){
    window.openDashboardAddPicker(detail);
    return;
  }

  enqueueRequest();

  const ensureDashboardVisible = ()=>{
    const hash = (location.hash || "#").toLowerCase();
    const isDashboard = hash === "#/" || hash === "#dashboard" || hash === "#/dashboard";
    if (!isDashboard){
      location.hash = "#/";
      return;
    }
    if (typeof route === "function"){
      try { route(); }
      catch (err){ console.warn("Failed to render dashboard for add picker", err); }
    }
  };

  ensureDashboardVisible();
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

function normalizeHexColor(value){
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (![3, 6].includes(hex.length)) return null;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  if (hex.length === 3){
    return `#${hex.split("").map(ch => `${ch}${ch}`).join("").toUpperCase()}`;
  }
  return `#${hex.toUpperCase()}`;
}

function hexToRgb(hex){
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  const raw = normalized.slice(1);
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16)
  };
}

function rgbaFromHex(hex, alpha){
  const rgb = hexToRgb(hex) || { r: 19, g: 35, b: 63 };
  const a = Math.max(0, Math.min(1, Number(alpha) || 0));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

function mixHex(base, blend, amount){
  const rgbBase = hexToRgb(base) || { r: 19, g: 35, b: 63 };
  const rgbBlend = hexToRgb(blend) || { r: 255, g: 255, b: 255 };
  const weight = Math.max(0, Math.min(1, Number(amount) || 0));
  const r = (rgbBase.r * (1 - weight)) + (rgbBlend.r * weight);
  const g = (rgbBase.g * (1 - weight)) + (rgbBlend.g * weight);
  const b = (rgbBase.b * (1 - weight)) + (rgbBlend.b * weight);
  const toHex = (value)=> Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0").toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hslToHex(h, s, l){
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const lig = Math.max(0, Math.min(100, l)) / 100;
  const chroma = (1 - Math.abs((2 * lig) - 1)) * sat;
  const huePrime = ((h % 360) + 360) % 360 / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (huePrime >= 0 && huePrime < 1){ [r, g, b] = [chroma, x, 0]; }
  else if (huePrime >= 1 && huePrime < 2){ [r, g, b] = [x, chroma, 0]; }
  else if (huePrime >= 2 && huePrime < 3){ [r, g, b] = [0, chroma, x]; }
  else if (huePrime >= 3 && huePrime < 4){ [r, g, b] = [0, x, chroma]; }
  else if (huePrime >= 4 && huePrime < 5){ [r, g, b] = [x, 0, chroma]; }
  else { [r, g, b] = [chroma, 0, x]; }
  const m = lig - (chroma / 2);
  const toHex = (value)=> Math.max(0, Math.min(255, Math.round(value * 255))).toString(16).padStart(2, "0").toUpperCase();
  return `#${toHex(r + m)}${toHex(g + m)}${toHex(b + m)}`;
}

function getJobCategoryColorData(catId){
  const rootId = typeof window.JOB_ROOT_FOLDER_ID === "string" ? window.JOB_ROOT_FOLDER_ID : "jobs_root";
  const jobFolders = Array.isArray(window.jobFolders)
    ? window.jobFolders
    : (typeof defaultJobFolders === "function" ? defaultJobFolders() : []);
  const folderMap = new Map();
  jobFolders.forEach(folder => {
    if (!folder || folder.id == null) return;
    folderMap.set(String(folder.id), folder);
  });
  if (!folderMap.has(rootId)){
    folderMap.set(rootId, { id: rootId, name: "All Jobs", parent: null, order: 1 });
  }
  const rawKey = catId != null ? String(catId) : rootId;
  const normalized = folderMap.has(rawKey) ? rawKey : rootId;
  const folder = folderMap.get(normalized);
  const custom = normalizeHexColor(folder?.color);
  const accentHex = (()=>{
    if (custom) return custom;
    if (!normalized || normalized === rootId) return "#13233F";
    let hash = 0;
    const str = String(normalized);
    for (let i = 0; i < str.length; i++){
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    return hslToHex(hue, 62, 55);
  })();
  const surfaceHex = mixHex(accentHex, "#FFFFFF", 0.86);
  const borderHex = mixHex(accentHex, "#FFFFFF", 0.7);
  const textHex = mixHex(accentHex, "#0B1223", 0.18);
  return {
    normalized,
    accentHex,
    surfaceHex,
    borderHex,
    textHex
  };
}

function applyJobCategoryStyles(el, catId){
  if (!el) return;
  const colors = getJobCategoryColorData(catId);
  el.dataset.categoryColor = "1";
  el.style.setProperty("--job-category-surface", rgbaFromHex(colors.surfaceHex, 0.85));
  el.style.setProperty("--job-category-accent", colors.accentHex);
  el.style.setProperty("--job-category-border", rgbaFromHex(colors.borderHex, 0.6));
  el.style.setProperty("--job-category-text", colors.textHex);
  el.style.setProperty("--job-category-accent-soft", rgbaFromHex(colors.accentHex, 0.28));
}

function updateCalendarJobCategoryStyles(categoryId){
  const normalized = getJobCategoryColorData(categoryId).normalized;
  const escapeFn = (value)=>{
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  };
  const selector = `.cal-job.is-complete[data-cal-job-category="${escapeFn(normalized)}"]`;
  document.querySelectorAll(selector).forEach(el => {
    applyJobCategoryStyles(el, normalized);
  });
}

if (typeof window !== "undefined"){
  window.updateCalendarJobCategoryStyles = updateCalendarJobCategoryStyles;
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

function toDayStart(value){
  const key = normalizeDateKey(value);
  if (!key) return null;
  const parsed = parseDateLocal(key);
  if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0,0,0,0);
  return parsed;
}

function normalizeOccurrenceNotes(task){
  if (!task || typeof task !== "object") return {};
  const result = {};
  const raw = task.occurrenceNotes;
  if (raw && typeof raw === "object"){
    Object.entries(raw).forEach(([maybeDate, maybeNote]) => {
      const key = normalizeDateKey(maybeDate);
      if (!key) return;
      const text = typeof maybeNote === "string" ? maybeNote.trim() : "";
      if (text) result[key] = text;
    });
  }
  task.occurrenceNotes = result;
  return result;
}

function normalizeOccurrenceHours(task){
  if (!task || typeof task !== "object") return {};
  const result = {};
  const raw = task.occurrenceHours;
  if (raw && typeof raw === "object"){
    Object.entries(raw).forEach(([maybeDate, maybeHours]) => {
      const key = normalizeDateKey(maybeDate);
      if (!key) return;
      const num = Number(maybeHours);
      if (!Number.isFinite(num) || num <= 0) return;
      const normalized = Math.max(0.25, Math.round(num * 100) / 100);
      result[key] = normalized;
    });
  }
  task.occurrenceHours = result;
  return result;
}

function normalizeRemovedOccurrences(task){
  if (!task || typeof task !== "object") return new Set();
  const set = new Set();
  const raw = task.removedOccurrences;
  if (Array.isArray(raw)){
    raw.forEach(value => {
      const key = normalizeDateKey(value);
      if (key) set.add(key);
    });
  }else if (raw && typeof raw === "object"){
    Object.keys(raw).forEach(value => {
      const key = normalizeDateKey(value);
      if (key) set.add(key);
    });
  }
  task.removedOccurrences = Array.from(set);
  return set;
}

function markOccurrenceRemoved(task, key){
  const normalizedKey = normalizeDateKey(key);
  if (!task || !normalizedKey) return false;
  const set = normalizeRemovedOccurrences(task);
  const before = set.size;
  set.add(normalizedKey);
  task.removedOccurrences = Array.from(set);
  return set.size !== before;
}

function clearRemovedOccurrences(task, predicate){
  if (!task || typeof task !== "object") return false;
  const set = normalizeRemovedOccurrences(task);
  const next = Array.from(set).filter(key => !predicate || !predicate(key));
  if (next.length === set.size) return false;
  task.removedOccurrences = next;
  return true;
}

function getOccurrenceNoteForTask(task, dateISO){
  const key = normalizeDateKey(dateISO);
  if (!key) return "";
  const notes = normalizeOccurrenceNotes(task);
  return notes[key] || "";
}

function getOccurrenceHoursForTask(task, dateISO){
  const key = normalizeDateKey(dateISO);
  if (!key) return null;
  const map = normalizeOccurrenceHours(task);
  const val = map[key];
  return Number.isFinite(val) && val > 0 ? val : null;
}

function setOccurrenceNoteForTask(task, dateISO, noteText){
  if (!task || typeof task !== "object") return false;
  const key = normalizeDateKey(dateISO);
  if (!key) return false;
  const notes = normalizeOccurrenceNotes(task);
  const text = typeof noteText === "string" ? noteText.trim() : "";
  const existing = notes[key] || "";
  let changed = false;
  if (text){
    if (existing !== text){
      notes[key] = text;
      changed = true;
    }
  }else if (existing){
    delete notes[key];
    changed = true;
  }
  if (changed){
    task.occurrenceNotes = notes;
  }
  return changed;
}

function setOccurrenceHoursForTask(task, dateISO, hours){
  if (!task || typeof task !== "object") return false;
  const key = normalizeDateKey(dateISO);
  if (!key) return false;
  const map = normalizeOccurrenceHours(task);
  const current = map[key];
  let changed = false;
  const num = Number(hours);
  if (Number.isFinite(num) && num > 0){
    const normalized = Math.max(0.25, Math.round(num * 100) / 100);
    if (current !== normalized){
      map[key] = normalized;
      changed = true;
    }
  }else if (current != null){
    delete map[key];
    changed = true;
  }
  if (changed){
    task.occurrenceHours = map;
  }
  return changed;
}

function visitTaskFamily(task, fn){
  if (!task || typeof fn !== "function") return;
  const templateId = task.templateId != null ? String(task.templateId) : String(task.id);
  if (!templateId) return;
  const intervalList = Array.isArray(window.tasksInterval) ? window.tasksInterval : [];
  const asReqList = Array.isArray(window.tasksAsReq) ? window.tasksAsReq : [];
  [intervalList, asReqList].forEach(list => {
    list.forEach(item => {
      if (!item) return;
      const candidateTemplateId = item.templateId != null ? String(item.templateId) : String(item.id);
      if (String(candidateTemplateId) !== templateId) return;
      if (!isTemplateTask(item) && !isInstanceTask(item)) return;
      fn(item);
    });
  });
}

function setFamilyOccurrenceNote(task, dateISO, noteText){
  let changed = false;
  visitTaskFamily(task, member => {
    if (setOccurrenceNoteForTask(member, dateISO, noteText)) changed = true;
  });
  return changed;
}

function setFamilyOccurrenceHours(task, dateISO, hours){
  let changed = false;
  visitTaskFamily(task, member => {
    if (setOccurrenceHoursForTask(member, dateISO, hours)) changed = true;
  });
  return changed;
}


function removeSingleOccurrenceAcrossTaskFamily(task, dateISO){
  const key = normalizeDateKey(dateISO);
  if (!key) return false;
  let changed = false;
  const isSameDay = (value)=> normalizeDateKey(value) === key;
  visitTaskFamily(task, member => {
    if (!member) return;
    if (markOccurrenceRemoved(member, key)) changed = true;

    const nowIso = new Date().toISOString();
    const history = Array.isArray(member.manualHistory) ? member.manualHistory : [];
    let entry = history.find(item => isSameDay(item?.dateISO));
    if (!entry){
      history.push({ dateISO: key, status: "removed", recordedAtISO: nowIso, source: "calendar" });
      member.manualHistory = history;
      changed = true;
    }else if (entry.status !== "removed"){
      entry.status = "removed";
      if (!entry.recordedAtISO) entry.recordedAtISO = nowIso;
      changed = true;
    }

    if (member.calendarKilled === true){
      member.calendarKilled = false;
      changed = true;
    }
    if (member.recurrence && typeof member.recurrence === "object" && member.recurrence.enabled === false){
      member.recurrence = { ...member.recurrence, enabled: true };
      changed = true;
    }
    if (isSameDay(member.calendarDateISO)){
      member.calendarDateISO = null;
      changed = true;
    }
  });
  return changed;
}

function killTaskFamilyCalendarScheduling(task){
  let changed = false;
  visitTaskFamily(task, member => {
    if (!member) return;
    const recurrence = (member.recurrence && typeof member.recurrence === "object") ? member.recurrence : {};
    if (recurrence.enabled !== false){
      member.recurrence = { ...recurrence, enabled: false };
      changed = true;
    }
    if (member.calendarKilled !== true){
      member.calendarKilled = true;
      changed = true;
    }
    const removedSet = normalizeRemovedOccurrences(member);
    const projected = projectIntervalDueDates(member, { monthsAhead: 24, minOccurrences: 24 });
    projected.forEach(pred => {
      const key = normalizeDateKey(pred?.dateISO);
      if (!key) return;
      if (!removedSet.has(key)){
        removedSet.add(key);
        changed = true;
      }
    });
    if (member.calendarDateISO != null){
      member.calendarDateISO = null;
      changed = true;
    }
    if (Array.isArray(member.completedDates) && member.completedDates.length){
      member.completedDates = [];
      changed = true;
    }
    if (member.occurrenceNotes && Object.keys(member.occurrenceNotes).length){
      member.occurrenceNotes = {};
      changed = true;
    }
    if (member.occurrenceHours && Object.keys(member.occurrenceHours).length){
      member.occurrenceHours = {};
      changed = true;
    }
    member.removedOccurrences = Array.from(removedSet);
  });
  return changed;
}

function markCalendarTaskComplete(meta, dateISO){
  if (!meta || !meta.task) return false;
  const key = normalizeDateKey(dateISO || new Date());
  if (!key) return false;
  const task = meta.task;
  const mode = meta.mode === "asreq" || task.mode === "asreq" ? "asreq" : "interval";
  let changed = false;
  const clearRemovedForKey = (member)=>{
    if (!member || typeof member !== "object") return false;
    return clearRemovedOccurrences(member, value => normalizeDateKey(value) === key);
  };

  if (mode === "interval"){
    if (clearRemovedForKey(task)) changed = true;
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
    const defaultDaily = configuredDailyHours();
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
    const recurrence = getTaskRecurrence(task);
    if (recurrence && recurrence.enabled){
      recurrence.completionAnchorISO = key;
      if (currentHours != null && Number.isFinite(Number(currentHours))){
        recurrence.completionAnchorHours = Number(currentHours);
      }
      if (recurrence.basis === "machine_hours"){
        recurrence.startISO = key;
      }
      task.recurrence = recurrence;
    }
    changed = true;
  }else{
    if (clearRemovedForKey(task)) changed = true;
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
    const recurrence = getTaskRecurrence(task);
    if (recurrence && recurrence.enabled){
      recurrence.completionAnchorISO = key;
      task.recurrence = recurrence;
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
    const defaultDaily = configuredDailyHours();
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
      if (entry.status !== "scheduled"){ entry.status = "scheduled"; changed = true; }
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

  if (isInstanceTask(task)){
    if (Array.isArray(meta.list)){
      meta.list.splice(meta.index, 1);
      changed = true;
      if (meta.mode === "asreq"){
        window.tasksAsReq = meta.list;
      }else{
        window.tasksInterval = meta.list;
      }
    }
    return changed;
  }

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
    if (setFamilyOccurrenceNote(task, key, "")){
      changed = true;
    }
    if (setFamilyOccurrenceHours(task, key, null)){
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
    if (setFamilyOccurrenceNote(task, key, "")){
      changed = true;
    }
    if (setFamilyOccurrenceHours(task, key, null)){
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

function removeCalendarTaskOccurrences(meta, dateISO, scope = "single"){
  const normalizedScope = scope === "future" ? "future" : (scope === "all" ? "all" : "single");
  if (!meta || !meta.task) return false;

  const key = normalizeDateKey(dateISO);
  if (!key) return false;

  const task = meta.task;
  const mode = meta.mode === "asreq" || task.mode === "asreq" ? "asreq" : "interval";
  let changed = false;

  const isSameDay = (value)=> normalizeDateKey(value) === key;

  if (isInstanceTask(task) && mode === "asreq"){
    return removeCalendarTaskOccurrence(meta, key);
  }

  const targetTime = (()=>{
    const targetDate = toDayStart(key);
    return targetDate instanceof Date && !Number.isNaN(targetDate.getTime())
      ? targetDate.getTime()
      : null;
  })();

  const matchesScope = (value)=>{
    const normalized = normalizeDateKey(value);
    if (!normalized) return false;

    if (normalizedScope === "all") return true;
    if (normalizedScope === "single") return normalized === key;

    const compareDate = toDayStart(normalized);
    const compareTime = (compareDate instanceof Date && !Number.isNaN(compareDate.getTime()))
      ? compareDate.getTime()
      : null;
    if (targetTime != null && compareTime != null) return compareTime >= targetTime;
    return normalized >= key;
  };

  if (mode === "interval" && normalizedScope === "single"){
    const removed = removeSingleOccurrenceAcrossTaskFamily(task, key);
    if (removed) changed = true;
    return changed;
  }

  if (mode === "interval"){
    const removedSet = normalizeRemovedOccurrences(task);
    const removedBefore = removedSet.size;
    const addRemoved = (value)=>{
      const normalized = normalizeDateKey(value);
      if (!normalized) return;
      if (!matchesScope(normalized)) return;
      removedSet.add(normalized);
    };

    if (normalizedScope === "single"){
      if (markOccurrenceRemoved(task, key)) changed = true;
    }else{
      addRemoved(key);
      const addObjectKeys = (obj)=>{
        if (!obj || typeof obj !== "object") return;
        Object.keys(obj).forEach(addRemoved);
      };
      const addArrayValues = (arr)=>{
        if (!Array.isArray(arr)) return;
        arr.forEach(addRemoved);
      };

      addArrayValues(task.completedDates);
      addObjectKeys(task.occurrenceNotes);
      addObjectKeys(task.occurrenceHours);
      addArrayValues(Array.isArray(task.manualHistory) ? task.manualHistory.map(entry => entry?.dateISO) : []);
      addRemoved(task.calendarDateISO);

      const projected = projectIntervalDueDates(task, { monthsAhead: 12, minOccurrences: 12 });
      projected.forEach(pred => {
        const projectedKey = normalizeDateKey(pred?.dateISO);
        if (!projectedKey) return;
        if (normalizedScope === "all"){
          removedSet.add(projectedKey);
          return;
        }
        const projectedDate = toDayStart(projectedKey);
        const projectedTime = (projectedDate instanceof Date && !Number.isNaN(projectedDate.getTime()))
          ? projectedDate.getTime()
          : null;
        if (targetTime != null && projectedTime != null && projectedTime >= targetTime){
          removedSet.add(projectedKey);
        }
      });

      if (removedSet.size !== removedBefore){
        task.removedOccurrences = Array.from(removedSet);
        changed = true;
      }
    }
  }else{
    const removedChanged = clearRemovedOccurrences(task, matchesScope);
    if (removedChanged) changed = true;
  }

  const pruneOccurrenceObject = (obj)=>{
    if (!obj || typeof obj !== "object") return false;
    let mutated = false;
    Object.keys(obj).forEach(k => {
      if (matchesScope(k)){
        delete obj[k];
        mutated = true;
      }
    });
    return mutated;
  };

  if (matchesScope(task.calendarDateISO)){
    task.calendarDateISO = null;
    changed = true;
  }

  if (Array.isArray(task.completedDates)){
    const next = task.completedDates.filter(value => !matchesScope(value));
    if (next.length !== task.completedDates.length){
      task.completedDates = next;
      changed = true;
    }
  }

  if (pruneOccurrenceObject(task.occurrenceNotes)) changed = true;
  if (pruneOccurrenceObject(task.occurrenceHours)) changed = true;

  if (mode === "interval"){
    if (Array.isArray(task.manualHistory)){
      const nextHistory = task.manualHistory.filter(entry => !matchesScope(entry?.dateISO));
      if (nextHistory.length !== task.manualHistory.length){
        task.manualHistory = nextHistory;
        changed = true;
      }
    }
    if (changed){
      applyIntervalBaseline(task, { baselineHours: null, currentHours: typeof getCurrentMachineHours === "function" ? getCurrentMachineHours() : undefined });
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

function removeCalendarTaskFamily(meta){
  if (!meta || !meta.task) return false;
  const task = meta.task;
  const mode = meta.mode === "asreq" || task.mode === "asreq" ? "asreq" : "interval";
  const list = mode === "asreq" ? (Array.isArray(window.tasksAsReq) ? window.tasksAsReq : []) : (Array.isArray(window.tasksInterval) ? window.tasksInterval : []);
  const templateId = task.templateId != null ? String(task.templateId) : String(task.id);
  const toRemove = [];
  list.forEach((item, idx) => {
    if (!item) return;
    if (String(item.id) === templateId && isTemplateTask(item)){
      toRemove.push(idx);
      return;
    }
    if (String(item.templateId) === templateId && isInstanceTask(item)){
      toRemove.push(idx);
    }
  });
  if (!toRemove.length){
    return removeCalendarTaskEverywhere(meta);
  }
  toRemove.sort((a,b)=> b - a).forEach(idx => {
    if (idx >= 0 && idx < list.length) list.splice(idx,1);
  });
  if (mode === "asreq"){
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
  let meta = findCalendarTaskMeta(taskId);
  if (!meta) return;
  const todayKey = normalizeDateKey(new Date());
  if (!todayKey) return;
  const changed = markCalendarTaskComplete(meta, todayKey);
  if (changed){
    if (typeof saveCloudNow === "function") saveCloudNow();
    else saveCloudDebounced();
    toast("Task completed");
    rerenderCalendarKeepScroll();
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
  const canRemoveOccurrence = !!dateKey;
  const canMarkComplete = !!dateKey && !isCompleted;
  const canUnmarkComplete = !!dateKey && isCompleted;

  const statusLabel = isCompleted
    ? "Completed"
    : (normalizedStatus === "manual" ? "Scheduled" : normalizedStatus === "due" ? "Projected" : "Scheduled");

  const occurrenceNote = dateKey ? getOccurrenceNoteForTask(task, dateKey) : "";

  const hoursPerDay = configuredTaskDurationDailyHours();
  const occurrenceHours = dateKey ? getOccurrenceHoursForTask(task, dateKey) : null;
  
  const downtimeHours = (()=>{
    const raw = Number(task.downtimeHours);
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw * 100) / 100 : null;
  })();
  const effectiveHours = occurrenceHours != null ? occurrenceHours : downtimeHours;

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

  if (effectiveHours != null){
    const days = Math.max(1, Math.ceil(effectiveHours / hoursPerDay));
    infoParts.push(`<div class="bubble-kv"><span>${occurrenceHours != null ? "Occurrence time:" : "Time to complete:"}</span><span>${escapeHtml(formatCalendarDayHours(effectiveHours))} (${days} ${days === 1 ? "day" : "days"})</span></div>`);
    if (occurrenceHours != null && downtimeHours != null){
      const baseDays = Math.max(1, Math.ceil(downtimeHours / hoursPerDay));
      infoParts.push(`<div class="bubble-kv"><span>Default time:</span><span>${escapeHtml(formatCalendarDayHours(downtimeHours))} (${baseDays} ${baseDays === 1 ? "day" : "days"})</span></div>`);
    }
  }

  if (task.manualLink || task.storeLink){
    const links = [];
    if (task.manualLink) links.push(`<a href="${task.manualLink}" target="_blank" rel="noopener">Manual</a>`);
    if (task.storeLink) links.push(`<a href="${task.storeLink}" target="_blank" rel="noopener">Store</a>`);
    infoParts.push(`<div class="bubble-kv"><span>Links:</span><span>${links.join(" · ")}</span></div>`);
  }

  if (occurrenceNote){
    infoParts.push(`<div class="bubble-kv"><span>Note:</span><span>${escapeHtml(occurrenceNote)}</span></div>`);
  }

  const targetKey = dateKey || normalizeDateKey(new Date());
  const recurrence = getTaskRecurrence(task);
  const isRepeating = Boolean(recurrence && recurrence.enabled);

  const actions = [];
  if (dateKey){
    const noteLabel = occurrenceNote ? "Edit note" : "Add note";
    const hoursLabel = occurrenceHours != null ? "Edit time" : "Add time";
    actions.push(`<button data-bbl-occurrence-hours>${escapeHtml(hoursLabel)}</button>`);
    actions.push(`<button data-bbl-occurrence-note>${escapeHtml(noteLabel)}</button>`);
  }
  if (canMarkComplete){
    actions.push(`<button data-bbl-complete>Mark complete</button>`);
  }
  if (canUnmarkComplete){
    actions.push(`<button data-bbl-uncomplete>Unmark complete</button>`);
  }
  if (canRemoveOccurrence){
    actions.push(`<button class="secondary" data-bbl-remove-single>Remove occurrence</button>`);
    if (isRepeating){
      actions.push(`<button class="secondary" data-bbl-remove-future>Remove future</button>`);
    }
  }
  actions.push(`<button data-bbl-edit>Edit settings</button>`);
  actions.push(`<button class="danger" data-bbl-remove-task>Remove task</button>`);

  const b  = makeBubble(anchor);
  b.innerHTML = `${infoParts.join("")}<div class="bubble-actions">${actions.join("")}</div>`;

  b.querySelector("[data-bbl-occurrence-hours]")?.addEventListener("click", ()=>{
    const existing = occurrenceHours != null ? occurrenceHours : "";
    const promptText = "Set time to complete for this occurrence (hours). Leave blank to use the default.";
    const nextRaw = typeof window.prompt === "function" ? window.prompt(promptText, existing === "" ? "" : String(existing)) : "";
    if (nextRaw === null || nextRaw === undefined) return;
    const parsed = Number(nextRaw);
    const changed = setFamilyOccurrenceHours(task, targetKey, Number.isFinite(parsed) && parsed > 0 ? parsed : null);
    if (changed){
      if (typeof saveCloudNow === "function") saveCloudNow();
      else saveCloudDebounced();
      toast((Number.isFinite(parsed) && parsed > 0) ? "Occurrence time saved" : "Occurrence time removed");
      hideBubble();
      rerenderCalendarKeepScroll();
    }
  });

  b.querySelector("[data-bbl-occurrence-note]")?.addEventListener("click", ()=>{
    const existing = occurrenceNote;
    const promptText = "Add a note for this calendar occurrence. It won't change other intervals.";
    const next = typeof window.prompt === "function" ? window.prompt(promptText, existing) : "";
    if (next === null || next === undefined) return;
    const changed = setFamilyOccurrenceNote(task, targetKey, next);
    if (changed){
      if (typeof saveCloudNow === "function") saveCloudNow();
      else saveCloudDebounced();
      toast((next || "").trim() ? "Occurrence note saved" : "Occurrence note removed");
      hideBubble();
      rerenderCalendarKeepScroll();
    }
  });

  b.querySelector("[data-bbl-complete]")?.addEventListener("click", ()=>{
    const changed = markCalendarTaskComplete(meta, targetKey);
    if (changed){
      if (typeof saveCloudNow === "function") saveCloudNow();
      else saveCloudDebounced();
      toast("Task marked complete");
      hideBubble();
      rerenderCalendarKeepScroll();
    }
  });

  b.querySelector("[data-bbl-uncomplete]")?.addEventListener("click", ()=>{
    const changed = unmarkCalendarTaskComplete(meta, targetKey);
    if (changed){
      if (typeof saveCloudNow === "function") saveCloudNow();
      else saveCloudDebounced();
      toast("Completion removed");
      hideBubble();
      rerenderCalendarKeepScroll();
    }
  });

  const runRemoveScope = (scope)=>{
    const confirmText = scope === "future"
      ? "Remove this occurrence and all future occurrences from the calendar?"
      : scope === "all"
        ? "Remove all calendar occurrences for this task (past and future)?"
        : "Remove this occurrence from the calendar?";
    const shouldRemove = window.confirm ? window.confirm(confirmText) : true;
    if (!shouldRemove) return;
    const changed = removeCalendarTaskOccurrences(meta, targetKey, scope);
    if (changed){
      if (typeof saveCloudNow === "function") saveCloudNow();
      else saveCloudDebounced();
      const toastMessage = scope === "future"
        ? "Current and future occurrences removed"
        : scope === "all"
          ? "All occurrences removed"
          : "Removed from calendar";
      toast(toastMessage);
      hideBubble();
      rerenderCalendarKeepScroll();
    }
  };
  b.querySelector("[data-bbl-remove-single]")?.addEventListener("click", ()=> runRemoveScope("single"));
  b.querySelector("[data-bbl-remove-future]")?.addEventListener("click", ()=> runRemoveScope("future"));
  b.querySelector("[data-bbl-remove-all]")?.addEventListener("click", ()=> runRemoveScope("all"));

  b.querySelector("[data-bbl-remove-task]")?.addEventListener("click", ()=>{
    const templateId = task.templateId != null ? String(task.templateId) : String(task.id);
    const list = mode === "asreq" ? (Array.isArray(window.tasksAsReq) ? window.tasksAsReq : []) : (Array.isArray(window.tasksInterval) ? window.tasksInterval : []);
    const templateTask = list.find(item => item && String(item.id) === templateId && isTemplateTask(item)) || (isTemplateTask(task) ? task : null);
    const label = templateTask?.name || task.name || "Task";
    const confirmText = `Remove "${label}" from Maintenance Settings and delete all scheduled copies?`;
    const shouldRemove = window.confirm ? window.confirm(confirmText) : true;
    if (!shouldRemove) return;
    try {
      if (typeof recordDeletedItem === "function"){
        recordDeletedItem("task", templateTask || task, { list: mode, cat: (templateTask || task)?.cat ?? null, parentTask: (templateTask || task)?.parentTask ?? null });
      }
    } catch (err) {
      console.warn("Failed to record deleted task from calendar", err);
    }
    if (removeCalendarTaskFamily(meta)){
      if (typeof saveCloudNow === "function") saveCloudNow();
      else saveCloudDebounced();
      toast("Task removed");
      hideBubble();
      rerenderCalendarKeepScroll();
    }
  });

  b.querySelector("[data-bbl-edit]")?.addEventListener("click", ()=>{
    hideBubble();
    const targetId = isTemplateTask(task)
      ? taskId
      : (task.templateId != null ? String(task.templateId) : taskId);
    openSettingsAndReveal(targetId);
  });

  b.addEventListener("click", (e)=>{
    if (e.target.closest(".bubble-actions")) return;
    if (e.target.closest("button")) return;
    if (e.target.closest("a")) return;
    hideBubble();
    const targetId = isTemplateTask(task)
      ? taskId
      : (task.templateId != null ? String(task.templateId) : taskId);
    openSettingsAndReveal(targetId);
  });
}

function showJobBubble(jobId, anchor){
  const b = makeBubble(anchor);
  const formatRate = (value, { showPlus = false } = {}) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return "—";
    const abs = Math.abs(num);
    const formatted = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: abs < 1000 ? 2 : 0,
      maximumFractionDigits: abs < 1000 ? 2 : 0
    }).format(abs);
    if (num < 0) return `-${formatted}/hr`;
    if (num > 0 && showPlus) return `+${formatted}/hr`;
    return `${formatted}/hr`;
  };
  try{
    const active = cuttingJobs.find(x => String(x.id) === String(jobId));
    const completedJobs = normalizeJobList(window.completedCuttingJobs);
    const completed = completedJobs.find(x => String(x?.id) === String(jobId));
    const prioritySchedule = typeof computePrioritySchedule === "function"
      ? computePrioritySchedule(cuttingJobs)
      : { backlog: new Map(), efficiencies: new Map() };
    const backlogMap = prioritySchedule && prioritySchedule.backlog instanceof Map
      ? prioritySchedule.backlog
      : new Map();
    const efficiencyCache = prioritySchedule && prioritySchedule.efficiencies instanceof Map
      ? prioritySchedule.efficiencies
      : new Map();
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
      const effData = completed && completed.efficiency ? completed.efficiency : {};
      const chargeRateVal = Number.isFinite(Number(effData.chargeRate)) && Number(effData.chargeRate) >= 0
        ? Number(effData.chargeRate)
        : (Number.isFinite(Number(completed.chargeRate)) && Number(completed.chargeRate) >= 0 ? Number(completed.chargeRate) : JOB_RATE_PER_HOUR);
      const materialTotalCompleted = Number(completed.materialCost || 0) * Number(completed.materialQty || 0);
      const hoursForCost = Number.isFinite(Number(completed.actualHours)) && Number(completed.actualHours) > 0
        ? Number(completed.actualHours)
        : (Number.isFinite(Number(completed.estimateHours)) && Number(completed.estimateHours) > 0 ? Number(completed.estimateHours) : 0);
      const fallbackCost = hoursForCost > 0 ? (materialTotalCompleted / hoursForCost) : 0;
      const costRateVal = Number.isFinite(Number(effData.costRate))
        ? Number(effData.costRate)
        : JOB_BASE_COST_PER_HOUR + fallbackCost;
      const netRateVal = Number.isFinite(Number(effData.netRate))
        ? Number(effData.netRate)
        : chargeRateVal - costRateVal;
      const hoursForNet = hoursForCost > 0 ? hoursForCost : 0;
      const netTotalVal = netRateVal * hoursForNet;
      const rateText = formatRate(netRateVal, { showPlus: true });
      const notesHtml = completed.notes ? `<div class="bubble-kv"><span>Notes:</span><span>${escapeHtml(completed.notes)}</span></div>` : "";
      const netTotalText = Number.isFinite(netTotalVal)
        ? `${netTotalVal >= 0 ? "+" : "−"}$${Math.abs(netTotalVal).toFixed(2)}`
        : "—";
      const netTotalHtml = `${escapeHtml(netTotalText)}${rateText !== "—" ? ` <span class="muted">@ ${escapeHtml(rateText)}</span>` : ""}`;
      b.innerHTML = `
        <div class="bubble-title">${escapeHtml(completed.name || "Completed job")}</div>
        <div class="bubble-kv"><span>Status:</span><span>Completed</span></div>
        <div class="bubble-kv"><span>Finished:</span><span>${escapeHtml(finishedText)}</span></div>
        <div class="bubble-kv"><span>Schedule:</span><span>${escapeHtml(startText)} → ${escapeHtml(dueText)}</span></div>
        <div class="bubble-kv"><span>Estimate:</span><span>${escapeHtml(estimateText)}</span></div>
        <div class="bubble-kv"><span>Actual hours:</span><span>${escapeHtml(actualText)}</span></div>
        <div class="bubble-kv"><span>Material:</span><span>${materialText}</span></div>
        <div class="bubble-kv"><span>Charge rate:</span><span>${escapeHtml(formatRate(chargeRateVal))}</span></div>
        <div class="bubble-kv"><span>Cost rate:</span><span>${escapeHtml(formatRate(costRateVal))}</span></div>
        <div class="bubble-kv"><span>Net profit/hr:</span><span>${escapeHtml(formatRate(netRateVal, { showPlus: true }))}</span></div>
        <div class="bubble-kv"><span>Net total:</span><span>${netTotalHtml}</span></div>
        ${notesHtml}`;
      return;
    }
    const j = active;
    const jobIdStr = j?.id != null ? String(j.id) : "";
    const jobPriority = typeof getJobPriority === "function"
      ? getJobPriority(j)
      : (Number.isFinite(Number(j?.priority)) && Number(j.priority) > 0
        ? Math.max(1, Math.floor(Number(j.priority)))
        : 1);
    const cachedEff = jobIdStr && efficiencyCache instanceof Map ? efficiencyCache.get(jobIdStr) : null;
    const eff = cachedEff || computeJobEfficiency(j);
    if (jobIdStr && efficiencyCache instanceof Map && !cachedEff){
      efficiencyCache.set(jobIdStr, eff);
    }
    const backlogRaw = jobIdStr && backlogMap instanceof Map ? backlogMap.get(jobIdStr) : 0;
    const backlogHours = Number.isFinite(Number(backlogRaw)) ? Math.max(0, Number(backlogRaw)) : 0;
    const req = computeRequiredDaily(j, { backlogHours });
    const jobRemainingHours = Number.isFinite(req.jobRemainingHours)
      ? Math.max(0, req.jobRemainingHours)
      : (eff.actualRemaining != null
        ? Math.max(0, eff.actualRemaining)
        : Math.max(0, (Number(j.estimateHours)||0) - (Number(eff.actualHours)||0)));
    const actualRemain = jobRemainingHours;
    const hoursPerDay = configuredDailyHours();
    const remainingHours = Number.isFinite(req.remainingHours) ? Math.max(0, req.remainingHours) : 0;
    const remainingDays = Number.isFinite(req.remainingDays) ? Math.max(0, req.remainingDays) : 0;
    const capacityRemaining = remainingDays * hoursPerDay;
    const slackHours = req.requiredPerDay === Infinity
      ? Number.NEGATIVE_INFINITY
      : capacityRemaining - remainingHours;
    const SLACK_EPS = 0.05;
    const behindSchedule = req.requiredPerDay === Infinity || slackHours < -SLACK_EPS;
    const aheadSchedule = !behindSchedule && slackHours > (hoursPerDay + SLACK_EPS);
    const statusLabel = behindSchedule ? "Behind" : (aheadSchedule ? "Ahead" : "On pace");
    let statusDetail = "";
    const backlogSummary = backlogHours > 0 ? `${backlogHours.toFixed(1)} hr queued ahead` : "";
    if (req.requiredPerDay === Infinity){
      statusDetail = "Past due";
    } else if (behindSchedule){
      statusDetail = `Needs ${req.requiredPerDay.toFixed(1)} hr/day`;
    } else if (aheadSchedule){
      statusDetail = `${slackHours.toFixed(1)} hr slack`;
    } else if (remainingHours > 0){
      statusDetail = `Needs ${req.requiredPerDay.toFixed(1)} hr/day`;
    }
    if (backlogSummary){
      statusDetail = statusDetail ? `${statusDetail} (${backlogSummary})` : backlogSummary;
    }
    const daysLabel = remainingDays === 1 ? "day" : "days";
    let remainingSummary = req.requiredPerDay === Infinity
      ? `${actualRemain.toFixed(1)} hr remaining (past due)`
      : `${actualRemain.toFixed(1)} hr remaining over ${remainingDays} ${daysLabel}`;
    if (backlogHours > 0){
      remainingSummary += ` • Queue total ${remainingHours.toFixed(1)} hr`;
    }
    const slackSummary = req.requiredPerDay === Infinity
      ? ""
      : `${slackHours >= 0 ? "+" : "−"}${Math.abs(slackHours).toFixed(1)} hr capacity`;
    let reqCell = (req.requiredPerDay === Infinity)
      ? `<span class="danger">Past due / no days remaining</span>`
      : `${req.requiredPerDay.toFixed(2)} hr/day needed (capacity ${hoursPerDay.toFixed(1)} hr/day) <span class="muted">(${remainingHours.toFixed(1)} hr over ${remainingDays} ${daysLabel})</span>`;
    if (backlogSummary){
      reqCell += `<div class="small muted">Includes ${escapeHtml(backlogSummary)}</div>`;
    }
    const noteAuto = eff.usedAutoFromManual
      ? `<div class="small"><strong>Auto from last manual</strong>: continuing at ${configuredDailyHours()} hr/day.</div>`
      : (eff.usedFromStartAuto ? `<div class="small"><strong>Auto</strong>: assuming ${configuredDailyHours()} hr/day from start.</div>` : ``);
    const startDate = parseDateLocal(j.startISO);
    const dueDate   = parseDateLocal(j.dueISO);
    const startTxt  = startDate ? startDate.toDateString() : "—";
    const dueTxt    = dueDate   ? dueDate.toDateString()   : "—";
    const chargeRateVal = Number.isFinite(Number(eff.chargeRate)) && Number(eff.chargeRate) >= 0
      ? Number(eff.chargeRate)
      : (Number.isFinite(Number(j.chargeRate)) && Number(j.chargeRate) >= 0 ? Number(j.chargeRate) : JOB_RATE_PER_HOUR);
    const matTotalActive = (Number(j.materialCost)||0) * (Number(j.materialQty)||0);
    const estHoursActive = Number(j.estimateHours) || 0;
    const fallbackCostRateActive = JOB_BASE_COST_PER_HOUR + (estHoursActive > 0 ? (matTotalActive / estHoursActive) : 0);
    const costRateVal = Number.isFinite(Number(eff.costRate))
      ? Number(eff.costRate)
      : fallbackCostRateActive;
    const netRateVal = Number.isFinite(Number(eff.netRate))
      ? Number(eff.netRate)
      : chargeRateVal - costRateVal;
    const chargeRateText = formatRate(chargeRateVal);
    const costRateText = formatRate(costRateVal);
    const netRateText = formatRate(netRateVal, { showPlus: true });
    const actualHoursActive = Number.isFinite(Number(eff.actualHours)) && Number(eff.actualHours) > 0
      ? Number(eff.actualHours)
      : 0;
    const hoursForNetActive = estHoursActive > 0 ? estHoursActive : actualHoursActive;
    const netTotalVal = hoursForNetActive > 0 ? (netRateVal * hoursForNetActive) : 0;
    const netTotalText = Number.isFinite(netTotalVal)
      ? `${netTotalVal >= 0 ? "+" : "−"}$${Math.abs(netTotalVal).toFixed(2)}`
      : "—";
    const netTotalHtml = `${escapeHtml(netTotalText)}${netRateText !== "—" ? ` <span class="muted">@ ${escapeHtml(netRateText)}</span>` : ""}`;
    b.innerHTML = `
      <div class="bubble-title">${j.name}</div>
      <div class="bubble-kv"><span>Estimate:</span><span>${j.estimateHours} hrs</span></div>
      <div class="bubble-kv"><span>Material:</span><span>${j.material || "—"}</span></div>
      <div class="bubble-kv"><span>Schedule:</span><span>${startTxt} → ${dueTxt}</span></div>
      <div class="bubble-kv"><span>Priority:</span><span>Priority ${jobPriority}</span></div>
      <div class="bubble-kv"><span>Queue ahead:</span><span>${backlogHours > 0 ? `${backlogHours.toFixed(1)} hr` : "None"}</span></div>
      <div class="bubble-kv"><span>Queue total:</span><span>${remainingHours.toFixed(1)} hr</span></div>
      <div class="bubble-kv"><span>Charge rate:</span><span>${escapeHtml(chargeRateText)}</span></div>
      <div class="bubble-kv"><span>Cost rate:</span><span>${escapeHtml(costRateText)}</span></div>
      <div class="bubble-kv"><span>Net profit/hr:</span><span>${escapeHtml(netRateText)}</span></div>
      <div class="bubble-kv"><span>Status:</span><span>${escapeHtml(statusLabel)}${statusDetail ? ` — ${escapeHtml(statusDetail)}` : ""}</span></div>
      <div class="bubble-kv"><span>Remaining:</span><span>${escapeHtml(remainingSummary)}${slackSummary ? ` <span class="muted">(${escapeHtml(slackSummary)})</span>` : ""}</span></div>
      <div class="bubble-kv"><span>Net total:</span><span>${netTotalHtml}</span></div>
      <div class="bubble-kv"><span>Required/day:</span><span>${reqCell}</span></div>
      <div class="bubble-kv"><span>Notes:</span><span>${j.notes || "—"}</span></div>
      ${noteAuto}
      <div class="bubble-actions">
        <button type="button" data-bbl-complete-job="${j.id}">Mark complete</button>
        <button type="button" data-bbl-edit-job="${j.id}">Edit</button>
        <button type="button" class="danger" data-bbl-remove-job="${j.id}">Remove</button>
      </div>`;
    b.querySelector("[data-bbl-complete-job]")?.addEventListener("click", ()=>{
      const completed = typeof completeCuttingJob === "function" ? completeCuttingJob(j.id) : null;
      if (!completed){ toast("Unable to mark job complete"); return; }
      saveCloudDebounced();
      toast("Job marked complete");
      hideBubble();
      rerenderCalendarKeepScroll();
      if (typeof window.location === "object" && window.location.hash === "#/jobs" && typeof renderJobs === "function"){
        renderJobs();
      }
    });
    b.querySelector("[data-bbl-remove-job]")?.addEventListener("click", ()=>{
      try {
        if (typeof recordDeletedItem === "function"){
          recordDeletedItem("job", j, {});
        }
      } catch (err) {
        console.warn("Failed to record deleted job from calendar", err);
      }
      cuttingJobs = cuttingJobs.filter(x=>String(x.id)!==String(j.id)); window.cuttingJobs = cuttingJobs; saveCloudDebounced(); toast("Removed"); hideBubble(); route();
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
  rerenderCalendarKeepScroll();
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
  rerenderCalendarKeepScroll();
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
    if (typeof isCalendarHoursEditing === "function" && isCalendarHoursEditing()) return;
    const el = e.target.closest("[data-cal-job], [data-cal-task], [data-cal-v2-one-time], [data-cal-garnet]");
    if (!el || el === hoverTarget) return;
    hoverTarget = el;
    if (el.dataset.calJob)  showJobBubble(el.dataset.calJob, el);
    if (el.dataset.calTask) showTaskBubble(el.dataset.calTask, el, extractTaskOptions(el));
    if (el.dataset.calV2OneTime) showV2OneTimeBubble(el.dataset.calV2OneTime, el);
    if (el.dataset.calGarnet) showGarnetBubble(el.dataset.calGarnet, el);
  });
  months.addEventListener("mouseout", (e)=>{
    if (typeof isCalendarHoursEditing === "function" && isCalendarHoursEditing()) return;
    const from = e.target.closest("[data-cal-job], [data-cal-task], [data-cal-v2-one-time], [data-cal-garnet]");
    const to   = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest("[data-cal-job], [data-cal-task], [data-cal-v2-one-time], [data-cal-garnet]");
    if (from && !to) { hoverTarget = null; hideBubbleSoon(); }
  });
  months.addEventListener("click", (e)=>{
    if (typeof isCalendarHoursEditing === "function" && isCalendarHoursEditing()) return;
    const el = e.target.closest("[data-cal-job], [data-cal-task], [data-cal-v2-one-time], [data-cal-garnet]");
    if (!el) return;
    if (el.dataset.calJob)  showJobBubble(el.dataset.calJob, el);
    if (el.dataset.calTask) showTaskBubble(el.dataset.calTask, el, extractTaskOptions(el));
    if (el.dataset.calV2OneTime) showV2OneTimeBubble(el.dataset.calV2OneTime, el);
    if (el.dataset.calGarnet) showGarnetBubble(el.dataset.calGarnet, el);
  });
}

function getTaskRecurrence(task){
  if (!task || typeof task !== "object") return null;
  if (typeof normalizeTaskRecurrence === "function"){
    try { return normalizeTaskRecurrence(task); } catch (_err){}
  }
  const raw = task.recurrence && typeof task.recurrence === "object" ? task.recurrence : null;
  if (!raw) return null;
  const basis = String(raw.basis || "").toLowerCase();
  const everyRaw = Number(raw.every);
  return {
    enabled: Boolean(raw.enabled),
    basis: ["machine_hours", "calendar_day", "calendar_week", "calendar_month"].includes(basis) ? basis : "calendar_day",
    every: Number.isFinite(everyRaw) && everyRaw > 0 ? Math.max(1, Math.round(everyRaw)) : 1,
    intervalHours: Number.isFinite(Number(raw.intervalHours)) ? Number(raw.intervalHours) : null,
    startISO: normalizeDateKey(raw.startISO || task.calendarDateISO || null),
    endType: String(raw.endType || "never").toLowerCase(),
    endDateISO: normalizeDateKey(raw.endDateISO || null),
    endCount: Number.isFinite(Number(raw.endCount)) ? Math.max(1, Math.floor(Number(raw.endCount))) : null,
    completionAnchorISO: normalizeDateKey(raw.completionAnchorISO || null),
    completionAnchorHours: Number.isFinite(Number(raw.completionAnchorHours)) ? Number(raw.completionAnchorHours) : null
  };
}

function projectCalendarBasedOccurrences(task, recurrence, options = {}){
  if (!task || !recurrence || !recurrence.enabled) return [];
  if (!["calendar_day", "calendar_week", "calendar_month"].includes(recurrence.basis)) return [];
  const toDayStart = (value)=>{
    const key = normalizeDateKey(value);
    if (!key) return null;
    const parsed = parseDateLocal(key);
    if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) return null;
    parsed.setHours(0,0,0,0);
    return parsed;
  };
  const excludeSet = new Set();
  const excludeRaw = options.excludeDates;
  if (excludeRaw && typeof excludeRaw.forEach === "function"){
    excludeRaw.forEach(v => {
      const key = normalizeDateKey(v);
      if (key) excludeSet.add(key);
    });
  }
  const minOccurrences = Number.isFinite(Number(options.minOccurrences)) ? Math.max(1, Math.floor(Number(options.minOccurrences))) : 1;
  const maxOccurrences = Number.isFinite(Number(options.maxOccurrences)) ? Math.max(1, Math.floor(Number(options.maxOccurrences))) : null;
  const startDate = toDayStart(recurrence.completionAnchorISO || recurrence.startISO || task.calendarDateISO || ymd(new Date()));
  if (!startDate) return [];
  const today = new Date(); today.setHours(0,0,0,0);
  const horizon = new Date(today);
  const monthsAhead = Number.isFinite(Number(options.monthsAhead)) ? Math.max(1, Number(options.monthsAhead)) : 3;
  horizon.setMonth(horizon.getMonth() + monthsAhead);
  const every = Math.max(1, Number(recurrence.every) || 1);
  const weekDays = Array.isArray(recurrence.weekDays)
    ? recurrence.weekDays.map(v => Number(v)).filter(v => Number.isInteger(v) && v >= 0 && v <= 6)
    : [];
  const endDate = recurrence.endType === "on_date" ? toDayStart(recurrence.endDateISO) : null;
  const endCount = recurrence.endType === "after_count" ? Math.max(1, Number(recurrence.endCount) || 1) : null;
  const events = [];
  let producedCount = 0;
  const maxIterations = 720;
  if (recurrence.basis === "calendar_week" && weekDays.length){
    const startWeekAnchor = new Date(startDate);
    startWeekAnchor.setDate(startWeekAnchor.getDate() - startWeekAnchor.getDay());
    startWeekAnchor.setHours(0,0,0,0);
    for (let dayOffset = 0; dayOffset < maxIterations; dayOffset++){
      const cursor = new Date(startDate);
      cursor.setDate(cursor.getDate() + dayOffset);
      cursor.setHours(0,0,0,0);
      const day = cursor.getDay();
      if (!weekDays.includes(day)) continue;
      const diffWeeks = Math.floor((cursor.getTime() - startWeekAnchor.getTime()) / (7 * CALENDAR_DAY_MS));
      if (diffWeeks < 0) continue;
      if (diffWeeks % every !== 0) continue;
      const key = ymd(cursor);
      if (!key) continue;
      producedCount += 1;
      if (endDate && cursor.getTime() > endDate.getTime()) break;
      if (endCount != null && producedCount > endCount) break;
      if (excludeSet.has(key)) continue;
      if (cursor.getTime() >= today.getTime()){
        events.push({ dateISO: key, dueDate: new Date(cursor) });
        if (maxOccurrences != null && events.length >= maxOccurrences) break;
      }
      if (cursor.getTime() > horizon.getTime() && events.length >= minOccurrences) break;
    }
    return events;
  }
  for (let i = 0; i < maxIterations; i++){
    const cursor = new Date(startDate);
    if (recurrence.basis === "calendar_day"){
      cursor.setDate(cursor.getDate() + (i * every));
    }else if (recurrence.basis === "calendar_week"){
      cursor.setDate(cursor.getDate() + (i * every * 7));
    }else{
      cursor.setMonth(cursor.getMonth() + (i * every));
    }
    cursor.setHours(0,0,0,0);
    const key = ymd(cursor);
    if (!key) continue;
    producedCount += 1;
    if (endDate && cursor.getTime() > endDate.getTime()) break;
    if (endCount != null && producedCount > endCount) break;
    if (excludeSet.has(key)) continue;
    if (cursor.getTime() >= today.getTime()){
      events.push({ dateISO: key, dueDate: new Date(cursor) });
      if (maxOccurrences != null && events.length >= maxOccurrences) break;
    }
    if (cursor.getTime() > horizon.getTime() && events.length >= minOccurrences) break;
  }
  return events;
}

function estimateIntervalDailyHours(task, baselineEntry, today){
  const defaultHours = configuredDailyHours();
  const history = Array.isArray(task?.manualHistory) ? task.manualHistory : [];
  const historyWithHours = history
    .filter(entry => entry && entry.dateISO && Number.isFinite(Number(entry.hoursAtEntry)) && Number(entry.hoursAtEntry) >= 0)
    .map(entry => ({
      date: parseDateLocal(entry.dateISO),
      hours: Number(entry.hoursAtEntry)
    }))
    .filter(entry => entry.date instanceof Date && !Number.isNaN(entry.date.getTime()));
  historyWithHours.sort((a,b)=> a.date.getTime() - b.date.getTime());
  if (historyWithHours.length >= 2){
    const last = historyWithHours[historyWithHours.length - 1];
    const prev = historyWithHours[historyWithHours.length - 2];
    last.date.setHours(0,0,0,0);
    prev.date.setHours(0,0,0,0);
    const diffMs = last.date.getTime() - prev.date.getTime();
    if (diffMs > 0){
      const diffDays = diffMs / CALENDAR_DAY_MS;
      const diffHours = Math.max(0, last.hours - prev.hours);
      const rate = diffHours / diffDays;
      if (Number.isFinite(rate) && rate > 0){
        return rate;
      }
    }
  }
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
  const recurrence = getTaskRecurrence(task);
  if (recurrence && recurrence.enabled === false){
    return [];
  }
  if (recurrence && recurrence.enabled && recurrence.basis !== "machine_hours"){
    return projectCalendarBasedOccurrences(task, recurrence, options);
  }
  if (recurrence && recurrence.enabled && recurrence.basis === "machine_hours" && Number.isFinite(Number(recurrence.intervalHours)) && Number(recurrence.intervalHours) > 0){
    task.interval = Number(recurrence.intervalHours);
  }
  const interval = Number(task.interval);
  if (!Number.isFinite(interval) || interval <= 0) return [];

  const today = new Date(); today.setHours(0,0,0,0);
  const todayTime = today.getTime();

  const excludeListRaw = options.excludeDates;
  const excludeSet = new Set();
  const addExclude = (value)=>{
    const key = normalizeDateKey(value);
    if (key) excludeSet.add(key);
  };
  if (excludeListRaw && typeof excludeListRaw.forEach === "function"){
    try {
      excludeListRaw.forEach((value, maybeKey)=>{
        if (value == null && maybeKey != null){
          addExclude(maybeKey);
        }else{
          addExclude(value);
        }
      });
    } catch (err){
      if (typeof console !== "undefined" && console && typeof console.warn === "function"){
        console.warn("Failed to iterate excludeDates via forEach", err);
      }
    }
  } else if (excludeListRaw && typeof excludeListRaw[Symbol.iterator] === "function"){
    for (const value of excludeListRaw){
      addExclude(value);
    }
  } else if (excludeListRaw && typeof excludeListRaw === "object"){
    Object.keys(excludeListRaw).forEach(key => addExclude(key));
  }

  const minOccurrencesRaw = Number(options.minOccurrences);
  const minOccurrences = Number.isFinite(minOccurrencesRaw) && minOccurrencesRaw > 0
    ? Math.floor(minOccurrencesRaw)
    : 6;
  const maxOccurrencesRaw = Number(options.maxOccurrences);
  const maxOccurrences = Number.isFinite(maxOccurrencesRaw) && maxOccurrencesRaw > 0
    ? Math.floor(maxOccurrencesRaw)
    : null;

  const toDayStart = (value)=>{
    const key = normalizeDateKey(value);
    if (!key) return null;
    const parsed = parseDateLocal(key);
    if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) return null;
    parsed.setHours(0,0,0,0);
    return parsed;
  };

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
  let futureBaselineEntry = null;
  let futureBaselineTime = Infinity;
  for (let i = manualHistory.length - 1; i >= 0; i--){
    const entry = manualHistory[i];
    if (!entry || typeof entry.dateISO !== "string") continue;
    const entryDate = toDayStart(entry.dateISO);
    if (!entryDate) continue;
    const entryTime = entryDate.getTime();
    if (entryTime <= todayTime){
      baselineEntry = entry;
      break;
    }
    if (entryTime < futureBaselineTime){
      futureBaselineEntry = entry;
      futureBaselineTime = entryTime;
    }
  }
  if (!baselineEntry) baselineEntry = futureBaselineEntry;

  const hasBaseline = baselineEntry
    || (typeof task.calendarDateISO === "string" && task.calendarDateISO)
    || (Array.isArray(task.completedDates) && task.completedDates.length > 0);
  if (!hasBaseline) return [];

  const pickBaselineDate = (values)=>{
    if (!Array.isArray(values)) return null;
    let latestPast = null;
    let latestPastTime = -Infinity;
    let earliestFuture = null;
    let earliestFutureTime = Infinity;
    values.forEach(value => {
      const date = toDayStart(value);
      if (!date) return;
      const time = date.getTime();
      if (time <= todayTime){
        if (time > latestPastTime){
          latestPast = date;
          latestPastTime = time;
        }
      }else if (time < earliestFutureTime){
        earliestFuture = date;
        earliestFutureTime = time;
      }
    });
    return latestPast || earliestFuture || null;
  };

  let baseDate = baselineEntry?.dateISO ? toDayStart(baselineEntry.dateISO) : null;
  if (!(baseDate instanceof Date)){
    const calendarDate = typeof task.calendarDateISO === "string" ? toDayStart(task.calendarDateISO) : null;
    if (calendarDate){
      baseDate = calendarDate;
    }
  }
  if (!(baseDate instanceof Date)){
    const completedDates = Array.isArray(task.completedDates) ? task.completedDates : [];
    baseDate = pickBaselineDate(completedDates);
  }
  if (!(baseDate instanceof Date)){
    baseDate = new Date(today);
  }

  const hoursPerDay = estimateIntervalDailyHours(task, baselineEntry, today);
  const intervalDays = interval / hoursPerDay;
  if (!Number.isFinite(intervalDays) || intervalDays <= 0) return [];

  const baseTime = baseDate.getTime();
  const intervalMs = intervalDays * CALENDAR_DAY_MS;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return [];

  const monthsAheadRaw = Number(options.monthsAhead);
  const monthsAhead = Number.isFinite(monthsAheadRaw) && monthsAheadRaw > 0 ? monthsAheadRaw : 3;
  const horizonAnchor = baseTime > todayTime ? new Date(baseTime) : new Date(today);
  horizonAnchor.setHours(0,0,0,0);
  const horizon = new Date(horizonAnchor);
  horizon.setMonth(horizon.getMonth() + monthsAhead);

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
    if (excludeSet.has(key)){
      if (dueDate > horizon && dueDate > horizonAnchor && events.length >= minOccurrences){
        break;
      }
      continue;
    }
    events.push({ dateISO: key, dueDate });
    if (dueDate > horizon && dueDate > horizonAnchor && events.length >= minOccurrences){
      break;
    }
  }

  if (!events.length){
    let attempt = 1;
    while (attempt <= maxIterations){
      const fallbackDue = new Date(baseTime + (attempt * intervalMs));
      fallbackDue.setHours(0,0,0,0);
      const key = ymd(fallbackDue);
      if (key && !excludeSet.has(key)){
        events.push({ dateISO: key, dueDate: fallbackDue });
        break;
      }
      attempt++;
    }
  }

  events.sort((a,b)=> a.dateISO.localeCompare(b.dateISO));
  if (maxOccurrences != null) return events.slice(0, maxOccurrences);
  return events;
}


function restoreCriticalIntervalTasks(){
  const tasks = Array.isArray(window.tasksInterval) ? window.tasksInterval : [];
  if (!tasks.length) return false;
  const targets = new Set(["mixing_tube_rotation", "jewel_nozzle_clean", "pump_rebuild", "pump_tube_noz_filter"]);
  let changed = false;
  const deleted = Array.isArray(window.deletedItems) ? window.deletedItems : [];
  const restoreFromTrash = (matchFn)=>{
    if (typeof restoreDeletedItem !== "function") return false;
    const entry = deleted.find(item => item && item.type === "task" && matchFn(String(item.payload?.id || "").toLowerCase(), String(item.payload?.name || "").toLowerCase()));
    if (!entry || !entry.id) return false;
    try {
      const result = restoreDeletedItem(entry.id);
      return Boolean(result && result.ok);
    } catch (_err){
      return false;
    }
  };
  if (restoreFromTrash((id,name)=> id.includes("mixing_tube_rotation") || name.includes("mixing tube rotation"))) changed = true;
  if (restoreFromTrash((id,name)=> id.includes("pump_tube_noz_filter") || (name.includes("mixing tube") && name.includes("replace")) || (name.includes("pump tube") && name.includes("nozzle filter")))) changed = true;
  if (restoreFromTrash((id,name)=> id.includes("jewel_nozzle_clean") || (name.includes("jew") && name.includes("orifice") && name.includes("nozzle")))) changed = true;
  if (restoreFromTrash((id,name)=> id.includes("pump_rebuild") || (name.includes("pump") && name.includes("rebuild")))) changed = true;
  const matched = [];
  tasks.forEach(task => {
    if (!task) return;
    const key = String(task.templateId != null ? task.templateId : task.id || "").trim().toLowerCase();
    const name = String(task.name || "").trim().toLowerCase();
    const matches = targets.has(key)
      || name.includes("mixing tube rotation")
      || name.includes("jew") && name.includes("orifice") && name.includes("nozzle")
      || name.includes("pump") && name.includes("rebuild")
      || name.includes("mixing tube") && name.includes("replace")
      || name.includes("pump tube") && name.includes("nozzle filter");
    if (!matches) return;
    matched.push(task);

    if (task.calendarKilled === true){ task.calendarKilled = false; changed = true; }
    if (task.recurrence && typeof task.recurrence === "object" && task.recurrence.enabled === false){
      task.recurrence = { ...task.recurrence, enabled: true };
      changed = true;
    }
    if (Array.isArray(task.removedOccurrences) && task.removedOccurrences.length){
      task.removedOccurrences = [];
      changed = true;
    }
    if (Array.isArray(task.manualHistory)){
      const next = task.manualHistory.filter(entry => entry && entry.status !== "removed");
      if (next.length !== task.manualHistory.length){
        task.manualHistory = next;
        changed = true;
      }
    }
  });

  const hasInstanceForTemplate = (templateId)=> tasks.some(item => item && isInstanceTask(item) && String(item.templateId || "") === String(templateId || ""));
  matched.forEach(task => {
    if (!isTemplateTask(task)) return;
    const templateId = task.templateId != null ? task.templateId : task.id;
    if (hasInstanceForTemplate(templateId)) return;
    if (typeof scheduleExistingIntervalTask === "function"){
      const created = scheduleExistingIntervalTask(task, { dateISO: ymd(new Date()), refreshDashboard: false });
      if (created) changed = true;
    }
  });

  return changed;
}

function renderCalendar(){
  if (restoreCriticalIntervalTasks()){
    if (typeof saveCloudDebounced === "function") saveCloudDebounced();
  }
  const container = $("#months");
  if (!container) return;
  let showAll = Boolean(window.__calendarShowAllMonths);
  const monthOffsetRaw = Number(window.__calendarMonthOffset);
  const monthOffset = Number.isFinite(monthOffsetRaw) ? Math.min(12, Math.max(-12, Math.round(monthOffsetRaw))) : 0;
  window.__calendarMonthOffset = monthOffset;
  const editingHours = isCalendarHoursEditing();
  const hoursPerDay = configuredTaskDurationDailyHours();
  const hoursMap = typeof getDailyCutHoursMap === "function" ? getDailyCutHoursMap() : new Map();
  container.innerHTML = "";
  const block = container.closest(".calendar-block");
  if (block){
    block.classList.toggle("calendar-block--hours-editing", editingHours);
  }

  const dueMap = {};
  const pumpMap = {};
  const normalizeTime = (value)=> typeof pumpNormalizeTimeValue === "function"
    ? pumpNormalizeTimeValue(value, "")
    : (typeof normalizeTimeString === "function" ? normalizeTimeString(value) : (value || ""));
  const formatPumpTime = (value)=> typeof pumpFormatTimeLabel === "function"
    ? pumpFormatTimeLabel(value)
    : value;
  const pumpEntries = typeof pumpEnsureEntriesArray === "function"
    ? pumpEnsureEntriesArray()
    : (Array.isArray(window?.pumpEff?.entries) ? window.pumpEff.entries : []);
  pumpEntries.forEach(entry => {
    if (!entry) return;
    const key = normalizeDateKey(entry.dateISO);
    if (!key) return;
    const rpmVal = Number(entry.rpm);
    const rpmLabel = Number.isFinite(rpmVal) ? `${rpmVal.toLocaleString()} RPM` : null;
    const normalizedTime = normalizeTime(entry.timeISO || entry.time || "");
    const timeLabel = normalizedTime ? formatPumpTime(normalizedTime) : "";
    const labelParts = [];
    if (rpmLabel) labelParts.push(rpmLabel);
    if (timeLabel) labelParts.push(timeLabel);
    const label = labelParts.join(" @ ") || "Pump log";
    const timeMinutes = typeof timeStringToMinutes === "function"
      ? (timeStringToMinutes(normalizedTime) ?? 0)
      : 0;
    (pumpMap[key] ||= []).push({ type:"pump", name: label, rpm: rpmVal, timeISO: normalizedTime, timeMinutes, dateISO: key });
  });
  Object.keys(pumpMap).forEach(key => {
    pumpMap[key].sort((a,b)=> (a.timeMinutes ?? 0) - (b.timeMinutes ?? 0));
  });
  const splitTaskDuration = (startKey, hours)=>{
    const baseKey = normalizeDateKey(startKey);
    if (!baseKey) return [];
    const totalHours = Number.isFinite(hours) && hours > 0 ? hours : null;
    const startDate = parseDateLocal(baseKey);
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())){
      return [{ dateISO: baseKey, hours: totalHours, index: 0, count: 1 }];
    }
    if (totalHours == null){
      return [{ dateISO: baseKey, hours: null, index: 0, count: 1 }];
    }
    let remaining = totalHours;
    const segments = [];
    const cursor = new Date(startDate.getTime());
    const safetyMax = 365;
    for (let i = 0; i < safetyMax && remaining > 0.0001; i++){
      const allocation = Math.min(hoursPerDay, remaining);
      segments.push({ dateISO: ymd(cursor), hours: allocation, index: i, count: 0 });
      remaining -= allocation;
      cursor.setDate(cursor.getDate() + 1);
    }
    const count = Math.max(1, segments.length);
    segments.forEach(seg => { seg.count = count; });
    if (!segments.length){
      segments.push({ dateISO: baseKey, hours: totalHours, index: 0, count: 1 });
    }
    return segments;
  };
  function resolveTaskDowntimeHours(task, startDateKey){
    const occurrenceOverride = startDateKey ? getOccurrenceHoursForTask(task, startDateKey) : null;
    if (occurrenceOverride != null) return occurrenceOverride;
    const raw = Number(task?.downtimeHours);
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw * 100) / 100 : null;
  }
  function pushTaskEvent(task, iso, status){
    if (!task || !iso) return;
    const key = normalizeDateKey(iso);
    if (!key) return;
    const downtimeHours = resolveTaskDowntimeHours(task, key);
    const segments = splitTaskDuration(key, downtimeHours);
    const statusKey = status || "due";
    const statusPriority = { completed: 3, manual: 2, due: 1 };
    segments.forEach(seg => {
      const segKey = seg.dateISO;
      if (!segKey) return;
      const events = dueMap[segKey] ||= [];
      const baseId = String(task.id);
      const compositeId = seg.count > 1 ? `${baseId}__seg${seg.index}` : baseId;
      const templateKey = String(task.templateId != null ? task.templateId : task.id);
      const existing = events.find(ev => ev.type === "task" && ev.id === compositeId);
      if (existing){
        existing.name = task.name;
        const existingStatus = existing.status || "due";
        const existingPriority = statusPriority[existingStatus] || 1;
        const nextPriority = statusPriority[statusKey] || 1;
        if (nextPriority >= existingPriority){
          existing.status = statusKey;
        }
        existing.mode = task && task.mode === "asreq" ? "asreq" : "interval";
        existing.dateISO = segKey;
        existing.durationHours = seg.hours;
        existing.segmentIndex = seg.index;
        existing.segmentCount = seg.count;
        existing.totalDowntimeHours = downtimeHours;
        existing.taskId = baseId;
        existing.taskStartsOn = key;
        existing.templateKey = templateKey;
        return;
      }
      const duplicateByTemplate = events.find(ev =>
        ev.type === "task"
        && String(ev.templateKey || ev.taskId || ev.id) === templateKey
        && String(ev.taskStartsOn || ev.dateISO || "") === String(key)
        && Number(ev.segmentIndex || 0) === Number(seg.index || 0)
      );
      if (duplicateByTemplate){
        const statusPriority = { completed: 3, manual: 2, due: 1 };
        const nextPriority = statusPriority[statusKey] || 1;
        const existingPriority = statusPriority[duplicateByTemplate.status || "due"] || 1;
        if (nextPriority >= existingPriority){
          duplicateByTemplate.status = statusKey;
          duplicateByTemplate.name = task.name;
          duplicateByTemplate.mode = task && task.mode === "asreq" ? "asreq" : "interval";
          duplicateByTemplate.durationHours = seg.hours;
          duplicateByTemplate.totalDowntimeHours = downtimeHours;
        }
        return;
      }
      events.push({
        type: "task",
        id: compositeId,
        taskId: baseId,
        templateKey,
        name: task.name,
        status: statusKey,
        mode: task && task.mode === "asreq" ? "asreq" : "interval",
        dateISO: segKey,
        durationHours: seg.hours,
        segmentIndex: seg.index,
        segmentCount: seg.count,
        totalDowntimeHours: downtimeHours,
        taskStartsOn: key
      });
    });
  }

  const intervalTasks = Array.isArray(window.tasksInterval)
    ? window.tasksInterval.filter(t => t && t.mode === "interval" && isInstanceTask(t))
    : [];
  const completedByTask = new Map();
  intervalTasks.forEach(t => {
    if (!t) return;
    const rawDates = Array.isArray(t.completedDates) ? t.completedDates : [];
    const set = new Set();
    rawDates.map(normalizeDateKey).filter(Boolean).forEach(key => set.add(key));
    completedByTask.set(String(t.id), set);
  });
  intervalTasks.forEach(t => {
    if (!t) return;
    const taskKey = String(t.id);
    const removedSet = normalizeRemovedOccurrences(t);
    let completedKeys = completedByTask.get(taskKey);
    if (!(completedKeys instanceof Set)){
      completedKeys = new Set();
      completedByTask.set(taskKey, completedKeys);
    }
    completedKeys.forEach(dateKey => {
      if (!dateKey) return;
      if (removedSet.has(dateKey)) return;
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
      if (status === "removed"){
        manualDates.add(entryKey);
        return;
      }
      manualDates.add(entryKey);
    });

    const manualKey = normalizeDateKey(t.calendarDateISO);
    if (manualKey) manualDates.add(manualKey);

    removedSet.forEach(dateKey => manualDates.add(dateKey));

    manualDates.forEach(dateKey => {
      if (!dateKey) return;
      if (completedKeys.has(dateKey)) return;
      if (removedSet.has(dateKey)) return;
      // Checkpoint: hide legacy active calendar clutter; preserve task definitions and history data.
    });

    const skipDates = new Set(completedKeys);
    manualDates.forEach(dateKey => skipDates.add(dateKey));
    removedSet.forEach(dateKey => skipDates.add(dateKey));
    const projections = projectIntervalDueDates(t, {
      monthsAhead: 3,
      excludeDates: skipDates,
      minOccurrences: 1,
      maxOccurrences: 1
    });
    if (projections.length){
      const pred = projections[0];
      const dueKey = normalizeDateKey(pred?.dateISO);
      if (dueKey && !completedKeys.has(dueKey) && (!manualKey || manualKey !== dueKey || completedKeys.has(dueKey))){
        // Checkpoint: hide legacy active calendar clutter; preserve task definitions and history data.
      }
      return;
    }

    const nd = nextDue(t);
    if (!nd) return;
    const dueKey = normalizeDateKey(nd.due);
    if (!dueKey) return;
    if (completedKeys.has(dueKey)) return;
    if (!manualKey || manualKey !== dueKey){
      // Checkpoint: hide legacy active calendar clutter; preserve task definitions and history data.
    }
  });

  const asReqTasks = Array.isArray(window.tasksAsReq) ? window.tasksAsReq : [];
  const hasLegacyHistoryEvidence = (task)=>{
    if (!task || typeof task !== "object") return false;
    if (Array.isArray(task.completedDates) && task.completedDates.some(Boolean)) return true;
    if (Array.isArray(task.manualHistory) && task.manualHistory.some(Boolean)) return true;
    if (task.occurrenceHours && typeof task.occurrenceHours === "object" && Object.keys(task.occurrenceHours).length) return true;
    if (task.occurrenceNotes && typeof task.occurrenceNotes === "object" && Object.keys(task.occurrenceNotes).length) return true;
    return false;
  };
  asReqTasks.forEach(t => {
    if (!t) return;
    const completedDates = new Set(Array.isArray(t.completedDates) ? t.completedDates.map(normalizeDateKey).filter(Boolean) : []);
    completedDates.forEach(dateKey => {
      if (dateKey) pushTaskEvent(t, dateKey, "completed");
    });
    const manualKey = normalizeDateKey(t.calendarDateISO);
    if (manualKey){
      if (completedDates.has(manualKey)) pushTaskEvent(t, manualKey, "completed");
    }
    const recurrence = getTaskRecurrence(t);
    const templateLike = typeof isTemplateTask === "function" ? isTemplateTask(t) : (!t.templateId || String(t.templateId) === String(t.id));
    const shouldSuppressLegacySchedule = templateLike && !hasLegacyHistoryEvidence(t);
    if (recurrence && recurrence.enabled && !shouldSuppressLegacySchedule){
      const skipDates = new Set(completedDates);
      if (manualKey) skipDates.add(manualKey);
      const projections = projectCalendarBasedOccurrences(t, recurrence, {
        monthsAhead: 3,
        excludeDates: skipDates,
        minOccurrences: 1,
        maxOccurrences: 1
      });
      if (projections.length){
        const dueKey = normalizeDateKey(projections[0].dateISO);
        if (dueKey && !completedDates.has(dueKey) && (!manualKey || manualKey !== dueKey)){
          // Checkpoint: hide legacy active calendar clutter; preserve task definitions and history data.
        }
      }
    }
  });

  const v2TaskLookup = new Map();
  (Array.isArray(window.maintenanceTasksV2) ? window.maintenanceTasksV2 : []).forEach(entry => {
    if (!entry || entry.id == null) return;
    v2TaskLookup.set(String(entry.id), entry);
  });
  const v2InstanceLookup = new Map();
  (Array.isArray(window.maintenanceCalendarInstancesV2) ? window.maintenanceCalendarInstancesV2 : []).forEach(entry => {
    if (!entry || entry.id == null) return;
    if (String(entry.system || "") !== "v2" && Number(entry.schemaVersion || 0) < 2) return;
    if (String(entry.instanceMode || "") !== "one_time") return;
    v2InstanceLookup.set(String(entry.id), entry);
  });
  const oneTimeLookup = {};
  const seenV2ChipKeys = new Set();
  (Array.isArray(window.maintenanceOccurrencesV2) ? window.maintenanceOccurrencesV2 : []).forEach(event => {
    if (!event || event.id == null) return;
    if (String(event.system || "") !== "v2" && Number(event.schemaVersion || 0) < 2) return;
    const instanceId = event.instanceId != null ? String(event.instanceId) : "";
    const instance = v2InstanceLookup.get(instanceId);
    if (!instance) return;
    const eventType = String(event.eventType || "");
    if (eventType !== "scheduled") return;
    const dateISO = normalizeDateKey(event.effectiveDateISO || event.dateISO || instance.startDateISO || null);
    if (!dateISO) return;
    const task = v2TaskLookup.get(String(instance.taskId || event.taskId || "")) || null;
    const name = String(event.taskName || (task && task.name) || "Maintenance reminder");
    const occurrenceId = String(event.id);
    const rootOccurrenceId = occurrenceId;
    const { status, note, hours } = resolveV2OneTimeOccurrenceState(rootOccurrenceId, event);
    const mapKey = `${occurrenceId}:${dateISO}`;
    if (seenV2ChipKeys.has(mapKey)) return;
    seenV2ChipKeys.add(mapKey);
    oneTimeLookup[occurrenceId] = {
      occurrenceId,
      eventType,
      instanceId,
      taskId: String(instance.taskId || event.taskId || ""),
      dateISO,
      name,
      note,
      hours,
      status
    };
    if (status === "removed") return;
    (dueMap[dateISO] ||= []).push({
      type: "v2task",
      id: `v2-one-time:${occurrenceId}`,
      occurrenceId,
      instanceId,
      name,
      status: status === "completed" ? "completed" : "manual",
      mode: "one_time_v2",
      dateISO
    });
  });
  window.__calendarV2OneTimeLookup = oneTimeLookup;

  const repeatInstances = (Array.isArray(window.maintenanceCalendarInstancesV2) ? window.maintenanceCalendarInstancesV2 : [])
    .filter(entry => entry
      && String(entry.instanceMode || "") === "repeat"
      && String(entry.status || "active") !== "stopped"
      && (String(entry.system || "") === "v2" || Number(entry.schemaVersion || 0) >= 2));
  repeatInstances.forEach(instance => {
    const dates = projectV2RepeatDates(instance);
    dates.forEach(dateISO => {
      const state = resolveV2RepeatOccurrenceState(instance.id, dateISO);
      if (state.status === "removed") return;
      const task = v2TaskLookup.get(String(instance.taskId || "")) || null;
      (dueMap[dateISO] ||= []).push({
        type: "v2repeat",
        id: state.key,
        instanceId: String(instance.id),
        taskId: String(instance.taskId || ""),
        dateISO,
        name: String((task && task.name) || "Maintenance repeat"),
        status: state.status === "completed" ? "completed" : "manual",
        mode: "repeat_v2",
        repeatView: {
          rootOccurrenceId: state.key,
          instanceId: String(instance.id),
          taskId: String(instance.taskId || ""),
          dateISO,
          name: String((task && task.name) || "Maintenance repeat"),
          note: state.note,
          hours: state.hours,
          status: state.status,
          repeatType: String(instance.repeatRule?.basis || "") === "machine_hours" ? "Machine-hour predicted repeat" : "Calendar repeat"
        }
      });
    });
  });

  const repeatEvents = Array.isArray(window.maintenanceOccurrencesV2) ? window.maintenanceOccurrencesV2 : [];
  const repeatHistoryLatest = new Map();
  repeatEvents.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    if (String(entry.system || "") !== "v2" && Number(entry.schemaVersion || 0) < 2) return;
    const rootId = String(entry.rootOccurrenceId || "");
    if (!rootId.startsWith("repeat:")) return;
    const prev = repeatHistoryLatest.get(rootId);
    if (!prev){
      repeatHistoryLatest.set(rootId, { entry, index });
      return;
    }
    const prevTs = Date.parse(String(prev.entry.recordedAtISO || ""));
    const nextTs = Date.parse(String(entry.recordedAtISO || ""));
    const chooseNext = (Number.isFinite(nextTs) && Number.isFinite(prevTs) && nextTs >= prevTs)
      || (Number.isFinite(nextTs) && !Number.isFinite(prevTs))
      || (!Number.isFinite(nextTs) && !Number.isFinite(prevTs) && index >= prev.index);
    if (chooseNext) repeatHistoryLatest.set(rootId, { entry, index });
  });
  repeatHistoryLatest.forEach(({ entry }, rootId) => {
    const latestType = String(entry.eventType || "");
    if (!["completed", "uncompleted", "note_set", "hours_set"].includes(latestType)) return;
    const dateISO = normalizeDateKey(entry.effectiveDateISO || null) || String(rootId).split(":").slice(-1)[0];
    if (!dateISO) return;
    const instanceId = String(entry.instanceId || "");
    const taskId = String(entry.taskId || "");
    const task = v2TaskLookup.get(taskId) || null;
    const state = resolveV2RepeatOccurrenceState(instanceId, dateISO);
    if (state.status === "removed") return;
    const exists = (dueMap[dateISO] || []).some(item => item && item.type === "v2repeat" && String(item.id || "") === rootId);
    if (exists) return;
    (dueMap[dateISO] ||= []).push({
      type: "v2repeat",
      id: rootId,
      instanceId,
      taskId,
      dateISO,
      name: String((task && task.name) || "Maintenance repeat"),
      status: state.status === "completed" ? "completed" : "manual",
      mode: "repeat_v2",
      repeatView: {
        rootOccurrenceId: rootId,
        instanceId,
        taskId,
        dateISO,
        name: String((task && task.name) || "Maintenance repeat"),
        note: state.note,
        hours: state.hours,
        status: state.status === "completed" ? "completed" : "scheduled",
        repeatType: "Repeat history"
      }
    });
  });

  const jobsMap = {};
  const activeJobs = normalizeJobList(
    Array.isArray(window.cuttingJobs) || (window.cuttingJobs && typeof window.cuttingJobs === "object")
      ? window.cuttingJobs
      : ((typeof cuttingJobs !== "undefined") ? cuttingJobs : [])
  );
  const resolveJobRange = (job)=>{
    if (!job || typeof job !== "object") return { start:null, end:null };
    const startCandidate = job.startISO ?? job.startDate ?? job.start ?? job.startAtISO ?? job.start_at ?? job.createdAt ?? null;
    const endCandidate = job.dueISO ?? job.dueDate ?? job.endISO ?? job.endDate ?? job.end ?? job.completedAtISO ?? job.completedAt ?? null;
    const start = parseDateLocal(startCandidate);
    const end = parseDateLocal(endCandidate);
    if (start && end) return { start, end };
    if (start && !end) return { start, end: new Date(start.getTime()) };
    if (!start && end) return { start: new Date(end.getTime()), end };
    return { start:null, end:null };
  };
  activeJobs.forEach(j => {
    const { start, end } = resolveJobRange(j);
    if (!start || !end) return;
    start.setHours(0,0,0,0);
    end.setHours(0,0,0,0);
    const from = start.getTime() <= end.getTime() ? start : end;
    const to = start.getTime() <= end.getTime() ? end : start;
    const cur = new Date(from.getTime());
    while (cur <= to){
      const key = ymd(cur);
      (jobsMap[key] ||= []).push({ type:"job", id:String(j.id), name:j.name, status:"active", cat:j.cat });
      cur.setDate(cur.getDate()+1);
    }
  });

  const completedJobs = normalizeJobList(window.completedCuttingJobs);
  completedJobs.forEach(job => {
    if (!job) return;
    const { start, end } = resolveJobRange(job);
    if (start && end){
      start.setHours(0,0,0,0);
      end.setHours(0,0,0,0);
      const from = start.getTime() <= end.getTime() ? start : end;
      const to = start.getTime() <= end.getTime() ? end : start;
      const cur = new Date(from.getTime());
      while (cur <= to){
        const key = ymd(cur);
        (jobsMap[key] ||= []).push({ type:"job", id:String(job.id), name:job.name, status:"completed", cat:job.cat });
        cur.setDate(cur.getDate()+1);
      }
      return;
    }
    const completionKey = job.completedAtISO ? ymd(job.completedAtISO) : (job.dueISO ? ymd(job.dueISO) : null);
    if (!completionKey) return;
    (jobsMap[completionKey] ||= []).push({ type:"job", id:String(job.id), name:job.name, status:"completed", cat:job.cat });
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
  const anchorMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  let maxMonthsNeeded = 12;
  const scheduleKeys = [...Object.keys(dueMap), ...Object.keys(pumpMap)];
  if (scheduleKeys.length){
    let latest = null;
    scheduleKeys.forEach(key => {
      const normalized = normalizeDateKey(key);
      if (!normalized) return;
      if (!latest || normalized > latest){
        latest = normalized;
      }
    });
    if (latest){
      const latestDate = parseDateLocal(latest);
      if (latestDate instanceof Date && !Number.isNaN(latestDate.getTime())){
        latestDate.setHours(0,0,0,0);
        const diffMonths = (latestDate.getFullYear() - anchorMonth.getFullYear()) * 12
          + (latestDate.getMonth() - anchorMonth.getMonth());
        const required = diffMonths + 1;
        if (Number.isFinite(required)){
          const limited = Math.min(Math.max(Math.round(required), 1), 12);
          if (limited > maxMonthsNeeded){
            maxMonthsNeeded = limited;
          }
        }
      }
    }
  }

  const expandedMonths = Math.max(maxMonthsNeeded, 12);
  window.__calendarAvailableMonths = expandedMonths;

  const expanded = Boolean(showAll);
  if (block){
    block.classList.toggle("calendar-block--expanded", expanded);
    block.classList.toggle("calendar-block--compact", !expanded);
  }

  const toggleBtn = document.getElementById("calendarToggleBtn");
  if (toggleBtn){
    toggleBtn.hidden = false;
    toggleBtn.textContent = expanded ? "Show 3 Months" : "Show All Months";
    toggleBtn.setAttribute("aria-pressed", expanded ? "true" : "false");
    toggleBtn.title = expanded
      ? "Collapse to show a 3-month window"
      : `Expand to view all ${expandedMonths} months`;
  }

  const rangeLabel = document.getElementById("calendarRangeLabel");
  if (rangeLabel){
    const endOfRange = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth() + (expanded ? expandedMonths : 3) - 1, 1);
    const startLabel = anchorMonth.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    const endLabel = endOfRange.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    rangeLabel.textContent = startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
  }
  const prevBtn = document.getElementById("calendarPrevMonthBtn");
  const nextBtn = document.getElementById("calendarNextMonthBtn");
  if (prevBtn) prevBtn.disabled = monthOffset <= -12;
  if (nextBtn) nextBtn.disabled = monthOffset >= 12;

  let monthsToRender = expanded ? expandedMonths : 3;
  monthsToRender = Math.max(1, Math.round(monthsToRender));

  for (let m=0; m<monthsToRender; m++){
    const first = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth()+m, 1);
    const last  = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth()+m+1, 0);

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
      const pendingValue = getCalendarPendingHours(key);
      const record = hoursMap.get(key);
      const baseHours = record && record.hours != null ? clampDailyCutHours(record.hours) : 0;
      const hoursValue = pendingValue != null ? pendingValue : baseHours;
      const source = pendingValue != null ? "pending" : (record ? record.source : null);
      const hoursEl = document.createElement("div");
      hoursEl.className = "day-hours";
      hoursEl.textContent = formatCalendarDayHours(hoursValue);
      hoursEl.setAttribute("data-day-hours-value", String(hoursValue));
      cell.appendChild(hoursEl);
      if (source === "pending"){
        cell.classList.add("day-hours-pending");
        hoursEl.classList.add("is-pending");
      }else if (source === "manual"){
        cell.classList.add("day-hours-manual");
        hoursEl.classList.add("is-manual");
      }else{
        cell.classList.add("day-hours-auto");
      }
      if (editingHours){
        cell.classList.add("day--hours-editing");
        hoursEl.classList.add("is-editing");
        cell.addEventListener("click", (event)=>{
          if (!isCalendarHoursEditing()) return;
          if (event.target.closest(".day-add-bubble")) return;
          if (event.target.closest("[data-cal-task]")) return;
          if (event.target.closest("[data-cal-job]")) return;
          if (event.target.closest("[data-cal-garnet]")) return;
          event.preventDefault();
          event.stopPropagation();
          promptCalendarDayHours(key);
        });
      }
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
        if (ev.type === "v2task") cls += " v2-event";
        if (ev.status === "completed") cls += " is-complete";
        chip.className = cls;
        const baseTaskId = ev.taskId || ev.id;
        if (ev.type === "v2task" && ev.occurrenceId){
          chip.dataset.calV2OneTime = String(ev.occurrenceId);
          chip.addEventListener("click", (event)=>{
            event.preventDefault();
            event.stopPropagation();
            openV2OneTimePanel(String(ev.occurrenceId));
          });
          chip.addEventListener("mouseenter", ()=>{
            showV2OneTimeBubble(String(ev.occurrenceId), chip);
          });
        }else if (ev.type === "v2repeat" && ev.repeatView){
          chip.addEventListener("click", (event)=>{
            event.preventDefault(); event.stopPropagation();
            openV2RepeatPanel(ev.repeatView);
          });
          chip.dataset.calV2OneTime = `repeat:${ev.instanceId}:${ev.dateISO}`;
        } else {
          chip.dataset.calTask = baseTaskId;
        }
        chip.dataset.calStatus = ev.status || "due";
        if (ev.mode) chip.dataset.calMode = ev.mode;
        chip.dataset.calDate = ev.dateISO || key;
        if (ev.taskStartsOn) chip.dataset.calStart = ev.taskStartsOn;

        const hasDuration = Number.isFinite(ev.durationHours) && ev.durationHours > 0;
        const segCount = Number.isFinite(ev.segmentCount) && ev.segmentCount > 0 ? Number(ev.segmentCount) : 1;
        const segIndex = Number.isFinite(ev.segmentIndex) && ev.segmentIndex >= 0 ? Number(ev.segmentIndex) : 0;
        const durationLabel = hasDuration ? formatCalendarDayHours(ev.durationHours) : null;

        let label = ev.name;
        if (segCount > 1){
          const dayLabel = `Day ${segIndex + 1}/${segCount}`;
          label += durationLabel ? ` (${dayLabel} · ${durationLabel})` : ` (${dayLabel})`;
        }else if (durationLabel){
          label += ` (${durationLabel})`;
        }

        if (ev.status === "completed") label += " (completed)";
        else if (ev.status === "manual") label += " (scheduled)";
        else label += " (due)";
        chip.textContent = label;
        cell.appendChild(chip);
      });
      (pumpMap[key]||[]).forEach(ev=>{
        const chip = document.createElement("div");
        chip.className = "event pump cal-pump";
        chip.dataset.calPump = ev.dateISO || key;
        chip.textContent = ev.name || "Pump log";
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
        const categoryData = getJobCategoryColorData(ev.cat);
        bar.dataset.calJobCategory = categoryData.normalized;
        if (ev.status === "completed"){
          applyJobCategoryStyles(bar, categoryData.normalized);
        }
        bar.textContent = ev.status === "completed" ? `${ev.name} (completed)` : ev.name;
        cell.appendChild(bar);
      });
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "day-add-bubble";
      addBtn.textContent = "+";
      addBtn.setAttribute("aria-label", `Add item on ${date.toDateString()}`);
      if (editingHours){
        addBtn.hidden = true;
      }
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
  if (typeof updateCalendarHoursControls === "function") updateCalendarHoursControls();
}

function shiftCalendarMonthOffset(delta){
  const current = Number(window.__calendarMonthOffset) || 0;
  const next = Math.min(12, Math.max(-12, Math.round(current + delta)));
  if (next === current) return false;
  window.__calendarMonthOffset = next;
  rerenderCalendarKeepScroll();
  return true;
}

function resetCalendarMonthOffset(){
  if ((Number(window.__calendarMonthOffset) || 0) === 0) return false;
  window.__calendarMonthOffset = 0;
  rerenderCalendarKeepScroll();
  return true;
}

function toggleCalendarShowAllMonths(){
  const next = !Boolean(window.__calendarShowAllMonths);
  window.__calendarShowAllMonths = next;
  rerenderCalendarKeepScroll();
}
