/* =========================================================
   OMAX 1530 Maintenance Tracker — v7.0 (Cloud sync: Firebase)
   - Persists state in Firestore under anonymous auth (per-user doc)
   - Works on GitHub Pages (static)
   ========================================================= */
// Fixed billing rate for jobs
const JOB_RATE_PER_HOUR = 250;  // $/hr

const DAILY_HOURS = 8;
// Shared workspace identifier (everyone must use the same ID)
const WORKSPACE_ID = "schreiner-robotics";


/* ---------------- Firebase (Cloud) ---------------- */
let FB = {
  app: null,
  auth: null,
  db: null,
  user: null,
  docRef: null, // users/{uid}/app/state
  ready: false
};

async function initFirebase() {
  if (!window.firebase || !firebase.initializeApp) {
    alert("Firebase SDK not loaded. Check <script> tags in index.html.");
    return;
  }
  if (!window.FIREBASE_CONFIG) {
    alert("Missing FIREBASE_CONFIG in index.html.");
    return;
  }

  FB.app  = firebase.initializeApp(window.FIREBASE_CONFIG);
  FB.auth = firebase.auth();
  FB.db   = firebase.firestore();

  // --- UI elements (from index.html auth section) ---
  const bar      = document.getElementById("authBar");
  const statusEl = document.getElementById("authStatus");
  const btnIn    = document.getElementById("btnSignIn");
  const btnOut   = document.getElementById("btnSignOut");
  const modal    = document.getElementById("authModal");
  const form     = document.getElementById("authForm");
  const emailEl  = document.getElementById("authEmail");
  const passEl   = document.getElementById("authPass");
  const btnClose = document.getElementById("authClose");

  const showModal = () => { modal.style.display = "flex"; };
  const hideModal = () => { modal.style.display = "none"; };

// Minimal email/password sign-in helper with robust fallback
async function ensureEmailPassword(email, password){
  if (!email || !password) throw new Error("Email and password are required.");
  if (password.length < 6) throw new Error("Password must be at least 6 characters.");

  try {
    // Try to sign in first
    const cred = await FB.auth.signInWithEmailAndPassword(email, password);
    return cred.user;
  } catch (e) {
    const code = (e && e.code) ? String(e.code) : "";
    const msg  = (e && e.message) ? String(e.message) : "";

    // Some backends return generic errors; normalize a few
    const looksLikeInvalidCred =
      code === "auth/invalid-credential" ||
      code === "auth/invalid-login-credentials" ||
      msg.includes("INVALID_LOGIN_CREDENTIALS");

    // If the account doesn't exist -> create it, then sign in
    if (code === "auth/user-not-found" || looksLikeInvalidCred) {
      try {
        await FB.auth.createUserWithEmailAndPassword(email, password);
        const cred2 = await FB.auth.signInWithEmailAndPassword(email, password);
        return cred2.user;
      } catch (e2) {
        // If the email actually existed but with a different password,
        // create will throw 'auth/email-already-in-use'
        if (e2.code === "auth/email-already-in-use") {
          throw new Error("Account already exists; please check the password.");
        }
        if (e2.code === "auth/weak-password") {
          throw new Error("Password must be at least 6 characters.");
        }
        throw e2;
      }
    }

    // Usual explicit cases
    if (code === "auth/wrong-password") {
      throw new Error("Incorrect password. Try again.");
    }
    if (code === "auth/too-many-requests") {
      throw new Error("Too many attempts. Please wait a moment and try again.");
    }
    if (code === "auth/network-request-failed") {
      throw new Error("Network error. Check your connection and try again.");
    }

    // Fallback: show the original message
    throw e;
  }
}


  // Wire toolbar buttons
  if (btnIn)  btnIn.onclick  = () => showModal();
  if (btnOut) btnOut.onclick = async () => { await FB.auth.signOut(); };

  if (btnClose) btnClose.onclick = hideModal;

  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const email = (emailEl.value || "").trim();
      const pass  = (passEl.value  || "").trim();
      if (!email || !pass) return;
      try {
        await ensureEmailPassword(email, pass);
        hideModal();
      } catch (err) {
        console.error(err);
        alert(err.message || "Sign-in failed");
      }
    };
  }

  // React to auth state changes
  FB.auth.onAuthStateChanged(async (user) => {
    FB.user = user || null;
    if (user) {
      statusEl.textContent = `Signed in as: ${user.email || user.uid}`;
      btnIn.style.display = "none";
      btnOut.style.display = "inline-block";

      // === IMPORTANT: switch to shared workspace doc ===
      FB.docRef = FB.db
        .collection("workspaces").doc(WORKSPACE_ID)
        .collection("app").doc("state");

      FB.ready = true;
      await loadFromCloud(); // will seed if empty
      // Initial render once signed in
      route();
    } else {
      statusEl.textContent = "Not signed in";
      btnIn.style.display = "inline-block";
      btnOut.style.display = "none";
      FB.ready = false;
      // Clear UI to a minimal state (optional)
      const content = document.getElementById("content");
      if (content) content.innerHTML = "<div class='container'><div class='block'><h3>Please sign in to view workspace.</h3></div></div>";
    }
  });
}


/* ---------------- Schema / Defaults ---------------- */
const APP_SCHEMA = 70;

const defaultIntervalTasks = [
  { id:"noz_filter_or", name:"Nozzle filter & inlet O-ring", interval:40,  sinceBase:null, anchorTotal:null, cost:"", link:"", pn:"307525", price:283 },
  { id:"pump_tube_noz_filter", name:"Pump tube & nozzle filter life", interval:80, sinceBase:null, anchorTotal:null, cost:"", link:"", pn:"307561-02", price:170 },
  { id:"orifice_assembly", name:"Orifice assembly (jewel)", interval:500, sinceBase:null, anchorTotal:null, cost:"", link:"", pn:"305322-14", price:700 },
  { id:"nozzle_body_life", name:"Nozzle body life", interval:500, sinceBase:null, anchorTotal:null, cost:"", link:"", pn:"303295", price:349 },

  { id:"drain_hopper_reg_bowl", name:"Drain hopper regulator water bowl", interval:240, sinceBase:null, anchorTotal:null, cost:"", link:"" },
  { id:"check_pinch_reg_conn",  name:"Check hopper pinch valve & air regulator connection", interval:240, sinceBase:null, anchorTotal:null, cost:"", link:"" },
  { id:"inspect_relief_90psi",  name:"Inspect pressure relief valve (≤90 psi)", interval:240, sinceBase:null, anchorTotal:null, cost:"", link:"" },

  { id:"buy_garnet_pallets_x4", name:"Buy Garnet Pallets x4", interval:160, sinceBase:null, anchorTotal:null, cost:"", link:"" },

  { id:"ro_softener_daily_chk", name:"RO / Softener feed pressure & water quality — daily", interval:8, sinceBase:null, anchorTotal:null, cost:"", link:"" },
  { id:"mixing_tube_rotation",  name:"Mixing tube rotation", interval:8, sinceBase:null, anchorTotal:null, cost:"", link:"" },
  { id:"jewel_nozzle_clean",    name:"Jewell orifice & nozzle body cleaning (weekly)", interval:56, sinceBase:null, anchorTotal:null, cost:"", link:"" },

  { id:"check_bonding_strap",   name:"Check hopper bonding strap (annually)", interval:2920, sinceBase:null, anchorTotal:null, cost:"", link:"" },
  { id:"lube_z_axis",           name:"Lubricate Z-axis rail shafts & lead screw (annually)", interval:2920, sinceBase:null, anchorTotal:null, cost:"", link:"" },

  { id:"filter_housing_or_2y",  name:"Filter housing O-ring (2 years / if leaking)", interval:5840, sinceBase:null, anchorTotal:null, cost:"", link:"", pn:"208665", price:4.85 }
];

const defaultAsReqTasks = [
  { id:"purge_hopper_pressure_pot", name:"Purge hopper pressure pot", condition:"As required", cost:"", link:"" },
  { id:"replace_pot_sensors",       name:"Replace pressure pot sensors", condition:"When failed", cost:"", link:"" },
  { id:"empty_hopper_abrasive",     name:"Empty hopper abrasive material", condition:"If debris/contamination", cost:"", link:"" },

  { id:"replace_pinch_valve", name:"Replace hopper pinch valve", condition:"When damaged", cost:"", link:"", pn:"204160", price:292 },
  { id:"replace_feed_hose",   name:"Replace abrasive feed hose", condition:"When damaged", cost:"", link:"", pn:"302240", price:121 },
  { id:"ro_filter_housing",   name:"RO Filter Housing",          condition:"As needed",   cost:"", link:"", pn:"208663", price:137 },
  { id:"ro_micron_filter",    name:"RO Micron filter",           condition:"Per water quality/pressure", cost:"", link:"", pn:"209260-01", price:35.5 },
  { id:"ro_carbon_filter",    name:"RO Carbon filter",           condition:"Per chlorine breakthrough",  cost:"", link:"", pn:"204365", price:25 },
  { id:"ro_calcite_filter",   name:"RO Calcite filter",          condition:"Per water quality / pH",     cost:"", link:"", pn:"204876", price:72 },

  { id:"inspect_abrasive_tube", name:"Abrasive tubing inspection", condition:"Before each use", cost:"", link:"" },
  { id:"clean_xy_strips",       name:"Clean X– & Y–axis magnetic encoder strips", condition:"If errors occur", cost:"", link:"" },
  { id:"clean_lube_ballscrews", name:"Clean & lubricate ball screws", condition:"If debris occurs", cost:"", link:"" },
  { id:"clean_rails",           name:"Clean X-rails & Y-bridge rails", condition:"If debris occurs", cost:"", link:"" }
];

function seedInventoryFromTasks(){
  return [
    ...defaultIntervalTasks.map(t => ({ id:`inv_${t.id}`, name:t.name, qty:0, unit:"pcs", note:"", pn:t.pn||"", link:t.link||"" })),
    ...defaultAsReqTasks.map(t => ({ id:`inv_${t.id}`, name:t.name, qty:0, unit:"pcs", note:"", pn:t.pn||"", link:t.link||"" }))
  ];
}

/* ---------------- In-memory state ---------------- */
let totalHistory = []; // [{dateISO,hours}]
let tasksInterval = [];
let tasksAsReq   = [];
let inventory    = [];
let cuttingJobs  = []; // [{id,name,estimateHours,material,notes,dueISO,startISO}]

// Tracks which job rows are currently in "edit mode"
let editingJobs = new Set();
let RENDER_TOTAL = null;
let RENDER_DELTA = 0;

/* ---------------- Cloud Load/Save ---------------- */
function snapshotState() {
  return {
    schema: APP_SCHEMA,
    totalHistory, tasksInterval, tasksAsReq, inventory, cuttingJobs
  };
}
function adoptState(docData) {
  totalHistory  = Array.isArray(docData.totalHistory)  ? docData.totalHistory  : [];
  tasksInterval = Array.isArray(docData.tasksInterval) ? docData.tasksInterval : defaultIntervalTasks.slice();
  tasksAsReq    = Array.isArray(docData.tasksAsReq)    ? docData.tasksAsReq    : defaultAsReqTasks.slice();
  inventory     = Array.isArray(docData.inventory)     ? docData.inventory     : seedInventoryFromTasks();
  cuttingJobs   = Array.isArray(docData.cuttingJobs)   ? docData.cuttingJobs   : [];
}

const saveCloudDebounced = debounce(async () => {
  if (!FB.ready || !FB.docRef) return;
  try {
    await FB.docRef.set(snapshotState(), { merge: true });
  } catch (e) {
    console.error("Cloud save failed:", e);
  }
}, 350);

async function loadFromCloud() {
  if (!FB.ready || !FB.docRef) return;

  try {
    const snap = await FB.docRef.get();

    if (snap.exists) {
      // If the doc exists but is effectively empty, seed it.
      const data = snap.data() || {};

      const needsSeed =
        !Array.isArray(data.tasksInterval) || data.tasksInterval.length === 0;

      if (needsSeed) {
        const seeded = {
          schema: APP_SCHEMA,
          totalHistory: Array.isArray(data.totalHistory) ? data.totalHistory : [],
          tasksInterval: defaultIntervalTasks.slice(),
          tasksAsReq: Array.isArray(data.tasksAsReq) && data.tasksAsReq.length
            ? data.tasksAsReq
            : defaultAsReqTasks.slice(),
          inventory: Array.isArray(data.inventory) && data.inventory.length
            ? data.inventory
            : seedInventoryFromTasks(),
          cuttingJobs: Array.isArray(data.cuttingJobs) ? data.cuttingJobs : [],
        };

        adoptState(seeded);
        await FB.docRef.set(seeded, { merge: true });
      } else {
        // Normal path: adopt data as-is (adoptState will still guard missing arrays)
        adoptState(data);
      }
    } else {
      // First-ever run for this user: write defaults to Firestore instead of an empty doc
      const seeded = {
        schema: APP_SCHEMA,
        totalHistory: [],
        tasksInterval: defaultIntervalTasks.slice(),
        tasksAsReq: defaultAsReqTasks.slice(),
        inventory: seedInventoryFromTasks(),
        cuttingJobs: [],
      };
      adoptState(seeded);
      await FB.docRef.set(seeded); // create the doc with defaults
    }
  } catch (e) {
    console.error("Cloud load failed:", e);
    // Graceful fallback: still show defaults locally
    adoptState({
      schema: APP_SCHEMA,
      totalHistory: [],
      tasksInterval: defaultIntervalTasks.slice(),
      tasksAsReq: defaultAsReqTasks.slice(),
      inventory: seedInventoryFromTasks(),
      cuttingJobs: [],
    });
  }
}


/* ---------------- Helpers ---------------- */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
function debounce(fn, ms=250) { let t; return (...a)=>{clearTimeout(t); t=setTimeout(()=>fn(...a),ms);} }
function genId(name) { const b=(name||"item").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,""); return `${b}_${Date.now().toString(36)}`; }
function ymd(date){return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;}

// Inclusive days between two dates (both at local midnight)
function daysBetweenInclusive(a, b){
  const MS = 24*60*60*1000;
  const d = Math.floor((b - a) / MS) + 1;
  return d < 0 ? 0 : d;
}

// Build a { 'YYYY-M-D': hoursCutThatDay } map from totalHistory deltas
function buildDailyHoursMap(){
  const map = {};
  if (!Array.isArray(totalHistory) || totalHistory.length < 2) return map;
  const sorted = totalHistory.slice().sort((a,b)=> new Date(a.dateISO) - new Date(b.dateISO));
  for (let i=1; i<sorted.length; i++){
    const prev = sorted[i-1], cur = sorted[i];
    let diff = (cur.hours - prev.hours);
    if (!isFinite(diff) || diff < 0) diff = 0;
    const d = new Date(cur.dateISO); d.setHours(0,0,0,0);
    const key = ymd(d);
    map[key] = (map[key] || 0) + diff;
  }
  return map;
}

/**
 * Upsert a manual log for a job.
 * mode: "completed" (hrs done so far) or "remaining" (hrs left)
 * value: number of hours for the chosen mode
 * dateISO: ISO date (yyyy-mm-dd) interpreted at local midnight
 */
function addManualLog(jobId, dateISO, mode, value){
  const j = cuttingJobs.find(x=>x.id===jobId);
  if (!j) return false;
  if (!Array.isArray(j.manualLogs)) j.manualLogs = [];

  const d = new Date(`${dateISO}T00:00:00`);
  d.setHours(0,0,0,0);
  const key = d.toISOString().slice(0,10);

  const planned = Number(j.estimateHours)||0;
  let completed = 0;
  if (mode === "completed") {
    completed = Math.max(0, Math.min(planned, Number(value)||0));
  } else { // "remaining"
    const rem = Math.max(0, Number(value)||0);
    completed = Math.max(0, Math.min(planned, planned - rem));
  }

  const idx = j.manualLogs.findIndex(m => (m.dateISO === key));
  const entry = { dateISO: key, completedHours: completed };
  if (idx >= 0) j.manualLogs[idx] = entry; else j.manualLogs.push(entry);

  // Keep logs sorted by date
  j.manualLogs.sort((a,b)=> new Date(a.dateISO) - new Date(b.dateISO));
  return true;
}


// Build a { 'YYYY-M-D': hoursCutThatDay } map from totalHistory deltas
function buildDailyHoursMap(){
  const map = {};
  if (!Array.isArray(totalHistory) || totalHistory.length < 2) return map;
  const sorted = totalHistory.slice().sort((a,b)=> new Date(a.dateISO) - new Date(b.dateISO));
  for (let i=1; i<sorted.length; i++){
    const prev = sorted[i-1], cur = sorted[i];
    let diff = (cur.hours - prev.hours);
    if (!isFinite(diff) || diff < 0) diff = 0;
    const d = new Date(cur.dateISO); d.setHours(0,0,0,0);
    const key = ymd(d);
    map[key] = (map[key] || 0) + diff;
  }
  return map;
}

// Compute efficiency for a job over its scheduled days
// Inclusive day difference at local midnight
function daysBetweenInclusive(a, b){
  const MS = 24*60*60*1000;
  const d = Math.floor((b - a) / MS) + 1; // inclusive
  return d < 0 ? 0 : d;
}

/**
 * New efficiency model (matches your example):
 * - plannedHours = job.estimateHours
 * - rate $/hr = originalProfit / plannedHours
 * - expectedHoursSoFar = min(plannedHours, DAILY_HOURS * daysElapsedWithinWindow)
 * - actualHoursSoFar   = min(plannedHours, sum of logged hours within window-to-date)
 * - deltaHours = expected - actual  (positive => behind, negative => ahead)
 * - efficiencyAmount = - deltaHours * rate  (subtract when behind, add when ahead)
 * - newProfit = originalProfit + efficiencyAmount
 */
function computeJobEfficiency(job){
  // Shape kept similar to your previous return so UI code stays happy
  const planned = (job && job.estimateHours > 0) ? Number(job.estimateHours) : 0;
  const result = {
    rate: JOB_RATE_PER_HOUR,     // $/hr (fixed)
    expectedHours: 0,
    actualHours: 0,
    deltaHours: 0,               // actual - expected ( >0 = ahead, <0 = behind )
    gainLoss: 0,                 // $ ( + = ahead, - = behind )
    daysElapsed: 0,
    totalDays: 0,
    usedAutoFromManual: false,   // flags for the info bubble
    usedFromStartAuto: false
  };
  if (!job || !job.startISO || !job.dueISO || planned <= 0) return result;

  // Normalize to local midnight
  const start = new Date(job.startISO); start.setHours(0,0,0,0);
  const due   = new Date(job.dueISO);   due.setHours(0,0,0,0);
  const today = new Date();             today.setHours(0,0,0,0);
  const asOf  = (today < due) ? today : due;

  // Days window
  result.totalDays   = Math.max(0, Math.floor((due - start) / (24*60*60*1000)) + 1);
  result.daysElapsed = (asOf < start) ? 0 : Math.max(0, Math.floor((asOf - start) / (24*60*60*1000)) + 1);

  // Expected so far (cap to planned)
  result.expectedHours = Math.min(planned, result.daysElapsed * DAILY_HOURS);

  // --- ACTUAL HOURS: manual override with automatic carry-forward ---
  let actual = 0;
  const hasManual = Array.isArray(job.manualLogs) && job.manualLogs.length > 0;

  if (hasManual) {
    // use the latest manual <= asOf, then carry forward 8 hr/day after that
    const logs = job.manualLogs
      .filter(m => new Date(`${m.dateISO}T00:00:00`) <= asOf)
      .sort((a,b) => new Date(a.dateISO) - new Date(b.dateISO));

    if (logs.length > 0) {
      const last = logs[logs.length - 1];
      const lastDate = new Date(`${last.dateISO}T00:00:00`); lastDate.setHours(0,0,0,0);
      actual = Math.max(0, Math.min(planned, Number(last.completedHours)||0));
      if (asOf > lastDate) {
        const daysForward = Math.max(0, Math.floor((asOf - lastDate)/(24*60*60*1000)));
        actual += daysForward * DAILY_HOURS; // carry forward 8 hr/day
        result.usedAutoFromManual = true;
      }
    } else {
      // no manual ≤ asOf -> treat as no-manual path below
      result.usedFromStartAuto = true;
      actual = Math.min(planned, result.daysElapsed * DAILY_HOURS);
    }
  } else {
    // No manual entries at all: assume 8 hr/day since start
    result.usedFromStartAuto = true;
    actual = Math.min(planned, result.daysElapsed * DAILY_HOURS);
  }

  // Cap to planned
  result.actualHours = Math.min(planned, actual);

  // Delta & financial impact (gain/loss only, based on $/hr)
  result.deltaHours = result.actualHours - result.expectedHours;     // + ahead, - behind
  result.gainLoss   = result.deltaHours * result.rate;

  return result;
}

// --------- Fuzzy search helpers (new) ---------
function normalizeText(s){
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, ""); // strip diacritics
}

// Levenshtein distance (iterative; good enough for short queries)
function lev(a, b){
  a = normalizeText(a); b = normalizeText(b);
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++){
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++){
      const tmp = dp[j];
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      dp[j] = Math.min(
        dp[j] + 1,        // deletion
        dp[j-1] + 1,      // insertion
        prev + cost       // substitution
      );
      prev = tmp;
    }
  }
  return dp[n];
}

// Score: combines edit distance + substring/startsWith bonuses
function fuzzyScore(query, text){
  const q = normalizeText(query);
  const t = normalizeText(text);
  if (!q || !t) return Infinity;

  // exact/substring boosts
  const idx = t.indexOf(q);
  let bonus = 0;
  if (idx === 0) bonus -= 2;            // starts with
  else if (idx > 0) bonus -= 1;         // substring

  // token prefix bonus (e.g., "nozz" matches "nozzle")
  const tokens = t.split(/[^a-z0-9]+/g).filter(Boolean);
  if (tokens.some(tok => tok.startsWith(q))) bonus -= 2;

  // distance normalized by length
  const distance = lev(q, t);
  const norm = distance / Math.max(t.length, 1);

  return norm + bonus * 0.05; // small weight to bonuses
}

// Build and search across both lists
function searchSettingsItems(query){
  const results = [];
  const push = (obj, listName) => {
    const fields = [
      obj.name || "",
      obj.pn || "",
      obj.condition || "",
    ].join(" ");
    const score = Math.min(
      fuzzyScore(query, obj.name || ""),
      fuzzyScore(query, fields)
    );
    results.push({
      id: obj.id,
      list: listName, // "interval" | "asreq"
      name: obj.name,
      pn: obj.pn || "",
      condition: obj.condition || "",
      score
    });
  };

  tasksInterval.forEach(t => push(t, "interval"));
  tasksAsReq.forEach(t => push(t, "asreq"));

  results.sort((a,b) => a.score - b.score);
  return results.slice(0, 12); // top 12 hits
}

function renderSettingsSearchResults(results){
  const box = $("#settingsSearchResults");
  if (!box) return;
  if (!results || results.length === 0){
    box.innerHTML = "";
    box.style.display = "none";
    return;
  }
  box.style.display = "block";
  box.innerHTML = results.map(r => `
    <div class="search-item" data-goto-id="${r.id}">
      <div class="si-title">${r.name}</div>
      <div class="si-meta">
        <span class="badge">${r.list === "interval" ? "Per Interval" : "As Required"}</span>
        ${r.pn ? `<span class="muted">PN: ${r.pn}</span>` : ""}
        ${r.condition && r.list==="asreq" ? `<span class="muted">(${r.condition})</span>` : ""}
      </div>
    </div>
  `).join("");

  $$("#settingsSearchResults .search-item").forEach(el=>{
    el.onclick = () => {
      const id = el.getAttribute("data-goto-id");
      // open the corresponding <details> and scroll
      const panel = document.querySelector(`[data-task-id="${id}"]`);
      if (panel){
        panel.open = true;
        panel.scrollIntoView({ behavior:"smooth", block:"center" });
      }
      // keep results open until user types again (optional: hide)
    };
  });
}


/* ---------------- Totals / Δ ---------------- */
function currentTotal(){ return totalHistory.length ? totalHistory[totalHistory.length-1].hours : null; }
function previousTotal(){ return totalHistory.length>1 ? totalHistory[totalHistory.length-2].hours : null; }
function deltaSinceLast(){
  const cur = RENDER_TOTAL ?? currentTotal();
  const prev = previousTotal();
  if (cur == null || prev == null) return 0;
  return Math.max(0, cur - prev);
}

/* ---------------- Hours since / next due ---------------- */
function liveSince(task){
  const cur = RENDER_TOTAL ?? currentTotal();
  const delta = RENDER_DELTA ?? deltaSinceLast();
  if (task.anchorTotal != null && cur != null) return Math.max(0, cur - task.anchorTotal);
  if (task.sinceBase == null) return null;
  return task.sinceBase + delta;
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

/* ---------------- Toast ---------------- */
function toast(msg){
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
  setTimeout(()=>t.classList.add("show"),10);
  setTimeout(()=>{t.classList.remove("show"); setTimeout(()=>t.remove(),200);},1400);
}

/* ======================= VIEWS ======================= */
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
    <section id="pump-widget" class="block">
      <!-- filled by renderPumpWidget() -->
    </section>

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

      <!-- IMPORTANT: the calendar container -->
      <div id="months"></div>
      <div class="small">Hover a due item for actions. Double-click on links won’t download.</div>
    </div>
  </div>`;
}

/* -------- Settings item templates -------- */
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

    <!-- New: separate manual & store links -->
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

    <!-- New: separate manual & store links -->
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
      <div>
        <button class="danger" data-remove="${task.id}" data-from="asreq">Remove</button>
      </div>
    </div>
  </details>`;
}

function viewSettings(){
  return `
  <div class="container">
    <div class="block" style="grid-column: 1 / -1">
      <h3>Maintenance Settings</h3>

      <!-- Intelligent Search -->
      <div class="settings-search">
        <input type="search" id="settingsSearch" placeholder="Search maintenance… (e.g., nozzle, o-ring, 307525)" />
        <div id="settingsSearchResults" class="search-results"></div>
      </div>

      <div class="add-forms">
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

      <h4>By Interval (hrs)</h4>
      <div id="intervalList">
        ${tasksInterval.map(taskDetailsInterval).join("")}
      </div>

      <h4 style="margin-top:16px;">As Required</h4>
      <div id="asreqList">
        ${tasksAsReq.map(taskDetailsAsReq).join("")}
      </div>

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
      <p class="small">Three sections: Per Interval, As Required, and Cutting Jobs. Edit cutting material cost/qty inline.</p>
    </div>

    <!-- Per Interval -->
    <div class="block" style="grid-column: 1 / -1">
      <h4>Per Interval</h4>
      <table id="costTableInterval">
        <thead>
          <tr>
            <th>Item</th>
            <th>Interval (hrs)</th>
            <th>Cost</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>

    <!-- As Required -->
    <div class="block" style="grid-column: 1 / -1">
      <h4>As Required</h4>
      <table id="costTableAsReq">
        <thead>
          <tr>
            <th>Item</th>
            <th>Condition</th>
            <th>Cost</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>

    <!-- Cutting Jobs -->
    <div class="block" style="grid-column: 1 / -1">
      <h4>Cutting Jobs</h4>
      <table id="costTableJobs">
        <thead>
          <tr>
            <th>Job</th>
            <th>Estimate (hrs)</th>
            <th>Material</th>
            <th>Material Cost ($)</th>
            <th>Material Qty</th>
            <th>Material Total ($)</th>
            <th>Efficiency (hr Δ → $Δ)</th>
            <th>Profit (Original → New)</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
      <p class="small">Material fields are editable. Changes save to cloud automatically.</p>
    </div>
  </div>`;
}

/* ---------------- Calendar ---------------- */
function viewJobs(){
  const rows = cuttingJobs.map(j => {
    const eff = computeJobEfficiency(j);
    const req = computeRequiredDaily(j);

    const editing = editingJobs.has(j.id);

    const startTxt = (new Date(j.startISO)).toDateString();
    const dueDate  = new Date(j.dueISO);
    const dueTxt   = dueDate.toDateString();
    const dueVal   = dueDate.toISOString().slice(0,10);

    // Efficiency: hours delta and $ gain/loss at fixed rate
    const signMoney = eff.gainLoss >= 0 ? "+" : "−";
    const absMoney  = Math.abs(eff.gainLoss).toFixed(2);
    const effText   =
      `${eff.deltaHours>=0?"+":""}${eff.deltaHours.toFixed(1)} hr Δ ` +
      `(exp ${eff.expectedHours.toFixed(1)} vs act ${eff.actualHours.toFixed(1)}) → ` +
      `${signMoney}$${absMoney} @ $${eff.rate}/hr`;

    // “Required per day” to finish on time
    const reqCell = (req.requiredPerDay === Infinity)
      ? `<span class="danger">Past due / no days remaining</span>`
      : `${req.requiredPerDay.toFixed(2)} hr/day <span class="muted">(rem ${req.remainingHours.toFixed(1)} hr over ${req.remainingDays} day${req.remainingDays===1?"":"s"})</span>`;

    // Auto/Manual note
    const noteAuto = eff.usedAutoFromManual
      ? `<div class="muted"><strong>Auto from last manual</strong> — continuing at ${DAILY_HOURS} hr/day.</div>`
      : (eff.usedFromStartAuto ? `<div class="muted"><strong>Auto</strong> — assuming ${DAILY_HOURS} hr/day from start.</div>` : ``);

    // READ MODE CELLS
    const readName     = `<div><strong>${j.name}</strong></div>${noteAuto}`;
    const readHours    = `${j.estimateHours} hrs`;
    const readMaterial = j.material || "—";
    const readSched    = `<div class="small">${startTxt} → ${dueTxt}</div><div class="muted">${dueVal}</div>`;
    const readEff      = effText;
    const readReq      = reqCell;
    const readNotes    = j.notes || "—";

    // EDIT MODE CELLS
    const editName     = `<input type="text" class="job-input" data-k="name" value="${j.name}">`;
    const editHours    = `<input type="number" min="1" step="0.01" class="job-input" data-k="estimateHours" value="${j.estimateHours}">`;
    const editMaterial = `<input type="text" class="job-input" data-k="material" value="${j.material||""}" placeholder="Material">`;
    const editSched    = `<div class="small">${startTxt} → ${dueTxt}</div>
                          <input type="date" class="job-input" data-k="dueISO" value="${dueVal}">`;
    const editNotes    = `<input type="text" class="job-input" data-k="notes" value="${j.notes||""}" placeholder="Notes">`;

    const actions = editing
      ? `<button type="button" class="primary" data-save-job="${j.id}">Save</button>
         <button type="button" class="secondary" data-cancel-job="${j.id}">Cancel</button>
         <button type="button" class="jm-info" title="Info" data-job-id="${j.id}">ℹ️</button>
         <button type="button" class="danger" data-remove-job="${j.id}">Remove</button>`
      : `<button type="button" data-edit-job="${j.id}">Edit</button>
         <button type="button" class="jm-info" title="Info" data-job-id="${j.id}">ℹ️</button>
         <button type="button" class="danger" data-remove-job="${j.id}">Remove</button>`;

    return `
      <tr data-job="${j.id}" class="${editing?'row-editing':''}">
        <td>${editing ? editName     : readName}</td>
        <td>${editing ? editHours    : readHours}</td>
        <td>${editing ? editMaterial : readMaterial}</td>
        <td>${editing ? editSched    : readSched}</td>
        <td>${readEff}</td>
        <td>${readReq}</td>
        <td>${editing ? editNotes    : readNotes}</td>
        <td>${actions}</td>
      </tr>
      <tr class="job-manual-row" data-job="${j.id}">
        <td colspan="8">
          <form class="mini-form job-manual-form" data-job-id="${j.id}">
            <label><strong>Manual progress:</strong></label>
            <input type="date" class="jm-date" value="${(new Date()).toISOString().slice(0,10)}" required>
            <select class="jm-mode">
              <option value="completed">Hours Completed</option>
              <option value="remaining">Hours Remaining</option>
            </select>
            <input type="number" class="jm-value" min="0" step="0.01" placeholder="e.g., 4" required>
            <button type="submit">Add/Update</button>
            <span class="muted small">Manual overrides; after your last manual entry, app continues at ${DAILY_HOURS} hr/day until you log again.</span>
          </form>
        </td>
      </tr>`;
  }).join("");

  return `
  <section class="jobs">
    <h2>Cutting Jobs</h2>

    <form id="jobForm" class="mini-form">
      <div><label><b>Name</b></label><input id="job_name" required></div>
      <div><label><b>Hours</b></label><input id="job_hours" type="number" min="1" step="0.01" required></div>
      <div><label>Material</label><input id="job_material"></div>
      <div><label><b>Due date</b></label><input id="job_due" type="date" required></div>
      <div class="grow"><label>Notes</label><input id="job_notes"></div>
      <div><button type="submit" class="primary">Add Job</button></div>
    </form>

    <table class="grid">
      <thead>
        <tr>
          <th>Job</th>
          <th>Est (hr)</th>
          <th>Material</th>
          <th>Schedule</th>
          <th>Efficiency (hrs → $)</th>
          <th>Required/day</th>
          <th>Notes</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

// Make the whole calendar interactive via delegation
function wireCalendarBubbles(){
  const months = $("#months");
  if (!months) return;

  let hoverTarget = null;

  // Show bubble on hover anywhere on the chip/bar
  months.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-cal-job], [data-cal-task]");
    if (!el || el === hoverTarget) return;
    hoverTarget = el;

    if (el.dataset.calJob)  showJobBubble(el.dataset.calJob, el);
    if (el.dataset.calTask) showTaskBubble(el.dataset.calTask, el);
  });

  // Hide when leaving the element (not when moving inside it)
  months.addEventListener("mouseout", (e) => {
    const from = e.target.closest("[data-cal-job], [data-cal-task]");
    const to   = e.relatedTarget && e.relatedTarget.closest("[data-cal-job], [data-cal-task]");
    if (from && !to) {
      hoverTarget = null;
      if (typeof hideBubbleSoon === "function") hideBubbleSoon();
    }
  });

  // Also support click/tap to open bubbles
  months.addEventListener("click", (e) => {
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

  // Maintenance due map (per-day)
  const dueMap = {};
  tasksInterval.forEach(t => {
    const nd = nextDue(t);
    if (!nd) return;
    const key = ymd(nd.due);
    (dueMap[key] ||= []).push({ type:"task", id:String(t.id), name:t.name });
  });

  // Cutting jobs map (expanded per day)
  const jobsMap = {};
  cuttingJobs.forEach(j => {
    if (!j.startISO || !j.dueISO) return;
    const start = new Date(j.startISO), end = new Date(j.dueISO);
    start.setHours(0,0,0,0); end.setHours(0,0,0,0);
    const cur = new Date(start);
    while (cur <= end) {
      const key = ymd(cur);
      (jobsMap[key] ||= []).push({ type:"job", id:String(j.id), name:j.name });
      cur.setDate(cur.getDate()+1);
    }
  });

  const today = new Date(); today.setHours(0,0,0,0);
  for (let m=0; m<3; m++) {
    const first = new Date(today.getFullYear(), today.getMonth()+m, 1);
    const last  = new Date(today.getFullYear(), today.getMonth()+m+1, 0);

    const monthDiv = document.createElement("div");
    monthDiv.className = "month";

    const head = document.createElement("div");
    head.className = "month-header";
    head.textContent = first.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
    monthDiv.appendChild(head);

    const weekdays = document.createElement("div");
    weekdays.className = "weekdays";
    ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d => {
      const el = document.createElement("div");
      el.textContent = d;
      weekdays.appendChild(el);
    });
    monthDiv.appendChild(weekdays);

    const grid = document.createElement("div");
    grid.className = "week";

    for (let i=0; i<first.getDay(); i++) {
      const blank = document.createElement("div");
      blank.className = "day other-month";
      grid.appendChild(blank);
    }

    for (let day=1; day<=last.getDate(); day++) {
      const date = new Date(first.getFullYear(), first.getMonth(), day);
      date.setHours(0,0,0,0);

      const cell = document.createElement("div");
      cell.className = "day";
      if (date.getTime() === today.getTime()) cell.classList.add("today");
      cell.innerHTML = `<div class="date">${day}</div>`;

      const key = ymd(date);

      // Maintenance chips
      (dueMap[key] || []).forEach(ev => {
        const chip = document.createElement("div");
        chip.className = "event generic cal-task";
        chip.setAttribute("data-cal-task", ev.id);   // robust attribute
        chip.textContent = `${ev.name} (due)`;
        cell.appendChild(chip);
      });

      // Cutting job bars
      (jobsMap[key] || []).forEach(ev => {
        const bar = document.createElement("div");
        bar.className = "job-bar cal-job";
        bar.setAttribute("data-cal-job", ev.id);     // robust attribute
        bar.textContent = ev.name;
        cell.appendChild(bar);
      });

      grid.appendChild(cell);
    }

    const filled = first.getDay() + last.getDate();
    const rem = filled % 7;
    if (rem !== 0) {
      for (let i=0; i<7-rem; i++) {
        const blank = document.createElement("div");
        blank.className = "day other-month";
        grid.appendChild(blank);
      }
    }

    monthDiv.appendChild(grid);
    container.appendChild(monthDiv);
  }

  // Delegated listeners (hover anywhere on chip/bar)
  wireCalendarBubbles();
}

/* --------- Calendar Hover Bubbles --------- */

// ---- Bubble helpers (replace your current makeBubble / hide helpers if different)
let bubbleTimer = null;
function hideBubbleSoon(){ clearTimeout(bubbleTimer); bubbleTimer = setTimeout(hideBubble, 180); }
function hideBubble(){ const b = document.getElementById("bubble"); if (b) b.remove(); }

function makeBubble(anchor){
  hideBubble();
  const b = document.createElement("div");
  b.id = "bubble";
  b.className = "bubble";
  document.body.appendChild(b);

  const rect = anchor.getBoundingClientRect();
  // Position so it TOUCHES the chip/bar with no visible gap
  b.style.left = `${rect.left + window.scrollX}px`;
  b.style.top  = `${rect.bottom + window.scrollY}px`; // no +6 offset
  b.addEventListener("mouseenter", ()=>clearTimeout(bubbleTimer));
  b.addEventListener("mouseleave", hideBubbleSoon);
  return b;
}


// === REPLACE your existing showTaskBubble WITH THIS VERSION ===
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
    <div class="bubble-kv"><span>Cost:</span><span>${t.price != null ? ("$" + t.price) : (t.cost ? t.cost : "—")}</span></div>
    ${ (t.manualLink || t.storeLink)
        ? `<div class="bubble-kv"><span>Links:</span><span>
             ${t.manualLink ? `<a href="${t.manualLink}" target="_blank" rel="noopener">Manual</a>` : ``}
             ${t.manualLink && t.storeLink ? ` · ` : ``}
             ${t.storeLink ? `<a href="${t.storeLink}" target="_blank" rel="noopener">Store</a>` : ``}
           </span></div>`
        : `` }
    <div class="bubble-actions">
      <button data-bbl-complete="${t.id}">Complete</button>
      <button class="danger" data-bbl-remove="${t.id}">Remove</button>
      <button data-bbl-edit="${t.id}">Edit settings</button>
    </div>
  `;

  // Same handlers as before
  document.querySelector("[data-bbl-complete]").onclick = () => {
    completeTask(taskId);
    hideBubble();
  };
  document.querySelector("[data-bbl-remove]").onclick = () => {
    tasksInterval = tasksInterval.filter(x => x.id !== taskId);
    saveCloudDebounced();
    toast("Removed");
    hideBubble();
    route();
  };
  document.querySelector("[data-bbl-edit]").onclick = () => {
    hideBubble();
    openSettingsAndReveal(taskId);
  };
}

// === KEEP these as-is; if you accidentally removed them, paste these versions ===
function showJobBubble(jobId, anchor){
  // Be robust to id type (string vs number)
  const j = cuttingJobs.find(x => String(x.id) === String(jobId));

  const b = makeBubble(anchor);

  if (!j) {
    b.innerHTML = `
      <div class="bubble-title">Job</div>
      <div class="bubble-kv"><span>Info:</span><span>Job not found (id: ${jobId})</span></div>
    `;
    return;
  }

  const eff = computeJobEfficiency(j);   // $/hr model
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
    <div class="bubble-kv"><span>Hours Δ:</span>
      <span>${eff.deltaHours>=0?"+":""}${eff.deltaHours.toFixed(1)} (exp ${eff.expectedHours.toFixed(1)} vs act ${eff.actualHours.toFixed(1)})</span>
    </div>
    <div class="bubble-kv"><span>Gain/Loss:</span><span>${sign}$${money} @ $${eff.rate}/hr</span></div>
    <div class="bubble-kv"><span>Required/day:</span><span>${reqCell}</span></div>
    <div class="bubble-kv"><span>Notes:</span><span>${j.notes || "—"}</span></div>
    ${noteAuto}
    <div class="bubble-actions">
      <button type="button" data-bbl-edit-job="${j.id}">Edit</button>
      <button type="button" class="danger" data-bbl-remove-job="${j.id}">Remove</button>
    </div>
  `;

  const removeBtn = b.querySelector("[data-bbl-remove-job]");
  const editBtn   = b.querySelector("[data-bbl-edit-job]");
  if (removeBtn) removeBtn.onclick = () => {
    cuttingJobs = cuttingJobs.filter(x => String(x.id) !== String(j.id));
    saveCloudDebounced(); toast("Removed"); hideBubble(); route();
  };
  if (editBtn) editBtn.onclick = () => { hideBubble(); openJobsEditor(j.id); };
}

function completeTask(taskId){
  const t = tasksInterval.find(x => String(x.id) === String(taskId));
  if (!t) return;
  const cur = RENDER_TOTAL ?? currentTotal();
  t.anchorTotal = cur != null ? cur : 0; // reset anchor to current total
  t.sinceBase   = 0;                     // since = 0 going forward
  saveCloudDebounced();
  toast("Task completed");
  route(); // re-render calendar and dashboard
}

/* -------- Completion & quick add -------- */
function completeTask(taskId){
  const t = tasksInterval.find(x => x.id === taskId);
  if (!t) return;
  const cur = RENDER_TOTAL ?? currentTotal();
  t.anchorTotal = cur != null ? cur : 0;
  t.sinceBase = 0;
  saveCloudDebounced();
  toast("Task completed");
  route();
}
function quickAddFromCalendar({ name, interval, condition }){
  const id = genId(name);
  if (interval && interval > 0) {
    tasksInterval.push({ id, name, interval:parseFloat(interval), sinceBase:null, anchorTotal:null, cost:"", link:"" });
  } else {
    tasksAsReq.push({ id, name, condition:condition||"As required", cost:"", link:"" });
  }
  inventory.push({ id:"inv_"+id, name, qty:0, unit:"pcs", note:"", pn:"", link:"" });
  saveCloudDebounced();
  toast("Task added");
  route();
}
function openSettingsAndReveal(taskId){
  location.hash = "#settings";
  setTimeout(()=>{ const el = document.querySelector(`[data-task-id="${taskId}"]`); if (el) { el.open = true; el.scrollIntoView({behavior:"smooth", block:"center"}); } }, 60);
}

/* -------- Cutting jobs helpers -------- */
function computeJobSpan(dueISO, estimateHours){
  const due = new Date(dueISO); due.setHours(0,0,0,0);
  const daysNeeded = Math.ceil(estimateHours / DAILY_HOURS);
  const start = new Date(due); start.setDate(due.getDate() - (daysNeeded - 1));
  return { startISO: start.toISOString(), dueISO: due.toISOString() };
}
// Required hours/day to hit the due date, based on manual override (or auto fallback)
function computeRequiredDaily(job){
  if (!job || !job.startISO || !job.dueISO) {
    return { remainingHours: 0, remainingDays: 0, requiredPerDay: 0 };
  }
  const eff = computeJobEfficiency(job);  // gives actualHours
  const planned = Number(job.estimateHours) || 0;
  const remainingHours = Math.max(0, planned - eff.actualHours);

  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(job.dueISO); due.setHours(0,0,0,0);
  const asOf  = (today < due) ? today : due;

  // days left including today if before/equal due
  const remainingDays = (asOf <= due)
    ? Math.max(0, Math.floor((due - asOf)/(24*60*60*1000)) + 1)
    : 0;

  const requiredPerDay = (remainingDays > 0)
    ? (remainingHours / remainingDays)
    : (remainingHours > 0 ? Infinity : 0);

  return { remainingHours, remainingDays, requiredPerDay };
}

/* ======================= Controllers ======================= */
function viewInventory(){
  const rows = inventory.map((it, i) => `
    <tr>
      <td><input type="text" data-inv="name" data-i="${i}" value="${it.name}"></td>
      <td><input type="text" data-inv="pn" data-i="${i}" value="${it.pn||""}"></td>
      <td><input type="url"  data-inv="link" data-i="${i}" value="${it.link||""}"></td>
      <td><input type="number" step="1" min="0" data-inv="qty" data-i="${i}" value="${it.qty||0}"></td>
      <td><input type="text" data-inv="unit" data-i="${i}" value="${it.unit||"pcs"}"></td>
      <td><input type="text" data-inv="note" data-i="${i}" value="${it.note||""}"></td>
      <td><button class="danger" data-inv="remove" data-i="${i}">−</button></td>
    </tr>`).join("");

  return `
  <div class="container">
    <div class="block" style="grid-column: 1 / -1">
      <h3>Inventory (Cloud)</h3>
      <div class="inv-toolbar">
        <button id="addInvRow">+ Add Item</button>
        <button id="saveInv">Save Inventory</button>
      </div>
      <table>
        <thead>
          <tr><th>Item</th><th>Part #</th><th>Link</th><th>Qty</th><th>Unit</th><th>Notes</th><th>Actions</th></tr>
        </thead>
        <tbody id="invBody">${rows}</tbody>
      </table>
    </div>
  </div>`;
}

function renderDashboard(){
  // Compute current totals before rendering
  RENDER_TOTAL = currentTotal();
  RENDER_DELTA = deltaSinceLast();

  // Inject the dashboard UI
  $("#content").innerHTML = viewDashboard();

  // Bind: Log Hours
  const logBtn = $("#logBtn");
  if (logBtn) {
    logBtn.onclick = () => {
      const v = parseFloat($("#totalInput").value);
      if (!isNaN(v)) {
        totalHistory.push({ dateISO: new Date().toISOString(), hours: v });
        saveCloudDebounced();
        toast("Logged");
        route(); // re-render to refresh calendar and next due
      }
    };
  }

  // Bind: Quick Add Task (from calendar toolbar)
  const qaForm = $("#quickAddForm");
  if (qaForm) {
    qaForm.addEventListener("submit",(e)=>{
      e.preventDefault();
      const name = $("#qa_name").value.trim();
      const intervalStr = $("#qa_interval").value;
      const condition = $("#qa_condition").value.trim();
      const interval = intervalStr === "" ? null : parseFloat(intervalStr);
      if (!name) { toast("Enter a task name"); return; }
      if (interval !== null && !(interval > 0)) { toast("Interval must be > 0"); return; }
      quickAddFromCalendar({ name, interval, condition });
    });
  }

  // Compute "Next Due" box
  const nds = tasksInterval
    .map(t => ({ t, nd: nextDue(t) }))
    .filter(x => x.nd)
    .sort((a,b) => a.nd.due - b.nd.due);

  const ndBox = $("#nextDueBox");
  if (ndBox) {
    ndBox.textContent = nds.length
      ? `${nds[0].t.name}: ${Math.max(0, nds[0].nd.remain.toFixed(0))} hrs → ${nds[0].nd.due.toDateString()} (in ${nds[0].nd.days} days)`
      : "—";
  }

  // Finally, draw the calendar grid + events
  renderCalendar();
}

function renderSettings(){
  RENDER_TOTAL = currentTotal();
  RENDER_DELTA = deltaSinceLast();

  const root = $("#content");
  root.innerHTML = viewSettings();

   // --- Intelligent search wiring (new) ---
const searchInput = $("#settingsSearch");
const doSearch = debounce(() => {
  const q = (searchInput.value || "").trim();
  if (!q) {
    renderSettingsSearchResults([]);
    return;
  }
  const results = searchSettingsItems(q);
  renderSettingsSearchResults(results);
}, 120);

if (searchInput){
  searchInput.addEventListener("input", doSearch);
  searchInput.addEventListener("keydown", (e)=>{
    if (e.key === "Enter"){
      e.preventDefault();
      const q = (searchInput.value || "").trim();
      const results = q ? searchSettingsItems(q) : [];
      renderSettingsSearchResults(results);
      const first = $("#settingsSearchResults .search-item");
      if (first) first.click();
    }
  });
   
  // --- Pump Efficiency widget (new) ---
  if (typeof renderPumpWidget === "function") {
    renderPumpWidget();
  }
}

  // Inputs (with re-anchor on sinceBase edits) — cloud save
  $$("#content [data-id]").forEach(inp => {
    inp.addEventListener("input", () => {
      const id   = inp.getAttribute("data-id");
      const key  = inp.getAttribute("data-k");
      const list = inp.getAttribute("data-list");
      const arr  = list === "interval" ? tasksInterval : tasksAsReq;
      const t = arr.find(x => x.id === id); if (!t) return;

      let val = inp.value;
      if (["interval","sinceBase","price"].includes(key)) {
        val = (val === "" ? null : parseFloat(val));
        if (key === "interval" && val !== null && !(val > 0)) { inp.value = t.interval ?? ""; return; }
      }
      t[key] = val;

      // When baseline 'since last' changes, re-anchor so calendar moves immediately
      if (list === "interval" && key === "sinceBase") {
        const cur = RENDER_TOTAL ?? currentTotal();
        if (val !== null && cur != null) t.anchorTotal = cur - val;
      }

      saveCloudDebounced();
    });
  });

  // Remove
  $$("#content [data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove");
      const from = btn.getAttribute("data-from");
      if (from === "interval") tasksInterval = tasksInterval.filter(t => t.id !== id);
      else tasksAsReq = tasksAsReq.filter(t => t.id !== id);
      saveCloudDebounced(); toast("Removed"); route();
    });
  });

  // Complete
  $$("#content .btn-complete").forEach(btn => {
    btn.addEventListener("click", () => completeTask(btn.getAttribute("data-complete")));
  });

  // Add forms
  $("#addIntervalForm").addEventListener("submit",(e)=>{
    e.preventDefault();
    const name = $("#ai_name").value.trim();
    const interval = parseFloat($("#ai_interval").value);
    if (!name || isNaN(interval) || !(interval>0)) { toast("Enter name and interval > 0"); return; }
    const id = genId(name);
    tasksInterval.push({ id, name, interval, sinceBase:null, anchorTotal:null, cost:"", link:"" });
    inventory.push({ id:"inv_"+id, name, qty:0, unit:"pcs", note:"", pn:"", link:"" });
    saveCloudDebounced(); toast("Task added"); route();
  });
  $("#addAsReqForm").addEventListener("submit",(e)=>{
    e.preventDefault();
    const name = $("#ar_name").value.trim();
    const condition = $("#ar_condition").value.trim() || "As required";
    if (!name) { toast("Enter a name"); return; }
    const id = genId(name);
    tasksAsReq.push({ id, name, condition, cost:"", link:"" });
    inventory.push({ id:"inv_"+id, name, qty:0, unit:"pcs", note:"", pn:"", link:"" });
    saveCloudDebounced(); toast("Task added"); route();
  });

  $("#saveTasksBtn").onclick = ()=>{ saveCloudDebounced(); toast("Saved"); route(); };
}

function renderCosts(){
  RENDER_TOTAL = currentTotal();
  RENDER_DELTA = deltaSinceLast();

  $("#content").innerHTML = viewCosts();

  const tbodyInt  = $("#costTableInterval tbody");
  const tbodyAR   = $("#costTableAsReq tbody");
  const tbodyJobs = $("#costTableJobs tbody");

  // helpers
  const linksCell = (obj) => {
    const m = obj.manualLink, s = obj.storeLink;
    return (m || s)
      ? `${m ? `<a href="${m}" target="_blank" rel="noopener">Manual</a>` : ""}${m && s ? " · " : ""}${s ? `<a href="${s}" target="_blank" rel="noopener">Store</a>` : ""}`
      : "—";
  };
  const money = (v) => (v != null && isFinite(v)) ? ("$" + Number(v).toFixed(2)) : "—";

  // --- Per Interval (editable cost)
  tbodyInt.innerHTML = tasksInterval.map(t => {
    const costTxt = (t.price != null && isFinite(t.price)) ? t.price : (t.cost || "");
    return `<tr>
      <td>${t.name}</td>
      <td>${t.interval}</td>
      <td>
        <input type="text" class="cost-edit" data-list="interval" data-id="${t.id}" value="${costTxt}" placeholder="$ or text">
      </td>
      <td>${linksCell(t)}</td>
    </tr>`;
  }).join("");

  // --- As Required (editable cost)
  tbodyAR.innerHTML = tasksAsReq.map(t => {
    const costTxt = (t.price != null && isFinite(t.price)) ? t.price : (t.cost || "");
    return `<tr>
      <td>${t.name}</td>
      <td>${t.condition || "As required"}</td>
      <td>
        <input type="text" class="cost-edit" data-list="asreq" data-id="${t.id}" value="${costTxt}" placeholder="$ or text">
      </td>
      <td>${linksCell(t)}</td>
    </tr>`;
  }).join("");

  // --- Cutting Jobs (material cost/qty still editable; now shows required/day as before)
  tbodyJobs.innerHTML = cuttingJobs.map(j => {
    const eff = computeJobEfficiency(j);
    const req = computeRequiredDaily(j);

    const effText = `${eff.deltaHours>=0?"+":""}${eff.deltaHours.toFixed(0)} hr Δ (exp ${eff.expectedHours.toFixed(0)} vs act ${eff.actualHours.toFixed(0)}) → ${eff.efficiencyAmount>=0?"+":""}$${eff.efficiencyAmount.toFixed(2)}`;

    const materialCost = (j.materialCost != null && isFinite(j.materialCost)) ? Number(j.materialCost) : 0;
    const materialQty  = (j.materialQty  != null && isFinite(j.materialQty))  ? Number(j.materialQty)  : 0;
    const materialTotal = materialCost * materialQty;

    const reqCell = (req.requiredPerDay === Infinity)
      ? `<span class="danger">Past due / no days</span>`
      : `${req.requiredPerDay.toFixed(2)} hr/day`;

    return `<tr data-job="${j.id}">
      <td>${j.name}</td>
      <td>${j.estimateHours} hrs</td>
      <td>${j.material || "—"}</td>
      <td><input type="number" step="0.01" min="0" class="job-mcost" data-job-id="${j.id}" value="${materialCost}"></td>
      <td><input type="number" step="0.01" min="0" class="job-mqty" data-job-id="${j.id}" value="${materialQty}"></td>
      <td>${money(materialTotal)}</td>
      <td>${effText} · ${reqCell}</td>
      <td>$${(j.originalProfit||0).toFixed(2)} → $${eff.newProfit.toFixed(2)}</td>
    </tr>`;
  }).join("");

  // Handlers: edit maintenance costs
  $$(".cost-edit").forEach(inp=>{
    inp.addEventListener("change", ()=>{
      const list = inp.getAttribute("data-list"); // "interval" | "asreq"
      const id   = inp.getAttribute("data-id");
      const arr  = (list==="interval") ? tasksInterval : tasksAsReq;
      const t    = arr.find(x=>x.id===id);
      if (!t) return;

      const raw = inp.value.trim();
      const num = parseFloat(raw.replace(/^\$/, "")); // allow leading $
      if (isFinite(num)) {
        t.price = num;
        t.cost  = ""; // canonical numeric store in price
      } else {
        t.price = null;
        t.cost  = raw; // free text (e.g., "varies", "OEM only")
      }
      saveCloudDebounced();
      toast("Cost saved");
    });
  });

  // Handlers: edit job material cost/qty (already present)
  const updateRowTotal = (row, job) => {
    const cells = row.querySelectorAll("td");
    if (cells[5]) {
      const total = (Number(job.materialCost)||0) * (Number(job.materialQty)||0);
      cells[5].textContent = total ? "$" + total.toFixed(2) : "—";
    }
  };
  tbodyJobs.addEventListener("input", (e) => {
    const el = e.target;
    if (!el || !el.matches(".job-mcost, .job-mqty")) return;
    const id = el.getAttribute("data-job-id");
    const j  = cuttingJobs.find(x=>x.id===id);
    if (!j) return;

    const val = parseFloat(el.value);
    if (el.classList.contains("job-mcost")) j.materialCost = isFinite(val) && val >= 0 ? val : 0;
    else j.materialQty = isFinite(val) && val >= 0 ? val : 0;

    saveCloudDebounced();
    const row = el.closest("tr");
    if (row) updateRowTotal(row, j);
  });
}

function renderInventory(){
  $("#content").innerHTML = viewInventory();

  $$("#content [data-inv]").forEach(el => {
    el.addEventListener("input", () => {
      const i = parseInt(el.getAttribute("data-i"), 10);
      const k = el.getAttribute("data-inv");
      if (k === "remove") return;
      inventory[i][k] = (k === "qty") ? parseFloat(el.value||0) : el.value;
      saveCloudDebounced();
    });
  });
  $$("#content [data-inv='remove']").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = parseInt(btn.getAttribute("data-i"), 10);
      inventory.splice(i,1);
      saveCloudDebounced();
      toast("Removed");
      renderInventory();
    });
  });
  $("#addInvRow").onclick = () => {
    inventory.push({ id:"inv_custom_"+Date.now(), name:"New Item", qty:0, unit:"pcs", note:"", pn:"", link:"" });
    renderInventory();
  };
  $("#saveInv").onclick = () => { saveCloudDebounced(); toast("Saved"); route(); };
}

function renderJobs(){
  // Render the Cutting Jobs UI
  $("#content").innerHTML = viewJobs();

  // -- Add new job -----------------------------------------------------------
  const form = $("#jobForm");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name     = $("#job_name").value.trim();
    const hours    = parseFloat($("#job_hours").value);
    const material = $("#job_material").value.trim();
    const notes    = $("#job_notes").value.trim();
    const dueStr   = $("#job_due").value; // yyyy-mm-dd

    if (!name || !(hours > 0) || !dueStr) {
      toast("Enter name, hours > 0, and a due date.");
      return;
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
  // Inject into dashboard card container
  const host = document.getElementById("pump-widget");
  if (!host) return;
  host.innerHTML = viewPumpWidget();

  // Baseline form
  const f1 = document.getElementById("pumpBaselineForm");
  f1.addEventListener("submit", (e)=>{
    e.preventDefault();
    const rpm = Number(document.getElementById("pumpBaselineRPM").value);
    if (!isFinite(rpm) || rpm <= 0) { toast("Enter a valid RPM."); return; }
    pumpEff.baselineRPM     = rpm;
    pumpEff.baselineDateISO = new Date().toISOString().slice(0,10);
    saveCloudDebounced();
    toast("Baseline set");
    renderPumpWidget();
  });

  // Daily log form
  const f2 = document.getElementById("pumpLogForm");
  f2.addEventListener("submit", (e)=>{
    e.preventDefault();
    const d   = document.getElementById("pumpLogDate").value;
    const rpm = Number(document.getElementById("pumpLogRPM").value);
    if (!d || !isFinite(rpm) || rpm <= 0) { toast("Enter date and valid RPM."); return; }
    upsertPumpEntry(d, rpm);
    saveCloudDebounced();
    toast("Log saved");
    renderPumpWidget();
  });

  // Draw chart
  const c = document.getElementById("pumpChart");
  drawPumpChart(c);
}

function drawPumpChart(canvas){
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  // bg
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0,0,W,H);

  // guard
  if (!pumpEff.entries.length){
    ctx.fillStyle = "#888";
    ctx.fillText("No pump logs yet.", 12, H/2);
    return;
  }

  // data prep
  const data = pumpEff.entries.slice();           // [{dateISO, rpm}]
  const dates = data.map(d => new Date(d.dateISO+"T00:00:00"));
  const rpms  = data.map(d => d.rpm);
  const minR  = Math.min(...rpms, pumpEff.baselineRPM ?? rpms[0]);
  const maxR  = Math.max(...rpms, pumpEff.baselineRPM ?? rpms[0]);
  const padY  = Math.max(5, (maxR - minR) * 0.1);

  const xMin = dates[0].getTime();
  const xMax = dates[dates.length-1].getTime();
  const yMin = minR - padY;
  const yMax = maxR + padY;

  const X = t => ( (t - xMin) / Math.max(1, (xMax - xMin)) ) * (W-40) + 30;
  const Y = v => H - 20 - ( (v - yMin) / Math.max(1, (yMax - yMin)) ) * (H-40);

  // axes
  ctx.strokeStyle = "#e2e6f1";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(30, 10); ctx.lineTo(30, H-20); ctx.lineTo(W-10, H-20); ctx.stroke();

  // baseline line
  if (pumpEff.baselineRPM){
    ctx.strokeStyle = "#999";
    ctx.setLineDash([4,4]);
    ctx.beginPath();
    ctx.moveTo(30, Y(pumpEff.baselineRPM));
    ctx.lineTo(W-10, Y(pumpEff.baselineRPM));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#666";
    ctx.fillText(`Baseline ${pumpEff.baselineRPM} RPM`, 34, Y(pumpEff.baselineRPM) - 6);
  }

  // line
  ctx.strokeStyle = "#0a63c2";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i=0;i<data.length;i++){
    const x = X(dates[i].getTime());
    const y = Y(rpms[i]);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.stroke();

  // points
  ctx.fillStyle = "#0a63c2";
  for (let i=0;i<data.length;i++){
    const x = X(dates[i].getTime());
    const y = Y(rpms[i]);
    ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
  }

  // today marker
  const latest = pumpLatest();
  if (latest){
    const pct = pumpPercentChange(latest.rpm);
    const col = pumpColorFor(pct).cls;
    const colorMap = {
      "green":"#2e7d32", "green-better":"#2e7d32",
      "yellow":"#c29b00", "orange":"#d9822b", "red":"#c62828", "gray":"#777"
    };
    ctx.fillStyle = colorMap[col] || "#333";
    ctx.fillText(`Latest: ${latest.rpm} RPM (${latest.dateISO})  Δ%=${pct!=null?pct.toFixed(1):"—"}`, 34, 18);
  }
}

     
    const dueISO = new Date(`${dueStr}T00:00:00`).toISOString();
    const span   = computeJobSpan(dueISO, hours);
    const id     = genId(name);

    cuttingJobs.push({
      id, name,
      estimateHours: hours,
      material, notes,
      dueISO: span.dueISO,
      startISO: span.startISO,
      // manualLogs is an array of normalized entries produced by addManualLog
      // (If you still push raw objects elsewhere, keep the shape consistent.)
      manualLogs: []
    });

    saveCloudDebounced();
    toast("Job added");
    route(); // re-render the page so calendar & summaries refresh
  });

  // -- Delegated clicks inside #content (robust after re-renders) -----------
  $("#content").addEventListener("click", (ev) => {
    const editBtn   = ev.target.closest("[data-edit-job]");
    const saveBtn   = ev.target.closest("[data-save-job]");
    const cancelBtn = ev.target.closest("[data-cancel-job]");
    const rmBtn     = ev.target.closest("[data-remove-job]");
    const infoBtn   = ev.target.closest(".jm-info");

    // Enter edit mode for a single row
    if (editBtn){
      const id = editBtn.getAttribute("data-edit-job");
      editingJobs.clear();
      editingJobs.add(id);
      renderJobs();
      const first = document.querySelector(`tr[data-job="${id}"] .job-input`);
      if (first) { first.focus(); first.select?.(); }
      return;
    }

    // Save row edits
    if (saveBtn){
      const id = saveBtn.getAttribute("data-save-job");
      const j  = cuttingJobs.find(x => x.id === id);
      if (!j) return;

      const row    = document.querySelector(`tr[data-job="${id}"]`);
      const inputs = row.querySelectorAll(".job-input");
      const kv = {};
      let invalid = false;

      inputs.forEach(inp => {
        const k = inp.getAttribute("data-k");
        let v   = inp.value;

        if (k === "estimateHours") {
          v = parseFloat(v);
          if (!isFinite(v) || v <= 0) invalid = true;
        }
        kv[k] = v;
      });

      if (invalid) { toast("Fix invalid values"); return; }

      // Apply changes with dependent recompute (start shifts to keep due)
      Object.keys(kv).forEach(k => {
        if (k === "dueISO") {
          const dueISO = new Date(`${kv[k]}T00:00:00`).toISOString();
          const span   = computeJobSpan(dueISO, Number(kv.estimateHours ?? j.estimateHours) || 0);
          j.dueISO   = span.dueISO;
          j.startISO = span.startISO;
        } else if (k === "estimateHours") {
          j.estimateHours = Number(kv[k]);
          const span = computeJobSpan(j.dueISO, j.estimateHours);
          j.startISO = span.startISO; // keep due fixed; adjust start to fit hours
        } else {
          j[k] = kv[k];
        }
      });

      editingJobs.delete(id);
      saveCloudDebounced();
      toast("Saved");
      renderJobs(); // refresh efficiency/required/day
      return;
    }

    // Cancel row edits
    if (cancelBtn){
      const id = cancelBtn.getAttribute("data-cancel-job");
      editingJobs.delete(id);
      renderJobs();
      return;
    }

    // Remove job
    if (rmBtn){
      const id = rmBtn.getAttribute("data-remove-job");
      cuttingJobs = cuttingJobs.filter(j => j.id !== id);
      editingJobs.delete(id);
      saveCloudDebounced();
      toast("Removed");
      renderJobs();
      return;
    }

    // Info bubble (how math works)
    if (infoBtn){
      showInfoBubble(infoBtn);
      return;
    }
  });

  // -- Manual progress (completed / remaining) ------------------------------
  $$(".job-manual-form").forEach(f => {
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const jobId = f.getAttribute("data-job-id");
      const j     = cuttingJobs.find(x => x.id === jobId);
      if (!j) return;

      const dateStr = f.querySelector(".jm-date").value;  // yyyy-mm-dd
      const mode    = f.querySelector(".jm-mode").value;  // "completed" | "remaining"
      const val     = parseFloat(f.querySelector(".jm-value").value);

      if (!dateStr || !(val >= 0)) { toast("Enter valid hours"); return; }

      // Use your helper to normalize and store manual progress
      if (typeof addManualLog === "function") {
        const ok = addManualLog(jobId, dateStr, mode, val);
        if (!ok) { toast("Job not found"); return; }
      } else {
        // Fallback: store raw entry (keeps your previous behavior)
        if (!Array.isArray(j.manualLogs)) j.manualLogs = [];
        j.manualLogs.push({ dateISO: dateStr, type: mode, hours: val });
      }

      saveCloudDebounced();
      toast("Manual progress saved");
      renderJobs();
    });
  });
}

function showInfoBubble(anchor){
  const b = makeBubble(anchor);
  b.innerHTML = `
    <div class="bubble-title">How calculations work</div>
    <div class="bubble-kv">
      <span><strong>Manual Logs</strong></span>
      <span>We use your latest manual hours. If you stop logging, we estimate from that last entry at <b>${DAILY_HOURS}</b> hr/day until today or the due date.</span>
    </div>
    <div class="bubble-kv">
      <span><strong>Automatic</strong></span>
      <span>If there are no manual logs, actual hours come from your daily <em>Total Hours</em> logs.</span>
    </div>
    <div class="bubble-kv">
      <span><strong>Efficiency</strong></span>
      <span>Δhrs = expected − actual. Profit impact = −Δhrs × (originalProfit ÷ estimateHours).</span>
    </div>
    <div class="bubble-kv">
      <span><strong>Required/day</strong></span>
      <span>Remaining hours ÷ remaining calendar days (inclusive) to meet the due date. Can be above or below <b>${DAILY_HOURS}</b>.</span>
    </div>
  `;
}

function showJobBubble(jobId, anchor){
  const j = cuttingJobs.find(x => String(x.id) === String(jobId));
  const b = makeBubble(anchor);

  if (!j) {
    b.innerHTML = `<div class="bubble-title">Job</div>
                   <div class="bubble-kv"><span>Info:</span><span>Job not found (id: ${jobId})</span></div>`;
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

  b.innerHTML = `
    <div class="bubble-title">${j.name}</div>
    <div class="bubble-kv"><span>Estimate:</span><span>${j.estimateHours} hrs</span></div>
    <div class="bubble-kv"><span>Material:</span><span>${j.material || "—"}</span></div>
    <div class="bubble-kv"><span>Schedule:</span><span>${(new Date(j.startISO)).toDateString()} → ${(new Date(j.dueISO)).toDateString()}</span></div>
    <div class="bubble-kv"><span>Hours Δ:</span>
      <span>${eff.deltaHours>=0?"+":""}${eff.deltaHours.toFixed(1)} (exp ${eff.expectedHours.toFixed(1)} vs act ${eff.actualHours.toFixed(1)})</span>
    </div>
    <div class="bubble-kv"><span>Gain/Loss:</span><span>${sign}$${money} @ $${eff.rate}/hr</span></div>
    <div class="bubble-kv"><span>Required/day:</span><span>${reqCell}</span></div>
    <div class="bubble-kv"><span>Notes:</span><span>${j.notes || "—"}</span></div>
    ${noteAuto}
    <div class="bubble-actions">
      <button type="button" data-bbl-edit-job="${j.id}">Edit</button>
      <button type="button" class="danger" data-bbl-remove-job="${j.id}">Remove</button>
    </div>
  `;

  // actions
  const removeBtn = b.querySelector("[data-bbl-remove-job]");
  const editBtn   = b.querySelector("[data-bbl-edit-job]");
  if (removeBtn) removeBtn.onclick = () => {
    cuttingJobs = cuttingJobs.filter(x => x.id !== j.id);
    saveCloudDebounced(); toast("Removed"); hideBubble(); route();
  };
  if (editBtn) editBtn.onclick = () => { hideBubble(); openJobsEditor(j.id); };

  document.querySelector("[data-bbl-remove-job]").onclick = () => {
    cuttingJobs = cuttingJobs.filter(x => x.id !== jobId);
    saveCloudDebounced(); toast("Removed"); hideBubble(); route();
  };
  document.querySelector("[data-bbl-edit-job]").onclick = () => { hideBubble(); openJobsEditor(j.id); };
}



function openJobsEditor(jobId){
  const j = cuttingJobs.find(x=>x.id===jobId);
  if (!j) return;

  const name = prompt("Job name:", j.name);
  if (name === null) return;

  const est = parseFloat(prompt("Estimate hours:", j.estimateHours));
  if (!(est>0)) { toast("Hours > 0"); return; }

  const profitStr = prompt("Original Profit ($):", (j.originalProfit!=null? j.originalProfit : 0));
  const originalProfit = profitStr === null ? j.originalProfit : parseFloat(profitStr);
  if (originalProfit == null || isNaN(originalProfit) || originalProfit < 0){ toast("Profit must be ≥ 0"); return; }

  const material = prompt("Material:", j.material||"");
  if (material === null) return;

  const notes = prompt("Notes:", j.notes||"");
  if (notes === null) return;

  const dueStr = prompt("Due date (YYYY-MM-DD):", j.dueISO.slice(0,10));
  if (!dueStr) return;

  const dueISO = new Date(`${dueStr}T00:00:00`).toISOString();
  const span = computeJobSpan(dueISO, est);

  Object.assign(j, {
    name,
    estimateHours: est,
    originalProfit: originalProfit,
    material, notes,
    dueISO: span.dueISO,
    startISO: span.startISO
  });

  saveCloudDebounced(); toast("Updated"); route();
}


/* ---------------- Tabs / Router ---------------- */
function setActive(tab){
  ["dashboard","settings","costs","inventory","jobs"].forEach(id=>{
    const el = document.getElementById("tab-"+id);
    if (el) el.classList.toggle("active", id===tab);
  });
}
function route(){
  const hash = (location.hash || "#dashboard").replace("#","");
  setActive(hash);

  // recompute global render numbers
  RENDER_TOTAL = currentTotal();
  RENDER_DELTA = deltaSinceLast();

  if (hash === "settings")      renderSettings();
  else if (hash === "costs")    renderCosts();
  else if (hash === "inventory")renderInventory();
  else if (hash === "jobs")     renderJobs();
  else                          renderDashboard(); // default = dashboard
}

// --- Pump Efficiency state (persisted) ---
window.pumpEff = window.pumpEff || {
  baselineRPM: null,          // number
  baselineDateISO: null,      // "yyyy-mm-dd"
  entries: []                 // [{dateISO:"yyyy-mm-dd", rpm:number}]
};

// normalize helper: keep one entry per day
function upsertPumpEntry(dateISO, rpm){
  const d = String(dateISO);
  const r = Number(rpm);
  if (!isFinite(r) || r <= 0) return false;
  const i = pumpEff.entries.findIndex(e => e.dateISO === d);
  if (i >= 0) pumpEff.entries[i].rpm = r;
  else pumpEff.entries.push({ dateISO: d, rpm: r });
  pumpEff.entries.sort((a,b)=> a.dateISO.localeCompare(b.dateISO));
  return true;
}

function pumpLatest(){
  if (!pumpEff.entries.length) return null;
  return pumpEff.entries[pumpEff.entries.length - 1];
}

// percent change vs baseline (positive = worse / needs more RPM to hold 49ksi)
function pumpPercentChange(latestRPM){
  if (!pumpEff.baselineRPM || !isFinite(latestRPM)) return null;
  return ((latestRPM - pumpEff.baselineRPM) / pumpEff.baselineRPM) * 100;
}

// color classification
function pumpColorFor(pct){
  if (pct == null) return {cls:"gray", label:"—"};
  // negative = better efficiency (needs less RPM)
  if (pct < 0) return {cls:"green-better", label:`${pct.toFixed(1)}% (better)`};
  if (pct > 18) return {cls:"red",    label:`${pct.toFixed(1)}%`};
  if (pct > 15) return {cls:"orange", label:`${pct.toFixed(1)}%`};
  if (pct >= 8) return {cls:"yellow", label:`${pct.toFixed(1)}%`};
  return {cls:"green",  label:`${pct.toFixed(1)}%`};
}



/* ---------------- Boot ---------------- */
(async function boot(){
  await initFirebase();
  await loadFromCloud();
  window.addEventListener("hashchange", route);
  route();

  // Prevent double-click from “downloading” links accidentally
  document.addEventListener("dblclick", (e) => {
    const a = e.target.closest && e.target.closest("a");
    if (a) { e.preventDefault(); window.open(a.href, "_blank", "noopener"); }
  });
})();
