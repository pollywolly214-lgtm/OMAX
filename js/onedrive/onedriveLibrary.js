(function(){
  const CACHE_KEY = "cutting_job_onedrive_shared_library_cache_v1";

  function extOf(name){
    const raw = String(name || "");
    const dot = raw.lastIndexOf(".");
    return dot >= 0 ? raw.slice(dot).toLowerCase() : "";
  }

  function encodeSharingUrlToToken(url){
    const raw = String(url || "").trim();
    if (!raw) return "";
    const b64 = btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    return `u!${b64}`;
  }

  function encodePathForShare(path){
    if (!path) return "";
    return String(path)
      .split("/")
      .filter(Boolean)
      .map(seg => encodeURIComponent(seg))
      .join("/");
  }

  function getShareHost(sharedUrl){
    try {
      return new URL(sharedUrl).origin;
    } catch (_err){
      return "";
    }
  }

  async function requestJson(url){
    const res = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
    if (!res.ok) throw new Error(`OneDrive request failed (${res.status})`);
    return res.json();
  }

  async function requestJsonWithFallback(urls){
    let lastError = null;
    for (const url of urls){
      if (!url) continue;
      try {
        return await requestJson(url);
      } catch (err){
        lastError = err;
      }
    }
    throw lastError || new Error("OneDrive request failed.");
  }

  async function crawlSharedFolder(sharedUrl){
    const token = encodeSharingUrlToToken(sharedUrl);
    if (!token) throw new Error("Enter a valid OneDrive shared folder link.");
    const shareHost = getShareHost(sharedUrl);

    const root = await requestJsonWithFallback([
      `https://api.onedrive.com/v1.0/shares/${encodeURIComponent(token)}/driveItem`,
      `https://graph.microsoft.com/v1.0/shares/${encodeURIComponent(token)}/driveItem`,
      shareHost ? `${shareHost}/_api/v2.1/shares/${encodeURIComponent(token)}/driveItem` : ""
    ]);

    const rootDriveId = root?.parentReference?.driveId || root?.remoteItem?.parentReference?.driveId || "";
    if (!root?.id || !rootDriveId) throw new Error("Unable to read shared folder.");

    const folders = {};
    const files = {};
    const flat = [];

    async function listChildren(shareToken, relativePath){
      const encodedPath = encodePathForShare(relativePath);
      return requestJsonWithFallback([
        encodedPath
          ? `https://api.onedrive.com/v1.0/shares/${encodeURIComponent(shareToken)}/driveItem:/${encodedPath}:/children`
          : `https://api.onedrive.com/v1.0/shares/${encodeURIComponent(shareToken)}/driveItem/children`,
        encodedPath
          ? `https://graph.microsoft.com/v1.0/shares/${encodeURIComponent(shareToken)}/driveItem:/${encodedPath}:/children`
          : `https://graph.microsoft.com/v1.0/shares/${encodeURIComponent(shareToken)}/driveItem/children`,
        shareHost
          ? (encodedPath
              ? `${shareHost}/_api/v2.1/shares/${encodeURIComponent(shareToken)}/driveItem:/${encodedPath}:/children`
              : `${shareHost}/_api/v2.1/shares/${encodeURIComponent(shareToken)}/driveItem/children`)
          : ""
      ]);
    }

    async function walkFolder(folderId, path, parentId, relativePath){
      if (!folders[folderId]){
        folders[folderId] = {
          id: folderId,
          name: path === "/" ? (root.name || "Shared Folder") : path.split("/").pop(),
          parentId: parentId || null,
          path,
          childFolderIds: [],
          childFileIds: []
        };
      }
      const payload = await listChildren(token, relativePath);
      const items = Array.isArray(payload?.value) ? payload.value : [];
      for (const item of items){
        const name = String(item?.name || "");
        if (!item?.id || !name) continue;

        if (item.folder){
          const childPath = path === "/" ? `/${name}` : `${path}/${name}`;
          const childRelativePath = relativePath ? `${relativePath}/${name}` : name;
          folders[folderId].childFolderIds.push(item.id);
          folders[item.id] = { id: item.id, name, parentId: folderId, path: childPath, childFolderIds: [], childFileIds: [] };
          await walkFolder(item.id, childPath, folderId, childRelativePath);
          continue;
        }

        if (!item.file) continue;
        const ext = extOf(name);
        if (![".dxf", ".ord", ".omx"].includes(ext)) continue;

        const rec = {
          id: item.id,
          itemId: item.id,
          driveId: String(item?.parentReference?.driveId || rootDriveId || ""),
          name,
          ext,
          parentId: folderId,
          parentPath: path,
          webUrl: String(item.webUrl || ""),
          eTag: String(item.eTag || ""),
          lastModifiedDateTime: String(item.lastModifiedDateTime || ""),
          size: Number(item.size || 0)
        };
        files[item.id] = rec;
        folders[folderId].childFileIds.push(item.id);
        flat.push(rec);
      }
    }

    const rootPath = `/${root.name || "Shared Folder"}`;
    await walkFolder(root.id, rootPath, null, "");
    return {
      rootFolderId: root.id,
      rootName: root.name || "Shared Folder",
      driveId: rootDriveId,
      flat,
      tree: { folders, files, rootFolderId: root.id },
      lastSyncAt: new Date().toISOString(),
      sharedUrl: sharedUrl || ""
    };
  }

  function readCache(){
    if (!window.localStorage) return null;
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_err){ return null; }
  }

  function writeCache(data){
    if (!window.localStorage) return;
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(data || {}));
  }

  window.oneDriveLibrary = { extOf, encodeSharingUrlToToken, crawlSharedFolder, readCache, writeCache };
})();
