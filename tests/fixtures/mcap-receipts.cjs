"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs/promises");
async function receipts({step,a,b,read,exact,ready,seedDoc,member,OWNER,STORAGE,legacy}){
  const index=()=>a.evaluate(async()=>(await FB.db.doc("workspaces/github-prod/app/stateIndexV1").get({source:"server"})).data());
  const unchanged=async(state,pointer)=>{await exact(a,state);assert.deepEqual(await index(),pointer);for(const key of ["receiptTrackerWeeks","weeklyCostReports"])assert.deepEqual(await a.evaluate(key=>window[key],key),state[key],"Live "+key);assert.deepEqual(await a.evaluate(async()=>(await FB.docRef.get({source:"server"})).data()),legacy);};
  const open=async()=>{
    await a.evaluate(()=>location.hash="#/costs");await a.locator("[data-cost-receipt-open]").click();
    await a.locator("[data-receipt-new-order]").click();await a.locator("[data-purchase-order-editor]").waitFor();
  };
  const field=(row,key)=>a.locator("[data-purchase-order-items] tr").nth(row).locator(`[data-order-field="${key}"]`);
  const submit=async()=>{
    await a.locator("[data-purchase-order-save]").click();
    await a.waitForFunction(()=>document.querySelector("[data-purchase-order-editor]")?.hidden||Boolean(document.querySelector("[data-purchase-order-status]")?.textContent&&!document.querySelector("[data-purchase-order-status]").textContent.startsWith("Saving order")),null,{timeout:120000});
  };
  const saved=async()=>{await submit();assert.equal(await a.locator("[data-purchase-order-editor]").isHidden(),true,await a.locator("[data-purchase-order-status]").textContent());};
  const conserve=(before,after)=>{
    for(const key of Object.keys(before))if(!["receiptTrackerWeeks","syncMeta","saveMeta","syncProcessLog"].includes(key))assert.deepEqual(after[key],before[key],key);
    const retained=state=>state.receiptTrackerWeeks.map(week=>({...week,rows:week.rows.filter(row=>row.orderId!==orderId)}));
    assert.deepEqual(retained(after),retained(before),"Every other receipt and all week metadata remain exact");
  };
  const converge=async state=>{await a.reload();await ready(a);await exact(a,state);await b.waitForFunction(rev=>window.__loadedCloudRevisionForSaveGuard===rev,state.syncMeta.rev);await exact(b,state);};
  let orderId,lineIds;
  await step("receipt native invalid preview and cancelled order never write",async()=>{
    const before=await read(a),pointer=await index();await open();
    await field(0,"purchased").fill("Cancelled synthetic receipt");await field(0,"qty").fill("1.5");
    assert.equal(await a.locator("[data-purchase-order-save]").isDisabled(),true);
    await field(0,"qty").fill("1");await a.locator("[data-purchase-order-shipping]").fill("1");
    assert.equal(await a.locator("[data-purchase-order-save]").isDisabled(),true);
    await a.locator("[data-purchase-order-cancel]").click();await a.locator("[data-receipt-close]").click();await unchanged(before,pointer);
  });
  await step("receipt native two-line order verifies allocations and preserves complete authority",async()=>{
    const before=await read(a);await open();
    await a.locator("[data-purchase-order-date]").fill("2026-11-24");
    await a.locator("[data-purchase-order-shipping]").fill("20");await a.locator("[data-purchase-order-tax]").fill("5");await a.locator("[data-purchase-order-po]").fill("0001250-AB");
    await field(0,"inventoryItemId").selectOption("emulator_archive_inventory");assert.equal(await field(0,"purchased").inputValue(),"Synthetic retained service stock");
    await field(0,"partNumber").fill("000-PART");await field(0,"cost").fill("10");await field(0,"qty").fill("3");
    await a.locator("[data-purchase-order-add]").click();await field(1,"purchased").fill('Synthetic "receipt" & second line');await field(1,"cost").fill("70");
    assert.match(await a.locator("[data-purchase-order-preview]").textContent(),/\$125\.00/);
    assert.deepEqual(await a.locator("[data-order-allocation]").allTextContents(),["$6.00","$14.00"]);assert.deepEqual(await a.locator("[data-order-tax-allocation]").allTextContents(),["$1.50","$3.50"]);
    ({orderId,lineIds}=await a.evaluate(()=>({orderId:window.__purchaseOrderDraftSession.draft.orderId,lineIds:window.__purchaseOrderDraftSession.draft.items.map(row=>row.lineId)})));
    await saved();const after=await read(a),rows=after.receiptTrackerWeeks.flatMap(week=>week.rows).filter(row=>row.orderId===orderId);
    assert.ok(after.syncMeta.rev>before.syncMeta.rev);assert.deepEqual(rows.map(row=>row.lineId),lineIds);assert.deepEqual(rows.map(row=>row.shipping),[6,14]);assert.deepEqual(rows.map(row=>row.tax),[1.5,3.5]);assert.deepEqual(rows.map(row=>row.poNumber),["0001250-AB","0001250-AB"]);
    assert.equal(rows[0].inventoryItemId,"emulator_archive_inventory");assert.equal(rows[0].taskId,"emulator_archive_task");
    conserve(before,after);
    await converge(after);
  });
  await step("receipt native denied edit retains draft and owner retry moves exact IDs across weeks",async()=>{
    const before=await read(a),pointer=await index();await a.locator("[data-cost-receipt-open]").click();await a.locator(`[data-receipt-edit-order="${orderId}"]`).click();
    await a.locator("[data-purchase-order-date]").fill("2026-11-19");await field(0,"qty").fill("4");
    const draft=await a.evaluate(()=>JSON.parse(JSON.stringify(window.__purchaseOrderDraftSession.draft))),denials=[];let attempted=false;
    const watch=response=>{if(response.url().startsWith("http://"+STORAGE+"/")&&response.status()===403&&response.request().method()==="POST")denials.push(response.url());};
    const objectUrls="http://"+STORAGE+"/**",denyUpload=async route=>{
      const request=route.request(),url=new URL(request.url()),object=url.searchParams.get("name")||decodeURIComponent(url.pathname.split("/o/")[1]||"");
      if(!attempted&&request.method()==="POST"&&object.includes("/state-shards/v1/")){
        await seedDoc("workspaces/github-prod/members/"+OWNER,member("viewer"));attempted=true;
      }
      return route.continue();
    };
    a.on("response",watch);await a.route(objectUrls,denyUpload);
    try{
      await submit();assert.equal(await a.locator("[data-purchase-order-editor]").isHidden(),false);assert.equal(attempted,true,"The real upload must reach the denial barrier");assert.ok(denials.length,"Actual Storage rules must deny the staged write");
      assert.equal(await a.locator("[data-purchase-order-save]").isEnabled(),true);assert.equal(await field(0,"qty").inputValue(),"4");
      assert.deepEqual(await a.evaluate(()=>JSON.parse(JSON.stringify(window.__purchaseOrderDraftSession.draft))),draft);
    }finally{a.off("response",watch);await a.unroute(objectUrls,denyUpload);await seedDoc("workspaces/github-prod/members/"+OWNER,member("owner"));}
    await unchanged(before,pointer);
    await saved();const after=await read(a),rows=after.receiptTrackerWeeks.flatMap(week=>week.rows).filter(row=>row.orderId===orderId);
    assert.deepEqual(rows.map(row=>row.lineId),lineIds);assert.deepEqual(rows.map(row=>row.date),["2026-11-19","2026-11-19"]);assert.deepEqual(rows.map(row=>row.shipping),[7.27,12.73]);assert.deepEqual(rows.map(row=>row.tax),[1.82,3.18]);
    assert.equal(after.receiptTrackerWeeks.find(week=>week.key==="2026-W48").rows.some(row=>row.orderId===orderId),false);
    assert.equal(after.receiptTrackerWeeks.find(week=>week.key==="2026-W47").rows.filter(row=>row.orderId===orderId).length,2);
    const expected=await a.evaluate(({before,orderId})=>OMAXPurchaseOrders.openSaved(before,orderId).expected,{before,orderId});
    const backup=await a.evaluate(()=>JSON.parse(localStorage.getItem("omax_purchase_order_edit_backup_v1")));assert.deepEqual(backup.expected,expected);assert.equal(backup.path,"workspaces/github-prod/app/stateIndexV1");assert.equal(backup.backend,"sharded");
    conserve(before,after);
    await converge(after);
  });
  await step("receipt native legacy price edit preserves fractional quantity, provenance and other orders",async()=>{
    const before=await read(a);await a.locator("[data-cost-receipt-open]").click();await a.locator("[data-receipt-week-select]").selectOption("2026-W48");
    const cost=a.locator("[data-receipt-legacy-rows] [data-col=cost]").first();
    assert.equal(await a.locator("[data-receipt-legacy-rows] [data-col=qty]").first().inputValue(),"1.5");
    await a.evaluate(()=>{window.__mcapReceiptSave=null;const save=window.saveCloudNow;window.saveCloudNow=async(...args)=>{const result=await save(...args);window.__mcapReceiptSave=result;return result;};});
    await cost.fill("2.50");await a.locator("[data-receipt-save-week]").click();
    await a.waitForFunction(()=>window.__mcapReceiptSave!==null,null,{timeout:120000});
    const result=await a.evaluate(()=>window.__mcapReceiptSave);assert.equal(result.saved,true,JSON.stringify(result));assert.equal(result.stateWriteCompleted,true);assert.equal(result.indeterminate===true,false);
    const after=await read(a),expected=structuredClone(before.receiptTrackerWeeks);expected.find(week=>week.key==="2026-W48").rows[0].cost=2.5;
    assert.deepEqual(after.receiptTrackerWeeks,expected);for(const key of Object.keys(before))if(!["receiptTrackerWeeks","syncMeta","saveMeta","syncProcessLog"].includes(key))assert.deepEqual(after[key],before[key],key);
    await converge(after);
  });
  await step("receipt native weekly and range exports and financial report remain read-only",async()=>{
    const before=await read(a),pointer=await index(),download=async selector=>{
      const event=a.waitForEvent("download");await a.locator(selector).click();const file=await event,html=await fs.readFile(await file.path(),"utf8");
      return{name:file.suggestedFilename(),document:await a.evaluate(html=>{const doc=new DOMParser().parseFromString(html,"text/html");return{title:doc.querySelector("h2")?.textContent,tables:Array.from(doc.querySelectorAll("table"),table=>({headers:Array.from(table.querySelectorAll("thead th"),cell=>cell.textContent),rows:Array.from(table.querySelectorAll("tbody tr"),row=>Array.from(row.querySelectorAll("td"),cell=>cell.textContent)),footer:Array.from(table.querySelectorAll("tfoot td"),cell=>cell.textContent)}))};},html)};
    };
    await a.locator("[data-cost-receipt-open]").click();await a.locator("[data-receipt-week-select]").selectOption("2026-W47");
    const week=await download("[data-receipt-export-week]");assert.equal(week.name,"receipt-week-2026-W47.xls");assert.equal(week.document.title,"Purchase History — Weekly Export");assert.equal(week.document.tables[0].rows.length,3);assert.equal(week.document.tables[0].footer.at(-1),"139.75");
    assert.ok(week.document.tables[0].rows.some(row=>row[1]==='Synthetic "receipt" & second line'&&row[2]==="0001250-AB"&&row.at(-1)==="85.91"));
    assert.ok(week.document.tables[0].rows.some(row=>row[3]==="000-PART"&&row.at(-1)==="49.09"));
    await a.locator("[data-receipt-range-select]").selectOption("all");const range=await download("[data-receipt-export-range]");assert.equal(range.name,"receipt-range-all.xls");assert.equal(range.document.tables[0].rows.length,4);assert.equal(range.document.tables[0].footer.at(-1),"143.75");
    await a.locator("[data-receipt-close]").click();await a.locator("[data-cost-weekly-select]").selectOption("2026-10-26");const selected=await a.locator("[data-cost-weekly-select]").inputValue();
    const report=await download("[data-cost-weekly-export]");assert.equal(report.name,`weekly-cost-report-${selected}.xls`);assert.equal(report.document.title,"Weekly Cost Report");assert.equal(report.document.tables.length,2);
    assert.ok(report.document.tables[1].rows.some(row=>row[0]==="Synthetic retained service task"&&/^\$5(?:\.00)?$/.test(row.at(-1))),"Weekly report exports the retained recorded maintenance cost");
    await unchanged(before,pointer);await a.reload();await ready(a);await unchanged(before,pointer);
  });
}
receipts.initialState={
  receiptTrackerWeeks:[
    {key:"2026-W47",year:2026,week:47,startISO:"2026-11-16",endISO:"2026-11-22",customWeek:{retain:"earlier receipt week"},rows:[{date:"2026-11-17",purchased:"Retained earlier receipt",partNumber:"LEGACY-PREV",qty:1,cost:4,shipping:.5,tax:.25,custom:{evidence:"earlier original"}}]},
    {key:"2026-W48",year:2026,week:48,startISO:"2026-11-23",endISO:"2026-11-29",customWeek:{retain:"current receipt week"},rows:[{date:"2026-11-23",purchased:'Retained "legacy" & receipt',partNumber:"000-LG",qty:1.5,cost:2,shipping:.25,tax:0,custom:{evidence:"current original"}}]}
  ],
  weeklyCostReports:[{weekKey:"2026-11-16",weekStartISO:"2026-11-16",weekEndISO:"2026-11-22",totalCutCost:125,cutItems:[{id:"retained-report-cut",cost:125}],operatorNote:"Preserve this saved report",extension:{evidence:"unchanged"}}]
};
module.exports=receipts;
