(function(root, factory){
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OMAXAtomicPersistence = api;
})(typeof window === "undefined" ? null : window, function(){
  "use strict";
  const definiteCodes = new Set(["permission-denied", "unauthenticated", "invalid-argument", "failed-precondition", "not-found", "aborted"]);
  const fail = (code, message) => Object.assign(new Error(message), { code, definite:true });
  function revision(state){
    const value = state?.syncMeta?.rev ?? 0;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw fail("invalid_revision", "Invalid authoritative revision; review before saving.");
    return value;
  }
  async function save({ db, docRef, state, expectedRevision, prepare, scan, clientId, now = ()=>Date.now(), setOptions = { merge:true } }){
    let queued = false;
    let committedState = null;
    if (!db || typeof db.runTransaction !== "function") return { saved:false, blocked:true, stateWriteAttempted:false, stateWriteCompleted:false, errorCode:"transaction_unavailable", error:"Atomic transactions are unavailable; authoritative writes are disabled." };
    try {
      if (scan(state).contaminated) throw fail("embedded_cutting_file_content_blocked", "Embedded cutting-file content was blocked from authoritative state.");
      // Freeze the caller's intent. Firestore may rerun this callback, but it must
      // never adopt a newer expected revision or mutate the application's state.
      const pending = JSON.parse(JSON.stringify(state));
      const expected = revision({ syncMeta:{ rev:expectedRevision } });
      await db.runTransaction(async transaction=>{
        const snapshot = await transaction.get(docRef);
        if (!snapshot.exists) throw fail("authoritative_state_missing", "Authoritative state is missing. Recovery review is required; no defaults were written.");
        const remote = snapshot.data();
        const actual = revision(remote);
        if (actual !== expected) throw fail("revision_conflict", `Revision conflict: expected ${expected}, found ${actual}. Export/reload before saving.`);
        const next = prepare ? prepare(JSON.parse(JSON.stringify(pending)), remote) : JSON.parse(JSON.stringify(pending));
        next.syncMeta = { ...(next.syncMeta || {}), rev:Math.max(now(), actual + 1), updatedAtISO:new Date(now()).toISOString(), updatedBy:clientId };
        const firewall = scan(next);
        if (firewall.contaminated) throw fail("embedded_cutting_file_content_blocked", "Embedded cutting-file content was blocked from authoritative state.");
        if (setOptions === null) transaction.set(docRef, next);
        else transaction.set(docRef, next, setOptions);
        queued = true;
        committedState = next;
      });
      return { saved:true, stateWriteAttempted:true, stateWriteCompleted:true, committedState, path:docRef.path, indeterminate:false };
    } catch (error){
      const definite = error?.definite === true || definiteCodes.has(error?.code);
      return { saved:false, blocked:definite, definiteFailure:definite, stateWriteAttempted:queued, stateWriteCompleted:false, indeterminate:queued && !definite, errorCode:String(error?.code || "transaction_error"), error:String(error?.message || error) };
    }
  }
  return Object.freeze({ save, revision });
});
