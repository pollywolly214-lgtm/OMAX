(function(){
  const SPOTLIGHT_PADDING = 16;
  const RESCROLL_DELAY = 360;
  const COST_TRAINER_STEPS = [
    {
      id: "primer",
      selector: "#costInfoCard",
      title: "Understand the cost model",
      description: "Launch the ℹ️ Cost model primer button anytime to reopen this panel. It maps the capture → allocation → review workflow and links to the deeper articles the tour references."
    },
    {
      id: "overview",
      selector: '[data-cost-window="overview"] .block',
      title: "Cost Overview",
      description: "These cards roll up the combined maintenance forecast (interval + as-required), net operating cost, and other KPIs using reconciled actuals. Missing inputs lower their confidence score until you backfill data."
    },
    {
      id: "chart",
      selector: '[data-cost-window="chart"] .block',
      title: "Cost & margin trends",
      description: "Use the toggles to compare maintenance, consumables, downtime, and cutting-job performance over time. It highlights how allocations and revenue shifts change profitability."
    },
    {
      id: "timeframes",
      selector: '[data-cost-window="timeframes"] .block',
      title: "Maintenance projections",
      description: "Rolling windows blend interval-task allocations with approved as-required orders. Actual = logged hours × interval pricing plus maintenance orders resolved in the window; Projected scales your hour baseline and 12-month order average so both scheduled and reactive spend are covered."
    },
    {
      id: "orders",
      selector: '[data-cost-window="orders"] .block',
      title: "Consumables & parts ledger",
      description: "Approved order requests feed burn-rate calibrations. Use this table to confirm every purchase is categorized and tied to the right cost driver."
    },
    {
      id: "history",
      selector: '[data-cost-window="history"] .block',
      title: "Hour log audit trail",
      description: "Recent meter entries show when usage spikes or dips. These timestamps drive interval allocation and explain shifts in cost per hour."
    },
    {
      id: "jobs",
      selector: '[data-cost-window="efficiency"] .block',
      title: "Cutting job profitability",
      description: "Every job compares quoted assumptions against actual revenue, labor, material, consumables, and overhead so you see true margin instead of heuristic gains/losses."
    }
  ];

  const state = {
    overlay: null,
    spotlight: null,
    titleEl: null,
    bodyEl: null,
    counterEl: null,
    nextBtn: null,
    prevBtn: null,
    skipBtn: null,
    steps: [],
    index: 0,
    active: false,
    currentTarget: null,
    boundResize: null,
    boundScroll: null,
    boundHash: null,
    scrollTimer: null,
    primerOpenedByTrainer: false
  };

  function ensureOverlay(){
    if (state.overlay) return;
    const overlay = document.createElement("div");
    overlay.id = "costTrainerOverlay";
    overlay.className = "trainer-overlay";
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="trainer-spotlight" aria-hidden="true"></div>
      <section class="trainer-panel" role="dialog" aria-modal="true" aria-labelledby="costTrainerTitle" aria-describedby="costTrainerBody">
        <div class="trainer-step-counter" id="costTrainerCounter"></div>
        <h3 class="trainer-title" id="costTrainerTitle"></h3>
        <p class="trainer-body" id="costTrainerBody"></p>
        <div class="trainer-actions">
          <button type="button" class="trainer-skip" id="costTrainerSkip">Skip tour</button>
          <div class="trainer-progress-buttons">
            <button type="button" class="trainer-prev" id="costTrainerPrev">Back</button>
            <button type="button" class="trainer-next" id="costTrainerNext">Next</button>
          </div>
        </div>
      </section>`;
    document.body.appendChild(overlay);

    state.overlay = overlay;
    state.spotlight = overlay.querySelector(".trainer-spotlight");
    state.titleEl = overlay.querySelector("#costTrainerTitle");
    state.bodyEl = overlay.querySelector("#costTrainerBody");
    state.counterEl = overlay.querySelector("#costTrainerCounter");
    state.nextBtn = overlay.querySelector("#costTrainerNext");
    state.prevBtn = overlay.querySelector("#costTrainerPrev");
    state.skipBtn = overlay.querySelector("#costTrainerSkip");

    state.nextBtn.addEventListener("click", (event)=>{
      event.preventDefault();
      advanceStep(1);
    });
    state.prevBtn.addEventListener("click", (event)=>{
      event.preventDefault();
      advanceStep(-1);
    });
    state.skipBtn.addEventListener("click", (event)=>{
      event.preventDefault();
      endTour();
    });
  }

  function gatherSteps(){
    return COST_TRAINER_STEPS.map(def => {
      const target = document.querySelector(def.selector);
      if (!target) return null;
      return { ...def, target };
    }).filter(Boolean);
  }

  function refreshSteps(preserveCurrent){
    const previous = preserveCurrent ? state.steps[state.index] : null;
    const steps = gatherSteps();
    if (!steps.length){
      state.steps = [];
      state.index = 0;
      state.currentTarget = null;
      return false;
    }
    let nextIndex = 0;
    if (previous){
      const matchIndex = steps.findIndex(step => step.id === previous.id);
      if (matchIndex >= 0){
        nextIndex = matchIndex;
      }else{
        nextIndex = Math.min(state.index, steps.length - 1);
      }
    }
    state.steps = steps;
    state.index = Math.min(Math.max(0, nextIndex), steps.length - 1);
    return true;
  }

  function startTour(){
    ensureOverlay();
    state.primerOpenedByTrainer = false;
    if (typeof openCostInfoPanel === "function"){
      try {
        state.primerOpenedByTrainer = !!openCostInfoPanel({ reason: "trainer" });
      } catch (_) {
        state.primerOpenedByTrainer = false;
      }
    }
    if (!refreshSteps(false)){
      if (typeof closeCostInfoPanel === "function" && state.primerOpenedByTrainer){
        try { closeCostInfoPanel({ reason: "trainer" }); }
        catch (_){ /* ignore */ }
      }
      state.primerOpenedByTrainer = false;
      if (typeof window.alert === "function"){
        window.alert("The guided tour is unavailable because the cost analysis layout is still loading.");
      }
      return;
    }
    state.active = true;
    state.overlay.hidden = false;
    state.overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("trainer-open");
    state.prevBtn.disabled = true;
    showCurrentStep();
    focusPrimaryControl();
    bindGlobalListeners();
  }

  function focusPrimaryControl(){
    if (!state.nextBtn) return;
    requestAnimationFrame(()=>{
      try { state.nextBtn.focus({ preventScroll: true }); }
      catch (_) { state.nextBtn.focus(); }
    });
  }

  function bindGlobalListeners(){
    if (!state.boundResize){
      state.boundResize = ()=> repositionSpotlight();
      window.addEventListener("resize", state.boundResize);
    }
    if (!state.boundScroll){
      state.boundScroll = ()=> repositionSpotlight(false);
      window.addEventListener("scroll", state.boundScroll, true);
    }
    if (!state.boundHash){
      state.boundHash = ()=> endTour();
      window.addEventListener("hashchange", state.boundHash);
    }
  }

  function unbindGlobalListeners(){
    if (state.boundResize){
      window.removeEventListener("resize", state.boundResize);
      state.boundResize = null;
    }
    if (state.boundScroll){
      window.removeEventListener("scroll", state.boundScroll, true);
      state.boundScroll = null;
    }
    if (state.boundHash){
      window.removeEventListener("hashchange", state.boundHash);
      state.boundHash = null;
    }
  }

  function advanceStep(delta){
    if (!state.active) return;
    const next = state.index + delta;
    if (next < 0){
      return;
    }
    if (next >= state.steps.length){
      endTour();
      return;
    }
    state.index = next;
    showCurrentStep();
  }

  function endTour(){
    if (!state.overlay) return;
    if (state.scrollTimer){
      clearTimeout(state.scrollTimer);
      state.scrollTimer = null;
    }
    state.active = false;
    state.overlay.hidden = true;
    state.overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("trainer-open");
    state.currentTarget = null;
    if (state.primerOpenedByTrainer && typeof closeCostInfoPanel === "function"){
      try { closeCostInfoPanel({ reason: "trainer" }); }
      catch (_){ /* ignore */ }
    }
    state.primerOpenedByTrainer = false;
    unbindGlobalListeners();
  }

  function showCurrentStep(){
    if (!state.steps.length){
      endTour();
      return;
    }
    const step = state.steps[state.index];
    if (!step){
      endTour();
      return;
    }
    if (state.primerOpenedByTrainer && step.id !== "primer"){
      const panel = document.getElementById("costInfoPanel");
      let closedByCall = false;
      if (typeof closeCostInfoPanel === "function"){
        try {
          closedByCall = !!closeCostInfoPanel({ reason: "trainer" });
        } catch (_){ /* ignore */ }
      }
      if (closedByCall || !panel || panel.hasAttribute("hidden") || !panel.classList.contains("is-visible")){
        state.primerOpenedByTrainer = false;
      }
    }
    state.counterEl.textContent = `Step ${state.index + 1} of ${state.steps.length}`;
    state.titleEl.textContent = step.title;
    state.bodyEl.textContent = step.description;
    state.nextBtn.textContent = state.index === state.steps.length - 1 ? "Finish" : "Next";
    state.prevBtn.disabled = state.index === 0;
    moveSpotlight(step.target);
  }

  function moveSpotlight(target){
    if (!target || !state.spotlight) return;
    state.currentTarget = target;
    if (typeof target.scrollIntoView === "function"){
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
    positionSpotlight(target);
    if (state.scrollTimer){
      clearTimeout(state.scrollTimer);
    }
    state.scrollTimer = setTimeout(()=> positionSpotlight(target), RESCROLL_DELAY);
  }

  function positionSpotlight(target){
    if (!target || !state.spotlight) return;
    const rect = target.getBoundingClientRect();
    const pad = SPOTLIGHT_PADDING;
    const top = Math.max(8, rect.top - pad);
    const left = Math.max(8, rect.left - pad);
    const width = Math.max(0, rect.width + pad * 2);
    const height = Math.max(0, rect.height + pad * 2);
    state.spotlight.style.width = `${Math.round(width)}px`;
    state.spotlight.style.height = `${Math.round(height)}px`;
    state.spotlight.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    const radius = Math.max(12, Math.min(32, Math.round(Math.min(width, height) / 6)));
    state.spotlight.style.borderRadius = `${radius}px`;
  }

  function repositionSpotlight(refreshTargets = true){
    if (!state.active) return;
    if (refreshTargets){
      const hadSteps = refreshSteps(true);
      if (!hadSteps){
        endTour();
        return;
      }
    }
    const step = state.steps[state.index];
    if (!step){
      endTour();
      return;
    }
    positionSpotlight(step.target);
  }

  function setupCostTrainer(){
    ensureOverlay();
    const launchBtn = document.getElementById("costTrainerLaunch");
    if (launchBtn && !launchBtn.dataset.boundTrainer){
      launchBtn.dataset.boundTrainer = "1";
      launchBtn.addEventListener("click", (event)=>{
        event.preventDefault();
        if (typeof closeCostSettingsMenu === "function"){
          try { closeCostSettingsMenu(); } catch (_){}
        }else{
          const menu = document.getElementById("costSettingsMenu");
          const toggle = document.getElementById("costSettingsToggle");
          if (menu){ menu.hidden = true; }
          if (toggle){
            toggle.setAttribute("aria-expanded", "false");
            toggle.classList.remove("is-open");
          }
        }
        startTour();
      });
    }
  }

  function refreshCostTrainer(){
    if (!state.overlay) return;
    const hadSteps = refreshSteps(true);
    if (!hadSteps){
      if (state.active){
        endTour();
      }
      return;
    }
    if (state.active){
      showCurrentStep();
    }
  }

  window.setupCostTrainer = setupCostTrainer;
  window.refreshCostTrainer = refreshCostTrainer;
})();
