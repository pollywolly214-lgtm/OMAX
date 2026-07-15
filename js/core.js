/* =========================================================
   OMAX 1530 Maintenance Tracker — v7.1 (Regenerated)
   - Firestore cloud sync (email/password modal; shared workspace doc)
   - 3-month calendar + hover bubbles
   - Hours log → Δ distribution for maintenance intervals
   - Cutting Jobs with efficiency model + required/day
   - Pump Efficiency widget (baseline + daily RPM logs + chart)
   - Settings + Costs (incl. materials) + lightweight Inventory
   - Route-based rendering
   - Minimal CSS injection (if stylesheet is missing)
   ========================================================= */

/* =================== CONSTANTS / GLOBALS =================== */
const APP_SCHEMA = 72;
const DEFAULT_DAILY_HOURS = 8;
let DAILY_HOURS = DEFAULT_DAILY_HOURS;
const JOB_RATE_PER_HOUR = 250; // $/hr (default charge when a job doesn't set its own rate)
const JOB_BASE_COST_PER_HOUR = 30; // $/hr baseline internal cost applied to every job
// Decide workspace based on hostname (all hosts write to production).
const WORKSPACE_ID = (() => {
  if (typeof window !== "undefined") {
    return "github-prod";
  }
  // Fallback for non-browser contexts so build-time scripts default to production doc
  return "github-prod";
})();

function isVercelPreviewRuntime(){
  if (typeof window === "undefined" || !window.location) return false;
  const params = new URLSearchParams(window.location.search || "");
  const readonlyFlag = params.get("previewReadonly") === "1";
  if (!readonlyFlag) return false;
  const host = String(window.location.hostname || "").toLowerCase();
  if (!(host.endsWith(".vercel.app") || host === "vercel.app")) return false;
  const subdomain = host.split(".")[0] || "";
  const isPreviewHost = subdomain.includes("-git-") || subdomain.includes("---");
  return isPreviewHost;
}

if (typeof window !== "undefined") {
  window.WORKSPACE_ID = WORKSPACE_ID;
  window.workspaceRef = null;
  window.workspaceDocRef = null;
  window.DEBUG_MODE = new URLSearchParams(window.location.search).get("debug") === "1";
  const __omaxParams = new URLSearchParams(window.location.search || "");
  window.__recoveryInspectMode = __omaxParams.get("recovery") === "1"
    || __omaxParams.get("readonly") === "1"
    || __omaxParams.get("diagnostics") === "1";
  window.__autosaveDisabled = window.__recoveryInspectMode === true;
  window.__cloudLoadAttemptComplete = false;
  window.__initialAdoptComplete = false;
  window.__localBackupOnlyMode = false;
  window.__loadedCloudRevisionForSaveGuard = 0;
}

function isRecoveryMode(){
  return typeof window !== "undefined" && window.__recoveryInspectMode === true;
}

function setCloudLoadGate({ loadComplete = false, adoptComplete = false } = {}){
  if (typeof window === "undefined") return;
  window.__cloudLoadAttemptComplete = Boolean(loadComplete);
  window.__initialAdoptComplete = Boolean(adoptComplete);
}

function blockCloudSave(reason, details = null){
  const message = `Cloud save blocked: ${reason}`;
  if (typeof window !== "undefined"){
    window.__lastCloudSaveBlock = {
      atISO: new Date().toISOString(),
      reason,
      details,
      message
    };
  }
  if (details) console.error(message, details);
  else console.warn(message);
  try { if (typeof toast === "function") toast(message); } catch (_err){}
  return false;
}

function canWriteCloud(reason = "cloud save"){
  if (typeof window === "undefined") return false;
  if (isRecoveryMode()) return blockCloudSave(`${reason}; Recovery Mode is read-only, cloud saves disabled.`);
  if (window.__autosaveDisabled) return blockCloudSave(`${reason}; autosave is disabled.`);
  if (!window.__cloudLoadAttemptComplete || !window.__initialAdoptComplete){
    return blockCloudSave(`${reason}; cloud load/adoption is not complete.`);
  }
  if (window.__localBackupOnlyMode){
    return blockCloudSave(`${reason}; local backup was loaded without a cloud baseline. Export/review before any restore.`);
  }
  return true;
}
let CUTTING_BASELINE_WEEKLY_HOURS = 56;
let CUTTING_BASELINE_DAILY_HOURS = CUTTING_BASELINE_WEEKLY_HOURS / 7;
const TIME_EFFICIENCY_WINDOWS = [
  { key: "7d", label: "1W", days: 7, description: "Past 7 days" },
  { key: "30d", label: "1M", days: 30, description: "Past 30 days" },
  { key: "90d", label: "3M", days: 90, description: "Past 3 months" },
  { key: "182d", label: "6M", days: 182, description: "Past 6 months" },
  { key: "365d", label: "1Y", days: 365, description: "Past year" }
];
const PREDICTION_AVERAGE_WINDOWS = [
  { value: 7, label: "1 week" },
  { value: 14, label: "2 weeks" },
  { value: 30, label: "1 month" },
  { value: 60, label: "2 months" },
  { value: 90, label: "3 months" }
];
const DEFAULT_PREDICTION_AVERAGE_WINDOW = 60;
const DEFAULT_APP_CONFIG = {
  excludeWeekends: false,
  dailyHours: DEFAULT_DAILY_HOURS,
  predictionMode: "fixed",
  averageWindowDays: DEFAULT_PREDICTION_AVERAGE_WINDOW,
  timeEfficiencyGoalMode: "maximum",
  mondayStartLookback: false,
  maintenanceCalendarNewRecordsSystem: "v2"
};
let appConfig = { ...DEFAULT_APP_CONFIG };

const CLEAR_DATA_PASSWORD = (typeof window !== "undefined" && typeof window.CLEAR_DATA_PASSWORD === "string" && window.CLEAR_DATA_PASSWORD)
  ? window.CLEAR_DATA_PASSWORD
  : "reset-omax";
if (typeof window !== "undefined") window.CLEAR_DATA_PASSWORD = CLEAR_DATA_PASSWORD;

window.APP_SCHEMA = APP_SCHEMA;

if (typeof window !== "undefined"){
  window.cloudDashboardLayout = {};
  window.cloudCostLayout = {};
  window.cloudJobLayout = {};
  window.cloudDashboardLayoutLoaded = false;
  window.cloudCostLayoutLoaded = false;
  window.cloudJobLayoutLoaded = false;
  window.CUTTING_BASELINE_WEEKLY_HOURS = CUTTING_BASELINE_WEEKLY_HOURS;
  window.CUTTING_BASELINE_DAILY_HOURS = CUTTING_BASELINE_DAILY_HOURS;
  window.TIME_EFFICIENCY_WINDOWS = TIME_EFFICIENCY_WINDOWS;
  window.PREDICTION_AVERAGE_WINDOWS = PREDICTION_AVERAGE_WINDOWS;
  window.appConfig = appConfig;
  window.getConfiguredDailyHours = getConfiguredDailyHours;
  window.getSchedulingDailyHours = getSchedulingDailyHours;
  window.getFixedDailyHours = getFixedDailyHours;
  window.getAverageDailyCutHours = getAverageDailyCutHours;
  window.getPredictionHoursSummary = getPredictionHoursSummary;
  window.normalizePredictionAverageWindow = normalizePredictionAverageWindow;
  window.shouldExcludeWeekends = shouldExcludeWeekends;
  window.setAppConfig = setAppConfig;
  window.normalizeAppConfig = normalizeAppConfig;
  window.setDailyCutHoursEntry = setDailyCutHoursEntry;
  window.getDailyCutHoursEntry = getDailyCutHoursEntry;
  window.normalizeDailyCutHours = normalizeDailyCutHours;
  window.normalizeDateISO = normalizeDateISO;
  window.getMaintenanceCalendarNewRecordsSystem = getMaintenanceCalendarNewRecordsSystem;
  window.isMaintenanceV2NewRecordsPreferred = isMaintenanceV2NewRecordsPreferred;
  window.__opportunityStateReady = false;
}

/* Root helpers */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
function debounce(fn, ms=250){
  let t;
  let lastArgs;
  const debounced = (...a)=>{
    lastArgs = a;
    clearTimeout(t);
    t = setTimeout(()=>{
      t = null;
      return fn(...(lastArgs || []));
    }, ms);
  };
  debounced.flush = ()=>{
    if (!t) return false;
    clearTimeout(t);
    t = null;
    fn(...(lastArgs || []));
    return true;
  };
  debounced.flushResult = ()=>{
    if (!t) return false;
    clearTimeout(t);
    t = null;
    return fn(...(lastArgs || []));
  };
  debounced.now = (...a)=>{
    if (t){
      clearTimeout(t);
      t = null;
    }
    lastArgs = a;
    return fn(...a);
  };
  debounced.cancel = ()=>{
    if (!t) return;
    clearTimeout(t);
    t = null;
  };
  return debounced;
}
function genId(name){ const b=(name||"item").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,""); return `${b}_${Date.now().toString(36)}`; }
function parseDateLocal(value){
  if (value == null) return null;

  const fromUTCParts = (dt)=>{
    if (!(dt instanceof Date)) return null;
    if (Number.isNaN(dt.getTime())) return null;
    return new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
  };

  // Direct Date instance
  if (value instanceof Date){
    return fromUTCParts(value);
  }

  // Firestore Timestamp (has toDate()) or other date-like objects
  if (value && typeof value === "object"){
    if (typeof value.toDate === "function"){
      try {
        const dt = value.toDate();
        const normalized = fromUTCParts(dt);
        if (normalized) return normalized;
      } catch (err) {
        console.warn("parseDateLocal: toDate() failed", err);
      }
    }
    if (typeof value.seconds === "number"){
      try {
        const millis = (value.seconds * 1000) + (typeof value.nanoseconds === "number" ? Math.floor(value.nanoseconds/1e6) : 0);
        const dt = new Date(millis);
        const normalized = fromUTCParts(dt);
        if (normalized) return normalized;
      } catch (err) {
        console.warn("parseDateLocal: seconds conversion failed", err);
      }
    }
  }

  // ISO string (YYYY-MM-DD)
  if (typeof value === "string"){
    const trimmed = value.trim();
    if (!trimmed) return null;
    const dateOnly = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/);
    if (dateOnly){
      const [y, m, d] = dateOnly[1].split("-").map(Number);
      return new Date(y, m-1, d);
    }
  }

  const dt = new Date(value);
  const normalized = fromUTCParts(dt);
  return normalized ?? null;
}
function ymd(d){
  const dt = parseDateLocal(d);
  if (!dt) return "";
  const m = dt.getMonth()+1;
  const day = dt.getDate();
  return `${dt.getFullYear()}-${m<10?'0':''}${m}-${day<10?'0':''}${day}`;
}

function isWeekendDate(d){
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return false;
  const day = d.getDay();
  return day === 0 || day === 6;
}

function normalizeDateISO(value){
  if (!value) return null;
  if (value instanceof Date){
    return ymd(value);
  }
  if (typeof value === "string"){
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = parseDateLocal(trimmed);
    if (parsed) return ymd(parsed);
    return null;
  }
  try {
    const parsed = parseDateLocal(value);
    if (parsed) return ymd(parsed);
  } catch (_err){}
  return null;
}

function clampDailyCutHours(value){
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  if (num > 24) return 24;
  return num;
}

function normalizePredictionAverageWindow(value){
  const raw = Number(value);
  const match = PREDICTION_AVERAGE_WINDOWS.find(option => option.value === raw);
  return match ? match.value : DEFAULT_PREDICTION_AVERAGE_WINDOW;
}

function normalizeAppConfig(config){
  const normalized = { ...DEFAULT_APP_CONFIG };
  if (config && typeof config === "object"){
    if (typeof config.excludeWeekends === "boolean") normalized.excludeWeekends = config.excludeWeekends;
    if (config.dailyHours != null){
      const clamped = clampDailyCutHours(config.dailyHours);
      if (clamped > 0) normalized.dailyHours = clamped;
    }
    if (config.predictionMode === "average" || config.predictionMode === "fixed"){
      normalized.predictionMode = config.predictionMode;
    } else if (config.dailyHours != null){
      normalized.predictionMode = "fixed";
    }
    normalized.averageWindowDays = normalizePredictionAverageWindow(config.averageWindowDays);
    normalized.timeEfficiencyGoalMode = config.timeEfficiencyGoalMode === "average" ? "average" : "maximum";
    if (typeof config.mondayStartLookback === "boolean") normalized.mondayStartLookback = config.mondayStartLookback;
    normalized.maintenanceCalendarNewRecordsSystem = "v2";
  }
  return normalized;
}

function getMaintenanceCalendarNewRecordsSystem(){
  return "v2";
}
function isMaintenanceV2NewRecordsPreferred(){
  return true;
}

function shouldExcludeWeekends(){
  try {
    return Boolean((appConfig || {}).excludeWeekends);
  } catch (_err){
    return false;
  }
}

function getFixedDailyHours(){
  const cfg = appConfig && typeof appConfig === "object" ? appConfig : DEFAULT_APP_CONFIG;
  const fixedHoursRaw = clampDailyCutHours(cfg.dailyHours);
  return fixedHoursRaw > 0 ? fixedHoursRaw : DEFAULT_DAILY_HOURS;
}

function getConfiguredDailyHours(){
  return getPredictionHoursSummary().effectiveHours;
}

function getSchedulingDailyHours(){
  return getFixedDailyHours();
}

function getPredictionHoursSummary(){
  const cfg = appConfig && typeof appConfig === "object" ? appConfig : DEFAULT_APP_CONFIG;
  const mode = cfg.predictionMode === "fixed" ? "fixed" : "average";
  const averageHours = getAverageDailyCutHours();
  const averageWindowDays = normalizePredictionAverageWindow(cfg.averageWindowDays);
  const averageWindowOption = PREDICTION_AVERAGE_WINDOWS.find(option => option.value === averageWindowDays)
    || PREDICTION_AVERAGE_WINDOWS.find(option => option.value === DEFAULT_PREDICTION_AVERAGE_WINDOW)
    || { value: averageWindowDays, label: `${averageWindowDays} days` };
  const fixedHours = getFixedDailyHours();
  const effectiveHours = (mode === "average" && Number.isFinite(averageHours) && averageHours > 0)
    ? averageHours
    : fixedHours;
  return {
    mode,
    averageHours,
    fixedHours,
    effectiveHours,
    averageWindowDays,
    averageWindowLabel: averageWindowOption.label
  };
}

function getAverageDailyCutHours(windowDaysOverride = null){
  const today = new Date();
  today.setHours(0,0,0,0);
  const cfg = appConfig && typeof appConfig === "object" ? appConfig : DEFAULT_APP_CONFIG;
  const windowDays = normalizePredictionAverageWindow(windowDaysOverride != null ? windowDaysOverride : cfg.averageWindowDays);
  const useMondayStartLookback = !!cfg.mondayStartLookback;
  const start = new Date(today);
  if (useMondayStartLookback){
    const day = today.getDay();
    const mondayOffset = (day + 6) % 7;
    const currentMonday = new Date(today);
    currentMonday.setDate(today.getDate() - mondayOffset);
    const weekSpanByWindow = { 7: 1, 14: 2, 30: 4, 60: 8, 90: 13 };
    const weeks = weekSpanByWindow[windowDays] || Math.max(1, Math.ceil(windowDays / 7));
    start.setTime(currentMonday.getTime());
    start.setDate(currentMonday.getDate() - ((weeks - 1) * 7));
  } else {
    start.setDate(start.getDate() - windowDays);
  }
  const startKey = ymd(start);
  const endKey = ymd(today);
  const excludeWeekends = shouldExcludeWeekends();

  const dailyMap = new Map();
  const dailyList = Array.isArray(window.dailyCutHours) ? window.dailyCutHours : [];
  dailyList.forEach(entry => {
    const key = normalizeDateISO(entry?.dateISO);
    if (!key || key < startKey || key > endKey) return;
    dailyMap.set(key, clampDailyCutHours(entry.hours));
  });

  let eligibleDays = 0;
  if (dailyMap.size){
    let totalHours = 0;
    const cursor = new Date(start);
    while (cursor <= today){
      const day = cursor.getDay();
      const key = ymd(cursor);
      const include = !excludeWeekends || (day !== 0 && day !== 6);
      if (include){
        eligibleDays += 1;
        totalHours += (dailyMap.get(key) || 0);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (!eligibleDays) return null;
    const dailyRate = totalHours / eligibleDays;
    return Number.isFinite(dailyRate) && dailyRate > 0 ? dailyRate : null;
  }

  const totals = (Array.isArray(window.totalHistory) ? window.totalHistory : [])
    .filter(entry => entry && entry.dateISO && Number.isFinite(Number(entry.hours)))
    .slice()
    .sort((a,b)=> String(a.dateISO).localeCompare(String(b.dateISO)));
  if (totals.length < 2) return null;
  const totalsByDate = new Map();
  totals.forEach(entry => {
    const key = normalizeDateISO(entry.dateISO);
    if (key) totalsByDate.set(key, Number(entry.hours));
  });

  let runningTotal = null;
  for (const item of totals){
    const key = normalizeDateISO(item?.dateISO);
    if (!key || key > startKey) break;
    runningTotal = Number(item.hours);
  }

  let totalHours = 0;
  const cursor = new Date(start);
  while (cursor <= today){
    const day = cursor.getDay();
    const key = ymd(cursor);
    const include = !excludeWeekends || (day !== 0 && day !== 6);
    if (include) eligibleDays += 1;
    if (totalsByDate.has(key)){
      const nextTotal = Number(totalsByDate.get(key));
      if (runningTotal == null){
        runningTotal = nextTotal;
      } else {
        if (include) totalHours += Math.max(0, nextTotal - Number(runningTotal));
        runningTotal = nextTotal;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (!eligibleDays) return null;
  const rate = totalHours / eligibleDays;
  return (Number.isFinite(rate) && rate > 0) ? rate : null;
}

function refreshDerivedDailyHours(){
  DAILY_HOURS = getConfiguredDailyHours();
  const daysPerWeek = shouldExcludeWeekends() ? 5 : 7;
  CUTTING_BASELINE_DAILY_HOURS = DAILY_HOURS;
  CUTTING_BASELINE_WEEKLY_HOURS = DAILY_HOURS * daysPerWeek;
  if (typeof window !== "undefined"){
    window.DAILY_HOURS = DAILY_HOURS;
    window.CUTTING_BASELINE_DAILY_HOURS = CUTTING_BASELINE_DAILY_HOURS;
    window.CUTTING_BASELINE_WEEKLY_HOURS = CUTTING_BASELINE_WEEKLY_HOURS;
  }
  return DAILY_HOURS;
}

function setAppConfig(config){
  appConfig = normalizeAppConfig(config);
  if (typeof window !== "undefined"){
    window.appConfig = appConfig;
  }
  return refreshDerivedDailyHours();
}

appConfig = normalizeAppConfig((typeof window !== "undefined" && window.appConfig) ? window.appConfig : appConfig);
refreshDerivedDailyHours();

function normalizeTimeString(value){
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function timeStringToMinutes(value){
  const normalized = normalizeTimeString(value);
  if (!normalized) return null;
  const [hh, mm] = normalized.split(":").map(Number);
  return (hh * 60) + mm;
}

/* Toast */
function toast(msg){
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  const fadeMs = 320;
  const displayMs = 3000;
  requestAnimationFrame(()=>{ t.classList.add("show"); });
  setTimeout(()=>{
    t.classList.remove("show");
    setTimeout(()=>{ t.remove(); }, fadeMs);
  }, displayMs);
}

/* ================ MINIMUM STYLE INJECTION ================== */
(function ensureStyles(){
  if (document.getElementById("mt-inline-styles")) return;
  const css = `
  .topnav{display:flex;gap:8px;align-items:center;margin-bottom:10px}
  .topnav button{padding:6px 10px;border:1px solid #dfe6f3;border-radius:8px;background:#fff;cursor:pointer}
  .topnav .right{margin-left:auto;color:#555}
  .container{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .block{background:#f9fbff;border:1px solid #e6ecf7;border-radius:10px;padding:12px}
  .small{font-size:12px}.muted{color:#666}.danger{color:#b00020}
  .mini-form{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .calendar-toolbar{margin-bottom:8px;display:flex;justify-content:flex-end;align-items:center;gap:8px}
  .calendar-add-btn{width:34px;height:34px;border-radius:50%;border:0;display:flex;align-items:center;justify-content:center;background:#0a63c2;color:#fff;font-size:20px;cursor:pointer;box-shadow:0 4px 8px rgba(10,99,194,.2)}
  .calendar-add-btn:hover{background:#084f9a}
  .calendar-add-btn:active{transform:translateY(1px)}
  table{width:100%;border-collapse:collapse} th,td{border:1px solid #e6ecf7;padding:6px;text-align:left;vertical-align:top}
  .grid{width:100%}
  .month{border:1px solid #e6ecf7;border-radius:10px;overflow:hidden;margin-bottom:10px}
  .month-header{background:#eef3fb;padding:6px 10px;font-weight:600}
  .weekdays,.week{display:grid;grid-template-columns:repeat(7,1fr)}
  .weekdays>div{padding:4px 6px;background:#f6f9fe;border-bottom:1px solid #e6ecf7;font-size:12px}
  .day{min-height:78px;position:relative;border-right:1px solid #f0f4fb;border-bottom:1px solid #f0f4fb;padding:2px}
  .day.other-month{background:#fafbfd;opacity:.6}
  .day.downtime{background:#ffe5e5}
  .day.downtime .date{color:#b71c1c}
  .day.today{outline:2px solid #0a63c2;outline-offset:-2px}
  .date{font-size:12px;color:#555;margin-bottom:2px}
  .day-add-bubble{position:absolute;bottom:6px;right:6px;width:28px;height:28px;border-radius:50%;border:0;display:flex;align-items:center;justify-content:center;background:#0a63c2;color:#fff;font-size:18px;font-weight:600;cursor:pointer;box-shadow:0 6px 12px rgba(10,99,194,.25);opacity:0;transform:scale(.85);transition:opacity .18s ease,transform .18s ease;z-index:3}
  .day-add-bubble.is-visible{opacity:1;transform:scale(1)}
  .day-add-bubble:hover{background:#084f9a}
  .day-add-bubble:active{transform:scale(.92)}
  .day-add-bubble:focus-visible{outline:2px solid #fff;outline-offset:-2px;box-shadow:0 0 0 3px rgba(10,99,194,.35)}
  .event.generic,.job-bar{display:block;padding:2px 6px;margin:2px 0;border-radius:8px;cursor:pointer;border:1px solid transparent}
  .event.generic{background:#fff0d6;border-color:#ffe1a5}
  .job-bar{background:#e1efff;border-color:#cddffb}
  /* Bubble */
  #bubble.bubble{position:absolute;z-index:9999;background:#fff;border:1px solid #dfe6f3;border-radius:10px;box-shadow:0 6px 18px rgba(15,25,40,.12);padding:10px;min-width:260px}
  #bubble.bubble::before{content:"";position:absolute;top:-6px;left:16px;width:12px;height:12px;background:#fff;transform:rotate(45deg);border-left:1px solid #dfe6f3;border-top:1px solid #dfe6f3}
  .bubble-title{font-weight:700;margin-bottom:6px}
  .bubble-kv{display:flex;justify-content:space-between;gap:10px;font-size:13px;margin:3px 0}
  .bubble-kv span:first-child{color:#5a6478;font-weight:600}
  .bubble-kv span:last-child{color:#0a63c2;font-weight:600}
  .bubble-actions{display:flex;gap:8px;margin-top:8px}
  .cal-task,.cal-job{position:relative;display:block;cursor:pointer}
  /* Chips */
  .chip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;line-height:18px;border:1px solid transparent;background:#eef1f7;color:#333}
  .chip.green{background:#e5f6eb;color:#2e7d32;border-color:#ccebd6}
  .chip.green-better{background:#dff8e9;color:#1b5e20;border-color:#bce9d2;font-weight:600}
  .chip.yellow{background:#fff7d1;color:#8a6d00;border-color:#f2e4a3}
  .chip.orange{background:#ffe6d6;color:#a14d00;border-color:#ffd0b5}
  .chip.red{background:#ffe1e1;color:#c62828;border-color:#ffc9c9}
  /* Toast */
  .toast{position:fixed;right:14px;bottom:14px;background:#0a63c2;color:#fff;padding:10px 12px;border-radius:10px;opacity:0;transform:translateY(6px);transition:all .2s}
  .toast.show{opacity:1;transform:translateY(0)}
  /* Pump widget */
  .pump-card{display:block}
  .pump-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px}
  .pump-col{background:#fff;border:1px solid #dde3ee;border-radius:10px;padding:12px}
  details > summary {cursor: pointer;}
  details > summary::-webkit-details-marker {display: none;}
  `;
  const st = document.createElement("style"); st.id = "mt-inline-styles"; st.textContent = css; document.head.appendChild(st);
})();

/* ====================== FIREBASE =========================== */
let FB = {
  app: null,
  auth: null,
  db: null,
  user: null,
  docRef: null,
  workspaceRef: null,
  workspaceDoc: null,
  ready: false
};

let firebaseInitStarted = false;
let firebaseSettingsApplied = false;
let workspaceMetadataWritesBlocked = false;
let workspaceStateUnsubscribe = null;
let lastAppliedCloudRevision = 0;
let hasPendingLocalChanges = false;
let lastLocalMutationAt = 0;
const CLOUD_SYNC_CLIENT_KEY = "cloud_sync_client_id_v1";
const LOCAL_STATE_BACKUP_KEY = "omax_local_state_backup_v1";


const FIRESTORE_WARN_BYTES = 850000;
const FIRESTORE_STRONG_WARN_BYTES = 900000;
const FIRESTORE_BLOCK_BYTES = 975000;
const SAVE_LOG_THROTTLE_MS = 30000;
let lastSaveLogWriteAt = 0;
const REQUIRED_PROTECTED_DATA_PATHS = [
  "cuttingJobs",
  "completedCuttingJobs",
  "cuttingJobDatabase",
  "tasksInterval",
  "tasksAsReq",
  "settingsFolders",
  "folders",
  "jobFolders",
  "inventory",
  "inventoryFolders",
  "inventoryMaterials",
  "inventoryTransactions",
  "receiptTrackerWeeks",
  "orderRequests",
  "weeklyCostReports",
  "dailyCutHours",
  "totalHistory",
  "pumpEff",
  "garnetCleanings",
  "appConfig",
  "dashboardLayout",
  "costLayout",
  "jobLayout",
  "maintenanceTasksV2",
  "maintenanceCalendarInstancesV2",
  "maintenanceOccurrencesV2",
  "oneDriveJobConfig",
  "cuttingJobs.manualLogs",
  "completedCuttingJobs.manualLogs",
  "tasksInterval.completedDates",
  "tasksInterval.manualHistory",
  "tasksInterval.occurrenceNotes",
  "tasksInterval.occurrenceHours",
  "tasksInterval.removedOccurrences",
  "tasksAsReq.completedDates",
  "tasksAsReq.manualHistory",
  "tasksAsReq.occurrenceNotes",
  "tasksAsReq.occurrenceHours",
  "tasksAsReq.removedOccurrences"
];
const PROTECTED_FIELD_REGISTRY = [
  { path:"cuttingJobs", label:"Active cutting jobs", category:"jobs", expectedShape:"array", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"completedCuttingJobs", label:"Completed cutting jobs", category:"jobs", expectedShape:"array", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"cuttingJobDatabase", label:"Cutting job database", category:"jobs", expectedShape:"arrayOrObject", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"tasksInterval", label:"Interval maintenance tasks", category:"maintenance", expectedShape:"array", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"tasksAsReq", label:"As-required maintenance tasks", category:"maintenance", expectedShape:"array", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"settingsFolders", label:"Settings folders", category:"config", expectedShape:"array", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"folders", label:"General folders", category:"config", expectedShape:"array", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"jobFolders", label:"Job folders", category:"jobs", expectedShape:"array", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"inventory", label:"Inventory items", category:"inventory", expectedShape:"array", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"inventoryFolders", label:"Inventory folders", category:"inventory", expectedShape:"array", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"inventoryMaterials", label:"Inventory material matrix", category:"inventory", expectedShape:"arrayOrObject", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"inventoryTransactions", label:"Inventory transactions", category:"inventory", expectedShape:"array", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"receiptTrackerWeeks", label:"Receipt tracker weeks", category:"orders", expectedShape:"array", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"orderRequests", label:"Order requests", category:"orders", expectedShape:"array", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"weeklyCostReports", label:"Weekly cost reports", category:"orders", expectedShape:"arrayOrObject", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"dailyCutHours", label:"Daily cut hours", category:"machine history", expectedShape:"array", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"totalHistory", label:"Machine hour total history", category:"machine history", expectedShape:"array", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"pumpEff", label:"Pump efficiency history", category:"machine history", expectedShape:"arrayOrObject", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"garnetCleanings", label:"Garnet cleaning history", category:"machine history", expectedShape:"array", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"appConfig", label:"Application configuration", category:"config", expectedShape:"object", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"dashboardLayout", label:"Dashboard layout", category:"layouts", expectedShape:"object", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"costLayout", label:"Cost layout", category:"layouts", expectedShape:"object", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"jobLayout", label:"Job layout", category:"layouts", expectedShape:"object", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"maintenanceTasksV2", label:"Maintenance tasks V2", category:"maintenance", expectedShape:"array", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"maintenanceCalendarInstancesV2", label:"Maintenance calendar instances V2", category:"maintenance", expectedShape:"array", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"maintenanceOccurrencesV2", label:"Maintenance occurrences V2", category:"maintenance", expectedShape:"array", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"oneDriveJobConfig", label:"OneDrive/reference folder config", category:"jobs", expectedShape:"object", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"cuttingJobs.manualLogs", label:"Active cutting job manual logs", category:"jobs", expectedShape:"nestedCount", parentPath:"cuttingJobs", nestedKey:"manualLogs", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"completedCuttingJobs.manualLogs", label:"Completed cutting job manual logs", category:"jobs", expectedShape:"nestedCount", parentPath:"completedCuttingJobs", nestedKey:"manualLogs", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"tasksInterval.completedDates", label:"Interval task completed dates", category:"maintenance", expectedShape:"nestedCount", parentPath:"tasksInterval", nestedKey:"completedDates", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"tasksInterval.manualHistory", label:"Interval task manual history", category:"maintenance", expectedShape:"nestedCount", parentPath:"tasksInterval", nestedKey:"manualHistory", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"tasksInterval.occurrenceNotes", label:"Interval task occurrence notes", category:"maintenance", expectedShape:"nestedCount", parentPath:"tasksInterval", nestedKey:"occurrenceNotes", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"tasksInterval.occurrenceHours", label:"Interval task occurrence hours", category:"maintenance", expectedShape:"nestedCount", parentPath:"tasksInterval", nestedKey:"occurrenceHours", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"tasksInterval.removedOccurrences", label:"Interval task removed occurrences", category:"maintenance", expectedShape:"nestedCount", parentPath:"tasksInterval", nestedKey:"removedOccurrences", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"tasksAsReq.completedDates", label:"As-required task completed dates", category:"maintenance", expectedShape:"nestedCount", parentPath:"tasksAsReq", nestedKey:"completedDates", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"tasksAsReq.manualHistory", label:"As-required task manual history", category:"maintenance", expectedShape:"nestedCount", parentPath:"tasksAsReq", nestedKey:"manualHistory", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"tasksAsReq.occurrenceNotes", label:"As-required task occurrence notes", category:"maintenance", expectedShape:"nestedCount", parentPath:"tasksAsReq", nestedKey:"occurrenceNotes", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"tasksAsReq.occurrenceHours", label:"As-required task occurrence hours", category:"maintenance", expectedShape:"nestedCount", parentPath:"tasksAsReq", nestedKey:"occurrenceHours", allowEmptyOnNewWorkspace:true, dangerousDrop:true },
  { path:"tasksAsReq.removedOccurrences", label:"As-required task removed occurrences", category:"maintenance", expectedShape:"nestedCount", parentPath:"tasksAsReq", nestedKey:"removedOccurrences", allowEmptyOnNewWorkspace:true, dangerousDrop:true }
];
// Legacy diagnostics still iterate this compatibility list, but SAFE-03
// hard save blocking is registry-driven via PROTECTED_FIELD_REGISTRY.
const PROTECTED_STATE_FIELDS = [
  "cuttingJobs",
  "completedCuttingJobs",
  "tasksInterval",
  "tasksAsReq",
  "maintenanceTasksV2",
  "maintenanceCalendarInstancesV2",
  "maintenanceOccurrencesV2",
  "receiptTrackerWeeks",
  "orderRequests",
  "dailyCutHours",
  "totalHistory",
  "pumpEff",
  "garnetCleanings",
  "inventory",
  "inventoryFolders",
  "inventoryMaterials",
  "settingsFolders",
  "appConfig",
  "dashboardLayout",
  "costLayout",
  "jobLayout"
];

function estimatePayloadBytes(payload){
  try {
    const json = JSON.stringify(payload || {});
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(json).length;
    return new Blob([json]).size;
  } catch (_err){
    return Number.MAX_SAFE_INTEGER;
  }
}


const LARGE_CONTENT_KEY_PATTERN = /(base64|filedata|dataurl|previewurl|previewdata|filecontent|content|raw|blob|attachment|image|file|dxf|ord|omx)/i;
const SAFE_FILE_METADATA_KEY_PATTERN = /^(name|type|size|label|path|storagepath|externalurl|downloadurl|onedriveurl|attachedatiso|uploadedatiso|extension)$/i;
const EMBEDDED_CONTENT_KEY_PATTERN = /^(dataurl|previewurl|previewdata|filedata|filecontent|raw|content|blob|base64)$/i;

function isDataUrl(value){
  const raw = String(value || "").trim();
  return /^data:(image|application)\//i.test(raw);
}

function isLikelyEmbeddedFileContent(key, value){
  if (typeof value !== "string") return false;
  const raw = String(value || "");
  const normalizedKey = String(key || "").toLowerCase();
  if (isDataUrl(raw)) return true;
  if (EMBEDDED_CONTENT_KEY_PATTERN.test(normalizedKey)) return true;
  if (/base64|blob|binary|dxf|ord|omx/i.test(normalizedKey) && raw.length > 256) return true;
  if (/^https?:\/\//i.test(raw)) return false;
  return raw.length > 8192 && LARGE_CONTENT_KEY_PATTERN.test(normalizedKey);
}

function isSafeMetadataString(key, value){
  const raw = String(value || "").trim();
  if (!SAFE_FILE_METADATA_KEY_PATTERN.test(String(key || ""))) return false;
  if (isDataUrl(raw)) return false;
  if (raw.length > 2048) return false;
  return true;
}
function isProtectedBusinessDataKey(key){
  const normalized = String(key || "").toLowerCase();
  return /(tasksinterval|tasksasreq|completeddates|manualhistory|calendardateiso|recurrence|removedoccurrences|occurrenceoverrides|maintenancetasksv2|maintenanceoccurrencesv2|maintenancecalendarinstancesv2|settingsfolders|folders|inventory|inventoryfolders|inventorymaterials|inventorytransactions|orderrequests|receipttrackerweeks|weeklycostreports|purchase|vendor|tolerance|inspection|quality|layout|dashboardlayout|costlayout|joblayout|tolerancelayout)/i.test(normalized);
}

function sanitizeValueForStorage(value, { dropHeavyHistory = false } = {}){
  if (Array.isArray(value)) return value.map(v => sanitizeValueForStorage(v, { dropHeavyHistory }));
  if (!value || typeof value !== "object"){
    if (typeof value === "string" && (value.startsWith("data:image") || value.length > 200000)) return "";
    return value;
  }
  const out = {};
  for (const [k,v] of Object.entries(value)){
    const key = String(k || "");
    if (/^(__|debug|cache|preview)/i.test(key)) continue;
    if (dropHeavyHistory && !isProtectedBusinessDataKey(key) && /(syncprocesslog|logs|deleteditems|reports|rollups|savelogs)/i.test(key)) continue;
    if (typeof v === "string" && (isLikelyEmbeddedFileContent(key, v) || v.length > 200000)){
      if (isSafeMetadataString(key, v)) out[key] = v;
      continue;
    }
    out[k] = sanitizeValueForStorage(v, { dropHeavyHistory });
  }
  return out;
}

function estimateTopLevelFieldSizes(state){
  const src = state && typeof state === "object" ? state : {};
  return Object.keys(src).map((field)=>({ field, bytes: estimatePayloadBytes(src[field]) })).sort((a,b)=>b.bytes-a.bytes);
}

function summarizeLargestNested(fieldName, value){
  if (!Array.isArray(value)) return [];
  return value.map((item, index)=>{
    const keys = item && typeof item === "object" ? Object.keys(item).filter((k)=>LARGE_CONTENT_KEY_PATTERN.test(k) || (typeof item[k] === "string" && item[k].length > 5000)).slice(0,8) : [];
    return { index, id: item?.id || "", name: item?.name || item?.title || "", bytes: estimatePayloadBytes(item), suspiciousKeys: keys.join(",") };
  }).sort((a,b)=>b.bytes-a.bytes).slice(0,10);
}

function logStateSizeDiagnostics(state, label = "state"){
  const ranked = estimateTopLevelFieldSizes(state);
  console.info(`Field size diagnostics (${label})`);
  console.table(ranked);
  ranked.slice(0,3).forEach((entry)=>{
    const nested = summarizeLargestNested(entry.field, state?.[entry.field]);
    if (nested.length){
      console.info(`Nested size diagnostics for ${entry.field}`);
      console.table(nested);
    }
  });
  return ranked;
}

function compactStateForStorage(raw, { forBackup = false } = {}){
  const snap = raw && typeof raw === "object" ? { ...raw } : {};
  // Safe-to-trim fields: operational/debug/save logs that can grow unbounded.
  delete snap.syncProcessLog;
  delete snap.__lastSnapshot;
  delete snap.__lastSnapshotForFlow;
  delete snap.__lastDataFlowFingerprint;
  snap.tasksInterval = sanitizeValueForStorage(snap.tasksInterval);
  snap.tasksAsReq = sanitizeValueForStorage(snap.tasksAsReq);
  snap.inventory = sanitizeValueForStorage(snap.inventory);
  snap.orderRequests = sanitizeValueForStorage(snap.orderRequests);
  snap.cuttingJobs = sanitizeValueForStorage(snap.cuttingJobs);
  snap.completedCuttingJobs = sanitizeValueForStorage(snap.completedCuttingJobs);
  snap.totalHistory = Array.isArray(snap.totalHistory) ? snap.totalHistory.slice(-500) : [];
  snap.dailyCutHours = Array.isArray(snap.dailyCutHours) ? snap.dailyCutHours.slice(-365) : [];
  if (forBackup){
    delete snap.deletedItems;
    delete snap.opportunityRollups;
  }
  return sanitizeValueForStorage(snap, { dropHeavyHistory: forBackup });
}

function buildEmergencyBackup(snapshot){
  const src = snapshot && typeof snapshot === "object" ? snapshot : {};
  return {
    schema: src.schema || APP_SCHEMA,
    totalHistory: Array.isArray(src.totalHistory) ? src.totalHistory : [],
    tasksInterval: Array.isArray(src.tasksInterval) ? src.tasksInterval : [],
    tasksAsReq: Array.isArray(src.tasksAsReq) ? src.tasksAsReq : [],
    maintenanceTasksV2: Array.isArray(src.maintenanceTasksV2) ? src.maintenanceTasksV2 : [],
    maintenanceCalendarInstancesV2: Array.isArray(src.maintenanceCalendarInstancesV2) ? src.maintenanceCalendarInstancesV2 : [],
    maintenanceOccurrencesV2: Array.isArray(src.maintenanceOccurrencesV2) ? src.maintenanceOccurrencesV2 : [],
    inventory: Array.isArray(src.inventory) ? src.inventory : [],
    inventoryFolders: Array.isArray(src.inventoryFolders) ? src.inventoryFolders : [],
    inventoryMaterials: Array.isArray(src.inventoryMaterials) ? src.inventoryMaterials : [],
    inventoryTransactions: Array.isArray(src.inventoryTransactions) ? src.inventoryTransactions : [],
    cuttingJobDatabase: (src.cuttingJobDatabase && typeof src.cuttingJobDatabase === "object") ? src.cuttingJobDatabase : {},
    cuttingJobs: Array.isArray(src.cuttingJobs) ? src.cuttingJobs : [],
    completedCuttingJobs: Array.isArray(src.completedCuttingJobs) ? src.completedCuttingJobs : [],
    orderRequests: Array.isArray(src.orderRequests) ? src.orderRequests : [],
    receiptTrackerWeeks: Array.isArray(src.receiptTrackerWeeks) ? src.receiptTrackerWeeks : [],
    weeklyCostReports: Array.isArray(src.weeklyCostReports) ? src.weeklyCostReports : [],
    garnetCleanings: Array.isArray(src.garnetCleanings) ? src.garnetCleanings : [],
    dailyCutHours: Array.isArray(src.dailyCutHours) ? src.dailyCutHours : [],
    appConfig: src.appConfig || normalizeAppConfig(window.appConfig),
    settingsFolders: Array.isArray(src.settingsFolders) ? src.settingsFolders : [],
    folders: Array.isArray(src.folders) ? src.folders : [],
    jobFolders: Array.isArray(src.jobFolders) ? src.jobFolders : [],
    dashboardLayout: (src.dashboardLayout && typeof src.dashboardLayout === "object") ? src.dashboardLayout : {},
    costLayout: (src.costLayout && typeof src.costLayout === "object") ? src.costLayout : {},
    jobLayout: (src.jobLayout && typeof src.jobLayout === "object") ? src.jobLayout : {},
    pumpEff: (src.pumpEff && typeof src.pumpEff === "object") ? src.pumpEff : {}
  };
}

function buildTinyCriticalBackup(snapshot, { quiet = false } = {}){
  const src = snapshot && typeof snapshot === "object" ? snapshot : {};
  const base = {
    schema: src.schema || APP_SCHEMA,
    tasksInterval: src.tasksInterval || [],
    tasksAsReq: src.tasksAsReq || [],
    maintenanceTasksV2: src.maintenanceTasksV2 || [],
    maintenanceOccurrencesV2: src.maintenanceOccurrencesV2 || [],
    maintenanceCalendarInstancesV2: src.maintenanceCalendarInstancesV2 || [],
    inventory: src.inventory || [],
    inventoryFolders: src.inventoryFolders || [],
    inventoryMaterials: src.inventoryMaterials || [],
    inventoryTransactions: src.inventoryTransactions || [],
    cuttingJobDatabase: src.cuttingJobDatabase || {},
    orderRequests: src.orderRequests || [],
    receiptTrackerWeeks: src.receiptTrackerWeeks || [],
    weeklyCostReports: src.weeklyCostReports || [],
    settingsFolders: src.settingsFolders || [],
    folders: src.folders || [],
    jobFolders: src.jobFolders || [],
    dashboardLayout: src.dashboardLayout || {},
    costLayout: src.costLayout || {},
    jobLayout: src.jobLayout || {},
    toleranceLayout: src.toleranceLayout || {},
    appConfig: src.appConfig || normalizeAppConfig(window.appConfig)
  };
  for (const [k,v] of Object.entries(src)){
    if (/(tolerance|inspection|quality)/i.test(k) && !(k in base)) base[k] = v;
  }
  const tiny = sanitizeValueForStorage(base, { dropHeavyHistory: true });
  if (!quiet) console.info("Tiny backup included keys", Object.keys(tiny).sort());
  return tiny;
}

function collectMaintenanceHistoryMetrics(state){
  const src = state && typeof state === "object" ? state : {};
  const listA = Array.isArray(src.tasksInterval) ? src.tasksInterval : [];
  const listB = Array.isArray(src.tasksAsReq) ? src.tasksAsReq : [];
  const countBy = (list, key)=>list.reduce((acc,t)=>acc + (Array.isArray(t?.[key]) ? t[key].length : 0), 0);
  return {
    tasksInterval: listA.length,
    tasksAsReq: listB.length,
    completedDatesCount: countBy(listA, "completedDates") + countBy(listB, "completedDates"),
    manualHistoryCount: countBy(listA, "manualHistory") + countBy(listB, "manualHistory"),
    maintenanceOccurrencesV2Count: Array.isArray(src.maintenanceOccurrencesV2) ? src.maintenanceOccurrencesV2.length : 0,
    maintenanceCalendarInstancesV2Count: Array.isArray(src.maintenanceCalendarInstancesV2) ? src.maintenanceCalendarInstancesV2.length : 0
  };
}
function logMaintenanceHistoryDiagnostics(source, state){
  const m = collectMaintenanceHistoryMetrics(state);
  console.info("Maintenance history diagnostics", { source, ...m, missingHistory: (m.completedDatesCount + m.manualHistoryCount) === 0 && (m.tasksInterval + m.tasksAsReq) > 0 });
  return m;
}
function shouldPreferLocalBackup(cloudState, localState){
  const c = collectMaintenanceHistoryMetrics(cloudState);
  const l = collectMaintenanceHistoryMetrics(localState);
  if ((l.completedDatesCount + l.manualHistoryCount + l.maintenanceOccurrencesV2Count) + 20 < (c.completedDatesCount + c.manualHistoryCount + c.maintenanceOccurrencesV2Count)) return false;
  return true;
}
function collectCoreBusinessMetrics(state){
  const src = state && typeof state === "object" ? state : {};
  const maintenance = collectMaintenanceHistoryMetrics(src);
  const orderLineItemCount = (Array.isArray(src.orderRequests) ? src.orderRequests : []).reduce((n,r)=>n + (Array.isArray(r?.items) ? r.items.length : 0), 0);
  const toleranceKeys = Object.keys(src).filter((k)=>/(tolerance|inspection|quality)/i.test(k));
  return {
    ...maintenance,
    inventoryCount: Array.isArray(src.inventory) ? src.inventory.length : 0,
    inventoryFoldersCount: Array.isArray(src.inventoryFolders) ? src.inventoryFolders.length : 0,
    inventoryMaterialsCount: Array.isArray(src.inventoryMaterials) ? src.inventoryMaterials.length : 0,
    inventoryTransactionsCount: Array.isArray(src.inventoryTransactions) ? src.inventoryTransactions.length : 0,
    orderRequestsCount: Array.isArray(src.orderRequests) ? src.orderRequests.length : 0,
    orderLineItemCount,
    receiptTrackerWeeksCount: Array.isArray(src.receiptTrackerWeeks) ? src.receiptTrackerWeeks.length : 0,
    settingsFoldersCount: Array.isArray(src.settingsFolders) ? src.settingsFolders.length : 0,
    foldersCount: Array.isArray(src.folders) ? src.folders.length : 0,
    toleranceFieldCount: toleranceKeys.length,
    layoutPresent: Boolean(src.dashboardLayout && src.costLayout && src.jobLayout)
  };
}
function logCoreBusinessDiagnostics(source, state){
  const metrics = collectCoreBusinessMetrics(state);
  console.info("Core business data diagnostics", { source, ...metrics });
  return metrics;
}
function countObjectKeys(value){
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).length : 0;
}

function countTaskNestedMapEntries(list, key){
  return (Array.isArray(list) ? list : []).reduce((acc, task)=>{
    const value = task?.[key];
    if (Array.isArray(value)) return acc + value.length;
    if (value && typeof value === "object") return acc + Object.keys(value).length;
    return acc;
  }, 0);
}

function countTaskNestedArrayEntries(list, key){
  return (Array.isArray(list) ? list : []).reduce((acc, task)=>acc + (Array.isArray(task?.[key]) ? task[key].length : 0), 0);
}

function countJobManualLogs(list){
  return (Array.isArray(list) ? list : []).reduce((acc, job)=>acc + (Array.isArray(job?.manualLogs) ? job.manualLogs.length : 0), 0);
}

function getValueAtPath(source, path){
  if (!source || typeof source !== "object") return undefined;
  return String(path || "").split(".").filter(Boolean).reduce((value, key)=>{
    if (value == null || typeof value !== "object") return undefined;
    return value[key];
  }, source);
}

function getDataSafetyShape(value){
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function countCollectionValue(value){
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  if (value == null) return 0;
  return 1;
}

function countNestedProtectedValues(list, key){
  return (Array.isArray(list) ? list : []).reduce((acc, item)=>{
    const value = item?.[key];
    if (Array.isArray(value)) return acc + value.length;
    if (value && typeof value === "object") return acc + Object.keys(value).length;
    return acc;
  }, 0);
}

function stableStringifyForIntegrity(value){
  const seen = new WeakSet();
  const normalize = (input)=>{
    if (!input || typeof input !== "object") return input;
    if (seen.has(input)) return "[Circular]";
    seen.add(input);
    if (Array.isArray(input)) return input.map(normalize);
    return Object.keys(input).sort().reduce((out, key)=>{
      const val = input[key];
      if (typeof val !== "function" && typeof val !== "undefined") out[key] = normalize(val);
      return out;
    }, {});
  };
  try { return JSON.stringify(normalize(value)); }
  catch (_err){ return String(value); }
}

function hashIntegrityString(input){
  const text = String(input || "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1){
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function fingerprintProtectedValue(value, entry){
  const shape = getDataSafetyShape(value);
  const count = entry?.expectedShape === "nestedCount"
    ? Number(value || 0)
    : countCollectionValue(value);
  const sample = stableStringifyForIntegrity(value);
  return `${shape}:${count}:${hashIntegrityString(sample)}`;
}

function countProtectedField(state, registryEntry){
  const entry = registryEntry || {};
  const src = state && typeof state === "object" ? state : {};
  if (entry.expectedShape === "nestedCount"){
    const parent = getValueAtPath(src, entry.parentPath);
    return countNestedProtectedValues(parent, entry.nestedKey);
  }
  return countCollectionValue(getValueAtPath(src, entry.path));
}

function validateProtectedFieldShape(value, entry){
  const expected = entry?.expectedShape || "unknown";
  if (expected === "nestedCount") return { ok:true, warning:null };
  if (expected === "array") return { ok:Array.isArray(value), warning:Array.isArray(value) ? null : "Expected array" };
  if (expected === "object") return { ok:Boolean(value && typeof value === "object" && !Array.isArray(value)), warning:(value && typeof value === "object" && !Array.isArray(value)) ? null : "Expected object" };
  if (expected === "arrayOrObject") return { ok:Array.isArray(value) || Boolean(value && typeof value === "object"), warning:(Array.isArray(value) || Boolean(value && typeof value === "object")) ? null : "Expected array or object" };
  return { ok:true, warning:null };
}

function getProtectedFieldRegistryCoverage(){
  const registered = new Set(PROTECTED_FIELD_REGISTRY.map(entry => entry.path));
  return {
    required: REQUIRED_PROTECTED_DATA_PATHS.slice(),
    registered: Array.from(registered),
    missing: REQUIRED_PROTECTED_DATA_PATHS.filter(path => !registered.has(path)),
    extra: Array.from(registered).filter(path => !REQUIRED_PROTECTED_DATA_PATHS.includes(path))
  };
}

function buildProtectedFieldIntegritySummary(state){
  const src = state && typeof state === "object" ? state : {};
  const fields = {};
  const warnings = [];
  const totalsByCategory = {};
  PROTECTED_FIELD_REGISTRY.forEach(entry => {
    const isNested = entry.expectedShape === "nestedCount";
    const rawValue = isNested ? countProtectedField(src, entry) : getValueAtPath(src, entry.path);
    const parentValue = isNested ? getValueAtPath(src, entry.parentPath) : undefined;
    const present = isNested
      ? Array.isArray(parentValue)
      : Object.prototype.hasOwnProperty.call(src, entry.path);
    const shape = isNested ? "nestedCount" : getDataSafetyShape(rawValue);
    const count = isNested ? Number(rawValue || 0) : countProtectedField(src, entry);
    const validation = validateProtectedFieldShape(rawValue, entry);
    const bytes = isNested ? 0 : estimatePayloadBytes(rawValue);
    const summary = {
      path: entry.path,
      label: entry.label,
      category: entry.category,
      expectedShape: entry.expectedShape,
      present,
      shape,
      count,
      bytes,
      allowEmptyOnNewWorkspace: entry.allowEmptyOnNewWorkspace === true,
      dangerousDrop: entry.dangerousDrop === true,
      fingerprint: fingerprintProtectedValue(rawValue, entry)
    };
    if (isNested){
      summary.parentPath = entry.parentPath;
      summary.nestedKey = entry.nestedKey;
      summary.parentPresent = Array.isArray(parentValue);
    }
    if (!present){
      summary.warning = isNested ? "Parent collection missing or not an array" : "Missing protected field";
      warnings.push({ path: entry.path, type: "missing", message: summary.warning });
    } else if (!validation.ok){
      summary.warning = validation.warning;
      warnings.push({ path: entry.path, type: "malformed", message: validation.warning, shape });
    }
    fields[entry.path] = summary;
    if (!totalsByCategory[entry.category]) totalsByCategory[entry.category] = { count:0, bytes:0, fields:0, warnings:0 };
    totalsByCategory[entry.category].count += Number(count || 0);
    totalsByCategory[entry.category].bytes += Number(bytes || 0);
    totalsByCategory[entry.category].fields += 1;
    if (summary.warning) totalsByCategory[entry.category].warnings += 1;
  });
  return {
    generatedAtISO: new Date().toISOString(),
    schema: src.schema ?? null,
    syncMeta: src.syncMeta && typeof src.syncMeta === "object" ? { ...src.syncMeta } : null,
    fields,
    warnings,
    totalsByCategory,
    coverage: getProtectedFieldRegistryCoverage(),
    totalBytes: estimatePayloadBytes(src),
    totalProtectedCount: Object.values(fields).reduce((sum, field)=>sum + Number(field.count || 0), 0),
    summaryFingerprint: hashIntegrityString(stableStringifyForIntegrity(Object.fromEntries(Object.entries(fields).map(([path, field]) => [path, {
      present: field.present,
      shape: field.shape,
      count: field.count,
      fingerprint: field.fingerprint
    }]))))
  };
}

function buildDataIntegritySummary(state){
  return buildProtectedFieldIntegritySummary(state);
}

function compareIntegritySummaries(baseSummary, nextSummary){
  const baseFields = baseSummary?.fields || {};
  const nextFields = nextSummary?.fields || {};
  const paths = Array.from(new Set([...Object.keys(baseFields), ...Object.keys(nextFields)])).sort();
  const changes = [];
  paths.forEach(path => {
    const before = baseFields[path] || {};
    const after = nextFields[path] || {};
    if (before.present && !after.present){
      changes.push({ path, type:"missing_after", before, after });
    } else if (before.shape && after.shape && before.shape !== after.shape){
      changes.push({ path, type:"shape_changed", beforeShape: before.shape, afterShape: after.shape, before, after });
    } else if (Number(before.count || 0) !== Number(after.count || 0)){
      changes.push({ path, type:"count_changed", beforeCount: Number(before.count || 0), afterCount: Number(after.count || 0), before, after });
    } else if (before.fingerprint && after.fingerprint && before.fingerprint !== after.fingerprint){
      changes.push({ path, type:"fingerprint_changed", count: Number(after.count || 0), before, after });
    }
  });
  return {
    generatedAtISO: new Date().toISOString(),
    baseFingerprint: baseSummary?.summaryFingerprint || "",
    nextFingerprint: nextSummary?.summaryFingerprint || "",
    changed: changes.length > 0,
    changes
  };
}

const DATA_SAFETY_PREFLIGHT_COUNT_DROP_RATIO = 0.5;
const DATA_SAFETY_PREFLIGHT_MIN_BASELINE_COUNT = 3;
const DATA_SAFETY_PREFLIGHT_TOTAL_DROP_RATIO = 0.5;
const DATA_SAFETY_PREFLIGHT_SIZE_DROP_RATIO = 0.5;

function hasAnyProtectedData(summary){
  const fields = summary?.fields || {};
  return Object.values(fields).some(field => field && field.present && Number(field.count || 0) > 0);
}

function hasAnyProtectedFieldPresence(summary){
  const fields = summary?.fields || {};
  return Object.values(fields).some(field => field && field.present);
}

function isDangerousShapeChange(before, after){
  const beforeShape = before?.shape || "";
  const afterShape = after?.shape || "";
  if (!beforeShape || !afterShape || beforeShape === afterShape) return false;
  if (beforeShape === "nestedCount" || afterShape === "nestedCount") return false;
  const protectedShapes = new Set(["array", "object"]);
  const dangerousTargets = new Set(["undefined", "null", "string", "number", "boolean"]);
  return protectedShapes.has(beforeShape) && dangerousTargets.has(afterShape);
}

function chooseProtectedSaveBaseline({ baselineState, latestRemoteState, localBackupState, allowFirstRun = false } = {}){
  const candidates = [
    { source: "latestRemoteState", state: latestRemoteState },
    { source: "loadedCloudState", state: baselineState },
    { source: "localBackupState", state: localBackupState }
  ];
  for (const candidate of candidates){
    if (candidate.state && typeof candidate.state === "object" && stateHasMeaningfulData(candidate.state)){
      return {
        ...candidate,
        summary: buildDataIntegritySummary(candidate.state),
        trusted: true
      };
    }
  }
  return {
    source: allowFirstRun ? "explicitFirstRunWorkspace" : "unknown",
    state: null,
    summary: null,
    trusted: Boolean(allowFirstRun)
  };
}

function detectDangerousIntegrityReduction(baseSummary, pendingSummary, options = {}){
  const reasons = [];
  const fieldChanges = [];
  const registryCoverage = pendingSummary?.coverage || getProtectedFieldRegistryCoverage();
  const baselineFields = baseSummary?.fields || {};
  const pendingFields = pendingSummary?.fields || {};
  const addReason = (reason)=>{ reasons.push(reason); return reason; };
  const addFieldChange = (change)=>{
    fieldChanges.push(change);
    if (change.reason) reasons.push(change.reason);
  };

  if (!pendingSummary || typeof pendingSummary !== "object"){
    addReason({ type:"pending_summary_unavailable", severity:"block", message:"Pending protected-data summary could not be built." });
  }
  if (Array.isArray(registryCoverage.missing) && registryCoverage.missing.length){
    addReason({ type:"registry_coverage_incomplete", severity:"block", paths: registryCoverage.missing.slice(), message:"Protected field registry coverage is incomplete." });
  }
  if (!baseSummary && !options.allowUnknownBaseline){
    addReason({ type:"baseline_unknown", severity:"block", message:"No trusted protected-data baseline is available for this save." });
  }

  PROTECTED_FIELD_REGISTRY.forEach(entry => {
    const before = baselineFields[entry.path];
    const after = pendingFields[entry.path];
    if (!before && !after) return;
    if (before?.present && !after?.present){
      addFieldChange({
        path: entry.path,
        label: entry.label,
        category: entry.category,
        type:"missing_after_present",
        baselineCount: Number(before.count || 0),
        pendingCount: 0,
        reason: { type:"protected_field_missing", severity:"block", path: entry.path, message:`${entry.label} is missing from the pending save.` }
      });
      return;
    }
    if (before?.present && after?.present && isDangerousShapeChange(before, after)){
      addFieldChange({
        path: entry.path,
        label: entry.label,
        category: entry.category,
        type:"dangerous_shape_change",
        baselineShape: before.shape,
        pendingShape: after.shape,
        baselineCount: Number(before.count || 0),
        pendingCount: Number(after.count || 0),
        reason: { type:"protected_field_shape_changed", severity:"block", path: entry.path, baselineShape: before.shape, pendingShape: after.shape, message:`${entry.label} changed from ${before.shape} to ${after.shape}.` }
      });
    }
    const beforeCount = Number(before?.count || 0);
    const afterCount = Number(after?.count || 0);
    if (beforeCount > 0 && afterCount === 0){
      addFieldChange({
        path: entry.path,
        label: entry.label,
        category: entry.category,
        type: entry.expectedShape === "nestedCount" ? "nested_history_zeroed" : "protected_count_zeroed",
        baselineCount: beforeCount,
        pendingCount: afterCount,
        reason: { type: entry.expectedShape === "nestedCount" ? "nested_history_zeroed" : "protected_count_zeroed", severity:"block", path: entry.path, baselineCount: beforeCount, pendingCount: afterCount, message:`${entry.label} would drop from ${beforeCount} to zero.` }
      });
    } else if (beforeCount >= DATA_SAFETY_PREFLIGHT_MIN_BASELINE_COUNT && afterCount <= Math.floor(beforeCount * DATA_SAFETY_PREFLIGHT_COUNT_DROP_RATIO)){
      addFieldChange({
        path: entry.path,
        label: entry.label,
        category: entry.category,
        type: entry.expectedShape === "nestedCount" ? "nested_history_large_drop" : "protected_count_large_drop",
        baselineCount: beforeCount,
        pendingCount: afterCount,
        dropRatio: beforeCount ? (beforeCount - afterCount) / beforeCount : 0,
        reason: { type: entry.expectedShape === "nestedCount" ? "nested_history_large_drop" : "protected_count_large_drop", severity:"block", path: entry.path, baselineCount: beforeCount, pendingCount: afterCount, thresholdRatio: DATA_SAFETY_PREFLIGHT_COUNT_DROP_RATIO, message:`${entry.label} would drop by 50% or more.` }
      });
    }
  });

  const baselineTotal = Number(baseSummary?.totalProtectedCount || 0);
  const pendingTotal = Number(pendingSummary?.totalProtectedCount || 0);
  if (baselineTotal >= DATA_SAFETY_PREFLIGHT_MIN_BASELINE_COUNT && pendingTotal <= Math.floor(baselineTotal * DATA_SAFETY_PREFLIGHT_TOTAL_DROP_RATIO)){
    addReason({ type:"total_protected_count_collapse", severity:"block", baselineTotal, pendingTotal, thresholdRatio: DATA_SAFETY_PREFLIGHT_TOTAL_DROP_RATIO, message:"Total protected record count would collapse by 50% or more." });
  }

  const baselineBytes = Number(baseSummary?.totalBytes || 0);
  const pendingBytes = Number(pendingSummary?.totalBytes || 0);
  if (baselineBytes > 0 && baselineTotal > 0 && pendingBytes > 0 && pendingBytes <= Math.floor(baselineBytes * DATA_SAFETY_PREFLIGHT_SIZE_DROP_RATIO)){
    addReason({ type:"payload_size_collapse", severity:"block", baselineBytes, pendingBytes, thresholdRatio: DATA_SAFETY_PREFLIGHT_SIZE_DROP_RATIO, message:"State payload size would collapse by 50% or more while protected baseline data exists." });
  }

  return {
    generatedAtISO: new Date().toISOString(),
    allowed: reasons.length === 0,
    blocked: reasons.length > 0,
    severity: reasons.length ? "block" : "info",
    reasons,
    fieldChanges,
    baselineFingerprint: baseSummary?.summaryFingerprint || "",
    pendingFingerprint: pendingSummary?.summaryFingerprint || "",
    baselineTotalProtectedCount: baselineTotal,
    pendingTotalProtectedCount: pendingTotal,
    baselineBytes,
    pendingBytes
  };
}

function validateProtectedSavePreflight({ baselineState, pendingState, latestRemoteState, localBackupState, windowState = null, coverageReport = null, reason = "cloud save", revisionConflict = null, allowFirstRun = false, skipRuntimeGates = false } = {}){
  const generatedAtISO = new Date().toISOString();
  let pendingSummary = null;
  let baseline = null;
  const reasons = [];
  try {
    pendingSummary = buildDataIntegritySummary(pendingState || {});
  } catch (err){
    return {
      generatedAtISO,
      allowed:false,
      blocked:true,
      severity:"block",
      reason,
      reasons:[{ type:"pending_summary_exception", severity:"block", message:String(err?.message || err) }],
      fieldChanges:[],
      baselineSource:"unknown",
      baselineFingerprint:"",
      pendingFingerprint:""
    };
  }

  baseline = chooseProtectedSaveBaseline({ baselineState, latestRemoteState, localBackupState, allowFirstRun });
  const pendingHasProtectedPresence = hasAnyProtectedFieldPresence(pendingSummary);
  const pendingHasProtectedData = hasAnyProtectedData(pendingSummary);
  const baselineHasProtectedData = hasAnyProtectedData(baseline.summary);

  if (typeof window !== "undefined" && !skipRuntimeGates){
    if (isRecoveryMode()) reasons.push({ type:"recovery_mode_active", severity:"block", message:"Recovery Mode is active; cloud saves must remain blocked." });
    if (window.__localBackupOnlyMode) reasons.push({ type:"local_backup_only_mode", severity:"block", message:"Local-backup-only state is active without a trusted cloud baseline." });
    if (!window.__cloudLoadAttemptComplete || !window.__initialAdoptComplete) reasons.push({ type:"cloud_load_or_adoption_incomplete", severity:"block", message:"Initial cloud load/adoption is incomplete." });
  }
  if (revisionConflict?.blocked){
    reasons.push({ type:"remote_revision_conflict", severity:"block", message:"Remote state is newer than this client.", details: revisionConflict });
  }
  if (!baseline.trusted && pendingHasProtectedPresence && !allowFirstRun){
    reasons.push({ type:"unknown_baseline_with_protected_fields", severity:"block", message:"Pending state contains protected fields but no trusted baseline is available." });
  }
  if (!baseline.trusted && pendingHasProtectedData && !allowFirstRun){
    reasons.push({ type:"unknown_baseline_with_protected_data", severity:"block", message:"Pending state contains protected data but no trusted baseline is available." });
  }

  const activeMissing = classifyMissingProtectedPathsForSave({
    pendingState: pendingState || {},
    baselineState,
    localBackupState,
    remoteState: latestRemoteState,
    windowState,
    coverageReport
  });
  const activeMissingReasons = (activeMissing.blocking || []).map(item => ({
    type: "active_protected_path_missing",
    severity: "block",
    path: item.path,
    message: item.reason,
    pending: item.pending,
    baseline: item.baseline,
    localBackup: item.localBackup,
    remote: item.remote,
    window: item.window,
    activeSources: item.activeSources || [],
    suggestedNextAction: item.suggestedNextAction
  }));
  const cloudCompactionReasons = (Array.isArray(coverageReport?.cloudExcludedProtectedPaths) ? coverageReport.cloudExcludedProtectedPaths : []).map(path => ({
    type: "protected_path_removed_by_cloud_compaction",
    severity: "block",
    path,
    message: `${path} is protected but would be removed by normal cloud compaction before save.`,
    pending: getSaveSchemaCoveragePathInfo(pendingState || {}, path),
    suggestedNextAction: "Stop save, export diagnostics, and update compaction rules so protected entered data is never removed."
  }));
  const activeMissingWarnings = (activeMissing.warnings || []).map(item => ({
    type: item.category || "protected_path_warning",
    severity: "warn",
    path: item.path,
    message: item.reason,
    pending: item.pending,
    baseline: item.baseline,
    localBackup: item.localBackup,
    remote: item.remote,
    window: item.window,
    suggestedNextAction: item.suggestedNextAction
  }));
  const reduction = detectDangerousIntegrityReduction(baseline.summary, pendingSummary, { allowUnknownBaseline: baseline.trusted });
  const allReasons = reasons.concat(activeMissingReasons).concat(cloudCompactionReasons).concat(reduction.reasons || []);
  return {
    generatedAtISO,
    allowed: allReasons.length === 0,
    blocked: allReasons.length > 0,
    severity: allReasons.length ? "block" : "info",
    reason,
    reasons: allReasons,
    warnings: activeMissingWarnings,
    fieldChanges: reduction.fieldChanges || [],
    activeMissingClassification: activeMissing,
    baselineSource: baseline.source,
    baselineFingerprint: baseline.summary?.summaryFingerprint || "",
    pendingFingerprint: pendingSummary?.summaryFingerprint || "",
    baselineSummary: baseline.summary,
    pendingSummary,
    baselineTotalProtectedCount: Number(baseline.summary?.totalProtectedCount || 0),
    pendingTotalProtectedCount: Number(pendingSummary?.totalProtectedCount || 0),
    baselineBytes: Number(baseline.summary?.totalBytes || 0),
    pendingBytes: Number(pendingSummary?.totalBytes || 0),
    baselineHasProtectedData,
    pendingHasProtectedData,
    registryCoverage: pendingSummary.coverage
  };
}

function rememberDangerousSaveBlock(preflight, context = {}){
  const block = {
    atISO: new Date().toISOString(),
    ...context,
    preflight,
    blockedFieldNames: Array.from(new Set(
      (preflight?.fieldChanges || []).map(change => change.path).filter(Boolean)
        .concat((preflight?.reasons || []).map(reason => reason.path).filter(Boolean))
    )),
    recommendedNextAction: "Stay in Recovery Mode if active, export diagnostics, and do not force-save until the protected-data counts are reviewed."
  };
  if (typeof window !== "undefined"){
    window.__lastDangerousSaveBlock = block;
  }
  console.error("Dangerous cloud save blocked by protected data preflight", block);
  try { if (typeof toast === "function") toast("Cloud save blocked: protected data loss detected. Export diagnostics before continuing."); } catch (_err){}
  try { renderRecoveryDiagnosticsPanel(); } catch (_err){}
  return block;
}

async function writeBlockedSaveLog(preflight, context = {}){
  if (!FB?.workspaceDoc) return;
  try {
    await FB.workspaceDoc.collection("app").doc("saveLogs").collection("entries").add({
      atISO: new Date().toISOString(),
      status: "blocked",
      reason: context.reason || preflight?.reason || "protected_save_preflight",
      reasons: (preflight?.reasons || []).slice(0, 25),
      fieldChanges: (preflight?.fieldChanges || []).slice(0, 50),
      baselineSource: preflight?.baselineSource || "",
      baselineFingerprint: preflight?.baselineFingerprint || "",
      pendingFingerprint: preflight?.pendingFingerprint || "",
      baselineTotalProtectedCount: Number(preflight?.baselineTotalProtectedCount || 0),
      pendingTotalProtectedCount: Number(preflight?.pendingTotalProtectedCount || 0),
      baselineBytes: Number(preflight?.baselineBytes || 0),
      pendingBytes: Number(preflight?.pendingBytes || 0),
      workspaceId: WORKSPACE_ID
    });
  } catch (err){
    console.warn("Failed to write blocked-save diagnostic log", err);
  }
}

function runDataSafetyPreflightSelfCheck(){
  const clone = (value)=>JSON.parse(JSON.stringify(value));
  const baseline = {
    schema: APP_SCHEMA,
    cuttingJobs: [{ id:"job1", manualLogs:[{ dateISO:"2026-01-01", completedHours:2 }] }],
    completedCuttingJobs: [{ id:"done1", manualLogs:[{ dateISO:"2026-01-02", completedHours:1 }] }],
    cuttingJobDatabase: [{ id:"db1" }],
    tasksInterval: [{ id:"t1", completedDates:["2026-01-01"], manualHistory:[{ dateISO:"2026-01-01" }], occurrenceNotes:{ a:"note" }, occurrenceHours:{ a:1 }, removedOccurrences:["2026-01-02"] }],
    tasksAsReq: [{ id:"a1", completedDates:["2026-01-03"], manualHistory:[{ dateISO:"2026-01-03" }], occurrenceNotes:{ b:"note" }, occurrenceHours:{ b:1 }, removedOccurrences:["2026-01-04"] }],
    settingsFolders: [{ id:"sf1" }],
    folders: [{ id:"f1" }],
    jobFolders: [{ id:"jf1" }],
    inventory: [{ id:"i1" }, { id:"i2" }, { id:"i3" }],
    inventoryFolders: [{ id:"if1" }],
    inventoryMaterials: [{ id:"m1" }],
    inventoryTransactions: [{ id:"it1" }],
    receiptTrackerWeeks: [{ id:"rw1" }],
    orderRequests: [{ id:"or1", items:[{ id:"line1" }] }],
    weeklyCostReports: [{ id:"w1" }],
    dailyCutHours: [{ dateISO:"2026-01-01", hours:1 }],
    totalHistory: [{ dateISO:"2026-01-01", hours:10 }],
    pumpEff: { entries:[{ id:"p1" }], notes:[{ id:"n1" }] },
    garnetCleanings: [{ id:"g1" }],
    appConfig: { theme:"default" },
    dashboardLayout: { cards:["a"] },
    costLayout: { cards:["b"] },
    jobLayout: { cards:["c"] },
    maintenanceTasksV2: [{ id:"mt1" }],
    maintenanceCalendarInstancesV2: [{ id:"mi1" }],
    maintenanceOccurrencesV2: [{ id:"mo1" }],
    oneDriveJobConfig: { enabled:true }
  };
  const run = (name, mutate, expectedBlocked)=>{
    const pending = clone(baseline);
    if (typeof mutate === "function") mutate(pending);
    const result = validateProtectedSavePreflight({
      baselineState: baseline,
      pendingState: pending,
      latestRemoteState: baseline,
      reason: `self-check:${name}`,
      allowFirstRun: false,
      skipRuntimeGates: true
    });
    return { name, expectedBlocked, blocked: result.blocked, passed: result.blocked === expectedBlocked, reasons: result.reasons.map(r => r.type), fieldChanges: result.fieldChanges.map(c => c.path) };
  };
  const results = [
    run("same-state-allows", null, false),
    run("completedCuttingJobs-zero-blocks", pending => { pending.completedCuttingJobs = []; }, true),
    run("task-completedDates-zero-blocks", pending => { pending.tasksInterval[0].completedDates = []; }, true),
    run("cutting-manualLogs-zero-blocks", pending => { pending.cuttingJobs[0].manualLogs = []; }, true),
    run("inventory-zero-blocks", pending => { pending.inventory = []; }, true),
    run("missing-protected-field-blocks", pending => { delete pending.orderRequests; }, true),
    run("shape-change-blocks", pending => { pending.inventory = "not an array"; }, true)
  ];
  const coverage = getProtectedFieldRegistryCoverage();
  results.push({ name:"registry-coverage-complete", expectedBlocked:false, blocked:coverage.missing.length > 0, passed:coverage.missing.length === 0, missing:coverage.missing });
  const baselineSummary = buildDataIntegritySummary(baseline);
  const pendingSummary = buildDataIntegritySummary(baseline);
  pendingSummary.coverage = { ...pendingSummary.coverage, missing:["selfCheck.missingRegistryPath"] };
  const missingCoverage = detectDangerousIntegrityReduction(baselineSummary, pendingSummary);
  results.push({ name:"registry-missing-coverage-blocks", expectedBlocked:true, blocked:missingCoverage.blocked, passed:missingCoverage.blocked === true, reasons:missingCoverage.reasons.map(r => r.type) });
  const summary = {
    generatedAtISO: new Date().toISOString(),
    passed: results.every(result => result.passed),
    results
  };
  console.info("Data safety preflight self-check", summary);
  return summary;
}

if (typeof window !== "undefined"){
  window.REQUIRED_PROTECTED_DATA_PATHS = REQUIRED_PROTECTED_DATA_PATHS;
  window.PROTECTED_FIELD_REGISTRY = PROTECTED_FIELD_REGISTRY;
  window.getProtectedFieldRegistryCoverage = getProtectedFieldRegistryCoverage;
  window.buildDataIntegritySummary = buildDataIntegritySummary;
  window.buildProtectedFieldIntegritySummary = buildProtectedFieldIntegritySummary;
  window.compareIntegritySummaries = compareIntegritySummaries;
  window.detectDangerousIntegrityReduction = detectDangerousIntegrityReduction;
  window.validateProtectedSavePreflight = validateProtectedSavePreflight;
  window.runDataSafetyPreflightSelfCheck = runDataSafetyPreflightSelfCheck;
  window.buildDataIntegritySummaryForCurrentState = function(){
    return buildDataIntegritySummary(getCurrentAppStateForDiagnostics());
  };
  window.exportDataIntegritySummary = function(){
    const summary = buildDataIntegritySummary(getCurrentAppStateForDiagnostics());
    if (typeof exportJsonDownload === "function"){
      exportJsonDownload(`omax-data-integrity-summary-${Date.now()}.json`, summary);
    }
    return summary;
  };
}

function buildProtectedFieldSummary(state){
  const src = state && typeof state === "object" ? state : {};
  const integrity = buildProtectedFieldIntegritySummary(src);
  const protectedFields = {};
  PROTECTED_STATE_FIELDS.forEach(field => {
    const value = src[field];
    const fieldIntegrity = integrity.fields[field] || {};
    protectedFields[field] = {
      present: Object.prototype.hasOwnProperty.call(src, field),
      type: Array.isArray(value) ? "array" : (value === null ? "null" : typeof value),
      length: Array.isArray(value) ? value.length : null,
      keyCount: value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).length : null,
      bytes: estimatePayloadBytes(value),
      count: Number(fieldIntegrity.count || 0),
      fingerprint: fieldIntegrity.fingerprint || ""
    };
  });
  const interval = Array.isArray(src.tasksInterval) ? src.tasksInterval : [];
  const asReq = Array.isArray(src.tasksAsReq) ? src.tasksAsReq : [];
  const allTasks = interval.concat(asReq);
  const cutting = Array.isArray(src.cuttingJobs) ? src.cuttingJobs : [];
  const completed = Array.isArray(src.completedCuttingJobs) ? src.completedCuttingJobs : [];
  const pump = src.pumpEff;
  return {
    firestorePath: FB?.docRef?.path || `workspaces/${WORKSPACE_ID}/app/state`,
    workspaceId: WORKSPACE_ID,
    clientId: (typeof window !== "undefined" && window.localStorage) ? String(window.localStorage.getItem(CLOUD_SYNC_CLIENT_KEY) || "") : "unknown_client",
    syncMeta: {
      rev: Number(src.syncMeta?.rev || 0),
      updatedAtISO: src.syncMeta?.updatedAtISO || "",
      updatedBy: src.syncMeta?.updatedBy || ""
    },
    integrity,
    protectedFields,
    nestedHistoryCounts: {
      completedDates: countTaskNestedArrayEntries(allTasks, "completedDates"),
      manualHistory: countTaskNestedArrayEntries(allTasks, "manualHistory"),
      removedOccurrences: countTaskNestedArrayEntries(allTasks, "removedOccurrences") + countTaskNestedMapEntries(allTasks, "removedOccurrences"),
      occurrenceNotes: countTaskNestedMapEntries(allTasks, "occurrenceNotes"),
      occurrenceHours: countTaskNestedMapEntries(allTasks, "occurrenceHours")
    },
    cuttingJobCounts: {
      cuttingJobs: cutting.length,
      completedCuttingJobs: completed.length,
      manualLogs: countJobManualLogs(cutting) + countJobManualLogs(completed)
    },
    purchaseOrderCounts: {
      orderRequests: Array.isArray(src.orderRequests) ? src.orderRequests.length : 0,
      receiptTrackerWeeks: Array.isArray(src.receiptTrackerWeeks) ? src.receiptTrackerWeeks.length : 0
    },
    maintenanceV2Counts: {
      maintenanceTasksV2: Array.isArray(src.maintenanceTasksV2) ? src.maintenanceTasksV2.length : 0,
      maintenanceCalendarInstancesV2: Array.isArray(src.maintenanceCalendarInstancesV2) ? src.maintenanceCalendarInstancesV2.length : 0,
      maintenanceOccurrencesV2: Array.isArray(src.maintenanceOccurrencesV2) ? src.maintenanceOccurrencesV2.length : 0
    },
    pumpCounts: {
      isArray: Array.isArray(pump),
      length: Array.isArray(pump) ? pump.length : null,
      keyCount: pump && typeof pump === "object" && !Array.isArray(pump) ? Object.keys(pump).length : 0,
      entries: pump && typeof pump === "object" && Array.isArray(pump.entries) ? pump.entries.length : 0,
      notes: pump && typeof pump === "object" && Array.isArray(pump.notes) ? pump.notes.length : 0
    }
  };
}

const SAVE_SCHEMA_COVERAGE_FOCUS_PATHS = [
  "completedDates",
  "manualHistory",
  "cuttingJobDatabase",
  "inventoryTransactions",
  "weeklyCostReports",
  "deletedItems",
  "maintenanceOccurrencesV2",
  "maintenanceTasksV2",
  "maintenanceCalendarInstancesV2",
  "cuttingJobs",
  "completedCuttingJobs",
  "receiptTrackerWeeks",
  "inventory",
  "orderRequests",
  "dailyCutHours",
  "pumpEff",
  "appConfig",
  "dashboardLayout",
  "costLayout",
  "jobLayout"
];

function getSaveSchemaCoveragePathInfo(state, path){
  const parts = String(path || "").split(".").filter(Boolean);
  if (!parts.length) return { present:false, topLevelKey:"", nested:false, count:0, examples:[] };
  const topLevelKey = parts[0];
  if (parts.length === 1){
    const present = Boolean(state && typeof state === "object" && Object.prototype.hasOwnProperty.call(state, topLevelKey));
    const value = present ? state[topLevelKey] : undefined;
    return {
      present,
      topLevelKey,
      nested:false,
      count: countCollectionValue(value),
      shape: getDataSafetyShape(value),
      examples: present ? [topLevelKey] : []
    };
  }
  let nodes = [state];
  for (const part of parts){
    const next = [];
    nodes.forEach(node => {
      if (Array.isArray(node)){
        node.forEach(item => {
          if (item && typeof item === "object" && Object.prototype.hasOwnProperty.call(item, part)) next.push(item[part]);
        });
      } else if (node && typeof node === "object" && Object.prototype.hasOwnProperty.call(node, part)){
        next.push(node[part]);
      }
    });
    nodes = next;
    if (!nodes.length) break;
  }
  return {
    present: nodes.length > 0,
    topLevelKey,
    nested:true,
    count: nodes.reduce((sum, value)=>sum + countCollectionValue(value), 0),
    shape: nodes.length ? getDataSafetyShape(nodes[0]) : "undefined",
    examples: nodes.slice(0, 5).map(value => getDataSafetyShape(value))
  };
}

function buildSnapshotForSaveSchemaCoverage(){
  if (typeof snapshotState !== "function") return { snapshot:{}, error:"snapshotState is unavailable." };
  const previousStrippedHeavyFields = (typeof window !== "undefined") ? window.__lastStrippedHeavyFields : undefined;
  const previousSettingsFolders = (typeof window !== "undefined" && Array.isArray(window.settingsFolders)) ? cloneStructured(window.settingsFolders) : undefined;
  const previousFolders = (typeof window !== "undefined" && Array.isArray(window.folders)) ? cloneStructured(window.folders) : undefined;
  let storagePatched = false;
  let originalSetItem = null;
  let storagePatchTarget = null;
  try {
    if (typeof window !== "undefined" && window.localStorage && typeof window.localStorage.setItem === "function"){
      storagePatchTarget = (typeof Storage !== "undefined" && Storage.prototype && typeof Storage.prototype.setItem === "function")
        ? Storage.prototype
        : window.localStorage;
      originalSetItem = storagePatchTarget.setItem;
      storagePatchTarget.setItem = function(key, value){
        if (String(key || "") === JOB_FILE_CACHE_KEY) return undefined;
        return originalSetItem.call(this, key, value);
      };
      storagePatched = true;
    }
  } catch (_err){ storagePatched = false; }
  try {
    const snapshot = snapshotState();
    return { snapshot: cloneStructured(snapshot) || {}, error:null };
  } catch (err){
    return { snapshot:{}, error:String(err?.message || err) };
  } finally {
    if (storagePatched && originalSetItem){
      try { storagePatchTarget.setItem = originalSetItem; } catch (_err){}
    }
    if (typeof window !== "undefined"){
      window.__lastStrippedHeavyFields = previousStrippedHeavyFields;
      if (previousSettingsFolders) window.settingsFolders = previousSettingsFolders;
      if (previousFolders) window.folders = previousFolders;
    }
  }
}

function getSaveSchemaCoverageReport(options = {}){
  const hasProvidedSnapshot = Boolean(options && options.pendingSnapshot && typeof options.pendingSnapshot === "object");
  const snapshotResult = hasProvidedSnapshot
    ? { snapshot: cloneStructured(options.pendingSnapshot) || {}, error:null }
    : buildSnapshotForSaveSchemaCoverage();
  const pendingSnapshot = snapshotResult.snapshot || {};
  const compactedForCloud = compactStateForStorage(pendingSnapshot);
  const compactedForBackup = compactStateForStorage(pendingSnapshot, { forBackup:true });
  const tinyBackup = buildTinyCriticalBackup(pendingSnapshot, { quiet:true });
  const localBackup = loadLocalBackupReadOnly();
  const requiredProtectedPaths = Array.isArray(REQUIRED_PROTECTED_DATA_PATHS) ? REQUIRED_PROTECTED_DATA_PATHS.slice() : [];
  const registryProtectedPaths = Array.isArray(PROTECTED_FIELD_REGISTRY) ? PROTECTED_FIELD_REGISTRY.map(entry => entry.path).filter(Boolean) : [];
  const allProtectedPaths = Array.from(new Set(requiredProtectedPaths.concat(registryProtectedPaths))).sort();
  const snapshotKeys = Object.keys(pendingSnapshot).sort();
  const presentProtectedPaths = [];
  const missingProtectedPaths = [];
  const protectedPathDetails = {};

  allProtectedPaths.forEach(path => {
    const info = getSaveSchemaCoveragePathInfo(pendingSnapshot, path);
    protectedPathDetails[path] = info;
    if (info.present) presentProtectedPaths.push(path);
    else missingProtectedPaths.push(path);
  });

  const protectedWindowKeysMissingFromSnapshot = allProtectedPaths
    .filter(path => !path.includes("."))
    .filter(path => typeof window !== "undefined"
      && Object.prototype.hasOwnProperty.call(window, path)
      && !Object.prototype.hasOwnProperty.call(pendingSnapshot, path))
    .sort();

  const protectedPathsOnlyPresentInBackups = allProtectedPaths.filter(path => {
    if (getSaveSchemaCoveragePathInfo(pendingSnapshot, path).present) return false;
    const inTiny = getSaveSchemaCoveragePathInfo(tinyBackup, path).present;
    const inLocal = getSaveSchemaCoveragePathInfo(localBackup || {}, path).present;
    return inTiny || inLocal;
  }).sort();

  const cloudExcludedProtectedPaths = allProtectedPaths.filter(path => {
    const before = getSaveSchemaCoveragePathInfo(pendingSnapshot, path).present;
    const after = getSaveSchemaCoveragePathInfo(compactedForCloud, path).present;
    return before && !after;
  }).sort();

  const backupExcludedProtectedPaths = allProtectedPaths.filter(path => {
    const before = getSaveSchemaCoveragePathInfo(compactedForCloud, path).present;
    const after = getSaveSchemaCoveragePathInfo(compactedForBackup, path).present;
    return before && !after;
  }).sort();

  const sanitizerRiskPaths = [
    {
      path: "cuttingJobs.files.*",
      risk: "stripJobFileDataUrls removes embedded file/data-url/content fields before save; job metadata and manualLogs are expected to remain.",
      source: "stripJobFileDataUrls"
    },
    {
      path: "completedCuttingJobs.files.*",
      risk: "stripJobFileDataUrls removes embedded file/data-url/content fields before save; completed job metadata and manualLogs are expected to remain.",
      source: "stripJobFileDataUrls"
    },
    {
      path: "cuttingJobs / completedCuttingJobs",
      risk: "safeCleanupLoadedState sanitizes job objects on load, so protected job history fields must never be named like debug/cache/preview or embedded content.",
      source: "safeCleanupLoadedState + sanitizeValueForStorage"
    },
    {
      path: "tasksInterval.completedDates / tasksAsReq.completedDates",
      risk: "Protected maintenance completion history; currently recognized as protected business data by sanitizer key matching and registry coverage.",
      source: "PROTECTED_FIELD_REGISTRY + isProtectedBusinessDataKey"
    },
    {
      path: "tasksInterval.manualHistory / tasksAsReq.manualHistory",
      risk: "Protected maintenance manual history; currently recognized as protected business data by sanitizer key matching and registry coverage.",
      source: "PROTECTED_FIELD_REGISTRY + isProtectedBusinessDataKey"
    }
  ];

  const normalizationRiskPaths = [
    { path:"inventory", risk:"adoptState maps entries through normalizeInventoryItem; current normalizer spreads raw item first, but future changes could drop unknown inventory fields." },
    { path:"orderRequests", risk:"adoptState maps entries through normalizeOrderRequests; normalizeOrderRequest/normalizeOrderItem reconstruct objects and can drop unknown purchase/history/linkage fields." },
    { path:"inventoryMaterials", risk:"snapshotState/adoptState pass through normalizeInventoryMaterials; field preservation depends on that helper." },
    { path:"dailyCutHours", risk:"adoptState normalizes dailyCutHours and compactStateForStorage keeps only the last 365 entries." },
    { path:"appConfig", risk:"snapshotState/adoptState normalize appConfig; unknown settings preservation depends on normalizeAppConfig." }
  ];

  const staleWholeStateOverwriteRiskNotes = [
    "Dashboard/cost/job layout changes must keep using saveLayoutCloudOnly() so layout movement writes only layout keys instead of snapshotting the whole app state.",
    "saveCloudInternal checks remote revision before set(..., { merge:true }), but the read-then-write sequence is not a Firestore transaction/compare-and-swap.",
    "Only totalHistory, dailyCutHours, and pumpEff have explicit remote merge protection before save; maintenanceOccurrencesV2, cutting jobs, task history, and purchase history rely on preflight blocking rather than append-only merging.",
    "loadFromCloud seeds defaults only when neither cloud nor local backup is meaningful, but a false non-meaningful read would be dangerous if not caught by recovery/preflight gates."
  ];

  const possibleDeprecatedProtectedPaths = missingProtectedPaths
    .filter(path => ["cuttingJobDatabase", "inventoryTransactions"].includes(path))
    .map(path => ({
      path,
      status: "unknown",
      note: "Protected registry includes this path, but the pending main save snapshot does not. Treat as sacred/unknown until DS-03 proves it obsolete or adds it to snapshotState."
    }));

  const focusedProtectedPathStatus = {};
  SAVE_SCHEMA_COVERAGE_FOCUS_PATHS.forEach(path => {
    const direct = getSaveSchemaCoveragePathInfo(pendingSnapshot, path);
    const nestedMatches = allProtectedPaths
      .filter(protectedPath => protectedPath === path || protectedPath.endsWith(`.${path}`))
      .map(protectedPath => ({
        protectedPath,
        ...getSaveSchemaCoveragePathInfo(pendingSnapshot, protectedPath)
      }));
    focusedProtectedPathStatus[path] = {
      direct,
      nestedMatches,
      protected: registryProtectedPaths.includes(path) || requiredProtectedPaths.includes(path) || nestedMatches.length > 0
    };
  });

  const warnings = [];
  if (snapshotResult.error) warnings.push({ type:"snapshot_error", message:snapshotResult.error });
  missingProtectedPaths.forEach(path => warnings.push({ type:"missing_protected_path", path, message:`Protected path ${path} is not present in the pending save snapshot.` }));
  protectedWindowKeysMissingFromSnapshot.forEach(path => warnings.push({ type:"window_key_missing_from_snapshot", path, message:`window.${path} exists but snapshotState() did not include it.` }));
  backupExcludedProtectedPaths.forEach(path => warnings.push({ type:"backup_excludes_protected_path", path, message:`Protected path ${path} is present in cloud compact state but excluded from local backup compaction.` }));
  cloudExcludedProtectedPaths.forEach(path => warnings.push({ type:"cloud_compaction_excludes_protected_path", path, message:`Protected path ${path} is present before compaction but missing after normal cloud compaction.` }));

  return {
    generatedAtISO: new Date().toISOString(),
    readOnly: true,
    snapshotKeys,
    requiredProtectedPaths,
    registryProtectedPaths,
    presentProtectedPaths: presentProtectedPaths.sort(),
    missingProtectedPaths: missingProtectedPaths.sort(),
    protectedPathDetails,
    protectedWindowKeysMissingFromSnapshot,
    protectedPathsOnlyPresentInBackups,
    cloudExcludedProtectedPaths,
    backupExcludedProtectedPaths,
    sanitizerRiskPaths,
    normalizationRiskPaths,
    staleWholeStateOverwriteRiskNotes,
    possibleDeprecatedProtectedPaths,
    focusedProtectedPathStatus,
    warnings
  };
}

function debugSaveSchemaCoverage(){
  const report = getSaveSchemaCoverageReport();
  console.info("Save schema coverage diagnostic", report);
  if (Array.isArray(report.warnings) && report.warnings.length) console.warn("Save schema coverage warnings", report.warnings);
  return report;
}

function debugProtectedSavePreflightClassification(){
  const snapshotResult = buildSnapshotForSaveSchemaCoverage();
  const pendingState = snapshotResult.snapshot || {};
  const localBackupState = loadLocalBackupReadOnly();
  const classification = classifyMissingProtectedPathsForSave({
    pendingState,
    baselineState: (typeof window !== "undefined" ? window.__lastLoadedCloudState : null) || null,
    localBackupState,
    remoteState: null,
    windowState: buildWindowProtectedStateForCoverage(),
    coverageReport: getSaveSchemaCoverageReport({ pendingSnapshot: pendingState })
  });
  console.info("Protected save preflight classification diagnostic", classification);
  return classification;
}

function summarizeV2DeltaRecord(entry){
  if (!entry || typeof entry !== "object") return null;
  return {
    id: entry.id || null,
    taskId: entry.taskId || null,
    legacyTaskId: entry.legacyTaskId || null,
    instanceId: entry.instanceId || null,
    rootOccurrenceId: entry.rootOccurrenceId || null,
    eventType: entry.eventType || null,
    effectiveDateISO: entry.effectiveDateISO || null,
    startDateISO: entry.startDateISO || null,
    recordedAtISO: entry.recordedAtISO || null,
    name: entry.name || null
  };
}

function duplicateV2IdSummary(list){
  const counts = new Map();
  (Array.isArray(list) ? list : []).forEach(entry => {
    const id = entry && entry.id != null ? String(entry.id) : "";
    if (!id) return;
    counts.set(id, (counts.get(id) || 0) + 1);
  });
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b)=> String(a.id).localeCompare(String(b.id)));
}

function buildV2CurrentCloudDeltaForList(currentList, cloudList){
  const current = Array.isArray(currentList) ? currentList : [];
  const cloud = Array.isArray(cloudList) ? cloudList : [];
  const currentIds = new Set(current.map(entry => entry && entry.id != null ? String(entry.id) : "").filter(Boolean));
  const cloudIds = new Set(cloud.map(entry => entry && entry.id != null ? String(entry.id) : "").filter(Boolean));
  const onlyCurrent = current.filter(entry => entry && entry.id != null && !cloudIds.has(String(entry.id)));
  const onlyCloud = cloud.filter(entry => entry && entry.id != null && !currentIds.has(String(entry.id)));
  return {
    currentCount: current.length,
    cloudCount: cloud.length,
    onlyCurrentCount: onlyCurrent.length,
    onlyCloudCount: onlyCloud.length,
    onlyCurrent: onlyCurrent.slice(0, 25).map(summarizeV2DeltaRecord).filter(Boolean),
    onlyCloud: onlyCloud.slice(0, 25).map(summarizeV2DeltaRecord).filter(Boolean),
    duplicateIdsCurrent: duplicateV2IdSummary(current),
    duplicateIdsCloud: duplicateV2IdSummary(cloud)
  };
}

function debugV2CurrentCloudDelta(){
  const cloud = (typeof window !== "undefined" && window.__lastLoadedCloudState && typeof window.__lastLoadedCloudState === "object") ? window.__lastLoadedCloudState : {};
  const report = {
    generatedAtISO: new Date().toISOString(),
    readOnly: true,
    instances: buildV2CurrentCloudDeltaForList(
      typeof window !== "undefined" ? window.maintenanceCalendarInstancesV2 : [],
      cloud.maintenanceCalendarInstancesV2
    ),
    occurrences: buildV2CurrentCloudDeltaForList(
      typeof window !== "undefined" ? window.maintenanceOccurrencesV2 : [],
      cloud.maintenanceOccurrencesV2
    )
  };
  console.info("Maintenance V2 current-vs-cloud delta diagnostic", report);
  return report;
}

if (typeof window !== "undefined"){
  if (window.DEBUG_MODE){
    window.getSaveSchemaCoverageReport = getSaveSchemaCoverageReport;
    window.debugSaveSchemaCoverage = debugSaveSchemaCoverage;
    window.debugProtectedSavePreflightClassification = debugProtectedSavePreflightClassification;
    window.debugV2CurrentCloudDelta = debugV2CurrentCloudDelta;
  } else {
    try { delete window.getSaveSchemaCoverageReport; } catch (_err){}
    try { delete window.debugSaveSchemaCoverage; } catch (_err){}
    try { delete window.debugProtectedSavePreflightClassification; } catch (_err){}
    try { delete window.debugV2CurrentCloudDelta; } catch (_err){}
  }
}

function buildWindowProtectedStateForCoverage(){
  if (typeof window === "undefined") return {};
  const state = {};
  const paths = Array.from(new Set((REQUIRED_PROTECTED_DATA_PATHS || []).concat((PROTECTED_FIELD_REGISTRY || []).map(entry => entry.path)))).sort();
  paths.forEach(path => {
    const topLevelKey = String(path || "").split(".").filter(Boolean)[0];
    if (!topLevelKey || Object.prototype.hasOwnProperty.call(state, topLevelKey)) return;
    if (Object.prototype.hasOwnProperty.call(window, topLevelKey)){
      state[topLevelKey] = cloneStructured(window[topLevelKey]);
    }
  });
  return state;
}

function classifyMissingProtectedPathsForSave({ pendingState, baselineState, localBackupState, remoteState, windowState, coverageReport } = {}){
  const report = coverageReport || getSaveSchemaCoverageReport({ pendingSnapshot: pendingState || {} });
  const pending = pendingState && typeof pendingState === "object" ? pendingState : {};
  const sources = [
    { name:"remote", state: remoteState },
    { name:"baseline", state: baselineState },
    { name:"localBackup", state: localBackupState },
    { name:"window", state: windowState }
  ];
  const categories = {
    blockingActiveMissing: [],
    warningAbsentButNoBaselineData: [],
    warningEmptyParentArray: [],
    backupOnlyProtectedData: [],
    possiblyDeprecatedButUnproven: [],
    backupExclusionRisk: []
  };
  const missingPaths = Array.isArray(report?.missingProtectedPaths) ? report.missingProtectedPaths.slice() : [];
  const add = (category, item)=>{
    if (!categories[category]) categories[category] = [];
    categories[category].push(item);
  };

  missingPaths.forEach(path => {
    const registryEntry = (PROTECTED_FIELD_REGISTRY || []).find(entry => entry.path === path) || {};
    const pendingInfo = getSaveSchemaCoveragePathInfo(pending, path);
    const sourceInfo = {};
    let activeSources = [];
    sources.forEach(source => {
      const info = getSaveSchemaCoveragePathInfo(source.state || {}, path);
      sourceInfo[source.name] = info;
      if (info.present && Number(info.count || 0) > 0) activeSources.push(source.name);
    });

    const item = {
      path,
      reason: "",
      pending: pendingInfo,
      baseline: sourceInfo.baseline,
      localBackup: sourceInfo.localBackup,
      remote: sourceInfo.remote,
      window: sourceInfo.window,
      shouldBlock: false,
      category: "",
      suggestedNextAction: "Export diagnostics, reload latest cloud data, and do not force-save until protected-path coverage is reviewed."
    };

    if (registryEntry.expectedShape === "nestedCount" && registryEntry.parentPath){
      const parentPending = getSaveSchemaCoveragePathInfo(pending, registryEntry.parentPath);
      item.parentPath = registryEntry.parentPath;
      item.parentPending = parentPending;
      if (Number(parentPending.count || 0) === 0 && activeSources.length === 0){
        item.category = "warningEmptyParentArray";
        item.reason = `${path} is absent because parent ${registryEntry.parentPath} is empty and no baseline source has nested history data.`;
        add("warningEmptyParentArray", item);
        return;
      }
    }

    if (activeSources.length){
      item.shouldBlock = true;
      item.category = "blockingActiveMissing";
      item.activeSources = activeSources;
      item.reason = `${path} has meaningful protected data in ${activeSources.join(", ")} but is missing from the pending save snapshot.`;
      add("blockingActiveMissing", item);
      if (activeSources.length === 1 && activeSources[0] === "localBackup"){
        add("backupOnlyProtectedData", { ...item, category:"backupOnlyProtectedData", reason:`${path} is only active in local backup and would not be preserved by the pending cloud save.` });
      }
      return;
    }

    if (path === "inventoryTransactions" || path === "cuttingJobDatabase"){
      item.category = "possiblyDeprecatedButUnproven";
      item.reason = `${path} is protected but absent from the pending snapshot and has no meaningful baseline data in available sources; treat as unknown/unproven, not deprecated.`;
      add("possiblyDeprecatedButUnproven", item);
      return;
    }

    item.category = "warningAbsentButNoBaselineData";
    item.reason = `${path} is absent from the pending snapshot, but no available baseline source has meaningful data for it.`;
    add("warningAbsentButNoBaselineData", item);
  });

  (Array.isArray(report?.backupExcludedProtectedPaths) ? report.backupExcludedProtectedPaths : []).forEach(path => {
    add("backupExclusionRisk", {
      path,
      reason: `${path} is protected and excluded from local backup coverage.`,
      pending: getSaveSchemaCoveragePathInfo(pending, path),
      shouldBlock: false,
      category: "backupExclusionRisk",
      suggestedNextAction: "Include this path in local backup or document a proven quota-safe alternative."
    });
  });

  return {
    generatedAtISO: new Date().toISOString(),
    categories,
    blocking: categories.blockingActiveMissing,
    warnings: []
      .concat(categories.warningAbsentButNoBaselineData)
      .concat(categories.warningEmptyParentArray)
      .concat(categories.backupOnlyProtectedData)
      .concat(categories.possiblyDeprecatedButUnproven)
      .concat(categories.backupExclusionRisk),
    blocked: categories.blockingActiveMissing.length > 0
  };
}

function compareProtectedFieldSummaries(remoteSummary, pendingSummary){
  const issues = [];
  const remote = remoteSummary || {};
  const pending = pendingSummary || {};
  const remoteFields = remote.protectedFields || {};
  const pendingFields = pending.protectedFields || {};
  PROTECTED_STATE_FIELDS.forEach(field => {
    const r = remoteFields[field] || {};
    const p = pendingFields[field] || {};
    if (r.present && !p.present){
      issues.push({ field, type: "missing_protected_field", remote: r, pending: p });
      return;
    }
    if (r.type === "array"){
      const rLen = Number(r.length || 0);
      const pLen = Number(p.length || 0);
      if (rLen > 0 && pLen === 0){
        issues.push({ field, type: "array_would_be_emptied", remoteLength: rLen, pendingLength: pLen });
      } else if (rLen >= 10 && pLen < Math.max(1, Math.floor(rLen * 0.5))){
        issues.push({ field, type: "large_array_reduction", remoteLength: rLen, pendingLength: pLen });
      } else if ((field === "completedCuttingJobs" || field === "receiptTrackerWeeks" || field === "maintenanceOccurrencesV2") && rLen > pLen){
        issues.push({ field, type: "sensitive_array_reduction", remoteLength: rLen, pendingLength: pLen });
      }
    }
  });
  const nestedKeys = ["completedDates", "manualHistory", "removedOccurrences", "occurrenceNotes", "occurrenceHours"];
  nestedKeys.forEach(key => {
    const r = Number(remote.nestedHistoryCounts?.[key] || 0);
    const p = Number(pending.nestedHistoryCounts?.[key] || 0);
    if (r > 0 && p === 0){
      issues.push({ field: key, type: "nested_history_would_be_emptied", remoteCount: r, pendingCount: p });
    } else if (r >= 10 && p < Math.max(1, Math.floor(r * 0.5))){
      issues.push({ field: key, type: "large_nested_history_reduction", remoteCount: r, pendingCount: p });
    }
  });
  const remoteManualLogs = Number(remote.cuttingJobCounts?.manualLogs || 0);
  const pendingManualLogs = Number(pending.cuttingJobCounts?.manualLogs || 0);
  if (remoteManualLogs > 0 && pendingManualLogs === 0){
    issues.push({ field: "manualLogs", type: "job_manual_logs_would_be_emptied", remoteCount: remoteManualLogs, pendingCount: pendingManualLogs });
  } else if (remoteManualLogs >= 10 && pendingManualLogs < Math.max(1, Math.floor(remoteManualLogs * 0.5))){
    issues.push({ field: "manualLogs", type: "large_job_manual_logs_reduction", remoteCount: remoteManualLogs, pendingCount: pendingManualLogs });
  }
  return issues;
}

function detectDangerousProtectedFieldReduction(remoteState, pendingState){
  const remoteSummary = buildProtectedFieldSummary(remoteState || {});
  const pendingSummary = buildProtectedFieldSummary(pendingState || {});
  const legacyIssues = compareProtectedFieldSummaries(remoteSummary, pendingSummary);
  const registryReduction = detectDangerousIntegrityReduction(remoteSummary.integrity, pendingSummary.integrity, { allowUnknownBaseline: true });
  const issues = legacyIssues.concat(registryReduction.reasons || []);
  return {
    blocked: legacyIssues.length > 0 || registryReduction.blocked,
    issues,
    legacyIssues,
    registryReduction,
    remoteSummary,
    pendingSummary
  };
}

function detectRemoteRevisionConflict(remoteState){
  const remoteRev = Number(remoteState?.syncMeta?.rev || 0);
  const loadedRev = Number((typeof window !== "undefined" ? window.__loadedCloudRevisionForSaveGuard : 0) || 0);
  const remoteUpdatedBy = String(remoteState?.syncMeta?.updatedBy || "");
  const clientId = typeof getCloudSyncClientId === "function" ? getCloudSyncClientId() : "";
  const sameClientRemoteRevision = !!(remoteUpdatedBy && clientId && remoteUpdatedBy === clientId);
  if (remoteRev > 0 && loadedRev > 0 && remoteRev > loadedRev){
    return {
      blocked: !sameClientRemoteRevision,
      remoteRev,
      loadedRev,
      remoteUpdatedAtISO: remoteState?.syncMeta?.updatedAtISO || "",
      remoteUpdatedBy,
      clientId,
      sameClientRemoteRevision
    };
  }
  return { blocked: false, remoteRev, loadedRev, remoteUpdatedBy, clientId, sameClientRemoteRevision };
}

function exportJsonDownload(filename, data){
  if (typeof document === "undefined") return false;
  const safeName = String(filename || "omax-export.json").replace(/[^a-z0-9._-]+/gi, "_");
  const blob = new Blob([JSON.stringify(data ?? null, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  return true;
}

function loadLocalBackupReadOnly(){
  return readLocalStateBackup();
}

function getCurrentAppStateForDiagnostics(){
  if (isRecoveryMode()) return window.__lastLoadedCloudState || {};
  try { return snapshotState(); }
  catch (_err){ return window.__lastLoadedCloudState || {}; }
}

async function readCurrentCloudStateReadOnly(){
  if (!FB.ready || !FB.docRef) return null;
  const snap = await FB.docRef.get();
  return snap && snap.exists ? (typeof snap.data === "function" ? snap.data() : snap.data) : null;
}

async function buildDiagnosticSummary(){
  const cloudState = await readCurrentCloudStateReadOnly().catch(err => ({ __readError: String(err?.message || err) }));
  const localBackup = loadLocalBackupReadOnly();
  const appState = getCurrentAppStateForDiagnostics();
  const cloudIntegrity = buildDataIntegritySummary(cloudState || {});
  const localBackupIntegrity = buildDataIntegritySummary(localBackup || {});
  const currentIntegrity = buildDataIntegritySummary(appState || {});
  return {
    generatedAtISO: new Date().toISOString(),
    recoveryMode: isRecoveryMode(),
    firestorePath: FB?.docRef?.path || `workspaces/${WORKSPACE_ID}/app/state`,
    workspaceId: WORKSPACE_ID,
    clientId: (typeof window !== "undefined" && window.localStorage) ? String(window.localStorage.getItem(CLOUD_SYNC_CLIENT_KEY) || "") : "unknown_client",
    cloudLoadAttemptComplete: Boolean(window.__cloudLoadAttemptComplete),
    initialAdoptComplete: Boolean(window.__initialAdoptComplete),
    loadedCloudRevisionForSaveGuard: Number(window.__loadedCloudRevisionForSaveGuard || 0),
    lastDangerousSaveBlock: (typeof window !== "undefined" && window.__lastDangerousSaveBlock) ? window.__lastDangerousSaveBlock : null,
    registryCoverage: getProtectedFieldRegistryCoverage(),
    integrity: {
      cloud: cloudIntegrity,
      localBackup: localBackupIntegrity,
      currentAppState: currentIntegrity
    },
    cloud: buildProtectedFieldSummary(cloudState || {}),
    localBackup: buildProtectedFieldSummary(localBackup || {}),
    currentAppState: buildProtectedFieldSummary(appState || {})
  };
}

function showLocalBackupConflictWarning({ cloudRev = 0, backupRev = 0, backupOnly = false } = {}){
  const msg = backupOnly
    ? "Local backup loaded read-only because no meaningful cloud state was found. Export and review before restoring."
    : `Newer local backup detected (backup rev ${backupRev}, cloud rev ${cloudRev}). Cloud state was kept; export both before any restore.`;
  console.warn(msg);
  try { if (typeof toast === "function") toast(msg); } catch (_err){}
  if (typeof window !== "undefined") window.__lastLocalBackupConflict = { cloudRev, backupRev, backupOnly, message: msg, atISO: new Date().toISOString() };
  renderRecoveryDiagnosticsPanel();
}

function ensureRecoveryBanner(){
  if (typeof document === "undefined" || !isRecoveryMode()) return;
  if (document.getElementById("recoveryModeBanner")) return;
  const banner = document.createElement("div");
  banner.id = "recoveryModeBanner";
  banner.textContent = "Recovery Mode: read-only, cloud saves disabled.";
  banner.style.cssText = "position:sticky;top:0;z-index:10000;background:#7f1d1d;color:#fff;padding:10px 14px;font-weight:700;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.18);";
  document.body.prepend(banner);
}

function renderRecoveryDiagnosticsPanel(){
  if (typeof document === "undefined" || !isRecoveryMode()) return;
  ensureRecoveryBanner();
  let panel = document.getElementById("recoveryDiagnosticsPanel");
  if (!panel){
    panel = document.createElement("section");
    panel.id = "recoveryDiagnosticsPanel";
    panel.style.cssText = "margin:12px;padding:12px;border:2px solid #7f1d1d;border-radius:10px;background:#fff7f7;color:#111;font:14px system-ui,sans-serif;";
    panel.innerHTML = `
      <h2 style="margin:0 0 8px;font-size:18px;">Recovery diagnostics</h2>
      <p style="margin:0 0 10px;">Read-only tools. Exports download JSON locally and do not upload or restore data.</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
        <button type="button" data-recovery-export="cloud">Export current cloud state JSON</button>
        <button type="button" data-recovery-export="local">Export localStorage backup JSON</button>
        <button type="button" data-recovery-export="summary">Export field-count diagnostic summary JSON</button>
        <button type="button" data-recovery-copy="summary">Copy diagnostic summary</button>
      </div>
      <div data-recovery-integrity-summary style="margin:8px 0;padding:8px;border:1px solid #f0caca;border-radius:8px;background:#fff;"></div>
      <pre data-recovery-output style="white-space:pre-wrap;max-height:260px;overflow:auto;background:#fff;border:1px solid #f0caca;border-radius:8px;padding:8px;"></pre>`;
    const mount = document.getElementById("app") || document.querySelector("main") || document.body;
    if (mount === document.body) document.body.insertBefore(panel, document.body.children[1] || null);
    else mount.prepend(panel);
  }
  const output = panel.querySelector("[data-recovery-output]");
  const integritySummaryEl = panel.querySelector("[data-recovery-integrity-summary]");
  const renderIntegritySummary = (data)=>{
    if (!integritySummaryEl || !data || typeof data !== "object") return;
    const escapeDiagnosticHtml = (str)=>String(str ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
    const current = data.integrity?.currentAppState;
    const local = data.integrity?.localBackup;
    const cloud = data.integrity?.cloud;
    if (!current) return;
    const currentWarnings = Array.isArray(current.warnings) ? current.warnings.length : 0;
    const localBytes = Number(local?.totalBytes || 0);
    const cloudRev = Number(cloud?.syncMeta?.rev || 0);
    const lastBlock = data.lastDangerousSaveBlock || null;
    const blockedFields = Array.isArray(lastBlock?.blockedFieldNames) ? lastBlock.blockedFieldNames : [];
    const blockHtml = lastBlock ? `
      <div style="margin:8px 0 0;padding:8px;border:1px solid #b91c1c;border-radius:8px;background:#fff1f2;">
        <strong>Last dangerous-save block:</strong> ${escapeDiagnosticHtml(lastBlock.atISO || "")}<br>
        <span>Fields: ${escapeDiagnosticHtml(blockedFields.join(", ") || "none listed")}</span><br>
        <span>Baseline → pending protected count: ${Number(lastBlock.preflight?.baselineTotalProtectedCount || 0)} → ${Number(lastBlock.preflight?.pendingTotalProtectedCount || 0)}</span><br>
        <span>Recommended next action: export diagnostics and stay in Recovery Mode until counts are reviewed.</span>
      </div>` : "";
    const categoryRows = Object.entries(current.totalsByCategory || {})
      .map(([name, totals])=>`<tr><td>${escapeDiagnosticHtml(name)}</td><td>${Number(totals.count || 0)}</td><td>${Number(totals.fields || 0)}</td><td>${Number(totals.warnings || 0)}</td></tr>`)
      .join("");
    integritySummaryEl.innerHTML = `
      <h3 style="margin:0 0 6px;font-size:15px;">Protected data integrity summary (read-only)</h3>
      <p style="margin:0 0 6px;">Current state bytes: ${Number(current.totalBytes || 0)} · Local backup bytes: ${localBytes} · Cloud rev: ${cloudRev} · Warnings: ${currentWarnings} · Fingerprint: ${escapeDiagnosticHtml(current.summaryFingerprint || "")}</p>
      <table style="border-collapse:collapse;width:100%;font-size:12px;"><thead><tr><th style="text-align:left;border-bottom:1px solid #f0caca;">Category</th><th style="text-align:left;border-bottom:1px solid #f0caca;">Records</th><th style="text-align:left;border-bottom:1px solid #f0caca;">Fields</th><th style="text-align:left;border-bottom:1px solid #f0caca;">Warnings</th></tr></thead><tbody>${categoryRows}</tbody></table>
      ${blockHtml}`;
  };
  const writeOutput = (data)=>{
    renderIntegritySummary(data);
    if (output) output.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  };
  if (!panel.__recoveryWired){
    panel.addEventListener("click", async (event)=>{
      const exportBtn = event.target.closest("[data-recovery-export]");
      const copyBtn = event.target.closest("[data-recovery-copy]");
      if (!exportBtn && !copyBtn) return;
      event.preventDefault();
      try {
        if (exportBtn){
          const type = exportBtn.getAttribute("data-recovery-export");
          if (type === "cloud"){
            const cloudState = await readCurrentCloudStateReadOnly();
            if (!cloudState){ writeOutput("Cloud state unavailable or empty."); return; }
            exportJsonDownload(`omax-cloud-state-${Date.now()}.json`, cloudState);
            writeOutput({ exported: "cloud", path: FB?.docRef?.path || "", bytes: estimatePayloadBytes(cloudState) });
          } else if (type === "local"){
            const local = loadLocalBackupReadOnly();
            if (!local){ writeOutput("No localStorage backup found at omax_local_state_backup_v1."); return; }
            exportJsonDownload(`omax-local-backup-${Date.now()}.json`, local);
            writeOutput({ exported: "localBackup", key: LOCAL_STATE_BACKUP_KEY, bytes: estimatePayloadBytes(local) });
          } else if (type === "summary"){
            const summary = await buildDiagnosticSummary();
            exportJsonDownload(`omax-diagnostic-summary-${Date.now()}.json`, summary);
            writeOutput(summary);
          }
        } else if (copyBtn){
          const summary = await buildDiagnosticSummary();
          const text = JSON.stringify(summary, null, 2);
          if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") await navigator.clipboard.writeText(text);
          writeOutput(navigator.clipboard ? "Diagnostic summary copied to clipboard." : text);
        }
      } catch (err){
        console.warn("Recovery diagnostic action failed", err);
        writeOutput(`Diagnostic action failed: ${err?.message || err}`);
      }
    });
    panel.__recoveryWired = true;
  }
  buildDiagnosticSummary().then(writeOutput).catch(err => writeOutput(`Diagnostic summary unavailable: ${err?.message || err}`));
}

function safeCleanupLoadedState(raw){
  const src = raw && typeof raw === "object" ? { ...raw } : {};
  delete src.syncProcessLog; delete src.__lastSnapshot; delete src.__lastSnapshotForFlow; delete src.__lastDataFlowFingerprint;
  src.cuttingJobs = sanitizeValueForStorage(src.cuttingJobs);
  src.completedCuttingJobs = sanitizeValueForStorage(src.completedCuttingJobs);
  return src;
}

function persistLocalStateBackup(snapshot){
  if (typeof window === "undefined" || !window.localStorage || !snapshot) return;
  const trimmed = compactStateForStorage(snapshot, { forBackup:true });
  try {
    window.localStorage.setItem(LOCAL_STATE_BACKUP_KEY, JSON.stringify(trimmed));
    console.info("Local backup saved", { bytes: estimatePayloadBytes(trimmed) });
  } catch (err){
    console.warn("Local backup primary write failed", err, { bytes: estimatePayloadBytes(trimmed) });
    try {
      window.localStorage.removeItem(LOCAL_STATE_BACKUP_KEY);
      const emergency = buildEmergencyBackup(trimmed);
      window.localStorage.setItem(LOCAL_STATE_BACKUP_KEY, JSON.stringify(emergency));
      console.warn("Local backup saved in emergency mode", { bytes: estimatePayloadBytes(emergency) });
    } catch (retryErr){
      console.error("Failed to persist local backup even in emergency mode", retryErr);
      try {
        window.localStorage.removeItem(LOCAL_STATE_BACKUP_KEY);
        ["omax_debug_cache","omax_sync_cache","omax_render_cache","omax_local_state_backup_v0"].forEach((k)=>window.localStorage.removeItem(k));
        const tiny = buildTinyCriticalBackup(trimmed);
        window.localStorage.setItem(LOCAL_STATE_BACKUP_KEY, JSON.stringify(tiny));
        console.warn("Local backup saved in tiny mode", { bytes: estimatePayloadBytes(tiny) });
      } catch (tinyErr){
        console.error("Failed to persist tiny local backup", tinyErr);
      }
    }
  }
}

function readLocalStateBackup(){
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STATE_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (err){
    console.warn("Failed to read local state backup", err);
    return null;
  }
}
function getCloudSyncClientId(){
  if (typeof window === "undefined" || !window.localStorage) return "unknown_client";
  let id = String(window.localStorage.getItem(CLOUD_SYNC_CLIENT_KEY) || "").trim();
  if (id) return id;
  if (isRecoveryMode()) return "unknown_client";
  id = `client_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  try { window.localStorage.setItem(CLOUD_SYNC_CLIENT_KEY, id); } catch (_err){ }
  return id;
}

function applyFirestoreSettings(db){
  if (!db || firebaseSettingsApplied) return;

  const isDevEnv = typeof process !== "undefined" && process?.env?.NODE_ENV === "development";
  const emulatorHost = "localhost:8080";

  // Respect existing settings (including emulator hosts) so we avoid override warnings.
  const currentSettings = typeof db._getSettings === "function"
    ? { ...db._getSettings() }
    : (typeof db._settings === "object" && db._settings ? { ...db._settings } : {});
  const settingsFrozen = Boolean(db._settingsFrozen);
  const hasHostSetting = typeof currentSettings.host === "string" && currentSettings.host.length > 0;
  const ignoreAlreadyEnabled = currentSettings.ignoreUndefinedProperties === true;

  if (settingsFrozen){
    console.warn("Firestore settings already frozen; skipping extra configuration to avoid host overrides.");
    firebaseSettingsApplied = true;
    return;
  }

  // Avoid touching host/SSL in non-development environments when a host is
  // already configured; calling `settings` again in that scenario triggers the
  // override warning we are trying to prevent.
  if (!isDevEnv && hasHostSetting && ignoreAlreadyEnabled){
    console.info("Existing Firestore host settings detected; skipping reconfiguration to prevent overrides.");
    firebaseSettingsApplied = true;
    return;
  }

  if (!isDevEnv){
    if (ignoreAlreadyEnabled){
      firebaseSettingsApplied = true;
      return;
    }
    try {
      db.settings({ ...currentSettings, ignoreUndefinedProperties: true });
      firebaseSettingsApplied = true;
    } catch (err) {
      console.warn("Failed to enable ignoreUndefinedProperties", err);
    }
    return;
  }

    const mergedSettings = { ...currentSettings };
    mergedSettings.ignoreUndefinedProperties = true;

    if (!hasHostSetting){
      mergedSettings.host = emulatorHost;
      mergedSettings.ssl = false;
      console.info("Firestore is connected to the Local Emulator.");
    } else {
      console.info("Firestore emulator already configured; leaving settings untouched to prevent override warnings.");
    }

    try {
      db.settings(mergedSettings);
      firebaseSettingsApplied = true;
    } catch (err) {
      console.warn("Failed to enable ignoreUndefinedProperties", err);
    }
}

async function initFirebase(){
  if (!window.firebase || !firebase.initializeApp){ console.warn("Firebase SDK not loaded."); return; }
  if (!window.FIREBASE_CONFIG){ console.warn("Missing FIREBASE_CONFIG."); return; }
  if (FB.ready) return;
  if (firebaseInitStarted) return;
  firebaseInitStarted = true;

  // Initialize or reuse existing app to avoid duplicate-app errors
  const existingApp = firebase.apps && firebase.apps.length ? firebase.apps[0] : null;
  FB.app  = existingApp || firebase.initializeApp(window.FIREBASE_CONFIG);
  FB.auth = firebase.auth();
  FB.db   = firebase.firestore();
  applyFirestoreSettings(FB.db);

  // Persist login across refreshes
  try {
    await FB.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  } catch (e) {
    console.warn("Could not set auth persistence to LOCAL:", e);
  }

  // UI bits
  const statusEl = $("#authStatus");
  const btnIn    = $("#btnSignIn");
  const btnOut   = $("#btnSignOut");
  const modal    = $("#authModal");
  const form     = $("#authForm");
  const emailEl  = $("#authEmail");
  const passEl   = $("#authPass");
  const btnClose = $("#authClose");

  const showModal = ()=>{ if (modal) modal.style.display = "flex"; };
  const hideModal = ()=>{ if (modal) modal.style.display = "none"; };

  async function ensureEmailPassword(email, password){
    if (!email || !password) throw new Error("Email and password required.");
    try{
      const cred = await FB.auth.signInWithEmailAndPassword(email,password);
      return cred.user;
    }catch(e){
      if (e && e.code === "auth/user-not-found"){
        await FB.auth.createUserWithEmailAndPassword(email,password);
        const cred = await FB.auth.signInWithEmailAndPassword(email,password);
        return cred.user;
      }
      throw e;
    }
  }

  if (btnIn)  btnIn.onclick  = showModal;
  if (btnOut) btnOut.onclick = async ()=>{ await FB.auth.signOut(); };
  if (btnClose) btnClose.onclick = hideModal;

  if (form){
    form.onsubmit = async (e)=>{
      e.preventDefault();
      try{
        await ensureEmailPassword((emailEl.value||"").trim(), (passEl.value||"").trim());
        hideModal();
      }catch(err){ console.error(err); alert(err.message || "Sign-in failed"); }
    };
  }

  const loginShortcutCredentials = {
    email: "ryder@candmprecast.com",
    password: "Matthew7:21",
  };

  let loginShortcutSigningIn = false;

  const handleLoginShortcut = async (event)=>{
    if (!(event && (event.ctrlKey || event.metaKey))) return;
    const key = (event.key || "").toLowerCase();
    if (key !== "s") return;
    if (FB.user) return;
    event.preventDefault();

    if (loginShortcutSigningIn) return;
    loginShortcutSigningIn = true;

    try {
      const { email, password } = loginShortcutCredentials;
      if (emailEl) {
        emailEl.value = email;
        emailEl.focus();
        emailEl.select();
      }
      if (passEl) {
        passEl.value = password;
      }

      showModal();
      await ensureEmailPassword(email, password);
      hideModal();
    } catch (err) {
      console.error("Login shortcut failed", err);
      toast(err?.message || "Login shortcut failed");
    } finally {
      loginShortcutSigningIn = false;
    }
  };

  window.addEventListener("keydown", handleLoginShortcut);

  FB.auth.onAuthStateChanged(async (user)=>{
    FB.user = user || null;
    workspaceMetadataWritesBlocked = false;
    if (typeof workspaceStateUnsubscribe === "function"){
      try { workspaceStateUnsubscribe(); } catch (err) { console.warn("Failed to stop workspace sync listener", err); }
      workspaceStateUnsubscribe = null;
    }
    lastAppliedCloudRevision = 0;
    if (user){
      if (statusEl) statusEl.textContent = `Signed in as: ${user.email || user.uid}`;
      if (btnIn)  btnIn.style.display  = "none";
      if (btnOut) btnOut.style.display = "inline-block";

      // Store workspace state in workspaces/<id>/app/state
      FB.workspaceDoc = FB.db.collection("workspaces").doc(WORKSPACE_ID);
      FB.workspaceRef = FB.workspaceDoc.collection("app").doc("state");
      FB.docRef = FB.workspaceRef;
      if (typeof window !== "undefined") {
        window.workspaceDocRef = FB.workspaceDoc;
        window.workspaceRef = FB.workspaceRef;
      }
      FB.ready = true;
      try { setupDebugPanel(); } catch (e) {}
      await loadFromCloud();
      startWorkspaceStateListener();
      route();
    }else{
      FB.ready = false;
      FB.workspaceRef = null;
      FB.workspaceDoc = null;
      FB.docRef = null;
      if (typeof window !== "undefined") {
        window.workspaceRef = null;
        window.workspaceDocRef = null;
      }
      if (statusEl) statusEl.textContent = "Not signed in";
      if (btnIn)  btnIn.style.display  = "inline-block";
      if (btnOut) btnOut.style.display = "none";
      renderSignedOut();
    }
  });
}

function startWorkspaceStateListener(){
  if (!FB.ready || !FB.docRef || typeof FB.docRef.onSnapshot !== "function") return;
  if (typeof workspaceStateUnsubscribe === "function") return;
  const localClientId = getCloudSyncClientId();
  let deferredRouteTimer = null;
  const clearDeferredRouteTimer = ()=>{
    if (deferredRouteTimer != null){
      clearTimeout(deferredRouteTimer);
      deferredRouteTimer = null;
    }
  };
  const hasActiveBlockingOverlay = ()=>{
    if (typeof document === "undefined") return false;
    const activeEl = document.activeElement;
    if (isEditableTarget(activeEl)) return true;
    const body = document.body;
    if (body?.classList?.contains("modal-open")) return true;
    if (body?.classList?.contains("forecast-modal-open")) return true;
    if (body?.classList?.contains("cost-timeframe-modal-open")) return true;
    if (document.querySelector(".modal-backdrop.is-visible:not([hidden])")) return true;
    if (document.querySelector(".job-note-modal-backdrop:not([hidden])")) return true;
    if (document.querySelector(".job-naming-modal-backdrop:not([hidden])")) return true;
    if (document.querySelector(".job-flow-modal-backdrop:not([hidden])")) return true;
    if (document.querySelector('[data-job-actions-menu]:not([hidden])')) return true;
    if (document.querySelector('[data-history-actions-menu]:not([hidden])')) return true;
    if (document.querySelector('[data-job-file-menu]:not([hidden])')) return true;
    if (document.querySelector(".forecast-modal:not([hidden])")) return true;
    if (document.querySelector(".cost-timeframe-modal:not([hidden])")) return true;
    if (document.querySelector(".config-modal:not([hidden])")) return true;
    if (document.querySelector(".auth-modal-backdrop[style*='display: flex']")) return true;
    return false;
  };
  const refreshRouteSafely = ()=>{
    if (typeof route !== "function") return;
    if (hasActiveBlockingOverlay()){
      clearDeferredRouteTimer();
      deferredRouteTimer = setTimeout(()=>{ refreshRouteSafely(); }, 1200);
      return;
    }
    clearDeferredRouteTimer();
    const expectedHash = typeof location !== "undefined" ? String(location.hash || "#/") : "#/";
    const scrollY = (typeof window !== "undefined" && Number.isFinite(Number(window.scrollY))) ? Number(window.scrollY) : 0;
    try {
      route({ preserveScroll: true, expectedHash, scrollY });
    } catch (err) {
      console.warn("Route refresh after workspace sync failed", err);
    }
  };
  workspaceStateUnsubscribe = FB.docRef.onSnapshot((snap)=>{
    if (!snap || !snap.exists) return;
    if (snap.metadata && snap.metadata.hasPendingWrites) return;
    const incoming = typeof snap.data === "function" ? snap.data() : snap.data;
    if (!stateHasMeaningfulData(incoming)) return;
    const meta = incoming && typeof incoming.syncMeta === "object" ? incoming.syncMeta : null;
    const incomingRev = Number(meta?.rev || 0);
    if (!incomingRev) return;
    const incomingBy = String(meta?.updatedBy || "");
    if (incomingBy === localClientId && incomingRev > Number(window.__loadedCloudRevisionForSaveGuard || 0)){
      window.__loadedCloudRevisionForSaveGuard = incomingRev;
      window.__lastLoadedCloudState = cloneStructured(incoming || {});
    }
    if (hasPendingLocalChanges) return;
    const localEditAgeMs = Date.now() - (Number(lastLocalMutationAt) || 0);
    if (incomingBy !== localClientId && localEditAgeMs >= 0 && localEditAgeMs < 15000) return;
    if (incomingRev && incomingRev <= lastAppliedCloudRevision) return;
    if (incomingRev && incomingBy === localClientId && incomingRev === lastAppliedCloudRevision) return;
    adoptState(incoming || {});
    if (typeof resetHistoryToCurrent === "function") resetHistoryToCurrent();
    if (incomingRev > 0) lastAppliedCloudRevision = incomingRev;
    refreshRouteSafely();
  }, (err)=>{
    console.warn("Workspace realtime sync listener error", err);
  });
}


/* ===================== DATA / STATE ======================== */
const defaultIntervalTasks = [
  { id:"noz_filter_or", name:"Nozzle filter & inlet O-ring", interval:40,  sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"", pn:"307525", price:283, completedDates: [] },
  { id:"pump_tube_noz_filter", name:"Pump tube & nozzle filter life", interval:80, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"", pn:"307561-02", price:170, completedDates: [] },
  { id:"orifice_assembly", name:"Orifice assembly (jewel)", interval:500, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"", pn:"305322-14", price:700, completedDates: [] },
  { id:"nozzle_body_life", name:"Nozzle body life", interval:500, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"", pn:"303295", price:349, completedDates: [] },
  { id:"drain_hopper_reg_bowl", name:"Drain hopper regulator water bowl", interval:240, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"", completedDates: [] },
  { id:"check_pinch_reg_conn",  name:"Check hopper pinch valve & air regulator connection", interval:240, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"", completedDates: [] },
  { id:"inspect_relief_90psi",  name:"Inspect pressure relief valve (≤90 psi)", interval:240, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"", completedDates: [] },
  { id:"buy_garnet_pallets_x4", name:"Buy Garnet Pallets x4", interval:160, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"", completedDates: [] },
  { id:"ro_softener_daily_chk", name:"RO / Softener feed pressure & water quality — daily", interval:8, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"", completedDates: [] },
  { id:"mixing_tube_rotation",  name:"Mixing tube rotation", interval:8, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"", completedDates: [] },
  { id:"jewel_nozzle_clean",    name:"Jewell orifice & nozzle body cleaning (weekly)", interval:56, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"", completedDates: [] },
  { id:"check_bonding_strap",   name:"Check hopper bonding strap (annually)", interval:2920, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"", completedDates: [] },
  { id:"lube_z_axis",           name:"Lubricate Z-axis rail shafts & lead screw (annually)", interval:2920, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"", completedDates: [] },
  { id:"filter_housing_or_2y",  name:"Filter housing O-ring (2 years / if leaking)", interval:5840, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"", pn:"208665", price:4.85, completedDates: [] }
];
const defaultAsReqTasks = [
  { id:"purge_hopper_pressure_pot", name:"Purge hopper pressure pot", condition:"As required", manualLink:"", storeLink:"" },
  { id:"replace_pot_sensors",       name:"Replace pressure pot sensors", condition:"When failed", manualLink:"", storeLink:"" },
  { id:"empty_hopper_abrasive",     name:"Empty hopper abrasive material", condition:"If debris/contamination", manualLink:"", storeLink:"" },

  { id:"replace_pinch_valve", name:"Replace hopper pinch valve", condition:"When damaged", manualLink:"", storeLink:"", pn:"204160", price:292 },
  { id:"replace_feed_hose",   name:"Replace abrasive feed hose", condition:"When damaged", manualLink:"", storeLink:"", pn:"302240", price:121 },
  { id:"ro_filter_housing",   name:"RO Filter Housing",          condition:"As needed",   manualLink:"", storeLink:"", pn:"208663", price:137 },
  { id:"ro_micron_filter",    name:"RO Micron filter",           condition:"Per water quality/pressure", manualLink:"", storeLink:"", pn:"209260-01", price:35.5 },
  { id:"ro_carbon_filter",    name:"RO Carbon filter",           condition:"Per chlorine breakthrough",  manualLink:"", storeLink:"", pn:"204365", price:25 },
  { id:"ro_calcite_filter",   name:"RO Calcite filter",          condition:"Per water quality / pH",     manualLink:"", storeLink:"", pn:"204876", price:72 },

  { id:"inspect_abrasive_tube", name:"Abrasive tubing inspection", condition:"Before each use", manualLink:"", storeLink:"" },
  { id:"clean_xy_strips",       name:"Clean X– & Y–axis magnetic encoder strips", condition:"If errors occur", manualLink:"", storeLink:"" },
  { id:"clean_lube_ballscrews", name:"Clean & lubricate ball screws", condition:"If debris occurs", manualLink:"", storeLink:"" },
  { id:"clean_rails",           name:"Clean X-rails & Y-bridge rails", condition:"If debris occurs", manualLink:"", storeLink:"" }
];

function resolveTaskVariant(task){
  if (!task || typeof task !== "object") return null;
  const raw = typeof task.variant === "string" ? task.variant.toLowerCase() : "";
  if (raw === "template" || raw === "instance") return raw;
  if (task.templateId != null && String(task.templateId) !== String(task.id)) return "instance";
  return null;
}

function isTemplateTask(task){
  const variant = resolveTaskVariant(task);
  if (variant) return variant === "template";
  return !!(task && (task.mode === "interval" || task.mode === "asreq"));
}

function isInstanceTask(task){
  return resolveTaskVariant(task) === "instance";
}

function ensureTaskVariant(task, type){
  if (!task || typeof task !== "object") return;
  const variant = resolveTaskVariant(task);
  if (variant === "template" || variant === "instance") return;
  if (type === "interval" || type === "asreq"){
    task.variant = "template";
  }
}

function pruneCurrentAndFutureIntervalOccurrences(templateId){
  const tid = templateId != null ? String(templateId) : null;
  if (!tid || !Array.isArray(window.tasksInterval)) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const todayKey = ymd(today);

  const normalizeKey = (value)=>{
    if (!value) return null;
    if (value instanceof Date) return ymd(value);
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = parseDateLocal(value);
    return parsed ? ymd(parsed) : null;
  };

  const isCurrentOrFuture = (value)=>{
    const key = normalizeKey(value);
    if (!key || !todayKey) return false;
    return key >= todayKey;
  };

  const trimOccurrenceMaps = (task)=>{
    if (!task || typeof task !== "object") return;
    if (task.calendarDateISO && isCurrentOrFuture(task.calendarDateISO)){
      task.calendarDateISO = null;
    }
    if (Array.isArray(task.manualHistory)){
      task.manualHistory = task.manualHistory.filter(entry => !isCurrentOrFuture(entry?.dateISO));
    }
    if (Array.isArray(task.completedDates)){
      task.completedDates = task.completedDates.filter(dateISO => !isCurrentOrFuture(dateISO));
    }
    if (task.occurrenceNotes && typeof task.occurrenceNotes === "object"){
      Object.keys(task.occurrenceNotes).forEach(key => {
        if (isCurrentOrFuture(key)) delete task.occurrenceNotes[key];
      });
    }
    if (task.occurrenceHours && typeof task.occurrenceHours === "object"){
      Object.keys(task.occurrenceHours).forEach(key => {
        if (isCurrentOrFuture(key)) delete task.occurrenceHours[key];
      });
    }
  };

  window.tasksInterval = window.tasksInterval.filter(task => {
    if (!task) return true;
    const belongsToTemplate = String(task.id) === tid || (isInstanceTask(task) && String(task.templateId) === tid);
    if (!belongsToTemplate) return true;
    trimOccurrenceMaps(task);
    if (isInstanceTask(task)){
      return !(isCurrentOrFuture(task.calendarDateISO)
        || (Array.isArray(task.manualHistory) && task.manualHistory.some(entry => isCurrentOrFuture(entry?.dateISO))));
    }
    return true;
  });
}

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
if (!Array.isArray(window.deletedItems)) window.deletedItems = [];

function cloneStructured(value){
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    console.warn("Failed to clone value for trash entry", err);
    return value;
  }
}

function computeTrashExpiresAt(deletedISO){
  const deleted = deletedISO ? new Date(deletedISO) : null;
  const base = deleted ? deleted.getTime() : NaN;
  if (!Number.isFinite(base)) return null;
  return new Date(base + TRASH_RETENTION_MS).toISOString();
}

function buildTrashLabel(type, payload, meta){
  const safePayload = payload || {};
  const name = safePayload.name || safePayload.title || safePayload.label;
  switch (type) {
    case "task":
      return `Maintenance task: ${name || "(unnamed task)"}`;
    case "inventory":
      return `Inventory item: ${name || "(unnamed item)"}`;
    case "job":
      return `Active job: ${name || "(unnamed job)"}`;
    case "completed-job":
      return `Completed job: ${name || "(unnamed job)"}`;
    case "folder":
      return `Category: ${name || "(unnamed category)"}`;
    case "garnet":
      return `Garnet cleaning on ${safePayload.dateISO || "(unknown date)"}`;
    case "order-item":
      return `Order item: ${name || "(unnamed item)"}`;
    case "total-history":
      return `Machine hours entry (${safePayload.dateISO || "unknown date"})`;
    case "workspace":
      return "Workspace snapshot";
    default:
      if (meta && typeof meta.label === "string" && meta.label.trim()){
        return meta.label.trim();
      }
      return type ? `Deleted ${type}` : "Deleted item";
  }
}

function normalizeDeletedItem(raw){
  if (!raw || typeof raw !== "object") return null;
  const type = typeof raw.type === "string" && raw.type ? raw.type : "unknown";
  const deletedISO = raw.deletedAt || raw.deletedISO || raw.deleted_at || raw.timestamp || null;
  const deletedDate = deletedISO ? new Date(deletedISO) : new Date();
  const deletedMs = deletedDate.getTime();
  if (!Number.isFinite(deletedMs)) return null;
  if ((Date.now() - deletedMs) > TRASH_RETENTION_MS) return null;
  const payload = cloneStructured(raw.payload);
  const meta = raw.meta && typeof raw.meta === "object" ? { ...raw.meta } : {};
  const label = typeof raw.label === "string" && raw.label ? raw.label : buildTrashLabel(type, payload, meta);
  const id = raw.id ? String(raw.id) : genId(`trash_${type}`);
  return {
    id,
    type,
    payload,
    meta,
    label,
    deletedAt: new Date(deletedMs).toISOString()
  };
}

function normalizeDeletedItems(list){
  const normalized = [];
  if (Array.isArray(list)){
    for (const raw of list){
      const entry = normalizeDeletedItem(raw);
      if (entry) normalized.push(entry);
    }
  }
  normalized.sort((a, b)=>{
    const aTime = new Date(a.deletedAt || 0).getTime();
    const bTime = new Date(b.deletedAt || 0).getTime();
    return bTime - aTime;
  });
  return normalized;
}

let deletedItems = normalizeDeletedItems(window.deletedItems);
window.deletedItems = deletedItems;

function findTaskByIdLocal(taskId){
  const id = taskId != null ? String(taskId) : "";
  if (!id) return null;
  if (Array.isArray(tasksInterval)){
    for (const task of tasksInterval){
      if (task && String(task.id) === id) return task;
    }
  }
  if (Array.isArray(tasksAsReq)){
    for (const task of tasksAsReq){
      if (task && String(task.id) === id) return task;
    }
  }
  return null;
}

function findInventoryByIdLocal(inventoryId){
  const id = inventoryId != null ? String(inventoryId) : "";
  if (!id) return null;
  if (!Array.isArray(inventory)) return null;
  for (const item of inventory){
    if (item && String(item.id) === id) return item;
  }
  return null;
}

function ensureTaskInventoryLink(task, item){
  if (!task || !item) return;
  task.inventoryId = item.id;
  item.linkedTaskId = task.id;
}

function restoreLinkedDeletedEntry(predicate, options = {}){
  if (typeof predicate !== "function") return null;
  const opts = options || {};
  const skipId = opts.skipId ? String(opts.skipId) : null;
  try { purgeExpiredDeletedItems(); }
  catch (err) { console.warn("Failed to purge before restoring linked entry", err); }
  for (let i = 0; i < deletedItems.length; i += 1){
    const entry = deletedItems[i];
    if (!entry) continue;
    if (skipId && String(entry.id) === skipId) continue;
    let matches = false;
    try {
      matches = Boolean(predicate(entry));
    } catch (err) {
      console.warn("Linked trash predicate failed", err);
      matches = false;
    }
    if (!matches) continue;
    const result = applyRestoreByType(entry, i);
    if (!result) return null;
    if (!result.handledRemoval){
      deletedItems.splice(i, 1);
      window.deletedItems = deletedItems;
    }else{
      deletedItems = window.deletedItems = normalizeDeletedItems(window.deletedItems);
    }
    return { entry, result };
  }
  return null;
}

function purgeExpiredDeletedItems(){
  const normalized = normalizeDeletedItems(deletedItems);
  let changed = normalized.length !== deletedItems.length;
  if (!changed){
    for (let i = 0; i < normalized.length; i += 1){
      if (normalized[i].id !== deletedItems[i].id){
        changed = true;
        break;
      }
    }
  }
  if (changed){
    deletedItems = normalized;
    window.deletedItems = deletedItems;
  }
  return changed;
}

function listDeletedItems(){
  purgeExpiredDeletedItems();
  return deletedItems.map(entry => ({
    ...entry,
    expiresAt: computeTrashExpiresAt(entry.deletedAt)
  }));
}

function addDeletedItem(type, payload, meta){
  const entryPayload = cloneStructured(payload);
  const entryMeta = meta && typeof meta === "object" ? { ...meta } : {};
  const entry = {
    id: genId(`trash_${type || "item"}`),
    type: type || "unknown",
    payload: entryPayload,
    meta: entryMeta,
    label: buildTrashLabel(type, entryPayload, entryMeta),
    deletedAt: new Date().toISOString()
  };
  deletedItems.unshift(entry);
  purgeExpiredDeletedItems();
  window.deletedItems = deletedItems;
  try { saveCloudDebounced(); }
  catch (err) { console.warn("Failed to schedule save after recording deleted item", err); }
  return entry;
}

function removeDeletedItem(id){
  purgeExpiredDeletedItems();
  const idx = deletedItems.findIndex(entry => entry && entry.id === id);
  if (idx < 0) return false;
  deletedItems.splice(idx, 1);
  window.deletedItems = deletedItems;
  try { saveCloudDebounced(); }
  catch (err) { console.warn("Failed to schedule save after deleting trash entry", err); }
  return true;
}

function applyRestoreByType(entry, index){
  if (!entry) return null;
  const { type, payload, meta } = entry;
  const clone = cloneStructured(payload) || {};
  switch (type) {
    case "task": {
      const mode = meta && meta.list === "asreq" ? "asreq" : "interval";
      let targetList = mode === "asreq" ? tasksAsReq : tasksInterval;
      if (!Array.isArray(targetList)) targetList = [];
      if (!clone.id) clone.id = genId(clone.name || "task");
      const existing = new Set(targetList.filter(Boolean).map(item => String(item.id)));
      while (existing.has(String(clone.id))){
        clone.id = genId(clone.name || "task");
      }
      clone.mode = mode;
      if (clone.parentTask == null) clone.parentTask = null;
      if (clone.cat === undefined) clone.cat = clone.cat ?? null;
      if (typeof window._maintOrderCounter !== "number" || !Number.isFinite(window._maintOrderCounter)){
        window._maintOrderCounter = 0;
      }
      const orderVal = Number(clone.order);
      if (Number.isFinite(orderVal)){
        if (orderVal > window._maintOrderCounter) window._maintOrderCounter = orderVal;
      } else {
        clone.order = ++window._maintOrderCounter;
      }
      targetList.push(clone);
      if (mode === "asreq"){ tasksAsReq = targetList; window.tasksAsReq = tasksAsReq; }
      else { tasksInterval = targetList; window.tasksInterval = tasksInterval; }

      const taskIdStr = String(clone.id);
      const candidateInventoryIds = [];
      if (clone.inventoryId != null) candidateInventoryIds.push(clone.inventoryId);
      if (meta && meta.inventoryId != null) candidateInventoryIds.push(meta.inventoryId);
      if (meta && meta.linkedInventoryId != null) candidateInventoryIds.push(meta.linkedInventoryId);
      if (meta && meta.inventoryIdOriginal != null) candidateInventoryIds.push(meta.inventoryIdOriginal);

      let linkedItem = null;
      for (const candidate of candidateInventoryIds){
        if (candidate == null) continue;
        linkedItem = findInventoryByIdLocal(candidate);
        if (linkedItem) break;
      }
      if (!linkedItem && Array.isArray(inventory)){
        linkedItem = inventory.find(item => item && String(item.linkedTaskId || "") === taskIdStr) || null;
      }
      if (!linkedItem){
        const restored = restoreLinkedDeletedEntry(entryCandidate => {
          if (!entryCandidate || entryCandidate.type !== "inventory") return false;
          const payload = entryCandidate.payload || {};
          const metaInfo = entryCandidate.meta || {};
          const payloadId = payload.id != null ? String(payload.id) : "";
          const metaId = metaInfo.originalId != null ? String(metaInfo.originalId) : "";
          const metaLinked = metaInfo.linkedTaskId != null ? String(metaInfo.linkedTaskId) : "";
          const payloadLinked = payload.linkedTaskId != null ? String(payload.linkedTaskId) : "";
          for (const candidate of candidateInventoryIds){
            const candidateId = candidate != null ? String(candidate) : "";
            if (candidateId && (payloadId === candidateId || metaId === candidateId)) return true;
          }
          if (metaLinked && metaLinked === taskIdStr) return true;
          if (payloadLinked && payloadLinked === taskIdStr) return true;
          return false;
        }, { skipId: entry.id });
        if (restored && restored.result && restored.result.value && restored.result.value.type === "inventory"){
          linkedItem = findInventoryByIdLocal(restored.result.value.id) || null;
          if (!linkedItem && Array.isArray(inventory)){
            linkedItem = inventory.find(item => item && String(item.linkedTaskId || "") === taskIdStr) || null;
          }
        }
      }
      if (linkedItem){
        ensureTaskInventoryLink(clone, linkedItem);
      }else{
        clone.inventoryId = null;
      }
      return { handledRemoval: false, value: { type: "task", id: clone.id } };
    }
    case "inventory": {
      if (!Array.isArray(inventory)) inventory = [];
      if (!clone.id) clone.id = genId(clone.name || "item");
      const existing = new Set(inventory.filter(Boolean).map(item => String(item.id)));
      while (existing.has(String(clone.id))){
        clone.id = genId(clone.name || "item");
      }
      const normalizedInventory = normalizeInventoryItem(clone);
      if (!normalizedInventory) return { handledRemoval: false, value: { type: "inventory", id: clone.id } };
      const idx = inventory.findIndex(item => item && String(item.id) === String(normalizedInventory.id));
      if (idx >= 0) inventory[idx] = normalizedInventory;
      else inventory.push(normalizedInventory);
      window.inventory = inventory;

      const linkedTaskIdRaw = clone.linkedTaskId != null ? clone.linkedTaskId : (meta && meta.linkedTaskId != null ? meta.linkedTaskId : null);
      const linkedTaskId = linkedTaskIdRaw != null ? String(linkedTaskIdRaw) : "";
      if (linkedTaskId){
        let task = findTaskByIdLocal(linkedTaskId);
        if (!task){
          const restored = restoreLinkedDeletedEntry(entryCandidate => {
            if (!entryCandidate || entryCandidate.type !== "task") return false;
            const payload = entryCandidate.payload || {};
            const metaInfo = entryCandidate.meta || {};
            const payloadId = payload.id != null ? String(payload.id) : "";
            if (payloadId && payloadId === linkedTaskId) return true;
            const metaInventoryId = metaInfo.inventoryId != null ? String(metaInfo.inventoryId) : "";
            const metaLinkedInventoryId = metaInfo.linkedInventoryId != null ? String(metaInfo.linkedInventoryId) : "";
            const payloadInventoryId = payload.inventoryId != null ? String(payload.inventoryId) : "";
            const metaInventoryOriginal = metaInfo.inventoryIdOriginal != null ? String(metaInfo.inventoryIdOriginal) : "";
            const inventoryIds = [metaInventoryId, metaLinkedInventoryId, payloadInventoryId, metaInventoryOriginal].filter(Boolean);
            const cloneIdStr = String(clone.id);
            if (inventoryIds.some(candidate => candidate === cloneIdStr)) return true;
            return false;
          }, { skipId: entry.id });
          if (restored && restored.result && restored.result.value && restored.result.value.type === "task"){
            task = findTaskByIdLocal(restored.result.value.id);
          }
        }
        if (task){
          ensureTaskInventoryLink(task, clone);
        }
      }
      return { handledRemoval: false, value: { type: "inventory", id: clone.id } };
    }
    case "job": {
      if (!Array.isArray(cuttingJobs)) cuttingJobs = [];
      if (!Array.isArray(clone.manualLogs)) clone.manualLogs = [];
      if (!Array.isArray(clone.files)) clone.files = [];
      if (!clone.id) clone.id = genId(clone.name || "job");
      const existing = new Set(cuttingJobs.filter(Boolean).map(job => String(job.id)));
      while (existing.has(String(clone.id))){
        clone.id = genId(clone.name || "job");
      }
      cuttingJobs.push(clone);
      window.cuttingJobs = cuttingJobs;
      return { handledRemoval: false, value: { type: "job", id: clone.id } };
    }
    case "completed-job": {
      if (!Array.isArray(completedCuttingJobs)) completedCuttingJobs = [];
      if (!Array.isArray(clone.manualLogs)) clone.manualLogs = [];
      if (!Array.isArray(clone.files)) clone.files = [];
      if (!clone.id) clone.id = genId(clone.name || "job");
      const existing = new Set(completedCuttingJobs.filter(Boolean).map(job => String(job.id)));
      while (existing.has(String(clone.id))){
        clone.id = genId(clone.name || "job");
      }
      completedCuttingJobs.push(clone);
      window.completedCuttingJobs = completedCuttingJobs;
      return { handledRemoval: false, value: { type: "completed-job", id: clone.id } };
    }
    case "folder": {
      window.settingsFolders = Array.isArray(window.settingsFolders) ? window.settingsFolders : [];
      const existing = new Set(window.settingsFolders.map(f => String(f.id)));
      if (!clone.id) clone.id = genId(clone.name || "folder");
      while (existing.has(String(clone.id))){
        clone.id = genId(clone.name || "folder");
      }
      if (typeof window._maintOrderCounter !== "number" || !Number.isFinite(window._maintOrderCounter)){
        window._maintOrderCounter = 0;
      }
      const orderVal = Number(clone.order);
      if (Number.isFinite(orderVal)){
        if (orderVal > window._maintOrderCounter) window._maintOrderCounter = orderVal;
      } else {
        clone.order = ++window._maintOrderCounter;
      }
      window.settingsFolders.push(clone);
      try { setSettingsFolders(window.settingsFolders); }
      catch (err) { console.warn("Failed to normalize folders after restore", err); }
      return { handledRemoval: false, value: { type: "folder", id: clone.id } };
    }
    case "job-folder": {
      const folders = ensureJobFolderState();
      const existing = new Set(folders.map(f => String(f.id)));
      if (!clone.id) clone.id = genId(clone.name || "category");
      while (existing.has(String(clone.id))){
        clone.id = genId(clone.name || "category");
      }
      if (typeof window._jobFolderOrderCounter !== "number" || !Number.isFinite(window._jobFolderOrderCounter)){
        window._jobFolderOrderCounter = 0;
      }
      const orderVal = Number(clone.order);
      if (Number.isFinite(orderVal)){
        if (orderVal > window._jobFolderOrderCounter) window._jobFolderOrderCounter = orderVal;
      } else {
        clone.order = ++window._jobFolderOrderCounter;
      }
      folders.push({
        id: clone.id,
        name: typeof clone.name === "string" ? clone.name : "",
        parent: clone.parent == null ? JOB_ROOT_FOLDER_ID : String(clone.parent),
        order: clone.order,
        ...(normalizeHexColor(clone.color) ? { color: normalizeHexColor(clone.color) } : {})
      });
      setJobFolders(folders);
      ensureJobCategories();
      return { handledRemoval: false, value: { type: "job-folder", id: clone.id } };
    }
    case "garnet": {
      if (!Array.isArray(garnetCleanings)) garnetCleanings = [];
      if (!clone.id) clone.id = genId("garnet");
      const existing = new Set(garnetCleanings.filter(Boolean).map(item => String(item.id)));
      while (existing.has(String(clone.id))){
        clone.id = genId("garnet");
      }
      garnetCleanings.push(clone);
      garnetCleanings.sort((a, b)=> String(a.dateISO || "").localeCompare(String(b.dateISO || "")));
      window.garnetCleanings = garnetCleanings;
      return { handledRemoval: false, value: { type: "garnet", id: clone.id } };
    }
    case "order-item": {
      if (!Array.isArray(orderRequests)) orderRequests = [];
      let request = null;
      if (meta && meta.requestId){
        request = orderRequests.find(req => req && req.id === meta.requestId);
      }
      if (!request){
        try { request = ensureActiveOrderRequest(); }
        catch (_){ request = null; }
      }
      if (!request){
        const created = createOrderRequest();
        orderRequests.push(created);
        request = created;
      }
      request.items = Array.isArray(request.items) ? request.items : [];
      if (!clone.id) clone.id = genId(clone.name || "order_item");
      const existing = new Set(request.items.filter(Boolean).map(item => String(item.id)));
      while (existing.has(String(clone.id))){
        clone.id = genId(clone.name || "order_item");
      }
      request.items.push(clone);
      window.orderRequests = orderRequests;
      return { handledRemoval: false, value: { type: "order-item", id: clone.id, requestId: request.id } };
    }
    case "total-history": {
      if (!Array.isArray(totalHistory)) totalHistory = [];
      if (!clone.dateISO) clone.dateISO = new Date().toISOString().slice(0,10);
      if (clone.hours == null) clone.hours = 0;
      totalHistory.push(clone);
      totalHistory.sort((a, b)=> String(a.dateISO||"").localeCompare(String(b.dateISO||"")));
      window.totalHistory = totalHistory;
      try { syncRenderTotalsFromHistory(); }
      catch (err) { console.warn("Failed to sync totals after restoring history", err); }
      return { handledRemoval: false, value: { type: "total-history", dateISO: clone.dateISO } };
    }
    case "workspace": {
      const snapshot = cloneStructured(payload) || {};
      const survivors = deletedItems
        .filter((_, idx) => idx !== index)
        .map(item => ({ id: item.id, type: item.type, payload: cloneStructured(item.payload), meta: { ...item.meta }, label: item.label, deletedAt: item.deletedAt }));
      snapshot.deletedItems = survivors;
      adoptState(snapshot);
      try { resetHistoryToCurrent(); }
      catch (err) { console.warn("Failed to reset history after restoring workspace", err); }
      return { handledRemoval: true, value: { type: "workspace" } };
    }
    default:
      console.warn("Unhandled trash restore type", type);
      return null;
  }
}

function restoreDeletedItem(id){
  refreshGlobalCollections();
  purgeExpiredDeletedItems();
  const idx = deletedItems.findIndex(entry => entry && entry.id === id);
  if (idx < 0) return { ok:false, reason:"not_found" };
  const entry = deletedItems[idx];
  const result = applyRestoreByType(entry, idx);
  if (!result) return { ok:false, reason:"restore_failed" };
  if (!result.handledRemoval){
    const currentIdx = deletedItems.findIndex(e => e && e.id === entry.id);
    if (currentIdx >= 0){
      deletedItems.splice(currentIdx, 1);
    }
    window.deletedItems = deletedItems;
  } else {
    deletedItems = window.deletedItems = normalizeDeletedItems(window.deletedItems);
  }
  try { saveCloudDebounced(); }
  catch (err) { console.warn("Failed to schedule save after restoring deleted item", err); }
  return { ok:true, value: result.value };
}

function snapshotWorkspaceForTrash(){
  const snap = snapshotState();
  snap.deletedItems = [];
  return snap;
}

function recordDeletedItem(type, payload, meta){
  return addDeletedItem(type, payload, meta);
}

if (typeof window !== "undefined"){
  window.listDeletedItems = listDeletedItems;
  window.recordDeletedItem = recordDeletedItem;
  window.restoreDeletedItem = restoreDeletedItem;
  window.removeDeletedItem = removeDeletedItem;
  window.purgeExpiredDeletedItems = purgeExpiredDeletedItems;
}

if (typeof window.deletedItemsSearchTerm !== "string") window.deletedItemsSearchTerm = "";
if (typeof window.inventorySearchTerm !== "string") window.inventorySearchTerm = "";
let inventorySearchTerm = window.inventorySearchTerm;
if (typeof window.jobHistorySearchTerm !== "string") window.jobHistorySearchTerm = "";
let jobHistorySearchTerm = window.jobHistorySearchTerm;

window.defaultIntervalTasks = defaultIntervalTasks;
const ROOT_FOLDER_ID = "root";
window.ROOT_FOLDER_ID = ROOT_FOLDER_ID;
const DEFAULT_SETTINGS_FOLDERS = [
  { id: ROOT_FOLDER_ID, name: "All Tasks",    parent: null,           order: 3 },
  { id: "interval",    name: "Per Interval", parent: ROOT_FOLDER_ID, order: 2 },
  { id: "asreq",       name: "As Required",  parent: ROOT_FOLDER_ID, order: 1 }
];

const JOB_ROOT_FOLDER_ID = "jobs_root";
window.JOB_ROOT_FOLDER_ID = JOB_ROOT_FOLDER_ID;
const DEFAULT_JOB_FOLDERS = [
  { id: JOB_ROOT_FOLDER_ID, name: "All Jobs", parent: null, order: 1 }
];

const HEX_COLOR_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function normalizeHexColor(value){
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = HEX_COLOR_RE.exec(trimmed);
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3){
    hex = hex.split("").map(ch => `${ch}${ch}`).join("");
  }
  return `#${hex.toUpperCase()}`;
}

function defaultJobFolders(){
  return DEFAULT_JOB_FOLDERS.map(f => ({ ...f }));
}

function defaultSettingsFolders(){
  return DEFAULT_SETTINGS_FOLDERS.map(f => ({ ...f }));
}

function normalizeSettingsFolders(raw){
  const seen = new Set();
  const normalized = [];
  if (Array.isArray(raw)){
    for (const entry of raw){
      if (!entry || entry.id == null) continue;
      const key = String(entry.id);
      if (seen.has(key)) continue;
      seen.add(key);
      const rawParent = entry.parent != null ? entry.parent : null;
      let parent = null;
      if (key === ROOT_FOLDER_ID){
        parent = null;
      }else if (rawParent == null || String(rawParent) === "" || String(rawParent) === key){
        parent = ROOT_FOLDER_ID;
      }else{
        parent = rawParent;
      }
      normalized.push({
        id: entry.id,
        name: typeof entry.name === "string" ? entry.name : "",
        parent: parent == null ? null : String(parent),
        order: Number.isFinite(entry.order) ? Number(entry.order) : 0
      });
    }
  }
  for (const template of DEFAULT_SETTINGS_FOLDERS){
    const key = String(template.id);
    if (seen.has(key)){
      const existing = normalized.find(f => String(f.id) === key);
      if (existing){
        if (!existing.name) existing.name = template.name;
        if (existing.parent == null && template.parent != null) existing.parent = template.parent;
        if (!Number.isFinite(existing.order) && Number.isFinite(template.order)){
          existing.order = Number(template.order);
        }
        if (key !== ROOT_FOLDER_ID && (existing.parent == null || String(existing.parent) === "")){
          existing.parent = template.parent ?? ROOT_FOLDER_ID;
        }
      }
      continue;
    }
    seen.add(key);
    normalized.push({ ...template });
  }
  return normalized;
}

function setSettingsFolders(raw){
  const normalized = normalizeSettingsFolders(raw);
  window.settingsFolders = normalized;
  window.folders = cloneFolders(window.settingsFolders);
  return window.settingsFolders;
}

function cloneJobFolders(list){
  if (!Array.isArray(list)) return [];
  return list.map(folder => ({ ...folder }));
}

function normalizeJobFolders(raw){
  const seen = new Set();
  const normalized = [];
  if (Array.isArray(raw)){
    for (const entry of raw){
      if (!entry || entry.id == null) continue;
      const id = String(entry.id);
      if (seen.has(id)) continue;
      seen.add(id);
      const rawParent = entry.parent != null ? entry.parent : null;
      let parent = null;
      if (id === JOB_ROOT_FOLDER_ID){
        parent = null;
      }else if (rawParent == null || String(rawParent) === "" || String(rawParent) === id){
        parent = JOB_ROOT_FOLDER_ID;
      }else{
        parent = String(rawParent);
      }
      const name = typeof entry.name === "string" ? entry.name : "";
      const order = Number.isFinite(entry.order) ? Number(entry.order) : 0;
      const color = normalizeHexColor(entry.color);
      const folderEntry = { id, name, parent, order };
      if (color) folderEntry.color = color;
      normalized.push(folderEntry);
    }
  }

  if (!seen.has(JOB_ROOT_FOLDER_ID)){
    normalized.push({ ...DEFAULT_JOB_FOLDERS[0] });
  }

  const validIds = new Set(normalized.map(folder => String(folder.id)));
  normalized.forEach(folder => {
    if (String(folder.id) === JOB_ROOT_FOLDER_ID){
      folder.parent = null;
      return;
    }
    if (!validIds.has(String(folder.parent))){
      folder.parent = JOB_ROOT_FOLDER_ID;
    }
  });

  return normalized;
}

function setJobFolders(raw){
  const normalized = normalizeJobFolders(raw);
  window.jobFolders = normalized;
  if (typeof window._jobFolderOrderCounter !== "number" || !Number.isFinite(window._jobFolderOrderCounter)){
    window._jobFolderOrderCounter = 0;
  }
  for (const folder of normalized){
    const orderVal = Number(folder?.order);
    if (Number.isFinite(orderVal) && orderVal > window._jobFolderOrderCounter){
      window._jobFolderOrderCounter = orderVal;
    }
  }
  return window.jobFolders;
}

function snapshotJobFolders(){
  const source = Array.isArray(window.jobFolders) ? window.jobFolders : defaultJobFolders();
  const normalized = normalizeJobFolders(source);
  window.jobFolders = normalized;
  return cloneJobFolders(normalized);
}

/* ===================== Persisted state ===================== */
if (!Array.isArray(window.totalHistory)) window.totalHistory = [];   // [{dateISO, hours}]
if (!Array.isArray(window.tasksInterval)) window.tasksInterval = [];
if (!Array.isArray(window.tasksAsReq))   window.tasksAsReq   = [];
if (!Array.isArray(window.inventory))    window.inventory    = [];
if (!Array.isArray(window.inventoryTransactions)) window.inventoryTransactions = [];
if (!Array.isArray(window.cuttingJobs))  window.cuttingJobs  = [];   // [{id,name,estimateHours,material,materialCost,materialQty,chargeRate,notes,startISO,dueISO,manualLogs:[{dateISO,completedHours}],files:[{name,dataUrl,type,size,addedAt}]}]
if (!Array.isArray(window.completedCuttingJobs)) window.completedCuttingJobs = [];
if (!Array.isArray(window.pendingNewJobFiles)) window.pendingNewJobFiles = [];
if (!Array.isArray(window.orderRequests)) window.orderRequests = [];
if (!Array.isArray(window.garnetCleanings)) window.garnetCleanings = [];
if (!Array.isArray(window.dailyCutHours)) window.dailyCutHours = [];
if (!Array.isArray(window.opportunityRollups)) window.opportunityRollups = [];
if (!Array.isArray(window.weeklyCostReports)) window.weeklyCostReports = [];
if (!Array.isArray(window.receiptTrackerWeeks)) window.receiptTrackerWeeks = [];
if (!Array.isArray(window.maintenanceTasksV2)) window.maintenanceTasksV2 = [];
if (!Array.isArray(window.maintenanceCalendarInstancesV2)) window.maintenanceCalendarInstancesV2 = [];
if (!Array.isArray(window.maintenanceOccurrencesV2)) window.maintenanceOccurrencesV2 = [];
if (!Array.isArray(window.jobFolders)) window.jobFolders = defaultJobFolders();
if (typeof window.orderRequestTab !== "string") window.orderRequestTab = "active";

if (typeof window.pumpEff !== "object" || !window.pumpEff){
  window.pumpEff = { baselineRPM:null, baselineDateISO:null, entries:[], notes:[] };
}
if (!Array.isArray(window.pumpEff.entries)) window.pumpEff.entries = [];
if (!Array.isArray(window.pumpEff.notes)) window.pumpEff.notes = [];

let totalHistory = window.totalHistory;
let tasksInterval = window.tasksInterval;
let tasksAsReq    = window.tasksAsReq;
let inventory     = window.inventory;
let cuttingJobs   = window.cuttingJobs;
let completedCuttingJobs = window.completedCuttingJobs;
let opportunityRollups = window.opportunityRollups;
let orderRequests = window.orderRequests;
let orderRequestTab = window.orderRequestTab;
let garnetCleanings = window.garnetCleanings;
let dailyCutHours = window.dailyCutHours;
let maintenanceTasksV2 = window.maintenanceTasksV2;
let maintenanceCalendarInstancesV2 = window.maintenanceCalendarInstancesV2;
let maintenanceOccurrencesV2 = window.maintenanceOccurrencesV2;
let jobFolders = window.jobFolders;
let weeklyCostReports = window.weeklyCostReports;
let receiptTrackerWeeks = window.receiptTrackerWeeks;

function normalizeJobPriorityOrder(list){
  if (!Array.isArray(list)) return list;
  const entries = list.map((job, index) => {
    if (!job || job.id == null) return null;
    const priority = typeof getJobPriority === "function"
      ? getJobPriority(job)
      : (Number.isFinite(Number(job?.priority)) && Number(job.priority) > 0
        ? Math.max(1, Math.floor(Number(job.priority)))
        : (index + 1));
    return { job, priority, originalIndex: index };
  }).filter(Boolean);

  entries.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.originalIndex - b.originalIndex;
  });

  entries.forEach((entry, idx) => {
    entry.job.priority = idx + 1;
  });

  return list;
}

function buildCompletedJob(job, completionISO){
  if (!job) return null;
  const eff = typeof computeJobEfficiency === "function" ? computeJobEfficiency(job) : null;
  const existingChargeRate = Number.isFinite(Number(job?.chargeRate)) && Number(job.chargeRate) >= 0
    ? Number(job.chargeRate)
    : JOB_RATE_PER_HOUR;
  const efficiencySummary = eff ? {
    rate: eff.rate ?? (eff.netRate ?? (existingChargeRate - JOB_BASE_COST_PER_HOUR)),
    chargeRate: eff.chargeRate ?? existingChargeRate,
    costRate: eff.costRate ?? null,
    netRate: eff.netRate ?? null,
    expectedHours: eff.expectedHours ?? null,
    actualHours: eff.actualHours ?? null,
    expectedRemaining: eff.expectedRemaining ?? null,
    actualRemaining: eff.actualRemaining ?? null,
    deltaHours: eff.deltaHours ?? null,
    gainLoss: eff.gainLoss ?? null
  } : {
    rate: existingChargeRate - JOB_BASE_COST_PER_HOUR,
    chargeRate: existingChargeRate,
    costRate: null,
    netRate: null,
    expectedHours: null,
    actualHours: null,
    expectedRemaining: null,
    actualRemaining: null,
    deltaHours: null,
    gainLoss: null
  };

  return {
    id: job.id,
    name: job.name,
    estimateHours: job.estimateHours,
    startISO: job.startISO,
    dueISO: job.dueISO,
    completedAtISO: completionISO,
    notes: job.notes || "",
    material: job.material || "",
    materialCost: Number(job.materialCost) || 0,
    materialQty: Number(job.materialQty) || 0,
    chargeRate: existingChargeRate,
    manualLogs: Array.isArray(job.manualLogs) ? job.manualLogs.slice() : [],
    files: Array.isArray(job.files) ? job.files.map(f => ({ ...f })) : [],
    cat: job.cat != null ? job.cat : (typeof window.JOB_ROOT_FOLDER_ID === "string" ? window.JOB_ROOT_FOLDER_ID : "jobs_root"),
    priority: typeof getJobPriority === "function"
      ? getJobPriority(job)
      : (Number.isFinite(Number(job.priority)) && Number(job.priority) > 0
        ? Math.max(1, Math.floor(Number(job.priority)))
        : 1),
    actualHours: eff && Number.isFinite(eff.actualHours) ? eff.actualHours : null,
    efficiency: efficiencySummary
  };
}

function completeCuttingJob(jobId, { completedAtISO = null, normalizePriorities = null } = {}){
  const idStr = jobId != null ? String(jobId) : "";
  if (!idStr) return null;

  if (!Array.isArray(window.cuttingJobs)) window.cuttingJobs = [];
  if (!Array.isArray(window.completedCuttingJobs)) window.completedCuttingJobs = [];

  cuttingJobs = window.cuttingJobs;
  completedCuttingJobs = window.completedCuttingJobs;

  const idx = cuttingJobs.findIndex(job => job && String(job.id) === idStr);
  if (idx < 0) return null;

  const job = cuttingJobs[idx];
  const completionISO = typeof completedAtISO === "string" && completedAtISO
    ? completedAtISO
    : new Date().toISOString();
  const completed = buildCompletedJob(job, completionISO);
  if (!completed) return null;

  cuttingJobs.splice(idx, 1);

  if (typeof normalizePriorities === "function"){
    try {
      normalizePriorities(cuttingJobs);
    } catch (err){
      console.warn("Failed to apply custom job priority normalization", err);
      normalizeJobPriorityOrder(cuttingJobs);
    }
  } else {
    normalizeJobPriorityOrder(cuttingJobs);
  }

  window.cuttingJobs = cuttingJobs;

  completedCuttingJobs.push(completed);
  window.completedCuttingJobs = completedCuttingJobs;

  if (!Array.isArray(window.syncProcessLog)) window.syncProcessLog = [];
  window.syncProcessLog.unshift({
    id: typeof genId === "function" ? genId("sync_log") : `sync_log_${Date.now()}`,
    atISO: new Date().toISOString(),
    eventType: "cutting_job_completed",
    status: "saved",
    sourceArea: "cuttingJobs",
    targetArea: "completedCuttingJobs,dataCenter,charts",
    message: `Cutting job "${String(job?.name || idStr)}" moved from active to completed and propagated to dependent views.`
  });
  if (window.syncProcessLog.length > 1000) window.syncProcessLog.length = 1000;

  if (typeof saveCloudDebounced === "function") saveCloudDebounced();
  if (typeof saveCloudNow === "function"){
    try { saveCloudNow(); } catch (err){ console.warn("Immediate save failed after completing cutting job", err); }
  }

  return completed;
}

window.completeCuttingJob = completeCuttingJob;

function refreshGlobalCollections(){
  if (typeof window === "undefined") return;

  if (!Array.isArray(window.totalHistory)) window.totalHistory = [];
  totalHistory = window.totalHistory;

  if (!Array.isArray(window.tasksInterval)) window.tasksInterval = [];
  tasksInterval = window.tasksInterval;

  if (!Array.isArray(window.tasksAsReq)) window.tasksAsReq = [];
  tasksAsReq = window.tasksAsReq;

  if (!Array.isArray(window.inventory)) window.inventory = [];
  inventory = window.inventory;

  if (!Array.isArray(window.cuttingJobs)) window.cuttingJobs = [];
  cuttingJobs = window.cuttingJobs;

  if (!Array.isArray(window.completedCuttingJobs)) window.completedCuttingJobs = [];
  completedCuttingJobs = window.completedCuttingJobs;

  if (!Array.isArray(window.opportunityRollups)) window.opportunityRollups = [];
  opportunityRollups = window.opportunityRollups;

  if (!Array.isArray(window.orderRequests)) window.orderRequests = [];
  orderRequests = window.orderRequests;

  if (!Array.isArray(window.garnetCleanings)) window.garnetCleanings = [];
  garnetCleanings = window.garnetCleanings;

  if (!Array.isArray(window.dailyCutHours)) window.dailyCutHours = [];
  dailyCutHours = window.dailyCutHours;

  if (!Array.isArray(window.maintenanceTasksV2)) window.maintenanceTasksV2 = [];
  maintenanceTasksV2 = window.maintenanceTasksV2;

  if (!Array.isArray(window.maintenanceCalendarInstancesV2)) window.maintenanceCalendarInstancesV2 = [];
  maintenanceCalendarInstancesV2 = window.maintenanceCalendarInstancesV2;

  if (!Array.isArray(window.maintenanceOccurrencesV2)) window.maintenanceOccurrencesV2 = [];
  maintenanceOccurrencesV2 = window.maintenanceOccurrencesV2;

  if (!Array.isArray(window.jobFolders)) window.jobFolders = defaultJobFolders();
  jobFolders = window.jobFolders;
}

/* ================ Jobs editing & render flags ================ */
if (!(window.editingJobs instanceof Set)) window.editingJobs = new Set();
if (!(window.editingCompletedJobs instanceof Set)) window.editingCompletedJobs = new Set();
if (typeof window.RENDER_TOTAL !== "number") window.RENDER_TOTAL = null;
if (typeof window.RENDER_DELTA !== "number") window.RENDER_DELTA = 0;

const editingJobs  = window.editingJobs;
let   RENDER_TOTAL = window.RENDER_TOTAL;
let   RENDER_DELTA = window.RENDER_DELTA;

function getEditingCompletedJobsSet(){
  if (!(window.editingCompletedJobs instanceof Set)){
    window.editingCompletedJobs = new Set();
  }
  return window.editingCompletedJobs;
}

window.getEditingCompletedJobsSet = getEditingCompletedJobsSet;

function cloneFolders(list){
  if (!Array.isArray(list)) return [];
  return list.map(folder => ({ ...folder }));
}

function foldersEqual(a, b){
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;

  const normalizeEntry = (folder)=>(
    {
      id: folder && folder.id != null ? String(folder.id) : "",
      name: typeof folder?.name === "string" ? folder.name : "",
      parent: folder && folder.parent != null ? String(folder.parent) : null,
      order: Number.isFinite(Number(folder?.order)) ? Number(folder.order) : 0
    }
  );

  const map = new Map();
  for (const entry of a){
    const norm = normalizeEntry(entry);
    if (!norm.id) continue;
    map.set(norm.id, norm);
  }

  for (const entry of b){
    const norm = normalizeEntry(entry);
    if (!norm.id) return false;
    const match = map.get(norm.id);
    if (!match) return false;
    if (match.name !== norm.name) return false;
    if ((match.parent ?? null) !== (norm.parent ?? null)) return false;
    if (match.order !== norm.order) return false;
    map.delete(norm.id);
  }

  return map.size === 0;
}

function snapshotSettingsFolders(){
  const source = Array.isArray(window.settingsFolders)
    ? window.settingsFolders
    : (Array.isArray(window.folders) ? window.folders : defaultSettingsFolders());
  const normalized = normalizeSettingsFolders(source);
  window.settingsFolders = normalized;
  window.folders = cloneFolders(window.settingsFolders);
  return cloneFolders(normalized);
}

window.defaultAsReqTasks = defaultAsReqTasks;

(function ensureSnapshotState(){
  const orig = window.snapshotState;
  window.snapshotState = function(){
    const s = typeof orig === "function" ? orig() : {};
    const copyArr = (key)=>{
      if (!Array.isArray(s[key])){
        if (Array.isArray(window[key])) s[key] = window[key].slice(); else s[key] = [];
      }
    };
    const copyObj = (key)=>{
      if (!s[key] || typeof s[key] !== "object"){
        if (window[key] && typeof window[key] === "object") s[key] = { ...window[key] }; else s[key] = {};
      }
    };
    copyArr("tasksInterval");
    copyArr("tasksAsReq");
    copyArr("cuttingJobs");
    copyArr("completedCuttingJobs");
    copyArr("dailyCutHours");
    copyArr("inventoryTransactions");
    copyArr("orderRequests");
    copyArr("receiptTrackerWeeks");
    copyArr("garnetCleanings");
    copyArr("maintenanceTasksV2");
    copyArr("maintenanceCalendarInstancesV2");
    copyArr("maintenanceOccurrencesV2");
    copyArr("totalHistory");
    copyObj("appConfig");
    copyObj("settingsFolders");
    copyObj("folders");
    copyObj("cuttingJobDatabase");
    copyObj("dashboardLayout");
    copyObj("costLayout");
    copyObj("jobLayout");
    copyObj("pumpEff");
    if (typeof s.schema !== "number") s.schema = APP_SCHEMA;
    return s;
  };
})();

(function patchAdoptState(){
  const orig = window.adoptState;
  window.adoptState = function(data){
    const sanitized = (data && typeof data === "object") ? { ...data } : {};
    if (!Array.isArray(sanitized.tasksInterval) && Array.isArray(window.tasksInterval)) sanitized.tasksInterval = window.tasksInterval.slice();
    if (!Array.isArray(sanitized.tasksAsReq) && Array.isArray(window.tasksAsReq)) sanitized.tasksAsReq = window.tasksAsReq.slice();
    if (!Array.isArray(sanitized.cuttingJobs) && Array.isArray(window.cuttingJobs)) sanitized.cuttingJobs = window.cuttingJobs.slice();
    if (!Array.isArray(sanitized.completedCuttingJobs) && Array.isArray(window.completedCuttingJobs)) sanitized.completedCuttingJobs = window.completedCuttingJobs.slice();
    if (!Array.isArray(sanitized.dailyCutHours) && Array.isArray(window.dailyCutHours)) sanitized.dailyCutHours = window.dailyCutHours.slice();
    if (!Array.isArray(sanitized.inventory) && Array.isArray(window.inventory)) sanitized.inventory = window.inventory.slice();
    if (!Array.isArray(sanitized.inventoryTransactions) && Array.isArray(window.inventoryTransactions)) sanitized.inventoryTransactions = window.inventoryTransactions.slice();
    if (!Array.isArray(sanitized.orderRequests) && Array.isArray(window.orderRequests)) sanitized.orderRequests = window.orderRequests.slice();
    if (!Array.isArray(sanitized.receiptTrackerWeeks) && Array.isArray(window.receiptTrackerWeeks)) sanitized.receiptTrackerWeeks = window.receiptTrackerWeeks.slice();
    if (!Array.isArray(sanitized.garnetCleanings) && Array.isArray(window.garnetCleanings)) sanitized.garnetCleanings = window.garnetCleanings.slice();
    if (!Array.isArray(sanitized.maintenanceTasksV2) && Array.isArray(window.maintenanceTasksV2)) sanitized.maintenanceTasksV2 = window.maintenanceTasksV2.slice();
    if (!Array.isArray(sanitized.maintenanceCalendarInstancesV2) && Array.isArray(window.maintenanceCalendarInstancesV2)) sanitized.maintenanceCalendarInstancesV2 = window.maintenanceCalendarInstancesV2.slice();
    if (!Array.isArray(sanitized.maintenanceOccurrencesV2) && Array.isArray(window.maintenanceOccurrencesV2)) sanitized.maintenanceOccurrencesV2 = window.maintenanceOccurrencesV2.slice();
    if (!Array.isArray(sanitized.totalHistory) && Array.isArray(window.totalHistory)) sanitized.totalHistory = window.totalHistory.slice();
    if (!Array.isArray(sanitized.deletedItems) && Array.isArray(window.deletedItems)) sanitized.deletedItems = window.deletedItems.slice();
    if (!Array.isArray(sanitized.jobFolders) && Array.isArray(window.jobFolders)) sanitized.jobFolders = window.jobFolders.slice();
    if (!sanitized.appConfig || typeof sanitized.appConfig !== "object") sanitized.appConfig = normalizeAppConfig(appConfig);
    if ((!sanitized.settingsFolders && !sanitized.folders) && Array.isArray(window.settingsFolders)) sanitized.settingsFolders = JSON.parse(JSON.stringify(window.settingsFolders));
    if (!sanitized.dashboardLayout && window.dashboardLayout) sanitized.dashboardLayout = { ...window.dashboardLayout };
    if (!sanitized.costLayout && window.costLayout) sanitized.costLayout = { ...window.costLayout };
    if (!sanitized.jobLayout && window.jobLayout) sanitized.jobLayout = { ...window.jobLayout };
    if (!sanitized.pumpEff && window.pumpEff) sanitized.pumpEff = { ...window.pumpEff };
    if (!sanitized.cuttingJobDatabase && window.cuttingJobDatabase && typeof window.cuttingJobDatabase === "object") sanitized.cuttingJobDatabase = cloneStructured(window.cuttingJobDatabase);
    if (typeof orig === "function") orig(sanitized);
    if (!Array.isArray(window.tasksInterval)) window.tasksInterval = [];
    if (!Array.isArray(window.tasksAsReq)) window.tasksAsReq = [];
    if (!Array.isArray(window.cuttingJobs)) window.cuttingJobs = [];
    if (!Array.isArray(window.completedCuttingJobs)) window.completedCuttingJobs = [];
    if (!Array.isArray(window.dailyCutHours)) window.dailyCutHours = [];
    if (!Array.isArray(window.inventoryTransactions)) window.inventoryTransactions = [];
    appConfig = normalizeAppConfig(sanitized.appConfig);
    window.appConfig = appConfig;
    refreshDerivedDailyHours();
    if (!Array.isArray(window.orderRequests)) window.orderRequests = [];
    if (!Array.isArray(window.receiptTrackerWeeks)) window.receiptTrackerWeeks = [];
    if (!Array.isArray(window.garnetCleanings)) window.garnetCleanings = [];
    if (!Array.isArray(window.maintenanceTasksV2)) window.maintenanceTasksV2 = [];
    if (!Array.isArray(window.maintenanceCalendarInstancesV2)) window.maintenanceCalendarInstancesV2 = [];
    if (!Array.isArray(window.maintenanceOccurrencesV2)) window.maintenanceOccurrencesV2 = [];
    if (!Array.isArray(window.totalHistory)) window.totalHistory = [];
    if (!window.settingsFolders || !Array.isArray(window.settingsFolders)) window.settingsFolders = typeof defaultSettingsFolders === "function" ? defaultSettingsFolders() : [];
    if (!window.folders || typeof window.folders !== "object") window.folders = Array.isArray(window.settingsFolders) ? JSON.parse(JSON.stringify(window.settingsFolders)) : [];
    if (!window.dashboardLayout || typeof window.dashboardLayout !== "object") window.dashboardLayout = {};
    if (!window.costLayout || typeof window.costLayout !== "object") window.costLayout = {};
    if (!window.jobLayout || typeof window.jobLayout !== "object") window.jobLayout = {};
    if (!window.pumpEff || typeof window.pumpEff !== "object") window.pumpEff = { baselineRPM:null, baselineDateISO:null, entries:[], notes:[] };
    if (!window.cuttingJobDatabase || typeof window.cuttingJobDatabase !== "object") window.cuttingJobDatabase = {};
    if (typeof window.ensureTaskCategories === "function") window.ensureTaskCategories();
    if (typeof window.ensureJobCategories === "function") window.ensureJobCategories();
    const jobFileCache = readJobFileCache();
    syncJobFileCacheFromJobs(window.cuttingJobs, jobFileCache);
    syncJobFileCacheFromJobs(window.completedCuttingJobs, jobFileCache);
    applyJobFileCacheToJobs(window.cuttingJobs, jobFileCache);
    applyJobFileCacheToJobs(window.completedCuttingJobs, jobFileCache);
    writeJobFileCache(jobFileCache);
    if (typeof window.syncRenderTotalsFromHistory === "function") window.syncRenderTotalsFromHistory();
  };
})();

/* ==================== Cloud load / save ===================== */
function stateHasMeaningfulData(data){
  if (!data || typeof data !== "object") return false;
  const keys = Object.keys(data);
  if (keys.length === 0) return false;
  if (keys.length === 1 && keys[0] === "schema") return false;
  const meaningfulKeys = new Set([
    "tasksInterval",
    "tasksAsReq",
    "inventory",
    "cuttingJobs",
    "completedCuttingJobs",
    "dailyCutHours",
    "orderRequests",
    "receiptTrackerWeeks",
    "totalHistory",
    "garnetCleanings",
    "deletedItems",
    "dashboardLayout",
    "costLayout",
    "jobLayout",
    "appConfig",
    "settingsFolders",
    "folders",
    "pumpEff",
    "jobFolders",
    "orderRequestTab",
    "maintenanceTasksV2",
    "maintenanceCalendarInstancesV2",
    "maintenanceOccurrencesV2",
    "schema"
  ]);
  return keys.some(key => meaningfulKeys.has(key));
}

const JOB_FILE_CACHE_KEY = "cutting_job_files_v1";

function readJobFileCache(){
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(JOB_FILE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err){
    console.warn("Unable to read job file cache", err);
    return {};
  }
}

function writeJobFileCache(cache){
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(JOB_FILE_CACHE_KEY, JSON.stringify(cache || {}));
  } catch (err){
    console.warn("Unable to persist job file cache", err);
  }
}

function syncJobFileCacheFromJobs(jobs, cache){
  if (!Array.isArray(jobs)) return;
  jobs.forEach(job => {
    const files = Array.isArray(job?.files) ? job.files : [];
    files.forEach(file => {
      if (!file || !file.id) return;
      if (typeof file.dataUrl === "string" && file.dataUrl){
        cache[file.id] = file.dataUrl;
      }
    });
  });
}

function applyJobFileCacheToJobs(jobs, cache){
  if (!Array.isArray(jobs)) return;
  jobs.forEach(job => {
    const files = Array.isArray(job?.files) ? job.files : [];
    files.forEach(file => {
      if (!file || !file.id) return;
      if (!file.dataUrl && cache[file.id]){
        file.dataUrl = cache[file.id];
      }
    });
  });
}

function stripJobFileDataUrls(jobs, tracker = null){
  if (!Array.isArray(jobs)) return [];
  return jobs.map(job => {
    if (!job || typeof job !== "object") return job;
    const files = Array.isArray(job.files)
      ? job.files.map(file => {
          if (!file || typeof file !== "object") return file;
          const rest = {};
          for (const [k,v] of Object.entries(file)){
            if (typeof v === "string" && isLikelyEmbeddedFileContent(k, v)){ if (tracker) tracker.count += 1; continue; }
            rest[k] = v;
          }
          return rest;
        })
      : [];
    return { ...job, files };
  });
}

function snapshotState(){
  refreshGlobalCollections();
  const strippedTracker = { count: 0 };
  const jobFileCache = readJobFileCache();
  syncJobFileCacheFromJobs(cuttingJobs, jobFileCache);
  syncJobFileCacheFromJobs(completedCuttingJobs, jobFileCache);
  writeJobFileCache(jobFileCache);
  const safePumpEff = (typeof window.pumpEff !== "undefined") ? window.pumpEff : null;
  const foldersSnapshot = snapshotSettingsFolders();
  const trashSnapshot = deletedItems.map(entry => ({
    id: entry.id,
    type: entry.type,
    payload: cloneStructured(entry.payload),
    meta: entry.meta && typeof entry.meta === "object" ? { ...entry.meta } : {},
    label: entry.label,
    deletedAt: entry.deletedAt
  }));
  const dashLayoutSource = window.cloudDashboardLayoutLoaded
    ? window.cloudDashboardLayout
    : (window.dashboardLayoutState && window.dashboardLayoutState.layoutById);
  const costLayoutSource = window.cloudCostLayoutLoaded
    ? window.cloudCostLayout
    : (window.costLayoutState && window.costLayoutState.layoutById);
  const jobLayoutSource = window.cloudJobLayoutLoaded
    ? window.cloudJobLayout
    : (window.jobLayoutState && window.jobLayoutState.layoutById);
  const cuttingJobDatabaseSource = (typeof window !== "undefined" && window.cuttingJobDatabase && typeof window.cuttingJobDatabase === "object")
    ? window.cuttingJobDatabase
    : ((typeof window !== "undefined" && window.__lastLoadedCloudState && window.__lastLoadedCloudState.cuttingJobDatabase && typeof window.__lastLoadedCloudState.cuttingJobDatabase === "object")
      ? window.__lastLoadedCloudState.cuttingJobDatabase
      : {});
  const inventoryTransactionsSource = (typeof window !== "undefined" && Array.isArray(window.inventoryTransactions))
    ? window.inventoryTransactions
    : ((typeof window !== "undefined" && window.__lastLoadedCloudState && Array.isArray(window.__lastLoadedCloudState.inventoryTransactions))
      ? window.__lastLoadedCloudState.inventoryTransactions
      : []);
  const result = {
    schema: window.APP_SCHEMA || APP_SCHEMA,
    totalHistory,
    tasksInterval,
    tasksAsReq,
    inventory,
    inventoryFolders: Array.isArray(window.inventoryFolders) ? window.inventoryFolders.map(folder => ({ ...folder })) : [],
    inventoryMaterials: normalizeInventoryMaterials(window.inventoryMaterials),
    inventoryTransactions: inventoryTransactionsSource.map(entry => (entry && typeof entry === "object" ? { ...entry } : entry)),
    inventorySection: String(window.inventorySection || "items") === "material" ? "material" : "items",
    cuttingJobDatabase: cloneStructured(cuttingJobDatabaseSource) || {},
    cuttingJobs: stripJobFileDataUrls(cuttingJobs, strippedTracker),
    completedCuttingJobs: stripJobFileDataUrls(completedCuttingJobs, strippedTracker),
    orderRequests,
    receiptTrackerWeeks: Array.isArray(window.receiptTrackerWeeks)
      ? window.receiptTrackerWeeks.map(entry => ({ ...entry }))
      : [],
    orderRequestTab,
    garnetCleanings,
    dailyCutHours: Array.isArray(dailyCutHours)
      ? dailyCutHours.map(entry => ({ ...entry }))
      : [],
    opportunityRollups: Array.isArray(window.opportunityRollups)
      ? window.opportunityRollups.map(entry => ({ ...entry }))
      : [],
    weeklyCostReports: Array.isArray(window.weeklyCostReports)
      ? window.weeklyCostReports.map(entry => ({ ...entry }))
      : [],
    maintenanceTasksV2: Array.isArray(maintenanceTasksV2) ? maintenanceTasksV2.map(entry => ({ ...entry })) : [],
    maintenanceCalendarInstancesV2: Array.isArray(maintenanceCalendarInstancesV2) ? maintenanceCalendarInstancesV2.map(entry => ({ ...entry })) : [],
    maintenanceOccurrencesV2: Array.isArray(maintenanceOccurrencesV2) ? maintenanceOccurrencesV2.map(entry => ({ ...entry })) : [],
    saveMeta: {
      lastSavedAt: new Date().toISOString(),
      lastSaveStatus: "pending",
      lastSaveError: "",
      lastSaveSizeBytes: 0
    },
    syncProcessLog: Array.isArray(window.syncProcessLog)
      ? window.syncProcessLog.map(entry => ({ ...entry }))
      : [],
    appConfig: normalizeAppConfig(window.appConfig),
    pumpEff: safePumpEff,
    deletedItems: trashSnapshot,
    settingsFolders: foldersSnapshot,
    folders: cloneFolders(window.settingsFolders),
    jobFolders: snapshotJobFolders(),
    dashboardLayout: cloneStructured(dashLayoutSource) || {},
    costLayout: cloneStructured(costLayoutSource) || {},
    jobLayout: cloneStructured(jobLayoutSource) || {},
    oneDriveJobConfig: (typeof window !== "undefined" && window.oneDriveJobConfig && typeof window.oneDriveJobConfig === "object")
      ? cloneStructured(window.oneDriveJobConfig)
      : null,
    syncMeta: {
      rev: Math.max(Date.now(), (Number(lastAppliedCloudRevision) || 0) + 1),
      updatedAtISO: new Date().toISOString(),
      updatedBy: getCloudSyncClientId()
    }
  };
  if (typeof window !== "undefined") window.__lastStrippedHeavyFields = strippedTracker.count;
  return result;
}

/* ======================== HISTORY ========================= */
const HISTORY_LIMIT = 50;
const undoStack = [];
const redoStack = [];
let currentSnapshotJSON = null;
let suppressHistory = false;
let skipNextHistoryCapture = false;

function syncRenderTotalsFromHistory(){
  const len = Array.isArray(totalHistory) ? totalHistory.length : 0;
  const last = len ? totalHistory[len - 1] : null;
  const prev = len > 1 ? totalHistory[len - 2] : null;

  const curHours = last != null ? Number(last.hours) : NaN;
  const prevHours = prev != null ? Number(prev.hours) : NaN;

  const cur = Number.isFinite(curHours) ? curHours : null;
  const prevVal = Number.isFinite(prevHours) ? prevHours : null;
  const delta = (cur != null && prevVal != null) ? Math.max(0, cur - prevVal) : null;

  RENDER_TOTAL = cur;
  RENDER_DELTA = delta;
  window.RENDER_TOTAL = RENDER_TOTAL;
  window.RENDER_DELTA = RENDER_DELTA;
}

function resetHistoryToCurrent(){
  try {
    currentSnapshotJSON = JSON.stringify(snapshotState());
  } catch (err) {
    console.warn("Failed to seed history snapshot:", err);
    currentSnapshotJSON = null;
  }
  undoStack.length = 0;
  redoStack.length = 0;
  syncRenderTotalsFromHistory();
}

function captureHistorySnapshot(){
  if (suppressHistory) return;
  if (skipNextHistoryCapture){
    skipNextHistoryCapture = false;
    return;
  }
  try {
    const nextSnapshot = JSON.stringify(snapshotState());
    if (nextSnapshot === currentSnapshotJSON) return;
    if (currentSnapshotJSON){
      undoStack.push(currentSnapshotJSON);
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    }
    currentSnapshotJSON = nextSnapshot;
    redoStack.length = 0;
  } catch (err) {
    console.warn("History capture failed:", err);
  }
}

function applyHistorySnapshot(json){
  if (!json) return false;
  let data;
  try {
    data = JSON.parse(json);
  } catch (err) {
    console.warn("Could not parse history snapshot:", err);
    return false;
  }
  suppressHistory = true;
  try {
    adoptState(data);
    currentSnapshotJSON = json;
  } catch (err) {
    console.warn("Failed to apply history snapshot:", err);
    return false;
  } finally {
    suppressHistory = false;
  }
  if (typeof route === "function") {
    try { route(); } catch (err) { console.warn("Route after history failed:", err); }
  }
  skipNextHistoryCapture = true;
  saveCloudDebounced();
  return true;
}

function undoLastChange(){
  if (!undoStack.length){
    toast("Nothing to undo");
    return false;
  }
  const target = undoStack.pop();
  const previous = currentSnapshotJSON;
  if (applyHistorySnapshot(target)){
    if (previous){
      redoStack.push(previous);
      if (redoStack.length > HISTORY_LIMIT) redoStack.shift();
    }
    toast("Undid last change");
    return true;
  }
  undoStack.push(target);
  return false;
}

function redoLastUndo(){
  if (!redoStack.length){
    toast("Nothing to redo");
    return false;
  }
  const target = redoStack.pop();
  const previous = currentSnapshotJSON;
  if (applyHistorySnapshot(target)){
    if (previous){
      undoStack.push(previous);
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    }
    toast("Redid change");
    return true;
  }
  redoStack.push(target);
  return false;
}

resetHistoryToCurrent();

/* ======= Minimal folder model used by the explorer UI ======= */
setSettingsFolders(window.settingsFolders || window.folders);

/* ================ Explorer helper functions ================= */
function childrenFolders(parentId){
  const key = String(parentId ?? "");
  const folders = Array.isArray(window.settingsFolders) ? window.settingsFolders : [];
  return folders.filter(f => String((f?.parent ?? "")) === key);
}

function topTasksInCat(folderId){
  switch (folderId) {
    case "interval": return tasksInterval;
    case "asreq":    return tasksAsReq;
    default:         return tasksInterval.concat(tasksAsReq);
  }
}

/* Ensure every task carries a category tag used by calendar/explorer */
function ensureTaskCategories(){
  tasksInterval.forEach(t => {
    if (!t) return;
    if (!t.cat) t.cat = "interval";
    if (!Array.isArray(t.completedDates)) t.completedDates = [];
    if (typeof window.normalizeTaskRecurrence === "function"){
      try { window.normalizeTaskRecurrence(t); } catch (_err){}
    }
  });
  tasksAsReq.forEach(t =>    {
    if (!t) return;
    if (!t.cat) t.cat = "asreq";
    if (typeof window.normalizeTaskRecurrence === "function"){
      try { window.normalizeTaskRecurrence(t); } catch (_err){}
    }
  });
}

function detectMaintenanceRecordSystem(record){
  if (!record || typeof record !== "object") return "legacy";
  if (record.system === "v2") return "v2";
  if ("eventType" in record || "effectiveDateISO" in record || "recordedAtISO" in record || "payload" in record) return "v2";
  if (Number(record.schemaVersion) >= 2) return "v2";
  return "legacy";
}

function createMaintenanceCompatibilityRow(base){
  const lifecycleStatus = base.lifecycleStatus != null ? String(base.lifecycleStatus) : (base.status || "unknown");
  return {
    streamId: base.streamId || "",
    sourceSystem: base.sourceSystem || "legacy",
    taskId: base.taskId || null,
    taskName: base.taskName || "",
    instanceId: base.instanceId || null,
    occurrenceId: base.occurrenceId || null,
    rootOccurrenceId: base.rootOccurrenceId || null,
    eventId: base.eventId || base.occurrenceId || null,
    originalDateISO: normalizeDateISO(base.originalDateISO || base.dateISO || ""),
    displayDateISO: normalizeDateISO(base.displayDateISO || base.effectiveDateISO || base.dateISO || ""),
    effectiveDateISO: normalizeDateISO(base.effectiveDateISO || base.displayDateISO || base.dateISO || ""),
    dateISO: normalizeDateISO(base.dateISO || base.effectiveDateISO || ""),
    status: base.status || lifecycleStatus,
    lifecycleStatus,
    eventType: base.eventType || null,
    eventRecordedAtISO: normalizeDateISO(base.eventRecordedAtISO || base.recordedAtISO || "") || null,
    isCompleted: base.isCompleted === true,
    isRemoved: base.isRemoved === true,
    isMoved: base.isMoved === true,
    isStoppedChain: base.isStoppedChain === true,
    repeatBasis: base.repeatBasis || null,
    repeatInterval: base.repeatInterval ?? null,
    instanceMode: base.instanceMode || null,
    loggedHours: base.loggedHours != null && Number.isFinite(Number(base.loggedHours)) ? Number(base.loggedHours) : (base.hours != null && Number.isFinite(Number(base.hours)) ? Number(base.hours) : null),
    note: base.note != null ? String(base.note) : null,
    hours: base.hours != null && Number.isFinite(Number(base.hours)) ? Number(base.hours) : null,
    categoryRef: base.categoryRef || null,
    categoryId: base.categoryId || base.categoryRef || null,
    inventoryRef: base.inventoryRef || null,
    costRef: base.costRef ?? null,
    linkRef: base.linkRef || null,
    provenance: base.provenance && typeof base.provenance === "object" ? { ...base.provenance } : {}
  };
}

function normalizeLegacyMaintenanceTask(task, mode){
  if (!task || typeof task !== "object") return null;
  const taskId = task.id != null ? String(task.id) : "";
  if (!taskId) return null;
  return createMaintenanceCompatibilityRow({
    streamId: `legacy-task:${mode}:${taskId}`,
    sourceSystem: "legacy",
    taskId,
    taskName: String(task.name || "").trim(),
    instanceId: null,
    occurrenceId: null,
    dateISO: normalizeDateISO(task.calendarDateISO || task.nextDueISO || task.lastDoneISO || ""),
    status: "task_definition",
    instanceMode: mode === "asreq" ? "one_time" : "repeat",
    note: null,
    hours: null,
    categoryRef: task.cat != null ? String(task.cat) : null,
    inventoryRef: task.inventoryId != null ? String(task.inventoryId) : null,
    costRef: task.price != null ? Number(task.price) : null,
    linkRef: task.storeLink != null ? String(task.storeLink) : null,
    provenance: {
      taskMode: mode,
      taskId,
      sourceField: "tasksInterval/tasksAsReq"
    }
  });
}

function buildMaintenanceCompatibilityStream(){
  const out = [];
  const normalizeLegacyEvents = (task, mode)=>{
    if (!task || typeof task !== "object") return;
    const taskId = task.id != null ? String(task.id) : "";
    if (!taskId) return;
    const taskName = String(task.name || "").trim();
    const instanceMode = mode === "asreq" ? "one_time" : "repeat";
    const categoryRef = task.cat != null ? String(task.cat) : null;
    const inventoryRef = task.inventoryId != null ? String(task.inventoryId) : null;
    const costRef = task.price != null ? Number(task.price) : null;
    const linkRef = task.storeLink != null ? String(task.storeLink) : null;
    const instanceId = task.templateId != null ? String(task.templateId) : null;
    const variant = task.variant != null ? String(task.variant) : null;
    const common = { sourceSystem: "legacy", taskId, taskName, instanceMode, categoryRef, inventoryRef, costRef, linkRef, instanceId };
    const pushEvent = (input)=> out.push(createMaintenanceCompatibilityRow({ ...common, ...input }));

    if (task.calendarDateISO){
      pushEvent({
        streamId: `legacy-calendar:${mode}:${taskId}:${task.calendarDateISO}`,
        status: "scheduled",
        eventType: "scheduled",
        dateISO: task.calendarDateISO,
        provenance: { sourceField: "calendarDateISO", taskMode: mode, taskId, templateId: instanceId, variant }
      });
    }
    (Array.isArray(task.completedDates) ? task.completedDates : []).forEach((date, idx)=>{
      pushEvent({
        streamId: `legacy-completed:${mode}:${taskId}:${idx}:${String(date)}`,
        occurrenceId: `legacy-completed:${taskId}:${String(date)}:${idx}`,
        status: "completed",
        eventType: "completed",
        dateISO: date,
        provenance: { sourceField: "completedDates", index: idx, taskMode: mode, taskId, templateId: instanceId, variant }
      });
    });
    (Array.isArray(task.manualHistory) ? task.manualHistory : []).forEach((entry, idx)=>{
      const dateISO = entry && typeof entry === "object" ? (entry.dateISO || entry.date || entry.doneDateISO) : entry;
      const note = entry && typeof entry === "object" ? (entry.note || entry.notes || null) : null;
      const hours = entry && typeof entry === "object" ? (entry.hours ?? entry.timeHours ?? null) : null;
      pushEvent({
        streamId: `legacy-manual:${mode}:${taskId}:${idx}`,
        occurrenceId: `legacy-manual:${taskId}:${idx}`,
        status: "completed",
        eventType: "manual_history",
        dateISO,
        note,
        hours,
        provenance: { sourceField: "manualHistory", index: idx, rawId: entry && entry.id != null ? String(entry.id) : null, taskMode: mode, taskId, templateId: instanceId, variant }
      });
    });
    (Array.isArray(task.removedOccurrences) ? task.removedOccurrences : []).forEach((entry, idx)=>{
      const dateISO = entry && typeof entry === "object" ? (entry.dateISO || entry.date || entry.when) : entry;
      pushEvent({
        streamId: `legacy-removed:${mode}:${taskId}:${idx}`,
        occurrenceId: `legacy-removed:${taskId}:${idx}`,
        status: "removed",
        eventType: "removed",
        dateISO,
        provenance: { sourceField: "removedOccurrences", index: idx, taskMode: mode, taskId, templateId: instanceId, variant }
      });
    });
    const notesMap = task.occurrenceNotes && typeof task.occurrenceNotes === "object" ? task.occurrenceNotes : {};
    Object.entries(notesMap).forEach(([dateKey, note])=>{
      pushEvent({
        streamId: `legacy-note:${mode}:${taskId}:${dateKey}`,
        occurrenceId: `legacy-note:${taskId}:${dateKey}`,
        status: "annotated",
        eventType: "note",
        dateISO: dateKey,
        note,
        provenance: { sourceField: "occurrenceNotes", key: dateKey, taskMode: mode, taskId, templateId: instanceId, variant }
      });
    });
    const hoursMap = task.occurrenceHours && typeof task.occurrenceHours === "object" ? task.occurrenceHours : {};
    Object.entries(hoursMap).forEach(([dateKey, hours])=>{
      pushEvent({
        streamId: `legacy-hours:${mode}:${taskId}:${dateKey}`,
        occurrenceId: `legacy-hours:${taskId}:${dateKey}`,
        status: "annotated",
        eventType: "hours",
        dateISO: dateKey,
        hours,
        provenance: { sourceField: "occurrenceHours", key: dateKey, taskMode: mode, taskId, templateId: instanceId, variant }
      });
    });
  };
  const intervalList = Array.isArray(window.tasksInterval) ? window.tasksInterval : [];
  const asReqList = Array.isArray(window.tasksAsReq) ? window.tasksAsReq : [];
  intervalList.forEach(task => {
    const row = normalizeLegacyMaintenanceTask(task, "interval");
    if (row) out.push(row);
    normalizeLegacyEvents(task, "interval");
  });
  asReqList.forEach(task => {
    const row = normalizeLegacyMaintenanceTask(task, "asreq");
    if (row) out.push(row);
    normalizeLegacyEvents(task, "asreq");
  });

  const v2Tasks = Array.isArray(window.maintenanceTasksV2) ? window.maintenanceTasksV2 : [];
  const v2Instances = Array.isArray(window.maintenanceCalendarInstancesV2) ? window.maintenanceCalendarInstancesV2 : [];
  const v2Occurrences = Array.isArray(window.maintenanceOccurrencesV2) ? window.maintenanceOccurrencesV2 : [];
  const taskMap = new Map();
  v2Tasks.forEach(task => {
    if (!task || typeof task !== "object") return;
    const id = task.id != null ? String(task.id) : "";
    if (!id) return;
    taskMap.set(id, task);
  });
  const instanceMap = new Map();
  v2Instances.forEach(instance => {
    if (!instance || typeof instance !== "object") return;
    const id = instance.id != null ? String(instance.id) : "";
    if (!id) return;
    instanceMap.set(id, instance);
  });

  const v2RootGroups = new Map();
  v2Occurrences.forEach((event, idx) => {
    if (!event || typeof event !== "object") return;
    if (detectMaintenanceRecordSystem(event) !== "v2") return;
    const rootOccurrenceId = event.rootOccurrenceId != null ? String(event.rootOccurrenceId) : "";
    if (!rootOccurrenceId) return;
    const list = v2RootGroups.get(rootOccurrenceId) || [];
    list.push({ event, idx });
    v2RootGroups.set(rootOccurrenceId, list);
  });

  let completedRowsEmitted = 0;
  let scheduledUncompletedRootsSkipped = 0;
  let removedSkippedRootsSkipped = 0;
  let movedCompletedRowsEmitted = 0;
  let duplicateRootsSkipped = 0;
  const emittedRoots = new Set();

  v2RootGroups.forEach((entries, rootOccurrenceId) => {
    const sorted = entries.slice().sort((a, b) => {
      const aTime = Date.parse(String(a.event.recordedAtISO || ""));
      const bTime = Date.parse(String(b.event.recordedAtISO || ""));
      const aValid = Number.isFinite(aTime);
      const bValid = Number.isFinite(bTime);
      if (aValid && bValid && aTime !== bTime) return aTime - bTime;
      if (aValid && !bValid) return -1;
      if (!aValid && bValid) return 1;
      return a.idx - b.idx;
    });
    const firstEvent = sorted[0]?.event || null;
    if (!firstEvent) return;
    const instanceId = firstEvent.instanceId != null ? String(firstEvent.instanceId) : "";
    const inst = instanceMap.get(instanceId) || null;
    const taskId = firstEvent.taskId != null ? String(firstEvent.taskId) : (inst && inst.taskId != null ? String(inst.taskId) : "");
    const task = taskMap.get(taskId) || null;

    const rootDateHint = String(rootOccurrenceId).match(/(\d{4}-\d{2}-\d{2})/)?.[1] || "";
    let originalDateISO = normalizeDateISO(firstEvent.originalDateISO || firstEvent.effectiveDateISO || firstEvent.dateISO || rootDateHint || "");
    let displayDateISO = normalizeDateISO(firstEvent.displayDateISO || firstEvent.effectiveDateISO || firstEvent.dateISO || originalDateISO || "");
    let effectiveDateISO = normalizeDateISO(firstEvent.effectiveDateISO || displayDateISO || originalDateISO || "");
    let lifecycleStatus = "scheduled";
    let note = null;
    let loggedHours = null;
    let isMoved = false;
    let isStoppedChain = inst && String(inst.status || "") === "stopped";
    let latestEventType = null;
    let latestRecordedAtISO = null;
    const resolvedEventIds = [];

    sorted.forEach(({ event }) => {
      const eventType = String(event.eventType || event.type || "");
      latestEventType = eventType || latestEventType;
      latestRecordedAtISO = event.recordedAtISO || latestRecordedAtISO;
      if (event.id != null) resolvedEventIds.push(String(event.id));

      const nextOriginal = normalizeDateISO(event.originalDateISO || event.payload?.originalDateISO || "");
      if (nextOriginal) originalDateISO = nextOriginal;
      const nextEffective = normalizeDateISO(event.effectiveDateISO || event.dateISO || "");
      if (nextEffective) effectiveDateISO = nextEffective;
      if (!displayDateISO) displayDateISO = effectiveDateISO || originalDateISO;

      if (eventType === "moved") {
        const movedTo = normalizeDateISO(event.payload?.toDateISO || event.displayDateISO || event.effectiveDateISO || "");
        if (movedTo) {
          displayDateISO = movedTo;
          isMoved = true;
        }
      }
      if (eventType === "note_set" && event.payload && event.payload.note != null) note = String(event.payload.note);
      else if (event.note != null) note = String(event.note);

      const payloadHours = event.payload && event.payload.hours;
      if (eventType === "hours_set" && Number.isFinite(Number(payloadHours))) loggedHours = Number(payloadHours);
      else if (Number.isFinite(Number(event.loggedHours))) loggedHours = Number(event.loggedHours);
      else if (Number.isFinite(Number(event.hours))) loggedHours = Number(event.hours);

      if (eventType === "completed") lifecycleStatus = "completed";
      if (eventType === "uncompleted") lifecycleStatus = "scheduled";
      if (eventType === "removed") lifecycleStatus = "removed";
      if (eventType === "skipped") lifecycleStatus = "skipped";
      if (eventType === "stopped" || event.lifecycleStatus === "stopped") isStoppedChain = true;
      if (event.lifecycleStatus === "completed") lifecycleStatus = "completed";
      if (event.lifecycleStatus === "scheduled") lifecycleStatus = "scheduled";
      if (event.lifecycleStatus === "removed") lifecycleStatus = "removed";
      if (event.lifecycleStatus === "skipped") lifecycleStatus = "skipped";
    });

    if (!displayDateISO) displayDateISO = normalizeDateISO(effectiveDateISO || originalDateISO || "");
    if (!effectiveDateISO) effectiveDateISO = normalizeDateISO(displayDateISO || originalDateISO || "");
    if (!originalDateISO) originalDateISO = normalizeDateISO(effectiveDateISO || displayDateISO || rootDateHint || "");

    if (lifecycleStatus === "removed" || lifecycleStatus === "skipped") {
      removedSkippedRootsSkipped += 1;
      return;
    }
    if (lifecycleStatus !== "completed") {
      scheduledUncompletedRootsSkipped += 1;
      return;
    }
    if (emittedRoots.has(rootOccurrenceId)) {
      duplicateRootsSkipped += 1;
      return;
    }
    emittedRoots.add(rootOccurrenceId);

    const repeatRule = inst && inst.repeatRule && typeof inst.repeatRule === "object" ? inst.repeatRule : null;
    const repeatBasis = (repeatRule && repeatRule.basis) || inst?.repeatBasis || firstEvent.repeatBasis || task?.repeatBasis || null;
    const repeatInterval = repeatBasis === "machine_hours"
      ? (repeatRule && repeatRule.intervalHours != null ? repeatRule.intervalHours : (inst?.repeatInterval ?? firstEvent.repeatInterval ?? task?.repeatInterval ?? null))
      : (repeatRule && repeatRule.every != null ? repeatRule.every : (inst?.repeatInterval ?? firstEvent.repeatInterval ?? task?.repeatInterval ?? null));

    out.push(createMaintenanceCompatibilityRow({
      streamId: `v2-occurrence:${rootOccurrenceId}`,
      sourceSystem: "v2",
      taskId: taskId || null,
      taskName: String(firstEvent.taskName || (task && task.name) || "").trim(),
      instanceId: instanceId || null,
      occurrenceId: rootOccurrenceId,
      rootOccurrenceId,
      originalDateISO,
      displayDateISO,
      effectiveDateISO,
      dateISO: displayDateISO,
      status: lifecycleStatus,
      lifecycleStatus,
      eventType: latestEventType,
      eventRecordedAtISO: latestRecordedAtISO || null,
      isCompleted: lifecycleStatus === "completed",
      isRemoved: lifecycleStatus === "removed",
      isMoved,
      isStoppedChain,
      repeatBasis,
      repeatInterval,
      instanceMode: inst && inst.instanceMode ? String(inst.instanceMode) : null,
      loggedHours,
      note,
      categoryRef: task && (task.categoryRef ?? task.folderId) != null ? String(task.categoryRef ?? task.folderId) : null,
      categoryId: task && (task.categoryId ?? task.cat) != null ? String(task.categoryId ?? task.cat) : null,
      inventoryRef: task && task.inventoryRef != null ? String(task.inventoryRef) : (task && task.inventoryId != null ? String(task.inventoryId) : null),
      costRef: task && (task.cost ?? task.price ?? task.costProfileId) != null ? (task.cost ?? task.price ?? task.costProfileId) : null,
      provenance: {
        sourceArrays: ["maintenanceTasksV2", "maintenanceCalendarInstancesV2", "maintenanceOccurrencesV2"],
        sourceField: "maintenanceOccurrencesV2",
        taskId: taskId || null,
        instanceId: instanceId || null,
        rootOccurrenceId,
        resolvedEventIds,
        groupedEventCount: sorted.length,
        originalDateISO,
        displayDateISO,
        taskRecordSystem: task ? detectMaintenanceRecordSystem(task) : null,
        instanceRecordSystem: inst ? detectMaintenanceRecordSystem(inst) : null,
        occurrenceRecordSystem: "v2"
      }
    }));

    completedRowsEmitted += 1;
    if (isMoved) movedCompletedRowsEmitted += 1;
  });
  if (window.DEBUG_MODE){
    console.debug("[maintenance-v2-reporting]", {
      v2TasksCount: v2Tasks.length,
      v2InstancesCount: v2Instances.length,
      v2OccurrencesCount: v2Occurrences.length,
      rootGroupsCount: v2RootGroups.size,
      completedRowsEmitted,
      scheduledUncompletedRootsSkipped,
      removedSkippedRootsSkipped,
      movedCompletedRowsEmitted,
      duplicateRootsSkipped
    });
  }
  return out;
}

window.detectMaintenanceRecordSystem = detectMaintenanceRecordSystem;
window.buildMaintenanceCompatibilityStream = buildMaintenanceCompatibilityStream;
function runMaintenanceV2SafetyChecks(){
  const result = { ok: true, errors: [], warnings: [], info: [], counts: {} };
  const push = (bucket, code, message, meta)=> result[bucket].push({ code, message, meta: meta || null });
  const arraysToCheck = ["maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2","tasksInterval","tasksAsReq","cuttingJobs","completedCuttingJobs","inventory","receiptTrackerWeeks","dailyCutHours"];
  arraysToCheck.forEach(key => {
    if (!Array.isArray(window[key])) push("warnings", "missing_array", `${key} is missing or not an array`, { key, type: typeof window[key] });
  });
  const inventoryMaterialsValue = window.inventoryMaterials;
  if (!(Array.isArray(inventoryMaterialsValue) || (inventoryMaterialsValue && typeof inventoryMaterialsValue === "object"))){
    push("warnings", "missing_inventory_materials", "inventoryMaterials is missing or not a valid object/array", { type: typeof inventoryMaterialsValue });
  }
  const maintenancePreference = (typeof window.getMaintenanceCalendarNewRecordsSystem === "function")
    ? window.getMaintenanceCalendarNewRecordsSystem()
    : "v2";
  const v2PreferenceActive = maintenancePreference === "v2";
  const suspiciousLegacyActiveCount = (()=>{
    const lists = [Array.isArray(window.tasksInterval) ? window.tasksInterval : [], Array.isArray(window.tasksAsReq) ? window.tasksAsReq : []];
    let count = 0;
    lists.forEach(list => list.forEach(task => {
      if (!task || typeof task !== "object") return;
      if (String(task.variant || "").toLowerCase() !== "instance") return;
      const done = Array.isArray(task.completedDates) && task.completedDates.length > 0;
      if (!done) count += 1;
    }));
    return count;
  })();
  const inventoryMaterialsCount = (()=>{
    if (Array.isArray(inventoryMaterialsValue)) return inventoryMaterialsValue.length;
    if (!inventoryMaterialsValue || typeof inventoryMaterialsValue !== "object") return 0;
    const types = Array.isArray(inventoryMaterialsValue.types) ? inventoryMaterialsValue.types.length : 0;
    const rows = Array.isArray(inventoryMaterialsValue.rows) ? inventoryMaterialsValue.rows.length : 0;
    const cols = Array.isArray(inventoryMaterialsValue.columns) ? inventoryMaterialsValue.columns.length : 0;
    return Math.max(types, rows, cols, Object.keys(inventoryMaterialsValue).length);
  })();
  const tasks = Array.isArray(window.maintenanceTasksV2) ? window.maintenanceTasksV2 : [];
  const instances = Array.isArray(window.maintenanceCalendarInstancesV2) ? window.maintenanceCalendarInstancesV2 : [];
  const occurrences = Array.isArray(window.maintenanceOccurrencesV2) ? window.maintenanceOccurrencesV2 : [];
  const taskMap = new Map(tasks.filter(t => t && t.id != null).map(t => [String(t.id), t]));
  const instanceMap = new Map(instances.filter(i => i && i.id != null).map(i => [String(i.id), i]));
  const occurrenceEventsByRoot = new Map();
  const occurrenceLifecycleEventTypes = new Set(["completed","uncompleted","moved","removed","skipped","note_set","hours_set"]);
  const lifecycleEventTypes = new Set(["completed","uncompleted","scheduled","removed","skipped"]);
  const chainEventTypes = new Set(["repeat_started","stopped"]);
  const activeCompletedRoots = new Set();
  const orphanCompletedRoots = new Set();
  const finalLifecycleByRoot = new Map();
  const finalEventTypeByRoot = new Map();
  occurrences.forEach((event, idx) => {
    if (!event || typeof event !== "object" || detectMaintenanceRecordSystem(event) !== "v2") return;
    const rootOccurrenceId = String(event.rootOccurrenceId || "");
    const eventType = String(event.eventType || event.type || "").toLowerCase();
    const instanceId = String(event.instanceId || "");
    const taskId = String(event.taskId || (instanceMap.get(instanceId)?.taskId || "") || "");
    const isOccurrenceLevel = occurrenceLifecycleEventTypes.has(eventType);
    const isChainLevel = chainEventTypes.has(eventType);
    if (String(event.instanceMode || instanceMap.get(instanceId)?.instanceMode || "").toLowerCase() === "repeat"){
      if (isOccurrenceLevel && !rootOccurrenceId) push("errors", "repeat_missing_root", "Repeat V2 occurrence-level event is missing rootOccurrenceId", { idx, eventType });
      if (!instanceId) push("errors", "repeat_missing_instance", "Repeat V2 event is missing instanceId", { idx, rootOccurrenceId });
      if (!taskId) push("errors", "repeat_missing_task", "Repeat V2 event taskId cannot be resolved", { idx, rootOccurrenceId, instanceId });
    }
    if (isChainLevel && !rootOccurrenceId) return;
    if (!rootOccurrenceId) return;
    const list = occurrenceEventsByRoot.get(rootOccurrenceId) || [];
    list.push({ event, idx, eventType });
    occurrenceEventsByRoot.set(rootOccurrenceId, list);
  });
  occurrenceEventsByRoot.forEach((entries, rootOccurrenceId) => {
    const sorted = entries.slice().sort((a, b) => {
      const aTime = Date.parse(String(a.event?.recordedAtISO || ""));
      const bTime = Date.parse(String(b.event?.recordedAtISO || ""));
      const aValid = Number.isFinite(aTime);
      const bValid = Number.isFinite(bTime);
      if (aValid && bValid && aTime !== bTime) return aTime - bTime;
      if (aValid && !bValid) return -1;
      if (!aValid && bValid) return 1;
      return a.idx - b.idx;
    });
    if (!sorted.length) return;
    let finalLifecycleStatus = "scheduled";
    let hasOrderingSignal = false;
    sorted.forEach(({ eventType, event }) => {
      const hasRecordedAt = Number.isFinite(Date.parse(String(event?.recordedAtISO || "")));
      if (hasRecordedAt) hasOrderingSignal = true;
      if (!lifecycleEventTypes.has(eventType)) return;
      if (eventType === "completed") finalLifecycleStatus = "completed";
      else if (eventType === "uncompleted" || eventType === "scheduled") finalLifecycleStatus = "scheduled";
      else if (eventType === "removed") finalLifecycleStatus = "removed";
      else if (eventType === "skipped") finalLifecycleStatus = "skipped";
      if (eventType) finalEventTypeByRoot.set(rootOccurrenceId, eventType);
    });
    if (!hasOrderingSignal && sorted.length > 1){
      push("warnings", "event_order_ambiguous", "Root timeline has multiple events without recordedAtISO ordering signal; index fallback used", { rootOccurrenceId, eventCount: sorted.length });
    }
    finalLifecycleByRoot.set(rootOccurrenceId, finalLifecycleStatus);
    if (finalLifecycleStatus === "completed") activeCompletedRoots.add(rootOccurrenceId);
  });
  instances.forEach((instance, idx) => {
    if (!instance || typeof instance !== "object") return;
    if (String(instance.instanceMode || "").toLowerCase() !== "repeat") return;
    const repeatRule = instance.repeatRule && typeof instance.repeatRule === "object" ? instance.repeatRule : null;
    const basis = String(repeatRule?.basis || "");
    if (!repeatRule) push("errors", "repeat_missing_rule", "Repeat instance is missing repeatRule", { idx, instanceId: instance.id || null });
    if (!["machine_hours","calendar_day","calendar_week","calendar_month"].includes(basis)) push("errors", "repeat_invalid_basis", "Repeat basis is invalid", { idx, instanceId: instance.id || null, basis });
    const endType = String(repeatRule?.endType || repeatRule?.endMode || "").toLowerCase();
    if (endType === "after_count" && !(Number.isFinite(Number(repeatRule?.endCount)) && Number(repeatRule.endCount) > 0)) push("errors", "repeat_invalid_end_count", "after_count repeat rule requires valid endCount", { idx, instanceId: instance.id || null });
    if (repeatRule && repeatRule.rollingPreviewOnly === true) push("warnings", "rolling_preview_only", "Repeat rule uses rolling preview only", { idx, instanceId: instance.id || null });
    if (endType === "after_count" && repeatRule?.rollingRefill === true) push("warnings", "after_count_rolling_refill", "after_count should not use rolling refill", { idx, instanceId: instance.id || null });
    if (basis === "machine_hours" && !(Number.isFinite(Number(repeatRule?.intervalHours)) && Number(repeatRule.intervalHours) > 0)) push("errors", "machine_hours_missing_interval", "machine_hours repeat rule requires intervalHours", { idx, instanceId: instance.id || null });
    const task = taskMap.get(String(instance.taskId || ""));
    if (basis === "machine_hours" && String(task?.mode || "").toLowerCase() === "asreq") push("warnings", "asreq_machine_hours", "As Required task is using machine_hours basis", { idx, instanceId: instance.id || null, taskId: instance.taskId || null });
  });
  const compatibilityRows = typeof window.buildMaintenanceCompatibilityStream === "function" ? (Array.isArray(window.buildMaintenanceCompatibilityStream()) ? window.buildMaintenanceCompatibilityStream() : []) : [];
  const v2Rows = compatibilityRows.filter(row => row && String(row.sourceSystem || "").toLowerCase() === "v2");
  const completedV2Rows = v2Rows.filter(row => row.isCompleted === true && String(row.lifecycleStatus || row.status || "").toLowerCase() === "completed");
  const v2CalendarChips = Array.isArray(window.taskEvents)
    ? window.taskEvents.filter(chip => chip && String(chip.sourceSystem || "").toLowerCase() === "v2" && String(chip.lifecycleStatus || chip.status || "").toLowerCase() === "completed")
    : [];
  const tableRows = Array.isArray(window.costAnalysisDataCenter?.maintenanceDataTable) ? window.costAnalysisDataCenter.maintenanceDataTable : [];
  const v2TableRows = tableRows.filter(row => String(row?.sourceSystem || "").toLowerCase() === "v2");
  const seenCompletedRoots = new Set();
  completedV2Rows.forEach(row => {
    const root = String(row.rootOccurrenceId || "");
    if (!root) push("errors", "v2_row_missing_root", "V2 completed reporting row missing rootOccurrenceId", { streamId: row.streamId || null });
    if (!String(row.displayDateISO || row.dateISO || "").trim()) push("warnings", "v2_row_missing_display_date", "V2 completed reporting row missing displayDateISO", { rootOccurrenceId: root || null });
    if (root && seenCompletedRoots.has(root)) push("warnings", "duplicate_root_reporting", "Duplicate V2 completed rootOccurrenceId in reporting rows", { rootOccurrenceId: root });
    if (root) seenCompletedRoots.add(root);
  });
  activeCompletedRoots.forEach(root => {
    if (!seenCompletedRoots.has(root)) orphanCompletedRoots.add(root);
  });
  orphanCompletedRoots.forEach(root => push("warnings", "completed_not_in_reporting", "Completed V2 root missing from reporting stream", { rootOccurrenceId: root }));
  finalLifecycleByRoot.forEach((status, rootOccurrenceId) => {
    if (status !== "removed") return;
    const entries = occurrenceEventsByRoot.get(rootOccurrenceId) || [];
    const hasRemovedEvent = entries.some(item => String(item?.eventType || "").toLowerCase() === "removed");
    if (!hasRemovedEvent){
      push("warnings", "removed_event_missing", "Root resolved as removed but no explicit removed event record was found", { rootOccurrenceId });
    }
  });
  const repeatInstances = instances.filter(instance => instance && String(instance.instanceMode || "").toLowerCase() === "repeat");
  const oneTimeInstances = instances.filter(instance => instance && String(instance.instanceMode || "").toLowerCase() !== "repeat");
  const stoppedRepeatInstances = repeatInstances.filter(instance => String(instance?.status || "").toLowerCase() === "stopped");
  const activeRepeatInstances = repeatInstances.filter(instance => String(instance?.status || "").toLowerCase() !== "stopped");
  const projectedRepeatVisibleCount = null;
  const projectedMachineHourCount = null;
  const projectedCalendarRepeatCount = null;
  const completedHistoryChipCount = null;
  push("info", "event_records_explainer", "V2 event records are append-only saved history events. Future repeat calendar chips may be projections and may not increase this number until completed, moved, removed, noted, or edited.");
  push("info", "projection_counts_unavailable", "Projected repeat visible counts are null because this checker is read-only and does not depend on rendered calendar projection state.");
  result.counts = {
    maintenanceCalendarNewRecordsSystem: maintenancePreference,
    maintenanceCalendarV2PreferenceActive: v2PreferenceActive,
    tasksIntervalCount: Array.isArray(window.tasksInterval) ? window.tasksInterval.length : 0,
    tasksAsReqCount: Array.isArray(window.tasksAsReq) ? window.tasksAsReq.length : 0,
    inventoryCount: Array.isArray(window.inventory) ? window.inventory.length : 0,
    inventoryMaterialsCount,
    receiptTrackerWeeksCount: Array.isArray(window.receiptTrackerWeeks) ? window.receiptTrackerWeeks.length : 0,
    dailyCutHoursCount: Array.isArray(window.dailyCutHours) ? window.dailyCutHours.length : 0,
    cuttingJobsCount: Array.isArray(window.cuttingJobs) ? window.cuttingJobs.length : (window.cuttingJobs && typeof window.cuttingJobs === "object" ? Object.keys(window.cuttingJobs).length : 0),
    completedCuttingJobsCount: Array.isArray(window.completedCuttingJobs) ? window.completedCuttingJobs.length : 0,
    pumpEffPresent: !!(window.pumpEff && typeof window.pumpEff === "object"),
    pumpEffRpmLogsCount: Array.isArray(window.pumpEff?.rpmLogs) ? window.pumpEff.rpmLogs.length : 0,
    pumpEffDailyLogsCount: Array.isArray(window.pumpEff?.dailyLogs) ? window.pumpEff.dailyLogs.length : 0,
    suspiciousLegacyActiveCount,
    v2EventRecordsCount: occurrences.length,
    v2TasksCount: tasks.length,
    v2InstancesCount: instances.length,
    completedV2RootsCount: activeCompletedRoots.size,
    compatibilityV2CompletedRowsCount: completedV2Rows.length,
    centralV2RowsCount: v2TableRows.length,
    calendarV2CompletedChipsCount: v2CalendarChips.length,
    orphanCandidateCount: orphanCompletedRoots.size,
    repeatInstancesCount: repeatInstances.length,
    oneTimeInstancesCount: oneTimeInstances.length,
    activeRepeatInstancesCount: activeRepeatInstances.length,
    stoppedRepeatInstancesCount: stoppedRepeatInstances.length,
    projectedRepeatVisibleCount,
    projectedMachineHourCount,
    projectedCalendarRepeatCount,
    completedHistoryChipCount
  };
  if (!Array.isArray(window.completedCuttingJobs)) push("errors", "missing_completed_cutting_jobs", "completedCuttingJobs is missing or invalid");
  if (!(Array.isArray(window.cuttingJobs) || (window.cuttingJobs && typeof window.cuttingJobs === "object"))) push("errors", "invalid_cutting_jobs", "cuttingJobs is neither an array nor object");
  result.ok = result.errors.length === 0;
  if (window.DEBUG_MODE) console.debug("[maintenance-v2-safety-checks]", result);
  return result;
}
window.runMaintenanceV2SafetyChecks = runMaintenanceV2SafetyChecks;

function ensureJobCategories(){
  const folders = Array.isArray(window.jobFolders) ? window.jobFolders : defaultJobFolders();
  const rootId = folders.find(f => String(f.id) === JOB_ROOT_FOLDER_ID)
    ? JOB_ROOT_FOLDER_ID
    : (folders[0] ? String(folders[0].id) : JOB_ROOT_FOLDER_ID);
  const validIds = new Set(folders.map(f => String(f.id)));
  const normalize = (cat)=>{
    const key = cat != null ? String(cat) : rootId;
    return validIds.has(key) ? key : rootId;
  };
  cuttingJobs.forEach(job => {
    if (!job) return;
    job.cat = normalize(job.cat);
  });
  completedCuttingJobs.forEach(job => {
    if (!job) return;
    job.cat = normalize(job.cat);
  });
}

function ensureJobFolderState(){
  if (!Array.isArray(window.jobFolders)) window.jobFolders = defaultJobFolders();
  setJobFolders(window.jobFolders);
  return window.jobFolders;
}

function jobFolderChildren(parentId){
  const folders = ensureJobFolderState();
  const key = parentId == null ? null : String(parentId);
  return folders.filter(folder => {
    const parentKey = folder.parent == null ? null : String(folder.parent);
    return parentKey === key;
  });
}

function addJobFolder(name, parentId, color){
  const folders = ensureJobFolderState();
  const label = (name || "").trim();
  const parentKey = parentId != null ? String(parentId) : JOB_ROOT_FOLDER_ID;
  const fallbackParent = folders.some(folder => String(folder.id) === parentKey)
    ? parentKey
    : JOB_ROOT_FOLDER_ID;
  const orderBase = folders.reduce((max, folder)=>{
    const val = Number(folder?.order);
    return Number.isFinite(val) && val > max ? val : max;
  }, (typeof window._jobFolderOrderCounter === "number" && Number.isFinite(window._jobFolderOrderCounter)) ? window._jobFolderOrderCounter : 0);
  const id = genId(label || "category");
  const folder = {
    id,
    name: label,
    parent: fallbackParent === JOB_ROOT_FOLDER_ID ? JOB_ROOT_FOLDER_ID : fallbackParent,
    order: orderBase + 1
  };
  const normalizedColor = normalizeHexColor(color);
  if (normalizedColor) folder.color = normalizedColor;
  folders.push(folder);
  setJobFolders(folders);
  ensureJobCategories();
  return folder;
}

function renameJobFolder(id, name){
  if (id == null) return null;
  const folders = ensureJobFolderState();
  const key = String(id);
  const target = folders.find(folder => String(folder.id) === key);
  if (!target) return null;
  target.name = (name || "").trim();
  setJobFolders(folders);
  return target;
}

function setJobFolderColor(id, color){
  if (id == null) return false;
  const folders = ensureJobFolderState();
  const key = String(id);
  const target = folders.find(folder => String(folder.id) === key);
  if (!target) return false;
  const normalized = normalizeHexColor(color);
  const current = normalizeHexColor(target.color);
  if (normalized === current){
    if (!normalized && !target.color) return false;
    if (normalized && target.color === normalized) return false;
  }
  if (normalized){
    target.color = normalized;
  } else if (Object.prototype.hasOwnProperty.call(target, "color")){
    delete target.color;
  }
  setJobFolders(folders);
  return true;
}

function removeJobFolder(id){
  if (id == null) return false;
  const folders = ensureJobFolderState();
  const key = String(id);
  if (key === JOB_ROOT_FOLDER_ID) return false;
  const hasChildren = folders.some(folder => String(folder.parent ?? "") === key);
  if (hasChildren) return false;
  const remaining = folders.filter(folder => String(folder.id) !== key);
  if (remaining.length === folders.length) return false;
  window.jobFolders = remaining;
  setJobFolders(window.jobFolders);
  ensureJobCategories();
  return true;
}

function jobFolderHasJobs(id){
  const key = id != null ? String(id) : JOB_ROOT_FOLDER_ID;
  return cuttingJobs.some(job => String(job?.cat ?? "") === key)
    || completedCuttingJobs.some(job => String(job?.cat ?? "") === key);
}


function gcd(a,b){
  let x = Math.abs(Number(a) || 0);
  let y = Math.abs(Number(b) || 0);
  while (y){
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function formatThicknessSixteenths(parts){
  const n = Number(parts) || 0;
  if (n <= 0) return "0";
  const whole = Math.floor(n / 16);
  const rem = n % 16;
  if (!rem) return `${whole}`;
  const d = gcd(rem, 16);
  const top = rem / d;
  const bot = 16 / d;
  return whole ? `${whole} ${top}/${bot}` : `${top}/${bot}`;
}

function buildMaterialThicknessList(){
  const out = [];
  for (let i = 1; i <= 32; i++){
    out.push({ key: `t_${i}`, sixteenths: i, label: formatThicknessSixteenths(i) + '"' });
  }
  return out;
}

function defaultInventoryMaterials(){
  const thicknesses = buildMaterialThicknessList();
  const makeSheet = ()=>({
    columns: ["QTY 4x8", "QTY 4x10", "QTY 5x10", "QTY 5x12"],
    rows: thicknesses.map(t => ({
      thickness: (t.sixteenths / 16).toFixed(4).replace(/0+$/, "").replace(/\.$/, ""),
      values: ["", "", "", ""]
    }))
  });
  return {
    activeType: "aluminum",
    types: [
      { id: "aluminum", name: "Aluminum" },
      { id: "steel", name: "Steel" },
      { id: "stainless_steel", name: "Stainless Steel" }
    ],
    sheets: {
      aluminum: makeSheet(),
      steel: makeSheet(),
      stainless_steel: makeSheet()
    }
  };
}

function normalizeInventoryMaterials(raw){
  const base = defaultInventoryMaterials();
  const data = raw && typeof raw === "object" ? raw : {};
  const typesRaw = Array.isArray(data.types) ? data.types : base.types;
  const used = new Set();
  const types = typesRaw
    .filter(Boolean)
    .map((entry, idx) => {
      let id = String(entry.id || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      if (!id) id = `material_${idx+1}`;
      while (used.has(id)) id = `${id}_${idx+1}`;
      used.add(id);
      return { id, name: String(entry.name || id).trim() || id };
    });

  const sheetsRaw = data.sheets && typeof data.sheets === "object" ? data.sheets : {};
  const legacyRowsRaw = data.rows && typeof data.rows === "object" ? data.rows : {};
  const sheets = {};
  const formatQtyHeading = (raw)=>{
    const txt = String(raw || "").trim();
    if (!txt) return "QTY 4x8";
    const body = txt.replace(/^qty\s*/i, "").trim();
    return `QTY ${body || "4x8"}`;
  };

  types.forEach(type => {
    const rawSheet = sheetsRaw[type.id] && typeof sheetsRaw[type.id] === "object" ? sheetsRaw[type.id] : null;
    let columns = Array.isArray(rawSheet?.columns)
      ? rawSheet.columns.map(c => formatQtyHeading(c)).slice(0, 24)
      : [];
    let rows = Array.isArray(rawSheet?.rows)
      ? rawSheet.rows.map(row => {
        const values = Array.isArray(row?.values) ? row.values.map(v => String(v ?? "")) : [];
        return {
          thickness: String(row?.thickness || ""),
          values
        };
      })
      : [];

    if (!columns.length || !rows.length){
      const baseSheet = base.sheets[type.id] || base.sheets.aluminum;
      columns = Array.isArray(baseSheet?.columns) ? baseSheet.columns.slice() : ["qty"];
      columns = columns.map(c => formatQtyHeading(c));
      rows = Array.isArray(baseSheet?.rows)
        ? baseSheet.rows.map(r => ({ thickness: String(r.thickness || ""), values: Array.isArray(r.values) ? r.values.map(v => String(v ?? "")) : [] }))
        : [];
    }

    const legacyType = legacyRowsRaw[type.id] && typeof legacyRowsRaw[type.id] === "object" ? legacyRowsRaw[type.id] : null;
    if (legacyType && (!rawSheet || !Array.isArray(rawSheet.rows) || !rawSheet.rows.length)){
      const allSizes = [];
      Object.values(legacyType).forEach(pairs => {
        if (!Array.isArray(pairs)) return;
        pairs.forEach(pair => {
          const size = String(pair?.size || "").trim();
          if (size && !allSizes.includes(size)) allSizes.push(size);
        });
      });
      if (allSizes.length) columns = allSizes.map(size => `qty ${size}`);
      rows = Object.entries(legacyType).map(([key, pairs]) => {
        const six = Number(String(key).replace(/^t_/, ""));
        const thickness = Number.isFinite(six) && six > 0 ? (six / 16).toFixed(4).replace(/0+$/, "").replace(/\.$/, "") : String(key || "");
        const values = columns.map(col => {
          const size = String(col || "").replace(/^qty\s*/i, "").trim();
          const hit = Array.isArray(pairs) ? pairs.find(pair => String(pair?.size || "").trim() === size) : null;
          return String(hit?.amount ?? "");
        });
        return { thickness, values };
      });
    }

    columns = columns.length ? columns : ["qty"];
    rows = rows.length ? rows : [{ thickness: "", values: columns.map(() => "") }];
    rows = rows.map(row => ({
      thickness: String(row.thickness || ""),
      values: columns.map((_, idx) => String(Array.isArray(row.values) ? (row.values[idx] ?? "") : ""))
    }));
    rows = rows.filter(row => String(row.thickness || "").trim() !== "");
    if (!rows.length){
      rows = [{ thickness: "0.0625", values: columns.map(() => "") }];
    }
    const parseThicknessValue = (raw)=>{
      const txt = String(raw || "").replace(/"/g, "").trim();
      if (!txt) return Number.POSITIVE_INFINITY;
      const mixed = txt.match(/^(\d+)\s+(\d+)\/(\d+)$/);
      if (mixed){
        const whole = Number(mixed[1]);
        const top = Number(mixed[2]);
        const bot = Number(mixed[3]);
        if (Number.isFinite(whole) && Number.isFinite(top) && Number.isFinite(bot) && bot > 0) return whole + (top / bot);
      }
      const frac = txt.match(/^(\d+)\/(\d+)$/);
      if (frac){
        const top = Number(frac[1]);
        const bot = Number(frac[2]);
        if (Number.isFinite(top) && Number.isFinite(bot) && bot > 0) return top / bot;
      }
      const num = Number(txt);
      return Number.isFinite(num) ? num : Number.POSITIVE_INFINITY;
    };
    if (!rows.some(row => Math.abs(parseThicknessValue(row.thickness) - 0.0625) < 1e-6)){
      rows.push({ thickness: "0.0625", values: columns.map(() => "") });
    }
    rows.sort((a,b)=> parseThicknessValue(a.thickness) - parseThicknessValue(b.thickness));

    sheets[type.id] = { columns, rows };
  });

  let sharedColumns = [];
  if (types.length){
    const firstId = String(types[0].id);
    const firstCols = Array.isArray(sheets[firstId]?.columns) ? sheets[firstId].columns : [];
    sharedColumns = firstCols.length ? firstCols.map(formatQtyHeading) : ["QTY 4x8"];
  }
  if (!sharedColumns.length) sharedColumns = ["QTY 4x8"];
  types.forEach(type => {
    const sheet = sheets[type.id];
    if (!sheet) return;
    sheet.columns = sharedColumns.slice();
    if (!Array.isArray(sheet.rows) || !sheet.rows.length){
      sheet.rows = [{ thickness: "0.0625", values: sharedColumns.map(() => "") }];
    }
    sheet.rows.forEach(row => {
      if (!Array.isArray(row.values)) row.values = [];
      while (row.values.length < sharedColumns.length) row.values.push("");
      if (row.values.length > sharedColumns.length) row.values = row.values.slice(0, sharedColumns.length);
    });
  });

  const activeCandidate = String(data.activeType || base.activeType || (types[0] && types[0].id) || '');
  const activeType = activeCandidate === "__all" || types.some(t => t.id === activeCandidate)
    ? activeCandidate
    : (types[0] ? types[0].id : '');

  return { activeType, types, sheets };
}

function normalizeInventoryItem(raw){
  if (!raw || typeof raw !== "object") return null;
  const item = { ...raw };
  const newVal = Number(item.qtyNew);
  const oldVal = Number(item.qtyOld);
  const legacyVal = Number(item.qty);
  let qtyNew = Number.isFinite(newVal) && newVal >= 0 ? newVal : null;
  let qtyOld = Number.isFinite(oldVal) && oldVal >= 0 ? oldVal : null;
  if (qtyNew == null){
    qtyNew = Number.isFinite(legacyVal) && legacyVal >= 0 ? legacyVal : 0;
  }
  if (qtyOld == null){
    qtyOld = 0;
  }
  item.qtyNew = qtyNew;
  item.qtyOld = qtyOld;
  item.qty = qtyNew + qtyOld;
  if (!item.unit){ item.unit = "pcs"; }
  return item;
}


function ensureInventoryForAllMaintenanceTasks(){
  if (!Array.isArray(inventory)) inventory = [];
  const lists = [Array.isArray(tasksInterval) ? tasksInterval : [], Array.isArray(tasksAsReq) ? tasksAsReq : []];
  let changed = false;
  lists.forEach(list => {
    list.forEach(task => {
      if (!task || typeof task !== "object") return;
      const taskId = task.id != null ? String(task.id) : "";
      if (!taskId) return;
      let linked = null;
      const invId = task.inventoryId != null ? String(task.inventoryId) : "";
      if (invId){
        linked = inventory.find(item => item && String(item.id) === invId) || null;
      }
      if (!linked){
        linked = inventory.find(item => item && String(item.linkedTaskId || "") === taskId) || null;
      }
      if (!linked){
        linked = normalizeInventoryItem({
          id: genId("inventory"),
          name: task.name || "Maintenance part",
          qtyNew: 0,
          qtyOld: 0,
          unit: "pcs",
          note: task.condition || "",
          pn: task.pn || "",
          link: task.storeLink || "",
          price: task.price != null ? Number(task.price) : null,
          linkedTaskId: taskId,
          folderId: null
        });
        if (linked){
          inventory.unshift(linked);
          changed = true;
        }
      }
      if (!linked) return;
      if (String(task.inventoryId || "") !== String(linked.id)){
        task.inventoryId = linked.id;
        changed = true;
      }
      if (String(linked.linkedTaskId || "") !== taskId){
        linked.linkedTaskId = taskId;
        changed = true;
      }
    });
  });
  window.inventory = inventory;
  return changed;
}

function normalizeDailyCutHours(list){
  const map = new Map();
  if (Array.isArray(list)){
    list.forEach(raw => {
      if (!raw || typeof raw !== "object") return;
      const key = normalizeDateISO(raw.dateISO || raw.date || raw.dateIso);
      if (!key) return;
      const hours = clampDailyCutHours(raw.hours);
      const source = raw.source === "manual" ? "manual" : "auto";
      const updatedAt = typeof raw.updatedAtISO === "string"
        ? raw.updatedAtISO
        : (typeof raw.updatedAt === "string" ? raw.updatedAt : null);
      const existing = map.get(key);
      if (!existing){
        map.set(key, {
          dateISO: key,
          hours,
          source,
          updatedAtISO: updatedAt || null
        });
        return;
      }
      if (existing.source === "manual" && source !== "manual"){
        if (updatedAt && (!existing.updatedAtISO || existing.updatedAtISO < updatedAt)){
          existing.updatedAtISO = updatedAt;
        }
        return;
      }
      if (source === "manual" && existing.source !== "manual"){
        existing.source = "manual";
      }
      existing.hours = hours;
      if (updatedAt && (!existing.updatedAtISO || existing.updatedAtISO < updatedAt)){
        existing.updatedAtISO = updatedAt;
      }
    });
  }
  const normalized = Array.from(map.values());
  normalized.sort((a, b)=> a.dateISO.localeCompare(b.dateISO));
  return normalized;
}

function getDailyCutHoursEntry(dateISO){
  const key = normalizeDateISO(dateISO);
  if (!key || !Array.isArray(dailyCutHours)) return null;
  return dailyCutHours.find(entry => entry && entry.dateISO === key) || null;
}

function setDailyCutHoursEntry(dateISO, hours, { source = "manual", preserveManual = false } = {}){
  const key = normalizeDateISO(dateISO);
  if (!key) return false;
  if (!Array.isArray(dailyCutHours)){
    dailyCutHours = [];
    if (typeof window !== "undefined") window.dailyCutHours = dailyCutHours;
  }
  const value = clampDailyCutHours(hours);
  const src = source === "manual" ? "manual" : "auto";
  const idx = dailyCutHours.findIndex(entry => entry && entry.dateISO === key);
  const nowISO = new Date().toISOString();
  if (idx >= 0){
    const existing = dailyCutHours[idx] || {};
    if (preserveManual && existing.source === "manual" && src !== "manual"){
      return false;
    }
    const nextSource = (src === "manual")
      ? "manual"
      : (existing.source === "manual" && src !== "manual" && preserveManual)
        ? existing.source
        : (existing.source === "manual" && src !== "manual" ? existing.source : src);
    if (existing.hours === value && existing.source === nextSource){
      existing.updatedAtISO = existing.updatedAtISO || nowISO;
      return false;
    }
    dailyCutHours[idx] = {
      dateISO: key,
      hours: value,
      source: nextSource,
      updatedAtISO: nowISO
    };
  }else{
    dailyCutHours.push({
      dateISO: key,
      hours: value,
      source: src,
      updatedAtISO: nowISO
    });
  }
  dailyCutHours.sort((a, b)=> a.dateISO.localeCompare(b.dateISO));
  if (typeof window !== "undefined") window.dailyCutHours = dailyCutHours;
  return true;
}

function adoptState(doc){
  if (typeof window !== "undefined"){
    window.__opportunityStateReady = false;
  }
  const data = doc || {};

  // Core lists (fallback to defaults if empty/missing)
  totalHistory = Array.isArray(data.totalHistory) ? data.totalHistory : [];
  tasksInterval = (Array.isArray(data.tasksInterval) && data.tasksInterval.length)
    ? data.tasksInterval
    : defaultIntervalTasks.slice();
  tasksAsReq = (Array.isArray(data.tasksAsReq) && data.tasksAsReq.length)
    ? data.tasksAsReq
    : defaultAsReqTasks.slice();
  inventory = Array.isArray(data.inventory)
    ? data.inventory.map(normalizeInventoryItem).filter(Boolean)
    : seedInventoryFromTasks();
  window.inventoryFolders = Array.isArray(data.inventoryFolders)
    ? data.inventoryFolders.filter(folder => folder && folder.id != null).map(folder => ({
      ...folder,
      id: String(folder.id),
      parent: folder.parent != null ? String(folder.parent) : null,
      name: String(folder.name || "Folder")
    }))
    : (Array.isArray(window.inventoryFolders) ? window.inventoryFolders : []);
  ensureInventoryForAllMaintenanceTasks();
  window.inventoryMaterials = normalizeInventoryMaterials(data.inventoryMaterials);
  window.inventoryTransactions = Array.isArray(data.inventoryTransactions)
    ? data.inventoryTransactions.map(entry => (entry && typeof entry === "object" ? { ...entry } : entry))
    : (Array.isArray(window.inventoryTransactions) ? window.inventoryTransactions : []);
  window.inventorySection = String(data.inventorySection || window.inventorySection || "items") === "material" ? "material" : "items";
  cuttingJobs = Array.isArray(data.cuttingJobs) ? data.cuttingJobs : [];
  completedCuttingJobs = Array.isArray(data.completedCuttingJobs) ? data.completedCuttingJobs : [];
  orderRequests = normalizeOrderRequests(Array.isArray(data.orderRequests) ? data.orderRequests : []);
  if (!orderRequests.some(req => req && req.status === "draft")){
    orderRequests.push(createOrderRequest());
  }
  garnetCleanings = Array.isArray(data.garnetCleanings) ? data.garnetCleanings : [];
  dailyCutHours = normalizeDailyCutHours(Array.isArray(data.dailyCutHours) ? data.dailyCutHours : []);
  opportunityRollups = Array.isArray(data.opportunityRollups) ? data.opportunityRollups : [];
  weeklyCostReports = Array.isArray(data.weeklyCostReports) ? data.weeklyCostReports.map(entry => ({ ...entry })) : [];
  receiptTrackerWeeks = Array.isArray(data.receiptTrackerWeeks) ? data.receiptTrackerWeeks.map(entry => ({ ...entry })) : [];
  maintenanceTasksV2 = Array.isArray(data.maintenanceTasksV2) ? data.maintenanceTasksV2.map(entry => ({ ...entry })) : [];
  maintenanceCalendarInstancesV2 = Array.isArray(data.maintenanceCalendarInstancesV2) ? data.maintenanceCalendarInstancesV2.map(entry => ({ ...entry })) : [];
  maintenanceOccurrencesV2 = Array.isArray(data.maintenanceOccurrencesV2) ? data.maintenanceOccurrencesV2.map(entry => ({ ...entry })) : [];
  if (data.cuttingJobDatabase && typeof data.cuttingJobDatabase === "object"){
    window.cuttingJobDatabase = cloneStructured(data.cuttingJobDatabase) || {};
  } else if (!window.cuttingJobDatabase || typeof window.cuttingJobDatabase !== "object"){
    window.cuttingJobDatabase = {};
  }
  window.syncProcessLog = Array.isArray(data.syncProcessLog)
    ? data.syncProcessLog.slice(0,100).map(entry => ({ ...entry }))
    : (Array.isArray(window.syncProcessLog) ? window.syncProcessLog.slice(0,100) : []);

  window.totalHistory = totalHistory;
  window.tasksInterval = tasksInterval;
  window.tasksAsReq = tasksAsReq;
  window.inventory = inventory;
  window.cuttingJobs = cuttingJobs;
  window.completedCuttingJobs = completedCuttingJobs;
  window.orderRequests = orderRequests;
  window.garnetCleanings = garnetCleanings;
  window.dailyCutHours = dailyCutHours;
  window.opportunityRollups = opportunityRollups;
  window.weeklyCostReports = weeklyCostReports;
  window.receiptTrackerWeeks = receiptTrackerWeeks;
  window.maintenanceTasksV2 = maintenanceTasksV2;
  window.maintenanceCalendarInstancesV2 = maintenanceCalendarInstancesV2;
  window.maintenanceOccurrencesV2 = maintenanceOccurrencesV2;
  deletedItems = normalizeDeletedItems(Array.isArray(data.deletedItems) ? data.deletedItems : deletedItems);
  window.deletedItems = deletedItems;
  purgeExpiredDeletedItems();
  if (!Array.isArray(window.pendingNewJobFiles)) window.pendingNewJobFiles = [];
  window.pendingNewJobFiles.length = 0;

  if (data.oneDriveJobConfig && typeof data.oneDriveJobConfig === "object"){
    window.oneDriveJobConfig = { ...data.oneDriveJobConfig };
    try {
      if (window.localStorage){
        window.localStorage.setItem("cutting_job_onedrive_config_v1", JSON.stringify(window.oneDriveJobConfig));
      }
    } catch (err){
      console.warn("Unable to persist OneDrive job config locally", err);
    }
  }
  if (typeof data.orderRequestTab === "string"){
    orderRequestTab = data.orderRequestTab;
    window.orderRequestTab = orderRequestTab;
  }
  if (typeof window.orderRequestTab !== "string" || !window.orderRequestTab){
    window.orderRequestTab = orderRequestTab || "active";
  }
  orderRequestTab = window.orderRequestTab;

  if (window.DEBUG_MODE){
    console.info("V2 maintenance storage ready", {
      tasks: Array.isArray(window.maintenanceTasksV2) ? window.maintenanceTasksV2.length : 0,
      instances: Array.isArray(window.maintenanceCalendarInstancesV2) ? window.maintenanceCalendarInstancesV2.length : 0,
      occurrences: Array.isArray(window.maintenanceOccurrencesV2) ? window.maintenanceOccurrencesV2.length : 0
    });
  }

  const rawFolders = Array.isArray(data.settingsFolders)
    ? data.settingsFolders
    : (Array.isArray(data.folders) ? data.folders : null);
  setSettingsFolders(rawFolders);

  const rawJobFolders = Array.isArray(data.jobFolders)
    ? data.jobFolders
    : null;
  setJobFolders(rawJobFolders);
  jobFolders = window.jobFolders;

  const docDashboardLayout = (data.dashboardLayout && typeof data.dashboardLayout === "object")
    ? data.dashboardLayout
    : {};
  const docCostLayout = (data.costLayout && typeof data.costLayout === "object")
    ? data.costLayout
    : {};
  const docJobLayout = (data.jobLayout && typeof data.jobLayout === "object")
    ? data.jobLayout
    : {};

  if (typeof window !== "undefined"){
    window.cloudDashboardLayout = cloneStructured(docDashboardLayout) || {};
    window.cloudDashboardLayoutLoaded = true;
    window.cloudCostLayout = cloneStructured(docCostLayout) || {};
    window.cloudCostLayoutLoaded = true;
    window.cloudJobLayout = cloneStructured(docJobLayout) || {};
    window.cloudJobLayoutLoaded = true;
  }

  try {
    if (typeof window.localStorage !== "undefined" && window.localStorage){
      const storage = window.localStorage;
      const dashKeys = Object.keys(window.cloudDashboardLayout || {});
      if (dashKeys.length){
        storage.setItem("dashboard_layout_windows_v1", JSON.stringify(window.cloudDashboardLayout));
      } else {
        storage.removeItem("dashboard_layout_windows_v1");
      }
      const costKeys = Object.keys(window.cloudCostLayout || {});
      if (costKeys.length){
        storage.setItem("cost_layout_windows_v1", JSON.stringify(window.cloudCostLayout));
      } else {
        storage.removeItem("cost_layout_windows_v1");
      }
      const jobKeys = Object.keys(window.cloudJobLayout || {});
      if (jobKeys.length){
        storage.setItem("job_layout_windows_v1", JSON.stringify(window.cloudJobLayout));
      } else {
        storage.removeItem("job_layout_windows_v1");
      }
    }
  } catch (err) {
    console.warn("Unable to sync layout storage from cloud", err);
  }

  const dashState = (typeof window !== "undefined") ? window.dashboardLayoutState : null;
  if (dashState && typeof dashState === "object"){
    dashState.layoutById = cloneStructured(window.cloudDashboardLayout) || {};
    const hasLayout = dashState.layoutById && Object.keys(dashState.layoutById).length > 0;
    dashState.layoutStored = hasLayout;
    if (dashState.root && dashState.root.classList){
      dashState.root.classList.toggle("has-custom-layout", hasLayout);
      if (typeof applyDashboardLayout === "function"){
        try { applyDashboardLayout(dashState); } catch (err) { console.warn("Failed to apply dashboard layout", err); }
      }
      if (typeof updateDashboardEditUi === "function"){
        try { updateDashboardEditUi(dashState); } catch (err) { console.warn("Failed to update dashboard layout UI", err); }
      }
    }
  }

  const costState = (typeof window !== "undefined") ? window.costLayoutState : null;
  if (costState && typeof costState === "object"){
    costState.layoutById = cloneStructured(window.cloudCostLayout) || {};
    const hasLayout = costState.layoutById && Object.keys(costState.layoutById).length > 0;
    costState.layoutStored = hasLayout;
    if (costState.root && costState.root.classList){
      costState.root.classList.toggle("has-custom-layout", hasLayout);
      if (typeof applyCostLayout === "function"){
        try { applyCostLayout(costState); } catch (err) { console.warn("Failed to apply cost layout", err); }
      }
      if (typeof updateCostEditUi === "function"){
        try { updateCostEditUi(costState); } catch (err) { console.warn("Failed to update cost layout UI", err); }
      }
    }
  }

  const jobState = (typeof window !== "undefined") ? window.jobLayoutState : null;
  if (jobState && typeof jobState === "object"){
    jobState.layoutById = cloneStructured(window.cloudJobLayout) || {};
    const hasLayout = jobState.layoutById && Object.keys(jobState.layoutById).length > 0;
    jobState.layoutStored = hasLayout;
    if (jobState.root && jobState.root.classList){
      jobState.root.classList.toggle("has-custom-layout", hasLayout);
      if (typeof applyJobLayout === "function"){
        try { applyJobLayout(jobState); } catch (err) { console.warn("Failed to apply jobs layout", err); }
      }
      if (typeof updateJobEditUi === "function"){
        try { updateJobEditUi(jobState); } catch (err) { console.warn("Failed to update jobs layout UI", err); }
      }
    }
  }

  if (typeof window._maintOrderCounter !== "number" || !Number.isFinite(window._maintOrderCounter)){
    window._maintOrderCounter = 0;
  }
  let maxOrder = window._maintOrderCounter;
  for (const list of [tasksInterval, tasksAsReq]){
    if (!Array.isArray(list)) continue;
    for (const task of list){
      ensureTaskVariant(task, task && task.mode);
      const val = Number(task && task.order);
      if (Number.isFinite(val) && val > maxOrder) maxOrder = val;
    }
  }
  for (const folder of window.settingsFolders){
    const val = Number(folder && folder.order);
    if (Number.isFinite(val) && val > maxOrder) maxOrder = val;
  }
  window._maintOrderCounter = maxOrder;

  // Pump efficiency (guard against reading an undefined identifier)
  const pe = (typeof window.pumpEff === "object" && window.pumpEff)
    ? window.pumpEff
    : (window.pumpEff = { baselineRPM:null, baselineDateISO:null, entries:[], notes:[] });
  if (!Array.isArray(pe.entries)) pe.entries = [];
  if (!Array.isArray(pe.notes)) pe.notes = [];

  if (data.pumpEff && typeof data.pumpEff === "object"){
    pe.baselineRPM     = (data.pumpEff.baselineRPM ?? pe.baselineRPM);
    pe.baselineDateISO = (data.pumpEff.baselineDateISO ?? pe.baselineDateISO);
    pe.entries         = Array.isArray(data.pumpEff.entries) ? data.pumpEff.entries.slice() : pe.entries;
    pe.notes           = Array.isArray(data.pumpEff.notes) ? data.pumpEff.notes.slice() : pe.notes;
  }

  ensureTaskCategories();
  ensureJobCategories();
  syncRenderTotalsFromHistory();

  if (typeof window !== "undefined"){
    window.__opportunityStateReady = true;
    try {
      if (typeof window.CustomEvent === "function"){
        window.dispatchEvent(new CustomEvent("opportunity:data-ready", {
          detail: { timestamp: Date.now() }
        }));
      } else if (window.document && typeof window.document.createEvent === "function"){
        const evt = window.document.createEvent("CustomEvent");
        evt.initCustomEvent("opportunity:data-ready", false, false, { timestamp: Date.now() });
        window.dispatchEvent(evt);
      }
    } catch (err) {
      console.warn("Failed to dispatch opportunity readiness event", err);
    }
  }

  if (typeof window.scheduleOpportunityRecompute === "function"){
    try {
      window.scheduleOpportunityRecompute();
    } catch (err) {
      console.warn("Failed to schedule opportunity recompute", err);
    }
  }
}


const saveCloudInternal = debounce(async ()=>{
  const explicitTrace = (typeof window !== "undefined" && window.__activeExplicitMaintenanceAddSaveTrace && typeof window.__activeExplicitMaintenanceAddSaveTrace === "object")
    ? window.__activeExplicitMaintenanceAddSaveTrace
    : null;
  if (explicitTrace){
    explicitTrace.saveCloudInternalEntered = true;
    explicitTrace.hasPendingLocalChangesBeforeInternal = Boolean(hasPendingLocalChanges);
    explicitTrace.firebasePath = FB.docRef?.path || "";
    explicitTrace.workspaceDocPath = FB.workspaceDoc?.path || "";
    explicitTrace.projectId = FB.app?.options?.projectId || window.FIREBASE_CONFIG?.projectId || "";
    explicitTrace.clientId = typeof getCloudSyncClientId === "function" ? getCloudSyncClientId() : "";
    explicitTrace.loadedRevBeforeSave = Number(window.__loadedCloudRevisionForSaveGuard || 0);
  }
  if (!FB.ready || !FB.docRef){
    if (explicitTrace){
      explicitTrace.saveCloudInternalReturnValue = "firebase_not_ready";
      explicitTrace.saveCloudInternalReturnType = "early_return";
    }
    return;
  }
  const canWrite = canWriteCloud("saveCloudInternal");
  if (explicitTrace) explicitTrace.canWriteCloudPassed = Boolean(canWrite);
  if (!canWrite){
    if (explicitTrace){
      explicitTrace.saveCloudInternalReturnValue = "can_write_cloud_blocked";
      explicitTrace.saveCloudInternalReturnType = "early_return";
      explicitTrace.hasPendingLocalChangesAfterInternal = Boolean(hasPendingLocalChanges);
    }
    return;
  }
  try{
    const rawSnap = snapshotState();
    if (explicitTrace){
      const rawInstances = Array.isArray(rawSnap?.maintenanceCalendarInstancesV2) ? rawSnap.maintenanceCalendarInstancesV2 : [];
      const rawOccurrences = Array.isArray(rawSnap?.maintenanceOccurrencesV2) ? rawSnap.maintenanceOccurrencesV2 : [];
      explicitTrace.snapshotInstancesCountInsideSave = rawInstances.length;
      explicitTrace.snapshotOccurrencesCountInsideSave = rawOccurrences.length;
      explicitTrace.snapshotInstanceFoundInsideSave = rawInstances.some(entry => entry && String(entry.id || "") === String(explicitTrace.instanceId || ""));
      explicitTrace.snapshotOccurrenceFoundInsideSave = rawOccurrences.some(entry => entry && String(entry.id || "") === String(explicitTrace.occurrenceId || ""));
    }
    const snap = compactStateForStorage(rawSnap);
    if (explicitTrace){
      const compactedInstances = Array.isArray(snap?.maintenanceCalendarInstancesV2) ? snap.maintenanceCalendarInstancesV2 : [];
      const compactedOccurrences = Array.isArray(snap?.maintenanceOccurrencesV2) ? snap.maintenanceOccurrencesV2 : [];
      explicitTrace.compactedInstancesCountInsideSave = compactedInstances.length;
      explicitTrace.compactedOccurrencesCountInsideSave = compactedOccurrences.length;
      explicitTrace.compactedInstanceFoundInsideSave = compactedInstances.some(entry => entry && String(entry.id || "") === String(explicitTrace.instanceId || ""));
      explicitTrace.compactedOccurrenceFoundInsideSave = compactedOccurrences.some(entry => entry && String(entry.id || "") === String(explicitTrace.occurrenceId || ""));
    }
    const pendingMetrics = logMaintenanceHistoryDiagnostics("before-save", snap);
    const baselineMetrics = collectMaintenanceHistoryMetrics(window.__lastLoadedCloudState || {});
    const pendingCore = logCoreBusinessDiagnostics("before-save", snap);
    const baselineCore = collectCoreBusinessMetrics(window.__lastLoadedCloudState || {});
    if ((pendingMetrics.completedDatesCount + pendingMetrics.manualHistoryCount + pendingMetrics.maintenanceOccurrencesV2Count + 10) < (baselineMetrics.completedDatesCount + baselineMetrics.manualHistoryCount + baselineMetrics.maintenanceOccurrencesV2Count)){
      if (explicitTrace){
        explicitTrace.maintenanceHistoryReductionBlocked = true;
        explicitTrace.saveCloudInternalReturnValue = "maintenance_history_reduction_blocked";
        explicitTrace.saveCloudInternalReturnType = "early_return";
        explicitTrace.hasPendingLocalChangesAfterInternal = Boolean(hasPendingLocalChanges);
      }
      console.error("Cloud save blocked: maintenance completion history would be reduced unexpectedly.", { pendingMetrics, baselineMetrics });
      return;
    }
    if (pendingCore.inventoryCount + 5 < baselineCore.inventoryCount || pendingCore.orderRequestsCount + 2 < baselineCore.orderRequestsCount || pendingCore.orderLineItemCount + 5 < baselineCore.orderLineItemCount || pendingCore.settingsFoldersCount + 1 < baselineCore.settingsFoldersCount || pendingCore.toleranceFieldCount + 1 < baselineCore.toleranceFieldCount || (!pendingCore.layoutPresent && baselineCore.layoutPresent)){
      if (explicitTrace){
        explicitTrace.coreBusinessReductionBlocked = true;
        explicitTrace.saveCloudInternalReturnValue = "core_business_reduction_blocked";
        explicitTrace.saveCloudInternalReturnType = "early_return";
        explicitTrace.hasPendingLocalChangesAfterInternal = Boolean(hasPendingLocalChanges);
      }
      console.error("Cloud save blocked: core business data would be reduced unexpectedly.", { pendingCore, baselineCore });
      return;
    }
    const sizeBytes = estimatePayloadBytes(snap);
    if (sizeBytes >= FIRESTORE_WARN_BYTES){
      console.warn("Cloud state size warning", { sizeBytes, warnAt: FIRESTORE_WARN_BYTES, strongWarnAt: FIRESTORE_STRONG_WARN_BYTES, blockAt: FIRESTORE_BLOCK_BYTES });
      logStateSizeDiagnostics(snap, "before-save");
      if (sizeBytes >= FIRESTORE_STRONG_WARN_BYTES) console.error("Cloud state size strong warning", { sizeBytes, strongWarnAt: FIRESTORE_STRONG_WARN_BYTES });
    }
    if (sizeBytes >= FIRESTORE_BLOCK_BYTES){
      if (explicitTrace){
        explicitTrace.payloadSizeBlocked = true;
        explicitTrace.saveCloudInternalReturnValue = "payload_size_blocked";
        explicitTrace.saveCloudInternalReturnType = "early_return";
        explicitTrace.hasPendingLocalChangesAfterInternal = true;
      }
      console.error("Cloud save blocked: state payload too large", { sizeBytes, blockAt: FIRESTORE_BLOCK_BYTES });
      logStateSizeDiagnostics(snap, "blocked-save");
      hasPendingLocalChanges = true;
      persistLocalStateBackup(snap);
      return;
    }
    try {
      recordDataFlowEvent("cloud_save", snap);
    } catch (err) {
      console.warn("Failed to record save flow event", err);
    }
    window.__lastSnapshot = snap;
    const remoteSnap = await FB.docRef.get();
    const remoteData = remoteSnap && remoteSnap.exists ? (typeof remoteSnap.data === "function" ? remoteSnap.data() : remoteSnap.data) : null;
    const localBackupForPreflight = readLocalStateBackup();
    const revisionConflict = remoteData && typeof remoteData === "object"
      ? detectRemoteRevisionConflict(remoteData)
      : { blocked:false };
    if (explicitTrace){
      explicitTrace.revisionConflictBlocked = Boolean(revisionConflict?.blocked);
      explicitTrace.remoteRevBeforeSave = Number(revisionConflict?.remoteRev || 0);
      explicitTrace.remoteUpdatedBy = revisionConflict?.remoteUpdatedBy || "";
      explicitTrace.sameClientRemoteRevision = Boolean(revisionConflict?.sameClientRemoteRevision);
    }
    const allowFirstRunPreflight = Boolean(remoteSnap && !remoteSnap.exists)
      && !stateHasMeaningfulData(window.__lastLoadedCloudState || {})
      && !stateHasMeaningfulData(localBackupForPreflight || {});
    const saveSchemaCoverage = getSaveSchemaCoverageReport({ pendingSnapshot: snap });
    const registryPreflight = validateProtectedSavePreflight({
      baselineState: window.__lastLoadedCloudState || null,
      pendingState: snap,
      latestRemoteState: remoteData,
      localBackupState: localBackupForPreflight,
      windowState: buildWindowProtectedStateForCoverage(),
      coverageReport: saveSchemaCoverage,
      reason: "saveCloudInternal",
      revisionConflict,
      allowFirstRun: allowFirstRunPreflight
    });
    if (registryPreflight.blocked){
      if (explicitTrace){
        explicitTrace.protectedPreflightBlocked = true;
        explicitTrace.saveCloudInternalReturnValue = "protected_preflight_blocked";
        explicitTrace.saveCloudInternalReturnType = "early_return";
        explicitTrace.hasPendingLocalChangesAfterInternal = true;
      }
      rememberDangerousSaveBlock(registryPreflight, {
        reason: "saveCloudInternal",
        firestorePath: FB.docRef?.path || "",
        remoteExists: Boolean(remoteSnap && remoteSnap.exists)
      });
      hasPendingLocalChanges = true;
      await writeBlockedSaveLog(registryPreflight, { reason: "saveCloudInternal" });
      return;
    }
    if (remoteData && typeof remoteData === "object"){
      if (revisionConflict.blocked){
        if (explicitTrace){
          explicitTrace.saveCloudInternalReturnValue = "revision_conflict_blocked";
          explicitTrace.saveCloudInternalReturnType = "early_return";
          explicitTrace.hasPendingLocalChangesAfterInternal = true;
        }
        blockCloudSave("remote state is newer than this client. Export/reload/merge review before saving.", revisionConflict);
        hasPendingLocalChanges = true;
        return;
      }
      const dangerous = detectDangerousProtectedFieldReduction(remoteData, snap);
      if (dangerous.blocked){
        if (explicitTrace){
          explicitTrace.dangerousReductionBlocked = true;
          explicitTrace.saveCloudInternalReturnValue = "dangerous_reduction_blocked";
          explicitTrace.saveCloudInternalReturnType = "early_return";
          explicitTrace.hasPendingLocalChangesAfterInternal = true;
        }
        blockCloudSave("protected field reduction detected.", dangerous.issues);
        hasPendingLocalChanges = true;
        return;
      }
      snap.totalHistory = mergeTotalHistoryForSave(snap.totalHistory, remoteData.totalHistory);
      snap.dailyCutHours = mergeDailyCutHoursForSave(snap.dailyCutHours, remoteData.dailyCutHours);
      snap.pumpEff = mergePumpEffForSave(snap.pumpEff, remoteData.pumpEff);
    }
    persistLocalStateBackup(snap);
    const writeRev = Number(snap?.syncMeta?.rev || 0);
    snap.saveMeta = { lastSavedAt: new Date().toISOString(), lastSaveStatus: "saved", lastSaveError: "", lastSaveSizeBytes: sizeBytes };
    if (explicitTrace){
      explicitTrace.firestoreSetAttempted = true;
      explicitTrace.firestoreWritePayloadInstancesCount = Array.isArray(snap.maintenanceCalendarInstancesV2) ? snap.maintenanceCalendarInstancesV2.length : 0;
      explicitTrace.firestoreWritePayloadOccurrencesCount = Array.isArray(snap.maintenanceOccurrencesV2) ? snap.maintenanceOccurrencesV2.length : 0;
      explicitTrace.firestoreWritePayloadInstanceFound = Array.isArray(snap.maintenanceCalendarInstancesV2) && snap.maintenanceCalendarInstancesV2.some(entry => entry && String(entry.id || "") === String(explicitTrace.instanceId || ""));
      explicitTrace.firestoreWritePayloadOccurrenceFound = Array.isArray(snap.maintenanceOccurrencesV2) && snap.maintenanceOccurrencesV2.some(entry => entry && String(entry.id || "") === String(explicitTrace.occurrenceId || ""));
    }
    await FB.docRef.set(snap, { merge:true });
    if (explicitTrace) explicitTrace.firestoreSetCompleted = true;
    if (typeof window !== "undefined"){
      window.__loadedCloudRevisionForSaveGuard = Number(snap?.syncMeta?.rev || 0);
      if (explicitTrace){
        explicitTrace.loadedRevUpdatedAfterSuccessfulSave = true;
        explicitTrace.loadedRevAfterSave = Number(window.__loadedCloudRevisionForSaveGuard || 0);
      } else {
        window.__lastLoadedCloudState = cloneStructured(snap) || { ...snap };
      }
    }
    console.info("Cloud save succeeded", {
      workspaceId: WORKSPACE_ID,
      path: FB.docRef?.path || "",
      sizeBytes,
      strippedHeavyFields: Number(window.__lastStrippedHeavyFields || 0),
      layoutsIncluded: Boolean(snap && snap.dashboardLayout && snap.costLayout && snap.jobLayout)
    });
    if (writeRev > 0) lastAppliedCloudRevision = writeRev;
    if (FB.workspaceDoc){
      const nowMs = Date.now();
      if (nowMs - lastSaveLogWriteAt >= SAVE_LOG_THROTTLE_MS){
        lastSaveLogWriteAt = nowMs;
        try {
          await FB.workspaceDoc.collection("app").doc("saveLogs").collection("entries").add({ atISO: new Date().toISOString(), status: "saved", sizeBytes, workspaceId: WORKSPACE_ID });
        } catch (logErr){ console.warn("Failed to write save log entry", logErr); }
      }
    }
    if (window.DEBUG_MODE){
      const el = document.getElementById("dbgSnap");
      if (el) el.value = JSON.stringify(snap, null, 2);
    }
    hasPendingLocalChanges = false;
    if (explicitTrace){
      explicitTrace.hasPendingLocalChangesAfterInternal = false;
      explicitTrace.saveCloudInternalReturnValue = "completed";
      explicitTrace.saveCloudInternalReturnType = "resolved";
    }
    if (FB.workspaceDoc){
      await updateWorkspaceMetadata({
        workspaceId: WORKSPACE_ID,
        lastTouchedAt: new Date().toISOString()
      });
    }
  }catch(e){
    if (explicitTrace){
      explicitTrace.firestoreSetError = e?.message || String(e);
      explicitTrace.saveCloudInternalReturnValue = "threw";
      explicitTrace.saveCloudInternalReturnType = "rejected_or_caught";
      explicitTrace.hasPendingLocalChangesAfterInternal = Boolean(hasPendingLocalChanges);
    }
    console.error("Cloud save failed:", e);
  }
}, 1800);
function recordDataFlowEvent(trigger = "save", nextSnapshot = null){
  try {
    if (!Array.isArray(window.syncProcessLog)) window.syncProcessLog = [];
    const prev = window.__lastSnapshotForFlow && typeof window.__lastSnapshotForFlow === "object" ? window.__lastSnapshotForFlow : null;
    const next = nextSnapshot && typeof nextSnapshot === "object" ? nextSnapshot : null;
    const trackedKeys = ["totalHistory", "tasksInterval", "tasksAsReq", "inventory", "inventoryFolders", "receiptTrackerWeeks", "orderRequests", "cuttingJobs", "completedCuttingJobs", "dailyCutHours", "garnetCleanings", "maintenanceTasksV2", "maintenanceCalendarInstancesV2", "maintenanceOccurrencesV2", "settingsFolders"];
    const skipTrigger = /history|syncprocesslog|data_flow_save/i.test(String(trigger || ""));
    if (skipTrigger){
      if (next) window.__lastSnapshotForFlow = next;
      return;
    }
    const changedAreas = [];
    const details = [];
    if (prev && next){
      trackedKeys.forEach(key => {
        const beforeVal = prev[key] ?? null;
        const afterVal = next[key] ?? null;
        const a = getAreaSignature(key, beforeVal);
        const b = getAreaSignature(key, afterVal);
        if (a !== b){
          changedAreas.push(key);
          const beforeCount = Array.isArray(beforeVal) ? beforeVal.length : (beforeVal && typeof beforeVal === "object" ? Object.keys(beforeVal).length : (beforeVal == null ? 0 : 1));
          const afterCount = Array.isArray(afterVal) ? afterVal.length : (afterVal && typeof afterVal === "object" ? Object.keys(afterVal).length : (afterVal == null ? 0 : 1));
          details.push(`${key}: ${beforeCount} -> ${afterCount}`);
        }
      });
    } else if (!prev && next){
      trackedKeys.forEach(key => {
        const afterVal = next[key] ?? null;
        const afterCount = Array.isArray(afterVal) ? afterVal.length : (afterVal && typeof afterVal === "object" ? Object.keys(afterVal).length : (afterVal == null ? 0 : 1));
        if (afterCount > 0){
          changedAreas.push(key);
          details.push(`${key}: initialized -> ${afterCount}`);
        }
      });
    }
    if (!changedAreas.length){
      if (next) window.__lastSnapshotForFlow = next;
      return;
    }
    const fingerprint = `${changedAreas.join(",")}::${details.join("|")}::${String(trigger || "")}`;
    if (window.__lastDataFlowFingerprint === fingerprint){
      if (next) window.__lastSnapshotForFlow = next;
      return;
    }
    window.syncProcessLog.unshift({
      atISO: new Date().toISOString(),
      eventType: "data_flow_save",
      status: "saved",
      sourceArea: trigger,
      targetArea: changedAreas.join(","),
      message: `WHAT changed: ${details.join(" | ")}; FROM: ${trigger}; TO: ${changedAreas.join(", ")}; HOW: state diff on save.`
    });
    window.__lastDataFlowFingerprint = fingerprint;
    if (window.syncProcessLog.length > 1000) window.syncProcessLog.length = 1000;
    if (next) window.__lastSnapshotForFlow = next;
  } catch (_err){}
}
function stableStringify(value){
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}
function getAreaSignature(areaKey, areaValue){
  if (!Array.isArray(areaValue) && (!areaValue || typeof areaValue !== "object")) return stableStringify(areaValue);
  if (areaKey === "inventory"){
    const rows = Array.isArray(areaValue) ? areaValue.slice() : [];
    rows.sort((a,b)=> String(a?.id || a?.pn || a?.name || "").localeCompare(String(b?.id || b?.pn || b?.name || "")));
    return stableStringify(rows.map(item => ({
      id: item?.id ?? null, name: item?.name ?? null, pn: item?.pn ?? null, qtyNew: item?.qtyNew ?? null, qtyOld: item?.qtyOld ?? null, unit: item?.unit ?? null, price: item?.price ?? null, folderId: item?.folderId ?? null, link: item?.link ?? null
    })));
  }
  if (areaKey === "receiptTrackerWeeks"){
    const weeks = Array.isArray(areaValue) ? areaValue.slice() : [];
    weeks.sort((a,b)=> String(a?.key || "").localeCompare(String(b?.key || "")));
    return stableStringify(weeks.map(week => ({
      key: week?.key ?? null,
      startISO: week?.startISO ?? null,
      endISO: week?.endISO ?? null,
      rows: (Array.isArray(week?.rows) ? week.rows.slice() : []).map(row => ({
        date: row?.date ?? null, purchased: row?.purchased ?? null, cost: row?.cost ?? null, qty: row?.qty ?? null, partNumber: row?.partNumber ?? null, inventoryItemId: row?.inventoryItemId ?? null, shipping: row?.shipping ?? null, tax: row?.tax ?? null
      })).sort((a,b)=> `${a.date||""}|${a.purchased||""}|${a.partNumber||""}`.localeCompare(`${b.date||""}|${b.purchased||""}|${b.partNumber||""}`))
    })));
  }
  return stableStringify(areaValue);
}

function mergeTotalHistoryForSave(localList, remoteList){
  const map = new Map();
  const ingest = (list)=>{
    (Array.isArray(list) ? list : []).forEach((entry)=>{
      const key = normalizeDateISO(entry?.dateISO);
      const hours = Number(entry?.hours);
      if (!key || !Number.isFinite(hours) || hours < 0) return;
      const prev = map.get(key);
      if (!prev || hours >= prev.hours){
        map.set(key, { dateISO: key, hours });
      }
    });
  };
  ingest(remoteList);
  ingest(localList);
  return Array.from(map.values()).sort((a,b)=> String(a.dateISO).localeCompare(String(b.dateISO)));
}

function mergeDailyCutHoursForSave(localList, remoteList){
  const merged = normalizeDailyCutHours([...(Array.isArray(remoteList) ? remoteList : []), ...(Array.isArray(localList) ? localList : [])]);
  return Array.isArray(merged) ? merged : [];
}

function mergePumpEffForSave(localPump, remotePump){
  const local = localPump && typeof localPump === "object" ? localPump : {};
  const remote = remotePump && typeof remotePump === "object" ? remotePump : {};
  const merged = {
    baselineRPM: Number.isFinite(Number(local.baselineRPM)) && Number(local.baselineRPM) > 0 ? Number(local.baselineRPM) : (Number.isFinite(Number(remote.baselineRPM)) && Number(remote.baselineRPM) > 0 ? Number(remote.baselineRPM) : null),
    baselineDateISO: normalizeDateISO(local.baselineDateISO || remote.baselineDateISO || null),
    entries: [],
    notes: []
  };

  const entryMap = new Map();
  const ingestEntries = (list, preferLocal=false)=>{
    (Array.isArray(list) ? list : []).forEach((entry)=>{
      const key = normalizeDateISO(entry?.dateISO);
      const rpm = Number(entry?.rpm);
      if (!key || !Number.isFinite(rpm) || rpm <= 0) return;
      const normalized = { dateISO: key, rpm: Math.round(rpm), timeISO: String(entry?.timeISO || "12:00") };
      if (!entryMap.has(key) || preferLocal) entryMap.set(key, normalized);
    });
  };
  ingestEntries(remote.entries, false);
  ingestEntries(local.entries, true);
  merged.entries = Array.from(entryMap.values()).sort((a,b)=> String(a.dateISO).localeCompare(String(b.dateISO)));

  const noteMap = new Map();
  const ingestNotes = (list, preferLocal=false)=>{
    (Array.isArray(list) ? list : []).forEach((note)=>{
      const dateISO = normalizeDateISO(note?.dateISO);
      const range = String(note?.range || "all");
      const text = String(note?.text || "").trim();
      if (!dateISO || !text) return;
      const key = `${dateISO}__${range}`;
      const current = noteMap.get(key);
      const updated = String(note?.updatedISO || "");
      const next = { dateISO, range, text, updatedISO: updated || new Date().toISOString() };
      if (!current || preferLocal || updated >= String(current.updatedISO || "")) noteMap.set(key, next);
    });
  };
  ingestNotes(remote.notes, false);
  ingestNotes(local.notes, true);
  merged.notes = Array.from(noteMap.values()).sort((a,b)=> String(b.dateISO).localeCompare(String(a.dateISO)));

  return merged;
}
function getTrackedStateSignature(snapshot){
  const snap = snapshot && typeof snapshot === "object" ? snapshot : {};
  const tracked = {
    totalHistory: snap.totalHistory ?? null,
    tasksInterval: snap.tasksInterval ?? null,
    tasksAsReq: snap.tasksAsReq ?? null,
    inventory: snap.inventory ?? null,
    inventoryFolders: snap.inventoryFolders ?? null,
    receiptTrackerWeeks: snap.receiptTrackerWeeks ?? null,
    orderRequests: snap.orderRequests ?? null,
    cuttingJobs: snap.cuttingJobs ?? null,
    completedCuttingJobs: snap.completedCuttingJobs ?? null,
    dailyCutHours: snap.dailyCutHours ?? null,
    garnetCleanings: snap.garnetCleanings ?? null,
    maintenanceTasksV2: snap.maintenanceTasksV2 ?? null,
    maintenanceCalendarInstancesV2: snap.maintenanceCalendarInstancesV2 ?? null,
    maintenanceOccurrencesV2: snap.maintenanceOccurrencesV2 ?? null,
    settingsFolders: snap.settingsFolders ?? null
  };
  const normalized = Object.fromEntries(Object.entries(tracked).map(([k,v]) => [k, getAreaSignature(k, v)]));
  return stableStringify(normalized);
}
function saveCloudDebounced(){
  if (!canWriteCloud("saveCloudDebounced")) return;
  if (isVercelPreviewRuntime()){
    const host = (typeof window !== "undefined" && window.location) ? String(window.location.hostname || "") : "";
    console.warn(`Cloud save skipped: previewReadonly=1 on preview host (${host}) for workspace ${WORKSPACE_ID}.`);
    return;
  }
  hasPendingLocalChanges = true;
  lastLocalMutationAt = Date.now();
  try {
    if (typeof setSettingsFolders === "function") setSettingsFolders(window.settingsFolders);
  } catch (err) {
    console.warn("Failed to normalize folders before save:", err);
  }
  try {
    if (typeof captureHistorySnapshot === "function") captureHistorySnapshot();
  } catch (err) {
    console.warn("History capture before save failed:", err);
  }
  saveCloudInternal();
}
function saveCloudNow(){
  if (!canWriteCloud("saveCloudNow")) return;
  if (isVercelPreviewRuntime()){
    const host = (typeof window !== "undefined" && window.location) ? String(window.location.hostname || "") : "";
    console.warn(`Cloud save skipped: previewReadonly=1 on preview host (${host}) for workspace ${WORKSPACE_ID}.`);
    return;
  }
  hasPendingLocalChanges = true;
  lastLocalMutationAt = Date.now();
  try {
    if (typeof setSettingsFolders === "function") setSettingsFolders(window.settingsFolders);
  } catch (err) {
    console.warn("Failed to normalize folders before save:", err);
  }
  try {
    if (typeof captureHistorySnapshot === "function") captureHistorySnapshot();
  } catch (err) {
    console.warn("History capture before save failed:", err);
  }
  if (typeof saveCloudInternal.now === "function"){
    return saveCloudInternal.now();
  }
  if (typeof saveCloudInternal.flushResult === "function"){
    const result = saveCloudInternal.flushResult();
    if (result !== false) return result;
    return saveCloudInternal();
  }
  if (typeof saveCloudInternal.flush === "function"){
    const flushed = saveCloudInternal.flush();
    if (!flushed){
      return saveCloudInternal();
    }
    return flushed;
  }else{
    return saveCloudInternal();
  }
}

const LAYOUT_SAVE_PROTECTED_KEYS = [
  "cuttingJobs",
  "completedCuttingJobs",
  "tasksInterval",
  "tasksAsReq",
  "settingsFolders",
  "inventory",
  "inventoryFolders",
  "inventoryMaterials",
  "inventoryTransactions",
  "receiptTrackerWeeks",
  "weeklyCostReports",
  "orderRequests",
  "dailyCutHours",
  "totalHistory",
  "pumpEff",
  "garnetCleanings",
  "appConfig",
  "cuttingJobDatabase",
  "maintenanceTasksV2",
  "maintenanceCalendarInstancesV2",
  "maintenanceOccurrencesV2"
];
const LAYOUT_SAVE_AREA_CONFIG = {
  dashboard: { stateKey: "dashboardLayout", cloudKey: "cloudDashboardLayout", loadedKey: "cloudDashboardLayoutLoaded" },
  cost: { stateKey: "costLayout", cloudKey: "cloudCostLayout", loadedKey: "cloudCostLayoutLoaded" },
  jobs: { stateKey: "jobLayout", cloudKey: "cloudJobLayout", loadedKey: "cloudJobLayoutLoaded" },
  job: { stateKey: "jobLayout", cloudKey: "cloudJobLayout", loadedKey: "cloudJobLayoutLoaded", canonicalArea: "jobs" }
};

function buildLayoutSaveDebugReport(overrides = {}){
  const payload = overrides.payload && typeof overrides.payload === "object" ? overrides.payload : {};
  const payloadKeys = Object.keys(payload);
  const protectedKeysIncludedInPayload = payloadKeys.filter(key => LAYOUT_SAVE_PROTECTED_KEYS.includes(key));
  const layoutKey = overrides.layoutKey || payloadKeys.find(key => /Layout$/.test(key)) || "";
  const remoteLayout = layoutKey && overrides.remoteData && typeof overrides.remoteData === "object" ? overrides.remoteData[layoutKey] : null;
  return {
    atISO: new Date().toISOString(),
    lastLayoutSaveAction: overrides.action || "",
    layoutArea: overrides.area || "",
    firebasePath: overrides.firebasePath || "",
    payloadKeys,
    protectedKeysIncludedInPayload,
    usedWholeAppSnapshot: Boolean(overrides.usedWholeAppSnapshot),
    calledSaveCloudDebounced: Boolean(overrides.calledSaveCloudDebounced),
    firestoreSetAttempted: Boolean(overrides.firestoreSetAttempted),
    firestoreSetCompleted: Boolean(overrides.firestoreSetCompleted),
    firestoreSetError: overrides.firestoreSetError || "",
    lastCloudSaveBlock: (typeof window !== "undefined" && window.__lastCloudSaveBlock) ? window.__lastCloudSaveBlock : null,
    lastDangerousSaveBlock: (typeof window !== "undefined" && window.__lastDangerousSaveBlock) ? window.__lastDangerousSaveBlock : null,
    persistFunctionCalled: Boolean(overrides.persistFunctionCalled),
    layoutHasEntries: Boolean(overrides.layoutHasEntries),
    cloudLoaded: Boolean(overrides.cloudLoaded),
    layoutsEqualResult: Object.prototype.hasOwnProperty.call(overrides, "layoutsEqualResult") ? Boolean(overrides.layoutsEqualResult) : null,
    changed: Object.prototype.hasOwnProperty.call(overrides, "changed") ? Boolean(overrides.changed) : null,
    saveLayoutCloudOnlyCalled: Boolean(overrides.saveLayoutCloudOnlyCalled),
    localStorageUpdated: Boolean(overrides.localStorageUpdated),
    remoteLayoutVerified: Boolean(overrides.remoteLayoutVerified),
    remoteLayoutShape: remoteLayout && typeof remoteLayout === "object"
      ? { type: Array.isArray(remoteLayout) ? "array" : "object", keyCount: Object.keys(remoteLayout).length }
      : { type: remoteLayout == null ? "missing" : typeof remoteLayout, keyCount: 0 }
  };
}

function recordLayoutPersistAttempt(area, details = {}){
  if (typeof window === "undefined") return null;
  const previous = window.__lastLayoutSaveIsolationReport && typeof window.__lastLayoutSaveIsolationReport === "object"
    ? window.__lastLayoutSaveIsolationReport
    : {};
  const payload = previous.payload && typeof previous.payload === "object" ? previous.payload : {};
  const report = buildLayoutSaveDebugReport({
    ...previous,
    ...details,
    action: details.action || "persist_attempt_recorded",
    area,
    firebasePath: FB.docRef?.path || previous.firebasePath || "",
    payload,
    usedWholeAppSnapshot: false,
    calledSaveCloudDebounced: false,
    persistFunctionCalled: true
  });
  window.__lastLayoutSaveIsolationReport = report;
  if (window.DEBUG_MODE) console.info("Layout persist attempt", report);
  return report;
}

async function saveLayoutCloudOnly(area, layout, options = {}){
  const cfg = LAYOUT_SAVE_AREA_CONFIG[area] || null;
  const canonicalArea = cfg?.canonicalArea || area;
  const layoutClone = (typeof cloneStructured === "function")
    ? (cloneStructured(layout || {}) || {})
    : JSON.parse(JSON.stringify(layout || {}));
  let payload = {};
  let debug = buildLayoutSaveDebugReport({
    action: "layout_save_started",
    area: canonicalArea || area || "",
    firebasePath: FB.docRef?.path || "",
    payload,
    layoutKey: cfg?.stateKey || "",
    usedWholeAppSnapshot: false,
    calledSaveCloudDebounced: false,
    persistFunctionCalled: Boolean(options.persistFunctionCalled),
    layoutHasEntries: Boolean(options.layoutHasEntries),
    cloudLoaded: Boolean(options.cloudLoaded),
    layoutsEqualResult: options.layoutsEqualResult,
    changed: options.changed,
    saveLayoutCloudOnlyCalled: true,
    localStorageUpdated: Boolean(options.localStorageUpdated)
  });
  if (typeof window !== "undefined") window.__lastLayoutSaveIsolationReport = debug;
  if (!cfg){
    debug = { ...debug, lastLayoutSaveAction: "blocked_unknown_layout_area", firestoreSetError: `Unknown layout area: ${area}` };
    if (typeof window !== "undefined") window.__lastLayoutSaveIsolationReport = debug;
    console.warn("Layout save skipped: unknown layout area", area);
    return false;
  }
  if (!FB.ready || !FB.docRef){
    debug = { ...debug, lastLayoutSaveAction: "blocked_firebase_not_ready" };
    if (typeof window !== "undefined") window.__lastLayoutSaveIsolationReport = debug;
    return false;
  }
  if (!canWriteCloud(`layout save (${cfg.stateKey})`)){
    debug = buildLayoutSaveDebugReport({ ...debug, action: "blocked_can_write_cloud", payload, layoutKey: cfg.stateKey, localStorageUpdated: Boolean(options.localStorageUpdated), saveLayoutCloudOnlyCalled: true });
    if (typeof window !== "undefined") window.__lastLayoutSaveIsolationReport = debug;
    return false;
  }
  if (isVercelPreviewRuntime()){
    debug = { ...debug, lastLayoutSaveAction: "blocked_preview_readonly" };
    if (typeof window !== "undefined") window.__lastLayoutSaveIsolationReport = debug;
    return false;
  }
  try {
    const remoteSnap = await FB.docRef.get();
    const remoteData = remoteSnap && remoteSnap.exists ? (typeof remoteSnap.data === "function" ? remoteSnap.data() : remoteSnap.data) : null;
    const revisionConflict = remoteData && typeof remoteData === "object"
      ? detectRemoteRevisionConflict(remoteData)
      : { blocked:false };
    if (revisionConflict.blocked){
      blockCloudSave("Layout save paused because cloud changed. Refresh before editing layout.", revisionConflict);
      debug = buildLayoutSaveDebugReport({ ...debug, action: "blocked_remote_revision_conflict", payload, layoutKey: cfg.stateKey, remoteData, localStorageUpdated: Boolean(options.localStorageUpdated) });
      if (typeof window !== "undefined") window.__lastLayoutSaveIsolationReport = debug;
      return false;
    }
    const previousRev = Math.max(
      Number(remoteData?.syncMeta?.rev || 0),
      Number(window.__loadedCloudRevisionForSaveGuard || 0),
      Number(lastAppliedCloudRevision || 0)
    );
    payload = {
      [cfg.stateKey]: layoutClone,
      syncMeta: {
        rev: Math.max(Date.now(), previousRev + 1),
        updatedAtISO: new Date().toISOString(),
        updatedBy: getCloudSyncClientId(),
        lastLayoutSaveArea: canonicalArea,
        lastLayoutSaveKey: cfg.stateKey
      }
    };
    debug = buildLayoutSaveDebugReport({
      action: "firestore_set_attempted",
      area: canonicalArea,
      firebasePath: FB.docRef?.path || "",
      payload,
      layoutKey: cfg.stateKey,
      usedWholeAppSnapshot: false,
      calledSaveCloudDebounced: false,
      firestoreSetAttempted: true,
      persistFunctionCalled: Boolean(options.persistFunctionCalled),
      layoutHasEntries: Boolean(options.layoutHasEntries),
      cloudLoaded: Boolean(options.cloudLoaded),
      layoutsEqualResult: options.layoutsEqualResult,
      changed: options.changed,
      saveLayoutCloudOnlyCalled: true,
      localStorageUpdated: Boolean(options.localStorageUpdated),
      remoteData
    });
    if (typeof window !== "undefined") window.__lastLayoutSaveIsolationReport = debug;
    await FB.docRef.set(payload, { merge:true });
    const verifiedSnap = await FB.docRef.get();
    const verifiedData = verifiedSnap && verifiedSnap.exists ? (typeof verifiedSnap.data === "function" ? verifiedSnap.data() : verifiedSnap.data) : null;
    const verifiedLayout = verifiedData && typeof verifiedData === "object" ? verifiedData[cfg.stateKey] : null;
    const remoteLayoutVerified = typeof stableStringify === "function"
      ? stableStringify(verifiedLayout || {}) === stableStringify(layoutClone || {})
      : true;
    if (typeof window !== "undefined"){
      window.__loadedCloudRevisionForSaveGuard = Number(payload.syncMeta.rev || 0);
      lastAppliedCloudRevision = Number(payload.syncMeta.rev || 0);
      const baseline = (window.__lastLoadedCloudState && typeof window.__lastLoadedCloudState === "object")
        ? (cloneStructured(window.__lastLoadedCloudState) || { ...window.__lastLoadedCloudState })
        : {};
      baseline[cfg.stateKey] = cloneStructured(layoutClone) || layoutClone;
      baseline.syncMeta = { ...(baseline.syncMeta && typeof baseline.syncMeta === "object" ? baseline.syncMeta : {}), ...payload.syncMeta };
      window.__lastLoadedCloudState = baseline;
    }
    debug = buildLayoutSaveDebugReport({
      action: "firestore_set_completed",
      area: canonicalArea,
      firebasePath: FB.docRef?.path || "",
      payload,
      layoutKey: cfg.stateKey,
      usedWholeAppSnapshot: false,
      calledSaveCloudDebounced: false,
      firestoreSetAttempted: true,
      firestoreSetCompleted: true,
      persistFunctionCalled: Boolean(options.persistFunctionCalled),
      layoutHasEntries: Boolean(options.layoutHasEntries),
      cloudLoaded: Boolean(options.cloudLoaded),
      layoutsEqualResult: options.layoutsEqualResult,
      changed: options.changed,
      saveLayoutCloudOnlyCalled: true,
      localStorageUpdated: Boolean(options.localStorageUpdated),
      remoteLayoutVerified,
      remoteData: verifiedData
    });
    if (typeof window !== "undefined") window.__lastLayoutSaveIsolationReport = debug;
    return true;
  } catch (err){
    debug = buildLayoutSaveDebugReport({
      action: "firestore_set_error",
      area: canonicalArea,
      firebasePath: FB.docRef?.path || "",
      payload,
      layoutKey: cfg.stateKey,
      usedWholeAppSnapshot: false,
      calledSaveCloudDebounced: false,
      firestoreSetAttempted: Boolean(Object.keys(payload).length),
      firestoreSetError: err?.message || String(err),
      persistFunctionCalled: Boolean(options.persistFunctionCalled),
      layoutHasEntries: Boolean(options.layoutHasEntries),
      cloudLoaded: Boolean(options.cloudLoaded),
      layoutsEqualResult: options.layoutsEqualResult,
      changed: options.changed,
      saveLayoutCloudOnlyCalled: true,
      localStorageUpdated: Boolean(options.localStorageUpdated)
    });
    if (typeof window !== "undefined") window.__lastLayoutSaveIsolationReport = debug;
    console.warn("Layout-only cloud save failed", err);
    return false;
  }
}

if (typeof window !== "undefined"){
  window.saveLayoutCloudOnly = saveLayoutCloudOnly;
  window.recordLayoutPersistAttempt = recordLayoutPersistAttempt;
  window.debugLayoutSaveIsolation = function debugLayoutSaveIsolation(){
    if (!window.DEBUG_MODE) return { available:false, reason:"DEBUG_MODE is disabled. Open with ?debug=1." };
    const report = window.__lastLayoutSaveIsolationReport || buildLayoutSaveDebugReport({ action:"no_layout_save_recorded" });
    console.info("Layout save isolation report", report);
    return report;
  };
}

if (typeof window !== "undefined"){
  window.addEventListener("visibilitychange", ()=>{
    if (isRecoveryMode()) return;
    if (document.visibilityState === "hidden"){
      saveCloudNow();
    }
  });
  window.addEventListener("pagehide", ()=>{ if (!isRecoveryMode()) saveCloudNow(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderRecoveryDiagnosticsPanel);
  else setTimeout(renderRecoveryDiagnosticsPanel, 0);
}

async function runRecoveryInspect(){
  window.__recoveryInspectMode = true;
  window.__autosaveDisabled = true;
  console.warn("Recovery inspect mode enabled: autosave disabled.");
  renderRecoveryDiagnosticsPanel();
  let cloudState = null;
  try {
    if (FB.ready && FB.docRef){
      const snap = await FB.docRef.get();
      cloudState = snap?.exists ? (typeof snap.data === "function" ? snap.data() : snap.data) : null;
    }
  } catch (err){ console.warn("Recovery inspect cloud read failed", err); }
  const localBackup = readLocalStateBackup();
  const localRaw = (typeof window !== "undefined" && window.localStorage) ? window.localStorage.getItem(LOCAL_STATE_BACKUP_KEY) : null;
  console.info("Recovery inspect report", {
    cloudMetrics: collectCoreBusinessMetrics(cloudState || {}),
    localBackupMetrics: collectCoreBusinessMetrics(localBackup || {}),
    localBackupBytes: localRaw ? localRaw.length : 0
  });
  return { cloudState, localBackup };
}
if (typeof window !== "undefined") window.recoveryInspect = runRecoveryInspect;
async function loadFromCloud(){
  if (!FB.ready || !FB.docRef) return;
  setCloudLoadGate({ loadComplete:false, adoptComplete:false });
  try{
    let snap = await FB.docRef.get();
    let data = snap.exists ? (typeof snap.data === "function" ? snap.data() : snap.data()) : null;

    if (!stateHasMeaningfulData(data) && !isRecoveryMode()){
      const migrated = await migrateLegacyWorkspaceDoc();
      if (migrated){
        data = migrated;
        snap = { exists: true };
      }
    } else if (!stateHasMeaningfulData(data) && isRecoveryMode()){
      console.warn("Recovery Mode: legacy migration write skipped during cloud load.");
    }

    const localBackup = readLocalStateBackup();
    const cloudRev = Number(data?.syncMeta?.rev || 0);
    const backupRev = Number(localBackup?.syncMeta?.rev || 0);

    if (stateHasMeaningfulData(data)){
      logMaintenanceHistoryDiagnostics("cloud-before-adopt", data || {});
      logMaintenanceHistoryDiagnostics("backup-before-adopt", localBackup || {});
      logCoreBusinessDiagnostics("cloud-before-adopt", data || {});
      logCoreBusinessDiagnostics("backup-before-adopt", localBackup || {});
      if (stateHasMeaningfulData(localBackup) && backupRev > cloudRev){
        showLocalBackupConflictWarning({ cloudRev, backupRev, backupOnly:false });
      }
      const incomingState = safeCleanupLoadedState(data || {});
      adoptState(incomingState);
      window.__lastLoadedCloudState = cloneStructured(data || {});
      window.__loadedCloudRevisionForSaveGuard = cloudRev;
      if (cloudRev > 0) lastAppliedCloudRevision = cloudRev;
      if (typeof resetHistoryToCurrent === "function") resetHistoryToCurrent();
    }else if (stateHasMeaningfulData(localBackup)){
      logMaintenanceHistoryDiagnostics("backup-only-before-adopt", localBackup || {});
      logCoreBusinessDiagnostics("backup-only-before-adopt", localBackup || {});
      const incomingBackup = safeCleanupLoadedState(localBackup || {});
      adoptState(incomingBackup);
      window.__lastLoadedCloudState = null;
      window.__loadedCloudRevisionForSaveGuard = 0;
      window.__localBackupOnlyMode = true;
      const loadedRev = Number(localBackup?.syncMeta?.rev || 0);
      if (loadedRev > 0) lastAppliedCloudRevision = loadedRev;
      if (typeof resetHistoryToCurrent === "function") resetHistoryToCurrent();
      showLocalBackupConflictWarning({ cloudRev:0, backupRev:loadedRev, backupOnly:true });
    }else{
      const pe = (typeof window.pumpEff === "object" && window.pumpEff)
        ? window.pumpEff
        : (window.pumpEff = { baselineRPM:null, baselineDateISO:null, entries:[], notes:[] });
      if (!Array.isArray(pe.entries)) pe.entries = [];
      if (!Array.isArray(pe.notes)) pe.notes = [];
      const folders = (typeof defaultSettingsFolders === "function") ? defaultSettingsFolders() : [];
      const seeded = {
        schema: APP_SCHEMA,
        totalHistory: [],
        tasksInterval: Array.isArray(window.tasksInterval) && window.tasksInterval.length ? window.tasksInterval.slice() : (Array.isArray(window.defaultIntervalTasks) ? window.defaultIntervalTasks.slice() : []),
        tasksAsReq: Array.isArray(window.tasksAsReq) && window.tasksAsReq.length ? window.tasksAsReq.slice() : (Array.isArray(window.defaultAsReqTasks) ? window.defaultAsReqTasks.slice() : []),
        inventory: Array.isArray(window.inventory) && window.inventory.length ? window.inventory.slice() : (typeof seedInventoryFromTasks === "function" ? seedInventoryFromTasks() : []),
        inventoryFolders: Array.isArray(window.inventoryFolders) ? window.inventoryFolders.map(folder => ({ ...folder })) : [],
        inventoryMaterials: normalizeInventoryMaterials(window.inventoryMaterials),
        inventorySection: String(window.inventorySection || "items") === "material" ? "material" : "items",
        cuttingJobs: Array.isArray(window.cuttingJobs) ? window.cuttingJobs.slice() : [],
        completedCuttingJobs: Array.isArray(window.completedCuttingJobs) ? window.completedCuttingJobs.slice() : [],
        orderRequests: Array.isArray(window.orderRequests) && window.orderRequests.length ? window.orderRequests.slice() : [typeof createOrderRequest === "function" ? createOrderRequest() : { id:"req_"+Date.now(), items:[] }],
        receiptTrackerWeeks: Array.isArray(window.receiptTrackerWeeks) ? window.receiptTrackerWeeks.slice() : [],
        orderRequestTab: typeof window.orderRequestTab === "string" ? window.orderRequestTab : "active",
        dailyCutHours: Array.isArray(window.dailyCutHours) ? window.dailyCutHours.slice() : [],
        opportunityRollups: Array.isArray(window.opportunityRollups) ? window.opportunityRollups.slice() : [],
        weeklyCostReports: Array.isArray(window.weeklyCostReports) ? window.weeklyCostReports.slice() : [],
        jobFolders: typeof defaultJobFolders === "function" ? defaultJobFolders() : [],
        pumpEff: pe,
        appConfig: normalizeAppConfig(window.appConfig),
        settingsFolders: folders,
        folders: JSON.parse(JSON.stringify(folders)),
        garnetCleanings: Array.isArray(window.garnetCleanings) ? window.garnetCleanings.slice() : [],
        dashboardLayout: typeof window.dashboardLayout === "object" ? { ...window.dashboardLayout } : {},
        costLayout: typeof window.costLayout === "object" ? { ...window.costLayout } : {},
        jobLayout: typeof window.jobLayout === "object" ? { ...window.jobLayout } : {},
        syncMeta: {
          rev: Math.max(Date.now(), (Number(lastAppliedCloudRevision) || 0) + 1),
          updatedAtISO: new Date().toISOString(),
          updatedBy: getCloudSyncClientId()
        }
      };
      adoptState(seeded);
      window.__lastLoadedCloudState = cloneStructured(seeded || {});
      window.__loadedCloudRevisionForSaveGuard = Number(seeded?.syncMeta?.rev || 0);
      const seededRev = Number(seeded?.syncMeta?.rev || 0);
      if (seededRev > 0) lastAppliedCloudRevision = seededRev;
      if (typeof resetHistoryToCurrent === "function") resetHistoryToCurrent();
      if (isRecoveryMode()){
        console.warn("Recovery Mode: seed/default Firestore write skipped.");
      } else {
        setCloudLoadGate({ loadComplete:true, adoptComplete:true });
        await FB.docRef.set(seeded, { merge:true });
        hasPendingLocalChanges = false;
        if (FB.workspaceDoc){
          await updateWorkspaceMetadata({
            workspaceId: WORKSPACE_ID,
            lastTouchedAt: new Date().toISOString()
          });
        }
      }
    }
    setCloudLoadGate({ loadComplete:true, adoptComplete:true });
    if (window.DEBUG_MODE){
      try { refreshDebugCloud(); } catch (err) { console.warn("Debug panel refresh failed", err); }
    }
    renderRecoveryDiagnosticsPanel();
  }catch(e){
    console.error("Cloud load failed:", e);
    setCloudLoadGate({ loadComplete:true, adoptComplete:false });
    renderRecoveryDiagnosticsPanel();
  }
}
async function migrateLegacyWorkspaceDoc(){
  if (isRecoveryMode()){
    console.warn("Recovery Mode: migrateLegacyWorkspaceDoc skipped to avoid writes.");
    return null;
  }
  if (!FB.workspaceDoc || !FB.docRef) return null;
  try{
    const workspaceSnap = await FB.workspaceDoc.get();
    if (!workspaceSnap.exists) return null;
    const raw = typeof workspaceSnap.data === "function" ? workspaceSnap.data() : workspaceSnap.data;
    if (!stateHasMeaningfulData(raw)) return null;
    const stateData = { ...(raw || {}) };
    delete stateData.workspaceId;
    delete stateData.lastTouchedAt;
    delete stateData.createdAt;
    delete stateData.lastStateMigrationAt;
    delete stateData.lastStateDocPath;
    await FB.docRef.set(stateData, { merge:true });
    const meta = {
      workspaceId: WORKSPACE_ID,
      lastStateMigrationAt: new Date().toISOString(),
      lastStateDocPath: FB.docRef.path,
      lastTouchedAt: new Date().toISOString()
    };
    await updateWorkspaceMetadata(meta);
    return stateData;
  }catch(err){
    console.warn("Failed to migrate workspace root document", err);
    return null;
  }
}

async function updateWorkspaceMetadata(meta){
  if (isRecoveryMode()){
    console.warn("Recovery Mode: workspace metadata write skipped.");
    return;
  }
  if (!FB.workspaceDoc || workspaceMetadataWritesBlocked) return;
  try {
    await FB.workspaceDoc.set(meta, { merge:true });
  } catch (err) {
    const code = err?.code || err?.error?.code;
    const permissionDenied = code === "permission-denied"
      || (typeof err?.message === "string" && err.message.toLowerCase().includes("permission"));
    if (permissionDenied){
      workspaceMetadataWritesBlocked = true;
      if (window.DEBUG_MODE){
        console.info("Workspace metadata update skipped after permission denial.");
      }
      return;
    }
    console.warn("Failed to update workspace metadata", err);
  }
}

/* ===================== DEBUG PANEL HELPERS ===================== */
function setupDebugPanel(){
  if (!window.DEBUG_MODE) return;
  const panel = document.getElementById("debugPanel");
  if (!panel) return;
  panel.style.display = "block";
  const dbgWs = document.getElementById("dbgWs");
  if (dbgWs) dbgWs.textContent = `${window.WORKSPACE_ID || ""}/app/state`;
  const btnCloud = document.getElementById("dbgRefreshCloud");
  const btnSnap  = document.getElementById("dbgRefreshSnapshot");
  if (btnCloud) btnCloud.onclick = ()=>refreshDebugCloud();
  if (btnSnap)  btnSnap.onclick  = ()=>{
    try{
      const s = snapshotState();
      const el = document.getElementById("dbgSnap");
      if (el) el.value = JSON.stringify(s, null, 2);
    }catch(err){
      const el = document.getElementById("dbgSnap");
      if (el) el.value = "snapshotState() failed: " + (err && err.message || err);
    }
  };
  // Prefill both columns on load so the panel is immediately useful.
  if (btnSnap) {
    try {
      btnSnap.click();
    } catch (e) {
      if (typeof btnSnap.onclick === "function") btnSnap.onclick();
    }
  }
  if (btnCloud) {
    refreshDebugCloud();
  }
}
async function refreshDebugCloud(){
  const out = document.getElementById("dbgCloud");
  if (!out) return;
  try{
    const r = await window.workspaceRef?.get?.();
    if (!r?.exists){
      out.value = "(no document at workspaces/" + (window.WORKSPACE_ID || "?") + "/app/state)";
      return;
    }
    const d = typeof r.data === "function" ? r.data() : r.data;
    out.value = JSON.stringify(d, null, 2);
  }catch(err){
    out.value = "Failed to read cloud doc: " + (err && err.message || err);
  }
}

function seedInventoryFromTasks(){
  return [
    ...defaultIntervalTasks.map(t => normalizeInventoryItem({ id:`inv_${t.id}`, name:t.name, qtyNew:0, qtyOld:0, unit:"pcs", note:"", pn:t.pn||"", link:t.storeLink||"", price:t.price!=null?Number(t.price):null })),
    ...defaultAsReqTasks.map(t => normalizeInventoryItem({ id:`inv_${t.id}`, name:t.name, qtyNew:0, qtyOld:0, unit:"pcs", note:"", pn:t.pn||"", link:t.storeLink||"", price:t.price!=null?Number(t.price):null })),
  ].filter(Boolean);
}

function buildOrderRequestCode(dateISO){
  const base = parseDateLocal(dateISO) || new Date();
  const y = base.getFullYear();
  const m = String(base.getMonth()+1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  const hh = String(base.getHours()).padStart(2, "0");
  const mm = String(base.getMinutes()).padStart(2, "0");
  return `ORD-${y}${m}${d}-${hh}${mm}`;
}

function normalizeOrderItem(raw){
  if (!raw) return null;
  const qtyNum = Number(raw.qty);
  const qty = Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 1;
  const priceNum = raw.price == null ? null : Number(raw.price);
  return {
    id: raw.id || genId("order_item"),
    inventoryId: raw.inventoryId || null,
    name: raw.name || "",
    pn: raw.pn || "",
    link: raw.link || "",
    price: Number.isFinite(priceNum) ? priceNum : null,
    qty,
    status: raw.status === "approved" || raw.status === "denied" ? raw.status : "pending"
  };
}

function cloneOrderRequestItem(raw){
  const base = normalizeOrderItem(raw);
  if (!base) return null;
  base.id = genId("order_item");
  base.status = "pending";
  return base;
}

function normalizeOrderRequest(raw){
  if (!raw) return null;
  const createdISO = raw.createdAt || new Date().toISOString();
  const status = (raw.status === "approved" || raw.status === "denied" || raw.status === "partial" || raw.status === "draft")
    ? raw.status
    : "draft";
  const items = Array.isArray(raw.items) ? raw.items.map(normalizeOrderItem).filter(Boolean) : [];
  return {
    id: raw.id || genId("order"),
    code: raw.code || buildOrderRequestCode(createdISO),
    createdAt: createdISO,
    status,
    resolvedAt: raw.resolvedAt || null,
    note: raw.note || "",
    items
  };
}

function normalizeOrderRequests(list){
  const normalized = Array.isArray(list) ? list.map(normalizeOrderRequest).filter(Boolean) : [];
  normalized.sort((a,b)=>{
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return aTime - bTime;
  });
  return normalized;
}

function createOrderRequest(items){
  const createdAt = new Date().toISOString();
  const template = {
    id: genId("order"),
    code: buildOrderRequestCode(createdAt),
    createdAt,
    status: "draft",
    resolvedAt: null,
    note: "",
    items: []
  };
  if (Array.isArray(items) && items.length){
    template.items = items.map(cloneOrderRequestItem).filter(Boolean);
  }
  return template;
}

function buildCleanState(){
const pumpDefaults = { baselineRPM:null, baselineDateISO:null, entries:[], notes:[] };
  return {
    schema: APP_SCHEMA,
    totalHistory: [],
    tasksInterval: defaultIntervalTasks.slice(),
    tasksAsReq: defaultAsReqTasks.slice(),
    inventory: seedInventoryFromTasks(),
    cuttingJobs: [],
    completedCuttingJobs: [],
    orderRequests: [createOrderRequest()],
    receiptTrackerWeeks: [],
    orderRequestTab: "active",
    dailyCutHours: [],
    opportunityRollups: [],
    garnetCleanings: [],
    pumpEff: { ...pumpDefaults },
    deletedItems: [],
    jobFolders: defaultJobFolders(),
    dashboardLayout: {},
    costLayout: {},
    jobLayout: {}
  };
}

async function clearAllAppData(){
  if (isRecoveryMode()) return blockCloudSave("clear/reset is disabled in Recovery Mode.");
  try {
    const label = (()=>{
      try {
        return `Workspace snapshot (${new Date().toLocaleString()})`;
      } catch (_){
        return "Workspace snapshot";
      }
    })();
    recordDeletedItem("workspace", snapshotWorkspaceForTrash(), { reason: "clear-all", label });
  } catch (err) {
    console.warn("Failed to snapshot workspace before clearing", err);
  }
  const defaults = buildCleanState();
  defaults.deletedItems = deletedItems.map(entry => ({
    id: entry.id,
    type: entry.type,
    payload: cloneStructured(entry.payload),
    meta: entry.meta && typeof entry.meta === "object" ? { ...entry.meta } : {},
    label: entry.label,
    deletedAt: entry.deletedAt
  }));

  if (Array.isArray(window.settingsFolders)) window.settingsFolders.length = 0;
  else window.settingsFolders = [];
  if (window.settingsOpenFolders instanceof Set) window.settingsOpenFolders.clear();
  else window.settingsOpenFolders = new Set();
  window.maintenanceSearchTerm = "";
  window.pendingMaintenanceAddFromInventory = null;
  window.jobFolders = defaultJobFolders();

  adoptState(defaults);
  resetHistoryToCurrent();

  try {
    if (typeof window.localStorage !== "undefined" && window.localStorage){
      const storage = window.localStorage;
      [
        "dashboard_layout_windows_v1",
        "cost_layout_windows_v1",
        "job_layout_windows_v1",
        "omax_tasks_interval_v6",
        "omax_tasks_asreq_v6"
      ].forEach(key => {
        try { storage.removeItem(key); } catch(_){ }
      });
    }
  } catch (err) {
    console.warn("Unable to clear layout storage", err);
  }

  try { if (window.dashboardLayoutState) delete window.dashboardLayoutState; } catch(_){ }
  try { if (window.costLayoutState) delete window.costLayoutState; } catch(_){ }
  try { if (window.jobLayoutState) delete window.jobLayoutState; } catch(_){ }
  try {
    window.cloudDashboardLayout = {};
    window.cloudDashboardLayoutLoaded = true;
  } catch(_){ }
  try {
    window.cloudCostLayout = {};
    window.cloudCostLayoutLoaded = true;
  } catch(_){ }
  try {
    window.cloudJobLayout = {};
    window.cloudJobLayoutLoaded = true;
  } catch(_){ }
  try { if (Array.isArray(window.pendingNewJobFiles)) window.pendingNewJobFiles.length = 0; } catch(_){ }
  if (typeof window.inventorySearchTerm === "string") window.inventorySearchTerm = "";
  inventorySearchTerm = "";
  if (typeof window.jobHistorySearchTerm === "string") window.jobHistorySearchTerm = "";
  jobHistorySearchTerm = "";
  if (window.orderPartialSelection instanceof Set) window.orderPartialSelection.clear();

  try { captureHistorySnapshot(); } catch(_){ }

  try {
    if (FB.ready && FB.docRef) {
      if (!canWriteCloud("clearAllAppData")) return defaults;
      await FB.docRef.set(snapshotState());
    } else {
      saveCloudDebounced();
    }
  } catch (err) {
    console.error("Failed to sync cleared state", err);
  }

  if (typeof route === "function") route();
  return defaults;
}

if (typeof window !== "undefined") window.clearAllAppData = clearAllAppData;

function ensureActiveOrderRequest(){
  if (!Array.isArray(orderRequests)) orderRequests = [];
  let draft = orderRequests.find(req => req && req.status === "draft");
  if (!draft){
    draft = createOrderRequest();
    orderRequests.push(draft);
  }
  window.orderRequests = orderRequests;
  return draft;
}

function isEditableTarget(el){
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (!tag) return false;
  const upper = tag.toUpperCase();
  return upper === "INPUT" || upper === "TEXTAREA" || upper === "SELECT";
}

window.addEventListener("keydown", (e)=>{
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = (e.key || "").toLowerCase();
  if (key !== "z" && key !== "y") return;
  if (isEditableTarget(e.target)) return;

  if (key === "z" && !e.shiftKey){
    e.preventDefault();
    undoLastChange();
    return;
  }
  if (key === "y" || (key === "z" && e.shiftKey)){
    e.preventDefault();
    redoLastUndo();
  }
});

window.undoLastChange = undoLastChange;
window.redoLastUndo = redoLastUndo;
