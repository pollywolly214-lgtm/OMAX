"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");

const views=fs.readFileSync("js/views.js","utf8");
const renderers=fs.readFileSync("js/renderers.js","utf8");
const core=fs.readFileSync("js/core.js","utf8");
const service=fs.readFileSync("js/cfr05CloudCuttingFiles.js","utf8");

assert.match(views,/const download = `<button[^`]*data-cfr05-download=/,"verified DXF presentation has an explicit Download action");
assert.match(views,/dxfFiles\.find\(file=>file\.fileId === preferredId\) \|\| dxfFiles\[0\]/,"the selected DXF determines the presented download target");
assert.match(views,/data-cfr05-download="\$\{esc\(selected\.fileId\)\}"/,"the selected file ID is the download target");

const enlarge=renderers.slice(renderers.indexOf('const enlargePreview=e.target.closest("[data-cfr05-enlarge-preview]")'),renderers.indexOf("const fileMenuAdd =",renderers.indexOf('const enlargePreview=e.target.closest("[data-cfr05-enlarge-preview]")')));
assert.match(enlarge,/data-cfr05-download=/,"enlarged preview contains Download");
assert.match(enlarge,/downloadVerifiedCloudFile\(event\.currentTarget,identity\.jobId,identity\.fileId,dialog\)/,"modal download targets the original selected cloud file");
assert.doesNotMatch(enlarge,/href="\$\{escapeHtml\(cached\.previewData\)\}"|download=cached\.previewData/,"the generated SVG preview is never the download source");

const helper=renderers.slice(renderers.indexOf("const downloadVerifiedCloudFile ="),renderers.indexOf("const openVerifiedCloudFile ="));
assert.match(helper,/window\.openCfr05CloudFile\(jobId,fileId/,"Download reuses the verified CFR-05 pipeline");
assert.match(helper,/anchor\.download=metadata\.safeFileName/,"the validated safe filename is used");
assert.match(helper,/button\.disabled=true/);assert.match(helper,/button\.textContent="Downloading…"/,"the initiating button is disabled and relabeled");
assert.match(helper,/if\(button\.disabled\|\|button\.dataset\.cfr05DownloadActive==="true"\)return null/,"duplicate clicks are blocked");
assert.match(helper,/finally\{\s*button\.disabled=false;delete button\.dataset\.cfr05DownloadActive;button\.textContent=originalLabel\|\|"Download"/,"success or failure restores button state");
assert.match(helper,/safeCloudActionError/);assert.ok(renderers.includes('replace(/https?:\\/\\/\\S+/gi, "[redacted URL]")'),"errors cannot expose a Firebase token URL");

assert.match(service,/const buffer=await boundedDownload/);assert.match(service,/sha256Hex\(buffer,cryptoApi\)!==metadata\.sha256/);
assert.match(service,/new Blob\(\[buffer\]/);assert.match(service,/finally\{o\.URL\.revokeObjectURL\(url\)/,"the transient original-file URL is always revoked");
assert.doesNotMatch(helper,/previewData|localStorage|cuttingJobs|completedCuttingJobs|job\.files|saveCloud/,"Download neither uses the SVG nor mutates or persists authoritative state");
assert.doesNotMatch(core,/downloadUrl\s*=|localStorage[^\n]*(blob|buffer|objectUrl)/i,"the CFR-05 integration does not persist download URLs or bytes");

assert.match(views,/otherFiles\.map\([\s\S]*data-cfr05-presented-open/,"ORD/OMX Download/Open presentation remains intact");
assert.match(renderers,/file\.extension==="dxf"\?"Preview\/Open":"Download\/Open"/,"Cloud Files dialog ORD/OMX behavior remains intact");

console.log("ok - DD-01 explicit DXF downloads use the transient verified CFR-05 path");
