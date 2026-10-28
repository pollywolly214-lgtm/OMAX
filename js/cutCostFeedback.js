(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.OMAXCutCostFeedback=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const DEFAULTS=Object.freeze({purchasePrice:715,shippingCost:494/3,weightLb:2200,consumptionLbMin:1,days:90,startDate:'',endDate:''});
  const fields=['purchasePrice','shippingCost','weightLb','consumptionLbMin'];
  const number=value=>!['number','string'].includes(typeof value)||String(value).trim()===''?null:Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
  function date(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
    const parsed=new Date(value+'T00:00:00Z');
    return Number.isFinite(+parsed)&&parsed.toISOString().slice(0,10)===value?value:null;
  }
  const shift=(key,days)=>{const d=new Date(key+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
  function settings(value){
    if(value===undefined)return {...DEFAULTS};
    const source=value&&typeof value==='object'?value:{};
    return {...Object.fromEntries(fields.map(key=>[key,number(source[key])])),days:[30,60,90,180,'custom'].includes(source.days)?source.days:90,startDate:date(source.startDate)||'',endDate:date(source.endDate)||''};
  }
  function garnet(value){
    const config=settings(value),valid=fields.every(key=>config[key]!==null)&&config.weightLb>0;
    const deliveredPrice=valid?config.purchasePrice+config.shippingCost:null;
    const pricePerLb=valid?deliveredPrice/config.weightLb:null;
    const costPerHour=valid?pricePerLb*config.consumptionLbMin*60:null;
    return {valid:valid&&Number.isFinite(costPerHour),deliveredPrice,pricePerLb,costPerHour:Number.isFinite(costPerHour)?costPerHour:null};
  }
  function windowRange(value,today){
    const config=settings(value),endDate=config.days==='custom'?date(config.endDate):date(today);
    const startDate=config.days==='custom'?date(config.startDate):endDate?shift(endDate,1-config.days):null;
    return {startDate,endDate,valid:!!startDate&&!!endDate&&startDate<=endDate&&endDate<=today&&((new Date(endDate)-new Date(startDate))/86400000)<3660};
  }
  // totalHistory is the cumulative machine cutting-hour counter. This CCR-only
  // resolver deliberately does not use dailyCutHours or change dashboard ACH.
  function actualHours(state,startDate,endDate){
    const totals=new Map(),invalid=[],issues=[],warnings=[];
    const issue=(code,message)=>issues.push({code,message});
    for(const row of state.totalHistory||[]){
      const key=date(row?.dateISO),hours=number(row?.hours);
      if(!key||key>endDate)continue;
      if(hours===null){invalid.push(key);continue;}
      if(!totals.has(key))totals.set(key,new Set());
      totals.get(key).add(hours);
    }
    const readings=[...totals].sort(([a],[b])=>a.localeCompare(b));
    const valid=readings.filter(([,values])=>values.size===1).map(([dateISO,values])=>({dateISO,hours:[...values][0]}));
    const startReading=valid.filter(row=>row.dateISO<=startDate).at(-1)||null;
    const endReading=valid.at(-1)||null;
    if(!startReading)issue('missing_start','No valid cumulative starting reading exists on or before the requested start date.');
    if(!endReading||startReading&&endReading.dateISO<=startReading.dateISO)issue('missing_end','A valid ending cumulative reading after the starting baseline is required.');
    const lower=startReading?.dateISO||readings.filter(([key])=>key<=startDate).at(-1)?.[0]||startDate;
    // A conflicting later endpoint must not be silently skipped in favor of an older one.
    for(const [key,values] of readings)if(key>=lower&&values.size>1)issue('duplicate',`Conflicting cumulative meter readings on ${key}. Review the logged hours.`);
    for(const key of new Set(invalid.filter(key=>key>=lower)))issue('invalid',`Invalid cumulative meter value on ${key} was ignored; only valid readings define the measurement window.`);
    const measured=valid.filter(row=>row.dateISO>=lower&&row.dateISO<=(endReading?.dateISO||endDate));
    for(let index=1;index<measured.length;index++)if(measured[index].hours<measured[index-1].hours)issue('reset',`Cumulative meter decreased between ${measured[index-1].dateISO} and ${measured[index].dateISO}. Resolve the reset or historical correction before calculating a rate.`);
    const blocked=issues.some(item=>item.code!=='invalid');
    const hours=blocked?null:endReading.hours-startReading.hours;
    if(hours===0)issue('zero_hours','The measured window contains zero accumulated operating hours.');
    if(startReading&&startReading.dateISO<startDate)warnings.push(`The measurement starts at the previous cumulative reading on ${startReading.dateISO}; maintenance expenses use that same boundary.`);
    if(endReading&&endReading.dateISO<endDate)warnings.push(`Hours measured through ${endReading.dateISO}.`);
    return {hours,complete:!blocked&&hours>0,startReading,endReading,measurementStartDate:startReading?.dateISO||null,measurementEndDate:endReading?.dateISO||null,missingDays:0,missingDates:[],issues,warnings:[...warnings,...issues.map(item=>item.message)]};
  }
  function maintenanceRows(rows,state,compatibility=[],decisions=[]){
    const legacy=[...(state.tasksInterval||[]),...(state.tasksAsReq||[]),...(state.deletedItems||[]).filter(item=>item.type==='task'&&item.payload).map(item=>item.payload)],v2=state.maintenanceTasksV2||[];
    const canonical=id=>String(legacy.find(task=>String(task.id)===String(id))?.templateId||id);
    const aliases=new Map(v2.map(task=>[String(task.id),canonical(task.legacyTaskId||task.id)]));
    const streams=new Map(compatibility.filter(row=>row.sourceSystem==='v2').map(row=>[row.rootOccurrenceId,row]));
    const shadows=new Map(),shadowEventIds=new Set(),importedShadows=new Set(),roots=new Map();
    for(const event of state.maintenanceOccurrencesV2||[]){
      const root=event.rootOccurrenceId||(event.eventType==='scheduled'?event.id:event.supersedesEventId);
      if(!root)continue;
      const group=roots.get(String(root))||[];group.push(event);roots.set(String(root),group);
    }
    for(const [root,events] of roots){
      // Scheduling an independent reminder must not erase an older completion.
      if(!events.some(event=>['completed','uncompleted'].includes(event.eventType)))continue;
      const taskIds=new Set(events.map(event=>String(event.taskId||'')).filter(Boolean));
      const instanceIds=new Set(events.map(event=>String(event.instanceId||'')).filter(Boolean));
      if(taskIds.size!==1||instanceIds.size>1)continue;
      const alias=aliases.get([...taskIds][0])||canonical(events.find(event=>event.legacyTaskId)?.legacyTaskId||[...taskIds][0]);
      for(const event of events){
        const importId=event.import_event_id||event.importEventId;
        if(importId)shadowEventIds.add(alias+'|'+String(importId));
        for(const key of [event.originalDateISO,event.effectiveDateISO,event.displayDateISO,event.payload?.toDateISO])if(date(key)){
          const identity=alias+'|'+key,matched=shadows.get(identity)||new Set();matched.add(root);shadows.set(identity,matched);
          if(importId)importedShadows.add(identity);
        }
      }
    }
    const legacyPeersByDate=new Map();
    for(const row of rows)if(row.sourceSystem!=='v2'){
      const key=canonical(row.taskId)+'|'+row.dateISO,identities=legacyPeersByDate.get(key)||new Set();
      identities.add(row.historyEventId||row.sourceEventKey||'day');legacyPeersByDate.set(key,identities);
    }
    const seen=new Set(),out=[];
    for(const row of rows){
      const isV2=row.sourceSystem==='v2',stream=streams.get(row.rootOccurrenceId),alias=aliases.get(String(row.taskId))||canonical(row.taskId);
      const task=legacy.find(task=>String(task.id)===alias)||v2.find(task=>String(task.id)===String(row.taskId));
      const key=date(row.dateISO);
      const sourceEventKey=row.sourceEventKey||(isV2?'v2:'+row.rootOccurrenceId:JSON.stringify(['legacy',String(row.taskId),row.dateISO,row.historyEventId||'day']));
      const audit=(reason,result=null)=>decisions.push({sourceEventKey,sourceSystem:isV2?'v2':'legacy',taskId:row.taskId,
        historySourceTaskId:row.historySourceTaskId,historyField:row.historyField,historyIndex:row.historyIndex,historyEventId:row.historyEventId,
        rootOccurrenceId:row.rootOccurrenceId,instanceId:row.instanceId,dateISO:row.dateISO,taskName:row.taskName,
        completionStatus:row.lifecycleStatus||'completed',normalizationIncluded:!!result,exclusionReason:reason,
        parts:result?.costFields.parts,duration:result?.costFields.duration,totalCost:result&&!result.costIncomplete?result.totalCost:null,
        costClassification:result?.costIncomplete?'incomplete':result?.costEstimated?'estimated/default':result?'recorded inputs; modeled labor':'not_costed',costIncomplete:result?.costIncomplete});
      if(!key){audit('Invalid or missing business date');continue;}
      const unambiguousMirror=legacyPeersByDate.get(alias+'|'+key)?.size===1&&shadows.get(alias+'|'+key)?.size===1
        &&!row.historyImportEventId&&(!row.historyEventId||!importedShadows.has(alias+'|'+key));
      if(!isV2&&(shadowEventIds.has(alias+'|'+String(row.historyEventId||''))||unambiguousMirror)){
        audit('Mirrored legacy/V2 occurrence (explicit import identity or unique task/day lifecycle)');continue;
      }
      const identity=isV2?'v2:'+row.rootOccurrenceId:row.historyEventId?alias+'|'+key+'|'+row.historyEventId:sourceEventKey;
      if(seen.has(identity)){audit('Duplicate stable occurrence identity');continue;}seen.add(identity);
      const family=legacy.filter(member=>String(member.id)===alias||String(member.templateId||'')===alias);
      const sourceTask=legacy.find(member=>String(member.id)===String(row.historySourceTaskId||''));
      const sourceFamily=sourceTask?[sourceTask]:family;
      const allHistory=sourceFamily.flatMap(member=>member.manualHistory||[]).filter(entry=>date(entry?.dateISO||entry?.date||entry?.doneDateISO)===key);
      const sourceOccurrence=sourceTask&&row.historyField==='manualHistory'?sourceTask.manualHistory?.[row.historyIndex]:null;
      const removed=sourceFamily.some(member=>(Array.isArray(member.removedOccurrences)?member.removedOccurrences:Object.keys(member.removedOccurrences||{})).some(value=>date(value?.dateISO||value)===key));
      if(!isV2&&(removed||['removed','uncompleted','canceled','cancelled'].includes(String((sourceOccurrence||allHistory.at(-1))?.status||'').toLowerCase()))){audit('Legacy occurrence removed or reopened');continue;}
      const history=allHistory.filter(entry=>!['scheduled','removed','uncompleted','canceled','cancelled'].includes(String(entry.status||'').toLowerCase()));
      const occurrence=history.filter(entry=>entry.source==='cut_cost_correction').sort((a,b)=>String(a.recordedAtISO||'').localeCompare(String(b.recordedAtISO||''))).at(-1)||history.find(entry=>row.historyEventId&&String(entry.import_event_id||entry.id)===String(row.historyEventId))||(sourceOccurrence&&date(sourceOccurrence.dateISO||sourceOccurrence.date||sourceOccurrence.doneDateISO)===key?sourceOccurrence:null)||history.at(-1)||{};
      const durationTask=sourceFamily.find(member=>number(member.occurrenceHours?.[key])!==null)||task;
      const rawParts=isV2?stream?.partsCostSnapshot:occurrence.partsCostSnapshot??occurrence.partsCost??occurrence.calendarPrice;
      const configuredTasks=[sourceTask,task,v2.find(member=>String(member.id)===String(row.taskId))].filter(Boolean);
      const configuredParts=configuredTasks.flatMap(member=>[member.price,member.cost,member.calendarPrice]).map(number).find(value=>value!==null);
      const parts=number(rawParts)??number(configuredParts)??number(stream?.costRef);
      // Exact occurrence evidence precedes task/date overrides and matching
      // Settings. Missing or invalid values fall through; explicit zero does not.
      const recordedHours=(isV2?[stream?.loggedHours]:[occurrence.loggedHours,occurrence.timeHours,occurrence.hours,durationTask?.occurrenceHours?.[key]]).map(number).find(value=>value!==null);
      const configuredHours=configuredTasks.map(member=>number(member.downtimeHours)).find(value=>value!==null);
      const hours=recordedHours??configuredHours??0;
      const garnetMaterial=!/\b(?:valve|tube|nozzle|liner|hose|seal|inspection|repair|replacement|replace)\b/i.test(row.taskName||task?.name||'')&&/\b(?:garnet|abrasive)\b/i.test(row.taskName||task?.name||'')&&(/\b(?:refill|replenish|purchase|load|add|consumption|fill)\b/i.test(row.taskName||task?.name||'')||/^(?:garnet|abrasive)(?: material)?$/i.test(row.taskName||task?.name||''));
      const partCost=garnetMaterial?0:parts;
      const incomplete=partCost===null;
      const repairTask=sourceFamily.find(member=>number(member.occurrenceHours?.[key])!==null)||sourceFamily.find(member=>(member.manualHistory||[]).includes(occurrence))||sourceFamily.find(member=>(member.completedDates||[]).includes(key))||task;
      const costFields={parts:{value:partCost,source:garnetMaterial?'Hourly garnet formula':number(rawParts)!==null?'Occurrence-specific':'Configured default'},duration:{value:hours,source:recordedHours!=null?'Occurrence-specific':configuredHours!=null?'Configured default':'Zero-hour fallback'}};
      const importedSource=stream?.provenance?.importProvenance?.sourceRecord;
      const estimated=number(rawParts)===null||recordedHours==null||(importedSource&&number(importedSource.parts_cost_snapshot)===null&&!(state.maintenanceOccurrencesV2||[]).some(event=>event.rootOccurrenceId===row.rootOccurrenceId&&event.source==='cut_cost_correction'));
      const costExclusionReason=incomplete?'Missing parts price':'';
      const result={...row,sourceEventKey,costExclusionReason,maintenanceHrs:hours??0,partCost:partCost??0,chargeRate:30,laborCost:(hours??0)*30,totalCost:(partCost??0)+(hours??0)*30,costIncomplete:incomplete,costEstimated:Boolean(estimated),costFields,repairTaskId:repairTask?.id??row.taskId,garnetMaterialExcluded:garnetMaterial};
      out.push(result);audit(costExclusionReason,result);
    }
    return out;
  }
  function calculate({state,rows,config,today,resolve}){
    const range=windowRange(config,today),abrasive=garnet(config),warnings=['Calculated operating-cost estimate: garnet consumption is assumed; configured maintenance values are estimates.'];
    if(!range.valid)return {...range,valid:false,actualCuttingHours:null,cutCostPerHour:null,warnings:[...warnings,'Choose a valid date window ending no later than today.']};
    const hours=actualHours(state,range.startDate,range.endDate);
    const hasWindow=hours.measurementStartDate&&hours.measurementEndDate>hours.measurementStartDate;
    // Without endpoints retain the requested-window repair list, but never offer a rate.
    const events=rows.filter(row=>hasWindow?row.dateISO>hours.measurementStartDate&&row.dateISO<=hours.measurementEndDate:row.dateISO>=range.startDate&&row.dateISO<=range.endDate);
    const completeEvents=events.filter(row=>!row.costIncomplete);
    const partsCost=completeEvents.reduce((sum,row)=>sum+row.partCost,0),laborCost=completeEvents.reduce((sum,row)=>sum+row.laborCost,0),maintenanceCost=partsCost+laborCost;
    const incomplete=events.filter(row=>row.costIncomplete).length,estimated=events.filter(row=>row.costEstimated).length;
    if(incomplete)warnings.push(`${incomplete} completed maintenance event(s) lack a parts price.`);
    if(!events.length)warnings.push('No completed maintenance events were found in this window. Confirm that maintenance history is complete.');
    if(estimated)warnings.push(`${estimated} completed maintenance event(s) use configured/default parts or duration.`);
    if(events.some(row=>row.garnetMaterialExcluded))warnings.push('Garnet refill/purchase material is excluded from maintenance; its labor remains included.');
    if(!abrasive.valid)warnings.push('Enter nonnegative garnet inputs and a weight greater than zero.');
    const maintenanceCostPerHour=hours.complete&&!incomplete?maintenanceCost/hours.hours:null;
    const cutCostPerHour=hours.complete&&!incomplete&&abrasive.valid?maintenanceCostPerHour+abrasive.costPerHour:null;
    const valid=Number.isFinite(cutCostPerHour);
    return {...range,valid,measurementStartDate:hasWindow?hours.measurementStartDate:null,measurementEndDate:hasWindow?hours.measurementEndDate:null,startReading:hours.startReading,endReading:hours.endReading,actualCuttingHours:hours.hours,partsCost,laborCost,maintenanceCost,maintenanceCostPerHour,garnetCostPerHour:abrasive.costPerHour,cutCostPerHour:valid?cutCostPerHour:null,eventCount:events.length,dataCompleteness:{missingDays:0,meterIssues:hours.issues.length,incompleteEvents:incomplete,estimatedEvents:estimated},review:{missingMaintenance:events.filter(row=>row.costIncomplete),defaultedMaintenance:events.filter(row=>row.costEstimated),missingDates:[],meterIssues:hours.issues},warnings:[...warnings,...hours.warnings]};
  }
  return Object.freeze({DEFAULTS,settings,garnet,windowRange,actualHours,maintenanceRows,calculate});
});
