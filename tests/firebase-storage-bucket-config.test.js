"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");

const expected="wj-tracker-v2.firebasestorage.app";
const expectedProject="wj-tracker-v2";
const expectedAuthDomain="wj-tracker-v2.firebaseapp.com";
const html=fs.readFileSync("index.html","utf8");
const assignment=html.match(/window\.FIREBASE_CONFIG\s*=\s*(\{[\s\S]*?\});/);
assert.ok(assignment,"Firebase configuration must be present in index.html");
const context={window:{}};
vm.runInNewContext(`window.FIREBASE_CONFIG=${assignment[1]};`,context);
assert.equal(context.window.FIREBASE_CONFIG.storageBucket,expected);
assert.equal(context.window.FIREBASE_CONFIG.projectId,expectedProject);
assert.equal(context.window.FIREBASE_CONFIG.authDomain,expectedAuthDomain);
assert.doesNotMatch(context.window.FIREBASE_CONFIG.storageBucket,/appspot\.com$/);

// Firebase v8's no-argument storage service resolves refs from app.options.storageBucket.
const firebase={apps:[],initializeApp(options){
  const app={options:{...options}};
  firebase.apps.push(app);
  return app;
},storage(){
  const app=firebase.apps[0];
  return {ref(){return{bucket:app.options.storageBucket};}};
}};
const app=firebase.initializeApp(context.window.FIREBASE_CONFIG);
assert.equal(app.options.storageBucket,expected);
assert.equal(app.options.projectId,expectedProject);
assert.equal(firebase.storage().ref().bucket,expected);

const service=fs.readFileSync("js/cfr05CloudCuttingFiles.js","utf8");
const rules=fs.readFileSync("storage.rules","utf8");
assert.match(service,/EXPECTED_BUCKET="wj-tracker-v2\.firebasestorage\.app"/);
assert.match(service,/EXPECTED_PROJECT="wj-tracker-v2"/);
assert.match(rules,/bucket == 'wj-tracker-v2\.firebasestorage\.app'/);
assert.doesNotMatch(service,/EXPECTED_BUCKET="wj-tracker-v2\.appspot\.com"/);

console.log("ok - Firebase v8 default Storage resolves the production firebasestorage.app bucket");
