"use strict";
const fs=require("node:fs"),vm=require("node:vm");
const integrity=require("../js/maintenanceCalendarIntegrity"),archive=require("../js/maintenanceTaskArchive"),cancellation=require("../js/maintenanceCalendarCancellation");
const calendar=fs.readFileSync("js/calendar.js","utf8"),core=fs.readFileSync("js/core.js","utf8"),renderer=fs.readFileSync("js/renderers.js","utf8");
const plain=value=>JSON.parse(JSON.stringify(value));
class FixedDate extends Date {constructor(...args){super(...(args.length?args:["2026-10-21T17:00:00Z"]));}static now(){return new Date("2026-10-21T17:00:00Z").getTime();}}
function freeze(value){if(value&&typeof value==="object"){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function harness(state){
  const window=structuredClone(state);Object.assign(window,{OMAXMaintenanceCalendarIntegrity:integrity,OMAXMaintenanceTaskArchive:archive,OMAXMaintenanceCalendarCancellation:cancellation});
  const context=vm.createContext({window,structuredClone,Date:FixedDate,console,getConfiguredDailyHours:()=>8,getCurrentMachineHours:()=>100,nextDue:()=>null});
  const dates=core.slice(core.indexOf("function parseDateLocal("),core.indexOf("function isWeekendDate("));
  const variants=core.slice(core.indexOf("function resolveTaskVariant("),core.indexOf("function ensureTaskVariant("));
  vm.runInContext(dates+variants,context);
  vm.runInContext(calendar,context);
  vm.runInContext(renderer.slice(renderer.indexOf("function ensureTaskManualHistory("),renderer.indexOf("function collectTaskHistoryDates(")),context);
  return {window,context,projection:()=>plain(context.buildMaintenanceCalendarEvents()),history:taskId=>plain(context.buildMaintenanceTaskHistory(taskId))};
}
module.exports={harness,plain,freeze};
