"use strict";
function renderHistoricalReconciliationTool(root){
  const section=document.createElement("section");
  section.className="history-import-admin";
  section.innerHTML=`<h4>Historical purchase / pump reconciliation</h4>
    <p>Preview reviewed source records against current history. Only missing permanent IDs can append. Purchases restore history only; inventory quantities stay unchanged. Existing pump days require review.</p>
    <label>History <select data-history-kind><option value="purchase">Purchase History</option><option value="pump">Pump / RPM history</option></select></label>
    <label>Reviewed JSON source <input type="file" accept=".json,application/json" data-history-file></label>
    <button type="button" data-history-preview>Preview reconciliation</button>
    <label><input type="checkbox" data-history-confirm> I reviewed the classifications and authorize adding missing records only.</label>
    <button type="button" data-history-append disabled>Download backup and append reviewed missing records</button>
    <p data-history-status role="status"></p><div data-history-rows style="overflow:auto;max-height:420px"></div>`;
  root.appendChild(section);
  const kind=section.querySelector("[data-history-kind]"),file=section.querySelector("[data-history-file]"),review=section.querySelector("[data-history-confirm]"),append=section.querySelector("[data-history-append]"),status=section.querySelector("[data-history-status]"),rows=section.querySelector("[data-history-rows]");
  let parsed=null,preview=null,previewKind=null,busy=false;
  const invalidate=()=>{review.checked=false;append.disabled=true;preview=null;};
  file.addEventListener("change",invalidate);kind.addEventListener("change",invalidate);
  review.addEventListener("change",()=>{append.disabled=busy||!review.checked||!preview?.some(item=>item.status===OMAXHistoricalImport.STATUS.missing);});
  section.querySelector("[data-history-preview]").addEventListener("click",async()=>{
    invalidate();
    try {
      if(!file.files?.[0])throw Error("Choose a reviewed JSON source file.");
      parsed=JSON.parse(await file.files[0].text());previewKind=kind.value;
      preview=window.historicalImport.preview(previewKind,parsed);
      const counts={};preview.forEach(item=>counts[item.status]=(counts[item.status]||0)+1);
      status.textContent="Dry run — no state changed. "+Object.entries(counts).map(([key,value])=>`${key}: ${value}`).join("; ");
      rows.replaceChildren();
      for(const item of preview){const paragraph=document.createElement("p");paragraph.textContent=`${item.import_event_id||"(missing ID)"} · ${item.raw.date||"(missing date)"} · ${item.status} — ${item.reason}`;rows.appendChild(paragraph);}
    }catch(error){status.textContent=String(error?.message||error);}
  });
  append.addEventListener("click",async()=>{
    if(busy||!review.checked||!preview||kind.value!==previewKind)return;
    if(!window.confirm("Download a pre-import cloud backup and append only the Missing — Import records you reviewed?"))return;
    busy=true;append.disabled=true;kind.disabled=true;file.disabled=true;
    try {const result=await window.historicalImport.submit(previewKind,parsed,{confirmed:true,reviewedPreview:preview});status.textContent=result.saved?`Cloud verified: ${result.importedIds.length} records added. Count ${result.beforeCount} → ${result.afterCount}.`:result.error||"No missing records; nothing was changed.";section.dataset.lastImportResult=JSON.stringify(result);}
    catch(error){status.textContent=String(error?.message||error);}
    finally{busy=false;kind.disabled=false;file.disabled=false;invalidate();}
  });
}
