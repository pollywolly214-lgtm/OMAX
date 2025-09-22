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
<details data-task-id="${task.id}" data-list="interval">
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
<details data-task-id="${task.id}" data-list="asreq">
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

function renderSettingsCategoriesPane(){
  // ----- Guards & state -----
  const root = document.getElementById("content");
  if (!root) return;

  // Ensure lists exist
  window.settingsFolders = Array.isArray(window.settingsFolders) ? window.settingsFolders : [];
  window.tasksInterval   = Array.isArray(window.tasksInterval)   ? window.tasksInterval   : [];
  window.tasksAsReq      = Array.isArray(window.tasksAsReq)      ? window.tasksAsReq      : [];
  if (typeof window._maintOrderCounter === "undefined") window._maintOrderCounter = 0;

  // Save helpers (support local + cloud)
  function persist(){
    if (typeof saveTasks === "function") { try { saveTasks(); } catch(_){} }
    if (typeof saveCloudDebounced === "function") { try { saveCloudDebounced(); } catch(_){} }
  }

  // Small helpers
// Give every task a category so the explorer can find them
function ensureTaskCategories(){
  // interval tasks live under the "interval" folder
  if (Array.isArray(tasksInterval)) {
    tasksInterval.forEach(t => { if (!t.cat) t.cat = "interval"; });
  }
  // as-required tasks live under the "asreq" folder
  if (Array.isArray(tasksAsReq)) {
    tasksAsReq.forEach(t => { if (!t.cat) t.cat = "asreq"; });
  }
}

   
  const byIdFolder = id => window.settingsFolders.find(f => String(f.id)===String(id)) || null;
  const hasChildren = (fid)=>{
    const subF = window.settingsFolders.some(f => String(f.parent||"")===String(fid));
    const tInt = window.tasksInterval.some(t => String(t.cat||"")===String(fid));
    const tAR  = window.tasksAsReq.some(t => String(t.cat||"")===String(fid));
    return subF || tInt || tAR;
  };
  const findTask = (id)=>{
    let ref = window.tasksInterval.find(x=>String(x.id)===String(id));
    if (ref) return {ref, list:"interval"};
    ref = window.tasksAsReq.find(x=>String(x.id)===String(id));
    return ref ? {ref, list:"asreq"} : null;
  };

  // ===== 1) Root "Add Category" button =====
  const addBtn = root.querySelector("#addFolderBtn");
  if (addBtn && !addBtn.dataset.wired){
    addBtn.dataset.wired = "1";
    addBtn.addEventListener("click", ()=>{
      const name = prompt("New category (folder) name?");
      if (!name) return;
      const id = (name.toLowerCase().replace(/[^a-z0-9]+/g,"_") + "_" + Math.random().toString(36).slice(2,7));
      window.settingsFolders.push({ id, name, parent:null, order:(++window._maintOrderCounter) });
      persist();
      // Re-render full Settings so the new folder appears in both menus.
      if (typeof renderSettings === "function") renderSettings();
    });
  }

  // ===== 2) Per-folder controls: add sub, rename, remove =====
  // Add Sub-category
  root.querySelectorAll("[data-add-subfolder]").forEach(btn=>{
    if (btn.dataset.wired) return; btn.dataset.wired = "1";
    btn.addEventListener("click", ()=>{
      const parent = btn.getAttribute("data-add-subfolder");
      if (!byIdFolder(parent)) { alert("Folder not found."); return; }
      const name = prompt("Sub-category name?");
      if (!name) return;
      const id = (name.toLowerCase().replace(/[^a-z0-9]+/g,"_") + "_" + Math.random().toString(36).slice(2,7));
      window.settingsFolders.push({ id, name, parent, order:(++window._maintOrderCounter) });
      persist();
      if (typeof renderSettings === "function") renderSettings();
    });
  });

  // Rename
  root.querySelectorAll("[data-rename-folder]").forEach(btn=>{
    if (btn.dataset.wired) return; btn.dataset.wired = "1";
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-rename-folder");
      const f = byIdFolder(id); if (!f) return;
      const name = prompt("New folder name:", f.name || "");
      if (!name) return;
      f.name = name;
      persist();
      if (typeof renderSettings === "function") renderSettings();
    });
  });

  // Remove (blocked if anything inside)
  root.querySelectorAll("[data-remove-folder]").forEach(btn=>{
    if (btn.dataset.wired) return; btn.dataset.wired = "1";
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-remove-folder");
      if (!byIdFolder(id)) return;
      if (hasChildren(id)){
        alert("Folder is not empty. Move out sub-folders and tasks first.");
        return;
      }
      window.settingsFolders = window.settingsFolders.filter(f => String(f.id)!==String(id));
      persist();
      if (typeof renderSettings === "function") renderSettings();
    });
  });

  // ===== 3) Make folder headers draggable (Explorer-style) =====
  root.querySelectorAll('details.folder > summary').forEach(sum=>{
    if (sum.dataset.wired) return; sum.dataset.wired="1";
    sum.setAttribute("draggable","true");
    sum.addEventListener("dragstart",(e)=>{
      const holder = sum.closest("details.folder");
      const fid = holder?.getAttribute("data-folder-id");
      if (!fid) return;
      e.dataTransfer.setData("text/plain", `category:${fid}`);
      e.dataTransfer.effectAllowed = "move";
      sum.classList.add("dragging");
    });
    sum.addEventListener("dragend",()=> sum.classList.remove("dragging"));
  });

  // ===== 4) Drag targets: drop into a folder’s body (to file items here) =====
  function allow(e){ e.preventDefault(); e.dataTransfer.dropEffect = "move"; }

  // Drop tasks or folders into a folder
  root.querySelectorAll("[data-drop-folder]").forEach(zone=>{
    if (zone.dataset.wired) return; zone.dataset.wired = "1";
    zone.addEventListener("dragover",(e)=>{ allow(e); zone.classList.add("dragover"); });
    zone.addEventListener("dragleave",()=> zone.classList.remove("dragover"));
    zone.addEventListener("drop",(e)=>{
      const fid = zone.getAttribute("data-drop-folder");
      zone.classList.remove("dragover");
      const raw = e.dataTransfer.getData("text/plain") || "";
      const [kind, id, type] = raw.split(":"); // task:<id>:<interval|asreq> | category:<id>
      if (!fid) return;

      // Drop a TASK into this folder
      if (kind === "task" && id){
        // Prefer shared mover if present; else set cat directly.
        if (typeof moveNodeSafely === "function"){
          if (moveNodeSafely("task", id, { intoCat: fid })){
            persist(); if (typeof renderSettings === "function") renderSettings();
          }
          return;
        }
        const t = findTask(id); if (!t) return;
        t.ref.cat = fid; t.ref.parentTask = null; t.ref.order = (++window._maintOrderCounter);
        persist(); if (typeof renderSettings === "function") renderSettings();
        return;
      }

      // Drop a FOLDER into this folder (re-parent)
      if (kind === "category" && id){
        if (typeof moveNodeSafely === "function"){
          if (moveNodeSafely("category", id, { intoCat: fid })){
            persist(); if (typeof renderSettings === "function") renderSettings();
          }
          return;
        }
        const f = byIdFolder(id); if (!f) return;
        // Prevent cycle
        let cur = byIdFolder(fid), hops=0;
        while (cur && hops++<1000){
          if (String(cur.id)===String(id)) return; // cycle; ignore
          cur = (cur.parent!=null) ? byIdFolder(cur.parent) : null;
        }
        f.parent = fid; f.order = (++window._maintOrderCounter);
        persist(); if (typeof renderSettings === "function") renderSettings();
      }
    });
  });

  // ===== 5) Drag targets: drop onto a menu header to change type (Interval <-> As-Needed) =====
  root.querySelectorAll("[data-drop-menu]").forEach(zone=>{
    if (zone.dataset.wired) return; zone.dataset.wired = "1";
    zone.addEventListener("dragover",(e)=>{ allow(e); zone.classList.add("dragover"); });
    zone.addEventListener("dragleave",()=> zone.classList.remove("dragover"));
    zone.addEventListener("drop",(e)=>{
      const targetMenu = zone.getAttribute("data-drop-menu"); // "interval" | "asreq"
      zone.classList.remove("dragover");
      const raw = e.dataTransfer.getData("text/plain") || "";
      const [kind, id, fromType] = raw.split(":");

      if (kind !== "task" || !id || !targetMenu) return;
      const live = findTask(id); if (!live) return;

      // If moving to same menu, just file at root (no folder)
      if (live.list === targetMenu){
        if (typeof moveNodeSafely === "function"){
          if (moveNodeSafely("task", id, { intoCat: null })){
            persist(); if (typeof renderSettings === "function") renderSettings();
          }
          return;
        }
        live.ref.cat = null; live.ref.parentTask = null; live.ref.order = (++window._maintOrderCounter);
        persist(); if (typeof renderSettings === "function") renderSettings();
        return;
      }

      // Convert type (Explorer-like "move to another tree")
      if (targetMenu === "interval" && live.list === "asreq"){
        // Ask for interval hours
        let val = prompt("Interval hours for this item?", "8");
        if (val === null) return;
        val = Number(val);
        if (!isFinite(val) || val <= 0) { alert("Enter a positive number."); return; }
        // Remove from asreq and insert at TOP of interval (keep same id for continuity)
        window.tasksAsReq = window.tasksAsReq.filter(x => String(x.id)!==String(live.ref.id));
        const moved = {
          id: live.ref.id, name: live.ref.name, interval: val,
          sinceBase: null, anchorTotal: null,
          manualLink: live.ref.manualLink||"", storeLink: live.ref.storeLink||"",
          pn: live.ref.pn||"", price: live.ref.price!=null?live.ref.price:null,
          parentTask: null, cat: null, order:(++window._maintOrderCounter)
        };
        window.tasksInterval.unshift(moved);
        persist(); if (typeof renderSettings === "function") renderSettings();
        return;
      }

      if (targetMenu === "asreq" && live.list === "interval"){
        // Convert to As-Required (condition optional)
        const cond = prompt("Condition/Notes (optional):", live.ref.condition||"As required") || "As required";
        window.tasksInterval = window.tasksInterval.filter(x => String(x.id)!==String(live.ref.id));
        const moved = {
          id: live.ref.id, name: live.ref.name, condition: cond,
          manualLink: live.ref.manualLink||"", storeLink: live.ref.storeLink||"",
          pn: live.ref.pn||"", price: live.ref.price!=null?live.ref.price:null,
          parentTask: null, cat: null, order:(++window._maintOrderCounter)
        };
        window.tasksAsReq.unshift(moved);
        persist(); if (typeof renderSettings === "function") renderSettings();
        return;
      }
    });
  });

  // ===== 6) Also allow dropping a task directly on a folder header (summary) =====
  root.querySelectorAll("details.folder > summary").forEach(sum=>{
    if (sum.dataset.dropWired) return; sum.dataset.dropWired="1";
    sum.addEventListener("dragover",(e)=>{ allow(e); sum.classList.add("drop-hint"); });
    sum.addEventListener("dragleave",()=> sum.classList.remove("drop-hint"));
    sum.addEventListener("drop",(e)=>{
      const holder = sum.closest("details.folder");
      const fid = holder?.getAttribute("data-folder-id");
      sum.classList.remove("drop-hint");
      const raw = e.dataTransfer.getData("text/plain") || "";
      const [kind, id] = raw.split(":");
      if (!fid || kind!=="task" || !id) return;

      if (typeof moveNodeSafely === "function"){
        if (moveNodeSafely("task", id, { intoCat: fid })){
          persist(); if (typeof renderSettings === "function") renderSettings();
        }
        return;
      }
      const live = findTask(id); if (!live) return;
      live.ref.cat = fid; live.ref.parentTask = null; live.ref.order = (++window._maintOrderCounter);
      persist(); if (typeof renderSettings === "function") renderSettings();
    });
  });
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
    const actualRemain = eff.actualRemaining != null ? eff.actualRemaining : (req.remainingHours || 0);
    const baselineRemain = eff.expectedRemaining != null
      ? eff.expectedRemaining
      : Math.max(0, (Number(j.estimateHours)||0) - (eff.expectedHours||0));
    const remainHrs = actualRemain;
    const needPerDay = req.requiredPerDay === Infinity
      ? '∞'
      : (req.requiredPerDay||0).toFixed(2);

    // Cost efficiency (baseline vs actual remaining hours)
    const EPS = 0.05;
    const deltaRemain = baselineRemain - actualRemain;
    const ahead = deltaRemain > EPS;
    const behind = deltaRemain < -EPS;
    const nearPace = !ahead && !behind;
    const rawMoney = eff.gainLoss || 0;
    const money = nearPace ? 0 : rawMoney;
    const moneyStyle = ahead
      ? 'color:#2e7d32;font-weight:600'
      : (behind ? 'color:#c43d3d;font-weight:600' : 'color:#424242;font-weight:600');
    const moneySign  = ahead ? '+' : (behind ? '−' : '');
    const moneyAbs   = Math.abs(money).toFixed(2);
    const statusLabel = nearPace ? 'On pace' : (ahead ? 'Ahead' : 'Behind');
    const statusDetail = nearPace
      ? ''
      : ` by ${Math.abs(deltaRemain).toFixed(1)} hr`;
    const baselineDetail = `${baselineRemain.toFixed(1)}h baseline vs ${actualRemain.toFixed(1)}h remaining`;
    const statusSummary = statusLabel + (statusDetail || '');
    const efficiencyDetail = `${statusSummary}; ${baselineDetail}`;

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
        <td>
          <div><span style="${moneyStyle}">${moneySign}$${moneyAbs}</span></div>
          <div class="small muted">${efficiencyDetail}</div>
        </td>
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
            <th>Estimated Cost (Calculated)</th>
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

