(function(root, factory){
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root, api);
})(typeof window === "undefined" ? null : window, function(){
  "use strict";
  // Match the Data Center's nonnegative numeric presentation; never write to a row.
  const amount = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  function getPurchaseFinancials(row){
    const unitCost = amount(row?.cost), qty = amount(row?.qty);
    const shipping = amount(row?.shipping), tax = amount(row?.tax);
    const merchandiseSubtotal = unitCost * qty;
    return { unitCost, qty, merchandiseSubtotal, shipping, tax, totalSpend: merchandiseSubtotal + shipping + tax };
  }
  function isHistoricalPurchase(row){
    const source = row?.importProvenance?.sourceRecord;
    if (!source || typeof source !== "object" || Array.isArray(source) || !row?.import_event_id) return false;
    const sourceIdentity = typeof source.import_event_id === "string" && source.import_event_id.trim()
      ? source.import_event_id
      : (typeof source.source_id === "string" && source.source_id.trim() && typeof source.source_record_id === "string" && source.source_record_id.trim() ? JSON.stringify([source.source_id, source.source_record_id]) : "");
    return sourceIdentity === row.import_event_id && typeof source.date === "string" && typeof source.purchased === "string" && Number.isFinite(source.cost) && Number.isFinite(source.qty);
  }
  // Read-only receipt projection. PHv2 orders already live as allocated receipt
  // lines; orderRequests are approvals, not an additional purchase ledger.
  function normalizePurchaseHistory(weeks){
    const out = [], seen = new Map();
    const valid = value => value != null && String(value).trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
    for (const week of Array.isArray(weeks) ? weeks : []){
      (Array.isArray(week?.rows) ? week.rows : []).forEach((row, rowIndex) => {
        if (!row || ![row.date,row.purchased,row.partNumber,row.cost,row.qty,row.shipping,row.tax].some(value=>value != null && value !== "")) return;
        const source = row.importProvenance?.sourceRecord || {};
        const identity = row.orderId && row.lineId ? JSON.stringify(["order",row.orderId,row.lineId])
          : row.import_event_id ? JSON.stringify(["import",row.import_event_id])
          : source.source_id && source.source_record_id ? JSON.stringify(["source",source.source_id,source.source_record_id])
          : row.id ? JSON.stringify(["row",row.id]) : null;
        const financials = getPurchaseFinancials(row);
        const incomplete = !valid(row.cost) || !valid(row.qty) || [row.shipping,row.tax].some(value=>value != null && value !== "" && !valid(value)) || !Number.isFinite(financials.totalSpend);
        const signature = JSON.stringify([row.date,row.purchased,row.partNumber,financials,row.poNumber,incomplete]);
        const previous = identity && seen.get(identity);
        if (previous?.signatures.has(signature)) return;
        const entry = {row,week,rowIndex,financials,costIncomplete:incomplete,identityConflict:Boolean(previous)};
        if (previous){ previous.entries.forEach(item=>{item.identityConflict=true;}); }
        if (identity) seen.set(identity,{signatures:new Set([...(previous?.signatures || []),signature]),entries:[...(previous?.entries || []),entry]});
        out.push(entry);
      });
    }
    return out;
  }
  return Object.freeze({ getPurchaseFinancials, isHistoricalPurchase, normalizePurchaseHistory });
});
