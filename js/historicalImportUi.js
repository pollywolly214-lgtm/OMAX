"use strict";
function renderHistoricalReconciliationTool(root){
  const section=document.createElement("section");
  section.className="history-import-admin maintenance-recovery-panel";
  section.innerHTML=`<h4>Reviewed recovery workbook import</h4>
    <p>Preview is read-only. Create and verify reusable tasks separately in Maintenance Settings before importing maintenance history. Recovery events are completed one-time work. Purchases restore history without changing inventory. Existing pump dates require review.</p>
    <label>History <select data-history-kind><option value="purchase">Purchase History — Purchases</option><option value="maintenance">Maintenance — Maintenance Events</option><option value="pump">Pump — RPM History</option><option value="pump_hours">Pump — Pump Hours</option></select></label>
    <p>For cutting jobs, use the existing reviewed workbook importer in Cutting Jobs. Import each pump sheet separately, reviewing a fresh baseline each time.</p>
    <label>Reviewed workbook or JSON <input type="file" accept=".xlsx,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-history-file></label>
    <button type="button" data-history-preview>Preview reconciliation</button>
    <label><input type="checkbox" data-history-confirm> I reviewed the classifications, task setup and Import Gate, and authorize adding eligible missing records only.</label>
    <button type="button" data-history-append disabled>Download backup and append reviewed missing records</button>
    <p data-history-status role="status"></p><div data-history-rows style="overflow:auto;max-height:420px"></div>`;
  root.appendChild(section);
  const kind=section.querySelector("[data-history-kind]"),file=section.querySelector("[data-history-file]"),review=section.querySelector("[data-history-confirm]"),append=section.querySelector("[data-history-append]"),status=section.querySelector("[data-history-status]"),rows=section.querySelector("[data-history-rows]"),previewButton=section.querySelector("[data-history-preview]");
  let parsed=null,preview=null,previewKind=null,busy=false,previewGeneration=0;
  const invalidate=()=>{previewGeneration++;review.checked=false;append.disabled=true;preview=null;};
  const paragraph=text=>{const p=document.createElement("p");p.textContent=text;rows.appendChild(p);};
  file.addEventListener("change",()=>{invalidate();rows.replaceChildren();});
  kind.addEventListener("change",()=>{invalidate();rows.replaceChildren();});
  review.addEventListener("change",()=>{append.disabled=busy||!review.checked||!preview?.some(item=>item.status===OMAXHistoricalImport.STATUS.missing);});
  previewButton.addEventListener("click",async()=>{
    if(busy)return;
    invalidate();const generation=previewGeneration,selectedKind=kind.value,selectedFile=file.files?.[0];
    try {
      if(!selectedFile)throw Error("Choose a reviewed workbook or JSON source file.");
      const source=await window.OMAXRecoveryWorkbook.parseFile(selectedKind,selectedFile,window.CjiXlsxParser);
      if(generation!==previewGeneration)return;
      parsed=source;previewKind=selectedKind;
      preview=window.historicalImport.preview(previewKind,parsed);
      const counts={};preview.forEach(item=>counts[item.status]=(counts[item.status]||0)+1);
      status.textContent="Dry run — no state changed. "+Object.entries(counts).map(([key,value])=>`${key}: ${value}`).join("; ");
      rows.replaceChildren();
      if(previewKind==="maintenance"){
        const checklist=preview[0]?.checklist||[];
        paragraph("Separate task setup preflight:");
        checklist.forEach(item=>paragraph(`${item.task_setup_id} · ${item.task_name} · ${item.status} (${item.matchCount} exact matches)`));
        if(parsed.gate?.length){paragraph("Import Gate — operator reference (no automatic approval):");parsed.gate.forEach(item=>paragraph(JSON.stringify(item)));}
        paragraph("Only completed one-time events are eligible. Repeat chains: 0. Future projections: 0.");
      }
      for(const item of preview)paragraph(`${item.import_event_id||"(missing ID)"} · ${item.raw.date||item.raw.event_date||"(missing date)"} · ${item.status} — ${item.reason}${previewKind==="maintenance"&&item.hours!=null?` Labor: ${item.hours*60} minutes; parts snapshot: ${item.raw.parts_cost_snapshot??"saved task cost"}.`:""}${item.raw.time_source==="unknown_source_time_placeholder_noon"?" Source time unknown; 12:00 is a storage placeholder.":""}`);
    }catch(error){if(generation===previewGeneration){status.textContent=String(error?.message||error);rows.replaceChildren();}}
  });
  append.addEventListener("click",async()=>{
    if(busy||!review.checked||!preview||kind.value!==previewKind)return;
    if(!window.confirm("Download a pre-import cloud backup and append only the Missing — Import records you reviewed?"))return;
    busy=true;append.disabled=true;kind.disabled=true;file.disabled=true;previewButton.disabled=true;review.disabled=true;
    try {
      const result=await window.historicalImport.submit(previewKind,parsed,{confirmed:true,reviewedPreview:preview});
      status.textContent=result.saved?`Cloud verified: ${result.importedIds.length} records added. Count ${result.beforeCount} → ${result.afterCount}. IDs: ${result.importedIds.join(", ")}. ${result.maintenanceCounts?JSON.stringify(result.maintenanceCounts):""}`:result.error||"No missing records; nothing was changed.";
      section.dataset.lastImportResult=JSON.stringify(result);
    }catch(error){status.textContent=String(error?.message||error);}
    finally{busy=false;kind.disabled=false;file.disabled=false;previewButton.disabled=false;review.disabled=false;invalidate();}
  });
}

function renderMaintenanceRecoveryTaskSetupTool(root){
  const section=document.createElement("section");
  section.className="history-import-admin maintenance-recovery-panel";
  section.innerHTML=`<h4>Maintenance Recovery Task Setup</h4>
    <p>Preview the eight reviewed setup names against authoritative cloud state. Create only eligible missing reusable tasks. Existing tasks stay unchanged. Transfer Tank Water Pump and Empty Scrap Bin remain blocked until manually reviewed. This action does not import maintenance history or schedule calendar events.</p>
    <button type="button" data-task-setup-preview>Preview task setup</button>
    <label><input type="checkbox" data-task-setup-confirm disabled> I reviewed these task definitions and authorize creating only the eligible missing tasks.</label>
    <button type="button" data-task-setup-create disabled>Download backup and create reviewed missing tasks</button>
    <p data-task-setup-status role="status"></p>
    <div style="overflow:auto;max-height:420px" tabindex="0" aria-label="Reviewed maintenance task setup"><table class="cost-table"><thead><tr><th>Exact task name</th><th>Expected type</th><th>Part #</th><th>Parts cost</th><th>Labor</th><th>Exact matches</th><th>Status</th><th>Review notes</th></tr></thead><tbody data-task-setup-rows></tbody></table></div>`;
  root.appendChild(section);
  const previewButton=section.querySelector("[data-task-setup-preview]"),review=section.querySelector("[data-task-setup-confirm]"),create=section.querySelector("[data-task-setup-create]"),status=section.querySelector("[data-task-setup-status]"),rows=section.querySelector("[data-task-setup-rows]");
  const setup=window.OMAXMaintenanceRecoveryTaskSetup;
  let reviewedPreview=null,busy=false;
  const eligible=()=>reviewedPreview?.some(item=>item.status===setup.STATUS.ready);
  const updateControls=()=>{previewButton.disabled=busy;review.disabled=busy||!eligible();create.disabled=busy||!review.checked||!eligible();};
  const display=plan=>{
    rows.replaceChildren();
    for(const item of plan){
      const tr=document.createElement("tr"),raw=item.raw;
      for(const value of [raw.name,raw.type,raw.pn===null?"Unresolved":raw.pn||"—",raw.price===null?"Unresolved":new Intl.NumberFormat(undefined,{style:"currency",currency:"USD"}).format(raw.price),raw.minutes===null?"Unresolved":`${raw.minutes} minutes`,String(item.matchCount),item.status,item.reason]){
        const td=document.createElement("td");td.textContent=value;tr.appendChild(td);
      }
      rows.appendChild(tr);
    }
  };
  review.addEventListener("change",updateControls);
  previewButton.addEventListener("click",async()=>{
    if(busy)return;
    busy=true;review.checked=false;reviewedPreview=null;updateControls();status.textContent="Reading authoritative task setup preview…";
    try{
      reviewedPreview=await window.historicalImport.previewAuthoritativeTaskSetup();display(reviewedPreview);
      const counts=setup.summary(reviewedPreview);
      status.textContent=`Read-only preview — no state changed. Ready to create: ${reviewedPreview.filter(item=>item.status===setup.STATUS.ready).length}; Already Present: ${counts.alreadyPresent}; Blocked for Review: ${counts.blockedForReview}; Duplicates: ${counts.duplicates}.`;
    }catch(error){status.textContent=String(error?.message||error);rows.replaceChildren();}
    finally{busy=false;updateControls();}
  });
  create.addEventListener("click",async()=>{
    if(busy||!review.checked||!eligible())return;
    if(!window.confirm("Download an exact cloud backup and create only the eligible missing Maintenance Settings tasks you reviewed? No maintenance history will be imported."))return;
    busy=true;updateControls();
    try{
      const result=await window.historicalImport.submit("task_setup",null,{confirmed:true,reviewedPreview});
      section.dataset.lastTaskSetupResult=JSON.stringify(result);
      if(result.saved){
        const counts=result.taskSetup;
        status.textContent=`Cloud verified. Created: ${counts.created}; Already Present: ${counts.alreadyPresent}; Blocked for Review: ${counts.blockedForReview}; Duplicates: ${counts.duplicates}. Exact-name preflight below verifies the created tasks are found exactly once. Maintenance history has not been imported.`;
        display(counts.preflight);
      }else{
        status.textContent=result.error||"No eligible missing tasks; zero tasks created and zero saves.";
        if(result.taskSetup?.preflight)display(result.taskSetup.preflight);
      }
    }catch(error){status.textContent=String(error?.message||error);}
    finally{busy=false;review.checked=false;reviewedPreview=null;updateControls();}
  });
}
