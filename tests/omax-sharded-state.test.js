"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{webcrypto}=require("node:crypto");
const shards=require("../js/omaxShardedState");
const workspaceId="github-prod",operationId="review_test_01";
const state=()=>({schema:72,syncMeta:{rev:222},maintenanceOccurrencesV2:[
  {id:"ev1",eventType:"scheduled",note:"keep every value"},
  {id:"ev2",eventType:"removed",parentId:"ev1"}],
  completedCuttingJobs:[{id:"c1",manualLogs:[{id:"manual",cost:21.34}]}],
  orderRequests:[{id:"purchase1",items:[{id:"line1",quantity:2}]}],
  inventory:[{id:"material",quantity:3}],receiptTrackerWeeks:[],
  maintenanceCalendarInstancesV2:[{id:"instance1"}],maintenanceTasksV2:[{id:"task1"}],
  tasksInterval:[],tasksAsReq:[],cuttingJobs:[],dailyCutHours:[],totalHistory:[],
  deletedItems:[],customUnknown:{abc:[1,2,{x:true}]}});
const plan=source=>shards.plan({state:source,workspaceId,operationId,cryptoApi:webcrypto});
test("all fields and nested history are retained exactly after verified sharding",async()=>{
  const before=state(),raw=JSON.stringify(before);
  const built=await plan(before);
  assert.equal(built.shards.length,Object.keys(before).length);
  assert.ok(built.shards.every(s=>s.sizeBytes<shards.LIMIT));
  const downloaded=new Map(built.shards.map(s=>[s.path,s.serialized]));
  const checked=await shards.checkExact({source:before,manifest:built.manifest,serializedByPath:downloaded,cryptoApi:webcrypto});
  assert.deepEqual(checked,{verified:true,fieldCount:Object.keys(before).length,revision:222});
  assert.equal(JSON.stringify(before),raw);
});
test("missing shard, corrupted body, and missing manifest descriptor fail closed",async()=>{
  const original=state(),built=await plan(original);
  const downloaded=new Map(built.shards.map(s=>[s.path,s.serialized]));
  const target=built.shards.find(s=>s.field==="maintenanceOccurrencesV2");
  downloaded.delete(target.path);
  await assert.rejects(shards.reconstruct({manifest:built.manifest,serializedByPath:downloaded,cryptoApi:webcrypto}),/missing shard/);
  downloaded.set(target.path,target.serialized.replace("keep every value","changed"));
  await assert.rejects(shards.reconstruct({manifest:built.manifest,serializedByPath:downloaded,cryptoApi:webcrypto}),/checksum\/size mismatch/);
  downloaded.set(target.path,target.serialized);
  const short={...built.manifest,shards:built.manifest.shards.filter(s=>s.field!=="inventory")};
  await assert.rejects(shards.checkExact({source:original,manifest:short,serializedByPath:downloaded,cryptoApi:webcrypto}),/reconstruction differs/);
});
test("oversized single collection blocks pending sharding instead of dropping records",async()=>{
  const big=state();big.completedCuttingJobs=[{id:"large",notes:"x".repeat(shards.LIMIT)}];
  await assert.rejects(plan(big),/element exceeds maximum shard size/);
});
test("changing source revision after the plan cannot be mistaken for identical state",async()=>{
  const a=state(),built=await plan(a);
  a.syncMeta.rev++;
  const downloaded=new Map(built.shards.map(s=>[s.path,s.serialized]));
  await assert.rejects(shards.checkExact({source:a,manifest:built.manifest,serializedByPath:downloaded,cryptoApi:webcrypto}),/differs/);
});

test("large arrays split into immutable bounded parts and reconstruct without renumbering",async()=>{
  const original=state(),count=850;
  original.completedCuttingJobs=Array.from({length:count},(_,i)=>({
    id:"cut_"+i,cutNumber:i+1,manualLogs:[{id:"entry_"+i,note:"x".repeat(1100)}]
  }));
  const built=await plan(original);
  const chunks=built.manifest.shards.filter(x=>x.sourceField==="completedCuttingJobs");
  assert.ok(chunks.length>=2,"Expected field-level splitting before Storage size limit.");
  assert.ok(built.shards.every(x=>x.sizeBytes<=shards.LIMIT));
  assert.ok(chunks.every((x,i)=>x.partIndex===i&&x.partCount===chunks.length&&x.partKind==="array"));
  const verified=await shards.checkExact({source:original,manifest:built.manifest,
    serializedByPath:new Map(built.shards.map(x=>[x.path,x.serialized])),cryptoApi:webcrypto});
  assert.equal(verified.fieldCount,Object.keys(original).length);
  assert.equal(original.completedCuttingJobs.length,count);
});
test("large arbitrary objects split without losing keys or nested data",async()=>{
  const original=state();
  original.customUnknown=Object.fromEntries(Array.from({length:800},(_,i)=>[
    "opaque_"+i,{payload:"z".repeat(1100),child:{keep:i}}
  ]));
  const built=await plan(original);
  const chunks=built.manifest.shards.filter(x=>x.sourceField==="customUnknown");
  assert.ok(chunks.length>=2);
  assert.ok(chunks.every(x=>x.partKind==="object"));
  const verified=await shards.checkExact({source:original,manifest:built.manifest,
    serializedByPath:new Map(built.shards.map(x=>[x.path,x.serialized])),cryptoApi:webcrypto});
  assert.equal(verified.verified,true);
});
test("missing, repeated, or reclassified segments are rejected instead of partially loading",async()=>{
  const original=state();
  original.completedCuttingJobs=Array.from({length:850},(_,i)=>({id:"id_"+i,description:"m".repeat(1000)}));
  const built=await plan(original),chunks=built.manifest.shards.filter(s=>s.sourceField==="completedCuttingJobs");
  assert.ok(chunks.length>1);
  const good=new Map(built.shards.map(x=>[x.path,x.serialized]));
  const missing=new Map(good);missing.delete(chunks[1].path);
  await assert.rejects(shards.reconstruct({manifest:built.manifest,serializedByPath:missing,cryptoApi:webcrypto}),/missing shard/);
  const incomplete={...built.manifest,shards:built.manifest.shards.filter(x=>x.path!==chunks[1].path)};
  await assert.rejects(shards.reconstruct({manifest:incomplete,serializedByPath:good,cryptoApi:webcrypto}),/incomplete or colliding/);
  const changed={...built.manifest,shards:built.manifest.shards.map(x=>
    x.path===chunks[1].path?{...x,partIndex:0}:x)};
  await assert.rejects(shards.reconstruct({manifest:changed,serializedByPath:good,cryptoApi:webcrypto}),/invalid segmented/);
});
test("oversized noncollection payloads block rather than silently truncate",async()=>{
  const original=state();
  original.customUnknown="X".repeat(shards.LIMIT+100);
  await assert.rejects(plan(original),/cannot be split without altering data/);
});
