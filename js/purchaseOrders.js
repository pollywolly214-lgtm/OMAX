(function(root, factory){
  const api = factory(typeof module === "object" && module.exports ? require("./historicalImport") : root.OMAXHistoricalImport);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OMAXPurchaseOrders = api;
})(typeof window === "undefined" ? null : window, function(history){
  "use strict";
  const clone = value=> JSON.parse(JSON.stringify(value));
  const key = value=> history.canonical(value);
  const businessKey = value=> key(history.normalizeBusinessForComparison(value));
  const withoutRevision = state=> Object.fromEntries(Object.entries(state).filter(([name])=> name !== "syncMeta"));
  const validId = value=> typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
  function cents(value, label = "Amount"){
    const raw = String(value ?? "").trim();
    if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(raw)) throw Error(`${label} must be a nonnegative amount with at most two decimal places.`);
    const [whole, fraction = ""] = raw.split(".");
    const amount = BigInt(whole || "0") * 100n + BigInt(fraction.padEnd(2, "0"));
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw Error(`${label} is too large.`);
    return Number(amount);
  }
  function dollars(amount){
    const result = amount / 100;
    if (!Number.isSafeInteger(amount) || amount < 0 || cents(result) !== amount) throw Error("Amount exceeds supported currency precision.");
    return result;
  }
  function newId(crypto){
    if (typeof crypto?.randomUUID !== "function") throw Error("Secure order IDs are unavailable. Use a secure, supported browser.");
    return crypto.randomUUID();
  }
  const newItem = crypto=> ({lineId:`pol_${newId(crypto)}`, purchased:"", partNumber:"", cost:"0", qty:"1", inventoryItemId:""});
  function newDraft(date, crypto){
    return {orderId:`po_${newId(crypto)}`, date, poNumber:"", shipping:"0", tax:"0", items:[newItem(crypto)]};
  }
  function plan(draft){
    if (!validId(draft?.orderId)) throw Error("A stable order ID is required.");
    const date = String(draft.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + "T00:00:00Z")) || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) throw Error("Choose a valid order date.");
    if (!Array.isArray(draft.items) || !draft.items.length) throw Error("Add at least one purchase item.");
    const shippingCents = cents(draft.shipping, "Order shipping"), taxCents = cents(draft.tax, "Order tax"), ids = new Set();
    const poNumber = String(draft.poNumber ?? "").trim();
    let merchandise = 0n;
    const items = draft.items.map(item=>{
      if (!validId(item.lineId) || ids.has(item.lineId)) throw Error("Every item needs a unique stable line ID.");
      ids.add(item.lineId);
      const purchased = String(item.purchased || "").trim();
      if (!purchased) throw Error("Each item needs a description.");
      const rawQty = String(item.qty ?? "").trim(), qty = Number(rawQty);
      if (!rawQty || !Number.isSafeInteger(qty) || qty < 1) throw Error("Each quantity must be a positive whole number.");
      const costCents = cents(item.cost, "Unit cost");
      const weight = BigInt(costCents) * BigInt(qty);
      merchandise += weight;
      return {item, purchased, qty, costCents, weight};
    });
    if (merchandise === 0n && (shippingCents > 0 || taxCents > 0)) throw Error("Shipping and tax cannot be allocated because the order merchandise total is $0.");
    if (merchandise + BigInt(taxCents) + BigInt(shippingCents) > BigInt(Number.MAX_SAFE_INTEGER)) throw Error("Order total is too large.");
    const allocate = charge=>{
      const allocations = items.map(({item, weight})=>{
        const numerator = weight * BigInt(charge);
        return {lineId:item.lineId, amount:merchandise ? numerator / merchandise : 0n, remainder:merchandise ? numerator % merchandise : 0n};
      });
      let remaining = BigInt(charge) - allocations.reduce((sum, item)=> sum + item.amount, 0n);
      const ranked = allocations.slice().sort((a,b)=> a.remainder === b.remainder ? (a.lineId < b.lineId ? -1 : a.lineId > b.lineId ? 1 : 0) : a.remainder > b.remainder ? -1 : 1);
      for (let index = 0; remaining > 0n; index++, remaining--) ranked[index].amount++;
      return allocations.map(item=> Number(item.amount));
    };
    const shipping = allocate(shippingCents), tax = allocate(taxCents);
    const rows = items.map(({item, purchased, qty, costCents}, index)=> ({
      date, purchased, partNumber:String(item.partNumber || "").trim(), cost:dollars(costCents), qty,
      shipping:dollars(shipping[index]), tax:dollars(tax[index]),
      ...(poNumber ? {poNumber} : {}),
      ...(item.inventoryItemId ? {inventoryItemId:String(item.inventoryItemId)} : {}),
      ...(item.taskId ? {taskId:String(item.taskId)} : {}),
      lineId:item.lineId, orderId:draft.orderId, orderDateISO:date, orderShippingCents:shippingCents, orderTaxCents:taxCents, shippingAllocationVersion:1, taxAllocationVersion:1
    }));
    if (rows.reduce((sum, row)=> sum + cents(row.shipping), 0) !== shippingCents) throw Error("Shipping did not reconcile to cents.");
    if (rows.reduce((sum, row)=> sum + cents(row.tax), 0) !== taxCents) throw Error("Tax did not reconcile to cents.");
    const merchandiseCents = Number(merchandise), totalCents = Number(merchandise + BigInt(taxCents) + BigInt(shippingCents));
    dollars(merchandiseCents); dollars(totalCents);
    return {orderId:draft.orderId, date, shippingCents, taxCents, merchandiseCents, totalCents, rows, week:history.weekFor(date)};
  }
  function append(source, order){
    if (!Array.isArray(source.receiptTrackerWeeks) || source.receiptTrackerWeeks.some(week=> !week || !Array.isArray(week.rows))) throw Error("Purchase History requires review before adding an order.");
    const all = source.receiptTrackerWeeks.flatMap(week=> week.rows), existing = all.filter(row=> row?.orderId === order.orderId);
    const sorted = rows=> rows.slice().sort((a,b)=> a.lineId < b.lineId ? -1 : a.lineId > b.lineId ? 1 : 0);
    if (existing.length){
      const containers = source.receiptTrackerWeeks.filter(week=> week.rows.some(row=> row?.orderId === order.orderId));
      if (containers.length !== 1 || containers[0].key !== order.week.key || key(sorted(existing)) !== key(sorted(order.rows)) || order.rows.some(row=> all.filter(item=> item?.lineId === row.lineId).length !== 1)) throw Error("This order ID already exists with different or incomplete items. Review before saving.");
      return {state:clone(source), alreadySaved:true};
    }
    if (all.some(row=> order.rows.some(item=> item.lineId === row?.lineId))) throw Error("A line ID already exists. Review before saving.");
    const state = clone(source), matches = state.receiptTrackerWeeks.filter(week=> week.key === order.week.key);
    if (matches.length > 1) throw Error("The order week is ambiguous. Review Purchase History before saving.");
    let week = matches[0];
    if (!week){ week = clone(order.week); state.receiptTrackerWeeks.push(week); }
    week.rows.push(...clone(order.rows));
    return {state, alreadySaved:false};
  }
  function createApi(env){
    let busy = false, uncertain = false;
    return Object.freeze({isBusy:()=> busy, isUncertain:()=> uncertain, async save(draft){
      if (busy || uncertain) return {saved:false, blocked:true, indeterminate:uncertain, error:uncertain ? "This save needs server verification. Do not retry the order." : "An order is already saving."};
      busy = true;
      let reserved = false, attempted = false, committed = false, token;
      const result = {saved:false, verificationCompleted:false, indeterminate:false};
      const suspend = error=>{
        uncertain = true;
        result.indeterminate = true; result.error = String(error?.message || error);
        try { env.suspend(result); } catch (_) { /* Keep the coordinator locked even if diagnostic UI fails. */ }
        return result;
      };
      try {
        const order = plan(clone(draft));
        result.orderId = order.orderId; result.lineIds = order.rows.map(row=> row.lineId);
        if (!env.canWrite()) throw Error("Purchase orders are unavailable while writes are blocked. Your draft remains available.");
        await env.settle();
        token = env.capture();
        const source = await env.read(token);
        if (!Number.isSafeInteger(source?.syncMeta?.rev) || source.syncMeta.rev < 0 || !env.matches(source, token)) throw Error("The authoritative state or local edits changed. Save/reload and review before saving this order.");
        env.validate(source, order);
        const next = append(source, order);
        if (next.alreadySaved) return {...result, saved:true, verificationCompleted:true, alreadySaved:true, weekKey:order.week.key};
        env.reserve(token); reserved = true;
        env.backup(source);
        const preparedKey = key(withoutRevision(next.state));
        attempted = true;
        const written = await env.write(next.state, source, token);
        committed = written?.saved === true && written.stateWriteCompleted === true && !written.blocked && !written.indeterminate;
        if (!committed){
          if (!written || written.indeterminate || written.stateWriteCompleted || (written.stateWriteAttempted !== false && written.definiteFailure !== true)) return suspend(written?.error || "Order save completion is uncertain. Verify the server before retrying.");
          throw Object.assign(Error(written.error || "The order was not saved. Your draft remains available."), {definite:true});
        }
        const expected = written.committedState;
        if (!expected || !Number.isSafeInteger(expected.syncMeta?.rev) || expected.syncMeta.rev <= source.syncMeta.rev || key(withoutRevision(expected)) !== preparedKey) return suspend("The order acknowledgement did not preserve its exact prepared state.");
        const verified = await env.read(token);
        if (key(verified) !== key(expected) || !env.matches(source, token)) return suspend("Order save readback or local state changed. Review server evidence before retrying.");
        if (await env.adopt(verified, token) !== true) return suspend("The verified order could not be adopted safely. Review before retrying.");
        return {...result, saved:true, verificationCompleted:true, weekKey:order.week.key};
      } catch (error){
        if (committed || (attempted && error?.definite !== true)) return suspend(error);
        return {...result, error:String(error?.message || error)};
      } finally {
        if (reserved) env.release(token, uncertain);
        busy = false;
      }
    }});
  }
  return Object.freeze({cents, dollars, key, businessKey, newItem, newDraft, plan, append, createApi});
});
