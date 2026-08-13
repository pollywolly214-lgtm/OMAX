(function(root, factory){
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.Cfr04WorkspaceMetadata = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  "use strict";

  const SCHEMA_VERSION = 1;
  const ROLES = Object.freeze(["owner", "admin", "operator", "viewer"]);
  const FILE_TYPES = Object.freeze({
    dxf:{ mime:["application/dxf", "application/x-dxf", "text/plain"], maxBytes:50 * 1024 * 1024 },
    ord:{ mime:["application/octet-stream", "text/plain"], maxBytes:50 * 1024 * 1024 },
    omx:{ mime:["application/octet-stream", "text/plain"], maxBytes:50 * 1024 * 1024 }
  });
  const UPLOAD_STATES = Object.freeze(["pending", "uploaded", "verified", "failed"]);
  const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
  const WORKSPACE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const CHECKSUM = /^sha256:[a-f0-9]{64}$/;
  const allowedKeys = (value, keys)=>Object.keys(value).every(key=>keys.includes(key));
  const plain = value=>value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
  const bounded = (value, max)=>typeof value === "string" && value.length > 0 && value.length <= max;
  const validISO = value=>typeof value === "string" && ISO.test(value) && !Number.isNaN(Date.parse(value));
  const result = reasons=>Object.freeze({ valid:reasons.length === 0, reasons:Object.freeze(reasons.slice().sort()) });

  function validateId(value, label, pattern = SEGMENT){
    const reasons=[];
    if (typeof value !== "string" || !pattern.test(value)) reasons.push(`${label}_invalid`);
    return result(reasons);
  }
  function validateWorkspaceId(value){ return validateId(value, "workspace_id", WORKSPACE); }
  function validateJobId(value){ return validateId(value, "job_id"); }
  function validateLogId(value){ return validateId(value, "log_id"); }
  function validateFileId(value){ return validateId(value, "file_id"); }

  function normalizeSafeFileName(value){
    if (typeof value !== "string") return "";
    let name=value.normalize("NFKC").replace(/[\u0000-\u001f\u007f/\\]/g, "_").replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_").replace(/^[._-]+/, "").slice(0, 120);
    return name.replace(/[. _-]+$/, "");
  }
  function validateSafeFileName(value){
    const normalized=normalizeSafeFileName(value); const reasons=[];
    if (!normalized || normalized !== value || value === "." || value === "..") reasons.push("safe_file_name_invalid");
    const extension=normalized.includes(".") ? normalized.split(".").pop().toLowerCase() : "";
    if (!Object.prototype.hasOwnProperty.call(FILE_TYPES, extension)) reasons.push("file_extension_not_allowed");
    return result(reasons);
  }
  function requireValid(validation){ if (!validation.valid) throw new TypeError(validation.reasons.join(",")); }
  function membershipPath(workspaceId, uid){ requireValid(validateWorkspaceId(workspaceId)); requireValid(validateId(uid,"uid")); return `workspaces/${workspaceId}/members/${uid}`; }
  function jobPath(workspaceId, jobId){ requireValid(validateWorkspaceId(workspaceId)); requireValid(validateJobId(jobId)); return `workspaces/${workspaceId}/cuttingJobs/${jobId}`; }
  function logPath(workspaceId, jobId, logId){ requireValid(validateLogId(logId)); return `${jobPath(workspaceId,jobId)}/logs/${logId}`; }
  function filePath(workspaceId, jobId, fileId){ requireValid(validateFileId(fileId)); return `${jobPath(workspaceId,jobId)}/files/${fileId}`; }
  function storagePath(workspaceId, jobId, fileId, safeFileName){ requireValid(validateSafeFileName(safeFileName)); return `workspaces/${workspaceId}/cutting-jobs/${validateAndReturn(jobId,validateJobId)}/files/${validateAndReturn(fileId,validateFileId)}/${safeFileName}`; }
  function validateAndReturn(value, validator){ requireValid(validator(value)); return value; }

  function validateWorkspaceMembershipRecord(record, expected = {}){
    const reasons=[]; const keys=["schemaVersion","uid","workspaceId","role","active","createdAtISO","updatedAtISO","email"];
    if (!plain(record)) return result(["membership_not_plain_object"]);
    if (!allowedKeys(record,keys)) reasons.push("membership_unknown_field");
    if (record.schemaVersion !== SCHEMA_VERSION) reasons.push("schema_version_invalid");
    if (!validateId(record.uid,"uid").valid) reasons.push("uid_invalid");
    if (!validateWorkspaceId(record.workspaceId).valid) reasons.push("workspace_id_invalid");
    if (expected.uid != null && record.uid !== expected.uid) reasons.push("uid_document_mismatch");
    if (expected.workspaceId != null && record.workspaceId !== expected.workspaceId) reasons.push("workspace_document_mismatch");
    if (!ROLES.includes(record.role)) reasons.push("role_not_allowed");
    if (typeof record.active !== "boolean") reasons.push("active_not_boolean"); else if (!record.active) reasons.push("membership_inactive");
    if (!validISO(record.createdAtISO)) reasons.push("created_at_invalid");
    if (!validISO(record.updatedAtISO)) reasons.push("updated_at_invalid");
    if (record.email != null && (!bounded(record.email,254) || !record.email.includes("@"))) reasons.push("email_metadata_invalid");
    return result(reasons);
  }

  function embeddedReason(value){
    if (value == null) return "";
    const tag=Object.prototype.toString.call(value);
    if (tag === "[object File]" || tag === "[object Blob]") return "embedded_file_or_blob";
    if (tag === "[object ArrayBuffer]" || (typeof ArrayBuffer === "function" && ArrayBuffer.isView(value))) return "embedded_binary_content";
    if (typeof value === "string"){
      const text=value.trim();
      if (/^(?:data|blob):/i.test(text)) return "embedded_url_content";
      if (text.length >= 256 && (/^\s*SECTION[\s\S]*ENTITIES/im.test(text) || /\[(?:0|HEADER|PART|VARIABLES)\]/i.test(text))) return "embedded_cad_content";
      if (/<(?:svg|html|canvas)\b/i.test(text)) return "embedded_preview_markup";
      if (text.length >= 512 && text.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(text.replace(/\s/g,""))) return "embedded_base64_content";
    }
    return "";
  }
  function commonMetadata(record, keys){
    const reasons=[];
    if (!plain(record)) return ["metadata_not_plain_object"];
    if (!allowedKeys(record,keys)) reasons.push("metadata_unknown_field");
    Object.keys(record).sort().forEach(key=>{ const reason=embeddedReason(record[key]); if(reason) reasons.push(`${key}:${reason}`); });
    return reasons;
  }
  function validateJobMetadata(record){
    const reasons=commonMetadata(record,["schemaVersion","jobId","workspaceId","name","status","createdByUid","createdAtISO","updatedAtISO"]);
    if (!plain(record)) return result(reasons);
    if(record.schemaVersion!==1)reasons.push("schema_version_invalid"); if(!validateJobId(record.jobId).valid)reasons.push("job_id_invalid");
    if(!validateWorkspaceId(record.workspaceId).valid)reasons.push("workspace_id_invalid"); if(!bounded(record.name,200))reasons.push("name_invalid");
    if(!["active","completed"].includes(record.status))reasons.push("status_invalid"); if(!validateId(record.createdByUid,"uid").valid)reasons.push("created_by_uid_invalid");
    if(!validISO(record.createdAtISO))reasons.push("created_at_invalid"); if(!validISO(record.updatedAtISO))reasons.push("updated_at_invalid"); return result(reasons);
  }
  function validateLogMetadata(record){
    const reasons=commonMetadata(record,["schemaVersion","logId","jobId","workspaceId","dateISO","completedHours","createdByUid","createdAtISO"]);
    if(!plain(record))return result(reasons); if(record.schemaVersion!==1)reasons.push("schema_version_invalid"); if(!validateLogId(record.logId).valid)reasons.push("log_id_invalid");
    if(!validateJobId(record.jobId).valid)reasons.push("job_id_invalid"); if(!validateWorkspaceId(record.workspaceId).valid)reasons.push("workspace_id_invalid");
    if(typeof record.dateISO!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(record.dateISO))reasons.push("date_invalid");
    if(typeof record.completedHours!=="number" || !Number.isFinite(record.completedHours) || record.completedHours<0 || record.completedHours>24)reasons.push("completed_hours_invalid");
    if(!validateId(record.createdByUid,"uid").valid)reasons.push("created_by_uid_invalid"); if(!validISO(record.createdAtISO))reasons.push("created_at_invalid"); return result(reasons);
  }
  function validateFileMetadata(record){
    const keys=["schemaVersion","fileId","jobId","workspaceId","originalName","safeFileName","extension","mimeType","sizeBytes","storagePath","checksum","uploadState","createdByUid","createdAtISO","updatedAtISO"];
    const reasons=commonMetadata(record,keys); if(!plain(record))return result(reasons);
    if(record.schemaVersion!==1)reasons.push("schema_version_invalid"); if(!validateFileId(record.fileId).valid)reasons.push("file_id_invalid"); if(!validateJobId(record.jobId).valid)reasons.push("job_id_invalid"); if(!validateWorkspaceId(record.workspaceId).valid)reasons.push("workspace_id_invalid");
    if(!bounded(record.originalName,255))reasons.push("original_name_invalid"); const safe=validateSafeFileName(record.safeFileName); reasons.push(...safe.reasons);
    const ext=typeof record.extension==="string"?record.extension.toLowerCase():""; const policy=FILE_TYPES[ext]; if(!policy)reasons.push("file_extension_not_allowed");
    if(record.safeFileName && record.safeFileName.split(".").pop().toLowerCase()!==ext)reasons.push("extension_mismatch");
    if(!policy || !policy.mime.includes(record.mimeType))reasons.push("mime_type_not_allowed"); if(!Number.isSafeInteger(record.sizeBytes)||record.sizeBytes<1||!policy||record.sizeBytes>policy.maxBytes)reasons.push("file_size_invalid");
    let expected=""; try{expected=storagePath(record.workspaceId,record.jobId,record.fileId,record.safeFileName);}catch(_error){} if(record.storagePath!==expected)reasons.push("storage_path_mismatch");
    if(typeof record.checksum!=="string"||!CHECKSUM.test(record.checksum))reasons.push("checksum_invalid"); if(!UPLOAD_STATES.includes(record.uploadState))reasons.push("upload_state_invalid");
    if(!validateId(record.createdByUid,"uid").valid)reasons.push("created_by_uid_invalid"); if(!validISO(record.createdAtISO))reasons.push("created_at_invalid"); if(!validISO(record.updatedAtISO))reasons.push("updated_at_invalid"); return result(reasons);
  }

  async function getWorkspaceAuthorizationDiagnostics(options = {}){
    const uid=typeof options.uid==="string"?options.uid:""; const workspaceId=typeof options.workspaceId==="string"?options.workspaceId:""; const blockers=[];
    let expectedMembershipPath=null; try{expectedMembershipPath=membershipPath(workspaceId,uid);}catch(_error){blockers.push("invalid_uid_or_workspace_id");}
    const output={signedIn:Boolean(uid),uid:uid||null,workspaceId,expectedMembershipPath,membershipDocumentExists:false,membershipStructurallyValid:false,role:null,active:false,productionFileAuthorizationReady:false,blockerReasons:blockers,firestoreWrites:0,storageOperations:0};
    if(!uid){blockers.push("not_signed_in"); return output;} if(!expectedMembershipPath)return output;
    if(!options.membershipDocRef || typeof options.membershipDocRef.get!=="function"){blockers.push("membership_read_unavailable"); return output;}
    try{const snapshot=await options.membershipDocRef.get(); output.membershipDocumentExists=Boolean(snapshot?.exists); if(!output.membershipDocumentExists){blockers.push("membership_document_missing");return output;}
      const data=snapshot.data(); const validation=validateWorkspaceMembershipRecord(data,{uid,workspaceId}); output.membershipStructurallyValid=validation.valid; output.role=typeof data?.role==="string"?data.role:null; output.active=data?.active===true;
      blockers.push(...validation.reasons); output.productionFileAuthorizationReady=validation.valid && data.active===true; return output;
    }catch(_error){blockers.push("membership_read_failed");return output;}
  }

  return Object.freeze({SCHEMA_VERSION,ROLES,FILE_TYPES,UPLOAD_STATES,productionUploadsEnabled:false,productionDownloadsEnabled:false,
    validateWorkspaceId,validateJobId,validateLogId,validateFileId,normalizeSafeFileName,validateSafeFileName,
    membershipPath,jobPath,logPath,filePath,storagePath,validateWorkspaceMembershipRecord,validateJobMetadata,validateLogMetadata,validateFileMetadata,getWorkspaceAuthorizationDiagnostics});
});
