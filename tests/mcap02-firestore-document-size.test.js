"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const core=fs.readFileSync("js/core.js","utf8");
const start=core.indexOf("function estimateFirestoreDocumentBytes(");
const end=core.indexOf("\n}\n",start)+2;
assert.ok(start>=0&&end>start,"Firestore document estimator exists");
const code=core.slice(start,end);
const h=vm.createContext({TextEncoder,FB:{docRef:{path:"workspaces/github-prod/app/state"}}});
vm.runInContext(code+"\nthis.estimate=estimateFirestoreDocumentBytes;",h);
const estimate=v=>h.estimate(v);

test("Firestore estimator includes document, field, nested map, array and value overhead",()=>{
 const sample={title:"A",flags:[true,false],nested:{counter:3,empty:null}};
 const pathBytes="workspaces/github-prod/app/state".split("/").reduce((n,p)=>n+Buffer.byteLength(p)+1,16);
 const expected=pathBytes+32
   +(Buffer.byteLength("title")+1)+(Buffer.byteLength("A")+1)
   +(Buffer.byteLength("flags")+1)+2
   +(Buffer.byteLength("nested")+1)+32
   +(Buffer.byteLength("counter")+1)+8
   +(Buffer.byteLength("empty")+1)+1;
 assert.equal(estimate(sample),expected);
});
test("Unicode text is UTF-8 measured, not JS code-unit length",()=>{
 assert.equal(estimate({note:"💧"}),estimate({note:"water"})-1);
});
test("unknown or malformed payloads fail closed",()=>{
 assert.equal(estimate({x:undefined}),Number.MAX_SAFE_INTEGER);
 assert.equal(estimate({x:new Date()}),Number.MAX_SAFE_INTEGER);
 assert.equal(estimate({x:Infinity}),Number.MAX_SAFE_INTEGER);
});
test("serializing a realistic near-limit maintenance state leaves verified headroom",()=>{
 // Generated fixture, NOT shop figures or a copy of production state.
 const state={syncMeta:{rev:1},maintenanceOccurrencesV2:[]};
 for(let i=0;i<188;i++)state.maintenanceOccurrencesV2.push({
   id:"occ-"+i,instanceId:"repeat-schedule",taskId:"task-mix",eventType:"completed",
   recordedAtISO:"2026-11-12T00:00:00.000Z",effectiveDateISO:"2026-11-12",
   payload:{note:"x".repeat(150)}
 });
 state.padding="x".repeat(700000);
 const before=estimate(state),limit=1048576-32768;
 assert.ok(before<limit);
 const after={...state,maintenanceOccurrencesV2:[...state.maintenanceOccurrencesV2,{
   id:"cancellation-a",instanceId:"repeat-schedule",taskId:"task-mix",eventType:"removed",
   effectiveDateISO:"2026-11-13",recordedAtISO:"2026-11-12T22:00:00.000Z",
   rootOccurrenceId:"repeat:repeat-schedule:slot:1",
   payload:{source:"verified_calendar_cancellation",actorUid:"actor"}
 }]};
 assert.ok(estimate(after)>before);
 assert.ok(estimate(after)<limit);
 assert.ok(1048576-estimate(after)>=32768);
});
test("oversized document still fails buffer budget",()=>{
 const tooLarge={a:"x".repeat(1048576-30000)};
 assert.ok(estimate(tooLarge)>=1048576-32768);
});
