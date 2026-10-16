"use strict";
// Disposable IndexedDB-backed Firebase adapter only. No production requests.
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),http=require("node:http"),path=require("node:path");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
const root=path.resolve(__dirname,"..");
test("CJ-QUICK-01C authoritative Notes persistence and failure handling",{timeout:120000},async t=>{
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,"http://localhost"),file=path.resolve(root,"."+url.pathname+(url.pathname.endsWith("/")?"index.html":""));
    if(!file.startsWith(root+path.sep)||url.pathname.split("/").some(part=>part.startsWith("."))){res.writeHead(403).end();return;}
    try{const data=await fs.readFile(file);res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"})[path.extname(file)]||"application/octet-stream"}).end(data);}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});t.after(()=>browser.close());
  async function setup(){
    const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:"block"}),page=await context.newPage(),errors=[],consoleErrors=[];
    page.setDefaultTimeout(15000);page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")consoleErrors.push(m.text());});
    await context.route("**/*",r=>new URL(r.request().url()).origin===origin?r.continue():r.fulfill({status:200,contentType:"application/javascript",body:""}));
    await page.goto(origin+"/?devsafe=1");await page.waitForFunction(()=>window.__initialAdoptComplete===true);
    await page.evaluate(async()=>{
      if(!window.OMAXDevSafe.active)throw Error("Disposable backend required");
      const job={id:"note-active",name:"Notes persistence",cutNumber:"C001",cutDateISO:"2026-10-15",cutOrderWithinDay:1,projectNumber:"1241",cat:"fixture-project",startISO:"2026-10-15",dueISO:"2026-10-16",estimateHours:2,chargeRate:200,costRate:45,material:"Steel",materialCost:10,materialQty:1,priority:1,manualLogs:[],files:[],notes:""};
      window.cuttingJobs=cuttingJobs=[job];window.completedCuttingJobs=completedCuttingJobs=[{...job,id:"note-past",cutNumber:"C002",cutDateISO:"2026-10-16",startISO:"2026-10-16",completedAtISO:"2026-10-16",actualHours:2}];
      setJobFolders([{id:"jobs_root",name:"All Jobs",parent:null,order:1},{id:"fixture-project",name:"1241 Fixtures",parent:"jobs_root",order:2}]);
      const seeded=await saveCloudNow();if(!seeded.saved)throw Error("Fixture initialization failed: "+JSON.stringify(seeded));
      location.hash="#/jobs";window.jobHistoryExpanded=true;route();
      window.__noteCalls=0;window.__noteWrites=0;window.__noteVerifiedReads=0;window.__noteLastResult=null;window.__noteToasts=[];
      const save=saveCuttingJobEdit,notify=toast,transaction=OMAXDevSafe.db.runTransaction.bind(OMAXDevSafe.db),get=FB.docRef.get.bind(FB.docRef);
      saveCuttingJobEdit=async(...args)=>{window.__noteCalls++;const result=await save(...args);window.__noteLastResult=result;return result;};
      toast=(message,...args)=>{window.__noteToasts.push(String(message));return notify(message,...args);};
      OMAXDevSafe.db.runTransaction=callback=>transaction(tx=>callback({...tx,set(ref,value,options){if(ref.path===FB.docRef.path)window.__noteWrites++;return tx.set(ref,value,options);}}));
      window.__noteOriginalTransaction=OMAXDevSafe.db.runTransaction;
      FB.docRef.get=async options=>{const result=await get(options);if(options?.source==="server"&&window.__noteWrites>0)window.__noteVerifiedReads++;return result;};
      window.__noteOriginalGet=FB.docRef.get;
    });
    return{page,errors,consoleErrors,close:()=>context.close()};
  }
  const backend=page=>page.evaluate(async()=>{const snapshot=await OMAXDevSafe.db.doc(FB.docRef.path).get();if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)throw Error("Committed fixture read required");return snapshot.data();});
  const job=(state,id)=>[...state.cuttingJobs,...state.completedCuttingJobs].find(j=>j.id===id);
  const withoutRevision=state=>Object.fromEntries(Object.entries(state).filter(([key])=>key!=="syncMeta"));
  async function open(page,id){await page.locator(`[data-job-note="${id}"]`).click();await page.locator("#jobNoteModal").waitFor({state:"visible"});await page.waitForFunction(()=>document.activeElement===document.querySelector("#jobNoteModalInput"));}
  async function save(page,text,another=false){await page.locator("#jobNoteModalInput").fill(text);await page.evaluate(()=>{window.__noteLastResult=null;});await page.locator(another?"#jobNoteModal [data-note-save-new]":"#jobNoteModal [data-note-save]").click();await page.waitForFunction(()=>window.__noteLastResult!==null&&!document.querySelector("#jobNoteModal").hasAttribute("aria-busy"));return page.evaluate(()=>window.__noteLastResult);}
  async function reload(page){await page.reload();await page.waitForFunction(()=>window.__initialAdoptComplete===true&&window.__cloudLoadAttemptComplete===true);await page.evaluate(()=>{location.hash="#/jobs";window.jobHistoryExpanded=true;route();});}
  async function centered(page){const geometry=await page.locator("#jobNoteModal").evaluate(el=>{const b=el.getBoundingClientRect(),d=el.querySelector(".job-note-modal").getBoundingClientRect();return{insideCard:!!el.closest(".job-main-block"),x:b.x,y:b.y,w:b.width,h:b.height,cx:d.x+d.width/2,cy:d.y+d.height/2,width:innerWidth,height:innerHeight};});assert.equal(geometry.insideCard,false);assert.equal(geometry.x,0);assert.equal(geometry.y,0);assert.equal(geometry.w,geometry.width);assert.equal(geometry.h,geometry.height);assert.ok(Math.abs(geometry.cx-geometry.width/2)<1&&Math.abs(geometry.cy-geometry.height/2)<1);}
  const layout=page=>page.locator(".job-table").evaluateAll(tables=>tables.map(table=>({width:table.getBoundingClientRect().width,columns:[...table.querySelector("thead tr").cells].map(c=>c.getBoundingClientRect().width),cardScroll:table.closest(".job-main-block").scrollWidth,cardClient:table.closest(".job-main-block").clientWidth})));

  for(const id of ["note-active","note-past"])await t.test(`${id}: Save, two notes, refresh, route reopen, Cancel and no duplicate writes`,async()=>{
    const f=await setup(),p=f.page;try{
      const before=await backend(p),geometry=await layout(p);await open(p,id);await centered(p);
      let result=await save(p,"First note",true);assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);await p.waitForFunction(()=>!document.querySelector("#jobNoteModal").hidden&&document.querySelector("#jobNoteModalInput").value==="First note\n\n");
      assert.equal(job(await backend(p),id).notes,"First note");assert.equal(await p.evaluate(()=>window.__noteWrites),1);assert.ok(await p.evaluate(()=>window.__noteVerifiedReads>0));
      result=await save(p,"First note\n\nSecond note");assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);await p.locator("#jobNoteModal").waitFor({state:"hidden"});
      const expected=structuredClone(before);job(expected,id).notes="First note\n\nSecond note";assert.deepEqual(withoutRevision(await backend(p)),withoutRevision(expected));assert.equal(await p.evaluate(()=>window.__noteWrites),2);assert.deepEqual(await layout(p),geometry);
      await open(p,id);result=await save(p,"First note\n\nSecond note");assert.equal(result.noOp,true);assert.equal(await p.evaluate(()=>window.__noteWrites),2);
      await reload(p);assert.equal(job(await backend(p),id).notes,"First note\n\nSecond note");await open(p,id);await centered(p);assert.deepEqual(await p.locator("#jobNoteModalHistory .job-note-history-entry").allTextContents(),["First note","Second note"]);
      await p.locator("#jobNoteModalInput").fill("Cancelled draft");await p.locator("#jobNoteModal [data-note-cancel]").last().click();assert.deepEqual(withoutRevision(await backend(p)),withoutRevision(expected));
      await p.evaluate(()=>{location.hash="#/";route();location.hash="#/jobs";route();});await open(p,id);assert.equal(await p.locator("#jobNoteModalInput").inputValue(),"First note\n\nSecond note");assert.deepEqual(await layout(p),geometry);assert.deepEqual(f.errors,[]);assert.deepEqual(f.consoleErrors,[]);
    }finally{await f.close();}
  });
  await t.test("waits for authoritative readback; duplicate clicks and dismissal cannot race a pending save",async()=>{
    const f=await setup(),p=f.page;try{
      await p.evaluate(()=>{const get=window.__noteOriginalGet;FB.docRef.get=async options=>{if(options?.source==="server"&&window.__noteWrites){window.__noteReadWaiting=true;await new Promise(resolve=>{window.__noteReleaseRead=resolve;});}return get(options);};});
      await open(p,"note-active");await p.locator("#jobNoteModalInput").fill("Only once");await p.locator("#jobNoteModal [data-note-save]").click();await p.waitForFunction(()=>window.__noteReadWaiting===true);
      assert.equal(job(await backend(p),"note-active").notes,"Only once");assert.equal(await p.evaluate(()=>window.cuttingJobs[0].notes),"");assert.equal(await p.locator("#jobNoteModal [data-note-save]").isDisabled(),true);assert.equal(await p.locator("#jobNoteModalInput").getAttribute("readonly"),"");
      await p.locator("#jobNoteModal [data-note-save]").dispatchEvent("click");await p.locator("#jobNoteModalInput").press("Escape");assert.equal(await p.locator("#jobNoteModal").isVisible(),true);assert.equal(await p.evaluate(()=>window.__noteCalls),1);assert.equal(await p.evaluate(()=>window.__noteToasts.includes("Notes updated")),false);
      await p.evaluate(()=>window.__noteReleaseRead());await p.locator("#jobNoteModal").waitFor({state:"hidden"});assert.equal(await p.evaluate(()=>window.__noteWrites),1);assert.equal(await p.evaluate(()=>window.__noteToasts.filter(m=>m==="Notes updated").length),1);await reload(p);assert.equal(job(await backend(p),"note-active").notes,"Only once");assert.deepEqual(f.errors,[]);assert.deepEqual(f.consoleErrors,[]);
    }finally{await f.close();}
  });
  for(const id of ["note-active","note-past"])await t.test(`${id}: denied backend write retains draft, never claims success, and can retry`,async()=>{
    const f=await setup(),p=f.page;try{
      const before=await backend(p);await p.evaluate(()=>{OMAXDevSafe.db.runTransaction=async()=>{throw Object.assign(Error("Disposable note write denied"),{code:"permission-denied"});};});await open(p,id);let result=await save(p,"Retry this draft");assert.equal(result.saved,false);assert.equal(result.indeterminate,false);assert.deepEqual(await backend(p),before);assert.equal(await p.locator("#jobNoteModalInput").inputValue(),"Retry this draft");assert.equal(await p.locator("#jobNoteModal").isVisible(),true);assert.equal(await p.evaluate(()=>window.__noteToasts.includes("Notes updated")),false);assert.equal(await p.locator("#jobNoteModal [data-note-save]").isDisabled(),false);
      await p.evaluate(()=>{OMAXDevSafe.db.runTransaction=window.__noteOriginalTransaction;});result=await save(p,"Retry this draft");assert.equal(result.saved,true,result.error);assert.equal(result.verified,true);await reload(p);assert.equal(job(await backend(p),id).notes,"Retry this draft");await open(p,id);assert.deepEqual(await p.locator("#jobNoteModalHistory .job-note-history-entry").allTextContents(),["Retry this draft"]);assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  });
  await t.test("Recovery Mode blocks both note entry points without local mutation or false success",async()=>{
    const f=await setup(),p=f.page;try{const before=await backend(p);await p.evaluate(()=>{window.__autosaveDisabled=true;window.__recoveryInspectMode=true;});for(const id of ["note-active","note-past"]){await open(p,id);const result=await save(p,"Must not save");assert.equal(result.saved,false);assert.equal(result.stateWriteAttempted,false);assert.equal(await p.locator("#jobNoteModalInput").inputValue(),"Must not save");await p.locator("#jobNoteModalInput").press("Escape");}assert.deepEqual(await backend(p),before);assert.equal(await p.evaluate(()=>window.__noteWrites),0);assert.equal(await p.evaluate(()=>window.__noteToasts.includes("Notes updated")),false);assert.deepEqual(f.errors,[]);}finally{await f.close();}
  });
  await t.test("a stale remote revision blocks Notes without overwriting concurrent changes",async()=>{
    const f=await setup(),p=f.page;try{await p.evaluate(async()=>{const remote=(await OMAXDevSafe.db.doc(FB.docRef.path).get()).data();remote.syncMeta.rev++;remote.syncMeta.updatedBy="another-fixture-client";remote.cuttingJobs[0].notes="Concurrent server note";await OMAXDevSafe.db.doc(FB.docRef.path).set(remote);});const before=await backend(p);for(const id of ["note-active","note-past"]){await open(p,id);const result=await save(p,"Stale draft");assert.equal(result.saved,false);assert.equal(result.stateWriteAttempted,false);assert.equal(await p.locator("#jobNoteModalInput").inputValue(),"Stale draft");await p.locator("#jobNoteModalInput").press("Escape");}assert.deepEqual(await backend(p),before);assert.equal(await p.evaluate(()=>window.__noteWrites),0);assert.equal(await p.evaluate(()=>window.__noteToasts.includes("Notes updated")),false);assert.deepEqual(f.errors,[]);}finally{await f.close();}
  });
  for(const id of ["note-active","note-past"])await t.test(`${id}: committed but unverified save suspends retry; reload recovers exactly one note`,async()=>{
    const f=await setup(),p=f.page;try{
      await p.evaluate(()=>{const get=window.__noteOriginalGet;FB.docRef.get=options=>{if(options?.source==="server"&&window.__noteWrites)throw Error("Disposable verification unavailable");return get(options);};});await open(p,id);const result=await save(p,"Committed once");assert.equal(result.saved,false);assert.equal(result.indeterminate,true);assert.equal(result.requiresReload,true);assert.equal(await p.locator("#jobNoteModalInput").inputValue(),"Committed once");assert.equal(await p.locator("#jobNoteModal").isVisible(),true);assert.equal(await p.locator("#jobNoteModal [data-note-save]").isDisabled(),true);assert.equal(await p.evaluate(()=>window.__recoveryInspectMode),true);assert.equal(await p.evaluate(()=>window.__noteToasts.includes("Notes updated")),false);assert.equal(job(await backend(p),id).notes,"Committed once");
      await p.locator("#jobNoteModal [data-note-save]").dispatchEvent("click");assert.equal(await p.evaluate(()=>window.__noteCalls),1);assert.equal(await p.evaluate(()=>window.__noteWrites),1);await reload(p);await open(p,id);assert.deepEqual(await p.locator("#jobNoteModalHistory .job-note-history-entry").allTextContents(),["Committed once"]);assert.equal(job(await backend(p),id).id,id);assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  });
});
