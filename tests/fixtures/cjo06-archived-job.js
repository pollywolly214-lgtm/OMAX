"use strict";
const dates=require("../../js/cuttingJobDateEditing");
const clone=structuredClone;
function liveState(){
  const job=(id,date,n)=>({id,name:"Testing category cut file.",startISO:date,completedAtISO:date,cutDateISO:date,cutOrderWithinDay:1,cutNumber:n,estimateHours:2,costRate:45,chargeRate:200,material:"Steel",materialCost:10,materialQty:1,notes:"retain exactly",files:[{id:"file-"+id,fileId:"reference-"+id,relativePath:"WJ Cuts/fixture.dxf",source:"wj_cuts_reference"}],manualLogs:[{dateISO:date,completedHours:1}]});
  let state={syncMeta:{rev:1791990957933},inventory:[],tasksInterval:[],tasksAsReq:[],cuttingJobs:[],completedCuttingJobs:[job("archived-owner","2026-10-06","C001"),job("same-name-different-id","2026-10-08","C002")],deletedItems:[],unknownEvidence:{retain:[1,2,3]}};
  for(const [i,date]of ["2026-10-02","2026-10-04","2026-10-01"].entries()){
    const result=dates.prepareMutation(state,{type:"edit",id:"archived-owner",updates:{completedAtISO:date}},{audit:{operationId:"fixture-audit-"+i,actorUid:"fixture",atISO:"2026-10-14T00:00:00.000Z"}});
    if(!result.ok)throw Error(result.error);state=result.nextState;
  }
  return state;
}
function archivedState(type="completed-job"){
  const state=liveState(),owner=state.completedCuttingJobs.find(job=>job.id==="archived-owner");
  state.completedCuttingJobs=state.completedCuttingJobs.filter(job=>job.id!==owner.id);
  state.deletedItems=[{id:"trash-owner",type,payload:clone(owner),meta:{},label:owner.name,deletedAt:"2026-10-14T00:00:00.000Z"}];
  return state;
}
module.exports={liveState,archivedState};
