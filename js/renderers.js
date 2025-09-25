/* ====================== RENDERERS ========================= */
if (!Array.isArray(window.pendingNewJobFiles)) window.pendingNewJobFiles = [];
const pendingNewJobFiles = window.pendingNewJobFiles;
if (!(window.orderPartialSelection instanceof Set)) window.orderPartialSelection = new Set();
const orderPartialSelection = window.orderPartialSelection;

function editingCompletedJobsSet(){
  if (typeof getEditingCompletedJobsSet === "function"){
    return getEditingCompletedJobsSet();
  }
  if (!(window.editingCompletedJobs instanceof Set)){
    window.editingCompletedJobs = new Set();
  }
  return window.editingCompletedJobs;
}

function readFileAsDataUrl(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(reader.result);
    reader.onerror = ()=> reject(reader.error || new Error("Failed to read file"));
    try {
      reader.readAsDataURL(file);
    } catch (err){
      reject(err);
    }
  });
}

async function filesToAttachments(fileList){
  const files = Array.from(fileList || []);
  const attachments = [];
  for (const file of files){
    try {
      const dataUrl = await readFileAsDataUrl(file);
      attachments.push({
        id: genId(file.name || "job_file"),
        name: file.name || "Attachment",
        type: file.type || "",
        size: typeof file.size === "number" ? file.size : null,
        dataUrl,
        addedAt: new Date().toISOString()
      });
    } catch (err){
      console.error("Unable to read file", err);
      toast("Failed to read one of the files.");
    }
  }
  return attachments;
}

function buildNextDuePreview({ includeNote = true, noteText = "Preview of tracked tasks — log machine hours to replace this with your live schedule." } = {}){
  const escapeHtml = (str)=> String(str || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const previewOffsets = [2, 6, 11, 19];
  const previewSource = (Array.isArray(window.defaultIntervalTasks) && window.defaultIntervalTasks.length)
    ? window.defaultIntervalTasks.slice(0, previewOffsets.length)
    : [
        { name: "Nozzle filter & inlet O-ring" },
        { name: "Mixing tube rotation" },
        { name: "Drain hopper regulator water bowl" },
        { name: "Lubricate Z-axis rail shafts & lead screw" }
      ];
  const today = new Date(); today.setHours(0,0,0,0);
  const formatDate = (date)=> date.toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" });
  const offsetForIndex = (idx)=>{
    if (!previewOffsets.length) return 0;
    return previewOffsets[idx] ?? previewOffsets[previewOffsets.length - 1];
  };
  const formatDueLine = (offset, dueText)=>{
    if (offset <= 0) return `Due today · ${dueText}`;
    if (offset === 1) return `Due tomorrow · ${dueText}`;
    return `Due in ${offset} days · ${dueText}`;
  };
  const formatRemain = (offset)=>{
    const hours = Math.max(0, Math.round((typeof DAILY_HOURS === "number" ? DAILY_HOURS : 8) * offset));
    return `${hours.toLocaleString()} hrs estimate`;
  };
  const statusClass = (offset)=>{
    if (offset <= 0) return "is-due-now";
    if (offset <= 3) return "is-due-soon";
    return "is-due-later";
  };

  const featured = previewSource[0];
  const featuredOffset = offsetForIndex(0);
  const featuredDue = new Date(today); featuredDue.setDate(featuredDue.getDate() + featuredOffset);
  const featuredMeta = `
    <span class="next-due-meta-line">${escapeHtml(formatDueLine(featuredOffset, formatDate(featuredDue)))}</span>
    <span class="next-due-meta-line next-due-meta-hours">${escapeHtml(formatRemain(featuredOffset))}</span>
  `.trim();
  const featuredCountdown = featuredOffset <= 0 ? "Due" : Math.max(0, featuredOffset).toLocaleString();
  const featuredCountdownLabel = featuredOffset <= 0 ? "today" : (featuredOffset === 1 ? "day left" : "days left");
  const featuredHtml = `
    <div class="next-due-task next-due-featured next-due-task-preview ${statusClass(featuredOffset)}" aria-hidden="true">
      <span class="next-due-featured-copy">
        <span class="next-due-eyebrow">Preview</span>
        <span class="next-due-name">${escapeHtml(featured?.name || "Task setup pending")}</span>
        <span class="next-due-meta">${featuredMeta}</span>
      </span>
      <span class="next-due-countdown" aria-hidden="true">
        <span class="next-due-count">${escapeHtml(featuredCountdown)}</span>
        <span class="next-due-count-label">${escapeHtml(featuredCountdownLabel)}</span>
      </span>
    </div>
  `;

  const rest = previewSource.slice(1);
  const restHtml = rest.map((task, idx) => {
    const offset = offsetForIndex(idx + 1);
    const due = new Date(today); due.setDate(due.getDate() + offset);
    const metaHtml = `
      <span class="next-due-meta-line">${escapeHtml(formatDueLine(offset, formatDate(due)))}</span>
      <span class="next-due-meta-line next-due-meta-hours">${escapeHtml(formatRemain(offset))}</span>
    `.trim();
    return `<li>
      <div class="next-due-task next-due-task-preview ${statusClass(offset)}" aria-hidden="true">
        <span class="next-due-name">${escapeHtml(task?.name || "Task setup pending")}</span>
        <span class="next-due-meta">${metaHtml}</span>
      </div>
    </li>`;
  }).join("");

  const note = includeNote ? `<p class="next-due-preview-note">${escapeHtml(noteText)}</p>` : "";
  const restSection = rest.length
    ? `<div class="next-due-subtitle" aria-hidden="true">Upcoming sample</div><ul class="next-due-list" aria-hidden="true">${restHtml}</ul>`
    : "";

  return `
    <div class="next-due-window next-due-window-preview">
      ${note}
      ${featuredHtml}
      ${restSection}
    </div>
  `.trim();
}

const DASHBOARD_LAYOUT_STORAGE_KEY = "dashboard_layout_windows_v1";
const DASHBOARD_WINDOW_MIN_WIDTH   = 240;
const DASHBOARD_WINDOW_MIN_HEIGHT  = 160;

const COST_LAYOUT_STORAGE_KEY = "cost_layout_windows_v1";
const COST_WINDOW_MIN_WIDTH   = 240;
const COST_WINDOW_MIN_HEIGHT  = 160;

function dashboardLayoutStorage(){
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch (err){
    console.warn("localStorage unavailable", err);
  }
  return null;
}

function loadDashboardLayoutFromStorage(){
  const storage = dashboardLayoutStorage();
  if (!storage) return { layout:{}, stored:false };
  try {
    const raw = storage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY);
    if (!raw) return { layout:{}, stored:false };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return { layout: parsed, stored: true };
  } catch (err){
    console.warn("Unable to load dashboard layout", err);
  }
  return { layout:{}, stored:false };
}

function getDashboardLayoutState(){
  if (!window.dashboardLayoutState){
    const loaded = loadDashboardLayoutFromStorage();
    window.dashboardLayoutState = {
      layoutById: loaded.layout,
      layoutStored: !!loaded.stored,
      editing: false,
      zCounter: 50,
      root: null,
      windows: [],
      editButton: null,
      settingsButton: null,
      settingsMenu: null,
      hintEl: null,
      boundResize: false
    };
  }
  return window.dashboardLayoutState;
}

function hasSavedDashboardLayout(state){
  return !!(state && state.layoutStored);
}

function persistDashboardLayout(state){
  if (!state) return;
  const storage = dashboardLayoutStorage();
  if (!storage) return;
  try {
    if (state.layoutById && Object.keys(state.layoutById).length){
      storage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, JSON.stringify(state.layoutById));
      state.layoutStored = true;
    }else{
      storage.removeItem(DASHBOARD_LAYOUT_STORAGE_KEY);
      state.layoutStored = false;
    }
  } catch (err){
    console.warn("Unable to persist dashboard layout", err);
  }
}

function captureDashboardWindowRect(win, rootRect){
  if (!win || !rootRect) return null;
  const rect = win.getBoundingClientRect();
  const width = Math.max(DASHBOARD_WINDOW_MIN_WIDTH, Math.round(rect.width) || DASHBOARD_WINDOW_MIN_WIDTH);
  const height = Math.max(DASHBOARD_WINDOW_MIN_HEIGHT, Math.round(rect.height) || DASHBOARD_WINDOW_MIN_HEIGHT);
  return {
    x: Math.round(rect.left - rootRect.left),
    y: Math.round(rect.top - rootRect.top),
    width,
    height
  };
}

function dashboardLayoutMaxBottom(layout){
  let maxBottom = 0;
  if (layout){
    Object.values(layout).forEach(box => {
      if (!box) return;
      const bottom = Number(box.y || 0) + Number(box.height || 0);
      if (isFinite(bottom)) maxBottom = Math.max(maxBottom, bottom);
    });
  }
  return maxBottom;
}

function syncDashboardLayoutEntries(state){
  if (!state.root) return;
  if (!state.layoutById || typeof state.layoutById !== "object") state.layoutById = {};
  const layout = state.layoutById;
  const rootRect = state.root.getBoundingClientRect();
  const useExisting = state.root.classList.contains("has-custom-layout") && Object.keys(layout).length;
  const seen = new Set();
  state.windows.forEach(win => {
    if (!win || !win.dataset) return;
    const id = String(win.dataset.dashboardWindow || "");
    if (!id) return;
    seen.add(id);
    if (!layout[id]){
      if (useExisting){
        const fallbackWidth = Math.max(DASHBOARD_WINDOW_MIN_WIDTH, Math.round(win.offsetWidth) || DASHBOARD_WINDOW_MIN_WIDTH);
        const fallbackHeight = Math.max(DASHBOARD_WINDOW_MIN_HEIGHT, Math.round(win.offsetHeight) || DASHBOARD_WINDOW_MIN_HEIGHT);
        const offsetY = dashboardLayoutMaxBottom(layout) + 24;
        layout[id] = { x: 0, y: offsetY, width: fallbackWidth, height: fallbackHeight };
      }else{
        layout[id] = captureDashboardWindowRect(win, rootRect);
      }
    }
  });
  Object.keys(layout).forEach(id => { if (!seen.has(id)) delete layout[id]; });
}

function dispatchLayoutWindowResize(area, id, win, box){
  if (!id || !win || !box) return;
  const detail = {
    area,
    id,
    width: Number(box.width) || 0,
    height: Number(box.height) || 0,
    element: win
  };
  try {
    window.dispatchEvent(new CustomEvent("layoutWindowResized", { detail }));
  } catch (err){
    console.warn("Unable to dispatch layoutWindowResized", err);
  }
}

function setDashboardWindowStyle(win, box){
  if (!win || !box) return;
  win.style.left = `${box.x}px`;
  win.style.top = `${box.y}px`;
  win.style.width = `${box.width}px`;
  win.style.height = `${box.height}px`;
}

function updateDashboardRootSize(state){
  if (!state.root) return;
  if (!state.root.classList.contains("has-custom-layout")){
    state.root.style.minHeight = "";
    state.root.style.paddingBottom = "";
    return;
  }
  const maxBottom = dashboardLayoutMaxBottom(state.layoutById);
  const extra = state.editing ? 160 : 60;
  state.root.style.minHeight = `${Math.max(0, Math.ceil(maxBottom + extra))}px`;
  state.root.style.paddingBottom = state.editing ? "120px" : "48px";
}

function applyDashboardLayout(state){
  if (!state.root) return;
  if (!state.root.classList.contains("has-custom-layout")){
    state.windows.forEach(win => {
      if (!win) return;
      win.style.left = "";
      win.style.top = "";
      win.style.width = "";
      win.style.height = "";
    });
    updateDashboardRootSize(state);
    return;
  }
  state.windows.forEach(win => {
    if (!win || !win.dataset) return;
    const id = String(win.dataset.dashboardWindow || "");
    const box = state.layoutById[id];
    if (box){ setDashboardWindowStyle(win, box); }
  });
  updateDashboardRootSize(state);
}

function updateDashboardEditUi(state){
  if (state.editButton){
    const label = state.editing ? "Done editing dashboard" : "Edit dashboard layout";
    state.editButton.textContent = label;
    const pressed = state.editing ? "true" : "false";
    state.editButton.setAttribute("aria-pressed", pressed);
    state.editButton.setAttribute("aria-checked", pressed);
  }
  if (state.hintEl){
    state.hintEl.hidden = !state.editing;
  }
  if (state.settingsButton){
    state.settingsButton.classList.toggle("is-active", !!state.editing);
  }
}

function bringDashboardWindowToFront(state, win){
  if (!state) return;
  state.zCounter = (state.zCounter || 50) + 1;
  if (win) win.style.zIndex = String(state.zCounter);
}

function removeDashboardWindowElevation(win){
  if (win) win.style.zIndex = "";
}

function addDashboardWindowHandles(state){
  state.windows.forEach(win => {
    if (!win) return;
    const id = String(win.dataset.dashboardWindow || "");
    if (!id) return;
    if (!win.querySelector(":scope > .dashboard-drag-handle")){
      const handle = document.createElement("div");
      handle.className = "dashboard-drag-handle";
      handle.title = "Drag to move";
      handle.innerHTML = "<span>Drag</span>";
      handle.setAttribute("aria-hidden", "true");
      handle.addEventListener("pointerdown", (event)=> startDashboardWindowDrag(state, win, event));
      win.appendChild(handle);
    }
    const resizeTypes = ["n","s","e","w","ne","nw","se","sw"];
    resizeTypes.forEach(type => {
      if (win.querySelector(`:scope > .dashboard-resize-${type}`)) return;
      const handle = document.createElement("div");
      handle.className = `dashboard-resize-handle dashboard-resize-${type}`;
      handle.dataset.resize = type;
      handle.title = "Drag to resize";
      handle.setAttribute("aria-hidden", "true");
      handle.addEventListener("pointerdown", (event)=> startDashboardWindowResize(state, win, type, event));
      win.appendChild(handle);
    });
  });
}

function removeDashboardWindowHandles(state){
  state.windows.forEach(win => {
    if (!win) return;
    win.querySelectorAll(":scope > .dashboard-drag-handle, :scope > .dashboard-resize-handle").forEach(el => el.remove());
    removeDashboardWindowElevation(win);
  });
}

function clampDashboardX(state, desiredX, width){
  if (!state.root) return desiredX;
  const rootWidth = state.root.clientWidth || state.root.getBoundingClientRect().width || width;
  if (!isFinite(rootWidth) || rootWidth <= 0) return Math.max(0, desiredX);
  const maxX = Math.max(0, rootWidth - width);
  return Math.min(Math.max(0, desiredX), maxX);
}

function startDashboardWindowDrag(state, win, event){
  if (!state || !win || !state.root) return;
  const id = String(win.dataset.dashboardWindow || "");
  if (!id) return;
  const box = state.layoutById[id];
  if (!box) return;
  if (event.button !== 0 && event.pointerType !== "touch") return;
  event.preventDefault();
  bringDashboardWindowToFront(state, win);
  const startX = event.clientX;
  const startY = event.clientY;
  const baseX = box.x;
  const baseY = box.y;
  const pointerId = event.pointerId;
  const move = (ev)=>{
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    const nextX = clampDashboardX(state, baseX + dx, box.width);
    const nextY = Math.max(0, baseY + dy);
    box.x = Math.round(nextX);
    box.y = Math.round(nextY);
    setDashboardWindowStyle(win, box);
    updateDashboardRootSize(state);
  };
  const stop = ()=>{
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    win.releasePointerCapture?.(pointerId);
    persistDashboardLayout(state);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
  window.addEventListener("pointercancel", stop);
  win.setPointerCapture?.(pointerId);
}

function startDashboardWindowResize(state, win, direction, event){
  if (!state || !win || !state.root) return;
  const id = String(win.dataset.dashboardWindow || "");
  if (!id) return;
  const box = state.layoutById[id];
  if (!box) return;
  if (event.button !== 0 && event.pointerType !== "touch") return;
  event.preventDefault();
  bringDashboardWindowToFront(state, win);
  const startX = event.clientX;
  const startY = event.clientY;
  const startBox = { x: box.x, y: box.y, width: box.width, height: box.height };
  const pointerId = event.pointerId;
  const resize = (ev)=>{
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    let nextX = startBox.x;
    let nextY = startBox.y;
    let nextWidth = startBox.width;
    let nextHeight = startBox.height;
    if (direction.includes("e")){
      nextWidth = Math.max(DASHBOARD_WINDOW_MIN_WIDTH, startBox.width + dx);
      const maxWidth = (state.root.clientWidth || state.root.getBoundingClientRect().width || nextWidth) - startBox.x;
      if (isFinite(maxWidth) && maxWidth > 0) nextWidth = Math.min(nextWidth, maxWidth);
    }
    if (direction.includes("s")){
      nextHeight = Math.max(DASHBOARD_WINDOW_MIN_HEIGHT, startBox.height + dy);
    }
    if (direction.includes("w")){
      const desiredX = startBox.x + dx;
      const maxX = startBox.x + startBox.width - DASHBOARD_WINDOW_MIN_WIDTH;
      nextX = Math.max(0, Math.min(desiredX, maxX));
      nextWidth = Math.max(DASHBOARD_WINDOW_MIN_WIDTH, startBox.width + (startBox.x - nextX));
    }
    if (direction.includes("n")){
      const desiredY = startBox.y + dy;
      const maxY = startBox.y + startBox.height - DASHBOARD_WINDOW_MIN_HEIGHT;
      nextY = Math.max(0, Math.min(desiredY, maxY));
      nextHeight = Math.max(DASHBOARD_WINDOW_MIN_HEIGHT, startBox.height + (startBox.y - nextY));
    }
    nextX = clampDashboardX(state, nextX, nextWidth);
    if (nextHeight < DASHBOARD_WINDOW_MIN_HEIGHT) nextHeight = DASHBOARD_WINDOW_MIN_HEIGHT;
    box.x = Math.round(nextX);
    box.y = Math.round(nextY);
    box.width = Math.round(nextWidth);
    box.height = Math.round(nextHeight);
    setDashboardWindowStyle(win, box);
    updateDashboardRootSize(state);
    dispatchLayoutWindowResize("dashboard", id, win, box);
  };
  const stop = ()=>{
    window.removeEventListener("pointermove", resize);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    win.releasePointerCapture?.(pointerId);
    persistDashboardLayout(state);
    dispatchLayoutWindowResize("dashboard", id, win, box);
  };
  window.addEventListener("pointermove", resize);
  window.addEventListener("pointerup", stop);
  window.addEventListener("pointercancel", stop);
  win.setPointerCapture?.(pointerId);
}

function ensureDashboardLayoutBoundResize(state){
  if (state.boundResize) return;
  state.boundResize = true;
  window.addEventListener("resize", ()=>{
    const curState = getDashboardLayoutState();
    if (!curState.root || !curState.root.classList.contains("has-custom-layout")) return;
    const rootWidth = curState.root.clientWidth || curState.root.getBoundingClientRect().width;
    let changed = false;
    Object.entries(curState.layoutById || {}).forEach(([id, box]) => {
      if (!box) return;
      const maxX = Math.max(0, (rootWidth || box.width) - box.width);
      if (box.x > maxX){ box.x = Math.max(0, Math.round(maxX)); changed = true; }
    });
    if (changed){
      applyDashboardLayout(curState);
      persistDashboardLayout(curState);
    }
  });
}

const appSettingsState = {
  context: "default",
  cleanup: null,
  reposition: null,
  activeMenu: null,
  activeButton: null
};

function getAppSettingsElements(){
  const wrap = document.getElementById("dashboardSettings") || null;
  const button = document.getElementById("dashboardSettingsToggle") || null;
  const menu = document.getElementById("dashboardSettingsMenu") || null;
  return { wrap, button, menu };
}

function findAppSettingsFocusTarget(menu){
  if (!menu) return null;
  const candidates = Array.from(menu.querySelectorAll('[data-settings-focus], button, [href], [tabindex]:not([tabindex="-1"])'));
  for (const el of candidates){
    if (!el) continue;
    if (el.closest('[hidden]')) continue;
    if (typeof el.disabled !== "undefined" && el.disabled) continue;
    if (typeof el.focus !== "function") continue;
    const rects = el.getClientRects?.();
    if (Array.isArray(rects) && rects.length === 0) continue;
    if (rects && rects.length === 0) continue;
    if (rects && rects.length && rects[0].width === 0 && rects[0].height === 0) continue;
    if (el.offsetParent === null && window.getComputedStyle(el).position !== "fixed") continue;
    return el;
  }
  return null;
}

function resetAppSettingsMenuPosition(menu){
  if (!menu) return;
  menu.style.position = "";
  menu.style.left = "";
  menu.style.top = "";
  menu.style.maxHeight = "";
  menu.style.width = "";
  menu.style.overflowY = "";
  menu.style.visibility = "";
}

function positionAppSettingsMenu(menu, button){
  if (!menu || !button) return;
  const docEl = document.documentElement || document.body;
  const viewportWidth = Math.max(0, docEl ? docEl.clientWidth : window.innerWidth || 0);
  const viewportHeight = Math.max(0, docEl ? docEl.clientHeight : window.innerHeight || 0);
  const viewportPadding = 12;
  const anchorGap = 8;
  const buttonRect = button.getBoundingClientRect();

  menu.style.visibility = "hidden";
  menu.style.position = "fixed";
  menu.style.left = "0px";
  menu.style.top = "0px";
  menu.style.maxHeight = "";
  menu.style.width = "";
  menu.style.overflowY = "";

  let menuRect = menu.getBoundingClientRect();
  const maxWidth = Math.max(180, viewportWidth - viewportPadding * 2);
  if (menuRect.width > maxWidth){
    menu.style.width = `${Math.round(maxWidth)}px`;
    menuRect = menu.getBoundingClientRect();
  }

  const maxHeight = Math.max(220, viewportHeight - viewportPadding * 2);
  menu.style.maxHeight = `${Math.round(maxHeight)}px`;
  if (menuRect.height > maxHeight){
    menu.style.overflowY = "auto";
    menuRect = menu.getBoundingClientRect();
  }

  let left = buttonRect.right - menuRect.width;
  if (left + menuRect.width + viewportPadding > viewportWidth){
    left = viewportWidth - menuRect.width - viewportPadding;
  }
  if (left < viewportPadding){
    left = viewportPadding;
  }

  let top = buttonRect.bottom + anchorGap;
  if (top + menuRect.height + viewportPadding > viewportHeight){
    const above = buttonRect.top - anchorGap - menuRect.height;
    if (above >= viewportPadding){
      top = above;
    } else {
      top = Math.max(viewportPadding, viewportHeight - menuRect.height - viewportPadding);
    }
  }
  if (top < viewportPadding){
    top = viewportPadding;
  }

  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
  menu.style.visibility = "";
}

async function promptClearAllData(trigger){
  const handler = typeof window.clearAllAppData === "function" ? window.clearAllAppData : null;
  if (!handler){
    alert("Clearing data is not available right now.");
    return;
  }
  const expected = (typeof window.CLEAR_DATA_PASSWORD === "string" && window.CLEAR_DATA_PASSWORD)
    ? window.CLEAR_DATA_PASSWORD
    : "";
  const attempt = prompt("Enter the admin password to clear all data:");
  if (attempt === null) return;
  if (attempt !== expected){
    alert("Incorrect password. Data was not cleared.");
    return;
  }
  const confirmed = await showConfirmModal({
    title: "Clear all data?",
    message: "This will erase history, maintenance tasks, jobs, inventory, and orders for every user. This cannot be undone.",
    confirmText: "Yes, clear everything",
    confirmVariant: "danger",
    cancelText: "Keep data"
  });
  if (!confirmed) return;

  let restoreText = null;
  const wasDisabled = trigger?.disabled ?? false;
  if (trigger){
    restoreText = trigger.textContent;
    trigger.disabled = true;
    trigger.textContent = "Clearing…";
  }
  try {
    await handler();
    toast("Workspace reset to defaults.");
  } catch (err){
    console.error("Failed to clear all data", err);
    alert("Unable to clear data. Please try again.");
  } finally {
    if (trigger && trigger.isConnected){
      trigger.disabled = wasDisabled;
      if (restoreText != null){
        trigger.textContent = restoreText;
      }
    }
  }
}

function ensureClearAllDataHandlers(){
  const buttons = document.querySelectorAll('[data-clear-all]');
  buttons.forEach(btn => {
    if (!btn || btn.dataset.boundClearAll === "1") return;
    btn.dataset.boundClearAll = "1";
    btn.addEventListener("click", async (event)=>{
      event.preventDefault();
      closeDashboardSettingsMenu();
      await promptClearAllData(btn);
    });
  });
}

function closeDashboardSettingsMenu(){
  const { button, menu } = getAppSettingsElements();
  if (menu && !menu.hidden){
    menu.hidden = true;
  }
  if (button){
    button.setAttribute("aria-expanded", "false");
    button.classList.remove("is-open");
  }
  if (appSettingsState.reposition){
    window.removeEventListener("resize", appSettingsState.reposition);
    window.removeEventListener("scroll", appSettingsState.reposition, true);
    appSettingsState.reposition = null;
  }
  resetAppSettingsMenuPosition(menu);
  appSettingsState.activeMenu = null;
  appSettingsState.activeButton = null;
}

function openDashboardSettingsMenu(){
  const { button, menu } = getAppSettingsElements();
  if (!button || !menu) return;
  if (!menu.hidden) return;
  menu.hidden = false;
  button.setAttribute("aria-expanded", "true");
  button.classList.add("is-open");
  const reposition = ()=>{
    if (!button.isConnected || !menu.isConnected){
      closeDashboardSettingsMenu();
      return;
    }
    positionAppSettingsMenu(menu, button);
  };

  positionAppSettingsMenu(menu, button);
  requestAnimationFrame(()=> positionAppSettingsMenu(menu, button));
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);
  appSettingsState.reposition = reposition;
  appSettingsState.activeMenu = menu;
  appSettingsState.activeButton = button;
  const focusTarget = findAppSettingsFocusTarget(menu);
  if (focusTarget){
    try { focusTarget.focus(); }
    catch (_){ /* ignore */ }
  }
}

function wireDashboardSettingsMenu(){
  const { button, menu, wrap } = getAppSettingsElements();
  if (!button || !menu || !wrap) return;
  if (typeof appSettingsState.cleanup === "function"){
    appSettingsState.cleanup();
    appSettingsState.cleanup = null;
  }
  menu.hidden = true;
  resetAppSettingsMenuPosition(menu);
  button.setAttribute("aria-expanded", "false");
  button.classList.remove("is-open");
  const toggle = (event)=>{
    event.preventDefault();
    const expanded = button.getAttribute("aria-expanded") === "true";
    if (expanded){ closeDashboardSettingsMenu(); }
    else { openDashboardSettingsMenu(); }
  };
  if (!button.dataset.boundAppSettings){
    button.dataset.boundAppSettings = "1";
    button.addEventListener("click", toggle);
    button.addEventListener("keydown", (event)=>{
      if ((event.key === "Enter" || event.key === " ") && menu.hidden){
        event.preventDefault();
        openDashboardSettingsMenu();
      }else if (event.key === "Escape" && !menu.hidden){
        closeDashboardSettingsMenu();
      }
    });
  }
  const handleDocumentClick = (event)=>{
    if (!wrap.contains(event.target)) closeDashboardSettingsMenu();
  };
  const handleDocumentKey = (event)=>{
    if (event.key === "Escape" && !menu.hidden){
      closeDashboardSettingsMenu();
      button?.focus();
    }
  };
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleDocumentKey);
  appSettingsState.cleanup = ()=>{
    document.removeEventListener("click", handleDocumentClick);
    document.removeEventListener("keydown", handleDocumentKey);
  };
  if (!menu.dataset.boundAppSettings){
    menu.dataset.boundAppSettings = "1";
    menu.addEventListener("keydown", (event)=>{
      if (event.key === "Escape"){ closeDashboardSettingsMenu(); button?.focus(); }
    });
  }
  ensureClearAllDataHandlers();
}

function wireCostSettingsMenu(){
  wireDashboardSettingsMenu();
}

function closeCostSettingsMenu(){
  closeDashboardSettingsMenu();
}

function openCostSettingsMenu(){
  openDashboardSettingsMenu();
}

function setAppSettingsContext(context){
  appSettingsState.context = context || "default";
  const { menu } = getAppSettingsElements();
  if (!menu) return;
  const sections = Array.from(menu.querySelectorAll("[data-app-settings-context]"));
  sections.forEach(section => {
    const attr = section.getAttribute("data-app-settings-context") || "";
    const contexts = attr.split(",").map(s => s.trim()).filter(Boolean);
    const show = contexts.length === 0 || contexts.includes(appSettingsState.context);
    if (show) section.removeAttribute("hidden");
    else section.setAttribute("hidden", "");
  });
  const divider = menu.querySelector(".dashboard-settings-separator");
  if (divider){
    const hasVisibleSection = sections.some(section => !section.hasAttribute("hidden"));
    if (hasVisibleSection) divider.removeAttribute("hidden");
    else divider.setAttribute("hidden", "");
  }
  closeDashboardSettingsMenu();
}

function setDashboardEditing(state, editing){
  state.editing = !!editing;
  if (!state.root) return;
  if (editing){
    if (!state.root.classList.contains("has-custom-layout")){
      state.root.classList.add("has-custom-layout");
      syncDashboardLayoutEntries(state);
    }
    addDashboardWindowHandles(state);
    state.root.classList.add("is-editing");
  }else{
    state.root.classList.remove("is-editing");
    removeDashboardWindowHandles(state);
  }
  applyDashboardLayout(state);
  updateDashboardEditUi(state);
  closeDashboardSettingsMenu();
  if (!editing) persistDashboardLayout(state);
}

function toggleDashboardEditing(){
  const state = getDashboardLayoutState();
  setDashboardEditing(state, !state.editing);
}

function setupDashboardLayout(){
  const state = getDashboardLayoutState();
  state.root = document.getElementById("dashboardLayout") || null;
  state.editButton = document.getElementById("dashboardEditToggle") || null;
  state.settingsButton = document.getElementById("dashboardSettingsToggle") || null;
  state.settingsMenu = document.getElementById("dashboardSettingsMenu") || null;
  state.hintEl = document.getElementById("dashboardEditHint") || null;
  state.windows = state.root ? Array.from(state.root.querySelectorAll("[data-dashboard-window]")) : [];
  if (!state.root){
    updateDashboardEditUi(state);
    return;
  }
  ensureDashboardLayoutBoundResize(state);
  if (hasSavedDashboardLayout(state)){
    state.root.classList.add("has-custom-layout");
  }
  syncDashboardLayoutEntries(state);
  applyDashboardLayout(state);
  updateDashboardEditUi(state);
  if (state.editing){
    addDashboardWindowHandles(state);
    state.root.classList.add("is-editing");
  }
  if (state.editButton && !state.editButton.dataset.bound){
    state.editButton.dataset.bound = "1";
    state.editButton.addEventListener("click", ()=>{
      toggleDashboardEditing();
      closeDashboardSettingsMenu();
    });
  }
}

function notifyDashboardLayoutContentChanged(){
  const state = getDashboardLayoutState();
  if (!state.root || !state.root.classList.contains("has-custom-layout")) return;
  requestAnimationFrame(()=>{
    applyDashboardLayout(state);
  });
}

function costLayoutStorage(){
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch (err){
    console.warn("localStorage unavailable", err);
  }
  return null;
}

function loadCostLayoutFromStorage(){
  const storage = costLayoutStorage();
  if (!storage) return { layout:{}, stored:false };
  try {
    const raw = storage.getItem(COST_LAYOUT_STORAGE_KEY);
    if (!raw) return { layout:{}, stored:false };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return { layout: parsed, stored: true };
  } catch (err){
    console.warn("Unable to load cost layout", err);
  }
  return { layout:{}, stored:false };
}

function getCostLayoutState(){
  if (!window.costLayoutState){
    const loaded = loadCostLayoutFromStorage();
    window.costLayoutState = {
      layoutById: loaded.layout,
      layoutStored: !!loaded.stored,
      editing: false,
      zCounter: 40,
      root: null,
      windows: [],
      editButton: null,
      settingsButton: null,
      settingsMenu: null,
      hintEl: null,
      boundResize: false,
      layoutNotifyPending: false,
      onLayoutChange: null,
      resizeHandler: null
    };
  }
  return window.costLayoutState;
}

function hasSavedCostLayout(state){
  return !!(state && state.layoutStored);
}

function persistCostLayout(state){
  if (!state) return;
  const storage = costLayoutStorage();
  if (!storage) return;
  try {
    if (state.layoutById && Object.keys(state.layoutById).length){
      storage.setItem(COST_LAYOUT_STORAGE_KEY, JSON.stringify(state.layoutById));
      state.layoutStored = true;
    }else{
      storage.removeItem(COST_LAYOUT_STORAGE_KEY);
      state.layoutStored = false;
    }
  } catch (err){
    console.warn("Unable to persist cost layout", err);
  }
}

function captureCostWindowRect(win, rootRect){
  if (!win || !rootRect) return null;
  const rect = win.getBoundingClientRect();
  const width = Math.max(COST_WINDOW_MIN_WIDTH, Math.round(rect.width) || COST_WINDOW_MIN_WIDTH);
  const height = Math.max(COST_WINDOW_MIN_HEIGHT, Math.round(rect.height) || COST_WINDOW_MIN_HEIGHT);
  return {
    x: Math.round(rect.left - rootRect.left),
    y: Math.round(rect.top - rootRect.top),
    width,
    height
  };
}

function costLayoutMaxBottom(layout){
  let maxBottom = 0;
  if (layout){
    Object.values(layout).forEach(box => {
      if (!box) return;
      const bottom = Number(box.y || 0) + Number(box.height || 0);
      if (isFinite(bottom)) maxBottom = Math.max(maxBottom, bottom);
    });
  }
  return maxBottom;
}

function syncCostLayoutEntries(state){
  if (!state.root) return;
  if (!state.layoutById || typeof state.layoutById !== "object") state.layoutById = {};
  const layout = state.layoutById;
  const rootRect = state.root.getBoundingClientRect();
  const useExisting = state.root.classList.contains("has-custom-layout") && Object.keys(layout).length;
  const seen = new Set();
  state.windows.forEach(win => {
    if (!win || !win.dataset) return;
    const id = String(win.dataset.costWindow || "");
    if (!id) return;
    seen.add(id);
    if (!layout[id]){
      if (useExisting){
        const fallbackWidth = Math.max(COST_WINDOW_MIN_WIDTH, Math.round(win.offsetWidth) || COST_WINDOW_MIN_WIDTH);
        const fallbackHeight = Math.max(COST_WINDOW_MIN_HEIGHT, Math.round(win.offsetHeight) || COST_WINDOW_MIN_HEIGHT);
        const offsetY = costLayoutMaxBottom(layout) + 24;
        layout[id] = { x: 0, y: offsetY, width: fallbackWidth, height: fallbackHeight };
      }else{
        layout[id] = captureCostWindowRect(win, rootRect);
      }
    }
  });
  Object.keys(layout).forEach(id => { if (!seen.has(id)) delete layout[id]; });
}

function setCostWindowStyle(win, box){
  if (!win || !box) return;
  win.style.left = `${box.x}px`;
  win.style.top = `${box.y}px`;
  win.style.width = `${box.width}px`;
  win.style.height = `${box.height}px`;
}

function scheduleCostLayoutRefresh(state){
  if (!state) return;
  if (state.layoutNotifyPending) return;
  state.layoutNotifyPending = true;
  requestAnimationFrame(()=>{
    state.layoutNotifyPending = false;
    if (typeof state.onLayoutChange === "function"){
      try {
        state.onLayoutChange();
      } catch (err){
        console.error(err);
      }
    }
  });
}

function updateCostRootSize(state){
  if (!state.root) return;
  if (!state.root.classList.contains("has-custom-layout")){
    state.root.style.minHeight = "";
    state.root.style.paddingBottom = "";
    return;
  }
  const maxBottom = costLayoutMaxBottom(state.layoutById);
  const extra = state.editing ? 160 : 60;
  state.root.style.minHeight = `${Math.max(0, Math.ceil(maxBottom + extra))}px`;
  state.root.style.paddingBottom = state.editing ? "120px" : "48px";
}

function applyCostLayout(state){
  if (!state.root) return;
  if (!state.root.classList.contains("has-custom-layout")){
    state.windows.forEach(win => {
      if (!win) return;
      win.style.left = "";
      win.style.top = "";
      win.style.width = "";
      win.style.height = "";
    });
    updateCostRootSize(state);
    scheduleCostLayoutRefresh(state);
    return;
  }
  state.windows.forEach(win => {
    if (!win || !win.dataset) return;
    const id = String(win.dataset.costWindow || "");
    const box = state.layoutById[id];
    if (box){ setCostWindowStyle(win, box); }
  });
  updateCostRootSize(state);
  scheduleCostLayoutRefresh(state);
}

function updateCostEditUi(state){
  if (state.editButton){
    const label = state.editing ? "Done editing cost layout" : "Edit cost layout";
    state.editButton.textContent = label;
    const pressed = state.editing ? "true" : "false";
    state.editButton.setAttribute("aria-pressed", pressed);
    state.editButton.setAttribute("aria-checked", pressed);
  }
  if (state.hintEl){
    state.hintEl.hidden = !state.editing;
  }
  if (state.settingsButton){
    state.settingsButton.classList.toggle("is-active", !!state.editing);
  }
}

function bringCostWindowToFront(state, win){
  if (!state) return;
  state.zCounter = (state.zCounter || 40) + 1;
  if (win) win.style.zIndex = String(state.zCounter);
}

function removeCostWindowElevation(win){
  if (win) win.style.zIndex = "";
}

function addCostWindowHandles(state){
  state.windows.forEach(win => {
    if (!win) return;
    const id = String(win.dataset.costWindow || "");
    if (!id) return;
    if (!win.querySelector(":scope > .dashboard-drag-handle")){
      const handle = document.createElement("div");
      handle.className = "dashboard-drag-handle";
      handle.title = "Drag to move";
      handle.innerHTML = "<span>Drag</span>";
      handle.setAttribute("aria-hidden", "true");
      handle.addEventListener("pointerdown", (event)=> startCostWindowDrag(state, win, event));
      win.appendChild(handle);
    }
    const resizeTypes = ["n","s","e","w","ne","nw","se","sw"];
    resizeTypes.forEach(type => {
      if (win.querySelector(`:scope > .dashboard-resize-${type}`)) return;
      const handle = document.createElement("div");
      handle.className = `dashboard-resize-handle dashboard-resize-${type}`;
      handle.dataset.resize = type;
      handle.title = "Drag to resize";
      handle.setAttribute("aria-hidden", "true");
      handle.addEventListener("pointerdown", (event)=> startCostWindowResize(state, win, type, event));
      win.appendChild(handle);
    });
  });
}

function removeCostWindowHandles(state){
  state.windows.forEach(win => {
    if (!win) return;
    win.querySelectorAll(":scope > .dashboard-drag-handle, :scope > .dashboard-resize-handle").forEach(el => el.remove());
    removeCostWindowElevation(win);
  });
}

function clampCostX(state, desiredX, width){
  if (!state.root) return desiredX;
  const rootWidth = state.root.clientWidth || state.root.getBoundingClientRect().width || width;
  if (!isFinite(rootWidth) || rootWidth <= 0) return Math.max(0, desiredX);
  const maxX = Math.max(0, rootWidth - width);
  return Math.min(Math.max(0, desiredX), maxX);
}

function startCostWindowDrag(state, win, event){
  if (!state || !win || !state.root) return;
  const id = String(win.dataset.costWindow || "");
  if (!id) return;
  const box = state.layoutById[id];
  if (!box) return;
  if (event.button !== 0 && event.pointerType !== "touch") return;
  event.preventDefault();
  bringCostWindowToFront(state, win);
  const startX = event.clientX;
  const startY = event.clientY;
  const baseX = box.x;
  const baseY = box.y;
  const pointerId = event.pointerId;
  const move = (ev)=>{
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    const nextX = clampCostX(state, baseX + dx, box.width);
    const nextY = Math.max(0, baseY + dy);
    box.x = Math.round(nextX);
    box.y = Math.round(nextY);
    setCostWindowStyle(win, box);
    updateCostRootSize(state);
    scheduleCostLayoutRefresh(state);
  };
  const stop = ()=>{
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    win.releasePointerCapture?.(pointerId);
    persistCostLayout(state);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
  window.addEventListener("pointercancel", stop);
  win.setPointerCapture?.(pointerId);
}

function startCostWindowResize(state, win, direction, event){
  if (!state || !win || !state.root) return;
  const id = String(win.dataset.costWindow || "");
  if (!id) return;
  const box = state.layoutById[id];
  if (!box) return;
  if (event.button !== 0 && event.pointerType !== "touch") return;
  event.preventDefault();
  bringCostWindowToFront(state, win);
  const startX = event.clientX;
  const startY = event.clientY;
  const startBox = { x: box.x, y: box.y, width: box.width, height: box.height };
  const pointerId = event.pointerId;
  const resize = (ev)=>{
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    let nextX = startBox.x;
    let nextY = startBox.y;
    let nextWidth = startBox.width;
    let nextHeight = startBox.height;
    if (direction.includes("e")){
      nextWidth = Math.max(COST_WINDOW_MIN_WIDTH, startBox.width + dx);
      const maxWidth = (state.root.clientWidth || state.root.getBoundingClientRect().width || nextWidth) - startBox.x;
      if (isFinite(maxWidth) && maxWidth > 0) nextWidth = Math.min(nextWidth, maxWidth);
    }
    if (direction.includes("s")){
      nextHeight = Math.max(COST_WINDOW_MIN_HEIGHT, startBox.height + dy);
    }
    if (direction.includes("w")){
      const desiredX = startBox.x + dx;
      const maxX = startBox.x + startBox.width - COST_WINDOW_MIN_WIDTH;
      nextX = Math.max(0, Math.min(desiredX, maxX));
      nextWidth = Math.max(COST_WINDOW_MIN_WIDTH, startBox.width + (startBox.x - nextX));
    }
    if (direction.includes("n")){
      const desiredY = startBox.y + dy;
      const maxY = startBox.y + startBox.height - COST_WINDOW_MIN_HEIGHT;
      nextY = Math.max(0, Math.min(desiredY, maxY));
      nextHeight = Math.max(COST_WINDOW_MIN_HEIGHT, startBox.height + (startBox.y - nextY));
    }
    nextX = clampCostX(state, nextX, nextWidth);
    if (nextHeight < COST_WINDOW_MIN_HEIGHT) nextHeight = COST_WINDOW_MIN_HEIGHT;
    box.x = Math.round(nextX);
    box.y = Math.round(nextY);
    box.width = Math.round(nextWidth);
    box.height = Math.round(nextHeight);
    setCostWindowStyle(win, box);
    updateCostRootSize(state);
    scheduleCostLayoutRefresh(state);
    dispatchLayoutWindowResize("cost", id, win, box);
  };
  const stop = ()=>{
    window.removeEventListener("pointermove", resize);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    win.releasePointerCapture?.(pointerId);
    persistCostLayout(state);
    dispatchLayoutWindowResize("cost", id, win, box);
  };
  window.addEventListener("pointermove", resize);
  window.addEventListener("pointerup", stop);
  window.addEventListener("pointercancel", stop);
  win.setPointerCapture?.(pointerId);
}

function ensureCostLayoutBoundResize(state){
  if (state.boundResize) return;
  state.boundResize = true;
  window.addEventListener("resize", ()=>{
    const curState = getCostLayoutState();
    if (!curState.root || !curState.root.classList.contains("has-custom-layout")) return;
    const rootWidth = curState.root.clientWidth || curState.root.getBoundingClientRect().width;
    let changed = false;
    Object.entries(curState.layoutById || {}).forEach(([id, box]) => {
      if (!box) return;
      const maxX = Math.max(0, (rootWidth || box.width) - box.width);
      if (box.x > maxX){ box.x = Math.max(0, Math.round(maxX)); changed = true; }
    });
    if (changed){
      applyCostLayout(curState);
      persistCostLayout(curState);
    }
  });
}

function setCostEditing(state, editing){
  state.editing = !!editing;
  if (!state.root) return;
  if (editing){
    if (!state.root.classList.contains("has-custom-layout")){
      state.root.classList.add("has-custom-layout");
      syncCostLayoutEntries(state);
    }
    addCostWindowHandles(state);
    state.root.classList.add("is-editing");
  }else{
    state.root.classList.remove("is-editing");
    removeCostWindowHandles(state);
  }
  applyCostLayout(state);
  updateCostEditUi(state);
  closeCostSettingsMenu();
  if (!editing) persistCostLayout(state);
}

function toggleCostEditing(){
  const state = getCostLayoutState();
  setCostEditing(state, !state.editing);
}

function setupCostLayout(){
  const state = getCostLayoutState();
  state.root = document.getElementById("costLayout") || null;
  state.editButton = document.getElementById("costEditToggle") || null;
  state.settingsButton = document.getElementById("dashboardSettingsToggle") || null;
  state.settingsMenu = document.getElementById("dashboardSettingsMenu") || null;
  state.hintEl = document.getElementById("costEditHint") || null;
  state.windows = state.root ? Array.from(state.root.querySelectorAll("[data-cost-window]")) : [];
  if (!state.root){
    updateCostEditUi(state);
    return;
  }
  ensureCostLayoutBoundResize(state);
  if (hasSavedCostLayout(state)){
    state.root.classList.add("has-custom-layout");
  }
  syncCostLayoutEntries(state);
  applyCostLayout(state);
  updateCostEditUi(state);
  if (state.editing){
    addCostWindowHandles(state);
    state.root.classList.add("is-editing");
  }
  if (state.editButton && !state.editButton.dataset.bound){
    state.editButton.dataset.bound = "1";
    state.editButton.addEventListener("click", ()=>{
      toggleCostEditing();
      closeCostSettingsMenu();
    });
  }
}

function notifyCostLayoutContentChanged(){
  const state = getCostLayoutState();
  if (!state.root || !state.root.classList.contains("has-custom-layout")) return;
  requestAnimationFrame(()=>{
    applyCostLayout(state);
  });
}

function renderDashboard(){
  const content = $("#content"); if (!content) return;
  content.innerHTML = viewDashboard();
  setAppSettingsContext("dashboard");
  wireDashboardSettingsMenu();

  // Log hours
  document.getElementById("logBtn")?.addEventListener("click", ()=>{
    const input = document.getElementById("totalInput");
    const v = Number(input?.value);
    if (!isFinite(v) || v < 0){ toast("Enter valid hours."); return; }
    const todayISO = new Date().toISOString().slice(0,10);
    const last = totalHistory[totalHistory.length-1];
    if (last && last.dateISO === todayISO){
      last.hours = v;
    }else{
      totalHistory.push({ dateISO: todayISO, hours: v });
    }
    RENDER_TOTAL = v;
    RENDER_DELTA = deltaSinceLast();
    window.RENDER_TOTAL = RENDER_TOTAL;
    window.RENDER_DELTA = RENDER_DELTA;
    saveCloudDebounced(); toast("Hours logged");
    renderDashboard();
  });

  // Next due summary
  const ndBox = document.getElementById("nextDueBox");
  const escapeHtml = (str)=> String(str||"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const upcoming = tasksInterval
    .map(t => ({ t, nd: nextDue(t) }))
    .filter(x => x.nd)
    .sort((a,b)=> a.nd.due - b.nd.due)
    .slice(0,8);

  if (upcoming.length){
    const formatDate = (date)=> date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    const formatDueLine = (days, dueText)=>{
      if (days <= 0) return `Due today · ${dueText}`;
      if (days === 1) return `Due tomorrow · ${dueText}`;
      return `Due in ${days} days · ${dueText}`;
    };
    const formatRemain = (remain)=>{
      const hours = Math.max(0, Math.round(remain ?? 0));
      return `${hours.toLocaleString()} hrs left`;
    };
    const statusClass = (days)=>{
      if (days <= 0) return "is-due-now";
      if (days <= 3) return "is-due-soon";
      return "is-due-later";
    };
    const buildMetaHtml = (nd)=>{
      const dueLine = formatDueLine(Math.max(0, nd.days ?? 0), formatDate(nd.due));
      const remainLine = formatRemain(nd.remain);
      return `
        <span class="next-due-meta-line">${escapeHtml(dueLine)}</span>
        <span class="next-due-meta-line next-due-meta-hours">${escapeHtml(remainLine)}</span>
      `.trim();
    };
    const buildAriaLabel = (name, nd)=>{
      const dueLine = formatDueLine(Math.max(0, nd.days ?? 0), formatDate(nd.due));
      const remainLine = formatRemain(nd.remain);
      return `${name} — ${dueLine}, ${remainLine}`;
    };

    const featured = upcoming[0];
    const featuredId = String(featured.t.id);
    const featuredMeta = buildMetaHtml(featured.nd);
    const featuredStatus = statusClass(featured.nd.days);
    const countdownNumber = featured.nd.days <= 0
      ? "Due"
      : Math.max(0, featured.nd.days).toLocaleString();
    const countdownLabel = featured.nd.days <= 0
      ? "today"
      : (featured.nd.days === 1 ? "day left" : "days left");
    const eyebrow = featured.nd.days <= 0 ? "Due now" : "Next due";
    const featuredButton = `
      <button type="button" class="next-due-task next-due-featured ${featuredStatus} cal-task"
        data-next-due-task="1" data-task-id="${escapeHtml(featuredId)}" data-cal-task="${escapeHtml(featuredId)}"
        aria-label="${escapeHtml(buildAriaLabel(featured.t.name, featured.nd))}">
        <span class="next-due-featured-copy">
          <span class="next-due-eyebrow">${escapeHtml(eyebrow)}</span>
          <span class="next-due-name">${escapeHtml(featured.t.name)}</span>
          <span class="next-due-meta">${featuredMeta}</span>
        </span>
        <span class="next-due-countdown" aria-hidden="true">
          <span class="next-due-count">${escapeHtml(countdownNumber)}</span>
          <span class="next-due-count-label">${escapeHtml(countdownLabel)}</span>
        </span>
      </button>
    `;

    const rest = upcoming.slice(1);
    const listHtml = rest.map(x => {
      const id = String(x.t.id);
      const metaHtml = buildMetaHtml(x.nd);
      const status = statusClass(x.nd.days);
      return `<li>
        <button type="button" class="next-due-task ${status} cal-task" data-next-due-task="1" data-task-id="${escapeHtml(id)}" data-cal-task="${escapeHtml(id)}">
          <span class="next-due-name">${escapeHtml(x.t.name)}</span>
          <span class="next-due-meta">${metaHtml}</span>
        </button>
      </li>`;
    }).join("");

    const restSection = rest.length
      ? `<div class="next-due-subtitle">Coming up</div><ul class="next-due-list">${listHtml}</ul>`
      : `<p class="next-due-empty">No other tasks are scheduled yet.</p>`;

    ndBox.innerHTML = `<div class="next-due-window">${featuredButton}${restSection}</div>`;
    ndBox.classList.remove("next-due-preview-mode");
    delete ndBox.dataset.preview;
  }else{
    ndBox.innerHTML = buildNextDuePreview();
    ndBox.classList.add("next-due-preview-mode");
    ndBox.dataset.preview = "1";
  }

  if (!ndBox.dataset.wired){
    ndBox.dataset.wired = "1";

    const findTaskButton = (target)=> target && target.closest ? target.closest("[data-next-due-task]") : null;

    ndBox.addEventListener("click", (e)=>{
      const btn = findTaskButton(e.target);
      if (!btn) return;
      const taskId = btn.dataset.taskId || btn.dataset.calTask;
      if (!taskId) return;
      if (typeof hideBubble === "function") hideBubble();
      if (typeof openSettingsAndReveal === "function") openSettingsAndReveal(taskId);
    });

    const showBubbleFor = (btn)=>{
      const taskId = btn?.dataset?.taskId || btn?.dataset?.calTask;
      if (!taskId) return;
      if (typeof showTaskBubble === "function") showTaskBubble(String(taskId), btn);
    };

    const maybeHideBubble = (from, to)=>{
      if (!from) return;
      const leavingWidget = !to || !ndBox.contains(to);
      if (leavingWidget && typeof hideBubbleSoon === "function") hideBubbleSoon();
    };

    ndBox.addEventListener("mouseover", (e)=>{
      const btn = findTaskButton(e.target);
      if (btn) showBubbleFor(btn);
    });

    ndBox.addEventListener("focusin", (e)=>{
      const btn = findTaskButton(e.target);
      if (btn) showBubbleFor(btn);
    });

    ndBox.addEventListener("mouseout", (e)=>{
      const from = findTaskButton(e.target);
      const to = findTaskButton(e.relatedTarget);
      maybeHideBubble(from, to);
    });

    ndBox.addEventListener("focusout", (e)=>{
      const from = findTaskButton(e.target);
      const to = findTaskButton(e.relatedTarget);
      maybeHideBubble(from, to);
    });
  }

  if (typeof window._maintOrderCounter === "undefined") window._maintOrderCounter = 0;

  const modal            = document.getElementById("dashboardAddModal");
  const closeBtn         = document.getElementById("dashboardModalClose");
  const taskForm         = document.getElementById("dashTaskForm");
  const downForm         = document.getElementById("dashDownForm");
  const jobForm          = document.getElementById("dashJobForm");
  const downList         = document.getElementById("dashDownList");
  const downDateInput    = document.getElementById("dashDownDate");
  const taskTypeSelect   = document.getElementById("dashTaskType");
  const taskNameInput    = document.getElementById("dashTaskName");
  const taskIntervalInput= document.getElementById("dashTaskInterval");
  const taskLastInput    = document.getElementById("dashTaskLast");
  const taskConditionInput = document.getElementById("dashTaskCondition");
  const taskManualInput  = document.getElementById("dashTaskManual");
  const taskStoreInput   = document.getElementById("dashTaskStore");
  const taskPNInput      = document.getElementById("dashTaskPN");
  const taskPriceInput   = document.getElementById("dashTaskPrice");
  const categorySelect   = document.getElementById("dashTaskCategory");
  const subtaskList      = document.getElementById("dashSubtaskList");
  const addSubtaskBtn    = document.getElementById("dashAddSubtask");
  const jobNameInput     = document.getElementById("dashJobName");
  const jobEstimateInput = document.getElementById("dashJobEstimate");
  const jobStartInput    = document.getElementById("dashJobStart");
  const jobDueInput      = document.getElementById("dashJobDue");
  const garnetForm       = document.getElementById("dashGarnetForm");
  const garnetDateInput  = document.getElementById("dashGarnetDate");
  const garnetStartInput = document.getElementById("dashGarnetStart");
  const garnetEndInput   = document.getElementById("dashGarnetEnd");
  const garnetNoteInput  = document.getElementById("dashGarnetNote");
  const garnetSubmitBtn  = document.getElementById("dashGarnetSubmit");
  const garnetCancelBtn  = document.getElementById("dashGarnetCancel");
  const garnetList       = document.getElementById("dashGarnetList");

  const taskFreqRow      = taskForm?.querySelector("[data-task-frequency]");
  const taskLastRow      = taskForm?.querySelector("[data-task-last]");
  const taskConditionRow = taskForm?.querySelector("[data-task-condition]");
  const stepSections     = modal ? Array.from(modal.querySelectorAll("[data-step]")) : [];
  let addContextDateISO  = null;
  let editingGarnetId    = null;
  let pendingGarnetEditId = null;

  function setContextDate(dateISO){
    addContextDateISO = dateISO || null;
    if (modal){
      if (addContextDateISO){
        modal.setAttribute("data-context-date", addContextDateISO);
      }else{
        modal.removeAttribute("data-context-date");
      }
    }
    if (downDateInput){
      if (addContextDateISO){
        downDateInput.value = addContextDateISO;
      }else if (!modal || !modal.classList.contains("is-visible")){
        downDateInput.value = "";
      }
    }
    if (garnetDateInput && !editingGarnetId){
      if (addContextDateISO){
        garnetDateInput.value = addContextDateISO;
      }else if (!modal || !modal.classList.contains("is-visible")){
        garnetDateInput.value = "";
      }
    }
  }

  function ensureDownTimeArray(){
    if (!Array.isArray(window.downTimes)) window.downTimes = [];
    const arr = window.downTimes;
    for (let i = arr.length - 1; i >= 0; i--){
      const entry = arr[i];
      if (!entry){ arr.splice(i,1); continue; }
      if (typeof entry === "string"){ arr[i] = { dateISO: entry }; continue; }
      if (typeof entry.dateISO !== "string") arr.splice(i,1);
    }
    return arr;
  }

  function refreshDownTimeList(){
    if (!downList) return;
    const arr = ensureDownTimeArray().slice().sort((a,b)=> String(a.dateISO).localeCompare(String(b.dateISO)));
    if (!arr.length){
      downList.innerHTML = `<div class="small muted">No down time days yet.</div>`;
      return;
    }
    downList.innerHTML = "";
    arr.forEach(item => {
      const row = document.createElement("div");
      row.className = "down-item";
      const label = document.createElement("span");
      const parsed = new Date(item.dateISO + "T00:00:00");
      label.textContent = isNaN(parsed.getTime()) ? item.dateISO : parsed.toLocaleDateString();
      row.appendChild(label);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "down-remove-btn";
      btn.textContent = "Remove";
      btn.addEventListener("click", ()=>{ removeDownTime(item.dateISO); });
      row.appendChild(btn);
      downList.appendChild(row);
    });
  }

  function removeDownTime(dateISO){
    const arr = ensureDownTimeArray();
    const idx = arr.findIndex(dt => dt.dateISO === dateISO);
    if (idx < 0) return;
    arr.splice(idx,1);
    saveCloudDebounced();
    toast("Down time removed");
    refreshDownTimeList();
    renderCalendar();
  }

  function formatTimeForDisplay(value){
    const normalized = normalizeTimeString(value);
    if (!normalized) return "—";
    const [hhStr, mmStr] = normalized.split(":");
    const hh = Number(hhStr);
    const suffix = hh >= 12 ? "PM" : "AM";
    const hour12 = ((hh + 11) % 12) + 1;
    return `${hour12}:${mmStr} ${suffix}`;
  }

  function formatGarnetRangeLabel(start, end){
    const startTxt = formatTimeForDisplay(start);
    const endTxt = formatTimeForDisplay(end);
    return `${startTxt} – ${endTxt}`;
  }

  function ensureGarnetArray(){
    if (!Array.isArray(window.garnetCleanings)) window.garnetCleanings = [];
    const arr = window.garnetCleanings;
    for (let i = arr.length - 1; i >= 0; i--){
      const entry = arr[i];
      if (!entry || typeof entry !== "object"){ arr.splice(i,1); continue; }
      if (!entry.id){ entry.id = genId("garnet_cleaning"); }
      if (typeof entry.dateISO !== "string" || !entry.dateISO){ arr.splice(i,1); continue; }
      entry.startTime = normalizeTimeString(entry.startTime) || "08:00";
      entry.endTime   = normalizeTimeString(entry.endTime)   || "12:00";
      const startMinutes = timeStringToMinutes(entry.startTime) ?? 0;
      let endMinutes = timeStringToMinutes(entry.endTime);
      if (endMinutes == null || endMinutes <= startMinutes){
        endMinutes = Math.min(startMinutes + 60, (23 * 60) + 59);
        const endHour = Math.floor(endMinutes / 60) % 24;
        const endMinute = endMinutes % 60;
        entry.endTime = `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
      }
      entry.note = typeof entry.note === "string" ? entry.note : "";
      entry.completed = Boolean(entry.completed);
      entry.id = String(entry.id);
    }
    return arr;
  }

  function updateGarnetFormState(){
    if (garnetSubmitBtn){
      garnetSubmitBtn.textContent = editingGarnetId ? "Update Cleaning" : "Add Cleaning";
    }
    if (garnetCancelBtn){
      garnetCancelBtn.hidden = !editingGarnetId;
    }
  }

  function resetGarnetForm(){
    garnetForm?.reset();
    editingGarnetId = null;
    if (garnetDateInput){
      if (addContextDateISO){
        garnetDateInput.value = addContextDateISO;
      }else if (!garnetDateInput.value){
        garnetDateInput.value = ymd(new Date());
      }
    }
    updateGarnetFormState();
  }

  function startGarnetEdit(id){
    const arr = ensureGarnetArray();
    const entry = arr.find(item => String(item.id) === String(id));
    if (!entry) return;
    editingGarnetId = String(entry.id);
    if (garnetDateInput) garnetDateInput.value = entry.dateISO || "";
    if (garnetStartInput) garnetStartInput.value = normalizeTimeString(entry.startTime) || "08:00";
    if (garnetEndInput) garnetEndInput.value = normalizeTimeString(entry.endTime) || "12:00";
    if (garnetNoteInput) garnetNoteInput.value = entry.note || "";
    updateGarnetFormState();
    garnetForm?.scrollIntoView({ behavior:"smooth", block:"nearest" });
  }

  function prepareGarnetStep(){
    refreshGarnetList();
    if (pendingGarnetEditId){
      const editId = pendingGarnetEditId;
      pendingGarnetEditId = null;
      startGarnetEdit(editId);
      return;
    }
    if (!editingGarnetId){
      resetGarnetForm();
    }else{
      updateGarnetFormState();
    }
  }

  function refreshGarnetList(){
    if (!garnetList) return;
    const arr = ensureGarnetArray().slice().sort((a,b)=>{
      const dateCmp = String(a.dateISO).localeCompare(String(b.dateISO));
      if (dateCmp !== 0) return dateCmp;
      const startA = timeStringToMinutes(a.startTime) ?? 0;
      const startB = timeStringToMinutes(b.startTime) ?? 0;
      return (startA - startB) || String(a.id).localeCompare(String(b.id));
    });
    if (!arr.length){
      garnetList.innerHTML = `<div class="small muted">No Garnet cleanings scheduled yet.</div>`;
      return;
    }
    garnetList.innerHTML = "";
    arr.forEach(item => {
      const row = document.createElement("div");
      row.className = "garnet-item" + (item.completed ? " is-complete" : "");
      const info = document.createElement("div");
      info.className = "garnet-item-info";
      const parsed = new Date(item.dateISO + "T00:00:00");
      const dateText = isNaN(parsed.getTime())
        ? item.dateISO
        : parsed.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      info.innerHTML = `
        <div class="garnet-item-title">
          <span class="garnet-item-date">${escapeHtml(dateText)}</span>
          <span class="garnet-item-time">${escapeHtml(formatGarnetRangeLabel(item.startTime, item.endTime))}</span>
        </div>
        ${item.note ? `<div class="garnet-item-note">${escapeHtml(item.note)}</div>` : ""}
      `;
      row.appendChild(info);
      const actions = document.createElement("div");
      actions.className = "garnet-item-actions";
      const completeBtn = document.createElement("button");
      completeBtn.type = "button";
      completeBtn.className = "garnet-complete-btn";
      completeBtn.textContent = item.completed ? "Mark incomplete" : "Mark complete";
      completeBtn.addEventListener("click", ()=> toggleGarnetComplete(item.id));
      actions.appendChild(completeBtn);
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "garnet-edit-btn";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", ()=>{
        pendingGarnetEditId = item.id;
        showStep("garnet");
        prepareGarnetStep();
      });
      actions.appendChild(editBtn);
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "garnet-remove-btn";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", ()=> removeGarnet(item.id));
      actions.appendChild(removeBtn);
      row.appendChild(actions);
      garnetList.appendChild(row);
    });
  }

  function toggleGarnetComplete(id){
    const arr = ensureGarnetArray();
    const entry = arr.find(item => String(item.id) === String(id));
    if (!entry) return;
    entry.completed = !entry.completed;
    saveCloudDebounced();
    toast(entry.completed ? "Garnet cleaning completed" : "Marked as scheduled");
    refreshGarnetList();
    renderCalendar();
  }

  function removeGarnet(id){
    const arr = ensureGarnetArray();
    const idx = arr.findIndex(item => String(item.id) === String(id));
    if (idx < 0) return;
    arr.splice(idx,1);
    if (editingGarnetId && String(editingGarnetId) === String(id)){
      resetGarnetForm();
    }
    saveCloudDebounced();
    toast("Garnet cleaning removed");
    refreshGarnetList();
    renderCalendar();
  }

  function populateCategoryOptions(){
    if (!categorySelect) return;
    const folders = Array.isArray(window.settingsFolders) ? window.settingsFolders : [];
    const byParent = new Map();
    folders.forEach(f => {
      const key = String(f.parent ?? "");
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(f);
    });
    byParent.forEach(list => list.sort((a,b)=> (Number(a.order||0) - Number(b.order||0)) || String(a.name||"").localeCompare(String(b.name||""))));
    const opts = ['<option value="">(No Category)</option>'];
    const walk = (parent, prefix)=>{
      const key = String(parent ?? "");
      const children = byParent.get(key) || [];
      for (const child of children){
        const label = `${prefix}${child.name}`;
        opts.push(`<option value="${escapeHtml(String(child.id))}">${escapeHtml(label)}</option>`);
        walk(child.id, `${prefix}${child.name} / `);
      }
    };
    walk(null, "");
    categorySelect.innerHTML = opts.join("");
  }

  function syncTaskMode(mode){
    if (!taskFreqRow || !taskLastRow || !taskConditionRow) return;
    if (mode === "asreq"){
      taskFreqRow.hidden = true;
      taskLastRow.hidden = true;
      taskConditionRow.hidden = false;
    }else{
      taskFreqRow.hidden = false;
      taskLastRow.hidden = false;
      taskConditionRow.hidden = true;
    }
  }

  function resetTaskForm(){
    taskForm?.reset();
    subtaskList?.replaceChildren();
    syncTaskMode(taskTypeSelect?.value || "interval");
  }

  function showStep(step){
    stepSections.forEach(section => {
      if (!section) return;
      section.hidden = section.dataset.step !== step;
    });
    if (step === "task"){
      populateCategoryOptions();
      syncTaskMode(taskTypeSelect?.value || "interval");
    }
    if (step === "downtime"){
      refreshDownTimeList();
      if (addContextDateISO && downDateInput){
        downDateInput.value = addContextDateISO;
      }
    }
    if (step === "garnet"){
      prepareGarnetStep();
    }
  }

  function showBackdrop(step){
    if (!modal) return;
    ensureDownTimeArray();
    modal.classList.add("is-visible");
    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body?.classList.add("modal-open");
    showStep(step);
  }

  function hideBackdrop(){
    if (!modal) return;
    modal.classList.remove("is-visible");
    modal.setAttribute("hidden", "");
    modal.setAttribute("aria-hidden", "true");
    document.body?.classList.remove("modal-open");
  }

  function openModal(step="picker", opts={}){
    if (opts && Object.prototype.hasOwnProperty.call(opts, "dateISO")){
      setContextDate(opts.dateISO);
    }else{
      setContextDate(null);
    }
    if (opts && Object.prototype.hasOwnProperty.call(opts, "garnetId") && opts.garnetId != null){
      pendingGarnetEditId = String(opts.garnetId);
    }else{
      pendingGarnetEditId = null;
    }
    const desiredStep = opts?.step || step;
    showBackdrop(desiredStep);
    if (desiredStep === "downtime" && addContextDateISO && downDateInput){
      downDateInput.value = addContextDateISO;
    }
    if (desiredStep === "garnet" && addContextDateISO && garnetDateInput && !editingGarnetId){
      garnetDateInput.value = addContextDateISO;
    }
  }

  function closeModal(){
    hideBackdrop();
    showStep("picker");
    resetTaskForm();
    downForm?.reset();
    jobForm?.reset();
    resetGarnetForm();
    setContextDate(null);
    pendingGarnetEditId = null;
  }

  window.openDashboardAddPicker = (opts={}) => {
    const obj = typeof opts === "object" && opts !== null ? opts : {};
    openModal(obj.step || "picker", obj);
  };

  if (Array.isArray(window.__pendingDashboardAddRequests) && window.__pendingDashboardAddRequests.length){
    const queue = window.__pendingDashboardAddRequests.splice(0);
    queue.forEach(req => {
      try {
        const obj = typeof req === "object" && req !== null ? req : {};
        openModal(obj.step || "picker", obj);
      } catch (err){
        console.error("Failed to open dashboard add picker", err);
      }
    });
  }

  window.dashboardRemoveDownTime = removeDownTime;

  downDateInput?.addEventListener("input", ()=>{
    if (!downDateInput) return;
    const val = downDateInput.value;
    addContextDateISO = val || null;
    if (modal){
      if (addContextDateISO){
        modal.setAttribute("data-context-date", addContextDateISO);
      }else{
        modal.removeAttribute("data-context-date");
      }
    }
  });

  garnetDateInput?.addEventListener("input", ()=>{
    if (!garnetDateInput) return;
    const val = garnetDateInput.value;
    addContextDateISO = val || null;
    if (modal){
      if (addContextDateISO){
        modal.setAttribute("data-context-date", addContextDateISO);
      }else{
        modal.removeAttribute("data-context-date");
      }
    }
  });

  garnetCancelBtn?.addEventListener("click", ()=>{
    pendingGarnetEditId = null;
    resetGarnetForm();
  });

  garnetForm?.addEventListener("submit", (e)=>{
    e.preventDefault();
    if (!garnetForm) return;
    const arr = ensureGarnetArray();
    const dateISO = (garnetDateInput?.value || "").trim();
    if (!dateISO){ alert("Select a date for Garnet cleaning."); return; }
    const start = normalizeTimeString(garnetStartInput?.value || "");
    const end   = normalizeTimeString(garnetEndInput?.value || "");
    if (!start || !end){ alert("Enter a valid start and end time."); return; }
    const startMinutes = timeStringToMinutes(start);
    const endMinutes = timeStringToMinutes(end);
    if (startMinutes == null || endMinutes == null){ alert("Enter a valid time range."); return; }
    if (endMinutes <= startMinutes){ alert("End time must be after the start time."); return; }
    const note = (garnetNoteInput?.value || "").trim();
    let message = "Garnet cleaning scheduled";
    if (editingGarnetId){
      const entry = arr.find(item => String(item.id) === String(editingGarnetId));
      if (entry){
        entry.dateISO = dateISO;
        entry.startTime = start;
        entry.endTime = end;
        entry.note = note;
        message = "Garnet cleaning updated";
      }
    }else{
      arr.push({
        id: genId("garnet_cleaning"),
        dateISO,
        startTime: start,
        endTime: end,
        note,
        completed: false
      });
    }
    setContextDate(dateISO);
    saveCloudDebounced();
    toast(message);
    renderCalendar();
    refreshGarnetList();
    pendingGarnetEditId = null;
    resetGarnetForm();
  });

  window.__dashRefreshGarnetList = refreshGarnetList;

  function createSubtaskRow(defaultType){
    if (!subtaskList) return null;
    const row = document.createElement("div");
    row.className = "subtask-row";
    row.dataset.subtaskRow = "1";
    row.innerHTML = `
      <div class="subtask-row-top">
        <strong>Sub-task</strong>
        <button type="button" class="subtask-remove" data-remove-subtask>Remove</button>
      </div>
      <div class="modal-grid subtask-grid">
        <label>Sub-task name<input type="text" data-subtask-name placeholder="Name" required></label>
        <label>Type<select data-subtask-type>
          <option value="interval">Per interval</option>
          <option value="asreq">As required</option>
        </select></label>
        <label data-subtask-frequency>Frequency (hrs)<input type="number" min="1" step="1" data-subtask-interval placeholder="e.g. 20"></label>
        <label data-subtask-last>Last serviced at (hrs)<input type="number" min="0" step="0.01" data-subtask-last placeholder="optional"></label>
        <label data-subtask-condition hidden>Condition / trigger<input type="text" data-subtask-condition-input placeholder="e.g. When needed"></label>
      </div>`;
    const typeSel = row.querySelector("[data-subtask-type]");
    const freqRow = row.querySelector("[data-subtask-frequency]");
    const lastRow = row.querySelector("[data-subtask-last]");
    const condRow = row.querySelector("[data-subtask-condition]");
    if (typeSel) typeSel.value = defaultType || "interval";
    const sync = ()=>{
      if (!typeSel) return;
      const mode = typeSel.value === "asreq" ? "asreq" : "interval";
      if (freqRow) freqRow.hidden = mode !== "interval";
      if (lastRow) lastRow.hidden = mode !== "interval";
      if (condRow) condRow.hidden = mode !== "asreq";
    };
    typeSel?.addEventListener("change", sync);
    sync();
    row.querySelector("[data-remove-subtask]")?.addEventListener("click", ()=> row.remove());
    return row;
  }

  closeBtn?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (e)=>{ if (e.target === modal) closeModal(); });

  modal?.querySelectorAll("[data-choice]")?.forEach(btn => {
    btn.addEventListener("click", ()=>{
      const choice = btn.getAttribute("data-choice");
      let stepTarget = "task";
      if (choice === "downtime") stepTarget = "downtime";
      else if (choice === "job") stepTarget = "job";
      else if (choice === "garnet") stepTarget = "garnet";
      if (stepTarget !== "garnet") pendingGarnetEditId = null;
      showStep(stepTarget);
    });
  });

  modal?.querySelectorAll("[data-step-back]")?.forEach(btn => {
    btn.addEventListener("click", ()=>{
      if (btn.closest('[data-step="garnet"]')){
        pendingGarnetEditId = null;
        resetGarnetForm();
      }
      showStep("picker");
    });
  });

  taskTypeSelect?.addEventListener("change", ()=> syncTaskMode(taskTypeSelect.value));
  syncTaskMode(taskTypeSelect?.value || "interval");
  populateCategoryOptions();

  addSubtaskBtn?.addEventListener("click", ()=>{
    const row = createSubtaskRow(taskTypeSelect?.value || "interval");
    if (row) subtaskList?.appendChild(row);
  });

  taskForm?.addEventListener("submit", (e)=>{
    e.preventDefault();
    if (!taskForm) return;
    const name = (taskNameInput?.value || "").trim();
    if (!name){ alert("Task name is required."); return; }
    const mode = (taskTypeSelect?.value === "asreq") ? "asreq" : "interval";
    const manual = (taskManualInput?.value || "").trim();
    const store  = (taskStoreInput?.value || "").trim();
    const pn     = (taskPNInput?.value || "").trim();
    const priceVal = taskPriceInput?.value;
    const price  = priceVal === "" ? null : Number(priceVal);
    const catId  = (categorySelect?.value || "").trim() || null;
    const id     = genId(name);
    const base = {
      id,
      name,
      manualLink: manual,
      storeLink: store,
      pn,
      price: isFinite(price) ? price : null,
      cat: catId,
      parentTask: null,
      order: ++window._maintOrderCounter
    };
    if (mode === "interval"){
      let interval = Number(taskIntervalInput?.value);
      if (!isFinite(interval) || interval <= 0) interval = 8;
      const task = Object.assign({}, base, { mode:"interval", interval, sinceBase:null, anchorTotal:null });
      const lastVal = taskLastInput?.value;
      if (lastVal !== undefined && lastVal !== ""){
        const v = Number(lastVal);
        if (isFinite(v)){ task.anchorTotal = v; task.sinceBase = 0; }
      }
      tasksInterval.unshift(task);
    }else{
      const condition = (taskConditionInput?.value || "").trim() || "As required";
      const task = Object.assign({}, base, { mode:"asreq", condition });
      tasksAsReq.unshift(task);
    }

    const parentInterval = Number(taskIntervalInput?.value);
    const subRows = subtaskList ? Array.from(subtaskList.querySelectorAll("[data-subtask-row]")) : [];
    subRows.forEach(row => {
      const subName = (row.querySelector("[data-subtask-name]")?.value || "").trim();
      if (!subName) return;
      const subTypeSel = row.querySelector("[data-subtask-type]");
      const subMode = subTypeSel && subTypeSel.value === "asreq" ? "asreq" : "interval";
      const subBase = {
        id: genId(subName),
        name: subName,
        manualLink: "",
        storeLink: "",
        pn: "",
        price: null,
        cat: catId,
        parentTask: id,
        order: ++window._maintOrderCounter
      };
      if (subMode === "interval"){
        const intervalField = row.querySelector("[data-subtask-interval]");
        let subInterval = Number(intervalField?.value);
        if (!isFinite(subInterval) || subInterval <= 0){
          subInterval = isFinite(parentInterval) && parentInterval > 0 ? parentInterval : 8;
        }
        const subTask = Object.assign({}, subBase, { mode:"interval", interval: subInterval, sinceBase:null, anchorTotal:null });
        const lastField = row.querySelector("[data-subtask-last]");
        const lastVal = lastField?.value;
        if (lastVal){
          const v = Number(lastVal);
          if (isFinite(v)){ subTask.anchorTotal = v; subTask.sinceBase = 0; }
        }
        tasksInterval.unshift(subTask);
      }else{
        const condInput = row.querySelector("[data-subtask-condition-input]");
        const subTask = Object.assign({}, subBase, { mode:"asreq", condition: (condInput?.value || "").trim() || "As required" });
        tasksAsReq.unshift(subTask);
      }
    });

    saveCloudDebounced();
    toast("Task added");
    closeModal();
    renderDashboard();
  });

  downForm?.addEventListener("submit", (e)=>{
    e.preventDefault();
    const arr = ensureDownTimeArray();
    const dateISO = downDateInput?.value;
    if (!dateISO){ toast("Pick a date"); return; }
    if (arr.some(dt => dt.dateISO === dateISO)){ toast("Day already marked as down time"); return; }
    arr.push({ dateISO });
    arr.sort((a,b)=> String(a.dateISO).localeCompare(String(b.dateISO)));
    saveCloudDebounced();
    toast("Down time saved");
    if (downDateInput) downDateInput.value = "";
    refreshDownTimeList();
    renderCalendar();
  });

  jobForm?.addEventListener("submit", (e)=>{
    e.preventDefault();
    const name = (jobNameInput?.value || "").trim();
    const est  = Number(jobEstimateInput?.value);
    const start = jobStartInput?.value;
    const due   = jobDueInput?.value;
    if (!name || !isFinite(est) || est <= 0 || !start || !due){ toast("Fill job fields."); return; }
    cuttingJobs.push({ id: genId(name), name, estimateHours: est, startISO: start, dueISO: due, material:"", materialCost:0, materialQty:0, notes:"", manualLogs:[] });
    saveCloudDebounced();
    toast("Cutting job added");
    closeModal();
    renderDashboard();
  });

  refreshDownTimeList();

  document.getElementById("calendarAddBtn")?.addEventListener("click", ()=> openModal("picker"));

  setupDashboardLayout();
  renderCalendar();
  renderPumpWidget();
  notifyDashboardLayoutContentChanged();
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

    // Flatten any legacy nested `.sub` arrays so every task lives in the
    // top-level list with a parentTask pointer (Explorer-style tree).
    const seenIds = new Set();
    function flattenTasks(list, type){
      const flat = [];
      function visit(task, parentId){
        if (!task || task.id == null) return;
        const tid = String(task.id);
        if (seenIds.has(tid)) return; // guard against circular references
        seenIds.add(tid);

        if (!task.mode) task.mode = type;
        else task.mode = type; // enforce consistency with owning list
        if (parentId != null){
          task.parentTask = parentId;
        }
        if (!isFinite(task.order)) task.order = 0;

        flat.push(task);

        if (Array.isArray(task.sub)){
          const children = task.sub.slice();
          delete task.sub;
          for (const child of children){
            visit(child, tid);
          }
        }
      }
      for (const task of list){ visit(task, null); }
      list.splice(0, list.length, ...flat);
    }

    flattenTasks(window.tasksInterval, "interval");
    flattenTasks(window.tasksAsReq, "asreq");

    // Build task map across both lists
    const allTasks = [];
    for (const t of window.tasksInterval){ if (t && t.id!=null){ t.mode = "interval"; allTasks.push(t); } }
    for (const t of window.tasksAsReq){    if (t && t.id!=null){ t.mode = "asreq";    allTasks.push(t); } }
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
        if (t.parentTask != null){
          const parent = tMap[String(t.parentTask)];
          if (parent){
            t.cat = parent.cat ?? null;
          }
        }
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
// Unified mover for tasks and categories.
// Accepts the same "target" shape you already use:
//   - { intoTask: <taskId> }              // make sub-component of a task
//   - { beforeTask: { id, type } }        // reorder (top-level) before another task
//   - { intoCat: <categoryId|null>, position?: 'start'|'end' } // file task into a folder (or root)
//   - { beforeCat: { id } }               // reorder a folder before another folder
function moveNodeSafely(kind, nodeId, target){
  // ---------- Common state ----------
  window.settingsFolders = Array.isArray(window.settingsFolders) ? window.settingsFolders : [];
  window.tasksInterval   = Array.isArray(window.tasksInterval)   ? window.tasksInterval   : [];
  window.tasksAsReq      = Array.isArray(window.tasksAsReq)      ? window.tasksAsReq      : [];
  if (typeof window._maintOrderCounter === "undefined") window._maintOrderCounter = 0;
  window.maintenanceSearchTerm = typeof window.maintenanceSearchTerm === "string"
    ? window.maintenanceSearchTerm
    : "";

  // ---------- Helpers: tasks ----------
  function findTaskMeta(id){
    const tid = String(id);
    let idx = window.tasksInterval.findIndex(t => String(t.id) === tid);
    if (idx >= 0) return { task: window.tasksInterval[idx], list: window.tasksInterval, mode: "interval", index: idx };
    idx = window.tasksAsReq.findIndex(t => String(t.id) === tid);
    if (idx >= 0) return { task: window.tasksAsReq[idx], list: window.tasksAsReq, mode: "asreq", index: idx };
    return null;
  }

  function gatherTaskSiblings(catId, parentId, excludeId){
    const keyCat = String(catId ?? "");
    const keyParent = String(parentId ?? "");
    const excludeKey = excludeId != null ? String(excludeId) : null;
    const siblings = [];
    for (const list of [window.tasksInterval, window.tasksAsReq]){
      if (!Array.isArray(list)) continue;
      for (const task of list){
        if (!task || task.id == null) continue;
        if (excludeKey != null && String(task.id) === excludeKey) continue;
        if (String(task.parentTask ?? "") !== keyParent) continue;
        if (String(task.cat ?? "") !== keyCat) continue;
        siblings.push(task);
      }
    }
    return siblings;
  }

  function gatherCategorySiblings(parentId, excludeId){
    const keyParent = String(parentId ?? "");
    const excludeKey = excludeId != null ? String(excludeId) : null;
    return window.settingsFolders
      .filter(f => String(f?.parent ?? "") === keyParent)
      .filter(f => excludeKey == null || String(f.id) !== excludeKey);
  }

  function gatherMixedSiblings(catId, excludeTaskId = null, excludeCatId = null){
    const tasks = gatherTaskSiblings(catId, null, excludeTaskId)
      .map(task => ({ kind: "task", node: task }));
    const folders = gatherCategorySiblings(catId, excludeCatId)
      .map(cat => ({ kind: "category", node: cat }));
    return tasks.concat(folders);
  }

  function normalizeMixedOrder(catId){
    const combined = gatherMixedSiblings(catId, null, null)
      .sort((a,b)=>{
        const orderA = Number(a.node?.order || 0);
        const orderB = Number(b.node?.order || 0);
        if (orderB !== orderA) return orderB - orderA;
        const nameA = a.kind === "task" ? String(a.node?.name || "") : String(a.node?.name || "");
        const nameB = b.kind === "task" ? String(b.node?.name || "") : String(b.node?.name || "");
        return nameA.localeCompare(nameB);
      });
    if (!combined.length) return;
    let n = combined.length;
    for (const item of combined){
      if (item.node) item.node.order = n--;
    }
    const maxOrder = combined.reduce((max, item)=>{
      const val = Number(item.node?.order || 0);
      return Number.isFinite(val) && val > max ? val : max;
    }, 0);
    window._maintOrderCounter = Math.max(Number(window._maintOrderCounter)||0, maxOrder);
  }

  function normalizeTaskOrder(catId, parentId){
    if (parentId == null){
      normalizeMixedOrder(catId);
      return;
    }
    const siblings = gatherTaskSiblings(catId, parentId, null)
      .sort((a,b)=> (Number(b.order||0) - Number(a.order||0)) || String(a.name||"").localeCompare(String(b.name||"")));
    let n = siblings.length;
    for (const task of siblings){ task.order = n--; }
    if (siblings.length){
      window._maintOrderCounter = Math.max(Number(window._maintOrderCounter)||0, siblings.length);
    }
  }

  function nextMixedOrder(catId, excludeTaskId, excludeCatId, place){
    const combined = gatherMixedSiblings(catId, excludeTaskId, excludeCatId);
    if (!combined.length) return 1;
    if (place === "end"){
      let min = Infinity;
      for (const item of combined){
        const val = Number(item.node?.order || 0);
        if (val < min) min = val;
      }
      if (!isFinite(min)) min = 0;
      return min - 1;
    }
    let max = -Infinity;
    for (const item of combined){
      const val = Number(item.node?.order || 0);
      if (val > max) max = val;
    }
    if (!isFinite(max)) max = 0;
    return max + 1;
  }

  function nextTaskOrder(catId, parentId, excludeId, place){
    if (parentId == null){
      return nextMixedOrder(catId, excludeId, null, place);
    }
    const siblings = gatherTaskSiblings(catId, parentId, excludeId);
    if (!siblings.length){
      return 1;
    }
    if (place === "end"){
      let min = Infinity;
      for (const sib of siblings){
        const val = Number(sib.order) || 0;
        if (val < min) min = val;
      }
      if (!isFinite(min)) min = 0;
      return min - 1;
    }
    let max = -Infinity;
    for (const sib of siblings){
      const val = Number(sib.order) || 0;
      if (val > max) max = val;
    }
    if (!isFinite(max)) max = 0;
    return max + 1;
  }

  function ensureFolder(catId){
    if (catId == null) return true;
    return window.settingsFolders.some(f => String(f.id) === String(catId));
  }

  function isDescendant(candidateId, possibleAncestorId){
    if (candidateId == null || possibleAncestorId == null) return false;
    let guard = 0;
    let cur = findTaskMeta(candidateId);
    while (cur && cur.task.parentTask != null && guard++ < 1000){
      if (String(cur.task.parentTask) === String(possibleAncestorId)) return true;
      cur = findTaskMeta(cur.task.parentTask);
    }
    return false;
  }

  // ---------- Helpers: categories ----------
  const findCat = (id)=> window.settingsFolders.find(f=>String(f.id)===String(id)) || null;

  function normalizeFolderOrder(parentId){
    normalizeMixedOrder(parentId ?? null);
  }

  // ---------- TASK MOVES ----------
  if (kind === "task"){
    const src = findTaskMeta(nodeId);
    if (!src) return false;

    const originalGroup = { cat: src.task.cat ?? null, parent: src.task.parentTask ?? null };

    // intoTask can be string or {id}
    const intoTaskId = (target && Object.prototype.hasOwnProperty.call(target,"intoTask"))
      ? (typeof target.intoTask === "object" ? target.intoTask?.id : target.intoTask)
      : null;

    if (intoTaskId != null){
      if (String(intoTaskId) === String(nodeId)) return false;
      const parentRef = findTaskMeta(intoTaskId);
      if (!parentRef) return false;
      if (isDescendant(parentRef.task.id, src.task.id)) return false;

      const place = target && target.position === "end" ? "end" : "start";
      const nextOrder = nextTaskOrder(parentRef.task.cat ?? null, parentRef.task.id, src.task.id, place);

      src.task.parentTask = parentRef.task.id;
      src.task.cat = parentRef.task.cat ?? null;
      src.task.order = nextOrder;
      if (isFinite(Number(nextOrder))) {
        window._maintOrderCounter = Math.max(window._maintOrderCounter, Number(nextOrder));
      }

      normalizeTaskOrder(src.task.cat ?? null, src.task.parentTask ?? null);
      normalizeTaskOrder(originalGroup.cat, originalGroup.parent);
      return true;
    }

    if (target && target.beforeTask && target.beforeTask.id){
      const dest = findTaskMeta(target.beforeTask.id);
      if (!dest) return false;

      src.task.cat = dest.task.cat ?? null;
      src.task.parentTask = dest.task.parentTask ?? null;
      src.task.order = (Number(dest.task.order) || 0) + 0.5;

      normalizeTaskOrder(dest.task.cat ?? null, dest.task.parentTask ?? null);
      normalizeTaskOrder(originalGroup.cat, originalGroup.parent);
      return true;
    }

    if (Object.prototype.hasOwnProperty.call(target || {}, "intoCat")){
      const catId = target.intoCat;
      if (!ensureFolder(catId)) return false;

      const place = target && target.position === "end" ? "end" : "start";
      const nextOrder = nextTaskOrder(catId ?? null, null, src.task.id, place);

      src.task.cat = catId ?? null;
      src.task.parentTask = null;
      src.task.order = nextOrder;
      if (isFinite(Number(nextOrder))) {
        window._maintOrderCounter = Math.max(window._maintOrderCounter, Number(nextOrder));
      }

      normalizeTaskOrder(src.task.cat ?? null, null);
      normalizeTaskOrder(originalGroup.cat, originalGroup.parent);
      return true;
    }

    return false;
  }

  // ---------- CATEGORY MOVES ----------
  if (kind === "category"){
    const cat = findCat(nodeId);
    if (!cat) return false;
    const originalParent = cat.parent || null;

    if (Object.prototype.hasOwnProperty.call(target || {}, "intoCat")){
      const parent = target.intoCat; // may be null → root
      // prevent cycles: cannot move into own descendant
      let p = parent, hops = 0;
      while (p != null && hops++ < 1000){
        if (String(p) === String(cat.id)) return false;
        p = findCat(p)?.parent ?? null;
      }
      if (parent != null && !findCat(parent)) return false;

      const place = target && target.position === "end" ? "end" : "start";
      const nextOrder = nextMixedOrder(parent ?? null, null, cat.id, place);

      cat.parent = parent || null;
      cat.order  = nextOrder;
      if (isFinite(Number(nextOrder))) {
        window._maintOrderCounter = Math.max(window._maintOrderCounter, Number(nextOrder));
      }
      normalizeFolderOrder(cat.parent);
      normalizeFolderOrder(originalParent);

      if (typeof saveCloudDebounced === "function") try{ saveCloudDebounced(); }catch(_){}
      return true;
    }

    if (target && target.beforeCat && target.beforeCat.id){
      const sib = findCat(target.beforeCat.id);
      if (!sib) return false;

      cat.parent = sib.parent || null;
      // Place "just before" by giving a slightly higher order, then normalize
      cat.order = (Number(sib.order)||0) + 0.5;
      normalizeFolderOrder(cat.parent);
      normalizeFolderOrder(originalParent);

      if (typeof saveCloudDebounced === "function") try{ saveCloudDebounced(); }catch(_){}
      return true;
    }

    if (target && target.beforeTask && target.beforeTask.id){
      const dest = findTaskMeta(target.beforeTask.id);
      if (!dest || dest.task.parentTask != null) return false;

      cat.parent = dest.task.cat ?? null;
      cat.order = (Number(dest.task.order)||0) + 0.5;
      normalizeFolderOrder(cat.parent);
      normalizeFolderOrder(originalParent);

      if (typeof saveCloudDebounced === "function") try{ saveCloudDebounced(); }catch(_){}
      return true;
    }

    return false;
  }

return false;
}

const sharedConfirmModalState = {
  root: null,
  titleEl: null,
  messageEl: null,
  listEl: null,
  confirmBtn: null,
  cancelBtn: null,
  closeBtn: null
};

function ensureSharedConfirmModal(){
  const template = `
    <div class="modal-card confirm-modal-card">
      <button type="button" class="modal-close" data-confirm-close>×</button>
      <h4 data-confirm-title>Confirm</h4>
      <p class="confirm-modal-copy" data-confirm-message></p>
      <ul class="confirm-modal-list" data-confirm-list hidden></ul>
      <div class="modal-actions confirm-modal-actions">
        <button type="button" class="secondary" data-confirm-cancel>Cancel</button>
        <button type="button" class="danger" data-confirm-confirm>Delete</button>
      </div>
    </div>
  `.trim();

  let root = sharedConfirmModalState.root;
  if (!root || !root.isConnected){
    root = document.getElementById("linkedInventoryPrompt");
    if (!root){
      root = document.createElement("div");
      root.id = "linkedInventoryPrompt";
      root.className = "modal-backdrop";
      root.setAttribute("hidden", "");
      const target = document.body || document.documentElement || document;
      target.appendChild(root);
    }
    sharedConfirmModalState.root = root;
  }

  if (sharedConfirmModalState.root && sharedConfirmModalState.root.innerHTML.trim() === ""){
    sharedConfirmModalState.root.innerHTML = template;
  }

  const ensureStructure = ()=>{
    const host = sharedConfirmModalState.root;
    if (!host) return;
    if (!host.querySelector("[data-confirm-title]")){
      host.innerHTML = template;
    }
    sharedConfirmModalState.titleEl = host.querySelector("[data-confirm-title]");
    sharedConfirmModalState.messageEl = host.querySelector("[data-confirm-message]");
    sharedConfirmModalState.listEl = host.querySelector("[data-confirm-list]");
    sharedConfirmModalState.confirmBtn = host.querySelector("[data-confirm-confirm]");
    sharedConfirmModalState.cancelBtn = host.querySelector("[data-confirm-cancel]");
    sharedConfirmModalState.closeBtn = host.querySelector("[data-confirm-close]");
  };

  ensureStructure();
  return sharedConfirmModalState;
}

function showConfirmModal(options){
  const state = ensureSharedConfirmModal();
  const root = state.root;
  if (!root) return Promise.resolve(false);

  const opts = options || {};
  const safeText = (value)=> String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);

  if (state.titleEl) state.titleEl.textContent = opts.title || "Confirm";
  if (state.messageEl) state.messageEl.textContent = opts.message || "";

  if (state.listEl){
    const listItems = Array.isArray(opts.items) ? opts.items.filter(item => item != null && item !== "") : [];
    if (listItems.length){
      state.listEl.innerHTML = listItems.map(item => `<li>${safeText(item)}</li>`).join("");
      state.listEl.removeAttribute("hidden");
    }else{
      state.listEl.innerHTML = "";
      state.listEl.setAttribute("hidden", "");
    }
  }

  if (state.cancelBtn) state.cancelBtn.textContent = opts.cancelText || "Cancel";
  if (state.confirmBtn){
    state.confirmBtn.textContent = opts.confirmText || "Confirm";
    const variant = opts.confirmVariant;
    state.confirmBtn.classList.remove("danger", "primary", "secondary");
    if (variant === "primary") state.confirmBtn.classList.add("primary");
    else if (variant === "secondary") state.confirmBtn.classList.add("secondary");
    else state.confirmBtn.classList.add("danger");
  }

  return new Promise(resolve => {
    const cleanup = ()=>{
      root.classList.remove("is-visible");
      root.setAttribute("hidden", "");
      document.body?.classList.remove("modal-open");
      if (state.confirmBtn) state.confirmBtn.removeEventListener("click", onConfirm);
      if (state.cancelBtn) state.cancelBtn.removeEventListener("click", onCancel);
      if (state.closeBtn) state.closeBtn.removeEventListener("click", onCancel);
      root.removeEventListener("click", onBackdropClick);
      document.removeEventListener("keydown", onKeyDown);
    };

    const onConfirm = ()=>{ cleanup(); resolve(true); };
    const onCancel = ()=>{ cleanup(); resolve(false); };
    const onBackdropClick = (evt)=>{ if (evt.target === root) onCancel(); };
    const onKeyDown = (evt)=>{ if (evt.key === "Escape") onCancel(); };

    if (state.confirmBtn) state.confirmBtn.addEventListener("click", onConfirm);
    if (state.cancelBtn) state.cancelBtn.addEventListener("click", onCancel);
    if (state.closeBtn) state.closeBtn.addEventListener("click", onCancel);
    root.addEventListener("click", onBackdropClick);
    document.addEventListener("keydown", onKeyDown);

    root.classList.add("is-visible");
    root.removeAttribute("hidden");
    document.body?.classList.add("modal-open");

    const focusTarget = state.confirmBtn || state.cancelBtn;
    if (focusTarget && typeof focusTarget.focus === "function"){
      requestAnimationFrame(()=> focusTarget.focus());
    }
  });
}

function renderSettings(){
  // === Explorer-style Maintenance Settings ===
  const root = document.getElementById("content");
  if (!root) return;
  setAppSettingsContext("default");
  wireDashboardSettingsMenu();

  // --- Ensure state is present ---
  window.settingsFolders = Array.isArray(window.settingsFolders) ? window.settingsFolders : [];
  window.tasksInterval   = Array.isArray(window.tasksInterval)   ? window.tasksInterval   : [];
  window.tasksAsReq      = Array.isArray(window.tasksAsReq)      ? window.tasksAsReq      : [];
  if (!(window.settingsOpenFolders instanceof Set)) window.settingsOpenFolders = new Set();
  const openFolderState = window.settingsOpenFolders;
  const validFolderIds = new Set(window.settingsFolders.map(f => String(f.id)));
  for (const id of Array.from(openFolderState)){
    if (!validFolderIds.has(id)) openFolderState.delete(id);
  }
  if (typeof window._maintOrderCounter === "undefined") window._maintOrderCounter = 0;

  // --- one-time hydration for legacy/remote tasks (per-list) ---
  // Previously this only ran if BOTH lists were empty. That prevented legacy
  // tasks from ever loading when just one list was non-empty. This version
  // hydrates each list independently: Firestore → old localStorage → defaults.
  if (!window.__hydratedTasksOnce && (window.tasksInterval.length === 0 || window.tasksAsReq.length === 0)){
    window.__hydratedTasksOnce = true;

    (async ()=>{
      let needInterval = window.tasksInterval.length === 0;
      let needAsReq    = window.tasksAsReq.length === 0;
      let filledAny    = false;

      // 1) Try Firestore (workspaces/{WORKSPACE_ID}/app/state)
      try{
        if (window.FB && FB.ready && FB.docRef && typeof FB.docRef.get === "function"){
          const snap = await FB.docRef.get();
          if (snap && snap.exists){
            const data = typeof snap.data === "function" ? snap.data() : snap.data;
            if (data){
              if (needInterval && Array.isArray(data.tasksInterval) && data.tasksInterval.length){
                window.tasksInterval = data.tasksInterval.slice(); needInterval = false; filledAny = true;
              }
              if (needAsReq && Array.isArray(data.tasksAsReq) && data.tasksAsReq.length){
                window.tasksAsReq = data.tasksAsReq.slice(); needAsReq = false; filledAny = true;
              }
            }
          }
        }
      }catch(e){ console.warn("Firestore hydrate failed:", e); }

      // 2) Fallback: old localStorage keys from v6
      if (needInterval || needAsReq){
        try{
          const si = JSON.parse(localStorage.getItem("omax_tasks_interval_v6") || "null");
          const sa = JSON.parse(localStorage.getItem("omax_tasks_asreq_v6")   || "null");
          if (needInterval && Array.isArray(si) && si.length){
            window.tasksInterval = si.slice(); needInterval = false; filledAny = true;
          }
          if (needAsReq && Array.isArray(sa) && sa.length){
            window.tasksAsReq = sa.slice(); needAsReq = false; filledAny = true;
          }
        }catch(_){}
      }

      // 3) Fallback: defaults (so Settings is never empty)
      if (needInterval && Array.isArray(window.defaultIntervalTasks)){
        window.tasksInterval = window.defaultIntervalTasks.slice(); needInterval = false; filledAny = true;
      }
      if (needAsReq && Array.isArray(window.defaultAsReqTasks)){
        window.tasksAsReq = window.defaultAsReqTasks.slice(); needAsReq = false; filledAny = true;
      }

      // Normalize ids/orders so the Explorer view can sort predictably
      if (typeof window._maintOrderCounter === "undefined") window._maintOrderCounter = 0;
      const addId = (t)=>{
        if (!t.id){
          t.id = (String(t.name||"task").toLowerCase().replace(/[^a-z0-9]+/g,"_")
                 +"_"+Date.now().toString(36)+Math.random().toString(36).slice(2,6));
        }
      };
      [...window.tasksInterval, ...window.tasksAsReq].forEach(t=>{
        addId(t);
        if (t.order == null) t.order = ++window._maintOrderCounter;
      });

      try{ if (typeof saveTasks === "function") saveTasks(); }catch(_){}
      try{ if (typeof saveCloudDebounced === "function") saveCloudDebounced(); }catch(_){}

      // After hydrating, re-render the page once
      renderSettings();
    })();

    // Temporary placeholder while tasks load
    root.innerHTML = `
      <div class="container">
        <div class="block" style="grid-column:1/-1">
          <h3>Maintenance Settings</h3>
          <div>Loading tasks…</div>
        </div>
      </div>`;
    return; // prevent wiring before data is ready
  }



  // --- Normalize relationships so legacy data can't hide tasks ---
  // Tasks synced from Firestore/localStorage may still carry the
  // legacy `cat` values ("interval"/"asreq") or point at folders that
  // no longer exist. That caused the new explorer view to render an
  // empty list even though the calendar still had tasks. Running the
  // shared repair step resets any stale pointers before we render.
  if (typeof repairMaintenanceGraph === "function") {
    repairMaintenanceGraph();
  }

  const searchValueRaw = window.maintenanceSearchTerm || "";
  const searchTerm = searchValueRaw.trim().toLowerCase();
  const searchActive = searchTerm.length > 0;

  // --- Small, compact scoped styles (once) ---
  if (!document.getElementById("settingsExplorerCSS")){
    const st = document.createElement("style");
    st.id = "settingsExplorerCSS";
    st.textContent = `
      #explorer .toolbar{display:flex;flex-direction:column;align-items:center;gap:.75rem;margin-bottom:.75rem}
      #explorer .toolbar-actions{display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center;width:100%}
      #explorer .toolbar-actions button{padding:.35rem .65rem;font-size:.92rem;border-radius:8px}
      #explorer .toolbar-actions button.danger{background:#ffe7e7;color:#b00020}
      #explorer .toolbar-actions button.danger:hover:not(:disabled){background:#ffd1d1}
      #explorer .toolbar-actions button:disabled{opacity:.55;cursor:default}
      #explorer .toolbar-search{display:flex;align-items:center;gap:.45rem;justify-content:center;background:#f3f4f8;border-radius:999px;padding:.4rem .7rem;border:1px solid #d0d7e4;box-shadow:0 6px 18px rgba(15,35,72,.08);margin:0 auto;width:min(420px,100%)}
      #explorer .toolbar-search .icon{font-size:1.05rem;color:#5b6a82;display:flex;align-items:center;justify-content:center}
      #explorer .toolbar-search input{flex:1;min-width:0;padding:.2rem;border:0;background:transparent;font-size:.95rem;color:#0f1e3a}
      #explorer .toolbar-search input::placeholder{color:#8a94a8}
      #explorer .toolbar-search input:focus{outline:none}
      #explorer .toolbar-search button{padding:.32rem .7rem;font-size:.82rem;border-radius:999px;border:0;background:#eef2f8;color:#0a63c2;font-weight:600;cursor:pointer;transition:background .2s ease,color .2s ease,opacity .2s ease}
      #explorer .toolbar-search button:hover:not(:disabled){background:#e0e7f3}
      #explorer .toolbar-search button:disabled{opacity:.5;cursor:default}
      #explorer .toolbar .hint{flex:1 1 auto;text-align:center;width:100%}
      #explorer .hint{font-size:.8rem;color:#666}
      #explorer .tree{border:1px solid #e5e5e5;background:#fff;border-radius:10px;padding:6px}
      #explorer details{margin:4px 0;border:1px solid #eee;border-radius:8px;background:#fafafa}
      #explorer details>summary{position:relative;display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:grab;user-select:none}
      #explorer details.task>summary{background:#fff;font-weight:600;border-bottom:1px solid #ececec}
      #explorer details.cat>summary{font-weight:700;background:#f4f6fb}
      #explorer .task-name{flex:1;min-width:0}
      #explorer summary .chip{font-size:.72rem;border:1px solid #bbb;border-radius:999px;padding:.05rem .45rem;background:#fff}
      #explorer .body{padding:8px 10px;background:#fff;border-top:1px dashed #e5e5e5}
      #explorer .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.5rem}
      #explorer label{font-size:.85rem;display:flex;flex-direction:column;gap:4px}
      #explorer input,#explorer select{width:100%;padding:.35rem .45rem;border:1px solid #ccd4e0;border-radius:6px;font-size:.9rem}
      #explorer .row-actions{display:flex;gap:.4rem;justify-content:flex-end;margin-top:.6rem;flex-wrap:wrap}
      #explorer .row-actions button{padding:.35rem .65rem;border-radius:6px;border:0;cursor:pointer;background:#eef3fb;color:#0a63c2}
      #explorer .row-actions .danger{background:#e14b4b;color:#fff}
      #explorer .row-actions .btn-complete{background:#0a63c2;color:#fff}
      #maintenanceContextMenu{position:fixed;z-index:10000;background:#fff;border:1px solid #d0d7e4;border-radius:10px;box-shadow:0 14px 30px rgba(15,35,72,.16);display:flex;flex-direction:column;min-width:170px;padding:6px}
      #maintenanceContextMenu[hidden]{display:none}
      #maintenanceContextMenu button{background:none;border:0;text-align:left;padding:8px 12px;font-size:.9rem;color:#0f1e3a;border-radius:6px;cursor:pointer}
      #maintenanceContextMenu button:hover{background:#eef3fb}
      #maintenanceContextMenu button.danger{color:#c62828}
      #maintenanceContextMenu button.danger:hover{background:#fde8e8}
      #explorer .children{padding:6px 8px 10px 18px}
      #explorer .task-children{padding:6px 8px 12px 22px;background:#fbfbfb;border-top:1px solid #f0f0f0}
      #explorer .task-children>.dz{margin:0;padding:0;border:0;background:transparent;min-height:0}
      #explorer .dz{position:relative;margin:0;border-radius:8px;min-height:0;padding:0}
      #explorer .dz::after{content:attr(data-label);position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#0a63c2;color:#fff;font-size:.68rem;padding:2px 8px;border-radius:999px;box-shadow:0 4px 10px rgba(10,99,194,.25);opacity:0;pointer-events:none;white-space:nowrap;transition:opacity .12s ease,transform .12s ease}
      #explorer .dz.dragover::after{opacity:1;transform:translate(-50%,-50%)}
      #explorer .dz[data-drop-into-task],
      #explorer .dz[data-drop-into-cat],
      #explorer .dz[data-drop-root]{min-height:0;padding:0}
      #explorer .dz[data-drop-into-task].dragover,
      #explorer .dz[data-drop-into-cat].dragover,
      #explorer .dz[data-drop-root].dragover{min-height:32px;padding:12px;background:rgba(10,99,194,.08);outline:2px dashed #0a63c2}
      #explorer .dz-line{position:relative;height:1px;margin:0;border-radius:6px}
      #explorer .dz-line::before{content:"";position:absolute;left:10px;right:10px;top:50%;height:1px;background:transparent;transform:translateY(-50%);opacity:0;transition:opacity .12s ease,background-color .12s ease}
      #explorer .dz-line::after{top:0;transform:translate(-50%,-130%)}
      #explorer .dz-line.dragover{height:18px}
      #explorer .dz-line.dragover::before{opacity:1;background:#0a63c2;height:2px}
      #explorer .dz-line.dragover::after{opacity:1;transform:translate(-50%,-160%)}
      #explorer summary.drop-hint{outline:2px solid #0a63c2;border-radius:6px}
      #explorer summary.drop-hint[data-drop-label]::after{content:attr(data-drop-label);position:absolute;left:16px;top:100%;transform:translateY(6px);background:#0a63c2;color:#fff;font-size:.68rem;padding:2px 8px;border-radius:999px;box-shadow:0 4px 10px rgba(10,99,194,.25);white-space:nowrap}
      #explorer .sub-empty{font-size:.78rem;color:#777;margin-left:4px}
      #explorer .empty{padding:.5rem;color:#666}
      #explorer .chip.due-ok{border-color:#ccebd6;background:#e5f6eb;color:#2e7d32}
      #explorer .chip.due-warn{border-color:#f2e4a3;background:#fff7d1;color:#8a6d00}
      #explorer .chip.due-soon{border-color:#ffd0b5;background:#ffe6d6;color:#a14d00}
      #explorer .chip.due-late{border-color:#ffc9c9;background:#ffe1e1;color:#c62828}
      .modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:9999;padding:12px}
      .modal-backdrop[hidden]{display:none}
      .modal-card{background:#fff;border-radius:12px;padding:18px 20px;box-shadow:0 18px 36px rgba(0,0,0,.25);min-width:min(480px,90vw);max-height:90vh;overflow:auto;position:relative}
      .modal-card h4{margin:0 0 12px;font-size:1.1rem}
      .modal-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
      .modal-grid label{display:flex;flex-direction:column;font-size:.9rem;gap:4px}
      .modal-grid input,.modal-grid select{padding:.45rem .55rem;border:1px solid #cdd4e1;border-radius:6px;font-size:.95rem}
      .modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
      .modal-actions button{padding:.45rem .85rem;border-radius:6px;border:0;cursor:pointer;font-weight:600}
      .modal-actions .secondary{background:#eef3fb;color:#0a63c2}
      .modal-actions .primary{background:#0a63c2;color:#fff}
      .modal-close{position:absolute;top:10px;right:10px;background:none;border:0;font-size:1.4rem;cursor:pointer;color:#666;line-height:1}
    `;
    document.head.appendChild(st);
  }

  // --- Helpers & derived collections ---
  const byIdFolder = (id)=> window.settingsFolders.find(f => String(f.id)===String(id)) || null;
  const childrenFolders = (parent)=> window.settingsFolders
      .filter(f => String(f.parent||"") === String(parent||""))
      .sort((a,b)=> (Number(b.order||0)-Number(a.order||0)) || String(a.name).localeCompare(String(b.name)));

  function ensureIdsOrder(obj){
    if (!obj.id){
      obj.id = (obj.name||"item").toLowerCase().replace(/[^a-z0-9]+/g,"_")+"_"+Date.now().toString(36);
    }
    if (obj.order == null) obj.order = ++window._maintOrderCounter;
  }

  const escapeHtml = (str)=> String(str||"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

  function ensureTaskDefaults(task, type){
    ensureIdsOrder(task);
    task.mode = type;
    if (task.parentTask == null) task.parentTask = null;
    if (task.cat == null) task.cat = task.cat ?? null;
  }

  const taskEntries = [];
  window.tasksInterval.forEach(t=>{ if (t){ ensureTaskDefaults(t,"interval"); taskEntries.push({ task:t, type:"interval" }); } });
  window.tasksAsReq.forEach(t=>{ if (t){ ensureTaskDefaults(t,"asreq"); taskEntries.push({ task:t, type:"asreq" }); } });

  const entryById = new Map();
  for (const entry of taskEntries){
    const id = String(entry.task.id);
    entryById.set(id, entry);
  }

  const matchesSearch = (entry)=>{
    if (!searchActive) return true;
    const task = entry.task || {};
    const fields = [
      task.name,
      task.condition,
      task.manualLink,
      task.storeLink,
      task.pn
    ];
    if (task.mode === "interval" && task.interval != null) fields.push(String(task.interval));
    if (task.price != null) fields.push(String(task.price));
    const parts = Array.isArray(task.parts) ? task.parts : [];
    for (const part of parts){
      fields.push(part.name, part.pn, part.note, part.link);
      if (part.price != null) fields.push(String(part.price));
    }
    return fields.some(val => {
      if (val == null) return false;
      return String(val).toLowerCase().includes(searchTerm);
    });
  };

  const matchedTaskIds = new Set();
  if (searchActive){
    for (const entry of taskEntries){
      if (matchesSearch(entry)) matchedTaskIds.add(String(entry.task.id));
    }
  }else{
    for (const entry of taskEntries){
      matchedTaskIds.add(String(entry.task.id));
    }
  }

  const visibleTaskIds = new Set();
  if (searchActive){
    const includeAncestors = (id)=>{
      let current = id;
      while (current){
        if (visibleTaskIds.has(current)) break;
        visibleTaskIds.add(current);
        const entry = entryById.get(current);
        if (!entry) break;
        const parentRaw = entry.task?.parentTask;
        if (parentRaw == null) break;
        current = String(parentRaw);
      }
    };
    matchedTaskIds.forEach(includeAncestors);
  }else{
    matchedTaskIds.forEach(id => visibleTaskIds.add(id));
  }

  const searchEmpty = searchActive && matchedTaskIds.size === 0;

  const tasksById = new Map();
  const childrenByParent = new Map();
  const topByCat = new Map();

  const sortEntries = (arr)=> arr.sort((a,b)=> (Number(b.task.order||0) - Number(a.task.order||0)) || String(a.task.name||"").localeCompare(String(b.task.name||"")));

  for (const entry of taskEntries){
    const t = entry.task;
    const id = String(t.id);
    if (searchActive && !visibleTaskIds.has(id)) continue;
    tasksById.set(id, entry);
    if (t.parentTask != null){
      const key = String(t.parentTask);
      if (!childrenByParent.has(key)) childrenByParent.set(key, []);
      childrenByParent.get(key).push(entry);
    }else{
      const catKey = String(t.cat ?? "");
      if (!topByCat.has(catKey)) topByCat.set(catKey, []);
      topByCat.get(catKey).push(entry);
    }
  }

  childrenByParent.forEach(sortEntries);
  topByCat.forEach(sortEntries);

  const categoryHasVisibleContent = (catId)=>{
    if (!searchActive) return true;
    if ((topByCat.get(String(catId)) || []).length > 0) return true;
    const kids = childrenFolders(catId);
    for (const kid of kids){
      if (categoryHasVisibleContent(kid.id)) return true;
    }
    return false;
  };

  function dueChip(task){
    if (task.mode !== "interval" || typeof nextDue !== "function") return "";
    try{
      const nd = nextDue(task);
      if (!nd){
        return `<span class="chip due-warn" data-due-chip="${task.id}">Awaiting usage data</span>`;
      }
      let cls = "due-ok";
      if (nd.days <= 1) cls = "due-late";
      else if (nd.days <= 3) cls = "due-soon";
      else if (nd.days <= 7) cls = "due-warn";
      return `<span class="chip ${cls}" data-due-chip="${task.id}">${nd.days}d → ${escapeHtml(nd.due.toDateString())}</span>`;
    }catch{
      return `<span class="chip due-warn" data-due-chip="${task.id}">Awaiting usage data</span>`;
    }
  }

  function renderTaskList(entries, options = {}){
    const {
      parentTaskId = null,
      catId = null,
      tailLabel = "Move task here",
      gapLabel = tailLabel,
      emptyMessage = "",
      emptyClass = "empty",
      emptyAttrs = ""
    } = options;
    const safeTail = escapeHtml(tailLabel);
    const safeGap = escapeHtml(gapLabel);
    const tail = `<div class="dz dz-line dz-task-tail" data-drop-task-tail="1" data-tail-parent="${String(parentTaskId ?? "")}" data-tail-cat="${String(catId ?? "")}" data-label="${safeTail}"></div>`;
    if (!entries.length){
      const attr = emptyAttrs ? ` ${emptyAttrs}` : "";
      const msg = emptyMessage ? `<div class="${emptyClass}"${attr}>${escapeHtml(emptyMessage)}</div>` : "";
      return `${msg}${tail}`;
    }
    const pieces = [];
    for (const entry of entries){
      pieces.push(`<div class="dz dz-line dz-task-gap" data-drop-before-task="${entry.task.id}" data-label="${safeGap}"></div>`);
      pieces.push(renderTask(entry));
    }
    pieces.push(tail);
    return pieces.join("");
  }

  function renderTask(entry){
    const t = entry.task;
    const type = entry.type;
    const name = escapeHtml(t.name || "(unnamed task)");
    const condition = escapeHtml(t.condition || "As required");
    const freq = t.interval ? `${t.interval} hrs` : "Set frequency";
    const children = childrenByParent.get(String(t.id)) || [];
    const emptySubMsg = searchActive
      ? "No sub-tasks match your search."
      : "No sub-tasks yet. Drag any task here to nest it.";
    const childList = renderTaskList(children, {
      parentTaskId: t.id,
      catId: t.cat ?? null,
      tailLabel: "Move task here",
      gapLabel: "Move task here",
      emptyMessage: emptySubMsg,
      emptyClass: "sub-empty",
      emptyAttrs: `data-empty-sub="${t.id}"`
    });
    return `
      <details class="task task--${type}" data-task-id="${t.id}" data-owner="${type}">
        <summary draggable="true">
          <span class="task-name">${name}</span>
          <span class="chip">${type === "interval" ? "By Interval" : "As Required"}</span>
          ${type === "interval" ? `<span class=\"chip\" data-chip-frequency="${t.id}">${escapeHtml(freq)}</span>` : `<span class=\"chip\" data-chip-condition="${t.id}">${condition}</span>`}
          ${type === "interval" ? dueChip(t) : ""}
        </summary>
        <div class="body">
          <div class="grid">
            <label>Task name<input data-k="name" data-id="${t.id}" data-list="${type}" value="${escapeHtml(t.name||"")}" placeholder="Name"></label>
            <label>Type<select data-k="mode" data-id="${t.id}" data-list="${type}">
              <option value="interval" ${type==="interval"?"selected":""}>By interval</option>
              <option value="asreq" ${type==="asreq"?"selected":""}>As required</option>
            </select></label>
            ${type === "interval" ? `<label>Frequency (hrs)<input type=\"number\" min=\"1\" step=\"1\" data-k=\"interval\" data-id=\"${t.id}\" data-list=\"interval\" value=\"${t.interval!=null?t.interval:""}\" placeholder=\"Hours between service\"></label>` : `<label>Condition / trigger<input data-k=\"condition\" data-id=\"${t.id}\" data-list=\"asreq\" value=\"${escapeHtml(t.condition||"")}\" placeholder=\"When to perform\"></label>`}
            ${type === "interval" ? `<label>Last serviced at (machine hrs)<input type=\"number\" min=\"0\" step=\"0.01\" data-k=\"anchorTotal\" data-id=\"${t.id}\" data-list=\"interval\" value=\"${t.anchorTotal!=null?t.anchorTotal:""}\" placeholder=\"optional\"></label>` : ""}
            <label>Manual link<input type="url" data-k="manualLink" data-id="${t.id}" data-list="${type}" value="${escapeHtml(t.manualLink||"")}" placeholder="https://..."></label>
            <label>Store link<input type="url" data-k="storeLink" data-id="${t.id}" data-list="${type}" value="${escapeHtml(t.storeLink||"")}" placeholder="https://..."></label>
            <label>Part #<input data-k="pn" data-id="${t.id}" data-list="${type}" value="${escapeHtml(t.pn||"")}" placeholder="Part number"></label>
            <label>Price ($)<input type="number" step="0.01" min="0" data-k="price" data-id="${t.id}" data-list="${type}" value="${t.price!=null?t.price:""}" placeholder="optional"></label>
          </div>
          <div class="row-actions">
            ${type === "interval" ? `<button class="btn-complete" data-complete="${t.id}">Mark completed now</button>` : ""}
            <button class="danger" data-remove="${t.id}" data-from="${type}">Remove</button>
          </div>
        </div>
        <div class="task-children" data-task-children="${t.id}">
          <div class="dz" data-drop-into-task="${t.id}" data-label="Create sub-task"></div>
          ${childList}
        </div>
      </details>
    `;
  }

  function renderMixedList(catId, options = {}){
    const {
      taskGapLabel = "Move item here",
      tailLabel = "Move item here",
      catGapLabel = "Move category here",
      emptyMessage = "",
      emptyClass = "empty",
      emptyAttrs = ""
    } = options;
    const catKey = String(catId ?? "");
    const taskEntriesForCat = topByCat.get(catKey) || [];
    const folders = childrenFolders(catId);
    const nodes = [];

    for (const entry of taskEntriesForCat){
      nodes.push({ kind: "task", order: Number(entry.task?.order || 0), entry });
    }
    for (const folder of folders){
      if (searchActive && !categoryHasVisibleContent(folder.id)) continue;
      nodes.push({ kind: "category", order: Number(folder.order || 0), folder });
    }

    nodes.sort((a,b)=>{
      const orderDiff = Number(b.order || 0) - Number(a.order || 0);
      if (orderDiff !== 0) return orderDiff;
      const nameA = a.kind === "task" ? String(a.entry?.task?.name || "") : String(a.folder?.name || "");
      const nameB = b.kind === "task" ? String(b.entry?.task?.name || "") : String(b.folder?.name || "");
      return nameA.localeCompare(nameB);
    });

    const parts = [];
    if (!nodes.length && emptyMessage){
      const attr = emptyAttrs ? ` ${emptyAttrs}` : "";
      parts.push(`<div class="${emptyClass}"${attr}>${escapeHtml(emptyMessage)}</div>`);
    }

    const safeTaskGap = escapeHtml(taskGapLabel);
    const safeCatGap = escapeHtml(catGapLabel);
    const safeTail = escapeHtml(tailLabel);
    const tailPosition = nodes.length ? "end" : "start";

    for (const node of nodes){
      if (node.kind === "task" && node.entry){
        parts.push(`<div class="dz dz-line dz-task-gap" data-drop-before-task="${node.entry.task.id}" data-label="${safeTaskGap}" data-allow-category="1"></div>`);
        parts.push(renderTask(node.entry));
      }else if (node.kind === "category" && node.folder){
        parts.push(`<div class="dz dz-line dz-cat-gap" data-drop-before-cat="${node.folder.id}" data-label="${safeCatGap}"></div>`);
        parts.push(renderFolder(node.folder));
      }
    }

    parts.push(`<div class="dz dz-line dz-mixed-tail" data-drop-task-tail="1" data-drop-cat-tail="1" data-tail-parent="" data-tail-cat="${String(catId ?? "")}" data-tail-parent-cat="${String(catId ?? "")}" data-label="${safeTail}" data-allow-category="1" data-tail-position="${tailPosition}"></div>`);

    return parts.join("");
  }

  function renderFolder(folder){
    ensureIdsOrder(folder);
    const folderId = String(folder.id);
    const forceOpen = searchActive && categoryHasVisibleContent(folderId);
    const isOpen = forceOpen || openFolderState.has(folderId);
    const openAttr = isOpen ? " open" : "";
    const folderEmptyMsg = searchActive
      ? "No tasks in this category match your search."
      : "No tasks in this category yet.";
    const mixedHtml = renderMixedList(folder.id, {
      taskGapLabel: "Move item here",
      tailLabel: "Move item here",
      catGapLabel: "Move category here",
      emptyMessage: folderEmptyMsg,
      emptyClass: "empty"
    });
    return `
      <details class="cat" data-cat-id="${folder.id}"${openAttr}>
        <summary draggable="true"><span class="task-name">${escapeHtml(folder.name)}</span></summary>
        <div class="dz" data-drop-into-cat="${folder.id}" data-label="Move task here"></div>
        <div class="children">
          ${mixedHtml}
        </div>
      </details>
    `;
  }

  const mixedRoot = renderMixedList(null, {
    taskGapLabel: "Move item here",
    tailLabel: "Move item here",
    catGapLabel: "Move category here"
  });

  const flattenedFolders = [];
  (function walk(parent, prefix){
    for (const f of childrenFolders(parent)){
      flattenedFolders.push({ id: f.id, label: `${prefix}${f.name}` });
      walk(f.id, `${prefix}${f.name} / `);
    }
  })(null, "");

  const categoryOptions = ["<option value=\"\">(No Category)</option>"]
    .concat(flattenedFolders.map(f => `<option value=\"${f.id}\">${escapeHtml(f.label)}</option>`))
    .join("");

  root.innerHTML = `
    <div id="explorer" class="container">
      <div class="block" style="grid-column:1 / -1">
        <h3>Maintenance Settings</h3>
        <div class="toolbar">
          <div class="toolbar-actions">
            <button id="btnAddCategory">+ Add Category</button>
            <button id="btnAddTask">+ Add Task</button>
            <button id="btnClearAllDataInline" class="danger" data-clear-all="1" title="Reset all maintenance data">🧹 Clear All Data</button>
          </div>
          <div class="toolbar-search">
            <span class="icon" aria-hidden="true">🔍</span>
            <input type="search" id="maintenanceSearch" placeholder="Search tasks, parts, or links" value="${escapeHtml(searchValueRaw)}" aria-label="Search maintenance tasks" autocomplete="off">
            <button type="button" id="maintenanceSearchClear" ${searchValueRaw ? "" : "disabled"}>Clear</button>
          </div>
          <span class="hint">Drag folders & tasks to organize. Tasks can hold sub-tasks like folders.</span>
        </div>
        <div class="tree" id="tree">
          <div class="dz" data-drop-root="1" data-label="Move to top level"></div>
          ${mixedRoot}
          ${searchEmpty ? `<div class="empty">No maintenance tasks match your search.</div>` : ``}
          ${(window.settingsFolders.length === 0 && window.tasksInterval.length + window.tasksAsReq.length === 0) ? `<div class="empty">No tasks yet. Add one to get started.</div>` : ``}
        </div>
      </div>
    </div>
    <div class="modal-backdrop" id="taskModal" hidden>
      <div class="modal-card">
        <button type="button" class="modal-close" id="closeTaskModal">×</button>
        <h4>Create maintenance task</h4>
        <form id="taskForm" class="modal-form">
          <div class="modal-grid">
            <label>Task name<input name="taskName" required placeholder="Task"></label>
            <label>Type<select name="taskType" id="taskTypeSelect">
              <option value="interval">By interval</option>
              <option value="asreq">As required</option>
            </select></label>
            <label data-form-frequency>Frequency (hrs)<input type="number" min="1" step="1" name="taskInterval" placeholder="e.g. 40"></label>
            <label data-form-last>Last serviced at (machine hrs)<input type="number" min="0" step="0.01" name="taskLastServiced" placeholder="optional"></label>
            <label data-form-condition hidden>Condition / trigger<input name="taskCondition" placeholder="e.g. When clogged"></label>
            <label>Manual link<input type="url" name="taskManual" placeholder="https://..."></label>
            <label>Store link<input type="url" name="taskStore" placeholder="https://..."></label>
            <label>Part #<input name="taskPN" placeholder="Part number"></label>
            <label>Price ($)<input type="number" min="0" step="0.01" name="taskPrice" placeholder="optional"></label>
            <label>Category<select name="taskCategory">${categoryOptions}</select></label>
          </div>
          <div class="modal-actions">
            <button type="button" class="secondary" id="cancelTaskModal">Cancel</button>
            <button type="submit" class="primary">Create Task</button>
          </div>
        </form>
      </div>
    </div>
    <div id="maintenanceContextMenu" class="context-menu" hidden>
      <button type="button" data-action="edit">Edit</button>
      <button type="button" class="danger" data-action="delete">Delete</button>
    </div>
  `;

  const tree = document.getElementById("tree");
  const modal = document.getElementById("taskModal");
  const form = document.getElementById("taskForm");
  const typeField = document.getElementById("taskTypeSelect");
  const freqRow = form?.querySelector('[data-form-frequency]');
  const lastRow = form?.querySelector('[data-form-last]');
  const conditionRow = form?.querySelector('[data-form-condition]');
  const searchInput = document.getElementById("maintenanceSearch");
  const searchClear = document.getElementById("maintenanceSearchClear");
  const contextMenu = document.getElementById("maintenanceContextMenu");
  let contextTarget = null;

  const promptRemoveLinkedInventory = async (task, matches)=>{
    const list = Array.isArray(matches) ? matches.filter(Boolean) : [];
    if (!list.length) return "keep";

    const taskLabel = task && task.name ? `"${task.name}"` : "this task";
    const count = list.length;
    const baseMessage = count === 1
      ? `Delete ${taskLabel}? This task is also in inventory.`
      : `Delete ${taskLabel}? This task is also in inventory with ${count} items.`;
    const confirmText = "Remove from inventory too";
    const choice = await showConfirmModal({
      title: "Remove task?",
      message: count === 1
        ? `${baseMessage} Remove the linked inventory item as well?`
        : `${baseMessage} Remove the linked inventory items as well?`,
      items: list.map(item => item && item.name ? item.name : "Unnamed inventory item"),
      cancelText: "Keep inventory",
      confirmText,
      confirmVariant: "danger"
    });
    return choice ? "remove" : "keep";
  };

  tree?.querySelectorAll("details.cat").forEach(det => {
    det.addEventListener("toggle", ()=>{
      const catId = det.getAttribute("data-cat-id");
      if (!catId) return;
      if (det.open){
        openFolderState.add(catId);
      }else{
        openFolderState.delete(catId);
      }
    });
  });

  if (searchInput){
    searchInput.addEventListener("input", ()=>{
      window.maintenanceSearchTerm = searchInput.value;
      renderSettings();
      setTimeout(()=>{
        const nextInput = document.getElementById("maintenanceSearch");
        if (!nextInput) return;
        const end = nextInput.value.length;
        nextInput.focus();
        if (typeof nextInput.setSelectionRange === "function"){
          nextInput.setSelectionRange(end, end);
        }
      }, 0);
    });
  }

  if (searchClear){
    searchClear.addEventListener("click", ()=>{
      if (!window.maintenanceSearchTerm){
        searchInput?.focus();
        return;
      }
      window.maintenanceSearchTerm = "";
      renderSettings();
      setTimeout(()=>{
        const nextInput = document.getElementById("maintenanceSearch");
        nextInput?.focus();
      }, 0);
    });
  }

  const persist = ()=>{
    if (typeof saveTasks === "function") { try{ saveTasks(); }catch(_){} }
    if (typeof saveCloudDebounced === "function") { try{ saveCloudDebounced(); }catch(_){} }
  };

  const hideContextMenu = ()=>{
    if (contextMenu){
      contextMenu.hidden = true;
      contextMenu.style.left = "";
      contextMenu.style.top = "";
    }
    contextTarget = null;
  };

  window.__maintenanceContextMenuRef = contextMenu;
  window.__maintenanceContextMenuHide = hideContextMenu;
  if (!window.__maintenanceContextMenuGlobalsAttached){
    window.__maintenanceContextMenuGlobalsAttached = true;
    document.addEventListener("click", (e)=>{
      const menu = window.__maintenanceContextMenuRef;
      if (!menu || menu.hidden) return;
      if (e.target instanceof Node && menu.contains(e.target)) return;
      if (typeof window.__maintenanceContextMenuHide === "function") window.__maintenanceContextMenuHide();
    }, { capture: true });
    document.addEventListener("scroll", ()=>{
      const menu = window.__maintenanceContextMenuRef;
      if (!menu || menu.hidden) return;
      if (typeof window.__maintenanceContextMenuHide === "function") window.__maintenanceContextMenuHide();
    }, { capture: true, passive: true });
    document.addEventListener("keydown", (e)=>{
      if (e.key === "Escape" && typeof window.__maintenanceContextMenuHide === "function"){
        window.__maintenanceContextMenuHide();
      }
    });
  }

  function syncFormMode(mode){
    if (!freqRow || !lastRow || !conditionRow) return;
    if (mode === "interval"){
      freqRow.hidden = false;
      lastRow.hidden = false;
      conditionRow.hidden = true;
    }else{
      freqRow.hidden = true;
      lastRow.hidden = true;
      conditionRow.hidden = false;
    }
  }

  function showModal(){
    if (!modal || !form || !typeField) return;
    form.reset();
    modal.classList.add("is-visible");
    modal.hidden = false;
    document.body?.classList.add("modal-open");
    syncFormMode(typeField.value);
  }
  function hideModal(){
    if (!modal) return;
    modal.classList.remove("is-visible");
    modal.hidden = true;
    document.body?.classList.remove("modal-open");
  }

  ensureClearAllDataHandlers();

  document.getElementById("btnAddCategory")?.addEventListener("click", ()=>{
    const name = prompt("Category name?");
    if (!name) return;
    const cat = { id: name.toLowerCase().replace(/[^a-z0-9]+/g,"_")+"_"+Math.random().toString(36).slice(2,7), name, parent:null, order: ++window._maintOrderCounter };
    window.settingsFolders.push(cat);
    persist();
    renderSettings();
  });

  document.getElementById("btnAddTask")?.addEventListener("click", showModal);
  document.getElementById("cancelTaskModal")?.addEventListener("click", hideModal);
  document.getElementById("closeTaskModal")?.addEventListener("click", hideModal);
  modal?.addEventListener("click", (e)=>{ if (e.target === modal) hideModal(); });
  typeField?.addEventListener("change", ()=> syncFormMode(typeField.value));
  syncFormMode(typeField?.value || "interval");

  const pendingFromInventory = window.pendingMaintenanceAddFromInventory;
  if (pendingFromInventory){
    window.pendingMaintenanceAddFromInventory = null;
    setTimeout(()=>{
      showModal();
      if (!form) return;
      const nameInput = form.querySelector('[name="taskName"]');
      const pnInput = form.querySelector('[name="taskPN"]');
      const linkInput = form.querySelector('[name="taskStore"]');
      const priceInput = form.querySelector('[name="taskPrice"]');
      if (pendingFromInventory.name && nameInput){
        nameInput.value = pendingFromInventory.name;
        requestAnimationFrame(()=>{
          nameInput.focus();
          if (typeof nameInput.setSelectionRange === "function"){
            const len = nameInput.value.length;
            nameInput.setSelectionRange(len, len);
          }
        });
      }
      if (pendingFromInventory.pn && pnInput){
        pnInput.value = pendingFromInventory.pn;
      }
      if (pendingFromInventory.link && linkInput){
        linkInput.value = pendingFromInventory.link;
      }
      if (priceInput){
        if (pendingFromInventory.price != null && Number.isFinite(Number(pendingFromInventory.price))){
          priceInput.value = Number(pendingFromInventory.price);
        }else{
          priceInput.value = "";
        }
      }
    }, 0);
  }

  form?.addEventListener("submit", (e)=>{
    e.preventDefault();
    if (!form) return;
    const data = new FormData(form);
    const name = (data.get("taskName")||"").toString().trim();
    const mode = (data.get("taskType")||"interval").toString();
    if (!name){ alert("Task name is required."); return; }
    const catId = (data.get("taskCategory")||"").toString().trim() || null;
    const manual = (data.get("taskManual")||"").toString().trim();
    const store = (data.get("taskStore")||"").toString().trim();
    const pn = (data.get("taskPN")||"").toString().trim();
    const priceVal = data.get("taskPrice");
    const price = priceVal === null || priceVal === "" ? null : Number(priceVal);
    const id = genId(name);
    const base = { id, name, manualLink: manual, storeLink: store, pn, price: isFinite(price)?price:null, cat: catId, parentTask:null, order: ++window._maintOrderCounter };

    if (mode === "interval"){
      const intervalVal = data.get("taskInterval");
      const lastVal = data.get("taskLastServiced");
      const interval = intervalVal === null || intervalVal === "" ? 8 : Number(intervalVal);
      const task = Object.assign(base, { mode:"interval", interval: isFinite(interval) && interval>0 ? interval : 8, sinceBase:null, anchorTotal:null });
      if (lastVal !== null && lastVal !== ""){ const v = Number(lastVal); if (isFinite(v)){ task.anchorTotal = v; task.sinceBase = 0; } }
      window.tasksInterval.unshift(task);
    }else{
      const condition = (data.get("taskCondition")||"").toString().trim() || "As required";
      const task = Object.assign(base, { mode:"asreq", condition });
      window.tasksAsReq.unshift(task);
    }

    persist();
    hideModal();
    renderSettings();
  });

  function findTaskMeta(id){
    const tid = String(id);
    let idx = window.tasksInterval.findIndex(t => String(t.id)===tid);
    if (idx >= 0) return { task: window.tasksInterval[idx], mode:"interval", list: window.tasksInterval, index: idx };
    idx = window.tasksAsReq.findIndex(t => String(t.id)===tid);
    if (idx >= 0) return { task: window.tasksAsReq[idx], mode:"asreq", list: window.tasksAsReq, index: idx };
    return null;
  }

  function findInventoryMatchesForTask(task){
    if (!task || !Array.isArray(inventory)) return [];
    const matches = [];
    const seen = new Set();
    const candidateIds = new Set();
    if (task.inventoryId != null){
      candidateIds.add(String(task.inventoryId));
    }
    if (task.id != null){
      candidateIds.add(`inv_${task.id}`);
    }
    const taskPN = typeof task.pn === "string" ? task.pn.trim().toLowerCase() : "";
    const taskLink = typeof task.storeLink === "string" ? task.storeLink.trim() : "";
    inventory.forEach(item => {
      if (!item) return;
      const itemId = item.id != null ? String(item.id) : "";
      if (itemId && candidateIds.has(itemId) && !seen.has(itemId)){
        matches.push(item);
        seen.add(itemId);
        return;
      }
      if (taskPN && item.pn && String(item.pn).trim().toLowerCase() === taskPN && !seen.has(itemId)){
        matches.push(item);
        seen.add(itemId);
        return;
      }
      if (taskLink && item.link && String(item.link).trim() === taskLink && !seen.has(itemId)){
        matches.push(item);
        seen.add(itemId);
      }
    });
    return matches;
  }

  function updateDueChip(holder, task){
    const chip = holder.querySelector('[data-due-chip]');
    if (!chip) return;
    chip.textContent = "";
    chip.classList.remove("due-ok","due-warn","due-soon","due-late");
    if (typeof nextDue !== "function"){ chip.textContent = "—"; return; }
    const nd = nextDue(task);
    if (!nd){ chip.textContent = "Awaiting usage data"; chip.classList.add("due-warn"); return; }
    chip.textContent = `${nd.days}d → ${nd.due.toDateString()}`;
    if (nd.days <= 1) chip.classList.add("due-late");
    else if (nd.days <= 3) chip.classList.add("due-soon");
    else if (nd.days <= 7) chip.classList.add("due-warn");
    else chip.classList.add("due-ok");
  }

  tree?.addEventListener("input", (e)=>{
    const target = e.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    const holder = target.closest("[data-task-id]");
    if (!holder) return;
    const id = holder.getAttribute("data-task-id");
    const meta = findTaskMeta(id);
    if (!meta) return;
    const key = target.getAttribute("data-k");
    if (!key || key === "mode") return;
    let value = target.value;
    if (key === "price" || key === "interval" || key === "anchorTotal"){
      value = value === "" ? null : Number(value);
      if (value !== null && !isFinite(value)) return;
    }
    if (key === "interval"){
      meta.task.interval = value == null ? null : Number(value);
      const chip = holder.querySelector('[data-chip-frequency]');
      if (chip) chip.textContent = meta.task.interval ? `${meta.task.interval} hrs` : "Set frequency";
      updateDueChip(holder, meta.task);
    }else if (key === "anchorTotal"){
      if (value == null){ meta.task.anchorTotal = null; meta.task.sinceBase = null; }
      else { meta.task.anchorTotal = Number(value); meta.task.sinceBase = 0; }
      updateDueChip(holder, meta.task);
    }else if (key === "price"){
      meta.task.price = value == null ? null : Number(value);
    }else if (key === "manualLink" || key === "storeLink" || key === "pn" || key === "name" || key === "condition"){
      meta.task[key] = target.value;
      if (key === "name"){ const label = holder.querySelector('.task-name'); if (label) label.textContent = target.value || "(unnamed task)"; }
      if (key === "condition"){ const chip = holder.querySelector('[data-chip-condition]'); if (chip) chip.textContent = target.value || "As required"; }
    }
    persist();
  });

  tree?.addEventListener("change", (e)=>{
    const target = e.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const holder = target.closest("[data-task-id]");
    if (!holder) return;
    const id = holder.getAttribute("data-task-id");
    const meta = findTaskMeta(id);
    if (!meta) return;
    if (target.getAttribute("data-k") === "mode"){
      const nextMode = target.value;
      if (nextMode === meta.mode) return;
      meta.list.splice(meta.index,1);
      if (nextMode === "interval"){
        meta.task.mode = "interval";
        meta.task.interval = meta.task.interval && meta.task.interval>0 ? Number(meta.task.interval) : 8;
        meta.task.sinceBase = meta.task.sinceBase ?? null;
        meta.task.anchorTotal = meta.task.anchorTotal ?? null;
        delete meta.task.condition;
        window.tasksInterval.unshift(meta.task);
      }else{
        meta.task.mode = "asreq";
        meta.task.condition = meta.task.condition || "As required";
        delete meta.task.interval;
        delete meta.task.sinceBase;
        delete meta.task.anchorTotal;
        window.tasksAsReq.unshift(meta.task);
      }
      persist();
      renderSettings();
    }
  });

  tree?.addEventListener("click", async (e)=>{
    const removeBtn = e.target.closest('[data-remove]');
    if (removeBtn){
      const id = removeBtn.getAttribute('data-remove');
      const meta = findTaskMeta(id);
      if (!meta) return;
      const task = meta.task;
      const matches = findInventoryMatchesForTask(task);
      let removeInventoryAlso = false;
      if (matches.length){
        const choice = await promptRemoveLinkedInventory(task, matches);
        removeInventoryAlso = choice === "remove";
      }
      window.tasksInterval.forEach(t => { if (String(t.parentTask) === String(id)) t.parentTask = null; });
      window.tasksAsReq.forEach(t => { if (String(t.parentTask) === String(id)) t.parentTask = null; });
      if (meta.mode === 'interval') window.tasksInterval = window.tasksInterval.filter(t => String(t.id)!==String(id));
      else window.tasksAsReq = window.tasksAsReq.filter(t => String(t.id)!==String(id));
      persist();
      let reRendered = false;
      if (removeInventoryAlso){
        for (const item of matches){
          if (!item || item.id == null) continue;
          const deleted = await deleteInventoryItem(item.id, { skipConfirm: true });
          if (deleted) reRendered = true;
        }
      }
      if (!reRendered){
        renderSettings();
      }
      return;
    }
    const completeBtn = e.target.closest('.btn-complete');
    if (completeBtn){
      const id = completeBtn.getAttribute('data-complete');
      const meta = findTaskMeta(id);
      if (!meta || meta.mode !== 'interval') return;
      const cur = (typeof currentTotal === 'function') ? currentTotal() : null;
      meta.task.anchorTotal = cur!=null ? cur : 0;
      meta.task.sinceBase = 0;
      persist();
      renderSettings();
    }
  });

  tree?.addEventListener("contextmenu", (e)=>{
    if (!(e.target instanceof HTMLElement)) return;
    const summary = e.target.closest("summary");
    if (!summary) return;
    const holder = summary.parentElement;
    if (!(holder instanceof HTMLElement)) return;
    const isTask = holder.classList.contains("task");
    const isCat = holder.classList.contains("cat");
    if (!isTask && !isCat) return;
    const id = isTask ? holder.getAttribute("data-task-id") : holder.getAttribute("data-cat-id");
    if (!id) return;
    e.preventDefault();
    contextTarget = { type: isTask ? "task" : "category", id: String(id), node: holder };
    if (!contextMenu) return;
    contextMenu.hidden = false;
    contextMenu.style.left = "0px";
    contextMenu.style.top = "0px";
    requestAnimationFrame(()=>{
      if (!contextMenu) return;
      const menuRect = contextMenu.getBoundingClientRect();
      let left = e.clientX;
      let top = e.clientY;
      const pad = 8;
      const maxLeft = window.innerWidth - menuRect.width - pad;
      const maxTop = window.innerHeight - menuRect.height - pad;
      if (left > maxLeft) left = Math.max(pad, maxLeft);
      if (top > maxTop) top = Math.max(pad, maxTop);
      if (left < pad) left = pad;
      if (top < pad) top = pad;
      contextMenu.style.left = `${left}px`;
      contextMenu.style.top = `${top}px`;
    });
  });

  contextMenu?.addEventListener("click", (e)=>{
    const btn = e.target instanceof HTMLElement ? e.target.closest("button[data-action]") : null;
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const target = contextTarget;
    hideContextMenu();
    if (!target || !action) return;
    if (action === "edit"){
      if (target.type === "task" && target.node instanceof HTMLElement){
        target.node.open = true;
        const input = target.node.querySelector('[data-k="name"]');
        if (input instanceof HTMLElement && typeof input.focus === "function"){ input.focus(); if ("select" in input && typeof input.select === "function") input.select(); }
      }else if (target.type === "category"){
        const folder = byIdFolder(target.id);
        const currentName = folder?.name || "";
        const next = prompt("Rename category", currentName);
        if (next == null) return;
        const trimmed = next.trim();
        if (!trimmed){ alert("Category name cannot be empty."); return; }
        if (folder){ folder.name = trimmed; }
        persist();
        renderSettings();
      }
    }else if (action === "delete"){
      if (target.type === "task"){
        const meta = findTaskMeta(target.id);
        const taskName = meta?.task?.name ? `“${meta.task.name}”` : "this task";
        if (!meta) return;
        const confirmed = window.confirm(`Delete ${taskName}? This will remove it from every page.`);
        if (!confirmed) return;
        window.tasksInterval.forEach(t => { if (String(t.parentTask) === String(target.id)) t.parentTask = null; });
        window.tasksAsReq.forEach(t => { if (String(t.parentTask) === String(target.id)) t.parentTask = null; });
        if (meta.mode === "interval"){
          window.tasksInterval.splice(meta.index, 1);
        }else{
          window.tasksAsReq.splice(meta.index, 1);
        }
        persist();
        renderSettings();
      }else if (target.type === "category"){
        const folder = byIdFolder(target.id);
        if (!folder) return;
        const label = folder.name ? `the “${folder.name}” category` : "this category";
        const confirmed = window.confirm(`Delete ${label}? Tasks inside will move to the parent level and this will remove it from every page.`);
        if (!confirmed) return;
        const catId = String(folder.id);
        const newParent = folder.parent != null ? String(folder.parent) : null;
        window.settingsFolders = window.settingsFolders.filter(f => String(f.id) !== catId);
        window.settingsFolders.forEach(f => {
          if (String(f.parent || "") === catId){ f.parent = newParent; }
        });
        window.tasksInterval.forEach(t => { if (String(t.cat || "") === catId) t.cat = newParent; });
        window.tasksAsReq.forEach(t => { if (String(t.cat || "") === catId) t.cat = newParent; });
        openFolderState.delete(catId);
        persist();
        renderSettings();
      }
    }
  });


  const clearSummaryHint = (summary)=>{
    if (!summary) return;
    summary.classList.remove('drop-hint');
    summary.removeAttribute('data-drop-label');
  };
  const clearAllDragIndicators = ()=>{
    if (!tree) return;
    tree.querySelectorAll('.dz.dragover').forEach(el=>el.classList.remove('dragover'));
    tree.querySelectorAll('summary.drop-hint').forEach(clearSummaryHint);
  };

  const DRAG = { kind:null, id:null, type:null };
  tree?.addEventListener('dragstart',(e)=>{
    const sum = e.target.closest('summary');
    if (!sum) return;
    const taskCard = sum.closest('details.task');
    const catCard  = sum.closest('details.cat');
    if (taskCard){
      DRAG.kind = 'task';
      DRAG.id   = taskCard.getAttribute('data-task-id');
      DRAG.type = taskCard.getAttribute('data-owner');
      e.dataTransfer.setData('text/plain', `task:${DRAG.id}:${DRAG.type}`);
      e.dataTransfer.effectAllowed = 'move';
      sum.removeAttribute('data-drop-label');
      sum.classList.add('drop-hint');
    }else if (catCard){
      DRAG.kind = 'category';
      DRAG.id   = catCard.getAttribute('data-cat-id');
      e.dataTransfer.setData('text/plain', `category:${DRAG.id}`);
      e.dataTransfer.effectAllowed = 'move';
      sum.removeAttribute('data-drop-label');
      sum.classList.add('drop-hint');
    }
  });
  tree?.addEventListener('dragend',()=>{
    clearAllDragIndicators();
    DRAG.kind = DRAG.id = DRAG.type = null;
  });
  function allow(e){ e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
  tree?.addEventListener('dragover',(e)=>{
    const dz = e.target.closest('.dz');
    if (dz){
      const allowCatHere = dz.getAttribute('data-allow-category') === '1';
      if ((dz.hasAttribute('data-drop-before-task') || dz.hasAttribute('data-drop-task-tail') || dz.hasAttribute('data-drop-into-task')) && DRAG.kind === 'task'){
        allow(e); dz.classList.add('dragover'); return;
      }
      if (dz.hasAttribute('data-drop-before-task') && DRAG.kind === 'category' && allowCatHere){
        allow(e); dz.classList.add('dragover'); return;
      }
      if ((dz.hasAttribute('data-drop-before-cat') || dz.hasAttribute('data-drop-cat-tail')) && DRAG.kind === 'category'){
        allow(e); dz.classList.add('dragover'); return;
      }
      if (dz.hasAttribute('data-drop-task-tail') && DRAG.kind === 'category' && allowCatHere){
        allow(e); dz.classList.add('dragover'); return;
      }
      if (dz.hasAttribute('data-drop-into-cat') && DRAG.kind === 'task'){
        allow(e); dz.classList.add('dragover'); return;
      }
      if (dz.hasAttribute('data-drop-root') && (DRAG.kind === 'task' || DRAG.kind === 'category')){
        allow(e); dz.classList.add('dragover'); return;
      }
    }
    const sumTask = e.target.closest('details.task>summary');
    if (sumTask && DRAG.kind === 'task'){
      allow(e);
      sumTask.dataset.dropLabel = 'Create sub-task';
      sumTask.classList.add('drop-hint');
      return;
    }
    const sumCat = e.target.closest('details.cat>summary');
    if (sumCat && DRAG.kind === 'task'){
      allow(e);
      sumCat.dataset.dropLabel = 'Move task here';
      sumCat.classList.add('drop-hint');
      return;
    }
    if (sumCat && DRAG.kind === 'category'){
      allow(e);
      sumCat.dataset.dropLabel = 'Move category here';
      sumCat.classList.add('drop-hint');
    }
  });
  tree?.addEventListener('dragleave',(e)=>{
    e.target.closest('.dz')?.classList.remove('dragover');
    const sum = e.target.closest('summary');
    if (sum) clearSummaryHint(sum);
  });
  tree?.addEventListener('drop',(e)=>{
    const raw = e.dataTransfer.getData('text/plain') || '';
    const parts = raw.split(':');
    const kind = parts[0];
    const id = parts[1] || null;
    e.preventDefault();
    clearAllDragIndicators();
    const dzRoot = e.target.closest('[data-drop-root]');
    const dzCat  = e.target.closest('[data-drop-into-cat]');
    const dzTask = e.target.closest('[data-drop-into-task]');
    const dzBeforeTask = e.target.closest('[data-drop-before-task]');
    const dzTaskTail = e.target.closest('[data-drop-task-tail]');
    const dzBeforeCat = e.target.closest('[data-drop-before-cat]');
    const dzCatTail = e.target.closest('[data-drop-cat-tail]');
    const onTaskSummary = e.target.closest('details.task>summary');
    const onCatSummary  = e.target.closest('details.cat>summary');

    if (kind === 'task' && id){
      if (dzBeforeTask){
        const beforeId = dzBeforeTask.getAttribute('data-drop-before-task');
        if (beforeId && typeof moveNodeSafely === 'function' && moveNodeSafely('task', id, { beforeTask: { id: beforeId } })){
          persist();
          renderSettings();
        }
        return;
      }
      if (dzTaskTail){
        const parentAttr = dzTaskTail.getAttribute('data-tail-parent') || '';
        const catAttr = dzTaskTail.getAttribute('data-tail-cat') || '';
        const tailPosAttr = dzTaskTail.getAttribute('data-tail-position') || 'end';
        const tailPosition = tailPosAttr === 'start' ? 'start' : 'end';
        const parentId = parentAttr === '' ? null : parentAttr;
        const catId = catAttr === '' ? null : catAttr;
        if (parentId){
          if (typeof moveNodeSafely === 'function' && moveNodeSafely('task', id, { intoTask: parentId, position: tailPosition })){
            persist();
            renderSettings();
          }
        }else{
          if (typeof moveNodeSafely === 'function' && moveNodeSafely('task', id, { intoCat: catId, position: tailPosition })){
            persist();
            renderSettings();
          }
        }
        return;
      }
      if (dzRoot){
        if (typeof moveNodeSafely === 'function' && moveNodeSafely('task', id, { intoCat: null, position: 'start' })){
          persist();
          renderSettings();
        }
        return;
      }
      if (dzCat){
        const catId = dzCat.getAttribute('data-drop-into-cat');
        if (typeof moveNodeSafely === 'function' && moveNodeSafely('task', id, { intoCat: catId, position: 'end' })){
          persist();
          renderSettings();
        }
        return;
      }
      if (dzTask){
        const parentId = dzTask.getAttribute('data-drop-into-task');
        if (typeof moveNodeSafely === 'function' && moveNodeSafely('task', id, { intoTask: parentId, position: 'end' })){
          persist();
          renderSettings();
        }
        return;
      }
      if (onTaskSummary){
        const parentId = onTaskSummary.closest('details.task')?.getAttribute('data-task-id');
        if (parentId && typeof moveNodeSafely === 'function' && moveNodeSafely('task', id, { intoTask: parentId, position: 'end' })){
          persist();
          renderSettings();
        }
        return;
      }
      if (onCatSummary){
        const catId = onCatSummary.closest('details.cat')?.getAttribute('data-cat-id');
        if (typeof moveNodeSafely === 'function' && moveNodeSafely('task', id, { intoCat: catId, position: 'end' })){
          persist();
          renderSettings();
        }
        return;
      }
    }

    if (kind === 'category' && id){
      if (dzBeforeTask){
        const beforeId = dzBeforeTask.getAttribute('data-drop-before-task');
        const allowCat = dzBeforeTask.getAttribute('data-allow-category') === '1';
        if (allowCat && beforeId && typeof moveNodeSafely === 'function' && moveNodeSafely('category', id, { beforeTask: { id: beforeId } })){
          persist();
          renderSettings();
        }
        return;
      }
      if (dzBeforeCat){
        const beforeId = dzBeforeCat.getAttribute('data-drop-before-cat');
        if (beforeId && typeof moveNodeSafely === 'function' && moveNodeSafely('category', id, { beforeCat: { id: beforeId } })){
          persist();
          renderSettings();
        }
        return;
      }
      if (dzTaskTail){
        const allowCat = dzTaskTail.getAttribute('data-allow-category') === '1';
        if (allowCat){
          const parentAttr = dzTaskTail.getAttribute('data-tail-parent-cat') || '';
          const parentId = parentAttr === '' ? null : parentAttr;
          const tailPosAttr = dzTaskTail.getAttribute('data-tail-position') || 'end';
          const tailPosition = tailPosAttr === 'start' ? 'start' : 'end';
          if (typeof moveNodeSafely === 'function' && moveNodeSafely('category', id, { intoCat: parentId, position: tailPosition })){
            persist();
            renderSettings();
          }
        }
        return;
      }
      if (dzCatTail){
        const parentAttr = dzCatTail.getAttribute('data-tail-parent-cat') || '';
        const parentId = parentAttr === '' ? null : parentAttr;
        const tailPosAttr = dzCatTail.getAttribute('data-tail-position') || 'end';
        const tailPosition = tailPosAttr === 'start' ? 'start' : 'end';
        if (typeof moveNodeSafely === 'function' && moveNodeSafely('category', id, { intoCat: parentId, position: tailPosition })){
          persist();
          renderSettings();
        }
        return;
      }
      if (dzRoot){
        if (typeof moveNodeSafely === 'function' && moveNodeSafely('category', id, { intoCat: null, position: 'start' })){
          persist();
          renderSettings();
        }
        return;
      }
      if (onCatSummary){
        const beforeId = onCatSummary.closest('details.cat')?.getAttribute('data-cat-id');
        if (beforeId && typeof moveNodeSafely === 'function' && moveNodeSafely('category', id, { beforeCat: { id: beforeId } })){
          persist();
          renderSettings();
        }
        return;
      }
    }
  });
}

// ---- Costs page ----
const COST_CHART_COLORS = {
  maintenance: "#0a63c2",
  jobs: "#2e7d32"
};

function resizeCostChartCanvas(canvas){
  if (!canvas) return;
  const parent = canvas.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  const fallbackWidth = canvas.width || 720;
  const rawWidth = rect.width || parent.clientWidth || fallbackWidth;
  const width = Math.max(360, Math.round(rawWidth || fallbackWidth));
  const ratio = 240 / 780; // original aspect ratio ~0.3077
  const minHeight = 220;
  const height = Math.max(minHeight, Math.round(width * ratio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function setupCostInfoPanel(){
  const panel = document.getElementById("costInfoPanel");
  const openBtn = document.getElementById("costInfoOpen");

  if (!panel){
    window.openCostInfoPanel = ()=> false;
    window.closeCostInfoPanel = ()=> false;
    if (openBtn){ openBtn.setAttribute("aria-expanded", "false"); }
    return;
  }

  if (panel.hasAttribute("hidden")){
    panel.setAttribute("aria-hidden", "true");
  }

  const card = panel.querySelector(".cost-info-panel-card");
  const closeBtn = panel.querySelector("[data-cost-info-close]");
  const body = document.body;
  let lastFocused = null;

  const setExpanded = (expanded)=>{
    if (!openBtn) return;
    openBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
  };

  const showPanel = ({ reason = "manual" } = {})=>{
    if (!panel || !card) return false;
    if (!panel.hasAttribute("hidden") && panel.classList.contains("is-visible")){
      if (reason === "trainer"){ panel.dataset.trainerOpen = "1"; }
      return true;
    }
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.classList.add("is-visible");
    panel.removeAttribute("hidden");
    panel.setAttribute("aria-hidden", "false");
    if (body) body.classList.add("cost-info-visible");
    setExpanded(true);
    if (reason === "trainer"){ panel.dataset.trainerOpen = "1"; }
    else { panel.dataset.trainerOpen = ""; }
    const focusTarget = closeBtn || card;
    if (focusTarget){
      requestAnimationFrame(()=>{
        try { focusTarget.focus({ preventScroll: true }); }
        catch (_) { focusTarget.focus(); }
      });
    }
    return true;
  };

  const hidePanel = ({ reason = "manual" } = {})=>{
    if (!panel || panel.hasAttribute("hidden")) return false;
    if (reason === "trainer" && panel.dataset.trainerOpen !== "1") return false;
    panel.classList.remove("is-visible");
    panel.setAttribute("hidden", "");
    panel.setAttribute("aria-hidden", "true");
    if (body) body.classList.remove("cost-info-visible");
    panel.dataset.trainerOpen = "";
    setExpanded(false);
    if (reason !== "trainer"){
      const returnFocus = lastFocused || openBtn;
      if (returnFocus && typeof returnFocus.focus === "function"){
        requestAnimationFrame(()=>{
          try { returnFocus.focus({ preventScroll: true }); }
          catch (_) { returnFocus.focus(); }
        });
      }
    }
    lastFocused = null;
    return true;
  };

  const handleBackdropClick = (event)=>{
    if (event.target === panel){
      hidePanel({ reason: panel.dataset.trainerOpen === "1" ? "trainer" : "manual" });
    }
  };

  const handleKeydown = (event)=>{
    if (event.key === "Escape"){
      event.preventDefault();
      hidePanel({ reason: panel.dataset.trainerOpen === "1" ? "trainer" : "manual" });
    }
  };

  panel.addEventListener("click", handleBackdropClick);
  panel.addEventListener("keydown", handleKeydown);

  if (openBtn){
    openBtn.addEventListener("click", (event)=>{
      event.preventDefault();
      showPanel({ reason: "manual" });
    });
    openBtn.setAttribute("aria-expanded", panel.classList.contains("is-visible") && !panel.hasAttribute("hidden") ? "true" : "false");
  }

  if (closeBtn){
    closeBtn.addEventListener("click", (event)=>{
      event.preventDefault();
      hidePanel({ reason: panel.dataset.trainerOpen === "1" ? "trainer" : "manual" });
    });
  }

  window.openCostInfoPanel = showPanel;
  window.closeCostInfoPanel = hidePanel;
}

function renderCosts(){
  const content = document.getElementById("content");
  if (!content) return;

  const model = computeCostModel();
  content.innerHTML = viewCosts(model);
  setAppSettingsContext("costs");
  wireCostSettingsMenu();

  setupCostInfoPanel();

  const canvas = document.getElementById("costChart");
  const toggleMaint = document.getElementById("toggleCostMaintenance");
  const toggleJobs  = document.getElementById("toggleCostJobs");
  const canvasWrap = content.querySelector(".cost-chart-canvas");
  let tooltipEl = canvasWrap ? canvasWrap.querySelector(".cost-chart-tooltip") : null;

  const escapeTooltip = (value)=> String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c] || c);

  const ensureTooltip = ()=>{
    if (!canvasWrap) return null;
    if (!tooltipEl){
      tooltipEl = document.createElement("div");
      tooltipEl.className = "cost-chart-tooltip";
      tooltipEl.setAttribute("role", "tooltip");
      tooltipEl.hidden = true;
      canvasWrap.appendChild(tooltipEl);
    }
    return tooltipEl;
  };

  const hideTooltip = ()=>{
    if (tooltipEl){
      tooltipEl.hidden = true;
      delete tooltipEl.dataset.visible;
      delete tooltipEl.dataset.placement;
      tooltipEl.style.visibility = "";
      tooltipEl.textContent = "";
    }
    if (canvas){
      canvas.style.cursor = "";
    }
  };

  const showTooltip = (target, { scaleX, scaleY })=>{
    const tip = ensureTooltip();
    if (!tip || !canvas) return;
    const label = `${target.datasetLabel} ${target.valueLabel}`;
    tip.innerHTML = `<strong>${escapeTooltip(label)}</strong><span>${escapeTooltip(target.detail)}</span>`;
    tip.hidden = false;
    tip.dataset.visible = "";
    tip.dataset.placement = "";
    tip.style.visibility = "hidden";
    tip.style.left = "0px";
    tip.style.top = "0px";

    const cssScaleX = scaleX > 0 ? 1 / scaleX : 1;
    const cssScaleY = scaleY > 0 ? 1 / scaleY : 1;
    const centerX = target.rect.x + (target.rect.width / 2);
    const canvasWidth = canvas.clientWidth || canvas.width;
    const canvasHeight = canvas.clientHeight || canvas.height;
    const margin = 16;

    const tipBox = tip.getBoundingClientRect();
    const tipWidth = tipBox.width || tip.offsetWidth || 0;
    const tipHeight = tipBox.height || tip.offsetHeight || 0;

    const halfWidth = tipWidth / 2;
    const minAnchorX = margin + halfWidth;
    const maxAnchorX = canvasWidth - margin - halfWidth;
    const anchorXCss = maxAnchorX < minAnchorX
      ? canvasWidth / 2
      : Math.min(maxAnchorX, Math.max(minAnchorX, centerX * cssScaleX));

    const targetTop = target.rect.y;
    const targetBottom = target.rect.y + target.rect.height;
    let anchorY = targetTop;
    let placement = "above";

    const topIfAbove = (targetTop * cssScaleY) - (tipHeight * 1.1);
    if (topIfAbove < margin){
      placement = "below";
      anchorY = targetBottom;
    }

    let anchorYCss = anchorY * cssScaleY;
    if (placement === "above"){
      const minAnchorY = margin + (tipHeight * 1.1);
      const maxAnchorY = canvasHeight - margin + (tipHeight * 0.1);
      if (maxAnchorY < minAnchorY){
        anchorYCss = (minAnchorY + maxAnchorY) / 2;
      }else{
        anchorYCss = Math.min(maxAnchorY, Math.max(minAnchorY, anchorYCss));
      }
    }else{
      const minAnchorY = margin - (tipHeight * 0.1);
      const maxAnchorY = canvasHeight - margin - (tipHeight * 1.1);
      if (maxAnchorY < minAnchorY){
        anchorYCss = (minAnchorY + maxAnchorY) / 2;
      }else{
        anchorYCss = Math.min(maxAnchorY, Math.max(minAnchorY, anchorYCss));
      }
    }

    tip.dataset.placement = placement;
    tip.style.left = `${anchorXCss}px`;
    tip.style.top = `${anchorYCss}px`;
    tip.style.visibility = "";
    tip.dataset.visible = "true";
    canvas.style.cursor = "pointer";
  };

  const handlePointerHover = (event)=>{
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientWidth = canvas.clientWidth || rect.width || canvas.width;
    const clientHeight = canvas.clientHeight || rect.height || canvas.height;
    const scaleX = canvas.width / Math.max(1, clientWidth);
    const scaleY = canvas.height / Math.max(1, clientHeight);
    const pointerX = (event.clientX - rect.left) * scaleX;
    const pointerY = (event.clientY - rect.top) * scaleY;
    const targets = Array.isArray(canvas.__costChartTargets) ? canvas.__costChartTargets : [];
    let hovered = null;
    for (const target of targets){
      if (!target || !target.rect) continue;
      const { x, y, width, height } = target.rect;
      if (pointerX >= x && pointerX <= x + width && pointerY >= y && pointerY <= y + height){
        hovered = target;
        break;
      }
    }
    if (hovered){
      showTooltip(hovered, { scaleX, scaleY });
    }else{
      hideTooltip();
    }
  };

  const attachTooltipHandlers = ()=>{
    if (!canvas) return;
    ensureTooltip();
    if (typeof canvas.__costHoverCleanup === "function"){
      canvas.__costHoverCleanup();
    }
    const pointerMove = (event)=> handlePointerHover(event);
    const pointerDown = (event)=> handlePointerHover(event);
    const pointerLeave = ()=> hideTooltip();
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointerleave", pointerLeave);
    canvas.__costHoverCleanup = ()=>{
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointerleave", pointerLeave);
      hideTooltip();
    };
  };

  attachTooltipHandlers();

  setupCostLayout();
  if (typeof setupCostTrainer === "function"){
    setupCostTrainer();
  }

  const state = getCostLayoutState();

  const redraw = ()=>{
    if (canvas){
      hideTooltip();
      resizeCostChartCanvas(canvas);
      drawCostChart(canvas, model, {
        maintenance: !toggleMaint || toggleMaint.checked,
        jobs: !toggleJobs || toggleJobs.checked
      });
    }
    if (typeof refreshCostTrainer === "function"){
      refreshCostTrainer();
    }
  };

  state.onLayoutChange = redraw;
  if (state.resizeHandler){
    window.removeEventListener("resize", state.resizeHandler);
  }
  state.resizeHandler = ()=> redraw();
  window.addEventListener("resize", state.resizeHandler);

  redraw();
  toggleMaint?.addEventListener("change", redraw);
  toggleJobs?.addEventListener("change", redraw);

  notifyCostLayoutContentChanged();
  if (typeof refreshCostTrainer === "function"){
    refreshCostTrainer();
  }
}

function computeCostModel(){
  const safeHistory = Array.isArray(totalHistory) ? totalHistory.slice() : [];
  const parsedHistory = safeHistory
    .map(entry => {
      if (!entry || entry.hours == null || !entry.dateISO) return null;
      const hours = Number(entry.hours);
      const date = new Date(entry.dateISO);
      if (!isFinite(hours) || isNaN(date)) return null;
      return { hours, date, dateISO: entry.dateISO };
    })
    .filter(Boolean)
    .sort((a,b)=> a.date - b.date);

  const currentHours = (typeof RENDER_TOTAL === "number" && isFinite(RENDER_TOTAL))
    ? Number(RENDER_TOTAL)
    : (typeof currentTotal === "function" ? Number(currentTotal() || 0) : 0);

  const intervalTasks = Array.isArray(tasksInterval) ? tasksInterval : [];
  const asReqTasks = Array.isArray(tasksAsReq) ? tasksAsReq : [];

  const cleanPartNumber = (pn)=> String(pn || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const maintenancePartNumbers = new Set();
  intervalTasks.forEach(task => {
    const pn = cleanPartNumber(task?.pn);
    if (pn) maintenancePartNumbers.add(pn);
  });
  asReqTasks.forEach(task => {
    const pn = cleanPartNumber(task?.pn);
    if (pn) maintenancePartNumbers.add(pn);
  });

  const intervalCostPerHour = intervalTasks.reduce((sum, task)=>{
    const price = Number(task?.price);
    const interval = Number(task?.interval);
    if (!isFinite(price) || !isFinite(interval) || interval <= 0 || price <= 0) return sum;
    return sum + (price / interval);
  }, 0);

  const estimateIntervalCost = (hours)=>{
    if (!isFinite(hours) || hours <= 0 || !isFinite(intervalCostPerHour) || intervalCostPerHour <= 0) return 0;
    return hours * intervalCostPerHour;
  };

  const orderHistory = Array.isArray(orderRequests)
    ? orderRequests.filter(req => req && req.status && req.status !== "draft")
    : [];

  const parseOrderDate = (iso)=>{
    if (!iso) return null;
    if (typeof parseDateLocal === "function"){
      const parsed = parseDateLocal(iso);
      if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) return parsed;
    }
    const fallback = new Date(iso);
    return (fallback instanceof Date && !Number.isNaN(fallback.getTime())) ? fallback : null;
  };

  const resolveOrderDate = (req)=>{
    if (!req) return null;
    return parseOrderDate(req.resolvedAt || req.updatedAt || req.createdAt);
  };

  const isMaintenanceOrderItem = (item, reqStatus)=>{
    if (!item) return false;
    if (item.maintenance === true) return true;
    const category = String(item.category || "").toLowerCase();
    if (category.includes("mainten")) return true;
    const tags = Array.isArray(item.tags) ? item.tags : [];
    if (tags.some(tag => String(tag).toLowerCase().includes("mainten"))) return true;
    const pn = cleanPartNumber(item.pn);
    if (pn && maintenancePartNumbers.has(pn)) return true;
    return false;
  };

  const maintenanceOrderItems = [];
  orderHistory.forEach(req => {
    const resolved = resolveOrderDate(req);
    if (!resolved) return;
    const resolvedTime = resolved.getTime();
    const reqStatus = typeof req.status === "string" ? req.status.toLowerCase() : "";
    if (!Array.isArray(req.items)) return;
    req.items.forEach(item => {
      if (!isMaintenanceOrderItem(item, reqStatus)) return;
      const itemStatus = typeof item?.status === "string" ? item.status.toLowerCase() : "";
      const approved = itemStatus === "approved" || (!itemStatus && reqStatus === "approved");
      if (!approved) return;
      const amount = orderItemLineTotal(item);
      if (!isFinite(amount) || amount <= 0) return;
      maintenanceOrderItems.push({ amount, time: resolvedTime });
    });
  });

  maintenanceOrderItems.sort((a,b)=> a.time - b.time);

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const maintenanceSpendSince = (days)=>{
    if (!isFinite(days) || days <= 0 || !maintenanceOrderItems.length) return 0;
    const cutoff = Date.now() - (days * MS_PER_DAY);
    let total = 0;
    for (const entry of maintenanceOrderItems){
      if (entry.time >= cutoff) total += entry.amount;
    }
    return total;
  };

  const expectedAsReqAnnualFromTasks = asReqTasks.reduce((sum, task)=>{
    const price = Number(task?.price);
    if (!isFinite(price) || price <= 0) return sum;
    const candidates = [
      Number(task?.expectedAnnual),
      Number(task?.expectedPerYear),
      Number(task?.expected_per_year)
    ];
    let expected = candidates.find(val => isFinite(val) && val > 0);
    if (!isFinite(expected) || expected <= 0){
      const perMonth = Number(task?.expectedPerMonth);
      if (isFinite(perMonth) && perMonth > 0) expected = perMonth * 12;
    }
    if (!isFinite(expected) || expected <= 0){
      const perQuarter = Number(task?.expectedPerQuarter);
      if (isFinite(perQuarter) && perQuarter > 0) expected = perQuarter * 4;
    }
    if (!isFinite(expected) || expected <= 0) return sum;
    return sum + (price * expected);
  }, 0);

  const asReqAnnualActual = maintenanceSpendSince(365);
  const asReqAnnualProjection = asReqAnnualActual > 0 ? asReqAnnualActual : expectedAsReqAnnualFromTasks;

  const hoursAtDate = (targetDate)=>{
    if (!parsedHistory.length) return null;
    const target = targetDate.getTime();
    let best = null;
    for (const entry of parsedHistory){
      const t = entry.date.getTime();
      if (t > target) break;
      best = entry;
    }
    return best ? Number(best.hours) : null;
  };

  const usageSinceDays = (days)=>{
    if (!isFinite(days) || days <= 0 || !parsedHistory.length) return 0;
    const now = new Date();
    now.setHours(0,0,0,0);
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    const startHours = hoursAtDate(start);
    const baseline = parsedHistory[0];
    const compareHours = startHours != null ? startHours : (baseline ? baseline.hours : currentHours);
    if (compareHours == null || !isFinite(compareHours)) return 0;
    return Math.max(0, Number(currentHours || 0) - Number(compareHours));
  };

  const determineBaselineDailyHours = ()=>{
    const windows = [30, 90, 180, 365];
    for (const days of windows){
      const usage = usageSinceDays(days);
      if (usage > 0) return usage / days;
    }
    return 0;
  };

  const baselineDailyHours = determineBaselineDailyHours();
  const hoursYear = usageSinceDays(365);
  const baselineAnnualHours = baselineDailyHours * 365;
  const hoursForRate = hoursYear > 0 ? hoursYear : (baselineAnnualHours > 0 ? baselineAnnualHours : 0);
  const asReqCostPerHour = (asReqAnnualProjection > 0 && hoursForRate > 0)
    ? asReqAnnualProjection / hoursForRate
    : 0;
  const combinedCostPerHour = intervalCostPerHour + asReqCostPerHour;

  const predictedIntervalAnnual = (intervalCostPerHour > 0 && baselineAnnualHours > 0)
    ? intervalCostPerHour * baselineAnnualHours
    : 0;
  const predictedAsReqAnnual = baselineAnnualHours > 0
    ? asReqCostPerHour * baselineAnnualHours
    : asReqAnnualProjection;
  const predictedAnnual = predictedIntervalAnnual + predictedAsReqAnnual;

  const intervalActualYear = estimateIntervalCost(hoursYear);
  const combinedActualYear = intervalActualYear + asReqAnnualActual;

  const timeframeDefs = [
    { key: "year",   label: "Past 12 months", days: 365 },
    { key: "six",    label: "Past 6 months",  days: 182 },
    { key: "quarter",label: "Past 3 months",  days: 92  },
    { key: "month",  label: "Past 30 days",   days: 30  }
  ];

  const timeframeRowsRaw = timeframeDefs.map(def => {
    const hours = usageSinceDays(def.days);
    const intervalActual = estimateIntervalCost(hours);
    const asReqActual = maintenanceSpendSince(def.days);
    const intervalProjected = (baselineDailyHours > 0 && intervalCostPerHour > 0)
      ? intervalCostPerHour * baselineDailyHours * def.days
      : 0;
    const asReqProjected = asReqAnnualProjection > 0
      ? (asReqAnnualProjection / 365) * def.days
      : 0;
    return {
      key: def.key,
      label: def.label,
      days: def.days,
      hours,
      intervalActual,
      asReqActual,
      intervalProjected,
      asReqProjected,
      costActual: intervalActual + asReqActual,
      costProjected: intervalProjected + asReqProjected
    };
  });

  const maintenanceHistory = [];
  for (let i=1; i<parsedHistory.length; i++){
    const prev = parsedHistory[i-1];
    const curr = parsedHistory[i];
    const deltaHours = Number(curr.hours) - Number(prev.hours);
    if (!isFinite(deltaHours) || deltaHours <= 0) continue;
    maintenanceHistory.push({
      date: curr.date,
      dateISO: curr.dateISO,
      hours: deltaHours,
      cost: combinedCostPerHour > 0
        ? deltaHours * combinedCostPerHour
        : estimateIntervalCost(deltaHours)
    });
  }

  const formatHoursLabel = (hours)=>{
    if (!Number.isFinite(hours) || hours <= 0) return null;
    if (hours >= 10){
      return Math.round(hours).toLocaleString();
    }
    const rounded = Math.round(hours * 10) / 10;
    const hasFraction = Math.abs(rounded - Math.round(rounded)) > 1e-6;
    return rounded.toLocaleString(undefined, {
      minimumFractionDigits: hasFraction ? 1 : 0,
      maximumFractionDigits: hasFraction ? 1 : 0
    });
  };

  const maintenanceSeries = maintenanceHistory.slice(-16).map(entry => {
    const dateLabel = (entry.date instanceof Date && !Number.isNaN(entry.date.getTime()))
      ? entry.date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      : "the latest log";
    const hoursLabel = formatHoursLabel(entry.hours);
    const hoursFragment = hoursLabel
      ? `${hoursLabel} machine ${Math.abs(entry.hours - 1) < 0.01 ? "hour" : "hours"}`
      : "recent machine usage";
    return {
      date: entry.date,
      value: entry.cost,
      detail: `Estimated maintenance dollars allocated to ${hoursFragment} logged on ${dateLabel}.`
    };
  });

  const jobsInfo = [];
  const jobSeriesRaw = [];
  let totalGainLoss = 0;
  let completedCount = 0;

  const completedJobsList = Array.isArray(completedCuttingJobs) ? completedCuttingJobs : [];
  if (completedJobsList.length){
    for (const job of completedJobsList){
      if (!job) continue;
      const eff = job.efficiency || (typeof computeJobEfficiency === "function" ? computeJobEfficiency(job) : null);
      const gainLoss = eff && Number.isFinite(eff.gainLoss) ? Number(eff.gainLoss) : 0;
      const deltaHours = eff && Number.isFinite(eff.deltaHours) ? Number(eff.deltaHours) : 0;
      let date = null;
      if (job.completedAtISO){
        const completedDate = parseDateLocal(job.completedAtISO) || new Date(job.completedAtISO);
        if (completedDate instanceof Date && !Number.isNaN(completedDate.getTime())){
          date = completedDate;
        }
      }
      if (!date && job.dueISO){
        const due = parseDateLocal(job.dueISO);
        if (due) date = due;
      }
      if (!date && job.startISO){
        const start = parseDateLocal(job.startISO);
        if (start) date = start;
      }
      if (!date){
        const fallback = parsedHistory.length ? parsedHistory[parsedHistory.length-1].date : new Date();
        date = new Date(fallback);
      }
      const milestone = job.completedAtISO
        ? parseDateLocal(job.completedAtISO) || new Date(job.completedAtISO)
        : parseDateLocal(job.dueISO || job.startISO || "");
      const milestoneLabel = (milestone instanceof Date && !Number.isNaN(milestone))
        ? milestone.toLocaleDateString()
        : "—";
      let statusDetail = "Finished on estimate";
      if (Math.abs(deltaHours) > 0.1){
        const prefix = deltaHours > 0 ? "Finished ahead" : "Finished behind";
        statusDetail = `${prefix} (${deltaHours>0?"+":"-"}${Math.abs(deltaHours).toFixed(1)} hr)`;
      }

      jobsInfo.push({
        name: job.name || "Untitled job",
        date,
        milestoneLabel,
        gainLoss,
        status: "Completed",
        statusDetail
      });

      if (date instanceof Date && !Number.isNaN(date.getTime())){
        jobSeriesRaw.push({ date, rawValue: gainLoss, label: job.name || "Job" });
      }

      totalGainLoss += gainLoss;
      completedCount += 1;
    }
  }

  if (Array.isArray(cuttingJobs)){
    for (const job of cuttingJobs){
      if (!job) continue;
      const eff = typeof computeJobEfficiency === "function" ? computeJobEfficiency(job) : { gainLoss:0, deltaHours:0 };
      const gainLoss = Number(eff?.gainLoss) || 0;
      const deltaHours = Number(eff?.deltaHours) || 0;
      let date = null;
      if (job.dueISO){
        const due = parseDateLocal(job.dueISO);
        if (due) date = due;
      }
      if (!date && job.startISO){
        const start = parseDateLocal(job.startISO);
        if (start) date = start;
      }
      if (!date){
        const fallback = parsedHistory.length ? parsedHistory[parsedHistory.length-1].date : new Date();
        date = new Date(fallback);
      }
      const status = deltaHours > 0.1 ? "Ahead" : (deltaHours < -0.1 ? "Behind" : "On pace");
      const statusDetail = deltaHours ? `${deltaHours>0?"+":"-"}${Math.abs(deltaHours).toFixed(1)} hr` : "Balanced";
      const milestoneDate = job.dueISO || job.startISO || "";
      let milestoneLabel = "—";
      if (milestoneDate){
        const milestone = parseDateLocal(milestoneDate);
        if (milestone) milestoneLabel = milestone.toLocaleDateString();
      }

      jobsInfo.push({
        name: job.name || "Untitled job",
        date,
        milestoneLabel,
        gainLoss,
        status,
        statusDetail
      });
    }
  }

  const jobSeriesSorted = jobSeriesRaw.slice().sort((a,b)=> a.date - b.date);
  const jobSeries = [];
  if (jobSeriesSorted.length){
    let cumulative = 0;
    jobSeriesSorted.forEach((pt, idx)=>{
      cumulative += pt.rawValue;
      const rollingValue = cumulative / (idx + 1);
      const dateLabel = (pt.date instanceof Date && !Number.isNaN(pt.date.getTime()))
        ? pt.date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
        : "the latest completed job";
      const jobCount = idx + 1;
      jobSeries.push({
        date: pt.date,
        value: rollingValue,
        count: jobCount,
        detail: `Rolling average profit per cutting job across ${jobCount} completed job${jobCount === 1 ? "" : "s"} through ${dateLabel}.`
      });
    });
  }

  const jobCount = completedCount;
  const averageGainLoss = jobCount ? (totalGainLoss / jobCount) : 0;

  const formatterCurrency = (value, { showPlus=false, decimals=null } = {})=>{
    const absVal = Math.abs(value);
    const fractionDigits = decimals != null ? decimals : (absVal < 1000 ? 2 : 0);
    const formatted = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits
    }).format(absVal);
    if (value < 0) return `-${formatted}`;
    if (value > 0 && showPlus) return `+${formatted}`;
    return formatted;
  };

  const formatHours = (hours)=>{
    if (!isFinite(hours) || hours <= 0) return "0 hr";
    const decimals = hours >= 100 ? 0 : 1;
    return `${hours.toFixed(decimals)} hr`;
  };

  const timeframeRows = timeframeRowsRaw.map(row => ({
    key: row.key,
    label: row.label,
    hoursLabel: formatHours(row.hours),
    costLabel: formatterCurrency(row.costActual, { decimals: row.costActual < 1000 ? 2 : 0 }),
    projectedLabel: formatterCurrency(row.costProjected, { decimals: row.costProjected < 1000 ? 2 : 0 })
  }));

  const historyRows = maintenanceHistory.slice(-6).reverse().map(entry => ({
    dateLabel: entry.date.toLocaleDateString(),
    hoursLabel: formatHours(entry.hours),
    costLabel: formatterCurrency(entry.cost, { decimals: entry.cost < 1000 ? 2 : 0 })
  }));

  const jobBreakdown = jobsInfo
    .slice()
    .sort((a,b)=> b.date - a.date)
    .map(job => ({
      name: job.name,
      dateLabel: job.milestoneLabel || job.date.toLocaleDateString(),
      statusLabel: job.status === "On pace" ? job.status : `${job.status} (${job.statusDetail})`,
      costLabel: formatterCurrency(job.gainLoss, { showPlus: true, decimals: Math.abs(job.gainLoss) < 1000 ? 2 : 0 })
    }));

  const rateParts = [];
  if (intervalCostPerHour > 0){
    rateParts.push(`Interval ${formatterCurrency(intervalCostPerHour, { decimals: 2 })}/hr`);
  }
  if (asReqCostPerHour > 0){
    const sourceLabel = asReqAnnualActual > 0
      ? "12-mo approved orders"
      : (expectedAsReqAnnualFromTasks > 0 ? "task estimates" : "as-required rate");
    rateParts.push(`As-required ${formatterCurrency(asReqCostPerHour, { decimals: 2 })}/hr (${sourceLabel})`);
  }
  if (baselineDailyHours > 0){
    rateParts.push(`${baselineDailyHours.toFixed(1)} hr/day baseline`);
  }

  let maintenanceHint;
  if (!rateParts.length){
    maintenanceHint = "Add prices, part numbers, and approved orders to interval or as-required tasks to project maintenance spend.";
  }else{
    maintenanceHint = `${rateParts.join(" · ")}. Actual last 12 months: ${formatterCurrency(combinedActualYear, { decimals: combinedActualYear < 1000 ? 2 : 0 })}.`;
  }

  const summaryCards = [
    {
      icon: "🛠️",
      title: "Maintenance forecast (interval + as-required)",
      value: formatterCurrency(predictedAnnual, { decimals: 0 }),
      hint: maintenanceHint
    },
    {
      icon: "✂️",
      title: "Cutting jobs efficiency",
      value: formatterCurrency(totalGainLoss, { decimals: 0, showPlus: true }),
      hint: jobCount
        ? `Average gain/loss ${formatterCurrency(averageGainLoss, { decimals: 0, showPlus: true })} across ${jobCount} completed job${jobCount===1?"":"s"}.`
        : "No cutting jobs logged yet."
    },
    {
      icon: "📊",
      title: "Combined estimated impact",
      value: formatterCurrency(predictedAnnual + totalGainLoss, { decimals: 0, showPlus: true }),
      hint: "Maintenance forecast plus cutting job efficiency impact."
    }
  ];

  const jobSummary = {
    countLabel: jobCount ? `${jobCount} completed` : "0",
    totalLabel: formatterCurrency(totalGainLoss, { decimals: 0, showPlus: true }),
    averageLabel: formatterCurrency(averageGainLoss, { decimals: 0, showPlus: true }),
    rollingLabel: jobSeries.length
      ? formatterCurrency(jobSeries[jobSeries.length-1].value, { decimals: 0, showPlus: true })
      : formatterCurrency(0, { decimals: 0 })
  };

  const maintenanceJobs = [];

  const maintenanceJobsNote = "Maintenance job tracker will consolidate every job once the Jobs integration is complete.";
  const maintenanceJobsEmpty = "Tracker setup is in progress. This space will list all maintenance jobs when the data wiring is finished.";

  let timeframeNote;
  if (maintenanceOrderItems.length){
    timeframeNote = "Actual spend combines interval allocations with approved maintenance orders matched to your task part numbers.";
  }else if (asReqAnnualProjection > 0 && expectedAsReqAnnualFromTasks > 0){
    timeframeNote = "Projections include interval pricing plus expected as-required frequency captured on task settings. Add approved orders to validate the forecast.";
  }else{
    timeframeNote = "Add prices, part numbers, or expected frequency to interval/as-required tasks to build the combined maintenance forecast.";
  }
  const historyEmpty = parsedHistory.length
    ? "Log additional machine hours to expand the maintenance cost timeline."
    : "No usage history yet. Log machine hours to estimate maintenance spend.";
  const jobEmpty = "Add cutting jobs with estimates to build the efficiency tracker.";

  const chartNote = `Maintenance line allocates interval pricing plus as-required spend per logged hour (${asReqAnnualActual > 0 ? "derived from approved orders" : "using task estimates when orders are unavailable"}); cutting jobs line shows the rolling average gain/loss at ${formatterCurrency(JOB_RATE_PER_HOUR, { decimals: 0 })}/hr.`;

  const orderSorted = orderHistory.slice().sort((a,b)=>{
    const aTime = new Date(a.resolvedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.resolvedAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
  let totalApprovedOrders = 0;
  const orderRows = orderSorted.map(req => {
    const approved = Array.isArray(req.items)
      ? req.items.reduce((sum, item)=> item && item.status === "approved" ? sum + orderItemLineTotal(item) : sum, 0)
      : 0;
    const requested = Array.isArray(req.items)
      ? req.items.reduce((sum, item)=> sum + orderItemLineTotal(item), 0)
      : 0;
    totalApprovedOrders += approved;
    const resolvedISO = req.resolvedAt || req.createdAt || null;
    const resolved = resolvedISO ? parseDateLocal(resolvedISO) : null;
    const resolvedLabel = resolved ? resolved.toLocaleDateString() : "—";
    let statusLabel = "Pending";
    if (req.status === "approved") statusLabel = "Approved";
    else if (req.status === "denied") statusLabel = "Denied";
    else if (req.status === "partial") statusLabel = "Partial";
    return {
      id: req.id,
      code: req.code || req.id || "Order",
      resolvedLabel,
      statusLabel,
      approvedLabel: formatterCurrency(approved, { decimals: approved < 1000 ? 2 : 0 }),
      requestedLabel: formatterCurrency(requested, { decimals: requested < 1000 ? 2 : 0 })
    };
  });

  const orderRequestSummary = {
    totalApprovedLabel: formatterCurrency(totalApprovedOrders, { decimals: totalApprovedOrders < 1000 ? 2 : 0 }),
    requestCountLabel: String(orderRows.length),
    rows: orderRows.slice(0, 6),
    emptyMessage: orderRows.length ? "" : "Approve or deny order requests to build the spend log."
  };

  return {
    summaryCards,
    timeframeRows,
    timeframeNote,
    historyRows,
    historyEmpty,
    jobSummary,
    jobBreakdown,
    jobEmpty,
    maintenanceJobs,
    maintenanceJobsNote,
    maintenanceJobsEmpty,
    chartNote,
    orderRequestSummary,
    chartColors: COST_CHART_COLORS,
    maintenanceSeries,
    jobSeries
  };
}

function drawCostChart(canvas, model, show){
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const hitTargets = [];
  canvas.__costChartTargets = hitTargets;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0,0,W,H);

  const active = [];
  if (show.maintenance && model.maintenanceSeries.length){
    active.push({ key:"maintenance", color:model.chartColors.maintenance, points:model.maintenanceSeries });
  }
  if (show.jobs && model.jobSeries.length){
    active.push({ key:"jobs", color:model.chartColors.jobs, points:model.jobSeries });
  }

  if (!active.length){
    canvas.__costChartTargets = [];
    ctx.fillStyle = "#777";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Enable a dataset or add history to plot cost trends.", W/2, H/2);
    return;
  }

  const xs = [];
  const ys = [];
  active.forEach(series => {
    series.points.forEach(pt => {
      if (!(pt.date instanceof Date) || isNaN(pt.date)) return;
      xs.push(pt.date.getTime());
      ys.push(Number(pt.value));
    });
  });

  if (!xs.length){
    canvas.__costChartTargets = [];
    ctx.fillStyle = "#777";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No dated data points available yet.", W/2, H/2);
    return;
  }

  let xMin = Math.min(...xs);
  let xMax = Math.max(...xs);
  if (xMax === xMin){
    xMin -= 24*60*60*1000;
    xMax += 24*60*60*1000;
  }

  let yMin = Math.min(...ys, 0);
  let yMax = Math.max(...ys, 0);
  if (yMax === yMin){
    yMin -= 1;
    yMax += 1;
  }else{
    const pad = (yMax - yMin) * 0.1;
    yMin -= pad;
    yMax += pad;
  }

  const left = 70;
  const right = W - 20;
  const top = 20;
  const bottom = H - 40;
  const X = (time)=> left + ((time - xMin) / Math.max(1, xMax - xMin)) * (right - left);
  const Y = (value)=> bottom - ((value - yMin) / Math.max(1e-6, yMax - yMin)) * (bottom - top);

  const formatMoney = (value)=>{
    const absVal = Math.abs(value);
    const decimals = absVal < 1000 ? 2 : 0;
    const formatted = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(absVal);
    if (value < 0) return `-${formatted}`;
    if (value > 0) return `+${formatted}`;
    return formatted;
  };

  ctx.font = "12px sans-serif";
  if (0 >= yMin && 0 <= yMax){
    const zeroY = Y(0);
    ctx.strokeStyle = "#d0d5e2";
    ctx.setLineDash([4,4]);
    ctx.beginPath();
    ctx.moveTo(left, zeroY);
    ctx.lineTo(right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#666";
    ctx.textAlign = "right";
    ctx.fillText("$0", right, zeroY - 4);
  }

  const yTickCount = Math.min(6, Math.max(3, Math.round((bottom - top) / 50)));
  if (yTickCount > 1){
    const yRange = yMax - yMin;
    ctx.textBaseline = "middle";
    for (let i = 0; i < yTickCount; i++){
      const ratio = (yTickCount === 1) ? 0 : i / (yTickCount - 1);
      const value = yMin + (yRange * ratio);
      const y = Y(value);
      ctx.strokeStyle = (i === 0 || i === yTickCount - 1) ? "#d0d5e2" : "#eef1f8";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.fillStyle = "#5b6271";
      ctx.textAlign = "right";
      ctx.fillText(formatMoney(value), left - 8, y);
    }
    ctx.textBaseline = "alphabetic";
  }

  ctx.strokeStyle = "#cbd2e3";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();

  const formatDateLabel = (date)=>{
    const opts = { month: "short", day: "numeric" };
    if (Math.abs(xMax - xMin) > 31557600000){ opts.year = "numeric"; }
    return date.toLocaleDateString(undefined, opts);
  };

  const xTickCount = Math.min(7, Math.max(2, Math.round((right - left) / 110)));
  ctx.textBaseline = "top";
  if (xTickCount > 1){
    const span = xMax - xMin;
    for (let i = 0; i < xTickCount; i++){
      const time = xMin + (span * i / (xTickCount - 1));
      const x = X(time);
      ctx.strokeStyle = "#f1f3f9";
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.fillStyle = "#5b6271";
      ctx.textAlign = "center";
      ctx.fillText(formatDateLabel(new Date(time)), x, H - 20);
    }
  }else{
    ctx.fillStyle = "#5b6271";
    ctx.textAlign = "left";
    ctx.fillText(formatDateLabel(new Date(xMin)), left, H - 20);
    ctx.textAlign = "right";
    ctx.fillText(formatDateLabel(new Date(xMax)), right, H - 20);
  }
  ctx.textBaseline = "alphabetic";

  active.forEach(series => {
    const points = series.points
      .filter(pt => pt.date instanceof Date && !isNaN(pt.date))
      .sort((a,b)=> a.date - b.date);
    if (!points.length) return;
    ctx.strokeStyle = series.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((pt, idx)=>{
      const x = X(pt.date.getTime());
      const y = Y(Number(pt.value));
      if (idx === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();

    ctx.fillStyle = series.color;
    points.forEach(pt => {
      const x = X(pt.date.getTime());
      const y = Y(Number(pt.value));
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI*2);
      ctx.fill();
    });

    const last = points[points.length - 1];
    if (last){
      const x = X(last.date.getTime());
      const y = Y(Number(last.value));
      const label = `${series.key === "maintenance" ? "Maintenance" : "Cutting jobs"} ${formatMoney(Number(last.value))}`;
      ctx.font = "12px sans-serif";
      const metrics = ctx.measureText(label);
      const paddingX = 6;
      const boxWidth = metrics.width + paddingX * 2;
      const boxHeight = 18;
      let boxX = Math.min(right - boxWidth, Math.max(left, x + 10));
      let boxY = Math.max(top + boxHeight, y - boxHeight - 6);
      boxY = Math.min(bottom - 4, boxY);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(boxX, boxY - boxHeight, boxWidth, boxHeight);
      ctx.strokeStyle = series.color;
      ctx.strokeRect(boxX, boxY - boxHeight, boxWidth, boxHeight);
      ctx.fillStyle = "#1f2937";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, boxX + paddingX, boxY - (boxHeight / 2));
      ctx.textBaseline = "alphabetic";

      const datasetLabel = series.key === "maintenance" ? "Maintenance" : "Cutting jobs";
      const valueLabel = formatMoney(Number(last.value));
      const dateLabel = (last.date instanceof Date && !Number.isNaN(last.date.getTime()))
        ? last.date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
        : "the latest update";
      let detail = (typeof last.detail === "string" && last.detail.trim()) ? last.detail.trim() : "";
      if (!detail){
        detail = series.key === "maintenance"
          ? `Estimated maintenance dollars allocated to hours logged on ${dateLabel}.`
          : `Rolling average profit per cutting job through ${dateLabel}.`;
      }
      hitTargets.push({
        key: series.key,
        datasetLabel,
        valueLabel,
        detail,
        rect: { x: boxX, y: boxY - boxHeight, width: boxWidth, height: boxHeight }
      });
    }
  });

  canvas.__costChartTargets = hitTargets;
}


function renderJobs(){
  const content = document.getElementById("content");
  if (!content) return;
  setAppSettingsContext("default");
  wireDashboardSettingsMenu();

  // 1) Render the jobs view (includes the table with the Actions column)
  content.innerHTML = viewJobs();

  const historyBtn = content.querySelector("[data-job-history-trigger]");
  if (historyBtn){
    historyBtn.addEventListener("click", ()=>{
      const target = document.getElementById("pastJobs");
      if (!target) return;
      const restoreTabindex = !target.hasAttribute("tabindex");
      if (restoreTabindex){
        target.setAttribute("tabindex", "-1");
        target.dataset.tempTabindex = "1";
      }
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      try {
        target.focus({ preventScroll: true });
      } catch (_) {
        // Fallback focus handling for browsers without focus options
        target.focus();
      }
      if (restoreTabindex){
        const cleanup = ()=>{
          if (!target.dataset.tempTabindex) return;
          delete target.dataset.tempTabindex;
          target.removeAttribute("tabindex");
        };
        target.addEventListener("blur", ()=> cleanup(), { once: true });
        setTimeout(()=> cleanup(), 1500);
      }
    });
  }

  const newFilesBtn = document.getElementById("jobFilesBtn");
  const newFilesInput = document.getElementById("jobFiles");
  newFilesBtn?.addEventListener("click", ()=>{ newFilesInput?.click(); });
  newFilesInput?.addEventListener("change", async (e)=>{
    const files = e.target.files;
    if (!files || !files.length) return;
    const attachments = await filesToAttachments(files);
    e.target.value = "";
    if (!attachments.length) return;
    pendingNewJobFiles.push(...attachments.map(a=>({ ...a })));
    toast(`${attachments.length} file${attachments.length===1?"":"s"} added`);
    renderJobs();
  });

  // 2) Small, scoped helpers for manual log math + defaults
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
    const attachments = pendingNewJobFiles.map(f=>({ ...f }));
    cuttingJobs.push({ id: genId(name), name, estimateHours:est, startISO:start, dueISO:due, material:"", notes:"", manualLogs:[], files:attachments });
    pendingNewJobFiles.length = 0;
    saveCloudDebounced(); renderJobs();
  });

  // 5) Inline material $/qty (kept)
  content.querySelector("tbody")?.addEventListener("change", async (e)=>{
    if (e.target.matches("input[data-job-file-input]")){
      const id = e.target.getAttribute("data-job-file-input");
      const j = cuttingJobs.find(x=>x.id===id);
      if (!j){ e.target.value = ""; return; }
      const attachments = await filesToAttachments(e.target.files);
      e.target.value = "";
      if (!attachments.length) return;
      j.files = Array.isArray(j.files) ? j.files : [];
      attachments.forEach(att=> j.files.push({ ...att }));
      saveCloudDebounced();
      toast(`${attachments.length} file${attachments.length===1?"":"s"} added`);
      renderJobs();
    }
  });

  const historyBody = content.querySelector(".past-jobs-table tbody");
  historyBody?.addEventListener("click", (e)=>{
    const histEdit = e.target.closest("[data-history-edit]");
    const histCancel = e.target.closest("[data-history-cancel]");
    const histSave = e.target.closest("[data-history-save]");
    const histDelete = e.target.closest("[data-history-delete]");

    if (histEdit){
      const id = histEdit.getAttribute("data-history-edit");
      if (id != null){ editingCompletedJobsSet().add(String(id)); renderJobs(); }
      return;
    }

    if (histCancel){
      const id = histCancel.getAttribute("data-history-cancel");
      if (id != null){ editingCompletedJobsSet().delete(String(id)); renderJobs(); }
      return;
    }

    if (histDelete){
      const id = histDelete.getAttribute("data-history-delete");
      if (!id) return;
      const proceed = typeof window.confirm === "function"
        ? window.confirm("Delete this completed job entry?")
        : true;
      if (!proceed) return;
      const idStr = String(id);
      completedCuttingJobs = completedCuttingJobs.filter(job => String(job?.id) !== idStr);
      window.completedCuttingJobs = completedCuttingJobs;
      editingCompletedJobsSet().delete(idStr);
      saveCloudDebounced();
      toast("History entry deleted");
      renderJobs();
      return;
    }

    if (histSave){
      const id = histSave.getAttribute("data-history-save");
      if (!id) return;
      const entry = completedCuttingJobs.find(job => String(job?.id) === String(id));
      if (!entry) return;
      const field = (key)=> content.querySelector(`[data-history-field="${key}"][data-history-id="${id}"]`);
      const nameInput = field("name");
      const estimateInput = field("estimateHours");
      const actualInput = field("actualHours");
      const materialInput = field("material");
      const materialCostInput = field("materialCost");
      const materialQtyInput = field("materialQty");
      const notesInput = field("notes");
      const completedInput = field("completedAtISO");

      const name = (nameInput?.value || entry.name || "").trim();
      if (!name){ toast("Enter a job name."); return; }

      const estVal = estimateInput?.value;
      const estNum = estVal === "" || estVal == null ? null : Number(estVal);
      const estimateHours = Number.isFinite(estNum) && estNum >= 0 ? estNum : Number(entry.estimateHours) || 0;

      const actVal = actualInput?.value;
      const actualNum = actVal === "" || actVal == null ? null : Number(actVal);
      const actualHours = Number.isFinite(actualNum) && actualNum >= 0 ? actualNum : null;

      const material = materialInput?.value ?? entry.material ?? "";
      const materialCostVal = materialCostInput?.value;
      const materialCostNum = materialCostVal === "" || materialCostVal == null ? null : Number(materialCostVal);
      const materialCost = Number.isFinite(materialCostNum) && materialCostNum >= 0 ? materialCostNum : Number(entry.materialCost) || 0;

      const materialQtyVal = materialQtyInput?.value;
      const materialQtyNum = materialQtyVal === "" || materialQtyVal == null ? null : Number(materialQtyVal);
      const materialQty = Number.isFinite(materialQtyNum) && materialQtyNum >= 0 ? materialQtyNum : Number(entry.materialQty) || 0;

      const notes = notesInput?.value ?? entry.notes ?? "";

      const completedRaw = completedInput?.value;
      if (completedRaw){
        const dt = new Date(completedRaw);
        if (!Number.isNaN(dt.getTime())) entry.completedAtISO = dt.toISOString();
      }

      entry.name = name;
      entry.estimateHours = estimateHours;
      entry.material = material;
      entry.materialCost = materialCost;
      entry.materialQty = materialQty;
      entry.notes = notes;
      entry.actualHours = actualHours != null ? actualHours : null;

      const rate = Number(entry.efficiency?.rate) || JOB_RATE_PER_HOUR;
      const deltaHours = actualHours != null ? (estimateHours - actualHours) : (entry.efficiency?.deltaHours ?? null);
      const gainLoss = deltaHours != null ? deltaHours * rate : (entry.efficiency?.gainLoss ?? null);

      entry.efficiency = {
        ...entry.efficiency,
        rate,
        expectedHours: estimateHours,
        actualHours: entry.actualHours,
        expectedRemaining: 0,
        actualRemaining: 0,
        deltaHours,
        gainLoss
      };

      editingCompletedJobsSet().delete(String(id));
      saveCloudDebounced();
      toast("History updated");
      renderJobs();
    }
  });

  // 6) Edit/Remove/Save/Cancel + Log panel + Apply spent/remaining
  content.querySelector("tbody")?.addEventListener("click",(e)=>{
    const locked = e.target.closest("[data-requires-edit]");
    if (locked){
      const id = locked.getAttribute("data-requires-edit");
      if (!id) return;
      const proceed = window.confirm ? window.confirm("Open edit mode to update this job?") : true;
      if (proceed){ editingJobs.add(id); renderJobs(); }
      return;
    }

    const upload = e.target.closest("[data-upload-job]");
    if (upload){
      const id = upload.getAttribute("data-upload-job");
      content.querySelector(`input[data-job-file-input="${id}"]`)?.click();
      return;
    }

    const removeFile = e.target.closest("[data-remove-file]");
    if (removeFile){
      const id = removeFile.getAttribute("data-remove-file");
      const idx = Number(removeFile.getAttribute("data-file-index"));
      const j = cuttingJobs.find(x=>x.id===id);
      if (j && Array.isArray(j.files) && idx>=0 && idx<j.files.length){
        j.files.splice(idx,1);
        saveCloudDebounced();
        toast("File removed");
        renderJobs();
      }
      return;
    }

    const ed = e.target.closest("[data-edit-job]");
    const rm = e.target.closest("[data-remove-job]");
    const sv = e.target.closest("[data-save-job]");
    const ca = e.target.closest("[data-cancel-job]");
    const lg = e.target.closest("[data-log-job]");
    const complete = e.target.closest("[data-complete-job]");
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

    if (complete){
      const id = complete.getAttribute("data-complete-job");
      const idx = cuttingJobs.findIndex(x=>x.id===id);
      if (idx < 0) return;
      const job = cuttingJobs[idx];
      const eff = typeof computeJobEfficiency === "function" ? computeJobEfficiency(job) : null;
      const now = new Date();
      const completionISO = now.toISOString();
      const efficiencySummary = eff ? {
        rate: eff.rate ?? JOB_RATE_PER_HOUR,
        expectedHours: eff.expectedHours ?? null,
        actualHours: eff.actualHours ?? null,
        expectedRemaining: eff.expectedRemaining ?? null,
        actualRemaining: eff.actualRemaining ?? null,
        deltaHours: eff.deltaHours ?? null,
        gainLoss: eff.gainLoss ?? null
      } : {
        rate: JOB_RATE_PER_HOUR,
        expectedHours: null,
        actualHours: null,
        expectedRemaining: null,
        actualRemaining: null,
        deltaHours: null,
        gainLoss: null
      };

      const completed = {
        id: job.id,
        name: job.name,
        estimateHours: job.estimateHours,
        startISO: job.startISO,
        dueISO: job.dueISO,
        completedAtISO: completionISO,
        notes: job.notes || "",
        material: job.material || "",
        materialCost: Number(job.materialCost)||0,
        materialQty: Number(job.materialQty)||0,
        manualLogs: Array.isArray(job.manualLogs) ? job.manualLogs.slice() : [],
        files: Array.isArray(job.files) ? job.files.map(f=>({ ...f })) : [],
        actualHours: eff && Number.isFinite(eff.actualHours) ? eff.actualHours : null,
        efficiency: efficiencySummary
      };

      completedCuttingJobs.push(completed);
      cuttingJobs.splice(idx, 1);
      editingJobs.delete(id);
      saveCloudDebounced();
      toast("Job marked complete");
      renderJobs();
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
      j.materialCost = Math.max(0, Number(qs("materialCost")) || 0);
      j.materialQty = Math.max(0, Number(qs("materialQty")) || 0);
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
        <td colspan="5">
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
  setAppSettingsContext("default");
  wireDashboardSettingsMenu();
  content.innerHTML = viewInventory();
  const rowsTarget = content.querySelector("[data-inventory-rows]");
  const searchInput = content.querySelector("#inventorySearch");
  const clearBtn = content.querySelector("#inventorySearchClear");
  const addBtn = content.querySelector("#inventoryAddBtn");
  const modal = content.querySelector("#inventoryAddModal");
  const form = content.querySelector("#inventoryAddForm");
  const closeBtn = modal?.querySelector("[data-close]");
  const backBtn = modal?.querySelector("[data-back]");
  const chooseMaintenance = modal?.querySelector("[data-choose=\"maintenance\"]");
  const chooseInventoryOnly = modal?.querySelector("[data-choose=\"inventory\"]");
  const maintenanceNote = modal?.querySelector("[data-maintenance-note]");
  const stepSections = modal ? Array.from(modal.querySelectorAll("[data-step]")) : [];
  const nameField = modal?.querySelector("[name=\"inventoryName\"]");
  const qtyField = modal?.querySelector("[name=\"inventoryQty\"]");
  let addToMaintenance = false;

  const refreshRows = ()=>{
    if (!rowsTarget) return;
    const filtered = filterInventoryItems(inventorySearchTerm);
    rowsTarget.innerHTML = inventoryRowsHTML(filtered);
  };

  if (searchInput){
    searchInput.addEventListener("input", ()=>{
      inventorySearchTerm = searchInput.value;
      window.inventorySearchTerm = inventorySearchTerm;
      refreshRows();
    });
  }

  if (clearBtn){
    clearBtn.addEventListener("click", ()=>{
      if (!inventorySearchTerm) return;
      inventorySearchTerm = "";
      window.inventorySearchTerm = "";
      if (searchInput) searchInput.value = "";
      refreshRows();
      searchInput?.focus();
    });
  }

  rowsTarget?.addEventListener("input",(e)=>{
    const input = e.target;
    const id = input.getAttribute("data-id");
    const k  = input.getAttribute("data-inv");
    const item = inventory.find(x=>x.id===id); if (!item) return;
    if (k==="qty"){ item.qty = Math.max(0, Number(input.value)||0); }
    else if (k==="note"){ item.note = input.value; }
    else if (k==="price"){ const val = input.value.trim(); item.price = val === "" ? null : Math.max(0, Number(val)||0); }
    saveCloudDebounced();
  });

  rowsTarget?.addEventListener("click", async (e)=>{
    const deleteBtn = e.target.closest("[data-inventory-delete]");
    if (deleteBtn){
      const id = deleteBtn.getAttribute("data-inventory-delete");
      if (!id) return;
      const removed = await deleteInventoryItem(id);
      if (removed) refreshRows();
      return;
    }

    const addBtn = e.target.closest("[data-order-add]");
    if (!addBtn) return;
    const id = addBtn.getAttribute("data-order-add");
    if (!id) return;
    addInventoryItemToOrder(id);
  });

  function setInventoryModalStep(step){
    stepSections.forEach(section => {
      if (!section) return;
      section.hidden = section.dataset.step !== step;
    });
    if (step === "form"){
      if (maintenanceNote) maintenanceNote.hidden = !addToMaintenance;
      requestAnimationFrame(()=>{
        nameField?.focus();
        if (nameField && typeof nameField.setSelectionRange === "function"){
          const len = nameField.value.length;
          nameField.setSelectionRange(len, len);
        }
      });
    }
  }

  function openInventoryModal(){
    if (!modal) return;
    addToMaintenance = false;
    setInventoryModalStep("prompt");
    modal.classList.add("is-visible");
    modal.removeAttribute("hidden");
    document.body?.classList.add("modal-open");
    form?.reset();
    if (qtyField) qtyField.value = qtyField.defaultValue || "1";
  }

  function closeInventoryModal(){
    if (!modal) return;
    modal.classList.remove("is-visible");
    modal.setAttribute("hidden", "");
    document.body?.classList.remove("modal-open");
    addToMaintenance = false;
    form?.reset();
    if (qtyField) qtyField.value = qtyField.defaultValue || "1";
  }

  addBtn?.addEventListener("click", openInventoryModal);
  closeBtn?.addEventListener("click", closeInventoryModal);
  backBtn?.addEventListener("click", ()=> setInventoryModalStep("prompt"));
  modal?.addEventListener("click", (e)=>{ if (e.target === modal) closeInventoryModal(); });

  chooseMaintenance?.addEventListener("click", ()=>{
    addToMaintenance = true;
    setInventoryModalStep("form");
  });

  chooseInventoryOnly?.addEventListener("click", ()=>{
    addToMaintenance = false;
    setInventoryModalStep("form");
  });

  form?.addEventListener("submit", (e)=>{
    e.preventDefault();
    if (!form) return;
    const data = new FormData(form);
    const name = (data.get("inventoryName") || "").toString().trim();
    if (!name){ toast("Enter an item name."); return; }
    const qtyRaw = data.get("inventoryQty");
    const qtyNum = qtyRaw === null || qtyRaw === "" ? 1 : Number(qtyRaw);
    if (!Number.isFinite(qtyNum) || qtyNum < 0){
      toast("Enter a valid quantity.");
      return;
    }
    const unit = (data.get("inventoryUnit") || "").toString().trim() || "pcs";
    const pn = (data.get("inventoryPN") || "").toString().trim();
    const link = (data.get("inventoryLink") || "").toString().trim();
    const priceRaw = data.get("inventoryPrice");
    let price = null;
    if (priceRaw !== null && priceRaw !== ""){
      const num = Number(priceRaw);
      if (!Number.isFinite(num) || num < 0){ toast("Enter a valid price."); return; }
      price = num;
    }
    const note = (data.get("inventoryNote") || "").toString().trim();

    const item = {
      id: genId("inventory"),
      name,
      qty: qtyNum,
      unit,
      pn,
      link,
      price,
      note
    };

    inventory.unshift(item);
    window.inventory = inventory;
    if (typeof saveCloudDebounced === "function"){ try { saveCloudDebounced(); } catch(_){} }
    toast("Inventory item added");
    refreshRows();
    const shouldOpenMaintenance = addToMaintenance;
    closeInventoryModal();

    const pendingDetails = shouldOpenMaintenance ? {
      name,
      pn,
      link,
      price,
      note
    } : null;

    if (pendingDetails){
      window.pendingMaintenanceAddFromInventory = pendingDetails;
      const hash = (location.hash || "#").toLowerCase();
      if (hash === "#/settings" || hash === "#settings"){
        renderSettings();
      }else{
        location.hash = "#/settings";
      }
    }
  });
}

function renderSignedOut(){
  const content = document.getElementById("content"); if (!content) return;
  setAppSettingsContext("default");
  wireDashboardSettingsMenu();
  content.innerHTML = `
    <div class='container signed-out-container'>
      <div class='block signed-out-message'>
        <h3>Sign in to view your workspace</h3>
        <p class='small'>Use your maintenance login to sync tasks, hours, and inventory across the shop.</p>
        <ul class='signed-out-tips'>
          <li>Track machine hours and log maintenance in one place.</li>
          <li>Share the same schedules, inventory, and orders with the team.</li>
          <li>Automatic backups keep your latest changes ready on any device.</li>
        </ul>
      </div>
    </div>`;
}

function formatOrderCurrency(value){
  const num = Number(value);
  if (!Number.isFinite(num)) return "$0.00";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

function orderItemLineTotal(item){
  if (!item) return 0;
  const price = Number(item.price);
  const qty = Number(item.qty);
  if (!Number.isFinite(price) || !Number.isFinite(qty)) return 0;
  return Math.max(0, price) * Math.max(0, qty);
}

function formatOrderDate(iso, { includeTime = false } = {}){
  if (!iso) return "—";
  const dt = parseDateLocal(iso) || new Date(iso);
  if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return "—";
  if (includeTime){
    return dt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }
  return dt.toLocaleDateString();
}

function computeOrderRequestModel(){
  const draft = ensureActiveOrderRequest();
  const existingIds = new Set(draft.items.map(item => item.id));
  orderPartialSelection.forEach(id => { if (!existingIds.has(id)) orderPartialSelection.delete(id); });

  const requestedTotal = draft.items.reduce((sum, item)=> sum + orderItemLineTotal(item), 0);
  const selectedTotal = draft.items.reduce((sum, item)=> orderPartialSelection.has(item.id) ? sum + orderItemLineTotal(item) : sum, 0);

  const activeModel = {
    id: draft.id,
    code: draft.code,
    created: formatOrderDate(draft.createdAt, { includeTime:true }),
    subtitle: draft.items.length ? `${draft.items.length} item${draft.items.length===1?"":"s"} ready for approval` : "Add parts from inventory to start a request.",
    items: draft.items.map(item => ({
      id: item.id,
      name: item.name || "",
      pn: item.pn || "",
      link: item.link || "",
      priceInput: item.price != null ? String(item.price) : "",
      qtyInput: item.qty != null ? String(item.qty) : "1",
      lineTotal: formatOrderCurrency(orderItemLineTotal(item)),
      selected: orderPartialSelection.has(item.id)
    })),
    total: formatOrderCurrency(requestedTotal),
    selectionTotal: selectedTotal > 0 ? formatOrderCurrency(selectedTotal) : null,
    canApprove: draft.items.length > 0,
    downloadLabel: "Download request (.csv)"
  };

  const historyRaw = Array.isArray(orderRequests)
    ? orderRequests.filter(req => req && req.status && req.status !== "draft")
    : [];

  const historySorted = historyRaw.slice().sort((a,b)=>{
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });

  const statusLabels = {
    approved: "Approved",
    denied: "Denied",
    partial: "Partially approved",
    draft: "Draft"
  };
  const statusClasses = {
    approved: "status-approved",
    denied: "status-denied",
    partial: "status-partial",
    draft: "status-draft"
  };
  const itemStatusLabels = {
    approved: "Approved",
    denied: "Denied",
    pending: "Pending",
  };
  const itemStatusClasses = {
    approved: "status-approved",
    denied: "status-denied",
    pending: "status-pending"
  };

  let approvedSpendTotal = 0;
  let lastUpdatedISO = null;

  const history = historySorted.map(req => {
    const requested = req.items.reduce((sum, item)=> sum + orderItemLineTotal(item), 0);
    const approved = req.items.reduce((sum, item)=> item.status === "approved" ? sum + orderItemLineTotal(item) : sum, 0);
    if (approved > 0) approvedSpendTotal += approved;
    const resolved = req.resolvedAt || null;
    if (resolved){
      if (!lastUpdatedISO || new Date(resolved) > new Date(lastUpdatedISO)){ lastUpdatedISO = resolved; }
    }
    return {
      id: req.id,
      code: req.code || req.id,
      dateRange: resolved
        ? `${formatOrderDate(req.createdAt)} → ${formatOrderDate(resolved)}`
        : `Created ${formatOrderDate(req.createdAt)}`,
      statusLabel: statusLabels[req.status] || req.status || "",
      statusClass: statusClasses[req.status] || "",
      total: formatOrderCurrency(requested),
      approvedTotal: formatOrderCurrency(approved),
      itemCount: String(req.items.length || 0),
      items: req.items.map(item => ({
        name: item.name || "",
        pn: item.pn || "—",
        price: formatOrderCurrency(item.price ?? 0),
        qty: String(item.qty || 0),
        total: formatOrderCurrency(orderItemLineTotal(item)),
        statusLabel: itemStatusLabels[item.status] || itemStatusLabels.pending,
        statusClass: itemStatusClasses[item.status] || itemStatusClasses.pending,
        link: item.link || ""
      }))
    };
  });

  const summary = {
    requestCount: String(history.length),
    approvedTotal: formatOrderCurrency(approvedSpendTotal),
    lastUpdated: lastUpdatedISO ? formatOrderDate(lastUpdatedISO, { includeTime:true }) : (history.length ? formatOrderDate(historySorted[0].createdAt, { includeTime:true }) : "—")
  };

  const tab = (typeof window.orderRequestTab === "string" && window.orderRequestTab === "history") ? "history" : "active";

  return { tab, active: activeModel, history, summary };
}

function updateOrderTotalsUI(card, request){
  if (!card || !request) return;
  const total = request.items.reduce((sum, item)=> sum + orderItemLineTotal(item), 0);
  const totalEl = card.querySelector("[data-order-total-value]");
  if (totalEl) totalEl.textContent = formatOrderCurrency(total);

  const selectionRow = card.querySelector("[data-order-selection-row]");
  const selectionValueEl = card.querySelector("[data-order-selection-value]");
  const selectedTotal = request.items.reduce((sum, item)=> orderPartialSelection.has(item.id) ? sum + orderItemLineTotal(item) : sum, 0);
  if (selectionRow){
    if (selectedTotal > 0){
      selectionRow.removeAttribute("hidden");
      if (selectionValueEl) selectionValueEl.textContent = formatOrderCurrency(selectedTotal);
    }else{
      selectionRow.setAttribute("hidden", "");
      if (selectionValueEl) selectionValueEl.textContent = formatOrderCurrency(0);
    }
  }
}

function addInventoryItemToOrder(inventoryId){
  const item = inventory.find(x => x.id === inventoryId);
  if (!item){ toast("Inventory item not found."); return; }
  const draft = ensureActiveOrderRequest();
  const existing = draft.items.find(line => line.inventoryId === inventoryId);
  if (existing){
    const confirmAdd = window.confirm("Are you sure you want to add this? You already have this item in your order request.");
    if (!confirmAdd) return;
  }
  const newItem = {
    id: genId("order_item"),
    inventoryId,
    name: item.name || "",
    pn: item.pn || "",
    link: item.link || "",
    price: item.price != null ? Number(item.price) : null,
    qty: 1,
    status: "pending"
  };
  draft.items.push(newItem);
  orderPartialSelection.add(newItem.id);
  saveCloudDebounced();
  toast("Added to order request");
  if (location.hash === "#/order-request" || location.hash === "#order-request"){ renderOrderRequest(); }
}

function findTasksLinkedToInventoryItem(item){
  const matches = [];
  if (!item) return matches;

  const itemId = item.id != null ? String(item.id) : "";
  const itemPN = item.pn != null ? String(item.pn).trim().toLowerCase() : "";
  const itemLink = item.link != null ? String(item.link).trim() : "";
  const seen = new Set();

  const tryAdd = (task)=>{
    if (!task) return;
    const fallbackId = `${task.name || ""}-${task.pn || ""}-${task.storeLink || ""}`;
    const tid = task.id != null ? String(task.id) : fallbackId;
    if (seen.has(tid)) return;
    seen.add(tid);
    matches.push(task);
  };

  const lists = [window.tasksInterval, window.tasksAsReq];
  lists.forEach(list => {
    if (!Array.isArray(list)) return;
    list.forEach(task => {
      if (!task) return;
      const tid = task.id != null ? String(task.id) : "";
      const taskInventoryId = task.inventoryId != null ? String(task.inventoryId) : "";
      if (itemId && (taskInventoryId === itemId || (tid && `inv_${tid}` === itemId))){
        tryAdd(task);
        return;
      }
      if (itemPN && task.pn && String(task.pn).trim().toLowerCase() === itemPN){
        tryAdd(task);
        return;
      }
      if (itemLink && task.storeLink && String(task.storeLink).trim() === itemLink){
        tryAdd(task);
      }
    });
  });

  return matches;
}

async function deleteInventoryItem(id, options){
  const opts = options || {};
  const skipConfirm = opts.skipConfirm === true;
  const suppressToast = opts.suppressToast === true;
  const suppressRender = opts.suppressRender === true;
  const idx = inventory.findIndex(item => item && item.id === id);
  if (idx < 0){ toast("Inventory item not found."); return false; }

  const item = inventory[idx];
  const label = item && item.name ? `"${item.name}"` : "this item";
  let confirmed = true;
  if (!skipConfirm){
    const linkedTasks = findTasksLinkedToInventoryItem(item);
    const count = linkedTasks.length;
    const message = count > 0
      ? (count === 1
        ? `Delete ${label}? This will unlink it from the maintenance task shown below.`
        : `Delete ${label}? This will unlink it from these maintenance tasks.`)
      : `Delete ${label}? This will remove it from inventory, maintenance settings, and the dashboard on every page.`;
    confirmed = await showConfirmModal({
      title: "Remove inventory item?",
      message,
      items: linkedTasks.map(task => task && task.name ? task.name : "Unnamed maintenance task"),
      cancelText: "Keep item",
      confirmText: "Delete inventory item",
      confirmVariant: "danger"
    });
  }
  if (!confirmed) return false;

  inventory.splice(idx, 1);
  saveCloudDebounced();
  if (!suppressToast) toast("Inventory item removed");

  if (!suppressRender){
    const hash = (location.hash || "#").toLowerCase();
    if (hash === "#/settings" || hash === "#settings"){ renderSettings(); }
    if (hash === "#/dashboard" || hash === "#dashboard" || hash === "#/" || hash === "#"){ renderDashboard(); }
  }

  return true;
}

function downloadOrderRequestCSV(request){
  if (!request) return;
  const header = ["Item", "Part #", "Qty", "Unit price", "Line total", "Status", "Store link"];
  const rows = [header];
  request.items.forEach(item => {
    const qty = Number(item.qty) || 0;
    const unitPrice = Number(item.price) || 0;
    const total = orderItemLineTotal(item);
    rows.push([
      item.name || "",
      item.pn || "",
      qty,
      unitPrice,
      total,
      item.status || "pending",
      item.link || ""
    ]);
  });
  const csv = rows.map(row => row.map(val => {
    const str = String(val ?? "");
    if (str.includes(",") || str.includes("\"") || str.includes("\n")){
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }).join(",")).join("\n");

  const blob = new Blob([csv], { type:"text/csv" });
  const url = URL.createObjectURL(blob);
  const filename = `${request.code || request.id || "order"}.csv`;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

function applyInventoryForApprovedItems(items){
  if (!Array.isArray(items)) return;
  items.forEach(item => {
    if (!item) return;
    if (!item.inventoryId) return;
    const inv = inventory.find(x => x.id === item.inventoryId);
    if (!inv) return;
    const qty = Number(item.qty);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const base = Number(inv.qty);
    inv.qty = (Number.isFinite(base) ? base : 0) + qty;
    if (item.price != null && (inv.price == null || inv.price === "")){
      inv.price = Number(item.price) || inv.price;
    }
  });
}

function finalizeOrderRequest(mode){
  const draft = ensureActiveOrderRequest();
  if (!draft.items.length){ toast("Add at least one item to the request."); return; }
  const nowISO = new Date().toISOString();

  if (mode === "approveAll"){
    draft.items.forEach(item => item.status = "approved");
    applyInventoryForApprovedItems(draft.items);
    draft.status = "approved";
    draft.resolvedAt = nowISO;
    orderPartialSelection.clear();
    toast("Order approved");
  }else if (mode === "deny"){
    draft.items.forEach(item => item.status = "denied");
    draft.status = "denied";
    draft.resolvedAt = nowISO;
    orderPartialSelection.clear();
    toast("Order denied");
  }else if (mode === "partial"){
    if (!orderPartialSelection.size){ toast("Select the line items you want to approve."); return; }
    if (orderPartialSelection.size === draft.items.length){
      finalizeOrderRequest("approveAll");
      return;
    }
    const approvedItems = [];
    const carryItems = [];
    draft.items.forEach(item => {
      if (orderPartialSelection.has(item.id)){
        item.status = "approved";
        approvedItems.push(item);
      }else{
        item.status = "pending";
        carryItems.push(item);
      }
    });
    if (approvedItems.length){
      applyInventoryForApprovedItems(approvedItems);
    }
    draft.status = "partial";
    draft.resolvedAt = nowISO;
    orderPartialSelection.clear();
    if (carryItems.length){
      const next = createOrderRequest(carryItems);
      orderRequests.push(next);
    }
    toast("Partial approval saved");
  }

  ensureActiveOrderRequest();
  saveCloudDebounced();
  renderOrderRequest();
}

function renderOrderRequest(){
  const content = document.getElementById("content"); if (!content) return;
  setAppSettingsContext("default");
  wireDashboardSettingsMenu();
  const model = computeOrderRequestModel();
  content.innerHTML = viewOrderRequest(model);

  const activeCard = content.querySelector(".order-card");
  const draft = ensureActiveOrderRequest();

  content.querySelectorAll("[data-order-tab]").forEach(btn => {
    btn.addEventListener("click", ()=>{
      const target = btn.getAttribute("data-order-tab") || "active";
      window.orderRequestTab = target;
      renderOrderRequest();
    });
  });

  activeCard?.addEventListener("input", (e)=>{
    const priceInput = e.target.closest("[data-order-price]");
    if (priceInput){
      const id = priceInput.getAttribute("data-order-price");
      const line = draft.items.find(item => item.id === id);
      if (!line) return;
      const val = priceInput.value.trim();
      line.price = val === "" ? null : Math.max(0, Number(val)||0);
      const row = priceInput.closest("tr");
      const totalCell = row?.querySelector(".order-money");
      if (totalCell) totalCell.textContent = formatOrderCurrency(orderItemLineTotal(line));
      updateOrderTotalsUI(activeCard, draft);
      saveCloudDebounced();
      return;
    }
    const qtyInput = e.target.closest("[data-order-qty]");
    if (qtyInput){
      const id = qtyInput.getAttribute("data-order-qty");
      const line = draft.items.find(item => item.id === id);
      if (!line) return;
      const val = qtyInput.value.trim();
      const qty = Number(val);
      line.qty = Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1;
      if (qtyInput.value !== String(line.qty)) qtyInput.value = String(line.qty);
      const row = qtyInput.closest("tr");
      const totalCell = row?.querySelector(".order-money");
      if (totalCell) totalCell.textContent = formatOrderCurrency(orderItemLineTotal(line));
      updateOrderTotalsUI(activeCard, draft);
      saveCloudDebounced();
    }
  });

  activeCard?.addEventListener("change", (e)=>{
    const checkbox = e.target.closest("[data-order-approve]");
    if (!checkbox) return;
    const id = checkbox.getAttribute("data-order-approve");
    if (!id) return;
    if (checkbox.checked) orderPartialSelection.add(id);
    else orderPartialSelection.delete(id);
    updateOrderTotalsUI(activeCard, draft);
  });

  activeCard?.addEventListener("click", (e)=>{
    const removeBtn = e.target.closest("[data-order-remove]");
    if (removeBtn){
      const id = removeBtn.getAttribute("data-order-remove");
      const idx = draft.items.findIndex(item => item.id === id);
      if (idx >= 0){
        draft.items.splice(idx,1);
        orderPartialSelection.delete(id);
        saveCloudDebounced();
        renderOrderRequest();
      }
      return;
    }

    const downloadBtn = e.target.closest("[data-order-download]");
    if (downloadBtn){
      downloadOrderRequestCSV(draft);
      return;
    }

    const approveBtn = e.target.closest("[data-order-approve-all]");
    if (approveBtn){
      finalizeOrderRequest("approveAll");
      return;
    }

    const partialBtn = e.target.closest("[data-order-partial]");
    if (partialBtn){
      finalizeOrderRequest("partial");
      return;
    }

    const denyBtn = e.target.closest("[data-order-deny]");
    if (denyBtn){
      const confirmed = window.confirm("Mark entire request as denied?");
      if (confirmed) finalizeOrderRequest("deny");
      return;
    }
  });

  content.querySelectorAll("[data-order-download-history]").forEach(btn => {
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-order-download-history");
      if (!id) return;
      const req = orderRequests.find(r => r && r.id === id);
      if (req) downloadOrderRequestCSV(req);
    });
  });

  updateOrderTotalsUI(activeCard, draft);
}

