"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),{createHash}=require("node:crypto");
const {PROJECT,AUTH,FIRESTORE,STORAGE,BUCKET,assertEmulators}=require("./mcap-emulator-identity.cjs");
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
const documentRoot=`projects/${PROJECT}/databases/(default)/documents`;
async function request(url,options={}){
  assertEmulators();assert.ok(["http://"+AUTH,"http://"+FIRESTORE,"http://"+STORAGE].includes(new URL(url).origin));
  const response=await fetch(url,{...options,headers:{Authorization:"Bearer owner",...options.headers}});
  assert.ok(response.ok,`Backup emulator request failed: ${response.status} ${await response.clone().text()}`);return response;
}
const json=async(url,options)=>(await request(url,options)).json();
async function inventory(){
  assertEmulators();const documents=[],objects=[],accounts=[],authSessions=[];
  const walk=async parent=>{
    assert.ok(parent===documentRoot||parent.startsWith(documentRoot+"/"));assert.ok(!parent.split("/").some(segment=>[".",".."].includes(segment)));
    let token;
    do{
      const collections=await json(`http://${FIRESTORE}/v1/${parent}:listCollectionIds`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pageSize:1000,...(token?{pageToken:token}:{})})});
      for(const collection of (collections.collectionIds||[]).sort()){
        assert.ok(collection&&!collection.includes("/")&&![".",".."].includes(collection));let page;
        do{
          const result=await json(`http://${FIRESTORE}/v1/${parent}/${encodeURIComponent(collection)}?pageSize=1000&showMissing=true${page?"&pageToken="+encodeURIComponent(page):""}`);
          for(const doc of result.documents||[]){
            if(doc.createTime||doc.fields)documents.push({name:doc.name,fields:doc.fields||{}});
            await walk(doc.name);
          }
          page=result.nextPageToken;
        }while(page);
      }
      token=collections.nextPageToken;
    }while(token);
  };
  await walk(documentRoot);
  let next;
  do{
    const result=await json(`http://${STORAGE}/v0/b/${BUCKET}/o?maxResults=1000${next?"&pageToken="+encodeURIComponent(next):""}`);
    for(const item of result.items||[]){
      const meta=await json(`http://${STORAGE}/v0/b/${BUCKET}/o/${encodeURIComponent(item.name)}`);
      const bytes=Buffer.from(await(await request(`http://${STORAGE}/v0/b/${BUCKET}/o/${encodeURIComponent(item.name)}?alt=media`)).arrayBuffer());
      assert.equal(Number(meta.size),bytes.length);
      objects.push({name:item.name,bucket:meta.bucket,contentType:meta.contentType,size:bytes.length,sha256:digest(bytes),metadata:meta.metadata||{},downloadTokens:meta.downloadTokens||null});
    }
    next=result.nextPageToken;
  }while(next);
  next=null;
  do{
    const result=await json(`http://${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchGet?maxResults=1000${next?"&nextPageToken="+encodeURIComponent(next):""}`);
    for(const user of result.users||[]){
      const {lastLoginAt,lastRefreshAt,validSince,passwordUpdatedAt,customAuth,...identity}=user;
      for(const flag of ["disabled","emailVerified"]){
        if(identity[flag]!==undefined)assert.equal(typeof identity[flag],"boolean");
        identity[flag]=identity[flag]??false;
      }
      const cutoff=validSince===undefined?null:Number(validSince);
      assert.ok(cutoff===null||(Number.isSafeInteger(cutoff)&&cutoff>=0));
      assert.ok(passwordUpdatedAt===undefined||Number.isSafeInteger(passwordUpdatedAt));
      assert.ok(customAuth===undefined||typeof customAuth==="boolean");
      accounts.push(identity);authSessions.push({localId:identity.localId,validSince:cutoff,passwordUpdatedAt:passwordUpdatedAt??null,customAuth:customAuth??false});
    }
    next=result.nextPageToken;
  }while(next);
  documents.sort((a,b)=>a.name.localeCompare(b.name));objects.sort((a,b)=>a.name.localeCompare(b.name));accounts.sort((a,b)=>a.localId.localeCompare(b.localId));
  authSessions.sort((a,b)=>a.localId.localeCompare(b.localId));
  return{documents,objects,accounts,authSessions};
}
function assertImportedInventory(actual,expected,exportedAtSeconds){
  const {authSessions:restored,...restoredData}=actual,{authSessions:original,...originalData}=expected;
  assert.deepEqual(restoredData,originalData,"All document values, object bytes and account credentials/claims survive import");
  assert.ok(Number.isSafeInteger(exportedAtSeconds));
  assert.deepEqual(restored.map(user=>user.localId),original.map(user=>user.localId));
  // Pinned Auth emulator uploadAccount resets validSince to import time. Verify
  // that session revocation advances; never discard this security assertion.
  for(let i=0;i<restored.length;i++){
    assert.ok(Number.isSafeInteger(restored[i].validSince));
    assert.ok(restored[i].validSince>=Math.max(exportedAtSeconds,original[i].validSince??0));
    assert.ok(restored[i].validSince<=Math.floor(Date.now()/1000)+1);
    assert.equal(restored[i].customAuth,false,"Import clears the emulator-only custom-token login marker");
    if(original[i].passwordUpdatedAt===null)assert.equal(restored[i].passwordUpdatedAt,null);
    else{
      assert.ok(Number.isSafeInteger(restored[i].passwordUpdatedAt));
      assert.ok(restored[i].passwordUpdatedAt>=Math.max(exportedAtSeconds*1000,original[i].passwordUpdatedAt));
      assert.ok(restored[i].passwordUpdatedAt<=Date.now()+1000);
    }
  }
}
function within(root,relative){
  assert.equal(typeof relative,"string");assert.ok(relative&&!path.isAbsolute(relative));const target=path.resolve(root,relative);
  assert.ok(target.startsWith(path.resolve(root)+path.sep),"Backup path must stay within its own directory");return target;
}
async function files(root){
  const result=[];
  const walk=async relative=>{
    const target=relative?within(root,relative):path.resolve(root);
    for(const entry of await fs.readdir(target,{withFileTypes:true})){
      assert.equal(entry.isSymbolicLink(),false,"Backup cannot contain symlinks");const child=relative?path.join(relative,entry.name):entry.name;
      if(entry.isDirectory())await walk(child);else{assert.equal(entry.isFile(),true);const bytes=await fs.readFile(within(root,child));result.push({path:child,size:bytes.length,sha256:digest(bytes)});}
    }
  };
  await walk("");return result.sort((a,b)=>a.path.localeCompare(b.path));
}
async function validateExport(root,expected){
  const metadata=JSON.parse(await fs.readFile(path.join(root,"firebase-export-metadata.json"),"utf8"));
  for(const service of ["auth","firestore","storage"]){assert.ok(metadata[service]?.path,`Complete ${service} export required`);assert.ok((await fs.stat(within(root,metadata[service].path))).isDirectory());}
  const found=await files(root);assert.ok(found.length>3);
  if(expected)assert.deepEqual(found,expected,"Every exported component file must retain exact bytes before import");
  return found;
}
module.exports={inventory,assertImportedInventory,request,json,digest,within,files,validateExport,documentRoot};
