(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.OMAXCutCostRepair=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const key=value=>value===undefined?'undefined':value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(key).join(',')+']':'{'+Object.keys(value).sort().map(name=>JSON.stringify(name)+':'+key(value[name])).join(',')+'}';
  const day=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const parsed=new Date(value+'T00:00:00Z');return Number.isFinite(+parsed)&&parsed.toISOString().slice(0,10)===value?value:null;};
  function evidence(state,target){
    if(target.kind==='v2'){
      const tasks=(state.maintenanceTasksV2||[]).filter(task=>String(task.id)===target.taskId),instances=(state.maintenanceCalendarInstancesV2||[]).filter(instance=>String(instance.id)===target.instanceId);
      const events=(state.maintenanceOccurrencesV2||[]).filter(event=>String(event.rootOccurrenceId||event.id)===target.rootOccurrenceId);
      if(tasks.length!==1||instances.length!==1||!events.length||instances[0].taskId!==tasks[0].id||events.some(event=>String(event.taskId)!==target.taskId||String(event.instanceId)!==target.instanceId))throw Error('This occurrence has ambiguous or missing maintenance identities. Review it in Maintenance Calendar.');
      let completed=false;
      events.map((event,index)=>({event,index})).sort((a,b)=>(Date.parse(a.event.recordedAtISO)||0)-(Date.parse(b.event.recordedAtISO)||0)||b.index-a.index).forEach(({event})=>{
        if(event.eventType==='completed'||event.lifecycleStatus==='completed')completed=true;
        if(['uncompleted','removed','skipped','canceled','cancelled'].includes(event.eventType)||['scheduled','removed','skipped','canceled','cancelled'].includes(event.lifecycleStatus))completed=false;
      });
      if(!completed)throw Error('This occurrence is no longer completed. Reopen Missing Data.');
      return {tasks,instances,events};
    }
    const tasks=(state[target.collection]||[]).filter(task=>String(task.id)===target.taskId);
    if(tasks.length!==1)throw Error('The exact maintenance task is unavailable or archived. Restore/review it through Maintenance Settings first.');
    const task=tasks[0],history=(task.manualHistory||[]).filter(entry=>day(entry.dateISO||entry.date)===target.dateISO&&entry.source!=='cut_cost_correction');
    if(history.length>1)throw Error('Multiple historical records share this task and date. Review their identities before correcting costs.');
    if(!(task.completedDates||[]).includes(target.dateISO)&&!history.length)throw Error('The exact completed occurrence is unavailable.');
    return tasks;
  }
  function describe(state,row){
    const target=row.sourceSystem==='v2'?{kind:'v2',taskId:String(row.taskId),instanceId:String(row.instanceId||''),rootOccurrenceId:String(row.rootOccurrenceId||''),dateISO:row.dateISO}:{kind:'legacy',taskId:String(row.repairTaskId||row.taskId),dateISO:row.dateISO};
    if(target.kind==='legacy'){
      const collections=['tasksInterval','tasksAsReq'].filter(name=>(state[name]||[]).some(task=>String(task.id)===target.taskId));
      if(collections.length!==1)throw Error('The exact maintenance task is unavailable, archived, or ambiguous. Review it in Maintenance Settings.');
      target.collection=collections[0];
    }
    target.evidenceKey=key(evidence(state,target));return target;
  }
  function planMaintenance(state,target,values,{id,atISO,actor}={}){
    if(!target||!day(target.dateISO)||key(evidence(state,target))!==target.evidenceKey)throw Error('This occurrence changed since review. Reopen Missing Data before saving.');
    const amount=value=>value==null||String(value).trim()===''?null:Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
    const duration=amount(values.duration),parts=amount(values.parts);
    if(duration===null||parts===null)throw Error('Enter explicit nonnegative duration and parts cost; zero is allowed.');
    if(!id||!atISO)throw Error('Correction identity and timestamp are required.');
    const pending=clone(state);
    if(target.kind==='v2'){
      if((state.maintenanceOccurrencesV2||[]).some(event=>event.id===id))throw Error('Correction identity already exists.');
      pending.maintenanceOccurrencesV2.unshift({id,system:'v2',schemaVersion:2,taskId:target.taskId,instanceId:target.instanceId,rootOccurrenceId:target.rootOccurrenceId,eventType:'hours_set',effectiveDateISO:target.dateISO,recordedAtISO:atISO,recordedBy:actor,source:'cut_cost_correction',partsCostSnapshot:parts,payload:{hours:duration}});
      return {pending,fields:['maintenanceOccurrencesV2']};
    }
    const task=pending[target.collection].find(task=>String(task.id)===target.taskId);
    if((task.manualHistory||[]).some(entry=>entry.id===id))throw Error('Correction identity already exists.');
    task.occurrenceHours={...(task.occurrenceHours||{}),[target.dateISO]:duration};
    task.manualHistory=[...(task.manualHistory||[]),{id,dateISO:target.dateISO,status:'completed',source:'cut_cost_correction',recordedAtISO:atISO,recordedBy:actor,partsCostSnapshot:parts,loggedHours:duration}];
    return {pending,fields:[target.collection]};
  }
  function planHours(state,entries,atISO){
    if(!Array.isArray(entries)||!entries.length)throw Error('Enter cutting hours for at least one day.');
    const pending=clone(state),seen=new Set();
    if(!Array.isArray(pending.dailyCutHours))throw Error('Authoritative daily hours are unavailable.');
    for(const [dateISO,value] of entries){
      if(!day(dateISO)||seen.has(dateISO)||value==null||String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>24)throw Error('Enter explicit hours from 0 to 24 for each unique date.');
      seen.add(dateISO);const rows=pending.dailyCutHours.filter(row=>(row.dateISO||row.date||row.dateIso)===dateISO);
      if(rows.length>1)throw Error('Multiple daily records share this date; review hour history before correcting it.');
      if(rows.length)Object.assign(rows[0],{hours:Number(value),source:'manual',updatedAtISO:atISO});
      else pending.dailyCutHours.push({dateISO,hours:Number(value),source:'manual',updatedAtISO:atISO});
    }
    return {pending,fields:['dailyCutHours']};
  }
  return Object.freeze({key,describe,planMaintenance,planHours});
});
