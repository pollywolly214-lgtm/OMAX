// On the already-loaded live page, run this IIFE in F12 and save its returned
// JSON locally for the offline audit. Contains private financial/source records;
// do not post it to a public PR. No reads from Firebase, saves or state changes.
(() => {
  if (typeof completedCuttingJobs === "undefined" || !Array.isArray(completedCuttingJobs)) throw Error("Completed jobs are not loaded.");
  return JSON.stringify({diagnostic:"COSTDATA-01E",readOnly:true,
    revision:window.__lastLoadedCloudState?.syncMeta?.rev ?? null,
    recoveryMode:typeof isRecoveryMode === "function" ? isRecoveryMode() : null,
    selectedRange:window.__cuttingFinancialRange ?? null,
    totalCompletedJobs:completedCuttingJobs.length,
    sourceRecords:JSON.parse(JSON.stringify(completedCuttingJobs))},null,2);
})();
