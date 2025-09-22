/* =================== PUMP EFFICIENCY ======================= */
window.pumpEff = window.pumpEff || { baselineRPM:null, baselineDateISO:null, entries:[] }; // [{dateISO:"yyyy-mm-dd", rpm:number}]
window.pumpChartRange = window.pumpChartRange || "3m";

const DAY_MS = 24*60*60*1000;
const PUMP_MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const PUMP_RANGE_OPTIONS = [
  { value:"1w", label:"1 week" },
  { value:"1m", label:"1 month" },
  { value:"3m", label:"3 months" },
  { value:"6m", label:"6 months" },
  { value:"1y", label:"1 year" }
];

const PUMP_RANGE_UNIT_COUNT = {
  "1w": 7,
  "1m": 5,
  "3m": 6,
  "6m": 6,
  "1y": 12
};

function pumpFormatMonthDay(date){
  const m = PUMP_MONTH_NAMES[date.getMonth()];
  const d = String(date.getDate()).padStart(2,"0");
  return `${m} ${d}`;
}
function pumpFormatMonth(date){
  return PUMP_MONTH_NAMES[date.getMonth()];
}
function pumpFormatMonthYear(date){
  const yr = String(date.getFullYear()).slice(-2);
  return `${pumpFormatMonth(date)} '${yr}`;
}

function upsertPumpEntry(dateISO, rpm){
  const d = String(dateISO);
  const r = Number(rpm);
  if (!isFinite(r) || r <= 0) return false;
  const i = pumpEff.entries.findIndex(e => e.dateISO === d);
  if (i >= 0) pumpEff.entries[i].rpm = r; else pumpEff.entries.push({ dateISO:d, rpm:r });
  pumpEff.entries.sort((a,b)=> a.dateISO.localeCompare(b.dateISO));
  return true;
}
function pumpLatest(){ return pumpEff.entries.length ? pumpEff.entries[pumpEff.entries.length-1] : null; }
function pumpPercentChange(latestRPM){
  if (!pumpEff.baselineRPM || !isFinite(latestRPM)) return null;
  return ((latestRPM - pumpEff.baselineRPM) / pumpEff.baselineRPM) * 100;
}
function pumpColorFor(pct){
  if (pct == null) return {cls:"gray", label:"—"};
  if (pct < 0) return {cls:"green-better", label:`${pct.toFixed(1)}% (better)`};
  if (pct > 18) return {cls:"red",    label:`${pct.toFixed(1)}%`};
  if (pct > 15) return {cls:"orange", label:`${pct.toFixed(1)}%`};
  if (pct >= 8) return {cls:"yellow", label:`${pct.toFixed(1)}%`};
  return {cls:"green",  label:`${pct.toFixed(1)}%`};
}

function pumpRangeLabel(val){
  const opt = PUMP_RANGE_OPTIONS.find(o => o.value === val);
  return opt ? opt.label : val;
}

function pumpRangeCutoff(latestDate, range){
  const cutoff = new Date(latestDate.getTime());
  switch(range){
    case "1w": cutoff.setDate(cutoff.getDate() - 6); break;
    case "1m": cutoff.setMonth(cutoff.getMonth() - 1); break;
    case "3m": cutoff.setMonth(cutoff.getMonth() - 3); break;
    case "6m": cutoff.setMonth(cutoff.getMonth() - 6); break;
    case "1y": cutoff.setFullYear(cutoff.getFullYear() - 1); break;
    default: cutoff.setMonth(cutoff.getMonth() - 3); break;
  }
  return cutoff;
}

function pumpFilterEntriesByRange(entries, range){
  if (!entries.length) return [];
  const data = entries.slice();
  const latestDate = new Date(data[data.length - 1].dateISO + "T00:00:00");
  const cutoff = pumpRangeCutoff(latestDate, range);
  return data.filter(entry => {
    const d = new Date(entry.dateISO + "T00:00:00");
    return d >= cutoff;
  });
}

function pumpAdvanceCursor(range, cursor){
  const next = new Date(cursor.getTime());
  switch(range){
    case "1w": next.setDate(next.getDate() + 1); break;
    case "1m": next.setDate(next.getDate() + 7); break;
    case "3m": next.setDate(next.getDate() + 14); break;
    case "6m": next.setMonth(next.getMonth() + 1); break;
    case "1y": next.setMonth(next.getMonth() + 1); break;
    default: next.setDate(next.getDate() + 14); break;
  }
  return next;
}

function pumpTickLabel(range, index, date, startDate, endDate, isFinal){
  const info = { label:"", subLabel:null };
  const unitCap = PUMP_RANGE_UNIT_COUNT[range] || null;
  const ordinal = unitCap ? Math.min(index + 1, unitCap) : (index + 1);
  switch(range){
    case "1w":
      info.label = `Day ${ordinal}`;
      info.subLabel = pumpFormatMonthDay(date);
      break;
    case "1m":
      info.label = `Week ${ordinal}`;
      info.subLabel = pumpFormatMonthDay(date);
      break;
    case "3m":
      info.label = `Bi-Wk ${ordinal}`;
      info.subLabel = pumpFormatMonthDay(date);
      break;
    case "6m":
      info.label = pumpFormatMonth(date);
      if (startDate.getFullYear() !== endDate.getFullYear() || date.getFullYear() !== startDate.getFullYear()){
        info.subLabel = `'${String(date.getFullYear()).slice(-2)}`;
      }
      break;
    case "1y":
      info.label = pumpFormatMonthYear(date);
      break;
    default:
      info.label = pumpFormatMonthDay(date);
      break;
  }
  if (isFinal){
    if (range === "1w") info.label = `Day ${unitCap ? unitCap : Math.max(index + 1, 1)}`;
    if (range === "1m") info.label = `Week ${unitCap ? unitCap : Math.max(index + 1, 1)}`;
    if (range === "3m") info.label = `Bi-Wk ${unitCap ? unitCap : Math.max(index + 1, 1)}`;
  }
  if (!info.subLabel) delete info.subLabel;
  return info;
}

function pumpBuildTimeTicks(range, startTime, endTime){
  const ticks = [];
  if (!(endTime > startTime)) return ticks;
  const startDate = new Date(startTime);
  const endDate = new Date(endTime);
  const unitCap = PUMP_RANGE_UNIT_COUNT[range] || null;
  let cursor = new Date(startDate.getTime());
  let index = 0;
  const epsilon = 60*60*1000; // 1 hour tolerance
  const maxIterations = 200;
  while (cursor.getTime() <= endTime + epsilon && index < maxIterations){
    const info = pumpTickLabel(range, index, cursor, startDate, endDate, Math.abs(cursor.getTime() - endTime) <= epsilon);
    ticks.push({ time: cursor.getTime(), label: info.label, subLabel: info.subLabel });
    if (unitCap && ticks.length >= Math.max(1, unitCap - 1)) break;
    const next = pumpAdvanceCursor(range, cursor);
    if (next.getTime() <= cursor.getTime()) break;
    cursor = next;
    index++;
  }
  const last = ticks[ticks.length - 1];
  if (!last || Math.abs(last.time - endTime) > epsilon){
    const endInfo = pumpTickLabel(range, ticks.length, endDate, startDate, endDate, true);
    ticks.push({ time: endTime, label: endInfo.label, subLabel: endInfo.subLabel });
  }
  return ticks;
}

function viewPumpWidget(){
  const latest = pumpLatest();
  const pct    = latest ? pumpPercentChange(latest.rpm) : null;
  const col    = pumpColorFor(pct);
  const baselineVal = pumpEff.baselineRPM ?? "";
  const todayISO    = new Date().toISOString().slice(0,10);
  const latestTxt   = latest ? `${latest.rpm} RPM on ${latest.dateISO}` : "—";
  const rangeValue  = window.pumpChartRange || "3m";
  const rangeOptions = PUMP_RANGE_OPTIONS.map(opt => `<option value="${opt.value}" ${opt.value===rangeValue?"selected":""}>Last ${opt.label}</option>`).join("");
  return `
  <details class="block pump-card" open>
    <summary><b>Pump Efficiency</b> <span class="chip ${col.cls}">${col.label}</span></summary>
    <div class="pump-grid">
      <div class="pump-col">
        <h4>Baseline @ 49 ksi</h4>
        <form id="pumpBaselineForm" class="mini-form">
          <input type="number" id="pumpBaselineRPM" min="1" step="1" placeholder="RPM" value="${baselineVal}">
          <button type="submit">Set baseline (today)</button>
        </form>
        <div class="small muted">Lower RPM = better. Baseline is recorded after a major/minor rebuild.</div>
        <h4 style="margin-top:10px">Daily log</h4>
        <form id="pumpLogForm" class="mini-form">
          <input type="date" id="pumpLogDate" value="${todayISO}" required>
          <input type="number" id="pumpLogRPM" min="1" step="1" placeholder="RPM at 49 ksi" required>
          <button type="submit">Add / Update</button>
        </form>
        <div class="pump-stats">
          <div><span class="lbl">Baseline:</span> <span>${pumpEff.baselineRPM ? `${pumpEff.baselineRPM} RPM (${pumpEff.baselineDateISO})` : "—"}</span></div>
          <div><span class="lbl">Latest:</span> <span>${latestTxt}</span></div>
        </div>
      </div>
      <div class="pump-col pump-chart-col">
        <div class="pump-chart-toolbar small muted">
          <label for="pumpRange">Timeframe:</label>
          <select id="pumpRange">${rangeOptions}</select>
        </div>
        <div class="pump-chart-wrap">
          <canvas id="pumpChart" height="240"></canvas>
        </div>
        <div class="pump-legend small muted">
          <span>Color codes:</span>
          <span class="chip green">0–&lt;8%</span>
          <span class="chip yellow">8–15%</span>
          <span class="chip orange">&gt;15–18%</span>
          <span class="chip red">&gt;18%</span>
          <span class="chip green-better">Negative = better</span>
        </div>
      </div>
    </div>
  </details>`;
}
function renderPumpWidget(){
  const host = document.getElementById("pump-widget");
  if (!host) return;
  host.innerHTML = viewPumpWidget();
  document.getElementById("pumpBaselineForm")?.addEventListener("submit",(e)=>{
    e.preventDefault();
    const rpm = Number(document.getElementById("pumpBaselineRPM").value);
    if (!isFinite(rpm) || rpm <= 0) { toast("Enter a valid RPM."); return; }
    pumpEff.baselineRPM     = rpm;
    pumpEff.baselineDateISO = new Date().toISOString().slice(0,10);
    saveCloudDebounced(); toast("Baseline set"); renderPumpWidget();
  });
  document.getElementById("pumpLogForm")?.addEventListener("submit",(e)=>{
    e.preventDefault();
    const d   = document.getElementById("pumpLogDate").value;
    const rpm = Number(document.getElementById("pumpLogRPM").value);
    if (!d || !isFinite(rpm) || rpm <= 0) { toast("Enter date and valid RPM."); return; }
    upsertPumpEntry(d, rpm); saveCloudDebounced(); toast("Log saved"); renderPumpWidget();
  });
  const canvas = document.getElementById("pumpChart");
  const wrap   = document.querySelector(".pump-chart-wrap");
  if (canvas && wrap){
    const targetWidth = Math.max(320, Math.floor(wrap.clientWidth - 8));
    if (targetWidth && canvas.width !== targetWidth) canvas.width = targetWidth;
  }
  const rangeSelect = document.getElementById("pumpRange");
  if (rangeSelect){
    if (rangeSelect.value !== window.pumpChartRange) rangeSelect.value = window.pumpChartRange;
    rangeSelect.addEventListener("change", (e)=>{
      window.pumpChartRange = e.target.value;
      drawPumpChart(canvas, window.pumpChartRange);
    });
  }
  drawPumpChart(canvas, window.pumpChartRange);
}
function drawPumpChart(canvas, rangeValue){
  if (!canvas) return;
  const ctx = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0,0,W,H);
  ctx.font = "12px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  if (!pumpEff.entries.length){
    ctx.fillStyle = "#888";
    ctx.fillText("No pump logs yet.", 14, H/2);
    return;
  }
  const range = rangeValue || window.pumpChartRange || "3m";
  const dataAll = pumpEff.entries.slice();
  const filtered = pumpFilterEntriesByRange(dataAll, range);
  const usingFiltered = filtered.length > 0;
  const data = usingFiltered ? filtered : [dataAll[dataAll.length - 1]];
  const dates = data.map(d=>new Date(d.dateISO+"T00:00:00"));
  const rpms  = data.map(d=>d.rpm);
  const minR  = Math.min(...rpms, pumpEff.baselineRPM ?? rpms[0]);
  const maxR  = Math.max(...rpms, pumpEff.baselineRPM ?? rpms[0]);
  const padY  = Math.max(5, (maxR-minR)*0.1);
  const yMin = minR - padY;
  const yMax = maxR + padY;
  const latestDate = dates[dates.length - 1];
  const axisEndDate = new Date(latestDate.getTime());
  const axisStartDate = pumpRangeCutoff(axisEndDate, range);
  let xMin = axisStartDate.getTime();
  let xMax = axisEndDate.getTime();
  if (xMax <= xMin) xMax = xMin + DAY_MS;
  const ticks = pumpBuildTimeTicks(range, xMin, xMax);
  const hasSubLabel = ticks.some(t => t.subLabel);
  const margin = { top: 40, right: 16, bottom: hasSubLabel ? 66 : 48, left: 48 };
  const innerW = Math.max(10, W - margin.left - margin.right);
  const innerH = Math.max(10, H - margin.top - margin.bottom);
  const axisY = margin.top + innerH;
  const axisX0 = margin.left;
  const axisX1 = W - margin.right;
  const span = xMax - xMin;
  const singlePoint = span < 1000;
  const X = t => singlePoint ? (axisX0 + axisX1) / 2 : axisX0 + ((t - xMin) / span) * innerW;
  const ySpan = Math.max(1e-6, (yMax - yMin));
  const Y = v => axisY - ((v - yMin) / ySpan) * innerH;

  ctx.strokeStyle = "#d8deeb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(axisX0, margin.top - 4);
  ctx.lineTo(axisX0, axisY);
  ctx.lineTo(axisX1, axisY);
  ctx.stroke();

  if (pumpEff.baselineRPM){
    const baselineY = Y(pumpEff.baselineRPM);
    ctx.strokeStyle = "#9aa5b5";
    ctx.setLineDash([4,4]);
    ctx.beginPath();
    ctx.moveTo(axisX0, baselineY);
    ctx.lineTo(axisX1, baselineY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#666";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`Baseline ${pumpEff.baselineRPM} RPM`, axisX0 + 6, baselineY - 4);
  }

  ctx.strokeStyle = "#0a63c2";
  ctx.lineWidth = 2;
  ctx.beginPath();
  dates.forEach((d,i)=>{
    const x = X(d.getTime());
    const y = Y(rpms[i]);
    if (i === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  ctx.fillStyle = "#0a63c2";
  dates.forEach((d,i)=>{
    const x = X(d.getTime());
    const y = Y(rpms[i]);
    ctx.beginPath();
    ctx.arc(x,y,3,0,Math.PI*2);
    ctx.fill();
  });

  ctx.save();
  ctx.strokeStyle = "#9aa5b5";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ticks.forEach(t => {
    const x = X(t.time);
    ctx.moveTo(x, axisY);
    ctx.lineTo(x, axisY + 7);
  });
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const primaryFont = "11px sans-serif";
  const secondaryFont = "10px sans-serif";
  const baseY = axisY + 10;
  ticks.forEach((t,idx) => {
    const x = X(t.time);
    ctx.font = primaryFont;
    ctx.fillStyle = "#4a5868";
    ctx.fillText(t.label, x, baseY);
    if (t.subLabel){
      ctx.font = secondaryFont;
      ctx.fillStyle = "#6c7a90";
      ctx.fillText(t.subLabel, x, baseY + 13);
    }
  });
  ctx.restore();

  const latest = pumpLatest();
  if (latest){
    const pct = pumpPercentChange(latest.rpm);
    const col = pumpColorFor(pct).cls;
    const map={green:"#2e7d32","green-better":"#2e7d32",yellow:"#c29b00",orange:"#d9822b",red:"#c62828",gray:"#777"};
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = map[col] || "#333";
    ctx.fillText(`Latest: ${latest.rpm} RPM (${latest.dateISO})  Δ%=${pct!=null?pct.toFixed(1):"—"}`, axisX0 + 4, margin.top / 2);
  }

  ctx.fillStyle = "#4a5868";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(`Range: Last ${pumpRangeLabel(range)}`, axisX1, margin.top / 2);

  if (!usingFiltered){
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#777";
    const infoY = axisY + (hasSubLabel ? 32 : 20);
    ctx.fillText("No logs in selected range. Showing latest entry.", axisX0 + 4, infoY);
  }
}

