"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const run=require("./mcap-real-firebase.browser.cjs"),receipts=require("./fixtures/mcap-receipts.cjs");
test("real Firebase browser: native purchase orders and financial reports",{timeout:600000},async t=>{
  assert.equal(process.env.MCAP_EMULATOR_ONLY,undefined,"Receipt acceptance runs its complete sequence; clear development filters");
  await run(t,receipts);
});
