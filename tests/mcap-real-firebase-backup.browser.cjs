"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path");
const run=require("./mcap-real-firebase.browser.cjs"),backup=require("./fixtures/mcap-database-backup.cjs"),{inventory,assertImportedInventory,validateExport,digest}=require("./fixtures/mcap-backup-inventory.cjs");
test("real Firebase browser: complete database backup "+process.env.MCAP_BACKUP_PHASE,{timeout:600000},async t=>{
  assert.equal(process.env.MCAP_EMULATOR_ONLY,undefined,"Database backup acceptance is always complete");
  const dir=process.env.MCAP_BACKUP_DIR;assert.ok(dir&&path.isAbsolute(dir));
  const base=path.resolve(__dirname,"../artifacts");assert.ok(path.resolve(dir).startsWith(base+path.sep));
  if(process.env.MCAP_BACKUP_PHASE==="prepare")await run(t,backup.prepare(dir));
  else{
    assert.equal(process.env.MCAP_BACKUP_PHASE,"verify");
    const evidence=JSON.parse(await fs.readFile(path.join(dir,"evidence.json"),"utf8"));
    let preflightFailure;
    await t.test("backup imported Auth, every Firestore document and all Storage objects match before opening the app",async()=>{try{
      await validateExport(path.join(dir,"emulator-export"),evidence.exportFiles);
      assert.equal(digest(await fs.readFile(path.join(dir,"logical-backup.json"))),evidence.logicalSha256);
      const restored=await inventory();assertImportedInventory(restored,evidence.inventory,evidence.exportedAtSeconds);
      evidence.restoredAuthSessions=restored.authSessions;
    }catch(error){preflightFailure=error;throw error;}});
    if(preflightFailure)throw preflightFailure;
    await run(t,backup.verify(evidence));
  }
});
