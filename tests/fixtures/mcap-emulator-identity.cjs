"use strict";
// Test-only namespace binding. Never imported by the production website.
const assert=require("node:assert/strict");
const PROJECT="demo-mcap-browser",BUCKET=PROJECT+".firebasestorage.app";
const OWNER="mcap_emulator_owner",AUTH="127.0.0.1:9097",FIRESTORE="127.0.0.1:8188",STORAGE="127.0.0.1:9197";
function bindIdentity(source){
  return source.replaceAll("wj-tracker-v2.firebasestorage.app",BUCKET)
    .replaceAll("wj-tracker-v2",PROJECT)
    .replaceAll("GntsaU7i2tXdDf05ds8cws5dfi63",OWNER);
}
function bindBrowserSource(source,file){
  let bound=bindIdentity(source);
  if(file==="js/core.js"){
    const gate="const MCAP_SHARDED_WRITES_ACTIVE = false;";
    assert.equal(source.split(gate).length,2,"Production write gate must remain closed");
    bound=bound.replace(gate,"const MCAP_SHARDED_WRITES_ACTIVE = true;");
  }
  if(file==="js/omaxShardedReadback.js"){
    // Real Storage Emulator URLs use HTTP. Rebind only this strict transport
    // allowlist in the served test copy; production keeps its HTTPS requirement.
    const gate='url.startsWith("https://")';
    assert.equal(source.split(gate).length,2,"Expected unique HTTPS guard");
    bound=bound.replace(gate,`(new URL(url).origin === "http://${STORAGE}")`);
  }
  return bound;
}
function assertEmulators(){
  assert.equal(process.env.GCLOUD_PROJECT,PROJECT,"Dedicated demo project required");
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST,FIRESTORE);
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,AUTH);
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST,STORAGE);
  assert.equal(process.env.MCAP_REAL_EMULATORS,"1","Use scripts/mcap-emulator-browser.cjs");
}
module.exports={PROJECT,BUCKET,OWNER,AUTH,FIRESTORE,STORAGE,bindIdentity,bindBrowserSource,assertEmulators};
