"use strict";
const assert=require("node:assert/strict"),{createHash}=require("node:crypto");
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
module.exports=async function recovery({step,a,b,read,exact,ready,signIn,localRequest,OWNER,STORAGE,BUCKET,FIRESTORE,INDEX,STATE,legacy}){
  const pointer=()=>b.evaluate(async path=>(await FB.db.doc(path).get({source:"server"})).data(),INDEX);
  const ownerReload=async expected=>{await a.reload();await signIn(a);await ready(a);await exact(a,expected);};
  const isIndexWrite=request=>new URL(request.url()).pathname.endsWith("/documents:commit")&&(request.postDataJSON()?.writes||[]).some(write=>write.update?.name?.endsWith("/"+INDEX));
  await step("recovery sign-out during final CAS read sends no authority write",async()=>{
    const before=await read(b),index=await pointer();let release,signal,held=false,stagedReads=0,writes=0;
    const gate=new Promise(resolve=>{release=resolve;}),reached=new Promise(resolve=>{signal=resolve;});
    const intercept=async route=>{
      const request=route.request(),url=new URL(request.url());if(isIndexWrite(request))writes++;
      const object=decodeURIComponent(url.pathname.split("/o/")[1]||"");
      if(url.origin==="http://"+STORAGE&&url.searchParams.get("alt")==="media"&&object.includes("/state-shards/v1/_manifest/")&&object!==index.manifestPath)stagedReads++;
      if(!held&&stagedReads>=2&&url.origin==="http://"+FIRESTORE&&url.pathname.endsWith("/documents:batchGet")&&(request.postDataJSON()?.documents||[]).some(path=>path.endsWith("/"+INDEX))){
        const response=await route.fetch();assert.equal(response.status(),200);held=true;signal();await gate;return route.fulfill({response});
      }
      return route.fallback();
    };
    await a.route("**/*",intercept);const saving=a.evaluate(()=>savePumpLogChange({kind:"create",id:"recovery_before_cas",dateISO:"2026-11-18",rpm:510,timeISO:"09:05"}));let result;
    try{
      await Promise.race([reached,saving.then(value=>{throw Error("Save settled before final-CAS barrier: "+JSON.stringify(value));})]);
      await a.evaluate(()=>firebase.auth().signOut());await a.waitForFunction(()=>!firebase.auth().currentUser&&!FB.user&&!FB.ready);
      release();result=await saving;
    }finally{release();await a.unroute("**/*",intercept);}
    assert.equal(held,true);assert.equal(writes,0,"Account change before queuing CAS must not send an index write");assert.equal(result.saved,false);assert.equal(result.indeterminate===true,false,JSON.stringify(result));
    assert.deepEqual(await pointer(),index);await exact(b,before);assert.deepEqual(await a.evaluate(()=>window.__lastLoadedCloudState),before);
    await ownerReload(before);
  });
  await step("recovery account replacement after real commit retains uncertainty and never adopts under the new actor",async()=>{
    const before=await read(b);let release,signal,held=false,writes=0;
    const gate=new Promise(resolve=>{release=resolve;}),reached=new Promise(resolve=>{signal=resolve;});
    const commits=new RegExp(`^http://${FIRESTORE.replaceAll(".","\\.")}/v1/.*documents:commit(?:\\?.*)?$`);
    const intercept=async route=>{
      if(!isIndexWrite(route.request()))return route.continue();writes++;
      const response=await route.fetch();assert.equal(response.status(),200,"The owner CAS genuinely commits before account replacement");
      held=true;signal();await gate;return route.fulfill({response});
    };
    await a.route(commits,intercept);const saving=a.evaluate(()=>savePumpLogChange({kind:"create",id:"recovery_after_cas",dateISO:"2026-11-19",rpm:520,timeISO:"09:15"}));let result;
    try{
      await Promise.race([reached,saving.then(value=>{throw Error("Save settled before committed-response barrier: "+JSON.stringify(value));})]);
      await signIn(a,"mcap_replacement_actor");await a.waitForFunction(()=>firebase.auth().currentUser?.uid==="mcap_replacement_actor"&&FB.user?.uid==="mcap_replacement_actor");
      release();result=await saving;
    }finally{release();await a.unroute(commits,intercept);}
    assert.equal(held,true);assert.equal(result.saved,false);assert.equal(result.indeterminate,true,JSON.stringify(result));assert.equal(writes,1);
    await a.waitForFunction(()=>window.__cloudLoadAttemptComplete&&window.__recoveryInspectMode&&window.__autosaveDisabled);
    assert.deepEqual(await a.evaluate(()=>window.__lastLoadedCloudState),before,"The replacement account cannot adopt the old actor's pending commit");
    assert.equal((await a.evaluate(()=>saveCloudNow())).saved,false);assert.equal(writes,1);
    const committed=await read(b);assert.ok(committed.syncMeta.rev>before.syncMeta.rev);assert.equal(committed.pumpEff.entries.filter(row=>row.id==="recovery_after_cas").length,1);
    for(const key of Object.keys(before))if(!["pumpEff","syncMeta","saveMeta","syncProcessLog"].includes(key))assert.deepEqual(committed[key],before[key],key);
    assert.equal((await pointer()).actorUid,OWNER);await ownerReload(committed);await b.waitForFunction(rev=>window.__loadedCloudRevisionForSaveGuard===rev,committed.syncMeta.rev);await exact(b,committed);
  });
  const upload=async(path,bytes,meta)=>{
    const boundary="mcap_stored_fault_boundary",body=Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${JSON.stringify({name:path,contentType:meta.contentType,metadata:meta.customMetadata})}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--`)
    ]);
    await localRequest(`http://${STORAGE}/v0/b/${BUCKET}/o?name=${encodeURIComponent(path)}`,{method:"POST",headers:{Authorization:"Bearer owner","X-Goog-Upload-Protocol":"multipart","Content-Type":"multipart/related; boundary="+boundary},body});
  };
  for(const kind of ["changed bytes","missing field"])await step("recovery persistent stored "+kind+" fails closed in both browsers until exact object restoration",async()=>{
    const before=await read(b),index=await pointer(),descriptor=await b.evaluate(async index=>{
      const storage=firebase.app().storage(),manifest=await(await fetch(await storage.ref(index.manifestPath).getDownloadURL(),{cache:"no-store"})).json();
      const part=manifest.shards.find(part=>part.sourceField==="mcapEmulatorOpaque");return{part,meta:await storage.ref(part.path).getMetadata()};
    },index);
    const path=descriptor.part.path,url=`http://${STORAGE}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}`;
    const original=Buffer.from(await(await localRequest(url+"?alt=media",{headers:{Authorization:"Bearer owner"}})).arrayBuffer());
    assert.equal(hash(original),descriptor.part.sha256);assert.equal(original.length,descriptor.part.sizeBytes);let writes=0;
    const watch=request=>{if(isIndexWrite(request))writes++;};a.on("request",watch);b.on("request",watch);
    try{
      if(kind==="changed bytes"){
        const changed=Buffer.from(original),offset=changed.indexOf(Buffer.from("XXXX"));assert.ok(offset>=0);changed[offset]=89;assert.notEqual(hash(changed),descriptor.part.sha256);
        await upload(path,changed,descriptor.meta);
        const stored=Buffer.from(await(await localRequest(url+"?alt=media",{headers:{Authorization:"Bearer owner"}})).arrayBuffer());assert.equal(hash(stored),hash(changed));assert.equal(stored.length,original.length);
      }else{
        await localRequest(url,{method:"DELETE",headers:{Authorization:"Bearer owner"}});
        assert.equal(new URL(url).origin,"http://"+STORAGE);
        const absent=await fetch(url,{headers:{Authorization:"Bearer owner"}});assert.equal(absent.status,404,"Administrative read independently proves physical object absence");
        assert.equal(await b.evaluate(async path=>(await firebase.app().storage().ref(path).getMetadata()).fullPath,index.manifestPath),index.manifestPath,"Owner can still read the intact manifest");
      }
      const probe=await b.evaluate(async()=>{try{await OMAXAuthorityRouter.fromBrowser();return{ok:true};}catch(error){return{ok:false,error:String(error.message),code:error.code||""};}});
      assert.equal(probe.ok,false);if(kind==="changed bytes")assert.match(probe.error,/downloaded object SHA-256 mismatch/);else assert.equal(probe.code,"storage/unauthorized","Immutable-object get rules require an existing resource");
      for(const page of [a,b]){
        await page.reload();await page.waitForFunction(()=>window.__cloudLoadAttemptComplete&&window.__recoveryInspectMode);
        assert.equal(await page.evaluate(()=>window.__initialAdoptComplete),false);assert.equal(await page.evaluate(()=>typeof workspaceStateUnsubscribe==="function"),false);
        assert.equal((await page.evaluate(()=>saveCloudNow())).saved,false);
        assert.deepEqual(await page.evaluate(async()=>(await FB.docRef.get({source:"server"})).data()),legacy);
      }
      assert.equal(writes,0);assert.deepEqual(await pointer(),index);
    }finally{await upload(path,original,descriptor.meta);a.off("request",watch);b.off("request",watch);}
    for(const page of [a,b]){await page.reload();await ready(page);await exact(page,before);}
    assert.deepEqual(await pointer(),index);assert.equal(writes,0);
  });
};
