"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs/promises");
const headers=require("../../js/cuttingJobImporter.js")(globalThis).FIELDS;
const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
function zip(files){
  const chunks=[],central=[];let offset=0;
  for(const [name,text]of Object.entries(files)){
    const data=Buffer.from(text),file=Buffer.from(name),crc=crc32(data),local=Buffer.alloc(30),entry=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(file.length,26);
    entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(file.length,28);entry.writeUInt32LE(offset,42);
    chunks.push(local,file,data);central.push(entry,file);offset+=local.length+file.length+data.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...chunks,directory,end]);
}
const escape=text=>String(text).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
function workbook(rows){
  const column=index=>{let text="";for(index++;index;index=Math.floor((index-1)/26))text=String.fromCharCode(65+(index-1)%26)+text;return text;};
  const row=(values,n)=>`<row r="${n}">${values.map((value,i)=>`<c r="${column(i)}${n}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`).join("")}</row>`;
  return zip({
    "[Content_Types].xml":'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels":'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="book" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Recovery Summary" sheetId="1" r:id="summary"/><sheet name="Cutting Jobs" sheetId="2" r:id="jobs"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="summary" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="jobs" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml":`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${row(["Never import this summary"],1)}</sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml":`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${row(["Synthetic reviewed workbook"],1)}${row(["Use Cutting Jobs only"],2)}${row(headers,4)}${rows.map((data,i)=>row(headers.map(key=>data[key]??""),i+5)).join("")}</sheetData></worksheet>`
  });
}
module.exports=async function importUi({step,a,b,read,exact,ready,seedDoc,member,OWNER,legacy}){
  const INDEX="workspaces/github-prod/app/stateIndexV1";
  const index=()=>a.evaluate(async path=>(await FB.db.doc(path).get({source:"server"})).data(),INDEX);
  const unchanged=async(before,pointer)=>{await exact(a,before);assert.deepEqual(await index(),pointer);assert.deepEqual(await a.evaluate(async()=>(await FB.docRef.get({source:"server"})).data()),legacy);};
  const category=await a.evaluate(()=>CuttingJobHistory.canonicalCategoryName("1241"));
  const base={project_number:"1241",estimate_hours:"2",add_minutes:"0",priority:"2",charge_rate_per_hr:"200",cost_rate_per_hr:"45",start_date:"2026-11-24",due_date:"2026-11-25",category,material:"A36 steel",thickness_raw:"1/4",thickness_inches:"0.25",path_length_ft:"4",path_width_ft:"2",source_dimensions_raw:"4ft x 2ft",cut_sequence:"1",review_status:"reviewed",review_notes:"Keep exact workbook provenance",source_file:"synthetic-reviewed.xlsx",source_text:'Synthetic row with "quotes", comma & source'};
  const rows=[{...base,import_event_id:"mcap_workbook_active",record_status:"active",job_name:"Synthetic workbook active cut"},{...base,import_event_id:"mcap_workbook_completed",record_status:"completed",job_name:"Synthetic workbook completed cut",actual_cut_minutes:"15",completed_date:"2026-11-24",cut_sequence:"2"}];
  const file={name:"synthetic-reviewed.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:workbook(rows)};
  const preview=async()=>{
    await a.evaluate(()=>location.hash="#/jobs");await a.locator("[data-cutting-job-import-open]").click();
    await a.locator("#cuttingJobImportFile").setInputFiles(file);await a.locator("#cuttingJobImportPreview").click();
    await a.waitForFunction(()=>Boolean(document.getElementById("cuttingJobImportRows").dataset.lastPreviewPreparation),null,{timeout:90000});
    return a.evaluate(()=>({preparation:JSON.parse(document.getElementById("cuttingJobImportRows").dataset.lastPreviewPreparation),statuses:[...document.querySelectorAll("#cuttingJobImportRows tbody tr")].map(row=>row.cells[15]?.textContent),reasons:[...document.querySelectorAll("#cuttingJobImportRows tbody tr")].map(row=>row.cells[16]?.textContent),status:document.getElementById("cuttingJobImportStatus").textContent}));
  };
  await step("job workbook native XLSX preview and cancelled confirmation never write or download",async()=>{
    const before=await read(a),pointer=await index(),downloads=[],watch=value=>downloads.push(value);a.on("download",watch);
    try{
      const result=await preview();assert.equal(result.preparation.status,"ready",JSON.stringify(result));assert.deepEqual(result.statuses,["ready","ready"]);
      assert.equal(await a.locator("#cuttingJobImportRun").isDisabled(),true);
      await a.locator("#cuttingJobImportReviewed").check();await a.locator("#cuttingJobImportRun").click();
      assert.equal(await a.locator("#cuttingJobImportConfirm").isVisible(),true);
      await a.locator("#cuttingJobImportConfirmCancel").click();assert.equal(await a.locator("#cuttingJobImportRun").isDisabled(),true);
      assert.equal(downloads.length,0);await unchanged(before,pointer);
      await a.locator("#cuttingJobImportClose").click();await a.reload();await ready(a);await unchanged(before,pointer);
    }finally{a.off("download",watch);}
  });
  await step("job workbook native confirmation downloads exact backup and saves both rows once",async()=>{
    const before=await read(a),material=await a.evaluate(()=>JSON.parse(localStorage.getItem("job_material_pricing_v1")||"null"));
    const result=await preview();assert.equal(result.preparation.status,"ready",JSON.stringify(result));
    await a.locator("#cuttingJobImportReviewed").check();await a.locator("#cuttingJobImportRun").click();
    const downloading=a.waitForEvent("download");await a.locator("#cuttingJobImportConfirmRun").click();const downloaded=await downloading;
    assert.match(downloaded.suggestedFilename(),/^omax-cutting-job-import-backup-.*\.json$/);
    const {cjiLocalMaterialSettings,...backup}=JSON.parse(await fs.readFile(await downloaded.path(),"utf8"));assert.deepEqual(backup,before);assert.deepEqual(cjiLocalMaterialSettings,material);
    await a.waitForFunction(()=>Boolean(document.getElementById("cuttingJobImportRows").dataset.lastImportResult),null,{timeout:120000});
    const saved=await a.evaluate(()=>JSON.parse(document.getElementById("cuttingJobImportRows").dataset.lastImportResult));
    assert.equal(saved.saveCompleted,true,JSON.stringify(saved));assert.equal(saved.verificationCompleted,true);assert.equal(saved.backupCreated,true);
    assert.deepEqual(saved.importedEventIds,rows.map(row=>row.import_event_id));assert.equal(saved.activeJobsAdded,1);assert.equal(saved.completedJobsAdded,1);
    const after=await read(a);assert.ok(after.syncMeta.rev>before.syncMeta.rev);
    assert.equal(after.jobFolders.length,before.jobFolders.length);assert.equal(after.jobFolders.find(row=>row.id==="mcap-project").name,category);
    for(const key of Object.keys(before))if(!["cuttingJobs","completedCuttingJobs","jobFolders","syncMeta","saveMeta","syncProcessLog"].includes(key))assert.deepEqual(after[key],before[key],key);
    for(const [i,row]of rows.entries()){
      const collection=row.record_status==="active"?"cuttingJobs":"completedCuttingJobs",job=after[collection].find(job=>job.import_event_id===row.import_event_id);
      assert.ok(job);assert.equal(job.name,row.job_name);assert.equal(job.projectNumber,"1241");assert.equal(job.importProvenance.sourceRowNumber,i+5);assert.equal(job.importProvenance.source_text,row.source_text);
      assert.equal(after[collection].filter(job=>job.import_event_id===row.import_event_id).length,1);
      if(row.record_status==="completed"){assert.equal(job.actualHours,.25);assert.equal(job.manualLogs.length,1);assert.equal(job.manualLogs[0].completedHours,.25);}
    }
    for(const collection of ["cuttingJobs","completedCuttingJobs"])for(const job of before[collection])assert.deepEqual(after[collection].find(saved=>saved.id===job.id),job);
    await a.locator("#cuttingJobImportClose").click();await a.reload();await ready(a);await exact(a,after);
    await b.waitForFunction(rev=>window.__loadedCloudRevisionForSaveGuard===rev,after.syncMeta.rev);await exact(b,after);
    const pointer=await index(),downloads=[],watch=value=>downloads.push(value);a.on("download",watch);
    try{
      const duplicate=await preview();assert.deepEqual(duplicate.statuses,["duplicate","duplicate"]);assert.equal(duplicate.preparation.status,"no-ready-rows");
      assert.equal(await a.locator("#cuttingJobImportRun").isDisabled(),true);assert.equal(downloads.length,0);await unchanged(after,pointer);
      await a.locator("#cuttingJobImportClose").click();
    }finally{a.off("download",watch);}
  });
  await step("job restore native Deleted History retains exact identity and rejects denied saves",async()=>{
    const before=await read(a),job=before.cuttingJobs.find(row=>row.id==="mcap_attachment_job");assert.ok(job);
    a.removeAllListeners("dialog");a.on("dialog",dialog=>dialog.accept());
    let removed;
    try{removed=await a.evaluate(id=>deleteCuttingJob("cuttingJobs",id),job.id);}finally{a.removeAllListeners("dialog");a.on("dialog",dialog=>dialog.dismiss());}
    assert.equal(removed.saved,true,JSON.stringify(removed));
    const archived=await read(a),entry=archived.deletedItems.find(row=>row.type==="job"&&row.payload.id===job.id);assert.deepEqual(entry.payload,job);
    await a.reload();await ready(a);await a.evaluate(()=>location.hash="#/deleted");
    await a.evaluate(()=>{window.__mcapRestoreOutcome=null;const restore=window.restoreDeletedItem;window.restoreDeletedItem=async(...args)=>{const result=await restore(...args);window.__mcapRestoreOutcome=result;return result;};});
    await seedDoc("workspaces/github-prod/members/"+OWNER,member("viewer"));
    try{
      await a.locator(`[data-trash-restore="${entry.id}"]`).click();await a.waitForFunction(()=>window.__mcapRestoreOutcome!==null,null,{timeout:90000});
      const denied=await a.evaluate(()=>window.__mcapRestoreOutcome);assert.equal(denied.saved,false,JSON.stringify(denied));assert.equal(denied.ok,false);assert.equal(denied.indeterminate===true,false);
    }finally{await seedDoc("workspaces/github-prod/members/"+OWNER,member("owner"));}
    await exact(a,archived);assert.equal(await a.locator(`[data-trash-restore="${entry.id}"]`).count(),1);
    await a.evaluate(()=>window.__mcapRestoreOutcome=null);await a.locator(`[data-trash-restore="${entry.id}"]`).click();
    await a.waitForFunction(()=>window.__mcapRestoreOutcome!==null,null,{timeout:90000});
    const restored=await a.evaluate(()=>window.__mcapRestoreOutcome);assert.equal(restored.saved,true,JSON.stringify(restored));assert.equal(restored.ok,true);
    const after=await read(a);for(const key of Object.keys(before))if(!["syncMeta","saveMeta","syncProcessLog"].includes(key))assert.deepEqual(after[key],before[key],key);
    await a.reload();await ready(a);await exact(a,after);await b.waitForFunction(rev=>window.__loadedCloudRevisionForSaveGuard===rev,after.syncMeta.rev);await exact(b,after);
    await a.evaluate(()=>location.hash="#/");await a.locator("#waterQualityForm").waitFor();
  });
};
