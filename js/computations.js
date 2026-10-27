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

// Read the same cumulative endpoints accepted by CCR. Never allocate a sparse
// meter delta to one day, cap it at 24 hours, or require daily log entries.
function computeSnapshotUsageAverage(startISO, endISO, todayISO){
  const api = typeof window !== "undefined" && window.OMAXCutCostFeedback;
  const effectiveEnd = endISO < todayISO ? endISO : todayISO;
  if (!api || startISO > effectiveEnd) return {average:null,description:"Meter average unavailable: no elapsed measurement window."};
  const reading = api.actualHours({totalHistory:typeof totalHistory === "undefined" ? [] : totalHistory},startISO,effectiveEnd);
  const days = reading.measurementStartDate && reading.measurementEndDate
    ? (Date.parse(reading.measurementEndDate+"T00:00:00Z")-Date.parse(reading.measurementStartDate+"T00:00:00Z"))/86400000 : 0;
  // Zero meter movement is a valid usage average, though not a CCR rate divisor.
  const usable = Number.isFinite(reading.hours) && days>0 && !reading.issues.some(issue=>!["invalid","zero_hours"].includes(issue.code));
  const boundary = reading.measurementStartDate < startISO || reading.measurementEndDate < effectiveEnd
    ? " Sparse readings expand the start to the prior baseline and/or end at the latest reading; this is the observed span, not an interpolated selected-period total." : "";
  return {average:usable ? reading.hours/days : null,hours:reading.hours,days,
    startISO:reading.measurementStartDate,endISO:reading.measurementEndDate,
    description:usable
      ? `${reading.hours} meter hours ÷ ${days} elapsed calendar days (${reading.measurementStartDate} baseline excluded, through ${reading.measurementEndDate} inclusive; weekends included).${boundary}${reading.issues.some(issue=>issue.code==="invalid") ? " Invalid readings ignored." : ""}`
      : `Meter average unavailable. ${reading.warnings.join(" ")}`};
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
  const configuredGoalMode = (typeof window !== "undefined" && window.appConfig)
    ? window.appConfig.timeEfficiencyGoalMode
    : null;
  const goalModeRaw = options.goalMode || configuredGoalMode || "maximum";
  const goalMode = goalModeRaw === "average" ? "average" : "maximum";
  const configuredDailyHoursRaw = (typeof getFixedDailyHours === "function")
    ? Number(getFixedDailyHours())
    : ((typeof getConfiguredDailyHours === "function")
      ? Number(getConfiguredDailyHours())
      : Number(CUTTING_BASELINE_DAILY_HOURS));
  const configuredDailyHours = (Number.isFinite(configuredDailyHoursRaw) && configuredDailyHoursRaw > 0)
    ? configuredDailyHoursRaw
    : CUTTING_BASELINE_DAILY_HOURS;
  const dashboardAverageDailyHours = (typeof getAverageDailyCutHours === "function")
    ? getAverageDailyCutHours()
    : null;
  const goalDailyHours = (goalMode === "average" && Number.isFinite(Number(dashboardAverageDailyHours)) && Number(dashboardAverageDailyHours) > 0)
    ? Number(dashboardAverageDailyHours)
    : configuredDailyHours;
  const goalDailyHoursLabel = `${Math.abs(goalDailyHours - Math.round(goalDailyHours)) < 0.05 ? Math.round(goalDailyHours) : goalDailyHours.toFixed(1)} hr`;
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

  const workingDays = inclusiveDayCount(startDate, endDate) || 0;
  const baseline = goalDailyHours * workingDays;

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

  const targetHours = goalDailyHours * elapsedDays;
  const differenceToDate = actual - targetHours;
  const difference = actual - baseline;
  const percentToDate = targetHours > 0
    ? (actual / targetHours) * 100
    : (baseline > 0 ? (actual / baseline) * 100 : null);
  const percentGoal = baseline > 0 ? (actual / baseline) * 100 : null;
  // Avoid the shared Date parser's UTC conversion of local Date instances.
  const localKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const usageAverage = computeSnapshotUsageAverage(localKey(startDate),localKey(endDate),localKey(todayLocal));

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
    goalMode,
    goalModeLabel: goalMode === "average" ? "Go off average" : "Go off maximum",
    goalDailyHours,
    goalSourceLabel: goalMode === "average"
      ? `Average cut hours/day (${goalDailyHoursLabel})`
      : `Dashboard goal hours/day (${goalDailyHoursLabel})`,
    averageDailyHours:usageAverage.average,
    usageAverage,
    startISO: localKey(startDate),
    endISO: localKey(endDate),
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
  if (!task) return null;
  const recurrence = (()=>{
    if (typeof normalizeTaskRecurrence === "function"){
      try { return normalizeTaskRecurrence(task); } catch (_err){}
    }
    return task.recurrence && typeof task.recurrence === "object" ? task.recurrence : null;
  })();
  if (recurrence && recurrence.enabled === false) return null;
  if (recurrence && recurrence.enabled && recurrence.basis && recurrence.basis !== "machine_hours"){
    const startISO = (recurrence.completionAnchorISO || recurrence.startISO || task.calendarDateISO || ymd(new Date()));
    const startDate = parseDateLocal(startISO);
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) return null;
    startDate.setHours(0,0,0,0);
    const every = Math.max(1, Number(recurrence.every) || 1);
    const due = new Date(startDate);
    if (recurrence.basis === "calendar_month") due.setMonth(due.getMonth() + every);
    else if (recurrence.basis === "calendar_week") due.setDate(due.getDate() + (every * 7));
    else due.setDate(due.getDate() + every);
    due.setHours(0,0,0,0);
    const today = new Date(); today.setHours(0,0,0,0);
    const days = Math.round((due.getTime() - today.getTime()) / MS_PER_DAY);
    return { since: 0, remain: 0, days, due, lastServicedAt: null };
  }
  if (task.interval == null) return null;
  const sinceRaw = liveSince(task);
  if (sinceRaw == null) return null;
  const since = Math.max(0, Number(sinceRaw) || 0);
  const interval = Number(task.interval);
  if (!Number.isFinite(interval) || interval <= 0) return null;
  const hoursPerDay = typeof getConfiguredDailyHours === "function"
    ? getConfiguredDailyHours()
    : ((typeof DAILY_HOURS === "number" && Number.isFinite(DAILY_HOURS) && DAILY_HOURS > 0)
      ? Number(DAILY_HOURS)
      : 8);
  const remain = interval - since;
  let days = 0;
  if (remain >= 0){
    days = Math.ceil(remain / hoursPerDay);
  } else {
    days = Math.floor(remain / hoursPerDay);
  }
  const due = new Date();
  due.setHours(0,0,0,0);
  if (typeof shouldExcludeWeekends === "function" && shouldExcludeWeekends()){
    let steps = Math.abs(days);
    const direction = days >= 0 ? 1 : -1;
    while (steps > 0){
      due.setDate(due.getDate() + direction);
      if (typeof isWeekendDate === "function" && isWeekendDate(due)) continue;
      steps -= 1;
    }
  } else {
    due.setDate(due.getDate() + days);
  }
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
 * gainLoss            = Hours Taken * (chargeRate - abs(costRate))
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
  if (diff < 0) return 0;
  if (typeof shouldExcludeWeekends === "function" && shouldExcludeWeekends()){
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    let count = 0;
    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)){
      if (typeof isWeekendDate === "function" && isWeekendDate(cursor)) continue;
      count += 1;
    }
    return count;
  }
  return diff + 1;
}

// Manual completedHours entries are cumulative progress snapshots, never additive.
// Only zero/missing completed-job financial durations may use supported actuals.
// This is a read-time resolution: no business record is normalized or repaired.
function resolveCuttingJobFinancialDuration(job){
  const number = raw => ["number","string"].includes(typeof raw) && String(raw).trim()!=="" && Number.isFinite(Number(raw)) && Number(raw)>=0 ? Number(raw) : null;
  const date = raw => {
    if (typeof raw!=="string" || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(raw)) return null;
    const key=raw.slice(0,10),d=new Date(key+"T00:00:00Z");
    return Number.isFinite(+d) && d.toISOString().slice(0,10)===key && (raw.length===10 || Number.isFinite(Date.parse(raw))) ? key : null;
  };
  const raw=job?.estimateHours;
  const originalHours=raw!=null && raw!=="" && Number.isFinite(Number(raw)) && Number(raw)>=0 ? Number(raw) : 0;
  const result={hours:originalHours,originalHours,storedEstimate:raw,usedRecorded:false,source:"Original estimateHours",issues:[],evidence:[],actualCandidate:null};
  const completed=date(job?.completedAtISO);
  if (!completed) return result; // Active jobs and scheduling estimates keep their existing behavior.
  const issue=message=>{if (!result.issues.includes(message)) result.issues.push(message);},evidence=result.evidence;
  if (job.actualHours!=null && job.actualHours!==""){
    const value=number(job.actualHours);
    if (value==null) issue("Invalid recorded actualHours requires review.");
    else evidence.push({source:"actualHours",hours:value});
  }
  const logs=[];
  if (job.manualLogs!=null && !Array.isArray(job.manualLogs)) issue("Manual logs are not a valid list.");
  for (const log of Array.isArray(job.manualLogs) ? job.manualLogs : []){
    const key=date(log?.dateISO),value=number(log?.completedHours);
    if (!key || key>completed || value==null){issue("Invalid, undated or post-completion manual cutting time requires review.");continue;}
    if (log.import_event_id && job.import_event_id && log.import_event_id!==job.import_event_id){issue("Manual log import identity differs from the job.");continue;}
    logs.push({date:key,hours:value});
  }
  logs.sort((a,b)=>a.date.localeCompare(b.date));
  const close=(a,b)=>Math.abs(a-b)<=0.000001;
  for (let i=1;i<logs.length;i++){
    if (logs[i].date===logs[i-1].date && !close(logs[i].hours,logs[i-1].hours)) issue("Conflicting same-date cumulative manual logs.");
    else if (logs[i].hours<logs[i-1].hours-0.000001) issue("Cumulative manual cutting time decreases; review corrections before using it.");
  }
  if (logs.length) evidence.push({source:"Latest cumulative manual log",hours:logs.at(-1).hours,date:logs.at(-1).date});
  const provenance=job.importProvenance?.sourceRecord || job.importProvenance;
  if (provenance && provenance.actual_cut_minutes!=null && String(provenance.actual_cut_minutes).trim()!==""){
    const minutes=number(provenance.actual_cut_minutes);
    if (minutes==null) issue("Invalid imported source cutting minutes requires review.");
    else evidence.push({source:"Imported actual_cut_minutes / 60",hours:minutes/60});
  }
  const anchor=evidence.find(item=>item.source==="actualHours") || evidence.find(item=>item.source==="Latest cumulative manual log");
  if (anchor){
    result.actualCandidate=anchor.hours;
    if (evidence.some(item=>!close(item.hours,anchor.hours))) issue("Recorded actual, terminal manual log and/or imported minutes contradict each other.");
  } else if (evidence.some(item=>item.hours>0)) issue("Imported minutes alone lack a recorded actual or authoritative manual log; review required.");
  if (originalHours>0){
    result.estimateActualDifference=anchor && !close(originalHours,anchor.hours);
    return result; // Preserve the existing positive financial duration.
  }
  if (anchor?.hours>0 && !result.issues.length){
    result.hours=anchor.hours;result.usedRecorded=true;result.source=anchor.source;
  }
  return result;
}

function computeCuttingJobProfit(job, options = {}){
  const finiteValue = (values, fallback, nonnegative = false) => {
    for (const raw of values){
      if (raw == null || raw === "") continue;
      const value = Number(raw);
      if (Number.isFinite(value) && (!nonnegative || value >= 0)) return value;
    }
    return fallback;
  };
  const duration = resolveCuttingJobFinancialDuration(job);
  const hours = options.durationMode === "estimate" ? duration.originalHours : duration.hours;
  const chargeRate = finiteValue([job?.chargeRate, job?.efficiency?.chargeRate], JOB_RATE_PER_HOUR, true);
  // efficiency.costRate remains a positive expense magnitude for subtracting consumers.
  const costRate = Math.abs(finiteValue([job?.costRate, job?.efficiency?.costRate], JOB_BASE_COST_PER_HOUR));
  const netRate = chargeRate - costRate;
  const materialCost = finiteValue([job?.materialCost], 0, true);
  const materialQty = finiteValue([job?.materialQty], 0, true);
  const materialExpense = materialCost * materialQty;
  // One verified workspace setting controls every read, including historical/imported jobs.
  // Per-job treatment and cached financial totals are retained only as source metadata.
  const materialCostTreatment = typeof window !== "undefined" && window.appConfig?.materialCostTreatment === "separate" ? "separate" : "deduct";
  const materialCharge = materialCostTreatment === "separate" ? materialExpense : 0;
  const materialProfitDeduction = materialCostTreatment === "deduct" ? materialExpense : 0;
  const failurePercent = Math.min(100, Math.max(0, finiteValue([options.failurePercent ?? job?.failurePercent], 0)));
  const revenue = chargeRate * hours;
  const cuttingCost = costRate * hours;
  const revenueLost = revenue * failurePercent / 100;
  const adjustedRevenue = revenue * (1 - failurePercent / 100);
  const cuttingProfit = adjustedRevenue - cuttingCost;
  const originalNetProfit = revenue - cuttingCost - materialProfitDeduction;
  const totalProfit = cuttingProfit - materialProfitDeduction;
  // Charge Rate is revenue/hr, already covering runtime cost. Recover material at cost once.
  const customerPrice = revenue + materialCharge;
  const adjustedCustomerPrice = adjustedRevenue + materialCharge;
  return { hours, duration, chargeRate, costRate, netRate, materialCost, materialQty, materialExpense,
    materialCostTreatment, materialCharge, materialProfitDeduction, cuttingProfit, customerPrice, adjustedCustomerPrice,
    failurePercent, revenue, adjustedRevenue, revenueLost, cuttingCost, originalNetProfit, totalProfit };
}

function computeJobEfficiency(job){
  // Priority for actual progress:
  // 1) Manual logs (authoritative)
  // 2) Machine total hours since job start (if no manual logs)
  // 3) No trustworthy data → assume no progress yet (0 hr)
  const planned = (job && job.estimateHours > 0) ? Number(job.estimateHours) : 0;
  const completionRaw = job?.completedAtISO ? (parseDateLocal(job.completedAtISO) || new Date(job.completedAtISO)) : null;
  const completionDate = (completionRaw instanceof Date && !Number.isNaN(completionRaw.getTime())) ? completionRaw : null;
  const actualOverrideRaw = job?.actualHours;
  const actualOverrideNum = Number(actualOverrideRaw);
  const hasActualOverride = actualOverrideRaw !== undefined
    && actualOverrideRaw !== null
    && actualOverrideRaw !== ""
    && Number.isFinite(actualOverrideNum)
    && actualOverrideNum >= 0;
  const actualOverride = hasActualOverride ? actualOverrideNum : null;
  const completionFallbackActual = (!hasActualOverride && completionDate) ? planned : null;
  const profit = computeCuttingJobProfit(job);
  const { chargeRate, costRate, netRate } = profit;
  const result = {
    rate: netRate,
    chargeRate,
    costRate,
    netRate,
    hoursTaken: profit.hours,
    totalProfit: profit.totalProfit,
    expectedHours: 0,
    actualHours: 0,
    expectedRemaining: 0,
    actualRemaining: 0,
    deltaHours: 0,
    gainLoss: profit.totalProfit,
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
  let evaluationDay = completionDate ? new Date(completionDate) : today;
  evaluationDay.setHours(0,0,0,0);
  if (evaluationDay < start) evaluationDay = new Date(start);
  const hoursPerDay = typeof getSchedulingDailyHours === "function"
    ? getSchedulingDailyHours()
    : ((typeof DAILY_HOURS === "number" && Number.isFinite(DAILY_HOURS) && DAILY_HOURS > 0)
      ? Number(DAILY_HOURS)
      : 8);

  const totalDays = Math.max(1, inclusiveDayCount(start, due));
  result.totalDays = totalDays;

  let daysElapsed = 0;
  if (evaluationDay > due) {
    daysElapsed = totalDays;
  }else if (evaluationDay > start){
    const elapsed = inclusiveDayCount(start, evaluationDay) - 1;
    daysElapsed = Math.min(totalDays, Math.max(0, elapsed));
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
    .filter(m => m && m.dateISO && new Date(m.dateISO+"T00:00:00") <= evaluationDay)
    .sort((a,b)=> a.dateISO.localeCompare(b.dateISO));

  if (hasActualOverride){
    result.actualHours = Math.max(0, actualOverride);
    result.usedManualOverride = true;
  }else if (completionFallbackActual != null){
    result.actualHours = Math.max(0, completionFallbackActual);
    result.usedCompletionEstimate = true;
  }else if (manualUpTo.length){
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

  const remainingGap = planned - result.actualHours;
  result.actualRemaining = Math.max(0, remainingGap);
  if (completionDate){
    result.deltaHours = result.expectedRemaining + remainingGap;   // + ahead / − behind
  }else{
    result.deltaHours = result.expectedRemaining - result.actualRemaining;   // + ahead / − behind
  }

  return result;
}

/* ----------- Required hrs/day to hit due date ------------- */
function getJobPriority(job){
  const raw = job && job.priority != null ? Number(job.priority) : 1;
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.max(1, Math.floor(raw));
}

function computePrioritySchedule(jobs){
  const backlog = new Map();
  const efficiencies = new Map();
  if (!Array.isArray(jobs) || !jobs.length){
    return { backlog, efficiencies };
  }

  const groups = new Map();

  jobs.forEach(job => {
    if (!job || job.id == null) return;
    const idStr = String(job.id);
    const priority = getJobPriority(job);
    const eff = computeJobEfficiency(job);
    efficiencies.set(idStr, eff);
    const remaining = computeCuttingJobProfit(job,{durationMode:"estimate"}).hours;
    const list = groups.get(priority) || [];
    list.push({ id: idStr, remaining });
    groups.set(priority, list);
  });

  const priorities = Array.from(groups.keys()).sort((a, b) => a - b);
  let carried = 0;
  priorities.forEach(level => {
    const entries = groups.get(level) || [];
    entries.forEach(entry => {
      backlog.set(entry.id, carried);
    });
    const totalForLevel = entries.reduce((sum, entry) => {
      const value = Number(entry.remaining);
      return Number.isFinite(value) ? sum + Math.max(0, value) : sum;
    }, 0);
    carried += totalForLevel;
  });

  return { backlog, efficiencies };
}

function computeRequiredDaily(job, options = {}){
  if (!job || !job.startISO || !job.dueISO) return { remainingHours:0, remainingDays:0, requiredPerDay:0, backlogHours:0, jobRemainingHours:0 };
  const jobRemainingHours = computeCuttingJobProfit(job,{durationMode:"estimate"}).hours;
  const backlogHours = Number.isFinite(Number(options.backlogHours))
    ? Math.max(0, Number(options.backlogHours))
    : 0;
  const remainingHours = jobRemainingHours + backlogHours;

  const today = new Date(); today.setHours(0,0,0,0);
  const due   = parseDateLocal(job.dueISO);
  if (!due) return { remainingHours:0, remainingDays:0, requiredPerDay:0, backlogHours, jobRemainingHours };
  due.setHours(0,0,0,0);

  let remainingDays;
  if (today > due) remainingDays = 0;
  else remainingDays = Math.max(1, inclusiveDayCount(today, due));

  const requiredPerDay = remainingDays > 0 ? (remainingHours / remainingDays) : (remainingHours>0 ? Infinity : 0);
  return { remainingHours, remainingDays, requiredPerDay, backlogHours, jobRemainingHours };
}

if (typeof window !== "undefined"){
  window.computeTimeEfficiency = computeTimeEfficiency;
  window.getTimeEfficiencyWindowMeta = getTimeEfficiencyWindowMeta;
  window.syncDailyHoursFromTotals = syncDailyHoursFromTotals;
  window.getDailyCutHoursMap = getDailyCutHoursMap;
  window.getJobPriority = getJobPriority;
  window.computePrioritySchedule = computePrioritySchedule;
}
