"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
test("PROJ-01B browser: population toggle, weighted failure, safe saves, help, navigation and responsive layout",{timeout:180000},async t=>{
  const root=path.resolve(__dirname,".."),server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname,file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)||pathname.split("/").some(part=>part.startsWith("."))){res.writeHead(403).end();return;}
    try{res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"})[path.extname(file)]||"text/plain"}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});t.after(()=>browser.close());
  const context=await browser.newContext({timezoneId:"America/Chicago",viewport:{width:1440,height:1000}});t.after(()=>context.close());
  await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));page.setDefaultTimeout(12000);
  await page.clock.setSystemTime(new Date("2026-10-20T15:00:00Z"));
  const ready=()=>page.waitForFunction(()=>window.OMAXDevSafe?.active&&window.__initialAdoptComplete);
  const cloud=()=>page.evaluate(()=>readCurrentCloudStateReadOnly());
  await page.goto(origin+"/?devsafe=1");await ready();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await page.reload();await ready();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
  await page.evaluate(async()=>{
    if(!OMAXDevSafe.active||typeof firebase!=="undefined")throw Error("Disposable backend required");
    const ref=OMAXDevSafe.db.doc(FB.docRef.path),state=(await ref.get()).data();
    state.jobFolders=[{id:"jobs_root",name:"All Jobs",parent:null,order:1},{id:"blanco",name:"1254 Blanco",projectNumber:"1254",parent:"jobs_root",order:2},{id:"atm",name:"1251 ATM",projectNumber:"1251",parent:"jobs_root",order:3}];
    const job=(id,extra={})=>({id,name:"Same visible job name",cat:"blanco",projectNumber:"1254",estimateHours:2,chargeRate:150,costRate:-25,materialCost:5,materialQty:5,failurePercent:0,startISO:"2026-10-01",dueISO:"2026-10-01",files:[],manualLogs:[],notes:"",...extra});
    state.cuttingJobs=[job("active",{cutNumber:"C001"})];
    const historical=(id,event,cutNumber)=>job(id,{cat:"atm",projectNumber:"1251",cutNumber,estimateHours:0,actualHours:1,failurePercent:null,completedAtISO:"2026-10-03",import_event_id:event,
      importProvenance:{import_event_id:event,actual_cut_minutes:"60",source_file:"disposable workbook",sourceRowNumber:12},manualLogs:[{dateISO:"2026-10-03",completedHours:1,import_event_id:event}]});
    state.completedCuttingJobs=[job("past",{cutNumber:"C002",failurePercent:50,completedAtISO:"2026-10-01"}),job("unknown",{cutNumber:"C003",failurePercent:null,completedAtISO:"2026-10-02"}),
      historical("atm-job","616-CUT-P01-L001","C004"),historical("atm-other","CUTPDF-20261003-001","C005")];
    await ref.set(state);
  });
  await page.reload();await ready();const before=await cloud();
  await page.locator('#tab-projects').click();await page.locator('#projectSelector').waitFor();
  assert.equal(await page.locator('#tab-projects').getAttribute('class'),"active");
  assert.ok((await page.locator('#projectOptions option').evaluateAll(options=>options.map(option=>option.value))).includes("1254 — Blanco"),await page.locator('.projects-page').textContent());
  await page.locator('#projectSelector').fill("1254 — Blanco");
  await page.waitForURL(url=>url.hash==="#/projects?project=blanco&active=1");
  const values=()=>page.locator('.project-summary-grid .project-metric > strong').allTextContents();
  assert.deepEqual(await values(),["3","6 hr","16.67%","$150.00","$75.00","$225.00"]);
  const finance=()=>page.locator('.project-finance-grid .project-metric > strong').allTextContents(),hypothetical=()=>page.locator('.project-finance-grid .project-no-failures').allTextContents();
  assert.deepEqual(await finance(),["$525.00","$175.00","$87.50","-$150.00"]);
  assert.deepEqual(await hypothetical(),["No failures: $675.00","No failures: $225.00","No failures: $112.50"]);
  assert.deepEqual(await page.locator('.project-finance-grid h3').allTextContents(),["Modeled Cut Net","Average Net per Job","Average Net per Cutting Hour","Known Failure-Related Reduction"]);
  assert.match(await page.locator('.project-finance-grid').textContent(),/3\/3 jobs with reliable data/);
  assert.equal(await page.locator('[data-project-provisional-net]').count(),0);assert.equal(await page.locator('.project-finance-grid .project-metric').count(),4);
  assert.match(await page.locator('.project-summary-grid').textContent(),/1 hr failed cutting hours \/ 6 hr included hours/);
  assert.equal(await page.locator('#projectIncludeActive').isChecked(),true);
  // Native popover: mouse, keyboard, Escape and light dismissal, with no business save.
  const info=page.getByRole('button',{name:'About including active Cutting Jobs'}),help=page.locator('#projectModeHelp');
  await info.click();assert.equal(await help.isVisible(),true);assert.match(await help.textContent(),/ON:.*OFF:/s);
  await help.getByRole('button',{name:'Close'}).click();assert.equal(await help.isVisible(),false);
  await info.focus();await page.keyboard.press('Enter');assert.equal(await help.isVisible(),true);await page.keyboard.press('Escape');assert.equal(await help.isVisible(),false);
  await info.click();await page.locator('.projects-page h1').click();assert.equal(await help.isVisible(),false);
  const details=page.locator('.project-jobs');assert.equal(await details.getAttribute('open'),null);await details.locator('summary').click();assert.notEqual(await details.getAttribute('open'),null);
  assert.equal(await page.locator('[data-project-job]').count(),3);assert.equal(await page.locator('[data-project-job="past"]').textContent(),"Same visible job name");
  const pastNet=page.locator('[data-project-job="past"]').locator('xpath=ancestor::tr').locator('td').last();assert.equal(await pastNet.locator('strong').textContent(),"$75.00");assert.match(await pastNet.locator('span').textContent(),/No failures: \$225.00/);
  await page.locator('#projectIncludeActive').uncheck();
  assert.deepEqual(await values(),["2","4 hr","25.00%","$100.00","$50.00","$150.00"]);
  assert.deepEqual(await finance(),["$300.00","$150.00","$75.00","-$150.00"]);
  assert.deepEqual(await hypothetical(),["No failures: $450.00","No failures: $225.00","No failures: $112.50"]);assert.equal(await page.locator('[data-project-financial-scope]').count(),0);
  assert.notEqual(await details.getAttribute('open'),null);assert.equal(await page.locator('[data-project-job]').count(),2);assert.equal(await page.locator('[data-project-job="active"]').count(),0);
  await page.locator('#projectSelector').fill("1251 — ATM");assert.equal(await page.locator('#projectIncludeActive').isChecked(),false);
  assert.equal(new URL(page.url()).hash,"#/projects?project=atm&active=0");
  await page.reload();await ready();assert.equal(await page.locator('#projectIncludeActive').isChecked(),false);assert.equal(await page.locator('#projectSelector').inputValue(),"1251 — ATM");
  await page.locator('#projectSelector').fill("1254 — Blanco");assert.deepEqual(await values(),["2","4 hr","25.00%","$100.00","$50.00","$150.00"]);
  await page.locator('#projectIncludeActive').check();assert.deepEqual(await values(),["3","6 hr","16.67%","$150.00","$75.00","$225.00"]);assert.deepEqual(await cloud(),before);
  await details.locator('summary').click();
  await details.locator('summary').click();assert.equal(await details.getAttribute('open'),null);
  await page.reload();await ready();assert.equal(await page.locator('#projectSelector').inputValue(),"1254 — Blanco");assert.equal(await page.locator('#projectIncludeActive').isChecked(),true);assert.deepEqual(await values(),["3","6 hr","16.67%","$150.00","$75.00","$225.00"]);
  await details.locator('summary').click();await page.locator('[data-project-job="past"]').click();await page.waitForURL(url=>url.hash==="#/jobs");
  await page.locator('[data-history-row="past"]').waitFor({state:"visible"});assert.equal(await page.evaluate(()=>window.pendingJobRowHighlight?.id),"past");
  assert.equal(await page.locator('[data-job-net-id="past"] .job-net-total strong').textContent(),"$75.00"); // Same Hours Taken basis as the Projects row.
  await page.locator('#tab-projects').click();await page.locator('#projectSelector').fill("1251 — ATM");assert.deepEqual(await values(),["2","2 hr","0%","$50.00","$50.00","$100.00"]);
  assert.match(await page.locator('.project-coverage-notice').textContent(),/may overlap across imports.*All distinct records are currently included/);
  assert.match(await page.locator('.project-summary-grid').textContent(),/2 recorded/);
  assert.deepEqual(await page.locator('.project-finance-grid .project-metric > strong').allTextContents(),["$200.00","$100.00","$100.00","$0.00"]);
  assert.deepEqual(await hypothetical(),["No failures: $200.00","No failures: $100.00","No failures: $100.00"]);
  await page.reload();await ready();assert.equal(await page.locator('#projectSelector').inputValue(),"1251 — ATM");assert.deepEqual(await values(),["2","2 hr","0%","$50.00","$50.00","$100.00"]);
  await details.locator('summary').click();assert.equal(await page.locator('[data-project-job="atm-job"]').count(),1);assert.equal(await page.locator('[data-project-job="atm-other"]').count(),1);
  await page.locator('[data-project-job="atm-other"]').click();await page.waitForURL(url=>url.hash==="#/jobs");await page.locator('[data-history-row="atm-other"]').waitFor({state:"visible"});
  assert.equal(await page.evaluate(()=>window.pendingJobRowHighlight?.id),"atm-other");
  await page.locator('#tab-projects').click();
  await page.locator('#projectSelector').fill("1254 — Blanco");await details.locator('summary').click();await page.locator('[data-project-job="active"]').click();await page.waitForURL(url=>url.hash==="#/jobs");
  await page.locator('[data-job-row="active"]').waitFor({state:"visible"});assert.equal(await page.evaluate(()=>window.pendingJobRowHighlight?.id),"active");
  await page.goto(origin+"/?devsafe=1#/projects?project=blanco");await ready();
  assert.doesNotMatch(await page.locator('.projects-page').textContent(),/may overlap across imports/);
  // Snapshot data updates naturally rerender the selected project without saving totals.
  await page.evaluate(async()=>{const ref=OMAXDevSafe.db.doc(FB.docRef.path),state=(await ref.get()).data();state.cuttingJobs.find(j=>j.id==="active").estimateHours=3;state.syncMeta.rev+=1;await ref.set(state);});
  await page.waitForFunction(()=>document.querySelectorAll('.project-summary-grid .project-metric > strong')[1]?.textContent==="7 hr");
  for(const viewport of [{width:1440,height:1000},{width:768,height:1024},{width:375,height:812}]){
    await page.setViewportSize(viewport);await page.locator('.project-jobs summary').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
    assert.equal(await page.locator('.project-finance-grid .project-metric').count(),4);
    for(const card of await page.locator('.project-finance-grid .project-metric').all()){
      const comparison=card.locator('.project-no-failures');if(!await comparison.count())continue;
      const primary=card.locator(':scope > strong'),primaryBox=await primary.boundingBox(),comparisonBox=await comparison.boundingBox();
      assert.ok(comparisonBox.y>=primaryBox.y+primaryBox.height-1);assert.ok(await comparison.evaluate((el,primarySize)=>parseFloat(getComputedStyle(el).fontSize)<primarySize,await primary.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))));
    }
    if(process.env.OMAX_SCREENSHOT_DIR){await fs.mkdir(process.env.OMAX_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.OMAX_SCREENSHOT_DIR,`projects-${viewport.width}.png`),fullPage:true});}
    await page.locator('.project-jobs summary').click();
  }
  await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>{document.documentElement.style.zoom="1.5";});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
  const after=await cloud(),expected=structuredClone(before);expected.cuttingJobs.find(j=>j.id==="active").estimateHours=3;expected.syncMeta.rev+=1;
  assert.deepEqual(after,expected);assert.deepEqual(errors,[]);
  // ACC04/05: actual failure dialog, CAS/readback, zero persistence and reset; six completed plus one active.
  await page.evaluate(async()=>{
    document.documentElement.style.zoom="";
    const ref=OMAXDevSafe.db.doc(FB.docRef.path),s=(await ref.get()).data(),base=s.completedCuttingJobs.find(j=>j.id==="past");
    s.cuttingJobs=[];s.completedCuttingJobs=Array.from({length:7},(_,i)=>{
      const record={...base,id:i===1?"failure-edit":`failure-${i}`,name:`ACC04 cut ${i}`,estimateHours:i===1?7:1,chargeRate:i===1?240:100,costRate:i===1?45:20,materialCost:i===1?20:10,materialQty:1,
        cutNumber:`C${String(i+1).padStart(3,"0")}`,startISO:`2026-10-0${i+1}`,dueISO:`2026-10-0${i+1}`,completedAtISO:`2026-10-0${i+1}`};
      delete record.failurePercent;delete record.cutChronologyHistory;if(i===0)record.failurePercent=0;return record;
    });const active=s.completedCuttingJobs.pop();delete active.completedAtISO;s.cuttingJobs=[active];
    s.completedCuttingJobs[1].completedAtISO="2026-10-02T12:30:00.000Z";
    s.syncMeta.rev+=1;await ref.set(s);
  });
  await page.goto(origin+"/?devsafe=1#/projects?project=blanco");await ready();const failureBefore=await cloud();
  assert.equal(await page.locator('.project-summary-grid .project-metric > strong').nth(2).textContent(),"0%");
  assert.equal(await page.locator('.project-finance-grid .project-metric > strong').first().textContent(),"$1,765.00");
  assert.equal((await hypothetical())[0],"No failures: $1,765.00");
  assert.match(await page.locator('.project-summary-grid').textContent(),/0 of 7 currently failure-affected jobs/);
  assert.equal(await page.locator('[data-project-financial-scope]').count(),0);
  await page.locator('.project-jobs summary').click();assert.equal(await page.locator('[data-project-job="failure-edit"]').locator('xpath=ancestor::tr').locator('td').nth(2).textContent(),"2026-10-02");
  await page.locator('[data-project-job="failure-edit"]').click();await page.waitForURL(url=>url.hash==="#/jobs");
  const jobNet=page.locator('[data-job-net-id="failure-edit"]');await jobNet.waitFor({state:"visible"});
  assert.match(await jobNet.textContent(),/Failure: Not recorded/);assert.match(await jobNet.textContent(),/Net Total \(provisional, failure not recorded\)/);
  assert.match(await page.locator('[data-job-net-id="failure-0"]').textContent(),/Failure: 0%/);
  await page.locator('[data-history-actions-toggle="failure-edit"]').click();
  assert.match(await page.locator('[data-history-failed-cut="failure-edit"]').textContent(),/Not recorded/);
  await page.locator('[data-history-failed-cut="failure-edit"]').click();await page.locator('[data-failed-cut-percent]').fill("0");
  await page.locator('[data-failed-cut-save]').click();await page.locator('[data-failed-cut-dialog]').waitFor({state:"detached"});
  const zeroSaved=await cloud(),zeroJob=zeroSaved.completedCuttingJobs.find(j=>j.id==="failure-edit");
  assert.equal(zeroJob.failurePercent,0);assert.deepEqual(zeroJob.cutChronologyHistory.at(-1).before,{});assert.deepEqual(zeroJob.cutChronologyHistory.at(-1).after,{failurePercent:0});
  const editFailure=async value=>{
    await page.locator('[data-history-actions-toggle="failure-edit"]').click();await page.locator('[data-history-failed-cut="failure-edit"]').click();await page.locator('[data-failed-cut-percent]').fill(String(value));
  };
  const saveFailure=async()=>{await page.locator('[data-failed-cut-save]').click();await page.locator('[data-failed-cut-dialog]').waitFor({state:"detached"});};
  const reloadProjects=async()=>{await page.locator('#tab-projects').click();await page.locator('#projectSelector').fill("1254 — Blanco");await page.reload();await ready();};
  const openTarget=async()=>{await page.locator('.project-jobs summary').click();await page.locator('[data-project-job="failure-edit"]').click();await page.waitForURL(url=>url.hash==="#/jobs");};
  await reloadProjects();assert.match(await page.locator('.project-summary-grid').textContent(),/0 of 7 currently failure-affected jobs/);assert.equal(await page.locator('.project-finance-grid .project-metric > strong').nth(3).textContent(),"$0.00");
  assert.deepEqual(await cloud(),zeroSaved);await openTarget();assert.match(await jobNet.textContent(),/Failure: 0%/);
  await editFailure(0);await saveFailure();assert.deepEqual(await cloud(),zeroSaved); // True no-op: no audit or revision change.
  await editFailure(10);
  assert.equal(await page.locator('[data-failure-preview="revenueLost"]').textContent(),"-$168.00");
  await saveFailure();
  assert.match(await jobNet.textContent(),/Failure: 10%/);
  assert.equal(await jobNet.locator('.job-net-total strong').textContent(),"$1,177.00");
  const failureAfter=await cloud(),saved=failureAfter.completedCuttingJobs.find(j=>j.id==="failure-edit"),failureExpected=structuredClone(failureBefore);
  assert.equal(saved.failurePercent,10);assert.equal(saved.cutChronologyHistory.at(-1).kind,"failure");assert.equal(saved.cutChronologyHistory.length,2);assert.deepEqual(saved.cutChronologyHistory.at(-1).before,{failurePercent:0});
  failureExpected.syncMeta=failureAfter.syncMeta;const expectedJob=failureExpected.completedCuttingJobs.find(j=>j.id==="failure-edit");expectedJob.failurePercent=10;expectedJob.cutChronologyHistory=saved.cutChronologyHistory;
  assert.deepEqual(failureAfter,failureExpected);
  await reloadProjects();
  assert.equal(await page.locator('.project-finance-grid .project-metric > strong').first().textContent(),"$1,597.00");
  assert.equal(await page.locator('.project-finance-grid .project-metric > strong').nth(3).textContent(),"-$168.00");
  assert.equal((await hypothetical())[0],"No failures: $1,765.00");
  assert.match(await page.locator('.project-summary-grid').textContent(),/1 of 7 currently failure-affected jobs/);
  assert.equal(await page.locator('.project-summary-grid .project-metric > strong').nth(2).textContent(),"5.38%");
  assert.deepEqual(await cloud(),failureAfter);
  await page.locator('.project-jobs summary').click();assert.equal(await page.locator('[data-project-job="failure-edit"]').locator('xpath=ancestor::tr').locator('td').last().locator('strong').textContent(),"$1,177.00");await page.locator('.project-jobs summary').click();
  await openTarget();await editFailure(0);await saveFailure();const reset=await cloud(),resetJob=reset.completedCuttingJobs.find(j=>j.id==="failure-edit");
  assert.equal(resetJob.failurePercent,0);assert.equal(resetJob.cutChronologyHistory.length,3);assert.deepEqual(resetJob.cutChronologyHistory.at(-1).before,{failurePercent:10});
  assert.deepEqual(resetJob.cutChronologyHistory.slice(0,2),saved.cutChronologyHistory);
  const resetExpected=structuredClone(failureBefore);resetExpected.syncMeta=reset.syncMeta;const resetExpectedJob=resetExpected.completedCuttingJobs.find(j=>j.id==="failure-edit");resetExpectedJob.failurePercent=0;resetExpectedJob.cutChronologyHistory=resetJob.cutChronologyHistory;assert.deepEqual(reset,resetExpected);
  await reloadProjects();assert.equal(await page.locator('.project-finance-grid .project-metric > strong').first().textContent(),"$1,765.00");assert.equal(await page.locator('.project-finance-grid .project-metric > strong').nth(3).textContent(),"$0.00");assert.equal((await hypothetical())[0],"No failures: $1,765.00");
  assert.match(await page.locator('.project-summary-grid').textContent(),/0 of 7 currently failure-affected jobs/);assert.equal(await page.locator('.project-summary-grid .project-metric > strong').nth(2).textContent(),"0%");assert.deepEqual(await cloud(),reset);assert.deepEqual(errors,[]);
  // User-supplied Mesquite arithmetic, reproduced only on a disposable local fixture.
  await page.evaluate(async()=>{
    const ref=OMAXDevSafe.db.doc(FB.docRef.path),s=(await ref.get()).data();
    s.jobFolders.push({id:"mesquite",name:"1242 Mesquite",projectNumber:"1242",parent:"jobs_root",order:4});
    const job=(id,estimateHours,extra={})=>({id,name:`Fixture ${id}`,cat:"mesquite",projectNumber:"1242",estimateHours,chargeRate:600,costRate:450,materialCost:60,materialQty:1,startISO:"2026-10-01",files:[],manualLogs:[],...extra});
    s.completedCuttingJobs=[2.8,5,6,7,8,2.88].map((h,i)=>job(`mesquite-${i}`,h,{completedAtISO:"2026-10-02",materialCost:i===5?59.31:60,...(i===0?{failurePercent:39}:i===1?{failurePercent:0,cutChronologyHistory:[{kind:"failure",after:{failurePercent:80}}]}:{})}));
    s.cuttingJobs=[job("mesquite-active",18.5)];s.syncMeta.rev+=1;await ref.set(s);
  });
  await page.goto(origin+"/?devsafe=1#/projects?project=mesquite");await ready();const mesquiteBefore=await cloud();
  assert.deepEqual(await values(),["7","50.18 hr","2.18%","$22,581.00","$419.31","$23,000.31"]);
  assert.deepEqual(await finance(),["$6,452.49","$921.78","$128.59","-$655.20"]);
  assert.deepEqual(await hypothetical(),["No failures: $7,107.69","No failures: $1,015.38","No failures: $141.64"]);assert.match(await page.locator('.project-summary-grid').textContent(),/1.092 hr failed cutting hours \/ 50.18 hr included hours.*1 of 7 currently failure-affected jobs/);
  await details.locator('summary').click();assert.equal(await page.locator('[data-project-job]').count(),7);await page.locator('#projectIncludeActive').uncheck();
  assert.deepEqual(await values(),["6","31.68 hr","3.45%","$14,256.00","$359.31","$14,615.31"]);
  assert.deepEqual(await finance(),["$3,737.49","$622.92","$117.98","-$655.20"]);
  assert.deepEqual(await hypothetical(),["No failures: $4,392.69","No failures: $732.11","No failures: $138.66"]);assert.match(await page.locator('.project-summary-grid').textContent(),/1.092 hr failed cutting hours \/ 31.68 hr included hours.*1 of 6 currently failure-affected jobs/);assert.equal(await page.locator('[data-project-job]').count(),6);
  const loss=page.locator('[data-project-job="mesquite-0"]').locator('xpath=ancestor::tr').locator('td').last();assert.equal(await loss.locator('strong').textContent(),"-$295.20");assert.match(await loss.locator('strong').getAttribute('class'),/job-finance-negative/);assert.match(await loss.locator('span').textContent(),/No failures: \$360.00/);
  await page.reload();await ready();assert.equal(await page.locator('#projectIncludeActive').isChecked(),false);assert.deepEqual(await cloud(),mesquiteBefore);
  // Separate touch-capable mobile context, with every nonlocal request blocked.
  const touchContext=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:375,height:812}});t.after(()=>touchContext.close());
  await touchContext.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const touchPage=await touchContext.newPage();await touchPage.goto(origin+"/?devsafe=1#/projects");await touchPage.locator('#projectIncludeActive').waitFor();
  await touchPage.getByRole('button',{name:'About including active Cutting Jobs'}).tap();const touchHelp=touchPage.locator('#projectModeHelp');assert.equal(await touchHelp.isVisible(),true);
  const bounds=await touchHelp.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=376);await touchHelp.getByRole('button',{name:'Close'}).tap();assert.equal(await touchHelp.isVisible(),false);
  assert.deepEqual(errors,[]);
});
