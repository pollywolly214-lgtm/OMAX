(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXShardedState=api;
})(typeof window==="undefined"?null:window,function(){
  "use strict";
  // Backward-compatible V1 sharding: the initial 35-field Storage snapshot
  // remains readable. Growing arrays/objects may be split across immutable
  // 512 KiB parts without removing, compacting or rewriting any source data.
  const VERSION=1,LIMIT=524288,MAX_SHARDS=512;
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
  const validField=field=>typeof field==="string"&&/^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/.test(field);
  const validID=id=>typeof id==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id);
  const validSHA=value=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);
  const partName=(field,index)=>field+"$p"+String(index).padStart(4,"0");
  const envelope=(field,data,revision)=>canonical({schemaVersion:VERSION,field,revision,data});
  function splitCollection(field,data,revision){
    const kind=Array.isArray(data)?"array":data!==null&&typeof data==="object"?"object":null;
    if(!kind)fail("field "+field+" exceeds maximum shard size and cannot be split without altering data.");
    if(field.length>118)fail("oversized field name too long for safe segment identifiers.");
    const items=kind==="array"?data:Object.entries(data);
    if(!items.length)fail("empty collection unexpectedly exceeds shard limit.");
    const chunks=[];
    let group=kind==="array"?[]:Object.create(null);
    let part=0,entries=0;
    const add=(destination,item)=>{
      if(kind==="array")destination.push(item);
      else Object.defineProperty(destination,item[0],{value:item[1],enumerable:true,writable:true,configurable:true});
    };
    const nextGroup=(destination,item)=>{
      const out=kind==="array"?destination.slice():Object.assign(Object.create(null),destination);
      add(out,item);return out;
    };
    for(const item of items){
      const proposed=nextGroup(group,item);
      if(bytes(envelope(partName(field,part),proposed,revision)).length>LIMIT){
        if(!entries)fail("one "+field+" element exceeds maximum shard size; no data was written.");
        chunks.push(group);
        part++;
        if(part>=MAX_SHARDS)fail("collection requires too many segments.");
        group=kind==="array"?[]:Object.create(null);
        entries=0;
        add(group,item);entries++;
        if(bytes(envelope(partName(field,part),group,revision)).length>LIMIT)
          fail("one "+field+" element exceeds maximum shard size; no data was written.");
      }else{group=proposed;entries++;}
    }
    if(entries)chunks.push(group);
    return {kind,chunks};
  }
  async function plan({state,workspaceId,operationId,cryptoApi}){
    plain(state);
    if(!state||Array.isArray(state)||!Number.isSafeInteger(state.syncMeta?.rev)||state.syncMeta.rev<0
      ||!validID(workspaceId)||!validID(operationId))fail("invalid source state or workspace identity.");
    const fields=Object.keys(state).sort();
    if(fields.length<1||fields.length>MAX_SHARDS||fields.some(field=>!validField(field)||field==="_manifest"))
      fail("invalid field list; no fields can be omitted.");
    const shards=[],revision=state.syncMeta.rev;
    const add=async(field,data,extra)=>{
      const serialized=envelope(field,data,revision),sizeBytes=bytes(serialized).byteLength;
      if(sizeBytes<1||sizeBytes>LIMIT)fail("field "+field+" exceeds safe shard size.");
      const sha256=await digest(serialized,cryptoApi);
      const path="workspaces/"+workspaceId+"/state-shards/v1/"+field+"/"+operationId+"/"+sha256+".json";
      shards.push({field,path,sha256,sizeBytes,serialized,...extra});
      if(shards.length>MAX_SHARDS)fail("shard count exceeds immutable manifest limit.");
    };
    for(const field of fields){
      const value=state[field];
      if(bytes(envelope(field,value,revision)).byteLength<=LIMIT){
        await add(field,value);
        continue;
      }
      const split=splitCollection(field,value,revision);
      for(let i=0;i<split.chunks.length;i++)
        await add(partName(field,i),split.chunks[i],
          {sourceField:field,partKind:split.kind,partIndex:i,partCount:split.chunks.length});
    }
    const manifest={schemaVersion:VERSION,workspaceId,operationId,sourceRevision:revision,
      shards:shards.map(({field,path,sha256,sizeBytes,sourceField,partKind,partIndex,partCount})=>{
        const normal={field,path,sha256,sizeBytes};
        if(sourceField!==undefined)Object.assign(normal,{sourceField,partKind,partIndex,partCount});
        return normal;
      })};
    if(bytes(canonical(manifest)).byteLength>LIMIT)fail("complete manifest exceeds maximum shard size.");
    return {manifest,shards};
  }
  async function reconstruct({manifest,serializedByPath,cryptoApi}){
    if(!manifest||manifest.schemaVersion!==VERSION||!validID(manifest.workspaceId)
      ||!validID(manifest.operationId)||!Number.isSafeInteger(manifest.sourceRevision)||manifest.sourceRevision<0
      ||!Array.isArray(manifest.shards)||!manifest.shards.length||manifest.shards.length>MAX_SHARDS)
      fail("invalid manifest.");
    const output={},seen=new Set(),split=new Map();
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
      if(entry.sourceField===undefined){
        if(Object.keys(entry).some(key=>!["field","path","sha256","sizeBytes"].includes(key)))
          fail("unknown legacy shard descriptor property.");
        if(Object.prototype.hasOwnProperty.call(output,entry.field))fail("duplicate source field.");
        Object.defineProperty(output,entry.field,{value:decoded.data,enumerable:true,writable:true,configurable:true});
        continue;
      }
      if(!validField(entry.sourceField)||entry.sourceField==="_manifest"
        ||!["array","object"].includes(entry.partKind)
        ||!Number.isInteger(entry.partIndex)||entry.partIndex<0
        ||!Number.isInteger(entry.partCount)||entry.partCount<1||entry.partCount>MAX_SHARDS
        ||entry.partIndex>=entry.partCount
        ||entry.field!==partName(entry.sourceField,entry.partIndex)
        ||Object.keys(entry).some(key=>!["field","path","sha256","sizeBytes","sourceField","partKind","partIndex","partCount"].includes(key))
        ||(entry.partKind==="array"&&!Array.isArray(decoded.data))
        ||(entry.partKind==="object"&&(!decoded.data||Array.isArray(decoded.data)||typeof decoded.data!=="object")))
        fail("invalid segmented shard descriptor.");
      let group=split.get(entry.sourceField);
      if(!group){
        group={kind:entry.partKind,count:entry.partCount,parts:new Map()};
        split.set(entry.sourceField,group);
      }
      if(group.kind!==entry.partKind||group.count!==entry.partCount||group.parts.has(entry.partIndex))
        fail("inconsistent/duplicate shard segment.");
      group.parts.set(entry.partIndex,decoded.data);
    }
    for(const [field,group] of split){
      if(group.parts.size!==group.count||Object.prototype.hasOwnProperty.call(output,field))
        fail("incomplete or colliding segmented source field.");
      const combined=group.kind==="array"?[]:{};
      for(let i=0;i<group.count;i++){
        if(!group.parts.has(i))fail("missing segment "+field+" part "+i+".");
        const part=group.parts.get(i);
        if(group.kind==="array")for(const item of part)combined.push(item);
        else for(const [key,value] of Object.entries(part)){
          if(Object.prototype.hasOwnProperty.call(combined,key))
            fail("duplicate collection key across segments.");
          Object.defineProperty(combined,key,{value,enumerable:true,writable:true,configurable:true});
        }
      }
      Object.defineProperty(output,field,{value:combined,enumerable:true,writable:true,configurable:true});
    }
    if(!output.syncMeta||output.syncMeta.rev!==manifest.sourceRevision||!Number.isSafeInteger(output.schema))
      fail("reconstructed state is missing required schema/revision.");
    if(Object.keys(output).length!==manifest.shards.length -
      [...split.values()].reduce((sum,x)=>sum+x.count-1,0))
      fail("manifest source field count mismatch.");
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
