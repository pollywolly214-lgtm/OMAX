"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");

const expected="wj-tracker-v2.firebasestorage.app";
const expectedProject="wj-tracker-v2";
const expectedAuthDomain="wj-tracker-v2.firebaseapp.com";
const expectedConfig=Object.freeze({
  apiKey:"AIzaSyCyEyx8BmJ7W9LglvSueq8hWngYfc98ao0",
  authDomain:expectedAuthDomain,
  projectId:expectedProject,
  storageBucket:expected,
  messagingSenderId:"954724944176",
  appId:"1:954724944176:web:469af1bd9e3ed7c47e20f5",
  measurementId:"G-D18BYT6CPE"
});
const html=fs.readFileSync("index.html","utf8");
const assignment=html.match(/window\.FIREBASE_CONFIG\s*=\s*(\{[\s\S]*?\});/);
assert.ok(assignment,"Firebase configuration must be present in index.html");
const context={window:{}};
vm.runInNewContext(`window.FIREBASE_CONFIG=${assignment[1]};`,context);
assert.deepEqual(JSON.parse(JSON.stringify(context.window.FIREBASE_CONFIG)),expectedConfig);
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
for(const obsolete of [
  "AIzaSyDhUtEx4uvUN_CssllXlm5f3dE8-MTqei0",
  "496764208080",
  "1:496764208080:web:43cdd192e462844f7b5335",
  "omax-maintenance"
])assert.equal(html.includes(obsolete),false,`obsolete Firebase identifier: ${obsolete}`);

console.log("ok - Firebase v8 default Storage resolves the production firebasestorage.app bucket");
