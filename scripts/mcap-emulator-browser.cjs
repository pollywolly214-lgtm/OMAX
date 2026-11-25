"use strict";
// Runs ONLY local Auth/Firestore/Storage emulators in a demo project. Rules
// differ from proposed source only in their explicit test project/bucket/UID.
const fs=require("node:fs/promises"),path=require("node:path"),os=require("node:os");
const {spawn}=require("node:child_process");
const {PROJECT,AUTH,FIRESTORE,STORAGE,bindIdentity}=require("../tests/fixtures/mcap-emulator-identity.cjs");
(async()=>{
  const selection=process.argv[2]||"core";
  const suites={core:"tests/mcap-real-firebase.browser.cjs",receipts:"tests/mcap-real-firebase-receipts.browser.cjs",recovery:"tests/mcap-real-firebase-recovery.browser.cjs",backup:"tests/mcap-real-firebase-backup.browser.cjs"};
  if(!Object.hasOwn(suites,selection)||process.argv.length>3)throw Error("Choose core, receipts, recovery or backup acceptance; no arbitrary test command is accepted.");
  const suite=suites[selection];
  const root=path.resolve(__dirname,".."),dir=await fs.mkdtemp(path.join(os.tmpdir(),"omax-mcap-emulators-"));
  for(const [source,target]of [["storage.rules","storage.rules"],["docs/firestore-sharded-cutover-PROPOSAL.rules","firestore.rules"]]){
    await fs.writeFile(path.join(dir,target),bindIdentity(await fs.readFile(path.join(root,source),"utf8")));
  }
  const config={firestore:{rules:path.join(dir,"firestore.rules")},storage:{rules:path.join(dir,"storage.rules")},
    emulators:{auth:{host:"127.0.0.1",port:9097},firestore:{host:"127.0.0.1",port:8188},storage:{host:"127.0.0.1",port:9197},
      hub:{host:"127.0.0.1",port:4447},logging:{host:"127.0.0.1",port:4597},ui:{enabled:false},singleProjectMode:true}};
  const configPath=path.join(dir,"firebase.json");await fs.writeFile(configPath,JSON.stringify(config,null,2));
  const cli=require.resolve("firebase-tools/lib/bin/firebase.js");
  const execute=(phaseEnv={},importDir=null)=>new Promise((resolve,reject)=>{
    const args=[cli,"emulators:exec","--only","auth,firestore,storage","--project",PROJECT,"--config",configPath];
    if(importDir)args.push("--import",importDir);
    args.push("node --test --test-concurrency=1 "+suite);
    const child=spawn(process.execPath,args,{
    cwd:root,stdio:"inherit",env:{...process.env,...phaseEnv,GCLOUD_PROJECT:PROJECT,MCAP_REAL_EMULATORS:"1",MCAP_EMULATOR_CONFIG:configPath,
      FIREBASE_AUTH_EMULATOR_HOST:AUTH,FIRESTORE_EMULATOR_HOST:FIRESTORE,FIREBASE_STORAGE_EMULATOR_HOST:STORAGE,
      FIREBASE_CLI_DISABLE_UPDATE_CHECK:"true"}});
    child.once("error",reject);child.once("exit",code=>resolve(code===0?0:1));
  });
  if(selection==="backup"){
    const base=path.join(root,"artifacts");await fs.mkdir(base,{recursive:true});
    const backupDir=await fs.mkdtemp(path.join(base,"mcap-database-backup-"));
    const prepared=await execute({MCAP_BACKUP_PHASE:"prepare",MCAP_BACKUP_DIR:backupDir});
    if(prepared){process.exitCode=prepared;return;}
    const evidence=JSON.parse(await fs.readFile(path.join(backupDir,"evidence.json"),"utf8"));
    const {validateExport,digest}=require("../tests/fixtures/mcap-backup-inventory.cjs");
    await validateExport(path.join(backupDir,"emulator-export"),evidence.exportFiles);
    if(digest(await fs.readFile(path.join(backupDir,"logical-backup.json")))!==evidence.logicalSha256)throw Error("Logical backup bytes changed before import");
    // First services have exited. Only now start fresh services with the validated export.
    process.exitCode=await execute({MCAP_BACKUP_PHASE:"verify",MCAP_BACKUP_DIR:backupDir},path.join(backupDir,"emulator-export"));
  }else process.exitCode=await execute();
})().catch(error=>{console.error(error);process.exitCode=1;});
