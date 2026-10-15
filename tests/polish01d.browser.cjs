"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
const root=process.env.OMAX_POLISH_ROOT||path.resolve(__dirname,"..");
test("POLISH-01D cutting-job corrections against disposable local state",{timeout:120000},async t=>{
  const server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname,file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"})[path.extname(file)]||"text/plain"}).end(await fs.readFile(file));}catch{res.end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});t.after(()=>browser.close());
  async function fixture(dpr=1){
    const context=await browser.newContext({timezoneId:"America/Chicago",viewport:{width:1280,height:800},deviceScaleFactor:dpr});
    await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));page.setDefaultTimeout(10000);
    // UTC is Oct 15 while the user's local day is still Oct 14.
    await page.clock.setFixedTime(new Date("2026-10-15T02:30:00Z"));
    const load=async()=>{await page.goto(origin+"/?devsafe=1");await page.waitForFunction(()=>OMAXDevSafe.active&&window.__initialAdoptComplete);};
    await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
    await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
    await page.evaluate(async()=>{
      if(!OMAXDevSafe.active||typeof firebase!=="undefined")throw Error("Disposable backend required");
      const ref=OMAXDevSafe.db.doc(FB.docRef.path),state=(await ref.get()).data();
      const base={name:"Dimension fixture",estimateHours:2,material:"A36 Steel",materialCost:7.25,materialQty:1,chargeRate:200,costRate:45,priority:1,files:[],manualLogs:[],notes:"Preserve original",pathLength:.5005,pathWidth:1.125,thickness:.25};
      state.jobFolders=[{id:"jobs_root",name:"All Jobs",parent:null,order:1},{id:"blanco",name:"1254 Blanco",projectNumber:"1254",parent:"jobs_root",order:2},{id:"mesquite",name:"1242 Mesquite",projectNumber:"1242",parent:"jobs_root",order:3}];
      state.completedCuttingJobs=[{...base,id:"polish-source",cat:"blanco",projectNumber:"1254",startISO:"2026-10-01",dueISO:"2026-10-01",completedAtISO:"2026-10-01",cutNumber:"C001"}];
      state.cuttingJobs=[{...base,id:"polish-other",cat:"mesquite",projectNumber:"1242",startISO:"2026-10-10",dueISO:"2026-10-10",cutNumber:"C002"}];
      await ref.set(state);
    });
    await load();
    await page.evaluate(()=>{window.jobCategoryFilter="mesquite";window.jobHistoryCategoryFilter="blanco";location.hash="#/jobs";renderJobs();});
    assert.equal(await page.evaluate(()=>window.completedCuttingJobs.some(job=>job.id==="polish-source")),true,"fixture adopted from disposable cloud");
    const cloud=()=>page.evaluate(()=>readCurrentCloudStateReadOnly());
    const open=async()=>{await page.locator('[data-history-actions-toggle="polish-source"]').click();await page.locator('[data-history-activate="polish-source"]').click();await page.locator('[data-active-copy-submit]').waitFor();};
    return{context,page,errors,cloud,open};
  }

  await t.test("real verified copy is visible despite previous filter, local today defaults, due validation and duplicate clicks",async()=>{
    const h=await fixture();try{
      const before=(await h.cloud()).completedCuttingJobs;
      await h.open();
      assert.equal(await h.page.locator('[data-active-copy-start]').inputValue(),"2026-10-14");
      assert.equal(await h.page.locator('[data-active-copy-due]').inputValue(),"2026-10-14");
      await h.page.locator('[data-active-copy-start]').fill('2026-10-15');
      assert.equal(await h.page.locator('[data-active-copy-due]').inputValue(),"2026-10-15");
      await h.page.locator('[data-active-copy-due]').fill('2026-10-14');
      await h.page.locator('[data-active-copy-submit]').click();
      assert.equal((await h.cloud()).cuttingJobs.length,1);
      assert.equal(await h.page.locator('[data-active-copy-due]').evaluate(el=>el.validity.rangeUnderflow),true);
      await h.page.locator('[data-active-copy-due]').fill('2026-10-15');
      await h.page.evaluate(()=>{
        window.__copyCalls=0;window.__realCreate=createCuttingJob;
        window.createCuttingJob=job=>{window.__copyCalls++;return new Promise(resolve=>{window.__releaseCopy=()=>window.__realCreate(job).then(resolve);});};
      });
      await h.page.locator('[data-active-copy-submit]').click();
      await h.page.locator('[data-active-copy-form]').dispatchEvent('submit');
      assert.equal(await h.page.locator('#makeActiveCopyModal').isVisible(),true);
      assert.equal(await h.page.evaluate(()=>window.__copyCalls),1);
      assert.equal(await h.page.locator('[data-active-copy-submit]').isDisabled(),true);
      await h.page.evaluate(()=>window.__releaseCopy());
      await h.page.locator('#makeActiveCopyModal').waitFor({state:'hidden'});
      const after=await h.cloud(),copy=after.cuttingJobs.find(job=>job.id!=='polish-other');
      assert.ok(copy);assert.equal(copy.startISO,'2026-10-15');assert.equal(copy.cat,'blanco');assert.equal(copy.projectNumber,'1254');
      assert.equal(copy.pathLength,.5005);assert.equal(copy.pathWidth,1.125);
      assert.deepEqual(after.completedCuttingJobs,before);
      assert.equal(await h.page.evaluate(()=>window.jobCategoryFilter),'blanco');
      assert.equal(await h.page.locator(`tr[data-job-row="${copy.id}"]`).isVisible(),true);
      assert.deepEqual(h.errors,[]);
    }finally{await h.context.close();}
  });

  await t.test("definite failure retains dialog, feedback and dates; retry uses the same ID",async()=>{
    const h=await fixture();try{
      const before=(await h.cloud()).completedCuttingJobs;
      await h.page.evaluate(()=>{
        window.__realCreate=createCuttingJob;window.__attemptIds=[];
        window.createCuttingJob=async job=>{window.__attemptIds.push(job.id);return window.__attemptIds.length===1?{saved:false,verified:false,definiteFailure:true,stateWriteAttempted:false,error:"Fixture write rejected"}:window.__realCreate(job);};
      });
      await h.open();await h.page.locator('[data-active-copy-submit]').click();
      await h.page.getByText(/Fixture write rejected/).waitFor();
      assert.equal(await h.page.locator('#makeActiveCopyModal').isVisible(),true);
      assert.equal(await h.page.locator('[data-active-copy-submit]').isEnabled(),true);
      assert.equal((await h.cloud()).cuttingJobs.length,1);
      await h.page.locator('[data-active-copy-submit]').click();
      await h.page.locator('#makeActiveCopyModal').waitFor({state:'hidden'});
      assert.equal(new Set(await h.page.evaluate(()=>window.__attemptIds)).size,1);
      assert.equal((await h.cloud()).cuttingJobs.length,2);assert.deepEqual((await h.cloud()).completedCuttingJobs,before);
      assert.deepEqual(h.errors,[]);
    }finally{await h.context.close();}
  });

  await t.test("real write-gate rejection keeps the dialog open without changing cloud data",async()=>{
    const h=await fixture();try{
      const before=await h.cloud();
      await h.open();
      await h.page.evaluate(()=>{hasPendingLocalChanges=true;});
      await h.page.locator('[data-active-copy-submit]').click();
      await h.page.getByText(/Current authoritative revision and write permission are required/).waitFor();
      assert.equal(await h.page.locator('#makeActiveCopyModal').isVisible(),true);
      assert.deepEqual(await h.cloud(),before);
      assert.deepEqual(h.errors,[]);
    }finally{await h.context.close();}
  });

  await t.test("indeterminate acknowledgement keeps dialog open and prevents retry",async()=>{
    const h=await fixture();try{
      await h.page.evaluate(()=>{
        window.__copyCalls=0;
        window.createCuttingJob=async()=>{window.__copyCalls++;return{saved:false,verified:false,indeterminate:true,requiresReload:true,stateWriteCompleted:true,error:"Fixture acknowledgement unknown"};};
      });
      await h.open();await h.page.locator('[data-active-copy-submit]').click();
      await h.page.getByText(/Reload and verify the active list/).waitFor();
      assert.equal(await h.page.locator('#makeActiveCopyModal').isVisible(),true);
      assert.equal(await h.page.locator('[data-active-copy-submit]').isDisabled(),true);
      await h.page.locator('[data-active-copy-form]').dispatchEvent('submit');
      assert.equal(await h.page.evaluate(()=>window.__copyCalls),1);assert.deepEqual(h.errors,[]);
    }finally{await h.context.close();}
  });

  await t.test("Actions trigger stays in its cell at narrow widths/DPR and popup still opens",async()=>{
    for(const dpr of [1,1.25,1.5]){
      const h=await fixture(dpr);try{
        for(const width of [1280,1024,800,390]){
          await h.page.setViewportSize({width,height:800});
          for(const kind of ['job','history']){
            const id=kind==='job'?'polish-other':'polish-source',button=h.page.locator(`[data-${kind}-actions-toggle="${id}"]`);
            await button.scrollIntoViewIfNeeded();
            const rects=await button.evaluate(el=>{const b=el.getBoundingClientRect(),c=el.closest('td').getBoundingClientRect();return{left:b.left,right:b.right,top:b.top,bottom:b.bottom,cellLeft:c.left,cellRight:c.right,cellTop:c.top,cellBottom:c.bottom};});
            assert.ok(rects.left>=rects.cellLeft&&rects.right<=rects.cellRight+.5&&rects.top>=rects.cellTop&&rects.bottom<=rects.cellBottom+.5,JSON.stringify({dpr,width,kind,rects}));
            await button.focus();assert.equal(await button.evaluate(el=>document.activeElement===el),true);await h.page.keyboard.press('Enter');
            const menu=h.page.locator(`[data-${kind}-actions-menu="${id}"]`),rect=await menu.boundingBox();
            assert.ok(rect.x>=7&&rect.x+rect.width<=width-7&&rect.y>=7&&rect.y+rect.height<=793,JSON.stringify({dpr,width,kind,rect}));
            await h.page.keyboard.press('Escape');assert.equal(await menu.isVisible(),false);
          }
        }
        assert.deepEqual(h.errors,[]);
      }finally{await h.context.close();}
    }
  });

  await t.test("dimension entry previews without caret movement, normalizes on blur and saves full precision",async()=>{
    const h=await fixture();try{
      const before=(await h.cloud()).completedCuttingJobs;
      await h.page.locator('[data-job-add-toggle]').click();
      await h.page.locator('#jobName').fill('Precision entry');await h.page.locator('#jobEst').fill('2');
      await h.page.locator('#jobCategory').selectOption('blanco');
      await h.page.locator('#jobMaterial').selectOption({index:1});await h.page.locator('#jobMaterialThickness').fill('1/4');
      await h.page.locator('#jobMaterialWidthFt').fill('1.125');
      await h.page.locator('#jobMaterialLengthFt').fill('0.5005');
      const beforeBlur=await h.page.locator('#jobMaterialLengthFt').evaluate(el=>({value:el.value,caret:el.selectionStart}));
      assert.equal(beforeBlur.value,'0.5005');assert.equal(beforeBlur.caret,6);
      assert.match(await h.page.locator('#jobMaterialLengthPreview').innerText(),/0'-6"/);
      const cost=await h.page.locator('#jobMaterialCost').inputValue();
      await h.page.locator('#jobMaterialLengthFt').blur();
      assert.equal(await h.page.locator('#jobMaterialLengthFt').inputValue(),`0'-6"`);
      assert.equal(await h.page.locator('#jobMaterialCost').inputValue(),cost);
      assert.equal(await h.page.evaluate(()=>window.jobAddDraft.materialLengthFt),'0.5005');
      await h.page.locator('#addJobForm button[type="submit"]').click();
      await h.page.waitForFunction(()=>window.cuttingJobs.some(job=>job.name==='Precision entry'));
      const after=await h.cloud(),added=after.cuttingJobs.find(job=>job.name==='Precision entry');
      assert.equal(added.pathLength,.5005);assert.equal(added.pathWidth,1.125);assert.deepEqual(after.completedCuttingJobs,before);assert.deepEqual(h.errors,[]);
    }finally{await h.context.close();}
  });
});
