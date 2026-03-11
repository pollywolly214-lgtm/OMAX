(function(){
  const CACHE_KEY = "cutting_job_onedrive_shared_library_cache_v1";

  function extOf(name){
    const raw = String(name || "");
    const dot = raw.lastIndexOf(".");
    return dot >= 0 ? raw.slice(dot).toLowerCase() : "";
  }

  function normalizeSharedUrl(url){
    let raw = String(url || "").trim();
    if (!raw) return "";
    raw = raw.replace(/[\s ]+$/g, "");
    raw = raw.replace(/[),.;]+$/g, "");
    return raw;
  }

  function encodeSharingUrlToToken(url){
    const raw = normalizeSharedUrl(url);
    if (!raw) return "";
    const b64 = btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    return `u!${b64}`;
  }

  async function requestJson(url){
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error(`OneDrive request failed (${res.status})`);
    return res.json();
  }

  async function requestJsonWithFallback(urls){
    let lastErr = null;
    for (const url of urls){
      try {
        return await requestJson(url);
      } catch (err){
        lastErr = err;
      }
    }
    throw (lastErr || new Error("OneDrive request failed"));
  }

  function encodePathForShare(path){
    if (!path) return "";
    return String(path)
      .split("/")
      .filter(Boolean)
      .map(seg => encodeURIComponent(seg))
      .join("/");
  }

  async function crawlSharedFolder(sharedUrl){
    const normalizedUrl = normalizeSharedUrl(sharedUrl);
    const token = encodeSharingUrlToToken(normalizedUrl);
    if (!token) throw new Error("Enter a valid OneDrive shared folder link.");

    const root = await requestJsonWithFallback([
      `https://api.onedrive.com/v1.0/shares/${token}/driveItem`,
      `https://api.onedrive.com/v1.0/shares/${encodeURIComponent(token)}/driveItem`,
      `https://graph.microsoft.com/v1.0/shares/${token}/driveItem`,
      `https://graph.microsoft.com/v1.0/shares/${encodeURIComponent(token)}/driveItem`
    ]);
    const rootDriveId = root?.parentReference?.driveId || root?.remoteItem?.parentReference?.driveId || "";
    if (!root?.id || !rootDriveId) throw new Error("Unable to read shared folder.");

    const folders = {};
    const files = {};
    const flat = [];

    async function listSharedChildren(shareToken, driveId, folderId, relativePath){
      const encodedPath = encodePathForShare(relativePath);
      const endpoints = [];
      if (encodedPath){
        endpoints.push(`https://api.onedrive.com/v1.0/shares/${shareToken}/driveItem:/${encodedPath}:/children`);
        endpoints.push(`https://api.onedrive.com/v1.0/shares/${encodeURIComponent(shareToken)}/driveItem:/${encodedPath}:/children`);
        endpoints.push(`https://graph.microsoft.com/v1.0/shares/${shareToken}/driveItem:/${encodedPath}:/children`);
        endpoints.push(`https://graph.microsoft.com/v1.0/shares/${encodeURIComponent(shareToken)}/driveItem:/${encodedPath}:/children`);
      }
      endpoints.push(`https://api.onedrive.com/v1.0/shares/${shareToken}/driveItem/children`);
      endpoints.push(`https://api.onedrive.com/v1.0/shares/${encodeURIComponent(shareToken)}/driveItem/children`);
      endpoints.push(`https://graph.microsoft.com/v1.0/shares/${shareToken}/driveItem/children`);
      endpoints.push(`https://graph.microsoft.com/v1.0/shares/${encodeURIComponent(shareToken)}/driveItem/children`);
      if (driveId && folderId){
        endpoints.push(`https://api.onedrive.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderId)}/children`);
        endpoints.push(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderId)}/children`);
      }
      return requestJsonWithFallback(endpoints);
    }

    async function walkFolder(driveId, folderId, path, parentId, relativePath){
      if (!folders[folderId]){
        folders[folderId] = { id: folderId, name: path === "/" ? (root.name || "Shared Folder") : path.split("/").pop(), parentId: parentId || null, path, childFolderIds: [], childFileIds: [] };
      }
      const payload = await listSharedChildren(token, driveId, folderId, relativePath);
      const items = Array.isArray(payload?.value) ? payload.value : [];
      for (const item of items){
        const name = String(item?.name || "");
        if (!item?.id || !name) continue;
        if (item.folder){
          const childPath = path === "/" ? `/${name}` : `${path}/${name}`;
          const childRelativePath = relativePath ? `${relativePath}/${name}` : name;
          folders[folderId].childFolderIds.push(item.id);
          folders[item.id] = { id: item.id, name, parentId: folderId, path: childPath, childFolderIds: [], childFileIds: [] };
          await walkFolder(driveId, item.id, childPath, folderId, childRelativePath);
          continue;
        }
        if (!item.file) continue;
        const ext = extOf(name);
        if (![".dxf", ".ord", ".omx"].includes(ext)) continue;
        const rec = {
          id: item.id,
          itemId: item.id,
          driveId: String(item?.parentReference?.driveId || driveId || ""),
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
    await walkFolder(rootDriveId, root.id, rootPath, null, "");
    const cache = { rootFolderId: root.id, rootName: root.name || "Shared Folder", driveId: rootDriveId, flat, tree: { folders, files, rootFolderId: root.id }, lastSyncAt: new Date().toISOString(), sharedUrl: normalizedUrl || "" };
    return cache;
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

  window.oneDriveLibrary = { extOf, normalizeSharedUrl, encodeSharingUrlToToken, crawlSharedFolder, readCache, writeCache };
})();
