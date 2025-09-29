/* ==================== CORE COMPUTATIONS ==================== */
function currentTotal(){ return totalHistory.length ? totalHistory[totalHistory.length-1].hours : null; }
function previousTotal(){ return totalHistory.length>1 ? totalHistory[totalHistory.length-2].hours : null; }
function deltaSinceLast(){
  const cur = RENDER_TOTAL ?? currentTotal();
  const prev = previousTotal();
  if (cur == null || prev == null) return 0;
  return Math.max(0, cur - prev);
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
  const MS_PER_DAY = 24*60*60*1000;
  const hoursPerDay = (typeof DAILY_HOURS === "number" && Number.isFinite(DAILY_HOURS) && DAILY_HOURS > 0)
    ? Number(DAILY_HOURS)
    : 8;

  const totalDays = Math.max(1, Math.floor((due - start)/MS_PER_DAY) + 1);
  result.totalDays = totalDays;

  let daysElapsed = 0;
  if (today > due) {
    daysElapsed = totalDays;
  }else if (today > start){
    daysElapsed = Math.min(totalDays, Math.floor((today - start)/MS_PER_DAY));
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
  else remainingDays = Math.max(1, Math.floor((due - today)/(24*60*60*1000)) + 1);

  const requiredPerDay = remainingDays > 0 ? (remainingHours / remainingDays) : (remainingHours>0 ? Infinity : 0);
  return { remainingHours, remainingDays, requiredPerDay };
}

