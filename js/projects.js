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
  const text = value => typeof value === "string" ? value.trim() : "";
  const dateKey = value => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return "";
    const key = value.slice(0,10), date = new Date(`${key}T00:00:00Z`);
    return Number.isFinite(+date) && date.toISOString().slice(0,10) === key ? key : "";
  };
  function duration(job, completed = false){
    const estimate = number(job.estimateHours), actual = number(job.actualHours);
    const provenance = job.importProvenance || {};
    const imported = Boolean(text(job.import_event_id) || Object.keys(provenance).length);
    const result = (hours,source,basis,reason="") => ({hours,hoursSource:source,hoursBasis:basis,durationNote:reason});
    // Active progress and current completed jobs retain the CJPROFIT Hours Taken contract.
    if (!completed || (!imported && estimate !== null && estimate > 0))
      return result(estimate,"estimateHours","stored",estimate === null ? "Hours Taken is missing or invalid." : "");
    // CJI fills actualHours with zero even when actual_cut_minutes was blank.
    // A positive recorded duration is usable; zero needs explicit source evidence.
    const sourceMinutes = number(provenance.actual_cut_minutes);
    if (actual !== null && (actual > 0 || sourceMinutes === 0))
      return result(actual,"actualHours","recorded");
    const logs = Array.isArray(job.manualLogs) ? job.manualLogs : [];
    const end = dateKey(job.completedAtISO);
    if (logs.length){
      const invalid = logs.some(log=>!dateKey(log?.dateISO) || number(log?.completedHours) === null ||
        (end && dateKey(log.dateISO) > end) || (text(log.import_event_id) && text(log.import_event_id) !== text(job.import_event_id)));
      if (invalid) return result(null,"unavailable","unknown","Cutting logs have invalid dates, values or source references.");
      const latest = logs.reduce((date,log)=>dateKey(log.dateISO) > date ? dateKey(log.dateISO) : date,"");
      const values = new Set(logs.filter(log=>dateKey(log.dateISO) === latest).map(log=>number(log.completedHours)));
      // completedHours is a cumulative job-progress snapshot, never an increment to sum.
      if (values.size !== 1) return result(null,"unavailable","unknown","Latest cumulative cutting logs disagree.");
      return result([...values][0],"manualLogs (latest cumulative)","recorded");
    }
    if (estimate !== null && estimate > 0)
      return result(estimate,"estimateHours (historical estimate)","estimated","Historical estimate used; recorded duration is unavailable.");
    return result(null,"unavailable","unknown","Completed cutting duration is missing or unreliable; placeholder zero is not recorded runtime.");
  }
  function financials(job, profit, ambiguous = false, completed = false){
    const resolved = duration(job,completed), {hours} = resolved;
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
    return ambiguous ? {hours:null,hoursSource:"unavailable",hoursBasis:"unknown",durationNote:"Conflicting copies of one Cutting Job ID.",processing:null,material:null,totalCost:null,failurePercent:null,reduction:null,net:null}
      : {...resolved,processing,material,totalCost,failurePercent,reduction,net};
  }
  function potentialOverlap(rows){
    // Same event ID is a review signal too, never permission to suppress another job ID.
    const events = new Set(), signatures = new Map();
    for (const row of rows){
      if (row.importEvent && events.has(row.importEvent)) return true;
      if (row.importEvent) events.add(row.importEvent);
      if (!row.completed || !row.importGroup || row.hoursBasis !== "recorded" || !dateKey(row.date) || !(row.hours > 0) || row.material === null) continue;
      const signature = JSON.stringify([dateKey(row.date),row.hours,row.material]);
      const groups = signatures.get(signature) || new Set();
      groups.add(row.importGroup);signatures.set(signature,groups);
      if (groups.size > 1) return true;
    }
    return false;
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
      projects.push({id,number:key,label:`${key} — ${suffix || key}`,rows:[],issues:[]});
    }
    const byFolder = new Map(projects.map(project=>[project.id,project]));
    const byId = new Map();
    for (const job of jobs){
      const id = String(job.id ?? "").trim();
      if (!id){
        const message = "A Cutting Job has no stable ID and is excluded.";
        issues.push(message);byFolder.get(String(job.cat ?? ""))?.issues.push(message);continue;
      }
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(job);
    }
    for (const [id, copies] of byId){
      const job = copies[0], project = byFolder.get(String(job.cat ?? ""));
      if (!project || copies.some(copy=>String(copy.cat ?? "") !== project.id ||
        (String(copy.projectNumber ?? "").trim() && history.normalizeProjectKey(copy.projectNumber) !== project.number))){
        const message = `Cutting Job ${id}: project/category association needs review; excluded.`;
        issues.push(message);
        for (const cat of new Set(copies.map(copy=>String(copy.cat ?? "")))) byFolder.get(cat)?.issues.push(message);
        continue;
      }
      const ambiguous = copies.some(copy=>stable(copy) !== stable(job));
      const duplicate = copies.length > 1;
      if (duplicate){
        const message = `Cutting Job ${id}: counted once; ${ambiguous ? "conflicting copies have unavailable metrics" : "duplicate lifecycle copies"}. Record navigation needs identity review.`;
        issues.push(message);project.issues.push(message);
      }
      const isCompleted = completed.some(copy=>copy===job || String(copy?.id)===id);
      const importEvent = text(job.import_event_id);
      const provenanceEvent = text(job.importProvenance?.import_event_id);
      const consistentEvent = !provenanceEvent || provenanceEvent === importEvent;
      const importGroup = consistentEvent && /^616-CUT-/i.test(importEvent) ? "616" : consistentEvent && /^CUTPDF-\d{8}-\d{3}$/i.test(importEvent) ? "CUTPDF" : "";
      project.rows.push({id,name:String(job.name || "Untitled job"),cut:root.CuttingJobChronology?.readCutLabel(job) ?? "—",
        date:job.completedAtISO || job.startISO || "—",completed:isCompleted,importEvent,importGroup,
        navigable:!duplicate,...financials(job, profit, ambiguous,isCompleted)});
    }
    for (const project of projects){
      project.rows.sort((a,b)=>String(b.date).localeCompare(String(a.date)) || a.id.localeCompare(b.id));
      const rows = project.rows;
      project.potentialOverlap = potentialOverlap(rows);
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
    const notices = [];
    if (project.potentialOverlap) notices.push("Some historical Cutting Jobs may overlap across imports. All distinct records are currently included in these totals; matching details do not prove the same physical cut.");
    if (m.hours.known < count) notices.push("Some cutting durations are missing or unreliable. Hours and processing costs have incomplete coverage.");
    if (project.success.known < count) notices.push("Some jobs lack reliable failure information. Their failure-adjusted net and failure-related reduction are unavailable.");
    if (project.rows.some(row=>row.hoursBasis === "estimated")) notices.push("Some historical jobs use estimated duration because recorded cutting time is unavailable.");
    notices.push(...project.issues);
    const bases = ["recorded","stored","estimated"].map(basis=>({basis,count:project.rows.filter(row=>row.hours !== null && row.hoursBasis === basis).length}))
      .filter(item=>item.count).map(({basis,count})=>`${count} ${basis === "stored" ? "stored Hours Taken" : basis === "estimated" ? "historical estimates" : "recorded"}`).join(" · ");
    return `${notices.length ? `<div class="project-coverage-notice" role="note">${notices.map(note=>`<p class="small">${esc(note)}</p>`).join("")}</div>` : ""}<div class="project-summary-grid">
      ${card("Cutting Jobs",String(count),`${project.rows.filter(row=>row.completed).length} completed · ${project.rows.filter(row=>!row.completed).length} active; distinct records`)}
      ${card("Total Cutting Hours",m.hours.known || !count ? hours(m.hours.value) : "Unavailable",`${coverage(m.hours)}.${bases ? ` ${bases}.` : ""}`)}
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
      <p class="small muted">Reporting duration uses recorded historical hours where supported; current jobs retain stored Hours Taken. Historical estimate fallbacks are labeled. Material cost is material cost × quantity. Total Cutting Cost includes processing plus estimated material for jobs with both expenses known; it excludes Purchase History and other project expenditure. Missing failure data is not treated as success. Different IDs are never excluded for matching import details.</p>
      <details class="project-jobs"><summary>View Project Cutting Jobs (${count})</summary><div class="project-table-scroll" tabindex="0" role="region" aria-label="Project Cutting Jobs"><table>
        <thead><tr>${["Cut Number","Cutting Job Name","Date (completed / start)","Hours Taken","Processing Cost","Estimated Material Cost","Failure %","Modeled Cut Net"].map(label=>`<th scope="col">${label}</th>`).join("")}</tr></thead>
        <tbody>${project.rows.map(row=>`<tr><td>${esc(row.cut)}</td><td>${row.navigable ? `<button type="button" data-project-job="${esc(row.id)}">${esc(row.name)}</button>` : `${esc(row.name)} <span class="small muted">(ID review required)</span>`}</td><td>${esc(row.date)}</td><td title="${esc(row.durationNote || row.hoursSource)}">${esc(hours(row.hours))}<br><span class="small muted">${esc(row.hoursSource)}</span></td><td>${esc(money(row.processing))}</td><td>${esc(money(row.material))}</td><td>${row.failurePercent === null ? "Unavailable" : `${esc(row.failurePercent)}%`}</td><td class="${netTone(row.net)}">${esc(money(row.net))}</td></tr>`).join("") || '<tr><td colspan="8">No Cutting Jobs are associated with this project.</td></tr>'}</tbody>
      </table></div></details>`;
  }
  root.ProjectDashboard = Object.freeze({build,duration,financials,summary});
  root.renderProjects = function(){
    const content = document.getElementById("content");
    const model = build({jobFolders:root.jobFolders,cuttingJobs:root.cuttingJobs,completedCuttingJobs:root.completedCuttingJobs},root.CuttingJobHistory,computeCuttingJobProfit);
    const selectedId = new URLSearchParams(location.hash.split("?")[1] || "").get("project");
    const selected = model.projects.find(project=>project.id === selectedId);
    content.innerHTML = `<section class="projects-page"><h1>Projects</h1><p class="muted">Waterjet production and modeled cutting performance by project.</p>
      <label class="project-selector" for="projectSelector">Project<input id="projectSelector" type="search" list="projectOptions" autocomplete="off" placeholder="Search project number or name" value="${esc(selected?.label || "")}" aria-describedby="projectSelectorHelp"></label>
      <datalist id="projectOptions">${model.projects.map(project=>`<option value="${esc(project.label)}"></option>`).join("")}</datalist>
      <p id="projectSelectorHelp" class="small muted">${model.projects.length ? "Choose a project from the suggestions. Selection is retained in this page’s URL." : "No projects with verified category ownership are available."}</p>
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
