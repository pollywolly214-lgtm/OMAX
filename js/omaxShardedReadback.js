(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXShardedReadback=api;
})(typeof window==="undefined"?null:window,function(){
  "use strict";
  // Read-only independent reconstruction of a complete staged V1 copy.
  // No mutation, adoption, recovery, rollback, or Firestore writes.
  const PROJECT="wj-tracker-v2",BUCKET="wj-tracker-v2.firebasestorage.app",WORKSPACE="github-prod";
  const fail=msg=>{throw Error("OMAX sharded readback: "+msg);};
  const safeId=value=>typeof value==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
  const safeSHA=value=>typeof value==="string"&&/^[0-9a-f]{64}$/.test(value);
  const encode=text=>new TextEncoder().encode(text);
  const decode=bytes=>new TextDecoder("utf-8",{fatal:true}).decode(bytes);
  const sha=async(bytes,cryptoApi)=>{
    if(!cryptoApi?.subtle?.digest)fail("SHA-256 unavailable.");
    const digest=await cryptoApi.subtle.digest("SHA-256",bytes);
    return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
  };
  const validatePath=(path,field,operationId,checksum)=>{
    const expected="workspaces/"+WORKSPACE+"/state-shards/v1/"+field+"/"+operationId+"/"+checksum+".json";
    if(path!==expected||!safeSHA(checksum))fail("invalid sharded object path.");
    return expected;
  };
  function context({app,sharder,cryptoApi,fetchImpl}={}){
    if(!app||app.name!=="[DEFAULT]"||app.options?.projectId!==PROJECT||app.options?.storageBucket!==BUCKET
      ||typeof app.auth!=="function"||typeof app.storage!=="function"||sharder?.VERSION!==1
      ||typeof sharder.reconstruct!=="function"||typeof fetchImpl!=="function"||!cryptoApi?.subtle?.digest)
      fail("Firebase project, Storage account, or sharding implementation mismatch.");
    if(!safeId(app.auth().currentUser?.uid))fail("authenticated owner required.");
    const storage=app.storage("gs://"+BUCKET);
    if(!storage||typeof storage.ref!=="function")fail("Storage client missing.");
    return {storage,sharder,cryptoApi,fetchImpl};
  }
  async function object(ctx,{path,field,operationId,checksum,sourceRevision,createdBy,createdAtISO,maxBytes}){
    validatePath(path,field,operationId,checksum);
    if(!safeId(createdBy)||!Number.isSafeInteger(sourceRevision)||sourceRevision<0
      ||typeof createdAtISO!=="string"||createdAtISO.length>30)
      fail("untrusted expected object metadata.");
    const ref=ctx.storage.ref().child(path);
    const metadata=await ref.getMetadata();
    const expected={schemaVersion:"1",workspaceId:WORKSPACE,field,operationId,sha256:checksum,
      sourceRevision:String(sourceRevision),createdBy,createdAtISO,storagePath:path};
    if(metadata?.bucket!==BUCKET||metadata?.fullPath!==path||metadata?.contentType!=="application/json"
      ||!Number.isInteger(metadata?.size)||metadata.size<1||metadata.size>maxBytes)
      fail("object bucket/path/type/size mismatch.");
    for(const [key,value]of Object.entries(expected))
      if(metadata.customMetadata?.[key]!==value)
        fail("object metadata differs: "+key+".");
    const url=await ref.getDownloadURL();
    if(typeof url!=="string"||!url.startsWith("https://"))fail("non-HTTPS download URL.");
    // Do not return or log download URL or bearer token.
    const response=await ctx.fetchImpl(url,{cache:"no-store",credentials:"omit"});
    if(!response?.ok)fail("Storage object independent download failed.");
    const contentLength=response.headers?.get?.("content-length");
    if(contentLength!=null&&Number(contentLength)>maxBytes)
      fail("download Content-Length exceeds shard limit.");
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.length!==metadata.size||bytes.length<1||bytes.length>maxBytes)
      fail("independent download byte count differs.");
    if(await sha(bytes,ctx.cryptoApi)!==checksum)fail("downloaded object SHA-256 mismatch.");
    const serialized=decode(bytes);
    if(encode(serialized).length!==bytes.length)fail("UTF-8 roundtrip differs.");
    return serialized;
  }
  async function read({manifestPath,manifestSha256,operationId,sourceRevision,
      actorUid,createdAtISO,app,sharder,cryptoApi,fetchImpl}={}){
    const ctx=context({app,sharder,cryptoApi,fetchImpl});
    if(!safeId(operationId)||!safeId(actorUid)||!safeSHA(manifestSha256)
      ||!Number.isSafeInteger(sourceRevision)||sourceRevision<1)
      fail("missing manifest identity or revision.");
    const serializedManifest=await object(ctx,{path:manifestPath,field:"_manifest",
      operationId,checksum:manifestSha256,sourceRevision,createdBy:actorUid,createdAtISO,
      maxBytes:ctx.sharder.LIMIT});
    let manifest;
    try{manifest=JSON.parse(serializedManifest);}catch(_){fail("malformed JSON manifest.");}
    if(ctx.sharder.canonical(manifest)!==serializedManifest||manifest.workspaceId!==WORKSPACE
      ||manifest.operationId!==operationId||manifest.sourceRevision!==sourceRevision
      ||!Array.isArray(manifest.shards)||!manifest.shards.length||manifest.shards.length>512)
      fail("manifest identity, revision, or canonical body mismatch.");
    // Verify every object independently; no partial acceptance.
    const byPath=new Map();
    for(const part of manifest.shards){
      if(!part||typeof part.field!=="string"||typeof part.path!=="string"
        ||!Number.isInteger(part.sizeBytes)||part.sizeBytes>ctx.sharder.LIMIT)
        fail("invalid referenced shard.");
      const serialized=await object(ctx,{path:part.path,field:part.field,
        operationId,checksum:part.sha256,sourceRevision,createdBy:actorUid,createdAtISO,
        maxBytes:ctx.sharder.LIMIT});
      if(encode(serialized).length!==part.sizeBytes)fail("manifest shard size mismatch.");
      byPath.set(part.path,serialized);
    }
    const state=await ctx.sharder.reconstruct({manifest,serializedByPath:byPath,cryptoApi});
    // State is not adopted, displayed or saved by this module.
    return {state,summary:Object.freeze({verified:true,manifestPath,manifestSha256,
      revision:sourceRevision,fields:Object.keys(state).length,
      maintenanceEvents:Array.isArray(state.maintenanceOccurrencesV2)?state.maintenanceOccurrencesV2.length:null,
      completedCuttingJobs:Array.isArray(state.completedCuttingJobs)?state.completedCuttingJobs.length:null,
      firestoreWrites:0,firestoreDeletes:0})};
  }
  function fromBrowser({manifestPath,manifestSha256,operationId,sourceRevision,actorUid,createdAtISO}){
    return read({manifestPath,manifestSha256,operationId,sourceRevision,actorUid,createdAtISO,
      app:firebase.app(),sharder:window.OMAXShardedState,cryptoApi:crypto,fetchImpl:fetch.bind(window)});
  }
  return Object.freeze({PROJECT,BUCKET,WORKSPACE,read,fromBrowser});
});
