(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXMaintenanceArchiveStorage=api;
})(typeof window==="undefined"?null:window,function(){
  "use strict";
  // Transport is deliberately not wired to ordinary saves or app startup.
  // Cloud Storage is NOT transactional with Firestore; a verified upload
  // does not authorize removing any Firestore history.
  const PROJECT="wj-tracker-v2",BUCKET="wj-tracker-v2.firebasestorage.app";
  const MIME="application/json",MAX_BYTES=524288;
  const fail=message=>{throw Error("Maintenance archive Storage: "+message);};
  const safeId=value=>typeof value==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
  const safeDigest=value=>typeof value==="string"&&/^[0-9a-f]{64}$/.test(value);
  const expectedPath=(workspaceId,archiveId,checksum)=>
    "workspaces/"+workspaceId+"/maintenance-history/v1/"+archiveId+"/"+checksum+".json";
  function metadata(descriptor,{workspaceId,actorUid,createdAtISO}){
    if(!safeId(workspaceId)||!safeId(descriptor?.archiveId)||!safeDigest(descriptor?.checksum)
      ||!Number.isSafeInteger(descriptor?.recordCount)||descriptor.recordCount<1||descriptor.recordCount>100000
      ||!Number.isSafeInteger(descriptor?.sourceRevision)||descriptor.sourceRevision<0
      ||!safeId(actorUid)||typeof createdAtISO!=="string"||!/^\\d{4}-\\d{2}-\\d{2}T.*Z$/.test(createdAtISO))
      fail("invalid bounded metadata.");
    if(descriptor.path!==expectedPath(workspaceId,descriptor.archiveId,descriptor.checksum))
      fail("archive is not in the designated immutable path.");
    return {schemaVersion:"1",workspaceId,archiveId:descriptor.archiveId,sha256:descriptor.checksum,
      recordCount:String(descriptor.recordCount),sourceRevision:String(descriptor.sourceRevision),
      createdBy:actorUid,createdAtISO,storagePath:descriptor.path};
  }
  function target({projectId,bucket,workspaceId,storage,archiveApi,cryptoApi,fetchImpl,actorUid}){
    if(projectId!==PROJECT||bucket!==BUCKET||!safeId(workspaceId)||!safeId(actorUid)
      ||!storage||typeof storage.ref!=="function"||!archiveApi||archiveApi.VERSION!==1
      ||!cryptoApi?.subtle?.digest||typeof fetchImpl!=="function")
      fail("configured Firebase project, bucket, identity, or required dependency is unavailable.");
    return Object.freeze({projectId,bucket,workspaceId,storage,archiveApi,cryptoApi,fetchImpl,actorUid});
  }
  function ref(context,descriptor){
    if(!descriptor||!safeId(descriptor.archiveId)||!safeDigest(descriptor.checksum)
      ||descriptor.path!==expectedPath(context.workspaceId,descriptor.archiveId,descriptor.checksum))
      fail("invalid or cross-workspace archive path.");
    return context.storage.ref().child(descriptor.path);
  }
  const len=text=>new TextEncoder().encode(text).length;
  function verifyMeta(actual,expected,refPath){
    if(!actual||actual.contentType!==MIME||!Number.isSafeInteger(actual.size)||actual.size<1||actual.size>MAX_BYTES)
      fail("invalid uploaded/downloaded Storage size or content type.");
    if(actual.fullPath&&actual.fullPath!==refPath)fail("Storage returned another object path.");
    for(const [k,v]of Object.entries(expected))if(actual.customMetadata?.[k]!==v)
      fail("Storage metadata mismatch: "+k+".");
  }
  async function uploadVerified(context,{prepared,createdAtISO}){
    const descriptor=prepared?.descriptor,body=prepared?.serialized;
    const object=ref(context,descriptor),expected=metadata(descriptor,{workspaceId:context.workspaceId,actorUid:context.actorUid,createdAtISO});
    if(typeof body!=="string"||len(body)>MAX_BYTES||len(body)<1)fail("archive segment is empty or exceeds the bounded size limit.");
    // Check serialized bytes and original ID digest BEFORE any network mutation.
    const verified=await context.archiveApi.verify({serialized:body,descriptor,cryptoApi:context.cryptoApi});
    if(context.archiveApi.canonical(verified)!==context.archiveApi.canonical(prepared.records))fail("prepared record evidence changed.");
    if(typeof Blob==="undefined")fail("Blob API is unavailable.");
    // This must only be used with strict create-only Storage Rules. No automatic
    // delete/retry: ambiguous uploads require operator reconciliation.
    await object.put(new Blob([body],{type:MIME}),{contentType:MIME,customMetadata:expected});
    const readback=await downloadVerified(context,{descriptor,expectedMetadata:expected});
    if(context.archiveApi.canonical(readback.records)!==context.archiveApi.canonical(verified))fail("independent readback differs from uploaded history.");
    return Object.freeze({descriptor,records:readback.records,verified:true});
  }
  async function downloadVerified(context,{descriptor,expectedMetadata}){
    const object=ref(context,descriptor);
    const found=await object.getMetadata();
    if(found.bucket&&found.bucket!==context.bucket)fail("Storage returned another bucket.");
    const required=expectedMetadata||metadata(descriptor,{workspaceId:context.workspaceId,
      actorUid:found?.customMetadata?.createdBy,createdAtISO:found?.customMetadata?.createdAtISO});
    verifyMeta(found,required,descriptor.path);
    // The token URL is never returned, persisted, logged, or included in errors.
    const privateUrl=await object.getDownloadURL();
    let response;
    try{response=await context.fetchImpl(privateUrl,{credentials:"omit",cache:"no-store"});}
    catch(_){fail("independent Storage download failed.");}
    if(!response?.ok)fail("Storage download HTTP request failed.");
    const data=await response.arrayBuffer();
    if(data.byteLength!==found.size||data.byteLength>MAX_BYTES||data.byteLength<1)fail("downloaded object length mismatch.");
    let serialized;
    try{serialized=new TextDecoder("utf-8",{fatal:true}).decode(data);}
    catch(_){fail("archive is not valid UTF-8.");}
    const records=await context.archiveApi.verify({serialized,descriptor,cryptoApi:context.cryptoApi});
    return Object.freeze({records,descriptor,verified:true});
  }
  return Object.freeze({PROJECT,BUCKET,MIME,MAX_BYTES,expectedPath,metadata,target,uploadVerified,downloadVerified});
});
