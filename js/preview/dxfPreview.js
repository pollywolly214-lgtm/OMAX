(function(){
  function arrayBufferToText(buffer){
    const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    const cleaned = utf8.replaceAll("\u0000", "");
    if (cleaned.trim()) return cleaned;
    return new TextDecoder("iso-8859-1", { fatal: false }).decode(buffer).replaceAll("\u0000", "");
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

  function parseOmaxRows(content) {
    const rows = [];
    String(content || '').split(/\r?\n/).forEach(raw => {
      const line = raw.trim();
      if (!line || line.startsWith('//') || !line.startsWith('[')) return;
      const endBracket = line.indexOf(']');
      if (endBracket <= 1) return;
      const recordId = Number.parseInt(line.slice(1, endBracket), 10);
      if (!Number.isFinite(recordId) || recordId < 0) return;
      let after = line.slice(endBracket + 1).trimStart();
      if (after.startsWith(',')) after = after.slice(1);
      const tokens = after.split(',').map(token => token.trim());
      if (tokens.length < 8) return;
      const x = Number.parseFloat(tokens[0]);
      const y = Number.parseFloat(tokens[1]);
      const bow = Number.parseFloat(tokens[5]);
      if (![x, y, bow].every(Number.isFinite)) return;
      rows.push({ x, y, bow });
    });
    return rows;
  }

  function bulgeArcPolyline(p0, p1, bulge, steps = 24) {
    if (Math.abs(bulge) < 1e-9) return [p0, p1];
    const chord = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (!Number.isFinite(chord) || chord < 1e-9) return [p0];
    const theta = 4 * Math.atan(bulge);
    const sinHalf = Math.sin(Math.abs(theta) / 2);
    if (Math.abs(sinHalf) < 1e-9) return [p0, p1];
    const r = chord / (2 * sinHalf);
    const mx = (p0.x + p1.x) / 2;
    const my = (p0.y + p1.y) / 2;
    const ux = (p1.x - p0.x) / chord;
    const uy = (p1.y - p0.y) / chord;
    const nx = -uy;
    const ny = ux;
    const h = r * Math.cos(Math.abs(theta) / 2);
    const cx = mx + ((bulge > 0 ? 1 : -1) * h * nx);
    const cy = my + ((bulge > 0 ? 1 : -1) * h * ny);
    const a0 = Math.atan2(p0.y - cy, p0.x - cx);
    const out = [];
    const n = Math.max(8, Math.min(96, steps));
    for (let i = 0; i <= n; i += 1) {
      const a = a0 + ((i / n) * theta);
      out.push({ x: cx + (r * Math.cos(a)), y: cy + (r * Math.sin(a)) });
    }
    return out;
  }

  function boundsFromPoints(points) {
    return points.reduce((acc, point) => {
      acc.minX = Math.min(acc.minX, point.x);
      acc.maxX = Math.max(acc.maxX, point.x);
      acc.minY = Math.min(acc.minY, point.y);
      acc.maxY = Math.max(acc.maxY, point.y);
      return acc;
    }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  }

  function normalizePreviewBounds(points, fallback) {
    const finite = fallback && [fallback.minX, fallback.maxX, fallback.minY, fallback.maxY].every(Number.isFinite)
      ? fallback
      : boundsFromPoints(points);
    if (![finite.minX, finite.maxX, finite.minY, finite.maxY].every(Number.isFinite)) {
      return { minX: -10, minY: -10, width: 20, height: 20 };
    }
    const width = Math.max(1, finite.maxX - finite.minX);
    const height = Math.max(1, finite.maxY - finite.minY);
    return { minX: finite.minX, minY: finite.minY, width, height };
  }

  function buildPathSvgDataUrl(path, bounds) {
    const pad = Math.max(bounds.width, bounds.height) * 0.08;
    const vbX = bounds.minX - pad;
    const vbY = bounds.minY - pad;
    const vbW = bounds.width + (pad * 2);
    const vbH = bounds.height + (pad * 2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${-(vbY + vbH)} ${vbW} ${vbH}"><rect x="${vbX}" y="${-(vbY + vbH)}" width="${vbW}" height="${vbH}" fill="#ffffff"/><path d="${path.join(' ')}" stroke="#32407a" stroke-width="${Math.max(vbW, vbH) / 450}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function renderOmaxToolpathToSvgDataUrl(content, ext) {
    if (String(ext || '').toLowerCase() !== '.ord') return '';
    const rows = parseOmaxRows(content);
    if (rows.length < 2) return '';
    const path = [];
    const pointsSeen = [];
    const pointsDrawn = [];
    let prev = null;
    rows.forEach(row => {
      const cur = { x: row.x, y: row.y };
      pointsSeen.push(cur);
      if (!prev) {
        path.push(`M ${cur.x} ${-cur.y}`);
        prev = cur;
        return;
      }
      const span = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      if (span < 1e-9) { prev = cur; return; }
      if (Math.abs(row.bow) < 1e-8) {
        path.push(`L ${cur.x} ${-cur.y}`);
        pointsDrawn.push(prev, cur);
      } else {
        const arcPoints = bulgeArcPolyline(prev, cur, row.bow, 24);
        for (let i = 1; i < arcPoints.length; i += 1) {
          const pt = arcPoints[i];
          path.push(`L ${pt.x} ${-pt.y}`);
          pointsDrawn.push(arcPoints[i - 1], pt);
        }
      }
      prev = cur;
    });
    if (path.length < 2) return '';
    const focusPoints = pointsDrawn.length >= 2 ? pointsDrawn : pointsSeen;
    return buildPathSvgDataUrl(path, normalizePreviewBounds(focusPoints, boundsFromPoints(focusPoints)));
  }

  function renderFilePreviewDataUrl(text, ext){
    const lowerExt = String(ext || '').toLowerCase();
    return renderCadToSvgDataUrl(text) || renderOmaxToolpathToSvgDataUrl(text, lowerExt);
  }

  window.dxfPreview = { arrayBufferToText, renderCadToSvgDataUrl, renderFilePreviewDataUrl };
})();
