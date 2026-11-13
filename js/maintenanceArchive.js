(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXMaintenanceArchive=api;
})(typeof window==="undefined"?null:window,function(){
  "use strict";
  const VERSION=1;
  const fail=message=>{throw Error("Maintenance archive: "+message);};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const canonical=value=>{
    if(value===null||typeof value!=="object")return JSON.stringify(value);
    if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
    return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
  };
  function assertRecords(rows){
    if(!Array.isArray(rows))fail("record list must be an array.");
    const seen=new Set();
    rows.forEach((row,index)=>{
      if(!row||typeof row!=="object"||Array.isArray(row)||typeof row.id!=="string"||!row.id.trim()||row.id!==row.id.trim())fail("invalid record ID at "+index+".");
      if(seen.has(row.id))fail("duplicate record ID "+row.id+".");
      seen.add(row.id);
    });
    return seen;
  }
  function validRevision(rev){return Number.isSafeInteger(rev)&&rev>=0;}
  function validDigest(digest){return typeof digest==="string"&&/^[a-f0-9]{64}$/.test(digest);}
  function validId(id){return typeof id==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id);}
  function bytes(text){
    if(typeof TextEncoder!=="undefined")return new TextEncoder().encode(text);
    if(typeof Buffer!=="undefined")return Buffer.from(text,"utf8");
    fail("UTF-8 encoder unavailable.");
  }
  async function sha256(text,cryptoApi){
    if(!cryptoApi?.subtle?.digest)fail("SHA-256 is unavailable; archiving must not proceed.");
    const digest=await cryptoApi.subtle.digest("SHA-256",bytes(text));
    return Array.from(new Uint8Array(digest)).map(part=>part.toString(16).padStart(2,"0")).join("");
  }
  function selectPrefix(state,count){
    const rows=state?.maintenanceOccurrencesV2;
    assertRecords(rows);
    if(!validRevision(state?.syncMeta?.rev))fail("invalid source revision.");
    if(!Number.isSafeInteger(count)||count<1||count>rows.length)fail("prefix count must select existing records.");
    return clone(rows.slice(0,count));
  }
  async function prepare({state,count,archiveId,workspaceId,cryptoApi}){
    if(!validId(archiveId)||!validId(workspaceId))fail("invalid archive/workspace ID.");
    if(state?.maintenanceArchiveManifest!==undefined)fail("existing archives require manifest-aware planning; never overwrite them.");
    const records=selectPrefix(state,count);
    const body={schemaVersion:VERSION,collection:"maintenanceOccurrencesV2",workspaceId,archiveId,sourceRevision:state.syncMeta.rev,records};
    const serialized=canonical(body);
    const checksum=await sha256(serialized,cryptoApi);
    const path="workspaces/"+workspaceId+"/maintenance-history/v1/"+archiveId+"/"+checksum+".json";
    const descriptor={schemaVersion:VERSION,archiveId,path,checksum,recordCount:records.length,
      firstId:records[0].id,lastId:records[records.length-1].id,sourceRevision:state.syncMeta.rev,
      sourcePrefixIds:records.map(row=>row.id)};
    return {serialized,descriptor,records};
  }
  async function verify({serialized,descriptor,cryptoApi}){
    if(typeof serialized!=="string"||!descriptor||descriptor.schemaVersion!==VERSION||!validDigest(descriptor.checksum))fail("invalid archive envelope.");
    let body;
    try{body=JSON.parse(serialized);}catch(_){fail("archive is not valid JSON.");}
    if(body?.schemaVersion!==VERSION||body.collection!=="maintenanceOccurrencesV2"||!validId(body.workspaceId)||!validId(body.archiveId)
      ||body.archiveId!==descriptor.archiveId||!validRevision(body.sourceRevision)||body.sourceRevision!==descriptor.sourceRevision)
      fail("archive metadata mismatch.");
    if(canonical(body)!==serialized)fail("noncanonical archive bytes.");
    const actual=await sha256(serialized,cryptoApi);
    if(actual!==descriptor.checksum)fail("SHA-256 mismatch.");
    const ids=assertRecords(body.records);
    if(ids.size!==descriptor.recordCount||body.records[0]?.id!==descriptor.firstId||body.records.at(-1)?.id!==descriptor.lastId
      ||!Array.isArray(descriptor.sourcePrefixIds)||canonical(body.records.map(row=>row.id))!==canonical(descriptor.sourcePrefixIds))
      fail("archive record count/order/identity mismatch.");
    const path="workspaces/"+body.workspaceId+"/maintenance-history/v1/"+body.archiveId+"/"+actual+".json";
    if(path!==descriptor.path)fail("archive path mismatch.");
    return clone(body.records);
  }
  function reconstruct({active,archived,descriptors}){
    assertRecords(active);
    if(!Array.isArray(archived)||!Array.isArray(descriptors)||archived.length!==descriptors.length)fail("missing archive segment.");
    const merged=[],seen=new Set();
    archived.forEach((rows,index)=>{
      const descriptor=descriptors[index];
      assertRecords(rows);
      if(!descriptor||descriptor.recordCount!==rows.length||canonical(rows.map(row=>row.id))!==canonical(descriptor.sourcePrefixIds))
        fail("archive segment does not match its verified descriptor.");
      rows.forEach(row=>{if(seen.has(row.id))fail("overlapping archive identity.");seen.add(row.id);merged.push(clone(row));});
    });
    active.forEach(row=>{if(seen.has(row.id))fail("archive/active duplicate identity.");seen.add(row.id);merged.push(clone(row));});
    return merged;
  }
  function proposeCutover({source,prepared,verifiedRecords}){
    if(!source||!prepared||!Array.isArray(verifiedRecords))fail("verified archive evidence is required.");
    const original=source.maintenanceOccurrencesV2;
    assertRecords(original);
    if(source.maintenanceArchiveManifest!==undefined)fail("source already has an archive manifest.");
    const descriptor=prepared.descriptor,count=descriptor?.recordCount;
    if(!validRevision(source.syncMeta?.rev)||source.syncMeta.rev!==descriptor.sourceRevision||count>original.length
      ||canonical(original.slice(0,count))!==canonical(verifiedRecords)
      ||canonical(verifiedRecords)!==canonical(prepared.records))fail("source revision or archive contents changed.");
    // A proposal is not authorization to bypass protected-state validators or CAS.
    const proposed=clone(source);
    proposed.maintenanceOccurrencesV2=clone(original.slice(count));
    proposed.maintenanceArchiveManifest={schemaVersion:VERSION,collection:"maintenanceOccurrencesV2",segments:[clone(descriptor)]};
    return proposed;
  }
  return Object.freeze({VERSION,canonical,assertRecords,selectPrefix,prepare,verify,reconstruct,proposeCutover});
});
