/* ========================= VIEWS ========================== */
function viewDashboard(){
  const esc = (str)=> String(str ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const cur   = RENDER_TOTAL ?? currentTotal();
  const prev  = previousTotal();
  const delta = RENDER_DELTA ?? deltaSinceLast();
  const lastEntry = totalHistory.length ? totalHistory[totalHistory.length - 1] : null;
  const lastUpdated = cur!=null && lastEntry && lastEntry.dateISO
    ? new Date(lastEntry.dateISO).toLocaleString()
    : "—";
  const efficiencyWindows = (Array.isArray(TIME_EFFICIENCY_WINDOWS) && TIME_EFFICIENCY_WINDOWS.length)
    ? TIME_EFFICIENCY_WINDOWS
    : [
        { key: "7d", label: "1W", days: 7, description: "Past 7 days" },
        { key: "30d", label: "1M", days: 30, description: "Past 30 days" },
        { key: "90d", label: "3M", days: 90, description: "Past 3 months" },
        { key: "182d", label: "6M", days: 182, description: "Past 6 months" },
        { key: "365d", label: "1Y", days: 365, description: "Past year" }
      ];
  const efficiencyButtons = efficiencyWindows.map((win, index) => {
    const days = Number(win?.days) || 0;
    const label = esc(win?.label ?? `${days || ""}`);
    const description = esc(win?.description ?? (days ? `Past ${days} days` : "Selected window"));
    const isActive = index === 0;
    return `
      <button type="button" class="time-efficiency-toggle${isActive ? " is-active" : ""}" data-efficiency-range="${esc(String(days))}" data-efficiency-range-label="${description}" aria-pressed="${isActive ? "true" : "false"}" title="${description}">
        ${label}
      </button>
    `;
  }).join("");
  const defaultEfficiencyDescription = esc(efficiencyWindows[0]?.description || "Past 7 days");

  const jobRootId = typeof window.JOB_ROOT_FOLDER_ID === "string" ? window.JOB_ROOT_FOLDER_ID : "jobs_root";
  const jobFolders = Array.isArray(window.jobFolders) && window.jobFolders.length
    ? window.jobFolders.slice()
    : defaultJobFolders();
  if (!jobFolders.some(folder => String(folder.id) === jobRootId)){
    jobFolders.push({ id: jobRootId, name: "All Jobs", parent: null, order: 1 });
  }
  const sortJobFolders = (list)=> list.slice().sort((a,b)=>{
    const orderDiff = (Number(b?.order) || 0) - (Number(a?.order) || 0);
    if (orderDiff !== 0) return orderDiff;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });
  const jobChildrenOf = (parentId)=>{
    const key = parentId == null ? null : String(parentId);
    return sortJobFolders(jobFolders.filter(folder => {
      const parentKey = folder.parent == null ? null : String(folder.parent);
      return parentKey === key;
    }));
  };
  const jobFolderOptions = [];
  const appendJobFolderOption = (folder, depth)=>{
    if (!folder) return;
    const indent = depth ? Array(depth).fill("&nbsp;&nbsp;").join("") : "";
    const prefix = depth ? "↳ " : "";
    const name = esc(folder.name || (String(folder.id) === jobRootId ? "All Jobs" : "Category"));
    jobFolderOptions.push({ id: String(folder.id), label: `${indent}${prefix}${name}` });
    jobChildrenOf(folder.id).forEach(child => appendJobFolderOption(child, depth + 1));
  };
  const jobRootFolder = jobFolders.find(folder => String(folder.id) === jobRootId) || { id: jobRootId, name: "All Jobs", parent: null, order: 1 };
  appendJobFolderOption(jobRootFolder, 0);
  const dashboardCategoryOptions = jobFolderOptions.map(option => `<option value="${esc(option.id)}">${option.label}</option>`).join("");

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

      <div class="dashboard-window" data-dashboard-window="timeEfficiency">
        <div class="block time-efficiency-block" id="dashboardTimeEfficiency">
          <div class="time-efficiency-header">
            <h3>Cutting Time Efficiency</h3>
            <div class="time-efficiency-controls">
              <div class="time-efficiency-toggles" role="tablist">
                ${efficiencyButtons}
              </div>
              <button type="button" class="time-efficiency-edit-btn" data-efficiency-edit>Edit range</button>
            </div>
          </div>
          <div class="time-efficiency-edit" data-efficiency-edit-panel hidden>
            <div class="time-efficiency-edit-row">
              <label class="time-efficiency-edit-field">
                <span class="time-efficiency-edit-label">Start date</span>
                <input type="date" data-efficiency-start-input>
              </label>
              <div class="time-efficiency-edit-actions">
                <button type="button" class="time-efficiency-edit-apply" data-efficiency-apply>Apply</button>
                <button type="button" class="time-efficiency-edit-cancel" data-efficiency-cancel>Cancel</button>
              </div>
            </div>
            <p class="small muted time-efficiency-edit-note" data-efficiency-edit-note></p>
          </div>
          <div class="time-efficiency-metrics" role="status" aria-live="polite">
            <div class="time-efficiency-metric">
              <span class="label">Actual hours</span>
              <span class="value" data-efficiency-actual>—</span>
            </div>
            <div class="time-efficiency-metric">
              <span class="label">Current target</span>
              <span class="value" data-efficiency-target>—</span>
            </div>
            <div class="time-efficiency-metric">
              <span class="label">Gap vs target</span>
              <span class="value" data-efficiency-gap-target>—</span>
            </div>
            <div class="time-efficiency-metric">
              <span class="label">End goal</span>
              <span class="value" data-efficiency-goal>—</span>
            </div>
            <div class="time-efficiency-metric">
              <span class="label">Gap vs goal</span>
              <span class="value" data-efficiency-gap-goal>—</span>
            </div>
            <div class="time-efficiency-metric">
              <span class="label">Efficiency (to date)</span>
              <span class="value" data-efficiency-percent>—</span>
            </div>
          </div>
          <p class="small muted" data-efficiency-window-label>${defaultEfficiencyDescription}</p>
          <p class="small muted">Baseline assumes ${CUTTING_BASELINE_WEEKLY_HOURS} cutting hours per week.</p>
        </div>
      </div>
    </div>

    <div class="block calendar-block">
      <h3>Calendar</h3>

      <div class="calendar-toolbar">
        <button type="button" class="calendar-hours-edit-btn" id="calendarHoursEditBtn">Edit Hours</button>
        <button type="button" class="calendar-hours-cancel-btn" id="calendarHoursCancelBtn" hidden>Cancel</button>
        <button type="button" class="calendar-toggle-btn" id="calendarToggleBtn" aria-pressed="false" aria-controls="months">Show All Months</button>
        <button type="button" class="calendar-add-btn" id="calendarAddBtn" title="Add maintenance task, down time, or job">+</button>
      </div>

      <div id="months"></div>
      <div class="small">Hover a due item for actions. Click to pin the bubble. Toggle “Show All Months” to scroll through the schedule.</div>
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
        <div class="task-option-stage" data-task-option-stage>
          <p class="small muted">Choose how you'd like to add this maintenance task.</p>
          <div class="task-option-grid">
            <button type="button" class="task-option" data-task-option="existing">
              <span class="task-option-title">Select from current tasks</span>
              <span class="task-option-sub">Place a saved task onto the calendar.</span>
            </button>
            <button type="button" class="task-option" data-task-option="new">
              <span class="task-option-title">Create new task</span>
              <span class="task-option-sub">Add a brand-new maintenance task.</span>
            </button>
          </div>
          <div class="task-option-actions">
            <button type="button" class="secondary" data-step-back>Back</button>
          </div>
        </div>

        <form id="dashTaskExistingForm" class="modal-form" data-task-variant="existing" hidden>
          <div class="task-existing-search">
            <label>Search tasks<input type="search" id="dashTaskExistingSearch" placeholder="Search saved maintenance tasks" autocomplete="off"></label>
          </div>
          <label>Maintenance task<select id="dashTaskExistingSelect"></select></label>
          <p class="small muted">Pick a task saved in Maintenance Settings to schedule it on the calendar.</p>
          <p class="small muted" data-task-existing-empty hidden>No maintenance tasks yet. Create one below to get started.</p>
          <p class="small muted" data-task-existing-search-empty hidden>No tasks match your search. Try a different name.</p>
          <div class="modal-actions">
            <button type="button" class="secondary" data-step-back>Back</button>
            <button type="submit" class="primary">Add to Calendar</button>
          </div>
        </form>

        <form id="dashTaskForm" class="modal-form" data-task-variant="new" hidden>
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
            <label>Calendar date<input type="date" id="dashTaskDate"></label>
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
            <button type="submit" class="primary" data-task-submit>Create Task</button>
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
            <label>Charge rate ($/hr)<input type="number" min="0" step="0.01" id="dashJobCharge" placeholder="Optional"></label>
            <label>Material<input id="dashJobMaterial" placeholder="Material"></label>
            <label>Material cost ($)<input type="number" min="0" step="0.01" id="dashJobMaterialCost" placeholder="optional"></label>
            <label>Material quantity<input type="number" min="0" step="0.01" id="dashJobMaterialQty" placeholder="optional"></label>
            <label>Start date<input type="date" id="dashJobStart" required></label>
            <label>Due date<input type="date" id="dashJobDue" required></label>
            <label>Category<select id="dashJobCategory">
              ${dashboardCategoryOptions}
              <option value="__new__">+ Create new category…</option>
            </select></label>
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
  const normalizeCategoryName = (value)=> typeof value === "string" ? value.trim().toLowerCase() : "";
  const categoryNameExists = (name, excludeId)=>{
    const normalized = normalizeCategoryName(name);
    return window.settingsFolders.some(folder => {
      if (!folder) return false;
      if (excludeId != null && String(folder.id) === String(excludeId)) return false;
      return normalizeCategoryName(folder.name) === normalized;
    });
  };
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
      const trimmed = name.trim();
      if (!trimmed) return;
      if (categoryNameExists(trimmed)){
        alert("A category with that name already exists.");
        return;
      }
      const id = (trimmed.toLowerCase().replace(/[^a-z0-9]+/g,"_") + "_" + Math.random().toString(36).slice(2,7));
      window.settingsFolders.push({ id, name: trimmed, parent: (typeof window.ROOT_FOLDER_ID === "string" ? window.ROOT_FOLDER_ID : "root"), order:(++window._maintOrderCounter) });
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
      const trimmed = name.trim();
      if (!trimmed) return;
      if (categoryNameExists(trimmed)){
        alert("A category with that name already exists.");
        return;
      }
      const id = (trimmed.toLowerCase().replace(/[^a-z0-9]+/g,"_") + "_" + Math.random().toString(36).slice(2,7));
      window.settingsFolders.push({ id, name: trimmed, parent, order:(++window._maintOrderCounter) });
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
      const trimmed = name.trim();
      if (!trimmed) return;
      if (categoryNameExists(trimmed, id)){
        alert("A category with that name already exists.");
        return;
      }
      f.name = trimmed;
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
  const efficiencyWindows = (Array.isArray(TIME_EFFICIENCY_WINDOWS) && TIME_EFFICIENCY_WINDOWS.length)
    ? TIME_EFFICIENCY_WINDOWS
    : [
        { key: "7d", label: "1W", days: 7, description: "Past 7 days" },
        { key: "30d", label: "1M", days: 30, description: "Past 30 days" },
        { key: "90d", label: "3M", days: 90, description: "Past 3 months" },
        { key: "182d", label: "6M", days: 182, description: "Past 6 months" },
        { key: "365d", label: "1Y", days: 365, description: "Past year" }
      ];
  const efficiencyButtons = efficiencyWindows.map((win, index) => {
    const days = Number(win?.days) || 0;
    const label = esc(win?.label ?? `${days || ""}`);
    const description = esc(win?.description ?? (days ? `Past ${days} days` : "Selected window"));
    const isActive = index === 0;
    return `
      <button type="button" class="time-efficiency-toggle${isActive ? " is-active" : ""}" data-efficiency-range="${esc(String(days))}" data-efficiency-range-label="${description}" aria-pressed="${isActive ? "true" : "false"}" title="${description}">
        ${label}
      </button>
    `;
  }).join("");
  const defaultEfficiencyDescription = esc(efficiencyWindows[0]?.description || "Past 7 days");

  const cards = Array.isArray(data.summaryCards) ? data.summaryCards : [];
  const timeframeRows = Array.isArray(data.timeframeRows) ? data.timeframeRows : [];
  const historyRows = Array.isArray(data.historyRows) ? data.historyRows : [];
  const jobBreakdown = Array.isArray(data.jobBreakdown) ? data.jobBreakdown : [];
  const jobSummary = data.jobSummary || { countLabel:"0", totalLabel:"$0", averageLabel:"$0", rollingLabel:"$0" };
  const chartColors = data.chartColors || { maintenance:"#0a63c2", jobs:"#2e7d32" };
  const chartInfo = data.chartInfo || "Maintenance cost line spreads interval pricing and approved as-required spend across logged machine hours; cutting jobs line tracks the rolling average gain or loss per completed job to spotlight margin drift.";
  const orderSummary = data.orderRequestSummary || {};
  const orderRows = Array.isArray(orderSummary.rows) ? orderSummary.rows : [];
  const overviewInsight = data.overviewInsight || "Totals blend the latest maintenance allocations, consumable burn rates, downtime burdens, and job margin data so you always see current cost exposure.";
  const ordersInsight = data.ordersInsight || "Tracks every waterjet part request from submission through approval so finance can confirm spend and spot stalled orders.";
  const timeframeInsight = data.timeframeInsight || "Usage windows combine logged machine hours with interval pricing to estimate what each upcoming maintenance window will cost.";
  const historyInsight = data.historyInsight || "Shows the latest completed maintenance, combining hours logged and reconciled spend to highlight cost spikes.";
  const efficiencyInsight = data.efficiencyInsight || "Summarizes cutting job profitability by tying revenue to labor, material, consumable, and overhead allocations so you can act on true margins.";
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
    const key = card && card.key ? String(card.key) : "";
    const isForecast = key === "maintenanceForecast";
    const isCutting = key === "cuttingJobs";
    const classes = ["cost-card"];
    const attrParts = [`class="${classes.join(" ")}"`];
    if (key){
      attrParts.push(`data-card-key="${esc(key)}"`);
    }
    if (isForecast){
      attrParts.push("role=\"button\"");
      attrParts.push("tabindex=\"0\"");
    }
    if (isCutting){
      attrParts.push("data-cost-cutting-card=\"\"");
      attrParts.push("role=\"link\"");
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
          <div class="cost-window-insight">
            <div class="chart-info">
              <button type="button" class="chart-info-button" aria-describedby="costOverviewInsight" aria-label="Explain Cost Overview metrics">
                <span aria-hidden="true">?</span>
                <span class="sr-only">Show how Cost Overview metrics are calculated</span>
              </button>
              <div class="chart-info-bubble" id="costOverviewInsight" role="tooltip">
                <p>${esc(overviewInsight)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="dashboard-window" data-cost-window="chart">
        <div class="block cost-chart-block">
          <div class="cost-chart-header">
            <div class="cost-chart-title">
              <h3>Estimated Cost Trends</h3>
            </div>
            <div class="cost-chart-toggle">
              <label><input type="checkbox" id="toggleCostMaintenance" checked> <span class="dot" style="background:${esc(chartColors.maintenance)}"></span> Maintenance</label>
              <label class="cost-chart-toggle-jobs"><input type="checkbox" id="toggleCostJobs" checked> <span class="dot" style="background:${esc(chartColors.jobs)}"></span> <span class="cost-chart-toggle-link" role="link" tabindex="0">Cutting jobs</span></label>
            </div>
          </div>
          <div class="cost-chart-canvas">
            <canvas id="costChart" width="780" height="240"></canvas>
          </div>
          ${data.chartNote ? `<p class="small muted">${esc(data.chartNote)}</p>` : `<p class="small muted">Toggle a line to explore how maintenance and job efficiency costs evolve over time.</p>`}
          <div class="cost-window-insight">
            <div class="chart-info">
              <button type="button" class="chart-info-button" aria-describedby="costChartInfo" aria-label="Explain Estimated Cost Trends">
                <span aria-hidden="true">?</span>
                <span class="sr-only">Show how the Estimated Cost Trends chart is calculated</span>
              </button>
              <div class="chart-info-bubble" id="costChartInfo" role="tooltip">
                <p>${esc(chartInfo)}</p>
              </div>
            </div>
          </div>
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
          <div class="cost-window-insight">
            <div class="chart-info">
              <button type="button" class="chart-info-button" aria-describedby="costOrdersInsight" aria-label="Explain Waterjet Part Summary tracking">
                <span aria-hidden="true">?</span>
                <span class="sr-only">Show how the Waterjet Part Summary data is compiled</span>
              </button>
              <div class="chart-info-bubble" id="costOrdersInsight" role="tooltip">
                <p>${esc(ordersInsight)}</p>
              </div>
            </div>
          </div>
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
          <div class="cost-window-insight">
            <div class="chart-info">
              <button type="button" class="chart-info-button" aria-describedby="costTimeframesInsight" aria-label="Explain Maintenance Cost Windows table">
                <span aria-hidden="true">?</span>
                <span class="sr-only">Show how Maintenance Cost Windows are generated</span>
              </button>
              <div class="chart-info-bubble" id="costTimeframesInsight" role="tooltip">
                <p>${esc(timeframeInsight)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="dashboard-window" data-cost-window="history">
        <div class="block">
          <h3>Recent Maintenance Events</h3>
          ${historyRows.length ? `
            <ul class="cost-history">
              ${historyRows.map(item => {
                const attrs = [
                  'data-history-item="1"',
                  item.dateISO ? `data-history-date="${esc(item.dateISO)}"` : '',
                  item.key ? `data-history-key="${esc(item.key)}"` : '',
                  item.taskId ? `data-task-id="${esc(item.taskId)}"` : '',
                  item.originalTaskId ? `data-original-task-id="${esc(item.originalTaskId)}"` : '',
                  item.taskMode ? `data-task-mode="${esc(item.taskMode)}"` : '',
                  item.taskName ? `data-task-name="${esc(item.taskName)}"` : '',
                  item.trashId ? `data-trash-id="${esc(item.trashId)}"` : '',
                  item.missingTask ? 'data-task-missing="true"' : '',
                  !item.hasLinkedTasks ? 'data-task-empty="true"' : '',
                  Number.isFinite(item.hoursValue) ? `data-history-hours="${esc(String(item.hoursValue))}"` : ''
                ].filter(Boolean).join(' ');
                const titleAttr = item.tooltipLabel ? ` title="${esc(item.tooltipLabel)}"` : '';
                return `
                <li role="button" tabindex="0" ${attrs}${titleAttr}>
                  <div class="cost-history-main">
                    <span class="cost-history-date">${esc(item.dateLabel || "")}</span>
                    <span class="cost-history-hours">${esc(item.hoursLabel || "")}</span>
                    <span class="cost-history-cost">${esc(item.costLabel || "")}</span>
                    ${item.taskLabel ? `<span class="cost-history-task-label">${esc(item.taskLabel)}</span>` : ``}
                  </div>
                  <button type="button" class="cost-history-delete" data-history-delete aria-label="Remove maintenance event from ${esc(item.dateLabel || 'this date')}" title="Remove from cost analysis">
                    <span aria-hidden="true">×</span>
                    <span class="sr-only">Remove event</span>
                  </button>
                </li>`;
              }).join("")}
            </ul>
          ` : `<p class="small muted">${esc(data.historyEmpty || "No usage history yet. Log machine hours to estimate maintenance spend.")}</p>`}
          <div class="cost-window-insight">
            <div class="chart-info">
              <button type="button" class="chart-info-button" aria-describedby="costHistoryInsight" aria-label="Explain Recent Maintenance Events list">
                <span aria-hidden="true">?</span>
                <span class="sr-only">Show how Recent Maintenance Events are curated</span>
              </button>
              <div class="chart-info-bubble" id="costHistoryInsight" role="tooltip">
                <p>${esc(historyInsight)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="dashboard-window" data-cost-window="efficiency">
        <div class="block" data-cost-jobs-history role="link" tabindex="0">
          <h3>Cutting Job Efficiency Snapshot</h3>
          <div class="time-efficiency-inline" id="costTimeEfficiency">
            <div class="time-efficiency-inline-header">
              <span class="time-efficiency-inline-title">Cutting time efficiency</span>
              <div class="time-efficiency-controls">
                <div class="time-efficiency-toggles" role="tablist">
                  ${efficiencyButtons}
                </div>
                <button type="button" class="time-efficiency-edit-btn" data-efficiency-edit>Edit range</button>
              </div>
            </div>
            <div class="time-efficiency-edit" data-efficiency-edit-panel hidden>
              <div class="time-efficiency-edit-row">
                <label class="time-efficiency-edit-field">
                  <span class="time-efficiency-edit-label">Start date</span>
                  <input type="date" data-efficiency-start-input>
                </label>
                <div class="time-efficiency-edit-actions">
                  <button type="button" class="time-efficiency-edit-apply" data-efficiency-apply>Apply</button>
                  <button type="button" class="time-efficiency-edit-cancel" data-efficiency-cancel>Cancel</button>
                </div>
              </div>
              <p class="small muted time-efficiency-edit-note" data-efficiency-edit-note></p>
            </div>
            <div class="time-efficiency-metrics" role="status" aria-live="polite">
              <div class="time-efficiency-metric">
                <span class="label">Actual hours</span>
                <span class="value" data-efficiency-actual>—</span>
              </div>
              <div class="time-efficiency-metric">
                <span class="label">Current target</span>
                <span class="value" data-efficiency-target>—</span>
              </div>
              <div class="time-efficiency-metric">
                <span class="label">Gap vs target</span>
                <span class="value" data-efficiency-gap-target>—</span>
              </div>
              <div class="time-efficiency-metric">
                <span class="label">End goal</span>
                <span class="value" data-efficiency-goal>—</span>
              </div>
              <div class="time-efficiency-metric">
                <span class="label">Gap vs goal</span>
                <span class="value" data-efficiency-gap-goal>—</span>
              </div>
              <div class="time-efficiency-metric">
                <span class="label">Efficiency (to date)</span>
                <span class="value" data-efficiency-percent>—</span>
              </div>
            </div>
            <p class="small muted" data-efficiency-window-label>${defaultEfficiencyDescription}</p>
            <p class="small muted">Baseline assumes ${CUTTING_BASELINE_WEEKLY_HOURS} cutting hours per week.</p>
          </div>
          <div class="cost-jobs-summary">
            <div><span class="label">Jobs tracked</span><span>—</span></div>
            <div><span class="label">Total gain / loss</span><span>—</span></div>
            <div><span class="label">Avg per job</span><span>—</span></div>
            <div><span class="label">Rolling avg (chart)</span><span>—</span></div>
          </div>
          <table class="cost-table">
            <thead><tr><th>Job</th><th>Milestone</th><th>Status</th><th>Cost impact</th></tr></thead>
            <tbody>
              <tr>
                <td colspan="4" class="cost-table-placeholder">Job history visualization coming soon.</td>
              </tr>
            </tbody>
          </table>
          <div class="cost-window-insight">
            <div class="chart-info">
              <button type="button" class="chart-info-button" aria-describedby="costEfficiencyInsight" aria-label="Explain Cutting Job Efficiency Snapshot">
                <span aria-hidden="true">?</span>
                <span class="sr-only">Show how the Cutting Job Efficiency Snapshot reveals margin trends</span>
              </button>
              <div class="chart-info-bubble" id="costEfficiencyInsight" role="tooltip">
                <p>${esc(efficiencyInsight)}</p>
              </div>
            </div>
          </div>
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
  const formatRate = (value, { showPlus = false } = {})=>{
    const num = Number(value);
    if (!Number.isFinite(num)) return "—";
    const abs = Math.abs(num);
    const formatted = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: abs < 1000 ? 2 : 0,
      maximumFractionDigits: abs < 1000 ? 2 : 0
    }).format(abs);
    if (num < 0) return `-${formatted}/hr`;
    if (num > 0 && showPlus) return `+${formatted}/hr`;
    return `${formatted}/hr`;
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
  const hoursPerDay = (typeof DAILY_HOURS === "number" && Number.isFinite(DAILY_HOURS) && DAILY_HOURS > 0)
    ? Number(DAILY_HOURS)
    : 8;
  const computeJobNetTotal = (job, eff, { preferActual = false } = {}) => {
    if (!job) return 0;
    const efficiency = eff || {};
    const estimateHours = Number(job.estimateHours) || 0;
    const chargeSource = efficiency.chargeRate != null ? Number(efficiency.chargeRate) : Number(job.chargeRate);
    const chargeRate = Number.isFinite(chargeSource) && chargeSource >= 0 ? chargeSource : JOB_RATE_PER_HOUR;
    const materialCost = Number(job.materialCost) || 0;
    const materialQty = Number(job.materialQty) || 0;
    const materialTotal = materialCost * materialQty;
    const actualRaw = job.actualHours ?? efficiency.actualHours;
    const actualHours = Number.isFinite(Number(actualRaw)) ? Number(actualRaw) : null;
    const hoursFromEstimate = estimateHours > 0 ? estimateHours : 0;
    const hoursFromActual = Number.isFinite(actualHours) && actualHours > 0 ? actualHours : 0;
    const hoursForTotal = preferActual
      ? (hoursFromActual || hoursFromEstimate)
      : (hoursFromEstimate || hoursFromActual);
    let costRate;
    if (efficiency && efficiency.costRate != null && Number.isFinite(Number(efficiency.costRate))){
      costRate = Number(efficiency.costRate);
    } else {
      const hoursBase = hoursForTotal > 0 ? hoursForTotal : hoursFromEstimate;
      const variableRate = hoursBase > 0 ? (materialTotal / hoursBase) : 0;
      costRate = JOB_BASE_COST_PER_HOUR + variableRate;
    }
    const netRate = chargeRate - costRate;
    const totalHours = hoursForTotal > 0 ? hoursForTotal : 0;
    return netRate * totalHours;
  };

  const pendingFiles = Array.isArray(window.pendingNewJobFiles) ? window.pendingNewJobFiles : [];
  const pendingSummary = pendingFiles.length
    ? `${pendingFiles.length} file${pendingFiles.length===1?"":"s"} ready to attach`
    : "No files selected";
  let addFormOpenState = typeof window.jobAddFormOpen === "boolean"
    ? window.jobAddFormOpen
    : null;
  if (addFormOpenState == null){
    addFormOpenState = pendingFiles.length > 0;
    window.jobAddFormOpen = addFormOpenState;
  }
  const addFormOpen = addFormOpenState;
  const completedJobs = Array.isArray(window.completedCuttingJobs) ? window.completedCuttingJobs.slice() : [];
  const completedSorted = completedJobs.sort((a,b)=>{
    const aTime = new Date(a.completedAtISO || a.dueISO || a.startISO || 0).getTime();
    const bTime = new Date(b.completedAtISO || b.dueISO || b.startISO || 0).getTime();
    return bTime - aTime;
  });
  const historySearchRaw = typeof jobHistorySearchTerm === "string"
    ? jobHistorySearchTerm
    : (typeof window.jobHistorySearchTerm === "string" ? window.jobHistorySearchTerm : "");
  const historySearchValue = String(historySearchRaw || "");
  const historyQuery = historySearchValue.trim().toLowerCase();

  const editingCompletedJobsSet = typeof getEditingCompletedJobsSet === "function"
    ? getEditingCompletedJobsSet()
    : (()=>{
        if (!(window.editingCompletedJobs instanceof Set)){
          window.editingCompletedJobs = new Set();
        }
        return window.editingCompletedJobs;
      })();

  const matchesHistorySearch = (job)=>{
    if (!job) return false;
    if (!historyQuery) return true;
    if (editingCompletedJobsSet.has(String(job.id))) return true;
    const eff = job && job.efficiency ? job.efficiency : {};
    const delta = Number(eff.deltaHours);
    const netTotal = computeJobNetTotal(job, eff, { preferActual: true });
    const actualHours = Number(job.actualHours ?? eff.actualHours);
    const estHours = Number(job.estimateHours);
    const statusLabel = Number.isFinite(delta) && Math.abs(delta) > 0.1
      ? (delta > 0 ? "Finished ahead" : "Finished behind")
      : "Finished on estimate";
    const statusDetail = Number.isFinite(delta) && Math.abs(delta) > 0.1
      ? `${delta > 0 ? "+" : "-"}${Math.abs(delta).toFixed(1)} hr`
      : "";
    const completedLabel = formatDate(job?.completedAtISO);
    const startLabel = formatDate(job?.startISO);
    const dueLabel = formatDate(job?.dueISO);
    const categoryLabel = folderMap.get(normalizeCategory(job?.cat))?.name || "";
    const actualLabel = formatHours(actualHours);
    const estimateLabel = formatHours(estHours);
    const tokens = [
      job.id,
      job.name,
      job.material,
      job.notes,
      job.completedAtISO,
      job.startISO,
      job.dueISO,
      categoryLabel,
      statusLabel,
      statusDetail,
      Number.isFinite(delta) ? delta.toFixed(1) : "",
      Number.isFinite(delta) ? (delta > 0 ? "ahead" : delta < 0 ? "behind" : "on pace") : "",
      Number.isFinite(netTotal) ? netTotal.toString() : ""
    ];
    [completedLabel, startLabel, dueLabel].forEach(label => {
      if (label && label !== "—") tokens.push(label);
    });
    if (actualLabel && actualLabel !== "—") tokens.push(actualLabel);
    if (estimateLabel && estimateLabel !== "—") tokens.push(estimateLabel);
    if (actualLabel && estimateLabel && actualLabel !== "—" && estimateLabel !== "—"){
      tokens.push(`${actualLabel} / ${estimateLabel}`);
    }
    if (Number.isFinite(netTotal)){
      tokens.push(formatCurrency(netTotal));
      tokens.push(formatCurrency(netTotal, { showPlus: false }));
    }
    const numericFields = [
      job.materialCost,
      job.materialQty,
      job.actualHours,
      job.estimateHours,
      eff.actualHours,
      eff.expectedHours,
      eff.expectedRemaining,
      eff.actualRemaining
    ];
    numericFields.forEach(value => {
      if (value == null || value === "") return;
      tokens.push(String(value));
    });
    return tokens.some(field => {
      if (field == null) return false;
      const text = String(field).trim();
      if (!text) return false;
      return text.toLowerCase().includes(historyQuery);
    });
  };

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

  const rootCategoryId = typeof window.JOB_ROOT_FOLDER_ID === "string" ? window.JOB_ROOT_FOLDER_ID : "jobs_root";
  const jobFolders = Array.isArray(window.jobFolders) && window.jobFolders.length
    ? window.jobFolders.slice()
    : defaultJobFolders();
  if (!jobFolders.some(folder => String(folder.id) === rootCategoryId)){
    jobFolders.push({ id: rootCategoryId, name: "All Jobs", parent: null, order: 1 });
  }
  const folderMap = new Map(jobFolders.map(folder => [String(folder.id), folder]));
  const parentMap = new Map(jobFolders.map(folder => [String(folder.id), folder.parent == null ? null : String(folder.parent)]));
  const normalizeCategory = (cat)=>{
    const key = cat != null ? String(cat) : rootCategoryId;
    if (folderMap.has(key)) return key;
    return rootCategoryId;
  };
  const selectedCategoryRaw = typeof window.jobCategoryFilter === "string" ? window.jobCategoryFilter : rootCategoryId;
  const selectedCategory = folderMap.has(String(selectedCategoryRaw)) ? String(selectedCategoryRaw) : rootCategoryId;
  window.jobCategoryFilter = selectedCategory;

  const initialOpenFolders = Array.isArray(window.jobCategoryOpenFolders)
    ? window.jobCategoryOpenFolders.map(id => String(id))
    : null;
  const openFolderSet = new Set(initialOpenFolders || []);
  if (!initialOpenFolders){
    openFolderSet.add(selectedCategory);
  }
  window.jobCategoryOpenFolders = Array.from(openFolderSet);

  const sortFolders = (list)=> list.slice().sort((a, b)=>{
    const orderDiff = (Number(b?.order) || 0) - (Number(a?.order) || 0);
    if (orderDiff !== 0) return orderDiff;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });

  const childrenOf = (parentId)=>{
    const key = parentId == null ? null : String(parentId);
    return sortFolders(jobFolders.filter(folder => {
      const parentKey = folder.parent == null ? null : String(folder.parent);
      return parentKey === key;
    }));
  };

  const includeDescendants = (categoryId, acc)=>{
    const key = String(categoryId);
    if (acc.has(key)) return;
    acc.add(key);
    const kids = childrenOf(categoryId);
    kids.forEach(child => includeDescendants(child.id, acc));
  };

  const allowedCategories = new Set();
  includeDescendants(selectedCategory, allowedCategories);

  const activeCounts = new Map();
  const completedCounts = new Map();
  const incrementCounts = (map, catId)=>{
    let current = normalizeCategory(catId);
    while (current){
      map.set(current, (map.get(current) || 0) + 1);
      const parent = parentMap.get(current);
      if (parent == null) break;
      current = String(parent);
    }
  };

  cuttingJobs.forEach(job => incrementCounts(activeCounts, job?.cat));
  completedCuttingJobs.forEach(job => incrementCounts(completedCounts, job?.cat));

  const jobsByCategory = new Map();
  const registerJobForCategory = (catId, job)=>{
    if (!job) return;
    let current = normalizeCategory(catId);
    if (!current) current = rootCategoryId;
    const visited = new Set();
    while (current && !visited.has(current)){
      visited.add(current);
      const list = jobsByCategory.get(current) || [];
      list.push(job);
      jobsByCategory.set(current, list);
      const parent = parentMap.get(current);
      if (parent == null) break;
      current = String(parent);
    }
  };
  cuttingJobs.forEach(job => registerJobForCategory(job?.cat, job));

  const folderOptions = [];
  const ensureFolderEntry = (folder, depth)=>{
    if (!folder) return;
    const id = String(folder.id);
    const indent = depth ? Array(depth).fill("&nbsp;&nbsp;").join("") : "";
    const prefix = depth ? "↳ " : "";
    const safeLabel = esc(folder.name || (id === rootCategoryId ? "All Jobs" : "Category"));
    folderOptions.push({ id, label: `${indent}${prefix}${safeLabel}` });
    const kids = childrenOf(folder.id);
    kids.forEach(child => ensureFolderEntry(child, depth + 1));
  };
  const rootFolder = folderMap.get(rootCategoryId) || { id: rootCategoryId, name: "All Jobs", parent: null, order: 1 };
  ensureFolderEntry(rootFolder, 0);

  const categoryOptionsMarkup = (selectedId, { includeCreateOption = false, rootLabel } = {})=>{
    const target = normalizeCategory(selectedId);
    const optionsHtml = folderOptions.map(option => {
      const selectedAttr = option.id === target ? " selected" : "";
      const label = option.id === rootCategoryId && rootLabel ? esc(rootLabel) : option.label;
      return `<option value="${esc(option.id)}"${selectedAttr}>${label}</option>`;
    }).join("");
    if (!includeCreateOption) return optionsHtml;
    return `${optionsHtml}<option value="__new__">+ Create new category…</option>`;
  };

  const normalizeHexColor = (value)=>{
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
    if (!match) return null;
    let hex = match[1];
    if (hex.length === 3){
      hex = hex.split("").map(ch => `${ch}${ch}`).join("");
    }
    return `#${hex.toUpperCase()}`;
  };

  const clampChannel = (value)=> Math.max(0, Math.min(255, Math.round(value)));
  const hexToRgb = (hex)=>{
    const normalized = normalizeHexColor(hex);
    if (!normalized) return null;
    const raw = normalized.slice(1);
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16)
    };
  };
  const rgbToHex = (r, g, b)=> `#${clampChannel(r).toString(16).padStart(2, "0").toUpperCase()}${clampChannel(g).toString(16).padStart(2, "0").toUpperCase()}${clampChannel(b).toString(16).padStart(2, "0").toUpperCase()}`;
  const mixHex = (base, blend, amount)=>{
    const rgbBase = hexToRgb(base) || { r: 19, g: 35, b: 63 };
    const rgbBlend = hexToRgb(blend) || { r: 255, g: 255, b: 255 };
    const weight = Math.max(0, Math.min(1, Number(amount) || 0));
    const r = (rgbBase.r * (1 - weight)) + (rgbBlend.r * weight);
    const g = (rgbBase.g * (1 - weight)) + (rgbBlend.g * weight);
    const b = (rgbBase.b * (1 - weight)) + (rgbBlend.b * weight);
    return rgbToHex(r, g, b);
  };
  const rgbaFromHex = (hex, alpha)=>{
    const rgb = hexToRgb(hex) || { r: 19, g: 35, b: 63 };
    const a = Math.max(0, Math.min(1, Number(alpha) || 0));
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
  };
  const hslToHex = (h, s, l)=>{
    const sat = Math.max(0, Math.min(100, s)) / 100;
    const lig = Math.max(0, Math.min(100, l)) / 100;
    const chroma = (1 - Math.abs((2 * lig) - 1)) * sat;
    const huePrime = ((h % 360) + 360) % 360 / 60;
    const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (huePrime >= 0 && huePrime < 1){ [r, g, b] = [chroma, x, 0]; }
    else if (huePrime >= 1 && huePrime < 2){ [r, g, b] = [x, chroma, 0]; }
    else if (huePrime >= 2 && huePrime < 3){ [r, g, b] = [0, chroma, x]; }
    else if (huePrime >= 3 && huePrime < 4){ [r, g, b] = [0, x, chroma]; }
    else if (huePrime >= 4 && huePrime < 5){ [r, g, b] = [x, 0, chroma]; }
    else { [r, g, b] = [chroma, 0, x]; }
    const m = lig - (chroma / 2);
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  };

  const categoryColorDataCache = new Map();
  const categoryColorData = (catId)=>{
    const normalized = normalizeCategory(catId);
    if (categoryColorDataCache.has(normalized)) return categoryColorDataCache.get(normalized);
    const folder = folderMap.get(normalized);
    const custom = normalizeHexColor(folder?.color);
    const accentHex = (()=>{
      if (custom) return custom;
      if (!normalized || normalized === rootCategoryId) return "#13233F";
      let hash = 0;
      const str = String(normalized);
      for (let i = 0; i < str.length; i++){
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      const hue = Math.abs(hash) % 360;
      return hslToHex(hue, 62, 55);
    })();
    const surfaceHex = mixHex(accentHex, "#FFFFFF", 0.86);
    const borderHex = mixHex(accentHex, "#FFFFFF", 0.7);
    const textHex = mixHex(accentHex, "#0B1223", 0.18);
    const styleAttr = ` style="--job-category-surface:${rgbaFromHex(surfaceHex, 0.85)};--job-category-accent:${accentHex};--job-category-border:${rgbaFromHex(borderHex, 0.6)};--job-category-text:${textHex};--job-category-accent-soft:${rgbaFromHex(accentHex, 0.28)};"`;
    const data = { style: styleAttr, accentHex, isCustom: Boolean(custom), normalized };
    categoryColorDataCache.set(normalized, data);
    return data;
  };
  const categoryColorStyle = (catId)=> categoryColorData(catId).style;
  const categoryAccentHex = (catId)=> categoryColorData(catId).accentHex;
  const categoryHasCustomColor = (catId)=> categoryColorData(catId).isCustom;

  const renderFolderTree = (folder)=>{
    if (!folder) return "";
    const id = String(folder.id);
    const isRoot = id === rootCategoryId;
    const selectedClass = id === selectedCategory ? " job-folder-row-selected" : "";
    const activeCount = activeCounts.get(id) || 0;
    const completedCount = completedCounts.get(id) || 0;
    const countParts = [];
    if (activeCount > 0) countParts.push(`${activeCount} active`);
    if (completedCount > 0) countParts.push(`${completedCount} archived`);
    const countLabel = countParts.length ? `<span class="job-folder-count">${countParts.join(" · ")}</span>` : "";
    const jobsForFolder = (jobsByCategory.get(id) || []).slice().sort((a, b)=>{
      const dueTime = (job)=>{
        if (!job || !job.dueISO) return Number.POSITIVE_INFINITY;
        const parsed = Date.parse(job.dueISO);
        return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
      };
      const dueDiff = dueTime(a) - dueTime(b);
      if (dueDiff !== 0) return dueDiff;
      return String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: "base" });
    });
    const jobSummaryLabel = jobsForFolder.length
      ? `${jobsForFolder.length} active job${jobsForFolder.length === 1 ? "" : "s"}`
      : "No active jobs yet";
    const jobListItems = jobsForFolder.length
      ? jobsForFolder.map(job => {
          const metaParts = [];
          const est = Number(job?.estimateHours);
          if (Number.isFinite(est)) metaParts.push(`${formatHours(est)} est`);
          if (job?.dueISO){
            const due = formatDate(job.dueISO);
            if (due && due !== "—") metaParts.push(`Due ${due}`);
          }
          const metaLine = metaParts.length
            ? `<div class="job-folder-job-meta">${metaParts.map(part => esc(part)).join(" &middot; ")}</div>`
            : "";
          const jobColorStyle = categoryColorStyle(job?.cat);
          return `<li><div class="job-folder-job-chip job-title-chip job-title-chip-compact"${jobColorStyle}>
              <span class="job-title-chip-dot" aria-hidden="true"></span>
              <span class="job-title-chip-text">${esc(job?.name || "Untitled job")}</span>
            </div>${metaLine}</li>`;
        }).join("")
      : `<li class="muted">Add jobs to this category to see them listed.</li>`;
    const isOpen = openFolderSet.has(id);
    const jobListMarkup = `<details class="job-folder-jobs" data-job-folder-jobs="${esc(id)}"${isOpen ? " open" : ""}>
        <summary><span class="job-folder-jobs-count">${esc(jobSummaryLabel)}</span></summary>
        <ul class="job-folder-joblist">${jobListItems}</ul>
      </details>`;
    const colorData = categoryColorData(id);
    const colorStyleAttr = colorData.style;
    const actions = [
      `<button type="button" class="link" data-job-folder-add="${esc(id)}">+ Sub-category</button>`,
      !isRoot ? `<button type="button" class="link" data-job-folder-rename="${esc(id)}">Rename</button>` : "",
      !isRoot ? `<button type="button" class="link danger" data-job-folder-remove="${esc(id)}">Remove</button>` : ""
    ].filter(Boolean).join("<span class=\"job-folder-action-sep\" aria-hidden=\"true\">·</span>");
    const childrenMarkup = childrenOf(folder.id).map(child => renderFolderTree(child)).join("");
    const colorControl = `
      <div class="category-color-control" data-category-color-control="${esc(id)}"${colorStyleAttr}>
        <span class="category-color-dot" aria-hidden="true"></span>
        <span class="category-color-preview">
          <span class="category-color-bar" aria-hidden="true"></span>
          <input type="color" class="category-color-picker" value="${categoryAccentHex(id)}" data-job-folder-color-input="${esc(id)}" aria-label="Choose color for ${esc(folder.name || (isRoot ? "All Jobs" : "Category"))}">
        </span>
        <button type="button" class="category-color-reset${categoryHasCustomColor(id) ? "" : " is-hidden"}" data-job-folder-color-reset="${esc(id)}" title="Use automatic color">Auto</button>
      </div>`;
    return `
      <div class="job-folder" data-job-folder="${esc(id)}">
        <div class="job-folder-row${selectedClass}" data-category-color="1"${colorStyleAttr}>
          <div class="job-folder-row-info">
            <button type="button" class="job-folder-select" data-job-folder-select="${esc(id)}" aria-current="${id === selectedCategory ? "true" : "false"}">
              ${esc(folder.name || (isRoot ? "All Jobs" : "Category"))}
            </button>
            ${countLabel}
          </div>
          ${colorControl}
        </div>
        ${jobListMarkup}
        <div class="job-folder-actions">${actions || ""}</div>
        ${childrenMarkup ? `<div class="job-folder-children">${childrenMarkup}</div>` : ""}
      </div>
    `;
  };

  const folderTreeMarkup = renderFolderTree(rootFolder);

  const jobsForCategory = cuttingJobs.filter(job => {
    const normalized = normalizeCategory(job?.cat);
    return allowedCategories.has(normalized);
  });

  const completedForCategory = completedSorted.filter(job => {
    const normalized = normalizeCategory(job?.cat);
    return allowedCategories.has(normalized);
  });

  const completedFiltered = completedForCategory.filter(matchesHistorySearch);
  const completedStats = completedFiltered.reduce((acc, job)=>{
    const eff = computeJobEfficiency(job);
    const net = computeJobNetTotal(job, eff, { preferActual: true });
    acc.total += Number.isFinite(net) ? net : 0;
    return acc;
  }, { total: 0 });
  const completedAverage = completedFiltered.length ? (completedStats.total / completedFiltered.length) : 0;

  const jobColumnCount = 16;
  const historyColumnCount = jobColumnCount;
  const historySearchDisplay = historySearchValue
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const now = new Date();
  const formatPastDueLabel = (dueISO)=>{
    const dueDate = parseDateLocal(dueISO);
    if (!dueDate) return "Past due";
    dueDate.setHours(23, 59, 59, 999);
    const diffMs = now.getTime() - dueDate.getTime();
    if (diffMs <= 0) return "Past due";
    const totalHours = diffMs / (1000 * 60 * 60);
    if (totalHours >= 24){
      const totalDays = Math.floor(totalHours / 24);
      const remainingHours = Math.floor(totalHours % 24);
      const parts = [];
      if (totalDays > 0){
        parts.push(`${totalDays} day${totalDays === 1 ? "" : "s"}`);
      }
      if (remainingHours > 0){
        parts.push(`${remainingHours} hr${remainingHours === 1 ? "" : "s"}`);
      }
      if (!parts.length){
        parts.push("1 day");
      }
      return `Past due by ${parts.join(" ")}`;
    }
    const wholeHours = Math.floor(totalHours);
    if (wholeHours >= 1){
      return `Past due by ${wholeHours} hr${wholeHours === 1 ? "" : "s"}`;
    }
    return "Past due by less than 1 hr";
  };
  const JOB_NOTE_PREVIEW_LIMIT = 100;
  const buildJobNotePreview = (value)=>{
    const raw = typeof value === "string" ? value : "";
    const trimmed = raw.trim();
    if (!trimmed){
      return { preview: "", tooltip: "" };
    }
    const normalized = trimmed.replace(/\s+/g, " ").trim();
    if (normalized.length <= JOB_NOTE_PREVIEW_LIMIT){
      return { preview: normalized, tooltip: normalized };
    }
    let slice = normalized.slice(0, JOB_NOTE_PREVIEW_LIMIT);
    const lastSpace = slice.lastIndexOf(" ");
    if (lastSpace > Math.floor(JOB_NOTE_PREVIEW_LIMIT * 0.6)){
      slice = slice.slice(0, lastSpace);
    }
    slice = slice.replace(/\s+$/, "");
    return {
      preview: `${slice}...`,
      tooltip: normalized
    };
  };

  const completedRows = completedFiltered.map(job => {
    const eff = computeJobEfficiency(job);
    const req = computeRequiredDaily(job);
    const delta = Number(eff.deltaHours);
    const netTotal = computeJobNetTotal(job, eff, { preferActual: true });
    const actualHours = Number(job.actualHours ?? eff.actualHours);
    const estHours = Number(job.estimateHours);
    const editingHistory = editingCompletedJobsSet.has(String(job.id));
    const normalizedCatId = normalizeCategory(job?.cat);
    const categoryFolder = folderMap.get(normalizedCatId);
    const categoryName = categoryFolder ? categoryFolder.name || "All Jobs" : "All Jobs";
    const historyColorStyle = categoryColorStyle(job?.cat);
    const colorInfo = categoryColorData(normalizedCatId);
    const colorStyleAttr = colorInfo.style;
    const jobFiles = Array.isArray(job?.files) ? job.files : [];
    const fileCount = jobFiles.length;
    const fileMenuId = `jobFileMenu_${job.id}`;
    const fileLabel = fileCount
      ? `${fileCount} file${fileCount === 1 ? "" : "s"}`
      : "No files";
    const fileMenuItems = fileCount
      ? jobFiles.map((f, idx) => {
          const safeName = esc(f?.name || `file_${idx + 1}`);
          const hrefRaw = f?.dataUrl || f?.url || "";
          const href = esc(hrefRaw);
          if (!hrefRaw){
            return `<li class="job-file-menu-item">${safeName}</li>`;
          }
          return `<li class="job-file-menu-item"><a href="${href}" download="${safeName}" target="_blank" rel="noopener">${safeName}</a></li>`;
        }).join("")
      : "";
    const fileMenu = fileCount
      ? `<ul class="job-file-menu-list">${fileMenuItems}</ul>`
      : `<p class="job-file-menu-empty small muted">No files attached</p>`;

    const matCost = Number(job?.materialCost || 0);
    const matQty = Number(job?.materialQty || 0);
    const matTotal = (matCost * matQty) || 0;
    const chargeRateRaw = Number(job?.chargeRate);
    const chargeRate = Number.isFinite(chargeRateRaw) && chargeRateRaw >= 0 ? chargeRateRaw : JOB_RATE_PER_HOUR;
    const chargeDisplay = formatRate(chargeRate);
    const costRate = JOB_BASE_COST_PER_HOUR + (estHours > 0 ? (matTotal / estHours) : 0);
    const costDisplay = formatRate(costRate);
    const netRate = chargeRate - costRate;
    const netDisplay = formatRate(netRate, { showPlus: true });
    const netClass = netRate >= 0 ? "job-rate-net-positive" : "job-rate-net-negative";
    const netTotalDisplay = formatCurrency(netTotal, { showPlus: true });
    const impactClass = netTotal > 0 ? "job-impact-ahead" : (netTotal < 0 ? "job-impact-behind" : "job-impact-neutral");

    let statusLabel = "Finished on estimate";
    if (Number.isFinite(delta) && Math.abs(delta) > 0.1){
      statusLabel = delta > 0 ? "Finished ahead" : "Finished behind";
    }
    const statusDetail = Number.isFinite(delta) && Math.abs(delta) > 0.1
      ? ` (${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)} hr)`
      : "";
    const statusClass = statusLabel.toLowerCase().includes("ahead")
      ? "job-status-ahead"
      : (statusLabel.toLowerCase().includes("behind") ? "job-status-behind" : "job-status-onpace");

    const startDate = parseDateLocal(job?.startISO);
    const dueDate = parseDateLocal(job?.dueISO);
    const completedDate = parseDateLocal(job?.completedAtISO);
    const startTxt = startDate ? startDate.toDateString() : "—";
    const dueTxt = dueDate ? dueDate.toDateString() : "—";
    const completedTxt = completedDate ? completedDate.toDateString() : "—";

    const estimateDisplay = formatHours(estHours);
    const actualDisplay = formatHours(actualHours);
    const remainingHours = Number.isFinite(req.remainingHours) ? Math.max(0, req.remainingHours) : 0;
    const remainingDisplay = formatHours(remainingHours);
    const needPerDay = req.requiredPerDay === Infinity
      ? "∞"
      : (req.requiredPerDay || 0).toFixed(2);
    let needDisplay = req.requiredPerDay === Infinity
      ? `<span class="job-badge job-badge-overdue">${esc(formatPastDueLabel(job?.dueISO))}</span>`
      : `${needPerDay} hr/day needed (capacity ${hoursPerDay.toFixed(1)} hr/day)`;
    if (completedTxt !== "—"){
      needDisplay += `<div class="small muted">Completed ${esc(completedTxt)}</div>`;
    }

    const noteContent = (job?.notes || "").trim();
    const noteButtonLabel = esc(job?.name || "Cutting job");
    const notePreview = buildJobNotePreview(noteContent);
    const notePreviewTitleAttr = notePreview.tooltip ? ` title="${esc(notePreview.tooltip)}"` : "";

    const efficiencySummaryParts = [
      `${statusLabel}${statusDetail}`.trim(),
      `Actual ${actualDisplay} vs ${estimateDisplay}`.trim(),
      completedTxt !== "—" ? `Completed ${completedTxt}` : ""
    ].filter(Boolean);
    const efficiencySummaryText = efficiencySummaryParts.join(" • ") || "Completion details unavailable";

    const actionMenuId = `historyActionsMenu_${job.id}`;

    if (!editingHistory){
      const matCostDisplay = formatCurrency(matCost, { showPlus: false });
      const matQtyDisplay = formatQuantity(matQty);
      return `
        <tr data-history-row="${job.id || ""}" class="job-row">
          <td class="job-col job-col-main job-col-locked" data-history-requires-edit="${job.id}">
            <div class="job-main">
              <div class="job-title-chip"${colorStyleAttr}>
                <span class="job-title-chip-dot" aria-hidden="true"></span>
                <span class="job-title-chip-text">${esc(job?.name || "Job")}</span>
              </div>
              <div class="job-main-category small muted" data-category-color="1"${historyColorStyle}>
                <span class="sr-only">Category</span>
                <span class="job-main-category-name">Category:</span>
              </div>
              <div class="job-main-dates">${startTxt} → ${dueTxt}</div>
              <div class="job-main-summary small muted">Actual ${actualDisplay} vs ${estimateDisplay}</div>
            </div>
          </td>
          <td class="job-col job-col-estimate job-col-locked" data-history-requires-edit="${job.id}">${estimateDisplay}</td>
          <td class="job-col job-col-material job-col-locked" data-history-requires-edit="${job.id}">${job?.material ? esc(job.material) : "—"}</td>
          <td class="job-col job-col-input job-col-locked" data-history-requires-edit="${job.id}">${matCostDisplay}</td>
          <td class="job-col job-col-input job-col-locked" data-history-requires-edit="${job.id}">${matQtyDisplay}</td>
          <td class="job-col job-col-money">$${matTotal.toFixed(2)}</td>
          <td class="job-col job-col-charge">${chargeDisplay}</td>
          <td class="job-col job-col-cost">${costDisplay}</td>
          <td class="job-col job-col-net"><span class="job-rate-net ${netClass}">${netDisplay}</span></td>
          <td class="job-col job-col-hours">${remainingDisplay}</td>
          <td class="job-col job-col-need">${needDisplay}</td>
          <td class="job-col job-col-status">
            <div class="job-status ${statusClass}">${esc(statusLabel)}</div>
            ${statusDetail ? `<div class="job-status-detail">${esc(statusDetail.trim())}</div>` : ""}
          </td>
          <td class="job-col job-col-files">
            <div class="job-cell job-cell-stretch">
              <span class="job-cell-label">Files</span>
              <div class="job-file-cell">
                <button type="button" class="job-file-trigger ${fileCount ? "has-files" : ""}" data-job-files="${job.id}" aria-haspopup="true" aria-expanded="false" aria-controls="${esc(fileMenuId)}">
                  <span class="job-file-trigger-text">${esc(fileLabel)}</span>
                  <span class="job-file-trigger-icon" aria-hidden="true">▾</span>
                </button>
                <div class="job-file-dropdown" id="${esc(fileMenuId)}" data-job-file-menu="${job.id}" hidden>
                  ${fileMenu}
                  <div class="job-file-menu-hint small muted">Edit the job to manage files.</div>
                </div>
              </div>
              <div class="job-impact-files">
                <span class="job-impact-files-label">Attached files</span>
                ${fileCount
                  ? `<ul class="job-impact-files-list">${jobFiles.map((f, idx) => {
                      const safeName = esc(f?.name || `file_${idx + 1}`);
                      const href = esc(f?.dataUrl || f?.url || "");
                      return href
                        ? `<li><a href="${href}" download="${safeName}" target="_blank" rel="noopener">${safeName}</a></li>`
                        : `<li>${safeName}</li>`;
                    }).join("")}</ul>`
                  : '<span class="job-impact-files-empty small muted">No files attached</span>'}
              </div>
            </div>
          </td>
          <td class="job-col job-col-impact">
            <div class="job-impact-stack">
              <div class="job-impact-header">
                <span class="job-impact ${impactClass}">${netTotalDisplay}</span>
              </div>
              <div class="job-impact-meta">${esc(efficiencySummaryText)}</div>
              <dl class="job-impact-metrics">
                <div><dt>Charge</dt><dd>${chargeDisplay}</dd></div>
                <div><dt>Cost</dt><dd>${costDisplay}</dd></div>
                <div><dt>Net/hr</dt><dd class="${netClass}">${netDisplay}</dd></div>
                <div><dt>Net total</dt><dd class="${impactClass}">${netTotalDisplay}</dd></div>
              </dl>
            </div>
          </td>
          <td class="job-col job-col-note">
            ${notePreview.preview
              ? `<div class="job-note-inline" data-job-note="${job.id}" role="button" tabindex="0" aria-haspopup="dialog" aria-controls="jobNoteModal" aria-label="Notes for ${noteButtonLabel}"${notePreviewTitleAttr}>
                  <span class="job-note-inline-text">${textEsc(notePreview.preview)}</span>
                </div>`
              : `<button type="button" class="job-note-button" data-job-note="${job.id}" aria-haspopup="dialog" aria-controls="jobNoteModal" aria-label="Notes for ${noteButtonLabel}">
                  <span class="job-note-button-icon" aria-hidden="true">🗒</span>
                  <span class="job-note-button-label">Add note</span>
                </button>`}
          </td>
          <td class="job-col job-col-actions">
            <div class="job-actions">
              <button type="button" class="job-actions-trigger" data-history-actions-toggle="${job.id}" aria-haspopup="true" aria-expanded="false" aria-controls="${esc(actionMenuId)}">
                <span class="job-actions-trigger-label">Actions</span>
                <span class="job-actions-trigger-caret" aria-hidden="true">▾</span>
              </button>
              <div class="job-actions-menu" id="${esc(actionMenuId)}" data-history-actions-menu="${job.id}" hidden>
                <button type="button" data-history-activate="${job.id}">Make active copy</button>
                <button type="button" data-history-edit="${job.id}">Edit</button>
                <button type="button" class="danger" data-history-delete="${job.id}">Delete</button>
              </div>
            </div>
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
      <tr data-history-row="${job.id || ""}" class="job-row editing">
        <td colspan="${historyColumnCount}">
          <div class="job-edit-card">
            <div class="job-edit-layout">
              <div class="job-edit-grid">
                <label>Job name<input type="text" data-history-field="name" data-history-id="${job.id}" value="${esc(job?.name || "")}"></label>
                <label>Completed at<input type="datetime-local" data-history-field="completedAtISO" data-history-id="${job.id}" value="${completedVal}"></label>
                <label>Estimate (hrs)<input type="number" min="0" step="0.1" data-history-field="estimateHours" data-history-id="${job.id}" value="${estimateVal}"></label>
                <label>Actual (hrs)<input type="number" min="0" step="0.1" data-history-field="actualHours" data-history-id="${job.id}" value="${actualVal}"></label>
                <label>Material<input type="text" data-history-field="material" data-history-id="${job.id}" value="${esc(job?.material || "")}"></label>
                <label>Material cost<input type="number" min="0" step="0.01" data-history-field="materialCost" data-history-id="${job.id}" value="${materialCostVal}"></label>
                <label>Material quantity<input type="number" min="0" step="0.01" data-history-field="materialQty" data-history-id="${job.id}" value="${materialQtyVal}"></label>
                <label>Category<select data-history-field="cat" data-history-id="${job.id}" data-job-category-select>
                  ${categoryOptionsMarkup(job.cat, { includeCreateOption: true })}
                </select></label>
              </div>
              <aside class="job-edit-summary" aria-label="Completed job summary">
                <div class="job-edit-summary-title">Job summary</div>
                <div class="job-edit-summary-metrics">
                  <div class="job-metric job-metric-total">
                    <span class="job-metric-label">Material total</span>
                    <span class="job-metric-value">$${matTotal.toFixed(2)}</span>
                  </div>
                  <div class="job-metric">
                    <span class="job-metric-label">Charge rate</span>
                    <span class="job-metric-value">${chargeDisplay}</span>
                  </div>
                  <div class="job-metric">
                    <span class="job-metric-label">Cost rate</span>
                    <span class="job-metric-value">${costDisplay}</span>
                  </div>
                  <div class="job-metric">
                    <span class="job-metric-label">Net profit / hr</span>
                    <span class="job-metric-value ${netClass}">${netDisplay}</span>
                  </div>
                  <div class="job-metric">
                    <span class="job-metric-label">Net total</span>
                    <span class="job-metric-value ${impactClass}">${netTotalDisplay}</span>
                  </div>
                  <div class="job-metric">
                    <span class="job-metric-label">Completed</span>
                    <span class="job-metric-value small muted">${completedTxt}</span>
                  </div>
                </div>
              </aside>
            </div>
            <label class="job-edit-note">Notes<textarea data-history-field="notes" data-history-id="${job.id}" rows="3" placeholder="Notes...">${textEsc(job?.notes || "")}</textarea></label>
            <div class="job-edit-actions">
              <button type="button" data-history-save="${job.id}">Save</button>
              <button type="button" class="danger" data-history-cancel="${job.id}">Cancel</button>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join("");
  const historySearchActive = historyQuery.length > 0;
  const totalCompletedCount = completedForCategory.length;
  const historyEmptyMessage = historySearchActive
    ? "No past cutting jobs match your search."
    : "Mark jobs complete to build a history of past cutting work.";
  const completedTable = completedFiltered.length
    ? `
      <div class="past-jobs-summary">
        <div><span class="label">Jobs logged</span><span>${completedFiltered.length}</span></div>
        <div><span class="label">Total impact</span><span>${formatCurrency(completedStats.total)}</span></div>
        <div><span class="label">Avg per job</span><span>${formatCurrency(completedAverage)}</span></div>
      </div>
      <table class="past-jobs-table job-table">
        <thead>
          <tr>
            <th>Job</th>
            <th>Estimate</th>
            <th>Material</th>
            <th>Cost / unit</th>
            <th>Quantity</th>
            <th>Material total</th>
            <th>Charge rate</th>
            <th>Cost rate</th>
            <th>Net profit/hr</th>
            <th>Hours remaining</th>
            <th>Needed / day</th>
            <th>Status</th>
            <th>Files</th>
            <th>Net total</th>
            <th>Notes</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${completedRows}</tbody>
      </table>
    `
    : `<p class="small muted">${historyEmptyMessage}</p>`;
  const historyFilterStatus = historySearchActive
    ? `<div class="small muted past-jobs-filter-status">Showing ${completedFiltered.length} of ${totalCompletedCount} logged jobs.</div>`
    : "";
  const activeColumnCount = jobColumnCount;
  const rows = jobsForCategory.map(j => {
    const jobFiles = Array.isArray(j.files) ? j.files : [];
    const fileCount = jobFiles.length;
    const fileMenuId = `jobFileMenu_${j.id}`;
    const actionMenuId = `jobActionsMenu_${j.id}`;
    const fileLabel = fileCount
      ? `${fileCount} file${fileCount === 1 ? "" : "s"}`
      : "No files";
    const fileMenuItems = fileCount
      ? jobFiles.map((f, idx) => {
          const safeName = esc(f?.name || `file_${idx + 1}`);
          const hrefRaw = f?.dataUrl || f?.url || "";
          const href = esc(hrefRaw);
          if (!hrefRaw){
            return `<li class="job-file-menu-item">${safeName}</li>`;
          }
          return `<li class="job-file-menu-item"><a href="${href}" download="${safeName}" target="_blank" rel="noopener">${safeName}</a></li>`;
        }).join("")
      : "";
    const fileMenuActions = `<div class="job-file-menu-actions"><button type="button" class="job-file-menu-action" data-job-file-add="${j.id}">+ Add files</button></div>`;
    const fileMenu = (fileCount
      ? `<ul class="job-file-menu-list">${fileMenuItems}</ul>`
      : `<p class="job-file-menu-empty small muted">No files attached</p>`)
      + fileMenuActions;
    const eff = computeJobEfficiency(j);
    const req = computeRequiredDaily(j);
    const editing = editingJobs.has(j.id);
    const normalizedCatId = normalizeCategory(j.cat);
    const categoryFolder = folderMap.get(normalizedCatId);
    const categoryName = categoryFolder ? categoryFolder.name || "All Jobs" : "All Jobs";
    const colorInfo = categoryColorData(normalizedCatId);
    const colorStyleAttr = colorInfo.style;

    // Material totals
    const matCost = Number(j.materialCost||0);
    const matQty  = Number(j.materialQty||0);
    const matTotal = (matCost * matQty) || 0;
    const estHours = Number(j.estimateHours) || 0;
    const chargeRateRaw = Number(j.chargeRate);
    const chargeRate = Number.isFinite(chargeRateRaw) && chargeRateRaw >= 0 ? chargeRateRaw : JOB_RATE_PER_HOUR;
    const costRate = JOB_BASE_COST_PER_HOUR + (estHours > 0 ? (matTotal / estHours) : 0);
    const netRate = chargeRate - costRate;
    const chargeDisplay = formatRate(chargeRate);
    const costDisplay = formatRate(costRate);
    const netDisplay = formatRate(netRate, { showPlus: true });
    const netClass = netRate >= 0 ? "job-rate-net-positive" : "job-rate-net-negative";
    const netTotal = computeJobNetTotal(j, eff, { preferActual: false });
    const netTotalDisplay = formatCurrency(netTotal, { showPlus: true });
    const impactClass = netTotal > 0 ? "job-impact-ahead" : (netTotal < 0 ? "job-impact-behind" : "job-impact-neutral");

    // Remaining & per-day
    const actualRemain = eff.actualRemaining != null ? eff.actualRemaining : (req.remainingHours || 0);
    const remainHrs = actualRemain;
    const needPerDay = req.requiredPerDay === Infinity
      ? '∞'
      : (req.requiredPerDay||0).toFixed(2);
    const remainingHours = Number.isFinite(req.remainingHours) ? Math.max(0, req.remainingHours) : 0;
    const remainingDays = Number.isFinite(req.remainingDays) ? Math.max(0, req.remainingDays) : 0;
    const capacityRemaining = remainingDays * hoursPerDay;
    const slackHours = req.requiredPerDay === Infinity
      ? Number.NEGATIVE_INFINITY
      : capacityRemaining - remainingHours;
    const SLACK_EPS = 0.05;
    const behindSchedule = req.requiredPerDay === Infinity || slackHours < -SLACK_EPS;
    const aheadSchedule = !behindSchedule && slackHours > (hoursPerDay + SLACK_EPS);
    const statusLabel = behindSchedule ? 'Behind' : (aheadSchedule ? 'Ahead' : 'On pace');
    let statusDetail = '';
    if (req.requiredPerDay === Infinity){
      statusDetail = formatPastDueLabel(j.dueISO);
    } else if (behindSchedule){
      statusDetail = `Needs ${req.requiredPerDay.toFixed(1)} hr/day`;
    } else if (aheadSchedule){
      statusDetail = `${slackHours.toFixed(1)} hr slack`;
    } else if (remainingHours > 0){
      statusDetail = `Needs ${req.requiredPerDay.toFixed(1)} hr/day`;
    }
    const capacitySummary = req.requiredPerDay === Infinity
      ? 'No remaining days on schedule'
      : `${remainingHours.toFixed(1)} hr remaining over ${remainingDays} day${remainingDays===1?'':'s'} (${req.requiredPerDay.toFixed(2)} hr/day vs ${hoursPerDay.toFixed(1)} hr/day capacity)`;
    const slackSummary = req.requiredPerDay === Infinity
      ? ''
      : `${slackHours >= 0 ? '+' : '−'}${Math.abs(slackHours).toFixed(1)} hr capacity`;
    const efficiencyDetail = slackSummary
      ? `${statusLabel}; ${capacitySummary}; ${slackSummary}`
      : `${statusLabel}; ${capacitySummary}`;
    const efficiencySummary = efficiencyDetail
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .join(' • ');
    const efficiencySummaryText = efficiencySummary || 'Schedule data not available';
    const impactDisplay = netTotalDisplay;

    const estimateDisplay = formatHours(j.estimateHours);
    const remainingDisplay = formatHours(remainHrs);
    const needDisplay = req.requiredPerDay === Infinity
      ? `<span class="job-badge job-badge-overdue">${esc(formatPastDueLabel(j.dueISO))}</span>`
      : `${needPerDay} hr/day needed (capacity ${hoursPerDay.toFixed(1)} hr/day)`;
    const statusDisplay = [
      `<div class="job-status ${aheadSchedule ? 'job-status-ahead' : (behindSchedule ? 'job-status-behind' : 'job-status-onpace')}">${esc(statusLabel)}</div>`,
      statusDetail ? `<div class="job-status-detail">${esc(statusDetail.trim())}</div>` : ''
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
      const notePreview = buildJobNotePreview(noteContent);
      const noteButtonLabel = esc(j.name || "Cutting job");
      const notePreviewTitleAttr = notePreview.tooltip ? ` title="${esc(notePreview.tooltip)}"` : "";
      return `
        <tr data-job-row="${j.id}" class="job-row">
          <td class="job-col job-col-main job-col-locked" data-requires-edit="${j.id}">
            <div class="job-main">
              <div class="job-title-chip"${colorStyleAttr}>
                <span class="job-title-chip-dot" aria-hidden="true"></span>
                <span class="job-title-chip-text">${esc(j.name || "Job")}</span>
              </div>
              <div class="job-main-category small muted" data-category-color="1"${colorStyleAttr}>
                <span class="sr-only">Category</span>
                <span class="job-main-category-name">Category:</span>
              </div>
              <div class="job-main-category-picker small" data-category-color="1"${colorStyleAttr}>
                <select data-job-category-inline="${esc(j.id)}" data-job-category-select aria-label="Change category for ${esc(j.name || "Job")}">
                  ${categoryOptionsMarkup(j.cat, { includeCreateOption: true })}
                </select>
              </div>
              <div class="job-main-dates">${startTxt} → ${dueTxt}</div>
            </div>
          </td>
          <td class="job-col job-col-estimate job-col-locked" data-requires-edit="${j.id}">${estimateDisplay}</td>
          <td class="job-col job-col-material job-col-locked" data-requires-edit="${j.id}">${j.material || '—'}</td>
          <td class="job-col job-col-input job-col-locked" data-requires-edit="${j.id}">${matCostDisplay}</td>
          <td class="job-col job-col-input job-col-locked" data-requires-edit="${j.id}">${matQtyDisplay}</td>
          <td class="job-col job-col-money">$${matTotal.toFixed(2)}</td>
          <td class="job-col job-col-charge">${chargeDisplay}</td>
          <td class="job-col job-col-cost">${costDisplay}</td>
          <td class="job-col job-col-net"><span class="job-rate-net ${netClass}">${netDisplay}</span></td>
          <td class="job-col job-col-hours">${remainingDisplay}</td>
          <td class="job-col job-col-need">${needDisplay}</td>
          <td class="job-col job-col-status">${statusDisplay}</td>
          <td class="job-col job-col-files">
            <div class="job-cell job-cell-stretch">
              <span class="job-cell-label">Files</span>
              <div class="job-file-cell">
                <button type="button" class="job-file-trigger ${fileCount ? 'has-files' : ''}" data-job-files="${j.id}" aria-haspopup="true" aria-expanded="false" aria-controls="${esc(fileMenuId)}">
                  <span class="job-file-trigger-text">${esc(fileLabel)}</span>
                  <span class="job-file-trigger-icon" aria-hidden="true">▾</span>
                </button>
                <div class="job-file-dropdown" id="${esc(fileMenuId)}" data-job-file-menu="${j.id}" hidden>
                  ${fileMenu}
                  <div class="job-file-menu-hint small muted">Use Add files to open edit mode and attach documents.</div>
                </div>
              </div>
              <div class="job-impact-files">
                <span class="job-impact-files-label">Attached files</span>
                ${fileCount
                  ? `<ul class="job-impact-files-list">${jobFiles.map((f, idx) => {
                      const safeName = esc(f?.name || `file_${idx + 1}`);
                      const href = esc(f?.dataUrl || f?.url || "");
                      return href
                        ? `<li><a href="${href}" download="${safeName}" target="_blank" rel="noopener">${safeName}</a></li>`
                        : `<li>${safeName}</li>`;
                    }).join("")}</ul>`
                  : '<span class="job-impact-files-empty small muted">No files attached</span>'}
              </div>
            </div>
          </td>
          <td class="job-col job-col-impact">
            <div class="job-impact-stack">
              <div class="job-impact-header">
                <span class="job-impact ${impactClass}">${impactDisplay}</span>
              </div>
              <div class="job-impact-meta">${esc(efficiencySummaryText)}</div>
              <dl class="job-impact-metrics">
                <div><dt>Charge</dt><dd>${chargeDisplay}</dd></div>
                <div><dt>Cost</dt><dd>${costDisplay}</dd></div>
                <div><dt>Net/hr</dt><dd class="${netClass}">${netDisplay}</dd></div>
                <div><dt>Net total</dt><dd class="${impactClass}">${impactDisplay}</dd></div>
              </dl>
            </div>
          </td>
          <td class="job-col job-col-note">
            ${notePreview.preview
              ? `<div class="job-note-inline" data-job-note="${j.id}" role="button" tabindex="0" aria-haspopup="dialog" aria-controls="jobNoteModal" aria-label="Notes for ${noteButtonLabel}"${notePreviewTitleAttr}>
                  <span class="job-note-inline-text">${textEsc(notePreview.preview)}</span>
                </div>`
              : `<button type="button" class="job-note-button" data-job-note="${j.id}" aria-haspopup="dialog" aria-controls="jobNoteModal" aria-label="Notes for ${noteButtonLabel}">
                  <span class="job-note-button-icon" aria-hidden="true">🗒</span>
                  <span class="job-note-button-label">Add note</span>
                </button>`}
          </td>
          <td class="job-col job-col-actions">
            <div class="job-actions">
              <button type="button" class="job-actions-trigger" data-job-actions-toggle="${j.id}" aria-haspopup="true" aria-expanded="false" aria-controls="${esc(actionMenuId)}">
                <span class="job-actions-trigger-label">Actions</span>
                <span class="job-actions-trigger-caret" aria-hidden="true">▾</span>
              </button>
              <div class="job-actions-menu" id="${esc(actionMenuId)}" data-job-actions-menu="${j.id}" hidden>
                <button type="button" data-log-job="${j.id}">Log time</button>
                <button type="button" data-edit-job="${j.id}">Edit</button>
                <button type="button" data-complete-job="${j.id}">Mark complete</button>
                <button type="button" class="danger" data-remove-job="${j.id}">Remove</button>
              </div>
            </div>
            <span data-log-job="${j.id}" style="display:none"></span>
          </td>
        </tr>
        `;
    } else {
      // EDIT ROW
      return `
        <tr data-job-row="${j.id}" class="job-row editing">
          <td colspan="${activeColumnCount}">
              <div class="job-edit-card">
              <div class="job-edit-layout">
              <div class="job-edit-grid">
                <label>Job name<input type="text" data-j="name" data-id="${j.id}" value="${j.name}"></label>
                <label>Estimate (hrs)<input type="number" min="1" data-j="estimateHours" data-id="${j.id}" value="${j.estimateHours}"></label>
                <label>Material<input type="text" data-j="material" data-id="${j.id}" value="${j.material||""}"></label>
                <label>Material cost ($)<input type="number" min="0" step="0.01" data-j="materialCost" data-id="${j.id}" value="${matCost}"></label>
                <label>Material quantity<input type="number" min="0" step="0.01" data-j="materialQty" data-id="${j.id}" value="${matQty}"></label>
                <label>Charge rate ($/hr)<input type="number" min="0" step="0.01" data-j="chargeRate" data-id="${j.id}" value="${chargeRate}"></label>
                <label>Start date<input type="date" data-j="startISO" data-id="${j.id}" value="${j.startISO||""}"></label>
                <label>Due date<input type="date" data-j="dueISO" data-id="${j.id}" value="${dueVal}"></label>
                <label>Category<select data-j="cat" data-id="${j.id}" data-job-category-select>
                  ${categoryOptionsMarkup(j.cat, { includeCreateOption: true })}
                </select></label>
                <label>Category color
                  <div class="category-color-control category-color-control-compact" data-job-category-color-editor="${esc(j.id)}" data-category-color="1"${colorStyleAttr}>
                    <span class="category-color-dot" aria-hidden="true"></span>
                    <span class="category-color-preview">
                      <span class="category-color-bar" aria-hidden="true"></span>
                      <input type="color" class="category-color-picker" value="${colorInfo.accentHex}" data-job-category-color-input="${esc(j.id)}" data-job-category-color-cat="${esc(normalizedCatId)}" aria-label="Choose color for ${esc(categoryName)}">
                    </span>
                    <button type="button" class="category-color-reset${colorInfo.isCustom ? "" : " is-hidden"}" data-job-category-color-reset="${esc(normalizedCatId)}" title="Use automatic color">Auto</button>
                  </div>
                </label>
              </div>
              <aside class="job-edit-summary" aria-label="Job impact summary">
                <div class="job-edit-summary-title">Quick impact</div>
                <div class="job-edit-summary-metrics">
                  <div class="job-metric job-metric-total">
                    <span class="job-metric-label">Material total</span>
                    <span class="job-metric-value">$${matTotal.toFixed(2)}</span>
                  </div>
                  <div class="job-metric">
                    <span class="job-metric-label">Charge rate</span>
                    <span class="job-metric-value">${chargeDisplay}</span>
                  </div>
                  <div class="job-metric">
                    <span class="job-metric-label">Cost rate</span>
                    <span class="job-metric-value">${costDisplay}</span>
                  </div>
                  <div class="job-metric">
                    <span class="job-metric-label">Net profit / hr</span>
                    <span class="job-metric-value ${netClass}">${netDisplay}</span>
                  </div>
                  <div class="job-metric">
                    <span class="job-metric-label">Net total</span>
                    <span class="job-metric-value ${impactClass}">${netTotalDisplay}</span>
                  </div>
                  <div class="job-metric">
                    <span class="job-metric-label">Schedule</span>
                    <span class="job-metric-value small muted">${startTxt} → ${dueTxt}</span>
                  </div>
                </div>
              </aside>
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
  <div class="container job-page-container">
    <div class="dashboard-toolbar">
      <span class="dashboard-edit-hint" id="jobEditHint" hidden>Drag the job categories window to reposition or resize it.</span>
    </div>

    <div class="dashboard-layout job-layout" id="jobLayout">
      <div class="dashboard-window" data-job-window="categories">
        <div class="block job-category-panel" data-job-category-panel>
          <div class="job-category-header">
            <h3>Job Categories</h3>
            <button type="button" class="small" data-job-folder-add-root>+ Add Category</button>
          </div>
          <div class="job-category-tree">
            ${folderTreeMarkup}
          </div>
          <p class="small muted">Select a category to focus the job list or create sub-categories to organize further.</p>
        </div>
      </div>
    </div>

    <div class="block job-main-block">
      <div class="job-page-topbar">
        <div class="job-page-toolbar">
          <h3>Cutting Jobs</h3>
          <div class="job-toolbar-actions">
            <button type="button" class="job-show-all-button" data-job-show-all>Show all jobs</button>
            <button
              type="button"
              class="job-add-button"
              data-job-add-toggle
              aria-expanded="${addFormOpen ? "true" : "false"}"
              aria-controls="jobAddPanel"
            >${addFormOpen ? "Hide add job form" : "+ New cutting job"}</button>
            <label class="job-category-filter">
              <span>Show</span>
              <select id="jobCategoryFilterSelect" aria-label="Filter cutting jobs by category">
                ${categoryOptionsMarkup(selectedCategory)}
              </select>
            </label>
            <button type="button" class="job-history-button" data-job-history-trigger>Jump to history</button>
          </div>
        </div>
        ${!addFormOpen && pendingFiles.length
          ? `<div class="job-add-indicator" role="status" aria-live="polite">${pendingSummary}</div>`
          : ""}
      </div>
      <section
        class="job-add-panel${addFormOpen ? " is-open" : ""}"
        data-job-add-panel
        id="jobAddPanel"
        ${addFormOpen ? "" : "hidden"}
        aria-hidden="${addFormOpen ? "false" : "true"}"
      >
        <form id="addJobForm" class="mini-form job-add-form">
          <input type="text" id="jobName" placeholder="Job name" required>
          <input type="number" id="jobEst" placeholder="Estimate (hrs)" required min="1">
          <input type="number" id="jobCharge" placeholder="Charge rate ($/hr)" min="0" step="0.01">
          <input type="text" id="jobMaterial" placeholder="Material">
          <input type="number" id="jobMaterialCost" placeholder="Material cost ($)" min="0" step="0.01">
          <input type="number" id="jobMaterialQty" placeholder="Material quantity" min="0" step="0.01">
          <input type="date" id="jobStart" required>
          <input type="date" id="jobDue" required>
          <select id="jobCategory" aria-label="Category" required>
            ${categoryOptionsMarkup(selectedCategory, { includeCreateOption: true })}
          </select>
          <button type="button" id="jobFilesBtn">Attach Files</button>
          <input type="file" id="jobFiles" multiple style="display:none">
          <button type="submit">Add Job</button>
        </form>
        <div class="small muted job-files-summary" id="jobFilesSummary">${pendingSummary}</div>
      </section>

      <table class="job-table">
        <thead>
          <tr>
            <th>Job</th>
            <th>Estimate</th>
            <th>Material</th>
            <th>Cost / unit</th>
            <th>Quantity</th>
            <th>Material total</th>
            <th>Charge rate</th>
            <th>Cost rate</th>
            <th>Net profit/hr</th>
            <th>Hours remaining</th>
            <th>Needed / day</th>
            <th>Status</th>
            <th>Files</th>
            <th>Net total</th>
            <th>Notes</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="small muted">Material cost and quantity update immediately when changed.</p>
      <div class="job-note-modal-backdrop" id="jobNoteModal" hidden>
        <div class="job-note-modal" role="dialog" aria-modal="true" aria-labelledby="jobNoteModalTitle">
          <div class="job-note-modal-header">
            <h4 id="jobNoteModalTitle">Job notes</h4>
            <button type="button" class="job-note-modal-close" data-note-cancel aria-label="Close notes">×</button>
          </div>
          <div class="job-note-modal-body">
            <div class="job-note-modal-field">
              <label for="jobNoteModalInput">Notes for <span id="jobNoteModalJob"></span></label>
              <textarea id="jobNoteModalInput" rows="6" placeholder="Add notes for this cutting job"></textarea>
            </div>
            <div class="job-note-modal-history" id="jobNoteModalHistory" aria-live="polite"></div>
          </div>
          <div class="job-note-modal-actions">
            <button type="button" class="job-note-modal-secondary" data-note-cancel>Cancel</button>
            <button type="button" class="job-note-modal-secondary" data-note-save-new>Save &amp; add another</button>
            <button type="button" class="job-note-modal-primary" data-note-save>Save notes</button>
          </div>
        </div>
      </div>
    </div>

    <div class="block past-jobs-block job-main-block" id="pastJobs">
      <h3>Past Cutting Jobs</h3>
      <div class="past-jobs-toolbar">
        <div class="past-jobs-search mini-form">
          <input type="search" id="jobHistorySearch" placeholder="Search past jobs by name, material, notes, or date" value="${historySearchDisplay}">
          <button type="button" id="jobHistorySearchClear">Clear</button>
        </div>
      </div>
      <div class="small muted past-jobs-hint">Results update as you type.</div>
      ${historyFilterStatus}
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
    return `<tr><td colspan="9" class="muted">No inventory items match your search.</td></tr>`;
  }
  return list.map(i => {
    const priceVal = i.price != null && i.price !== "" ? Number(i.price) : "";
    const priceDisplay = priceVal === "" || Number.isNaN(priceVal) ? "" : priceVal;
    const nameDisplay = i.name || "";
    const qtyNewNum = Number(i.qtyNew);
    const qtyOldNum = Number(i.qtyOld);
    const qtyNewDisplay = Number.isFinite(qtyNewNum) && qtyNewNum >= 0 ? qtyNewNum : 0;
    const qtyOldDisplay = Number.isFinite(qtyOldNum) && qtyOldNum >= 0 ? qtyOldNum : 0;
    return `
    <tr>
      <td><button type="button" class="inventory-name-btn" data-inventory-maintenance="${i.id}">${nameDisplay}</button></td>
      <td><input type="number" min="0" step="1" data-inv="qtyNew" data-id="${i.id}" value="${qtyNewDisplay}"></td>
      <td><input type="number" min="0" step="1" data-inv="qtyOld" data-id="${i.id}" value="${qtyOldDisplay}"></td>
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
      <table class="inventory-table">
        <thead><tr><th>Item</th><th>Qty (New)</th><th>Qty (Old)</th><th>Unit</th><th>PN</th><th>Link</th><th>Price</th><th>Note</th><th>Actions</th></tr></thead>
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
            <label>New quantity<input type="number" min="0" step="1" name="inventoryQtyNew" value="1"></label>
            <label>Old quantity<input type="number" min="0" step="1" name="inventoryQtyOld" value="0"></label>
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
  const totalCount = typeof data.totalCount === "number" ? data.totalCount : items.length;
  const searchValue = String(data.searchTerm || "");
  const searchDisabled = totalCount === 0 && !searchValue;
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
    : totalCount > 0
      ? `<p class="small muted">No deleted items match your search.</p>`
      : `<p class="small muted">Nothing has been deleted in the last 30 days.</p>`;

  return `
    <div class="container deleted-container">
      <div class="block" style="grid-column:1 / -1">
        <h3>Deleted items</h3>
        <p class="small muted">Items remain here for 30 days after deletion. Restore them or delete forever.</p>
        <div class="deleted-search">
          <label class="sr-only" for="deletedItemsSearch">Search deleted items</label>
          <input type="search" id="deletedItemsSearch" placeholder="Search deleted items" value="${esc(searchValue)}" ${searchDisabled ? "disabled" : ""} autocomplete="off">
          <button type="button" id="deletedItemsSearchClear" ${searchValue ? "" : "disabled"}>Clear</button>
        </div>
        ${body}
      </div>
    </div>
  `;
}

