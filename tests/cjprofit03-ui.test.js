"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const views=fs.readFileSync("js/views.js","utf8").replace(/\r\n/g,"\n"),renderers=fs.readFileSync("js/renderers.js","utf8").replace(/\r\n/g,"\n");
const shared=fs.readFileSync("js/computations.js","utf8");
const fixture=extra=>({id:"job-one",estimateHours:2.8,chargeRate:200,costRate:-45,materialCost:10,materialQty:3,failurePercent:10,...extra});
function harness(){const calls=[],c=vm.createContext({window:{},JOB_RATE_PER_HOUR:200,JOB_BASE_COST_PER_HOUR:45,saveCloudNow:()=>calls.push("save"),saveCloudDebounced:()=>calls.push("save"),renderJobs:()=>calls.push("render")});vm.runInContext(shared,c);vm.runInContext(views.slice(views.indexOf("function cuttingJobFinancialTone("),views.indexOf("function viewJobs(){")),c);vm.runInContext(renderers.slice(renderers.indexOf("function wireCuttingJobNetBreakdowns("),renderers.indexOf("function showFailedCutDialog(")),c);return{c,calls};}
test("compact Net Total contains the five requested reconciled figures",()=>{
  const{c}=harness(),record=fixture(),before=structuredClone(record),html=c.renderCuttingJobNetBreakdown(record);
  for(const text of ["Net Total:","$348.00","Revenue: $200/hr × 2.8 hr = $560.00","Material Expense: -$30.00","Cutting Expense: -$45/hr × 2.8 hr = -$126.00","Failure: 10%"])
    assert.ok(html.includes(text),text);
  assert.match(html,/aria-expanded="false"/);assert.match(html,/data-job-net-details hidden/);assert.match(html,/>Expand<\/button>/);
  assert.deepEqual(record,before);
});
test("full details use identical display values to the popup for normal and failed jobs",()=>{
  for(const failurePercent of [0,10,50,100]){
    const{c}=harness(),record=fixture({failurePercent}),p=c.computeCuttingJobProfit(record),html=c.renderCuttingJobNetBreakdown(record);
    for(const [key,label]of [["failurePercent","Failure percentage"],["revenue","Original revenue"],["adjustedRevenue","Revenue remaining"],["cuttingCost","Full cutting expense"],["materialExpense","Full material expense"],["originalNetProfit","Original net profit"],["totalProfit","Adjusted net profit"],["revenueLost","Revenue lost / potential profit reduction"]]){
      const tone=c.cuttingJobFinancialTone(key,p[key]),value=c.formatCuttingJobFinancialValue(p,key);
      assert.ok(html.includes(`<dt>${label}</dt><dd class="${tone}">${value}</dd>`),`${label}: ${value}`);
    }
    assert.ok(html.includes(c.formatCuttingJobFinancialValue(p,"totalProfit")));
  }
});
test("positive, negative, zero and expense figures receive scoped consistent colors",()=>{
  const{c}=harness();assert.equal(c.cuttingJobFinancialTone("totalProfit",10),"job-finance-positive");assert.equal(c.cuttingJobFinancialTone("totalProfit",-1),"job-finance-negative");assert.equal(c.cuttingJobFinancialTone("totalProfit",0),"job-finance-neutral");
  for(const key of ["cuttingCost","materialExpense","revenueLost"])assert.equal(c.cuttingJobFinancialTone(key,10),"job-finance-negative");
  assert.equal(c.cuttingJobFinancialTone("failurePercent",10),"job-finance-warning");
  const html=c.renderCuttingJobNetBreakdown(fixture({estimateHours:1,chargeRate:55,costRate:25,materialCost:10,materialQty:3,failurePercent:0}));assert.match(html,/class="job-finance-neutral">\$0\.00<\/strong>/);
});
function button(id){const details={hidden:true},attrs={"aria-expanded":"false"},node={listeners:{},textContent:"Expand",getAttribute:key=>attrs[key],setAttribute:(key,value)=>{attrs[key]=value;},addEventListener:(name,handler)=>{node.listeners[name]=handler;}};const root={getAttribute:()=>id,querySelector:()=>details};node.closest=()=>root;return{node,details,click(){node.listeners.click({preventDefault(){},stopPropagation(){}});}};}
test("inline expansion is independent, survives rerenders, and triggers no writes or page refresh",()=>{
  const{c,calls}=harness(),a=button("a"),b=button("b"),records=[fixture({id:"a"}),fixture({id:"b"})],before=structuredClone(records);
  c.wireCuttingJobNetBreakdowns({querySelectorAll:()=>[a.node,b.node]});a.click();assert.equal(a.details.hidden,false);assert.equal(a.node.textContent,"Collapse");assert.equal(b.details.hidden,true);
  assert.match(c.renderCuttingJobNetBreakdown(records[0]),/aria-expanded="true"/);assert.match(c.renderCuttingJobNetBreakdown(records[1]),/aria-expanded="false"/);
  b.click();a.click();assert.equal(a.details.hidden,true);assert.equal(a.node.textContent,"Expand");assert.equal(b.details.hidden,false);assert.match(c.renderCuttingJobNetBreakdown(records[1]),/aria-expanded="true"/);
  assert.deepEqual(calls,[]);assert.deepEqual(records,before);assert.equal(c.window.__expandedCuttingJobNetIds.size,1);
});
test("Failed Cut percentage appears once inside Actions and both table types render the inline breakdown",()=>{
  const history=views.slice(views.indexOf("  const completedRows ="),views.indexOf("    const estimateVal =",views.indexOf("  const completedRows =")));
  assert.match(history,/data-history-actions-menu="\$\{job.id\}" hidden>\s*<button[^>]*data-history-failed-cut=/);
  assert.match(history,/Failed Cut — \$\{computeCuttingJobProfit\(job\)\.failurePercent\}%/);
  assert.match(history,/<div class="job-actions">\s*<button type="button" class="job-actions-trigger"/);
  assert.equal((views.match(/data-history-failed-cut=/g)||[]).length,1);assert.match(views,/renderCuttingJobNetBreakdown\(job\)/);assert.match(views,/renderCuttingJobNetBreakdown\(j\)/);
});
