/* ================== CALENDAR & BUBBLES ===================== */
let bubbleTimer = null;
const CALENDAR_DAY_MS = 24 * 60 * 60 * 1000;
let calendarHoursEditing = false;
let calendarHoursPending = new Map();
if (typeof window !== "undefined"){
  if (typeof window.__calendarShowAllMonths !== "boolean"){
    window.__calendarShowAllMonths = false;
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
  if (typeof getConfiguredDailyHours === "function") return getConfiguredDailyHours();
  if (typeof DAILY_HOURS === "number" && Number.isFinite(DAILY_HOURS) && DAILY_HOURS > 0) return Number(DAILY_HOURS);
  if (typeof DEFAULT_DAILY_HOURS === "number" && Number.isFinite(DEFAULT_DAILY_HOURS) && DEFAULT_DAILY_HOURS > 0){
    return Number(DEFAULT_DAILY_HOURS);
  }
  return 8;
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
  renderCalendar();
  if (typeof updateCalendarHoursControls === "function") updateCalendarHoursControls();
  return true;
}

function cancelCalendarHoursEditing(){
  if (!calendarHoursEditing) return false;
  calendarHoursEditing = false;
  calendarHoursPending = new Map();
  renderCalendar();
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
  renderCalendar();
  if (typeof updateCalendarHoursControls === "function") updateCalendarHoursControls();
  if (changed){
    if (typeof refreshTimeEfficiencyWidgets === "function") refreshTimeEfficiencyWidgets();
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
    renderCalendar();
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
    if (markOccurrenceRemoved(task, key)) changed = true;

    const nowIso = new Date().toISOString();
    const history = Array.isArray(task.manualHistory) ? task.manualHistory : [];
    let hasEntry = false;
    history.forEach(entry => {
      if (isSameDay(entry?.dateISO)){
        hasEntry = true;
        if (entry.status !== "removed"){ entry.status = "removed"; changed = true; }
        if (!entry.recordedAtISO) entry.recordedAtISO = nowIso;
      }
    });
    if (!hasEntry){
      history.push({ dateISO: key, status: "removed", recordedAtISO: nowIso, source: "calendar" });
      changed = true;
    }
    task.manualHistory = history;

    const pruneSingle = (obj)=>{
      if (!obj || typeof obj !== "object") return false;
      let mutated = false;
      Object.keys(obj).forEach(k => {
        if (isSameDay(k)){
          delete obj[k];
          mutated = true;
        }
      });
      return mutated;
    };

    if (isSameDay(task.calendarDateISO)){
      task.calendarDateISO = null;
      changed = true;
    }
    if (Array.isArray(task.completedDates)){
      const idx = task.completedDates.findIndex(v => isSameDay(v));
      if (idx >= 0){
        task.completedDates.splice(idx,1);
        changed = true;
      }
    }
    if (pruneSingle(task.occurrenceNotes)) changed = true;
    if (pruneSingle(task.occurrenceHours)) changed = true;

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
  if (isTemplateTask(meta.task) && meta.task.mode === "interval"){
    const instance = scheduleExistingIntervalTask(meta.task, { dateISO: ymd(new Date()) });
    if (instance){
      const nextMeta = findCalendarTaskMeta(instance.id);
      if (nextMeta) meta = nextMeta;
      else meta = { task: instance, mode: "interval", list: window.tasksInterval, index: window.tasksInterval.indexOf(instance) };
    }
  }
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
  const canRemoveOccurrence = !!dateKey;
  const canMarkComplete = !!dateKey && !isCompleted;
  const canUnmarkComplete = !!dateKey && isCompleted;

  const statusLabel = isCompleted
    ? "Completed"
    : (normalizedStatus === "manual" ? "Scheduled" : normalizedStatus === "due" ? "Projected" : "Scheduled");

  const occurrenceNote = dateKey ? getOccurrenceNoteForTask(task, dateKey) : "";

  const hoursPerDay = configuredDailyHours();
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

  const actions = [];
  if (dateKey){
    const noteLabel = occurrenceNote ? "Edit occurrence note" : "Add occurrence note";
    const hoursLabel = occurrenceHours != null ? "Edit occurrence time" : "Add occurrence time";
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
    const removeSelectId = `bubbleRemoveScope-${taskId}-${targetKey || "na"}`;
    actions.push(`
      <div class="bubble-remove-group">
        <label for="${removeSelectId}">Remove:</label>
        <div class="bubble-remove-row">
          <select id="${removeSelectId}" data-bbl-remove-scope>
            <option value="single">This occurrence only</option>
            <option value="future">This and future occurrences</option>
            <option value="all">All occurrences (past & future)</option>
          </select>
          <button class="secondary" data-bbl-remove-occurrence>Remove</button>
        </div>
      </div>
    `);
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
      saveCloudDebounced();
      toast((Number.isFinite(parsed) && parsed > 0) ? "Occurrence time saved" : "Occurrence time removed");
      hideBubble();
      route();
    }
  });

  b.querySelector("[data-bbl-occurrence-note]")?.addEventListener("click", ()=>{
    const existing = occurrenceNote;
    const promptText = "Add a note for this calendar occurrence. It won't change other intervals.";
    const next = typeof window.prompt === "function" ? window.prompt(promptText, existing) : "";
    if (next === null || next === undefined) return;
    const changed = setFamilyOccurrenceNote(task, targetKey, next);
    if (changed){
      saveCloudDebounced();
      toast((next || "").trim() ? "Occurrence note saved" : "Occurrence note removed");
      hideBubble();
      route();
    }
  });

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
    const scope = b.querySelector("[data-bbl-remove-scope]")?.value || "single";
    const confirmText = scope === "future"
      ? "Remove this occurrence and all future occurrences from the calendar?"
      : scope === "all"
        ? "Remove all calendar occurrences for this task (past and future)?"
        : "Remove this occurrence from the calendar?";
    const shouldRemove = window.confirm ? window.confirm(confirmText) : true;
    if (!shouldRemove) return;
    const changed = removeCalendarTaskOccurrences(meta, targetKey, scope);
    if (changed){
      saveCloudDebounced();
      const toastMessage = scope === "future"
        ? "Current and future occurrences removed"
        : scope === "all"
          ? "All occurrences removed"
          : "Removed from calendar";
      toast(toastMessage);
      hideBubble();
      route();
    }
  });

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
      saveCloudDebounced();
      toast("Task removed");
      hideBubble();
      route();
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
    const completedJobs = Array.isArray(window.completedCuttingJobs) ? window.completedCuttingJobs : [];
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
      renderCalendar();
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
    if (typeof isCalendarHoursEditing === "function" && isCalendarHoursEditing()) return;
    const el = e.target.closest("[data-cal-job], [data-cal-task], [data-cal-garnet]");
    if (!el || el === hoverTarget) return;
    hoverTarget = el;
    if (el.dataset.calJob)  showJobBubble(el.dataset.calJob, el);
    if (el.dataset.calTask) showTaskBubble(el.dataset.calTask, el, extractTaskOptions(el));
    if (el.dataset.calGarnet) showGarnetBubble(el.dataset.calGarnet, el);
  });
  months.addEventListener("mouseout", (e)=>{
    if (typeof isCalendarHoursEditing === "function" && isCalendarHoursEditing()) return;
    const from = e.target.closest("[data-cal-job], [data-cal-task], [data-cal-garnet]");
    const to   = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest("[data-cal-job], [data-cal-task], [data-cal-garnet]");
    if (from && !to) { hoverTarget = null; hideBubbleSoon(); }
  });
  months.addEventListener("click", (e)=>{
    if (typeof isCalendarHoursEditing === "function" && isCalendarHoursEditing()) return;
    const el = e.target.closest("[data-cal-job], [data-cal-task], [data-cal-garnet]");
    if (!el) return;
    if (el.dataset.calJob)  showJobBubble(el.dataset.calJob, el);
    if (el.dataset.calTask) showTaskBubble(el.dataset.calTask, el, extractTaskOptions(el));
    if (el.dataset.calGarnet) showGarnetBubble(el.dataset.calGarnet, el);
  });
}

function estimateIntervalDailyHours(task, baselineEntry, today){
  const defaultHours = configuredDailyHours();
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
  return events;
}

function renderCalendar(){
  const container = $("#months");
  if (!container) return;
  let showAll = Boolean(window.__calendarShowAllMonths);
  const monthOffsetRaw = Number(window.__calendarMonthOffset);
  const monthOffset = Number.isFinite(monthOffsetRaw) ? Math.min(12, Math.max(-12, Math.round(monthOffsetRaw))) : 0;
  window.__calendarMonthOffset = monthOffset;
  const editingHours = isCalendarHoursEditing();
  const hoursPerDay = configuredDailyHours();
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
        return;
      }
      events.push({
        type: "task",
        id: compositeId,
        taskId: baseId,
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
      pushTaskEvent(t, dateKey, "manual");
    });

    const skipDates = new Set(completedKeys);
    manualDates.forEach(dateKey => skipDates.add(dateKey));
    removedSet.forEach(dateKey => skipDates.add(dateKey));
    const projections = projectIntervalDueDates(t, {
      monthsAhead: 3,
      excludeDates: skipDates,
      minOccurrences: 6
    });
    if (projections.length){
      projections.forEach(pred => {
        const dueKey = normalizeDateKey(pred?.dateISO);
        if (!dueKey) return;
        if (completedKeys.has(dueKey)) return;
        if (manualKey && manualKey === dueKey && !completedKeys.has(dueKey)) return;
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
      (jobsMap[key] ||= []).push({ type:"job", id:String(j.id), name:j.name, status:"active", cat:j.cat });
      cur.setDate(cur.getDate()+1);
    }
  });

  const completedJobs = Array.isArray(window.completedCuttingJobs) ? window.completedCuttingJobs : [];
  completedJobs.forEach(job => {
    if (!job) return;
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
        if (ev.status === "completed") cls += " is-complete";
        chip.className = cls;
        const baseTaskId = ev.taskId || ev.id;
        chip.dataset.calTask = baseTaskId;
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
  renderCalendar();
  return true;
}

function resetCalendarMonthOffset(){
  if ((Number(window.__calendarMonthOffset) || 0) === 0) return false;
  window.__calendarMonthOffset = 0;
  renderCalendar();
  return true;
}

function toggleCalendarShowAllMonths(){
  const next = !Boolean(window.__calendarShowAllMonths);
  window.__calendarShowAllMonths = next;
  renderCalendar();
}
