"use strict";
const fs = require("node:fs"), vm = require("node:vm");
const dates = require("../../js/cuttingJobDateEditing");
const calendar = fs.readFileSync("js/calendar.js", "utf8");
const core = fs.readFileSync("js/core.js", "utf8");
// Execute the real projection and chip renderer, with the same date helpers
// used by the application. No copied projection or alternative date algorithm.
function project(state){
  const context = vm.createContext({window:{...state, CuttingJobDateEditing:dates}, console});
  vm.runInContext(core.slice(core.indexOf("function parseDateLocal("), core.indexOf("function isWeekendDate(")), context);
  vm.runInContext(calendar.slice(calendar.indexOf("function normalizeJobList("), calendar.indexOf('if (typeof window !== "undefined")')), context);
  vm.runInContext(calendar.slice(calendar.indexOf("const jobsMap = {};"), calendar.indexOf("  const garnetMap = {};"))+";this.result=jobsMap;", context);
  return structuredClone(context.result);
}
const identities = map => Object.entries(map).flatMap(([date, rows]) => rows.map(row => [row.id, date, row.status])).sort((a,b)=>a.join().localeCompare(b.join()));
function chips(rows){
  const output = [], context = vm.createContext({jobsMap:{fixture:rows}, key:"fixture",
    document:{createElement:()=>({dataset:{}})}, cell:{appendChild:chip=>output.push(chip)},
    getJobCategoryColorData:cat=>({normalized:cat}), applyJobCategoryStyles(){} });
  vm.runInContext(calendar.slice(calendar.indexOf("      (jobsMap[key]||[]).forEach(ev=>{"), calendar.indexOf('      const addBtn = document.createElement("button");')), context);
  return output;
}
module.exports = {project, identities, chips};
