(function(){
  "use strict";
  // Test-only Firebase v8 API stand-in, served ONLY by the localhost MCAP
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
      set:async()=>{databaseWrites++;throw Error("MCAP readonly test prohibited writes");},
      update:async()=>{databaseWrites++;throw Error("MCAP readonly test prohibited writes");},
      delete:async()=>{databaseWrites++;throw Error("MCAP readonly test prohibited writes");},
      collection:name=>collection(path+"/"+name),
      onSnapshot:(onNext,onError)=>{
        const group=listeners.get(path)||new Set();
        group.add(onNext);listeners.set(path,group);
        queueMicrotask(()=>{try{onNext(snapshot(ref))}catch(e){onError?.(e)}});
        return()=>group.delete(onNext);
      }};
    return ref;
  }
  function collection(path){
    return {doc:id=>doc(path+"/"+id),
      add:async()=>{databaseWrites++;throw Error("MCAP readonly test prohibited writes");},
      get:async()=>({forEach:()=>{}})};
  }
  const firestore={
    doc,collection,settings:()=>{},
    runTransaction:async fn=>fn({get:async ref=>snapshot(ref),
      set:()=>{databaseWrites++;throw Error("MCAP readonly test prohibited transactions")},
      update:()=>{databaseWrites++;throw Error("MCAP readonly test prohibited transactions")},
      delete:()=>{databaseWrites++;throw Error("MCAP readonly test prohibited transactions")}})
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
    signOut:async()=>{auth.currentUser=null;throw Error("Readonly fixture: signout unimplemented")},
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
          const staged=await window.OMAXWorkingShards.stage({
            confirmation:window.OMAXWorkingShards.PHRASE,
            app,sharder:window.OMAXShardedState,
            working:window.OMAXWorkingStorage,cryptoApi:crypto,
            fetchImpl:window.fetch.bind(window),
            newId:()=>"localhost_readonly_fixture",
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
})();
