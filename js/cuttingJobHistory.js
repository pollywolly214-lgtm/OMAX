(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.CuttingJobHistory=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const ROOT_ID="jobs_root";
  const PROJECT_CATEGORIES=Object.freeze([
    ["0000","0000 Undisclosed Project"], ["1111","1111 Company Improvements"],
    ["1178","1178 Comal"], ["1208","1208 Collin"], ["1237","1237 Kicaster"],
    ["1241","1241 Lady Bird"], ["1247","1247 Brazos"], ["1248","1248 Kaufman"],
    ["1249","1249 AT&T"], ["1251","1251 ATM"], ["1254","1254 Blanco"],
    ["1261","1261 Fredericksburg Barricades"], ["ALAMO","ALAMO"]
  ]);
  const CATEGORY_BY_PROJECT=new Map(PROJECT_CATEGORIES);
  const clean=value=>String(value??"").trim().replace(/\s+/g," ");
  const nameKey=value=>clean(value).toLocaleLowerCase();
  const projectKey=value=>clean(value).toUpperCase();
  const canonicalCategoryName=project=>CATEGORY_BY_PROJECT.get(projectKey(project))||"";
  const leadingProject=name=>{const match=/^(0000|1111|1178|1208|1237|1241|1247|1248|1249|1251|1254|1261|ALAMO)(?:\s|$)/i.exec(clean(name));return match?projectKey(match[1]):"";};
  const reversedProject=name=>{const normalized=clean(name);for(const[project,canonical]of PROJECT_CATEGORIES){const suffix=canonical.slice(project.length).trim();if(suffix&&nameKey(normalized)===nameKey(`${suffix} ${project}`))return project;}return"";};

  function resolveProjectCategory(project,folders){
    const key=projectKey(project),canonical=canonicalCategoryName(key);
    if(!canonical)return{status:"missing",projectNumber:key,canonicalName:"",folder:null,reason:`Missing configured project category for ${key||"(blank)"}.`};
    const list=(Array.isArray(folders)?folders:[]).filter(folder=>folder&&String(folder.id)!==ROOT_ID);
    const canonicalMatches=list.filter(folder=>nameKey(folder.name)===nameKey(canonical));
    const leadingMatches=list.filter(folder=>leadingProject(folder.name)===key);
    const reversedMatches=list.filter(folder=>reversedProject(folder.name)===key);
    const matches=Array.from(new Map([...canonicalMatches,...leadingMatches,...reversedMatches].map(folder=>[String(folder.id),folder])).values());
    if(matches.length===1)return{status:"matched",projectNumber:key,canonicalName:canonical,folder:matches[0],reversed:reversedMatches.includes(matches[0])};
    return{status:matches.length?"ambiguous":"missing",projectNumber:key,canonicalName:canonical,folder:null,reason:matches.length?`Project category ${key} is ambiguous.`:`Missing project category ${canonical}.`};
  }

  // Same-day imported groups use their original worksheet row, explicit source
  // sequence, or a validated CUTPDF date/ordinal (in that order). Import/run
  // timestamps are deliberately ignored. Non-imported jobs retain cutNumber order.
  const positiveInteger=value=>{const text=String(value??"").trim();if(!/^\d+$/.test(text))return null;const number=Number(text);return Number.isSafeInteger(number)&&number>0?number:null;};
  const imported=job=>Boolean(String(job?.import_event_id||job?.importProvenance?.import_event_id||"").trim());
  const sourceRow=job=>positiveInteger(job?.importProvenance?.sourceRowNumber??job?.importProvenance?.source_row_number??job?.importProvenance?.__sourceRowNumber);
  const sourceSequence=job=>positiveInteger(job?.importProvenance?.sourceSequence??job?.importProvenance?.source_sequence);
  const legacyCutSequence=job=>positiveInteger(job?.importProvenance?.cut_sequence);
  const currentSequence=job=>positiveInteger(String(job?.cutNumber??"").replace(/^C/i,""));
  const cutPdfOrdinal=(job,date)=>{const eventId=String(job?.import_event_id||job?.importProvenance?.import_event_id||"").trim(),match=/^CUTPDF-(\d{8})-(\d{3})$/.exec(eventId);if(!match||match[1]!==String(date).replaceAll("-",""))return null;return positiveInteger(match[2]);};
  const historicalDate=(job,completed)=>clean(completed?job?.completedAtISO:job?.startISO).slice(0,10)||"9999-12-31";
  function orderedJobs(active,completed){
    const entries=[...(Array.isArray(active)?active:[]).map(job=>({job,completed:false})),...(Array.isArray(completed)?completed:[]).map(job=>({job,completed:true}))];
    const completeForAll=(items,read,{unique=false}={})=>{const values=items.map(read);return items.length&&values.every(Number.isFinite)&&(!unique||new Set(values).size===values.length)?values:null;};
    const groups=new Map();for(const entry of entries){entry.date=historicalDate(entry.job,entry.completed);if(!groups.has(entry.date))groups.set(entry.date,[]);groups.get(entry.date).push(entry);}
    for(const[date,group]of groups){const imports=group.filter(entry=>imported(entry.job));let values=completeForAll(imports,entry=>sourceRow(entry.job));if(!values)values=completeForAll(imports,entry=>sourceSequence(entry.job));if(!values)values=completeForAll(imports,entry=>cutPdfOrdinal(entry.job,date),{unique:true});if(!values)values=completeForAll(imports,entry=>legacyCutSequence(entry.job));imports.forEach((entry,index)=>{entry.sameDayOrder=values?values[index]:Number.MAX_SAFE_INTEGER;});group.filter(entry=>!imported(entry.job)).forEach(entry=>{entry.sameDayOrder=currentSequence(entry.job)??Number.MAX_SAFE_INTEGER;});}
    return entries.sort((a,b)=>a.date.localeCompare(b.date)||a.sameDayOrder-b.sameDayOrder||String(a.job?.id||"").localeCompare(String(b.job?.id||"")));
  }
  function planResequence(active,completed){const ordered=orderedJobs(active,completed),sequence=ordered.map(({job},index)=>({id:String(job.id),from:job.cutNumber??null,cutNumber:`C${String(index+1).padStart(3,"0")}`}));return{total:sequence.length,changed:sequence.filter(item=>item.from!==item.cutNumber).map(item=>({id:item.id,from:item.from,to:item.cutNumber})),sequence:sequence.map(({id,cutNumber})=>({id,cutNumber}))};}
  function resequence(active,completed){const proposal=planResequence(active,completed),byId=new Map(proposal.sequence.map(item=>[item.id,item.cutNumber]));for(const job of [...(active||[]),...(completed||[])])if(byId.has(String(job?.id)))job.cutNumber=byId.get(String(job.id));return proposal;}
  function audit(state,folders){const jobs=[...(state?.cuttingJobs||[]),...(state?.completedCuttingJobs||[])],assignments=jobs.map(job=>{const resolution=resolveProjectCategory(job?.projectNumber,folders);return{id:String(job?.id||""),projectNumber:projectKey(job?.projectNumber),currentCategoryId:String(job?.cat||""),targetCategoryId:resolution.folder?String(resolution.folder.id):null,status:resolution.status,missingCategory:resolution.status==="missing"?resolution.canonicalName:null};});return{readOnly:true,jobCount:jobs.length,expectedCategoryNames:PROJECT_CATEGORIES.map(x=>x[1]),assignments,unresolved:assignments.filter(x=>x.status!=="matched"),numbering:orderedJobs(state?.cuttingJobs,state?.completedCuttingJobs).map(({job},index)=>({id:String(job.id),current:job.cutNumber??null,expected:`C${String(index+1).padStart(3,"0")}`}))};}
  return Object.freeze({ROOT_ID,PROJECT_CATEGORIES,canonicalCategoryName,leadingProject,reversedProject,resolveProjectCategory,orderedJobs,planResequence,resequence,audit});
});
