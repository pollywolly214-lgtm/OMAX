"use strict";
const repair=require("../../js/globalIdentityRepair"),importer=require("../../js/cuttingJobImporter")();
const {fixture}=require("./global-identity");
const material={id:"steel",name:"Steel",density:.283,pricePerLb:.8};
function baseline(){
  const source=fixture(),state=repair.repairedState(source,repair.preview(source));
  state.jobFolders.push({id:"job_project_0000",name:"0000 Undisclosed Project",projectNumber:null,parent:"jobs_root",order:2},{id:"job_project_1111",name:"1111 Company Improvements",projectNumber:null,parent:"jobs_root",order:3},...Array.from({length:12},(_,i)=>({id:`other-folder-${i}`,name:`Historical category ${i}`,parent:"jobs_root",order:i+4})));
  for(const job of state.completedCuttingJobs.slice(0,11)){job.cat="job_project_0000";job.projectNumber="0000";}
  return state;
}
function rows(){return Array.from({length:88},(_,i)=>({import_event_id:`616-CUT-P${String(Math.floor(i/20)+1).padStart(2,"0")}-L${String(i%20+2).padStart(3,"0")}`,record_status:"completed",job_name:`Recovered cut ${i+1}`,project_number:"0000",category:"Company Improvements",material:"Steel",thickness_inches:"0.25",path_length_ft:"4",path_width_ft:"2",actual_cut_minutes:"60",start_date:"2026-01-01",completed_date:"2026-01-02",review_status:"reviewed",source_file:"synthetic recovery workbook",source_text:`Preserve source ${i+1}`}));}
function postImport(){
  const state=baseline();state.jobFolders.find(folder=>folder.id==="job_project_0000").name="0000 Company Improvements";
  const preview=importer.preview(rows(),{state,categories:state.jobFolders,materialSettings:{materials:[material],wasteFactor:10}});
  if(preview.some(item=>item.status!=="ready"))throw Error("Synthetic post-import fixture must be ready.");
  state.completedCuttingJobs.push(...preview.map(importer.map));return state;
}
module.exports={baseline,rows,postImport,material};
