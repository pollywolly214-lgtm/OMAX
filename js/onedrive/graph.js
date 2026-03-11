(function(){
  async function graphFetch(path, { method = "GET", token, headers = {}, responseType = "json" } = {}){
    const authToken = token || await window.oneDriveAuth.getAccessToken(["User.Read", "Files.Read"]);
    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      method,
      headers: { Authorization: `Bearer ${authToken}`, ...headers }
    });
    if (!res.ok) throw new Error(`Graph request failed (${res.status})`);
    if (responseType === "arrayBuffer") return res.arrayBuffer();
    if (responseType === "text") return res.text();
    return res.json();
  }

  async function getDriveItemMetadata(driveId, itemId){
    return graphFetch(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id,name,eTag,lastModifiedDateTime,webUrl,parentReference,file,@microsoft.graph.downloadUrl`);
  }

  async function getDriveItemContentArrayBuffer(driveId, itemId){
    return graphFetch(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`, { responseType: "arrayBuffer" });
  }

  async function listFolderChildren(path){
    const clean = String(path || "").trim().replace(/^\/+|\/+$/g, "");
    if (!clean) throw new Error("Missing OneDrive folder path");
    const enc = clean.split("/").map(encodeURIComponent).join("/");
    const payload = await graphFetch(`/me/drive/root:/${enc}:/children?$top=200&$select=id,name,eTag,lastModifiedDateTime,webUrl,parentReference,file`);
    return Array.isArray(payload?.value) ? payload.value : [];
  }

  window.oneDriveGraph = { graphFetch, getDriveItemMetadata, getDriveItemContentArrayBuffer, listFolderChildren };
})();
