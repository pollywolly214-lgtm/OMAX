(function(){
  function extOf(name){
    const raw = String(name || "").trim();
    const dot = raw.lastIndexOf(".");
    return dot >= 0 ? raw.slice(dot).toLowerCase() : "";
  }

  function arrayBufferToText(buffer){
    const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    const cleanedUtf8 = utf8.replaceAll("\u0000", "");
    if (cleanedUtf8.trim()) return cleanedUtf8;
    const latin1 = new TextDecoder("iso-8859-1", { fatal: false }).decode(buffer);
    return latin1.replaceAll("\u0000", "");
  }

  function parseOmaxRows(content) {
    const rows = [];
    String(content || "").split(/\r?\n/).forEach(raw => {
      const line = raw.trim();
      if (!line || line.startsWith("//") || !line.startsWith("[")) return;
      const endBracket = line.indexOf("]");
      if (endBracket <= 1) return;
      const recordId = Number.parseInt(line.slice(1, endBracket), 10);
      if (!Number.isFinite(recordId) || recordId < 0) return;
      let after = line.slice(endBracket + 1).trimStart();
      if (after.startsWith(",")) after = after.slice(1);
      const tokens = after.split(",").map(token => token.trim());
      if (tokens.length < 8) return;
      const x = Number.parseFloat(tokens[0]);
      const y = Number.parseFloat(tokens[1]);
      const bow = Number.parseFloat(tokens[5]);
      const q = Number.parseInt(tokens[6], 10);
      const side = Number.parseInt(tokens[7], 10);
      if (![x, y, bow].every(Number.isFinite)) return;
      rows.push({ x, y, bow, q: Number.isFinite(q) ? q : 0, side: Number.isFinite(side) ? side : 0 });
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
      const t = i / n;
      const a = a0 + (t * theta);
      out.push({ x: cx + (r * Math.cos(a)), y: cy + (r * Math.sin(a)) });
    }
    return out;
  }

  function renderOmaxToolpathToSvgDataUrl(content, ext) {
    if (ext !== ".ord") return "";
    const rows = parseOmaxRows(content);
    if (rows.length < 2) return "";
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
      if (span < 1e-9) {
        prev = cur;
        return;
      }
      if (Math.abs(row.bow) < 1e-8) {
        path.push(`L ${cur.x} ${-cur.y}`);
        pointsDrawn.push(prev, cur);
      } else {
        const arcPoints = bulgeArcPolyline(prev, cur, row.bow, 24);
        if (arcPoints.length > 1) {
          for (let i = 1; i < arcPoints.length; i += 1) {
            const pt = arcPoints[i];
            path.push(`L ${pt.x} ${-pt.y}`);
            pointsDrawn.push(arcPoints[i - 1], pt);
          }
        } else {
          path.push(`L ${cur.x} ${-cur.y}`);
          pointsDrawn.push(prev, cur);
        }
      }
      prev = cur;
    });
    if (path.length < 2) return "";
    const focusPoints = pointsDrawn.length >= 2 ? pointsDrawn : pointsSeen;
    const bounds = normalizePreviewBounds(focusPoints, boundsFromPoints(focusPoints));
    return buildPathSvgDataUrl(path, bounds);
  }

  function renderCoordinateCloudToSvgDataUrl(text) {
    const lines = String(text || "").split(/\r?\n/).slice(0, 6000);
    if (!lines.length) return "";
    const pairMode = chooseBestNumericPairMode(lines);
    const path = [];
    const pointsSeen = [];
    const pointsDrawn = [];
    let current = { x: 0, y: 0 };
    let hasCurrent = false;
    let relativeMode = inferRelativeMode(lines);
    lines.forEach(line => {
      const upper = line.toUpperCase();
      if (!upper.trim()) return;
      if (/(?:\bG90\b|\bABS(?:OLUTE)?\b)/.test(upper)) relativeMode = false;
      if (/(?:\bG91\b|\bREL(?:ATIVE)?\b|\bINCR(?:EMENTAL)?\b|\bDELTA\b|\bOFFSET\b)/.test(upper)) relativeMode = true;
      const penUp = /(?:\bRAPID\b|\bPEN\s*UP\b|\bPU\b|\bG0\b|\bG00\b|\bJUMP\b|\bTRAVEL\b)/.test(upper);
      const forceDraw = /(?:\bDRAW\b|\bPEN\s*DOWN\b|\bPD\b|\bCUT\b|\bG1\b|\bG01\b)/.test(upper);
      const points = parseLinePointsByMode(line, pairMode);
      points.forEach(point => {
        const next = relativeMode
          ? { x: current.x + point.x, y: current.y + point.y }
          : { x: point.x, y: point.y };
        if (![next.x, next.y].every(Number.isFinite)) return;
        if (!hasCurrent) {
          path.push(`M ${next.x} ${-next.y}`);
        } else if (penUp && !forceDraw) {
          path.push(`M ${next.x} ${-next.y}`);
        } else {
          const span = Math.hypot(next.x - current.x, next.y - current.y);
          if (span > 0 && span < 1e6) {
            path.push(`L ${next.x} ${-next.y}`);
            pointsDrawn.push(current, next);
          }
        }
        pointsSeen.push(next);
        current = next;
        hasCurrent = true;
      });
    });
    if (path.length < 2) return "";
    const focusPoints = pointsDrawn.length >= 2 ? pointsDrawn : pointsSeen;
    const bounds = normalizePreviewBounds(focusPoints, boundsFromPoints(focusPoints));
    return buildPathSvgDataUrl(path, bounds);
  }

  function inferRelativeMode(lines) {
    const sample = lines.slice(0, 150).join("\n").toUpperCase();
    if (/(?:\bG90\b|\bABS(?:OLUTE)?\b)/.test(sample)) return false;
    if (/(?:\bG91\b|\bREL(?:ATIVE)?\b|\bINCR(?:EMENTAL)?\b|\bDELTA\b|\bOFFSET\b)/.test(sample)) return true;
    const points = lines.slice(0, 250).flatMap(extractLinePoints).slice(0, 300);
    if (points.length < 8) return false;
    const maxAbs = points.reduce((acc, p) => Math.max(acc, Math.abs(p.x), Math.abs(p.y)), 0);
    const avgDelta = points.slice(1).reduce((acc, p, i) => {
      const prev = points[i];
      return acc + Math.hypot(p.x - prev.x, p.y - prev.y);
    }, 0) / Math.max(1, points.length - 1);
    return maxAbs > 0 && avgDelta > 0 && avgDelta < (maxAbs * 0.45);
  }

  function chooseBestNumericPairMode(lines) {
    const modes = ["labelled", "first", "second", "last"];
    const scored = modes
      .map(mode => ({ mode, score: scorePairMode(lines, mode) }))
      .sort((a, b) => b.score - a.score);
    return scored[0]?.mode || "last";
  }

  function scorePairMode(lines, mode) {
    const points = lines.slice(0, 500).flatMap(line => parseLinePointsByMode(line, mode)).slice(0, 800);
    if (points.length < 6) return 0;
    let connected = 0;
    for (let i = 1; i < points.length; i += 1) {
      const jump = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      if (jump > 0 && jump < 20000) connected += 1;
    }
    const bounds = boundsFromPoints(points);
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const span = Math.max(width, height);
    const aspect = Math.max(width, height) / Math.max(1, Math.min(width, height));
    const continuity = connected / Math.max(1, points.length - 1);
    return (continuity * 120) + Math.log10(span + 1) - Math.min(40, aspect / 8);
  }

  function parseLinePointsByMode(line, mode) {
    const labelled = extractLinePoints(line);
    if (labelled.length) return labelled;
    const text = String(line || "");
    const safeNumericLine = /^[\s,;:+\-\d.eE]+$/.test(text);
    if (!safeNumericLine) return [];
    const numbers = [...text.matchAll(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g)]
      .map(match => Number.parseFloat(match[0]))
      .filter(Number.isFinite);
    if (numbers.length < 2) return [];
    if (mode === "first") return [{ x: numbers[0], y: numbers[1] }];
    if (mode === "second" && numbers.length >= 3) return [{ x: numbers[1], y: numbers[2] }];
    return [{ x: numbers[numbers.length - 2], y: numbers[numbers.length - 1] }];
  }

  function extractLinePoints(line) {
    const text = String(line || "");
    const labelled = [];
    const xParts = [...text.matchAll(/\bX\s*[:=]?\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/gi)];
    const yParts = [...text.matchAll(/\bY\s*[:=]?\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/gi)];
    if (xParts.length && yParts.length) {
      const pairCount = Math.min(xParts.length, yParts.length, 40);
      for (let i = 0; i < pairCount; i += 1) {
        const x = Number.parseFloat(xParts[i][1]);
        const y = Number.parseFloat(yParts[i][1]);
        if ([x, y].every(Number.isFinite)) labelled.push({ x, y });
      }
    }
    return labelled;
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
        if (namePair?.code === 2) {
          section = namePair.value.toUpperCase();
          i += 1;
        }
        continue;
      }
      if (marker === "ENDSEC") {
        section = "";
        current = null;
        continue;
      }
      if (section !== "ENTITIES") continue;
      if (current) entities.push(current);
      current = { type: marker, data: [] };
    }
    if (current) entities.push(current);

    const segments = [];
    let polyline = null;

    entities.forEach(entity => {
      if (entity.type === "LINE") {
        const x1 = numberCode(entity.data, 10);
        const y1 = numberCode(entity.data, 20);
        const x2 = numberCode(entity.data, 11);
        const y2 = numberCode(entity.data, 21);
        if ([x1, y1, x2, y2].every(Number.isFinite)) segments.push({ x1, y1, x2, y2 });
        return;
      }
      if (entity.type === "CIRCLE") {
        const cx = numberCode(entity.data, 10);
        const cy = numberCode(entity.data, 20);
        const r = numberCode(entity.data, 40);
        if ([cx, cy, r].every(Number.isFinite) && r > 0) segments.push(...arcToSegments(cx, cy, r, 0, 360));
        return;
      }
      if (entity.type === "ARC") {
        const cx = numberCode(entity.data, 10);
        const cy = numberCode(entity.data, 20);
        const r = numberCode(entity.data, 40);
        const start = numberCode(entity.data, 50);
        const end = numberCode(entity.data, 51);
        if ([cx, cy, r, start, end].every(Number.isFinite) && r > 0) segments.push(...arcToSegments(cx, cy, r, start, end));
        return;
      }
      if (entity.type === "LWPOLYLINE") {
        const points = extractPoints(entity.data);
        const closed = (intCode(entity.data, 70) & 1) === 1;
        segments.push(...pointsToSegments(points, closed));
        return;
      }
      if (entity.type === "POLYLINE") {
        polyline = { points: [], closed: (intCode(entity.data, 70) & 1) === 1 };
        return;
      }
      if (entity.type === "VERTEX" && polyline) {
        const x = numberCode(entity.data, 10);
        const y = numberCode(entity.data, 20);
        if ([x, y].every(Number.isFinite)) polyline.points.push({ x, y });
        return;
      }
      if (entity.type === "SEQEND" && polyline) {
        segments.push(...pointsToSegments(polyline.points, polyline.closed));
        polyline = null;
      }
    });

    return segments;
  }

  function numberCode(data, code) {
    for (let i = data.length - 1; i >= 0; i -= 1) {
      if (data[i].code === code) {
        const value = Number.parseFloat(data[i].value);
        if (Number.isFinite(value)) return value;
      }
    }
    return Number.NaN;
  }

  function intCode(data, code) {
    const n = numberCode(data, code);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }

  function extractPoints(data) {
    const points = [];
    let currentX = null;
    data.forEach(pair => {
      if (pair.code === 10) {
        const x = Number.parseFloat(pair.value);
        currentX = Number.isFinite(x) ? x : null;
      }
      if (pair.code === 20 && currentX != null) {
        const y = Number.parseFloat(pair.value);
        if (Number.isFinite(y)) points.push({ x: currentX, y });
        currentX = null;
      }
    });
    return points;
  }

  function pointsToSegments(points, closed) {
    if (!points || points.length < 2) return [];
    const segments = [];
    for (let i = 1; i < points.length; i += 1) {
      segments.push({ x1: points[i - 1].x, y1: points[i - 1].y, x2: points[i].x, y2: points[i].y });
    }
    if (closed) {
      const first = points[0];
      const last = points[points.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) > 1e-9) {
        segments.push({ x1: last.x, y1: last.y, x2: first.x, y2: first.y });
      }
    }
    return segments;
  }

  function arcToSegments(cx, cy, radius, startDeg, endDeg) {
    const out = [];
    let sweep = endDeg - startDeg;
    if (sweep <= 0) sweep += 360;
    const steps = Math.max(8, Math.ceil((Math.abs(sweep) / 360) * 96));
    let prev = null;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const deg = startDeg + (sweep * t);
      const rad = (deg * Math.PI) / 180;
      const point = { x: cx + (Math.cos(rad) * radius), y: cy + (Math.sin(rad) * radius) };
      if (prev) out.push({ x1: prev.x, y1: prev.y, x2: point.x, y2: point.y });
      prev = point;
    }
    return out;
  }

  function renderCadToSvgDataUrl(text) {
    const segments = parseCadSegments(text);
    if (!segments.length) return "";
    return buildSegmentsSvgDataUrl(segments);
  }

  function buildSegmentsSvgDataUrl(segments) {
    const path = [];
    const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    segments.forEach(segment => {
      if (![segment.x1, segment.y1, segment.x2, segment.y2].every(Number.isFinite)) return;
      path.push(`M ${segment.x1} ${-segment.y1} L ${segment.x2} ${-segment.y2}`);
      bounds.minX = Math.min(bounds.minX, segment.x1, segment.x2);
      bounds.maxX = Math.max(bounds.maxX, segment.x1, segment.x2);
      bounds.minY = Math.min(bounds.minY, segment.y1, segment.y2);
      bounds.maxY = Math.max(bounds.maxY, segment.y1, segment.y2);
    });
    if (!path.length) return "";
    return buildPathSvgDataUrl(path, bounds);
  }

  function buildPathSvgDataUrl(path, bounds) {
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const pad = Math.max(width, height) * 0.08;
    const vbX = bounds.minX - pad;
    const vbY = bounds.minY - pad;
    const vbW = width + (pad * 2);
    const vbH = height + (pad * 2);
    const d = path.join(" ");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${-(vbY + vbH)} ${vbW} ${vbH}"><rect x="${vbX}" y="${-(vbY + vbH)}" width="${vbW}" height="${vbH}" fill="#ffffff"/><path d="${d}" stroke="#32407a" stroke-width="${Math.max(vbW, vbH) / 450}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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

  function normalizePreviewBounds(points, fallbackBounds) {
    if (!Array.isArray(points) || points.length < 20) return fallbackBounds;
    const xs = points.map(point => point.x).filter(Number.isFinite).sort((a, b) => a - b);
    const ys = points.map(point => point.y).filter(Number.isFinite).sort((a, b) => a - b);
    if (!xs.length || !ys.length) return fallbackBounds;
    const trimmed = {
      minX: quantile(xs, 0.02),
      maxX: quantile(xs, 0.98),
      minY: quantile(ys, 0.02),
      maxY: quantile(ys, 0.98)
    };
    if (!Number.isFinite(fallbackBounds.minX) || !Number.isFinite(fallbackBounds.maxX)
      || !Number.isFinite(fallbackBounds.minY) || !Number.isFinite(fallbackBounds.maxY)) return trimmed;
    const rawW = Math.max(1, fallbackBounds.maxX - fallbackBounds.minX);
    const rawH = Math.max(1, fallbackBounds.maxY - fallbackBounds.minY);
    const trimW = Math.max(1, trimmed.maxX - trimmed.minX);
    const trimH = Math.max(1, trimmed.maxY - trimmed.minY);
    const rawSpan = Math.max(rawW, rawH);
    const trimSpan = Math.max(trimW, trimH);
    if (rawSpan / trimSpan > 20) return trimmed;
    return fallbackBounds;
  }

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    const index = (sorted.length - 1) * q;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    const ratio = index - lower;
    return sorted[lower] + ((sorted[upper] - sorted[lower]) * ratio);
  }

  function renderAnyToSvgDataUrl(source, fileName){
    const ext = extOf(fileName);
    const text = typeof source === "string" ? source : arrayBufferToText(source);
    return renderCadToSvgDataUrl(text)
      || renderOmaxToolpathToSvgDataUrl(text, ext)
      || renderCoordinateCloudToSvgDataUrl(text)
      || "";
  }

  window.dxfPreview = {
    arrayBufferToText,
    renderCadToSvgDataUrl,
    renderOmaxToolpathToSvgDataUrl,
    renderCoordinateCloudToSvgDataUrl,
    renderAnyToSvgDataUrl
  };
})();
