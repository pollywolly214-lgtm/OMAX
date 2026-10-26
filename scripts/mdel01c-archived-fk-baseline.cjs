"use strict";
// Explicit read-only baseline experiment; requires the PR's main-base Git object.
// Kept outside automatic unit discovery so shallow checkouts need no old objects.
const assert=require("node:assert/strict"),cp=require("node:child_process"),vm=require("node:vm");
const archive=require("../js/maintenanceTaskArchive"),identity=require("../js/globalIdentityRepair");
const {fixture,trashFor}=require("../tests/fixtures/mdel01-maintenance-task");
const oldSource=cp.execFileSync("git",["show","633e144c76c564e88419e4c0f3b1efe8027b132d:js/globalIdentityRepair.js"],{encoding:"utf8"});
const oldModule={exports:{}},context=vm.createContext({module:oldModule,exports:oldModule.exports,require:()=>require("../js/inventoryIdentityRepair")});
vm.runInContext(oldSource,context);
const source=fixture(),archived=archive.plan(source,"fixture-task-A",trashFor(source));
const before=structuredClone(archived),old=oldModule.exports.integrity(archived),current=identity.integrity(archived);
assert.ok(old.blockers.some(reason=>reason.includes("inventory[0].linkedTaskId")&&reason.includes("0 exact logical targets")));
assert.equal(current.valid,true,current.blockers.join("\n"));assert.deepEqual(archived,before);
console.log("PASS: main-base validator rejects the synthetic archived inventory FK; PR #520 validates the exact archived identity. No source data changed.");
