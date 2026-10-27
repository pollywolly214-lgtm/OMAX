/* Cost Analysis feedback UI. Every calculation is read-only; only Save writes configuration. */
(function(){
  'use strict';
  const api=window.OMAXCutCostFeedback;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money=value=>Number.isFinite(value)?'$'+value.toFixed(2):'INSUFFICIENT DATA';
  let saving=false;
  const jobControllers=new WeakMap();
  const saved=()=>api.settings(window.appConfig?.cutCostFeedback);
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const model=()=>computeCostModel();
  function calculate(config=saved(),current=model()){
    return api.calculate({state:window,rows:current.maintenanceCostRows||[],config,today:current.financialReconciliation?.window.endISO||today(),resolve:resolveEffectiveDailyCutHours});
  }
  async function saveChange(build,label="Cut Cost configuration"){
    const failure=error=>({saved:false,error:String(error?.message||error)});
    if(saving||!canWriteCloud('Cut Cost configuration')||!FB.ready||!FB.user||isVercelPreviewRuntime()||window.__lastIndeterminateSave)return failure('Configuration saving is unavailable while another save or Recovery Mode is active.');
    saving=true;
    const firebaseOperation=window.OMAXFirebaseOperations?.begin("saving");
    let attempted=false,acknowledged=false,reserved=false,token;
    const suspend=error=>{
      window.__autosaveDisabled=true;window.__recoveryInspectMode=true;
      window.__lastIndeterminateSave={...failure(error),indeterminate:true,operation:label};
      renderRecoveryDiagnosticsPanel();return window.__lastIndeterminateSave;
    };
    try{
      await cloudSaveQueue;
      if(hasPendingLocalChanges)throw Error('Other edits are pending. Save or reload them before saving configuration.');
      token={db:FB.db,ref:FB.docRef,actor:FB.user.uid,project:FB.app?.options?.projectId,version:lastLocalMutationAt,revision:window.__loadedCloudRevisionForSaveGuard};
      const matches=()=>FB.ready&&FB.db===token.db&&FB.docRef===token.ref&&FB.user?.uid===token.actor&&FB.app?.options?.projectId===token.project&&lastLocalMutationAt===token.version&&window.__loadedCloudRevisionForSaveGuard===token.revision&&canWriteCloud('Cut Cost configuration');
      const read=async()=>{
        let timer;
        try{return await Promise.race([token.db.runTransaction(async tx=>{
          const snapshot=await tx.get(token.ref);
          if(!matches()||!snapshot?.exists||snapshot.metadata?.fromCache||snapshot.metadata?.hasPendingWrites)throw Error('Authoritative configuration evidence is unavailable or the workspace changed.');
          return snapshot.data();
        }),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Configuration verification timed out.')),15000);})]);}
        finally{clearTimeout(timer);}
      };
      const source=await read();
      if(source.syncMeta?.rev!==token.revision||!matches()||hasPendingLocalChanges)throw Error('Configuration revision changed. Reload before saving.');
      const {pending,fields,exactHours=false}=build(source);
      const sourceKey=stableStringify(source),preparedKey=stableStringify(pending);
      persistLocalStateBackup(source);
      hasPendingLocalChanges=true;reserved=true;
      const queued=cloudSaveQueue.then(()=>{
        if(!matches())return cloudSaveNoWriteFailure('cut_cost_source_changed','Configuration changed before saving.');
        attempted=true;
        return writeAuthoritativeStateSnapshot(pending,{mergeFields:[...fields,'syncMeta']},{expectedRevision:token.revision,preserveExactDailyCutHours:exactHours,
          validateSourceState:remote=>matches()&&stableStringify(remote)===sourceKey,
          validatePreparedState:next=>matches()&&stableStringify(next)===preparedKey});
      });
      cloudSaveQueue=queued.catch(()=>{});
      const result=await queued;
      acknowledged=result?.saved===true&&result.stateWriteCompleted===true;
      if(!acknowledged){
        if(result?.indeterminate||(result?.stateWriteAttempted&&!result?.definiteFailure))return suspend(result.error||'Configuration save outcome is uncertain.');
        attempted=false;return failure(result?.error||'Configuration was not saved.');
      }
      const committed=result.committedState,verified=await read();
      const expected={...pending,syncMeta:committed?.syncMeta};
      if(!committed||committed.syncMeta?.rev<=token.revision||stableStringify(committed)!==stableStringify(expected)||stableStringify(verified)!==stableStringify(committed)||!matches())return suspend('Configuration readback differs from the acknowledged save. Reload and review.');
      const adopted=adoptIdentityCheckedAuthoritativeState(verified);
      if(!adopted?.loaded||adopted.recovery)return suspend('Verified configuration could not be adopted safely.');
      persistLocalStateBackup(verified);
      return {saved:true,verificationCompleted:true};
    }catch(error){return attempted||acknowledged?suspend(error):failure(error);}
    finally{try{if(reserved&&!window.__lastIndeterminateSave&&lastLocalMutationAt===token.version)hasPendingLocalChanges=false;}finally{saving=false;firebaseOperation?.release();}}
  }
  async function saveConfig(config){
    config=api.settings(config);
    if(!api.garnet(config).valid||!api.windowRange(config,today()).valid)return {saved:false,error:'Enter valid garnet inputs and dates.'};
    return saveChange(source=>{
      if(stableStringify(api.settings(source.appConfig?.cutCostFeedback))!==stableStringify(saved()))throw Error('Saved configuration changed. Reload before saving.');
      const pending=cloneStructured(source);pending.appConfig={...(source.appConfig||{}),cutCostFeedback:config};return {pending,fields:['appConfig']};
    });
  }
  const saveRepair=(target,values)=>saveChange(source=>window.OMAXCutCostRepair.planMaintenance(source,target,values,{id:genId('cost_correction'),atISO:new Date().toISOString(),actor:FB.user.uid}),'Maintenance occurrence correction');
  const saveHours=entries=>saveChange(source=>({...window.OMAXCutCostRepair.planHours(source,entries,new Date().toISOString()),exactHours:true}),'Daily cutting hours correction');
  function dialog(title,attribute){
    document.querySelector('dialog['+attribute+']')?.remove();
    const modal=document.createElement('dialog');modal.className='cost-data-center-panel cut-cost-surface';modal.setAttribute(attribute,'');
    modal.innerHTML=`<div class="cost-data-center-header"><h3>${esc(title)}</h3><button type="button" data-cut-cost-close>Close</button></div><div data-cut-cost-dialog-body></div>`;
    modal.querySelector('[data-cut-cost-close]').onclick=()=>modal.close();modal.addEventListener('close',()=>modal.remove());document.body.appendChild(modal);modal.showModal();return modal;
  }
  function openHours(dateISO){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dateISO))return;
    document.querySelector('dialog[data-cut-cost-review]')?.close();
    const date=parseDateLocal(dateISO),now=new Date(),offset=(date.getFullYear()-now.getFullYear())*12+date.getMonth()-now.getMonth();
    window.__calendarMonthOffset=Math.min(12,Math.max(-12,offset));location.hash='#/';
    const focus=()=>{
      renderDashboard();
      // Keep the existing calendar editor's password prompt and pending-hours flow.
      if(!isCalendarHoursEditing())document.getElementById('calendarHoursEditBtn')?.click();
      if(!isCalendarHoursEditing())return;
      window.__cutCostHourRepair=true;
      const cell=document.querySelector(`[data-date-iso="${dateISO}"]`);cell?.scrollIntoView({block:'center'});cell?.classList.add('is-highlighted');
      promptCalendarDayHours(dateISO);
    };
    requestAnimationFrame(focus);
  }
  function editOccurrence(row,onSaved){
    let target;
    try{target=window.OMAXCutCostRepair.describe(window,row);}catch(error){toast(error.message);return;}
    const modal=dialog('Correct maintenance occurrence','data-cut-cost-editor'),body=modal.querySelector('[data-cut-cost-dialog-body]');
    body.innerHTML=`<p><strong>${esc(row.taskName)}</strong> · ${esc(row.dateISO)}</p><p class="small">Correct this completed occurrence only. Task defaults and other occurrences remain unchanged. Enter zero when appropriate.</p>
      <form data-cut-cost-repair-form><div class="modal-grid"><label>Actual duration (hours)<input data-cut-cost-duration type="number" min="0" step="any" required value="${esc(row.costFields?.duration.value??'')}"></label><label>Occurrence parts cost ($)<input data-cut-cost-parts type="number" min="0" step="any" required value="${esc(row.costFields?.parts.value??'')}"></label></div>
      <p data-cut-cost-repair-status role="status"></p><button class="btn primary" type="submit">Save occurrence correction</button></form>`;
    const form=body.querySelector('form');form.addEventListener('submit',async event=>{
      event.preventDefault();const values={duration:form.querySelector('[data-cut-cost-duration]').value,parts:form.querySelector('[data-cut-cost-parts]').value};
      form.querySelectorAll('input,button').forEach(el=>el.disabled=true);modal.querySelector('[data-cut-cost-close]').disabled=true;
      const status=form.querySelector('[data-cut-cost-repair-status]');status.textContent='Saving and verifying…';
      const result=await saveRepair(target,values);
      if(result.saved&&result.verificationCompleted){modal.close();onSaved();return;}
      status.textContent=result.error||'The correction was not verified.';
      form.querySelectorAll('input,button').forEach(el=>el.disabled=isRecoveryMode());modal.querySelector('[data-cut-cost-close]').disabled=false;
    });
    modal.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  }
  function showReview(config){
    const result=calculate(config),review=result.review||{missingMaintenance:[],defaultedMaintenance:[],missingDates:[]};
    const modal=dialog('Review Missing Data','data-cut-cost-review'),body=modal.querySelector('[data-cut-cost-dialog-body]'),editable=[];
    const rows=list=>list.map(row=>{
      const index=editable.push(row)-1,fields=Object.entries(row.costFields||{}).map(([name,field])=>`${name==='parts'?'Parts cost':'Duration'}: ${field.value===null?'Missing':name==='parts'?money(field.value):field.value+' hr'} (${field.value===null?'No value':field.source})`).join('; ');
      return `<tr><td>${esc(row.taskName)}</td><td>${esc(row.dateISO)}</td><td>${esc(fields)}</td><td><button type="button" data-cut-cost-edit="${index}">Edit occurrence</button></td></tr>`;
    }).join('');
    const group=(title,list,note)=>`<section><h4>${esc(title)} (${list.length})</h4>${note?`<p class="small">${esc(note)}</p>`:''}${list.length?`<div class="cut-cost-table-wrap"><table class="cost-table"><thead><tr><th>Task</th><th>Occurrence date</th><th>Field, current value and source</th><th>Action</th></tr></thead><tbody>${rows(list)}</tbody></table></div>`:'<p>None in the selected window.</p>'}</section>`;
    body.innerHTML=`<p>${esc(result.startDate)} to ${esc(result.endDate)}</p>${group('Missing maintenance information',review.missingMaintenance)}${group('Maintenance using configured defaults',review.defaultedMaintenance,'Valid configured defaults may be kept. These are estimates, not automatically errors.')}
      <section><h4>Cumulative meter review (${(review.meterIssues||[]).length})</h4><p class="small">Two valid cumulative readings define the measurement window. Weekly or irregular logs are sufficient; daily entries are not required.</p><ul class="cut-cost-date-list">${(review.meterIssues||[]).map(item=>`<li>${esc(item.message)}</li>`).join('')||'<li>None in the selected window.</li>'}</ul><button type="button" data-cut-cost-meter-history>Review logged meter hours</button></section>`;
    for(const button of body.querySelectorAll('[data-cut-cost-edit]'))button.onclick=()=>editOccurrence(editable[Number(button.dataset.cutCostEdit)],()=>{modal.close();renderCosts();showReview(config);toast('Occurrence correction saved and server-verified.');});
    body.querySelector('[data-cut-cost-meter-history]').onclick=()=>{modal.close();location.hash='#/';requestAnimationFrame(()=>{renderDashboard();document.getElementById('editLogHistoryBtn')?.click();});};
  }
  function mountCosts(root,current){
    const host=root.querySelector('[data-cost-window="cutCostFeedback"]');if(!host||host.querySelector('[data-cut-cost-calculator]'))return;
    host.insertAdjacentHTML('afterbegin',`<section class="block cut-cost-surface cut-cost-card" data-cut-cost-calculator>
      <div class="cut-cost-summary"><h3>Calculated Cut Cost/Hr<br><strong data-cut-cost-summary-rate></strong></h3><div>Maintenance Cost/Hr<br><strong data-cut-cost-summary-maintenance></strong></div><div>Garnet Cost/Hr<br><strong data-cut-cost-summary-garnet></strong></div><div><span data-cut-cost-summary-window></span><br><span data-cut-cost-measurement-window></span><br><span data-cut-cost-measured-through></span><br><span data-cut-cost-summary-status role="status"></span></div><div class="cut-cost-actions"><button type="button" data-cut-cost-configure aria-expanded="false">Configure</button><button type="button" data-cut-cost-review-open hidden>Review Missing Data</button></div></div>
      <div data-cut-cost-config hidden><p class="small">Operating-cost estimate: completed maintenance + assumed garnet consumption. Purchase History remains an independent spending comparison.</p><div class="modal-grid">
        <label>Date window<select data-cut-cost-field="days">${[30,60,90,180].map(n=>`<option value="${n}">${n} days</option>`).join('')}<option value="custom">Custom range</option></select></label><label>Start date<input type="date" data-cut-cost-field="startDate"></label><label>End date<input type="date" data-cut-cost-field="endDate"></label>
        <label>Garnet purchase price ($)<input type="number" min="0" step="any" data-cut-cost-field="purchasePrice"></label><label>Shipping allocation ($)<input type="number" min="0" step="any" data-cut-cost-field="shippingCost"></label><label>Garnet weight (lb)<input type="number" min="0" step="any" data-cut-cost-field="weightLb"></label><label>Consumption (lb/min)<input type="number" min="0" step="any" data-cut-cost-field="consumptionLbMin"></label>
      </div><div data-cut-cost-result aria-live="polite"></div><button type="button" class="btn primary" data-cut-cost-save>Save garnet settings and date window</button><span class="small" data-cut-cost-status role="status"></span></div></section>`);
    const panel=host.querySelector('[data-cut-cost-calculator]'),inputs=[...panel.querySelectorAll('[data-cut-cost-field]')],initial=window.__cutCostFeedbackDraft||saved();
    for(const input of inputs)input.value=initial[input.dataset.cutCostField];
    const draft=()=>Object.fromEntries(inputs.map(input=>[input.dataset.cutCostField,input.dataset.cutCostField==='days'?(input.value==='custom'?'custom':Number(input.value)):input.value]));
    const update=()=>{
      const config=api.settings(draft()),result=calculate(config,current),range=api.windowRange(config,today());
      for(const input of inputs.filter(el=>['startDate','endDate'].includes(el.dataset.cutCostField))){input.disabled=config.days!=='custom';if(config.days!=='custom')input.value=range[input.dataset.cutCostField]||'';}
      panel.querySelector('[data-cut-cost-summary-rate]').textContent=money(result.cutCostPerHour);panel.querySelector('[data-cut-cost-summary-maintenance]').textContent=money(result.maintenanceCostPerHour);panel.querySelector('[data-cut-cost-summary-garnet]').textContent=money(api.garnet(config).costPerHour);
      panel.querySelector('[data-cut-cost-summary-window]').textContent=range.valid?`Requested: ${range.startDate} to ${range.endDate}`:'Invalid date window';
      panel.querySelector('[data-cut-cost-measurement-window]').textContent=result.measurementStartDate?`Measured: ${result.measurementStartDate} to ${result.measurementEndDate}`:'Measurement window unavailable';
      panel.querySelector('[data-cut-cost-measured-through]').textContent=result.measurementEndDate&&result.measurementEndDate<range.endDate?`Hours measured through ${result.measurementEndDate}.`:'';
      panel.querySelector('[data-cut-cost-summary-status]').textContent=result.valid?'Calculated operating-cost estimate':'INSUFFICIENT DATA';
      const completeness=result.dataCompleteness||{};panel.querySelector('[data-cut-cost-review-open]').hidden=!(completeness.meterIssues||completeness.incompleteEvents||completeness.estimatedEvents);
      const rows=[['Requested window',`${range.startDate} to ${range.endDate}`],['Actual measurement window',result.measurementStartDate?`${result.measurementStartDate} to ${result.measurementEndDate} (expenses after start through end inclusive)`:'Unavailable'],['Cumulative meter readings',result.startReading&&result.endReading?`${result.startReading.hours} to ${result.endReading.hours} hr`:'Unavailable'],['Actual cutting hours',result.actualCuttingHours==null?'INSUFFICIENT DATA':String(result.actualCuttingHours)],['Completed maintenance parts',money(result.partsCost)],['Completed maintenance labor ($30/hr)',money(result.laborCost)],['Total maintenance cost',money(result.maintenanceCost)],['Maintenance Cost/Hr',money(result.maintenanceCostPerHour)],['Garnet Cost/Hr',money(api.garnet(config).costPerHour)],['Final calculated Cut Cost/Hr',money(result.cutCostPerHour)]];
      panel.querySelector('[data-cut-cost-result]').innerHTML=`<dl class="cut-cost-breakdown">${rows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl><p class="small">${result.warnings.map(esc).join('<br>')}</p><p class="small">Job creation uses saved settings. Unsaved changes here do not affect new jobs.</p>`;
      panel.querySelector('[data-cut-cost-save]').disabled=saving||!api.garnet(config).valid||!range.valid||isRecoveryMode();
    };
    panel.querySelector('[data-cut-cost-configure]').onclick=event=>{const config=panel.querySelector('[data-cut-cost-config]');config.hidden=!config.hidden;event.currentTarget.setAttribute('aria-expanded',String(!config.hidden));event.currentTarget.textContent=config.hidden?'Configure':'Hide configuration';};
    panel.querySelector('[data-cut-cost-review-open]').onclick=()=>showReview(api.settings(draft()));
    for(const input of inputs)input.addEventListener('input',()=>{window.__cutCostFeedbackDraft=draft();update();});
    panel.querySelector('[data-cut-cost-save]').addEventListener('click',async()=>{
      const button=panel.querySelector('[data-cut-cost-save]'),status=panel.querySelector('[data-cut-cost-status]');button.disabled=true;inputs.forEach(input=>input.disabled=true);status.textContent=' Saving and verifying…';
      const result=await saveConfig(draft());inputs.forEach(input=>input.disabled=false);if(result.saved)delete window.__cutCostFeedbackDraft;update();status.textContent=result.saved?' Settings saved and verified.':' '+result.error;
      if(result.saved)panel.dispatchEvent(new Event('cut-cost-settings-saved'));
    });update();
  }

  function mountJob(root,id){
    const input=root.querySelector('#'+id);if(!input||jobControllers.has(input))return;
    const infoId=id+'CutCostInfo';
    input.insertAdjacentHTML('afterend',`<span data-cut-cost-job><label>Cut Cost/Hr source<select data-cut-cost-source><option value="manual">Manual Override</option><option value="calculated">Calculated from Cost Analysis</option></select></label><button type="button" class="chart-info-button" data-cut-cost-info-open aria-label="About this job's Cut Cost/Hr" aria-controls="${infoId}" aria-expanded="false">i</button><span class="small" data-cut-cost-preview role="status"></span><div class="cut-cost-job-info" data-cut-cost-info id="${infoId}" popover="auto" role="note"></div></span>`);
    const panel=input.parentElement.querySelector('[data-cut-cost-job]'),select=panel.querySelector('select'),preview=panel.querySelector('[data-cut-cost-preview]'),info=panel.querySelector('[data-cut-cost-info]'),button=panel.querySelector('[data-cut-cost-info-open]');
    let manual=input.value,overridden=false,pinned=false;
    const details=result=>{
      info.innerHTML=`<strong>Cost Analysis operating-cost estimate</strong><p>Maintenance Cost/Hr: ${esc(money(result.maintenanceCostPerHour))}<br>Garnet Cost/Hr: ${esc(money(result.garnetCostPerHour))}<br>Calculated Cut Cost/Hr: ${esc(money(result.cutCostPerHour))}</p><p>Saved requested window: ${esc(result.startDate||'unavailable')} to ${esc(result.endDate||'unavailable')}<br>Measurement window: ${esc(result.measurementStartDate||'unavailable')} to ${esc(result.measurementEndDate||'unavailable')}</p><p>The numerical rate is saved with this job and will not change afterward. You can enter a manual override.</p>${result.valid?'':`<p>${(result.warnings||[]).map(esc).join('<br>')}</p>`}`;
    };
    const usable=result=>result.valid&&Number.isFinite(result.cutCostPerHour)&&result.cutCostPerHour>0&&Number(result.cutCostPerHour.toFixed(2))>0;
    const choose=()=>{
      const result=calculate();details(result);
      if(!usable(result)){select.value='manual';delete input.dataset.calculatedCutCost;input.value=manual;preview.textContent='Calculated rate unavailable; using manual/default.';if(result.valid)info.insertAdjacentHTML('beforeend','<p>A calculated rate must exceed $0.00 to populate a new job.</p>');return;}
      select.value='calculated';input.value=result.cutCostPerHour.toFixed(2);input.dataset.calculatedCutCost=String(result.cutCostPerHour);preview.textContent='';
    };
    const preserve=rate=>{
      manual=input.value;overridden=true;delete input.dataset.calculatedCutCost;select.value='manual';preview.textContent='';
      if(Number.isFinite(Number(rate))&&Number(rate)>0&&input.value===Number(rate).toFixed(2)){input.dataset.calculatedCutCost=String(rate);select.value='calculated';overridden=false;}
      const result=calculate();details(result);if(!usable(result))preview.textContent='Calculated rate unavailable; using manual/default.';
    };
    jobControllers.set(input,{refresh(){if(!overridden)choose();},preserve});
    select.addEventListener('change',()=>{
      if(select.value==='manual'){input.value=manual;preserve();return;}
      manual=input.value;overridden=false;choose();
    });
    input.addEventListener('input',()=>preserve());
    input.form?.addEventListener('reset',()=>Promise.resolve().then(()=>{manual=input.value;overridden=false;choose();}));
    const show=()=>{const result=calculate();details(result);if(result.valid&&!usable(result))info.insertAdjacentHTML('beforeend','<p>A calculated rate must exceed $0.00 to populate a new job.</p>');info.showPopover();const rect=button.getBoundingClientRect(),width=info.getBoundingClientRect().width;info.style.left=Math.max(8,Math.min(rect.left,innerWidth-width-8))+'px';info.style.top=Math.max(8,Math.min(rect.bottom+6,innerHeight-info.getBoundingClientRect().height-8))+'px';};
    button.addEventListener('pointerenter',show);
    button.addEventListener('pointerleave',()=>{if(!pinned)info.hidePopover();});
    button.addEventListener('click',()=>{if(pinned){info.hidePopover();pinned=false;}else{show();pinned=true;}});
    info.addEventListener('toggle',()=>{const open=info.matches(':popover-open');button.setAttribute('aria-expanded',String(open));if(!open)pinned=false;});
    const draft=id==='jobCostRate'?window.jobAddDraft:null;
    if(draft&&Object.hasOwn(draft,'costRate'))preserve(draft.calculatedCutCost);else choose();
  }
  function refreshJob(input,options){const controller=input&&jobControllers.get(input);if(options?.preserve)controller?.preserve(options.calculatedRate);else controller?.refresh();}
  function jobRate(input){
    if(!input)return NaN;
    if(input.dataset.calculatedCutCost===undefined)return input.value===''?45:Number(input.value);
    const result=calculate();
    if(!result.valid||result.cutCostPerHour<=0||result.cutCostPerHour!==Number(input.dataset.calculatedCutCost)){
      toast('Calculated rate changed or is incomplete. Select the calculated source again to review it, or enter a manual rate.');return NaN;
    }
    return result.cutCostPerHour;
  }
  window.OMAXCutCostFeedbackUi=Object.freeze({calculate,saveConfig,saveRepair,saveHours,mountCosts,mountJob,refreshJob,jobRate});
})();
