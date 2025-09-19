/* =================== PUMP EFFICIENCY ======================= */
window.pumpEff = window.pumpEff || { baselineRPM:null, baselineDateISO:null, entries:[] }; // [{dateISO:"yyyy-mm-dd", rpm:number}]

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

function viewPumpWidget(){
  const latest = pumpLatest();
  const pct    = latest ? pumpPercentChange(latest.rpm) : null;
  const col    = pumpColorFor(pct);
  const baselineVal = pumpEff.baselineRPM ?? "";
  const todayISO    = new Date().toISOString().slice(0,10);
  const latestTxt   = latest ? `${latest.rpm} RPM on ${latest.dateISO}` : "—";
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
      <div class="pump-col">
        <canvas id="pumpChart" width="520" height="180"></canvas>
        <div class="small muted" style="margin-top:6px">
          Color codes: <span class="chip green">0–&lt;8%</span> <span class="chip yellow">8–15%</span>
          <span class="chip orange">&gt;15–18%</span> <span class="chip red">&gt;18%</span>
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
  drawPumpChart(document.getElementById("pumpChart"));
}
function drawPumpChart(canvas){
  if (!canvas) return;
  const ctx = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H); ctx.fillStyle="#fff"; ctx.fillRect(0,0,W,H);
  if (!pumpEff.entries.length){ ctx.fillStyle="#888"; ctx.fillText("No pump logs yet.", 12, H/2); return; }
  const data = pumpEff.entries.slice();
  const dates = data.map(d=>new Date(d.dateISO+"T00:00:00"));
  const rpms  = data.map(d=>d.rpm);
  const minR  = Math.min(...rpms, pumpEff.baselineRPM ?? rpms[0]);
  const maxR  = Math.max(...rpms, pumpEff.baselineRPM ?? rpms[0]);
  const padY  = Math.max(5, (maxR-minR)*0.1);
  const xMin = dates[0].getTime(), xMax = dates[dates.length-1].getTime();
  const yMin = minR - padY, yMax = maxR + padY;
  const X=t=>((t-xMin)/Math.max(1,(xMax-xMin)))*(W-40)+30;
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
}

