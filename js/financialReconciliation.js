(function(root, factory){
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OMAXFinancialReconciliation = api;
})(typeof window === "undefined" ? null : window, function(){
  "use strict";
  const ranges = Object.freeze([
    {key:"7d", label:"1W", days:7}, {key:"30d", label:"1M", days:30},
    {key:"90d", label:"3M", days:90}, {key:"182d", label:"6M", days:182},
    {key:"365d", label:"1Y", days:365}, {key:"all", label:"All-Time", days:null}
  ].map(Object.freeze));
  function dateKey(value){
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;
    const key = value.slice(0,10), parsed = new Date(key + "T00:00:00Z");
    return Number.isFinite(+parsed) && parsed.toISOString().slice(0,10) === key
      && (value.length === 10 || Number.isFinite(Date.parse(value))) ? key : null;
  }
  const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
  function period(key = "all", today = localToday()){
    const option = ranges.find(item => item.key === key) || ranges.at(-1);
    const endISO = dateKey(today);
    if (!endISO) throw new Error("A valid financial analysis date is required.");
    let startISO = null;
    if (option.days){
      const start = new Date(endISO + "T00:00:00Z");
      start.setUTCDate(start.getUTCDate() - option.days + 1);
      startISO = start.toISOString().slice(0,10);
    }
    return {key:option.key, label:option.label, startISO, endISO,
      description:startISO ? `${startISO} to ${endISO} (inclusive)` : `All-Time through ${endISO}`};
  }
  const present = value => value != null && value !== "";
  // Match the canonical helper's numeric acceptance and fallback order exactly.
  const valid = (value, nonnegative = false) => present(value) && Number.isFinite(Number(value)) && (!nonnegative || Number(value) >= 0);
  const inPeriod = (key, window) => key && key <= window.endISO && (!window.startISO || key >= window.startISO);
  const finiteSum = (rows, read) => { const value = rows.reduce((sum,row) => sum + read(row),0); return Number.isFinite(value) ? value : null; };
  function issuesFor(job, profit){
    const issues = [];
    const flag = (code, message) => issues.push({code, message});
    if (!valid(job.estimateHours,true)) flag("missing_hours", "Hours Taken missing/invalid; canonical calculation uses 0.");
    else if (profit.hours === 0) flag("zero_hours", "Hours Taken is explicitly zero.");
    for (const [field,label,nonnegative] of [["chargeRate","Charge rate",true],["costRate","Runtime expense rate",false]]){
      if (!valid(job[field],nonnegative)){
        if (valid(job.efficiency?.[field],nonnegative)) flag(`stored_${field}`, `${label} uses the stored efficiency rate.`);
        else flag(`default_${field}`, `${label} missing/invalid; canonical default ${field === "chargeRate" ? profit.chargeRate : profit.costRate}/hr used.`);
      }
    }
    if (profit.chargeRate === 0) flag("zero_charge", "Effective charge rate is zero.");
    if (profit.costRate === 0) flag("zero_cost", "Effective runtime expense rate is zero.");
    if (!valid(job.materialCost,true)) flag("missing_material_cost", "Material unit cost missing/invalid; canonical calculation uses 0.");
    if (!valid(job.materialQty,true)) flag("missing_material_qty", "Material quantity missing/invalid; canonical calculation uses 0.");
    if (!valid(job.failurePercent)) flag("missing_failure", "Failed-cut percentage unknown; canonical calculation uses 0%.");
    else if (Number(job.failurePercent)<0 || Number(job.failurePercent)>100) flag("clamped_failure", "Failed-cut percentage is outside 0–100; canonical calculation clamps it.");
    if (job.id == null || String(job.id).trim() === "") flag("missing_identity", "Stable job ID missing; row retained without an invented business identity.");
    const provenance = job.importProvenance || {}, source = provenance.sourceRecord || provenance;
    for (const [field,label] of [["charge_rate_per_hr","Charge rate"],["cost_rate_per_hr","Runtime expense rate"]]){
      if (Object.hasOwn(source,field) && !present(source[field])) flag(`import_${field}`, `${label} was blank in the import source; stored rate may be an importer default.`);
    }
    if ((job.import_event_id || job.importProvenance) && issues.length) flag("incomplete_import", "Imported job has incomplete/defaulted financial evidence.");
    if (valid(job.efficiency?.gainLoss) && Math.abs(Number(job.efficiency.gainLoss)-profit.totalProfit)>0.005)
      flag("stale_legacy", "Stored legacy gain/loss differs; canonical net is used.");
    return issues;
  }
  function previousCardEligibility(job, index){
    // Reproduce the old Data Center mapping BEFORE applying its three checks.
    // Blank names received a fallback; truthy whitespace/non-string names did not.
    const completedISO = typeof job.completedAtISO === "string" && job.completedAtISO ? job.completedAtISO : "";
    const completedDateISO = completedISO ? String(completedISO).slice(0,10) : "";
    const name = job.name || `Completed job ${index + 1}`;
    const settingsLink = job.id != null ? `#/settings?jobId=${encodeURIComponent(String(job.id))}` : "";
    const reasons = [];
    if (!(typeof completedDateISO === "string" && completedDateISO.trim().length > 0)) reasons.push("old card required completion-date text");
    if (!(typeof name === "string" && name.trim().length > 0)) reasons.push("old card required a nonempty text name");
    if (!(typeof settingsLink === "string" && /^#\/settings\?jobId=/.test(settingsLink))) reasons.push("no settings-link requirement");
    return {included:reasons.length === 0,reason:reasons.join("; "),completedDateISO};
  }
  function selectJobs(jobs, {profit, range = "all", today} = {}){
    if (typeof profit !== "function") throw new Error("The canonical Cutting Job profit helper is required.");
    const window = period(range,today), entries = [], identities = new Map();
    for (const [index,job] of (Array.isArray(jobs) ? jobs : []).entries()){
      if (!job || typeof job !== "object" || Array.isArray(job)) continue;
      const financial = profit(job), completionDate = dateKey(job.completedAtISO);
      const finite = ["hours","chargeRate","costRate","revenue","revenueLost","adjustedRevenue","cuttingCost","materialExpense","totalProfit"]
        .every(key => Number.isFinite(financial[key]));
      const reason = !completionDate ? "Invalid or missing completion date" : completionDate>window.endISO ? "Future completion date"
        : !inPeriod(completionDate,window) ? "Outside selected period" : !finite ? "Non-finite financial result" : "";
      const entry = {job,index,id:job.id ?? null,name:job.name || "Untitled job",completionDate,
        profit:financial,finite,included:!reason,reason,issues:issuesFor(job,financial)};
      entries.push(entry);
      if (job.id != null) identities.set(String(job.id),(identities.get(String(job.id)) || 0)+1);
    }
    // Never merge cuts by project/name/date or deduplicate identities while reading.
    for (const entry of entries) if (entry.id != null && identities.get(String(entry.id))>1)
      entry.issues.push({code:"repeated_identity",message:"Repeated stable ID in loaded records; each row retained for review."});
    const rows = entries.filter(row=>row.included), excluded = entries.filter(row=>!row.included);
    const total = key => finiteSum(rows,row=>row.profit[key]);
    const net = total("totalProfit");
    const totals = {count:rows.length,positive:rows.filter(row=>row.profit.totalProfit>0).length,
      negative:rows.filter(row=>row.profit.totalProfit<0).length,zero:rows.filter(row=>row.profit.totalProfit===0).length,
      grossRevenue:total("revenue"),failureReduction:total("revenueLost"),revenue:total("adjustedRevenue"),
      runtimeExpense:total("cuttingCost"),materialExpense:total("materialExpense"),net,
      average:net == null ? null : rows.length ? net/rows.length : 0};
    const warnings = new Map();
    for (const row of rows) for (const issue of row.issues){
      const group = warnings.get(issue.code) || {code:issue.code,message:issue.message,count:0};
      group.count++; warnings.set(issue.code,group);
    }
    const oldEligibility = new Map(entries.map(row=>[row,previousCardEligibility(row.job,row.index)]));
    const oldRows = entries.filter(row=>oldEligibility.get(row).included)
      .sort((a,b)=>oldEligibility.get(b).completedDateISO.localeCompare(oldEligibility.get(a).completedDateISO));
    // The old card counted eligible non-finite rows but skipped their net in its sum.
    const oldNet = finiteSum(oldRows,row=>Number.isFinite(row.profit.totalProfit) ? row.profit.totalProfit : 0);
    const oldSet = new Set(oldRows);
    const populationChanges = entries.filter(row=>oldSet.has(row)!==row.included).map(row=>({...row,
      change:row.included ? `Added: ${oldEligibility.get(row).reason}` : row.reason}));
    return {window,rows,excluded,entries,totals,warnings:[...warnings.values()],
      largestLosses:rows.filter(row=>row.profit.totalProfit<0).slice().sort((a,b)=>a.profit.totalProfit-b.profit.totalProfit).slice(0,10),
      previousAllTime:{count:oldRows.length,net:oldNet},populationChanges};
  }
  function expenses(window, maintenanceRows = [], purchaseWeeks = [], purchaseFinancials){
    const maintenance = {count:0,recordedInputs:0,estimated:0,incomplete:0,parts:0,modeledLabor:0,knownSubtotal:0};
    for (const row of maintenanceRows){
      if (!inPeriod(dateKey(row.dateISO),window)) continue;
      maintenance.count++;
      if (row.costIncomplete || !Number.isFinite(row.totalCost) || row.totalCost<0){ maintenance.incomplete++; continue; }
      if (row.costEstimated !== false) maintenance.estimated += row.totalCost;
      else maintenance.recordedInputs += row.totalCost;
      maintenance.parts += Number.isFinite(row.partCost) ? row.partCost : 0;
      maintenance.modeledLabor += Number.isFinite(row.laborCost) ? row.laborCost : 0;
    }
    maintenance.knownSubtotal = maintenance.recordedInputs + maintenance.estimated;
    const purchases = {count:0,total:0,incomplete:0,invalidDates:0};
    for (const week of purchaseWeeks) for (const row of Array.isArray(week?.rows) ? week.rows : []){
      if (!row || !String(row.purchased || "").trim()) continue;
      const key = dateKey(row.date);
      if (!key){purchases.invalidDates++;continue;}
      if (!inPeriod(key,window)) continue;
      if (typeof purchaseFinancials !== "function" || !valid(row.cost,true) || !valid(row.qty,true)
        || [row.shipping,row.tax].some(value=>present(value) && !valid(value,true))){purchases.incomplete++;continue;}
      const value = purchaseFinancials(row).totalSpend;
      if (!Number.isFinite(value)){purchases.incomplete++;continue;}
      purchases.count++; purchases.total += value;
    }
    for (const key of ["recordedInputs","estimated","parts","modeledLabor","knownSubtotal"])
      if (!Number.isFinite(maintenance[key])) maintenance[key] = null;
    if (!Number.isFinite(purchases.total)) purchases.total = null;
    return {maintenance,purchases};
  }
  function build({completedJobs,profit,range,today,maintenanceRows,purchaseWeeks,purchaseFinancials,forecast = {}}){
    const jobs = selectJobs(completedJobs,{profit,range,today});
    const costs = expenses(jobs.window,maintenanceRows,purchaseWeeks,purchaseFinancials);
    return {...jobs,...costs,forecast:{annual:Number.isFinite(forecast.annual)?forecast.annual:null,
      remaining:Number.isFinite(forecast.remaining)?forecast.remaining:null,year:forecast.year,
      method:forecast.method,sourceWindow:forecast.sourceWindow},
      netWaterjetImpact:null,coverageReason:"Runtime cost rates can already include maintenance and garnet. Saved job rates do not establish expense composition or complete revenue/cost coverage; purchases and event costs may overlap. A reliable combined result is unavailable."};
  }
  return Object.freeze({ranges,dateKey,localToday,period,selectJobs,expenses,build});
});
