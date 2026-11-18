(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXAuthorityRouter=api;
})(typeof window==="undefined"?null:window,function(){
  "use strict";
  // Read-only resolver of the authoritative state backend. No cutover, writes,
  // fallback after an active index, deletion, repair, or business-data changes.
  const WORKSPACE="github-prod";
  const STATE_PATH="workspaces/github-prod/app/state";
  const INDEX_PATH="workspaces/github-prod/app/stateIndexV1";
  const PROJECT="wj-tracker-v2";
  const BUCKET="wj-tracker-v2.firebasestorage.app";
  const fail=(code,message)=>{throw Object.assign(Error("OMAX authority: "+message),{code});};
  function environment({app,commit,readback,sharder,working,cryptoApi,fetchImpl}={}){
    if(!app||app.name!=="[DEFAULT]"
      ||app.options?.projectId!==PROJECT||app.options?.storageBucket!==BUCKET
      ||typeof app.firestore!=="function"||typeof app.auth!=="function"
      ||!app.auth().currentUser?.uid)
      fail("environment_mismatch","Wrong project, bucket, or no authenticated user.");
    const db=app.firestore();
    if(typeof db?.doc!=="function"
      ||typeof db?.runTransaction!=="function"
      ||typeof commit?.checkIndex!=="function"
      ||typeof readback?.read!=="function"
      ||typeof sharder?.canonical!=="function"
      ||typeof working?.validateSource!=="function"
      ||!cryptoApi?.subtle?.digest||typeof fetchImpl!=="function")
      fail("environment_mismatch","Verification dependencies unavailable.");
    return {app,db,commit,readback,sharder,working,cryptoApi,fetchImpl};
  }
  async function serverRead(ref){
    const snap=await ref.get({source:"server"});
    if(!snap||snap.metadata?.fromCache!==false
      ||snap.metadata?.hasPendingWrites!==false
      ||snap.ref?.path!==ref.path)
      fail("unverified_read","Server document read has pending writes, cache data, or wrong path.");
    return snap;
  }
  async function resolve(args={}){
    const ctx=environment(args);
    const indexRef=ctx.db.doc(INDEX_PATH);
    // Index is the authority selector. Never interpret an inaccessible
    // index as missing; failing closed prevents silently reading old state.
    const indexSnapshot=await serverRead(indexRef);
    if(indexSnapshot.exists){
      const index=ctx.commit.checkIndex(indexSnapshot.data());
      const copy=await ctx.readback.read({...index,sourceRevision:index.revision,
        app:ctx.app,sharder:ctx.sharder,cryptoApi:ctx.cryptoApi,fetchImpl:ctx.fetchImpl});
      if(!copy?.summary?.verified||copy.summary.revision!==index.revision)
        fail("incomplete_sharded_read","Storage manifest verification did not succeed.");
      const state=ctx.working.validateSource(copy.state);
      if(state.syncMeta.rev!==index.revision)
        fail("revision_mismatch","Storage state and active index revision differ.");
      // A second independent index read protects against a pointer change
      // during this relatively long multi-object Storage reconstruction.
      const second=await serverRead(indexRef);
      if(!second.exists)fail("index_changed","Authoritative index disappeared.");
      const latest=ctx.commit.checkIndex(second.data());
      if(ctx.sharder.canonical(latest)!==ctx.sharder.canonical(index))
        fail("index_changed","Authoritative index changed during read. Retry after recovery review.");
      return {mode:"sharded",revision:index.revision,state,indexPath:INDEX_PATH,
        manifestPath:index.manifestPath,verified:true};
    }
    const stateRef=ctx.db.doc(STATE_PATH);
    const legacy=await serverRead(stateRef);
    if(!legacy.exists)fail("missing_legacy","Legacy state document missing.");
    const state=ctx.working.validateSource(legacy.data());
    // The index can appear after the first read but before this state is
    // consumed; refuse to adopt legacy evidence if activation has occurred.
    const second=await serverRead(indexRef);
    if(second.exists)fail("authority_changed","Sharded index appeared during legacy state read.");
    return {mode:"legacy",revision:state.syncMeta.rev,state,
      indexPath:INDEX_PATH,legacyPath:STATE_PATH,verified:true};
  }
  function fromBrowser(){
    return resolve({app:firebase.app(),commit:window.OMAXShardedCommit,
      readback:window.OMAXShardedReadback,sharder:window.OMAXShardedState,
      working:window.OMAXWorkingStorage,cryptoApi:crypto,
      fetchImpl:fetch.bind(window)});
  }
  return Object.freeze({PROJECT,BUCKET,WORKSPACE,STATE_PATH,INDEX_PATH,resolve,fromBrowser});
});
