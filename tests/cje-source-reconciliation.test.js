"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto').webcrypto;
const api=require('../js/financialReconciliation'),sources=require('../js/cuttingJobSourceEvidence'),{sourceJob,june29}=require('./fixtures/cje-source-evidence');
const context=vm.createContext({JOB_RATE_PER_HOUR:250,JOB_BASE_COST_PER_HOUR:30});vm.runInContext(fs.readFileSync('js/computations.js','utf8'),context);
const profit=context.computeCuttingJobProfit,audit=(jobs,options={})=>api.audit(jobs,{profit,today:'2026-10-21',...options});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
test('verified source catalog is explicitly limited to the two supplied pages and 24 entries',()=>{
  assert.equal(sources.catalog.entries.length,24);assert.equal(sources.catalog.pages,2);
  assert.match(sources.catalog.coverage,/original Cut tracker.pdf bytes were not supplied/);
  assert.equal(sources.catalog.sha256,'e5a6f3f069ed8f1c5e9a18ef4af505ce8b14167a549f45f22b24b61f96376f1c');
});
test('June 29 V1/V2/V3 map to distinct physical entries: two duplicate imports and four disproven cross-pairings',async()=>{
  const r=await api.verifySources(audit(june29())),review=api.reviewSourcePairs(r);
  assert.equal(r.duplicateGroups.length,1);assert.equal(r.pairingUpperBound,2);
  assert.deepEqual(review.counts,{confirmed:2,possible:0,separate:4,insufficient:0});
  for(const p of review.pairs)assert.equal(p.review.status,p.left.at(-1)===p.right.at(-1) ? 'confirmed' : 'separate');
  assert.equal(r.sourceVerification.rows[2].entry.id,'p2-cut3');
});
test('full retained source text supports linkage after safe quote/fraction/whitespace normalization',async()=>{
  const a=sourceJob('CUTPDF',1),b=sourceJob('616-CUT',1);
  a.importProvenance.source_text='1251 atm person door V1 3/16 304 stainless 6 1/2"X46" 12MIN';
  const r=await api.verifySources(audit([a,b]));assert.equal(api.reviewSourcePairs(r).counts.confirmed,1);
});
test('equal names, dates, hours and material costs without complete source text never confirm a duplicate',async()=>{
  const jobs=[sourceJob('CUTPDF',1),sourceJob('616-CUT',1)];jobs.forEach(job=>delete job.importProvenance.source_text);
  const r=await api.verifySources(audit(jobs));assert.deepEqual(api.reviewSourcePairs(r).counts,{confirmed:0,possible:0,separate:0,insufficient:1});
  for(const field of ['completed_date','project_number','actual_cut_minutes']){
    const records=[sourceJob('CUTPDF',1),sourceJob('616-CUT',1)];delete records[0].importProvenance[field];
    assert.equal(api.reviewSourcePairs(await api.verifySources(audit(records))).counts.insufficient,1);
  }
});
test('later-page retained text is possible, not source-confirmed, even if exactly equal',async()=>{
  const jobs=[sourceJob('CUTPDF',1),sourceJob('616-CUT',1)];jobs.forEach(job=>job.importProvenance.source_text='Later unavailable entry with equal text');
  assert.equal(api.reviewSourcePairs(await api.verifySources(audit(jobs))).counts.possible,1);
});
test('a missing file or unrecognized file cannot establish physical source identity',async()=>{
  for(const file of ['', 'unreviewed.pdf']){
    const jobs=[sourceJob('CUTPDF',1),sourceJob('616-CUT',1)];jobs[0].importProvenance.source_file=file;
    assert.equal(api.reviewSourcePairs(await api.verifySources(audit(jobs))).counts.confirmed,0);
  }
});
test('a physically repeated identical source line is ambiguous, never consolidated by matching text',async()=>{
  const r=audit([sourceJob('CUTPDF',1)]),entry=sources.catalog.entries.find(e=>e.id==='p2-cut1');
  const proof=await sources.verify(r,crypto,{...sources.catalog,entries:[entry,{...entry,id:'another-physical-cut',cut:99}]});
  assert.equal(proof.rows[0].status,'ambiguous');assert.equal(proof.rows[0].entry,undefined);
});
test('June 30 V3 and June 29 V3 remain distinct despite identical full source text and duration',async()=>{
  const a=sourceJob('CUTPDF',3),b=sourceJob('616-CUT',3);b.completedAtISO='2026-06-30';b.importProvenance.completed_date='2026-06-30';
  const r=await api.verifySources(audit([a,b]));assert.equal(r.duplicateGroups.length,0);
  assert.equal(r.sourceVerification.rows[0].entry.id,'p2-cut3');assert.equal(r.sourceVerification.rows[1].entry.id,'p2-cut4');
});
test('contradictory current vs source context withholds confirmation',async()=>{
  const jobs=[sourceJob('CUTPDF',1),sourceJob('616-CUT',1)];jobs.forEach(job=>job.projectNumber='other');
  const r=await api.verifySources(audit(jobs));assert.equal(r.sourceVerification.rows[0].status,'conflict');assert.equal(api.reviewSourcePairs(r).counts.confirmed,0);
});
test('source thickness discrepancies and different material prices are exposed without choosing a price',async()=>{
  const jobs=[sourceJob('CUTPDF',1),sourceJob('616-CUT',1,{materialCost:200})];jobs[1].importProvenance.thickness_inches='1.1875';
  const before=JSON.stringify(jobs),r=await api.verifySources(audit(freeze(jobs)));
  assert.equal(api.reviewSourcePairs(r).counts.confirmed,1);assert.equal(r.duplicateGroups[0].differentMaterial,true);
  assert.match(r.sourceVerification.rows[1].warnings.join(' '),/1.1875 differs.*0.1875/);assert.equal(JSON.stringify(jobs),before);
});
test('blank source rates are labeled importer defaults rather than historical actual rates',()=>{
  const r=audit([sourceJob('CUTPDF',1)]);assert.match(r.rows[0].sourceEvidence.rateNote,/Blank source charge cell.*\$200\/hr.*Blank source cost cell.*\$45\/hr/);
});
test('missing source hashing produces unavailable evidence and zero fabricated confirmations',async()=>{
  const r=audit(june29());r.sourceVerification=await sources.verify(r,null);assert.equal(api.reviewSourcePairs(r).counts.confirmed,0);
});
test('an explicit exclusion preview conserves revenue/runtime/material/net and never subtracts purchases or maintenance',()=>{
  const r=freeze(audit(june29())),before=JSON.stringify(r),p=api.previewExclusions(r,['test-CUTPDF-V1']);
  assert.equal(p.hypothetical,true);assert.equal(p.baseline.count,5);assert.equal(p.remaining.count,4);assert.equal(p.excluded.count,1);
  for(const key of ['revenue','runtimeExpense','materialExpense','net'])near(p.baseline[key],p.remaining[key]+p.excluded[key]);
  near(p.excluded.net,40-9-10);near(p.remaining.net,4*21);assert.equal(JSON.stringify(r),before);
});
test('no selections retain every job, including verified separate cuts',async()=>{
  const r=await api.verifySources(audit(june29())),p=api.previewExclusions(r);assert.equal(p.selectedIds.length,0);assert.deepEqual(p.remaining,p.baseline);assert.equal(p.remaining.count,5);
});
test('unknown, missing, repeated and ambiguous stable identities block previews',async()=>{
  const r=audit(june29());for(const ids of [['missing'],[''],['test-CUTPDF-V1','test-CUTPDF-V1'],new Set(['test-CUTPDF-V1'])]){
    const p=api.previewExclusions(r,ids);assert.ok(p.errors.length);assert.equal(p.remaining,null);
  }
  for(const id of [null,'','same']){
    const jobs=[sourceJob('CUTPDF',1,{id}),sourceJob('616-CUT',1,{id})],result=await api.verifySources(audit(jobs));
    assert.equal(api.reviewSourcePairs(result).counts.confirmed,0);assert.ok(api.previewExclusions(result,[id]).errors.length);
  }
});
test('non-candidate IDs cannot be silently excluded and selecting all group representations warns',()=>{
  const jobs=june29();jobs.push({...sourceJob('CUTPDF',1),id:'noncandidate',projectNumber:'other'});
  const r=audit(jobs);assert.ok(api.previewExclusions(r,['noncandidate']).errors.length);
  assert.match(api.previewExclusions(r,june29().map(j=>j.id)).warnings.join(' '),/entire group/);
});
test('preview uses the exact canonical selected period, date boundaries and non-finite eligibility',()=>{
  const jobs=june29();jobs.push(...['2026-10-15','2026-10-21','2026-10-22','invalid'].map((date,i)=>({...sourceJob('CUTPDF',1),id:'date-'+i,completedAtISO:date})));
  jobs.push({...sourceJob('CUTPDF',1),id:'overflow',completedAtISO:'2026-10-21',estimateHours:Number.MAX_VALUE});
  const report=api.selectJobs(jobs,{profit,range:'7d',today:'2026-10-21'}),p=api.previewExclusions(report.audit);
  assert.equal(p.baseline.count,2);assert.deepEqual(p.window,report.window);
  for(const key of ['revenue','runtimeExpense','materialExpense','net'])near(p.baseline[key],report.totals[key]);
  assert.ok(api.previewExclusions(report.audit,['test-CUTPDF-V1']).errors.length);
});
test('preview renderer escapes IDs and errors and displays expenses negative once with no default checks',()=>{
  const c=vm.createContext({window:{OMAXFinancialReconciliation:api}}),src=fs.readFileSync('js/views.js','utf8');
  vm.runInContext(src.slice(src.indexOf('function renderCuttingJobFinancialAudit('),src.indexOf('function renderFinancialBreakdown(')),c);
  const r=audit(june29()),p=api.previewExclusions(r,['<img src=x>']),html=c.renderCuttingJobExclusionPreview(p);
  assert.ok(!html.includes('<img'));assert.match(html,/&lt;img/);assert.match(html,/-\$45\.00/);assert.match(html,/-\$50\.00/);
  assert.ok(!c.renderCuttingJobFinancialAudit(r).includes(' checked'));assert.match(html,/not approved historical results/);
  const overflow=c.renderCuttingJobExclusionPreview({...p,baseline:{...p.baseline,runtimeExpense:null,materialExpense:null}});assert.match(overflow,/Unavailable/);
});
test('source verification and previews leave frozen job records and original audit snapshots unchanged',async()=>{
  const jobs=freeze(june29()),before=JSON.stringify(jobs),r=freeze(audit(jobs)),snapshot=JSON.stringify(r),verified=await api.verifySources(r);
  api.reviewSourcePairs(verified);api.previewExclusions(verified,['test-616-CUT-V1']);
  assert.equal(JSON.stringify(jobs),before);assert.equal(JSON.stringify(r),snapshot);
});
