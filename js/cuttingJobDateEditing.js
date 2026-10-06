(function(root,factory){
  "use strict";
  const api=factory(root?.CuttingJobChronology||(typeof require==="function"?require("./cuttingJobChronology.js"):null));
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.CuttingJobDateEditing=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(chronology){
  "use strict";
  const cmp=(a,b)=>a<b?-1:a>b?1:0, clone=value=>structuredClone(value);
  const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null;
  const rank=job=>/^C\d+$/i.test(String(job?.cutNumber||""))?positive(String(job.cutNumber).slice(1)):null;
  function dateKey(value){
    if(typeof value!=="string")return null;
    const day=value.slice(0,10);
    return chronology.validCutDate(day)&&(value.length===10||(/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value))))?day:null;
  }
  const businessDate=(job,completed)=>dateKey(completed?job?.completedAtISO:job?.startISO);
  function orderedJobs(active=[],completed=[]){
    const entries=[...active.map(job=>({job,completed:false})),...completed.map(job=>({job,completed:true}))];
    const groups=new Map(),undated=[];
    for(const entry of entries){entry.date=businessDate(entry.job,entry.completed);entry.rank=rank(entry.job);if(!entry.date){undated.push(entry);continue;}if(!groups.has(entry.date))groups.set(entry.date,[]);groups.get(entry.date).push(entry);}
    const dated=[];
    for(const [date,group] of [...groups].sort(([a],[b])=>cmp(a,b))){
      // A shared source sequence is trustworthy only for the entire day's
      // imported group. Otherwise preserve the existing materialized order.
      const imports=group.filter(({job})=>job.import_event_id||job.importProvenance?.import_event_id);
      let sourceOrders=null;
      for(const read of [job=>job.importProvenance?.sourceRowNumber??job.importProvenance?.source_row_number??job.importProvenance?.__sourceRowNumber,job=>job.importProvenance?.sourceSequence??job.importProvenance?.source_sequence,job=>{const match=/^CUTPDF-(\d{8})-(\d{3})$/.exec(String(job.import_event_id||job.importProvenance?.import_event_id||""));return match&&match[1]===date.replaceAll("-","")?match[2]:null;},job=>job.importProvenance?.cut_sequence]){
        const values=imports.map(({job})=>positive(read(job)));
        if(values.length&&values.every(Boolean)&&new Set(values).size===values.length){sourceOrders=new Map(imports.map((entry,index)=>[entry.job.id,values[index]]));break;}
      }
      for(const entry of group)entry.order=entry.rank??(entry.job.cutDateISO===date?positive(entry.job.cutOrderWithinDay):null)??Number.MAX_SAFE_INTEGER;
      group.sort((a,b)=>a.order-b.order||cmp(a.job.id,b.job.id));
      // Source row numbers and global cut ranks are different units. Reorder
      // imported peers within their existing slots instead of comparing a
      // worksheet row number directly with a native job's global cut number.
      if(sourceOrders){const sortedImports=imports.slice().sort((a,b)=>sourceOrders.get(a.job.id)-sourceOrders.get(b.job.id)||cmp(a.job.id,b.job.id));let index=0;for(let i=0;i<group.length;i++)if(sourceOrders.has(group[i].job.id))group[i]=sortedImports[index++];}
      dated.push(...group);
    }
    // Dateless records keep their numbered slots. Fill the remaining slots
    // chronologically without inventing a date or restructuring stored arrays.
    const reserved=new Set(undated.map(entry=>entry.rank).filter(Boolean));let next=1;
    for(const entry of dated){while(reserved.has(next))next++;entry.position=next++;}
    for(const entry of undated)entry.position=entry.rank??Number.MAX_SAFE_INTEGER;
    return [...dated,...undated].sort((a,b)=>a.position-b.position||cmp(a.job.id,b.job.id));
  }
  function historyJobs(completed=[]){
    const entries=orderedJobs([],completed),byId=new Map(entries.map((entry,index)=>[entry.job.id,index]));
    return completed.slice().sort((a,b)=>{
      const ad=businessDate(a,true),bd=businessDate(b,true);
      if(ad&&bd)return cmp(bd,ad)||byId.get(b.id)-byId.get(a.id);
      if(ad||bd)return ad?-1:1;
      return (rank(b)??0)-(rank(a)??0)||cmp(a.id,b.id);
    });
  }
  function categoryNumbers(active=[],completed=[]){
    const counts=new Map(),numbers=new Map();
    for(const {job} of orderedJobs(active,completed)){const key=String(job.cat||"jobs_root"),number=(counts.get(key)||0)+1;counts.set(key,number);numbers.set(job.id,number);}
    return numbers;
  }
  const EDIT_FIELDS=new Set(["name","estimateHours","startISO","dueISO","completedAtISO","material","materialCost","materialQty","chargeRate","costRate","notes","priority","cat","projectNumber","actualHours","efficiency"]);
  function prepareMutation(state,operation,{audit,buildCompletedJob,normalizePriorities,validateCategory}={}){
    const fail=error=>({ok:false,blocked:true,error,issues:[{code:"invalid_business_date_mutation"}]});
    if(!state||!Array.isArray(state.cuttingJobs)||!Array.isArray(state.completedCuttingJobs))return fail("Cutting-job state is unavailable.");
    const original=[...state.cuttingJobs,...state.completedCuttingJobs],ids=new Set();
    for(const job of original){if(!job||typeof job.id!=="string"||!job.id.trim()||ids.has(job.id))return fail("Unique stable cutting-job identities are required.");ids.add(job.id);}
    if(!operation||!["edit","complete","create"].includes(operation.type))return fail("Unsupported cutting-job operation.");
    const nextState=clone(state),jobs=[...nextState.cuttingJobs,...nextState.completedCuttingJobs];let target=jobs.find(job=>job.id===operation.id);
    if(operation.type==="create"){
      target=clone(operation.job);
      if(!target||typeof target.id!=="string"||!target.id.trim()||ids.has(target.id)||target.completedAtISO)return fail("The new job requires a unique stable identity.");
      nextState.cuttingJobs.push(target);
    }else if(!target)return fail("This cutting job no longer exists.");
    const wasCompleted=nextState.completedCuttingJobs.some(job=>job.id===target.id);
    if(operation.type==="edit"){
      if(!operation.updates||Object.keys(operation.updates).some(key=>!EDIT_FIELDS.has(key)))return fail("Unsupported job edit field.");
      Object.assign(target,clone(operation.updates));
      if(Object.hasOwn(operation.updates,"startISO")&&!chronology.validCutDate(target.startISO))return fail("Enter a valid Start Date.");
      if(Object.hasOwn(operation.updates,"completedAtISO")&&(!wasCompleted||!dateKey(target.completedAtISO)))return fail("Enter a valid Completion Date for a completed job.");
    }
    if(operation.type==="complete"){
      if(wasCompleted||!dateKey(operation.completedAtISO)||typeof buildCompletedJob!=="function")return fail("The active job and a valid completion date are required.");
      target=buildCompletedJob(target,operation.completedAtISO);
      nextState.cuttingJobs=nextState.cuttingJobs.filter(job=>job.id!==operation.id);nextState.completedCuttingJobs.push(target);
    }
    if(operation.type==="create"&&!chronology.validCutDate(target.startISO))return fail("Enter a valid Start Date.");
    if(validateCategory&&validateCategory(target,state)!==true)return fail("Project/category ownership changed. Choose a valid category.");
    if(normalizePriorities&&(operation.type!=="edit"||!wasCompleted))normalizePriorities(nextState.cuttingJobs,target.id);
    const beforeById=new Map(original.map(job=>[job.id,job]));
    const ordered=orderedJobs(nextState.cuttingJobs,nextState.completedCuttingJobs),unknownRanks=new Set();
    for(const entry of ordered.filter(entry=>!entry.date&&entry.rank)){if(unknownRanks.has(entry.rank))return fail("Dateless jobs share a stored cut number; correct the ambiguous records before saving.");unknownRanks.add(entry.rank);}
    // Synchronize old internal fields only on the explicitly edited job. Never
    // populate legacy dates during reads or materialize dates for other jobs.
    const targetDay=businessDate(target,wasCompleted||operation.type==="complete");
    if(targetDay&&Object.hasOwn(target,"cutDateISO")){
      target.cutDateISO=targetDay;
      target.cutOrderWithinDay=ordered.filter(entry=>entry.date===targetDay).findIndex(entry=>entry.job.id===target.id)+1;
    }
    const changed=[];
    for(const entry of ordered){if(!entry.date)continue;const label=`C${String(entry.position).padStart(3,"0")}`;if(entry.job.cutNumber!==label){changed.push({id:entry.job.id,from:entry.job.cutNumber??null,to:label});entry.job.cutNumber=label;}}
    if(!audit||typeof audit.operationId!=="string"||!audit.operationId.trim()||!audit.actorUid||!dateKey(audit.atISO))return fail("Cutting-job audit identity is unavailable.");
    const values=(job,completed)=>({date:businessDate(job,completed),startISO:job?.startISO??null,completedAtISO:job?.completedAtISO??null,cutNumber:job?.cutNumber??null});
    const allAfter=[...nextState.cuttingJobs,...nextState.completedCuttingJobs],beforeCompletedIds=new Set(state.completedCuttingJobs.map(job=>job.id)),afterCompletedIds=new Set(nextState.completedCuttingJobs.map(job=>job.id)),changedIds=new Set(changed.map(item=>item.id));
    for(const job of allAfter){
      const before=beforeById.get(job.id),beforeCompleted=beforeCompletedIds.has(job.id),afterCompleted=afterCompletedIds.has(job.id);
      if(job.id!==target.id&&!changedIds.has(job.id))continue;
      if(job.id===target.id&&before&&chronology.stateKey(before)===chronology.stateKey(job))continue;
      if(job.cutChronologyHistory!==undefined&&!Array.isArray(job.cutChronologyHistory))return fail("Invalid cutting-job audit history.");
      if((job.cutChronologyHistory||[]).some(entry=>entry?.operationId===audit.operationId))return fail("This cutting-job operation was already recorded.");
      job.cutChronologyHistory=[...(job.cutChronologyHistory||[]),{...clone(audit),jobId:job.id,kind:job.id===target.id?operation.type:"renumber",before:values(before,beforeCompleted),after:values(job,afterCompleted)}];
    }
    const snapshot=JSON.parse(JSON.stringify(nextState));
    return{ok:true,nextState:snapshot,hasChanges:chronology.businessKey(state)!==chronology.businessKey(snapshot),renumbering:{ok:true,changed,sequence:ordered.map(({job})=>({id:job.id,cutNumber:job.cutNumber??null}))},chronologyChanges:[]};
  }
  return Object.freeze({dateKey,businessDate,orderedJobs,historyJobs,categoryNumbers,prepareMutation});
});
