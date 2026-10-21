'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||'playwright');
const root=process.env.OMAX_COSTDATA_ROOT||path.resolve(__dirname,'..'),fixture=require('./fixtures/costdata-01a.cjs');
async function harness(t,{delayed=false,timezoneId='America/Chicago'}={}){
 const server=http.createServer(async(req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{let body=await fs.readFile(file);if(delayed&&pathname==='/js/devsafeMode.js')body=Buffer.from(body.toString()+`\nif(window.OMAXDevSafe?.active){const doc=OMAXDevSafe.db.doc;OMAXDevSafe.db.doc=path=>{const ref=doc(path),get=ref.get;ref.get=async(...args)=>{if(new URLSearchParams(location.search).get('holdInitialRead')==='1'&&path.endsWith('/app/state')&&!window.__releaseCostdataRead){window.__costdataReadWaiting=true;await new Promise(resolve=>{window.__resumeCostdataRead=resolve;});}return get(...args);};return ref;};}`);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'text/plain'}).end(body);}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>browser.close());const context=await browser.newContext({timezoneId,viewport:{width:1440,height:1100}});await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(6000);await page.clock.setFixedTime(new Date('2026-10-21T17:00:00Z'));
 let loads=0;const load=async()=>{await page.goto(origin+'/?devsafe=1&costdata01b='+(++loads)+'#/costs');await page.waitForFunction(()=>window.__initialAdoptComplete&&FB.ready);};
 if(!delayed)await load();
 const seed=async()=>{assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);await load();await page.evaluate(async source=>{const state=(await FB.docRef.get()).data();Object.assign(state,source);state.syncMeta={...state.syncMeta,rev:state.syncMeta.rev+1,updatedBy:'costdata-seed'};await FB.docRef.set(state);},fixture());await load();};
 return {page,context,origin,load,seed,errors};
}
async function consistent(p){return p.evaluate(()=>{const m=computeCostModel();return {key:m.financialReconciliation.window.key,maintenance:m.financialReconciliation.maintenance.knownSubtotal,purchases:m.financialReconciliation.purchases.total,maintenanceGraph:m.maintenanceSeries.reduce((s,x)=>s-x.value,0),purchaseGraph:m.totalSpendSeries.reduce((s,x)=>s-x.value,0),maintRows:document.querySelectorAll('[data-maintenance-row]').length,purchaseRows:document.querySelectorAll('[data-spend-row]').length,tableMaint:m.maintenanceDataTable.length,tablePurchases:m.purchaseDataTable.length,graphTargets:document.querySelector('#costChart').__costChartTargets.map(x=>x.rowRef),visiblePurchaseGraph:document.querySelector('#costChart').__costChartTargets.filter(x=>x.key==='spend').reduce((sum,x)=>sum+Math.abs(Number(x.valueLabel.replace(/[^0-9.-]/g,''))),0),visibleMaintenanceGraph:document.querySelector('#costChart').__costChartTargets.filter(x=>x.key==='maintenance').reduce((sum,x)=>sum+Math.abs(Number(x.valueLabel.replace(/[^0-9.-]/g,''))),0),state:m.machineHourHistory};});}
for(const timezoneId of ['America/Chicago','Pacific/Kiritimati'])test('01B initial, periods, rapid changes, navigation and reload '+timezoneId,{timeout:60000},async t=>{
 const h=await harness(t,{timezoneId}),p=h.page;await h.seed();const baseline=await p.evaluate(async()=>JSON.stringify((await FB.docRef.get()).data()));
 for(const [range,maint,spend]of [['30d',70,36],['90d',70,36],['182d',110,76],['365d',230,131],['ytd',230,131]]){await p.selectOption('#costFinancialPeriod',range);const r=await consistent(p);assert.equal(r.maintenance,maint);assert.equal(r.purchases,spend);assert.equal(r.maintenanceGraph,maint);assert.equal(r.purchaseGraph,spend);assert.equal(r.visiblePurchaseGraph,spend);assert.equal(r.visibleMaintenanceGraph,maint);assert.equal(r.maintRows,r.tableMaint);assert.equal(r.purchaseRows,r.tablePurchases);}
 await p.evaluate(()=>{for(const range of ['30d','ytd','90d','365d','182d','ytd']){const select=document.querySelector('#costFinancialPeriod');select.value=range;select.dispatchEvent(new Event('change',{bubbles:true}));}});assert.equal((await consistent(p)).purchaseGraph,131);
 await p.evaluate(()=>{location.hash='#/inventory';});await p.waitForFunction(()=>!document.querySelector('#costChart'));await p.evaluate(()=>{location.hash='#/costs';});await p.waitForSelector('#costChart');assert.equal((await consistent(p)).purchaseGraph,131);
 await h.load();assert.equal((await consistent(p)).key,'all','reload uses the existing transient preference default consistently');await p.selectOption('#costFinancialPeriod','ytd');assert.equal((await consistent(p)).maintenanceGraph,230);assert.equal(await p.evaluate(async()=>JSON.stringify((await FB.docRef.get()).data())),baseline);assert.deepEqual(h.errors,[]);
});
test('01B delayed initial authoritative read produces populated Cost Analysis after adoption',{timeout:30000},async t=>{const h=await harness(t,{delayed:true}),p=h.page;await h.load();await h.seed();await p.goto(h.origin+'/?devsafe=1&holdInitialRead=1#/costs');await p.waitForFunction(()=>window.__costdataReadWaiting);assert.equal(await p.evaluate(()=>window.__initialAdoptComplete),false);await p.evaluate(()=>{window.__releaseCostdataRead=true;window.__resumeCostdataRead();});await p.waitForFunction(()=>window.__initialAdoptComplete);assert.equal((await consistent(p)).visiblePurchaseGraph,131);assert.deepEqual(h.errors,[]);});
test('01B delayed historical snapshot refreshes while financial-period selector retains focus',{timeout:20000},async t=>{
 const h=await harness(t),p=h.page;await h.seed();await p.selectOption('#costFinancialPeriod','365d');await p.focus('#costFinancialPeriod');
 await p.evaluate(async()=>{const state=(await FB.docRef.get()).data();state.receiptTrackerWeeks[0].rows.push({date:'2026-01-16',purchased:'Delayed January receipt',cost:17,qty:1});state.tasksInterval[0].manualHistory.push({dateISO:'2026-01-16',status:'completed',partsCostSnapshot:10,hours:1});state.syncMeta={...state.syncMeta,rev:state.syncMeta.rev+1,updatedBy:'other-session'};await FB.docRef.set(state);});
 await p.waitForFunction(()=>computeCostModel().financialReconciliation.purchases.total===148);
 // Loaded state is current; UI and graph should catch up without requiring an unrelated click.
 try { await p.waitForFunction(()=>[...document.querySelectorAll('[data-spend-row]')].some(row=>row.textContent.includes('Delayed January receipt')),{},{timeout:3500}); } catch(error) {t.diagnostic(JSON.stringify(await p.evaluate(()=>({modelTotal:computeCostModel().financialReconciliation.purchases.total,visibleDelayedRows:[...document.querySelectorAll('[data-spend-row]')].filter(row=>row.textContent.includes('Delayed January receipt')).length,active:document.activeElement.id,chartDates:document.querySelector('#costChart').__costChartTargets.map(row=>row.rowRef?.dateISO)}))));await p.evaluate(()=>document.activeElement.blur());await p.waitForFunction(()=>[...document.querySelectorAll('[data-spend-row]')].some(row=>row.textContent.includes('Delayed January receipt')));t.diagnostic('Display recovered after selector blur, without reloading source data.');throw error;}
 const r=await consistent(p);assert.equal(r.purchases,148);assert.equal(r.purchaseGraph,148);assert.equal(r.visiblePurchaseGraph,148);
 assert.equal(r.maintenance,270);assert.equal(r.visibleMaintenanceGraph,270);
 assert.ok(r.graphTargets.some(row=>row.type==='spend'&&row.dateISO==='2026-01-16'));
 assert.ok(r.graphTargets.some(row=>row.type==='maintenance'&&row.dateISO==='2026-01-16'));assert.deepEqual(h.errors,[]);
});
test('01B business-input draft still defers rendering and survives the eventual refresh',{timeout:20000},async t=>{
 const h=await harness(t),p=h.page;await h.seed();
 await p.selectOption('#costFinancialPeriod','365d');
 await p.locator('[data-cut-cost-configure]').click();
 await p.locator('[data-cut-cost-field="purchasePrice"]').fill('815');
 await p.evaluate(async()=>{
  const state=(await FB.docRef.get()).data();
  state.receiptTrackerWeeks[0].rows.push({date:'2026-01-16',purchased:'Deferred receipt',cost:17,qty:1});
  state.syncMeta={...state.syncMeta,rev:state.syncMeta.rev+1,updatedBy:'other-session'};
  await FB.docRef.set(state);
 });
 await p.waitForFunction(()=>computeCostModel().financialReconciliation.purchases.total===148);
 // The existing 1.2-second deferral must remain active for a real draft input.
 await p.waitForTimeout(1500);
 assert.equal(await p.locator('[data-spend-row]').filter({hasText:'Deferred receipt'}).count(),0);
 assert.equal(await p.locator('[data-cut-cost-field="purchasePrice"]').inputValue(),'815');
 await p.evaluate(()=>document.activeElement.blur());
 await p.locator('[data-spend-row]').filter({hasText:'Deferred receipt'}).waitFor({state:'attached'});
 assert.equal(await p.locator('[data-cut-cost-field="purchasePrice"]').inputValue(),'815');
 assert.equal(await p.evaluate(async()=>(await FB.docRef.get()).data().appConfig.cutCostFeedback?.purchasePrice??715),715);
 assert.deepEqual(h.errors,[]);
});
test('01B successive remote snapshots rebuild the current period without explicit navigation',{timeout:20000},async t=>{
 const h=await harness(t),p=h.page;await h.seed();await p.selectOption('#costFinancialPeriod','365d');
 for(const [index,amount]of [[1,17],[2,19]]){
  await p.evaluate(async({index,amount})=>{
   const state=(await FB.docRef.get()).data();state.receiptTrackerWeeks[0].rows.push({date:'2026-01-16',purchased:'Remote receipt '+index,cost:amount,qty:1});
   state.syncMeta={...state.syncMeta,rev:state.syncMeta.rev+1,updatedBy:'other-session'};await FB.docRef.set(state);
  },{index,amount});
  await p.locator('[data-spend-row]').filter({hasText:'Remote receipt '+index}).waitFor({state:'attached'});
 }
 const result=await consistent(p);assert.equal(result.purchases,167);assert.equal(result.purchaseGraph,167);assert.equal(result.visiblePurchaseGraph,167);
 assert.equal(result.graphTargets.filter(row=>row.type==='spend'&&row.dateISO==='2026-01-16').length,1,'same-day receipts aggregate to one daily point');
 assert.equal(result.key,'365d');assert.deepEqual(h.errors,[]);
});
test('01B failed authoritative reads enter recovery rather than displaying a successful empty reload',{timeout:20000},async t=>{
 const h=await harness(t),p=h.page;await h.seed();
 const result=await p.evaluate(async()=>{
  const before=JSON.stringify((await FB.docRef.get()).data());
  const get=FB.docRef.get.bind(FB.docRef);FB.docRef.get=async()=>{throw Error('Synthetic authoritative-read failure');};
  const loaded=await loadFromCloud();FB.docRef.get=get;
  return {loaded,recovery:isRecoveryMode(),writesAllowed:canWriteCloud('fixture failed read'),unchanged:before===JSON.stringify((await get()).data())};
 });
 assert.equal(result.loaded.loaded,false);assert.match(result.loaded.error,/Synthetic authoritative-read failure/);
 assert.equal(result.recovery,true);assert.equal(result.writesAllowed,false);assert.equal(result.unchanged,true);assert.deepEqual(h.errors,[]);
});
for(const timezoneId of ['America/Chicago','Pacific/Kiritimati'])
test('01B YTD business-date boundaries exclude December and future receipts '+timezoneId,{timeout:20000},async t=>{
 const h=await harness(t,{timezoneId}),p=h.page;await h.seed();
 await p.clock.setFixedTime(new Date(timezoneId==='America/Chicago'?'2026-01-01T17:00:00Z':'2026-01-01T00:00:00Z'));
 await p.evaluate(async()=>{
  const state=(await FB.docRef.get()).data();state.receiptTrackerWeeks.push({key:'2026-W01',rows:[
   {date:'2025-12-31',purchased:'Prior year',cost:7,qty:1},
   {date:'2026-01-01',purchased:'Current year boundary',cost:11,qty:1},
   {date:'2026-01-02',purchased:'Future receipt',cost:13,qty:1}
  ]});
  state.syncMeta={...state.syncMeta,rev:state.syncMeta.rev+1,updatedBy:'other-session'};await FB.docRef.set(state);
 });
 await p.waitForFunction(()=>computeCostModel().purchaseDataTable.some(row=>row.purchased==='Current year boundary'));
 await p.selectOption('#costFinancialPeriod','ytd');
 const result=await consistent(p);assert.equal(result.purchases,11);assert.equal(result.purchaseGraph,11);assert.equal(result.visiblePurchaseGraph,11);
 assert.equal(result.purchaseRows,1);assert.equal(result.graphTargets.filter(row=>row.type==='spend').length,1);
 assert.equal(result.graphTargets.find(row=>row.type==='spend').dateISO,'2026-01-01');assert.deepEqual(h.errors,[]);
});
