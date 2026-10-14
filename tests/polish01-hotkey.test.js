"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const core = fs.readFileSync("js/core.js", "utf8");
const shortcut = core.slice(core.indexOf("  const handleLoginShortcut ="), core.indexOf('  window.addEventListener("keydown", handleLoginShortcut);'));
const editable = core.slice(core.indexOf("function isEditableTarget(el){"), core.indexOf('\nwindow.addEventListener("keydown", (e)=>{', core.indexOf("function isEditableTarget(el){")));
function harness() {
  const calls = {open:0, focus:0, select:0, prevented:0};
  const env = {FB:{user:null}, modal:{}, document:{activeElement:null}, showModal:()=>calls.open++, emailEl:{focus:()=>calls.focus++,select:()=>calls.select++}};
  vm.createContext(env);
  vm.runInContext(editable + "\n" + shortcut + "\nthis.handle = handleLoginShortcut;", env);
  return {env,calls,run:extra => env.handle({key:"s",ctrlKey:true,target:{tagName:"BODY"},preventDefault:()=>calls.prevented++,...extra})};
}
test("recovered Ctrl/Cmd+S only opens the normal sign-in dialog", () => {
  for (const modifier of [{ctrlKey:true,metaKey:false},{ctrlKey:false,metaKey:true}]) {
    const h = harness(); h.run(modifier);
    assert.deepEqual(h.calls,{open:1,focus:1,select:1,prevented:1});
  }
});
test("sign-in shortcut leaves typing, editable ancestors and signed-in sessions alone", () => {
  const blocked = [
    {target:{tagName:"INPUT"}}, {target:{tagName:"TEXTAREA"}}, {target:{tagName:"SELECT"}},
    {target:{isContentEditable:true}}, {target:{tagName:"SPAN",closest:()=>({})}},
    {defaultPrevented:true}, {repeat:true}, {altKey:true}, {shiftKey:true}, {key:"x"}, {ctrlKey:false}
  ];
  for (const extra of blocked) {const h=harness();h.run(extra);assert.equal(h.calls.open,0);assert.equal(h.calls.prevented,0);}
  for (const active of [{tagName:"INPUT"},{isContentEditable:true}]) {const h=harness();h.env.document.activeElement=active;h.run();assert.equal(h.calls.open,0);}
  const signedIn=harness();signedIn.env.FB.user={uid:"fixture"};signedIn.run();assert.equal(signedIn.calls.open,0);
});
