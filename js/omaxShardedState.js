(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXShardedState=api;
})(typeof window==="undefined"?null:window,function(){
  "use strict";
  // Pure, inert field-level sharding planner. No Firebase or browser writes.
  const VERSION=1,LIMIT=524288;
  const fail=message=>{throw Error("OMAX sharded state: "+message);};
  function canonical(v){
    if(v===null||typeof v!=="object")return JSON.stringify(v);
    if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";
    return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";
  }
  function plain(value,seen=new WeakSet()){
    if(value===null||typeof value==="string"||typeof value==="boolean")return;
    if(typeof value==="number"&&Number.isFinite(value))return;
    if(!value||typeof value!=="object"||seen.has(value)
      ||(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value))))
      fail("non-JSON data is not archivable.");
    seen.add(value);
    if(Array.isArray(value)){
      for(let i=0;i<value.length;i++){
        if(!(i in value))fail("sparse array.");
        plain(value[i],seen);
      }
    }else for(const [key,v]of Object.entries(value))plain(v,seen);
    seen.delete(value);
  }
  const bytes=string=>new TextEncoder().encode(string);
  const digest=async(serialized,cryptoApi)=>{
    if(!cryptoApi?.subtle?.digest)fail("SHA-256 unavailable.");
    const buffer=await cryptoApi.subtle.digest("SHA-256",bytes(serialized));
    return [...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,"0")).join("");
  };
  const validField=field=>typeof field==="string"&&/^[A-Za-z_$][a-zA-Z0-9_$]{0,127}$/.test(field);
  const validID=id=>typeof id==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id);
  const validSHA=value=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);
  async function plan({state,workspaceId,operationId,cryptoApi}){
    plain(state);
    if(!state||Array.isArray(state)||!Number.isSafeInteger(state.syncMeta?.rev)||state.syncMeta.rev<0
      ||!validID(workspaceId)||!validID(operationId))fail("invalid source state or workspace identity.");
    const fields=Object.keys(state).sort();
    if(fields.length<1||fields.length>512||fields.some(field=>!validField(field)))
      fail("invalid field list; no fields can be omitted.");
    const shards=[];
    for(const field of fields){
      const source={schemaVersion:VERSION,field,revision:state.syncMeta.rev,data:state[field]};
      const serialized=canonical(source),sizeBytes=bytes(serialized).byteLength;
      if(sizeBytes<1||sizeBytes>LIMIT)
        fail("field "+field+" exceeds safe shard size; split it before migration.");
      const sha256=await digest(serialized,cryptoApi);
      const path="workspaces/"+workspaceId+"/state-shards/v1/"+field+"/"+operationId+"/"+sha256+".json";
      shards.push({field,path,sha256,sizeBytes,serialized});
    }
    const manifest={schemaVersion:VERSION,workspaceId,operationId,sourceRevision:state.syncMeta.rev,
      shards:shards.map(({field,path,sha256,sizeBytes})=>({field,path,sha256,sizeBytes}))};
    return {manifest,shards};
  }
  async function reconstruct({manifest,serializedByPath,cryptoApi}){
    if(!manifest||manifest.schemaVersion!==VERSION||!validID(manifest.workspaceId)
      ||!validID(manifest.operationId)||!Number.isSafeInteger(manifest.sourceRevision)||manifest.sourceRevision<0
      ||!Array.isArray(manifest.shards)||!manifest.shards.length||manifest.shards.length>512)
      fail("invalid manifest.");
    const output=Object.create(null),seen=new Set();
    for(const entry of manifest.shards){
      if(!validField(entry?.field)||seen.has(entry.field)||!validSHA(entry.sha256)
        ||!Number.isSafeInteger(entry.sizeBytes)||entry.sizeBytes<1||entry.sizeBytes>LIMIT
        ||entry.path!=="workspaces/"+manifest.workspaceId+"/state-shards/v1/"+entry.field+"/"+manifest.operationId+"/"+entry.sha256+".json")
        fail("invalid/duplicate shard descriptor.");
      seen.add(entry.field);
      const serialized=serializedByPath instanceof Map?serializedByPath.get(entry.path):undefined;
      if(typeof serialized!=="string")fail("missing shard: "+entry.field);
      if(bytes(serialized).byteLength!==entry.sizeBytes||await digest(serialized,cryptoApi)!==entry.sha256)
        fail("shard checksum/size mismatch: "+entry.field);
      let decoded;
      try{decoded=JSON.parse(serialized);}catch(_){fail("malformed JSON shard: "+entry.field);}
      if(decoded.schemaVersion!==VERSION||decoded.field!==entry.field||decoded.revision!==manifest.sourceRevision
        ||canonical(decoded)!==serialized||!Object.prototype.hasOwnProperty.call(decoded,"data"))
        fail("shard identity/canonical envelope mismatch: "+entry.field);
      plain(decoded.data);
      // Avoid prototype pollution and preserve exactly the original top-level field list.
      Object.defineProperty(output,entry.field,{value:decoded.data,configurable:true,enumerable:true,writable:true});
    }
    if(!output.syncMeta||output.syncMeta.rev!==manifest.sourceRevision||!Number.isSafeInteger(output.schema))
      fail("reconstructed state is missing required schema/revision.");
    if(Object.keys(output).length!==manifest.shards.length)fail("manifest field count mismatch.");
    return output;
  }
  async function checkExact({source,manifest,serializedByPath,cryptoApi}){
    plain(source);
    const result=await reconstruct({manifest,serializedByPath,cryptoApi});
    if(canonical(result)!==canonical(source))fail("reconstruction differs from original source.");
    return {verified:true,fieldCount:Object.keys(source).length,revision:manifest.sourceRevision};
  }
  return Object.freeze({VERSION,LIMIT,canonical,plan,reconstruct,checkExact});
});
