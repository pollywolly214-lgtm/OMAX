"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const renderer = fs.readFileSync("js/renderers.js", "utf8");
const core = fs.readFileSync("js/core.js", "utf8");
function fn(source, name){
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf("\n}", start) + 2);
}
const clone = structuredClone;
function fixture(){
  return {
    totalHistory:[
      { dateISO:"2025-12-09", hours:1446, import_event_id:"noop-fixture-1", importProvenance:{ sourceRecord:{ hours:1446 } } },
      { dateISO:"2025-12-11", hours:1488, updatedAtISO:"2025-12-11T12:00:00Z" },
      { dateISO:"2025-12-12", hours:1455, note:"Historical correction" }
    ],
    dailyCutHours:[
      { dateISO:"2025-12-08", hours:3.5, source:"manual" },
      { dateISO:"2025-12-09", hours:2.7, source:"manual" },
      { dateISO:"2025-12-11", hours:24, source:"auto", updatedAtISO:"2025-12-11T12:00:00Z" },
      { dateISO:"2025-12-12", hours:0, source:"auto", updatedAtISO:"2025-12-12T12:00:00Z" }
    ]
  };
}
function harness(state = fixture(), confirm = true){
  const rows = [], calls = { gap:0, warning:0, confirm:[], recompute:0, dailyWrite:0, saveNow:0, saveDebounced:0, close:0, render:0 };
  const messages = [], undo = ["existing history"], backup = { value:"existing backup" };
  let submit;
  const form = {
    querySelectorAll:()=>rows,
    addEventListener(name, callback){ assert.equal(name,"submit"); submit = callback; }
  };
  const overlay = {
    querySelector(selector){
      if (selector === "[data-log-history-tbody]") return { rows };
      if (selector === "[data-log-history-form]") return form;
      return null;
    },
    querySelectorAll:()=>[]
  };
  const save = key=>{ calls[key]++; undo.push("saved edit"); backup.value="saved edit"; };
  const ctx = vm.createContext({
    console, Date, totalHistory:state.totalHistory, dailyCutHours:state.dailyCutHours,
    window:{ ...state, confirm(message){ calls.confirm.push(message); return confirm; } },
    document:{ createElement:()=>overlay, body:{ appendChild(){}, classList:{ add(){} } } },
    logHistoryModal:null, RENDER_TOTAL:1455, RENDER_DELTA:0,
    toast:message=>messages.push(message), currentTotal:()=>ctx.totalHistory.at(-1).hours,
    deltaSinceLast:()=>Math.max(0,ctx.totalHistory.at(-1).hours-ctx.totalHistory.at(-2).hours),
    closeLogHistoryModal(){ calls.close++; ctx.logHistoryModal=null; },
    saveCloudNow:()=>save("saveNow"), saveCloudDebounced:()=>save("saveDebounced"),
    renderDashboard:()=>calls.render++, refreshTimeEfficiencyWidgets(){}, renderCalendar(){}
  });
  ctx.appendLogHistoryRow = (tbody, entry)=>{
    const dateInput = { value:ctx.normalizeDateISO(entry.dateISO) }, hoursInput = { value:String(Number(entry.hours)) };
    rows.push({ dateInput, hoursInput, querySelector:selector=>selector === "[data-log-history-date]" ? dateInput : hoursInput });
  };
  vm.runInContext(
    core.slice(core.indexOf("function parseDateLocal("),core.indexOf("function normalizeAppConfig(")) +
    fn(core,"setDailyCutHoursEntry") + fn(renderer,"recomputeDailyCutHoursFromTotalHistory") +
    fn(renderer,"findExcessiveLogGap") + fn(renderer,"warnExcessiveLogGap") + fn(renderer,"openLogHistoryModal"), ctx);
  for (const [name, key] of [["findExcessiveLogGap","gap"],["warnExcessiveLogGap","warning"],
    ["recomputeDailyCutHoursFromTotalHistory","recompute"],["setDailyCutHoursEntry","dailyWrite"]]){
    const original = ctx[name];
    ctx[name] = (...args)=>{ calls[key]++; return original(...args); };
  }
  ctx.openLogHistoryModal();
  return { ctx, calls, messages, rows, undo, backup, submit:()=>submit({ preventDefault(){} }),
    row:date=>rows.find(row=>row.dateInput.value === date) };
}
function assertNoop(h, before, totalReference, dailyReference){
  assert.deepEqual(h.ctx.totalHistory, before.totalHistory);
  assert.deepEqual(h.ctx.dailyCutHours, before.dailyCutHours);
  assert.strictEqual(h.ctx.totalHistory,totalReference);
  assert.strictEqual(h.ctx.window.totalHistory,totalReference);
  assert.strictEqual(h.ctx.dailyCutHours,dailyReference);
  assert.strictEqual(h.ctx.window.dailyCutHours,dailyReference);
  for (const key of ["gap","warning","recompute","dailyWrite","saveNow","saveDebounced","render"]) assert.equal(h.calls[key],0,key);
  assert.deepEqual(h.calls.confirm,[]);
  assert.deepEqual(h.messages,[]);
  assert.deepEqual(h.undo,["existing history"]);
  assert.equal(h.backup.value,"existing backup");
  assert.equal(h.calls.close,1);
}

test("unchanged sparse +42/downward history exits before warning, recomputation, or persistence", ()=>{
  const state = fixture(), before = clone(state), h = harness(state);
  h.submit();
  assertNoop(h,before,state.totalHistory,state.dailyCutHours);
});

test("formatting-equivalent numbers and reordered rows remain a no-op", ()=>{
  const state = fixture();
  state.totalHistory[0].hours = "1446";
  const before = clone(state), h = harness(state);
  h.row("2025-12-09").hoursInput.value = "1446.000";
  h.row("2025-12-11").hoursInput.value = "01488.0";
  h.rows.reverse();
  h.submit();
  assertNoop(h,before,state.totalHistory,state.dailyCutHours);
});

test("a reverted edit also closes as a no-op", ()=>{
  const state = fixture(), before = clone(state), h = harness(state);
  h.row("2025-12-09").hoursInput.value = "1447";
  h.row("2025-12-09").hoursInput.value = "1446";
  h.submit();
  assertNoop(h,before,state.totalHistory,state.dailyCutHours);
});

test("a real hour edit retains the warning, recomputation, and immediate save", ()=>{
  const h = harness();
  h.row("2025-12-11").hoursInput.value = "1487";
  h.submit();
  assert.equal(h.calls.gap,1);
  assert.equal(h.calls.warning,1);
  assert.equal(h.calls.confirm.length,1);
  assert.match(h.calls.confirm[0],/Adding 41 hours.*exceeds the 24 hr\/day limit/);
  assert.equal(h.ctx.totalHistory.find(row=>row.dateISO === "2025-12-11").hours,1487);
  assert.equal(h.calls.recompute,1);
  assert.equal(h.calls.dailyWrite,2);
  assert.equal(h.calls.saveNow,1);
  assert.equal(h.calls.saveDebounced,0);
  assert.equal(h.calls.close,1);
  assert.ok(h.messages.includes("Logged hours updated"));
});

test("a real date edit still takes the normal edit path", ()=>{
  const h = harness();
  h.row("2025-12-12").dateInput.value = "2025-12-13";
  h.submit();
  assert.equal(h.ctx.totalHistory.at(-1).dateISO,"2025-12-13");
  assert.equal(h.calls.recompute,1);
  assert.equal(h.calls.saveNow,1);
});

test("declining the excessive-gap confirmation on a real edit preserves source records", ()=>{
  const state = fixture(), before = clone(state), h = harness(state,false);
  h.row("2025-12-11").hoursInput.value = "1487";
  h.submit();
  assert.equal(h.calls.confirm.length,1);
  assert.equal(h.calls.recompute,0);
  assert.equal(h.calls.saveNow,0);
  assert.equal(h.calls.close,0);
  assert.deepEqual(state,before);
});

test("real-edit validation still rejects invalid hours, dates, and duplicate dates", ()=>{
  for (const edit of [h=>{h.row("2025-12-09").hoursInput.value="-1";},
    h=>{h.row("2025-12-09").hoursInput.value="invalid";},
    h=>{h.row("2025-12-09").dateInput.value="2025-02-30";},
    h=>{h.row("2025-12-09").dateInput.value="2025-12-11";}]){
    const state = fixture(), before = clone(state), h = harness(state);
    edit(h); h.submit();
    assert.equal(h.calls.gap,0);
    assert.equal(h.calls.recompute,0);
    assert.equal(h.calls.saveNow,0);
    assert.equal(h.calls.close,0);
    assert.equal(h.messages.length,1);
    assert.deepEqual(state,before);
  }
});

test("unchanged modal values preserve a newer in-memory record rather than replacing it", ()=>{
  const state = fixture(), h = harness(state);
  state.totalHistory[0].hours = 1447;
  const before = clone(state);
  h.submit();
  assertNoop(h,before,state.totalHistory,state.dailyCutHours);
});
