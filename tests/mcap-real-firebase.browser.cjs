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
    assert.ok(["native calendar","lost real commit"].includes(process.env.MCAP_EMULATOR_ONLY),"Unknown development test selection");
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
    const context=await browser.newContext({timezoneId:"America/Chicago",serviceWorkers:"block",viewport:{width:1440,height:1100}});
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
  const legacy=await a.evaluate(rev=>{
    const source=JSON.parse(JSON.stringify(snapshotState({skipLocalFileCacheSync:true})));
    source.syncMeta.rev=rev;source.totalHistory=[{dateISO:"2026-11-23",hours:1,fixtureOnly:true}];
    source.jobFolders.push({id:"mcap-project",name:"1241 Synthetic MCAP",projectNumber:"1241",parent:"jobs_root",order:2});
    return source;
  },REV);
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
    const job=await a.evaluate(()=>createCuttingJob({id:"emulator_job",name:"Synthetic emulator cut",cat:"mcap-project",projectNumber:"1241",startISO:"2026-11-21",dueISO:"2026-11-22",estimateHours:2,chargeRate:200,costRate:45,material:"Steel",materialCost:10,materialQty:1,priority:1,manualLogs:[],files:[],notes:"Retain exact note"}));assert.equal(job.saved,true,JSON.stringify(job));
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
