(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXShardedCommit=api;
})(typeof window==="undefined"?null:window,function(){
  "use strict";
  // Future sharded-authority commit engine. NOT ENABLED IN CORE.
  // Requires an independently approved active index and backend lockout of
  // old full-document writers before use. Never activates the index itself.
  const PROJECT="wj-tracker-v2",BUCKET="wj-tracker-v2.firebasestorage.app";
  const WORKSPACE="github-prod",INDEX_PATH="workspaces/github-prod/app/stateIndexV1";
  const fail=(code,message)=>Object.assign(Error("OMAX sharded commit: "+message),{code,definite:true});
  const validID=x=>typeof x==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(x);
  const validSHA=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
  function checkIndex(index){
    if(index?.schemaVersion!==1||index.mode!=="active"||index.workspaceId!==WORKSPACE
      ||index.projectId!==PROJECT||index.bucket!==BUCKET
      ||!Number.isSafeInteger(index.revision)||index.revision<1
      ||!validSHA(index.manifestSha256)||typeof index.manifestPath!=="string"
      ||!validID(index.operationId)||!validID(index.actorUid)
      ||typeof index.createdAtISO!=="string"||index.createdAtISO.length>30
      ||index.manifestPath!=="workspaces/"+WORKSPACE+"/state-shards/v1/_manifest/"
        +index.operationId+"/"+index.manifestSha256+".json")
      throw fail("invalid_index","Active index is missing or invalid. Suspend all writes.");
    return index;
  }
  const rev=state=>{
    const n=state?.syncMeta?.rev;
    if(!Number.isSafeInteger(n)||n<0)throw fail("invalid_revision","Invalid authoritative revision.");
    return n;
  };
  function projectMerge(prepared,remote,setOptions){
    if(setOptions===null)return prepared;
    if(setOptions?.mergeFields){
      if(!Array.isArray(setOptions.mergeFields)||!setOptions.mergeFields.length)
        throw fail("invalid_merge","Unrecognized mergeFields settings.");
      const next={...remote};
      for(const key of setOptions.mergeFields){
        if(typeof key!=="string"||!Object.prototype.hasOwnProperty.call(prepared,key))
          throw fail("invalid_merge","Required merge field missing.");
        next[key]=prepared[key];
      }
      return next;
    }
    if(setOptions?.merge===true)return {...remote,...prepared};
    throw fail("invalid_merge","Unrecognized Firestore merge semantics.");
  }
  function env({app,reader,stager,sharder,working,cryptoApi,fetchImpl,newId,now}={}){
    if(!app||app.name!=="[DEFAULT]"||app.options?.projectId!==PROJECT
      ||app.options?.storageBucket!==BUCKET||typeof app.auth!=="function"
      ||typeof app.firestore!=="function"||reader?.PROJECT!==PROJECT
      ||typeof stager?.stage!=="function"||typeof sharder?.canonical!=="function"
      ||typeof working?.validateSource!=="function"||!cryptoApi?.subtle?.digest
      ||typeof fetchImpl!=="function"||typeof newId!=="function"||typeof now!=="function")
      throw fail("environment_mismatch","Firebase or sharded commit environment mismatch.");
    if(!validID(app.auth().currentUser?.uid))
      throw fail("unauthenticated","Authenticated owner required.");
    const db=app.firestore(),indexRef=db.doc(INDEX_PATH);
    if(!db||!indexRef||typeof db.runTransaction!=="function")
      throw fail("transaction_unavailable","Atomic Firestore index transactions unavailable.");
    return {db,indexRef,app,reader,stager,sharder,working,cryptoApi,fetchImpl,newId,now};
  }
  async function readIndex(ctx){
    // Firebase v8 server-get can reuse a stale listener snapshot. A read-only
    // transaction independently fetches the current backend pointer, which
    // matters especially for post-commit acknowledgement and CAS conflicts.
    const snap=await ctx.db.runTransaction(async tx=>tx.get(ctx.indexRef));
    if(!snap?.exists||snap.metadata?.fromCache===true
      ||snap.metadata?.hasPendingWrites===true||snap.ref?.path!==INDEX_PATH)
      throw fail("index_unavailable","Active index is not independently verified.");
    return checkIndex(snap.data());
  }
  async function readComplete(ctx,index){
    const result=await ctx.reader.read({...index,sourceRevision:index.revision,
      app:ctx.app,sharder:ctx.sharder,cryptoApi:ctx.cryptoApi,fetchImpl:ctx.fetchImpl});
    if(rev(result.state)!==index.revision)
      throw fail("revision_mismatch","Reconstructed state disagrees with active index revision.");
    ctx.working.validateSource(result.state);
    return result.state;
  }
  async function read(args){
    const ctx=env(args),index=await readIndex(ctx),state=await readComplete(ctx,index);
    return {state,index};
  }
  async function save({state,expectedRevision,prepare,scan,clientId,
      setOptions={merge:true},timeNow=()=>Date.now(),...args}={}){
    let indexWriteQueued=false,committedState=null,staged=null,committedIndex=null;
    try{
      const ctx=env(args);
      if(!validID(clientId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1
        ||typeof prepare!=="function"||typeof scan!=="function")
        throw fail("invalid_request","Missing authenticated save metadata.");
      if(scan(state).contaminated)
        throw fail("embedded_cutting_file_content_blocked","Unsafe cutting-file payload.");
      const pending=JSON.parse(JSON.stringify(state));
      const baselineIndex=await readIndex(ctx);
      if(baselineIndex.revision!==expectedRevision)
        throw fail("revision_conflict","Index revision changed before save.");
      const remote=await readComplete(ctx,baselineIndex);
      const prepared=prepare(JSON.parse(JSON.stringify(pending)),remote);
      let next=projectMerge(prepared,remote,setOptions);
      const nowMs=timeNow();
      if(!Number.isSafeInteger(nowMs)||nowMs<0)
        throw fail("invalid_clock","Invalid timestamp.");
      next={...next,syncMeta:{...(next.syncMeta||{}),rev:Math.max(nowMs,expectedRevision+1),
        updatedAtISO:new Date(nowMs).toISOString(),updatedBy:clientId}};
      ctx.working.validateSource(next);
      if(scan(next).contaminated)
        throw fail("embedded_cutting_file_content_blocked","Unsafe prepared cutting-file payload.");
      staged=await ctx.stager.stage({confirmation:ctx.stager.PHRASE,app:ctx.app,
        sharder:ctx.sharder,working:ctx.working,cryptoApi:ctx.cryptoApi,
        fetchImpl:ctx.fetchImpl,newId:ctx.newId,now:ctx.now,providedSource:next});
      if(!staged.verified||staged.revision!==next.syncMeta.rev||staged.sourceEvidence!=="verified-caller-supplied")
        throw fail("staging_invalid","Staging did not independently verify proposed state.");
      const independentlyLoaded=await ctx.reader.read({...staged,sourceRevision:staged.revision,
        app:ctx.app,sharder:ctx.sharder,cryptoApi:ctx.cryptoApi,fetchImpl:ctx.fetchImpl});
      if(ctx.sharder.canonical(independentlyLoaded.state)!==ctx.sharder.canonical(next))
        throw fail("staging_mismatch","Independent staged reconstruction differs from pending state.");
      committedIndex={
        schemaVersion:1,mode:"active",workspaceId:WORKSPACE,projectId:PROJECT,
        bucket:BUCKET,revision:next.syncMeta.rev,previousRevision:baselineIndex.revision,
        manifestPath:staged.manifestPath,manifestSha256:staged.manifestSha256,
        operationId:staged.operationId,actorUid:staged.actorUid,createdAtISO:staged.createdAtISO
      };
      await ctx.db.runTransaction(async transaction=>{
        const snap=await transaction.get(ctx.indexRef);
        if(!snap.exists)throw fail("index_missing","Active index was removed during save.");
        const latest=checkIndex(snap.data());
        if(latest.revision!==baselineIndex.revision
          ||latest.manifestSha256!==baselineIndex.manifestSha256
          ||latest.manifestPath!==baselineIndex.manifestPath)
          throw fail("revision_conflict","Another client updated the index. No overwrite occurred.");
        transaction.set(ctx.indexRef,committedIndex);
        indexWriteQueued=true;
      });
      // Never acknowledge a success solely from the transaction promise.
      const actual=await readIndex(ctx);
      if(actual.revision!==committedIndex.revision||actual.manifestSha256!==committedIndex.manifestSha256)
        throw Error("Committed index readback changed or is indeterminate.");
      const verified=await readComplete(ctx,actual);
      if(ctx.sharder.canonical(verified)!==ctx.sharder.canonical(next))
        throw Error("Committed shard readback differs. Suspend all saves.");
      committedState=verified;
      return {saved:true,stateWriteAttempted:true,stateWriteCompleted:true,
        indeterminate:false,committedState,path:INDEX_PATH};
    }catch(error){
      // Once the index write has been queued in any transaction attempt, even
      // a later PERMISSION_DENIED cannot prove that the CAS did not commit.
      // This is crucial for the app's Recovery Mode: never classify a
      // possibly committed state as a definite no-write failure.
      const indeterminate=indexWriteQueued;
      const definite=!indeterminate
        &&(error?.definite===true||error?.code==="permission-denied");
      return {saved:false,blocked:definite,definiteFailure:definite,
        stateWriteAttempted:indexWriteQueued,stateWriteCompleted:false,
        indeterminate,
        errorCode:String(error?.code||"sharded_commit_failed"),
        error:String(error?.message||error),
        stagedManifestPath:staged?.manifestPath||null,
        note:"Do not retry automatically. Verify index and immutable shards before further action."};
    }
  }
  return Object.freeze({PROJECT,BUCKET,WORKSPACE,INDEX_PATH,checkIndex,read,save});
});
