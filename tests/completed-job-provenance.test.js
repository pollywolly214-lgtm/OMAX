"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("js/core.js","utf8"),start=source.indexOf("function buildCompletedJob"),end=source.indexOf("function completeCuttingJob",start);
const context=vm.createContext({JOB_RATE_PER_HOUR:250,JOB_BASE_COST_PER_HOUR:30,window:{},computeJobEfficiency:job=>({actualHours:job.manualLogs[0].completedHours})});
vm.runInContext(source.slice(start,end)+";this.build=buildCompletedJob",context);
test("normal completion preserves project string, permanent identity, provenance and manual time",()=>{
  const job={id:"job",name:"Part",projectNumber:"0000",import_event_id:"permanent-event",importProvenance:{originalSourceDate:"2026-01-02"},source_file:"fixture.csv",manualLogs:[{dateISO:"2026-01-02",completedHours:0.5}],files:[{fileId:"metadata-only"}],costRate:45};
  const before=JSON.stringify(job),result=context.build(job,"2026-01-03T12:00:00.000Z");
  assert.equal(result.projectNumber,"0000");assert.equal(result.import_event_id,"permanent-event");assert.deepEqual(result.importProvenance,job.importProvenance);assert.equal(result.source_file,"fixture.csv");assert.equal(result.actualHours,0.5);assert.equal(result.costRate,45);assert.equal(JSON.stringify(job),before);
});
