/* ====================== RENDERERS ========================= */
if (!Array.isArray(window.pendingNewJobFiles)) window.pendingNewJobFiles = [];
const pendingNewJobFiles = window.pendingNewJobFiles;

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
    RENDER_TOTAL = v;
    window.RENDER_TOTAL = RENDER_TOTAL;
    RENDER_DELTA = deltaSinceLast();
    window.RENDER_DELTA = RENDER_DELTA;
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
        task.parentTask = parentId != null ? parentId : null;
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

  // ---------- Helpers: tasks ----------
  function findTaskMeta(id){
    const tid = String(id);
    let idx = window.tasksInterval.findIndex(t => String(t.id) === tid);
    if (idx >= 0) return { task: window.tasksInterval[idx], list: window.tasksInterval, mode: "interval", index: idx };
    idx = window.tasksAsReq.findIndex(t => String(t.id) === tid);
    if (idx >= 0) return { task: window.tasksAsReq[idx], list: window.tasksAsReq, mode: "asreq", index: idx };
    return null;
  }

  function gatherSiblings(catId, parentId, excludeId){
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

  function normalizeTaskOrder(catId, parentId){
    const siblings = gatherSiblings(catId, parentId, null)
      .sort((a,b)=> (Number(b.order||0) - Number(a.order||0)) || String(a.name||"").localeCompare(String(b.name||"")));
    let n = siblings.length;
    for (const task of siblings){ task.order = n--; }
    if (siblings.length){
      window._maintOrderCounter = Math.max(Number(window._maintOrderCounter)||0, siblings.length);
    }
  }

  function nextTaskOrder(catId, parentId, excludeId, place){
    const siblings = gatherSiblings(catId, parentId, excludeId);
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
    const sibs = window.settingsFolders
      .filter(f => String(f.parent||"") === String(parentId||""))
      .sort((a,b)=> (Number(b.order||0)-Number(a.order||0)) || String(a.name||"").localeCompare(String(b.name||"")));
    let n = sibs.length;
    for (const f of sibs){ f.order = n--; }
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
      const nextOrder = (function nextFolderOrder(parentId, excludeId, pos){
        const siblings = window.settingsFolders
          .filter(f => String(f.parent||"") === String(parentId||""))
          .filter(f => String(f.id) !== String(excludeId));
        if (!siblings.length) return 1;
        if (pos === "end"){
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
      })(parent ?? null, cat.id, place);

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

    return false;
  }

  return false;
}

function renderSettings(){
  // === Explorer-style Maintenance Settings ===
  const root = document.getElementById("content");
  if (!root) return;

  // --- Ensure state is present ---
  window.settingsFolders = Array.isArray(window.settingsFolders) ? window.settingsFolders : [];
  window.tasksInterval   = Array.isArray(window.tasksInterval)   ? window.tasksInterval   : [];
  window.tasksAsReq      = Array.isArray(window.tasksAsReq)      ? window.tasksAsReq      : [];
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

  const existingTree = document.getElementById("tree");
  const prevOpenTasks = new Set();
  const prevOpenCats = new Set();
  if (existingTree){
    existingTree.querySelectorAll('details.task[open]').forEach(el => {
      const id = el.getAttribute('data-task-id');
      if (id != null) prevOpenTasks.add(String(id));
    });
    existingTree.querySelectorAll('details.cat[open]').forEach(el => {
      const id = el.getAttribute('data-cat-id');
      if (id != null) prevOpenCats.add(String(id));
    });
  }

  function getForceSet(prop){
    const raw = window[prop];
    if (raw instanceof Set) return raw;
    if (Array.isArray(raw)){
      const setFromArr = new Set(raw.map(x => String(x)));
      window[prop] = setFromArr;
      return setFromArr;
    }
    const fresh = new Set();
    window[prop] = fresh;
    return fresh;
  }

  const pendingAutoOpenTasks = new Set(getForceSet('__settingsExplorerForceOpenTasks'));
  const pendingAutoOpenCats = new Set(getForceSet('__settingsExplorerForceOpenCats'));
  getForceSet('__settingsExplorerForceOpenTasks').clear();
  getForceSet('__settingsExplorerForceOpenCats').clear();

  // --- Small, compact scoped styles (once) ---
  if (!document.getElementById("settingsExplorerCSS")){
    const st = document.createElement("style");
    st.id = "settingsExplorerCSS";
    st.textContent = `
      #explorer .toolbar{display:flex;gap:.5rem;align-items:center;margin-bottom:.5rem;flex-wrap:wrap}
      #explorer .toolbar button{padding:.35rem .55rem;font-size:.92rem}
      #explorer .hint{font-size:.8rem;color:#666}
      #explorer .type-lanes{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.75rem;margin-bottom:.75rem}
      #explorer .type-lanes .lane{border:1px dashed #b5c6e1;border-radius:10px;padding:.75rem;background:#f7f9fe;color:#1f3b57;min-height:90px;display:flex;flex-direction:column;gap:.3rem;transition:background-color .15s ease,border-color .15s ease,box-shadow .15s ease}
      #explorer .type-lanes .lane strong{font-size:.95rem}
      #explorer .type-lanes .lane p{margin:0;font-size:.8rem;color:#4d6783}
      #explorer .type-lanes .lane.dragover{background:#e8f1ff;border-color:#0a63c2;box-shadow:0 0 0 2px rgba(10,99,194,.15)}
      #explorer .tree{border:1px solid #e5e5e5;background:#fff;border-radius:10px;padding:6px}
      #explorer details{margin:4px 0;border:1px solid #eee;border-radius:8px;background:#fafafa}
      #explorer details>summary{display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:grab;user-select:none}
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
      #explorer .children{padding:6px 8px 10px 18px}
      #explorer .task-children{padding:6px 8px 12px 22px;background:#fbfbfb;border-top:1px solid #f0f0f0}
      #explorer .task-children>.dz{margin:4px 0 6px;border:1px dashed #bbb;border-radius:8px;padding:6px;font-size:.78rem;color:#666;background:#fff;cursor:grab}
      #explorer .dz{min-height:8px;margin:4px 0;border-radius:6px}
      #explorer .dz.dragover{min-height:18px;background:rgba(10,99,194,.08);outline:2px dashed #0a63c2}
      #explorer .dz-line{position:relative;min-height:0;height:12px;margin:4px 0;border:1px dashed transparent;border-radius:6px;padding:0 6px;display:flex;align-items:center;justify-content:center;background:transparent;color:#0a63c2;transition:background-color .12s ease,border-color .12s ease}
      #explorer .dz-line::before{content:"";position:absolute;left:8px;right:8px;top:50%;border-top:2px dashed transparent;transform:translateY(-50%);pointer-events:none}
      #explorer .dz-line span{font-size:.68rem;pointer-events:none;opacity:0;transition:opacity .12s ease}
      #explorer .dz-line.dragover{background:rgba(10,99,194,.12);border-color:#0a63c2;outline:none}
      #explorer .dz-line.dragover::before{border-color:#0a63c2}
      #explorer .dz-line.dragover span{opacity:1}
      #explorer summary.drop-hint{outline:2px solid #6aa84f;border-radius:6px}
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

  const tasksById = new Map();
  const childrenByParent = new Map();
  const topByCat = new Map();

  const sortEntries = (arr)=> arr.sort((a,b)=> (Number(b.task.order||0) - Number(a.task.order||0)) || String(a.task.name||"").localeCompare(String(b.task.name||"")));

  for (const entry of taskEntries){
    const t = entry.task;
    const id = String(t.id);
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
      tailLabel = "Drop here to place at end",
      emptyMessage = "",
      emptyClass = "empty",
      emptyAttrs = ""
    } = options;
    const tail = `<div class="dz dz-line dz-task-tail" data-drop-task-tail="1" data-tail-parent="${String(parentTaskId ?? "")}" data-tail-cat="${String(catId ?? "")}"><span>${escapeHtml(tailLabel)}</span></div>`;
    if (!entries.length){
      const attr = emptyAttrs ? ` ${emptyAttrs}` : "";
      const msg = emptyMessage ? `<div class="${emptyClass}"${attr}>${escapeHtml(emptyMessage)}</div>` : "";
      return `${msg}${tail}`;
    }
    const pieces = [];
    for (const entry of entries){
      const label = escapeHtml(entry.task.name || "(unnamed task)");
      pieces.push(`<div class="dz dz-line dz-task-gap" data-drop-before-task="${entry.task.id}"><span>Drop before ${label}</span></div>`);
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
    const dropLabelRaw = t.name || "this task";
    const dropLabel = escapeHtml(dropLabelRaw);
    const childList = renderTaskList(children, {
      parentTaskId: t.id,
      catId: t.cat ?? null,
      tailLabel: `Drop here to place at end of ${dropLabelRaw}'s sub-tasks`,
      emptyMessage: "No sub-tasks yet. Drag any task here to nest it.",
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
          <div class="dz" data-drop-into-task="${t.id}">Drop here to make a sub-task of ${dropLabel}</div>
          ${childList}
        </div>
      </details>
    `;
  }

  function renderCategoryList(parentId, parentName){
    const folders = childrenFolders(parentId);
    const tailLabel = parentId == null
      ? "Drop folders here to place at end of root categories"
      : `Drop folders here to place at end of ${parentName || "this category"}`;
    if (!folders.length){
      return `<div class="dz dz-line dz-cat-tail" data-drop-cat-tail="1" data-tail-parent-cat="${String(parentId ?? "")}"><span>${escapeHtml(tailLabel)}</span></div>`;
    }
    const parts = [];
    for (const folder of folders){
      parts.push(`<div class="dz dz-line dz-cat-gap" data-drop-before-cat="${folder.id}"><span>Drop folder before ${escapeHtml(folder.name)}</span></div>`);
      parts.push(renderFolder(folder));
    }
    parts.push(`<div class="dz dz-line dz-cat-tail" data-drop-cat-tail="1" data-tail-parent-cat="${String(parentId ?? "")}"><span>${escapeHtml(tailLabel)}</span></div>`);
    return parts.join("");
  }

  function renderFolder(folder){
    ensureIdsOrder(folder);
    const taskEntriesForFolder = topByCat.get(String(folder.id)) || [];
    const tasksHtml = renderTaskList(taskEntriesForFolder, {
      parentTaskId: null,
      catId: folder.id,
      tailLabel: `Drop tasks here to place at end of ${folder.name}`,
      emptyMessage: "No tasks in this category yet.",
      emptyClass: "empty"
    });
    return `
      <details class="cat" data-cat-id="${folder.id}" open>
        <summary draggable="true"><span class="task-name">${escapeHtml(folder.name)}</span></summary>
        <div class="dz" data-drop-into-cat="${folder.id}">Drop tasks here to file under ${escapeHtml(folder.name)}</div>
        <div class="children">
          ${renderCategoryList(folder.id, folder.name)}
          ${tasksHtml}
        </div>
      </details>
    `;
  }

  const rootTaskEntries = topByCat.get("") || [];
  const rootTasks = renderTaskList(rootTaskEntries, {
    parentTaskId: null,
    catId: null,
    tailLabel: "Drop tasks here to place at end of the root list",
    emptyMessage: "",
    emptyClass: "empty"
  });
  const folderHtml = renderCategoryList(null, null);

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
          <button id="btnAddCategory">+ Add Category</button>
          <button id="btnAddTask">+ Add Task</button>
          <span class="hint">Drag folders & tasks to organize. Tasks can hold sub-tasks like folders. Use the conversion lanes below to switch task types quickly.</span>
        </div>
        <div class="tree" id="tree">
          <div class="type-lanes" id="typeLanes">
            <div class="lane" data-drop-type="interval">
              <strong>Interval tasks</strong>
              <p>Drop any task here to convert it to an interval item and return it to the root list.</p>
            </div>
            <div class="lane" data-drop-type="asreq">
              <strong>As-required tasks</strong>
              <p>Drop any task here to convert it to an as-required item and return it to the root list.</p>
            </div>
          </div>
          <div class="dz" data-drop-root="1">Drop here to move to the root</div>
          ${rootTasks}
          ${folderHtml}
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
  `;

  const tree = document.getElementById("tree");
  const modal = document.getElementById("taskModal");
  const form = document.getElementById("taskForm");
  const typeField = document.getElementById("taskTypeSelect");
  const freqRow = form?.querySelector('[data-form-frequency]');
  const lastRow = form?.querySelector('[data-form-last]');
  const conditionRow = form?.querySelector('[data-form-condition]');

  const reopenDetails = (kind, ids)=>{
    if (!tree || !ids || typeof ids.forEach !== 'function') return;
    const attr = kind === 'task' ? 'data-task-id' : 'data-cat-id';
    ids.forEach(id => {
      if (id == null) return;
      const safe = String(id).replace(/"/g, '\"');
      const el = tree.querySelector(`details.${kind}[${attr}="${safe}"]`);
      if (el) el.open = true;
    });
  };

  reopenDetails('task', new Set([...prevOpenTasks, ...pendingAutoOpenTasks]));
  reopenDetails('cat', new Set([...prevOpenCats, ...pendingAutoOpenCats]));

  const persist = ()=>{
    if (typeof saveTasks === "function") { try{ saveTasks(); }catch(_){} }
    if (typeof saveCloudDebounced === "function") { try{ saveCloudDebounced(); }catch(_){} }
  };

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
    modal.hidden = false;
    syncFormMode(typeField.value);
  }
  function hideModal(){ if (modal) modal.hidden = true; }

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

    if (catId) queueAutoOpenCat(catId);

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

  function gatherSiblingTasks(catId, parentId, excludeId){
    const keyCat = String(catId ?? "");
    const keyParent = String(parentId ?? "");
    const keyExclude = excludeId != null ? String(excludeId) : null;
    const siblings = [];
    for (const list of [window.tasksInterval, window.tasksAsReq]){
      if (!Array.isArray(list)) continue;
      for (const task of list){
        if (!task || task.id == null) continue;
        if (keyExclude && String(task.id) === keyExclude) continue;
        if (String(task.cat ?? "") !== keyCat) continue;
        if (String(task.parentTask ?? "") !== keyParent) continue;
        siblings.push(task);
      }
    }
    return siblings;
  }

  function normalizeTaskOrder(catId, parentId){
    const siblings = gatherSiblingTasks(catId, parentId, null)
      .sort((a,b)=> (Number(b.order||0) - Number(a.order||0)) || String(a.name||"").localeCompare(String(b.name||"")));
    let n = siblings.length;
    for (const task of siblings){ task.order = n--; }
    if (siblings.length){
      const counter = Number(window._maintOrderCounter) || 0;
      window._maintOrderCounter = Math.max(counter, siblings.length);
    }
  }

  function convertTaskViaDrop(taskId, nextMode){
    const meta = findTaskMeta(taskId);
    if (!meta) return false;
    if (meta.mode === nextMode){
      const task = meta.task;
      const oldCat = task.cat ?? null;
      const oldParent = task.parentTask ?? null;
      task.cat = null;
      task.parentTask = null;
      task.order = ++window._maintOrderCounter;
      normalizeTaskOrder(oldCat, oldParent);
      normalizeTaskOrder(task.cat ?? null, task.parentTask ?? null);
      return true;
    }

    const task = meta.task;
    const sourceList = meta.list;
    const oldCat = task.cat ?? null;
    const oldParent = task.parentTask ?? null;

    if (nextMode === "interval"){
      let intervalVal = task.interval;
      if (!isFinite(intervalVal) || intervalVal <= 0){
        const resp = prompt("Interval hours for this task?", "8");
        if (resp === null){
          return false;
        }
        const parsed = Number(resp);
        if (!isFinite(parsed) || parsed <= 0){
          alert("Enter a positive number.");
          return false;
        }
        intervalVal = parsed;
      }
      sourceList.splice(meta.index, 1);
      task.mode = "interval";
      task.interval = Number(intervalVal);
      task.sinceBase = task.sinceBase ?? null;
      task.anchorTotal = task.anchorTotal ?? null;
      delete task.condition;
      task.parentTask = null;
      task.cat = null;
      task.order = ++window._maintOrderCounter;
      window.tasksInterval.unshift(task);
    }else if (nextMode === "asreq"){
      sourceList.splice(meta.index, 1);
      task.mode = "asreq";
      task.condition = task.condition || "As required";
      delete task.interval;
      delete task.sinceBase;
      delete task.anchorTotal;
      task.parentTask = null;
      task.cat = null;
      task.order = ++window._maintOrderCounter;
      window.tasksAsReq.unshift(task);
    }else{
      return false;
    }

    normalizeTaskOrder(oldCat, oldParent);
    normalizeTaskOrder(task.cat ?? null, task.parentTask ?? null);
    return true;
  }

  function queueAutoOpenCat(catId){
    if (catId == null) return;
    const target = getForceSet('__settingsExplorerForceOpenCats');
    let current = catId;
    let guard = 0;
    while (current != null && guard++ < 100){
      const key = String(current);
      target.add(key);
      const parent = window.settingsFolders.find(f => String(f.id) === key);
      current = parent && parent.parent != null ? parent.parent : null;
    }
  }

  function queueAutoOpenTask(taskId){
    if (taskId == null) return;
    const tasksSet = getForceSet('__settingsExplorerForceOpenTasks');
    let current = taskId;
    let guard = 0;
    while (current != null && guard++ < 100){
      const key = String(current);
      tasksSet.add(key);
      const meta = findTaskMeta(current);
      if (meta && meta.task){
        if (meta.task.cat != null) queueAutoOpenCat(meta.task.cat);
        current = meta.task.parentTask != null ? meta.task.parentTask : null;
      }else{
        current = null;
      }
    }
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

  tree?.addEventListener("click", (e)=>{
    const removeBtn = e.target.closest('[data-remove]');
    if (removeBtn){
      const id = removeBtn.getAttribute('data-remove');
      const from = removeBtn.getAttribute('data-from');
      window.tasksInterval.forEach(t => { if (String(t.parentTask) === String(id)) t.parentTask = null; });
      window.tasksAsReq.forEach(t => { if (String(t.parentTask) === String(id)) t.parentTask = null; });
      if (from === 'interval') window.tasksInterval = window.tasksInterval.filter(t => String(t.id)!==String(id));
      else window.tasksAsReq = window.tasksAsReq.filter(t => String(t.id)!==String(id));
      persist();
      renderSettings();
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
      sum.classList.add('drop-hint');
    }else if (catCard){
      DRAG.kind = 'category';
      DRAG.id   = catCard.getAttribute('data-cat-id');
      e.dataTransfer.setData('text/plain', `category:${DRAG.id}`);
      e.dataTransfer.effectAllowed = 'move';
      sum.classList.add('drop-hint');
    }
  });
  tree?.addEventListener('dragend',()=>{
    tree.querySelectorAll('.drop-hint').forEach(el=>el.classList.remove('drop-hint'));
    tree.querySelectorAll('.dz.dragover').forEach(el=>el.classList.remove('dragover'));
    tree.querySelectorAll('[data-drop-type].dragover').forEach(el=>el.classList.remove('dragover'));
    DRAG.kind = DRAG.id = DRAG.type = null;
  });
  function allow(e){ e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
  tree?.addEventListener('dragover',(e)=>{
    const dz = e.target.closest('.dz');
    if (dz){
      if ((dz.hasAttribute('data-drop-before-task') || dz.hasAttribute('data-drop-task-tail') || dz.hasAttribute('data-drop-into-task')) && DRAG.kind === 'task'){
        allow(e); dz.classList.add('dragover'); return;
      }
      if ((dz.hasAttribute('data-drop-before-cat') || dz.hasAttribute('data-drop-cat-tail')) && DRAG.kind === 'category'){
        allow(e); dz.classList.add('dragover'); return;
      }
      if (dz.hasAttribute('data-drop-into-cat') && DRAG.kind === 'task'){
        allow(e); dz.classList.add('dragover'); return;
      }
      if (dz.hasAttribute('data-drop-root') && (DRAG.kind === 'task' || DRAG.kind === 'category')){
        allow(e); dz.classList.add('dragover'); return;
      }
    }
    const lane = e.target.closest('[data-drop-type]');
    if (lane && DRAG.kind === 'task'){ allow(e); lane.classList.add('dragover'); return; }
    const sumTask = e.target.closest('details.task>summary');
    if (sumTask && DRAG.kind === 'task'){ allow(e); sumTask.classList.add('drop-hint'); return; }
    const sumCat = e.target.closest('details.cat>summary');
    if (sumCat && (DRAG.kind === 'task' || DRAG.kind === 'category')){ allow(e); sumCat.classList.add('drop-hint'); }
  });
  tree?.addEventListener('dragleave',(e)=>{
    e.target.closest('.dz')?.classList.remove('dragover');
    e.target.closest('summary')?.classList.remove('drop-hint');
    e.target.closest('[data-drop-type]')?.classList.remove('dragover');
  });
  tree?.addEventListener('drop',(e)=>{
    const raw = e.dataTransfer?.getData?.('text/plain') || '';
    const parts = raw ? raw.split(':') : [];
    const kind = parts[0] || DRAG.kind || '';
    const id = parts[1] || DRAG.id || null;
    e.preventDefault();
    e.stopPropagation();
    if (!kind || !id){
      return;
    }
    const dzRoot = e.target.closest('[data-drop-root]');
    const dzCat  = e.target.closest('[data-drop-into-cat]');
    const dzTask = e.target.closest('[data-drop-into-task]');
    const dzBeforeTask = e.target.closest('[data-drop-before-task]');
    const dzTaskTail = e.target.closest('[data-drop-task-tail]');
    const dzBeforeCat = e.target.closest('[data-drop-before-cat]');
    const dzCatTail = e.target.closest('[data-drop-cat-tail]');
    const onTaskSummary = e.target.closest('details.task>summary');
    const onCatSummary  = e.target.closest('details.cat>summary');
    const lane = e.target.closest('[data-drop-type]');

    if (kind === 'task' && id){
      if (lane){
        const mode = lane.getAttribute('data-drop-type');
        if (mode && convertTaskViaDrop(id, mode)){
          persist();
          renderSettings();
        }
        return;
      }
      if (dzBeforeTask){
        const beforeId = dzBeforeTask.getAttribute('data-drop-before-task');
        if (beforeId && typeof moveNodeSafely === 'function' && moveNodeSafely('task', id, { beforeTask: { id: beforeId } })){
          const beforeMeta = findTaskMeta(beforeId);
          if (beforeMeta && beforeMeta.task){
            if (beforeMeta.task.parentTask != null){
              queueAutoOpenTask(beforeMeta.task.parentTask);
            }else if (beforeMeta.task.cat != null){
              queueAutoOpenCat(beforeMeta.task.cat);
            }
          }
          persist();
          renderSettings();
        }
        return;
      }
      if (dzTaskTail){
        const parentAttr = dzTaskTail.getAttribute('data-tail-parent') || '';
        const catAttr = dzTaskTail.getAttribute('data-tail-cat') || '';
        const parentId = parentAttr === '' ? null : parentAttr;
        const catId = catAttr === '' ? null : catAttr;
        if (parentId){
          if (typeof moveNodeSafely === 'function' && moveNodeSafely('task', id, { intoTask: parentId, position: 'end' })){
            queueAutoOpenTask(parentId);
            persist();
            renderSettings();
          }
        }else{
          if (typeof moveNodeSafely === 'function' && moveNodeSafely('task', id, { intoCat: catId, position: 'end' })){
            if (catId != null && catId !== '') queueAutoOpenCat(catId);
            persist();
            renderSettings();
          }
        }
        return;
      }
      if (dzRoot){
        if (typeof moveNodeSafely === 'function' && moveNodeSafely('task', id, { intoCat: null, position: 'end' })){
          persist();
          renderSettings();
        }
        return;
      }
      if (dzCat){
        const catId = dzCat.getAttribute('data-drop-into-cat');
        if (typeof moveNodeSafely === 'function' && moveNodeSafely('task', id, { intoCat: catId, position: 'end' })){
          if (catId != null && catId !== '') queueAutoOpenCat(catId);
          persist();
          renderSettings();
        }
        return;
      }
      if (dzTask){
        const parentId = dzTask.getAttribute('data-drop-into-task');
        if (typeof moveNodeSafely === 'function' && moveNodeSafely('task', id, { intoTask: parentId, position: 'end' })){
          queueAutoOpenTask(parentId);
          persist();
          renderSettings();
        }
        return;
      }
      if (onTaskSummary){
        const parentId = onTaskSummary.closest('details.task')?.getAttribute('data-task-id');
        if (parentId && typeof moveNodeSafely === 'function' && moveNodeSafely('task', id, { intoTask: parentId, position: 'end' })){
          queueAutoOpenTask(parentId);
          persist();
          renderSettings();
        }
        return;
      }
      if (onCatSummary){
        const catId = onCatSummary.closest('details.cat')?.getAttribute('data-cat-id');
        if (typeof moveNodeSafely === 'function' && moveNodeSafely('task', id, { intoCat: catId, position: 'end' })){
          if (catId != null && catId !== '') queueAutoOpenCat(catId);
          persist();
          renderSettings();
        }
        return;
      }
    }

    if (kind === 'category' && id){
      if (dzBeforeCat){
        const beforeId = dzBeforeCat.getAttribute('data-drop-before-cat');
        if (beforeId && typeof moveNodeSafely === 'function' && moveNodeSafely('category', id, { beforeCat: { id: beforeId } })){
          persist();
          renderSettings();
        }
        return;
      }
      if (dzCatTail){
        const parentAttr = dzCatTail.getAttribute('data-tail-parent-cat') || '';
        const parentId = parentAttr === '' ? null : parentAttr;
        if (typeof moveNodeSafely === 'function' && moveNodeSafely('category', id, { intoCat: parentId, position: 'end' })){
          persist();
          renderSettings();
        }
        return;
      }
      if (dzRoot){
        if (typeof moveNodeSafely === 'function' && moveNodeSafely('category', id, { intoCat: null, position: 'end' })){
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

function renderCosts(){
  const content = document.getElementById("content");
  if (!content) return;

  const model = computeCostModel();
  content.innerHTML = viewCosts(model);

  const canvas = document.getElementById("costChart");
  const toggleMaint = document.getElementById("toggleCostMaintenance");
  const toggleJobs  = document.getElementById("toggleCostJobs");

  const redraw = ()=>{
    drawCostChart(canvas, model, {
      maintenance: !toggleMaint || toggleMaint.checked,
      jobs: !toggleJobs || toggleJobs.checked
    });
  };

  redraw();
  toggleMaint?.addEventListener("change", redraw);
  toggleJobs?.addEventListener("change", redraw);
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
  const costPerHour = intervalTasks.reduce((sum, task)=>{
    const price = Number(task?.price);
    const interval = Number(task?.interval);
    if (!isFinite(price) || !isFinite(interval) || interval <= 0 || price <= 0) return sum;
    return sum + (price / interval);
  }, 0);

  const estimateMaintenanceCost = (hours)=>{
    if (!isFinite(hours) || hours <= 0 || !isFinite(costPerHour) || costPerHour <= 0) return 0;
    return hours * costPerHour;
  };

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
  const predictedAnnual = estimateMaintenanceCost(baselineDailyHours * 365);

  const timeframeDefs = [
    { key: "year",   label: "Past 12 months", days: 365 },
    { key: "six",    label: "Past 6 months",  days: 182 },
    { key: "quarter",label: "Past 3 months",  days: 92  },
    { key: "month",  label: "Past 30 days",   days: 30  }
  ];

  const timeframeRowsRaw = timeframeDefs.map(def => {
    const hours = usageSinceDays(def.days);
    return {
      key: def.key,
      label: def.label,
      days: def.days,
      hours,
      costActual: estimateMaintenanceCost(hours),
      costProjected: estimateMaintenanceCost(baselineDailyHours * def.days)
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
      cost: estimateMaintenanceCost(deltaHours)
    });
  }

  const maintenanceSeries = maintenanceHistory.slice(-16).map(entry => ({
    date: entry.date,
    value: entry.cost
  }));

  const jobsInfo = [];
  const jobSeriesRaw = [];
  let totalGainLoss = 0;

  if (Array.isArray(cuttingJobs)){
    for (const job of cuttingJobs){
      if (!job) continue;
      const eff = typeof computeJobEfficiency === "function" ? computeJobEfficiency(job) : { gainLoss:0, deltaHours:0 };
      const gainLoss = Number(eff?.gainLoss) || 0;
      const deltaHours = Number(eff?.deltaHours) || 0;
      let date = null;
      if (job.dueISO){
        const due = new Date(job.dueISO);
        if (!Number.isNaN(due.getTime())) date = due;
      }
      if (!date && job.startISO){
        const start = new Date(job.startISO);
        if (!Number.isNaN(start.getTime())) date = start;
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
        const milestone = new Date(milestoneDate);
        if (!Number.isNaN(milestone.getTime())) milestoneLabel = milestone.toLocaleDateString();
      }

      jobsInfo.push({
        name: job.name || "Untitled job",
        date,
        milestoneLabel,
        gainLoss,
        status,
        statusDetail
      });

      if (!Number.isNaN(date.getTime())){
        jobSeriesRaw.push({ date, rawValue: gainLoss, label: job.name || "Job" });
      }

      totalGainLoss += gainLoss;
    }
  }

  const jobSeriesSorted = jobSeriesRaw.slice().sort((a,b)=> a.date - b.date);
  const jobSeries = [];
  if (jobSeriesSorted.length){
    let cumulative = 0;
    jobSeriesSorted.forEach((pt, idx)=>{
      cumulative += pt.rawValue;
      jobSeries.push({ date: pt.date, value: cumulative / (idx + 1) });
    });
  }

  const jobCount = jobsInfo.length;
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

  const yearRow = timeframeRowsRaw.find(row => row.key === "year");
  const yearActual = yearRow ? yearRow.costActual : 0;

  let maintenanceHint;
  if (costPerHour <= 0){
    maintenanceHint = "Add prices to interval tasks to project maintenance spend.";
  }else if (baselineDailyHours <= 0){
    maintenanceHint = `Log machine hours to build a usage baseline. Rate ${formatterCurrency(costPerHour, { decimals: 2 })}/hr.`;
  }else{
    maintenanceHint = `Rate ${formatterCurrency(costPerHour, { decimals: 2 })}/hr × ${baselineDailyHours.toFixed(1)} hr/day baseline. Actual last 12 months: ${formatterCurrency(yearActual, { decimals: 0 })}.`;
  }

  const summaryCards = [
    {
      icon: "🛠️",
      title: "Interval maintenance forecast",
      value: formatterCurrency(predictedAnnual, { decimals: 0 }),
      hint: maintenanceHint
    },
    {
      icon: "✂️",
      title: "Cutting jobs efficiency",
      value: formatterCurrency(totalGainLoss, { decimals: 0, showPlus: true }),
      hint: jobCount
        ? `Average gain/loss ${formatterCurrency(averageGainLoss, { decimals: 0, showPlus: true })} across ${jobCount} job${jobCount===1?"":"s"}.`
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
    countLabel: String(jobCount),
    totalLabel: formatterCurrency(totalGainLoss, { decimals: 0, showPlus: true }),
    averageLabel: formatterCurrency(averageGainLoss, { decimals: 0, showPlus: true }),
    rollingLabel: jobSeries.length
      ? formatterCurrency(jobSeries[jobSeries.length-1].value, { decimals: 0, showPlus: true })
      : formatterCurrency(0, { decimals: 0 })
  };

  const timeframeNote = "Maintenance projections use interval tasks only; as-required items remain excluded from forecasts.";
  const historyEmpty = parsedHistory.length
    ? "Log additional machine hours to expand the maintenance cost timeline."
    : "No usage history yet. Log machine hours to estimate maintenance spend.";
  const jobEmpty = "Add cutting jobs with estimates to build the efficiency tracker.";

  const chartNote = `Maintenance line uses estimated spend per hours logged; cutting jobs line shows the rolling average gain/loss at ${formatterCurrency(JOB_RATE_PER_HOUR, { decimals: 0 })}/hr.`;

  return {
    summaryCards,
    timeframeRows,
    timeframeNote,
    historyRows,
    historyEmpty,
    jobSummary,
    jobBreakdown,
    jobEmpty,
    chartNote,
    chartColors: COST_CHART_COLORS,
    maintenanceSeries,
    jobSeries
  };
}

function drawCostChart(canvas, model, show){
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
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

  const left = 60;
  const right = W - 20;
  const top = 20;
  const bottom = H - 40;
  const X = (time)=> left + ((time - xMin) / Math.max(1, xMax - xMin)) * (right - left);
  const Y = (value)=> bottom - ((value - yMin) / Math.max(1e-6, yMax - yMin)) * (bottom - top);

  ctx.strokeStyle = "#e2e6f1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();

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

  const formatDateLabel = (date)=>{
    const opts = { month: "short", day: "numeric" };
    if (Math.abs(xMax - xMin) > 31557600000){ opts.year = "numeric"; }
    return date.toLocaleDateString(undefined, opts);
  };

  ctx.fillStyle = "#666";
  ctx.textAlign = "left";
  ctx.fillText(formatDateLabel(new Date(xMin)), left, H - 12);
  ctx.textAlign = "right";
  ctx.fillText(formatDateLabel(new Date(xMax)), right, H - 12);

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

  ctx.textAlign = "right";
  ctx.fillText(formatMoney(yMax), right, top + 12);
  ctx.fillText(formatMoney(yMin), right, bottom);

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
  });
}


function renderJobs(){
  const content = document.getElementById("content"); 
  if (!content) return;

  // 1) Render the jobs view (includes the table with the Actions column)
  content.innerHTML = viewJobs();

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
    const attachments = pendingNewJobFiles.map(f=>({ ...f }));
    cuttingJobs.push({ id: genId(name), name, estimateHours:est, startISO:start, dueISO:due, material:"", notes:"", manualLogs:[], files:attachments });
    pendingNewJobFiles.length = 0;
    saveCloudDebounced(); renderJobs();
  });

  // 5) Inline material $/qty (kept)
  content.querySelector("tbody")?.addEventListener("change", async (e)=>{
    if (e.target.matches("input.matCost, input.matQty")){
      const id = e.target.getAttribute("data-id");
      const j = cuttingJobs.find(x=>x.id===id); if (!j) return;
      j.materialCost = Number(content.querySelector(`input.matCost[data-id="${id}"]`).value)||0;
      j.materialQty  = Number(content.querySelector(`input.matQty[data-id="${id}"]`).value)||0;
      saveCloudDebounced();
      renderJobs();
      return;
    }

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

  // 6) Edit/Remove/Save/Cancel + Log panel + Apply spent/remaining
  content.querySelector("tbody")?.addEventListener("click",(e)=>{
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
  const rowsTarget = content.querySelector("[data-inventory-rows]");
  const searchInput = content.querySelector("#inventorySearch");
  const clearBtn = content.querySelector("#inventorySearchClear");

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
    saveCloudDebounced();
  });
}

function renderSignedOut(){
  const content = document.getElementById("content"); if (!content) return;
  content.innerHTML = `<div class='container'><div class='block'><h3>Please sign in to view workspace.</h3></div></div>`;
}

