/* =========================================================
   Opportunity & Maintenance Cost Logic
   ========================================================= */
(function(){
  if (typeof window === "undefined") return;

  const DEFAULT_WORKDAY_HOURS = 8;
  const DEFAULT_RATE = 150;
  const DEFAULT_BUSINESS_DAYS = [1, 2, 3, 4, 5];
  const DEFAULT_MIN_MAINT_HOURS = 1;
  const DEFAULT_WORKDAY_START = 8;

  function getSetting(key, fallback){
    try {
      const settingsSources = [
        window.__APP_SETTINGS__,
        window.APP_SETTINGS,
        window.appSettings
      ];
      for (const source of settingsSources){
        if (source && Object.prototype.hasOwnProperty.call(source, key)){
          const value = source[key];
          return value === undefined || value === null ? fallback : value;
        }
      }
    } catch (err) {
      console.warn("getSetting failed", err);
    }
    return fallback;
  }

  function coerceNumber(value, fallback){
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  const WORKDAY_HOURS = (()=>{
    const raw = coerceNumber(getSetting("WORKDAY_HOURS", DEFAULT_WORKDAY_HOURS), DEFAULT_WORKDAY_HOURS);
    return raw > 0 ? raw : DEFAULT_WORKDAY_HOURS;
  })();
  const BILL_RATE_OPP = (()=>{
    const raw = coerceNumber(getSetting("BILL_RATE_OPP", DEFAULT_RATE), DEFAULT_RATE);
    return raw >= 0 ? raw : DEFAULT_RATE;
  })();
  const BUSINESS_DAYS = (()=>{
    const raw = getSetting("BUSINESS_DAYS_NUMERIC", DEFAULT_BUSINESS_DAYS);
    if (!Array.isArray(raw)) return DEFAULT_BUSINESS_DAYS.slice();
    const normalized = raw
      .map(entry => coerceNumber(entry, null))
      .filter(value => Number.isInteger(value) && value >= 1 && value <= 7);
    return normalized.length ? normalized : DEFAULT_BUSINESS_DAYS.slice();
  })();
  const WORKDAY_START_HOUR = (()=>{
    const raw = coerceNumber(getSetting("WORKDAY_START_HOUR", DEFAULT_WORKDAY_START), DEFAULT_WORKDAY_START);
    return raw >= 0 && raw < 24 ? raw : DEFAULT_WORKDAY_START;
  })();

  function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }
  function endOfDay(d){ const x = new Date(d); x.setHours(23,59,59,999); return x; }
  function addMonths(d, n){ const x = new Date(d); x.setMonth(x.getMonth()+n); return x; }
  function toISODate(d){ return d.toISOString().slice(0,10); }
  function clampDate(dt, a, b){ return dt < a ? a : (dt > b ? b : dt); }

  function normalizeDateKey(value){
    if (!value) return null;
    if (value instanceof Date){
      const copy = new Date(value);
      copy.setHours(0,0,0,0);
      return toISODate(copy);
    }
    if (typeof value === "string"){
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    }
    try {
      if (typeof window.parseDateLocal === "function"){
        const parsed = window.parseDateLocal(value);
        if (parsed instanceof Date && !Number.isNaN(parsed.getTime())){
          parsed.setHours(0,0,0,0);
          return toISODate(parsed);
        }
      }
    } catch (err) {
      console.warn("normalizeDateKey failed", err);
    }
    return null;
  }

  function isBusinessDay(date, holidays){
    const day = ((date.getDay() + 6) % 7) + 1; // Mon=1..Sun=7
    if (!BUSINESS_DAYS.includes(day)) return false;
    const iso = toISODate(date);
    return !holidays.has(iso);
  }

  function enumerateBusinessWindows(from, to, holidays, workdayStartHour = WORKDAY_START_HOUR){
    const windows = [];
    let cursor = startOfDay(from);
    const stop = endOfDay(to);
    while (cursor <= stop){
      if (isBusinessDay(cursor, holidays)){
        const start = new Date(cursor);
        start.setHours(workdayStartHour, 0, 0, 0);
        const end = new Date(start);
        end.setHours(start.getHours() + WORKDAY_HOURS);
        const clampedStart = clampDate(start, from, to);
        const clampedEnd = clampDate(end, from, to);
        if (clampedEnd > clampedStart){
          windows.push({ start: clampedStart, end: clampedEnd });
        }
      }
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }
    return windows;
  }

  function overlapHours(a, b){
    const start = a.start > b.start ? a.start : b.start;
    const end = a.end < b.end ? a.end : b.end;
    return end > start ? (end.getTime() - start.getTime()) / 3600000 : 0;
  }

  async function loadPumpRunLogs(from, to){
    const list = Array.isArray(window.dailyCutHours) ? window.dailyCutHours : [];
    const fromISO = toISODate(from);
    const toISO = toISODate(to);
    return list
      .map(entry => {
        const dateKey = normalizeDateKey(entry?.dateISO || entry?.date);
        if (!dateKey) return null;
        const hours = coerceNumber(entry?.hours, 0);
        return { date: dateKey, run_hours: hours > 0 ? hours : 0 };
      })
      .filter(item => item && item.date >= fromISO && item.date <= toISO);
  }

  async function loadHolidays(from, to){
    const fromISO = toISODate(from);
    const toISO = toISODate(to);
    const candidates = [];
    const sources = [window.businessHolidays, window.companyHolidays, window.workspaceHolidays];
    for (const source of sources){
      if (!Array.isArray(source)) continue;
      source.forEach(item => {
        const key = normalizeDateKey(item);
        if (!key) return;
        if (key >= fromISO && key <= toISO) candidates.push(key);
      });
    }
    const unique = Array.from(new Set(candidates));
    unique.sort();
    return unique;
  }

  function buildTaskLookup(){
    const lookup = new Map();
    const lists = [window.tasksInterval, window.tasksAsReq];
    lists.forEach(list => {
      if (!Array.isArray(list)) return;
      list.forEach(task => {
        if (!task || task.id == null) return;
        lookup.set(String(task.id), task);
      });
    });
    return lookup;
  }

  function resolveTaskDowntimeHours(task, templateLookup){
    if (!task) return null;
    const directKeys = ["downtimeHours", "downTime", "downtime"];
    for (const key of directKeys){
      const value = coerceNumber(task[key], null);
      if (Number.isFinite(value) && value > 0) return value;
    }
    const templateId = task.templateId != null ? String(task.templateId) : null;
    if (templateId && templateLookup instanceof Map){
      const template = templateLookup.get(templateId);
      if (template && template !== task){
        const templDuration = resolveTaskDowntimeHours(template, null);
        if (templDuration != null) return templDuration;
      }
    }
    const taskTypeCandidates = [task.taskType, task.type, templateId, task.id, task.name];
    const durationsMap = getSetting("MAINTENANCE_TASK_DURATIONS_HOURS", {});
    if (durationsMap && typeof durationsMap === "object"){
      for (const candidate of taskTypeCandidates){
        if (candidate == null) continue;
        const key = String(candidate);
        const value = coerceNumber(durationsMap[key], null);
        if (Number.isFinite(value) && value > 0) return value;
      }
    }
    return null;
  }

  function collectTaskEvents(taskList, events, seenKeys, templateLookup){
    if (!Array.isArray(taskList)) return;
    taskList.forEach(task => {
      if (!task || task.id == null) return;
      const taskId = String(task.id);
      const typeKey = task.templateId != null ? String(task.templateId) : taskId;
      const downtimeHours = resolveTaskDowntimeHours(task, templateLookup);
      const title = task.name || "Maintenance";
      const metadata = { taskType: typeKey };

      const pushEvent = (dateISO, suffix)=>{
        const key = normalizeDateKey(dateISO);
        if (!key) return;
        const composite = `${taskId}|${key}|${suffix}`;
        if (seenKeys.has(composite)) return;
        seenKeys.add(composite);
        const start = new Date(`${key}T${String(WORKDAY_START_HOUR).padStart(2, "0")}:00:00`);
        let end = null;
        if (downtimeHours != null && downtimeHours > 0){
          end = new Date(start);
          end.setHours(end.getHours() + downtimeHours);
        }
        events.push({
          id: `${taskId}_${suffix}_${key}`,
          title,
          start: start.toISOString(),
          end: end ? end.toISOString() : null,
          allDay: end == null,
          metadata
        });
      };

      const completedDates = Array.isArray(task.completedDates) ? task.completedDates : [];
      completedDates.forEach(dateISO => pushEvent(dateISO, "completed"));

      const manualHistory = Array.isArray(task.manualHistory) ? task.manualHistory : [];
      manualHistory.forEach(entry => {
        if (!entry) return;
        const status = typeof entry.status === "string" ? entry.status.toLowerCase() : "logged";
        const suffix = status === "completed" ? "completed" : "manual";
        pushEvent(entry.dateISO, suffix);
      });

      if (task.calendarDateISO){
        pushEvent(task.calendarDateISO, "scheduled");
      }
    });
  }

  async function loadCalendarMaintenance(from, to){
    const events = [];
    const seen = new Set();
    const templateLookup = buildTaskLookup();
    collectTaskEvents(window.tasksInterval, events, seen, templateLookup);
    collectTaskEvents(window.tasksAsReq, events, seen, templateLookup);
    const fromISO = toISODate(from);
    const toISO = toISODate(to);
    return events.filter(event => {
      const dateISO = normalizeDateKey(event.start);
      if (!dateISO) return false;
      return dateISO >= fromISO && dateISO <= toISO;
    });
  }

  function getMaintTaskDefaultDurationHours(taskType){
    const map = getSetting("MAINTENANCE_TASK_DURATIONS_HOURS", {});
    if (!taskType) return null;
    if (!map || typeof map !== "object") return null;
    const value = coerceNumber(map[String(taskType)], null);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function calendarEventsToMaintIntervals(events){
    return events.map(ev => {
      const start = new Date(ev.start);
      let end = ev.end ? new Date(ev.end) : null;
      let taskType = null;
      if (ev.metadata && typeof ev.metadata.taskType === "string"){
        taskType = ev.metadata.taskType;
      }
      if (!end || !(end > start)){
        const defaultDuration = getMaintTaskDefaultDurationHours(taskType);
        const duration = defaultDuration != null ? defaultDuration : DEFAULT_MIN_MAINT_HOURS;
        end = new Date(start);
        end.setHours(end.getHours() + duration);
      }
      return { start, end, taskType, sourceId: ev.id };
    });
  }

  function sumMaintenanceHoursFromCalendar(intervals, from, to, holidays){
    const businessWindows = enumerateBusinessWindows(from, to, holidays);
    let hours = 0;
    intervals.forEach(interval => {
      const start = clampDate(interval.start, from, to);
      const end = clampDate(interval.end, from, to);
      if (!(end > start)) return;
      businessWindows.forEach(window => {
        hours += overlapHours({ start, end }, window);
      });
    });
    return hours;
  }

  function targetHours(from, to, holidays){
    const windows = enumerateBusinessWindows(from, to, holidays);
    return windows.length * WORKDAY_HOURS;
  }

  function sumPumpRunHours(pumpRuns, from, to){
    const fromISO = toISODate(from);
    const toISO = toISODate(to);
    return pumpRuns
      .filter(entry => entry.date >= fromISO && entry.date <= toISO)
      .reduce((sum, entry) => sum + (entry.run_hours > 0 ? entry.run_hours : 0), 0);
  }

  function addMonthsBack(now, months){
    return addMonths(now, -months);
  }

  async function loadOpenJobs(){
    const jobs = Array.isArray(window.cuttingJobs) ? window.cuttingJobs : [];
    let backlogMap = null;
    if (typeof window.computePrioritySchedule === "function"){
      try {
        const schedule = window.computePrioritySchedule(jobs);
        if (schedule && schedule.backlog instanceof Map){
          backlogMap = schedule.backlog;
        }
      } catch (err) {
        console.warn("computePrioritySchedule failed", err);
      }
    }
    return jobs.map(job => {
      const id = job && job.id != null ? job.id : null;
      const key = id != null ? String(id) : "";
      const ahead = backlogMap && backlogMap.has(key) ? coerceNumber(backlogMap.get(key), 0) : 0;
      return { id, status_ahead_hours: Math.max(0, ahead), ref: job };
    });
  }

  function updateJob(id, payload){
    if (id == null || !payload || typeof payload !== "object") return false;
    const jobs = Array.isArray(window.cuttingJobs) ? window.cuttingJobs : [];
    const key = String(id);
    const job = jobs.find(item => item && String(item.id) === key);
    if (!job) return false;
    let changed = false;
    Object.keys(payload).forEach(k => {
      const next = payload[k];
      if (job[k] !== next){
        job[k] = next;
        changed = true;
      }
    });
    return changed;
  }

  function cloneRollupRows(rows){
    return rows.map(row => ({
      period: row.period,
      businessDays: row.businessDays,
      targetHours: row.targetHours,
      pumpRunHours: row.pumpRunHours,
      maintenanceHours: row.maintenanceHours,
      idleHours: row.idleHours,
      utilization: row.utilization,
      maintenanceCost: row.maintenanceCost,
      opportunityCost: row.opportunityCost,
      totalCost: row.totalCost
    }));
  }

  let opportunityInternalSave = false;
  const originalSaveCloudDebounced = typeof window.saveCloudDebounced === "function"
    ? window.saveCloudDebounced.bind(window)
    : null;

  async function saveOpportunityRollups(rows){
    const normalized = Array.isArray(rows) ? cloneRollupRows(rows) : [];
    window.opportunityRollups = normalized;
    if (originalSaveCloudDebounced){
      opportunityInternalSave = true;
      try {
        originalSaveCloudDebounced();
      } finally {
        opportunityInternalSave = false;
      }
    }
  }

  let recomputePending = false;
  let recomputeActive = false;

  async function recomputeOpportunityCost(){
    if (recomputeActive){
      recomputePending = true;
      return;
    }
    recomputeActive = true;
    recomputePending = false;

    try {
      const now = new Date();
      const periods = [
        { label: "Last 1 Month", months: 1 },
        { label: "Last 3 Months", months: 3 },
        { label: "Last 6 Months", months: 6 },
        { label: "Last 12 Months", months: 12 }
      ];
      const bounds = periods.map(p => ({ label: p.label, start: addMonthsBack(now, p.months), end: now }));
      const minStart = bounds.reduce((min, period) => period.start < min ? period.start : min, bounds[0].start);

      const [pumpRuns, calendarEvents, holidaysArray] = await Promise.all([
        loadPumpRunLogs(minStart, now),
        loadCalendarMaintenance(minStart, now),
        loadHolidays(minStart, now)
      ]);

      const holidaysSet = new Set(holidaysArray || []);
      const maintIntervals = calendarEventsToMaintIntervals(calendarEvents || []);

      const rows = bounds.map(period => {
        const target = targetHours(period.start, period.end, holidaysSet);
        const run = sumPumpRunHours(pumpRuns, period.start, period.end);
        const maintenance = sumMaintenanceHoursFromCalendar(maintIntervals, period.start, period.end, holidaysSet);
        const idle = Math.max(0, target - run - maintenance);
        const utilization = target > 0 ? (run / target) : 0;
        const maintenanceCost = maintenance * BILL_RATE_OPP;
        const opportunityCost = idle * BILL_RATE_OPP;
        const totalCost = maintenanceCost + opportunityCost;
        return {
          period: period.label,
          businessDays: enumerateBusinessWindows(period.start, period.end, holidaysSet).length,
          targetHours: +target.toFixed(2),
          pumpRunHours: +run.toFixed(2),
          maintenanceHours: +maintenance.toFixed(2),
          idleHours: +idle.toFixed(2),
          utilization: +(utilization * 100).toFixed(1),
          maintenanceCost: +maintenanceCost.toFixed(2),
          opportunityCost: +opportunityCost.toFixed(2),
          totalCost: +totalCost.toFixed(2)
        };
      });

      await saveOpportunityRollups(rows);

      const jobs = await loadOpenJobs();
      let jobsChanged = false;
      jobs.forEach(jobInfo => {
        if (!jobInfo || jobInfo.id == null) return;
        const delayHrs = Math.max(0, coerceNumber(jobInfo.status_ahead_hours, 0));
        const oppCost = delayHrs * BILL_RATE_OPP;
        const rounded = +oppCost.toFixed(2);
        const changed = updateJob(jobInfo.id, { oppCostAt8hrDay: rounded });
        if (changed) jobsChanged = true;
      });

      if (jobsChanged && originalSaveCloudDebounced){
        opportunityInternalSave = true;
        try {
          originalSaveCloudDebounced();
        } finally {
          opportunityInternalSave = false;
        }
      }
    } catch (err) {
      console.error("Failed to recompute opportunity cost", err);
    } finally {
      recomputeActive = false;
      if (recomputePending){
        recomputeOpportunityCost();
      }
    }
  }

  function scheduleOpportunityRecompute(){
    if (recomputeActive){
      recomputePending = true;
      return;
    }
    if (recomputePending) return;
    recomputePending = true;
    setTimeout(() => {
      if (!recomputeActive){
        recomputeOpportunityCost();
      }
    }, 0);
  }

  if (originalSaveCloudDebounced){
    window.saveCloudDebounced = function patchedSaveCloudDebounced(){
      const result = originalSaveCloudDebounced();
      if (!opportunityInternalSave){
        scheduleOpportunityRecompute();
      }
      return result;
    };
  }

  window.getOpportunityLossRate = function(){ return BILL_RATE_OPP; };
  window.getOpportunityWorkdayHours = function(){ return WORKDAY_HOURS; };
  window.recomputeOpportunityCost = recomputeOpportunityCost;
  window.scheduleOpportunityRecompute = scheduleOpportunityRecompute;

  scheduleOpportunityRecompute();
})();
