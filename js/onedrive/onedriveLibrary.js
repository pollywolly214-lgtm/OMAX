(function(){
  function extOf(name){
    const raw = String(name || "");
    const dot = raw.lastIndexOf(".");
    return dot >= 0 ? raw.slice(dot).toLowerCase() : "";
  }

  async function listChildren(driveId, itemId){
    return window.oneDriveGraph.graphFetch(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/children?$top=200&$select=id,name,webUrl,parentReference,file,folder,size,lastModifiedDateTime,eTag`);
  }

  async function getContent(driveId, itemId){
    return window.oneDriveGraph.getDriveItemContentArrayBuffer(driveId, itemId);
  }

  async function getDownloadUrl(driveId, itemId){
    const meta = await window.oneDriveGraph.getDriveItemMetadata(driveId, itemId);
    return String(meta?.["@microsoft.graph.downloadUrl"] || "");
  }

  async function getMyDriveRoot(){
    return window.oneDriveGraph.graphFetch('/me/drive/root?$select=id,name,webUrl,parentReference');
  }

  async function getItem(driveId, itemId){
    return window.oneDriveGraph.graphFetch(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id,name,webUrl,parentReference,file,folder,size,lastModifiedDateTime,eTag`);
  }

  function mapFileRef(item){
    return {
      driveId: item?.parentReference?.driveId || "",
      itemId: item?.id || "",
      name: item?.name || "",
      webUrl: item?.webUrl || "",
      parentPath: item?.parentReference?.path || "",
      eTag: item?.eTag || "",
      lastModifiedDateTime: item?.lastModifiedDateTime || "",
      ext: extOf(item?.name || "")
    };
  }

  window.oneDriveLibrary = { listChildren, getContent, getDownloadUrl, getMyDriveRoot, getItem, mapFileRef, extOf };
})();
