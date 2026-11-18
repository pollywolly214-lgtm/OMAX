"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {webcrypto}=require("node:crypto");
const archive=require("../js/maintenanceArchive");
const transport=require("../js/maintenanceArchiveStorage");

const workspaceId="github-prod",actorUid="GntsaU7i2tXdDf05ds8cws5dfi63";
const state=()=>({syncMeta:{rev:7},maintenanceOccurrencesV2:[
  {id:"scheduled",taskId:"mix",eventType:"scheduled",extension:{notes:"all preserved"}},
  {id:"removed",taskId:"mix",eventType:"removed",rootOccurrenceId:"scheduled"}
]});
const fixture=async()=>archive.prepare({state:state(),count:2,archiveId:"op_unit_01",workspaceId,cryptoApi:webcrypto});
function mockCloud(){
  let object=null,denied=false,corrupt=false;
  let putCount=0;
  const storage={ref:()=>({child:path=>({
    put:async(blob,options)=>{
      putCount++;
      if(object)throw Error("immutable object already exists");
      object={path,body:await blob.text(),contentType:options.contentType,customMetadata:options.customMetadata};
    },
    getMetadata:async()=>{
      if(denied)throw Error("permission denied");
      if(!object||object.path!==path)throw Error("not found");
      return {fullPath:path,bucket:transport.BUCKET,size:Buffer.byteLength(object.body),
        contentType:object.contentType,customMetadata:object.customMetadata};
    },
    getDownloadURL:async()=>{
      if(denied)throw Error("permission denied");
      return "https://example.invalid/opaque-token";
    }
  })})};
  const fetchImpl=async()=>({
    ok:!denied,headers:{get:()=>String(Buffer.byteLength(object.body))},
    arrayBuffer:async()=>{
      const bytes=Buffer.from(corrupt?object.body.replace('"removed"','"changed"'):object.body,"utf8");
      return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    }
  });
  const context=transport.target({projectId:transport.PROJECT,bucket:transport.BUCKET,
    workspaceId,storage,archiveApi:archive,cryptoApi:webcrypto,fetchImpl,actorUid});
  return {context,deny:()=>{denied=true;},corrupt:()=>{corrupt=true;},puts:()=>putCount};
}
test("verified immutable Storage upload and independent readback",async()=>{
  const prepared=await fixture(),cloud=mockCloud();
  const result=await transport.uploadVerified(cloud.context,{prepared,createdAtISO:"2026-11-13T16:00:00Z"});
  assert.equal(result.verified,true);
  assert.deepEqual(result.records,state().maintenanceOccurrencesV2);
  const again=await transport.downloadVerified(cloud.context,{descriptor:prepared.descriptor});
  assert.deepEqual(again.records,state().maintenanceOccurrencesV2);
  assert.equal(cloud.puts(),1);
  await assert.rejects(transport.uploadVerified(cloud.context,{prepared,createdAtISO:"2026-11-13T16:00:00Z"}),/already exists/);
  assert.equal(cloud.puts(),2); // mock deliberately denies the attempted second create
});
test("wrong Firebase bucket or project blocks all operations",()=>{
  const cloud=mockCloud();
  for(const field of ["projectId","bucket"]){
    const options={projectId:transport.PROJECT,bucket:transport.BUCKET,workspaceId,storage:cloud.context.storage,
      archiveApi:archive,cryptoApi:webcrypto,fetchImpl:async()=>({ok:true}),actorUid};
    options[field]="wrong";
    assert.throws(()=>transport.target(options),/configured Firebase/);
  }
});
test("corrupt or inaccessible Storage cannot validate history",async()=>{
  const prepared=await fixture(),cloud=mockCloud();
  await transport.uploadVerified(cloud.context,{prepared,createdAtISO:"2026-11-13T16:00:00Z"});
  cloud.corrupt();
  await assert.rejects(transport.downloadVerified(cloud.context,{descriptor:prepared.descriptor}),/mismatch/);
  cloud.deny();
  await assert.rejects(transport.downloadVerified(cloud.context,{descriptor:prepared.descriptor}),/permission denied/);
});
test("storage transport alone never mutates authoritative Firestore state",async()=>{
  const source=state(),before=JSON.stringify(source),prepared=await fixture(),cloud=mockCloud();
  await transport.uploadVerified(cloud.context,{prepared,createdAtISO:"2026-11-13T16:00:00Z"});
  assert.equal(JSON.stringify(source),before);
  assert.equal(source.maintenanceArchiveManifest,undefined);
});
