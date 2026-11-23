"use strict";
// Actual Firebase v8 SDK, Auth tokens, Firestore transactions/listeners, Storage
// uploads/downloads and cross-service security rules. NO transport stand-ins.
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const {chromium}=require(process.env.OMAX_PLAYWRIGHT_PATH||"playwright");
const {PROJECT,BUCKET,OWNER,AUTH,FIRESTORE,STORAGE,bindBrowserSource,assertEmulators}=require("./fixtures/mcap-emulator-identity.cjs");
const STATE="workspaces/github-prod/app/state",INDEX="workspaces/github-prod/app/stateIndexV1";
const REV=1794576947956;
const fields=value=>value===null?{nullValue:null}:Array.isArray(value)?{arrayValue:{values:value.map(fields)}}
  :typeof value==="object"?{mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,fields(v)]))}}
  :typeof value==="boolean"?{booleanValue:value}:typeof value==="number"?Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value}:{stringValue:value};
async function localRequest(url,options={}){
  assert.ok(["http://"+FIRESTORE,"http://"+AUTH,"http://"+STORAGE].includes(new URL(url).origin),"Local emulator endpoint required");
  const response=await fetch(url,options);
  assert.ok(response.ok,`Emulator fixture request failed: ${response.status} ${await response.clone().text()}`);
  return response;
}
const seedDoc=(p,value)=>localRequest(`http://${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${p}`,{
  method:"PATCH",headers:{Authorization:"Bearer owner","Content-Type":"application/json"},body:JSON.stringify({fields:fields(value).mapValue.fields})});
const member=role=>({schemaVersion:1,uid:OWNER,workspaceId:"github-prod",role,active:true,createdAtISO:"2026-11-23T12:00:00.000Z",updatedAtISO:"2026-11-23T12:00:00.000Z"});
function token(uid){
  const enc=v=>Buffer.from(JSON.stringify(v)).toString("base64url");
  return enc({alg:"none",typ:"JWT"})+"."+enc({iss:"mcap-test",sub:"mcap-test",aud:"https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",uid,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})+".";
}

test("real Firebase browser: active Storage saves, rules, multi-client convergence and recovery",{timeout:600000},async t=>{
  assertEmulators();
  if(process.env.MCAP_EMULATOR_ONLY){
    assert.ok(["native calendar","lost real commit","history import","archive","corrupt field","actor change","in-flight","cutting file","specialized"].includes(process.env.MCAP_EMULATOR_ONLY),"Unknown development test selection");
    assert.ok(!process.env.CI,"CI must run every real Firebase browser acceptance case");
    t.diagnostic("Development-only selection: "+process.env.MCAP_EMULATOR_ONLY);
  }
  const root=path.resolve(__dirname,".."),sdkRoot=path.dirname(require.resolve("firebase/package.json"));
  const allowed=new Set(["http://"+AUTH,"http://"+FIRESTORE,"http://"+STORAGE]);
  const sdkNames=new Set(["firebase-app.js","firebase-auth.js","firebase-firestore.js","firebase-storage.js"]);
  const sdkBytes=new Map(await Promise.all([...sdkNames].map(async name=>[name,await fs.readFile(path.join(sdkRoot,name))])));
  assert.equal(JSON.parse(await fs.readFile(path.join(sdkRoot,"package.json"),"utf8")).version,"8.10.1","Use the same SDK as the application");
  const serverErrors=[];
  const bootstrap=`
    if(location.hostname!=="127.0.0.1")throw Error("Local emulator required");
    window.FIREBASE_CONFIG={apiKey:"fake-mcap-emulator-key",projectId:${JSON.stringify(PROJECT)},authDomain:"localhost",storageBucket:${JSON.stringify(BUCKET)}};
    const emulatorApp=firebase.initializeApp(window.FIREBASE_CONFIG);
    emulatorApp.auth().useEmulator("http://${AUTH}",{disableWarnings:true});
    emulatorApp.firestore().useEmulator("127.0.0.1",8188);
    emulatorApp.storage("gs://${BUCKET}").useEmulator("127.0.0.1",9197);
    // The v8 default bucket accessor is a separate SDK instance from gs://.
    // Configure both native instances; no request transport is substituted.
    emulatorApp.storage().useEmulator("127.0.0.1",9197);
  `;
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,"http://localhost"),p=url.pathname;
      if(p.startsWith("/__sdk/")){
        const name=p.slice("/__sdk/".length);if(!sdkNames.has(name)){res.writeHead(404).end();return;}
        const body=sdkBytes.get(name);
        res.writeHead(200,{"Content-Type":"application/javascript","Cache-Control":"no-store","Content-Length":body.length}).end(body);return;
      }
      const rel=p==="/"?"index.html":p.slice(1),file=path.resolve(root,rel);
      if(!file.startsWith(root+path.sep)||p.split("/").some(x=>x.startsWith("."))){res.writeHead(403).end();return;}
      let content=await fs.readFile(file);
      if(rel.endsWith(".js")||rel==="index.html")content=bindBrowserSource(content.toString("utf8"),rel);
      if(rel==="index.html"){
        content=content.replaceAll("https://www.gstatic.com/firebasejs/8.10.1/","/__sdk/");
        const anchor='<script src="js/core.js"></script>';
        assert.ok(content.includes(anchor));content=content.replace(anchor,"<script>"+bootstrap+"</script>"+anchor);
      }
      res.writeHead(200,{"Cache-Control":"no-store","Content-Type":({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"})[path.extname(file)]||"text/plain"}).end(content);
    }catch(error){serverErrors.push(String(error));res.writeHead(500).end(String(error));}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const origin="http://127.0.0.1:"+server.address().port;allowed.add(origin);
  const browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});
  t.after(async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));});
  const deniedExternal=[],errors=[],consoleErrors=[];
  async function client(){
    const context=await browser.newContext({timezoneId:"America/Chicago",serviceWorkers:"block",acceptDownloads:true,viewport:{width:1440,height:1100}});
    await context.route("**/*",route=>{
      const uri=new URL(route.request().url());
      if(allowed.has(uri.origin))return route.continue();
      deniedExternal.push(uri.origin);return route.abort();
    });
    const page=await context.newPage();page.setDefaultTimeout(30000);
    page.on("pageerror",error=>errors.push(error.message));page.on("dialog",dialog=>dialog.dismiss());
    page.on("console",message=>{if(message.type()==="error"||message.type()==="warning")consoleErrors.push(message.text().slice(0,600));});
    await page.goto(origin+"/");
    await page.waitForFunction(()=>FB.auth&&typeof snapshotState==="function"&&window.OMAXWorkingShards);
    return page;
  }
  async function signIn(page,uid=OWNER){
    await page.evaluate(jwt=>firebase.auth().signInWithCustomToken(jwt),token(uid));
  }
  const read=page=>page.evaluate(async()=>(await OMAXAuthorityRouter.fromBrowser()).state);
  const ready=async page=>{
    try{await page.waitForFunction(()=>window.__initialAdoptComplete&&window.__cloudLoadAttemptComplete&&window.__omaxActiveStateBackend==="sharded"&&!window.__recoveryInspectMode);}
    catch(error){throw Error(error.message+" "+JSON.stringify({serverErrors,errors,consoleErrors:consoleErrors.slice(-20),deniedExternal,state:await page.evaluate(()=>({auth:typeof window.firebase?.auth,backend:window.__omaxActiveStateBackend,loaded:window.__cloudLoadAttemptComplete,adopted:window.__initialAdoptComplete,reason:window.__recoveryReason,block:window.__lastCloudSaveBlock?.reason,guard:window.__loadedCloudRevisionForSaveGuard}))}));}
  };
  // Later steps depend on the same verified clients. Stop at the first failure
  // instead of obscuring its evidence with failures caused by a broken fixture.
  const step=async(name,work)=>{
    const only=process.env.MCAP_EMULATOR_ONLY;
    if(only&&!name.startsWith("actual SDK ordinary")&&!name.includes(only))return;
    let failure;
    await t.test(name,async()=>{try{await work();}catch(error){failure=error;throw error;}});
    if(failure)throw failure;
  };
  const exact=async(page,expected)=>{
    assert.deepEqual(await read(page),expected);
    assert.deepEqual(await page.evaluate(()=>window.__lastLoadedCloudState),expected);
  };
  const a=await client();
  const legacy=await a.evaluate(({rev,owner})=>{
    const source=JSON.parse(JSON.stringify(snapshotState({skipLocalFileCacheSync:true})));
    source.syncMeta.rev=rev;source.totalHistory=[{dateISO:"2026-11-23",hours:1,fixtureOnly:true}];
    source.jobFolders.push({id:"mcap-project",name:"1241 Synthetic MCAP",projectNumber:"1241",parent:"jobs_root",order:2});
    source.tasksAsReq.push({id:"emulator_archive_task",name:"Synthetic retained service task",mode:"asreq",variant:"template",templateId:"emulator_archive_task",cat:"root",parentTask:null,order:100,inventoryId:"emulator_archive_inventory",pn:"TEST-001",price:5,downtimeHours:0.25,manualLink:"",storeLink:"",note:"Retain definition and history",completedDates:["2026-11-01"],manualHistory:[{dateISO:"2026-11-01",status:"completed",hours:0.25,calendarPrice:5,note:"Retain original completion"}],occurrenceHours:{"2026-11-01":0.25},occurrenceNotes:{"2026-11-01":"Retain historical note"},removedOccurrences:[]});
    source.inventory.push({id:"emulator_archive_inventory",linkedTaskId:"emulator_archive_task",name:"Synthetic retained service stock",qtyNew:3,qtyOld:1,unit:"pcs",price:5,folderId:null,pn:"TEST-001",note:"Retain stock identity"});
    const planned=CuttingJobDateEditing.prepareMutation(source,{type:"create",job:{id:"mcap_attachment_job",name:"Synthetic attachment acceptance",cat:"mcap-project",projectNumber:"1241",startISO:"2026-11-21",dueISO:"2026-11-22",estimateHours:1,chargeRate:100,costRate:30,material:"Steel",materialCost:5,materialQty:1,priority:1,manualLogs:[],files:[],notes:"Keep attachments outside business state"}},{audit:{operationId:"mcap_attachment_seed",actorUid:owner,atISO:"2026-11-23T12:00:00.000Z"},validateCategory:(job,state)=>CuttingJobHistory.validateManualProjectCategory(job.cat,job.projectNumber,state.jobFolders,[...state.cuttingJobs,...state.completedCuttingJobs],null).ok});
    if(!planned.ok)throw Error("Synthetic attachment job fixture is invalid: "+JSON.stringify(planned));
    return planned.nextState;
  },{rev:REV,owner:OWNER});
  await seedDoc("workspaces/github-prod/members/"+OWNER,member("owner"));
  await seedDoc(STATE,legacy);
  await signIn(a);
  await a.waitForFunction(()=>window.__initialAdoptComplete&&window.__omaxActiveStateBackend==="legacy").catch(async error=>{
    throw Error(error.message+" "+JSON.stringify({errors,consoleErrors,deniedExternal,state:await a.evaluate(()=>({user:FB.user?.uid,backend:window.__omaxActiveStateBackend,load:window.__cloudLoadAttemptComplete,adopted:window.__initialAdoptComplete,recovery:window.__recoveryReason,host:FB.db?._getSettings?.()?.host||FB.db?._settings?.host,project:FB.app?.options?.projectId}))}));
  });
  const staging=await a.evaluate(async()=>{
    const state=JSON.parse(JSON.stringify(window.__lastLoadedCloudState));
    state.mcapEmulatorOpaque=Array.from({length:1100},(_,i)=>({id:"opaque_"+i,payload:"X".repeat(1000)}));
    const staged=await OMAXWorkingShards.stage({confirmation:OMAXWorkingShards.PHRASE,app:firebase.app(),sharder:OMAXShardedState,working:OMAXWorkingStorage,cryptoApi:crypto,fetchImpl:fetch.bind(window),newId:()=>"mcap_real_fixture",now:()=>new Date().toISOString(),providedSource:state});
    window.__emulatorStaged=staged;
    const index={schemaVersion:1,mode:"active",workspaceId:"github-prod",projectId:firebase.app().options.projectId,bucket:firebase.app().options.storageBucket,revision:state.syncMeta.rev,previousRevision:0,manifestPath:staged.manifestPath,manifestSha256:staged.manifestSha256,operationId:staged.operationId,actorUid:staged.actorUid,createdAtISO:staged.createdAtISO};
    await FB.db.runTransaction(async tx=>{
      const old=await tx.get(FB.docRef),ref=FB.db.doc("workspaces/github-prod/app/stateIndexV1"),prior=await tx.get(ref);
      if(!old.exists||old.data().syncMeta.rev!==state.syncMeta.rev||prior.exists)throw Error("Fixture index precondition changed");
      tx.set(ref,index);
    });
    return {bytes:new TextEncoder().encode(OMAXShardedState.canonical(state)).length,fields:staged.fieldCount,objects:staged.archiveObjects,manifest:staged.manifestPath};
  });
  assert.ok(staging.bytes>975000);assert.ok(staging.objects>staging.fields+1);
  await a.reload();await ready(a);
  const initial=await read(a);await exact(a,initial);
  const b=await client();await signIn(b);await ready(b);await exact(b,initial);

  await step("actual SDK ordinary save, refresh and two-browser listener convergence",async()=>{
    const result=await a.evaluate(()=>saveCloudNow());assert.equal(result.saved,true,JSON.stringify(result));
    const saved=await read(a);assert.ok(saved.syncMeta.rev>initial.syncMeta.rev);
    await b.waitForFunction(rev=>window.__loadedCloudRevisionForSaveGuard===rev,saved.syncMeta.rev);
    await exact(b,saved);await a.reload();await ready(a);await exact(a,saved);
  });
  await step("specialized water, pump, materials and cutting-job commits survive real Storage reload",async()=>{
    const before=await read(a);
    const water=await a.evaluate(()=>saveWaterQualityCheck({record:{id:"emulator_water",date:"2026-11-22",time:"09:15",ppm:125,softness:"Pass",initials:"MC",note:"Synthetic real-emulator check"},legacy:[]}));
    assert.equal(water.saved,true,JSON.stringify(water));
    const pump=await a.evaluate(()=>savePumpLogChange({kind:"create",id:"emulator_pump",dateISO:"2026-11-22",rpm:500,timeISO:"10:30"}));assert.equal(pump.saved,true,JSON.stringify(pump));
    const material=await a.evaluate(()=>inventoryMaterialMutationApi.run({kind:"cell",typeId:window.__lastLoadedCloudState.inventoryMaterials.types[0].id,rowIndex:0,colIndex:0,value:"19"}));assert.equal(material.saved,true,JSON.stringify(material));
    // After the real CAS, the engine reconstructs once and the chronology
    // coordinator independently reconstructs again. Delay that final proof
    // beyond the old single-document deadline without altering any bytes.
    let committed=false,manifestDownloads=0,delayed=false,job;
    const commitUrls=new RegExp(`^http://${FIRESTORE.replaceAll(".","\\.")}/v1/projects/${PROJECT}/databases/\\(default\\)/documents:commit(?:\\?.*)?$`);
    const objectUrls=new RegExp(`^http://${STORAGE.replaceAll(".","\\.")}/v0/b/${BUCKET.replaceAll(".","\\.")}/o/`);
    const latency=async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.pathname.endsWith("/documents:commit")&&(request.postDataJSON()?.writes||[]).some(write=>write.update?.name?.endsWith("/"+INDEX))){
        const response=await route.fetch();assert.equal(response.status(),200);committed=true;return route.fulfill({response});
      }
      if(committed&&decodeURIComponent(url.pathname.split("/o/")[1]||"").includes("/state-shards/v1/_manifest/")&&url.searchParams.get("alt")==="media"&&++manifestDownloads===2){
        const response=await route.fetch();assert.equal(response.status(),200);
        await new Promise(resolve=>setTimeout(resolve,4000));delayed=true;return route.fulfill({response});
      }
      return route.continue();
    };
    await a.route(commitUrls,latency);await a.route(objectUrls,latency);
    try{job=await a.evaluate(()=>createCuttingJob({id:"emulator_job",name:"Synthetic emulator cut",cat:"mcap-project",projectNumber:"1241",startISO:"2026-11-21",dueISO:"2026-11-22",estimateHours:2,chargeRate:200,costRate:45,material:"Steel",materialCost:10,materialQty:1,priority:1,manualLogs:[],files:[],notes:"Retain exact note"}));}
    finally{await a.unroute(commitUrls,latency);await a.unroute(objectUrls,latency);}
    assert.equal(delayed,true,"Real final chronology proof exceeded the legacy deadline");assert.equal(job.saved,true,JSON.stringify(job));
    const complete=await a.evaluate(()=>completeCuttingJob("emulator_job",{completedAtISO:"2026-11-22"}));assert.equal(complete.saved,true,JSON.stringify(complete));
    const saved=await read(a),changed=new Set(["waterQualityChecks","pumpEff","inventoryMaterials","cuttingJobs","completedCuttingJobs","syncMeta"]);
    for(const key of Object.keys(before))if(!changed.has(key))assert.deepEqual(saved[key],before[key],key);
    assert.equal(saved.waterQualityChecks.filter(row=>row.id==="emulator_water").length,1);
    assert.equal(saved.pumpEff.entries.find(row=>row.id==="emulator_pump").rpm,500);
    assert.equal(saved.completedCuttingJobs.find(row=>row.id==="emulator_job").notes,"Retain exact note");
    await b.waitForFunction(rev=>window.__loadedCloudRevisionForSaveGuard===rev,saved.syncMeta.rev);await exact(b,saved);
    await a.reload();await ready(a);await exact(a,saved);
  });
  await step("stale browser cannot overwrite a newer real committed revision",async()=>{
    await b.evaluate(()=>{workspaceStateUnsubscribe();workspaceStateUnsubscribe=null;});
    const staleRev=await b.evaluate(()=>window.__loadedCloudRevisionForSaveGuard);
    const result=await a.evaluate(()=>savePumpLogChange({kind:"create",id:"emulator_newer",dateISO:"2026-11-21",rpm:510,timeISO:"11:30"}));assert.equal(result.saved,true,JSON.stringify(result));
    const saved=await read(a);assert.ok(saved.syncMeta.rev>staleRev);
    const rejected=await b.evaluate(()=>inventoryMaterialMutationApi.run({kind:"cell",typeId:window.__lastLoadedCloudState.inventoryMaterials.types[0].id,rowIndex:0,colIndex:0,value:"STALE"}));
    assert.equal(rejected.saved,false);assert.equal(rejected.stateWriteAttempted,false);await exact(a,saved);
    await b.reload();await ready(b);await exact(b,saved);
  });
  await step("in-flight two-browser native pump race retains the winner and the rejected draft",async()=>{
    const before=await read(a);await exact(a,before);await exact(b,before);
    const watch=page=>page.evaluate(()=>{
      window.__mcapRaceOutcome=null;window.__mcapRaceAction=null;
      const save=window.savePumpLogChange;
      window.savePumpLogChange=async action=>{
        window.__mcapRaceAction=JSON.parse(JSON.stringify(action));
        const result=await save(action);window.__mcapRaceOutcome=result;return result;
      };
    });
    const fill=async(page,date,rpm)=>{
      await page.locator("#pumpLogDate").fill(date);await page.locator("#pumpLogTime").fill("14:15");
      await page.locator("#pumpLogRPM").fill(String(rpm));
    };
    await watch(a);await watch(b);
    await fill(a,"2026-10-24",540);await fill(b,"2026-10-25",541);
    let release,signal,timer,held=false;const statuses=[];
    const gate=new Promise(resolve=>{release=resolve;});
    const reached=new Promise((resolve,reject)=>{signal=resolve;timer=setTimeout(()=>reject(Error("Native contender never reached the index-commit barrier")),60000);});
    // Match only an already-allowlisted emulator endpoint. Avoid installing
    // and removing a catch-all fallback while native listener traffic is live.
    const commitUrls=new RegExp(`^http://${FIRESTORE.replaceAll(".","\\.")}/v1/projects/${PROJECT}/databases/\\(default\\)/documents:commit(?:\\?.*)?$`);
    const intercept=async route=>{
      const request=route.request(),url=new URL(request.url());
      const indexCommit=url.origin==="http://"+FIRESTORE&&url.pathname.endsWith("/documents:commit")
        &&(request.postDataJSON()?.writes||[]).some(write=>write.update?.name?.endsWith("/"+INDEX));
      if(!indexCommit)return route.continue();
      if(!held){held=true;signal();await gate;}
      const response=await route.fetch();statuses.push(response.status());return route.fulfill({response});
    };
    await b.route(commitUrls,intercept);
    let winner,index,winnerAction,loserAction,loser;
    try{
      await b.locator('#pumpLogForm button[type="submit"]').click();await reached;clearTimeout(timer);
      assert.equal(await b.evaluate(()=>window.__pumpLogMutationPending),true);
      assert.equal(await b.evaluate(()=>typeof workspaceStateUnsubscribe==="function"),true,"Contender keeps its real listener");
      await a.locator('#pumpLogForm button[type="submit"]').click();
      await a.waitForFunction(()=>window.__mcapRaceOutcome!==null,null,{timeout:90000});
      const outcome=await a.evaluate(()=>window.__mcapRaceOutcome);assert.equal(outcome.saved,true,JSON.stringify(outcome));
      winnerAction=await a.evaluate(()=>window.__mcapRaceAction);loserAction=await b.evaluate(()=>window.__mcapRaceAction);
      winner=await read(a);await exact(a,winner);assert.equal(winner.syncMeta.rev,outcome.revision);
      assert.deepEqual(await b.evaluate(()=>window.__lastLoadedCloudState),before,"In-flight contender must retain its verified baseline despite the winner's live echo");
      index=await a.evaluate(async()=>(await FB.db.doc("workspaces/github-prod/app/stateIndexV1").get({source:"server"})).data());
      assert.equal(index.previousRevision,before.syncMeta.rev);
      release();await b.waitForFunction(()=>window.__mcapRaceOutcome!==null,null,{timeout:90000});
      loser=await b.evaluate(()=>window.__mcapRaceOutcome);assert.equal(loser.saved,false,JSON.stringify(loser));
      assert.ok(statuses.length>0&&statuses.every(status=>status>=400),"Native stale commit was rejected: "+JSON.stringify(statuses));
      await b.locator('#pumpLogForm [data-pump-log-status][role="alert"]').waitFor();
      assert.equal(await b.locator("#pumpLogDate").inputValue(),"2026-10-25");
      assert.equal(await b.locator("#pumpLogTime").inputValue(),"14:15");
      assert.equal(await b.locator("#pumpLogRPM").inputValue(),"541");
      if(loser.indeterminate){
        assert.equal(await b.evaluate(()=>isRecoveryMode()&&window.__autosaveDisabled),true);
        assert.equal(await b.locator('#pumpLogForm button[type="submit"]').isDisabled(),true);
        assert.deepEqual(await b.evaluate(()=>window.__lastLoadedCloudState),before);
      }
    }finally{clearTimeout(timer);release();await b.unroute(commitUrls,intercept);}
    assert.equal(winner.pumpEff.entries.filter(row=>row.id===winnerAction.id).length,1);
    assert.deepEqual(winner.pumpEff.entries.find(row=>row.id===winnerAction.id),{id:winnerAction.id,dateISO:"2026-10-24",rpm:540,timeISO:"14:15"});
    assert.equal(winner.pumpEff.entries.some(row=>row.id===loserAction.id),false);
    assert.deepEqual(winner.pumpEff.entries.filter(row=>row.id!==winnerAction.id),before.pumpEff.entries);
    assert.deepEqual({...winner.pumpEff,entries:before.pumpEff.entries},before.pumpEff);
    for(const key of Object.keys(before))if(!["pumpEff","syncMeta"].includes(key))assert.deepEqual(winner[key],before[key],key);
    assert.deepEqual(await read(b),winner);await exact(a,winner);
    assert.deepEqual(await b.evaluate(async()=>(await FB.db.doc("workspaces/github-prod/app/stateIndexV1").get({source:"server"})).data()),index);
    assert.deepEqual(await b.evaluate(async()=>(await FB.docRef.get({source:"server"})).data()),legacy);
    await a.reload();await ready(a);await exact(a,winner);await b.reload();await ready(b);await exact(b,winner);
    // After reviewing the new authority, the user can resubmit the retained
    // values through the same native form without replaying the stale request.
    await watch(b);await fill(b,"2026-10-25",541);await b.locator('#pumpLogForm button[type="submit"]').click();
    await b.waitForFunction(()=>window.__mcapRaceOutcome!==null,null,{timeout:90000});
    const retried=await b.evaluate(()=>window.__mcapRaceOutcome);assert.equal(retried.saved,true,JSON.stringify(retried));
    const retryAction=await b.evaluate(()=>window.__mcapRaceAction),after=await read(b);
    assert.notEqual(retryAction.id,loserAction.id,"Freshly reviewed submission does not replay the old request identity");
    assert.equal(after.pumpEff.entries.filter(row=>row.id===retryAction.id).length,1);
    assert.deepEqual(after.pumpEff.entries.find(row=>row.id===retryAction.id),{id:retryAction.id,dateISO:"2026-10-25",rpm:541,timeISO:"14:15"});
    assert.equal(after.pumpEff.entries.some(row=>row.id===loserAction.id),false);
    assert.deepEqual(after.pumpEff.entries.filter(row=>row.id!==retryAction.id),winner.pumpEff.entries);
    assert.deepEqual({...after.pumpEff,entries:winner.pumpEff.entries},winner.pumpEff);
    for(const key of Object.keys(winner))if(!["pumpEff","syncMeta"].includes(key))assert.deepEqual(after[key],winner[key],key);
    await exact(b,after);await a.waitForFunction(rev=>window.__loadedCloudRevisionForSaveGuard===rev,after.syncMeta.rev);await exact(a,after);
    await b.reload();await ready(b);await exact(b,after);await a.reload();await ready(a);await exact(a,after);
    t.diagnostic("Native contender commit statuses: "+JSON.stringify(statuses)+"; indeterminate="+String(loser.indeterminate===true));
  });
  await step("native calendar scheduling and completion persist through real Firebase",async()=>{
    const before=await read(a);
    await a.evaluate(()=>{
      window.__mcapCalendarResult=null;
      const run=window.runMaintenanceCalendarMutation;
      window.runMaintenanceCalendarMutation=async(...args)=>{
        const result=await run(...args);
        window.__mcapCalendarResult={saved:result.saved,error:result.error,indeterminate:result.indeterminate,rollbackCompleted:result.rollbackCompleted};
        return result;
      };
    });
    await a.locator("#calendarAddBtn").click();
    await a.locator('#dashboardAddModal [data-choice="task"]').click();
    await a.locator('[data-task-option="one-time"]').click();
    await a.locator("#dashOneTimeDate").fill("2026-11-22");
    await a.locator("#dashOneTimeName").fill("Synthetic real-emulator maintenance");
    await a.locator("#dashOneTimeNote").fill("Preserve original scheduled event");
    await a.locator('#dashOneTimeForm button[type="submit"]').click();
    await a.waitForFunction(()=>window.__mcapCalendarResult!==null,null,{timeout:90000});
    const outcome=await a.evaluate(()=>window.__mcapCalendarResult);
    assert.equal(outcome.saved,true,JSON.stringify({...outcome,diagnostic:await a.evaluate(()=>{
      const live=compactStateForStorage(snapshotState({skipLocalFileCacheSync:true})),loaded=window.__lastLoadedCloudState;
      return {reason:window.__recoveryReason,block:window.__lastCloudSaveBlock?.reason,fields:Object.keys(loaded).filter(key=>!["syncMeta","saveMeta","syncProcessLog"].includes(key)&&OMAXShardedState.canonical(live[key])!==OMAXShardedState.canonical(loaded[key]))};
    })}));
    const scheduled=await read(a),task=scheduled.maintenanceTasksV2.find(row=>row.name==="Synthetic real-emulator maintenance");
    assert.ok(task);assert.ok(scheduled.syncMeta.rev>before.syncMeta.rev);
    const occurrence=scheduled.maintenanceOccurrencesV2.find(row=>row.taskId===task.id);
    assert.equal(occurrence.eventType,"scheduled");
    const allowed=new Set(["maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2","syncMeta","saveMeta"]);
    for(const key of Object.keys(before))if(!allowed.has(key))assert.deepEqual(scheduled[key],before[key],key);
    await a.reload();await ready(a);await exact(a,scheduled);
    await a.locator(`[data-cal-v2-one-time="${occurrence.id}"]`).first().click();
    await a.locator("#v2OneTimePanel [data-v2-panel-complete]").click();
    await a.waitForFunction(rev=>window.__loadedCloudRevisionForSaveGuard>rev&&OMAXFirebaseOperations.snapshot().pending===0,scheduled.syncMeta.rev);
    const completed=await read(a);
    assert.equal(completed.maintenanceOccurrencesV2.filter(row=>row.rootOccurrenceId===occurrence.id&&row.eventType==="completed").length,1);
    for(const row of scheduled.maintenanceOccurrencesV2)assert.deepEqual(completed.maintenanceOccurrencesV2.find(saved=>saved.id===row.id),row);
    for(const key of Object.keys(scheduled))if(!["maintenanceOccurrencesV2","syncMeta","saveMeta"].includes(key))assert.deepEqual(completed[key],scheduled[key],key);
    await a.reload();await ready(a);await exact(a,completed);
    await b.waitForFunction(rev=>window.__loadedCloudRevisionForSaveGuard===rev,completed.syncMeta.rev);await exact(b,completed);
  });
  const importHistory=async(kind,rows,fields)=>{
    const before=await read(a),downloads=[],onDownload=download=>downloads.push(download);
    const preview=await a.evaluate(({kind,rows})=>historicalImport.preview(kind,rows),{kind,rows});
    assert.ok(preview.every(row=>row.status==="Missing — Import"),JSON.stringify(preview));
    a.on("download",onDownload);
    let result;
    try{result=await a.evaluate(({kind,rows,preview})=>historicalImport.submit(kind,rows,{confirmed:true,reviewedPreview:preview}),{kind,rows,preview});}
    finally{a.off("download",onDownload);}
    assert.equal(result.saved,true,JSON.stringify(result));
    assert.equal(result.backupCreated,true);assert.equal(result.verificationCompleted,true);
    assert.equal(downloads.length,1,"Exactly one native mandatory backup download");
    assert.match(downloads[0].suggestedFilename(),/^omax-pre-import-.*\.json$/);
    const backup=JSON.parse(await fs.readFile(await downloads[0].path(),"utf8"));
    assert.deepEqual(backup.state,before,"Download contains the complete exact active Storage authority");
    assert.deepEqual(backup.syncMeta,before.syncMeta);
    const after=await read(a),allowed=new Set(["syncMeta","saveMeta",...fields]);
    for(const key of Object.keys(before))if(!allowed.has(key))assert.deepEqual(after[key],before[key],key);
    assert.ok(after.syncMeta.rev>before.syncMeta.rev);await exact(a,after);
    await a.reload();await ready(a);await exact(a,after);
    const duplicate=await a.evaluate(async({kind,rows})=>{
      const reviewedPreview=historicalImport.preview(kind,rows);
      return {statuses:reviewedPreview.map(row=>row.status),result:await historicalImport.submit(kind,rows,{confirmed:true,reviewedPreview})};
    },{kind,rows});
    assert.ok(duplicate.statuses.every(status=>status==="Already Present"));
    assert.equal(duplicate.result.saveAttempted,false);assert.equal(duplicate.result.backupCreated,false);
    await exact(a,after);
    await b.waitForFunction(rev=>window.__loadedCloudRevisionForSaveGuard===rev,after.syncMeta.rev);await exact(b,after);
    return {before,after};
  };
  await step("history import purchase retains exact backup, allocations and provenance without stock replay",async()=>{
    const row={import_event_id:"emulator_purchase_import",source_id:"mcap_fixture",source_record_id:"purchase_1",date:"2026-10-28",purchased:"Synthetic service filter",qty:2,cost:12.5,shipping:2.31,tax:0.17,partNumber:"0007",review_status:"reviewed",source_text:"Synthetic purchase evidence"};
    const {before,after}=await importHistory("purchase",[row],["receiptTrackerWeeks"]);
    const saved=after.receiptTrackerWeeks.flatMap(week=>week.rows).find(item=>item.import_event_id===row.import_event_id);
    assert.equal(saved.qty,2);assert.equal(saved.cost,12.5);assert.equal(saved.shipping,2.31);assert.equal(saved.tax,0.17);assert.equal(saved.partNumber,"0007");
    assert.deepEqual(saved.importProvenance.sourceRecord,row);assert.deepEqual(after.inventory,before.inventory);
    const changed={...row,cost:99};
    const conflict=await a.evaluate(async({row,changed})=>({preview:historicalImport.preview("purchase",[changed]),submit:await historicalImport.submit("purchase",[changed],{confirmed:true,reviewedPreview:historicalImport.preview("purchase",[row])})}),{row,changed});
    assert.equal(conflict.preview[0].status,"Possible Match — Review");assert.equal(conflict.submit.saved,false);
    assert.equal(conflict.submit.saveAttempted,false);assert.equal(conflict.submit.backupCreated,false);await exact(a,after);
  });
  await step("history import pump hours and measurements preserve IDs, exact source and unrelated history",async()=>{
    const hours={import_event_id:"emulator_hours_import",source_id:"mcap_fixture",source_record_id:"hours_1",date:"2026-10-29",hours:0.5,review_status:"reviewed",source_text:"Synthetic cumulative hours"};
    const totals=await importHistory("pump_hours",[hours],["totalHistory"]);
    assert.deepEqual(totals.after.totalHistory.find(row=>row.import_event_id===hours.import_event_id).importProvenance.sourceRecord,hours);
    for(const row of totals.before.totalHistory)assert.deepEqual(totals.after.totalHistory.find(saved=>saved.dateISO===row.dateISO),row);
    const rpm={import_event_id:"emulator_rpm_import",source_id:"mcap_fixture",source_record_id:"rpm_1",date:"2026-10-28",rpm:3495,timeISO:"12:00",time_source:"unknown_source_time_placeholder_noon",review_status:"reviewed",source_text:"Synthetic measurement; exact time unknown"};
    const measurements=await importHistory("pump",[rpm],["pumpEff"]);
    const saved=measurements.after.pumpEff.entries.find(row=>row.import_event_id===rpm.import_event_id);
    assert.equal(saved.rpm,3495);assert.equal(saved.timeISO,"12:00");assert.equal(saved.importProvenance.sourceTimeKnown,false);
    assert.deepEqual(saved.importProvenance.sourceRecord,rpm);
    for(const row of measurements.before.pumpEff.entries)assert.deepEqual(measurements.after.pumpEff.entries.find(saved=>saved.dateISO===row.dateISO),row);
  });
  await step("history import maintenance appends audited one-time completion without rewriting tasks",async()=>{
    const row={import_event_id:"emulator_maintenance_import",event_date:"2026-10-30",route:"existing_task",event_name:"Synthetic retained service task",exact_existing_task:"Synthetic retained service task",calendar_mode:"one_time",mark_completed:true,labor_minutes:5,parts_cost_snapshot:5,part_number_snapshot:"TEST-001",source_kind:"shop_log",source_page:"1",source_line:"1",source_text:"Synthetic completed service",review_status:"reviewed",review_notes:"Keep exact provenance"};
    const {before,after}=await importHistory("maintenance",[row],["maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2"]);
    assert.deepEqual(after.tasksAsReq,before.tasksAsReq);assert.deepEqual(after.tasksInterval,before.tasksInterval);
    const completed=after.maintenanceOccurrencesV2.find(event=>event.import_event_id===row.import_event_id);
    assert.equal(completed.eventType,"completed");assert.equal(completed.loggedHours*60,5);assert.equal(completed.partsCostSnapshot,5);
    assert.deepEqual(completed.importProvenance.sourceRecord,row);
    const instance=after.maintenanceCalendarInstancesV2.find(item=>item.id===completed.instanceId);
    assert.equal(instance.instanceMode,"one_time");assert.equal(instance.repeatRule,null);
    for(const original of before.maintenanceOccurrencesV2)assert.deepEqual(after.maintenanceOccurrencesV2.find(item=>item.id===original.id),original);
  });
  await step("archive task and stock transfers restore exact identities, history and financial evidence",async()=>{
    const before=await read(a);
    const financial=page=>page.evaluate(()=>computeCostModel().maintenanceCostRows.map(row=>({taskId:row.taskId,dateISO:row.dateISO,root:row.rootOccurrenceId||"",totalCost:row.totalCost,costIncomplete:row.costIncomplete})).sort((one,two)=>JSON.stringify(one).localeCompare(JSON.stringify(two))));
    const costs=await financial(a);
    const transfer=async(api,method,id,fields)=>{
      const source=await read(a);
      const result=await a.evaluate(({api,method,id})=>{
        if(api==="maintenanceTaskDeletionApi"&&method==="restore"){
          const entry=window.__lastLoadedCloudState.deletedItems.find(row=>row.id===id);
          return window[api].restore(id,OMAXMaintenanceTaskArchive.key(entry));
        }
        return window[api][method](id);
      },{api,method,id});
      assert.equal(result.saved,true,JSON.stringify(result));assert.equal(result.verified,true);
      const actual=await read(a),allowed=new Set(["syncMeta",...fields]);
      for(const key of Object.keys(source))if(!allowed.has(key))assert.deepEqual(actual[key],source[key],key);
      assert.deepEqual(await financial(a),costs,"Archive transfer retains historical cost evidence");
      await a.reload();await ready(a);await exact(a,actual);
      assert.deepEqual(await financial(a),costs,"A fresh report model retains the same archived/restored costs");
      await b.waitForFunction(rev=>window.__loadedCloudRevisionForSaveGuard===rev,actual.syncMeta.rev);await exact(b,actual);
      return actual;
    };
    const archivedTask=await transfer("maintenanceTaskDeletionApi","remove","emulator_archive_task",["tasksAsReq","deletedItems"]);
    const taskEntry=archivedTask.deletedItems.find(row=>row.type==="task"&&row.payload.id==="emulator_archive_task");
    assert.deepEqual(taskEntry.payload,before.tasksAsReq.find(row=>row.id==="emulator_archive_task"));
    const unconfirmed=await a.evaluate(id=>maintenanceTaskDeletionApi.restore(id,"unreviewed archive"),taskEntry.id);
    assert.equal(unconfirmed.saved,false);assert.equal(unconfirmed.stateWriteAttempted,false);
    await exact(a,archivedTask);
    await transfer("maintenanceTaskDeletionApi","restore",taskEntry.id,["tasksAsReq","deletedItems"]);
    const archivedStock=await transfer("inventoryDeletionApi","remove","emulator_archive_inventory",["inventory","deletedItems"]);
    assert.deepEqual(archivedStock.deletedItems.find(row=>row.type==="inventory").payload,before.inventory.find(row=>row.id==="emulator_archive_inventory"));
    const restored=await transfer("inventoryDeletionApi","restore","emulator_archive_inventory",["inventory","deletedItems"]);
    for(const key of Object.keys(before))if(key!=="syncMeta")assert.deepEqual(restored[key],before[key],key);
  });
  await step("actor change during staged save cannot commit or adopt the pending record",async()=>{
    const before=await read(a);
    const index=await b.evaluate(async()=>(await FB.db.doc("workspaces/github-prod/app/stateIndexV1").get({source:"server"})).data());
    let release,signal,held=false,indexWrites=0;
    const gate=new Promise(resolve=>{release=resolve;}),reached=new Promise(resolve=>{signal=resolve;});
    const intercept=async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.pathname.endsWith("/documents:commit")&&(request.postDataJSON()?.writes||[]).some(write=>write.update?.name?.endsWith("/"+INDEX)))indexWrites++;
      const objectPath=decodeURIComponent(url.pathname.split("/o/")[1]||"");
      if(!held&&url.origin==="http://"+STORAGE&&url.searchParams.get("alt")==="media"
        &&objectPath.includes("/state-shards/v1/_manifest/")&&objectPath!==index.manifestPath){
        const response=await route.fetch();assert.equal(response.status(),200);
        held=true;signal();await gate;return route.fulfill({response});
      }
      return route.fallback();
    };
    await a.route("**/*",intercept);
    const saving=a.evaluate(()=>savePumpLogChange({kind:"create",id:"emulator_actor_change",dateISO:"2026-10-27",rpm:525,timeISO:"13:00"}));
    let result;
    try{
      await Promise.race([reached,saving.then(value=>{throw Error("Save settled before staged response barrier: "+JSON.stringify(value));})]);
      await a.evaluate(()=>firebase.auth().signOut());
      await a.waitForFunction(()=>!FB.user&&!FB.ready&&!firebase.auth().currentUser);
      release();result=await saving;
    }finally{release();await a.unroute("**/*",intercept);}
    assert.equal(held,true);assert.equal(result.saved,false);assert.equal(result.stateWriteAttempted===true,false,JSON.stringify(result));
    assert.equal(result.indeterminate===true,false);assert.equal(indexWrites,0,"No index write sent after account change");
    assert.deepEqual(await a.evaluate(()=>window.__lastLoadedCloudState),before,"Account change must not adopt pending data");
    await exact(b,before);
    await a.reload();await signIn(a);await ready(a);await exact(a,before);
    assert.equal((await read(a)).pumpEff.entries.some(row=>row.id==="emulator_actor_change"),false);
  });
  await step("corrupt field download fails startup closed and recovers only after verified reload",async()=>{
    const before=await read(a),consoleStart=consoleErrors.length;
    const pointer=await a.evaluate(async()=>{
      const index=(await FB.db.doc("workspaces/github-prod/app/stateIndexV1").get({source:"server"})).data();
      const url=await firebase.app().storage().ref(index.manifestPath).getDownloadURL();
      const manifest=await (await fetch(url)).json();
      return {index,path:manifest.shards.find(part=>part.sourceField==="mcapEmulatorOpaque").path};
    });
    let corrupted=0,indexWrites=0;
    const intercept=async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.pathname.endsWith("/documents:commit")&&(request.postDataJSON()?.writes||[]).some(write=>write.update?.name?.endsWith("/"+INDEX)))indexWrites++;
      if(url.origin==="http://"+STORAGE&&decodeURIComponent(url.pathname.split("/o/")[1]||"")===pointer.path&&url.searchParams.get("alt")==="media"){
        const response=await route.fetch(),body=await response.body();assert.equal(response.status(),200);
        const offset=body.indexOf(Buffer.from("XXXX"));assert.ok(offset>=0,"Synthetic payload must be present");
        body[offset]=89;corrupted++;return route.fulfill({response,body});
      }
      return route.fallback();
    };
    await a.route("**/*",intercept);
    try{
      await a.reload();await a.waitForFunction(()=>window.__cloudLoadAttemptComplete&&window.__recoveryInspectMode);
      assert.ok(corrupted>0,"Tampered an actual field-shard download with unchanged byte count");
      assert.ok(consoleErrors.slice(consoleStart).some(message=>message.includes("downloaded object SHA-256 mismatch")),"Startup rejected the field checksum");
      assert.equal(await a.evaluate(()=>window.__initialAdoptComplete),false);
      assert.equal((await a.evaluate(()=>saveCloudNow())).saved,false);
      assert.equal(await a.evaluate(()=>typeof workspaceStateUnsubscribe==="function"),false,"Failed startup must not start a reload listener");
      assert.equal(indexWrites,0);await exact(b,before);
      assert.deepEqual(await b.evaluate(async()=>(await FB.db.doc("workspaces/github-prod/app/stateIndexV1").get({source:"server"})).data()),pointer.index);
      assert.deepEqual(await a.evaluate(async()=>(await FB.docRef.get({source:"server"})).data()),legacy);
    }finally{await a.unroute("**/*",intercept);}
    await a.reload();await ready(a);await exact(a,before);
  });
  await step("corrupt field after committed index suspends retry and retains the previous baseline",async()=>{
    const before=await read(a);let committed=false,corrupted=0;
    const intercept=async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.pathname.endsWith("/documents:commit")&&(request.postDataJSON()?.writes||[]).some(write=>write.update?.name?.endsWith("/"+INDEX))){
        const response=await route.fetch();assert.equal(response.status(),200,"Index committed before corrupt readback");
        committed=true;return route.fulfill({response});
      }
      const objectPath=decodeURIComponent(url.pathname.split("/o/")[1]||"");
      if(committed&&url.origin==="http://"+STORAGE&&objectPath.includes("/state-shards/v1/mcapEmulatorOpaque$p")&&url.searchParams.get("alt")==="media"){
        const response=await route.fetch(),body=await response.body();assert.equal(response.status(),200);
        const offset=body.indexOf(Buffer.from("XXXX"));assert.ok(offset>=0);
        body[offset]=89;corrupted++;return route.fulfill({response,body});
      }
      return route.fallback();
    };
    await a.route("**/*",intercept);
    let result;
    try{result=await a.evaluate(()=>savePumpLogChange({kind:"create",id:"emulator_corrupt_ack",dateISO:"2026-10-26",rpm:530,timeISO:"13:15"}));}
    finally{await a.unroute("**/*",intercept);}
    assert.equal(committed,true);assert.ok(corrupted>0,"Tampered post-commit field download");
    assert.equal(result.saved,false);assert.equal(result.indeterminate,true,JSON.stringify(result));
    assert.match(result.error,/downloaded object SHA-256 mismatch/);
    assert.equal(await a.evaluate(()=>isRecoveryMode()&&window.__autosaveDisabled),true);
    assert.deepEqual(await a.evaluate(()=>window.__lastLoadedCloudState),before,"Corrupt readback cannot advance the loaded baseline");
    const actual=await read(a);assert.ok(actual.syncMeta.rev>before.syncMeta.rev);
    assert.equal(actual.pumpEff.entries.filter(row=>row.id==="emulator_corrupt_ack").length,1);
    assert.equal((await a.evaluate(()=>saveCloudNow())).saved,false);assert.deepEqual(await read(a),actual);
    await a.reload();await ready(a);await exact(a,actual);
    await b.waitForFunction(rev=>window.__loadedCloudRevisionForSaveGuard===rev,actual.syncMeta.rev);await exact(b,actual);
  });
  await require("./fixtures/mcap-cutting-files.cjs")({step,a,b,read,exact,ready,client,signIn,seedDoc,member,localRequest,legacy});
  await step("real Storage rules deny overwrite, delete, list, malformed metadata and unauthorized reads",async()=>{
    const proof=await a.evaluate(async()=>{
      const index=(await FB.db.doc("workspaces/github-prod/app/stateIndexV1").get({source:"server"})).data();
      const ref=firebase.app().storage().ref(index.manifestPath),meta=await ref.getMetadata();
      const denied=async work=>{try{await work();return false;}catch(error){return error.code==="storage/unauthorized";}};
      return {path:index.manifestPath,overwrite:await denied(()=>ref.put(new Blob(["{}"],{type:"application/json"}),{contentType:meta.contentType,customMetadata:meta.customMetadata})),remove:await denied(()=>ref.delete()),list:await denied(()=>firebase.app().storage().ref("workspaces/github-prod/state-shards/v1").listAll()),malformed:await denied(()=>firebase.app().storage().ref("workspaces/github-prod/state-shards/v1/test/bad/"+"a".repeat(64)+".json").put(new Blob(["{}"],{type:"application/json"}),{contentType:"application/json",customMetadata:{}}))};
    });
    for(const key of ["overwrite","remove","list","malformed"])assert.equal(proof[key],true,key);
    const outsider=await client();await signIn(outsider,"mcap_unauthorized");
    const denied=await outsider.evaluate(async p=>{try{await firebase.app().storage().ref(p).getMetadata();return false;}catch(error){return error.code==="storage/unauthorized";}},proof.path);
    assert.equal(denied,true);await outsider.close();
  });
  await step("membership denial blocks a specialized write without advancing the index",async()=>{
    const before=await read(a);await seedDoc("workspaces/github-prod/members/"+OWNER,member("viewer"));
    const request={record:{id:"emulator_denied_water",date:"2026-11-21",time:"08:15",ppm:60,softness:"Pass",initials:"MC",note:"Keep synthetic draft"},legacy:[]};
    const denied=await a.evaluate(request=>saveWaterQualityCheck(request),request);
    assert.equal(denied.saved,false);assert.equal(denied.indeterminate===true,false);
    await seedDoc("workspaces/github-prod/members/"+OWNER,member("owner"));
    await exact(a,before);
    const saved=await a.evaluate(request=>saveWaterQualityCheck(request),request);assert.equal(saved.saved,true,JSON.stringify(saved));
    assert.equal((await read(a)).waterQualityChecks.filter(row=>row.id===request.record.id).length,1);
  });
  await step("lost real commit response suspends retry and reloads exactly one committed record",async()=>{
    const before=await read(a);let dropped=false;
    const commits=new RegExp(`^http://${FIRESTORE.replaceAll(".","\\.")}/v1/projects/${PROJECT}/databases/\\(default\\)/documents:commit`);
    const intercept=async route=>{
      const writes=route.request().postDataJSON()?.writes||[];
      if(dropped||!writes.some(write=>write.update?.name?.endsWith("/"+INDEX)))return route.continue();
      const response=await route.fetch();
      assert.equal(response.status(),200,"Emulator must commit before response loss");
      dropped=true;await route.abort("failed");
    };
    await a.route(commits,intercept);
    let result;
    try{result=await a.evaluate(()=>savePumpLogChange({kind:"create",id:"emulator_lost_ack",dateISO:"2026-11-20",rpm:520,timeISO:"12:30"}));}
    finally{await a.unroute(commits,intercept);}
    assert.equal(dropped,true,"Dropped an actual committed emulator response");
    assert.equal(result.saved,false);assert.equal(result.indeterminate,true,JSON.stringify(result));
    assert.equal(await a.evaluate(()=>isRecoveryMode()&&window.__autosaveDisabled),true);
    assert.deepEqual(await a.evaluate(()=>window.__lastLoadedCloudState),before,"Uncertain save must not adopt its realtime echo");
    const committed=await read(a);assert.ok(committed.syncMeta.rev>before.syncMeta.rev);
    assert.equal(committed.pumpEff.entries.filter(row=>row.id==="emulator_lost_ack").length,1);
    const download= a.waitForEvent("download");
    await a.locator('[data-recovery-export="cloud"]').click();
    const exported=await download;
    assert.match(exported.suggestedFilename(),/^omax-cloud-state-.*\.json$/);
    assert.deepEqual(JSON.parse(await fs.readFile(await exported.path(),"utf8")),committed,"Recovery export reads current active authority, not old baseline or legacy document");
    assert.equal((await a.evaluate(()=>saveCloudNow())).saved,false);
    assert.deepEqual(await read(a),committed);
    await a.reload();await ready(a);await exact(a,committed);
  });
  await step("old Firestore writers are locked out and original document is exact",async()=>{
    const proof=await a.evaluate(async()=>{
      let denied=false;try{await FB.docRef.set({syncMeta:{rev:1}},{merge:true});}catch(error){denied=error.code==="permission-denied";}
      return {denied,legacy:(await FB.docRef.get({source:"server"})).data()};
    });assert.equal(proof.denied,true);assert.deepEqual(proof.legacy,legacy);
  });
  await step("missing real Storage manifest fails startup without legacy fallback",async()=>{
    const index=await a.evaluate(async()=>(await FB.db.doc("workspaces/github-prod/app/stateIndexV1").get({source:"server"})).data());
    await localRequest(`http://${STORAGE}/v0/b/${BUCKET}/o/${encodeURIComponent(index.manifestPath)}`,{method:"DELETE",headers:{Authorization:"Bearer owner"}});
    await a.reload();await a.waitForFunction(()=>window.__cloudLoadAttemptComplete&&window.__recoveryInspectMode);
    assert.equal(await a.evaluate(()=>window.__initialAdoptComplete),false);
    assert.equal((await a.evaluate(()=>saveCloudNow())).saved,false);
    assert.deepEqual(await a.evaluate(async()=>(await FB.docRef.get({source:"server"})).data()),legacy);
  });
  assert.deepEqual(errors,[],"No uncaught application errors");
  assert.deepEqual(serverErrors,[],"All local app/SDK assets served successfully");
  // External libraries/fonts are denied; no Firebase service may escape localhost.
  assert.ok(!deniedExternal.some(origin=>/googleapis|firebaseio|firebasestorage|gstatic/.test(origin)),JSON.stringify(deniedExternal));
});
