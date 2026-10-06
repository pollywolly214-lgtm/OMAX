(function(root, factory){
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OMAXInventoryMaterialMutations = api;
})(typeof window === "undefined" ? null : window, function(){
  "use strict";
  const clone = value => JSON.parse(JSON.stringify(value));
  const key = value => value === undefined ? "undefined" : value === null || typeof value !== "object" ? JSON.stringify(value)
    : Array.isArray(value) ? "[" + value.map(key).join(",") + "]"
    : "{" + Object.keys(value).sort().map(name => JSON.stringify(name) + ":" + key(value[name])).join(",") + "}";
  // Only these three paths are assigned by OMAXAtomicPersistence.save. The
  // isolated writer does not write saveMeta or syncProcessLog; keep them exact.
  const syncWriterFields = new Set(["rev", "updatedAtISO", "updatedBy"]);
  const unrelated = state => Object.fromEntries(Object.entries(state || {}).filter(([name]) => !["inventoryMaterials", "syncMeta"].includes(name)));
  const retainedSync = meta => Object.fromEntries(Object.entries(meta || {}).filter(([name]) => !syncWriterFields.has(name)));
  const business = state => Object.fromEntries(Object.entries(state || {}).filter(([name]) => !["syncMeta", "saveMeta", "syncProcessLog"].includes(name)));
  const propertyPath = (path, name) => /^[A-Za-z_$][\w$]*$/.test(name) ? path + "." + name : path + "[" + JSON.stringify(name) + "]";
  // Compare the complete JSON data without normalizing, discarding unknown
  // fields or sorting meaningful arrays. Object insertion order is irrelevant.
  function firstDifference(expected, actual, path){
    if (expected === actual) return null;
    if (!expected || !actual || typeof expected !== "object" || typeof actual !== "object" || Array.isArray(expected) !== Array.isArray(actual))
      return {path, expected, actual};
    if (Array.isArray(expected)){
      if (expected.length !== actual.length) return {path:path + ".length", expected:expected.length, actual:actual.length};
      for (let i = 0; i < expected.length; i++){
        const difference = firstDifference(expected[i], actual[i], path + "[" + i + "]");
        if (difference) return difference;
      }
    } else {
      for (const name of [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()){
        const child = propertyPath(path, name);
        if (!Object.hasOwn(expected, name) || !Object.hasOwn(actual, name))
          return {path:child, expected:expected[name], actual:actual[name], missing:!Object.hasOwn(expected, name) ? "expected" : "actual"};
        const difference = firstDifference(expected[name], actual[name], child);
        if (difference) return difference;
      }
    }
    return null;
  }
  const semanticMaterialEqual = (expected, actual) => !firstDifference(expected, actual, "inventoryMaterials");
  // Diagnostics retain only one bounded leaf (or a shape summary), never full
  // source/committed/readback application snapshots or protected business values.
  function compactValue(value){
    if (value === undefined) return {missing:true};
    if (Array.isArray(value)) return {kind:"array", length:value.length};
    if (value && typeof value === "object") return {kind:"object", keyCount:Object.keys(value).length};
    return typeof value === "string" && value.length > 256 ? {prefix:value.slice(0, 256), length:value.length, truncated:true} : value;
  }
  function compactDifference(difference, comparison, protectedValue = false){
    if (!difference) return {};
    const summary = value => ({kind:value === null ? "null" : Array.isArray(value) ? "array" : typeof value});
    return {comparison, mismatchPath:difference.path,
      expected:protectedValue ? summary(difference.expected) : compactValue(difference.expected),
      actual:protectedValue ? summary(difference.actual) : compactValue(difference.actual),
      ...(difference.missing ? {missing:difference.missing} : {})};
  }
  const unverified = reason => ({reason, readbackAvailable:false, fullStateAvailable:false, materialsMatch:null,
    committedMaterialsMatch:null, revisionValid:null, unrelatedBusinessStateMatch:null, metadataValid:null});
  function readContractError(message, reason, readback){
    const error = Error(message);
    error.code = "authoritative_" + reason;
    error.verification = {...unverified(reason), readbackAvailable:readback != null};
    return error;
  }
  function authoritativeState(readback){
    const state = readback?.state;
    if (!state || typeof state !== "object" || Array.isArray(state)
      || !Object.hasOwn(state, "inventoryMaterials") || !state.inventoryMaterials
      || typeof state.inventoryMaterials !== "object" || Array.isArray(state.inventoryMaterials))
      throw readContractError("Authoritative SERVER readback is incomplete: a full state with inventoryMaterials is required.", "incomplete_read_contract", readback);
    if (readback.revision !== state.syncMeta?.rev){
      const error = readContractError("Authoritative SERVER readback revision disagrees with its state snapshot.", "revision_mismatch", readback);
      error.verification = {...error.verification, fullStateAvailable:true, revisionValid:false,
        ...compactDifference({path:"readback.revision", expected:state.syncMeta?.rev, actual:readback.revision}, "readback envelope/state")};
      throw error;
    }
    return state;
  }
  function verifyReadback(source, intended, actual, writeResult, writerClientId){
    // Never label a missing full-state response as a material-value mismatch.
    authoritativeState({revision:actual?.syncMeta?.rev, state:actual});
    const acknowledged = writeResult?.saved === true && writeResult.stateWriteCompleted === true;
    const committed = writeResult?.committedState;
    const materialDifference = firstDifference(intended.inventoryMaterials, actual?.inventoryMaterials, "inventoryMaterials");
    const committedMaterialDifference = acknowledged ? firstDifference(intended.inventoryMaterials, committed?.inventoryMaterials, "inventoryMaterials") : null;
    const unrelatedDifference = firstDifference(unrelated(source), unrelated(intended), "state")
      || firstDifference(unrelated(source), unrelated(actual), "state")
      || (acknowledged && firstDifference(unrelated(source), unrelated(committed), "state"));
    const metadataValid = meta => {
      const timestamp = typeof meta?.updatedAtISO === "string" ? Date.parse(meta.updatedAtISO) : NaN;
      return meta && !Array.isArray(meta) && Number.isSafeInteger(meta.rev) && meta.rev > source.syncMeta.rev
        && typeof meta.updatedBy === "string" && meta.updatedBy.trim().length > 0
        && Number.isFinite(timestamp) && new Date(timestamp).toISOString() === meta.updatedAtISO
        && key(retainedSync(meta)) === key(retainedSync(source.syncMeta));
    };
    const revisionValid = Number.isSafeInteger(actual?.syncMeta?.rev) && actual.syncMeta.rev > source.syncMeta.rev
      && (!acknowledged || (Number.isSafeInteger(committed?.syncMeta?.rev) && actual.syncMeta.rev === committed.syncMeta.rev));
    const metadataDifference = acknowledged ? firstDifference(committed?.syncMeta, actual?.syncMeta, "syncMeta") : null;
    const verification = {readbackAvailable:true, fullStateAvailable:true, materialsMatch:!materialDifference,
      committedMaterialsMatch:acknowledged ? !!committed && !committedMaterialDifference : null,
      revisionValid, unrelatedBusinessStateMatch:!unrelatedDifference,
      metadataValid:!!metadataValid(actual?.syncMeta) && (!acknowledged || (!!metadataValid(committed?.syncMeta) && !metadataDifference))};
    const fail = (message, difference, comparison, protectedValue, reason) => {
      const error = Error(message);
      error.code = "verification_" + reason;
      error.verification = {...verification, reason, ...compactDifference(difference, comparison, protectedValue)};
      throw error;
    };
    if (!verification.materialsMatch)
      fail("Server readback material state differs from the intended post-mutation state.", materialDifference, "intended/serverReadback", false, "material_mismatch");
    if (unrelatedDifference)
      fail("Server readback changed unrelated business data or metadata not written by the material save.", unrelatedDifference, "source/businessState", true, "unrelated_business_mismatch");
    if (!metadataValid(actual?.syncMeta)){
      const difference = !revisionValid ? {path:"syncMeta.rev", expected:acknowledged ? committed?.syncMeta?.rev : {greaterThan:source.syncMeta.rev}, actual:actual?.syncMeta?.rev}
        : firstDifference(retainedSync(source.syncMeta), retainedSync(actual?.syncMeta), "syncMeta")
          || {path:"syncMeta.updatedAtISO", expected:"canonical ISO timestamp and nonempty writer", actual:actual?.syncMeta?.updatedAtISO};
      fail("Server readback has invalid revision/timestamp or changed retained sync metadata.", difference, "source/serverReadback metadata", false, !revisionValid ? "revision_mismatch" : "metadata_mismatch");
    }
    if (acknowledged){
      if (!committed || committedMaterialDifference || !metadataValid(committed.syncMeta))
        fail("The acknowledged writer result does not match the intended material change and save contract.", committedMaterialDifference || {path:"syncMeta", expected:actual?.syncMeta, actual:committed?.syncMeta}, "intended/committedState", false, "writer_contract_mismatch");
      // The acknowledgement binds the actual writing client. Querying local
      // storage again can generate another ID when a previous setItem failed.
      for (const field of syncWriterFields){
        if (actual.syncMeta[field] !== committed.syncMeta[field]) fail("Server save metadata differs from the acknowledged transaction.", metadataDifference, "committedState/serverReadback metadata", false, !revisionValid ? "revision_mismatch" : "metadata_mismatch");
      }
    } else if (actual.syncMeta.updatedBy !== writerClientId){
      fail("The uncertain material write could not be attributed to its captured writing client.", {path:"syncMeta.updatedBy", expected:writerClientId, actual:actual.syncMeta.updatedBy}, "captured writer/serverReadback", false, "write_unattributed");
    }
    return true;
  }
  function parseThickness(raw){
    const text = String(raw ?? "").replace(/"/g, "").trim();
    const fraction = text.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
    const value = fraction ? Number(fraction[1] || 0) + Number(fraction[2]) / Number(fraction[3]) : text ? Number(text) : NaN;
    if (!Number.isFinite(value) || value <= 0) throw Error("Thickness must be a positive number or fraction, such as 3/32.");
    return value;
  }
  const required = row => Math.abs(parseThickness(row.thickness) - 0.0625) < 1e-6;
  const heading = value => "QTY " + (String(value || "").replace(/^qty\s*/i, "").trim() || "4x8");
  // Validate existing evidence, never normalize/migrate it to make a write fit.
  function validateModel(model){
    if (!model || Array.isArray(model) || !Array.isArray(model.types) || !model.sheets || Array.isArray(model.sheets))
      throw Error("Material Inventory needs an established sheet baseline. Reload/review its existing data before editing.");
    const ids = new Set();
    let columns;
    for (const type of model.types){
      if (typeof type?.id !== "string" || !type.id || ids.has(type.id) || typeof type.name !== "string") throw Error("Material type identity needs review.");
      ids.add(type.id);
      const sheet = model.sheets[type.id];
      if (!sheet || !Array.isArray(sheet.columns) || !sheet.columns.length || sheet.columns.length > 24 || !Array.isArray(sheet.rows) || !sheet.rows.length)
        throw Error("Existing material sheet shape or column limit needs review; no data was rewritten.");
      if (sheet.columns.some(value => typeof value !== "string" || heading(value) !== value)) throw Error("Existing quantity headings need review.");
      if (columns && key(columns) !== key(sheet.columns)) throw Error("Existing shared material columns differ; review before editing.");
      columns = sheet.columns;
      let prior = 0;
      for (const row of sheet.rows){
        const thickness = parseThickness(row?.thickness);
        if (typeof row.thickness !== "string" || thickness < prior || !Array.isArray(row.values) || row.values.length !== columns.length || row.values.some(value => typeof value !== "string"))
          throw Error("Existing material rows need review; no values were normalized or removed.");
        prior = thickness;
      }
      if (!sheet.rows.some(required)) throw Error("The required 1/16 row is missing; review before editing.");
    }
    if (Object.keys(model.sheets).some(id => !ids.has(id))) throw Error("Material sheet identity needs review.");
    if (model.activeType !== "__all" && !ids.has(model.activeType) && !(ids.size === 0 && model.activeType === "")) throw Error("Material selector identity needs review.");
    return model;
  }
  function prepare(model, action){
    validateModel(model);
    const next = clone(model), type = next.types.find(item => item.id === action.typeId), sheet = next.sheets[action.typeId];
    const rowIndex = action.rowIndex, colIndex = action.colIndex;
    const row = () => {
      if (!sheet || !Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= sheet.rows.length) throw Error("The selected material row changed. Reload and retry.");
      return sheet.rows[rowIndex];
    };
    const column = () => {
      if (!sheet || !Number.isInteger(colIndex) || colIndex < 0 || colIndex >= sheet.columns.length) throw Error("The selected material column changed. Reload and retry.");
    };
    const sheets = () => next.types.map(item => next.sheets[item.id]);
    switch (action.kind){
      case "cell": column(); row().values[colIndex] = String(action.value ?? "").trim(); break;
      case "material-name":
        if (!type || !String(action.value || "").trim()) throw Error("Enter a material name.");
        type.name = String(action.value).trim(); break;
      case "thickness": {
        const target = row(), value = parseThickness(action.value);
        // An unchanged exact editor value must retain the original stored string.
        if (parseThickness(target.thickness) !== value) target.thickness = String(value);
        if (!sheet.rows.some(required)) sheet.rows.push({thickness:"0.0625", values:sheet.columns.map(() => "")});
        sheet.rows.sort((a,b) => parseThickness(a.thickness) - parseThickness(b.thickness));
        break;
      }
      case "column": column(); sheets().forEach(item => { item.columns[colIndex] = heading(action.value); }); break;
      case "select":
        if (action.value !== "__all" && !next.types.some(item => item.id === action.value)) throw Error("Select an existing material.");
        next.activeType = action.value; break;
      case "add-type": {
        const name = String(action.value || "").trim();
        if (!name) throw Error("Enter a material name.");
        const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "material";
        let id = stem, suffix = 1;
        while (next.types.some(item => item.id === id)) id = stem + "_" + suffix++;
        const columns = next.types.length ? next.sheets[next.types[0].id].columns.slice() : ["QTY 4x8", "QTY 4x10"];
        next.types.push({id, name});
        next.sheets[id] = {columns, rows:Array.from({length:32}, (_,i) => ({thickness:String((i+1)/16), values:columns.map(() => "")}))};
        next.activeType = id; break;
      }
      case "add-row": case "insert-row": {
        if (!sheet) throw Error("Select an existing material sheet.");
        const index = action.kind === "add-row" ? sheet.rows.length - 1 : (row(), rowIndex);
        const current = parseThickness(sheet.rows[index].thickness), following = sheet.rows[index+1];
        const value = following && parseThickness(following.thickness) > current ? (current + parseThickness(following.thickness))/2 : current + 1/16;
        sheet.rows.splice(index+1, 0, {thickness:String(value), values:sheet.columns.map(() => "")});
        sheet.rows.sort((a,b) => parseThickness(a.thickness) - parseThickness(b.thickness)); break;
      }
      case "delete-row":
        if (required(row())) throw Error("The 1/16 row is required and cannot be deleted.");
        sheet.rows.splice(rowIndex, 1); break;
      case "add-column": case "insert-column": {
        if (!sheet) throw Error("Select an existing material sheet.");
        if (sheet.columns.length >= 24) throw Error("Material Inventory supports a maximum of 24 shared columns.");
        const index = action.kind === "add-column" ? sheet.columns.length : (column(), colIndex + 1);
        sheets().forEach(item => { item.columns.splice(index, 0, "QTY 4x8"); item.rows.forEach(itemRow => itemRow.values.splice(index, 0, "")); }); break;
      }
      case "delete-column":
        column();
        if (sheet.columns.length <= 1) throw Error("At least one shared quantity column is required.");
        sheets().forEach(item => { item.columns.splice(colIndex, 1); item.rows.forEach(itemRow => itemRow.values.splice(colIndex, 1)); }); break;
      default: throw Error("Unsupported Material Inventory action.");
    }
    return validateModel(next);
  }
  function createApi(env){
    let busy = false;
    const undo = [];
    const reject = error => ({saved:false, verified:false, definiteFailure:true, indeterminate:false, stateWriteAttempted:false, stateWriteCompleted:false, error});
    const readAuthoritative = async () => {
      try { return await env.readAuthoritativeState(); }
      catch (error){ throw readContractError("Authoritative SERVER readback failed: " + String(error?.message || error), "server_read_failed", null); }
    };
    return Object.freeze({isBusy:() => busy, undoCount:() => undo.length, async run(request){
      if (busy) return reject("A material change is still being verified. Wait before editing again.");
      if (!env.canWrite()) return reject("Material Inventory is read-only or cloud writes are blocked.");
      let action, baselineMaterials;
      try {
        action = clone(request);
        // This is a pre-write grid guard, never a post-write expectation. Keep
        // compatibility with an older renderer, but remove both from intent.
        baselineMaterials = action.baselineMaterials ?? action.expectedMaterials;
        delete action.baselineMaterials; delete action.expectedMaterials;
      } catch (_error){ return reject("Invalid material action."); }
      busy = true;
      let evidence, writeResult, attempted = false;
      try {
        await env.settle();
        if (!env.canWrite()) throw Error("Cloud writes became unavailable.");
        env.lock(true);
        const localVersion = key(env.localVersion()), localBefore = key(business(env.localState()));
        const baseline = await readAuthoritative(), source = authoritativeState(baseline), revision = baseline.revision;
        const unchanged = () => key(env.localVersion()) === localVersion && key(business(env.localState())) === localBefore;
        if (!Number.isSafeInteger(revision) || revision < 0 || revision !== env.loadedRevision() || !env.baselineMatches(source) || !unchanged())
          throw Error("The authoritative baseline changed. Reload and review before editing materials.");
        if (baselineMaterials !== undefined && key(baselineMaterials) !== key(source.inventoryMaterials)) throw Error("The material grid changed while this edit was open. Reload and retry.");
        let material;
        if (action.kind === "undo"){
          const prior = undo.at(-1);
          if (!prior || key(source.inventoryMaterials) !== key(prior.after)) throw Error("There is no matching confirmed material change to undo.");
          material = validateModel(clone(prior.before));
        } else material = prepare(source.inventoryMaterials, action);
        const next = clone(source); next.inventoryMaterials = material;
        if (!env.validate(next)) throw Error("The proposed material change failed identity/content validation.");
        if (key(material) === key(source.inventoryMaterials)) return {saved:true, verified:true, noOp:true, stateWriteAttempted:false, stateWriteCompleted:false};
        const proofSource = clone(source), proofIntended = clone(next);
        evidence = {action:Object.fromEntries(["kind", "typeId", "rowIndex", "colIndex", "value"].filter(name => Object.hasOwn(action, name)).map(name => [name, compactValue(action[name])])),
          baselineRevision:revision, expectedRevision:revision, intendedMaterials:clone(material),
          serverReadback:{revision:null, stateAvailable:false, materialsAvailable:false}, verification:unverified("awaiting_server_readback")};
        const validateSource = remote => unchanged() && key(remote) === key(source);
        const validatePrepared = pending => unchanged() && key(pending) === key(next);
        if (!env.canWrite() || !unchanged()) throw Error("Local state changed before the material save.");
        const writerClientId = env.clientId();
        attempted = true;
        try { writeResult = await env.writeState(next, revision, validateSource, validatePrepared); }
        catch (error){ writeResult = {saved:false, indeterminate:true, stateWriteAttempted:true, stateWriteCompleted:false, error:String(error?.message || error)}; }
        evidence.writeResult = Object.fromEntries(["saved", "stateWriteAttempted", "stateWriteCompleted", "indeterminate", "definiteFailure", "errorCode", "error"].filter(name => Object.hasOwn(writeResult || {}, name)).map(name => [name, compactValue(writeResult[name])]));
        evidence.writeResult.committedRevision = writeResult?.committedState?.syncMeta?.rev ?? null;
        const acknowledged = writeResult?.saved === true && writeResult.stateWriteCompleted === true;
        const uncertain = !writeResult || writeResult.indeterminate === true || (!acknowledged && writeResult.stateWriteAttempted === true && writeResult.definiteFailure !== true);
        if (!acknowledged && !uncertain){
          evidence.verification = unverified("write_rejected");
          return {...reject(writeResult.error || "Material Inventory save was rejected."), ...writeResult, saved:false, verified:false, evidence};
        }
        // Also read after a lost acknowledgement. Never retry an uncertain write.
        const readback = await readAuthoritative();
        evidence.serverReadback = {revision:compactValue(readback?.revision ?? null), stateAvailable:!!readback?.state,
          materialsAvailable:!!readback?.state?.inventoryMaterials};
        const actual = authoritativeState(readback), actualRevision = readback.revision;
        verifyReadback(proofSource, proofIntended, actual, writeResult, writerClientId);
        evidence.verification = {reason:"confirmed", readbackAvailable:true, fullStateAvailable:true, materialsMatch:true, committedMaterialsMatch:acknowledged ? true : null,
          revisionValid:true, unrelatedBusinessStateMatch:true, metadataValid:true};
        if (!unchanged()) throw Error("The material change reached the server, but local edits changed during verification. Preserve them and reload/review.");
        if (await env.adoptVerifiedState(clone(actual), {uncertain, writeResult}) !== true) throw Error("Verified material state could not be safely adopted.");
        if (action.kind === "undo") undo.pop();
        else { undo.push({before:clone(source.inventoryMaterials), after:clone(material)}); if (undo.length > 20) undo.shift(); }
        return {saved:true, verified:true, stateWriteAttempted:true, stateWriteCompleted:true, indeterminate:false, reconciledAfterUncertainWrite:uncertain, revision:actualRevision};
      } catch (error){
        if (evidence && error.verification) evidence.verification = error.verification;
        const result = {...reject(String(error?.message || error)), stateWriteAttempted:attempted,
          stateWriteCompleted:writeResult?.stateWriteCompleted === true, indeterminate:attempted,
          definiteFailure:!attempted, errorCode:String(error?.code || "material_mutation_failed"), evidence};
        if (attempted) env.suspend(result);
        return result;
      } finally { env.lock(false); busy = false; }
    }});
  }
  // Escape, Enter and blur share one settlement, including before an async save.
  function createInlineSettlement(commit, cancel){
    let settled = false;
    return {commit(){if (settled) return; settled = true; return commit();}, cancel(){if (settled) return; settled = true; return cancel();}};
  }
  return Object.freeze({key, business, semanticMaterialEqual, authoritativeState, parseThickness, validateModel, prepare, verifyReadback, createApi, createInlineSettlement});
});
