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

/* Persisted state */
let totalHistory = []; // [{dateISO,hours}]
let tasksInterval = [];
let tasksAsReq   = [];
let inventory    = [];
let cuttingJobs  = []; // [{id,name,estimateHours,material,materialCost,materialQty,notes,startISO,dueISO,manualLogs:[{dateISO,completedHours}]}]

/* Jobs editing */
let editingJobs = new Set();
let RENDER_TOTAL = null;
let RENDER_DELTA = 0;

/* --------- Cloud load/save --------- */
function snapshotState(){
  return { schema:APP_SCHEMA, totalHistory, tasksInterval, tasksAsReq, inventory, cuttingJobs, pumpEff };
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

  // Pump efficiency (guard against reading an undefined identifier)
  const pe = (typeof window.pumpEff === "object" && window.pumpEff)
    ? window.pumpEff
    : (window.pumpEff = { baselineRPM:null, baselineDateISO:null, entries:[] });

  if (data.pumpEff && typeof data.pumpEff === "object"){
    pe.baselineRPM     = (data.pumpEff.baselineRPM ?? pe.baselineRPM);
    pe.baselineDateISO = (data.pumpEff.baselineDateISO ?? pe.baselineDateISO);
    pe.entries         = Array.isArray(data.pumpEff.entries) ? data.pumpEff.entries.slice() : pe.entries;
  }
}


const saveCloudDebounced = debounce(async ()=>{
  if (!FB.ready || !FB.docRef) return;
  try{ await FB.docRef.set(snapshotState(), { merge:true }); }catch(e){ console.error("Cloud save failed:", e); }
}, 300);
async function loadFromCloud(){
  if (!FB.ready || !FB.docRef) return;
  try{
    const snap = await FB.docRef.get();
    if (snap.exists){
      const data = snap.data() || {};
      const needsSeed = !Array.isArray(data.tasksInterval) || data.tasksInterval.length === 0;
      if (needsSeed){
        const seeded = {
          schema:APP_SCHEMA,
          totalHistory: Array.isArray(data.totalHistory) ? data.totalHistory : [],
          tasksInterval: defaultIntervalTasks.slice(),
          tasksAsReq: Array.isArray(data.tasksAsReq) && data.tasksAsReq.length ? data.tasksAsReq : defaultAsReqTasks.slice(),
          inventory: Array.isArray(data.inventory) && data.inventory.length ? data.inventory : seedInventoryFromTasks(),
          cuttingJobs: Array.isArray(data.cuttingJobs) ? data.cuttingJobs : [],
          pumpEff
        };
        adoptState(seeded);
        await FB.docRef.set(seeded, { merge:true });
      }else{
        adoptState(data);
      }
    }else{
      const seeded = { schema:APP_SCHEMA, totalHistory:[], tasksInterval:defaultIntervalTasks.slice(), tasksAsReq:defaultAsReqTasks.slice(), inventory:seedInventoryFromTasks(), cuttingJobs:[], pumpEff };
      adoptState(seeded);
      await FB.docRef.set(seeded);
    }
  }catch(e){
    console.error("Cloud load failed:", e);
    adoptState({ schema:APP_SCHEMA, totalHistory:[], tasksInterval:defaultIntervalTasks.slice(), tasksAsReq:defaultAsReqTasks.slice(), inventory:seedInventoryFromTasks(), cuttingJobs:[], pumpEff });
  }
}

function seedInventoryFromTasks(){
  return [
    ...defaultIntervalTasks.map(t => ({ id:`inv_${t.id}`, name:t.name, qty:0, unit:"pcs", note:"", pn:t.pn||"", link:t.storeLink||"" })),
    ...defaultAsReqTasks.map(t => ({ id:`inv_${t.id}`, name:t.name, qty:0, unit:"pcs", note:"", pn:t.pn||"", link:t.storeLink||"" })),
  ];
}

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
  const since = liveSince(task);
  if (since == null) return null;
  const remain = Math.max(0, task.interval - since);
  const days = Math.round(remain / DAILY_HOURS);
  const due = new Date(); due.setHours(0,0,0,0); due.setDate(due.getDate() + days);
  const lastServicedAt = (RENDER_TOTAL != null && since != null) ? Math.max(0, RENDER_TOTAL - since) : null;
  return { since, remain, days, due, lastServicedAt };
}

/* ------------ Cutting jobs efficiency model ---------------
 * plannedHours = j.estimateHours
 * expectedHoursSoFar = min(planned, DAILY_HOURS * daysElapsed)
 * actualHoursSoFar   = manual override with carry-forward 8h/day; else AUTO 8h/day
 * deltaHours = actual - expected  ( + ahead / - behind )
 * gainLoss   = deltaHours * JOB_RATE_PER_HOUR
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
    deltaHours: 0,
    gainLoss: 0,
    daysElapsed: 0,
    totalDays: 0,
    usedManual: false,
    usedMachineTotals: false,
    usedFromStartAuto: false
  };
  if (!job || !job.startISO || !job.dueISO || planned <= 0) return result;

  // Dates
  const start = new Date(job.startISO); start.setHours(0,0,0,0);
  const due   = new Date(job.dueISO);   due.setHours(0,0,0,0);
  const today = new Date();              today.setHours(0,0,0,0);
  const asOf  = (today < due) ? today : due;

  // Schedule expectations (baseline = 8 hr/day)
  result.totalDays   = Math.max(0, Math.floor((due - start)/(24*60*60*1000)) + 1);
  result.daysElapsed = (asOf < start) ? 0 : Math.max(0, Math.floor((asOf - start)/(24*60*60*1000)) + 1);
  result.expectedHours = Math.min(planned, result.daysElapsed * DAILY_HOURS);

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

  // 1) If there is any manual log on/before "asOf", use the latest one EXACTLY (no auto add-on).
  const manualLogs = Array.isArray(job.manualLogs) ? job.manualLogs : [];
  const manualUpTo = manualLogs
    .filter(m => m && m.dateISO && new Date(m.dateISO+"T00:00:00") <= asOf)
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

  // Delta & $
  result.deltaHours = result.actualHours - result.expectedHours;   // + ahead / − behind
  result.gainLoss   = result.deltaHours * result.rate;

  return result;
}

/* ----------- Required hrs/day to hit due date ------------- */
function computeRequiredDaily(job){
  if (!job || !job.startISO || !job.dueISO) return { remainingHours:0, remainingDays:0, requiredPerDay:0 };
  const eff = computeJobEfficiency(job);
  const planned = Number(job.estimateHours) || 0;
  const remainingHours = Math.max(0, planned - eff.actualHours);

  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(job.dueISO); due.setHours(0,0,0,0);

  let remainingDays;
  if (today > due) remainingDays = 0;
  else remainingDays = Math.max(1, Math.floor((due - today)/(24*60*60*1000)) + 1);

  const requiredPerDay = remainingDays > 0 ? (remainingHours / remainingDays) : (remainingHours>0 ? Infinity : 0);
  return { remainingHours, remainingDays, requiredPerDay };
}

/* =================== PUMP EFFICIENCY ======================= */
window.pumpEff = window.pumpEff || { baselineRPM:null, baselineDateISO:null, entries:[] }; // [{dateISO:"yyyy-mm-dd", rpm:number}]

function upsertPumpEntry(dateISO, rpm){
  const d = String(dateISO);
  const r = Number(rpm);
  if (!isFinite(r) || r <= 0) return false;
  const i = pumpEff.entries.findIndex(e => e.dateISO === d);
  if (i >= 0) pumpEff.entries[i].rpm = r; else pumpEff.entries.push({ dateISO:d, rpm:r });
  pumpEff.entries.sort((a,b)=> a.dateISO.localeCompare(b.dateISO));
  return true;
}
function pumpLatest(){ return pumpEff.entries.length ? pumpEff.entries[pumpEff.entries.length-1] : null; }
function pumpPercentChange(latestRPM){
  if (!pumpEff.baselineRPM || !isFinite(latestRPM)) return null;
  return ((latestRPM - pumpEff.baselineRPM) / pumpEff.baselineRPM) * 100;
}
function pumpColorFor(pct){
  if (pct == null) return {cls:"gray", label:"—"};
  if (pct < 0) return {cls:"green-better", label:`${pct.toFixed(1)}% (better)`};
  if (pct > 18) return {cls:"red",    label:`${pct.toFixed(1)}%`};
  if (pct > 15) return {cls:"orange", label:`${pct.toFixed(1)}%`};
  if (pct >= 8) return {cls:"yellow", label:`${pct.toFixed(1)}%`};
  return {cls:"green",  label:`${pct.toFixed(1)}%`};
}

function viewPumpWidget(){
  const latest = pumpLatest();
  const pct    = latest ? pumpPercentChange(latest.rpm) : null;
  const col    = pumpColorFor(pct);
  const baselineVal = pumpEff.baselineRPM ?? "";
  const todayISO    = new Date().toISOString().slice(0,10);
  const latestTxt   = latest ? `${latest.rpm} RPM on ${latest.dateISO}` : "—";
  return `
  <details class="block pump-card" open>
    <summary><b>Pump Efficiency</b> <span class="chip ${col.cls}">${col.label}</span></summary>
    <div class="pump-grid">
      <div class="pump-col">
        <h4>Baseline @ 49 ksi</h4>
        <form id="pumpBaselineForm" class="mini-form">
          <input type="number" id="pumpBaselineRPM" min="1" step="1" placeholder="RPM" value="${baselineVal}">
          <button type="submit">Set baseline (today)</button>
        </form>
        <div class="small muted">Lower RPM = better. Baseline is recorded after a major/minor rebuild.</div>
        <h4 style="margin-top:10px">Daily log</h4>
        <form id="pumpLogForm" class="mini-form">
          <input type="date" id="pumpLogDate" value="${todayISO}" required>
          <input type="number" id="pumpLogRPM" min="1" step="1" placeholder="RPM at 49 ksi" required>
          <button type="submit">Add / Update</button>
        </form>
        <div class="pump-stats">
          <div><span class="lbl">Baseline:</span> <span>${pumpEff.baselineRPM ? `${pumpEff.baselineRPM} RPM (${pumpEff.baselineDateISO})` : "—"}</span></div>
          <div><span class="lbl">Latest:</span> <span>${latestTxt}</span></div>
        </div>
      </div>
      <div class="pump-col">
        <canvas id="pumpChart" width="520" height="180"></canvas>
        <div class="small muted" style="margin-top:6px">
          Color codes: <span class="chip green">0–&lt;8%</span> <span class="chip yellow">8–15%</span>
          <span class="chip orange">&gt;15–18%</span> <span class="chip red">&gt;18%</span>
          <span class="chip green-better">Negative = better</span>
        </div>
      </div>
    </div>
  </details>`;
}
function renderPumpWidget(){
  const host = document.getElementById("pump-widget");
  if (!host) return;
  host.innerHTML = viewPumpWidget();
  document.getElementById("pumpBaselineForm")?.addEventListener("submit",(e)=>{
    e.preventDefault();
    const rpm = Number(document.getElementById("pumpBaselineRPM").value);
    if (!isFinite(rpm) || rpm <= 0) { toast("Enter a valid RPM."); return; }
    pumpEff.baselineRPM     = rpm;
    pumpEff.baselineDateISO = new Date().toISOString().slice(0,10);
    saveCloudDebounced(); toast("Baseline set"); renderPumpWidget();
  });
  document.getElementById("pumpLogForm")?.addEventListener("submit",(e)=>{
    e.preventDefault();
    const d   = document.getElementById("pumpLogDate").value;
    const rpm = Number(document.getElementById("pumpLogRPM").value);
    if (!d || !isFinite(rpm) || rpm <= 0) { toast("Enter date and valid RPM."); return; }
    upsertPumpEntry(d, rpm); saveCloudDebounced(); toast("Log saved"); renderPumpWidget();
  });
  drawPumpChart(document.getElementById("pumpChart"));
}
function drawPumpChart(canvas){
  if (!canvas) return;
  const ctx = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H); ctx.fillStyle="#fff"; ctx.fillRect(0,0,W,H);
  if (!pumpEff.entries.length){ ctx.fillStyle="#888"; ctx.fillText("No pump logs yet.", 12, H/2); return; }
  const data = pumpEff.entries.slice();
  const dates = data.map(d=>new Date(d.dateISO+"T00:00:00"));
  const rpms  = data.map(d=>d.rpm);
  const minR  = Math.min(...rpms, pumpEff.baselineRPM ?? rpms[0]);
  const maxR  = Math.max(...rpms, pumpEff.baselineRPM ?? rpms[0]);
  const padY  = Math.max(5, (maxR-minR)*0.1);
  const xMin = dates[0].getTime(), xMax = dates[dates.length-1].getTime();
  const yMin = minR - padY, yMax = maxR + padY;
  const X=t=>((t-xMin)/Math.max(1,(xMax-xMin)))*(W-40)+30;
  const Y=v=>H-20-((v-yMin)/Math.max(1,(yMax-yMin)))*(H-40);
  ctx.strokeStyle="#e2e6f1"; ctx.beginPath(); ctx.moveTo(30,10); ctx.lineTo(30,H-20); ctx.lineTo(W-10,H-20); ctx.stroke();
  if (pumpEff.baselineRPM){
    ctx.strokeStyle="#999"; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(30,Y(pumpEff.baselineRPM)); ctx.lineTo(W-10,Y(pumpEff.baselineRPM)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle="#666"; ctx.fillText(`Baseline ${pumpEff.baselineRPM} RPM`, 34, Y(pumpEff.baselineRPM)-6);
  }
  ctx.strokeStyle="#0a63c2"; ctx.lineWidth=2; ctx.beginPath();
  dates.forEach((d,i)=>{ const x=X(d.getTime()), y=Y(rpms[i]); if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke();
  ctx.fillStyle="#0a63c2"; dates.forEach((d,i)=>{ const x=X(d.getTime()), y=Y(rpms[i]); ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill(); });
  const latest = pumpLatest();
  if (latest){
    const pct = pumpPercentChange(latest.rpm);
    const col = pumpColorFor(pct).cls;
    const map={green:"#2e7d32","green-better":"#2e7d32",yellow:"#c29b00",orange:"#d9822b",red:"#c62828",gray:"#777"};
    ctx.fillStyle = map[col] || "#333";
    ctx.fillText(`Latest: ${latest.rpm} RPM (${latest.dateISO})  Δ%=${pct!=null?pct.toFixed(1):"—"}`, 34, 18);
  }
}

/* ================== CALENDAR & BUBBLES ===================== */
let bubbleTimer = null;
function hideBubble(){ const b = document.getElementById("bubble"); if (b) b.remove(); }
function hideBubbleSoon(){ clearTimeout(bubbleTimer); bubbleTimer = setTimeout(hideBubble, 180); }
function makeBubble(anchor){
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
  const t = tasksInterval.find(x => String(x.id) === String(taskId));
  if (!t) return;
  const cur = RENDER_TOTAL ?? currentTotal();
  t.anchorTotal = cur != null ? cur : 0;
  t.sinceBase   = 0;
  saveCloudDebounced();
  toast("Task completed");
  route();
}

function showTaskBubble(taskId, anchor){
  const t = tasksInterval.find(x => x.id === taskId);
  if (!t) return;
  const nd = nextDue(t);
  const b  = makeBubble(anchor);
  b.innerHTML = `
    <div class="bubble-title">${t.name}</div>
    <div class="bubble-kv"><span>Interval:</span><span>${t.interval} hrs</span></div>
    <div class="bubble-kv"><span>Last serviced:</span><span>${nd ? nd.since.toFixed(0) : "—"} hrs ago</span></div>
    <div class="bubble-kv"><span>Remain:</span><span>${nd ? nd.remain.toFixed(0) : "—"} hrs</span></div>
    <div class="bubble-kv"><span>Cost:</span><span>${t.price != null ? ("$" + t.price) : "—"}</span></div>
    ${(t.manualLink || t.storeLink) ?
      `<div class="bubble-kv"><span>Links:</span><span>
        ${t.manualLink ? `<a href="${t.manualLink}" target="_blank" rel="noopener">Manual</a>` : ``}
        ${t.manualLink && t.storeLink ? ` · ` : ``}
        ${t.storeLink ? `<a href="${t.storeLink}" target="_blank" rel="noopener">Store</a>` : ``}
      </span></div>` : ``}
    <div class="bubble-actions">
      <button data-bbl-complete="${t.id}">Complete</button>
      <button class="danger" data-bbl-remove="${t.id}">Remove</button>
      <button data-bbl-edit="${t.id}">Edit settings</button>
    </div>`;

  // Action buttons
  b.querySelector("[data-bbl-complete]")?.addEventListener("click", ()=>{
    completeTask(taskId); hideBubble();
  });
  b.querySelector("[data-bbl-remove]")?.addEventListener("click", ()=>{
    tasksInterval = tasksInterval.filter(x => x.id !== taskId);
    saveCloudDebounced(); toast("Removed"); hideBubble(); route();
  });
  b.querySelector("[data-bbl-edit]")?.addEventListener("click", ()=>{
    hideBubble(); openSettingsAndReveal(taskId);
  });

  // NEW: click anywhere on the bubble (except buttons/links) → open Settings for this item
  b.addEventListener("click", (e)=>{
    // Ignore clicks on controls inside the bubble
    if (e.target.closest(".bubble-actions")) return;
    if (e.target.closest("button")) return;
    if (e.target.closest("a")) return;
    hideBubble();
    openSettingsAndReveal(taskId);
  });
}

function showJobBubble(jobId, anchor){
  const b = makeBubble(anchor);
  try{
    const j = cuttingJobs.find(x => String(x.id) === String(jobId));
    if (!j){
      b.innerHTML = `<div class="bubble-title">Job</div><div class="bubble-kv"><span>Info:</span><span>Job not found (id: ${jobId})</span></div>`;
      return;
    }
    const eff = computeJobEfficiency(j);
    const req = computeRequiredDaily(j);
    const sign  = eff.gainLoss >= 0 ? "+" : "−";
    const money = Math.abs(eff.gainLoss).toFixed(2);
    const reqCell = (req.requiredPerDay === Infinity)
      ? `<span class="danger">Past due / no days remaining</span>`
      : `${req.requiredPerDay.toFixed(2)} hr/day <span class="muted">(rem ${req.remainingHours.toFixed(1)} hr over ${req.remainingDays} day${req.remainingDays===1?"":"s"})</span>`;
    const noteAuto = eff.usedAutoFromManual
      ? `<div class="small"><strong>Auto from last manual</strong>: continuing at ${DAILY_HOURS} hr/day.</div>`
      : (eff.usedFromStartAuto ? `<div class="small"><strong>Auto</strong>: assuming ${DAILY_HOURS} hr/day from start.</div>` : ``);
    const startTxt = j.startISO ? new Date(j.startISO).toDateString() : "—";
    const dueTxt   = j.dueISO   ? new Date(j.dueISO).toDateString()   : "—";
    b.innerHTML = `
      <div class="bubble-title">${j.name}</div>
      <div class="bubble-kv"><span>Estimate:</span><span>${j.estimateHours} hrs</span></div>
      <div class="bubble-kv"><span>Material:</span><span>${j.material || "—"}</span></div>
      <div class="bubble-kv"><span>Schedule:</span><span>${startTxt} → ${dueTxt}</span></div>
      <div class="bubble-kv"><span>Hours Δ:</span><span>${eff.deltaHours>=0?"+":""}${eff.deltaHours.toFixed(1)} (exp ${eff.expectedHours.toFixed(1)} vs act ${eff.actualHours.toFixed(1)})</span></div>
      <div class="bubble-kv"><span>Gain/Loss:</span><span>${sign}$${money} @ $${eff.rate}/hr</span></div>
      <div class="bubble-kv"><span>Required/day:</span><span>${reqCell}</span></div>
      <div class="bubble-kv"><span>Notes:</span><span>${j.notes || "—"}</span></div>
      ${noteAuto}
      <div class="bubble-actions">
        <button type="button" data-bbl-edit-job="${j.id}">Edit</button>
        <button type="button" class="danger" data-bbl-remove-job="${j.id}">Remove</button>
      </div>`;
    b.querySelector("[data-bbl-remove-job]")?.addEventListener("click", ()=>{
      cuttingJobs = cuttingJobs.filter(x=>String(x.id)!==String(j.id)); saveCloudDebounced(); toast("Removed"); hideBubble(); route();
    });
    b.querySelector("[data-bbl-edit-job]")?.addEventListener("click", ()=>{ hideBubble(); openJobsEditor(j.id); });
  }catch(err){
    console.error(err);
    b.innerHTML = `<div class="bubble-title">Error</div><div class="bubble-kv"><span>Details:</span><span>${err.message||err}</span></div>`;
  }
}

function wireCalendarBubbles(){
  const months = $("#months"); if (!months) return;
  let hoverTarget = null;
  months.addEventListener("mouseover", (e)=>{
    const el = e.target.closest("[data-cal-job], [data-cal-task]");
    if (!el || el === hoverTarget) return;
    hoverTarget = el;
    if (el.dataset.calJob)  showJobBubble(el.dataset.calJob, el);
    if (el.dataset.calTask) showTaskBubble(el.dataset.calTask, el);
  });
  months.addEventListener("mouseout", (e)=>{
    const from = e.target.closest("[data-cal-job], [data-cal-task]");
    const to   = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest("[data-cal-job], [data-cal-task]");
    if (from && !to) { hoverTarget = null; hideBubbleSoon(); }
  });
  months.addEventListener("click", (e)=>{
    const el = e.target.closest("[data-cal-job], [data-cal-task]");
    if (!el) return;
    if (el.dataset.calJob)  showJobBubble(el.dataset.calJob, el);
    if (el.dataset.calTask) showTaskBubble(el.dataset.calTask, el);
  });
}

function renderCalendar(){
  const container = $("#months");
  if (!container) return;
  container.innerHTML = "";

  const dueMap = {};
  tasksInterval.forEach(t => {
    const nd = nextDue(t);
    if (!nd) return;
    const key = ymd(nd.due);
    (dueMap[key] ||= []).push({ type:"task", id:String(t.id), name:t.name });
  });

  const jobsMap = {};
  cuttingJobs.forEach(j => {
    if (!j.startISO || !j.dueISO) return;
    const start = new Date(j.startISO), end = new Date(j.dueISO);
    start.setHours(0,0,0,0); end.setHours(0,0,0,0);
    const cur = new Date(start);
    while (cur <= end){
      const key = ymd(cur);
      (jobsMap[key] ||= []).push({ type:"job", id:String(j.id), name:j.name });
      cur.setDate(cur.getDate()+1);
    }
  });

  const today = new Date(); today.setHours(0,0,0,0);
  for (let m=0; m<3; m++){
    const first = new Date(today.getFullYear(), today.getMonth()+m, 1);
    const last  = new Date(today.getFullYear(), today.getMonth()+m+1, 0);

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
      (dueMap[key]||[]).forEach(ev=>{
        const chip = document.createElement("div"); chip.className="event generic cal-task"; chip.dataset.calTask = ev.id; chip.textContent = `${ev.name} (due)`; cell.appendChild(chip);
      });
      (jobsMap[key]||[]).forEach(ev=>{
        const bar = document.createElement("div"); bar.className="job-bar cal-job"; bar.dataset.calJob = ev.id; bar.textContent = ev.name; cell.appendChild(bar);
      });
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
}

/* ========================= VIEWS ========================== */
function viewDashboard(){
  const cur   = RENDER_TOTAL ?? currentTotal();
  const prev  = previousTotal();
  const delta = RENDER_DELTA ?? deltaSinceLast();
  return `
  <div class="container">
    <!-- Total hours -->
    <div class="block">
      <h3>Total Hours</h3>
      <label>Enter total hours now:
        <input type="number" id="totalInput" value="${cur!=null?cur:""}" />
      </label>
      <button id="logBtn">Log Hours</button>
      <div class="hint">Last updated: ${cur!=null? new Date(totalHistory[totalHistory.length-1].dateISO).toLocaleString(): "—"}</div>
      <div class="small">Δ since last: <b>${(delta||0).toFixed(0)} hrs</b>${prev!=null? " (prev "+prev+")":""}</div>
    </div>

    <!-- Next due -->
    <div class="block">
      <h3>Next Due</h3>
      <div id="nextDueBox">Calculating…</div>
    </div>

    <!-- Pump Efficiency widget (rendered by renderPumpWidget) -->
    <section id="pump-widget" class="block"></section>

    <!-- Calendar -->
    <div class="block" style="grid-column: 1 / -1">
      <h3>Calendar (Current + Next 2 Months)</h3>

      <div class="calendar-toolbar">
        <form id="quickAddForm" class="mini-form">
          <strong>Quick add task:</strong>
          <input type="text" id="qa_name" placeholder="Task name" required>
          <input type="number" id="qa_interval" placeholder="Interval (hrs, blank = As Required)" min="0">
          <input type="text" id="qa_condition" placeholder="Condition (for As Required)">
          <button type="submit">Add</button>
        </form>
      </div>

      <div id="months"></div>
      <div class="small">Hover a due item for actions. Click to pin the bubble.</div>
    </div>
  </div>`;
}

function taskDetailsInterval(task){
  const nd = nextDue(task);
  const sinceTxt = nd ? `${nd.since.toFixed(0)} / ${task.interval} hrs` : "—";
  const daysTxt  = nd ? `${nd.days} day(s) → ${nd.due.toDateString()}` : "—";
  const lastServ = nd && nd.lastServicedAt != null ? `${nd.lastServicedAt.toFixed(0)} hrs` : "—";
  return `
  <details data-task-id="${task.id}">
    <summary>${task.name} — <span class="small">since: ${sinceTxt} | due: ${daysTxt}</span></summary>
    <div class="row"><label>Name:</label>
      <div><input type="text" data-k="name" data-id="${task.id}" data-list="interval" value="${task.name}" /></div>
    </div>
    <div class="row"><label>Interval (hrs):</label>
      <div><input type="number" min="1" data-k="interval" data-id="${task.id}" data-list="interval" value="${task.interval}" /></div>
    </div>
    <div class="row"><label>Baseline “since last” (hrs):</label>
      <div><input type="number" min="0" data-k="sinceBase" data-id="${task.id}" data-list="interval" value="${task.sinceBase != null ? task.sinceBase : ""}" /></div>
    </div>
    <div class="row"><label>When last serviced (hrs):</label>
      <div>${lastServ}</div>
    </div>
    <div class="row"><label>Manual link:</label>
      <div><input type="url" data-k="manualLink" data-id="${task.id}" data-list="interval" value="${task.manualLink || ""}" placeholder="PDF / guide URL" /></div>
    </div>
    <div class="row"><label>Store link:</label>
      <div><input type="url" data-k="storeLink" data-id="${task.id}" data-list="interval" value="${task.storeLink || ""}" placeholder="Where to buy" /></div>
    </div>
    <div class="row"><label>Part #:</label>
      <div><input type="text" data-k="pn" data-id="${task.id}" data-list="interval" value="${task.pn || ""}" /></div>
    </div>
    <div class="row"><label>Price:</label>
      <div><input type="number" step="0.01" min="0" data-k="price" data-id="${task.id}" data-list="interval" value="${task.price != null ? task.price : ""}" /></div>
    </div>
    <div class="row"><label>Actions:</label>
      <div>
        <button class="btn-complete" data-complete="${task.id}">Mark Completed Now</button>
        <button class="danger" data-remove="${task.id}" data-from="interval">Remove</button>
      </div>
    </div>
  </details>`;
}

function taskDetailsAsReq(task){
  return `
  <details data-task-id="${task.id}">
    <summary>${task.name} — <span class="small">${task.condition || "As required"}</span></summary>
    <div class="row"><label>Name:</label>
      <div><input type="text" data-k="name" data-id="${task.id}" data-list="asreq" value="${task.name}" /></div>
    </div>
    <div class="row"><label>Condition/Notes:</label>
      <div><input type="text" data-k="condition" data-id="${task.id}" data-list="asreq" value="${task.condition || ""}" placeholder="e.g., when clogged / visual check" /></div>
    </div>
    <div class="row"><label>Manual link:</label>
      <div><input type="url" data-k="manualLink" data-id="${task.id}" data-list="asreq" value="${task.manualLink || ""}" placeholder="PDF / guide URL" /></div>
    </div>
    <div class="row"><label>Store link:</label>
      <div><input type="url" data-k="storeLink" data-id="${task.id}" data-list="asreq" value="${task.storeLink || ""}" placeholder="Where to buy" /></div>
    </div>
    <div class="row"><label>Part #:</label>
      <div><input type="text" data-k="pn" data-id="${task.id}" data-list="asreq" value="${task.pn || ""}" /></div>
    </div>
    <div class="row"><label>Price:</label>
      <div><input type="number" step="0.01" min="0" data-k="price" data-id="${task.id}" data-list="asreq" value="${task.price != null ? task.price : ""}" /></div>
    </div>
    <div class="row"><label>Actions:</label>
      <div><button class="danger" data-remove="${task.id}" data-from="asreq">Remove</button></div>
    </div>
  </details>`;
}

function viewSettings(){
  // ------- Folder store (nesting via parent=null|folderId). Back-compat if older entries lack "parent".
  window.settingsFolders = Array.isArray(window.settingsFolders) ? window.settingsFolders : [];
  for (const f of window.settingsFolders) if (!("parent" in f)) f.parent = null;

  // ------- Small helpers (IDs/data-* kept the same so existing handlers work) -------
  const chipFor = (t)=>{
    const nd = nextDue(t);
    if (!nd) return `<span class="chip">—</span>`;
    const d = nd.days;
    let cls = "green";
    if (d <= 1) cls = "red"; else if (d <= 3) cls = "orange"; else if (d <= 7) cls = "yellow";
    return `<span class="chip ${cls}">${d}d → ${nd.due.toDateString()}</span>`;
  };

  const partRow = (p, parentId, listType) => `
    <div class="mini-form" data-part-row data-parent="${parentId}" data-list="${listType}" data-part-id="${p.pid}">
      <input type="text" placeholder="Part name" value="${p.name||""}"
             data-part-k="name" data-part-id="${p.pid}" data-parent="${parentId}" data-list="${listType}">
      <input type="text" placeholder="PN" value="${p.pn||""}"
             data-part-k="pn" data-part-id="${p.pid}" data-parent="${parentId}" data-list="${listType}">
      <input type="number" step="0.01" min="0" placeholder="Price" value="${p.price!=null?p.price:""}"
             data-part-k="price" data-part-id="${p.pid}" data-parent="${parentId}" data-list="${listType}">
      <input type="url" placeholder="Link" value="${p.link||""}"
             data-part-k="link" data-part-id="${p.pid}" data-parent="${parentId}" data-list="${listType}">
      <input type="text" placeholder="Note" value="${p.note||""}"
             data-part-k="note" data-part-id="${p.pid}" data-parent="${parentId}" data-list="${listType}">
      <button class="danger" type="button"
              data-part-remove="${p.pid}" data-parent="${parentId}" data-list="${listType}">Remove</button>
    </div>`;

  // One maintenance card (task). Kept attrs used by renderSettings().
  const card = (t, listType) => {
    const nd = nextDue(t);
    const lastServ = nd && nd.lastServicedAt != null ? `${nd.lastServicedAt.toFixed(0)} hrs` : "—";
    const parts = Array.isArray(t.parts) ? t.parts : [];
    return `
    <details class="block" draggable="true"
             data-task-id="${t.id}" data-list="${listType}" data-cat="${t.cat||""}">
      <summary style="display:flex;align-items:center;gap:8px;">
        <b>${t.name}</b>
        ${listType === "interval" ? `<span class="chip">${t.interval}h</span>` : `<span class="chip">As req.</span>`}
        ${listType === "interval" ? chipFor(t) : ""}
      </summary>

      <div class="mini-form" style="margin:8px 0 4px 0;">
        <label>Name: <input type="text" data-k="name" data-id="${t.id}" data-list="${listType}" value="${t.name}"></label>

        ${listType === "interval" ? `
        <label>Interval (hrs): <input type="number" min="1" data-k="interval" data-id="${t.id}" data-list="interval" value="${t.interval}"></label>
        <label>Baseline “since last” (hrs): <input type="number" min="0" data-k="sinceBase" data-id="${t.id}" data-list="interval" value="${t.sinceBase!=null?t.sinceBase:""}"></label>
        <div class="small muted">When last serviced: ${lastServ}</div>
        ` : `
        <label>Condition/Notes: <input type="text" data-k="condition" data-id="${t.id}" data-list="asreq" value="${t.condition||""}" placeholder="e.g., when clogged / visual check"></label>
        `}

        <label>Manual link: <input type="url" data-k="manualLink" data-id="${t.id}" data-list="${listType}" value="${t.manualLink||""}" placeholder="PDF / guide URL"></label>
        <label>Store link: <input type="url" data-k="storeLink" data-id="${t.id}" data-list="${listType}" value="${t.storeLink||""}" placeholder="Where to buy"></label>
        <label>Part # (primary): <input type="text" data-k="pn" data-id="${t.id}" data-list="${listType}" value="${t.pn||""}"></label>
        <label>Price (primary): <input type="number" step="0.01" min="0" data-k="price" data-id="${t.id}" data-list="${listType}" value="${t.price!=null?t.price:""}"></label>

        <div>
          <button class="btn-complete" data-complete="${t.id}">Mark Completed Now</button>
          <button class="danger" data-remove="${t.id}" data-from="${listType}">Remove</button>
        </div>
      </div>

      <div class="block" style="background:#fff;margin-top:8px;">
        <h4 style="margin:0 0 6px 0;">Sub-parts</h4>
        <div class="small muted">Nested parts remain searchable.</div>
        <div id="parts_${t.id}" data-part-list data-parent="${t.id}" data-list="${listType}">
          ${parts.map(p => partRow(p, t.id, listType)).join("") || `<div class="small muted">No sub-parts yet.</div>`}
        </div>
        <form class="mini-form" data-part-add-form data-parent="${t.id}" data-list="${listType}" style="margin-top:6px">
          <input type="text"  placeholder="Part name"  data-part-new="name"  required>
          <input type="text"  placeholder="PN"         data-part-new="pn">
          <input type="number" step="0.01" min="0" placeholder="Price" data-part-new="price">
          <input type="url"   placeholder="Link"       data-part-new="link">
          <input type="text"  placeholder="Note"       data-part-new="note">
          <button type="submit">+ Add sub-part</button>
        </form>
      </div>
    </details>`;
  };

  // ------- Folder tree helpers (shared category tree; tasks filtered per menu) -------
  const folders = window.settingsFolders;
  const kidsOf  = (parentId)=> folders.filter(f => (f.parent||null) === (parentId||null));
  const tasksIn = (list, folderId)=> (Array.isArray(list)?list:[]).filter(t => (t.cat||null) === (folderId||null));

  const renderFolder = (folder, listType) => {
    const subFolders = kidsOf(folder.id).map(sf => renderFolder(sf, listType)).join("");
    const list       = (listType==="interval"?tasksInterval:tasksAsReq);
    const tasksHtml  = tasksIn(list, folder.id).map(t => card(t, listType)).join("")
                      || `<div class="small muted">No items in this category.</div>`;
    return `
      <details class="folder block" data-folder-id="${folder.id}" open>
        <summary class="folder-title" style="display:flex;align-items:center;gap:10px;font-weight:700;">
          <span class="folder-name">${folder.name}</span>
          <span style="flex:1"></span>
          <button class="small" data-add-subfolder="${folder.id}">+ Sub-category</button>
          <button class="small" data-rename-folder="${folder.id}">Rename</button>
          <button class="danger small" data-remove-folder="${folder.id}">Remove</button>
        </summary>

        <div class="folder-dropzone small muted" data-drop-folder="${folder.id}"
             style="border:1px dashed #bbb; padding:6px; margin:6px 0; border-radius:8px;">
          Drag tasks here to move into <b>${folder.name}</b>
        </div>

        <div class="folder-children" data-folder-children="${folder.id}" data-dnd-scope="${listType}">
          ${subFolders}
          <div class="bubble-list" data-folder-body="${folder.id}">
            ${tasksHtml}
          </div>
        </div>
      </details>`;
  };

  // Root folders (parent=null)
  const rootFolders = kidsOf(null);

  // Root-level (no folder) tasks should appear at the top of each menu (no "Uncategorized" label).
  const rootTasksBlock = (listType)=>{
    const list = (listType==="interval" ? tasksInterval : tasksAsReq);
    const items = tasksIn(list, null).map(t => card(t, listType)).join("");
    return items || "";
  };

  // Menu shell: each maintenance type is a DROPDOWN now.
  const buildMenu = (listType, title) => {
    const menuDrop = `
      <div class="folder-dropzone small muted" data-drop-menu="${listType}"
           style="border:1px dashed #bbb; padding:6px; margin:6px 8px 10px 8px; border-radius:8px;">
        Drag here to move an item into <b>${title}</b> (${listType === "interval" ? "will require an Interval" : "as-needed"})
      </div>`;
    const listId = listType==="interval" ? "intervalList" : "asreqList";
    return `
      <details class="block" open data-menu="${listType}">
        <summary style="display:flex;align-items:center;gap:10px;font-weight:700;">
          <span>${title}</span>
          <span style="flex:1"></span>
          <!-- root add folder button stays global (#addFolderBtn) to keep existing handler -->
        </summary>
        ${menuDrop}
        <div id="${listId}" class="folder-list" data-dnd-scope="${listType}">
          ${rootTasksBlock(listType)}
          ${rootFolders.map(f => renderFolder(f, listType)).join("")}
        </div>
      </details>`;
  };

  // ------- Main shell (keeps existing IDs: #addIntervalForm, #addAsReqForm, #intervalList, #asreqList) -------
  return `
  <div class="container">
    <div class="block" style="grid-column: 1 / -1">
      <h3>Maintenance Settings</h3>

      <div class="mini-form" style="display:flex;gap:8px;align-items:center; margin-bottom:8px">
        <button id="addFolderBtn" title="Add a root category">+ Add Category</button>
        <span class="small muted">Drag items between menus or into categories. Folders can nest.</span>
      </div>

      <div class="add-forms" style="margin-bottom:8px">
        <form id="addIntervalForm" class="mini-form">
          <strong>Add Interval Task:</strong>
          <input type="text" id="ai_name" placeholder="Name" required>
          <input type="number" id="ai_interval" placeholder="Interval (hrs)" required min="1">
          <button type="submit">Add</button>
        </form>

        <form id="addAsReqForm" class="mini-form">
          <strong>Add As-Required Task:</strong>
          <input type="text" id="ar_name" placeholder="Name" required>
          <input type="text" id="ar_condition" placeholder="Condition (e.g., When damaged)">
          <button type="submit">Add</button>
        </form>
      </div>

      ${buildMenu("interval","Interval Hourly Maintenance")}
      ${buildMenu("asreq","As-Needed Maintenance")}

      <div style="margin-top:10px;">
        <button id="saveTasksBtn">Save All</button>
      </div>
    </div>
  </div>`;
}


function viewCosts(){
  return `
  <div class="container">
    <div class="block" style="grid-column: 1 / -1">
      <h3>Cost Analysis</h3>
      <p class="small">Per-interval & as-required items with optional price/links, plus cutting jobs efficiency impact and materials.</p>
    </div>

    <div class="block" style="grid-column: 1 / -1">
      <h4>Per Interval</h4>
      <table id="costTableInterval">
        <thead><tr><th>Item</th><th>Interval (hrs)</th><th>Cost</th><th>Links</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>

    <div class="block" style="grid-column: 1 / -1">
      <h4>As Required</h4>
      <table id="costTableAsReq">
        <thead><tr><th>Item</th><th>Condition</th><th>Cost</th><th>Links</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>

    <div class="block" style="grid-column: 1 / -1">
      <h4>Cutting Jobs</h4>
      <table id="costTableJobs">
        <thead>
          <tr>
            <th>Job</th><th>Estimate (hrs)</th><th>Material</th>
            <th>Material Cost ($)</th><th>Material Qty</th><th>Material Total ($)</th>
            <th>Efficiency (hr Δ → $Δ)</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
      <p class="small">Material fields are editable. Changes save automatically.</p>
    </div>
  </div>`;
}

function viewJobs(){
  const rows = cuttingJobs.map(j => {
    const eff = computeJobEfficiency(j);
    const req = computeRequiredDaily(j);
    const editing = editingJobs.has(j.id);

    // Material totals
    const matCost = Number(j.materialCost||0);
    const matQty  = Number(j.materialQty||0);
    const matTotal = (matCost * matQty) || 0;

    // Remaining & per-day
    const remainHrs = req.remainingHours || 0;
    const needPerDay = req.requiredPerDay === Infinity
      ? '∞'
      : (req.requiredPerDay||0).toFixed(2);

    // Profit delta (labor only) – keeps your original semantics (deltaHours * rate)
    const money = eff.gainLoss || 0;
    const moneyStyle = money >= 0 ? 'color:#2e7d32;font-weight:600' : 'color:#c43d3d;font-weight:600';
    const moneySign  = money >= 0 ? '+' : '−';
    const moneyAbs   = Math.abs(money).toFixed(2);

    // Dates (for display / edit row)
    const startTxt = j.startISO ? (new Date(j.startISO)).toDateString() : "—";
    const dueDate  = j.dueISO ? new Date(j.dueISO) : null;
    const dueTxt   = dueDate ? dueDate.toDateString() : "—";
    const dueVal   = dueDate ? dueDate.toISOString().slice(0,10) : "";

    if (!editing){
      // NORMAL ROW (with Log button UNDER the job name)
      return `<tr data-job-row="${j.id}">
        <td>
          <div><strong>${j.name}</strong></div>
          <div class="small muted">${startTxt} → ${dueTxt}</div>
          <div class="job-actions" style="margin-top:6px">
            <button data-log-job="${j.id}">Log</button>
          </div>
        </td>
        <td>${j.estimateHours} hrs</td>
        <td>${j.material || "—"}</td>
        <td><input type="number" class="matCost" data-id="${j.id}" value="${matCost}" step="0.01" min="0"></td>
        <td><input type="number" class="matQty" data-id="${j.id}" value="${matQty}" step="0.01" min="0"></td>
        <td>${matTotal.toFixed(2)}</td>
        <td>${remainHrs.toFixed(1)}</td>
        <td>${
          req.requiredPerDay === Infinity
            ? `<span class="danger">Past due</span>`
            : `${needPerDay} hr/day`
        }</td>
        <td><span style="${moneyStyle}">${moneySign}$${moneyAbs}</span></td>
        <td>
          <!-- Hidden placeholder prevents renderJobs() from injecting a duplicate Log button -->
          <span data-log-job="${j.id}" style="display:none"></span>
          <button data-edit-job="${j.id}">Edit</button>
          <button class="danger" data-remove-job="${j.id}">Remove</button>
        </td>
      </tr>`;
    } else {
      // EDIT ROW
      return `<tr data-job-row="${j.id}">
        <td><input type="text" data-j="name" data-id="${j.id}" value="${j.name}"></td>
        <td><input type="number" min="1" data-j="estimateHours" data-id="${j.id}" value="${j.estimateHours}"></td>
        <td><input type="text" data-j="material" data-id="${j.id}" value="${j.material||""}"></td>
        <td colspan="2">
          Start: <input type="date" data-j="startISO" data-id="${j.id}" value="${j.startISO||""}">
          Due:   <input type="date" data-j="dueISO"   data-id="${j.id}" value="${dueVal}">
        </td>
        <td>${matTotal.toFixed(2)}</td>
        <td colspan="3">
          <div class="small muted">${startTxt} → ${dueTxt}</div>
          <textarea data-j="notes" data-id="${j.id}" rows="2" placeholder="Notes...">${j.notes||""}</textarea>
        </td>
        <td>
          <button data-save-job="${j.id}">Save</button>
          <button class="danger" data-cancel-job="${j.id}">Cancel</button>
        </td>
      </tr>`;
    }
  }).join("");

  return `
  <div class="container">
    <div class="block" style="grid-column:1 / -1">
      <h3>Cutting Jobs</h3>
      <form id="addJobForm" class="mini-form">
        <input type="text" id="jobName" placeholder="Job name" required>
        <input type="number" id="jobEst" placeholder="Estimate (hrs)" required min="1">
        <input type="date" id="jobStart" required>
        <input type="date" id="jobDue" required>
        <button type="submit">Add Job</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Job</th>
            <th>Estimate (hrs)</th>
            <th>Material</th>
            <th>Material Cost ($)</th>
            <th>Material Qty</th>
            <th>Total $</th>
            <th>Hours Remaining</th>
            <th>Needed / Day</th>
            <th>Est. Add’l Profit</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="small">Material fields are editable. Changes save automatically.</p>
    </div>
  </div>`;
}

function viewInventory(){
  const rows = inventory.map(i => `
    <tr>
      <td>${i.name}</td>
      <td><input type="number" min="0" step="1" data-inv="qty" data-id="${i.id}" value="${i.qty}"></td>
      <td>${i.unit||"pcs"}</td>
      <td>${i.pn||"—"}</td>
      <td>${i.link ? `<a href="${i.link}" target="_blank" rel="noopener">link</a>` : "—"}</td>
      <td><input type="text" data-inv="note" data-id="${i.id}" value="${i.note||""}"></td>
    </tr>`).join("");
  return `
  <div class="container">
    <div class="block" style="grid-column:1 / -1">
      <h3>Inventory</h3>
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>PN</th><th>Link</th><th>Note</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

/* ====================== RENDERERS ========================= */
function renderDashboard(){
  const content = $("#content"); if (!content) return;
  content.innerHTML = viewDashboard();

  // Log hours
  document.getElementById("logBtn")?.addEventListener("click", ()=>{
    const v = Number(document.getElementById("totalInput").value);
    if (!isFinite(v) || v < 0){ toast("Enter valid hours."); return; }
    const todayISO = new Date().toISOString().slice(0,10);
    const last = totalHistory[totalHistory.length-1];
    if (last && last.dateISO === todayISO){
      last.hours = v;
    }else{
      totalHistory.push({ dateISO: todayISO, hours: v });
    }
    RENDER_TOTAL = v; RENDER_DELTA = deltaSinceLast();
    saveCloudDebounced(); toast("Hours logged");
    renderDashboard();
  });

  // Next due summary
  const ndBox = document.getElementById("nextDueBox");
  const upcoming = tasksInterval
    .map(t => ({ t, nd: nextDue(t) }))
    .filter(x => x.nd)
    .sort((a,b)=> a.nd.due - b.nd.due)
    .slice(0,8);
  ndBox.innerHTML = upcoming.length
    ? `<ul>${upcoming.map(x=>`<li><span class="cal-task" data-cal-task="${x.t.id}">${x.t.name}</span> — ${x.nd.days}d → ${x.nd.due.toDateString()}</li>`).join("")}</ul>`
    : `<div class="muted small">No upcoming due items.</div>`;

  // Quick add task
  document.getElementById("quickAddForm")?.addEventListener("submit",(e)=>{
    e.preventDefault();
    const name = document.getElementById("qa_name").value.trim();
    const interval = Number(document.getElementById("qa_interval").value);
    const cond = document.getElementById("qa_condition").value.trim();
    if (!name) return;
    if (isFinite(interval) && interval > 0){
      tasksInterval.push({ id: genId(name), name, interval, sinceBase:null, anchorTotal:null, manualLink:"", storeLink:"" });
    }else{
      tasksAsReq.push({ id: genId(name), name, condition: cond || "As required", manualLink:"", storeLink:"" });
    }
    saveCloudDebounced(); toast("Added"); renderDashboard();
  });

  renderCalendar();
  renderPumpWidget();
}

function openJobsEditor(jobId){
  // Navigate to the Jobs page, then open the specified job in edit mode.
  // We wait briefly so the router can render the page before we toggle edit.
  location.hash = "#/jobs";
  setTimeout(()=>{
    // Mark this job as "editing" so viewJobs() renders the edit row
    editingJobs.add(String(jobId));
    // Re-render Jobs with that state applied
    if (typeof renderJobs === "function") renderJobs();
    // Scroll the row into view for a clean handoff from the bubble
    const row = document.querySelector(`tr[data-job-row="${jobId}"]`);
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 60);
}


function openSettingsAndReveal(taskId){
  location.hash = "#/settings";
  setTimeout(()=>{
    const el = document.querySelector(`[data-task-id="${taskId}"]`);
    if (el){ el.open = true; el.scrollIntoView({behavior:"smooth", block:"center"}); }
  }, 60);
}

// --- SAFETY: repair tasks/folders graph so Settings never crashes ---
function repairMaintenanceGraph(){
  try{
    // Ensure arrays exist
    if (!Array.isArray(window.settingsFolders)) window.settingsFolders = [];
    if (!Array.isArray(window.tasksInterval))   window.tasksInterval   = [];
    if (!Array.isArray(window.tasksAsReq))      window.tasksAsReq      = [];

    // Build task map across both lists
    const allTasks = [];
    for (const t of window.tasksInterval){ if (t && t.id!=null){ t.__type="interval"; allTasks.push(t); } }
    for (const t of window.tasksAsReq){    if (t && t.id!=null){ t.__type="asreq";    allTasks.push(t); } }
    const tMap = Object.create(null);
    for (const t of allTasks) tMap[String(t.id)] = t;

    // Folder map
    const fMap = Object.create(null);
    for (const f of window.settingsFolders){ if (f && f.id!=null) fMap[String(f.id)] = f; }

    // --- Fix bad folder parents & cycles ---
    for (const f of window.settingsFolders){
      if (f.parent == null) continue;
      if (!fMap[String(f.parent)] || String(f.parent) === String(f.id)){
        f.parent = null; // orphan or self-parent → root
        continue;
      }
      // break cycles: walk up until root; if we re-meet self, detach
      const seen = new Set([String(f.id)]);
      let cur = f;
      let p = fMap[String(cur.parent)];
      while (p){
        const pid = String(p.id);
        if (seen.has(pid)){ f.parent = null; break; }
        seen.add(pid);
        if (p.parent == null) break;
        p = fMap[String(p.parent)] || null;
      }
    }

    // --- Fix bad task parentTask and cat (folder) pointers + cycles ---
    for (const t of allTasks){
      // self-parent or missing parent → detach
      if (t.parentTask != null){
        const pid = String(t.parentTask);
        if (pid === String(t.id) || !tMap[pid]) t.parentTask = null;
      }
      // folder ref to nowhere → clear
      if (t.cat != null && !fMap[String(t.cat)]) t.cat = null;

      // break cycles: follow parentTask chain and cut if we loop
      if (t.parentTask != null){
        const seen = new Set([String(t.id)]);
        let p = tMap[String(t.parentTask)];
        let safe = true;
        let hops = 0;
        while (p && hops++ < 1000){
          const pid = String(p.id);
          if (seen.has(pid)){ safe = false; break; }
          seen.add(pid);
          if (p.parentTask == null) break;
          p = tMap[String(p.parentTask)] || null;
        }
        if (!safe) t.parentTask = null;
      }

      // numeric 'order' normalization (optional but stabilizes rendering)
      if (!isFinite(t.order)) t.order = 0;
    }
    for (const f of window.settingsFolders){
      if (!isFinite(f.order)) f.order = 0;
    }
  }catch(err){
    console.warn("repairMaintenanceGraph failed:", err);
  }
}

// Move a node safely in the "Explorer" tree (categories + tasks).
// - kind: "task" | "category"
// - nodeId: the id being moved
// - target: { intoCat?: categoryId|null, intoTask?: taskId|null, beforeTask?: {id,type}, beforeCat?: {id} }
//   exactly ONE of intoCat / intoTask / beforeTask / beforeCat should be set
function moveNodeSafely(kind, nodeId, target){
  // Source collections
  window.settingsFolders = Array.isArray(window.settingsFolders) ? window.settingsFolders : [];
  window.tasksInterval = Array.isArray(window.tasksInterval) ? window.tasksInterval : [];
  window.tasksAsReq    = Array.isArray(window.tasksAsReq)    ? window.tasksAsReq    : [];

  // Helpers
  const findTask = (id)=>{
    let ref = window.tasksInterval.find(x=>String(x.id)===String(id));
    if (ref) return {ref, list:"interval"};
    ref = window.tasksAsReq.find(x=>String(x.id)===String(id));
    return ref ? {ref, list:"asreq"} : null;
  };
  const findCat = (id)=> window.settingsFolders.find(f=>String(f.id)===String(id)) || null;

  // Cycle guard for tasks: ensure parentTask chain of target never reaches nodeId
  function wouldCreateTaskCycle(childId, newParentTaskId){
    if (newParentTaskId == null) return false;
    let cur = findTask(newParentTaskId);
    let hops = 0;
    while (cur && cur.ref && hops++ < 1000){
      if (String(cur.ref.id) === String(childId)) return true;
      cur = (cur.ref.parentTask != null) ? findTask(cur.ref.parentTask) : null;
    }
    return false;
  }

  // Cycle guard for categories: prevent putting a category inside its own descendant
  function wouldCreateCatCycle(childCatId, newParentCatId){
    if (newParentCatId == null) return false;
    let cur = findCat(newParentCatId);
    let hops = 0;
    while (cur && hops++ < 1000){
      if (String(cur.id) === String(childCatId)) return true;
      cur = (cur.parent != null) ? findCat(cur.parent) : null;
    }
    return false;
  }

  // Order normalize within a list of siblings (highest = top)
  function normalizeOrders(nodes, writeBack){
    nodes.sort((a,b)=> (Number(b.order||0) - Number(a.order||0)) || String(a.name||"").localeCompare(String(b.name||"")));
    let n = nodes.length;
    for (const v of nodes){ v.order = n--; writeBack?.(v); }
  }

  // Ensure global counter
  if (typeof window._maintOrderCounter === "undefined") window._maintOrderCounter = 0;

  if (kind === "task"){
    const live = findTask(nodeId); if (!live) return false;

    // Destination resolution
    if (target.intoTask != null){
      // move inside a task (subcomponent)
      if (wouldCreateTaskCycle(live.ref.id, target.intoTask)) return false;
      const parentLive = findTask(target.intoTask); if (!parentLive) return false;
      live.ref.parentTask = parentLive.ref.id;
      live.ref.cat = parentLive.ref.cat || null; // inherit folder
      live.ref.order = ++window._maintOrderCounter;
    }else if (Object.prototype.hasOwnProperty.call(target, "intoCat")){
      // move into a category (top of that category)
      const catId = target.intoCat; // can be null = root
      if (catId != null && !findCat(catId)) return false;
      live.ref.parentTask = null;
      live.ref.cat = catId || null;
      live.ref.order = ++window._maintOrderCounter;
    }else if (target.beforeTask){
      // reorder before another task (same container)
      const t2 = findTask(target.beforeTask.id); if (!t2) return false;
      live.ref.parentTask = t2.ref.parentTask || null;
      live.ref.cat = t2.ref.cat || null;
      live.ref.order = (Number(t2.ref.order)||0) + 0.5;

      // normalize all tasks in that container
      const same = []
        .concat(window.tasksInterval.map(x=>({ref:x,list:"interval"})))
        .concat(window.tasksAsReq.map(x=>({ref:x,list:"asreq"})))
        .filter(x => String(x.ref.parentTask||"") === String(live.ref.parentTask||"")
                  && String(x.ref.cat||"")        === String(live.ref.cat||""))
        .map(x=>x.ref);
      normalizeOrders(same);
    }else{
      return false; // unsupported target shape
    }
    if (typeof saveCloudDebounced === "function") saveCloudDebounced();
    if (typeof saveTasks === "function") saveTasks();
    return true;
  }

  if (kind === "category"){
    const cat = findCat(nodeId); if (!cat) return false;

    if (Object.prototype.hasOwnProperty.call(target, "intoCat")){
      const parent = target.intoCat; // null = root
      if (wouldCreateCatCycle(cat.id, parent)) return false;
      if (parent != null && !findCat(parent)) return false;
      cat.parent = parent || null;
      cat.order = ++window._maintOrderCounter;
    }else if (target.beforeCat){
      const c2 = findCat(target.beforeCat.id); if (!c2) return false;
      cat.parent = c2.parent || null;
      cat.order = (Number(c2.order)||0) + 0.5;

      const siblings = window.settingsFolders.filter(f => String(f.parent||"") === String(cat.parent||""));
      normalizeOrders(siblings);
    }else{
      return false;
    }
    if (typeof saveCloudDebounced === "function") saveCloudDebounced();
    return true;
  }

  return false;
}

function renderSettings(){
  const root = document.getElementById("content");
  if (!root) return;

  // ------- Defensive: ensure arrays exist -------
  window.tasksInterval = Array.isArray(window.tasksInterval) ? window.tasksInterval : [];
  window.tasksAsReq    = Array.isArray(window.tasksAsReq)    ? window.tasksAsReq    : [];
  if (typeof window._maintOrderCounter === "undefined") window._maintOrderCounter = 0;

  // Persist helper (cloud or local)
  function persist(){
    if (typeof saveCloudDebounced === "function") { try { saveCloudDebounced(); } catch(_){} }
    if (typeof saveTasks === "function") { try { saveTasks(); } catch(_){} }
  }

  const fmtPrice = v => (v==null || v==="") ? "" : String(v);

  // ----- Minimal CSS (adds DnD visuals; no change to index.html needed) -----
  if (!document.getElementById("settingsDndCSS")){
    const st = document.createElement("style");
    st.id = "settingsDndCSS";
    st.textContent = `
      #maintSettings .bar{display:flex;gap:.5rem;margin-bottom:.75rem}
      #maintSettings details.task{border:1px solid #ddd;border-radius:8px;margin:.35rem 0;background:#fff}
      #maintSettings details.task>summary{display:flex;justify-content:space-between;align-items:center;padding:.5rem .6rem;cursor:grab;user-select:none}
      #maintSettings details.task.dragging{opacity:.55}
      #maintSettings .chip{font-size:.75rem;border:1px solid #bbb;border-radius:999px;padding:.1rem .5rem}
      #maintSettings .body{padding:.6rem .8rem;border-top:1px dashed #e5e5e5}
      #maintSettings .grid{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}
      #maintSettings label{font-size:.85rem;display:block}
      #maintSettings input{width:100%;padding:.4rem .5rem}
      #maintSettings .actions{display:flex;gap:.5rem;justify-content:flex-end;margin-top:.5rem;flex-wrap:wrap}
      #maintSettings .empty{padding:.8rem;color:#666}
      #maintSettings .forms{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin:.5rem 0 1rem}
      #maintSettings .forms .mini-form{border:1px solid #e5e5e5;border-radius:8px;padding:.5rem .6rem;background:#fff}
      #maintSettings .forms strong{display:block;margin-bottom:.35rem}
      /* DnD drop lines */
      #maintSettings .dz{height:8px;margin:4px 0;border-radius:6px}
      #maintSettings .dz.dragover{height:18px;background:rgba(0,0,0,.05);outline:2px dashed #888}
      #maintSettings summary.drop-hint{outline:2px solid #6aa84f;border-radius:6px}
    `;
    document.head.appendChild(st);
  }

  // ----- Row renderers (add draggable & drop-zones) -----
  function rowTemplate(task, type){
    const commonTop = `
      <div class="dz" data-drop-before="${task.id}" data-type="${type}"></div>
      <details class="task" data-task-id="${task.id}" data-type="${type}">
        <summary draggable="true">
          <strong style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:70%">${task.name}</strong>
          <span class="chip">${type === "interval" ? "Hourly Interval" : "As Required"}</span>
        </summary>
        <div class="body">
    `;
    const commonBottom = `
          <div class="actions">
            <button data-move-top="${task.id}" data-from="${type}">Move to Top</button>
            <button data-move-up="${task.id}"  data-from="${type}">Move Up</button>
            <button data-move-down="${task.id}" data-from="${type}">Move Down</button>
            ${type==="interval" ? `<button class="btn-complete" data-complete="${task.id}">Mark Completed Now</button>` : ""}
            <button class="danger" data-remove="${task.id}" data-from="${type}">Remove</button>
          </div>
        </div>
      </details>
    `;
    if (type === "interval"){
      return commonTop + `
          <div class="grid">
            <label>Name
              <input data-k="name" data-id="${task.id}" data-list="interval" value="${task.name||""}">
            </label>
            <label>Interval (hrs)
              <input type="number" min="1" step="1" data-k="interval" data-id="${task.id}" data-list="interval" value="${task.interval||""}">
            </label>
            <label>Baseline “since last” (hrs)
              <input type="number" min="0" step="1" data-k="sinceBase" data-id="${task.id}" data-list="interval" value="${task.sinceBase!=null?task.sinceBase:""}" placeholder="e.g., 50">
            </label>
            <label>Part #
              <input data-k="pn" data-id="${task.id}" data-list="interval" value="${task.pn||""}">
            </label>
            <label>Price
              <input type="number" step="0.01" min="0" data-k="price" data-id="${task.id}" data-list="interval" value="${fmtPrice(task.price)}" placeholder="optional">
            </label>
            <label>Store / Manual (URL)
              <input type="url" data-k="link" data-id="${task.id}" data-list="interval" value="${task.link||task.storeLink||task.manualLink||""}" placeholder="https://…">
            </label>
          </div>
      ` + commonBottom;
    }else{
      return commonTop + `
          <div class="grid">
            <label>Name
              <input data-k="name" data-id="${task.id}" data-list="asreq" value="${task.name||""}">
            </label>
            <label>Condition/Notes
              <input data-k="condition" data-id="${task.id}" data-list="asreq" value="${task.condition||""}" placeholder="optional">
            </label>
            <label>Part #
              <input data-k="pn" data-id="${task.id}" data-list="asreq" value="${task.pn||""}">
            </label>
            <label>Price
              <input type="number" step="0.01" min="0" data-k="price" data-id="${task.id}" data-list="asreq" value="${fmtPrice(task.price)}" placeholder="optional">
            </label>
            <label>Store / Manual (URL)
              <input type="url" data-k="link" data-id="${task.id}" data-list="asreq" value="${task.link||task.storeLink||task.manualLink||""}" placeholder="https://…">
            </label>
          </div>
      ` + commonBottom;
    }
  }

  // ----- Page view (kept same sectioning as your v6) -----
  const html = `
    <div id="maintSettings" class="container">
      <div class="block" style="grid-column:1 / -1">
        <h3>Maintenance Settings</h3>
        <p class="small">Drag a task onto another task to make it a sub-component. Drag onto a thin line to reorder.</p>

        <div class="forms">
          <form id="addIntervalForm" class="mini-form">
            <strong>Add Interval Task</strong>
            <input type="text" id="ai_name" placeholder="Name" required>
            <input type="number" id="ai_interval" placeholder="Interval (hrs)" required>
            <button type="submit">Add</button>
          </form>

          <form id="addAsReqForm" class="mini-form">
            <strong>Add As-Required Task</strong>
            <input type="text" id="ar_name" placeholder="Name" required>
            <input type="text" id="ar_condition" placeholder="Condition (e.g., When damaged)">
            <button type="submit">Add</button>
          </form>
        </div>

        <h4>By Interval (hrs)</h4>
        <div id="intervalList">
          ${tasksInterval.map(t => rowTemplate(t,"interval")).join("")}
          <div class="dz" data-drop-end="interval"></div>
        </div>

        <h4 style="margin-top:16px;">As Required</h4>
        <div id="asreqList">
          ${tasksAsReq.map(t => rowTemplate(t,"asreq")).join("")}
          <div class="dz" data-drop-end="asreq"></div>
        </div>

        <div style="margin-top:10px;">
          <button id="saveTasksBtn">Save All</button>
        </div>
      </div>
    </div>
  `;
  root.innerHTML = html;

  // ------- Inline edit bindings -------
  root.querySelectorAll("[data-id]").forEach(inp => {
    inp.addEventListener("input", () => {
      const id   = inp.getAttribute("data-id");
      const key  = inp.getAttribute("data-k");
      const list = inp.getAttribute("data-list");           // "interval" | "asreq"
      const arr  = list === "interval" ? tasksInterval : tasksAsReq;
      const t = arr.find(x => String(x.id) === String(id));
      if (!t) return;
      let val = inp.value;
      if (["interval","sinceBase","price"].includes(key)){
        val = (val === "" ? null : Number(val));
        if (key === "interval" && val != null && val < 1) val = 1;
      }
      t[key] = val;
      persist();
    });
  });

  // ------- Remove + Complete buttons -------
  root.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove");
      const from = btn.getAttribute("data-from");
      if (from === "interval") tasksInterval = tasksInterval.filter(t => String(t.id)!==String(id));
      else tasksAsReq = tasksAsReq.filter(t => String(t.id)!==String(id));
      persist();
      renderSettings();
    });
  });
  root.querySelectorAll(".btn-complete").forEach(btn => {
    btn.addEventListener("click", () => {
      if (typeof completeTask === "function"){
        completeTask(btn.getAttribute("data-complete"));
      } else {
        const id = btn.getAttribute("data-complete");
        const t = tasksInterval.find(x => String(x.id)===String(id));
        if (t){
          const cur = (typeof currentTotal === "function") ? currentTotal() : null;
          t.anchorTotal = cur!=null ? cur : 0;
          t.sinceBase = 0;
          persist();
        }
      }
      renderSettings();
    });
  });

  // ------- Move Up / Down / Top (click controls) -------
  function moveIn(arr, id, dir){
    const i = arr.findIndex(x => String(x.id) === String(id));
    if (i < 0) return;
    if (dir === "top"){
      const [sp] = arr.splice(i,1);
      arr.unshift(sp);
      return;
    }
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= arr.length) return;
    const [sp] = arr.splice(i,1);
    arr.splice(j,0,sp);
  }
  root.addEventListener("click",(e)=>{
    const up  = e.target.closest("[data-move-up]");
    const dn  = e.target.closest("[data-move-down]");
    const top = e.target.closest("[data-move-top]");
    if (!up && !dn && !top) return;

    const id   = (up||dn||top).getAttribute(up? "data-move-up" : dn? "data-move-down" : "data-move-top");
    const from = (up||dn||top).getAttribute("data-from"); // "interval" | "asreq"
    const arr  = from === "interval" ? tasksInterval : tasksAsReq;

    moveIn(arr, id, top ? "top" : (up ? "up" : "down"));
    persist();
    renderSettings();
  });

  // ------- Add forms (insert TOP) -------
  document.getElementById("addIntervalForm")?.addEventListener("submit",(e)=>{
    e.preventDefault();
    const name = document.getElementById("ai_name").value.trim();
    const interval = Number(document.getElementById("ai_interval").value);
    if (!name || !isFinite(interval) || interval <= 0) return;
    const id = (name.toLowerCase().replace(/[^a-z0-9]+/g,"_") + "_" + Date.now());
    tasksInterval.unshift({ id, name, interval, sinceBase:null, anchorTotal:null, cost:"", link:"", parentTask:null, cat:null });
    if (typeof inventory !== "undefined" && Array.isArray(inventory)){
      inventory.push({ id:"inv_"+id, name, qty:0, unit:"pcs", note:"", pn:"", link:"" });
      if (typeof saveInventory === "function") saveInventory();
    }
    persist();
    renderSettings();
  });
  document.getElementById("addAsReqForm")?.addEventListener("submit",(e)=>{
    e.preventDefault();
    const name = document.getElementById("ar_name").value.trim();
    const condition = (document.getElementById("ar_condition").value || "").trim() || "As required";
    if (!name) return;
    const id = (name.toLowerCase().replace(/[^a-z0-9]+/g,"_") + "_" + Date.now());
    tasksAsReq.unshift({ id, name, condition, cost:"", link:"", parentTask:null, cat:null });
    if (typeof inventory !== "undefined" && Array.isArray(inventory)){
      inventory.push({ id:"inv_"+id, name, qty:0, unit:"pcs", note:"", pn:"", link:"" });
      if (typeof saveInventory === "function") saveInventory();
    }
    persist();
    renderSettings();
  });

  document.getElementById("saveTasksBtn")?.addEventListener("click", ()=>{
    persist();
    if (typeof route === "function") route();
  });

  // ------- DRAG & DROP (Explorer-style) -------
  const maint = document.getElementById("maintSettings");
  const DRAG = { id:null, type:null };

  // Start dragging from any task summary
  maint.addEventListener("dragstart",(e)=>{
    const sum = e.target.closest("summary");
    const card = e.target.closest("details.task");
    if (!sum || !card) return;
    const id   = card.getAttribute("data-task-id");
    const type = card.getAttribute("data-type");
    DRAG.id = id; DRAG.type = type;
    card.classList.add("dragging");
    e.dataTransfer.setData("text/plain", `task:${id}:${type}`); // also usable by Categories pane
    e.dataTransfer.effectAllowed = "move";
  });

  maint.addEventListener("dragend",(e)=>{
    const card = e.target.closest("details.task");
    card?.classList.remove("dragging");
    DRAG.id = DRAG.type = null;
    maint.querySelectorAll(".dz.dragover").forEach(el=>el.classList.remove("dragover"));
    maint.querySelectorAll("summary.drop-hint").forEach(el=>el.classList.remove("drop-hint"));
  });

  function allow(e){ e.preventDefault(); e.dataTransfer.dropEffect = "move"; }

  // Hover feedback: lines (reorder) or headers (into)
  maint.addEventListener("dragover",(e)=>{
    const dz = e.target.closest(".dz");
    const sum = e.target.closest("summary");
    if (dz){ allow(e); dz.classList.add("dragover"); }
    if (sum){ allow(e); sum.classList.add("drop-hint"); }
  });
  maint.addEventListener("dragleave",(e)=>{
    const dz = e.target.closest(".dz"); dz?.classList.remove("dragover");
    const sum = e.target.closest("summary"); sum?.classList.remove("drop-hint");
  });

  maint.addEventListener("drop",(e)=>{
    const payload = e.dataTransfer.getData("text/plain") || "";
    const [kind, dragId, dragType] = payload.split(":");
    if (kind !== "task" || !dragId) return;
    e.preventDefault();

    const dz  = e.target.closest(".dz");
    const sum = e.target.closest("summary");

    // Reorder: drop on line → place BEFORE that task (same container as target)
    if (dz && dz.hasAttribute("data-drop-before")){
      const beforeId   = dz.getAttribute("data-drop-before");
      const beforeType = dz.getAttribute("data-type"); // not strictly needed, kept for future guards
      if (typeof moveNodeSafely === "function"){
        if (moveNodeSafely("task", dragId, { beforeTask:{ id: beforeId, type: beforeType } })){
          persist();
          renderSettings();
          if (typeof renderSettingsCategoriesPane === "function") renderSettingsCategoriesPane(); // refresh folder view
        }
      }
      return;
    }

    // Drop at end of list
    if (dz && dz.hasAttribute("data-drop-end")){
      const listType = dz.getAttribute("data-drop-end"); // "interval" | "asreq"
      const arr = (listType==="interval") ? tasksInterval : tasksAsReq;
      if (arr.length){
        const lastId = arr[arr.length-1].id;
        if (typeof moveNodeSafely === "function"){
          if (moveNodeSafely("task", dragId, { beforeTask:{ id: lastId, type: listType } })){
            persist(); renderSettings(); if (typeof renderSettingsCategoriesPane==="function") renderSettingsCategoriesPane();
          }
        }
      }
      return;
    }

    // Into-task: drop on header → become its sub-component
    if (sum){
      const holder = sum.closest("details.task");
      const parentId = holder?.getAttribute("data-task-id");
      if (parentId && typeof moveNodeSafely === "function"){
        if (moveNodeSafely("task", dragId, { intoTask: parentId })){
          persist();
          renderSettings();
          if (typeof renderSettingsCategoriesPane === "function") renderSettingsCategoriesPane();
        }
      }
      return;
    }
  });

  // ------- Also render folder pane on top -------
  if (typeof renderSettingsCategoriesPane === "function"){
    renderSettingsCategoriesPane();
  }
}


function renderJobs(){
  const content = document.getElementById("content"); 
  if (!content) return;

  // 1) Render the jobs view (includes the table with the Actions column)
  content.innerHTML = viewJobs();

  // 2) Insert a "Log" button into each job row's Actions cell (non-edit rows)
  content.querySelectorAll('tr[data-job-row]').forEach(tr=>{
    const id = tr.getAttribute('data-job-row');
    let actionsCell = tr.querySelector('td:last-child');
    // Fallback: if the row didn’t render an Actions cell, add one
    if (!actionsCell){ actionsCell = document.createElement('td'); tr.appendChild(actionsCell); }
    const logBtn = document.createElement('button');
    logBtn.textContent = 'Log';
    logBtn.setAttribute('data-log-job', id);
    actionsCell.prepend(logBtn); // put Log before Edit/Remove
  });

  // 3) Small, scoped helpers for manual log math + defaults
  const todayISO = (()=>{ const d=new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); })();
  const curTotal = ()=> (RENDER_TOTAL ?? currentTotal());

  function getHoursAt(dateISO){
    // Machine totalHours reading at or before dateISO
    if (!Array.isArray(totalHistory) || !totalHistory.length) return null;
    const target = new Date(dateISO + "T00:00:00");
    let best = null;
    for (const h of totalHistory){
      const d = new Date(h.dateISO + "T00:00:00");
      if (d <= target){ if (best==null || d > new Date(best.dateISO+"T00:00:00")) best = h; }
    }
    return best ? Number(best.hours) : null;
  }
  function lastManual(job){
    if (!job || !Array.isArray(job.manualLogs) || job.manualLogs.length===0) return null;
    const logs = job.manualLogs.slice().sort((a,b)=> a.dateISO.localeCompare(b.dateISO));
    return logs[logs.length-1];
  }
  function machineSinceStart(job){
    if (!job?.startISO) return 0;
    const startH = getHoursAt(job.startISO);
    const nowH   = curTotal();
    if (startH==null || nowH==null) return 0;
    return Math.max(0, nowH - startH);
  }
  function suggestSpent(job){
    // Suggest “spent since last manual” using 8 hrs/day; if no manual, 0
    const lm = lastManual(job);
    if (lm){
      const last = new Date(lm.dateISO + "T00:00:00");
      const today = new Date(todayISO + "T00:00:00");
      const days = Math.max(0, Math.floor((today - last)/(24*60*60*1000)));
      return days * DAILY_HOURS;
    }
    return 0;
  }
  const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

  // 4) Add Job (unchanged)
  document.getElementById("addJobForm")?.addEventListener("submit",(e)=>{
    e.preventDefault();
    const name  = document.getElementById("jobName").value.trim();
    const est   = Number(document.getElementById("jobEst").value);
    const start = document.getElementById("jobStart").value;
    const due   = document.getElementById("jobDue").value;
    if (!name || !isFinite(est) || est<=0 || !start || !due){ toast("Fill job fields."); return; }
    cuttingJobs.push({ id: genId(name), name, estimateHours:est, startISO:start, dueISO:due, material:"", notes:"", manualLogs:[] });
    saveCloudDebounced(); renderJobs();
  });

  // 5) Inline material $/qty (kept)
  content.querySelector("tbody")?.addEventListener("change",(e)=>{
    if (e.target.matches("input.matCost, input.matQty")){
      const id = e.target.getAttribute("data-id");
      const j = cuttingJobs.find(x=>x.id===id); if (!j) return;
      j.materialCost = Number(content.querySelector(`input.matCost[data-id="${id}"]`).value)||0;
      j.materialQty  = Number(content.querySelector(`input.matQty[data-id="${id}"]`).value)||0;
      saveCloudDebounced();
      renderJobs();
    }
  });

  // 6) Edit/Remove/Save/Cancel + Log panel + Apply spent/remaining
  content.querySelector("tbody")?.addEventListener("click",(e)=>{
    const ed = e.target.closest("[data-edit-job]");
    const rm = e.target.closest("[data-remove-job]");
    const sv = e.target.closest("[data-save-job]");
    const ca = e.target.closest("[data-cancel-job]");
    const lg = e.target.closest("[data-log-job]");
    const apSpent  = e.target.closest("[data-log-apply-spent]");
    const apRemain = e.target.closest("[data-log-apply-remain]");

    // Edit
    if (ed){ editingJobs.add(ed.getAttribute("data-edit-job")); renderJobs(); return; }

    // Remove
    if (rm){
      const id = rm.getAttribute("data-remove-job");
      cuttingJobs = cuttingJobs.filter(x=>x.id!==id);
      saveCloudDebounced(); toast("Removed"); renderJobs(); 
      return;
    }

    // Save (from edit row)
    if (sv){
      const id = sv.getAttribute("data-save-job");
      const j  = cuttingJobs.find(x=>x.id===id); if (!j) return;
      const qs = (k)=> content.querySelector(`[data-j="${k}"][data-id="${id}"]`)?.value;
      j.name = qs("name") || j.name;
      j.estimateHours = Math.max(1, Number(qs("estimateHours"))||j.estimateHours||1);
      j.material = qs("material") || j.material || "";
      j.startISO = qs("startISO") || j.startISO;
      j.dueISO   = qs("dueISO")   || j.dueISO;
      j.notes    = content.querySelector(`[data-j="notes"][data-id="${id}"]`)?.value || j.notes || "";
      editingJobs.delete(id);
      saveCloudDebounced(); renderJobs();
      return;
    }

    // Cancel edit
    if (ca){ editingJobs.delete(ca.getAttribute("data-cancel-job")); renderJobs(); return; }

    // Toggle inline Log panel (adds both "spent" and "remaining" controls)
    if (lg){
      const id = lg.getAttribute("data-log-job");
      const anchor   = content.querySelector(`tr[data-job-row="${id}"]`);
      const existing = content.querySelector(`tr[data-log-row="${id}"]`);
      if (existing){ existing.remove(); return; }
      if (!anchor) return;

      const j  = cuttingJobs.find(x=>x.id===id); if (!j) return;
      const lm = lastManual(j);
      const spentSuggest = suggestSpent(j);
      const completedSoFar = lm ? Number(lm.completedHours)||0 : 0;
      const machineInitNote = (!lm && machineSinceStart(j)>0)
        ? `<div class="muted small">Prefilled uses <strong>machine hours since start</strong> when available.</div>` : ``;

      const trForm = document.createElement("tr");
      trForm.className = "manual-log-row";
      trForm.setAttribute("data-log-row", id);
      trForm.innerHTML = `
        <td colspan="8">
          <div class="mini-form" style="display:grid; gap:8px; align-items:end; grid-template-columns: repeat(6, minmax(0,1fr));">
            <div style="grid-column:1/7">
              <strong>Manual Log for: ${j.name}</strong>
              <div class="small muted">Last manual ${ lm ? `${lm.completedHours} hr on ${lm.dateISO}` : "— none" }. ${machineInitNote}</div>
            </div>

            <label style="display:block">
              <span class="muted">Add time spent (hrs)</span>
              <input type="number" step="0.1" min="0" id="manSpent_${id}" value="${spentSuggest.toFixed(1)}">
            </label>
            <div style="display:flex; gap:8px; align-items:center">
              <button data-log-apply-spent="${id}">Apply spent</button>
            </div>

            <label style="display:block">
              <span class="muted">Set time remaining (hrs)</span>
              <input type="number" step="0.1" min="0" id="manRemain_${id}" value="">
            </label>
            <div style="display:flex; gap:8px; align-items:center">
              <button data-log-apply-remain="${id}">Apply remaining</button>
            </div>
          </div>
        </td>`;
      anchor.insertAdjacentElement("afterend", trForm);
      return;
    }

    // Apply "spent" (increment completedHours)
    if (apSpent){
      const id = apSpent.getAttribute("data-log-apply-spent");
      const j  = cuttingJobs.find(x=>x.id===id); if (!j) return;
      const add = Number(content.querySelector(`#manSpent_${id}`)?.value);
      if (!isFinite(add) || add < 0){ toast("Enter a valid spent hours."); return; }

      const lm = lastManual(j);
      const base = lm ? (Number(lm.completedHours)||0) : machineSinceStart(j);
      const est  = Number(j.estimateHours)||0;
      const newCompleted = clamp(base + add, 0, est);

      j.manualLogs = Array.isArray(j.manualLogs) ? j.manualLogs : [];
      const idx = j.manualLogs.findIndex(m => m.dateISO === todayISO);
      if (idx >= 0) j.manualLogs[idx].completedHours = newCompleted;
      else j.manualLogs.push({ dateISO: todayISO, completedHours: newCompleted });
      j.manualLogs.sort((a,b)=> a.dateISO.localeCompare(b.dateISO));

      saveCloudDebounced(); toast("Manual hours updated"); renderJobs();
      return;
    }

    // Apply "remaining" (set completedHours = estimate - remaining)
    if (apRemain){
      const id = apRemain.getAttribute("data-log-apply-remain");
      const j  = cuttingJobs.find(x=>x.id===id); if (!j) return;
      const remain = Number(content.querySelector(`#manRemain_${id}`)?.value);
      const est    = Number(j.estimateHours)||0;
      if (!isFinite(remain) || remain < 0){ toast("Enter valid remaining hours."); return; }

      const completed = clamp(est - remain, 0, est);
      j.manualLogs = Array.isArray(j.manualLogs) ? j.manualLogs : [];
      const idx = j.manualLogs.findIndex(m => m.dateISO === todayISO);
      if (idx >= 0) j.manualLogs[idx].completedHours = completed;
      else j.manualLogs.push({ dateISO: todayISO, completedHours: completed });
      j.manualLogs.sort((a,b)=> a.dateISO.localeCompare(b.dateISO));

      saveCloudDebounced(); toast("Remaining → completed set"); renderJobs();
      return;
    }
  });
}

function renderInventory(){
  const content = document.getElementById("content"); if (!content) return;
  content.innerHTML = viewInventory();
  document.querySelector("tbody")?.addEventListener("input",(e)=>{
    const input = e.target;
    const id = input.getAttribute("data-id");
    const k  = input.getAttribute("data-inv");
    const item = inventory.find(x=>x.id===id); if (!item) return;
    if (k==="qty"){ item.qty = Math.max(0, Number(input.value)||0); }
    else if (k==="note"){ item.note = input.value; }
    saveCloudDebounced();
  });
}

function renderSignedOut(){
  const content = document.getElementById("content"); if (!content) return;
  content.innerHTML = `<div class='container'><div class='block'><h3>Please sign in to view workspace.</h3></div></div>`;
}

/* ========================= ROUTER ========================= */
function nav(){
  return `<div class="topnav">
    <button data-go="#/">Dashboard</button>
    <button data-go="#/settings">Settings</button>
    <button data-go="#/jobs">Jobs</button>
    <button data-go="#/costs">Costs</button>
    <button data-go="#/inventory">Inventory</button>
    <span class="right" id="authStatus">—</span>
    <button id="btnSignIn" style="margin-left:4px">Sign in</button>
    <button id="btnSignOut" style="display:none;margin-left:4px">Sign out</button>
  </div>`;
}

function route(){
  // Ensure a content root exists
  let content = document.getElementById("content");
  if (!content) {
    content = document.createElement("div");
    content.id = "content";
    document.body.appendChild(content);
  }

  // --- Wire header <nav> anchors to the router (one-time) ---
  // index.html provides: <a href="#dashboard">, <a href="#settings">, etc.
  // We normalize those to "#/..." so both styles are supported.
  const headerNav = document.querySelector("header .nav");
  if (headerNav && !headerNav.__wired) {
    headerNav.addEventListener("click", (e)=>{
      const a = e.target.closest("a[href^='#']");
      if (!a) return;
      const href = a.getAttribute("href") || "#dashboard";
      // Normalize: "#dashboard" -> "#/"; "#settings" -> "#/settings"; etc.
      const norm = normalizeHash(href);
      if (location.hash !== norm) {
        e.preventDefault();
        location.hash = norm;       // will retrigger route()
      } else {
        // Same tab clicked: force re-render
        e.preventDefault();
        renderByHash(norm);
      }
    });
    headerNav.__wired = true;
  }

  // --- Also ensure our injected topNav (buttons) works if present ---
  let topNav = document.getElementById("topNav");
  if (topNav && !topNav.__wired) {
    topNav.addEventListener("click", (e)=>{
      const btn = e.target.closest("[data-go]");
      if (!btn) return;
      const target = normalizeHash(btn.getAttribute("data-go") || "#/");
      if (location.hash !== target) {
        location.hash = target;
      } else {
        renderByHash(target);
      }
    });
    topNav.__wired = true;
  }

  // --- Signed-out early view keeps nav responsive ---
  if (!FB.ready) {
    renderSignedOut(); // shows "Please sign in..." but header tabs still clickable
    setActiveTabs(normalizeHash(location.hash || "#/"));
    return;
  }

  // --- Render by normalized hash ---
  const normHash = normalizeHash(location.hash || "#/");
  renderByHash(normHash);
  setActiveTabs(normHash);

  // ---- Helpers (scoped to route) ----
  function normalizeHash(h){
    // Accept "#dashboard" | "#/dashboard" | "#/" | "#settings" | "#/settings" | "#jobs" | "#/jobs" | "#costs" | "#inventory"
    const raw = (h || "#/").toLowerCase();
    if (raw === "#dashboard" || raw === "#/dashboard" || raw === "#/") return "#/";
    if (raw === "#settings"  || raw === "#/settings")  return "#/settings";
    if (raw === "#jobs"      || raw === "#/jobs")      return "#/jobs";
    if (raw === "#costs"     || raw === "#/costs")     return "#/costs";
    if (raw === "#inventory" || raw === "#/inventory") return "#/inventory";
    // Fallback to dashboard
    return "#/";
  }

  function setActiveTabs(norm){
    // Header <nav> anchors
    document.querySelectorAll("header .nav a").forEach(a=>{
      const want = normalizeHash(a.getAttribute("href") || "");
      if (want === norm) a.classList.add("active");
      else a.classList.remove("active");
    });
    // Injected button nav (if present)
    document.querySelectorAll("#topNav [data-go]").forEach(btn=>{
      const want = normalizeHash(btn.getAttribute("data-go") || "");
      if (want === norm) btn.classList.add("active");
      else btn.classList.remove("active");
    });
  }

  function renderByHash(norm){
    if (norm === "#/settings")      { renderSettings();   return; }
    if (norm === "#/jobs")          { renderJobs();       return; }
    if (norm === "#/costs")         { renderCosts();      return; }
    if (norm === "#/inventory")     { renderInventory();  return; }
    /* default */                     renderDashboard();
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("load", ()=>{ initFirebase(); route(); });
