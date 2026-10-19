(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.OMAXCutCostFeedback=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const DEFAULTS=Object.freeze({purchasePrice:715,shippingCost:494/3,weightLb:2200,consumptionLbMin:1,days:90,startDate:'',endDate:''});
  const fields=['purchasePrice','shippingCost','weightLb','consumptionLbMin'];
  const number=value=>value===null||value===undefined||String(value).trim()===''?null:Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
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
  // Validate evidence before using the existing ACH resolver. Missing days are unknown,
  // and sparse/clamped meter deltas must not masquerade as a day's actual cutting.
  function actualHours(state,startDate,endDate,resolve){
    const warnings=[],missingDates=[],daily=new Map(),totals=new Map(),bad=new Set();
    for(const row of state.dailyCutHours||[]){
      const key=date(row?.dateISO||row?.date||row?.dateIso),hours=number(row?.hours);
      if(!key)continue;
      if(hours===null||hours>24){bad.add(key);continue;}
      const prior=daily.get(key);
      if(!prior||row.source==='manual'||prior.source!=='manual')daily.set(key,{...row,dateISO:key,hours});
    }
    for(const row of state.totalHistory||[]){
      const key=date(row?.dateISO),hours=number(row?.hours);
      if(!key)continue;
      if(hours===null||(totals.has(key)&&totals.get(key)!==hours)){bad.add(key);continue;}
      totals.set(key,hours);
    }
    const effective=resolve([...daily.values()],[...totals].map(([dateISO,hours])=>({dateISO,hours})),shift(startDate,-1),endDate);
    let hours=0,missing=0;
    for(let key=startDate;key<=endDate;key=shift(key,1)){
      const row=daily.get(key),previous=totals.get(shift(key,-1)),current=totals.get(key);
      const manual=row?.source==='manual';
      const metered=previous!==undefined&&current!==undefined&&current>=previous&&current-previous<=24&&!bad.has(shift(key,-1));
      // Daily-only automatic entries have no auditable interval baseline.
      if(bad.has(key)||(!manual&&!metered)){missing++;missingDates.push(key);continue;}
      const value=manual?row.hours:effective.get(key);
      if(!Number.isFinite(value)||value<0||value>24){missing++;missingDates.push(key);continue;}
      hours+=value;
    }
    if(missing)warnings.push(`${missing} day(s) lack trustworthy actual hours. Enter explicit daily hours (including zero) or adjacent daily meter readings. Sparse readings and history retention may limit coverage.`);
    if(!missing&&hours===0)warnings.push('The selected window contains zero cutting hours.');
    return {hours:missing?null:hours,missingDays:missing,missingDates,complete:!missing&&hours>0,warnings};
  }
  function maintenanceRows(rows,state,compatibility=[]){
    const legacy=[...(state.tasksInterval||[]),...(state.tasksAsReq||[]),...(state.deletedItems||[]).filter(item=>item.type==='task'&&item.payload).map(item=>item.payload)],v2=state.maintenanceTasksV2||[];
    const canonical=id=>String(legacy.find(task=>String(task.id)===String(id))?.templateId||id);
    const aliases=new Map(v2.map(task=>[String(task.id),canonical(task.legacyTaskId||task.id)]));
    const streams=new Map(compatibility.filter(row=>row.sourceSystem==='v2').map(row=>[row.rootOccurrenceId,row]));
    const shadows=new Set();
    for(const event of state.maintenanceOccurrencesV2||[]){
      const alias=aliases.get(String(event.taskId))||canonical(event.legacyTaskId||event.taskId);
      for(const key of [event.originalDateISO,event.effectiveDateISO,event.displayDateISO,event.payload?.toDateISO])if(date(key))shadows.add(alias+'|'+key);
    }
    const seen=new Set(),out=[];
    for(const row of rows){
      const isV2=row.sourceSystem==='v2',stream=streams.get(row.rootOccurrenceId),alias=aliases.get(String(row.taskId))||canonical(row.taskId);
      const task=legacy.find(task=>String(task.id)===alias)||v2.find(task=>String(task.id)===String(row.taskId));
      const key=date(row.dateISO);if(!key)continue;
      if(!isV2&&shadows.has(alias+'|'+key))continue;
      const identity=isV2?'v2:'+row.rootOccurrenceId:alias+'|'+key;
      if(seen.has(identity))continue;seen.add(identity);
      const family=legacy.filter(member=>String(member.id)===alias||String(member.templateId||'')===alias);
      const allHistory=family.flatMap(member=>member.manualHistory||[]).filter(entry=>date(entry?.dateISO||entry?.date)===key);
      const removed=family.some(member=>(Array.isArray(member.removedOccurrences)?member.removedOccurrences:Object.keys(member.removedOccurrences||{})).some(value=>date(value?.dateISO||value)===key));
      if(!isV2&&(removed||['removed','uncompleted','canceled','cancelled'].includes(String(allHistory.at(-1)?.status||'').toLowerCase())))continue;
      const history=allHistory.filter(entry=>!['scheduled','removed','uncompleted','canceled','cancelled'].includes(String(entry.status||'').toLowerCase()));
      const occurrence=history.filter(entry=>entry.source==='cut_cost_correction').sort((a,b)=>String(a.recordedAtISO||'').localeCompare(String(b.recordedAtISO||''))).at(-1)||history.at(-1)||{};
      const durationTask=family.find(member=>number(member.occurrenceHours?.[key])!==null)||task;
      const rawParts=isV2?stream?.partsCostSnapshot:occurrence.partsCostSnapshot??occurrence.partsCost??occurrence.calendarPrice;
      const configuredParts=task?.price??task?.cost??task?.calendarPrice;
      const parts=number(rawParts)??number(configuredParts)??number(stream?.costRef);
      const occurrenceHours=isV2?stream?.loggedHours:durationTask?.occurrenceHours?.[key]??occurrence.loggedHours??occurrence.timeHours??occurrence.hours;
      const hours=number(occurrenceHours)??number(task?.downtimeHours);
      const garnetMaterial=!/\b(?:valve|tube|nozzle|liner|hose|seal|inspection|repair|replacement|replace)\b/i.test(row.taskName||task?.name||'')&&/\b(?:garnet|abrasive)\b/i.test(row.taskName||task?.name||'')&&(/\b(?:refill|replenish|purchase|load|add|consumption|fill)\b/i.test(row.taskName||task?.name||'')||/^(?:garnet|abrasive)(?: material)?$/i.test(row.taskName||task?.name||''));
      const partCost=garnetMaterial?0:parts;
      const incomplete=partCost===null||hours===null;
      const repairTask=family.find(member=>number(member.occurrenceHours?.[key])!==null)||family.find(member=>(member.manualHistory||[]).includes(occurrence))||family.find(member=>(member.completedDates||[]).includes(key))||task;
      const costFields={parts:{value:partCost,source:garnetMaterial?'Hourly garnet formula':number(rawParts)!==null?'Occurrence-specific':'Configured default'},duration:{value:hours,source:number(occurrenceHours)!==null?'Occurrence-specific':'Configured default'}};
      const importedSource=stream?.provenance?.importProvenance?.sourceRecord;
      const estimated=number(rawParts)===null||number(occurrenceHours)===null||(importedSource&&number(importedSource.parts_cost_snapshot)===null&&!(state.maintenanceOccurrencesV2||[]).some(event=>event.rootOccurrenceId===row.rootOccurrenceId&&event.source==='cut_cost_correction'));
      out.push({...row,maintenanceHrs:hours??0,partCost:partCost??0,chargeRate:30,laborCost:(hours??0)*30,totalCost:(partCost??0)+(hours??0)*30,costIncomplete:incomplete,costEstimated:Boolean(estimated),costFields,repairTaskId:repairTask?.id??row.taskId,garnetMaterialExcluded:garnetMaterial});
    }
    return out;
  }
  function calculate({state,rows,config,today,resolve}){
    const range=windowRange(config,today),abrasive=garnet(config),warnings=['Calculated operating-cost estimate: garnet consumption is assumed; configured maintenance values are estimates.'];
    if(!range.valid)return {...range,valid:false,actualCuttingHours:null,cutCostPerHour:null,warnings:[...warnings,'Choose a valid date window ending no later than today.']};
    const hours=actualHours(state,range.startDate,range.endDate,resolve),events=rows.filter(row=>row.dateISO>=range.startDate&&row.dateISO<=range.endDate);
    const partsCost=events.reduce((sum,row)=>sum+row.partCost,0),laborCost=events.reduce((sum,row)=>sum+row.laborCost,0),maintenanceCost=partsCost+laborCost;
    const incomplete=events.filter(row=>row.costIncomplete).length,estimated=events.filter(row=>row.costEstimated).length;
    if(incomplete)warnings.push(`${incomplete} completed maintenance event(s) lack a parts price or duration.`);
    if(!events.length)warnings.push('No completed maintenance events were found in this window. Confirm that maintenance history is complete.');
    if(estimated)warnings.push(`${estimated} completed maintenance event(s) use configured/default parts or duration.`);
    if(events.some(row=>row.garnetMaterialExcluded))warnings.push('Garnet refill/purchase material is excluded from maintenance; its labor remains included.');
    if(!abrasive.valid)warnings.push('Enter nonnegative garnet inputs and a weight greater than zero.');
    const maintenanceCostPerHour=hours.complete?maintenanceCost/hours.hours:null;
    const cutCostPerHour=hours.complete&&!incomplete&&abrasive.valid?maintenanceCostPerHour+abrasive.costPerHour:null;
    const valid=Number.isFinite(cutCostPerHour);
    return {...range,valid,actualCuttingHours:hours.hours,partsCost,laborCost,maintenanceCost,maintenanceCostPerHour,garnetCostPerHour:abrasive.costPerHour,cutCostPerHour:valid?cutCostPerHour:null,eventCount:events.length,dataCompleteness:{missingDays:hours.missingDays,incompleteEvents:incomplete,estimatedEvents:estimated},review:{missingMaintenance:events.filter(row=>row.costIncomplete),defaultedMaintenance:events.filter(row=>row.costEstimated),missingDates:hours.missingDates},warnings:[...warnings,...hours.warnings]};
  }
  return Object.freeze({DEFAULTS,settings,garnet,windowRange,actualHours,maintenanceRows,calculate});
});
