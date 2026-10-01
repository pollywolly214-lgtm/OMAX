(function(root,factory){
  const api=factory(typeof module==="object"&&module.exports?require("./inventoryIdentityRepair"):root.OMAXInventoryIdentityRepair);
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXGlobalIdentityRepair=api;
})(typeof window==="undefined"?null:window,function(inventoryRepair){
  "use strict";
  const {key,business,counts}=inventoryRepair,clone=value=>JSON.parse(JSON.stringify(value));
  const taskCollection="maintenanceTasksV2",instanceCollection="maintenanceCalendarInstancesV2",eventCollection="maintenanceOccurrencesV2";
  const requiredIds=new Set(["inventory","inventoryFolders","tasksInterval","tasksAsReq",taskCollection,instanceCollection,eventCollection,"cuttingJobs","completedCuttingJobs","jobFolders","settingsFolders","folders","orderRequests","inventoryTransactions","garnetCleanings","deletedItems"]);
  const valid=id=>typeof id==="string"&&id.trim()===id&&id.length>0;
  // Encode the complete semantic tuple injectively, rather than using a lossy
  // hash, a clock, a display name, or the position at which evidence was read.
  const permanentId=(kind,tuple)=>`ph06_${kind}_`+Array.from(key(tuple)).map(char=>char.codePointAt(0).toString(16).padStart(6,"0")).join("");
  const namespace=collection=>["tasksInterval","tasksAsReq"].includes(collection)?"legacyTasks":["cuttingJobs","completedCuttingJobs"].includes(collection)?"jobs":collection;
  const pathText=path=>"$"+path.map(part=>typeof part==="number"?`[${part}]`:/^[A-Za-z_$][\w$]*$/.test(part)?`.${part}`:`[${JSON.stringify(part)}]`).join("");
  function preview(state){
    const plan={sourceRevision:state?.syncMeta?.rev??0,sourceSignature:key(state),auditedCollections:[],duplicateGroups:[],missingIds:[],references:[],unknownReferences:[],blockers:[],changes:[],affectedRows:[],beforeCounts:counts(state),expectedAfterCounts:counts(state),noop:false};
    const block=message=>{if(!plan.blockers.includes(message))plan.blockers.push(message);};
    if(!state||typeof state!=="object"){block("Authoritative state is absent.");return plan;}
    if(!Number.isSafeInteger(plan.sourceRevision)||plan.sourceRevision<0)block("Authoritative revision is invalid.");
    const records=[],byNamespace=new Map(),byPath=new Map();
    const add=(row,path,collection,identityField="id")=>{
      const record={row:row&&typeof row==="object"?row:{},path,collection,identityField,id:row?.[identityField],logicalTask:null,proposedId:row?.[identityField]};records.push(record);byPath.set(pathText(path),record);
      const ns=namespace(collection),list=byNamespace.get(ns)||[];list.push(record);byNamespace.set(ns,list);
      if(!valid(record.id)){plan.missingIds.push({collection,path:pathText(path),indexes:path.filter(part=>typeof part==="number"),evidence:clone(row??null),id:record.id??null});block(`Missing/noncanonical ${identityField} at ${pathText(path)}.`);}
    };
    // Required schema collections plus every additional ID-bearing array. Nested
    // import IDs are identities too, scoped to their containing collection.
    const discover=(value,path=[])=>{
      if(Array.isArray(value)){
        const collection=path.length===1?path[0]:pathText(path),mandatory=requiredIds.has(collection)||(path.length===1&&value.some(row=>row&&typeof row==="object"&&Object.hasOwn(row,"id")))||collection==="$.inventoryMaterials.types"||(path[0]==="orderRequests"&&path.at(-1)==="items")||(["cuttingJobs","completedCuttingJobs"].includes(path[0])&&path.at(-1)==="files"),week=collection==="receiptTrackerWeeks",dateKey=["dailyCutHours","totalHistory"].includes(collection);
        value.forEach((row,index)=>{
          if(row&&typeof row==="object"&&!Array.isArray(row)){
            const field=dateKey?"dateISO":week?("key" in row?"key":"id"):"id";
            if(mandatory||week||dateKey||Object.hasOwn(row,field))add(row,[...path,index],collection,field);
            if(Object.hasOwn(row,"import_event_id")){
              const scope=path[0]==="receiptTrackerWeeks"?"purchaseImportEvents":path[0]==="pumpEff"?"pumpImportEvents":["tasksInterval","tasksAsReq"].includes(path[0])?"maintenanceImportEvents":["cuttingJobs","completedCuttingJobs"].includes(path[0])?"cuttingImportEvents":collection+"#import";
              add(row,[...path,index],scope,"import_event_id");
            }
          }else if(mandatory||week||dateKey)add(row,[...path,index],collection);
          discover(row,[...path,index]);
        });
      }else if(value&&typeof value==="object"){
        if(Object.hasOwn(value,"id")&&!byPath.has(pathText(path)))add(value,path,path.length===1?path[0]:pathText(path.slice(0,-1)));
        for(const [name,child]of Object.entries(value))discover(child,[...path,name]);
      }
    };
    for(const name of requiredIds)if(Object.hasOwn(state,name)&&!Array.isArray(state[name]))block(`${name} must be an array.`);
    discover(state);
    plan.auditedCollections=Array.from(byNamespace,([collection,list])=>({collection,count:list.length,identityFields:[...new Set(list.map(record=>record.identityField))]}));
    for(const [ns,list]of byNamespace){
      const groups=new Map();for(const record of list)if(valid(record.id)){const group=groups.get(record.id)||[];group.push(record);groups.set(record.id,group);}
      for(const [id,group]of groups)if(group.length>1){
        const report={collection:ns,id,indexes:group.map(record=>record.path.filter(part=>typeof part==="number")),records:group.map(record=>({collection:record.collection,path:pathText(record.path),evidence:clone(record.row)})),references:[],repairProvable:false,proposedIds:[]};plan.duplicateGroups.push(report);
        group.forEach(record=>record.group=report);
        if(!["inventory",taskCollection,instanceCollection,eventCollection].includes(ns))block(`Duplicate ID ${id} in ${ns} requires separate reviewed mapping.`);
      }
    }
    const list=name=>byNamespace.get(name)||[],lookup=(name,id)=>list(name).filter(record=>record.id===id);
    const patch=(path,before,after)=>{if(before===after)return;const existing=plan.changes.find(change=>pathText(change.path)===pathText(path));if(existing){if(existing.after!==after)block(`Conflicting identity changes at ${pathText(path)}.`);return;}plan.changes.push({path,fieldPath:pathText(path),before,after});};
    const inv=inventoryRepair.preview({inventory:[],tasksInterval:[],tasksAsReq:[],maintenanceTasksV2:[],...state});plan.inventoryPlan=inv;inv.blockers.forEach(block);
    for(const row of inv.affectedRows){if(!row.proposedInventoryId||!row.legacyTask)continue;patch(["inventory",row.inventoryIndex,"id"],row.oldInventoryId,row.proposedInventoryId);patch([row.legacyTask.collection,row.legacyTask.index,"inventoryId"],row.oldInventoryId,row.proposedInventoryId);byPath.get(`$.inventory[${row.inventoryIndex}]`).proposedId=row.proposedInventoryId;}
    for(const row of inv.v2Relinks)patch([taskCollection,row.index,"inventoryId"],row.oldInventoryId,row.proposedInventoryId);
    const tasks=list(taskCollection),instances=list(instanceCollection),events=list(eventCollection);
    for(const record of tasks){
      const legacy=record.row.legacyTaskId;
      if(legacy!=null){if(!valid(legacy)||lookup("legacyTasks",legacy).length!==1)block(`V2 task ${pathText(record.path)} has no unique legacy task.`);else record.logicalTask=legacy;}
      else if(!record.group)record.logicalTask="v2:"+record.id;
      if(record.group&&(!record.logicalTask||tasks.filter(other=>other.row.legacyTaskId===legacy).length!==1))block(`Ambiguous task mapping at ${pathText(record.path)}; unique legacyTaskId is required.`);
    }
    // Constraint propagation uses exact foreign keys and explicit provenance.
    // It never chooses the first record from a duplicate-ID group.
    const candidates=(name,id,logical)=>lookup(name,id).filter(record=>!logical||!record.logicalTask||record.logicalTask===logical);
    for(const record of [...instances,...events])if(valid(record.row.legacyTaskId))record.logicalTask=record.row.legacyTaskId;
    for(let pass=0;pass<records.length;pass++){
      let changed=false;
      for(const record of [...instances,...events]){
        const row=record.row,sets=[];
        if(row.taskId)sets.push(lookup(taskCollection,row.taskId));
        if(record.collection===eventCollection){if(row.instanceId)sets.push(lookup(instanceCollection,row.instanceId));for(const field of ["rootOccurrenceId","supersedesEventId"])if(row[field]&&(typeof row[field]!=="string"||!row[field].startsWith("repeat:")))sets.push(lookup(eventCollection,row[field]));}
        for(const options of sets){const known=new Set(options.map(other=>other.logicalTask).filter(Boolean));
          if(record.logicalTask){if(options.length&&options.every(other=>other.logicalTask)&&!known.has(record.logicalTask))block(`Conflicting task provenance at ${pathText(record.path)}.`);}
          else if(options.length&&options.every(other=>other.logicalTask)&&known.size===1){record.logicalTask=[...known][0];changed=true;}
        }
      }
      if(!changed)break;
    }
    for(const record of tasks)if(record.group&&record.logicalTask)record.proposedId=permanentId("task",[record.logicalTask]);
    for(const record of instances){
      const row=record.row;
      if(!record.logicalTask)block(`Ambiguous instance task at ${pathText(record.path)}.`);
      if(!["one_time","repeat"].includes(row.instanceMode)||!/^\d{4}-\d{2}-\d{2}$/.test(row.startDateISO||""))block(`Instance mode/start date evidence is missing at ${pathText(record.path)}.`);
      record.semantic=[record.logicalTask,row.startDateISO,row.instanceMode,row.repeatRule??null];
      if(record.group)record.proposedId=permanentId("instance",record.semantic);
    }
    const resolveInstance=record=>{
      let options=candidates(instanceCollection,record.row.instanceId,record.logicalTask);
      // A date is sufficient only for a base one-time event; moved events must
      // retain the exact original instance through their chain, not today's date.
      if(options.length>1&&!record.row.rootOccurrenceId&&!record.row.supersedesEventId)options=options.filter(other=>other.row.instanceMode==="one_time"&&other.row.startDateISO===record.row.effectiveDateISO);
      if(options.length!==1){block(`Ambiguous instance reference at ${pathText(record.path)} (${options.length} candidates).`);return null;}
      return options[0];
    };
    for(const record of events){
      record.instance=resolveInstance(record);
      if(!record.logicalTask)block(`Ambiguous occurrence task at ${pathText(record.path)}.`);
      if(record.group){
        const row=record.row;
        if(!valid(row.eventType)||!valid(row.effectiveDateISO)||!valid(row.recordedAtISO))block(`Ambiguous occurrence provenance at ${pathText(record.path)}.`);
        record.proposedId=permanentId("occurrence",[record.instance?.semantic??null,row.eventType,row.effectiveDateISO,row.recordedAtISO,row.rootOccurrenceId??null,row.supersedesEventId??null]);
      }
    }
    for(const name of [taskCollection,instanceCollection,eventCollection]){
      const used=new Map();for(const record of list(name)){if(used.has(record.proposedId))block(`Proposed ID collision / ambiguous ${name} mapping: ${record.proposedId}.`);used.set(record.proposedId,record);if(record.group)patch([...record.path,"id"],record.id,record.proposedId);}
    }
    const supported=new Set(plan.changes.map(change=>change.fieldPath));
    function ref(record,field,name,required=false){
      const value=record.row[field],path=[...record.path,field];
      if(value==null||value===""){if(required)block(`Required ${field} is absent at ${pathText(record.path)}.`);return;}
      let options=lookup(name,value);
      if([taskCollection,instanceCollection,eventCollection].includes(name))options=options.filter(other=>other.logicalTask===record.logicalTask);
      if(name===instanceCollection&&record.instance)options=options.filter(other=>other===record.instance);
      if(name===eventCollection&&record.instance)options=options.filter(other=>other.instance===record.instance);
      if(options.length!==1){block(`Foreign key ${pathText(path)} has ${options.length} exact logical targets.`);return;}
      const target=options[0];plan.references.push({path:pathText(path),target:pathText(target.path),value,proposedId:target.proposedId});supported.add(pathText(path));patch(path,value,target.proposedId);
      if(name===eventCollection&&field==="rootOccurrenceId"&&target.row.rootOccurrenceId)block(`Occurrence root at ${pathText(path)} does not point to a base event.`);
      if(name===eventCollection&&field==="supersedesEventId"&&(!record.row.rootOccurrenceId||(target.row.rootOccurrenceId||target.id)!==record.row.rootOccurrenceId))block(`Supersedes event at ${pathText(path)} belongs to a different root chain.`);
      if(target.group)target.group.references.push(pathText(path));
    }
    for(const record of records){
      const {row,collection}=record;if(!row||typeof row!=="object")continue;
      // A copied ID in an unknown object is not proof that it owns an
      // independent identity. Only members of the audited collision group may
      // claim its ambiguous old ID as a supported own-ID occurrence.
      if(record.group||!plan.duplicateGroups.some(group=>group.id===record.id))supported.add(pathText([...record.path,record.identityField]));
      if([instanceCollection,eventCollection].includes(collection))ref(record,"taskId",taskCollection,true);
      if(collection===eventCollection){
        ref(record,"instanceId",instanceCollection,true);
        for(const field of ["rootOccurrenceId","supersedesEventId"]){
          const value=row[field];if(typeof value==="string"&&value.startsWith("repeat:")){
            const match=/^repeat:(.+):(\d{4}-\d{2}-\d{2}|slot:[1-9]\d*)$/.exec(value),target=record.instance;
            if(!match||!target||target.id!==match[1]||target.row.instanceMode!=="repeat")block(`Invalid repeat-root relationship at ${pathText(record.path)}.${field}.`);
            else{supported.add(pathText([...record.path,field]));patch([...record.path,field],value,`repeat:${target.proposedId}:${match[2]}`);plan.references.push({path:pathText([...record.path,field]),target:pathText(target.path),value,proposedId:`repeat:${target.proposedId}:${match[2]}`});}
          }else ref(record,field,eventCollection);
        }
      }
      if([taskCollection,instanceCollection,eventCollection].includes(collection))ref(record,"legacyTaskId","legacyTasks");
      if(collection==="inventory")ref(record,"linkedTaskId","legacyTasks");
      if(["tasksInterval","tasksAsReq",taskCollection].includes(collection)){
        // Inventory duplicate references were proven by the PH-05 one-to-one
        // task/inventory correspondence; don't reinterpret them globally.
        if(!supported.has(pathText([...record.path,"inventoryId"])))ref(record,"inventoryId","inventory");
        if(["tasksInterval","tasksAsReq"].includes(collection)){ref(record,"templateId","legacyTasks");ref(record,"parentTask","legacyTasks");}
      }
      if(collection==="inventory")ref(record,"folderId","inventoryFolders");
      if(["cuttingJobs","completedCuttingJobs"].includes(collection)){ref(record,"cat","jobFolders");ref(record,"folderId","jobFolders");}
      if(["tasksInterval","tasksAsReq",taskCollection].includes(collection))ref(record,collection===taskCollection?"categoryRef":"cat","settingsFolders");
      if(["inventoryFolders","jobFolders","settingsFolders","folders"].includes(collection))ref(record,"parent",collection);
      for(const field of ["inventoryItemId","inventoryId"])if(!["inventory",taskCollection,"tasksInterval","tasksAsReq"].includes(collection)&&Object.hasOwn(row,field))ref(record,field,"inventory");
      ref(record,"jobId","jobs");ref(record,"requestId","orderRequests");
    }
    // Check reference-bearing objects without IDs (receipt rows, provenance,
    // history, and attachments), too. Unknown V2 consumers remain blockers.
    const referenceWalk=(value,path=[])=>{
      if(!value||typeof value!=="object")return;
      if(!Array.isArray(value)&&!byPath.has(pathText(path))){const record={row:value,path,collection:pathText(path)};
        for(const [field,target]of [["inventoryId","inventory"],["inventoryItemId","inventory"],["linkedTaskId","legacyTasks"],["legacyTaskId","legacyTasks"],["jobId","jobs"],["requestId","orderRequests"]])if(Object.hasOwn(value,field))ref(record,field,target);
      }
      for(const [name,child]of Object.entries(value))referenceWalk(child,[...path,Array.isArray(value)?Number(name):name]);
    };referenceWalk(state);
    if(state.inventoryMaterials&&!Array.isArray(state.inventoryMaterials)){
      const types=list("$.inventoryMaterials.types"),model=state.inventoryMaterials;
      if(model.activeType&&!types.some(record=>record.id===model.activeType))block("Inventory material activeType has no exact type identity.");
      for(const field of ["sheets","rows"])for(const id of Object.keys(model[field]||{}))if(!types.some(record=>record.id===id))block(`Inventory material ${field} key ${id} has no exact type identity.`);
    }
    // A supersedes chain must remain a directed, acyclic chain after exact
    // disambiguation. Date ordering alone is never used to invent an edge.
    for(const origin of events){const visited=new Set();let current=origin;
      while(current?.row.supersedesEventId){if(visited.has(current)){block(`Cyclic supersedes chain at ${pathText(origin.path)}.`);break;}visited.add(current);const options=candidates(eventCollection,current.row.supersedesEventId,current.logicalTask).filter(other=>other.instance===current.instance);current=options.length===1?options[0]:null;}
    }
    for(const [name,field]of [["legacyTasks","parentTask"],["inventoryFolders","parent"],["jobFolders","parent"],["settingsFolders","parent"],["folders","parent"]])for(const origin of list(name)){
      const visited=new Set();let current=origin;while(current&&current.row[field]!=null){if(visited.has(current)){block(`Cyclic ${field} identity hierarchy at ${pathText(origin.path)}.`);break;}visited.add(current);const options=lookup(name,current.row[field]);current=options.length===1?options[0]:null;}
    }
    // Unknown references to *actual colliding IDs*, including deleted evidence,
    // require review. Repeated names, prices, dates etc. never define collisions.
    const duplicateIds=new Set(plan.duplicateGroups.map(group=>group.id));
    const walk=(value,path=[])=>{
      if(typeof value==="string")for(const id of duplicateIds)if(value.includes(id)&&!supported.has(pathText(path))){plan.unknownReferences.push({path:pathText(path),id,value});block(`Unknown duplicate-ID reference at ${pathText(path)}.`);}
      if(value&&typeof value==="object")for(const [name,child]of Object.entries(value)){for(const id of duplicateIds)if(name.includes(id)){plan.unknownReferences.push({path:pathText(path),key:name,id});block(`Unknown duplicate-ID object key at ${pathText(path)}.`);}walk(child,[...path,Array.isArray(value)?Number(name):name]);}
    };walk(state);
    for(const group of plan.duplicateGroups){group.proposedIds=records.filter(record=>record.group===group).map(record=>({path:pathText(record.path),id:record.proposedId,logicalTask:record.logicalTask}));group.repairProvable=group.proposedIds.every(record=>record.id!==group.id)&&new Set(group.proposedIds.map(record=>record.id)).size===group.proposedIds.length&&!plan.blockers.length;}
    plan.affectedRows=plan.changes.filter(change=>change.path.at(-1)==="id");plan.noop=!plan.changes.length&&!plan.blockers.length;
    return plan;
  }
  function repairedState(source,plan){
    if(plan.blockers.length)throw Error("Global identity plan has blockers.");
    const next=clone(source);for(const change of plan.changes){const parent=change.path.slice(0,-1).reduce((value,part)=>value[part],next),field=change.path.at(-1);if(parent[field]!==change.before)throw Error("Exact identity patch source mismatch.");parent[field]=change.after;}return next;
  }
  function integrity(state){const plan=preview(state);return{valid:plan.noop,blockers:[...plan.blockers,...plan.duplicateGroups.map(group=>`Duplicate ID ${group.id} in ${group.collection}.`)],plan};}
  function verify(source,plan,expected,actual){
    if(key(actual)!==key(expected))throw Error("Server differs from exact authorized global repair.");
    if(key(counts(actual))!==key(plan.beforeCounts)||key(business(actual))!==key(business(repairedState(source,plan))))throw Error("Protected counts or unrelated business data changed.");
    if(!Number.isSafeInteger(actual.syncMeta?.rev)||actual.syncMeta.rev<=plan.sourceRevision||actual.syncMeta.rev!==expected.syncMeta?.rev)throw Error("Transaction revision was not verified.");
    const check=integrity(actual);if(!check.valid)throw Error(check.blockers.join(" "));return true;
  }
  const strategy={preview,repairedState,verify};
  return Object.freeze({...strategy,key,business,counts,permanentId,integrity,createApi:env=>inventoryRepair.createApi(env,strategy)});
});
