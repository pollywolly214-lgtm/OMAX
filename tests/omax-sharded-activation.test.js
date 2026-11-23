"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {webcrypto}=require("node:crypto");
const Shards=require("../js/omaxShardedState");
const Working=require("../js/omaxWorkingStorage");
const Stager=require("../js/omaxWorkingShards");
const Reader=require("../js/omaxShardedReadback");
const Activation=require("../js/omaxShardedActivation");
const uid="GntsaU7i2tXdDf05ds8cws5dfi63";
let sequence=0;
const clone=value=>JSON.parse(JSON.stringify(value));
function state(){
  return {schema:72,syncMeta:{rev:11},maintenanceOccurrencesV2:[{id:"event001"}],
    maintenanceCalendarInstancesV2:[],maintenanceTasksV2:[],tasksInterval:[],tasksAsReq:[],
    cuttingJobs:[],completedCuttingJobs:[],inventory:[],receiptTrackerWeeks:[],
    orderRequests:[],totalHistory:[],dailyCutHours:[],deletedItems:[],unknown:"retain"};
}
function setup(){
  let legacy=state(),index=null,committedWrites=0;
  let transactionCount=0,injectRaceAt=Infinity;
  const stored=new Map();
  const read=(path)=>({exists:path===Activation.LEGACY?legacy!==null:index!==null,
    ref:{path},metadata:{fromCache:false,hasPendingWrites:false},
    data:()=>clone(path===Activation.LEGACY?legacy:index)});
  const db={doc:path=>({path,get:async()=>read(path)}),
    runTransaction:async fn=>{
      const ordinal=++transactionCount;
      return fn({
      get:async ref=>{
        const snapshot=read(ref.path);
        if(ordinal===injectRaceAt&&ref.path===Activation.LEGACY)
          return {...snapshot,data:()=>({...snapshot.data(),syncMeta:{rev:12}})};
        return snapshot;
      },
      set:(ref,data)=>{
        assert.equal(ref.path,Activation.INDEX);
        index=clone(data);committedWrites++;
      },
      delete:ref=>{
        assert.equal(ref.path,Activation.INDEX);
        index=null;committedWrites++;
      }
    });
    }};
  const storage={ref:()=>({child:path=>({
    put:async(blob,metadata)=>{
      if(stored.has(path))throw Error("Immutable Storage object exists.");
      stored.set(path,{data:new Uint8Array(await blob.arrayBuffer()),metadata});
    },
    getMetadata:async()=>{
      const item=stored.get(path);
      if(!item)throw Error("Missing Storage object.");
      return {bucket:Activation.BUCKET,fullPath:path,size:item.data.byteLength,
        contentType:item.metadata.contentType,
        customMetadata:item.metadata.customMetadata};
    },
    getDownloadURL:async()=>"https://mock.invalid/"+path
  })})};
  const app={name:"[DEFAULT]",
    options:{projectId:Activation.PROJECT,storageBucket:Activation.BUCKET},
    auth:()=>({currentUser:{uid}}),firestore:()=>db,storage:()=>storage};
  const fetchImpl=async url=>{
    const item=stored.get(url.slice("https://mock.invalid/".length));
    return {ok:!!item,headers:{get:()=>String(item.data.length)},
      arrayBuffer:async()=>Uint8Array.from(item.data).buffer};
  };
  const args={app,reader:Reader,sharder:Shards,working:Working,
    cryptoApi:webcrypto,fetchImpl};
  return {args,index:()=>clone(index),legacy:()=>clone(legacy),
    writes:()=>committedWrites,setLegacy:s=>legacy=clone(s),
    setIndex:s=>index=clone(s),race:(phase="activate")=>{
      // Activation makes three transaction reads before its index commit;
      // rollback makes two. Inject the change within its write transaction.
      injectRaceAt=transactionCount+(phase==="rollback"?3:4);
    },
    stage:async()=>{
      const result=await Stager.stage({...args,confirmation:Stager.PHRASE,
        providedSource:legacy,
        newId:()=>"verification_"+(++sequence),
        now:()=>new Date().toISOString()});
      return {...result,sourceRevision:result.revision};
    }};
}
test("preflight verifies a complete copy, with no writes or private state in response",async()=>{
  const e=setup(),candidate=await e.stage();
  const proof=await Activation.verify({...e.args,candidate});
  assert.equal(proof.verified,true);
  assert.equal(proof.revision,11);
  assert.equal(proof.fieldCount,16);
  assert.equal(e.writes(),0);
  assert.equal(Object.hasOwn(proof,"sourceCanonical"),false);
});
test("approval is mandatory; activation never deletes the legacy state",async()=>{
  const e=setup(),candidate=await e.stage(),before=e.legacy();
  await assert.rejects(Activation.activate({...e.args,candidate,approval:"WRONG",rulesEnforced:true}),
    {code:"approval_missing"});
  assert.equal(e.writes(),0);
  const activated=await Activation.activate({...e.args,candidate,
    approval:"ACTIVATE OMAX SHARDED AUTHORITY",rulesEnforced:true});
  assert.equal(activated.activated,true);
  assert.equal(e.index().revision,11);
  assert.deepEqual(e.legacy(),before);
  assert.equal(e.writes(),1);
});
test("rejects stale copy when a new Firestore revision exists",async()=>{
  const e=setup(),candidate=await e.stage(),modified=e.legacy();
  modified.syncMeta.rev=12;e.setLegacy(modified);
  await assert.rejects(Activation.verify({...e.args,candidate}),{code:"stale_candidate"});
  assert.equal(e.writes(),0);
});
test("transaction-time revision changes abort activation without index writes",async()=>{
  const e=setup(),candidate=await e.stage();e.race();
  await assert.rejects(Activation.activate({...e.args,candidate,
    approval:"ACTIVATE OMAX SHARDED AUTHORITY",rulesEnforced:true}),
    {code:"concurrent_revision"});
  assert.equal(e.index(),null);
  assert.equal(e.writes(),0);
});
test("existing index blocks any second migration activation",async()=>{
  const e=setup(),candidate=await e.stage();
  e.setIndex({mode:"active",revision:11});
  await assert.rejects(Activation.verify({...e.args,candidate}),{code:"already_indexed"});
  assert.equal(e.writes(),0);
});

test("explicit pre-first-write rollback restores original authority without touching business records",async()=>{
  const e=setup(),candidate=await e.stage(),before=e.legacy();
  await Activation.activate({...e.args,candidate,
    approval:"ACTIVATE OMAX SHARDED AUTHORITY",rulesEnforced:true});
  await assert.rejects(Activation.rollbackBeforeFirstWrite({...e.args,
    approval:"WRONG",rulesEnforced:true}),{code:"approval_missing"});
  const result=await Activation.rollbackBeforeFirstWrite({...e.args,
    approval:"ROLL BACK OMAX BEFORE FIRST SHARDED SAVE",rulesEnforced:true});
  assert.equal(result.rolledBack,true);
  assert.equal(e.index(),null);
  assert.deepEqual(e.legacy(),before);
  assert.equal(e.writes(),2);
});
test("rollback refuses if new history was saved after activation",async()=>{
  const e=setup(),candidate=await e.stage();
  await Activation.activate({...e.args,candidate,
    approval:"ACTIVATE OMAX SHARDED AUTHORITY",rulesEnforced:true});
  const i=e.index();
  e.setIndex({...i,previousRevision:11,revision:12});
  await assert.rejects(Activation.rollbackBeforeFirstWrite({...e.args,
    approval:"ROLL BACK OMAX BEFORE FIRST SHARDED SAVE",rulesEnforced:true}),
    {code:"rollback_unsafe"});
  assert.equal(e.index().revision,12);
  assert.equal(e.writes(),1);
});
test("transaction-time mutation refuses rollback without deleting active pointer",async()=>{
  const e=setup(),candidate=await e.stage();
  await Activation.activate({...e.args,candidate,
    approval:"ACTIVATE OMAX SHARDED AUTHORITY",rulesEnforced:true});
  e.race("rollback");
  await assert.rejects(Activation.rollbackBeforeFirstWrite({...e.args,
    approval:"ROLL BACK OMAX BEFORE FIRST SHARDED SAVE",rulesEnforced:true}),
    {code:"rollback_conflict"});
  assert.ok(e.index());
  assert.equal(e.writes(),1);
});
