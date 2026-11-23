(function(){
  "use strict";
  // WRITABLE TEST-ONLY Firebase v8 API stand-in, served ONLY by localhost MCAP
  // Playwright route. No connection to Firebase or production credentials.
  if(!["127.0.0.1","localhost"].includes(location.hostname))
    throw Error("MCAP mock Firebase must never run outside localhost.");
  const STORE_BUCKET="wj-tracker-v2.firebasestorage.app";
  const INDEX_PATH="workspaces/github-prod/app/stateIndexV1";
  const user=Object.freeze({uid:"GntsaU7i2tXdDf05ds8cws5dfi63",email:"mcap-test@example.invalid"});
  const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
  const documents=new Map(),files=new Map(),listeners=new Map();
  // IndexedDB holds only fake test snapshots on localhost. The previous
  // sessionStorage representation exceeded the browser's small 5 MB quota
  // once more than one immutable Storage revision existed.
  const openFixtureDb=()=>new Promise((resolve,reject)=>{
    const req=indexedDB.open("mcap-disposable-storage-test",1);
    req.onupgradeneeded=()=>req.result.createObjectStore("snapshots");
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||Error("Fixture IndexedDB open failed"));
  });
  const readPersisted=async()=>{
    const db=await openFixtureDb();
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction("snapshots","readonly");
        const req=tx.objectStore("snapshots").get("latest");
        req.onsuccess=()=>resolve(req.result||null);
        req.onerror=()=>reject(req.error);
      });
    }finally{db.close();}
  };
  const writePersisted=async archive=>{
    const db=await openFixtureDb();
    try{
      await new Promise((resolve,reject)=>{
        const tx=db.transaction("snapshots","readwrite");
        tx.objectStore("snapshots").put(archive,"latest");
        tx.oncomplete=()=>resolve();
        tx.onabort=()=>reject(tx.error||Error("Fixture snapshot write aborted"));
        tx.onerror=()=>reject(tx.error||Error("Fixture snapshot write failed"));
      });
    }finally{db.close();}
  };
  let persisted=null;
  const restorePersisted=archive=>{
    if(archive?.version!==1||!Array.isArray(archive.documents)
      ||!Array.isArray(archive.files))return false;
    for(const [key,value]of archive.documents)documents.set(key,clone(value));
    for(const [key,value]of archive.files)files.set(key,{
      body:new Uint8Array(value.body),options:clone(value.options)
    });
    return true;
  };
  let databaseWrites=0,storageUploads=0,authReady=false,nextFault=null;
  function snapshot(ref){
    const body=documents.get(ref.path);
    return {exists:body!==undefined,ref,metadata:{fromCache:false,hasPendingWrites:false},
      data:()=>clone(body)};
  }
  function doc(path){
    const ref={path,
      get:async()=>snapshot(ref),
      set:async body=>{
        if(path!==INDEX_PATH)throw Error("MCAP simulated old Firestore state write forbidden");
        databaseWrites++;documents.set(path,clone(body));notify(path);
      },
      update:async body=>{
        if(path!==INDEX_PATH)throw Error("MCAP simulated old Firestore state update forbidden");
        databaseWrites++;documents.set(path,{...documents.get(path),...clone(body)});notify(path);
      },
      delete:async()=>{throw Error("MCAP simulated delete forbidden");},
      collection:name=>collection(path+"/"+name),
      onSnapshot:(onNext,onError)=>{
        const group=listeners.get(path)||new Set();
        group.add(onNext);listeners.set(path,group);
        queueMicrotask(()=>{try{onNext(snapshot(ref))}catch(e){onError?.(e)}});
        return()=>group.delete(onNext);
      }};
    return ref;
  }
  function notify(path){
    for(const callback of [...(listeners.get(path)||[])])
      queueMicrotask(()=>callback(snapshot(doc(path))));
  }
  function collection(path){
    return {doc:id=>doc(path+"/"+id),
      add:async()=>{throw Error("MCAP simulated append forbidden")},
      get:async()=>({forEach:()=>{}})};
  }
  const firestore={
    doc,collection,settings:()=>{},
    runTransaction:async fn=>{
      const queued=[];
      const out=await fn({
        get:async ref=>snapshot(ref),
        set:(ref,body)=>queued.push({type:"set",ref,body:clone(body)}),
        update:()=>{throw Error("MCAP mock transaction update unsupported")},
        delete:()=>{throw Error("MCAP mock transaction delete forbidden")}
      });
      for(const op of queued){
        if(op.ref.path!==INDEX_PATH)throw Error("MCAP simulated legacy state transaction write forbidden");
        const before=documents.get(INDEX_PATH);
        if(!before||op.body.previousRevision!==before.revision||op.body.revision<=before.revision)
          throw Object.assign(Error("MCAP simulated revision conflict"),{code:"aborted"});
        databaseWrites++;documents.set(INDEX_PATH,op.body);notify(INDEX_PATH);
      }
      if(queued.length&&nextFault==="lost_ack"){
        nextFault=null;
        throw Object.assign(Error("MCAP fixture lost acknowledgement after index commit"),{code:"unavailable"});
      }
      return out;
    }
  };
  const storage={ref:()=>({child:path=>({
    put:async(blob,options)=>{
      if(nextFault==="upload_denied"){
        nextFault=null;
        throw Object.assign(Error("MCAP fixture upload denied before index commit"),{code:"permission-denied"});
      }
      if(files.has(path))throw Error("Immutable MCAP shard overwritten");
      files.set(path,{body:new Uint8Array(await blob.arrayBuffer()),options});
      storageUploads++;
    },
    getMetadata:async()=>{
      const item=files.get(path);
      if(!item)throw Error("Missing MCAP fake Storage object");
      return {bucket:STORE_BUCKET,fullPath:path,size:item.body.length,
        contentType:item.options.contentType,customMetadata:item.options.customMetadata};
    },
    getDownloadURL:async()=> "https://mcap.local.invalid/"+path
  })})};
  const originalFetch=window.fetch.bind(window);
  window.fetch=async(url,opts)=>{
    const name=String(url?.url||url);
    if(name.startsWith("https://mcap.local.invalid/")){
      const item=files.get(name.slice("https://mcap.local.invalid/".length));
      if(!item)return {ok:false,status:404};
      return {ok:true,headers:{get:key=>key==="content-length"?String(item.body.length):null},
        arrayBuffer:async()=>Uint8Array.from(item.body).buffer};
    }
    return originalFetch(url,opts);
  };
  const app={name:"[DEFAULT]",options:{},
    auth:()=>auth,firestore:()=>firestore,storage:()=>storage};
  const auth={currentUser:user,setPersistence:async()=>{},
    signOut:async()=>{auth.currentUser=null;throw Error("MCAP fixture: signout unimplemented")},
    onAuthStateChanged:callback=>{
      queueMicrotask(async()=>{
        try{
          persisted=await readPersisted();
          if(restorePersisted(persisted) && documents.has(INDEX_PATH)){
            window.__mcapExpectedState=clone(persisted.expectedState);
            window.__mcapStageEvidence=clone(persisted.stageEvidence);
            authReady=true;
            await callback(user);
            window.__mcapCallbackFinished=true;
            return;
          }
          // Main app's buildCleanState is now defined. Stage using the real
          // production sharding and independent readback libraries.
          // buildCleanState intentionally omits syncMeta and several
          // protected collections. Use the complete app snapshot for the
          // disposable full-authority fixture; JSON canonicalizes it first.
          const state=JSON.parse(JSON.stringify(
            snapshotState({skipLocalFileCacheSync:true})
          ));
          state.syncMeta.rev=1794576947956;
          // An empty initial snapshot is correctly rejected by OMAX's
          // stateHasMeaningfulData guard. Use one explicitly synthetic,
          // non-financial machine-hour record to test normal adoption.
          state.totalHistory=[{dateISO:"2026-11-23",hours:1,fixtureOnly:true}];
          // The reconstructed authoritative JSON is intentionally larger
          // than the old 975 KB Firestore document gate. Only the localhost
          // fixture contains these synthetic opaque items.
          state.mcapSyntheticLargeExtension=Array.from({length:1100},(_,i)=>({
            id:"mcap-synthetic-"+i,fixtureOnly:true,payload:"X".repeat(1000)
          }));
          // Optional synthetic business fixtures are supplied before bootstrap,
          // never by altering a loaded/guarded authoritative baseline.
          window.__mcapFixtureSeed?.(state);
          const staged=await window.OMAXWorkingShards.stage({
            confirmation:window.OMAXWorkingShards.PHRASE,
            app,sharder:window.OMAXShardedState,
            working:window.OMAXWorkingStorage,cryptoApi:crypto,
            fetchImpl:window.fetch.bind(window),
            newId:()=>"localhost_sharded_write_fixture",
            now:()=>"2026-11-23T16:00:00.000Z",
            providedSource:state
          });
          documents.set(INDEX_PATH,{
            schemaVersion:1,mode:"active",workspaceId:"github-prod",
            projectId:"wj-tracker-v2",bucket:STORE_BUCKET,
            revision:state.syncMeta.rev,previousRevision:0,
            manifestPath:staged.manifestPath,
            manifestSha256:staged.manifestSha256,
            operationId:staged.operationId,actorUid:staged.actorUid,
            createdAtISO:staged.createdAtISO
          });
          // Historical Firestore legacy document intentionally differs.
          // If any active read accidentally falls back it must fail loudly.
          documents.set("workspaces/github-prod/app/state",{
            schema:state.schema,syncMeta:{rev:1},
            maintenanceOccurrencesV2:[],cuttingJobs:[],completedCuttingJobs:[]
          });
          window.__mcapExpectedState=clone(state);
          window.__mcapStageEvidence={fields:staged.fieldCount,objects:staged.archiveObjects};
          authReady=true;
          await callback(user);
          window.__mcapCallbackFinished=true;
        }catch(error){window.__mcapMockError=String(error?.stack||error);}
      });
      return()=>{};
    }
  };
  function authSdk(){return auth;}
  authSdk.Auth={Persistence:{LOCAL:"local"}};
  const apps=[];
  const firebase={apps,
    initializeApp(config){app.options=clone(config);apps.push(app);return app;},
    app:()=>app,
    auth:authSdk,
    firestore:()=>firestore,
    storage:()=>storage
  };
  firebase.firestore.FieldValue={serverTimestamp:()=>new Date().toISOString()};
  window.firebase=firebase;
  window.__mcapMockCounters=()=>({databaseWrites,storageUploads,authReady,
    indexPresent:documents.has(INDEX_PATH),storedObjects:files.size});
  window.__mcapMockReadState=()=>clone(documents.get(INDEX_PATH));
  window.__mcapMockLegacy=()=>clone(documents.get("workspaces/github-prod/app/state"));
  window.__mcapFailNext=phase=>{
    if(!["lost_ack","upload_denied"].includes(phase))throw Error("Unknown fixture fault");
    nextFault=phase;
  };
  window.__mcapRemoveActiveManifest=()=>files.delete(documents.get(INDEX_PATH).manifestPath);
  window.__mcapPersistSnapshot=async expectedState=>{
    if(!expectedState||!documents.has(INDEX_PATH))
      throw Error("No verified active state to persist for localhost reload.");
    const archive={
      version:1,
      documents:[...documents.entries()].map(([k,v])=>[k,clone(v)]),
      files:[...files.entries()].map(([k,v])=>[k,{
        body:Uint8Array.from(v.body),options:clone(v.options)
      }]),
      expectedState:clone(expectedState),
      stageEvidence:clone(window.__mcapStageEvidence)
    };
    await writePersisted(archive);
    return {objectCount:archive.files.length,
      stateRevision:archive.expectedState.syncMeta?.rev};
  };
})();
