(function(){
  "use strict";
  const active = new URLSearchParams(location.search).get("devsafe") === "1"
    && ["localhost","127.0.0.1","[::1]","::1"].includes(location.hostname);
  Object.defineProperty(window,"DEVSAFE_MODE",{ value:active, writable:false, configurable:false });
  const prefix = "omax_ph03_disposable_v1:";
  if (!active){ Object.defineProperty(window,"OMAXDevSafe",{ value:Object.freeze({ active:false }) }); return; }
  // Namespace every app cache, backup and layout. Never read or remove real
  // recovery evidence in the browser profile used for local testing.
  const proto = Storage.prototype;
  const original = { get:proto.getItem, set:proto.setItem, remove:proto.removeItem, key:proto.key };
  const lengthGetter = Object.getOwnPropertyDescriptor(proto,"length").get;
  function keys(storage){
    const list=[];
    for(let i=0;i<lengthGetter.call(storage);i++){
      const key=original.key.call(storage,i);
      if(key?.startsWith(prefix))list.push(key.slice(prefix.length));
    }
    return list;
  }
  proto.getItem=function(key){ return original.get.call(this,prefix+key); };
  proto.setItem=function(key,value){ return original.set.call(this,prefix+key,value); };
  proto.removeItem=function(key){ return original.remove.call(this,prefix+key); };
  proto.key=function(index){ return keys(this)[index] ?? null; };
  proto.clear=function(){ for(const key of keys(this))this.removeItem(key); };
  Object.defineProperty(proto,"length",{ get(){return keys(this).length;} });
  const forbidden = url=>{
    const host=new URL(String(url),location.href).hostname;
    return /(^|\.)(googleapis\.com|firebasestorage\.app|firebaseio\.com|graph\.microsoft\.com|api\.onedrive\.com|login\.microsoftonline\.com)$/.test(host);
  };
  const fetchOriginal=window.fetch.bind(window);
  window.fetch=(input,...args)=>{ if(forbidden(input?.url||input))throw Error("Dev-safe blocked business network request");return fetchOriginal(input,...args); };
  const open=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(method,url,...args){if(forbidden(url))throw Error("Dev-safe blocked business network request");return open.call(this,method,url,...args);};
  const Socket=window.WebSocket;
  window.WebSocket=function(url,...args){if(forbidden(url))throw Error("Dev-safe blocked business socket");return new Socket(url,...args);};
  Object.assign(window.WebSocket,Socket);
  const beacon=navigator.sendBeacon.bind(navigator);
  navigator.sendBeacon=(url,...args)=>!forbidden(url)&&beacon(url,...args);
  const copy=value=>value == null ? value : JSON.parse(JSON.stringify(value));
  const listeners=new Set(), files=new Map();
  // IndexedDB provides committed cross-tab reads; localStorage renderer caches
  // may lag after another tab releases a Web Lock. This database contains only fixtures.
  const database=new Promise((resolve,reject)=>{
    const request=indexedDB.open(prefix+"documents",1);
    request.onupgradeneeded=()=>request.result.createObjectStore("documents");
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  async function read(path){const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction("documents","readonly"),request=tx.objectStore("documents").get(path);request.onsuccess=()=>resolve(copy(request.result??null));request.onerror=()=>reject(request.error);});}
  async function snapshot(path){const value=await read(path);return{exists:value!=null,data:()=>copy(value),metadata:{hasPendingWrites:false}};}
  async function store(path,value){const db=await database;await new Promise((resolve,reject)=>{const tx=db.transaction("documents","readwrite");if(value==null)tx.objectStore("documents").delete(path);else tx.objectStore("documents").put(copy(value),path);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});}
  const write=async(path,value,options)=>{
    const next=options?.merge?{...await read(path),...copy(value)}:copy(value);
    await store(path,next);
    localStorage.setItem("document:"+path,JSON.stringify(next));
    queueMicrotask(async()=>{const snap=await snapshot(path);listeners.forEach(item=>{if(item.path===path)item.callback(snap);});});
  };
  const collection=path=>({
    doc:id=>doc(path+"/"+id),
    add:async value=>{const ref=doc(path+"/fixture_"+crypto.randomUUID());await ref.set(value);return ref;},
    get:async()=>{const rows=[];for(const key of keys(localStorage)){if(key.startsWith("document:"+path+"/")&&!key.slice(9+path.length+1).includes("/")){const documentPath=key.slice(9);rows.push({...await snapshot(documentPath),id:documentPath.split("/").pop()});}}return{forEach(callback){rows.forEach(callback);}};}
  });
  function doc(path){return {path,collection:name=>collection(path+"/"+name),get:async()=>snapshot(path),set:async(value,options)=>write(path,value,options),async deleteFixture(){await store(path,null);localStorage.removeItem("document:"+path);},onSnapshot(callback){const item={path,callback};listeners.add(item);return()=>listeners.delete(item);}};}
  const db={doc,collection,settings(){},async runTransaction(callback){
    if(!navigator.locks)throw Object.assign(Error("Disposable cross-tab lock unavailable"),{code:"failed-precondition"});
    return navigator.locks.request(prefix+"transaction",async()=>{
      const writes=[];
      const result=await callback({get:ref=>ref.get(),set(ref,value,options){writes.push({ref,value,options});}});
      for(const item of writes)await write(item.ref.path,item.value,item.options);
      return result;
    });
  },batch(){const writes=[];return{set(ref,value){writes.push({ref,value});},async commit(){for(const item of writes)await write(item.ref.path,item.value);}};}};
  const storage={ref:path=>({
    async put(file,metadata){files.set(path,{file,metadata});},
    async getMetadata(){const item=files.get(path);if(!item)throw Object.assign(Error("Fixture file missing"),{code:"storage/object-not-found"});return{fullPath:path,size:item.file.size,contentType:item.metadata.contentType,customMetadata:copy(item.metadata.customMetadata)};},
    async getDownloadURL(){const item=files.get(path);if(!item)throw Error("Fixture file missing");return URL.createObjectURL(item.file);},
    async delete(){files.delete(path);}
  })};
  Object.defineProperty(window,"OMAXDevSafe",{value:Object.freeze({active:true,db,storage,prefix,async initialize(path,state){const marker="fixture-provisioned:"+path;if(!localStorage.getItem(marker)){if(await read(path)==null)await write(path,state);localStorage.setItem(marker,"1");}},async seedMembership(path,workspaceId,uid){if(await read(path)==null)await write(path,{schemaVersion:1,uid,workspaceId,role:"owner",active:true,createdAtISO:"2026-09-30T00:00:00.000Z",updatedAtISO:"2026-09-30T00:00:00.000Z"});}})});
})();
