"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const atomic=require("../js/atomicPersistence"),firewall=require("../js/cuttingFileContentFirewall"),identities=require("../js/globalIdentityRepair");
const chronology=require("../js/cuttingJobChronology"),dates=require("../js/cuttingJobDateEditing"),maintenance=require("../js/maintenanceCalendarIntegrity");
const source=fs.readFileSync(process.env.OMAX_CORE_PATH||"js/core.js","utf8"),clone=structuredClone;
function fn(name){const a=source.search(new RegExp(`^(?:async )?function ${name}\\(`,"m"));assert.ok(a>=0,name);return source.slice(a,source.indexOf("\n}",a)+2);}
function constant(name){const a=source.indexOf(`const ${name} =`);assert.ok(a>=0,name);return source.slice(a,source.indexOf(";",a)+1);}
const bindings=["totalHistory","tasksInterval","tasksAsReq","inventory","cuttingJobs","completedCuttingJobs","orderRequests","garnetCleanings","dailyCutHours","opportunityRollups","weeklyCostReports","receiptTrackerWeeks","maintenanceTasksV2","maintenanceCalendarInstancesV2","maintenanceOccurrencesV2","deletedItems","appConfig","jobFolders","orderRequestTab"];
function fixture(){return{schema:72,syncMeta:{rev:1792439195035,updatedBy:"computer-a"},saveMeta:{lastSaveStatus:"saved"},
 totalHistory:[],tasksInterval:[],tasksAsReq:[],inventory:[{id:"stock",qtyNew:9,note:"retain"}],inventoryFolders:[],
 inventoryMaterials:{types:[{id:"steel",name:"Steel",custom:"preserve"}],sheets:{steel:{columns:["QTY 4x8"],rows:[{thickness:"1",values:["5"],custom:"retain row"}]}},custom:"retain model"},inventoryTransactions:[],inventorySection:"items",
 cuttingJobs:[],completedCuttingJobs:[{id:"cut",name:"Keep",startISO:"2026-10-01",completedAtISO:"2026-10-02",cutDateISO:"2026-10-02",cutOrderWithinDay:1,cutNumber:"C001",files:[{id:"file",fileId:"reference",source:"wj_cuts_reference",relativePath:"fixture.dxf"}],manualLogs:[],cat:"jobs_root"}],
 orderRequests:[],receiptTrackerWeeks:[],orderRequestTab:"active",garnetCleanings:[],dailyCutHours:[],opportunityRollups:[],weeklyCostReports:[],
 maintenanceTasksV2:[],maintenanceCalendarInstancesV2:[],maintenanceOccurrencesV2:[],deletedItems:[],
 appConfig:{dailyHours:8,custom:"retain config"},settingsFolders:[],folders:[],jobFolders:[{id:"jobs_root",name:"Jobs",parent:null,custom:"retain folder"}],
 dashboardLayout:{card:{x:4,y:8}},costLayout:{},jobLayout:{},pumpEff:{entries:[],notes:[]},oneDriveJobConfig:{},cuttingJobDatabase:{},futureEvidence:{retain:[1,2,3]}};}
function backend(){let state=fixture(),commits=0;return{get state(){return clone(state);},set state(v){state=clone(v);},get commits(){return commits;},db:{async runTransaction(callback){let next;const result=await callback({get:async()=>({exists:true,data:()=>clone(state)}),set:(_ref,v)=>{next=clone(v);}});if(next){state=next;commits++;}return result;}}};}
function client(b,id="computer-b",options={}){
 let listener,diagnostics=0,backup=null;const window={OMAXAtomicPersistence:atomic,CuttingFileContentFirewall:firewall,OMAXGlobalIdentityRepair:identities,CuttingJobDateEditing:dates,CuttingJobHistory:require("../js/cuttingJobHistory"),CuttingJobChronology:chronology,OMAXMaintenanceCalendarIntegrity:maintenance,location:{search:"",hostname:"localhost"}};
 for(const name of bindings)window[name]=[];
 const c=vm.createContext({window,TextEncoder,Blob,structuredClone,URLSearchParams,setTimeout,clearTimeout,console:{error(){},warn(){},info(){},table(){}},
 document:{getElementById:()=>null,querySelectorAll:()=>[]},APP_SCHEMA:72,WORKSPACE_ID:"fixture",FB:{ready:true,user:{uid:"same-authorized-uid"},db:b.db,app:{options:{projectId:"fixture"}},docRef:{path:"workspaces/fixture/app/state",get:async()=>{const data=b.state;if(options.readbackMismatch&&b.commits)data.inventory[0].qtyNew++;return{exists:true,data:()=>data,metadata:{fromCache:false,hasPendingWrites:false}};},onSnapshot:callback=>{listener=callback;return()=>{};}}},
 getCloudSyncClientId:()=>id,readLocalStateBackup:()=>backup,persistLocalStateBackup:value=>{backup=clone(value);},
 getSaveSchemaCoverageReport:()=>({cloudExcludedProtectedPaths:[]}),classifyMissingProtectedPathsForSave:()=>({blocking:[],warnings:[]}),
 renderRecoveryDiagnosticsPanel:()=>diagnostics++,showLocalBackupConflictWarning(){},syncRenderTotalsFromHistory(){},resetHistoryToCurrent(){},
 setCloudLoadGate:v=>{window.__cloudLoadAttemptComplete=v.loadComplete;window.__initialAdoptComplete=v.adoptComplete;},
 isVercelPreviewRuntime:()=>false,mergeTotalHistoryForSave:v=>v,mergeDailyCutHoursForSave:v=>v,mergePumpEffForSave:v=>v,
 readJobFileCache:()=>({}),syncJobFileCacheFromJobs(){},writeJobFileCache(){},cloneFolders:clone,cloneJobFolders:clone,
 // Deliberately invoke the real normalizers: the former tests replaced these
 // with identity functions and could not expose the adoption/snapshot mismatch.
 DEFAULT_APP_CONFIG:{excludeWeekends:true,dailyHours:8},normalizePredictionAverageWindow:()=>30,clampDailyCutHours:Number,
 normalizeSettingsFolders:rows=>clone(rows),normalizeJobFolders:rows=>rows.map(row=>({...row,order:row.order??0})),
 defaultJobFolders:()=>[],defaultSettingsFolders:()=>[],defaultInventoryMaterials:()=>({types:[],sheets:{}}),
 FIRESTORE_WARN_BYTES:800000,FIRESTORE_STRONG_WARN_BYTES:900000,FIRESTORE_BLOCK_BYTES:950000,
 consumeMaintenanceV2RepairAuthorization:()=>({authorized:false}),recordDataFlowEvent(){},rememberDangerousSaveBlock(){},writeBlockedSaveLog:async()=>{},
 logMaintenanceHistoryDiagnostics:()=>({}),collectMaintenanceHistoryMetrics:()=>({}),logCoreBusinessDiagnostics:()=>({}),collectCoreBusinessMetrics:()=>({}),
 setSettingsFolders(){},captureHistorySnapshot(){},genId:()=>"test-operation",undoStack:[],redoStack:[],currentSnapshotJSON:"",refreshDerivedDailyHours(){}});
 const constants=["PROTECTED_STATE_FIELDS","REQUIRED_PROTECTED_DATA_PATHS","PROTECTED_FIELD_REGISTRY","DATA_SAFETY_PREFLIGHT_COUNT_DROP_RATIO","DATA_SAFETY_PREFLIGHT_MIN_BASELINE_COUNT","DATA_SAFETY_PREFLIGHT_TOTAL_DROP_RATIO","DATA_SAFETY_PREFLIGHT_SIZE_DROP_RATIO","LARGE_CONTENT_KEY_PATTERN","SAFE_FILE_METADATA_KEY_PATTERN","EMBEDDED_CONTENT_KEY_PATTERN"];
 const functions=["cloneStructured","estimatePayloadBytes","countObjectKeys","countTaskNestedMapEntries","countTaskNestedArrayEntries","countJobManualLogs","getValueAtPath","getDataSafetyShape","countCollectionValue","countNestedProtectedValues","stableStringifyForIntegrity","hashIntegrityString","fingerprintProtectedValue","countProtectedField","validateProtectedFieldShape","getProtectedFieldRegistryCoverage","buildProtectedFieldIntegritySummary","buildDataIntegritySummary","hasAnyProtectedData","hasAnyProtectedFieldPresence","isDangerousShapeChange","chooseProtectedSaveBaseline","detectDangerousIntegrityReduction","validateProtectedSavePreflight","buildProtectedFieldSummary","compareProtectedFieldSummaries","detectDangerousProtectedFieldReduction","isRecoveryMode","canWriteCloud","blockCloudSave","refreshGlobalCollections","snapshotState","isDataUrl","isLikelyEmbeddedFileContent","isSafeMetadataString","isProtectedBusinessDataKey","sanitizeValueForStorage","compactStateForStorage","scanAuthoritativeCutFileContent","performCloudSave","saveCloudNow","adoptAuthoritativeRecoveryState","adoptState","cloudSaveNoWriteFailure","writeAuthoritativeStateSnapshot","reportCloudSaveSecondaryError","validateCuttingJobDeletionSave","validateCuttingJobHistoryRestoreSave","cuttingJobDeletionSafetyBaseline","stableStringify","getInventoryIdentityRepairLocalState","getCuttingJobChronologyLocalState","inspectInventoryIdentities","checkAuthoritativeIdentityIntegrity","adoptIdentityCheckedAuthoritativeState","loadFromCloud","readCurrentCloudStateReadOnly","captureCuttingJobSaveTarget","cuttingJobSaveTargetIsCurrent","readCuttingJobAuthoritativeSnapshot","refreshCuttingJobVerificationNotice","normalizeAppConfig","normalizeInventoryMaterials","snapshotSettingsFolders","snapshotJobFolders","stateHasMeaningfulData","startWorkspaceStateListener","detectRemoteRevisionConflict","buildCompletedJob","normalizeJobPriorityOrder","buildWindowProtectedStateForCoverage"];
 vm.runInContext(bindings.map(name=>`let ${name}=window.${name};`).join("\n")+"\nlet lastAppliedCloudRevision=0,lastLocalMutationAt=0,hasPendingLocalChanges=false,workspaceStateUnsubscribe=null;const inventoryIdentityRepairAuthorizations=new Map();\n"+constants.map(constant).join("\n")+"\n"+functions.map(fn).join("\n")+"\nconst saveCloudInternal={now:performCloudSave};",c);
 const a=source.indexOf("const cuttingJobChronologyMutationApi ="),z=source.indexOf("window.isCuttingJobChronologySaving=",a);vm.runInContext(source.slice(a,z)+";this.chronology=cuttingJobChronologyMutationApi;",c);
 const m=source.indexOf("window.runMaintenanceCalendarMutation ="),n=source.indexOf("window.inspectMaintenanceCalendarIntegrity",m);vm.runInContext(source.slice(m,n),c);
 return{c,window,get diagnostics(){return diagnostics;},load:()=>c.loadFromCloud(),snapshot:()=>c.compactStateForStorage(c.snapshotState({skipLocalFileCacheSync:true})),
 adopt:()=>c.adoptIdentityCheckedAuthoritativeState(b.state),async remote(){c.startWorkspaceStateListener();listener({exists:true,data:()=>b.state,metadata:{hasPendingWrites:false}});},
 cut:()=>c.chronology.save([],{expectedRevision:window.__loadedCloudRevisionForSaveGuard,businessOperation:{type:"edit",id:"cut",updates:{completedAtISO:"2026-10-03"}}}),
 layout:async()=>{window.cloudDashboardLayout.card.x++;return c.performCloudSave();}};
}
function business(value){const s=clone(value);delete s.syncMeta;delete s.saveMeta;delete s.syncProcessLog;return s;}

test("initial cloud adoption establishes an exact, side-effect-free business snapshot",async()=>{
 const b=backend(),h=client(b);const loaded=await h.load();assert.equal(loaded.recovery,false,JSON.stringify({loaded,reason:h.window.__recoveryReason,issues:h.window.__globalIdentityIssues}));const before=clone(h.window.jobFolders);
 assert.deepEqual(business(h.snapshot()),business(b.state));assert.deepEqual(clone(h.window.jobFolders),before);assert.deepEqual(business(h.snapshot()),business(b.state));
});
test("same UID and independent client IDs can each save a layout after adoption",async()=>{
 const b=backend();for(const id of ["computer-a","computer-b"]){const h=client(b,id);assert.equal((await h.load()).recovery,false);const before=b.state;const r=await h.layout();assert.equal(r.saved,true,r.error);assert.equal(b.state.syncMeta.updatedBy,id);const expected=business(before);expected.dashboardLayout.card.x++;assert.deepEqual(business(b.state),expected);}assert.equal(b.commits,2);
});
test("matching local/cloud cutting baseline saves and verifies without normalizing protected data",async()=>{
 const b=backend(),h=client(b);await h.load();const before=b.state,r=await h.cut();assert.equal(r.saved,true,r.error);assert.equal(r.verified,true);assert.equal(b.commits,1);
 for(const key of Object.keys(before).filter(key=>!["completedCuttingJobs","syncMeta"].includes(key)))assert.deepEqual(b.state[key],before[key],key);
});
test("maintenance action after exact adoption retains all unrelated business fields",async()=>{
 const b=backend(),h=client(b);await h.load();const before=b.state;const r=await h.window.runMaintenanceCalendarMutation(()=>h.window.maintenanceTasksV2.push({id:"task",name:"New task"}));assert.equal(r.saved,true,r.error);assert.equal(b.commits,1);
 const expected=business(before);expected.maintenanceTasksV2.push({id:"task",name:"New task"});assert.deepEqual(business(b.state),expected);
});
test("remote revision from a different client adopts exact records and permits another save",async()=>{
 const b=backend(),a=client(b,"computer-a"),h=client(b);await a.load();await h.load();assert.equal((await a.layout()).saved,true);await h.remote();assert.deepEqual(clone(h.window.__lastLoadedCloudState),b.state);assert.deepEqual(business(h.snapshot()),business(b.state));assert.equal((await h.cut()).verified,true);assert.equal(b.commits,2);
});
for(const drift of ["local","server"])test(`real ${drift} protected-data mismatch with unchanged revision rejects cutting and maintenance saves`,async()=>{
 const b=backend(),h=client(b);await h.load();if(drift==="local")h.window.inventory[0].qtyNew++;else{const s=b.state;s.inventory[0].qtyNew++;b.state=s;}
 const before=b.state,r=await h.cut();assert.equal(r.saved,false);assert.match(r.error,/baseline changed/);const m=await h.window.runMaintenanceCalendarMutation(()=>assert.fail("must not stage"));assert.equal(m.saved,false);assert.match(m.error,/baseline changed/);assert.equal(b.commits,0);assert.deepEqual(b.state,before);
});
test("stale expectedRevision is rejected by the real transaction without overwriting data",async()=>{
 const b=backend(),h=client(b);await h.load();const before=b.state,r=await h.c.writeAuthoritativeStateSnapshot(h.snapshot(),{merge:true},{expectedRevision:before.syncMeta.rev-1});assert.equal(r.saved,false);assert.equal(r.errorCode,"revision_conflict");assert.equal(b.commits,0);assert.deepEqual(b.state,before);
});
test("layout save never enters maintenance-specific validation",async()=>{
 const b=backend(),h=client(b);await h.load();h.window.runMaintenanceCalendarMutation=()=>assert.fail("layout must use general guarded writer");const r=await h.layout();assert.equal(r.saved,true,r.error);assert.equal(b.commits,1);
});
test("failed cutting verification reports failure and keeps Recovery Mode write blocking",async()=>{
 const b=backend(),h=client(b,"computer-b",{readbackMismatch:true});await h.load();const before=clone(h.window.completedCuttingJobs),r=await h.cut();assert.equal(r.saved,false);assert.equal(r.verified,false);assert.equal(r.indeterminate,true);assert.equal(h.window.__cuttingJobDisplayUnconfirmed,true);assert.equal(h.window.__recoveryInspectMode,true);assert.equal(h.window.__autosaveDisabled,true);assert.deepEqual(clone(h.window.completedCuttingJobs),before);assert.equal((await h.cut()).saved,false);assert.equal(b.commits,1);
});
test("genuine protected reduction and explicit recovery gates still reject general layout saves",async()=>{
 const b=backend(),h=client(b);await h.load();h.window.inventory=[];const before=b.state,r=await h.layout();assert.equal(r.saved,false);assert.equal(b.commits,0);assert.deepEqual(b.state,before);
 const locked=client(b);await locked.load();locked.window.__recoveryInspectMode=true;assert.equal((await locked.layout()).saved,false);assert.equal(b.commits,0);
});
