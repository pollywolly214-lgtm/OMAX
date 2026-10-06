(function(root,factory){
  "use strict";
  const api=factory(root?.CuttingJobChronology||(typeof require==="function"?require("./cuttingJobChronology.js"):null));
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.CuttingJobHistory=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(chronology){
  "use strict";

  const ROOT_ID="jobs_root";
  const PROJECT_CATEGORIES=Object.freeze([
    ["0000","0000 Company Improvements"], ["XXXX","XXXX Undisclosed Project"],
    ["1178","1178 Comal"], ["1208","1208 Collin"], ["1237","1237 Kicaster"],
    ["1241","1241 Lady Bird"], ["1242","1242 Mesquite"], ["1247","1247 Brazos"], ["1248","1248 Kaufman"],
    ["1249","1249 AT&T"], ["1251","1251 ATM"], ["1254","1254 Blanco"],
    ["1261","1261 Fredericksburg Barricades"], ["ALAMO","ALAMO"]
  ]);
  const CATEGORY_BY_PROJECT=new Map(PROJECT_CATEGORIES);
  const clean=value=>String(value??"").trim().replace(/\s+/g," ");
  const nameKey=value=>clean(value).toLocaleLowerCase();
  const projectKey=value=>clean(value).toUpperCase();
  const normalizeProjectKey=value=>{const key=projectKey(value);return /^(?:\d{1,8}|ALAMO|XXXX)$/.test(key)?key:"";};
  const canonicalCategoryName=project=>CATEGORY_BY_PROJECT.get(projectKey(project))||"";
  const leadingProject=name=>{const match=/^(\d{1,8}|ALAMO|XXXX)(?:\s|$)/i.exec(clean(name));return match?projectKey(match[1]):"";};
  const reversedProject=name=>{const normalized=clean(name);for(const[project,canonical]of PROJECT_CATEGORIES){const suffix=canonical.slice(project.length).trim();if(suffix&&nameKey(normalized)===nameKey(`${suffix} ${project}`))return project;}return"";};

  const projectName=project=>{const canonical=canonicalCategoryName(project);return project==="ALAMO"?canonical:canonical.slice(String(project).length).trim();};
  function categoryName(value,project){
    const name=clean(value),leading=leadingProject(name),reversed=reversedProject(name);
    if(leading===project)return project==="ALAMO"?name:name.slice(project.length).trim();
    if(reversed===project)return name.slice(0,-project.length).trim();
    return name;
  }
  // One project key and one display name travel together throughout preview/save.
  // Known names validate pairs; they do not close the set of future projects.
  function normalizeProjectPair(project,category){
    let key=projectKey(project);const warnings=[];
    if(key==="0"&&["Company Improvements","0000 Company Improvements","Company Improvements 0000"].some(name=>nameKey(category)===nameKey(name))){
      key="0000";warnings.push('Excel project_number "0" recovered as "0000" for Company Improvements.');
    }
    const name=categoryName(category,key)||projectName(key),canonicalName=key==="ALAMO"?name:`${key} ${name}`.trim();
    const result={projectNumber:key,categoryName:name,canonicalName,warnings,status:"valid",reason:""};
    const reject=reason=>({...result,status:"conflict",reason});
    if(!normalizeProjectKey(key))return reject("project_number must be 1-8 digits, ALAMO, or XXXX and remains a string.");
    if(!name)return reject(`Project ${key} requires a nonblank category name.`);
    const sourceProject=leadingProject(category)||reversedProject(category);
    if(sourceProject&&sourceProject!==key)return reject(`Category "${clean(category)}" belongs to project ${sourceProject}, not ${key}.`);
    const known=projectName(key);
    if(known&&nameKey(name)!==nameKey(known))return reject(`Project ${key} requires category "${known}", not "${name}".`);
    const other=PROJECT_CATEGORIES.find(([number])=>number!==key&&nameKey(projectName(number))===nameKey(name));
    if(other)return reject(`Category "${name}" belongs to confirmed project ${other[0]}, not ${key}.`);
    return{...result,categoryName:known||name,canonicalName:canonicalCategoryName(key)||canonicalName};
  }
  function categoryOwnershipDiagnostics(folders,jobs=[]){
    const diagnostics=[];
    for(const folder of Array.isArray(folders)?folders:[]){
      if(!folder||String(folder.id)===ROOT_ID)continue;
      const prefix=leadingProject(folder.name),metadata=projectKey(folder.projectNumber);
      if(!prefix||nameKey(folder.name)==="0000 undisclosed project")continue;
      const display=categoryName(folder.name,prefix),inferred=PROJECT_CATEGORIES.find(([number])=>nameKey(projectName(number))===nameKey(display));
      if(!inferred||inferred[0]===prefix)continue;
      const linked=jobs.filter(job=>String(job?.cat||"")===String(folder.id)),linkedProjects=[...new Set(linked.map(job=>projectKey(job.projectNumber)))].sort();
      const retired1111=prefix==="1111"&&inferred[0]==="0000",unused=retired1111&&!metadata&&linked.length===0;
      const conflicting=new Set([prefix,metadata,...linkedProjects].filter(Boolean)).size>1;
      const label=unused?"Unused legacy 1111 Company Improvements folder":retired1111?"Legacy 1111 Company Improvements folder requires review":"Project-prefixed category has a conflicting canonical display name";
      diagnostics.push({id:String(folder.id||""),name:clean(folder.name),projectNumber:prefix,inferredProjectNumber:inferred[0],status:unused?"unused-legacy":conflicting?"ownership-conflict":"legacy-review",linkedJobCount:linked.length,linkedProjectNumbers:linkedProjects,projectNumberMetadata:metadata||null,cleanupPlanned:false,message:label+" ("+String(folder.id||"missing ID")+", "+linked.length+" linked jobs); preserved without rename, reuse, or deletion."});
    }
    return diagnostics;
  }
  function resolveProjectCategory(project,folders,category,jobs=[]){
    const pair=normalizeProjectPair(project,category),key=pair.projectNumber;
    const base={...pair,folder:null};
    if(pair.status!=="valid")return{...base,status:"conflict"};
    const matches=[],list=(Array.isArray(folders)?folders:[]).filter(folder=>folder&&String(folder.id)!==ROOT_ID);
    for(const folder of list){
      const leading=leadingProject(folder.name),reversed=reversedProject(folder.name),metadata=projectKey(folder.projectNumber);
      const folderName=categoryName(folder.name,leading||reversed||metadata||key);
      const linked=jobs.filter(job=>String(job?.cat||"")===String(folder.id));
      // Only this documented obsolete spelling overrides weak display-name inference.
      // Explicit metadata and every linked job must still agree with the project.
      const obsolete0000=nameKey(folder.name)==="0000 undisclosed project";
      const known=obsolete0000?null:PROJECT_CATEGORIES.find(([number])=>nameKey(projectName(number))===nameKey(folderName));
      const strong=new Set([metadata,leading,reversed,...linked.map(job=>projectKey(job.projectNumber))].filter(Boolean));
      const claims=new Set([...strong,known?.[0]].filter(Boolean));
      const sameName=!obsolete0000&&nameKey(folderName)===nameKey(pair.categoryName);
      // An explicit prefix owns its folder. A conflicting canonical display name
      // is a review issue for that folder, not proof of another project's ownership.
      // Metadata or linked jobs naming the requested key still make it a real conflict.
      if(leading&&leading!==key&&known?.[0]===key&&!strong.has(key))continue;
      if(!claims.has(key)&&!sameName)continue;
      if(claims.size>1||[...claims].some(number=>number!==key))return{...base,status:"conflict",reason:`Category "${folder.name}" has conflicting project ownership (${[...claims].join(", ")}); project ${key} requires review.`};
      if(!clean(folder.id))return{...base,status:"conflict",reason:"Category has no stable folder ID; review required."};
      const rename=!sameName||reversed===key;
      if(rename&&(!strong.has(key)||linked.some(job=>projectKey(job.projectNumber)!==key)))return{...base,status:"conflict",reason:`Ownership of legacy category "${folder.name}" is incomplete; project ${key} requires review.`};
      matches.push({folder,rename});
    }
    if(matches.length>1)return{...base,status:"ambiguous",reason:`Project category ${key} is ambiguous: ${matches.map(item=>item.folder.id).join(", ")}.`};
    if(matches.length===1){
      const {folder,rename}=matches[0];
      if(list.filter(item=>String(item.id)===String(folder.id)).length!==1)return{...base,status:"ambiguous",reason:`Project ${key} has a duplicate category folder ID; review required.`};
      return{...base,status:rename?"rename":"matched",folder,reversed:reversedProject(folder.name)===key,rename:rename?{id:String(folder.id),from:folder.name,to:pair.canonicalName}:null};
    }
    return{...base,status:"missing",reason:`Category ${pair.canonicalName} will be created.`};
  }

  // Invert only ownership evidence already understood by CJI, then round-trip
  // through its forward resolver. A supplied project is never proof of ownership.
  function resolveCategoryProject(categoryId,folders,jobs=[]){
    const cat=String(categoryId??""),list=Array.isArray(folders)?folders:[];
    const review=reason=>({ok:false,status:"review",cat,reason:`Category needs project-number review. ${reason}`});
    const selected=list.filter(folder=>folder&&String(folder.id)===cat);
    if(!cat||cat===ROOT_ID||selected.length!==1)return review("Select one existing project category with a unique folder ID.");
    const folder=selected[0],linked=jobs.filter(job=>String(job?.cat??"")===cat);
    const claims=new Set([projectKey(folder.projectNumber),leadingProject(folder.name),reversedProject(folder.name),...linked.map(job=>projectKey(job.projectNumber))].filter(Boolean));
    // Bare confirmed names are supported by CJI. Future bare names are not keys.
    if(!claims.size)for(const [key]of PROJECT_CATEGORIES){if(nameKey(folder.name)===nameKey(projectName(key)))claims.add(key);}
    if(claims.size!==1)return review("Project ownership is missing or conflicting.");
    const key=[...claims][0];
    if(!normalizeProjectKey(key))return review("Project ownership contains an unsupported project key.");
    const resolved=resolveProjectCategory(key,list,canonicalCategoryName(key)||categoryName(folder.name,key),jobs);
    if(!["matched","rename"].includes(resolved.status)||String(resolved.folder?.id)!==cat)return review(resolved.reason||"Project ownership is ambiguous.");
    // A rename candidate proves ownership; this helper never executes its rename.
    return{ok:true,status:"resolved",cat,projectNumber:key,folder,reason:""};
  }
  function validateManualProjectCategory(cat,project,folders,jobs=[],original=null){
    if(original&&String(cat??"")===String(original.cat??"")&&(project===undefined||String(project??"")===String(original.projectNumber??""))){
      return{ok:true,unchanged:true}; // Preserve values, types and absent properties exactly.
    }
    const evidence=original?jobs.filter(job=>job!==original):jobs;
    const resolved=resolveCategoryProject(cat,folders,evidence);
    if(!resolved.ok)return resolved;
    if(project!==undefined&&normalizeProjectKey(project)!==resolved.projectNumber)return{ok:false,reason:`Selected category requires project ${resolved.projectNumber}. Project Number and Category must agree.`};
    return resolved;
  }
  function validateNewProjectCategory(project,name,folders,jobs=[]){
    const pair=normalizeProjectPair(project,name);
    if(pair.status!=="valid")return{ok:false,reason:pair.reason};
    const resolved=resolveProjectCategory(pair.projectNumber,folders,name,jobs);
    if(resolved.status!=="missing")return{ok:false,reason:resolved.reason||"This project already has a category. Select the existing category instead."};
    return{ok:true,projectNumber:pair.projectNumber,name:pair.canonicalName};
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
  const explicitChronologyPresent=(active,completed)=>[...(active||[]),...(completed||[])].some(job=>job&&["cutDateISO","cutOrderWithinDay"].some(field=>Object.prototype.hasOwnProperty.call(job,field)));
  function orderedJobs(active,completed){
    // Established legacy workflows keep their old numbering policy. Once actual
    // chronology is explicitly established, only the canonical model may order
    // the domain; unresolved legacy members remain read-only until reviewed.
    if(explicitChronologyPresent(active,completed)){
      if(chronology)return chronology.readChronology(active,completed).entries;
      return [...(active||[]).map(job=>({job,completed:false})),...(completed||[]).map(job=>({job,completed:true}))];
    }
    const entries=[...(Array.isArray(active)?active:[]).map(job=>({job,completed:false})),...(Array.isArray(completed)?completed:[]).map(job=>({job,completed:true}))];
    const completeForAll=(items,read,{unique=false}={})=>{const values=items.map(read);return items.length&&values.every(Number.isFinite)&&(!unique||new Set(values).size===values.length)?values:null;};
    const groups=new Map();for(const entry of entries){entry.date=historicalDate(entry.job,entry.completed);if(!groups.has(entry.date))groups.set(entry.date,[]);groups.get(entry.date).push(entry);}
    for(const[date,group]of groups){const imports=group.filter(entry=>imported(entry.job));let values=completeForAll(imports,entry=>sourceRow(entry.job));if(!values)values=completeForAll(imports,entry=>sourceSequence(entry.job));if(!values)values=completeForAll(imports,entry=>cutPdfOrdinal(entry.job,date),{unique:true});if(!values)values=completeForAll(imports,entry=>legacyCutSequence(entry.job));imports.forEach((entry,index)=>{entry.sameDayOrder=values?values[index]:Number.MAX_SAFE_INTEGER;});group.filter(entry=>!imported(entry.job)).forEach(entry=>{entry.sameDayOrder=currentSequence(entry.job)??Number.MAX_SAFE_INTEGER;});}
    return entries.sort((a,b)=>a.date.localeCompare(b.date)||a.sameDayOrder-b.sameDayOrder||String(a.job?.id||"").localeCompare(String(b.job?.id||"")));
  }
  function planResequence(active,completed){if(explicitChronologyPresent(active,completed)){if(chronology)return chronology.planRenumbering(active,completed);return{blocked:true,issues:[{code:"chronology_unavailable"}],changed:[],sequence:[]};}const ordered=orderedJobs(active,completed),sequence=ordered.map(({job},index)=>({id:String(job.id),from:job.cutNumber??null,cutNumber:`C${String(index+1).padStart(3,"0")}`}));return{total:sequence.length,changed:sequence.filter(item=>item.from!==item.cutNumber).map(item=>({id:item.id,from:item.from,to:item.cutNumber})),sequence:sequence.map(({id,cutNumber})=>({id,cutNumber}))};}
  const isResequenceBlocked=result=>!result||result.blocked===true||result.requiresReview===true||result.requiresCoordinator===true||result.ok===false||result.invalid===true||result.unavailable===true;
  function planDirectResequence(active,completed){
    const proposal=planResequence(active,completed);
    if(explicitChronologyPresent(active,completed))return{...proposal,ok:false,blocked:true,requiresReview:proposal.requiresReview===true||proposal.blocked===true,requiresCoordinator:true,error:proposal.blocked?"Chronology review required before cutting-job numbers can be recalculated.":"Canonical cutting-job numbering requires the chronology coordinator."};
    return proposal;
  }
  function resequence(active,completed){const proposal=planDirectResequence(active,completed);if(isResequenceBlocked(proposal))return proposal;const byId=new Map(proposal.sequence.map(item=>[item.id,item.cutNumber]));for(const job of [...(active||[]),...(completed||[])])if(byId.has(String(job?.id)))job.cutNumber=byId.get(String(job.id));return proposal;}
  function audit(state,folders){const numberingPlan=planDirectResequence(state?.cuttingJobs,state?.completedCuttingJobs),numberingBlocked=isResequenceBlocked(numberingPlan);const jobs=[...(state?.cuttingJobs||[]),...(state?.completedCuttingJobs||[])],assignments=jobs.map(job=>{const resolution=resolveProjectCategory(job?.projectNumber,folders,undefined,jobs);return{id:String(job?.id||""),projectNumber:projectKey(job?.projectNumber),currentCategoryId:String(job?.cat||""),targetCategoryId:resolution.folder?String(resolution.folder.id):null,status:resolution.status,rename:resolution.rename,missingCategory:resolution.status==="missing"?resolution.canonicalName:null};});return{readOnly:true,categoryOwnershipDiagnostics:categoryOwnershipDiagnostics(folders,jobs),legacy1111:{message:"Historical 1111 requires review; no automatic mapping or migration.",jobIds:jobs.filter(job=>projectKey(job.projectNumber)==="1111").map(job=>String(job.id)),folderIds:(folders||[]).filter(folder=>projectKey(folder.projectNumber)==="1111"||leadingProject(folder.name)==="1111"||jobs.some(job=>projectKey(job.projectNumber)==="1111"&&String(job.cat)===String(folder.id))).map(folder=>String(folder.id))},jobCount:jobs.length,expectedCategoryNames:PROJECT_CATEGORIES.map(x=>x[1]),assignments,unresolved:assignments.filter(x=>!["matched","rename"].includes(x.status)),numberingBlocked,numbering:orderedJobs(state?.cuttingJobs,state?.completedCuttingJobs).map(({job},index)=>({id:String(job.id),current:job.cutNumber??null,expected:numberingBlocked?null:`C${String(index+1).padStart(3,"0")}`}))};}
  return Object.freeze({ROOT_ID,PROJECT_CATEGORIES,normalizeProjectKey,canonicalCategoryName,leadingProject,reversedProject,normalizeProjectPair,categoryOwnershipDiagnostics,resolveProjectCategory,resolveCategoryProject,validateManualProjectCategory,validateNewProjectCategory,orderedJobs,planResequence,planDirectResequence,isResequenceBlocked,resequence,audit});
});
