"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {webcrypto}=require("node:crypto");
const archive=require("../js/maintenanceArchive");
const state=()=>({
  syncMeta:{rev:44},maintenanceOccurrencesV2:[
    {id:"a",instanceId:"i",taskId:"t",eventType:"scheduled",unknown:{notes:["α",4]}},
    {id:"b",instanceId:"i",taskId:"t",eventType:"completed",hours:3},
    {id:"c",instanceId:"i",taskId:"t",eventType:"removed",rootOccurrenceId:"a"}
  ],inventory:[{id:"stock",qty:5}]
});
const prepare=async()=>archive.prepare({state:state(),count:2,archiveId:"op_01",workspaceId:"github-prod",cryptoApi:webcrypto});
test("deterministic immutable prefix archive round trip, unchanged historical records",async()=>{
  const first=await prepare(),second=await prepare();
  assert.equal(first.serialized,second.serialized);
  assert.deepEqual(first.descriptor,second.descriptor);
  assert.equal(first.descriptor.sourcePrefixIds,undefined);
  const verified=await archive.verify({serialized:first.serialized,descriptor:first.descriptor,cryptoApi:webcrypto});
  assert.deepEqual(verified,state().maintenanceOccurrencesV2.slice(0,2));
  const next=archive.proposeCutover({source:state(),prepared:first,verifiedRecords:verified});
  assert.deepEqual(next.inventory,state().inventory);
  assert.deepEqual(next.maintenanceOccurrencesV2,state().maintenanceOccurrencesV2.slice(2));
  assert.deepEqual(archive.reconstruct({active:next.maintenanceOccurrencesV2,archived:[verified],descriptors:next.maintenanceArchiveManifest.segments}),state().maintenanceOccurrencesV2);
});
test("corrupted bytes are never accepted",async()=>{
  const prepared=await prepare();
  await assert.rejects(archive.verify({serialized:prepared.serialized.replace('"hours":3','"hours":4'),descriptor:prepared.descriptor,cryptoApi:webcrypto}),/SHA-256 mismatch/);
});
test("altered manifest or missing archive fail closed",async()=>{
  const prepared=await prepare();
  await assert.rejects(archive.verify({serialized:prepared.serialized,descriptor:{...prepared.descriptor,recordCount:100},cryptoApi:webcrypto}),/count\/order/);
  assert.throws(()=>archive.reconstruct({active:[],archived:[],descriptors:[prepared.descriptor]}),/missing archive segment/);
});
test("duplicate IDs, revision changes, and changing records block cutover",async()=>{
  const prepared=await prepare(),verified=await archive.verify({serialized:prepared.serialized,descriptor:prepared.descriptor,cryptoApi:webcrypto});
  assert.throws(()=>archive.proposeCutover({source:{...state(),syncMeta:{rev:45}},prepared,verifiedRecords:verified}),/changed/);
  const modified=state();modified.maintenanceOccurrencesV2[0].unknown.notes.push("changed");
  assert.throws(()=>archive.proposeCutover({source:modified,prepared,verifiedRecords:verified}),/changed/);
  const duplicate=state();duplicate.maintenanceOccurrencesV2[1].id="a";
  assert.throws(()=>archive.selectPrefix(duplicate,2),/duplicate/);
  assert.throws(()=>archive.reconstruct({active:[verified[0]],archived:[verified],descriptors:[prepared.descriptor]}),/duplicate identity/);
});
test("manifest presence blocks unimplemented repeat migration",async()=>{
  const initial=state();initial.maintenanceArchiveManifest={segments:[]};
  await assert.rejects(archive.prepare({state:initial,count:1,archiveId:"op_02",workspaceId:"github-prod",cryptoApi:webcrypto}),/manifest-aware/);
});
