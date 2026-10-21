"use strict";
// Synthetic evidence shapes/counts supplied in CJE-01G, never production data.
function imported(family,n,extra={}){
  const date=extra.completedAtISO || "2026-07-28",importId=family==="CUTPDF" ? `CUTPDF-${date.replaceAll("-","")}-${String(n).padStart(3,"0")}` : `616-CUT-P01-L${String(n).padStart(3,"0")}`;
  const actualHours=extra.actualHours ?? 1;
  return {id:`cji_${importId}`,import_event_id:importId,name:`Synthetic cut ${n}`,projectNumber:"1254",cat:"project",estimateHours:0,
    actualHours,completedAtISO:date,startISO:date,dueISO:date,chargeRate:200,costRate:45,materialCost:10,materialQty:1,failurePercent:0,
    manualLogs:[{dateISO:date,completedHours:actualHours,import_event_id:importId}],files:[],
    importProvenance:{import_event_id:importId,actual_cut_minutes:String(actualHours*60),job_name:`Synthetic cut ${n}`,
      project_number:"1254",completed_date:date,source_file:`synthetic-${family}.csv`,sourceRowNumber:n},...extra};
}
function productionShape(){
  const rows=[];let left=0,right=0;
  for(let i=0;i<37;i++){
    const date=`2026-06-${String(i%28+1).padStart(2,"0")}`,extra={name:`Paired cut ${i}`,completedAtISO:date,actualHours:i+.5};
    rows.push(imported("CUTPDF",++left,extra),imported("616-CUT",++right,{...extra,materialCost:i===0?20:10}));
  }
  for(let i=0;i<3;i++)rows.push(imported("CUTPDF",++left,{name:"ATM Person Door",projectNumber:"1251",completedAtISO:"2026-06-29",actualHours:.75}));
  for(let i=0;i<2;i++)rows.push(imported("616-CUT",++right,{name:"ATM Person Door",projectNumber:"1251",completedAtISO:"2026-06-29",actualHours:.75}));
  const example=imported("616-CUT",++right,{cutNumber:"C074",name:"Blanco Shoes",completedAtISO:"2026-07-28",actualHours:12.3,materialCost:863.47});
  example.importProvenance.job_name=example.name;rows.push(example);
  while(right<88)rows.push(imported("616-CUT",++right,{completedAtISO:"2026-09-01",actualHours:10+right/10}));
  while(left<67)rows.push(imported("CUTPDF",++left,{completedAtISO:"2026-09-01",actualHours:20+left/10}));
  for(let i=0;i<17;i++)rows.push({id:`manual-${i}`,name:`Manual cut ${i}`,projectNumber:"1254",cat:"project",estimateHours:2,actualHours:2,
    completedAtISO:"2026-10-20",startISO:"2026-10-20",dueISO:"2026-10-20",chargeRate:200,costRate:45,materialCost:10,materialQty:1,failurePercent:0,manualLogs:[],files:[]});
  return rows;
}
module.exports={imported,productionShape};
