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
    const missingFailure = job.failurePercent == null || (typeof job.failurePercent === "string" && job.failurePercent.trim() === "");
    const failure = number(job.failurePercent);
    const failurePercent = failure !== null && failure <= 100 ? failure : null;
    // Shop reporting convention only: do not write an inferred zero to the record.
    const effectiveFailurePercent = missingFailure ? 0 : failurePercent;
    const computed = profit({...job,estimateHours:hours,chargeRate:charge,costRate:cost,materialCost,materialQty:qty,failurePercent:effectiveFailurePercent});
    const finite = value => Number.isFinite(value) ? value : null;
    const processing = hours !== null && cost !== null ? finite(computed.cuttingCost) : null;
    const material = materialCost !== null && qty !== null ? finite(computed.materialExpense) : null;
    const totalCost = processing !== null && material !== null ? finite(processing + material) : null;
    const unadjustedNet = totalCost !== null && charge !== null ? finite(computed.originalNetProfit) : null;
    const failedHours = hours !== null && effectiveFailurePercent !== null ? finite(hours * (effectiveFailurePercent / 100)) : null;
    const reduction = hours !== null && charge !== null && effectiveFailurePercent !== null ? finite(computed.revenueLost) : null;
    const net = unadjustedNet !== null && reduction !== null ? finite(computed.totalProfit) : null;
    const blankImportRates = [["charge_rate_per_hr",false],["cost_rate_per_hr",true]].some(([key,signed])=>
      Object.prototype.hasOwnProperty.call(job.importProvenance || {},key) && number(job.importProvenance[key],signed) === null);
    const storedRateFallback = (number(job.chargeRate) === null && charge !== null) || (number(job.costRate,true) === null && cost !== null);
    return ambiguous ? {hours:null,hoursSource:"unavailable",hoursBasis:"unknown",durationNote:"Conflicting copies of one Cutting Job ID.",processing:null,material:null,totalCost:null,failurePercent:null,effectiveFailurePercent:null,failedHours:null,missingFailure:false,reduction:null,net:null,unadjustedNet:null,blankImportRates,storedRateFallback}
      : {...resolved,processing,material,totalCost,failurePercent,effectiveFailurePercent,failedHours,missingFailure,reduction,net,unadjustedNet,blankImportRates,storedRateFallback};
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
  function build(state, history, profit, options = {}){
    const includeActive = options.includeActive !== false;
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
      projects.push({id,number:key,label:`${key} — ${suffix || key}`,rows:[],issues:[],includeActive});
    }
    const byFolder = new Map(projects.map(project=>[project.id,project]));
    const byId = new Map();
    for (const job of jobs){
      const id = String(job.id ?? "").trim();
      if (!id){
        if (!includeActive && !completed.includes(job)) continue;
        const message = "A Cutting Job has no stable ID and is excluded.";
        issues.push(message);byFolder.get(String(job.cat ?? ""))?.issues.push(message);continue;
      }
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(job);
    }
    for (const [id, copies] of byId){
      const isCompleted = completed.some(copy=>String(copy?.id)===id);
      if (!includeActive && !isCompleted) continue;
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
      const sum = (key,population=rows) => {
        const known = population.filter(row=>row[key] !== null);
        const total = known.reduce((value,row)=>value + row[key],0);
        return {value:Number.isFinite(total) ? total : null,known:known.length,total:population.length};
      };
      const applicable = rows.filter(row=>row.unadjustedNet !== null);
      const applicableNet = sum("unadjustedNet"), applicableHours = applicable.reduce((value,row)=>value + row.hours,0);
      project.metrics = Object.fromEntries(["hours","failedHours","processing","material","totalCost","unadjustedNet","net","reduction"].map(key=>[key,sum(key)]));
      const deducted = applicable.filter(row=>row.reduction !== null);
      const deduction = deducted.reduce((value,row)=>value + row.reduction,0);
      const provisionalValue = applicableNet.value !== null ? applicableNet.value - deduction : null;
      project.provisional = {value:applicable.length && deducted.length === applicable.length && Number.isFinite(provisionalValue) ? provisionalValue : null,
        deduction:{value:Number.isFinite(deduction) ? deduction : null,known:deducted.length,total:applicable.length}};
      const completedRows = rows.filter(row=>row.completed);
      project.financialScope = {completed:sum("unadjustedNet",completedRows),active:sum("unadjustedNet",rows.filter(row=>!row.completed))};
      const valid = rows.filter(row=>row.failedHours !== null);
      const totalHours = project.metrics.hours.value, failedHours = project.metrics.failedHours.value;
      project.failure = {value:valid.length === rows.length && totalHours > 0 && failedHours !== null ? failedHours / totalHours * 100 : null,
        hours:failedHours,totalHours,known:valid.length,total:rows.length,
        affected:rows.filter(row=>row.effectiveFailurePercent > 0).length,
        invalid:rows.filter(row=>row.effectiveFailurePercent === null).length,
        assumedZero:rows.filter(row=>row.missingFailure).length};
      project.averageJob = applicable.length && applicableNet.value !== null ? applicableNet.value / applicable.length : null;
      project.averageHour = applicableHours > 0 && Number.isFinite(applicableHours) && applicableNet.value !== null ? applicableNet.value / applicableHours : null;
      project.adjustedAverageJob = project.provisional.value !== null ? project.provisional.value / applicable.length : null;
      project.adjustedAverageHour = applicableHours > 0 && Number.isFinite(applicableHours) && project.provisional.value !== null ? project.provisional.value / applicableHours : null;
      project.applicableHours = Number.isFinite(applicableHours) ? applicableHours : null;
    }
    projects.sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}) || a.id.localeCompare(b.id));
    return {projects,issues};
  }
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const money = value => value === null ? "Unavailable" : new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value);
  const hours = (value,digits=2) => value === null ? "Unavailable" : `${value.toLocaleString("en-US",{maximumFractionDigits:digits})} hr`;
  const coverage = metric => `${metric.known}/${metric.total} jobs with reliable data${metric.known < metric.total ? "; partial coverage" : ""}`;
  function summary(project){
    if (!project) return '<p class="small muted">Select an existing project to view its cutting performance.</p>';
    const m = project.metrics, count = project.rows.length;
    const mode = project.includeActive ? "Modeled: includes active projections" : "Completed jobs only";
    const card = (label,value,note,tone="",comparison) => `<article class="project-metric"><h3>${esc(label)}</h3><strong class="${tone}">${esc(value)}</strong>${comparison === undefined ? "" : `<span class="project-no-failures small muted">No failures: ${esc(comparison)}</span>`}<p class="small muted">${esc(note)}</p></article>`;
    const metric = (label,key,format=money) => card(label,m[key].known || (!count && key !== "reduction") ? format(m[key].value) : "Unavailable",`${coverage(m[key])}; ${mode}`);
    const netTone = value => value === null || value === 0 ? "" : value > 0 ? "job-finance-positive" : "job-finance-negative";
    const known = m.unadjustedNet.known;
    const financialCoverage = `${known}/${count} financially eligible jobs${known < count ? "; partial result, not the complete project total" : ""}`;
    const deduction = project.provisional.deduction;
    const notices = [];
    if (project.potentialOverlap) notices.push("Some historical Cutting Jobs may overlap across imports. All distinct records are currently included in these totals; matching details do not prove the same physical cut.");
    if (m.hours.known < count) notices.push("Some cutting durations are missing or unreliable. Hours and processing costs have incomplete coverage.");
    if (known < count) notices.push(`Financial coverage is incomplete: ${known}/${count} included jobs have usable financial inputs. Financial results and their no-failure comparisons cover only that same eligible subset, not the complete project.`);
    if (project.failure.invalid) notices.push(`${project.failure.invalid} included jobs have invalid/ambiguous failure values. These are not treated as zero; the project failure rate is unavailable and financial adjustment coverage may be incomplete.`);
    if (project.rows.some(row=>row.hoursBasis === "estimated")) notices.push("Some historical jobs use estimated duration because recorded cutting time is unavailable.");
    const blankRates = project.rows.filter(row=>row.blankImportRates).length;
    const fallbackRates = project.rows.filter(row=>row.storedRateFallback).length;
    if (blankRates) notices.push(`${blankRates} jobs have blank or invalid original import rate fields. Their available stored rates may be importer defaults or later edits; they are not evidence of actual billing.`);
    if (fallbackRates) notices.push(`${fallbackRates} jobs use available stored efficiency rates because direct rates are unavailable. Missing rates are not invented.`);
    notices.push(...project.issues);
    const bases = ["recorded","stored","estimated"].map(basis=>({basis,count:project.rows.filter(row=>row.hours !== null && row.hoursBasis === basis).length}))
      .filter(item=>item.count).map(({basis,count})=>`${count} ${basis === "stored" ? "stored Hours Taken" : basis === "estimated" ? "historical estimates" : "recorded"}`).join(" · ");
    return `${notices.length ? `<div class="project-coverage-notice" role="note">${notices.map(note=>`<p class="small">${esc(note)}</p>`).join("")}</div>` : ""}<div class="project-summary-grid">
      ${card("Cutting Jobs",String(count),`${project.rows.filter(row=>row.completed).length} completed · ${project.rows.filter(row=>!row.completed).length} active; distinct records`)}
      ${card("Total Cutting Hours",m.hours.known || !count ? hours(m.hours.value) : "Unavailable",`${coverage(m.hours)}; ${mode}.${bases ? ` ${bases}.` : ""} Stored Hours Taken and estimates are not independently verified machine runtime.`)}
      ${card("Cut Failure Rate",project.failure.value === null ? "Unavailable" : project.failure.value === 0 ? "0%" : `${project.failure.value.toFixed(2)}%`,`${hours(project.failure.known ? project.failure.hours : null,3)} failed cutting hours / ${hours(project.failure.totalHours)} included hours. ${project.failure.affected} of ${count} currently failure-affected jobs. ${mode}. ${project.failure.known}/${count} jobs with supported duration and effective failure values${project.failure.known < count ? "; incomplete coverage" : ""}.`)}
      ${metric("Machine Processing Cost","processing")}${metric("Estimated Material Cost","material")}${metric("Total Cutting Cost","totalCost")}
    </div><section class="project-performance" aria-labelledby="projectPerformanceTitle"><h2 id="projectPerformanceTitle">Cutting Financial Performance</h2>
      <p class="small muted">${project.includeActive ? "Selected totals include completed work and active plans; active contributions are projections." : "Selected totals include completed jobs only; historical duration and costs may still include estimates."} Primary figures are failure-adjusted modeled charges less processing and estimated material expenses. Smaller “No failures” figures show the hypothetical result before failure deductions for the same eligible jobs. These are modeled results, not verified company profit or collected revenue.</p>
      <div class="project-finance-grid">
        ${card("Modeled Cut Net",money(project.provisional.value),`Failure-adjusted; ${financialCoverage}`,netTone(project.provisional.value),known || !count ? money(m.unadjustedNet.value) : "Unavailable")}
        ${card("Average Net per Job",money(project.adjustedAverageJob),`Failure-adjusted; ${financialCoverage}`,netTone(project.adjustedAverageJob),money(project.averageJob))}
        ${card("Average Net per Cutting Hour",money(project.adjustedAverageHour),`Failure-adjusted; ${hours(project.applicableHours)} across ${financialCoverage}`,netTone(project.adjustedAverageHour),money(project.averageHour))}
        ${card("Known Failure-Related Reduction",deduction.known && deduction.value !== null ? money(-deduction.value || 0) : "Unavailable",`${coverage(deduction)} among financially eligible jobs; already included in adjusted net`,deduction.value > 0 ? "job-finance-negative" : "")}
      </div>
      <p class="small muted">Failure deductions use the same financially eligible population and are included once in the primary figures. Projects convention: missing/null/blank failure percentages use effective 0%; ${project.failure.assumedZero} included records use this convention. No stored values are changed. Invalid values keep adjusted results unavailable. Material estimates do not verify inventory consumption or Purchase History expenditure.</p></section>
      <p class="small muted">Reporting duration uses recorded historical hours where supported; current jobs retain stored Hours Taken. Historical estimate fallbacks are labeled. Material cost is material cost × quantity. Total Cutting Cost includes processing plus estimated material for jobs with both expenses known; it excludes Purchase History and other project expenditure. Different IDs are never excluded for matching import details.</p>
      <details class="project-jobs"><summary>View Project Cutting Jobs (${count})</summary><div class="project-table-scroll" tabindex="0" role="region" aria-label="Project Cutting Jobs"><table>
        <thead><tr>${["Cut Number","Cutting Job Name","Date (completed / start)","Hours Taken","Processing Cost","Estimated Material Cost","Failure %","Failure-Adjusted Modeled Cut Net"].map(label=>`<th scope="col">${label}</th>`).join("")}</tr></thead>
        <tbody>${project.rows.map(row=>`<tr><td>${esc(row.cut)}</td><td>${row.navigable ? `<button type="button" data-project-job="${esc(row.id)}">${esc(row.name)}</button>` : `${esc(row.name)} <span class="small muted">(ID review required)</span>`}</td><td>${esc(dateKey(row.date) || "—")}</td><td title="${esc(row.durationNote || row.hoursSource)}">${esc(hours(row.hours))}<br><span class="small muted">${esc(row.hoursSource)}${row.completed ? "" : " (active plan)"}</span></td><td>${esc(money(row.processing))}</td><td>${esc(money(row.material))}</td><td>${row.effectiveFailurePercent === null ? "Unavailable (invalid)" : `${esc(row.effectiveFailurePercent)}%${row.missingFailure ? " (reporting default; not recorded)" : ""}`}</td><td><strong class="${netTone(row.net)}">${esc(money(row.net))}</strong><br><span class="small muted">No failures: ${esc(money(row.unadjustedNet))}</span></td></tr>`).join("") || '<tr><td colspan="8">No Cutting Jobs are associated with this project.</td></tr>'}</tbody>
      </table></div></details>`;
  }
  root.ProjectDashboard = Object.freeze({build,duration,financials,summary});
  root.renderProjects = function(){
    const content = document.getElementById("content");
    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    let includeActive = params.get("active") !== "0", selectedId = params.get("project");
    const readModel = () => build({jobFolders:root.jobFolders,cuttingJobs:root.cuttingJobs,completedCuttingJobs:root.completedCuttingJobs},root.CuttingJobHistory,computeCuttingJobProfit,{includeActive});
    let model = readModel();
    const selected = model.projects.find(project=>project.id === selectedId);
    content.innerHTML = `<section class="projects-page"><h1>Projects</h1><p class="muted">Waterjet production and modeled cutting performance by project.</p>
      <label class="project-selector" for="projectSelector">Project<input id="projectSelector" type="search" list="projectOptions" autocomplete="off" placeholder="Search project number or name" value="${esc(selected?.label || "")}" aria-describedby="projectSelectorHelp"></label>
      <datalist id="projectOptions">${model.projects.map(project=>`<option value="${esc(project.label)}"></option>`).join("")}</datalist>
      <p id="projectSelectorHelp" class="small muted">${model.projects.length ? "Choose a project from the suggestions. Selection is retained in this page’s URL." : "No projects with verified category ownership are available."}</p>
      <div class="project-mode"><label class="project-mode-switch"><input type="checkbox" id="projectIncludeActive" ${includeActive ? "checked" : ""}>Include Active Cutting Jobs</label>
        <button type="button" class="project-mode-info" popovertarget="projectModeHelp" aria-label="About including active Cutting Jobs">i</button>
        <div id="projectModeHelp" class="project-mode-help" popover role="note"><p><strong>ON:</strong> Includes completed and active Cutting Jobs. Active jobs may use planned cutting hours and projected costs, so totals are modeled estimates.</p><p><strong>OFF:</strong> Shows completed Cutting Jobs only. This is better for reviewing completed production, although historical cutting hours and costs may still include estimates.</p><button type="button" popovertarget="projectModeHelp" popovertargetaction="hide">Close</button></div>
      </div>
      <div id="projectSummary" aria-live="polite">${summary(selected)}</div></section>`;
    const input = document.getElementById("projectSelector"), panel = document.getElementById("projectSummary");
    const update = (project,preserveExpansion=false) => {
      const expanded = preserveExpansion && panel.querySelector(".project-jobs")?.open;
      panel.innerHTML = summary(project);
      if (expanded && panel.querySelector(".project-jobs")) panel.querySelector(".project-jobs").open = true;
      const query = new URLSearchParams();
      if (project) query.set("project",project.id);
      query.set("active",includeActive ? "1" : "0");
      root.history.replaceState(null,"",`#/projects?${query}`);
    };
    input.addEventListener("input",()=>{
      const matches = model.projects.filter(project=>project.label === input.value);
      const project = matches.length === 1 ? matches[0] : null;
      selectedId = project?.id || null;
      update(project);
    });
    document.getElementById("projectIncludeActive").addEventListener("change",event=>{
      includeActive = event.target.checked;
      model = readModel();
      update(model.projects.find(project=>project.id === selectedId),true);
    });
    panel.addEventListener("click",event=>{
      const button = event.target.closest("[data-project-job]");
      if (button) redirectToCuttingJobPage(button.getAttribute("data-project-job"));
    });
  };
})(typeof window !== "undefined" ? window : globalThis);
