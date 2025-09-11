/* =========================================================
   OMAX 1530 Maintenance Tracker — v7.0 (Cloud sync: Firebase)
   - Persists state in Firestore under anonymous auth (per-user doc)
   - Works on GitHub Pages (static)
   ========================================================= */

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
  const planned = (job && job.estimateHours > 0) ? Number(job.estimateHours) : 0;
  const origProfit = Number(job && job.originalProfit != null ? job.originalProfit : 0);
  const rate = planned > 0 ? (origProfit / planned) : 0; // $/hr

  if (!job || !job.startISO || !job.dueISO || planned <= 0) {
    return {
      pph: rate,
      expectedHours: 0,
      actualHours: 0,
      deltaHours: 0,
      efficiencyAmount: 0,
      newProfit: origProfit,
      daysElapsed: 0,
      totalDays: 0
    };
  }

  // Normalize dates to local midnight
  const start = new Date(job.startISO); start.setHours(0,0,0,0);
  const due   = new Date(job.dueISO);   due.setHours(0,0,0,0);
  const today = new Date();             today.setHours(0,0,0,0);

  // Window considered = from start up to "as of" date (today or due, whichever is earlier)
  const asOf = (today < due) ? today : due;

  // Planned days = inclusive span between start and due
  const totalDays = daysBetweenInclusive(start, due);

  // Elapsed days so far within the window; zero if we haven't started yet
  const daysElapsed = (asOf < start) ? 0 : daysBetweenInclusive(start, asOf);

  // Expected hours so far (capped at the total planned hours)
  const expectedHoursRaw = daysElapsed * DAILY_HOURS;
  const expectedHours = Math.min(expectedHoursRaw, planned);

  // Actual hours so far from your totalHistory deltas, just within [start ... asOf]
  const daily = buildDailyHoursMap(); // { 'YYYY-M-D': hoursThatDay }
  let actualRaw = 0;
  if (daysElapsed > 0) {
    const cur = new Date(start);
    while (cur <= asOf) {
      const key = ymd(cur);
      actualRaw += (daily[key] || 0);
      cur.setDate(cur.getDate() + 1);
    }
  }
  const actualHours = Math.min(actualRaw, planned);

  // Hours gap (positive = behind; negative = ahead)
  const deltaHours = expectedHours - actualHours;

  // Money impact; behind reduces profit, ahead increases it
  const efficiencyAmount = - deltaHours * rate;
  const newProfit = origProfit + efficiencyAmount;

  return {
    pph: rate,
    expectedHours,
    actualHours,
    deltaHours,
    efficiencyAmount,
    newProfit,
    daysElapsed,
    totalDays
  };
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
  const cur = RENDER_TOTAL ?? currentTotal();
  const prev = previousTotal();
  const delta = RENDER_DELTA ?? deltaSinceLast();

  return `
  <div class="container">
    <div class="block">
      <h3>Total Hours</h3>
      <label>Enter total hours now:
        <input type="number" id="totalInput" value="${cur!=null?cur:""}" />
      </label>
      <button id="logBtn">Log Hours</button>
      <div class="hint">Last updated: ${cur!=null? new Date(totalHistory[totalHistory.length-1].dateISO).toLocaleString(): "—"}</div>
      <div class="small">Δ since last: <b>${(delta||0).toFixed(0)} hrs</b>${prev!=null? " (prev "+prev+")":""}</div>
    </div>

    <div class="block">
      <h3>Next Due</h3>
      <div id="nextDueBox">Calculating…</div>
    </div>

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
    const effText = `${eff.deltaHours>=0?"+":""}${eff.deltaHours.toFixed(0)} hr Δ (exp ${eff.expectedHours.toFixed(0)} vs act ${eff.actualHours.toFixed(0)}) → ${eff.efficiencyAmount>=0?"+":""}$${eff.efficiencyAmount.toFixed(2)}`;
    const profitText = `$${(j.originalProfit||0).toFixed(2)} → $${eff.newProfit.toFixed(2)}`;
    return `
      <tr>
        <td>${j.name}</td>
        <td>${j.estimateHours} hrs</td>
        <td>${j.material||"—"}</td>
        <td>${(new Date(j.startISO)).toDateString()} → ${(new Date(j.dueISO)).toDateString()}</td>
        <td>${effText}</td>
        <td>${profitText}</td>
        <td>${j.notes?j.notes:"—"}</td>
        <td>
          <button data-edit-job="${j.id}">Edit</button>
          <button class="danger" data-remove-job="${j.id}">Remove</button>
        </td>
      </tr>`;
  }).join("");

  return `
  <div class="container">
    <div class="block">
      <h3>Add Cutting Job</h3>
      <form id="jobForm" class="mini-form">
        <input type="text" id="job_name" placeholder="Job name" required>
        <input type="number" id="job_hours" placeholder="Estimate (hrs)" required min="1">
        <input type="number" id="job_profit" placeholder="Original Profit ($)" required min="0" step="0.01">
        <input type="text" id="job_material" placeholder="Material">
        <input type="date" id="job_due" required>
        <input type="text" id="job_notes" placeholder="Notes">
        <button type="submit">Add Job</button>
      </form>
      <p class="small">Bars appear on the calendar from start to due (8 hrs/day baseline).</p>
    </div>

    <div class="block" style="grid-column: 1 / -1">
      <h3>Jobs</h3>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Estimate</th>
            <th>Material</th>
            <th>Schedule</th>
            <th>Efficiency</th>
            <th>Profit (Original → New)</th>
            <th>Notes</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows || ""}</tbody>
      </table>
    </div>
  </div>`;
}


function renderCalendar(){
  const container = $("#months");
  if (!container) return;
  container.innerHTML = "";

  // Due map for interval tasks
  const dueMap = {}; // key Y-M-D -> array of {type:"task", id, name}
  tasksInterval.forEach(t => {
    const nd = nextDue(t);
    if (!nd) return;
    const key = ymd(nd.due);
    (dueMap[key] ||= []).push({ type:"task", id:t.id, name:t.name });
  });

  // Jobs map (expanded per day)
  const jobsMap = {}; // key Y-M-D -> array of {type:"job", id, name}
  cuttingJobs.forEach(j => {
    const start = new Date(j.startISO);
    const end = new Date(j.dueISO);
    const cur = new Date(start);
    while (cur <= end) {
      const key = ymd(cur);
      (jobsMap[key] ||= []).push({ type:"job", id:j.id, name:j.name });
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
      const el = document.createElement("div"); el.textContent = d; weekdays.appendChild(el);
    });
    monthDiv.appendChild(weekdays);

    const grid = document.createElement("div");
    grid.className = "week";

    for (let i=0; i<first.getDay(); i++) {
      const blank = document.createElement("div"); blank.className = "day other-month"; grid.appendChild(blank);
    }

    for (let day=1; day<=last.getDate(); day++) {
      const date = new Date(first.getFullYear(), first.getMonth(), day);
      const cell = document.createElement("div"); cell.className = "day";
      if (date.getTime() === today.getTime()) cell.classList.add("today");
      cell.innerHTML = `<div class="date">${day}</div>`;

      const key = ymd(date);

      // Maintenance events (hover bubble + actions)
      (dueMap[key] || []).forEach(ev => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "event generic";
        btn.textContent = ev.name + " (due)";
        btn.addEventListener("mouseenter",(e)=>showTaskBubble(ev.id, btn));
        btn.addEventListener("mouseleave", hideBubbleSoon);
        cell.appendChild(btn);
      });

      // Job bars
      (jobsMap[key] || []).forEach(ev => {
        const bar = document.createElement("div");
        bar.className = "job-bar";
        bar.textContent = ev.name;
        bar.addEventListener("mouseenter",()=>showJobBubble(ev.id, bar));
        bar.addEventListener("mouseleave", hideBubbleSoon);
        cell.appendChild(bar);
      });

      grid.appendChild(cell);
    }

    const filled = first.getDay() + last.getDate();
    const rem = filled % 7;
    if (rem !== 0) for (let i=0; i<7-rem; i++) {
      const blank = document.createElement("div"); blank.className = "day other-month"; grid.appendChild(blank);
    }

    monthDiv.appendChild(grid);
    container.appendChild(monthDiv);
  }
}

/* --------- Calendar Hover Bubbles --------- */
let bubbleTimer = null;
function hideBubbleSoon(){ clearTimeout(bubbleTimer); bubbleTimer = setTimeout(hideBubble, 200); }
function hideBubble(){ const b = $("#bubble"); if (b) b.remove(); }

function makeBubble(anchor){
  hideBubble();
  const b = document.createElement("div");
  b.id = "bubble";
  b.className = "bubble";
  document.body.appendChild(b);
  const rect = anchor.getBoundingClientRect();
  b.style.left = `${rect.left + window.scrollX + 4}px`;
  b.style.top  = `${rect.bottom + window.scrollY + 6}px`;
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
  const j = cuttingJobs.find(x => x.id === jobId);
  if (!j) return;
  const b = makeBubble(anchor);
  const eff = computeJobEfficiency(j);
  const effText = `${eff.deltaHours>=0?"+":""}${eff.deltaHours.toFixed(0)} hr Δ (exp ${eff.expectedHours.toFixed(0)} vs act ${eff.actualHours.toFixed(0)}) → ${eff.efficiencyAmount>=0?"+":""}$${eff.efficiencyAmount.toFixed(2)}`;

  b.innerHTML = `
    <div class="bubble-title">${j.name}</div>
    <div class="bubble-kv"><span>Estimate:</span><span>${j.estimateHours} hrs</span></div>
    <div class="bubble-kv"><span>Material:</span><span>${j.material||"—"}</span></div>
    <div class="bubble-kv"><span>Schedule:</span><span>${(new Date(j.startISO)).toDateString()} → ${(new Date(j.dueISO)).toDateString()}</span></div>

    <div class="bubble-kv"><span>Original profit:</span><span>$${(j.originalProfit||0).toFixed(2)}</span></div>
    <div class="bubble-kv"><span>Efficiency:</span><span>${effText}</span></div>
    <div class="bubble-kv"><span>New profit:</span><span>$${eff.newProfit.toFixed(2)}</span></div>

    <div class="bubble-kv"><span>Notes:</span><span>${j.notes||"—"}</span></div>
    <div class="bubble-actions">
      <button data-bbl-edit-job="${j.id}">Edit</button>
      <button class="danger" data-bbl-remove-job="${j.id}">Remove</button>
    </div>
  `;

  document.querySelector("[data-bbl-remove-job]").onclick = () => {
    cuttingJobs = cuttingJobs.filter(x => x.id !== jobId);
    saveCloudDebounced(); toast("Removed"); hideBubble(); route();
  };
  document.querySelector("[data-bbl-edit-job]").onclick = () => { hideBubble(); openJobsEditor(j.id); };
}

function completeTask(taskId){
  const t = tasksInterval.find(x => x.id === taskId);
  if (!t) return;
  const cur = RENDER_TOTAL ?? currentTotal();
  t.anchorTotal = cur != null ? cur : 0; // reset anchor to current total
  t.sinceBase = 0;                       // since = 0 going forward
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

  // helper
  const linksCell = (obj) => {
    const m = obj.manualLink, s = obj.storeLink;
    return (m || s)
      ? `${m ? `<a href="${m}" target="_blank" rel="noopener">Manual</a>` : ""}${m && s ? " · " : ""}${s ? `<a href="${s}" target="_blank" rel="noopener">Store</a>` : ""}`
      : "—";
  };
  const money = (v) => (v != null && isFinite(v)) ? ("$" + Number(v).toFixed(2)) : "—";

  // --- Per Interval
  const rowsInt = [];
  tasksInterval.forEach(t => {
    const costCell = (t.price != null) ? ("$" + t.price) : (t.cost || "—");
    rowsInt.push(`<tr>
      <td>${t.name}</td>
      <td>${t.interval}</td>
      <td>${costCell}</td>
      <td>${linksCell(t)}</td>
    </tr>`);
  });
  tbodyInt.innerHTML = rowsInt.join("");

  // --- As Required
  const rowsAR = [];
  tasksAsReq.forEach(t => {
    const costCell = (t.price != null) ? ("$" + t.price) : (t.cost || "—");
    rowsAR.push(`<tr>
      <td>${t.name}</td>
      <td>${t.condition || "As required"}</td>
      <td>${costCell}</td>
      <td>${linksCell(t)}</td>
    </tr>`);
  });
  tbodyAR.innerHTML = rowsAR.join("");

  // --- Cutting Jobs (with inline editing for material cost/qty)
  const rowsJobs = [];
  cuttingJobs.forEach(j => {
    const eff = computeJobEfficiency(j);
    const effText = `${eff.deltaHours>=0?"+":""}${eff.deltaHours.toFixed(0)} hr Δ (exp ${eff.expectedHours.toFixed(0)} vs act ${eff.actualHours.toFixed(0)}) → ${eff.efficiencyAmount>=0?"+":""}$${eff.efficiencyAmount.toFixed(2)}`;

    const materialCost = (j.materialCost != null && isFinite(j.materialCost)) ? Number(j.materialCost) : 0;
    const materialQty  = (j.materialQty  != null && isFinite(j.materialQty))  ? Number(j.materialQty)  : 0;
    const materialTotal = materialCost * materialQty;

    rowsJobs.push(`<tr data-job="${j.id}">
      <td>${j.name}</td>
      <td>${j.estimateHours} hrs</td>
      <td>${j.material || "—"}</td>
      <td>
        <input type="number" step="0.01" min="0" class="job-mcost" data-job-id="${j.id}" value="${materialCost}">
      </td>
      <td>
        <input type="number" step="0.01" min="0" class="job-mqty" data-job-id="${j.id}" value="${materialQty}">
      </td>
      <td>${money(materialTotal)}</td>
      <td>${effText}</td>
      <td>$${(j.originalProfit||0).toFixed(2)} → $${eff.newProfit.toFixed(2)}</td>
    </tr>`);
  });
  tbodyJobs.innerHTML = rowsJobs.join("");

  // Inline edit handlers (delegate)
  tbodyJobs.addEventListener("input", (e) => {
    const el = e.target;
    if (!el) return;
    if (!el.matches(".job-mcost, .job-mqty")) return;
    const id = el.getAttribute("data-job-id");
    const job = cuttingJobs.find(x => x.id === id);
    if (!job) return;

    const val = parseFloat(el.value);
    if (el.classList.contains("job-mcost")) {
      job.materialCost = isFinite(val) && val >= 0 ? val : 0;
    } else {
      job.materialQty = isFinite(val) && val >= 0 ? val : 0;
    }

    saveCloudDebounced();

    // Re-render only the Material Total cell for this row
    const row = el.closest("tr");
    if (row) {
      const mCost = (job.materialCost != null && isFinite(job.materialCost)) ? Number(job.materialCost) : 0;
      const mQty  = (job.materialQty  != null && isFinite(job.materialQty))  ? Number(job.materialQty)  : 0;
      const mTot  = mCost * mQty;
      // Material Total is the 6th cell (0-based index 5)
      const cells = row.querySelectorAll("td");
      if (cells[5]) cells[5].textContent = (mTot ? "$" + mTot.toFixed(2) : "—");
    }
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
  $("#content").innerHTML = viewJobs();

  $("#jobForm").addEventListener("submit",(e)=>{
    e.preventDefault();
    const name = $("#job_name").value.trim();
    const hours = parseFloat($("#job_hours").value);
    const originalProfit = parseFloat($("#job_profit").value);
    const material = $("#job_material").value.trim();
    const dueStr = $("#job_due").value; // yyyy-mm-dd
    const notes = $("#job_notes").value.trim();

    if (!name || !(hours>0) || isNaN(originalProfit) || !dueStr) { toast("Enter name, hours>0, profit, due date"); return; }

    const dueISO = new Date(`${dueStr}T00:00:00`).toISOString();
    const span = computeJobSpan(dueISO, hours);
    const id = genId(name);

   cuttingJobs.push({
  id, name,
  estimateHours: hours,
  originalProfit: originalProfit,
  material, notes,
  dueISO: span.dueISO,
  startISO: span.startISO,
  materialCost: 0,
  materialQty: 0
});

    saveCloudDebounced(); toast("Job added"); route();
  });

  $$("#content [data-remove-job]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-remove-job");
      cuttingJobs = cuttingJobs.filter(j=>j.id!==id);
      saveCloudDebounced(); toast("Removed"); renderJobs();
    });
  });
  $$("#content [data-edit-job]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      openJobsEditor(btn.getAttribute("data-edit-job"));
    });
  });
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
