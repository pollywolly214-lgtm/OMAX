/* ========================= VIEWS ========================== */
function renderAverageHoursBanner(contextLabel){
  const esc = (str)=> String(str ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const avg = (typeof getAverageDailyCutHours === "function") ? Number(getAverageDailyCutHours()) : NaN;
  const summary = (typeof getPredictionHoursSummary === "function")
    ? getPredictionHoursSummary()
    : { mode:"fixed", effectiveHours: (typeof getConfiguredDailyHours === "function" ? Number(getConfiguredDailyHours()) : 0) };
  const avgWindowLabel = String(summary.averageWindowLabel || "2 months");
  const avgLabel = (Number.isFinite(avg) && avg > 0) ? `${avg.toFixed(2)} hrs/day` : `Insufficient ${avgWindowLabel.toLowerCase()} history`;
  const modeLabel = summary.mode === "fixed" ? "Fixed daily hours" : `${avgWindowLabel} average`;
  const eff = Number(summary.effectiveHours);
  const effLabel = Number.isFinite(eff) && eff > 0 ? `${eff.toFixed(2)} hrs/day` : "—";
  return `<div class="block average-hours-banner" data-average-hours-banner="${esc(contextLabel || "")}"><div><strong>Average Hours Cut / Day:</strong> ${esc(avgLabel)}</div><div class="small muted">Prediction basis: ${esc(modeLabel)} • Effective: ${esc(effLabel)}</div></div>`;
}

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
  const avgBanner = renderAverageHoursBanner("dashboard");

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
  const dashboardDefaultJobDateISO = (() => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  })();
  const dashboardMaterialInventory = normalizeInventoryMaterials(window.inventoryMaterials);
  const dashboardMaterialOptions = Array.from(new Set(
    (Array.isArray(dashboardMaterialInventory?.types) ? dashboardMaterialInventory.types : [])
      .map(type => String(type?.name || "").trim())
      .filter(Boolean)
  ));
  const dashboardMaterialOptionsMarkup = dashboardMaterialOptions
    .map(name => `<option value="${esc(name)}"></option>`)
    .join("");

  return `
  <div class="container">
    <div class="dashboard-toolbar">
      <span class="dashboard-edit-hint" id="dashboardEditHint" hidden>Drag windows to rearrange and resize. Calendar stays fixed.</span>
    </div>

    ${avgBanner}

    <div class="dashboard-layout" id="dashboardLayout">
      <div class="dashboard-window" data-dashboard-window="totalHours">
        <div class="block total-hours-block">
          <h3>Total Hours</h3>
          <div class="total-hours-controls mini-form">
            <label class="total-hours-label"><span>Enter total hours now:</span>
              <input type="number" id="totalInput" value="${cur!=null?cur:""}" />
            </label>
            <div class="total-hours-actions">
              <button id="logBtn">Log Hours</button>
              <button type="button" id="editLogHistoryBtn" class="ghost">Edit past logs</button>
            </div>
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
              <button type="button" class="time-efficiency-edit-btn" data-efficiency-edit>Edit tracking</button>
            </div>
          </div>
          <div class="time-efficiency-edit" data-efficiency-edit-panel hidden>
              <div class="time-efficiency-edit-row">
                <label class="time-efficiency-edit-field">
                  <span class="time-efficiency-edit-label">Start date</span>
                  <input type="date" data-efficiency-start-input>
                </label>
                <label class="time-efficiency-edit-field">
                  <span class="time-efficiency-edit-label">Weekly goal mode</span>
                  <select data-efficiency-goal-mode-input>
                    <option value="average">Go off average</option>
                    <option value="maximum">Go off maximum</option>
                  </select>
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
              <span class="value" data-efficiency-actual data-efficiency-tooltip="Sum of logged cutting hours in the selected date window." title="Sum of logged cutting hours in the selected date window.">—</span>
            </div>
            <div class="time-efficiency-metric">
              <span class="label">Current target</span>
              <span class="value" data-efficiency-target data-efficiency-tooltip="Target-to-date: weekly goal converted to daily goal and multiplied by elapsed days in this window." title="Target-to-date: weekly goal converted to daily goal and multiplied by elapsed days in this window.">—</span>
            </div>
            <div class="time-efficiency-metric">
              <span class="label">Gap vs target</span>
                <span class="value" data-efficiency-gap-target data-efficiency-tooltip="Actual hours minus target-to-date hours in this window." title="Actual hours minus target-to-date hours in this window.">—</span>
            </div>
            <div class="time-efficiency-metric">
              <span class="label">End goal</span>
                <span class="value" data-efficiency-goal data-efficiency-tooltip="End goal: full-window goal hours using your configured weekly goal." title="End goal: full-window goal hours using your configured weekly goal.">—</span>
            </div>
            <div class="time-efficiency-metric">
              <span class="label">Avg usage/day</span>
                <span class="value" data-efficiency-average data-efficiency-tooltip="Average logged cutting hours per day across the selected window." title="Average logged cutting hours per day across the selected window.">—</span>
            </div>
            <div class="time-efficiency-metric">
              <span class="label">Gap vs goal</span>
                <span class="value" data-efficiency-gap-goal data-efficiency-tooltip="Actual hours minus full-window goal hours." title="Actual hours minus full-window goal hours.">—</span>
            </div>
            <div class="time-efficiency-metric">
              <span class="label">Efficiency (to date)</span>
                <span class="value" data-efficiency-percent data-efficiency-tooltip="Efficiency to date: actual hours divided by target-to-date hours." title="Efficiency to date: actual hours divided by target-to-date hours.">—</span>
            </div>
          </div>
          <p class="small muted" data-efficiency-window-label>${defaultEfficiencyDescription}</p>
          <p class="small muted">How this works: <strong>Go off average</strong> uses your average cut hours/day. <strong>Go off maximum</strong> uses your dashboard daily-hours goal (default 8 hr/day) and respects the weekend include/exclude setting.</p>
          <p class="small muted">Baseline adapts to your average logged hours per day.</p>
        </div>
      </div>
    </div>

    <div class="block calendar-block">
      <h3>Calendar</h3>

      <div class="calendar-toolbar">
        <div class="calendar-month-nav" aria-label="Month navigation">
          <button type="button" class="calendar-nav-btn" id="calendarPrevMonthBtn" aria-label="Show previous months">‹</button>
          <span class="calendar-range-label" id="calendarRangeLabel">This month</span>
          <button type="button" class="calendar-nav-btn" id="calendarNextMonthBtn" aria-label="Show upcoming months">›</button>
        </div>
        <button type="button" class="calendar-hours-edit-btn" id="calendarHoursEditBtn">Edit Hours</button>
        <button type="button" class="calendar-hours-cancel-btn" id="calendarHoursCancelBtn" hidden>Cancel</button>
        <button type="button" class="calendar-toggle-btn" id="calendarToggleBtn" aria-pressed="false" aria-controls="months">Show All Months</button>
        <button type="button" class="calendar-add-btn" id="calendarAddBtn" title="Add maintenance task, down time, or job">+</button>
      </div>

      <div id="months"></div>
      <div class="small">Hover a due item for actions. Click to pin the bubble. Use the arrows to browse months and toggle “Show All Months” to scroll through the schedule.</div>
    </div>
  </div>

  <div class="modal-backdrop" id="dashboardAddModal" hidden>
    <div class="modal-card dashboard-modal-card" data-modal-card="main">
      <button type="button" class="modal-close" id="dashboardModalClose" data-close-modal>×</button>

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
          <div class="task-option-grid">
            <button type="button" class="task-option" data-task-option="existing">
              <span class="task-option-title">Use an existing task</span>
              <span class="task-option-sub">Search saved maintenance work and place it on the calendar.</span>
            </button>
            <button type="button" class="task-option" data-task-option="new">
              <span class="task-option-title">Create a new task</span>
              <span class="task-option-sub">Start a new maintenance task and schedule it instantly.</span>
            </button>
            <button type="button" class="task-option" data-task-option="one-time">
              <span class="task-option-title">Add a one-time task</span>
              <span class="task-option-sub">Create a single occurrence that won't appear in Maintenance Settings.</span>
            </button>
          </div>
          <div class="task-option-actions">
            <button type="button" class="secondary" data-step-back>Back</button>
          </div>
        </div>
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
            <label class="job-estimate-label-group">
              <span class="small muted" id="dashJobEstimateBreakdown">0 hrs = 0 hrs 0 min</span>
              Estimate (hrs)
              <input type="number" min="0.01" step="0.01" id="dashJobEstimate" required placeholder="e.g. 12">
            </label>
            <label>Add minutes<input type="number" min="0" step="1" id="dashJobEstimateMinutes" placeholder="e.g. 45"></label>
            <label>Charge rate ($/hr)<input type="number" min="0" step="0.01" id="dashJobCharge" value="200"></label>
            <label>Cost rate ($/hr)<input type="number" min="0" step="0.01" id="dashJobCostRate" value="45"></label>
            <label>Material<input id="dashJobMaterial" placeholder="Material" list="dashJobMaterialOptions"></label>
            <label>Material cost ($)<input type="number" min="0" step="0.01" id="dashJobMaterialCost" placeholder="optional"></label>
            <label>Material quantity<input type="number" min="0" step="0.01" id="dashJobMaterialQty" placeholder="optional"></label>
            <label>Start date<input type="date" id="dashJobStart" required value="${dashboardDefaultJobDateISO}"></label>
            <label>Due date<input type="date" id="dashJobDue" required value="${dashboardDefaultJobDateISO}"></label>
            <label>Category<select id="dashJobCategory" required>
              ${dashboardCategoryOptions}
              <option value="__new__">+ Create new category…</option>
            </select>
            <span class="small muted job-category-hint" id="dashJobCategoryHint" aria-live="polite">
              Choose a category to keep jobs organized. We'll save it under All Jobs if you skip this step.
            </span></label>
            <datalist id="dashJobMaterialOptions">${dashboardMaterialOptionsMarkup}</datalist>
          </div>
          <div class="modal-actions">
            <button type="button" class="secondary" data-step-back>Back</button>
            <button type="submit" class="primary">Add Job</button>
          </div>
        </form>
      </section>
    </div>

    <div class="modal-card dashboard-modal-card task-option-card" data-task-card="existing" hidden aria-hidden="true">
      <button type="button" class="modal-close" data-close-modal>×</button>
      <div class="task-option-page">
        <div class="task-option-page-header">
          <button type="button" class="task-option-back" data-task-card-back aria-label="Go back to task picker">← Back</button>
          <div>
            <p class="task-option-kicker">Use current task</p>
            <p class="task-option-stage-title">Select a saved maintenance task</p>
            <p class="small muted">Search what you already track and place it on the calendar.</p>
          </div>
        </div>
        <form id="dashTaskExistingForm" class="modal-form task-option-body" data-task-variant="existing">
          <div class="task-existing-search">
            <label>Search tasks<input type="search" id="dashTaskExistingSearch" placeholder="Search saved maintenance tasks" autocomplete="off"></label>
            <div class="task-existing-results" data-task-existing-results hidden></div>
          </div>
          <p class="small muted">Pick a task saved in Maintenance Settings to schedule it on the calendar.</p>
          <p class="small muted" data-task-existing-empty hidden>No maintenance tasks yet. Create one below to get started.</p>
          <p class="small muted" data-task-existing-search-empty hidden>No tasks match your search. Try a different name.</p>
          <label>Occurrence note<textarea id="dashTaskExistingNote" rows="3" placeholder="Optional note for this calendar date"></textarea></label>
          <label>Repeat<select id="dashTaskExistingRepeat">
            <option value="no">Does not repeat</option>
            <option value="yes">Repeats</option>
          </select></label>
          <label>Repeat basis<select id="dashTaskExistingRepeatBasis">
            <option value="machine_hours">By machine cutting hours</option>
            <option value="calendar_day">By calendar day</option>
            <option value="calendar_week">By calendar week</option>
            <option value="calendar_month">By calendar month</option>
          </select></label>
          <label>Repeat every<input type="number" min="1" step="1" id="dashTaskExistingRepeatEvery" value="1"></label>
          <label>Repeat ends<select id="dashTaskExistingRepeatEnd">
            <option value="never">Never</option>
            <option value="on_date">On date</option>
            <option value="after_count">After count</option>
          </select></label>
          <label hidden id="dashTaskExistingWeekdaysRow">Repeat details<input type="text" value="Weekly repeats use the selected calendar date weekday." disabled></label>
          <label hidden>Repeat end date<input type="date" id="dashTaskExistingRepeatEndDate"></label>
          <label hidden>Repeat end count<input type="number" min="1" step="1" id="dashTaskExistingRepeatEndCount" value="1"></label>
          <div class="modal-actions">
            <button type="button" class="secondary" data-task-card-back>Back</button>
            <button type="submit" class="primary">Add to Calendar</button>
          </div>
        </form>
      </div>
    </div>

    <div class="modal-card dashboard-modal-card task-option-card" data-task-card="new" hidden aria-hidden="true">
      <button type="button" class="modal-close" data-close-modal>×</button>
      <div class="task-option-page">
        <div class="task-option-page-header">
          <button type="button" class="task-option-back" data-task-card-back aria-label="Go back to task picker">← Back</button>
          <div>
            <p class="task-option-kicker">Create new task</p>
            <p class="task-option-stage-title">Build a new maintenance task</p>
            <p class="small muted">Enter task details and we&rsquo;ll drop it into your schedule.</p>
          </div>
        </div>
        <form id="dashTaskForm" class="modal-form task-option-body" data-task-variant="new">
          <div class="modal-grid">
            <label>Task name<input id="dashTaskName" required placeholder="Task"></label>
            <label>Type<select id="dashTaskType">
              <option value="interval">Per interval</option>
              <option value="asreq">As required</option>
            </select></label>
            <label data-task-last>Hours since last service<input type="number" min="0" step="0.01" id="dashTaskLast" placeholder="optional"></label>
            <label data-task-condition hidden>Condition / trigger<input id="dashTaskCondition" placeholder="e.g. When clogged"></label>
            <label>Manual link<input type="url" id="dashTaskManual" placeholder="https://..."></label>
            <label>Store link<input type="url" id="dashTaskStore" placeholder="https://..."></label>
            <label>Part #<input id="dashTaskPN" placeholder="Part number"></label>
            <label>Price ($)<input type="number" min="0" step="0.01" id="dashTaskPrice" placeholder="optional"></label>
            <label>Time to complete (hrs)<input type="number" min="0.25" step="0.25" id="dashTaskDowntime" placeholder="e.g. 1"></label>
            <label>Category<select id="dashTaskCategory"></select></label>
            <label>Calendar date<input type="date" id="dashTaskDate"></label>
            <label>Repeat<select id="dashTaskRepeat">
              <option value="no">Does not repeat</option>
              <option value="yes">Repeats</option>
            </select></label>
            <label>Repeat basis<select id="dashTaskRepeatBasis">
              <option value="machine_hours">By machine cutting hours</option>
              <option value="calendar_day">By calendar day</option>
              <option value="calendar_week">By calendar week</option>
              <option value="calendar_month">By calendar month</option>
            </select></label>
            <label>Repeat every<input type="number" min="1" step="1" id="dashTaskRepeatEvery" value="1"></label>
            <label>Repeat ends<select id="dashTaskRepeatEnd">
              <option value="never">Never</option>
              <option value="on_date">On date</option>
              <option value="after_count">After count</option>
            </select></label>
            <label hidden id="dashTaskWeekdaysRow">Repeat details<input type="text" value="Weekly repeats use the selected calendar date weekday." disabled></label>
            <label hidden>Repeat end date<input type="date" id="dashTaskRepeatEndDate"></label>
            <label hidden>Repeat end count<input type="number" min="1" step="1" id="dashTaskRepeatEndCount" value="1"></label>
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
            <button type="button" class="secondary" data-task-card-back>Back</button>
            <button type="submit" class="primary" data-task-submit>Create Task</button>
          </div>
        </form>
      </div>
    </div>

    <div class="modal-card dashboard-modal-card task-option-card" data-task-card="one-time" hidden aria-hidden="true">
      <button type="button" class="modal-close" data-close-modal>×</button>
      <div class="task-option-page">
        <div class="task-option-page-header">
          <button type="button" class="task-option-back" data-task-card-back aria-label="Go back to task picker">← Back</button>
          <div>
            <p class="task-option-kicker">One-time task</p>
            <p class="task-option-stage-title">Schedule a single maintenance task</p>
            <p class="small muted">One-time tasks are placed on the calendar only and are not added to Maintenance Settings.</p>
          </div>
        </div>
        <form id="dashOneTimeForm" class="modal-form task-option-body" data-task-variant="one-time">
          <div class="modal-grid">
            <label>Task name<input id="dashOneTimeName" required placeholder="Task"></label>
            <label>Calendar date<input type="date" id="dashOneTimeDate" required></label>
            <label>Notes<textarea id="dashOneTimeNote" rows="3" placeholder="Optional note"></textarea></label>
          </div>
          <p class="small muted task-one-time-hint">One-time tasks stay on the calendar only—they won't be added to Maintenance Settings.</p>
          <div class="modal-actions">
            <button type="button" class="secondary" data-task-card-back>Back</button>
            <button type="submit" class="primary">Add One-time Task</button>
          </div>
        </form>
      </div>
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
    <div class="row"><label>Time to complete (hrs):</label>
      <div><input type="number" step="0.25" min="0.25" data-k="downtimeHours" data-id="${task.id}" data-list="interval" value="${task.downtimeHours != null ? task.downtimeHours : 1}" /></div>
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
    <div class="row"><label>Time to complete (hrs):</label>
      <div><input type="number" step="0.25" min="0.25" data-k="downtimeHours" data-id="${task.id}" data-list="asreq" value="${task.downtimeHours != null ? task.downtimeHours : 1}" /></div>
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

  const esc = (str)=> String(str ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const inventoryList = Array.isArray(window.inventory) ? window.inventory : [];

  const ensureDowntimeDefault = (task)=>{
    if (!task || typeof task !== "object") return false;
    const val = Number(task.downtimeHours);
    if (!Number.isFinite(val) || val <= 0){
      task.downtimeHours = 1;
      return true;
    }
    return false;
  };

  let normalizedDowntime = false;
  if (Array.isArray(window.tasksInterval)){
    window.tasksInterval.forEach(task => { if (ensureDowntimeDefault(task)) normalizedDowntime = true; });
  }
  if (Array.isArray(window.tasksAsReq)){
    window.tasksAsReq.forEach(task => { if (ensureDowntimeDefault(task)) normalizedDowntime = true; });
  }
  if (normalizedDowntime && typeof saveCloudDebounced === "function"){
    saveCloudDebounced();
  }

  // ------- Small helpers (IDs/data-* kept the same so existing handlers work) -------
   
  const chipFor = (t)=>{
    const nd = nextDue(t);
    if (!nd) return `<span class="chip">—</span>`;
    const d = nd.days;
    let cls = "green";
    if (d <= 1) cls = "red"; else if (d <= 3) cls = "orange"; else if (d <= 7) cls = "yellow";
    return `<span class="chip ${cls}">${d}d → ${nd.due.toDateString()}</span>`;
  };

  const inventoryOptionsMarkup = (selectedId)=>{
    const selectedStr = selectedId != null ? String(selectedId) : "";
    const options = inventoryList
      .filter(Boolean)
      .map(item => {
        const id = item.id != null ? String(item.id) : "";
        const parts = [item.name ? esc(item.name) : "Unnamed item"];
        if (item.pn) parts.push(`#${esc(item.pn)}`);
        return `<option value="${esc(id)}" ${id === selectedStr ? "selected" : ""}>${parts.join(" · ")}</option>`;
      })
      .sort((a, b)=> a.localeCompare(b));
    options.unshift(`<option value="" ${selectedStr ? "" : "selected"}>No inventory link</option>`);
    return options.join("");
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
        <label>Inventory link:
          <select data-task-inventory="${t.id}" data-list="${listType}">
            ${inventoryOptionsMarkup(t.inventoryId)}
          </select>
        </label>
        <label>Part # (primary): <input type="text" data-k="pn" data-id="${t.id}" data-list="${listType}" value="${t.pn||""}"></label>
        <label>Price (primary): <input type="number" step="0.01" min="0" data-k="price" data-id="${t.id}" data-list="${listType}" value="${t.price!=null?t.price:""}"></label>
        <label>Time to complete (hrs): <input type="number" step="0.25" min="0.25" data-k="downtimeHours" data-id="${t.id}" data-list="${listType}" value="${t.downtimeHours!=null?t.downtimeHours:""}" placeholder="e.g., 1"></label>

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
        let removeOccurrences = false;
        if (typeof window.confirm === "function"){
          removeOccurrences = window.confirm("Remove this task's current and future calendar occurrences?");
        }
        if (removeOccurrences){
          try {
            if (typeof pruneCurrentAndFutureIntervalOccurrences === "function"){
              pruneCurrentAndFutureIntervalOccurrences(live.ref.id);
            }
          } catch (err) {
            console.warn("Failed to clear interval occurrences during mode switch", err);
          }
        }
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
  const efficiencyWindows = [
    { key: "7d", label: "1W", days: 7, description: "Past 7 days" },
    { key: "30d", label: "1M", days: 30, description: "Past 30 days" },
    { key: "90d", label: "3M", days: 90, description: "Past 3 months" },
    { key: "182d", label: "6M", days: 182, description: "Past 6 months" },
    { key: "365d", label: "1Y", days: 365, description: "Past year" }
  ];
  const efficiencyButtons = efficiencyWindows.map((win, index) => `
    <button type="button" class="time-efficiency-toggle${index === 0 ? " is-active" : ""}" data-efficiency-range="${esc(String(win.days))}" data-efficiency-range-label="${esc(win.description)}" aria-pressed="${index === 0 ? "true" : "false"}" title="${esc(win.description)}">${esc(win.label)}</button>
  `).join("");
  const defaultEfficiencyDescription = esc(efficiencyWindows[0]?.description || "Past 7 days");
  const cards = Array.isArray(data.summaryCards) ? data.summaryCards : [];
  const timeframeRows = Array.isArray(data.timeframeRows) ? data.timeframeRows : [];
  const historyRows = Array.isArray(data.historyRows) ? data.historyRows : [];
  const jobBreakdown = Array.isArray(data.jobBreakdown) ? data.jobBreakdown : [];
  const weeklyReports = Array.isArray(data.weeklyReports) ? data.weeklyReports : [];
  const selectedWeeklyKeyRaw = (typeof window !== "undefined" && typeof window.weeklyCostReportSelected === "string")
    ? window.weeklyCostReportSelected
    : "";
  const selectedWeeklyReport = weeklyReports.find(item => item && item.weekStartISO === selectedWeeklyKeyRaw) || (weeklyReports[0] || null);
  const selectedWeeklyKey = selectedWeeklyReport ? String(selectedWeeklyReport.weekStartISO || "") : "";
  if (typeof window !== "undefined") window.weeklyCostReportSelected = selectedWeeklyKey;
  const jobSummary = data.jobSummary || { countLabel:"0", totalLabel:"$0", averageLabel:"$0", rollingLabel:"$0" };
  const chartColors = data.chartColors || { maintenance:"#0a63c2", jobs:"#2e7d32" };
  const chartInfo = data.chartInfo || "Maintenance cost line spreads interval pricing and approved as-required spend across logged machine hours; cutting jobs line tracks the rolling average gain or loss per completed job to spotlight margin drift.";
  const orderSummary = data.orderRequestSummary || {};
  const orderRows = Array.isArray(orderSummary.rows) ? orderSummary.rows : [];
  const maintenanceDataTable = Array.isArray(data.maintenanceDataTable) ? data.maintenanceDataTable : [];
  const maintenanceCategoryOptions = Array.from(new Set(
    maintenanceDataTable
      .map(row => ({ id: String(row?.categoryId || ""), label: String(row?.categoryLabel || "") }))
      .filter(entry => entry.id && entry.label)
      .map(entry => `${entry.id}|||${entry.label}`)
  )).map(entry => {
    const [id, label] = entry.split("|||");
    return { id, label };
  }).sort((a, b) => a.label.localeCompare(b.label));
  const maintenanceTaskOptions = Array.from(new Set(
    maintenanceDataTable
      .map(row => String(row?.taskName || "").trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
  const cuttingJobsDataTable = Array.isArray(data.cuttingJobsDataTable) ? data.cuttingJobsDataTable : [];
  const efficiencySnapshot = data.efficiencySnapshot || {};
  const efficiencyRows = Array.isArray(efficiencySnapshot.rows) ? efficiencySnapshot.rows : [];
  const calculatorDefaults = efficiencySnapshot.calculatorDefaults || {};
  const cuttingJobCategoryOptions = Array.from(new Set(
    cuttingJobsDataTable
      .map(row => ({ id: String(row?.categoryId || ""), label: String(row?.categoryLabel || "") }))
      .filter(entry => entry.label)
      .map(entry => `${entry.id}|||${entry.label}`)
  )).map(entry => {
    const [id, label] = entry.split("|||");
    return { id, label };
  }).sort((a, b) => a.label.localeCompare(b.label));
  const overviewInsight = data.overviewInsight || "Totals blend the latest maintenance allocations, consumable burn rates, downtime burdens, and job margin data so you always see current cost exposure.";
  const ordersInsight = data.ordersInsight || "Tracks every waterjet part request from submission through approval so finance can confirm spend and spot stalled orders.";
  const timeframeInsight = data.timeframeInsight || "Usage windows combine logged machine hours with interval pricing to estimate what each upcoming maintenance window will cost.";
  const historyInsight = data.historyInsight || "Shows the latest completed maintenance, combining hours logged and reconciled spend to highlight cost spikes.";
  const efficiencyInsight = data.efficiencyInsight || "Summarizes cutting job profitability by tying revenue to labor, material, consumable, and overhead allocations so you can act on true margins.";
  const avgBanner = renderAverageHoursBanner("cost-analysis");

  const formatCurrencyValue = (value)=>{
    const num = Number(value);
    const safe = Number.isFinite(num) ? num : 0;
    const abs = Math.abs(safe);
    const digits = abs < 1000 ? 2 : 0;
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(safe);
  };

  const formatHoursValue = (value)=>{
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return "0 hr";
    const decimals = Math.abs(num) >= 100 ? 0 : 1;
    return `${num.toFixed(decimals)} hr`;
  };

  const formatCountValue = (value)=>{
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return "0";
    return Math.round(num).toLocaleString();
  };

  const formatThroughputValue = (value)=>{
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return "—";
    return `${num.toFixed(2)} jobs/hr`;
  };

  const formatDateLabel = (iso)=>{
    if (!iso) return "—";
    let dt = null;
    try {
      dt = typeof parseDateLocal === "function" ? (parseDateLocal(iso) || new Date(iso)) : new Date(iso);
    } catch (_err) {
      dt = new Date(iso);
    }
    if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString();
  };

  const ensureCategoryStats = (stats)=>{
    const base = stats && typeof stats === "object" ? stats : {};
    const pick = (key)=>{
      const val = Number(base[key]);
      return Number.isFinite(val) ? val : 0;
    };
    const pickNullable = (key)=>{
      const val = Number(base[key]);
      return Number.isFinite(val) ? val : null;
    };
    return {
      jobCount: pick("jobCount"),
      totalDurationHours: pick("totalDurationHours"),
      averageDurationHours: pick("averageDurationHours"),
      totalMaterialCost: pick("totalMaterialCost"),
      averageMaterialCost: pick("averageMaterialCost"),
      totalLaborCost: pick("totalLaborCost"),
      averageLaborCost: pick("averageLaborCost"),
      totalMachineCost: pick("totalMachineCost"),
      averageMachineCost: pick("averageMachineCost"),
      totalOverheadCost: pick("totalOverheadCost"),
      averageOverheadCost: pick("averageOverheadCost"),
      totalCost: pick("totalCost"),
      averageCost: pick("averageCost"),
      minCost: pickNullable("minCost"),
      maxCost: pickNullable("maxCost"),
      percentile50: pickNullable("percentile50"),
      percentile90: pickNullable("percentile90"),
      throughputPerHour: pick("throughputPerHour")
    };
  };

  const jobCategoryAnalytics = data.jobCategoryAnalytics || {};
  const rootCategoryId = jobCategoryAnalytics.rootId || "jobs_root";
  const selectedCategoryRaw = jobCategoryAnalytics.selected || {};
  const selectedCategoryStats = ensureCategoryStats(selectedCategoryRaw.metrics);
  const selectedCategoryName = selectedCategoryRaw.name || jobCategoryAnalytics.selectedName || "All Jobs";
  const selectedCategoryNameSafe = esc(selectedCategoryName);
  const optionsListRaw = Array.isArray(jobCategoryAnalytics.options) && jobCategoryAnalytics.options.length
    ? jobCategoryAnalytics.options
    : [{ id: rootCategoryId, name: "All Jobs", depth: 0 }];
  const categoriesOverview = Array.isArray(jobCategoryAnalytics.categories) ? jobCategoryAnalytics.categories : [];
  const selectedCategoryIdRaw = jobCategoryAnalytics.selectedId
    || selectedCategoryRaw.id
    || (optionsListRaw[0] ? String(optionsListRaw[0].id) : rootCategoryId);
  const selectedCategoryId = String(selectedCategoryIdRaw || rootCategoryId);
  const jobsByCategory = (jobCategoryAnalytics && jobCategoryAnalytics.jobsByCategory && typeof jobCategoryAnalytics.jobsByCategory === "object")
    ? jobCategoryAnalytics.jobsByCategory
    : {};
  const expandedState = (typeof window !== "undefined" && window.costJobCategoryExpanded && typeof window.costJobCategoryExpanded === "object")
    ? window.costJobCategoryExpanded
    : {};
  if (typeof window !== "undefined" && window.costJobCategoryExpanded !== expandedState){
    window.costJobCategoryExpanded = expandedState;
  }
  if (!Object.prototype.hasOwnProperty.call(expandedState, selectedCategoryId)){
    expandedState[selectedCategoryId] = true;
  }

  const categoryOptionsMarkup = optionsListRaw.map(option => {
    if (!option || option.id == null) return "";
    const id = String(option.id);
    const depth = Number(option.depth) || 0;
    const indent = depth > 0 ? `${"&nbsp;&nbsp;".repeat(depth)}↳ ` : "";
    const label = option.name ? esc(option.name) : (id === (jobCategoryAnalytics.rootId || "jobs_root") ? "All Jobs" : "Category");
    const selectedAttr = id === String(selectedCategoryId) ? " selected" : "";
    return `<option value="${esc(id)}"${selectedAttr}>${indent}${label}</option>`;
  }).join("");

  const availableSummaryViews = [
    { id: "general", label: "Overall metrics" },
    { id: "totals", label: "Cost totals" },
    { id: "averages", label: "Average costs" }
  ];
  const storedSummaryView = (typeof window !== "undefined" && typeof window.costJobCategorySummaryView === "string")
    ? window.costJobCategorySummaryView
    : (typeof jobCategoryAnalytics.summaryView === "string" ? jobCategoryAnalytics.summaryView : "general");
  const summaryViewId = availableSummaryViews.some(view => view.id === storedSummaryView)
    ? storedSummaryView
    : "general";
  const summaryRowsByView = {
    general: [
      { label: "Jobs", value: formatCountValue(selectedCategoryStats.jobCount) },
      { label: "Total cost", value: formatCurrencyValue(selectedCategoryStats.totalCost) },
      { label: "Avg cost", value: formatCurrencyValue(selectedCategoryStats.averageCost) },
      { label: "Total duration", value: formatHoursValue(selectedCategoryStats.totalDurationHours) },
      { label: "Avg duration", value: formatHoursValue(selectedCategoryStats.averageDurationHours) },
      { label: "Throughput", value: formatThroughputValue(selectedCategoryStats.throughputPerHour) },
      { label: "Cost range", value: (selectedCategoryStats.minCost != null && selectedCategoryStats.maxCost != null)
          ? `${formatCurrencyValue(selectedCategoryStats.minCost)} – ${formatCurrencyValue(selectedCategoryStats.maxCost)}`
          : "—" },
      { label: "Median cost", value: selectedCategoryStats.percentile50 != null
          ? formatCurrencyValue(selectedCategoryStats.percentile50)
          : "—" },
      { label: "P90 cost", value: selectedCategoryStats.percentile90 != null
          ? formatCurrencyValue(selectedCategoryStats.percentile90)
          : "—" }
    ],
    totals: [
      { label: "Material", value: formatCurrencyValue(selectedCategoryStats.totalMaterialCost) },
      { label: "Labor", value: formatCurrencyValue(selectedCategoryStats.totalLaborCost) },
      { label: "Machine", value: formatCurrencyValue(selectedCategoryStats.totalMachineCost) },
      { label: "Overhead", value: formatCurrencyValue(selectedCategoryStats.totalOverheadCost) },
      { label: "All-in total", value: formatCurrencyValue(selectedCategoryStats.totalCost) }
    ],
    averages: [
      { label: "Material", value: formatCurrencyValue(selectedCategoryStats.averageMaterialCost) },
      { label: "Labor", value: formatCurrencyValue(selectedCategoryStats.averageLaborCost) },
      { label: "Machine", value: formatCurrencyValue(selectedCategoryStats.averageMachineCost) },
      { label: "Overhead", value: formatCurrencyValue(selectedCategoryStats.averageOverheadCost) },
      { label: "Per-job total", value: formatCurrencyValue(selectedCategoryStats.averageCost) }
    ]
  };
  const summarySelectOptions = availableSummaryViews.map(view => {
    const selectedAttr = view.id === summaryViewId ? " selected" : "";
    return `<option value="${esc(view.id)}"${selectedAttr}>${esc(view.label)}</option>`;
  }).join("");
  const summaryRowsMarkup = (summaryRowsByView[summaryViewId] || summaryRowsByView.general)
    .map(row => `<tr><th scope="row">${esc(row.label)}</th><td>${esc(row.value)}</td></tr>`)
    .join("");

  const renderJobTableForCategory = (jobs)=>{
    const jobRowsMarkup = Array.isArray(jobs) && jobs.length
      ? jobs.map(job => {
          if (!job) return "";
          const jobName = esc(job.name || "Job");
          const jobId = job.code || job.id;
          const jobIdSafe = jobId ? esc(jobId) : "—";
          const statusLabel = esc(job.status || "—");
          const statusDetail = job.statusDetail ? `<div class=\"small muted\">${esc(job.statusDetail)}</div>` : "";
          const milestoneISO = job.type === "completed" ? job.completedISO : job.dueISO;
          const milestoneTitle = job.type === "completed" ? "Completed" : "Due";
          const milestoneLabel = formatDateLabel(milestoneISO);
          const milestoneMarkup = milestoneLabel !== "—" ? `<div class=\"small muted\">${esc(milestoneTitle)}: ${esc(milestoneLabel)}</div>` : "";
          const actualHours = Number(job.actualHours) > 0 ? Number(job.actualHours) : Number(job.durationHours);
          const jobActualLabel = formatHoursValue(actualHours);
          const jobEstimateLabel = formatHoursValue(job.estimateHours);
          const materialLabel = formatCurrencyValue(job.materialCost);
          const laborLabel = formatCurrencyValue(job.laborCost);
          const machineLabel = formatCurrencyValue(job.machineCost);
          const overheadLabel = formatCurrencyValue(job.overheadCost);
          const totalLabel = formatCurrencyValue(job.totalCost);
          return `
            <tr>
              <th scope="row"><div class=\"cost-category-job-name\">${jobName}</div>${milestoneMarkup}</th>
              <td>${jobIdSafe}</td>
              <td>${statusLabel}${statusDetail}</td>
              <td>${jobActualLabel}</td>
              <td>${jobEstimateLabel}</td>
              <td>${materialLabel}</td>
              <td>${laborLabel}</td>
              <td>${machineLabel}</td>
              <td>${overheadLabel}</td>
              <td>${totalLabel}</td>
            </tr>
          `;
        }).join("")
      : `<tr><td colspan="10" class="cost-table-placeholder">No jobs in this category.</td></tr>`;
    return `
      <div class="cost-category-jobs-table-wrap">
        <table class="cost-table cost-category-jobs-table">
          <thead>
            <tr>
              <th scope="col" rowspan="2">Job</th>
              <th scope="col" rowspan="2">Job ID</th>
              <th scope="col" rowspan="2">Status</th>
              <th scope="col" colspan="2">Hours</th>
              <th scope="col" colspan="5">Costs</th>
            </tr>
            <tr>
              <th scope="col">Actual</th>
              <th scope="col">Estimate</th>
              <th scope="col">Material</th>
              <th scope="col">Labor</th>
              <th scope="col">Machine</th>
              <th scope="col">Overhead</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            ${jobRowsMarkup}
          </tbody>
        </table>
      </div>
    `;
  };

  const categoryOverviewRows = categoriesOverview.map(category => {
    if (!category) return "";
    const stats = ensureCategoryStats(category.metrics);
    const depth = Number(category.depth) || 0;
    const depthAttr = ` style="--depth:${Math.max(0, depth)}"`;
    const nameSafe = esc(category.name || "Category");
    const categoryId = category.id != null ? String(category.id) : rootCategoryId;
    const jobs = jobsByCategory && Array.isArray(jobsByCategory[categoryId]) ? jobsByCategory[categoryId] : [];
    const isExpanded = Boolean(expandedState[categoryId]);
    const toggleButton = `
      <button type="button" class="cost-category-overview-toggle" data-cost-category-toggle="${esc(categoryId)}" aria-expanded="${isExpanded ? "true" : "false"}">
        <span class="cost-category-toggle-icon" aria-hidden="true"></span>
        <span class="cost-category-name"${depthAttr}>${nameSafe}</span>
      </button>
    `;
    return `
      <tbody class="cost-category-overview-group${isExpanded ? " is-expanded" : ""}" data-cost-category-group="${esc(categoryId)}">
        <tr>
          <th scope="row">${toggleButton}</th>
          <td>${formatCountValue(stats.jobCount)}</td>
          <td>${formatCurrencyValue(stats.totalCost)}</td>
          <td>${formatCurrencyValue(stats.averageCost)}</td>
          <td>${formatHoursValue(stats.averageDurationHours)}</td>
        </tr>
        <tr class="cost-category-overview-jobs" data-cost-category-jobs-row${isExpanded ? "" : " hidden"}>
          <td colspan="5">
            <div class="cost-category-overview-jobs-inner">
              ${renderJobTableForCategory(jobs)}
            </div>
          </td>
        </tr>
      </tbody>
    `;
  }).join("");

  const categoryOverviewTable = categoriesOverview.length
    ? `
        <div class="cost-category-overview">
          <h4 class="cost-category-subheading">Category overview</h4>
          <table class="cost-table cost-category-overview-table">
            <thead><tr><th scope="col">Category</th><th scope="col">Jobs</th><th scope="col">Total cost</th><th scope="col">Avg cost</th><th scope="col">Avg duration</th></tr></thead>
            ${categoryOverviewRows}
          </table>
        </div>
      `
    : `<p class="small muted cost-category-overview-empty">No job categories defined yet. Add categories to compare performance.</p>`;

  const summaryMarkup = `
    <div class="cost-category-summary-section">
      <div class="cost-category-summary-header">
        <span class="small muted cost-category-selected-label">Summary for ${selectedCategoryNameSafe}</span>
        <label class="cost-category-select-label cost-category-metrics-label">
          <span class="cost-category-select-label-text">Summary view</span>
          <select data-cost-job-category-summary aria-label="Choose which summary metrics to show">
            ${summarySelectOptions}
          </select>
        </label>
      </div>
      <table class="cost-table cost-category-summary-table">
        <tbody>
          ${summaryRowsMarkup}
        </tbody>
      </table>
    </div>
  `;

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
  const projectionControl = breakdown.projectionControl || {};
  const projectionMethod = String(projectionControl.method || "annualized_average");
  const projectionWindow = String(projectionControl.window || "ytd");
  const projectionMethodOptions = Array.isArray(projectionControl.methodOptions) && projectionControl.methodOptions.length
    ? projectionControl.methodOptions
    : [{ key: "annualized_average", label: "Annualized average" }, { key: "run_rate", label: "YTD + remaining run rate" }];
  const projectionWindowOptions = Array.isArray(projectionControl.windowOptions) && projectionControl.windowOptions.length
    ? projectionControl.windowOptions
    : [{ key: "ytd", label: "YTD" }, { key: "1m", label: "1 month" }, { key: "2m", label: "2 months" }, { key: "3m", label: "3 months" }, { key: "6m", label: "6 months" }, { key: "12m", label: "12 months" }, { key: "all", label: "All time" }];

  const renderSummaryCard = (card = {})=>{
    const key = card && card.key ? String(card.key) : "";
    const isForecast = key === "maintenanceForecast";
    const isCutting = key === "cuttingJobs";
    const classes = ["cost-card"];
    const attrParts = [`class="${classes.join(" ")}"`];
    if (key){
      attrParts.push(`data-card-key="${esc(key)}"`);
    }
    if (card && card.tooltip){
      attrParts.push(`title="${esc(card.tooltip)}"`);
    }
    if (isForecast){
      attrParts.push("role=\"button\"");
      attrParts.push("tabindex=\"0\"");
    }
    if (isCutting){
      attrParts.push("data-cost-cutting-card=\"\"");
    }
    const attr = attrParts.join(" ");
    const cuttingOpenBtn = isCutting
      ? `<button type="button" class="btn secondary" data-open-efficiency-snapshot>Open calculator</button>`
      : "";
    return `
              <div ${attr}>
                <div class="cost-card-icon">${esc(card.icon || "")}</div>
                <div class="cost-card-body">
                  <div class="cost-card-title">${esc(card.title || "")}</div>
                  <div class="cost-card-value">${esc(card.value || "")}</div>
                  <div class="cost-card-hint">${esc(card.hint || "")}</div>
                  ${cuttingOpenBtn}
                </div>
              </div>
            `;
  };

  const summaryCardsHTML = cards.length
    ? cards.map(renderSummaryCard).join("")
    : `<p class="small muted">No cost metrics yet. Log machine hours and add pricing to interval tasks.</p>`;

  const forecastTableHTML = (hasSections || hasTotals)
    ? `
      <div class="forecast-controls">
        <label class="forecast-controls-label">
          <span>Projection method</span>
          <select data-forecast-projection-method aria-label="Select maintenance forecast projection method">
            ${projectionMethodOptions.map(option => `<option value="${esc(option.key || "")}"${String(option.key || "") === projectionMethod ? " selected" : ""}>${esc(option.label || option.key || "")}</option>`).join("")}
          </select>
        </label>
        <label class="forecast-controls-label">
          <span>Average from</span>
          <select data-forecast-projection-window aria-label="Select maintenance forecast lookback window">
            ${projectionWindowOptions.map(option => `<option value="${esc(option.key || "")}"${String(option.key || "") === projectionWindow ? " selected" : ""}>${esc(option.label || option.key || "")}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="forecast-table-wrap">
        <table class="forecast-table">
          <thead>
            <tr>
              <th scope="col">Task</th>
              <th scope="col">Cadence</th>
              <th scope="col">Projection basis</th>
              <th scope="col">Unit cost</th>
              <th scope="col">Year projection</th>
            </tr>
          </thead>
          <tbody>
            ${breakdownSections.map(section => {
              const rows = Array.isArray(section.rows) ? section.rows : [];
              const headerRow = `
              <tr class="forecast-section-row">
                <th scope="rowgroup" colspan="5">
                  <span class="forecast-section-header">
                    <span class="forecast-section-title">${esc(section.label || "")}</span>
                    ${section.totalLabel ? `<span class="forecast-section-total">${esc(section.totalLabel)}</span>` : ""}
                  </span>
                </th>
              </tr>`;
              const rowsHtml = rows.length
                ? rows.map(row => `
              <tr>
                <th scope="row">
                  <button type="button" class="forecast-task-link" data-forecast-open-task data-task-id="${esc(row.taskId || "")}" data-date-iso="${esc(row.latestDateISO || "")}">
                    ${esc(row.name || "")}
                  </button>
                </th>
                <td>
                  <div class="forecast-occurrence-cell">
                    <div>${esc(row.cadenceLabel || "—")}</div>
                    ${Array.isArray(row.occurrenceOptions) && row.occurrenceOptions.length ? `
                      <label class="sr-only">Occurrence</label>
                      <select data-forecast-occurrence-select>
                        ${row.occurrenceOptions.map(option => `<option value="${esc(option.dateISO || "")}">${esc(option.label || option.dateISO || "")}</option>`).join("")}
                      </select>
                    ` : ""}
                  </div>
                </td>
                <td>${esc(row.projectionBasisLabel || "Derived from central table completed occurrences")}</td>
                <td>${esc(row.unitCostLabel || "—")}</td>
                <td>${esc(row.annualTotalLabel || "—")}</td>
              </tr>
            `).join("")
                : `
              <tr class="forecast-empty-row">
                <td colspan="5">${esc(section.emptyMessage || "No tasks yet.")}</td>
              </tr>`;
              return `${headerRow}${rowsHtml}`;
            }).join("")}
          </tbody>
          ${hasTotals ? `
          <tfoot>
            <tr class="forecast-total-row">
              <th scope="row">Interval total</th>
              <td colspan="3"></td>
              <td>${esc(breakdownTotals.intervalLabel || "—")}</td>
            </tr>
            <tr class="forecast-total-row">
              <th scope="row">As-required total</th>
              <td colspan="3"></td>
              <td>${esc(breakdownTotals.asReqLabel || "—")}</td>
            </tr>
            <tr class="forecast-grand-total-row">
              <th scope="row">Combined total</th>
              <td colspan="3"></td>
              <td>${esc(breakdownTotals.combinedLabel || "—")}</td>
            </tr>
          </tfoot>` : ""}
        </table>
      </div>
    `
    : `<p class="small muted">Add maintenance intervals, pricing, and expected frequency to project spend.</p>`;

  const weeklyOptions = weeklyReports.length
    ? weeklyReports.map(report => {
        if (!report) return "";
        const key = esc(report.weekStartISO || "");
        const label = esc(report.weekLabel || report.weekStartISO || "Week");
        const selectedAttr = selectedWeeklyKey && selectedWeeklyKey === String(report.weekStartISO || "") ? " selected" : "";
        return `<option value="${key}"${selectedAttr}>${label}</option>`;
      }).join("")
    : '<option value="">No weekly reports yet</option>';

  const weeklyCutRows = selectedWeeklyReport && Array.isArray(selectedWeeklyReport.cutItems) && selectedWeeklyReport.cutItems.length
    ? selectedWeeklyReport.cutItems.map(item => `
      <tr>
        <td>${esc(item.name || "Cut")}</td>
        <td>${esc(item.categoryDisplay || item.category || "Uncategorized")}</td>
        <td>${esc(item.hoursLabel || "0 hr")}</td>
        <td>${esc(item.costLabel || "$0")}</td>
      </tr>
    `).join("")
    : '<tr><td colspan="4" class="cost-table-placeholder">No cuts completed this week.</td></tr>';

  const weeklyMaintenanceRows = selectedWeeklyReport && Array.isArray(selectedWeeklyReport.maintenanceItems) && selectedWeeklyReport.maintenanceItems.length
    ? selectedWeeklyReport.maintenanceItems.map(item => `
      <tr>
        <td>${esc(item.name || "Maintenance task")}</td>
        <td>${esc(item.taskLabel || "Maintenance")}</td>
        <td>${esc(item.partNumber || "—")}</td>
        <td>${esc(item.costLabel || "$0")}</td>
      </tr>
    `).join("")
    : '<tr><td colspan="4" class="cost-table-placeholder">No maintenance completed this week.</td></tr>';

  return `
  <div class="container cost-container">
    <div class="dashboard-toolbar">
      <span class="dashboard-edit-hint" id="costEditHint" hidden>Drag windows to rearrange and resize the cost overview.</span>
    </div>

    ${avgBanner}

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

    <div class="cost-timeframe-modal" id="costTimeframeModal" role="dialog" aria-modal="true" aria-labelledby="costTimeframeModalTitle" aria-hidden="true" hidden>
      <div class="cost-timeframe-backdrop" data-timeframe-close tabindex="-1" aria-label="Close maintenance window details"></div>
      <div class="cost-timeframe-card" role="document">
        <button type="button" class="cost-timeframe-close" data-timeframe-close aria-label="Close maintenance window details"><span aria-hidden="true">×</span></button>
        <div class="cost-timeframe-card-body">
          <h3 class="cost-timeframe-title" id="costTimeframeModalTitle" data-timeframe-title>Maintenance window</h3>
          <p class="cost-timeframe-range" data-timeframe-range></p>

          <section class="cost-timeframe-section">
            <h4>Actual maintenance spend</h4>
            <p class="small muted" data-timeframe-actual-empty hidden>No maintenance spend recorded in this window.</p>
            <div class="cost-timeframe-table-wrap" data-timeframe-actual-table hidden>
              <table class="cost-timeframe-table">
                <thead>
                  <tr>
                    <th scope="col">Maintenance part</th>
                    <th scope="col">Part #</th>
                    <th scope="col">Date replaced</th>
                    <th scope="col">Unit cost</th>
                    <th scope="col">Qty</th>
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody data-timeframe-actual-rows></tbody>
              </table>
              <div class="cost-timeframe-total">
                <span>Total actual spend</span>
                <strong data-timeframe-actual-total>$0</strong>
              </div>
            </div>
          </section>

          <section class="cost-timeframe-section">
            <h4>Projected maintenance cost</h4>
            <p class="small muted" data-timeframe-projection-empty hidden>Add pricing to maintenance tasks to project this window.</p>
            <div class="cost-timeframe-table-wrap" data-timeframe-projection-table hidden>
              <table class="cost-timeframe-table">
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">Basis</th>
                    <th scope="col">Projected cost</th>
                  </tr>
                </thead>
                <tbody data-timeframe-projection-rows></tbody>
              </table>
              <div class="cost-timeframe-total">
                <span>Total projected cost</span>
                <strong data-timeframe-projection-total>$0</strong>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    <div class="cost-receipt-modal" id="costReceiptModal" role="dialog" aria-modal="true" aria-labelledby="costReceiptTitle" aria-hidden="true" hidden>
      <div class="cost-receipt-backdrop" tabindex="-1" aria-hidden="true"></div>
      <div class="cost-receipt-card" role="document">
        <button type="button" class="cost-receipt-close" data-receipt-close aria-label="Close purchase history"><span aria-hidden="true">×</span></button>
        <div class="cost-receipt-card-body">
          <h3 id="costReceiptTitle">Purchase History</h3>
          <div class="cost-receipt-controls">
            <label>
              <span>Week of year</span>
              <select data-receipt-week-select aria-label="Select purchase history week"></select>
            </label>
            <button type="button" class="btn secondary" data-receipt-export-week>Export week (CSV)</button>
            <button type="button" class="btn secondary" data-receipt-export-range>Export range (CSV)</button>
          </div>
          <p class="small muted" data-receipt-week-range>—</p>
          <div class="cost-weekly-table-wrap">
            <table class="cost-table cost-receipt-week-table">
              <thead><tr><th>Date</th><th>Purchased</th><th>Cost</th><th>Qty</th><th>Part number</th><th>Shipping</th><th>Tax</th><th>Total</th></tr></thead>
              <tbody data-receipt-week-rows></tbody>
              <tfoot><tr><th colspan="7">Subtotal</th><th data-receipt-week-subtotal>$0.00</th></tr></tfoot>
            </table>
          </div>
          <div class="cost-receipt-summary-controls">
            <label>
              <span>Range</span>
              <select data-receipt-range-select aria-label="Select receipt summary range">
                <option value="1">1 month</option>
                <option value="2">2 months</option>
                <option value="3">3 months</option>
                <option value="6">6 months</option>
                <option value="12">1 year</option>
                <option value="all">All time</option>
              </select>
            </label>
          </div>
          <p class="small muted" data-receipt-range-label>—</p>
          <div class="cost-weekly-table-wrap">
            <table class="cost-table cost-receipt-summary-table">
              <thead><tr><th>Date</th><th>Purchased</th><th>Qty</th><th>Part number</th><th>Shipping</th><th>Tax</th><th>Total</th><th>Sub total</th></tr></thead>
              <tbody data-receipt-range-rows></tbody>
              <tfoot><tr><th colspan="7">Subtotal</th><th data-receipt-range-subtotal>$0.00</th></tr></tfoot>
            </table>
          </div>
        </div>
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
            <div class="cost-chart-actions">
              <div class="cost-chart-range" role="group" aria-label="Select cost trend timeline">
                <button type="button" data-cost-range="1" aria-pressed="false">1 mo</button>
                <button type="button" data-cost-range="3" aria-pressed="false">3 mo</button>
                <button type="button" data-cost-range="6" aria-pressed="false">6 mo</button>
                <button type="button" data-cost-range="12" aria-pressed="false">1 yr</button>
                <button type="button" data-cost-range="ytd" aria-pressed="false">YTD</button>
                <button type="button" data-cost-range="all" aria-pressed="false">All time</button>
              </div>
              <div class="cost-chart-toggle">
                <label><input type="checkbox" id="toggleCostMaintenance" checked> <span class="dot" style="background:${esc(chartColors.maintenance)}"></span> Maintenance</label>
                <label class="cost-chart-toggle-jobs"><input type="checkbox" id="toggleCostJobs" checked> <span class="dot" style="background:${esc(chartColors.jobs)}"></span> <span class="cost-chart-toggle-link" role="link" tabindex="0">Cutting jobs</span></label>
              </div>
            </div>
          </div>
          <div class="cost-chart-canvas">
            <canvas id="costChart" width="780" height="240"></canvas>
          </div>
          <div class="small muted" style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;">
            <span style="color:${esc(chartColors.maintenance)};"><strong>Avg maintenance cost/cut hr:</strong> <span data-maint-cost-per-cut-label>${esc(data.maintenanceCostPerCutLabel || "$0")}</span></span>
            <span style="color:${esc(chartColors.jobs)};"><strong>Avg cutting gain/loss:</strong> <span data-cutting-average-label>${esc(data.cuttingAverageLabel || "$0")}</span></span>
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
                  <tr class="cost-timeframe-row" data-cost-timeframe="${esc(row.key || "")}" role="button" tabindex="0" aria-haspopup="dialog" aria-controls="costTimeframeModal" aria-label="View maintenance cost breakdown for ${esc(row.label || "this window")}">
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
                    <div class="cost-history-task-wrap">
                      <span class="cost-history-task-name">${esc(item.titleLabel || "Maintenance event")}</span>
                      <span class="cost-history-date">${esc(item.rangeLabel || item.dateLabel || "")}</span>
                    </div>
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

      <div class="dashboard-window" data-cost-window="dataCenter">
        <div class="block">
          <h3>Maintenance Data Center Table</h3>
          <div class="small muted" style="margin-bottom:8px;">Open as a full-size popup for review and auditing.</div>
          <button type="button" class="secondary" data-open-data-center ${maintenanceDataTable.length ? "" : "disabled"}>Open Data Center</button>
          <div id="costDataCenterModal" class="cost-data-center-modal" data-data-center-modal hidden aria-hidden="true" tabindex="-1">
            <div class="cost-data-center-backdrop" data-close-data-center></div>
            <div class="cost-data-center-panel" role="dialog" aria-modal="true" aria-labelledby="dataCenterTitle">
              <div class="cost-data-center-header">
                <h3 id="dataCenterTitle">Maintenance Data Center Table</h3>
                <button type="button" class="secondary" data-close-data-center>Close</button>
              </div>
              <div class="cost-data-center-tabs" role="tablist" aria-label="Data center tables">
                <button type="button" class="cost-data-center-tab is-active" data-dc-tab="maintenance" role="tab" aria-selected="true">Maintenance Tasks</button>
                <button type="button" class="cost-data-center-tab" data-dc-tab="cutting" role="tab" aria-selected="false">Completed Cutting Jobs</button>
                <button type="button" class="cost-data-center-tab" data-dc-tab="efficiency" role="tab" aria-selected="false">Efficiency Metrics</button>
              </div>
              <div class="cost-data-center-panel-content" data-dc-panel="maintenance">
              <div class="cost-data-center-search">
                <label for="costDataCenterSearch">Search table</label>
                <input id="costDataCenterSearch" type="search" placeholder="Search task, date, counter, or link target" data-maintenance-search>
                <label for="costDataCenterCategoryFilter">Filter by category</label>
                <select id="costDataCenterCategoryFilter" data-maintenance-filter-category>
                  <option value="">All categories</option>
                  ${maintenanceCategoryOptions.map(opt => `<option value="${esc(opt.id)}">${esc(opt.label)}</option>`).join("")}
                </select>
                <label for="costDataCenterTaskFilter">Filter by task</label>
                <select id="costDataCenterTaskFilter" data-maintenance-filter-task>
                  <option value="">All tasks</option>
                  ${maintenanceTaskOptions.map(name => `<option value="${esc(name.toLowerCase())}">${esc(name)}</option>`).join("")}
                </select>
                <div class="cost-data-center-search-suggestions" data-maintenance-search-suggestions hidden></div>
              </div>
              ${maintenanceDataTable.length ? `
            <table class="cost-table" style="margin-top:10px">
              <thead>
                <tr>
                  <th>Counter</th>
                  <th>Task</th>
                  <th>Maint. hrs</th>
                  <th>Part cost</th>
                  <th>Rate/hr</th>
                  <th>Labor cost</th>
                  <th>Total cost</th>
                  <th>Date</th>
                  <th>Days since</th>
                  <th>Cut hrs since</th>
                  <th>Qty</th>
                  <th>Task link</th>
                </tr>
              </thead>
              <tbody>
                ${maintenanceDataTable.map(row => `
                  <tr data-maintenance-row data-task-id="${esc(String(row.taskId || ""))}" data-maintenance-date-iso="${esc(String(row.dateISO || ""))}" data-category-id="${esc(String(row.categoryId || ""))}" data-task-key="${esc(String(row.taskName || "").toLowerCase())}" data-task-name="${esc(row.taskName || "")}" data-search-text="${esc(`${row.counterLabel || ""} ${row.taskName || ""} ${row.dateISO || ""} ${row.qtyLabel || ""}`.toLowerCase())}">
                    <td>${esc(row.counterLabel || "#1")}</td>
                    <td>${esc(row.taskName || "Maintenance task")}</td>
                    <td>${esc(row.maintenanceHrsLabel || "0")}</td>
                    <td>${esc(row.partCostLabel || "$0.00")}</td>
                    <td>${esc(row.chargeRateLabel || "$0.00")}</td>
                    <td>${esc(row.laborCostLabel || "$0.00")}</td>
                    <td>${esc(row.totalCostLabel || "$0.00")}</td>
                    <td>${esc(row.dateISO || "—")}</td>
                    <td>${esc(row.daysSinceLabel || "—")}</td>
                    <td>${esc(row.cuttingHoursSinceLabel || "—")}</td>
                    <td>${esc(row.qtyLabel || "1")}</td>
                    <td>
                      <label class="sr-only" for="maintenanceLinkMode_${esc(row.id || "")}">Destination</label>
                      <select id="maintenanceLinkMode_${esc(row.id || "")}" data-maintenance-link-mode>
                        <option value="calendar">Calendar</option>
                        <option value="settings">Maintenance Settings</option>
                      </select>
                      <button type="button"
                        data-maintenance-open-task
                        data-task-id="${esc(row.taskId || "")}"
                        data-date-iso="${esc(row.dateISO || "")}"
                        data-link-mode-id="maintenanceLinkMode_${esc(row.id || "")}"
                        data-settings-link="${esc(row.settingsLink || "#/settings")}">Open task</button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
            ` : `<p class="small muted">No completed maintenance occurrences yet.</p>`}
              </div>
              <div class="cost-data-center-panel-content" data-dc-panel="cutting" hidden>
                <div class="cost-data-center-search">
                  <label for="costDataCenterCuttingSearch">Search completed jobs</label>
                  <input id="costDataCenterCuttingSearch" type="search" placeholder="Search job name, date, material, or project #" data-cutting-search>
                  <label for="costDataCenterCuttingCategoryFilter">Filter by category</label>
                  <select id="costDataCenterCuttingCategoryFilter" data-cutting-filter-category>
                    <option value="">All categories</option>
                    ${cuttingJobCategoryOptions.map(opt => `<option value="${esc(opt.id)}">${esc(opt.label)}</option>`).join("")}
                  </select>
                </div>
                ${cuttingJobsDataTable.length ? `
                <table class="cost-table" style="margin-top:10px">
                  <thead>
                    <tr>
                      <th>Job name</th>
                      <th>Cumulative cut #</th>
                      <th>Category cut #</th>
                      <th>Category</th>
                      <th>Hours</th>
                      <th>Charge rate/hr</th>
                      <th>Cost rate/hr</th>
                      <th>Total profit</th>
                      <th>Material type</th>
                      <th>Material cost</th>
                      <th>Material qty</th>
                      <th>Start date</th>
                      <th>Due date</th>
                      <th>Completed date</th>
                      <th>Project #</th>
                      <th>Priority</th>
                      <th>Notes</th>
                      <th>Job link</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${cuttingJobsDataTable.map(row => `
                      <tr data-cutting-row data-job-id="${esc(String(row.id || ""))}" data-cutting-date-iso="${esc(String(row.completedDateLabel || ""))}" data-cutting-category-id="${esc(String(row.categoryId || ""))}" data-cutting-job-key="${esc(String(row.name || "").toLowerCase())}" data-cutting-search-text="${esc(`${row.name || ""} ${row.categoryLabel || ""} ${row.materialType || ""} ${row.projectNumber || ""} ${row.completedDateLabel || ""}`.toLowerCase())}">
                        <td>${esc(row.name || "—")}</td>
                        <td>${esc(row.cumulativeCutNumberLabel || "—")}</td>
                        <td>${esc(row.categoryCutNumberLabel || "—")}</td>
                        <td>${esc(row.categoryLabel || "—")}</td>
                        <td>${esc(row.hoursLabel || "0")}</td>
                        <td>${esc(row.chargeRateLabel || "—")}</td>
                        <td>${esc(row.costRateLabel || "—")}</td>
                        <td>${esc(row.totalProfitLabel || "—")}</td>
                        <td>${esc(row.materialType || "—")}</td>
                        <td>${esc(row.materialCostLabel || "—")}</td>
                        <td>${esc(row.materialQtyLabel || "—")}</td>
                        <td>${esc(row.startDateLabel || "—")}</td>
                        <td>${esc(row.dueDateLabel || "—")}</td>
                        <td>${esc(row.completedDateLabel || "—")}</td>
                        <td>${esc(row.projectNumber || "—")}</td>
                        <td>${esc(row.priorityLabel || "—")}</td>
                        <td>${esc(row.notes || "—")}</td>
                        <td>
                          <label class="sr-only" for="cuttingLinkMode_${esc(row.id || "")}">Cutting link destination</label>
                          <select id="cuttingLinkMode_${esc(row.id || "")}" data-cutting-link-mode>
                            <option value="jobs">Cutting jobs page</option>
                            <option value="calendar">Calendar</option>
                          </select>
                          <button type="button" data-cutting-open-job data-job-id="${esc(row.id || "")}" data-date-iso="${esc(row.completedDateLabel || "")}" data-link-mode-id="cuttingLinkMode_${esc(row.id || "")}">Open job</button>
                        </td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
                ` : `<p class="small muted">No completed cutting jobs yet.</p>`}
              </div>
              <div class="cost-data-center-panel-content" data-dc-panel="efficiency" hidden>
                ${efficiencyRows.length ? `
                <div class="cost-jobs-summary">
                  <div><span class="label">Rows tracked</span><span>${esc(efficiencySnapshot.countLabel || "0")}</span></div>
                  <div><span class="label">Total hours</span><span>${esc(efficiencySnapshot.totalHoursLabel || "0 hr")}</span></div>
                  <div><span class="label">Total net gain</span><span>${esc(efficiencySnapshot.totalNetGainLabel || "$0.00")}</span></div>
                  <div><span class="label">Avg net gain / row</span><span>${esc(efficiencySnapshot.averageNetGainLabel || "$0.00")}</span></div>
                </div>
                <table class="cost-table" style="margin-top:10px">
                  <thead><tr><th>Task</th><th>Date</th><th>Hours</th><th>Part cost</th><th>Run cost</th><th>Total cost</th><th>Net gain</th></tr></thead>
                  <tbody>
                    ${efficiencyRows.map(row => `
                      <tr>
                        <td>${esc(row.taskName || "Completed task")}</td>
                        <td>${esc(row.dateLabel || "—")}</td>
                        <td>${esc(row.hoursLabel || "0 hr")}</td>
                        <td>${esc(row.partCostLabel || "$0.00")}</td>
                        <td>${esc(row.laborCostLabel || "$0.00")}</td>
                        <td>${esc(row.totalCostLabel || "$0.00")}</td>
                        <td>${esc(row.netGainLabel || "$0.00")}</td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
                ` : `<p class="small muted">No efficiency rows found in the central data table.</p>`}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="dashboard-window" data-cost-window="jobCategories">
        <div class="block" data-cost-job-categories>
          <h3>Job Categories</h3>
          <div class="cost-category-controls">
            <label class="cost-category-select-label">
              <span class="cost-category-select-label-text">Focus category</span>
              <select data-cost-job-category-select aria-label="Filter job metrics by category">
                ${categoryOptionsMarkup}
              </select>
            </label>
          </div>
          ${categoryOverviewTable}
          ${summaryMarkup}
        </div>
      </div>

      <div class="dashboard-window" data-cost-window="weekly">
        <div class="block" data-cost-weekly-reports>
          <h3>Weekly cost reports</h3>
          <div class="cost-weekly-controls">
            <label class="cost-category-select-label">
              <span class="cost-category-select-label-text">Report week</span>
              <select data-cost-weekly-select aria-label="Select weekly cost report">
                ${weeklyOptions}
              </select>
            </label>
            <button type="button" class="btn secondary" data-cost-receipt-open>Purchase History</button>
            <button type="button" class="btn secondary" data-cost-weekly-export ${selectedWeeklyReport ? "" : "disabled"}>Export week (Excel)</button>
          </div>
          <div class="cost-weekly-summary">
            <div><span class="label">Cuts total profit</span><span>${esc(selectedWeeklyReport?.totalCutProfitLabel || selectedWeeklyReport?.totalCutCostLabel || "$0")}</span></div>
            <div><span class="label">Maintenance total loss</span><span>${esc(selectedWeeklyReport?.totalMaintenanceLossLabel || selectedWeeklyReport?.totalMaintenanceCostLabel || "$0")}</span></div>
            <div><span class="label">Cutting time</span><span>${esc(selectedWeeklyReport?.totalCutHoursLabel || "0 hr")}</span></div>
          </div>
          <div class="cost-weekly-grid">
            <details class="cost-weekly-section" open>
              <summary>Cuts completed</summary>
              <div class="cost-weekly-section-totals">
                <span><strong>Cuts related total profit:</strong> ${esc(selectedWeeklyReport?.totalCutProfitLabel || selectedWeeklyReport?.totalCutCostLabel || "$0")}</span>
                <span><strong>Total cut time:</strong> ${esc(selectedWeeklyReport?.totalCutHoursLabel || "0 hr")}</span>
              </div>
              <div class="cost-weekly-table-wrap">
                <table class="cost-table">
                  <thead><tr><th>Cut</th><th>Category</th><th>Hours</th><th>Cost impact</th></tr></thead>
                  <tbody>${weeklyCutRows}</tbody>
                </table>
              </div>
            </details>
            <details class="cost-weekly-section" open>
              <summary>Maintenance completed</summary>
              <div class="cost-weekly-section-totals">
                <span><strong>Maintenance related total loss:</strong> ${esc(selectedWeeklyReport?.totalMaintenanceLossLabel || selectedWeeklyReport?.totalMaintenanceCostLabel || "$0")}</span>
              </div>
              <div class="cost-weekly-table-wrap">
                <table class="cost-table">
                  <thead><tr><th>Task</th><th>Type</th><th>Part #</th><th>Cost</th></tr></thead>
                  <tbody>${weeklyMaintenanceRows}</tbody>
                </table>
              </div>
            </details>
          </div>
          <canvas id="weeklyCostChart" width="900" height="340" aria-label="Weekly report chart"></canvas>
        </div>
      </div>


    </div>
  </div>

  <div class="cost-data-center-modal" id="efficiencySnapshotModal" data-efficiency-snapshot-modal hidden>
    <div class="cost-data-center-backdrop" data-close-efficiency-snapshot></div>
    <div class="cost-data-center-panel" role="dialog" aria-modal="true" aria-label="Cutting Job Efficiency Snapshot" style="max-width:1100px;border-radius:16px;">
      <div class="cost-data-center-header" style="border-radius:16px 16px 0 0;">
        <h4>Cutting Job Efficiency Snapshot</h4>
        <button type="button" class="btn ghost" data-close-efficiency-snapshot>Close</button>
      </div>
      <div class="cost-data-center-body">
        <div class="time-efficiency-inline" id="costTimeEfficiency">
          <div class="time-efficiency-inline-header">
            <span class="time-efficiency-inline-title">Cutting time efficiency</span>
            <div class="time-efficiency-controls">
              <div class="time-efficiency-toggles" role="tablist">
                ${efficiencyButtons}
              </div>
              <button type="button" class="time-efficiency-edit-btn" data-efficiency-edit>Edit tracking</button>
            </div>
          </div>
          <div class="time-efficiency-edit" data-efficiency-edit-panel hidden>
            <div class="time-efficiency-edit-row">
              <label class="time-efficiency-edit-field">
                <span class="time-efficiency-edit-label">Start date</span>
                <input type="date" data-efficiency-start-input>
              </label>
              <label class="time-efficiency-edit-field">
                <span class="time-efficiency-edit-label">Weekly goal mode</span>
                <select data-efficiency-goal-mode-input>
                  <option value="average">Go off average</option>
                  <option value="maximum">Go off maximum</option>
                </select>
              </label>
              <div class="time-efficiency-edit-actions">
                <button type="button" class="time-efficiency-edit-apply" data-efficiency-apply>Apply</button>
                <button type="button" class="time-efficiency-edit-cancel" data-efficiency-cancel>Cancel</button>
              </div>
            </div>
            <p class="small muted time-efficiency-edit-note" data-efficiency-edit-note></p>
          </div>
          <div class="time-efficiency-metrics" role="status" aria-live="polite">
            <div class="time-efficiency-metric"><span class="label">Actual hours</span><span class="value" data-efficiency-actual data-efficiency-tooltip="Sum of logged cutting hours in the selected date window." title="Sum of logged cutting hours in the selected date window.">—</span></div>
            <div class="time-efficiency-metric"><span class="label">Current target</span><span class="value" data-efficiency-target data-efficiency-tooltip="Target-to-date: weekly goal converted to daily goal and multiplied by elapsed days in this window." title="Target-to-date: weekly goal converted to daily goal and multiplied by elapsed days in this window.">—</span></div>
            <div class="time-efficiency-metric"><span class="label">Gap vs target</span><span class="value" data-efficiency-gap-target data-efficiency-tooltip="Actual hours minus target-to-date hours in this window." title="Actual hours minus target-to-date hours in this window.">—</span></div>
            <div class="time-efficiency-metric"><span class="label">End goal</span><span class="value" data-efficiency-goal data-efficiency-tooltip="End goal: full-window goal hours using your configured weekly goal." title="End goal: full-window goal hours using your configured weekly goal.">—</span></div>
            <div class="time-efficiency-metric"><span class="label">Avg usage/day</span><span class="value" data-efficiency-average data-efficiency-tooltip="Average logged cutting hours per day across the selected window." title="Average logged cutting hours per day across the selected window.">—</span></div>
            <div class="time-efficiency-metric"><span class="label">Gap vs goal</span><span class="value" data-efficiency-gap-goal data-efficiency-tooltip="Actual hours minus full-window goal hours." title="Actual hours minus full-window goal hours.">—</span></div>
            <div class="time-efficiency-metric"><span class="label">Efficiency (to date)</span><span class="value" data-efficiency-percent data-efficiency-tooltip="Efficiency to date: actual hours divided by target-to-date hours." title="Efficiency to date: actual hours divided by target-to-date hours.">—</span></div>
          </div>
          <p class="small muted" data-efficiency-window-label>${defaultEfficiencyDescription}</p>
          <p class="small muted">How this works: <strong>Go off average</strong> uses your average cut hours/day. <strong>Go off maximum</strong> uses your dashboard daily-hours goal (default 8 hr/day) and respects the weekend include/exclude setting.</p>
          <p class="small muted">Baseline adapts to your average logged hours per day.</p>
        </div>
        <div class="cost-efficiency-calculator" data-efficiency-calc>
          <div class="cost-efficiency-calculator-row">
            <label>
              <span class="label">Charge / hr (temporary)</span>
              <input type="number" step="1" min="0" value="${esc((Number.isFinite(Number(calculatorDefaults.chargeRate)) ? Number(calculatorDefaults.chargeRate) : 0).toFixed(2))}" data-efficiency-calc-charge>
            </label>
            <label>
              <span class="label">Cost / hr (temporary)</span>
              <input type="number" step="1" min="0" value="${esc((Number.isFinite(Number(calculatorDefaults.costRate)) ? Number(calculatorDefaults.costRate) : 0).toFixed(2))}" data-efficiency-calc-cost>
            </label>
            <label>
              <span class="label">Time range</span>
              <select data-efficiency-calc-range-select>
                <option value="1m">Past 1 month</option>
                <option value="2m">Past 2 months</option>
                <option value="3m">Past 3 months</option>
                <option value="6m">Past 6 months</option>
                <option value="1y">Past 1 year</option>
                <option value="ytd">Year to date</option>
                <option value="all">All time</option>
              </select>
            </label>
            <button type="button" class="btn secondary" data-efficiency-calc-reset>Reset</button>
            <button type="button" class="btn secondary" data-go-jobs-history>Go to cutting jobs</button>
          </div>
          <p class="small muted" data-efficiency-calc-range-label>Range: past 1 month from central data table rows.</p>
          <p class="small muted">Temporary calculator only. Refresh resets values to central data table defaults.</p>
          <p class="small muted" data-efficiency-calc-result>
            Net total gain (calculator): <strong data-efficiency-calc-total>${esc(efficiencySnapshot.totalNetGainLabel || "$0.00")}</strong>
            · Avg / row: <strong data-efficiency-calc-average>${esc(efficiencySnapshot.averageNetGainLabel || "$0.00")}</strong>
          </p>
        </div>
        <div class="cost-jobs-summary">
          <div><span class="label">Rows tracked</span><span>${esc(efficiencySnapshot.countLabel || "0")}</span></div>
          <div><span class="label">Total hours</span><span>${esc(efficiencySnapshot.totalHoursLabel || "0 hr")}</span></div>
          <div title="${esc(`${efficiencySnapshot.mathDetailsLabel || ""} ${efficiencySnapshot.disclaimerLabel || ""} Source: ${efficiencySnapshot.sourceLabel || "central data table completed cutting jobs rows."} ${efficiencySnapshot.formulaLabel || "Net gain = (Hours × (Charge Rate - Cost Rate)) - Material Cost"}`.trim())}"><span class="label">Total net gain</span><span data-efficiency-summary-total>${esc(efficiencySnapshot.totalNetGainLabel || "$0.00")}</span></div>
          <div title="${esc(`${efficiencySnapshot.mathDetailsLabel || ""} ${efficiencySnapshot.disclaimerLabel || ""} Source: ${efficiencySnapshot.sourceLabel || "central data table completed cutting jobs rows."} ${efficiencySnapshot.formulaLabel || "Net gain = (Hours × (Charge Rate - Cost Rate)) - Material Cost"}`.trim())}"><span class="label">Avg net gain / row</span><span data-efficiency-summary-average>${esc(efficiencySnapshot.averageNetGainLabel || "$0.00")}</span></div>
          <div><span class="label">Total run cost</span><span data-efficiency-summary-cost>${esc(efficiencySnapshot.totalCostLabel || "$0.00")}</span></div>
          <div><span class="label">Avg run cost / row</span><span data-efficiency-summary-cost-average>${esc(efficiencySnapshot.averageCostLabel || "$0.00")}</span></div>
        </div>
        <p class="small muted" title="${esc(`${efficiencySnapshot.formulaLabel || "Net gain = (Hours × (Charge Rate - Cost Rate)) - Material Cost"} ${efficiencySnapshot.disclaimerLabel || "Uses central data table values only."}`)}" data-efficiency-source-note>${esc(efficiencySnapshot.sourceLabel || "Source: central data table completed cutting jobs rows.")} ${esc(efficiencySnapshot.disclaimerLabel || "Uses central data table values only.")}</p>
        <div class="cost-weekly-table-wrap">
          <table class="cost-table">
            <thead><tr><th>Task</th><th>Date</th><th>Hours</th><th>Part cost</th><th>Labor cost</th><th>Total cost</th><th title="${esc(`${efficiencySnapshot.formulaLabel || "Net gain = (Hours × (Charge Rate - Cost Rate)) - Material Cost"} ${efficiencySnapshot.disclaimerLabel || ""}`.trim())}" aria-label="Net gain calculation">Net gain</th><th>Task link</th></tr></thead>
            <tbody>
              ${efficiencyRows.length ? efficiencyRows.map(row => `
                <tr data-efficiency-row data-efficiency-id="${esc(row.id || "")}" data-efficiency-date="${esc(row.dateLabel || "")}" data-efficiency-hours="${esc(String(Number(row.hoursValue) || 0))}" data-efficiency-material="${esc(String(Number(row.materialValue || 0)))}">
                  <td>${esc(row.taskName || "Completed task")}</td>
                  <td>${esc(row.dateLabel || "—")}</td>
                  <td>${esc(row.hoursLabel || "0 hr")}</td>
                  <td>${esc(row.partCostLabel || "$0.00")}</td>
                  <td data-efficiency-labor-cell>${esc(row.laborCostLabel || "$0.00")}</td>
                  <td data-efficiency-total-cost-cell>${esc(row.totalCostLabel || "$0.00")}</td>
                  <td title="${esc(`${row.formulaTitle || efficiencySnapshot.formulaLabel || "Net gain = (Hours × (Charge Rate - Cost Rate)) - Material Cost"} ${efficiencySnapshot.disclaimerLabel || ""}`.trim())}" data-efficiency-profit-cell>${esc(row.netGainLabel || "$0.00")}</td>
                  <td>${row.settingsLink ? `<button type="button" class="btn secondary" data-efficiency-open-job="${esc(row.id || "")}">Open job</button>` : "Invalid link"}</td>
                </tr>
              `).join("") : `
                <tr>
                  <td colspan="8" class="cost-table-placeholder">${esc(efficiencySnapshot.emptyMessage || "No valid completed rows available from the central data table.")}</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
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
    </div></div>`;
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
  const oneDriveConfig = (typeof window.getOneDriveJobConfig === "function")
    ? window.getOneDriveJobConfig()
    : { enabled: false, rootDriveId: "", rootFolderItemId: "", rootName: "", rootWebUrl: "", folderHint: "", localRootName: "", localRootSignature: "", shareToken: "", accessToken: "", accessTokenExpiresAt: "", lastLinkedAt: "" };
  const oneDriveLibrary = (typeof window.getOneDriveJobLibrary === "function")
    ? window.getOneDriveJobLibrary()
    : [];
  const oneDriveReady = !!(oneDriveConfig && oneDriveConfig.enabled && oneDriveConfig.localRootSignature);
  const oneDriveStatusLabel = oneDriveReady
    ? `OneDrive root ready${oneDriveConfig.folderHint ? ` · ${oneDriveConfig.folderHint}` : ""}`
    : "OneDrive root not set on this computer";
  const defaultJobDateISO = (() => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  })();
  const materialInventoryModel = normalizeInventoryMaterials(window.inventoryMaterials);
  const materialInventoryNames = Array.from(new Set(
    (Array.isArray(materialInventoryModel?.types) ? materialInventoryModel.types : [])
      .map(type => String(type?.name || "").trim())
      .filter(Boolean)
  ));
  const materialInventoryOptionsMarkup = materialInventoryNames
    .map(name => `<option value="${esc(name)}"></option>`)
    .join("");
  const extractFileExtension = (filename)=>{
    const name = String(filename || "");
    const dot = name.lastIndexOf(".");
    if (dot <= 0 || dot === name.length - 1) return "";
    return name.slice(dot).toLowerCase();
  };
  const decodeDataUrlText = (dataUrl)=>{
    const raw = String(dataUrl || "");
    const match = raw.match(/^data:([^,]*?),(.*)$/i);
    if (!match) return "";
    const meta = match[1] || "";
    const payload = match[2] || "";
    try {
      if (/;base64/i.test(meta)) return atob(payload);
      return decodeURIComponent(payload);
    } catch (_err){
      return "";
    }
  };
  const cadPointsToSegments = (points, closed = false)=>{
    const cleaned = Array.isArray(points) ? points.filter(Boolean) : [];
    if (cleaned.length < 2) return [];
    const segments = [];
    for (let i = 1; i < cleaned.length; i += 1){
      const prev = cleaned[i - 1];
      const next = cleaned[i];
      if ([prev?.x, prev?.y, next?.x, next?.y].every(Number.isFinite)){
        segments.push({ x1: prev.x, y1: prev.y, x2: next.x, y2: next.y });
      }
    }
    if (closed && cleaned.length > 2){
      const first = cleaned[0];
      const last = cleaned[cleaned.length - 1];
      if ([first?.x, first?.y, last?.x, last?.y].every(Number.isFinite)){
        segments.push({ x1: last.x, y1: last.y, x2: first.x, y2: first.y });
      }
    }
    return segments;
  };
  const cadArcToSegments = (cx, cy, radius, startDeg, endDeg)=>{
    if (![cx, cy, radius, startDeg, endDeg].every(Number.isFinite) || radius <= 0) return [];
    const tau = Math.PI * 2;
    let start = (startDeg * Math.PI) / 180;
    let end = (endDeg * Math.PI) / 180;
    while (end <= start) end += tau;
    const sweep = Math.max(0, end - start);
    const segmentCount = Math.max(12, Math.ceil(sweep / (Math.PI / 18)));
    const points = [];
    for (let i = 0; i <= segmentCount; i += 1){
      const t = start + ((sweep * i) / segmentCount);
      points.push({ x: cx + (radius * Math.cos(t)), y: cy + (radius * Math.sin(t)) });
    }
    return cadPointsToSegments(points, false);
  };
  const parseCadSegments = (text)=>{
    const lines = String(text || "").split(/\r?\n/);
    const pairs = [];
    for (let i = 0; i < lines.length; i += 2) {
      const code = Number.parseInt(String(lines[i] || "").trim(), 10);
      if (!Number.isFinite(code)) continue;
      pairs.push({ code, value: String(lines[i + 1] || "").trim() });
    }
    const entities = [];
    let section = "";
    let current = null;
    for (let i = 0; i < pairs.length; i += 1) {
      const pair = pairs[i];
      if (pair.code !== 0) {
        if (current) current.data.push(pair);
        continue;
      }
      const marker = pair.value.toUpperCase();
      if (marker === "SECTION") {
        const namePair = pairs[i + 1];
        if (namePair?.code === 2) {
          section = namePair.value.toUpperCase();
          i += 1;
        }
        continue;
      }
      if (marker === "ENDSEC") {
        section = "";
        current = null;
        continue;
      }
      if (section !== "ENTITIES") continue;
      if (current) entities.push(current);
      current = { type: marker, data: [] };
    }
    if (current) entities.push(current);

    const numberCode = (pairsList, code)=>{
      const pair = pairsList.find(item => Number(item?.code) === Number(code));
      if (!pair) return null;
      const n = Number.parseFloat(String(pair.value ?? "").trim());
      return Number.isFinite(n) ? n : null;
    };

    const segments = [];
    for (let idx = 0; idx < entities.length; idx += 1){
      const entity = entities[idx];
      if (!entity) continue;
      if (entity.type === "LINE") {
        const x1 = numberCode(entity.data, 10); const y1 = numberCode(entity.data, 20);
        const x2 = numberCode(entity.data, 11); const y2 = numberCode(entity.data, 21);
        if ([x1, y1, x2, y2].every(Number.isFinite)) segments.push({ x1, y1, x2, y2 });
        continue;
      }
      if (entity.type === "ARC"){
        const cx = numberCode(entity.data, 10);
        const cy = numberCode(entity.data, 20);
        const radius = numberCode(entity.data, 40);
        const startDeg = numberCode(entity.data, 50);
        const endDeg = numberCode(entity.data, 51);
        segments.push(...cadArcToSegments(cx, cy, radius, startDeg, endDeg));
        continue;
      }
      if (entity.type === "CIRCLE"){
        const cx = numberCode(entity.data, 10);
        const cy = numberCode(entity.data, 20);
        const radius = numberCode(entity.data, 40);
        segments.push(...cadArcToSegments(cx, cy, radius, 0, 360));
        continue;
      }
      if (entity.type === "LWPOLYLINE") {
        const points = [];
        for (let i = 0; i < entity.data.length; i += 1){
          const pair = entity.data[i];
          if (Number(pair?.code) !== 10) continue;
          const x = Number.parseFloat(pair.value);
          const next = entity.data[i + 1];
          if (!next || Number(next.code) !== 20) continue;
          const y = Number.parseFloat(next.value);
          if ([x, y].every(Number.isFinite)) points.push({ x, y });
        }
        const closedRaw = numberCode(entity.data, 70);
        const closed = Number.isFinite(closedRaw) ? (Math.round(closedRaw) & 1) === 1 : false;
        segments.push(...cadPointsToSegments(points, closed));
        continue;
      }
      if (entity.type === "POLYLINE") {
        const points = [];
        const closedRaw = numberCode(entity.data, 70);
        const closed = Number.isFinite(closedRaw) ? (Math.round(closedRaw) & 1) === 1 : false;
        for (let j = idx + 1; j < entities.length; j += 1){
          const child = entities[j];
          if (!child) continue;
          if (child.type === "SEQEND"){
            idx = j;
            break;
          }
          if (child.type !== "VERTEX") continue;
          const x = numberCode(child.data, 10);
          const y = numberCode(child.data, 20);
          if ([x, y].every(Number.isFinite)) points.push({ x, y });
        }
        segments.push(...cadPointsToSegments(points, closed));
      }
    }
    return segments;
  };
  const renderCadToSvgDataUrl = (text)=>{
    const segments = parseCadSegments(text);
    if (!segments.length) return "";
    const bounds = segments.reduce((acc, item) => {
      acc.minX = Math.min(acc.minX, item.x1, item.x2);
      acc.maxX = Math.max(acc.maxX, item.x1, item.x2);
      acc.minY = Math.min(acc.minY, item.y1, item.y2);
      acc.maxY = Math.max(acc.maxY, item.y1, item.y2);
      return acc;
    }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const pad = Math.max(width, height) * 0.08;
    const vbX = bounds.minX - pad;
    const vbY = bounds.minY - pad;
    const vbW = width + (pad * 2);
    const vbH = height + (pad * 2);
    const paths = segments
      .map(item => `<line x1="${item.x1}" y1="${-item.y1}" x2="${item.x2}" y2="${-item.y2}"/>`)
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${-(vbY + vbH)} ${vbW} ${vbH}"><rect x="${vbX}" y="${-(vbY + vbH)}" width="${vbW}" height="${vbH}" fill="#ffffff"/><g stroke="#32407a" stroke-width="${Math.max(vbW, vbH) / 450}" fill="none" stroke-linecap="round">${paths}</g></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };
  const filePreviewModel = (file)=>{
    const name = String(file?.name || "Attached file");
    const href = String(file?.dataUrl || file?.url || "");
    const previewUrl = String(file?.previewUrl || "");
    const ext = extractFileExtension(name);
    const savedPreview = file && typeof file === "object" ? file.preview : null;
    if (savedPreview && typeof savedPreview === "object"){
      const mode = savedPreview.mode === "image" ? "image" : "message";
      const content = String(savedPreview.content || "").trim();
      if (content) return { name, href, mode, content };
    }
    if (/^data:image\//i.test(previewUrl) || /^https?:\/\//i.test(previewUrl)) return { name, href: href || previewUrl, mode: "image", content: previewUrl };
    if (!href) return { name, href: "", mode: "message", content: "Preview unavailable" };
    if (ext === ".svg") return { name, href, mode: "image", content: href };
    if (/^data:image\//i.test(href)) return { name, href, mode: "image", content: href };
    if (/^https?:\/\//i.test(href) && [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].includes(ext)){
      return { name, href, mode: "image", content: href };
    }
    if ([".dxf", ".ord", ".omx"].includes(ext)) {
      const text = decodeDataUrlText(href);
      const cadSvg = text ? renderCadToSvgDataUrl(text) : "";
      return cadSvg
        ? { name, href, mode: "image", content: cadSvg }
        : { name, href, mode: "message", content: "2D preview unavailable. Add a OneDrive direct file URL or re-upload to refresh preview." };
    }
    return { name, href, mode: "message", content: "Preview unavailable for this file type." };
  };
  const buildFileCellMarkup = (jobId, files)=>{
    const previews = (Array.isArray(files) ? files : []).map(filePreviewModel);
    if (!previews.length) return '<div class="job-file-preview-empty small muted">No files attached</div>';
    const first = previews[0] || { name: "Attached file", mode: "message", content: "Preview unavailable", href: "" };
    const selectId = `jobFileSelect_${esc(jobId)}`;
    return `
      <div class="job-file-preview" data-file-preview data-file-preview-job="${esc(jobId)}">
        ${previews.length > 1
          ? `<label class="sr-only" for="${selectId}">Choose file preview</label><select id="${selectId}" class="job-file-preview-select" data-file-preview-select="${esc(jobId)}">${previews.map((f, idx)=>`<option value="${idx}" data-preview-name="${esc(f.name)}" data-preview-mode="${esc(f.mode)}" data-preview-content="${esc(f.content)}" data-preview-href="${esc(f.href || "")}">${esc(f.name)}</option>`).join("")}</select>`
          : ""}
        <div class="job-file-preview-panes" data-file-preview-panes>
          <div class="job-file-preview-pane" data-file-preview-pane>
            <div class="job-file-preview-name" data-preview-name title="${esc(first.name)}">${esc(first.name)}</div>
            <div class="job-file-preview-frame">
              <img src="${first.mode === "image" ? esc(first.content) : ""}" alt="Preview of ${esc(first.name)}" class="job-file-preview-image" data-preview-image ${first.mode === "image" ? "" : "hidden"}>
              <span class="job-file-preview-message small muted" data-preview-message ${first.mode === "message" ? "" : "hidden"}>${first.mode === "message" ? esc(first.content) : ""}</span>
            </div>
            <a class="job-file-preview-open small" data-preview-open href="${esc(first.href || "")}" target="_blank" rel="noopener" ${first.href ? "" : "hidden"}>Open file</a>
          </div>
        </div>
      </div>
    `;
  };
  const hoursPerDay = typeof getConfiguredDailyHours === "function"
    ? getConfiguredDailyHours()
    : ((typeof DAILY_HOURS === "number" && Number.isFinite(DAILY_HOURS) && DAILY_HOURS > 0)
      ? Number(DAILY_HOURS)
      : 8);
  const resolveActualHours = (job, eff = {}) => {
    const actualRaw = job?.actualHours;
    const actualNum = Number(actualRaw);
    if (actualRaw !== undefined && actualRaw !== null && actualRaw !== "" && Number.isFinite(actualNum) && actualNum >= 0){
      return actualNum;
    }
    const effRaw = eff?.actualHours;
    const effNum = Number(effRaw);
    return (effRaw !== undefined && effRaw !== null && effRaw !== "" && Number.isFinite(effNum) && effNum >= 0)
      ? effNum
      : null;
  };

  const computeJobNetTotal = (job, eff, { preferActual = false } = {}) => {
    if (!job) return 0;
    const efficiency = eff || {};
    const estimateHours = Number(job.estimateHours) || 0;
    const chargeSource = efficiency.chargeRate != null ? Number(efficiency.chargeRate) : Number(job.chargeRate);
    const chargeRate = Number.isFinite(chargeSource) && chargeSource >= 0 ? chargeSource : JOB_RATE_PER_HOUR;
    const materialCost = Number(job.materialCost) || 0;
    const materialQty = Number(job.materialQty) || 0;
    const materialTotal = materialCost * materialQty;
    const actualHours = resolveActualHours(job, efficiency);
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
  const allJobsForCutNumbers = (Array.isArray(cuttingJobs) ? cuttingJobs : []).concat(completedJobs).filter(Boolean);
  const addedOrderFromId = (job)=>{
    const id = String(job?.id || "");
    const token = id.includes("_") ? id.slice(id.lastIndexOf("_") + 1) : "";
    const parsed = Number.parseInt(token, 36);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  };
  const fallbackOrderTime = (job)=>{
    const val = Date.parse(job?.startISO || job?.createdAt || job?.completedAtISO || "");
    return Number.isFinite(val) ? val : Number.MAX_SAFE_INTEGER;
  };
  const cutOrder = allJobsForCutNumbers.slice().sort((a, b)=>{
    const aAdded = addedOrderFromId(a);
    const bAdded = addedOrderFromId(b);
    if (Number.isFinite(aAdded) || Number.isFinite(bAdded)){
      if (!Number.isFinite(aAdded)) return 1;
      if (!Number.isFinite(bAdded)) return -1;
      if (aAdded !== bAdded) return aAdded - bAdded;
    }
    const aTime = fallbackOrderTime(a);
    const bTime = fallbackOrderTime(b);
    if (aTime !== bTime) return aTime - bTime;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
  const jobCutMap = new Map();
  const jobCategoryCutMap = new Map();
  const categoryCounts = new Map();
  cutOrder.forEach((job, idx)=>{
    const key = String(job?.id || `${job?.name || "job"}_${idx}`);
    jobCutMap.set(key, `C${String(idx + 1).padStart(3, "0")}`);
    const catKey = String(job?.cat || (window.JOB_ROOT_FOLDER_ID || "jobs_root"));
    const nextCat = (categoryCounts.get(catKey) || 0) + 1;
    categoryCounts.set(catKey, nextCat);
    jobCategoryCutMap.set(key, String(nextCat));
  });
  const jobCutLabel = (job)=> jobCutMap.get(String(job?.id || "")) || "C000";
  const jobCategoryCutLabel = (job)=> jobCategoryCutMap.get(String(job?.id || "")) || "0";
  const jobNameWithCut = (job, fallback = "Job")=> `${String(job?.name || fallback)} · ${jobCutLabel(job)} · ${jobCategoryCutLabel(job)}`;
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
    const actualHours = resolveActualHours(job, eff);
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


  const normalizeProjectNumber = (value)=> String(value || "").trim().replace(/[^0-9]/g, "").slice(0, 8);
  const projectLabel = (job)=> {
    const value = normalizeProjectNumber(job?.projectNumber);
    return value || "Unassigned";
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
  const selectedCategoryFolder = folderMap.get(selectedCategory);
  const selectedCategoryName = selectedCategoryFolder?.name
    ? String(selectedCategoryFolder.name)
    : (selectedCategory === rootCategoryId ? "All Jobs" : "Category");

  const historyCategoryRaw = typeof window.jobHistoryCategoryFilter === "string"
    ? window.jobHistoryCategoryFilter
    : selectedCategory;
  const historyCategory = folderMap.has(String(historyCategoryRaw)) ? String(historyCategoryRaw) : rootCategoryId;
  const historyCategoryFolder = folderMap.get(historyCategory);
  const historyCategoryName = historyCategoryFolder?.name
    ? String(historyCategoryFolder.name)
    : (historyCategory === rootCategoryId ? "All Jobs" : "Category");
  window.jobHistoryCategoryFilter = historyCategory;
  const addJobDefaultCategory = rootCategoryId;
  const addJobDraft = window.jobAddDraft && typeof window.jobAddDraft === "object"
    ? window.jobAddDraft
    : {};
  const addJobDraftField = (key, fallback = "")=>{
    const raw = addJobDraft[key];
    if (raw == null) return fallback;
    return String(raw);
  };
  const addJobPriorityDefault = (() => {
    const raw = Number(addJobDraftField("priority", "1"));
    return Number.isFinite(raw) && raw > 0 ? Math.max(1, Math.floor(raw)) : 1;
  })();
  const addJobCategoryDefault = (() => {
    const draftCategory = addJobDraftField("category", addJobDefaultCategory);
    return folderMap.has(draftCategory) ? draftCategory : addJobDefaultCategory;
  })();
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

  const activeAllowedCategories = new Set();
  includeDescendants(selectedCategory, activeAllowedCategories);

  const historyAllowedCategories = new Set();
  includeDescendants(historyCategory, historyAllowedCategories);

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

  const priorityLevels = [1, 2, 3, 4, 5];
  const priorityOptionsMarkup = (selectedValue)=>{
    const selected = Number.isFinite(Number(selectedValue)) ? Math.max(1, Math.floor(Number(selectedValue))) : 1;
    const baseMax = priorityLevels[priorityLevels.length - 1] || 5;
    const totalJobs = Array.isArray(cuttingJobs) ? cuttingJobs.length : baseMax;
    const limit = Math.max(baseMax, totalJobs + 1, selected);
    const options = [];
    for (let level = 1; level <= limit; level += 1){
      const selectedAttr = level === selected ? " selected" : "";
      options.push(`<option value="${level}"${selectedAttr}>Priority ${level}</option>`);
    }
    return options.join("");
  };

  const priorityForJob = (job)=>{
    if (typeof getJobPriority === "function") return getJobPriority(job);
    const raw = job && job.priority != null ? Number(job.priority) : 1;
    if (!Number.isFinite(raw) || raw <= 0) return 1;
    return Math.max(1, Math.floor(raw));
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
              <span class="job-title-chip-text">${esc(jobNameWithCut(job, "Untitled job"))}</span>
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
    return activeAllowedCategories.has(normalized);
  });
  const totalActiveJobs = Array.isArray(cuttingJobs) ? cuttingJobs.length : 0;
  const hiddenActiveJobs = Math.max(0, totalActiveJobs - jobsForCategory.length);
  const activeFilterNotice = hiddenActiveJobs > 0
    ? `<div class="small muted job-filter-status">Showing ${jobsForCategory.length} of ${totalActiveJobs} active jobs in <strong>${esc(selectedCategoryName)}</strong>. <button type="button" class="link" data-job-show-all>Show all jobs</button></div>`
    : "";

  jobsForCategory.sort((a, b) => {
    const priorityDiff = priorityForJob(a) - priorityForJob(b);
    if (priorityDiff !== 0) return priorityDiff;
    const dueA = parseDateLocal(a?.dueISO);
    const dueB = parseDateLocal(b?.dueISO);
    const dueTimeA = dueA instanceof Date && !Number.isNaN(dueA.getTime()) ? dueA.getTime() : Number.POSITIVE_INFINITY;
    const dueTimeB = dueB instanceof Date && !Number.isNaN(dueB.getTime()) ? dueB.getTime() : Number.POSITIVE_INFINITY;
    if (dueTimeA !== dueTimeB) return dueTimeA - dueTimeB;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });

  const completedForCategory = completedSorted.filter(job => {
    const normalized = normalizeCategory(job?.cat);
    return historyAllowedCategories.has(normalized);
  });

  const completedFiltered = completedForCategory.filter(matchesHistorySearch);
  const totalCompletedJobs = Array.isArray(completedSorted) ? completedSorted.length : 0;
  const hiddenCompletedByCategory = Math.max(0, totalCompletedJobs - completedForCategory.length);
  const resolveChargeRate = (job) => {
    const chargeRaw = job?.chargeRate;
    const chargeNum = Number(chargeRaw);
    if (Number.isFinite(chargeNum) && chargeNum >= 0) return chargeNum;
    const efficiencyCharge = Number(job?.efficiency?.chargeRate);
    return (Number.isFinite(efficiencyCharge) && efficiencyCharge >= 0)
      ? efficiencyCharge
      : JOB_RATE_PER_HOUR;
  };
  const resolveCostRate = (job, estHours, matTotal) => {
    const costRaw = job?.costRate;
    const costNum = Number(costRaw);
    if (Number.isFinite(costNum) && costNum >= 0) return costNum;
    const efficiencyCost = Number(job?.efficiency?.costRate);
    if (Number.isFinite(efficiencyCost) && efficiencyCost >= 0) return efficiencyCost;
    const hoursVal = Number(estHours);
    return (Number.isFinite(hoursVal) && hoursVal > 0)
      ? JOB_BASE_COST_PER_HOUR + (matTotal / hoursVal)
      : JOB_BASE_COST_PER_HOUR;
  };
  const completedStats = completedFiltered.reduce((acc, job)=>{
    const eff = computeJobEfficiency(job);
    const net = computeJobNetTotal(job, eff, { preferActual: true });
    const estHours = Number(job?.estimateHours);
    const matCost = Number(job?.materialCost || 0);
    const matQty = Number(job?.materialQty || 0);
    const matTotal = (matCost * matQty) || 0;
    const chargeRate = resolveChargeRate(job);
    const costRate = resolveCostRate(job, estHours, matTotal);
    const netRate = chargeRate - costRate;

    acc.total += Number.isFinite(net) ? net : 0;
    acc.estimate += Number.isFinite(estHours) ? estHours : 0;
    acc.materialCost += Number.isFinite(matCost) ? matCost : 0;
    acc.materialQty += Number.isFinite(matQty) ? matQty : 0;
    acc.materialTotal += Number.isFinite(matTotal) ? matTotal : 0;
    acc.chargeRate += Number.isFinite(chargeRate) ? chargeRate : 0;
    acc.costRate += Number.isFinite(costRate) ? costRate : 0;
    acc.netRate += Number.isFinite(netRate) ? netRate : 0;
    return acc;
  }, {
    total: 0,
    estimate: 0,
    materialCost: 0,
    materialQty: 0,
    materialTotal: 0,
    chargeRate: 0,
    costRate: 0,
    netRate: 0
  });
  const completedCount = completedFiltered.length;
  const completedAverage = completedCount ? (completedStats.total / completedCount) : 0;
  const completedAverageMetrics = completedCount ? {
    estimate: completedStats.estimate / completedCount,
    materialCost: completedStats.materialCost / completedCount,
    materialQty: completedStats.materialQty / completedCount,
    materialTotal: completedStats.materialTotal / completedCount,
    chargeRate: completedStats.chargeRate / completedCount,
    costRate: completedStats.costRate / completedCount,
    netRate: completedStats.netRate / completedCount,
    netTotal: completedAverage
  } : null;

  const prioritySchedule = typeof computePrioritySchedule === "function"
    ? computePrioritySchedule(cuttingJobs)
    : { backlog: new Map(), efficiencies: new Map() };
  const backlogById = prioritySchedule && prioritySchedule.backlog instanceof Map
    ? prioritySchedule.backlog
    : new Map();
  const efficiencyCache = prioritySchedule && prioritySchedule.efficiencies instanceof Map
    ? prioritySchedule.efficiencies
    : new Map();

  const jobOverlapNotice = "Jobs might be overlapping. Estimates are not accurate if jobs are set to cut at the same time. Please log hours to get most accurate estimates, however estimates may not be accurate until job is complete.";
  const jobOverlapBannerText = "Two or more cutting jobs are overlapping. Estimates are not accurate if jobs are set to cut at the same time. Please log hours to get most accurate estimates, however estimates may not be accurate until job is complete.";
  const avgBanner = renderAverageHoursBanner("cutting-job-history");
  const jobOverlapNoticeEsc = esc(jobOverlapNotice);
  const overlappingJobIds = (()=>{
    if (!Array.isArray(cuttingJobs) || !cuttingJobs.length) return new Set();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const ranges = cuttingJobs.map(job => {
      if (!job || job.completedAtISO) return null;
      const id = job?.id != null ? String(job.id) : "";
      if (!id) return null;
      const startDate = parseDateLocal(job.startISO);
      if (!(startDate instanceof Date)) return null;
      const startTime = startDate.getTime();
      if (!Number.isFinite(startTime)) return null;
      const dueDate = parseDateLocal(job.dueISO);
      let endTime = dueDate instanceof Date ? dueDate.getTime() : startTime;
      if (!Number.isFinite(endTime)) endTime = startTime;
      if (endTime < startTime) endTime = startTime;
      endTime += DAY_MS - 1;
      return { id, start: startTime, end: endTime };
    }).filter(Boolean).sort((a, b)=>{
      if (a.start !== b.start) return a.start - b.start;
      return a.end - b.end;
    });
    if (!ranges.length) return new Set();
    const overlaps = new Set();
    for (let i = 0; i < ranges.length; i++){
      const current = ranges[i];
      if (!current || !current.id) continue;
      for (let j = i + 1; j < ranges.length; j++){
        const next = ranges[j];
        if (!next || !next.id) continue;
        if (next.start > current.end) break;
        overlaps.add(current.id);
        overlaps.add(next.id);
      }
    }
    return overlaps;
  })();
  const overlapSignature = overlappingJobIds.size >= 2
    ? Array.from(overlappingJobIds).filter(Boolean).sort().join("|")
    : "";
  const dismissedOverlapSignature = typeof window !== "undefined" && typeof window.dismissedJobOverlapSignature === "string"
    ? window.dismissedJobOverlapSignature
    : "";
  const showOverlapAlert = Boolean(overlapSignature && overlapSignature !== dismissedOverlapSignature);
  const overlapAlertMarkup = showOverlapAlert
    ? `<div class="job-overlap-alert" role="alert" data-job-overlap-alert data-job-overlap-signature="${esc(overlapSignature)}">
        <span class="job-overlap-alert-icon" aria-hidden="true">!</span>
        <div class="job-overlap-alert-body">
          <div class="job-overlap-alert-title">Overlapping jobs detected</div>
          <p class="job-overlap-alert-text">${esc(jobOverlapBannerText)}</p>
        </div>
        <button type="button" class="job-overlap-alert-close" data-job-overlap-dismiss aria-label="Dismiss overlap warning">×</button>
      </div>`
    : "";
  const jobTableOverlapAttr = overlapSignature
    ? ` data-job-overlap-signature="${esc(overlapSignature)}"`
    : "";
  const selectedCategoryColorStyle = categoryColorStyle(selectedCategory);
  const categoryFilterAriaLabel = `Change cutting jobs category (currently ${selectedCategoryName || "All Jobs"})`;
  const historyCategoryFilterAriaLabel = `Change past jobs category (currently ${historyCategoryName || "All Jobs"})`;

  const jobColumnCount = 15;
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
    const delta = Number(eff.deltaHours);
    const netTotal = computeJobNetTotal(job, eff, { preferActual: true });
    const actualHours = resolveActualHours(job, eff);
    const hasActualHours = Number.isFinite(actualHours) && actualHours >= 0;
    const estHours = Number(job.estimateHours);
    const editingHistory = editingCompletedJobsSet.has(String(job.id));
    const priorityValue = priorityForJob(job);
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
          if (f?.source === "onedrive_local_root" && f?.localRelativePath){
            return `<li class="job-file-menu-item"><button type="button" class="link" data-open-local-file data-job-id="${esc(String(job.id || ""))}" data-file-index="${idx}">${safeName}</button></li>`;
          }
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
    const chargeRate = resolveChargeRate(job);
    const chargeDisplay = formatRate(chargeRate);
    const costRate = resolveCostRate(job, estHours, matTotal);
    const costDisplay = formatRate(costRate);
    const netRate = chargeRate - costRate;
    const netDisplay = formatRate(netRate, { showPlus: true });
    const netClass = netRate >= 0 ? "job-rate-net-positive" : "job-rate-net-negative";
    const netTotalDisplay = formatCurrency(netTotal, { showPlus: true });
    const impactClass = netTotal > 0 ? "job-impact-ahead" : (netTotal < 0 ? "job-impact-behind" : "job-impact-neutral");

    const startDate = parseDateLocal(job?.startISO);
    const dueDate = parseDateLocal(job?.dueISO);
    const completedDate = parseDateLocal(job?.completedAtISO);
    const startTxt = startDate ? startDate.toDateString() : "—";
    const dueTxt = dueDate ? dueDate.toDateString() : "—";
    const completedTxt = completedDate ? completedDate.toDateString() : "—";

    let statusLabel = "Finished on estimate";
    if (Number.isFinite(delta) && Math.abs(delta) > 0.1){
      statusLabel = delta > 0 ? "Finished ahead" : "Finished behind";
    }
    const statusDetail = completedTxt !== "—" ? `Completed ${completedTxt}` : "";
    const statusClass = statusLabel.toLowerCase().includes("ahead")
      ? "job-status-ahead"
      : (statusLabel.toLowerCase().includes("behind") ? "job-status-behind" : "job-status-onpace");

    const estimateDisplay = formatHours(estHours);
    const actualDisplay = hasActualHours ? formatHours(actualHours) : "—";
    const needDisplay = "";

    const noteContent = (job?.notes || "").trim();
    const noteButtonLabel = esc(job?.name || "Cutting job");
    const notePreview = buildJobNotePreview(noteContent);
    const notePreviewTitleAttr = notePreview.tooltip ? ` title="${esc(notePreview.tooltip)}"` : "";

    const efficiencySummaryParts = [
      statusLabel,
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
              <div class="job-main-headline">
                <div class="job-title-chip"${colorStyleAttr}>
                  <span class="job-title-chip-dot" aria-hidden="true"></span>
                  <span class="job-title-chip-text">${esc(jobNameWithCut(job, "Job"))}</span>
                </div>
                <div class="job-priority-inline job-priority-inline-static">
                  <span class="job-priority-inline-label">Priority</span>
                  <span class="job-priority-inline-value">Priority ${priorityValue}</span>
                </div>
              </div>
              <div class="job-main-category small muted" data-category-color="1"${historyColorStyle}>
                <span class="job-main-category-label">Category</span>
                <span class="job-main-category-name">${esc(categoryName)}</span>
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
          <td class="job-col job-col-hours">${actualDisplay}</td>
          <td class="job-col job-col-status">
            <div class="job-status ${statusClass}">${esc(statusLabel)}</div>
            ${statusDetail ? `<div class="job-status-detail">${esc(statusDetail.trim())}</div>` : ""}
            ${needDisplay ? `<div class="job-status-need">${needDisplay}</div>` : ""}
          </td>
          <td class="job-col job-col-files">${buildFileCellMarkup(job.id, jobFiles)}</td>
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
    const chargeRateVal = numberInputValue(job?.chargeRate ?? job?.efficiency?.chargeRate ?? chargeRate);
    const costRateVal = numberInputValue(job?.costRate ?? job?.efficiency?.costRate ?? costRate);

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
                <label>Priority<select data-history-field="priority" data-history-id="${job.id}">${priorityOptionsMarkup(priorityValue)}</select></label>
                <label>Material<input type="text" data-history-field="material" data-history-id="${job.id}" value="${esc(job?.material || "")}"></label>
                <label>Material cost<input type="number" min="0" step="0.01" data-history-field="materialCost" data-history-id="${job.id}" value="${materialCostVal}"></label>
                <label>Material quantity<input type="number" min="0" step="0.01" data-history-field="materialQty" data-history-id="${job.id}" value="${materialQtyVal}"></label>
                <label>Charge rate ($/hr)<input type="number" min="0" step="0.01" data-history-field="chargeRate" data-history-id="${job.id}" value="${chargeRateVal}"></label>
                <label>Cost rate ($/hr)<input type="number" min="0" step="0.01" data-history-field="costRate" data-history-id="${job.id}" value="${costRateVal}"></label>
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
  const completedAverageRow = completedAverageMetrics
    ? (() => {
        const estimateDisplay = formatHours(completedAverageMetrics.estimate);
        const materialCostDisplay = formatCurrency(completedAverageMetrics.materialCost, { showPlus: false });
        const materialQtyDisplay = formatQuantity(completedAverageMetrics.materialQty);
        const materialTotalDisplay = formatCurrency(completedAverageMetrics.materialTotal, { showPlus: false });
        const chargeRateDisplay = formatRate(completedAverageMetrics.chargeRate);
        const costRateDisplay = formatRate(completedAverageMetrics.costRate);
        const netRateDisplay = formatRate(completedAverageMetrics.netRate, { showPlus: true });
        const netTotalDisplay = formatCurrency(completedAverageMetrics.netTotal, { showPlus: true });
        const emptyCell = '<td class="past-jobs-average-empty">—</td>';
        return `
          <tr class="past-jobs-average-row">
            <td class="past-jobs-average-label">Average per job</td>
            <td><strong>${estimateDisplay}</strong></td>
            ${emptyCell}
            <td><strong>${materialCostDisplay}</strong></td>
            <td><strong>${materialQtyDisplay}</strong></td>
            <td><strong>${materialTotalDisplay}</strong></td>
            <td><strong>${chargeRateDisplay}</strong></td>
            <td><strong>${costRateDisplay}</strong></td>
            <td><strong>${netRateDisplay}</strong></td>
            ${emptyCell}
            ${emptyCell}
            ${emptyCell}
            <td><strong>${netTotalDisplay}</strong></td>
            ${emptyCell}
            ${emptyCell}
          </tr>
        `;
      })()
    : "";
  const completedTable = completedFiltered.length
    ? `
      <div class="past-jobs-summary-wrap">
        <div class="past-jobs-summary">
          <div><span class="label">Jobs logged</span><span>${completedFiltered.length}</span></div>
          <div><span class="label">Total impact</span><span>${formatCurrency(completedStats.total)}</span></div>
          <div><span class="label">Avg per job</span><span>${formatCurrency(completedAverage)}</span></div>
        </div>
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
            <th>Hours taken</th>
            <th>Status</th>
            <th>Files</th>
            <th>Net total</th>
            <th>Notes</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${completedAverageRow}${completedRows}</tbody>
      </table>
    `
    : `<p class="small muted">${historyEmptyMessage}</p>`;
  const historyFilterStatus = historySearchActive
    ? `<div class="small muted past-jobs-filter-status">Showing ${completedFiltered.length} of ${totalCompletedCount} logged jobs.</div>`
    : "";
  const historyCategoryNotice = (!historySearchActive && hiddenCompletedByCategory > 0)
    ? `<div class="small muted past-jobs-filter-status">Showing ${completedForCategory.length} of ${totalCompletedJobs} past jobs in <strong>${esc(historyCategoryName)}</strong>.</div>`
    : "";
  const activeColumnCount = jobColumnCount;
  const priorityAnimationMap = (typeof window !== "undefined" && window.__priorityAnimationMap instanceof Map)
    ? window.__priorityAnimationMap
    : null;
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
          if (f?.source === "onedrive_local_root" && f?.localRelativePath){
            return `<li class="job-file-menu-item"><button type="button" class="link" data-open-local-file data-job-id="${esc(String(j.id || ""))}" data-file-index="${idx}">${safeName}</button></li>`;
          }
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
    const editing = editingJobs.has(j.id);
    const jobId = j?.id != null ? String(j.id) : "";
    const priorityValue = priorityForJob(j);
    const cachedEff = jobId && efficiencyCache instanceof Map ? efficiencyCache.get(jobId) : null;
    const eff = cachedEff || computeJobEfficiency(j);
    if (jobId && efficiencyCache instanceof Map && !efficiencyCache.has(jobId)){
      efficiencyCache.set(jobId, eff);
    }
    const backlogRaw = jobId && backlogById instanceof Map ? backlogById.get(jobId) : 0;
    const backlogHours = Number.isFinite(Number(backlogRaw)) ? Math.max(0, Number(backlogRaw)) : 0;
    const req = computeRequiredDaily(j, { backlogHours });
    const jobHasOverlap = jobId && overlappingJobIds.has(jobId);
    const overlapIndicatorButton = jobHasOverlap
      ? `<button type="button" class="job-overlap-indicator" data-job-overlap-info data-job-overlap-message="${jobOverlapNoticeEsc}" aria-label="Job overlap warning" title="Jobs might be overlapping">!</button>`
      : "";
    const highlightPriority = priorityAnimationMap ? priorityAnimationMap.has(jobId) : false;
    const rowBaseClass = `job-row${jobHasOverlap ? " job-row-overlap" : ""}`;
    const rowClass = highlightPriority ? `${rowBaseClass} job-row-priority-animate` : rowBaseClass;
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
    const costRate = resolveCostRate(j, estHours, matTotal);
    const netRate = chargeRate - costRate;
    const chargeDisplay = formatRate(chargeRate);
    const costDisplay = formatRate(costRate);
    const netDisplay = formatRate(netRate, { showPlus: true });
    const netClass = netRate >= 0 ? "job-rate-net-positive" : "job-rate-net-negative";
    const netTotal = computeJobNetTotal(j, eff, { preferActual: false });
    const netTotalDisplay = formatCurrency(netTotal, { showPlus: true });
    const impactClass = netTotal > 0 ? "job-impact-ahead" : (netTotal < 0 ? "job-impact-behind" : "job-impact-neutral");

    // Remaining & per-day
    const jobRemainingHours = Number.isFinite(req.jobRemainingHours)
      ? Math.max(0, req.jobRemainingHours)
      : (Number.isFinite(eff.actualRemaining) ? Math.max(0, eff.actualRemaining) : Math.max(0, req.remainingHours || 0));
    const actualRemain = jobRemainingHours;
    const remainHrs = actualRemain;
    const remainingHours = Number.isFinite(req.remainingHours) ? Math.max(0, req.remainingHours) : 0;
    const remainingDays = Number.isFinite(req.remainingDays) ? Math.max(0, req.remainingDays) : 0;
    const capacityRemaining = remainingDays * hoursPerDay;
    const slackHours = req.requiredPerDay === Infinity
      ? Number.NEGATIVE_INFINITY
      : capacityRemaining - remainingHours;
    const SLACK_EPS = 0.05;
    const isPastDue = req.requiredPerDay === Infinity;
    const behindSchedule = isPastDue || slackHours < -SLACK_EPS;
    const aheadSchedule = !behindSchedule && slackHours > (hoursPerDay + SLACK_EPS);
    const statusLabel = isPastDue ? 'Past due' : (behindSchedule ? 'Behind' : (aheadSchedule ? 'Ahead' : 'On pace'));
    const backlogSummary = backlogHours > 0 ? `${backlogHours.toFixed(1)} hr queued ahead` : '';
    const statusDetailParts = [];
    if (isPastDue){
      const pastDue = formatPastDueLabel(j.dueISO);
      if (pastDue) statusDetailParts.push(pastDue);
      if (backlogSummary) statusDetailParts.push(backlogSummary);
    } else {
      statusDetailParts.push(`${remainingHours.toFixed(1)} hr remaining over ${remainingDays} day${remainingDays===1?'':'s'}`);
      statusDetailParts.push(`Needs ${req.requiredPerDay.toFixed(1)} hr/day (capacity ${hoursPerDay.toFixed(1)} hr/day)`);
      if (Math.abs(slackHours) > SLACK_EPS){
        const slackLabel = slackHours >= 0
          ? `Slack ${slackHours.toFixed(1)} hr capacity`
          : `Short ${Math.abs(slackHours).toFixed(1)} hr capacity`;
        statusDetailParts.push(slackLabel);
      }
      if (backlogSummary) statusDetailParts.push(backlogSummary);
    }
    const capacitySummary = req.requiredPerDay === Infinity
      ? 'No remaining days on schedule'
      : `${remainingHours.toFixed(1)} hr remaining over ${remainingDays} day${remainingDays===1?'':'s'} (${req.requiredPerDay.toFixed(2)} hr/day vs ${hoursPerDay.toFixed(1)} hr/day capacity)`;
    const slackSummary = req.requiredPerDay === Infinity
      ? ''
      : `${slackHours >= 0 ? '+' : '−'}${Math.abs(slackHours).toFixed(1)} hr capacity`;
    const efficiencyParts = [statusLabel, capacitySummary];
    if (slackSummary) efficiencyParts.push(slackSummary);
    if (backlogSummary) efficiencyParts.push(backlogSummary);
    const efficiencyDetail = efficiencyParts.join('; ');
    const efficiencySummary = efficiencyDetail
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .join(' • ');
    const efficiencySummaryText = efficiencySummary || 'Schedule data not available';
    const impactDisplay = netTotalDisplay;

    const estimateDisplay = formatHours(j.estimateHours);
    const queueTotalDisplay = formatHours(remainingHours);
    const remainingDisplay = formatHours(remainHrs);
    const statusDetailHtml = statusDetailParts.length
      ? `<div class="job-status-detail">${statusDetailParts.map(part => `<div>${esc(part)}</div>`).join('')}</div>`
      : '';
    const statusClass = aheadSchedule
      ? 'job-status-ahead'
      : (behindSchedule ? 'job-status-behind' : 'job-status-onpace');
    const statusDisplay = `
      <div class="job-status ${statusClass}">${esc(statusLabel)}</div>
      ${statusDetailHtml}`.trim();

    // Dates (for display / edit row)
    const startDate = parseDateLocal(j.startISO);
    const dueDate   = parseDateLocal(j.dueISO);
    const startTxt  = startDate ? startDate.toDateString() : "—";
    const dueTxt    = dueDate ? dueDate.toDateString() : "—";
    const dueVal    = dueDate ? ymd(dueDate) : (j.dueISO || "");

    const prioritySelectId = `jobPriorityInline_${j.id}`;
    const priorityAriaLabel = esc(`Priority for ${j.name || "Job"}`);

    if (!editing){
      const matCostDisplay = formatCurrency(matCost, { showPlus: false });
      const matQtyDisplay  = formatQuantity(matQty);
      const noteContent = (j.notes || "").trim();
      const notePreview = buildJobNotePreview(noteContent);
      const noteButtonLabel = esc(j.name || "Cutting job");
      const notePreviewTitleAttr = notePreview.tooltip ? ` title="${esc(notePreview.tooltip)}"` : "";
      return `
        <tr data-job-row="${j.id}" class="${rowClass}">
          <td class="job-col job-col-main job-col-locked" data-requires-edit="${j.id}">
            <div class="job-main">
              <div class="job-main-headline">
                <div class="job-title-chip"${colorStyleAttr}>
                  <span class="job-title-chip-dot" aria-hidden="true"></span>
                  <span class="job-title-chip-text">${esc(jobNameWithCut(j, "Job"))}</span>
                </div>
                <div class="job-priority-inline">
                  <label class="job-priority-inline-label" for="${esc(prioritySelectId)}">Priority</label>
                  <select id="${esc(prioritySelectId)}" data-job-priority-inline="${esc(j.id)}" aria-label="${priorityAriaLabel}">
                    ${priorityOptionsMarkup(priorityValue)}
                  </select>
                </div>
                ${overlapIndicatorButton}
              </div>
              <div class="job-main-category small muted" data-category-color="1"${colorStyleAttr}>
                <span class="job-main-category-label">Category</span>
                <span class="job-main-category-name">${esc(categoryName)}</span>
              </div>
              <div class="job-main-project small muted">
                <span class="job-main-category-label">Project #</span>
                <span class="job-main-category-name">${esc(projectLabel(j))}</span>
              </div>
              <div class="job-main-category-picker small" data-category-color="1"${colorStyleAttr}>
                <select data-job-category-inline="${esc(j.id)}" data-job-category-select aria-label="Change category for ${esc(jobNameWithCut(j, "Job"))}">
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
          <td class="job-col job-col-hours">${remainingDisplay}${backlogHours > 0 ? `<div class="small muted">Queue total ${esc(queueTotalDisplay)}</div>` : ''}</td>
          <td class="job-col job-col-status">${statusDisplay}</td>
          <td class="job-col job-col-files">${buildFileCellMarkup(j.id, jobFiles)}</td>
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
                <div><dt>Queue ahead</dt><dd>${backlogHours > 0 ? `${backlogHours.toFixed(1)} hr` : 'None'}</dd></div>
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
        <tr data-job-row="${j.id}" class="${rowClass} editing">
          <td colspan="${activeColumnCount}">
              <div class="job-edit-card">
              <div class="job-edit-layout">
              ${jobHasOverlap ? `<div class="job-edit-overlap-hint">${overlapIndicatorButton}<span>${jobOverlapNoticeEsc}</span></div>` : ""}
              <div class="job-edit-grid">
                <label>Job name<input type="text" data-j="name" data-id="${j.id}" value="${j.name}"></label>
                <label>Estimate (hrs)<input type="number" min="1" data-j="estimateHours" data-id="${j.id}" value="${j.estimateHours}"></label>
                <label>Material<input type="text" data-j="material" data-id="${j.id}" value="${j.material||""}"></label>
                <label>Material cost ($)<input type="number" min="0" step="0.01" data-j="materialCost" data-id="${j.id}" value="${matCost}"></label>
                <label>Material quantity<input type="number" min="0" step="0.01" data-j="materialQty" data-id="${j.id}" value="${matQty}"></label>
                <label>Charge rate ($/hr)<input type="number" min="0" step="0.01" data-j="chargeRate" data-id="${j.id}" value="${chargeRate}"></label>
                <label>Cost rate ($/hr)<input type="number" min="0" step="0.01" data-j="costRate" data-id="${j.id}" value="${Number.isFinite(costRate) ? costRate : 45}"></label>
                <label>Start date<input type="date" data-j="startISO" data-id="${j.id}" value="${j.startISO||""}"></label>
                <label>Due date<input type="date" data-j="dueISO" data-id="${j.id}" value="${dueVal}"></label>
                <label>Project #<input type="text" data-j="projectNumber" data-id="${j.id}" inputmode="numeric" maxlength="8" value="${esc(projectLabel(j) === "Unassigned" ? "" : projectLabel(j))}"></label>
                <label>Priority<select data-j="priority" data-id="${j.id}">${priorityOptionsMarkup(priorityValue)}</select></label>
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
                    <span class="job-metric-label">Queue ahead</span>
                    <span class="job-metric-value">${backlogHours > 0 ? `${backlogHours.toFixed(1)} hr` : 'None'}</span>
                  </div>
                  <div class="job-metric">
                    <span class="job-metric-label">Queue total</span>
                    <span class="job-metric-value">${esc(queueTotalDisplay)}</span>
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
                <div class="job-edit-files-actions"><button type="button" data-upload-job="${j.id}">Add Files</button><button type="button" data-link-job-file="${j.id}">Link OneDrive URL</button></div>
                <input type="file" data-job-file-input="${j.id}" multiple style="display:none">
                <ul class="job-file-list">
                  ${jobFiles.length ? jobFiles.map((f, idx)=>{
                    const safeName = f.name || `file_${idx+1}`;
                    const href = f.dataUrl || f.url || "";
                    const link = href ? `<a href="${href}" download="${safeName}" target="_blank" rel="noopener">${safeName}</a>` : safeName;
                    const sourceTag = f?.source === "onedrive" ? `<span class="job-file-source-badge">OneDrive</span>` : "";
                    return `<li>${link} ${sourceTag} <button type="button" class="link" data-edit-file-link="${j.id}" data-file-index="${idx}">Link</button> <button type="button" class="link" data-remove-file="${j.id}" data-file-index="${idx}">Remove</button></li>`;
                  }).join("") : `<li class=\"muted\">No files attached</li>`}
                </ul>
              </div>
              <div class="job-edit-actions">
                <button type="button" data-save-job="${j.id}">Save</button>
                <button type="button" class="danger" data-cancel-job="${j.id}">Cancel</button>
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

    ${avgBanner}

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
            <button type="button" class="job-history-button" data-job-onedrive-setup>OneDrive setup</button>
            <button type="button" class="job-history-button" data-job-naming-open>Open Naming Widget</button>
            <button type="button" class="job-history-button" data-job-history-trigger>Jump to history</button>
          </div>
        </div>
        <div class="job-onedrive-status small muted">${esc(oneDriveStatusLabel)}</div>
        ${!addFormOpen && pendingFiles.length
          ? `<div class="job-add-indicator" role="status" aria-live="polite">${pendingSummary}</div>`
          : ""}
      </div>
      ${overlapAlertMarkup}
      <section
        class="job-add-panel${addFormOpen ? " is-open" : ""}"
        data-job-add-panel
        id="jobAddPanel"
        ${addFormOpen ? "" : "hidden"}
        aria-hidden="${addFormOpen ? "false" : "true"}"
      >
        <form id="addJobForm" class="mini-form job-add-form">
          <label>Job name
            <input type="text" id="jobName" placeholder="Job name" required value="${esc(addJobDraftField("name"))}">
          </label>
          <label class="job-estimate-label-group">
            <span class="small muted" id="jobEstBreakdown">0 hrs = 0 hrs 0 min</span>
            Estimate (hrs)
            <input type="number" id="jobEst" required min="0.01" step="0.01" value="${esc(addJobDraftField("estimate"))}">
          </label>
          <label>Add minutes
            <input type="number" id="jobEstMinutes" min="0" step="1" placeholder="e.g. 45">
          </label>
          <label>Priority
            <select id="jobPriority" aria-label="Priority">
              ${priorityOptionsMarkup(addJobPriorityDefault)}
            </select>
          </label>
          <label>Charge rate ($/hr)
            <input type="number" id="jobCharge" placeholder="200.00" min="0" step="0.01" value="${esc(addJobDraftField("charge", "200"))}">
          </label>
          <label>Cost rate ($/hr)
            <input type="number" id="jobCostRate" placeholder="45.00" min="0" step="0.01" value="${esc(addJobDraftField("costRate", "45"))}">
          </label>
          <label>Material
            <input type="text" id="jobMaterial" placeholder="Material" list="jobMaterialOptions" value="${esc(addJobDraftField("material"))}">
          </label>
          <label>Material cost ($)
            <input type="number" id="jobMaterialCost" placeholder="0.00" min="0" step="0.01" value="${esc(addJobDraftField("materialCost"))}">
          </label>
          <label>Material quantity
            <input type="number" id="jobMaterialQty" placeholder="0.00" min="0" step="0.01" value="${esc(addJobDraftField("materialQty"))}">
          </label>
          <label>Start date
            <input type="date" id="jobStart" required value="${esc(addJobDraftField("start", defaultJobDateISO))}">
          </label>
          <label>Due date
            <input type="date" id="jobDue" required value="${esc(addJobDraftField("due", defaultJobDateISO))}">
          </label>
          <label>Project #
            <input type="text" id="jobProjectNumber" placeholder="Project #" inputmode="numeric" maxlength="8" required value="${esc(addJobDraftField("projectNumber"))}">
          </label>
          <div class="job-category-field">
            <label for="jobCategory">Category</label>
            <select id="jobCategory" aria-label="Category" required>
              ${categoryOptionsMarkup(addJobCategoryDefault, { includeCreateOption: true })}
            </select>
            <p class="small muted job-category-hint" id="jobCategoryHint" aria-live="polite">
              Choose a category to keep jobs organized. We'll save it under All Jobs if you skip this step.
            </p>
          </div>
          <div class="job-add-actions">
            <button type="button" id="jobFilesBtn">Attach Files</button>
            <button type="button" id="jobOneDriveLibraryAddBtn">Add from this computer OneDrive folder</button>
            <button type="submit">Add Job</button>
          </div>
          <input type="file" id="jobFiles" multiple style="display:none">
          <datalist id="jobMaterialOptions">${materialInventoryOptionsMarkup}</datalist>
        </form>
        <div class="small muted job-files-summary" id="jobFilesSummary">${pendingSummary}</div>
      </section>

      <div class="job-category-indicator-wrapper">
        <button type="button" class="job-flow-open" data-job-flow-open aria-haspopup="dialog" aria-controls="jobFlowModal">Project flow chart</button>
        <div class="job-main-category job-category-indicator" data-category-color="1"${selectedCategoryColorStyle}>
          <span class="job-main-category-label">Viewing</span>
          <div class="job-category-indicator-selectwrap">
            <label class="sr-only" for="jobCategoryFilterSelect">Viewing cutting jobs category</label>
            <select
              id="jobCategoryFilterSelect"
              class="job-category-indicator-select job-main-category-name"
              aria-label="${esc(categoryFilterAriaLabel)}"
              title="${esc(categoryFilterAriaLabel)}"
            >
              ${categoryOptionsMarkup(selectedCategory)}
            </select>
          </div>
        </div>
      </div>
      ${activeFilterNotice}

      <table class="job-table"${jobTableOverlapAttr}>
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
      <div class="job-flow-modal-backdrop" id="jobFlowModal" hidden>
        <div class="job-flow-modal" role="dialog" aria-modal="true" aria-labelledby="jobFlowModalTitle" tabindex="-1">
          <div class="job-note-modal-header">
            <h4 id="jobFlowModalTitle">Cutting Project Flow Chart</h4>
            <button type="button" class="job-note-modal-close" data-job-flow-close aria-label="Close flow chart">×</button>
          </div>
          <div class="job-flow-toolbar">
            <select id="jobFlowGrouping" aria-label="Group flow chart by">
              <option value="categoryTree">Category tree</option>
              <option value="project">Projects</option>
              <option value="job">Jobs</option>
            </select>
            <input type="search" id="jobFlowFilter" placeholder="Filter by material, date, cut length, file name">
            <label><input type="checkbox" id="jobFlowHidePreviews"> Hide previews</label>
          </div>
          <div class="job-flow-chart" id="jobFlowChart"></div>
        </div>
      </div>
      <div class="job-note-modal-backdrop" id="jobOneDriveModal" hidden>
        <div class="job-note-modal" role="dialog" aria-modal="true" aria-labelledby="jobOneDriveModalTitle" aria-describedby="jobOneDriveModalDescription">
          <div class="job-note-modal-header">
            <h4 id="jobOneDriveModalTitle">OneDrive shared-folder setup</h4>
            <button type="button" class="job-note-modal-close" data-onedrive-cancel aria-label="Close OneDrive setup">×</button>
          </div>
          <div class="job-note-modal-body">
            <p id="jobOneDriveModalDescription" class="job-note-modal-description small muted">Attach files from this computer's synced OneDrive root folder. Each computer can map a different local path to the same shared folder and the app will verify folder identity.</p>
            <ol class="job-onedrive-steps small">
              <li><strong>Step 1:</strong> Click <strong>Set this computer root folder</strong> and pick your synced shared OneDrive folder.</li>
              <li><strong>Step 2:</strong> Save setup for this computer only (it does not copy to other computers).</li>
              <li><strong>Step 3:</strong> Use <strong>Add from this computer OneDrive folder</strong> when attaching files.</li>
            </ol>
            <div class="job-onedrive-status-grid small muted" data-onedrive-status-grid>
              <div>Root setup: <span data-onedrive-connection-status>Not set</span></div>
              <div>Folder status: <span data-onedrive-folder-status>Not ready</span></div>
              <div>This computer root: <span data-onedrive-root-status>Not set</span></div>
              <div>This computer ID: <span data-onedrive-device-status>Not set</span></div>
              <div>Indexed files: <span data-onedrive-library-status>0</span></div>
            </div>
                        <div class="job-onedrive-sync-actions">
              <button type="button" class="job-note-modal-secondary" id="jobOneDriveRootPickerBtn">Set this computer root folder</button>
            </div>
            <label class="job-edit-note">Folder label (optional)
              <input type="text" id="jobOneDriveFolderHint" placeholder="Shop drawings" value="${esc(oneDriveConfig.folderHint || "")}">
            </label>
            <label class="job-edit-note">
              <input type="checkbox" id="jobOneDriveEnabled" ${oneDriveConfig.enabled ? "checked" : ""}> Enable OneDrive linking for cutting jobs
            </label>
          </div>
          <div class="job-note-modal-actions">
            <button type="button" class="job-note-modal-secondary" data-onedrive-cancel>Cancel</button>
            <button type="button" class="job-note-modal-primary" data-onedrive-save>Save setup</button>
          </div>
        </div>
      </div>

      <div class="job-naming-modal-backdrop" id="jobNamingModal" hidden>
        <div class="job-naming-modal" role="dialog" aria-modal="true" aria-labelledby="jobNamingModalTitle" tabindex="-1">
          <div class="job-note-modal-header">
            <h4 id="jobNamingModalTitle">File Naming Widget</h4>
            <button type="button" class="job-note-modal-close" data-naming-close aria-label="Close naming widget">×</button>
          </div>
          <div class="job-naming-modal-body">
            <iframe src="naming-widget.html" title="File naming widget" loading="lazy"></iframe>
          </div>
        </div>
      </div>
      <div class="job-note-modal-backdrop" id="jobNoteModal" hidden>
        <div class="job-note-modal" role="dialog" aria-modal="true" aria-labelledby="jobNoteModalTitle" aria-describedby="jobNoteModalDescription">
          <div class="job-note-modal-header">
            <h4 id="jobNoteModalTitle">Job notes</h4>
            <button type="button" class="job-note-modal-close" data-note-cancel aria-label="Close notes">×</button>
          </div>
          <div class="job-note-modal-body">
            <p id="jobNoteModalDescription" class="job-note-modal-description small muted">Add or review notes for the selected cutting job; they stay linked to the job record for future reference.</p>
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
        <div class="past-jobs-category">
          <label class="sr-only" for="jobHistoryCategoryFilter">Viewing past jobs category</label>
          <div class="past-jobs-category-control">
            <select
              id="jobHistoryCategoryFilter"
              class="job-category-indicator-select"
              aria-label="${esc(historyCategoryFilterAriaLabel)}"
              title="${esc(historyCategoryFilterAriaLabel)}"
            >
              ${categoryOptionsMarkup(historyCategory)}
            </select>
            <span aria-hidden="true" class="past-jobs-category-caret">▾</span>
          </div>
        </div>
        <div class="past-jobs-search mini-form">
          <input type="search" id="jobHistorySearch" placeholder="Search past jobs by name, material, notes, or date" value="${historySearchDisplay}">
          <button type="button" id="jobHistorySearchClear">Clear</button>
        </div>
      </div>
      <div class="small muted past-jobs-hint">Results update as you type.</div>
      ${historyCategoryNotice}
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

function getNormalizedInventoryFolders(){
  const folders = Array.isArray(window.inventoryFolders) ? window.inventoryFolders : [];
  const seenIds = new Set();
  const normalized = folders
    .filter(folder => folder && folder.id != null)
    .map(folder => ({
      ...folder,
      id: String(folder.id),
      parent: folder.parent != null ? String(folder.parent) : null,
      name: String(folder.name || "Folder")
    }))
    .filter(folder => {
      if (seenIds.has(folder.id)) return false;
      seenIds.add(folder.id);
      return true;
    })
    .map(folder => ({
      ...folder,
      parent: (folder.parent && seenIds.has(String(folder.parent)) && String(folder.parent) !== folder.id)
        ? String(folder.parent)
        : null
    }));

  const folderMap = new Map(normalized.map(folder => [String(folder.id), folder]));
  normalized.forEach(folder => {
    const folderId = String(folder.id);
    let cursor = folder.parent != null ? String(folder.parent) : null;
    if (!cursor) return;
    const seen = new Set([folderId]);
    while (cursor){
      if (seen.has(cursor)){
        folder.parent = null;
        return;
      }
      seen.add(cursor);
      const parentFolder = folderMap.get(cursor);
      if (!parentFolder) return;
      cursor = parentFolder.parent != null ? String(parentFolder.parent) : null;
    }
  });

  return normalized;
}

function inventoryFolderOptionsMarkup(selectedId, { includeCurrent = null, allowRoot = true } = {}){
  const esc = (str)=> String(str ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const folders = getNormalizedInventoryFolders();
  const selected = selectedId != null ? String(selectedId) : "";
  const current = includeCurrent != null ? String(includeCurrent) : null;
  const options = [];
  if (allowRoot){
    options.push(`<option value="" ${selected ? "" : "selected"}>Root</option>`);
  }
  folders
    .filter(folder => folder && folder.id != null && (current == null || String(folder.id) !== current))
    .sort((a, b)=> String(a.name || "").localeCompare(String(b.name || "")))
    .forEach(folder => {
      const id = String(folder.id);
      options.push(`<option value="${esc(id)}" ${id === selected ? "selected" : ""}>${esc(folder.name || "Unnamed folder")}</option>`);
    });
  return options.join("");
}

function inventoryRowsHTML(list){
  if (!Array.isArray(list) || !list.length){
    return `<tr><td colspan="10" class="muted">No inventory items match your search.</td></tr>`;
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
    <tr draggable="true" data-inventory-item-row="${i.id}">
      <td><button type="button" class="inventory-name-btn" data-inventory-maintenance="${i.id}">${nameDisplay}</button></td>
      <td><input type="number" min="0" step="1" data-inv="qtyNew" data-id="${i.id}" value="${qtyNewDisplay}"></td>
      <td><input type="number" min="0" step="1" data-inv="qtyOld" data-id="${i.id}" value="${qtyOldDisplay}"></td>
      <td>${i.unit||"pcs"}</td>
      <td>${i.pn||"—"}</td>
      <td>${i.link ? `<a href="${i.link}" target="_blank" rel="noopener">link</a>` : "—"}</td>
      <td><input type="number" step="0.01" min="0" data-inv="price" data-id="${i.id}" value="${priceDisplay}"></td>
      <td><input type="text" data-inv="note" data-id="${i.id}" value="${i.note||""}"></td>
      <td><select data-item-folder="${i.id}">${inventoryFolderOptionsMarkup(i.folderId)}</select></td>
      <td class="inventory-actions">
        <button type="button" class="inventory-add" data-order-add="${i.id}">Add to order request</button>
        <button type="button" class="inventory-delete" data-inventory-delete="${i.id}">Delete</button>
      </td>
    </tr>`;
  }).join("");
}


function formatMaterialThicknessDisplay(raw){
  const txt = String(raw ?? "").trim();
  if (!txt) return "";
  const cleaned = txt.replace(/"/g, "").trim();
  const mixed = cleaned.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed){
    const whole = Number(mixed[1]);
    const top = Number(mixed[2]);
    const bot = Number(mixed[3]);
    if (Number.isFinite(whole) && Number.isFinite(top) && Number.isFinite(bot) && bot > 0){
      const six = Math.round((whole + (top / bot)) * 16);
      if (typeof formatThicknessSixteenths === "function") return `${formatThicknessSixteenths(six)}"`;
    }
  }
  const frac = cleaned.match(/^(\d+)\/(\d+)$/);
  if (frac){
    const top = Number(frac[1]);
    const bot = Number(frac[2]);
    if (Number.isFinite(top) && Number.isFinite(bot) && bot > 0){
      const six = Math.round((top / bot) * 16);
      if (typeof formatThicknessSixteenths === "function") return `${formatThicknessSixteenths(six)}"`;
    }
  }
  const num = Number(cleaned);
  if (Number.isFinite(num) && num > 0){
    const six = Math.round(num * 16);
    if (typeof formatThicknessSixteenths === "function") return `${formatThicknessSixteenths(six)}"`;
  }
  return txt;
}

function materialSheetTableHTML(model, typeId){
  const esc = (str)=> String(str ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const type = (Array.isArray(model?.types) ? model.types : []).find(t => String(t.id) === String(typeId));
  if (!type) return "";
  const sheet = model?.sheets?.[typeId] || { columns:["qty"], rows:[{ thickness:"", values:[""] }] };
  const columns = Array.isArray(sheet.columns) && sheet.columns.length ? sheet.columns : ["qty"];
  const rows = Array.isArray(sheet.rows) && sheet.rows.length ? sheet.rows : [{ thickness:"", values: columns.map(()=>"") }];
  return `
    <div class="material-sheet-wrap">
      <table class="inventory-table material-grid-table">
        <thead>
          <tr>
            <th class="material-header material-editable" data-material-editable="1" data-edit-kind="material-name" data-type-id="${esc(typeId)}">${esc(type.name || "Material")}</th>
            ${columns.map((col, idx)=>`<th class="material-header material-editable" data-material-editable="1" data-edit-kind="column" data-type-id="${esc(typeId)}" data-col-index="${idx}">${esc(col || "")}</th>`).join("")}
            <th class="material-col-actions material-edit-controls ${window.inventoryMaterialEditMode ? "" : "is-hidden"}"><button type="button" class="small" data-material-col-add="${esc(typeId)}">+C</button></th>
          </tr>
          <tr class="material-col-control-row material-edit-controls ${window.inventoryMaterialEditMode ? "" : "is-hidden"}">
            <th>Actions</th>
            ${columns.map((_, idx)=>`<th>
              <button type="button" class="tiny" data-material-col-add-after="${esc(typeId)}" data-col-index="${idx}" title="Insert column after this">+C</button>
              <button type="button" class="tiny danger" data-material-col-delete-index="${esc(typeId)}" data-col-index="${idx}" title="Delete this column">−C</button>
            </th>`).join("")}
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, rowIdx)=>`
            <tr>
              <td class="material-editable" data-material-editable="1" data-edit-kind="thickness" data-type-id="${esc(typeId)}" data-row-index="${rowIdx}">${esc(formatMaterialThicknessDisplay(row.thickness || ""))}</td>
              ${columns.map((_, colIdx)=>`<td class="material-editable" data-material-editable="1" data-edit-kind="cell" data-type-id="${esc(typeId)}" data-row-index="${rowIdx}" data-col-index="${colIdx}">${esc((row.values && row.values[colIdx]) || "")}</td>`).join("")}
              <td class="material-row-actions material-edit-controls ${window.inventoryMaterialEditMode ? "" : "is-hidden"}">
                <button type="button" class="tiny" data-material-row-add-after="${esc(typeId)}" data-row-index="${rowIdx}" title="Insert row below">+R</button>
                <button type="button" class="tiny danger" data-material-row-delete="${esc(typeId)}" data-row-index="${rowIdx}" title="Delete this row">−R</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div class="material-grid-actions material-edit-controls ${window.inventoryMaterialEditMode ? "" : "is-hidden"}">
        <button type="button" class="small" data-material-row-add="${esc(typeId)}">+ Row</button>
      </div>
      <div class="small muted">Double-click any table cell/header to edit.</div>
    </div>`;
}

function viewInventoryMaterial(model){
  const esc = (str)=> String(str ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const activeType = String(model?.activeType || '');
  const types = Array.isArray(model?.types) ? model.types : [];
  const body = activeType === "__all"
    ? types.map(type => materialSheetTableHTML(model, type.id)).join("")
    : materialSheetTableHTML(model, activeType);
  return `
    <div class="inventory-material-view">
      <div class="inventory-toolbar">
        <button type="button" class="inventory-add-trigger" id="materialEditModeBtn">${window.inventoryMaterialEditMode ? "✓ Editing table" : "Edit table"}</button>
        <button type="button" class="inventory-add-trigger" id="materialAddTypeBtn">+ Add material type</button>
        <label class="material-type-select-wrap">Material
          <select id="materialTypeSelect">
            <option value="__all" ${activeType === "__all" ? "selected" : ""}>View all materials</option>
            ${types.map(type => `<option value="${esc(type.id)}" ${String(type.id)===activeType?'selected':''}>${esc(type.name)}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="material-table-wrap">${body}</div>
    </div>`;
}

function viewInventory(){
  const filteredSource = filterInventoryItems(inventorySearchTerm);
  const seenInventoryIds = new Set();
  const filtered = filteredSource.filter(item => {
    if (!item || typeof item !== "object") return false;
    const id = item.id != null ? String(item.id) : "";
    if (!id) return false;
    if (seenInventoryIds.has(id)) return false;
    seenInventoryIds.add(id);
    return true;
  });
  const section = String(window.inventorySection || "items") === "material" ? "material" : "items";
  const materialModel = normalizeInventoryMaterials(window.inventoryMaterials);
  const folders = getNormalizedInventoryFolders();
  const validFolderIds = new Set(folders.map(folder => String(folder.id)));
  const folderUiState = window.inventoryFolderUiState && typeof window.inventoryFolderUiState === "object"
    ? window.inventoryFolderUiState
    : {};
  const esc = (str)=> String(str ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const childrenOf = (parentId)=>{
    const target = parentId == null ? "" : String(parentId);
    return folders.filter(folder => String(folder?.parent ?? "") === target);
  };
  const itemsIn = (folderId)=>{
    const target = folderId == null ? "" : String(folderId);
    return filtered.filter(item => {
      const rawFolderId = item?.folderId != null ? String(item.folderId) : "";
      const normalizedFolderId = rawFolderId && validFolderIds.has(rawFolderId) ? rawFolderId : "";
      return normalizedFolderId === target;
    });
  };

  const renderFolder = (folder)=>{
    const folderId = String(folder.id);
    const subFolders = childrenOf(folderId).map(renderFolder).join("");
    const folderItemsList = itemsIn(folderId);
    const folderItems = folderItemsList.length
      ? inventoryRowsHTML(folderItemsList)
      : `<tr><td colspan="10" class="muted">No parts in this folder.</td></tr>`;
    const isOpen = folderUiState[folderId] !== false;
    return `
      <details class="inventory-folder" data-folder-drop-target="${esc(folderId)}" ${isOpen ? "open" : ""}>
        <summary>
          <span>📁 ${esc(folder.name || "Unnamed folder")}</span>
          <div class="inventory-folder-options" data-folder-options>
            <button type="button" class="inventory-folder-options-trigger" data-folder-options-trigger="${esc(folderId)}" aria-expanded="false" aria-haspopup="true">Options</button>
            <div class="inventory-folder-options-menu" role="menu" hidden>
              <button type="button" data-inventory-subfolder="${esc(folderId)}" role="menuitem">+ Folder</button>
              <button type="button" data-inventory-folder-rename="${esc(folderId)}" role="menuitem">Rename</button>
              <button type="button" class="danger" data-inventory-folder-delete="${esc(folderId)}" role="menuitem">Delete</button>
              <label>Move folder to
                <select data-folder-parent="${esc(folderId)}">${inventoryFolderOptionsMarkup(folder.parent, { includeCurrent: folderId })}</select>
              </label>
            </div>
          </div>
        </summary>
        <table class="inventory-table"><tbody>${folderItems}</tbody></table>
        <div class="small muted">Drop parts here to move into this folder</div>
        <div class="inventory-folder-children">${subFolders}</div>
      </details>`;
  };

  const rootFolders = childrenOf(null).map(renderFolder).join("");
  const rootItems = itemsIn(null);
  const rootItemsRows = inventoryRowsHTML(rootItems);
  const searchValue = String(inventorySearchTerm || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `
  <div class="container">
    <div class="block" style="grid-column:1 / -1">
      <h3>Inventory</h3>
      <div class="inventory-section-tabs">
        <button type="button" data-inventory-section="material" class="${section === "material" ? "active" : ""}">Material</button>
        <button type="button" data-inventory-section="items" class="${section === "items" ? "active" : ""}">Items</button>
      </div>
      ${section === "material" ? viewInventoryMaterial(materialModel) : `
      <div class="inventory-toolbar">
        <button type="button" class="inventory-add-trigger" id="inventoryAddBtn">+ Add inventory item</button>
        <button type="button" class="inventory-add-trigger" id="inventoryAddFolderBtn">+ Add folder</button>
        <div class="inventory-search mini-form">
          <input type="search" id="inventorySearch" placeholder="Search items, part numbers, notes, or links" value="${searchValue}">
          <button type="button" id="inventorySearchClear">Clear</button>
        </div>
      </div>
      <div class="small muted inventory-hint">Results update as you type. Organize folders like a file explorer.</div>
      <div class="inventory-explorer" data-inventory-rows>
        <details class="inventory-folder" data-folder-drop-target="" ${folderUiState.__root__ === false ? "" : "open"}>
          <summary><span>🗂️ Root</span></summary>
          <table class="inventory-table">
            <thead><tr><th>Item</th><th>Qty (New)</th><th>Qty (Old)</th><th>Unit</th><th>PN</th><th>Link</th><th>Price</th><th>Note</th><th>Folder</th><th>Actions</th></tr></thead>
            <tbody>${rootItemsRows}</tbody>
          </table>
          <div class="small muted">Drop parts here to move to root</div>
          <div class="inventory-folder-children">${rootFolders}</div>
        </details>
      </div>`}
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
            <label>Folder<select name="inventoryFolderId">${inventoryFolderOptionsMarkup(null)}</select></label>
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
