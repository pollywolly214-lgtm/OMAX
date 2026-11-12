"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const cancellation = require("../js/maintenanceCalendarCancellation");

const clone = structuredClone;
const initial = () => ({
  syncMeta:{rev:1},
  tasksInterval:[],
  tasksAsReq:[],
  deletedItems:[],
  maintenanceTasksV2:[{id:"task-A",name:"Mixing tube rotation"}],
  maintenanceCalendarInstancesV2:[{id:"instance-A",taskId:"task-A",instanceMode:"repeat",startDateISO:"2026-11-13",status:"active"}],
  maintenanceOccurrencesV2:[]
});
const operation = {
  kind:"repeatRemove",
  instanceId:"instance-A",
  taskId:"task-A",
  rootOccurrenceId:"repeat:instance-A:slot:1",
  dateISO:"2026-11-13"
};
function scenario(blockers){
  const source=initial();
  let writes=0;
  const env={
    canWrite:()=>true, settle:async()=>{}, captureTarget:()=>({path:"fixture/app/state",projectId:"test",backend:"disposable"}),
    version:()=>({revision:1}),targetIsCurrent:()=>true,matches:()=>true,
    local:()=>clone(source),read:async()=>clone(source),
    validate:state=>(state.maintenanceOccurrencesV2||[]).length===0,
    validationBlockers:()=>blockers,
    actor:()=>"actor-fixture",newId:()=>"new-cancel-id",now:()=>"2026-11-12T20:00:00.000Z",
    write:async()=>{writes++;return {saved:true}},backup:()=>{},adopt:()=>true,
    suspend:()=>{throw Error("No write was attempted; suspension is forbidden")}
  };
  return {api:cancellation.createApi(env),get writes(){return writes},source};
}
test("size-limited maintenance cancellation fails with clear no-write message",async()=>{
  const s=scenario(["Protected authoritative payload exceeds the save limit."]);
  const result=await s.api.run(s.api.review(operation));
  assert.equal(result.saved,false);
  assert.equal(result.indeterminate,false);
  assert.equal(result.stateWriteAttempted,false);
  assert.equal(s.writes,0);
  assert.match(result.error,/protected-size limit/);
  assert.match(result.error,/No records were changed/);
});
test("unrelated central integrity blockers retain generic guard message",async()=>{
  const s=scenario(["Missing protected maintenance history"]);
  const result=await s.api.run(s.api.review(operation));
  assert.equal(result.saved,false);
  assert.equal(s.writes,0);
  assert.match(result.error,/maintenance identity or protected-data rules/);
  assert.doesNotMatch(result.error,/protected-size limit/);
});
