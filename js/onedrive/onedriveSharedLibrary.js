(function(){
  const LIB_CACHE_KEY = "cutting_job_onedrive_shared_library_cache_v1";

  function encodeSharingUrlToToken(url){
    const raw = String(url || "").trim();
    if (!raw) return "";
    const b64 = btoa(unescape(encodeURIComponent(raw)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    return `u!${b64}`;
  }

  async function requestJson(url, token){
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) throw new Error(`OneDrive request failed (${res.status})`);
    return res.json();
  }

  async function graphOrShareGet(path, token){
    const graphUrl = `https://graph.microsoft.com/v1.0${path}`;
    try {
      return await requestJson(graphUrl, token || "");
    } catch (graphErr){
      if (token) throw graphErr;
      const shareApiPath = path.replace(/^\/shares\//, "/shares/");
      const oneDriveApiUrl = `https://api.onedrive.com/v1.0${shareApiPath}`;
      return requestJson(oneDriveApiUrl, "");
    }
  }

  function extOf(name){
    const n = String(name || "");
    const dot = n.lastIndexOf(".");
    return dot >= 0 ? n.slice(dot).toLowerCase() : "";
  }

  async function crawlSharedFolder(sharedUrl, options = {}){
    const shareToken = encodeSharingUrlToToken(sharedUrl);
    if (!shareToken) throw new Error("Enter a valid OneDrive shared folder link.");

    const accessToken = String(options?.accessToken || "");
    const rootItem = await graphOrShareGet(`/shares/${encodeURIComponent(shareToken)}/driveItem?$select=id,name,webUrl,parentReference,remoteItem,folder`, accessToken);
    const rootDriveId = rootItem?.parentReference?.driveId || rootItem?.remoteItem?.parentReference?.driveId || "";
    if (!rootItem?.id || !rootDriveId) throw new Error("Unable to read this shared folder. Confirm the link grants access.");

    const folders = {};
    const files = {};
    const flat = [];

    async function walkFolder(driveId, folderId, path, parentId){
      const folderPath = path || "/";
      if (!folders[folderId]){
        folders[folderId] = {
          id: folderId,
          name: folderPath === "/" ? (rootItem.name || "Shared Folder") : folderPath.split("/").pop(),
          parentId: parentId || null,
          path: folderPath,
          childFolderIds: [],
          childFileIds: []
        };
      }

      const payload = await graphOrShareGet(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderId)}/children?$top=200&$select=id,name,eTag,lastModifiedDateTime,webUrl,parentReference,file,folder,size`, accessToken);
      const items = Array.isArray(payload?.value) ? payload.value : [];
      for (const item of items){
        const itemName = String(item?.name || "");
        if (!item?.id || !itemName) continue;
        if (item.folder){
          const childPath = folderPath === "/" ? `/${itemName}` : `${folderPath}/${itemName}`;
          folders[folderId].childFolderIds.push(item.id);
          folders[item.id] = { id:item.id, name:itemName, parentId:folderId, path:childPath, childFolderIds:[], childFileIds:[] };
          await walkFolder(driveId, item.id, childPath, folderId);
          continue;
        }
        if (!item.file) continue;
        const ext = extOf(itemName);
        if (![".dxf", ".ord", ".omx"].includes(ext)) continue;
        const rec = {
          id: item.id,
          name: itemName,
          ext,
          size: Number(item.size || 0),
          lastModifiedDateTime: item.lastModifiedDateTime || "",
          webUrl: item.webUrl || "",
          driveId,
          itemId: item.id,
          parentPath: folderPath,
          parentId: folderId,
          eTag: item.eTag || ""
        };
        files[item.id] = rec;
        folders[folderId].childFileIds.push(item.id);
        flat.push(rec);
      }
    }

    await walkFolder(rootDriveId, rootItem.id, `/${rootItem.name || "Shared Folder"}`, null);

    return {
      shareToken,
      lastSyncAt: new Date().toISOString(),
      rootFolderId: rootItem.id,
      flat,
      tree: { folders, files, rootFolderId: rootItem.id }
    };
  }

  function writeSharedLibraryCache(data){
    if (!window.localStorage) return;
    window.localStorage.setItem(LIB_CACHE_KEY, JSON.stringify(data || {}));
  }

  function readSharedLibraryCache(){
    if (!window.localStorage) return null;
    try {
      const raw = window.localStorage.getItem(LIB_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_err){ return null; }
  }

  window.oneDriveSharedLibrary = {
    encodeSharingUrlToToken,
    crawlSharedFolder,
    writeSharedLibraryCache,
    readSharedLibraryCache
  };
})();
