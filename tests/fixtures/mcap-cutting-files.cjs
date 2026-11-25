"use strict";
// Native application attachment API and actual emulator rules. Only the
// membership fixture and a deliberately denied metadata batch are controlled.
const assert=require("node:assert/strict"),{createHash}=require("node:crypto");
const {BUCKET,OWNER,FIRESTORE,STORAGE}=require("./mcap-emulator-identity.cjs");
const INDEX="workspaces/github-prod/app/stateIndexV1",JOB="mcap_attachment_job";
const DXF="0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n10\n21\n10\n0\nENDSEC\n0\nEOF\n";
module.exports=async function cuttingFiles({step,a,b,read,exact,ready,client,signIn,seedDoc,member,localRequest,legacy}){
  let rows=[];
  const pointer=()=>a.evaluate(async p=>(await FB.db.doc(p).get({source:"server"})).data(),INDEX);
  const unchanged=async(state,index)=>{
    await exact(a,state);assert.deepEqual(await pointer(),index);
    assert.deepEqual(await a.evaluate(async()=>(await FB.docRef.get({source:"server"})).data()),legacy);
  };
  const upload=(extension,text)=>a.evaluate(({extension,text,job})=>uploadCfr05CuttingFile(job,new File([text],"synthetic."+extension,{type:""})),{extension,text,job:JOB});
  const download=page=>page.evaluate(async({job,rows})=>{
    const results=[];
    for(const row of rows){
      let text=null;
      const result=await openCfr05CloudFile(job,row.fileId,{displayPreview:async()=>false,openObjectUrl:async url=>{text=await (await fetch(url)).text();}});
      const ref=FB.storage.ref(row.storagePath),meta=await ref.getMetadata();
      const bytes=await (await fetch(await ref.getDownloadURL(),{cache:"no-store"})).arrayBuffer();
      const sha=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(value=>value.toString(16).padStart(2,"0")).join("");
      results.push({completed:result.completed,route:result.previewRoute,opened:result.opened,text,sha,size:bytes.byteLength,type:meta.contentType,previewAvailable:result.previewAvailable});
    }
    return results;
  },{job:JOB,rows});
  await step("cutting file application uploads and reloads DXF ORD OMX without changing authority",async()=>{
    const before=await read(a),index=await pointer();
    assert.ok(before.cuttingJobs.some(job=>job.id===JOB),"Existing synthetic job is part of the verified fixture");
    try{
      for(const [extension,role]of [["dxf","owner"],["ord","admin"],["omx","operator"]]){
        await seedDoc("workspaces/github-prod/members/"+OWNER,member(role));
        const result=await upload(extension,extension==="dxf"?DXF:"Synthetic "+extension.toUpperCase()+" bytes\n");
        assert.equal(result.stage,"completed",JSON.stringify(result));
        assert.equal(result.completed.storageUpload,true);assert.equal(result.completed.firestoreBatchCommit,true);
        assert.equal(result.fullStateSaveCalls,0);assert.equal(result.protectedStateMutations,0);assert.equal(result.localStorageWrites,0);
      }
    }finally{await seedDoc("workspaces/github-prod/members/"+OWNER,member("owner"));}
    const listed=await a.evaluate(job=>listCfr05CloudFiles(job),JOB);
    assert.equal(listed.cloudFileCount,3,JSON.stringify(listed));assert.equal(listed.rejectedMetadataDocumentCount,0);
    rows=listed.files;
    const check=results=>{
      assert.equal(results.length,3);
      for(let i=0;i<rows.length;i++){
        const row=rows[i],result=results[i],text=row.extension==="dxf"?DXF:"Synthetic "+row.extension.toUpperCase()+" bytes\n";
        assert.equal(result.completed,true);assert.equal(result.opened,true);assert.equal(result.route,row.extension);
        assert.equal(result.text,text);assert.equal(result.sha,row.sha256);assert.equal(result.size,Buffer.byteLength(text));
        assert.equal(result.type,row.extension==="dxf"?"application/dxf":"application/octet-stream");
        assert.equal(result.previewAvailable,row.extension==="dxf");
      }
    };
    check(await download(a));await unchanged(before,index);
    await a.reload();await ready(a);await unchanged(before,index);
    const fresh=await a.evaluate(job=>listCfr05CloudFiles(job),JOB);assert.deepEqual(fresh.files,rows);
    check(await download(a));await unchanged(before,index);
    await b.waitForFunction(rev=>window.__loadedCloudRevisionForSaveGuard===rev,before.syncMeta.rev);await exact(b,before);
  });
  await step("cutting file native rules reject malformed writes and enforce roles and creator cleanup",async()=>{
    const before=await read(a),index=await pointer(),first=rows[0];
    const proof=await a.evaluate(async({job,first})=>{
      const denied=async work=>{try{await work();return "allowed";}catch(error){return error.code;}};
      const ref=FB.storage.ref(first.storagePath),meta=await ref.getMetadata(),file=FB.db.doc(`workspaces/github-prod/cuttingJobs/${job}/files/${first.fileId}`),compat=FB.db.doc(`workspaces/github-prod/cuttingJobs/${job}`);
      const results={overwrite:await denied(()=>ref.put(new Blob(["TEST"],{type:meta.contentType}),{contentType:meta.contentType,customMetadata:meta.customMetadata})),metadata:await denied(()=>ref.updateMetadata({customMetadata:{status:"changed"}})),list:await denied(()=>FB.storage.ref(`workspaces/github-prod/cutting-jobs/${job}/files`).listAll()),fileUpdate:await denied(()=>file.set({...first,originalName:"changed.dxf"})),fileDelete:await denied(()=>file.delete()),jobUpdate:await denied(()=>compat.set({changed:true},{merge:true})),jobDelete:await denied(()=>compat.delete()),jobList:await denied(()=>FB.db.collection("workspaces/github-prod/cuttingJobs").get())};
      const cases=["missing","extra","workspace","job","file","path","size","creator","checksum","status","extension","mime","filename","identifier","empty","oversize"];
      results.invalid=[];
      for(const [i,kind]of cases.entries()){
        const fileId=kind==="identifier"?"bad:id":"invalid_"+i,name=kind==="filename"?"rule.exe":"rule.dxf";
        const path=`workspaces/github-prod/cutting-jobs/${job}/files/${fileId}/${name}`;
        let size=kind==="empty"?0:kind==="oversize"?52428801:4,type=kind==="mime"?"text/html":"application/dxf";
        const custom={schemaVersion:"1",workspaceId:"github-prod",jobId:job,fileId,originalName:name,safeFileName:name,extension:"dxf",contentType:type,sizeBytes:String(size),storagePath:path,sha256:"a".repeat(64),status:"ready",createdBy:FB.user.uid,createdAtISO:new Date().toISOString()};
        if(kind==="missing")delete custom.sha256;
        if(kind==="extra")custom.unexpected="blocked";
        if(kind==="workspace")custom.workspaceId="other";
        if(kind==="job")custom.jobId="other";
        if(kind==="file")custom.fileId="other";
        if(kind==="path")custom.storagePath+="-changed";
        if(kind==="size")custom.sizeBytes="5";
        if(kind==="creator")custom.createdBy="other_creator";
        if(kind==="checksum")custom.sha256="a".repeat(63);
        if(kind==="status")custom.status="pending";
        if(kind==="extension")custom.extension="ord";
        const code=await denied(()=>FB.storage.ref(path).put(new Blob([new Uint8Array(size)],{type}),{contentType:type,customMetadata:custom}));
        results.invalid.push({kind,code});
      }
      return results;
    },{job:JOB,first});
    for(const key of ["overwrite","metadata","list"])assert.equal(proof[key],"storage/unauthorized",key);
    for(const key of ["fileUpdate","fileDelete","jobUpdate","jobDelete","jobList"])assert.equal(proof[key],"permission-denied",key);
    for(const result of proof.invalid)assert.equal(result.code,"storage/unauthorized",result.kind);
    try{
      await seedDoc("workspaces/github-prod/members/"+OWNER,member("viewer"));
      const viewed=await download(a);assert.ok(viewed.every(result=>result.completed));
      const blocked=await upload("ord","Viewer cannot upload\n");assert.equal(blocked.completed.storageUpload,false);assert.equal(blocked.attempted.storageUpload,false);
      const viewer=await a.evaluate(async row=>{
        const denied=async work=>{try{await work();return "allowed";}catch(error){return error.code;}};
        const fileId="viewer_write",storagePath=`workspaces/github-prod/cutting-jobs/${row.jobId}/files/${fileId}/viewer.dxf`,copy={...row,fileId,storagePath,safeFileName:"viewer.dxf",originalName:"viewer.dxf"};
        const custom=Object.fromEntries(Object.entries(copy).map(([key,value])=>[key,String(value)]));
        return {storage:await denied(()=>FB.storage.ref(storagePath).put(new Blob(["TEST"],{type:"application/dxf"}),{contentType:"application/dxf",customMetadata:{...custom,sizeBytes:"4",extension:"dxf",contentType:"application/dxf"}})),metadata:await denied(()=>FB.db.doc(`workspaces/github-prod/cuttingJobs/${row.jobId}/files/${fileId}`).set(copy)),delete:await denied(()=>FB.storage.ref(row.storagePath).delete())};
      },first);
      assert.equal(viewer.storage,"storage/unauthorized");assert.equal(viewer.metadata,"permission-denied");assert.equal(viewer.delete,"storage/unauthorized");
      for(const mutation of [{active:false},{uid:"wrong_uid"},{workspaceId:"other"},{schemaVersion:2},{role:"invalid"}]){
        await seedDoc("workspaces/github-prod/members/"+OWNER,{...member("owner"),...mutation});
        const denied=await a.evaluate(async row=>{
          const code=async work=>{try{await work();return "allowed";}catch(error){return error.code;}};
          return {storage:await code(()=>FB.storage.ref(row.storagePath).getMetadata()),metadata:await code(()=>FB.db.doc(`workspaces/github-prod/cuttingJobs/${row.jobId}/files/${row.fileId}`).get())};
        },first);
        assert.equal(denied.storage,"storage/unauthorized",JSON.stringify(mutation));assert.equal(denied.metadata,"permission-denied",JSON.stringify(mutation));
      }
    }finally{await seedDoc("workspaces/github-prod/members/"+OWNER,member("owner"));}
    const other=await client();
    try{
      await signIn(other,"mcap_attachment_outsider");
      for(const signedOut of [false,true]){
        if(signedOut)await other.evaluate(()=>firebase.auth().signOut());
        const code=await other.evaluate(async path=>{try{await firebase.app().storage().ref(path).getMetadata();return "allowed";}catch(error){return error.code;}},first.storagePath);
        assert.equal(code,"storage/unauthorized",signedOut?"anonymous":"outsider");
      }
    }finally{await other.close();}
    // Administrative fixture only: a valid, current object belonging to a
    // different creator must be readable but never client-deletable by owner.
    const name="other.dxf",fileId="other_creator",path=`workspaces/github-prod/cutting-jobs/${JOB}/files/${fileId}/${name}`,text="TEST";
    const metadata={...first,fileId,storagePath:path,originalName:name,safeFileName:name,extension:"dxf",contentType:"application/dxf",sizeBytes:4,sha256:createHash("sha256").update(text).digest("hex"),createdBy:"different_creator"};
    const custom=Object.fromEntries(Object.entries(metadata).map(([key,value])=>[key,String(value)])),boundary="mcap_fixture_boundary";
    await localRequest(`http://${STORAGE}/v0/b/${BUCKET}/o?name=${encodeURIComponent(path)}`,{method:"POST",headers:{Authorization:"Bearer owner","X-Goog-Upload-Protocol":"multipart","Content-Type":"multipart/related; boundary="+boundary},body:`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${JSON.stringify({name:path,contentType:"application/dxf",metadata:custom})}\r\n--${boundary}\r\nContent-Type: application/dxf\r\n\r\n${text}\r\n--${boundary}--`});
    const creator=await a.evaluate(async path=>{const ref=FB.storage.ref(path),meta=await ref.getMetadata();let code="allowed";try{await ref.delete();}catch(error){code=error.code;}return {creator:meta.customMetadata.createdBy,code};},path);
    assert.equal(creator.creator,"different_creator");assert.equal(creator.code,"storage/unauthorized");
    await unchanged(before,index);
  });
  await step("cutting file definite metadata denial cleans up once then fresh retry succeeds",async()=>{
    const before=await read(a),index=await pointer();let attempted=false,restored=0;const deletes=[];
    const watch=request=>{const url=new URL(request.url());if(url.origin==="http://"+STORAGE&&request.method()==="DELETE")deletes.push(decodeURIComponent(url.pathname.split("/o/")[1]||""));};
    const writesUrl=new RegExp(`^http://${FIRESTORE.replaceAll(".","\\.")}/google\\.firestore\\.v1\\.Firestore/Write/channel(?:\\?.*)?$`);
    const objectsUrl=new RegExp(`^http://${STORAGE.replaceAll(".","\\.")}/v0/b/${BUCKET.replaceAll(".","\\.")}/o/`);
    const intercept=async route=>{
      const request=route.request(),body=new URLSearchParams(request.postData()||"");
      if(attempted||request.method()!=="POST"||![...body.values()].some(value=>value.includes(`/cuttingJobs/${JOB}/files/`)))return route.continue();
      await seedDoc("workspaces/github-prod/members/"+OWNER,member("viewer"));
      attempted=true;return route.continue();
    };
    const cleanup=async route=>{
      const request=route.request(),path=decodeURIComponent(new URL(request.url()).pathname.split("/o/")[1]||"");
      if(request.method()==="DELETE"&&path.includes(`/cutting-jobs/${JOB}/files/`)){
        assert.equal(attempted,true,"Metadata write was sent under the denied role before cleanup");
        await seedDoc("workspaces/github-prod/members/"+OWNER,member("owner"));restored++;
      }
      return route.continue();
    };
    a.on("request",watch);await a.route(writesUrl,intercept);await a.route(objectsUrl,cleanup);
    let result;
    try{result=await upload("ord","Synthetic compensation acceptance\n");}
    finally{a.off("request",watch);await a.unroute(writesUrl,intercept);await a.unroute(objectsUrl,cleanup);await seedDoc("workspaces/github-prod/members/"+OWNER,member("owner"));}
    assert.equal(attempted,true);assert.equal(restored,1);assert.equal(result.completed.storageUpload,true);assert.equal(result.completed.firestoreBatchCommit,false);
    assert.equal(result.attempted.firestoreBatchCommit,true);assert.equal(result.indeterminate,false);
    assert.equal(result.completed.cleanupDelete,true);assert.equal(result.completed.cleanupAbsenceVerified,true);assert.equal(deletes.length,1);
    assert.equal(result.error.code,"permission-denied");assert.equal(result.manualReviewRequired,false);
    const missing=await a.evaluate(async path=>{try{await FB.storage.ref(path).getMetadata();return "present";}catch(error){return error.code;}},deletes[0]);
    assert.equal(missing,"storage/object-not-found");
    assert.deepEqual((await a.evaluate(job=>listCfr05CloudFiles(job),JOB)).files,rows,"Denied batch leaves no file metadata");
    await unchanged(before,index);
    const retried=await upload("ord","Synthetic compensation acceptance\n");assert.equal(retried.stage,"completed",JSON.stringify(retried));
    const after=await a.evaluate(job=>listCfr05CloudFiles(job),JOB);assert.equal(after.cloudFileCount,4);
    assert.equal(after.files.some(row=>row.storagePath===deletes[0]),false);
    for(const row of rows)assert.deepEqual(after.files.find(item=>item.fileId===row.fileId),row);
    await unchanged(before,index);await a.reload();await ready(a);await unchanged(before,index);
    assert.deepEqual((await a.evaluate(job=>listCfr05CloudFiles(job),JOB)).files,after.files);
  });
};
