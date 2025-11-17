/* ========================= ROUTER ========================= */
function nav(){
  return `<div class="topnav">
    <button data-go="#/">Dashboard</button>
    <button data-go="#/settings">Settings</button>
    <button data-go="#/jobs">Jobs</button>
    <button data-go="#/costs">Costs</button>
    <button data-go="#/inventory">Inventory</button>
    <button data-go="#/order-request">Order Request</button>
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
    if (raw === "#order-request" || raw === "#/order-request") return "#/order-request";
    if (raw === "#deleted" || raw === "#/deleted") return "#/deleted";
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
    if (typeof teardownCostChartAutoResize === "function"){
      try { teardownCostChartAutoResize(); }
      catch (err){ console.warn(err); }
    }
    if (norm === "#/settings")      { renderSettings();   return; }
    if (norm === "#/jobs")          { renderJobs();       return; }
    if (norm === "#/costs")         { renderCosts();      return; }
    if (norm === "#/inventory")     { renderInventory();  return; }
    if (norm === "#/order-request") { renderOrderRequest(); return; }
    if (norm === "#/deleted")      { renderDeletedItems(); return; }
    /* default */                     renderDashboard();
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("load", ()=>{
  try { localStorage.removeItem("_omax_last_render_cache"); } catch (e) {}
  initFirebase();
  route();
});
