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

  async function requestJson(url){
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error(`OneDrive request failed (${res.status})`);
    return res.json();
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
    const token = encodeSharingUrlToToken(sharedUrl);
    if (!token) throw new Error("Enter a valid OneDrive shared folder link.");

    const root = await requestJson(`https://api.onedrive.com/v1.0/shares/${encodeURIComponent(token)}/driveItem`);
    const rootDriveId = root?.parentReference?.driveId || root?.remoteItem?.parentReference?.driveId || "";
    if (!root?.id || !rootDriveId) throw new Error("Unable to read shared folder.");

    const folders = {};
    const files = {};
    const flat = [];

    async function listSharedChildren(shareToken, relativePath){
      const encodedPath = encodePathForShare(relativePath);
      const endpoint = encodedPath
        ? `https://api.onedrive.com/v1.0/shares/${encodeURIComponent(shareToken)}/driveItem:/${encodedPath}:/children`
        : `https://api.onedrive.com/v1.0/shares/${encodeURIComponent(shareToken)}/driveItem/children`;
      return requestJson(endpoint);
    }

    async function walkFolder(driveId, folderId, path, parentId, relativePath){
      if (!folders[folderId]){
        folders[folderId] = { id: folderId, name: path === "/" ? (root.name || "Shared Folder") : path.split("/").pop(), parentId: parentId || null, path, childFolderIds: [], childFileIds: [] };
      }
      const payload = await listSharedChildren(token, relativePath);
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
    const cache = { rootFolderId: root.id, rootName: root.name || "Shared Folder", driveId: rootDriveId, flat, tree: { folders, files, rootFolderId: root.id }, lastSyncAt: new Date().toISOString(), sharedUrl: sharedUrl || "" };
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

  window.oneDriveLibrary = { extOf, encodeSharingUrlToToken, crawlSharedFolder, readCache, writeCache };
})();
