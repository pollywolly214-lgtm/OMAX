"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const Router=require("../js/omaxAuthorityRouter");
const Commit=require("../js/omaxShardedCommit");
const clone=x=>JSON.parse(JSON.stringify(x));
const state=()=>({
  schema:72,syncMeta:{rev:11},maintenanceOccurrencesV2:[{id:"event1"}],
  maintenanceCalendarInstancesV2:[],maintenanceTasksV2:[],tasksInterval:[],
  tasksAsReq:[],cuttingJobs:[],completedCuttingJobs:[],inventory:[],
  receiptTrackerWeeks:[],orderRequests:[],totalHistory:[],dailyCutHours:[],
  deletedItems:[],unrecognizedExtension:{mustRemain:true}
});
const index=()=>({
  schemaVersion:1,mode:"active",workspaceId:Router.WORKSPACE,
  projectId:Router.PROJECT,bucket:Router.BUCKET,revision:11,
  previousRevision:0,operationId:"test_operation",actorUid:"GntsaU7i2tXdDf05ds8cws5dfi63",
  manifestSha256:"a".repeat(64),
  manifestPath:"workspaces/github-prod/state-shards/v1/_manifest/test_operation/"
    +"a".repeat(64)+".json",
  createdAtISO:"2026-11-18T10:00:00.000Z"
});
function fixture(){
  let selection=null,legacy=state(),error=null,swap=false,corrupt=false,readCount=0;
  const snap=(ref,contents)=>({
    ref:{path:ref.path},exists:contents!==null,
    metadata:{fromCache:false,hasPendingWrites:false},
    data:()=>clone(contents)
  });
  const db={runTransaction:async()=>{throw Error("Router must not issue a transaction.");},
    doc:path=>({path,get:async({source})=>{
      assert.equal(source,"server");
      if(error && path===Router.INDEX_PATH)throw error;
      if(path===Router.INDEX_PATH){
        readCount++;
        const value=swap && readCount===2
          ?{...selection,revision:selection.revision+1}:selection;
        return snap({path},value);
      }
      assert.equal(path,Router.STATE_PATH);
      return snap({path},legacy);
    }})};
  const app={name:"[DEFAULT]",
    options:{projectId:Router.PROJECT,storageBucket:Router.BUCKET},
    auth:()=>({currentUser:{uid:"GntsaU7i2tXdDf05ds8cws5dfi63"}}),
    firestore:()=>db};
  let reads=0;
  const args={app,commit:Commit,
    readback:{read:async()=>{
      reads++;
      if(corrupt)throw Error("Shard checksum mismatch");
      return {state:clone(legacy),summary:{verified:true,revision:11}};
    }},
    sharder:{canonical:x=>JSON.stringify(x)},
    working:{validateSource:x=>{
      assert.ok(x && x.schema===72 && x.syncMeta);
      return x;
    }},
    cryptoApi:{subtle:{digest:async()=>new Uint8Array(32).buffer}},
    fetchImpl:async()=>({ok:true})};
  return {args,
    setIndex:v=>selection=clone(v),
    setLegacy:v=>legacy=clone(v),
    setError:e=>error=e,
    changeIndex:()=>swap=true,
    corruptShard:()=>corrupt=true,
    reads:()=>reads,
    indexReads:()=>readCount};
}
test("without an active index, reads only the legacy authoritative document",async()=>{
  const f=fixture(),result=await Router.resolve(f.args);
  assert.equal(result.mode,"legacy");
  assert.equal(result.revision,11);
  assert.equal(result.verified,true);
  assert.deepEqual(result.state,state());
  assert.equal(f.indexReads(),2);
  assert.equal(f.reads(),0);
});
test("with an active index, reconstructs full Storage state and not legacy view",async()=>{
  const f=fixture();f.setIndex(index());
  const result=await Router.resolve(f.args);
  assert.equal(result.mode,"sharded");
  assert.equal(result.revision,11);
  assert.deepEqual(result.state.unrecognizedExtension,{mustRemain:true});
  assert.equal(f.reads(),1);
  assert.equal(f.indexReads(),2);
});
test("rejects permission-denied index lookup rather than falling back to legacy",async()=>{
  const f=fixture();f.setError(Object.assign(Error("denied"),{code:"permission-denied"}));
  await assert.rejects(Router.resolve(f.args),/denied/);
  assert.equal(f.reads(),0);
});
test("rejects a missing legacy source instead of manufacturing default data",async()=>{
  const f=fixture();f.setLegacy(null);
  await assert.rejects(Router.resolve(f.args),{code:"missing_legacy"});
});
test("rejects malformed active authority index",async()=>{
  const f=fixture();f.setIndex({...index(),revision:-1});
  await assert.rejects(Router.resolve(f.args),{code:"invalid_index"});
});
test("rejects independent Storage reconstruction/checksum failure",async()=>{
  const f=fixture();f.setIndex(index());f.corruptShard();
  await assert.rejects(Router.resolve(f.args),/checksum mismatch/);
});
test("rejects index CAS pointer changes during multi-shard download",async()=>{
  const f=fixture();f.setIndex(index());f.changeIndex();
  await assert.rejects(Router.resolve(f.args),{code:"index_changed"});
});
test("rejects a Storage copy with wrong revision",async()=>{
  const f=fixture();f.setIndex({...index(),revision:12});
  await assert.rejects(Router.resolve(f.args),{code:"incomplete_sharded_read"});
});
