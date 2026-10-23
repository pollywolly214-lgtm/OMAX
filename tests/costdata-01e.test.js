"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const api=require("../js/financialReconciliation"),{analyze,population}=require("../scripts/costdata-01e-audit.cjs"),{sourceJob,june29}=require("./fixtures/cje-source-evidence");
const context=vm.createContext({JOB_RATE_PER_HOUR:250,JOB_BASE_COST_PER_HOUR:30});vm.runInContext(fs.readFileSync("js/computations.js","utf8"),context);
const profit=context.computeCuttingJobProfit,build=jobs=>api.build({completedJobs:jobs,profit,today:"2026-10-23",range:"all"});
const job=(id,extra={})=>({id,name:"Synthetic cut",completedAtISO:"2026-10-23",estimateHours:1,chargeRate:200,costRate:45,materialCost:10,materialQty:1,failurePercent:0,...extra});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const freeze=value=>{if(value&&typeof value==="object"){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

test("01E contribution evidence partitions top five and remainder without rounding or changing jobs",()=>{
  const jobs=freeze(Array.from({length:7},(_,i)=>job(String(i),{chargeRate:100+i,costRate:0,materialCost:0}))),before=JSON.stringify(jobs),r=build(jobs);
  assert.equal(r.modelEvidence.topFive.net,520);assert.equal(r.modelEvidence.remaining.net,201);assert.equal(r.totals.net,721);
  assert.deepEqual(r.modelEvidence.topContributors.map(row=>row.id),["6","5","4","3","2"]);near(r.modelEvidence.reconciliation.difference,0);
  assert.equal(JSON.stringify(jobs),before);assert.equal(r.netWaterjetImpact,null);
});
test("01E shoe selection is a named subset, not an assertion of sales or a second expense deduction",()=>{
  const r=build([job("shoe",{name:"Shoes",chargeRate:600}),job("other",{name:"Internal bracket",chargeRate:1000}),job("shoe2",{name:"shoes",chargeRate:599.97})]);
  assert.equal(r.modelEvidence.topShoes.count,2);near(r.modelEvidence.topShoes.net,1089.97);near(r.modelEvidence.remainingAfterShoes.net,945);
  near(r.modelEvidence.topShoes.net+r.modelEvidence.remainingAfterShoes.net,r.totals.net);assert.equal(r.rows[0].profit.chargeRate,600);
});
test("01E duplicate, imported and blank-source subsets overlap and never reduce modeled totals",()=>{
  const jobs=freeze([sourceJob("CUTPDF",1),sourceJob("616-CUT",1)]),r=build(jobs),e=r.modelEvidence;
  assert.equal(e.overlappingSubsets,true);assert.equal(e.subsets.potentialDuplicates.count,2);assert.equal(e.subsets.imported.count,2);
  assert.equal(e.subsets.sourceBlankRates.count,2);assert.equal(e.subsets.canonicalFallbackRates.count,0);near(r.totals.net,42);
  near(e.subsets.potentialDuplicates.net,42);near(e.subsets.sourceBlankRates.net,42);assert.equal(r.rows.length,2);
});
test("01E missing failure/material remain warnings while explicit zero retains its distinct evidence",()=>{
  const unknown=job("unknown",{failurePercent:undefined,materialCost:undefined,materialQty:undefined}),zero=job("zero",{failurePercent:0,materialCost:0,materialQty:0});
  const r=build([unknown,zero]);assert.equal(r.modelEvidence.subsets.missingFailure.count,1);assert.equal(r.modelEvidence.subsets.missingMaterial.count,1);
  assert.equal(r.rows[0].profit.failurePercent,0);assert.equal(r.rows[0].profit.materialExpense,0);assert.equal(r.totals.net,310);
  assert.ok(r.rows[0].issues.some(issue=>issue.code==="missing_failure"));assert.equal(r.rows[1].issues.length,0);
  const failed=build([job("failed",{failurePercent:100})]);assert.equal(failed.totals.net,-55);
});
test("01E importer blank rates are saved defaults with original blanks retained, not canonical fallback or invoice evidence",()=>{
  const importer=require("../js/cuttingJobImporter")(),raw=Object.fromEntries(importer.FIELDS.map(field=>[field,""]));
  Object.assign(raw,{import_event_id:"CUTPDF-synthetic",record_status:"completed",job_name:"Synthetic source cut",completed_date:"2026-10-23",actual_cut_minutes:"60",material_cost:"999"});
  const before=JSON.stringify(raw),mapped=importer.map({row:raw,raw,materialName:"A36 steel",categoryId:"synthetic-category",materialResolution:{assumed:true},calculation:{calculatedWeight:12,calculatedMaterialCost:7.25}});
  assert.equal(mapped.chargeRate,200);assert.equal(mapped.costRate,45);assert.equal(mapped.importProvenance.charge_rate_per_hr,"");assert.equal(mapped.importProvenance.cost_rate_per_hr,"");
  assert.equal(mapped.materialCost,7.25);assert.equal(mapped.materialQty,1);assert.equal(mapped.importProvenance.material_cost,"999");assert.equal(mapped.importProvenance.materialWasAssumed,true);
  const r=build([mapped]);assert.equal(r.modelEvidence.subsets.sourceBlankRates.count,1);assert.equal(r.modelEvidence.subsets.canonicalFallbackRates.count,0);near(r.totals.net,147.75);
  assert.equal(JSON.stringify(raw),before);
  const fallback=build([job("fallback",{chargeRate:undefined,costRate:undefined})]);assert.equal(fallback.modelEvidence.subsets.canonicalFallbackRates.count,1);assert.equal(fallback.rows[0].profit.chargeRate,250);assert.equal(fallback.rows[0].profit.costRate,30);
});
test("01E contribution evidence respects the selected population and never counts excluded future jobs",()=>{
  const jobs=[job("included"),job("future",{completedAtISO:"2026-10-24",chargeRate:100000}),job("invalid",{completedAtISO:"invalid"})];
  const r=build(jobs);assert.equal(r.modelEvidence.topFive.count,1);assert.equal(r.modelEvidence.topFive.net,145);assert.equal(r.excluded.length,2);
  const empty=build([]);assert.equal(empty.modelEvidence.topFive.net,0);assert.equal(empty.modelEvidence.remaining.net,0);
});
test("01E positive financial hours can differ from actual time without silently changing the established duration model",()=>{
  const r=build([job("estimate",{estimateHours:2,actualHours:1,chargeRate:600}),job("zero-actual",{estimateHours:2,actualHours:0})]);
  assert.equal(r.rows[0].profit.hours,2);assert.equal(r.rows[0].profit.duration.actualCandidate,1);assert.equal(r.rows[0].profit.totalProfit,1100);
  assert.equal(r.modelEvidence.subsets.durationDifference.count,2);assert.equal(r.rows[1].profit.hours,2);
  assert.equal(build([job("zero-material",{materialCost:0})]).modelEvidence.subsets.zeroMaterial.count,1);
});
test("01E offline audit separates source-confirmed removals, unresolved hypotheses and verified separate pairs",async()=>{
  const records=june29(),unknown=[sourceJob("CUTPDF",1,{id:"unknown-a",projectNumber:"9999"}),sourceJob("616-CUT",1,{id:"unknown-b",projectNumber:"9999"})];
  unknown.forEach(row=>Object.assign(row.importProvenance={...row.importProvenance},{project_number:"9999",source_text:"Unavailable later source"}));
  const input=freeze({completedCuttingJobs:[...records,...unknown],syncMeta:{rev:123}}),before=JSON.stringify(input),r=await analyze(input,"2026-10-23");
  assert.equal(r.populationComplete,true);assert.equal(r.revision,123);assert.deepEqual(r.sourceReview,{confirmed:2,possible:1,separate:4,insufficient:0});
  const confirmed=r.scenarios.find(s=>s.sourceStatus==="confirmed"&&s.family==="CUTPDF");assert.equal(confirmed.preview.selectedIds.length,2);near(confirmed.preview.excluded.net,42);
  const uncertain=r.scenarios.find(s=>s.sourceStatus==="unresolved"&&s.family==="CUTPDF");assert.deepEqual(uncertain.preview.selectedIds,["unknown-a"]);
  assert.equal(r.rows.length,7);assert.equal(JSON.stringify(input),before);assert.equal(r.readOnly,true);
});
test("01E duplicate sensitivity uses signed contribution and alternative removals, without excluding either record",async()=>{
  const r=await analyze([sourceJob("CUTPDF",1,{materialCost:100}),sourceJob("616-CUT",1)],"2026-10-23");
  assert.equal(r.pairs.length,1);assert.equal(r.pairs[0].hypotheticalIfDuplicate.removeLeftNetChange,69);assert.equal(r.pairs[0].hypotheticalIfDuplicate.removeRightNetChange,-21);
  assert.equal(r.rows.length,2);near(r.totals.net,-48);assert.equal(r.populationComplete,null);
});
test("01E partial candidate export is never presented as a complete live reconciliation",async()=>{
  const input={totalCompletedJobs:174,sourceRecords:[sourceJob("CUTPDF",1)]},r=await analyze(input,"2026-10-23");
  assert.equal(r.populationComplete,false);assert.equal(r.reportedPopulation,174);assert.match(r.limitation,/cannot reconcile/);
  assert.throws(()=>population({totals:{count:174}}),/Expected a state export/);
});
test("01E full job export preserves supplied revision and raw records while a count mismatch remains partial",async()=>{
  const input=freeze({revision:123,count:1,jobs:[job("full")]});const r=await analyze(input,"2026-10-23");
  assert.equal(r.revision,123);assert.equal(r.populationComplete,true);assert.equal(r.totals.count,1);
  assert.equal((await analyze({...input,count:174},"2026-10-23")).populationComplete,false);
});
