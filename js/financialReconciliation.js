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
    if (profit.duration?.usedRecorded) flag("resolved_duration", `Zero/missing financial hours resolved from ${profit.duration.source}; original estimateHours preserved.`);
    else if (!valid(job.estimateHours,true)) flag("missing_hours", "Hours Taken missing/invalid; no supported actual duration, so calculation uses 0.");
    else if (profit.hours === 0) flag("zero_hours", "Hours Taken is explicitly zero.");
    if (profit.duration?.issues.length) flag("duration_conflict",profit.duration.issues.join(" "));
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
    const financialAudit = audit(jobs,{profit});
    const duplicateIndexes = new Set(financialAudit.duplicateGroups.flatMap(group=>group.rows.map(row=>row.index)));
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
      if (duplicateIndexes.has(index)) entry.issues.push({code:"possible_cross_import_duplicate",message:"Possible CUTPDF / 616-CUT duplicate; included without merging or exclusion. Review the Cutting Jobs audit."});
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
    const oldNet = finiteSum(oldRows,row=>{ const previous=profit(row.job,{durationMode:"estimate"}).totalProfit; return Number.isFinite(previous) ? previous : 0; });
    const oldSet = new Set(oldRows);
    const populationChanges = entries.filter(row=>oldSet.has(row)!==row.included).map(row=>({...row,
      change:row.included ? `Added: ${oldEligibility.get(row).reason}` : row.reason}));
    return {window,rows,excluded,entries,totals,warnings:[...warnings.values()],audit:financialAudit,
      largestLosses:rows.filter(row=>row.profit.totalProfit<0).slice().sort((a,b)=>a.profit.totalProfit-b.profit.totalProfit).slice(0,10),
      previousAllTime:{count:oldRows.length,net:oldNet},populationChanges};
  }
  function audit(jobs,{profit} = {}){
    if (typeof profit!=="function") throw new Error("The canonical Cutting Job profit helper is required.");
    const rows=[];
    for (const [index,job] of (Array.isArray(jobs) ? jobs : []).entries()){
      if (!job || typeof job!=="object" || Array.isArray(job)) continue;
      const modeled=profit(job),original=profit(job,{durationMode:"estimate"});
      const source=job.importProvenance?.sourceRecord || job.importProvenance || {};
      const importId=String(job.import_event_id || source.import_event_id || "");
      const family=/^616-CUT(?:-|$)/i.test(importId) ? "616-CUT" : /^CUTPDF(?:-|$)/i.test(importId) ? "CUTPDF" : "Other / manual";
      let duration=modeled.duration || {originalHours:original.hours,hours:modeled.hours,usedRecorded:false,issues:[],evidence:[]};
      const recorded=duration.evidence.filter(item=>item.source!=="Imported actual_cut_minutes / 60").some(item=>item.hours>0)
        || valid(job.actualHours,true) && Number(job.actualHours)>0
        || (Array.isArray(job.manualLogs) && job.manualLogs.some(log=>valid(log?.completedHours,true) && Number(log.completedHours)>0));
      if (!dateKey(job.completedAtISO)) duration={...duration,issues:[...duration.issues,"Missing/invalid completion date; actual time is not substituted."],
        evidence:valid(job.actualHours,true) ? [{source:"actualHours (completion date unresolved)",hours:Number(job.actualHours)}] : duration.evidence};
      rows.push({index,id:job.id ?? null,name:job.name || "Untitled job",named:typeof job.name==="string" && !!job.name.trim(),cutNumber:job.cutNumber ?? "",importId,family,
        date:dateKey(job.completedAtISO),suppliedDate:job.completedAtISO,project:String(job.projectNumber ?? source.project_number ?? "").trim().toUpperCase(),
        sourceDate:source.completed_date ?? "",sourceName:source.job_name ?? "",provenance:job.importProvenance || null,
        duration,zeroWithActual:duration.originalHours===0 && recorded,
        originalNet:original.totalProfit,modeledNet:modeled.totalProfit,
        netChange:Number.isFinite(modeled.totalProfit-original.totalProfit) ? modeled.totalProfit-original.totalProfit : null,
        materialExpense:modeled.materialExpense,materialUnitCost:modeled.materialCost,materialQty:modeled.materialQty,
        chargeRate:modeled.chargeRate,costRate:modeled.costRate,failurePercent:modeled.failurePercent});
    }
    const buckets=new Map();
    for (const row of rows){
      if (row.family==="Other / manual" || !row.date || !row.project || row.duration.issues.length || !(row.duration.actualCandidate>0)) continue;
      const key=JSON.stringify([row.date,row.project]);
      if (!buckets.has(key)) buckets.set(key,[]);
      buckets.get(key).push(row);
    }
    const duplicateGroups=[];
    for (const bucket of buckets.values()){
      const edges=new Map(),pairs=[];
      for (let i=0;i<bucket.length;i++) for (let j=i+1;j<bucket.length;j++){
        const a=bucket[i],b=bucket[j];
        if (a.family===b.family || Math.abs(a.duration.actualCandidate-b.duration.actualCandidate)>0.000001) continue;
        pairs.push([a.index,b.index]);
        for (const [left,right] of [[a,b],[b,a]]){ if (!edges.has(left.index)) edges.set(left.index,new Set()); edges.get(left.index).add(right.index); }
      }
      const seen=new Set();
      for (const id of edges.keys()){
        if (seen.has(id)) continue;
        const ids=new Set(),pending=[id];
        while (pending.length){const next=pending.pop();if (ids.has(next)) continue;ids.add(next);seen.add(next);pending.push(...edges.get(next));}
        const members=bucket.filter(row=>ids.has(row.index)),cutpdf=members.filter(row=>row.family==="CUTPDF").length,excel=members.length-cutpdf;
        const nameKey=value=>String(value).trim().replace(/\s+/g," ").toLowerCase();
        const oneToOne=cutpdf===1 && excel===1 && members.every(row=>row.named) && nameKey(members[0].name)===nameKey(members[1].name);
        duplicateGroups.push({rows:members,cutpdf,excel,oneToOne,pairingUpperBound:Math.min(cutpdf,excel),
          possiblePairs:pairs.filter(pair=>pair.every(index=>ids.has(index))),
          differentMaterial:members.some(row=>!Number.isFinite(row.materialExpense) || Math.abs(row.materialExpense-members[0].materialExpense)>0.005
            || Math.abs(row.materialUnitCost-members[0].materialUnitCost)>0.005 || row.materialQty!==members[0].materialQty),
          modeledNet:finiteSum(members,row=>row.modeledNet)});
      }
    }
    const byImport=Object.fromEntries(["CUTPDF","616-CUT","Other / manual"].map(family=>[family,{
      candidates:rows.filter(row=>row.family===family && row.zeroWithActual).length,
      resolved:rows.filter(row=>row.family===family && row.duration.usedRecorded).length}]));
    return {readOnly:true,count:rows.length,rows,byImport,
      zeroWithActual:rows.filter(row=>row.zeroWithActual).length,resolved:rows.filter(row=>row.duration.usedRecorded).length,
      durationConflicts:rows.filter(row=>row.duration.issues.length).length,
      unresolvedZero:rows.filter(row=>row.zeroWithActual && !row.duration.usedRecorded).length,
      originalNet:finiteSum(rows,row=>row.originalNet),modeledNet:finiteSum(rows,row=>row.modeledNet),netChange:finiteSum(rows,row=>row.netChange ?? NaN),
      duplicateGroups,pairingUpperBound:duplicateGroups.reduce((sum,group)=>sum+group.pairingUpperBound,0)};
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
  function rateEvidence(job, field){
    const nonnegative = field === "chargeRate";
    const source = valid(job[field],nonnegative) ? "Saved job rate"
      : valid(job.efficiency?.[field],nonnegative) ? "Stored legacy efficiency rate" : "Canonical fallback";
    const supplied = source === "Saved job rate" ? job[field] : source === "Stored legacy efficiency rate" ? job.efficiency[field] : null;
    const original = job.importProvenance?.sourceRecord || job.importProvenance;
    const key = field === "costRate" ? "cost_rate_per_hr" : "charge_rate_per_hr";
    return {source,supplied,imported:!!(job.import_event_id || job.importProvenance),
      importValue:original && Object.hasOwn(original,key) ? original[key] : null,
      importBlank:!!original && Object.hasOwn(original,key) && !present(original[key])};
  }
  function rateAnalysis(rows, profit, totals){
    const hours = finiteSum(rows,row=>row.profit.hours), groups = new Map();
    const evidence = rows.map(row=>({...row,costEvidence:rateEvidence(row.job,"costRate"),chargeEvidence:rateEvidence(row.job,"chargeRate")}));
    for (const row of evidence){
      const key = `${row.profit.costRate}|${row.costEvidence.source}`;
      const group = groups.get(key) || {rate:row.profit.costRate,source:row.costEvidence.source,count:0,hours:0,runtimeExpense:0,net:0};
      group.count++; group.hours+=row.profit.hours; group.runtimeExpense+=row.profit.cuttingCost; group.net+=row.profit.totalProfit;
      groups.set(key,group);
    }
    return {hours,weightedCostRate:hours>0 && totals.runtimeExpense!=null ? totals.runtimeExpense/hours : null,
      weightedChargeRate:hours>0 && totals.grossRevenue!=null ? totals.grossRevenue/hours : null,
      rows:evidence,groups:[...groups.values()].sort((a,b)=>b.runtimeExpense-a.runtimeExpense),
      aboveCharge:rows.filter(row=>row.profit.costRate>row.profit.chargeRate*(1-row.profit.failurePercent/100)).length,
      imported:evidence.filter(row=>row.costEvidence.imported).length,
      comparison:{rate:45,runtimeExpense:hours==null ? null : hours*45,
        net:finiteSum(rows,row=>profit({...row.job,costRate:45}).totalProfit)}};
  }
  function coverage(jobs,costs,currentRate){
    const blockers = [];
    const ratedJobs = jobs.rows.filter(row=>row.profit.costRate>0).length;
    if (ratedJobs) blockers.push(`${ratedJobs} job(s) have nonzero runtime rates without saved component/allocation evidence. Runtime cost rates can already include maintenance and garnet; the current CCR formula cannot prove historical composition.`);
    if (costs.purchases.count || costs.purchases.incomplete || costs.purchases.invalidDates)
      blockers.push(`Purchase spending is not allocated to consumed garnet, maintenance parts, job material or inventory. Adding it may duplicate runtime/material costs; ${costs.purchases.incomplete} incomplete and ${costs.purchases.invalidDates} undated row(s) also need review.`);
    if (costs.maintenance.count)
      blockers.push(`Maintenance event costs may overlap saved runtime rates. Labor is modeled at $30/hr; ${costs.maintenance.estimated ? "some costs use configured defaults; " : ""}${costs.maintenance.incomplete} incomplete event(s) have no full cost.`);
    blockers.push("Loaded job revenue is modeled, not a reconciled invoice/payment ledger. Coverage of electricity, water, disposal and other operating expenses is not established by the maintenance-plus-garnet CCR formula.");
    return {interimNet:jobs.totals.net,blockers,
      resolution:"Reconcile invoices and operating expenses for this period, document each saved rate's components and effective dates, and allocate consumed purchases/event costs against those components. Only verified additional expenses can then be added without duplication.",
      currentCCR:currentRate ? {valid:currentRate.valid===true,startDate:currentRate.startDate,endDate:currentRate.endDate,
        measurementStartDate:currentRate.measurementStartDate,measurementEndDate:currentRate.measurementEndDate,
        hours:currentRate.actualCuttingHours,maintenance:currentRate.maintenanceCostPerHour,garnet:currentRate.garnetCostPerHour,
        total:currentRate.cutCostPerHour,warnings:currentRate.warnings || []} : null};
  }
  function build({completedJobs,profit,range,today,maintenanceRows,purchaseWeeks,purchaseFinancials,currentRate,forecast = {}}){
    const jobs = selectJobs(completedJobs,{profit,range,today});
    const costs = expenses(jobs.window,maintenanceRows,purchaseWeeks,purchaseFinancials);
    const financialCoverage = coverage(jobs,costs,currentRate);
    return {...jobs,...costs,rateAnalysis:rateAnalysis(jobs.rows,profit,jobs.totals),coverage:financialCoverage,
      forecast:{annual:Number.isFinite(forecast.annual)?forecast.annual:null,
      remaining:Number.isFinite(forecast.remaining)?forecast.remaining:null,year:forecast.year,
      method:forecast.method,sourceWindow:forecast.sourceWindow},
      // No loaded record currently proves cost composition and complete ledger coverage.
      netWaterjetImpact:null,coverageReason:financialCoverage.blockers.join(" ")};
  }
  return Object.freeze({ranges,dateKey,localToday,period,selectJobs,expenses,build,audit});
});
