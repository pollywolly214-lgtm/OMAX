(function(root,factory){
  "use strict";
  const history=root?.CuttingJobHistory||(typeof require==="function"?require("./cuttingJobHistory.js"):null);
  const api=factory(history);
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.CuttingJobCategoryEdit=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(history){
  "use strict";

  const ROOT_ID="jobs_root";
  const clean=value=>String(value??"").trim().replace(/\s+/g," ");
  const project=value=>history?.normalizeProjectKey?.(value)||"";
  const same=(a,b)=>String(a??"")===String(b??"");
  const fail=reason=>({ok:false,reason});
  const linkedTo=(job,id)=>same(job?.cat,id);
  const folderKey=folder=>project(folder?.projectNumber)||history?.leadingProject?.(folder?.name)||history?.reversedProject?.(folder?.name)||"";
  const categoryName=(folder,key)=>{
    const name=clean(folder?.name),leading=history?.leadingProject?.(name);
    return leading===key&&key?clean(name.slice(key.length)):name;
  };
  const colorKey=value=>{
    if(value==null||value==="")return null;
    return /^#[0-9a-f]{6}$/i.test(String(value))?String(value).toUpperCase():"";
  };

  // Pure, non-mutating plan. Source arrays/records not affected by the edit retain
  // their identities and values. There is no matching by a job's display name.
  function plan(source,request){
    if(!history||!source||!Array.isArray(source.jobFolders)||!Array.isArray(source.cuttingJobs)||!Array.isArray(source.completedCuttingJobs))
      return fail("Cutting-job and category source data is unavailable.");
    const id=String(request?.categoryId??"");
    if(!id||id===ROOT_ID)return fail("Select a non-root category to edit.");
    const matches=source.jobFolders.filter(folder=>same(folder?.id,id));
    if(matches.length!==1)return fail("The category ID is missing or duplicated; review before editing.");
    const folder=matches[0];
    const newProject=project(request?.projectNumber);
    if(!newProject)return fail("Project Number must be 1–8 digits, ALAMO, or XXXX.");
    let suffix=clean(request?.name);
    if(!suffix||suffix.length>120)return fail("Enter a category name of 1–120 characters.");
    const enteredPrefix=history.leadingProject(suffix);
    if(enteredPrefix&&enteredPrefix!==newProject)return fail("The name starts with another Project Number.");
    if(enteredPrefix===newProject)suffix=clean(suffix.slice(newProject.length));
    if(!suffix&&newProject!=="ALAMO")return fail("Enter a category name after the Project Number.");
    if(!suffix)suffix=newProject;
    const name=newProject==="ALAMO"&&suffix==="ALAMO"?"ALAMO":newProject+" "+suffix;
    const requestedColor=Object.prototype.hasOwnProperty.call(request||{},"color");
    const normalizedColor=requestedColor?colorKey(request.color):undefined;
    if(normalizedColor==="")return fail("Invalid category color.");

    const active=source.cuttingJobs.filter(job=>linkedTo(job,id));
    const completed=source.completedCuttingJobs.filter(job=>linkedTo(job,id));
    const oldMeta=project(folder.projectNumber),oldPrefix=history.leadingProject(folder.name);
    if(oldMeta&&oldPrefix&&oldMeta!==oldPrefix)return fail("This category already has conflicting name/Project Number metadata. Review ownership first.");
    const oldProject=oldMeta||oldPrefix||folderKey(folder);
    if(!oldProject)return fail("This category's existing Project Number cannot be verified. Review ownership first.");

    // A Project Number cannot be claimed by any other folder or unlinked job.
    // Treat legacy names/linked records as claims, not as permission to repurpose them.
    for(const other of source.jobFolders){
      if(!other||same(other.id,id)||same(other.id,ROOT_ID))continue;
      const claims=[other.projectNumber,history.leadingProject(other.name),history.reversedProject(other.name)]
        .map(value=>project(value)).filter(Boolean);
      if(claims.includes(newProject))return fail("Project "+newProject+" is already claimed by category "+clean(other.name)+".");
      if(clean(other.name).toLowerCase()===name.toLowerCase())return fail("Another category already uses this name.");
    }
    for(const job of [...source.cuttingJobs,...source.completedCuttingJobs]){
      if(!job||linkedTo(job,id))continue;
      if(project(job.projectNumber)===newProject)return fail("Project "+newProject+" is claimed by a job outside this category. Correct its ownership first.");
    }

    const beforeColor=colorKey(folder.color);
    const nextColor=requestedColor?normalizedColor:beforeColor;
    const jobsNeedUpdate=[...active,...completed].some(job=>!same(job.projectNumber,newProject));
    const folderChanged=!same(folder.name,name)||!same(folder.projectNumber,newProject)||nextColor!==beforeColor;
    const summary={
      categoryId:id,oldProjectNumber:oldProject,oldName:categoryName(folder,oldProject),
      oldFullName:String(folder.name??""),newProjectNumber:newProject,newName:suffix,newFullName:name,
      activeCount:active.length,completedCount:completed.length,totalCount:active.length+completed.length,
      colorChanged:nextColor!==beforeColor,changed:folderChanged||jobsNeedUpdate
    };
    if(!summary.changed)return {ok:true,next:source,summary};
    const nextFolders=source.jobFolders.map(row=>{
      if(!same(row?.id,id))return row;
      const updated={...row,name,projectNumber:newProject};
      if(requestedColor){if(nextColor)updated.color=nextColor;else delete updated.color;}
      return updated;
    });
    const editJobs=jobs=>jobs.map(job=>linkedTo(job,id)?{...job,projectNumber:newProject}:job);
    return {ok:true,summary,next:{
      ...source,jobFolders:nextFolders,cuttingJobs:editJobs(source.cuttingJobs),
      completedCuttingJobs:editJobs(source.completedCuttingJobs)
    }};
  }

  return Object.freeze({plan,categoryName,folderKey});
});
