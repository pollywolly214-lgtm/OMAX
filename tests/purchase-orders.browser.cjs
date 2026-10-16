"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
test("PHv2-02C real browser with disposable local backend only",{timeout:120000},async t=>{
  const root=path.resolve(__dirname,".."),server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname,file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)||pathname.split("/").some(part=>part.startsWith("."))){res.writeHead(403).end();return;}
    try{res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"})[path.extname(file)]||"text/plain"}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});t.after(()=>browser.close());
  async function fixture({autofill=false}={}){
    const context=await browser.newContext({timezoneId:"America/Chicago",viewport:{width:1280,height:900}});
    await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));page.setDefaultTimeout(12000);
    await page.clock.setSystemTime(new Date("2026-10-16T02:30:00Z"));
    const load=async()=>{await page.goto(origin+"/?devsafe=1");await page.waitForFunction(()=>window.OMAXDevSafe?.active&&window.__initialAdoptComplete);await page.evaluate(()=>{location.hash="#/costs";renderCosts();});};
    await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
    await load();assert.equal((await page.evaluate(()=>saveCloudNow())).saved,true);
    await page.evaluate(async autofill=>{
      if(!OMAXDevSafe.active||typeof firebase!=="undefined")throw Error("Disposable backend required");
      const ref=OMAXDevSafe.db.doc(FB.docRef.path),state=(await ref.get()).data();
      state.receiptTrackerWeeks=[{key:"2026-W42",year:2026,week:42,startISO:"2026-10-12",endISO:"2026-10-18",rows:[{date:"2026-10-13",purchased:"Untouched legacy",partNumber:"OLD",cost:2,qty:1.5,shipping:.25,tax:0,custom:{evidence:"retain"}}]}];
      if(autofill){
        state.inventory.push(...[{id:"fixture-inv-a",name:"Inventory Alpha",pn:"INV-A",price:10},{id:"fixture-inv-b",name:"Inventory Beta",pn:"INV-B",price:20}].map(item=>({...item,qty:0,qtyNew:0,qtyOld:0,unit:"pcs",note:"",folderId:null})));
        const task=state.tasksInterval[0];if(!task)throw Error("Expected existing task fixture");
        task.name="Task pick";task.pn="TASK-PN";task.price=7;task.inventoryId="fixture-inv-a";
        state.inventory.find(item=>item.id==="fixture-inv-a").linkedTaskId=task.id;
      }
      await ref.set(state);
    },autofill);
    await load();await page.locator('[data-cost-receipt-open]').click();
    const cloud=()=>page.evaluate(()=>readCurrentCloudStateReadOnly());
    const open=async()=>{await page.locator('[data-receipt-new-order]').click();await page.locator('[data-purchase-order-editor]').waitFor({state:"visible"});};
    const fill=async()=>{
      await open();assert.equal(await page.locator('[data-purchase-order-date]').inputValue(),"2026-10-15");
      await page.locator('[data-purchase-order-shipping]').fill("20");await page.locator('[data-purchase-order-tax]').fill("5");await page.locator('[data-purchase-order-po]').fill("0012-AB");
      const rows=page.locator('[data-purchase-order-items] tr');
      await rows.nth(0).locator('[data-order-field="purchased"]').fill("A");await rows.nth(0).locator('[data-order-field="cost"]').fill("10");await rows.nth(0).locator('[data-order-field="qty"]').fill("3");
      await page.locator('[data-purchase-order-add]').click();
      await rows.nth(1).locator('[data-order-field="purchased"]').fill("B");await rows.nth(1).locator('[data-order-field="cost"]').fill("70");
      assert.match(await page.locator('[data-purchase-order-preview]').textContent(),/\$125\.00/);
      assert.deepEqual(await page.locator('[data-order-allocation]').allTextContents(),["$6.00","$14.00"]);
      assert.deepEqual(await page.locator('[data-order-tax-allocation]').allTextContents(),["$1.50","$3.50"]);
      assert.equal(await page.locator('[data-order-field="tax"]').count(),0);
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
      assert.equal(ordered.length,2);assert.deepEqual(ordered.map(row=>row.shipping),[6,14]);assert.deepEqual(ordered.map(row=>row.tax),[1.5,3.5]);assert.deepEqual(ordered.map(row=>row.poNumber),["0012-AB","0012-AB"]);assert.equal(new Set(ordered.map(row=>row.orderId)).size,1);assert.equal(new Set(ordered.map(row=>row.lineId)).size,2);
      assert.deepEqual(rows[0],legacy);for(const key of ["inventory","pumpEff","cuttingJobs","completedCuttingJobs","totalHistory"])assert.deepEqual(first[key],before[key],key);
      const locked=h.page.locator('[data-receipt-week-rows] tr').filter({hasText:"View only"});assert.equal(await locked.count(),2);
      assert.equal(await locked.first().locator('[data-col="qty"]').getAttribute("readonly"),"");assert.equal(await locked.first().locator('[data-col="removeRow"]').isDisabled(),true);
      await h.page.locator('[data-receipt-close]').click();await h.page.locator('[data-cost-receipt-open]').click();
      const downloadEvent=h.page.waitForEvent("download");await h.page.locator('[data-receipt-export-range]').click();const download=await downloadEvent;assert.match(download.suggestedFilename(),/^receipt-range-.*\.xls$/);
      const exported=await fs.readFile(await download.path(),"utf8");assert.match(exported,/PO Num\./);assert.match(exported,/0012-AB/);assert.match(exported,/128\.25/);
      await h.open();const orderItem=h.page.locator('[data-purchase-order-items] tr').first();await orderItem.locator('[data-order-field="purchased"]').fill("Separate order");await orderItem.locator('[data-order-field="cost"]').fill("1");await h.save();
      const after=await h.cloud(),all=after.receiptTrackerWeeks.flatMap(week=>week.rows);assert.equal(all.length,4);assert.equal(new Set(all.filter(row=>row.orderId).map(row=>row.orderId)).size,2);
      const groups=h.page.locator('[data-receipt-order-id]');assert.equal(await groups.count(),2);assert.equal(await groups.nth(0).locator('table').count(),1);assert.equal(await groups.nth(0).locator('tbody tr').count(),2);assert.equal(await groups.nth(1).locator('tbody tr').count(),1);
      assert.match(await groups.nth(0).textContent(),/Order Shipping: \$20.00.*Order Tax: \$5.00.*Order Total: \$125.00/);
      assert.match(await groups.nth(1).textContent(),/PO Num: N\/A/);assert.equal(Object.hasOwn(all[3],"poNumber"),false);
      assert.equal(await h.page.locator('[data-receipt-legacy-rows] [data-col="purchased"]').first().inputValue(),"Untouched legacy");
      assert.equal(await h.page.locator('[data-receipt-week-subtotal]').textContent(),"$129.25");
      const navBefore=await h.cloud();await h.page.locator('[data-receipt-week-select]').selectOption("2026-W43");await h.page.locator('[data-receipt-week-select]').selectOption("2026-W42");assert.equal(await groups.count(),2);assert.deepEqual(await h.cloud(),navBefore);
      await h.page.reload();await h.page.waitForFunction(()=>window.__initialAdoptComplete);assert.deepEqual((await h.cloud()).receiptTrackerWeeks,after.receiptTrackerWeeks);
      assert.equal(await h.page.locator('[data-spend-row]').count(),4);
      assert.deepEqual(await h.page.locator('[data-spend-row] td:nth-child(3)').allTextContents(),["0012-AB","0012-AB","N/A","N/A"]);
      // Click the actual graph hit target, following its existing date -> spend popup route.
      const point=await h.page.locator('#costChart').evaluate(canvas=>{
        const target=canvas.__costChartTargets.find(item=>item.rowRef?.type==="spend"&&item.rowRef.dateISO==="2026-10-15");if(!target)throw Error("Missing spend graph target");
        const r=target.rect;return{x:(r.x+r.width/2)*canvas.clientWidth/canvas.width,y:(r.y+r.height/2)*canvas.clientHeight/canvas.height};
      });
      await h.page.locator('#costChart').click({position:point});
      assert.equal(await h.page.locator('#costDataCenterModal').isVisible(),true);assert.equal(await h.page.locator('[data-dc-panel="spend"]').isVisible(),true);
      assert.match(await h.page.locator('[data-dc-panel="spend"]').textContent(),/PO Num\./);
      assert.deepEqual(await h.page.locator('[data-spend-row] td:nth-child(3)').allTextContents(),["0012-AB","0012-AB","N/A","N/A"]);
      await h.page.locator('[data-spend-row]').filter({hasText:"Separate order"}).click();assert.equal(await h.page.locator('#costReceiptModal').isVisible(),true);
      assert.equal(await h.page.locator('[data-receipt-order-id]').count(),2);assert.deepEqual(h.errors,[]);
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
  await t.test("autocomplete reuses task/inventory precedence, keeps rows independent and saves references plus PO",async()=>{
    const h=await fixture({autofill:true});try{
      const before=await h.cloud();await h.open();const rows=h.page.locator('[data-purchase-order-items] tr');
      const field=(index,name)=>rows.nth(index).locator(`[data-order-field="${name}"]`);
      await field(0,"purchased").fill("Inventory Alpha");
      assert.equal(await field(0,"partNumber").inputValue(),"INV-A");assert.equal(await field(0,"cost").inputValue(),"10");assert.equal(await field(0,"inventoryItemId").inputValue(),"fixture-inv-a");
      await h.page.locator('[data-purchase-order-add]').click();await field(1,"purchased").fill("Inventory Beta");
      assert.equal(await field(1,"partNumber").inputValue(),"INV-B");assert.equal(await field(1,"cost").inputValue(),"20");assert.equal(await field(1,"inventoryItemId").inputValue(),"fixture-inv-b");
      await field(0,"purchased").fill("Task pick");assert.equal(await field(0,"partNumber").inputValue(),"TASK-PN");assert.equal(await field(0,"cost").inputValue(),"7");assert.equal(await field(0,"inventoryItemId").inputValue(),"fixture-inv-a");
      assert.equal(await field(1,"partNumber").inputValue(),"INV-B");assert.equal(await field(1,"cost").inputValue(),"20");
      await field(0,"partNumber").fill("Manual PN");await field(0,"cost").fill("9.25");await field(0,"qty").fill("2");
      await h.page.locator('[data-purchase-order-po]').fill("0001250");await h.page.locator('[data-purchase-order-tax]').fill("3");await h.page.locator('[data-purchase-order-shipping]').fill("1");
      assert.match(await h.page.locator('[data-purchase-order-preview]').textContent(),/\$42.50/);assert.deepEqual(await h.cloud(),before);
      await h.save();const after=await h.cloud(),saved=after.receiptTrackerWeeks.flatMap(week=>week.rows).filter(row=>row.orderId);
      assert.deepEqual(saved.map(row=>row.inventoryItemId),["fixture-inv-a","fixture-inv-b"]);assert.deepEqual(saved.map(row=>row.poNumber),["0001250","0001250"]);
      assert.equal(saved[0].partNumber,"Manual PN");assert.equal(saved[0].cost,9.25);assert.equal(saved[0].taskId,before.tasksInterval[0].id);
      assert.equal(saved.reduce((sum,row)=>sum+Math.round(row.shipping*100),0),100);assert.equal(saved.reduce((sum,row)=>sum+Math.round(row.tax*100),0),300);
      assert.deepEqual(after.inventory,before.inventory);assert.deepEqual(after.tasksInterval,before.tasksInterval);assert.deepEqual(after.tasksAsReq,before.tasksAsReq);
      const sourceBefore=after.receiptTrackerWeeks;
      // Detached legacy draft inputs survive regrouping and do not alter saved orders.
      const legacy=h.page.locator('[data-receipt-legacy-rows] [data-col="purchased"]').first();await legacy.fill("Legacy edited intentionally");
      await h.page.locator('[data-receipt-week-select]').selectOption("2026-W43");await h.page.locator('[data-receipt-week-select]').selectOption("2026-W42");
      assert.equal(await legacy.inputValue(),"Legacy edited intentionally");assert.equal(await h.page.locator('[data-receipt-order-id]').count(),1);
      assert.deepEqual((await h.cloud()).receiptTrackerWeeks.flatMap(week=>week.rows).filter(row=>row.orderId),saved);
      assert.deepEqual(sourceBefore[0].rows[0],before.receiptTrackerWeeks[0].rows[0]);
      if(process.env.OMAX_PH_GROUP_SCREENSHOT)await fs.writeFile(process.env.OMAX_PH_GROUP_SCREENSHOT,await h.page.locator('[data-receipt-week-groups]').screenshot(),{flag:"wx"});
      await h.page.setViewportSize({width:740,height:900});
      assert.equal(await h.page.locator('[data-receipt-order-id] .cost-weekly-table-wrap').evaluate(wrap=>getComputedStyle(wrap).overflowX==="auto"&&wrap.scrollWidth>wrap.clientWidth),true);
      assert.deepEqual(h.errors,[]);
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
  await t.test("whole saved order edits retain IDs, confirm removals, recalculate and atomically move weeks",async()=>{
    const h=await fixture();try{
      await h.fill();await h.save();let original=(await h.cloud()).receiptTrackerWeeks.flatMap(week=>week.rows).filter(row=>row.orderId),id=original[0].orderId;
      await h.open();let item=h.page.locator('[data-purchase-order-items] tr').first();await item.locator('[data-order-field="purchased"]').fill("Other order");await item.locator('[data-order-field="cost"]').fill("1");await h.save();
      const before=await h.cloud(),unrelated=before.receiptTrackerWeeks.flatMap(week=>week.rows).filter(row=>row.orderId!==id);
      await h.page.locator(`[data-receipt-edit-order="${id}"]`).click();
      assert.equal(await h.page.locator('[data-purchase-order-title]').textContent(),"Edit Purchase Order");assert.equal(await h.page.locator('[data-purchase-order-save]').textContent(),"Save Changes");
      assert.equal(await h.page.locator('[data-purchase-order-po]').inputValue(),"0012-AB");assert.equal(await h.page.locator('[data-purchase-order-shipping]').inputValue(),"20");assert.equal(await h.page.locator('[data-purchase-order-tax]').inputValue(),"5");
      assert.deepEqual(await h.page.locator('[data-order-line]').evaluateAll(rows=>rows.map(row=>row.dataset.orderLine)),original.map(row=>row.lineId));
      const rows=h.page.locator('[data-purchase-order-items] tr');await rows.nth(0).locator('[data-order-field="qty"]').fill("2");await rows.nth(0).locator('[data-order-field="cost"]').fill("50");
      h.page.once("dialog",dialog=>dialog.dismiss());await rows.nth(1).locator('[data-order-remove]').click();assert.equal(await rows.count(),2);
      h.page.once("dialog",dialog=>{assert.match(dialog.message(),/previously saved item/);return dialog.accept();});await rows.nth(1).locator('[data-order-remove]').click();assert.equal(await rows.count(),1);
      await h.page.locator('[data-purchase-order-add]').click();await rows.nth(1).locator('[data-order-field="purchased"]').fill("Added");await rows.nth(1).locator('[data-order-field="cost"]').fill("20");
      await h.page.locator('[data-purchase-order-date]').fill("2026-10-08");await h.page.locator('[data-purchase-order-po]').fill("0001250-NEW");await h.page.locator('[data-purchase-order-shipping]').fill("10.07");await h.page.locator('[data-purchase-order-tax]').fill("6.03");
      assert.match(await h.page.locator('[data-purchase-order-preview]').textContent(),/\$136.10/);assert.deepEqual(await h.cloud(),before);
      const ids=await h.page.locator('[data-order-line]').evaluateAll(rows=>rows.map(row=>row.dataset.orderLine));assert.equal(ids[0],original[0].lineId);assert.ok(!original.some(row=>row.lineId===ids[1]));
      await h.save();const after=await h.cloud(),saved=after.receiptTrackerWeeks.flatMap(week=>week.rows).filter(row=>row.orderId===id);
      assert.deepEqual(saved.map(row=>row.lineId),ids);assert.deepEqual(saved.map(row=>row.poNumber),["0001250-NEW","0001250-NEW"]);assert.ok(saved.every(row=>row.date==="2026-10-08"&&row.orderId===id));
      assert.equal(saved.reduce((sum,row)=>sum+Math.round(row.shipping*100),0),1007);assert.equal(saved.reduce((sum,row)=>sum+Math.round(row.tax*100),0),603);
      assert.deepEqual(after.receiptTrackerWeeks.flatMap(week=>week.rows).filter(row=>row.orderId!==id),unrelated);assert.equal(await h.page.locator('[data-receipt-week-select]').inputValue(),"2026-W41");
      assert.equal(await h.page.locator('[data-receipt-week-subtotal]').textContent(),"$136.10");assert.deepEqual(await h.page.evaluate(()=>JSON.parse(localStorage.getItem("omax_purchase_order_edit_backup_v1")).expected.rows),original);
      await h.page.reload();await h.page.waitForFunction(()=>window.__initialAdoptComplete);assert.deepEqual((await h.cloud()).receiptTrackerWeeks,after.receiptTrackerWeeks);assert.equal(await h.page.locator('[data-spend-row]').count(),4);
      assert.equal(await h.page.evaluate(()=>Math.round(computeCostModel().totalSpendSeries.reduce((sum,row)=>sum+row.value,0)*100)),-14035);assert.deepEqual(h.errors,[]);
    }finally{await h.context.close();}
  });
  await t.test("edit Cancel and definite failure preserve persisted order and draft; retry commits once",async()=>{
    const h=await fixture();try{
      await h.fill();await h.save();const before=await h.cloud(),id=before.receiptTrackerWeeks.flatMap(week=>week.rows).find(row=>row.orderId).orderId;
      const edit=()=>h.page.locator(`[data-receipt-edit-order="${id}"]`).click();await edit();await h.page.locator('[data-purchase-order-po]').fill("Cancelled");await h.page.locator('[data-purchase-order-cancel]').click();assert.deepEqual(await h.cloud(),before);
      await edit();await h.page.locator('[data-purchase-order-po]').fill("Retry-0001");
      await h.page.evaluate(()=>{window.__orderRealWriter=writeAuthoritativeStateSnapshot;window.writeAuthoritativeStateSnapshot=()=>Promise.resolve(cloudSaveNoWriteFailure("fixture_permission","Edit permission denied"));});
      await h.page.locator('[data-purchase-order-save]').click();await h.page.waitForFunction(()=>document.querySelector('[data-purchase-order-status]').textContent.includes("Edit permission denied"));
      assert.deepEqual(await h.cloud(),before);assert.equal(await h.page.locator('[data-purchase-order-po]').inputValue(),"Retry-0001");
      await h.page.evaluate(()=>{window.writeAuthoritativeStateSnapshot=window.__orderRealWriter;});await h.save();
      const rows=(await h.cloud()).receiptTrackerWeeks.flatMap(week=>week.rows).filter(row=>row.orderId===id);assert.equal(rows.length,2);assert.ok(rows.every(row=>row.poNumber==="Retry-0001"));assert.deepEqual(h.errors,[]);
    }finally{await h.context.close();}
  });
  await t.test("concurrent order change rejects stale edit without writing over it",async()=>{
    const h=await fixture();try{
      await h.fill();await h.save();const before=await h.cloud(),id=before.receiptTrackerWeeks.flatMap(week=>week.rows).find(row=>row.orderId).orderId;
      await h.page.locator(`[data-receipt-edit-order="${id}"]`).click();await h.page.locator('[data-purchase-order-po]').fill("Unsaved local");
      await h.page.evaluate(async id=>{const ref=OMAXDevSafe.db.doc(FB.docRef.path),state=(await ref.get()).data();state.receiptTrackerWeeks.flatMap(week=>week.rows).find(row=>row.orderId===id).purchased="Other session";state.syncMeta.rev++;await ref.set(state);},id);
      const concurrent=await h.cloud();await h.page.locator('[data-purchase-order-save]').click();await h.page.waitForFunction(()=>!document.querySelector('[data-purchase-order-status]').textContent.startsWith("Saving order"));assert.match(await h.page.locator('[data-purchase-order-status]').textContent(),/another session/);
      assert.deepEqual(await h.cloud(),concurrent);assert.equal(await h.page.locator('[data-purchase-order-po]').inputValue(),"Unsaved local");assert.deepEqual(h.errors,[]);
    }finally{await h.context.close();}
  });
  await t.test("live autocomplete changes immediately, clears and isolates rows with keyboard and mouse selection",async()=>{
    const h=await fixture({autofill:true});try{
      const before=await h.cloud();await h.open();const rows=h.page.locator('[data-purchase-order-items] tr'),name=index=>rows.nth(index).locator('[data-order-field="purchased"]');
      await name(0).fill("Alpha");assert.deepEqual(await rows.nth(0).locator('[data-order-suggestion]').allTextContents(),["Inventory Alpha"]);await rows.nth(0).locator('[data-order-suggestion]').click();
      assert.equal(await name(0).inputValue(),"Inventory Alpha");assert.equal(await rows.nth(0).locator('[data-order-field="inventoryItemId"]').inputValue(),"fixture-inv-a");
      await name(0).fill("Beta");assert.deepEqual(await rows.nth(0).locator('[data-order-suggestion]').allTextContents(),["Inventory Beta"]);await name(0).press("ArrowDown");await name(0).press("Enter");
      assert.equal(await name(0).inputValue(),"Inventory Beta");assert.equal(await rows.nth(0).locator('[data-order-field="cost"]').inputValue(),"20");
      await h.page.locator('[data-purchase-order-add]').click();await name(1).fill("Alpha");assert.equal(await rows.nth(0).locator('[data-order-suggestions]').isHidden(),true);assert.deepEqual(await rows.nth(1).locator('[data-order-suggestion]').allTextContents(),["Inventory Alpha"]);
      await name(1).fill("");assert.equal(await rows.nth(1).locator('[data-order-suggestions]').isHidden(),true);assert.equal(await rows.nth(1).locator('[data-order-suggestion]').count(),0);
      await name(1).fill("Task");await name(1).press("ArrowDown");await name(1).press("Enter");assert.equal(await rows.nth(1).locator('[data-order-field="partNumber"]').inputValue(),"TASK-PN");
      assert.equal(await rows.nth(0).locator('[data-order-field="partNumber"]').inputValue(),"INV-B");assert.deepEqual(await h.cloud(),before);assert.deepEqual(h.errors,[]);
    }finally{await h.context.close();}
  });
  await t.test("Edit Inventory uses existing Settings editor and resumes new/edit drafts with refreshed selection",async()=>{
    const h=await fixture({autofill:true});try{
      const initial=await h.cloud(),taskId=initial.tasksInterval[0].id;await h.open();let row=h.page.locator('[data-purchase-order-items] tr').first();
      await row.locator('[data-order-field="purchased"]').fill("Task pick");await row.locator('[data-order-field="qty"]').fill("3");await h.page.locator('[data-purchase-order-po]').fill("0001-resume");await h.page.locator('[data-purchase-order-shipping]').fill("2");await h.page.locator('[data-purchase-order-tax]').fill("1");
      await row.locator('[data-order-edit-inventory]').click();await h.page.waitForFunction(()=>location.hash==="#/settings");
      const task=h.page.locator(`details.task[data-task-id="${taskId}"]`);await h.page.waitForFunction(id=>document.querySelector(`details.task[data-task-id="${id}"]`)?.open,taskId);
      await task.locator('[data-edit-task]').click();await task.locator('[data-k="pn"]').fill("UPDATED-PN");await task.locator('[data-k="pn"]').press("Tab");
      await task.locator('[data-k="price"]').fill("11");await task.locator('[data-k="price"]').press("Tab");
      await h.page.waitForFunction(id=>window.tasksInterval.find(task=>task.id===id)?.price===11,taskId);
      assert.equal((await h.page.evaluate(()=>saveCloudNow())).saved,true);await h.page.waitForFunction(()=>!hasPendingLocalChanges);await h.page.locator('#tab-costs').click();await h.page.locator('[data-purchase-order-editor]').waitFor({state:"visible"});
      row=h.page.locator('[data-purchase-order-items] tr').first();assert.equal(await row.locator('[data-order-field="qty"]').inputValue(),"3");assert.equal(await row.locator('[data-order-field="cost"]').inputValue(),"11");assert.equal(await row.locator('[data-order-field="partNumber"]').inputValue(),"UPDATED-PN");assert.equal(await row.locator('[data-order-field="inventoryItemId"]').inputValue(),"fixture-inv-a");
      assert.equal(await h.page.locator('[data-purchase-order-po]').inputValue(),"0001-resume");
      await h.page.waitForFunction(()=>!hasPendingLocalChanges);const inventoryAfterSettings=(await h.cloud()).inventory;await h.save();
      const source=await h.cloud(),saved=source.receiptTrackerWeeks.flatMap(week=>week.rows).filter(row=>row.orderId),id=saved[0].orderId;
      assert.equal(saved[0].taskId,taskId);assert.equal(saved[0].cost,11);assert.deepEqual(source.inventory,inventoryAfterSettings);
      for(const item of initial.inventory){const current=source.inventory.find(row=>row.id===item.id);assert.deepEqual([current.qtyNew,current.qtyOld],[item.qtyNew,item.qtyOld]);}
      await h.page.locator(`[data-receipt-edit-order="${id}"]`).click();row=h.page.locator('[data-purchase-order-items] tr').first();await row.locator('[data-order-field="cost"]').fill("15");await h.page.locator('[data-purchase-order-po]').fill("edit draft");
      await row.locator('[data-order-edit-inventory]').click();await h.page.waitForFunction(()=>location.hash==="#/settings");await h.page.locator('#tab-costs').click();await h.page.locator('[data-purchase-order-editor]').waitFor({state:"visible"});
      assert.equal(await h.page.locator('[data-purchase-order-title]').textContent(),"Edit Purchase Order");assert.equal(await h.page.locator('[data-purchase-order-po]').inputValue(),"edit draft");assert.equal(await h.page.locator('[data-order-field="cost"]').inputValue(),"15");
      assert.deepEqual((await h.cloud()).receiptTrackerWeeks,source.receiptTrackerWeeks);assert.deepEqual(h.errors,[]);
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
