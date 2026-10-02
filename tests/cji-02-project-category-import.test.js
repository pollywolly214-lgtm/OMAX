"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const history=require("../js/cuttingJobHistory"),importer=require("../js/cuttingJobImporter")();
const material={id:"steel",name:"Steel",density:.283,pricePerLb:.8};
const root={id:"jobs_root",name:"All Jobs",parent:null,order:1};
const row=(project="1254",category="Blanco",extra={})=>({import_event_id:"event-1",record_status:"active",job_name:"Part",project_number:project,category,material:"Steel",thickness_inches:"0.25",path_length_ft:"4",path_width_ft:"2",review_status:"reviewed",...extra});
const preview=(rows,folders=[],state={cuttingJobs:[],completedCuttingJobs:[]})=>importer.preview(rows,{state,categories:folders,materialSettings:{materials:[material],wasteFactor:10}});
function harness(options={}){
  const state=structuredClone(options.state||{cuttingJobs:[],completedCuttingJobs:[],inventory:[{id:"keep",quantity:4}],pumpEff:{entries:[{rpm:3200}]},dashboardLayout:{keep:true},maintenanceTasksV2:[{id:"maintenance"}],deletedItems:[]});
  const folders=structuredClone(options.folders||[root]),calls=[],materials=[structuredClone(material)];let serial=0;
  const env={state:()=>state,categories:()=>folders,materials:()=>materials,materialSettings:()=>({materials,wasteFactor:10}),authenticatedBaseline:()=>true,revalidateBaseline:async()=>{calls.push("baseline");return true;},backup:async()=>{calls.push("backup");return true;},
    createCategory:name=>{calls.push("create");const made={id:`native-${++serial}`,name,parent:"jobs_root",order:Math.max(...folders.map(f=>f.order||0))+1};folders.push(made);return made;},
    removeCategories:ids=>{for(let i=folders.length-1;i>=0;i--)if(ids.includes(String(folders[i].id)))folders.splice(i,1);},
    saveCloudNow:async()=>{calls.push("save");return options.save||{saved:true,stateWriteAttempted:true,stateWriteCompleted:true};},
    verifyCloud:async args=>{assert.deepEqual(args.expectedCategories,folders);return options.verify!==false;},suspend:()=>calls.push("suspend")};
  Object.assign(env,options.env||{});const api=importer.createApi(env);
  return{state,folders,calls,env,api,submit:rows=>api.submit(rows,{confirmed:true,reviewedPreview:api.preview(rows)})};
}

test("all confirmed pairs resolve by name, prefix, and compatible reversed legacy name",()=>{
  for(const [project,canonical]of history.PROJECT_CATEGORIES){
    const name=project==="ALAMO"?canonical:canonical.slice(project.length).trim();
    for(const folderName of new Set([name,canonical,project==="ALAMO"?name:`${name} ${project}`])){
      const p=preview([row(project,name)],[{id:"existing",name:folderName}])[0];
      assert.equal(p.status,"ready",folderName);assert.equal(p.categoryId,"existing");assert.equal(p.row.project_number,project);
    }
  }
});
test("0000 is Company Improvements and remains a string",async()=>{
  const h=harness(),result=await h.submit([row("0000","Company Improvements")]);
  assert.equal(result.saveCompleted,true);assert.equal(h.folders[1].name,"0000 Company Improvements");
  assert.equal(h.state.cuttingJobs[0].projectNumber,"0000");assert.equal(typeof h.state.cuttingJobs[0].projectNumber,"string");
});
test("1111 has no confirmed mapping and cannot claim Company Improvements",()=>{
  assert.equal(history.canonicalCategoryName("1111"),"");
  assert.equal(preview([row("1111","Company Improvements")])[0].status,"unresolved");
  const p=preview([row("1111","Legacy Workshop")],[{id:"legacy",name:"1111 Legacy Workshop"}])[0];
  assert.equal(p.status,"ready");assert.equal(p.categoryId,"legacy");
});
test("existing 1111 historical data is preserved during another project's import",async()=>{
  const legacy={id:"old",projectNumber:"1111",cat:"legacy",cutNumber:"C001",startISO:"2020-01-01"};
  const h=harness({state:{cuttingJobs:[legacy],completedCuttingJobs:[]},folders:[root,{id:"legacy",name:"1111 Company Improvements",order:2}]}),before=structuredClone(h.state.cuttingJobs[0]);
  assert.equal((await h.submit([row("1242","Mesquite",{start_date:"2026-01-01"})])).saveCompleted,true);
  assert.deepEqual(h.state.cuttingJobs[0],before);assert.equal(h.folders[1].name,"1111 Company Improvements");
});
test("1242 Mesquite can be created and reused",async()=>{
  const h=harness(),rows=[row("1242","Mesquite")],before=structuredClone(h.folders),p=h.api.preview(rows);
  assert.deepEqual(h.folders,before);assert.equal(p[0].categoryResolution.status,"missing");
  assert.equal(importer.definitionPlan(p).newCategories[0].name,"1242 Mesquite");
  assert.equal((await h.submit(rows)).saveCompleted,true);assert.equal(h.folders[1].name,"1242 Mesquite");
  assert.equal(h.api.preview([row("1242","Mesquite",{import_event_id:"next"})])[0].categoryResolution.value,h.folders[1].id);
});
test("1254 Blanco resolves as one identity",async()=>{
  const h=harness({folders:[root,{id:"blanco",name:"1254 Blanco",order:2},{id:"atm",name:"1251 ATM",order:3}]});
  assert.equal((await h.submit([row()])).saveCompleted,true);assert.equal(h.state.cuttingJobs[0].projectNumber,"1254");assert.equal(h.state.cuttingJobs[0].cat,"blanco");
});
test("Excel zero recovery is narrow, warned, and retains original cells",async()=>{
  const h=harness(),rows=[row(0,"Company Improvements")],p=h.api.preview(rows)[0];
  assert.equal(p.row.project_number,"0000");assert.match(p.warnings.join(" "),/Excel.*recovered/);
  assert.equal((await h.submit(rows)).saveCompleted,true);
  assert.equal(h.state.cuttingJobs[0].importProvenance.project_number,"0");assert.equal(h.state.cuttingJobs[0].importProvenance.category,"Company Improvements");
  assert.equal(preview([row("0","Other Project")])[0].row.project_number,"0");
  assert.equal(preview([row("0","")])[0].status,"unresolved");
  for(const name of ["0000 Company Improvements","Company Improvements 0000"]){const p=preview([row("0",name)])[0];assert.equal(p.row.project_number,"0000");assert.equal(p.status,"ready");}
});
test("known crossed pairs and category prefixes belonging to another project block",()=>{
  for(const [project,name]of [["1254","ATM"],["1242","Blanco"],["0000","Undisclosed Project"],["1251","Blanco"],["1305","1306 Smith County"]]){
    const p=preview([row(project,name)])[0];assert.equal(p.status,"unresolved");assert.equal(p.categoryResolution.status,"conflict");
  }
});
test("all conflicting names for one workbook project block, including a needs_review counterpart",()=>{
  const rows=[row(),row("1254","ATM",{import_event_id:"other",review_status:"needs_review"})],p=preview(rows);
  assert.ok(p.every(x=>x.status==="unresolved"&&x.categoryResolution.status==="conflict"));
  assert.ok(p.every(x=>x.reasons.some(reason=>reason.includes("all rows for this project"))));assert.equal(importer.definitionPlan(p).newCategories.length,0);
});
test("one workbook display name claimed by two future project identities blocks both",()=>{
  const p=preview([row("1305","Smith County"),row("1306","smith   county",{import_event_id:"other"})]);
  assert.ok(p.every(x=>x.status==="unresolved"));assert.ok(p.every(x=>x.reasons.some(reason=>reason.includes("conflicting project identities"))));
});
test("explicit metadata and prefix/name ownership conflicts block",()=>{
  for(const folder of [{id:"x",name:"Blanco",projectNumber:"1251"},{id:"x",name:"1254 ATM"},{id:"x",name:"1306 Smith County"}]){
    const p=preview([row(folder.name.includes("Smith")?"1305":"1254",folder.name.includes("Smith")?"Smith County":"Blanco")],[folder])[0];assert.equal(p.status,"unresolved");
  }
  assert.equal(preview([row()],[{id:"x",name:"Blanco",projectNumber:"1254"}])[0].status,"ready");
});
test("unique legacy names cannot be reused across existing job project identities",()=>{
  const folder={id:"legacy",name:"Smith County"},state={cuttingJobs:[{cat:"legacy",projectNumber:"1306"}],completedCuttingJobs:[]};
  assert.equal(preview([row("1305","Smith County")],[folder],state)[0].status,"unresolved");
  state.cuttingJobs.push({cat:"legacy",projectNumber:"1305"});assert.equal(preview([row("1305","Smith County")],[folder],state)[0].status,"unresolved");
});
test("duplicate project folders and duplicate folder IDs block",()=>{
  for(const folders of [[{id:"a",name:"1254 Blanco"},{id:"b",name:"Blanco"}],[{id:"a",name:"1254 Blanco"},{id:"a",name:"Unrelated"}]]){
    const p=preview([row()],folders)[0];assert.equal(p.status,"unresolved");assert.equal(p.categoryResolution.status,"ambiguous");
  }
});
test("future project with a reviewed name creates through the native folder adapter",async()=>{
  const h=harness(),result=await h.submit([row("1305","Smith County")]);
  assert.equal(result.saveCompleted,true);assert.deepEqual(h.folders[1],{id:"native-1",name:"1305 Smith County",parent:"jobs_root",order:2});
  assert.equal(h.state.cuttingJobs[0].cat,"native-1");assert.equal(h.state.cuttingJobs[0].projectNumber,"1305");
});
test("unknown project with blank category blocks",()=>{assert.equal(preview([row("1305","")])[0].status,"unresolved");});
test("30 ready rows create one folder, rerun adds zero jobs/folders, and later rows reuse",async()=>{
  const h=harness(),rows=Array.from({length:30},(_,i)=>row("1305","Smith County",{import_event_id:`cut-${i}`}));
  assert.equal(h.api.preview(rows).filter(x=>x.status==="ready").length,30);assert.equal(importer.definitionPlan(h.api.preview(rows)).newCategories.length,1);
  const result=await h.submit(rows);assert.equal(result.saveCompleted,true);assert.equal(result.createdCategoryIds.length,1);assert.equal(h.state.cuttingJobs.length,30);
  assert.ok(h.state.cuttingJobs.every(job=>job.projectNumber==="1305"&&job.cat===h.folders[1].id));
  const calls=h.calls.length,again=await h.submit(rows);assert.equal(again.duplicateRows,30);assert.equal(again.createdCategoryIds.length,0);assert.equal(h.calls.length,calls);assert.equal(h.folders.length,2);
  const later=await h.submit([row("1305","Smith County",{import_event_id:"later"})]);assert.equal(later.saveCompleted,true);assert.equal(later.createdCategoryIds.length,0);assert.equal(h.folders.length,2);
});
test("leading zeros and original workbook names survive without duplicating visible numbers",async()=>{
  const h=harness(),rows=[row("0012","0012 Future Project")];assert.equal((await h.submit(rows)).saveCompleted,true);
  const job=h.state.cuttingJobs[0];assert.equal(job.projectNumber,"0012");assert.equal(h.folders[1].name,"0012 Future Project");assert.equal(job.importProvenance.project_number,"0012");assert.equal(job.importProvenance.category,"0012 Future Project");
});
test("provenance preserves original project/category whitespace while resolution cleans it",async()=>{
  const h=harness();assert.equal((await h.submit([row(" 1254 "," Blanco ")])).saveCompleted,true);
  assert.equal(h.state.cuttingJobs[0].projectNumber,"1254");assert.equal(h.state.cuttingJobs[0].importProvenance.project_number," 1254 ");assert.equal(h.state.cuttingJobs[0].importProvenance.category," Blanco ");
});
test("ALAMO remains supported with no invented numeric key",async()=>{
  const h=harness();assert.equal((await h.submit([row("ALAMO","ALAMO")])).saveCompleted,true);assert.equal(h.folders[1].name,"ALAMO");assert.equal(h.state.cuttingJobs[0].projectNumber,"ALAMO");
});
test("review and material/thickness/dimension blockers never create categories",async()=>{
  for(const extra of [{review_status:"needs_review"},{material:"RC50"},{thickness_inches:""},{path_length_ft:"",source_dimensions_raw:"5900 inch"}]){
    const h=harness(),rows=[row("1305","Smith County",extra)],p=h.api.preview(rows);assert.equal(p[0].status,"unresolved");assert.equal(importer.definitionPlan(p).newCategories.length,0);assert.equal(p[0].warnings.some(w=>w.includes("will be created")),false);
    await h.submit(rows);assert.equal(h.folders.length,1);assert.equal(h.calls.length,0);
  }
});
test("category creation plan includes only ready rows, with active and completed jobs linked together",async()=>{
  const h=harness(),rows=[row(),row("1242","Mesquite",{import_event_id:"blocked",review_status:"needs_review"}),row("1254","Blanco",{import_event_id:"completed",record_status:"completed",completed_date:"2026-01-01"})];
  const r=await h.submit(rows);assert.equal(r.createdCategoryIds.length,1);assert.equal(h.folders.length,2);assert.equal(h.state.cuttingJobs[0].cat,h.state.completedCuttingJobs[0].cat);assert.equal(h.folders.some(f=>f.name.includes("Mesquite")),false);
});
test("definite rejection restores folders and both job arrays exactly",async()=>{
  const h=harness({state:{cuttingJobs:[{id:"old",projectNumber:"1251",cat:"atm",cutNumber:"C050",startISO:"2020-01-01"}],completedCuttingJobs:[],inventory:[{id:"keep"}]},folders:[root,{id:"atm",name:"1251 ATM",order:2}],save:{saved:false,stateWriteAttempted:true,stateWriteCompleted:false,definiteFailure:true,error:"CAS rejected"}}),before=structuredClone({state:h.state,folders:h.folders});
  const r=await h.submit([row(),row("1242","Mesquite",{import_event_id:"completed",record_status:"completed",completed_date:"2021-01-01"})]);assert.equal(r.rollbackVerified,true);assert.deepEqual({state:h.state,folders:h.folders},before);
});
test("indeterminate save retains folders/jobs, suspends, and attempts one save",async()=>{
  const h=harness({save:{saved:false,stateWriteAttempted:true,stateWriteCompleted:false,indeterminate:true}}),r=await h.submit([row()]);
  assert.equal(r.saveIndeterminate,true);assert.equal(r.rollbackAttempted,false);assert.equal(h.folders.length,2);assert.equal(h.state.cuttingJobs.length,1);assert.equal(h.calls.filter(x=>x==="save").length,1);assert.ok(h.calls.includes("suspend"));
});
test("thrown save has an unknown outcome and retains all staged evidence",async()=>{
  let saves=0;const h=harness({env:{saveCloudNow:async()=>{saves++;throw Error("network lost");}}}),r=await h.submit([row()]);
  assert.equal(r.saveIndeterminate,true);assert.equal(r.rollbackAttempted,false);assert.equal(saves,1);assert.equal(h.state.cuttingJobs.length,1);assert.equal(h.folders.length,2);assert.ok(h.calls.includes("suspend"));
});
test("missing or inconsistent save acknowledgements retain evidence and suspend",async()=>{
  for(const saved of [undefined,{saved:false,stateWriteAttempted:true,stateWriteCompleted:true}]){
    const h=harness({env:{saveCloudNow:async()=>saved}}),r=await h.submit([row()]);
    assert.equal(r.saveIndeterminate,true);assert.equal(r.rollbackAttempted,false);assert.equal(h.folders.length,2);assert.equal(h.state.cuttingJobs.length,1);assert.ok(h.calls.includes("suspend"));
  }
});
test("successful write with failed verification retains category/job evidence",async()=>{
  const h=harness({verify:false}),r=await h.submit([row()]);assert.equal(r.saveIndeterminate,true);assert.equal(r.rollbackAttempted,false);assert.equal(h.folders.length,2);assert.equal(h.state.cuttingJobs.length,1);
});
test("protected fields and legacy folders stay unchanged after success",async()=>{
  const h=harness({folders:[root,{id:"legacy",name:"Unrelated",order:8,color:"#ff0000"}]}),before=structuredClone(h.state),folders=structuredClone(h.folders);
  const r=await h.submit([row()]);assert.equal(r.saveCompleted,true);assert.equal(r.protectedStateMatched,true);
  for(const key of Object.keys(before).filter(k=>!['cuttingJobs','completedCuttingJobs'].includes(k)))assert.deepEqual(h.state[key],before[key]);assert.deepEqual(h.folders.slice(0,2),folders);
});
test("preview changes during authoritative revalidation or backup block before creation",async()=>{
  for(const phase of ["revalidateBaseline","backup"]){
    const h=harness();h.env[phase]=async()=>{h.folders.push({id:"new",name:"1254 Blanco"});return true;};
    const r=await h.submit([row()]);assert.equal(r.saveCompleted,false);assert.match(r.saveError,/preview|revalidation/);assert.equal(h.state.cuttingJobs.length,0);assert.equal(h.calls.includes("create"),false);
  }
});
test("failed backup blocks all category and job mutations",async()=>{
  const h=harness({env:{backup:async()=>{throw Error("backup failed");}}}),before=structuredClone({state:h.state,folders:h.folders}),r=await h.submit([row()]);
  assert.equal(r.backupCreated,false);assert.equal(r.saveAttempted,false);assert.deepEqual({state:h.state,folders:h.folders},before);
});
test("cloud verification receives an immutable snapshot of staged jobs and categories",async()=>{
  const h=harness();let original;
  h.env.saveCloudNow=async()=>{original=structuredClone({jobs:h.state.cuttingJobs,folders:h.folders});h.folders[1].name="Concurrent edit";h.state.cuttingJobs[0].name="Concurrent edit";return{saved:true,stateWriteAttempted:true,stateWriteCompleted:true};};
  h.env.verifyCloud=async args=>{assert.deepEqual(args.expectedCategories,original.folders);assert.deepEqual(args.expectedState.cuttingJobs,original.jobs);return false;};
  const r=await h.submit([row()]);assert.equal(r.saveIndeterminate,true);assert.equal(r.rollbackAttempted,false);
});
test("pair verification rejects a native creator returning the wrong project folder",async()=>{
  const h=harness();h.env.createCategory=()=>{const made={id:"wrong",name:"1251 ATM",parent:"jobs_root",order:2};h.folders.push(made);return made;};
  const before=structuredClone(h.folders),r=await h.submit([row()]);assert.match(r.saveError,/pair verification/);assert.equal(r.rollbackVerified,true);assert.deepEqual(h.folders,before);assert.equal(h.state.cuttingJobs.length,0);assert.equal(h.calls.includes("save"),false);
});

const core=fs.readFileSync("js/core.js","utf8");
test("production folder normalizer preserves existing metadata as strings",()=>{
  const section=core.slice(core.indexOf("function normalizeJobFolders("),core.indexOf("function setJobFolders("));
  const context=vm.createContext({JOB_ROOT_FOLDER_ID:"jobs_root",normalizeHexColor:v=>v||"",DEFAULT_JOB_FOLDERS:[root]});
  vm.runInContext(section+";this.normalize=normalizeJobFolders",context);
  const folders=context.normalize([root,{id:"legacy",name:"Smith County",projectNumber:"0012",parent:"jobs_root",order:2}]);
  assert.equal(folders[1].projectNumber,"0012");assert.equal(folders[0].projectNumber,undefined);
});
test("production preview exposes project, category, and category status",()=>{
  for(const label of ['${th("Project")}','${th("Category")}','${th("Category status")}','"Conflict / Review"','"Existing"','"Will create"'])assert.ok(core.includes(label),label);
});
test("production cloud verifier requires exact categories alongside exact jobs",async()=>{
  const section=core.slice(core.indexOf("verifyCloud:async({plannedIds,expectedState,expectedCategories})=>{"),core.indexOf("  suspend:reason=>",core.indexOf("window.cuttingJobImporter =")));
  const expectedState={cuttingJobs:[{id:"job",import_event_id:"event"}],completedCuttingJobs:[]},expectedCategories=[root,{id:"blanco",name:"1254 Blanco"}],baseline={...expectedState,jobFolders:[root],inventory:[{id:"keep"}]};
  let cloud={...baseline,jobFolders:expectedCategories};
  const context=vm.createContext({window:{__cjiAuthoritativeBaseline:baseline},readCuttingJobImportCloudState:async()=>structuredClone(cloud),stableStringify:JSON.stringify});
  vm.runInContext(`this.verify=({${section}}).verifyCloud`,context);
  const args={plannedIds:["event"],expectedState,expectedCategories};assert.equal(await context.verify(args),true);
  cloud={...cloud,jobFolders:[root]};assert.equal(await context.verify(args),false);
  cloud={...cloud,jobFolders:expectedCategories,inventory:[]};assert.equal(await context.verify(args),false);
});
