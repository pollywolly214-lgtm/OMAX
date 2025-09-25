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
const APP_SCHEMA = 71;
const DAILY_HOURS = 8;
const JOB_RATE_PER_HOUR = 250; // $/hr
const WORKSPACE_ID = "schreiner-robotics";

const CLEAR_DATA_PASSWORD = (typeof window !== "undefined" && typeof window.CLEAR_DATA_PASSWORD === "string" && window.CLEAR_DATA_PASSWORD)
  ? window.CLEAR_DATA_PASSWORD
  : "reset-omax";
if (typeof window !== "undefined") window.CLEAR_DATA_PASSWORD = CLEAR_DATA_PASSWORD;

window.APP_SCHEMA = APP_SCHEMA;

/* Root helpers */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
function debounce(fn, ms=250){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms);} }
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
  t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
  setTimeout(()=>t.classList.add("show"),10);
  setTimeout(()=>{ t.classList.remove("show"); setTimeout(()=>t.remove(),200); }, 1600);
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
let FB = { app:null, auth:null, db:null, user:null, docRef:null, ready:false };

async function initFirebase(){
  if (!window.firebase || !firebase.initializeApp){ console.warn("Firebase SDK not loaded."); return; }
  if (!window.FIREBASE_CONFIG){ console.warn("Missing FIREBASE_CONFIG."); return; }

  // Initialize
  FB.app  = firebase.initializeApp(window.FIREBASE_CONFIG);
  FB.auth = firebase.auth();
  FB.db   = firebase.firestore();

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

  FB.auth.onAuthStateChanged(async (user)=>{
    FB.user = user || null;
    if (user){
      if (statusEl) statusEl.textContent = `Signed in as: ${user.email || user.uid}`;
      if (btnIn)  btnIn.style.display  = "none";
      if (btnOut) btnOut.style.display = "inline-block";

      FB.docRef = FB.db.collection("workspaces").doc(WORKSPACE_ID).collection("app").doc("state");
      FB.ready = true;
      await loadFromCloud();
      route();
    }else{
      FB.ready = false;
      if (statusEl) statusEl.textContent = "Not signed in";
      if (btnIn)  btnIn.style.display  = "inline-block";
      if (btnOut) btnOut.style.display = "none";
      renderSignedOut();
    }
  });
}


/* ===================== DATA / STATE ======================== */
const defaultIntervalTasks = [
  { id:"noz_filter_or", name:"Nozzle filter & inlet O-ring", interval:40,  sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"", pn:"307525", price:283 },
  { id:"pump_tube_noz_filter", name:"Pump tube & nozzle filter life", interval:80, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"", pn:"307561-02", price:170 },
  { id:"orifice_assembly", name:"Orifice assembly (jewel)", interval:500, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"", pn:"305322-14", price:700 },
  { id:"nozzle_body_life", name:"Nozzle body life", interval:500, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"", pn:"303295", price:349 },
  { id:"drain_hopper_reg_bowl", name:"Drain hopper regulator water bowl", interval:240, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"" },
  { id:"check_pinch_reg_conn",  name:"Check hopper pinch valve & air regulator connection", interval:240, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"" },
  { id:"inspect_relief_90psi",  name:"Inspect pressure relief valve (≤90 psi)", interval:240, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"" },
  { id:"buy_garnet_pallets_x4", name:"Buy Garnet Pallets x4", interval:160, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"" },
  { id:"ro_softener_daily_chk", name:"RO / Softener feed pressure & water quality — daily", interval:8, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"" },
  { id:"mixing_tube_rotation",  name:"Mixing tube rotation", interval:8, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"" },
  { id:"jewel_nozzle_clean",    name:"Jewell orifice & nozzle body cleaning (weekly)", interval:56, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"" },
  { id:"check_bonding_strap",   name:"Check hopper bonding strap (annually)", interval:2920, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"" },
  { id:"lube_z_axis",           name:"Lubricate Z-axis rail shafts & lead screw (annually)", interval:2920, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"" },
  { id:"filter_housing_or_2y",  name:"Filter housing O-ring (2 years / if leaking)", interval:5840, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"", pn:"208665", price:4.85 }
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

/* ===================== Persisted state ===================== */
if (!Array.isArray(window.totalHistory)) window.totalHistory = [];   // [{dateISO, hours}]
if (!Array.isArray(window.tasksInterval)) window.tasksInterval = [];
if (!Array.isArray(window.tasksAsReq))   window.tasksAsReq   = [];
if (!Array.isArray(window.inventory))    window.inventory    = [];
if (!Array.isArray(window.cuttingJobs))  window.cuttingJobs  = [];   // [{id,name,estimateHours,material,materialCost,materialQty,notes,startISO,dueISO,manualLogs:[{dateISO,completedHours}],files:[{name,dataUrl,type,size,addedAt}]}]
if (!Array.isArray(window.completedCuttingJobs)) window.completedCuttingJobs = [];
if (!Array.isArray(window.pendingNewJobFiles)) window.pendingNewJobFiles = [];
if (!Array.isArray(window.orderRequests)) window.orderRequests = [];
if (!Array.isArray(window.garnetCleanings)) window.garnetCleanings = [];
if (typeof window.orderRequestTab !== "string") window.orderRequestTab = "active";

if (typeof window.pumpEff !== "object" || !window.pumpEff){
  window.pumpEff = { baselineRPM:null, baselineDateISO:null, entries:[] };
}

let totalHistory = window.totalHistory;
let tasksInterval = window.tasksInterval;
let tasksAsReq    = window.tasksAsReq;
let inventory     = window.inventory;
let cuttingJobs   = window.cuttingJobs;
let completedCuttingJobs = window.completedCuttingJobs;
let orderRequests = window.orderRequests;
let orderRequestTab = window.orderRequestTab;
let garnetCleanings = window.garnetCleanings;

function refreshGlobalCollections(){
  if (typeof window === "undefined") return;

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

  if (!Array.isArray(window.orderRequests)) window.orderRequests = [];
  orderRequests = window.orderRequests;

  if (!Array.isArray(window.garnetCleanings)) window.garnetCleanings = [];
  garnetCleanings = window.garnetCleanings;
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
      return { handledRemoval: false, value: { type: "task", id: clone.id } };
    }
    case "inventory": {
      if (!Array.isArray(inventory)) inventory = [];
      if (!clone.id) clone.id = genId(clone.name || "item");
      const existing = new Set(inventory.filter(Boolean).map(item => String(item.id)));
      while (existing.has(String(clone.id))){
        clone.id = genId(clone.name || "item");
      }
      inventory.push(clone);
      window.inventory = inventory;
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
    deletedItems.splice(idx, 1);
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

if (typeof window.inventorySearchTerm !== "string") window.inventorySearchTerm = "";
let inventorySearchTerm = window.inventorySearchTerm;

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

window.defaultIntervalTasks = defaultIntervalTasks;
const ROOT_FOLDER_ID = "root";
window.ROOT_FOLDER_ID = ROOT_FOLDER_ID;
const DEFAULT_SETTINGS_FOLDERS = [
  { id: ROOT_FOLDER_ID, name: "All Tasks",    parent: null,           order: 3 },
  { id: "interval",    name: "Per Interval", parent: ROOT_FOLDER_ID, order: 2 },
  { id: "asreq",       name: "As Required",  parent: ROOT_FOLDER_ID, order: 1 }
];

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

/* ==================== Cloud load / save ===================== */
function snapshotState(){
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
    pumpEff: safePumpEff,
    deletedItems: trashSnapshot,
    settingsFolders: foldersSnapshot,
    folders: cloneFolders(window.settingsFolders)
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
  tasksInterval.forEach(t => { if (t && !t.cat) t.cat = "interval"; });
  tasksAsReq.forEach(t =>    { if (t && !t.cat) t.cat = "asreq"; });
}

function adoptState(doc){
  const data = doc || {};

  // Core lists (fallback to defaults if empty/missing)
  totalHistory = Array.isArray(data.totalHistory) ? data.totalHistory : [];
  tasksInterval = (Array.isArray(data.tasksInterval) && data.tasksInterval.length)
    ? data.tasksInterval
    : defaultIntervalTasks.slice();
  tasksAsReq = (Array.isArray(data.tasksAsReq) && data.tasksAsReq.length)
    ? data.tasksAsReq
    : defaultAsReqTasks.slice();
  inventory = Array.isArray(data.inventory) ? data.inventory : seedInventoryFromTasks();
  cuttingJobs = Array.isArray(data.cuttingJobs) ? data.cuttingJobs : [];
  completedCuttingJobs = Array.isArray(data.completedCuttingJobs) ? data.completedCuttingJobs : [];
  orderRequests = normalizeOrderRequests(Array.isArray(data.orderRequests) ? data.orderRequests : []);
  if (!orderRequests.some(req => req && req.status === "draft")){
    orderRequests.push(createOrderRequest());
  }
  garnetCleanings = Array.isArray(data.garnetCleanings) ? data.garnetCleanings : [];

  window.totalHistory = totalHistory;
  window.tasksInterval = tasksInterval;
  window.tasksAsReq = tasksAsReq;
  window.inventory = inventory;
  window.cuttingJobs = cuttingJobs;
  window.completedCuttingJobs = completedCuttingJobs;
  window.orderRequests = orderRequests;
  window.garnetCleanings = garnetCleanings;
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

  if (typeof window._maintOrderCounter !== "number" || !Number.isFinite(window._maintOrderCounter)){
    window._maintOrderCounter = 0;
  }
  let maxOrder = window._maintOrderCounter;
  for (const list of [tasksInterval, tasksAsReq]){
    if (!Array.isArray(list)) continue;
    for (const task of list){
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
    : (window.pumpEff = { baselineRPM:null, baselineDateISO:null, entries:[] });

  if (data.pumpEff && typeof data.pumpEff === "object"){
    pe.baselineRPM     = (data.pumpEff.baselineRPM ?? pe.baselineRPM);
    pe.baselineDateISO = (data.pumpEff.baselineDateISO ?? pe.baselineDateISO);
    pe.entries         = Array.isArray(data.pumpEff.entries) ? data.pumpEff.entries.slice() : pe.entries;
  }

  ensureTaskCategories();
  syncRenderTotalsFromHistory();
}


const saveCloudInternal = debounce(async ()=>{
  if (!FB.ready || !FB.docRef) return;
  try{ await FB.docRef.set(snapshotState(), { merge:true }); }catch(e){ console.error("Cloud save failed:", e); }
}, 300);
function saveCloudDebounced(){
  try {
    setSettingsFolders(window.settingsFolders);
  } catch (err) {
    console.warn("Failed to normalize folders before save:", err);
  }
  captureHistorySnapshot();
  saveCloudInternal();
}
async function loadFromCloud(){
  if (!FB.ready || !FB.docRef) return;
  try{
    const snap = await FB.docRef.get();
    if (snap.exists){
      const data = snap.data() || {};
      const needsSeed = !Array.isArray(data.tasksInterval) || data.tasksInterval.length === 0;
      if (needsSeed){
        const pe = (typeof window.pumpEff === "object" && window.pumpEff)
          ? window.pumpEff
          : (window.pumpEff = { baselineRPM:null, baselineDateISO:null, entries:[] });
        const seededFolders = normalizeSettingsFolders(data.settingsFolders || data.folders);
        const seededFoldersPayload = cloneFolders(seededFolders);
        const seeded = {
          schema:APP_SCHEMA,
          totalHistory: Array.isArray(data.totalHistory) ? data.totalHistory : [],
          tasksInterval: defaultIntervalTasks.slice(),
          tasksAsReq: Array.isArray(data.tasksAsReq) && data.tasksAsReq.length ? data.tasksAsReq : defaultAsReqTasks.slice(),
          inventory: Array.isArray(data.inventory) && data.inventory.length ? data.inventory : seedInventoryFromTasks(),
          cuttingJobs: Array.isArray(data.cuttingJobs) ? data.cuttingJobs : [],
          completedCuttingJobs: Array.isArray(data.completedCuttingJobs) ? data.completedCuttingJobs : [],
          garnetCleanings: Array.isArray(data.garnetCleanings) ? data.garnetCleanings : [],
          orderRequests: Array.isArray(data.orderRequests) ? normalizeOrderRequests(data.orderRequests) : [createOrderRequest()],
          orderRequestTab: typeof data.orderRequestTab === "string" ? data.orderRequestTab : "active",
          settingsFolders: seededFoldersPayload,
          folders: cloneFolders(seededFoldersPayload),
          pumpEff: pe,
          deletedItems: normalizeDeletedItems(data.deletedItems || data.deleted_items || [])
        };
        adoptState(seeded);
        resetHistoryToCurrent();
        await FB.docRef.set(seeded, { merge:true });
      }else{
        const docHasSettingsFolders = Array.isArray(data.settingsFolders);
        const docHasLegacyFolders = Array.isArray(data.folders);
        const docFoldersRaw = docHasSettingsFolders
          ? data.settingsFolders
          : (docHasLegacyFolders ? data.folders : null);
        const normalizedDocFolders = normalizeSettingsFolders(docFoldersRaw);

        adoptState(data);
        resetHistoryToCurrent();

        const localFoldersSnapshot = cloneFolders(window.settingsFolders);
        let shouldSyncFolders = !docHasSettingsFolders || !docHasLegacyFolders;
        if (!shouldSyncFolders){
          shouldSyncFolders = !foldersEqual(normalizedDocFolders, localFoldersSnapshot);
        }

        if (shouldSyncFolders){
          try {
            const payloadFolders = cloneFolders(localFoldersSnapshot);
            await FB.docRef.set({
              settingsFolders: payloadFolders,
              folders: cloneFolders(payloadFolders)
            }, { merge:true });
          } catch (err) {
            console.warn("Failed to sync folders to cloud:", err);
          }
        }
      }
    }else{
      const pe = (typeof window.pumpEff === "object" && window.pumpEff)
        ? window.pumpEff
        : (window.pumpEff = { baselineRPM:null, baselineDateISO:null, entries:[] });
      const defaultFolders = defaultSettingsFolders();
      const seeded = {
        schema: APP_SCHEMA,
        totalHistory: [],
        tasksInterval: defaultIntervalTasks.slice(),
        tasksAsReq: defaultAsReqTasks.slice(),
        inventory: seedInventoryFromTasks(),
        cuttingJobs: [],
        completedCuttingJobs: [],
        orderRequests: [createOrderRequest()],
        orderRequestTab: "active",
        pumpEff: pe,
        settingsFolders: defaultFolders,
        folders: cloneFolders(defaultFolders),
        garnetCleanings: [],
        deletedItems: []
      };
      adoptState(seeded);
      resetHistoryToCurrent();
      await FB.docRef.set(seeded);
    }
  }catch(e){
    console.error("Cloud load failed:", e);
    const pe = (typeof window.pumpEff === "object" && window.pumpEff)
      ? window.pumpEff
      : (window.pumpEff = { baselineRPM:null, baselineDateISO:null, entries:[] });
    const fallbackFolders = defaultSettingsFolders();
    adoptState({ schema:APP_SCHEMA, totalHistory:[], tasksInterval:defaultIntervalTasks.slice(), tasksAsReq:defaultAsReqTasks.slice(), inventory:seedInventoryFromTasks(), cuttingJobs:[], completedCuttingJobs:[], orderRequests:[createOrderRequest()], orderRequestTab:"active", pumpEff: pe, settingsFolders: fallbackFolders, folders: cloneFolders(fallbackFolders), garnetCleanings: [], deletedItems: [] });
    resetHistoryToCurrent();
  }
}

function seedInventoryFromTasks(){
  return [
    ...defaultIntervalTasks.map(t => ({ id:`inv_${t.id}`, name:t.name, qty:0, unit:"pcs", note:"", pn:t.pn||"", link:t.storeLink||"", price:t.price!=null?Number(t.price):null })),
    ...defaultAsReqTasks.map(t => ({ id:`inv_${t.id}`, name:t.name, qty:0, unit:"pcs", note:"", pn:t.pn||"", link:t.storeLink||"", price:t.price!=null?Number(t.price):null })),
  ];
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
  const pumpDefaults = { baselineRPM:null, baselineDateISO:null, entries:[] };
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
    garnetCleanings: [],
    pumpEff: { ...pumpDefaults },
    deletedItems: []
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

  adoptState(defaults);
  resetHistoryToCurrent();

  try {
    if (typeof window.localStorage !== "undefined" && window.localStorage){
      const storage = window.localStorage;
      [
        "dashboard_layout_windows_v1",
        "cost_layout_windows_v1",
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
  try { if (Array.isArray(window.pendingNewJobFiles)) window.pendingNewJobFiles.length = 0; } catch(_){ }
  if (typeof window.inventorySearchTerm === "string") window.inventorySearchTerm = "";
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

