(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.OMAXRecoveryWorkbook=api;
})(typeof window==="undefined"?null:window,function(){
  "use strict";
  const contracts={
    purchase:{sheet:"Purchases",required:["import_event_id","source_id","source_record_id","date","purchased","qty","cost","partnumber","shipping","tax"],numbers:["qty","cost","shipping","tax"],dates:["date"]},
    pump:{sheet:"RPM History",required:["import_event_id","source_id","source_record_id","date","rpm","timeiso","time_source"],numbers:["rpm"],dates:["date"]},
    pump_hours:{sheet:"Pump Hours",required:["import_event_id","source_id","source_record_id","date","hours"],numbers:["hours"],dates:["date"]},
    maintenance:{sheet:"Maintenance Events",required:["import_event_id","event_date","route","event_name","exact_existing_task","calendar_mode","mark_completed","labor_minutes","parts_cost_snapshot","part_number_snapshot","source_kind","source_page","source_line","source_text","review_status","review_notes"],numbers:["labor_minutes","parts_cost_snapshot"],dates:["event_date"]}
  };
  function adapt(kind,rows){
    const c=contracts[kind];if(!c)throw Error("Unsupported recovery workbook kind.");
    return rows.map(source=>{
      const row={...source};
      const identityFields=kind==="maintenance"?["import_event_id"]:["import_event_id","source_id","source_record_id"];
      row.__recoveryProblems=identityFields.filter(key=>typeof row[key]!=="string"||!row[key]||row[key].trim()!==row[key]).map(key=>`${key} requires a permanent exact source value.`);
      if("partnumber" in row){row.partNumber=row.partnumber;delete row.partnumber;}
      if("timeiso" in row){row.timeISO=row.timeiso;delete row.timeiso;}
      for(const key of c.numbers){
        const value=row[key];
        // Only plain numeric cell values are adapted. Currency text, units and
        // formulas remain invalid; blanks stay blank rather than becoming zero.
        if(typeof value==="string"&&/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))row[key]=Number(value);
      }
      if(kind==="maintenance"&&["true","1"].includes(String(row.mark_completed).toLowerCase()))row.mark_completed=true;
      return row;
    });
  }
  async function parseFile(kind,file,xlsx){
    if(String(file?.name||"").toLowerCase().endsWith(".json")){
      const rows=JSON.parse(await file.text());
      if(!Array.isArray(rows)&&!(kind==="maintenance"&&Array.isArray(rows?.events)))throw Error("JSON must contain reviewed rows.");
      return rows;
    }
    if(!String(file?.name||"").toLowerCase().endsWith(".xlsx"))throw Error("Choose a reviewed .xlsx or .json file.");
    if(!xlsx?.parse)throw Error("Pinned local XLSX parser unavailable.");
    const c=contracts[kind];if(!c)throw Error("Unsupported recovery workbook kind.");
    const buffer=await file.arrayBuffer();
    const parsed=await xlsx.parse(buffer,[c.sheet],{requiredHeaders:c.required,dateColumns:c.dates,timeColumns:kind==="pump"?["timeiso"]:[]});
    const rows=adapt(kind,parsed.rows);
    if(kind!=="maintenance")return rows;
    const checklist=await xlsx.parse(buffer,["Task Creation Checklist"],{requiredHeaders:["task_setup_id","task_name","task_type","part_number","parts_cost","default_labor_minutes","category","setup_status","setup_notes","verified_in_site"],dateColumns:[]});
    // Import Gate has no supplied column contract. Preserve and display it as
    // operator evidence; never use unknown cells as automatic authorization.
    const gate=await xlsx.parse(buffer,["Import Gate"],{requiredHeaders:[],dateColumns:[]});
    return{events:rows,checklist:checklist.rows,gate:gate.rows};
  }
  return Object.freeze({contracts,adapt,parseFile});
});
