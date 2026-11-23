"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{webcrypto}=require("node:crypto");
const Shards=require("../js/omaxShardedState");
const Working=require("../js/omaxWorkingStorage");
const Stager=require("../js/omaxWorkingShards");
const Readback=require("../js/omaxShardedReadback");
const Commit=require("../js/omaxShardedCommit");
const uid="GntsaU7i2tXdDf05ds8cws5dfi63";
let sequence=0;
const fixture=()=>({schema:72,syncMeta:{rev:11},maintenanceOccurrencesV2:[{id:"1",action:"scheduled"}],maintenanceCalendarInstancesV2:[],
  maintenanceTasksV2:[],tasksInterval:[],tasksAsReq:[],cuttingJobs:[],completedCuttingJobs:[],
  inventory:[],receiptTrackerWeeks:[],orderRequests:[],totalHistory:[],dailyCutHours:[],deletedItems:[],
  unknown:{preserve:[1,2,3]}});
function setup(){
  const stored=new Map();let index=null,transactions=0,forceConflict=false;
  const indexRef={path:Commit.INDEX_PATH,get:async()=>({exists:!!index,ref:{path:Commit.INDEX_PATH},
    metadata:{fromCache:false,hasPendingWrites:false},data:()=>structuredClone(index)})};
  const db={doc:path=>path===Commit.INDEX_PATH?indexRef:null,
    runTransaction:async callback=>{
      transactions++;
      const tx={get:async()=>({exists:!!index,data:()=>structuredClone(index)}),
        set:(_ref,value)=>{
          if(forceConflict)throw Object.assign(Error("Conflict"),{code:"aborted",definite:true});
          index=structuredClone(value);
        }};
      return callback(tx);
    }};
  const storage={ref:()=>({child:path=>({
    put:async(blob,metadata)=>{
      if(stored.has(path))throw Object.assign(Error("Already exists"),{code:"storage/unauthorized"});
      stored.set(path,{bytes:new Uint8Array(await blob.arrayBuffer()),metadata});
    },
    getMetadata:async()=>{
      const item=stored.get(path);
      if(!item)throw Error("Missing shard");
      return {fullPath:path,bucket:Commit.BUCKET,size:item.bytes.length,
        contentType:item.metadata.contentType,customMetadata:item.metadata.customMetadata};
    },
    getDownloadURL:async()=> "https://example.invalid/"+path
  })})};
  const app={name:"[DEFAULT]",options:{projectId:Commit.PROJECT,storageBucket:Commit.BUCKET},
    auth:()=>({currentUser:{uid}}),firestore:()=>db,storage:()=>storage};
  const fetchImpl=async url=>{
    const item=stored.get(url.slice("https://example.invalid/".length));
    return {ok:true,headers:{get:()=>String(item.bytes.length)},
      arrayBuffer:async()=>new Uint8Array(item.bytes).buffer};
  };
  const args={app,reader:Readback,stager:Stager,sharder:Shards,working:Working,
    cryptoApi:webcrypto,fetchImpl,newId:()=> "unique_"+(++sequence),
    now:()=>new Date().toISOString()};
  return {args,stored,transactions:()=>transactions,setIndex:value=>index=value,
    index:()=>index,forceConflict:()=>{forceConflict=true}};
}
async function initialize(e,source=fixture()){
  const staged=await Stager.stage({...e.args,providedSource:source,confirmation:Stager.PHRASE});
  e.setIndex({schemaVersion:1,mode:"active",workspaceId:"github-prod",projectId:Commit.PROJECT,
    bucket:Commit.BUCKET,revision:source.syncMeta.rev,manifestPath:staged.manifestPath,
    manifestSha256:staged.manifestSha256,operationId:staged.operationId,
    actorUid:staged.actorUid,createdAtISO:staged.createdAtISO});
  return source;
}
test("reads a complete existing authoritative staged state",async()=>{
  const e=setup(),source=await initialize(e);
  const result=await Commit.read(e.args);
  assert.deepEqual(result.state,source);
  assert.equal(result.index.revision,11);
});
test("commits a verified update through a manifest CAS without changing legacy state",async()=>{
  const e=setup(),original=await initialize(e);
  const change={...original,inventory:[{id:"stock",qty:14}]};
  const result=await Commit.save({...e.args,state:change,expectedRevision:11,
    prepare:pending=>pending,scan:()=>({contaminated:false}),clientId:"unit_test_client",
    timeNow:()=>12});
  assert.equal(result.saved,true);
  assert.equal(result.indeterminate,false);
  assert.equal(e.index().revision,12);
  assert.equal(e.index().previousRevision,11);
  assert.equal(e.transactions(),1);
  const fetched=await Commit.read(e.args);
  assert.deepEqual(fetched.state.inventory,change.inventory);
  assert.deepEqual(fetched.state.maintenanceOccurrencesV2,original.maintenanceOccurrencesV2);
  assert.deepEqual(fetched.state.unknown,original.unknown);
});
test("stale revision is rejected and index stays unchanged",async()=>{
  const e=setup(),original=await initialize(e),baseline=e.index();
  const result=await Commit.save({...e.args,state:original,expectedRevision:10,
    prepare:pending=>pending,scan:()=>({contaminated:false}),clientId:"unit_test_client",
    timeNow:()=>13});
  assert.equal(result.saved,false);assert.equal(result.errorCode,"revision_conflict");
  assert.deepEqual(e.index(),baseline);assert.equal(e.transactions(),0);
});
test("Firestore conflict leaves old manifest fully authoritative",async()=>{
  const e=setup(),original=await initialize(e),baseline=e.index();
  e.forceConflict();
  const result=await Commit.save({...e.args,state:original,expectedRevision:11,
    prepare:pending=>pending,scan:()=>({contaminated:false}),clientId:"unit_test_client",
    timeNow:()=>13});
  assert.equal(result.saved,false);assert.deepEqual(e.index(),baseline);
  assert.equal(result.stateWriteCompleted,false);
});
test("no active index means no write or automatic activation",async()=>{
  const e=setup();
  const result=await Commit.save({...e.args,state:fixture(),expectedRevision:11,
    prepare:pending=>pending,scan:()=>({contaminated:false}),clientId:"unit_test_client"});
  assert.equal(result.saved,false);
  assert.equal(e.transactions(),0);
});

test("post-CAS permission denial stays indeterminate; never tells user to retry",async()=>{
  const e=setup(),source=await initialize(e);
  const indexRef=e.args.app.firestore().doc(Commit.INDEX_PATH);
  const originalGet=indexRef.get;
  let reads=0;
  indexRef.get=async options=>{
    reads++;
    if(reads>=2)throw Object.assign(new Error("permission denied after CAS"),{code:"permission-denied"});
    return originalGet(options);
  };
  const next={...source,inventory:[{id:"one-verified-record"}]};
  const result=await Commit.save({...e.args,state:next,expectedRevision:11,
    prepare:pending=>pending,scan:()=>({contaminated:false}),
    clientId:"unit_test_client",timeNow:()=>12});
  assert.equal(result.saved,false);
  assert.equal(result.stateWriteAttempted,true);
  assert.equal(result.indeterminate,true);
  assert.equal(result.definiteFailure,false);
  assert.equal(result.blocked,false);
  assert.equal(e.index().revision,12);
  assert.equal(e.transactions(),1);
});
test("permission denial before CAS is a definite no-index-write failure",async()=>{
  const e=setup(),source=await initialize(e);
  const indexRef=e.args.app.firestore().doc(Commit.INDEX_PATH);
  indexRef.get=async()=>{throw Object.assign(new Error("permission denied"),{code:"permission-denied"})};
  const result=await Commit.save({...e.args,state:source,expectedRevision:11,
    prepare:pending=>pending,scan:()=>({contaminated:false}),
    clientId:"unit_test_client",timeNow:()=>12});
  assert.equal(result.saved,false);
  assert.equal(result.indeterminate,false);
  assert.equal(result.definiteFailure,true);
  assert.equal(result.stateWriteAttempted,false);
  assert.equal(e.index().revision,11);
  assert.equal(e.transactions(),0);
});
