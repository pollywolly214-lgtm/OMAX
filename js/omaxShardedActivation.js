(function(root, factory) {
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXShardedActivation=api;
})(typeof window==="undefined"?null:window,function(){
  "use strict";
  // Inactive, explicit-only migration entry point. This script MUST NOT be
  // loaded in production until Firestore rules, legacy-writer lockout and
  // all normal/specialized read/write paths have been tested.
  const PROJECT="wj-tracker-v2";
  const WORKSPACE="github-prod";
  const BUCKET="wj-tracker-v2.firebasestorage.app";
  const LEGACY="workspaces/github-prod/app/state";
  const INDEX="workspaces/github-prod/app/stateIndexV1";
  const fail=(code,message)=>{throw Object.assign(Error("OMAX cutover: "+message),{code});};
  const integer=x=>Number.isSafeInteger(x)&&x>0;
  const verifiedStates=new WeakMap();
  function context({app,reader,sharder,working,cryptoApi,fetchImpl}={}){
    if(!app||app.name!=="[DEFAULT]"||app.options?.projectId!==PROJECT
      ||app.options?.storageBucket!==BUCKET||typeof app.auth!=="function"
      ||typeof app.firestore!=="function"||!app.auth().currentUser?.uid
      ||!reader||typeof reader.read!=="function"
      ||!sharder||typeof sharder.canonical!=="function"
      ||!working||typeof working.validateSource!=="function"
      ||!cryptoApi?.subtle?.digest||typeof fetchImpl!=="function")
      fail("bad_environment","Wrong Firebase project, identity or verification library.");
    const db=app.firestore();
    if(!db||typeof db.doc!=="function"||typeof db.runTransaction!=="function")
      fail("bad_environment","Backend transactions unavailable.");
    return {app,reader,sharder,working,cryptoApi,fetchImpl,db,
      legacyRef:db.doc(LEGACY),indexRef:db.doc(INDEX)};
  }
  async function serverSnapshot(ref){
    const snap=await ref.get({source:"server"});
    if(!snap||snap.metadata?.fromCache!==false
      ||snap.metadata?.hasPendingWrites!==false
      ||snap.ref?.path!==ref.path)
      fail("unverified_read","Server read cannot establish a trustworthy revision.");
    return snap;
  }
  function normalizedCandidate(candidate){
    if(!candidate||!integer(candidate.sourceRevision)
      ||typeof candidate.operationId!=="string"
      ||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(candidate.operationId)
      ||typeof candidate.actorUid!=="string"
      ||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(candidate.actorUid)
      ||typeof candidate.manifestSha256!=="string"
      ||!/^[a-f0-9]{64}$/.test(candidate.manifestSha256)
      ||typeof candidate.createdAtISO!=="string"
      ||candidate.createdAtISO.length>30
      ||candidate.manifestPath!=="workspaces/"+WORKSPACE
        +"/state-shards/v1/_manifest/"+candidate.operationId
        +"/"+candidate.manifestSha256+".json")
      fail("invalid_candidate","Complete immutable manifest identity is required.");
    return Object.freeze({
      sourceRevision:candidate.sourceRevision,operationId:candidate.operationId,
      actorUid:candidate.actorUid,manifestSha256:candidate.manifestSha256,
      createdAtISO:candidate.createdAtISO,manifestPath:candidate.manifestPath
    });
  }
  async function verify({candidate,...args}={}){
    const ctx=context(args),selected=normalizedCandidate(candidate);
    const existing=await serverSnapshot(ctx.indexRef);
    if(existing.exists)
      fail("already_indexed","A state index already exists. Review it before any migration.");
    const first=await serverSnapshot(ctx.legacyRef);
    if(!first.exists)fail("missing_legacy","Original Firestore state is missing.");
    const original=ctx.working.validateSource(first.data());
    if(original.syncMeta.rev!==selected.sourceRevision)
      fail("stale_candidate","Staged copy is not at the current Firestore revision.");
    const reconstructed=await ctx.reader.read({...selected,
      app:ctx.app,sharder:ctx.sharder,cryptoApi:ctx.cryptoApi,fetchImpl:ctx.fetchImpl});
    const restored=ctx.working.validateSource(reconstructed.state);
    if(ctx.sharder.canonical(original)!==ctx.sharder.canonical(restored))
      fail("copy_mismatch","Storage copy does not exactly match Firestore.");
    const second=await serverSnapshot(ctx.legacyRef);
    if(!second.exists||ctx.sharder.canonical(second.data())!==ctx.sharder.canonical(original))
      fail("source_changed","Original state changed while verifying the copy.");
    const proof=Object.freeze({verified:true,candidate:selected,revision:original.syncMeta.rev,
      fieldCount:Object.keys(original).length,
      firestoreWrites:0,firestoreDeletes:0,
      note:"Read-only preflight. The original Firestore document remains authoritative."});
    verifiedStates.set(proof,ctx.sharder.canonical(original));
    return proof;
  }
  // Never invoke until verified Firestore rules make OLD app/state writes
  // impossible after this index document is created. The old-client lockout
  // is a security-rules property and cannot be guaranteed from client JS.
  async function activate({candidate,approval,rulesEnforced, ...args}={}){
    if(approval!=="ACTIVATE OMAX SHARDED AUTHORITY"
      ||rulesEnforced!==true)
      fail("approval_missing","Explicit reviewed rules-lockout approval required.");
    const ctx=context(args),preflight=await verify({candidate,...args});
    const selected=preflight.candidate;
    const index={schemaVersion:1,mode:"active",workspaceId:WORKSPACE,
      projectId:PROJECT,bucket:BUCKET,revision:selected.sourceRevision,
      previousRevision:0,manifestPath:selected.manifestPath,
      manifestSha256:selected.manifestSha256,operationId:selected.operationId,
      actorUid:selected.actorUid,createdAtISO:selected.createdAtISO};
    let writeQueued=false;
    try{
      await ctx.db.runTransaction(async tx=>{
        const original=await tx.get(ctx.legacyRef);
        const indexed=await tx.get(ctx.indexRef);
        if(indexed.exists||!original.exists)
          fail("concurrent_activation","State index appeared or legacy state disappeared.");
        const source=ctx.working.validateSource(original.data());
        if(source.syncMeta.rev!==preflight.revision)
          fail("concurrent_revision","Original Firestore revision changed since preflight.");
        // Preflight state can change without bumping revision in a rogue client:
        // compare it to independently reconstructed candidate inside the
        // transaction through precomputed immutable canonical content.
        if(ctx.sharder.canonical(source)!==verifiedStates.get(preflight))
          fail("concurrent_mutation","Original Firestore content changed since preflight.");
        tx.set(ctx.indexRef,index);
        writeQueued=true;
      });
    }catch(error){
      if(writeQueued)
        fail("activation_indeterminate",
          "Index write was queued but acknowledgement is uncertain; inspect server state before any retry.");
      throw error;
    }
    const indexed=await serverSnapshot(ctx.indexRef);
    if(!indexed.exists||ctx.sharder.canonical(indexed.data())!==ctx.sharder.canonical(index))
      fail("activation_indeterminate","Index commit cannot be verified. Suspend all writes.");
    return Object.freeze({activated:true,indexPath:INDEX,sourceRevision:selected.sourceRevision,
      legacyStateDeleted:false,storageRewritten:false});
  }
  // Only the zero-write activation window is reversible. Once a sharded
  // update changes the index revision, restoring the old monolithic state
  // would discard newer business history and is therefore forbidden.
  async function rollbackBeforeFirstWrite({approval,rulesEnforced,...args}={}){
    if(approval!=="ROLL BACK OMAX BEFORE FIRST SHARDED SAVE"||rulesEnforced!==true)
      fail("approval_missing","Reviewed rollback rules and explicit approval required.");
    const ctx=context(args);
    const indexed=await serverSnapshot(ctx.indexRef);
    if(!indexed.exists)fail("missing_index","Active index is absent.");
    const baselineIndex=indexed.data();
    if(baselineIndex.mode!=="active"||baselineIndex.schemaVersion!==1
      ||baselineIndex.workspaceId!==WORKSPACE||baselineIndex.projectId!==PROJECT
      ||baselineIndex.bucket!==BUCKET||baselineIndex.previousRevision!==0
      ||!integer(baselineIndex.revision)
      ||baselineIndex.actorUid!==ctx.app.auth().currentUser?.uid)
      fail("rollback_unsafe","Storage authority has changed or post-activation saves may exist.");
    const original=await serverSnapshot(ctx.legacyRef);
    if(!original.exists)fail("missing_legacy","Original state no longer exists.");
    const legacyState=ctx.working.validateSource(original.data());
    if(legacyState.syncMeta.rev!==baselineIndex.revision)
      fail("rollback_unsafe","Original and active index revisions differ.");
    const copied=await ctx.reader.read({...baselineIndex,
      sourceRevision:baselineIndex.revision,
      app:ctx.app,sharder:ctx.sharder,cryptoApi:ctx.cryptoApi,fetchImpl:ctx.fetchImpl});
    if(ctx.sharder.canonical(ctx.working.validateSource(copied.state))
      !==ctx.sharder.canonical(legacyState))
      fail("rollback_unsafe","Original state no longer matches active Storage authority.");
    const originalKey=ctx.sharder.canonical(legacyState);
    const indexKey=ctx.sharder.canonical(baselineIndex);
    let writeQueued=false;
    try{
      await ctx.db.runTransaction(async tx=>{
        const actualIndex=await tx.get(ctx.indexRef);
        const actualLegacy=await tx.get(ctx.legacyRef);
        if(!actualIndex.exists||!actualLegacy.exists
          ||ctx.sharder.canonical(actualIndex.data())!==indexKey
          ||ctx.sharder.canonical(actualLegacy.data())!==originalKey)
          fail("rollback_conflict","Index or original data changed during rollback.");
        tx.delete(ctx.indexRef);
        writeQueued=true;
      });
    }catch(error){
      if(writeQueued)fail("rollback_indeterminate",
        "Rollback may have been committed. Inspect the index and original state before retrying.");
      throw error;
    }
    const afterIndex=await serverSnapshot(ctx.indexRef);
    const afterLegacy=await serverSnapshot(ctx.legacyRef);
    if(afterIndex.exists||!afterLegacy.exists
      ||ctx.sharder.canonical(afterLegacy.data())!==originalKey)
      fail("rollback_indeterminate","Rollback readback does not match expected original state.");
    return Object.freeze({rolledBack:true,legacyUnchanged:true,
      shardedObjectsDeleted:0,legacyRevision:baselineIndex.revision,
      note:"Only an activation with no subsequent sharded saves may be reversed."});
  }
  return Object.freeze({PROJECT,BUCKET,WORKSPACE,LEGACY,INDEX,verify,activate,rollbackBeforeFirstWrite});
});
