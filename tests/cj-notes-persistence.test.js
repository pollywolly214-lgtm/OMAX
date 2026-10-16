"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { prepareMutation } = require("../js/cuttingJobDateEditing");

function fixture(){
  const job = { id:"active", notes:"First note", startISO:"2026-10-15", cutDateISO:"2020-01-01", cutNumber:"C017", cutOrderWithinDay:9, priority:7,
    cat:"legacy-category", projectNumber:"1241", materialCost:35, failurePercent:20, files:[{id:"keep-file",relativePath:"fixture.dxf"}],
    manualLogs:[{dateISO:"2026-10-15",completedHours:2}], cutChronologyHistory:[{jobId:"active",kind:"edit",operationId:"keep-audit"}] };
  return { syncMeta:{rev:7}, cuttingJobs:[job], completedCuttingJobs:[{...structuredClone(job), id:"past", completedAtISO:"2026-10-16", cutNumber:"C009", cutChronologyHistory:[]}],
    inventory:[{id:"keep-inventory",qty:3}], jobFolders:[], unknownEvidence:{keep:true} };
}
for (const [collection,id] of [["cuttingJobs","active"],["completedCuttingJobs","past"]]){
  test(`notes-only ${id} edit preserves every other field, chronology and source`, ()=>{
    const before=fixture(), source=structuredClone(before), expected=structuredClone(before);
    expected[collection][0].notes="First note\n\nSecond note";
    const unexpected=()=>{ throw Error("Notes must not invoke chronology/category/priority normalization"); };
    const result=prepareMutation(source,{type:"edit",id,updates:{notes:expected[collection][0].notes}}, {normalizePriorities:unexpected,validateCategory:unexpected});
    assert.equal(result.ok,true); assert.equal(result.hasChanges,true);
    assert.deepEqual(result.nextState,expected); assert.deepEqual(source,before);
    assert.deepEqual(result.renumbering.changed,[]); assert.deepEqual(result.chronologyChanges,[]);
  });
}
test("unchanged notes are an exact no-op and clearing uses the existing string field", ()=>{
  const source=fixture();
  const same=prepareMutation(source,{type:"edit",id:"active",updates:{notes:"First note"}});
  assert.equal(same.ok,true); assert.equal(same.hasChanges,false); assert.deepEqual(same.nextState,source);
  const cleared=prepareMutation(source,{type:"edit",id:"past",updates:{notes:""}});
  assert.equal(cleared.ok,true); assert.equal(cleared.hasChanges,true); assert.equal(cleared.nextState.completedCuttingJobs[0].notes,"");
});
test("notes edits retain stable-identity checks and reject non-text notes", ()=>{
  for(const notes of [null,42,{},[]])assert.equal(prepareMutation(fixture(),{type:"edit",id:"active",updates:{notes}}).ok,false);
  assert.equal(prepareMutation(fixture(),{type:"edit",id:"missing",updates:{notes:"text"}}).ok,false);
  const duplicate=fixture(); duplicate.completedCuttingJobs[0].id="active";
  assert.equal(prepareMutation(duplicate,{type:"edit",id:"active",updates:{notes:"text"}}).ok,false);
});
