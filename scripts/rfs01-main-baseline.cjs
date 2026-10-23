"use strict";
// Read-only Git baseline + synthetic in-memory backend. No production access.
const assert=require("node:assert/strict"),cp=require("node:child_process"),vm=require("node:vm");
const {fixture}=require("../tests/fixtures/mdel01-maintenance-task"),{harness}=require("../tests/mdel01-harness.cjs");
const calendar=cp.execFileSync("git",["show","7285ac1e78d8387bb6beed3a64c1b843da8107db:js/calendar.js"],{encoding:"utf8"});
const fn=name=>{const start=calendar.indexOf("function "+name+"(");return calendar.slice(start,calendar.indexOf("\n}",start)+2);};
(async()=>{
  const source=fixture(),parent=source.tasksInterval[0];for(let i=0;i<10;i++){
    const id="baseline-child-"+i;source.tasksInterval.push({...structuredClone(parent),id,variant:"instance",templateId:parent.id,parentTask:parent.id,inventoryId:"baseline-stock-"+i});
    source.inventory.push({id:"baseline-stock-"+i,linkedTaskId:id,qty:1});
  }
  const h=harness({initial:source}),before=h.cloud,messages=[];let click,pending;
  Object.assign(h.context,{task:h.window.tasksInterval[0],mode:"interval",meta:{task:h.window.tasksInterval[0],list:h.window.tasksInterval,index:0,mode:"interval"},
    b:{querySelector:()=>({addEventListener:(_type,callback)=>{click=callback;}})},isTemplateTask:task=>task.variant==="template",isInstanceTask:task=>task.variant==="instance",
    recordDeletedItem:(type,payload,meta)=>h.window.deletedItems.unshift({id:"baseline-trash",type,payload:structuredClone(payload),meta,deletedAt:"2026-10-23T12:00:00Z"}),
    saveCloudNow:()=>{pending=h.context.writeAuthoritativeStateSnapshot(h.local,{merge:true},{expectedRevision:7});return pending;},toast:message=>messages.push(message),hideBubble(){},rerenderCalendarKeepScroll(){}});
  h.window.confirm=()=>true;
  vm.runInContext(fn("removeCalendarTaskEverywhere")+"\n"+fn("removeCalendarTaskFamily"),h.context);
  const start=calendar.indexOf('  b.querySelector("[data-bbl-remove-task]")');
  vm.runInContext(calendar.slice(start,calendar.indexOf('  b.querySelector("[data-bbl-edit]")',start)),h.context);
  click();const result=await pending;
  assert.equal(result.saved,false);assert.equal(result.errorCode,"protected_preflight_blocked");assert.equal(h.commits,0);assert.deepEqual(h.cloud,before);
  assert.ok(messages.includes("Task removed"));assert.equal(h.local.tasksInterval.length,1);assert.equal(h.local.deletedItems.length,1);
  console.log("PASS baseline reproduction: current main's calendar family removal announces success before the real protected writer rejects it; 11 definitions removed locally, one archived, zero backend commits. RFS regression retains descendants and verifies exactly one selected archive.");
})().catch(error=>{console.error(error);process.exitCode=1;});
