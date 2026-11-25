"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{webcrypto}=require("node:crypto");
const W=require("../js/omaxWorkingStorage"),S=require("../js/omaxShardedState"),T=require("../js/omaxWorkingShards");
const UID="GntsaU7i2tXdDf05ds8cws5dfi63";
const fixture=()=>({
  schema:72,syncMeta:{rev:1794576947956},maintenanceOccurrencesV2:[{id:"one",eventType:"scheduled"},{id:"two",eventType:"removed"}],
  maintenanceCalendarInstancesV2:[{id:"ins"}],maintenanceTasksV2:[{id:"task"}],tasksInterval:[],tasksAsReq:[],
  completedCuttingJobs:[{id:"job1",manualLogs:[{id:"log1"}]}],cuttingJobs:[],
  inventory:[{id:"stock",amount:3}],receiptTrackerWeeks:[{id:"w1",rows:[{id:"row1"}]}],
  orderRequests:[],totalHistory:[],dailyCutHours:[],deletedItems:[],costLayout:{a:1},waterQualityChecks:[],
  customExtension:{unknown:{nested:"preserve"}}
});
function fake({afterPut}={}){
  const state=fixture(),files=new Map();let reads=0,writes=0,uploads=0,denied=false,tampered=false;
  const db={
    doc:path=>({path}),
    runTransaction:fn=>fn({
      get:async ref=>{
        reads++;
        return {exists:true,metadata:{fromCache:false,hasPendingWrites:false},ref:{path:ref.path},
          data:()=>structuredClone(state)};
      },
      set:()=>{writes++;throw Error("Illegal Firestore transaction.set");},
      update:()=>{writes++;throw Error("Illegal Firestore transaction.update");},
      delete:()=>{writes++;throw Error("Illegal Firestore transaction.delete");}
    })
  };
  const storage={ref:()=>({child:path=>({
    put:async(blob,opts)=>{
      uploads++;
      if(files.has(path))throw Error("immutable overwrite attempt");
      files.set(path,{body:new Uint8Array(await blob.arrayBuffer()),options:opts});
      if(afterPut)afterPut({state,uploads,files});
    },
    getMetadata:async()=>{
      if(denied)throw Error("permission-denied");
      const item=files.get(path);
      if(!item)throw Error("missing Storage object");
      return {bucket:T.BUCKET,fullPath:path,size:item.body.byteLength,
        contentType:item.options.contentType,customMetadata:item.options.customMetadata};
    },
    getDownloadURL:async()=>{
      if(denied)throw Error("permission-denied");
      return "mock://"+path;
    }
  })})};
  const fetchImpl=async url=>{
    if(denied)throw Error("permission-denied");
    const item=files.get(url.slice("mock://".length)),original=item.body;
    const bytes=new Uint8Array(original);
    if(tampered)bytes[20]^=1;
    return {ok:true,headers:{get:()=>String(bytes.byteLength)},arrayBuffer:async()=>bytes.buffer};
  };
  const app={name:"[DEFAULT]",options:{projectId:W.PROJECT,storageBucket:W.BUCKET},
    auth:()=>({currentUser:{uid:UID}}),firestore:()=>db,storage:()=>storage};
  return {
    args:{confirmation:T.PHRASE,app,sharder:S,working:W,cryptoApi:webcrypto,
      fetchImpl,newId:()=>"unit_test_01",now:()=>"2026-11-17T22:00:00.000Z"},
    state,files,deny:()=>{denied=true},tamper:()=>{tampered=true},
    stats:()=>({reads,writes,uploads})
  };
}
test("all fields copied as immutable shards, verified and source retained",async()=>{
  const e=fake(),original=JSON.stringify(e.state);
  const result=await T.stage(e.args);
  assert.equal(result.verified,true);
  assert.equal(result.fieldCount,Object.keys(e.state).length);
  assert.equal(result.archiveObjects,Object.keys(e.state).length+1);
  assert.deepEqual(e.stats(),{reads:4,writes:0,uploads:result.archiveObjects});
  assert.equal(JSON.stringify(e.state),original);
  assert.ok(e.files.has(result.manifestPath));
  const manifest=JSON.parse(new TextDecoder().decode(e.files.get(result.manifestPath).body));
  const parts=new Map(manifest.shards.map(s=>[s.path,new TextDecoder().decode(e.files.get(s.path).body)]));
  assert.deepEqual(JSON.parse(JSON.stringify(await S.reconstruct({manifest,serializedByPath:parts,cryptoApi:webcrypto}))),e.state);
});
test("incorrect Firebase project blocks staging",async()=>{
  const e=fake();e.args.app.options.projectId="wrong";
  await assert.rejects(T.stage(e.args),/environment not verified|Firebase project/);
  assert.deepEqual(e.stats(),{reads:0,writes:0,uploads:0});
});
test("unverified downloaded shard fails with no Firestore changes",async()=>{
  const e=fake({afterPut:()=>e.tamper()});
  await assert.rejects(T.stage(e.args),/SHA-256 mismatch/);
  assert.equal(e.stats().writes,0);
  assert.ok(e.stats().uploads>0);
});
test("denied Storage get fails closed",async()=>{
  const e=fake({afterPut:()=>e.deny()});
  await assert.rejects(T.stage(e.args),/permission-denied/);
  assert.equal(e.stats().writes,0);
});
test("concurrent authoritative change after staging refuses migration readiness",async()=>{
  const e=fake({afterPut:({uploads,state})=>{if(uploads===1)state.inventory.push({id:"later"});}});
  await assert.rejects(T.stage(e.args),/source changed after staged upload/);
  assert.equal(e.stats().writes,0);
});
test("missing required source field stops before upload",async()=>{
  const e=fake();delete e.state.maintenanceOccurrencesV2;
  await assert.rejects(T.stage(e.args),/protected source field/);
  assert.equal(e.stats().uploads,0);
});
