"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),{spawn}=require("node:child_process");
const {PROJECT,AUTH,FIRESTORE,BUCKET,OWNER,assertEmulators}=require("./mcap-emulator-identity.cjs");
const {inventory,json,digest,within,validateExport,documentRoot}=require("./mcap-backup-inventory.cjs");
const JOB="mcap_attachment_job",EMAIL="restore-fixture@demo.invalid",PASSWORD="Emulator_only_restore_2026!";
const DXF="0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n10\n21\n10\n0\nENDSEC\n0\nEOF\n";
const exportCli=async(dir)=>{
  assertEmulators();assert.ok(process.env.MCAP_EMULATOR_CONFIG);
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[require.resolve("firebase-tools/lib/bin/firebase.js"),"emulators:export",dir,"--force","--project",PROJECT,"--config",process.env.MCAP_EMULATOR_CONFIG],{stdio:"inherit",env:process.env});
    child.once("error",reject);child.once("exit",code=>code===0?resolve():reject(Error("Complete emulator export failed: "+code)));
  });
};
function prepare(dir){
  return async({step,a,b,read,exact,seedDoc,member,client,INDEX,STATE,legacy})=>{
    let files,secondaryUid;
    await step("backup fixture creates native files, a password account and typed nested documents",async()=>{
      const before=await read(a),index=await a.evaluate(async index=>(await FB.db.doc(index).get({source:"server"})).data(),INDEX);
      for(const [name,bytes]of [["restored.dxf",[...Buffer.from(DXF)]],["restored.omx",[0,1,2,255,13,10,5,6]]]){
        const uploaded=await a.evaluate(({job,name,bytes})=>uploadCfr05CuttingFile(job,new File([new Uint8Array(bytes)],name,{type:""})),{job:JOB,name,bytes});
        assert.equal(uploaded.stage,"completed",JSON.stringify(uploaded));assert.equal(uploaded.fullStateSaveCalls,0);
      }
      files=(await a.evaluate(job=>listCfr05CloudFiles(job),JOB)).files;assert.equal(files.length,2);
      const secondary=await client();
      try{
        secondaryUid=await secondary.evaluate(async({email,password})=>(await firebase.auth().createUserWithEmailAndPassword(email,password)).user.uid,{email:EMAIL,password:PASSWORD});
        await secondary.waitForFunction(uid=>FB.user?.uid===uid&&window.__cloudLoadAttemptComplete,secondaryUid);
      }finally{await secondary.context().close();}
      await seedDoc("workspaces/github-prod/members/"+secondaryUid,{...member("viewer"),uid:secondaryUid});
      await json(`http://${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({localId:secondaryUid,customAttributes:JSON.stringify({fixtureBackup:true,scope:"read-only"})})});
      const typed={largeInteger:{integerValue:"9223372036854775806"},timestamp:{timestampValue:"2026-11-24T12:34:56.123456Z"},bytes:{bytesValue:Buffer.from([0,1,255,10]).toString("base64")},reference:{referenceValue:documentRoot+"/"+STATE},extension:{mapValue:{fields:{retain:{stringValue:"Unknown typed evidence"}}}}};
      await json(`http://${FIRESTORE}/v1/${documentRoot}/workspaces/github-prod/backupEvidence/retained/nested/child`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({fields:typed})});
      await exact(a,before);await exact(b,before);assert.deepEqual(await a.evaluate(async index=>(await FB.db.doc(index).get({source:"server"})).data(),INDEX),index);
    });
    await step("backup native complete-state download and three-service export capture every namespace",async()=>{
      const state=await read(a),index=await a.evaluate(async index=>(await FB.db.doc(index).get({source:"server"})).data(),INDEX);
      await a.evaluate(()=>{window.__recoveryInspectMode=true;window.__autosaveDisabled=true;renderRecoveryDiagnosticsPanel();});
      const event=a.waitForEvent("download");await a.locator('[data-recovery-export="cloud"]').click();const download=await event;
      assert.match(download.suggestedFilename(),/^omax-cloud-state-.*\.json$/);const bytes=await fs.readFile(await download.path());assert.deepEqual(JSON.parse(bytes.toString("utf8")),state);
      await fs.writeFile(path.join(dir,"logical-backup.json"),bytes);
      await a.waitForFunction(()=>OMAXFirebaseOperations.snapshot().pending===0&&!hasPendingLocalChanges);
      const before=await inventory();assert.equal(before.accounts.length,2);assert.ok(before.documents.some(doc=>doc.name.endsWith("/backupEvidence/retained/nested/child")));assert.ok(before.documents.some(doc=>doc.name.endsWith("/"+INDEX)));assert.ok(before.objects.some(item=>item.name.endsWith("/restored.omx")));assert.ok(before.objects.length>files.length);
      const exportedAtSeconds=Math.floor(Date.now()/1000);
      await exportCli(path.join(dir,"emulator-export"));const exportFiles=await validateExport(path.join(dir,"emulator-export"));
      assert.deepEqual(await inventory(),before,"Backup export is read-only across all three services");
      assert.deepEqual(await a.evaluate(async index=>(await FB.db.doc(index).get({source:"server"})).data(),INDEX),index);
      const evidence={schemaVersion:1,projectId:PROJECT,bucket:BUCKET,actorUid:OWNER,state,legacy,index,inventory:before,files,secondaryUid,exportedAtSeconds,logicalSha256:digest(bytes),exportFiles};
      await fs.writeFile(path.join(dir,"evidence.json"),JSON.stringify(evidence));
    });
    await step("backup validation rejects incomplete metadata and changed component bytes before import",async()=>{
      const root=path.join(dir,"emulator-export"),evidence=JSON.parse(await fs.readFile(path.join(dir,"evidence.json"),"utf8"));
      const metadataPath=within(root,"firebase-export-metadata.json"),original=await fs.readFile(metadataPath),metadata=JSON.parse(original);
      try{delete metadata.storage;await fs.writeFile(metadataPath,JSON.stringify(metadata));await assert.rejects(validateExport(root,evidence.exportFiles),/Complete storage export required/);}finally{await fs.writeFile(metadataPath,original);}
      const component=evidence.exportFiles.find(file=>file.path!=="firebase-export-metadata.json"&&file.size>0),componentPath=within(root,component.path),content=await fs.readFile(componentPath),changed=Buffer.from(content);changed[0]^=1;
      try{await fs.writeFile(componentPath,changed);await assert.rejects(validateExport(root,evidence.exportFiles),/Every exported component file must retain exact bytes/);}finally{await fs.writeFile(componentPath,content);}
      await validateExport(root,evidence.exportFiles);
    });
  };
}
function verify(evidence){
  const fn=async({step,a,b,read,exact,client,INDEX})=>{
    let writes=0;const watch=request=>{if(new URL(request.url()).pathname.endsWith("/documents:commit")&&(request.postDataJSON()?.writes||[]).some(write=>write.update?.name?.endsWith("/"+INDEX)))writes++;};
    a.on("request",watch);b.on("request",watch);
    await step("backup restored application reconstructs exact full state and opens both native files",async()=>{
      await exact(a,evidence.state);await exact(b,evidence.state);
      const listed=await a.evaluate(job=>listCfr05CloudFiles(job),JOB);assert.deepEqual(listed.files,evidence.files);
      for(const file of evidence.files){
        const restored=await a.evaluate(async({job,file})=>{
          let openedBytes=null;const result=await openCfr05CloudFile(job,file.fileId,{displayPreview:async()=>false,openObjectUrl:async url=>{openedBytes=await(await fetch(url)).arrayBuffer();}});
          const sha=openedBytes?[...new Uint8Array(await crypto.subtle.digest("SHA-256",openedBytes))].map(byte=>byte.toString(16).padStart(2,"0")).join(""):null;
          return{completed:result.completed,opened:result.opened,sha,size:openedBytes?.byteLength};
        },{job:JOB,file});
        assert.equal(restored.completed,true);assert.equal(restored.opened,true);assert.equal(restored.sha,file.sha256);assert.equal(restored.size,file.sizeBytes);
      }
      assert.equal(writes,0);assert.deepEqual(await read(a),evidence.state);
    });
    await step("backup restored password login and custom claims retain the same secondary identity",async()=>{
      const secondary=await client();try{
        const result=await secondary.evaluate(async({email,password})=>{const user=(await firebase.auth().signInWithEmailAndPassword(email,password)).user;const token=await user.getIdTokenResult();return{uid:user.uid,backup:token.claims.fixtureBackup,scope:token.claims.scope};},{email:EMAIL,password:PASSWORD});
        assert.deepEqual(result,{uid:evidence.secondaryUid,backup:true,scope:"read-only"});await secondary.waitForFunction(()=>window.__cloudLoadAttemptComplete);
      }finally{await secondary.context().close();}
      assert.equal(writes,0);
    });
    await step("backup restored authority still locks out old writers and keeps every namespace exact",async()=>{
      const legacy=await a.evaluate(async()=>{let code="allowed";try{await FB.docRef.set({syncMeta:{rev:1}},{merge:true});}catch(error){code=error.code;}return{code,state:(await FB.docRef.get({source:"server"})).data()};});
      assert.equal(legacy.code,"permission-denied");assert.deepEqual(legacy.state,evidence.legacy);await exact(a,evidence.state);assert.equal(writes,0);
      const loggedInSessions=evidence.restoredAuthSessions.map(session=>({...session,customAuth:session.localId===OWNER}));
      assert.deepEqual(await inventory(),{...evidence.inventory,authSessions:loggedInSessions});
    });
    a.off("request",watch);b.off("request",watch);
  };
  fn.restoreEvidence=evidence;return fn;
}
module.exports={prepare,verify};
