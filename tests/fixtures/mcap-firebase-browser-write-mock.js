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
  let databaseWrites=0,storageUploads=0,authReady=false;
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
      return out;
    }
  };
  const storage={ref:()=>({child:path=>({
    put:async(blob,options)=>{
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
})();
