/* =================== PUMP EFFICIENCY ======================= */
window.pumpEff = window.pumpEff || { baselineRPM:null, baselineDateISO:null, entries:[] }; // [{dateISO:"yyyy-mm-dd", rpm:number}]
window.pumpChartRange = window.pumpChartRange || "3m";

const PUMP_RANGE_OPTIONS = [
  { value:"1w", label:"1 week" },
  { value:"1m", label:"1 month" },
  { value:"3m", label:"3 months" },
  { value:"6m", label:"6 months" },
  { value:"1y", label:"1 year" }
];

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

function pumpFilterEntriesByRange(entries, range){
  if (!entries.length) return [];
  const data = entries.slice();
  const latestDate = new Date(data[data.length - 1].dateISO + "T00:00:00");
  const cutoff = new Date(latestDate);
  switch(range){
    case "1w": cutoff.setDate(cutoff.getDate() - 6); break;
    case "1m": cutoff.setMonth(cutoff.getMonth() - 1); break;
    case "3m": cutoff.setMonth(cutoff.getMonth() - 3); break;
    case "6m": cutoff.setMonth(cutoff.getMonth() - 6); break;
    case "1y": cutoff.setFullYear(cutoff.getFullYear() - 1); break;
    default: cutoff.setMonth(cutoff.getMonth() - 3); break;
  }
  return data.filter(entry => {
    const d = new Date(entry.dateISO + "T00:00:00");
    return d >= cutoff;
  });
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
  ctx.clearRect(0,0,W,H); ctx.fillStyle="#fff"; ctx.fillRect(0,0,W,H);
  ctx.font = "12px sans-serif";
  ctx.textAlign = "left";
  if (!pumpEff.entries.length){ ctx.fillStyle="#888"; ctx.fillText("No pump logs yet.", 12, H/2); return; }
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
  const xMin = dates[0].getTime(), xMax = dates[dates.length-1].getTime();
  const yMin = minR - padY, yMax = maxR + padY;
  const span = Math.max(1, (xMax - xMin));
  const singlePoint = xMax === xMin;
  const X=t=> singlePoint ? (W + 20) / 2 : ((t-xMin)/span)*(W-40)+30;
  const Y=v=>H-20-((v-yMin)/Math.max(1,(yMax-yMin)))*(H-40);
  ctx.strokeStyle="#e2e6f1"; ctx.beginPath(); ctx.moveTo(30,10); ctx.lineTo(30,H-20); ctx.lineTo(W-10,H-20); ctx.stroke();
  if (pumpEff.baselineRPM){
    ctx.strokeStyle="#999"; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(30,Y(pumpEff.baselineRPM)); ctx.lineTo(W-10,Y(pumpEff.baselineRPM)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle="#666"; ctx.fillText(`Baseline ${pumpEff.baselineRPM} RPM`, 34, Y(pumpEff.baselineRPM)-6);
  }
  ctx.strokeStyle="#0a63c2"; ctx.lineWidth=2; ctx.beginPath();
  dates.forEach((d,i)=>{ const x=X(d.getTime()), y=Y(rpms[i]); if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke();
  ctx.fillStyle="#0a63c2"; dates.forEach((d,i)=>{ const x=X(d.getTime()), y=Y(rpms[i]); ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill(); });
  const latest = pumpLatest();
  if (latest){
    const pct = pumpPercentChange(latest.rpm);
    const col = pumpColorFor(pct).cls;
    const map={green:"#2e7d32","green-better":"#2e7d32",yellow:"#c29b00",orange:"#d9822b",red:"#c62828",gray:"#777"};
    ctx.fillStyle = map[col] || "#333";
    ctx.fillText(`Latest: ${latest.rpm} RPM (${latest.dateISO})  Δ%=${pct!=null?pct.toFixed(1):"—"}`, 34, 18);
  }
  ctx.fillStyle = "#4a5868";
  ctx.textAlign = "right";
  ctx.fillText(`Range: Last ${pumpRangeLabel(range)}`, W - 12, 18);
  ctx.textAlign = "left";
  if (!usingFiltered){
    ctx.fillStyle = "#777";
    ctx.fillText("No logs in selected range. Showing latest entry.", 34, H - 8);
  }
}

