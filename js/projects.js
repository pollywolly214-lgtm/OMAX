/* Read-only project aggregation. No calculated values are persisted. */
(function(root){
  "use strict";
  const number = (raw, signed = false) => {
    if ((typeof raw !== "number" && typeof raw !== "string") || String(raw).trim() === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) && (signed || value >= 0) ? value : null;
  };
  const stable = value => {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
  };
  function financials(job, profit, ambiguous = false){
    const hours = number(job.estimateHours);
    const rate = (key, signed = false) => number(job[key], signed) ?? number(job.efficiency?.[key], signed);
    const charge = rate("chargeRate"), cost = rate("costRate", true);
    const materialCost = number(job.materialCost), qty = number(job.materialQty);
    const failure = number(job.failurePercent);
    const failurePercent = failure !== null && failure <= 100 ? failure : null;
    const computed = profit({...job,estimateHours:hours,chargeRate:charge,costRate:cost,materialCost,materialQty:qty,failurePercent});
    const finite = value => Number.isFinite(value) ? value : null;
    const processing = hours !== null && cost !== null ? finite(computed.cuttingCost) : null;
    const material = materialCost !== null && qty !== null ? finite(computed.materialExpense) : null;
    const totalCost = processing !== null && material !== null ? finite(processing + material) : null;
    const reduction = hours !== null && charge !== null && failurePercent !== null ? finite(computed.revenueLost) : null;
    const net = totalCost !== null && reduction !== null ? finite(computed.totalProfit) : null;
    return ambiguous ? {hours:null,processing:null,material:null,totalCost:null,failurePercent:null,reduction:null,net:null}
      : {hours,processing,material,totalCost,failurePercent,reduction,net};
  }
  function build(state, history, profit){
    const folders = Array.isArray(state.jobFolders) ? state.jobFolders : [];
    const active = Array.isArray(state.cuttingJobs) ? state.cuttingJobs : [];
    const completed = Array.isArray(state.completedCuttingJobs) ? state.completedCuttingJobs : [];
    const jobs = [...active, ...completed].filter(Boolean), issues = [], projects = [];
    const seenFolders = new Set();
    for (const folder of folders){
      const id = String(folder?.id ?? "");
      if (!id || id === history.ROOT_ID || seenFolders.has(id)) continue;
      seenFolders.add(id);
      const resolved = history.resolveCategoryProject(id, folders, jobs);
      if (!resolved.ok){ issues.push(`${folder.name || id}: ${resolved.reason}`); continue; }
      const key = resolved.projectNumber;
      const name = String(folder.name || "").trim();
      const suffix = history.leadingProject(name) === key ? name.slice(key.length).trim() : name;
      projects.push({id,number:key,label:`${key} — ${suffix || key}`,rows:[]});
    }
    const byFolder = new Map(projects.map(project=>[project.id,project]));
    const byId = new Map();
    for (const job of jobs){
      const id = String(job.id ?? "").trim();
      if (!id){ issues.push("A Cutting Job has no stable ID and is excluded."); continue; }
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(job);
    }
    for (const [id, copies] of byId){
      const job = copies[0], project = byFolder.get(String(job.cat ?? ""));
      if (!project || copies.some(copy=>String(copy.cat ?? "") !== project.id ||
        (String(copy.projectNumber ?? "").trim() && history.normalizeProjectKey(copy.projectNumber) !== project.number))){
        issues.push(`Cutting Job ${id}: project/category association needs review; excluded.`); continue;
      }
      const ambiguous = copies.some(copy=>stable(copy) !== stable(job));
      const duplicate = copies.length > 1;
      if (duplicate) issues.push(`Cutting Job ${id}: counted once; ${ambiguous ? "conflicting copies have unavailable metrics" : "duplicate lifecycle copies"}. Record navigation needs identity review.`);
      project.rows.push({id,name:String(job.name || "Untitled job"),cut:root.CuttingJobChronology?.readCutLabel(job) ?? "—",
        date:job.completedAtISO || job.startISO || "—",completed:completed.some(copy=>copy===job || String(copy?.id)===id),
        navigable:!duplicate,...financials(job, profit, ambiguous)});
    }
    for (const project of projects){
      project.rows.sort((a,b)=>String(b.date).localeCompare(String(a.date)) || a.id.localeCompare(b.id));
      const rows = project.rows;
      const sum = key => {
        const known = rows.filter(row=>row[key] !== null);
        const total = known.reduce((value,row)=>value + row[key],0);
        return {value:Number.isFinite(total) ? total : null,known:known.length,total:rows.length};
      };
      const applicable = rows.filter(row=>row.net !== null);
      const applicableNet = sum("net"), applicableHours = applicable.reduce((value,row)=>value + row.hours,0);
      project.metrics = Object.fromEntries(["hours","processing","material","totalCost","net","reduction"].map(key=>[key,sum(key)]));
      const knownFailures = rows.filter(row=>row.failurePercent !== null);
      project.success = {value:knownFailures.length ? 100 * knownFailures.filter(row=>row.failurePercent === 0).length / knownFailures.length : null,
        known:knownFailures.length,total:rows.length};
      project.averageJob = applicable.length && applicableNet.value !== null ? applicableNet.value / applicable.length : null;
      project.averageHour = applicableHours > 0 && Number.isFinite(applicableHours) && applicableNet.value !== null ? applicableNet.value / applicableHours : null;
      project.applicableHours = Number.isFinite(applicableHours) ? applicableHours : null;
    }
    projects.sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}) || a.id.localeCompare(b.id));
    return {projects,issues};
  }
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const money = value => value === null ? "Unavailable" : new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value);
  const hours = value => value === null ? "Unavailable" : `${value.toLocaleString("en-US",{maximumFractionDigits:2})} hr`;
  const coverage = metric => `${metric.known}/${metric.total} jobs with reliable data${metric.known < metric.total ? "; partial coverage" : ""}`;
  function summary(project){
    if (!project) return '<p class="small muted">Select an existing project to view its cutting performance.</p>';
    const m = project.metrics, count = project.rows.length;
    const card = (label,value,note,tone="") => `<article class="project-metric"><h3>${esc(label)}</h3><strong class="${tone}">${esc(value)}</strong><p class="small muted">${esc(note)}</p></article>`;
    const metric = (label,key,format=money) => card(label,m[key].known || !count ? format(m[key].value) : "Unavailable",coverage(m[key]));
    const netTone = value => value === null || value === 0 ? "" : value > 0 ? "job-finance-positive" : "job-finance-negative";
    const known = m.net.known;
    return `<div class="project-summary-grid">
      ${card("Cutting Jobs",String(count),`${project.rows.filter(row=>row.completed).length} completed · ${project.rows.filter(row=>!row.completed).length} active; distinct records`)}
      ${metric("Total Cutting Hours","hours",hours)}
      ${card("Cut Success Rate",project.success.value === null ? "Unavailable" : `${project.success.value.toFixed(1)}%`,`${coverage(project.success)}. Partial failures count as failure-affected.`)}
      ${metric("Machine Processing Cost","processing")}${metric("Estimated Material Cost","material")}${metric("Total Cutting Cost","totalCost")}
    </div><section class="project-performance" aria-labelledby="projectPerformanceTitle"><h2 id="projectPerformanceTitle">Cutting Financial Performance</h2>
      <p class="small muted">Modeled Cutting Job charges less processing and estimated material expenses, including recorded failure adjustments. These charges may be internal and do not establish external billing or company profit. Partial totals include only jobs with reliable inputs.</p>
      <div class="project-finance-grid">
        ${card("Total Modeled Cut Net",known || !count ? money(m.net.value) : "Unavailable",coverage(m.net),netTone(known ? m.net.value : null))}
        ${card("Average Net per Cutting Job",money(project.averageJob),`${known} applicable jobs with reliable net`,netTone(project.averageJob))}
        ${card("Average Net per Cutting Hour",money(project.averageHour),`${hours(project.applicableHours)} across ${known} applicable jobs`,netTone(project.averageHour))}
        ${metric("Failure-related Net Reduction","reduction")}
      </div></section>
      <p class="small muted">Hours Taken uses the existing Cutting Job duration field. Estimated material cost is material cost × quantity. Total Cutting Cost includes processing plus estimated material for jobs with both expenses known; it excludes Purchase History and other project expenditure. Missing failure data is not treated as success.</p>
      <details class="project-jobs"><summary>View Project Cutting Jobs (${count})</summary><div class="project-table-scroll" tabindex="0" role="region" aria-label="Project Cutting Jobs"><table>
        <thead><tr>${["Cut Number","Cutting Job Name","Date (completed / start)","Hours Taken","Processing Cost","Estimated Material Cost","Failure %","Modeled Cut Net"].map(label=>`<th scope="col">${label}</th>`).join("")}</tr></thead>
        <tbody>${project.rows.map(row=>`<tr><td>${esc(row.cut)}</td><td>${row.navigable ? `<button type="button" data-project-job="${esc(row.id)}">${esc(row.name)}</button>` : `${esc(row.name)} <span class="small muted">(ID review required)</span>`}</td><td>${esc(row.date)}</td><td>${esc(hours(row.hours))}</td><td>${esc(money(row.processing))}</td><td>${esc(money(row.material))}</td><td>${row.failurePercent === null ? "Unavailable" : `${esc(row.failurePercent)}%`}</td><td class="${netTone(row.net)}">${esc(money(row.net))}</td></tr>`).join("") || '<tr><td colspan="8">No Cutting Jobs are associated with this project.</td></tr>'}</tbody>
      </table></div></details>`;
  }
  root.ProjectDashboard = Object.freeze({build,financials,summary});
  root.renderProjects = function(){
    const content = document.getElementById("content");
    const model = build({jobFolders:root.jobFolders,cuttingJobs:root.cuttingJobs,completedCuttingJobs:root.completedCuttingJobs},root.CuttingJobHistory,computeCuttingJobProfit);
    const selectedId = new URLSearchParams(location.hash.split("?")[1] || "").get("project");
    const selected = model.projects.find(project=>project.id === selectedId);
    content.innerHTML = `<section class="projects-page"><h1>Projects</h1><p class="muted">Waterjet production and modeled cutting performance by project.</p>
      <label class="project-selector" for="projectSelector">Project<input id="projectSelector" type="search" list="projectOptions" autocomplete="off" placeholder="Search project number or name" value="${esc(selected?.label || "")}" aria-describedby="projectSelectorHelp"></label>
      <datalist id="projectOptions">${model.projects.map(project=>`<option value="${esc(project.label)}"></option>`).join("")}</datalist>
      <p id="projectSelectorHelp" class="small muted">${model.projects.length ? "Choose a project from the suggestions. Selection is retained in this page’s URL." : "No projects with verified category ownership are available."}</p>
      ${model.issues.length ? `<div class="project-coverage-notice" role="note"><strong>Historical data needs review (${model.issues.length})</strong><p class="small">Unresolved associations are excluded; duplicate IDs are counted once. No source records were changed.</p><ul class="small">${model.issues.map(issue=>`<li>${esc(issue)}</li>`).join("")}</ul></div>` : ""}
      <div id="projectSummary" aria-live="polite">${summary(selected)}</div></section>`;
    const input = document.getElementById("projectSelector"), panel = document.getElementById("projectSummary");
    input.addEventListener("input",()=>{
      const matches = model.projects.filter(project=>project.label === input.value);
      const project = matches.length === 1 ? matches[0] : null;
      panel.innerHTML = summary(project);
      const query = project ? `?project=${encodeURIComponent(project.id)}` : "";
      root.history.replaceState(null,"",`#/projects${query}`);
    });
    panel.addEventListener("click",event=>{
      const button = event.target.closest("[data-project-job]");
      if (button) redirectToCuttingJobPage(button.getAttribute("data-project-job"));
    });
  };
})(typeof window !== "undefined" ? window : globalThis);
