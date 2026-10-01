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
  return Object.freeze({ getPurchaseFinancials, isHistoricalPurchase });
});
