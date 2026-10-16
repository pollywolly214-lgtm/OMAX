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
  vm.runInContext(fs.readFileSync("js/computations.js", "utf8"), c);
  vm.runInContext(section(views, "  const resolveJobHours =", "  const pendingFiles =") +
    ";this.total = computeJobNetTotal;this.charge = resolveChargeRate;this.cost = resolveCostRate;", c);
  return c;
}
const fixture = (extra = {}) => ({ id:"same-job", chargeRate:150, costRate:-60, estimateHours:2, actualHours:0,
  materialCost:5, materialQty:3, cat:"project", projectNumber:"0000", cutNumber:"C041",
  cutDateISO:"2026-10-05", cutOrderWithinDay:2, files:[{fileId:"retained"}],
  importProvenance:{sourceRowNumber:7}, efficiency:{chargeRate:999, costRate:999, actualHours:99, netRate:999}, ...extra });
for (const [chargeRate, costRate, estimateHours, rate, total] of [
  [150,-60,2,90,165], [200,-80,0.5,120,45], [100,-25,1.5,75,97.5], [150,-60,2.8,90,237], [200,-45,2.8,155,419]
]) test(`charge ${chargeRate}, expense ${costRate}, ${estimateHours} hr yields ${total}`, () => {
  const c = harness();
  for (const historical of [false,true]) for (const sign of [-1,1]) {
    const job = fixture({chargeRate, costRate:sign*Math.abs(costRate), estimateHours,
      ...(historical ? {completedAtISO:"2026-10-06"} : {})});
    assert.equal(c.charge(job) + c.cost(job), rate);
    assert.equal(c.cost(job), costRate);
    assert.ok(Math.abs(c.total(job, job.efficiency) - total) < 1e-9);
  }
});
test("edits recalculate from authoritative inputs; refresh retains result and unrelated fields", () => {
  const job = fixture(), c = harness(), before = structuredClone(job);
  assert.equal(c.total(job, job.efficiency), 165);
  job.chargeRate = 200; assert.equal(c.total(job, job.efficiency), 265);
  job.costRate = -80; assert.equal(c.total(job, job.efficiency), 225);
  job.estimateHours = .5; assert.equal(c.total(job, job.efficiency), 45);
  const edited = structuredClone(job);
  assert.equal(harness().total(JSON.parse(JSON.stringify(job)), job.efficiency), 45);
  assert.deepEqual(job, edited, "rendering must not mutate or persist the job");
  for (const key of Object.keys(before).filter(key => !["chargeRate","costRate","estimateHours"].includes(key)))
    assert.deepEqual(job[key], before[key], key);
});
test("Hours Taken alone determines duration, regardless of legacy progress", () => {
  const c = harness();
  for (const actualHours of [0,1.5,99,null,undefined]) {
    const job = fixture({estimateHours:2.8,chargeRate:200,costRate:-45,actualHours,
      manualLogs:[{dateISO:"2026-10-01",completedHours:99}]});
    assert.ok(Math.abs(c.total(job, {actualHours:99}) - 419) < 1e-9);
  }
  assert.equal(c.total(fixture({estimateHours:0}), {actualHours:99}), -15);
  assert.equal(c.total(fixture({estimateHours:undefined}), {actualHours:99}), -15);
});
test("missing rates use stored efficiency values, but blank/null rates do not become zero", () => {
  const c = harness();
  for (const value of [undefined,null,""]) {
    const job = fixture({chargeRate:value, costRate:value, efficiency:{chargeRate:150, costRate:-60}});
    assert.equal(c.total(job, job.efficiency), 165);
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
    assert.equal(result.netTotalDisplay, "+$165.00");
  }
  c.completedFiltered = [job, {...job,id:"second"}];
  c.computeJobEfficiency = job => job.efficiency;
  vm.runInContext(section(views, "  const completedStats =", "  const prioritySchedule =") +
    ";this.average = completedAverageMetrics;", c);
  assert.equal(c.average.netRate,90); assert.equal(c.average.costRate,-60); assert.equal(c.average.netTotal,165);
});
