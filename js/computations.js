/* ==================== CORE COMPUTATIONS ==================== */
function currentTotal(){ return totalHistory.length ? totalHistory[totalHistory.length-1].hours : null; }
function previousTotal(){ return totalHistory.length>1 ? totalHistory[totalHistory.length-2].hours : null; }
function deltaSinceLast(){
  const cur = RENDER_TOTAL ?? currentTotal();
  const prev = previousTotal();
  if (cur == null || prev == null) return 0;
  return Math.max(0, cur - prev);
}

function parseDateISO(dateISO){
  if (dateISO == null) return null;
  const raw = String(dateISO).trim();
  if (!raw) return null;
  const [datePart] = raw.split("T");
  const bits = datePart.split("-");
  if (bits.length !== 3) return null;
  const [y, m, d] = bits.map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setHours(0,0,0,0);
  return dt;
}

function formatDateForInput(dateISO){
  const dt = parseDateISO(dateISO);
  if (!dt) return "";
  const yyyy = String(dt.getFullYear());
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function liveSince(task){
  const cur = RENDER_TOTAL ?? currentTotal();
  const delta = RENDER_DELTA ?? deltaSinceLast();
  if (task.anchorTotal != null && cur != null) return Math.max(0, cur - task.anchorTotal);
  if (task.sinceBase == null) return null;
  return (task.sinceBase + delta);
}

function nextDue(task){
  const since = liveSince(task);
  if (since == null) return null;
  const remain = Math.max(0, task.interval - since);
  const days = Math.round(remain / DAILY_HOURS);
  const due = new Date(); due.setHours(0,0,0,0); due.setDate(due.getDate() + days);
  const lastServicedAt = (RENDER_TOTAL != null && since != null) ? Math.max(0, RENDER_TOTAL - since) : null;
  return { since, remain, days, due, lastServicedAt };
}

/* ------------ Cutting jobs efficiency model ---------------
 * Baseline assumes 8 hr/day progress beginning on the start date.
 * plannedHours        = j.estimateHours
 * expectedHoursSoFar  = min(planned, DAILY_HOURS * daysElapsed)
 * expectedRemaining   = max(0, planned - expectedHoursSoFar)
 * actualHoursSoFar    = manual override with carry-forward 8h/day; else AUTO 8h/day
 * actualRemaining     = max(0, planned - actualHoursSoFar)
 * deltaHours          = expectedRemaining - actualRemaining  ( + ahead / - behind )
 * gainLoss            = deltaHours * JOB_RATE_PER_HOUR
 */


function computeJobEfficiency(job){
  // Priority for actual progress:
  // 1) Manual logs (authoritative)
  // 2) Machine total hours since job start (if no manual logs)
  // 3) Auto baseline of 8 hr/day from start
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
  const start = parseDateISO(job?.startISO);
  if (!job || !start || planned <= 0) return result;

  // Dates
  const today = new Date(); today.setHours(0,0,0,0);

  const MS_PER_DAY = 24*60*60*1000;
  result.totalDays   = planned > 0 ? Math.max(1, Math.ceil(planned / DAILY_HOURS)) : 0;
  result.daysElapsed = (today < start) ? 0 : Math.max(0, Math.floor((today - start)/MS_PER_DAY) + 1);
  result.expectedHours = Math.min(planned, result.daysElapsed * DAILY_HOURS);
  result.expectedRemaining = Math.max(0, planned - result.expectedHours);

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
      // 3) Fallback → auto baseline from start
      result.actualHours = Math.min(planned, result.daysElapsed * DAILY_HOURS);
      result.usedFromStartAuto = true;
    }
  }

  result.actualRemaining = Math.max(0, planned - result.actualHours);
  result.deltaHours      = result.expectedRemaining - result.actualRemaining;   // + ahead / − behind
  result.gainLoss        = result.deltaHours * result.rate;

  return result;
}

/* ----------- Required hrs/day to hit due date ------------- */
function computeRequiredDaily(job){
  if (!job) return { remainingHours:0, remainingDays:0, requiredPerDay:0 };
  const start = parseDateISO(job.startISO);
  const due   = parseDateISO(job.dueISO);
  if (!start || !due) return { remainingHours:0, remainingDays:0, requiredPerDay:0 };
  const eff = computeJobEfficiency(job);
  const planned = Number(job.estimateHours) || 0;
  const remainingHours = eff.actualRemaining != null
    ? eff.actualRemaining
    : Math.max(0, planned - eff.actualHours);

  const today = new Date(); today.setHours(0,0,0,0);

  let remainingDays;
  if (today > due) remainingDays = 0;
  else remainingDays = Math.max(1, Math.floor((due - today)/(24*60*60*1000)) + 1);

  const requiredPerDay = remainingDays > 0 ? (remainingHours / remainingDays) : (remainingHours>0 ? Infinity : 0);
  return { remainingHours, remainingDays, requiredPerDay };
}

