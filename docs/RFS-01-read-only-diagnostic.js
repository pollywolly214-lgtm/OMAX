// Paste this entire IIFE into F12 on the deployed, signed-in OMAX page.
// No save, repair, restore, migration, localStorage write or app-state mutation.
// Firestore transaction contains only get; never trust listener/cache success.
(async()=>{
  const report={prompt:"RFS-01",atISO:new Date().toISOString(),url:location.href,
    build:{schema:typeof APP_SCHEMA==="undefined"?null:APP_SCHEMA,
      scripts:[...document.scripts].map(script=>script.src).filter(Boolean),
      meta:[...document.querySelectorAll('meta[name*="version"],meta[name*="build"],meta[name*="commit"]')].map(meta=>({name:meta.name,content:meta.content})),
      exactDeployedCommit:"Not established by source feature evidence alone"}};
  const copy=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const bounded=value=>{if(value==null)return null;const json=JSON.stringify(value);return json.length<=14000?copy(value):{truncated:true,jsonPrefix:json.slice(0,14000)};};
  const flags=["__recoveryInspectMode","__autosaveDisabled","__recoveryReason","__cloudLoadAttemptComplete","__initialAdoptComplete","__localBackupOnlyMode","__loadedCloudRevisionForSaveGuard","__globalIdentityIssues","__inventoryIdentityIssues","__lastCloudSaveBlock","__lastDangerousSaveBlock","__lastIndeterminateSave","__globalIdentityVerificationPending","__lastImportVerificationError","__lastInventoryIdentityRepairError","__inventoryMaterialMutationPending","__pumpBaselineMutationPending","__pumpLogMutationPending","__waterQualityMutationPending"];
  report.gates=Object.fromEntries(flags.map(name=>[name,bounded(window[name])]));
  report.gates.hasPendingLocalChanges=typeof hasPendingLocalChanges==="undefined"?null:hasPendingLocalChanges;
  report.gates.lastAppliedCloudRevision=typeof lastAppliedCloudRevision==="undefined"?null:lastAppliedCloudRevision;
  report.gates.archiveBusy=window.maintenanceTaskDeletionApi?.isBusy?.()??null;
  report.gates.materialBusy=window.inventoryMaterialMutationApi?.isBusy?.()??null;
  report.features={archiveCoordinator:!!window.maintenanceTaskDeletionApi,
    archiveCalendarHandler:typeof archiveCalendarTask==="function",
    independentTaskReader:typeof readMaintenanceTaskAuthoritativeState==="function",
    listenerRejectsObsoleteBeforeIntegrity:typeof startWorkspaceStateListener==="function"
      ?/incomingRev <= lastAppliedCloudRevision[\s\S]*checkAuthoritativeIdentityIntegrity/.test(String(startWorkspaceStateListener)):null};
  try{
    if(typeof FB==="undefined"||!FB.ready||!FB.user||!FB.db?.runTransaction||!FB.docRef)throw Error("Signed-in Firestore backend unavailable; no authoritative conclusion.");
    const db=FB.db,ref=FB.docRef,uid=FB.user.uid,project=FB.app?.options?.projectId,path=ref.path;
    const current=()=>FB.db===db&&FB.docRef===ref&&FB.user?.uid===uid&&FB.app?.options?.projectId===project;
    report.backend={projectId:project,path,actorPresent:!!uid,disposable:window.OMAXDevSafe?.active===true};
    const authoritative=await db.runTransaction(async tx=>{
      if(!current())throw Error("Backend/actor changed during diagnostic.");
      const snap=await tx.get(ref);
      if(snap?.ref?.path&&snap.ref.path!==path||snap?.ref?.firestore&&snap.ref.firestore!==db)throw Error("Different backend/document returned.");
      if(snap?.metadata?.fromCache||snap?.metadata?.hasPendingWrites)throw Error("Unconfirmed cached/pending snapshot returned.");
      return snap?.exists?copy(snap.data()):null;
    });
    if(!current())throw Error("Backend/actor changed before diagnostic completed.");
    const loaded=copy(window.__lastLoadedCloudState),rev=authoritative?.syncMeta?.rev;
    report.authoritative={confirmed:window.OMAXDevSafe?.active!==true,source:"read-only backend transaction",exists:authoritative!==null,revision:rev??null,
      loadedRevision:loaded?.syncMeta?.rev??null,guardRevision:window.__loadedCloudRevisionForSaveGuard??null,
      agreesWithLoadedRevision:rev===loaded?.syncMeta?.rev,agreesWithGuardRevision:rev===window.__loadedCloudRevisionForSaveGuard};
    const check=window.OMAXGlobalIdentityRepair?.integrity(copy(authoritative));
    report.identity={valid:check?.valid??null,blockers:check?.blockers??["Identity validator unavailable on this deployment"]};
    const archives=(authoritative?.deletedItems||[]).filter(entry=>entry?.type==="task");
    report.archivedInventory=(authoritative?.inventory||[]).flatMap((item,index)=>{
      if(!item?.linkedTaskId)return[];const id=item.linkedTaskId;
      const active=[...(authoritative.tasksInterval||[]),...(authoritative.tasksAsReq||[])].filter(task=>task?.id===id);
      const archived=archives.filter(entry=>entry.payload?.id===id);
      return active.length===1&&!archived.length?[]:[{path:`inventory[${index}].linkedTaskId`,inventoryId:item.id,taskId:id,activeMatches:active.length,archiveMatches:archived.length,
        resolution:window.OMAXMaintenanceTaskArchive?.resolve(copy(authoritative),id)?.status??"module unavailable"}];
    });
    // These helpers only inspect copied data; never invoke canWriteCloud,
    // snapshotState, adoption or diagnostic UI helpers (they can change evidence).
    report.protectedLoaded=typeof detectDangerousProtectedFieldReduction==="function"?bounded(detectDangerousProtectedFieldReduction(copy(authoritative)||{},loaded||{})):"Validator unavailable";
    report.protectedShapes=typeof buildProtectedFieldIntegritySummary==="function"?bounded(buildProtectedFieldIntegritySummary(copy(authoritative)||{})):"Registry unavailable";
    report.note="Confirmed backend state is separate from loaded browser evidence. No write, retry or unblock was attempted. Review exact identity paths, protected changes and retained uncertain-save evidence before any operation.";
  }catch(error){report.authoritative={confirmed:false,error:String(error?.message||error)};}
  console.log("OMAX RFS-01 read-only diagnostic",report);return report;
})();
