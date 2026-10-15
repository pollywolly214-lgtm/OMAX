"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),{randomBytes}=require("node:crypto");
const core=fs.readFileSync("js/core.js","utf8"),html=fs.readFileSync("index.html","utf8");
const start=core.indexOf("  async function ensureEmailPassword("),end=core.indexOf('  window.addEventListener("keydown", handleLoginShortcut);',start);
const handlers=core.slice(start,end),editable=core.slice(core.indexOf("function isEditableTarget(el){"),core.indexOf('\nwindow.addEventListener("keydown", (e)=>{',core.indexOf("function isEditableTarget(el){")));
function harness(){
  const calls={open:0,hide:0,emailFocus:0,passFocus:0,select:0,prevented:0,submit:0,firebase:0,signOut:0,alerts:[]};
  // Runtime-only synthetic values; no real or static account credentials in fixtures.
  const generatedEmail=randomBytes(8).toString("hex")+"@example.invalid",generatedSecret=randomBytes(24).toString("base64");
  const emailEl={value:"",focus:()=>calls.emailFocus++,select:()=>calls.select++},passEl={value:"",focus:()=>calls.passFocus++},button={disabled:false};
  const form={setAttribute(){},querySelector:()=>button,requestSubmit(){calls.submit++;this.pending=this.onsubmit({preventDefault(){}});}};
  const env={FB:{user:null,auth:{signInWithEmailAndPassword:async(email,password)=>{calls.firebase++;calls.correctPath=email===generatedEmail&&password===generatedSecret;return{user:{uid:"fixture"}};},signOut:async()=>calls.signOut++}},modal:{},document:{activeElement:null},form,emailEl,passEl,btnIn:{},btnOut:{},btnClose:{},showModal:()=>calls.open++,hideModal:()=>calls.hide++,alert:message=>calls.alerts.push(message)};
  vm.createContext(env);vm.runInContext(editable+"\n"+handlers+"\nthis.handle=handleLoginShortcut;",env);
  return{env,calls,form,button,fill(){emailEl.value=generatedEmail;passEl.value=generatedSecret;},emailOnly(){emailEl.value=generatedEmail;},run:extra=>env.handle({key:"s",ctrlKey:true,target:{tagName:"BODY"},preventDefault:()=>calls.prevented++,...extra})};
}
test("Ctrl/Cmd+S only opens the normal form regardless of empty, partial or populated credentials",()=>{
  for(const modifiers of [{ctrlKey:true,metaKey:false},{ctrlKey:false,metaKey:true}]){
    for(const fields of ["empty","emailOnly","fill"]){
      const h=harness();if(fields!=="empty")h[fields]();h.run(modifiers);
      assert.equal(h.calls.open,1);assert.equal(h.calls.emailFocus,1);assert.equal(h.calls.passFocus,0);assert.equal(h.calls.select,1);assert.equal(h.calls.submit,0);assert.equal(h.calls.firebase,0);assert.equal(h.calls.hide,0);
    }
  }
});

test("manual submission still uses the normal Firebase email/password handler",async()=>{
  const h=harness();h.fill();await h.form.onsubmit({preventDefault(){}});assert.equal(h.calls.firebase,1);assert.equal(h.calls.correctPath,true);assert.equal(h.calls.hide,1);
});
test("manual sign-in keeps its in-flight lock and blocks the shortcut while pending",async()=>{
  const h=harness();let release;h.fill();h.env.FB.auth.signInWithEmailAndPassword=()=>{h.calls.firebase++;return new Promise(resolve=>{release=()=>resolve({user:{uid:"fixture"}});});};
  const pending=h.form.onsubmit({preventDefault(){}});h.run();await h.form.onsubmit({preventDefault(){}});assert.equal(h.calls.open,0);assert.equal(h.calls.firebase,1);assert.equal(h.button.disabled,true);release();await pending;assert.equal(h.button.disabled,false);
});
test("normal auth errors remain visible and a later manual retry can succeed; sign-out unchanged",async()=>{
  const h=harness();h.fill();h.env.FB.auth.signInWithEmailAndPassword=async()=>{throw Error("Fixture authentication rejected");};await h.form.onsubmit({preventDefault(){}});assert.deepEqual(h.calls.alerts,["Fixture authentication rejected"]);assert.equal(h.calls.hide,0);assert.equal(h.button.disabled,false);
  h.env.FB.auth.signInWithEmailAndPassword=async()=>({user:{uid:"fixture"}});await h.form.onsubmit({preventDefault(){}});assert.equal(h.calls.hide,1);await h.env.btnOut.onclick();assert.equal(h.calls.signOut,1);
});
test("editable-focus, signed-in, modifier and repeat guards remain effective even with filled fields",()=>{
  const blocked=[{target:{tagName:"INPUT"}},{target:{tagName:"TEXTAREA"}},{target:{tagName:"SELECT"}},{target:{isContentEditable:true}},{target:{tagName:"SPAN",closest:()=>({})}},{defaultPrevented:true},{repeat:true},{altKey:true},{shiftKey:true},{key:"x"},{ctrlKey:false}];
  for(const extra of blocked){const h=harness();h.fill();h.run(extra);assert.equal(h.calls.open,0);assert.equal(h.calls.submit,0);assert.equal(h.calls.prevented,0);}
  for(const active of [{tagName:"INPUT"},{tagName:"TEXTAREA"},{tagName:"SELECT"},{isContentEditable:true}]){const h=harness();h.fill();h.env.document.activeElement=active;h.run();assert.equal(h.calls.open,0);assert.equal(h.calls.submit,0);}
  const h=harness();h.fill();h.env.FB.user={uid:"fixture"};h.run();assert.equal(h.calls.open,0);assert.equal(h.calls.submit,0);assert.equal(h.calls.firebase,0);
  const sdk=harness();sdk.fill();sdk.env.FB.auth.currentUser={uid:"fixture"};sdk.run();assert.equal(sdk.calls.open,0);assert.equal(sdk.calls.submit,0);assert.equal(sdk.calls.firebase,0);
});
test("password-manager attributes and existing Firebase LOCAL persistence are retained",()=>{
  assert.match(html,/<form id="authForm"[^>]*autocomplete="on"/);assert.match(html,/<input id="authEmail"[^>]*name="email"[^>]*autocomplete="username"/);assert.match(html,/<input id="authPass"[^>]*type="password"[^>]*autocomplete="current-password"/);
  assert.match(core,/setPersistence\(firebase\.auth\.Auth\.Persistence\.LOCAL\)/);
});
