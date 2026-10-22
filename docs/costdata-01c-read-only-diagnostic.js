// Open Cost Analysis, select All-Time, then paste this whole IIFE into F12.
// Reads loaded records and rendered evidence only. No model recalculation,
// Firebase/network call, save, localStorage access, or application-state write.
(() => {
  const list = value => Array.isArray(value) ? value : [];
  const day = value => {
    const key = typeof value === "string" ? value.slice(0, 10) : "";
    return /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(Date.parse(key)) && new Date(key + "T00:00:00Z").toISOString().slice(0, 10) === key ? key : null;
  };
  const amount = value => ["number", "string"].includes(typeof value) && String(value).trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const canvas = document.querySelector("#costChart");
  const audits = list(canvas?.__maintenanceCostReconciliation);
  const targets = list(canvas?.__costChartTargets);
  const table = [...document.querySelectorAll("[data-maintenance-row]")];
  const period = document.querySelector("#costFinancialPeriod")?.value || "unavailable";
  const legacy = [...list(window.tasksInterval), ...list(window.tasksAsReq), ...list(window.deletedItems).filter(row => row?.type === "task").map(row => row.payload)].filter(Boolean);
  const sources = [];
  for (const task of legacy){
    for (const [field, rows] of [["completedDates", list(task.completedDates)], ["manualHistory", list(task.manualHistory)]]){
      rows.forEach((entry, index) => {
        const manual = field === "manualHistory", eventId = manual && (entry?.import_event_id || entry?.importEventId || entry?.id) || null;
        const dateISO = day(manual ? entry?.dateISO || entry?.date || entry?.doneDateISO : entry);
        const configured = legacy.find(row => String(row.id) === String(task.templateId));
        const recordedParts = amount(manual ? entry?.partsCostSnapshot ?? entry?.partsCost ?? entry?.calendarPrice : null);
        const recordedHours = amount(task.occurrenceHours?.[dateISO] ?? (manual ? entry?.loggedHours ?? entry?.timeHours ?? entry?.hours : null));
        sources.push({ sourceEventKey: JSON.stringify(["legacy", String(task.id), field, eventId ? ["id", String(eventId)] : ["index", index]]),
          sourceSystem: "legacy", taskId: String(task.templateId || task.id || ""), historySourceTaskId: String(task.id || ""), historyField: field, historyIndex: index,
          dateISO, taskName: task.name || "", completionStatus: manual ? entry?.status || "status-less legacy history" : "completed",
          parts: { value: recordedParts ?? amount(task.price ?? configured?.price), source: recordedParts !== null ? "Occurrence-specific" : "Configured default" },
          duration: { value: recordedHours ?? amount(task.downtimeHours ?? configured?.downtimeHours), source: recordedHours !== null ? "Occurrence-specific" : "Configured default" } });
      });
    }
  }
  const groups = new Map();
  for (const [index, event] of list(window.maintenanceOccurrencesV2).entries()){
    const root = event?.rootOccurrenceId || (event?.eventType === "scheduled" ? event.id : event?.supersedesEventId);
    if (!root){
      sources.push({ sourceEventKey: JSON.stringify(["v2-unlinked-record", index]), sourceSystem: "v2", taskId: String(event?.taskId || ""),
        recordId: event?.id || null, rootOccurrenceId: null, dateISO: day(event?.effectiveDateISO || event?.dateISO),
        completionStatus: event?.eventType || "unknown", sourceExclusionReason: "Missing scheduled-root/occurrence relationship; no completed compatibility row can be emitted" });
      continue;
    }
    const rows = groups.get(String(root)) || []; rows.push(event); groups.set(String(root), rows);
  }
  // This existing compatibility reducer is read-only; it does not save/normalize state.
  const compatibility = typeof buildMaintenanceCompatibilityStream === "function" ? buildMaintenanceCompatibilityStream() : [];
  for (const [root, events] of groups){
    const scheduled = events.find(row => row.eventType === "scheduled" && String(row.id) === root), first = scheduled || events[0];
    const stream = compatibility.find(row => row.sourceSystem === "v2" && String(row.rootOccurrenceId) === root);
    const dateISO = stream?.dateISO || day(first.effectiveDateISO || first.dateISO);
    const resolved = root.startsWith("repeat:") && typeof resolveV2RepeatOccurrenceStateByRoot === "function" ? resolveV2RepeatOccurrenceStateByRoot(root, dateISO)
      : scheduled && typeof resolveV2OneTimeOccurrenceState === "function" ? resolveV2OneTimeOccurrenceState(root, scheduled) : null;
    const task = list(window.maintenanceTasksV2).find(row => String(row.id) === String(first.taskId));
    sources.push({ sourceEventKey: "v2:" + root, sourceSystem: "v2", taskId: String(first.taskId || ""), rootOccurrenceId: root,
      instanceId: String(first.instanceId || ""), dateISO: stream?.dateISO || day(resolved?.displayDateISO) || dateISO, taskName: task?.name || first.taskName || "",
      completionStatus: resolved?.lifecycleStatus || resolved?.status || (stream?.isCompleted ? "completed" : "No completed compatibility row; inspect lifecycle/identity"),
      parts: { value: amount(stream?.partsCostSnapshot ?? stream?.costRef ?? task?.price), source: amount(stream?.partsCostSnapshot) !== null ? "Occurrence-specific" : "Configured default/unavailable" },
      duration: { value: amount(stream?.loggedHours ?? resolved?.hours ?? task?.downtimeHours), source: amount(stream?.loggedHours) !== null ? "Occurrence-specific" : "Configured default/unavailable" } });
  }
  const maintenance = sources.map(source => {
    const audit = audits.find(row => row.sourceEventKey === source.sourceEventKey);
    const matches = table.filter(row => row.dataset.sourceEventKey ? row.dataset.sourceEventKey === source.sourceEventKey
      : source.sourceSystem === "v2" ? row.dataset.v2RootOccurrenceId === source.rootOccurrenceId
      : row.dataset.taskId === source.taskId && row.dataset.maintenanceDateIso === source.dateISO);
    const row = { ...source, ...audit };
    const parts = row.parts?.value ?? null, duration = row.duration?.value ?? null;
    return { ...row, costClassification: audit?.costClassification || (parts === null || duration === null ? "incomplete inputs" : row.parts?.source === "Occurrence-specific" && row.duration?.source === "Occurrence-specific" ? "recorded inputs; modeled labor" : "estimated/default inputs"),
      centralTableIncluded: audit ? audit.centralTableIncluded : matches.length ? "Date/task match only; exact provenance unavailable" : false,
      renderedTableMatches: matches.length, chartIncluded: audit?.chartIncluded ?? null,
      actualChartPointOnDate: targets.some(target => target.key === "maintenance" && target.rowRef?.dateISO === row.dateISO),
      totalCost: audit?.totalCost ?? null,
      exclusionReason: audit?.exclusionReason || row.sourceExclusionReason || (audit?.chartIncluded ? ""
        : row.sourceSystem === "v2" && ["scheduled", "removed", "skipped"].includes(row.completionStatus) ? `Not a current completed expense: ${row.completionStatus}`
        : "This deployed build lacks an exact stage audit for this source; do not infer a missing amount from date-only matches.") };
  }).sort((a, b) => String(a.dateISO || "").localeCompare(String(b.dateISO || "")) || a.sourceEventKey.localeCompare(b.sourceEventKey));
  const plotted = type => targets.filter(target => target.rowRef?.type === type).map(target => target.rowRef.dateISO).filter(Boolean).sort();
  const jobDates = list(window.completedCuttingJobs).map(job => day(job?.completedAtISO)).filter(Boolean).sort();
  const report = { period, exactStageAuditAvailable: audits.length > 0, maintenance,
    jobs: { loadedRecords: list(window.completedCuttingJobs).length, earliestLoadedCompletion: jobDates[0] || null, earliestIncluded: plotted("cutting")[0] || null },
    purchases: { earliestPlotted: plotted("spend")[0] || null },
    notes: ["Chart costs aggregate by business date; a point is not one physical event.", "Labor remains modeled at $30/hour; recorded inputs do not establish verified cash spending.", "Select All-Time and enable all series before comparing full coverage.", "On older deployed builds, exact stage reasons require the corrected PR build; source and DOM evidence remain read-only."] };
  console.table(maintenance.map(row => ({ date: row.dateISO, task: row.taskId, sourceTask: row.historySourceTaskId || "", event: row.rootOccurrenceId || row.sourceEventKey,
    source: row.sourceSystem, status: row.completionStatus, parts: row.parts?.value, hours: row.duration?.value, classification: row.costClassification,
    table: row.centralTableIncluded, chart: row.chartIncluded, total: row.totalCost, reason: row.exclusionReason })));
  console.log("COSTDATA-01C read-only reconciliation", report);
  return report;
})();
