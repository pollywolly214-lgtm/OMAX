"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{webcrypto}=require("node:crypto");
const staging=require("../js/omaxWorkingStorage");
const fixture=()=>({schema:72,syncMeta:{rev:1794576947956,updatedAtISO:"2026-11-13T13:35:47.956Z"},
  maintenanceOccurrencesV2:[{id:"ev1",kind:"scheduled"},{id:"ev2",kind:"removed",parent:"ev1"}],
  maintenanceCalendarInstancesV2:[{id:"inst1"}],maintenanceTasksV2:[{id:"task1"}],
  tasksInterval:[],tasksAsReq:[],completedCuttingJobs:[],cuttingJobs:[],
  inventory:[],receiptTrackerWeeks:[],orderRequests:[],totalHistory:[],dailyCutHours:[],deletedItems:[]
});
const uid="GntsaU7i2tXdDf05ds8cws5dfi63",started="2026-11-17T21:40:00.000Z";
function backend({source=fixture(),afterUpload}={}){
  let stored=null,firestoreReads=0,firestoreWrites=0,storageWrites=0,permissionDenied=false,tamper=false;
  const db={
    doc:path=>({path}),
    runTransaction:async callback=>callback({
      get:async ref=>{
        firestoreReads++;
        return {exists:true,ref:{path:ref.path},metadata:{fromCache:false,hasPendingWrites:false},
          data:()=>structuredClone(source)};
      },
      set:()=>{firestoreWrites++;throw Error("UNEXPECTED Firestore write");},
      update:()=>{firestoreWrites++;throw Error("UNEXPECTED Firestore update");},
      delete:()=>{firestoreWrites++;throw Error("UNEXPECTED Firestore delete");}
    })
  };
  const storage={
    ref:()=>({child:path=>({
      put:async(blob,options)=>{
        storageWrites++;
        if(stored)throw Error("immutable create collision");
        stored={path,bytes:new Uint8Array(await blob.arrayBuffer()),options};
        if(afterUpload)afterUpload(source);
      },
      getMetadata:async()=>{
        if(permissionDenied)throw Error("permission-denied");
        if(!stored)throw Error("object not found");
        return {bucket:staging.BUCKET,fullPath:stored.path,size:stored.bytes.byteLength,
          contentType:stored.options.contentType,customMetadata:stored.options.customMetadata};
      },
      getDownloadURL:async()=>{
        if(permissionDenied)throw Error("permission-denied");
        return "https://example.invalid/token-never-logged";
      }
    })})
  };
  const fetchImpl=async()=>{
    if(permissionDenied)throw Error("permission-denied");
    const data=structuredClone(stored.bytes);
    if(tamper)data[18]^=1;
    return {ok:true,headers:{get:()=>String(data.length)},
      arrayBuffer:async()=>data.buffer};
  };
  const app={name:"[DEFAULT]",options:{projectId:staging.PROJECT,storageBucket:staging.BUCKET},
    auth:()=>({currentUser:{uid}}),firestore:()=>db,storage:()=>storage};
  const args={app,cryptoApi:webcrypto,fetchImpl,newId:()=>"fixed_test_id",now:()=>started,confirmation:staging.CONFIRMATION};
  return {args,state:source,stats:()=>({firestoreReads,firestoreWrites,storageWrites}),
    deny:()=>{permissionDenied=true},tamper:()=>{tamper=true},stored:()=>stored};
}
test("a probe verifies an immutable working-folder object without Firestore mutation",async()=>{
  const e=backend(),result=await staging.execute({...e.args,phase:"probe"});
  assert.equal(result.verified,true);assert.equal(result.sourceRevision,0);
  assert.match(result.path,/\/working\/v1\/probe\//);
  assert.deepEqual(e.stats(),{firestoreReads:0,firestoreWrites:0,storageWrites:1});
});
test("complete state can be staged and independently read back unchanged",async()=>{
  const e=backend(),before=JSON.stringify(e.state);
  const result=await staging.execute({...e.args,phase:"snapshot"});
  assert.equal(result.verified,true);
  assert.equal(result.sourceMaintenanceEvents,2);
  assert.equal(result.sourceRevision,e.state.syncMeta.rev);
  assert.equal(JSON.stringify(e.state),before);
  assert.deepEqual(e.stats(),{firestoreReads:4,firestoreWrites:0,storageWrites:1});
});
test("reject wrong project, missing confirmation, invalid source before upload",async()=>{
  const e=backend();
  await assert.rejects(staging.execute({...e.args,phase:"probe",confirmation:"wrong"}),/confirmation/);
  await assert.rejects(staging.execute({...e.args,phase:"probe",app:{...e.args.app,options:{projectId:"bad",storageBucket:staging.BUCKET}}}),/wrong Firebase/);
  assert.equal(e.stats().storageWrites,0);
  const invalid=backend({source:{schema:72,syncMeta:{rev:11},maintenanceOccurrencesV2:[]}});
  await assert.rejects(staging.execute({...invalid.args,phase:"snapshot"}),/protected source field/);
  assert.equal(invalid.stats().storageWrites,0);
});
test("denied archive read cannot pass verification",async()=>{
  const e=backend({afterUpload:()=>e.deny()});
  await assert.rejects(staging.execute({...e.args,phase:"snapshot"}),/permission-denied/);
  assert.equal(e.stats().firestoreWrites,0);
});
test("tampered download cannot pass SHA-256",async()=>{
  const e=backend({afterUpload:()=>e.tamper()});
  await assert.rejects(staging.execute({...e.args,phase:"snapshot"}),/SHA-256 mismatch/);
  assert.equal(e.stats().firestoreWrites,0);
});
test("source change after independent upload suspends migration verification",async()=>{
  const e=backend({afterUpload:source=>source.inventory.push({id:"new_item"})});
  await assert.rejects(staging.execute({...e.args,phase:"snapshot"}),/source changed afterwards/);
  assert.equal(e.stats().firestoreWrites,0);
});
test("archive of synthetic state does not silently drop arbitrary fields",async()=>{
  const state=fixture();state.extra={a:["sample",0,{b:true}]};
  const e=backend({source:state});
  const result=await staging.execute({...e.args,phase:"snapshot"});
  const saved=JSON.parse(new TextDecoder().decode(e.stored().bytes));
  assert.deepEqual(saved.source,state);
  assert.equal(result.sourceFields,Object.keys(state).length);
});
