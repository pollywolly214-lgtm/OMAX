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
  const withoutSync = state => Object.fromEntries(Object.entries(state || {}).filter(([name]) => name !== "syncMeta"));
  const business = state => Object.fromEntries(Object.entries(state || {}).filter(([name]) => !["syncMeta", "saveMeta", "syncProcessLog"].includes(name)));
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
    return Object.freeze({isBusy:() => busy, undoCount:() => undo.length, async run(request){
      if (busy) return reject("A material change is still being verified. Wait before editing again.");
      if (!env.canWrite()) return reject("Material Inventory is read-only or cloud writes are blocked.");
      let action;
      try { action = clone(request); } catch (_error){ return reject("Invalid material action."); }
      busy = true;
      let evidence, writeResult, attempted = false;
      try {
        await env.settle();
        if (!env.canWrite()) throw Error("Cloud writes became unavailable.");
        env.lock(true);
        const localVersion = key(env.localVersion()), localBefore = key(business(env.localState()));
        const source = await env.readState(), revision = source?.syncMeta?.rev;
        const unchanged = () => key(env.localVersion()) === localVersion && key(business(env.localState())) === localBefore;
        if (!Number.isSafeInteger(revision) || revision < 0 || revision !== env.loadedRevision() || !env.baselineMatches(source) || !unchanged())
          throw Error("The authoritative baseline changed. Reload and review before editing materials.");
        if (action.expectedMaterials !== undefined && key(action.expectedMaterials) !== key(source.inventoryMaterials)) throw Error("The material grid changed while this edit was open. Reload and retry.");
        let material;
        if (action.kind === "undo"){
          const prior = undo.at(-1);
          if (!prior || key(source.inventoryMaterials) !== key(prior.after)) throw Error("There is no matching confirmed material change to undo.");
          material = validateModel(clone(prior.before));
        } else material = prepare(source.inventoryMaterials, action);
        const next = clone(source); next.inventoryMaterials = material;
        if (!env.validate(next)) throw Error("The proposed material change failed identity/content validation.");
        if (key(material) === key(source.inventoryMaterials)) return {saved:true, verified:true, noOp:true, stateWriteAttempted:false, stateWriteCompleted:false};
        evidence = {action, expectedRevision:revision, source:clone(source), intended:clone(next)};
        const validateSource = remote => unchanged() && key(remote) === key(source);
        const validatePrepared = pending => unchanged() && key(pending) === key(next);
        if (!env.canWrite() || !unchanged()) throw Error("Local state changed before the material save.");
        attempted = true;
        try { writeResult = await env.writeState(next, revision, validateSource, validatePrepared); }
        catch (error){ writeResult = {saved:false, indeterminate:true, stateWriteAttempted:true, stateWriteCompleted:false, error:String(error?.message || error)}; }
        evidence.writeResult = clone(writeResult || {});
        const acknowledged = writeResult?.saved === true && writeResult.stateWriteCompleted === true;
        const uncertain = !writeResult || writeResult.indeterminate === true || (!acknowledged && writeResult.stateWriteAttempted === true && writeResult.definiteFailure !== true);
        if (!acknowledged && !uncertain) return {...reject(writeResult.error || "Material Inventory save was rejected."), ...writeResult, saved:false, verified:false};
        // Also read after a lost acknowledgement. Never retry an uncertain write.
        const actual = await env.readState(), actualRevision = actual?.syncMeta?.rev;
        const expectedCommitted = writeResult?.committedState;
        const revisionValid = Number.isSafeInteger(actualRevision) && actualRevision > revision
          && actual.syncMeta.updatedBy === env.clientId()
          && (!acknowledged || actualRevision === expectedCommitted?.syncMeta?.rev);
        if (!revisionValid || key(withoutSync(actual)) !== key(withoutSync(evidence.intended))
          || (acknowledged && key(actual) !== key(expectedCommitted))) throw Error("Server readback did not prove the exact material change and preserved unrelated data.");
        if (!unchanged()) throw Error("The material change reached the server, but local edits changed during verification. Preserve them and reload/review.");
        if (await env.adoptVerifiedState(clone(actual), {uncertain, writeResult}) !== true) throw Error("Verified material state could not be safely adopted.");
        if (action.kind === "undo") undo.pop();
        else { undo.push({before:clone(source.inventoryMaterials), after:clone(material)}); if (undo.length > 20) undo.shift(); }
        return {saved:true, verified:true, stateWriteAttempted:true, stateWriteCompleted:true, indeterminate:false, reconciledAfterUncertainWrite:uncertain, revision:actualRevision};
      } catch (error){
        const result = {...reject(String(error?.message || error)), stateWriteAttempted:attempted,
          stateWriteCompleted:writeResult?.stateWriteCompleted === true, indeterminate:attempted,
          definiteFailure:!attempted, evidence};
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
  return Object.freeze({key, business, parseThickness, validateModel, prepare, createApi, createInlineSettlement});
});
