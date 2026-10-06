(function(root){
  "use strict";
  const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  let activeDialog=null;
  function open(jobId){
    if(activeDialog?.open){activeDialog.focus();return;}
    const workflow=root.cuttingJobChronologyWorkflow,model=root.CuttingJobChronology;
    if(!workflow||!model){root.toast?.("Chronology review is unavailable. Reload and try again.");return;}
    const session=workflow.begin(jobId);
    if(!session.ok){root.toast?.(session.error);return;}
    const dialog=document.createElement("dialog");dialog.className="cut-chronology-dialog";dialog.setAttribute("data-cjo-dialog","");
    dialog.setAttribute("aria-labelledby","cutChronologyTitle");dialog.dataset.cjoTargetId=jobId;
    dialog.innerHTML='<h3 id="cutChronologyTitle">Edit Cut Date / Order</h3><p data-cjo-context></p><p data-cjo-progress></p><label>Cutting job<select data-cjo-job></select></label><p data-cjo-current></p><details><summary>Reference dates only</summary><p data-cjo-reference></p></details><p class="small">Enter the actual performed cut date. Reference and schedule dates are not actual chronology.</p><label>Actual cut date<input type="date" data-cjo-date required></label><div data-cjo-placement-panel><label>Place this cut<select data-cjo-placement></select></label><ol data-cjo-day></ol></div><div class="cut-chronology-actions"><button type="button" data-cjo-apply>Use reviewed date / placement</button><button type="button" data-cjo-preview-button>Preview changes</button></div><section data-cjo-preview hidden></section><p data-cjo-status role="status" aria-live="polite"></p><div class="cut-chronology-actions"><button type="button" data-cjo-confirm disabled>Confirm chronology change</button><button type="button" data-cjo-cancel>Cancel</button></div>';
    document.body.appendChild(dialog);activeDialog=dialog;
    const find=selector=>dialog.querySelector(selector),jobSelect=find("[data-cjo-job]"),dateInput=find("[data-cjo-date]"),placementSelect=find("[data-cjo-placement]"),status=find("[data-cjo-status]"),previewPanel=find("[data-cjo-preview]"),confirm=find("[data-cjo-confirm]");
    let selectedId=jobId,activePreview=null,dirty=false,saving=false,finished=false;
    const message=(text,error=false)=>{status.textContent=text;status.setAttribute("role",error?"alert":"status");};
    const invalidate=()=>{activePreview=null;confirm.disabled=true;previewPanel.hidden=true;};
    const placement=()=>{const value=placementSelect.value;if(value==="first"||value==="last"||value==="keep")return value;try{return JSON.parse(value);}catch(_){return null;}};
    function renderPlacement(){
      const jobs=session.jobs(),job=jobs.find(item=>item.id===selectedId),peers=session.sameDay(selectedId,dateInput.value);
      const keep=model.validCutDate(job?.cutDateISO)&&model.validDayOrder(job?.cutOrderWithinDay)&&job.cutDateISO===dateInput.value;
      const peerLabel=item=>`${model.readCutLabel(item)} / ${item.name||"Cutting job"}`;
      const options=[{value:"",label:"Choose placement"},...(keep?[{value:"keep",label:"Keep current position"}]:[]),{value:"first",label:"First"},...peers.flatMap(item=>[{value:JSON.stringify({type:"before",id:item.id}),label:"Before "+peerLabel(item)},{value:JSON.stringify({type:"after",id:item.id}),label:"After "+peerLabel(item)}]),{value:"last",label:"Last"}];
      placementSelect.innerHTML=options.map(item=>`<option value="${esc(item.value)}">${esc(item.label)}</option>`).join("");
      placementSelect.value=keep?"keep":peers.length?"":"first";
      find("[data-cjo-day]").innerHTML=peers.map(item=>`<li>${esc(peerLabel(item))}</li>`).join("");
      find("[data-cjo-placement-panel]").hidden=!peers.length;
    }
    function renderRow(){
      const jobs=session.jobs(),state=session.status(),job=jobs.find(item=>item.id===selectedId),baseline=session.baseline();
      const completed=new Set(baseline.completedCuttingJobs.map(item=>item.id));
      jobSelect.innerHTML=jobs.map(item=>`<option value="${esc(item.id)}">${esc(model.readCutLabel(item))} · ${esc(item.name||"Cutting job")} · Project ${esc(item.projectNumber||"—")} · ${completed.has(item.id)?"Completed":"Active"}${state.unresolvedIds.includes(item.id)?" · Needs review":""}</option>`).join("");jobSelect.value=selectedId;
      find("[data-cjo-context]").textContent=state.eligible?"Correct actual chronology, preview the affected labels, then confirm.":"Review Chronology: prepare every unresolved job here before one complete save. An unperformed job has no actual cut date; leave it unresolved until actual chronology can be established.";
      find("[data-cjo-progress]").textContent=state.unresolvedCount?`${state.unresolvedCount} jobs still require review. Nothing is saved until review is complete and confirmed.`:"All included jobs have valid chronology. Preview before saving.";
      find("[data-cjo-current]").textContent=`${model.readCutLabel(job)} · ${job.name||"Cutting job"} · Actual date: ${model.validCutDate(job.cutDateISO)?job.cutDateISO:"not reviewed"}`;
      const provenance=job.importProvenance||{},references=[['Scheduled start',job.startISO],['Scheduled due',job.dueISO],['Completion timestamp',job.completedAtISO],['Source completed date',provenance.completed_date||provenance.sourceRecord?.completed_date],['Source file',job.source_file||provenance.source_file]];
      find("[data-cjo-reference]").textContent=references.filter(([,value])=>value).map(([label,value])=>`${label}: ${String(value)}`).join("; ")||"No historical reference dates available.";
      dateInput.value=model.validCutDate(job.cutDateISO)&&model.validDayOrder(job.cutOrderWithinDay)?job.cutDateISO:"";
      dirty=false;renderPlacement();
    }
    function applyRow(){
      const result=session.apply(selectedId,dateInput.value,placement());
      if(!result.ok){message(result.error,true);return false;}
      dirty=false;invalidate();return true;
    }
    const close=()=>{if(saving)return;workflow.cancel(session);dialog.close();dialog.remove();activeDialog=null;};
    jobSelect.addEventListener("change",()=>{selectedId=jobSelect.value;invalidate();renderRow();message("");});
    dateInput.addEventListener("input",()=>{dirty=true;invalidate();renderPlacement();message("");});
    placementSelect.addEventListener("change",()=>{dirty=true;invalidate();message("");});
    find("[data-cjo-apply]").addEventListener("click",()=>{if(!applyRow())return;const state=session.status();selectedId=state.unresolvedIds[0]||selectedId;renderRow();message("Reviewed locally. Preview and confirm when all required jobs are reviewed.");});
    find("[data-cjo-preview-button]").addEventListener("click",()=>{
      if(dirty&&!applyRow())return;
      invalidate();const result=workflow.preview(session);
      if(!result.ok){message(result.error,true);return;}
      activePreview=result;const changed=result.renumbering.changed.length,range=result.renumbering.affectedRange;
      previewPanel.innerHTML=`<h4>Chronology preview</h4><p>${changed} visible labels will change${range?`; affected range ${range.from}–${range.to}`:""}.</p><ul>${result.details.slice(0,12).map(item=>`<li><strong>${esc(item.name)}</strong>: ${esc(item.before.label)} → ${esc(item.after.label)}; actual date ${esc(item.before.date||"not reviewed")} → ${esc(item.after.date)}; same-day position ${esc(item.before.order??"not reviewed")} → ${esc(item.after.order)}.</li>`).join("")}</ul>${result.details.length>12?`<p>${result.details.length-12} additional affected cuts are included in this same change.</p>`:""}<p>No change is saved until you confirm.</p>`;
      previewPanel.hidden=false;confirm.disabled=result.noOp;message(result.noOp?"No chronology change to save.":"Review the preview, then confirm this exact change.");confirm.scrollIntoView({block:"nearest"});
    });
    confirm.addEventListener("click",async()=>{
      if(!activePreview||confirm.disabled||saving||finished)return;saving=true;const preview=activePreview;
      dialog.querySelectorAll("button,input,select").forEach(control=>control.disabled=true);message("Saving chronology…");
      try{
        const result=await workflow.confirm(preview.token,{confirmed:true});dialog.dataset.cjoResult=JSON.stringify(result);
        if(result.saved===true&&result.verified===true&&!result.requiresReload){
          finished=true;const target=preview.target;
          message(target?`Chronology updated. ${target.before.label} is now ${target.after.label}.`:"Chronology updated.");
          root.renderJobs?.();find("[data-cjo-cancel]").textContent="Close";
        }else{
          invalidate();finished=result.indeterminate===true||result.requiresReload===true;
          message(finished?"Save outcome or adoption requires reload and read verification. Do not retry.":`Chronology was not saved. ${result.error||"Data changed; review again."}`,true);
        }
      }catch(error){finished=true;invalidate();message("Save could not be confirmed. Reload and read-verify; do not retry.",true);}
      finally{saving=false;if(!finished)dialog.querySelectorAll("button,input,select").forEach(control=>control.disabled=false);confirm.disabled=true;find("[data-cjo-cancel]").disabled=false;}
    });
    find("[data-cjo-cancel]").addEventListener("click",close);dialog.addEventListener("cancel",event=>{event.preventDefault();close();});
    renderRow();dialog.showModal();dateInput.focus();
  }
  document.addEventListener("click",event=>{const button=event.target?.closest?.("[data-edit-cut-chronology]");if(!button)return;event.preventDefault();event.stopPropagation();open(button.getAttribute("data-edit-cut-chronology"));});
  root.CuttingJobChronologyUi=Object.freeze({open});
})(window);
