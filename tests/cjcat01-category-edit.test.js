"use strict";
const assert=require("node:assert/strict");
const {test}=require("node:test");
const planner=require("../js/cuttingJobCategoryEdit.js");
const root={id:"jobs_root",name:"All Jobs",parent:null,order:0};
const blanco={id:"project_blanco",name:"1254 Blanco",projectNumber:"1254",parent:"jobs_root",color:"#336699"};
const mesquite={id:"project_mesquite",name:"1242 Mesquite",projectNumber:"1242",parent:"jobs_root"};
const job=(id,cat,projectNumber)=>({id,cat,projectNumber,name:"Test",cutNumber:25,files:[{name:"part.dxf"}],materialCost:25,manualLogs:[{dateISO:"2026-10-12",completedHours:2}],failurePercent:20});
const state=()=>({jobFolders:[{...root},{...blanco},{...mesquite}],cuttingJobs:[job("A","project_blanco","1254")],completedCuttingJobs:[job("B","project_blanco","1254"),job("C","project_mesquite","1242")]});
const request=(changes={})=>({categoryId:"project_blanco",projectNumber:"1254",name:"Blanco",...changes});
test("change name only preserves ID and linked job identities",()=>{
 const source=state(),before=JSON.stringify(source);
 const p=planner.plan(source,request({name:"Blanco ATM"}));
 assert.equal(p.ok,true);assert.equal(p.summary.totalCount,2);
 assert.equal(p.next.jobFolders[1].id,blanco.id);
 assert.equal(p.next.jobFolders[1].name,"1254 Blanco ATM");
 assert.equal(p.next.cuttingJobs[0].id,"A");assert.equal(p.next.completedCuttingJobs[0].id,"B");
 assert.deepEqual(p.next.cuttingJobs[0].files,source.cuttingJobs[0].files);
 assert.equal(JSON.stringify(source),before);
});
test("renumber both active and completed; unrelated job and chronology unchanged",()=>{
 const source=state();
 const p=planner.plan(source,request({projectNumber:"1268",name:"Forming"}));
 assert.equal(p.ok,true);assert.equal(p.summary.activeCount,1);assert.equal(p.summary.completedCount,1);
 assert.equal(p.next.cuttingJobs[0].projectNumber,"1268");assert.equal(p.next.completedCuttingJobs[0].projectNumber,"1268");
 assert.deepEqual(p.next.completedCuttingJobs[1],source.completedCuttingJobs[1]);
 assert.deepEqual(p.next.cuttingJobs[0].manualLogs,source.cuttingJobs[0].manualLogs);
});
test("number claimed by other category must fail",()=>{
 assert.equal(planner.plan(state(),request({projectNumber:"1242",name:"New"})).ok,false);
});
test("unlinked job claiming number must fail",()=>{
 const source=state();source.cuttingJobs.push(job("D","project_mesquite","1268"));
 assert.equal(planner.plan(source,request({projectNumber:"1268"})).ok,false);
});
test("root edit blocked",()=>{
 assert.equal(planner.plan(state(),request({categoryId:"jobs_root"})).ok,false);
});
test("empty category remains editable",()=>{
 const source=state();source.cuttingJobs=[];source.completedCuttingJobs=[];
 const p=planner.plan(source,request({name:"New Blanco"}));
 assert.equal(p.ok,true);assert.equal(p.summary.totalCount,0);
});
test("legacy stale linked project is corrected without changing other fields",()=>{
 const source=state();source.cuttingJobs[0].projectNumber="";
 const p=planner.plan(source,request({projectNumber:"1268",name:"Blanco"}));
 assert.equal(p.ok,true);assert.equal(p.next.cuttingJobs[0].projectNumber,"1268");
 assert.equal(p.next.cuttingJobs[0].materialCost,25);
});
test("color remains unless specified",()=>{
 const p=planner.plan(state(),request({name:"Different"}));
 assert.equal(p.next.jobFolders[1].color,"#336699");
 const p2=planner.plan(state(),request({color:"#ABCDEF"}));
 assert.equal(p2.next.jobFolders[1].color,"#ABCDEF");
});
