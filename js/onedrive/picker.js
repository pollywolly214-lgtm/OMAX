(function(){
  function extOk(name){ return /\.dxf$/i.test(String(name||"")); }

  async function openViaGraphFolderPicker(){
    const cfg = typeof window.getOneDriveJobConfig === "function" ? window.getOneDriveJobConfig() : {};
    const folderPath = String(cfg.folderPath || "").trim();
    if (!folderPath) throw new Error("Set OneDrive folder path first.");
    const items = await window.oneDriveGraph.listFolderChildren(folderPath);
    const files = items.filter(item => item && item.file);
    if (!files.length) throw new Error("No files found in OneDrive folder.");
    const dxfFirst = files.filter(f => extOk(f.name));
    const pool = dxfFirst.length ? dxfFirst : files;
    const promptList = pool.slice(0, 50).map((f, idx)=> `${idx+1}. ${f.name}`).join("\n");
    const picked = window.prompt(`Select file number:\n${promptList}`, "1");
    if (picked == null) return null;
    const index = Math.max(1, Number(picked)||1) - 1;
    const chosen = pool[index];
    if (!chosen) throw new Error("Invalid selection.");
    const driveId = chosen.parentReference?.driveId || chosen.parentReference?.driveId || "";
    return {
      driveId,
      itemId: chosen.id,
      fileName: chosen.name,
      eTag: chosen.eTag || "",
      lastModifiedDateTime: chosen.lastModifiedDateTime || "",
      webUrl: chosen.webUrl || ""
    };
  }

  async function openOneDriveDxfPicker(){
    await window.oneDriveAuth.signIn(["User.Read", "Files.Read"]);
    // Picker v8 SDK may not be available in all envs; fallback keeps workflow functional.
    if (window.OneDrive && typeof window.OneDrive.open === "function"){
      // Optional SDK path could be implemented here; fallback still used for durable Graph IDs.
    }
    const picked = await openViaGraphFolderPicker();
    if (!picked) return null;
    if (!/\.dxf$/i.test(String(picked.fileName||""))){
      throw new Error("Selected file is not a DXF.");
    }
    return picked;
  }

  window.oneDrivePicker = { openOneDriveDxfPicker };
})();
