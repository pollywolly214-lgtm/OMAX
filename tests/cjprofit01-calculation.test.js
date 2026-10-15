"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const views = fs.readFileSync("js/views.js", "utf8").replace(/\r\n/g, "\n");
function section(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
}
function harness() {
  const c = vm.createContext({ JOB_RATE_PER_HOUR:200, JOB_BASE_COST_PER_HOUR:45 });
  vm.runInContext(section(views, "  const resolveActualHours =", "  const pendingFiles =") +
    (section(views, "  const resolveActualHours =", "  const pendingFiles =").includes("const resolveChargeRate =") ? "" :
      section(views, "  const resolveChargeRate =", "  const completedStats =")) +
    ";this.total = computeJobNetTotal;this.charge = resolveChargeRate;this.cost = resolveCostRate;", c);
  return c;
}
const fixture = (extra = {}) => ({ id:"same-job", chargeRate:150, costRate:-60, estimateHours:9, actualHours:2,
  materialCost:500, materialQty:3, cat:"project", projectNumber:"0000", cutNumber:"C041",
  cutDateISO:"2026-10-05", cutOrderWithinDay:2, files:[{fileId:"retained"}],
  importProvenance:{sourceRowNumber:7}, efficiency:{chargeRate:999, costRate:999, actualHours:99, netRate:999}, ...extra });
for (const [chargeRate, costRate, actualHours, rate, total] of [
  [150,-60,2,90,180], [200,-80,0.5,120,60], [100,-25,1.5,75,112.5], [150,-60,2.8,90,252]
]) test(`charge ${chargeRate}, expense ${costRate}, ${actualHours} hr yields ${total}`, () => {
  const c = harness();
  for (const historical of [false,true]) for (const sign of [-1,1]) {
    const job = fixture({chargeRate, costRate:sign*Math.abs(costRate), actualHours,
      ...(historical ? {completedAtISO:"2026-10-06"} : {})});
    assert.equal(c.charge(job) + c.cost(job), rate);
    assert.equal(c.cost(job), costRate);
    assert.ok(Math.abs(c.total(job, job.efficiency) - total) < 1e-9);
  }
});
test("edits recalculate from authoritative inputs; refresh retains result and unrelated fields", () => {
  const job = fixture(), c = harness(), before = structuredClone(job);
  assert.equal(c.total(job, job.efficiency), 180);
  job.chargeRate = 200; assert.equal(c.total(job, job.efficiency), 280);
  job.costRate = -80; assert.equal(c.total(job, job.efficiency), 240);
  job.actualHours = .5; assert.equal(c.total(job, job.efficiency), 60);
  const edited = structuredClone(job);
  assert.equal(harness().total(JSON.parse(JSON.stringify(job)), job.efficiency), 60);
  assert.deepEqual(job, edited, "rendering must not mutate or persist the job");
  for (const key of Object.keys(before).filter(key => !["chargeRate","costRate","actualHours"].includes(key)))
    assert.deepEqual(job[key], before[key], key);
});
test("zero actual time stays zero; missing actual time uses existing estimate fallback", () => {
  const c = harness();
  assert.equal(c.total(fixture({actualHours:0}), {actualHours:8}), 0);
  assert.equal(c.total(fixture({actualHours:null, estimateHours:.5}), {}), 45);
  assert.equal(c.total(fixture({actualHours:null, estimateHours:9}), {actualHours:1.5}), 135);
});
test("missing rates use stored efficiency values, but blank/null rates do not become zero", () => {
  const c = harness();
  for (const value of [undefined,null,""]) {
    const job = fixture({chargeRate:value, costRate:value, efficiency:{chargeRate:150, costRate:-60}});
    assert.equal(c.total(job, job.efficiency), 180);
  }
});
test("active/history labels and history totals use the same formula", () => {
  const c = harness(), job = fixture();
  vm.runInContext(section(views, "  const formatCurrency =", "  const formatHours ="), c);
  c.j = job; c.job = job; c.eff = job.efficiency;
  const active = section(views, "    // Material totals", "    // Remaining & per-day");
  const history = section(views.slice(views.indexOf("  const completedRows =")),
    "    const matCost =", "    const startDate =");
  for (const body of [active, "const netTotal = computeJobNetTotal(job, eff);" + history]) {
    const result = vm.runInContext("(()=>{" + body + ";return {costDisplay,netDisplay,netTotalDisplay};})()", c);
    assert.equal(result.costDisplay, "-$60.00/hr");
    assert.equal(result.netDisplay, "+$90.00/hr");
    assert.equal(result.netTotalDisplay, "+$180.00");
  }
  c.completedFiltered = [job, {...job,id:"second"}];
  c.computeJobEfficiency = job => job.efficiency;
  vm.runInContext(section(views, "  const completedStats =", "  const prioritySchedule =") +
    ";this.average = completedAverageMetrics;", c);
  assert.equal(c.average.netRate,90); assert.equal(c.average.costRate,-60); assert.equal(c.average.netTotal,180);
});
