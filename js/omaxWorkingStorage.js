(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXWorkingStorage=api;
})(typeof window==="undefined"?null:window,function(){
  "use strict";
  // Explicitly invoked backup staging only. No Firestore writes, deletion,
  // migration, restore, cache mutation, or automatic execution on page load.
  const PROJECT="wj-tracker-v2",BUCKET="wj-tracker-v2.firebasestorage.app";
  const WORKSPACE="github-prod",STATE_PATH="workspaces/github-prod/app/state";
  const MAX_BYTES=10485760;
  const CONFIRMATION="STAGE OMAX COPY ONLY";
  let busy=false;
  const fail=message=>{throw Error("OMAX working storage: "+message);};
  const sha=async(bytes,cryptoApi)=>{
    if(!cryptoApi?.subtle?.digest)fail("SHA-256 is not available.");
    const raw=await cryptoApi.subtle.digest("SHA-256",bytes);
    return Array.from(new Uint8Array(raw)).map(x=>x.toString(16).padStart(2,"0")).join("");
  };
  const encode=value=>{
    if(typeof TextEncoder!=="function")fail("UTF-8 encoder unavailable.");
    return new TextEncoder().encode(JSON.stringify(value));
  };
  const validId=value=>typeof value==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
  function assertPlainJson(value,seen=new WeakSet(),path="$"){
    if(value===null||typeof value==="string"||typeof value==="boolean")return;
    if(typeof value==="number"&&Number.isFinite(value))return;
    if(!value||typeof value!=="object"||(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))||seen.has(value))
      fail("unsupported data at "+path+".");
    seen.add(value);
    if(Array.isArray(value)){
      for(let i=0;i<value.length;i++){
        if(!(i in value))fail("sparse array at "+path+".");
        assertPlainJson(value[i],seen,path+"["+i+"]");
      }
    }else{
      for(const key of Object.keys(value))assertPlainJson(value[key],seen,path+"."+key);
    }
    seen.delete(value);
  }
  function validateSource(state){
    assertPlainJson(state);
    if(!state||!Number.isSafeInteger(state.syncMeta?.rev)||state.syncMeta.rev<1||!Number.isSafeInteger(state.schema))
      fail("authoritative state/revision/schema missing.");
    for(const field of ["maintenanceOccurrencesV2","maintenanceCalendarInstancesV2","maintenanceTasksV2","tasksInterval","tasksAsReq","completedCuttingJobs","cuttingJobs","inventory","receiptTrackerWeeks","orderRequests","totalHistory","dailyCutHours","deletedItems"]){
      if(!Array.isArray(state[field]))fail("protected source field "+field+" is missing or invalid.");
    }
    if(state.maintenanceArchiveManifest||state.workingStorageManifest)fail("source already references external history: resolve it first.");
    return state;
  }
  function init({app,cryptoApi,fetchImpl}={}){
    if(!app||app.options?.projectId!==PROJECT||app.options?.storageBucket!==BUCKET
      ||app.name&&app.name!=="[DEFAULT]"||typeof app.auth!=="function"
      ||typeof app.firestore!=="function"||typeof app.storage!=="function")
      fail("wrong Firebase app or missing service.");
    const actorUid=app.auth().currentUser?.uid;
    if(!validId(actorUid))fail("sign in with an authorized Firebase user.");
    if(typeof fetchImpl!=="function"||!cryptoApi?.subtle?.digest)fail("browser fetch or SHA-256 unavailable.");
    const db=app.firestore(),storage=app.storage("gs://"+BUCKET);
    if(!db||typeof db.runTransaction!=="function"||!storage||typeof storage.ref!=="function")
      fail("Firebase services unavailable.");
    return {db,storage,actorUid,cryptoApi,fetchImpl};
  }
  function classify(phase,operationId,checksum){
    if(!["probe","snapshot"].includes(phase)||!validId(operationId)||!/^[a-f0-9]{64}$/.test(checksum))
      fail("invalid staging object identity.");
    return "workspaces/"+WORKSPACE+"/working/v1/"+phase+"/"+operationId+"/"+checksum+".json";
  }
  async function prepare(phase,source,cryptoApi,{operationId,actorUid,createdAtISO}){
    if(!["probe","snapshot"].includes(phase)||!validId(operationId)||!validId(actorUid)
      ||typeof createdAtISO!=="string"||!/^\d{4}-\d{2}-\d{2}T\d\d:\d\d:\d\d/.test(createdAtISO))
      fail("invalid archive preparation metadata.");
    if(phase==="snapshot")validateSource(source);
    else assertPlainJson(source);
    const envelope={schemaVersion:1,projectId:PROJECT,workspaceId:WORKSPACE,phase,operationId,
      createdAtISO,sourceRevision:phase==="snapshot"?source.syncMeta.rev:0,source};
    const bytes=encode(envelope);
    if(bytes.length<1||bytes.length>MAX_BYTES)fail("staging object outside allowed size.");
    const checksum=await sha(bytes,cryptoApi);
    const path=classify(phase,operationId,checksum);
    const metadata={schemaVersion:"1",workspaceId:WORKSPACE,phase,operationId,
      sha256:checksum,sourceRevision:String(envelope.sourceRevision),
      storagePath:path,createdBy:actorUid,createdAtISO};
    return {phase,operationId,checksum,path,metadata,bytes,sourceRevision:envelope.sourceRevision};
  }
  async function verifyObject(ctx,prepared){
    const ref=ctx.storage.ref().child(prepared.path);
    const data=await ref.getMetadata();
    if(data?.bucket&&data.bucket!==BUCKET)fail("Storage bucket mismatch.");
    if(data?.fullPath&&data.fullPath!==prepared.path)fail("Storage path mismatch.");
    if(data?.contentType!=="application/json"||data.size!==prepared.bytes.length)
      fail("Storage content type or size mismatch.");
    for(const [name,value]of Object.entries(prepared.metadata))
      if(data?.customMetadata?.[name]!==value)fail("Storage object metadata mismatch: "+name+".");
    const url=await ref.getDownloadURL();
    // No token URL is returned, logged, or saved.
    let response;
    try{response=await ctx.fetchImpl(url,{credentials:"omit",cache:"no-store"});}
    catch(_){fail("independent Storage download failed.");}
    if(!response?.ok)fail("independent Storage download returned an HTTP error.");
    const indicated=response.headers?.get?.("content-length");
    if(indicated!=null&&Number(indicated)>MAX_BYTES)fail("download size exceeded limit.");
    const buffer=await response.arrayBuffer();
    const received=new Uint8Array(buffer);
    if(received.byteLength!==prepared.bytes.length||received.byteLength>MAX_BYTES)
      fail("downloaded byte count mismatch.");
    const actual=await sha(received,ctx.cryptoApi);
    if(actual!==prepared.checksum)fail("independent downloaded SHA-256 mismatch.");
    if(received.some((byte,index)=>byte!==prepared.bytes[index]))
      fail("independent downloaded bytes differ.");
    return true;
  }
  async function readSourceTwice(ctx){
    const doc=ctx.db.doc(STATE_PATH);
    const read=()=>ctx.db.runTransaction(async tx=>{
      const snap=await tx.get(doc);
      if(!snap?.exists||snap.metadata?.fromCache||snap.metadata?.hasPendingWrites||snap.ref?.path!==STATE_PATH)
        fail("source read is missing, cached, or points elsewhere.");
      return snap.data();
    });
    const first=validateSource(await read());
    const second=validateSource(await read());
    if(JSON.stringify(first)!==JSON.stringify(second))fail("backend state changed between reads. Start a fresh review.");
    return first;
  }
  async function execute({phase,confirmation,app,cryptoApi,fetchImpl,newId,now}={}){
    if(confirmation!==CONFIRMATION)fail("explicit staging confirmation is required.");
    if(busy)fail("another staging operation is in progress.");
    busy=true;
    try{
      const ctx=init({app,cryptoApi,fetchImpl});
      if(typeof newId!=="function"||typeof now!=="function")fail("secure operation ID and clock are required.");
      const operationId=newId(),createdAtISO=now();
      const source=phase==="snapshot"?await readSourceTwice(ctx):{
        marker:"OMAX working-storage readback probe",
        testOnly:true,
        fields:["maintenance","purchases","inventory","calendar","cuttingJobs"]
      };
      const prepared=await prepare(phase,source,ctx.cryptoApi,{operationId,actorUid:ctx.actorUid,createdAtISO});
      const ref=ctx.storage.ref().child(prepared.path);
      // Single create attempt. Rules must prohibit overwrite. A failed or
      // ambiguous write is never retried or deleted automatically.
      await ref.put(new Blob([prepared.bytes],{type:"application/json"}),{
        contentType:"application/json",customMetadata:prepared.metadata
      });
      await verifyObject(ctx,prepared);
      if(phase==="snapshot"){
        // Protect against a snapshot that became stale during upload/readback.
        const latest=await readSourceTwice(ctx);
        if(JSON.stringify(latest)!==JSON.stringify(source))
          fail("snapshot verified in Storage, but the source changed afterwards. Do not migrate.");
      }
      return Object.freeze({verified:true,phase,projectId:PROJECT,bucket:BUCKET,path:prepared.path,
        sourceRevision:prepared.sourceRevision,sourceFields:Object.keys(source).length,
        sourceMaintenanceEvents:phase==="snapshot"?source.maintenanceOccurrencesV2.length:null,
        sizeBytes:prepared.bytes.length,sha256:prepared.checksum,
        firestoreWrites:0,firestoreDeletes:0,storageObjectsCreated:1,
        note:"Only a verified Storage COPY exists. No Firestore cutover, deletion, or migration occurred."});
    }finally{busy=false;}
  }
  const browserContext=()=>({
    app:typeof firebase!=="undefined"?firebase.app():null,
    cryptoApi:typeof crypto!=="undefined"?crypto:null,
    fetchImpl:typeof fetch!=="undefined"?fetch.bind(typeof window!=="undefined"?window:null):null,
    newId:()=>typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID().replace(/-/g,"_"):fail("secure randomUUID unavailable."),
    now:()=>new Date().toISOString()
  });
  const probe=confirmation=>execute({...browserContext(),phase:"probe",confirmation});
  const snapshot=confirmation=>execute({...browserContext(),phase:"snapshot",confirmation});
  return Object.freeze({PROJECT,BUCKET,WORKSPACE,STATE_PATH,MAX_BYTES,CONFIRMATION,
    validateSource,prepare,verifyObject,readSourceTwice,execute,probe,snapshot});
});
