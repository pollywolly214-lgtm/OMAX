"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const dates=require("../js/cuttingJobDateEditing"),chronology=require("../js/cuttingJobChronology");
const computations=fs.readFileSync("js/computations.js","utf8"),renderers=fs.readFileSync("js/renderers.js","utf8").replace(/\r\n/g,"\n");
function calc(){const c=vm.createContext({JOB_RATE_PER_HOUR:200,JOB_BASE_COST_PER_HOUR:45});vm.runInContext(computations,c);return c.computeCuttingJobProfit;}
const profit=calc(),job=(extra={})=>({id:"j",name:"Test cut",estimateHours:1,actualHours:0,chargeRate:150,costRate:-25,materialCost:5,materialQty:5,
  completedAtISO:"2026-10-01",cat:"project",projectNumber:"0000",cutNumber:"C041",files:[{fileId:"keep"}],manualLogs:[{completedHours:99}],...extra});
for(const [failurePercent,net,lost] of [[undefined,100,0],[0,100,0],[50,25,75],[100,-50,150]])
  test(`failure ${failurePercent??"missing"}% adjusts only revenue`,()=>{
    for(const costRate of [-25,25]){const record=job({costRate,...(failurePercent===undefined?{}:{failurePercent})}),before=structuredClone(record),p=profit(record);
      assert.equal(p.revenue,150);assert.equal(p.cuttingCost,25);assert.equal(p.materialExpense,25);assert.equal(p.originalNetProfit,100);
      assert.equal(p.totalProfit,net);assert.equal(p.revenueLost,lost);assert.equal(p.adjustedRevenue,150-lost);assert.deepEqual(record,before);}
  });
test("minute-derived hours, quantities and edits use the same shared calculation",()=>{
  for(const minutes of [30,90]){const record=job({estimateHours:minutes/60,materialCost:10,materialQty:3});
    assert.equal(profit(record).totalProfit,(150-25)*minutes/60-30);
    record.materialCost=12;assert.equal(profit(record).totalProfit,(150-25)*minutes/60-36);
    record.failurePercent=50;assert.equal(profit(record).totalProfit,(75-25)*minutes/60-36);}
});
const persistenceSource=fs.readFileSync("tests/cjo02-persistence.test.js","utf8");
const persistenceContext=vm.createContext({require,console,structuredClone,Buffer,Date,setTimeout});
vm.runInContext(persistenceSource.slice(0,persistenceSource.indexOf('test("J:'))+';this.buildHarness=harness;',persistenceContext);
let sequence=0;
function persistence(flags={}){
  const h=persistenceContext.buildHarness(flags);
  h.env.prepareBusinessMutation=(state,operation,options)=>dates.prepareMutation(state,operation,options);
  h.env.audit=()=>({operationId:`failure-${++sequence}`,actorUid:"actor",atISO:"2026-10-16T12:00:00Z"});
  h.env.baselineMatches=cloud=>chronology.stateKey(cloud)===chronology.stateKey(h.live);
  h.save=percentage=>h.api.save([],{expectedRevision:h.live.syncMeta.rev,businessOperation:{type:"failure",id:"tue",failurePercent:percentage}});
  return h;
}
test("verified Firebase-shaped CAS save/reload edits and resets only one job and appends audit evidence",async()=>{
  const h=persistence(),initial=structuredClone(h.live);
  for(const percentage of [50,100,0]){
    const result=await h.save(percentage);assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);assert.notEqual(result.requiresReload,true);
    const cloud=JSON.parse(JSON.stringify(h.remote.state)),record=cloud.completedCuttingJobs[0];
    assert.equal(record.failurePercent,percentage);assert.deepEqual(h.live,cloud);
    const expected=structuredClone(initial);expected.syncMeta=cloud.syncMeta;expected.completedCuttingJobs[0].failurePercent=percentage;
    expected.completedCuttingJobs[0].cutChronologyHistory=record.cutChronologyHistory;assert.deepEqual(cloud,expected);
    assert.equal(record.cutChronologyHistory.at(-1).kind,"failure");assert.equal(record.cutChronologyHistory.at(-1).after.failurePercent,percentage);
    assert.deepEqual(result.renumbering.changed,[]);
  }
  assert.equal(h.remote.commits,3);assert.equal(h.calls.suspensions,0);
});
test("ACC05 missing -> zero persists through verified CAS, while explicit zero -> zero is a genuine no-op",async()=>{
  const h=persistence(),before=h.live,result=await h.save(0);assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);assert.equal(h.calls.writes,1);
  const saved=h.remote.state,record=saved.completedCuttingJobs[0];assert.equal(record.failurePercent,0);assert.deepEqual(record.cutChronologyHistory.at(-1).before,{});assert.deepEqual(record.cutChronologyHistory.at(-1).after,{failurePercent:0});
  const expected=structuredClone(before);expected.syncMeta=saved.syncMeta;expected.completedCuttingJobs[0].failurePercent=0;expected.completedCuttingJobs[0].cutChronologyHistory=record.cutChronologyHistory;assert.deepEqual(saved,expected);assert.deepEqual(h.live,saved);
  const repeated=await h.save(0);assert.equal(repeated.noOp,true);assert.equal(h.calls.writes,1);assert.deepEqual(h.remote.state,saved);assert.deepEqual(h.live,saved);
});
test("ACC05 null -> zero preserves null audit evidence and prior history",async()=>{
  const h=persistence(),initial=h.live;initial.completedCuttingJobs[0].failurePercent=null;initial.completedCuttingJobs[0].cutChronologyHistory=[{operationId:"old-audit",kind:"failure",before:{failurePercent:10},after:{failurePercent:null}}];
  h.remote.replace(initial);h.env.adoptVerifiedState(initial);const result=await h.save(0);assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);
  const saved=h.remote.state.completedCuttingJobs[0];assert.equal(saved.failurePercent,0);assert.deepEqual(saved.cutChronologyHistory[0],initial.completedCuttingJobs[0].cutChronologyHistory[0]);assert.deepEqual(saved.cutChronologyHistory.at(-1).before,{failurePercent:null});assert.deepEqual(saved.cutChronologyHistory.at(-1).after,{failurePercent:0});
});
for(const [name,flags] of [["preflight",{preflightBlocked:true}],["permission",{writeError:Object.assign(Error("denied"),{code:"permission-denied"})}],["readback mismatch",{readBackMismatch:true}],["stale revision",{beforeRead:({remote})=>{const state=remote.state;state.syncMeta.rev++;remote.replace(state);}}]])
  test(`failure adjustment retains existing ${name} protection`,async()=>{const h=persistence(flags),before=h.live,r=await h.save(50);assert.equal(r.saved,false);assert.deepEqual(h.live,before);if(name==="readback mismatch"){assert.equal(r.requiresReload,true);assert.equal(h.calls.suspensions,1);}else assert.equal(h.remote.commits,0);});
test("invalid percentages, active jobs and duplicate audit identities are blocked without changes",()=>{
  const h=persistence(),state=h.live,before=structuredClone(state),audit={operationId:"unique",actorUid:"actor",atISO:"2026-10-16"};
  for(const percentage of [-1,101,NaN,Infinity,"50",null])assert.equal(dates.prepareMutation(state,{type:"failure",id:"tue",failurePercent:percentage},{audit}).ok,false);
  assert.equal(dates.prepareMutation(state,{type:"failure",id:"mon",failurePercent:50},{audit}).ok,false);
  const first=dates.prepareMutation(state,{type:"failure",id:"tue",failurePercent:50},{audit});
  assert.equal(dates.prepareMutation(first.nextState,{type:"failure",id:"tue",failurePercent:75},{audit}).ok,false);assert.deepEqual(state,before);
});
class Element{
  constructor(){this.listeners={};this.disabled=false;this.textContent="";this.classes=new Set();this.classList={toggle:(name,value)=>value?this.classes.add(name):this.classes.delete(name)};}
  addEventListener(name,handler){this.listeners[name]=handler;} focus(){this.focused=true;} setAttribute(){} close(){this.open=false;} remove(){this.removed=true;} showModal(){this.open=true;}
}
function popup(saveResult={saved:true,verified:true},failurePercent=0){
  const source=job({failurePercent}),calls=[],elements=Object.fromEntries(["form","percent","slider","save","cancel","status"].map(key=>[key,new Element()]));
  elements.percent.value=String(Math.round(failurePercent));const cells=["failurePercent","revenue","adjustedRevenue","cuttingCost","materialExpense","originalNetProfit","totalProfit","revenueLost"].map(key=>Object.assign(new Element(),{getAttribute:()=>key,key}));
  const dialog=new Element();dialog.querySelector=selector=>elements[/data-failed-cut-([a-z]+)/.exec(selector)?.[1]];dialog.querySelectorAll=()=>cells;
  const c=vm.createContext({JOB_RATE_PER_HOUR:200,JOB_BASE_COST_PER_HOUR:45,window:{completedCuttingJobs:[source]},completedCuttingJobs:[source],document:{createElement:()=>dialog,body:{appendChild(){}}},escapeHtml:String,toast(){},renderJobs(){calls.push("render");},saveCuttingJobFailurePercent:async(id,percent)=>{calls.push({id,percent});return saveResult;}});
  vm.runInContext(computations,c);const views=fs.readFileSync("js/views.js","utf8");vm.runInContext(views.slice(views.indexOf("function cuttingJobFinancialTone("),views.indexOf("function viewJobs(){")),c);const start=renderers.indexOf("function showFailedCutDialog("),end=renderers.indexOf("\nfunction renderJobs(){",start);vm.runInContext(renderers.slice(start,end),c);c.showFailedCutDialog("j",new Element());
  return{source,calls,elements,dialog,cells,change(value){elements.percent.value=String(value);elements.percent.listeners.input();},submit(){return elements.form.listeners.submit({preventDefault(){}});},value(key){return cells.find(cell=>cell.key===key);}};
}
test("popup previews 0/50/100 live, highlights actual negative profit, validates range and Cancel never saves",()=>{
  const p=popup(),before=structuredClone(p.source);assert.equal(p.value("totalProfit").textContent,"$100.00");
  p.change(50);assert.equal(p.value("totalProfit").textContent,"$25.00");assert.equal(p.value("revenueLost").textContent,"-$75.00");
  p.change(100);assert.equal(p.value("totalProfit").textContent,"-$50.00");assert.equal(p.value("totalProfit").classes.has("is-negative"),true);
  assert.equal(p.value("cuttingCost").textContent,"-$25.00");assert.equal(p.value("materialExpense").textContent,"-$25.00");
  for(const value of ["",-1,101,"bad"]){p.change(value);assert.equal(p.elements.save.disabled,true);}
  p.elements.cancel.listeners.click();assert.equal(p.dialog.removed,true);assert.deepEqual(p.calls,[]);assert.deepEqual(p.source,before);
});
test("popup saves only after submit and closes/renders only on verified success",async()=>{
  const p=popup();p.change(50);assert.deepEqual(p.calls,[]);await p.submit();assert.deepEqual(p.calls,[{id:"j",percent:50},"render"]);assert.equal(p.dialog.removed,true);
  for(const result of [{saved:false,error:"rejected"},{saved:true,verified:false,requiresReload:true,error:"Reload"}]){const failed=popup(result);failed.change(50);await failed.submit();assert.equal(failed.dialog.open,true);assert.equal(failed.dialog.removed,undefined);assert.equal(failed.elements.status.textContent,result.error);}
});

test("saved failure percentage can be reopened, edited, reset, and unknown saves cannot be replayed",async()=>{
  const p=popup({saved:true,verified:true},50);assert.equal(p.elements.percent.value,"50");assert.equal(p.value("totalProfit").textContent,"$25.00");p.change(0);await p.submit();assert.deepEqual(p.calls[0],{id:"j",percent:0});
  const blocked=popup({saved:false,requiresReload:true});blocked.change(50);await blocked.submit();await blocked.submit();assert.equal(blocked.calls.length,1);
});

test("CJPROFIT-03A: whole percentage display preserves saved precision until edited",async()=>{
  for(const [saved,display] of [[21.3768115942029,"21"],[50.75,"51"]]){
    const p=popup({saved:true,verified:true},saved),before=structuredClone(p.source);
    assert.equal(p.elements.percent.value,display);assert.equal(p.elements.slider.value,display);
    assert.equal(p.value("failurePercent").textContent,`${display}%`);
    assert.equal(p.value("totalProfit").textContent,new Intl.NumberFormat(undefined,{style:"currency",currency:"USD"}).format(profit(p.source).totalProfit));
    assert.deepEqual(p.calls,[]);p.elements.cancel.listeners.click();assert.deepEqual(p.source,before);
    const unchanged=popup({saved:true,verified:true},saved);await unchanged.submit();assert.deepEqual(unchanged.calls[0],{id:"j",percent:saved});
  }
  const p=popup({saved:true,verified:true},21.3768115942029);
  p.change(50.75);assert.equal(p.elements.percent.value,"51");assert.equal(p.elements.slider.value,"51");
  assert.equal(p.value("failurePercent").textContent,"51%");assert.equal(p.value("totalProfit").textContent,"$23.50");
  p.elements.slider.value="75";p.elements.slider.listeners.input();assert.equal(p.elements.percent.value,"75");
  assert.equal(p.value("failurePercent").textContent,"75%");assert.equal(p.value("totalProfit").textContent,"-$12.50");
  assert.match(p.dialog.innerHTML,/step="1" required data-failed-cut-percent/);
  assert.match(p.dialog.innerHTML,/step="1" aria-label="Failure percentage slider"/);
});
test("CJPROFIT-03: slider saves through the unchanged submit flow and locks during verification",async()=>{
  let resolve;const p=popup(new Promise(done=>resolve=done));p.elements.slider.value="51";p.elements.slider.listeners.input();
  const pending=p.submit();assert.equal(p.elements.slider.disabled,true);assert.equal(p.elements.percent.disabled,true);assert.deepEqual(p.calls,[{id:"j",percent:51}]);
  resolve({saved:true,verified:true});await pending;assert.equal(p.dialog.removed,true);
  const blocked=popup({saved:false,verified:false,requiresReload:true});blocked.change(50);await blocked.submit();assert.equal(blocked.elements.slider.disabled,true);
});
