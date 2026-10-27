(function(root, factory){
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root){
    root.OMAXFirebaseOperations = api.createTracker();
    const mount = ()=>api.bindIndicator(root.OMAXFirebaseOperations, root.document);
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", mount, {once:true});
    else mount();
  }
})(typeof window === "undefined" ? null : window, function(){
  "use strict";
  const labels = Object.freeze({saving:"Saving...", loading:"Loading...", updating:"Updating...", deleting:"Deleting..."});
  function createTracker(){
    const pending = new Map(), listeners = new Set();
    const snapshot = ()=>{
      const types = new Set(pending.values());
      return Object.freeze({pending:pending.size, label:types.size > 1 ? "Working..." : labels[types.values().next().value] || ""});
    };
    const notify = ()=>{
      const state = snapshot();
      // Presentation must never change the result or cleanup of a backend action.
      for (const listener of listeners){ try { listener(state); } catch (_) {} }
    };
    function begin(type){
      const token = Object.freeze({});
      pending.set(token, Object.hasOwn(labels, type) ? type : "saving");
      notify();
      let released = false;
      return Object.freeze({token, release(){
        if (released) return;
        released = true;
        pending.delete(token);
        notify();
      }});
    }
    async function run(type, work, parentToken){
      // Explicit parent ownership avoids counting the queue's save a second time.
      if (pending.has(parentToken)) return await work(parentToken);
      const operation = begin(type);
      try { return await work(operation.token); }
      finally { operation.release(); }
    }
    return Object.freeze({begin, run, snapshot, subscribe(listener){
      listeners.add(listener);
      try { listener(snapshot()); } catch (_) {}
      return ()=>listeners.delete(listener);
    }});
  }
  function bindIndicator(tracker, document){
    const indicator = document.getElementById("firebaseOperationStatus");
    const label = document.getElementById("firebaseOperationLabel");
    if (!indicator || !label) return ()=>{};
    return tracker.subscribe(state=>{
      const text = state.pending ? state.label : "";
      // Announce only actual label changes, never every token/count transition.
      if (label.textContent !== text) label.textContent = text;
      indicator.hidden = state.pending === 0;
    });
  }
  return Object.freeze({createTracker, bindIndicator});
});
