"use strict";
// MCAP-SHARDED-EMU: real Firestore emulator + real sharding/staging/readback/CAS.
// Storage is strictly an in-memory stand-in. No live Firebase project, account,
// download, or production state is read or written.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {webcrypto}=require("node:crypto");
const {initializeTestEnvironment}=require("@firebase/rules-unit-testing");
const {doc,setDoc,getDoc,runTransaction,updateDoc}=require("firebase/firestore");
const State=require("../js/omaxShardedState");
const Working=require("../js/omaxWorkingStorage");
const Staging=require("../js/omaxWorkingShards");
const Readback=require("../js/omaxShardedReadback");
const Commit=require("../js/omaxShardedCommit");
const Ack=require("../js/omaxShardedAcknowledgement");
const Router=require("../js/omaxAuthorityRouter");

const PROJECT="demo-mcap-security";
const OWNER="GntsaU7i2tXdDf05ds8cws5dfi63";
const STATE_PATH="workspaces/github-prod/app/state";
const INDEX_PATH="workspaces/github-prod/app/stateIndexV1";
const REV=1794576947956;
const clone=v=>JSON.parse(JSON.stringify(v));

function fixture(){
  return {schema:72,syncMeta:{rev:REV},
    maintenanceOccurrencesV2:[{id:"m01",eventType:"completed",effectiveDateISO:"2026-10-01"}],
    maintenanceCalendarInstancesV2:[{id:"i01",taskId:"t01"}],
    maintenanceTasksV2:[{id:"t01",name:"Fixture maintenance"}],
    tasksInterval:[{id:"legacy-task01"}],tasksAsReq:[],
    cuttingJobs:[{id:"active01",name:"Retain active"}],
    completedCuttingJobs:[{id:"completed01",name:"Retain completed"}],
    inventory:[{id:"inv01",qty:2}],
    receiptTrackerWeeks:[{key:"2026-W40",rows:[]}],
    orderRequests:[{id:"order01",status:"review"}],
    totalHistory:[{dateISO:"2026-10-01",hours:220}],
    dailyCutHours:[{dateISO:"2026-10-01",hours:4}],
    deletedItems:[{id:"trash01",type:"maintenance"}],
    unknownAppFields:{opaque:"must-survive",nested:[1,2,3]}};
}
function snapshot(raw){
  return {exists:raw.exists(),ref:{path:raw.ref.path},
    metadata:{fromCache:raw.metadata?.fromCache||false,
      hasPendingWrites:raw.metadata?.hasPendingWrites||false},
    data:()=>raw.data()};
}
function compatDb(db){
  const docs=new Map();
  return {doc(p){
      if(!docs.has(p)){
        const ref=doc(db,p);
        docs.set(p,{path:p,ref,get:async()=>snapshot(await getDoc(ref))});
      }
      return docs.get(p);
    },
    runTransaction:callback=>runTransaction(db,async tx=>callback({
      get:async wrapped=>snapshot(await tx.get(wrapped.ref)),
      set:(wrapped,v)=>tx.set(wrapped.ref,v),
      update:(wrapped,v)=>tx.update(wrapped.ref,v),
      delete:wrapped=>tx.delete(wrapped.ref)
    }))
  };
}
function mockStorage(){
  const objects=new Map();
  const api={ref:()=>({child:p=>({
    put:async(blob,options)=>{
      assert.ok(!objects.has(p),"Immutable Storage objects must not be overwritten");
      objects.set(p,{bytes:new Uint8Array(await blob.arrayBuffer()),options});
    },
    getMetadata:async()=>{
      const x=objects.get(p);
      if(!x)throw Error("Missing immutable Storage object: "+p);
      return {bucket:Commit.BUCKET,fullPath:p,size:x.bytes.length,
        contentType:x.options.contentType,
        customMetadata:x.options.customMetadata};
    },
    getDownloadURL:async()=> "https://mcap.invalid/"+p
  })})};
  const fetchImpl=async url=>{
    const x=objects.get(url.slice("https://mcap.invalid/".length));
    if(!x)return {ok:false,status:404};
    return {ok:true,headers:{get:key=>key==="content-length"?String(x.bytes.length):null},
      arrayBuffer:async()=>Uint8Array.from(x.bytes).buffer};
  };
  return {api,objects,fetchImpl};
}
let counter=0;
function client(env,storage){
  const db=env.authenticatedContext(OWNER).firestore();
  const adapter=compatDb(db);
  const app={name:"[DEFAULT]",options:{
      projectId:Commit.PROJECT,storageBucket:Commit.BUCKET},
    auth:()=>({currentUser:{uid:OWNER}}),
    firestore:()=>adapter,storage:()=>storage.api};
  return {db,app,adapter,
    context:{app,reader:Readback,stager:Staging,sharder:State,
      working:Working,cryptoApi:webcrypto,fetchImpl:storage.fetchImpl,
      newId:()=>"integration_"+(++counter),
      now:()=>new Date().toISOString()},
    router:{app,commit:Commit,readback:Readback,sharder:State,
      working:Working,cryptoApi:webcrypto,fetchImpl:storage.fetchImpl}};
}
test("active Storage read, protected save, reload, stale second client, and old-client lockout against real Firestore rules",
  {timeout:90000},async()=>{
    assert.equal(process.env.GCLOUD_PROJECT,PROJECT,
      "Must run only against disposable demo-mcap-security.");
    assert.ok(process.env.FIRESTORE_EMULATOR_HOST,
      "A real local Firestore emulator is required.");
    const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(":");
    const rules=fs.readFileSync(path.join(__dirname,"../docs/firestore-sharded-cutover-PROPOSAL.rules"),"utf8");
    const env=await initializeTestEnvironment({
      projectId:PROJECT,firestore:{host,port:Number(port),rules}
    });
    try{
      await env.clearFirestore();
      const baseline=fixture();
      await env.withSecurityRulesDisabled(async context=>{
        await setDoc(doc(context.firestore(),STATE_PATH),baseline);
      });
      const storage=mockStorage(),a=client(env,storage),b=client(env,storage);
      const original=(await getDoc(doc(a.db,STATE_PATH))).data();
      // The identical real Storage module stages and independently verifies
      // a snapshot; only the bytes and Storage API are mocked.
      const staged=await Staging.stage({
        ...a.context,confirmation:Staging.PHRASE,providedSource:baseline
      });
      assert.equal(staged.verified,true);
      assert.equal(staged.fieldCount,Object.keys(baseline).length);
      assert.equal(storage.objects.size,staged.archiveObjects);
      const initialIndex={
        schemaVersion:1,mode:"active",workspaceId:"github-prod",
        projectId:Commit.PROJECT,bucket:Commit.BUCKET,
        revision:REV,previousRevision:0,
        manifestPath:staged.manifestPath,manifestSha256:staged.manifestSha256,
        operationId:staged.operationId,actorUid:staged.actorUid,
        createdAtISO:staged.createdAtISO
      };
      await runTransaction(a.db,async tx=>{
        const state=await tx.get(doc(a.db,STATE_PATH));
        const pointer=await tx.get(doc(a.db,INDEX_PATH));
        assert.equal(state.data().syncMeta.rev,REV);
        assert.equal(pointer.exists(),false);
        tx.set(doc(a.db,INDEX_PATH),initialIndex);
      });
      const fromA=await Router.resolve(a.router);
      const fromB=await Router.resolve(b.router);
      assert.equal(fromA.mode,"sharded");
      assert.equal(fromB.mode,"sharded");
      assert.equal(fromA.revision,REV);
      assert.equal(State.canonical(fromA.state),State.canonical(baseline));
      assert.equal(State.canonical(fromB.state),State.canonical(baseline));
      const update=clone(fromA.state);
      update.inventory.push({id:"new-inv01",qty:3});
      update.maintenanceOccurrencesV2.push({id:"m02",eventType:"completed"});
      const saved=await Commit.save({...a.context,state:update,
        expectedRevision:REV,clientId:"browserA",timeNow:()=>REV+1,
        prepare:pending=>pending,scan:()=>({contaminated:false})});
      assert.equal(saved.saved,true,JSON.stringify(saved));
      assert.equal(saved.indeterminate,false);
      const after=await Router.resolve(b.router);
      assert.equal(after.mode,"sharded");
      assert.equal(after.revision,REV+1);
      assert.equal(after.state.inventory.length,2);
      assert.equal(after.state.maintenanceOccurrencesV2.length,2);
      // Test the SAME strict acknowledgement contract used by core's
      // sharded ordinary save path against genuine emulator index evidence.
      const proof=Ack.confirm({committedState:saved.committedState,
        verifiedState:after.state,expectedRevision:REV,canonical:State.canonical});
      assert.equal(proof.verified,true);
      assert.equal(proof.revision,REV+1);
      assert.deepEqual(after.state.unknownAppFields,baseline.unknownAppFields);
      assert.deepEqual(after.state.completedCuttingJobs,baseline.completedCuttingJobs);
      const stale=await Commit.save({...b.context,state:baseline,
        expectedRevision:REV,clientId:"browserB",timeNow:()=>REV+2,
        prepare:pending=>pending,scan:()=>({contaminated:false})});
      assert.equal(stale.saved,false);
      assert.equal(stale.errorCode,"revision_conflict");
      assert.equal(stale.stateWriteAttempted,false);
      await assert.rejects(
        updateDoc(doc(b.db,STATE_PATH),{"syncMeta.rev":REV+100}),
        /permission|denied/i
      );
      const legacyAfter=(await getDoc(doc(a.db,STATE_PATH))).data();
      assert.deepEqual(legacyAfter,original,"No historical monolithic data may change.");
      const index=(await getDoc(doc(a.db,INDEX_PATH))).data();
      assert.equal(index.revision,REV+1);
      assert.equal(index.previousRevision,REV);
      // Immutable upload objects persist as historical versions, including
      // a rejected stale client's possible unreferenced staging objects.
      assert.ok(storage.objects.size>=staged.archiveObjects);
    }finally{await env.cleanup();}
  });

test("two active Storage clients race after staging; only the winning CAS becomes authoritative",
  {timeout:90000},async()=>{
    assert.equal(process.env.GCLOUD_PROJECT,PROJECT);
    assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
    const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(":");
    const rules=fs.readFileSync(path.join(__dirname,"../docs/firestore-sharded-cutover-PROPOSAL.rules"),"utf8");
    const env=await initializeTestEnvironment({
      projectId:PROJECT,firestore:{host,port:Number(port),rules}
    });
    try{
      await env.clearFirestore();
      const baseline=fixture();
      await env.withSecurityRulesDisabled(async context=>{
        await setDoc(doc(context.firestore(),STATE_PATH),baseline);
      });
      const storage=mockStorage(),a=client(env,storage),b=client(env,storage);
      const staged=await Staging.stage({
        ...a.context,confirmation:Staging.PHRASE,providedSource:baseline
      });
      await setDoc(doc(a.db,INDEX_PATH),{
        schemaVersion:1,mode:"active",workspaceId:"github-prod",
        projectId:Commit.PROJECT,bucket:Commit.BUCKET,
        revision:REV,previousRevision:0,
        manifestPath:staged.manifestPath,manifestSha256:staged.manifestSha256,
        operationId:staged.operationId,actorUid:staged.actorUid,
        createdAtISO:staged.createdAtISO
      });
      let notifyStaging,releaseStage;
      const stagedA=new Promise(resolve=>notifyStaging=resolve);
      const allowA=new Promise(resolve=>releaseStage=resolve);
      const pendingA=clone(baseline);
      pendingA.inventory.push({id:"losing-inventory",qty:10});
      const pendingB=clone(baseline);
      pendingB.orderRequests.push({id:"winning-order",qty:1});
      const holdA={...Staging,stage:async options=>{
        const upload=await Staging.stage(options);
        notifyStaging();
        await allowA;
        return upload;
      }};
      const savingA=Commit.save({...a.context,stager:holdA,
        state:pendingA,expectedRevision:REV,
        clientId:"racingA",timeNow:()=>REV+1,
        prepare:x=>x,scan:()=>({contaminated:false})});
      let resultA;
      try{
        await stagedA;
        const resultB=await Commit.save({...b.context,
          state:pendingB,expectedRevision:REV,
          clientId:"racingB",timeNow:()=>REV+2,
          prepare:x=>x,scan:()=>({contaminated:false})});
        assert.equal(resultB.saved,true,JSON.stringify(resultB));
      }finally{
        releaseStage();
      }
      resultA=await savingA;
      assert.equal(resultA.saved,false);
      assert.equal(resultA.errorCode,"revision_conflict");
      assert.equal(resultA.stateWriteAttempted,false);
      assert.equal(resultA.indeterminate,false);
      const current=await Router.resolve(a.router);
      assert.equal(current.mode,"sharded");
      assert.equal(current.revision,REV+2);
      assert.equal(current.state.orderRequests.some(row=>row.id==="winning-order"),true);
      assert.equal(current.state.inventory.some(row=>row.id==="losing-inventory"),false);
      assert.equal(current.state.maintenanceOccurrencesV2.length,baseline.maintenanceOccurrencesV2.length);
      assert.deepEqual((await getDoc(doc(a.db,STATE_PATH))).data(),baseline);
      // The losing immutable staging objects remain, but the active pointer
      // must not reference them. Never garbage-collect them automatically.
      assert.ok(storage.objects.size>staged.archiveObjects);
    }finally{await env.cleanup();}
  });
