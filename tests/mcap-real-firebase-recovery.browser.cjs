"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const run=require("./mcap-real-firebase.browser.cjs"),recovery=require("./fixtures/mcap-recovery-phases.cjs");
test("real Firebase browser: account transitions and persistent shard recovery",{timeout:600000},async t=>{
  assert.equal(process.env.MCAP_EMULATOR_ONLY,undefined,"Recovery acceptance runs its complete sequence; clear development filters");
  await run(t,recovery);
});
