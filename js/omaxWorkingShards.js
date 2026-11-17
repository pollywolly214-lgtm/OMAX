(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXWorkingShards=api;
})(typeof window==="undefined"?null:window,function(){
  "use strict";
  const PROJECT="wj-tracker-v2",BUCKET="wj-tracker-v2.firebasestorage.app",WORKSPACE="github-prod";
  const PHRASE="STAGE OMAX SHARDS ONLY";
  const fail=message=>{throw Error("OMAX sharded staging: "+message);};
  let busy=false;
  const encode=text=>new TextEncoder().encode(text);
  const hash=async(bytes,cryptoApi)=>{
    if(!cryptoApi?.subtle?.digest)fail("SHA-256 unavailable.");
    const output=await cryptoApi.subtle.digest("SHA-256",bytes);
    return [...new Uint8Array(output)].map(v=>v.toString(16).padStart(2,"0")).join("");
  };
  const id=value=>typeof value==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
  function environment({app,sharder,working,cryptoApi,fetchImpl}){
    if(!app||app.options?.projectId!==PROJECT||app.options?.storageBucket!==BUCKET
      ||app.name!=="[DEFAULT]"||typeof app.auth!=="function"||typeof app.storage!=="function"
      ||typeof app.firestore!=="function"||sharder?.VERSION!==1||working?.PROJECT!==PROJECT
      ||!cryptoApi?.subtle?.digest||typeof fetchImpl!=="function")
      fail("Firebase project, environment, or dependencies not verified.");
    const actor=app.auth().currentUser?.uid;
    if(!id(actor))fail("operator must be signed in.");
    const storage=app.storage("gs://"+BUCKET);
    return {actor,storage,db:app.firestore(),cryptoApi,fetchImpl,sharder,working,app};
  }
  const pathFor=(field,operationId,checksum)=>
    "workspaces/"+WORKSPACE+"/state-shards/v1/"+field+"/"+operationId+"/"+checksum+".json";
  async function checkObject(ctx,{path,serialized,checksum,field,operationId,revision,createdAtISO,actor}){
    const ref=ctx.storage.ref().child(path),expectedSize=encode(serialized).length;
    const data=await ref.getMetadata();
    if(data?.bucket&&data.bucket!==BUCKET||data?.fullPath&&data.fullPath!==path
      ||data?.size!==expectedSize||data?.contentType!=="application/json")
      fail("object readback metadata/path/size mismatch.");
    const expected={schemaVersion:"1",workspaceId:WORKSPACE,field,operationId,sha256:checksum,
      sourceRevision:String(revision),createdBy:actor,createdAtISO,storagePath:path};
    for(const [key,val]of Object.entries(expected))
      if(data?.customMetadata?.[key]!==val)fail("missing/mismatched Storage metadata: "+key+".");
    const privateUrl=await ref.getDownloadURL();
    let response;
    try{response=await ctx.fetchImpl(privateUrl,{credentials:"omit",cache:"no-store"});}
    catch(_){fail("independent Storage download failed.");}
    if(!response?.ok)fail("Storage download rejected.");
    const indicated=response.headers?.get?.("content-length");
    if(indicated!=null&&Number(indicated)>ctx.sharder.LIMIT)fail("download declared oversized shard.");
    const result=new Uint8Array(await response.arrayBuffer());
    if(result.length!==expectedSize||result.length>ctx.sharder.LIMIT)
      fail("downloaded shard length mismatch.");
    if(await hash(result,ctx.cryptoApi)!==checksum)fail("downloaded shard SHA-256 mismatch.");
    const expectedBytes=encode(serialized);
    if(result.some((byte,index)=>byte!==expectedBytes[index]))
      fail("downloaded shard bytes differ.");
    return serialized;
  }
  async function putChecked(ctx,{field,operationId,serialized,checksum,revision,createdAtISO}){
    const path=pathFor(field,operationId,checksum),actor=ctx.actor;
    const metadata={schemaVersion:"1",workspaceId:WORKSPACE,field,operationId,sha256:checksum,
      sourceRevision:String(revision),createdBy:actor,createdAtISO,storagePath:path};
    // Firebase rules must enforce create-only; do not retry or auto-delete.
    const body=encode(serialized);
    if(!body.length||body.length>ctx.sharder.LIMIT)fail("shard exceeds allowed size.");
    await ctx.storage.ref().child(path).put(new Blob([body],{type:"application/json"}),
      {contentType:"application/json",customMetadata:metadata});
    return checkObject(ctx,{path,serialized,checksum,field,operationId,revision,createdAtISO,actor});
  }
  async function stage({confirmation,app,sharder,working,cryptoApi,fetchImpl,newId,now}={}){
    if(confirmation!==PHRASE)fail("explicit opt-in phrase required.");
    if(busy)fail("a staging operation is already running.");
    busy=true;
    try{
      const ctx=environment({app,sharder,working,cryptoApi,fetchImpl});
      if(typeof newId!=="function"||typeof now!=="function")fail("secure operation ID and timestamp required.");
      const operationId=newId(),createdAtISO=now();
      if(!id(operationId)||typeof createdAtISO!=="string"||!/^\d{4}-\d{2}-\d{2}T/.test(createdAtISO))
        fail("invalid operation ID or timestamp.");
      const source=await working.readSourceTwice(ctx);
      const original=sharder.canonical(source),revision=source.syncMeta.rev;
      const proposed=await sharder.plan({state:source,workspaceId:WORKSPACE,operationId,cryptoApi});
      if(proposed.manifest.sourceRevision!==revision)fail("sharded source revision mismatch.");
      const readbacks=new Map();
      for(const shard of proposed.shards){
        if(ctx.app.auth().currentUser?.uid!==ctx.actor)fail("operator changed during staging.");
        await putChecked(ctx,{field:shard.field,operationId,serialized:shard.serialized,
          checksum:shard.sha256,revision,createdAtISO});
        readbacks.set(shard.path,shard.serialized);
      }
      const reconstructed=await sharder.reconstruct({manifest:proposed.manifest,
        serializedByPath:readbacks,cryptoApi});
      if(sharder.canonical(reconstructed)!==original)fail("complete-state reconstruction failed.");
      // Store an immutable manifest only after every field has been verified.
      const manifestBody=sharder.canonical(proposed.manifest);
      const manifestHash=await hash(encode(manifestBody),cryptoApi);
      const manifestPath=pathFor("_manifest",operationId,manifestHash);
      await putChecked(ctx,{field:"_manifest",operationId,serialized:manifestBody,checksum:manifestHash,
        revision,createdAtISO});
      const current=await working.readSourceTwice(ctx);
      if(sharder.canonical(current)!==original)
        fail("source changed after staged upload; retain copies but do NOT perform cutover.");
      return Object.freeze({verified:true,projectId:PROJECT,bucket:BUCKET,revision,
        fieldCount:proposed.shards.length,archiveObjects:proposed.shards.length+1,
        manifestPath,manifestSha256:manifestHash,firestoreWrites:0,firestoreDeletes:0,
        status:"Verified immutable staged COPY ONLY. No live Firestore data was moved or removed."});
    }finally{busy=false;}
  }
  function browserArgs(){
    return {app:typeof firebase!=="undefined"?firebase.app():null,
      sharder:typeof window!=="undefined"?window.OMAXShardedState:null,
      working:typeof window!=="undefined"?window.OMAXWorkingStorage:null,
      cryptoApi:crypto,fetchImpl:fetch.bind(window),
      newId:()=>crypto.randomUUID().replace(/-/g,"_"),
      now:()=>new Date().toISOString()};
  }
  return Object.freeze({PHRASE,PROJECT,BUCKET,stage,
    stageFromBrowser:confirmation=>stage({...browserArgs(),confirmation})});
});
