/* ========================= VIEWS ========================== */
function viewDashboard(){
  const cur   = RENDER_TOTAL ?? currentTotal();
  const prev  = previousTotal();
  const delta = RENDER_DELTA ?? deltaSinceLast();
  const lastEntry = totalHistory.length ? totalHistory[totalHistory.length - 1] : null;
  const lastUpdated = cur!=null && lastEntry && lastEntry.dateISO
    ? new Date(lastEntry.dateISO).toLocaleString()
    : "—";
  return `
  <div class="container">
    <div class="dashboard-top">
      <!-- Total hours -->
      <div class="block total-hours-block">
        <h3>Total Hours</h3>
        <div class="total-hours-controls mini-form">
          <label class="total-hours-label"><span>Enter total hours now:</span>
            <input type="number" id="totalInput" value="${cur!=null?cur:""}" />
          </label>
          <button id="logBtn">Log Hours</button>
        </div>
        <div class="total-hours-meta" aria-live="polite">
          <span class="hint">Last updated: ${lastUpdated}</span>
          <span class="small">Δ since last: <b>${(delta||0).toFixed(0)} hrs</b>${prev!=null? " (prev "+prev+")":""}</span>
        </div>
      </div>
    </div>

    <!-- Pump Efficiency widget (rendered by renderPumpWidget) -->
    <section id="pump-widget" class="block pump-wide"></section>

    <!-- Calendar -->
    <div class="block" style="grid-column: 1 / -1">
      <h3>Calendar (Current + Next 2 Months)</h3>

      <div class="calendar-toolbar">
        <button type="button" class="calendar-add-btn" id="calendarAddBtn" title="Add maintenance task, down time, or job">+</button>
      </div>

      <div id="months"></div>
      <div class="small">Hover a due item for actions. Click to pin the bubble.</div>
    </div>
  </div>

  <div class="modal-backdrop" id="dashboardAddModal" hidden>
    <div class="modal-card dashboard-modal-card">
      <button type="button" class="modal-close" id="dashboardModalClose">×</button>

      <section class="dash-modal-step" data-step="picker">
        <h4>What would you like to add?</h4>
        <div class="dash-choice-grid">
          <button type="button" class="dash-choice" data-choice="task">Maintenance Task</button>
          <button type="button" class="dash-choice" data-choice="downtime">Down Time</button>
          <button type="button" class="dash-choice" data-choice="job">Cutting Job</button>
        </div>
      </section>

      <section class="dash-modal-step" data-step="task" hidden>
        <h4>Add maintenance task</h4>
        <form id="dashTaskForm" class="modal-form">
          <div class="modal-grid">
            <label>Task name<input id="dashTaskName" required placeholder="Task"></label>
            <label>Type<select id="dashTaskType">
              <option value="interval">Per interval</option>
              <option value="asreq">As required</option>
            </select></label>
            <label data-task-frequency>Frequency (hrs)<input type="number" min="1" step="1" id="dashTaskInterval" placeholder="e.g. 40"></label>
            <label data-task-last>Last serviced at (hrs)<input type="number" min="0" step="0.01" id="dashTaskLast" placeholder="optional"></label>
            <label data-task-condition hidden>Condition / trigger<input id="dashTaskCondition" placeholder="e.g. When clogged"></label>
            <label>Manual link<input type="url" id="dashTaskManual" placeholder="https://..."></label>
            <label>Store link<input type="url" id="dashTaskStore" placeholder="https://..."></label>
            <label>Part #<input id="dashTaskPN" placeholder="Part number"></label>
            <label>Price ($)<input type="number" min="0" step="0.01" id="dashTaskPrice" placeholder="optional"></label>
            <label>Category<select id="dashTaskCategory"></select></label>
          </div>

          <div class="subtask-section">
            <div class="subtask-header">
              <h5>Sub-tasks</h5>
              <button type="button" id="dashAddSubtask" class="subtask-add-btn">+ Add sub-task</button>
            </div>
            <div id="dashSubtaskList" class="subtask-list"></div>
            <p class="small muted">Sub-tasks inherit the calendar display and live under the main task.</p>
          </div>

          <div class="modal-actions">
            <button type="button" class="secondary" data-step-back>Back</button>
            <button type="submit" class="primary">Create Task</button>
          </div>
        </form>
      </section>

      <section class="dash-modal-step" data-step="downtime" hidden>
        <h4>Mark machine down time</h4>
        <form id="dashDownForm" class="modal-form">
          <div class="modal-grid">
            <label>Down time date<input type="date" id="dashDownDate" required></label>
          </div>
          <div class="modal-actions">
            <button type="button" class="secondary" data-step-back>Back</button>
            <button type="submit" class="primary">Save</button>
          </div>
        </form>
        <div id="dashDownList" class="down-list"></div>
      </section>

      <section class="dash-modal-step" data-step="job" hidden>
        <h4>Add cutting job</h4>
        <form id="dashJobForm" class="modal-form">
          <div class="modal-grid">
            <label>Job name<input id="dashJobName" required placeholder="Job"></label>
            <label>Estimate (hrs)<input type="number" min="1" step="0.1" id="dashJobEstimate" required placeholder="e.g. 12"></label>
            <label>Start date<input type="date" id="dashJobStart" required></label>
            <label>Due date<input type="date" id="dashJobDue" required></label>
          </div>
          <div class="modal-actions">
            <button type="button" class="secondary" data-step-back>Back</button>
            <button type="submit" class="primary">Add Job</button>
          </div>
        </form>
      </section>
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



function viewCosts(model){
  const data = model || {};
  const esc = (str)=> String(str ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

  const cards = Array.isArray(data.summaryCards) ? data.summaryCards : [];
  const timeframeRows = Array.isArray(data.timeframeRows) ? data.timeframeRows : [];
  const historyRows = Array.isArray(data.historyRows) ? data.historyRows : [];
  const jobBreakdown = Array.isArray(data.jobBreakdown) ? data.jobBreakdown : [];
  const jobSummary = data.jobSummary || { countLabel:"0", totalLabel:"$0", averageLabel:"$0", rollingLabel:"$0" };
  const maintenanceJobsNote = data.maintenanceJobsNote || "";
  const maintenanceJobsEmpty = data.maintenanceJobsEmpty || "";
  const chartColors = data.chartColors || { maintenance:"#0a63c2", jobs:"#2e7d32" };

  return `
  <div class="container cost-layout">
    <div class="block" style="grid-column:1 / -1">
      <h3>Cost Overview</h3>
      <div class="cost-summary-grid">
        ${cards.length ? cards.map(card => `
          <div class="cost-card">
            <div class="cost-card-icon">${esc(card.icon || "")}</div>
            <div class="cost-card-body">
              <div class="cost-card-title">${esc(card.title || "")}</div>
              <div class="cost-card-value">${esc(card.value || "")}</div>
              <div class="cost-card-hint">${esc(card.hint || "")}</div>
            </div>
          </div>
        `).join("") : `<p class="small muted">No cost metrics yet. Log machine hours and add pricing to interval tasks.</p>`}
      </div>
    </div>

    <div class="block cost-chart-block" style="grid-column:1 / -1">
      <div class="cost-chart-header">
        <h3>Estimated Cost Trends</h3>
        <div class="cost-chart-toggle">
          <label><input type="checkbox" id="toggleCostMaintenance" checked> <span class="dot" style="background:${esc(chartColors.maintenance)}"></span> Maintenance</label>
          <label><input type="checkbox" id="toggleCostJobs" checked> <span class="dot" style="background:${esc(chartColors.jobs)}"></span> Cutting jobs</label>
        </div>
      </div>
      <canvas id="costChart" width="780" height="240"></canvas>
      ${data.chartNote ? `<p class="small muted">${esc(data.chartNote)}</p>` : `<p class="small muted">Toggle a line to explore how maintenance and job efficiency costs evolve over time.</p>`}
    </div>

    <div class="block">
      <h3>Maintenance Cost Windows</h3>
      ${timeframeRows.length ? `
        <table class="cost-table">
          <thead><tr><th>Window</th><th>Usage</th><th>Estimated spend</th><th>Projected next window</th></tr></thead>
          <tbody>
            ${timeframeRows.map(row => `
              <tr>
                <td>${esc(row.label || "")}</td>
                <td>${esc(row.hoursLabel || "")}</td>
                <td>${esc(row.costLabel || "")}</td>
                <td>${esc(row.projectedLabel || "")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : `<p class="small muted">No usage windows yet. Log machine hours to calculate maintenance spending.</p>`}
      ${data.timeframeNote ? `<p class="small muted">${esc(data.timeframeNote)}</p>` : ""}
    </div>

    <div class="block">
      <h3>Recent Maintenance Events</h3>
      ${historyRows.length ? `
        <ul class="cost-history">
          ${historyRows.map(item => `
            <li>
              <span>${esc(item.dateLabel || "")}</span>
              <span>${esc(item.hoursLabel || "")}</span>
              <span>${esc(item.costLabel || "")}</span>
            </li>
          `).join("")}
        </ul>
      ` : `<p class="small muted">${esc(data.historyEmpty || "No usage history yet. Log machine hours to estimate maintenance spend.")}</p>`}
    </div>

    <div class="block">
      <h3>Maintenance Job Tracker</h3>
      ${maintenanceJobsNote ? `<p class="small muted">${esc(maintenanceJobsNote)}</p>` : ""}
      ${maintenanceJobsEmpty ? `<p class="small muted">${esc(maintenanceJobsEmpty)}</p>` : ""}
    </div>

    <div class="block">
      <h3>Cutting Job Efficiency Snapshot</h3>
      <div class="cost-jobs-summary">
        <div><span class="label">Jobs tracked</span><span>${esc(jobSummary.countLabel || "0")}</span></div>
        <div><span class="label">Total gain / loss</span><span>${esc(jobSummary.totalLabel || "$0")}</span></div>
        <div><span class="label">Avg per job</span><span>${esc(jobSummary.averageLabel || "$0")}</span></div>
        <div><span class="label">Rolling avg (chart)</span><span>${esc(jobSummary.rollingLabel || "$0")}</span></div>
      </div>
      ${jobBreakdown.length ? `
        <table class="cost-table">
          <thead><tr><th>Job</th><th>Milestone</th><th>Status</th><th>Cost impact</th></tr></thead>
          <tbody>
            ${jobBreakdown.map(job => `
              <tr>
                <td>${esc(job.name || "")}</td>
                <td>${esc(job.dateLabel || "")}</td>
                <td>${esc(job.statusLabel || "")}</td>
                <td>${esc(job.costLabel || "")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : `<p class="small muted">${esc(data.jobEmpty || "Add cutting jobs with estimates to build the efficiency tracker.")}</p>`}
    </div>
  </div>`;
}

function viewJobs(){
  const pendingFiles = Array.isArray(window.pendingNewJobFiles) ? window.pendingNewJobFiles : [];
  const pendingSummary = pendingFiles.length
    ? `${pendingFiles.length} file${pendingFiles.length===1?"":"s"} ready to attach`
    : "No files selected";
  const rows = cuttingJobs.map(j => {
    const jobFiles = Array.isArray(j.files) ? j.files : [];
    const fileLinks = jobFiles.length
      ? `<div class="job-files">${jobFiles.map((f, idx) => {
          const safeName = f.name || `file_${idx+1}`;
          const href = f.dataUrl || f.url || "";
          if (!href) return "";
          return `<a href="${href}" download="${safeName}" class="job-file-link">📎 ${safeName}</a>`;
        }).filter(Boolean).join("<br>")}</div>`
      : "";
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
          ${fileLinks}
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
          <div class="job-edit-files">
            <button type="button" data-upload-job="${j.id}">Add Files</button>
            <input type="file" data-job-file-input="${j.id}" multiple style="display:none">
            <ul class="job-file-list">
              ${jobFiles.length ? jobFiles.map((f, idx)=>{
                const safeName = f.name || `file_${idx+1}`;
                const href = f.dataUrl || f.url || "";
                const link = href ? `<a href="${href}" download="${safeName}">${safeName}</a>` : safeName;
                return `<li>${link} <button type="button" class="link" data-remove-file="${j.id}" data-file-index="${idx}">Remove</button></li>`;
              }).join("") : `<li class=\"muted\">No files attached</li>`}
            </ul>
          </div>
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
        <button type="button" id="jobFilesBtn">Attach Files</button>
        <input type="file" id="jobFiles" multiple style="display:none">
        <button type="submit">Add Job</button>
      </form>
      <div class="small muted job-files-summary" id="jobFilesSummary">${pendingSummary}</div>

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

function filterInventoryItems(term){
  const query = (term || "").trim().toLowerCase();
  if (!query) return inventory.slice();
  return inventory.filter(item => {
    const fields = [item.name, item.unit, item.pn, item.note, item.link];
    return fields.some(f => {
      if (f == null) return false;
      const text = String(f).toLowerCase();
      return text.includes(query);
    });
  });
}

function inventoryRowsHTML(list){
  if (!Array.isArray(list) || !list.length){
    return `<tr><td colspan="6" class="muted">No inventory items match your search.</td></tr>`;
  }
  return list.map(i => `
    <tr>
      <td>${i.name}</td>
      <td><input type="number" min="0" step="1" data-inv="qty" data-id="${i.id}" value="${i.qty}"></td>
      <td>${i.unit||"pcs"}</td>
      <td>${i.pn||"—"}</td>
      <td>${i.link ? `<a href="${i.link}" target="_blank" rel="noopener">link</a>` : "—"}</td>
      <td><input type="text" data-inv="note" data-id="${i.id}" value="${i.note||""}"></td>
    </tr>`).join("");
}

function viewInventory(){
  const filtered = filterInventoryItems(inventorySearchTerm);
  const rows = inventoryRowsHTML(filtered);
  const searchValue = String(inventorySearchTerm || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `
  <div class="container">
    <div class="block" style="grid-column:1 / -1">
      <h3>Inventory</h3>
      <div class="mini-form" style="margin-bottom:8px;">
        <input type="search" id="inventorySearch" placeholder="Search items, part numbers, notes, or links" value="${searchValue}">
        <button type="button" id="inventorySearchClear">Clear</button>
      </div>
      <div class="small muted" style="margin-bottom:8px;">Results update as you type.</div>
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>PN</th><th>Link</th><th>Note</th></tr></thead>
        <tbody data-inventory-rows>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

