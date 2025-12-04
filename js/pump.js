/* =================== PUMP EFFICIENCY ======================= */
window.pumpEff = window.pumpEff || { baselineRPM:null, baselineDateISO:null, entries:[], notes:[] }; // [{dateISO:"yyyy-mm-dd", rpm:number, timeISO:"HH:MM"}]
if (!Array.isArray(window.pumpEff.entries)) window.pumpEff.entries = [];
if (!Array.isArray(window.pumpEff.notes)) window.pumpEff.notes = [];
window.pumpChartRange = window.pumpChartRange || "3m";
window.pumpChartExpanded = window.pumpChartExpanded || false;
let pumpEditingDateISO = (typeof window !== "undefined" && window.pumpEditingDateISO != null) ? window.pumpEditingDateISO : null;

const PUMP_BASE_FONT_SCALE = 1.72;
const PUMP_DEFAULT_MEASUREMENT_TIME = "12:00";
const pumpViewportState = { bound:false, lastResponsiveScale:1 };
let pumpLayoutObserver = null;
let pumpObservedWrap = null;
let pumpObservedCanvas = null;
const pumpObservedSize = { width:null, height:null, rawWidth:null, rawHeight:null };
const pumpChartLayout = {
  baseWidth: 640,
  baseHeight: 360,
  aspect: 360 / 640
};
let pumpOverlayNode = null;
let pumpOverlayEscapeHandler = null;
let pumpLayoutResizeListener = null;
let pumpLayoutResizeRaf = null;
let pumpNotesModalNode = null;
let pumpNotesModalDialog = null;
let pumpNotesModalState = null;
let pumpNotesEscHandler = null;

function pumpNormalizeTimeValue(timeValue, fallback){
  const fallbackValue = typeof fallback === "string" ? fallback : "";
  if (timeValue instanceof Date){
    const hrs = String(timeValue.getHours()).padStart(2, "0");
    const mins = String(timeValue.getMinutes()).padStart(2, "0");
    return `${hrs}:${mins}`;
  }
  if (typeof timeValue === "number" && Number.isFinite(timeValue)){
    return pumpNormalizeTimeValue(new Date(timeValue), fallbackValue || PUMP_DEFAULT_MEASUREMENT_TIME);
  }
  const raw = String(timeValue ?? "").trim();
  if (!raw){
    return fallbackValue || "";
  }
  const match = raw.match(/^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?$/);
  if (!match){
    return fallbackValue || "";
  }
  const hours = Number(match[1]);
  let minutes = match[2] != null ? Number(match[2]) : 0;
  if (!Number.isFinite(hours) || hours < 0 || hours > 23){
    return fallbackValue || "";
  }
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59){
    minutes = 0;
  }
  const hrs = String(hours).padStart(2, "0");
  const mins = String(minutes).padStart(2, "0");
  return `${hrs}:${mins}`;
}

function pumpEnsureEntryTime(entry){
  if (!entry || typeof entry !== "object") return entry;
  const existing = entry.timeISO ?? entry.time ?? entry.loggedTime ?? "";
  const normalized = pumpNormalizeTimeValue(existing, "");
  entry.timeISO = normalized || PUMP_DEFAULT_MEASUREMENT_TIME;
  return entry;
}

function pumpEnsureEntriesArray(){
  if (!window.pumpEff || typeof window.pumpEff !== "object"){
    window.pumpEff = { baselineRPM:null, baselineDateISO:null, entries:[], notes:[] };
  }
  if (!Array.isArray(window.pumpEff.entries)) window.pumpEff.entries = [];
  window.pumpEff.entries.forEach(pumpEnsureEntryTime);
  return window.pumpEff.entries;
}

function pumpGetEntryTimeISO(entry){
  if (!entry || typeof entry !== "object") return "";
  pumpEnsureEntryTime(entry);
  return entry.timeISO || "";
}

function pumpCompareEntriesDesc(a, b){
  const dateA = (a && a.dateISO) || "";
  const dateB = (b && b.dateISO) || "";
  if (dateA === dateB){
    const timeA = pumpGetEntryTimeISO(a);
    const timeB = pumpGetEntryTimeISO(b);
    return timeB.localeCompare(timeA);
  }
  return dateB.localeCompare(dateA);
}

function pumpGetRecentEntries(limit = 5){
  const entries = pumpEnsureEntriesArray().slice().sort(pumpCompareEntriesDesc);
  if (!isFinite(limit) || limit <= 0) return entries;
  return entries.slice(0, limit);
}

function pumpSetEditingDate(dateISO){
  pumpEditingDateISO = dateISO || null;
  if (typeof window !== "undefined"){
    window.pumpEditingDateISO = pumpEditingDateISO;
  }
}

function pumpFormatTimeLabel(timeISO){
  const normalized = pumpNormalizeTimeValue(timeISO, "");
  if (!normalized){
    return "";
  }
  const parsed = new Date(`1970-01-01T${normalized}:00`);
  if (!Number.isFinite(parsed.getTime())){
    return normalized;
  }
  return parsed.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function pumpFormatDateWithTimeLabel(dateISO, timeISO){
  if (!dateISO){
    return "";
  }
  const normalizedTime = pumpNormalizeTimeValue(timeISO, PUMP_DEFAULT_MEASUREMENT_TIME);
  const isoString = `${dateISO}T${normalizedTime}:00`;
  const parsed = new Date(isoString);
  if (Number.isFinite(parsed.getTime())){
    return parsed.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }
  return pumpFormatShortDate(dateISO);
}

function pumpFormatEntryTime(entry){
  const iso = pumpGetEntryTimeISO(entry);
  return iso ? pumpFormatTimeLabel(iso) : "";
}

function pumpFormatTimeForInput(date){
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())){
    return PUMP_DEFAULT_MEASUREMENT_TIME;
  }
  const hrs = String(date.getHours()).padStart(2, "0");
  const mins = String(date.getMinutes()).padStart(2, "0");
  return `${hrs}:${mins}`;
}

pumpEnsureEntriesArray();

function pumpGetViewportScale(){
  if (window.visualViewport && typeof window.visualViewport.scale === "number"){
    const scale = window.visualViewport.scale;
    if (isFinite(scale) && scale > 0) return scale;
  }
  if (typeof window.devicePixelRatio === "number" && isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0){
    return window.devicePixelRatio;
  }
  return 1;
}

function pumpGetResponsiveZoomFactor(){
  const raw = pumpGetViewportScale();
  if (!isFinite(raw) || raw <= 0) return 1;
  if (raw < 1) return Math.max(0.5, raw);
  return 1;
}

function pumpComputeFontScale(canvasWidth){
  const factor = pumpGetResponsiveZoomFactor();
  pumpViewportState.lastResponsiveScale = factor;
  let widthFactor = 1;
  if (isFinite(canvasWidth) && canvasWidth > 0){
    const base = pumpChartLayout.baseWidth && pumpChartLayout.baseWidth > 0 ? pumpChartLayout.baseWidth : canvasWidth;
    const ratio = base > 0 ? (canvasWidth / base) : 1;
    const clamped = Math.max(0.75, Math.min(ratio, 1.5));
    widthFactor = Math.pow(clamped, 0.35);
  }
  return PUMP_BASE_FONT_SCALE * widthFactor * factor;
}

function ensurePumpViewportWatcher(){
  if (pumpViewportState.bound) return;
  pumpViewportState.bound = true;
  pumpViewportState.lastResponsiveScale = pumpGetResponsiveZoomFactor();
  const handle = ()=>{
    const next = pumpGetResponsiveZoomFactor();
    if (!isFinite(next)) return;
    if (Math.abs(next - pumpViewportState.lastResponsiveScale) < 0.01) return;
    pumpViewportState.lastResponsiveScale = next;
    const canvas = document.getElementById("pumpChart");
    if (canvas){
      const dims = pumpResizeCanvas(canvas);
      if (window.pumpChartExpanded){
        const card = canvas.closest(".pump-chart-card");
        pumpApplyExpandedCardSizing(card, dims);
      }
      drawPumpChart(canvas, window.pumpChartRange);
    }
  };
  if (window.visualViewport){
    window.visualViewport.addEventListener("resize", handle, { passive: true });
  }
  window.addEventListener("resize", handle);
}

function pumpScheduleLayoutSync(){
  if (pumpLayoutResizeRaf != null){
    return;
  }
  pumpLayoutResizeRaf = requestAnimationFrame(()=>{
    pumpLayoutResizeRaf = null;
    const canvas = document.getElementById("pumpChart");
    if (!canvas) return;
    const dims = pumpResizeCanvas(canvas);
    if (window.pumpChartExpanded){
      const card = canvas.closest(".pump-chart-card");
      pumpApplyExpandedCardSizing(card, dims);
    }
    drawPumpChart(canvas, window.pumpChartRange);
  });
}

function ensurePumpLayoutResizeListener(){
  if (pumpLayoutResizeListener || typeof window === "undefined") return;
  pumpLayoutResizeListener = (event)=>{
    const detail = event?.detail;
    if (!detail) return;
    const area = detail.area ? String(detail.area) : "";
    if (area && area !== "dashboard") return;
    const id = String(detail.id || "");
    if (id !== "pumpChart") return;
    pumpScheduleLayoutSync();
  };
  window.addEventListener("layoutWindowResized", pumpLayoutResizeListener);
}

function pumpUpdateBaseChartSize(width, height){
  if (isFinite(width) && width > 0) pumpChartLayout.baseWidth = width;
  if (isFinite(height) && height > 0) pumpChartLayout.baseHeight = height;
  if (isFinite(width) && width > 0 && isFinite(height) && height > 0){
    const ratio = height / width;
    pumpChartLayout.aspect = Math.max(0.45, Math.min(ratio, 1.25));
  }
}

function pumpDisconnectLayoutObserver(){
  if (pumpLayoutObserver){
    pumpLayoutObserver.disconnect();
    pumpLayoutObserver = null;
  }
  pumpObservedWrap = null;
  pumpObservedCanvas = null;
  pumpObservedSize.width = null;
  pumpObservedSize.height = null;
  pumpObservedSize.rawWidth = null;
  pumpObservedSize.rawHeight = null;
}

function pumpEnsureLayoutObserver(wrap, canvas){
  pumpObservedCanvas = canvas || null;
  if (!window.ResizeObserver){
    return;
  }
  if (!wrap || !canvas){
    pumpDisconnectLayoutObserver();
    return;
  }
  if (pumpObservedWrap === wrap && pumpObservedCanvas === canvas) return;
  pumpDisconnectLayoutObserver();
  pumpLayoutObserver = new ResizeObserver((entries)=>{
    if (!pumpObservedCanvas) return;
    entries.forEach(entry => {
      if (!entry || entry.target !== pumpObservedWrap) return;
      const rawWidth = typeof entry.contentRect?.width === "number" ? entry.contentRect.width : null;
      const rawHeight = typeof entry.contentRect?.height === "number" ? entry.contentRect.height : null;
      requestAnimationFrame(()=>{
        if (!pumpObservedCanvas) return;
        const dims = pumpResizeCanvas(pumpObservedCanvas, { wrapWidth: rawWidth, wrapHeight: rawHeight });
        if (!dims) return;
        const sizeChanged = pumpObservedSize.width !== dims.width || pumpObservedSize.height !== dims.height;
        const rawWidthChanged = rawWidth != null && (typeof pumpObservedSize.rawWidth !== "number" || Math.abs(pumpObservedSize.rawWidth - rawWidth) > 0.25);
        const rawHeightChanged = rawHeight != null && (typeof pumpObservedSize.rawHeight !== "number" || Math.abs(pumpObservedSize.rawHeight - rawHeight) > 0.25);
        if (!sizeChanged && !rawWidthChanged && !rawHeightChanged) return;
        pumpObservedSize.width = dims.width;
        pumpObservedSize.height = dims.height;
        pumpObservedSize.rawWidth = rawWidth != null ? rawWidth : pumpObservedSize.rawWidth;
        pumpObservedSize.rawHeight = rawHeight != null ? rawHeight : pumpObservedSize.rawHeight;
        if (window.pumpChartExpanded){
          const card = pumpObservedCanvas.closest(".pump-chart-card");
          pumpApplyExpandedCardSizing(card, dims);
        }
        drawPumpChart(pumpObservedCanvas, window.pumpChartRange);
      });
    });
  });
  pumpLayoutObserver.observe(wrap);
  pumpObservedWrap = wrap;
}

function pumpComputeExpandedCardBounds(canvasDims){
  if (!canvasDims) return null;
  const viewportW = window.innerWidth || document.documentElement?.clientWidth || canvasDims.width;
  const viewportH = window.innerHeight || document.documentElement?.clientHeight || canvasDims.height;
  const horizontalPadding = 72;
  const viewportWidthLimit = Math.max(360, viewportW - 48);
  const desiredCardWidth = Math.max(canvasDims.width + horizontalPadding, pumpChartLayout.baseWidth + horizontalPadding + 48);
  const cardWidth = Math.min(viewportWidthLimit, desiredCardWidth);
  const verticalPadding = 132;
  const viewportHeightLimit = Math.max(360, viewportH - 48);
  const desiredCardHeight = Math.min(viewportHeightLimit, canvasDims.height + verticalPadding);
  return {
    width: Math.round(cardWidth),
    maxWidth: Math.round(viewportWidthLimit),
    maxHeight: Math.round(desiredCardHeight)
  };
}

function pumpApplyExpandedCardSizing(card, canvasDims){
  if (!card) return;
  const bounds = pumpComputeExpandedCardBounds(canvasDims);
  if (!bounds) return;
  card.style.maxWidth = `${bounds.maxWidth}px`;
  card.style.width = `${bounds.width}px`;
  card.style.maxHeight = `${bounds.maxHeight}px`;
  card.style.height = "auto";
}

function pumpComputeCanvasSize(canvas, overrides){
  const opts = overrides || {};
  const expanded = window.pumpChartExpanded === true;
  const baseWidth = Math.max(1, pumpChartLayout.baseWidth || 0);
  const baseHeight = Math.max(1, pumpChartLayout.baseHeight || 0);
  const aspect = pumpChartLayout.aspect || (baseHeight / Math.max(baseWidth, 1)) || 0.65;
  let width;
  let height;
  if (expanded){
    const viewportW = window.innerWidth || document.documentElement?.clientWidth || (baseWidth * 1.35);
    const viewportH = window.innerHeight || document.documentElement?.clientHeight || (baseHeight * 1.35);
    const horizontalPadding = 72;
    const viewportWidthLimit = Math.max(360, viewportW - 48);
    const desiredCardWidth = Math.max(
      baseWidth * 1.4 + horizontalPadding,
      baseWidth + horizontalPadding + 96,
      540
    );
    const cardWidth = Math.min(viewportWidthLimit, Math.max(desiredCardWidth, baseWidth + horizontalPadding + 48));
    width = Math.max(320, Math.round(cardWidth - horizontalPadding));
    const viewportHeightLimit = Math.max(360, viewportH - 48);
    const verticalPadding = 132;
    const maxCanvasHeight = Math.max(280, viewportHeightLimit - verticalPadding);
    height = Math.round(width * aspect);
    if (height > maxCanvasHeight){
      height = Math.round(maxCanvasHeight);
      width = Math.max(320, Math.round(height / aspect));
      if (width + horizontalPadding > viewportWidthLimit){
        width = Math.max(320, Math.round(viewportWidthLimit - horizontalPadding));
      }
    }
    if (width + horizontalPadding > viewportWidthLimit){
      width = Math.max(320, Math.round(viewportWidthLimit - horizontalPadding));
      height = Math.round(width * aspect);
    }
  }else{
    const wrapWidth = typeof opts.wrapWidth === "number" && isFinite(opts.wrapWidth) ? opts.wrapWidth : null;
    if (wrapWidth != null && wrapWidth > 0){
      width = wrapWidth;
    }else{
      const wrap = canvas ? canvas.closest(".pump-chart-wrap") : null;
      const rect = wrap ? wrap.getBoundingClientRect() : null;
      width = rect && rect.width ? rect.width : baseWidth;
    }
    width = Math.max(320, Math.round(width));
    height = Math.round(width * aspect);
    height = Math.max(240, height);
    const wrapHeight = typeof opts.wrapHeight === "number" && isFinite(opts.wrapHeight) ? opts.wrapHeight : null;
    if (wrapHeight != null && wrapHeight > 0){
      const boundedHeight = Math.max(240, Math.round(wrapHeight));
      if (boundedHeight < height){
        height = boundedHeight;
        width = Math.max(320, Math.round(height / aspect));
      }
    }
  }
  return { width: Math.round(width), height: Math.round(height) };
}

function pumpResizeCanvas(canvas, overrides){
  if (!canvas) return null;
  const dims = pumpComputeCanvasSize(canvas, overrides);
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = Math.round(dims.width);
  const cssHeight = Math.round(dims.height);
  if (canvas.style.width !== `${cssWidth}px`) canvas.style.width = `${cssWidth}px`;
  if (canvas.style.height !== `${cssHeight}px`) canvas.style.height = `${cssHeight}px`;
  const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const opts = overrides || {};
  if (!window.pumpChartExpanded && opts.skipBaseUpdate !== true){
    pumpUpdateBaseChartSize(cssWidth, cssHeight);
  }
  return { width: cssWidth, height: cssHeight };
}

function pumpDestroyOverlay(){
  if (pumpOverlayNode){
    pumpOverlayNode.remove();
    pumpOverlayNode = null;
  }
  if (pumpOverlayEscapeHandler){
    document.removeEventListener("keydown", pumpOverlayEscapeHandler);
    pumpOverlayEscapeHandler = null;
  }
  document.querySelectorAll('[data-pump-placeholder]').forEach(el => el.remove());
  document.body.classList.remove("pump-chart-expanded");
}

function pumpMountOverlay(card){
  if (!card) return;
  const parent = card.parentElement;
  if (parent){
    const placeholder = document.createElement("div");
    placeholder.setAttribute("data-pump-placeholder", "true");
    const phHeight = card.getBoundingClientRect?.().height || card.offsetHeight || 0;
    if (phHeight > 0) placeholder.style.height = `${Math.round(phHeight)}px`;
    parent.insertBefore(placeholder, card.nextSibling);
  }
  pumpOverlayNode = document.createElement("div");
  pumpOverlayNode.className = "pump-chart-overlay";
  pumpOverlayNode.setAttribute("data-pump-overlay", "true");
  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "pump-chart-backdrop";
  backdrop.setAttribute("aria-label", "Close expanded pump chart");
  pumpOverlayNode.appendChild(backdrop);
  card.classList.add("pump-chart-card-expanded");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("tabindex", "-1");
  pumpOverlayNode.appendChild(card);
  document.body.appendChild(pumpOverlayNode);
  document.body.classList.add("pump-chart-expanded");
  const canvas = card.querySelector("#pumpChart");
  const dims = pumpResizeCanvas(canvas);
  pumpApplyExpandedCardSizing(card, dims);
  const close = ()=>{ window.pumpChartExpanded = false; renderPumpWidget(); };
  backdrop.addEventListener("click", close);
  pumpOverlayEscapeHandler = (event)=>{
    if (event.key === "Escape" || event.key === "Esc"){
      event.preventDefault();
      close();
    }
  };
  document.addEventListener("keydown", pumpOverlayEscapeHandler);
  requestAnimationFrame(()=>{ card.focus(); });
}

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

function pumpSubtractMonths(date, months){
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const anchor = new Date(year, month, 1);
  anchor.setMonth(anchor.getMonth() - months);
  const maxDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  anchor.setDate(Math.min(day, maxDay));
  return anchor;
}

function upsertPumpEntry(dateISO, rpm, timeValue){
  const d = String(dateISO);
  const r = Number(rpm);
  if (!d || !isFinite(r) || r <= 0) return false;
  const timeISO = pumpNormalizeTimeValue(timeValue, PUMP_DEFAULT_MEASUREMENT_TIME) || PUMP_DEFAULT_MEASUREMENT_TIME;
  const i = pumpEff.entries.findIndex(e => e && e.dateISO === d);
  if (i >= 0){
    const existing = pumpEff.entries[i] || {};
    pumpEff.entries[i] = { ...existing, dateISO: d, rpm: r, timeISO };
  }else{
    pumpEff.entries.push({ dateISO: d, rpm: r, timeISO });
  }
  pumpEff.entries.forEach(pumpEnsureEntryTime);
  pumpEff.entries.sort((a,b)=> a.dateISO.localeCompare(b.dateISO));
  return true;
}
function pumpLatest(){ return pumpEff.entries.length ? pumpEff.entries[pumpEff.entries.length-1] : null; }
function pumpPercentChange(latestRPM){
  if (!pumpEff.baselineRPM || !isFinite(latestRPM)) return null;
  return ((latestRPM - pumpEff.baselineRPM) / pumpEff.baselineRPM) * 100;
}
const PUMP_DELTA_CLASS_COLORS = {
  "green": "#2e7d32",
  "green-better": "#1b5e20",
  "yellow": "#8a6d00",
  "orange": "#a14d00",
  "red": "#c62828",
  "gray": "#6b7280"
};
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
    case "1w":
      cutoff.setTime(cutoff.getTime() - 7 * DAY_MS);
      break;
    case "1m": return pumpSubtractMonths(latestDate, 1);
    case "3m": return pumpSubtractMonths(latestDate, 3);
    case "6m": return pumpSubtractMonths(latestDate, 6);
    case "1y": return pumpSubtractMonths(latestDate, 12);
    default: return pumpSubtractMonths(latestDate, 3);
  }
  return cutoff;
}

function pumpEnsureNotesArray(){
  pumpEnsureEntriesArray();
  if (!Array.isArray(window.pumpEff.notes)) window.pumpEff.notes = [];
  return window.pumpEff.notes;
}

function pumpSortNotesInPlace(notes){
  if (!Array.isArray(notes)) return notes;
  notes.sort((a, b)=>{
    const updatedA = a?.updatedISO || "";
    const updatedB = b?.updatedISO || "";
    if (updatedA !== updatedB){
      if (!updatedA) return 1;
      if (!updatedB) return -1;
      const cmp = updatedB.localeCompare(updatedA);
      if (cmp !== 0) return cmp;
    }
    const dateA = a?.dateISO || "";
    const dateB = b?.dateISO || "";
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    const rangeA = String(a?.range ?? "");
    const rangeB = String(b?.range ?? "");
    if (rangeA !== rangeB) return rangeA.localeCompare(rangeB);
    return 0;
  });
  return notes;
}

function pumpGetNotesSorted(){
  const notes = pumpEnsureNotesArray().slice();
  pumpSortNotesInPlace(notes);
  return notes;
}

function pumpGetNotesForRange(rangeValue){
  const range = String(rangeValue ?? "");
  return pumpEnsureNotesArray().filter(note => note && String(note.range ?? "") === range);
}

function pumpFindNote(dateISO, rangeValue){
  const range = String(rangeValue ?? "");
  return pumpEnsureNotesArray().find(note => note && note.dateISO === dateISO && String(note.range ?? "") === range) || null;
}

function pumpFormatRangeDisplay(rangeValue){
  const range = String(rangeValue ?? "");
  if (!range) return "Current range";
  const label = pumpRangeLabel(range);
  if (!label) return range;
  if (label === range) return label;
  return `Last ${label}`;
}

function pumpSaveNote(dateISO, rangeValue, text){
  const notes = pumpEnsureNotesArray();
  const range = String(rangeValue ?? "");
  const idx = notes.findIndex(note => note && note.dateISO === dateISO && String(note.range ?? "") === range);
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed){
    if (idx >= 0){
      const removed = notes.splice(idx, 1);
      return { status:"deleted", note: removed[0] || null };
    }
    return { status:"noop", note:null };
  }
  const nowISO = new Date().toISOString();
  if (idx >= 0){
    const existing = notes[idx] || {};
    notes[idx] = { ...existing, dateISO, range, text: trimmed, updatedISO: nowISO };
    pumpSortNotesInPlace(notes);
    return { status:"updated", note: notes[idx] };
  }
  const note = {
    id: `note_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    dateISO,
    range,
    text: trimmed,
    updatedISO: nowISO
  };
  notes.push(note);
  pumpSortNotesInPlace(notes);
  return { status:"created", note };
}

function pumpDeleteNote(dateISO, rangeValue){
  return pumpSaveNote(dateISO, rangeValue, "");
}

function pumpCountNotes(){
  return pumpEnsureNotesArray().length;
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
  if (unitCap && unitCap > 0){
    const divisions = unitCap > 1 ? unitCap - 1 : 1;
    const span = endTime - startTime;
    let prevTime = null;
    for (let i = 0; i < unitCap; i++){
      const ratio = divisions ? (i / divisions) : 0;
      let time;
      if (i === 0) time = startTime;
      else if (i === unitCap - 1) time = endTime;
      else {
        time = Math.round(startTime + span * ratio);
        if (time <= startTime) time = startTime + 1;
        if (time >= endTime) time = endTime - 1;
      }
      if (prevTime != null && time <= prevTime) time = Math.min(endTime, prevTime + 1);
      const date = new Date(time);
      const info = pumpTickLabel(range, i, date, startDate, endDate, i === unitCap - 1);
      ticks.push({ time, label: info.label, subLabel: info.subLabel });
      prevTime = time;
    }
    return ticks;
  }
  const startInfo = pumpTickLabel(range, 0, startDate, startDate, endDate, false);
  ticks.push({ time: startTime, label: startInfo.label, subLabel: startInfo.subLabel });
  const endInfo = pumpTickLabel(range, 1, endDate, startDate, endDate, true);
  ticks.push({ time: endTime, label: endInfo.label, subLabel: endInfo.subLabel });
  return ticks;
}

function pumpBuildRpmTicks(minValue, maxValue){
  const ticks = [];
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return ticks;
  let min = minValue;
  let max = maxValue;
  if (min === max){
    const val = Number.isFinite(min) ? min : 0;
    const label = Number(val).toLocaleString(undefined, { maximumFractionDigits: 0 });
    return [{ value: val, label, decimals: 0 }];
  }
  if (min > max){
    const swap = min;
    min = max;
    max = swap;
  }
  const span = max - min;
  const desiredTicks = 6;
  const roughStep = span / Math.max(1, desiredTicks - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(roughStep, 1e-6))));
  const bases = [1, 2, 2.5, 5, 10];
  let niceStep = magnitude;
  for (let i = 0; i < bases.length; i++){
    const candidate = bases[i] * magnitude;
    niceStep = candidate;
    if (roughStep <= candidate){
      break;
    }
  }
  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;
  const decimals = niceStep < 1 ? Math.min(3, Math.max(0, Math.round(-Math.log10(niceStep)))) : 0;
  let value = niceMin;
  let guard = 0;
  while (value <= niceMax + niceStep * 0.5 && guard < 64){
    const fixed = Number(value.toFixed(Math.max(decimals, 0)));
    const label = Number(fixed).toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
    ticks.push({ value: fixed, label, decimals });
    value += niceStep;
    guard++;
  }
  return ticks;
}

function pumpSummarizeEntries(entries){
  if (!Array.isArray(entries) || !entries.length) return null;
  let minEntry = null;
  let maxEntry = null;
  let total = 0;
  let count = 0;
  entries.forEach(entry => {
    if (!entry) return;
    const rpm = Number(entry.rpm);
    if (!Number.isFinite(rpm)) return;
    if (!minEntry || rpm < minEntry.rpm){
      minEntry = { dateISO: entry.dateISO, rpm };
    }
    if (!maxEntry || rpm > maxEntry.rpm){
      maxEntry = { dateISO: entry.dateISO, rpm };
    }
    total += rpm;
    count++;
  });
  if (!count) return null;
  const avgRpm = total / count;
  return { minEntry, maxEntry, avgRpm, count };
}

function pumpFormatShortDate(dateISO){
  if (!dateISO) return "";
  const parsed = new Date(`${dateISO}T00:00:00`);
  if (!parsed || !isFinite(parsed.getTime())) return String(dateISO);
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function pumpRoundedRectPath(ctx, x, y, width, height, radius){
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function viewPumpLogWidget(){
  pumpEnsureEntriesArray();
  const latest = pumpLatest();
  const pct    = latest ? pumpPercentChange(latest.rpm) : null;
  const col    = pumpColorFor(pct);
  const baselineVal = pumpEff.baselineRPM ?? "";
  const todayISO    = new Date().toISOString().slice(0,10);
  const nowTime     = pumpFormatTimeForInput(new Date());
  const editingEntry = pumpEditingDateISO ? pumpEff.entries.find(e => e && e.dateISO === pumpEditingDateISO) || null : null;
  const logDateValue = editingEntry ? editingEntry.dateISO : todayISO;
  const logTimeValue = editingEntry ? pumpGetEntryTimeISO(editingEntry) || nowTime : nowTime;
  const logRpmValue = editingEntry && Number.isFinite(editingEntry.rpm) ? editingEntry.rpm : "";
  const logCtaLabel = editingEntry ? "Save changes" : "Add / Update";
  const editingLabel = editingEntry
    ? `Editing log for ${pumpFormatShortDate(editingEntry.dateISO)}${pumpFormatEntryTime(editingEntry) ? ` at ${pumpFormatEntryTime(editingEntry)}` : ""}`
    : "";
  const latestDateTimeLabel = latest ? pumpFormatDateWithTimeLabel(latest.dateISO, pumpGetEntryTimeISO(latest)) : "";
  const latestTxt   = latest ? `${latest.rpm} RPM (${latestDateTimeLabel || latest.dateISO})` : "—";
  const recentEntries = pumpGetRecentEntries(5);
  const recentList = recentEntries.length
    ? `<ul class="pump-log-list">${recentEntries.map(entry => {
        const timeLabel = pumpFormatEntryTime(entry);
        const dateLabel = pumpFormatShortDate(entry.dateISO);
        const rpmLabel = Number.isFinite(entry.rpm) ? `${Number(entry.rpm).toLocaleString()} RPM` : "—";
        const detail = [dateLabel, timeLabel].filter(Boolean).join(" · ");
        return [
          `<li class="pump-log-item">`,
            `<div class="pump-log-item-meta">${pumpEscapeTooltipValue(detail)}</div>`,
            `<div class="pump-log-item-main">`,
              `<span class="pump-log-rpm">${pumpEscapeTooltipValue(rpmLabel)}</span>`,
              `<button type="button" class="pump-log-edit-btn" data-pump-edit-date="${entry.dateISO}">Edit</button>`,
            `</div>`,
          `</li>`
        ].join("");
      }).join("")}</ul>`
    : `<div class="pump-log-empty">No pump logs yet to edit.</div>`;
  return `
  <details class="pump-card" open>
    <summary><b>Pump Efficiency</b> <span class="chip ${col.cls}">${col.label}</span></summary>
    <div class="pump-log-panel">
      <div class="pump-log-section">
        <h4>Baseline @ 49 ksi</h4>
        <form id="pumpBaselineForm" class="mini-form">
          <input type="number" id="pumpBaselineRPM" min="1" step="1" placeholder="RPM" value="${baselineVal}">
          <button type="submit">Set baseline (today)</button>
        </form>
        <div class="small muted">Lower RPM = better. Baseline is recorded after a major/minor rebuild.</div>
      </div>
      <div class="pump-log-section">
        <h4>Daily log</h4>
        ${editingEntry ? `<div class="pump-editing-banner">${pumpEscapeTooltipValue(editingLabel)}<button type="button" class="pump-edit-cancel" data-pump-edit-cancel aria-label="Cancel editing pump log">Cancel</button></div>` : ""}
        <form id="pumpLogForm" class="mini-form">
          <input type="date" id="pumpLogDate" value="${logDateValue}" required>
          <input type="time" id="pumpLogTime" value="${logTimeValue}" required>
          <input type="number" id="pumpLogRPM" min="1" step="1" placeholder="RPM at 49 ksi" value="${logRpmValue}" required>
          <button type="submit">${logCtaLabel}</button>
        </form>
      </div>
      <div class="pump-log-section pump-log-history">
        <div class="pump-log-history-header">
          <h4>Recent logs</h4>
          <p class="small muted">Tap edit to fix a mistyped RPM without losing history.</p>
        </div>
        ${recentList}
      </div>
      <div class="pump-stats">
        <div><span class="lbl">Baseline:</span> <span>${pumpEff.baselineRPM ? `${pumpEff.baselineRPM} RPM (${pumpEff.baselineDateISO || "—"})` : "—"}</span></div>
        <div><span class="lbl">Latest:</span> <span>${latestTxt}</span></div>
      </div>
    </div>
  </details>`;
}
function viewPumpChartWidget(){
  const rangeValue  = window.pumpChartRange || "3m";
  const rangeOptions = PUMP_RANGE_OPTIONS.map(opt => `<option value="${opt.value}" ${opt.value===rangeValue?"selected":""}>Last ${opt.label}</option>`).join("");
  const expanded = window.pumpChartExpanded === true;
  const expandLabel = expanded ? "Shrink" : "Expand";
  const expandIcon = expanded ? "⤡" : "⤢";
  const noteCount = pumpCountNotes();
  const notesLabel = noteCount ? `📝 Notes (${noteCount})` : "📝 Notes";
  const notesAria = noteCount ? `View pump notes (${noteCount})` : "View pump notes";
  return `
  <div class="pump-chart-card">
    <div class="pump-chart-header">
      <h3>Pump Efficiency Trend</h3>
      <div class="pump-chart-toolbar small muted">
        <label for="pumpRange">Timeframe:</label>
        <select id="pumpRange">${rangeOptions}</select>
      </div>
    </div>
    <div class="pump-chart-wrap">
      <button type="button" class="pump-notes-btn" id="pumpNotesBtn" aria-haspopup="dialog" title="${notesAria}" aria-label="${notesAria}">${notesLabel}</button>
      <canvas id="pumpChart" height="${expanded ? 360 : 240}"></canvas>
      <button type="button" class="pump-expand-btn" data-expanded="${expanded}" title="${expandLabel} chart">${expandIcon} ${expandLabel}</button>
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
  `;
}
function renderPumpWidget(){
  pumpDestroyOverlay();
  pumpDisconnectLayoutObserver();
  const logHost = document.getElementById("pump-log-widget");
  if (logHost) logHost.innerHTML = viewPumpLogWidget();
  const chartHost = document.getElementById("pump-chart-widget");
  if (chartHost) chartHost.innerHTML = viewPumpChartWidget();
  pumpEnsureNotesArray();
  if (!logHost && !chartHost) return;
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
    const t   = document.getElementById("pumpLogTime")?.value;
    const rpm = Number(document.getElementById("pumpLogRPM").value);
    if (!d || !isFinite(rpm) || rpm <= 0) { toast("Enter date and valid RPM."); return; }
    const saved = upsertPumpEntry(d, rpm, t);
    if (!saved){ toast("Enter date and valid RPM."); return; }
    pumpSetEditingDate(null);
    saveCloudDebounced(); toast("Log saved"); renderPumpWidget();
  });
  document.querySelectorAll("[data-pump-edit-date]").forEach(btn => {
    btn.addEventListener("click", ()=>{
      const dateISO = btn.getAttribute("data-pump-edit-date") || "";
      if (!dateISO) return;
      pumpSetEditingDate(dateISO);
      renderPumpWidget();
    });
  });
  document.querySelector("[data-pump-edit-cancel]")?.addEventListener("click", ()=>{
    pumpSetEditingDate(null);
    renderPumpWidget();
  });
  const card = chartHost?.querySelector(".pump-chart-card");
  ensurePumpViewportWatcher();
  ensurePumpLayoutResizeListener();
  const rangeSelect = document.getElementById("pumpRange");
  if (rangeSelect){
    if (rangeSelect.value !== window.pumpChartRange) rangeSelect.value = window.pumpChartRange;
    rangeSelect.addEventListener("change", (e)=>{
      window.pumpChartRange = e.target.value;
      const currentCanvas = document.getElementById("pumpChart");
      if (currentCanvas){
        const dims = pumpResizeCanvas(currentCanvas);
        if (window.pumpChartExpanded){
          const currentCard = currentCanvas.closest(".pump-chart-card");
          pumpApplyExpandedCardSizing(currentCard, dims);
        }
        drawPumpChart(currentCanvas, window.pumpChartRange);
      }
    });
  }
  const expandBtn = chartHost?.querySelector(".pump-expand-btn");
  if (expandBtn){
    expandBtn.setAttribute("data-expanded", window.pumpChartExpanded ? "true" : "false");
    expandBtn.addEventListener("click", ()=>{
      window.pumpChartExpanded = !window.pumpChartExpanded;
      renderPumpWidget();
    });
  }
  const notesBtn = document.getElementById("pumpNotesBtn");
  if (notesBtn){
    notesBtn.addEventListener("click", ()=>{
      pumpOpenNotesModal({ view:"list" });
    });
  }
  if (window.pumpChartExpanded && card){
    pumpMountOverlay(card);
  }
  const activeCanvas = document.getElementById("pumpChart");
  const activeCard = activeCanvas?.closest(".pump-chart-card");
  const activeWrap = activeCard?.querySelector(".pump-chart-wrap");
  if (activeCanvas){
    const dims = pumpResizeCanvas(activeCanvas);
    if (window.pumpChartExpanded){
      pumpApplyExpandedCardSizing(activeCard, dims);
    }
    pumpEnsureLayoutObserver(activeWrap, activeCanvas);
    drawPumpChart(activeCanvas, window.pumpChartRange);
    pumpWireChartTooltip(activeCard, activeCanvas);
  }else{
    pumpDisconnectLayoutObserver();
  }
  if (typeof notifyDashboardLayoutContentChanged === "function"){
    notifyDashboardLayoutContentChanged();
  }
}

function pumpEscapeTooltipValue(value){
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c] || c);
}

function pumpEnsureTooltip(wrap){
  if (!wrap) return null;
  let tooltip = wrap.querySelector(".pump-chart-tooltip");
  if (!tooltip){
    tooltip = document.createElement("div");
    tooltip.className = "pump-chart-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    wrap.appendChild(tooltip);
  }
  return tooltip;
}

function pumpHideChartTooltip(canvas, tooltip){
  if (tooltip){
    tooltip.hidden = true;
    tooltip.style.visibility = "";
    tooltip.textContent = "";
    delete tooltip.dataset.visible;
    delete tooltip.dataset.placement;
  }
  if (canvas){
    canvas.style.cursor = "";
    delete canvas.__pumpChartHoveredKey;
  }
}

function pumpEnsureNotesModal(){
  if (pumpNotesModalNode) return;
  const overlay = document.createElement("div");
  overlay.className = "pump-notes-overlay";
  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "pump-notes-backdrop";
  backdrop.setAttribute("aria-label", "Close pump notes");
  const dialog = document.createElement("div");
  dialog.className = "pump-notes-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("tabindex", "-1");
  overlay.appendChild(backdrop);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  pumpNotesModalNode = overlay;
  pumpNotesModalDialog = dialog;
  backdrop.addEventListener("click", pumpCloseNotesModal);
}

function pumpOpenNotesModal(state){
  pumpEnsureNotesModal();
  if (!pumpNotesModalDialog) return;
  if (!pumpNotesEscHandler){
    pumpNotesEscHandler = (event)=>{
      if (event.key === "Escape" || event.key === "Esc"){
        event.preventDefault();
        pumpCloseNotesModal();
      }
    };
    document.addEventListener("keydown", pumpNotesEscHandler);
  }
  document.body.classList.add("pump-notes-open");
  pumpSetNotesModalState(state);
  requestAnimationFrame(()=>{
    if (!pumpNotesModalDialog) return;
    try {
      pumpNotesModalDialog.focus({ preventScroll:true });
    } catch (_) {
      pumpNotesModalDialog.focus();
    }
  });
}

function pumpSetNotesModalState(state){
  const base = state && typeof state === "object" ? state : {};
  const view = typeof base.view === "string" ? base.view : "list";
  pumpNotesModalState = { view };
  Object.keys(base).forEach(key => {
    if (key === "view") return;
    pumpNotesModalState[key] = base[key];
  });
  pumpRenderNotesModal();
}

function pumpRenderNotesModal(){
  if (!pumpNotesModalDialog) return;
  pumpEnsureNotesArray();
  const state = pumpNotesModalState || { view:"list" };
  const view = state.view === "edit" ? "edit" : "list";
  if (view === "edit"){
    const dateISO = state.dateISO || "";
    const rangeValue = state.range ?? window.pumpChartRange ?? "3m";
    const rangeDisplay = state.rangeDisplay || pumpFormatRangeDisplay(rangeValue);
    const note = dateISO ? pumpFindNote(dateISO, rangeValue) : null;
    const entry = dateISO ? pumpEff.entries.find(e => e && e.dateISO === dateISO) : null;
    const rpmSource = state.rpm != null ? state.rpm : (entry ? entry.rpm : null);
    const rpmLabel = Number.isFinite(Number(rpmSource)) ? `${Number(rpmSource).toLocaleString()} RPM` : "";
    const dateLabel = dateISO ? pumpFormatShortDate(dateISO) : "";
    const entryTimeISO = state.timeISO || (entry ? pumpGetEntryTimeISO(entry) : "");
    const timeLabel = entryTimeISO ? pumpFormatTimeLabel(entryTimeISO) : "";
    const headingId = "pumpNotesHeading";
    const descriptionId = "pumpNotesDescription";
    const subtitleParts = [];
    if (dateLabel) subtitleParts.push(`<span>${pumpEscapeTooltipValue(dateLabel)}</span>`);
    if (timeLabel) subtitleParts.push(`<span>${pumpEscapeTooltipValue(timeLabel)}</span>`);
    if (rangeDisplay) subtitleParts.push(`<span>${pumpEscapeTooltipValue(rangeDisplay)}</span>`);
    if (rpmLabel) subtitleParts.push(`<span>${pumpEscapeTooltipValue(rpmLabel)}</span>`);
    const subtitle = subtitleParts.length
      ? `<p class="pump-notes-subtitle">${subtitleParts.join('<span aria-hidden="true">·</span>')}</p>`
      : "";
    pumpNotesModalDialog.innerHTML = `
      <header class="pump-notes-header">
        <div class="pump-notes-title-group">
          <h3 id="${headingId}" data-pump-notes-heading>${note ? "Edit note" : "Add note"}</h3>
          ${subtitle}
        </div>
        <button type="button" class="pump-notes-close" data-pump-notes-close aria-label="Close notes">×</button>
      </header>
      <p class="pump-notes-description small muted" id="${descriptionId}">Notes stay tied to the selected date, range, and RPM so you can track how settings change performance.</p>
      <div class="pump-notes-body">
        <div class="pump-notes-links">
          <button type="button" class="pump-notes-link" data-pump-notes-show-list>View saved notes</button>
        </div>
        <form class="pump-notes-form" id="pumpNoteForm">
          <label class="pump-notes-label" for="pumpNoteText">Note details</label>
          <textarea id="pumpNoteText" rows="6" placeholder="Add context about pressures, filters, or other settings…"></textarea>
          <div class="pump-notes-actions">
            ${note ? `<button type="button" class="pump-note-delete-btn" data-pump-note-delete>Delete note</button>` : ""}
            <span class="pump-notes-actions-spacer"></span>
            <button type="button" class="secondary" data-pump-notes-cancel>Close</button>
            <button type="submit" class="primary">${note ? "Save note" : "Add note"}</button>
          </div>
        </form>
      </div>
      <footer class="pump-notes-footer small muted">Notes are stored per range selection so you can track how settings impact performance.</footer>
    `;
    pumpNotesModalDialog.setAttribute("aria-labelledby", headingId);
    pumpNotesModalDialog.setAttribute("aria-describedby", descriptionId);
    const closeBtn = pumpNotesModalDialog.querySelector("[data-pump-notes-close]");
    closeBtn?.addEventListener("click", pumpCloseNotesModal);
    const cancelBtn = pumpNotesModalDialog.querySelector("[data-pump-notes-cancel]");
    cancelBtn?.addEventListener("click", pumpCloseNotesModal);
    const listBtn = pumpNotesModalDialog.querySelector("[data-pump-notes-show-list]");
    listBtn?.addEventListener("click", ()=>{ pumpSetNotesModalState({ view:"list" }); });
    const form = pumpNotesModalDialog.querySelector("#pumpNoteForm");
    const textField = pumpNotesModalDialog.querySelector("#pumpNoteText");
    if (textField) textField.value = note?.text || "";
    form?.addEventListener("submit", (event)=>{
      event.preventDefault();
      if (!dateISO){ pumpCloseNotesModal(); return; }
      const value = textField ? textField.value : "";
      const { status } = pumpSaveNote(dateISO, rangeValue, value);
      pumpCloseNotesModal();
      if (typeof saveCloudDebounced === "function"){ try { saveCloudDebounced(); } catch(_){} }
      if (status === "deleted"){ toast("Note removed"); }
      else if (status === "noop"){ toast("Note cleared"); }
      else if (status === "created"){ toast("Note added"); }
      else { toast("Note saved"); }
      renderPumpWidget();
    });
    const deleteBtn = pumpNotesModalDialog.querySelector("[data-pump-note-delete]");
    if (deleteBtn){
      deleteBtn.addEventListener("click", ()=>{
        if (!dateISO){ pumpCloseNotesModal(); return; }
        const { status } = pumpDeleteNote(dateISO, rangeValue);
        pumpCloseNotesModal();
        if (status === "deleted"){ toast("Note removed"); }
        if (typeof saveCloudDebounced === "function"){ try { saveCloudDebounced(); } catch(_){} }
        renderPumpWidget();
      });
    }
    requestAnimationFrame(()=>{
      try {
        textField?.focus({ preventScroll:true });
      } catch (_) {
        textField?.focus();
      }
    });
  }else{
    const headingId = "pumpNotesHeading";
    const descriptionId = "pumpNotesDescription";
    const notes = pumpGetNotesSorted();
    const items = notes.map(note => {
      const dateLabel = pumpFormatShortDate(note.dateISO);
      const rangeDisplay = pumpFormatRangeDisplay(note.range);
      const entryForNote = pumpEff.entries.find(entry => entry && entry.dateISO === note.dateISO) || null;
      const timeLabel = entryForNote ? pumpFormatTimeLabel(pumpGetEntryTimeISO(entryForNote)) : "";
      let updatedLabel = "";
      if (note.updatedISO){
        const parsed = new Date(note.updatedISO);
        updatedLabel = Number.isFinite(parsed.getTime())
          ? parsed.toLocaleString()
          : String(note.updatedISO);
      }
      const textHtml = pumpEscapeTooltipValue(note.text || "").replace(/\n/g, "<br>");
      const metaParts = [
        `<span class="pump-note-date">${pumpEscapeTooltipValue(dateLabel)}</span>`,
        timeLabel ? `<span class="pump-note-time">${pumpEscapeTooltipValue(`Logged ${timeLabel}`)}</span>` : "",
        `<span class="pump-note-range">${pumpEscapeTooltipValue(rangeDisplay)}</span>`
      ];
      if (updatedLabel){
        metaParts.push(`<span class="pump-note-updated">Updated ${pumpEscapeTooltipValue(updatedLabel)}</span>`);
      }
      return `
        <article class="pump-note-item">
          <div class="pump-note-item-meta">${metaParts.join("")}</div>
          <div class="pump-note-text">${textHtml}</div>
          <div class="pump-note-item-actions">
            <button type="button" class="pump-note-edit-btn" data-pump-note-edit data-note-date="${note.dateISO}" data-note-range="${note.range}">Edit</button>
          </div>
        </article>
      `;
    }).join("");
    pumpNotesModalDialog.innerHTML = `
      <header class="pump-notes-header">
        <h3 id="${headingId}" data-pump-notes-heading>Pump notes</h3>
        <button type="button" class="pump-notes-close" data-pump-notes-close aria-label="Close notes">×</button>
      </header>
      <p class="pump-notes-description small muted" id="${descriptionId}">Each note keeps the day, range, and RPM that were active when it was created.</p>
      <div class="pump-notes-body">
        ${notes.length ? `<div class="pump-notes-list">${items}</div>` : `<p class="pump-notes-empty">No notes yet. Click a chart point to add a note for that day and range.</p>`}
      </div>
      <footer class="pump-notes-footer small muted">Notes are labelled with the day and chart range so you can see which settings were active.</footer>
    `;
    pumpNotesModalDialog.setAttribute("aria-labelledby", headingId);
    pumpNotesModalDialog.setAttribute("aria-describedby", descriptionId);
    const closeBtn = pumpNotesModalDialog.querySelector("[data-pump-notes-close]");
    closeBtn?.addEventListener("click", pumpCloseNotesModal);
    pumpNotesModalDialog.querySelectorAll("[data-pump-note-edit]").forEach(btn => {
      btn.addEventListener("click", ()=>{
        const dateISO = btn.getAttribute("data-note-date") || "";
        const rangeValue = btn.getAttribute("data-note-range") || "";
        pumpSetNotesModalState({ view:"edit", dateISO, range: rangeValue });
      });
    });
  }
}

function pumpCloseNotesModal(){
  if (pumpNotesModalNode){
    pumpNotesModalNode.remove();
    pumpNotesModalNode = null;
    pumpNotesModalDialog = null;
  }
  if (pumpNotesEscHandler){
    document.removeEventListener("keydown", pumpNotesEscHandler);
    pumpNotesEscHandler = null;
  }
  pumpNotesModalState = null;
  document.body.classList.remove("pump-notes-open");
}

function pumpOpenNoteEditorForTarget(canvas, target){
  if (!target) return;
  const dateISO = target.dateISO || target.key || "";
  if (!dateISO) return;
  const rangeValue = target.rangeValue || (canvas && canvas.__pumpChartRange) || window.pumpChartRange || "3m";
  const entry = pumpEff.entries.find(e => e && e.dateISO === dateISO) || null;
  const rpm = target.rpm != null ? target.rpm : (entry ? entry.rpm : null);
  const timeISO = target.timeISO || (entry ? pumpGetEntryTimeISO(entry) : "");
  const rangeDisplay = pumpFormatRangeDisplay(rangeValue);
  pumpOpenNotesModal({ view:"edit", dateISO, range: rangeValue, rpm, rangeDisplay, timeISO });
}

function pumpShowChartTooltip(canvas, tooltip, target, { scaleX, scaleY }){
  if (!canvas || !tooltip || !target) return;
  const detailLines = Array.isArray(target.detailLines) ? target.detailLines : [];
  const meta = canvas.__pumpChartTooltipMeta || {};
  const extraLines = [];
  if (meta && meta.usingFiltered === false){
    extraLines.push("Only the most recent log is plotted.");
  }
  const contentLines = detailLines.concat(extraLines);
  const lineMarkup = [`<strong>${pumpEscapeTooltipValue(target.datasetLabel)}</strong>`, `<span class="value">${pumpEscapeTooltipValue(target.valueLabel)}</span>`]
    .concat(contentLines.map(line => `<span>${pumpEscapeTooltipValue(line)}</span>`))
    .join("");
  tooltip.innerHTML = lineMarkup;
  tooltip.hidden = false;
  tooltip.dataset.visible = "";
  tooltip.dataset.placement = "";
  tooltip.style.visibility = "hidden";
  tooltip.style.left = "0px";
  tooltip.style.top = "0px";

  const cssScaleX = scaleX > 0 ? 1 / scaleX : 1;
  const cssScaleY = scaleY > 0 ? 1 / scaleY : 1;
  const centerX = target.rect.x + (target.rect.width / 2);
  const canvasWidth = canvas.clientWidth || canvas.width;
  const canvasHeight = canvas.clientHeight || canvas.height;
  const margin = 18;

  const tipBox = tooltip.getBoundingClientRect();
  const tipWidth = tipBox.width || tooltip.offsetWidth || 0;
  const tipHeight = tipBox.height || tooltip.offsetHeight || 0;

  const halfWidth = tipWidth / 2;
  const minAnchorX = margin + halfWidth;
  const maxAnchorX = canvasWidth - margin - halfWidth;
  const anchorXCss = maxAnchorX < minAnchorX
    ? canvasWidth / 2
    : Math.min(maxAnchorX, Math.max(minAnchorX, centerX * cssScaleX));

  const targetTop = target.rect.y;
  const targetBottom = target.rect.y + target.rect.height;
  let anchorY = targetTop;
  let placement = "above";

  const topIfAbove = (targetTop * cssScaleY) - (tipHeight * 1.05);
  if (topIfAbove < margin){
    placement = "below";
    anchorY = targetBottom;
  }

  let anchorYCss = anchorY * cssScaleY;
  if (placement === "above"){
    const minAnchorY = margin + (tipHeight * 1.05);
    const maxAnchorY = canvasHeight - margin + (tipHeight * 0.1);
    if (maxAnchorY < minAnchorY){
      anchorYCss = (minAnchorY + maxAnchorY) / 2;
    }else{
      anchorYCss = Math.min(maxAnchorY, Math.max(minAnchorY, anchorYCss));
    }
  }else{
    const minAnchorY = margin - (tipHeight * 0.1);
    const maxAnchorY = canvasHeight - margin - (tipHeight * 1.05);
    if (maxAnchorY < minAnchorY){
      anchorYCss = (minAnchorY + maxAnchorY) / 2;
    }else{
      anchorYCss = Math.min(maxAnchorY, Math.max(minAnchorY, anchorYCss));
    }
  }

  tooltip.dataset.placement = placement;
  tooltip.style.left = `${anchorXCss}px`;
  tooltip.style.top = `${anchorYCss}px`;
  tooltip.style.visibility = "";
  tooltip.dataset.visible = "true";
  canvas.style.cursor = "pointer";
  canvas.__pumpChartHoveredKey = target.key || null;
}

function pumpWireChartTooltip(card, canvas){
  if (!canvas){
    return;
  }
  if (typeof canvas.__pumpChartTooltipCleanup === "function"){
    canvas.__pumpChartTooltipCleanup();
  }
  const wrap = card?.querySelector?.(".pump-chart-wrap") || canvas.closest?.(".pump-chart-wrap") || null;
  const tooltip = pumpEnsureTooltip(wrap);
  if (!wrap || !tooltip){
    return;
  }

  const hide = ()=> pumpHideChartTooltip(canvas, tooltip);
  const getTargets = ()=> Array.isArray(canvas.__pumpChartTargets) ? canvas.__pumpChartTargets : [];

  const performInteraction = (clientX, clientY)=>{
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)){
      hide();
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    const clientWidth = canvas.clientWidth || rect.width || canvas.width;
    const clientHeight = canvas.clientHeight || rect.height || canvas.height;
    const scaleX = canvas.width / Math.max(1, clientWidth);
    const scaleY = canvas.height / Math.max(1, clientHeight);
    const pointerX = (clientX - rect.left) * scaleX;
    const pointerY = (clientY - rect.top) * scaleY;
    const targets = getTargets();
    let hovered = null;
    for (const target of targets){
      if (!target) continue;
      const radius = Number.isFinite(target.hitRadius) && target.hitRadius > 0
        ? target.hitRadius
        : (target.rect ? Math.max(target.rect.width, target.rect.height) / 2 : 0);
      const hasCenter = Number.isFinite(target.centerX) && Number.isFinite(target.centerY) && radius > 0;
      if (hasCenter){
        const dx = pointerX - target.centerX;
        const dy = pointerY - target.centerY;
        if ((dx * dx) + (dy * dy) <= radius * radius){
          hovered = target;
          break;
        }
      }
      if (!hovered && target.rect){
        const { x, y, width, height } = target.rect;
        if (pointerX >= x && pointerX <= x + width && pointerY >= y && pointerY <= y + height){
          hovered = target;
          break;
        }
      }
    }
    if (hovered){
      pumpShowChartTooltip(canvas, tooltip, hovered, { scaleX, scaleY });
    }else{
      hide();
    }
    return hovered;
  };

  const supportsPointerEvents = typeof window !== "undefined" && "PointerEvent" in window;

  const handleChartClick = (event)=>{
    if (event && typeof event.button === "number" && event.button !== 0) return;
    const hovered = performInteraction(event.clientX, event.clientY);
    if (hovered){
      pumpOpenNoteEditorForTarget(canvas, hovered);
    }
  };

  if (supportsPointerEvents){
    const pointerState = { touchActive: false };

    const handlePointerMove = (event)=>{
      const type = String(event.pointerType || "").toLowerCase();
      if (type === "touch" && !pointerState.touchActive) return;
      performInteraction(event.clientX, event.clientY);
    };

    const handlePointerDown = (event)=>{
      const type = String(event.pointerType || "").toLowerCase();
      pointerState.touchActive = type === "touch" || type === "pen";
      performInteraction(event.clientX, event.clientY);
    };

    const handlePointerEnter = (event)=>{
      performInteraction(event.clientX, event.clientY);
    };

    const handlePointerUp = (event)=>{
      const type = String(event.pointerType || "").toLowerCase();
      if (type === "touch" || type === "pen"){
        pointerState.touchActive = false;
        const hovered = performInteraction(event.clientX, event.clientY);
        if (hovered){
          pumpOpenNoteEditorForTarget(canvas, hovered);
        }
        hide();
      }else{
        performInteraction(event.clientX, event.clientY);
      }
    };

    const handlePointerCancel = ()=>{
      pointerState.touchActive = false;
      hide();
    };

    const handlePointerLeave = ()=>{
      pointerState.touchActive = false;
      hide();
    };

    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerenter", handlePointerEnter);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerCancel);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("blur", hide);
    canvas.addEventListener("click", handleChartClick);

    canvas.__pumpChartTooltipCleanup = ()=>{
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerenter", handlePointerEnter);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("blur", hide);
      canvas.removeEventListener("click", handleChartClick);
      pointerState.touchActive = false;
      hide();
    };
  }else{
    const handleMouseDown = (event)=>{
      performInteraction(event.clientX, event.clientY);
    };

    const handleMouseMove = (event)=>{
      performInteraction(event.clientX, event.clientY);
    };

    const handleMouseEnter = (event)=>{
      performInteraction(event.clientX, event.clientY);
    };

    const handleMouseUp = (event)=>{
      performInteraction(event.clientX, event.clientY);
    };

    const handleMouseLeave = ()=>{
      hide();
    };

    const resolveTouchPoint = (event)=>{
      if (!event) return null;
      const source = (event.touches && event.touches[0])
        || (event.changedTouches && event.changedTouches[0])
        || null;
      if (!source) return null;
      const { clientX, clientY } = source;
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
      return { clientX, clientY };
    };

    const handleTouchStart = (event)=>{
      const point = resolveTouchPoint(event);
      if (point){
        performInteraction(point.clientX, point.clientY);
      }
    };

    const handleTouchMove = (event)=>{
      const point = resolveTouchPoint(event);
      if (point){
        performInteraction(point.clientX, point.clientY);
      }
    };

    const handleTouchEnd = ()=>{
      hide();
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseenter", handleMouseEnter);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    const passiveOptions = { passive: true };
    canvas.addEventListener("touchstart", handleTouchStart, passiveOptions);
    canvas.addEventListener("touchmove", handleTouchMove, passiveOptions);
    canvas.addEventListener("touchend", handleTouchEnd);
    canvas.addEventListener("touchcancel", handleTouchEnd);
    canvas.addEventListener("blur", hide);
    canvas.addEventListener("click", handleChartClick);

    canvas.__pumpChartTooltipCleanup = ()=>{
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseenter", handleMouseEnter);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("touchstart", handleTouchStart, passiveOptions);
      canvas.removeEventListener("touchmove", handleTouchMove, passiveOptions);
      canvas.removeEventListener("touchend", handleTouchEnd);
      canvas.removeEventListener("touchcancel", handleTouchEnd);
      canvas.removeEventListener("blur", hide);
      canvas.removeEventListener("click", handleChartClick);
      hide();
    };
  }
}

function drawPumpChart(canvas, rangeValue){
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.width / dpr;
  const cssHeight = canvas.height / dpr;
  pumpEnsureEntriesArray();
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  const fontScale = pumpComputeFontScale(cssWidth);
  const scaled = (value)=> Math.max(1, Math.round(value * fontScale));
  const fontPx = (size)=> `${Math.max(1, Math.round(size * fontScale))}px sans-serif`;
  ctx.font = fontPx(12);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  if (!pumpEff.entries.length){
    ctx.fillStyle = "#888";
    ctx.fillText("No pump logs yet.", 14, cssHeight / 2);
    ctx.restore();
    return;
  }
  const range = rangeValue || window.pumpChartRange || "3m";
  pumpEnsureNotesArray();
  const dataAll = pumpEff.entries.slice();
  const rangeLabel = pumpRangeLabel(range);
  const filtered = pumpFilterEntriesByRange(dataAll, range);
  const usingFiltered = filtered.length > 0;
  const desiredCount = Math.min(3, dataAll.length);
  let data = usingFiltered ? filtered.slice() : [dataAll[dataAll.length - 1]];
  if (data.length < desiredCount && desiredCount > 0){
    const fallback = dataAll.slice(-desiredCount);
    const merged = new Map();
    fallback.forEach(entry => merged.set(entry.dateISO, entry));
    data.forEach(entry => merged.set(entry.dateISO, entry));
    data = Array.from(merged.values()).sort((a,b)=>a.dateISO.localeCompare(b.dateISO));
  }
  const dates = data.map(d=>new Date(d.dateISO+"T00:00:00"));
  const rpms  = data.map(d=>d.rpm);
  const minR  = Math.min(...rpms);
  const maxR  = Math.max(...rpms);
  let padY = Math.max(5, (maxR - minR) * 0.04);
  if (!isFinite(padY) || padY <= 0){
    const ref = isFinite(maxR) ? Math.abs(maxR) : 0;
    padY = Math.max(5, ref * 0.04 || 10);
  }
  let yMin = minR - padY;
  let yMax = maxR + padY;
  if (yMax - yMin < 10){
    const adjust = (10 - (yMax - yMin)) / 2;
    yMax += adjust;
    yMin -= adjust;
  }
  const baselineRPM = pumpEff.baselineRPM;
  const baselineArrow = baselineRPM != null ? (baselineRPM > yMax ? "↑" : baselineRPM < yMin ? "↓" : "") : "";
  const latestDate = dates[dates.length - 1];
  const axisEndDate = new Date(latestDate.getTime());
  const earliestDate = dates[0];
  let axisStartDate = pumpRangeCutoff(axisEndDate, range);
  if (earliestDate.getTime() < axisStartDate.getTime()){
    axisStartDate = new Date(earliestDate.getTime());
  }
  let xMin = axisStartDate.getTime();
  let xMax = axisEndDate.getTime();
  if (xMax <= xMin) xMax = xMin + DAY_MS;
  const yTicks = pumpBuildRpmTicks(yMin, yMax);
  const ticks = pumpBuildTimeTicks(range, xMin, xMax);
  const hasSubLabel = ticks.some(t => t.subLabel);
  const summary = pumpSummarizeEntries(data);
  const formatRpm = (value)=>{
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value ?? "—");
    return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };
  const clamp = (value, min, max)=> Math.min(max, Math.max(min, value));
  const headerLatestY = Math.max(scaled(24), 30);
  const headerLineGap = Math.max(scaled(14), 18);
  const contextLabelY = headerLatestY + headerLineGap;
  const contextDetailGap = Math.max(scaled(14), 16);
  const entriesLabelY = contextLabelY + contextDetailGap;
  const statsLines = [];
  const sameExtremeEntry = summary && summary.minEntry && summary.maxEntry
    ? (summary.minEntry.dateISO === summary.maxEntry.dateISO && summary.minEntry.rpm === summary.maxEntry.rpm)
    : false;
  if (summary){
    if (sameExtremeEntry && summary.maxEntry){
      statsLines.push(`High / Low: ${formatRpm(summary.maxEntry.rpm)} RPM on ${pumpFormatShortDate(summary.maxEntry.dateISO)}`);
    }else{
      if (summary.maxEntry){
        statsLines.push(`High: ${formatRpm(summary.maxEntry.rpm)} RPM on ${pumpFormatShortDate(summary.maxEntry.dateISO)}`);
      }
      if (summary.minEntry){
        statsLines.push(`Low: ${formatRpm(summary.minEntry.rpm)} RPM on ${pumpFormatShortDate(summary.minEntry.dateISO)}`);
      }
    }
    if (Number.isFinite(summary.avgRpm)){
      const avgLabel = Math.round(summary.avgRpm).toLocaleString(undefined, { maximumFractionDigits: 0 });
      statsLines.push(`Average: ${avgLabel} RPM across ${summary.count} log${summary.count === 1 ? "" : "s"}`);
    }
  }
  const statsLineGap = Math.max(scaled(12), 14);
  const statsFirstY = statsLines.length ? entriesLabelY + statsLineGap : entriesLabelY;
  const statsBottomY = statsLines.length ? statsFirstY + (statsLines.length - 1) * statsLineGap : entriesLabelY;
  const topBlockBottom = Math.max(entriesLabelY, statsBottomY);
  let maxYTickWidth = 0;
  if (yTicks.length){
    const prevFont = ctx.font;
    ctx.font = fontPx(10.5);
    yTicks.forEach(t => {
      const width = ctx.measureText(t.label).width;
      if (width > maxYTickWidth) maxYTickWidth = width;
    });
    ctx.font = prevFont;
  }
  const margin = {
    top: Math.max(topBlockBottom + Math.max(scaled(24), 28), Math.max(76, scaled(50))),
    right: Math.max(18, scaled(7)),
    bottom: Math.max(hasSubLabel ? 72 : 52, scaled(hasSubLabel ? 26 : 22)),
    left: Math.max(Math.max(52, scaled(18)), maxYTickWidth > 0 ? maxYTickWidth + scaled(18) : 0)
  };
  const axisLabelY = margin.top - Math.max(scaled(12), 14);
  const innerW = Math.max(10, cssWidth - margin.left - margin.right);
  const innerH = Math.max(10, cssHeight - margin.top - margin.bottom);
  const axisY = margin.top + innerH;
  const axisX0 = margin.left;
  const axisX1 = cssWidth - margin.right;
  const span = xMax - xMin;
  const singlePoint = span < 1000;
  const X = t => singlePoint ? (axisX0 + axisX1) / 2 : axisX0 + ((t - xMin) / span) * innerW;
  const ySpan = Math.max(1e-6, (yMax - yMin));
  const Y = v => axisY - ((v - yMin) / ySpan) * innerH;

  ctx.save();
  ctx.fillStyle = "#f9fbff";
  ctx.fillRect(margin.left - scaled(12), margin.top - scaled(8), innerW + scaled(24), innerH + scaled(16));
  ctx.strokeStyle = "#e3e8f3";
  ctx.lineWidth = Math.max(1, scaled(0.6));
  ctx.beginPath();
  ctx.moveTo(axisX0, margin.top);
  ctx.lineTo(axisX0, axisY);
  ctx.lineTo(axisX1, axisY);
  ctx.stroke();
  ctx.strokeStyle = "rgba(98, 125, 179, 0.35)";
  ctx.lineWidth = Math.max(1, scaled(0.8));
  ctx.setLineDash([scaled(3), scaled(5)]);
  ctx.beginPath();
  ctx.moveTo(axisX0, axisY);
  ctx.lineTo(axisX1, axisY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#1f3a60";
  ctx.fillRect(axisX0, axisY, innerW, scaled(1.4));
  ctx.beginPath();
  ctx.moveTo(axisX0, axisY);
  ctx.lineTo(axisX0, Y(yMax));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(axisX1, axisY);
  ctx.lineTo(axisX1, Y(yMax));
  ctx.stroke();
  ctx.restore();

  if (yTicks.length){
    ctx.save();
    ctx.strokeStyle = "rgba(98, 125, 179, 0.22)";
    ctx.lineWidth = Math.max(1, scaled(0.6));
    ctx.setLineDash([scaled(2.5), scaled(5.5)]);
    yTicks.forEach(t => {
      const y = Y(t.value);
      if (y < margin.top - scaled(0.5) || y > axisY + scaled(0.5)) return;
      if (Math.abs(y - axisY) < scaled(0.6)) return;
      ctx.beginPath();
      ctx.moveTo(axisX0, y);
      ctx.lineTo(axisX1, y);
      ctx.stroke();
    });
    ctx.restore();
  }

  ctx.lineWidth = Math.max(1.5, scaled(1.4));
  ctx.strokeStyle = "#0a63c2";
  ctx.fillStyle = "rgba(10,99,194,0.15)";
  const pointRadius = Math.max(3, scaled(2.2));
  ctx.beginPath();
  if (singlePoint){
    ctx.arc(X(xMin), Y(rpms[rpms.length-1]), Math.max(pointRadius, scaled(3.2)), 0, Math.PI * 2);
  }else{
    data.forEach((entry, idx)=>{
      const x = X(new Date(entry.dateISO+"T00:00:00").getTime());
      const y = Y(entry.rpm);
      if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
  }
  ctx.stroke();
  ctx.lineTo(X(xMax), axisY);
  ctx.lineTo(X(xMin), axisY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#0a63c2";
  ctx.strokeStyle = "#0a63c2";
  ctx.lineWidth = Math.max(1, scaled(1.1));
  const hitTargets = [];
  const pointCoords = [];
  const indexByDate = new Map();
  dataAll.forEach((entry, idx)=>{ indexByDate.set(entry.dateISO, idx); });
  const hoverRadius = Math.max(pointRadius * 3.4, scaled(24));

    data.forEach(entry => {
      const noteForEntry = pumpFindNote(entry.dateISO, range);
      const d = new Date(entry.dateISO+"T00:00:00");
    const x = X(d.getTime());
    const y = Y(entry.rpm);
      ctx.beginPath();
      ctx.arc(x, y, pointRadius, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
      if (noteForEntry){
        ctx.save();
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = Math.max(1.4, scaled(1.2));
        ctx.beginPath();
        ctx.arc(x, y, pointRadius + Math.max(1.6, scaled(1.1)), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      pointCoords.push({ entry, x, y });

      const idxAll = indexByDate.get(entry.dateISO);
      const prevEntry = (idxAll != null && idxAll > 0) ? dataAll[idxAll - 1] : null;
      const pct = pumpPercentChange(entry.rpm);
      const timeISO = pumpGetEntryTimeISO(entry);
      const timeLabel = pumpFormatTimeLabel(timeISO);
      const tooltipDate = pumpFormatDateWithTimeLabel(entry.dateISO, timeISO);
      const formattedRPM = Number.isFinite(entry.rpm)
        ? Number(entry.rpm).toLocaleString(undefined, { maximumFractionDigits: 0 })
        : String(entry.rpm ?? "");
      const detailParts = [];
      if (timeLabel){
        detailParts.push(`Logged at ${timeLabel}`);
      }
      if (noteForEntry){
        const trimmedNote = String(noteForEntry.text || "").trim();
        if (trimmedNote){
          const firstLine = trimmedNote.split(/\r?\n/, 1)[0];
          const preview = firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
          detailParts.push(`Note: ${preview}`);
        }else{
          detailParts.push("Note saved for this range.");
        }
      }
      if (pct != null){
        const pctSign = pct >= 0 ? "+" : "";
        detailParts.push(`Δ vs baseline: ${pctSign}${pct.toFixed(1)}% (Baseline ${Number(baselineRPM).toLocaleString(undefined, { maximumFractionDigits: 0 })} RPM)`);
      }else if (baselineRPM == null){
        detailParts.push("Set a baseline to track % change.");
    }
    if (prevEntry && isFinite(prevEntry.rpm)){
      const delta = Number(entry.rpm) - Number(prevEntry.rpm);
      const deltaLabel = delta === 0
        ? "No change from prior log"
        : `${delta > 0 ? "+" : ""}${Math.round(delta).toLocaleString()} RPM vs prior log`;
      detailParts.push(deltaLabel);
    }
    if (summary){
      const rpmValue = Number(entry.rpm);
      const matchesMax = summary.maxEntry && entry.dateISO === summary.maxEntry.dateISO && Number.isFinite(rpmValue) && rpmValue === summary.maxEntry.rpm;
      const matchesMin = summary.minEntry && entry.dateISO === summary.minEntry.dateISO && Number.isFinite(rpmValue) && rpmValue === summary.minEntry.rpm;
      if (matchesMax && matchesMin){
        detailParts.push("Highest and lowest RPM in view.");
      }else if (matchesMax){
        detailParts.push("Highest RPM in view.");
      }else if (matchesMin){
        detailParts.push("Lowest RPM in view.");
      }
    }
    detailParts.push(`Range window: Last ${rangeLabel}`);
    const rect = {
      x: x - (hoverRadius / 2),
      y: y - (hoverRadius / 2),
      width: hoverRadius,
      height: hoverRadius
    };
      hitTargets.push({
        key: entry.dateISO,
        rect,
        centerX: x,
        centerY: y,
        hitRadius: hoverRadius / 2,
        datasetLabel: tooltipDate,
        valueLabel: `${formattedRPM} RPM`,
        detailLines: detailParts,
        dateISO: entry.dateISO,
        rpm: entry.rpm,
        timeISO,
        rangeValue: range,
        rangeLabel: pumpFormatRangeDisplay(range),
        hasNote: !!noteForEntry
      });
    });

  if (yTicks.length){
    ctx.save();
    ctx.strokeStyle = "#1f3a60";
    ctx.lineWidth = Math.max(1, scaled(0.7));
    ctx.beginPath();
    yTicks.forEach(t => {
      const y = Y(t.value);
      if (y < margin.top - scaled(0.5) || y > axisY + scaled(0.5)) return;
      if (Math.abs(y - axisY) < scaled(0.6)) return;
      ctx.moveTo(axisX0 - scaled(6), y);
      ctx.lineTo(axisX0, y);
    });
    ctx.stroke();
    ctx.fillStyle = "#1f3a60";
    ctx.font = fontPx(10.5);
    const prevAlign = ctx.textAlign;
    const prevBaseline = ctx.textBaseline;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    yTicks.forEach(t => {
      const y = Y(t.value);
      if (y < margin.top - scaled(0.5) || y > axisY + scaled(0.5)) return;
      if (Math.abs(y - axisY) < scaled(0.6)) return;
      ctx.fillText(t.label, axisX0 - scaled(8), y);
    });
    ctx.textAlign = prevAlign;
    ctx.textBaseline = prevBaseline;
    ctx.restore();
  }

  ctx.strokeStyle = "rgba(12, 56, 112, 0.35)";
  ctx.lineWidth = Math.max(1, scaled(0.8));
  ctx.setLineDash([scaled(2), scaled(4)]);
  ctx.beginPath();
  ctx.moveTo(axisX0, Y(yMax));
  ctx.lineTo(axisX1, Y(yMax));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(axisX0, Y(yMin));
  ctx.lineTo(axisX1, Y(yMin));
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "#d73354";
  ctx.lineWidth = Math.max(1, scaled(1));
  ctx.beginPath();
  ctx.moveTo(axisX0, Y(minR));
  ctx.lineTo(axisX1, Y(minR));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(axisX0, Y(maxR));
  ctx.lineTo(axisX1, Y(maxR));
  ctx.stroke();

  if (baselineRPM != null){
    const baselineY = Y(baselineRPM);
    ctx.strokeStyle = "#6d7a99";
    ctx.lineWidth = Math.max(1, scaled(1));
    ctx.setLineDash([scaled(6), scaled(6)]);
    ctx.beginPath();
    ctx.moveTo(axisX0, baselineY);
    ctx.lineTo(axisX1, baselineY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#34415d";
    const arrow = baselineArrow ? ` ${baselineArrow}` : "";
    ctx.font = fontPx(11);
    const labelOffset = baselineY <= margin.top + scaled(6) ? scaled(6) : -scaled(4);
    ctx.fillText(`Baseline ${baselineRPM} RPM${arrow}`, axisX0 + scaled(2), baselineY + labelOffset);
  }

  if (summary && pointCoords.length){
    const calloutTargets = [];
    if (summary.maxEntry){
      calloutTargets.push({
        dateISO: summary.maxEntry.dateISO,
        rpm: summary.maxEntry.rpm,
        label: sameExtremeEntry ? "High & Low" : "High",
        palette: "high"
      });
    }
    if (summary.minEntry && !sameExtremeEntry){
      calloutTargets.push({
        dateISO: summary.minEntry.dateISO,
        rpm: summary.minEntry.rpm,
        label: "Low",
        palette: "low"
      });
    }
    if (calloutTargets.length){
      const accentColors = {
        high: { stroke: "#e45a72", fill: "#f27d8f" },
        low: { stroke: "#2f9c6b", fill: "#46c58a" },
        both: { stroke: "#3b82f6", fill: "#60a5fa" }
      };
      const minCalloutX = margin.left + scaled(6);
      const maxCalloutX = cssWidth - margin.right - scaled(6);
      const minCalloutY = margin.top + scaled(6);
      const maxCalloutY = axisY - scaled(8);
      ctx.save();
      const prevBaseline = ctx.textBaseline;
      const prevAlign = ctx.textAlign;
      const labelFont = fontPx(10.2);
      const detailFont = fontPx(9.2);
      const labelLineHeight = Math.max(scaled(12), 13);
      const detailLineHeight = Math.max(scaled(11), 12);
      const calloutPadX = Math.max(scaled(6), 7);
      const calloutPadY = Math.max(scaled(5), 6);
      const pointerGap = Math.max(scaled(8), 10);
      const borderRadius = Math.max(scaled(5), 6.5);
      const accentRadius = Math.max(scaled(3), 3.8);
      const accentGap = Math.max(scaled(4.5), 5.5);
      ctx.textBaseline = "top";
      ctx.textAlign = "left";

      calloutTargets.forEach(target => {
        const point = pointCoords.find(p => p.entry.dateISO === target.dateISO);
        if (!point) return;
        const paletteKey = accentColors[target.palette] ? target.palette : "both";
        const palette = accentColors[paletteKey];
        const accentStroke = palette.stroke;
        const accentFill = palette.fill;
        const labelLine = `${target.label}: ${formatRpm(target.rpm)} RPM`;
        const detailLine = pumpFormatShortDate(target.dateISO);

        ctx.font = labelFont;
        const labelWidth = ctx.measureText(labelLine).width;
        ctx.font = detailFont;
        const detailWidth = ctx.measureText(detailLine).width;
        const contentWidth = Math.max(labelWidth, detailWidth) + (accentRadius * 2) + accentGap;
        const bubbleWidth = contentWidth + calloutPadX * 2;
        const bubbleHeight = calloutPadY * 2 + labelLineHeight + detailLineHeight;
        if (!(bubbleWidth > 0 && bubbleHeight > 0)) return;

        const anchorX = point.x;
        const anchorY = point.y;
        let labelX = anchorX + pointerGap;
        if (anchorX > (margin.left + innerW / 2)){
          labelX = anchorX - pointerGap - bubbleWidth;
        }
        const maxX = maxCalloutX - bubbleWidth;
        labelX = clamp(labelX, minCalloutX, Math.max(minCalloutX, maxX));
        let labelY = anchorY - (bubbleHeight / 2);
        const maxY = maxCalloutY - bubbleHeight;
        labelY = clamp(labelY, minCalloutY, Math.max(minCalloutY, maxY));
        const pointerTargetX = clamp(anchorX, labelX, labelX + bubbleWidth);
        const pointerTargetY = clamp(anchorY, labelY, labelY + bubbleHeight);

        ctx.save();
        ctx.strokeStyle = `${accentStroke}dd`;
        ctx.lineWidth = Math.max(1, scaled(0.7));
        ctx.beginPath();
        ctx.moveTo(anchorX, anchorY);
        ctx.lineTo(pointerTargetX, pointerTargetY);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.shadowColor = "rgba(15, 23, 42, 0.45)";
        ctx.shadowBlur = Math.max(scaled(4), 6);
        ctx.beginPath();
        pumpRoundedRectPath(ctx, labelX, labelY, bubbleWidth, bubbleHeight, borderRadius);
        ctx.fillStyle = "rgba(10, 17, 32, 0.94)";
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        pumpRoundedRectPath(ctx, labelX, labelY, bubbleWidth, bubbleHeight, borderRadius);
        ctx.lineWidth = Math.max(1, scaled(0.6));
        ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
        ctx.stroke();

        const textBaseX = labelX + calloutPadX + (accentRadius * 2) + accentGap;
        const labelTextY = labelY + calloutPadY;
        const detailTextY = labelTextY + labelLineHeight;

        ctx.beginPath();
        ctx.fillStyle = accentFill;
        ctx.arc(labelX + calloutPadX + accentRadius, labelTextY + (labelLineHeight / 2), accentRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = labelFont;
        ctx.fillStyle = accentStroke;
        ctx.fillText(labelLine, textBaseX, labelTextY);
        ctx.font = detailFont;
        ctx.fillStyle = "#d8e2ff";
        ctx.fillText(detailLine, textBaseX, detailTextY);
      });

      ctx.textBaseline = prevBaseline;
      ctx.textAlign = prevAlign;
      ctx.restore();
    }
  }

  ctx.fillStyle = "#1f3a60";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = fontPx(12);
  ctx.fillText(`RPM`, axisX0, axisLabelY);
  ctx.font = fontPx(11);
  ctx.fillText(`${range.toUpperCase()} trend`, axisX1 - scaled(96), axisLabelY);

  ctx.strokeStyle = "#1f3a60";
  ctx.lineWidth = Math.max(1, scaled(1));
  ctx.beginPath();
  ticks.forEach(t => {
    const x = X(t.time);
    ctx.moveTo(x, axisY);
    ctx.lineTo(x, axisY + scaled(6));
  });
  ctx.stroke();

  ctx.fillStyle = "#1f3a60";
  ctx.font = fontPx(10.5);
  const baseY = axisY + scaled(10);
  ticks.forEach((t, idx) => {
    const x = X(t.time);
    ctx.textAlign = idx === ticks.length - 1 ? "right" : idx === 0 ? "left" : "center";
    ctx.fillText(t.label, x, baseY);
    if (t.subLabel){
      ctx.font = fontPx(9.2);
      ctx.fillStyle = "#4b5b7a";
      ctx.fillText(t.subLabel, x, baseY + scaled(13));
      ctx.fillStyle = "#1f3a60";
      ctx.font = fontPx(10.5);
    }
  });
  ctx.textAlign = "left";

  const latest = data[data.length - 1];
  const pct = pumpPercentChange(latest?.rpm);
  const deltaClass = pumpColorFor(pct).cls;
  const deltaColor = PUMP_DELTA_CLASS_COLORS[deltaClass] || "#1f3a60";
  const latestTimeISO = latest ? pumpGetEntryTimeISO(latest) : "";
  const latestLabel = latest ? pumpFormatDateWithTimeLabel(latest.dateISO, latestTimeISO) : "";
  const headerPrefix = `Latest: ${latest.rpm} RPM (${latestLabel || latest?.dateISO || ""})  Δ%=`;
  const deltaValue = pct != null ? `${pct.toFixed(1)}%` : "—";
  const headerX = axisX0 + scaled(2);
  ctx.font = fontPx(11.5);
  ctx.fillStyle = "#1f3a60";
  ctx.fillText(headerPrefix, headerX, headerLatestY);
  ctx.fillStyle = deltaColor;
  ctx.fillText(deltaValue, headerX + ctx.measureText(headerPrefix).width, headerLatestY);
  ctx.fillStyle = "#1f3a60";
  ctx.font = fontPx(10.2);
  ctx.fillStyle = "#4b5b7a";
  ctx.fillText(`Range: Last ${rangeLabel}`, axisX0, contextLabelY);
  ctx.fillStyle = usingFiltered ? "#4b5b7a" : "#b04545";
  const entriesMessage = usingFiltered
    ? `${data.length} log${data.length === 1 ? "" : "s"} plotted`
    : "Latest log shown (no entries in selected window)";
  ctx.fillText(entriesMessage, axisX0, entriesLabelY);
  if (statsLines.length){
    ctx.fillStyle = "#4b5b7a";
    statsLines.forEach((line, idx) => {
      const y = statsFirstY + idx * statsLineGap;
      ctx.fillText(line, axisX0, y);
    });
  }
  if (!usingFiltered){
    ctx.fillStyle = "#b04545";
    ctx.font = fontPx(10.8);
    const infoY = axisY + scaled(hasSubLabel ? 32 : 20);
    ctx.fillText("No logs in selected range. Showing latest entry.", axisX0 + scaled(2), infoY);
  }
  ctx.restore();

  canvas.__pumpChartTargets = hitTargets;
  canvas.__pumpChartRange = range;
  canvas.__pumpChartRangeLabel = pumpFormatRangeDisplay(range);
  canvas.__pumpChartTooltipMeta = {
    rangeLabel,
    usingFiltered,
    baselineRPM,
    summary
  };
  const wrap = canvas.closest?.(".pump-chart-wrap") || null;
  const tooltip = wrap ? wrap.querySelector(".pump-chart-tooltip") : null;
  if (tooltip && tooltip.dataset.visible === "true"){
    pumpHideChartTooltip(canvas, tooltip);
  }
}
