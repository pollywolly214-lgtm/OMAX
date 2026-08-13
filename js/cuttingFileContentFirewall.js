(function(root, factory){
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CuttingFileContentFirewall = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  "use strict";

  const THRESHOLDS = Object.freeze({
    largeBase64Characters: 4096,
    oversizedMarkupCharacters: 16384,
    knownContentFieldCharacters: 512,
    rawCadCharacters: 256
  });
  const CONTENT_FIELDS = /^(?:dataurl|filedata|filecontent|rawcontent|rawdata|binarydata|bytes|bytearray|arraybuffer|payloadbase64|base64|imagecontent|previewcontent|generatedpreview|svgmarkup|htmlmarkup|canvasdata)$/i;
  const CONTENT_CONTEXT_FIELDS = /^(?:content|payload|body|source|text|markup)$/i;
  const FILE_CONTEXT = /(?:files?|attachments?|preview|cutting|dxf|ord|omx|image|canvas)/i;
  const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
  const SIMPLE_KEY_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

  function pathFor(parent, key, isIndex){
    if (isIndex) return `${parent}[${key}]`;
    const name = String(key);
    return SIMPLE_KEY_RE.test(name) ? `${parent}.${name}` : `${parent}[${JSON.stringify(name)}]`;
  }

  function rootCollection(path){
    const match = String(path).match(/^\$\.([^.[\]]+)/);
    return match ? match[1] : "$";
  }

  function approximateUtf8Bytes(value){
    if (typeof TextEncoder === "function") return new TextEncoder().encode(value).byteLength;
    return unescape(encodeURIComponent(value)).length;
  }

  function scanCuttingFileContent(value, options = {}){
    const rootPath = typeof options.rootPath === "string" && options.rootPath ? options.rootPath : "$";
    const findings = [];
    const seen = new WeakSet();
    const add = (path, reason, type, size, detail)=>{
      findings.push({
        path,
        reason,
        detectedType: type,
        approximateSize: Number.isFinite(size) ? size : null,
        sizeUnit: Number.isFinite(size) ? "bytes" : null,
        parentRootCollection: rootCollection(path),
        blocksAuthoritativeSave: true,
        ...(detail ? { detail } : {})
      });
    };
    const visit = (current, path, keyName, ancestors)=>{
      if (current == null) return;
      if (typeof current === "string"){
        const trimmed = current.trim();
        const bytes = approximateUtf8Bytes(current);
        if (/^data:/i.test(trimmed)) return add(path, "data_url", "DataURL", bytes);
        if (/^blob:/i.test(trimmed)) return add(path, "blob_url", "BlobURL", bytes);
        const compact = trimmed.replace(/\s+/g, "");
        if (compact.length >= THRESHOLDS.largeBase64Characters && compact.length % 4 === 0 && BASE64_RE.test(compact))
          return add(path, "suspicious_large_base64", "Base64String", bytes);
        const key = String(keyName || "");
        const context = ancestors.concat(key).join(".");
        if ((CONTENT_FIELDS.test(key) || (CONTENT_CONTEXT_FIELDS.test(key) && FILE_CONTEXT.test(context))) && current.length >= THRESHOLDS.knownContentFieldCharacters)
          return add(path, "known_embedded_content_field", "String", bytes);
        if (current.length >= THRESHOLDS.rawCadCharacters && (/(?:^|\n)\s*SECTION\s*(?:\n|$)/i.test(current) && /(?:^|\n)\s*ENTITIES\s*(?:\n|$)/i.test(current)))
          return add(path, "embedded_raw_dxf_content", "DXFText", bytes);
        if (current.length >= THRESHOLDS.rawCadCharacters && (/\[(?:0|HEADER|PART|VARIABLES)\]/i.test(current) && /(?:OMX|ORD|Quality|Traverse|Pierce)/i.test(current)))
          return add(path, "embedded_raw_ord_omx_content", "CADText", bytes);
        if (current.length >= THRESHOLDS.oversizedMarkupCharacters && /<(?:svg|html|canvas|img)\b/i.test(current))
          return add(path, "oversized_preview_or_markup", "MarkupString", bytes);
        return;
      }
      if ((typeof File === "function" && current instanceof File) || Object.prototype.toString.call(current) === "[object File]")
        return add(path, "browser_file_object", "File", Number(current.size));
      if ((typeof Blob === "function" && current instanceof Blob) || Object.prototype.toString.call(current) === "[object Blob]")
        return add(path, "browser_blob_object", "Blob", Number(current.size));
      if (typeof ArrayBuffer === "function" && current instanceof ArrayBuffer)
        return add(path, "array_buffer", "ArrayBuffer", current.byteLength);
      if (typeof SharedArrayBuffer === "function" && current instanceof SharedArrayBuffer)
        return add(path, "shared_array_buffer", "SharedArrayBuffer", current.byteLength);
      if (typeof ArrayBuffer === "function" && ArrayBuffer.isView(current)){
        const type = Object.prototype.toString.call(current).slice(8, -1);
        return add(path, current instanceof DataView ? "data_view" : "typed_array", type, current.byteLength);
      }
      const tag = Object.prototype.toString.call(current);
      if (/\[object (?:ImageData|ImageBitmap|OffscreenCanvas|HTMLCanvasElement|FileSystemFileHandle)\]/.test(tag))
        return add(path, "binary_like_browser_object", tag.slice(8, -1), Number(current.width) * Number(current.height) * 4);
      if ((typeof current !== "object" && typeof current !== "function") || seen.has(current)) return;
      seen.add(current);
      if (Array.isArray(current)){
        current.forEach((item, index)=>visit(item, pathFor(path, index, true), String(index), ancestors.concat(String(keyName || ""))));
      } else {
        Object.keys(current).sort().forEach(key=>visit(current[key], pathFor(path, key, false), key, ancestors.concat(String(keyName || ""))));
      }
    };
    visit(value, rootPath, "", []);
    findings.sort((a,b)=>a.path.localeCompare(b.path) || a.reason.localeCompare(b.reason) || a.detectedType.localeCompare(b.detectedType));
    return {
      scannedRootPath: rootPath,
      contaminated: findings.length > 0,
      blockingFindingCount: findings.length,
      findings
    };
  }

  async function writeAuthoritativeState(docRef, state, setOptions){
    const firewall = scanCuttingFileContent(state);
    if (firewall.contaminated){
      return {
        saved: false,
        blocked: true,
        error: "Embedded cutting-file content was blocked from authoritative state.",
        errorCode: "embedded_cutting_file_content_blocked",
        stateWriteAttempted: false,
        stateWriteCompleted: false,
        findings: firewall.findings
      };
    }
    try {
      if (setOptions === null) await docRef.set(state);
      else await docRef.set(state, setOptions);
    } catch (err) {
      return {
        saved:false, blocked:false, stateWriteAttempted:true, stateWriteCompleted:false,
        indeterminate:true, findings:[], error:String(err?.message || err)
      };
    }
    return { saved:true, blocked:false, stateWriteAttempted:true, stateWriteCompleted:true, findings:[] };
  }

  return Object.freeze({ THRESHOLDS, scanCuttingFileContent, writeAuthoritativeState });
});
