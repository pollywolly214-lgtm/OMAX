"use strict";
// Offline, read-only audit. Output may contain private business evidence: keep local.
// Usage: node scripts/costdata-01e-audit.cjs <export.json> [YYYY-MM-DD] > <local-report.json>
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const api=require("../js/financialReconciliation");
function canonicalProfit(){
  const root=path.resolve(__dirname,".."),core=fs.readFileSync(path.join(root,"js/core.js"),"utf8"),context={};
  for(const key of ["JOB_RATE_PER_HOUR","JOB_BASE_COST_PER_HOUR"]){
    const match=core.match(new RegExp("const "+key+" = ([0-9.]+);"));
    if(!match)throw Error("Canonical default unavailable: "+key);context[key]=Number(match[1]);
  }
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,"js/computations.js"),"utf8"),context);
  return context.computeCuttingJobProfit;
}
function population(input){
  const state=input.state || input.data || input;
  if(Array.isArray(state.completedCuttingJobs))return {jobs:state.completedCuttingJobs,complete:true,revision:state.syncMeta?.rev??null};
  if(Array.isArray(input.jobs))return {jobs:input.jobs,complete:input.count===input.jobs.length,reportedCount:input.count,revision:input.revision??null};
  if(Array.isArray(input))return {jobs:input,complete:null,revision:null};
  if(Array.isArray(input.sourceRecords))return {jobs:input.sourceRecords.map(row=>({...row,id:row.id??row.stableID,import_event_id:row.import_event_id??row.importID})),
    complete:input.totalCompletedJobs===input.sourceRecords.length,reportedCount:input.totalCompletedJobs,revision:input.revision??null};
  throw Error("Expected a state export with completedCuttingJobs, a job array, or a jobs/sourceRecords audit export.");
}
async function analyze(input,today=api.localToday()){
  const before=JSON.stringify(input),loaded=population(input),profit=canonicalProfit();
  const report=api.build({completedJobs:loaded.jobs,profit,range:"all",today});
  const audit=await api.verifySources(report.audit),review=api.reviewSourcePairs(audit);
  const included=new Set(report.rows.map(row=>row.index));
  const rows=audit.rows.map(row=>({...row,issues:report.entries.find(entry=>entry.index===row.index)?.issues || [],included:included.has(row.index)}));
  const pairIndexes=audit.duplicateGroups.flatMap(group=>group.possiblePairs);
  const pairs=review.pairs.map((pair,pairIndex)=>{
    const indexes=pairIndexes[pairIndex];
    const [left,right]=indexes.map(index=>rows.find(row=>row.index===index));
    return {...pair,leftRecord:left,rightRecord:right,
      hypotheticalIfDuplicate:{removeLeftNetChange:-left.modeledNet,removeRightNetChange:-right.modeledNet,
        note:"Alternative one-record removals, never additive. Negative contributions can mean duplication depresses the total. No invoice or corrected cost is inferred."}};
  });
  const scenarios=[];
  for(const status of ["confirmed","unresolved"])for(const family of ["CUTPDF","616-CUT"]){
    const eligible=pairs.filter(pair=>status==="confirmed" ? pair.review.status==="confirmed" : ["possible","insufficient"].includes(pair.review.status));
    const confirmedIds=new Set(pairs.filter(pair=>pair.review.status==="confirmed").flatMap(pair=>[pair.left,pair.right]));
    const ids=[...new Set(eligible.flatMap(pair=>[pair.leftRecord,pair.rightRecord])
      .filter(row=>row.family===family && row.included && (status==="confirmed" || !confirmedIds.has(row.id))).map(row=>row.id))];
    scenarios.push({sourceStatus:status,family,
      note:status==="confirmed" ? "Alternative removal of one import family for source-linked entries; historical rate/material correctness remains unverified."
        : "Uncertain family-removal hypothesis, not confirmed duplicates or a recommended correction; matching alternatives may represent separate cuts.",
      preview:api.previewExclusions(audit,ids)});
  }
  if(JSON.stringify(input)!==before)throw Error("Audit changed its input.");
  return {readOnly:true,today,revision:loaded.revision,populationComplete:loaded.complete,reportedPopulation:loaded.reportedCount??loaded.jobs.length,
    limitation:loaded.complete===true ? "Export snapshot only; not a live Firebase read or invoice verification."
      : "Partial or unverified population: these totals cannot reconcile the complete live population.",
    totals:report.totals,evidence:report.modelEvidence,rows,excluded:report.excluded.map(row=>({index:row.index,id:row.id,reason:row.reason})),
    duplicateGroups:audit.duplicateGroups.length,sourceReview:review.counts,sourceCoverage:audit.sourceVerification.coverage,pairs,scenarios};
}
if(require.main===module){
  if(!process.argv[2]){console.error("Usage: node scripts/costdata-01e-audit.cjs <export.json> [YYYY-MM-DD]");process.exitCode=1;}
  else analyze(JSON.parse(fs.readFileSync(process.argv[2],"utf8")),process.argv[3]).then(report=>console.log(JSON.stringify(report,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
module.exports={analyze,population};
