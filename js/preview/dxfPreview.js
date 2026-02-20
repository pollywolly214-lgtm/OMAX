(function(){
  function arrayBufferToText(buffer){
    try { return new TextDecoder("utf-8").decode(buffer); }
    catch(_){ return new TextDecoder().decode(buffer); }
  }

  function parseCadSegments(text) {
    const lines = String(text || "").split(/\r?\n/);
    const pairs = [];
    for (let i = 0; i < lines.length; i += 2) {
      const code = Number.parseInt(String(lines[i] || "").trim(), 10);
      if (!Number.isFinite(code)) continue;
      pairs.push({ code, value: String(lines[i + 1] || "").trim() });
    }
    const entities = [];
    let section = "";
    let current = null;
    for (let i = 0; i < pairs.length; i += 1) {
      const pair = pairs[i];
      if (pair.code !== 0) {
        if (current) current.data.push(pair);
        continue;
      }
      const marker = pair.value.toUpperCase();
      if (marker === "SECTION") {
        const namePair = pairs[i + 1];
        if (namePair?.code === 2) { section = namePair.value.toUpperCase(); i += 1; }
        continue;
      }
      if (marker === "ENDSEC") { section = ""; current = null; continue; }
      if (section !== "ENTITIES") continue;
      if (current) entities.push(current);
      current = { type: marker, data: [] };
    }
    if (current) entities.push(current);
    const segments = [];
    entities.forEach(entity => {
      const fields = new Map();
      entity.data.forEach(item => fields.set(item.code, Number.parseFloat(item.value)));
      if (entity.type === "LINE") {
        const x1 = fields.get(10); const y1 = fields.get(20);
        const x2 = fields.get(11); const y2 = fields.get(21);
        if ([x1, y1, x2, y2].every(Number.isFinite)) segments.push({ x1, y1, x2, y2 });
      }
    });
    return segments;
  }

  function renderCadToSvgDataUrl(text) {
    const segments = parseCadSegments(text);
    if (!segments.length) return "";
    const bounds = segments.reduce((acc, item) => {
      acc.minX = Math.min(acc.minX, item.x1, item.x2);
      acc.maxX = Math.max(acc.maxX, item.x1, item.x2);
      acc.minY = Math.min(acc.minY, item.y1, item.y2);
      acc.maxY = Math.max(acc.maxY, item.y1, item.y2);
      return acc;
    }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const pad = Math.max(width, height) * 0.08;
    const vbX = bounds.minX - pad;
    const vbY = bounds.minY - pad;
    const vbW = width + (pad * 2);
    const vbH = height + (pad * 2);
    const paths = segments.map(item => `<line x1="${item.x1}" y1="${-item.y1}" x2="${item.x2}" y2="${-item.y2}"/>`).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${-(vbY + vbH)} ${vbW} ${vbH}"><rect x="${vbX}" y="${-(vbY + vbH)}" width="${vbW}" height="${vbH}" fill="#ffffff"/><g stroke="#32407a" stroke-width="${Math.max(vbW, vbH) / 450}" fill="none" stroke-linecap="round">${paths}</g></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  window.dxfPreview = { arrayBufferToText, renderCadToSvgDataUrl };
})();
