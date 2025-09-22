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

window.APP_SCHEMA = APP_SCHEMA;

/* Root helpers */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
function debounce(fn, ms=250){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms);} }
function genId(name){ const b=(name||"item").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,""); return `${b}_${Date.now().toString(36)}`; }
function ymd(d){ const dt = new Date(d); const m = dt.getMonth()+1; const day = dt.getDate(); return `${dt.getFullYear()}-${m<10?'0':''}${m}-${day<10?'0':''}${day}`; }

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
  .calendar-toolbar{margin-bottom:8px}
  table{width:100%;border-collapse:collapse} th,td{border:1px solid #e6ecf7;padding:6px;text-align:left;vertical-align:top}
  .grid{width:100%}
  .month{border:1px solid #e6ecf7;border-radius:10px;overflow:hidden;margin-bottom:10px}
  .month-header{background:#eef3fb;padding:6px 10px;font-weight:600}
  .weekdays,.week{display:grid;grid-template-columns:repeat(7,1fr)}
  .weekdays>div{padding:4px 6px;background:#f6f9fe;border-bottom:1px solid #e6ecf7;font-size:12px}
  .day{min-height:78px;position:relative;border-right:1px solid #f0f4fb;border-bottom:1px solid #f0f4fb;padding:2px}
  .day.other-month{background:#fafbfd;opacity:.6}
  .day.today{outline:2px solid #0a63c2;outline-offset:-2px}
  .date{font-size:12px;color:#555;margin-bottom:2px}
  .event.generic,.job-bar{display:block;padding:2px 6px;margin:2px 0;border-radius:8px;cursor:pointer;border:1px solid transparent}
  .event.generic{background:#fff0d6;border-color:#ffe1a5}
  .job-bar{background:#e1efff;border-color:#cddffb}
  /* Bubble */
  #bubble.bubble{position:absolute;z-index:9999;background:#fff;border:1px solid #dfe6f3;border-radius:10px;box-shadow:0 6px 18px rgba(15,25,40,.12);padding:10px;min-width:260px}
  #bubble.bubble::before{content:"";position:absolute;top:-6px;left:16px;width:12px;height:12px;background:#fff;transform:rotate(45deg);border-left:1px solid #dfe6f3;border-top:1px solid #dfe6f3}
  .bubble-title{font-weight:700;margin-bottom:6px}
  .bubble-kv{display:flex;justify-content:space-between;gap:10px;font-size:13px;margin:3px 0}
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
if (!Array.isArray(window.pendingNewJobFiles)) window.pendingNewJobFiles = [];

if (typeof window.pumpEff !== "object" || !window.pumpEff){
  window.pumpEff = { baselineRPM:null, baselineDateISO:null, entries:[] };
}

let totalHistory = window.totalHistory;
let tasksInterval = window.tasksInterval;
let tasksAsReq    = window.tasksAsReq;
let inventory     = window.inventory;
let cuttingJobs   = window.cuttingJobs;

if (typeof window.inventorySearchTerm !== "string") window.inventorySearchTerm = "";
let inventorySearchTerm = window.inventorySearchTerm;

/* ================ Jobs editing & render flags ================ */
if (!(window.editingJobs instanceof Set)) window.editingJobs = new Set();
if (typeof window.RENDER_TOTAL !== "number") window.RENDER_TOTAL = null;
if (typeof window.RENDER_DELTA !== "number") window.RENDER_DELTA = 0;

const editingJobs  = window.editingJobs;
let   RENDER_TOTAL = window.RENDER_TOTAL;
let   RENDER_DELTA = window.RENDER_DELTA;

window.defaultIntervalTasks = defaultIntervalTasks;
window.defaultAsReqTasks = defaultAsReqTasks;

/* ==================== Cloud load / save ===================== */
function snapshotState(){
  const safePumpEff = (typeof window.pumpEff !== "undefined") ? window.pumpEff : null;
  return {
    schema: window.APP_SCHEMA || APP_SCHEMA,
    totalHistory,
    tasksInterval,
    tasksAsReq,
    inventory,
    cuttingJobs,
    pumpEff: safePumpEff
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
if (!Array.isArray(window.folders) || !window.folders.length) {
  window.folders = [
    { id: "root",     name: "All Tasks",    parent: null },
    { id: "interval", name: "Per Interval", parent: "root" },
    { id: "asreq",    name: "As Required",  parent: "root" },
  ];
}
const folders = window.folders;

/* ================ Explorer helper functions ================= */
function childrenFolders(parentId){
  return folders.filter(f => f.parent === parentId);
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

  window.totalHistory = totalHistory;
  window.tasksInterval = tasksInterval;
  window.tasksAsReq = tasksAsReq;
  window.inventory = inventory;
  window.cuttingJobs = cuttingJobs;
  if (!Array.isArray(window.pendingNewJobFiles)) window.pendingNewJobFiles = [];
  window.pendingNewJobFiles.length = 0;

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
        const seeded = {
          schema:APP_SCHEMA,
          totalHistory: Array.isArray(data.totalHistory) ? data.totalHistory : [],
          tasksInterval: defaultIntervalTasks.slice(),
          tasksAsReq: Array.isArray(data.tasksAsReq) && data.tasksAsReq.length ? data.tasksAsReq : defaultAsReqTasks.slice(),
          inventory: Array.isArray(data.inventory) && data.inventory.length ? data.inventory : seedInventoryFromTasks(),
          cuttingJobs: Array.isArray(data.cuttingJobs) ? data.cuttingJobs : [],
          pumpEff: pe
        };
        adoptState(seeded);
        resetHistoryToCurrent();
        await FB.docRef.set(seeded, { merge:true });
      }else{
        adoptState(data);
        resetHistoryToCurrent();
      }
    }else{
      const pe = (typeof window.pumpEff === "object" && window.pumpEff)
        ? window.pumpEff
        : (window.pumpEff = { baselineRPM:null, baselineDateISO:null, entries:[] });
      const seeded = { schema:APP_SCHEMA, totalHistory:[], tasksInterval:defaultIntervalTasks.slice(), tasksAsReq:defaultAsReqTasks.slice(), inventory:seedInventoryFromTasks(), cuttingJobs:[], pumpEff: pe };
      adoptState(seeded);
      resetHistoryToCurrent();
      await FB.docRef.set(seeded);
    }
  }catch(e){
    console.error("Cloud load failed:", e);
    const pe = (typeof window.pumpEff === "object" && window.pumpEff)
      ? window.pumpEff
      : (window.pumpEff = { baselineRPM:null, baselineDateISO:null, entries:[] });
    adoptState({ schema:APP_SCHEMA, totalHistory:[], tasksInterval:defaultIntervalTasks.slice(), tasksAsReq:defaultAsReqTasks.slice(), inventory:seedInventoryFromTasks(), cuttingJobs:[], pumpEff: pe });
    resetHistoryToCurrent();
  }
}

function seedInventoryFromTasks(){
  return [
    ...defaultIntervalTasks.map(t => ({ id:`inv_${t.id}`, name:t.name, qty:0, unit:"pcs", note:"", pn:t.pn||"", link:t.storeLink||"" })),
    ...defaultAsReqTasks.map(t => ({ id:`inv_${t.id}`, name:t.name, qty:0, unit:"pcs", note:"", pn:t.pn||"", link:t.storeLink||"" })),
  ];
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

