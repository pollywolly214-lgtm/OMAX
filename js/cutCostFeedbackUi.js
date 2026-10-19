/* Cost Analysis feedback UI. Every calculation is read-only; only Save writes configuration. */
(function(){
  'use strict';
  const api=window.OMAXCutCostFeedback;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money=value=>Number.isFinite(value)?'$'+value.toFixed(2):'INSUFFICIENT DATA';
  let saving=false;
  const saved=()=>api.settings(window.appConfig?.cutCostFeedback);
  const today=()=>ymd(new Date());
  const model=()=>computeCostModel();
  function calculate(config=saved(),current=model()){
    return api.calculate({state:window,rows:current.maintenanceCostRows||[],config,today:today(),resolve:resolveEffectiveDailyCutHours});
  }
  async function saveConfig(config){
    config=api.settings(config);
    const failure=error=>({saved:false,error:String(error?.message||error)});
    if(!api.garnet(config).valid||!api.windowRange(config,today()).valid)return failure('Enter valid garnet inputs and dates.');
    if(saving||!canWriteCloud('Cut Cost configuration')||!FB.ready||!FB.user||isVercelPreviewRuntime()||window.__lastIndeterminateSave)return failure('Configuration saving is unavailable while another save or Recovery Mode is active.');
    saving=true;
    let attempted=false,acknowledged=false,reserved=false,token;
    const suspend=error=>{
      window.__autosaveDisabled=true;window.__recoveryInspectMode=true;
      window.__lastIndeterminateSave={...failure(error),indeterminate:true,operation:'Cut Cost configuration'};
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
      if(stableStringify(api.settings(source.appConfig?.cutCostFeedback))!==stableStringify(saved()))throw Error('Saved configuration changed. Reload before saving.');
      const pending=cloneStructured(source);pending.appConfig={...(source.appConfig||{}),cutCostFeedback:config};
      const sourceKey=stableStringify(source),preparedKey=stableStringify(pending);
      persistLocalStateBackup(source);
      hasPendingLocalChanges=true;reserved=true;
      const queued=cloudSaveQueue.then(()=>{
        if(!matches())return cloudSaveNoWriteFailure('cut_cost_source_changed','Configuration changed before saving.');
        attempted=true;
        return writeAuthoritativeStateSnapshot(pending,{mergeFields:['appConfig','syncMeta']},{expectedRevision:token.revision,
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
    finally{if(reserved&&!window.__lastIndeterminateSave&&lastLocalMutationAt===token.version)hasPendingLocalChanges=false;saving=false;}
  }
  function mountCosts(root,current){
    const host=root.querySelector('.cost-container');if(!host)return;
    host.insertAdjacentHTML('afterbegin',`<section class="card" data-cut-cost-calculator style="margin-bottom:16px;padding:16px">
      <h3>Calculated Cut Cost/Hr</h3><p class="small muted">Operating-cost estimate: completed maintenance + assumed hourly garnet consumption. Purchase History remains an independent spending comparison.</p>
      <div class="modal-grid">
        <label>Date window<select data-cut-cost-field="days">${[30,60,90,180].map(n=>`<option value="${n}">${n} days</option>`).join('')}<option value="custom">Custom range</option></select></label>
        <label>Start date<input type="date" data-cut-cost-field="startDate"></label><label>End date<input type="date" data-cut-cost-field="endDate"></label>
        <label>Garnet purchase price ($)<input type="number" min="0" step="any" data-cut-cost-field="purchasePrice"></label>
        <label>Shipping allocation ($)<input type="number" min="0" step="any" data-cut-cost-field="shippingCost"></label>
        <label>Garnet weight (lb)<input type="number" min="0" step="any" data-cut-cost-field="weightLb"></label>
        <label>Consumption (lb/min)<input type="number" min="0" step="any" data-cut-cost-field="consumptionLbMin"></label>
      </div><div data-cut-cost-result aria-live="polite"></div>
      <button type="button" class="btn primary" data-cut-cost-save>Save garnet settings and date window</button><span class="small" data-cut-cost-status role="status"></span>
    </section>`);
    const panel=host.querySelector('[data-cut-cost-calculator]'),inputs=[...panel.querySelectorAll('[data-cut-cost-field]')],initial=saved();
    for(const input of inputs)input.value=initial[input.dataset.cutCostField];
    const draft=()=>Object.fromEntries(inputs.map(input=>[input.dataset.cutCostField,input.dataset.cutCostField==='days'?(input.value==='custom'?'custom':Number(input.value)):input.value]));
    const update=()=>{
      const config=api.settings(draft()),result=calculate(config,current),range=api.windowRange(config,today());
      for(const input of inputs.filter(el=>['startDate','endDate'].includes(el.dataset.cutCostField))){input.disabled=config.days!=='custom';if(config.days!=='custom')input.value=range[input.dataset.cutCostField]||'';}
      const rows=[['Selected date range',range.valid?`${range.startDate} to ${range.endDate}`:'Invalid range'],['Actual cutting hours',result.actualCuttingHours===null?'INSUFFICIENT DATA':String(result.actualCuttingHours)],['Completed maintenance parts',money(result.partsCost)],['Completed maintenance labor ($30/hr)',money(result.laborCost)],['Total maintenance cost',money(result.maintenanceCost)],['Maintenance Cost/Hr',money(result.maintenanceCostPerHour)],['Garnet Cost/Hr',money(api.garnet(config).costPerHour)],['Final calculated Cut Cost/Hr',money(result.cutCostPerHour)]];
      panel.querySelector('[data-cut-cost-result]').innerHTML=`<dl>${rows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl><p class="small">${result.warnings.map(esc).join('<br>')}</p><p class="small muted">Job creation uses saved settings and freshly calculated data. Unsaved changes here do not affect new jobs.</p>`;
      panel.querySelector('[data-cut-cost-save]').disabled=saving||!api.garnet(config).valid||!range.valid||isRecoveryMode();
    };
    for(const input of inputs)input.addEventListener('input',update);
    panel.querySelector('[data-cut-cost-save]').addEventListener('click',async()=>{
      const button=panel.querySelector('[data-cut-cost-save]'),status=panel.querySelector('[data-cut-cost-status]');button.disabled=true;inputs.forEach(input=>input.disabled=true);status.textContent=' Saving…';
      const result=await saveConfig(draft());inputs.forEach(input=>input.disabled=false);update();status.textContent=result.saved?' Settings saved and verified.':' '+result.error;
    });
    update();
  }
  function mountJob(root,id){
    const input=root.querySelector('#'+id);if(!input)return;
    input.insertAdjacentHTML('afterend',`<span data-cut-cost-job><label>Cut Cost/Hr source<select data-cut-cost-source><option value="manual">Existing manual rate</option><option value="calculated">Calculated from Cost Analysis</option></select></label><span class="small" data-cut-cost-preview></span></span>`);
    const panel=input.parentElement.querySelector('[data-cut-cost-job]'),select=panel.querySelector('select'),preview=panel.querySelector('[data-cut-cost-preview]');
    let manual=input.value;
    select.addEventListener('change',()=>{
      if(select.value==='manual'){input.value=manual;delete input.dataset.calculatedCutCost;preview.textContent='Manual Cut Cost/Hr.';return;}
      manual=input.value;
      const result=calculate();preview.textContent=`${result.startDate} to ${result.endDate}: ${money(result.cutCostPerHour)}. Calculated operating-cost estimate. Edit the rate to override manually.`;
      if(!result.valid){select.value='manual';delete input.dataset.calculatedCutCost;return;}
      input.value=result.cutCostPerHour.toFixed(2);input.dataset.calculatedCutCost=String(result.cutCostPerHour);
    });
    input.addEventListener('input',()=>{select.value='manual';delete input.dataset.calculatedCutCost;manual=input.value;preview.textContent='Manual override.';});
    input.form?.addEventListener('reset',()=>{select.value='manual';delete input.dataset.calculatedCutCost;preview.textContent='';});
  }
  function jobRate(input){
    if(!input)return NaN;
    if(input.dataset.calculatedCutCost===undefined)return input.value===''?45:Number(input.value);
    const result=calculate();
    if(!result.valid||result.cutCostPerHour!==Number(input.dataset.calculatedCutCost)){
      toast('Calculated rate changed or is incomplete. Select the calculated source again to review it, or enter a manual rate.');return NaN;
    }
    return result.cutCostPerHour;
  }
  window.OMAXCutCostFeedbackUi=Object.freeze({calculate,saveConfig,mountCosts,mountJob,jobRate});
})();
