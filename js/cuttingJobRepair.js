(function(root,factory){
  "use strict";
  const api=factory(root?.CuttingJobHistory||(typeof require==="function"?require("./cuttingJobHistory.js"):null));
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.CuttingJobRepair=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(history){
  "use strict";
  const PROTECTED_KEYS=["purchases","inventory","inventoryFolders","inventoryMaterials","receiptTrackerWeeks","orderRequests","dailyCutHours","totalHistory","garnetCleanings","pumpEff","maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2","dashboardLayout","costLayout","jobLayout","deletedItems"];
  const clone=value=>typeof structuredClone==="function"?structuredClone(value):JSON.parse(JSON.stringify(value));
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),key=value=>String(value||"").trim().toLocaleLowerCase();
  const exact=(folders,name)=>folders.filter(folder=>key(folder?.name)===key(name));
  const fingerprint=value=>{const text=JSON.stringify(value),input=typeof text==="string"?text:"undefined";let hash=2166136261;for(let index=0;index<input.length;index++){hash^=input.charCodeAt(index);hash=Math.imul(hash,16777619);}return `fnv1a32:${(hash>>>0).toString(16).padStart(8,"0")}:${input.length}`;};
  const stateSnapshot=state=>({cuttingJobs:clone(state?.cuttingJobs||[]),completedCuttingJobs:clone(state?.completedCuttingJobs||[]),...Object.fromEntries(PROTECTED_KEYS.map(name=>[name,clone(state?.[name])]))});
  const fingerprints=(state,folders,baseline)=>({jobFolders:fingerprint(folders||[]),cuttingJobs:fingerprint(state?.cuttingJobs||[]),completedCuttingJobs:fingerprint(state?.completedCuttingJobs||[]),authoritativeBaseline:fingerprint(baseline),protectedBusinessCollections:fingerprint(Object.fromEntries(PROTECTED_KEYS.map(name=>[name,state?.[name]])))});

  function plan(state,folders){
    const nextFolders=clone(folders||[]),created=[],renamed=[],reused=[];
    if(!nextFolders.some(folder=>String(folder?.id)===history.ROOT_ID))nextFolders.unshift({id:history.ROOT_ID,name:"All Jobs",parent:null,order:1});
    for(const[project,name]of history.PROJECT_CATEGORIES){
      const matches=exact(nextFolders,name);if(matches.length>1)return{ok:false,error:`Duplicate canonical category ${name}.`};
      let folder=matches[0];
      if(!folder){const reversed=nextFolders.filter(item=>history.reversedProject(item?.name)===project);if(reversed.length>1)return{ok:false,error:`Ambiguous reversed category for ${project}.`};folder=reversed[0];if(folder){renamed.push({id:String(folder.id),from:folder.name,to:name});folder.name=name;}}
      if(!folder){let id=`job_project_${project.toLocaleLowerCase()}`,suffix=1;while(nextFolders.some(item=>String(item.id)===id))id=`job_project_${project.toLocaleLowerCase()}_${++suffix}`;folder={id,name,parent:history.ROOT_ID,order:nextFolders.length+1};nextFolders.push(folder);created.push(String(id));}else reused.push(String(folder.id));
      folder.parent=history.ROOT_ID;
    }
    const nextActive=clone(state?.cuttingJobs||[]),nextCompleted=clone(state?.completedCuttingJobs||[]),assignments=[];
    for(const job of [...nextActive,...nextCompleted]){const resolution=history.resolveProjectCategory(job.projectNumber,nextFolders);if(resolution.status!=="matched")return{ok:false,error:resolution.reason};const from=job.cat??null,to=String(resolution.folder.id);job.cat=to;assignments.push({id:String(job.id),projectNumber:String(job.projectNumber),from,to});}
    const resequence=history.resequence(nextActive,nextCompleted);
    return{ok:true,nextFolders,nextActive,nextCompleted,created,renamed,reused,assignments,resequence};
  }

  function audit(state,folders,{baseline}={}){
    const before=fingerprints(state,folders,baseline),snapshot=stateSnapshot(state),folderSnapshot=clone(folders||[]),baselineSnapshot=clone(baseline);
    const proposed=plan(snapshot,folderSnapshot),historyAudit=history.audit(snapshot,folderSnapshot),after=fingerprints(state,folders,baseline);
    return{...historyAudit,readOnly:true,stateMutationDetected:!same(before,after),saveAttempted:false,FirestoreWriteAttempted:false,localStorageWriteAttempted:false,fingerprints:{before,after,proposedBaseline:fingerprint(baselineSnapshot)},repairPlan:proposed.ok?{created:proposed.created,renamed:proposed.renamed,reused:proposed.reused,folders:proposed.nextFolders,assignments:proposed.assignments,cutNumbers:proposed.resequence.sequence,resequence:proposed.resequence}:null,blockingError:proposed.ok?"":proposed.error};
  }

  function createReadOnlyAuditRunner(env){return()=>audit(env.state(),env.categories(),{baseline:env.baseline?.()});}

  async function repair(env,{confirmed=false}={}){
    const result={backupCreated:false,saveAttempted:false,saveCompleted:false,saveIndeterminate:false,rollbackAttempted:false,rollbackVerified:false,error:"",auditBefore:null,createdCategoryIds:[],renamedCategories:[],assignments:[],resequence:null};
    if(!confirmed){result.error="Explicit repair confirmation required.";return result;}
    const runAudit=createReadOnlyAuditRunner(env);result.auditBefore=runAudit();
    if(result.auditBefore.blockingError||result.auditBefore.stateMutationDetected){result.error=result.auditBefore.blockingError||"Read-only audit fingerprint mismatch.";return result;}
    if(await env.revalidateBaseline()!==true){result.error="Latest authoritative cloud baseline revalidation failed.";return result;}
    const state=env.state(),before={active:clone(state.cuttingJobs||[]),completed:clone(state.completedCuttingJobs||[]),folders:clone(env.categories())};
    try{
      await env.backup();result.backupCreated=true;
      const proposed=plan(state,env.categories());if(!proposed.ok)throw new Error(`Post-backup plan revalidation failed: ${proposed.error}`);
      env.setCategories(proposed.nextFolders);state.cuttingJobs=proposed.nextActive;state.completedCuttingJobs=proposed.nextCompleted;
      result.createdCategoryIds=proposed.created;result.renamedCategories=proposed.renamed;result.assignments=proposed.assignments;result.resequence=proposed.resequence;result.saveAttempted=true;
      const saved=await env.saveCloudNow();result.saveCompleted=saved?.saved===true&&saved?.stateWriteCompleted===true;result.saveIndeterminate=!result.saveCompleted&&(saved?.indeterminate===true||(saved?.stateWriteAttempted===true&&saved?.stateWriteCompleted!==true));
      if(result.saveCompleted||result.saveIndeterminate){result.auditAfter=runAudit();return result;}throw new Error(saved?.error||"Authoritative save did not complete.");
    }catch(error){result.error=String(error?.message||error);if(!result.saveIndeterminate){result.rollbackAttempted=true;state.cuttingJobs=clone(before.active);state.completedCuttingJobs=clone(before.completed);env.setCategories(clone(before.folders));result.rollbackVerified=same(state.cuttingJobs,before.active)&&same(state.completedCuttingJobs,before.completed)&&same(env.categories(),before.folders);}return result;}
  }
  return Object.freeze({PROTECTED_KEYS,fingerprint,plan,audit,createReadOnlyAuditRunner,repair});
});
