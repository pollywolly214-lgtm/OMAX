(function(){
  const CACHE_KEY = "cutting_job_onedrive_shared_library_cache_v1";

  function extOf(name){
    const raw = String(name || "");
    const dot = raw.lastIndexOf(".");
    return dot >= 0 ? raw.slice(dot).toLowerCase() : "";
  }

  function normalizeSharedUrl(url){
    const raw = String(url || "").trim();
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      parsed.hash = "";
      return parsed.toString();
    } catch (_){
      return raw;
    }
  }

  function shareUrlCandidates(url){
    const normalized = normalizeSharedUrl(url);
    if (!normalized) return [];
    const set = new Set([normalized]);
    try {
      const parsed = new URL(normalized);
      if (parsed.search){
        parsed.search = "";
        set.add(parsed.toString());
      }
      const asWeb = new URL(normalized);
      if (!asWeb.searchParams.has("web")){
        asWeb.searchParams.set("web", "1");
        set.add(asWeb.toString());
      }
    } catch (_){ }
    return Array.from(set);
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

  function encodePathForShare(path){
    if (!path) return "";
    return String(path)
      .split("/")
      .filter(Boolean)
      .map(seg => encodeURIComponent(seg))
      .join("/");
  }

  async function fetchSharedRoot(candidates){
    let lastError = null;
    for (const url of candidates){
      const token = encodeSharingUrlToToken(url);
      if (!token) continue;
      try {
        const root = await requestJson(`https://api.onedrive.com/v1.0/shares/${encodeURIComponent(token)}/driveItem`);
        const rootDriveId = root?.parentReference?.driveId || root?.remoteItem?.parentReference?.driveId || "";
        if (root?.id && rootDriveId){
          return { root, token, sharedUrl: url, rootDriveId };
        }
      } catch (err){
        lastError = err;
      }
    }
    throw lastError || new Error("Unable to read shared folder.");
  }

  async function crawlSharedFolder(sharedUrl){
    const candidates = shareUrlCandidates(sharedUrl);
    if (!candidates.length) throw new Error("Enter a valid OneDrive shared folder link.");

    const resolved = await fetchSharedRoot(candidates);
    const { root, token, sharedUrl: resolvedSharedUrl, rootDriveId } = resolved;

    const folders = {};
    const files = {};
    const flat = [];

    async function listSharedChildren(shareToken, relativePath, folderId){
      const encodedPath = encodePathForShare(relativePath);
      const shareEndpoint = encodedPath
        ? `https://api.onedrive.com/v1.0/shares/${encodeURIComponent(shareToken)}/driveItem:/${encodedPath}:/children`
        : `https://api.onedrive.com/v1.0/shares/${encodeURIComponent(shareToken)}/driveItem/children`;
      try {
        return await requestJson(shareEndpoint);
      } catch (_){
        const driveEndpoint = `https://api.onedrive.com/v1.0/drives/${encodeURIComponent(rootDriveId)}/items/${encodeURIComponent(folderId)}/children`;
        return requestJson(driveEndpoint);
      }
    }

    async function walkFolder(driveId, folderId, path, parentId, relativePath){
      if (!folders[folderId]){
        folders[folderId] = { id: folderId, name: path === "/" ? (root.name || "Shared Folder") : path.split("/").pop(), parentId: parentId || null, path, childFolderIds: [], childFileIds: [] };
      }
      const payload = await listSharedChildren(token, relativePath, folderId);
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
    const cache = { rootFolderId: root.id, rootName: root.name || "Shared Folder", driveId: rootDriveId, flat, tree: { folders, files, rootFolderId: root.id }, lastSyncAt: new Date().toISOString(), sharedUrl: resolvedSharedUrl || "" };
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

  window.oneDriveLibrary = { extOf, normalizeSharedUrl, shareUrlCandidates, encodeSharingUrlToToken, crawlSharedFolder, readCache, writeCache };
})();
