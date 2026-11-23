"use strict";
// Runs ONLY local Auth/Firestore/Storage emulators in a demo project. Rules
// differ from proposed source only in their explicit test project/bucket/UID.
const fs=require("node:fs/promises"),path=require("node:path"),os=require("node:os");
const {spawn}=require("node:child_process");
const {PROJECT,AUTH,FIRESTORE,STORAGE,bindIdentity}=require("../tests/fixtures/mcap-emulator-identity.cjs");
(async()=>{
  const root=path.resolve(__dirname,".."),dir=await fs.mkdtemp(path.join(os.tmpdir(),"omax-mcap-emulators-"));
  for(const [source,target]of [["storage.rules","storage.rules"],["docs/firestore-sharded-cutover-PROPOSAL.rules","firestore.rules"]]){
    await fs.writeFile(path.join(dir,target),bindIdentity(await fs.readFile(path.join(root,source),"utf8")));
  }
  const config={firestore:{rules:path.join(dir,"firestore.rules")},storage:{rules:path.join(dir,"storage.rules")},
    emulators:{auth:{host:"127.0.0.1",port:9097},firestore:{host:"127.0.0.1",port:8188},storage:{host:"127.0.0.1",port:9197},
      hub:{host:"127.0.0.1",port:4447},logging:{host:"127.0.0.1",port:4597},ui:{enabled:false},singleProjectMode:true}};
  const configPath=path.join(dir,"firebase.json");await fs.writeFile(configPath,JSON.stringify(config,null,2));
  const cli=require.resolve("firebase-tools/lib/bin/firebase.js");
  const child=spawn(process.execPath,[cli,"emulators:exec","--only","auth,firestore,storage","--project",PROJECT,"--config",configPath,
    "node --test --test-concurrency=1 tests/mcap-real-firebase.browser.cjs"],{
    cwd:root,stdio:"inherit",env:{...process.env,GCLOUD_PROJECT:PROJECT,MCAP_REAL_EMULATORS:"1",
      FIREBASE_AUTH_EMULATOR_HOST:AUTH,FIRESTORE_EMULATOR_HOST:FIRESTORE,FIREBASE_STORAGE_EMULATOR_HOST:STORAGE,
      FIREBASE_CLI_DISABLE_UPDATE_CHECK:"true"}});
  child.on("error",error=>{console.error(error);process.exitCode=1;});
  child.on("exit",code=>{process.exitCode=code===0?0:1;});
})().catch(error=>{console.error(error);process.exitCode=1;});
