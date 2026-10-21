"use strict";
// Source excerpts are verified against supplied 616.pdf page 2. All job IDs,
// financial values and material prices below are synthetic test data.
const text=version=>`1251 ATM PERSON DOOR V${version} 3/16 304 STAINLESS ${version===1 ? "6 ½" : "61/2"}''X46'' 12 MIN`;
function sourceJob(family,version,extra={}){
  const id=`test-${family}-V${version}`,importId=family==='CUTPDF' ? `CUTPDF-20260629-00${version}` : `616-CUT-P02-L00${version}`;
  return {id,import_event_id:importId,name:'ATM Person Door',projectNumber:'1251',completedAtISO:'2026-06-29',
    estimateHours:0,actualHours:.2,chargeRate:200,costRate:45,materialCost:10,materialQty:1,failurePercent:0,
    importProvenance:{source_file:family==='CUTPDF' ? 'Cut tracker.pdf' : '616 (1).pdf',source_text:text(version),
      completed_date:'2026-06-29',project_number:'1251',actual_cut_minutes:'12',thickness_inches:'.1875',
      sourceRowNumber:15+version,charge_rate_per_hr:'',cost_rate_per_hr:'',job_name:'ATM Person Door'},...extra};
}
const june29=()=>[sourceJob('CUTPDF',1),sourceJob('CUTPDF',2),sourceJob('CUTPDF',3),sourceJob('616-CUT',1),sourceJob('616-CUT',2)];
module.exports={text,sourceJob,june29};
