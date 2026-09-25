(function(root, factory){
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.dxfPreview = api;
})(typeof window !== "undefined" ? window : null, function(){
  "use strict";

  const TAU = Math.PI * 2;
  const CURVE_SEGMENTS = 64;
  const ACI = ["#000000", "#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff", "#32407a", "#808080", "#c0c0c0"];

  function arrayBufferToText(buffer){
    try { return new TextDecoder("utf-8").decode(buffer); }
    catch(_){ return new TextDecoder().decode(buffer); }
  }

  function pairsFromText(text){
    const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
    const pairs = [];
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const code = Number.parseInt(lines[i].trim(), 10);
      if (Number.isFinite(code)) pairs.push({ code, value: lines[i + 1].trim() });
    }
    return pairs;
  }

  function record(type, data){
    const values = new Map();
    data.forEach(({code, value}) => {
      if (!values.has(code)) values.set(code, []);
      values.get(code).push(value);
    });
    return { type: String(type || "").toUpperCase(), data, values };
  }
  const raw = (item, code, index = 0) => item?.values.get(code)?.[index];
  const number = (item, code, index = 0, fallback = NaN) => {
    const value = Number.parseFloat(raw(item, code, index));
    return Number.isFinite(value) ? value : fallback;
  };
  function parseRecords(pairs, wantedSection){
    const result = [];
    let section = "";
    let current = null;
    for (let i = 0; i < pairs.length; i += 1) {
      const pair = pairs[i];
      if (pair.code === 0 && pair.value.toUpperCase() === "SECTION") {
        if (current) result.push(record(current.type, current.data));
        current = null;
        if (pairs[i + 1]?.code === 2) { section = pairs[++i].value.toUpperCase(); }
        continue;
      }
      if (pair.code === 0 && pair.value.toUpperCase() === "ENDSEC") {
        if (current && section === wantedSection) result.push(record(current.type, current.data));
        current = null; section = ""; continue;
      }
      if (section !== wantedSection) continue;
      if (pair.code === 0) {
        if (current) result.push(record(current.type, current.data));
        current = { type: pair.value, data: [] };
      } else if (current) current.data.push(pair);
    }
    if (current && section === wantedSection) result.push(record(current.type, current.data));
    return result;
  }

  function parseLayers(records){
    const layers = new Map();
    records.filter(item => item.type === "LAYER").forEach(item => {
      const name = raw(item, 2) || "0";
      const color = number(item, 62, 0, 7);
      const flags = number(item, 70, 0, 0);
      layers.set(name, { name, color: Math.abs(color), visible: color >= 0 && !(flags & 1) });
    });
    if (!layers.has("0")) layers.set("0", { name: "0", color: 7, visible: true });
    return layers;
  }

  function groupEntities(records){
    const entities = [];
    for (let i = 0; i < records.length; i += 1) {
      const item = records[i];
      if (item.type !== "POLYLINE") { entities.push(item); continue; }
      item.vertices = [];
      while (records[i + 1]?.type === "VERTEX") item.vertices.push(records[++i]);
      if (records[i + 1]?.type === "SEQEND") i += 1;
      entities.push(item);
    }
    return entities.filter(item => item.type !== "VERTEX" && item.type !== "SEQEND");
  }

  function parseDxf(text){
    const pairs = pairsFromText(text);
    const layers = parseLayers(parseRecords(pairs, "TABLES"));
    const blockRecords = parseRecords(pairs, "BLOCKS");
    const blocks = new Map();
    for (let i = 0; i < blockRecords.length; i += 1) {
      if (blockRecords[i].type !== "BLOCK") continue;
      const header = blockRecords[i], body = [];
      while (blockRecords[i + 1] && blockRecords[i + 1].type !== "ENDBLK") body.push(blockRecords[++i]);
      if (blockRecords[i + 1]?.type === "ENDBLK") i += 1;
      const name = raw(header, 2) || raw(header, 3);
      if (name) blocks.set(name, { base: [number(header, 10, 0, 0), number(header, 20, 0, 0)], entities: groupEntities(body) });
    }
    return { layers, blocks, entities: groupEntities(parseRecords(pairs, "ENTITIES")) };
  }

  function identity(point){ return point; }
  function combineTransform(parent, local){ return point => parent(local(point)); }
  function insertTransform(entity, block, column = 0, row = 0){
    const sx = number(entity, 41, 0, 1), sy = number(entity, 42, 0, 1);
    const angle = number(entity, 50, 0, 0) * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const tx = number(entity, 10, 0, 0), ty = number(entity, 20, 0, 0);
    const dx = column * number(entity, 44, 0, 0), dy = row * number(entity, 45, 0, 0);
    return ([x, y]) => {
      x = (x - block.base[0] + dx) * sx; y = (y - block.base[1] + dy) * sy;
      return [tx + x * cos - y * sin, ty + x * sin + y * cos];
    };
  }

  function arcPoints(cx, cy, radius, start, end){
    let sweep = end - start;
    while (sweep <= 0) sweep += TAU;
    const steps = Math.max(4, Math.ceil(CURVE_SEGMENTS * sweep / TAU));
    return Array.from({length: steps + 1}, (_, i) => {
      const angle = start + sweep * i / steps;
      return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    });
  }

  function bulgePoints(a, b, bulge){
    if (!Number.isFinite(bulge) || Math.abs(bulge) < 1e-10) return [a, b];
    const dx = b[0] - a[0], dy = b[1] - a[1], chord = Math.hypot(dx, dy);
    if (!chord) return [a];
    const sweep = 4 * Math.atan(bulge);
    const radius = chord * (1 + bulge * bulge) / (4 * Math.abs(bulge));
    const midX = (a[0] + b[0]) / 2, midY = (a[1] + b[1]) / 2;
    const offset = chord * (1 - bulge * bulge) / (4 * bulge);
    const cx = midX - dy / chord * offset, cy = midY + dx / chord * offset;
    const start = Math.atan2(a[1] - cy, a[0] - cx);
    const steps = Math.max(4, Math.ceil(CURVE_SEGMENTS * Math.abs(sweep) / TAU));
    return Array.from({length: steps + 1}, (_, i) => {
      const angle = start + sweep * i / steps;
      return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    });
  }

  function polylinePoints(vertices, closed){
    const points = [];
    const edgeCount = closed ? vertices.length : Math.max(0, vertices.length - 1);
    for (let i = 0; i < edgeCount; i += 1) {
      const a = vertices[i], b = vertices[(i + 1) % vertices.length];
      const edge = bulgePoints(a.point, b.point, a.bulge);
      points.push(...(i ? edge.slice(1) : edge));
    }
    if (!closed && vertices.length) points.push(...(points.length ? [] : [vertices[0].point]));
    return points;
  }

  function lwVertices(entity){
    const result = [];
    let vertex = null;
    entity.data.forEach(pair => {
      if (pair.code === 10) { if (vertex) result.push(vertex); vertex = { point: [Number(pair.value), 0], bulge: 0 }; }
      else if (vertex && pair.code === 20) vertex.point[1] = Number(pair.value);
      else if (vertex && pair.code === 42) vertex.bulge = Number(pair.value);
    });
    if (vertex) result.push(vertex);
    return result.filter(v => v.point.every(Number.isFinite));
  }

  function splinePoint(control, degree, knots, weights, t){
    const n = control.length - 1;
    if (n < 1) return control[0] || [0, 0];
    const p = Math.min(Math.max(1, degree), n);
    let k = p;
    while (k < n + 1 && t >= knots[k + 1]) k += 1;
    k = Math.min(k, n);
    const d = [];
    for (let j = 0; j <= p; j += 1) {
      const index = k - p + j, w = weights[index] || 1;
      d[j] = [control[index][0] * w, control[index][1] * w, w];
    }
    for (let r = 1; r <= p; r += 1) for (let j = p; j >= r; j -= 1) {
      const index = k - p + j;
      const denominator = knots[index + p - r + 1] - knots[index];
      const alpha = denominator ? (t - knots[index]) / denominator : 0;
      d[j] = d[j - 1].map((value, axis) => value * (1 - alpha) + d[j][axis] * alpha);
    }
    return d[p][2] ? [d[p][0] / d[p][2], d[p][1] / d[p][2]] : [d[p][0], d[p][1]];
  }

  function entityColor(entity, layers, inheritedColor){
    const layerName = raw(entity, 8) || "0", layer = layers.get(layerName) || layers.get("0");
    const explicit = number(entity, 62);
    const index = Number.isFinite(explicit) && explicit !== 256 ? Math.abs(explicit) : (inheritedColor || layer.color || 7);
    return ACI[index] || `hsl(${(index * 47) % 360} 70% 42%)`;
  }
  function isVisible(entity, layers){
    if (number(entity, 60, 0, 0) === 1) return false;
    const layer = layers.get(raw(entity, 8) || "0");
    return !layer || layer.visible;
  }

  function primitivesFromDxf(parsed){
    const output = [];
    function addPath(points, entity, transform, inheritedColor, closed = false){
      const transformed = points.filter(p => p.every(Number.isFinite)).map(transform);
      if (transformed.length > 1) output.push({ kind: "path", points: transformed, closed, color: entityColor(entity, parsed.layers, inheritedColor) });
    }
    function visit(entity, transform = identity, inheritedColor, depth = 0){
      if (!entity || depth > 16 || !isVisible(entity, parsed.layers)) return;
      const type = entity.type;
      if (type === "LINE") {
        addPath([[number(entity,10),number(entity,20)],[number(entity,11),number(entity,21)]], entity, transform, inheritedColor);
      } else if (type === "LWPOLYLINE") {
        const vertices = lwVertices(entity), closed = Boolean(number(entity, 70, 0, 0) & 1);
        addPath(polylinePoints(vertices, closed), entity, transform, inheritedColor, closed);
      } else if (type === "POLYLINE") {
        const vertices = (entity.vertices || []).filter(v => !(number(v, 70, 0, 0) & 16)).map(v => ({point:[number(v,10),number(v,20)],bulge:number(v,42,0,0)}));
        const closed = Boolean(number(entity, 70, 0, 0) & 1);
        addPath(polylinePoints(vertices, closed), entity, transform, inheritedColor, closed);
      } else if (type === "ARC" || type === "CIRCLE") {
        const start = type === "CIRCLE" ? 0 : number(entity,50,0,0) * Math.PI / 180;
        const end = type === "CIRCLE" ? TAU : number(entity,51,0,360) * Math.PI / 180;
        addPath(arcPoints(number(entity,10),number(entity,20),Math.abs(number(entity,40)),start,end), entity, transform, inheritedColor, type === "CIRCLE");
      } else if (type === "ELLIPSE") {
        const cx=number(entity,10), cy=number(entity,20), mx=number(entity,11), my=number(entity,21), ratio=Math.abs(number(entity,40,0,1));
        const start=number(entity,41,0,0), end=number(entity,42,0,TAU), sweep=end>=start?end-start:end-start+TAU;
        const steps=Math.max(8,Math.ceil(CURVE_SEGMENTS*sweep/TAU));
        const points=Array.from({length:steps+1},(_,i)=>{const a=start+sweep*i/steps;return[cx+mx*Math.cos(a)-my*ratio*Math.sin(a),cy+my*Math.cos(a)+mx*ratio*Math.sin(a)];});
        addPath(points,entity,transform,inheritedColor,Math.abs(sweep-TAU)<1e-6);
      } else if (type === "SPLINE") {
        const xs=entity.values.get(10)||[], ys=entity.values.get(20)||[], control=xs.map((x,i)=>[Number(x),Number(ys[i])]).filter(p=>p.every(Number.isFinite));
        const degree=number(entity,71,0,3), weights=(entity.values.get(41)||[]).map(Number);
        let knots=(entity.values.get(40)||[]).map(Number).filter(Number.isFinite);
        if (control.length>1) {
          const p=Math.min(Math.max(1,degree),control.length-1);
          if(knots.length<control.length+p+1) knots=Array.from({length:control.length+p+1},(_,i)=>i<=p?0:i>=control.length?1:(i-p)/(control.length-p));
          const min=knots[p],max=knots[control.length],steps=Math.max(CURVE_SEGMENTS,control.length*12);
          addPath(Array.from({length:steps+1},(_,i)=>splinePoint(control,p,knots,weights,min+(max-min)*i/steps)),entity,transform,inheritedColor);
        }
      } else if (type === "INSERT") {
        const block=parsed.blocks.get(raw(entity,2)); if(!block)return;
        const columns=Math.max(1,Math.floor(number(entity,70,0,1))), rows=Math.max(1,Math.floor(number(entity,71,0,1)));
        const color=entityColor(entity,parsed.layers,inheritedColor);
        for(let row=0;row<rows;row+=1)for(let col=0;col<columns;col+=1){const nested=combineTransform(transform,insertTransform(entity,block,col,row));block.entities.forEach(child=>visit(child,nested,color,depth+1));}
      } else if (type === "POINT") {
        const point=transform([number(entity,10),number(entity,20)]); if(point.every(Number.isFinite))output.push({kind:"point",point,color:entityColor(entity,parsed.layers,inheritedColor)});
      } else if (type === "TEXT" || type === "MTEXT") {
        const chunks=[...(entity.values.get(type === "TEXT" ? 1 : 3)||[])]; if(type==="MTEXT"&&raw(entity,1)!=null)chunks.push(raw(entity,1));
        const value=chunks.join("").replace(/\\P/g,"\n").replace(/\\[A-Za-z][^;]*;/g,"").trim();
        const point=transform([number(entity,10),number(entity,20)]);
        if(value&&point.every(Number.isFinite))output.push({kind:"text",point,text:value,height:Math.abs(number(entity,40,0,1)),rotation:number(entity,50,0,0),color:entityColor(entity,parsed.layers,inheritedColor)});
      }
    }
    parsed.entities.forEach(entity=>visit(entity));
    return output;
  }

  function escapeXml(value){return String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[char]);}
  function format(value){return Number(value.toFixed(6));}
  function renderCadToSvgDataUrl(text){
    const primitives=primitivesFromDxf(parseDxf(text));
    const points=[];
    primitives.forEach(item=>{if(item.points)points.push(...item.points);else if(item.point)points.push(item.point);});
    if(!points.length)return "";
    const bounds=points.reduce((b,p)=>({minX:Math.min(b.minX,p[0]),maxX:Math.max(b.maxX,p[0]),minY:Math.min(b.minY,p[1]),maxY:Math.max(b.maxY,p[1])}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
    let width=Math.max(1,bounds.maxX-bounds.minX),height=Math.max(1,bounds.maxY-bounds.minY),pad=Math.max(width,height)*0.08;
    const vbX=bounds.minX-pad,vbY=-(bounds.maxY+pad),vbW=width+pad*2,vbH=height+pad*2,stroke=Math.max(vbW,vbH)/500;
    const markup=primitives.map(item=>{
      if(item.kind==="path"){const d=item.points.map((p,i)=>`${i?"L":"M"}${format(p[0])} ${format(-p[1])}`).join(" ")+(item.closed?" Z":"");return `<path d="${d}" stroke="${item.color}"/>`;}
      if(item.kind==="point"){const r=stroke*2.5,x=format(item.point[0]),y=format(-item.point[1]);return `<path d="M${format(x-r)} ${y} L${format(x+r)} ${y} M${x} ${format(y-r)} L${x} ${format(y+r)}" stroke="${item.color}"/>`;}
      const x=format(item.point[0]),y=format(-item.point[1]),size=Math.max(item.height,stroke*5);return `<text x="${x}" y="${y}" font-size="${format(size)}" fill="${item.color}" stroke="none" transform="rotate(${format(-item.rotation)} ${x} ${y})">${escapeXml(item.text)}</text>`;
    }).join("");
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${format(vbX)} ${format(vbY)} ${format(vbW)} ${format(vbH)}"><rect x="${format(vbX)}" y="${format(vbY)}" width="${format(vbW)}" height="${format(vbH)}" fill="#ffffff"/><g fill="none" stroke-width="${format(stroke)}" stroke-linecap="round" stroke-linejoin="round">${markup}</g></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  return { arrayBufferToText, parseDxf, primitivesFromDxf, renderCadToSvgDataUrl };
});
