(function(root,factory){
  "use strict";
  const api=factory(root?.CuttingJobChronology||(typeof require==="function"?require("./cuttingJobChronology"):null));
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.CuttingJobChronologyReview=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(model){
  "use strict";
  const clone=value=>structuredClone(value);
  const all=state=>[...state.cuttingJobs,...state.completedCuttingJobs];
  const valid=job=>model.validCutDate(job?.cutDateISO)&&model.validDayOrder(job?.cutOrderWithinDay);
  const blocked=error=>({ok:false,blocked:true,error});
  const compare=(a,b)=>a.cutOrderWithinDay-b.cutOrderWithinDay||(a.id<b.id?-1:a.id>b.id?1:0);
  function createSession(source,targetId){
    if(!source||!Array.isArray(source.cuttingJobs)||!Array.isArray(source.completedCuttingJobs))return blocked("Cutting-job arrays require review.");
    const identities=model.readChronology(source.cuttingJobs,source.completedCuttingJobs).issues.filter(issue=>issue.code!=="chronology_review_required");
    if(identities.length)return{...blocked("Missing or duplicate job identity requires review before chronology can be edited."),issues:identities};
    const baseline=clone(source),jobs=all(baseline),drafts=new Map();let generation=0,cancelled=false;
    if(!jobs.some(job=>job.id===targetId))return blocked("Cutting job no longer exists.");
    const current=()=>jobs.map(job=>({...clone(job),...(drafts.get(job.id)||{})}));
    const snapshot=()=>{const state=clone(baseline);for(const job of all(state))Object.assign(job,drafts.get(job.id)||{});return state;};
    const status=()=>{const state=snapshot(),unresolved=all(state).filter(job=>!valid(job));return{...model.chronologyReadiness(state.cuttingJobs,state.completedCuttingJobs),unresolvedCount:unresolved.length,unresolvedIds:unresolved.map(job=>job.id)};};
    const sameDay=(id,date)=>current().filter(job=>job.id!==id&&valid(job)&&job.cutDateISO===date).sort(compare);
    function apply(id,date,placement){
      if(cancelled)return blocked("Review was cancelled.");
      const job=current().find(job=>job.id===id);if(!job)return blocked("Cutting job no longer exists.");
      if(!model.validCutDate(date))return blocked("Enter a valid actual cut date.");
      const peers=sameDay(id,date);let index;
      if(placement==="keep"){
        if(!valid(job)||job.cutDateISO!==date)return blocked("Choose where this cut belongs on the selected date.");
        return{ok:true,status:status()};
      }
      if(placement==="first")index=0;
      else if(placement==="last")index=peers.length;
      else if(placement&&["before","after"].includes(placement.type)){
        index=peers.findIndex(peer=>peer.id===placement.id);if(index<0)return blocked("Same-day placement changed; choose again.");
        if(placement.type==="after")index++;
      }else return blocked("Choose where this cut belongs on the selected date.");
      const ordered=peers.slice();ordered.splice(index,0,job);
      ordered.forEach((entry,position)=>{
        const change={id:entry.id,cutDateISO:date,cutOrderWithinDay:position+1},original=jobs.find(item=>item.id===entry.id);
        if(original.cutDateISO===change.cutDateISO&&original.cutOrderWithinDay===change.cutOrderWithinDay)drafts.delete(entry.id);else drafts.set(entry.id,change);
      });generation++;return{ok:true,status:status()};
    }
    return Object.freeze({ok:true,targetId,baseline:()=>clone(baseline),jobs:current,sameDay,status,apply,changes:()=>clone([...drafts.values()]),version:()=>generation,isCancelled:()=>cancelled,cancel:()=>{cancelled=true;drafts.clear();generation++;}});
  }
  function createWorkflow(env){
    const previews=new WeakMap();let committing=false;
    const version=()=>model.stateKey(env.version());
    function begin(id){
      if(!env.canWrite())return blocked("Save pending changes or resolve the current write block before reviewing chronology.");
      const source=env.state();if(!Number.isSafeInteger(source?.syncMeta?.rev)||source.syncMeta.rev<0)return blocked("Reload authoritative state before reviewing chronology.");
      return createSession(source,id);
    }
    function preview(session){
      if(!session?.ok||session.isCancelled())return blocked("Review is no longer active.");
      const baseline=session.baseline();
      if(!env.canWrite()||model.stateKey(env.state())!==model.stateKey(baseline))return blocked("Data changed. Reload and review again.");
      const status=session.status();if(!status.eligible)return{...blocked(`${status.unresolvedCount} cutting jobs still require actual chronology review. No changes have been saved.`),requiresReview:true,remaining:status.unresolvedCount,issues:status.issues};
      const changes=session.changes(),audit=clone(env.audit()),prepared=model.prepareChronologyMutation(baseline,changes,{audit});
      if(!prepared.ok){const historyIssue=prepared.issues?.some(issue=>["invalid_chronology_history","duplicate_chronology_operation"].includes(issue.code));return{...blocked(historyIssue?"Stored chronology history requires review. No changes were saved.":"Chronology could not be prepared; review the supplied values."),issues:prepared.issues};}
      const before=new Map(all(baseline).map(job=>[job.id,job])),after=new Map(all(prepared.nextState).map(job=>[job.id,job]));
      const ids=new Set([...prepared.chronologyChanges.map(item=>item.id),...prepared.renumbering.changed.map(item=>item.id)]);
      const details=[...ids].map(id=>({id,name:before.get(id).name||"Cutting job",before:{date:before.get(id).cutDateISO??null,order:before.get(id).cutOrderWithinDay??null,label:model.readCutLabel(before.get(id))},after:{date:after.get(id).cutDateISO,order:after.get(id).cutOrderWithinDay,label:model.readCutLabel(after.get(id))}}));
      const target=details.find(item=>item.id===session.targetId)||null;
      const token=Object.freeze({});previews.set(token,{session,sessionVersion:session.version(),localVersion:version(),changes,audit,expectedRevision:baseline.syncMeta.rev,expectedSourceKey:model.stateKey(baseline),expectedPreparedKey:model.businessKey(prepared.nextState)});
      return{ok:true,token,noOp:!prepared.hasChanges,details:target?[target,...details.filter(item=>item.id!==target.id)]:details,renumbering:clone(prepared.renumbering),target};
    }
    async function confirm(token,{confirmed=false}={}){
      const record=previews.get(token);
      if(!confirmed)return blocked("Explicit confirmation of the preview is required.");
      if(!record||record.session.isCancelled())return blocked("Preview is no longer active; review again.");
      if(committing)return blocked("A chronology save is already in progress.");
      if(!env.canWrite()||record.session.version()!==record.sessionVersion||version()!==record.localVersion||model.stateKey(env.state())!==record.expectedSourceKey){previews.delete(token);return blocked("Data or review changed after preview. Reload and review again.");}
      previews.delete(token);committing=true;
      try{return await env.coordinator.save(clone(record.changes),{expectedRevision:record.expectedRevision,expectedSourceKey:record.expectedSourceKey,expectedPreparedKey:record.expectedPreparedKey,audit:clone(record.audit)});}
      catch(error){const result={saved:false,verified:false,indeterminate:true,requiresReload:true,error:String(error?.message||error)};env.suspend?.(result);return result;}
      finally{committing=false;}
    }
    return Object.freeze({begin,preview,confirm,cancel:session=>session?.cancel(),isBusy:()=>committing});
  }
  return Object.freeze({createSession,createWorkflow});
});
