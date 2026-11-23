"use strict";

// MCAP-PROPOSAL emulator security rules test. It never uses the production
// Firebase project, production credentials, production firebase.json or data.
// Run ONLY with firebase emulators:exec --project demo-mcap-security --only firestore.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {initializeTestEnvironment,assertFails,assertSucceeds}
  =require("@firebase/rules-unit-testing");
const {doc,setDoc,updateDoc,deleteDoc,getDoc,runTransaction}
  =require("firebase/firestore");

const PROJECT="demo-mcap-security";
const OWNER="GntsaU7i2tXdDf05ds8cws5dfi63";
const STATE="workspaces/github-prod/app/state";
const INDEX="workspaces/github-prod/app/stateIndexV1";
const META="workspaces/github-prod";
const LOG="workspaces/github-prod/app/saveLogs/entries/entry1";
const REV=1794576947956;
const sha=x=>x.repeat(64);
function legacy(revision=REV){
  return {schema:72,syncMeta:{rev:revision},maintenanceOccurrencesV2:[{id:"retained-event"}],
    completedCuttingJobs:[{id:"retained-job"}],inventory:[{id:"retained-inventory"}]};
}
function pointer(revision=REV,previousRevision=0,hash=sha("a")){
  const operationId="test_operation1";
  return {schemaVersion:1,mode:"active",workspaceId:"github-prod",
    projectId:"wj-tracker-v2",bucket:"wj-tracker-v2.firebasestorage.app",
    revision,previousRevision,manifestSha256:hash,operationId,
    manifestPath:"workspaces/github-prod/state-shards/v1/_manifest/"
      +operationId+"/"+hash+".json",
    actorUid:OWNER,createdAtISO:"2026-11-23T14:00:00.000Z"};
}
let env,ownerDb,otherDb,anonymousDb;
test.before(async()=>{
  // A demo project ID is mandatory. Wrong contexts must not silently use a
  // real Firebase project. The emulator host is supplied by emulators:exec.
  assert.equal(process.env.GCLOUD_PROJECT,PROJECT,
    "Run this test through the dedicated demo-mcap-security emulator");
  const raw=fs.readFileSync(path.join(__dirname,"../docs/firestore-sharded-cutover-PROPOSAL.rules"),"utf8");
  const endpoint=process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8187";
  const [host,port]=endpoint.split(":");
  env=await initializeTestEnvironment({
    projectId:PROJECT,
    firestore:{host,port:Number(port),rules:raw}
  });
  ownerDb=env.authenticatedContext(OWNER).firestore();
  otherDb=env.authenticatedContext("not_the_owner").firestore();
  anonymousDb=env.unauthenticatedContext().firestore();
});
test.beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),STATE),legacy());
  });
});
test.after(async()=>{if(env)await env.cleanup()});

test("legacy app/state writes work BEFORE index activation, unauthenticated access denied",async()=>{
  const stateRef=doc(ownerDb,STATE);
  await assertSucceeds(updateDoc(stateRef,{"syncMeta.rev":REV+1}));
  assert.equal((await getDoc(stateRef)).data().syncMeta.rev,REV+1);
  await assertFails(updateDoc(doc(otherDb,STATE),{"syncMeta.rev":REV+2}));
  await assertFails(updateDoc(doc(anonymousDb,STATE),{"syncMeta.rev":REV+2}));
  await assertFails(getDoc(doc(otherDb,STATE)));
  await assertFails(getDoc(doc(anonymousDb,STATE)));
});

test("activation requires the exact current Firestore revision, owner and valid immutable manifest identity",async()=>{
  const indexRef=doc(ownerDb,INDEX);
  await assertFails(setDoc(indexRef,pointer(REV-1)));
  await assertFails(setDoc(indexRef,{...pointer(),bucket:"malicious-bucket"}));
  await assertFails(setDoc(indexRef,{...pointer(),manifestPath:"unverified.json"}));
  await assertFails(setDoc(indexRef,{...pointer(),revision:REV,extraField:"unreviewed"}));
  await assertFails(setDoc(doc(otherDb,INDEX),pointer()));
  await assertSucceeds(runTransaction(ownerDb,async tx=>{
    const before=await tx.get(doc(ownerDb,STATE));
    const missing=await tx.get(indexRef);
    assert.equal(before.data().syncMeta.rev,REV);
    assert.equal(missing.exists(),false);
    tx.set(indexRef,pointer());
  }));
  assert.equal((await getDoc(indexRef)).data().revision,REV);
  await assertFails(setDoc(indexRef,pointer()));
});

test("after activation, ALL old-client full-state mutation methods fail and historical data stays unchanged",async()=>{
  const ref=doc(ownerDb,STATE),indexRef=doc(ownerDb,INDEX);
  const before=(await getDoc(ref)).data();
  await assertSucceeds(setDoc(indexRef,pointer()));
  await assertFails(updateDoc(ref,{"syncMeta.rev":REV+10}));
  await assertFails(setDoc(ref,legacy(REV+10)));
  await assertFails(setDoc(ref,{cuttingJobs:[]},{merge:true}));
  await assertFails(deleteDoc(ref));
  assert.deepEqual((await getDoc(ref)).data(),before);
  assert.equal((await getDoc(indexRef)).data().revision,REV);
});

test("manifest CAS updates must advance exactly from the last active revision",async()=>{
  const ref=doc(ownerDb,INDEX);
  await assertSucceeds(setDoc(ref,pointer()));
  await assertFails(updateDoc(ref,{revision:REV+1,previousRevision:REV-1}));
  await assertFails(updateDoc(ref,{revision:REV+1,previousRevision:REV,workspaceId:"wrong"}));
  await assertFails(updateDoc(ref,{revision:REV+1,previousRevision:REV,manifestSha256:"invalid"}));
  const next=pointer(REV+1,REV,sha("b"));
  await assertSucceeds(runTransaction(ownerDb,async tx=>{
    const current=await tx.get(ref);
    assert.equal(current.data().revision,REV);
    tx.set(ref,next);
  }));
  assert.deepEqual((await getDoc(ref)).data(),next);
  // A second stale writer prepared at REV cannot overwrite the new pointer.
  await assertFails(setDoc(ref,pointer(REV+2,REV,sha("c"))));
  await assertFails(deleteDoc(ref));
  assert.equal((await getDoc(ref)).data().revision,REV+1);
});

test("rollback permitted only before first sharded write, without deleting original state",async()=>{
  const indexRef=doc(ownerDb,INDEX),oldRef=doc(ownerDb,STATE);
  const before=(await getDoc(oldRef)).data();
  await assertSucceeds(setDoc(indexRef,pointer()));
  await assertSucceeds(deleteDoc(indexRef));
  assert.equal((await getDoc(indexRef)).exists(),false);
  assert.deepEqual((await getDoc(oldRef)).data(),before);
  await assertSucceeds(updateDoc(oldRef,{"syncMeta.rev":REV+1}));
  await assertFails(setDoc(indexRef,pointer())); // old revision no longer matches
});

test("non-state workspace metadata and nested save logs retain their previous rules",async()=>{
  await assertSucceeds(setDoc(doc(ownerDb,META),{workspaceId:"github-prod"},{merge:true}));
  await assertSucceeds(setDoc(doc(ownerDb,LOG),{atISO:"2026-11-23T14:00:00Z",status:"saved"}));
  await assertFails(setDoc(doc(otherDb,META),{workspaceId:"github-prod"}));
  await assertFails(setDoc(doc(otherDb,LOG),{status:"saved"}));
});

test("legacy transaction started before cutover cannot commit AFTER index activation",async()=>{
  const legacyRef=doc(ownerDb,STATE),indexRef=doc(ownerDb,INDEX);
  const before=(await getDoc(legacyRef)).data();
  let notifyRead,releaseWrite;
  const readReady=new Promise(resolve=>{notifyRead=resolve;});
  const continueTransaction=new Promise(resolve=>{releaseWrite=resolve;});
  const staleClient=runTransaction(ownerDb,async tx=>{
    const observed=await tx.get(legacyRef);
    assert.equal(observed.data().syncMeta.rev,REV);
    notifyRead();
    await continueTransaction;
    tx.update(legacyRef,{"syncMeta.rev":REV+1});
  });
  try{
    await readReady;
    await assertSucceeds(setDoc(indexRef,pointer()));
  }finally{
    releaseWrite();
  }
  await assertFails(staleClient);
  assert.deepEqual((await getDoc(legacyRef)).data(),before);
  assert.equal((await getDoc(indexRef)).data().revision,REV);
});
