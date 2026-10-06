"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const atomic = require("../js/atomicPersistence");
const firewall = require("../js/cuttingFileContentFirewall");
const history = require("../js/historicalImport");
const core = fs.readFileSync("js/core.js", "utf8");
const section = (start, end)=> core.slice(core.indexOf(start), core.indexOf(end, core.indexOf(start)));
const clone = value=> JSON.parse(JSON.stringify(value));
process.env.TZ = "America/Chicago";
class FixedDate extends Date {
  constructor(...args){ super(...(args.length ? args : [2026, 9, 6, 12])); }
}
const defaults = { averageWindowDays:7, mondayStartLookback:false, excludeWeekends:false };
const totals = ()=> [
  { dateISO:"2026-09-29", hours:100 },
  { dateISO:"2026-09-30", hours:104 },
  { dateISO:"2026-10-01", hours:110 }
];
const manual = (dateISO, hours)=> ({ dateISO, hours, source:"manual" });
function harness(state = {}, config = {}){
  const ctx = vm.createContext({
    console, Date:FixedDate, window:{ dailyCutHours:[], totalHistory:[], ...clone(state) },
    appConfig:{ ...defaults, ...config }, DEFAULT_APP_CONFIG:{ ...defaults, averageWindowDays:60 },
    PREDICTION_AVERAGE_WINDOWS:[7,14,30,60,90].map(value=>({ value })), DEFAULT_PREDICTION_AVERAGE_WINDOW:60,
    cloneStructured:clone, syncRenderTotalsFromHistory(){}
  });
  vm.runInContext(
    section("function parseDateLocal(", "function normalizeAppConfig(") +
    section("function shouldExcludeWeekends(", "function getFixedDailyHours(") +
    section("function normalizeDailyCutHours(", "function getDailyCutHoursEntry(") +
    section("function resolveEffectiveDailyCutHours(", "function refreshDerivedDailyHours(") +
    section("function mergeTotalHistoryForSave(", "function mergeDailyCutHoursForSave(") +
    section("function adoptAuthoritativeRecoveryState(", "function renderInventoryIdentityRecoveryData("), ctx);
  return ctx;
}

test("A: manual-only hours retain the existing inclusive denominator", ()=>{
  const ctx = harness({ dailyCutHours:[manual("2026-09-30",4), manual("2026-10-01",6), manual("2026-10-02",2)] });
  assert.equal(ctx.getAverageDailyCutHours(), 1.5);
});

test("B: real Pump Hours append contributes without generating daily records", ()=>{
  const rows = totals().map((row,index)=>({ date:row.dateISO, hours:row.hours, import_event_id:`ach-fixture-${index}`,
    source_id:"ach-fixture", source_record_id:String(index), review_status:"reviewed" }));
  const state = { totalHistory:[], dailyCutHours:[] };
  const plan = history.preview("pump_hours", rows, state);
  assert.ok(plan.every(row=>row.status === history.STATUS.missing));
  const imported = history.append("pump_hours", state, plan);
  assert.deepEqual(imported.dailyCutHours, []);
  assert.equal(harness(imported).getAverageDailyCutHours(), 1.25);
});

test("C: imported cumulative readings plus a manual day produce 1.50, not 0.25", ()=>{
  const state = { totalHistory:totals(), dailyCutHours:[manual("2026-10-02",2)] };
  assert.equal(harness(state).getAverageDailyCutHours(), 1.5);
});

test("D: current manual edits and explicit zero override derived hours", ()=>{
  const ctx = harness({ totalHistory:totals(), dailyCutHours:[manual("2026-10-01",3)] });
  assert.equal(ctx.getAverageDailyCutHours(), 7/8);
  ctx.window.dailyCutHours.push(manual("2026-10-01",0));
  assert.equal(ctx.getAverageDailyCutHours(), 4/8);
  ctx.window.dailyCutHours.push({ date:"2026-09-30", hours:0, source:"manual" });
  assert.equal(ctx.getAverageDailyCutHours(), null);
});

test("E: duplicate auto/manual representations and all legacy date aliases count once", ()=>{
  const state = { totalHistory:[...totals(), { dateISO:"2026-10-01", hours:110 }], dailyCutHours:[
    { date:"2026-09-30", hours:4, source:"auto" },
    { dateIso:"2026-09-30", hours:4, source:"auto" },
    { dateISO:"2026-09-30", hours:4, source:"auto" },
    { date:"2026-10-01", hours:6, source:"manual" },
    { dateIso:"2026-10-01", hours:99, source:"auto" },
    { dateIso:"2026-10-02", hours:2, source:"manual" }
  ] };
  const before = clone(state), ctx = harness(state);
  assert.equal(ctx.getAverageDailyCutHours(), 1.5);
  assert.equal(ctx.getAverageDailyCutHours(), 1.5);
  assert.deepEqual(clone(ctx.window), before, "resolution never rewrites records or provenance");
});

test("F: inserted and edited cumulative readings replace stale automatic deltas", ()=>{
  const ctx = harness({ totalHistory:[totals()[0], totals()[2]], dailyCutHours:[
    { dateISO:"2026-10-01", hours:10, source:"auto" },
    { dateISO:"2026-10-02", hours:3, source:"auto" }
  ] });
  ctx.window.totalHistory.push(totals()[1]);
  let map = ctx.resolveEffectiveDailyCutHours(ctx.window.dailyCutHours, ctx.window.totalHistory, "2026-09-29", "2026-10-06");
  assert.equal(map.get("2026-10-01"), 6);
  assert.equal(map.get("2026-09-30"), 4);
  assert.equal(ctx.getAverageDailyCutHours(), 13/8, "daily-only automatic values survive");
  ctx.window.totalHistory[2].hours = 106;
  map = ctx.resolveEffectiveDailyCutHours(ctx.window.dailyCutHours, ctx.window.totalHistory, "2026-09-29", "2026-10-06");
  assert.equal(map.get("2026-10-01"), 4);
  assert.equal(map.get("2026-09-30"), 6);
  ctx.window.totalHistory[1].hours = 108;
  assert.equal(ctx.getAverageDailyCutHours(), 11/8);
});

test("G: baseline-proven downward correction retains provenance and omitted remote dates", ()=>{
  const ctx = harness(), remote = [
    ...totals(), { dateISO:"2026-10-02", hours:112, note:"unrelated remote reading" }
  ];
  remote[2].import_event_id = "ach-source";
  remote[2].importProvenance = { sourceRecord:{ hours:110 }, note:"retain original evidence" };
  const before = clone(remote), local = [{ dateISO:"2026-10-01", hours:108 }];
  const merged = clone(ctx.mergeTotalHistoryForSave(local, remote, remote));
  assert.equal(merged.find(row=>row.dateISO === "2026-10-01").hours, 108);
  assert.deepEqual(merged[2].importProvenance, remote[2].importProvenance);
  assert.equal(merged[2].import_event_id, "ach-source");
  assert.deepEqual(merged[3], remote[3]);
  assert.deepEqual(remote, before);
});

test("G: unknown, stale, and ambiguous baselines cannot authorize a lower overwrite", ()=>{
  const ctx = harness(), remote = [{ dateISO:"2026-10-01", hours:110 }], local = [{ dateISO:"2026-10-01", hours:108 }];
  for (const baseline of [null,local,[...remote,...remote]]){
    assert.equal(ctx.mergeTotalHistoryForSave(local, remote, baseline)[0].hours, 110);
  }
  assert.equal(ctx.mergeTotalHistoryForSave([...local,...local], remote, remote)[0].hours, 110);
  assert.equal(ctx.mergeTotalHistoryForSave(local, [...remote,...remote], remote)[0].hours, 110);
});

function writerHarness(remoteState, baseline = remoteState){
  const ctx = harness();
  let cloud = clone(remoteState), commits = 0;
  Object.assign(ctx, {
    FB:{ db:{ async runTransaction(callback){
      let next;
      await callback({ get:async()=>({ exists:true, data:()=>clone(cloud) }), set(ref,state){ next=clone(state); } });
      cloud = next; commits++;
    } }, docRef:{ path:"workspaces/ach-fixture/app/state" } },
    inventoryIdentityRepairAuthorizations:new Map(), canWriteCloud:()=>true,
    validateCuttingJobDeletionSave:()=>({ valid:true }), validateCuttingJobHistoryRestoreSave:()=>({ valid:true }),
    cuttingJobDeletionSafetyBaseline:state=>state, readLocalStateBackup:()=>null,
    buildWindowProtectedStateForCoverage:()=>({}), getSaveSchemaCoverageReport:()=>({}),
    validateProtectedSavePreflight:()=>({ blocked:false }), detectDangerousProtectedFieldReduction:()=>({ blocked:false }),
    scanAuthoritativeCutFileContent:firewall.scanCuttingFileContent,
    estimatePayloadBytes:value=>Buffer.byteLength(JSON.stringify(value)), FIRESTORE_BLOCK_BYTES:975000,
    getCloudSyncClientId:()=>"ach-fixture", normalizeDateISO:ctx.normalizeDateISO,
    mergeDailyCutHoursForSave:(local,remote)=>ctx.normalizeDailyCutHours([...(remote||[]),...(local||[])]),
    mergePumpEffForSave:local=>local
  });
  Object.assign(ctx.window, { OMAXAtomicPersistence:atomic, CuttingFileContentFirewall:firewall,
    __lastLoadedCloudState:clone(baseline), __loadedCloudRevisionForSaveGuard:baseline.syncMeta.rev });
  vm.runInContext(section("async function writeAuthoritativeStateSnapshot(", "function getInventoryIdentityRepairLocalState("), ctx);
  return { ctx, get cloud(){ return clone(cloud); }, get commits(){ return commits; } };
}

test("G: actual authoritative transaction saves 108 and reload retains the calculation", async()=>{
  const initial = { syncMeta:{ rev:7 }, totalHistory:totals(), dailyCutHours:[manual("2026-10-02",2)],
    pumpEff:{ entries:[], notes:[] }, appConfig:defaults };
  initial.totalHistory[2].importProvenance = { originalSourceDate:"2026-10-01" };
  const h = writerHarness(initial), pending = clone(initial);
  pending.totalHistory[2] = { dateISO:"2026-10-01", hours:108 };
  // Exercise both merge stages: the pre-save merge and the actual transaction.
  pending.totalHistory = h.ctx.mergeTotalHistoryForSave(pending.totalHistory, initial.totalHistory, initial.totalHistory);
  assert.equal((await h.ctx.writeAuthoritativeStateSnapshot(pending)).saved, true);
  assert.equal(h.commits, 1);
  assert.equal(h.cloud.totalHistory[2].hours, 108);
  assert.deepEqual(h.cloud.totalHistory[2].importProvenance, initial.totalHistory[2].importProvenance);
  const reload = harness();
  reload.adoptAuthoritativeRecoveryState(h.cloud);
  assert.equal(reload.getAverageDailyCutHours(), 10/8);
  assert.equal(harness(h.cloud).getAverageDailyCutHours(), reload.getAverageDailyCutHours());
});

test("G: actual transaction still rejects stale revisions and protected-data failures", async()=>{
  const initial = { syncMeta:{ rev:7 }, totalHistory:totals(), dailyCutHours:[] }, pending = clone(initial);
  pending.totalHistory[2].hours = 108;
  const newer = { ...clone(initial), syncMeta:{ rev:8 } }, stale = writerHarness(newer, initial);
  assert.equal((await stale.ctx.writeAuthoritativeStateSnapshot(pending)).errorCode, "revision_conflict");
  assert.equal(stale.commits, 0);
  assert.deepEqual(stale.cloud, newer);
  const blocked = writerHarness(initial);
  blocked.ctx.validateProtectedSavePreflight = ()=>({ blocked:true });
  assert.equal((await blocked.ctx.writeAuthoritativeStateSnapshot(pending)).errorCode, "protected_preflight_blocked");
  assert.equal(blocked.commits, 0);
  assert.deepEqual(blocked.cloud, initial);
});

test("H: weekend exclusion skips hours but advances the cumulative baseline", ()=>{
  const state = { totalHistory:[...totals(), { dateISO:"2026-10-03", hours:122 }, { dateISO:"2026-10-05", hours:125 }],
    dailyCutHours:[manual("2026-10-02",2), manual("2026-10-04",8)] };
  assert.equal(harness(state,{ excludeWeekends:true }).getAverageDailyCutHours(), 15/6);
});

test("H: Monday alignment and every configured lookback retain current denominators", ()=>{
  const state = { dailyCutHours:[manual("2026-10-06",12)] };
  for (const [days, alignedDays] of [[7,2],[14,9],[30,23],[60,51],[90,86]]){
    assert.equal(harness(state,{ averageWindowDays:days }).getAverageDailyCutHours(), 12/(days+1));
    assert.equal(harness(state,{ averageWindowDays:days,mondayStartLookback:true }).getAverageDailyCutHours(), 12/alignedDays);
  }
  assert.equal(harness(state,{ averageWindowDays:undefined }).getAverageDailyCutHours(), 12/61);
});

test("H: window-first cumulative reading remains a baseline; future/outside daily dates are excluded", ()=>{
  const state = { totalHistory:[{ dateISO:"2026-09-28", hours:90 }, ...totals(), { dateISO:"2026-10-07", hours:120 }],
    dailyCutHours:[manual("2026-09-28",24),manual("2026-10-07",24)] };
  assert.equal(harness(state).getAverageDailyCutHours(), 10/8);
  state.totalHistory.splice(1,1);
  assert.equal(harness(state).getAverageDailyCutHours(), 20/8, "first later reading receives the existing full gap delta");
  assert.equal(harness({ dailyCutHours:[manual("2026-09-29",2),manual("2026-10-06",6)] }).getAverageDailyCutHours(), 1);
  assert.equal(harness({ totalHistory:[totals()[2]] }).getAverageDailyCutHours(), null);
  assert.equal(harness({}).getAverageDailyCutHours(), null);
});

test("H: daily clamping and unclamped totals-only compatibility remain distinct", ()=>{
  const state = { totalHistory:[totals()[0],{ dateISO:"2026-09-30",hours:140 }] };
  assert.equal(harness(state).getAverageDailyCutHours(), 40/8);
  state.dailyCutHours = [{ dateISO:"2026-09-30",hours:99,source:"auto" }];
  assert.equal(harness(state).getAverageDailyCutHours(), 24/8);
  state.dailyCutHours = [manual("2026-09-30",72)];
  assert.equal(harness(state).getAverageDailyCutHours(), 24/8);
  assert.equal(harness({ dailyCutHours:[manual("2026-10-02",0)] }).getAverageDailyCutHours(), null);
});

test("H: a window-first automatic daily record retains its current delta or daily-only value", ()=>{
  const state = { totalHistory:[{ dateISO:"2026-09-28",hours:90 }, ...totals()],
    dailyCutHours:[{ dateISO:"2026-09-29",hours:10,source:"auto" }] };
  const ctx = harness(state);
  assert.equal(ctx.getAverageDailyCutHours(), 20/8);
  ctx.window.totalHistory[0].hours = 92;
  assert.equal(ctx.getAverageDailyCutHours(), 18/8, "even a boundary auto record uses the current preceding total");
  ctx.window.totalHistory.shift();
  assert.equal(ctx.getAverageDailyCutHours(), 20/8, "an auto record without a preceding meter reading remains daily-only");
});

test("mixed legacy/manual state remains 1.50 after authoritative hydration without source rewriting", ()=>{
  const state = { totalHistory:totals(), dailyCutHours:[{ dateIso:"2026-10-02", hours:2, source:"manual" }], appConfig:defaults,
    completedCuttingJobs:[{ id:"ach-job-fixture", actualHours:999, manualLogs:[{ dateISO:"2026-10-02",completedHours:999 }] }] };
  const before = clone(state), ctx = harness();
  ctx.adoptAuthoritativeRecoveryState(clone(state));
  assert.equal(ctx.getAverageDailyCutHours(), 1.5, "job totals are not promoted into machine hours");
  assert.deepEqual(clone(ctx.window.dailyCutHours), before.dailyCutHours);
  assert.deepEqual(state, before);
  ctx.window.dailyCutHours = ctx.normalizeDailyCutHours(ctx.window.dailyCutHours);
  assert.equal(ctx.getAverageDailyCutHours(), 1.5, "normalized realtime hydration yields the same result");
});
