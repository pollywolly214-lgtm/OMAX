"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {harness,job}=require("./rfs02-normal-harness.cjs");
for(const collection of ["cuttingJobs","completedCuttingJobs"])test("native job restore waits for verified persistence: "+collection,async()=>{
  const payload=job(123),h=harness(collection==="cuttingJobs"?[payload]:[],collection==="completedCuttingJobs"?[payload]:[]),before=h.cloud;
  assert.equal((await h.delete(collection,"123")).saved,true);
  const archive=h.cloud.deletedItems.find(row=>row.payload.id===123),result=await h.restore(archive.id);
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.saved,true);assert.equal(result.verified,true);assert.equal(result.value.id,123);
  assert.deepEqual(h.cloud[collection][0],payload);assert.deepEqual(h.cloud.deletedItems,before.deletedItems);assert.equal(h.commits,2);
});
test("native restore selects a non-first archive and preserves every other trash record",async()=>{
  const h=harness([job("a"),job("b",2),job("c",3)]);
  assert.equal((await h.delete("cuttingJobs","a")).saved,true);const selected=h.cloud.deletedItems[0];
  assert.equal((await h.delete("cuttingJobs","b")).saved,true);const before=h.cloud;
  const result=await h.restore(selected.id);assert.equal(result.ok,true,JSON.stringify(result));
  assert.deepEqual(h.cloud.deletedItems,before.deletedItems.filter(row=>row.id!==selected.id));
  assert.deepEqual(h.cloud.cuttingJobs.find(row=>row.id==="a"),selected.payload);
});
test("definite native restoration failure rolls back the owned job and keeps the archive",async()=>{
  const options={},h=harness([job("a")],[],options);assert.equal((await h.delete("cuttingJobs","a")).saved,true);
  const before=h.cloud,archive=before.deletedItems[0];options.writeError=Object.assign(Error("denied"),{code:"permission-denied",definite:true});
  const result=await h.restore(archive.id);assert.equal(result.ok,false);assert.equal(result.saved,false);assert.equal(result.indeterminate===true,false);
  assert.deepEqual(h.cloud,before);assert.deepEqual(structuredClone(h.window.cuttingJobs),before.cuttingJobs);assert.deepEqual(structuredClone(h.window.deletedItems),before.deletedItems);assert.equal(h.commits,1);
});
test("uncertain native restore retains committed evidence and cannot be retried",async()=>{
  const options={},h=harness([job("a")],[],options);assert.equal((await h.delete("cuttingJobs","a")).saved,true);
  const archive=h.cloud.deletedItems[0];options.loseAcknowledgement=true;
  const result=await h.restore(archive.id);assert.equal(result.ok,false);assert.equal(result.indeterminate,true);assert.equal(h.commits,2);
  assert.deepEqual(h.cloud.cuttingJobs[0],archive.payload);assert.equal(h.cloud.deletedItems.some(row=>row.id===archive.id),false);
  assert.equal((await h.restore(archive.id)).ok,false);assert.equal(h.commits,2);
});
test("native restoration preserves the canonical-chronology review blocker",async()=>{
  const payload={...job("a"),cutDateISO:"2026-11-21",cutOrderWithinDay:1,cutNumber:"C001"},h=harness([payload]);
  assert.equal((await h.delete("cuttingJobs","a")).saved,true);const before=h.cloud,result=await h.restore(before.deletedItems[0].id);
  assert.equal(result.ok,false);assert.equal(result.blocked,true);assert.equal(result.requiresCoordinator,true);assert.equal(h.commits,1);assert.deepEqual(h.cloud,before);
});
for(const invalid of ["expired","identity-collision","cut-number-collision"])test("unsafe native restoration rejects before writing: "+invalid,async()=>{
  const h=harness([job("a"),job("b",2)]);assert.equal((await h.delete("cuttingJobs","a")).saved,true);
  const archive=h.window.deletedItems[0];
  if(invalid==="expired"){archive.deletedAt="2000-01-01T00:00:00.000Z";h.alterCloud(cloud=>cloud.deletedItems[0].deletedAt=archive.deletedAt);h.window.__lastLoadedCloudState=structuredClone(h.cloud);}
  if(invalid==="identity-collision")h.window.cuttingJobs.push(structuredClone(archive.payload));
  if(invalid==="cut-number-collision"){archive.payload.cutNumber="C001";h.window.cuttingJobs[0].cutNumber="C001";}
  const before=h.cloud,commits=h.commits,result=await h.restore(archive.id);
  assert.equal(result.ok,false,JSON.stringify(result));assert.equal(result.saved,false);assert.equal(h.commits,commits);assert.deepEqual(h.cloud,before);
});
