/* ==================== CORE COMPUTATIONS ==================== */
const MS_PER_DAY = 24*60*60*1000;

function currentTotal(){ return totalHistory.length ? totalHistory[totalHistory.length-1].hours : null; }
function previousTotal(){ return totalHistory.length>1 ? totalHistory[totalHistory.length-2].hours : null; }
function deltaSinceLast(){
  const cur = RENDER_TOTAL ?? currentTotal();
  const prev = previousTotal();
  if (cur == null || prev == null) return 0;
  return Math.max(0, cur - prev);
}

function getDailyCutHoursMap(){
  const map = new Map();
  const list = Array.isArray(dailyCutHours) ? dailyCutHours : [];
  for (const entry of list){
    if (!entry || !entry.dateISO) continue;
    const key = normalizeDateISO(entry.dateISO);
    if (!key) continue;
    const hours = clampDailyCutHours(entry.hours);
    const source = entry.source === "manual" ? "manual" : "auto";
    map.set(key, { dateISO: key, hours, source });
  }
  return map;
}

function getTimeEfficiencyWindowMeta(days){
  const normalized = Math.max(1, Math.round(Number(days) || 0));
  const list = Array.isArray(TIME_EFFICIENCY_WINDOWS) ? TIME_EFFICIENCY_WINDOWS : [];
  const match = list.find(win => Number(win?.days) === normalized);
  if (match){
    return { ...match, days: normalized };
  }
  const label = normalized === 7 ? "1W" : `${normalized}d`;
  const description = normalized === 7
    ? "Past 7 days"
    : `Past ${normalized} day${normalized === 1 ? "" : "s"}`;
  return { key: `${normalized}d`, label, days: normalized, description };
}

function computeTimeEfficiency(rangeDays, options = {}){
  const normalizedDays = Math.max(1, Math.round(Number(rangeDays) || 0));
  const meta = getTimeEfficiencyWindowMeta(normalizedDays);
  const today = options.endDate
    ? (parseDateLocal(options.endDate) || new Date(options.endDate))
    : new Date();
  let endDate = (today instanceof Date && !Number.isNaN(today.getTime()))
    ? new Date(today.getFullYear(), today.getMonth(), today.getDate())
    : (()=>{ const d = new Date(); d.setHours(0,0,0,0); return d; })();
  endDate.setHours(0,0,0,0);

  let startDate = null;
  if (options.startDate){
    const startCandidate = parseDateLocal(options.startDate) || new Date(options.startDate);
    if (startCandidate instanceof Date && !Number.isNaN(startCandidate.getTime())){
      startDate = new Date(startCandidate.getFullYear(), startCandidate.getMonth(), startCandidate.getDate());
      startDate.setHours(0,0,0,0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + (normalizedDays - 1));
    }
  }

  if (!startDate){
    startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (normalizedDays - 1));
  }

  if (normalizedDays === 7){
    const monday = new Date(endDate);
    const day = monday.getDay();
    const offset = (day + 6) % 7; // 0 => Monday, 6 => Sunday
    monday.setDate(monday.getDate() - offset);
    monday.setHours(0,0,0,0);
    startDate = monday;
    endDate = new Date(monday);
    endDate.setDate(monday.getDate() + 6);
  }

  const map = getDailyCutHoursMap();
  let actual = 0;
  let coverage = 0;
  const cursor = new Date(startDate);
  for (let i = 0; i < normalizedDays; i++){
    const key = ymd(cursor);
    const record = map.get(key);
    const value = record ? clampDailyCutHours(record.hours) : 0;
    if (value > 0){
      coverage += 1;
    }
    actual += value;
    cursor.setDate(cursor.getDate() + 1);
  }

  const baseline = CUTTING_BASELINE_DAILY_HOURS * normalizedDays;

  const todayLocal = new Date();
  todayLocal.setHours(0,0,0,0);
  let progressDate = new Date(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate());
  progressDate.setHours(0,0,0,0);
  let elapsedDays = 0;
  if (progressDate < startDate){
    elapsedDays = 0;
    progressDate = new Date(startDate);
  } else {
    if (progressDate > endDate){
      progressDate = new Date(endDate);
    }
    elapsedDays = inclusiveDayCount(startDate, progressDate);
  }
  if (!Number.isFinite(elapsedDays)) elapsedDays = 0;
  elapsedDays = Math.max(0, Math.min(normalizedDays, Math.round(elapsedDays)));

  const targetHours = CUTTING_BASELINE_DAILY_HOURS * elapsedDays;
  const differenceToDate = actual - targetHours;
  const difference = actual - baseline;
  const percentToDate = targetHours > 0
    ? (actual / targetHours) * 100
    : (baseline > 0 ? (actual / baseline) * 100 : null);
  const percentGoal = baseline > 0 ? (actual / baseline) * 100 : null;

  return {
    windowDays: normalizedDays,
    actualHours: actual,
    baselineHours: baseline,
    differenceHours: difference,
    targetHoursToDate: targetHours,
    differenceToDateHours: differenceToDate,
    targetDaysElapsed: elapsedDays,
    efficiencyPercent: percentToDate,
    efficiencyGoalPercent: percentGoal,
    coverageDays: coverage,
    startISO: ymd(startDate),
    endISO: ymd(endDate),
    description: meta.description,
    label: meta.label,
    key: meta.key
  };
}

function syncDailyHoursFromTotals(dateISO){
  const key = normalizeDateISO(dateISO);
  if (!key || !Array.isArray(totalHistory) || !totalHistory.length) return false;
  const sorted = totalHistory
    .filter(entry => entry && entry.dateISO)
    .slice()
    .sort((a, b)=> String(a.dateISO).localeCompare(String(b.dateISO)));
  const idx = sorted.findIndex(entry => entry && normalizeDateISO(entry.dateISO) === key);
  if (idx < 0) return false;
  const current = Number(sorted[idx].hours);
  if (!Number.isFinite(current)) return false;
  let prev = null;
  for (let i = idx - 1; i >= 0; i--){
    const candidate = Number(sorted[i].hours);
    if (Number.isFinite(candidate)){
      prev = candidate;
      break;
    }
  }
  if (prev == null) return false;
  const delta = Math.max(0, current - prev);
  return setDailyCutHoursEntry(key, delta, { source: "auto", preserveManual: true });
}

function liveSince(task){
  const cur = RENDER_TOTAL ?? currentTotal();
  const delta = RENDER_DELTA ?? deltaSinceLast();
  if (task.anchorTotal != null && cur != null) return Math.max(0, cur - task.anchorTotal);
  if (task.sinceBase == null) return null;
  return (task.sinceBase + delta);
}

function nextDue(task){
  if (!task || task.interval == null) return null;
  const sinceRaw = liveSince(task);
  if (sinceRaw == null) return null;
  const since = Math.max(0, Number(sinceRaw) || 0);
  const interval = Number(task.interval);
  if (!Number.isFinite(interval) || interval <= 0) return null;
  const hoursPerDay = (typeof DAILY_HOURS === "number" && Number.isFinite(DAILY_HOURS) && DAILY_HOURS > 0)
    ? Number(DAILY_HOURS)
    : 8;
  const remain = Math.max(0, interval - since);
  const days = remain <= 0 ? 0 : Math.ceil(remain / hoursPerDay);
  const due = new Date(); due.setHours(0,0,0,0); due.setDate(due.getDate() + days);
  const lastServicedAt = (typeof RENDER_TOTAL === "number" && Number.isFinite(RENDER_TOTAL))
    ? Math.max(0, Number(RENDER_TOTAL) - since)
    : null;
  return { since, remain, days, due, lastServicedAt };
}

/* ------------ Cutting jobs efficiency model ---------------
 * Baseline assumes DAILY_HOURS capacity for every day between the
 * scheduled start and due date (inclusive).
 * plannedHours        = j.estimateHours (hours still required to finish)
 * scheduleCapacity    = DAILY_HOURS * totalScheduledDays
 * expectedHoursSoFar  = DAILY_HOURS * fully elapsed days (capped at capacity)
 * expectedRemaining   = scheduleCapacity - expectedHoursSoFar
 * actualHoursSoFar    = manual logs → machine totals → 0 when no data
 * actualRemaining     = max(0, plannedHours - actualHoursSoFar)
 * deltaHours          = expectedRemaining - actualRemaining  ( + ahead / − behind )
 * gainLoss            = deltaHours * JOB_RATE_PER_HOUR
 */


function daysBetweenUTC(startDate, endDate){
  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) return null;
  if (!(endDate   instanceof Date) || Number.isNaN(endDate.getTime()))   return null;
  const startUTC = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endUTC   = Date.UTC(endDate.getFullYear(),   endDate.getMonth(),   endDate.getDate());
  const diff = Math.floor((endUTC - startUTC) / MS_PER_DAY);
  return diff;
}

function inclusiveDayCount(startDate, endDate){
  const diff = daysBetweenUTC(startDate, endDate);
  if (diff == null) return 0;
  return diff < 0 ? 0 : diff + 1;
}

function computeJobEfficiency(job){
  // Priority for actual progress:
  // 1) Manual logs (authoritative)
  // 2) Machine total hours since job start (if no manual logs)
  // 3) No trustworthy data → assume no progress yet (0 hr)
  const planned = (job && job.estimateHours > 0) ? Number(job.estimateHours) : 0;
  const result = {
    rate: JOB_RATE_PER_HOUR,
    expectedHours: 0,
    actualHours: 0,
    expectedRemaining: 0,
    actualRemaining: 0,
    deltaHours: 0,
    gainLoss: 0,
    daysElapsed: 0,
    totalDays: 0,
    usedManual: false,
    usedMachineTotals: false,
    usedFromStartAuto: false
  };
  if (!job || !job.startISO) return result;

  // Dates
  const start = parseDateLocal(job.startISO);
  if (!start) return result;
  start.setHours(0,0,0,0);

  const dueRaw = job.dueISO ? parseDateLocal(job.dueISO) : null;
  const due = (dueRaw && dueRaw >= start) ? dueRaw : new Date(start);
  due.setHours(0,0,0,0);

  const today = new Date(); today.setHours(0,0,0,0);
  const hoursPerDay = (typeof DAILY_HOURS === "number" && Number.isFinite(DAILY_HOURS) && DAILY_HOURS > 0)
    ? Number(DAILY_HOURS)
    : 8;

  const totalDays = Math.max(1, inclusiveDayCount(start, due));
  result.totalDays = totalDays;

  let daysElapsed = 0;
  if (today > due) {
    daysElapsed = totalDays;
  }else if (today > start){
    daysElapsed = Math.min(totalDays, Math.max(0, daysBetweenUTC(start, today)));
  }
  result.daysElapsed = daysElapsed;

  const totalCapacity = totalDays * hoursPerDay;
  const expectedHours = Math.min(totalCapacity, daysElapsed * hoursPerDay);
  result.expectedHours = expectedHours;
  result.expectedRemaining = Math.max(0, totalCapacity - expectedHours);

  // Helper: machine total hours on/before a given date (00:00)
  function getHoursAt(dateISO){
    try{
      const d0 = new Date(dateISO + "T00:00:00");
      const todayISO = new Date().toISOString().slice(0,10);
      if (RENDER_TOTAL != null){
        const t0 = new Date(todayISO + "T00:00:00");
        if (d0 >= t0) return Number(RENDER_TOTAL);
      }
      if (!Array.isArray(totalHistory) || !totalHistory.length) return null;
      let best = null;
      for (const h of totalHistory){
        const d = new Date(h.dateISO + "T00:00:00");
        if (d <= d0){ if (best==null || d > new Date(best.dateISO+"T00:00:00")) best = h; }
      }
      return best ? Number(best.hours) : null;
    }catch{ return null; }
  }

  // 1) If there is any manual log on/before today, use the latest one EXACTLY (no auto add-on).
  const manualLogs = Array.isArray(job.manualLogs) ? job.manualLogs : [];
  const manualUpTo = manualLogs
    .filter(m => m && m.dateISO && new Date(m.dateISO+"T00:00:00") <= today)
    .sort((a,b)=> a.dateISO.localeCompare(b.dateISO));

  if (manualUpTo.length){
    const last = manualUpTo[manualUpTo.length-1];
    const val = Number(last.completedHours);
    result.actualHours = Math.min(planned, Math.max(0, isFinite(val) ? val : 0));
    result.usedManual = true;
  }else{
    // 2) No manual logs → try machine totals (hours since job start)
    const nowH   = (RENDER_TOTAL != null ? Number(RENDER_TOTAL) : currentTotal());
    const startH = getHoursAt(job.startISO);
    if (nowH != null && startH != null && nowH >= startH){
      result.actualHours = Math.min(planned, Math.max(0, nowH - startH));
      result.usedMachineTotals = true;
    }else{
      // 3) Fallback → assume no confirmed progress
      result.actualHours = 0;
    }
  }

  result.actualRemaining = Math.max(0, planned - result.actualHours);
  result.deltaHours      = result.expectedRemaining - result.actualRemaining;   // + ahead / − behind
  result.gainLoss        = result.deltaHours * result.rate;

  return result;
}

/* ----------- Required hrs/day to hit due date ------------- */
function computeRequiredDaily(job){
  if (!job || !job.startISO || !job.dueISO) return { remainingHours:0, remainingDays:0, requiredPerDay:0 };
  const eff = computeJobEfficiency(job);
  const planned = Number(job.estimateHours) || 0;
  const actualForRequirement = eff.usedFromStartAuto ? 0 : eff.actualHours;
  const remainingHours = Math.max(0, planned - actualForRequirement);

  const today = new Date(); today.setHours(0,0,0,0);
  const due   = parseDateLocal(job.dueISO);
  if (!due) return { remainingHours:0, remainingDays:0, requiredPerDay:0 };
  due.setHours(0,0,0,0);

  let remainingDays;
  if (today > due) remainingDays = 0;
  else remainingDays = Math.max(1, inclusiveDayCount(today, due));

  const requiredPerDay = remainingDays > 0 ? (remainingHours / remainingDays) : (remainingHours>0 ? Infinity : 0);
  return { remainingHours, remainingDays, requiredPerDay };
}

if (typeof window !== "undefined"){
  window.computeTimeEfficiency = computeTimeEfficiency;
  window.getTimeEfficiencyWindowMeta = getTimeEfficiencyWindowMeta;
  window.syncDailyHoursFromTotals = syncDailyHoursFromTotals;
  window.getDailyCutHoursMap = getDailyCutHoursMap;
}

