(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXShardedAcknowledgement=api;
})(typeof window==="undefined"?null:window,function(){
  "use strict";
  // Pure, read-only post-CAS assertion. Never infers success from a local
  // snapshot, an index transaction acknowledgement, or a cached Firestore echo.
  // The independent verified read must equal exactly what was committed.
  function fail(message){
    throw Object.assign(Error("OMAX sharded acknowledgement: "+message),
      {code:"sharded_readback_unverified"});
  }
  function confirm({committedState,verifiedState,expectedRevision,canonical}={}){
    if(typeof canonical!=="function"
      ||!Number.isSafeInteger(expectedRevision)||expectedRevision<1
      ||!committedState||!verifiedState
      ||!Number.isSafeInteger(committedState.syncMeta?.rev)
      ||!Number.isSafeInteger(verifiedState.syncMeta?.rev))
      fail("Invalid readback inputs or authoritative revision.");
    const revision=committedState.syncMeta.rev;
    if(revision<=expectedRevision || verifiedState.syncMeta.rev!==revision)
      fail("Independently reconstructed revision does not match the commit.");
    if(canonical(verifiedState)!==canonical(committedState))
      fail("Independently reconstructed full state differs from committed data.");
    return Object.freeze({verified:true,revision});
  }
  return Object.freeze({confirm});
});
