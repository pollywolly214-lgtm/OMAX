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
// Unified mover for tasks and categories.
// Accepts the same "target" shape you already use:
//   - { intoTask: <taskId> }              // make sub-component of a task
//   - { beforeTask: { id, type } }        // reorder (top-level) before another task
//   - { intoCat: <categoryId|null> }      // file task into a folder (or root)
//   - { beforeCat: { id } }               // reorder a folder before another folder
function moveNodeSafely(kind, nodeId, target){
  // ---------- Common state ----------
  window.settingsFolders = Array.isArray(window.settingsFolders) ? window.settingsFolders : [];
  window.tasksInterval   = Array.isArray(window.tasksInterval)   ? window.tasksInterval   : [];
  window.tasksAsReq      = Array.isArray(window.tasksAsReq)      ? window.tasksAsReq      : [];
  if (typeof window._maintOrderCounter === "undefined") window._maintOrderCounter = 0;

  // ---------- Helpers: tasks ----------
  const topListByType = (type) => (type === "interval" ? tasksInterval : tasksAsReq);

  // DFS find a task anywhere (top-level or nested .sub)
  function findTaskRef(id){
    function dfs(list, ownerType, parentTask=null, path=[]){
      for (let i=0;i<list.length;i++){
        const t = list[i];
        if (String(t.id) === String(id)) return { task:t, index:i, list, ownerType, parentTask, path };
        if (Array.isArray(t.sub) && t.sub.length){
          const hit = dfs(t.sub, ownerType, t, path.concat(t.id));
          if (hit) return hit;
        }
      }
      return null;
    }
    return dfs(tasksInterval, "interval") || dfs(tasksAsReq, "asreq");
  }

  // Find a task only at the top level of a list (for beforeTask insert)
  function findTopRef(id){
    let idx = tasksInterval.findIndex(t => String(t.id)===String(id));
    if (idx>=0) return { list:tasksInterval, ownerType:"interval", index:idx, task:tasksInterval[idx], parentTask:null };
    idx = tasksAsReq.findIndex(t => String(t.id)===String(id));
    if (idx>=0) return { list:tasksAsReq, ownerType:"asreq", index:idx, task:tasksAsReq[idx], parentTask:null };
    return null;
  }

  function isDescendant(ancestorTask, maybeChildId){
    if (!ancestorTask || !Array.isArray(ancestorTask.sub)) return false;
    for (const c of ancestorTask.sub){
      if (String(c.id) === String(maybeChildId)) return true;
      if (isDescendant(c, maybeChildId)) return true;
    }
    return false;
  }

  function detachTask(ref){
    if (!ref) return;
    if (ref.parentTask){
      ref.parentTask.sub.splice(ref.index, 1);
    }else{
      ref.list.splice(ref.index, 1);
    }
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
    const src = findTaskRef(nodeId);
    if (!src) return false;

    // intoTask can be string or {id}
    const intoTaskId = (target && Object.prototype.hasOwnProperty.call(target,"intoTask"))
      ? (typeof target.intoTask === "object" ? target.intoTask?.id : target.intoTask)
      : null;

    if (intoTaskId != null){
      // no self / no cycle
      if (String(intoTaskId) === String(nodeId)) return false;
      const parentRef = findTaskRef(intoTaskId);
      if (!parentRef) return false;
      if (isDescendant(src.task, intoTaskId)) return false;

      // move: detach then push into parent's sub[]
      detachTask(src);
      if (!Array.isArray(parentRef.task.sub)) parentRef.task.sub = [];
      parentRef.task.sub.push(src.task);

      if (typeof saveTasks === "function") saveTasks();
      if (typeof saveCloudDebounced === "function") try{ saveCloudDebounced(); }catch(_){}
      return true;
    }

    if (target && target.beforeTask && target.beforeTask.id){
      // Reorder at top level: place BEFORE the target card
      const destTop = findTopRef(target.beforeTask.id);
      const destType = target.beforeTask.type || destTop?.ownerType; // fallback if type missing
      if (!destTop || !destType) return false;

      // detach source from wherever it was
      detachTask(src);

      // insert into the destination list at the correct index
      const destList = topListByType(destType);
      const j = destList.findIndex(t => String(t.id)===String(destTop.task.id));
      const insertAt = (j>=0) ? j : destList.length;
      destList.splice(insertAt, 0, src.task);

      if (typeof saveTasks === "function") saveTasks();
      if (typeof saveCloudDebounced === "function") try{ saveCloudDebounced(); }catch(_){}
      return true;
    }

    if (Object.prototype.hasOwnProperty.call(target || {}, "intoCat")){
      // File the task into a folder (no positional change required)
      const catId = target.intoCat;
      if (catId != null && !findCat(catId)) return false;
      // ensure we keep the task where it is; just set a folder tag
      src.task.cat = (catId || null);
      if (typeof saveTasks === "function") saveTasks();
      if (typeof saveCloudDebounced === "function") try{ saveCloudDebounced(); }catch(_){}
      return true;
    }

    // nothing matched
    return false;
  }

  // ---------- CATEGORY MOVES ----------
  if (kind === "category"){
    const cat = findCat(nodeId);
    if (!cat) return false;

    if (Object.prototype.hasOwnProperty.call(target || {}, "intoCat")){
      const parent = target.intoCat; // may be null → root
      // prevent cycles: cannot move into own descendant
      let p = parent, hops = 0;
      while (p != null && hops++ < 1000){
        if (String(p) === String(cat.id)) return false;
        p = findCat(p)?.parent ?? null;
      }
      if (parent != null && !findCat(parent)) return false;

      cat.parent = parent || null;
      cat.order  = ++window._maintOrderCounter;
      normalizeFolderOrder(cat.parent);

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

  // --- Small, compact scoped styles (once) ---
  if (!document.getElementById("settingsExplorerCSS")){
    const st = document.createElement("style");
    st.id = "settingsExplorerCSS";
    st.textContent = `
      #explorer .toolbar{display:flex;gap:.5rem;align-items:center;margin-bottom:.5rem;flex-wrap:wrap}
      #explorer .toolbar button{padding:.35rem .55rem;font-size:.92rem}
      #explorer .hint{font-size:.8rem;color:#666}
      #explorer .tree{border:1px solid #e5e5e5;background:#fff;border-radius:10px;padding:6px}
      #explorer details{margin:4px 0;border:1px solid #eee;border-radius:8px;background:#fafafa}
      #explorer details>summary{display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:grab;user-select:none}
      #explorer details.task>summary{cursor:grab; font-weight:600; background:#fff}
      #explorer details.cat>summary{font-weight:800}
      #explorer .children{padding:4px 8px 8px 18px}
      #explorer .dz{height:8px;margin:4px 0;border-radius:6px}
      #explorer .dz.dragover{height:18px;background:rgba(0,0,0,.05);outline:2px dashed #888}
      #explorer .drop-hint{outline:2px solid #6aa84f;border-radius:6px}
      #explorer .body{padding:6px 8px;border-top:1px dashed #e5e5e5;background:#fff}
      #explorer .grid{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}
      #explorer label{font-size:.85rem;display:block}
      #explorer input{width:100%;padding:.35rem .45rem}
      #explorer .chip{font-size:.72rem;border:1px solid #bbb;border-radius:999px;padding:.05rem .45rem}
      #explorer .row-actions{display:flex;gap:.4rem;justify-content:flex-end;margin-top:.4rem;flex-wrap:wrap}
      #explorer .empty{padding:.5rem;color:#666}
    `;
    document.head.appendChild(st);
  }

  // --- Helpers ---
  const fmtPrice = v => (v==null || v==="") ? "" : String(v);
  const byIdFolder = (id)=> window.settingsFolders.find(f => String(f.id)===String(id)) || null;
  const childrenFolders = (parent)=> window.settingsFolders
      .filter(f => String(f.parent||"") === String(parent||""))
      .sort((a,b)=> (Number(b.order||0)-Number(a.order||0)) || String(a.name).localeCompare(String(b.name)));
  const topTasksInCat = (catId)=> {
    const bucket = []
      .concat(window.tasksInterval.map(x=>({t:x,type:"interval"})))
      .concat(window.tasksAsReq.map(x=>({t:x,type:"asreq"})));
    return bucket
      .filter(x => (x.t.parentTask == null) && String(x.t.cat||"") === String(catId||""))
      .sort((a,b)=> (Number(b.t.order||0) - Number(a.t.order||0)) || String(a.t.name||"").localeCompare(String(b.t.name||"")));
  };

  function ensureIdsOrder(obj){
    if (!obj.id){
      obj.id = (obj.name||"item").toLowerCase().replace(/[^a-z0-9]+/g,"_")+"_"+Date.now().toString(36);
    }
    if (obj.order == null) obj.order = ++window._maintOrderCounter;
  }

  // --- Row renderers ---
  function taskRow({t,type}){
    const badge = (type==="interval" ? (t.interval!=null?`<span class="chip">Interval: ${t.interval}h</span>`:`<span class="chip">Interval</span>`)
                                     : `<span class="chip">As Required</span>`);
    return `
      <details class="task" data-task-id="${t.id}" data-owner="${type}">
        <summary draggable="true">${t.name||"(unnamed)"} ${badge}</summary>
        <div class="body">
          <div class="grid">
            <label>Name<input data-k="name" data-id="${t.id}" data-list="${type}" value="${t.name||""}"></label>
            ${
              type==="interval" 
                ? `<label>Interval (hrs)<input type="number" min="1" step="1" data-k="interval" data-id="${t.id}" data-list="interval" value="${t.interval||""}"></label>`
                : `<label>Condition/Notes<input data-k="condition" data-id="${t.id}" data-list="asreq" value="${t.condition||""}" placeholder="optional"></label>`
            }
            <label>Part #<input data-k="pn" data-id="${t.id}" data-list="${type}" value="${t.pn||""}"></label>
            <label>Price<input type="number" step="0.01" min="0" data-k="price" data-id="${t.id}" data-list="${type}" value="${fmtPrice(t.price)}" placeholder="optional"></label>
            <label>Store / Manual (URL)<input type="url" data-k="link" data-id="${t.id}" data-list="${type}" value="${t.link||t.storeLink||t.manualLink||""}" placeholder="https://…"></label>
          </div>
          <div class="row-actions">
            ${type==="interval" ? `<button class="btn-complete" data-complete="${t.id}">Mark Completed</button>` : ``}
            <button class="danger" data-remove="${t.id}" data-from="${type}">Remove</button>
          </div>
        </div>
      </details>
    `;
  }

  function folderHTML(f){
    ensureIdsOrder(f);
    const kids = childrenFolders(f.id).map(folderHTML).join("");
    const tasks = topTasksInCat(f.id).map(taskRow).join("");
    return `
      <details class="cat" data-cat-id="${f.id}" open>
        <summary draggable="true">📁 ${f.name}</summary>
        <div class="dz" data-drop-into-cat="${f.id}"></div>
        <div class="children">
          ${kids}
          ${tasks || ""}
        </div>
      </details>
    `;
  }

  const roots = childrenFolders(null);
  const rootTasks = topTasksInCat(null).map(taskRow).join("");

  // --- Page ---
  root.innerHTML = `
    <div id="explorer" class="container">
      <div class="block" style="grid-column:1 / -1">
        <h3>Maintenance Settings</h3>
        <div class="toolbar">
          <button id="btnAddCategory">+ Add Category</button>
          <button id="btnAddTask">+ Add Task</button>
          <span class="hint">Drag folders & tasks to organize. New items appear at the top.</span>
        </div>
        <div class="tree" id="tree">
          <div class="dz" data-drop-root="1"></div>
          ${roots.length ? roots.map(folderHTML).join("") : ""}
          ${rootTasks || (roots.length ? "" : `<div class="empty">No tasks yet.</div>`)}
        </div>
      </div>
    </div>
  `;

  // --- Wiring: add buttons ---
  document.getElementById("btnAddCategory")?.addEventListener("click", ()=>{
    const name = prompt("Category name?");
    if (!name) return;
    const cat = { id: name.toLowerCase().replace(/[^a-z0-9]+/g,"_")+"_"+Math.random().toString(36).slice(2,7), name, parent:null, order: ++window._maintOrderCounter };
    window.settingsFolders.push(cat);
    if (typeof saveCloudDebounced === "function") try{ saveCloudDebounced(); }catch(_){}
    renderSettings();
  });

  document.getElementById("btnAddTask")?.addEventListener("click", ()=>{
    const name = prompt("Task name?");
    if (!name) return;
    const occ = (prompt('Occurrence: type "interval" for Hourly Interval, or "asreq" for As Required').trim().toLowerCase());
    const id  = (name.toLowerCase().replace(/[^a-z0-9]+/g,"_") + "_" + Date.now());
    if (occ === "interval"){
      const interval = Number(prompt("Interval (hours):") || "");
      const t = { id, name, interval: isFinite(interval)&&interval>0 ? interval : 8, sinceBase:null, anchorTotal:null, link:"", pn:"", price:null, cat:null, order: ++window._maintOrderCounter };
      window.tasksInterval.unshift(t);
    }else{
      const t = { id, name, condition:"As required", link:"", pn:"", price:null, cat:null, order: ++window._maintOrderCounter };
      window.tasksAsReq.unshift(t);
    }
    if (typeof saveTasks === "function") try{ saveTasks(); }catch(_){}
    if (typeof saveCloudDebounced === "function") try{ saveCloudDebounced(); }catch(_){}
    renderSettings();
  });

  // --- Inline edits ---
  root.querySelectorAll("[data-id]").forEach(inp=>{
    inp.addEventListener("input", ()=>{
      const id = inp.getAttribute("data-id");
      const k  = inp.getAttribute("data-k");
      const list = inp.getAttribute("data-list");
      const arr = list === "interval" ? window.tasksInterval : window.tasksAsReq;
      const t = arr.find(x => String(x.id)===String(id));
      if (!t) return;
      let v = inp.value;
      if (["interval","price"].includes(k)){
        v = (v === "" ? null : Number(v));
      }
      t[k] = v;
      if (typeof saveTasks === "function") try{ saveTasks(); }catch(_){}
      if (typeof saveCloudDebounced === "function") try{ saveCloudDebounced(); }catch(_){}
    });
  });

  // Remove + Complete
  root.querySelectorAll("[data-remove]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-remove");
      const from = btn.getAttribute("data-from");
      if (from==="interval"){
        window.tasksInterval = window.tasksInterval.filter(t=>String(t.id)!==String(id));
      }else{
        window.tasksAsReq = window.tasksAsReq.filter(t=>String(t.id)!==String(id));
      }
      if (typeof saveTasks === "function") try{ saveTasks(); }catch(_){}
      if (typeof saveCloudDebounced === "function") try{ saveCloudDebounced(); }catch(_){}
      renderSettings();
    });
  });
  root.querySelectorAll(".btn-complete").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-complete");
      const t = window.tasksInterval.find(x=>String(x.id)===String(id));
      if (!t) return;
      const cur = (typeof currentTotal === "function") ? currentTotal() : null;
      t.anchorTotal = cur!=null ? cur : 0;
      t.sinceBase = 0;
      if (typeof saveTasks === "function") try{ saveTasks(); }catch(_){}
      if (typeof saveCloudDebounced === "function") try{ saveCloudDebounced(); }catch(_){}
      renderSettings();
    });
  });

  // --- Drag & Drop (tasks + folders) ---
  const tree = document.getElementById("tree");
  const DRAG = { kind:null, id:null, type:null }; // type = interval|asreq for tasks

  tree.addEventListener("dragstart",(e)=>{
    const sum = e.target.closest("summary");
    if (!sum) return;
    const cardTask = sum.closest("details.task");
    const cardCat  = sum.closest("details.cat");
    if (cardTask){
      DRAG.kind = "task";
      DRAG.id   = cardTask.getAttribute("data-task-id");
      DRAG.type = cardTask.getAttribute("data-owner");
      e.dataTransfer.setData("text/plain", `task:${DRAG.id}:${DRAG.type}`);
      e.dataTransfer.effectAllowed = "move";
      sum.classList.add("drop-hint");
    }else if (cardCat){
      DRAG.kind = "category";
      DRAG.id   = cardCat.getAttribute("data-cat-id");
      e.dataTransfer.setData("text/plain", `category:${DRAG.id}`);
      e.dataTransfer.effectAllowed = "move";
      sum.classList.add("drop-hint");
    }
  });
  tree.addEventListener("dragend", ()=>{
    tree.querySelectorAll(".drop-hint").forEach(x=>x.classList.remove("drop-hint"));
    tree.querySelectorAll(".dz.dragover").forEach(x=>x.classList.remove("dragover"));
    DRAG.kind = DRAG.id = DRAG.type = null;
  });

  function allow(e){ e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
  tree.addEventListener("dragover",(e)=>{
    const dz  = e.target.closest(".dz");
    const sum = e.target.closest("summary");
    if (dz){ allow(e); dz.classList.add("dragover"); }
    if (sum){ allow(e); sum.classList.add("drop-hint"); }
  });
  tree.addEventListener("dragleave",(e)=>{
    const dz  = e.target.closest(".dz"); dz?.classList.remove("dragover");
    const sum = e.target.closest("summary"); sum?.classList.remove("drop-hint");
  });

  tree.addEventListener("drop",(e)=>{
    const raw = e.dataTransfer.getData("text/plain") || "";
    const parts = raw.split(":");
    const kind  = parts[0];
    const id    = parts[1] || null;
    const type  = parts[2] || null;

    const dzRoot = e.target.closest("[data-drop-root]");
    const dzInto = e.target.closest("[data-drop-into-cat]");
    const onSum  = e.target.closest("summary");

    e.preventDefault();

    // TASK moves
    if (kind==="task" && id){
      if (dzRoot){
        if (typeof moveNodeSafely === "function" ? moveNodeSafely("task", id, { intoCat: null }) : (()=>{
          // Fallback simple move: remove from both lists, push to top with cat=null
          let ref = (type==="interval" ? window.tasksInterval : window.tasksAsReq).find(x=>String(x.id)===String(id));
          if (!ref) return false;
          // Remove from possible .sub locations is handled by moveNodeSafely only.
          ref.cat = null; ref.parentTask = null; ref.order = ++window._maintOrderCounter;
          return true;
        })()){
          if (typeof saveTasks === "function") try{ saveTasks(); }catch(_){}
          if (typeof saveCloudDebounced === "function") try{ saveCloudDebounced(); }catch(_){}
          renderSettings();
        }
        return;
      }
      if (dzInto){
        const catId = dzInto.getAttribute("data-drop-into-cat");
        if (typeof moveNodeSafely === "function" ? moveNodeSafely("task", id, { intoCat: catId }) : (()=>{
          let ref = (type==="interval" ? window.tasksInterval : window.tasksAsReq).find(x=>String(x.id)===String(id));
          if (!ref) return false;
          ref.cat = catId; ref.parentTask = null; ref.order = ++window._maintOrderCounter;
          return true;
        })()){
          if (typeof saveTasks === "function") try{ saveTasks(); }catch(_){}
          if (typeof saveCloudDebounced === "function") try{ saveCloudDebounced(); }catch(_){}
          renderSettings();
        }
        return;
      }
      if (onSum){
        // Reorder before another task in the same container
        const t2 = onSum.closest("details.task");
        const beforeId = t2?.getAttribute("data-task-id");
        if (beforeId && typeof moveNodeSafely === "function" && moveNodeSafely("task", id, { beforeTask: { id: beforeId } })){
          if (typeof saveTasks === "function") try{ saveTasks(); }catch(_){}
          if (typeof saveCloudDebounced === "function") try{ saveCloudDebounced(); }catch(_){}
          renderSettings();
        }
        return;
      }
    }

    // CATEGORY moves
    if (kind==="category" && id){
      if (dzRoot){
        if (typeof moveNodeSafely === "function" && moveNodeSafely("category", id, { intoCat: null })){
          if (typeof saveCloudDebounced === "function") try{ saveCloudDebounced(); }catch(_){}
          renderSettings();
        }
        return;
      }
      if (dzInto){
        const parent = dzInto.getAttribute("data-drop-into-cat");
        if (typeof moveNodeSafely === "function" && moveNodeSafely("category", id, { intoCat: parent })){
          if (typeof saveCloudDebounced === "function") try{ saveCloudDebounced(); }catch(_){}
          renderSettings();
        }
        return;
      }
      if (onSum){
        const holder = onSum.closest("details.cat");
        const beforeId = holder?.getAttribute("data-cat-id");
        if (beforeId && typeof moveNodeSafely === "function" && moveNodeSafely("category", id, { beforeCat: { id: beforeId } })){
          if (typeof saveCloudDebounced === "function") try{ saveCloudDebounced(); }catch(_){}
          renderSettings();
        }
        return;
      }
    }
  });
}


// ---- Costs page (placeholder to satisfy router & nav) ----
function renderCosts(){
  const content = document.getElementById("content");
  if (!content) return;

  content.innerHTML = `
    <div class="container">
      <div class="block" style="grid-column:1 / -1">
        <h3>Cost Analysis</h3>
        <p class="small">Placeholder view. This exists so the #/costs route and the top-nav button do not break other pages. We can flesh this out later.</p>
      </div>
    </div>
  `;
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

