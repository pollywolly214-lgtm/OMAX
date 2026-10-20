(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXWaterQuality=api;
})(typeof window==="undefined"?null:window,function(){
  "use strict";
  const fields=["date","time","ppm","softness","initials","note"];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const key=value=>value===null||typeof value!=="object"?JSON.stringify(value):Array.isArray(value)?"["+value.map(key).join(",")+"]":"{"+Object.keys(value).sort().map(name=>JSON.stringify(name)+":"+key(value[name])).join(",")+"}";
  const values=record=>Object.fromEntries(fields.map(name=>[name,record[name]]));
  // Identical submissions keep their ID across refresh/device/storage failures.
  // A hash collision still fails closed via the exact value comparison in plan.
  function submissionId(record){
    let hash=14695981039346656037n;
    for(const character of key(values(record)))hash=BigInt.asUintN(64,(hash^BigInt(character.codePointAt(0)))*1099511628211n);
    return "water_check_"+hash.toString(16).padStart(16,"0");
  }
  function validate(records){
    const ids=new Set();
    if(!Array.isArray(records))throw Error("Water-quality history is not a list; review it before saving.");
    for(const record of records){
      if(!record||typeof record.id!=="string"||!record.id||ids.has(record.id)
        ||typeof record.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(record.date)
        ||!Number.isFinite(Date.parse(record.date+"T00:00:00Z"))||new Date(record.date+"T00:00:00Z").toISOString().slice(0,10)!==record.date
        ||typeof record.time!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(record.time)
        ||!Number.isFinite(record.ppm)||!["Pass","Fail"].includes(record.softness)
        ||typeof record.initials!=="string"||!record.initials.trim()||typeof record.note!=="string"
        ||record.editHistory!==undefined&&!Array.isArray(record.editHistory))throw Error("Water-quality history contains an invalid or duplicate record; review it before saving.");
      ids.add(record.id);
    }
    return records;
  }
  function readLegacy(read){
    try{return{records:validate(JSON.parse(read()||"[]")),warning:""};}
    catch(_){return{records:[],warning:"Browser-only water-quality history could not be read and was left untouched."};}
  }
  function mergeLegacy(shared,legacy){
    const result=clone(validate(shared));
    for(const record of validate(legacy)){
      const existing=result.find(row=>row.id===record.id);
      if(existing){
        if(key(values(existing))!==key(values(record))&&key(existing.legacySource)!==key(record))throw Error("Browser-only and shared water-quality records have a conflicting ID; review the history before saving.");
      }else result.push({...clone(record),legacySource:clone(record)});
    }
    return result;
  }
  function plan(source,request,actorUid,atISO){
    const records=mergeLegacy(source.waterQualityChecks??[],request.legacy||[]);
    const record=clone(request.record);validate([record]);
    const index=records.findIndex(row=>row.id===record.id);
    if(request.expected){
      if(index<0||key(values(records[index]))!==key(values(request.expected)))throw Error("This water-quality record changed since editing began. Reload and review it.");
      if(key(values(records[index]))!==key(values(record))){
        const prior=records[index];
        records[index]={...prior,...values(record),editHistory:[...(prior.editHistory||[]),{before:values(prior),after:values(record),actorUid,atISO}]};
      }
    }else if(index>=0){
      if(key(values(records[index]))!==key(values(record)))throw Error("This submission ID already belongs to another water-quality check.");
    }else records.unshift({...record,createdBy:actorUid,createdAtISO:atISO});
    return{...clone(source),waterQualityChecks:records};
  }
  return Object.freeze({fields,key,submissionId,validate,readLegacy,mergeLegacy,plan});
});
