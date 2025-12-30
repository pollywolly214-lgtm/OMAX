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
// Decide workspace based on hostname:
// - GitHub Pages (anything ending with .github.io), the production Vercel host, or any custom
//   production domain → "github-prod"
// - Preview / branch URLs on Vercel (e.g. *.vercel.app) plus localhost/dev hosts → "vercel-preview"
const WORKSPACE_ID = (() => {
  if (typeof window !== "undefined") {
    const rawHost = window.location && typeof window.location.hostname === "string"
      ? window.location.hostname
      : "";
    const host = rawHost.toLowerCase();

    const isGithubPages = host.endsWith(".github.io");
    const isProdVercel = host === "omax.vercel.app";
    const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
    const isVercelPreview = host.endsWith(".vercel.app") && !isProdVercel;
    const isProdHost = (isGithubPages || isProdVercel || (!isVercelPreview && !isLocalHost && host));
    if (isProdHost) {
      return "github-prod";
    }

    // Treat previews and local/dev hosts as preview data.
    return "vercel-preview";
  }
  // Fallback for non-browser contexts so build-time scripts default to production doc
  return "github-prod";
})();
if (typeof window !== "undefined") {
  window.WORKSPACE_ID = WORKSPACE_ID;
  window.workspaceRef = null;
  window.workspaceDocRef = null;
  window.DEBUG_MODE = new URLSearchParams(window.location.search).get("debug") === "1";
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
const DEFAULT_APP_CONFIG = { excludeWeekends: false, dailyHours: DEFAULT_DAILY_HOURS };
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
  window.appConfig = appConfig;
  window.getConfiguredDailyHours = getConfiguredDailyHours;
  window.getAverageDailyCutHours = getAverageDailyCutHours;
  window.shouldExcludeWeekends = shouldExcludeWeekends;
  window.setAppConfig = setAppConfig;
  window.normalizeAppConfig = normalizeAppConfig;
  window.setDailyCutHoursEntry = setDailyCutHoursEntry;
  window.getDailyCutHoursEntry = getDailyCutHoursEntry;
  window.normalizeDailyCutHours = normalizeDailyCutHours;
  window.normalizeDateISO = normalizeDateISO;
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
      fn(...(lastArgs || []));
    }, ms);
  };
  debounced.flush = ()=>{
    if (!t) return;
    clearTimeout(t);
    t = null;
    fn(...(lastArgs || []));
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

function normalizeAppConfig(config){
  const normalized = { ...DEFAULT_APP_CONFIG };
  if (config && typeof config === "object"){
    if (typeof config.excludeWeekends === "boolean") normalized.excludeWeekends = config.excludeWeekends;
    if (config.dailyHours != null){
      const clamped = clampDailyCutHours(config.dailyHours);
      if (clamped > 0) normalized.dailyHours = clamped;
    }
  }
  return normalized;
}

function shouldExcludeWeekends(){
  try {
    return Boolean((appConfig || {}).excludeWeekends);
  } catch (_err){
    return false;
  }
}

function getConfiguredDailyHours(){
  const avg = getAverageDailyCutHours();
  if (avg != null && Number.isFinite(avg) && avg > 0) return avg;
  try {
    const cfg = appConfig && typeof appConfig === "object" ? appConfig : DEFAULT_APP_CONFIG;
    const clamped = clampDailyCutHours(cfg.dailyHours);
    if (clamped > 0) return clamped;
  } catch (_err){ /* ignore */ }
  return DEFAULT_DAILY_HOURS;
}

function getAverageDailyCutHours(){
  const list = Array.isArray(window.totalHistory) ? window.totalHistory : [];
  const sorted = list
    .filter(entry => entry && entry.dateISO && Number.isFinite(Number(entry.hours)))
    .slice()
    .sort((a, b)=> String(a.dateISO).localeCompare(String(b.dateISO)));
  if (sorted.length < 2) return null;

  const today = new Date();
  today.setHours(0,0,0,0);
  const windowDays = (typeof shouldExcludeWeekends === "function" && shouldExcludeWeekends()) ? 22 : 30;
  const monthStart = new Date(today);
  monthStart.setDate(monthStart.getDate() - windowDays);

  const monthStartTime = monthStart.getTime();
  const todayTime = today.getTime();

  let startEntry = null;
  let endEntry = null;
  for (const entry of sorted){
    const entryDate = parseDateLocal(entry.dateISO);
    if (!(entryDate instanceof Date) || Number.isNaN(entryDate.getTime())) continue;
    entryDate.setHours(0,0,0,0);
    const entryTime = entryDate.getTime();
    if (entryTime < monthStartTime) continue;
    if (entryTime > todayTime) break;
    if (!startEntry) startEntry = { entry, time: entryTime };
    endEntry = { entry, time: entryTime };
  }

  if (!startEntry || !endEntry || startEntry.time === endEntry.time) return null;
  const diffHours = Math.max(0, Number(endEntry.entry.hours) - Number(startEntry.entry.hours));
  const diffDays = Math.floor((endEntry.time - startEntry.time) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return null;
  const rate = diffHours / diffDays;
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
  if (!isDevEnv && hasHostSetting){
    console.info("Existing Firestore host settings detected; skipping reconfiguration to prevent overrides.");
    firebaseSettingsApplied = true;
    return;
  }

    if (!isDevEnv){
      // In preview/production environments, leave Firestore settings untouched to
      // avoid host override warnings. The default host from FIREBASE_CONFIG will
      // be used.
      firebaseSettingsApplied = true;
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
if (!Array.isArray(window.cuttingJobs))  window.cuttingJobs  = [];   // [{id,name,estimateHours,material,materialCost,materialQty,chargeRate,notes,startISO,dueISO,manualLogs:[{dateISO,completedHours}],files:[{name,dataUrl,type,size,addedAt}]}]
if (!Array.isArray(window.completedCuttingJobs)) window.completedCuttingJobs = [];
if (!Array.isArray(window.pendingNewJobFiles)) window.pendingNewJobFiles = [];
if (!Array.isArray(window.orderRequests)) window.orderRequests = [];
if (!Array.isArray(window.garnetCleanings)) window.garnetCleanings = [];
if (!Array.isArray(window.dailyCutHours)) window.dailyCutHours = [];
if (!Array.isArray(window.opportunityRollups)) window.opportunityRollups = [];
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
let jobFolders = window.jobFolders;

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
    copyArr("orderRequests");
    copyArr("garnetCleanings");
    copyArr("totalHistory");
    copyObj("appConfig");
    copyObj("settingsFolders");
    copyObj("folders");
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
    if (!Array.isArray(sanitized.orderRequests) && Array.isArray(window.orderRequests)) sanitized.orderRequests = window.orderRequests.slice();
    if (!Array.isArray(sanitized.garnetCleanings) && Array.isArray(window.garnetCleanings)) sanitized.garnetCleanings = window.garnetCleanings.slice();
    if (!Array.isArray(sanitized.totalHistory) && Array.isArray(window.totalHistory)) sanitized.totalHistory = window.totalHistory.slice();
    if (!Array.isArray(sanitized.deletedItems) && Array.isArray(window.deletedItems)) sanitized.deletedItems = window.deletedItems.slice();
    if (!Array.isArray(sanitized.jobFolders) && Array.isArray(window.jobFolders)) sanitized.jobFolders = window.jobFolders.slice();
    if (!sanitized.appConfig || typeof sanitized.appConfig !== "object") sanitized.appConfig = normalizeAppConfig(appConfig);
    if ((!sanitized.settingsFolders && !sanitized.folders) && Array.isArray(window.settingsFolders)) sanitized.settingsFolders = JSON.parse(JSON.stringify(window.settingsFolders));
    if (!sanitized.dashboardLayout && window.dashboardLayout) sanitized.dashboardLayout = { ...window.dashboardLayout };
    if (!sanitized.costLayout && window.costLayout) sanitized.costLayout = { ...window.costLayout };
    if (!sanitized.jobLayout && window.jobLayout) sanitized.jobLayout = { ...window.jobLayout };
    if (!sanitized.pumpEff && window.pumpEff) sanitized.pumpEff = { ...window.pumpEff };
    if (typeof orig === "function") orig(sanitized);
    if (!Array.isArray(window.tasksInterval)) window.tasksInterval = [];
    if (!Array.isArray(window.tasksAsReq)) window.tasksAsReq = [];
    if (!Array.isArray(window.cuttingJobs)) window.cuttingJobs = [];
    if (!Array.isArray(window.completedCuttingJobs)) window.completedCuttingJobs = [];
    if (!Array.isArray(window.dailyCutHours)) window.dailyCutHours = [];
    appConfig = normalizeAppConfig(sanitized.appConfig);
    window.appConfig = appConfig;
    refreshDerivedDailyHours();
    if (!Array.isArray(window.orderRequests)) window.orderRequests = [];
    if (!Array.isArray(window.garnetCleanings)) window.garnetCleanings = [];
    if (!Array.isArray(window.totalHistory)) window.totalHistory = [];
    if (!window.settingsFolders || !Array.isArray(window.settingsFolders)) window.settingsFolders = typeof defaultSettingsFolders === "function" ? defaultSettingsFolders() : [];
    if (!window.folders || typeof window.folders !== "object") window.folders = Array.isArray(window.settingsFolders) ? JSON.parse(JSON.stringify(window.settingsFolders)) : [];
    if (!window.dashboardLayout || typeof window.dashboardLayout !== "object") window.dashboardLayout = {};
    if (!window.costLayout || typeof window.costLayout !== "object") window.costLayout = {};
    if (!window.jobLayout || typeof window.jobLayout !== "object") window.jobLayout = {};
    if (!window.pumpEff || typeof window.pumpEff !== "object") window.pumpEff = { baselineRPM:null, baselineDateISO:null, entries:[], notes:[] };
    if (typeof window.ensureTaskCategories === "function") window.ensureTaskCategories();
    if (typeof window.ensureJobCategories === "function") window.ensureJobCategories();
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
    "schema"
  ]);
  return keys.some(key => meaningfulKeys.has(key));
}

function snapshotState(){
  refreshGlobalCollections();
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
  return {
    schema: window.APP_SCHEMA || APP_SCHEMA,
    totalHistory,
    tasksInterval,
    tasksAsReq,
    inventory,
    cuttingJobs,
    completedCuttingJobs,
    orderRequests,
    orderRequestTab,
    garnetCleanings,
    dailyCutHours: Array.isArray(dailyCutHours)
      ? dailyCutHours.map(entry => ({ ...entry }))
      : [],
    opportunityRollups: Array.isArray(window.opportunityRollups)
      ? window.opportunityRollups.map(entry => ({ ...entry }))
      : [],
    appConfig: normalizeAppConfig(window.appConfig),
    pumpEff: safePumpEff,
    deletedItems: trashSnapshot,
    settingsFolders: foldersSnapshot,
    folders: cloneFolders(window.settingsFolders),
    jobFolders: snapshotJobFolders(),
    dashboardLayout: cloneStructured(dashLayoutSource) || {},
    costLayout: cloneStructured(costLayoutSource) || {},
    jobLayout: cloneStructured(jobLayoutSource) || {}
  };
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
  });
  tasksAsReq.forEach(t =>    { if (t && !t.cat) t.cat = "asreq"; });
}

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
  cuttingJobs = Array.isArray(data.cuttingJobs) ? data.cuttingJobs : [];
  completedCuttingJobs = Array.isArray(data.completedCuttingJobs) ? data.completedCuttingJobs : [];
  orderRequests = normalizeOrderRequests(Array.isArray(data.orderRequests) ? data.orderRequests : []);
  if (!orderRequests.some(req => req && req.status === "draft")){
    orderRequests.push(createOrderRequest());
  }
  garnetCleanings = Array.isArray(data.garnetCleanings) ? data.garnetCleanings : [];
  dailyCutHours = normalizeDailyCutHours(Array.isArray(data.dailyCutHours) ? data.dailyCutHours : []);
  opportunityRollups = Array.isArray(data.opportunityRollups) ? data.opportunityRollups : [];

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
  deletedItems = normalizeDeletedItems(Array.isArray(data.deletedItems) ? data.deletedItems : deletedItems);
  window.deletedItems = deletedItems;
  purgeExpiredDeletedItems();
  if (!Array.isArray(window.pendingNewJobFiles)) window.pendingNewJobFiles = [];
  window.pendingNewJobFiles.length = 0;
  if (typeof data.orderRequestTab === "string"){
    orderRequestTab = data.orderRequestTab;
    window.orderRequestTab = orderRequestTab;
  }
  if (typeof window.orderRequestTab !== "string" || !window.orderRequestTab){
    window.orderRequestTab = orderRequestTab || "active";
  }
  orderRequestTab = window.orderRequestTab;

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
  if (!FB.ready || !FB.docRef) return;
  try{
    const snap = snapshotState();
    window.__lastSnapshot = snap;
    await FB.docRef.set(snap, { merge:true });
    if (window.DEBUG_MODE){
      const el = document.getElementById("dbgSnap");
      if (el) el.value = JSON.stringify(snap, null, 2);
    }
    if (FB.workspaceDoc){
      await updateWorkspaceMetadata({
        workspaceId: WORKSPACE_ID,
        lastTouchedAt: new Date().toISOString()
      });
    }
  }catch(e){
    console.error("Cloud save failed:", e);
  }
}, 300);
function saveCloudDebounced(){
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
  if (typeof saveCloudInternal.flush === "function"){
    saveCloudInternal.flush();
  }else{
    saveCloudInternal();
  }
}

if (typeof window !== "undefined"){
  window.addEventListener("visibilitychange", ()=>{
    if (document.visibilityState === "hidden"){
      saveCloudNow();
    }
  });
  window.addEventListener("pagehide", ()=>saveCloudNow());
}
async function loadFromCloud(){
  if (!FB.ready || !FB.docRef) return;
  try{
    let snap = await FB.docRef.get();
    let data = snap.exists ? (typeof snap.data === "function" ? snap.data() : snap.data()) : null;

    if (!stateHasMeaningfulData(data)){
      const migrated = await migrateLegacyWorkspaceDoc();
      if (migrated){
        data = migrated;
        snap = { exists: true };
      }
    }

    if (stateHasMeaningfulData(data)){
      adoptState(data || {});
      if (typeof resetHistoryToCurrent === "function") resetHistoryToCurrent();
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
        cuttingJobs: Array.isArray(window.cuttingJobs) ? window.cuttingJobs.slice() : [],
        completedCuttingJobs: Array.isArray(window.completedCuttingJobs) ? window.completedCuttingJobs.slice() : [],
        orderRequests: Array.isArray(window.orderRequests) && window.orderRequests.length ? window.orderRequests.slice() : [typeof createOrderRequest === "function" ? createOrderRequest() : { id:"req_"+Date.now(), items:[] }],
        orderRequestTab: typeof window.orderRequestTab === "string" ? window.orderRequestTab : "active",
        dailyCutHours: Array.isArray(window.dailyCutHours) ? window.dailyCutHours.slice() : [],
        opportunityRollups: Array.isArray(window.opportunityRollups) ? window.opportunityRollups.slice() : [],
        jobFolders: typeof defaultJobFolders === "function" ? defaultJobFolders() : [],
        pumpEff: pe,
        appConfig: normalizeAppConfig(window.appConfig),
        settingsFolders: folders,
        folders: JSON.parse(JSON.stringify(folders)),
        garnetCleanings: Array.isArray(window.garnetCleanings) ? window.garnetCleanings.slice() : [],
        dashboardLayout: typeof window.dashboardLayout === "object" ? { ...window.dashboardLayout } : {},
        costLayout: typeof window.costLayout === "object" ? { ...window.costLayout } : {},
        jobLayout: typeof window.jobLayout === "object" ? { ...window.jobLayout } : {}
      };
      adoptState(seeded);
      if (typeof resetHistoryToCurrent === "function") resetHistoryToCurrent();
      await FB.docRef.set(seeded, { merge:true });
      if (FB.workspaceDoc){
        await updateWorkspaceMetadata({
          workspaceId: WORKSPACE_ID,
          lastTouchedAt: new Date().toISOString()
        });
      }
    }
    if (window.DEBUG_MODE){
      try { refreshDebugCloud(); } catch (err) { console.warn("Debug panel refresh failed", err); }
    }
  }catch(e){
    console.error("Cloud load failed:", e);
  }
}

async function migrateLegacyWorkspaceDoc(){
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
