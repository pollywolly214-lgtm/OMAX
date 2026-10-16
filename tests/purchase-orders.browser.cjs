"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
test("PHv2-02A real browser with disposable local backend only",{timeout:120000},async t=>{
  const root=path.resolve(__dirname,".."),server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname,file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)||pathname.split("/").some(part=>part.startsWith("."))){res.writeHead(403).end();return;}
    try{res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"})[path.extname(file)]||"text/plain"}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});t.after(()=>browser.close());
  async function fixture(){
    const context=await browser.newContext({timezoneId:"America/Chicago",viewport:{width:1280,height:900}});
    await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));page.setDefaultTimeout(12000);
    await page.clock.setFixedTime(new Date("2026-10-16T02:30:00Z"));
    const load=async()=>{await page.goto(origin+"/?devsafe=1");await page.waitForFunction(()=>window.OMAXDevSafe?.active&&window.__initialAdoptComplete);await page.evaluate(()=>{location.hash="#/costs";renderCosts();});};
    await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
    await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
    await page.evaluate(async()=>{
      if(!OMAXDevSafe.active||typeof firebase!=="undefined")throw Error("Disposable backend required");
      const ref=OMAXDevSafe.db.doc(FB.docRef.path),state=(await ref.get()).data();
      state.receiptTrackerWeeks=[{key:"2026-W42",year:2026,week:42,startISO:"2026-10-12",endISO:"2026-10-18",rows:[{date:"2026-10-13",purchased:"Untouched legacy",partNumber:"OLD",cost:2,qty:1.5,shipping:.25,tax:0,custom:{evidence:"retain"}}]}];
      await ref.set(state);
    });
    await load();await page.locator('[data-cost-receipt-open]').click();
    const cloud=()=>page.evaluate(()=>readCurrentCloudStateReadOnly());
    const open=async()=>{await page.locator('[data-receipt-new-order]').click();await page.locator('[data-purchase-order-editor]').waitFor({state:"visible"});};
    const fill=async()=>{
      await open();assert.equal(await page.locator('[data-purchase-order-date]').inputValue(),"2026-10-15");
      await page.locator('[data-purchase-order-shipping]').fill("20");
      const rows=page.locator('[data-purchase-order-items] tr');
      await rows.nth(0).locator('[data-order-field="purchased"]').fill("A");await rows.nth(0).locator('[data-order-field="cost"]').fill("10");await rows.nth(0).locator('[data-order-field="qty"]').fill("3");await rows.nth(0).locator('[data-order-field="tax"]').fill("2");
      await page.locator('[data-purchase-order-add]').click();
      await rows.nth(1).locator('[data-order-field="purchased"]').fill("B");await rows.nth(1).locator('[data-order-field="cost"]').fill("70");await rows.nth(1).locator('[data-order-field="tax"]').fill("3");
      assert.match(await page.locator('[data-purchase-order-preview]').textContent(),/\$125\.00/);
      assert.deepEqual(await page.locator('[data-order-allocation]').allTextContents(),["$6.00","$14.00"]);
    };
    const save=async()=>{
      await page.locator('[data-purchase-order-save]').click();
      await page.waitForFunction(()=>document.querySelector('[data-purchase-order-editor]').hidden||!document.querySelector('[data-purchase-order-status]').textContent.startsWith("Saving order"));
      const status=await page.locator('[data-purchase-order-status]').textContent();
      assert.equal(await page.locator('[data-purchase-order-editor]').isHidden(),true,status);
    };
    return {page,context,errors,cloud,open,fill,save};
  }
  await t.test("allocation preview, one verified append, read-only saved lines, same-date orders, reload and exports",async()=>{
    const h=await fixture();try{
      const before=await h.cloud(),legacy=before.receiptTrackerWeeks[0].rows[0];await h.fill();
      if(process.env.OMAX_PH_SCREENSHOT)await fs.writeFile(process.env.OMAX_PH_SCREENSHOT,await h.page.locator('[data-purchase-order-editor]').screenshot(),{flag:"wx"});
      const inventoryInput=h.page.locator('[data-purchase-order-items] [data-order-field="inventoryItemId"]').first();
      assert.equal(await inventoryInput.evaluate(input=>input.getBoundingClientRect().width<=input.closest("td").getBoundingClientRect().width),true,"inventory selector stays inside its column");
      await h.save();
      const first=await h.cloud(),rows=first.receiptTrackerWeeks.flatMap(week=>week.rows),ordered=rows.filter(row=>row.orderId);
      assert.equal(ordered.length,2);assert.deepEqual(ordered.map(row=>row.shipping),[6,14]);assert.equal(new Set(ordered.map(row=>row.orderId)).size,1);assert.equal(new Set(ordered.map(row=>row.lineId)).size,2);
      assert.deepEqual(rows[0],legacy);for(const key of ["inventory","pumpEff","cuttingJobs","completedCuttingJobs","totalHistory"])assert.deepEqual(first[key],before[key],key);
      const locked=h.page.locator('[data-receipt-week-rows] tr').filter({hasText:"View only"});assert.equal(await locked.count(),2);
      assert.equal(await locked.first().locator('[data-col="qty"]').getAttribute("readonly"),"");assert.equal(await locked.first().locator('[data-col="removeRow"]').isDisabled(),true);
      await h.page.locator('[data-receipt-close]').click();await h.page.locator('[data-cost-receipt-open]').click();
      const downloadEvent=h.page.waitForEvent("download");await h.page.locator('[data-receipt-export-range]').click();const download=await downloadEvent;assert.match(download.suggestedFilename(),/^receipt-range-.*\.xls$/);
      await h.open();const orderItem=h.page.locator('[data-purchase-order-items] tr').first();await orderItem.locator('[data-order-field="purchased"]').fill("Separate order");await orderItem.locator('[data-order-field="cost"]').fill("1");await h.save();
      const after=await h.cloud(),all=after.receiptTrackerWeeks.flatMap(week=>week.rows);assert.equal(all.length,4);assert.equal(new Set(all.filter(row=>row.orderId).map(row=>row.orderId)).size,2);
      await h.page.reload();await h.page.waitForFunction(()=>window.__initialAdoptComplete);assert.deepEqual((await h.cloud()).receiptTrackerWeeks,after.receiptTrackerWeeks);
      assert.equal(await h.page.locator('[data-spend-row]').count(),4);assert.deepEqual(h.errors,[]);
    }finally{await h.context.close();}
  });
  await t.test("Cancel and invalid/zero-price preview perform no writes",async()=>{
    const h=await fixture();try{
      const before=await h.cloud();await h.open();const row=h.page.locator('[data-purchase-order-items] tr').first();await row.locator('[data-order-field="purchased"]').fill("Draft");await row.locator('[data-order-field="qty"]').fill("1.5");
      assert.equal(await h.page.locator('[data-purchase-order-save]').isDisabled(),true);await row.locator('[data-order-field="qty"]').fill("1");await h.page.locator('[data-purchase-order-shipping]').fill("1");
      assert.match(await h.page.locator('[data-purchase-order-preview]').textContent(),/merchandise total is \$0/);
      await row.locator('[data-order-remove]').click();assert.equal(await h.page.locator('[data-purchase-order-items] tr').count(),0);assert.match(await h.page.locator('[data-purchase-order-preview]').textContent(),/at least one/);
      await h.page.locator('[data-purchase-order-add]').click();assert.equal(await h.page.locator('[data-purchase-order-items] tr').count(),1);
      await h.page.locator('[data-purchase-order-cancel]').click();assert.deepEqual(await h.cloud(),before);assert.deepEqual(h.errors,[]);
    }finally{await h.context.close();}
  });
  await t.test("definite rejection retains the draft; retry keeps IDs and commits once",async()=>{
    const h=await fixture();try{
      const before=await h.cloud();await h.fill();const ids=await h.page.locator('[data-order-line]').evaluateAll(rows=>rows.map(row=>row.dataset.orderLine));
      await h.page.evaluate(()=>{window.__orderRealWriter=writeAuthoritativeStateSnapshot;window.writeAuthoritativeStateSnapshot=()=>Promise.resolve(cloudSaveNoWriteFailure("fixture_permission","Fixture permission denied"));});
      await h.page.locator('[data-purchase-order-save]').click();await h.page.waitForFunction(()=>document.querySelector('[data-purchase-order-status]').textContent.includes("Fixture permission denied"));assert.deepEqual(await h.cloud(),before);
      assert.deepEqual(await h.page.locator('[data-order-line]').evaluateAll(rows=>rows.map(row=>row.dataset.orderLine)),ids);
      await h.page.evaluate(()=>{window.writeAuthoritativeStateSnapshot=window.__orderRealWriter;});await h.save();
      assert.deepEqual((await h.cloud()).receiptTrackerWeeks.flatMap(week=>week.rows).filter(row=>row.orderId).map(row=>row.lineId),ids);assert.deepEqual(h.errors,[]);
    }finally{await h.context.close();}
  });
  await t.test("uncertain completion preserves recovery and prevents a second writer call",async()=>{
    const h=await fixture();try{
      await h.fill();await h.page.evaluate(()=>{window.__orderWriteCalls=0;window.writeAuthoritativeStateSnapshot=async()=>{window.__orderWriteCalls++;return {saved:false,stateWriteAttempted:true,indeterminate:true};};});
      await h.page.locator('[data-purchase-order-save]').click();await h.page.waitForFunction(()=>window.__recoveryInspectMode===true);assert.equal(await h.page.locator('[data-purchase-order-save]').isDisabled(),true);
      await h.page.locator('[data-purchase-order-save]').dispatchEvent("click");assert.equal(await h.page.evaluate(()=>window.__orderWriteCalls),1);assert.equal((await h.cloud()).receiptTrackerWeeks.flatMap(week=>week.rows).filter(row=>row.orderId).length,0);assert.deepEqual(h.errors,[]);
    }finally{await h.context.close();}
  });
});
