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
    <div class="dashboard-toolbar">
      <span class="dashboard-edit-hint" id="dashboardEditHint" hidden>Drag windows to rearrange and resize. Calendar stays fixed.</span>
    </div>

    <div class="dashboard-layout" id="dashboardLayout">
      <div class="dashboard-window" data-dashboard-window="totalHours">
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

      <div class="dashboard-window" data-dashboard-window="nextDue">
        <div class="block next-due-block">
          <h3>Next Due</h3>
          <div id="nextDueBox">Calculating…</div>
        </div>
      </div>

      <div class="dashboard-window" data-dashboard-window="pumpLog">
        <section id="pump-log-widget" class="block pump-log-block"></section>
      </div>

      <div class="dashboard-window" data-dashboard-window="pumpChart">
        <section id="pump-chart-widget" class="block pump-chart-block"></section>
      </div>
    </div>

    <div class="block calendar-block">
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
          <button type="button" class="dash-choice" data-choice="garnet">Garnet Cleaning</button>
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
            <label data-task-last>Hours since last service<input type="number" min="0" step="0.01" id="dashTaskLast" placeholder="optional"></label>
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

      <section class="dash-modal-step" data-step="garnet" hidden>
        <h4>Schedule Garnet cleaning</h4>
        <form id="dashGarnetForm" class="modal-form">
          <div class="modal-grid">
            <label>Date<input type="date" id="dashGarnetDate" required></label>
            <label>Start time<input type="time" id="dashGarnetStart" required value="08:00"></label>
            <label>End time<input type="time" id="dashGarnetEnd" required value="12:00"></label>
            <label>Notes<input id="dashGarnetNote" placeholder="Optional note"></label>
          </div>
          <div class="modal-actions garnet-actions">
            <button type="button" class="secondary" data-step-back>Back</button>
            <div class="garnet-action-buttons">
              <button type="button" class="secondary" id="dashGarnetCancel" hidden>Cancel edit</button>
              <button type="submit" class="primary" id="dashGarnetSubmit">Add Cleaning</button>
            </div>
          </div>
        </form>
        <div id="dashGarnetList" class="garnet-list"></div>
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
  const rootFolderId = typeof window.ROOT_FOLDER_ID === "string" ? window.ROOT_FOLDER_ID : "root";
  const folders = window.settingsFolders;
  const kidsOf  = (parentId)=> folders.filter(f => (String(f.parent ?? null)) === (String(parentId ?? null)));
  const tasksIn = (list, folderId)=>{
    const normalizedTarget = folderId == null ? rootFolderId : folderId;
    return (Array.isArray(list)?list:[]).filter(t => {
      const cat = t.cat == null ? rootFolderId : t.cat;
      return String(cat) === String(normalizedTarget);
    });
  };

  const renderFolder = (folder, listType) => {
    const subFolderList = kidsOf(folder.id);
    const subFolders = subFolderList.map(sf => `
      <div class="folder-dropzone folder-dropzone-line small muted" data-drop-before-folder="${sf.id}"
           style="border:1px dashed #bbb; padding:6px; margin:4px 0; border-radius:8px;">
        Drag folders here to place before <b>${sf.name}</b>
      </div>
      ${renderFolder(sf, listType)}
    `).join("");
    const subFolderTail = subFolderList.length ? `
      <div class="folder-dropzone folder-dropzone-line small muted" data-drop-folder-tail="${folder.id}"
           style="border:1px dashed #bbb; padding:6px; margin:4px 0 6px; border-radius:8px;">
        Drag folders here to place at the end of <b>${folder.name}</b>
      </div>` : "";
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
          ${subFolderTail}
          <div class="bubble-list" data-folder-body="${folder.id}">
            ${tasksHtml}
          </div>
        </div>
      </details>`;
  };

  // Root folders (parent=null)
  const rootFolders = kidsOf(null);
  const rootFolderTail = `
    <div class="folder-dropzone folder-dropzone-line small muted" data-drop-folder-tail=""
         style="border:1px dashed #bbb; padding:6px; margin:4px 0 6px; border-radius:8px;">
      Drag folders here to place at the end of root categories
    </div>`;

  // Root-level (no folder) tasks should appear at the top of each menu (no "Uncategorized" label).
  const rootTasksBlock = (listType)=>{
    const hasRootFolder = folders.some(f => String(f.id) === rootFolderId);
    if (hasRootFolder) return "";
    const list = (listType==="interval" ? tasksInterval : tasksAsReq);
    const items = tasksIn(list, rootFolderId).map(t => card(t, listType)).join("");
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
          ${rootFolders.map(f => `
            <div class="folder-dropzone folder-dropzone-line small muted" data-drop-before-folder="${f.id}"
                 style="border:1px dashed #bbb; padding:6px; margin:4px 0; border-radius:8px;">
              Drag folders here to place before <b>${f.name}</b>
            </div>
            ${renderFolder(f, listType)}
          `).join("")}
          ${rootFolderTail}
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
    if (typeof setSettingsFolders === "function") {
      try { setSettingsFolders(window.settingsFolders); } catch (err) {
        console.warn("Failed to sync folders before save", err);
      }
    }
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
  const normalizeFolderOrder = (parentId) => {
    const siblings = window.settingsFolders
      .filter(f => String(f.parent||"") === String(parentId||""))
      .sort((a,b)=> (Number(b.order||0) - Number(a.order||0)) || String(a.name||"").localeCompare(String(b.name||"")));
    let n = siblings.length;
    siblings.forEach(f => { f.order = n--; });
  };
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
      window.settingsFolders.push({ id, name, parent: (typeof window.ROOT_FOLDER_ID === "string" ? window.ROOT_FOLDER_ID : "root"), order:(++window._maintOrderCounter) });
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
      try {
        if (typeof recordDeletedItem === "function"){
          const folder = byIdFolder(id);
          if (folder) recordDeletedItem("folder", folder, { parent: folder.parent ?? null });
        }
      } catch (err) {
        console.warn("Failed to record deleted folder", err);
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
          if (moveNodeSafely("task", id, { intoCat: fid, position: "end" })){
            persist(); if (typeof renderSettings === "function") renderSettings();
          }
          return;
        }
        const t = findTask(id); if (!t) return;
        const rootId = typeof window.ROOT_FOLDER_ID === "string" ? window.ROOT_FOLDER_ID : "root";
        t.ref.cat = fid ? fid : rootId; t.ref.parentTask = null; t.ref.order = (++window._maintOrderCounter);
        persist(); if (typeof renderSettings === "function") renderSettings();
        return;
      }

      // Drop a FOLDER into this folder (re-parent)
      if (kind === "category" && id){
        if (typeof moveNodeSafely === "function"){
          if (moveNodeSafely("category", id, { intoCat: fid, position: "end" })){
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
        const rootId = typeof window.ROOT_FOLDER_ID === "string" ? window.ROOT_FOLDER_ID : "root";
        f.parent = fid ? fid : rootId; f.order = (++window._maintOrderCounter);
        persist(); if (typeof renderSettings === "function") renderSettings();
      }
    });
  });

  // ===== 4b) Drag targets: reorder folders among siblings =====
  root.querySelectorAll("[data-drop-before-folder],[data-drop-folder-tail]").forEach(zone=>{
    if (zone.dataset.reorderWired) return; zone.dataset.reorderWired = "1";
    zone.addEventListener("dragover",(e)=>{ allow(e); zone.classList.add("dragover"); });
    zone.addEventListener("dragleave",()=> zone.classList.remove("dragover"));
    zone.addEventListener("drop",(e)=>{
      const raw = e.dataTransfer.getData("text/plain") || "";
      zone.classList.remove("dragover");
      const [kind, id] = raw.split(":");
      if (kind !== "category" || !id) return;

      const beforeId = zone.getAttribute("data-drop-before-folder");
      if (beforeId){
        if (typeof moveNodeSafely === "function"){
          if (moveNodeSafely("category", id, { beforeCat: { id: beforeId } })){
            persist(); if (typeof renderSettings === "function") renderSettings();
          }
          return;
        }
        const dest = byIdFolder(beforeId);
        const moving = byIdFolder(id);
        const rootId = typeof window.ROOT_FOLDER_ID === "string" ? window.ROOT_FOLDER_ID : "root";
        if (!dest || !moving || String(dest.id) === String(moving.id)) return;
        const originalParent = moving.parent == null ? rootId : moving.parent;
        const newParent = dest.parent == null ? rootId : dest.parent;
        if (String(moving.id) === rootId) return;
        moving.parent = newParent;
        moving.order = (Number(dest.order) || 0) + 0.5;
        normalizeFolderOrder(newParent);
        if (String(originalParent||"") !== String(newParent||"")){
          normalizeFolderOrder(originalParent);
        }
        persist(); if (typeof renderSettings === "function") renderSettings();
        return;
      }

      if (zone.hasAttribute("data-drop-folder-tail")){
        const parentAttr = zone.getAttribute("data-drop-folder-tail");
        const parentId = parentAttr === "" ? null : parentAttr;
        if (typeof moveNodeSafely === "function"){
          if (moveNodeSafely("category", id, { intoCat: parentId, position: "end" })){
            persist(); if (typeof renderSettings === "function") renderSettings();
          }
          return;
        }
        const moving = byIdFolder(id);
        const rootId = typeof window.ROOT_FOLDER_ID === "string" ? window.ROOT_FOLDER_ID : "root";
        if (!moving) return;
        if (String(moving.id) === rootId && parentId != null) return;
        const originalParent = moving.parent == null ? rootId : moving.parent;
        if (parentId != null){
          let cur = parentId;
          let guard = 0;
          while (cur != null && guard++ < 1000){
            if (String(cur) === String(moving.id)) return;
            const next = byIdFolder(cur);
            cur = next ? (next.parent || null) : null;
          }
        }
        moving.parent = parentId == null ? rootId : parentId;
        moving.order = (++window._maintOrderCounter);
        normalizeFolderOrder(moving.parent);
        if (String(originalParent||"") !== String(moving.parent||"")){
          normalizeFolderOrder(originalParent);
        }
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
        const rootId = typeof window.ROOT_FOLDER_ID === "string" ? window.ROOT_FOLDER_ID : "root";
        live.ref.cat = rootId; live.ref.parentTask = null; live.ref.order = (++window._maintOrderCounter);
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
        const rootId = typeof window.ROOT_FOLDER_ID === "string" ? window.ROOT_FOLDER_ID : "root";
        const moved = {
          id: live.ref.id, name: live.ref.name, interval: val,
          sinceBase: 0, anchorTotal: null,
          manualLink: live.ref.manualLink||"", storeLink: live.ref.storeLink||"",
          pn: live.ref.pn||"", price: live.ref.price!=null?live.ref.price:null,
          parentTask: null, cat: rootId, order:(++window._maintOrderCounter)
        };
        window.tasksInterval.unshift(moved);
        persist(); if (typeof renderSettings === "function") renderSettings();
        return;
      }

      if (targetMenu === "asreq" && live.list === "interval"){
        // Convert to As-Required (condition optional)
        const cond = prompt("Condition/Notes (optional):", live.ref.condition||"As required") || "As required";
        window.tasksInterval = window.tasksInterval.filter(x => String(x.id)!==String(live.ref.id));
        const rootId = typeof window.ROOT_FOLDER_ID === "string" ? window.ROOT_FOLDER_ID : "root";
        const moved = {
          id: live.ref.id, name: live.ref.name, condition: cond,
          manualLink: live.ref.manualLink||"", storeLink: live.ref.storeLink||"",
          pn: live.ref.pn||"", price: live.ref.price!=null?live.ref.price:null,
          parentTask: null, cat: rootId, order:(++window._maintOrderCounter)
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
  const orderSummary = data.orderRequestSummary || {};
  const orderRows = Array.isArray(orderSummary.rows) ? orderSummary.rows : [];
  const breakdown = data.forecastBreakdown || {};
  const breakdownSections = Array.isArray(breakdown.sections) ? breakdown.sections : [];
  const breakdownTotals = breakdown.totals || {};
  const hasSections = breakdownSections.length > 0;
  const hasTotals = Boolean(
    breakdownTotals && (
      breakdownTotals.intervalLabel ||
      breakdownTotals.asReqLabel ||
      breakdownTotals.combinedLabel
    )
  );
  const forecastNote = breakdown.note || "Add pricing to maintenance tasks and approve order requests to enrich the forecast.";

  const renderSummaryCard = (card = {})=>{
    const isForecast = card && card.key === "maintenanceForecast";
    const classes = ["cost-card"];
    const attrParts = [`class="${classes.join(" ")}"`];
    if (isForecast && card.key){
      attrParts.push(`data-card-key="${esc(card.key)}"`);
      attrParts.push("role=\"button\"");
      attrParts.push("tabindex=\"0\"");
    }
    const attr = attrParts.join(" ");
    return `
              <div ${attr}>
                <div class="cost-card-icon">${esc(card.icon || "")}</div>
                <div class="cost-card-body">
                  <div class="cost-card-title">${esc(card.title || "")}</div>
                  <div class="cost-card-value">${esc(card.value || "")}</div>
                  <div class="cost-card-hint">${esc(card.hint || "")}</div>
                </div>
              </div>
            `;
  };

  const summaryCardsHTML = cards.length
    ? cards.map(renderSummaryCard).join("")
    : `<p class="small muted">No cost metrics yet. Log machine hours and add pricing to interval tasks.</p>`;

  const forecastTableHTML = (hasSections || hasTotals)
    ? `
      <div class="forecast-table-wrap">
        <table class="forecast-table">
          <thead>
            <tr>
              <th scope="col">Task</th>
              <th scope="col">Cadence</th>
              <th scope="col">Unit cost</th>
              <th scope="col">Annual estimate</th>
            </tr>
          </thead>
          <tbody>
            ${breakdownSections.map(section => {
              const rows = Array.isArray(section.rows) ? section.rows : [];
              const headerRow = `
              <tr class="forecast-section-row">
                <th scope="rowgroup" colspan="4">
                  <span class="forecast-section-header">
                    <span class="forecast-section-title">${esc(section.label || "")}</span>
                    ${section.totalLabel ? `<span class="forecast-section-total">${esc(section.totalLabel)}</span>` : ""}
                  </span>
                </th>
              </tr>`;
              const rowsHtml = rows.length
                ? rows.map(row => `
              <tr>
                <th scope="row">${esc(row.name || "")}</th>
                <td>${esc(row.cadenceLabel || "—")}</td>
                <td>${esc(row.unitCostLabel || "—")}</td>
                <td>${esc(row.annualTotalLabel || "—")}</td>
              </tr>
            `).join("")
                : `
              <tr class="forecast-empty-row">
                <td colspan="4">${esc(section.emptyMessage || "No tasks yet.")}</td>
              </tr>`;
              return `${headerRow}${rowsHtml}`;
            }).join("")}
          </tbody>
          ${hasTotals ? `
          <tfoot>
            <tr class="forecast-total-row">
              <th scope="row">Interval total</th>
              <td colspan="2"></td>
              <td>${esc(breakdownTotals.intervalLabel || "—")}</td>
            </tr>
            <tr class="forecast-total-row">
              <th scope="row">As-required total</th>
              <td colspan="2"></td>
              <td>${esc(breakdownTotals.asReqLabel || "—")}</td>
            </tr>
            <tr class="forecast-grand-total-row">
              <th scope="row">Combined total</th>
              <td colspan="2"></td>
              <td>${esc(breakdownTotals.combinedLabel || "—")}</td>
            </tr>
          </tfoot>` : ""}
        </table>
      </div>
    `
    : `<p class="small muted">Add maintenance intervals, pricing, and expected frequency to project spend.</p>`;

  return `
  <div class="container cost-container">
    <div class="dashboard-toolbar">
      <span class="dashboard-edit-hint" id="costEditHint" hidden>Drag windows to rearrange and resize the cost overview.</span>
    </div>

    <div class="cost-info-trigger">
      <button type="button" class="cost-info-button" id="costInfoOpen" aria-haspopup="dialog" aria-controls="costInfoPanel" aria-expanded="false">
        <span class="cost-info-button-icon" aria-hidden="true">ℹ️</span>
        <span class="cost-info-button-label">Cost model primer</span>
      </button>
      <span class="cost-info-trigger-hint">Open the full capture → allocation → review walkthrough.</span>
    </div>

    <div class="cost-info-panel" id="costInfoPanel" role="dialog" aria-modal="true" aria-labelledby="costInfoTitle" aria-describedby="costInfoIntro" hidden>
      <div class="cost-info-panel-card" id="costInfoCard">
        <button type="button" class="cost-info-close" data-cost-info-close aria-label="Close primer">×</button>
        <h2 id="costInfoTitle">How the waterjet cost model works</h2>
        <p class="cost-info-intro" id="costInfoIntro">This dashboard blends projections with real activity so every decision reflects true operating cost and profit. Start by collecting accurate inputs, let the nightly allocators reconcile spend, then review the rollups and drill into any variance.</p>
        <div class="cost-info-grid">
          <article>
            <h3>1. Capture the right data</h3>
            <ul>
              <li><strong>Machine hours:</strong> Upload hour-meter totals each shift or stream telemetry so usage windows and per-hour costs stay reliable.</li>
              <li><strong>Maintenance tasks:</strong> Record default labor hours, parts cost, and downtime impact for every interval; confirm actuals when tasks close.</li>
              <li><strong>Consumables &amp; utilities:</strong> Tag abrasive, water, electricity, and other orders so dollar-per-hour burn rates auto recalibrate.</li>
              <li><strong>Cutting jobs:</strong> Log quoted vs. invoiced revenue, material spend, and direct labor to calculate real margins instead of relying on the $250/hr heuristic.</li>
              <li><strong>Downtime &amp; overhead:</strong> Categorize every outage, capturing duration, direct repair spend, and opportunity cost; configure fixed monthly overhead for allocation.</li>
            </ul>
          </article>
          <article>
            <h3>2. Allocate costs automatically</h3>
            <ul>
              <li><strong>Maintenance:</strong> Spread parts and labor across the service interval, then reconcile variances when actual invoices land.</li>
              <li><strong>Consumables:</strong> Nightly jobs match purchases to logged hours to refresh burn rates and flag stale assumptions.</li>
              <li><strong>Downtime:</strong> Convert lost hours into dollars by combining opportunity cost with any repair spend.</li>
              <li><strong>Overhead:</strong> Turn fixed monthly costs into an hourly burden using a rolling 90-day utilization average.</li>
              <li><strong>Revenue:</strong> Calculate realized gross margin per job: invoice revenue minus labor, material, consumables, overhead, and downtime allocations.</li>
            </ul>
          </article>
          <article>
            <h3>3. Review &amp; act</h3>
            <ul>
              <li><strong>Variance tracking:</strong> Compare actual vs. projected cost buckets and escalate anything beyond a 15% swing.</li>
              <li><strong>Audit trail:</strong> Every card, table row, and chart point links back to maintenance logs, downtime tickets, order requests, or job records.</li>
              <li><strong>Confidence scoring:</strong> Highlight estimates that still rely on defaults so leadership knows which numbers are decision-ready.</li>
              <li><strong>Reconciliation:</strong> Monthly checks line up the dashboard totals with accounting exports before sharing executive summaries.</li>
              <li><strong>Trend reviews:</strong> Use the stacked chart and summary table to see how maintenance, consumables, downtime, and job performance shape net margin.</li>
            </ul>
          </article>
        </div>
    </div>
  </div>

    <div class="forecast-modal" id="forecastBreakdownModal" role="dialog" aria-modal="true" aria-labelledby="forecastModalTitle" hidden aria-hidden="true">
      <button type="button" class="forecast-modal-backdrop" data-forecast-close aria-label="Close maintenance forecast breakdown"></button>
      <div class="forecast-modal-card" role="document" tabindex="-1" data-forecast-initial>
        <button type="button" class="forecast-modal-close" data-forecast-close aria-label="Close maintenance forecast breakdown">×</button>
        <h2 id="forecastModalTitle">Maintenance forecast breakdown</h2>
        <p class="forecast-modal-subtitle">Interval and as-required tasks with annualized totals.</p>
        ${forecastTableHTML}
        <p class="forecast-table-note">${esc(forecastNote)}</p>
      </div>
    </div>

    <div class="dashboard-layout cost-layout" id="costLayout">
      <div class="dashboard-window" data-cost-window="overview">
        <div class="block cost-overview-block">
          <h3>Cost Overview</h3>
          <div class="cost-summary-grid">
            ${summaryCardsHTML}
          </div>
        </div>
      </div>

      <div class="dashboard-window" data-cost-window="chart">
        <div class="block cost-chart-block">
          <div class="cost-chart-header">
            <h3>Estimated Cost Trends</h3>
            <div class="cost-chart-toggle">
              <label><input type="checkbox" id="toggleCostMaintenance" checked> <span class="dot" style="background:${esc(chartColors.maintenance)}"></span> Maintenance</label>
              <label class="cost-chart-toggle-jobs"><input type="checkbox" id="toggleCostJobs" checked> <span class="dot" style="background:${esc(chartColors.jobs)}"></span> <span class="cost-chart-toggle-link">Cutting jobs</span></label>
            </div>
          </div>
          <div class="cost-chart-canvas">
            <canvas id="costChart" width="780" height="240"></canvas>
          </div>
          ${data.chartNote ? `<p class="small muted">${esc(data.chartNote)}</p>` : `<p class="small muted">Toggle a line to explore how maintenance and job efficiency costs evolve over time.</p>`}
        </div>
      </div>

      <div class="dashboard-window" data-cost-window="orders">
        <div class="block">
          <h3>Waterjet Part Summary</h3>
          <div class="cost-jobs-summary order-cost-summary">
            <div><span class="label">Requests logged</span><span>${esc(orderSummary.requestCountLabel || "0")}</span></div>
            <div><span class="label">Approved spend</span><span>${esc(orderSummary.totalApprovedLabel || "$0.00")}</span></div>
          </div>
          ${orderRows.length ? `
            <table class="cost-table">
              <thead><tr><th>Request</th><th>Resolved</th><th>Status</th><th>Approved $</th><th>Requested $</th></tr></thead>
              <tbody>
                ${orderRows.map(row => `
                  <tr>
                    <td>${esc(row.code || "Order")}</td>
                    <td>${esc(row.resolvedLabel || "—")}</td>
                    <td>${esc(row.statusLabel || "")}</td>
                    <td>${esc(row.approvedLabel || "$0.00")}</td>
                    <td>${esc(row.requestedLabel || "$0.00")}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          ` : `<p class="small muted">${esc(orderSummary.emptyMessage || "Approve or deny order requests to build the spend log.")}</p>`}
        </div>
      </div>

      <div class="dashboard-window" data-cost-window="timeframes">
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
      </div>

      <div class="dashboard-window" data-cost-window="history">
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
      </div>

      <div class="dashboard-window" data-cost-window="jobs">
        <div class="block">
          <h3>Maintenance Job Tracker</h3>
          ${maintenanceJobsNote ? `<p class="small muted">${esc(maintenanceJobsNote)}</p>` : ""}
          ${maintenanceJobsEmpty ? `<p class="small muted">${esc(maintenanceJobsEmpty)}</p>` : ""}
        </div>
      </div>

      <div class="dashboard-window" data-cost-window="efficiency">
        <div class="block" data-cost-jobs-history role="link" tabindex="0">
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
      </div>
    </div>
  </div>`;
}

function viewJobs(){
  const esc = (str)=> String(str ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const textEsc = (str)=> String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const formatCurrency = (value, { showPlus = true } = {})=>{
    const num = Number(value);
    const safe = Number.isFinite(num) ? num : 0;
    const abs = Math.abs(safe);
    const formatted = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: abs < 1000 ? 2 : 0,
      maximumFractionDigits: abs < 1000 ? 2 : 0
    }).format(abs);
    if (safe < 0) return `-${formatted}`;
    if (safe > 0 && showPlus) return `+${formatted}`;
    return formatted;
  };
  const formatHours = (value)=>{
    const num = Number(value);
    if (!Number.isFinite(num)) return "—";
    const decimals = Math.abs(num) >= 100 ? 0 : 1;
    return `${num.toFixed(decimals)} hr`;
  };
  const formatQuantity = (value)=>{
    const num = Number(value);
    if (!Number.isFinite(num)) return "0";
    const decimals = Math.abs(num) >= 100 ? 0 : 2;
    return num.toFixed(decimals);
  };
  const formatDate = (iso)=>{
    if (!iso) return "—";
    const dt = parseDateLocal(iso) || new Date(iso);
    if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString();
  };

  const pendingFiles = Array.isArray(window.pendingNewJobFiles) ? window.pendingNewJobFiles : [];
  const pendingSummary = pendingFiles.length
    ? `${pendingFiles.length} file${pendingFiles.length===1?"":"s"} ready to attach`
    : "No files selected";
  const completedJobs = Array.isArray(window.completedCuttingJobs) ? window.completedCuttingJobs.slice() : [];
  const completedSorted = completedJobs.sort((a,b)=>{
    const aTime = new Date(a.completedAtISO || a.dueISO || a.startISO || 0).getTime();
    const bTime = new Date(b.completedAtISO || b.dueISO || b.startISO || 0).getTime();
    return bTime - aTime;
  });
  const completedStats = completedSorted.reduce((acc, job)=>{
    const eff = job && job.efficiency ? job.efficiency : {};
    const gain = Number(eff.gainLoss);
    acc.total += Number.isFinite(gain) ? gain : 0;
    return acc;
  }, { total: 0 });
  const completedAverage = completedSorted.length ? (completedStats.total / completedSorted.length) : 0;
  const numberInputValue = (value)=>{
    const num = Number(value);
    return Number.isFinite(num) ? String(num) : "";
  };
  const formatDateTimeLocal = (iso)=>{
    if (!iso) return "";
    const dt = new Date(iso);
    if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return "";
    const offset = dt.getTimezoneOffset();
    const local = new Date(dt.getTime() - offset * 60000);
    return local.toISOString().slice(0,16);
  };

  const historyColumnCount = 7;
  const editingCompletedJobsSet = typeof getEditingCompletedJobsSet === "function"
    ? getEditingCompletedJobsSet()
    : (()=>{
        if (!(window.editingCompletedJobs instanceof Set)){
          window.editingCompletedJobs = new Set();
        }
        return window.editingCompletedJobs;
      })();
  const completedRows = completedSorted.map(job => {
    const eff = job && job.efficiency ? job.efficiency : {};
    const delta = Number(eff.deltaHours);
    const gainLoss = Number(eff.gainLoss);
    const actualHours = Number(job.actualHours ?? eff.actualHours);
    const estHours = Number(job.estimateHours);
    const editingHistory = editingCompletedJobsSet.has(String(job.id));
    let statusLabel = "Finished on estimate";
    if (Number.isFinite(delta) && Math.abs(delta) > 0.1){
      statusLabel = delta > 0 ? "Finished ahead" : "Finished behind";
    }
    const statusDetail = Number.isFinite(delta) && Math.abs(delta) > 0.1
      ? ` (${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)} hr)`
      : "";
    const noteDisplay = job?.notes
      ? esc(String(job.notes)).replace(/\n/g, "<br>")
      : "<span class=\"muted\">—</span>";
    const materialLine = job?.material ? `<div class="small muted">${esc(job.material)}</div>` : "";

    if (!editingHistory){
      return `
        <tr data-history-row="${job.id || ""}">
          <td>
            <div><strong>${esc(job?.name || "Job")}</strong></div>
            ${materialLine}
          </td>
          <td>${formatDate(job?.completedAtISO)}</td>
          <td>${formatHours(actualHours)} / ${formatHours(estHours)}</td>
          <td>${esc(statusLabel)}${statusDetail}</td>
          <td>${formatCurrency(gainLoss)}</td>
          <td>${noteDisplay}</td>
          <td class="past-job-actions">
            <button type="button" data-history-edit="${job.id}">Edit</button>
            <button type="button" class="danger" data-history-delete="${job.id}">Delete</button>
          </td>
        </tr>
      `;
    }

    const completedVal = formatDateTimeLocal(job?.completedAtISO);
    const actualVal = numberInputValue(actualHours);
    const estimateVal = numberInputValue(estHours);
    const materialCostVal = numberInputValue(job?.materialCost);
    const materialQtyVal = numberInputValue(job?.materialQty);

    return `
      <tr data-history-row="${job.id || ""}" class="editing">
        <td colspan="${historyColumnCount}">
          <div class="past-job-edit">
            <div class="past-job-edit-grid">
              <label>Job name<input type="text" data-history-field="name" data-history-id="${job.id}" value="${esc(job?.name || "")}"></label>
              <label>Completed at<input type="datetime-local" data-history-field="completedAtISO" data-history-id="${job.id}" value="${completedVal}"></label>
              <label>Estimate (hrs)<input type="number" min="0" step="0.1" data-history-field="estimateHours" data-history-id="${job.id}" value="${estimateVal}"></label>
              <label>Actual (hrs)<input type="number" min="0" step="0.1" data-history-field="actualHours" data-history-id="${job.id}" value="${actualVal}"></label>
              <label>Material<input type="text" data-history-field="material" data-history-id="${job.id}" value="${esc(job?.material || "")}"></label>
              <label>Material cost<input type="number" min="0" step="0.01" data-history-field="materialCost" data-history-id="${job.id}" value="${materialCostVal}"></label>
              <label>Material quantity<input type="number" min="0" step="0.01" data-history-field="materialQty" data-history-id="${job.id}" value="${materialQtyVal}"></label>
            </div>
            <label class="past-job-edit-notes">Notes<textarea data-history-field="notes" data-history-id="${job.id}" rows="3">${textEsc(job?.notes || "")}</textarea></label>
            <div class="past-job-edit-actions">
              <button type="button" data-history-save="${job.id}">Save</button>
              <button type="button" class="danger" data-history-cancel="${job.id}">Cancel</button>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join("");
  const completedTable = completedSorted.length
    ? `
      <div class="past-jobs-summary">
        <div><span class="label">Jobs logged</span><span>${completedSorted.length}</span></div>
        <div><span class="label">Total impact</span><span>${formatCurrency(completedStats.total)}</span></div>
        <div><span class="label">Avg per job</span><span>${formatCurrency(completedAverage)}</span></div>
      </div>
      <table class="past-jobs-table">
        <thead>
          <tr><th>Job</th><th>Completed</th><th>Actual vs estimate</th><th>Status</th><th>Cost impact</th><th>Note</th><th>Actions</th></tr>
        </thead>
        <tbody>${completedRows}</tbody>
      </table>
    `
    : `<p class="small muted">Mark jobs complete to build a history of past cutting work.</p>`;
  const activeColumnCount = 11;
  const rows = cuttingJobs.map(j => {
    const jobFiles = Array.isArray(j.files) ? j.files : [];
    const fileLinks = jobFiles.length
      ? `<ul class="job-file-pill-list">${jobFiles.map((f, idx) => {
          const safeName = f.name || `file_${idx+1}`;
          const href = f.dataUrl || f.url || "";
          if (!href) return "";
          return `<li><a href="${href}" download="${safeName}" class="job-file-pill">${safeName}</a></li>`;
        }).filter(Boolean).join("")}</ul>`
      : `<p class="small muted">No files attached. Edit the job to add files.</p>`;
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
    const impactClass = ahead
      ? 'job-impact-ahead'
      : (behind ? 'job-impact-behind' : 'job-impact-neutral');
    const impactDisplay = formatCurrency(money, { showPlus: true });
    const statusLabel = nearPace ? 'On pace' : (ahead ? 'Ahead' : 'Behind');
    const statusDetail = nearPace
      ? ''
      : ` by ${Math.abs(deltaRemain).toFixed(1)} hr`;
    const baselineDetail = `${baselineRemain.toFixed(1)}h baseline vs ${actualRemain.toFixed(1)}h remaining`;
    const statusSummary = statusLabel + (statusDetail || '');
    const efficiencyDetail = `${statusSummary}; ${baselineDetail}`;

    const estimateDisplay = formatHours(j.estimateHours);
    const remainingDisplay = formatHours(remainHrs);
    const needDisplay = req.requiredPerDay === Infinity
      ? '<span class="job-badge job-badge-overdue">Past due</span>'
      : `${needPerDay} hr/day`;
    const statusDisplay = [
      `<div class="job-status ${ahead ? 'job-status-ahead' : (behind ? 'job-status-behind' : 'job-status-onpace')}">${statusLabel}</div>`,
      statusDetail ? `<div class="job-status-detail">${statusDetail.trim()}</div>` : ''
    ].join('');

    // Dates (for display / edit row)
    const startDate = parseDateLocal(j.startISO);
    const dueDate   = parseDateLocal(j.dueISO);
    const startTxt  = startDate ? startDate.toDateString() : "—";
    const dueTxt    = dueDate ? dueDate.toDateString() : "—";
    const dueVal    = dueDate ? ymd(dueDate) : (j.dueISO || "");

    if (!editing){
      const matCostDisplay = formatCurrency(matCost, { showPlus: false });
      const matQtyDisplay  = formatQuantity(matQty);
      const noteContent = (j.notes || "").trim();
      const noteMarkup = noteContent
        ? `<div id="jobNote_${j.id}" class="job-note-display" data-requires-edit="${j.id}">${textEsc(j.notes || "").replace(/\n/g, "<br>")}</div>`
        : `<div id="jobNote_${j.id}" class="job-note-display job-note-empty" data-requires-edit="${j.id}">Add a note…</div>`;
      return `
        <tr data-job-row="${j.id}" class="job-row">
          <td class="job-col job-col-main job-col-locked" data-requires-edit="${j.id}">
            <div class="job-main">
              <strong>${j.name}</strong>
              <div class="job-main-dates">${startTxt} → ${dueTxt}</div>
            </div>
          </td>
          <td class="job-col job-col-estimate job-col-locked" data-requires-edit="${j.id}">${estimateDisplay}</td>
          <td class="job-col job-col-material job-col-locked" data-requires-edit="${j.id}">${j.material || '—'}</td>
          <td class="job-col job-col-input job-col-locked" data-requires-edit="${j.id}">${matCostDisplay}</td>
          <td class="job-col job-col-input job-col-locked" data-requires-edit="${j.id}">${matQtyDisplay}</td>
          <td class="job-col job-col-money">$${matTotal.toFixed(2)}</td>
          <td class="job-col job-col-hours">${remainingDisplay}</td>
          <td class="job-col job-col-need">${needDisplay}</td>
          <td class="job-col job-col-status">${statusDisplay}</td>
          <td class="job-col job-col-impact"><span class="job-impact ${impactClass}">${impactDisplay}</span></td>
          <td class="job-col job-col-actions">
            <div class="job-actions">
              <button data-log-job="${j.id}">Log time</button>
              <button data-edit-job="${j.id}">Edit</button>
              <button data-complete-job="${j.id}">Mark complete</button>
              <button class="danger" data-remove-job="${j.id}">Remove</button>
            </div>
            <span data-log-job="${j.id}" style="display:none"></span>
          </td>
        </tr>
        <tr class="job-detail-row">
          <td colspan="${activeColumnCount}">
            <div class="job-detail-card">
              <div class="job-detail-note">
                <label class="job-detail-label" for="jobNote_${j.id}">Notes</label>
                ${noteMarkup}
              </div>
              <div class="job-detail-meta">
                <div class="job-detail-efficiency small muted">${efficiencyDetail}</div>
                <div class="job-detail-files">
                  <span class="job-detail-label">Files</span>
                  ${fileLinks}
                </div>
              </div>
            </div>
          </td>
        </tr>`;
    } else {
      // EDIT ROW
      return `
        <tr data-job-row="${j.id}" class="job-row editing">
          <td colspan="${activeColumnCount}">
            <div class="job-edit-card">
              <div class="job-edit-grid">
                <label>Job name<input type="text" data-j="name" data-id="${j.id}" value="${j.name}"></label>
                <label>Estimate (hrs)<input type="number" min="1" data-j="estimateHours" data-id="${j.id}" value="${j.estimateHours}"></label>
                <label>Material<input type="text" data-j="material" data-id="${j.id}" value="${j.material||""}"></label>
                <label>Material cost ($)<input type="number" min="0" step="0.01" data-j="materialCost" data-id="${j.id}" value="${matCost}"></label>
                <label>Material quantity<input type="number" min="0" step="0.01" data-j="materialQty" data-id="${j.id}" value="${matQty}"></label>
                <label>Start date<input type="date" data-j="startISO" data-id="${j.id}" value="${j.startISO||""}"></label>
                <label>Due date<input type="date" data-j="dueISO" data-id="${j.id}" value="${dueVal}"></label>
              </div>
              <div class="job-edit-summary">
                <div class="job-metric">
                  <span class="job-metric-label">Material total</span>
                  <span class="job-metric-value">$${matTotal.toFixed(2)}</span>
                </div>
                <div class="job-metric">
                  <span class="job-metric-label">Schedule</span>
                  <span class="job-metric-value small muted">${startTxt} → ${dueTxt}</span>
                </div>
              </div>
              <label class="job-edit-note">Notes<textarea data-j="notes" data-id="${j.id}" rows="3" placeholder="Notes...">${j.notes||""}</textarea></label>
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
              <div class="job-edit-actions">
                <button data-save-job="${j.id}">Save</button>
                <button class="danger" data-cancel-job="${j.id}">Cancel</button>
              </div>
            </div>
          </td>
        </tr>`;
    }
  }).join("");

  return `
  <div class="container">
    <div class="block" style="grid-column:1 / -1">
      <h3>Cutting Jobs</h3>
      <div class="job-page-toolbar">
        <button type="button" class="job-history-button" data-job-history-trigger>Jump to history</button>
      </div>
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

      <table class="job-table">
        <thead>
          <tr>
            <th>Job</th>
            <th>Estimate</th>
            <th>Material</th>
            <th>Cost / unit</th>
            <th>Quantity</th>
            <th>Material total</th>
            <th>Hours remaining</th>
            <th>Needed / day</th>
            <th>Status</th>
            <th>Projected impact</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="small muted">Material cost and quantity update immediately when changed.</p>
    </div>
    <div class="block past-jobs-block" id="pastJobs">
      <h3>Past Cutting Jobs</h3>
      ${completedTable}
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
    return `<tr><td colspan="8" class="muted">No inventory items match your search.</td></tr>`;
  }
  return list.map(i => {
    const priceVal = i.price != null && i.price !== "" ? Number(i.price) : "";
    const priceDisplay = priceVal === "" || Number.isNaN(priceVal) ? "" : priceVal;
    return `
    <tr>
      <td>${i.name}</td>
      <td><input type="number" min="0" step="1" data-inv="qty" data-id="${i.id}" value="${i.qty}"></td>
      <td>${i.unit||"pcs"}</td>
      <td>${i.pn||"—"}</td>
      <td>${i.link ? `<a href="${i.link}" target="_blank" rel="noopener">link</a>` : "—"}</td>
      <td><input type="number" step="0.01" min="0" data-inv="price" data-id="${i.id}" value="${priceDisplay}"></td>
      <td><input type="text" data-inv="note" data-id="${i.id}" value="${i.note||""}"></td>
      <td class="inventory-actions">
        <button type="button" class="inventory-add" data-order-add="${i.id}">Add to order request</button>
        <button type="button" class="inventory-delete" data-inventory-delete="${i.id}">Delete</button>
      </td>
    </tr>`;
  }).join("");
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
      <div class="inventory-toolbar">
        <button type="button" class="inventory-add-trigger" id="inventoryAddBtn">+ Add inventory item</button>
        <div class="inventory-search mini-form">
          <input type="search" id="inventorySearch" placeholder="Search items, part numbers, notes, or links" value="${searchValue}">
          <button type="button" id="inventorySearchClear">Clear</button>
        </div>
      </div>
      <div class="small muted inventory-hint">Results update as you type.</div>
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>PN</th><th>Link</th><th>Price</th><th>Note</th><th>Actions</th></tr></thead>
        <tbody data-inventory-rows>${rows}</tbody>
      </table>
    </div>
  </div>

  <div class="modal-backdrop" id="inventoryAddModal" hidden>
    <div class="modal-card inventory-modal-card">
      <button type="button" class="modal-close" data-close>&times;</button>

      <section class="inventory-modal-step" data-step="prompt">
        <h4>Add inventory item</h4>
        <p>Do you want to add this to the maintenance settings page too?</p>
        <div class="modal-actions inventory-modal-actions">
          <button type="button" class="primary" data-choose="maintenance">Yes, open maintenance</button>
          <button type="button" class="secondary" data-choose="inventory">No, inventory only</button>
        </div>
      </section>

      <section class="inventory-modal-step" data-step="form" hidden>
        <h4>Inventory details</h4>
        <p class="small muted" data-maintenance-note hidden>After saving, you&rsquo;ll be redirected to Maintenance Settings to finish adding this part.</p>
        <form id="inventoryAddForm" class="modal-form">
          <div class="modal-grid">
            <label>Item name<input name="inventoryName" required placeholder="Item"></label>
            <label>Quantity<input type="number" min="0" step="1" name="inventoryQty" value="1"></label>
            <label>Unit<input name="inventoryUnit" placeholder="pcs" value="pcs"></label>
            <label>Part #<input name="inventoryPN" placeholder="Part number"></label>
            <label>Store link<input type="url" name="inventoryLink" placeholder="https://..."></label>
            <label>Price ($)<input type="number" min="0" step="0.01" name="inventoryPrice" placeholder="optional"></label>
            <label>Notes<input name="inventoryNote" placeholder="Optional note"></label>
          </div>
          <div class="modal-actions inventory-modal-actions">
            <button type="button" class="secondary" data-back>Back</button>
            <button type="submit" class="primary">Add item</button>
          </div>
        </form>
      </section>
    </div>
  </div>`;
}

function viewOrderRequest(model){
  const data = model || {};
  const esc = (str)=> String(str ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const tab = data.tab === "history" ? "history" : "active";
  const summary = data.summary || {};
  const active = data.active || {};
  const history = Array.isArray(data.history) ? data.history : [];
  const downloadLabel = esc(active.downloadLabel || "Download request (.csv)");

  const activeContent = `
    <div class="order-card">
      <div class="order-card-header">
        <div>
          <h3>Current Order Request</h3>
          <p class="small muted">${esc(active.subtitle || "Create a list of needed parts from inventory.")}</p>
        </div>
        <div class="order-meta">
          <span class="label">Reference</span>
          <span class="value">${esc(active.code || "—")}</span>
          <span class="label">Created</span>
          <span class="value">${esc(active.created || "—")}</span>
        </div>
      </div>
      ${active.items && active.items.length ? `
        <div class="order-table-wrap">
          <table class="order-table">
            <thead>
              <tr>
                <th>Approve?</th>
                <th>Item</th>
                <th>Part #</th>
                <th>Unit price</th>
                <th>Qty</th>
                <th>Line total</th>
                <th>Store link</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${active.items.map(item => `
                <tr>
                  <td><input type="checkbox" data-order-approve="${esc(item.id)}" ${item.selected ? "checked" : ""}></td>
                  <td class="order-item-name">${esc(item.name || "Unnamed item")}</td>
                  <td>${esc(item.pn || "—")}</td>
                  <td><input type="number" step="0.01" min="0" data-order-price="${esc(item.id)}" value="${esc(item.priceInput || "")}" placeholder="0.00"></td>
                  <td><input type="number" min="1" step="1" data-order-qty="${esc(item.id)}" value="${esc(item.qtyInput || "1")}"></td>
                  <td class="order-money">${esc(item.lineTotal || "$0.00")}</td>
                  <td>${item.link ? `<a href="${esc(item.link)}" target="_blank" rel="noopener">View</a>` : "—"}</td>
                  <td><button type="button" class="link danger" data-order-remove="${esc(item.id)}">Remove</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : `<p class="small muted">No items yet. Use the inventory page to add parts to this order request.</p>`}
      <div class="order-card-footer">
        <div>
          <div class="order-total">Requested total: <strong data-order-total-value>${esc(active.total || "$0.00")}</strong></div>
          <div class="order-total small" data-order-selection-row ${active.selectionTotal ? "" : "hidden"}>Selected for approval: <strong data-order-selection-value>${esc(active.selectionTotal || "$0.00")}</strong></div>
        </div>
        <div class="order-actions">
          <button type="button" data-order-download>${downloadLabel}</button>
          <button type="button" class="primary" data-order-approve-all ${!active.canApprove ? "disabled" : ""}>Mark approved</button>
          <button type="button" data-order-partial ${!active.canApprove ? "disabled" : ""}>Save partial approval</button>
          <button type="button" class="secondary" data-order-deny ${!active.canApprove ? "disabled" : ""}>Mark denied</button>
        </div>
      </div>
    </div>`;

  const historyContent = `
    <div class="order-history">
      ${history.length ? history.map(req => `
        <details class="order-history-entry">
          <summary>
            <span class="title">${esc(req.code || req.id || "Request")}</span>
            <span class="dates">${esc(req.dateRange || "")}</span>
            <span class="status ${esc(req.statusClass || "")}">${esc(req.statusLabel || "")}</span>
            <span class="total">${esc(req.total || "$0.00")}</span>
          </summary>
          <div class="order-history-body">
            <div class="order-history-meta">
              <div><span class="label">Approved total</span><span class="value">${esc(req.approvedTotal || "$0.00")}</span></div>
              <div><span class="label">Requested total</span><span class="value">${esc(req.total || "$0.00")}</span></div>
              <div><span class="label">Items</span><span class="value">${esc(req.itemCount || "0")}</span></div>
            </div>
            ${req.items && req.items.length ? `
              <table class="order-table">
                <thead>
                  <tr><th>Item</th><th>Part #</th><th>Unit price</th><th>Qty</th><th>Line total</th><th>Status</th><th>Store link</th></tr>
                </thead>
                <tbody>
                  ${req.items.map(item => `
                    <tr>
                      <td>${esc(item.name || "")}</td>
                      <td>${esc(item.pn || "—")}</td>
                      <td>${esc(item.price || "$0.00")}</td>
                      <td>${esc(item.qty || "0")}</td>
                      <td class="order-money">${esc(item.total || "$0.00")}</td>
                      <td><span class="status-chip ${esc(item.statusClass || "")}">${esc(item.statusLabel || "Pending")}</span></td>
                      <td>${item.link ? `<a href="${esc(item.link)}" target="_blank" rel="noopener">View</a>` : "—"}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            ` : `<p class="small muted">No line items recorded.</p>`}
            <div class="order-history-actions">
              <button type="button" data-order-download-history="${esc(req.id)}">Download (.csv)</button>
            </div>
          </div>
        </details>
      `).join("") : `<p class="small muted">No previous order requests yet. Approved or denied requests will appear here.</p>`}
    </div>`;

  const summaryContent = `
    <div class="order-summary">
      <div class="order-summary-card">
        <span class="label">Orders processed</span>
        <span class="value">${esc(summary.requestCount || "0")}</span>
      </div>
      <div class="order-summary-card">
        <span class="label">Approved spend to date</span>
        <span class="value">${esc(summary.approvedTotal || "$0.00")}</span>
      </div>
      <div class="order-summary-card">
        <span class="label">Last update</span>
        <span class="value">${esc(summary.lastUpdated || "—")}</span>
      </div>
    </div>`;

  return `
    <div class="container order-request-layout">
      <div class="block" style="grid-column:1 / -1">
        <h3>Order Requests</h3>
        <p class="small muted">Build purchase lists for waterjet parts, approve them, and keep an auditable history.</p>
        ${summaryContent}
        <div class="order-tabs">
          <button type="button" data-order-tab="active" class="${tab === "active" ? "active" : ""}">Active request</button>
          <button type="button" data-order-tab="history" class="${tab === "history" ? "active" : ""}">History</button>
        </div>
        <div class="order-tab-content">
          ${tab === "history" ? historyContent : activeContent}
        </div>
      </div>
    </div>`;
}

function viewDeletedItems(model){
  const data = model || {};
  const items = Array.isArray(data.items) ? data.items : [];
  const esc = (str)=> String(str ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const rows = items.map(item => `
    <tr>
      <td class="deleted-icon" aria-hidden="true">${esc(item.icon || "🗑")}</td>
      <td class="deleted-main">
        <div class="deleted-label">${esc(item.label || "Deleted item")}</div>
        <div class="deleted-meta small muted">${esc(item.typeLabel || "Item type unknown")}</div>
      </td>
      <td class="deleted-when">
        <div><strong>Deleted:</strong> ${esc(item.deletedAt || "—")}</div>
        <div class="small muted"><strong>Expires:</strong> ${esc(item.expiresAt || "—")}</div>
      </td>
      <td class="deleted-actions">
        <button type="button" data-trash-restore="${esc(item.id)}">Restore</button>
        <button type="button" class="danger" data-trash-delete="${esc(item.id)}">Delete forever</button>
      </td>
    </tr>
  `).join("");

  const body = items.length
    ? `<table class="deleted-table">
        <thead>
          <tr>
            <th></th>
            <th>Item</th>
            <th>Details</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
    : `<p class="small muted">Nothing has been deleted in the last 30 days.</p>`;

  return `
    <div class="container deleted-container">
      <div class="block" style="grid-column:1 / -1">
        <h3>Deleted items</h3>
        <p class="small muted">Items remain here for 30 days after deletion. Restore them or delete forever.</p>
        ${body}
      </div>
    </div>
  `;
}

